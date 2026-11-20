/**
 * Complete 21-SFX warm layered procedural recipe catalog, rising major pentatonic
 * upgrade combo math, per-SFX cooldowns, unified Web Audio scheduler (shared by live
 * AudioContext and OfflineAudioContext), and deterministic RBJ-biquad analytical PCM
 * renderer for Node environments without OfflineAudioContext.
 */

import {
  MASTER_GAIN_CEILING,
  disconnectSafely,
  exponentialRampSafe,
  linearRampSafe,
  safeSampleRate,
  setParamValueSafe,
} from './audioGraph';
import {
  ALL_SFX_NAMES,
  PENTATONIC_SEMITONES,
  clampFilterFreq,
  clampFreq,
  clampGain,
  clampPitchMult,
  clampQ,
  type FilterSpec,
  type NoiseLayerSpec,
  type OfflineAudioSampleResult,
  type SfxName,
  type SfxRecipe,
  type ToneLayerSpec,
} from './audioTypes';
import {
  PINK_NOISE_SEED,
  WHITE_NOISE_SEED,
  generatePinkNoiseSamples,
  generateWhiteNoiseSamples,
  getCachedNoiseBank,
} from './noiseBuffers';

export const SFX_COOLDOWN_MS: Partial<Record<SfxName, number>> = {
  coin: 90,
  tip: 90,
  sizzle: 220,
  order: 180,
  customer_happy: 160,
  perfect: 140,
  divine: 140,
  instant_cook: 140,
  error: 120,
  sheet_open: 80,
  sheet_close: 80,
  boost: 60,
  tab: 40,
  tap: 35,
  upgrade: 35,
};

export const FANFARE_SFX: ReadonlySet<SfxName> = new Set<SfxName>([
  'milestone',
  'achievement',
  'divine',
  'box',
  'renovate',
  'city_flight',
]);

const VALID_SFX_NAMES: ReadonlySet<string> = new Set<string>(ALL_SFX_NAMES);

export function isValidSfxName(sfx: unknown): sfx is SfxName {
  return typeof sfx === 'string' && VALID_SFX_NAMES.has(sfx);
}

export interface VoiceLifecycleCallbacks {
  canStartSource: () => boolean;
  onSourceStarted: () => void;
  onSourceEnded: () => void;
}

export interface ScheduleRecipeOptions {
  baseTime: number;
  gainScale: number;
  trimOptional?: boolean;
  deterministicNoiseOffset?: boolean;
  noiseOffsetStep?: number;
  tracker?: VoiceLifecycleCallbacks;
}

export function computeUpgradeComboMultiplier(combo: number): number {
  const step = Math.min(24, Math.max(0, Math.floor(Number.isFinite(combo) ? combo : 0)));
  const semitones = Math.floor(step / 5) * 12 + PENTATONIC_SEMITONES[step % 5];
  return Math.pow(2, semitones / 12);
}

export function resolveDefaultPitchJitter(
  sfx: SfxName,
  randomFn: () => number = Math.random,
): number {
  const r = randomFn();
  const signed = (Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0.5) * 2 - 1;
  switch (sfx) {
    case 'coin':
      return 1 + signed * 0.035; // +/- 3.5%
    case 'tip':
    case 'order':
      return 1 + signed * 0.03; // +/- 3.0%
    case 'sizzle':
      return 1 + signed * 0.06; // +/- 6.0%
    case 'tap':
    case 'tab':
      return 1 + signed * 0.015; // +/- 1.5%
    default:
      return 1;
  }
}

export function computeNaturalDuration(recipe: SfxRecipe): number {
  let maxEnd = 0.08;
  for (const t of recipe.tones) {
    maxEnd = Math.max(maxEnd, Math.max(0, t.delay) + Math.max(0.02, t.duration));
  }
  for (const n of recipe.noises) {
    maxEnd = Math.max(maxEnd, Math.max(0, n.delay) + Math.max(0.02, n.duration));
  }
  // +0.06s tail covers Chromium DynamicsCompressorNode ~6ms lookahead + release tail.
  return Math.min(2.5, Math.max(0.18, maxEnd + 0.06));
}

function scaleFilter(filter: FilterSpec, pitchMult: number): FilterSpec {
  if (pitchMult === 1) return filter;
  return {
    ...filter,
    freq: filter.freq * pitchMult,
    endFreq: filter.endFreq !== undefined ? filter.endFreq * pitchMult : undefined,
  };
}

function scaleRecipe(recipe: SfxRecipe, pitchMult: number): SfxRecipe {
  const safeMult = clampPitchMult(pitchMult);
  if (safeMult === 1) return recipe;
  return {
    ...recipe,
    tones: recipe.tones.map((t) => ({
      ...t,
      freq: t.freq * safeMult,
      endFreq: t.endFreq !== undefined ? t.endFreq * safeMult : undefined,
      filter: t.filter ? scaleFilter(t.filter, safeMult) : undefined,
    })),
    noises: recipe.noises.map((n) => ({
      ...n,
      filter: scaleFilter(n.filter, safeMult),
    })),
  };
}

export function buildSfxRecipe(sfx: SfxName, combo = 0, pitchMult = 1): SfxRecipe {
  let recipe: SfxRecipe;

  switch (sfx) {
    case 'tap':
      recipe = {
        tones: [
          { type: 'triangle', freq: 520, endFreq: 680, delay: 0, duration: 0.042, attack: 0.003, gain: 0.16 },
          { type: 'sine', freq: 1040, endFreq: 1320, delay: 0, duration: 0.024, attack: 0.002, gain: 0.07, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 1800, q: 2.2 },
            delay: 0,
            duration: 0.016,
            attack: 0.0015,
            gain: 0.05,
            optional: true,
          },
        ],
        durationSec: 0.06,
        isFanfare: false,
      };
      break;

    case 'tab':
      recipe = {
        tones: [
          { type: 'triangle', freq: 415, endFreq: 523, delay: 0, duration: 0.048, attack: 0.003, gain: 0.15 },
          { type: 'sine', freq: 830, endFreq: 988, delay: 0, duration: 0.026, attack: 0.002, gain: 0.06, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 1400, q: 2.0 },
            delay: 0,
            duration: 0.014,
            attack: 0.0015,
            gain: 0.04,
            optional: true,
          },
        ],
        durationSec: 0.065,
        isFanfare: false,
      };
      break;

    case 'sheet_open':
      recipe = {
        tones: [
          { type: 'sine', freq: 340, endFreq: 587, delay: 0.012, duration: 0.095, attack: 0.008, gain: 0.13 },
          { type: 'triangle', freq: 523, endFreq: 784, delay: 0.036, duration: 0.085, attack: 0.006, gain: 0.11, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 420, endFreq: 1550, q: 1.8 },
            delay: 0,
            duration: 0.115,
            attack: 0.018,
            gain: 0.12,
          },
        ],
        durationSec: 0.15,
        isFanfare: false,
      };
      break;

    case 'sheet_close':
      recipe = {
        tones: [
          { type: 'sine', freq: 560, endFreq: 320, delay: 0, duration: 0.085, attack: 0.006, gain: 0.13 },
          { type: 'triangle', freq: 280, endFreq: 210, delay: 0.018, duration: 0.065, attack: 0.005, gain: 0.08, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 1400, endFreq: 380, q: 1.8 },
            delay: 0,
            duration: 0.095,
            attack: 0.012,
            gain: 0.1,
          },
        ],
        durationSec: 0.13,
        isFanfare: false,
      };
      break;

    case 'upgrade': {
      const step = Math.min(24, Math.max(0, Math.floor(Number.isFinite(combo) ? combo : 0)));
      const m = computeUpgradeComboMultiplier(step);
      const baseFreq = 220 * m;
      const highTame = 1 / (1 + Math.max(0, baseFreq - 1400) / 3600);

      const tones: ToneLayerSpec[] = [
        {
          type: 'triangle',
          freq: baseFreq,
          endFreq: 226 * m,
          delay: 0,
          duration: 0.115,
          attack: 0.003,
          gain: 0.18 * highTame,
        },
        {
          type: 'sine',
          freq: step < 15 ? 440 * m : 110 * m,
          delay: 0,
          duration: 0.08,
          attack: 0.003,
          gain: 0.14 * highTame,
        },
        {
          type: 'sine',
          freq: Math.min(9200, 660 * m),
          delay: 0.026,
          duration: 0.095,
          attack: 0.004,
          gain: 0.1 * highTame,
          optional: true,
        },
      ];

      if (step >= 6) {
        const sparkleProgress = Math.min(1, (step - 6) / 18);
        tones.push({
          type: 'sine',
          freq: Math.min(9600, step < 15 ? 880 * m : 330 * m),
          delay: 0.038,
          duration: 0.11,
          attack: 0.004,
          gain: 0.05 + 0.04 * sparkleProgress,
          optional: true,
        });
      }

      const noises: NoiseLayerSpec[] = [
        {
          noise: 'pink',
          filter: { type: 'bandpass', freq: 2200, q: 2.0 },
          delay: 0,
          duration: 0.012,
          attack: 0.0015,
          gain: 0.035,
          optional: true,
        },
      ];

      if (step >= 10) {
        const airProgress = Math.min(1, (step - 10) / 14);
        noises.push({
          noise: 'white',
          filter: { type: 'highpass', freq: 5800, endFreq: 8600, q: 0.9 },
          delay: 0.022,
          duration: 0.075,
          attack: 0.006,
          gain: 0.03 + 0.025 * airProgress,
          optional: true,
        });
      }

      recipe = {
        tones,
        noises,
        durationSec: 0.17,
        isFanfare: false,
      };
      break;
    }

    case 'unlock':
      recipe = {
        tones: [
          { type: 'triangle', freq: 195, endFreq: 115, delay: 0, duration: 0.055, attack: 0.002, gain: 0.19 },
          { type: 'triangle', freq: 523.25, delay: 0.035, duration: 0.12, attack: 0.004, gain: 0.17 },
          { type: 'sine', freq: 1046.5, delay: 0.035, duration: 0.12, attack: 0.004, gain: 0.07, optional: true },
          { type: 'triangle', freq: 659.25, delay: 0.095, duration: 0.13, attack: 0.004, gain: 0.17 },
          { type: 'sine', freq: 783.99, delay: 0.155, duration: 0.21, attack: 0.005, gain: 0.2 },
          { type: 'sine', freq: 1568, delay: 0.155, duration: 0.21, attack: 0.005, gain: 0.08, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 950, endFreq: 460, q: 1.5 },
            delay: 0,
            duration: 0.045,
            attack: 0.002,
            gain: 0.18,
          },
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 5400, q: 0.8 },
            delay: 0.155,
            duration: 0.12,
            attack: 0.008,
            gain: 0.045,
            optional: true,
          },
        ],
        durationSec: 0.4,
        isFanfare: false,
      };
      break;

    case 'milestone':
      recipe = {
        tones: [
          { type: 'triangle', freq: 523.25, delay: 0, duration: 0.13, attack: 0.004, gain: 0.18 },
          { type: 'sine', freq: 1046.5, delay: 0, duration: 0.13, attack: 0.004, gain: 0.07, optional: true },
          { type: 'triangle', freq: 659.25, delay: 0.08, duration: 0.13, attack: 0.004, gain: 0.18 },
          { type: 'sine', freq: 1318.5, delay: 0.08, duration: 0.13, attack: 0.004, gain: 0.07, optional: true },
          { type: 'triangle', freq: 783.99, delay: 0.16, duration: 0.15, attack: 0.004, gain: 0.19 },
          { type: 'sine', freq: 1568, delay: 0.16, duration: 0.15, attack: 0.004, gain: 0.08, optional: true },
          { type: 'triangle', freq: 1046.5, delay: 0.24, duration: 0.32, attack: 0.006, gain: 0.21 },
          { type: 'sine', freq: 1318.5, delay: 0.24, duration: 0.3, attack: 0.006, gain: 0.12, optional: true },
          {
            type: 'triangle',
            freq: 523.25,
            delay: 0.24,
            duration: 0.32,
            attack: 0.008,
            gain: 0.12,
            filter: { type: 'lowpass', freq: 2200, q: 0.7 },
          },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 5500, endFreq: 8500, q: 0.9 },
            delay: 0.235,
            duration: 0.19,
            attack: 0.012,
            gain: 0.055,
            optional: true,
          },
        ],
        durationSec: 0.6,
        isFanfare: true,
        fanfareHoldSec: 0.55,
      };
      break;

    case 'achievement':
      recipe = {
        tones: [
          { type: 'triangle', freq: 587.33, delay: 0, duration: 0.12, attack: 0.004, gain: 0.17 },
          { type: 'sine', freq: 1174.66, delay: 0, duration: 0.12, attack: 0.004, gain: 0.07, optional: true },
          { type: 'triangle', freq: 739.99, delay: 0.07, duration: 0.12, attack: 0.004, gain: 0.17 },
          { type: 'triangle', freq: 880, delay: 0.14, duration: 0.14, attack: 0.004, gain: 0.18 },
          { type: 'sine', freq: 1174.66, delay: 0.21, duration: 0.3, attack: 0.005, gain: 0.2 },
          { type: 'sine', freq: 1479.98, delay: 0.21, duration: 0.28, attack: 0.005, gain: 0.11, optional: true },
          { type: 'sine', freq: 2349.32, delay: 0.21, duration: 0.22, attack: 0.005, gain: 0.07, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 6400, endFreq: 9400, q: 1.0 },
            delay: 0.205,
            duration: 0.21,
            attack: 0.01,
            gain: 0.055,
            optional: true,
          },
        ],
        durationSec: 0.56,
        isFanfare: true,
        fanfareHoldSec: 0.52,
      };
      break;

    case 'coin':
      recipe = {
        tones: [
          { type: 'sine', freq: 987.77, delay: 0, duration: 0.095, attack: 0.002, gain: 0.17 },
          { type: 'sine', freq: 1975.5, delay: 0, duration: 0.048, attack: 0.002, gain: 0.06, optional: true },
          { type: 'sine', freq: 1318.51, delay: 0.042, duration: 0.155, attack: 0.002, gain: 0.19 },
          { type: 'sine', freq: 2637, delay: 0.042, duration: 0.075, attack: 0.002, gain: 0.065, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'bandpass', freq: 6200, q: 3.0 },
            delay: 0,
            duration: 0.014,
            attack: 0.001,
            gain: 0.035,
            optional: true,
          },
        ],
        durationSec: 0.22,
        isFanfare: false,
      };
      break;

    case 'perfect':
      recipe = {
        tones: [
          { type: 'triangle', freq: 783.99, delay: 0, duration: 0.16, attack: 0.004, gain: 0.16 },
          { type: 'sine', freq: 987.77, delay: 0.035, duration: 0.17, attack: 0.004, gain: 0.15 },
          { type: 'sine', freq: 1174.66, delay: 0.07, duration: 0.21, attack: 0.004, gain: 0.17 },
          { type: 'sine', freq: 1567.98, delay: 0.105, duration: 0.25, attack: 0.005, gain: 0.13, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 6000, endFreq: 9000, q: 0.9 },
            delay: 0.065,
            duration: 0.16,
            attack: 0.012,
            gain: 0.045,
            optional: true,
          },
        ],
        durationSec: 0.38,
        isFanfare: false,
      };
      break;

    case 'divine':
      recipe = {
        tones: [
          {
            type: 'triangle',
            freq: 293.66,
            delay: 0,
            duration: 0.42,
            attack: 0.016,
            gain: 0.14,
            filter: { type: 'lowpass', freq: 1600, q: 0.7 },
          },
          { type: 'triangle', freq: 587.33, delay: 0, duration: 0.18, attack: 0.004, gain: 0.15 },
          { type: 'sine', freq: 880, delay: 0.045, duration: 0.2, attack: 0.004, gain: 0.15 },
          { type: 'sine', freq: 1174.66, delay: 0.09, duration: 0.23, attack: 0.004, gain: 0.16 },
          { type: 'sine', freq: 1479.98, delay: 0.135, duration: 0.26, attack: 0.004, gain: 0.14, optional: true },
          { type: 'sine', freq: 1760, delay: 0.18, duration: 0.32, attack: 0.005, gain: 0.15 },
          { type: 'sine', freq: 2349.3, delay: 0.18, duration: 0.28, attack: 0.005, gain: 0.08, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'bandpass', freq: 7000, endFreq: 9600, q: 1.1 },
            delay: 0.11,
            duration: 0.28,
            attack: 0.02,
            gain: 0.06,
            optional: true,
          },
        ],
        durationSec: 0.55,
        isFanfare: true,
        fanfareHoldSec: 0.52,
      };
      break;

    case 'tip':
      recipe = {
        tones: [
          { type: 'sine', freq: 1046.5, delay: 0, duration: 0.08, attack: 0.002, gain: 0.14 },
          { type: 'sine', freq: 1318.5, delay: 0.038, duration: 0.095, attack: 0.002, gain: 0.15 },
          { type: 'sine', freq: 1568, delay: 0.076, duration: 0.145, attack: 0.002, gain: 0.16 },
          { type: 'sine', freq: 3136, delay: 0.076, duration: 0.06, attack: 0.002, gain: 0.055, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'bandpass', freq: 7000, q: 2.8 },
            delay: 0.076,
            duration: 0.022,
            attack: 0.002,
            gain: 0.03,
            optional: true,
          },
        ],
        durationSec: 0.24,
        isFanfare: false,
      };
      break;

    case 'order':
      recipe = {
        tones: [
          { type: 'sine', freq: 360, endFreq: 640, delay: 0, duration: 0.062, attack: 0.003, gain: 0.15 },
          { type: 'triangle', freq: 720, endFreq: 920, delay: 0.018, duration: 0.048, attack: 0.003, gain: 0.08, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 1200, endFreq: 2100, q: 2.4 },
            delay: 0,
            duration: 0.028,
            attack: 0.002,
            gain: 0.045,
            optional: true,
          },
        ],
        durationSec: 0.09,
        isFanfare: false,
      };
      break;

    case 'sizzle':
      recipe = {
        tones: [
          { type: 'sine', freq: 620, endFreq: 980, delay: 0.018, duration: 0.028, attack: 0.002, gain: 0.055 },
          { type: 'sine', freq: 760, endFreq: 1120, delay: 0.082, duration: 0.024, attack: 0.002, gain: 0.045, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'bandpass', freq: 3200, endFreq: 5400, q: 1.3 },
            delay: 0,
            duration: 0.175,
            attack: 0.012,
            gain: 0.22,
          },
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 5600, q: 0.8 },
            delay: 0.015,
            duration: 0.14,
            attack: 0.01,
            gain: 0.11,
            optional: true,
          },
        ],
        durationSec: 0.21,
        isFanfare: false,
      };
      break;

    case 'instant_cook':
      recipe = {
        tones: [
          { type: 'triangle', freq: 660, endFreq: 1318.5, delay: 0, duration: 0.075, attack: 0.003, gain: 0.15 },
          { type: 'sine', freq: 1318.5, delay: 0.04, duration: 0.135, attack: 0.003, gain: 0.15 },
          { type: 'sine', freq: 1975.5, delay: 0.072, duration: 0.13, attack: 0.003, gain: 0.11, optional: true },
        ],
        noises: [
          {
            noise: 'white',
            filter: { type: 'bandpass', freq: 4200, endFreq: 8400, q: 1.4 },
            delay: 0,
            duration: 0.11,
            attack: 0.008,
            gain: 0.09,
          },
        ],
        durationSec: 0.23,
        isFanfare: false,
      };
      break;

    case 'customer_happy':
      recipe = {
        tones: [
          { type: 'sine', freq: 587.33, endFreq: 783.99, delay: 0, duration: 0.068, attack: 0.004, gain: 0.13 },
          { type: 'triangle', freq: 880, delay: 0.048, duration: 0.095, attack: 0.004, gain: 0.13 },
          { type: 'sine', freq: 1174.66, delay: 0.085, duration: 0.115, attack: 0.004, gain: 0.1, optional: true },
        ],
        noises: [],
        durationSec: 0.22,
        isFanfare: false,
      };
      break;

    case 'boost':
      recipe = {
        tones: [
          { type: 'triangle', freq: 293.66, endFreq: 587.33, delay: 0, duration: 0.135, attack: 0.008, gain: 0.17 },
          { type: 'triangle', freq: 440, endFreq: 880, delay: 0.055, duration: 0.155, attack: 0.008, gain: 0.18 },
          { type: 'sine', freq: 1174.66, delay: 0.135, duration: 0.22, attack: 0.006, gain: 0.18 },
          { type: 'sine', freq: 1760, delay: 0.135, duration: 0.2, attack: 0.006, gain: 0.1, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 500, endFreq: 3200, q: 1.5 },
            delay: 0,
            duration: 0.185,
            attack: 0.02,
            gain: 0.14,
          },
        ],
        durationSec: 0.39,
        isFanfare: false,
      };
      break;

    case 'box':
      recipe = {
        tones: [
          { type: 'triangle', freq: 180, endFreq: 125, delay: 0, duration: 0.055, attack: 0.002, gain: 0.18 },
          { type: 'triangle', freq: 392, delay: 0.055, duration: 0.1, attack: 0.004, gain: 0.15 },
          { type: 'triangle', freq: 493.88, delay: 0.115, duration: 0.105, attack: 0.004, gain: 0.16 },
          { type: 'triangle', freq: 587.33, delay: 0.175, duration: 0.12, attack: 0.004, gain: 0.17 },
          { type: 'sine', freq: 783.99, delay: 0.235, duration: 0.32, attack: 0.005, gain: 0.21 },
          { type: 'sine', freq: 1174.66, delay: 0.235, duration: 0.29, attack: 0.005, gain: 0.14, optional: true },
          { type: 'sine', freq: 1567.98, delay: 0.235, duration: 0.26, attack: 0.005, gain: 0.11, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 1050, endFreq: 520, q: 1.6 },
            delay: 0,
            duration: 0.048,
            attack: 0.002,
            gain: 0.17,
          },
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 5200, endFreq: 9200, q: 0.9 },
            delay: 0.23,
            duration: 0.24,
            attack: 0.012,
            gain: 0.08,
            optional: true,
          },
        ],
        durationSec: 0.58,
        isFanfare: true,
        fanfareHoldSec: 0.55,
      };
      break;

    case 'renovate':
      recipe = {
        tones: [
          {
            type: 'triangle',
            freq: 261.63,
            delay: 0,
            duration: 0.48,
            attack: 0.012,
            gain: 0.16,
            filter: { type: 'lowpass', freq: 1800, q: 0.7 },
          },
          { type: 'triangle', freq: 523.25, delay: 0, duration: 0.14, attack: 0.004, gain: 0.18 },
          { type: 'triangle', freq: 659.25, delay: 0.095, duration: 0.14, attack: 0.004, gain: 0.18 },
          { type: 'triangle', freq: 783.99, delay: 0.19, duration: 0.155, attack: 0.004, gain: 0.19 },
          { type: 'triangle', freq: 1046.5, delay: 0.285, duration: 0.38, attack: 0.006, gain: 0.22 },
          { type: 'sine', freq: 1318.5, delay: 0.285, duration: 0.35, attack: 0.006, gain: 0.14, optional: true },
          { type: 'sine', freq: 1568, delay: 0.285, duration: 0.33, attack: 0.006, gain: 0.11, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 650, endFreq: 2200, q: 1.3 },
            delay: 0.265,
            duration: 0.16,
            attack: 0.015,
            gain: 0.1,
          },
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 6000, endFreq: 9200, q: 0.9 },
            delay: 0.285,
            duration: 0.26,
            attack: 0.014,
            gain: 0.06,
            optional: true,
          },
        ],
        durationSec: 0.69,
        isFanfare: true,
        fanfareHoldSec: 0.68,
      };
      break;

    case 'city_flight':
      recipe = {
        tones: [
          { type: 'triangle', freq: 261.63, endFreq: 523.25, delay: 0, duration: 0.19, attack: 0.014, gain: 0.17 },
          { type: 'triangle', freq: 659.25, delay: 0.11, duration: 0.14, attack: 0.005, gain: 0.17 },
          { type: 'triangle', freq: 783.99, delay: 0.19, duration: 0.15, attack: 0.005, gain: 0.18 },
          { type: 'triangle', freq: 1046.5, delay: 0.27, duration: 0.28, attack: 0.006, gain: 0.2 },
          { type: 'sine', freq: 1318.5, delay: 0.33, duration: 0.36, attack: 0.008, gain: 0.15 },
          { type: 'sine', freq: 1567.98, delay: 0.33, duration: 0.34, attack: 0.008, gain: 0.11, optional: true },
          { type: 'sine', freq: 1174.66, delay: 0.33, duration: 0.32, attack: 0.008, gain: 0.09, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 360, endFreq: 2600, q: 1.4 },
            delay: 0,
            duration: 0.24,
            attack: 0.025,
            gain: 0.15,
          },
          {
            noise: 'white',
            filter: { type: 'highpass', freq: 6200, endFreq: 9400, q: 0.9 },
            delay: 0.325,
            duration: 0.28,
            attack: 0.018,
            gain: 0.06,
            optional: true,
          },
        ],
        durationSec: 0.72,
        isFanfare: true,
        fanfareHoldSec: 0.72,
      };
      break;

    case 'error':
      recipe = {
        tones: [
          {
            type: 'triangle',
            freq: 215,
            endFreq: 132,
            delay: 0,
            duration: 0.11,
            attack: 0.004,
            gain: 0.2,
            filter: { type: 'lowpass', freq: 900, q: 0.8 },
          },
          { type: 'sine', freq: 165, endFreq: 112, delay: 0.024, duration: 0.095, attack: 0.004, gain: 0.13, optional: true },
        ],
        noises: [
          {
            noise: 'pink',
            filter: { type: 'bandpass', freq: 420, endFreq: 220, q: 1.8 },
            delay: 0,
            duration: 0.032,
            attack: 0.002,
            gain: 0.08,
            optional: true,
          },
        ],
        durationSec: 0.14,
        isFanfare: false,
      };
      break;
  }

  return scaleRecipe(recipe, pitchMult);
}

function tryCreateBiquadFilter(
  ctx: BaseAudioContext,
  spec: FilterSpec,
  startTime: number,
  duration: number,
  sampleRate: number,
): BiquadFilterNode | null {
  if (typeof ctx.createBiquadFilter !== 'function') return null;
  let filter: BiquadFilterNode | null = null;
  try {
    filter = ctx.createBiquadFilter();
    filter.type = spec.type;
    const startFreq = clampFilterFreq(spec.freq, sampleRate);
    setParamValueSafe(filter.Q, clampQ(spec.q), startTime);
    setParamValueSafe(filter.frequency, startFreq, startTime);
    if (spec.endFreq !== undefined) {
      const endFreq = clampFilterFreq(spec.endFreq, sampleRate);
      exponentialRampSafe(filter.frequency, endFreq, startTime + duration);
    }
    return filter;
  } catch {
    disconnectSafely(filter);
    return null;
  }
}

export function scheduleSfxRecipe(
  ctx: BaseAudioContext,
  destination: AudioNode,
  recipe: SfxRecipe,
  options: ScheduleRecipeOptions,
): number {
  const {
    baseTime,
    gainScale,
    trimOptional = false,
    deterministicNoiseOffset = false,
    noiseOffsetStep = 0,
    tracker,
  } = options;

  const sampleRate = safeSampleRate(ctx);

  let startedCount = 0;

  // 1. Schedule warm tonal layers (sine / triangle only)
  for (const layer of recipe.tones) {
    if (trimOptional && layer.optional) continue;
    if (tracker && !tracker.canStartSource()) break;

    const startTime = Math.max(0, baseTime + Math.max(0, layer.delay));
    const duration = Math.max(0.02, layer.duration);
    const rawAttack = layer.attack ?? Math.min(0.006, duration * 0.25);
    const attack = Math.min(Math.max(0.001, rawAttack), duration * 0.45);
    const startFreq = clampFreq(layer.freq);
    const peakGain = clampGain(layer.gain * gainScale);

    let osc: OscillatorNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let gain: GainNode | null = null;
    let sourceStarted = false;
    let sourceEnded = false;

    const onEnded = () => {
      if (sourceEnded) return;
      sourceEnded = true;
      if (sourceStarted && tracker) {
        tracker.onSourceEnded();
      }
      disconnectSafely(osc, filter, gain);
    };

    try {
      osc = ctx.createOscillator();
      osc.type = layer.type;
      setParamValueSafe(osc.frequency, startFreq, startTime);
      if (layer.endFreq !== undefined) {
        exponentialRampSafe(osc.frequency, clampFreq(layer.endFreq), startTime + duration);
      }

      if (layer.filter) {
        filter = tryCreateBiquadFilter(ctx, layer.filter, startTime, duration, sampleRate);
      }

      if (typeof ctx.createGain === 'function') {
        gain = ctx.createGain();
        setParamValueSafe(gain.gain, 0.0001, startTime);
        linearRampSafe(gain.gain, peakGain, startTime + attack);
        exponentialRampSafe(gain.gain, 0.0001, startTime + duration);
      }

      if (filter && gain) {
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(destination);
      } else if (gain) {
        osc.connect(gain);
        gain.connect(destination);
      } else if (filter) {
        osc.connect(filter);
        filter.connect(destination);
      } else {
        osc.connect(destination);
      }

      if (tracker) {
        osc.onended = onEnded;
        sourceStarted = true;
        tracker.onSourceStarted();
      }

      osc.start(startTime);
      osc.stop(startTime + duration + 0.025);
      startedCount += 1;
    } catch {
      onEnded();
    }
  }

  // 2. Schedule filtered cached white/pink noise layers
  if (recipe.noises.length > 0 && typeof ctx.createBufferSource === 'function') {
    const noiseBank = getCachedNoiseBank(ctx);
    if (noiseBank) {
      let layerIdx = 0;
      for (const layer of recipe.noises) {
        layerIdx += 1;
        if (trimOptional && layer.optional) continue;
        if (tracker && !tracker.canStartSource()) break;

        const startTime = Math.max(0, baseTime + Math.max(0, layer.delay));
        const duration = Math.max(0.02, layer.duration);
        const rawAttack = layer.attack ?? Math.min(0.008, duration * 0.25);
        const attack = Math.min(Math.max(0.001, rawAttack), duration * 0.45);
        const buffer = layer.noise === 'pink' ? noiseBank.pink : noiseBank.white;

        let src: AudioBufferSourceNode | null = null;
        let filter: BiquadFilterNode | null = null;
        let gain: GainNode | null = null;
        let sourceStarted = false;
        let sourceEnded = false;

        const onEnded = () => {
          if (sourceEnded) return;
          sourceEnded = true;
          if (sourceStarted && tracker) {
            tracker.onSourceEnded();
          }
          disconnectSafely(src, filter, gain);
        };

        try {
          src = ctx.createBufferSource();
          src.buffer = buffer;

          const bufDur =
            typeof buffer.duration === 'number' && Number.isFinite(buffer.duration) && buffer.duration > 0
              ? buffer.duration
              : buffer.length / sampleRate;
          if (duration + 0.05 >= bufDur) {
            src.loop = true;
          }

          filter = tryCreateBiquadFilter(ctx, layer.filter, startTime, duration, sampleRate);
          // When a minimal mock omits BiquadFilterNode, softly trim unfiltered noise gain.
          const effectiveGain = clampGain(layer.gain * gainScale * (filter ? 1 : 0.45));

          if (typeof ctx.createGain === 'function') {
            gain = ctx.createGain();
            setParamValueSafe(gain.gain, 0.0001, startTime);
            linearRampSafe(gain.gain, effectiveGain, startTime + attack);
            exponentialRampSafe(gain.gain, 0.0001, startTime + duration);
          }

          if (filter && gain) {
            src.connect(filter);
            filter.connect(gain);
            gain.connect(destination);
          } else if (gain) {
            src.connect(gain);
            gain.connect(destination);
          } else if (filter) {
            src.connect(filter);
            filter.connect(destination);
          } else {
            src.connect(destination);
          }

          let offsetSec = 0;
          if (!deterministicNoiseOffset) {
            const maxOffset = Math.max(0, bufDur - duration - 0.05);
            if (maxOffset > 0.05) {
              offsetSec = (((noiseOffsetStep + layerIdx) % 7) * 0.09) % maxOffset;
            }
          }

          if (tracker) {
            src.onended = onEnded;
            sourceStarted = true;
            tracker.onSourceStarted();
          }

          src.start(startTime, offsetSec);
          src.stop(startTime + duration + 0.025);
          startedCount += 1;
        } catch {
          onEnded();
        }
      }
    }
  }

  return startedCount;
}

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function computeRbjBiquad(
  type: FilterSpec['type'],
  freq: number,
  q: number,
  sampleRate: number,
): BiquadCoeffs {
  const safeFreq = clampFilterFreq(freq, sampleRate);
  const safeQ = clampQ(q);
  const w0 = (2 * Math.PI * safeFreq) / sampleRate;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * safeQ);

  let b0: number;
  let b1: number;
  let b2: number;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW;
  const a2 = 1 - alpha;

  switch (type) {
    case 'lowpass':
      b0 = (1 - cosW) * 0.5;
      b1 = 1 - cosW;
      b2 = (1 - cosW) * 0.5;
      break;
    case 'highpass':
      b0 = (1 + cosW) * 0.5;
      b1 = -(1 + cosW);
      b2 = (1 + cosW) * 0.5;
      break;
    case 'bandpass':
      // Constant 0 dB peak gain (matches Web Audio BiquadFilterNode spec)
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      break;
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/**
 * Deterministic Node analytical PCM fallback mirroring the live Web Audio graph:
 * renders all sine/triangle tone layers, deterministic white/pink noise layers,
 * Direct-Form II Transposed RBJ biquad filters, master gain ceiling, and a
 * soft-knee -12 dB / 18 dB knee / 6:1 limiter.
 */
export function renderRecipeAnalytical(
  recipe: SfxRecipe,
  frameCount: number,
  sampleRate: number,
  gainScale = 1,
): Float32Array {
  const safeFrames = Math.max(1, Math.floor(frameCount));
  const out = new Float32Array(safeFrames);
  if (gainScale <= 0 || !Number.isFinite(gainScale)) return out;

  // 1. Tone layers
  for (const layer of recipe.tones) {
    const startSec = Math.max(0, layer.delay);
    const duration = Math.max(0.02, layer.duration);
    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.min(safeFrames, Math.ceil((startSec + duration) * sampleRate));
    if (startSample >= safeFrames || endSample <= startSample) continue;

    const rawAttack = layer.attack ?? Math.min(0.006, duration * 0.25);
    const attack = Math.min(Math.max(0.001, rawAttack), duration * 0.45);
    const startFreq = clampFreq(layer.freq);
    const endFreq = layer.endFreq !== undefined ? clampFreq(layer.endFreq) : startFreq;
    const peakGain = clampGain(layer.gain * gainScale);
    const decayDuration = Math.max(0.0001, duration - attack);
    const decayRatio = 0.0001 / peakGain;

    let phase = 0;
    const filterSpec = layer.filter;
    let coeffs = filterSpec
      ? computeRbjBiquad(filterSpec.type, filterSpec.freq, filterSpec.q ?? 1, sampleRate)
      : null;
    let z1 = 0;
    let z2 = 0;

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / sampleRate;
      const frac = Math.min(1, Math.max(0, t / duration));
      const instFreq =
        endFreq === startFreq ? startFreq : startFreq * Math.pow(endFreq / startFreq, frac);

      let env: number;
      if (t < attack) {
        env = 0.0001 + (peakGain - 0.0001) * (t / attack);
      } else {
        const decayFrac = Math.min(1, (t - attack) / decayDuration);
        env = peakGain * Math.pow(decayRatio, decayFrac);
      }

      let sample =
        layer.type === 'triangle'
          ? 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5)
          : Math.sin(phase * 2 * Math.PI);

      if (filterSpec && coeffs) {
        if (filterSpec.endFreq !== undefined && (i - startSample) % 32 === 0) {
          const fStart = clampFilterFreq(filterSpec.freq, sampleRate);
          const fEnd = clampFilterFreq(filterSpec.endFreq, sampleRate);
          const instCut = fStart * Math.pow(fEnd / fStart, frac);
          coeffs = computeRbjBiquad(filterSpec.type, instCut, filterSpec.q ?? 1, sampleRate);
        }
        const y = coeffs.b0 * sample + z1;
        z1 = coeffs.b1 * sample - coeffs.a1 * y + z2;
        z2 = coeffs.b2 * sample - coeffs.a2 * y;
        sample = y;
      }

      out[i] += sample * env;
      phase = (phase + instFreq / sampleRate) % 1;
    }
  }

  // 2. Filtered noise layers
  if (recipe.noises.length > 0) {
    let whiteCache: Float32Array | null = null;
    let pinkCache: Float32Array | null = null;

    for (const layer of recipe.noises) {
      const startSec = Math.max(0, layer.delay);
      const duration = Math.max(0.02, layer.duration);
      const startSample = Math.floor(startSec * sampleRate);
      const endSample = Math.min(safeFrames, Math.ceil((startSec + duration) * sampleRate));
      if (startSample >= safeFrames || endSample <= startSample) continue;

      const rawAttack = layer.attack ?? Math.min(0.008, duration * 0.25);
      const attack = Math.min(Math.max(0.001, rawAttack), duration * 0.45);
      const peakGain = clampGain(layer.gain * gainScale);
      const decayDuration = Math.max(0.0001, duration - attack);
      const decayRatio = 0.0001 / peakGain;

      let noiseBuf: Float32Array;
      if (layer.noise === 'pink') {
        if (!pinkCache) {
          pinkCache = generatePinkNoiseSamples(
            Math.max(256, Math.round(sampleRate * 1.5)),
            PINK_NOISE_SEED,
          );
        }
        noiseBuf = pinkCache;
      } else {
        if (!whiteCache) {
          whiteCache = generateWhiteNoiseSamples(
            Math.max(256, Math.round(sampleRate * 1.0)),
            WHITE_NOISE_SEED,
          );
        }
        noiseBuf = whiteCache;
      }

      const fStart = clampFilterFreq(layer.filter.freq, sampleRate);
      const fEnd =
        layer.filter.endFreq !== undefined
          ? clampFilterFreq(layer.filter.endFreq, sampleRate)
          : fStart;
      let coeffs = computeRbjBiquad(layer.filter.type, fStart, layer.filter.q ?? 1, sampleRate);
      let z1 = 0;
      let z2 = 0;

      for (let i = startSample; i < endSample; i++) {
        const localIdx = i - startSample;
        const t = localIdx / sampleRate;
        const frac = Math.min(1, Math.max(0, t / duration));

        if (fEnd !== fStart && localIdx % 32 === 0) {
          const instCut = fStart * Math.pow(fEnd / fStart, frac);
          coeffs = computeRbjBiquad(layer.filter.type, instCut, layer.filter.q ?? 1, sampleRate);
        }

        const x = noiseBuf[localIdx % noiseBuf.length];
        const y = coeffs.b0 * x + z1;
        z1 = coeffs.b1 * x - coeffs.a1 * y + z2;
        z2 = coeffs.b2 * x - coeffs.a2 * y;

        let env: number;
        if (t < attack) {
          env = 0.0001 + (peakGain - 0.0001) * (t / attack);
        } else {
          const decayFrac = Math.min(1, (t - attack) / decayDuration);
          env = peakGain * Math.pow(decayRatio, decayFrac);
        }

        out[i] += y * env;
      }
    }
  }

  // 3. Master gain ceiling + soft-knee -12 dB / 18 dB knee / 6:1 limiter
  const thresholdDb = -12;
  const kneeDb = 18;
  const ratio = 6;
  const halfKnee = kneeDb * 0.5;

  for (let i = 0; i < safeFrames; i++) {
    let x = out[i] * MASTER_GAIN_CEILING;
    const abs = Math.abs(x);
    if (abs > 1e-6) {
      const db = 20 * Math.log10(abs);
      let outDb = db;
      if (db - thresholdDb > halfKnee) {
        outDb = thresholdDb + (db - thresholdDb) / ratio;
      } else if (Math.abs(db - thresholdDb) <= halfKnee) {
        const delta = db - thresholdDb + halfKnee;
        outDb = db + ((1 / ratio - 1) * delta * delta) / (2 * kneeDb);
      }
      if (outDb !== db) {
        x *= Math.pow(10, (outDb - db) / 20);
      }
    }
    out[i] = Math.max(-0.98, Math.min(0.98, x));
  }

  return out;
}

export function analyzeSamples(samples: Float32Array): OfflineAudioSampleResult {
  let peak = 0;
  let sumSq = 0;
  let finite = samples.length > 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) {
      finite = false;
      continue;
    }
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
  }
  const rms = samples.length > 0 ? Math.sqrt(sumSq / samples.length) : 0;
  return {
    peak,
    rms,
    finite: finite && Number.isFinite(peak) && Number.isFinite(rms),
  };
}
