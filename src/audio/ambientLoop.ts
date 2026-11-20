/**
 * Cozy procedural bistro ambient loop (96 BPM, 8-bar C-major marimba/Rhodes progression)
 * with self-rescheduling recursive setTimeout lookahead, independent voice cap,
 * instant voice-stopper teardown, and overlap-safe / mid-duck-volume-safe fanfare ducking.
 *
 * Strictly warm 'sine' and 'triangle' oscillators — zero sawtooth/square waves.
 */

import {
  cancelScheduledValuesSafe,
  disconnectSafely,
  exponentialRampSafe,
  linearRampSafe,
  readContextState,
  safeCurrentTime,
  safeSampleRate,
  setParamValueSafe,
} from './audioGraph';
import {
  clampFilterFreq,
  clampFreq,
  clampGain,
  clampUnit,
  type AudioBusGraph,
  type WarmOscillatorType,
} from './audioTypes';

export const DUCK_FACTOR = 0.25;
export const DUCK_ATTACK_SEC = 0.045;
export const DUCK_RELEASE_SEC = 0.4;
export const MAX_AMBIENT_VOICES = 6;

const STEP_SEC = 0.3125; // 96 BPM eighth-note grid (64 steps = 20.0s 8-bar loop)
const STEPS_PER_BAR = 8;
const TOTAL_STEPS = 64;
const TICK_MS = 160;
const LOOKAHEAD_SEC = 0.28;
const STALL_GAP_SEC = 0.45;
const MAX_STEPS_PER_TICK = 2;

interface BistroBar {
  bass: number;
  dyad: readonly [number, number];
  twinkleEarly?: { beat: number; freq: number };
  twinkleLate?: { beat: number; freq: number };
}

/**
 * 8-bar cozy sunny C-major café progression:
 *   Bars 1–4: Cmaj7 -> Am7 -> Dm9 -> G13
 *   Bars 5–8: Cmaj7 -> Em7 -> Fmaj7 -> G6
 * Every bass root is >= 110 Hz (mobile-speaker warm, zero sub-100Hz mud).
 */
const BISTRO_PROGRESSION: readonly BistroBar[] = [
  // Bar 0: Cmaj7
  { bass: 130.81, dyad: [329.63, 493.88], twinkleEarly: { beat: 3, freq: 783.99 }, twinkleLate: { beat: 6, freq: 659.25 } },
  // Bar 1: Am7
  { bass: 110.0, dyad: [261.63, 392.0], twinkleEarly: { beat: 2, freq: 659.25 }, twinkleLate: { beat: 6, freq: 523.25 } },
  // Bar 2: Dm9
  { bass: 146.83, dyad: [349.23, 523.25], twinkleEarly: { beat: 3, freq: 659.25 }, twinkleLate: { beat: 5, freq: 880.0 } },
  // Bar 3: G13
  { bass: 196.0, dyad: [349.23, 493.88], twinkleEarly: { beat: 2, freq: 659.25 }, twinkleLate: { beat: 6, freq: 587.33 } },
  // Bar 4: Cmaj7 (airy pause on late beat)
  { bass: 130.81, dyad: [392.0, 493.88], twinkleEarly: { beat: 3, freq: 659.25 } },
  // Bar 5: Em7
  { bass: 164.81, dyad: [392.0, 587.33], twinkleEarly: { beat: 2, freq: 783.99 }, twinkleLate: { beat: 6, freq: 659.25 } },
  // Bar 6: Fmaj7
  { bass: 174.61, dyad: [440.0, 659.25], twinkleEarly: { beat: 3, freq: 523.25 }, twinkleLate: { beat: 6, freq: 880.0 } },
  // Bar 7: G6 (gentle turnaround breath)
  { bass: 196.0, dyad: [329.63, 493.88], twinkleEarly: { beat: 4, freq: 587.33 } },
];

interface GainEnvelopeSegment {
  t0: number;
  v0: number;
  t1: number;
  v1: number;
}

export class BistroAmbientLoop {
  private ctx: AudioContext | null = null;
  private bus: AudioBusGraph | null = null;
  private running = false;
  private timerId: ReturnType<typeof setTimeout> | number | null = null;
  private loopGeneration = 0;
  private stepIndex = 0;
  private nextNoteTime = 0;
  private lastClockTime = 0;
  private targetVolume = 0;
  private activeAmbientVoices = 0;
  private readonly activeAmbientStoppers = new Set<() => void>();

  private duckUntilCtxTime = 0;
  private duckUntilWallMs = 0;
  private envSegments: GainEnvelopeSegment[] = [];
  private envFallbackValue = 0;

  isRunning(): boolean {
    return this.running;
  }

  getActiveVoiceCount(): number {
    return this.activeAmbientVoices;
  }

  start(ctx: AudioContext, bus: AudioBusGraph, volume: number): void {
    if (typeof window === 'undefined') return;
    const target = clampUnit(volume, 0);
    if (target <= 0) {
      this.stop(true);
      return;
    }

    if (readContextState(ctx) !== 'running') {
      return;
    }

    // Already running on the exact same context & bus: preserve phase & ducking, only update if volume changed.
    if (this.running && this.ctx === ctx && this.bus === bus) {
      if (target !== this.targetVolume) {
        this.setVolume(target);
      }
      return;
    }

    this.stop(true);

    this.ctx = ctx;
    this.bus = bus;
    this.targetVolume = target;
    this.running = true;
    this.loopGeneration += 1;
    const gen = this.loopGeneration;

    const now = safeCurrentTime(ctx);
    this.lastClockTime = now;
    this.nextNoteTime = now + 0.04;
    this.duckUntilCtxTime = 0;
    this.duckUntilWallMs = 0;

    if (bus.ambientBusGain) {
      const param = bus.ambientBusGain.gain;
      cancelScheduledValuesSafe(param, now);
      setParamValueSafe(param, 0, now);
      linearRampSafe(param, target, now + 0.25);
      this.envSegments = [{ t0: now, v0: 0, t1: now + 0.25, v1: target }];
      this.envFallbackValue = target;
    } else {
      this.envSegments = [];
      this.envFallbackValue = target;
    }

    this.scheduleNextTick(gen);
  }

  stop(stopVoices = true): void {
    this.running = false;
    this.loopGeneration += 1;

    if (this.timerId !== null) {
      try {
        if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
          window.clearTimeout(this.timerId as number);
        } else {
          clearTimeout(this.timerId as ReturnType<typeof setTimeout>);
        }
      } catch {
        // Ignore clearTimeout errors on torn-down environments.
      }
      this.timerId = null;
    }

    this.lastClockTime = 0;
    this.duckUntilCtxTime = 0;
    this.duckUntilWallMs = 0;

    if (this.ctx && this.bus?.ambientBusGain) {
      const now = safeCurrentTime(this.ctx);
      const currentVal = this.estimateCurrentGain(now);
      const param = this.bus.ambientBusGain.gain;
      cancelScheduledValuesSafe(param, now);
      setParamValueSafe(param, currentVal, now);
      linearRampSafe(param, 0, now + 0.03);
      this.envSegments = [{ t0: now, v0: currentVal, t1: now + 0.03, v1: 0 }];
      this.envFallbackValue = 0;
    } else {
      this.envSegments = [];
      this.envFallbackValue = 0;
    }

    if (stopVoices) {
      const stoppers = Array.from(this.activeAmbientStoppers);
      this.activeAmbientStoppers.clear();
      this.activeAmbientVoices = 0;
      for (const stopNow of stoppers) {
        try {
          stopNow();
        } catch {
          // Ignore stop errors on already-ended ambient voices.
        }
      }
    }

    this.ctx = null;
    this.bus = null;
  }

  setVolume(newVolume: number): void {
    const target = clampUnit(newVolume, this.targetVolume);
    if (target <= 0) {
      this.targetVolume = 0;
      this.stop(true);
      return;
    }

    if (this.ctx && readContextState(this.ctx) !== 'running') {
      this.targetVolume = target;
      this.stop(true);
      return;
    }

    if (!this.running || !this.ctx || !this.bus?.ambientBusGain) {
      this.targetVolume = target;
      return;
    }

    const now = safeCurrentTime(this.ctx);
    if (target === this.targetVolume) {
      // Unchanged volume remains a strict zero-AudioParam-churn no-op unless clock jumped backwards.
      this.recoverIfClockJumpedBackwards(now, true);
      return;
    }

    this.recoverIfClockJumpedBackwards(now, false);
    this.targetVolume = target;

    const wallNow = Date.now();
    if (this.duckUntilWallMs <= wallNow) {
      this.duckUntilCtxTime = 0;
      this.duckUntilWallMs = 0;
    }
    const isDucked = now < this.duckUntilCtxTime && wallNow < this.duckUntilWallMs;

    if (isDucked) {
      this.applyDuckedGainCurve(now);
    } else {
      const currentVal = this.estimateCurrentGain(now);
      const param = this.bus.ambientBusGain.gain;
      cancelScheduledValuesSafe(param, now);
      setParamValueSafe(param, currentVal, now);
      linearRampSafe(param, this.targetVolume, now + 0.05);
      this.envSegments = [{ t0: now, v0: currentVal, t1: now + 0.05, v1: this.targetVolume }];
      this.envFallbackValue = this.targetVolume;
    }
  }

  duck(holdSec: number): void {
    if (!this.running || !this.ctx || !this.bus?.ambientBusGain || this.targetVolume <= 0) {
      return;
    }

    const now = safeCurrentTime(this.ctx);
    this.recoverIfClockJumpedBackwards(now, false);

    const wallNow = Date.now();
    if (this.duckUntilWallMs <= wallNow) {
      this.duckUntilCtxTime = 0;
      this.duckUntilWallMs = 0;
    }

    const safeHold = Math.max(0.25, Number.isFinite(holdSec) ? holdSec : 0.5);
    const spanSec = DUCK_ATTACK_SEC + safeHold;
    const newHoldEnd = now + spanSec;

    // Monotonic max ensures overlapping fanfares extend ducking smoothly and never cut off earlier longer fanfares.
    this.duckUntilCtxTime = Math.max(this.duckUntilCtxTime, newHoldEnd);
    this.duckUntilWallMs = Math.max(this.duckUntilWallMs, wallNow + spanSec * 1000);

    this.applyDuckedGainCurve(now);
  }

  private recoverIfClockJumpedBackwards(now: number, restoreGain: boolean): boolean {
    if (!this.running || !this.ctx || !this.bus) return false;

    const maxFutureLead = LOOKAHEAD_SEC + STEP_SEC * 2;
    const wallNow = Date.now();
    const remainingWallSec =
      this.duckUntilWallMs > wallNow ? (this.duckUntilWallMs - wallNow) / 1000 : 0;
    const hasStaleDuck =
      this.duckUntilCtxTime > 0 &&
      this.duckUntilCtxTime > now + Math.max(2.0, remainingWallSec + 1.0);
    const hasStaleEnv =
      this.envSegments.length > 0 && this.envSegments[0].t0 > now + 0.5;
    const jumpedBack =
      now < this.lastClockTime - 0.05 ||
      this.nextNoteTime > now + maxFutureLead ||
      hasStaleDuck ||
      hasStaleEnv;

    if (!jumpedBack) {
      this.lastClockTime = now;
      return false;
    }

    // Re-anchor scheduling timeline to bar downbeat & stop stale far-future ambient voices
    this.nextNoteTime = now + 0.06;
    this.stepIndex = (Math.floor(this.stepIndex / STEPS_PER_BAR) * STEPS_PER_BAR) % TOTAL_STEPS;

    const stoppers = Array.from(this.activeAmbientStoppers);
    this.activeAmbientStoppers.clear();
    this.activeAmbientVoices = 0;
    for (const stopNow of stoppers) {
      try {
        stopNow();
      } catch {
        // Ignore stop errors on stale ambient voices.
      }
    }

    this.duckUntilCtxTime = 0;
    this.duckUntilWallMs = 0;

    if (this.bus.ambientBusGain) {
      const param = this.bus.ambientBusGain.gain;
      cancelScheduledValuesSafe(param, now);
      if (restoreGain) {
        setParamValueSafe(param, this.targetVolume, now);
      }
    }
    this.envSegments = [{ t0: now, v0: this.targetVolume, t1: now, v1: this.targetVolume }];
    this.envFallbackValue = this.targetVolume;
    this.lastClockTime = now;
    return true;
  }

  private estimateCurrentGain(now: number): number {
    if (this.envSegments.length === 0) return this.envFallbackValue;
    if (now <= this.envSegments[0].t0) return this.envSegments[0].v0;
    for (const seg of this.envSegments) {
      if (now <= seg.t1) {
        if (seg.t1 <= seg.t0) return seg.v1;
        const frac = (now - seg.t0) / (seg.t1 - seg.t0);
        return seg.v0 + (seg.v1 - seg.v0) * frac;
      }
    }
    return this.envSegments[this.envSegments.length - 1].v1;
  }

  private applyDuckedGainCurve(now: number): void {
    if (!this.bus?.ambientBusGain) return;
    const param = this.bus.ambientBusGain.gain;
    const currentVal = this.estimateCurrentGain(now);
    const duckedVal = this.targetVolume * DUCK_FACTOR;
    const attackEnd = Math.min(this.duckUntilCtxTime, now + DUCK_ATTACK_SEC);
    const holdEnd = Math.max(attackEnd, this.duckUntilCtxTime);
    const releaseEnd = holdEnd + DUCK_RELEASE_SEC;

    cancelScheduledValuesSafe(param, now);
    setParamValueSafe(param, currentVal, now);
    linearRampSafe(param, duckedVal, attackEnd);
    setParamValueSafe(param, duckedVal, holdEnd);
    linearRampSafe(param, this.targetVolume, releaseEnd);

    this.envSegments = [
      { t0: now, v0: currentVal, t1: attackEnd, v1: duckedVal },
      { t0: attackEnd, v0: duckedVal, t1: holdEnd, v1: duckedVal },
      { t0: holdEnd, v0: duckedVal, t1: releaseEnd, v1: this.targetVolume },
    ];
    this.envFallbackValue = this.targetVolume;
  }

  private scheduleNextTick(gen: number): void {
    if (!this.running || gen !== this.loopGeneration || typeof window === 'undefined') return;
    try {
      const callback = () => {
        this.timerId = null;
        this.tick(gen);
      };
      this.timerId =
        typeof window.setTimeout === 'function'
          ? window.setTimeout(callback, TICK_MS)
          : setTimeout(callback, TICK_MS);
    } catch {
      this.timerId = null;
    }
  }

  private tick(gen: number): void {
    if (!this.running || gen !== this.loopGeneration || !this.ctx || !this.bus) return;

    if (readContextState(this.ctx) !== 'running') {
      this.stop(true);
      return;
    }

    const now = safeCurrentTime(this.ctx);

    // Backwards audio-clock jump (hardware reset) recovery OR forward stall catch-up.
    if (!this.recoverIfClockJumpedBackwards(now, true) && this.nextNoteTime < now - STALL_GAP_SEC) {
      this.nextNoteTime = now + 0.06;
    }

    let stepsScheduled = 0;
    while (this.nextNoteTime < now + LOOKAHEAD_SEC && stepsScheduled < MAX_STEPS_PER_TICK) {
      this.scheduleStep(this.ctx, this.bus, this.stepIndex, this.nextNoteTime, gen);
      this.stepIndex = (this.stepIndex + 1) % TOTAL_STEPS;
      this.nextNoteTime += STEP_SEC;
      stepsScheduled += 1;
    }

    this.scheduleNextTick(gen);
  }

  private scheduleStep(
    ctx: AudioContext,
    bus: AudioBusGraph,
    step: number,
    when: number,
    gen: number,
  ): void {
    const bar = BISTRO_PROGRESSION[Math.floor(step / STEPS_PER_BAR) % BISTRO_PROGRESSION.length];
    const beat = step % STEPS_PER_BAR;

    if (beat === 0) {
      // Warm bass pluck + gentle 2x harmonic so mobile speakers reproduce the root cleanly
      this.scheduleNote(ctx, bus, 'sine', bar.bass, when, 0.62, 0.014, 0.048, null, gen);
      this.scheduleNote(ctx, bus, 'sine', bar.bass * 2, when, 0.22, 0.008, 0.014, null, gen);
      // Soft Rhodes/marimba comping dyad through warm lowpass
      this.scheduleNote(ctx, bus, 'triangle', bar.dyad[0], when + 0.004, 0.5, 0.016, 0.026, 1400, gen);
      this.scheduleNote(ctx, bus, 'triangle', bar.dyad[1], when + 0.01, 0.5, 0.016, 0.024, 1400, gen);
    }

    if (beat === 4) {
      // Gentle mid-bar Rhodes answer
      this.scheduleNote(ctx, bus, 'triangle', bar.dyad[1], when, 0.42, 0.014, 0.02, 1300, gen);
    }

    if (bar.twinkleEarly && beat === bar.twinkleEarly.beat) {
      this.scheduleNote(ctx, bus, 'sine', bar.twinkleEarly.freq, when, 0.36, 0.008, 0.028, null, gen);
    }

    if (bar.twinkleLate && beat === bar.twinkleLate.beat) {
      this.scheduleNote(ctx, bus, 'sine', bar.twinkleLate.freq, when, 0.32, 0.008, 0.024, null, gen);
    }
  }

  private scheduleNote(
    ctx: AudioContext,
    bus: AudioBusGraph,
    type: WarmOscillatorType,
    freq: number,
    startTime: number,
    duration: number,
    attack: number,
    peakGain: number,
    lowpassHz: number | null,
    gen: number,
  ): void {
    if (this.activeAmbientVoices >= MAX_AMBIENT_VOICES) return;

    const safeStart = Math.max(0, startTime);
    const safeDur = Math.max(0.05, duration);
    const safeAtk = Math.min(Math.max(0.004, attack), safeDur * 0.4);
    const sampleRate = safeSampleRate(ctx);
    const effectiveGain = clampGain(peakGain * (bus.ambientBusGain ? 1 : this.targetVolume));

    let osc: OscillatorNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let gain: GainNode | null = null;
    let counted = false;
    let released = false;

    const release = () => {
      if (released) return;
      released = true;
      this.activeAmbientStoppers.delete(stopNow);
      if (counted && gen === this.loopGeneration) {
        this.activeAmbientVoices = Math.max(0, this.activeAmbientVoices - 1);
      }
      disconnectSafely(osc, filter, gain);
    };

    const stopNow = () => {
      if (osc) {
        try {
          osc.stop(0);
        } catch {
          // Ignore stop errors if already stopped or not started.
        }
      }
      release();
    };

    try {
      osc = ctx.createOscillator();
      osc.type = type;
      setParamValueSafe(osc.frequency, clampFreq(freq), safeStart);

      if (lowpassHz !== null && typeof ctx.createBiquadFilter === 'function') {
        try {
          filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          setParamValueSafe(filter.frequency, clampFilterFreq(lowpassHz, sampleRate), safeStart);
          setParamValueSafe(filter.Q, 0.7, safeStart);
        } catch {
          disconnectSafely(filter);
          filter = null;
        }
      }

      if (typeof ctx.createGain === 'function') {
        gain = ctx.createGain();
        setParamValueSafe(gain.gain, 0.0001, safeStart);
        linearRampSafe(gain.gain, effectiveGain, safeStart + safeAtk);
        exponentialRampSafe(gain.gain, 0.0001, safeStart + safeDur);
      }

      const dest = bus.ambientInput;
      if (filter && gain) {
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
      } else if (gain) {
        osc.connect(gain);
        gain.connect(dest);
      } else if (filter) {
        osc.connect(filter);
        filter.connect(dest);
      } else {
        osc.connect(dest);
      }

      this.activeAmbientVoices += 1;
      counted = true;
      this.activeAmbientStoppers.add(stopNow);
      osc.onended = release;

      osc.start(safeStart);
      osc.stop(safeStart + safeDur + 0.025);
    } catch {
      release();
    }
  }
}
