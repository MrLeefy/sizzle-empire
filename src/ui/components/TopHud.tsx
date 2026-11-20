import React, { useEffect, useRef, useState } from 'react';
import type { GameController } from '@/engine/GameController';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import { getCityByNumber } from '@/data/cities';
import { ADVENTURES, MAJOR_EVENTS } from '@/data/events';
import {
  BackArrowIcon,
  CashIcon,
  ClockIcon,
  FlameIcon,
  GemIcon,
  PotionIcon,
  SettingsIcon,
} from './CartoonIcons';

interface TopHudProps {
  controller: GameController;
  onOpenSettings: () => void;
}

function formatCompactGems(gems: number): string {
  if (!Number.isFinite(gems) || gems <= 0) return '0';
  if (gems >= 999_950_000_000) return `${(gems / 1e12).toFixed(1)}T`;
  if (gems >= 999_950_000) return `${(gems / 1e9).toFixed(1)}B`;
  if (gems >= 1e6) return `${(gems / 1e6).toFixed(1)}M`;
  if (gems >= 1e5) return `${Math.floor(gems / 1e3)}K`;
  return Math.floor(gems).toLocaleString();
}

export const TopHud: React.FC<TopHudProps> = ({ controller, onOpenSettings }) => {
  const save = controller.save;
  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const notation = save.settings.notation;
  const stats = controller.getActiveStats();
  const pct = Math.min(100, Math.max(0, controller.getCompletionPercent()));
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
  const advProg =
    view === 'adventure' ? save.events.adventures[save.events.activeAdventureId] : null;
  const advDef = view === 'adventure' ? ADVENTURES[save.events.activeAdventureId] : null;
  const majorDef = view === 'major_event' ? MAJOR_EVENTS[save.events.activeMajorEventId] : null;

  // React 19 StrictMode-safe Decimal cash & gem gain pop-scale pulse (view-switch safe)
  const cashStr = runtime.cash;
  const gemsVal = save.gems;
  const viewKey = `${view}:${runtime.templateId}`;

  const prevCashRef = useRef<{ viewKey: string; cash: string } | null>(null);
  const prevGemsRef = useRef<number | null>(null);
  const [cashPopSeq, setCashPopSeq] = useState(0);
  const [gemPopSeq, setGemPopSeq] = useState(0);

  useEffect(() => {
    const prev = prevCashRef.current;
    prevCashRef.current = { viewKey, cash: cashStr };
    if (!prev || prev.viewKey !== viewKey) return;
    if (d(cashStr).gt(d(prev.cash))) {
      setCashPopSeq((n) => (n + 1) % 100000);
    }
  }, [cashStr, viewKey]);

  useEffect(() => {
    const prev = prevGemsRef.current;
    prevGemsRef.current = gemsVal;
    if (prev === null) return;
    if (gemsVal > prev) {
      setGemPopSeq((n) => (n + 1) % 100000);
    }
  }, [gemsVal]);

  const cashPopClass = cashPopSeq === 0 ? '' : cashPopSeq % 2 === 1 ? 'pop-a' : 'pop-b';
  const gemPopClass = gemPopSeq === 0 ? '' : gemPopSeq % 2 === 1 ? 'pop-a' : 'pop-b';

  const handleBoostClick = () => {
    const ok = controller.activateBoostCharge();
    if (!ok) {
      controller.playUiSound(boostActive ? 'tap' : 'error');
    }
  };

  return (
    <div className="top-hud" onClick={(e) => e.stopPropagation()}>
      {/* Row 1: Cash, Gems, Boost, Settings */}
      <div className="hud-row">
        <div className={`currency-pill cash ${cashPopClass}`} title="Restaurant Cash">
          <CashIcon size={16} />
          <span className="currency-val hud-outline-text truncate min-w-0">
            {formatMoney(runtime.cash, notation, '$')}
          </span>
        </div>

        <div className={`currency-pill gems ${gemPopClass}`} title={save.gems.toLocaleString()}>
          <GemIcon size={16} />
          <span className="currency-val hud-outline-text truncate min-w-0">
            {formatCompactGems(save.gems)}
          </span>
        </div>

        <button
          type="button"
          className={`boost-pill ${boostActive ? 'active' : ''}`}
          onClick={handleBoostClick}
          disabled={save.boost.chargesRemaining <= 0 && !boostActive}
          title="Gameplay-earned Profit Boost"
        >
          <FlameIcon size={14} className={boostActive ? 'flame-flicker' : undefined} />
          {boostActive ? (
            <span className="hud-outline-text tabular-nums">
              ×{stats.activeBoostMultiplier.toFixed(1)} {formatTimer(boostLeftSec)}
            </span>
          ) : (
            <span className="hud-outline-text tabular-nums">
              Boost ({save.boost.chargesRemaining})
            </span>
          )}
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      {/* Row 2: City & Restaurant Completion Banner */}
      <div className="hud-row">
        <div className="city-banner">
          <div className="city-banner-top">
            <span className="city-banner-title truncate">
              {view === 'main'
                ? `City ${save.cityNumber}${loop > 0 ? ` (Cycle ${loop + 1})` : ''} · ${city.name}`
                : template.name}
            </span>
            <span className="city-banner-pct tabular-nums">{pct.toFixed(0)}%</span>
          </div>
          <div className="city-banner-sub">
            {view === 'main'
              ? `${template.name} (${save.restaurantStageIndex + 1}/${city.restaurantIds.length}) · All Profit +${stats.allProfitPercent.toLocaleString()}%`
              : `${template.subtitle} · ${runtime.ignoreGear ? 'Gear Disabled' : `All Profit +${stats.allProfitPercent.toLocaleString()}%`}`}
          </div>
          <div className="progress-track candy-striped">
            <div className="progress-fill candy-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Optional Event / Adventure / Potion Shop Return Banner */}
      {view !== 'main' && (
        <div className="mode-return-banner">
          <div className="mode-return-label">
            {view === 'adventure' && advDef && advProg ? (
              <>
                <span className="truncate min-w-0">
                  {advDef.icon} {advDef.name} Lv {advProg.activeLevel}
                </span>
                <span className="mode-return-timer tabular-nums">
                  <ClockIcon size={14} /> {formatTimer(Math.ceil(advProg.activeTimeRemainingSec))}
                </span>
              </>
            ) : view === 'major_event' && majorDef ? (
              <span className="truncate min-w-0">
                {majorDef.icon} {majorDef.name} (
                {save.events.majorEvents[majorDef.id].activeDifficulty.toUpperCase()})
              </span>
            ) : (
              <>
                <PotionIcon size={16} />
                <span className="truncate min-w-0">
                  Alchemist Apothecary Event (Main City Saved)
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            className="pill-btn ghost sm mode-return-btn"
            onClick={() => {
              controller.playUiSound('tab');
              controller.switchToMainRestaurant();
            }}
          >
            <BackArrowIcon size={14} /> Main City
          </button>
        </div>
      )}
    </div>
  );
};
