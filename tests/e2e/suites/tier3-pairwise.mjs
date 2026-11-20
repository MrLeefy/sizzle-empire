import { sleep } from '../lib/cdpClient.mjs';
import { THRESHOLDS } from '../lib/config.mjs';
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
  readHudGems,
  readStationPopoverInfo,
  waitForCrateRevealModal,
} from '../lib/targetHelpers.mjs';

export async function runTier3(runner, { targets, staticUrl }) {
  for (const target of targets) {
    // =========================================================================
    // T3.1: Gameplay + UI + Audio + VFX Core Loop
    // =========================================================================
    await runner.runTest(
      { id: `T3.1-${target}`, tier: 3, target, name: 'Gameplay + UI + Audio core loop (Boost, Helper, organic delivery -> Lv 2)' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          // 1. Verify Popular Dish is appropriately hidden on 1-station Venue 0
          const popularVisible = await session.evaluate(
            target === 'main'
              ? `(() => {
                  const b = document.querySelector('.skills-rail button.skill-fab[title*="Popular" i]');
                  return Boolean(b && b.getBoundingClientRect().width > 0);
                })()`
              : `(() => {
                  const b = document.getElementById('fab-popular');
                  return Boolean(b && !b.classList.contains('hidden') && b.getBoundingClientRect().width > 0);
                })()`,
          );
          ctx.assertEqual(popularVisible, false, 'Popular Dish button must be hidden on 1-station Venue 0');

          // 2. Activate Boost (unlocks Web Audio via real CDP click) & Helper Chef
          await activateBoost(session, target);
          await sleep(180);

          const audioAfterBoost = await readAudioStatus(session, target);
          ctx.assert(audioAfterBoost.running, `AudioContext did not unlock to 'running' on Boost click (${JSON.stringify(audioAfterBoost.spyStates)})`);

          const workersBefore =
            target === 'main'
              ? await session.evaluate(`window.__sizzle.getActiveRuntime().workers.length`)
              : null;

          await activateHelper(session, target);
          await sleep(180);

          if (target === 'main') {
            const workersAfter = await session.evaluate(`window.__sizzle.getActiveRuntime().workers.length`);
            ctx.assertGte(workersAfter, workersBefore + 1, 'Helper skill spawned Guest Star Chef worker');
          } else {
            const helperDisabled = await session.evaluate(`Boolean(document.getElementById('fab-helper')?.disabled)`);
            ctx.assertEqual(helperDisabled, true, 'Standalone Helper button entered cooldown after activation');
          }

          // 3. Poll organic delivery up to 30s (THRESHOLDS.organicDeliveryTimeoutMs) until cash > $0
          const firstCash = await waitFor(
            async () => {
              const c = await readHudCash(session, target);
              return c.value > 0 ? c : false;
            },
            {
              timeoutMs: THRESHOLDS.organicDeliveryTimeoutMs,
              intervalMs: 250,
              label: `${target} organic first dish delivery (cash > $0)`,
            },
          );

          // 4. Tap Station 0 (station badge on main; dual-mode hitbox on standalone)
          const tapRes = await openStation0Popover(session, target);
          const beforeUpgrade = await readStationPopoverInfo(session, target);
          ctx.assertEqual(beforeUpgrade.level, 1, 'Station 0 initial level');
          ctx.assert(!beforeUpgrade.buyDisabled, `Station 0 Lv 1->2 should be affordable at ${firstCash.text}`);

          // Read fresh cash & dishesServed right before real CDP pointerdown/pointerup buy
          const cashBeforeBuy = await readHudCash(session, target);
          const preSnap = await session.evaluate(
            target === 'main'
              ? `(() => {
                  const rt = window.__sizzle.getActiveRuntime();
                  return {
                    dishes: rt.dishesServedHere ?? 0,
                    rawCash: Number(rt.cash),
                    earned: Number(rt.totalCashEarnedHere),
                  };
                })()`
              : `(() => {
                  const s = window.__sizzleArtifact?.getStateSummary?.() || null;
                  return {
                    dishes: typeof s?.dishesServed === 'number' ? s.dishesServed : null,
                  };
                })()`,
          );

          // 5. Real CDP pointer press (35ms < 240ms hold repeat threshold)
          await session.clickAt(beforeUpgrade.buyRect.x, beforeUpgrade.buyRect.y, 35);
          await sleep(40);

          let afterUpgrade = await readStationPopoverInfo(session, target);
          let cashAfterBuy = await readHudCash(session, target);
          let postSnap = await session.evaluate(
            target === 'main'
              ? `(() => {
                  const rt = window.__sizzle.getActiveRuntime();
                  return {
                    dishes: rt.dishesServedHere ?? 0,
                    rawCash: Number(rt.cash),
                    earned: Number(rt.totalCashEarnedHere),
                  };
                })()`
              : `(() => {
                  const s = window.__sizzleArtifact?.getStateSummary?.() || null;
                  return {
                    dishes: typeof s?.dishesServed === 'number' ? s.dishesServed : null,
                  };
                })()`,
          );

          // If React's ~120ms UI throttle has not yet painted Lv 2 at 40ms, wait briefly and re-read
          if (!afterUpgrade || afterUpgrade.level < 2) {
            await sleep(160);
            afterUpgrade = await readStationPopoverInfo(session, target);
            cashAfterBuy = await readHudCash(session, target);
            postSnap = await session.evaluate(
              target === 'main'
                ? `(() => {
                    const rt = window.__sizzle.getActiveRuntime();
                    return {
                      dishes: rt.dishesServedHere ?? 0,
                      rawCash: Number(rt.cash),
                      earned: Number(rt.totalCashEarnedHere),
                    };
                  })()`
                : `(() => {
                    const s = window.__sizzleArtifact?.getStateSummary?.() || null;
                    return {
                      dishes: typeof s?.dishesServed === 'number' ? s.dishesServed : null,
                    };
                  })()`,
            );
          }

          ctx.assertGte(afterUpgrade.level, 2, 'Station 0 upgraded from Lv 1 -> Lv 2');
          ctx.assertGte(cashAfterBuy.value, 0, 'Cash remained non-negative after upgrade');

          let cashNote = `${cashBeforeBuy.text}->${cashAfterBuy.text}`;
          if (target === 'main') {
            if (postSnap.dishes === preSnap.dishes) {
              ctx.assert(
                cashAfterBuy.value < cashBeforeBuy.value && postSnap.rawCash < preSnap.rawCash,
                `Expected genuine cash deduction with 0 concurrent deliveries (${cashBeforeBuy.text} -> ${cashAfterBuy.text}, raw ${preSnap.rawCash} -> ${postSnap.rawCash})`,
              );
            } else {
              const netSpent = (postSnap.earned - preSnap.earned) - (postSnap.rawCash - preSnap.rawCash);
              ctx.assert(
                netSpent > 0,
                `Expected positive net cash spent despite concurrent delivery (${preSnap.dishes}->${postSnap.dishes} dishes, netSpent=${netSpent})`,
              );
              cashNote += ` (concurrent dish ${preSnap.dishes}->${postSnap.dishes}, spent=$${netSpent.toFixed(2)})`;
            }
          } else if (preSnap.dishes !== null && postSnap.dishes !== null && postSnap.dishes > preSnap.dishes) {
            cashNote += ` (concurrent dish ${preSnap.dishes}->${postSnap.dishes})`;
          } else {
            ctx.assert(
              cashAfterBuy.value < cashBeforeBuy.value,
              `Expected genuine cash deduction on upgrade (${cashBeforeBuy.text} -> ${cashAfterBuy.text})`,
            );
          }

          await closeStationPopover(session, target);

          const errReport = session.getErrorReport();
          ctx.assert(errReport.ok, `Runtime errors during core gameplay loop: ${errReport.summary}`);
          ctx.detail(
            `Popular hidden on Venue 0, Boost+Helper active, organic cash=${firstCash.text}, tapped via ${tapRes.source}, upgraded Lv 1->${afterUpgrade.level} (${cashNote})`,
          );
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T3.2: Meta Progression Pairwise Flow (Vault, Gear Crate Modal, Pets, Ranks, Upgrades)
    // =========================================================================
    await runner.runTest(
      { id: `T3.2-${target}`, tier: 3, target, name: 'Meta progression pairwise flow (Vault, Crate Reveal Modal, Pets, Ranks, Upgrades)' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          const failures = [];

          // Start Boost + Helper early so restaurant upgrade ($24/$22) organically earns while we exercise meta sheets
          await activateBoost(session, target);
          await activateHelper(session, target);

          if (target === 'main') {
            // 1. Vault free Lv 1 unlock (0 gems)
            await openBottomTab(session, 'main', 'Vault');
            const vaultBefore = await session.evaluate(`window.__sizzle.save.vault.unlockedIds.length`);
            const clickedFree = await clickSheetButton(session, 'main', '^FREE$');
            ctx.assert(Boolean(clickedFree), 'Main Vault FREE (0 gem) unlock button not found');
            const vaultAfter = await session.evaluate(`window.__sizzle.save.vault.unlockedIds.length`);
            ctx.assertGte(vaultAfter, vaultBefore + 1, 'Vault unlockedIds incremented on FREE unlock');
            await closeActiveSheet(session, 'main');

            // 2. Ranks -> Chef Ranks -> Claim Rank 1 (+15 gems, +1 Small Crate)
            const gemsBeforeRank = await readHudGems(session, 'main');
            const cratesBeforeRank = await session.evaluate(`window.__sizzle.save.boxes.small`);
            await openBottomTab(session, 'main', 'Ranks');
            await clickSubTab(session, 'main', 'Chef Ranks');
            const claimed = await clickSheetButton(session, 'main', '^Claim$');
            ctx.assert(Boolean(claimed), 'Chef Rank 1 Claim button not found/enabled');
            await sleep(160);
            const gemsAfterRank = await readHudGems(session, 'main');
            const cratesAfterRank = await session.evaluate(`window.__sizzle.save.boxes.small`);
            ctx.assertEqual(gemsAfterRank.value, gemsBeforeRank.value + 15, 'Rank 1 Claim granted +15 gems');
            ctx.assertEqual(cratesAfterRank, cratesBeforeRank + 1, 'Rank 1 Claim granted +1 Small Crate');
            await closeActiveSheet(session, 'main');

            // 3. Gear -> Crates -> Open x1 -> assert Crate Opening Reveal Modal
            await openBottomTab(session, 'main', 'Gear');
            await clickSubTab(session, 'main', 'Crates');
            const cratesPreOpen = await session.evaluate(`window.__sizzle.save.boxes.small`);
            const openedCrate = await clickSheetButton(session, 'main', 'Open\\s*[×x]?1');
            ctx.assert(Boolean(openedCrate), 'Main Gear -> Crates Open x1 button not found');

            const modal = await waitForCrateRevealModal(session, 'main', { minCards: 2, timeoutMs: 6000 });
            if (!modal.found) {
              failures.push('Main Crate Opening Reveal Modal did not appear after Open x1');
            } else {
              if (modal.cardCount < 2) {
                failures.push(`Main Crate Reveal Modal expected >= 2 drop cards, found ${modal.cardCount}`);
              }
              if (!modal.dismissBtn) {
                failures.push('Main Crate Reveal Modal missing dismiss button');
              } else {
                const dismissed = await dismissCrateRevealModal(session, 'main', modal, 2000);
                if (!dismissed) {
                  failures.push('Main Crate Reveal Modal remained visible after clicking dismiss button');
                }
              }
            }
            const cratesPostOpen = await session.evaluate(`window.__sizzle.save.boxes.small`);
            ctx.assertEqual(cratesPostOpen, cratesPreOpen - 1, 'Main Small Crate count decremented by 1');
            await closeActiveSheet(session, 'main');

            // 4. Pets -> Eggs -> Feed +25 (verify Hatch Now stays disabled since 40 < 100)
            await openBottomTab(session, 'main', 'Pets');
            await clickSubTab(session, 'main', 'Eggs');
            const petFoodBefore = await session.evaluate(`window.__sizzle.save.petFood`);
            const hatchDisabled = await session.evaluate(`(() => {
              const btn = [...document.querySelectorAll('.sheet-panel button')].find((b) => /hatch/i.test(b.textContent || ''));
              return btn ? Boolean(btn.disabled) : null;
            })()`);
            ctx.assertEqual(hatchDisabled, true, 'Main Pets Hatch Now should be disabled at starter 40/100 food');
            const fed = await clickSheetButton(session, 'main', 'Feed');
            ctx.assert(Boolean(fed), 'Main Pets Feed +25 button not found');
            const petState = await session.evaluate(`({
              petFood: window.__sizzle.save.petFood,
              progress: window.__sizzle.save.eggs[0]?.hatchingProgress ?? 0,
            })`);
            ctx.assertEqual(petState.progress, 25, 'Starter Common Egg progress increased 0 -> 25');
            ctx.assertEqual(petState.petFood, petFoodBefore - 25, 'Pet food deducted by 25');
            await closeActiveSheet(session, 'main');

            // 5. Upgrades sheet affordability & purchase ($24 cheapest upgrade)
            await waitFor(
              async () => {
                const c = await readHudCash(session, 'main');
                return c.value >= 24 ? c : false;
              },
              {
                timeoutMs: THRESHOLDS.organicCashUpgradeTimeoutMsMain,
                intervalMs: 250,
                label: 'main organic cash >= $24 for first restaurant upgrade',
              },
            );
            await openBottomTab(session, 'main', 'Upgrades');
            const upBefore = await session.evaluate(`window.__sizzle.getActiveRuntime().purchasedUpgradeIds.length`);
            const boughtUp = await clickSheetButton(session, 'main', '\\$');
            ctx.assert(Boolean(boughtUp), 'No affordable restaurant upgrade button found at >= $24');
            const upAfter = await session.evaluate(`window.__sizzle.getActiveRuntime().purchasedUpgradeIds.length`);
            ctx.assertGte(upAfter, upBefore + 1, 'Purchased restaurant upgrade recorded');
            await closeActiveSheet(session, 'main');

            const errReport = session.getErrorReport();
            if (!errReport.ok) failures.push(`runtime errors: ${errReport.summary}`);
            ctx.assert(failures.length === 0, failures.join('; '));
            ctx.detail(`Vault FREE OK, Rank 1 claimed (+15 gems), Crate Modal (${modal.cardCount} cards) OK, Pet fed 25/100, Upgrade bought`);
          } else {
            // Standalone meta progression flow
            // 1. Vault FREE unlock (0 gems) - unlock Boost Amplifier & Express Register for faster organic earning
            const gemsBefore = await readHudGems(session, 'standalone');
            await openBottomTab(session, 'standalone', 'Vault');
            const free1 = await clickSheetButton(session, 'standalone', '^FREE$');
            ctx.assert(Boolean(free1), 'Standalone Vault FREE button not found');
            await clickSheetButton(session, 'standalone', '^FREE$');
            const gemsAfterVault = await readHudGems(session, 'standalone');
            ctx.assertEqual(gemsAfterVault.value, gemsBefore.value, 'Vault FREE unlock spent 0 gems');
            await closeActiveSheet(session, 'standalone');

            // 2. Pets -> Hatch (100 food) -> auto-equips Buttercup Chick (starter food 110 -> 10)
            await openBottomTab(session, 'standalone', 'Pets');
            const hatched = await clickSheetButton(session, 'standalone', 'Hatch');
            ctx.assert(Boolean(hatched), 'Standalone Pets Hatch (100) button not found/enabled');
            await sleep(160);
            const petPanelText = await session.evaluate(`(document.getElementById('sheet-body')?.textContent || '').trim()`);
            ctx.assert(/Active|Buttercup/i.test(petPanelText), `Expected hatched pet card with Active state, got: ${petPanelText.slice(0, 120)}`);
            await closeActiveSheet(session, 'standalone');

            // 3. Ranks -> verify 5 rank cards & post-M5 claimable Ranks nav badge (SA-UI-01)
            await openBottomTab(session, 'standalone', 'Ranks');
            const rankCheck = await session.evaluate(`(() => {
              const cards = document.querySelectorAll('#sheet-body .card, #sheet-body .card-col, #sheet-body .item-card').length;
              const claimBtns = [...document.querySelectorAll('#sheet-body button')].filter((b) => /claim/i.test(b.textContent || '') && !b.disabled).length;
              const ranksTab = document.querySelector('.bottom-nav [data-sheet="ranks"]');
              const badge = ranksTab ? ranksTab.querySelector('.nav-badge, #badge-ranks, [id*="badge-rank" i]') : null;
              const hasArtifactRankCount =
                typeof window.__sizzleArtifact?.getStateSummary?.()?.rankClaimableCount === 'number';
              return { cards, claimBtns, hasRankBadgeEl: Boolean(badge), hasArtifactRankCount };
            })()`);
            ctx.assertGte(rankCheck.cards, 5, 'Standalone Ranks card count');
            if (!rankCheck.hasRankBadgeEl && !rankCheck.hasArtifactRankCount) {
              failures.push('Standalone Ranks nav tab missing claimable .nav-badge / #badge-ranks (pending M5 SA-UI-01)');
            }
            await closeActiveSheet(session, 'standalone');

            // 4. Upgrades sheet -> organically afford $22 upgrade & purchase
            await waitFor(
              async () => {
                const c = await readHudCash(session, 'standalone');
                return c.value >= 22 ? c : false;
              },
              {
                timeoutMs: THRESHOLDS.organicCashUpgradeTimeoutMsStandalone,
                intervalMs: 250,
                label: 'standalone organic cash >= $22 for first restaurant upgrade',
              },
            );
            await openBottomTab(session, 'standalone', 'Upgrades');
            const cashPreUp = await readHudCash(session, 'standalone');
            const upCardsBefore = await session.evaluate(
              `document.querySelectorAll('#sheet-body .card, #sheet-body .card-col, #sheet-body .item-card').length`,
            );
            const boughtUp = await clickSheetButton(session, 'standalone', '\\$');
            ctx.assert(Boolean(boughtUp), 'Standalone affordable upgrade button not found at >= $22');
            await sleep(140);
            const upCardsAfter = await session.evaluate(
              `document.querySelectorAll('#sheet-body .card, #sheet-body .card-col, #sheet-body .item-card').length`,
            );
            ctx.assert(upCardsAfter < upCardsBefore, `Expected upgrade list count to drop (${upCardsBefore} -> ${upCardsAfter})`);
            await closeActiveSheet(session, 'standalone');

            // 5. Gear -> Crates -> Open x1 -> STRICTLY assert Crate Opening Reveal Modal (SA-UI-02)
            await openBottomTab(session, 'standalone', 'Gear');
            await clickSubTab(session, 'standalone', 'Crates');
            const badgeBefore = await session.evaluate(`Number((document.getElementById('badge-boxes')?.textContent || '0').replace(/[^\\d]/g, ''))`);
            ctx.assertGte(badgeBefore, 1, 'Starter crate badge >= 1 before Open x1');
            const openedCrate = await clickSheetButton(session, 'standalone', 'Open\\s*[×x]?1');
            ctx.assert(Boolean(openedCrate), 'Standalone Gear -> Crates Open x1 button not found');

            const modal = await waitForCrateRevealModal(session, 'standalone', { minCards: 1, timeoutMs: 6000 });

            const badgeAfter = await session.evaluate(`Number((document.getElementById('badge-boxes')?.textContent || '0').replace(/[^\\d]/g, ''))`);
            ctx.assertEqual(badgeAfter, badgeBefore - 1, 'Standalone crate badge decremented after Open x1');

            if (!modal.found) {
              failures.push('Standalone Crate Opening Reveal Modal did NOT appear after Open x1 — toast-only pre-M5 behavior (pending M5 SA-UI-02)');
            } else {
              if (modal.cardCount < 1) {
                failures.push('Standalone Crate Reveal Modal rendered 0 reward cards');
              }
              if (!modal.dismissBtn) {
                failures.push('Standalone Crate Reveal Modal missing dismiss/collect button');
              } else {
                const dismissed = await dismissCrateRevealModal(session, 'standalone', modal, 2000);
                if (!dismissed) {
                  failures.push('Standalone Crate Reveal Modal remained visible after clicking dismiss button');
                }
              }
            }
            await closeActiveSheet(session, 'standalone');

            const errReport = session.getErrorReport();
            if (!errReport.ok) failures.push(`runtime errors: ${errReport.summary}`);
            ctx.assert(failures.length === 0, failures.join('; '));
            ctx.detail(
              `Vault FREE OK, Hatched pet OK, 5 Ranks + badge OK, Upgrade bought (cash=${cashPreUp.text}), Crate Modal (${modal.cardCount} cards) OK`,
            );
          }
        } finally {
          await session.close();
        }
      },
    );

    // =========================================================================
    // T3.3: Multi-Venue / Event Round-Trip (Crystal Cavern -> Main City)
    // =========================================================================
    await runner.runTest(
      { id: `T3.3-${target}`, tier: 3, target, name: 'Multi-venue Crystal Cavern event round-trip & state preservation' },
      async (ctx) => {
        const session = await bootTargetSession(target, { staticUrl });
        try {
          const failures = [];

          // Snapshot main venue info before entering event
          const mainBefore = await session.evaluate(
            target === 'main'
              ? `({
                  bannerText: (document.querySelector('.top-hud .city-banner')?.textContent || '').trim(),
                  activeView: window.__sizzle.save.events.activeView,
                  cash: window.__sizzle.getActiveRuntime().cash,
                  station0Lv: window.__sizzle.getActiveRuntime().stations[0]?.level ?? 0,
                })`
              : `({
                  bannerText: (document.querySelector('.top-hud .city-card')?.textContent || '').trim(),
                  cashText: (document.getElementById('hud-cash')?.textContent || '').trim(),
                })`,
          );

          await openBottomTab(session, target, 'Events');
          const enterPattern = target === 'main' ? 'Enter Event' : '^Enter$';
          const entered = await clickSheetButton(session, target, enterPattern);
          ctx.assert(Boolean(entered), `Event enter button not found on ${target}`);
          await sleep(400);

          // Verify Event banner visible, Crystal Cavern active, zero overlap with .skills-rail
          const eventCheck = await session.evaluate(`(() => {
            const target = ${JSON.stringify(target)};
            const banner = target === 'main'
              ? document.querySelector('.top-hud .mode-return-banner')
              : document.getElementById('event-banner');
            const skills = document.querySelector('.skills-rail');
            const canvas = target === 'main'
              ? document.querySelector('.viewport-3d canvas')
              : document.getElementById('world');
            const br = banner ? banner.getBoundingClientRect() : null;
            const sr = skills ? skills.getBoundingClientRect() : null;
            const cityBannerText = target === 'main'
              ? (document.querySelector('.top-hud .city-banner')?.textContent || '').trim()
              : (banner?.textContent || '').trim();
            return {
              bannerVisible: Boolean(banner && !banner.classList.contains('hidden') && br && br.height > 0),
              hasSkills: Boolean(skills && sr && sr.height > 0),
              bannerText: (banner?.textContent || '').trim(),
              cityBannerText,
              activeView: target === 'main' ? window.__sizzle.save.events.activeView : null,
              stationCount: target === 'main'
                ? window.__sizzle.getActiveRuntime().stations.length
                : (window.__sizzleArtifact?.getStateSummary?.()?.stations?.length ?? null),
              canvasOk: Boolean(canvas && canvas.width > 0 && canvas.height > 0),
              overlapPx: br && sr ? Math.round((br.bottom - sr.top) * 10) / 10 : null,
              bannerBottom: br ? Math.round(br.bottom * 10) / 10 : null,
              skillsTop: sr ? Math.round(sr.top * 10) / 10 : null,
            };
          })()`);

          ctx.assert(eventCheck.bannerVisible, 'Event return banner not visible after entering Crystal Cavern');
          ctx.assert(eventCheck.hasSkills, '.skills-rail not found/visible in event view');
          ctx.assert(eventCheck.canvasOk, 'Canvas invalid after switching to event venue');
          ctx.assert(
            /Crystal\s*Cavern/i.test(`${eventCheck.bannerText} ${eventCheck.cityBannerText}`),
            `Expected Crystal Cavern banner text, got "${eventCheck.bannerText}" / "${eventCheck.cityBannerText}"`,
          );
          if (target === 'main') {
            ctx.assertEqual(eventCheck.activeView, 'major_event', 'Main activeView switched to major_event');
            ctx.assertGte(eventCheck.stationCount, 2, 'Crystal Cavern multi-station count');
          } else if (typeof eventCheck.stationCount === 'number') {
            ctx.assertGte(eventCheck.stationCount, 2, 'Crystal Cavern standalone multi-station count');
          }
          if (eventCheck.overlapPx === null || eventCheck.overlapPx > 0.5) {
            failures.push(
              `Event banner overlaps .skills-rail by ${eventCheck.overlapPx}px (banner.bottom=${eventCheck.bannerBottom} > skills.top=${eventCheck.skillsTop})`,
            );
          }

          // Return cleanly via Main City banner button
          const returnSel = target === 'main' ? '.mode-return-banner button' : '#btn-exit-event';
          await session.clickElement(returnSel, 35);
          await sleep(350);

          const mainAfter = await session.evaluate(
            target === 'main'
              ? `({
                  bannerText: (document.querySelector('.top-hud .city-banner')?.textContent || '').trim(),
                  activeView: window.__sizzle.save.events.activeView,
                  returnVisible: Boolean(document.querySelector('.top-hud .mode-return-banner')),
                  station0Lv: window.__sizzle.getActiveRuntime().stations[0]?.level ?? 0,
                })`
              : `({
                  bannerText: (document.querySelector('.top-hud .city-card')?.textContent || '').trim(),
                  returnHidden: Boolean(document.getElementById('event-banner')?.classList.contains('hidden')),
                })`,
          );

          if (target === 'main') {
            ctx.assertEqual(mainAfter.activeView, 'main', 'activeView returned to main');
            ctx.assertEqual(mainAfter.returnVisible, false, 'mode-return-banner hidden after returning to Main City');
            ctx.assertEqual(mainAfter.station0Lv, mainBefore.station0Lv, 'Main City Station 0 level preserved');
          } else {
            ctx.assertEqual(mainAfter.returnHidden, true, 'Standalone #event-banner hidden after returning to Main City');
          }
          ctx.assert(/Solaria\s*Bay|Sunburst/i.test(mainAfter.bannerText), `Main venue banner restored: "${mainAfter.bannerText}"`);

          const errReport = session.getErrorReport();
          if (!errReport.ok) failures.push(`runtime errors: ${errReport.summary}`);
          ctx.assert(failures.length === 0, failures.join('; '));
          ctx.detail(`Crystal Cavern enter -> Main City return preserved state cleanly, 0 errors`);
        } finally {
          await session.close();
        }
      },
    );
  }
}
