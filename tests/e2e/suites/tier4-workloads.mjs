import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/cdpClient.mjs';
import { PRIMARY_VIEWPORT, THRESHOLDS, TIER4_GALLERY_SUFFIXES } from '../lib/config.mjs';
import { analyzeImage } from '../lib/imageAnalyzer.mjs';
import { waitFor } from '../lib/runner.mjs';
import {
  activateBoost,
  activateHelper,
  bootTargetSession,
  clickSheetButton,
  clickSubTab,
  closeActiveSheet,
  closeStationPopover,
  dismissCrateRevealModal,
  openBottomTab,
  openStation0Popover,
  readAudioStatus,
  readHudCash,
  readStationPopoverInfo,
  sampleRafBudget,
  waitForCrateRevealModal,
  waitForTargetBoot,
} from '../lib/targetHelpers.mjs';

export async function runTier4(runner, { targets, staticUrl, screenshotsDir }) {
  for (const target of targets) {
    let session = null;
    const capturedFiles = {};
    let t41CleanMainState = false;

    try {
      // =======================================================================
      // T4.1: Full Continuous Mobile Session, 6-Frame Gallery Capture & Reload Persistence
      // =======================================================================
      await runner.runTest(
        { id: `T4.1-${target}`, tier: 4, target, name: 'End-to-end mobile session, 6-shot gallery & persistence across reload' },
        async (ctx) => {
          session = await bootTargetSession(target, { staticUrl, viewport: PRIMARY_VIEWPORT });
          await sleep(500);

          const snap = async (suffix) => {
            const filename = `${target}_${suffix}`;
            const fullPath = path.join(screenshotsDir, filename);
            const info = await session.captureScreenshot(fullPath);
            capturedFiles[suffix] = fullPath;
            ctx.recordScreenshot({ target, name: filename, path: fullPath, bytes: info.bytes });
            return fullPath;
          };

          // 1. Cold boot kitchen screenshot
          await snap('01_kitchen.png');

          // 2. Gesture unlock audio + Boost + Helper + Vault free unlock
          await activateBoost(session, target);
          await sleep(180);
          const audio = await readAudioStatus(session, target);
          ctx.assert(audio.running, `AudioContext failed to unlock to 'running' (${JSON.stringify(audio.spyStates)})`);

          await activateHelper(session, target);
          await openBottomTab(session, target, 'Vault');
          await clickSheetButton(session, target, '^FREE$');
          if (target === 'standalone') {
            await clickSheetButton(session, target, '^FREE$');
          }
          await closeActiveSheet(session, target);

          // 3. Organic cook & delivery -> action screenshot
          const firstCash = await waitFor(
            async () => {
              const c = await readHudCash(session, target);
              return c.value > 0 ? c : false;
            },
            {
              timeoutMs: THRESHOLDS.organicDeliveryTimeoutMs,
              intervalMs: 250,
              label: `${target} organic cook/deliver for action capture`,
            },
          );
          await snap('02_action.png');

          // 4. Sweep tips if any spawned naturally
          const tipTapped = await session.evaluate(`(() => {
            const target = ${JSON.stringify(target)};
            const btn = target === 'main'
              ? (document.querySelector('.skills-rail button.skill-fab[title*="Tip" i]') || document.querySelector('.world-overlay-layer button.tip-pill-world'))
              : document.getElementById('fab-tips');
            if (!btn || btn.classList?.contains('hidden')) return null;
            const r = btn.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
          })()`);
          if (tipTapped) {
            await session.clickAt(tipTapped.x, tipTapped.y, 35);
            await sleep(120);
          }

          // 5. Open Station 0 popover -> popover screenshot -> upgrade Lv 1 -> 2
          await openStation0Popover(session, target);
          await sleep(220);
          await snap('03_popover.png');

          const popBefore = await readStationPopoverInfo(session, target);
          ctx.assert(popBefore && !popBefore.buyDisabled, `Expected Station 0 upgrade affordable at ${firstCash.text}`);
          await session.clickAt(popBefore.buyRect.x, popBefore.buyRect.y, 35);
          await sleep(200);
          const popAfter = await readStationPopoverInfo(session, target);
          ctx.assertGte(popAfter.level, 2, 'Station 0 upgraded to Lv >= 2');
          await closeStationPopover(session, target);

          // 6. Wait for first restaurant upgrade ($24 main / $22 standalone) -> sheet screenshot -> purchase
          const upCost = target === 'main' ? 24 : 22;
          await waitFor(
            async () => {
              const c = await readHudCash(session, target);
              return c.value >= upCost ? c : false;
            },
            {
              timeoutMs:
                target === 'main'
                  ? THRESHOLDS.organicCashUpgradeTimeoutMsMain
                  : THRESHOLDS.organicCashUpgradeTimeoutMsStandalone,
              intervalMs: 250,
              label: `${target} organic cash >= $${upCost} for restaurant upgrade`,
            },
          );
          await openBottomTab(session, target, 'Upgrades');
          await sleep(240);
          await snap('04_sheet.png');
          const boughtUp = await clickSheetButton(session, target, '\\$');
          ctx.assert(Boolean(boughtUp), `Failed to buy restaurant upgrade at >= $${upCost}`);
          await closeActiveSheet(session, target);

          // 7. Open starter crate -> poll Crate Reveal Modal -> capture 05_crate_modal.png -> dismiss
          const minCrateCards = target === 'main' ? 2 : 1;
          await openBottomTab(session, target, 'Gear');
          await clickSubTab(session, target, 'Crates');
          const openedCrate = await clickSheetButton(session, target, 'Open\\s*[×x]?1');
          ctx.assert(Boolean(openedCrate), `Failed to open starter Small Crate on ${target}`);

          const crateModal = await waitForCrateRevealModal(session, target, {
            minCards: minCrateCards,
            timeoutMs: 6000,
          });
          await snap('05_crate_modal.png');

          let crateDismissed = false;
          if (crateModal.found && crateModal.dismissBtn) {
            crateDismissed = await dismissCrateRevealModal(session, target, crateModal, 2000);
          }
          await closeActiveSheet(session, target);

          // 8. Enter Crystal Cavern event -> event screenshot -> return cleanly
          await openBottomTab(session, target, 'Events');
          const enterPattern = target === 'main' ? 'Enter Event' : '^Enter$';
          const enteredEvent = await clickSheetButton(session, target, enterPattern);
          ctx.assert(Boolean(enteredEvent), `Failed to enter Crystal Cavern event on ${target}`);
          await sleep(450);
          await snap('06_event.png');

          const returnSel = target === 'main' ? '.mode-return-banner button' : '#btn-exit-event';
          await session.clickElement(returnSel, 35);
          await sleep(300);

          // 9. Deterministic Save Persistence & Page.reload Verification
          if (target === 'main') {
            const expected = await session.evaluate(
              `(async () => {
                await window.__sizzle.persistNow();
                return {
                  station0Lv: window.__sizzle.getActiveRuntime().stations[0]?.level ?? 0,
                  vaultCount: window.__sizzle.save.vault.unlockedIds.length,
                  upgradesCount: window.__sizzle.getActiveRuntime().purchasedUpgradeIds.length,
                  boxesSmall: window.__sizzle.save.boxes.small,
                };
              })()`,
              { awaitPromise: true },
            );

            await session.reloadAndWait(false, THRESHOLDS.bootTimeoutMs);
            await waitForTargetBoot(session, 'main');
            await sleep(300);

            const restored = await session.evaluate(`({
              activeView: window.__sizzle.save.events.activeView,
              station0Lv: window.__sizzle.getActiveRuntime().stations[0]?.level ?? 0,
              vaultCount: window.__sizzle.save.vault.unlockedIds.length,
              upgradesCount: window.__sizzle.getActiveRuntime().purchasedUpgradeIds.length,
              boxesSmall: window.__sizzle.save.boxes.small,
            })`);

            ctx.assertEqual(restored.activeView, 'main', 'Restored activeView is main after reload');
            ctx.assertGte(restored.station0Lv, 2, 'Restored Station 0 level >= 2 after reload');
            ctx.assertEqual(restored.station0Lv, expected.station0Lv, 'Persisted Station 0 level across reload');
            ctx.assertEqual(restored.vaultCount, expected.vaultCount, 'Persisted Vault unlocks across reload');
            ctx.assertEqual(restored.upgradesCount, expected.upgradesCount, 'Persisted restaurant upgrades across reload');
            ctx.assertEqual(restored.boxesSmall, expected.boxesSmall, 'Persisted Small Crate count across reload');
          } else {
            // Standalone saves periodically every 6s (or immediately post-M5) -> poll parsed localStorage up to 8.5s
            const flushed = await waitFor(
              async () =>
                session.evaluate(`(() => {
                  try {
                    const raw = localStorage.getItem('sizzle_empire_artifact_v1');
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    const lv = parsed?.mainRun?.stations?.[0]?.level ?? 0;
                    const ups = Array.isArray(parsed?.mainRun?.boughtUpgrades) ? parsed.mainRun.boughtUpgrades.length : 0;
                    if (lv >= 2 && ups >= 1) {
                      return { lv, ups, cratesSmall: parsed?.crates?.small ?? null };
                    }
                    return null;
                  } catch {
                    return null;
                  }
                })()`),
              {
                timeoutMs: THRESHOLDS.standaloneSavePollTimeoutMs,
                intervalMs: 300,
                label: 'standalone localStorage flush with Station 0 Lv >= 2 and upgrade >= 1',
              },
            );

            await session.reloadAndWait(false, THRESHOLDS.bootTimeoutMs);
            await waitForTargetBoot(session, 'standalone');
            await sleep(350);

            await openStation0Popover(session, 'standalone');
            const restoredPop = await readStationPopoverInfo(session, 'standalone');
            await closeStationPopover(session, 'standalone');

            ctx.assertGte(restoredPop.level, flushed.lv, 'Standalone persisted Station 0 level across reload');
          }

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during continuous mobile session: ${errReport.summary}`);

          // Page is now cleanly reloaded in Main City with 0 errors (safe to reuse for T4.3 even if Crate Modal is pending M5)
          t41CleanMainState = true;

          // Strictly assert Crate Reveal Modal AFTER all 6 PNGs and reload persistence are complete (no silent skip!)
          ctx.assert(
            crateModal.found,
            target === 'main'
              ? 'Main Crate Opening Reveal Modal did not appear after Open x1'
              : 'Standalone Crate Opening Reveal Modal missing (pending M5 SA-UI-02) — all 6 PNGs and reload persistence verified',
          );
          ctx.assertGte(crateModal.cardCount, minCrateCards, `${target} Crate Reveal Modal reward card count`);
          ctx.assert(Boolean(crateModal.dismissBtn), `${target} Crate Reveal Modal missing dismiss button`);
          ctx.assert(crateDismissed, `${target} Crate Reveal Modal remained visible after dismiss click`);

          ctx.detail(
            `6 PNGs captured, Lv>=2 + Upgrade + Crate(${crateModal.cardCount} cards) + Event + Reload persistence verified, 0 errors`,
          );
        },
      );

      // =======================================================================
      // T4.2: PIL Validation of All 6 Tier 4 Screenshots (780x1688)
      // =======================================================================
      await runner.runTest(
        { id: `T4.2-${target}`, tier: 4, target, name: 'PIL visual validation of 6-frame 780x1688 screenshot gallery' },
        async (ctx) => {
          const failures = [];
          const summaries = [];

          for (const suffix of TIER4_GALLERY_SUFFIXES) {
            const filePath = capturedFiles[suffix];
            if (!filePath || !fs.existsSync(filePath)) {
              failures.push(`screenshot ${target}_${suffix} was not captured during T4.1`);
              continue;
            }

            const stats = await analyzeImage(filePath);
            const full = stats.regions.full;
            const center = stats.regions.center;
            const topHud = stats.regions.top_hud;
            const panel = stats.regions.panel;
            const bottomNav = stats.regions.bottom_nav;

            if (stats.width !== THRESHOLDS.expectedPngWidth || stats.height !== THRESHOLDS.expectedPngHeight) {
              failures.push(
                `${suffix}: dims ${stats.width}x${stats.height} != ${THRESHOLDS.expectedPngWidth}x${THRESHOLDS.expectedPngHeight}`,
              );
            }
            if (full.distinct_colors < THRESHOLDS.fullDistinctColorsMin) {
              failures.push(`${suffix}: full.distinct_colors=${full.distinct_colors} < ${THRESHOLDS.fullDistinctColorsMin}`);
            }

            if (suffix === '01_kitchen.png' || suffix === '02_action.png' || suffix === '06_event.png') {
              if (center.distinct_colors < THRESHOLDS.centerDistinctColorsMin) {
                failures.push(`${suffix}: center.distinct_colors=${center.distinct_colors} < ${THRESHOLDS.centerDistinctColorsMin}`);
              }
              if (center.mean_std_rgb < THRESHOLDS.centerMeanStdRgbMin) {
                failures.push(`${suffix}: center.mean_std_rgb=${center.mean_std_rgb} < ${THRESHOLDS.centerMeanStdRgbMin}`);
              }
            }

            if (suffix === '01_kitchen.png') {
              if (center.luma_255 < THRESHOLDS.centerLumaMin) {
                failures.push(`${suffix}: center.luma_255=${center.luma_255} < ${THRESHOLDS.centerLumaMin}`);
              }
              if (center.pct_dark_lt50 > THRESHOLDS.centerPctDarkMax) {
                failures.push(`${suffix}: center.pct_dark_lt50=${center.pct_dark_lt50}% > ${THRESHOLDS.centerPctDarkMax}%`);
              }
              if (topHud.luma_255 < THRESHOLDS.topHudLumaMin) {
                failures.push(`${suffix}: top_hud.luma_255=${topHud.luma_255} < ${THRESHOLDS.topHudLumaMin}`);
              }
              if (topHud.pct_dark_lt50 > THRESHOLDS.topHudPctDarkMax) {
                failures.push(`${suffix}: top_hud.pct_dark_lt50=${topHud.pct_dark_lt50}% > ${THRESHOLDS.topHudPctDarkMax}%`);
              }
              if (bottomNav.luma_255 < THRESHOLDS.bottomNavLumaMin) {
                failures.push(`${suffix}: bottom_nav.luma_255=${bottomNav.luma_255} < ${THRESHOLDS.bottomNavLumaMin}`);
              }
              if (bottomNav.pct_dark_lt50 > THRESHOLDS.bottomNavPctDarkMax) {
                failures.push(`${suffix}: bottom_nav.pct_dark_lt50=${bottomNav.pct_dark_lt50}% > ${THRESHOLDS.bottomNavPctDarkMax}%`);
              }
            }

            if (suffix === '04_sheet.png') {
              if (panel.mean_std_rgb < THRESHOLDS.sheetPanelMeanStdRgbMin) {
                failures.push(`${suffix}: panel.mean_std_rgb=${panel.mean_std_rgb} < ${THRESHOLDS.sheetPanelMeanStdRgbMin}`);
              }
              if (panel.luma_255 < THRESHOLDS.sheetPanelLumaMin) {
                failures.push(`${suffix}: panel.luma_255=${panel.luma_255} < ${THRESHOLDS.sheetPanelLumaMin}`);
              }
              if (panel.pct_dark_lt50 > THRESHOLDS.sheetPanelPctDarkMax) {
                failures.push(`${suffix}: panel.pct_dark_lt50=${panel.pct_dark_lt50}% > ${THRESHOLDS.sheetPanelPctDarkMax}%`);
              }
              if (panel.pct_bright_ge180 < THRESHOLDS.sheetPanelPctBrightMin) {
                failures.push(`${suffix}: panel.pct_bright_ge180=${panel.pct_bright_ge180}% < ${THRESHOLDS.sheetPanelPctBrightMin}%`);
              }
            }

            summaries.push(`${suffix.slice(0, 2)}:${full.distinct_colors}c`);
          }

          ctx.assert(failures.length === 0, failures.join('; '));
          ctx.detail(`all 6 PNGs valid 780x1688 & bright-UI verified (${summaries.join(', ')})`);
        },
      );

      // =======================================================================
      // T4.3: 60-Frame rAF Performance Budget & Stability Check
      // =======================================================================
      await runner.runTest(
        { id: `T4.3-${target}`, tier: 4, target, name: `60-frame rAF performance budget & resource stability` },
        async (ctx) => {
          // Ensure complete session & error isolation from T4.1 before sampling 60 rAF frames
          if (session && !t41CleanMainState) {
            await session.close();
            session = null;
          } else if (session) {
            let inCleanMain = false;
            try {
              inCleanMain = await session.evaluate(
                target === 'main'
                  ? `Boolean(window.__sizzle?.save?.events?.activeView === 'main' && !document.querySelector('.sheet-panel, .modal-card'))`
                  : `Boolean(document.getElementById('event-banner')?.classList.contains('hidden') && document.getElementById('sheet-backdrop')?.classList.contains('hidden'))`,
              );
            } catch {
              inCleanMain = false;
            }
            if (!inCleanMain) {
              await session.close();
              session = null;
            }
          }

          if (!session) {
            session = await bootTargetSession(target, { staticUrl, viewport: PRIMARY_VIEWPORT });
            await sleep(400);
          }

          session.resetErrors();

          const perf = await sampleRafBudget(session, THRESHOLDS.rafSampleFrames);
          const medianBudgetMs =
            target === 'main' ? THRESHOLDS.rafMedianDeltaMsMain : THRESHOLDS.rafMedianDeltaMsStandalone;

          ctx.assertLte(perf.maxDeltaMs, THRESHOLDS.rafMaxFrameStallMs, 'Max single-frame rAF stall (ms)');
          ctx.assertLte(perf.medianDeltaMs, medianBudgetMs, `Median rAF frame delta (ms, ${target} SwiftShader budget)`);
          if (typeof perf.jsMedianMs === 'number') {
            ctx.assertLte(perf.jsMedianMs, THRESHOLDS.jsFrameMedianMaxMs, 'Median JS main-thread frame work (ms)');
          }
          ctx.assertLte(perf.domNodes, 1200, 'Total DOM node count');

          if (target === 'main') {
            const overlayNodes = await session.evaluate(
              `document.querySelectorAll('.world-overlay-layer *').length`,
            );
            ctx.assertLte(overlayNodes, THRESHOLDS.maxOverlayDomNodes, '.world-overlay-layer DOM count');
          } else {
            const particles = await session.evaluate(
              `window.__sizzleArtifact?.getStateSummary?.()?.activeParticles ?? null`,
            );
            if (typeof particles === 'number') {
              ctx.assertLte(particles, THRESHOLDS.maxStandaloneParticles, 'Standalone activeParticles bound');
            }
          }

          if (typeof perf.heapUsedMb === 'number') {
            ctx.assertLte(perf.heapUsedMb, 350, 'JS heap usage (MB)');
          }

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during rAF performance run: ${errReport.summary}`);

          ctx.detail(
            `jsMedian=${perf.jsMedianMs}ms (<=${THRESHOLDS.jsFrameMedianMaxMs}ms), rafMedian=${perf.medianDeltaMs}ms (<=${medianBudgetMs}ms SwiftShader), max=${perf.maxDeltaMs}ms, dom=${perf.domNodes}${perf.heapUsedMb !== null ? `, heap=${perf.heapUsedMb}MB` : ''}`,
          );
        },
      );
    } finally {
      if (session) await session.close();
    }
  }
}
