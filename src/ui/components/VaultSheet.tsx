import React from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import { VAULT_ARTIFACTS, getVaultUpgradeCost, getVaultValue } from '@/data/vault';
import { getNextVaultUnlockCost } from '@/engine/meta/vault';
import { formatMoney } from '@/engine/economy/bigNumber';

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
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🏛️ Permanent Vault · 💎 {save.gems.toLocaleString()}</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-body">
          <div style={{ fontSize: 12, color: '#b8b2d0', marginBottom: 4 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{art.icon}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      {art.name}{' '}
                      <span style={{ color: '#facc15', fontSize: 11 }}>
                        {unlocked ? `Lv ${lv}/${art.maxLevel}` : 'Locked'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#b8b2d0' }}>{art.description}</div>
                    <div style={{ fontSize: 11, color: '#86efac', fontWeight: 800 }}>
                      {unlocked
                        ? isMax
                          ? `MAX: ${fmtVal(art.unit, curVal)}`
                          : `${fmtVal(art.unit, curVal)} → ${fmtVal(art.unit, nextVal)}`
                        : `Unlocks at ${fmtVal(art.unit, getVaultValue(art, 1))}`}
                    </div>
                  </div>
                </div>
                <button
                  className={unlocked ? 'pill-btn blue' : 'pill-btn gold'}
                  disabled={isMax || save.gems < cost}
                  onClick={() =>
                    unlocked ? controller.upgradeVault(art.id) : controller.unlockVault(art.id)
                  }
                >
                  {isMax ? 'MAX' : unlocked ? `${cost} 💎` : cost === 0 ? 'FREE' : `Unlock ${cost}💎`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
