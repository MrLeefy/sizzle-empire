import React, { useState } from 'react';
import type { GameController } from '@/engine/GameController';
import type { GearEffectType } from '@/types/game';
import { PET_SPECIES_BY_ID } from '@/data/pets';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { getPetAllProfitPercent } from '@/engine/economy/stats';
import { describeGearEffect } from '@/engine/meta/equipment';
import { getPetFoodForNextLevel, isPetSlotUnlocked } from '@/engine/meta/pets';
import {
  CloseIcon,
  EggIcon,
  LockIcon,
  PawIcon,
  PetSpeciesIcon,
  TreatIcon,
} from './CartoonIcons';

interface PetsSheetProps {
  controller: GameController;
  onClose: () => void;
}

function getPetEffectChipClass(type: GearEffectType): string {
  switch (type) {
    case 'instant_order':
      return 'chip-walk';
    case 'perfect_value':
    case 'golden_customer':
      return 'chip-perfect';
    case 'divine_value':
      return 'chip-divine';
    case 'greedy_customer':
      return 'chip-double';
    default:
      return 'chip-profit';
  }
}

export const PetsSheet: React.FC<PetsSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<'pets' | 'eggs'>('pets');
  const save = controller.save;

  const switchTab = (next: 'pets' | 'eggs') => {
    if (tab !== next) {
      controller.playUiSound('tab');
      setTab(next);
    }
  };

  const tryAutoMergePet = (primaryId: string) => {
    const primary = save.pets.find((p) => p.instanceId === primaryId);
    if (!primary || primary.rarity === 'ultimate') return;
    const eq = new Set(save.equippedPetIds.filter(Boolean));
    const fodder = save.pets.filter(
      (p) => p.instanceId !== primaryId && !eq.has(p.instanceId) && p.rarity === primary.rarity,
    );
    if (fodder.length < 2) {
      controller.playUiSound('error');
      controller.pushToast(`Need 2 other unequipped ${primary.rarity} pets to merge!`, 'warning');
      return;
    }
    controller.mergePlayerPets(primaryId, [fodder[0].instanceId, fodder[1].instanceId]);
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
            <PawIcon size={22} />
            <span>Companions</span>
            <span className="header-resource-pill tabular-nums">
              <TreatIcon size={15} /> {save.petFood.toLocaleString()}
            </span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close companions"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button
            type="button"
            className={`sheet-tab ${tab === 'pets' ? 'active' : ''}`}
            onClick={() => switchTab('pets')}
          >
            My Pets ({save.pets.length})
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'eggs' ? 'active' : ''}`}
            onClick={() => switchTab('eggs')}
          >
            Eggs ({save.eggs.reduce((a, e) => a + e.count, 0)})
          </button>
        </div>

        <div className="sheet-body">
          {/* Active Rarity-Framed Pet Loadout Slots */}
          <div className="grid-2">
            {([0, 1] as const).map((slotIdx) => {
              const unlocked = isPetSlotUnlocked(save, slotIdx);
              const pid = save.equippedPetIds[slotIdx];
              const pet = pid ? save.pets.find((p) => p.instanceId === pid) : null;
              const sp = pet ? PET_SPECIES_BY_ID[pet.speciesId] : null;
              return (
                <div
                  key={slotIdx}
                  className={`item-card-col slot-card ${pet ? `rarity-${pet.rarity}` : ''} ${unlocked ? '' : 'slot-locked'}`}
                >
                  <div className="slot-label text-muted">Pet Slot #{slotIdx + 1}</div>
                  {pet && sp ? (
                    <>
                      <div className={`rarity-tile tile-md rarity-${pet.rarity}`}>
                        <PetSpeciesIcon styleKind={sp.modelStyle} size={32} />
                        <span className="tile-lv-pill tabular-nums">Lv.{pet.level}</span>
                      </div>
                      <strong className="slot-item-name text-ink truncate w-full">{sp.name}</strong>
                      <span className="stat-chip chip-profit tabular-nums">
                        +{getPetAllProfitPercent(pet.rarity, pet.level)}% Profit
                      </span>
                      <button
                        type="button"
                        className="pill-btn ghost xs"
                        onClick={() => controller.unequipPlayerPet(slotIdx)}
                      >
                        Unequip
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="rarity-tile tile-md rarity-empty">
                        {unlocked ? <PawIcon size={24} /> : <LockIcon size={24} />}
                      </div>
                      <div className="slot-empty text-muted">
                        {unlocked
                          ? 'Empty Slot'
                          : slotIdx === 0
                            ? `City ${BALANCE.PET_SLOT_1_UNLOCK_CITY} or Hatch`
                            : `City ${BALANCE.PET_SLOT_2_UNLOCK_CITY}`}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {tab === 'pets' && (
            <>
              {save.pets.length === 0 ? (
                <div className="item-card-col empty-card text-muted">
                  <PawIcon size={28} />
                  <strong className="text-ink">No hatched pets yet!</strong>
                  <span className="text-md">
                    Switch to the Eggs tab and feed Pet Food to hatch your starter Common Egg.
                  </span>
                </div>
              ) : (
                save.pets.map((pet) => {
                  const sp = PET_SPECIES_BY_ID[pet.speciesId];
                  if (!sp) return null;
                  const equippedIdx = save.equippedPetIds.indexOf(pet.instanceId);
                  const nextFood = getPetFoodForNextLevel(pet.level, pet.rarity);
                  const canMerge =
                    pet.rarity !== 'ultimate' &&
                    save.pets.filter(
                      (o) =>
                        o.instanceId !== pet.instanceId &&
                        !save.equippedPetIds.includes(o.instanceId) &&
                        o.rarity === pet.rarity,
                    ).length >= 2;
                  return (
                    <div className={`item-card-col rarity-${pet.rarity}`} key={pet.instanceId}>
                      <div className="row-center min-w-0">
                        <div className={`rarity-tile tile-md rarity-${pet.rarity}`}>
                          <PetSpeciesIcon styleKind={sp.modelStyle} size={32} />
                          <span className="tile-lv-pill tabular-nums">Lv.{pet.level}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="row-center-tight row-wrap">
                            <span className={`rarity-tag ${pet.rarity}`}>{pet.rarity}</span>
                            <strong className="card-title text-ink truncate">{sp.name}</strong>
                          </div>
                          <div className="stat-chip-row">
                            <span className="stat-chip chip-profit tabular-nums">
                              +{getPetAllProfitPercent(pet.rarity, pet.level)}% Profit
                            </span>
                            {sp.deliveryMultiplier > 0 && (
                              <span className="stat-chip chip-instant tabular-nums">
                                ×{sp.deliveryMultiplier} Delivery
                              </span>
                            )}
                            {sp.tipInterval > 0 && (
                              <span className="stat-chip chip-perfect tabular-nums">
                                Tips /{sp.tipInterval}s
                              </span>
                            )}
                            {sp.effects.map((eff, idx) => (
                              <span
                                key={idx}
                                className={`stat-chip ${getPetEffectChipClass(eff.type)}`}
                              >
                                {describeGearEffect(eff.type, eff.value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="card-effect text-soft">{sp.description}</div>
                      <div className="btn-row">
                        {equippedIdx === -1 ? (
                          <button
                            type="button"
                            className="pill-btn sm"
                            onClick={() => {
                              const ok = controller.equipPlayerPet(
                                pet.instanceId,
                                !save.equippedPetIds[0] ? 0 : isPetSlotUnlocked(save, 1) ? 1 : 0,
                              );
                              if (!ok) controller.playUiSound('error');
                            }}
                          >
                            Equip
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="pill-btn ghost sm"
                            onClick={() => controller.unequipPlayerPet(equippedIdx as 0 | 1)}
                          >
                            Slot {equippedIdx + 1}
                          </button>
                        )}
                        <button
                          type="button"
                          className="pill-btn blue sm"
                          disabled={pet.level >= 50 || save.petFood <= 0}
                          onClick={() =>
                            controller.levelPet(
                              pet.instanceId,
                              Math.min(save.petFood, nextFood - pet.xp),
                            )
                          }
                        >
                          <span>
                            Feed (
                            {Number.isFinite(nextFood) ? Math.max(1, nextFood - pet.xp) : 'MAX'}
                          </span>
                          {Number.isFinite(nextFood) && <TreatIcon size={13} />}
                          <span>)</span>
                        </button>
                        {pet.rarity !== 'ultimate' && (
                          <button
                            type="button"
                            className="pill-btn purple sm"
                            disabled={!canMerge}
                            onClick={() => tryAutoMergePet(pet.instanceId)}
                          >
                            Merge (3→1)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'eggs' && (
            <>
              {save.eggs.filter((e) => e.count > 0).length === 0 ? (
                <div className="item-card-col empty-card text-muted">
                  <EggIcon size={28} />
                  <strong className="text-ink">No eggs in incubator!</strong>
                  <span className="text-md">
                    Open Small, Grand, or Companion Egg Crates in the Gear menu to collect eggs.
                  </span>
                </div>
              ) : (
                save.eggs
                  .filter((e) => e.count > 0)
                  .map((egg) => {
                    const cost = BALANCE.EGG_HATCH_COST[egg.rarity];
                    const remaining = Math.max(0, cost - egg.hatchingProgress);
                    const pct = Math.min(100, (egg.hatchingProgress / cost) * 100);
                    return (
                      <div className={`item-card-col rarity-${egg.rarity}`} key={egg.rarity}>
                        <div className="row-center min-w-0">
                          <div className={`rarity-tile tile-md rarity-${egg.rarity}`}>
                            <EggIcon size={30} />
                            <span className="tile-count-pill tabular-nums">×{egg.count}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="row-between">
                              <div className="row-center-tight row-wrap">
                                <span className={`rarity-tag ${egg.rarity}`}>{egg.rarity}</span>
                                <strong className="card-title text-ink">
                                  {egg.rarity[0].toUpperCase() + egg.rarity.slice(1)} Egg
                                </strong>
                              </div>
                              <span className="card-sub text-muted tabular-nums inline-icon-label">
                                {egg.hatchingProgress}/{cost} <TreatIcon size={13} />
                              </span>
                            </div>
                            <div className="progress-track candy-striped egg-progress-bar">
                              <div
                                className="progress-fill candy-fill"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="btn-row">
                          <button
                            type="button"
                            className="pill-btn sm"
                            disabled={save.petFood <= 0}
                            onClick={() => controller.hatchEgg(egg.rarity, Math.min(25, remaining))}
                          >
                            <span>Feed +25</span>
                            <TreatIcon size={13} />
                          </button>
                          <button
                            type="button"
                            className="pill-btn gold sm"
                            disabled={save.petFood < remaining}
                            onClick={() => controller.hatchEgg(egg.rarity, remaining)}
                          >
                            <span>Hatch Now ({remaining}</span>
                            <TreatIcon size={13} />
                            <span>)</span>
                          </button>
                          {egg.rarity !== 'ultimate' && (
                            <button
                              type="button"
                              className="pill-btn purple sm"
                              disabled={egg.count < BALANCE.EGG_MERGE_REQUIRED}
                              onClick={() => controller.mergePlayerEggs(egg.rarity)}
                            >
                              Merge 5 Eggs → Next
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
