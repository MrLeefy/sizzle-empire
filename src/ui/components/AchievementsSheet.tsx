import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import type { AchievementCategory } from '@/types/game';
import { ACHIEVEMENTS, CHEF_RANKS } from '@/data/achievements';
import { getCurrentChefRank, getTotalAchievementStars } from '@/engine/meta/achievements';

interface AchievementsSheetProps {
  controller: GameController;
  onClose: () => void;
}

const CATS: Array<{ id: AchievementCategory | 'ranks'; label: string }> = [
  { id: 'ranks', label: 'Chef Ranks' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'gear', label: 'Gear' },
  { id: 'pets', label: 'Pets' },
  { id: 'events', label: 'Events' },
  { id: 'mastery', label: 'Mastery' },
];

export const AchievementsSheet: React.FC<AchievementsSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<AchievementCategory | 'ranks'>('restaurant');
  const save = controller.save;
  const totalStars = getTotalAchievementStars(save);
  const currentRank = getCurrentChefRank(save);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">
            🏆 {currentRank.title} · ★ {totalStars}
          </div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          {CATS.map((c) => (
            <button
              key={c.id}
              className={`sheet-tab ${tab === c.id ? 'active' : ''}`}
              onClick={() => setTab(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="sheet-body">
          {tab === 'ranks'
            ? CHEF_RANKS.map((rank) => {
                const claimed = save.claimedChefRanks.includes(rank.rank);
                const ready = totalStars >= rank.requiredStars && !claimed;
                return (
                  <div className="item-card" key={rank.rank}>
                    <div>
                      <strong>
                        Rank {rank.rank}: {rank.title}
                      </strong>
                      <div style={{ fontSize: 11, color: '#facc15' }}>
                        Requires ★ {rank.requiredStars} · {rank.gems}💎
                        {rank.smallBoxes > 0 ? ` · ${rank.smallBoxes} Small Crates` : ''}
                        {rank.bigBoxes > 0 ? ` · ${rank.bigBoxes} Grand Crates` : ''}
                        {rank.petFood > 0 ? ` · ${rank.petFood}🍖` : ''}
                      </div>
                    </div>
                    <button
                      className={ready ? 'pill-btn gold' : 'pill-btn ghost'}
                      disabled={!ready}
                      onClick={() => controller.claimRank(rank.rank)}
                    >
                      {claimed ? 'Claimed ✓' : ready ? 'Claim' : `★ ${rank.requiredStars}`}
                    </button>
                  </div>
                );
              })
            : ACHIEVEMENTS.filter((a) => a.category === tab).map((ach) => {
                const claimedIdx = save.achievementsClaimedTiers[ach.id] ?? 0;
                const isComplete = claimedIdx >= ach.tiers.length;
                const tier = isComplete ? ach.tiers[ach.tiers.length - 1] : ach.tiers[claimedIdx];
                const progress = save.stats[ach.statKey] ?? 0;
                const pct = Math.min(100, (progress / Math.max(1, tier.goal)) * 100);
                const canClaim = !isComplete && progress >= tier.goal;

                return (
                  <div className="item-card-col" key={ach.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {ach.name} (Tier {Math.min(claimedIdx + 1, ach.tiers.length)}/{ach.tiers.length})
                        </strong>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                          {ach.description}: {progress.toLocaleString()} / {tier.goal.toLocaleString()}
                        </div>
                      </div>
                      <button
                        className={canClaim ? 'pill-btn gold' : 'pill-btn ghost'}
                        disabled={!canClaim}
                        onClick={() => controller.claimAchievement(ach.id)}
                      >
                        {isComplete ? 'Done ★' : `+${tier.gems}💎 +${ach.starsPerTier}★`}
                      </button>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
};
