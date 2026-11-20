/**
 * Rich Procedural Web Audio Engine for Sizzle Empire (M4).
 *
 * Features:
 * - Shared master bus: sfxBusGain + ambientBusGain -> masterGain (0.95) -> DynamicsCompressorNode -> destination
 * - Per-context WeakMap-cached Mulberry32 white & Paul Kellet 7-stage pink noise buffers + BiquadFilterNode shaping
 * - 21 genuinely distinct warm layered harmonic + filtered-noise SFX recipes (zero raw sawtooth/square waves)
 * - Calibrated rising major pentatonic hold-to-upgrade combo scale (combo 0..24) + natural coin pitch jitter
 * - Per-SFX backwards-clock-safe cooldowns + race-free logical voice accounting (24 voices / 64 source nodes + LOD)
 * - Cozy procedural 96 BPM C-major bistro ambient loop with overlap-safe fanfare ducking
 * - Reliable mobile gesture unlock (capture-phase window listeners + 1-sample silent buffer + async W3C reconciliation)
 * - Unified OfflineAudioContext self-test with deterministic RBJ-biquad analytical Node fallback
 * - 100% offline, zero external dependencies, 100% Node-safe for Vitest.
 */

import { BistroAmbientLoop } from './ambientLoop';
import {
  MASTER_GAIN_CEILING,
  cancelScheduledValuesSafe,
  createAudioBusGraph,
  disposeAudioBusGraph,
  linearRampSafe,
  readContextState,
  safeCurrentTime,
  setParamValueSafe,
} from './audioGraph';
import {
  LOD_TRIM_THRESHOLD,
  MAX_ACTIVE_SOURCE_NODES,
  MAX_CONCURRENT_VOICES,
  clampPitchMult,
  clampUnit,
  isResumableContextState,
  type AudioBusGraph,
  type OfflineAudioSampleResult,
  type SfxName,
  type SfxPlayOptions,
  type SoundEngineStateSummary,
} from './audioTypes';
import { clearCachedNoiseBank } from './noiseBuffers';
import {
  SFX_COOLDOWN_MS,
  analyzeSamples,
  buildSfxRecipe,
  computeNaturalDuration,
  isValidSfxName,
  renderRecipeAnalytical,
  resolveDefaultPitchJitter,
  scheduleSfxRecipe,
} from './sfxRecipes';

export type {
  OfflineAudioSampleResult,
  SfxName,
  SfxPlayOptions,
  SoundEngineStateSummary,
} from './audioTypes';

const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;
const OFFLINE_SAMPLE_RATE = 44100;

function resolveOfflineAudioContextCtor(): typeof OfflineAudioContext | undefined {
  if (typeof window !== 'undefined') {
    const winCtor =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (winCtor) return winCtor;
  }
  const globalObj = globalThis as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  return globalObj.OfflineAudioContext ?? globalObj.webkitOfflineAudioContext;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private bus: AudioBusGraph | null = null;
  private readonly ambient = new BistroAmbientLoop();

  private enabled = true;
  private sfxVolume = 0.85;
  private ambientEnabled = true;
  private ambientVolume = 0.35;
  private paused = false;
  private unlocked = false;
  private silentBufferUnlocked = false;
  private suspendedByPause = false;
  private disposed = false;

  private pendingGestureUnlock = false;
  private gestureUnlockCount = 0;
  private resumeSeq = 0;
  private resumeInFlight = false;
  private suspendSeq = 0;
  private suspendInFlight = false;
  private lastMasterGain = MASTER_GAIN_CEILING;

  private contextGeneration = 0;
  private activeVoices = 0;
  private activeSourceNodes = 0;
  private noiseOffsetCursor = 0;
  private readonly lastPlayedAt = new Map<SfxName, number>();

  private boundWindow: Window | null = null;

  private readonly onUserGesture = (): void => {
    if (!this.enabled || this.paused) return;
    this.unlock();
  };

  constructor() {
    this.attachGestureListeners();
  }

  setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = Boolean(enabled);
    this.updateMasterBusGain();

    if (!this.enabled) {
      this.pendingGestureUnlock = false;
      this.gestureUnlockCount = 0;
      this.ambient.stop(true);
      return;
    }

    if (typeof window === 'undefined' || !this.ctx || this.paused) return;
    const state = readContextState(this.ctx);
    if (isResumableContextState(state) && (this.unlocked || this.suspendedByPause)) {
      if (!wasEnabled || !this.resumeInFlight) {
        this.suspendedByPause = false;
        this.pendingGestureUnlock = true;
        this.gestureUnlockCount = 0;
        this.resumeContext(this.ctx);
      }
    } else if (state === 'running') {
      this.syncAmbientLoop();
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampUnit(volume, this.sfxVolume);
    if (this.bus?.sfxBusGain && this.ctx) {
      const now = safeCurrentTime(this.ctx);
      const param = this.bus.sfxBusGain.gain;
      cancelScheduledValuesSafe(param, now);
      setParamValueSafe(param, this.sfxVolume, now);
    }
  }

  setAmbientEnabled(enabled: boolean): void {
    this.ambientEnabled = Boolean(enabled);
    if (!this.ambientEnabled) {
      this.ambient.stop(true);
    } else {
      this.syncAmbientLoop();
    }
  }

  setAmbientVolume(volume: number): void {
    this.ambientVolume = clampUnit(volume, this.ambientVolume);
    if (this.ambientVolume <= 0) {
      this.ambient.stop(true);
    } else if (this.ambient.isRunning()) {
      this.ambient.setVolume(this.ambientVolume);
    } else {
      this.syncAmbientLoop();
    }
  }

  setPaused(paused: boolean): void {
    const wasPaused = this.paused;
    this.paused = Boolean(paused);
    if (typeof window === 'undefined') return;

    if (this.paused) {
      this.pendingGestureUnlock = false;
      this.gestureUnlockCount = 0;
      this.ambient.stop(true);
      if (!this.ctx) return;
      try {
        if (readContextState(this.ctx) === 'running') {
          this.unlocked = true;
          this.suspendedByPause = true;
          if (!this.suspendInFlight) {
            this.suspendContext(this.ctx);
          }
        }
      } catch {
        // Ignore state transition errors on restricted WebViews.
      }
      return;
    }

    if (!this.ctx) return;
    try {
      const state = readContextState(this.ctx);
      if (
        this.enabled &&
        isResumableContextState(state) &&
        (this.unlocked || this.suspendedByPause)
      ) {
        if (wasPaused || !this.resumeInFlight) {
          this.suspendedByPause = false;
          this.pendingGestureUnlock = true;
          this.gestureUnlockCount = 0;
          this.resumeContext(this.ctx);
        }
      } else if (state === 'running') {
        this.suspendedByPause = false;
        this.syncAmbientLoop();
      }
    } catch {
      // Ignore state transition errors on restricted WebViews.
    }
  }

  unlock(): void {
    if (typeof window === 'undefined' || !this.enabled || this.paused) return;
    this.disposed = false;
    const ctx = this.ensureContext(false);
    if (!ctx) {
      this.attachGestureListeners();
      return;
    }

    const state = readContextState(ctx);
    if (isResumableContextState(state)) {
      this.pendingGestureUnlock = true;
      this.gestureUnlockCount = 0;
      const resumeInitiated = this.resumeContext(ctx);
      if (this.disposed || this.ctx !== ctx) return;
      if (!resumeInitiated && readContextState(ctx) !== 'running') {
        this.attachGestureListeners();
        return;
      }
    }

    if (!this.silentBufferUnlocked) {
      try {
        if (
          typeof ctx.createBuffer === 'function' &&
          typeof ctx.createBufferSource === 'function'
        ) {
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          if (this.disposed || this.ctx !== ctx) return;
          this.silentBufferUnlocked = true;
          this.unlocked = true;
        }
      } catch {
        // Ignore unlock errors on restricted browsers.
      }
    }

    if (this.disposed || this.ctx !== ctx) return;

    if (readContextState(ctx) === 'running') {
      this.reconcileRunningContext(ctx);
      if (!this.silentBufferUnlocked) {
        this.attachGestureListeners();
      }
    } else {
      this.attachGestureListeners();
    }
  }

  play(sfx: SfxName, opts?: SfxPlayOptions): void {
    if (
      this.disposed ||
      !this.enabled ||
      this.paused ||
      this.sfxVolume <= 0 ||
      typeof window === 'undefined' ||
      !isValidSfxName(sfx)
    ) {
      return;
    }

    const intensity = clampUnit(opts?.intensity ?? 1, 1);
    if (intensity <= 0) return;

    const combo =
      typeof opts?.combo === 'number' && Number.isFinite(opts.combo)
        ? Math.min(24, Math.max(0, Math.floor(opts.combo)))
        : 0;

    const pitchMult =
      typeof opts?.pitchJitter === 'number' &&
      Number.isFinite(opts.pitchJitter) &&
      opts.pitchJitter > 0
        ? clampPitchMult(opts.pitchJitter)
        : resolveDefaultPitchJitter(sfx);

    // CRITICAL: reset closed context strictly BEFORE checking polyphony cap.
    this.resetIfClosed();
    if (this.activeVoices >= MAX_CONCURRENT_VOICES) return;
    if (this.activeSourceNodes >= MAX_ACTIVE_SOURCE_NODES) return;

    const nowMs = Date.now();
    const cooldownMs = SFX_COOLDOWN_MS[sfx];
    if (cooldownMs !== undefined) {
      const prevMs = this.lastPlayedAt.get(sfx);
      if (prevMs !== undefined && nowMs >= prevMs && nowMs - prevMs < cooldownMs) {
        return;
      }
    }

    const ctx = this.ensureContext(this.unlocked || this.suspendedByPause);
    if (!ctx) return;

    // Autoplay readiness guard: never schedule voices or burn cooldowns onto a suspended pre-gesture context.
    if (!this.canScheduleLiveAudio(ctx)) return;

    if (cooldownMs !== undefined) {
      this.lastPlayedAt.set(sfx, nowMs);
    }

    const recipe = buildSfxRecipe(sfx, combo, pitchMult);
    let baseTime: number;
    let destination: AudioNode;
    try {
      baseTime = safeCurrentTime(ctx);
      destination = this.bus ? this.bus.sfxInput : ctx.destination;
    } catch {
      return;
    }

    const gainScale = (this.bus && this.bus.usesBusSfxGain ? 1 : this.sfxVolume) * intensity;
    const generation = this.contextGeneration;
    const trimOptional = this.activeSourceNodes >= LOD_TRIM_THRESHOLD;

    let startedSources = 0;
    let endedSources = 0;
    let actuallyStarted = 0;
    let finalizing = true;
    let voiceReleased = false;

    this.activeVoices += 1;

    const releaseLogicalVoice = () => {
      if (voiceReleased) return;
      voiceReleased = true;
      if (generation === this.contextGeneration) {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const noiseOffsetStep = this.noiseOffsetCursor++;

    try {
      actuallyStarted = scheduleSfxRecipe(ctx, destination, recipe, {
        baseTime,
        gainScale,
        trimOptional,
        deterministicNoiseOffset: false,
        noiseOffsetStep,
        tracker: {
          canStartSource: () =>
            !this.disposed &&
            generation === this.contextGeneration &&
            this.activeSourceNodes < MAX_ACTIVE_SOURCE_NODES,
          onSourceStarted: () => {
            startedSources += 1;
            if (generation === this.contextGeneration) {
              this.activeSourceNodes += 1;
            }
          },
          onSourceEnded: () => {
            endedSources += 1;
            if (generation === this.contextGeneration) {
              this.activeSourceNodes = Math.max(0, this.activeSourceNodes - 1);
            }
            if (!finalizing && endedSources >= startedSources) {
              releaseLogicalVoice();
            }
          },
        },
      });
    } catch {
      actuallyStarted = 0;
    } finally {
      finalizing = false;
      if (startedSources === 0 || endedSources >= startedSources) {
        releaseLogicalVoice();
      }
    }

    if (!this.disposed && generation === this.contextGeneration && actuallyStarted > 0 && recipe.isFanfare) {
      this.ambient.duck(recipe.fanfareHoldSec ?? recipe.durationSec);
    }
  }

  getStateSummary(): SoundEngineStateSummary {
    const contextState = readContextState(this.ctx);
    const isClosed = contextState === 'closed';
    return {
      enabled: this.enabled,
      sfxVolume: this.sfxVolume,
      ambientEnabled: this.ambientEnabled,
      ambientVolume: this.ambientVolume,
      unlocked: !isClosed && (this.unlocked || contextState === 'running'),
      contextState,
      activeVoices: isClosed ? 0 : this.activeVoices,
    };
  }

  async renderOfflineSample(
    sfx: SfxName,
    durationSec?: number,
    opts?: SfxPlayOptions,
  ): Promise<OfflineAudioSampleResult> {
    if (!isValidSfxName(sfx)) {
      return { peak: 0, rms: 0, finite: true };
    }

    const intensity = clampUnit(opts?.intensity ?? 1, 1);
    if (intensity <= 0) {
      return { peak: 0, rms: 0, finite: true };
    }

    const combo =
      typeof opts?.combo === 'number' && Number.isFinite(opts.combo)
        ? Math.min(24, Math.max(0, Math.floor(opts.combo)))
        : 0;

    // Strictly deterministic unless pitchJitter is explicitly passed by caller.
    const pitchMult =
      typeof opts?.pitchJitter === 'number' &&
      Number.isFinite(opts.pitchJitter) &&
      opts.pitchJitter > 0
        ? clampPitchMult(opts.pitchJitter)
        : 1;

    const recipe = buildSfxRecipe(sfx, combo, pitchMult);
    const safeDuration =
      typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
        ? Math.min(4.0, Math.max(0.05, durationSec))
        : computeNaturalDuration(recipe);

    const sampleRate = OFFLINE_SAMPLE_RATE;
    const frameCount = Math.max(1, Math.ceil(safeDuration * sampleRate));

    const OfflineCtx = resolveOfflineAudioContextCtor();
    if (OfflineCtx) {
      try {
        const offlineCtx = new OfflineCtx(1, frameCount, sampleRate);
        const offlineBus = createAudioBusGraph(offlineCtx, {
          sfxVolume: 1,
          ambientVolume: 0,
          masterVolume: MASTER_GAIN_CEILING,
        });
        scheduleSfxRecipe(offlineCtx, offlineBus.sfxInput, recipe, {
          baseTime: 0,
          gainScale: intensity,
          trimOptional: false,
          deterministicNoiseOffset: true,
        });
        const rendered = await offlineCtx.startRendering();
        if (rendered && typeof rendered.getChannelData === 'function') {
          return analyzeSamples(rendered.getChannelData(0));
        }
      } catch {
        // Fall through to deterministic RBJ-biquad analytical PCM fallback.
      }
    }

    return analyzeSamples(renderRecipeAnalytical(recipe, frameCount, sampleRate, intensity));
  }

  dispose(): void {
    this.disposed = true;
    this.contextGeneration += 1;
    this.ambient.stop(true);
    this.detachGestureListeners();

    const prevCtx = this.ctx;
    this.ctx = null;

    disposeAudioBusGraph(this.bus);
    this.bus = null;
    clearCachedNoiseBank(prevCtx);

    this.activeVoices = 0;
    this.activeSourceNodes = 0;
    this.unlocked = false;
    this.silentBufferUnlocked = false;
    this.suspendedByPause = false;
    this.pendingGestureUnlock = false;
    this.gestureUnlockCount = 0;
    this.resumeSeq += 1;
    this.resumeInFlight = false;
    this.suspendSeq += 1;
    this.suspendInFlight = false;
    this.lastPlayedAt.clear();

    if (prevCtx) {
      try {
        if (prevCtx.state !== 'closed') {
          const closing = prevCtx.close();
          if (closing && typeof closing.catch === 'function') {
            void closing.catch(() => {});
          }
        }
      } catch {
        // Ignore state-getter or close errors on torn-down / hostile contexts.
      }
    }
  }

  private attachGestureListeners(): void {
    if (this.disposed || this.boundWindow !== null || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    try {
      for (const evt of GESTURE_EVENTS) {
        window.addEventListener(evt, this.onUserGesture, { capture: true, passive: true });
      }
      this.boundWindow = window;
    } catch {
      // Ignore listener attachment errors in restricted environments.
    }
  }

  private detachGestureListeners(): void {
    const win = this.boundWindow;
    if (!win) return;
    this.boundWindow = null;
    if (typeof win.removeEventListener !== 'function') return;
    for (const evt of GESTURE_EVENTS) {
      try {
        win.removeEventListener(evt, this.onUserGesture, true);
      } catch {
        // Ignore listener removal errors.
      }
    }
  }

  private shouldRunAmbient(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.enabled || !this.ambientEnabled || this.paused) return false;
    if (this.ambientVolume <= 0) return false;
    if (!this.ctx || !this.bus || !this.unlocked) return false;
    return readContextState(this.ctx) === 'running';
  }

  private syncAmbientLoop(): void {
    if (!this.shouldRunAmbient() || !this.ctx || !this.bus) {
      this.ambient.stop(true);
      return;
    }
    this.ambient.start(this.ctx, this.bus, this.ambientVolume);
  }

  private updateMasterBusGain(): void {
    const target = this.enabled ? MASTER_GAIN_CEILING : 0;
    if (!this.bus?.masterGain || !this.ctx) {
      this.lastMasterGain = target;
      return;
    }
    const now = safeCurrentTime(this.ctx);
    const param = this.bus.masterGain.gain;
    cancelScheduledValuesSafe(param, now);
    setParamValueSafe(param, this.lastMasterGain, now);
    linearRampSafe(param, target, now + 0.015);
    this.lastMasterGain = target;
  }

  private canScheduleLiveAudio(ctx: AudioContext): boolean {
    const state = readContextState(ctx);
    if (state === 'running') return true;
    if (
      this.pendingGestureUnlock &&
      !this.paused &&
      isResumableContextState(state) &&
      this.gestureUnlockCount < 2
    ) {
      this.gestureUnlockCount += 1;
      return true;
    }
    return false;
  }

  private reconcileRunningContext(ctx: AudioContext): void {
    this.pendingGestureUnlock = false;
    this.gestureUnlockCount = 0;
    this.unlocked = true;
    if (this.paused) {
      this.suspendedByPause = true;
      this.ambient.stop(true);
      if (!this.suspendInFlight) {
        this.suspendContext(ctx);
      }
    } else {
      this.suspendedByPause = false;
      if (this.silentBufferUnlocked) {
        this.detachGestureListeners();
      }
      this.updateMasterBusGain();
      this.syncAmbientLoop();
    }
  }

  private suspendContext(ctx: AudioContext): void {
    this.resumeSeq += 1;
    this.resumeInFlight = false;
    this.pendingGestureUnlock = false;
    this.gestureUnlockCount = 0;
    const seq = ++this.suspendSeq;
    this.suspendInFlight = true;
    try {
      const pending = ctx.suspend();
      if (pending && typeof pending.then === 'function') {
        pending.then(
          () => {
            if (this.ctx === ctx && seq === this.suspendSeq) {
              this.suspendInFlight = false;
            }
            try {
              if (
                this.ctx === ctx &&
                !this.paused &&
                this.enabled &&
                !this.resumeInFlight &&
                isResumableContextState(readContextState(ctx)) &&
                (this.unlocked || this.suspendedByPause)
              ) {
                this.suspendedByPause = false;
                this.resumeContext(ctx);
              }
            } catch {
              // Ignore audio context state errors during settlement.
            }
          },
          () => {
            if (this.ctx === ctx && seq === this.suspendSeq) {
              this.suspendInFlight = false;
            }
          },
        );
      } else if (this.ctx === ctx && seq === this.suspendSeq) {
        this.suspendInFlight = false;
      }
    } catch {
      if (this.ctx === ctx && seq === this.suspendSeq) {
        this.suspendInFlight = false;
      }
      // Ignore audio context pause errors on restricted platforms.
    }
  }

  private resumeContext(ctx: AudioContext): boolean {
    this.suspendSeq += 1;
    this.suspendInFlight = false;
    const seq = ++this.resumeSeq;
    this.resumeInFlight = true;
    if (!this.disposed && readContextState(ctx) !== 'running') {
      this.attachGestureListeners();
    }
    try {
      const pending = ctx.resume();
      if (pending && typeof pending.then === 'function') {
        const settle = () => {
          try {
            if (this.ctx !== ctx) return;
            const isLatest = seq === this.resumeSeq;
            const state = readContextState(ctx);
            if (isLatest) {
              this.resumeInFlight = false;
              this.pendingGestureUnlock = false;
              this.gestureUnlockCount = 0;
            }
            if (state === 'running') {
              this.reconcileRunningContext(ctx);
            } else if (isLatest) {
              this.unlocked = false;
              this.silentBufferUnlocked = false;
              this.attachGestureListeners();
            }
          } catch {
            // Ignore audio context state errors during settlement.
          }
        };
        pending.then(settle, settle);
      } else {
        if (this.ctx !== ctx || seq !== this.resumeSeq) return true;
        this.resumeInFlight = false;
        if (readContextState(ctx) === 'running') {
          this.reconcileRunningContext(ctx);
        }
      }
      return true;
    } catch {
      if (this.ctx === ctx && seq === this.resumeSeq) {
        this.resumeInFlight = false;
        this.pendingGestureUnlock = false;
        this.gestureUnlockCount = 0;
        if (readContextState(ctx) !== 'running') {
          this.unlocked = false;
          this.silentBufferUnlocked = false;
          this.attachGestureListeners();
        }
      }
      return false;
    }
  }

  private resetIfClosed(): void {
    if (!this.ctx) return;
    if (readContextState(this.ctx) !== 'closed') return;

    const oldCtx = this.ctx;
    this.ambient.stop(true);
    disposeAudioBusGraph(this.bus);
    this.bus = null;
    clearCachedNoiseBank(oldCtx);

    this.ctx = null;
    this.unlocked = false;
    this.silentBufferUnlocked = false;
    this.suspendedByPause = false;
    this.pendingGestureUnlock = false;
    this.gestureUnlockCount = 0;
    this.resumeSeq += 1;
    this.resumeInFlight = false;
    this.suspendSeq += 1;
    this.suspendInFlight = false;
    this.activeVoices = 0;
    this.activeSourceNodes = 0;
    this.contextGeneration += 1;

    if (!this.disposed) {
      this.attachGestureListeners();
    }
  }

  private ensureContext(allowResume: boolean): AudioContext | null {
    if (this.disposed || !this.enabled || typeof window === 'undefined') return null;
    this.resetIfClosed();

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
      const initialMaster = this.enabled ? MASTER_GAIN_CEILING : 0;
      this.lastMasterGain = initialMaster;
      this.bus = createAudioBusGraph(this.ctx, {
        sfxVolume: this.sfxVolume,
        ambientVolume: 0,
        masterVolume: initialMaster,
      });
    }

    const ctx = this.ctx;
    const state = readContextState(ctx);
    if (state === 'running') {
      this.unlocked = true;
      this.pendingGestureUnlock = false;
      this.gestureUnlockCount = 0;
      if (this.silentBufferUnlocked) {
        this.detachGestureListeners();
      }
      this.syncAmbientLoop();
    } else if (
      allowResume &&
      !this.pendingGestureUnlock &&
      !this.resumeInFlight &&
      !this.paused &&
      isResumableContextState(state)
    ) {
      this.resumeContext(ctx);
      if (this.disposed || this.ctx !== ctx) return null;
    }

    return this.ctx;
  }
}
