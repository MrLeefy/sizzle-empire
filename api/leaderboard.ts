import { getServerStore, issueChallengeNonce } from './_store';
import { verifyCheckpointPair } from '../src/engine/anticheat/verifier';
import type { ProgressionCheckpoint } from '../src/types/game';

interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  headers?: Record<string, string | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  const store = getServerStore();

  if (req.method === 'GET') {
    const action = String(req.query.action ?? 'board');

    if (action === 'nonce') {
      const playerId = String(req.query.playerId ?? '');
      if (!playerId) {
        res.status(400).json({ error: 'playerId required' });
        return;
      }
      res.status(200).json({ nonce: issueChallengeNonce(playerId) });
      return;
    }

    if (action === 'review_queue') {
      // Lightweight admin review endpoint protected by ADMIN_API_KEY when set
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && req.headers?.['x-admin-key'] !== expectedKey) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }
      res.status(200).json({ queue: store.reviewQueue });
      return;
    }

    const division = String(req.query.division ?? 'verified') as
      | 'verified'
      | 'provisional'
      | 'unranked';

    const entries = Array.from(store.checkpoints.values())
      .filter((chk) => (store.divisions.get(chk.playerId) ?? 'provisional') === division)
      .sort((a, b) => b.cityNumber - a.cityNumber || b.totalRestaurantsRenovated - a.totalRestaurantsRenovated)
      .slice(0, 100)
      .map((chk) => ({
        playerId: chk.playerId,
        displayName: chk.displayName,
        cityNumber: chk.cityNumber,
        allProfitPct: chk.allProfitPct,
        totalRestaurantsRenovated: chk.totalRestaurantsRenovated,
        division,
        updatedAtMs: chk.createdAtMs,
      }));

    res.status(200).json({ division, entries });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};
    const action = String(body.action ?? 'checkpoint');

    if (action === 'admin_resolve') {
      const expectedKey = process.env.ADMIN_API_KEY;
      if (expectedKey && req.headers?.['x-admin-key'] !== expectedKey) {
        res.status(403).json({ error: 'Unauthorized' });
        return;
      }
      const playerId = String(body.playerId ?? '');
      const verdict = body.verdict === 'verified' ? 'verified' : 'unranked';
      store.divisions.set(playerId, verdict);
      for (const item of store.reviewQueue) {
        if (item.playerId === playerId && item.status === 'pending') {
          item.status = verdict === 'verified' ? 'approved_verified' : 'kept_unranked';
        }
      }
      res.status(200).json({ ok: true, playerId, division: verdict });
      return;
    }

    const checkpoint = body.checkpoint as ProgressionCheckpoint | undefined;
    if (!checkpoint || !checkpoint.playerId) {
      res.status(400).json({ error: 'checkpoint payload required' });
      return;
    }

    const prev = store.checkpoints.get(checkpoint.playerId) ?? null;
    const expectedNonce = store.nonces.get(checkpoint.playerId) ?? null;
    const result = verifyCheckpointPair(checkpoint, prev, expectedNonce, Date.now());

    if (!result.accepted) {
      res.status(422).json({ error: result.reason, flags: result.flags, division: 'unranked' });
      return;
    }

    store.checkpoints.set(checkpoint.playerId, checkpoint);
    store.divisions.set(checkpoint.playerId, result.division);

    if (result.division !== 'verified') {
      store.reviewQueue.push({
        playerId: checkpoint.playerId,
        displayName: checkpoint.displayName,
        checkpoint,
        flags: result.flags,
        division: result.division,
        recordedAtMs: Date.now(),
        status: 'pending',
      });
    }

    const nextNonce = issueChallengeNonce(checkpoint.playerId);
    res.status(200).json({
      ok: true,
      division: result.division,
      flags: result.flags,
      nextNonce,
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
