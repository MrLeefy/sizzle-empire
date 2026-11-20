import React from 'react';
import type { GameController } from '@/engine/GameController';
import { VAULT_ARTIFACTS, getVaultUpgradeCost, getVaultValue } from '@/data/vault';
import { getNextVaultUnlockCost } from '@/engine/meta/vault';
import { formatMoney } from '@/engine/economy/bigNumber';
import { CloseIcon, GemIcon, VaultIcon } from './CartoonIcons';

interface VaultSheetProps {
  controller: GameController;
  onClose: () => void;
}

export const VaultSheet: React.FC<VaultSheetProps> = ({ controller, onClose }) => {
  const save = controller.save;
  const unlockCost = getNextVaultUnlockCost(save);

  const fmtVal = (unit: string, v: number) => {
    if (unit === 'percent') return `${Math.round(v * 100)}%`;
    if (unit === 'cash') return formatMoney(v, save.settings.notation);
    return `×${v.toFixed(2)}`;
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
            <VaultIcon size={22} />
            <span>Permanent Vault</span>
            <span className="header-resource-pill tabular-nums">
              <GemIcon size={15} /> {save.gems.toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close vault"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="sheet-intro text-muted">
            Vault artifacts persist permanently across every restaurant renovation and city flight.
          </div>

          {VAULT_ARTIFACTS.map((art) => {
            const unlocked = save.vault.unlockedIds.includes(art.id);
            const lv = unlocked ? (save.vault.levels[art.id] ?? 1) : 0;
            const isMax = lv >= art.maxLevel;
            const curVal = getVaultValue(art, lv);
            const nextVal = getVaultValue(art, Math.min(art.maxLevel, lv + 1));
            const cost = unlocked ? getVaultUpgradeCost(art, lv) : unlockCost;

            return (
              <div className="item-card" key={art.id}>
                <div className="row-center min-w-0">
                  <div className="card-icon-medallion">{art.icon}</div>
                  <div className="min-w-0">
                    <div className="row-center-tight row-wrap">
                      <span className="card-title text-ink">{art.name}</span>
                      <span className="text-sm text-gold tabular-nums">
                        {unlocked ? `Lv ${lv}/${art.maxLevel}` : 'Locked'}
                      </span>
                    </div>
                    <div className="card-sub text-muted">{art.description}</div>
                    <div className="card-stat text-profit tabular-nums">
                      {unlocked
                        ? isMax
                          ? `MAX: ${fmtVal(art.unit, curVal)}`
                          : `${fmtVal(art.unit, curVal)} → ${fmtVal(art.unit, nextVal)}`
                        : `Unlocks at ${fmtVal(art.unit, getVaultValue(art, 1))}`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={unlocked ? 'pill-btn blue sm' : 'pill-btn gold sm'}
                  disabled={isMax || save.gems < cost}
                  onClick={() =>
                    unlocked ? controller.upgradeVault(art.id) : controller.unlockVault(art.id)
                  }
                >
                  {isMax ? (
                    'MAX'
                  ) : unlocked ? (
                    <>
                      <span>{cost}</span>
                      <GemIcon size={13} />
                    </>
                  ) : cost === 0 ? (
                    'FREE'
                  ) : (
                    <>
                      <span>Unlock {cost}</span>
                      <GemIcon size={13} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
