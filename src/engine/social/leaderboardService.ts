import type { ClubState, GameSaveData, ProgressionCheckpoint } from '@/types/game';
import { buildProgressionCheckpoint, verifyCheckpointPair } from '@/engine/anticheat/verifier';

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  cityNumber: number;
  allProfitPct: number;
  totalRestaurantsRenovated: number;
  division: 'verified' | 'provisional' | 'unranked';
  updatedAtMs: number;
  isSelf?: boolean;
}

export interface LeaderboardSnapshot {
  online: boolean;
  division: 'verified' | 'provisional' | 'unranked';
  entries: LeaderboardEntry[];
  message?: string;
}

/**
 * Lightweight optional backend client for Vercel serverless endpoints.
 * Ordinary gameplay NEVER depends on this — all methods fail over gracefully offline
 * and NEVER fabricate fake human opponents.
 */
export class OnlineSocialClient {
  private baseUrl: string;
  private lastSubmittedCheckpoint: ProgressionCheckpoint | null = null;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async submitCheckpoint(
    save: GameSaveData,
    offlineDurationSec = 0,
    playIntegrityToken?: string,
  ): Promise<{
    online: boolean;
    division: 'verified' | 'provisional' | 'unranked';
    flags: string[];
    checkpoint: ProgressionCheckpoint;
  }> {
    const nowMs = Date.now();
    let nonce = save.social.lastChallengeNonce ?? `local_${nowMs.toString(36)}`;

    // Try requesting a fresh server-issued challenge nonce first
    try {
      const nonceRes = await fetch(
        `${this.baseUrl}/api/leaderboard?action=nonce&playerId=${encodeURIComponent(save.social.playerId)}`,
        { method: 'GET' },
      );
      if (nonceRes.ok) {
        const data = (await nonceRes.json()) as { nonce?: string };
        if (data.nonce) nonce = data.nonce;
      }
    } catch {
      // Offline mode — continue with local checkpoint chain
    }

    const checkpoint = buildProgressionCheckpoint(
      save,
      nonce,
      nowMs,
      offlineDurationSec,
      playIntegrityToken,
    );

    try {
      const res = await fetch(`${this.baseUrl}/api/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkpoint', checkpoint }),
      });
      if (res.ok) {
        const result = (await res.json()) as {
          division: 'verified' | 'provisional' | 'unranked';
          flags: string[];
          nextNonce?: string;
        };
        save.lastCheckpointHash = checkpoint.checkpointHash;
        save.social.lastCheckpointAtMs = nowMs;
        save.social.checkpointsSubmitted += 1;
        save.social.leaderboardDivision = result.division;
        save.social.lastChallengeNonce = result.nextNonce ?? nonce;
        this.lastSubmittedCheckpoint = checkpoint;
        return { online: true, division: result.division, flags: result.flags ?? [], checkpoint };
      }
    } catch {
      // Offline fallback below
    }

    // Offline local self-check so player sees accurate local standing without pretending to be synced
    const localVerdict = verifyCheckpointPair(
      checkpoint,
      this.lastSubmittedCheckpoint,
      null,
      nowMs,
    );
    save.lastCheckpointHash = checkpoint.checkpointHash;
    save.social.lastCheckpointAtMs = nowMs;
    save.social.checkpointsSubmitted += 1;
    save.social.leaderboardDivision = localVerdict.division;
    this.lastSubmittedCheckpoint = checkpoint;
    return {
      online: false,
      division: localVerdict.division,
      flags: localVerdict.flags,
      checkpoint,
    };
  }

  async fetchLeaderboard(
    save: GameSaveData,
    division: 'verified' | 'provisional' | 'unranked',
  ): Promise<LeaderboardSnapshot> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/leaderboard?action=board&division=${encodeURIComponent(division)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { entries: LeaderboardEntry[] };
        const entries = (data.entries ?? []).map((e) => ({
          ...e,
          isSelf: e.playerId === save.social.playerId,
        }));
        return { online: true, division, entries };
      }
    } catch {
      // Graceful offline fallback — never fabricate fake human players!
    }

    const selfEntry: LeaderboardEntry | null =
      save.social.leaderboardDivision === division
        ? {
            playerId: save.social.playerId,
            displayName: save.social.displayName,
            cityNumber: save.cityNumber,
            allProfitPct: 0,
            totalRestaurantsRenovated: save.stats.restaurantsRenovated,
            division: save.social.leaderboardDivision,
            updatedAtMs: Date.now(),
            isSelf: true,
          }
        : null;

    return {
      online: false,
      division,
      entries: selfEntry ? [selfEntry] : [],
      message:
        'Offline mode: showing your verified local standing only. Connect online to sync with real players.',
    };
  }

  async discoverPublicClubs(): Promise<{ online: boolean; clubs: ClubState[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/clubs?action=discover`);
      if (res.ok) {
        const data = (await res.json()) as { clubs: ClubState[] };
        return { online: true, clubs: data.clubs ?? [] };
      }
    } catch {
      // Offline fallback
    }
    return { online: false, clubs: [] };
  }

  async syncClubState(club: ClubState): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/clubs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync', club }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async uploadCloudBackup(save: GameSaveData): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'backup',
          playerId: save.social.playerId,
          displayName: save.social.displayName,
          save,
        }),
      });
      if (res.ok) {
        return { ok: true, message: 'Cloud backup saved!' };
      }
      return { ok: false, message: 'Cloud server rejected backup.' };
    } catch {
      return { ok: false, message: 'Offline — local IndexedDB save is safe. Try cloud sync when online.' };
    }
  }

  async restoreCloudBackup(playerId: string): Promise<GameSaveData | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/account?action=restore&playerId=${encodeURIComponent(playerId)}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { save?: GameSaveData };
      return data.save ?? null;
    } catch {
      return null;
    }
  }
}
