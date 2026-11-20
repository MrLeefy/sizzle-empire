import React, { useEffect, useRef, useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { BuyMode } from '@/types/game';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import {
  countPassedMilestones,
  getNextMilestone,
  getPreviousMilestone,
  getStationCookSeconds,
  getStationBaseDishProfit,
  getStationMaxLevel,
  resolveStationPurchasePlan,
} from '@/engine/economy/economy';
import { useHoldAction } from '@/ui/hooks/useHoldAction';
import {
  CloseIcon,
  CrownIcon,
  FlameIcon,
  GemIcon,
  LockIcon,
  MegaphoneIcon,
  SparkleIcon,
  StationStyleIcon,
} from './CartoonIcons';

interface StationPopoverProps {
  controller: GameController;
  stationIndex: number;
  onClose: () => void;
}

export const StationPopover: React.FC<StationPopoverProps> = ({
  controller,
  stationIndex,
  onClose,
}) => {
  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const stn = runtime.stations[stationIndex];
  const stnTpl = template.stations[stationIndex];

  const [pulseSeq, setPulseSeq] = useState(0);
  const [errorSeq, setErrorSeq] = useState(0);
  const [msFlashSeq, setMsFlashSeq] = useState(0);

  const maxLv = getStationMaxLevel(template, runtime);
  const passedMs = stn ? countPassedMilestones(stn.level, maxLv) : 0;
  const prevMsRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevMsRef.current;
    prevMsRef.current = passedMs;
    if (prev !== null && passedMs > prev) {
      setMsFlashSeq((n) => (n + 1) % 100000);
    }
  }, [passedMs]);

  const notation = controller.save.settings.notation;
  const buyMode = controller.save.settings.buyMode;
  const bulkStep = controller.save.settings.bulkStep;
  const effectiveBuyMode: BuyMode =
    buyMode === '50' || buyMode === '100' ? (String(bulkStep) as BuyMode) : buyMode;
  const cityNum = controller.getActiveCityNumber();
  const stats = controller.getActiveStats();

  const isMaxed = Boolean(stn && stn.unlocked && stn.level >= maxLv);
  const plan =
    stn && stnTpl
      ? resolveStationPurchasePlan(
          stnTpl,
          stn,
          maxLv,
          d(runtime.cash),
          effectiveBuyMode,
          cityNum,
          runtime.difficultyMultiplier,
        )
      : { isUnlock: false, levelsToBuy: 0, totalCost: d(0), canAfford: false };

  const holdProps = useHoldAction(
    () => controller.purchaseStation(stationIndex, effectiveBuyMode),
    !stn || !stnTpl || isMaxed || !plan.canAfford,
    {
      onTickSuccess: () => {
        setPulseSeq((n) => (n + 1) % 100000);
      },
    },
  );

  if (!stn || !stnTpl) return null;

  const baseProfit = getStationBaseDishProfit(
    stnTpl,
    stn,
    maxLv,
    cityNum,
    runtime.globalProfitMult,
  );
  const displayProfit = baseProfit.mul(stats.totalGlobalProfitMultiplier);
  const effPrep = getStationCookSeconds(
    stnTpl,
    stn,
    maxLv,
    runtime.cookSpeedMult * stats.playerCookSpeedMult,
  );

  const nextMs = getNextMilestone(stn.level, maxLv);
  const prevMs = getPreviousMilestone(stn.level, maxLv);
  const msPct =
    nextMs === null
      ? 100
      : Math.max(0, Math.min(100, ((stn.level - prevMs) / Math.max(1, nextMs - prevMs)) * 100));

  const comboCount = controller.getUpgradeComboCount(stationIndex);
  const isPopular =
    runtime.popularDishStationIndex === stationIndex &&
    runtime.simTime < runtime.popularDishEndsAt;

  const pulseClass = pulseSeq === 0 ? '' : pulseSeq % 2 === 1 ? 'squash-pop-a' : 'squash-pop-b';
  const shakeClass = errorSeq === 0 ? '' : errorSeq % 2 === 1 ? 'shake-a' : 'shake-b';
  const msFlashClass = msFlashSeq === 0 ? '' : msFlashSeq % 2 === 1 ? 'ms-flash-a' : 'ms-flash-b';

  const modes: Array<{ id: BuyMode; label: string }> = [
    { id: '1', label: '×1' },
    { id: '10', label: '×10' },
    { id: String(bulkStep) as BuyMode, label: `×${bulkStep}` },
    { id: 'max', label: 'MAX' },
  ];

  const handleDisabledTap = (e: React.PointerEvent) => {
    if (isMaxed || plan.canAfford) return;
    e.stopPropagation();
    controller.playUiSound('error');
    setErrorSeq((n) => (n + 1) % 100000);
  };

  return (
    <div
      className={`station-popover ${msFlashClass}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="popover-header">
        <div className="popover-title min-w-0">
          <div className="station-medallion">
            <StationStyleIcon styleKind={stnTpl.modelStyle} size={30} />
          </div>
          <div className="min-w-0">
            <div className="popover-name-row">
              <span className="popover-name truncate">{stnTpl.name}</span>
              {isPopular && (
                <span className="popular-pill">
                  <MegaphoneIcon size={12} /> POPULAR
                </span>
              )}
            </div>
            <div className="popover-subtitle tabular-nums">
              {stn.unlocked
                ? `Level ${stn.level} / ${maxLv} · ${stn.machines} Machine${stn.machines > 1 ? 's' : ''}`
                : 'Locked Station — Unlock to expand menu!'}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn close-btn"
          onClick={onClose}
          aria-label="Close station popover"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {stn.unlocked && (
        <div className="popover-milestone-section">
          <div className="popover-stats-row">
            <span>
              Dish:{' '}
              <strong className="text-profit tabular-nums">
                {formatMoney(displayProfit, notation)}
              </strong>{' '}
              · Cook: <strong className="tabular-nums">{effPrep < 10 ? effPrep.toFixed(1) : Math.round(effPrep)}s</strong>
            </span>
            <span className="popover-milestone-pill tabular-nums">
              {nextMs !== null ? (
                <>
                  <SparkleIcon size={12} /> Lv {nextMs}: Profit ×2 +1 <GemIcon size={12} />
                </>
              ) : (
                <>
                  <CrownIcon size={13} /> MAXED
                </>
              )}
            </span>
          </div>
          <div className="milestone-bar-wrap">
            <div className="progress-track candy-striped">
              <div className="progress-fill candy-fill" style={{ width: `${msPct}%` }} />
            </div>
            {nextMs !== null && (
              <div className="milestone-gem-marker" title={`Next milestone at Lv ${nextMs}`}>
                <GemIcon size={15} />
              </div>
            )}
          </div>
        </div>
      )}

      {stn.unlocked && !isMaxed && (
        <div className="buy-mode-strip">
          {modes.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`buy-mode-btn ${effectiveBuyMode === m.id ? 'active' : ''}`}
              onClick={() => {
                if (effectiveBuyMode !== m.id || buyMode !== m.id) {
                  if (effectiveBuyMode !== m.id) {
                    controller.playUiSound('tab');
                  }
                  controller.updateSettings({ buyMode: m.id });
                }
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className={`hold-upgrade-wrap ${shakeClass}`} onPointerDown={handleDisabledTap}>
        {comboCount >= 2 && !isMaxed && (
          <div className={`combo-badge ${pulseClass}`}>
            <FlameIcon size={13} />
            <span className="tabular-nums">COMBO ×{comboCount}</span>
          </div>
        )}

        <button
          type="button"
          className={`hold-upgrade-btn ${plan.isUnlock ? 'unlock' : ''} ${isMaxed ? 'maxed' : ''} ${pulseClass}`}
          disabled={isMaxed || !plan.canAfford}
          {...holdProps}
        >
          <span className="hold-upgrade-label">
            {isMaxed ? (
              <>
                <CrownIcon size={17} />
                <span>STATION MAXED</span>
              </>
            ) : plan.isUnlock ? (
              <>
                <LockIcon size={16} />
                <span>UNLOCK {stnTpl.name.toUpperCase()}</span>
              </>
            ) : (
              <span>UPGRADE +{plan.levelsToBuy} (Hold)</span>
            )}
          </span>
          {!isMaxed && (
            <span className="upgrade-cost-chip tabular-nums">
              {formatMoney(plan.totalCost, notation)}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
