/**
 * Shared audio contracts, synthesis IR types, constants, and defensive clamp helpers.
 * 100% pure TypeScript — zero Web Audio or DOM side effects, 100% Node-safe.
 */

export type SfxName =
  | 'tap'
  | 'tab'
  | 'sheet_open'
  | 'sheet_close'
  | 'upgrade'
  | 'unlock'
  | 'milestone'
  | 'achievement'
  | 'coin'
  | 'perfect'
  | 'divine'
  | 'tip'
  | 'order'
  | 'sizzle'
  | 'instant_cook'
  | 'customer_happy'
  | 'boost'
  | 'box'
  | 'renovate'
  | 'city_flight'
  | 'error';

export interface SfxPlayOptions {
  combo?: number; // 0..24+ rising pentatonic step for hold-to-upgrade
  pitchJitter?: number; // optional relative pitch multiplier override
  intensity?: number; // 0..1 relative loudness scalar
}

export interface SoundEngineStateSummary {
  enabled: boolean;
  sfxVolume: number;
  ambientEnabled: boolean;
  ambientVolume: number;
  unlocked: boolean;
  contextState: string;
  activeVoices: number;
}

export interface OfflineAudioSampleResult {
  peak: number;
  rms: number;
  finite: boolean;
}

export type NoiseKind = 'white' | 'pink';

/** Strictly warm waveforms — zero harsh sawtooth or square oscillators anywhere. */
export type WarmOscillatorType = 'sine' | 'triangle';

export type RecipeFilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface FilterSpec {
  type: RecipeFilterType;
  freq: number;
  endFreq?: number;
  q?: number;
}

export interface ToneLayerSpec {
  freq: number;
  endFreq?: number;
  duration: number;
  attack?: number;
  type: WarmOscillatorType;
  gain: number;
  delay: number;
  filter?: FilterSpec;
  optional?: boolean;
}

export interface NoiseLayerSpec {
  noise: NoiseKind;
  duration: number;
  attack?: number;
  gain: number;
  delay: number;
  filter: FilterSpec;
  optional?: boolean;
}

export interface SfxRecipe {
  tones: ToneLayerSpec[];
  noises: NoiseLayerSpec[];
  durationSec: number;
  isFanfare: boolean;
  fanfareHoldSec?: number;
}

export interface AudioBusGraph {
  sfxInput: AudioNode;
  ambientInput: AudioNode;
  sfxBusGain: GainNode | null;
  ambientBusGain: GainNode | null;
  masterGain: GainNode | null;
  compressor: DynamicsCompressorNode | null;
  usesBusSfxGain: boolean;
}

export const ALL_SFX_NAMES: readonly SfxName[] = [
  'tap',
  'tab',
  'sheet_open',
  'sheet_close',
  'upgrade',
  'unlock',
  'milestone',
  'achievement',
  'coin',
  'perfect',
  'divine',
  'tip',
  'order',
  'sizzle',
  'instant_cook',
  'customer_happy',
  'boost',
  'box',
  'renovate',
  'city_flight',
  'error',
] as const;

export const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9] as const;

export const MAX_CONCURRENT_VOICES = 24;
export const MAX_ACTIVE_SOURCE_NODES = 64;
export const LOD_TRIM_THRESHOLD = 44;
export const MIN_VALID_SAMPLE_RATE = 3000;

export function clampUnit(value: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function clampFreq(freq: number): number {
  if (typeof freq !== 'number' || !Number.isFinite(freq)) return 440;
  return Math.min(20000, Math.max(20, freq));
}

export function clampFilterFreq(freq: number, sampleRate: number): number {
  const safeRate =
    typeof sampleRate === 'number' &&
    Number.isFinite(sampleRate) &&
    sampleRate >= MIN_VALID_SAMPLE_RATE
      ? sampleRate
      : 44100;
  const maxFreq = Math.min(18000, safeRate * 0.45);
  if (typeof freq !== 'number' || !Number.isFinite(freq)) return Math.min(1000, maxFreq);
  return Math.min(maxFreq, Math.max(40, freq));
}

export function clampGain(gain: number): number {
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return 0.0001;
  return Math.min(0.85, Math.max(0.0001, gain));
}

export function clampQ(q: number | undefined): number {
  if (typeof q !== 'number' || !Number.isFinite(q)) return 1.0;
  return Math.min(18, Math.max(0.1, q));
}

export function clampPitchMult(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 1;
  return Math.min(4, Math.max(0.25, value));
}

export function isResumableContextState(state: string): boolean {
  return state === 'suspended' || state === 'interrupted';
}
