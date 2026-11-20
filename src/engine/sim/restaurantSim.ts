import type {
  ActivePetEntity,
  ComputedStats,
  CustomerEntity,
  FloatingFeedback,
  OrderItem,
  PetInstance,
  RestaurantLayout,
  RestaurantRuntimeState,
  RestaurantTemplate,
  StationState,
  Vec2,
  WorkerEntity,
  WorkerRole,
} from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { d, formatMoney, serializeDecimal } from '@/engine/economy/bigNumber';
import {
  calculateDishPayout,
  calculateTipValue,
  computeAnalyticalOfflineEps,
  getStationBaseDishProfit,
  getStationCookSeconds,
  getStationMaxLevel,
} from '@/engine/economy/economy';
import { PET_SPECIES_BY_ID } from '@/data/pets';
import { SeededRNG } from '@/engine/rng';
import { buildRestaurantLayout } from './layoutBuilder';
import { RestaurantPathfinder, computeSeparationOffset } from './pathfinding';

export interface SimCallbacks {
  onDishDelivered?: (info: {
    stationIndex: number;
    payout: string;
    quality: 'normal' | 'perfect' | 'divine';
    isDouble: boolean;
    isGolden: boolean;
    isInstant: boolean;
    deliveredByPet: boolean;
    ingredientId?: string;
  }) => void;
  onTipCollected?: (info: { amount: string; byPet: boolean }) => void;
  onSound?: (
    sfx:
      | 'coin'
      | 'perfect'
      | 'divine'
      | 'tip'
      | 'order'
      | 'sizzle'
      | 'instant_cook'
      | 'customer_happy',
  ) => void;
}

const CUSTOMER_SHIRT_COLORS = [
  '#f97316',
  '#38bdf8',
  '#ec4899',
  '#22c55e',
  '#a855f7',
  '#eab308',
  '#ef4444',
  '#14b8a6',
];
const CUSTOMER_HAIR_COLORS = ['#1e293b', '#78350f', '#d97706', '#475569', '#9a3412'];

/** Customers move this much faster on the outdoor sidewalk leg of their walk. */
const SIDEWALK_SPEED_MULT = 2.0;

/** Deterministic -1 / +1 sidewalk side from an entity id (never consumes the seeded RNG). */
export function sidewalkSideForId(id: string): -1 | 1 {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? -1 : 1;
}

let entitySeq = 1;
function nextEntityId(prefix: string): string {
  entitySeq = (entitySeq + 1) % 100_000_000;
  return `${prefix}_${entitySeq}`;
}

export function createInitialRestaurantRuntime(params: {
  template: RestaurantTemplate;
  cityNumber: number;
  restaurantStageIndex: number;
  startingCash: number;
  modeContext?: RestaurantRuntimeState['modeContext'];
  difficultyMultiplier?: number;
  stationMaxLevelOverride?: number;
  ignoreGear?: boolean;
  equippedPets?: PetInstance[];
}): { runtime: RestaurantRuntimeState; layout: RestaurantLayout } {
  const { template, cityNumber, restaurantStageIndex } = params;
  const layout = buildRestaurantLayout(template);

  const stations: StationState[] = template.stations.map((stTpl, index) => {
    const pos = layout.stationPositions[index] ?? { x: 0, z: -2 };
    const workSpots: Vec2[] = [
      { x: pos.x, z: pos.z + 1.05 },
      { x: pos.x - 0.75, z: pos.z + 1.05 },
      { x: pos.x + 0.75, z: pos.z + 1.05 },
      { x: pos.x, z: pos.z - 1.05 },
    ];
    return {
      index,
      templateId: stTpl.id,
      unlocked: index === 0,
      level: index === 0 ? 1 : 0,
      machines: stTpl.initialMachines,
      profitMultiplier: 1,
      speedMultiplier: 1,
      milestonesClaimed: 0,
      occupiedByWorkerIds: [],
      worldPos: { ...pos },
      workSpots,
    };
  });

  const playerHome = layout.chefHomePositions[0] ?? { x: 0, z: 0 };
  const workers: WorkerEntity[] = [
    createWorker('player', 'You (Head Chef)', playerHome, '#ffffff', null),
  ];

  for (let w = 0; w < template.initialWaiters; w++) {
    const home = layout.waiterHomePositions[w] ?? { x: 0, z: 1.5 };
    workers.push(createWorker('waiter', `Server ${w + 1}`, home, '#0ea5e9', null));
  }
  for (let c = 0; c < template.initialCashiers; c++) {
    const home = layout.waiterHomePositions[c] ?? { x: 0, z: 1.0 };
    workers.push(createWorker('cashier', `Cashier ${c + 1}`, home, '#10b981', null));
  }

  const pets = buildActivePetEntities(params.equippedPets ?? [], playerHome);

  const runtime: RestaurantRuntimeState = {
    templateId: template.id,
    cityIndex: (Math.max(1, cityNumber) - 1) % 60,
    cityLoop: Math.floor((Math.max(1, cityNumber) - 1) / 60),
    restaurantStageIndex,
    cash: serializeDecimal(d(Math.max(0, params.startingCash))),
    totalCashEarnedHere: '0',
    stations,
    purchasedUpgradeIds: [],
    customerCapacity: template.initialCustomerCap,
    tableCount: template.archetype === 'cafe_tables' || template.archetype === 'waiter_dining' || template.archetype === 'grand_hall' ? 2 : 0,
    chefCount: 0,
    waiterCount: template.initialWaiters,
    cashierCount: template.initialCashiers,
    workerSpeedMult: 1,
    cookSpeedMult: 1,
    globalProfitMult: 1,
    customers: [],
    workers,
    pets,
    tips: [],
    orders: [],
    floatingFeedback: [],
    simTime: 0,
    spawnTimer: 0.02,
    dishesServedHere: 0,
    startedAtMs: Date.now(),
    hiredAnyStaffHere: false,
    popularDishStationIndex: null,
    popularDishEndsAt: 0,
    popularDishCooldownEndsAt: 0,
    helperCooldownEndsAt: 0,
    investorAvailable: false,
    investorKind: 'cash',
    investorOfferValue: '0',
    investorCooldownTimer: 22,
    investorExpiresTimer: 0,
    deliveryContractAvailable: false,
    deliveryContractStationIndex: 0,
    deliveryContractQty: 3,
    deliveryContractReward: '0',
    deliveryContractCooldownTimer: 35,
    recentEarningsWindow: [],
    estimatedEps: '0',
    modeContext: params.modeContext ?? 'main',
    difficultyMultiplier: params.difficultyMultiplier ?? 1,
    stationMaxLevelOverride: params.stationMaxLevelOverride,
    ignoreGear: params.ignoreGear ?? false,
  };

  return { runtime, layout };
}

export function createWorker(
  role: WorkerRole,
  name: string,
  homePos: Vec2,
  shirtColor: string,
  expiresAtSimTime: number | null,
): WorkerEntity {
  return {
    id: role === 'player' ? 'worker_player' : nextEntityId(role),
    role,
    name,
    status: 'idle',
    pos: { ...homePos },
    prevPos: { ...homePos },
    targetPos: { ...homePos },
    path: [],
    facing: 0,
    homePos: { ...homePos },
    activeOrderId: null,
    activeCustomerId: null,
    activeStationIndex: null,
    activeMachineSlot: null,
    cookProgress: 0,
    cookDuration: 1,
    carryingDish: false,
    carryingDishColor: '#ffd166',
    carryingQuality: 'normal',
    shirtColor,
    expiresAtSimTime,
  };
}

export function buildActivePetEntities(
  equippedPets: PetInstance[],
  anchorPos: Vec2,
): ActivePetEntity[] {
  return equippedPets.map((pet, idx) => {
    const sp = PET_SPECIES_BY_ID[pet.speciesId];
    const startPos = { x: anchorPos.x + (idx === 0 ? -0.9 : 0.9), z: anchorPos.z + 0.5 };
    return {
      id: `active_pet_${idx}_${pet.instanceId}`,
      instanceId: pet.instanceId,
      speciesId: pet.speciesId,
      status: 'following',
      pos: { ...startPos },
      prevPos: { ...startPos },
      targetPos: { ...startPos },
      facing: 0,
      activeOrderId: null,
      activeTipId: null,
      tipCooldownTimer: 2,
      carryingDish: false,
      carryingQuality: 'normal',
      color: sp?.color ?? '#f59e0b',
      accentColor: sp?.accentColor ?? '#ffffff',
      deliveryMultiplier: sp?.deliveryMultiplier ?? 0,
      tipInterval: sp?.tipInterval ?? 0,
    };
  });
}

export class RestaurantSimulator {
  private pathfinder = new RestaurantPathfinder();
  private feedbackSeq = 1;
  private epsRecalcTimer = 0;

  resetPathCache(): void {
    this.pathfinder.clearCache();
  }

  /**
   * Synchronize layout slot occupancy and unlocked slots with current runtime state
   * (e.g., right after loading a saved game or purchasing a customer capacity upgrade).
   */
  syncLayoutSlots(runtime: RestaurantRuntimeState, layout: RestaurantLayout): void {
    for (let i = 0; i < layout.slots.length; i++) {
      layout.slots[i].unlocked = i < runtime.customerCapacity;
      layout.slots[i].occupiedByCustomerId = null;
    }
    for (const c of runtime.customers) {
      if (c.status !== 'leaving' && layout.slots[c.slotIndex]) {
        layout.slots[c.slotIndex].occupiedByCustomerId = c.id;
      }
    }
  }

  /**
   * Synchronize equipped pets live without disrupting the rest of the restaurant.
   */
  syncEquippedPets(runtime: RestaurantRuntimeState, equippedPets: PetInstance[]): void {
    const player = runtime.workers.find((w) => w.role === 'player');
    const anchor = player ? player.pos : { x: 0, z: 0 };
    const existingByInstance = new Map(runtime.pets.map((p) => [p.instanceId, p]));
    const nextPets: ActivePetEntity[] = [];

    for (let i = 0; i < equippedPets.length; i++) {
      const pet = equippedPets[i];
      const kept = existingByInstance.get(pet.instanceId);
      if (kept) {
        nextPets.push(kept);
      } else {
        const sp = PET_SPECIES_BY_ID[pet.speciesId];
        const offset = { x: anchor.x + (i === 0 ? -0.9 : 0.9), z: anchor.z + 0.5 };
        nextPets.push({
          id: `active_pet_${i}_${pet.instanceId}`,
          instanceId: pet.instanceId,
          speciesId: pet.speciesId,
          status: 'following',
          pos: { ...offset },
          prevPos: { ...offset },
          targetPos: { ...offset },
          facing: 0,
          activeOrderId: null,
          activeTipId: null,
          tipCooldownTimer: 2,
          carryingDish: false,
          carryingQuality: 'normal',
          color: sp?.color ?? '#f59e0b',
          accentColor: sp?.accentColor ?? '#ffffff',
          deliveryMultiplier: sp?.deliveryMultiplier ?? 0,
          tipInterval: sp?.tipInterval ?? 0,
        });
      }
    }

    // Release any orders held by unequipped pets so customers never get stuck
    const nextIds = new Set(nextPets.map((p) => p.id));
    for (const order of runtime.orders) {
      if (order.assignedPetId && !nextIds.has(order.assignedPetId) && order.status === 'delivering') {
        order.assignedPetId = null;
        order.deliveryPetMult = 1;
        order.status = 'ready_at_pass';
      }
    }

    runtime.pets = nextPets;
  }

  /**
   * Advances simulation by a fixed deterministic timestep `dt` (seconds, e.g., 1/30 or 1/20).
   */
  step(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    cityNumber: number,
    rng: SeededRNG,
    dt: number,
    callbacks?: SimCallbacks,
  ): void {
    const safeDt = Math.min(0.1, Math.max(0.001, dt));
    runtime.simTime += safeDt;

    // Clear expired popular dish
    if (runtime.popularDishStationIndex !== null && runtime.simTime >= runtime.popularDishEndsAt) {
      runtime.popularDishStationIndex = null;
    }

    // Ensure layout slots match capacity
    for (let i = 0; i < layout.slots.length; i++) {
      layout.slots[i].unlocked = i < runtime.customerCapacity;
    }

    // 1. Save previous positions for smooth render interpolation
    for (const c of runtime.customers) {
      c.prevPos.x = c.pos.x;
      c.prevPos.z = c.pos.z;
    }
    for (const w of runtime.workers) {
      w.prevPos.x = w.pos.x;
      w.prevPos.z = w.pos.z;
    }
    for (const p of runtime.pets) {
      p.prevPos.x = p.pos.x;
      p.prevPos.z = p.pos.z;
    }

    // 2. Clean up expired temporary Helpers safely
    this.cleanupExpiredHelpers(runtime);

    // 3. Spawn customers if unlocked slots are free
    this.updateCustomerSpawning(runtime, template, layout, stats, rng, safeDt);

    // 4. Update customers (walking, instant order check, exit cleanup)
    this.updateCustomers(runtime, template, layout, stats, rng, safeDt);

    // 5. Assign & update workers (cashiers, waiters, chefs, player, helpers)
    this.updateWorkers(runtime, template, layout, stats, cityNumber, rng, safeDt, callbacks);

    // 6. Update companion pets (delivery interception & tip sweeps)
    this.updatePets(runtime, template, layout, stats, cityNumber, safeDt, callbacks);

    // 7. Update floating visual feedback lifetimes
    for (let i = runtime.floatingFeedback.length - 1; i >= 0; i--) {
      const fb = runtime.floatingFeedback[i];
      fb.age += safeDt;
      if (fb.age >= fb.maxAge) {
        runtime.floatingFeedback.splice(i, 1);
      }
    }

    // 8. Update periodic VIP Investor & Delivery Contracts
    this.updateSideOffers(runtime, template, stats, cityNumber, rng, safeDt);

    // 9. Recompute smoothed EPS every 1.0s
    this.epsRecalcTimer += safeDt;
    if (this.epsRecalcTimer >= 1.0) {
      this.epsRecalcTimer = 0;
      const eps = computeAnalyticalOfflineEps(template, runtime, stats, cityNumber);
      runtime.estimatedEps = serializeDecimal(eps);
    }
  }

  private cleanupExpiredHelpers(runtime: RestaurantRuntimeState): void {
    for (let i = runtime.workers.length - 1; i >= 0; i--) {
      const w = runtime.workers[i];
      if (w.role === 'helper' && w.expiresAtSimTime !== null && runtime.simTime >= w.expiresAtSimTime) {
        this.releaseWorkerReservations(runtime, w);
        runtime.workers.splice(i, 1);
      }
    }
  }

  private releaseWorkerReservations(runtime: RestaurantRuntimeState, worker: WorkerEntity): void {
    if (worker.activeStationIndex !== null) {
      const stn = runtime.stations[worker.activeStationIndex];
      if (stn) {
        stn.occupiedByWorkerIds = stn.occupiedByWorkerIds.filter((id) => id !== worker.id);
      }
    }
    if (worker.activeCustomerId) {
      const cust = runtime.customers.find((c) => c.id === worker.activeCustomerId);
      if (cust && cust.orderTakenByWorkerId === worker.id) {
        cust.orderTakenByWorkerId = null;
        if (cust.status === 'ordering') cust.status = 'waiting_to_order';
      }
    }
    if (worker.activeOrderId) {
      const order = runtime.orders.find((o) => o.id === worker.activeOrderId);
      if (order && order.status !== 'delivered') {
        order.assignedWorkerId = null;
        order.status = order.status === 'delivering' && worker.carryingDish ? 'ready_at_pass' : 'queued';
      }
    }
    worker.activeOrderId = null;
    worker.activeCustomerId = null;
    worker.activeStationIndex = null;
    worker.activeMachineSlot = null;
    worker.carryingDish = false;
    worker.status = 'idle';
  }

  private updateCustomerSpawning(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    rng: SeededRNG,
    dt: number,
  ): void {
    const hasUnlockedStation = runtime.stations.some((s) => s.unlocked);
    if (!hasUnlockedStation) return;

    const activeCount = runtime.customers.filter((c) => c.status !== 'leaving').length;
    if (activeCount >= runtime.customerCapacity) return;

    runtime.spawnTimer -= dt;
    if (runtime.spawnTimer > 0) return;

    const freeSlots = layout.slots.filter((s) => s.unlocked && !s.occupiedByCustomerId);
    if (freeSlots.length === 0) return;

    const slot = rng.pick(freeSlots);
    const isGolden = rng.chance(stats.goldenCustomerChance);
    const isGreedy = rng.chance(stats.greedyCustomerChance);
    const custId = nextEntityId('cust');
    const isCar = slot.kind === 'drive_thru';

    // Pedestrians stroll in along the sidewalk from off-screen (left or right, deterministic by id
    // so the RNG stream — and therefore economy pacing — is untouched), then follow the door path.
    const indoorPath = this.pathfinder.findPath(layout.entrancePos, slot.customerPos, layout);
    let spawnPos: Vec2 = { ...layout.entrancePos };
    let entryPath = indoorPath;
    if (!isCar && layout.sidewalkLaneZ !== null) {
      const side = sidewalkSideForId(custId);
      spawnPos = { x: side * layout.offscreenX, z: layout.sidewalkLaneZ };
      entryPath = [
        { x: layout.entrancePos.x, z: layout.sidewalkLaneZ },
        { ...layout.entrancePos },
        ...indoorPath,
      ];
    }

    const customer: CustomerEntity = {
      id: custId,
      slotIndex: slot.index,
      isCar,
      isGolden,
      isGreedy,
      status: 'entering',
      pos: { ...spawnPos },
      prevPos: { ...spawnPos },
      targetPos: { ...slot.customerPos },
      path: entryPath,
      facing: 0,
      orderTakeProgress: 0,
      orderTakeDuration: BALANCE.BASE_ORDER_TAKE_TIME / Math.max(0.5, stats.registerSpeedMult),
      orderTakenByWorkerId: null,
      pendingOrders: [],
      deliveredCount: 0,
      totalOrderedCount: 0,
      reorderCount: 0,
      primaryDishIcon: template.stations[0].icon,
      shirtColor: isGolden ? '#facc15' : rng.pick(CUSTOMER_SHIRT_COLORS),
      hairColor: rng.pick(CUSTOMER_HAIR_COLORS),
      patienceTimer: 0,
    };

    slot.occupiedByCustomerId = customer.id;
    runtime.customers.push(customer);
    // Slightly faster spawning in bigger restaurants
    const capacityFactor = Math.max(0.4, 1 - runtime.customerCapacity * 0.04);
    runtime.spawnTimer = BALANCE.BASE_CUSTOMER_SPAWN_INTERVAL * capacityFactor;
  }

  private updateCustomers(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    rng: SeededRNG,
    dt: number,
  ): void {
    const walkSpeed = BALANCE.BASE_CUSTOMER_WALK_SPEED * stats.customerWalkMult;

    for (let i = runtime.customers.length - 1; i >= 0; i--) {
      const cust = runtime.customers[i];
      // Brisker stroll while outdoors on the sidewalk keeps the extra off-screen walk from
      // stretching service pacing.
      const onSidewalk =
        !cust.isCar &&
        layout.sidewalkLaneZ !== null &&
        cust.pos.z > layout.sidewalkLaneZ - 0.6;
      const speed = cust.isCar
        ? walkSpeed * 1.9
        : onSidewalk
          ? walkSpeed * SIDEWALK_SPEED_MULT
          : walkSpeed;

      if (cust.status === 'entering') {
        const arrived = this.advanceAlongPath(cust, speed, dt);
        if (arrived) {
          // Face toward counter/kitchen
          cust.facing = Math.PI;
          if (rng.chance(stats.instantOrderChance)) {
            this.createCustomerOrders(runtime, template, layout, cust, rng);
            cust.status = 'waiting_for_food';
          } else {
            cust.status = 'waiting_to_order';
          }
        }
      } else if (cust.status === 'waiting_to_order') {
        cust.patienceTimer += dt;
      } else if (cust.status === 'waiting_for_food') {
        cust.patienceTimer += dt;
      } else if (cust.status === 'leaving') {
        const arrived = this.advanceAlongPath(cust, speed, dt);
        if (arrived) {
          runtime.customers.splice(i, 1);
        }
      }
    }
  }

  private createCustomerOrders(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    cust: CustomerEntity,
    rng: SeededRNG,
  ): void {
    const unlocked = runtime.stations.filter((s) => s.unlocked);
    if (unlocked.length === 0) return;

    const dishQty = cust.isGreedy
      ? rng.int(BALANCE.GREEDY_ORDER_MIN, BALANCE.GREEDY_ORDER_MAX)
      : rng.int(BALANCE.NORMAL_ORDER_MIN, BALANCE.NORMAL_ORDER_MAX);

    const slot = layout.slots[cust.slotIndex];
    const servePos = slot ? { ...slot.servePos } : { ...cust.pos };

    // Choose primary station (with Popular Dish weighting!)
    const pickStation = (): StationState => {
      if (unlocked.length === 1) return unlocked[0];
      const popIdx = runtime.popularDishStationIndex;
      if (popIdx !== null && unlocked.some((s) => s.index === popIdx)) {
        const totalWeight = unlocked.length - 1 + BALANCE.POPULAR_DISH_WEIGHT_MULT;
        let roll = rng.next() * totalWeight;
        for (const s of unlocked) {
          const w = s.index === popIdx ? BALANCE.POPULAR_DISH_WEIGHT_MULT : 1;
          if (roll <= w) return s;
          roll -= w;
        }
      }
      return rng.pick(unlocked);
    };

    // Most of a customer's order shares 1–2 dishes for crisp visual readability
    const mainStn = pickStation();
    cust.primaryDishIcon = template.stations[mainStn.index]?.icon ?? '🍽️';
    cust.pendingOrders = [];
    cust.deliveredCount = 0;
    cust.totalOrderedCount = dishQty;

    for (let k = 0; k < dishQty; k++) {
      const chosen = k === 0 || rng.chance(0.7) ? mainStn : pickStation();
      const order: OrderItem = {
        id: nextEntityId('ord'),
        customerId: cust.id,
        stationIndex: chosen.index,
        status: 'queued',
        assignedWorkerId: null,
        assignedPetId: null,
        deliveryTargetPos: { ...servePos },
        quality: 'normal',
        isDouble: false,
        isGolden: cust.isGolden,
        deliveryPetMult: 1,
        isPlayerCooked: false,
      };
      cust.pendingOrders.push(order);
      runtime.orders.push(order);
    }
  }

  private updateWorkers(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    cityNumber: number,
    rng: SeededRNG,
    dt: number,
    callbacks?: SimCallbacks,
  ): void {
    const hasDedicatedWaiters = layout.usesWaiterPass && runtime.waiterCount > 0;

    for (const worker of runtime.workers) {
      const isPlayerLike = worker.role === 'player' || worker.role === 'helper';
      const walkSpeed =
        BALANCE.BASE_WORKER_WALK_SPEED *
        runtime.workerSpeedMult *
        (isPlayerLike ? stats.playerWalkSpeedMult : stats.workerWalkSpeedMult);

      if (worker.status === 'idle' || worker.status === 'returning_idle') {
        const assigned = this.assignTaskToWorker(
          runtime,
          template,
          layout,
          worker,
          hasDedicatedWaiters,
        );
        if (!assigned && worker.status === 'returning_idle') {
          const arrived = this.advanceAlongPath(worker, walkSpeed, dt, runtime.workers);
          if (arrived) worker.status = 'idle';
        }
        continue;
      }

      if (worker.status === 'walking_to_order') {
        const cust = runtime.customers.find((c) => c.id === worker.activeCustomerId);
        if (!cust || cust.status === 'leaving' || cust.status === 'waiting_for_food') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        const arrived = this.advanceAlongPath(worker, walkSpeed, dt, runtime.workers);
        if (arrived) {
          worker.status = 'taking_order';
          cust.status = 'ordering';
          cust.orderTakeProgress = 0;
          cust.orderTakeDuration =
            BALANCE.BASE_ORDER_TAKE_TIME / Math.max(0.5, stats.registerSpeedMult);
        }
      } else if (worker.status === 'taking_order') {
        const cust = runtime.customers.find((c) => c.id === worker.activeCustomerId);
        if (!cust || cust.status === 'leaving') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        cust.orderTakeProgress += dt / Math.max(0.08, cust.orderTakeDuration);
        if (cust.orderTakeProgress >= 1) {
          cust.orderTakeProgress = 1;
          cust.orderTakenByWorkerId = null;
          this.createCustomerOrders(runtime, template, layout, cust, rng);
          cust.status = 'waiting_for_food';
          callbacks?.onSound?.('order');
          worker.activeCustomerId = null;
          worker.status = 'idle';
        }
      } else if (worker.status === 'walking_to_station') {
        const order = runtime.orders.find((o) => o.id === worker.activeOrderId);
        const stn =
          worker.activeStationIndex !== null ? runtime.stations[worker.activeStationIndex] : null;
        if (!order || !stn || order.status === 'delivered') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        const arrived = this.advanceAlongPath(worker, walkSpeed, dt, runtime.workers);
        if (arrived) {
          // Begin cooking! Roll quality, double, and instant cook right here
          const instantChance = isPlayerLike
            ? stats.playerInstantCookChance
            : stats.workerInstantCookChance;
          const divineChance = isPlayerLike ? stats.playerDivineChance : stats.workerDivineChance;
          const perfectChance = isPlayerLike
            ? stats.playerPerfectChance
            : stats.workerPerfectChance;
          const doubleChance = isPlayerLike ? stats.playerDoubleChance : stats.workerDoubleChance;

          if (rng.chance(divineChance)) {
            order.quality = 'divine';
          } else if (rng.chance(perfectChance)) {
            order.quality = 'perfect';
          } else {
            order.quality = 'normal';
          }
          order.isDouble = rng.chance(doubleChance);
          order.isPlayerCooked = worker.role === 'player';

          const isInstant = rng.chance(instantChance);
          const stnTpl = template.stations[stn.index];
          const cookMult =
            runtime.cookSpeedMult *
            (isPlayerLike ? stats.playerCookSpeedMult : stats.workerCookSpeedMult);

          worker.cookDuration = isInstant
            ? 0
            : getStationCookSeconds(stnTpl, stn, getStationMaxLevel(template, runtime), cookMult);
          worker.cookProgress = isInstant ? 1 : 0;
          worker.carryingDishColor = stnTpl.color;
          worker.carryingQuality = order.quality;
          worker.status = 'cooking';
          order.status = 'cooking';

          // Check if an idle Delivery Pet can intercept a Player-cooked order!
          if (worker.role === 'player') {
            this.tryDispatchDeliveryPet(runtime, order, worker.pos);
          }

          if (isInstant) {
            callbacks?.onSound?.('instant_cook');
            this.finishCooking(
              runtime,
              template,
              layout,
              worker,
              order,
              stn,
              hasDedicatedWaiters,
              true,
            );
          } else {
            callbacks?.onSound?.('sizzle');
          }
        }
      } else if (worker.status === 'cooking') {
        const order = runtime.orders.find((o) => o.id === worker.activeOrderId);
        const stn =
          worker.activeStationIndex !== null ? runtime.stations[worker.activeStationIndex] : null;
        if (!order || !stn || order.status === 'delivered') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        worker.cookProgress += dt / Math.max(0.05, worker.cookDuration);
        if (worker.cookProgress >= 1) {
          worker.cookProgress = 1;
          this.finishCooking(
            runtime,
            template,
            layout,
            worker,
            order,
            stn,
            hasDedicatedWaiters,
            false,
          );
        }
      } else if (worker.status === 'walking_to_pass') {
        const order = runtime.orders.find((o) => o.id === worker.activeOrderId);
        if (!order || order.status === 'delivered') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        const arrived = this.advanceAlongPath(worker, walkSpeed, dt, runtime.workers);
        if (arrived) {
          if (worker.role === 'waiter') {
            // Waiter picked up ready dish from pass counter -> now deliver to customer
            worker.carryingDish = true;
            worker.carryingQuality = order.quality;
            worker.carryingDishColor = template.stations[order.stationIndex]?.color ?? '#ffd166';
            order.status = 'delivering';
            worker.status = 'walking_to_customer';
            worker.targetPos = { ...order.deliveryTargetPos };
            worker.path = this.pathfinder.findPath(worker.pos, order.deliveryTargetPos, layout);
          } else {
            // Chef placed dish on pass counter for waiter pickup
            order.status = 'ready_at_pass';
            order.assignedWorkerId = null;
            worker.carryingDish = false;
            worker.activeOrderId = null;
            worker.status = 'idle';
          }
        }
      } else if (worker.status === 'walking_to_customer') {
        const order = runtime.orders.find((o) => o.id === worker.activeOrderId);
        if (!order || order.status === 'delivered') {
          this.releaseWorkerReservations(runtime, worker);
          continue;
        }
        const arrived = this.advanceAlongPath(worker, walkSpeed, dt, runtime.workers);
        if (arrived) {
          this.completeOrderDelivery(
            runtime,
            template,
            layout,
            stats,
            cityNumber,
            rng,
            order,
            false,
            worker.cookDuration === 0,
            callbacks,
          );
          worker.carryingDish = false;
          worker.activeOrderId = null;
          worker.status = 'idle';
        }
      }
    }
  }

  private tryDispatchDeliveryPet(
    runtime: RestaurantRuntimeState,
    order: OrderItem,
    pickupPos: Vec2,
  ): boolean {
    if (order.assignedPetId) return false;
    // Pick the first free delivery pet (matches documented behavior)
    const pet = runtime.pets.find(
      (p) => p.deliveryMultiplier > 1 && p.status === 'following' && !p.activeOrderId,
    );
    if (!pet) return false;

    pet.activeOrderId = order.id;
    pet.status = 'delivering_to_customer';
    pet.pos = { x: pickupPos.x, z: pickupPos.z };
    pet.targetPos = { ...order.deliveryTargetPos };
    pet.carryingDish = true;
    pet.carryingQuality = order.quality;

    order.assignedPetId = pet.id;
    order.deliveryPetMult = pet.deliveryMultiplier;
    order.status = 'delivering';
    return true;
  }

  private finishCooking(
    _runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    worker: WorkerEntity,
    order: OrderItem,
    stn: StationState,
    hasDedicatedWaiters: boolean,
    wasInstant: boolean,
  ): void {
    // Release machine slot immediately upon finishing prep
    stn.occupiedByWorkerIds = stn.occupiedByWorkerIds.filter((id) => id !== worker.id);
    worker.activeStationIndex = null;
    worker.activeMachineSlot = null;
    if (wasInstant) worker.cookDuration = 0;

    // If a delivery pet already intercepted this dish, the player skips walking completely!
    if (order.assignedPetId) {
      worker.carryingDish = false;
      worker.activeOrderId = null;
      worker.status = 'idle';
      return;
    }

    worker.carryingDish = true;
    worker.carryingDishColor = template.stations[order.stationIndex]?.color ?? '#ffd166';
    worker.carryingQuality = order.quality;

    // In Waiter-Dining / Grand Hall restaurants, Chefs drop off at Pass Counter when Waiters exist
    if (
      hasDedicatedWaiters &&
      layout.passCounterPos &&
      (worker.role === 'chef' || worker.role === 'player' || worker.role === 'helper') &&
      worker.role !== 'player'
    ) {
      worker.status = 'walking_to_pass';
      worker.targetPos = { x: layout.passCounterPos.x, z: layout.passCounterPos.z - 0.7 };
      worker.path = this.pathfinder.findPath(worker.pos, worker.targetPos, layout);
    } else {
      order.status = 'delivering';
      worker.status = 'walking_to_customer';
      worker.targetPos = { ...order.deliveryTargetPos };
      worker.path = this.pathfinder.findPath(worker.pos, worker.targetPos, layout);
    }
  }

  private assignTaskToWorker(
    runtime: RestaurantRuntimeState,
    _template: RestaurantTemplate,
    layout: RestaurantLayout,
    worker: WorkerEntity,
    hasDedicatedWaiters: boolean,
  ): boolean {
    // 1. Waiters & Cashiers prioritize ready dishes at pass counter and waiting customers
    if (worker.role === 'waiter') {
      const readyOrder = runtime.orders.find(
        (o) => o.status === 'ready_at_pass' && !o.assignedWorkerId && !o.assignedPetId,
      );
      if (readyOrder && layout.passCounterPos) {
        readyOrder.assignedWorkerId = worker.id;
        worker.activeOrderId = readyOrder.id;
        worker.status = 'walking_to_pass';
        worker.targetPos = { x: layout.passCounterPos.x, z: layout.passCounterPos.z + 0.7 };
        worker.path = this.pathfinder.findPath(worker.pos, worker.targetPos, layout);
        return true;
      }

      const waitingCust = this.findNearestWaitingCustomer(runtime, worker.pos);
      if (waitingCust) {
        this.claimCustomerOrderTaking(layout, worker, waitingCust);
        return true;
      }
      return this.returnWorkerToHome(layout, worker);
    }

    if (worker.role === 'cashier') {
      const waitingCust = this.findNearestWaitingCustomer(runtime, worker.pos);
      if (waitingCust) {
        this.claimCustomerOrderTaking(layout, worker, waitingCust);
        return true;
      }
      return this.returnWorkerToHome(layout, worker);
    }

    // 2. Player, Chefs, Helpers:
    // If no waiters/cashiers can take orders (or player is closer when nobody else is handling orders), take order!
    const needOrder = this.findNearestWaitingCustomer(runtime, worker.pos);
    const shouldTakeOrders =
      !hasDedicatedWaiters && (runtime.cashierCount === 0 || worker.role === 'player');

    if (shouldTakeOrders && needOrder) {
      // Balance taking orders vs cooking queued dishes so orders don't pile up
      const queuedCookCount = runtime.orders.filter((o) => o.status === 'queued').length;
      if (queuedCookCount < 2 || worker.role === 'player') {
        this.claimCustomerOrderTaking(layout, worker, needOrder);
        return true;
      }
    }

    // Also pick up any orphaned ready_at_pass dish if no waiters exist
    if (!hasDedicatedWaiters) {
      const readyOrder = runtime.orders.find(
        (o) => o.status === 'ready_at_pass' && !o.assignedWorkerId && !o.assignedPetId,
      );
      if (readyOrder) {
        readyOrder.assignedWorkerId = worker.id;
        readyOrder.status = 'delivering';
        worker.activeOrderId = readyOrder.id;
        worker.carryingDish = true;
        worker.carryingQuality = readyOrder.quality;
        worker.status = 'walking_to_customer';
        worker.targetPos = { ...readyOrder.deliveryTargetPos };
        worker.path = this.pathfinder.findPath(worker.pos, readyOrder.deliveryTargetPos, layout);
        return true;
      }
    }

    // 3. Pick a queued dish whose station has a free machine slot!
    const queuedOrder = runtime.orders.find((o) => {
      if (o.status !== 'queued' || o.assignedWorkerId || o.assignedPetId) return false;
      const stn = runtime.stations[o.stationIndex];
      return stn && stn.unlocked && stn.occupiedByWorkerIds.length < stn.machines;
    });

    if (queuedOrder) {
      const stn = runtime.stations[queuedOrder.stationIndex];
      const slotIdx = stn.occupiedByWorkerIds.length;
      stn.occupiedByWorkerIds.push(worker.id);
      queuedOrder.assignedWorkerId = worker.id;
      queuedOrder.status = 'cooking';
      worker.activeOrderId = queuedOrder.id;
      worker.activeStationIndex = stn.index;
      worker.activeMachineSlot = slotIdx;
      const spot = stn.workSpots[slotIdx % stn.workSpots.length] ?? stn.worldPos;
      worker.status = 'walking_to_station';
      worker.targetPos = { ...spot };
      worker.path = this.pathfinder.findPath(worker.pos, spot, layout);
      return true;
    }

    // Fallback: if someone is waiting to order and no station slot is free, help take orders
    if (needOrder && !hasDedicatedWaiters) {
      this.claimCustomerOrderTaking(layout, worker, needOrder);
      return true;
    }

    return this.returnWorkerToHome(layout, worker);
  }

  private findNearestWaitingCustomer(
    runtime: RestaurantRuntimeState,
    pos: Vec2,
  ): CustomerEntity | null {
    let best: CustomerEntity | null = null;
    let bestDist = Infinity;
    for (const c of runtime.customers) {
      if (c.status === 'waiting_to_order' && !c.orderTakenByWorkerId) {
        const dist = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
    }
    return best;
  }

  private claimCustomerOrderTaking(
    layout: RestaurantLayout,
    worker: WorkerEntity,
    cust: CustomerEntity,
  ): void {
    const slot = layout.slots[cust.slotIndex];
    const target = slot ? slot.servePos : cust.pos;
    cust.orderTakenByWorkerId = worker.id;
    worker.activeCustomerId = cust.id;
    worker.status = 'walking_to_order';
    worker.targetPos = { ...target };
    worker.path = this.pathfinder.findPath(worker.pos, target, layout);
  }

  private returnWorkerToHome(layout: RestaurantLayout, worker: WorkerEntity): boolean {
    const dist = Math.hypot(worker.homePos.x - worker.pos.x, worker.homePos.z - worker.pos.z);
    if (dist > 0.45 && worker.status !== 'returning_idle') {
      worker.status = 'returning_idle';
      worker.targetPos = { ...worker.homePos };
      worker.path = this.pathfinder.findPath(worker.pos, worker.homePos, layout);
    }
    return false;
  }

  private updatePets(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    cityNumber: number,
    dt: number,
    callbacks?: SimCallbacks,
  ): void {
    const player = runtime.workers.find((w) => w.role === 'player');
    const playerSpeed =
      BALANCE.BASE_WORKER_WALK_SPEED * runtime.workerSpeedMult * stats.playerWalkSpeedMult;

    for (let i = 0; i < runtime.pets.length; i++) {
      const pet = runtime.pets[i];

      if (pet.status === 'delivering_to_customer') {
        const order = runtime.orders.find((o) => o.id === pet.activeOrderId);
        if (!order || order.status === 'delivered') {
          pet.activeOrderId = null;
          pet.carryingDish = false;
          pet.status = 'returning';
          continue;
        }
        const arrived = this.moveDirectlyToward(pet, order.deliveryTargetPos, playerSpeed * 1.1, dt);
        if (arrived) {
          this.completeOrderDelivery(
            runtime,
            template,
            layout,
            stats,
            cityNumber,
            new SeededRNG(Math.floor(runtime.simTime * 1000) + i * 97),
            order,
            true,
            true,
            callbacks,
          );
          pet.activeOrderId = null;
          pet.carryingDish = false;
          pet.status = 'returning';
        }
      } else if (pet.status === 'collecting_tip') {
        const tipIdx = runtime.tips.findIndex((t) => t.id === pet.activeTipId);
        if (tipIdx === -1) {
          pet.activeTipId = null;
          pet.status = 'returning';
          continue;
        }
        const tip = runtime.tips[tipIdx];
        const arrived = this.moveDirectlyToward(
          pet,
          tip.pos,
          playerSpeed * BALANCE.PET_CATCHUP_SPEED_BONUS,
          dt,
        );
        if (arrived) {
          this.collectAllTips(runtime, true, callbacks);
          pet.activeTipId = null;
          pet.tipCooldownTimer = pet.tipInterval;
          pet.status = 'returning';
        }
      } else {
        // Following / returning to player chef at +25% catchup speed
        if (pet.tipInterval > 0) {
          pet.tipCooldownTimer = Math.max(0, pet.tipCooldownTimer - dt);
          if (pet.tipCooldownTimer <= 0 && runtime.tips.length > 0) {
            pet.activeTipId = runtime.tips[0].id;
            pet.status = 'collecting_tip';
            continue;
          }
        }

        const anchor = player ? player.pos : { x: 0, z: 0 };
        const offsetX = i === 0 ? -0.85 : 0.85;
        const followTarget = { x: anchor.x + offsetX, z: anchor.z + 0.55 };
        const dist = Math.hypot(followTarget.x - pet.pos.x, followTarget.z - pet.pos.z);
        if (dist > 0.25) {
          this.moveDirectlyToward(
            pet,
            followTarget,
            playerSpeed * BALANCE.PET_CATCHUP_SPEED_BONUS,
            dt,
          );
        }
        if (pet.status === 'returning' && dist < 0.7) {
          pet.status = 'following';
        }
      }
    }
  }

  private completeOrderDelivery(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    layout: RestaurantLayout,
    stats: ComputedStats,
    cityNumber: number,
    rng: SeededRNG,
    order: OrderItem,
    deliveredByPet: boolean,
    wasInstant: boolean,
    callbacks?: SimCallbacks,
  ): void {
    // Atomic idempotency guard: prevent any duplicate payment ever
    if (order.status === 'delivered') return;
    order.status = 'delivered';

    const stn = runtime.stations[order.stationIndex];
    const stnTpl = template.stations[order.stationIndex];
    if (!stn || !stnTpl) return;

    const maxLv = getStationMaxLevel(template, runtime);
    const stationBaseProfit = getStationBaseDishProfit(
      stnTpl,
      stn,
      maxLv,
      cityNumber,
      runtime.globalProfitMult,
    );

    const payout = calculateDishPayout({
      stationBaseProfit,
      stats,
      quality: order.quality,
      isDouble: order.isDouble,
      isGolden: order.isGolden,
      deliveryPetMult: deliveredByPet ? order.deliveryPetMult : 1,
    });

    const newCash = d(runtime.cash).add(payout);
    runtime.cash = serializeDecimal(newCash);
    runtime.totalCashEarnedHere = serializeDecimal(d(runtime.totalCashEarnedHere).add(payout));
    runtime.dishesServedHere += order.isDouble ? 2 : 1;

    // Visual floating feedback
    const kind: FloatingFeedback['kind'] =
      order.quality === 'divine'
        ? 'divine'
        : order.quality === 'perfect'
          ? 'perfect'
          : order.isGolden
            ? 'golden'
            : 'cash';

    const tags: string[] = [];
    if (order.quality === 'divine') tags.push('DIVINE ×26');
    else if (order.quality === 'perfect') tags.push('PERFECT ×6');
    if (order.isDouble) tags.push('×2');
    if (order.isGolden) tags.push('GOLDEN');
    if (deliveredByPet && order.deliveryPetMult > 1) tags.push(`PET ×${order.deliveryPetMult}`);

    this.pushFeedback(runtime, {
      text: `+${formatMoney(payout)}`,
      subtext: tags.length > 0 ? tags.join(' · ') : undefined,
      worldPos: { ...order.deliveryTargetPos },
      heightOffset: 1.5,
      kind,
      maxAge: 1.35,
    });

    callbacks?.onSound?.(
      order.quality === 'divine' ? 'divine' : order.quality === 'perfect' ? 'perfect' : 'coin',
    );
    callbacks?.onDishDelivered?.({
      stationIndex: order.stationIndex,
      payout: serializeDecimal(payout),
      quality: order.quality,
      isDouble: order.isDouble,
      isGolden: order.isGolden,
      isInstant: wasInstant,
      deliveredByPet,
      ingredientId: stnTpl.ingredientId,
    });

    // Update owning customer completion, tips, and repeat order chance
    const cust = runtime.customers.find((c) => c.id === order.customerId);
    if (cust && cust.status !== 'leaving') {
      cust.deliveredCount++;
      if (cust.deliveredCount >= cust.totalOrderedCount) {
        // Tip roll (tables & counters only — drive-thru cars never tip!)
        const slot = layout.slots[cust.slotIndex];
        if (!cust.isCar && slot && rng.chance(stats.tipChance)) {
          const tipVal = calculateTipValue(template, runtime, stats, cityNumber);
          const existingPile = runtime.tips.find((t) => t.slotIndex === slot.index);
          if (existingPile) {
            existingPile.amount = serializeDecimal(d(existingPile.amount).add(tipVal));
          } else {
            runtime.tips.push({
              id: nextEntityId('tip'),
              slotIndex: slot.index,
              pos: { ...slot.tipPos },
              amount: serializeDecimal(tipVal),
              createdAt: runtime.simTime,
            });
          }
        }

        // Repeat order roll (preserves Golden status!)
        if (cust.reorderCount < 4 && rng.chance(stats.reorderChance)) {
          cust.reorderCount++;
          if (rng.chance(stats.instantOrderChance)) {
            this.createCustomerOrders(runtime, template, layout, cust, rng);
            cust.status = 'waiting_for_food';
          } else {
            cust.status = 'waiting_to_order';
          }
        } else {
          // Customer is finished — release slot and walk out
          if (slot && slot.occupiedByCustomerId === cust.id) {
            slot.occupiedByCustomerId = null;
          }
          cust.status = 'leaving';
          cust.targetPos = { ...layout.exitPos };
          cust.path = this.pathfinder.findPath(cust.pos, layout.exitPos, layout);
          if (!cust.isCar && layout.sidewalkLaneZ !== null) {
            // Walk out the door and stroll off-screen instead of vanishing on the doormat
            const side = -sidewalkSideForId(cust.id);
            const offscreen = { x: side * layout.offscreenX, z: layout.sidewalkLaneZ };
            cust.path.push({ x: layout.exitPos.x, z: layout.sidewalkLaneZ }, offscreen);
            cust.targetPos = { ...offscreen };
          }
          callbacks?.onSound?.('customer_happy');
        }
      }
    }

    // Prune delivered orders from central list so memory never grows unbounded
    const ordIdx = runtime.orders.findIndex((o) => o.id === order.id);
    if (ordIdx !== -1) {
      runtime.orders.splice(ordIdx, 1);
    }
  }

  /**
   * Collects a single tip pile (tap) or sweeps all tips (tip pet).
   */
  collectTipById(
    runtime: RestaurantRuntimeState,
    tipId: string,
    callbacks?: SimCallbacks,
  ): string | null {
    const idx = runtime.tips.findIndex((t) => t.id === tipId);
    if (idx === -1) return null;
    const [tip] = runtime.tips.splice(idx, 1);
    const val = d(tip.amount);
    runtime.cash = serializeDecimal(d(runtime.cash).add(val));
    runtime.totalCashEarnedHere = serializeDecimal(d(runtime.totalCashEarnedHere).add(val));
    this.pushFeedback(runtime, {
      text: `+${formatMoney(val)}`,
      subtext: 'TIP',
      worldPos: { ...tip.pos },
      heightOffset: 1.2,
      kind: 'tip',
      maxAge: 1.2,
    });
    callbacks?.onSound?.('tip');
    callbacks?.onTipCollected?.({ amount: tip.amount, byPet: false });
    return tip.amount;
  }

  collectAllTips(
    runtime: RestaurantRuntimeState,
    byPet: boolean,
    callbacks?: SimCallbacks,
  ): number {
    if (runtime.tips.length === 0) return 0;
    let total = d(0);
    const count = runtime.tips.length;
    const anchor = { ...runtime.tips[0].pos };
    for (const tip of runtime.tips) {
      total = total.add(d(tip.amount));
    }
    runtime.tips = [];
    runtime.cash = serializeDecimal(d(runtime.cash).add(total));
    runtime.totalCashEarnedHere = serializeDecimal(d(runtime.totalCashEarnedHere).add(total));
    const amtStr = serializeDecimal(total);
    this.pushFeedback(runtime, {
      text: `+${formatMoney(total)}`,
      subtext: byPet ? 'PET TIPS' : 'TIPS',
      worldPos: anchor,
      heightOffset: 1.3,
      kind: 'tip',
      maxAge: 1.3,
    });
    callbacks?.onSound?.('tip');
    callbacks?.onTipCollected?.({ amount: amtStr, byPet });
    return count;
  }

  private updateSideOffers(
    runtime: RestaurantRuntimeState,
    template: RestaurantTemplate,
    stats: ComputedStats,
    cityNumber: number,
    rng: SeededRNG,
    dt: number,
  ): void {
    // VIP Investor periodic offer (Cash or Gems)
    if (runtime.investorAvailable) {
      runtime.investorExpiresTimer -= dt;
      if (runtime.investorExpiresTimer <= 0) {
        runtime.investorAvailable = false;
        runtime.investorCooldownTimer = BALANCE.INVESTOR_COOLDOWN_SEC;
      }
    } else {
      runtime.investorCooldownTimer -= dt;
      if (runtime.investorCooldownTimer <= 0) {
        runtime.investorAvailable = true;
        runtime.investorExpiresTimer = BALANCE.INVESTOR_LIFETIME_SEC;
        if (rng.chance(stats.investorGemChance)) {
          runtime.investorKind = 'gems';
          runtime.investorOfferValue = String(BALANCE.INVESTOR_BASE_GEMS);
        } else {
          runtime.investorKind = 'cash';
          const eps = computeAnalyticalOfflineEps(template, runtime, stats, cityNumber);
          const offer = eps
            .mul(BALANCE.INVESTOR_CASH_SECONDS)
            .mul(stats.investorCashMult)
            .add(25)
            .ceil();
          runtime.investorOfferValue = serializeDecimal(offer);
        }
      }
    }
  }

  pushFeedback(
    runtime: RestaurantRuntimeState,
    input: Omit<FloatingFeedback, 'id' | 'age'>,
  ): void {
    // Cap floating texts to 24 for mobile rendering budget
    if (runtime.floatingFeedback.length >= 24) {
      runtime.floatingFeedback.shift();
    }
    runtime.floatingFeedback.push({
      id: this.feedbackSeq++,
      age: 0,
      ...input,
    });
  }

  private advanceAlongPath(
    entity: { id: string; pos: Vec2; targetPos: Vec2; path: Vec2[]; facing: number },
    speed: number,
    dt: number,
    avoidNeighbors?: ReadonlyArray<{ id: string; pos: Vec2 }>,
  ): boolean {
    if (entity.path.length === 0) {
      return this.moveDirectlyToward(entity, entity.targetPos, speed, dt);
    }
    const nextWp = entity.path[0];
    const dx = nextWp.x - entity.pos.x;
    const dz = nextWp.z - entity.pos.z;
    const dist = Math.hypot(dx, dz);
    const stepDist = speed * dt;

    if (dist <= stepDist + 0.08) {
      entity.pos.x = nextWp.x;
      entity.pos.z = nextWp.z;
      entity.path.shift();
      return entity.path.length === 0;
    }

    let vx = (dx / dist) * stepDist;
    let vz = (dz / dist) * stepDist;

    if (avoidNeighbors && avoidNeighbors.length > 1) {
      const sep = computeSeparationOffset(entity.id, entity.pos, avoidNeighbors, 0.52);
      vx += sep.x * dt * 2.0;
      vz += sep.z * dt * 2.0;
    }

    entity.pos.x += vx;
    entity.pos.z += vz;
    entity.facing = Math.atan2(vx, vz);
    return false;
  }

  private moveDirectlyToward(
    entity: { pos: Vec2; facing: number },
    target: Vec2,
    speed: number,
    dt: number,
  ): boolean {
    const dx = target.x - entity.pos.x;
    const dz = target.z - entity.pos.z;
    const dist = Math.hypot(dx, dz);
    const stepDist = speed * dt;
    if (dist <= stepDist + 0.08) {
      entity.pos.x = target.x;
      entity.pos.z = target.z;
      return true;
    }
    entity.pos.x += (dx / dist) * stepDist;
    entity.pos.z += (dz / dist) * stepDist;
    entity.facing = Math.atan2(dx, dz);
    return false;
  }
}
