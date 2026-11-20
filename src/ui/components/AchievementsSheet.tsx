import React, { useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { AchievementCategory } from '@/types/game';
import { ACHIEVEMENTS, CHEF_RANKS } from '@/data/achievements';
import { getCurrentChefRank, getTotalAchievementStars } from '@/engine/meta/achievements';
import { CheckIcon, CloseIcon, GemIcon, SparkleIcon, TrophyIcon } from './CartoonIcons';

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

  const switchTab = (next: AchievementCategory | 'ranks') => {
    if (tab !== next) {
      controller.playUiSound('tab');
      setTab(next);
    }
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
            <TrophyIcon size={22} />
            <span>{currentRank.title}</span>
            <span className="header-resource-pill tabular-nums">
              <SparkleIcon size={14} /> {totalStars}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close achievements"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          {CATS.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`sheet-tab ${tab === c.id ? 'active' : ''}`}
              onClick={() => switchTab(c.id)}
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
                    <div className="min-w-0">
                      <strong className="card-title text-ink">
                        Rank {rank.rank}: {rank.title}
                      </strong>
                      <div className="card-sub text-gold tabular-nums">
                        Requires ★ {rank.requiredStars} · {rank.gems} Gems
                        {rank.smallBoxes > 0 ? ` · ${rank.smallBoxes} Small Crates` : ''}
                        {rank.bigBoxes > 0 ? ` · ${rank.bigBoxes} Grand Crates` : ''}
                        {rank.petFood > 0 ? ` · ${rank.petFood} Treats` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={ready ? 'pill-btn gold sm' : 'pill-btn ghost sm'}
                      disabled={!ready}
                      onClick={() => controller.claimRank(rank.rank)}
                    >
                      {claimed ? (
                        <>
                          <span>Claimed</span>
                          <CheckIcon size={14} />
                        </>
                      ) : ready ? (
                        'Claim'
                      ) : (
                        `★ ${rank.requiredStars}`
                      )}
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
                    <div className="row-between">
                      <div className="min-w-0">
                        <strong className="card-title text-ink">
                          {ach.name} (Tier {Math.min(claimedIdx + 1, ach.tiers.length)}/
                          {ach.tiers.length})
                        </strong>
                        <div className="card-sub text-muted tabular-nums">
                          {ach.description}: {progress.toLocaleString()} /{' '}
                          {tier.goal.toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={canClaim ? 'pill-btn gold sm' : 'pill-btn ghost sm'}
                        disabled={!canClaim}
                        onClick={() => controller.claimAchievement(ach.id)}
                      >
                        {isComplete ? (
                          <>
                            <span>Done</span>
                            <CheckIcon size={14} />
                          </>
                        ) : (
                          <>
                            <span>+{tier.gems}</span>
                            <GemIcon size={13} />
                            <span>+{ach.starsPerTier}★</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="progress-track candy-striped">
                      <div className="progress-fill candy-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
};
