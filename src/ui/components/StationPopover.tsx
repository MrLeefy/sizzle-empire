import React from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import type { BuyMode } from '@/types/game';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import {
  getNextMilestone,
  getPreviousMilestone,
  getStationBaseDishProfit,
  getStationMaxLevel,
  resolveStationPurchasePlan,
} from '@/engine/economy/economy';
import { useHoldAction } from '@/ui/hooks/useHoldAction';

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
  if (!stn || !stnTpl) return null;

  const maxLv = getStationMaxLevel(template, runtime);
  const notation = controller.save.settings.notation;
  const buyMode = controller.save.settings.buyMode;
  const bulkStep = controller.save.settings.bulkStep;
  const cityNum = controller.getActiveCityNumber();
  const stats = controller.getActiveStats();

  const plan = resolveStationPurchasePlan(
    stnTpl,
    stn,
    maxLv,
    d(runtime.cash),
    buyMode,
    cityNum,
    runtime.difficultyMultiplier,
  );

  const isMaxed = stn.unlocked && stn.level >= maxLv;
  const baseProfit = getStationBaseDishProfit(
    stnTpl,
    stn,
    maxLv,
    cityNum,
    runtime.globalProfitMult,
  );
  const displayProfit = baseProfit.mul(stats.totalGlobalProfitMultiplier);
  const effPrep = Math.max(
    0.1,
    stnTpl.basePrepTime / (runtime.cookSpeedMult * stn.speedMultiplier * stats.playerCookSpeedMult),
  );

  const nextMs = getNextMilestone(stn.level, maxLv);
  const prevMs = getPreviousMilestone(stn.level, maxLv);
  const msPct =
    nextMs === null
      ? 100
      : Math.max(0, Math.min(100, ((stn.level - prevMs) / Math.max(1, nextMs - prevMs)) * 100));

  const holdProps = useHoldAction(
    () => controller.purchaseStation(stationIndex),
    isMaxed || !plan.canAfford,
  );

  const modes: Array<{ id: BuyMode; label: string }> = [
    { id: '1', label: '×1' },
    { id: '10', label: '×10' },
    { id: String(bulkStep) as BuyMode, label: `×${bulkStep}` },
    { id: 'max', label: 'MAX' },
  ];

  return (
    <div className="station-popover" onClick={(e) => e.stopPropagation()}>
      <div className="popover-header">
        <div className="popover-title">
          <span style={{ fontSize: 22 }}>{stnTpl.icon}</span>
          <div>
            <div>{stnTpl.name}</div>
            <div style={{ fontSize: 11, color: '#b8b2d0', fontWeight: 700 }}>
              {stn.unlocked
                ? `Level ${stn.level} / ${maxLv} · ${stn.machines} Machine${stn.machines > 1 ? 's' : ''}`
                : 'Locked Station — Unlock to expand menu!'}
            </div>
          </div>
        </div>
        <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {stn.unlocked && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span>
              Dish Value: <strong style={{ color: '#86efac' }}>{formatMoney(displayProfit, notation)}</strong> ·{' '}
              Prep: <strong>{effPrep.toFixed(2)}s</strong>
            </span>
            <span style={{ color: '#38bdf8', fontWeight: 800 }}>
              {nextMs ? `Lv ${nextMs}: ×2 + 1💎` : 'MAXED ★'}
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${msPct}%` }} />
          </div>
        </div>
      )}

      {stn.unlocked && !isMaxed && (
        <div className="buy-mode-strip">
          {modes.map((m) => (
            <button
              key={m.id}
              className={`buy-mode-btn ${buyMode === m.id ? 'active' : ''}`}
              onClick={() => controller.updateSettings({ buyMode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <button
        className="hold-upgrade-btn"
        disabled={isMaxed || !plan.canAfford}
        {...holdProps}
      >
        <span>
          {isMaxed
            ? 'STATION MAXED ★'
            : plan.isUnlock
              ? `UNLOCK ${stnTpl.name.toUpperCase()}`
              : `UPGRADE +${plan.levelsToBuy} (Hold)`}
        </span>
        {!isMaxed && <span>{formatMoney(plan.totalCost, notation)}</span>}
      </button>
    </div>
  );
};
