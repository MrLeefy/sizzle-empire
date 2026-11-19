import type {
  AdventureId,
  ArcaneVaultArtifact,
  LootBoxType,
  MajorEventId,
  PotionRecipeDefinition,
} from '@/types/game';

export interface MajorEventDefinition {
  id: MajorEventId;
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  stageTemplateIds: string[]; // 1 stage for single-map events, 3 stages for Citadel Banquet
  eventBoxType: LootBoxType;
  ultimateGearIds: string[];
  milestones: Array<{ progressPct: number; gems: number; boxes: number; label: string }>;
}

export const MAJOR_EVENTS: Record<MajorEventId, MajorEventDefinition> = {
  crystal_cavern: {
    id: 'crystal_cavern',
    name: 'Crystal Cavern',
    subtitle: 'Subterranean mineral-brew kitchen (10 stations · Max Lv 1000)',
    icon: '⛏️',
    accentColor: '#38bdf8',
    stageTemplateIds: ['event_crystal_cavern'],
    eventBoxType: 'event_cavern',
    ultimateGearIds: ['u_head_lantern', 'u_body_rig', 'u_hand_pick'],
    milestones: [
      { progressPct: 25, gems: 30, boxes: 0, label: 'Bronze Badge (25%)' },
      { progressPct: 60, gems: 75, boxes: 1, label: 'Silver Badge (60%)' },
      { progressPct: 100, gems: 150, boxes: 2, label: 'Gold Badge (100%)' },
    ],
  },
  tidewater_pier: {
    id: 'tidewater_pier',
    name: 'Tidewater Pier',
    subtitle: 'Floating harbor seafood festival (10 stations · Max Lv 1000)',
    icon: '⚓',
    accentColor: '#0284c7',
    stageTemplateIds: ['event_tidewater_pier'],
    eventBoxType: 'event_pier',
    ultimateGearIds: ['u_head_kraken', 'u_body_diver', 'u_hand_anchor'],
    milestones: [
      { progressPct: 25, gems: 30, boxes: 0, label: 'Bronze Badge (25%)' },
      { progressPct: 60, gems: 75, boxes: 1, label: 'Silver Badge (60%)' },
      { progressPct: 100, gems: 150, boxes: 2, label: 'Gold Badge (100%)' },
    ],
  },
  lunar_outpost: {
    id: 'lunar_outpost',
    name: 'Lunar Outpost',
    subtitle: 'Low-gravity orbital biodome kitchen (10 stations · Max Lv 1000)',
    icon: '🌙',
    accentColor: '#8b5cf6',
    stageTemplateIds: ['event_lunar_outpost'],
    eventBoxType: 'event_lunar',
    ultimateGearIds: ['u_head_astro', 'u_body_mech', 'u_hand_ray'],
    milestones: [
      { progressPct: 25, gems: 35, boxes: 0, label: 'Bronze Badge (25%)' },
      { progressPct: 60, gems: 80, boxes: 1, label: 'Silver Badge (60%)' },
      { progressPct: 100, gems: 160, boxes: 2, label: 'Gold Badge (100%)' },
    ],
  },
  citadel_banquet: {
    id: 'citadel_banquet',
    name: 'Citadel Banquet',
    subtitle: '3-stage royal culinary festival (Orchard → Tavern → Grand Hall)',
    icon: '🏰',
    accentColor: '#eab308',
    stageTemplateIds: ['event_citadel_orchard', 'event_citadel_inn', 'event_citadel_keep'],
    eventBoxType: 'event_citadel',
    ultimateGearIds: ['u_head_crown', 'u_body_mantle', 'u_hand_sceptre'],
    milestones: [
      { progressPct: 33, gems: 40, boxes: 0, label: 'Orchard Cleared (Bronze)' },
      { progressPct: 66, gems: 90, boxes: 1, label: 'Tavern Cleared (Silver)' },
      { progressPct: 100, gems: 180, boxes: 2, label: 'Grand Hall Cleared (Gold)' },
    ],
  },
};

export interface AdventureDefinition {
  id: AdventureId;
  name: string;
  subtitle: string;
  icon: string;
  templateId: string;
  timeLimitSec: number;
  maxLevels: number;
  rewardBoxType: LootBoxType;
  unlockCity: number;
}

export const ADVENTURES: Record<AdventureId, AdventureDefinition> = {
  olympian_trial: {
    id: 'olympian_trial',
    name: 'Olympian Trial',
    subtitle: '4-minute blitz · Rewards Ring Equipment Boxes',
    icon: '💍',
    templateId: 'adventure_olympus',
    timeLimitSec: 240,
    maxLevels: 100,
    rewardBoxType: 'ring_box',
    unlockCity: 1, // accessible early for testing & player fun; harder levels scale exponentially
  },
  corsair_cove: {
    id: 'corsair_cove',
    name: 'Corsair Cove',
    subtitle: '4-minute blitz · Rewards Necklace Equipment Boxes',
    icon: '📿',
    templateId: 'adventure_corsair',
    timeLimitSec: 240,
    maxLevels: 100,
    rewardBoxType: 'necklace_box',
    unlockCity: 2,
  },
};

export const POTION_RECIPES: PotionRecipeDefinition[] = [
  { id: 'pot_swift', name: 'Swift Stride Elixir', icon: '👟', color: '#38bdf8', ingredientA: 'sunpetal', ingredientB: 'emberdust', effectType: 'all_walk_speed', baseEffect: 0.5, effectPerLevel: 0.34, baseIngredientCost: 6 },
  { id: 'pot_sizzle', name: 'Sizzle Flame Serum', icon: '🔥', color: '#f97316', ingredientA: 'emberdust', ingredientB: 'starhorn', effectType: 'all_cook_speed', baseEffect: 0.5, effectPerLevel: 0.84, baseIngredientCost: 8 },
  { id: 'pot_perfect', name: 'Golden Touch Brew', icon: '✨', color: '#eab308', ingredientA: 'sunpetal', ingredientB: 'starhorn', effectType: 'all_perfect_chance', baseEffect: 0.08, effectPerLevel: 0.09, baseIngredientCost: 10 },
  { id: 'pot_instant', name: 'Flash Infusion', icon: '⚡', color: '#22d3ee', ingredientA: 'mistbreath', ingredientB: 'starhorn', effectType: 'all_instant_cook', baseEffect: 0.08, effectPerLevel: 0.09, baseIngredientCost: 12 },
  { id: 'pot_double', name: 'Twin Flame Draught', icon: '♊', color: '#ec4899', ingredientA: 'tidetear', ingredientB: 'emberdust', effectType: 'all_double_chance', baseEffect: 0.1, effectPerLevel: 0.1, baseIngredientCost: 14 },
  { id: 'pot_telepathy', name: 'Telepathic Tincture', icon: '🔮', color: '#8b5cf6', ingredientA: 'mistbreath', ingredientB: 'emberdust', effectType: 'instant_order', baseEffect: 0.15, effectPerLevel: 0.1, baseIngredientCost: 12 },
  { id: 'pot_divine', name: 'Celestial Decoction', icon: '🌟', color: '#a855f7', ingredientA: 'moonsilk', ingredientB: 'glowcap', effectType: 'all_divine_chance', baseEffect: 0.06, effectPerLevel: 0.06, baseIngredientCost: 18 },
  { id: 'pot_greedy', name: 'Banquet Appetite', icon: '🍽️', color: '#10b981', ingredientA: 'crystalwater', ingredientB: 'moonsilk', effectType: 'greedy_customer', baseEffect: 0.06, effectPerLevel: 0.05, baseIngredientCost: 16 },
  { id: 'pot_golden', name: 'Midas Gulp', icon: '👑', color: '#facc15', ingredientA: 'goldbeetle', ingredientB: 'glowcap', effectType: 'golden_customer', baseEffect: 0.05, effectPerLevel: 0.04, baseIngredientCost: 20 },
  { id: 'pot_reorder', name: 'Encore Aether', icon: '♻️', color: '#4ade80', ingredientA: 'tidetear', ingredientB: 'echofrog', effectType: 'reorder_chance', baseEffect: 0.06, effectPerLevel: 0.05, baseIngredientCost: 18 },
];

export const ARCANE_VAULT_ARTIFACTS: ArcaneVaultArtifact[] = [
  { id: 'potion_bandolier', name: 'Elixir Bandolier', description: 'Increases active cauldron potion slots (3 → 5)', maxLevel: 3, scrollCostBase: 15, scrollCostStep: 25, minVal: 3, maxVal: 5 },
  { id: 'distiller', name: 'Crystal Distiller', description: 'Bottled potions last longer in main game (5.5m → 20m)', maxLevel: 15, scrollCostBase: 10, scrollCostStep: 12, minVal: 330, maxVal: 1200 },
  { id: 'crystal_catalyst', name: 'Arcane Catalyst', description: 'Raises max potion brew level (6 → 10)', maxLevel: 5, scrollCostBase: 20, scrollCostStep: 25, minVal: 6, maxVal: 10 },
  { id: 'arcane_ladle', name: 'Auto-Brew Ladle', description: 'Generate more potion ingredients automatically', maxLevel: 10, scrollCostBase: 12, scrollCostStep: 15, minVal: 1.15, maxVal: 2.5 },
  { id: 'alchemy_scales', name: 'Precision Scales', description: 'Reduces ingredient cost to brew & upgrade potions (5% → 40%)', maxLevel: 10, scrollCostBase: 12, scrollCostStep: 15, minVal: 0.05, maxVal: 0.4 },
  { id: 'oak_sapling', name: 'Cork Oak Sapling', description: 'Earn extra Corks for bottling potions', maxLevel: 10, scrollCostBase: 12, scrollCostStep: 15, minVal: 1.15, maxVal: 2.5 },
  { id: 'funnel', name: 'Alchemist Funnel', description: 'Bottled potions retain more active strength (23% → 50%)', maxLevel: 10, scrollCostBase: 15, scrollCostStep: 18, minVal: 0.23, maxVal: 0.5 },
];

export interface MerchantOffer {
  id: string;
  label: string;
  icon: string;
  tokenCost: number;
  rewardKind: 'small_box' | 'big_box' | 'pet_food' | 'gems' | 'potion_scrolls';
  amount: number;
}

export const MERCHANT_OFFERS: MerchantOffer[] = [
  { id: 'm_small_3', label: '3× Small Boxes', icon: '📦', tokenCost: 25, rewardKind: 'small_box', amount: 3 },
  { id: 'm_gems_60', label: '60 Gems', icon: '💎', tokenCost: 35, rewardKind: 'gems', amount: 60 },
  { id: 'm_food_120', label: '120 Pet Food', icon: '🍖', tokenCost: 45, rewardKind: 'pet_food', amount: 120 },
  { id: 'm_big_1', label: '1× Big Box', icon: '🎁', tokenCost: 65, rewardKind: 'big_box', amount: 1 },
  { id: 'm_scrolls_25', label: '25 Arcane Scrolls', icon: '📜', tokenCost: 50, rewardKind: 'potion_scrolls', amount: 25 },
  { id: 'm_big_3', label: '3× Big Boxes', icon: '👑', tokenCost: 165, rewardKind: 'big_box', amount: 3 },
];

export interface ClubLevelReward {
  level: number;
  xpRequired: number; // incremental XP for this level
  cumulativeXp: number;
  clubProfitMult?: number;
  gems?: number;
  petFood?: number;
  smallBoxes?: number;
  bigBoxes?: number;
  clubBoxes?: number;
  epicEggs?: number;
  label: string;
}

/**
 * 50-Level Seasonal Club Progression Curve matching target structure (up to x2.0 Club All Profit).
 */
export const CLUB_SEASON_REWARDS: ClubLevelReward[] = (() => {
  const rows: ClubLevelReward[] = [];
  let cumulative = 0;
  let currentMult = 1.0;

  for (let lv = 2; lv <= 50; lv++) {
    const xp = Math.round(120 + (lv - 2) * 165 + Math.pow(lv - 2, 1.35) * 12);
    cumulative += xp;
    const reward: ClubLevelReward = { level: lv, xpRequired: xp, cumulativeXp: cumulative, label: '' };

    if (lv % 10 === 0) {
      reward.clubBoxes = Math.min(8, Math.floor(lv / 10) + 1);
      reward.label = `Club Box ×${reward.clubBoxes}`;
    } else if (lv % 3 === 0) {
      currentMult = Number(Math.min(2.0, 1.0 + Math.floor(lv / 3) * 0.0625).toFixed(2));
      reward.clubProfitMult = currentMult;
      reward.label = `Club Profit ×${currentMult.toFixed(2)}`;
    } else if (lv === 22 || lv === 35) {
      reward.epicEggs = lv === 22 ? 1 : 2;
      reward.label = `Epic Pet Egg ×${reward.epicEggs}`;
    } else if (lv % 4 === 0) {
      reward.gems = Math.round(120 + lv * 75);
      reward.label = `${reward.gems} Gems`;
    } else if (lv % 5 === 0 || lv % 5 === 1) {
      reward.petFood = Math.round(75 + lv * 24);
      reward.label = `${reward.petFood} Pet Food`;
    } else if (lv < 10) {
      reward.smallBoxes = lv === 2 ? 2 : 8;
      reward.label = `Small Box ×${reward.smallBoxes}`;
    } else {
      reward.bigBoxes = Math.min(20, Math.floor(lv / 3));
      reward.label = `Big Box ×${reward.bigBoxes}`;
    }
    rows.push(reward);
  }
  return rows;
})();

export function getClubMultiplierForLevel(clubLevel: number): number {
  let mult = 1.0;
  for (const r of CLUB_SEASON_REWARDS) {
    if (r.level <= clubLevel && r.clubProfitMult) {
      mult = Math.max(mult, r.clubProfitMult);
    }
  }
  return mult;
}
