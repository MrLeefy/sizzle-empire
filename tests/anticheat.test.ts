import { describe, expect, it } from 'vitest';
import { createNewGameSave } from '@/engine/persistence/saveSchema';
import { buildProgressionCheckpoint, verifyCheckpointPair } from '@/engine/anticheat/verifier';
import { createGearInstance, equipGearItem } from '@/engine/meta/equipment';
import leaderboardHandler from '../api/leaderboard';
import clubsHandler from '../api/clubs';

function runMockApi(
  handler: (req: never, res: never) => void,
  req: { method: string; query?: Record<string, string>; body?: Record<string, unknown> },
) {
  let statusCode = 200;
  let payload: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
    },
  };
  handler({ query: {}, ...req } as never, res as never);
  return { statusCode, payload };
}

describe('Phase 8.2: Anti-Cheat Checkpoints, False-Positive Safety & Serverless APIs', () => {
  it('accepts legitimate high-gear progression jumps without false positives', () => {
    const save = createNewGameSave(801);
    const t0 = 1_700_000_000_000;
    const chk1 = buildProgressionCheckpoint(save, 'nonce_1', t0);
    save.lastCheckpointHash = chk1.checkpointHash;
    save.social.lastCheckpointAtMs = t0;

    // Legitimate Mythic gear equipped + 10 minutes of play + 1 city completed
    const mythic = createGearInstance('m_head_valkyrie', false);
    mythic.level = 50;
    save.inventory.push(mythic);
    equipGearItem(save, mythic.instanceId);
    save.cityNumber = 2;
    save.stats.restaurantsRenovated = 7;
    save.stats.ordersPrepared = 450;
    save.gems += 220;

    const t1 = t0 + 10 * 60 * 1000;
    const chk2 = buildProgressionCheckpoint(save, 'nonce_2', t1);
    const verdict = verifyCheckpointPair(chk2, chk1, 'nonce_2', t1);

    expect(verdict.accepted).toBe(true);
    expect(verdict.division).toBe('verified');
    expect(verdict.flags).toEqual([]);
  });

  it('rejects tampered checkpoint hashes, forged gems, clock manipulation, and reward duplication rollbacks', () => {
    const save = createNewGameSave(802);
    const t0 = 1_700_000_000_000;
    const chk1 = buildProgressionCheckpoint(save, 'n1', t0);
    save.lastCheckpointHash = chk1.checkpointHash;

    // 1. Tampered hash
    const tampered = { ...chk1, cityNumber: 999 };
    const rTamper = verifyCheckpointPair(tampered, null, 'n1', t0);
    expect(rTamper.accepted).toBe(false);
    expect(rTamper.flags).toContain('tampered_checkpoint_hash');

    // 2. Impossible gem spike in 10 seconds -> routed to unranked for review
    save.gems += 500_000;
    const chkGems = buildProgressionCheckpoint(save, 'n2', t0 + 10_000);
    const rGems = verifyCheckpointPair(chkGems, chk1, 'n2', t0 + 10_000);
    expect(rGems.division).toBe('unranked');
    expect(rGems.flags).toContain('implausible_gem_inflow');

    // 3. Clock rewind & reward rollback duplication attempt
    const saveRollback = createNewGameSave(803);
    saveRollback.achievementsClaimedTiers = { ach_orders: 5 };
    const cHigh = buildProgressionCheckpoint(saveRollback, 'na', t0 + 60_000);
    saveRollback.lastCheckpointHash = cHigh.checkpointHash;
    saveRollback.achievementsClaimedTiers = { ach_orders: 1 };
    const cLow = buildProgressionCheckpoint(saveRollback, 'nb', t0 + 5_000);
    const rRollback = verifyCheckpointPair(cLow, cHigh, 'nb', t0 + 65_000);
    expect(rRollback.division).toBe('unranked');
    expect(rRollback.flags).toContain('reward_claim_rollback_duplication_risk');
    expect(rRollback.flags).toContain('clock_moved_backwards');
  });

  it('executes Vercel serverless leaderboard nonce -> verify -> admin review and clubs discovery flows', () => {
    const save = createNewGameSave(804);
    const pid = save.social.playerId;

    // Fetch challenge nonce
    const nonceRes = runMockApi(leaderboardHandler, {
      method: 'GET',
      query: { action: 'nonce', playerId: pid },
    });
    expect(nonceRes.statusCode).toBe(200);
    const nonce = (nonceRes.payload as { nonce: string }).nonce;
    expect(nonce).toMatch(/^srv_/);

    // Submit valid checkpoint
    const chk = buildProgressionCheckpoint(save, nonce, Date.now());
    const postRes = runMockApi(leaderboardHandler, {
      method: 'POST',
      body: { action: 'checkpoint', checkpoint: chk },
    });
    expect(postRes.statusCode).toBe(200);
    expect((postRes.payload as { division: string }).division).toBe('verified');

    // Query verified board
    const boardRes = runMockApi(leaderboardHandler, {
      method: 'GET',
      query: { action: 'board', division: 'verified' },
    });
    const entries = (boardRes.payload as { entries: Array<{ playerId: string }> }).entries;
    expect(entries.some((e) => e.playerId === pid)).toBe(true);

    // Sync and discover public club
    const clubSync = runMockApi(clubsHandler, {
      method: 'POST',
      body: {
        club: {
          id: 'CLB-TEST1',
          name: 'Test Chefs',
          tag: 'TEST',
          isPublic: true,
          seasonId: 'S1',
          totalXp: 500,
          level: 3,
          claimedLevels: [],
          members: [],
        },
      },
    });
    expect(clubSync.statusCode).toBe(200);

    const clubList = runMockApi(clubsHandler, { method: 'GET' });
    expect((clubList.payload as { clubs: Array<{ id: string }> }).clubs.some((c) => c.id === 'CLB-TEST1')).toBe(true);
  });
});
