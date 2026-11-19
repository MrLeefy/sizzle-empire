import { describe, expect, it } from 'vitest';
import { GameController } from '@/engine/GameController';
import { createNewGameSave } from '@/engine/persistence/saveSchema';
import { createGearInstance, equipGearItem } from '@/engine/meta/equipment';
import {
  bottleActivePotion,
  brewOrUpgradePotion,
  buyMerchantOffer,
  claimNextHarvestReward,
  claimNextRaceReward,
  consumeBottledPotion,
  evaluateMajorEventProgress,
  upgradeArcaneVault,
} from '@/engine/events/eventEngine';

describe('Phase 7: Major Events, Timed Adventures, Potion Shop & Activities', () => {
  it('keeps main restaurant completely intact while visiting and advancing multi-stage Major Events', () => {
    const ctrl = new GameController(createNewGameSave(701));
    ctrl.save.mainRestaurant.cash = '987654';
    ctrl.save.mainRestaurant.stations[0].level = 12;

    // Enter 3-stage Citadel Banquet event
    ctrl.openMajorEvent('citadel_banquet', 'normal');
    expect(ctrl.save.events.activeView).toBe('major_event');
    expect(ctrl.getActiveTemplate().id).toBe('event_citadel_orchard');

    // Main restaurant must remain untouched
    expect(ctrl.save.mainRestaurant.cash).toBe('987654');
    expect(ctrl.save.mainRestaurant.stations[0].level).toBe(12);

    // Complete Stage 1 of Citadel Banquet -> auto advances to Stage 2 Tavern!
    const run = ctrl.save.events.majorEvents.citadel_banquet.activeRun!;
    for (const s of run.stations) {
      s.unlocked = true;
      s.level = 1000;
    }
    const evRes = evaluateMajorEventProgress(ctrl.save, 'citadel_banquet');
    expect(evRes.stageAdvanced).toBe(true);
    expect(ctrl.save.events.majorEvents.citadel_banquet.stageIndex).toBe(1);
    expect(ctrl.save.events.majorEvents.citadel_banquet.activeRun?.templateId).toBe('event_citadel_inn');

    // Return to main city safely
    ctrl.switchToMainRestaurant();
    expect(ctrl.save.mainRestaurant.cash).toBe('987654');
    expect(ctrl.save.mainRestaurant.stations[0].level).toBe(12);
  });

  it('handles Timed Adventure victory rewards and timeout failure cleanly', () => {
    const ctrl = new GameController(createNewGameSave(702));
    expect(ctrl.beginTimedAdventure('olympian_trial', 1)).toBe(true);
    expect(ctrl.save.events.activeView).toBe('adventure');
    expect(ctrl.save.events.adventures.olympian_trial.keys).toBe(2);

    // Win adventure by maxing stations before timer ends
    const advRun = ctrl.save.events.adventures.olympian_trial.activeRun!;
    const maxLv = advRun.stationMaxLevelOverride ?? 22;
    for (const s of advRun.stations) {
      s.unlocked = true;
      s.level = maxLv;
    }
    ctrl.stepSimulationFixed(0.1);
    expect(ctrl.save.events.activeView).toBe('main');
    expect(ctrl.save.events.adventures.olympian_trial.highestClearedLevel).toBe(1);
    expect(ctrl.save.events.adventures.olympian_trial.lastOutcome?.won).toBe(true);
    expect(ctrl.save.stats.adventuresCompleted).toBe(1);

    // Fail next level by letting timer expire
    expect(ctrl.beginTimedAdventure('olympian_trial', 2)).toBe(true);
    ctrl.save.events.adventures.olympian_trial.activeTimeRemainingSec = 0.05;
    ctrl.stepSimulationFixed(0.1);
    expect(ctrl.save.events.activeView).toBe('main');
    expect(ctrl.save.events.adventures.olympian_trial.lastOutcome?.won).toBe(false);
  });

  it('disables gear inside Potion Shop, brews potions, upgrades Arcane Vault, and bottles elixirs for Main Game', () => {
    const ctrl = new GameController(createNewGameSave(703));
    const mythic = createGearInstance('m_head_valkyrie', false);
    ctrl.save.inventory.push(mythic);
    equipGearItem(ctrl.save, mythic.instanceId);

    // Outside Potion Shop, mythic gear grants +729%+ All Profit
    expect(ctrl.getActiveStats().allProfitPercent).toBeGreaterThanOrEqual(729);

    // Enter Potion Shop -> gear must be disabled
    ctrl.openPotionShop();
    expect(ctrl.getActiveStats().allProfitPercent).toBe(0);

    // Supply harvested ingredients & brew Swift Stride Elixir
    ctrl.save.events.potionShop.ingredients['sunpetal'] = 50;
    ctrl.save.events.potionShop.ingredients['emberdust'] = 50;
    expect(brewOrUpgradePotion(ctrl.save, 'pot_swift')).toBe(true);
    expect(ctrl.save.events.potionShop.activePotions.length).toBe(1);
    // Active cauldron immediately boosts walk speed inside Potion Shop!
    expect(ctrl.getActiveStats().workerWalkSpeedMult).toBeGreaterThan(1.4);

    // Bottle potion for main game & upgrade Arcane Vault with Scrolls
    expect(bottleActivePotion(ctrl.save, 'pot_swift')).toBe(true);
    expect(ctrl.save.events.potionShop.bottledPotions.length).toBe(1);
    expect(upgradeArcaneVault(ctrl.save, 'distiller')).toBe(true);

    // Drink bottled potion in Main Game
    ctrl.switchToMainRestaurant();
    const now = Date.now();
    expect(consumeBottledPotion(ctrl.save, 'pot_swift', 1, now)).toBe(true);
    expect(ctrl.save.events.potionShop.activeMainBuffs.length).toBe(1);
  });

  it('claims Traveling Merchant, Kitchen Sprint Race, and Harvest rewards accurately', () => {
    const save = createNewGameSave(704);
    save.events.activities.merchantTokens = 50;
    expect(buyMerchantOffer(save, 'm_small_3')).toBe(true);
    expect(save.boxes.small).toBe(4);

    save.events.activities.raceStars = 20;
    expect(claimNextRaceReward(save)).toBe(true);
    expect(save.events.activities.raceTierClaimed).toBe(1);

    save.events.activities.harvestPoints = 30;
    expect(claimNextHarvestReward(save)).toBe(true);
    expect(save.events.activities.harvestTierClaimed).toBe(1);
  });
});
