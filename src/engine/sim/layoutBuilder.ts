import type { RestaurantLayout, RestaurantTemplate, ServiceSlot, Vec2 } from '@/types/game';

/**
 * Builds deterministic, visually clear 3D floorplans for all 6 establishment archetypes:
 * - counter_stand (Mini Kiosk & Street Stalls)
 * - food_truck (Mobile Food Vans with window queue)
 * - cafe_tables (Cafés with tables + direct counter/table service)
 * - waiter_dining (Full Restaurants with kitchen pass counter + Waiters + Dining Hall)
 * - drive_thru (Drive-Thru road lane with animated cars + window server)
 * - grand_hall (Large 10-station flagship multi-area establishments)
 *
 * Coordinate orientation (Portrait top-down angled view):
 *  - X axis: left (-width/2) to right (+width/2)
 *  - Z axis: back/kitchen (-depth/2) to front/entrance (+depth/2)
 */
export function buildRestaurantLayout(template: RestaurantTemplate): RestaurantLayout {
  const stnCount = template.stations.length;
  const isDriveThru = template.archetype === 'drive_thru';
  const usesWaiterPass =
    template.archetype === 'waiter_dining' || template.archetype === 'grand_hall';

  const width =
    template.tier === 'mini_kiosk'
      ? 10
      : template.tier === 'street_stall'
        ? 11
        : template.tier === 'food_van'
          ? 12
          : template.tier === 'eatery'
            ? 14
            : 16;

  const depth =
    template.tier === 'mini_kiosk'
      ? 11
      : template.tier === 'street_stall'
        ? 12
        : template.tier === 'food_van'
          ? 13
          : template.tier === 'eatery'
            ? 16
            : 20;

  const cellSize = 1.0;
  const blockedCells = new Set<string>();

  const markBlockedWorld = (x: number, z: number) => {
    const gx = Math.floor((x + width / 2) / cellSize);
    const gz = Math.floor((z + depth / 2) / cellSize);
    blockedCells.add(`${gx},${gz}`);
  };

  // --- Place Food Stations ---
  const stationPositions: Vec2[] = [];
  if (stnCount === 1) {
    stationPositions.push({ x: 0, z: -2.2 });
  } else if (stnCount === 2) {
    stationPositions.push({ x: -2.3, z: -2.5 }, { x: 2.3, z: -2.5 });
  } else if (stnCount === 3) {
    stationPositions.push({ x: -3.2, z: -2.8 }, { x: 0, z: -2.8 }, { x: 3.2, z: -2.8 });
  } else if (stnCount <= 7) {
    const backRowCount = Math.ceil(stnCount / 2);
    const midRowCount = stnCount - backRowCount;
    const spanBack = Math.min(width - 3.6, backRowCount * 2.5);
    for (let i = 0; i < backRowCount; i++) {
      const t = backRowCount === 1 ? 0.5 : i / (backRowCount - 1);
      stationPositions.push({ x: -spanBack / 2 + t * spanBack, z: -depth / 2 + 2.4 });
    }
    const spanMid = Math.min(width - 4.4, Math.max(2.5, midRowCount * 2.6));
    for (let i = 0; i < midRowCount; i++) {
      const t = midRowCount === 1 ? 0.5 : i / (midRowCount - 1);
      stationPositions.push({ x: -spanMid / 2 + t * spanMid, z: -depth / 2 + 5.6 });
    }
  } else {
    // 10-station flagship layout: 2 organized kitchen rows (5 back + 5 front kitchen island)
    const topRow = 5;
    const botRow = stnCount - topRow;
    const spanX = width - 3.2;
    for (let i = 0; i < topRow; i++) {
      const t = i / (topRow - 1);
      stationPositions.push({ x: -spanX / 2 + t * spanX, z: -depth / 2 + 2.2 });
    }
    for (let i = 0; i < botRow; i++) {
      const t = botRow === 1 ? 0.5 : i / (botRow - 1);
      stationPositions.push({ x: -spanX / 2 + t * spanX, z: -depth / 2 + 5.8 });
    }
  }

  for (const sp of stationPositions) {
    markBlockedWorld(sp.x, sp.z);
  }

  // --- Service Slots (Counters, Tables, or Drive-Thru Lanes) ---
  const slots: ServiceSlot[] = [];
  let passCounterPos: Vec2 | null = null;

  if (isDriveThru) {
    // Cars drive horizontally along front lane z = depth/2 - 2.6
    const laneZ = depth / 2 - 2.5;
    const totalSlots = Math.max(6, template.maxCustomerCap);
    for (let i = 0; i < Math.min(totalSlots, 8); i++) {
      const x = -width / 2 + 2.4 + (i % 4) * 3.1;
      const z = i < 4 ? laneZ : laneZ - 2.0;
      slots.push({
        index: i,
        kind: 'drive_thru',
        customerPos: { x, z },
        servePos: { x, z: z - 1.35 },
        tipPos: { x, z: z - 1.0 },
        occupiedByCustomerId: null,
        unlocked: i < template.initialCustomerCap,
      });
    }
  } else if (usesWaiterPass) {
    // Kitchen pass divides kitchen (negative Z) from dining room (positive Z)
    const passZ = -depth / 2 + (stnCount >= 8 ? 8.4 : 7.2);
    passCounterPos = { x: 0, z: passZ };
    // Create table clusters in dining room
    const diningStartZ = passZ + 2.2;
    const cols = stnCount >= 8 ? 4 : 3;
    const rows = stnCount >= 8 ? 3 : 2;
    let slotIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = -width / 2 + 2.6 + c * ((width - 5.2) / Math.max(1, cols - 1));
        const tz = diningStartZ + r * 2.7;
        // 2 seats per table
        slots.push({
          index: slotIdx++,
          kind: 'table',
          customerPos: { x: tx - 0.65, z: tz + 0.55 },
          servePos: { x: tx - 0.65, z: tz - 0.65 },
          tipPos: { x: tx, z: tz },
          occupiedByCustomerId: null,
          unlocked: slotIdx <= template.initialCustomerCap,
        });
        slots.push({
          index: slotIdx++,
          kind: 'table',
          customerPos: { x: tx + 0.65, z: tz + 0.55 },
          servePos: { x: tx + 0.65, z: tz - 0.65 },
          tipPos: { x: tx, z: tz },
          occupiedByCustomerId: null,
          unlocked: slotIdx <= template.initialCustomerCap,
        });
      }
    }
  } else if (template.archetype === 'cafe_tables') {
    const startZ = 0.8;
    const cols = 3;
    const rows = 2;
    let slotIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = -width / 2 + 2.6 + c * ((width - 5.2) / (cols - 1));
        const tz = startZ + r * 2.8;
        slots.push({
          index: slotIdx++,
          kind: 'table',
          customerPos: { x: tx - 0.55, z: tz + 0.55 },
          servePos: { x: tx - 0.55, z: tz - 0.65 },
          tipPos: { x: tx, z: tz },
          occupiedByCustomerId: null,
          unlocked: slotIdx <= template.initialCustomerCap,
        });
        slots.push({
          index: slotIdx++,
          kind: 'table',
          customerPos: { x: tx + 0.55, z: tz + 0.55 },
          servePos: { x: tx + 0.55, z: tz - 0.65 },
          tipPos: { x: tx, z: tz },
          occupiedByCustomerId: null,
          unlocked: slotIdx <= template.initialCustomerCap,
        });
      }
    }
  } else {
    // Counter-service stand or Food Truck window
    const counterZ = 0.7;
    const slotCount = Math.max(6, template.maxCustomerCap);
    const span = Math.min(width - 2.4, slotCount * 1.45);
    for (let i = 0; i < slotCount; i++) {
      const t = slotCount === 1 ? 0.5 : i / (slotCount - 1);
      const sx = -span / 2 + t * span;
      slots.push({
        index: i,
        kind: 'counter',
        customerPos: { x: sx, z: counterZ + 1.35 },
        servePos: { x: sx, z: counterZ - 0.75 },
        tipPos: { x: sx, z: counterZ + 0.1 },
        occupiedByCustomerId: null,
        unlocked: i < template.initialCustomerCap,
      });
    }
  }

  const chefHomeZ = usesWaiterPass
    ? (passCounterPos!.z - 1.3)
    : isDriveThru
      ? 0.2
      : -0.6;
  const chefHomePositions: Vec2[] = [];
  for (let i = 0; i < 10; i++) {
    const col = (i % 5) - 2;
    chefHomePositions.push({ x: col * 1.4, z: chefHomeZ - Math.floor(i / 5) * 1.1 });
  }

  const waiterHomePositions: Vec2[] = [];
  const waiterHomeZ = passCounterPos ? passCounterPos.z + 1.0 : 0.6;
  for (let i = 0; i < 8; i++) {
    const col = (i % 4) - 1.5;
    waiterHomePositions.push({ x: col * 1.6, z: waiterHomeZ });
  }

  const entrancePos: Vec2 = isDriveThru
    ? { x: -width / 2 - 2.5, z: depth / 2 - 2.5 }
    : { x: -1.8, z: depth / 2 + 1.2 };
  const exitPos: Vec2 = isDriveThru
    ? { x: width / 2 + 2.5, z: depth / 2 - 2.5 }
    : { x: 1.8, z: depth / 2 + 1.2 };

  return {
    width,
    depth,
    entrancePos,
    exitPos,
    passCounterPos,
    usesWaiterPass,
    isDriveThru,
    slots,
    stationPositions,
    chefHomePositions,
    waiterHomePositions,
    gridSize: Math.max(width, depth),
    cellSize,
    blockedCells,
  };
}
