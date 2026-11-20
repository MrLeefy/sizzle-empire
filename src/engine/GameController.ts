import type {
  AdventureId,
  BuyMode,
  ComputedStats,
  EquippedSlotKey,
  EventDifficulty,
  GameSaveData,
  LootBoxType,
  LootRewardItem,
  MajorEventId,
  Rarity,
  RestaurantLayout,
  RestaurantRuntimeState,
  RestaurantTemplate,
  SettingsState,
} from '@/types/game';
import { BALANCE } from './economy/balanceConfig';
import { d, serializeDecimal } from './economy/bigNumber';
import {
  calculateOfflineEarnings,
  countPassedMilestones,
  getStationSpeedMultiplier,
  getRestaurantCompletionPercent,
  getRestaurantUpgradeCost,
  getStationMaxLevel,
  isRestaurantComplete,
  resolveStationPurchasePlan,
} from './economy/economy';
import { computePlayerStats, getEquippedPetInstances } from './economy/stats';
import { SeededRNG } from './rng';
import { getCityByNumber } from '@/data/cities';
import { getRestaurantTemplate } from '@/data/restaurants';
import { buildRestaurantLayout } from './sim/layoutBuilder';
import {
  createInitialRestaurantRuntime,
  createWorker,
  RestaurantSimulator,
} from './sim/restaurantSim';
import {
  equipGearItem,
  forgeBlueprint,
  salvageGearIntoTarget,
  unequipGearSlot,
} from './meta/equipment';
import { buyBoxWithGems, openBoxes } from './meta/lootBoxes';
import { equipPet, feedEggToHatch, feedPetLevel, mergeEggs, mergePets, unequipPet } from './meta/pets';
import { unlockVaultArtifact, upgradeVaultArtifact } from './meta/vault';
import { claimAchievementTier, claimChefRankReward } from './meta/achievements';
import {
  bottleActivePotion,
  brewOrUpgradePotion,
  buyMerchantOffer,
  claimNextHarvestReward,
  claimNextRaceReward,
  consumeBottledPotion,
  enterMajorEvent,
  enterPotionShop,
  evaluateMajorEventProgress,
  regenAdventureKeys,
  resetMajorEventRun,
  startTimedAdventure,
  tickTimedAdventure,
  upgradeArcaneVault,
} from './events/eventEngine';
import {
  claimClubLevelReward,
  createClubLocal,
  joinClubByObject,
  leaveClub,
  salvageGearToClub,
} from './social/clubService';
import { OnlineSocialClient } from './social/leaderboardService';
import {
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AMBIENT_VOLUME,
  DEFAULT_SFX_VOLUME,
  createNewGameSave,
  exportSaveToJson,
  importSaveFromJson,
} from './persistence/saveSchema';
import { SaveStorage } from './persistence/storage';
import { SoundEngine, type SfxName, type SfxPlayOptions } from '@/audio/soundEngine';
import { CapacitorBridge } from '@/native/capacitorBridge';

export interface OfflineEarningsReport {
  clampedSeconds: number;
  earnings: string;
  recoveredFromBackup: boolean;
}

export interface RenovationSummary {
  isCityFlight: boolean;
  previousRestaurantName: string;
  nextRestaurantName: string;
  nextCityName: string;
  nextCityNumber: number;
  smallBoxesEarned: number;
  gemsEarned: number;
}

export interface ToastNotice {
  id: number;
  text: string;
  kind: 'info' | 'reward' | 'warning';
}

export class GameController {
  save: GameSaveData;
  rng: SeededRNG;
  sim = new RestaurantSimulator();
  storage = new SaveStorage();
  socialClient = new OnlineSocialClient();
  sound = new SoundEngine();
  native = new CapacitorBridge();

  private activeLayout: RestaurantLayout;
  private activeTemplate: RestaurantTemplate;
  private listeners = new Set<() => void>();
  private sceneRebuildListeners = new Set<() => void>();
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private accumulator = 0;
  private readonly FIXED_DT = 1 / 30;
  private renderAlpha = 0;
  private uiNotifyTimer = 0;
  private autosaveTimer = 0;
  private checkpointTimer = 0;
  private lastOfflineReport: OfflineEarningsReport | null = null;
  private lastRenovationSummary: RenovationSummary | null = null;
  private toasts: ToastNotice[] = [];
  private toastSeq = 1;
  private uiVersion = 0;
  private loaded = false;
  private backHandlers: Array<{ id: number; fn: () => boolean }> = [];
  private backHandlerSeq = 1;
  private readonly UPGRADE_COMBO_WINDOW_MS = 700;
  private upgradeComboCount = 0;
  private lastUpgradeAtMs: number | null = null;
  private lastUpgradeStationIndex: number | null = null;

  constructor(initialSave?: GameSaveData) {
    this.save = initialSave ?? createNewGameSave();
    this.rng = new SeededRNG(this.save.rngState);
    const active = this.getActiveRuntime();
    this.activeTemplate = getRestaurantTemplate(active.templateId);
    this.activeLayout = buildRestaurantLayout(this.activeTemplate);
    this.sim.syncLayoutSlots(active, this.activeLayout);
    this.syncAudioSettings();
    this.native.setHapticsEnabled(this.save.settings.hapticsEnabled);
  }

  getUiVersion(): number {
    return this.uiVersion;
  }

  getRenderAlpha(): number {
    return this.renderAlpha;
  }

  getActiveTemplate(): RestaurantTemplate {
    return this.activeTemplate;
  }

  getActiveLayout(): RestaurantLayout {
    return this.activeLayout;
  }

  getOfflineReport(): OfflineEarningsReport | null {
    return this.lastOfflineReport;
  }

  dismissOfflineReport(): void {
    this.lastOfflineReport = null;
    this.emitUiNow();
  }

  getRenovationSummary(): RenovationSummary | null {
    return this.lastRenovationSummary;
  }

  dismissRenovationSummary(): void {
    this.lastRenovationSummary = null;
    this.emitUiNow();
  }

  getToasts(): ToastNotice[] {
    return this.toasts;
  }

  pushToast(text: string, kind: ToastNotice['kind'] = 'info'): void {
    const id = this.toastSeq++;
    this.toasts = [...this.toasts.slice(-3), { id, text, kind }];
    this.emitUiNow();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.emitUiNow();
    }, 3200);
  }

  getActiveRuntime(): RestaurantRuntimeState {
    const view = this.save.events.activeView;
    if (view === 'major_event') {
      const run = this.save.events.majorEvents[this.save.events.activeMajorEventId]?.activeRun;
      if (run) return run;
    } else if (view === 'adventure') {
      const run = this.save.events.adventures[this.save.events.activeAdventureId]?.activeRun;
      if (run) return run;
    } else if (view === 'potion_shop') {
      const run = this.save.events.potionShop.activeRun;
      if (run) return run;
    }
    this.save.events.activeView = 'main';
    return this.save.mainRestaurant;
  }

  getActiveCityNumber(): number {
    return this.save.events.activeView === 'main' ? this.save.cityNumber : 1;
  }

  getActiveStats(nowMs = Date.now()): ComputedStats {
    const runtime = this.getActiveRuntime();
    const hired = runtime.chefCount + runtime.waiterCount + runtime.cashierCount;
    return computePlayerStats(this.save, hired, nowMs, {
      ignoreGear: runtime.ignoreGear,
      inPotionShop: runtime.modeContext === 'potion_shop',
    });
  }

  subscribeUi(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeSceneRebuild(fn: () => void): () => void {
    this.sceneRebuildListeners.add(fn);
    return () => this.sceneRebuildListeners.delete(fn);
  }

  private emitUiNow(): void {
    this.uiVersion++;
    for (const fn of this.listeners) fn();
  }

  private syncAudioSettings(): void {
    const s = this.save.settings;
    const soundEnabled = typeof s.soundEnabled === 'boolean' ? s.soundEnabled : true;
    const sfxVolume =
      typeof s.sfxVolume === 'number' && Number.isFinite(s.sfxVolume)
        ? Math.min(1, Math.max(0, s.sfxVolume))
        : DEFAULT_SFX_VOLUME;
    const ambientEnabled =
      typeof s.ambientEnabled === 'boolean' ? s.ambientEnabled : DEFAULT_AMBIENT_ENABLED;
    const ambientVolume =
      typeof s.ambientVolume === 'number' && Number.isFinite(s.ambientVolume)
        ? Math.min(1, Math.max(0, s.ambientVolume))
        : DEFAULT_AMBIENT_VOLUME;

    s.soundEnabled = soundEnabled;
    s.sfxVolume = sfxVolume;
    s.ambientEnabled = ambientEnabled;
    s.ambientVolume = ambientVolume;

    this.sound.setEnabled(soundEnabled);
    this.sound.setSfxVolume(sfxVolume);
    this.sound.setAmbientEnabled(ambientEnabled);
    this.sound.setAmbientVolume(ambientVolume);
  }

  registerBackHandler(handler: () => boolean): () => void {
    const id = this.backHandlerSeq++;
    const entry = { id, fn: handler };
    this.backHandlers.push(entry);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const idx = this.backHandlers.indexOf(entry);
      if (idx !== -1) {
        this.backHandlers.splice(idx, 1);
      }
    };
  }

  handleBackButton(): boolean {
    // Snapshot LIFO iteration so handlers may safely unsubscribe themselves or others while running.
    const snapshot = [...this.backHandlers];
    for (let i = snapshot.length - 1; i >= 0; i--) {
      const entry = snapshot[i];
      if (!this.backHandlers.includes(entry)) continue;
      try {
        if (entry.fn()) {
          return true;
        }
      } catch {
        // Never let a throwing UI handler wedge Android Back navigation
      }
    }
    return false;
  }

  unlockAudio(): void {
    this.sound.unlock();
  }

  playUiSound(sfx: SfxName, opts?: SfxPlayOptions): void {
    this.sound.unlock();
    this.sound.play(sfx, opts);
  }

  private resetUpgradeCombo(): void {
    this.upgradeComboCount = 0;
    this.lastUpgradeAtMs = null;
    this.lastUpgradeStationIndex = null;
  }

  private recordUpgradeCombo(stationIndex: number, nowMs = Date.now()): number {
    const elapsed = this.lastUpgradeAtMs !== null ? nowMs - this.lastUpgradeAtMs : -1;
    const isConsecutive =
      this.lastUpgradeStationIndex === stationIndex &&
      this.lastUpgradeAtMs !== null &&
      elapsed >= 0 &&
      elapsed <= this.UPGRADE_COMBO_WINDOW_MS;

    this.upgradeComboCount = isConsecutive ? this.upgradeComboCount + 1 : 1;
    this.lastUpgradeAtMs = nowMs;
    this.lastUpgradeStationIndex = stationIndex;
    // 0-indexed rising pentatonic step (0 on 1st tap, 1 on 2nd within 700ms, ..., 24+)
    return Math.max(0, this.upgradeComboCount - 1);
  }

  getUpgradeComboCount(stationIndex?: number): number {
    if (this.upgradeComboCount <= 0 || this.lastUpgradeAtMs === null) return 0;
    const elapsed = Date.now() - this.lastUpgradeAtMs;
    if (elapsed < 0 || elapsed > this.UPGRADE_COMBO_WINDOW_MS) {
      return 0;
    }
    if (stationIndex !== undefined && this.lastUpgradeStationIndex !== stationIndex) {
      return 0;
    }
    return this.upgradeComboCount;
  }

  private emitSceneRebuild(): void {
    this.resetUpgradeCombo();
    const active = this.getActiveRuntime();
    this.activeTemplate = getRestaurantTemplate(active.templateId);
    this.activeLayout = buildRestaurantLayout(this.activeTemplate);
    this.sim.resetPathCache();
    this.sim.syncLayoutSlots(active, this.activeLayout);
    if (!active.ignoreGear) {
      this.sim.syncEquippedPets(active, getEquippedPetInstances(this.save));
    }
    for (const fn of this.sceneRebuildListeners) fn();
    this.emitUiNow();
  }

  async boot(): Promise<void> {
    if (this.loaded) {
      this.startLoop();
      return;
    }
    this.loaded = true;

    const { save: loadedSave, recoveredFromBackup } = await this.storage.load();
    if (loadedSave) {
      this.save = loadedSave;
      this.rng.setState(this.save.rngState);
      this.applyOfflineProgress(Date.now(), recoveredFromBackup);
    }

    this.syncAudioSettings();
    this.native.setHapticsEnabled(this.save.settings.hapticsEnabled);
    this.emitSceneRebuild();

    await this.native.init({
      onPause: () => {
        this.sound.setPaused(true);
        void this.persistNow();
      },
      onResume: () => {
        this.sound.setPaused(false);
        this.applyOfflineProgress(Date.now(), false);
        this.emitUiNow();
      },
      onBackButton: () => this.handleBackButton(),
    });

    this.startLoop();
  }

  private applyOfflineProgress(nowMs: number, recoveredFromBackup: boolean): void {
    const elapsedSec = Math.max(0, (nowMs - this.save.savedAtMs) / 1000);
    regenAdventureKeys(this.save, nowMs);
    this.regenBoostCharges(nowMs);

    // Offline progress applies to the main restaurant safely
    const main = this.save.mainRestaurant;
    const mainTpl = getRestaurantTemplate(main.templateId);
    const hired = main.chefCount + main.waiterCount + main.cashierCount;
    const stats = computePlayerStats(this.save, hired, nowMs);
    const { clampedSeconds, earnings } = calculateOfflineEarnings(
      mainTpl,
      main,
      stats,
      this.save.cityNumber,
      elapsedSec,
    );

    if (clampedSeconds >= 20 && earnings.gt(0)) {
      main.cash = serializeDecimal(d(main.cash).add(earnings));
      main.totalCashEarnedHere = serializeDecimal(d(main.totalCashEarnedHere).add(earnings));
      this.lastOfflineReport = {
        clampedSeconds,
        earnings: serializeDecimal(earnings),
        recoveredFromBackup,
      };
    } else if (recoveredFromBackup) {
      this.pushToast('Save recovered automatically from backup snapshot.', 'warning');
    }

    this.save.savedAtMs = nowMs;
  }

  private regenBoostCharges(nowMs: number): void {
    if (this.save.boost.chargesRemaining >= BALANCE.MAX_BOOST_CHARGES) {
      this.save.boost.lastChargeRegenMs = nowMs;
      return;
    }
    const elapsedSec = Math.max(0, (nowMs - this.save.boost.lastChargeRegenMs) / 1000);
    const gained = Math.floor(elapsedSec / BALANCE.BOOST_CHARGE_REGEN_SEC);
    if (gained > 0) {
      this.save.boost.chargesRemaining = Math.min(
        BALANCE.MAX_BOOST_CHARGES,
        this.save.boost.chargesRemaining + gained,
      );
      this.save.boost.lastChargeRegenMs = nowMs;
    }
  }

  startLoop(): void {
    if (typeof document === 'undefined' || !document.hidden) {
      this.sound.setPaused(false);
    }
    if (this.rafId !== null || typeof requestAnimationFrame === 'undefined') return;
    this.lastFrameMs = performance.now();
    const tick = (nowPerf: number) => {
      this.rafId = requestAnimationFrame(tick);
      const rawDt = Math.min(0.25, Math.max(0, (nowPerf - this.lastFrameMs) / 1000));
      this.lastFrameMs = nowPerf;
      this.advanceRealTime(rawDt, Date.now());
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop(): void {
    this.sound.setPaused(true);
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Advances simulation using fixed timestep + render interpolation alpha.
   * Also callable directly in headless Vitest tests!
   */
  advanceRealTime(deltaSec: number, nowMs = Date.now()): void {
    this.accumulator += Math.min(0.5, deltaSec);
    let steps = 0;
    const maxSubsteps = 8;

    while (this.accumulator >= this.FIXED_DT && steps < maxSubsteps) {
      this.stepSimulationFixed(this.FIXED_DT, nowMs);
      this.accumulator -= this.FIXED_DT;
      steps++;
    }
    this.renderAlpha = this.accumulator / this.FIXED_DT;

    this.uiNotifyTimer += deltaSec;
    if (this.uiNotifyTimer >= 0.12) {
      this.uiNotifyTimer = 0;
      this.regenBoostCharges(nowMs);
      regenAdventureKeys(this.save, nowMs);
      this.emitUiNow();
    }

    this.autosaveTimer += deltaSec;
    if (this.autosaveTimer >= 10) {
      this.autosaveTimer = 0;
      void this.persistNow();
    }

    this.checkpointTimer += deltaSec;
    if (this.checkpointTimer >= 60) {
      this.checkpointTimer = 0;
      void this.submitLeaderboardCheckpoint();
    }
  }

  stepSimulationFixed(dt: number, nowMs = Date.now()): void {
    const runtime = this.getActiveRuntime();
    const stats = this.getActiveStats(nowMs);
    const cityNum = this.getActiveCityNumber();

    this.sim.step(runtime, this.activeTemplate, this.activeLayout, stats, cityNum, this.rng, dt, {
      onDishDelivered: (info) => {
        this.save.stats.ordersPrepared += info.isDouble ? 2 : 1;
        if (info.isInstant) this.save.stats.instantDishesMade += 1;
        if (info.quality === 'perfect') this.save.stats.perfectDishesMade += 1;
        if (info.quality === 'divine') this.save.stats.divineDishesMade += 1;
        if (info.deliveredByPet) this.save.stats.petDeliveries += 1;

        // Harvest activity points on every 5th order
        if (this.save.stats.ordersPrepared % 5 === 0) {
          this.save.events.activities.harvestPoints += 1;
        }

        // Potion shop ingredient drop!
        if (info.ingredientId && runtime.modeContext === 'potion_shop') {
          const ps = this.save.events.potionShop;
          const mult = 1;
          ps.ingredients[info.ingredientId] = (ps.ingredients[info.ingredientId] ?? 0) + mult;
        }
      },
      onTipCollected: ({ byPet }) => {
        this.save.stats.tipsCollected += 1;
        if (byPet) this.save.stats.petTipsCollected += 1;
      },
      onSound: (sfx) => this.sound.play(sfx),
    });

    // Tick Timed Adventure countdown when active
    if (this.save.events.activeView === 'adventure') {
      const advId = this.save.events.activeAdventureId;
      const res = tickTimedAdventure(
        this.save,
        advId,
        dt,
        stats.adventureKeyKeepChance,
        this.rng,
      );
      if (res.finished) {
        this.sound.play(res.won ? 'achievement' : 'error');
        this.pushToast(
          res.won
            ? 'Adventure Cleared! Chest rewards opened!'
            : 'Time expired! Upgrade gear or try again.',
          res.won ? 'reward' : 'warning',
        );
        this.emitSceneRebuild();
      }
    }

    this.save.rngState = this.rng.getState();
  }

  async persistNow(): Promise<void> {
    this.save.rngState = this.rng.getState();
    this.save.savedAtMs = Date.now();
    try {
      await this.storage.save(this.save);
    } catch {
      // Never crash gameplay on transient storage quota errors
    }
  }

  // =========================================================================
  // PLAYER GAMEPLAY ACTIONS
  // =========================================================================

  purchaseStation(stationIndex: number, buyModeOverride?: BuyMode): boolean {
    const runtime = this.getActiveRuntime();
    const stn = runtime.stations[stationIndex];
    const stnTpl = this.activeTemplate.stations[stationIndex];
    if (!stn || !stnTpl) return false;

    const maxLv = getStationMaxLevel(this.activeTemplate, runtime);
    const mode = buyModeOverride ?? this.save.settings.buyMode;
    const cityNum = this.getActiveCityNumber();
    const cash = d(runtime.cash);

    const plan = resolveStationPurchasePlan(
      stnTpl,
      stn,
      maxLv,
      cash,
      mode,
      cityNum,
      runtime.difficultyMultiplier,
    );

    if (!plan.canAfford || plan.levelsToBuy <= 0) {
      return false;
    }

    const nextCash = cash.sub(plan.totalCost);
    if (nextCash.lt(0)) return false; // Hard invariant: never allow negative cash
    runtime.cash = serializeDecimal(nextCash);

    if (plan.isUnlock) {
      stn.unlocked = true;
      stn.level = 1;
      this.save.stats.stationsUpgraded += 1;
      this.resetUpgradeCombo();
      this.sound.play('unlock');
      void this.native.impact('medium');
      this.sim.pushFeedback(runtime, {
        text: `${stnTpl.icon} UNLOCKED!`,
        worldPos: { ...stn.worldPos },
        heightOffset: 1.8,
        kind: 'milestone',
        maxAge: 1.6,
      });
    } else {
      const prevMilestones = countPassedMilestones(stn.level, maxLv);
      const prevSpeedMult = getStationSpeedMultiplier(stn.level, maxLv);
      stn.level = Math.min(maxLv, stn.level + plan.levelsToBuy);
      const newMilestones = countPassedMilestones(stn.level, maxLv);
      const gainedMilestones = Math.max(0, newMilestones - prevMilestones);

      this.save.stats.stationsUpgraded += plan.levelsToBuy;
      const comboStep = this.recordUpgradeCombo(stationIndex);

      if (gainedMilestones > 0) {
        const gemsEarned = gainedMilestones * BALANCE.MILESTONE_GEM_REWARD;
        this.save.gems += gemsEarned;
        this.save.events.activities.merchantTokens += gainedMilestones * 4;
        this.save.events.activities.raceStars += gainedMilestones;
        this.sound.play('milestone');
        void this.native.impact('medium');
        this.sim.pushFeedback(runtime, {
          text: `${
            getStationSpeedMultiplier(stn.level, maxLv) > prevSpeedMult ? '⚡ SPEED ×2' : '×2 PROFIT'
          }! +${gemsEarned}💎`,
          subtext: `Lv ${stn.level} Milestone`,
          worldPos: { ...stn.worldPos },
          heightOffset: 2.0,
          kind: 'gem',
          maxAge: 1.8,
        });
      } else {
        this.sound.play('upgrade', { combo: comboStep });
        void this.native.impact('light');
      }
    }

    // Check Major Event milestones or stage advance
    if (this.save.events.activeView === 'major_event') {
      const evRes = evaluateMajorEventProgress(this.save, this.save.events.activeMajorEventId);
      for (const lbl of evRes.newlyClaimedLabels) {
        this.pushToast(`Event Milestone: ${lbl}!`, 'reward');
      }
      if (evRes.stageAdvanced) {
        this.pushToast('Stage Complete! Advancing to next Citadel venue!', 'reward');
        this.emitSceneRebuild();
      } else if (evRes.completedEvent) {
        this.pushToast('Event Mastered! Next Difficulty Unlocked!', 'reward');
      }
    }

    this.emitUiNow();
    return true;
  }

  purchaseRestaurantUpgrade(upgradeId: string): boolean {
    const runtime = this.getActiveRuntime();
    if (runtime.purchasedUpgradeIds.includes(upgradeId)) return false;

    const upg = this.activeTemplate.upgrades.find((u) => u.id === upgradeId);
    if (!upg) return false;

    // Station-specific upgrade requires that station to be unlocked first
    if (upg.stationIndex !== undefined && !runtime.stations[upg.stationIndex]?.unlocked) {
      return false;
    }

    const cost = getRestaurantUpgradeCost(
      upg,
      this.getActiveCityNumber(),
      runtime.difficultyMultiplier,
    );
    const cash = d(runtime.cash);
    if (cash.lt(cost)) return false;

    runtime.cash = serializeDecimal(cash.sub(cost));
    runtime.purchasedUpgradeIds.push(upgradeId);

    switch (upg.kind) {
      case 'hire_chef': {
        runtime.chefCount += upg.value;
        runtime.hiredAnyStaffHere = true;
        this.save.stats.employeesHired += upg.value;
        for (let i = 0; i < upg.value; i++) {
          const home =
            this.activeLayout.chefHomePositions[
              (runtime.chefCount + i) % this.activeLayout.chefHomePositions.length
            ] ?? { x: 0, z: -0.5 };
          runtime.workers.push(
            createWorker('chef', `Chef #${runtime.chefCount}`, home, '#f97316', null),
          );
        }
        break;
      }
      case 'hire_waiter': {
        runtime.waiterCount += upg.value;
        runtime.hiredAnyStaffHere = true;
        this.save.stats.employeesHired += upg.value;
        for (let i = 0; i < upg.value; i++) {
          const home =
            this.activeLayout.waiterHomePositions[
              (runtime.waiterCount + i) % this.activeLayout.waiterHomePositions.length
            ] ?? { x: 0, z: 1.5 };
          runtime.workers.push(
            createWorker('waiter', `Server #${runtime.waiterCount}`, home, '#0ea5e9', null),
          );
        }
        break;
      }
      case 'hire_cashier': {
        runtime.cashierCount += upg.value;
        runtime.hiredAnyStaffHere = true;
        this.save.stats.employeesHired += upg.value;
        const home = this.activeLayout.waiterHomePositions[0] ?? { x: 0, z: 1.0 };
        runtime.workers.push(
          createWorker('cashier', `Cashier #${runtime.cashierCount}`, home, '#10b981', null),
        );
        break;
      }
      case 'add_customer':
      case 'add_table': {
        runtime.customerCapacity = Math.min(
          this.activeLayout.slots.length,
          runtime.customerCapacity + upg.value,
        );
        if (upg.kind === 'add_table') runtime.tableCount += 1;
        this.sim.syncLayoutSlots(runtime, this.activeLayout);
        break;
      }
      case 'add_machine': {
        if (upg.stationIndex !== undefined) {
          const stn = runtime.stations[upg.stationIndex];
          const stnTpl = this.activeTemplate.stations[upg.stationIndex];
          if (stn && stnTpl) {
            stn.machines = Math.min(stnTpl.maxMachines, stn.machines + upg.value);
          }
        }
        break;
      }
      case 'station_profit': {
        if (upg.stationIndex !== undefined && runtime.stations[upg.stationIndex]) {
          runtime.stations[upg.stationIndex].profitMultiplier *= upg.value;
        }
        break;
      }
      case 'global_profit': {
        runtime.globalProfitMult *= upg.value;
        break;
      }
      case 'worker_speed': {
        runtime.workerSpeedMult += upg.value;
        break;
      }
      case 'cook_speed': {
        runtime.cookSpeedMult += upg.value;
        break;
      }
    }

    this.sound.play('upgrade');
    void this.native.impact('medium');
    this.emitUiNow();
    return true;
  }

  canRenovateMainRestaurant(): boolean {
    if (this.save.events.activeView !== 'main') return false;
    return isRestaurantComplete(this.activeTemplate, this.save.mainRestaurant);
  }

  renovateMainRestaurant(): RenovationSummary | null {
    if (!this.canRenovateMainRestaurant()) return null;

    const prevTemplate = this.activeTemplate;
    const prevWasSolo = !this.save.mainRestaurant.hiredAnyStaffHere;
    const { city: currentCity } = getCityByNumber(this.save.cityNumber);
    const isFinalInCity = this.save.restaurantStageIndex + 1 >= currentCity.restaurantIds.length;

    let smallBoxesEarned = BALANCE.RENOVATION_SMALL_BOXES_BY_TIER[prevTemplate.tier] ?? 1;
    let gemsEarned = 5;

    this.save.stats.restaurantsRenovated += 1;
    if (prevWasSolo) this.save.stats.soloRestaurantsFinished += 1;
    this.save.events.activities.raceStars += 5;

    if (isFinalInCity) {
      this.save.cityNumber += 1;
      this.save.restaurantStageIndex = 0;
      this.save.stats.citiesCompleted += 1;
      smallBoxesEarned = BALANCE.CITY_TRAVEL_SMALL_BOXES;
      gemsEarned = BALANCE.CITY_TRAVEL_BONUS_GEMS;
    } else {
      this.save.restaurantStageIndex += 1;
    }

    this.save.boxes.small = (this.save.boxes.small ?? 0) + smallBoxesEarned;
    this.save.gems += gemsEarned;

    const { city: nextCity } = getCityByNumber(this.save.cityNumber);
    const nextTemplateId = nextCity.restaurantIds[this.save.restaurantStageIndex] ?? nextCity.restaurantIds[0];
    const nextTemplate = getRestaurantTemplate(nextTemplateId);
    const stats = computePlayerStats(this.save, 0, Date.now());

    const { runtime } = createInitialRestaurantRuntime({
      template: nextTemplate,
      cityNumber: this.save.cityNumber,
      restaurantStageIndex: this.save.restaurantStageIndex,
      startingCash: stats.startingCash,
      modeContext: 'main',
      difficultyMultiplier: 1,
      equippedPets: getEquippedPetInstances(this.save),
    });

    this.save.mainRestaurant = runtime;

    const summary: RenovationSummary = {
      isCityFlight: isFinalInCity,
      previousRestaurantName: prevTemplate.name,
      nextRestaurantName: nextTemplate.name,
      nextCityName: nextCity.name,
      nextCityNumber: this.save.cityNumber,
      smallBoxesEarned,
      gemsEarned,
    };

    this.lastRenovationSummary = summary;
    this.sound.play(isFinalInCity ? 'city_flight' : 'renovate');
    void this.native.impact('heavy');
    this.emitSceneRebuild();
    void this.persistNow();
    void this.submitLeaderboardCheckpoint();
    return summary;
  }

  // ---------- Active Skills, Tips & Boost ----------

  tapTip(tipId: string): boolean {
    const runtime = this.getActiveRuntime();
    const collected = this.sim.collectTipById(runtime, tipId, {
      onTipCollected: ({ byPet }) => {
        this.save.stats.tipsCollected += 1;
        if (byPet) this.save.stats.petTipsCollected += 1;
      },
      onSound: (s) => this.sound.play(s),
    });
    if (collected) {
      void this.native.impact('light');
      this.emitUiNow();
      return true;
    }
    return false;
  }

  collectAllTipsManual(): boolean {
    const runtime = this.getActiveRuntime();
    const n = this.sim.collectAllTips(runtime, false, {
      onTipCollected: () => {
        this.save.stats.tipsCollected += 1;
      },
      onSound: (s) => this.sound.play(s),
    });
    if (n > 0) {
      void this.native.impact('light');
      this.emitUiNow();
      return true;
    }
    return false;
  }

  activateBoostCharge(): boolean {
    const now = Date.now();
    this.regenBoostCharges(now);
    if (this.save.boost.chargesRemaining <= 0) return false;

    const stats = this.getActiveStats(now);
    this.save.boost.chargesRemaining -= 1;
    const baseTime = Math.max(now, this.save.boost.activeUntilMs);
    this.save.boost.activeUntilMs = baseTime + stats.boostDurationSec * 1000;
    this.sound.play('boost');
    void this.native.impact('medium');
    this.pushToast(`Profit Boost active for +${Math.round(stats.boostDurationSec / 60)}m!`, 'reward');
    this.emitUiNow();
    return true;
  }

  activatePopularDish(stationIndex: number): boolean {
    const runtime = this.getActiveRuntime();
    if (runtime.simTime < runtime.popularDishCooldownEndsAt) return false;
    if (!runtime.stations[stationIndex]?.unlocked) return false;
    runtime.popularDishStationIndex = stationIndex;
    runtime.popularDishEndsAt = runtime.simTime + BALANCE.POPULAR_DISH_DURATION_SEC;
    runtime.popularDishCooldownEndsAt = runtime.simTime + BALANCE.POPULAR_DISH_COOLDOWN_SEC;
    this.save.stats.popularDishesUsed += 1;
    this.sound.play('boost');
    this.pushToast(`Popular Dish: ${this.activeTemplate.stations[stationIndex].name}!`, 'info');
    this.emitUiNow();
    return true;
  }

  inviteHelperChef(): boolean {
    const runtime = this.getActiveRuntime();
    if (runtime.simTime < runtime.helperCooldownEndsAt) return false;
    runtime.helperCooldownEndsAt = runtime.simTime + BALANCE.HELPER_COOLDOWN_SEC;
    const home = this.activeLayout.chefHomePositions[1] ?? { x: 1, z: -0.5 };
    runtime.workers.push(
      createWorker(
        'helper',
        'Guest Star Chef',
        home,
        '#a855f7',
        runtime.simTime + BALANCE.HELPER_DURATION_SEC,
      ),
    );
    this.save.stats.helpersInvited += 1;
    this.sound.play('boost');
    this.pushToast('Guest Star Chef joined your kitchen for 4 minutes!', 'reward');
    this.emitUiNow();
    return true;
  }

  claimVipInvestor(): boolean {
    const runtime = this.getActiveRuntime();
    if (!runtime.investorAvailable) return false;
    runtime.investorAvailable = false;
    runtime.investorCooldownTimer = BALANCE.INVESTOR_COOLDOWN_SEC;

    if (runtime.investorKind === 'gems') {
      const g = Number(runtime.investorOfferValue) || BALANCE.INVESTOR_BASE_GEMS;
      this.save.gems += g;
      this.pushToast(`VIP Investor gifted +${g} Gems!`, 'reward');
    } else {
      const cashAdd = d(runtime.investorOfferValue);
      runtime.cash = serializeDecimal(d(runtime.cash).add(cashAdd));
      runtime.totalCashEarnedHere = serializeDecimal(d(runtime.totalCashEarnedHere).add(cashAdd));
      this.pushToast('VIP Investor funded your restaurant!', 'reward');
    }
    this.sound.play('milestone');
    void this.native.impact('medium');
    this.emitUiNow();
    return true;
  }

  // ---------- Meta Actions (Gear, Boxes, Pets, Vault, Achievements) ----------

  equipGear(instanceId: string, slot?: EquippedSlotKey): boolean {
    const ok = equipGearItem(this.save, instanceId, slot);
    if (ok) {
      this.sound.play('tap');
      this.emitSceneRebuild();
    }
    return ok;
  }

  unequipGear(slot: EquippedSlotKey): void {
    unequipGearSlot(this.save, slot);
    this.sound.play('tap');
    this.emitSceneRebuild();
  }

  salvageGear(targetId: string, fodderIds: string[]) {
    const res = salvageGearIntoTarget(this.save, targetId, fodderIds);
    if (res.itemsConsumed > 0) {
      this.sound.play(res.levelsGained > 0 ? 'milestone' : 'upgrade');
      this.emitUiNow();
    }
    return res;
  }

  forgeGearBlueprint(bpId: string) {
    const crafted = forgeBlueprint(this.save, bpId);
    if (crafted) {
      this.sound.play('achievement');
      this.pushToast('Blueprint forged into wearable gear!', 'reward');
      this.emitUiNow();
    }
    return crafted;
  }

  buyLootBox(boxType: LootBoxType, qty = 1): boolean {
    const ok = buyBoxWithGems(this.save, boxType, qty);
    if (ok) {
      this.sound.play('upgrade');
      this.emitUiNow();
    }
    return ok;
  }

  openLootBoxes(boxType: LootBoxType, qty: number): LootRewardItem[] {
    const items = openBoxes(this.save, boxType, qty, this.rng);
    if (items.length > 0) {
      this.sound.play('box');
      void this.native.impact('medium');
      this.emitUiNow();
    }
    return items;
  }

  hatchEgg(rarity: Exclude<Rarity, 'mythic'>, foodAmount: number) {
    const res = feedEggToHatch(this.save, rarity, foodAmount, this.rng);
    if (res.hatchedPet) {
      this.sound.play('achievement');
      this.pushToast('New Companion Pet hatched!', 'reward');
      this.emitSceneRebuild();
    } else if (res.foodSpent > 0) {
      this.sound.play('upgrade');
      this.emitUiNow();
    }
    return res;
  }

  levelPet(petId: string, foodAmount: number) {
    const res = feedPetLevel(this.save, petId, foodAmount);
    if (res.foodSpent > 0) {
      this.sound.play(res.levelsGained > 0 ? 'milestone' : 'upgrade');
      this.emitUiNow();
    }
    return res;
  }

  mergePlayerPets(primaryId: string, fodderIds: [string, string]): boolean {
    const ok = mergePets(this.save, primaryId, fodderIds);
    if (ok) {
      this.sound.play('achievement');
      this.pushToast('Companion evolved to higher rarity!', 'reward');
      this.emitSceneRebuild();
    }
    return ok;
  }

  mergePlayerEggs(rarity: Exclude<Rarity, 'mythic'>): boolean {
    const ok = mergeEggs(this.save, rarity);
    if (ok) {
      this.sound.play('achievement');
      this.emitUiNow();
    }
    return ok;
  }

  equipPlayerPet(petId: string, slot: 0 | 1): boolean {
    const ok = equipPet(this.save, petId, slot);
    if (ok) {
      this.sound.play('tap');
      this.emitSceneRebuild();
    }
    return ok;
  }

  unequipPlayerPet(slot: 0 | 1): void {
    unequipPet(this.save, slot);
    this.sound.play('tap');
    this.emitSceneRebuild();
  }

  unlockVault(id: string): boolean {
    const ok = unlockVaultArtifact(this.save, id);
    if (ok) {
      this.sound.play('unlock');
      this.emitUiNow();
    }
    return ok;
  }

  upgradeVault(id: string): boolean {
    const ok = upgradeVaultArtifact(this.save, id);
    if (ok) {
      this.sound.play('upgrade');
      this.emitUiNow();
    }
    return ok;
  }

  claimAchievement(id: string): boolean {
    const res = claimAchievementTier(this.save, id);
    if (res) {
      this.sound.play('achievement');
      this.pushToast(`+${res.gems} Gems · +${res.stars}★`, 'reward');
      this.emitUiNow();
      return true;
    }
    return false;
  }

  claimRank(rank: number): boolean {
    const res = claimChefRankReward(this.save, rank);
    if (res) {
      this.sound.play('achievement');
      this.pushToast(`Chef Rank ${res.rank}: ${res.title} claimed!`, 'reward');
      this.emitUiNow();
      return true;
    }
    return false;
  }

  // ---------- Events, Adventures & Potion Shop ----------

  switchToMainRestaurant(): void {
    this.save.events.activeView = 'main';
    this.emitSceneRebuild();
  }

  openMajorEvent(eventId: MajorEventId, difficulty?: EventDifficulty): void {
    const stats = this.getActiveStats();
    enterMajorEvent(this.save, eventId, difficulty, stats.startingCash);
    this.emitSceneRebuild();
  }

  restartMajorEvent(eventId: MajorEventId): void {
    resetMajorEventRun(this.save, eventId);
    this.openMajorEvent(eventId);
  }

  beginTimedAdventure(adventureId: AdventureId, level: number): boolean {
    const stats = this.getActiveStats();
    const ok = startTimedAdventure(this.save, adventureId, level, stats.startingCash);
    if (ok) {
      this.sound.play('boost');
      this.emitSceneRebuild();
    }
    return ok;
  }

  openPotionShop(): void {
    enterPotionShop(this.save);
    this.emitSceneRebuild();
  }

  brewPotion(recipeId: string): boolean {
    const ok = brewOrUpgradePotion(this.save, recipeId);
    if (ok) {
      this.sound.play('boost');
      this.emitUiNow();
    }
    return ok;
  }

  bottlePotion(recipeId: string): boolean {
    const ok = bottleActivePotion(this.save, recipeId);
    if (ok) {
      this.sound.play('upgrade');
      this.pushToast('Potion bottled for Main Game use!', 'reward');
      this.emitUiNow();
    }
    return ok;
  }

  drinkBottledPotion(recipeId: string, level: number): boolean {
    const ok = consumeBottledPotion(this.save, recipeId, level, Date.now());
    if (ok) {
      this.sound.play('boost');
      this.pushToast('Bottled elixir activated!', 'reward');
      this.emitUiNow();
    }
    return ok;
  }

  upgradeArcane(id: string): boolean {
    const wasUnlocked = this.save.events.potionShop.arcaneVaultUnlocked.includes(id);
    const ok = upgradeArcaneVault(this.save, id);
    if (ok) {
      this.sound.play(wasUnlocked ? 'upgrade' : 'unlock');
      this.emitUiNow();
    }
    return ok;
  }

  purchaseMerchantOffer(offerId: string): boolean {
    const ok = buyMerchantOffer(this.save, offerId);
    if (ok) {
      this.sound.play('milestone');
      this.emitUiNow();
    }
    return ok;
  }

  claimRaceTier(): boolean {
    const ok = claimNextRaceReward(this.save);
    if (ok) {
      this.sound.play('milestone');
      this.emitUiNow();
    }
    return ok;
  }

  claimHarvestTier(): boolean {
    const ok = claimNextHarvestReward(this.save);
    if (ok) {
      this.sound.play('milestone');
      this.emitUiNow();
    }
    return ok;
  }

  // ---------- Clubs, Leaderboards & Settings ----------

  foundClub(name: string, tag: string, isPublic: boolean) {
    const res = createClubLocal(this.save, name, tag, isPublic);
    if (res.ok && this.save.social.club) {
      this.sound.play('achievement');
      void this.socialClient.syncClubState(this.save.social.club);
      this.emitUiNow();
    }
    return res;
  }

  joinClub(club: NonNullable<GameSaveData['social']['club']>) {
    const res = joinClubByObject(this.save, club);
    if (res.ok && this.save.social.club) {
      this.sound.play('unlock');
      void this.socialClient.syncClubState(this.save.social.club);
      this.emitUiNow();
    }
    return res;
  }

  exitClub(): void {
    leaveClub(this.save);
    this.emitUiNow();
  }

  donateGearToClub(instanceIds: string[]) {
    const prevLevel = this.save.social.club?.level ?? 1;
    const res = salvageGearToClub(this.save, instanceIds);
    if (res.itemsConsumed > 0 && this.save.social.club) {
      this.sound.play(res.newClubLevel > prevLevel ? 'milestone' : 'upgrade');
      void this.socialClient.syncClubState(this.save.social.club);
      this.emitUiNow();
    }
    return res;
  }

  claimClubReward(level: number): string | null {
    const label = claimClubLevelReward(this.save, level);
    if (label) {
      this.sound.play('achievement');
      this.pushToast(`Club Lv ${level}: ${label}!`, 'reward');
      this.emitUiNow();
    }
    return label;
  }

  async submitLeaderboardCheckpoint() {
    const nonce = this.save.social.lastChallengeNonce ?? `init_${Date.now()}`;
    const integrity = await this.native.requestPlayIntegrityToken(nonce);
    if (integrity.token) this.save.social.playIntegrityAttested = true;
    const res = await this.socialClient.submitCheckpoint(this.save, 0, integrity.token);
    this.emitUiNow();
    return res;
  }

  updateSettings(patch: Partial<SettingsState>): void {
    const prev = this.save.settings;
    const next: SettingsState = { ...prev, ...patch };

    if ('soundEnabled' in patch) {
      next.soundEnabled =
        typeof patch.soundEnabled === 'boolean'
          ? patch.soundEnabled
          : typeof prev.soundEnabled === 'boolean'
            ? prev.soundEnabled
            : true;
    }

    if ('hapticsEnabled' in patch) {
      next.hapticsEnabled =
        typeof patch.hapticsEnabled === 'boolean'
          ? patch.hapticsEnabled
          : typeof prev.hapticsEnabled === 'boolean'
            ? prev.hapticsEnabled
            : true;
    }

    if ('sfxVolume' in patch) {
      if (typeof patch.sfxVolume === 'number' && Number.isFinite(patch.sfxVolume)) {
        next.sfxVolume = Math.min(1, Math.max(0, patch.sfxVolume));
      } else {
        next.sfxVolume =
          typeof prev.sfxVolume === 'number' && Number.isFinite(prev.sfxVolume)
            ? Math.min(1, Math.max(0, prev.sfxVolume))
            : DEFAULT_SFX_VOLUME;
      }
    }

    if ('ambientVolume' in patch) {
      if (typeof patch.ambientVolume === 'number' && Number.isFinite(patch.ambientVolume)) {
        next.ambientVolume = Math.min(1, Math.max(0, patch.ambientVolume));
      } else {
        next.ambientVolume =
          typeof prev.ambientVolume === 'number' && Number.isFinite(prev.ambientVolume)
            ? Math.min(1, Math.max(0, prev.ambientVolume))
            : DEFAULT_AMBIENT_VOLUME;
      }
    }

    if ('ambientEnabled' in patch) {
      if (typeof patch.ambientEnabled === 'boolean') {
        next.ambientEnabled = patch.ambientEnabled;
      } else {
        next.ambientEnabled =
          typeof prev.ambientEnabled === 'boolean'
            ? prev.ambientEnabled
            : DEFAULT_AMBIENT_ENABLED;
      }
    }

    this.save.settings = next;
    this.syncAudioSettings();
    this.native.setHapticsEnabled(this.save.settings.hapticsEnabled);
    this.emitUiNow();
    void this.persistNow();
  }

  updateDisplayName(name: string): void {
    const clean = name.trim().slice(0, 20);
    if (clean.length >= 2) {
      this.save.social.displayName = clean;
      this.emitUiNow();
      void this.persistNow();
    }
  }

  exportSave(): string {
    return exportSaveToJson(this.save);
  }

  async importSave(json: string): Promise<boolean> {
    const parsed = importSaveFromJson(json);
    if (!parsed) {
      this.sound.play('error');
      return false;
    }
    this.save = parsed;
    this.rng.setState(parsed.rngState);
    this.syncAudioSettings();
    this.native.setHapticsEnabled(this.save.settings.hapticsEnabled);
    this.resetUpgradeCombo();
    await this.persistNow();
    this.emitSceneRebuild();
    this.pushToast('Save imported successfully!', 'reward');
    return true;
  }

  async hardReset(): Promise<void> {
    await this.storage.clear();
    this.save = createNewGameSave();
    this.rng.setState(this.save.rngState);
    this.syncAudioSettings();
    this.native.setHapticsEnabled(this.save.settings.hapticsEnabled);
    this.resetUpgradeCombo();
    await this.persistNow();
    this.emitSceneRebuild();
    this.pushToast('Started a fresh culinary empire!', 'info');
  }

  getCompletionPercent(): number {
    return getRestaurantCompletionPercent(this.activeTemplate, this.getActiveRuntime());
  }
}
