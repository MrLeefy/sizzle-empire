import type {
  RestaurantArchetype,
  RestaurantTemplate,
  RestaurantTier,
  RestaurantUpgradeTemplate,
  StationTemplate,
} from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';

interface DishSeed {
  id: string;
  name: string;
  icon: string;
  color: string;
  accent: string;
  style: StationTemplate['modelStyle'];
  prepTime?: number;
  ingredientId?: string;
}

interface RestaurantSeed {
  id: string;
  name: string;
  subtitle: string;
  tier: RestaurantTier;
  archetype: RestaurantArchetype;
  baseCostScale: number;
  floor: string;
  wall: string;
  accent: string;
  roof: string;
  dishes: DishSeed[];
  maxStationLevelOverride?: number;
}

function buildStations(dishes: DishSeed[], baseCostScale: number, tier: RestaurantTier): StationTemplate[] {
  const tierFactor =
    tier === 'mini_kiosk'
      ? 1
      : tier === 'street_stall'
        ? 4
        : tier === 'food_van'
          ? 20
          : tier === 'eatery'
            ? 140
            : 1200;

  return dishes.map((dish, idx) => {
    // Authentic Eatventure-style exponential steps between stations so each unlock is an exciting milestone
    const stepMult = idx === 0 ? 1 : Math.pow(14.5, idx);
    const unlockCost = idx === 0 ? 0 : Math.round(35 * baseCostScale * tierFactor * stepMult);
    const baseUpgradeCost = Math.max(4, Math.round(4.4 * baseCostScale * tierFactor * Math.pow(11.6, idx)));
    const baseRevenue = Math.max(
      2,
      Math.round(2.15 * BALANCE.PREP_REVENUE_SCALE * baseCostScale * tierFactor * Math.pow(9.6, idx)),
    );
    const prepTime = Number(
      ((dish.prepTime ?? 2.2 + idx * 1.15) * BALANCE.PREP_TIME_SCALE).toFixed(2),
    );
    return {
      id: `${dish.id}_${idx}`,
      name: dish.name,
      icon: dish.icon,
      color: dish.color,
      accentColor: dish.accent,
      modelStyle: dish.style,
      baseUnlockCost: unlockCost,
      baseUpgradeCost,
      baseRevenue,
      basePrepTime: prepTime,
      initialMachines: 1,
      maxMachines: tier === 'mini_kiosk' ? 2 : tier === 'flagship' ? 4 : 3,
      servedByRole: idx < 2 && tier === 'flagship' ? 'waiter' : 'chef',
      ingredientId: dish.ingredientId,
    };
  });
}

function buildUpgrades(
  seed: RestaurantSeed,
  stations: StationTemplate[],
): RestaurantUpgradeTemplate[] {
  const upgrades: RestaurantUpgradeTemplate[] = [];
  const scale = seed.baseCostScale;
  const tierMult =
    seed.tier === 'mini_kiosk'
      ? 1
      : seed.tier === 'street_stall'
        ? 4
        : seed.tier === 'food_van'
          ? 22
          : seed.tier === 'eatery'
            ? 150
            : 1200;

  let uid = 0;
  const nextId = (prefix: string) => `${seed.id}_${prefix}_${uid++}`;

  // Per-station profit multipliers & extra machines spaced across the venue curve
  stations.forEach((stn, sIdx) => {
    const anchor = Math.max(stn.baseUnlockCost, stn.baseUpgradeCost * 6);

    upgrades.push({
      id: nextId('prof2'),
      name: `Fresh ${stn.name}`,
      description: `${stn.name} profit ×2`,
      icon: stn.icon,
      cost: Math.round(anchor * 3.0),
      kind: 'station_profit',
      stationIndex: sIdx,
      value: 2,
    });

    if (seed.tier !== 'mini_kiosk' || sIdx === 0) {
      upgrades.push({
        id: nextId('mach'),
        name: `Extra ${stn.name} Unit`,
        description: `+1 machine slot at ${stn.name}`,
        icon: '⚙️',
        cost: Math.round(anchor * 6.0),
        kind: 'add_machine',
        stationIndex: sIdx,
        value: 1,
      });
    }

    upgrades.push({
      id: nextId('prof3'),
      name: `Artisan ${stn.name}`,
      description: `${stn.name} profit ×3`,
      icon: stn.icon,
      cost: Math.round(anchor * 14),
      kind: 'station_profit',
      stationIndex: sIdx,
      value: 3,
    });

    if (seed.tier !== 'mini_kiosk') {
      upgrades.push({
        id: nextId('prof5'),
        name: `Signature ${stn.name}`,
        description: `${stn.name} profit ×5`,
        icon: stn.icon,
        cost: Math.round(anchor * 62),
        kind: 'station_profit',
        stationIndex: sIdx,
        value: 5,
      });
    }

    if (seed.tier === 'food_van' || seed.tier === 'eatery' || seed.tier === 'flagship') {
      upgrades.push({
        id: nextId('prof10'),
        name: `Gourmet ${stn.name}`,
        description: `${stn.name} profit ×10`,
        icon: stn.icon,
        cost: Math.round(anchor * 380),
        kind: 'station_profit',
        stationIndex: sIdx,
        value: 10,
      });
    }

    if (seed.tier === 'eatery' || seed.tier === 'flagship') {
      upgrades.push({
        id: nextId('prof20'),
        name: `Chef's Choice ${stn.name}`,
        description: `${stn.name} profit ×20`,
        icon: stn.icon,
        cost: Math.round(anchor * 3400),
        kind: 'station_profit',
        stationIndex: sIdx,
        value: 20,
      });
    }

    if (seed.tier === 'flagship') {
      upgrades.push({
        id: nextId('prof50'),
        name: `Masterwork ${stn.name}`,
        description: `${stn.name} profit ×50`,
        icon: stn.icon,
        cost: Math.round(anchor * 38000),
        kind: 'station_profit',
        stationIndex: sIdx,
        value: 50,
      });
      upgrades.push({
        id: nextId('prof100'),
        name: `Michelin ${stn.name}`,
        description: `${stn.name} profit ×100`,
        icon: stn.icon,
        cost: Math.round(anchor * 650000),
        kind: 'station_profit',
        stationIndex: sIdx,
        value: 100,
      });
    }
  });

  // Hiring chefs, waiters, cashiers & adding customer capacity
  const maxChefs =
    seed.tier === 'mini_kiosk'
      ? 1
      : seed.tier === 'street_stall'
        ? 2
        : seed.tier === 'food_van'
          ? 3
          : seed.tier === 'eatery'
            ? 5
            : 8;

  for (let i = 0; i < maxChefs; i++) {
    upgrades.push({
      id: nextId('chef'),
      name: i === 0 ? 'Hire Assistant Chef' : `Hire Line Chef #${i + 1}`,
      description: '+1 Chef preparing orders automatically',
      icon: '👨‍🍳',
      cost: Math.round(45 * scale * tierMult * Math.pow(10.5, i)),
      kind: 'hire_chef',
      value: 1,
    });
  }

  const usesWaiters =
    seed.archetype === 'cafe_tables' ||
    seed.archetype === 'waiter_dining' ||
    seed.archetype === 'grand_hall';

  if (usesWaiters) {
    const waiterCount = seed.tier === 'flagship' ? 6 : 3;
    for (let i = 0; i < waiterCount; i++) {
      upgrades.push({
        id: nextId('waiter'),
        name: `Hire Server #${i + 1}`,
        description: '+1 Waiter taking orders & serving tables',
        icon: '🧑‍💼',
        cost: Math.round(70 * scale * tierMult * Math.pow(8.8, i)),
        kind: 'hire_waiter',
        value: 1,
      });
    }
  }

  if (seed.archetype === 'drive_thru' || seed.archetype === 'food_truck') {
    upgrades.push({
      id: nextId('cashier'),
      name: 'Hire Window Cashier',
      description: '+1 Cashier dedicated to rapid order taking',
      icon: '🧾',
      cost: Math.round(75 * scale * tierMult),
      kind: 'hire_cashier',
      value: 1,
    });
  }

  const customerUpgrades =
    seed.tier === 'mini_kiosk' ? 2 : seed.tier === 'street_stall' ? 3 : seed.tier === 'food_van' ? 4 : 6;
  for (let i = 0; i < customerUpgrades; i++) {
    const isTable = usesWaiters && i % 2 === 1;
    upgrades.push({
      id: nextId('cust'),
      name: seed.archetype === 'drive_thru'
        ? `Open Drive-Thru Lane Slot #${i + 2}`
        : isTable
          ? `Add Dining Table #${Math.floor(i / 2) + 3}`
          : `Expand Guest Queue +${i < 2 ? 1 : 2}`,
      description: isTable ? '+2 seated customer capacity' : '+1 simultaneous customer capacity',
      icon: seed.archetype === 'drive_thru' ? '🚗' : isTable ? '🪑' : '🙋',
      cost: Math.round(24 * scale * tierMult * Math.pow(8.5, i)),
      kind: isTable ? 'add_table' : 'add_customer',
      value: isTable ? 2 : 1,
    });
  }

  // Speed & global profit upgrades
  upgrades.push({
    id: nextId('wspd1'),
    name: 'Grip Kitchen Shoes',
    description: 'All staff walk +30% faster',
    icon: '👟',
    cost: Math.round(68 * scale * tierMult),
    kind: 'worker_speed',
    value: 0.3,
  });

  upgrades.push({
    id: nextId('cspd1'),
    name: 'Turbo Burners',
    description: 'All stations cook +35% faster',
    icon: '🔥',
    cost: Math.round(190 * scale * tierMult),
    kind: 'cook_speed',
    value: 0.35,
  });

  if (seed.tier !== 'mini_kiosk') {
    upgrades.push({
      id: nextId('glob2'),
      name: 'Street Advertising',
      description: 'All restaurant profits ×2',
      icon: '📣',
      cost: Math.round(450 * scale * tierMult),
      kind: 'global_profit',
      value: 2,
    });
    upgrades.push({
      id: nextId('wspd2'),
      name: 'Precision Workflow',
      description: 'All staff walk +45% faster',
      icon: '⚡',
      cost: Math.round(2200 * scale * tierMult),
      kind: 'worker_speed',
      value: 0.45,
    });
  }

  if (seed.tier === 'eatery' || seed.tier === 'flagship') {
    upgrades.push({
      id: nextId('glob3'),
      name: 'Food Critic Spotlight',
      description: 'All restaurant profits ×3',
      icon: '⭐',
      cost: Math.round(18000 * scale * tierMult),
      kind: 'global_profit',
      value: 3,
    });
    upgrades.push({
      id: nextId('cspd2'),
      name: 'Induction Pro Kitchen',
      description: 'All stations cook +60% faster',
      icon: '♨️',
      cost: Math.round(65000 * scale * tierMult),
      kind: 'cook_speed',
      value: 0.6,
    });
  }

  return upgrades.sort((a, b) => a.cost - b.cost);
}

function makeRestaurant(seed: RestaurantSeed): RestaurantTemplate {
  const stations = buildStations(seed.dishes, seed.baseCostScale, seed.tier);
  const upgrades = buildUpgrades(seed, stations);
  const initialCustomerCap =
    seed.tier === 'mini_kiosk' ? 2 : seed.tier === 'street_stall' ? 3 : seed.tier === 'food_van' ? 4 : 5;
  const maxCustomerCap =
    seed.tier === 'mini_kiosk' ? 5 : seed.tier === 'street_stall' ? 7 : seed.tier === 'food_van' ? 9 : seed.tier === 'eatery' ? 14 : 20;

  return {
    id: seed.id,
    name: seed.name,
    subtitle: seed.subtitle,
    tier: seed.tier,
    archetype: seed.archetype,
    maxStationLevel: seed.maxStationLevelOverride ?? BALANCE.TIER_MAX_LEVEL[seed.tier],
    baseCostScale: seed.baseCostScale,
    themeFloorColor: seed.floor,
    themeWallColor: seed.wall,
    themeAccentColor: seed.accent,
    themeRoofColor: seed.roof,
    initialCustomerCap,
    maxCustomerCap,
    initialWaiters: seed.archetype === 'waiter_dining' || seed.archetype === 'grand_hall' ? 1 : 0,
    initialCashiers: seed.archetype === 'drive_thru' ? 1 : 0,
    stations,
    upgrades,
  };
}

// ============================================================================
// 38 ORIGINAL RESTAURANT TEMPLATES ACROSS 5 TIERS & 6 ESTABLISHMENT ARCHETYPES
// ============================================================================

const SEEDS: RestaurantSeed[] = [
  // --- TIER 1: MINI KIOSKS (5 templates, 1 station, lv 25) ---
  {
    id: 'citrus_press',
    name: 'Sunburst Citrus Press',
    subtitle: 'Fresh-squeezed boardwalk kiosk',
    tier: 'mini_kiosk',
    archetype: 'counter_stand',
    baseCostScale: 1.0,
    floor: '#e7d7b8',
    wall: '#fff6e0',
    accent: '#ff9f1c',
    roof: '#ff6b35',
    dishes: [{ id: 'yuzu_ade', name: 'Sunburst Lemonade', icon: '🍋', color: '#ffd166', accent: '#ff9f1c', style: 'juicer', prepTime: 1.5 }],
  },
  {
    id: 'pretzel_cart',
    name: 'Twisted Pretzel Cart',
    subtitle: 'Warm salted knots on the avenue',
    tier: 'mini_kiosk',
    archetype: 'counter_stand',
    baseCostScale: 1.05,
    floor: '#d8c5a8',
    wall: '#f8eedc',
    accent: '#c97b36',
    roof: '#b5482a',
    dishes: [{ id: 'salted_pretzel', name: 'Butter Pretzel', icon: '🥨', color: '#c97b36', accent: '#f4d58d', style: 'oven', prepTime: 1.6 }],
  },
  {
    id: 'gelato_booth',
    name: 'Velvet Scoop Booth',
    subtitle: 'Artisan gelato cup stand',
    tier: 'mini_kiosk',
    archetype: 'counter_stand',
    baseCostScale: 1.05,
    floor: '#f1e4ec',
    wall: '#fff7fb',
    accent: '#ff70a6',
    roof: '#70d6ff',
    dishes: [{ id: 'pistachio_scoop', name: 'Swirl Gelato', icon: '🍨', color: '#ff99c8', accent: '#fcf6bd', style: 'dessert', prepTime: 1.5 }],
  },
  {
    id: 'boba_bar',
    name: 'Pearl Tea Kiosk',
    subtitle: 'Brown sugar boba booth',
    tier: 'mini_kiosk',
    archetype: 'counter_stand',
    baseCostScale: 1.08,
    floor: '#e6dfd5',
    wall: '#faf6f0',
    accent: '#9b5de5',
    roof: '#f15bb5',
    dishes: [{ id: 'milk_boba', name: 'Brown Sugar Boba', icon: '🧋', color: '#d4a373', accent: '#4a2c2a', style: 'blender', prepTime: 1.6 }],
  },
  {
    id: 'churro_stand',
    name: 'Golden Churro Stand',
    subtitle: 'Cinnamon sugar street bites',
    tier: 'mini_kiosk',
    archetype: 'counter_stand',
    baseCostScale: 1.05,
    floor: '#e8d4b7',
    wall: '#fff4e3',
    accent: '#e76f51',
    roof: '#2a9d8f',
    dishes: [{ id: 'cinnamon_churro', name: 'Cinnamon Churros', icon: '🥖', color: '#e9a84b', accent: '#8d4925', style: 'fryer', prepTime: 1.5 }],
  },

  // --- TIER 2: STREET STALLS (7 templates, 2 stations, lv 50) ---
  {
    id: 'bao_counter',
    name: 'Cloud Bao Stall',
    subtitle: 'Steamy hand-folded buns',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.15,
    floor: '#e0d3c3',
    wall: '#faf0e6',
    accent: '#e63946',
    roof: '#2b2d42',
    dishes: [
      { id: 'pork_bao', name: 'Braised Bao', icon: '🥟', color: '#f8edeb', accent: '#d62828', style: 'wok' },
      { id: 'jasmine_tea', name: 'Iced Jasmine', icon: '🍵', color: '#90be6d', accent: '#f9c74f', style: 'juicer' },
    ],
  },
  {
    id: 'waffle_hut',
    name: 'Crisp Waffle Hut',
    subtitle: 'Golden Belgian griddles',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.2,
    floor: '#ebd9c1',
    wall: '#fff8ec',
    accent: '#f4a261',
    roof: '#e76f51',
    dishes: [
      { id: 'berry_waffle', name: 'Berry Waffle', icon: '🧇', color: '#f4a261', accent: '#e63946', style: 'grill' },
      { id: 'cocoa_cup', name: 'Velvet Cocoa', icon: '☕', color: '#6f4e37', accent: '#f8edeb', style: 'espresso' },
    ],
  },
  {
    id: 'taco_shack',
    name: 'Sol Taco Shack',
    subtitle: 'Char-grilled street tacos',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.2,
    floor: '#e6cfb2',
    wall: '#fff3de',
    accent: '#06d6a0',
    roof: '#ef476f',
    dishes: [
      { id: 'al_pastor', name: 'Street Tacos', icon: '🌮', color: '#ffd166', accent: '#ef476f', style: 'grill' },
      { id: 'horchata', name: 'Sweet Horchata', icon: '🥛', color: '#f7ede2', accent: '#c97b36', style: 'juicer' },
    ],
  },
  {
    id: 'crepe_corner',
    name: 'Lace Crepe Corner',
    subtitle: 'Sweet & savory folded crepes',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.18,
    floor: '#e2dcd5',
    wall: '#faf8f5',
    accent: '#3a86ff',
    roof: '#ff006e',
    dishes: [
      { id: 'hazelnut_crepe', name: 'Hazelnut Crepe', icon: '🥞', color: '#e9c46a', accent: '#6d4c41', style: 'grill' },
      { id: 'berry_fizz', name: 'Berry Sparkler', icon: '🥤', color: '#ff5d8f', accent: '#a2d2ff', style: 'blender' },
    ],
  },
  {
    id: 'skewer_stand',
    name: 'Ember Skewer Stall',
    subtitle: 'Sizzling yakitori & spice',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.22,
    floor: '#d6cbc1',
    wall: '#f5ece4',
    accent: '#d90429',
    roof: '#2b2d42',
    dishes: [
      { id: 'glazed_skewer', name: 'Glazed Skewers', icon: '🍢', color: '#d95d39', accent: '#f18805', style: 'grill' },
      { id: 'rice_ball', name: 'Toasted Onigiri', icon: '🍙', color: '#f8f9fa', accent: '#2b2d42', style: 'sushi' },
    ],
  },
  {
    id: 'falafel_booth',
    name: 'Saffron Falafel Booth',
    subtitle: 'Crispy herb wraps',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.18,
    floor: '#e8d7be',
    wall: '#fcf5e8',
    accent: '#2a9d8f',
    roof: '#e9c46a',
    dishes: [
      { id: 'falafel_wrap', name: 'Herb Falafel', icon: '🧆', color: '#9c6644', accent: '#52b788', style: 'fryer' },
      { id: 'mint_cooler', name: 'Mint Cooler', icon: '🧃', color: '#52b788', accent: '#d8f3dc', style: 'juicer' },
    ],
  },
  {
    id: 'donut_kiosk',
    name: 'Glaze Ring Stand',
    subtitle: 'Warm frosted brioche rings',
    tier: 'street_stall',
    archetype: 'counter_stand',
    baseCostScale: 1.2,
    floor: '#f0dfea',
    wall: '#fff6fc',
    accent: '#ff6b9d',
    roof: '#6c5ce7',
    dishes: [
      { id: 'glazed_donut', name: 'Glazed Donut', icon: '🍩', color: '#ff85a1', accent: '#ffe5ec', style: 'fryer' },
      { id: 'cold_brew', name: 'Iced Cold Brew', icon: '🧊', color: '#7f5539', accent: '#ddb892', style: 'espresso' },
    ],
  },

  // --- TIER 3: FOOD VANS (5 templates, 3 stations, lv 75) ---
  {
    id: 'espresso_van',
    name: 'Roast & Roll Van',
    subtitle: 'Specialty mobile coffee truck',
    tier: 'food_van',
    archetype: 'food_truck',
    baseCostScale: 1.35,
    floor: '#c9d1d9',
    wall: '#edf2f4',
    accent: '#457b9d',
    roof: '#1d3557',
    dishes: [
      { id: 'flat_white', name: 'Velvet Latte', icon: '☕', color: '#b08968', accent: '#ede0d4', style: 'espresso' },
      { id: 'croissant', name: 'Flaky Croissant', icon: '🥐', color: '#e9a84b', accent: '#faedcd', style: 'oven' },
      { id: 'matcha_shake', name: 'Matcha Frappe', icon: '🥤', color: '#74c69d', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'smash_truck',
    name: 'Smash Wagon',
    subtitle: 'Crispy-edge street burgers',
    tier: 'food_van',
    archetype: 'food_truck',
    baseCostScale: 1.4,
    floor: '#cfd4d8',
    wall: '#f8f9fa',
    accent: '#e63946',
    roof: '#ffb703',
    dishes: [
      { id: 'curly_fries', name: 'Seasoned Fries', icon: '🍟', color: '#ffb703', accent: '#e63946', style: 'fryer' },
      { id: 'smash_burger', name: 'Smash Burger', icon: '🍔', color: '#c97b36', accent: '#52b788', style: 'grill' },
      { id: 'vanilla_shake', name: 'Malt Shake', icon: '🥛', color: '#ffcad4', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'ramen_wagon',
    name: 'Midnight Broth Truck',
    subtitle: 'Simmering noodle wagon',
    tier: 'food_van',
    archetype: 'food_truck',
    baseCostScale: 1.42,
    floor: '#c4cbd4',
    wall: '#f1f3f5',
    accent: '#d62828',
    roof: '#22223b',
    dishes: [
      { id: 'gyoza_tray', name: 'Crispy Gyoza', icon: '🥟', color: '#e6b89c', accent: '#c1121f', style: 'wok' },
      { id: 'tonkotsu', name: 'Rich Ramen', icon: '🍜', color: '#f4a261', accent: '#e76f51', style: 'wok' },
      { id: 'melon_soda', name: 'Melon Fizz', icon: '🍈', color: '#80ed99', accent: '#ffffff', style: 'juicer' },
    ],
  },
  {
    id: 'scoop_mobile',
    name: 'Sundae Cruiser',
    subtitle: 'Pastel dessert truck',
    tier: 'food_van',
    archetype: 'food_truck',
    baseCostScale: 1.38,
    floor: '#d8e2dc',
    wall: '#fff1f5',
    accent: '#ff70a6',
    roof: '#72efdd',
    dishes: [
      { id: 'sorbet_cup', name: 'Mango Sorbet', icon: '🍧', color: '#ffbe0b', accent: '#fb5607', style: 'dessert' },
      { id: 'waffle_cone', name: 'Triple Cone', icon: '🍦', color: '#ff99c8', accent: '#f4a261', style: 'dessert' },
      { id: 'banana_split', name: 'Royale Sundae', icon: '🍨', color: '#c77dff', accent: '#ff006e', style: 'dessert' },
    ],
  },
  {
    id: 'lobster_van',
    name: 'Harbor Roll Van',
    subtitle: 'Coastal buttered seafood truck',
    tier: 'food_van',
    archetype: 'food_truck',
    baseCostScale: 1.45,
    floor: '#cbd5e1',
    wall: '#f8fafc',
    accent: '#0096c7',
    roof: '#ef476f',
    dishes: [
      { id: 'chowder_cup', name: 'Clam Chowder', icon: '🥣', color: '#fefae0', accent: '#bc6c25', style: 'wok' },
      { id: 'lobster_roll', name: 'Butter Roll', icon: '🦞', color: '#ef476f', accent: '#ffd166', style: 'grill' },
      { id: 'citrus_spritz', name: 'Sea Breeze', icon: '🍹', color: '#48cae4', accent: '#ffd166', style: 'juicer' },
    ],
  },

  // --- TIER 4: NEIGHBORHOOD EATERIES (13 templates, 4-7 stations, lv 150) ---
  {
    id: 'courtyard_cafe',
    name: 'Sunlit Courtyard Café',
    subtitle: 'Bistro tables & roasted espresso',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.6,
    floor: '#e6dccf',
    wall: '#faf6f0',
    accent: '#2a9d8f',
    roof: '#264653',
    dishes: [
      { id: 'espresso_shot', name: 'Espresso', icon: '☕', color: '#6f4e37', accent: '#ddb892', style: 'espresso' },
      { id: 'avocado_toast', name: 'Avocado Toast', icon: '🥑', color: '#70e000', accent: '#bc6c25', style: 'grill' },
      { id: 'berry_tart', name: 'Berry Tart', icon: '🥧', color: '#ff5d8f', accent: '#f4a261', style: 'oven' },
      { id: 'caramel_latte', name: 'Caramel Mocha', icon: '🧋', color: '#c68b59', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'woodfire_trattoria',
    name: 'Fiamma Trattoria',
    subtitle: 'Stone-baked Neapolitan pies',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.7,
    floor: '#e5cdb6',
    wall: '#fff4e6',
    accent: '#d62828',
    roof: '#2b9348',
    dishes: [
      { id: 'garlic_knots', name: 'Garlic Knots', icon: '🥖', color: '#e9c46a', accent: '#52b788', style: 'oven' },
      { id: 'margherita', name: 'Woodfire Pizza', icon: '🍕', color: '#e63946', accent: '#ffd166', style: 'oven' },
      { id: 'truffle_pasta', name: 'Truffle Pasta', icon: '🍝', color: '#f4d35e', accent: '#9b2226', style: 'wok' },
      { id: 'tiramisu', name: 'Tiramisu', icon: '🍰', color: '#d4a373', accent: '#4a2c2a', style: 'dessert' },
    ],
  },
  {
    id: 'sakura_sushi',
    name: 'Koi Sushi Bar',
    subtitle: 'Hand-rolled nigiri & maki lounge',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.75,
    floor: '#ded4c4',
    wall: '#f8f5ef',
    accent: '#e63946',
    roof: '#1d3557',
    dishes: [
      { id: 'edamame', name: 'Sea Salt Edamame', icon: '🫛', color: '#74c69d', accent: '#2d6a4f', style: 'wok' },
      { id: 'salmon_nigiri', name: 'Salmon Nigiri', icon: '🍣', color: '#ff758f', accent: '#ffffff', style: 'sushi' },
      { id: 'dragon_roll', name: 'Dragon Roll', icon: '🍥', color: '#52b788', accent: '#ff9f1c', style: 'sushi' },
      { id: 'tempura_box', name: 'Crispy Tempura', icon: '🍤', color: '#f4a261', accent: '#e76f51', style: 'fryer' },
      { id: 'matcha_mochi', name: 'Matcha Mochi', icon: '🍡', color: '#95d5b2', accent: '#ff99c8', style: 'dessert' },
    ],
  },
  {
    id: 'sunset_drive_in',
    name: 'Comet Drive-Thru',
    subtitle: 'Turbo lane burgers & shakes',
    tier: 'eatery',
    archetype: 'drive_thru',
    baseCostScale: 1.8,
    floor: '#94a3b8',
    wall: '#f1f5f9',
    accent: '#ef4444',
    roof: '#0ea5e9',
    dishes: [
      { id: 'cola_cup', name: 'Fizz Cola', icon: '🥤', color: '#dc2626', accent: '#ffffff', style: 'juicer' },
      { id: 'crisp_fries', name: 'Golden Fries', icon: '🍟', color: '#facc15', accent: '#ef4444', style: 'fryer' },
      { id: 'chicken_tenders', name: 'Crispy Tenders', icon: '🍗', color: '#d97706', accent: '#fef08a', style: 'fryer' },
      { id: 'double_melt', name: 'Comet Burger', icon: '🍔', color: '#b45309', accent: '#22c55e', style: 'grill' },
      { id: 'onion_rings', name: 'Onion Rings', icon: '🧅', color: '#f59e0b', accent: '#fef3c7', style: 'fryer' },
      { id: 'apple_pie', name: 'Warm Hand Pie', icon: '🥧', color: '#ea580c', accent: '#fde68a', style: 'oven' },
      { id: 'mega_shake', name: 'Orbit Shake', icon: '🍨', color: '#ec4899', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'harbor_fishbar',
    name: 'Pier 9 Fish & Chips',
    subtitle: 'Crispy coastal baskets',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.65,
    floor: '#d4dce3',
    wall: '#f5f8fa',
    accent: '#0077b6',
    roof: '#023e8a',
    dishes: [
      { id: 'mushy_peas', name: 'Herb Chips', icon: '🍟', color: '#f4d35e', accent: '#52b788', style: 'fryer' },
      { id: 'cod_basket', name: 'Crispy Cod', icon: '🐟', color: '#e9a84b', accent: '#0077b6', style: 'fryer' },
      { id: 'calamari', name: 'Fried Calamari', icon: '🦑', color: '#f4a261', accent: '#ffccd5', style: 'fryer' },
      { id: 'shrimp_skewer', name: 'Garlic Prawns', icon: '🍤', color: '#fb8500', accent: '#ffd166', style: 'grill' },
      { id: 'lemon_cake', name: 'Lemon Drizzle', icon: '🍰', color: '#ffe66d', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'patisserie_salon',
    name: 'Éclair Patisserie',
    subtitle: 'Parisian pastries & tea salon',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.72,
    floor: '#f2e8eb',
    wall: '#fffafb',
    accent: '#e07a9a',
    roof: '#6d597a',
    dishes: [
      { id: 'macarons', name: 'Pastel Macarons', icon: '🧁', color: '#ffafcc', accent: '#bde0fe', style: 'dessert' },
      { id: 'choco_eclair', name: 'Silk Éclair', icon: '🍫', color: '#6f4e37', accent: '#f8edeb', style: 'dessert' },
      { id: 'mille_feuille', name: 'Mille-Feuille', icon: '🍰', color: '#f4d58d', accent: '#e07a9a', style: 'oven' },
      { id: 'earl_grey', name: 'Floral Tea Pot', icon: '🫖', color: '#b5838d', accent: '#ffd166', style: 'espresso' },
      { id: 'berry_brioche', name: 'Crown Brioche', icon: '🥐', color: '#e9a84b', accent: '#ff5d8f', style: 'oven' },
    ],
  },
  {
    id: 'cantina_grill',
    name: 'Agave Burrito Cantina',
    subtitle: 'Sizzling bowls & fresh salsa',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.68,
    floor: '#e8d0b3',
    wall: '#fff4e4',
    accent: '#e76f51',
    roof: '#2a9d8f',
    dishes: [
      { id: 'guac_chips', name: 'Guac & Chips', icon: '🥑', color: '#70e000', accent: '#ffd166', style: 'sushi' },
      { id: 'loaded_burrito', name: 'Loaded Burrito', icon: '🌯', color: '#e9c46a', accent: '#e76f51', style: 'grill' },
      { id: 'quesadilla', name: 'Melt Quesadilla', icon: '🧀', color: '#ffb703', accent: '#fb8500', style: 'grill' },
      { id: 'churro_bowl', name: 'Dulce Sundae', icon: '🍨', color: '#d4a373', accent: '#e76f51', style: 'dessert' },
    ],
  },
  {
    id: 'mezze_lounge',
    name: 'Cedar Mezze House',
    subtitle: 'Charcoal kebabs & warm flatbreads',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.75,
    floor: '#e6d7c3',
    wall: '#faf3e8',
    accent: '#c8553d',
    roof: '#1d4e89',
    dishes: [
      { id: 'hummus_plate', name: 'Velvet Hummus', icon: '🫓', color: '#f4d58d', accent: '#52b788', style: 'sushi' },
      { id: 'shawarma', name: 'Spiced Shawarma', icon: '🥙', color: '#c8553d', accent: '#ffd166', style: 'grill' },
      { id: 'lamb_kebab', name: 'Charcoal Kebab', icon: '🍢', color: '#9b2226', accent: '#f4a261', style: 'grill' },
      { id: 'baklava', name: 'Pistachio Baklava', icon: '🍯', color: '#dda15e', accent: '#606c38', style: 'oven' },
      { id: 'cardamom_coffee', name: 'Spiced Coffee', icon: '☕', color: '#582f0e', accent: '#f4d58d', style: 'espresso' },
    ],
  },
  {
    id: 'noodle_house',
    name: 'Lantern Noodle House',
    subtitle: 'Hand-pulled broths & dumplings',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.7,
    floor: '#dfd3c3',
    wall: '#f7f1e8',
    accent: '#c1121f',
    roof: '#1b263b',
    dishes: [
      { id: 'soup_dumpling', name: 'Soup Dumplings', icon: '🥟', color: '#f8edeb', accent: '#e63946', style: 'wok' },
      { id: 'dan_dan', name: 'Spicy Dan Dan', icon: '🍜', color: '#e63946', accent: '#f4a261', style: 'wok' },
      { id: 'wok_rice', name: 'Wok Fried Rice', icon: '🍛', color: '#e9c46a', accent: '#52b788', style: 'wok' },
      { id: 'mango_pudding', name: 'Mango Pudding', icon: '🍮', color: '#ffb703', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'cheese_cellar',
    name: 'Alpine Fondue Cellar',
    subtitle: 'Artisan wheels & melted pots',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.78,
    floor: '#d7c8b6',
    wall: '#f5efe6',
    accent: '#d4a373',
    roof: '#6c584c',
    dishes: [
      { id: 'brie_board', name: 'Brie Board', icon: '🧀', color: '#ffd166', accent: '#bc6c25', style: 'sushi' },
      { id: 'raclette', name: 'Warm Raclette', icon: '🥔', color: '#f4d35e', accent: '#e76f51', style: 'grill' },
      { id: 'cheese_fondue', name: 'Alpine Fondue', icon: '🫕', color: '#ffb703', accent: '#8d4925', style: 'cauldron' },
      { id: 'pretzel_baguette', name: 'Crusty Loaf', icon: '🥖', color: '#bc6c25', accent: '#fefae0', style: 'oven' },
      { id: 'apple_strudel', name: 'Apple Strudel', icon: '🥧', color: '#e9a84b', accent: '#e63946', style: 'oven' },
      { id: 'spiced_cider', name: 'Mulled Cider', icon: '🍎', color: '#c1121f', accent: '#ffd166', style: 'juicer' },
    ],
  },
  {
    id: 'poke_pavilion',
    name: 'Coral Poke Pavilion',
    subtitle: 'Island bowls & tropical smoothies',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.65,
    floor: '#dceae8',
    wall: '#f5fbfa',
    accent: '#00b4d8',
    roof: '#ff6b6b',
    dishes: [
      { id: 'acai_cup', name: 'Açaí Bowl', icon: '🫐', color: '#7209b7', accent: '#ff99c8', style: 'blender' },
      { id: 'ahi_poke', name: 'Ahi Poke Bowl', icon: '🥗', color: '#ff6b6b', accent: '#52b788', style: 'sushi' },
      { id: 'salmon_poke', name: 'Citrus Salmon', icon: '🐟', color: '#ff9f1c', accent: '#90e0ef', style: 'sushi' },
      { id: 'coconut_cooler', name: 'Coco Cooler', icon: '🥥', color: '#f8f9fa', accent: '#00b4d8', style: 'juicer' },
    ],
  },
  {
    id: 'curry_tavern',
    name: 'Saffron Curry Tavern',
    subtitle: 'Tandoor ovens & fragrant spices',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.76,
    floor: '#e5cfb8',
    wall: '#fdf4e7',
    accent: '#f77f00',
    roof: '#9b2226',
    dishes: [
      { id: 'garlic_naan', name: 'Tandoor Naan', icon: '🫓', color: '#f4d58d', accent: '#52b788', style: 'oven' },
      { id: 'samosa_trio', name: 'Crisp Samosas', icon: '🥟', color: '#e9a84b', accent: '#d62828', style: 'fryer' },
      { id: 'butter_tikka', name: 'Saffron Tikka', icon: '🍛', color: '#f77f00', accent: '#ffd166', style: 'cauldron' },
      { id: 'biryani_pot', name: 'Royal Biryani', icon: '🍲', color: '#d62828', accent: '#f4d35e', style: 'wok' },
      { id: 'mango_lassi', name: 'Mango Lassi', icon: '🥭', color: '#ffbe0b', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'roastery_lounge',
    name: 'Velvet Roast House',
    subtitle: 'Artisan pour-overs & brunch plates',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.72,
    floor: '#dfd6cc',
    wall: '#faf7f2',
    accent: '#6f4e37',
    roof: '#3d405b',
    dishes: [
      { id: 'pour_over', name: 'Pour-Over Brew', icon: '☕', color: '#7f5539', accent: '#ddb892', style: 'espresso' },
      { id: 'cinnamon_roll', name: 'Swirl Bun', icon: '🥐', color: '#d4a373', accent: '#ffffff', style: 'oven' },
      { id: 'eggs_benedict', name: 'Brioche Benedict', icon: '🍳', color: '#ffd166', accent: '#e76f51', style: 'grill' },
      { id: 'pancake_stack', name: 'Maple Stack', icon: '🥞', color: '#e9a84b', accent: '#c97b36', style: 'grill' },
      { id: 'iced_matcha', name: 'Oat Matcha', icon: '🍵', color: '#74c69d', accent: '#f8f9fa', style: 'blender' },
      { id: 'cheesecake', name: 'Burnt Cheesecake', icon: '🍰', color: '#f4d58d', accent: '#9c6644', style: 'dessert' },
    ],
  },

  // --- TIER 5: GRAND FLAGSHIPS (8 templates, 10 stations, lv 250) ---
  {
    id: 'grand_brasserie',
    name: 'Lumière Grand Brasserie',
    subtitle: '10-station metropolitan dining hall',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.1,
    floor: '#e2d7c9',
    wall: '#fcf8f2',
    accent: '#c9a227',
    roof: '#1b263b',
    dishes: [
      { id: 'sparkling_water', name: 'Citrus Spritz', icon: '🥂', color: '#90e0ef', accent: '#ffd166', style: 'juicer' },
      { id: 'artisan_bread', name: 'Herb Baguette', icon: '🥖', color: '#e9a84b', accent: '#fefae0', style: 'oven' },
      { id: 'french_onion', name: 'Onion Gratinée', icon: '🥣', color: '#bc6c25', accent: '#ffd166', style: 'cauldron' },
      { id: 'caesar_salad', name: 'Garden Salad', icon: '🥗', color: '#52b788', accent: '#f4d58d', style: 'sushi' },
      { id: 'truffle_fries', name: 'Truffle Frites', icon: '🍟', color: '#f4d35e', accent: '#6c584c', style: 'fryer' },
      { id: 'duck_confit', name: 'Herb Roast Duck', icon: '🍗', color: '#c8553d', accent: '#f4a261', style: 'oven' },
      { id: 'seared_scallops', name: 'Gold Scallops', icon: '🦪', color: '#ffcad4', accent: '#ffd166', style: 'grill' },
      { id: 'filet_mignon', name: 'Seared Tenderloin', icon: '🥩', color: '#9b2226', accent: '#e9c46a', style: 'grill' },
      { id: 'lobster_thermidor', name: 'Royal Lobster', icon: '🦞', color: '#ef476f', accent: '#ffd166', style: 'wok' },
      { id: 'gold_souffle', name: 'Starlight Soufflé', icon: '🍮', color: '#ffd166', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'skyview_diner',
    name: 'Starlight Retro Diner',
    subtitle: 'Neon booths & classic American favorites',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.15,
    floor: '#d9e2ec',
    wall: '#f8fafc',
    accent: '#ef476f',
    roof: '#06d6a0',
    dishes: [
      { id: 'diner_coffee', name: 'Bottomless Joe', icon: '☕', color: '#6f4e37', accent: '#ffffff', style: 'espresso' },
      { id: 'hash_browns', name: 'Crisp Hashbrowns', icon: '🥔', color: '#f4a261', accent: '#e9c46a', style: 'grill' },
      { id: 'blueberry_stack', name: 'Blueberry Stack', icon: '🥞', color: '#e9a84b', accent: '#4361ee', style: 'grill' },
      { id: 'chili_fries', name: 'Loaded Fries', icon: '🍟', color: '#ffb703', accent: '#d62828', style: 'fryer' },
      { id: 'club_sandwich', name: 'Triple Club', icon: '🥪', color: '#e9c46a', accent: '#52b788', style: 'sushi' },
      { id: 'buffalo_wings', name: 'Glazed Wings', icon: '🍗', color: '#e63946', accent: '#ffd166', style: 'fryer' },
      { id: 'bacon_burger', name: 'Double Deluxe', icon: '🍔', color: '#b5651d', accent: '#ef476f', style: 'grill' },
      { id: 'bbq_ribs', name: 'Smokehouse Ribs', icon: '🍖', color: '#9b2226', accent: '#f4a261', style: 'oven' },
      { id: 'cherry_pie', name: 'Warm Cherry Pie', icon: '🥧', color: '#d90429', accent: '#f4d58d', style: 'oven' },
      { id: 'galaxy_malt', name: 'Galaxy Float', icon: '🍨', color: '#9b5de5', accent: '#ff70a6', style: 'blender' },
    ],
  },
  {
    id: 'highway_express',
    name: 'Turbo Express Super-Hub',
    subtitle: 'Dual-zone drive-thru & takeout complex',
    tier: 'flagship',
    archetype: 'drive_thru',
    baseCostScale: 2.2,
    floor: '#9ca3af',
    wall: '#f3f4f6',
    accent: '#f97316',
    roof: '#2563eb',
    dishes: [
      { id: 'iced_soda', name: 'Turbo Fizz', icon: '🥤', color: '#3b82f6', accent: '#ffffff', style: 'juicer' },
      { id: 'nuggets', name: 'Crisp Nuggets', icon: '🍗', color: '#f59e0b', accent: '#fef3c7', style: 'fryer' },
      { id: 'waffle_fries', name: 'Waffle Fries', icon: '🍟', color: '#facc15', accent: '#ef4444', style: 'fryer' },
      { id: 'hotdog_deluxe', name: 'Chili Dog', icon: '🌭', color: '#dc2626', accent: '#fde047', style: 'grill' },
      { id: 'crispy_wrap', name: 'Ranch Wrap', icon: '🌯', color: '#fde68a', accent: '#22c55e', style: 'sushi' },
      { id: 'spicy_chicken', name: 'Blaze Sandwich', icon: '🍔', color: '#ea580c', accent: '#fbbf24', style: 'fryer' },
      { id: 'mega_burger', name: 'Quad Stacker', icon: '🍔', color: '#92400e', accent: '#ef4444', style: 'grill' },
      { id: 'pizza_slice', name: 'Express Slice', icon: '🍕', color: '#ef4444', accent: '#fde047', style: 'oven' },
      { id: 'brownie_box', name: 'Fudge Brownie', icon: '🍫', color: '#451a03', accent: '#fcd34d', style: 'oven' },
      { id: 'swirl_blast', name: 'Cookie Blast', icon: '🍦', color: '#38bdf8', accent: '#ffffff', style: 'blender' },
    ],
  },
  {
    id: 'riviera_seafood',
    name: 'Azure Riviera Seafood Hall',
    subtitle: 'Oceanfront oyster & grill emporium',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.15,
    floor: '#d8e8f0',
    wall: '#f4fafd',
    accent: '#0096c7',
    roof: '#03045e',
    dishes: [
      { id: 'sea_tonic', name: 'Blue Citrus Tonic', icon: '🍹', color: '#48cae4', accent: '#ffffff', style: 'juicer' },
      { id: 'oyster_plate', name: 'Fresh Oysters', icon: '🦪', color: '#cbd5e1', accent: '#ffd166', style: 'sushi' },
      { id: 'bisque_bowl', name: 'Lobster Bisque', icon: '🥣', color: '#f77f00', accent: '#fefae0', style: 'cauldron' },
      { id: 'crab_cakes', name: 'Golden Crab Cakes', icon: '🦀', color: '#e76f51', accent: '#ffd166', style: 'fryer' },
      { id: 'garlic_mussels', name: 'Steamed Mussels', icon: '🍲', color: '#2b2d42', accent: '#f4d35e', style: 'wok' },
      { id: 'grilled_branzino', name: 'Herb Sea Bass', icon: '🐟', color: '#90e0ef', accent: '#52b788', style: 'grill' },
      { id: 'seafood_paella', name: 'Saffron Paella', icon: '🥘', color: '#ffb703', accent: '#e63946', style: 'wok' },
      { id: 'king_crab', name: 'King Crab Legs', icon: '🦞', color: '#ef476f', accent: '#ffd166', style: 'wok' },
      { id: 'caviar_blini', name: 'Pearl Caviar', icon: '🍣', color: '#1d3557', accent: '#ffd166', style: 'sushi' },
      { id: 'key_lime', name: 'Key Lime Tart', icon: '🥧', color: '#80ed99', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'royal_omakase',
    name: 'Kintsugi Imperial Kitchen',
    subtitle: 'Master teppan, sushi & kaiseki hall',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.2,
    floor: '#ded2be',
    wall: '#f9f4eb',
    accent: '#c1121f',
    roof: '#14213d',
    dishes: [
      { id: 'sencha_cup', name: 'Imperial Sencha', icon: '🍵', color: '#74c69d', accent: '#f4d35e', style: 'espresso' },
      { id: 'miso_broth', name: 'Truffle Miso', icon: '🥣', color: '#d4a373', accent: '#52b788', style: 'cauldron' },
      { id: 'takoyaki', name: 'Sizzle Takoyaki', icon: '🍡', color: '#e9a84b', accent: '#9b2226', style: 'grill' },
      { id: 'katsu_sando', name: 'Crisp Katsu', icon: '🥪', color: '#dda15e', accent: '#f8f9fa', style: 'fryer' },
      { id: 'toro_nigiri', name: 'Toro Omakase', icon: '🍣', color: '#ff758f', accent: '#ffffff', style: 'sushi' },
      { id: 'black_ramen', name: 'Black Garlic Ramen', icon: '🍜', color: '#2b2d42', accent: '#ffd166', style: 'wok' },
      { id: 'unagi_bowl', name: 'Glazed Unagi Don', icon: '🍱', color: '#9c6644', accent: '#ffd166', style: 'grill' },
      { id: 'wagyu_teppan', name: 'A5 Wagyu Teppan', icon: '🥩', color: '#c1121f', accent: '#ffccd5', style: 'grill' },
      { id: 'uni_platter', name: 'Golden Uni', icon: '🦀', color: '#ff9f1c', accent: '#14213d', style: 'sushi' },
      { id: 'yuzu_parfait', name: 'Gold Leaf Parfait', icon: '🍨', color: '#ffd166', accent: '#74c69d', style: 'dessert' },
    ],
  },
  {
    id: 'botanical_kitchen',
    name: 'Verdant Greenhouse Kitchen',
    subtitle: 'Farm-to-table glasshouse flagship',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.1,
    floor: '#dce6d5',
    wall: '#f6faf3',
    accent: '#2d6a4f',
    roof: '#52b788',
    dishes: [
      { id: 'green_elixir', name: 'Garden Elixir', icon: '🧃', color: '#52b788', accent: '#d8f3dc', style: 'juicer' },
      { id: 'sourdough', name: 'Wild Sourdough', icon: '🍞', color: '#dda15e', accent: '#fefae0', style: 'oven' },
      { id: 'burrata_bowl', name: 'Heirloom Burrata', icon: '🍅', color: '#e63946', accent: '#ffffff', style: 'sushi' },
      { id: 'squash_veloute', name: 'Harvest Velouté', icon: '🥣', color: '#f77f00', accent: '#ffd166', style: 'cauldron' },
      { id: 'wild_risotto', name: 'Morel Risotto', icon: '🥘', color: '#d4a373', accent: '#606c38', style: 'wok' },
      { id: 'woodfire_flatbread', name: 'Fig Flatbread', icon: '🍕', color: '#9d4edd', accent: '#f4d58d', style: 'oven' },
      { id: 'herb_gnocchi', name: 'Pesto Gnocchi', icon: '🍝', color: '#40916c', accent: '#fefae0', style: 'wok' },
      { id: 'truffle_wellington', name: 'Porcini Wellington', icon: '🥧', color: '#bc6c25', accent: '#52b788', style: 'oven' },
      { id: 'saffron_tagine', name: 'Orchard Tagine', icon: '🍲', color: '#e9c46a', accent: '#e76f51', style: 'cauldron' },
      { id: 'honey_pavlova', name: 'Blossom Pavlova', icon: '🍰', color: '#ffcad4', accent: '#ffd166', style: 'dessert' },
    ],
  },
  {
    id: 'ember_steakhouse',
    name: 'Obsidian Ember Steakhouse',
    subtitle: 'Open-hearth woodfire chophouse',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.2,
    floor: '#cfc5be',
    wall: '#f5efe9',
    accent: '#bc4749',
    roof: '#2b2d42',
    dishes: [
      { id: 'smoked_tonic', name: 'Smoked Ginger', icon: '🥃', color: '#d97706', accent: '#fef3c7', style: 'juicer' },
      { id: 'wedge_salad', name: 'Crisp Wedge', icon: '🥗', color: '#52b788', accent: '#ffffff', style: 'sushi' },
      { id: 'bone_marrow', name: 'Roasted Marrow', icon: '🍖', color: '#bc6c25', accent: '#52b788', style: 'oven' },
      { id: 'truffle_mac', name: 'Baked Truffle Mac', icon: '🧀', color: '#ffb703', accent: '#bc6c25', style: 'oven' },
      { id: 'crab_bisque', name: 'Smoked Bisque', icon: '🥣', color: '#e76f51', accent: '#f4d58d', style: 'cauldron' },
      { id: 'lamb_chops', name: 'Herb Lamb Rack', icon: '🍗', color: '#9b2226', accent: '#52b788', style: 'grill' },
      { id: 'ribeye', name: 'Prime Ribeye', icon: '🥩', color: '#ae2012', accent: '#f4a261', style: 'grill' },
      { id: 'surf_turf', name: 'Surf & Turf', icon: '🦞', color: '#ef476f', accent: '#9b2226', style: 'grill' },
      { id: 'tomahawk', name: 'Gold Tomahawk', icon: '🍖', color: '#780000', accent: '#ffd166', style: 'grill' },
      { id: 'lava_cake', name: 'Molten Lava Cake', icon: '🍰', color: '#3c1608', accent: '#ff9f1c', style: 'dessert' },
    ],
  },
  {
    id: 'spice_palace',
    name: 'Marigold Grand Palace',
    subtitle: 'Opulent spice banquet hall',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.18,
    floor: '#ebd9be',
    wall: '#fff6e8',
    accent: '#d97706',
    roof: '#7c2d12',
    dishes: [
      { id: 'rose_sherbet', name: 'Rose Sherbet', icon: '🍹', color: '#fb7185', accent: '#ffffff', style: 'juicer' },
      { id: 'crispy_papad', name: 'Spiced Papad', icon: '🫓', color: '#f4d35e', accent: '#e76f51', style: 'fryer' },
      { id: 'paneer_tikka', name: 'Char Paneer', icon: '🧀', color: '#f77f00', accent: '#52b788', style: 'grill' },
      { id: 'dal_makhani', name: 'Velvet Dal', icon: '🍲', color: '#9c6644', accent: '#ffd166', style: 'cauldron' },
      { id: 'garlic_kulcha', name: 'Stuffed Kulcha', icon: '🥖', color: '#e9c46a', accent: '#52b788', style: 'oven' },
      { id: 'tandoori_prawn', name: 'Tandoor Prawns', icon: '🍤', color: '#e63946', accent: '#ffd166', style: 'grill' },
      { id: 'rogan_josh', name: 'Royal Curry', icon: '🍛', color: '#c1121f', accent: '#f4a261', style: 'cauldron' },
      { id: 'saffron_biryani', name: 'Crown Biryani', icon: '🥘', color: '#ffb703', accent: '#d62828', style: 'wok' },
      { id: 'kebab_feast', name: 'Emperor Platter', icon: '🍢', color: '#b5651d', accent: '#ffd166', style: 'grill' },
      { id: 'gulab_gold', name: 'Golden Gulab', icon: '🍮', color: '#e9a84b', accent: '#ff99c8', style: 'dessert' },
    ],
  },

  // --- SPECIAL EVENT & ADVENTURE VENUES ---
  {
    id: 'event_crystal_cavern',
    name: 'Crystal Cavern Refinery',
    subtitle: 'Subterranean mineral-brew kitchen',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.0,
    floor: '#334155',
    wall: '#1e293b',
    accent: '#38bdf8',
    roof: '#0f172a',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'quartz_fizz', name: 'Quartz Tonic', icon: '💎', color: '#38bdf8', accent: '#e0f2fe', style: 'juicer' },
      { id: 'ember_spud', name: 'Coal Baked Spud', icon: '🥔', color: '#f97316', accent: '#fef08a', style: 'oven' },
      { id: 'amber_honey', name: 'Amber Honeycomb', icon: '🍯', color: '#f59e0b', accent: '#fef3c7', style: 'cauldron' },
      { id: 'glow_shroom', name: 'Glow Shroom Skewers', icon: '🍄', color: '#a855f7', accent: '#38bdf8', style: 'grill' },
      { id: 'cobalt_broth', name: 'Deep Cavern Stew', icon: '🍲', color: '#0284c7', accent: '#7dd3fc', style: 'cauldron' },
      { id: 'pyrite_pie', name: 'Miner Pasty', icon: '🥧', color: '#d97706', accent: '#fde68a', style: 'oven' },
      { id: 'ruby_noodles', name: 'Magma Noodles', icon: '🍜', color: '#ef4444', accent: '#fb923c', style: 'wok' },
      { id: 'emerald_tart', name: 'Jade Tart', icon: '🍰', color: '#10b981', accent: '#d1fae5', style: 'dessert' },
      { id: 'obsidian_roast', name: 'Basalt Roast', icon: '🥩', color: '#7f1d1d', accent: '#f97316', style: 'grill' },
      { id: 'diamond_gelato', name: 'Star Crystal Sorbet', icon: '🍨', color: '#67e8f9', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'event_tidewater_pier',
    name: 'Tidewater Grand Pier',
    subtitle: 'Nautical floating seafood festival',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.0,
    floor: '#b08968',
    wall: '#e0f2fe',
    accent: '#0284c7',
    roof: '#0369a1',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'kelp_chips', name: 'Sea Salt Crisps', icon: '🥬', color: '#10b981', accent: '#a7f3d0', style: 'fryer' },
      { id: 'barnacle_chowder', name: 'Pier Chowder', icon: '🥣', color: '#fef3c7', accent: '#0284c7', style: 'cauldron' },
      { id: 'anchovy_toast', name: 'Harbor Toast', icon: '🥖', color: '#f59e0b', accent: '#38bdf8', style: 'oven' },
      { id: 'oyster_grill', name: 'Charred Oysters', icon: '🦪', color: '#94a3b8', accent: '#fbbf24', style: 'grill' },
      { id: 'octopus_taco', name: 'Octopus Tacos', icon: '🌮', color: '#f43f5e', accent: '#fde047', style: 'grill' },
      { id: 'squid_rings', name: 'Golden Calamari', icon: '🦑', color: '#fb923c', accent: '#ffedd5', style: 'fryer' },
      { id: 'tuna_poke', name: 'Captain Poke', icon: '🍣', color: '#ef4444', accent: '#34d399', style: 'sushi' },
      { id: 'scallop_pasta', name: 'Tide Linguine', icon: '🍝', color: '#fde047', accent: '#0ea5e9', style: 'wok' },
      { id: 'crab_feast', name: 'Admiral Crab', icon: '🦀', color: '#dc2626', accent: '#fef08a', style: 'wok' },
      { id: 'pearl_parfait', name: 'Mermaid Parfait', icon: '🍨', color: '#38bdf8', accent: '#f472b6', style: 'dessert' },
    ],
  },
  {
    id: 'event_lunar_outpost',
    name: 'Lunar Biodome Outpost',
    subtitle: 'Low-gravity orbital culinary lab',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.1,
    floor: '#cbd5e1',
    wall: '#0f172a',
    accent: '#8b5cf6',
    roof: '#312e81',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'comet_juice', name: 'Nebula Nectar', icon: '🧪', color: '#38bdf8', accent: '#c084fc', style: 'juicer' },
      { id: 'astro_berries', name: 'Zero-G Berries', icon: '🫐', color: '#8b5cf6', accent: '#f472b6', style: 'blender' },
      { id: 'crater_lettuce', name: 'Hydro Greens', icon: '🥗', color: '#22c55e', accent: '#a7f3d0', style: 'sushi' },
      { id: 'solar_melon', name: 'Solar Melon Cup', icon: '🍈', color: '#facc15', accent: '#fb923c', style: 'juicer' },
      { id: 'mars_yam', name: 'Red Dust Fries', icon: '🍟', color: '#ef4444', accent: '#fcd34d', style: 'fryer' },
      { id: 'orbit_ramen', name: 'Plasma Ramen', icon: '🍜', color: '#ec4899', accent: '#38bdf8', style: 'wok' },
      { id: 'ion_burger', name: 'Orbital Burger', icon: '🍔', color: '#f97316', accent: '#a855f7', style: 'grill' },
      { id: 'star_truffle', name: 'Cosmos Risotto', icon: '🥘', color: '#6366f1', accent: '#fde047', style: 'cauldron' },
      { id: 'supernova_steak', name: 'Nova Sear', icon: '🥩', color: '#be123c', accent: '#fbbf24', style: 'grill' },
      { id: 'eclipse_dome', name: 'Eclipse Mousse', icon: '🍮', color: '#c084fc', accent: '#fef08a', style: 'dessert' },
    ],
  },
  {
    id: 'event_citadel_orchard',
    name: 'Citadel Harvest Orchard',
    subtitle: 'Stage 1 of 3 — Royal Festival Grounds',
    tier: 'food_van',
    archetype: 'counter_stand',
    baseCostScale: 1.5,
    floor: '#d4c39f',
    wall: '#f4ebd0',
    accent: '#65a30d',
    roof: '#9a3412',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'orchard_cider', name: 'Pressed Cider', icon: '🍎', color: '#dc2626', accent: '#fde047', style: 'juicer' },
      { id: 'hearth_loaf', name: 'Hearth Bread', icon: '🍞', color: '#d97706', accent: '#fef3c7', style: 'oven' },
      { id: 'honey_tart', name: 'Clover Honey Pie', icon: '🥧', color: '#f59e0b', accent: '#fde68a', style: 'oven' },
    ],
  },
  {
    id: 'event_citadel_inn',
    name: 'Golden Stag Tavern',
    subtitle: 'Stage 2 of 3 — Hearth & Ale Hall',
    tier: 'eatery',
    archetype: 'waiter_dining',
    baseCostScale: 1.8,
    floor: '#c2a684',
    wall: '#efe3cf',
    accent: '#b45309',
    roof: '#451a03',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'spiced_mead', name: 'Berry Mead', icon: '🍺', color: '#f59e0b', accent: '#fef3c7', style: 'juicer' },
      { id: 'pot_stew', name: 'Venison Stew', icon: '🍲', color: '#9a3412', accent: '#f59e0b', style: 'cauldron' },
      { id: 'turkey_leg', name: 'Roast Drumstick', icon: '🍗', color: '#b45309', accent: '#fde68a', style: 'grill' },
      { id: 'cheese_wheel', name: 'Aged Cheddar', icon: '🧀', color: '#facc15', accent: '#ca8a04', style: 'sushi' },
      { id: 'spiced_cake', name: 'Plum Cake', icon: '🍰', color: '#9333ea', accent: '#fde68a', style: 'dessert' },
    ],
  },
  {
    id: 'event_citadel_keep',
    name: 'Grand Citadel Banquet',
    subtitle: 'Stage 3 of 3 — Sovereign Great Hall',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 2.2,
    floor: '#d6d3d1',
    wall: '#f5f5f4',
    accent: '#ca8a04',
    roof: '#7f1d1d',
    maxStationLevelOverride: 1000,
    dishes: [
      { id: 'royal_nectar', name: 'Spiced Nectar', icon: '🍷', color: '#991b1b', accent: '#fde047', style: 'juicer' },
      { id: 'pretzel_crown', name: 'Crown Pretzel', icon: '🥨', color: '#d97706', accent: '#fef3c7', style: 'oven' },
      { id: 'herb_pottage', name: 'Royal Pottage', icon: '🥣', color: '#65a30d', accent: '#fef08a', style: 'cauldron' },
      { id: 'glaze_pheasant', name: 'Glazed Roast', icon: '🍗', color: '#c2410c', accent: '#fde047', style: 'oven' },
      { id: 'saffron_trout', name: 'River Trout', icon: '🐟', color: '#0284c7', accent: '#fde047', style: 'grill' },
      { id: 'boar_shank', name: 'Hearth Shank', icon: '🍖', color: '#7f1d1d', accent: '#f97316', style: 'grill' },
      { id: 'royal_pie', name: 'Banquet Pie', icon: '🥧', color: '#ca8a04', accent: '#fef3c7', style: 'oven' },
      { id: 'truffle_goose', name: 'Truffle Feast', icon: '🥘', color: '#9a3412', accent: '#facc15', style: 'wok' },
      { id: 'crown_roast', name: 'Sovereign Roast', icon: '🥩', color: '#991b1b', accent: '#facc15', style: 'grill' },
      { id: 'marzipan_castle', name: 'Gilded Torte', icon: '🎂', color: '#eab308', accent: '#ffffff', style: 'dessert' },
    ],
  },
  {
    id: 'adventure_olympus',
    name: 'Olympian Trial Arena',
    subtitle: 'Beat the 4-minute clock for Rings!',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.1,
    floor: '#e7e5e4',
    wall: '#fafaf9',
    accent: '#eab308',
    roof: '#0284c7',
    maxStationLevelOverride: 40,
    dishes: [
      { id: 'nectar_cup', name: 'Ambrosia Nectar', icon: '🍯', color: '#facc15', accent: '#ffffff', style: 'juicer', prepTime: 1.2 },
      { id: 'olive_flatbread', name: 'Olive Flatbread', icon: '🫓', color: '#84cc16', accent: '#fde68a', style: 'oven', prepTime: 1.5 },
      { id: 'gyro_plate', name: 'Hero Gyro', icon: '🥙', color: '#f97316', accent: '#22c55e', style: 'grill', prepTime: 1.8 },
      { id: 'golden_fig', name: 'Gilded Figs', icon: '🍮', color: '#a855f7', accent: '#facc15', style: 'dessert', prepTime: 2.1 },
    ],
  },
  {
    id: 'adventure_corsair',
    name: 'Corsair Cove Galley',
    subtitle: 'Beat the 4-minute clock for Necklaces!',
    tier: 'eatery',
    archetype: 'cafe_tables',
    baseCostScale: 1.15,
    floor: '#d6bc98',
    wall: '#f5ead6',
    accent: '#0ea5e9',
    roof: '#991b1b',
    maxStationLevelOverride: 40,
    dishes: [
      { id: 'grog_punch', name: 'Citrus Grog', icon: '🍹', color: '#f59e0b', accent: '#38bdf8', style: 'juicer', prepTime: 1.2 },
      { id: 'hard_biscuit', name: 'Sea Biscuits', icon: '🥐', color: '#d97706', accent: '#fef3c7', style: 'oven', prepTime: 1.5 },
      { id: 'smoked_mackerel', name: 'Smoked Catch', icon: '🐟', color: '#0284c7', accent: '#fde047', style: 'grill', prepTime: 1.8 },
      { id: 'treasure_rumcake', name: 'Doubloon Cake', icon: '🍰', color: '#eab308', accent: '#991b1b', style: 'dessert', prepTime: 2.1 },
    ],
  },
  {
    id: 'event_potion_shop',
    name: "Alchemist's Apothecary",
    subtitle: 'Brew & bottle magical culinary elixirs (gear disabled inside)',
    tier: 'flagship',
    archetype: 'grand_hall',
    baseCostScale: 1.6,
    floor: '#2e1f3d',
    wall: '#1f152b',
    accent: '#a855f7',
    roof: '#4c1d95',
    maxStationLevelOverride: 250,
    dishes: [
      { id: 'ing_sunpetal', name: 'Sunpetal Dew', icon: '🌼', color: '#facc15', accent: '#fef08a', style: 'cauldron', ingredientId: 'sunpetal' },
      { id: 'ing_emberdust', name: 'Ember Scale Dust', icon: '🔥', color: '#f97316', accent: '#fed7aa', style: 'cauldron', ingredientId: 'emberdust' },
      { id: 'ing_starhorn', name: 'Starhorn Shavings', icon: '✨', color: '#38bdf8', accent: '#e0f2fe', style: 'cauldron', ingredientId: 'starhorn' },
      { id: 'ing_mistbreath', name: 'Zephyr Mist', icon: '💨', color: '#67e8f9', accent: '#cffafe', style: 'cauldron', ingredientId: 'mistbreath' },
      { id: 'ing_tidetear', name: 'Siren Tears', icon: '💧', color: '#3b82f6', accent: '#bfdbfe', style: 'cauldron', ingredientId: 'tidetear' },
      { id: 'ing_goldbeetle', name: 'Gilded Nectar', icon: '🪲', color: '#eab308', accent: '#fef9c3', style: 'cauldron', ingredientId: 'goldbeetle' },
      { id: 'ing_crystalwater', name: 'Crystal Spring', icon: '🧊', color: '#22d3ee', accent: '#ecfeff', style: 'cauldron', ingredientId: 'crystalwater' },
      { id: 'ing_moonsilk', name: 'Moonsilk Thread', icon: '🕸️', color: '#e2e8f0', accent: '#c084fc', style: 'cauldron', ingredientId: 'moonsilk' },
      { id: 'ing_glowcap', name: 'Glowcap Spores', icon: '🍄', color: '#a855f7', accent: '#f0abfc', style: 'cauldron', ingredientId: 'glowcap' },
      { id: 'ing_echofrog', name: 'Echo Essence', icon: '🐸', color: '#4ade80', accent: '#bbf7d0', style: 'cauldron', ingredientId: 'echofrog' },
    ],
  },
];

export const RESTAURANT_TEMPLATES: Record<string, RestaurantTemplate> = Object.fromEntries(
  SEEDS.map((seed) => [seed.id, makeRestaurant(seed)]),
);

export const RESTAURANT_LIST: RestaurantTemplate[] = Object.values(RESTAURANT_TEMPLATES);

export const TIER_RESTAURANTS: Record<RestaurantTier, string[]> = {
  mini_kiosk: SEEDS.filter((s) => s.tier === 'mini_kiosk').map((s) => s.id),
  street_stall: SEEDS.filter((s) => s.tier === 'street_stall').map((s) => s.id),
  food_van: SEEDS.filter((s) => s.tier === 'food_van').map((s) => s.id),
  eatery: SEEDS.filter((s) => s.tier === 'eatery' && !s.id.startsWith('event_') && !s.id.startsWith('adventure_')).map((s) => s.id),
  flagship: SEEDS.filter((s) => s.tier === 'flagship' && !s.id.startsWith('event_')).map((s) => s.id),
};

export function getRestaurantTemplate(id: string): RestaurantTemplate {
  return RESTAURANT_TEMPLATES[id] ?? RESTAURANT_TEMPLATES['citrus_press'];
}
