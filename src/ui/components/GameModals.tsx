import React from 'react';
import type { LootRewardItem, NumberNotation } from '@/types/game';
import type { OfflineEarningsReport, RenovationSummary } from '@/engine/GameController';
import { formatMoney } from '@/engine/economy/bigNumber';

export const OfflineModal: React.FC<{
  report: OfflineEarningsReport;
  notation: NumberNotation;
  onDismiss: () => void;
}> = ({ report, notation, onDismiss }) => {
  const mins = Math.floor(report.clampedSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const timeLabel = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m ${Math.floor(report.clampedSeconds % 60)}s`;

  return (
    <div className="sheet-backdrop modal-center" onClick={onDismiss}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🌙 Welcome Back, Chef!</div>
        </div>
        <div className="sheet-body" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#b8b2d0' }}>
            Your kitchen stayed busy while you were away for <strong>{timeLabel}</strong>!
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#86efac', margin: '8px 0' }}>
            +{formatMoney(report.earnings, notation)}
          </div>
          {report.recoveredFromBackup && (
            <div style={{ fontSize: 11, color: '#fde047' }}>
              Note: Automatically recovered cleanly from your atomic backup snapshot.
            </div>
          )}
          <button className="pill-btn gold" style={{ width: '100%', padding: 13, fontSize: 15 }} onClick={onDismiss}>
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
}> = ({ summary, onDismiss }) => (
  <div className="sheet-backdrop modal-center" onClick={onDismiss}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-header">
        <div className="sheet-title">
          {summary.isCityFlight ? '✈️ Flying to a New City!' : '🏗️ Grand Renovation Complete!'}
        </div>
      </div>
      <div className="sheet-body" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>{summary.isCityFlight ? '🌍' : '🎉'}</div>
        <div style={{ fontSize: 14, color: '#cbd5e1' }}>
          Completed <strong>{summary.previousRestaurantName}</strong>!
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#facc15' }}>
          Welcome to City {summary.nextCityNumber}: {summary.nextCityName}
        </div>
        <div style={{ fontSize: 13, color: '#86efac' }}>
          Now Opening: <strong>{summary.nextRestaurantName}</strong>
        </div>
        <div className="item-card" style={{ justifyContent: 'center', gap: 16 }}>
          <strong>📦 +{summary.smallBoxesEarned} Small Crates</strong>
          <strong>💎 +{summary.gemsEarned} Gems</strong>
        </div>
        <button className="pill-btn gold" style={{ width: '100%', padding: 13, fontSize: 15 }} onClick={onDismiss}>
          Open Doors!
        </button>
      </div>
    </div>
  </div>
);

export const BoxOpeningModal: React.FC<{
  title: string;
  rewards: LootRewardItem[];
  onClose: () => void;
}> = ({ title, rewards, onClose }) => (
  <div className="sheet-backdrop modal-center" onClick={onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
      <div className="sheet-header">
        <div className="sheet-title">{title}</div>
      </div>
      <div className="sheet-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {rewards.map((r, idx) => (
            <div
              key={idx}
              className={`item-card-col ${r.rarity ? `rarity-${r.rarity}` : ''}`}
              style={{ textAlign: 'center', padding: 10 }}
            >
              {r.rarity && <span className={`rarity-tag ${r.rarity}`}>{r.rarity}</span>}
              <strong style={{ fontSize: 12 }}>{r.label}</strong>
              <span style={{ fontSize: 10, color: '#b8b2d0', textTransform: 'uppercase' }}>
                {r.kind.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
        <button className="pill-btn gold" style={{ width: '100%', padding: 12, fontSize: 14 }} onClick={onClose}>
          Awesome!
        </button>
      </div>
    </div>
  </div>
);
