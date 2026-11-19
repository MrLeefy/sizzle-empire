import type { GameSaveData } from '@/types/game';
import {
  type SaveEnvelope,
  validateAndMigrateEnvelope,
  wrapSaveEnvelope,
} from './saveSchema';

const DB_NAME = 'sizzle_empire_db';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const PRIMARY_KEY = 'save_primary';
const BACKUP_KEY = 'save_backup';
const LS_FALLBACK_KEY = 'sizzle_empire_save_fallback';

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Atomic, double-buffered IndexedDB persistence engine:
 * - Writes new envelope into PRIMARY, and on confirmed commit copies previous valid
 *   primary into BACKUP (or writes both safely across transactions).
 * - On load, verifies checksum of PRIMARY; if interrupted/corrupted, seamlessly recovers
 *   from BACKUP without losing player progress!
 */
export class SaveStorage {
  private writeInFlight: Promise<void> = Promise.resolve();

  async save(data: GameSaveData): Promise<void> {
    const envelope = wrapSaveEnvelope(data);
    this.writeInFlight = this.writeInFlight.then(() => this.performAtomicWrite(envelope));
    return this.writeInFlight;
  }

  private async performAtomicWrite(envelope: SaveEnvelope): Promise<void> {
    if (hasIndexedDB()) {
      const db = await openDatabase();
      try {
        const existingPrimary = await idbGet(db, PRIMARY_KEY);
        if (existingPrimary && validateAndMigrateEnvelope(existingPrimary)) {
          // Preserve last verified snapshot in backup BEFORE replacing primary
          await idbPut(db, BACKUP_KEY, existingPrimary);
        }
        await idbPut(db, PRIMARY_KEY, envelope);
      } finally {
        db.close();
      }
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(envelope));
    }
  }

  async load(): Promise<{ save: GameSaveData | null; recoveredFromBackup: boolean }> {
    if (hasIndexedDB()) {
      const db = await openDatabase();
      try {
        const rawPrimary = await idbGet(db, PRIMARY_KEY);
        const primary = validateAndMigrateEnvelope(rawPrimary);
        if (primary) {
          return { save: primary, recoveredFromBackup: false };
        }

        const rawBackup = await idbGet(db, BACKUP_KEY);
        const backup = validateAndMigrateEnvelope(rawBackup);
        if (backup) {
          // Self-heal primary from valid backup
          await idbPut(db, PRIMARY_KEY, wrapSaveEnvelope(backup));
          return { save: backup, recoveredFromBackup: true };
        }
        return { save: null, recoveredFromBackup: false };
      } finally {
        db.close();
      }
    }

    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        try {
          return { save: validateAndMigrateEnvelope(JSON.parse(raw)), recoveredFromBackup: false };
        } catch {
          return { save: null, recoveredFromBackup: false };
        }
      }
    }
    return { save: null, recoveredFromBackup: false };
  }

  async clear(): Promise<void> {
    if (hasIndexedDB()) {
      const db = await openDatabase();
      try {
        await idbDelete(db, PRIMARY_KEY);
        await idbDelete(db, BACKUP_KEY);
      } finally {
        db.close();
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_FALLBACK_KEY);
    }
  }

  /** Test helper to simulate interrupted/corrupted primary write */
  async _corruptPrimaryForTest(): Promise<void> {
    if (!hasIndexedDB()) return;
    const db = await openDatabase();
    try {
      await idbPut(db, PRIMARY_KEY, {
        schemaVersion: 2,
        checksum: 'deadbeef00000000',
        writtenAtMs: Date.now(),
        data: { corrupted: true },
      });
    } finally {
      db.close();
    }
  }
}
