import React, { useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { EquippedSlotKey, GearEffectType, LootBoxType, LootRewardItem } from '@/types/game';
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
import {
  BlueprintIcon,
  CloseIcon,
  CrateIcon,
  GearSlotIcon,
  GemIcon,
  LockIcon,
  ShieldIcon,
} from './CartoonIcons';

interface GearSheetProps {
  controller: GameController;
  onClose: () => void;
  onShowBoxRewards: (title: string, rewards: LootRewardItem[]) => void;
}

const SLOT_LABELS: Array<{ key: EquippedSlotKey; label: string; unlockHint: string }> = [
  { key: 'head', label: 'Head', unlockHint: '' },
  { key: 'body', label: 'Body', unlockHint: '' },
  { key: 'hand1', label: 'Hand 1', unlockHint: '' },
  { key: 'hand2', label: 'Hand 2', unlockHint: `City ${BALANCE.HAND_2_UNLOCK_CITY}` },
  { key: 'ring', label: 'Ring', unlockHint: 'Olympian Trial' },
  { key: 'necklace', label: 'Necklace', unlockHint: 'Corsair Cove' },
];

function getEffectChipClass(type: GearEffectType): string {
  switch (type) {
    case 'walk_speed':
    case 'all_walk_speed':
    case 'instant_order':
      return 'chip-walk';
    case 'cook_speed':
    case 'all_cook_speed':
    case 'instant_cook':
    case 'all_instant_cook':
      return 'chip-instant';
    case 'perfect_chance':
    case 'all_perfect_chance':
    case 'perfect_value':
    case 'golden_customer':
      return 'chip-perfect';
    case 'divine_chance':
    case 'all_divine_chance':
    case 'divine_value':
      return 'chip-divine';
    case 'double_chance':
    case 'all_double_chance':
    case 'greedy_customer':
    case 'reorder_chance':
      return 'chip-double';
    case 'profit_per_worker':
    default:
      return 'chip-profit';
  }
}

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

  const switchTab = (next: 'loadout' | 'forge' | 'boxes' | 'stats') => {
    if (tab !== next) {
      controller.playUiSound('tab');
      setTab(next);
    }
  };

  const salvageAllCommonsInto = (targetId: string, maxRarity: 'common' | 'rare') => {
    const fodder = save.inventory
      .filter((i) => {
        if (i.instanceId === targetId || equippedIds.has(i.instanceId) || i.isBlueprint)
          return false;
        const tpl = GEAR_BY_ID[i.templateId];
        if (!tpl) return false;
        return maxRarity === 'common'
          ? tpl.rarity === 'common'
          : tpl.rarity === 'common' || tpl.rarity === 'rare';
      })
      .map((i) => i.instanceId);
    if (fodder.length === 0) {
      controller.playUiSound('error');
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
            <ShieldIcon size={22} />
            <span>Gear, Forge &amp; Crates</span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close gear"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button
            type="button"
            className={`sheet-tab ${tab === 'loadout' ? 'active' : ''}`}
            onClick={() => switchTab('loadout')}
          >
            Equipment ({wearable.length})
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'forge' ? 'active' : ''}`}
            onClick={() => switchTab('forge')}
          >
            Forge ({blueprints.length})
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'boxes' ? 'active' : ''}`}
            onClick={() => switchTab('boxes')}
          >
            Crates ({Object.values(save.boxes).reduce((a, b) => a + b, 0)})
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'stats' ? 'active' : ''}`}
            onClick={() => switchTab('stats')}
          >
            Stat Breakdown
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'loadout' && (
            <>
              {/* 6-Slot At-a-Glance Rarity-Framed Equipment Loadout */}
              <div className="grid-3">
                {SLOT_LABELS.map((slot) => {
                  const unlocked = isSlotUnlocked(save, slot.key);
                  const instId = save.equipped[slot.key];
                  const inst = instId ? save.inventory.find((i) => i.instanceId === instId) : null;
                  const tpl = inst ? GEAR_BY_ID[inst.templateId] : null;
                  const profitPct =
                    tpl && inst
                      ? getGearAllProfitPercent(
                          tpl.rarity,
                          inst.level,
                          tpl.slot === 'ring' || tpl.slot === 'necklace',
                        )
                      : 0;

                  return (
                    <div
                      key={slot.key}
                      className={`item-card-col slot-card ${tpl ? `rarity-${tpl.rarity}` : ''} ${unlocked ? '' : 'slot-locked'}`}
                    >
                      <div className="slot-label text-muted">{slot.label}</div>

                      {tpl && inst ? (
                        <>
                          <div className={`rarity-tile tile-md rarity-${tpl.rarity}`}>
                            <GearSlotIcon slot={slot.key} size={30} />
                            <span className="tile-lv-pill tabular-nums">Lv.{inst.level}</span>
                          </div>
                          <div className="slot-item-name text-ink truncate w-full">{tpl.name}</div>
                          <span className="stat-chip chip-profit tabular-nums">+{profitPct}%</span>
                          <div className="row-center-tight justify-center">
                            <button
                              type="button"
                              className="pill-btn blue xs"
                              onClick={() => {
                                controller.playUiSound('sheet_open');
                                setLevelTargetId(inst.instanceId);
                              }}
                            >
                              Up
                            </button>
                            <button
                              type="button"
                              className="pill-btn ghost xs"
                              onClick={() => controller.unequipGear(slot.key)}
                            >
                              Off
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rarity-tile tile-md rarity-empty">
                            {unlocked ? (
                              <GearSlotIcon slot={slot.key} size={26} />
                            ) : (
                              <LockIcon size={24} />
                            )}
                          </div>
                          <div className="slot-empty text-muted">
                            {unlocked ? 'Empty' : slot.unlockHint}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Level-Up Salvage Panel when an item is selected */}
              {levelTargetId &&
                (() => {
                  const target = save.inventory.find((i) => i.instanceId === levelTargetId);
                  const tpl = target ? GEAR_BY_ID[target.templateId] : null;
                  if (!target || !tpl) return null;
                  const needXp = getXpRequiredForNextGearLevel(target.level, tpl.rarity);
                  return (
                    <div className={`item-card-col rarity-${tpl.rarity}`}>
                      <div className="row-between">
                        <div className="row-center-tight">
                          <div className={`rarity-tile tile-sm rarity-${tpl.rarity}`}>
                            <GearSlotIcon slot={tpl.slot} size={22} />
                            <span className="tile-lv-pill tabular-nums">Lv.{target.level}</span>
                          </div>
                          <strong className="text-ink">
                            Upgrade {tpl.name} (Lv {target.level}/50)
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="pill-btn ghost sm"
                          onClick={() => {
                            controller.playUiSound('sheet_close');
                            setLevelTargetId(null);
                          }}
                        >
                          Done
                        </button>
                      </div>
                      <div className="card-sub text-muted tabular-nums">
                        XP: {target.xp} / {Number.isFinite(needXp) ? needXp : 'MAX'} · Salvage
                        unequipped spare items to raise All Profit!
                      </div>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="pill-btn sm"
                          onClick={() => salvageAllCommonsInto(target.instanceId, 'common')}
                        >
                          Salvage All Spare Commons
                        </button>
                        <button
                          type="button"
                          className="pill-btn gold sm"
                          onClick={() => salvageAllCommonsInto(target.instanceId, 'rare')}
                        >
                          Salvage Commons + Rares
                        </button>
                      </div>
                    </div>
                  );
                })()}

              {/* Sort bar */}
              <div className="sort-bar">
                <span className="text-muted font-bold">Sort:</span>
                {(['rarity', 'profit', 'slot'] as const).map((m) => (
                  <button
                    type="button"
                    key={m}
                    className={`buy-mode-btn sort-chip ${sortMode === m ? 'active' : ''}`}
                    onClick={() => {
                      if (sortMode !== m) {
                        controller.playUiSound('tap');
                        setSortMode(m);
                      }
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Inventory list with Rarity Tiles & Color-Coded Stat Chips */}
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
                    <div className="row-center min-w-0">
                      <div className={`rarity-tile tile-md rarity-${tpl.rarity}`}>
                        <GearSlotIcon slot={tpl.slot} size={30} />
                        <span className="tile-lv-pill tabular-nums">Lv.{inst.level}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="row-center-tight row-wrap">
                          <span className={`rarity-tag ${tpl.rarity}`}>{tpl.rarity}</span>
                          <strong className="card-title text-ink truncate">{tpl.name}</strong>
                        </div>
                        <div className="stat-chip-row">
                          <span className="stat-chip chip-profit tabular-nums">
                            +{profit}% Profit
                          </span>
                          {tpl.effects.map((e, idx) => (
                            <span
                              key={idx}
                              className={`stat-chip ${getEffectChipClass(e.type)}`}
                            >
                              {describeGearEffect(e.type, e.value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="btn-col">
                      {eqSlot ? (
                        <button
                          type="button"
                          className="pill-btn ghost sm"
                          onClick={() => controller.unequipGear(eqSlot)}
                        >
                          Equipped
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pill-btn sm"
                          onClick={() => {
                            if (!controller.equipGear(inst.instanceId)) {
                              controller.playUiSound('error');
                            }
                          }}
                        >
                          Equip
                        </button>
                      )}
                      <button
                        type="button"
                        className="pill-btn blue sm"
                        onClick={() => {
                          controller.playUiSound('sheet_open');
                          setLevelTargetId(inst.instanceId);
                        }}
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
                <div className="item-card-col empty-card text-muted">
                  <BlueprintIcon size={28} />
                  <strong className="text-ink">No Blueprints yet!</strong>
                  <span className="text-md">
                    Open Grand, Event, Club, or Adventure Crates to find Legendary, Ultimate, and
                    Mythic blueprints.
                  </span>
                </div>
              ) : (
                blueprints.map((bp) => {
                  const tpl = GEAR_BY_ID[bp.templateId];
                  if (!tpl) return null;
                  const check = checkBlueprintForgeable(save, bp.instanceId);
                  return (
                    <div className={`item-card-col rarity-${tpl.rarity}`} key={bp.instanceId}>
                      <div className="row-between">
                        <div className="row-center min-w-0">
                          <div className={`rarity-tile tile-md rarity-${tpl.rarity}`}>
                            <GearSlotIcon slot={tpl.slot} size={28} />
                            <span className="tile-lv-pill">BP</span>
                          </div>
                          <div className="min-w-0">
                            <span className={`rarity-tag ${tpl.rarity}`}>
                              {tpl.rarity} Blueprint
                            </span>
                            <div className="card-title text-ink truncate">{tpl.name}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="pill-btn gold sm"
                          disabled={!check.canForge}
                          onClick={() => controller.forgeGearBlueprint(bp.instanceId)}
                        >
                          Forge!
                        </button>
                      </div>
                      <div className="stat-chip-row">
                        {tpl.effects.map((e, idx) => (
                          <span key={idx} className={`stat-chip ${getEffectChipClass(e.type)}`}>
                            {describeGearEffect(e.type, e.value)}
                          </span>
                        ))}
                      </div>
                      <div className="row-wrap">
                        {check.requirements.map((r) => (
                          <span
                            key={r.templateId}
                            className={`req-pill tabular-nums ${r.owned >= r.needed ? 'met' : 'unmet'}`}
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
                  if (res.length > 0) {
                    onShowBoxRewards(`${def.name} (×${Math.min(owned, qty)})`, res);
                  }
                };
                return (
                  <div className="item-card-col" key={type}>
                    <div className="row-between">
                      <div className="row-center min-w-0">
                        <div className="rarity-tile tile-md rarity-legendary">
                          <CrateIcon size={30} />
                          {owned > 0 && (
                            <span className="tile-count-pill tabular-nums">×{owned}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="row-center-tight row-wrap">
                            <strong className="text-ink">{def.name}</strong>
                            <span className="text-gold tabular-nums">×{owned}</span>
                          </div>
                          <div className="card-sub text-muted">{def.description}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="pill-btn ghost xs"
                        onClick={() => {
                          controller.playUiSound('tap');
                          setOddsBox(oddsBox === type ? null : type);
                        }}
                      >
                        Odds
                      </button>
                    </div>

                    {oddsBox === type && (
                      <div className="odds-panel">
                        {def.table.map((row) => (
                          <div key={row.label} className="row-between">
                            <span>{row.label}</span>
                            <strong className="text-sky tabular-nums">{row.chance}%</strong>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="btn-row">
                      {owned > 0 && (
                        <>
                          <button
                            type="button"
                            className="pill-btn sm"
                            onClick={() => openRewards(1)}
                          >
                            Open ×1
                          </button>
                          {owned >= 2 && (
                            <button
                              type="button"
                              className="pill-btn gold sm"
                              onClick={() => openRewards(Math.min(10, owned))}
                            >
                              Open ×{Math.min(10, owned)}
                            </button>
                          )}
                        </>
                      )}
                      {def.gemCost !== null && (
                        <button
                          type="button"
                          className="pill-btn blue sm"
                          disabled={save.gems < def.gemCost}
                          onClick={() => controller.buyLootBox(type, 1)}
                        >
                          <span>Buy ({def.gemCost}</span>
                          <GemIcon size={13} />
                          <span>)</span>
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
              <div className="stat-box chip-profit">
                All Profit Bonus<strong>+{stats.allProfitPercent.toLocaleString()}%</strong>
              </div>
              <div className="stat-box chip-profit">
                Global Profit Mult<strong>×{stats.totalGlobalProfitMultiplier.toFixed(2)}</strong>
              </div>
              <div className="stat-box chip-walk">
                Chef Walk Speed<strong>×{stats.playerWalkSpeedMult.toFixed(2)}</strong>
              </div>
              <div className="stat-box chip-walk">
                All Workers Walk<strong>×{stats.workerWalkSpeedMult.toFixed(2)}</strong>
              </div>
              <div className="stat-box chip-instant">
                Chef Instant Cook<strong>{Math.round(stats.playerInstantCookChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-instant">
                All Instant Cook<strong>{Math.round(stats.workerInstantCookChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-perfect">
                Chef Perfect (×6)<strong>{Math.round(stats.playerPerfectChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-divine">
                Chef Divine (×26)<strong>{Math.round(stats.playerDivineChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-double">
                Chef Double (×2)<strong>{Math.round(stats.playerDoubleChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-walk">
                Instant Orders<strong>{Math.round(stats.instantOrderChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-perfect">
                Golden Guest (×16)<strong>{Math.round(stats.goldenCustomerChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-double">
                Greedy Guest<strong>{Math.round(stats.greedyCustomerChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-double">
                Repeat Order<strong>{Math.round(stats.reorderChance * 100)}%</strong>
              </div>
              <div className="stat-box chip-perfect">
                Tip Chance / Value
                <strong>
                  {Math.round(stats.tipChance * 100)}% · ×{stats.tipValueMult.toFixed(1)}
                </strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
