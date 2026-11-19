import type {
  ComputedStats,
  GameSaveData,
  GearEffect,
  GearInstance,
  PetInstance,
  Rarity,
} from '@/types/game';
import { BALANCE } from './balanceConfig';
import { GEAR_BY_ID } from '@/data/gear';
import { PET_SPECIES_BY_ID } from '@/data/pets';
import { VAULT_BY_ID, getVaultValue } from '@/data/vault';
import { getClubMultiplierForLevel, POTION_RECIPES } from '@/data/events';

/**
 * Computes the All Profit (%) bonus for any gear piece at level 1..50.
 * Rings and Necklaces provide 2x the standard gear All Profit table.
 */
export function getGearAllProfitPercent(rarity: Rarity, level: number, isAccessory: boolean): number {
  const row = BALANCE.GEAR_ALL_PROFIT[rarity];
  const clampedLevel = Math.max(1, Math.min(50, Math.floor(level)));
  const t = (clampedLevel - 1) / 49;
  const base = Math.round(row.lv1 + (row.lv50 - row.lv1) * t);
  return isAccessory ? base * 2 : base;
}

export function getPetAllProfitPercent(rarity: Rarity, level: number): number {
  const row = BALANCE.PET_ALL_PROFIT[rarity];
  const clampedLevel = Math.max(1, Math.min(50, Math.floor(level)));
  const t = (clampedLevel - 1) / 49;
  return Math.round(row.lv1 + (row.lv50 - row.lv1) * t);
}

/**
 * Combines Own and All-Workers effects via the documented multiplicative formula:
 * total = (1 + own) * (1 + allWorkers) - 1
 */
export function combineOwnAndAll(own: number, allWorkers: number, clampProbability = false): number {
  const combined = (1 + Math.max(0, own)) * (1 + Math.max(0, allWorkers)) - 1;
  return clampProbability ? Math.min(1, Math.max(0, combined)) : Math.max(0, combined);
}

function accumulateEffects(
  effects: GearEffect[],
  bag: {
    ownWalk: number;
    allWalk: number;
    ownCook: number;
    allCook: number;
    ownInstant: number;
    allInstant: number;
    ownPerfect: number;
    allPerfect: number;
    ownDivine: number;
    allDivine: number;
    ownDouble: number;
    allDouble: number;
    instantOrder: number;
    goldenCustomer: number;
    greedyCustomer: number;
    reorderChance: number;
    perfectValue: number;
    divineValue: number;
    profitPerWorker: number;
  },
): void {
  for (const eff of effects) {
    switch (eff.type) {
      case 'walk_speed':
        bag.ownWalk += eff.value;
        break;
      case 'all_walk_speed':
        bag.allWalk += eff.value;
        break;
      case 'cook_speed':
        bag.ownCook += eff.value;
        break;
      case 'all_cook_speed':
        bag.allCook += eff.value;
        break;
      case 'instant_cook':
        bag.ownInstant += eff.value;
        break;
      case 'all_instant_cook':
        bag.allInstant += eff.value;
        break;
      case 'perfect_chance':
        bag.ownPerfect += eff.value;
        break;
      case 'all_perfect_chance':
        bag.allPerfect += eff.value;
        break;
      case 'divine_chance':
        bag.ownDivine += eff.value;
        break;
      case 'all_divine_chance':
        bag.allDivine += eff.value;
        break;
      case 'double_chance':
        bag.ownDouble += eff.value;
        break;
      case 'all_double_chance':
        bag.allDouble += eff.value;
        break;
      case 'instant_order':
        bag.instantOrder += eff.value;
        break;
      case 'golden_customer':
        bag.goldenCustomer += eff.value;
        break;
      case 'greedy_customer':
        bag.greedyCustomer += eff.value;
        break;
      case 'reorder_chance':
        bag.reorderChance += eff.value;
        break;
      case 'perfect_value':
        bag.perfectValue += eff.value;
        break;
      case 'divine_value':
        bag.divineValue += eff.value;
        break;
      case 'profit_per_worker':
        bag.profitPerWorker += eff.value;
        break;
    }
  }
}

export function getEquippedGearInstances(save: GameSaveData): GearInstance[] {
  const result: GearInstance[] = [];
  const byId = new Map(save.inventory.map((i) => [i.instanceId, i]));
  for (const instId of Object.values(save.equipped)) {
    if (!instId) continue;
    const found = byId.get(instId);
    if (found && !found.isBlueprint) result.push(found);
  }
  return result;
}

export function getEquippedPetInstances(save: GameSaveData): PetInstance[] {
  const result: PetInstance[] = [];
  const byId = new Map(save.pets.map((p) => [p.instanceId, p]));
  for (const pid of save.equippedPetIds) {
    if (!pid) continue;
    const found = byId.get(pid);
    if (found) result.push(found);
  }
  return result;
}

/**
 * Centralized stat aggregator for active simulation mode.
 * Honors `ignoreGear` (true inside the Alchemist's Apothecary Potion Shop event).
 */
export function computePlayerStats(
  save: GameSaveData,
  hiredWorkersCount: number,
  nowMs: number,
  options?: { ignoreGear?: boolean; inPotionShop?: boolean },
): ComputedStats {
  const bag = {
    ownWalk: 0,
    allWalk: 0,
    ownCook: 0,
    allCook: 0,
    ownInstant: 0,
    allInstant: 0,
    ownPerfect: 0,
    allPerfect: 0,
    ownDivine: 0,
    allDivine: 0,
    ownDouble: 0,
    allDouble: 0,
    instantOrder: 0,
    goldenCustomer: 0,
    greedyCustomer: 0,
    reorderChance: 0,
    perfectValue: 0,
    divineValue: 0,
    profitPerWorker: 0,
  };

  let allProfitPercent = 0;

  if (!options?.ignoreGear) {
    for (const gear of getEquippedGearInstances(save)) {
      const tpl = GEAR_BY_ID[gear.templateId];
      if (!tpl) continue;
      const isAccessory = tpl.slot === 'ring' || tpl.slot === 'necklace';
      allProfitPercent += getGearAllProfitPercent(tpl.rarity, gear.level, isAccessory);
      accumulateEffects(tpl.effects, bag);
    }

    for (const pet of getEquippedPetInstances(save)) {
      const sp = PET_SPECIES_BY_ID[pet.speciesId];
      if (!sp) continue;
      allProfitPercent += getPetAllProfitPercent(pet.rarity, pet.level);
      accumulateEffects(sp.effects, bag);
    }
  }

  // Potions: inside Potion Shop use active brewed cauldrons; outside use bottled main buffs
  if (options?.inPotionShop) {
    for (const brewed of save.events.potionShop.activePotions) {
      const recipe = POTION_RECIPES.find((r) => r.id === brewed.recipeId);
      if (!recipe) continue;
      const val = recipe.baseEffect + (brewed.level - 1) * recipe.effectPerLevel;
      accumulateEffects([{ type: recipe.effectType, value: val }], bag);
    }
  } else {
    for (const buff of save.events.potionShop.activeMainBuffs) {
      if (buff.expiresAtMs > nowMs) {
        accumulateEffects([{ type: buff.effectType, value: buff.effectValue }], bag);
      }
    }
  }

  // Vault values
  const vLevel = (id: string) =>
    save.vault.unlockedIds.includes(id) ? (save.vault.levels[id] ?? 1) : 0;

  const tipChance = getVaultValue(VAULT_BY_ID['tip_jar'], vLevel('tip_jar'));
  const boostAmp = getVaultValue(VAULT_BY_ID['boost_amp'], vLevel('boost_amp'));
  const investorGemChance = getVaultValue(VAULT_BY_ID['patron_compass'], vLevel('patron_compass'));
  const hourglassMult = getVaultValue(VAULT_BY_ID['chrono_glass'], vLevel('chrono_glass'));
  const registerSpeedMult = getVaultValue(VAULT_BY_ID['quick_register'], vLevel('quick_register'));
  const boostDurationMult = getVaultValue(VAULT_BY_ID['signal_tower'], vLevel('signal_tower'));
  const tipValueMult = getVaultValue(VAULT_BY_ID['tip_vault'], vLevel('tip_vault'));
  const offlineIncomeMult = getVaultValue(VAULT_BY_ID['offline_blade'], vLevel('offline_blade'));
  const customerWalkMult = getVaultValue(VAULT_BY_ID['swift_floor'], vLevel('swift_floor'));
  const investorCashMult = getVaultValue(VAULT_BY_ID['vip_briefcase'], vLevel('vip_briefcase'));
  const startingCash = getVaultValue(VAULT_BY_ID['starter_check'], vLevel('starter_check'));
  const adventureKeyKeepChance = getVaultValue(VAULT_BY_ID['adventure_keyring'], vLevel('adventure_keyring'));

  const allProfitMultiplier = 1 + allProfitPercent / 100;
  const vroombaMultiplier =
    bag.profitPerWorker > 0 ? 1 + bag.profitPerWorker * Math.max(0, hiredWorkersCount) : 1;
  const clubMultiplier = save.social.club ? getClubMultiplierForLevel(save.social.club.level) : 1;
  const isBoostActive = save.boost.activeUntilMs > nowMs;
  const activeBoostMultiplier = isBoostActive ? BALANCE.BASE_BOOST_MULTIPLIER * boostAmp : 1;

  const totalGlobalProfitMultiplier =
    allProfitMultiplier * vroombaMultiplier * clubMultiplier * activeBoostMultiplier;

  return {
    allProfitPercent,
    allProfitMultiplier,
    vroombaMultiplier,
    clubMultiplier,
    activeBoostMultiplier,
    totalGlobalProfitMultiplier,

    playerWalkSpeedMult: 1 + combineOwnAndAll(bag.ownWalk, bag.allWalk, false),
    playerCookSpeedMult: 1 + combineOwnAndAll(bag.ownCook, bag.allCook, false),
    playerInstantCookChance: combineOwnAndAll(bag.ownInstant, bag.allInstant, true),
    playerPerfectChance: combineOwnAndAll(bag.ownPerfect, bag.allPerfect, true),
    playerDivineChance: combineOwnAndAll(bag.ownDivine, bag.allDivine, true),
    playerDoubleChance: combineOwnAndAll(bag.ownDouble, bag.allDouble, true),

    workerWalkSpeedMult: 1 + Math.max(0, bag.allWalk),
    workerCookSpeedMult: 1 + Math.max(0, bag.allCook),
    workerInstantCookChance: Math.min(1, Math.max(0, bag.allInstant)),
    workerPerfectChance: Math.min(1, Math.max(0, bag.allPerfect)),
    workerDivineChance: Math.min(1, Math.max(0, bag.allDivine)),
    workerDoubleChance: Math.min(1, Math.max(0, bag.allDouble)),

    instantOrderChance: Math.min(1, Math.max(0, bag.instantOrder)),
    goldenCustomerChance: Math.min(1, Math.max(0, bag.goldenCustomer)),
    greedyCustomerChance: Math.min(1, Math.max(0, bag.greedyCustomer)),
    reorderChance: Math.min(0.85, Math.max(0, bag.reorderChance)),
    perfectValueBonus: Math.max(0, bag.perfectValue),
    divineValueBonus: Math.max(0, bag.divineValue),

    tipChance,
    tipValueMult,
    customerWalkMult,
    registerSpeedMult,
    offlineMaxSeconds: Math.round(BALANCE.BASE_OFFLINE_MAX_SECONDS * hourglassMult),
    offlineIncomeMult,
    startingCash,
    investorGemChance,
    investorCashMult,
    boostDurationSec: Math.round(BALANCE.BASE_BOOST_DURATION_SEC * boostDurationMult),
    adventureKeyKeepChance,
  };
}
