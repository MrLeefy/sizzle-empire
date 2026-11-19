import type { ClubState, GameSaveData, ProgressionCheckpoint } from '../src/types/game';

/**
 * Lightweight backend store for Vercel serverless functions.
 * In production, swap the Maps with Vercel KV / Upstash Redis / Postgres via environment vars
 * while preserving the exact contract tested here.
 */
export interface AdminReviewItem {
  playerId: string;
  displayName: string;
  checkpoint: ProgressionCheckpoint;
  flags: string[];
  division: 'provisional' | 'unranked';
  recordedAtMs: number;
  status: 'pending' | 'approved_verified' | 'kept_unranked';
}

export interface ServerStore {
  nonces: Map<string, string>;
  checkpoints: Map<string, ProgressionCheckpoint>;
  divisions: Map<string, 'verified' | 'provisional' | 'unranked'>;
  reviewQueue: AdminReviewItem[];
  clubs: Map<string, ClubState>;
  backups: Map<string, { updatedAtMs: number; save: GameSaveData }>;
}

const g = globalThis as unknown as { __sizzleStore?: ServerStore };

export function getServerStore(): ServerStore {
  if (!g.__sizzleStore) {
    g.__sizzleStore = {
      nonces: new Map(),
      checkpoints: new Map(),
      divisions: new Map(),
      reviewQueue: [],
      clubs: new Map(),
      backups: new Map(),
    };
  }
  return g.__sizzleStore;
}

export function issueChallengeNonce(playerId: string): string {
  const store = getServerStore();
  const nonce = `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  store.nonces.set(playerId, nonce);
  return nonce;
}
