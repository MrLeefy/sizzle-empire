import type {
  EquippedSlotKey,
  GameSaveData,
  GearInstance,
  GearTemplate,
  Rarity,
} from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { GEAR_BY_ID } from '@/data/gear';
import { getGearAllProfitPercent } from '@/engine/economy/stats';

const RARITY_ORDER: Record<Rarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  ultimate: 5,
  mythic: 6,
};

let gearSeq = 1;
export function createGearInstance(templateId: string, isBlueprint = false): GearInstance {
  gearSeq = (gearSeq + 1) % 10_000_000;
  return {
    instanceId: `gear_${Date.now().toString(36)}_${gearSeq}`,
    templateId,
    level: 1,
    xp: 0,
    isBlueprint,
    acquiredAt: Date.now(),
  };
}

export function getXpRequiredForNextGearLevel(currentLevel: number, rarity: Rarity): number {
  if (currentLevel >= 50) return Infinity;
  const rarityFactor =
    rarity === 'common'
      ? 1
      : rarity === 'rare'
        ? 1.5
        : rarity === 'epic'
          ? 2.2
          : rarity === 'legendary'
            ? 3.2
            : rarity === 'ultimate'
              ? 4.6
              : 6.5;
  return Math.round((6 + currentLevel * 4.5 + currentLevel * currentLevel * 0.4) * rarityFactor);
}

export function getGearSalvageXp(inst: GearInstance): number {
  const tpl = GEAR_BY_ID[inst.templateId];
  if (!tpl) return 4;
  const base = BALANCE.GEAR_SALVAGE_XP[tpl.rarity];
  // Salvaging a leveled item returns a generous portion of invested XP too
  return base + Math.floor(inst.xp * 0.8) + (inst.level - 1) * base;
}

export function isSlotUnlocked(save: GameSaveData, slotKey: EquippedSlotKey): boolean {
  if (slotKey === 'head' || slotKey === 'body' || slotKey === 'hand1') return true;
  if (slotKey === 'hand2') return save.cityNumber >= BALANCE.HAND_2_UNLOCK_CITY;
  if (slotKey === 'ring') {
    return (
      save.cityNumber >= BALANCE.ADVENTURE_RING_UNLOCK_CITY ||
      save.inventory.some((i) => !i.isBlueprint && GEAR_BY_ID[i.templateId]?.slot === 'ring')
    );
  }
  if (slotKey === 'necklace') {
    return (
      save.cityNumber >= BALANCE.ADVENTURE_NECKLACE_UNLOCK_CITY ||
      save.inventory.some((i) => !i.isBlueprint && GEAR_BY_ID[i.templateId]?.slot === 'necklace')
    );
  }
  return false;
}

export function getEquippedSlotForInstance(
  save: GameSaveData,
  instanceId: string,
): EquippedSlotKey | null {
  for (const [key, val] of Object.entries(save.equipped)) {
    if (val === instanceId) return key as EquippedSlotKey;
  }
  return null;
}

export function equipGearItem(
  save: GameSaveData,
  instanceId: string,
  preferredSlot?: EquippedSlotKey,
): boolean {
  const item = save.inventory.find((i) => i.instanceId === instanceId);
  if (!item || item.isBlueprint) return false;
  const tpl = GEAR_BY_ID[item.templateId];
  if (!tpl) return false;

  let targetSlot: EquippedSlotKey;
  if (tpl.slot === 'hand') {
    if (preferredSlot === 'hand2' && isSlotUnlocked(save, 'hand2')) {
      targetSlot = 'hand2';
    } else if (!save.equipped.hand1) {
      targetSlot = 'hand1';
    } else if (isSlotUnlocked(save, 'hand2') && !save.equipped.hand2 && save.equipped.hand1 !== instanceId) {
      targetSlot = 'hand2';
    } else {
      targetSlot = preferredSlot === 'hand2' && isSlotUnlocked(save, 'hand2') ? 'hand2' : 'hand1';
    }
  } else {
    targetSlot = tpl.slot;
  }

  if (!isSlotUnlocked(save, targetSlot)) return false;

  // Unequip from another slot if already equipped (e.g. moving hand1 -> hand2)
  const existing = getEquippedSlotForInstance(save, instanceId);
  if (existing) save.equipped[existing] = null;

  save.equipped[targetSlot] = instanceId;
  return true;
}

export function unequipGearSlot(save: GameSaveData, slotKey: EquippedSlotKey): void {
  save.equipped[slotKey] = null;
}

/**
 * Salvages spare (unequipped) items to level up a target gear item.
 */
export function salvageGearIntoTarget(
  save: GameSaveData,
  targetInstanceId: string,
  fodderInstanceIds: string[],
): { levelsGained: number; xpAdded: number; itemsConsumed: number } {
  const target = save.inventory.find((i) => i.instanceId === targetInstanceId);
  if (!target || target.isBlueprint || target.level >= 50) {
    return { levelsGained: 0, xpAdded: 0, itemsConsumed: 0 };
  }
  const targetTpl = GEAR_BY_ID[target.templateId];
  if (!targetTpl) return { levelsGained: 0, xpAdded: 0, itemsConsumed: 0 };

  const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));
  const fodderSet = new Set(
    fodderInstanceIds.filter((id) => id !== targetInstanceId && !equippedIds.has(id)),
  );

  let xpAdded = 0;
  let itemsConsumed = 0;

  save.inventory = save.inventory.filter((inst) => {
    if (!fodderSet.has(inst.instanceId)) return true;
    xpAdded += getGearSalvageXp(inst);
    itemsConsumed++;
    return false;
  });

  if (xpAdded <= 0) return { levelsGained: 0, xpAdded: 0, itemsConsumed: 0 };

  const startLevel = target.level;
  target.xp += xpAdded;
  while (target.level < 50) {
    const needed = getXpRequiredForNextGearLevel(target.level, targetTpl.rarity);
    if (target.xp >= needed) {
      target.xp -= needed;
      target.level++;
    } else {
      break;
    }
  }
  if (target.level >= 50) target.xp = 0;

  save.stats.itemsSalvaged += itemsConsumed;
  save.stats.highestItemLevel = Math.max(save.stats.highestItemLevel, target.level);

  return {
    levelsGained: target.level - startLevel,
    xpAdded,
    itemsConsumed,
  };
}

export interface ForgeCheckResult {
  canForge: boolean;
  requirements: Array<{
    templateId: string;
    name: string;
    needed: number;
    owned: number;
    rarity: Rarity;
  }>;
}

export function checkBlueprintForgeable(
  save: GameSaveData,
  blueprintInstanceId: string,
): ForgeCheckResult {
  const bp = save.inventory.find((i) => i.instanceId === blueprintInstanceId && i.isBlueprint);
  if (!bp) return { canForge: false, requirements: [] };
  const tpl = GEAR_BY_ID[bp.templateId];
  if (!tpl?.forgeRecipe || tpl.forgeRecipe.length === 0) {
    return { canForge: false, requirements: [] };
  }

  const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));
  const requirements = tpl.forgeRecipe.map((req) => {
    const reqTpl = GEAR_BY_ID[req.templateId];
    const owned = save.inventory.filter(
      (i) =>
        !i.isBlueprint &&
        i.templateId === req.templateId &&
        !equippedIds.has(i.instanceId),
    ).length;
    return {
      templateId: req.templateId,
      name: reqTpl?.name ?? req.templateId,
      needed: req.count,
      owned,
      rarity: reqTpl?.rarity ?? 'common',
    };
  });

  return {
    canForge: requirements.every((r) => r.owned >= r.needed),
    requirements,
  };
}

export function forgeBlueprint(save: GameSaveData, blueprintInstanceId: string): GearInstance | null {
  const check = checkBlueprintForgeable(save, blueprintInstanceId);
  if (!check.canForge) return null;

  const bp = save.inventory.find((i) => i.instanceId === blueprintInstanceId && i.isBlueprint);
  if (!bp) return null;
  const tpl = GEAR_BY_ID[bp.templateId];
  if (!tpl?.forgeRecipe) return null;

  const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));
  const toConsumeIds = new Set<string>();

  for (const req of tpl.forgeRecipe) {
    // Consume lowest-level unequipped copies first
    const candidates = save.inventory
      .filter(
        (i) =>
          !i.isBlueprint &&
          i.templateId === req.templateId &&
          !equippedIds.has(i.instanceId) &&
          !toConsumeIds.has(i.instanceId),
      )
      .sort((a, b) => a.level - b.level);

    if (candidates.length < req.count) return null;
    for (let k = 0; k < req.count; k++) {
      toConsumeIds.add(candidates[k].instanceId);
    }
  }

  save.inventory = save.inventory.filter((i) => !toConsumeIds.has(i.instanceId));
  bp.isBlueprint = false;
  bp.level = 1;
  bp.xp = 0;
  save.stats.itemsForged += 1;
  return bp;
}

export function sortInventory(
  items: GearInstance[],
  mode: 'rarity' | 'profit' | 'slot' | 'name' = 'rarity',
): GearInstance[] {
  return [...items].sort((a, b) => {
    const ta: GearTemplate | undefined = GEAR_BY_ID[a.templateId];
    const tb: GearTemplate | undefined = GEAR_BY_ID[b.templateId];
    if (!ta || !tb) return 0;

    if (mode === 'name') return ta.name.localeCompare(tb.name);
    if (mode === 'slot') {
      const s = ta.slot.localeCompare(tb.slot);
      if (s !== 0) return s;
    }
    if (mode === 'profit') {
      const pa = getGearAllProfitPercent(ta.rarity, a.level, ta.slot === 'ring' || ta.slot === 'necklace');
      const pb = getGearAllProfitPercent(tb.rarity, b.level, tb.slot === 'ring' || tb.slot === 'necklace');
      if (pa !== pb) return pb - pa;
    }
    const rDiff = RARITY_ORDER[tb.rarity] - RARITY_ORDER[ta.rarity];
    if (rDiff !== 0) return rDiff;
    if (a.isBlueprint !== b.isBlueprint) return a.isBlueprint ? 1 : -1;
    return b.level - a.level;
  });
}

export function describeGearEffect(type: string, value: number): string {
  const pct = `${Math.round(value * 100)}%`;
  switch (type) {
    case 'walk_speed': return `Chef walks +${pct} faster`;
    case 'all_walk_speed': return `All workers walk +${pct} faster`;
    case 'cook_speed': return `Chef cooks +${pct} faster`;
    case 'all_cook_speed': return `All workers cook +${pct} faster`;
    case 'instant_cook': return `+${pct} Instant Cook chance`;
    case 'all_instant_cook': return `All workers +${pct} Instant Cook`;
    case 'perfect_chance': return `+${pct} Perfect Food (×6)`;
    case 'all_perfect_chance': return `All workers +${pct} Perfect Food (×6)`;
    case 'divine_chance': return `+${pct} Divine Food (×26)`;
    case 'all_divine_chance': return `All workers +${pct} Divine Food (×26)`;
    case 'double_chance': return `+${pct} Double Food (×2)`;
    case 'all_double_chance': return `All workers +${pct} Double Food (×2)`;
    case 'instant_order': return `+${pct} Instant Customer Orders`;
    case 'golden_customer': return `+${pct} Golden Customer (×16)`;
    case 'greedy_customer': return `+${pct} Greedy Customer (8–11 dishes)`;
    case 'reorder_chance': return `+${pct} Repeat Order chance`;
    case 'perfect_value': return `Perfect Food worth +${pct} more`;
    case 'divine_value': return `Divine Food worth +${pct} more`;
    case 'profit_per_worker': return `+${pct} All Profit per hired worker`;
    default: return `${type}: +${pct}`;
  }
}
