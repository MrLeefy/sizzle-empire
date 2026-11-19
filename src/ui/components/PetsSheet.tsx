import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import { PET_SPECIES_BY_ID } from '@/data/pets';
import { BALANCE } from '@/engine/economy/balanceConfig';
import { getPetAllProfitPercent } from '@/engine/economy/stats';
import { getPetFoodForNextLevel, isPetSlotUnlocked } from '@/engine/meta/pets';

interface PetsSheetProps {
  controller: GameController;
  onClose: () => void;
}

export const PetsSheet: React.FC<PetsSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<'pets' | 'eggs'>('pets');
  const save = controller.save;

  const tryAutoMergePet = (primaryId: string) => {
    const primary = save.pets.find((p) => p.instanceId === primaryId);
    if (!primary || primary.rarity === 'ultimate') return;
    const eq = new Set(save.equippedPetIds.filter(Boolean));
    const fodder = save.pets.filter(
      (p) => p.instanceId !== primaryId && !eq.has(p.instanceId) && p.rarity === primary.rarity,
    );
    if (fodder.length < 2) {
      controller.pushToast(`Need 2 other unequipped ${primary.rarity} pets to merge!`, 'warning');
      return;
    }
    controller.mergePlayerPets(primaryId, [fodder[0].instanceId, fodder[1].instanceId]);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🐾 Companions · 🍖 {save.petFood.toLocaleString()}</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button className={`sheet-tab ${tab === 'pets' ? 'active' : ''}`} onClick={() => setTab('pets')}>
            My Pets ({save.pets.length})
          </button>
          <button className={`sheet-tab ${tab === 'eggs' ? 'active' : ''}`} onClick={() => setTab('eggs')}>
            Eggs ({save.eggs.reduce((a, e) => a + e.count, 0)})
          </button>
        </div>

        <div className="sheet-body">
          {/* Active Pet Slots */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([0, 1] as const).map((slotIdx) => {
              const unlocked = isPetSlotUnlocked(save, slotIdx);
              const pid = save.equippedPetIds[slotIdx];
              const pet = pid ? save.pets.find((p) => p.instanceId === pid) : null;
              const sp = pet ? PET_SPECIES_BY_ID[pet.speciesId] : null;
              return (
                <div
                  key={slotIdx}
                  className={`item-card-col ${pet ? `rarity-${pet.rarity}` : ''}`}
                  style={{ textAlign: 'center', opacity: unlocked ? 1 : 0.55 }}
                >
                  <div style={{ fontSize: 10, color: '#b8b2d0', fontWeight: 800 }}>
                    Pet Slot #{slotIdx + 1}
                  </div>
                  {pet && sp ? (
                    <>
                      <strong style={{ fontSize: 13 }}>{sp.name}</strong>
                      <div style={{ fontSize: 11, color: '#facc15' }}>
                        {pet.rarity.toUpperCase()} Lv {pet.level} · +{getPetAllProfitPercent(pet.rarity, pet.level)}%
                      </div>
                      <button
                        className="pill-btn ghost"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => controller.unequipPlayerPet(slotIdx)}
                      >
                        Unequip
                      </button>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#94a3b8', padding: '10px 0' }}>
                      {unlocked
                        ? 'Empty Slot'
                        : slotIdx === 0
                          ? `🔒 City ${BALANCE.PET_SLOT_1_UNLOCK_CITY} or Hatch`
                          : `🔒 City ${BALANCE.PET_SLOT_2_UNLOCK_CITY}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tab === 'pets' && (
            <>
              {save.pets.length === 0 ? (
                <div className="item-card-col" style={{ textAlign: 'center', color: '#b8b2d0' }}>
                  <strong>No hatched pets yet!</strong>
                  <span style={{ fontSize: 12 }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className={`rarity-tag ${pet.rarity}`}>{pet.rarity}</span>{' '}
                          <strong>{sp.name}</strong>{' '}
                          <span style={{ color: '#facc15', fontSize: 11 }}>Lv {pet.level}/50</span>
                        </div>
                        <span style={{ color: '#86efac', fontWeight: 800, fontSize: 12 }}>
                          +{getPetAllProfitPercent(pet.rarity, pet.level)}%
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1' }}>{sp.description}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {equippedIdx === -1 ? (
                          <button
                            className="pill-btn"
                            onClick={() =>
                              controller.equipPlayerPet(
                                pet.instanceId,
                                !save.equippedPetIds[0] ? 0 : isPetSlotUnlocked(save, 1) ? 1 : 0,
                              )
                            }
                          >
                            Equip
                          </button>
                        ) : (
                          <button
                            className="pill-btn ghost"
                            onClick={() => controller.unequipPlayerPet(equippedIdx as 0 | 1)}
                          >
                            Slot {equippedIdx + 1}
                          </button>
                        )}
                        <button
                          className="pill-btn blue"
                          disabled={pet.level >= 50 || save.petFood <= 0}
                          onClick={() => controller.levelPet(pet.instanceId, Math.min(save.petFood, nextFood - pet.xp))}
                        >
                          Feed ({Number.isFinite(nextFood) ? `${Math.max(1, nextFood - pet.xp)}🍖` : 'MAX'})
                        </button>
                        {pet.rarity !== 'ultimate' && (
                          <button
                            className="pill-btn purple"
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
                <div className="item-card-col" style={{ textAlign: 'center', color: '#b8b2d0' }}>
                  <strong>No eggs in incubator!</strong>
                  <span style={{ fontSize: 12 }}>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span className={`rarity-tag ${egg.rarity}`}>{egg.rarity}</span>{' '}
                            <strong>🥚 {egg.rarity[0].toUpperCase() + egg.rarity.slice(1)} Egg</strong>{' '}
                            <span style={{ color: '#facc15' }}>×{egg.count}</span>
                          </div>
                          <span style={{ fontSize: 11, color: '#b8b2d0' }}>
                            {egg.hatchingProgress}/{cost} 🍖
                          </span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            className="pill-btn"
                            disabled={save.petFood <= 0}
                            onClick={() => controller.hatchEgg(egg.rarity, Math.min(25, remaining))}
                          >
                            Feed +25 🍖
                          </button>
                          <button
                            className="pill-btn gold"
                            disabled={save.petFood < remaining}
                            onClick={() => controller.hatchEgg(egg.rarity, remaining)}
                          >
                            Hatch Now ({remaining} 🍖)
                          </button>
                          {egg.rarity !== 'ultimate' && (
                            <button
                              className="pill-btn purple"
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
