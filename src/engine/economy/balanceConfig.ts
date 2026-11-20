import type { EventDifficulty, Rarity, RestaurantTier } from '@/types/game';

/**
 * Single Source of Truth for Sizzle Empire's Economy & Meta-Progression Curves.
 * Zero balance magic numbers are permitted inside UI components.
 */
export const BALANCE = {
  // Station exponential upgrade curves (calibrated to authentic Eatventure pacing via headless multi-city simulator)
  STATION_COST_GROWTH: 1.182,
  STATION_PROFIT_GROWTH: 1.070,

  // Milestone levels granting major profit jumps + 1 Gem each
  MILESTONE_LEVELS: [10, 25, 50, 75, 100, 150, 200, 250, 350, 500, 650, 800, 1000] as const,
  MILESTONE_MULTIPLIER_PER_THRESHOLD: 2.0,
  MILESTONE_GEM_REWARD: 1,

  // Deliberate, readable cook times: each dish takes several seconds with a visible timer,
  // and per-dish revenue scales up so earnings stay on the calibrated pacing curve.
  PREP_TIME_SCALE: 3.0,
  PREP_REVENUE_SCALE: 1.4,

  // Station max level defaults by restaurant tier
  TIER_MAX_LEVEL: {
    mini_kiosk: 25,
    street_stall: 50,
    food_van: 75,
    eatery: 150,
    flagship: 250,
  } as Record<RestaurantTier, number>,

  // Small box rewards granted on restaurant renovation by stage index within a city
  RENOVATION_SMALL_BOXES_BY_TIER: {
    mini_kiosk: 1,
    street_stall: 1,
    food_van: 2,
    eatery: 2,
    flagship: 3,
  } as Record<RestaurantTier, number>,
  CITY_TRAVEL_SMALL_BOXES: 5,
  CITY_TRAVEL_BONUS_GEMS: 15,

  // City progression difficulty scaling (smooth infinite scaling across 60-city loops)
  CITY_COST_EXPONENT_EARLY: 1.18,
  CITY_COST_EXPONENT_LATE: 1.12,
  CITY_REVENUE_SCALE_PER_CITY: 1.025, // slight base price bump keeps numbers exciting

  // Dish pricing pipeline multipliers (confirmed clean-room targets)
  PERFECT_DISH_MULTIPLIER: 6,
  DIVINE_DISH_MULTIPLIER: 26,
  DOUBLE_DISH_MULTIPLIER: 2,
  GOLDEN_CUSTOMER_MULTIPLIER: 16,

  // Customer order counts
  NORMAL_ORDER_MIN: 1,
  NORMAL_ORDER_MAX: 3,
  GREEDY_ORDER_MIN: 8,
  GREEDY_ORDER_MAX: 11,

  // Base timings (seconds) — deliberate starting rhythm so speed/cook upgrades feel genuinely impactful
  BASE_ORDER_TAKE_TIME: 1.25,
  BASE_CUSTOMER_SPAWN_INTERVAL: 1.85,
  BASE_WORKER_WALK_SPEED: 2.25, // world units / sec
  BASE_CUSTOMER_WALK_SPEED: 1.85,
  PET_CATCHUP_SPEED_BONUS: 1.25,

  // Tips & Offline earnings
  BASE_OFFLINE_MAX_SECONDS: 30 * 60, // 30 minutes before Hourglass Vault multiplier
  TIP_OFFLINE_SECONDS_EQUIVALENT: 50, // each tip = 50s of offline earnings * Piggy multiplier

  // Active skills & boosts (gameplay-earned, zero ads/IAP required)
  BASE_BOOST_MULTIPLIER: 2.0,
  BASE_BOOST_DURATION_SEC: 5 * 60, // 5 min base, up to 40 min with Signal Tower Vault
  MAX_BOOST_CHARGES: 6,
  BOOST_CHARGE_REGEN_SEC: 4 * 60,
  POPULAR_DISH_DURATION_SEC: 180,
  POPULAR_DISH_COOLDOWN_SEC: 600,
  POPULAR_DISH_WEIGHT_MULT: 8.0,
  HELPER_DURATION_SEC: 240,
  HELPER_COOLDOWN_SEC: 1800,
  INVESTOR_COOLDOWN_SEC: 55,
  INVESTOR_LIFETIME_SEC: 25,
  INVESTOR_BASE_GEMS: 6,
  INVESTOR_CASH_SECONDS: 110,

  // Equipment All Profit (%) Level 1 -> Level 50 curve
  GEAR_ALL_PROFIT: {
    common: { lv1: 3, lv50: 52 },
    rare: { lv1: 9, lv50: 118 },
    epic: { lv1: 27, lv50: 295 },
    legendary: { lv1: 81, lv50: 885 },
    ultimate: { lv1: 243, lv50: 2654 },
    mythic: { lv1: 729, lv50: 7962 },
  } as Record<Rarity, { lv1: number; lv50: number }>,

  PET_ALL_PROFIT: {
    common: { lv1: 6, lv50: 55 },
    rare: { lv1: 18, lv50: 153 },
    epic: { lv1: 54, lv50: 590 },
    legendary: { lv1: 162, lv50: 1769 },
    ultimate: { lv1: 486, lv50: 5308 },
    mythic: { lv1: 486, lv50: 5308 },
  } as Record<Rarity, { lv1: number; lv50: number }>,

  // Salvage XP values
  GEAR_SALVAGE_XP: {
    common: 4,
    rare: 9,
    epic: 22,
    legendary: 54,
    ultimate: 130,
    mythic: 320,
  } as Record<Rarity, number>,

  EGG_SALVAGE_XP: {
    common: 25,
    rare: 50,
    epic: 150,
    legendary: 425,
    ultimate: 1000,
  } as Record<Exclude<Rarity, 'mythic'>, number>,

  EGG_HATCH_COST: {
    common: 100,
    rare: 300,
    epic: 900,
    legendary: 2700,
    ultimate: 8100,
  } as Record<Exclude<Rarity, 'mythic'>, number>,

  EGG_MERGE_REQUIRED: 5,
  PET_MERGE_REQUIRED: 3,

  // Vault progressive unlock fees (1st..12th artifact)
  VAULT_UNLOCK_GEMS: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 1000] as const,

  // Arcane Vault progressive scroll unlock fees (1st..7th)
  ARCANE_VAULT_UNLOCK_SCROLLS: [0, 5, 15, 25, 35, 45, 55] as const,

  // Slot unlock cities (accessible progression)
  HAND_2_UNLOCK_CITY: 4,
  PET_SLOT_1_UNLOCK_CITY: 2,
  PET_SLOT_2_UNLOCK_CITY: 10,
  CLUB_UNLOCK_CITY: 7,
  ADVENTURE_RING_UNLOCK_CITY: 3,
  ADVENTURE_NECKLACE_UNLOCK_CITY: 6,

  // Major event difficulty scaling & rewards
  EVENT_DIFFICULTY_SCALE: {
    normal: { costMult: 1, rewardMult: 1 },
    hard: { costMult: 12, rewardMult: 2 },
    extreme: { costMult: 180, rewardMult: 3 },
    impossible: { costMult: 3200, rewardMult: 4 },
    nightmare: { costMult: 65000, rewardMult: 6 },
  } as Record<EventDifficulty, { costMult: number; rewardMult: number }>,
} as const;
