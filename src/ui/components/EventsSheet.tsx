import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { GameController } from '@/engine/GameController';
import type { AdventureId, EventDifficulty, MajorEventId } from '@/types/game';
import {
  ADVENTURES,
  ARCANE_VAULT_ARTIFACTS,
  MAJOR_EVENTS,
  MERCHANT_OFFERS,
  POTION_RECIPES,
} from '@/data/events';
import {
  HARVEST_TIERS,
  RACE_TIERS,
  getArcaneArtifactValue,
  getPotionIngredientCost,
} from '@/engine/events/eventEngine';
import { BALANCE } from '@/engine/economy/balanceConfig';

interface EventsSheetProps {
  controller: GameController;
  onClose: () => void;
}

const DIFFS: EventDifficulty[] = ['normal', 'hard', 'extreme', 'impossible', 'nightmare'];

export const EventsSheet: React.FC<EventsSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<'major' | 'adventures' | 'potions' | 'activities'>('major');
  const save = controller.save;
  const ps = save.events.potionShop;
  const act = save.events.activities;

  const maxSlots = Math.floor(getArcaneArtifactValue(save, 'potion_bandolier'));
  const maxPotionLv = Math.floor(getArcaneArtifactValue(save, 'crystal_catalyst'));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <div className="sheet-title">🎪 Events, Trials & Alchemy</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button className={`sheet-tab ${tab === 'major' ? 'active' : ''}`} onClick={() => setTab('major')}>
            Major Events (4)
          </button>
          <button className={`sheet-tab ${tab === 'adventures' ? 'active' : ''}`} onClick={() => setTab('adventures')}>
            Adventures (2)
          </button>
          <button className={`sheet-tab ${tab === 'potions' ? 'active' : ''}`} onClick={() => setTab('potions')}>
            Potion Shop
          </button>
          <button className={`sheet-tab ${tab === 'activities' ? 'active' : ''}`} onClick={() => setTab('activities')}>
            Merchant & Race
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'major' && (
            <>
              <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                Your main city restaurant stays 100% intact while visiting any themed event!
              </div>
              {(Object.keys(MAJOR_EVENTS) as MajorEventId[]).map((evId) => {
                const def = MAJOR_EVENTS[evId];
                const prog = save.events.majorEvents[evId];
                const unlockedIdx = DIFFS.indexOf(prog.unlockedDifficulty);
                const medal = prog.bestMedalByDifficulty[prog.activeDifficulty] ?? 'none';

                return (
                  <div className="item-card-col" key={evId} style={{ borderColor: def.accentColor }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {def.icon} {def.name}
                        </strong>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>{def.subtitle}</div>
                      </div>
                      <span className="rarity-tag legendary">{medal.toUpperCase()}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {DIFFS.map((diff, idx) => (
                        <button
                          key={diff}
                          className={`buy-mode-btn ${prog.activeDifficulty === diff ? 'active' : ''}`}
                          style={{ flex: 0, padding: '4px 8px', opacity: idx <= unlockedIdx ? 1 : 0.4 }}
                          disabled={idx > unlockedIdx}
                          onClick={() => {
                            controller.openMajorEvent(evId, diff);
                            onClose();
                          }}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="pill-btn gold"
                        onClick={() => {
                          controller.openMajorEvent(evId);
                          onClose();
                        }}
                      >
                        {prog.activeRun ? 'Resume Event' : 'Enter Event'}
                      </button>
                      {prog.activeRun && (
                        <button
                          className="pill-btn ghost"
                          onClick={() => {
                            controller.restartMajorEvent(evId);
                            onClose();
                          }}
                        >
                          Restart Run
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'adventures' && (
            <>
              {(Object.keys(ADVENTURES) as AdventureId[]).map((advId) => {
                const def = ADVENTURES[advId];
                const prog = save.events.adventures[advId];
                const nextLv = Math.min(def.maxLevels, prog.highestClearedLevel + 1);
                return (
                  <div className="item-card-col" key={advId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>
                          {def.icon} {def.name}
                        </strong>
                        <div style={{ fontSize: 11, color: '#b8b2d0' }}>{def.subtitle}</div>
                      </div>
                      <strong style={{ color: '#facc15', fontSize: 13 }}>
                        🗝️ {prog.keys}/{prog.maxKeys}
                      </strong>
                    </div>
                    <div style={{ fontSize: 11, color: '#86efac' }}>
                      Highest Cleared: Level {prog.highestClearedLevel} / {def.maxLevels}
                    </div>
                    {prog.lastOutcome && (
                      <div style={{ fontSize: 11, color: prog.lastOutcome.won ? '#86efac' : '#fca5a5' }}>
                        Last Attempt (Lv {prog.lastOutcome.level}):{' '}
                        {prog.lastOutcome.won
                          ? `VICTORY! Won ${prog.lastOutcome.rewards.map((r) => r.label).join(', ')}`
                          : 'Time Expired — upgrade gear and retry!'}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="pill-btn purple"
                        disabled={prog.keys <= 0}
                        onClick={() => {
                          if (controller.beginTimedAdventure(advId, nextLv)) onClose();
                        }}
                      >
                        Challenge Lv {nextLv} (1 🗝️)
                      </button>
                      {prog.highestClearedLevel >= 1 && (
                        <button
                          className="pill-btn ghost"
                          disabled={prog.keys <= 0}
                          onClick={() => {
                            if (controller.beginTimedAdventure(advId, prog.highestClearedLevel)) onClose();
                          }}
                        >
                          Farm Lv {prog.highestClearedLevel}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'potions' && (
            <>
              <div className="item-card-col" style={{ borderColor: '#a855f7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>🧪 Alchemist&apos;s Apothecary</strong>
                    <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                      Scrolls: 📜 {ps.scrolls} · Corks: 🪵 {ps.corks} · Cauldrons: {ps.activePotions.length}/{maxSlots}
                    </div>
                  </div>
                  <button
                    className="pill-btn purple"
                    onClick={() => {
                      controller.openPotionShop();
                      onClose();
                    }}
                  >
                    Enter Shop
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                  Gear is removed inside the Apothecary. Cook stations to harvest ingredients, brew active cauldrons, and bottle potions for main-game boosts!
                </div>
              </div>

              {/* Active Cauldrons */}
              {ps.activePotions.length > 0 && (
                <div className="item-card-col">
                  <strong style={{ fontSize: 12 }}>Active Cauldrons ({ps.activePotions.length}/{maxSlots})</strong>
                  {ps.activePotions.map((ap) => {
                    const rec = POTION_RECIPES.find((r) => r.id === ap.recipeId);
                    if (!rec) return null;
                    return (
                      <div key={ap.recipeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span>
                          {rec.icon} {rec.name} Lv {ap.level}
                        </span>
                        <button
                          className="pill-btn gold"
                          style={{ padding: '4px 9px', fontSize: 11 }}
                          disabled={ps.corks <= 0}
                          onClick={() => controller.bottlePotion(ap.recipeId)}
                        >
                          Bottle (1 🪵)
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 10 Brewable Recipes */}
              <strong style={{ fontSize: 12, color: '#facc15' }}>Potion Recipes (Max Lv {maxPotionLv})</strong>
              {POTION_RECIPES.map((rec) => {
                const active = ps.activePotions.find((p) => p.recipeId === rec.id);
                const nextLv = active ? active.level + 1 : 1;
                const cost = getPotionIngredientCost(save, rec.id, nextLv);
                const haveA = ps.ingredients[rec.ingredientA] ?? 0;
                const haveB = ps.ingredients[rec.ingredientB] ?? 0;
                const canBrew =
                  nextLv <= maxPotionLv &&
                  (Boolean(active) || ps.activePotions.length < maxSlots) &&
                  haveA >= cost &&
                  haveB >= cost;

                return (
                  <div className="item-card" key={rec.id}>
                    <div>
                      <strong style={{ fontSize: 12 }}>
                        {rec.icon} {rec.name} {active ? `(Lv ${active.level})` : ''}
                      </strong>
                      <div style={{ fontSize: 10, color: '#b8b2d0' }}>
                        {rec.ingredientA}: {haveA}/{cost} · {rec.ingredientB}: {haveB}/{cost}
                      </div>
                    </div>
                    <button
                      className="pill-btn purple"
                      disabled={!canBrew}
                      onClick={() => controller.brewPotion(rec.id)}
                    >
                      {active ? `Lv ${nextLv}` : 'Brew'}
                    </button>
                  </div>
                );
              })}

              {/* 7 Persistent Arcane Vault Artifacts */}
              <strong style={{ fontSize: 12, color: '#38bdf8', marginTop: 6 }}>
                Persistent Arcane Vault (📜 {ps.scrolls} Scrolls)
              </strong>
              {ARCANE_VAULT_ARTIFACTS.map((art) => {
                const unlocked = ps.arcaneVaultUnlocked.includes(art.id);
                const lv = unlocked ? (ps.arcaneVaultLevels[art.id] ?? 1) : 0;
                const isMax = lv >= art.maxLevel;
                const cost = unlocked
                  ? art.scrollCostBase + (lv - 1) * art.scrollCostStep
                  : BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS[
                      Math.min(ps.arcaneVaultUnlocked.length, BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS.length - 1)
                    ];
                return (
                  <div className="item-card" key={art.id}>
                    <div>
                      <strong style={{ fontSize: 12 }}>
                        {art.name} {unlocked ? `(Lv ${lv}/${art.maxLevel})` : '(Locked)'}
                      </strong>
                      <div style={{ fontSize: 10, color: '#b8b2d0' }}>{art.description}</div>
                    </div>
                    <button
                      className="pill-btn blue"
                      disabled={isMax || ps.scrolls < cost}
                      onClick={() => controller.upgradeArcane(art.id)}
                    >
                      {isMax ? 'MAX' : `${cost} 📜`}
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'activities' && (
            <>
              {/* Traveling Merchant */}
              <div className="item-card-col">
                <strong>🍊 Traveling Merchant · {act.merchantTokens} Citrus Tokens</strong>
                <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                  Earn Citrus Tokens every time you reach a station milestone!
                </div>
                {MERCHANT_OFFERS.map((offer) => {
                  const bought = act.merchantPurchasedIds.includes(offer.id);
                  return (
                    <div className="item-card" key={offer.id}>
                      <span>
                        {offer.icon} <strong>{offer.label}</strong>
                      </span>
                      <button
                        className="pill-btn gold"
                        disabled={bought || act.merchantTokens < offer.tokenCost}
                        onClick={() => controller.purchaseMerchantOffer(offer.id)}
                      >
                        {bought ? 'Claimed' : `${offer.tokenCost} 🍊`}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Kitchen Sprint Race */}
              <div className="item-card-col">
                <strong>🏁 Kitchen Sprint Race · ⭐ {act.raceStars} Stars</strong>
                <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                  Earn Race Stars from station milestones (+1★) and renovations (+5★).
                </div>
                {RACE_TIERS[act.raceTierClaimed] ? (
                  <div className="item-card">
                    <span>
                      Tier {act.raceTierClaimed + 1}: {act.raceStars}/{RACE_TIERS[act.raceTierClaimed].stars} ★ →{' '}
                      <strong>{RACE_TIERS[act.raceTierClaimed].gems} 💎</strong>
                    </span>
                    <button
                      className="pill-btn"
                      disabled={act.raceStars < RACE_TIERS[act.raceTierClaimed].stars}
                      onClick={() => controller.claimRaceTier()}
                    >
                      Claim
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#86efac' }}>All Race Tiers Claimed!</div>
                )}
              </div>

              {/* Harvest Collection */}
              <div className="item-card-col">
                <strong>🌾 Harvest Collection · {act.harvestPoints} Points</strong>
                <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                  Serve dishes across any restaurant to gather Harvest Points for Pet Food & Alchemy Corks.
                </div>
                {HARVEST_TIERS[act.harvestTierClaimed] ? (
                  <div className="item-card">
                    <span>
                      Goal: {act.harvestPoints}/{HARVEST_TIERS[act.harvestTierClaimed].points} →{' '}
                      <strong>
                        {HARVEST_TIERS[act.harvestTierClaimed].petFood} 🍖 +{' '}
                        {HARVEST_TIERS[act.harvestTierClaimed].corks} 🪵
                      </strong>
                    </span>
                    <button
                      className="pill-btn"
                      disabled={act.harvestPoints < HARVEST_TIERS[act.harvestTierClaimed].points}
                      onClick={() => controller.claimHarvestTier()}
                    >
                      Claim
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#86efac' }}>All Harvest Goals Claimed!</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
