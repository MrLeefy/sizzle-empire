import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, RefreshCw } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import type { ClubState } from '@/types/game';
import { CLUB_SEASON_REWARDS, getClubMultiplierForLevel } from '@/data/events';
import { canAccessClubs } from '@/engine/social/clubService';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { GEAR_BY_ID } from '@/data/gear';
import type { LeaderboardSnapshot } from '@/engine/social/leaderboardService';

interface SocialSheetProps {
  controller: GameController;
  onClose: () => void;
}

export const SocialSheet: React.FC<SocialSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<'clubs' | 'leaderboard'>('clubs');
  const [clubName, setClubName] = useState('');
  const [clubTag, setClubTag] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [joinId, setJoinId] = useState('');
  const [discoveredClubs, setDiscoveredClubs] = useState<ClubState[]>([]);
  const [clubsOnline, setClubsOnline] = useState(false);
  const [division, setDivision] = useState<'verified' | 'provisional' | 'unranked'>('verified');
  const [board, setBoard] = useState<LeaderboardSnapshot | null>(null);

  const save = controller.save;
  const club = save.social.club;
  const unlockedClubs = canAccessClubs(save);

  const refreshBoard = async (div = division) => {
    const snap = await controller.socialClient.fetchLeaderboard(save, div);
    setBoard(snap);
  };

  const refreshClubs = async () => {
    const res = await controller.socialClient.discoverPublicClubs();
    setClubsOnline(res.online);
    setDiscoveredClubs(res.clubs);
  };

  useEffect(() => {
    if (tab === 'leaderboard') void refreshBoard(division);
    else void refreshClubs();
  }, [tab, division]);

  const donateAllCommons = () => {
    const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));
    const fodder = save.inventory
      .filter((i) => !i.isBlueprint && !equippedIds.has(i.instanceId) && GEAR_BY_ID[i.templateId]?.rarity === 'common')
      .map((i) => i.instanceId);
    if (fodder.length === 0) {
      controller.pushToast('No spare Common gear to donate.', 'warning');
      return;
    }
    const res = controller.donateGearToClub(fodder);
    controller.pushToast(
      `Donated ${res.itemsConsumed} items (+${res.xpDonated} Club XP → Lv ${res.newClubLevel})!`,
      'reward',
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🤝 Clubs & Verified Standings</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button className={`sheet-tab ${tab === 'clubs' ? 'active' : ''}`} onClick={() => setTab('clubs')}>
            Clubs
          </button>
          <button className={`sheet-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            Leaderboards
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'clubs' && (
            <>
              {!unlockedClubs ? (
                <div className="item-card-col" style={{ textAlign: 'center' }}>
                  <strong>🔒 Clubs Unlock at City {BALANCE.CLUB_UNLOCK_CITY}</strong>
                  <div style={{ fontSize: 12, color: '#b8b2d0' }}>
                    You are currently in City {save.cityNumber}. Reach City {BALANCE.CLUB_UNLOCK_CITY} to found or join a 10-player Club, salvage spare gear for shared XP, and unlock up to ×2.0 Club All Profit + Mythic Club Crates!
                  </div>
                </div>
              ) : !club ? (
                <>
                  <div className="item-card-col">
                    <strong>Found a New Club (1,000 💎)</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={clubName}
                        onChange={(e) => setClubName(e.target.value)}
                        placeholder="Club Name"
                        style={{
                          flex: 2,
                          padding: 8,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: '#130e1d',
                          color: '#fff',
                        }}
                      />
                      <input
                        value={clubTag}
                        onChange={(e) => setClubTag(e.target.value)}
                        placeholder="TAG"
                        maxLength={4}
                        style={{
                          flex: 1,
                          padding: 8,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: '#130e1d',
                          color: '#fff',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => setIsPublic(e.target.checked)}
                        />
                        Public Discovery
                      </label>
                      <button
                        className="pill-btn gold"
                        onClick={() => {
                          const res = controller.foundClub(clubName, clubTag, isPublic);
                          if (!res.ok && res.error) controller.pushToast(res.error, 'warning');
                        }}
                      >
                        Create (1,000💎)
                      </button>
                    </div>
                  </div>

                  <div className="item-card-col">
                    <strong>Join Club by ID</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={joinId}
                        onChange={(e) => setJoinId(e.target.value)}
                        placeholder="CLB-XXXXXX"
                        style={{
                          flex: 1,
                          padding: 8,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: '#130e1d',
                          color: '#fff',
                        }}
                      />
                      <button
                        className="pill-btn blue"
                        onClick={async () => {
                          try {
                            const r = await fetch(`/api/clubs?id=${encodeURIComponent(joinId.trim())}`);
                            if (r.ok) {
                              const data = (await r.json()) as { club: ClubState };
                              const res = controller.joinClub(data.club);
                              if (!res.ok && res.error) controller.pushToast(res.error, 'warning');
                              return;
                            }
                          } catch {
                            // Offline
                          }
                          controller.pushToast('Club ID not found or offline.', 'warning');
                        }}
                      >
                        Join
                      </button>
                    </div>
                  </div>

                  <div className="item-card-col">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>Public Clubs Directory</strong>
                      <span style={{ fontSize: 11, color: clubsOnline ? '#86efac' : '#b8b2d0' }}>
                        {clubsOnline ? 'Online' : 'Offline Mode'}
                      </span>
                    </div>
                    {discoveredClubs.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#b8b2d0' }}>
                        No public clubs returned right now. Create your own club or reconnect online to discover active player clubs.
                      </div>
                    ) : (
                      discoveredClubs.map((c) => (
                        <div className="item-card" key={c.id}>
                          <div>
                            <strong>
                              [{c.tag}] {c.name}
                            </strong>
                            <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                              Lv {c.level} · {c.members.length}/10 members
                            </div>
                          </div>
                          <button className="pill-btn" onClick={() => controller.joinClub(c)}>
                            Join
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="item-card-col" style={{ borderColor: '#38bdf8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          [{club.tag}] {club.name}
                        </strong>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                          ID: {club.id} · Season {club.seasonId} · {club.members.length}/10 Members
                        </div>
                      </div>
                      <span className="rarity-tag mythic">
                        Lv {club.level} · ×{getClubMultiplierForLevel(club.level).toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#86efac' }}>
                      Total Season XP: {club.totalXp.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="pill-btn gold" onClick={donateAllCommons}>
                        Salvage Spare Commons → Club XP
                      </button>
                      <button className="pill-btn danger" onClick={() => controller.exitClub()}>
                        Leave Club
                      </button>
                    </div>
                  </div>

                  <strong style={{ fontSize: 12 }}>Members</strong>
                  {club.members.map((m) => (
                    <div className="item-card" key={m.playerId}>
                      <div>
                        <strong>{m.displayName}</strong>{' '}
                        <span style={{ fontSize: 10, color: '#facc15' }}>{m.role.toUpperCase()}</span>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>City {m.cityNumber}</div>
                      </div>
                      <strong style={{ color: '#38bdf8' }}>{m.seasonXp.toLocaleString()} XP</strong>
                    </div>
                  ))}

                  <strong style={{ fontSize: 12 }}>Seasonal Milestones (Lv 2 → Lv 50)</strong>
                  {CLUB_SEASON_REWARDS.slice(0, 15).map((r) => {
                    const claimed = club.claimedLevels.includes(r.level);
                    const ready = club.level >= r.level && !claimed;
                    return (
                      <div className="item-card" key={r.level}>
                        <div>
                          <strong>Lv {r.level}</strong>: {r.label}
                          <div style={{ fontSize: 10, color: '#b8b2d0' }}>
                            {r.cumulativeXp.toLocaleString()} Total XP
                          </div>
                        </div>
                        <button
                          className={ready ? 'pill-btn gold' : 'pill-btn ghost'}
                          disabled={!ready}
                          onClick={() => controller.claimClubReward(r.level)}
                        >
                          {claimed ? 'Claimed ✓' : ready ? 'Claim' : 'Locked'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {tab === 'leaderboard' && (
            <>
              <div className="item-card-col">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={16} color="#22c55e" />
                    <strong>
                      Your Division: {save.social.leaderboardDivision.toUpperCase()}
                    </strong>
                  </div>
                  <button
                    className="pill-btn blue"
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={async () => {
                      const res = await controller.submitLeaderboardCheckpoint();
                      controller.pushToast(
                        res.online
                          ? `Checkpoint verified (${res.division})!`
                          : `Local checkpoint saved (${res.division}). Will sync online.`,
                        'info',
                      );
                      await refreshBoard(division);
                    }}
                  >
                    <RefreshCw size={12} /> Verify & Sync
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                  Gameplay runs 100% locally. Competitive standings are validated via hash-chained progression checkpoints, server challenge nonces, and optional Android Play Integrity ({save.social.playIntegrityAttested ? 'Attested' : 'PWA/Unattested'}).
                </div>
              </div>

              <div className="buy-mode-strip">
                {(['verified', 'provisional', 'unranked'] as const).map((div) => (
                  <button
                    key={div}
                    className={`buy-mode-btn ${division === div ? 'active' : ''}`}
                    onClick={() => setDivision(div)}
                  >
                    {div.toUpperCase()}
                  </button>
                ))}
              </div>

              {board?.message && (
                <div style={{ fontSize: 11, color: '#fde047', textAlign: 'center' }}>
                  {board.message}
                </div>
              )}

              {board && board.entries.length > 0 ? (
                board.entries.map((entry, idx) => (
                  <div
                    className="item-card"
                    key={entry.playerId}
                    style={{
                      borderColor: entry.isSelf ? '#facc15' : undefined,
                    }}
                  >
                    <div>
                      <strong>
                        #{idx + 1} {entry.displayName} {entry.isSelf ? '(You)' : ''}
                      </strong>
                      <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                        {entry.totalRestaurantsRenovated} Renovations · +{entry.allProfitPct.toLocaleString()}% Profit
                      </div>
                    </div>
                    <strong style={{ color: '#facc15' }}>City {entry.cityNumber}</strong>
                  </div>
                ))
              ) : (
                <div className="item-card-col" style={{ textAlign: 'center', color: '#b8b2d0', fontSize: 12 }}>
                  No verified entries in this division yet. Click &quot;Verify &amp; Sync&quot; to submit your progression checkpoint.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
