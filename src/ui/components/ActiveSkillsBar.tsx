import React, { useState } from 'react';
import type { GameController } from '@/engine/GameController';
import { formatMoney } from '@/engine/economy/bigNumber';
import { POTION_RECIPES } from '@/data/events';

interface ActiveSkillsBarProps {
  controller: GameController;
}

export const ActiveSkillsBar: React.FC<ActiveSkillsBarProps> = ({ controller }) => {
  const [pickPopularOpen, setPickPopularOpen] = useState(false);
  const [potionTrayOpen, setPotionTrayOpen] = useState(false);

  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const notation = controller.save.settings.notation;
  const unlockedStations = runtime.stations.filter((s) => s.unlocked);

  const popReady = runtime.simTime >= runtime.popularDishCooldownEndsAt;
  const popActiveLeft = Math.max(0, Math.ceil(runtime.popularDishEndsAt - runtime.simTime));
  const popCdLeft = Math.max(0, Math.ceil(runtime.popularDishCooldownEndsAt - runtime.simTime));

  const helperReady = runtime.simTime >= runtime.helperCooldownEndsAt;
  const helperCdLeft = Math.max(0, Math.ceil(runtime.helperCooldownEndsAt - runtime.simTime));

  const bottled = controller.save.events.potionShop.bottledPotions;
  const totalTipsCount = runtime.tips.length;

  return (
    <>
      <div className="skills-rail">
        {/* VIP Investor offer */}
        {runtime.investorAvailable && (
          <button
            className="skill-fab highlight"
            onClick={() => controller.claimVipInvestor()}
            title="Claim VIP Investor Offer"
          >
            <span className="emoji">{runtime.investorKind === 'gems' ? '💎' : '💼'}</span>
            <span>
              {runtime.investorKind === 'gems'
                ? `+${runtime.investorOfferValue}💎`
                : formatMoney(runtime.investorOfferValue, notation)}
            </span>
          </button>
        )}

        {/* Quick Sweep Tips */}
        {totalTipsCount > 0 && (
          <button
            className="skill-fab highlight"
            onClick={() => controller.collectAllTipsManual()}
            title="Collect All Table Tips"
          >
            <span className="emoji">🪙</span>
            <span>Tips ({totalTipsCount})</span>
          </button>
        )}

        {/* Popular Dish Active Skill */}
        {unlockedStations.length > 1 && (
          <button
            className={`skill-fab ${popReady ? 'highlight' : ''}`}
            onClick={() => popReady && setPickPopularOpen(true)}
            disabled={!popReady}
            title="Popular Dish Boost"
          >
            <span className="emoji">📣</span>
            <span>
              {popActiveLeft > 0
                ? `${popActiveLeft}s`
                : popReady
                  ? 'Popular'
                  : `${Math.ceil(popCdLeft / 60)}m`}
            </span>
          </button>
        )}

        {/* Invite Helper Chef */}
        <button
          className={`skill-fab ${helperReady ? 'highlight' : ''}`}
          onClick={() => controller.inviteHelperChef()}
          disabled={!helperReady}
          title="Invite Guest Chef for 4 minutes"
        >
          <span className="emoji">👨‍🍳</span>
          <span>{helperReady ? 'Helper' : `${Math.ceil(helperCdLeft / 60)}m`}</span>
        </button>

        {/* Bottled Potions Quick Use */}
        {bottled.length > 0 && runtime.modeContext !== 'potion_shop' && (
          <button
            className="skill-fab highlight"
            onClick={() => setPotionTrayOpen(true)}
            title="Drink Bottled Potion"
          >
            <span className="emoji">🧪</span>
            <span>Elixirs ({bottled.reduce((a, b) => a + b.count, 0)})</span>
          </button>
        )}
      </div>

      {pickPopularOpen && (
        <div className="sheet-backdrop modal-center" onClick={() => setPickPopularOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title">📣 Select Popular Dish (3 min)</div>
              <button className="pill-btn ghost" onClick={() => setPickPopularOpen(false)}>
                Close
              </button>
            </div>
            <div className="sheet-body">
              {unlockedStations.map((stn) => {
                const tpl = template.stations[stn.index];
                return (
                  <div className="item-card" key={stn.index}>
                    <div>
                      <strong>
                        {tpl.icon} {tpl.name}
                      </strong>
                      <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                        Lv {stn.level} · Guests strongly prefer ordering this dish!
                      </div>
                    </div>
                    <button
                      className="pill-btn gold"
                      onClick={() => {
                        controller.activatePopularDish(stn.index);
                        setPickPopularOpen(false);
                      }}
                    >
                      Promote
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {potionTrayOpen && (
        <div className="sheet-backdrop modal-center" onClick={() => setPotionTrayOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title">🧪 Bottled Potions</div>
              <button className="pill-btn ghost" onClick={() => setPotionTrayOpen(false)}>
                Close
              </button>
            </div>
            <div className="sheet-body">
              {bottled.map((b) => {
                const rec = POTION_RECIPES.find((r) => r.id === b.recipeId);
                return (
                  <div className="item-card" key={`${b.recipeId}_${b.level}`}>
                    <div>
                      <strong>
                        {rec?.icon} {rec?.name} (Lv {b.level}) ×{b.count}
                      </strong>
                      <div style={{ fontSize: 11, color: '#b8b2d0' }}>
                        +{Math.round(b.effectValue * 100)}% for {Math.round(b.durationSec / 60)}m
                      </div>
                    </div>
                    <button
                      className="pill-btn purple"
                      onClick={() => {
                        controller.drinkBottledPotion(b.recipeId, b.level);
                        setPotionTrayOpen(false);
                      }}
                    >
                      Drink
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
