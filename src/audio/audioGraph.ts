/**
 * Shared Web Audio master bus graph builder used identically by both live AudioContext
 * and OfflineAudioContext, with full graceful degradation for minimal mocks / legacy WebViews.
 *
 * Signal chain:
 *   sfxBusGain     ──┐
 *                    ├──► masterGain (enabled ? 0.95 : 0) ──► DynamicsCompressorNode ──► ctx.destination
 *   ambientBusGain ──┘
 */

import { MIN_VALID_SAMPLE_RATE, clampUnit, type AudioBusGraph } from './audioTypes';

export const MASTER_GAIN_CEILING = 0.95;

export const LIMITER_PARAMS = {
  threshold: -12,
  knee: 18,
  ratio: 6,
  attack: 0.003,
  release: 0.14,
} as const;

export interface AudioBusInitOptions {
  sfxVolume?: number;
  ambientVolume?: number;
  masterVolume?: number;
}

export function safeCurrentTime(ctx: BaseAudioContext | null | undefined): number {
  if (!ctx) return 0;
  try {
    const t = ctx.currentTime;
    return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : 0;
  } catch {
    return 0;
  }
}

export function safeSampleRate(ctx: BaseAudioContext | null | undefined): number {
  if (!ctx) return 44100;
  try {
    const rate = ctx.sampleRate;
    return typeof rate === 'number' && Number.isFinite(rate) && rate >= MIN_VALID_SAMPLE_RATE
      ? rate
      : 44100;
  } catch {
    return 44100;
  }
}

export function readContextState(ctx: BaseAudioContext | null | undefined): string {
  if (!ctx) {
    return typeof window === 'undefined' ? 'unavailable' : 'uninitialized';
  }
  try {
    return String(ctx.state);
  } catch {
    return 'closed';
  }
}

export function setParamValueSafe(
  param: AudioParam | null | undefined,
  value: number,
  time?: number,
): void {
  if (!param || !Number.isFinite(value)) return;
  if (typeof param.setValueAtTime === 'function' && time !== undefined && Number.isFinite(time)) {
    try {
      param.setValueAtTime(value, Math.max(0, time));
      return;
    } catch {
      // Fall back to direct value assignment.
    }
  }
  try {
    param.value = value;
  } catch {
    // Ignore read-only or torn-down AudioParam errors.
  }
}

export function cancelScheduledValuesSafe(
  param: AudioParam | null | undefined,
  time: number,
): void {
  if (!param || typeof param.cancelScheduledValues !== 'function' || !Number.isFinite(time)) {
    return;
  }
  try {
    param.cancelScheduledValues(Math.max(0, time));
  } catch {
    // Ignore AudioParam cancellation errors on partial mocks.
  }
}

export function linearRampSafe(
  param: AudioParam | null | undefined,
  value: number,
  endTime: number,
): void {
  if (!param || !Number.isFinite(value) || !Number.isFinite(endTime)) return;
  if (typeof param.linearRampToValueAtTime === 'function') {
    try {
      param.linearRampToValueAtTime(value, Math.max(0, endTime));
      return;
    } catch {
      // Fall back to direct value assignment.
    }
  }
  setParamValueSafe(param, value, endTime);
}

export function exponentialRampSafe(
  param: AudioParam | null | undefined,
  value: number,
  endTime: number,
): void {
  if (!param || !Number.isFinite(value) || !Number.isFinite(endTime)) return;
  const positiveValue = Math.max(0.0001, value);
  if (typeof param.exponentialRampToValueAtTime === 'function') {
    try {
      param.exponentialRampToValueAtTime(positiveValue, Math.max(0, endTime));
      return;
    } catch {
      // Fall back to linear ramp / direct assignment.
    }
  }
  linearRampSafe(param, positiveValue, endTime);
}

export function disconnectSafely(...nodes: Array<AudioNode | null | undefined>): void {
  for (const node of nodes) {
    if (!node || typeof node.disconnect !== 'function') continue;
    try {
      node.disconnect();
    } catch {
      // Split per-node try/catch ensures one throwing disconnect never leaks downstream nodes.
    }
  }
}

export function createAudioBusGraph(
  ctx: BaseAudioContext,
  options: AudioBusInitOptions = {},
): AudioBusGraph {
  const sfxVol = clampUnit(options.sfxVolume ?? 0.85, 0.85);
  const ambientVol = clampUnit(options.ambientVolume ?? 0, 0);
  const masterVol = clampUnit(options.masterVolume ?? MASTER_GAIN_CEILING, MASTER_GAIN_CEILING);
  const now = safeCurrentTime(ctx);

  if (typeof ctx.createGain !== 'function') {
    return {
      sfxInput: ctx.destination,
      ambientInput: ctx.destination,
      sfxBusGain: null,
      ambientBusGain: null,
      masterGain: null,
      compressor: null,
      usesBusSfxGain: false,
    };
  }

  let sfxBusGain: GainNode | null = null;
  let ambientBusGain: GainNode | null = null;
  let masterGain: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;

  try {
    sfxBusGain = ctx.createGain();
    ambientBusGain = ctx.createGain();
    masterGain = ctx.createGain();

    setParamValueSafe(sfxBusGain.gain, sfxVol, now);
    setParamValueSafe(ambientBusGain.gain, ambientVol, now);
    setParamValueSafe(masterGain.gain, masterVol, now);

    sfxBusGain.connect(masterGain);
    ambientBusGain.connect(masterGain);

    let connectedToDestination = false;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      let comp: DynamicsCompressorNode | null = null;
      try {
        comp = ctx.createDynamicsCompressor();
        setParamValueSafe(comp.threshold, LIMITER_PARAMS.threshold, now);
        setParamValueSafe(comp.knee, LIMITER_PARAMS.knee, now);
        setParamValueSafe(comp.ratio, LIMITER_PARAMS.ratio, now);
        setParamValueSafe(comp.attack, LIMITER_PARAMS.attack, now);
        setParamValueSafe(comp.release, LIMITER_PARAMS.release, now);
        masterGain.connect(comp);
        comp.connect(ctx.destination);
        compressor = comp;
        connectedToDestination = true;
      } catch {
        disconnectSafely(masterGain, comp);
        compressor = null;
      }
    }

    if (!connectedToDestination) {
      masterGain.connect(ctx.destination);
    }

    return {
      sfxInput: sfxBusGain,
      ambientInput: ambientBusGain,
      sfxBusGain,
      ambientBusGain,
      masterGain,
      compressor,
      usesBusSfxGain: true,
    };
  } catch {
    disconnectSafely(sfxBusGain, ambientBusGain, masterGain, compressor);
    return {
      sfxInput: ctx.destination,
      ambientInput: ctx.destination,
      sfxBusGain: null,
      ambientBusGain: null,
      masterGain: null,
      compressor: null,
      usesBusSfxGain: false,
    };
  }
}

export function disposeAudioBusGraph(bus: AudioBusGraph | null): void {
  if (!bus) return;
  disconnectSafely(bus.sfxBusGain, bus.ambientBusGain, bus.masterGain, bus.compressor);
}
