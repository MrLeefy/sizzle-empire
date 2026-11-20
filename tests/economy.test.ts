import { describe, expect, it } from 'vitest';
import { Decimal, d, formatMoney, serializeDecimal } from '@/engine/economy/bigNumber';
import {
  calculateDishPayout,
  calculateOfflineEarnings,
  calculateTipValue,
  getMaxAffordableStationLevels,
  getStationBulkUpgradeCost,
  getStationSingleUpgradeCost,
} from '@/engine/economy/economy';
import { combineOwnAndAll, computePlayerStats, getGearAllProfitPercent } from '@/engine/economy/stats';
import { getRestaurantTemplate } from '@/data/restaurants';
import { CITIES, getCityByNumber } from '@/data/cities';
import { createNewGameSave } from '@/engine/persistence/saveSchema';
import { GameController } from '@/engine/GameController';
import { runEconomyBot } from '../tools/simulate-economy';

describe('Phase 3 & 4: Economy Math, Large Numbers, Payout Pipeline & City Cycles', () => {
  it('formats huge break_infinity.js numbers cleanly in alphabetic and scientific notation without precision loss', () => {
    expect(formatMoney(d('1500'), 'alphabetic')).toBe('$1.50K');
    expect(formatMoney(d('2500000'), 'alphabetic')).toBe('$2.50M');
    expect(formatMoney(d('1e15'), 'alphabetic')).toBe('$1.00aa');
    expect(formatMoney(d('4.5e18'), 'alphabetic')).toBe('$4.50ab');
    expect(formatMoney(d('1.23e45'), 'scientific')).toBe('$1.23e45');

    const huge = Decimal.pow(10, 250).mul(3.14159);
    const roundTrip = d(serializeDecimal(huge));
    expect(roundTrip.eq(huge)).toBe(true);
  });

  it('calculates exact geometric bulk & max station purchases without ever exceeding balance or going negative', () => {
    const tpl = getRestaurantTemplate('citrus_press');
    const stnTpl = tpl.stations[0];

    const single1 = getStationSingleUpgradeCost(stnTpl, 1, 1);
    const bulk10 = getStationBulkUpgradeCost(stnTpl, 1, 10, 25, 1);
    expect(bulk10.levelsToBuy).toBe(10);
    expect(bulk10.totalCost.gt(single1.mul(10))).toBe(true);

    // Exact cash boundary test for MAX buy
    const cash = bulk10.totalCost.sub(1);
    const maxPlan = getMaxAffordableStationLevels(stnTpl, 1, 25, cash, 1);
    expect(maxPlan.levelsToBuy).toBe(9);
    expect(maxPlan.totalCost.lte(cash)).toBe(true);

    // Purchasing on GameController must strictly guard balance >= 0
    const ctrl = new GameController(createNewGameSave(77));
    ctrl.save.mainRestaurant.cash = serializeDecimal(cash);
    expect(ctrl.purchaseStation(0, 'max')).toBe(true);
    expect(ctrl.save.mainRestaurant.stations[0].level).toBe(10);
    expect(d(ctrl.save.mainRestaurant.cash).gte(0)).toBe(true);
  });

  it('implements documented own vs all-workers combining and full dish payout pipeline', () => {
    // 30% own + 30% all workers => 1.3 * 1.3 - 1 = 0.69 (69%)
    expect(combineOwnAndAll(0.3, 0.3, true)).toBeCloseTo(0.69, 6);
    // Clamped to 100% max probability
    expect(combineOwnAndAll(0.8, 0.8, true)).toBe(1);

    // Accessory rings/necklaces count double
    expect(getGearAllProfitPercent('mythic', 1, false)).toBe(729);
    expect(getGearAllProfitPercent('mythic', 1, true)).toBe(1458);

    const save = createNewGameSave(88);
    const stats = computePlayerStats(save, 0, Date.now());
    const base = d(100);

    const normal = calculateDishPayout({
      stationBaseProfit: base,
      stats,
      quality: 'normal',
      isDouble: false,
      isGolden: false,
      deliveryPetMult: 1,
    });
    const divineCombo = calculateDishPayout({
      stationBaseProfit: base,
      stats,
      quality: 'divine',
      isDouble: true,
      isGolden: true,
      deliveryPetMult: 17,
    });

    // 26 * 2 * 16 * 17 = 14144x normal!
    expect(divineCombo.div(normal).toNumber()).toBeCloseTo(26 * 2 * 16 * 17, 0);
  });

  it('calculates analytical offline earnings and tips scaled by Vault artifacts', () => {
    const save = createNewGameSave(99);
    const tpl = getRestaurantTemplate(save.mainRestaurant.templateId);
    const statsBase = computePlayerStats(save, 0, Date.now());

    const offBase = calculateOfflineEarnings(tpl, save.mainRestaurant, statsBase, 1, 1800);
    expect(offBase.clampedSeconds).toBe(1800);
    expect(offBase.earnings.gt(0)).toBe(true);

    // Upgrade Knife & Hourglass
    save.vault.unlockedIds.push('offline_blade', 'chrono_glass', 'tip_vault');
    save.vault.levels['offline_blade'] = 45; // 10x offline income
    save.vault.levels['chrono_glass'] = 29; // 10.7x max offline duration
    save.vault.levels['tip_vault'] = 45; // 10x tips

    const statsUp = computePlayerStats(save, 0, Date.now());
    const offUp = calculateOfflineEarnings(tpl, save.mainRestaurant, statsUp, 1, 7200);
    expect(offUp.clampedSeconds).toBe(7200);
    expect(offUp.earnings.gt(offBase.earnings.mul(20))).toBe(true);

    const tipBase = calculateTipValue(tpl, save.mainRestaurant, statsBase, 1);
    const tipUp = calculateTipValue(tpl, save.mainRestaurant, statsUp, 1);
    expect(tipUp.gte(tipBase.mul(9))).toBe(true);
  });

  it('supports 60 unique cities looping infinitely with renovation & city travel resets', () => {
    expect(CITIES.length).toBe(60);
    const c1 = getCityByNumber(1);
    const c61 = getCityByNumber(61);
    expect(c1.city.name).toBe(c61.city.name);
    expect(c1.loop).toBe(0);
    expect(c61.loop).toBe(1);

    const ctrl = new GameController(createNewGameSave(123));
    const startGems = ctrl.save.gems;
    ctrl.save.mainRestaurant.stations[0].level = 25;
    expect(ctrl.canRenovateMainRestaurant()).toBe(true);
    const summary = ctrl.renovateMainRestaurant();
    expect(summary).not.toBeNull();
    expect(summary?.isCityFlight).toBe(false);
    expect(ctrl.save.restaurantStageIndex).toBe(1);
    expect(ctrl.save.gems).toBeGreaterThan(startGems);
    expect(ctrl.save.boxes.small).toBeGreaterThan(1);
  });

  it('passes headless multi-restaurant & full city cycle economy balance simulation with authentic Eatventure pacing', () => {
    const beginnerRun = runEconomyBot({
      policy: 'balanced',
      targetRestaurants: 3,
      maxSecondsPerRestaurant: 720,
      seed: 1337,
    });
    expect(beginnerRun.restaurantsCleared).toBe(3);
    expect(beginnerRun.metrics[0].completed).toBe(true);
    // Authentic Eatventure Venue 1 pacing: deliberate ~4-7 min unboosted (never trivial <3 min or stalled >8 min)
    expect(beginnerRun.metrics[0].clearTimeSec).toBeGreaterThanOrEqual(240);
    expect(beginnerRun.metrics[0].clearTimeSec).toBeLessThan(480);
    expect(beginnerRun.metrics[0].maxGapBetweenPurchasesSec).toBeLessThan(30);

    const veteranFullCity = runEconomyBot({
      policy: 'geared_veteran',
      targetRestaurants: getCityByNumber(1).city.restaurantIds.length,
      maxSecondsPerRestaurant: 600,
      seed: 4242,
    });
    expect(veteranFullCity.citiesCompleted).toBe(1);
  });
});

describe('Station speed milestones & readable cook timers', () => {
  it('alternates Speed ×2 / Profit ×2 milestones and halves cook time on each Speed milestone', async () => {
    const econ = await import('@/engine/economy/economy');
    const { BALANCE } = await import('@/engine/economy/balanceConfig');
    const { getRestaurantTemplate } = await import('@/data/restaurants');
    const tpl = getRestaurantTemplate('citrus_press');
    const stnTpl = tpl.stations[0];
    const maxLv = 250;

    expect(econ.getNextMilestoneReward(1, maxLv)).toEqual({ level: 10, kind: 'speed' });
    expect(econ.getNextMilestoneReward(10, maxLv)).toEqual({ level: 25, kind: 'profit' });
    expect(econ.getNextMilestoneReward(25, maxLv)).toEqual({ level: 50, kind: 'speed' });

    const mk = (level: number) => ({ index: 0, unlocked: true, level, machines: 1, speedMultiplier: 1, profitMultiplier: 1 }) as never;
    const t1 = econ.getStationCookSeconds(stnTpl, mk(1), maxLv, 1);
    const t10 = econ.getStationCookSeconds(stnTpl, mk(10), maxLv, 1);
    const t25 = econ.getStationCookSeconds(stnTpl, mk(25), maxLv, 1);
    const t50 = econ.getStationCookSeconds(stnTpl, mk(50), maxLv, 1);
    // Several seconds per dish at level 1, then visibly faster at Speed milestones only
    expect(t1).toBeGreaterThanOrEqual(3);
    expect(t1).toBeCloseTo(stnTpl.basePrepTime, 5);
    expect(t10).toBeCloseTo(t1 / BALANCE.MILESTONE_SPEED_MULTIPLIER, 5);
    expect(t25).toBeCloseTo(t10, 5);
    expect(t50).toBeCloseTo(t10 / BALANCE.MILESTONE_SPEED_MULTIPLIER, 5);

    // Profit only doubles on Profit milestones
    const p9 = econ.getStationBaseDishProfit(stnTpl, mk(9), maxLv, 1, 1);
    const p10 = econ.getStationBaseDishProfit(stnTpl, mk(10), maxLv, 1, 1);
    const p24 = econ.getStationBaseDishProfit(stnTpl, mk(24), maxLv, 1, 1);
    const p25 = econ.getStationBaseDishProfit(stnTpl, mk(25), maxLv, 1, 1);
    const growth = BALANCE.STATION_PROFIT_GROWTH;
    expect(p10.div(p9).toNumber()).toBeCloseTo(growth, 3);
    expect(p25.div(p24).toNumber()).toBeCloseTo(growth * BALANCE.MILESTONE_MULTIPLIER_PER_THRESHOLD, 3);
  });
});
