import React from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import { d, formatMoney } from '@/engine/economy/bigNumber';
import { getRestaurantUpgradeCost } from '@/engine/economy/economy';

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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">⚡ Restaurant Upgrades ({available.length} left)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {affordableCount > 1 && (
              <button className="pill-btn gold" onClick={buyAllAffordable}>
                Buy All ({affordableCount})
              </button>
            )}
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="sheet-body">
          {available.length === 0 ? (
            <div className="item-card-col" style={{ textAlign: 'center', color: '#b8b2d0' }}>
              <strong>All unlocked restaurant upgrades purchased!</strong>
              <span style={{ fontSize: 12 }}>
                Unlock additional food stations to reveal more upgrades.
              </span>
            </div>
          ) : (
            available.map((u) => {
              const cost = getRestaurantUpgradeCost(u, cityNum, runtime.difficultyMultiplier);
              const canBuy = cash.gte(cost);
              return (
                <div className="item-card" key={u.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{u.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#b8b2d0' }}>{u.description}</div>
                    </div>
                  </div>
                  <button
                    className="pill-btn"
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
