import React from 'react';
import { Settings, Flame, ArrowLeft } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import { formatMoney } from '@/engine/economy/bigNumber';
import { getCityByNumber } from '@/data/cities';
import { ADVENTURES, MAJOR_EVENTS } from '@/data/events';

interface TopHudProps {
  controller: GameController;
  onOpenSettings: () => void;
}

export const TopHud: React.FC<TopHudProps> = ({ controller, onOpenSettings }) => {
  const save = controller.save;
  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const notation = save.settings.notation;
  const stats = controller.getActiveStats();
  const pct = controller.getCompletionPercent();
  const { city, loop } = getCityByNumber(save.cityNumber);

  const now = Date.now();
  const boostLeftSec = Math.max(0, Math.floor((save.boost.activeUntilMs - now) / 1000));
  const boostActive = boostLeftSec > 0;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const view = save.events.activeView;
  const advProg = view === 'adventure' ? save.events.adventures[save.events.activeAdventureId] : null;
  const advDef = view === 'adventure' ? ADVENTURES[save.events.activeAdventureId] : null;
  const majorDef = view === 'major_event' ? MAJOR_EVENTS[save.events.activeMajorEventId] : null;

  return (
    <div className="top-hud">
      {/* Row 1: Cash, Gems, Boost, Settings */}
      <div className="hud-row">
        <div className="currency-pill cash" title="Restaurant Cash">
          <span>💵</span>
          <span>{formatMoney(runtime.cash, notation, '$')}</span>
        </div>

        <div className="currency-pill gems" title="Permanent Gems">
          <span>💎</span>
          <span>{save.gems.toLocaleString()}</span>
        </div>

        <button
          className={`boost-pill ${boostActive ? 'active' : ''}`}
          onClick={() => controller.activateBoostCharge()}
          disabled={save.boost.chargesRemaining <= 0 && !boostActive}
          title="Gameplay-earned Profit Boost"
        >
          <Flame size={14} />
          {boostActive ? (
            <span>
              ×{stats.activeBoostMultiplier.toFixed(1)} · {formatTimer(boostLeftSec)}
            </span>
          ) : (
            <span>Boost ({save.boost.chargesRemaining})</span>
          )}
        </button>

        <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
          <Settings size={18} />
        </button>
      </div>

      {/* Row 2: City & Restaurant Completion Banner */}
      <div className="hud-row">
        <div className="city-banner">
          <div className="city-banner-top">
            <span>
              {view === 'main'
                ? `City ${save.cityNumber}${loop > 0 ? ` (Cycle ${loop + 1})` : ''} · ${city.name}`
                : template.name}
            </span>
            <span style={{ color: '#facc15' }}>{pct.toFixed(0)}%</span>
          </div>
          <div className="city-banner-sub">
            {view === 'main'
              ? `${template.name} (${save.restaurantStageIndex + 1}/${city.restaurantIds.length}) · All Profit +${stats.allProfitPercent.toLocaleString()}%`
              : `${template.subtitle} · ${runtime.ignoreGear ? 'Gear Disabled' : `All Profit +${stats.allProfitPercent.toLocaleString()}%`}`}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Optional Event / Adventure / Potion Shop Return Banner */}
      {view !== 'main' && (
        <div className="mode-return-banner">
          <span>
            {view === 'adventure' && advDef && advProg
              ? `${advDef.icon} ${advDef.name} Lv ${advProg.activeLevel} · ⏱ ${formatTimer(Math.ceil(advProg.activeTimeRemainingSec))}`
              : view === 'major_event' && majorDef
                ? `${majorDef.icon} ${majorDef.name} (${save.events.majorEvents[majorDef.id].activeDifficulty.toUpperCase()})`
                : '🧪 Alchemist Apothecary Event (Main City Saved)'}
          </span>
          <button
            className="pill-btn ghost"
            style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => controller.switchToMainRestaurant()}
          >
            <ArrowLeft size={12} /> Main City
          </button>
        </div>
      )}
    </div>
  );
};
