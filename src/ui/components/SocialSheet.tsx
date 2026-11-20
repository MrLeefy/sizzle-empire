import React, { useEffect, useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { ClubState } from '@/types/game';
import { CLUB_SEASON_REWARDS, getClubMultiplierForLevel } from '@/data/events';
import { canAccessClubs } from '@/engine/social/clubService';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { GEAR_BY_ID } from '@/data/gear';
import type { LeaderboardSnapshot } from '@/engine/social/leaderboardService';
import {
  CheckIcon,
  CloseIcon,
  ClubIcon,
  GemIcon,
  LockIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from './CartoonIcons';

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

  const switchTab = (next: 'clubs' | 'leaderboard') => {
    if (tab !== next) {
      controller.playUiSound('tab');
      setTab(next);
    }
  };

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
      .filter(
        (i) =>
          !i.isBlueprint &&
          !equippedIds.has(i.instanceId) &&
          GEAR_BY_ID[i.templateId]?.rarity === 'common',
      )
      .map((i) => i.instanceId);
    if (fodder.length === 0) {
      controller.playUiSound('error');
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
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">
            <ClubIcon size={22} />
            <span>Clubs &amp; Verified Standings</span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close clubs"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button
            type="button"
            className={`sheet-tab ${tab === 'clubs' ? 'active' : ''}`}
            onClick={() => switchTab('clubs')}
          >
            Clubs
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => switchTab('leaderboard')}
          >
            Leaderboards
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'clubs' && (
            <>
              {!unlockedClubs ? (
                <div className="item-card-col empty-card">
                  <LockIcon size={28} />
                  <strong className="text-ink">
                    Clubs Unlock at City {BALANCE.CLUB_UNLOCK_CITY}
                  </strong>
                  <div className="card-sub text-muted">
                    You are currently in City {save.cityNumber}. Reach City{' '}
                    {BALANCE.CLUB_UNLOCK_CITY} to found or join a 10-player Club, salvage spare
                    gear for shared XP, and unlock up to ×2.0 Club All Profit + Mythic Club Crates!
                  </div>
                </div>
              ) : !club ? (
                <>
                  <div className="item-card-col">
                    <strong className="card-title text-ink inline-icon-label">
                      Found a New Club (1,000 <GemIcon size={14} />)
                    </strong>
                    <div className="row-gap">
                      <input
                        value={clubName}
                        onChange={(e) => setClubName(e.target.value)}
                        placeholder="Club Name"
                        className="cartoon-input flex-2"
                      />
                      <input
                        value={clubTag}
                        onChange={(e) => setClubTag(e.target.value)}
                        placeholder="TAG"
                        maxLength={4}
                        className="cartoon-input flex-1"
                      />
                    </div>
                    <div className="row-between">
                      <label className="checkbox-label text-ink">
                        <input
                          type="checkbox"
                          checked={isPublic}
                          onChange={(e) => {
                            controller.playUiSound('tap');
                            setIsPublic(e.target.checked);
                          }}
                        />
                        <span>Public Discovery</span>
                      </label>
                      <button
                        type="button"
                        className="pill-btn gold sm"
                        onClick={() => {
                          const res = controller.foundClub(clubName, clubTag, isPublic);
                          if (!res.ok) {
                            controller.playUiSound('error');
                            if (res.error) controller.pushToast(res.error, 'warning');
                          }
                        }}
                      >
                        <span>Create (1,000</span>
                        <GemIcon size={13} />
                        <span>)</span>
                      </button>
                    </div>
                  </div>

                  <div className="item-card-col">
                    <strong className="card-title text-ink">Join Club by ID</strong>
                    <div className="row-gap">
                      <input
                        value={joinId}
                        onChange={(e) => setJoinId(e.target.value)}
                        placeholder="CLB-XXXXXX"
                        className="cartoon-input flex-1"
                      />
                      <button
                        type="button"
                        className="pill-btn blue sm"
                        onClick={async () => {
                          try {
                            const r = await fetch(
                              `/api/clubs?id=${encodeURIComponent(joinId.trim())}`,
                            );
                            if (r.ok) {
                              const data = (await r.json()) as { club: ClubState };
                              const res = controller.joinClub(data.club);
                              if (!res.ok) {
                                controller.playUiSound('error');
                                if (res.error) controller.pushToast(res.error, 'warning');
                              }
                              return;
                            }
                          } catch {
                            // Offline
                          }
                          controller.playUiSound('error');
                          controller.pushToast('Club ID not found or offline.', 'warning');
                        }}
                      >
                        Join
                      </button>
                    </div>
                  </div>

                  <div className="item-card-col">
                    <div className="row-between">
                      <strong className="card-title text-ink">Public Clubs Directory</strong>
                      <span className={`card-sub ${clubsOnline ? 'text-profit' : 'text-muted'}`}>
                        {clubsOnline ? 'Online' : 'Offline Mode'}
                      </span>
                    </div>
                    {discoveredClubs.length === 0 ? (
                      <div className="card-sub text-muted">
                        No public clubs returned right now. Create your own club or reconnect online
                        to discover active player clubs.
                      </div>
                    ) : (
                      discoveredClubs.map((c) => (
                        <div className="item-card" key={c.id}>
                          <div className="min-w-0">
                            <strong className="card-title text-ink">
                              [{c.tag}] {c.name}
                            </strong>
                            <div className="card-sub text-muted tabular-nums">
                              Lv {c.level} · {c.members.length}/10 members
                            </div>
                          </div>
                          <button
                            type="button"
                            className="pill-btn sm"
                            onClick={() => {
                              const res = controller.joinClub(c);
                              if (!res.ok) {
                                controller.playUiSound('error');
                                if (res.error) controller.pushToast(res.error, 'warning');
                              }
                            }}
                          >
                            Join
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="item-card-col card-accent-sky">
                    <div className="row-between">
                      <div className="min-w-0">
                        <strong className="card-title text-ink">
                          [{club.tag}] {club.name}
                        </strong>
                        <div className="card-sub text-muted tabular-nums">
                          ID: {club.id} · Season {club.seasonId} · {club.members.length}/10 Members
                        </div>
                      </div>
                      <span className="rarity-tag mythic tabular-nums">
                        Lv {club.level} · ×{getClubMultiplierForLevel(club.level).toFixed(2)}
                      </span>
                    </div>
                    <div className="card-stat text-profit tabular-nums">
                      Total Season XP: {club.totalXp.toLocaleString()}
                    </div>
                    <div className="btn-row">
                      <button type="button" className="pill-btn gold sm" onClick={donateAllCommons}>
                        Salvage Spare Commons → Club XP
                      </button>
                      <button
                        type="button"
                        className="pill-btn danger sm"
                        onClick={() => {
                          controller.playUiSound('tap');
                          controller.exitClub();
                        }}
                      >
                        Leave Club
                      </button>
                    </div>
                  </div>

                  <strong className="section-label text-muted">Members</strong>
                  {club.members.map((m) => (
                    <div className="item-card" key={m.playerId}>
                      <div className="min-w-0">
                        <strong className="card-title text-ink">{m.displayName}</strong>{' '}
                        <span className="role-tag text-gold">{m.role.toUpperCase()}</span>
                        <div className="card-sub text-muted">City {m.cityNumber}</div>
                      </div>
                      <strong className="text-sky tabular-nums">
                        {m.seasonXp.toLocaleString()} XP
                      </strong>
                    </div>
                  ))}

                  <strong className="section-label text-muted">
                    Seasonal Milestones (Lv 2 → Lv 50)
                  </strong>
                  {CLUB_SEASON_REWARDS.slice(0, 15).map((r) => {
                    const claimed = club.claimedLevels.includes(r.level);
                    const ready = club.level >= r.level && !claimed;
                    return (
                      <div className="item-card" key={r.level}>
                        <div className="min-w-0">
                          <strong className="card-title text-ink">Lv {r.level}</strong>:{' '}
                          <span className="text-ink">{r.label}</span>
                          <div className="card-sub-xs text-muted tabular-nums">
                            {r.cumulativeXp.toLocaleString()} Total XP
                          </div>
                        </div>
                        <button
                          type="button"
                          className={ready ? 'pill-btn gold sm' : 'pill-btn ghost sm'}
                          disabled={!ready}
                          onClick={() => controller.claimClubReward(r.level)}
                        >
                          {claimed ? (
                            <>
                              <span>Claimed</span>
                              <CheckIcon size={14} />
                            </>
                          ) : ready ? (
                            'Claim'
                          ) : (
                            'Locked'
                          )}
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
                <div className="row-between">
                  <div className="row-center-tight">
                    <ShieldCheckIcon size={18} />
                    <strong className="card-title text-ink">
                      Your Division: {save.social.leaderboardDivision.toUpperCase()}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="pill-btn blue sm"
                    onClick={async () => {
                      controller.playUiSound('tap');
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
                    <RefreshIcon size={14} />
                    <span>Verify &amp; Sync</span>
                  </button>
                </div>
                <div className="card-sub text-muted">
                  Gameplay runs 100% locally. Competitive standings are validated via hash-chained
                  progression checkpoints, server challenge nonces, and optional Android Play
                  Integrity ({save.social.playIntegrityAttested ? 'Attested' : 'PWA/Unattested'}).
                </div>
              </div>

              <div className="buy-mode-strip">
                {(['verified', 'provisional', 'unranked'] as const).map((div) => (
                  <button
                    type="button"
                    key={div}
                    className={`buy-mode-btn ${division === div ? 'active' : ''}`}
                    onClick={() => {
                      if (division !== div) {
                        controller.playUiSound('tab');
                        setDivision(div);
                      }
                    }}
                  >
                    {div.toUpperCase()}
                  </button>
                ))}
              </div>

              {board?.message && <div className="notice-pill-gold text-center">{board.message}</div>}

              {board && board.entries.length > 0 ? (
                board.entries.map((entry, idx) => (
                  <div
                    className={`item-card ${entry.isSelf ? 'card-self' : ''}`}
                    key={entry.playerId}
                  >
                    <div className="min-w-0">
                      <strong className="card-title text-ink">
                        #{idx + 1} {entry.displayName} {entry.isSelf ? '(You)' : ''}
                      </strong>
                      <div className="card-sub text-muted tabular-nums">
                        {entry.totalRestaurantsRenovated} Renovations · +
                        {entry.allProfitPct.toLocaleString()}% Profit
                      </div>
                    </div>
                    <strong className="text-gold tabular-nums">City {entry.cityNumber}</strong>
                  </div>
                ))
              ) : (
                <div className="item-card-col empty-card text-muted">
                  No verified entries in this division yet. Click &quot;Verify &amp; Sync&quot; to
                  submit your progression checkpoint.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
