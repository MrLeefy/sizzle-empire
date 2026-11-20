import React, { useState } from 'react';
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
import {
  CloseIcon,
  GemIcon,
  KeyIcon,
  PotionIcon,
  SparkleIcon,
  TentIcon,
  TreatIcon,
} from './CartoonIcons';

interface EventsSheetProps {
  controller: GameController;
  onClose: (silent?: boolean) => void;
}

const DIFFS: EventDifficulty[] = ['normal', 'hard', 'extreme', 'impossible', 'nightmare'];

export const EventsSheet: React.FC<EventsSheetProps> = ({ controller, onClose }) => {
  const [tab, setTab] = useState<'major' | 'adventures' | 'potions' | 'activities'>('major');
  const save = controller.save;
  const ps = save.events.potionShop;
  const act = save.events.activities;

  const maxSlots = Math.floor(getArcaneArtifactValue(save, 'potion_bandolier'));
  const maxPotionLv = Math.floor(getArcaneArtifactValue(save, 'crystal_catalyst'));

  const switchTab = (next: 'major' | 'adventures' | 'potions' | 'activities') => {
    if (tab !== next) {
      controller.playUiSound('tab');
      setTab(next);
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
            <TentIcon size={22} />
            <span>Events, Trials &amp; Alchemy</span>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={() => onClose()}
            aria-label="Close events"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="sheet-tabs">
          <button
            type="button"
            className={`sheet-tab ${tab === 'major' ? 'active' : ''}`}
            onClick={() => switchTab('major')}
          >
            Major Events (4)
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'adventures' ? 'active' : ''}`}
            onClick={() => switchTab('adventures')}
          >
            Adventures (2)
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'potions' ? 'active' : ''}`}
            onClick={() => switchTab('potions')}
          >
            Potion Shop
          </button>
          <button
            type="button"
            className={`sheet-tab ${tab === 'activities' ? 'active' : ''}`}
            onClick={() => switchTab('activities')}
          >
            Merchant &amp; Race
          </button>
        </div>

        <div className="sheet-body">
          {tab === 'major' && (
            <>
              <div className="sheet-intro text-muted">
                Your main city restaurant stays 100% intact while visiting any themed event!
              </div>
              {(Object.keys(MAJOR_EVENTS) as MajorEventId[]).map((evId) => {
                const def = MAJOR_EVENTS[evId];
                const prog = save.events.majorEvents[evId];
                const unlockedIdx = DIFFS.indexOf(prog.unlockedDifficulty);
                const medal = prog.bestMedalByDifficulty[prog.activeDifficulty] ?? 'none';

                return (
                  <div className={`item-card-col event-card-${evId}`} key={evId}>
                    <div className="row-between">
                      <div className="min-w-0">
                        <strong className="card-title text-ink">
                          {def.icon} {def.name}
                        </strong>
                        <div className="card-sub text-muted">{def.subtitle}</div>
                      </div>
                      <span className={`medal-tag medal-${medal}`}>{medal.toUpperCase()}</span>
                    </div>

                    <div className="row-wrap">
                      {DIFFS.map((diff, idx) => (
                        <button
                          type="button"
                          key={diff}
                          className={`buy-mode-btn diff-chip ${prog.activeDifficulty === diff ? 'active' : ''}`}
                          disabled={idx > unlockedIdx}
                          onClick={() => {
                            controller.playUiSound('boost');
                            controller.openMajorEvent(evId, diff);
                            onClose(true);
                          }}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>

                    <div className="btn-row">
                      <button
                        type="button"
                        className="pill-btn gold sm"
                        onClick={() => {
                          controller.playUiSound('boost');
                          controller.openMajorEvent(evId);
                          onClose(true);
                        }}
                      >
                        {prog.activeRun ? 'Resume Event' : 'Enter Event'}
                      </button>
                      {prog.activeRun && (
                        <button
                          type="button"
                          className="pill-btn ghost sm"
                          onClick={() => {
                            controller.playUiSound('tap');
                            controller.restartMajorEvent(evId);
                            onClose(true);
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
                    <div className="row-between">
                      <div className="min-w-0">
                        <strong className="card-title text-ink">
                          {def.icon} {def.name}
                        </strong>
                        <div className="card-sub text-muted">{def.subtitle}</div>
                      </div>
                      <strong className="text-gold key-counter tabular-nums">
                        <KeyIcon size={16} /> {prog.keys}/{prog.maxKeys}
                      </strong>
                    </div>
                    <div className="card-stat text-profit tabular-nums">
                      Highest Cleared: Level {prog.highestClearedLevel} / {def.maxLevels}
                    </div>
                    {prog.lastOutcome && (
                      <div
                        className={`card-sub ${prog.lastOutcome.won ? 'text-profit' : 'text-danger'}`}
                      >
                        Last Attempt (Lv {prog.lastOutcome.level}):{' '}
                        {prog.lastOutcome.won
                          ? `VICTORY! Won ${prog.lastOutcome.rewards.map((r) => r.label).join(', ')}`
                          : 'Time Expired — upgrade gear and retry!'}
                      </div>
                    )}
                    <div className="btn-row">
                      <button
                        type="button"
                        className="pill-btn purple sm"
                        disabled={prog.keys <= 0}
                        onClick={() => {
                          if (controller.beginTimedAdventure(advId, nextLv)) {
                            onClose(true);
                          } else {
                            controller.playUiSound('error');
                          }
                        }}
                      >
                        <span>Challenge Lv {nextLv} (1</span>
                        <KeyIcon size={13} />
                        <span>)</span>
                      </button>
                      {prog.highestClearedLevel >= 1 && (
                        <button
                          type="button"
                          className="pill-btn ghost sm"
                          disabled={prog.keys <= 0}
                          onClick={() => {
                            if (controller.beginTimedAdventure(advId, prog.highestClearedLevel)) {
                              onClose(true);
                            } else {
                              controller.playUiSound('error');
                            }
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
              <div className="item-card-col card-accent-amethyst">
                <div className="row-between">
                  <div className="min-w-0">
                    <strong className="card-title text-ink inline-icon-label">
                      <PotionIcon size={18} /> Alchemist&apos;s Apothecary
                    </strong>
                    <div className="card-sub text-muted tabular-nums">
                      Scrolls: 📜 {ps.scrolls} · Corks: 🪵 {ps.corks} · Cauldrons:{' '}
                      {ps.activePotions.length}/{maxSlots}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pill-btn purple sm"
                    onClick={() => {
                      controller.playUiSound('boost');
                      controller.openPotionShop();
                      onClose(true);
                    }}
                  >
                    Enter Shop
                  </button>
                </div>
                <div className="card-effect text-soft">
                  Gear is removed inside the Apothecary. Cook stations to harvest ingredients, brew
                  active cauldrons, and bottle potions for main-game boosts!
                </div>
              </div>

              {/* Active Cauldrons */}
              {ps.activePotions.length > 0 && (
                <div className="item-card-col">
                  <strong className="section-label text-amethyst">
                    Active Cauldrons ({ps.activePotions.length}/{maxSlots})
                  </strong>
                  {ps.activePotions.map((ap) => {
                    const rec = POTION_RECIPES.find((r) => r.id === ap.recipeId);
                    if (!rec) return null;
                    return (
                      <div key={ap.recipeId} className="row-between text-md">
                        <span className="text-ink font-bold">
                          {rec.icon} {rec.name} Lv {ap.level}
                        </span>
                        <button
                          type="button"
                          className="pill-btn gold xs"
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
              <strong className="section-label text-gold">
                Potion Recipes (Max Lv {maxPotionLv})
              </strong>
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
                    <div className="min-w-0">
                      <strong className="card-title text-ink">
                        {rec.icon} {rec.name} {active ? `(Lv ${active.level})` : ''}
                      </strong>
                      <div className="card-sub-xs text-muted tabular-nums">
                        {rec.ingredientA}: {haveA}/{cost} · {rec.ingredientB}: {haveB}/{cost}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pill-btn purple sm"
                      disabled={!canBrew}
                      onClick={() => controller.brewPotion(rec.id)}
                    >
                      {active ? `Lv ${nextLv}` : 'Brew'}
                    </button>
                  </div>
                );
              })}

              {/* 7 Persistent Arcane Vault Artifacts */}
              <strong className="section-label text-sky">
                Persistent Arcane Vault (📜 {ps.scrolls} Scrolls)
              </strong>
              {ARCANE_VAULT_ARTIFACTS.map((art) => {
                const unlocked = ps.arcaneVaultUnlocked.includes(art.id);
                const lv = unlocked ? (ps.arcaneVaultLevels[art.id] ?? 1) : 0;
                const isMax = lv >= art.maxLevel;
                const cost = unlocked
                  ? art.scrollCostBase + (lv - 1) * art.scrollCostStep
                  : BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS[
                      Math.min(
                        ps.arcaneVaultUnlocked.length,
                        BALANCE.ARCANE_VAULT_UNLOCK_SCROLLS.length - 1,
                      )
                    ];
                return (
                  <div className="item-card" key={art.id}>
                    <div className="min-w-0">
                      <strong className="card-title text-ink">
                        {art.name} {unlocked ? `(Lv ${lv}/${art.maxLevel})` : '(Locked)'}
                      </strong>
                      <div className="card-sub-xs text-muted">{art.description}</div>
                    </div>
                    <button
                      type="button"
                      className="pill-btn blue sm"
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
                <strong className="card-title text-ink">
                  🍊 Traveling Merchant · {act.merchantTokens} Citrus Tokens
                </strong>
                <div className="card-sub text-muted">
                  Earn Citrus Tokens every time you reach a station milestone!
                </div>
                {MERCHANT_OFFERS.map((offer) => {
                  const bought = act.merchantPurchasedIds.includes(offer.id);
                  return (
                    <div className="item-card" key={offer.id}>
                      <span className="text-ink">
                        {offer.icon} <strong>{offer.label}</strong>
                      </span>
                      <button
                        type="button"
                        className="pill-btn gold sm"
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
                <strong className="card-title text-ink inline-icon-label">
                  <SparkleIcon size={16} /> Kitchen Sprint Race · {act.raceStars} Stars
                </strong>
                <div className="card-sub text-muted">
                  Earn Race Stars from station milestones (+1★) and renovations (+5★).
                </div>
                {RACE_TIERS[act.raceTierClaimed] ? (
                  <div className="item-card">
                    <span className="text-ink tabular-nums inline-icon-label">
                      Tier {act.raceTierClaimed + 1}: {act.raceStars}/
                      {RACE_TIERS[act.raceTierClaimed].stars} ★ →{' '}
                      <strong>{RACE_TIERS[act.raceTierClaimed].gems}</strong>
                      <GemIcon size={14} />
                    </span>
                    <button
                      type="button"
                      className="pill-btn sm"
                      disabled={act.raceStars < RACE_TIERS[act.raceTierClaimed].stars}
                      onClick={() => controller.claimRaceTier()}
                    >
                      Claim
                    </button>
                  </div>
                ) : (
                  <div className="card-stat text-profit">All Race Tiers Claimed!</div>
                )}
              </div>

              {/* Harvest Collection */}
              <div className="item-card-col">
                <strong className="card-title text-ink">
                  🌾 Harvest Collection · {act.harvestPoints} Points
                </strong>
                <div className="card-sub text-muted">
                  Serve dishes across any restaurant to gather Harvest Points for Pet Food &amp;
                  Alchemy Corks.
                </div>
                {HARVEST_TIERS[act.harvestTierClaimed] ? (
                  <div className="item-card">
                    <span className="text-ink tabular-nums inline-icon-label">
                      Goal: {act.harvestPoints}/{HARVEST_TIERS[act.harvestTierClaimed].points} →{' '}
                      <strong>{HARVEST_TIERS[act.harvestTierClaimed].petFood}</strong>
                      <TreatIcon size={14} /> +{' '}
                      <strong>{HARVEST_TIERS[act.harvestTierClaimed].corks} 🪵</strong>
                    </span>
                    <button
                      type="button"
                      className="pill-btn sm"
                      disabled={act.harvestPoints < HARVEST_TIERS[act.harvestTierClaimed].points}
                      onClick={() => controller.claimHarvestTier()}
                    >
                      Claim
                    </button>
                  </div>
                ) : (
                  <div className="card-stat text-profit">All Harvest Goals Claimed!</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
