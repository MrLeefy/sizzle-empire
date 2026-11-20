import React, { useEffect, useRef, useState } from 'react';
import type { LootRewardItem, NumberNotation } from '@/types/game';
import type { OfflineEarningsReport, RenovationSummary } from '@/engine/GameController';
import type { SfxName } from '@/audio/soundEngine';
import { formatMoney } from '@/engine/economy/bigNumber';
import {
  AirplaneIcon,
  BlueprintIcon,
  CashIcon,
  ClockIcon,
  CrateIcon,
  EggIcon,
  GemIcon,
  RenovateIcon,
  ShieldIcon,
  SparkleIcon,
  TreatIcon,
} from './CartoonIcons';

const CONFETTI_COUNT = 12;
const CONFETTI_INDICES = Array.from({ length: CONFETTI_COUNT }, (_, i) => i);

const ConfettiBurst: React.FC = () => (
  <div className="confetti-burst" aria-hidden="true">
    {CONFETTI_INDICES.map((i) => (
      <span key={i} className="confetti-dot" />
    ))}
  </div>
);

const RewardKindIcon: React.FC<{ kind: LootRewardItem['kind'] }> = ({ kind }) => {
  switch (kind) {
    case 'blueprint':
      return <BlueprintIcon size={24} />;
    case 'egg':
      return <EggIcon size={24} />;
    case 'pet_food':
      return <TreatIcon size={24} />;
    case 'gems':
      return <GemIcon size={24} />;
    case 'gear':
    default:
      return <ShieldIcon size={24} />;
  }
};

export const OfflineModal: React.FC<{
  report: OfflineEarningsReport;
  notation: NumberNotation;
  onDismiss: () => void;
  onPlaySound?: (sfx: SfxName) => void;
}> = ({ report, notation, onDismiss, onPlaySound }) => {
  const mins = Math.floor(report.clampedSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const timeLabel =
    hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m ${Math.floor(report.clampedSeconds % 60)}s`;

  const handleCollect = () => {
    onPlaySound?.('coin');
    onDismiss();
  };

  return (
    <div
      className="sheet-backdrop modal-center"
      onClick={(e) => {
        e.stopPropagation();
        handleCollect();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="celebration-hero offline">
          <div className="modal-sunburst" aria-hidden="true" />
          <div className="hero-emblem">
            <CashIcon size={52} />
          </div>
          <span className="hero-ribbon gold">WELCOME BACK, CHEF!</span>
        </div>

        <div className="sheet-body text-center">
          <div className="time-away-pill">
            <ClockIcon size={15} />
            <span className="tabular-nums">Away for {timeLabel}</span>
          </div>
          <div className="modal-copy text-muted">
            Your kitchen team stayed busy serving guests while you were out!
          </div>
          <div className="offline-cash-hero hud-outline-text tabular-nums">
            +{formatMoney(report.earnings, notation)}
          </div>
          {report.recoveredFromBackup && (
            <div className="notice-pill-gold">
              Note: Automatically recovered cleanly from your atomic backup snapshot.
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="pill-btn lg" onClick={handleCollect}>
            Collect Earnings!
          </button>
        </div>
      </div>
    </div>
  );
};

export const RenovationModal: React.FC<{
  summary: RenovationSummary;
  onDismiss: () => void;
  onPlaySound?: (sfx: SfxName) => void;
}> = ({ summary, onDismiss, onPlaySound }) => {
  const handleBackdrop = () => {
    onPlaySound?.('sheet_close');
    onDismiss();
  };

  const handleOpenDoors = () => {
    onPlaySound?.('tap');
    onDismiss();
  };

  return (
    <div
      className="sheet-backdrop modal-center"
      onClick={(e) => {
        e.stopPropagation();
        handleBackdrop();
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className={`celebration-hero ${summary.isCityFlight ? 'flight' : 'renovate'}`}>
          <div className="modal-sunburst" aria-hidden="true" />
          <ConfettiBurst />
          <div className={`hero-emblem ${summary.isCityFlight ? 'flight-hero-icon' : ''}`}>
            {summary.isCityFlight ? <AirplaneIcon size={56} /> : <RenovateIcon size={56} />}
          </div>
          <span className={`hero-ribbon ${summary.isCityFlight ? 'sky' : 'gold'}`}>
            {summary.isCityFlight ? 'NEW CITY FLIGHT!' : 'GRAND RENOVATION!'}
          </span>
        </div>

        <div className="sheet-body text-center">
          <div className="modal-copy text-soft">
            Completed <strong className="text-ink">{summary.previousRestaurantName}</strong>!
          </div>
          <div className="celebration-city-title text-gold">
            Welcome to City {summary.nextCityNumber}: {summary.nextCityName}
          </div>
          <div className="modal-next-venue text-profit">
            Now Opening: <strong>{summary.nextRestaurantName}</strong>
          </div>
          <div className="reward-payout-strip">
            <span className="payout-pill tabular-nums">
              <CrateIcon size={20} /> +{summary.smallBoxesEarned} Small Crates
            </span>
            <span className="payout-pill tabular-nums">
              <GemIcon size={20} /> +{summary.gemsEarned} Gems
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="pill-btn gold lg" onClick={handleOpenDoors}>
            Open Doors!
          </button>
        </div>
      </div>
    </div>
  );
};

export const BoxOpeningModal: React.FC<{
  title: string;
  rewards: LootRewardItem[];
  onClose: () => void;
  onPlaySound?: (sfx: SfxName) => void;
}> = ({ title, rewards, onClose, onPlaySound }) => {
  const [phase, setPhase] = useState<'shaking' | 'revealed'>('shaking');
  const revealedRef = useRef(false);
  const onPlaySoundRef = useRef(onPlaySound);
  onPlaySoundRef.current = onPlaySound;

  const hasHighRarity = rewards.some(
    (r) => r.rarity === 'legendary' || r.rarity === 'ultimate' || r.rarity === 'mythic',
  );

  const revealNow = (fromTap: boolean) => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setPhase('revealed');
    if (fromTap) onPlaySoundRef.current?.('tap');
    if (hasHighRarity) onPlaySoundRef.current?.('achievement');
  };

  useEffect(() => {
    revealedRef.current = false;
    setPhase('shaking');
    const timer = window.setTimeout(() => {
      if (revealedRef.current) return;
      revealedRef.current = true;
      setPhase('revealed');
      if (hasHighRarity) onPlaySoundRef.current?.('achievement');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [rewards, hasHighRarity]);

  const handleClose = () => {
    onPlaySound?.('sheet_close');
    onClose();
  };

  return (
    <div
      className="sheet-backdrop modal-center"
      onClick={(e) => {
        e.stopPropagation();
        handleClose();
      }}
    >
      <div className="modal-card box-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">
            <CrateIcon size={22} />
            <span className="truncate">{title}</span>
          </div>
        </div>

        <button
          type="button"
          className={`crate-stage ${phase}`}
          onClick={() => revealNow(true)}
          aria-label={phase === 'shaking' ? 'Tap crate to burst open' : 'Crate opened'}
        >
          {phase === 'revealed' && (
            <>
              <div className="modal-sunburst" aria-hidden="true" />
              <div className="crate-burst-ring" aria-hidden="true" />
              <ConfettiBurst />
            </>
          )}
          <div className={`crate-box ${phase === 'shaking' ? 'shaking' : 'opened'}`}>
            <CrateIcon size={60} />
          </div>
          <span className={`crate-stage-pill ${phase === 'revealed' ? 'revealed' : ''}`}>
            {phase === 'shaking' ? (
              'Tap to burst open!'
            ) : (
              <>
                <SparkleIcon size={14} /> {rewards.length} Reward{rewards.length === 1 ? '' : 's'}{' '}
                Unlocked!
              </>
            )}
          </span>
        </button>

        <div className="sheet-body">
          <div className="box-reward-grid">
            {rewards.map((r, idx) => (
              <div
                key={idx}
                className={`item-card-col box-reward-card ${phase === 'revealed' ? 'is-revealed' : 'is-shaking'} ${r.rarity ? `rarity-${r.rarity} rarity-glow-${r.rarity}` : ''}`}
                style={{ '--stagger-idx': Math.min(idx, 8) } as React.CSSProperties}
              >
                {r.rarity && <span className={`rarity-tag ${r.rarity}`}>{r.rarity}</span>}
                <div className={`rarity-tile tile-md rarity-${r.rarity ?? 'common'}`}>
                  <RewardKindIcon kind={r.kind} />
                </div>
                <strong className="card-title text-ink">{r.label}</strong>
                <span className="reward-kind-label text-muted">{r.kind.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="pill-btn gold lg" onClick={handleClose}>
            Awesome!
          </button>
        </div>
      </div>
    </div>
  );
};
