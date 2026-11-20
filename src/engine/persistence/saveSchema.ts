import type { GameSaveData, PlayerStatsCounters, SettingsState } from '@/types/game';
import { getCityByNumber } from '@/data/cities';
import { getRestaurantTemplate } from '@/data/restaurants';
import { createInitialRestaurantRuntime } from '@/engine/sim/restaurantSim';
import { createInitialEventsState } from '@/engine/events/eventEngine';
import { createGearInstance } from '@/engine/meta/equipment';
import { hashString } from '@/engine/anticheat/verifier';

export const CURRENT_SAVE_SCHEMA_VERSION = 2;

export const DEFAULT_SFX_VOLUME = 0.85;
export const DEFAULT_AMBIENT_ENABLED = true;
export const DEFAULT_AMBIENT_VOLUME = 0.35;

function sanitizeVolumeSetting(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export interface SaveEnvelope {
  schemaVersion: number;
  checksum: string;
  writtenAtMs: number;
  data: GameSaveData;
}

export function createDefaultStats(): PlayerStatsCounters {
  return {
    ordersPrepared: 0,
    stationsUpgraded: 0,
    employeesHired: 0,
    restaurantsRenovated: 0,
    citiesCompleted: 0,
    tipsCollected: 0,
    instantDishesMade: 0,
    perfectDishesMade: 0,
    divineDishesMade: 0,
    petDeliveries: 0,
    petTipsCollected: 0,
    boxesOpened: 0,
    itemsSalvaged: 0,
    itemsForged: 0,
    eggsHatched: 0,
    petsMerged: 0,
    petFoodSpent: 0,
    vaultUpgradesBought: 0,
    gemsSpent: 0,
    adventuresCompleted: 0,
    potionsBottled: 0,
    eventMedalsEarned: 0,
    clubItemsSalvaged: 0,
    popularDishesUsed: 0,
    helpersInvited: 0,
    soloRestaurantsFinished: 0,
    highestItemLevel: 1,
    highestPetLevel: 1,
  };
}

export function createNewGameSave(seed = 0x51a2e7d3, nowMs = Date.now()): GameSaveData {
  const { city } = getCityByNumber(1);
  const firstTemplate = getRestaurantTemplate(city.restaurantIds[0]);
  const { runtime } = createInitialRestaurantRuntime({
    template: firstTemplate,
    cityNumber: 1,
    restaurantStageIndex: 0,
    startingCash: 0,
    modeContext: 'main',
    difficultyMultiplier: 1,
  });

  const starterCap = createGearInstance('c_head_cap', false);
  const starterApron = createGearInstance('c_body_apron', false);
  const starterSpoon = createGearInstance('c_hand_spoon', false);

  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtMs: nowMs,
    rngState: seed >>> 0,
    cityNumber: 1,
    restaurantStageIndex: 0,
    gems: 25,
    petFood: 40,
    boxes: {
      small: 1,
      big: 0,
      event_cavern: 0,
      event_pier: 0,
      event_lunar: 0,
      event_citadel: 0,
      event_potion: 0,
      club: 0,
      pet: 0,
      ring_box: 0,
      necklace_box: 0,
    },
    mainRestaurant: runtime,
    inventory: [starterCap, starterApron, starterSpoon],
    equipped: {
      head: starterCap.instanceId,
      body: starterApron.instanceId,
      hand1: starterSpoon.instanceId,
      hand2: null,
      ring: null,
      necklace: null,
    },
    pets: [],
    equippedPetIds: [null, null],
    eggs: [{ rarity: 'common', count: 1, hatchingProgress: 0 }],
    vault: {
      unlockedIds: [],
      levels: {},
    },
    achievementsClaimedTiers: {},
    claimedChefRanks: [],
    stats: createDefaultStats(),
    events: createInitialEventsState(),
    social: {
      playerId: `chef_${Math.random().toString(36).slice(2, 10)}`,
      displayName: `Chef ${Math.floor(1000 + Math.random() * 9000)}`,
      club: null,
      clubLeaveCooldownUntilMs: 0,
      leaderboardDivision: 'verified',
      lastChallengeNonce: null,
      lastCheckpointAtMs: nowMs,
      checkpointsSubmitted: 0,
      playIntegrityAttested: false,
    },
    boost: {
      activeUntilMs: 0,
      chargesRemaining: 4,
      lastChargeRegenMs: nowMs,
    },
    settings: {
      soundEnabled: true,
      hapticsEnabled: true,
      targetFps: 60,
      graphicsQuality: 'high',
      notation: 'alphabetic',
      buyMode: '1',
      bulkStep: 50,
      cameraZoom: 1.0,
      sfxVolume: DEFAULT_SFX_VOLUME,
      ambientEnabled: DEFAULT_AMBIENT_ENABLED,
      ambientVolume: DEFAULT_AMBIENT_VOLUME,
    },
    lastCheckpointHash: 'genesis',
  };
}

export function wrapSaveEnvelope(data: GameSaveData): SaveEnvelope {
  const cloned: GameSaveData = {
    ...data,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    savedAtMs: Date.now(),
  };
  const json = JSON.stringify(cloned);
  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    checksum: hashString(json),
    writtenAtMs: cloned.savedAtMs,
    data: cloned,
  };
}

export function validateAndMigrateEnvelope(raw: unknown): GameSaveData | null {
  if (!raw || typeof raw !== 'object') return null;

  // Support either wrapped SaveEnvelope or legacy raw v1 GameSaveData
  let data: Record<string, unknown>;
  if ('checksum' in raw && 'data' in raw) {
    const env = raw as SaveEnvelope;
    if (!env.data || typeof env.data !== 'object') return null;
    const expected = hashString(JSON.stringify(env.data));
    if (env.checksum !== expected) {
      return null; // Corrupted payload detected!
    }
    data = structuredClone(env.data) as unknown as Record<string, unknown>;
  } else if ('cityNumber' in raw && 'mainRestaurant' in raw) {
    data = structuredClone(raw) as Record<string, unknown>;
  } else {
    return null;
  }

  const version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 1;
  const fresh = createNewGameSave();

  // Migration v1 -> v2: fill in newly added fields (events, social, boost, settings, boxes, stats)
  if (version < 2) {
    data.events = data.events ?? fresh.events;
    data.social = data.social ?? fresh.social;
    data.boost = data.boost ?? fresh.boost;
    data.settings = { ...fresh.settings, ...asPlainRecord(data.settings) };
    data.boxes = { ...fresh.boxes, ...(data.boxes as object ?? {}) };
    data.stats = { ...fresh.stats, ...(data.stats as object ?? {}) };
    data.lastCheckpointHash = data.lastCheckpointHash ?? 'genesis';
    data.schemaVersion = 2;
  }

  const migrated = data as unknown as GameSaveData;
  if (!migrated.mainRestaurant || !Array.isArray(migrated.mainRestaurant.stations)) {
    return null;
  }

  // Ensure transient worker/customer structures remain valid on reload
  migrated.stats = { ...fresh.stats, ...migrated.stats };
  migrated.boxes = { ...fresh.boxes, ...migrated.boxes };
  const mergedSettings: SettingsState = {
    ...fresh.settings,
    ...asPlainRecord(migrated.settings),
  };
  mergedSettings.sfxVolume = sanitizeVolumeSetting(mergedSettings.sfxVolume, DEFAULT_SFX_VOLUME);
  mergedSettings.ambientVolume = sanitizeVolumeSetting(
    mergedSettings.ambientVolume,
    DEFAULT_AMBIENT_VOLUME,
  );
  mergedSettings.ambientEnabled =
    typeof mergedSettings.ambientEnabled === 'boolean'
      ? mergedSettings.ambientEnabled
      : DEFAULT_AMBIENT_ENABLED;
  migrated.settings = mergedSettings;
  migrated.schemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
  return migrated;
}

export function exportSaveToJson(data: GameSaveData): string {
  return JSON.stringify(wrapSaveEnvelope(data), null, 2);
}

export function importSaveFromJson(json: string): GameSaveData | null {
  try {
    const parsed = JSON.parse(json);
    return validateAndMigrateEnvelope(parsed);
  } catch {
    return null;
  }
}
