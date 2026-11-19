import type {
  AdventureId,
  EventDifficulty,
  EventMedal,
  GameSaveData,
  MajorEventId,
} from '@/types/game';
import { BALANCE } from '@/engine/economy/balanceConfig';
import {
  ADVENTURES,
  ARCANE_VAULT_ARTIFACTS,
  MAJOR_EVENTS,
  MERCHANT_OFFERS,
  POTION_RECIPES,
} from '@/data/events';
import { getRestaurantTemplate } from '@/data/restaurants';
import { createInitialRestaurantRuntime } from '@/engine/sim/restaurantSim';
import {
  getRestaurantCompletionPercent,
  isRestaurantComplete,
} from '@/engine/economy/economy';
import { getEquippedPetInstances } from '@/engine/economy/stats';
import { SeededRNG } from '@/engine/rng';
import { openBoxes } from '@/engine/meta/lootBoxes';

const DIFFICULTY_ORDER: EventDifficulty[] = ['normal', 'hard', 'extreme', 'impossible', 'nightmare'];

export function createInitialEventsState(): GameSaveData['events'] {
  const makeMajor = (eventId: MajorEventId) => ({
    eventId,
    unlockedDifficulty: 'normal' as EventDifficulty,
    activeDifficulty: 'normal' as EventDifficulty,
    bestMedalByDifficulty: {},
    bestClearSecondsByDifficulty: {},
    activeRun: null,
    stageIndex: 0,
    claimedMilestones: [],
    completedCurrentRun: false,
  });

  const makeAdv = (adventureId: AdventureId) => ({
    adventureId,
    highestClearedLevel: 0,
    keys: 3,
    maxKeys: 4,
    lastKeyRegenMs: Date.now(),
    activeLevel: null,
    activeTimeRemainingSec: 240,
    activeRun: null,
    lastOutcome: null,
  });

  return {
    activeView: 'main',
    activeMajorEventId: 'crystal_cavern',
    activeAdventureId: 'olympian_trial',
    majorEvents: {
      crystal_cavern: makeMajor('crystal_cavern'),
      tidewater_pier: makeMajor('tidewater_pier'),
      lunar_outpost: makeMajor('lunar_outpost'),
      citadel_banquet: makeMajor('citadel_banquet'),
    },
    adventures: {
      olympian_trial: makeAdv('olympian_trial'),
      corsair_cove: makeAdv('corsair_cove'),
    },
    potionShop: {
      scrolls: 20,
      corks: 5,
      ingredients: {},
      activePotions: [],
      bottledPotions: [],
      activeMainBuffs: [],
      arcaneVaultUnlocked: ['potion_bandolier'],
      arcaneVaultLevels: { potion_bandolier: 1 },
      activeRun: null,
      completedCurrentRun: false,
    },
    activities: {
      merchantTokens: 0,
      merchantPurchasedIds: [],
      raceStars: 0,
      raceTierClaimed: 0,
      harvestPoints: 0,
      harvestTierClaimed: 0,
    },
  };
}

// ---------- Major Themed Events ----------

export function enterMajorEvent(
  save: GameSaveData,
  eventId: MajorEventId,
  difficulty?: EventDifficulty,
  startingCash = 0,
): void {
  const def = MAJOR_EVENTS[eventId];
  const prog = save.events.majorEvents[eventId];
  if (difficulty && DIFFICULTY_ORDER.indexOf(difficulty) <= DIFFICULTY_ORDER.indexOf(prog.unlockedDifficulty)) {
    if (prog.activeDifficulty !== difficulty) {
      prog.activeDifficulty = difficulty;
      prog.activeRun = null;
      prog.stageIndex = 0;
      prog.claimedMilestones = [];
      prog.completedCurrentRun = false;
    }
  }

  if (!prog.activeRun) {
    const stageTplId = def.stageTemplateIds[prog.stageIndex] ?? def.stageTemplateIds[0];
    const tpl = getRestaurantTemplate(stageTplId);
    const diffScale = BALANCE.EVENT_DIFFICULTY_SCALE[prog.activeDifficulty].costMult;
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: prog.stageIndex,
      startingCash: Math.max(25, startingCash),
      modeContext: 'major_event',
      difficultyMultiplier: diffScale,
      stationMaxLevelOverride: tpl.maxStationLevel,
      equippedPets: getEquippedPetInstances(save),
    });
    prog.activeRun = runtime;
  }

  save.events.activeMajorEventId = eventId;
  save.events.activeView = 'major_event';
}

export function evaluateMajorEventProgress(
  save: GameSaveData,
  eventId: MajorEventId,
): { newlyClaimedLabels: string[]; stageAdvanced: boolean; completedEvent: boolean } {
  const def = MAJOR_EVENTS[eventId];
  const prog = save.events.majorEvents[eventId];
  const run = prog.activeRun;
  if (!run) return { newlyClaimedLabels: [], stageAdvanced: false, completedEvent: false };

  const tpl = getRestaurantTemplate(run.templateId);
  const stagePct = getRestaurantCompletionPercent(tpl, run);
  const totalStages = def.stageTemplateIds.length;
  const overallPct = ((prog.stageIndex + stagePct / 100) / totalStages) * 100;
  const rewardMult = BALANCE.EVENT_DIFFICULTY_SCALE[prog.activeDifficulty].rewardMult;

  const newlyClaimedLabels: string[] = [];

  def.milestones.forEach((m, mIdx) => {
    if (overallPct >= m.progressPct && !prog.claimedMilestones.includes(mIdx)) {
      prog.claimedMilestones.push(mIdx);
      save.gems += m.gems * rewardMult;
      if (m.boxes > 0) {
        save.boxes[def.eventBoxType] = (save.boxes[def.eventBoxType] ?? 0) + m.boxes * rewardMult;
      }
      const medal: EventMedal = mIdx === 0 ? 'bronze' : mIdx === 1 ? 'silver' : 'gold';
      const rankOf = (x?: EventMedal) => (x === 'gold' ? 3 : x === 'silver' ? 2 : x === 'bronze' ? 1 : 0);
      if (rankOf(medal) > rankOf(prog.bestMedalByDifficulty[prog.activeDifficulty])) {
        prog.bestMedalByDifficulty[prog.activeDifficulty] = medal;
        save.stats.eventMedalsEarned += 1;
      }
      newlyClaimedLabels.push(m.label);
    }
  });

  let stageAdvanced = false;
  let completedEvent = false;

  if (isRestaurantComplete(tpl, run)) {
    if (prog.stageIndex + 1 < totalStages) {
      prog.stageIndex += 1;
      const nextTpl = getRestaurantTemplate(def.stageTemplateIds[prog.stageIndex]);
      const diffScale = BALANCE.EVENT_DIFFICULTY_SCALE[prog.activeDifficulty].costMult;
      const { runtime } = createInitialRestaurantRuntime({
        template: nextTpl,
        cityNumber: 1,
        restaurantStageIndex: prog.stageIndex,
        startingCash: 50,
        modeContext: 'major_event',
        difficultyMultiplier: diffScale,
        stationMaxLevelOverride: nextTpl.maxStationLevel,
        equippedPets: getEquippedPetInstances(save),
      });
      prog.activeRun = runtime;
      stageAdvanced = true;
    } else if (!prog.completedCurrentRun) {
      prog.completedCurrentRun = true;
      completedEvent = true;
      const elapsedSec = Math.max(1, Math.round((Date.now() - run.startedAtMs) / 1000));
      const prevBest = prog.bestClearSecondsByDifficulty[prog.activeDifficulty];
      if (!prevBest || elapsedSec < prevBest) {
        prog.bestClearSecondsByDifficulty[prog.activeDifficulty] = elapsedSec;
      }
      // Unlock next difficulty tier!
      const curIdx = DIFFICULTY_ORDER.indexOf(prog.activeDifficulty);
      const unlockedIdx = DIFFICULTY_ORDER.indexOf(prog.unlockedDifficulty);
      if (curIdx + 1 < DIFFICULTY_ORDER.length && curIdx + 1 > unlockedIdx) {
        prog.unlockedDifficulty = DIFFICULTY_ORDER[curIdx + 1];
      }
    }
  }

  return { newlyClaimedLabels, stageAdvanced, completedEvent };
}

export function resetMajorEventRun(save: GameSaveData, eventId: MajorEventId): void {
  const prog = save.events.majorEvents[eventId];
  prog.activeRun = null;
  prog.stageIndex = 0;
  prog.claimedMilestones = [];
  prog.completedCurrentRun = false;
}

// ---------- Timed Adventures (4-min Challenge Stages) ----------

export function regenAdventureKeys(save: GameSaveData, nowMs: number): void {
  const regenMs = 20 * 60 * 1000; // 1 key every 20 min for great playability
  for (const adv of Object.values(save.events.adventures)) {
    if (adv.keys < adv.maxKeys) {
      const elapsed = Math.max(0, nowMs - adv.lastKeyRegenMs);
      const gained = Math.floor(elapsed / regenMs);
      if (gained > 0) {
        adv.keys = Math.min(adv.maxKeys, adv.keys + gained);
        adv.lastKeyRegenMs = nowMs;
      }
    } else {
      adv.lastKeyRegenMs = nowMs;
    }
  }
}

export function startTimedAdventure(
  save: GameSaveData,
  adventureId: AdventureId,
  level: number,
  startingCash = 0,
): boolean {
  const def = ADVENTURES[adventureId];
  const prog = save.events.adventures[adventureId];
  const targetLv = Math.max(1, Math.min(def.maxLevels, Math.min(level, prog.highestClearedLevel + 1)));
  if (prog.keys <= 0) return false;

  prog.keys -= 1;
  const tpl = getRestaurantTemplate(def.templateId);
  const diffMult = Math.pow(1.22, targetLv - 1);
  const { runtime } = createInitialRestaurantRuntime({
    template: tpl,
    cityNumber: 1,
    restaurantStageIndex: 0,
    startingCash: Math.max(30, startingCash),
    modeContext: 'adventure',
    difficultyMultiplier: diffMult,
    stationMaxLevelOverride: Math.min(120, 20 + targetLv * 2),
    equippedPets: getEquippedPetInstances(save),
  });

  prog.activeLevel = targetLv;
  prog.activeTimeRemainingSec = def.timeLimitSec;
  prog.activeRun = runtime;
  prog.lastOutcome = null;
  save.events.activeAdventureId = adventureId;
  save.events.activeView = 'adventure';
  return true;
}

export function tickTimedAdventure(
  save: GameSaveData,
  adventureId: AdventureId,
  dt: number,
  keyKeepChance: number,
  rng: SeededRNG,
): { finished: boolean; won: boolean } {
  const def = ADVENTURES[adventureId];
  const prog = save.events.adventures[adventureId];
  if (!prog.activeRun || prog.activeLevel === null) {
    return { finished: false, won: false };
  }

  const tpl = getRestaurantTemplate(prog.activeRun.templateId);
  if (isRestaurantComplete(tpl, prog.activeRun)) {
    const level = prog.activeLevel;
    prog.highestClearedLevel = Math.max(prog.highestClearedLevel, level);
    save.stats.adventuresCompleted += 1;
    save.boxes[def.rewardBoxType] = (save.boxes[def.rewardBoxType] ?? 0) + 1;
    const rewards = openBoxes(save, def.rewardBoxType, 1, rng);
    const bonusGems = 8 + Math.floor(level * 1.5);
    save.gems += bonusGems;
    rewards.push({ kind: 'gems', amount: bonusGems, label: `${bonusGems} Gems` });

    // Vault Lucky Keycard refund roll
    if (rng.chance(keyKeepChance)) {
      prog.keys = Math.min(prog.maxKeys + 2, prog.keys + 1);
    }

    prog.lastOutcome = { won: true, level, rewards };
    prog.activeRun = null;
    prog.activeLevel = null;
    save.events.activeView = 'main';
    return { finished: true, won: true };
  }

  prog.activeTimeRemainingSec -= dt;
  if (prog.activeTimeRemainingSec <= 0) {
    const level = prog.activeLevel;
    prog.activeTimeRemainingSec = 0;
    prog.lastOutcome = { won: false, level, rewards: [] };
    prog.activeRun = null;
    prog.activeLevel = null;
    save.events.activeView = 'main';
    return { finished: true, won: false };
  }

  return { finished: false, won: false };
}

// ---------- Alchemist's Apothecary (Potion Crafting Event) ----------

export function getArcaneArtifactValue(save: GameSaveData, id: string): number {
  const art = ARCANE_VAULT_ARTIFACTS.find((a) => a.id === id);
  if (!art) return 0;
  if (!save.events.potionShop.arcaneVaultUnlocked.includes(id)) {
    if (id === 'potion_bandolier') return 2;
    if (id === 'distiller') return 300;
    if (id === 'crystal_catalyst') return 5;
    if (id === 'funnel') return 0.2;
    if (id === 'alchemy_scales') return 0;
    return 1;
  }
  const lv = save.events.potionShop.arcaneVaultLevels[id] ?? 1;
  const t = art.maxLevel <= 1 ? 1 : Math.min(1, (lv - 1) / (art.maxLevel - 1));
  return art.minVal + (art.maxVal - art.minVal) * t;
}

export function enterPotionShop(save: GameSaveData): void {
  const ps = save.events.potionShop;
  if (!ps.activeRun) {
    const tpl = getRestaurantTemplate('event_potion_shop');
    const { runtime } = createInitialRestaurantRuntime({
      template: tpl,
      cityNumber: 1,
      restaurantStageIndex: 0,
      startingCash: 40,
      modeContext: 'potion_shop',
      difficultyMultiplier: 1,
      stationMaxLevelOverride: tpl.maxStationLevel,
      ignoreGear: true,
      equippedPets: [],
    });
    ps.activeRun = runtime;
  }
  save.events.activeView = 'potion_shop';
}

export function getPotionIngredientCost(save: GameSaveData, recipeId: string, nextLevel: number): number {
  const recipe = POTION_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return 9999;
  const discount = getArcaneArtifactValue(save, 'alchemy_scales');
  const raw = recipe.baseIngredientCost * Math.pow(1.75, nextLevel - 1);
  return Math.max(1, Math.round(raw * (1 - discount)));
}

export function brewOrUpgradePotion(save: GameSaveData, recipeId: string): boolean {
  const ps = save.events.potionShop;
  const recipe = POTION_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;

  const maxSlots = Math.floor(getArcaneArtifactValue(save, 'potion_bandolier'));
  const maxLv = Math.floor(getArcaneArtifactValue(save, 'crystal_catalyst'));
  const existing = ps.activePotions.find((p) => p.recipeId === recipeId);

  if (!existing && ps.activePotions.length >= maxSlots) return false;
  const targetLv = existing ? existing.level + 1 : 1;
  if (targetLv > maxLv) return false;

  const cost = getPotionIngredientCost(save, recipeId, targetLv);
  const ingA = ps.ingredients[recipe.ingredientA] ?? 0;
  const ingB = ps.ingredients[recipe.ingredientB] ?? 0;
  if (ingA < cost || ingB < cost) return false;

  ps.ingredients[recipe.ingredientA] = ingA - cost;
  ps.ingredients[recipe.ingredientB] = ingB - cost;

  if (existing) {
    existing.level = targetLv;
  } else {
    ps.activePotions.push({ recipeId, level: 1 });
  }
  // Reward arcane scrolls for brewing milestones
  ps.scrolls += 3 + targetLv;
  return true;
}

export function bottleActivePotion(save: GameSaveData, recipeId: string): boolean {
  const ps = save.events.potionShop;
  if (ps.corks <= 0) return false;
  const idx = ps.activePotions.findIndex((p) => p.recipeId === recipeId);
  if (idx === -1) return false;
  const recipe = POTION_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;

  const [active] = ps.activePotions.splice(idx, 1);
  ps.corks -= 1;

  const fullEffect = recipe.baseEffect + (active.level - 1) * recipe.effectPerLevel;
  const funnelShare = getArcaneArtifactValue(save, 'funnel');
  const bottledEffect = Number((fullEffect * funnelShare).toFixed(4));
  const durationSec = Math.round(getArcaneArtifactValue(save, 'distiller'));

  const stack = ps.bottledPotions.find(
    (b) => b.recipeId === recipeId && b.level === active.level,
  );
  if (stack) {
    stack.count += 1;
    stack.effectValue = Math.max(stack.effectValue, bottledEffect);
    stack.durationSec = Math.max(stack.durationSec, durationSec);
  } else {
    ps.bottledPotions.push({
      recipeId,
      level: active.level,
      effectValue: bottledEffect,
      durationSec,
      count: 1,
    });
  }

  save.stats.potionsBottled += 1;
  ps.scrolls += 6;
  return true;
}

export function consumeBottledPotion(
  save: GameSaveData,
  recipeId: string,
  level: number,
  nowMs: number,
): boolean {
  const ps = save.events.potionShop;
  const idx = ps.bottledPotions.findIndex((b) => b.recipeId === recipeId && b.level === level && b.count > 0);
  if (idx === -1) return false;
  const recipe = POTION_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return false;

  const stack = ps.bottledPotions[idx];
  stack.count -= 1;
  if (stack.count <= 0) ps.bottledPotions.splice(idx, 1);

  const existingBuff = ps.activeMainBuffs.find((b) => b.recipeId === recipeId && b.expiresAtMs > nowMs);
  if (existingBuff) {
    existingBuff.expiresAtMs += stack.durationSec * 1000;
    existingBuff.effectValue = Math.max(existingBuff.effectValue, stack.effectValue);
  } else {
    ps.activeMainBuffs.push({
      recipeId,
      effectType: recipe.effectType,
      effectValue: stack.effectValue,
      expiresAtMs: nowMs + stack.durationSec * 1000,
    });
  }
  return true;
}

export function upgradeArcaneVault(save: GameSaveData, artifactId: string): boolean {
  const ps = save.events.potionShop;
  const art = ARCANE_VAULT_ARTIFACTS.find((a) => a.id === artifactId);
  if (!art) return false;

  if (!ps.arcaneVaultUnlocked.includes(artifactId)) {
    const unlockCost =
      BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS[
        Math.min(ps.arcaneVaultUnlocked.length, BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS.length - 1)
      ];
    if (ps.scrolls < unlockCost) return false;
    ps.scrolls -= unlockCost;
    ps.arcaneVaultUnlocked.push(artifactId);
    ps.arcaneVaultLevels[artifactId] = 1;
    return true;
  }

  const lv = ps.arcaneVaultLevels[artifactId] ?? 1;
  if (lv >= art.maxLevel) return false;
  const cost = art.scrollCostBase + (lv - 1) * art.scrollCostStep;
  if (ps.scrolls < cost) return false;
  ps.scrolls -= cost;
  ps.arcaneVaultLevels[artifactId] = lv + 1;
  return true;
}

// ---------- Traveling Merchant, Kitchen Sprint Race & Harvest ----------

export function buyMerchantOffer(save: GameSaveData, offerId: string): boolean {
  const offer = MERCHANT_OFFERS.find((o) => o.id === offerId);
  if (!offer) return false;
  const act = save.events.activities;
  if (act.merchantPurchasedIds.includes(offerId)) return false;
  if (act.merchantTokens < offer.tokenCost) return false;

  act.merchantTokens -= offer.tokenCost;
  act.merchantPurchasedIds.push(offerId);

  switch (offer.rewardKind) {
    case 'small_box':
      save.boxes.small = (save.boxes.small ?? 0) + offer.amount;
      break;
    case 'big_box':
      save.boxes.big = (save.boxes.big ?? 0) + offer.amount;
      break;
    case 'pet_food':
      save.petFood += offer.amount;
      break;
    case 'gems':
      save.gems += offer.amount;
      break;
    case 'potion_scrolls':
      save.events.potionShop.scrolls += offer.amount;
      break;
  }
  return true;
}

export const RACE_TIERS = [
  { stars: 15, gems: 35, smallBoxes: 2 },
  { stars: 40, gems: 75, smallBoxes: 4 },
  { stars: 85, gems: 150, bigBoxes: 1 },
  { stars: 150, gems: 300, bigBoxes: 2 },
] as const;

export function claimNextRaceReward(save: GameSaveData): boolean {
  const act = save.events.activities;
  const tier = RACE_TIERS[act.raceTierClaimed];
  if (!tier || act.raceStars < tier.stars) return false;
  act.raceTierClaimed += 1;
  save.gems += tier.gems;
  if ('smallBoxes' in tier && tier.smallBoxes) {
    save.boxes.small = (save.boxes.small ?? 0) + tier.smallBoxes;
  }
  if ('bigBoxes' in tier && tier.bigBoxes) {
    save.boxes.big = (save.boxes.big ?? 0) + tier.bigBoxes;
  }
  return true;
}

export const HARVEST_TIERS = [
  { points: 25, petFood: 60, corks: 2 },
  { points: 75, petFood: 140, corks: 3 },
  { points: 160, petFood: 260, corks: 5 },
] as const;

export function claimNextHarvestReward(save: GameSaveData): boolean {
  const act = save.events.activities;
  const tier = HARVEST_TIERS[act.harvestTierClaimed];
  if (!tier || act.harvestPoints < tier.points) return false;
  act.harvestTierClaimed += 1;
  save.petFood += tier.petFood;
  save.events.potionShop.corks += tier.corks;
  return true;
}
