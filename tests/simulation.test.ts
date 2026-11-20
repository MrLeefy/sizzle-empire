import { describe, expect, it } from 'vitest';
import { GameController } from '@/engine/GameController';
import { createNewGameSave } from '@/engine/persistence/saveSchema';
import { getRestaurantTemplate } from '@/data/restaurants';
import { createInitialRestaurantRuntime } from '@/engine/sim/restaurantSim';
import { createPetInstance } from '@/engine/meta/pets';
import { d } from '@/engine/economy/bigNumber';
import { RestaurantPathfinder } from '@/engine/sim/pathfinding';
import { buildRestaurantLayout } from '@/engine/sim/layoutBuilder';

describe('Phase 2: Restaurant Simulation, Worker AI, Pathfinding & Pets', () => {
  it('simulates full customer lifecycle automatically with Player Chef from second 0', () => {
    const controller = new GameController(createNewGameSave(101));
    expect(controller.save.mainRestaurant.workers.length).toBe(1);
    expect(controller.save.mainRestaurant.workers[0].role).toBe('player');

    // Run 60 seconds of deterministic fixed-timestep simulation
    for (let i = 0; i < 60 * 20; i++) {
      controller.stepSimulationFixed(0.05);
    }

    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThanOrEqual(8);
    expect(d(controller.save.mainRestaurant.cash).gt(0)).toBe(true);
    expect(controller.save.stats.ordersPrepared).toBeGreaterThanOrEqual(8);
  });

  it('prevents duplicate payments and deadlocks with multiple workers competing for tasks', () => {
    const save = createNewGameSave(202);
    const tpl = getRestaurantTemplate('courtyard_cafe');
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: 3,
      startingCash: 1e9,
    });
    save.mainRestaurant = runtime;
    const controller = new GameController(save);

    // Unlock all 4 stations and hire multiple chefs & waiters + extra customers
    for (let i = 1; i < tpl.stations.length; i++) {
      controller.purchaseStation(i, '1');
    }
    for (const u of tpl.upgrades) {
      if (u.kind === 'hire_chef' || u.kind === 'hire_waiter' || u.kind === 'add_customer' || u.kind === 'add_table') {
        controller.purchaseRestaurantUpgrade(u.id);
      }
    }

    const totalWorkers = controller.save.mainRestaurant.workers.length;
    expect(totalWorkers).toBeGreaterThanOrEqual(4);

    let maxSimultaneousMachineViolation = false;
    for (let i = 0; i < 90 * 20; i++) {
      controller.stepSimulationFixed(0.05);
      for (const stn of controller.save.mainRestaurant.stations) {
        if (stn.occupiedByWorkerIds.length > stn.machines) {
          maxSimultaneousMachineViolation = true;
        }
      }
    }

    expect(maxSimultaneousMachineViolation).toBe(false);
    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThan(25);
    // Orders list should stay clean (no unbounded zombie orders)
    expect(controller.save.mainRestaurant.orders.length).toBeLessThan(60);
  });

  it('supports Waiter Dining Hall pass-counter workflow without stuck customers', () => {
    const save = createNewGameSave(303);
    const tpl = getRestaurantTemplate('grand_brasserie');
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: 6,
      startingCash: 1e6,
    });
    save.mainRestaurant = runtime;
    const controller = new GameController(save);

    // 70s: the first customers now stroll in along the sidewalk from off-screen (~2s walk-in)
    for (let i = 0; i < 70 * 20; i++) {
      controller.stepSimulationFixed(0.05);
    }

    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThan(5);
  });

  it('supports Drive-Thru lanes with cars and enforces that cars NEVER leave tips', () => {
    const save = createNewGameSave(404);
    const tpl = getRestaurantTemplate('sunset_drive_in');
    // Max out tip chance vault so any eligible customer would tip frequently
    save.vault.unlockedIds.push('tip_jar');
    save.vault.levels['tip_jar'] = 20;
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: 4,
      startingCash: 1000,
    });
    save.mainRestaurant = runtime;
    const controller = new GameController(save);

    let sawCar = false;
    for (let i = 0; i < 60 * 20; i++) {
      controller.stepSimulationFixed(0.05);
      if (controller.save.mainRestaurant.customers.some((c) => c.isCar)) {
        sawCar = true;
      }
    }

    expect(sawCar).toBe(true);
    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThan(5);
    expect(controller.save.mainRestaurant.tips.length).toBe(0);
  });

  it('dispatches delivery pets to physically deliver player dishes with multiplier while keeping workers functional', () => {
    const save = createNewGameSave(505);
    const panda = createPetInstance('pet_panda', 'legendary');
    save.pets.push(panda);
    save.equippedPetIds = [panda.instanceId, null];

    const controller = new GameController(save);
    controller.sim.syncEquippedPets(controller.save.mainRestaurant, [panda]);

    for (let i = 0; i < 45 * 20; i++) {
      controller.stepSimulationFixed(0.05);
    }

    expect(controller.save.stats.petDeliveries).toBeGreaterThan(0);
    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThan(5);
  });

  it('sweeps accumulated tips automatically with a Tip Pet', () => {
    const save = createNewGameSave(606);
    save.vault.unlockedIds.push('tip_jar');
    save.vault.levels['tip_jar'] = 20; // 50% tip chance
    const mole = createPetInstance('pet_mole', 'ultimate');
    save.pets.push(mole);
    save.equippedPetIds = [mole.instanceId, null];

    const controller = new GameController(save);
    controller.sim.syncEquippedPets(controller.save.mainRestaurant, [mole]);

    for (let i = 0; i < 80 * 20; i++) {
      controller.stepSimulationFixed(0.05);
    }

    expect(controller.save.stats.petTipsCollected).toBeGreaterThan(0);
  });

  it('caches and computes valid A* paths around restaurant obstacles', () => {
    const tpl = getRestaurantTemplate('grand_brasserie');
    const layout = buildRestaurantLayout(tpl);
    const pf = new RestaurantPathfinder();
    const p1 = pf.findPath({ x: -5, z: -6 }, { x: 5, z: 6 }, layout);
    const p2 = pf.findPath({ x: -5, z: -6 }, { x: 5, z: 6 }, layout);

    expect(p1.length).toBeGreaterThan(0);
    expect(p1[p1.length - 1]).toEqual({ x: 5, z: 6 });
    expect(p2.length).toBe(p1.length);
  });
});

describe('Pedestrian customers stroll in from and out to off-screen', () => {
  it('spawns walkers beyond the frame on the sidewalk lane and walks leavers back off-screen', () => {
    const save = createNewGameSave(515);
    const tpl = getRestaurantTemplate('citrus_press');
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: 3,
      startingCash: 1e6,
    });
    save.mainRestaurant = runtime;
    const controller = new GameController(save);
    const layout = buildRestaurantLayout(tpl);
    expect(layout.sidewalkLaneZ).not.toBeNull();

    const seen = new Set<string>();
    let sawSpawnOffscreen = false;
    let sawLeaveOffscreen = false;
    for (let i = 0; i < 20 * 240; i++) {
      controller.stepSimulationFixed(0.05);
      for (const c of controller.save.mainRestaurant.customers) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          if (c.status === 'entering' && !c.isCar) {
            expect(Math.abs(c.pos.x)).toBeGreaterThanOrEqual(layout.width / 2 + 4);
            expect(c.pos.z).toBeCloseTo(layout.sidewalkLaneZ!, 5);
            sawSpawnOffscreen = true;
          }
        }
        if (c.status === 'leaving' && !c.isCar && Math.abs(c.pos.x) >= layout.width / 2 + 3) {
          expect(c.pos.z).toBeCloseTo(layout.sidewalkLaneZ!, 5);
          sawLeaveOffscreen = true;
        }
      }
    }
    expect(sawSpawnOffscreen).toBe(true);
    expect(sawLeaveOffscreen).toBe(true);
    expect(controller.save.mainRestaurant.dishesServedHere).toBeGreaterThan(20);

    // Drive-thru venues keep their own road lane (no sidewalk walkers)
    expect(buildRestaurantLayout(getRestaurantTemplate('sunset_drive_in')).sidewalkLaneZ).toBeNull();
  });
});
