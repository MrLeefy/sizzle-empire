/**
 * Deterministic seeded procedural noise generators (Mulberry32 white noise +
 * Paul Kellet 7-stage pink noise with 128-sample warmup, DC removal, and peak normalization)
 * and per-BaseAudioContext WeakMap caching.
 */

import { safeSampleRate } from './audioGraph';

export interface CachedNoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  sampleRate: number;
}

export const WHITE_NOISE_SEED = 0x51a2e7c3;
export const PINK_NOISE_SEED = 0x9e3779b9;
export const WHITE_NOISE_DURATION_SEC = 1.0;
export const PINK_NOISE_DURATION_SEC = 1.5;
export const PINK_WARMUP_SAMPLES = 128;
export const NOISE_TARGET_PEAK = 0.9;

const noiseBankCache = new WeakMap<BaseAudioContext, CachedNoiseBank>();

export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAndRemoveDc(samples: Float32Array, targetPeak: number): Float32Array {
  const len = samples.length;
  if (len === 0) return samples;

  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += samples[i];
  }
  const mean = sum / len;

  let peak = 0;
  for (let i = 0; i < len; i++) {
    const centered = samples[i] - mean;
    samples[i] = centered;
    const abs = Math.abs(centered);
    if (abs > peak) peak = abs;
  }

  if (peak > 0 && Number.isFinite(peak)) {
    const scale = targetPeak / peak;
    for (let i = 0; i < len; i++) {
      samples[i] *= scale;
    }
  }
  return samples;
}

export function generateWhiteNoiseSamples(
  length: number,
  seed: number = WHITE_NOISE_SEED,
): Float32Array {
  const safeLen = Math.max(0, Math.floor(Number.isFinite(length) ? length : 0));
  const samples = new Float32Array(safeLen);
  if (safeLen === 0) return samples;

  const rand = createMulberry32(seed);
  for (let i = 0; i < safeLen; i++) {
    samples[i] = rand() * 2 - 1;
  }
  return normalizeAndRemoveDc(samples, NOISE_TARGET_PEAK);
}

export function generatePinkNoiseSamples(
  length: number,
  seed: number = PINK_NOISE_SEED,
): Float32Array {
  const safeLen = Math.max(0, Math.floor(Number.isFinite(length) ? length : 0));
  const samples = new Float32Array(safeLen);
  if (safeLen === 0) return samples;

  const rand = createMulberry32(seed);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  // 128-sample warmup brings the 7-stage filter into steady state without startup thump.
  for (let i = 0; i < PINK_WARMUP_SAMPLES; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    b6 = w * 0.115926;
  }

  for (let i = 0; i < safeLen; i++) {
    const w = rand() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
    samples[i] = out;
  }

  return normalizeAndRemoveDc(samples, NOISE_TARGET_PEAK);
}

export function getCachedNoiseBank(ctx: BaseAudioContext): CachedNoiseBank | null {
  const cached = noiseBankCache.get(ctx);
  if (cached) return cached;

  if (typeof ctx.createBuffer !== 'function') return null;

  const sampleRate = Math.round(safeSampleRate(ctx));

  const whiteLen = Math.max(256, Math.round(sampleRate * WHITE_NOISE_DURATION_SEC));
  const pinkLen = Math.max(256, Math.round(sampleRate * PINK_NOISE_DURATION_SEC));

  try {
    const white = ctx.createBuffer(1, whiteLen, sampleRate);
    const whiteData = white.getChannelData(0);
    whiteData.set(generateWhiteNoiseSamples(whiteData.length, WHITE_NOISE_SEED));

    const pink = ctx.createBuffer(1, pinkLen, sampleRate);
    const pinkData = pink.getChannelData(0);
    pinkData.set(generatePinkNoiseSamples(pinkData.length, PINK_NOISE_SEED));

    const bank: CachedNoiseBank = { white, pink, sampleRate };
    noiseBankCache.set(ctx, bank);
    return bank;
  } catch {
    return null;
  }
}

export function clearCachedNoiseBank(ctx: BaseAudioContext | null): void {
  if (!ctx) return;
  try {
    noiseBankCache.delete(ctx);
  } catch {
    // Ignore WeakMap cleanup failures on torn-down contexts.
  }
}
