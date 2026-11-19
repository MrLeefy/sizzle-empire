import { GameController } from '../src/engine/GameController';
import { createNewGameSave } from '../src/engine/persistence/saveSchema';
import { createGearInstance } from '../src/engine/meta/equipment';
import { createPetInstance } from '../src/engine/meta/pets';
import { d, formatMoney } from '../src/engine/economy/bigNumber';
import {
  getRestaurantUpgradeCost,
  getStationMaxLevel,
  isRestaurantComplete,
  resolveStationPurchasePlan,
} from '../src/engine/economy/economy';
import { getCityByNumber } from '../src/data/cities';

export type BotPolicy = 'balanced' | 'tall' | 'first_last' | 'geared_veteran';

export interface RestaurantSimMetric {
  cityNumber: number;
  stageIndex: number;
  restaurantName: string;
  tier: string;
  clearTimeSec: number;
  maxGapBetweenPurchasesSec: number;
  ordersServed: number;
  finalCash: string;
  completed: boolean;
}

export interface BotRunSummary {
  policy: BotPolicy;
  restaurantsCleared: number;
  citiesCompleted: number;
  totalSimSeconds: number;
  metrics: RestaurantSimMetric[];
}

/**
 * Headless deterministic multi-city economy simulator.
 * Runs real fixed-timestep simulation (no faked shortcuts) with configurable
 * player upgrade strategies to verify pacing, unlock rhythm, and long-term scaling.
 */
export function runEconomyBot(options: {
  policy: BotPolicy;
  targetRestaurants: number;
  maxSecondsPerRestaurant: number;
  startCity?: number;
  seed?: number;
}): BotRunSummary {
  const save = createNewGameSave(options.seed ?? 0x42c0ffee, 1_700_000_000_000);
  if (options.startCity && options.startCity > 1) {
    save.cityNumber = options.startCity;
    save.restaurantStageIndex = 0;
  }

  // Equip realistic veteran gear & delivery pet for the geared_veteran test profile
  if (options.policy === 'geared_veteran') {
    const head = createGearInstance('u_head_astro', false);
    head.level = 20;
    const body = createGearInstance('l_body_blackbelt', false);
    body.level = 20;
    const hand1 = createGearInstance('u_hand_ray', false);
    hand1.level = 20;
    const hand2 = createGearInstance('u_hand_sceptre', false);
    hand2.level = 20;
    const panda = createPetInstance('pet_panda', 'legendary');
    panda.level = 20;

    save.inventory.push(head, body, hand1, hand2);
    save.equipped.head = head.instanceId;
    save.equipped.body = body.instanceId;
    save.equipped.hand1 = hand1.instanceId;
    save.equipped.hand2 = hand2.instanceId;
    save.pets.push(panda);
    save.equippedPetIds = [panda.instanceId, null];
    save.vault.unlockedIds = ['quick_register', 'swift_floor', 'starter_check', 'boost_amp'];
    save.vault.levels = { quick_register: 10, swift_floor: 15, starter_check: 10, boost_amp: 15 };
  }

  const controller = new GameController(save);
  const metrics: RestaurantSimMetric[] = [];
  let totalSimSeconds = 0;
  let restaurantsCleared = 0;
  let citiesCompleted = 0;

  const DT = 0.1; // fast deterministic step matching physics stability

  for (let r = 0; r < options.targetRestaurants; r++) {
    const template = controller.getActiveTemplate();
    const cityNum = controller.save.cityNumber;
    const stageIdx = controller.save.restaurantStageIndex;
    let elapsed = 0;
    let lastPurchaseAt = 0;
    let maxGap = 0;

    while (elapsed < options.maxSecondsPerRestaurant) {
      controller.stepSimulationFixed(DT, 1_700_000_000_000 + Math.floor((totalSimSeconds + elapsed) * 1000));
      elapsed += DT;

      // Bot decision every 0.5s
      if (Math.floor(elapsed * 2) !== Math.floor((elapsed - DT) * 2)) {
        const bought = performBotPurchases(controller, options.policy);
        if (bought) {
          maxGap = Math.max(maxGap, elapsed - lastPurchaseAt);
          lastPurchaseAt = elapsed;
        }
      }

      if (isRestaurantComplete(template, controller.save.mainRestaurant)) {
        break;
      }
    }

    const completed = isRestaurantComplete(template, controller.save.mainRestaurant);
    metrics.push({
      cityNumber: cityNum,
      stageIndex: stageIdx,
      restaurantName: template.name,
      tier: template.tier,
      clearTimeSec: Number(elapsed.toFixed(1)),
      maxGapBetweenPurchasesSec: Number(maxGap.toFixed(1)),
      ordersServed: controller.save.mainRestaurant.dishesServedHere,
      finalCash: formatMoney(controller.save.mainRestaurant.cash),
      completed,
    });
    totalSimSeconds += elapsed;

    if (completed) {
      restaurantsCleared++;
      const summary = controller.renovateMainRestaurant();
      if (summary?.isCityFlight) citiesCompleted++;
    } else {
      break;
    }
  }

  return {
    policy: options.policy,
    restaurantsCleared,
    citiesCompleted,
    totalSimSeconds: Number(totalSimSeconds.toFixed(1)),
    metrics,
  };
}

function performBotPurchases(controller: GameController, policy: BotPolicy): boolean {
  const runtime = controller.save.mainRestaurant;
  const tpl = controller.getActiveTemplate();
  const maxLv = getStationMaxLevel(tpl, runtime);
  const cityNum = controller.save.cityNumber;
  let boughtAny = false;

  // 1. Buy affordable one-time restaurant upgrades first
  for (const upg of tpl.upgrades) {
    if (runtime.purchasedUpgradeIds.includes(upg.id)) continue;
    if (upg.stationIndex !== undefined && !runtime.stations[upg.stationIndex]?.unlocked) continue;
    const cost = getRestaurantUpgradeCost(upg, cityNum, runtime.difficultyMultiplier);
    if (d(runtime.cash).gte(cost)) {
      if (controller.purchaseRestaurantUpgrade(upg.id)) boughtAny = true;
    }
  }

  // 2. Station buying according to strategy
  if (policy === 'tall') {
    for (let i = 0; i < runtime.stations.length; i++) {
      const s = runtime.stations[i];
      if (!s.unlocked) {
        // Only unlock next station once previous is maxed
        if (i === 0 || runtime.stations[i - 1].level >= maxLv) {
          if (controller.purchaseStation(i, '1')) boughtAny = true;
        }
        break;
      }
      if (s.level < maxLv) {
        if (controller.purchaseStation(i, 'max')) boughtAny = true;
        break;
      }
    }
  } else if (policy === 'first_last' || policy === 'geared_veteran') {
    // Prioritize highest unlocked station, plus unlock last affordable station
    for (let i = runtime.stations.length - 1; i >= 0; i--) {
      const s = runtime.stations[i];
      if (!s.unlocked) {
        const plan = resolveStationPurchasePlan(
          tpl.stations[i],
          s,
          maxLv,
          d(runtime.cash),
          '1',
          cityNum,
          runtime.difficultyMultiplier,
        );
        if (plan.canAfford && controller.purchaseStation(i, '1')) boughtAny = true;
      } else if (s.level < maxLv) {
        if (controller.purchaseStation(i, 'max')) boughtAny = true;
      }
    }
  } else {
    // Balanced / Beginner: buy cheapest available station unlock or upgrade
    for (let i = 0; i < runtime.stations.length; i++) {
      const s = runtime.stations[i];
      if (s.unlocked && s.level >= maxLv) continue;
      if (controller.purchaseStation(i, s.unlocked ? 'max' : '1')) boughtAny = true;
    }
  }

  return boughtAny;
}

// CLI entry point: `npm run sim:economy`
const isDirectCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('simulate-economy.ts');

if (isDirectCli) {
  console.log('=== SIZZLE EMPIRE HEADLESS ECONOMY BALANCE REPORT ===\n');
  const runs: Array<{ label: string; opts: Parameters<typeof runEconomyBot>[0] }> = [
    { label: 'Beginner Balanced (City 1, first 3 venues)', opts: { policy: 'balanced', targetRestaurants: 3, maxSecondsPerRestaurant: 900 } },
    { label: 'Tall Method (City 1, first 3 venues)', opts: { policy: 'tall', targetRestaurants: 3, maxSecondsPerRestaurant: 900 } },
    { label: 'Geared Veteran (Full City 1 -> City 2 Flight!)', opts: { policy: 'geared_veteran', targetRestaurants: getCityByNumber(1).city.restaurantIds.length + 1, maxSecondsPerRestaurant: 900 } },
    { label: 'Geared Veteran (City 15 Mid-Game Check)', opts: { policy: 'geared_veteran', startCity: 15, targetRestaurants: 3, maxSecondsPerRestaurant: 900 } },
  ];

  for (const r of runs) {
    const res = runEconomyBot(r.opts);
    console.log(`--- ${r.label} ---`);
    console.log(
      `Cleared: ${res.restaurantsCleared}/${r.opts.targetRestaurants} | Cities Completed: ${res.citiesCompleted} | Total Sim Time: ${res.totalSimSeconds}s`,
    );
    for (const m of res.metrics) {
      console.log(
        `  City ${m.cityNumber} #${m.stageIndex + 1} ${m.restaurantName} [${m.tier}]: ${m.completed ? 'CLEAR' : 'TIMEOUT'} in ${m.clearTimeSec}s | Max Buy Gap: ${m.maxGapBetweenPurchasesSec}s | Orders: ${m.ordersServed} | End Cash: ${m.finalCash}`,
      );
    }
    console.log('');
  }
}
