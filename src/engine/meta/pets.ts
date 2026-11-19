import type { GameSaveData, PetInstance, Rarity } from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { getPetsForEggRarity, PET_SPECIES_BY_ID } from '@/data/pets';
import { SeededRNG } from '@/engine/rng';
import { addEggToSave } from './lootBoxes';

const NEXT_RARITY: Partial<Record<Rarity, Exclude<Rarity, 'mythic'>>> = {
  common: 'rare',
  rare: 'epic',
  epic: 'legendary',
  legendary: 'ultimate',
};

let petSeq = 1;
export function createPetInstance(speciesId: string, rarity?: Rarity): PetInstance {
  petSeq = (petSeq + 1) % 10_000_000;
  const sp = PET_SPECIES_BY_ID[speciesId];
  return {
    instanceId: `pet_${Date.now().toString(36)}_${petSeq}`,
    speciesId,
    rarity: rarity ?? sp?.baseRarity ?? 'common',
    level: 1,
    xp: 0,
    acquiredAt: Date.now(),
  };
}

export function isPetSlotUnlocked(save: GameSaveData, slotIndex: 0 | 1): boolean {
  if (slotIndex === 0) {
    return save.cityNumber >= BALANCE.PET_SLOT_1_UNLOCK_CITY || save.pets.length > 0;
  }
  return save.cityNumber >= BALANCE.PET_SLOT_2_UNLOCK_CITY;
}

export function equipPet(save: GameSaveData, petInstanceId: string, slotIndex: 0 | 1): boolean {
  if (!isPetSlotUnlocked(save, slotIndex)) return false;
  const exists = save.pets.some((p) => p.instanceId === petInstanceId);
  if (!exists) return false;
  // Prevent equipping same pet instance in both slots
  const other: 0 | 1 = slotIndex === 0 ? 1 : 0;
  if (save.equippedPetIds[other] === petInstanceId) {
    save.equippedPetIds[other] = null;
  }
  save.equippedPetIds[slotIndex] = petInstanceId;
  return true;
}

export function unequipPet(save: GameSaveData, slotIndex: 0 | 1): void {
  save.equippedPetIds[slotIndex] = null;
}

/**
 * Feeds Pet Food toward hatching an egg of the given rarity.
 * When `hatchingProgress >= hatchCost`, hatches a random species of that rarity!
 */
export function feedEggToHatch(
  save: GameSaveData,
  rarity: Exclude<Rarity, 'mythic'>,
  foodAmount: number,
  rng: SeededRNG,
): { foodSpent: number; hatchedPet: PetInstance | null } {
  const stack = save.eggs.find((e) => e.rarity === rarity && e.count > 0);
  if (!stack || save.petFood <= 0) return { foodSpent: 0, hatchedPet: null };

  const cost = BALANCE.EGG_HATCH_COST[rarity];
  const remaining = Math.max(0, cost - stack.hatchingProgress);
  const spend = Math.min(save.petFood, remaining, Math.max(1, Math.floor(foodAmount)));
  if (spend <= 0) return { foodSpent: 0, hatchedPet: null };

  save.petFood -= spend;
  save.stats.petFoodSpent += spend;
  stack.hatchingProgress += spend;

  if (stack.hatchingProgress >= cost) {
    stack.count -= 1;
    stack.hatchingProgress = 0;
    const pool = getPetsForEggRarity(rarity);
    const species = rng.pick(pool);
    const pet = createPetInstance(species.id, rarity);
    save.pets.push(pet);
    save.stats.eggsHatched += 1;

    // Auto-equip first hatched pet into slot 0 if empty
    if (!save.equippedPetIds[0]) {
      save.equippedPetIds[0] = pet.instanceId;
    }
    return { foodSpent: spend, hatchedPet: pet };
  }

  return { foodSpent: spend, hatchedPet: null };
}

export function getPetFoodForNextLevel(level: number, rarity: Rarity): number {
  if (level >= 50) return Infinity;
  const rMult =
    rarity === 'common' ? 1 : rarity === 'rare' ? 1.5 : rarity === 'epic' ? 2.2 : rarity === 'legendary' ? 3.2 : 4.5;
  return Math.round((20 + level * 15 + level * level * 1.1) * rMult);
}

export function feedPetLevel(
  save: GameSaveData,
  petInstanceId: string,
  foodAmount: number,
): { foodSpent: number; levelsGained: number } {
  const pet = save.pets.find((p) => p.instanceId === petInstanceId);
  if (!pet || pet.level >= 50 || save.petFood <= 0) {
    return { foodSpent: 0, levelsGained: 0 };
  }
  const spend = Math.min(save.petFood, Math.max(1, Math.floor(foodAmount)));
  save.petFood -= spend;
  save.stats.petFoodSpent += spend;

  const startLv = pet.level;
  pet.xp += spend;
  while (pet.level < 50) {
    const needed = getPetFoodForNextLevel(pet.level, pet.rarity);
    if (pet.xp >= needed) {
      pet.xp -= needed;
      pet.level++;
    } else {
      break;
    }
  }
  if (pet.level >= 50) pet.xp = 0;
  save.stats.highestPetLevel = Math.max(save.stats.highestPetLevel, pet.level);

  return { foodSpent: spend, levelsGained: pet.level - startLv };
}

/**
 * Merges a primary pet with 2 other unequipped pets of the SAME rarity (any species)
 * to upgrade the primary pet to the next rarity (up to Ultimate).
 */
export function mergePets(
  save: GameSaveData,
  primaryPetId: string,
  fodderPetIds: [string, string],
): boolean {
  const primary = save.pets.find((p) => p.instanceId === primaryPetId);
  if (!primary) return false;
  const nextRarity = NEXT_RARITY[primary.rarity];
  if (!nextRarity) return false;

  const [f1Id, f2Id] = fodderPetIds;
  if (f1Id === f2Id || f1Id === primaryPetId || f2Id === primaryPetId) return false;

  const equipped = new Set(save.equippedPetIds.filter(Boolean));
  if (equipped.has(f1Id) || equipped.has(f2Id)) return false;

  const f1 = save.pets.find((p) => p.instanceId === f1Id && p.rarity === primary.rarity);
  const f2 = save.pets.find((p) => p.instanceId === f2Id && p.rarity === primary.rarity);
  if (!f1 || !f2) return false;

  save.pets = save.pets.filter((p) => p.instanceId !== f1Id && p.instanceId !== f2Id);
  primary.rarity = nextRarity;
  save.stats.petsMerged += 1;
  return true;
}

/**
 * Merges 5 eggs of the same rarity into 1 egg of the next rarity (up to Ultimate).
 */
export function mergeEggs(
  save: GameSaveData,
  rarity: Exclude<Rarity, 'mythic'>,
): boolean {
  const nextRarity = NEXT_RARITY[rarity];
  if (!nextRarity) return false;
  const stack = save.eggs.find((e) => e.rarity === rarity);
  if (!stack || stack.count < BALANCE.EGG_MERGE_REQUIRED) return false;

  stack.count -= BALANCE.EGG_MERGE_REQUIRED;
  addEggToSave(save, nextRarity, 1);
  save.stats.petsMerged += 1;
  return true;
}
