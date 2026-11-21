import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  AirplaneIcon,
  BoltIcon,
  ClubIcon,
  PawIcon,
  RenovateIcon,
  ShieldIcon,
  TentIcon,
  TrophyIcon,
  VaultIcon,
} from './components/CartoonIcons';
import { d } from '@/engine/economy/bigNumber';
import { getRestaurantUpgradeCost } from '@/engine/economy/economy';
import { getClaimableAchievementCount } from '@/engine/meta/achievements';
import { getCityByNumber } from '@/data/cities';
import type { LootRewardItem } from '@/types/game';
import type { SfxName } from '@/audio/soundEngine';

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

function formatBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

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
  const [boxReveal, setBoxReveal] = useState<{ title: string; rewards: LootRewardItem[] } | null>(
    null,
  );

  // Keep live refs for imperative callbacks & LIFO Android Back handlers
  const activeSheetRef = useRef<ActiveSheet>(activeSheet);
  activeSheetRef.current = activeSheet;
  const selectedStationRef = useRef<number | null>(selectedStation);
  selectedStationRef.current = selectedStation;
  const boxRevealRef = useRef(boxReveal);
  boxRevealRef.current = boxReveal;
  const lastCanvasPickAtRef = useRef(0);

  // Sync selected station into imperative overlay painter
  useEffect(() => {
    painterRef.current?.setSelectedStation(selectedStation);
  }, [selectedStation]);

  // One-time global user gesture Web Audio unlock (StrictMode-safe cleanup)
  useEffect(() => {
    let unlocked = false;
    const handleGesture = () => {
      if (unlocked) return;
      unlocked = true;
      controller.unlockAudio();
      window.removeEventListener('pointerdown', handleGesture, true);
      window.removeEventListener('touchstart', handleGesture, true);
      window.removeEventListener('keydown', handleGesture, true);
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', handleGesture, opts);
    window.addEventListener('touchstart', handleGesture, opts);
    window.addEventListener('keydown', handleGesture, opts);
    return () => {
      window.removeEventListener('pointerdown', handleGesture, true);
      window.removeEventListener('touchstart', handleGesture, true);
      window.removeEventListener('keydown', handleGesture, true);
    };
  }, [controller]);

  // Base Android hardware Back handler (LIFO layer 1: activeSheet -> selectedStation -> minimize)
  useEffect(() => {
    return controller.registerBackHandler(() => {
      if (activeSheetRef.current !== null) {
        controller.playUiSound('sheet_close');
        setActiveSheet(null);
        return true;
      }
      if (selectedStationRef.current !== null) {
        controller.playUiSound('sheet_close');
        setSelectedStation(null);
        return true;
      }
      return false;
    });
  }, [controller]);

  // Boot simulation, IndexedDB persistence, Three.js renderer, and throttled UI subscription
  useEffect(() => {
    const unsub = controller.subscribeUi(() => {
      setTick(controller.getUiVersion());
    });
    const unsubScene = controller.subscribeSceneRebuild(() => {
      setSelectedStation(null);
    });

    // Expose dev debug hooks safely for headless testing & inspection
    (window as unknown as Record<string, unknown>).__sizzle = controller;

    void controller.boot();

    if (viewportRef.current && overlayRef.current) {
      const painter = new WorldOverlayPainter({
        layer: overlayRef.current,
        controller,
        onSelectStation: (idx) => {
          const prev = selectedStationRef.current;
          if (prev === idx) {
            controller.playUiSound('sheet_close');
            setSelectedStation(null);
          } else {
            controller.playUiSound(prev === null ? 'sheet_open' : 'tap');
            setActiveSheet(null);
            setSelectedStation(idx);
          }
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
          lastCanvasPickAtRef.current = performance.now();
          const prev = selectedStationRef.current;
          if (prev !== idx) {
            controller.playUiSound(prev === null ? 'sheet_open' : 'tap');
          }
          setActiveSheet(null);
          setSelectedStation(idx);
        },
        onTapTip: (tipId) => {
          lastCanvasPickAtRef.current = performance.now();
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
      unsubScene();
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
  const hasModeBanner = controller.save.events.activeView !== 'main';
  const hasGlobalModal = Boolean(boxReveal || renovationSummary || offlineReport);

  // Topmost LIFO Android Back handler while any global celebration/offline modal is visible
  useEffect(() => {
    if (!hasGlobalModal) return;
    return controller.registerBackHandler(() => {
      if (boxRevealRef.current) {
        controller.playUiSound('sheet_close');
        setBoxReveal(null);
        return true;
      }
      if (controller.getRenovationSummary()) {
        controller.playUiSound('sheet_close');
        controller.dismissRenovationSummary();
        return true;
      }
      if (controller.getOfflineReport()) {
        controller.playUiSound('coin');
        controller.dismissOfflineReport();
        return true;
      }
      return false;
    });
  }, [controller, hasGlobalModal]);

  const playUiSound = useCallback(
    (sfx: SfxName) => {
      controller.playUiSound(sfx);
    },
    [controller],
  );

  const closeSheet = useCallback(
    (silent = false) => {
      if (!silent) controller.playUiSound('sheet_close');
      setActiveSheet(null);
    },
    [controller],
  );

  const closePopover = useCallback(() => {
    controller.playUiSound('sheet_close');
    setSelectedStation(null);
  }, [controller]);

  const toggleSheet = useCallback(
    (sheet: ActiveSheet) => {
      const prev = activeSheetRef.current;
      const next = prev === sheet ? null : sheet;
      controller.playUiSound(next === null ? 'sheet_close' : prev === null ? 'sheet_open' : 'tab');
      setSelectedStation(null);
      setActiveSheet(next);
    },
    [controller],
  );

  const handleVisualSettingsChange = useCallback(() => {
    rendererRef.current?.applyQualitySettings();
  }, []);

  return (
    <div
      className="game-shell"
      onClick={() => {
        if (performance.now() - lastCanvasPickAtRef.current < 300) return;
        if (selectedStationRef.current !== null) closePopover();
      }}
    >
      {/* 3D WebGL Canvas */}
      <div className="viewport-3d" ref={viewportRef} />

      {/* Zero-React-overhead projected 3D overlays */}
      <div className="world-overlay-layer" ref={overlayRef} />

      {/* Top Portrait HUD */}
      <TopHud controller={controller} onOpenSettings={() => toggleSheet('settings')} />

      {/* Toast Notices */}
      {toasts.length > 0 && (
        <div className={`toast-stack ${hasModeBanner ? 'below-banner' : ''}`}>
          {toasts.map((t) => (
            <div key={t.id} className={`toast-item ${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      )}

      {/* Side Active Skills Rail */}
      <ActiveSkillsBar controller={controller} />

      {/* 360° camera controls (also: twist two fingers to rotate, pinch to zoom, drag to move) */}
      {selectedStation === null && !activeSheet && (
        <div className="camera-controls" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="cam-btn"
            aria-label="Rotate view left"
            title="Rotate left (Q)"
            onClick={() => rendererRef.current?.rotateCameraBy(Math.PI / 4)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M5 9a8 8 0 1 1-1 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M2 4v6h6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="cam-btn"
            aria-label="Reset camera view"
            title="Reset view (R)"
            onClick={() => rendererRef.current?.resetCameraView()}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className="cam-btn"
            aria-label="Rotate view right"
            title="Rotate right (E)"
            onClick={() => rendererRef.current?.rotateCameraBy(-Math.PI / 4)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M19 9a8 8 0 1 0 1 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <path d="M22 4v6h-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Station Level / Unlock Popover */}
      {selectedStation !== null && !activeSheet && (
        <StationPopover
          key={selectedStation}
          controller={controller}
          stationIndex={selectedStation}
          onClose={closePopover}
        />
      )}

      {/* Renovate / Fly to Next City CTA */}
      {canRenovate && selectedStation === null && !activeSheet && (
        <div className="renovate-cta-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="renovate-cta"
            onClick={() => controller.renovateMainRestaurant()}
          >
            {isCityFlightReady ? <AirplaneIcon size={20} /> : <RenovateIcon size={20} />}
            <span>{isCityFlightReady ? 'FLY TO NEXT CITY!' : 'RENOVATE RESTAURANT!'}</span>
          </button>
        </div>
      )}

      {/* One-Handed Portrait Bottom Nav */}
      <nav className="bottom-nav" onClick={(e) => e.stopPropagation()}>
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={`nav-btn ${activeSheet === 'upgrades' ? 'active' : ''}`}
            onClick={() => toggleSheet('upgrades')}
          >
            <BoltIcon size={22} />
            <span className="nav-label">Upgrades</span>
            {affordableUpgradesCount > 0 && (
              <span className="nav-badge">{formatBadgeCount(affordableUpgradesCount)}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'gear' ? 'active' : ''}`}
            onClick={() => toggleSheet('gear')}
          >
            <ShieldIcon size={22} />
            <span className="nav-label">Gear</span>
            {totalBoxes > 0 && <span className="nav-badge">{formatBadgeCount(totalBoxes)}</span>}
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'pets' ? 'active' : ''}`}
            onClick={() => toggleSheet('pets')}
          >
            <PawIcon size={22} />
            <span className="nav-label">Pets</span>
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'vault' ? 'active' : ''}`}
            onClick={() => toggleSheet('vault')}
          >
            <VaultIcon size={22} />
            <span className="nav-label">Vault</span>
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'events' ? 'active' : ''}`}
            onClick={() => toggleSheet('events')}
          >
            <TentIcon size={22} />
            <span className="nav-label">Events</span>
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'achievements' ? 'active' : ''}`}
            onClick={() => toggleSheet('achievements')}
          >
            <TrophyIcon size={22} />
            <span className="nav-label">Ranks</span>
            {claimableAch > 0 && (
              <span className="nav-badge">{formatBadgeCount(claimableAch)}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-btn ${activeSheet === 'social' ? 'active' : ''}`}
            onClick={() => toggleSheet('social')}
          >
            <ClubIcon size={22} />
            <span className="nav-label">Club</span>
          </button>
        </div>
      </nav>

      {/* Bottom Sheets & Modals */}
      {activeSheet === 'upgrades' && (
        <UpgradesSheet controller={controller} onClose={() => closeSheet()} />
      )}
      {activeSheet === 'gear' && (
        <GearSheet
          controller={controller}
          onClose={() => closeSheet()}
          onShowBoxRewards={(title, rewards) => setBoxReveal({ title, rewards })}
        />
      )}
      {activeSheet === 'pets' && (
        <PetsSheet controller={controller} onClose={() => closeSheet()} />
      )}
      {activeSheet === 'vault' && (
        <VaultSheet controller={controller} onClose={() => closeSheet()} />
      )}
      {activeSheet === 'events' && (
        <EventsSheet controller={controller} onClose={(silent) => closeSheet(silent)} />
      )}
      {activeSheet === 'achievements' && (
        <AchievementsSheet controller={controller} onClose={() => closeSheet()} />
      )}
      {activeSheet === 'social' && (
        <SocialSheet controller={controller} onClose={() => closeSheet()} />
      )}
      {activeSheet === 'settings' && (
        <SettingsModal
          controller={controller}
          onClose={(silent) => closeSheet(silent)}
          onVisualSettingsChange={handleVisualSettingsChange}
        />
      )}

      {offlineReport && (
        <OfflineModal
          report={offlineReport}
          notation={controller.save.settings.notation}
          onDismiss={() => controller.dismissOfflineReport()}
          onPlaySound={playUiSound}
        />
      )}

      {renovationSummary && (
        <RenovationModal
          summary={renovationSummary}
          onDismiss={() => controller.dismissRenovationSummary()}
          onPlaySound={playUiSound}
        />
      )}

      {boxReveal && (
        <BoxOpeningModal
          title={boxReveal.title}
          rewards={boxReveal.rewards}
          onClose={() => setBoxReveal(null)}
          onPlaySound={playUiSound}
        />
      )}
    </div>
  );
};
