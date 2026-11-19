import type { GameSaveData, LootBoxType, LootRewardItem, Rarity } from '@/types/game';
import { getGearByRarityAndSource } from '@/data/gear';
import { SeededRNG } from '@/engine/rng';
import { createGearInstance } from './equipment';

export interface LootTableRow {
  label: string;
  chance: number; // 0..100 percentage
  kind: 'gear' | 'blueprint' | 'egg' | 'pet_food';
  rarity?: Rarity;
  source?: string;
}

export interface LootBoxDefinition {
  type: LootBoxType;
  name: string;
  icon: string;
  description: string;
  gemCost: number | null; // null if earned only via gameplay/clubs/adventures
  rollsPerBox: number;
  guaranteedPetFood?: number;
  table: LootTableRow[];
}

export const LOOT_BOX_DEFINITIONS: Record<LootBoxType, LootBoxDefinition> = {
  small: {
    type: 'small',
    name: 'Small Crate',
    icon: '📦',
    description: 'Earned from every renovation & city flight. 2 drops per crate.',
    gemCost: 40,
    rollsPerBox: 2,
    table: [
      { label: 'Common Gear', chance: 60, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Pet Food (6–15)', chance: 23.75, kind: 'pet_food' },
      { label: 'Rare Gear', chance: 12, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 3, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Common Egg', chance: 1, kind: 'egg', rarity: 'common' },
      { label: 'Rare Egg', chance: 0.25, kind: 'egg', rarity: 'rare' },
    ],
  },
  big: {
    type: 'big',
    name: 'Grand Crate',
    icon: '🎁',
    description: '6 drops with Legendary Blueprints and Epic/Legendary Pet Eggs.',
    gemCost: 200,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Epic Pet Egg', chance: 1.75, kind: 'egg', rarity: 'epic' },
      { label: 'Legendary Pet Egg', chance: 0.25, kind: 'egg', rarity: 'legendary' },
    ],
  },
  event_cavern: {
    type: 'event_cavern',
    name: 'Cavern Event Crate',
    icon: '⛏️',
    description: '6 drops with Crystal Cavern Ultimate Blueprints!',
    gemCost: 250,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Cavern Ultimate Blueprint', chance: 2, kind: 'blueprint', rarity: 'ultimate', source: 'event_cavern' },
    ],
  },
  event_pier: {
    type: 'event_pier',
    name: 'Tidewater Event Crate',
    icon: '⚓',
    description: '6 drops with Tidewater Pier Ultimate Blueprints!',
    gemCost: 250,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Pier Ultimate Blueprint', chance: 2, kind: 'blueprint', rarity: 'ultimate', source: 'event_pier' },
    ],
  },
  event_lunar: {
    type: 'event_lunar',
    name: 'Lunar Event Crate',
    icon: '🌙',
    description: '6 drops with Lunar Outpost Ultimate Blueprints!',
    gemCost: 250,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Lunar Ultimate Blueprint', chance: 2, kind: 'blueprint', rarity: 'ultimate', source: 'event_lunar' },
    ],
  },
  event_citadel: {
    type: 'event_citadel',
    name: 'Citadel Event Crate',
    icon: '🏰',
    description: '6 drops with Citadel Banquet Ultimate Blueprints!',
    gemCost: 250,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Citadel Ultimate Blueprint', chance: 2, kind: 'blueprint', rarity: 'ultimate', source: 'event_citadel' },
    ],
  },
  event_potion: {
    type: 'event_potion',
    name: 'Apothecary Event Crate',
    icon: '🧪',
    description: '6 drops with Alchemist Ultimate Blueprints!',
    gemCost: 250,
    rollsPerBox: 6,
    table: [
      { label: 'Common Gear', chance: 48, kind: 'gear', rarity: 'common', source: 'standard' },
      { label: 'Rare Gear', chance: 30, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 15, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 5, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Alchemist Ultimate Blueprint', chance: 2, kind: 'blueprint', rarity: 'ultimate', source: 'event_potion' },
    ],
  },
  club: {
    type: 'club',
    name: 'Club Vault Crate',
    icon: '🛡️',
    description: 'Earned from Club seasons. Zero Commons — includes Mythic Blueprints!',
    gemCost: null,
    rollsPerBox: 6,
    table: [
      { label: 'Rare Gear', chance: 53, kind: 'gear', rarity: 'rare', source: 'standard' },
      { label: 'Epic Gear', chance: 33, kind: 'gear', rarity: 'epic', source: 'standard' },
      { label: 'Legendary Blueprint', chance: 12, kind: 'blueprint', rarity: 'legendary', source: 'standard' },
      { label: 'Mythic Blueprint', chance: 2, kind: 'blueprint', rarity: 'mythic', source: 'club' },
    ],
  },
  pet: {
    type: 'pet',
    name: 'Companion Egg Crate',
    icon: '🥚',
    description: '3 Pet Eggs + 150 guaranteed Pet Food!',
    gemCost: 500,
    rollsPerBox: 3,
    guaranteedPetFood: 150,
    table: [
      { label: 'Common Egg', chance: 59, kind: 'egg', rarity: 'common' },
      { label: 'Rare Egg', chance: 28, kind: 'egg', rarity: 'rare' },
      { label: 'Epic Egg', chance: 11, kind: 'egg', rarity: 'epic' },
      { label: 'Legendary Egg', chance: 1.5, kind: 'egg', rarity: 'legendary' },
      { label: 'Ultimate Egg', chance: 0.5, kind: 'egg', rarity: 'ultimate' },
    ],
  },
  ring_box: {
    type: 'ring_box',
    name: 'Olympian Ring Chest',
    icon: '💍',
    description: 'Won in Olympian Trial Timed Adventures. Drops Rings up to Mythic!',
    gemCost: null,
    rollsPerBox: 3,
    table: [
      { label: 'Common Ring', chance: 42, kind: 'gear', rarity: 'common', source: 'adventure_olympus' },
      { label: 'Rare Ring', chance: 32, kind: 'gear', rarity: 'rare', source: 'adventure_olympus' },
      { label: 'Epic Ring', chance: 17, kind: 'gear', rarity: 'epic', source: 'adventure_olympus' },
      { label: 'Legendary Ring Blueprint', chance: 6, kind: 'blueprint', rarity: 'legendary', source: 'adventure_olympus' },
      { label: 'Ultimate Ring Blueprint', chance: 2.5, kind: 'blueprint', rarity: 'ultimate', source: 'adventure_olympus' },
      { label: 'Mythic Ring Blueprint', chance: 0.5, kind: 'blueprint', rarity: 'mythic', source: 'adventure_olympus' },
    ],
  },
  necklace_box: {
    type: 'necklace_box',
    name: 'Corsair Necklace Chest',
    icon: '📿',
    description: 'Won in Corsair Cove Timed Adventures. Drops Necklaces up to Mythic!',
    gemCost: null,
    rollsPerBox: 3,
    table: [
      { label: 'Common Necklace', chance: 42, kind: 'gear', rarity: 'common', source: 'adventure_corsair' },
      { label: 'Rare Necklace', chance: 32, kind: 'gear', rarity: 'rare', source: 'adventure_corsair' },
      { label: 'Epic Necklace', chance: 17, kind: 'gear', rarity: 'epic', source: 'adventure_corsair' },
      { label: 'Legendary Necklace Blueprint', chance: 6, kind: 'blueprint', rarity: 'legendary', source: 'adventure_corsair' },
      { label: 'Ultimate Necklace Blueprint', chance: 2.5, kind: 'blueprint', rarity: 'ultimate', source: 'adventure_corsair' },
      { label: 'Mythic Necklace Blueprint', chance: 0.5, kind: 'blueprint', rarity: 'mythic', source: 'adventure_corsair' },
    ],
  },
};

export function addEggToSave(save: GameSaveData, rarity: Exclude<Rarity, 'mythic'>, count = 1): void {
  let stack = save.eggs.find((e) => e.rarity === rarity);
  if (!stack) {
    stack = { rarity, count: 0, hatchingProgress: 0 };
    save.eggs.push(stack);
  }
  stack.count += count;
}

export function buyBoxWithGems(save: GameSaveData, boxType: LootBoxType, quantity = 1): boolean {
  const def = LOOT_BOX_DEFINITIONS[boxType];
  if (!def || def.gemCost === null) return false;
  const qty = Math.max(1, Math.floor(quantity));
  const totalCost = def.gemCost * qty;
  if (save.gems < totalCost) return false;
  save.gems -= totalCost;
  save.stats.gemsSpent += totalCost;
  save.boxes[boxType] = (save.boxes[boxType] ?? 0) + qty;
  return true;
}

export function openBoxes(
  save: GameSaveData,
  boxType: LootBoxType,
  quantity: number,
  rng: SeededRNG,
): LootRewardItem[] {
  const owned = save.boxes[boxType] ?? 0;
  const toOpen = Math.min(owned, Math.max(1, Math.floor(quantity)));
  if (toOpen <= 0) return [];

  const def = LOOT_BOX_DEFINITIONS[boxType];
  save.boxes[boxType] = owned - toOpen;
  save.stats.boxesOpened += toOpen;

  const rewards: LootRewardItem[] = [];

  for (let b = 0; b < toOpen; b++) {
    if (def.guaranteedPetFood) {
      save.petFood += def.guaranteedPetFood;
      rewards.push({
        kind: 'pet_food',
        amount: def.guaranteedPetFood,
        label: `${def.guaranteedPetFood} Pet Food`,
      });
    }

    for (let r = 0; r < def.rollsPerBox; r++) {
      const roll = rng.next() * 100;
      let acc = 0;
      let picked = def.table[0];
      for (const row of def.table) {
        acc += row.chance;
        if (roll <= acc) {
          picked = row;
          break;
        }
      }

      if (picked.kind === 'pet_food') {
        const amt = rng.int(6, 15);
        save.petFood += amt;
        rewards.push({ kind: 'pet_food', amount: amt, label: `${amt} Pet Food` });
      } else if (picked.kind === 'egg' && picked.rarity && picked.rarity !== 'mythic') {
        addEggToSave(save, picked.rarity, 1);
        rewards.push({
          kind: 'egg',
          rarity: picked.rarity,
          amount: 1,
          label: `${picked.rarity[0].toUpperCase() + picked.rarity.slice(1)} Pet Egg`,
        });
      } else if ((picked.kind === 'gear' || picked.kind === 'blueprint') && picked.rarity) {
        const pool = getGearByRarityAndSource(
          picked.rarity,
          picked.source as never,
        );
        const tpl = pool.length > 0 ? rng.pick(pool) : getGearByRarityAndSource('common', 'standard')[0];
        const isBp = picked.kind === 'blueprint';
        save.inventory.push(createGearInstance(tpl.id, isBp));
        rewards.push({
          kind: isBp ? 'blueprint' : 'gear',
          rarity: tpl.rarity,
          templateId: tpl.id,
          label: isBp ? `${tpl.name} (Blueprint)` : tpl.name,
        });
      }
    }
  }

  return rewards;
}
