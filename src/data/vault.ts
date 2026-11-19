import type { VaultArtifactTemplate } from '@/types/game';

/**
 * 12 Permanent Vault Artifacts purchased and upgraded with gameplay-earned Gems.
 * Persists permanently across restaurant renovations and city flights.
 */
export const VAULT_ARTIFACTS: VaultArtifactTemplate[] = [
  {
    id: 'tip_jar',
    name: 'Tip Jar',
    icon: '🏺',
    description: 'Increases chance that seated & counter guests leave a tip.',
    maxLevel: 20,
    baseGemCost: 20,
    gemCostStep: 25,
    minValue: 0.12,
    maxValue: 0.5,
    unit: 'percent',
  },
  {
    id: 'boost_amp',
    name: 'Boost Amplifier',
    icon: '📡',
    description: 'Multiplies the power of your active Profit Boost.',
    maxLevel: 50,
    baseGemCost: 30,
    gemCostStep: 35,
    minValue: 1.1,
    maxValue: 6.0,
    unit: 'multiplier',
  },
  {
    id: 'patron_compass',
    name: 'Patron Compass',
    icon: '🧭',
    description: 'Chance for visiting VIP Investors to offer Gems instead of cash.',
    maxLevel: 14,
    baseGemCost: 25,
    gemCostStep: 30,
    minValue: 0.1,
    maxValue: 0.5,
    unit: 'percent',
  },
  {
    id: 'chrono_glass',
    name: 'Chrono Hourglass',
    icon: '⏳',
    description: 'Extends maximum offline earnings accumulation time.',
    maxLevel: 29,
    baseGemCost: 25,
    gemCostStep: 35,
    minValue: 1.33,
    maxValue: 10.7,
    unit: 'multiplier',
  },
  {
    id: 'quick_register',
    name: 'Express Register',
    icon: '🖥️',
    description: 'Customers place their orders much faster.',
    maxLevel: 10,
    baseGemCost: 20,
    gemCostStep: 20,
    minValue: 2.4,
    maxValue: 6.0,
    unit: 'multiplier',
  },
  {
    id: 'signal_tower',
    name: 'Broadcast Tower',
    icon: '🗼',
    description: 'Extends active Profit Boost duration per charge.',
    maxLevel: 24,
    baseGemCost: 25,
    gemCostStep: 30,
    minValue: 1.1,
    maxValue: 8.0,
    unit: 'multiplier',
  },
  {
    id: 'tip_vault',
    name: 'Golden Piggy',
    icon: '🐷',
    description: 'Multiplies the payout value of every collected tip.',
    maxLevel: 45,
    baseGemCost: 30,
    gemCostStep: 35,
    minValue: 1.2,
    maxValue: 10.0,
    unit: 'multiplier',
  },
  {
    id: 'offline_blade',
    name: 'Chef Prep Knife',
    icon: '🔪',
    description: 'Multiplies earnings generated while the app is closed.',
    maxLevel: 45,
    baseGemCost: 30,
    gemCostStep: 35,
    minValue: 1.2,
    maxValue: 10.0,
    unit: 'multiplier',
  },
  {
    id: 'swift_floor',
    name: 'Polished Floors',
    icon: '🧹',
    description: 'Customers walk faster into and out of your restaurant.',
    maxLevel: 20,
    baseGemCost: 20,
    gemCostStep: 25,
    minValue: 1.05,
    maxValue: 2.0,
    unit: 'multiplier',
  },
  {
    id: 'vip_briefcase',
    name: 'VIP Briefcase',
    icon: '💼',
    description: 'Multiplies cash offers brought by visiting VIP Investors.',
    maxLevel: 45,
    baseGemCost: 30,
    gemCostStep: 35,
    minValue: 1.2,
    maxValue: 10.0,
    unit: 'multiplier',
  },
  {
    id: 'starter_check',
    name: 'Seed Checkbook',
    icon: '💵',
    description: 'Start every new restaurant with a generous cash grant.',
    maxLevel: 20,
    baseGemCost: 25,
    gemCostStep: 30,
    minValue: 100,
    maxValue: 3_640_000_000,
    unit: 'cash',
  },
  {
    id: 'adventure_keyring',
    name: 'Lucky Keycard',
    icon: '🗝️',
    description: 'Chance to refund your key upon clearing a Timed Adventure.',
    maxLevel: 30,
    baseGemCost: 40,
    gemCostStep: 50,
    minValue: 0.05,
    maxValue: 0.35,
    unit: 'percent',
  },
];

export const VAULT_BY_ID: Record<string, VaultArtifactTemplate> = Object.fromEntries(
  VAULT_ARTIFACTS.map((v) => [v.id, v]),
);

export function getVaultValue(artifact: VaultArtifactTemplate, level: number): number {
  if (level <= 0) {
    if (artifact.id === 'tip_jar') return 0.08;
    if (artifact.id === 'patron_compass') return 0.05;
    if (artifact.id === 'starter_check') return 0;
    if (artifact.id === 'adventure_keyring') return 0;
    return 1.0;
  }
  const t = artifact.maxLevel <= 1 ? 1 : Math.min(1, (level - 1) / (artifact.maxLevel - 1));
  if (artifact.unit === 'cash') {
    // Exponential curve from 100 -> 3.64B
    return Math.round(artifact.minValue * Math.pow(artifact.maxValue / artifact.minValue, t));
  }
  return Number((artifact.minValue + (artifact.maxValue - artifact.minValue) * t).toFixed(4));
}

export function getVaultUpgradeCost(artifact: VaultArtifactTemplate, currentLevel: number): number {
  // Smooth quadratic-linear gem escalation
  return Math.round(artifact.baseGemCost + currentLevel * artifact.gemCostStep + currentLevel * currentLevel * 1.4);
}
