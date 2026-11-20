import React from 'react';
import type { GameController } from '@/engine/GameController';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import { getRestaurantUpgradeCost } from '@/engine/economy/economy';
import { BoltIcon, CloseIcon, SparkleIcon } from './CartoonIcons';

interface UpgradesSheetProps {
  controller: GameController;
  onClose: () => void;
}

export const UpgradesSheet: React.FC<UpgradesSheetProps> = ({ controller, onClose }) => {
  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const cityNum = controller.getActiveCityNumber();
  const notation = controller.save.settings.notation;
  const cash = d(runtime.cash);

  const available = template.upgrades.filter((u) => {
    if (runtime.purchasedUpgradeIds.includes(u.id)) return false;
    if (u.stationIndex !== undefined && !runtime.stations[u.stationIndex]?.unlocked) return false;
    return true;
  });

  const affordableCount = available.filter((u) =>
    cash.gte(getRestaurantUpgradeCost(u, cityNum, runtime.difficultyMultiplier)),
  ).length;

  const buyAllAffordable = () => {
    for (const u of available) {
      const ok = controller.purchaseRestaurantUpgrade(u.id);
      if (!ok) break;
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
            <BoltIcon size={22} />
            <span>Restaurant Upgrades ({available.length} left)</span>
          </div>
          <div className="row-center-tight">
            {affordableCount > 1 && (
              <button type="button" className="pill-btn gold sm" onClick={buyAllAffordable}>
                Buy All ({affordableCount})
              </button>
            )}
            <button
              type="button"
              className="icon-btn close-btn"
              onClick={onClose}
              aria-label="Close upgrades"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className="sheet-body">
          {available.length === 0 ? (
            <div className="item-card-col empty-card text-muted">
              <SparkleIcon size={28} />
              <strong className="text-ink">All unlocked restaurant upgrades purchased!</strong>
              <span className="text-md">
                Unlock additional food stations to reveal more upgrades.
              </span>
            </div>
          ) : (
            available.map((u) => {
              const cost = getRestaurantUpgradeCost(u, cityNum, runtime.difficultyMultiplier);
              const canBuy = cash.gte(cost);
              return (
                <div
                  className={`item-card ${canBuy ? 'upgrade-affordable' : 'upgrade-locked'}`}
                  key={u.id}
                >
                  <div className="row-center min-w-0">
                    <div className={`card-icon-medallion ${canBuy ? 'medallion-ready' : ''}`}>
                      {u.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="card-title text-ink">{u.name}</div>
                      <div className="card-sub text-muted">{u.description}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pill-btn tabular-nums"
                    disabled={!canBuy}
                    onClick={() => controller.purchaseRestaurantUpgrade(u.id)}
                  >
                    {formatMoney(cost, notation)}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
