import { getServerStore } from './_store';
import type { ClubState, GameSaveData } from '../src/types/game';

interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
}

export function handleClubs(req: ApiRequest, res: ApiResponse): void {
  const store = getServerStore();
  if (req.method === 'GET') {
    const id = req.query.id ? String(req.query.id) : null;
    if (id) {
      const club = store.clubs.get(id);
      if (!club) {
        res.status(404).json({ error: 'Club not found' });
        return;
      }
      res.status(200).json({ club });
      return;
    }
    const clubs = Array.from(store.clubs.values())
      .filter((c) => c.isPublic && c.members.length < 10)
      .sort((a, b) => b.totalXp - a.totalXp)
      .slice(0, 30);
    res.status(200).json({ clubs });
    return;
  }

  if (req.method === 'POST') {
    const club = req.body?.club as ClubState | undefined;
    if (!club || !club.id) {
      res.status(400).json({ error: 'club payload required' });
      return;
    }
    store.clubs.set(club.id, club);
    res.status(200).json({ ok: true, club });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}

export default handleClubs;

export function handleAccount(req: ApiRequest, res: ApiResponse): void {
  const store = getServerStore();
  if (req.method === 'GET') {
    const playerId = String(req.query.playerId ?? '');
    const record = store.backups.get(playerId);
    if (!record) {
      res.status(404).json({ error: 'No backup found' });
      return;
    }
    res.status(200).json(record);
    return;
  }
  if (req.method === 'POST') {
    const playerId = String(req.body?.playerId ?? '');
    const save = req.body?.save as GameSaveData | undefined;
    if (!playerId || !save) {
      res.status(400).json({ error: 'playerId and save required' });
      return;
    }
    store.backups.set(playerId, { updatedAtMs: Date.now(), save });
    res.status(200).json({ ok: true, updatedAtMs: Date.now() });
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}
