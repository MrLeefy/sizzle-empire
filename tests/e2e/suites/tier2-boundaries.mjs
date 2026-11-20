import { sleep } from '../lib/cdpClient.mjs';
import { PORTRAIT_VIEWPORTS, PRIMARY_VIEWPORT, THRESHOLDS } from '../lib/config.mjs';
import { waitFor } from '../lib/runner.mjs';
import {
  activateBoost,
  activateHelper,
  bootTargetSession,
  clickSheetButton,
  closeActiveSheet,
  closeStationPopover,
  openBottomTab,
  openStation0Popover,
  readAudioStatus,
  readHudCash,
  readStationPopoverInfo,
  settleFiniteEntranceAnimations,
  waitAnimationFrames,
  waitForTargetBoot,
} from '../lib/targetHelpers.mjs';

export async function runTier2(runner, { targets, staticUrl }) {
  for (const target of targets) {
    // =========================================================================
    // T2.1: Portrait Mobile Viewports (360x640, 390x844, 430x932) & Non-Overlap
    // =========================================================================
    await runner.runTest(
      { id: `T2.1-${target}`, tier: 2, target, name: 'Portrait mobile viewports (360/390/430), button heights & banner non-overlap' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl, viewport: PRIMARY_VIEWPORT });
        try {
          const failures = [];

          for (const vp of PORTRAIT_VIEWPORTS) {
            await session.setViewport(vp);
            await sleep(250);

            const layout = await session.evaluate(`(() => {
              const innerW = window.innerWidth;
              const innerH = window.innerHeight;
              const scrollW = document.documentElement.scrollWidth;
              const hud = document.querySelector('.top-hud');
              const nav = document.querySelector('.bottom-nav, nav.bottom-nav');
              const hudR = hud ? hud.getBoundingClientRect() : null;
              const navR = nav ? nav.getBoundingClientRect() : null;
              const navBtns = [...document.querySelectorAll('nav.bottom-nav button, .bottom-nav button, .bottom-nav .nav-tab')].map((b) => {
                const r = b.getBoundingClientRect();
                return {
                  text: (b.textContent || '').trim().slice(0, 20),
                  w: r.width,
                  h: r.height,
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                };
              });
              return { innerW, innerH, scrollW, hudR, navR, navBtns };
            })()`);

            if (layout.scrollW > layout.innerW + 1) {
              failures.push(`${vp.name}: horizontal overflow scrollWidth=${layout.scrollW} > innerWidth=${layout.innerW}`);
            }
            if (!layout.hudR || !layout.navR) {
              failures.push(`${vp.name}: missing .top-hud or .bottom-nav`);
            } else {
              if (layout.hudR.top < -1 || layout.hudR.left < -1 || layout.hudR.right > layout.innerW + 1) {
                failures.push(`${vp.name}: .top-hud out of bounds (${JSON.stringify(layout.hudR)})`);
              }
              if (layout.navR.bottom > layout.innerH + 1 || layout.navR.left < -1 || layout.navR.right > layout.innerW + 1) {
                failures.push(`${vp.name}: .bottom-nav out of bounds (${JSON.stringify(layout.navR)})`);
              }
              if (layout.hudR.bottom >= layout.navR.top) {
                failures.push(`${vp.name}: .top-hud bottom (${layout.hudR.bottom.toFixed(1)}) overlaps .bottom-nav top (${layout.navR.top.toFixed(1)})`);
              }
            }

            const expectedNavCount = target === 'main' ? 7 : 6;
            if (layout.navBtns.length < expectedNavCount) {
              failures.push(`${vp.name}: expected >= ${expectedNavCount} nav buttons, found ${layout.navBtns.length}`);
            }

            const clippedBtns = layout.navBtns.filter(
              (b) => b.left < -1 || b.right > layout.innerW + 1 || b.top < -1 || b.bottom > layout.innerH + 1,
            );
            if (clippedBtns.length > 0) {
              failures.push(
                `${vp.name}: nav button(s) clipped outside viewport (${layout.innerW}x${layout.innerH}): ${clippedBtns
                  .map((b) => `${b.text}[x:${b.left.toFixed(1)}..${b.right.toFixed(1)},y:${b.top.toFixed(1)}..${b.bottom.toFixed(1)}]`)
                  .join(', ')}`,
              );
            }

            const shortBtns = layout.navBtns.filter((b) => b.h < THRESHOLDS.primaryButtonMinHeightPx);
            if (shortBtns.length > 0) {
              failures.push(
                `${vp.name}: nav button(s) height < ${THRESHOLDS.primaryButtonMinHeightPx}px: ${shortBtns.map((b) => `${b.text}=${b.h.toFixed(1)}px`).join(', ')}`,
              );
            }
          }

          // Primary upgrade button height at 390x844
          await session.setViewport(PRIMARY_VIEWPORT);
          await waitAnimationFrames(session, 2);
          await openStation0Popover(session, target);
          const popInfo = await readStationPopoverInfo(session, target);
          if (!popInfo?.buyRect || popInfo.buyRect.height < THRESHOLDS.primaryButtonMinHeightPx) {
            failures.push(
              `390x844: primary upgrade button height=${popInfo?.buyRect?.height?.toFixed(1) ?? 'missing'}px < ${THRESHOLDS.primaryButtonMinHeightPx}px`,
            );
          }
          await closeStationPopover(session, target);

          // Enter Crystal Cavern event to check event banner vs .skills-rail non-overlap
          await openBottomTab(session, target, 'Events');
          await sleep(160);
          const enterPattern = target === 'main' ? 'Enter Event' : '^Enter$';
          const entered = await clickSheetButton(session, target, enterPattern);
          ctx.assert(Boolean(entered), `Could not click Event enter button on ${target}`);
          await sleep(350);

          const overlap = await session.evaluate(`(() => {
            const target = ${JSON.stringify(target)};
            const banner = target === 'main'
              ? document.querySelector('.top-hud .mode-return-banner')
              : document.getElementById('event-banner');
            const skills = document.querySelector('.skills-rail');
            if (!banner || !skills) return { found: false, hasBanner: Boolean(banner), hasSkills: Boolean(skills) };
            const br = banner.getBoundingClientRect();
            const sr = skills.getBoundingClientRect();
            const hidden = banner.classList.contains('hidden') || br.height <= 0;
            return {
              found: !hidden && sr.height > 0,
              bannerBottom: Math.round(br.bottom * 10) / 10,
              skillsTop: Math.round(sr.top * 10) / 10,
              overlapPx: Math.round((br.bottom - sr.top) * 10) / 10,
            };
          })()`);

          if (!overlap.found) {
            failures.push(`Event banner or .skills-rail not visible in event view (${JSON.stringify(overlap)})`);
          } else if (overlap.bannerBottom > overlap.skillsTop + 0.5) {
            failures.push(
              `Event banner overlaps .skills-rail by ${overlap.overlapPx}px (banner.bottom=${overlap.bannerBottom} > skills.top=${overlap.skillsTop})`,
            );
          }

          // Return cleanly to Main City
          const returnSel = target === 'main' ? '.mode-return-banner button' : '#btn-exit-event';
          await session.clickElement(returnSel, 35);
          await sleep(250);

          const errReport = session.getErrorReport();
          if (!errReport.ok) failures.push(`runtime errors: ${errReport.summary}`);

          ctx.assert(failures.length === 0, failures.join('; '));
          ctx.detail(`360/390/430 zero overflow, primary buttons >= ${THRESHOLDS.primaryButtonMinHeightPx}px, banner/skills gap=${(overlap.skillsTop - overlap.bannerBottom).toFixed(1)}px`);
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T2.2: Unaffordable Upgrade Rejection, Buy Modes & 700ms Hold-to-Upgrade
    // =========================================================================
    await runner.runTest(
      { id: `T2.2-${target}`, tier: 2, target, name: 'Unaffordable upgrade rejection, buy mode cycling & 700ms hold-to-upgrade' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          // 1. Fresh boot ($0 cash): open Station 0 popover and try clicking disabled upgrade
          await openStation0Popover(session, target);
          const before = await readStationPopoverInfo(session, target);
          ctx.assert(before && before.level === 1, `Expected initial level 1, got ${JSON.stringify(before)}`);
          ctx.assert(before.buyDisabled === true, `Expected upgrade button disabled at $0 cash (text=${before.buyText})`);

          await session.clickAt(before.buyRect.x, before.buyRect.y, 40);
          await sleep(160);

          const afterDisabledTap = await readStationPopoverInfo(session, target);
          const cashAfterDisabledTap = await readHudCash(session, target);
          ctx.assertEqual(afterDisabledTap.level, 1, 'Station level unchanged after clicking disabled upgrade');
          ctx.assertGte(cashAfterDisabledTap.value, 0, 'Cash non-negative after disabled upgrade tap');

          // 2. Cycle all buy mode buttons (x1, x10, x50/x100, MAX, back to x1)
          const modeSel = target === 'main' ? '.station-popover .buy-mode-btn' : '#pop-modes .mode-btn';
          const modes = await session.evaluate(`(() => {
            return [...document.querySelectorAll(${JSON.stringify(modeSel)})].map((b, i) => {
              const r = b.getBoundingClientRect();
              return { idx: i, text: (b.textContent || '').trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 };
            });
          })()`);
          ctx.assertGte(modes.length, 4, 'Station buy mode buttons count');

          for (const m of [...modes.slice(1), modes[0]]) {
            await session.clickAt(m.x, m.y, 30);
            await sleep(80);
            const activeText = await session.evaluate(`(() => {
              const a = document.querySelector(${JSON.stringify(modeSel + '.active')});
              return a ? (a.textContent || '').trim() : null;
            })()`);
            ctx.assertEqual(activeText, m.text, `Buy mode button "${m.text}" became active`);
          }
          await closeStationPopover(session, target);

          // 3. Organically earn enough cash for >= 2 levels ($12 main / $10 standalone) with Boost + Helper
          await activateBoost(session, target);
          await activateHelper(session, target);

          const targetCash = target === 'main' ? 12 : 10;
          const earned = await waitFor(
            async () => {
              const c = await readHudCash(session, target);
              return c.value >= targetCash ? c : false;
            },
            {
              timeoutMs:
                target === 'main'
                  ? THRESHOLDS.organicCashUpgradeTimeoutMsMain
                  : THRESHOLDS.organicCashUpgradeTimeoutMsStandalone,
              intervalMs: 250,
              label: `${target} organic cash >= $${targetCash} for multi-level hold-to-upgrade`,
            },
          );

          // 4. Open Station 0 popover and perform real 700ms CDP pointer hold on upgrade button
          await openStation0Popover(session, target);
          const preHold = await readStationPopoverInfo(session, target);
          ctx.assert(preHold && !preHold.buyDisabled, `Expected upgrade enabled at ${earned.text}`);

          await session.holdAt(preHold.buyRect.x, preHold.buyRect.y, 700);
          await sleep(200);

          const postHold = await readStationPopoverInfo(session, target);
          const postCash = await readHudCash(session, target);
          ctx.assertGte(postHold.level, preHold.level + 2, `700ms hold-to-upgrade bought multi-step levels (start Lv ${preHold.level})`);
          ctx.assertGte(postCash.value, 0, 'Cash remained non-negative after hold-to-upgrade');

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during upgrade boundary test: ${errReport.summary}`);
          ctx.detail(`disabled buy rejected OK, cycled ${modes.length} buy modes, 700ms hold Lv ${preHold.level}->${postHold.level} (cash ${earned.text}->${postCash.text})`);
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T2.3: Rapid Sheet Open/Close Churn & Settings Toggles
    // =========================================================================
    await runner.runTest(
      { id: `T2.3-${target}`, tier: 2, target, name: 'Rapid sheet open/close churn & settings toggles' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          const tabs =
            target === 'main'
              ? ['Upgrades', 'Gear', 'Pets', 'Vault', 'Events', 'Ranks', 'Club']
              : ['Upgrades', 'Gear', 'Pets', 'Vault', 'Events', 'Ranks'];

          for (const tab of tabs) {
            await openBottomTab(session, target, tab);
            await sleep(100);
            // Toggle sub-tabs if available
            const subTabCount = await session.evaluate(`(() => {
              const sel = ${JSON.stringify(target)} === 'main' ? '.sheet-tabs button.sheet-tab' : '#sheet-tabs button.stab';
              return document.querySelectorAll(sel).length;
            })()`);
            if (subTabCount > 1) {
              const secondSub = await session.evaluate(`(() => {
                const sel = ${JSON.stringify(target)} === 'main' ? '.sheet-tabs button.sheet-tab' : '#sheet-tabs button.stab';
                const btn = document.querySelectorAll(sel)[1];
                if (!btn) return null;
                const r = btn.getBoundingClientRect();
                return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
              })()`);
              if (secondSub) {
                await session.clickAt(secondSub.x, secondSub.y, 25);
                await sleep(80);
              }
            }
            await closeActiveSheet(session, target);
          }

          const settingsIssues = [];

          if (target === 'main') {
            await session.clickElement('.top-hud button[aria-label="Settings"]', 35);
            await settleFiniteEntranceAnimations(session, '.modal-card', {
              mountTimeoutMs: 3000,
              naturalWaitMs: 700,
              settleTimeoutMs: 2500,
              label: 'Settings modal settled',
            });

            // Toggle FPS (60 -> 30 -> 60)
            const fps1 = await clickSheetButton(session, 'main', 'FPS');
            ctx.assert(Boolean(fps1), 'FPS toggle button missing in Settings');
            await clickSheetButton(session, 'main', 'FPS');

            // Cycle Graphics Quality (HIGH -> MEDIUM -> LOW -> HIGH)
            const q1 = await clickSheetButton(session, 'main', 'HIGH|MEDIUM|LOW');
            ctx.assert(Boolean(q1), 'Graphics Quality toggle button missing in Settings');
            await clickSheetButton(session, 'main', 'HIGH|MEDIUM|LOW');
            await clickSheetButton(session, 'main', 'HIGH|MEDIUM|LOW');

            // Toggle SFX / Sound mute/unmute
            const sfx1 = await clickSheetButton(session, 'main', 'SFX|Sound');
            ctx.assert(Boolean(sfx1), 'SFX/Sound toggle button missing in Settings');
            await clickSheetButton(session, 'main', 'SFX|Sound');

            // Verify post-M3 ambient & volume controls (resilient to row label + On/Off button or checkbox)
            const audioControls = await session.evaluate(`(() => {
              const modal = document.querySelector('.modal-card');
              if (!modal) return { sliders: 0, hasAmbientToggle: false };
              const sliders = modal.querySelectorAll('input[type="range"]').length;
              const interactive = [...modal.querySelectorAll('button, input[type="checkbox"]')];
              const hasAmbientToggle = interactive.some((ctrl) => {
                const ownText =
                  (ctrl.textContent || '') +
                  ' ' +
                  (ctrl.getAttribute('aria-label') || '') +
                  ' ' +
                  (ctrl.getAttribute('title') || '');
                if (/ambient|music|bistro/i.test(ownText)) return true;
                const row = ctrl.closest(
                  '.item-card, .item-card-col, .setting-row, .settings-row, label, [class*="row" i], [class*="card" i]',
                );
                if (row && row !== modal && !row.classList.contains('modal-card') && /ambient|music|bistro/i.test(row.textContent || '')) {
                  return true;
                }
                return false;
              });
              return { sliders, hasAmbientToggle };
            })()`);

            if (!audioControls.hasAmbientToggle) {
              settingsIssues.push('SettingsModal missing Ambient/Music toggle (pending M3 UI-06)');
            }
            if (audioControls.sliders < 1) {
              settingsIssues.push('SettingsModal missing audio volume slider input[type="range"] (pending M3 UI-06)');
            }

            await closeActiveSheet(session, 'main');
          } else {
            // Toggle #btn-sound if present
            const hasSoundBtn = await session.evaluate(`(() => {
              const b = document.getElementById('btn-sound');
              if (!b) return null;
              const r = b.getBoundingClientRect();
              return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
            })()`);
            if (hasSoundBtn) {
              await session.clickAt(hasSoundBtn.x, hasSoundBtn.y, 30);
              await sleep(80);
              await session.clickAt(hasSoundBtn.x, hasSoundBtn.y, 30);
              await sleep(80);
            }

            // Check post-M5 Settings popover (SA-UI-02)
            const settingsTrigger = await session.evaluate(`(() => {
              const btn = document.getElementById('btn-settings') ||
                document.querySelector('.top-hud button[aria-label*="setting" i], .top-hud button[title*="setting" i]');
              if (!btn) return null;
              const r = btn.getBoundingClientRect();
              return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
            })()`);

            if (!settingsTrigger) {
              settingsIssues.push('Standalone Settings popover button missing in .top-hud (pending M5 SA-UI-02)');
            } else {
              await session.clickAt(settingsTrigger.x, settingsTrigger.y, 35);
              await settleFiniteEntranceAnimations(session, '#settings-pop, #settings-popover, #settings-modal', {
                mountTimeoutMs: 500,
                naturalWaitMs: 350,
                settleTimeoutMs: 600,
                throwIfMissing: false,
                label: 'Standalone Settings popover settled',
              });
              await sleep(120);
              const popCheck = await session.evaluate(`(() => {
                const triggerBtn =
                  document.getElementById('btn-settings') ||
                  document.querySelector('.top-hud button[aria-label*="setting" i], .top-hud button[title*="setting" i]');
                const candidates = [
                  ...document.querySelectorAll(
                    '#settings-pop, #settings-popover, #settings-modal, [id*="setting" i], [class*="settings-pop" i], [class*="settings-modal" i], [class*="settings-panel" i]',
                  ),
                ].filter((el) => {
                  if (!el || el === triggerBtn) return false;
                  const tag = (el.tagName || '').toUpperCase();
                  if (tag === 'BUTTON' || tag === 'SVG' || el.closest('svg')) return false;
                  if (el.closest('.top-hud button')) return false;
                  if (triggerBtn && el.contains(triggerBtn)) return false;
                  if (el.classList.contains('hidden')) return false;
                  const cs = getComputedStyle(el);
                  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
                  const r = el.getBoundingClientRect();
                  return r.width > 80 && r.height > 60;
                });
                const exactPop = candidates.find((el) =>
                  el.matches('#settings-pop, #settings-popover, #settings-modal'),
                );
                const textPop = candidates.find((el) =>
                  /sound|sfx|ambient|fx/i.test(el.textContent || ''),
                );
                const pop = exactPop || textPop || candidates[candidates.length - 1] || null;
                if (!pop) return { visible: false };
                const text = (pop.textContent || '').trim();
                return {
                  visible: true,
                  id: pop.id || null,
                  hasSound: /sound|sfx/i.test(text),
                  hasAmbient: /ambient|music|bistro/i.test(text),
                  hasFx: /fx|particle|vfx/i.test(text),
                };
              })()`);
              if (!popCheck.visible) {
                settingsIssues.push('Standalone Settings popover did not open on click');
              } else if (!popCheck.hasSound || !popCheck.hasAmbient) {
                settingsIssues.push(`Standalone Settings popover missing expected toggles (${JSON.stringify(popCheck)})`);
              }
              // Close settings popover by clicking trigger again or close btn
              await session.clickAt(settingsTrigger.x, settingsTrigger.y, 30);
            }
          }

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during sheet churn & settings toggles: ${errReport.summary}`);
          ctx.assert(settingsIssues.length === 0, settingsIssues.join('; '));
          ctx.detail(`cycled all ${tabs.length} tabs + settings toggles cleanly, 0 errors`);
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T2.4: Empty & Corrupt Storage Resilience
    // =========================================================================
    await runner.runTest(
      { id: `T2.4-${target}`, tier: 2, target, name: 'Empty & corrupt storage resilience across reload' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          if (target === 'main') {
            // 1. Test atomic backup self-healing: flush valid save twice so save_backup is valid, then corrupt ONLY save_primary
            await session.evaluate(
              `(async () => {
                window.__sizzle.updateSettings({ notation: 'scientific' });
                await window.__sizzle.persistNow();
                await window.__sizzle.persistNow();
                const db = await new Promise((resolve, reject) => {
                  const req = indexedDB.open('sizzle_empire_db', 1);
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => reject(req.error);
                });
                await new Promise((resolve, reject) => {
                  const tx = db.transaction('saves', 'readwrite');
                  tx.objectStore('saves').put({ schemaVersion: 2, checksum: 'corrupt_e2e_primary', data: { broken: true } }, 'save_primary');
                  tx.oncomplete = () => resolve();
                  tx.onerror = () => reject(tx.error);
                });
                db.close();
              })()`,
              { awaitPromise: true },
            );

            await session.reloadAndWait(false, THRESHOLDS.bootTimeoutMs);
            await waitForTargetBoot(session, 'main');
            const recoveredNotation = await session.evaluate(`window.__sizzle.save.settings.notation`);
            ctx.assertEqual(recoveredNotation, 'scientific', 'Backup self-heal restored notation from save_backup');

            // 2. Test double-corrupt (both save_primary & save_backup corrupt) -> clean fresh recovery
            await session.evaluate(
              `(async () => {
                const db = await new Promise((resolve, reject) => {
                  const req = indexedDB.open('sizzle_empire_db', 1);
                  req.onsuccess = () => resolve(req.result);
                  req.onerror = () => reject(req.error);
                });
                await new Promise((resolve, reject) => {
                  const tx = db.transaction('saves', 'readwrite');
                  const store = tx.objectStore('saves');
                  store.put({ schemaVersion: 2, checksum: 'corrupt_1', data: { broken: true } }, 'save_primary');
                  store.put({ schemaVersion: 2, checksum: 'corrupt_2', data: { broken: true } }, 'save_backup');
                  tx.oncomplete = () => resolve();
                  tx.onerror = () => reject(tx.error);
                });
                db.close();
              })()`,
              { awaitPromise: true },
            );

            await session.reloadAndWait(false, THRESHOLDS.bootTimeoutMs);
            await waitForTargetBoot(session, 'main');
            const fresh = await session.evaluate(`({
              city: window.__sizzle.save.cityNumber,
              gems: window.__sizzle.save.gems,
              stations: window.__sizzle.getActiveRuntime().stations.length,
              cash: Number(window.__sizzle.getActiveRuntime().cash),
            })`);
            ctx.assertEqual(fresh.city, 1, 'Recovered cityNumber after double-corrupt IDB');
            ctx.assertGte(fresh.stations, 1, 'Recovered stations count');
            ctx.assertGte(fresh.cash, 0, 'Recovered cash non-negative');

            const errReport = session.getErrorReport();
            ctx.assert(errReport.ok, `Errors during corrupt IDB recovery: ${errReport.summary}`);
            ctx.detail(`primary->backup self-heal OK + double-corrupt IDB clean reset OK, 0 errors`);
          } else {
            const payloads = [
              { label: 'malformed JSON', value: '{{{NOT_VALID_JSON' },
              { label: 'schema-mismatched JSON', value: '{"corrupt":true}' },
              { label: 'empty storage', value: null },
            ];

            for (const p of payloads) {
              await session.evaluate(`(() => {
                const val = ${JSON.stringify(p.value)};
                if (val === null) localStorage.removeItem('sizzle_empire_artifact_v1');
                else localStorage.setItem('sizzle_empire_artifact_v1', val);
              })()`);
              await session.reloadAndWait(false, THRESHOLDS.bootTimeoutMs);
              await waitForTargetBoot(session, 'standalone');

              const stateCheck = await session.evaluate(`({
                cityText: (document.getElementById('hud-city')?.textContent || '').trim(),
                gemsText: (document.getElementById('hud-gems')?.textContent || '').trim(),
                cashText: (document.getElementById('hud-cash')?.textContent || '').trim(),
              })`);
              ctx.assert(/City\s*1/i.test(stateCheck.cityText), `${p.label}: expected City 1, got "${stateCheck.cityText}"`);
              ctx.assert(stateCheck.gemsText.length > 0 && stateCheck.cashText.startsWith('$'), `${p.label}: HUD invalid (${JSON.stringify(stateCheck)})`);
            }

            const errReport = session.getErrorReport();
            ctx.assert(errReport.ok, `Errors during standalone corrupt localStorage recovery: ${errReport.summary}`);
            ctx.detail('malformed JSON, schema-mismatch JSON & empty localStorage all recovered cleanly, 0 errors');
          }
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T2.5: GPU translate3d Overlay & Resource Pool Bounds
    // =========================================================================
    await runner.runTest(
      { id: `T2.5-${target}`, tier: 2, target, name: 'GPU translate3d overlays & resource/particle pool bounds' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          if (target === 'main') {
            await waitFor(
              async () => session.evaluate(`document.querySelectorAll('.world-overlay-layer > *').length >= 1`),
              { timeoutMs: 5000, intervalMs: 120, label: 'main .world-overlay-layer populated' },
            );
            await sleep(300);

            const overlayCheck = await session.evaluate(`(() => {
              const layer = document.querySelector('.world-overlay-layer');
              if (!layer) return { found: false };
              const rawChildren = [...layer.children];
              const items = [];
              for (const ch of rawChildren) {
                const r = ch.getBoundingClientRect();
                const isFullLayerGroup =
                  ch.children.length > 0 && r.width >= window.innerWidth - 4 && r.height >= window.innerHeight - 4;
                if (isFullLayerGroup) {
                  items.push(...ch.children);
                } else {
                  items.push(ch);
                }
              }
              const active = items.filter((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
              });
              const legacyLeftTop = [];
              const missingTransform = [];
              for (const el of active) {
                const left = el.style.left;
                const top = el.style.top;
                const usesLeftTop = (left && left !== '0px') || (top && top !== '0px');
                if (usesLeftTop) {
                  legacyLeftTop.push({ cls: el.className, left, top });
                }
                const inlineTf = el.style.transform || '';
                const computedTf = getComputedStyle(el).transform || 'none';
                // Strictly require GPU translate3d / matrix3d (never let static 2D matrix(...) bypass!)
                if (!inlineTf.includes('translate3d') && !computedTf.startsWith('matrix3d(')) {
                  missingTransform.push({ cls: el.className, inlineTf, computedTf });
                }
              }
              return {
                found: true,
                totalDomInLayer: layer.querySelectorAll('*').length,
                activeCount: active.length,
                legacyLeftTop,
                missingTransform,
              };
            })()`);

            ctx.assert(overlayCheck.found, '.world-overlay-layer not found');
            ctx.assertGte(overlayCheck.activeCount, 1, 'At least 1 visible overlay child in .world-overlay-layer');
            ctx.assertLte(overlayCheck.totalDomInLayer, THRESHOLDS.maxOverlayDomNodes, '.world-overlay-layer DOM count');
            ctx.assert(
              overlayCheck.legacyLeftTop.length === 0,
              `${overlayCheck.legacyLeftTop.length}/${overlayCheck.activeCount} active overlay node(s) still use per-frame style.left/top instead of GPU translate3d (e.g. ${JSON.stringify(overlayCheck.legacyLeftTop[0])}; pending M3 3D-08)`,
            );
            ctx.assert(
              overlayCheck.missingTransform.length === 0,
              `${overlayCheck.missingTransform.length}/${overlayCheck.activeCount} active overlay node(s) missing GPU translate3d/matrix3d transform (e.g. ${JSON.stringify(overlayCheck.missingTransform[0])})`,
            );
            ctx.detail(`${overlayCheck.activeCount} active GPU translate3d overlays, ${overlayCheck.totalDomInLayer} total overlay DOM nodes`);
          } else {
            await activateBoost(session, 'standalone');
            await activateHelper(session, 'standalone');
            await sleep(1200);

            const check = await session.evaluate(`(() => {
              const domNodes = document.querySelectorAll('*').length;
              const toasts = document.querySelectorAll('#toast-box > *').length;
              const hasArt = Boolean(window.__sizzleArtifact && typeof window.__sizzleArtifact.getStateSummary === 'function');
              const summary = hasArt ? window.__sizzleArtifact.getStateSummary() : null;
              return { domNodes, toasts, hasArt, activeParticles: summary?.activeParticles ?? null };
            })()`);

            ctx.assertLte(check.domNodes, 600, 'Standalone total DOM nodes');
            ctx.assertLte(check.toasts, 20, 'Standalone active toast count');
            ctx.assert(
              check.hasArt && typeof check.activeParticles === 'number',
              'window.__sizzleArtifact.getStateSummary().activeParticles unavailable (pending M5 SA-TEST-01/SA-VFX-01)',
            );
            ctx.assertLte(check.activeParticles, THRESHOLDS.maxStandaloneParticles, 'Standalone activeParticles pool bound');
            ctx.detail(`activeParticles=${check.activeParticles} <= ${THRESHOLDS.maxStandaloneParticles}, domNodes=${check.domNodes}`);
          }
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T2.6: Audio Burst Stress Boundary (25 Rapid Triggers)
    // =========================================================================
    await runner.runTest(
      { id: `T2.6-${target}`, tier: 2, target, name: `Audio burst stress (${THRESHOLDS.audioBurstCount} rapid SFX triggers)` },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          // Real gesture unlock first
          await activateBoost(session, target);
          await sleep(200);

          if (target === 'main') {
            const burst = await session.evaluate(`(() => {
              const snd = window.__sizzle?.sound;
              if (!snd || typeof snd.play !== 'function') return { ok: false, error: 'sound.play missing' };
              const pool = ['coin', 'upgrade', 'tap', 'sizzle', 'tip'];
              for (let i = 0; i < ${THRESHOLDS.audioBurstCount}; i++) {
                snd.play(pool[i % pool.length], { combo: i % 10 });
              }
              const hasSummary = typeof snd.getStateSummary === 'function';
              const summary = hasSummary ? snd.getStateSummary() : null;
              return { ok: true, hasSummary, summary };
            })()`);

            ctx.assert(burst.ok, `Audio burst failed: ${burst.error}`);
            const status = await readAudioStatus(session, 'main');
            ctx.assert(status.running, `AudioContext not 'running' after burst (states=${JSON.stringify(status.spyStates)})`);
            ctx.assert(burst.hasSummary, 'SoundEngine.getStateSummary() missing to verify activeVoices bound (pending M1/M4 AUD-03)');
            ctx.assertGte(burst.summary.activeVoices, 1, 'At least 1 active voice after synchronous SFX burst');
            ctx.assertLte(burst.summary.activeVoices, THRESHOLDS.maxActiveVoices, 'Active voice polyphony cap');

            const errReport = session.getErrorReport();
            ctx.assert(errReport.ok, `Runtime errors during audio burst: ${errReport.summary}`);
            ctx.detail(`${THRESHOLDS.audioBurstCount} rapid SFX ok, activeVoices=${burst.summary.activeVoices}, context=running`);
          } else {
            const burst = await session.evaluate(`(() => {
              const art = window.__sizzleArtifact;
              if (!art || typeof art.playTestSfx !== 'function') {
                return { hasHook: false };
              }
              const pool = ['coin', 'upgrade', 'sizzle', 'milestone', 'tip'];
              let okCount = 0;
              for (let i = 0; i < ${THRESHOLDS.audioBurstCount}; i++) {
                if (art.playTestSfx(pool[i % pool.length])) okCount += 1;
              }
              const summary = typeof art.getStateSummary === 'function' ? art.getStateSummary() : null;
              return { hasHook: true, okCount, summary };
            })()`);

            const status = await readAudioStatus(session, 'standalone');
            ctx.assert(status.running, `AudioContext not 'running' after gesture (states=${JSON.stringify(status.spyStates)})`);
            ctx.assert(burst.hasHook, 'window.__sizzleArtifact.playTestSfx() missing for burst test (pending M5 SA-AUD-01/SA-TEST-01)');
            ctx.assertGte(
              burst.okCount,
              1,
              'At least 1 burst playTestSfx succeeded (rate-limited repeats may return false cleanly)',
            );
            ctx.assertEqual(burst.summary?.audioState, 'running', 'Standalone audioState after burst');

            const errReport = session.getErrorReport();
            ctx.assert(errReport.ok, `Runtime errors during standalone audio burst: ${errReport.summary}`);
            ctx.detail(`${burst.okCount}/${THRESHOLDS.audioBurstCount} rapid SFX ok, audioState=running`);
          }
        } finally {
          await session.close();
        }
      },
    );
  }
}
