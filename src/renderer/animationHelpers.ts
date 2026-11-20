import type * as THREE from 'three';

export interface CharacterAnimState {
  walkPhase: number;          // Accumulated monotonically ONLY while moving [0, 2π)
  facing: number;             // Smoothed yaw angle (rad)
  hopPulse: number;           // 1 -> 0 happy hop / spawn bounce pulse
  spawnProgress: number;      // 0 -> 1 elastic pop-in scale
  blinkTimer: number;         // Countdown (sec) until next blink
  blinkElapsed: number;       // Active blink elapsed (0..BLINK_DURATION), < 0 when open
  happyTimer: number;         // Remaining seconds for happy smile expression
  lastDeliveredCount: number; // Diff detector for customer dish delivery
  lastSpeed: number;          // Smoothed world speed (units/sec)
  dustCooldown: number;       // Remaining sec until next speed dust puff
  sparkleCooldown: number;    // Remaining sec until next golden/divine sparkle
  prevRenderX: number;
  prevRenderZ: number;
  phaseSeed: number;          // Deterministic per-entity offset so crowds don't sync-march
}

export interface CarAnimState {
  yaw: number;                // Smoothed steering yaw (rad, 0 = pointing +X)
  wheelAngle: number;         // Accumulated wheel rotation angle (rad)
  hopPulse: number;           // 1 -> 0 happy delivery bounce / arrival brake dip
  spawnProgress: number;      // 0 -> 1 pop-in
  lastDeliveredCount: number;
  prevRenderX: number;
  prevRenderZ: number;
  phaseSeed: number;
  wasMoving: boolean;
}

export interface PetAnimState {
  hopPhase: number;           // Accumulated scamper bounce phase
  facing: number;
  spawnProgress: number;
  lastSpeed: number;
  dustCooldown: number;
  sparkleCooldown: number;
  prevRenderX: number;
  prevRenderZ: number;
  phaseSeed: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

const TWO_PI = Math.PI * 2;
const BLINK_DURATION = 0.13;

/**
 * Deterministic FNV-1a hash mapping any entity ID to [0, 2π).
 * Keeps crowd blinks, breathing, and waddles organic without Math.random().
 */
export function hashEntitySeed(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h % 10000) / 10000) * TWO_PI;
}

export function createCharacterAnimState(
  id: string,
  initialFacing: number,
  x: number,
  z: number,
  startPoppedIn = true,
  initialDeliveredCount = 0,
): CharacterAnimState {
  const seed = hashEntitySeed(id);
  return {
    walkPhase: seed,
    facing: normalizeAngle(initialFacing),
    hopPulse: 0,
    spawnProgress: startPoppedIn ? 1 : 0.001,
    blinkTimer: 1.4 + (seed / TWO_PI) * 3.0,
    blinkElapsed: -1,
    happyTimer: 0,
    lastDeliveredCount: initialDeliveredCount,
    lastSpeed: 0,
    dustCooldown: 0,
    sparkleCooldown: (seed / TWO_PI) * 0.5,
    prevRenderX: x,
    prevRenderZ: z,
    phaseSeed: seed,
  };
}

export function createCarAnimState(
  id: string,
  x: number,
  z: number,
  startPoppedIn = true,
  initialDeliveredCount = 0,
): CarAnimState {
  const seed = hashEntitySeed(id);
  return {
    yaw: 0,
    wheelAngle: seed,
    hopPulse: 0,
    spawnProgress: startPoppedIn ? 1 : 0.001,
    lastDeliveredCount: initialDeliveredCount,
    prevRenderX: x,
    prevRenderZ: z,
    phaseSeed: seed,
    wasMoving: false,
  };
}

export function createPetAnimState(
  id: string,
  initialFacing: number,
  x: number,
  z: number,
  startPoppedIn = true,
): PetAnimState {
  const seed = hashEntitySeed(id);
  return {
    hopPhase: seed,
    facing: normalizeAngle(initialFacing),
    spawnProgress: startPoppedIn ? 1 : 0.001,
    lastSpeed: 0,
    dustCooldown: 0,
    sparkleCooldown: (seed / TWO_PI) * 0.4,
    prevRenderX: x,
    prevRenderZ: z,
    phaseSeed: seed,
  };
}

/**
 * Wraps any finite angle cleanly into (-π, π].
 */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  let a = ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/**
 * Shortest-path angular interpolation across the ±π seam.
 */
export function lerpAngle(current: number, target: number, factor: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(factor) ? factor : 0));
  const cur = normalizeAngle(current);
  const tgt = normalizeAngle(target);
  const delta = normalizeAngle(tgt - cur);
  return normalizeAngle(cur + delta * t);
}

/**
 * Frame-rate independent exponential damping factor for both 30 and 60 FPS.
 */
export function expDampFactor(lambda: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;
  return 1 - Math.exp(-lambda * dt);
}

/**
 * Substepped damped harmonic spring (guaranteed unconditionally stable even under huge dt spikes).
 */
export function stepSpring(
  state: SpringState,
  target: number,
  dt: number,
  stiffness = 180,
  damping = 14,
): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(state.value)) state.value = safeTarget;
  if (!Number.isFinite(state.velocity)) state.velocity = 0;
  if (!Number.isFinite(dt) || dt <= 0) return state.value;

  const safeStiffness = Number.isFinite(stiffness) && stiffness > 0 ? stiffness : 180;
  const safeDamping = Number.isFinite(damping) && damping >= 0 ? damping : 14;

  // Clamp total dt to prevent runaway simulation on tab resume, and substep <= 1/60s
  const clampedDt = Math.min(0.25, dt);
  const maxStep = 1 / 60;
  const substeps = Math.max(1, Math.ceil(clampedDt / maxStep));
  const h = clampedDt / substeps;

  for (let i = 0; i < substeps; i++) {
    const force = (safeTarget - state.value) * safeStiffness - state.velocity * safeDamping;
    state.velocity += force * h;
    state.value += state.velocity * h;
  }

  return state.value;
}

/**
 * Elastic overshoot pop-in curve for t ∈ [0, 1] (0.001 -> ~1.16 -> 0.98 -> 1.0).
 */
export function evaluateElasticPop(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0.001;
  if (t >= 1) return 1;
  const raw = 1 - Math.exp(-4.8 * t) * Math.cos(t * Math.PI * 2.5);
  return Math.max(0.001, raw);
}

/**
 * Volume-preserving (sx * sy * sz === 1) squash-and-stretch written directly into `outScale`.
 * Zero allocations.
 */
export function writeSquashStretch(
  outScale: THREE.Vector3,
  pulse: number,
  amp = 0.22,
): void {
  if (!Number.isFinite(pulse) || pulse <= 0.0005) {
    outScale.set(1, 1, 1);
    return;
  }
  const safeAmp = Math.min(0.45, Math.max(0, Number.isFinite(amp) ? amp : 0.22));
  const u = 1 - Math.min(1, Math.max(0, pulse));
  const stretch = Math.sin(u * Math.PI * 2.5) * Math.exp(-3.4 * u) * safeAmp;
  const sy = Math.max(0.65, Math.min(1.6, 1 + stretch));
  const sxz = 1 / Math.sqrt(sy);
  outScale.set(sxz, sy, sxz);
}

/**
 * Phase-clean walk cycle accumulation (never mixes world X/Z into phase).
 */
export function advanceWalkPhase(
  phase: number,
  speed: number,
  dt: number,
  minRate = 9,
  maxRate = 24,
): number {
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const safeSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
  const rate = Math.min(maxRate, Math.max(minRate, safeSpeed * 3.4));
  const next = (safePhase + safeDt * rate) % TWO_PI;
  return next < 0 ? next + TWO_PI : next;
}

/**
 * Steps deterministic blinking and happy expression timer without allocations.
 * Returns `eyeScaleY` (0.12 during blink, 1.0 when open) and `isHappy`.
 */
export function stepBlinkAndExpression(
  state: CharacterAnimState,
  dt: number,
): { eyeScaleY: number; isHappy: boolean; eyelidScaleY: number } {
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;

  if (!Number.isFinite(state.happyTimer)) state.happyTimer = 0;
  if (!Number.isFinite(state.blinkTimer)) state.blinkTimer = 2.0;
  if (!Number.isFinite(state.blinkElapsed)) state.blinkElapsed = -1;

  if (state.happyTimer > 0) {
    state.happyTimer = Math.max(0, state.happyTimer - safeDt);
  }

  let eyeScaleY = 1.0;
  let eyelidScaleY = 0.01;

  if (state.blinkElapsed >= 0) {
    state.blinkElapsed += safeDt;
    if (state.blinkElapsed >= BLINK_DURATION) {
      state.blinkElapsed = -1;
      const seed = Number.isFinite(state.phaseSeed) ? state.phaseSeed : 0;
      const walk = Number.isFinite(state.walkPhase) ? state.walkPhase : 0;
      const frac = (((seed + walk) % TWO_PI) + TWO_PI) % TWO_PI / TWO_PI;
      state.blinkTimer = 2.4 + frac * 2.4;
    } else {
      const mid = Math.sin((state.blinkElapsed / BLINK_DURATION) * Math.PI);
      eyeScaleY = 1 - mid * 0.88;
      eyelidScaleY = 0.01 + mid * 1.12;
    }
  } else {
    state.blinkTimer -= safeDt;
    if (state.blinkTimer <= 0) {
      // Enter the bell curve smoothly on frame 1 (no instant 1.1 -> 0.45 double-twitch)
      state.blinkElapsed = Math.min(Math.max(safeDt, 0.008), BLINK_DURATION * 0.99);
      const mid = Math.sin((state.blinkElapsed / BLINK_DURATION) * Math.PI);
      eyeScaleY = 1 - mid * 0.88;
      eyelidScaleY = 0.01 + mid * 1.12;
    }
  }

  return {
    eyeScaleY,
    isHappy: state.happyTimer > 0,
    eyelidScaleY,
  };
}

/**
 * Converts simulation entity facing (`atan2(vx, vz)`) to `+X`-nose drive-thru car yaw.
 * Moving along `+X` (`facing = +π/2`) yields `0`; parked cars damp cleanly back to `0`.
 */
export function computeCarSteeringYaw(
  facing: number,
  isMoving: boolean,
  currentYaw: number,
  dt: number,
): number {
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
  const targetYaw = isMoving ? normalizeAngle(facing - Math.PI / 2) : 0;
  const clampTarget = Math.max(-0.55, Math.min(0.55, targetYaw));
  return lerpAngle(currentYaw, clampTarget, expDampFactor(10, safeDt));
}

/**
 * Periodic gift-box wiggle (active for 0.55s every 2.1s) when a locked station crate is affordable.
 */
export function evaluateCrateWiggle(
  animClock: number,
  phaseSeed: number,
): { rotZ: number; hopY: number; bowScale: number } {
  if (!Number.isFinite(animClock) || !Number.isFinite(phaseSeed)) {
    return { rotZ: 0, hopY: 0, bowScale: 1 };
  }
  const cycle = 2.1;
  const activeWin = 0.55;
  const localT = (((animClock + phaseSeed * 0.3) % cycle) + cycle) % cycle;
  if (localT >= activeWin) {
    return { rotZ: 0, hopY: 0, bowScale: 1 };
  }
  const u = localT / activeWin;
  const env = Math.sin(u * Math.PI);
  const rotZ = Math.sin(u * Math.PI * 5) * 0.11 * env;
  const hopY = Math.abs(Math.sin(u * Math.PI * 2)) * 0.10 * env;
  const bowScale = 1 + env * 0.14;
  return { rotZ, hopY, bowScale };
}
