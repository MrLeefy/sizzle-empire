import React, { useEffect, useState } from 'react';
import type { GameController } from '@/engine/GameController';
import { formatMoney } from '@/engine/economy/bigNumber';
import { POTION_RECIPES } from '@/data/events';
import {
  ChefHatIcon,
  CloseIcon,
  CoinIcon,
  GemIcon,
  InvestorIcon,
  MegaphoneIcon,
  PotionIcon,
  StationStyleIcon,
} from './CartoonIcons';

interface ActiveSkillsBarProps {
  controller: GameController;
}

export const ActiveSkillsBar: React.FC<ActiveSkillsBarProps> = ({ controller }) => {
  const [pickPopularOpen, setPickPopularOpen] = useState(false);
  const [potionTrayOpen, setPotionTrayOpen] = useState(false);

  // Register dynamic LIFO Android Back handler while either inline skill modal is open
  useEffect(() => {
    if (!pickPopularOpen && !potionTrayOpen) return;
    return controller.registerBackHandler(() => {
      if (potionTrayOpen) {
        controller.playUiSound('sheet_close');
        setPotionTrayOpen(false);
        return true;
      }
      if (pickPopularOpen) {
        controller.playUiSound('sheet_close');
        setPickPopularOpen(false);
        return true;
      }
      return false;
    });
  }, [controller, pickPopularOpen, potionTrayOpen]);

  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const notation = controller.save.settings.notation;
  const unlockedStations = runtime.stations.filter((s) => s.unlocked);
  const hasModeBanner = controller.save.events.activeView !== 'main';

  const popReady = runtime.simTime >= runtime.popularDishCooldownEndsAt;
  const popActiveLeft = Math.max(0, Math.ceil(runtime.popularDishEndsAt - runtime.simTime));
  const popCdLeft = Math.max(0, Math.ceil(runtime.popularDishCooldownEndsAt - runtime.simTime));

  const helperReady = runtime.simTime >= runtime.helperCooldownEndsAt;
  const helperCdLeft = Math.max(0, Math.ceil(runtime.helperCooldownEndsAt - runtime.simTime));

  const bottled = controller.save.events.potionShop.bottledPotions;
  const totalTipsCount = runtime.tips.length;

  const openPopularModal = () => {
    if (!popReady) return;
    controller.playUiSound('sheet_open');
    setPickPopularOpen(true);
  };

  const closePopularModal = () => {
    controller.playUiSound('sheet_close');
    setPickPopularOpen(false);
  };

  const openPotionModal = () => {
    controller.playUiSound('sheet_open');
    setPotionTrayOpen(true);
  };

  const closePotionModal = () => {
    controller.playUiSound('sheet_close');
    setPotionTrayOpen(false);
  };

  return (
    <>
      <div
        className={`skills-rail ${hasModeBanner ? 'below-banner' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* VIP Investor offer */}
        {runtime.investorAvailable && (
          <button
            type="button"
            className="skill-fab highlight"
            onClick={() => controller.claimVipInvestor()}
            title="Claim VIP Investor Offer"
          >
            {runtime.investorKind === 'gems' ? (
              <GemIcon size={22} />
            ) : (
              <InvestorIcon size={22} />
            )}
            <span className="tabular-nums">
              {runtime.investorKind === 'gems'
                ? `+${runtime.investorOfferValue}`
                : formatMoney(runtime.investorOfferValue, notation)}
            </span>
          </button>
        )}

        {/* Quick Sweep Tips */}
        {totalTipsCount > 0 && (
          <button
            type="button"
            className="skill-fab highlight"
            onClick={() => controller.collectAllTipsManual()}
            title="Collect All Table Tips"
          >
            <CoinIcon size={22} />
            <span className="tabular-nums">Tips ×{totalTipsCount}</span>
          </button>
        )}

        {/* Popular Dish Active Skill */}
        {unlockedStations.length > 1 && (
          <button
            type="button"
            className={`skill-fab ${popReady ? 'highlight' : ''}`}
            onClick={openPopularModal}
            disabled={!popReady}
            title="Popular Dish Boost"
          >
            <MegaphoneIcon size={22} />
            <span className="tabular-nums">
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
          type="button"
          className={`skill-fab ${helperReady ? 'highlight' : ''}`}
          onClick={() => controller.inviteHelperChef()}
          disabled={!helperReady}
          title="Invite Guest Chef for 4 minutes"
        >
          <ChefHatIcon size={22} />
          <span className="tabular-nums">
            {helperReady ? 'Helper' : `${Math.ceil(helperCdLeft / 60)}m`}
          </span>
        </button>

        {/* Bottled Potions Quick Use */}
        {bottled.length > 0 && runtime.modeContext !== 'potion_shop' && (
          <button
            type="button"
            className="skill-fab highlight"
            onClick={openPotionModal}
            title="Drink Bottled Potion"
          >
            <PotionIcon size={22} />
            <span className="tabular-nums">
              Elixir ×{bottled.reduce((a, b) => a + b.count, 0)}
            </span>
          </button>
        )}
      </div>

      {pickPopularOpen && (
        <div
          className="sheet-backdrop modal-center"
          onClick={(e) => {
            e.stopPropagation();
            closePopularModal();
          }}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title">
                <MegaphoneIcon size={20} />
                <span>Select Popular Dish (3 min)</span>
              </div>
              <button
                type="button"
                className="icon-btn close-btn"
                onClick={closePopularModal}
                aria-label="Close popular dish picker"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="sheet-body">
              {unlockedStations.map((stn) => {
                const tpl = template.stations[stn.index];
                return (
                  <div className="item-card" key={stn.index}>
                    <div className="row-center min-w-0">
                      <div className="card-icon-medallion">
                        <StationStyleIcon styleKind={tpl.modelStyle} size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="card-title text-ink truncate">{tpl.name}</div>
                        <div className="card-sub text-muted">
                          Lv {stn.level} · Guests strongly prefer ordering this dish!
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
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
        <div
          className="sheet-backdrop modal-center"
          onClick={(e) => {
            e.stopPropagation();
            closePotionModal();
          }}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <div className="sheet-title">
                <PotionIcon size={20} />
                <span>Bottled Potions</span>
              </div>
              <button
                type="button"
                className="icon-btn close-btn"
                onClick={closePotionModal}
                aria-label="Close bottled potions"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="sheet-body">
              {bottled.map((b) => {
                const rec = POTION_RECIPES.find((r) => r.id === b.recipeId);
                return (
                  <div className="item-card" key={`${b.recipeId}_${b.level}`}>
                    <div className="row-center min-w-0">
                      <div className="card-icon-medallion">
                        <PotionIcon size={22} />
                      </div>
                      <div className="min-w-0">
                        <div className="card-title text-ink">
                          {rec?.name ?? b.recipeId} (Lv {b.level}) ×{b.count}
                        </div>
                        <div className="card-sub text-muted">
                          +{Math.round(b.effectValue * 100)}% for {Math.round(b.durationSec / 60)}m
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
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
