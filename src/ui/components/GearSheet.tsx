import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import type { EquippedSlotKey, LootBoxType, LootRewardItem } from '@/types/game';
import { GEAR_BY_ID } from '@/data/gear';
import { getGearAllProfitPercent } from '@/engine/economy/stats';
import {
  checkBlueprintForgeable,
  describeGearEffect,
  getEquippedSlotForInstance,
  getXpRequiredForNextGearLevel,
  isSlotUnlocked,
  sortInventory,
} from '@/engine/meta/equipment';
import { LOOT_BOX_DEFINITIONS } from '@/engine/meta/lootBoxes';
import { BALANCE } from '@/engine/economy/balanceConfig';

interface GearSheetProps {
  controller: GameController;
  onClose: () => void;
  onShowBoxRewards: (title: string, rewards: LootRewardItem[]) => void;
}

const SLOT_LABELS: Array<{ key: EquippedSlotKey; label: string; icon: string; unlockHint: string }> = [
  { key: 'head', label: 'Head', icon: '👑', unlockHint: '' },
  { key: 'body', label: 'Body', icon: '🥋', unlockHint: '' },
  { key: 'hand1', label: 'Hand 1', icon: '🔪', unlockHint: '' },
  { key: 'hand2', label: 'Hand 2', icon: '⚒️', unlockHint: `City ${BALANCE.HAND_2_UNLOCK_CITY}` },
  { key: 'ring', label: 'Ring', icon: '💍', unlockHint: 'Olympian Trial' },
  { key: 'necklace', label: 'Necklace', icon: '📿', unlockHint: 'Corsair Cove' },
];

export const GearSheet: React.FC<GearSheetProps> = ({
  controller,
  onClose,
  onShowBoxRewards,
}) => {
  const [tab, setTab] = useState<'loadout' | 'forge' | 'boxes' | 'stats'>('loadout');
  const [sortMode, setSortMode] = useState<'rarity' | 'profit' | 'slot'>('rarity');
  const [levelTargetId, setLevelTargetId] = useState<string | null>(null);
  const [oddsBox, setOddsBox] = useState<LootBoxType | null>(null);

  const save = controller.save;
  const stats = controller.getActiveStats();
  const wearable = sortInventory(
    save.inventory.filter((i) => !i.isBlueprint),
    sortMode,
  );
  const blueprints = sortInventory(
    save.inventory.filter((i) => i.isBlueprint),
    'rarity',
  );

  const equippedIds = new Set(Object.values(save.equipped).filter(Boolean));

  const salvageAllCommonsInto = (targetId: string, maxRarity: 'common' | 'rare') => {
    const fodder = save.inventory
      .filter((i) => {
        if (i.instanceId === targetId || equippedIds.has(i.instanceId) || i.isBlueprint) return false;
        const tpl = GEAR_BY_ID[i.templateId];
        if (!tpl) return false;
        return maxRarity === 'common' ? tpl.rarity === 'common' : tpl.rarity === 'common' || tpl.rarity === 'rare';
      })
      .map((i) => i.instanceId);
    if (fodder.length === 0) {
      controller.pushToast(`No spare ${maxRarity} items available to salvage.`, 'warning');
      return;
    }
    const res = controller.salvageGear(targetId, fodder);
    controller.pushToast(
      `Salvaged ${res.itemsConsumed} items (+${res.xpAdded} XP, +${res.levelsGained} Lv)!`,
      'reward',
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🛡️ Gear, Forge & Crates</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button className={`sheet-tab ${tab === 'loadout' ? 'active' : ''}`} onClick={() => setTab('loadout')}>
            Equipment ({wearable.length})
          </button>
          <button className={`sheet-tab ${tab === 'forge' ? 'active' : ''}`} onClick={() => setTab('forge')}>
            Forge ({blueprints.length})
          </button>
          <button className={`sheet-tab ${tab === 'boxes' ? 'active' : ''}`} onClick={() => setTab('boxes')}>
            Crates ({Object.values(save.boxes).reduce((a, b) => a + b, 0)})
          </button>
          <button className={`sheet-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
            Stat Breakdown
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'loadout' && (
            <>
              {/* 6 Equipment Slots */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {SLOT_LABELS.map((slot) => {
                  const unlocked = isSlotUnlocked(save, slot.key);
                  const instId = save.equipped[slot.key];
                  const inst = instId ? save.inventory.find((i) => i.instanceId === instId) : null;
                  const tpl = inst ? GEAR_BY_ID[inst.templateId] : null;
                  return (
                    <div
                      key={slot.key}
                      className={`item-card-col ${tpl ? `rarity-${tpl.rarity}` : ''}`}
                      style={{ padding: 8, textAlign: 'center', opacity: unlocked ? 1 : 0.55 }}
                    >
                      <div style={{ fontSize: 10, color: '#b8b2d0', fontWeight: 800 }}>
                        {slot.icon} {slot.label}
                      </div>
                      {tpl && inst ? (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 900 }}>{tpl.name}</div>
                          <div style={{ fontSize: 10, color: '#facc15' }}>
                            Lv {inst.level} · +{getGearAllProfitPercent(tpl.rarity, inst.level, tpl.slot === 'ring' || tpl.slot === 'necklace')}%
                          </div>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button
                              className="pill-btn blue"
                              style={{ padding: '4px 7px', fontSize: 10 }}
                              onClick={() => setLevelTargetId(inst.instanceId)}
                            >
                              Upgrade
                            </button>
                            <button
                              className="pill-btn ghost"
                              style={{ padding: '4px 6px', fontSize: 10 }}
                              onClick={() => controller.unequipGear(slot.key)}
                            >
                              Off
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: '#94a3b8', padding: '10px 0' }}>
                          {unlocked ? 'Empty' : `🔒 ${slot.unlockHint}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Level-Up Salvage Panel when an item is selected */}
              {levelTargetId && (() => {
                const target = save.inventory.find((i) => i.instanceId === levelTargetId);
                const tpl = target ? GEAR_BY_ID[target.templateId] : null;
                if (!target || !tpl) return null;
                const needXp = getXpRequiredForNextGearLevel(target.level, tpl.rarity);
                return (
                  <div className={`item-card-col rarity-${tpl.rarity}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>
                        Upgrade {tpl.name} (Lv {target.level}/50)
                      </strong>
                      <button className="pill-btn ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setLevelTargetId(null)}>
                        Done
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                      XP: {target.xp} / {Number.isFinite(needXp) ? needXp : 'MAX'} · Salvage unequipped spare items to raise All Profit!
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="pill-btn" onClick={() => salvageAllCommonsInto(target.instanceId, 'common')}>
                        Salvage All Spare Commons
                      </button>
                      <button className="pill-btn gold" onClick={() => salvageAllCommonsInto(target.instanceId, 'rare')}>
                        Salvage Commons + Rares
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Sort bar */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                <span style={{ color: '#b8b2d0' }}>Sort:</span>
                {(['rarity', 'profit', 'slot'] as const).map((m) => (
                  <button
                    key={m}
                    className={`buy-mode-btn ${sortMode === m ? 'active' : ''}`}
                    style={{ flex: 0, padding: '4px 10px' }}
                    onClick={() => setSortMode(m)}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Inventory list */}
              {wearable.map((inst) => {
                const tpl = GEAR_BY_ID[inst.templateId];
                if (!tpl) return null;
                const eqSlot = getEquippedSlotForInstance(save, inst.instanceId);
                const profit = getGearAllProfitPercent(
                  tpl.rarity,
                  inst.level,
                  tpl.slot === 'ring' || tpl.slot === 'necklace',
                );
                return (
                  <div className={`item-card rarity-${tpl.rarity}`} key={inst.instanceId}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={`rarity-tag ${tpl.rarity}`}>{tpl.rarity}</span>
                        <strong style={{ fontSize: 13 }}>{tpl.name}</strong>
                        <span style={{ fontSize: 11, color: '#facc15' }}>Lv {inst.level}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#86efac', marginTop: 2 }}>
                        +{profit}% All Profit · {tpl.slot.toUpperCase()}
                      </div>
                      {tpl.effects.map((e, idx) => (
                        <div key={idx} style={{ fontSize: 11, color: '#cbd5e1' }}>
                          • {describeGearEffect(e.type, e.value)}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {eqSlot ? (
                        <button className="pill-btn ghost" onClick={() => controller.unequipGear(eqSlot)}>
                          Equipped
                        </button>
                      ) : (
                        <button className="pill-btn" onClick={() => controller.equipGear(inst.instanceId)}>
                          Equip
                        </button>
                      )}
                      <button
                        className="pill-btn blue"
                        style={{ padding: '5px 8px', fontSize: 11 }}
                        onClick={() => setLevelTargetId(inst.instanceId)}
                      >
                        Level Up
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'forge' && (
            <>
              {blueprints.length === 0 ? (
                <div className="item-card-col" style={{ textAlign: 'center', color: '#b8b2d0' }}>
                  <strong>No Blueprints yet!</strong>
                  <span style={{ fontSize: 12 }}>
                    Open Grand, Event, Club, or Adventure Crates to find Legendary, Ultimate, and Mythic blueprints.
                  </span>
                </div>
              ) : (
                blueprints.map((bp) => {
                  const tpl = GEAR_BY_ID[bp.templateId];
                  if (!tpl) return null;
                  const check = checkBlueprintForgeable(save, bp.instanceId);
                  return (
                    <div className={`item-card-col rarity-${tpl.rarity}`} key={bp.instanceId}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className={`rarity-tag ${tpl.rarity}`}>{tpl.rarity} Blueprint</span>{' '}
                          <strong>{tpl.name}</strong>
                        </div>
                        <button
                          className="pill-btn gold"
                          disabled={!check.canForge}
                          onClick={() => controller.forgeGearBlueprint(bp.instanceId)}
                        >
                          Forge!
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                        {tpl.effects.map((e) => describeGearEffect(e.type, e.value)).join(' · ')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {check.requirements.map((r) => (
                          <span
                            key={r.templateId}
                            style={{
                              fontSize: 11,
                              padding: '3px 7px',
                              borderRadius: 8,
                              background: r.owned >= r.needed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                              border: `1px solid ${r.owned >= r.needed ? '#22c55e' : '#ef4444'}`,
                            }}
                          >
                            {r.name}: {r.owned}/{r.needed}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'boxes' && (
            <>
              {(Object.keys(LOOT_BOX_DEFINITIONS) as LootBoxType[]).map((type) => {
                const def = LOOT_BOX_DEFINITIONS[type];
                const owned = save.boxes[type] ?? 0;
                const openRewards = (qty: number) => {
                  const res = controller.openLootBoxes(type, qty);
                  if (res.length > 0) onShowBoxRewards(`${def.icon} ${def.name} (×${Math.min(owned, qty)})`, res);
                };
                return (
                  <div className="item-card-col" key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {def.icon} {def.name}
                        </strong>{' '}
                        <span style={{ color: '#facc15', fontWeight: 900 }}>×{owned}</span>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>{def.description}</div>
                      </div>
                      <button
                        className="pill-btn ghost"
                        style={{ padding: '4px 8px', fontSize: 10 }}
                        onClick={() => setOddsBox(oddsBox === type ? null : type)}
                      >
                        Odds
                      </button>
                    </div>

                    {oddsBox === type && (
                      <div style={{ fontSize: 11, background: 'rgba(19,14,29,0.7)', padding: 8, borderRadius: 10 }}>
                        {def.table.map((row) => (
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{row.label}</span>
                            <strong style={{ color: '#38bdf8' }}>{row.chance}%</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {owned > 0 && (
                        <>
                          <button className="pill-btn" onClick={() => openRewards(1)}>
                            Open ×1
                          </button>
                          {owned >= 2 && (
                            <button className="pill-btn gold" onClick={() => openRewards(Math.min(10, owned))}>
                              Open ×{Math.min(10, owned)}
                            </button>
                          )}
                        </>
                      )}
                      {def.gemCost !== null && (
                        <button
                          className="pill-btn blue"
                          disabled={save.gems < def.gemCost}
                          onClick={() => controller.buyLootBox(type, 1)}
                        >
                          Buy ({def.gemCost} 💎)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'stats' && (
            <div className="stat-grid">
              <div className="stat-box">All Profit Bonus<strong>+{stats.allProfitPercent.toLocaleString()}%</strong></div>
              <div className="stat-box">Global Profit Mult<strong>×{stats.totalGlobalProfitMultiplier.toFixed(2)}</strong></div>
              <div className="stat-box">Chef Walk Speed<strong>×{stats.playerWalkSpeedMult.toFixed(2)}</strong></div>
              <div className="stat-box">All Workers Walk<strong>×{stats.workerWalkSpeedMult.toFixed(2)}</strong></div>
              <div className="stat-box">Chef Instant Cook<strong>{Math.round(stats.playerInstantCookChance * 100)}%</strong></div>
              <div className="stat-box">All Instant Cook<strong>{Math.round(stats.workerInstantCookChance * 100)}%</strong></div>
              <div className="stat-box">Chef Perfect (×6)<strong>{Math.round(stats.playerPerfectChance * 100)}%</strong></div>
              <div className="stat-box">Chef Divine (×26)<strong>{Math.round(stats.playerDivineChance * 100)}%</strong></div>
              <div className="stat-box">Chef Double (×2)<strong>{Math.round(stats.playerDoubleChance * 100)}%</strong></div>
              <div className="stat-box">Instant Orders<strong>{Math.round(stats.instantOrderChance * 100)}%</strong></div>
              <div className="stat-box">Golden Guest (×16)<strong>{Math.round(stats.goldenCustomerChance * 100)}%</strong></div>
              <div className="stat-box">Greedy Guest<strong>{Math.round(stats.greedyCustomerChance * 100)}%</strong></div>
              <div className="stat-box">Repeat Order<strong>{Math.round(stats.reorderChance * 100)}%</strong></div>
              <div className="stat-box">Tip Chance / Value<strong>{Math.round(stats.tipChance * 100)}% · ×{stats.tipValueMult.toFixed(1)}</strong></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
