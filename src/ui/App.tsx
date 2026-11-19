import React, { useEffect, useRef, useState } from 'react';
import {
  Zap,
  Shield,
  PawPrint,
  Landmark,
  Calendar,
  Trophy,
  Users,
  Sparkles,
} from 'lucide-react';
import { GameController } from '@/engine/GameController';
import { SceneRenderer } from '@/renderer/SceneRenderer';
import { WorldOverlayPainter } from './components/WorldOverlayPainter';
import { TopHud } from './components/TopHud';
import { ActiveSkillsBar } from './components/ActiveSkillsBar';
import { StationPopover } from './components/StationPopover';
import { UpgradesSheet } from './components/UpgradesSheet';
import { GearSheet } from './components/GearSheet';
import { PetsSheet } from './components/PetsSheet';
import { VaultSheet } from './components/VaultSheet';
import { EventsSheet } from './components/EventsSheet';
import { AchievementsSheet } from './components/AchievementsSheet';
import { SocialSheet } from './components/SocialSheet';
import { SettingsModal } from './components/SettingsModal';
import { BoxOpeningModal, OfflineModal, RenovationModal } from './components/GameModals';
import { d } from '@/engine/economy/bigNumber';
import { getRestaurantUpgradeCost } from '@/engine/economy/economy';
import { getClaimableAchievementCount } from '@/engine/meta/achievements';
import { getCityByNumber } from '@/data/cities';
import type { LootRewardItem } from '@/types/game';

type ActiveSheet =
  | null
  | 'upgrades'
  | 'gear'
  | 'pets'
  | 'vault'
  | 'events'
  | 'achievements'
  | 'social'
  | 'settings';

export const App: React.FC = () => {
  const controllerRef = useRef<GameController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new GameController();
  }
  const controller = controllerRef.current;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const painterRef = useRef<WorldOverlayPainter | null>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);

  const [, setTick] = useState(0);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [boxReveal, setBoxReveal] = useState<{ title: string; rewards: LootRewardItem[] } | null>(null);

  // Sync selected station into imperative overlay painter
  useEffect(() => {
    painterRef.current?.setSelectedStation(selectedStation);
  }, [selectedStation]);

  // Boot simulation, IndexedDB persistence, Three.js renderer, and throttled UI subscription
  useEffect(() => {
    const unsub = controller.subscribeUi(() => {
      setTick(controller.getUiVersion());
    });

    // Expose dev debug hooks safely for headless testing & inspection
    (window as unknown as Record<string, unknown>).__sizzle = controller;

    void controller.boot();

    if (viewportRef.current && overlayRef.current) {
      const painter = new WorldOverlayPainter({
        layer: overlayRef.current,
        controller,
        onSelectStation: (idx) => {
          setActiveSheet(null);
          setSelectedStation((prev) => (prev === idx ? null : idx));
        },
        onTapTip: (tipId) => {
          controller.tapTip(tipId);
        },
      });
      painterRef.current = painter;

      const renderer = new SceneRenderer({
        container: viewportRef.current,
        controller,
        onSelectStation: (idx) => {
          setActiveSheet(null);
          setSelectedStation(idx);
        },
        onTapTip: (tipId) => {
          controller.tapTip(tipId);
        },
        onOverlayFrame: (frame) => {
          painter.paint(frame);
        },
      });
      rendererRef.current = renderer;
    }

    return () => {
      unsub();
      controller.stopLoop();
      rendererRef.current?.dispose();
      painterRef.current?.dispose();
    };
  }, [controller]);

  // Apply Three.js graphics quality immediately when user toggles Settings
  const qualityKey = controller.save.settings.graphicsQuality;
  useEffect(() => {
    rendererRef.current?.applyQualitySettings();
  }, [qualityKey]);

  const runtime = controller.getActiveRuntime();
  const template = controller.getActiveTemplate();
  const cityNum = controller.getActiveCityNumber();
  const cash = d(runtime.cash);

  const affordableUpgradesCount = template.upgrades.filter((u) => {
    if (runtime.purchasedUpgradeIds.includes(u.id)) return false;
    if (u.stationIndex !== undefined && !runtime.stations[u.stationIndex]?.unlocked) return false;
    return cash.gte(getRestaurantUpgradeCost(u, cityNum, runtime.difficultyMultiplier));
  }).length;

  const totalBoxes = Object.values(controller.save.boxes).reduce((a, b) => a + b, 0);
  const claimableAch = getClaimableAchievementCount(controller.save);
  const canRenovate = controller.canRenovateMainRestaurant();
  const { city } = getCityByNumber(controller.save.cityNumber);
  const isCityFlightReady =
    canRenovate && controller.save.restaurantStageIndex + 1 >= city.restaurantIds.length;

  const offlineReport = controller.getOfflineReport();
  const renovationSummary = controller.getRenovationSummary();
  const toasts = controller.getToasts();

  const toggleSheet = (sheet: ActiveSheet) => {
    setSelectedStation(null);
    setActiveSheet((prev) => (prev === sheet ? null : sheet));
  };

  return (
    <div className="game-shell" onClick={() => selectedStation !== null && setSelectedStation(null)}>
      {/* 3D WebGL Canvas */}
      <div className="viewport-3d" ref={viewportRef} />

      {/* Zero-React-overhead projected 3D overlays */}
      <div className="world-overlay-layer" ref={overlayRef} />

      {/* Top Portrait HUD */}
      <TopHud controller={controller} onOpenSettings={() => toggleSheet('settings')} />

      {/* Toast Notices */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`toast-item ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Side Active Skills Rail */}
      <ActiveSkillsBar controller={controller} />

      {/* Station Level / Unlock Popover */}
      {selectedStation !== null && !activeSheet && (
        <StationPopover
          controller={controller}
          stationIndex={selectedStation}
          onClose={() => setSelectedStation(null)}
        />
      )}

      {/* Renovate / Fly to Next City CTA */}
      {canRenovate && selectedStation === null && !activeSheet && (
        <div className="renovate-cta-wrap">
          <button className="renovate-cta" onClick={() => controller.renovateMainRestaurant()}>
            <Sparkles size={18} />
            <span>{isCityFlightReady ? '✈️ FLY TO NEXT CITY!' : '🏗️ RENOVATE RESTAURANT!'}</span>
          </button>
        </div>
      )}

      {/* One-Handed Portrait Bottom Nav */}
      <nav className="bottom-nav" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-nav-inner">
          <button
            className={`nav-btn ${activeSheet === 'upgrades' ? 'active' : ''}`}
            onClick={() => toggleSheet('upgrades')}
          >
            <Zap size={18} />
            <span>Upgrades</span>
            {affordableUpgradesCount > 0 && (
              <span className="nav-badge">{affordableUpgradesCount}</span>
            )}
          </button>

          <button
            className={`nav-btn ${activeSheet === 'gear' ? 'active' : ''}`}
            onClick={() => toggleSheet('gear')}
          >
            <Shield size={18} />
            <span>Gear</span>
            {totalBoxes > 0 && <span className="nav-badge">{totalBoxes}</span>}
          </button>

          <button
            className={`nav-btn ${activeSheet === 'pets' ? 'active' : ''}`}
            onClick={() => toggleSheet('pets')}
          >
            <PawPrint size={18} />
            <span>Pets</span>
          </button>

          <button
            className={`nav-btn ${activeSheet === 'vault' ? 'active' : ''}`}
            onClick={() => toggleSheet('vault')}
          >
            <Landmark size={18} />
            <span>Vault</span>
          </button>

          <button
            className={`nav-btn ${activeSheet === 'events' ? 'active' : ''}`}
            onClick={() => toggleSheet('events')}
          >
            <Calendar size={18} />
            <span>Events</span>
          </button>

          <button
            className={`nav-btn ${activeSheet === 'achievements' ? 'active' : ''}`}
            onClick={() => toggleSheet('achievements')}
          >
            <Trophy size={18} />
            <span>Ranks</span>
            {claimableAch > 0 && <span className="nav-badge">{claimableAch}</span>}
          </button>

          <button
            className={`nav-btn ${activeSheet === 'social' ? 'active' : ''}`}
            onClick={() => toggleSheet('social')}
          >
            <Users size={18} />
            <span>Club</span>
          </button>
        </div>
      </nav>

      {/* Bottom Sheets & Modals */}
      {activeSheet === 'upgrades' && (
        <UpgradesSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'gear' && (
        <GearSheet
          controller={controller}
          onClose={() => setActiveSheet(null)}
          onShowBoxRewards={(title, rewards) => setBoxReveal({ title, rewards })}
        />
      )}
      {activeSheet === 'pets' && (
        <PetsSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'vault' && (
        <VaultSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'events' && (
        <EventsSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'achievements' && (
        <AchievementsSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'social' && (
        <SocialSheet controller={controller} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet === 'settings' && (
        <SettingsModal controller={controller} onClose={() => setActiveSheet(null)} />
      )}

      {offlineReport && (
        <OfflineModal
          report={offlineReport}
          notation={controller.save.settings.notation}
          onDismiss={() => controller.dismissOfflineReport()}
        />
      )}

      {renovationSummary && (
        <RenovationModal
          summary={renovationSummary}
          onDismiss={() => controller.dismissRenovationSummary()}
        />
      )}

      {boxReveal && (
        <BoxOpeningModal
          title={boxReveal.title}
          rewards={boxReveal.rewards}
          onClose={() => setBoxReveal(null)}
        />
      )}
    </div>
  );
};
