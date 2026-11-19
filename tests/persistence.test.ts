import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SaveStorage } from '@/engine/persistence/storage';
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  createNewGameSave,
  exportSaveToJson,
  importSaveFromJson,
  validateAndMigrateEnvelope,
} from '@/engine/persistence/saveSchema';

describe('Phase 10: Atomic IndexedDB Persistence, Corruption Recovery & Migrations', () => {
  const storage = new SaveStorage();

  beforeEach(async () => {
    await storage.clear();
  });

  it('saves and reloads complete GameSaveData atomically in IndexedDB without losing Decimal precision', async () => {
    const save = createNewGameSave(999);
    save.cityNumber = 12;
    save.gems = 4321;
    save.mainRestaurant.cash = '9.87654321e42';
    save.mainRestaurant.stations[0].level = 19;

    await storage.save(save);
    const loaded = await storage.load();

    expect(loaded.recoveredFromBackup).toBe(false);
    expect(loaded.save).not.toBeNull();
    expect(loaded.save?.cityNumber).toBe(12);
    expect(loaded.save?.gems).toBe(4321);
    expect(loaded.save?.mainRestaurant.cash).toBe('9.87654321e42');
    expect(loaded.save?.mainRestaurant.stations[0].level).toBe(19);
  });

  it('recovers automatically from atomic backup snapshot if primary write is corrupted mid-crash', async () => {
    const v1 = createNewGameSave(1001);
    v1.cityNumber = 5;
    v1.gems = 777;
    await storage.save(v1);

    // Second save promotes v1 into backup and writes v2 into primary
    const v2 = createNewGameSave(1002);
    v2.cityNumber = 6;
    v2.gems = 888;
    await storage.save(v2);

    // Simulate power loss corrupting primary slot
    await storage._corruptPrimaryForTest();

    const loaded = await storage.load();
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.save?.cityNumber).toBe(5);
    expect(loaded.save?.gems).toBe(777);
  });

  it('migrates legacy v1 save payloads cleanly to current schema version', () => {
    const fresh = createNewGameSave(1234);
    const legacyV1: Record<string, unknown> = {
      schemaVersion: 1,
      savedAtMs: Date.now(),
      rngState: 1234,
      cityNumber: 4,
      restaurantStageIndex: 2,
      gems: 150,
      petFood: 90,
      mainRestaurant: fresh.mainRestaurant,
      inventory: fresh.inventory,
      equipped: fresh.equipped,
      pets: [],
      equippedPetIds: [null, null],
      eggs: [],
      vault: { unlockedIds: ['tip_jar'], levels: { tip_jar: 3 } },
      achievementsClaimedTiers: {},
      claimedChefRanks: [],
    };

    const migrated = validateAndMigrateEnvelope(legacyV1);
    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(migrated?.cityNumber).toBe(4);
    expect(migrated?.events.activeView).toBe('main');
    expect(migrated?.settings.targetFps).toBe(60);
  });

  it('roundtrips JSON export/import and rejects tampered JSON checksums', () => {
    const save = createNewGameSave(555);
    save.gems = 999;
    const json = exportSaveToJson(save);

    const ok = importSaveFromJson(json);
    expect(ok?.gems).toBe(999);

    // Tamper gems inside exported JSON without recalculating checksum
    const tampered = json.replace('"gems": 999', '"gems": 999999');
    expect(importSaveFromJson(tampered)).toBeNull();
  });
});
