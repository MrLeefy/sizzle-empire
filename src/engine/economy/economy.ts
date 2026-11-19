import type {
  BuyMode,
  ComputedStats,
  RestaurantRuntimeState,
  RestaurantTemplate,
  RestaurantUpgradeTemplate,
  StationState,
  StationTemplate,
} from '@/types/game';
import { BALANCE } from './balanceConfig';
import { Decimal, d } from './bigNumber';

/**
 * Smooth city difficulty multiplier supporting infinite prestige cycles (City 1..60..600+).
 * Early cities ramp gently; post-City-25 transitions to sustainable exponential growth
 * so permanent gear/vault upgrades remain deeply impactful without unwinnable walls.
 */
export function getCityCostMultiplier(cityNumber: number): Decimal {
  const c = Math.max(1, Math.floor(cityNumber));
  if (c === 1) return new Decimal(1);
  const earlySteps = Math.min(c - 1, 24);
  const lateSteps = Math.max(0, c - 25);
  return Decimal.pow(BALANCE.CITY_COST_EXPONENT_EARLY, earlySteps).mul(
    Decimal.pow(BALANCE.CITY_COST_EXPONENT_LATE, lateSteps),
  );
}

export function getCityRevenueMultiplier(cityNumber: number): Decimal {
  const c = Math.max(1, Math.floor(cityNumber));
  return Decimal.pow(BALANCE.CITY_REVENUE_SCALE_PER_CITY, c - 1);
}

export function getStationMaxLevel(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
): number {
  return runtime.stationMaxLevelOverride ?? template.maxStationLevel;
}

export function getStationMilestones(maxLevel: number): number[] {
  return BALANCE.MILESTONE_LEVELS.filter((m) => m <= maxLevel);
}

export function countPassedMilestones(level: number, maxLevel: number): number {
  let count = 0;
  for (const m of BALANCE.MILESTONE_LEVELS) {
    if (m <= maxLevel && level >= m) count++;
  }
  return count;
}

export function getNextMilestone(level: number, maxLevel: number): number | null {
  for (const m of BALANCE.MILESTONE_LEVELS) {
    if (m <= maxLevel && level < m) return m;
  }
  return null;
}

export function getPreviousMilestone(level: number, maxLevel: number): number {
  let prev = 0;
  for (const m of BALANCE.MILESTONE_LEVELS) {
    if (m <= maxLevel && level >= m) prev = m;
  }
  return prev;
}

export function getStationUnlockCost(
  stationTpl: StationTemplate,
  cityNumber: number,
  difficultyMult = 1,
): Decimal {
  if (stationTpl.baseUnlockCost <= 0) return new Decimal(0);
  return d(stationTpl.baseUnlockCost)
    .mul(getCityCostMultiplier(cityNumber))
    .mul(difficultyMult)
    .ceil();
}

/**
 * Cost to level a station from `currentLevel` to `currentLevel + 1`.
 */
export function getStationSingleUpgradeCost(
  stationTpl: StationTemplate,
  currentLevel: number,
  cityNumber: number,
  difficultyMult = 1,
): Decimal {
  const lv = Math.max(1, currentLevel);
  return d(stationTpl.baseUpgradeCost)
    .mul(getCityCostMultiplier(cityNumber))
    .mul(difficultyMult)
    .mul(Decimal.pow(BALANCE.STATION_COST_GROWTH, lv - 1))
    .ceil();
}

/**
 * Exact geometric-series total cost to buy `count` levels starting at `currentLevel`.
 * Never uses approximate floating-point sums that could cause negative cash or overflow.
 */
export function getStationBulkUpgradeCost(
  stationTpl: StationTemplate,
  currentLevel: number,
  count: number,
  maxLevel: number,
  cityNumber: number,
  difficultyMult = 1,
): { levelsToBuy: number; totalCost: Decimal } {
  const remaining = Math.max(0, maxLevel - currentLevel);
  const n = Math.min(Math.max(0, Math.floor(count)), remaining);
  if (n <= 0) return { levelsToBuy: 0, totalCost: new Decimal(0) };

  const firstCost = d(stationTpl.baseUpgradeCost)
    .mul(getCityCostMultiplier(cityNumber))
    .mul(difficultyMult)
    .mul(Decimal.pow(BALANCE.STATION_COST_GROWTH, Math.max(0, currentLevel - 1)));

  if (n === 1) {
    return { levelsToBuy: 1, totalCost: firstCost.ceil() };
  }

  const r = new Decimal(BALANCE.STATION_COST_GROWTH);
  const sum = firstCost.mul(Decimal.pow(r, n).sub(1)).div(r.sub(1)).ceil();
  return { levelsToBuy: n, totalCost: sum };
}

/**
 * Exact maximum affordable levels using closed-form logarithm + safe boundary adjustment.
 * Guarantees `totalCost <= availableCash` strictly.
 */
export function getMaxAffordableStationLevels(
  stationTpl: StationTemplate,
  currentLevel: number,
  maxLevel: number,
  availableCash: Decimal,
  cityNumber: number,
  difficultyMult = 1,
): { levelsToBuy: number; totalCost: Decimal } {
  const remaining = Math.max(0, maxLevel - currentLevel);
  if (remaining <= 0 || availableCash.lte(0)) {
    return { levelsToBuy: 0, totalCost: new Decimal(0) };
  }

  const first = getStationSingleUpgradeCost(stationTpl, currentLevel, cityNumber, difficultyMult);
  if (availableCash.lt(first)) {
    return { levelsToBuy: 0, totalCost: new Decimal(0) };
  }

  const r = BALANCE.STATION_COST_GROWTH;
  // Geometric series inverse: n = floor(log_r(1 + cash * (r - 1) / firstCost))
  const ratio = availableCash.mul(r - 1).div(first).add(1);
  let n = Math.min(remaining, Math.max(1, Math.floor(ratio.log10() / Math.log10(r))));

  // Verify exact bounds so rounding never overspends or undershoots by 1
  let calc = getStationBulkUpgradeCost(stationTpl, currentLevel, n, maxLevel, cityNumber, difficultyMult);
  while (n > 0 && calc.totalCost.gt(availableCash)) {
    n--;
    calc = getStationBulkUpgradeCost(stationTpl, currentLevel, n, maxLevel, cityNumber, difficultyMult);
  }
  while (n < remaining) {
    const next = getStationBulkUpgradeCost(stationTpl, currentLevel, n + 1, maxLevel, cityNumber, difficultyMult);
    if (next.totalCost.lte(availableCash)) {
      n++;
      calc = next;
    } else {
      break;
    }
  }
  return calc;
}

export function resolveStationPurchasePlan(
  stationTpl: StationTemplate,
  station: StationState,
  maxLevel: number,
  availableCash: Decimal,
  buyMode: BuyMode,
  cityNumber: number,
  difficultyMult = 1,
): { isUnlock: boolean; levelsToBuy: number; totalCost: Decimal; canAfford: boolean } {
  if (!station.unlocked) {
    const unlockCost = getStationUnlockCost(stationTpl, cityNumber, difficultyMult);
    return {
      isUnlock: true,
      levelsToBuy: 1,
      totalCost: unlockCost,
      canAfford: availableCash.gte(unlockCost),
    };
  }

  if (station.level >= maxLevel) {
    return { isUnlock: false, levelsToBuy: 0, totalCost: new Decimal(0), canAfford: false };
  }

  if (buyMode === 'max') {
    const maxPlan = getMaxAffordableStationLevels(
      stationTpl,
      station.level,
      maxLevel,
      availableCash,
      cityNumber,
      difficultyMult,
    );
    if (maxPlan.levelsToBuy > 0) {
      return { isUnlock: false, ...maxPlan, canAfford: true };
    }
    const one = getStationBulkUpgradeCost(stationTpl, station.level, 1, maxLevel, cityNumber, difficultyMult);
    return { isUnlock: false, levelsToBuy: 1, totalCost: one.totalCost, canAfford: false };
  }

  const desired = Number(buyMode);
  const bulk = getStationBulkUpgradeCost(
    stationTpl,
    station.level,
    desired,
    maxLevel,
    cityNumber,
    difficultyMult,
  );
  return {
    isUnlock: false,
    levelsToBuy: bulk.levelsToBuy,
    totalCost: bulk.totalCost,
    canAfford: bulk.levelsToBuy > 0 && availableCash.gte(bulk.totalCost),
  };
}

/**
 * Scaled cost of a one-time restaurant upgrade.
 */
export function getRestaurantUpgradeCost(
  upgrade: RestaurantUpgradeTemplate,
  cityNumber: number,
  difficultyMult = 1,
): Decimal {
  return d(upgrade.cost)
    .mul(getCityCostMultiplier(cityNumber))
    .mul(difficultyMult)
    .ceil();
}

/**
 * Base dish profit for a station at its current level (including station milestones
 * and restaurant-specific profit upgrades, before global/quality/customer multipliers).
 */
export function getStationBaseDishProfit(
  stationTpl: StationTemplate,
  station: StationState,
  maxLevel: number,
  cityNumber: number,
  restaurantGlobalProfitMult: number,
): Decimal {
  const lv = Math.max(1, station.level);
  const milestonesPassed = countPassedMilestones(lv, maxLevel);
  const milestoneMult = Decimal.pow(BALANCE.MILESTONE_MULTIPLIER_PER_THRESHOLD, milestonesPassed);

  return d(stationTpl.baseRevenue)
    .mul(getCityRevenueMultiplier(cityNumber))
    .mul(Decimal.pow(BALANCE.STATION_PROFIT_GROWTH, lv - 1))
    .mul(milestoneMult)
    .mul(Math.max(1, station.profitMultiplier))
    .mul(Math.max(1, restaurantGlobalProfitMult));
}

/**
 * Complete Dish Payout Pipeline:
 * stationBaseProfit * totalGlobalProfitMultiplier * qualityMult * doubleMult * goldenMult * deliveryPetMult
 */
export function calculateDishPayout(params: {
  stationBaseProfit: Decimal;
  stats: ComputedStats;
  quality: 'normal' | 'perfect' | 'divine';
  isDouble: boolean;
  isGolden: boolean;
  deliveryPetMult: number;
}): Decimal {
  let payout = params.stationBaseProfit.mul(params.stats.totalGlobalProfitMultiplier);

  if (params.quality === 'divine') {
    payout = payout.mul(BALANCE.DIVINE_DISH_MULTIPLIER * (1 + params.stats.divineValueBonus));
  } else if (params.quality === 'perfect') {
    payout = payout.mul(BALANCE.PERFECT_DISH_MULTIPLIER * (1 + params.stats.perfectValueBonus));
  }

  if (params.isDouble) {
    payout = payout.mul(BALANCE.DOUBLE_DISH_MULTIPLIER);
  }

  if (params.isGolden) {
    payout = payout.mul(BALANCE.GOLDEN_CUSTOMER_MULTIPLIER);
  }

  if (params.deliveryPetMult > 1) {
    payout = payout.mul(params.deliveryPetMult);
  }

  return payout.ceil();
}

/**
 * Analytical expected Restaurant Earnings Per Second (EPS) used for:
 * 1) Instant offline earnings calculation (no multi-thousand frame replay)
 * 2) Tip value (50s of offline earnings * Piggy)
 * 3) VIP Investor cash offers
 */
export function computeAnalyticalOfflineEps(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
  stats: ComputedStats,
  cityNumber: number,
): Decimal {
  const maxLv = getStationMaxLevel(template, runtime);
  let totalThroughputPerSec = new Decimal(0);
  let unlockedCount = 0;

  const activeWorkers = Math.max(1, 1 + runtime.chefCount + Math.floor(runtime.waiterCount * 0.5));
  const avgCookSpeed = Math.max(0.5, runtime.cookSpeedMult * (0.5 + stats.playerCookSpeedMult * 0.5));
  const avgWalkSec = Math.max(0.45, 2.2 / Math.max(0.5, runtime.workerSpeedMult * stats.workerWalkSpeedMult));

  for (let i = 0; i < runtime.stations.length; i++) {
    const stn = runtime.stations[i];
    if (!stn.unlocked) continue;
    unlockedCount++;
    const tpl = template.stations[i];
    const baseDish = getStationBaseDishProfit(
      tpl,
      stn,
      maxLv,
      cityNumber,
      runtime.globalProfitMult,
    );
    const effectivePrep = Math.max(0.15, (tpl.basePrepTime / (avgCookSpeed * stn.speedMultiplier)) * (1 - stats.workerInstantCookChance * 0.6));
    const cycleSec = effectivePrep + avgWalkSec;
    const dishPerSec = Math.min(activeWorkers, stn.machines + 0.5) / cycleSec;
    totalThroughputPerSec = totalThroughputPerSec.add(baseDish.mul(dishPerSec));
  }

  if (unlockedCount === 0) return new Decimal(0);

  // Average over unlocked dishes, multiplied by All Profit + Club (offline earnings intentionally exclude active-only ad boost)
  const avgStationEps = totalThroughputPerSec.div(Math.sqrt(unlockedCount));
  return avgStationEps
    .mul(stats.allProfitMultiplier)
    .mul(stats.vroombaMultiplier)
    .mul(stats.clubMultiplier)
    .mul(0.55); // offline base efficiency factor before Knife Vault
}

export function calculateOfflineEarnings(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
  stats: ComputedStats,
  cityNumber: number,
  elapsedSeconds: number,
): { clampedSeconds: number; earnings: Decimal } {
  const clampedSeconds = Math.max(0, Math.min(elapsedSeconds, stats.offlineMaxSeconds));
  if (clampedSeconds < 15) {
    return { clampedSeconds: 0, earnings: new Decimal(0) };
  }
  const eps = computeAnalyticalOfflineEps(template, runtime, stats, cityNumber);
  const earnings = eps.mul(clampedSeconds).mul(stats.offlineIncomeMult).ceil();
  return { clampedSeconds, earnings };
}

/**
 * Tip value = 50 seconds of offline earnings * Vault Golden Piggy multiplier.
 * Scales with All Profit, never inflated by Divine/Golden/Delivery multipliers.
 */
export function calculateTipValue(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
  stats: ComputedStats,
  cityNumber: number,
): Decimal {
  const offlineEps = computeAnalyticalOfflineEps(template, runtime, stats, cityNumber);
  const raw = offlineEps.mul(BALANCE.TIP_OFFLINE_SECONDS_EQUIVALENT).mul(stats.tipValueMult);
  return raw.lt(1) ? new Decimal(1) : raw.ceil();
}

export function isRestaurantComplete(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
): boolean {
  const maxLv = getStationMaxLevel(template, runtime);
  return runtime.stations.every((s) => s.unlocked && s.level >= maxLv);
}

export function getRestaurantCompletionPercent(
  template: RestaurantTemplate,
  runtime: RestaurantRuntimeState,
): number {
  const maxLv = getStationMaxLevel(template, runtime);
  const totalRequired = runtime.stations.length * maxLv;
  if (totalRequired <= 0) return 100;
  let current = 0;
  for (const s of runtime.stations) {
    if (s.unlocked) current += Math.min(maxLv, s.level);
  }
  return Math.min(100, (current / totalRequired) * 100);
}
