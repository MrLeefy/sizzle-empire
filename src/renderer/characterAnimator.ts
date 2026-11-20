import type * as THREE from 'three';

/**
 * Procedural, pose-blended chibi character animator.
 *
 * Every frame an activity-specific *target pose* is synthesised from time, walk phase and a few
 * gameplay signals. When the activity changes, the currently displayed pose is snapshotted and
 * cross-faded into the new target with a smoothstep curve, so characters never snap between
 * states (e.g. cooking -> walking). On top of the blended pose, a few layered secondary motions
 * are applied: a sprung head that lags body bounces, a jiggling hat, lean-into-turns, footfall
 * squash, celebration "yay!" arms, idle look-arounds and expressive brows.
 *
 * All math is allocation-free per frame and NaN-guarded.
 */

export type CharacterActivity =
  | 'idle'
  | 'walk'
  | 'cook'
  | 'take_order'
  | 'stand_wait'
  | 'stand_order'
  | 'sit'
  | 'sit_wait'
  | 'sit_eat';

export interface CharacterPose {
  bodyY: number;
  bodyZ: number;
  bodyPitch: number;
  bodyRoll: number;
  bodyYaw: number;
  squash: number; // vertical scale (volume preserved on X/Z)
  headPitch: number;
  headYaw: number;
  headRoll: number;
  lArmX: number;
  lArmZ: number;
  rArmX: number;
  rArmZ: number;
  lLegX: number;
  rLegX: number;
  trayY: number;
  trayRoll: number;
  browRaise: number; // + happy/surprised, - frown
  browTilt: number;  // + angry (inner ends down)
  mouthOpen: number; // 0..1 (>0.5 shows open grin)
}

export interface CharacterAnimInput {
  activity: CharacterActivity;
  dt: number;
  clock: number;
  speed: number;
  carrying: boolean;
  /** 0..1, rises the longer a customer waits. */
  impatience: number;
  /** Remaining happy/celebration pulse, 1 -> 0. */
  hopPulse: number;
  /** True while the happy expression timer is active. */
  isHappy: boolean;
}

export interface CharacterPoseState {
  activity: CharacterActivity;
  blend: number;          // 0 -> 1 cross-fade progress into `activity`
  from: CharacterPose;    // snapshot of the displayed pose when the activity changed
  current: CharacterPose; // last displayed pose
  target: CharacterPose;  // scratch target buffer
  walkPhase: number;
  prevContact: number;    // last sign of the footfall signal, for landing squash
  landPulse: number;      // 1 -> 0 footfall squash pulse
  headSpringPos: number;
  headSpringVel: number;
  hatSpringPos: number;
  hatSpringVel: number;
  prevBodyY: number;
  prevFacing: number;
  turnLean: number;
  lookYaw: number;
  lookTarget: number;
  lookTimer: number;
  seed: number;
  styleVariant: number;   // 0/1 picks chopping vs stirring, etc.
}

/** Minimal structural view of a CharacterRig that the animator writes into. */
export interface AnimatableCharacterRig {
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  hatAnchor: THREE.Group;
  trayGroup: THREE.Group;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftBrow?: THREE.Object3D;
  rightBrow?: THREE.Object3D;
  neutralMouth: THREE.Object3D;
  happyMouth: THREE.Object3D;
  trayBaseY?: number;
  browBaseY?: number;
}

const TWO_PI = Math.PI * 2;
const BLEND_DURATION = 0.22;
const POSE_KEYS: readonly (keyof CharacterPose)[] = [
  'bodyY',
  'bodyZ',
  'bodyPitch',
  'bodyRoll',
  'bodyYaw',
  'squash',
  'headPitch',
  'headYaw',
  'headRoll',
  'lArmX',
  'lArmZ',
  'rArmX',
  'rArmZ',
  'lLegX',
  'rLegX',
  'trayY',
  'trayRoll',
  'browRaise',
  'browTilt',
  'mouthOpen',
] as const;

export function createNeutralPose(): CharacterPose {
  return {
    bodyY: 0,
    bodyZ: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    bodyYaw: 0,
    squash: 1,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    lArmX: 0,
    lArmZ: 0.1,
    rArmX: 0,
    rArmZ: -0.1,
    lLegX: 0,
    rLegX: 0,
    trayY: 0,
    trayRoll: 0,
    browRaise: 0,
    browTilt: 0,
    mouthOpen: 0,
  };
}

export function copyPose(out: CharacterPose, src: CharacterPose): CharacterPose {
  for (const k of POSE_KEYS) out[k] = src[k];
  return out;
}

export function lerpPose(
  out: CharacterPose,
  a: CharacterPose,
  b: CharacterPose,
  t: number,
): CharacterPose {
  const u = clamp01(t);
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}

export function createCharacterPoseState(
  seed: number,
  initialActivity: CharacterActivity = 'idle',
  initialFacing = 0,
): CharacterPoseState {
  const s = Number.isFinite(seed) ? seed : 0;
  return {
    activity: initialActivity,
    blend: 1,
    from: createNeutralPose(),
    current: createNeutralPose(),
    target: createNeutralPose(),
    walkPhase: s % TWO_PI,
    prevContact: 0,
    landPulse: 0,
    headSpringPos: 0,
    headSpringVel: 0,
    hatSpringPos: 0,
    hatSpringVel: 0,
    prevBodyY: 0,
    prevFacing: Number.isFinite(initialFacing) ? initialFacing : 0,
    turnLean: 0,
    lookYaw: 0,
    lookTarget: 0,
    lookTimer: 1 + (s % 1.7),
    seed: s,
    styleVariant: Math.floor(s * 7.31) % 2,
  };
}

export function resetCharacterPoseState(state: CharacterPoseState, facing = 0): void {
  state.activity = 'idle';
  state.blend = 1;
  copyPose(state.from, NEUTRAL);
  copyPose(state.current, NEUTRAL);
  state.landPulse = 0;
  state.prevContact = 0;
  state.headSpringPos = 0;
  state.headSpringVel = 0;
  state.hatSpringPos = 0;
  state.hatSpringVel = 0;
  state.prevBodyY = 0;
  state.prevFacing = Number.isFinite(facing) ? facing : 0;
  state.turnLean = 0;
  state.lookYaw = 0;
  state.lookTarget = 0;
}

const NEUTRAL = createNeutralPose();

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  let r = (a + Math.PI) % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r - Math.PI;
}

/** Cheap deterministic pseudo-random in [0,1) from two numbers. */
function hash01(a: number, b: number): number {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function stepDampedSpring(
  pos: number,
  vel: number,
  target: number,
  dt: number,
  stiffness: number,
  damping: number,
): [number, number] {
  let p = Number.isFinite(pos) ? pos : target;
  let v = Number.isFinite(vel) ? vel : 0;
  const total = Math.min(0.1, dt);
  const steps = Math.max(1, Math.ceil(total / (1 / 120)));
  const h = total / steps;
  for (let i = 0; i < steps; i++) {
    const f = (target - p) * stiffness - v * damping;
    v += f * h;
    p += v * h;
  }
  return [p, v];
}

/**
 * Writes the activity's raw target pose into `out` (no blending, no secondary layers).
 */
export function synthesizeTargetPose(
  out: CharacterPose,
  state: CharacterPoseState,
  input: CharacterAnimInput,
): CharacterPose {
  copyPose(out, NEUTRAL);
  const t = Number.isFinite(input.clock) ? input.clock : 0;
  const seed = state.seed;
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
  const impatience = clamp01(input.impatience);

  switch (input.activity) {
    case 'walk': {
      // Smooth, grounded glide: quick little steps, a gentle sinusoidal bob (no hop cusps),
      // light hip sway and relaxed arm swing.
      const s = Math.sin(state.walkPhase);
      const c = Math.cos(state.walkPhase);
      // 0..1, peaks twice per stride but is a pure cosine, so it never "kinks" like |cos|
      const bob = 0.5 - 0.5 * Math.cos(state.walkPhase * 2);
      const stride = clamp(0.38 + speed * 0.04, 0.38, 0.55);
      out.lLegX = s * stride;
      out.rLegX = -s * stride;
      out.bodyY = bob * 0.022;
      out.squash = 1;
      out.bodyPitch = clamp(0.04 + speed * 0.01, 0.04, 0.08);
      out.bodyRoll = s * 0.03;
      out.bodyYaw = s * 0.035;
      out.headRoll = -s * 0.015;
      out.headPitch = -0.03;
      if (input.carrying) {
        out.lArmX = -1.28 + c * 0.02;
        out.rArmX = -1.28 - c * 0.02;
        out.lArmZ = 0.16;
        out.rArmZ = -0.16;
        out.bodyPitch *= 0.5;
        out.trayY = bob * 0.006;
        out.trayRoll = s * 0.015;
      } else {
        out.lArmX = -s * 0.42;
        out.rArmX = s * 0.42;
        out.lArmZ = 0.14;
        out.rArmZ = -0.14;
      }
      out.browRaise = 0.15;
      break;
    }

    case 'cook': {
      out.bodyPitch = 0.16;
      out.headPitch = 0.22;
      if (state.styleVariant === 0) {
        // Rapid alternating chop with a rhythmic work-bounce
        const chop = Math.sin(t * 17 + seed);
        out.lArmX = -1.0 + chop * 0.45;
        out.rArmX = -1.0 - chop * 0.45;
        out.lArmZ = 0.2;
        out.rArmZ = -0.2;
        out.bodyY = Math.abs(chop) * 0.05;
        out.squash = 1 - Math.abs(chop) * 0.035;
        out.bodyRoll = chop * 0.04;
        out.headPitch += Math.abs(chop) * 0.06;
      } else {
        // Stirring: right arm circles, left arm steadies the pot, hips sway
        const a = t * 9 + seed;
        out.rArmX = -1.15 + Math.sin(a) * 0.28;
        out.rArmZ = -0.25 + Math.cos(a) * 0.3;
        out.lArmX = -0.95;
        out.lArmZ = 0.3;
        out.bodyRoll = Math.sin(a) * 0.06;
        out.bodyYaw = Math.cos(a) * 0.08;
        out.bodyY = (Math.sin(a * 2) * 0.5 + 0.5) * 0.03;
        out.headRoll = Math.sin(a) * 0.05;
      }
      out.browRaise = -0.1;
      out.browTilt = 0.25; // focused
      break;
    }

    case 'take_order': {
      const nod = Math.sin(t * 7 + seed);
      const write = Math.sin(t * 22 + seed);
      out.lArmX = -1.05;
      out.lArmZ = 0.28;
      out.rArmX = -0.95 + write * 0.18;
      out.rArmZ = -0.2 + Math.cos(t * 22 + seed) * 0.12;
      out.bodyPitch = 0.06 + nod * 0.04;
      out.headPitch = 0.12 + nod * 0.12;
      out.headRoll = 0.12;
      out.bodyY = Math.max(0, nod) * 0.02;
      out.browRaise = 0.2;
      break;
    }

    case 'stand_order': {
      // Chatty customer: head bobs, one hand gestures
      const talk = Math.sin(t * 6 + seed);
      out.rArmX = -0.9 + talk * 0.3;
      out.rArmZ = -0.35;
      out.lArmZ = 0.14;
      out.headPitch = -0.08 + talk * 0.06;
      out.headRoll = Math.sin(t * 3 + seed) * 0.08;
      out.bodyY = Math.max(0, talk) * 0.025;
      out.browRaise = 0.3;
      out.mouthOpen = talk > 0.2 ? 1 : 0;
      break;
    }

    case 'stand_wait':
    case 'sit_wait': {
      const seated = input.activity === 'sit_wait';
      // Wave for ~1.3s out of every 3.4s; otherwise look around / tap foot when impatient.
      const cycle = 3.4;
      const local = ((((t + seed) % cycle) + cycle) % cycle);
      const waving = local < 1.3;
      const waveEnv = waving ? Math.sin((local / 1.3) * Math.PI) : 0;
      const wave = Math.sin(t * 14 + seed);
      out.rArmX = -0.2 - waveEnv * 2.45;
      out.rArmZ = -0.12 - waveEnv * (0.35 + wave * 0.3);
      out.lArmZ = 0.14;
      out.headRoll = waveEnv * 0.1;
      out.headPitch = -0.12 * waveEnv;
      out.bodyRoll = waveEnv * -0.05;
      out.browRaise = 0.35 * waveEnv - impatience * 0.2;
      out.browTilt = impatience * 0.6;
      if (seated) {
        out.lLegX = -1.25;
        out.rLegX = -1.25;
        out.lArmX = -0.55;
        out.bodyY = 0.06;
        out.bodyZ = 0.02;
        out.bodyPitch = 0.04;
      } else {
        const tap = impatience > 0.25 && !waving ? Math.max(0, Math.sin(t * 11 + seed)) : 0;
        out.rLegX = -tap * 0.35 * impatience;
        out.bodyY = Math.sin(t * 3.5 + seed) * 0.012 + waveEnv * 0.03;
        out.lArmX = impatience > 0.5 ? -0.25 : 0; // hands to hips when cross
        out.lArmZ = impatience > 0.5 ? 0.55 : 0.14;
      }
      break;
    }

    case 'sit_eat': {
      // Happy chomping: alternate forkfuls to the mouth with a nodding head
      const chomp = Math.sin(t * 10 + seed);
      const up = Math.max(0, chomp);
      const up2 = Math.max(0, -chomp);
      out.lLegX = -1.25;
      out.rLegX = -1.25;
      out.bodyY = 0.06;
      out.bodyZ = 0.02;
      out.bodyPitch = 0.08 + up * 0.04;
      out.rArmX = -0.6 - up * 1.2;
      out.rArmZ = -0.15 - up * 0.25;
      out.lArmX = -0.6 - up2 * 1.2;
      out.lArmZ = 0.15 + up2 * 0.25;
      out.headPitch = 0.05 + Math.abs(chomp) * 0.12;
      out.squash = 1 + Math.abs(chomp) * 0.03;
      out.browRaise = 0.35;
      out.mouthOpen = Math.abs(chomp) > 0.55 ? 1 : 0;
      break;
    }

    case 'sit': {
      const breath = Math.sin(t * 3 + seed);
      out.lLegX = -1.25;
      out.rLegX = -1.25;
      out.lArmX = -0.55;
      out.rArmX = -0.55;
      out.bodyY = 0.06;
      out.bodyZ = 0.02;
      out.bodyPitch = 0.04;
      out.squash = 1 + breath * 0.015;
      out.headYaw = state.lookYaw;
      // Swinging feet under the table
      out.lLegX += Math.sin(t * 4 + seed) * 0.12;
      out.rLegX += Math.sin(t * 4 + seed + 2.1) * 0.12;
      break;
    }

    case 'idle':
    default: {
      const breath = Math.sin(t * 3.2 + seed);
      const shift = Math.sin(t * 1.15 + seed * 1.7);
      out.bodyY = breath * 0.018;
      out.squash = 1 + breath * 0.018;
      out.bodyRoll = shift * 0.035;
      out.headRoll = -shift * 0.04;
      out.headYaw = state.lookYaw;
      out.lArmX = Math.sin(t * 1.6 + seed) * 0.06;
      out.rArmX = Math.sin(t * 1.6 + seed + 1.3) * 0.06;
      out.lArmZ = 0.12 + breath * 0.03;
      out.rArmZ = -0.12 - breath * 0.03;
      out.browRaise = impatience * -0.15;
      out.browTilt = impatience * 0.5;
      break;
    }
  }

  // Holding a tray while standing still (e.g. waiting at the pass): keep both hands under it
  if (input.carrying && input.activity !== 'walk') {
    out.lArmX = -1.28;
    out.rArmX = -1.28;
    out.lArmZ = 0.16;
    out.rArmZ = -0.16;
  }

  return out;
}

/**
 * Advances the animator one frame and returns the displayed pose (`state.current`).
 * `facing` is the character's world yaw (used to derive lean-into-turn).
 */
export function stepCharacterPose(
  state: CharacterPoseState,
  input: CharacterAnimInput,
  facing: number,
): CharacterPose {
  const dt = Number.isFinite(input.dt) ? clamp(input.dt, 0, 0.25) : 0;
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;

  // 1. Activity change -> snapshot displayed pose & restart cross-fade
  if (input.activity !== state.activity) {
    copyPose(state.from, state.current);
    state.activity = input.activity;
    state.blend = 0;
  }
  state.blend = Math.min(1, state.blend + (dt / BLEND_DURATION));

  // 2. Walk phase only advances while walking (phase-clean, never world-coupled)
  if (input.activity === 'walk') {
    const rate = clamp(speed * 4.2, 7, 15);
    state.walkPhase = (state.walkPhase + dt * rate) % TWO_PI;
    // Footfall = |sin| peaks; detect the crossing of the contact threshold
    const contact = Math.abs(Math.sin(state.walkPhase)) > 0.96 ? 1 : 0;
    if (contact === 1 && state.prevContact === 0) state.landPulse = 1;
    state.prevContact = contact;
  } else {
    state.prevContact = 0;
  }
  state.landPulse = Math.max(0, state.landPulse - dt * 7);

  // 3. Idle look-around target picker (deterministic)
  state.lookTimer -= dt;
  if (state.lookTimer <= 0) {
    const r = hash01(state.seed, input.clock);
    const r2 = hash01(input.clock, state.seed + 3.3);
    state.lookTarget = r2 < 0.35 ? 0 : (r - 0.5) * 1.3;
    state.lookTimer = 1.6 + r2 * 2.8;
  }
  const lookLambda = 1 - Math.exp(-6 * dt);
  state.lookYaw += (state.lookTarget - state.lookYaw) * lookLambda;

  // 4. Target pose & cross-fade
  synthesizeTargetPose(state.target, state, input);
  const out = state.current;
  if (state.blend >= 1) {
    copyPose(out, state.target);
  } else {
    lerpPose(out, state.from, state.target, smoothstep(state.blend));
  }

  // 5. Lean into turns (angular velocity of facing)
  const dFacing = wrapAngle((Number.isFinite(facing) ? facing : 0) - state.prevFacing);
  state.prevFacing = Number.isFinite(facing) ? facing : 0;
  const turnRate = dt > 1e-4 ? dFacing / dt : 0;
  const leanTarget = input.activity === 'walk' ? clamp(-turnRate * 0.025, -0.08, 0.08) : 0;
  state.turnLean += (leanTarget - state.turnLean) * (1 - Math.exp(-5 * dt));
  out.bodyRoll += state.turnLean;

  // 6. Footfall squash
  if (state.landPulse > 0 && input.activity !== 'walk') {
    out.squash -= state.landPulse * 0.06;
  }

  // 7. Celebration layer: "yay!" arms + big hop squash/stretch
  const hop = clamp01(input.hopPulse);
  if (hop > 0) {
    const env = Math.sin(hop * Math.PI);
    const seated = input.activity === 'sit' || input.activity === 'sit_eat' || input.activity === 'sit_wait';
    const w = seated ? env * 0.85 : env;
    out.lArmX += (-2.55 - out.lArmX) * w;
    out.rArmX += (-2.55 - out.rArmX) * w;
    out.lArmZ += (0.55 - out.lArmZ) * w;
    out.rArmZ += (-0.55 - out.rArmZ) * w;
    out.bodyY += env * (seated ? 0.14 : 0.3);
    // Stretch in the air, squash on take-off & landing
    const u = 1 - hop;
    out.squash *= 1 + Math.sin(u * Math.PI * 2) * 0.12;
    out.headPitch -= env * 0.18;
    out.browRaise += env * 0.6;
    out.mouthOpen = 1;
  }
  if (input.isHappy) {
    out.browRaise = Math.max(out.browRaise, 0.4);
    out.mouthOpen = Math.max(out.mouthOpen, input.activity === 'sit_eat' ? out.mouthOpen : 1);
  }

  // 8. Secondary motion: head & hat lag behind vertical body motion (follow-through)
  const bodyVel = dt > 1e-4 ? (out.bodyY - state.prevBodyY) / dt : 0;
  state.prevBodyY = out.bodyY;
  [state.headSpringPos, state.headSpringVel] = stepDampedSpring(
    state.headSpringPos,
    state.headSpringVel,
    clamp(-bodyVel * 0.08, -0.25, 0.25),
    dt,
    220,
    16,
  );
  [state.hatSpringPos, state.hatSpringVel] = stepDampedSpring(
    state.hatSpringPos,
    state.hatSpringVel,
    clamp(state.headSpringPos * 1.6 + out.bodyRoll * 0.6, -0.4, 0.4),
    dt,
    120,
    13,
  );
  out.headPitch += state.headSpringPos;

  out.squash = clamp(out.squash, 0.78, 1.25);
  return out;
}

/** Returns the hat jiggle angle produced by the last `stepCharacterPose` call. */
export function getHatJiggle(state: CharacterPoseState): number {
  return Number.isFinite(state.hatSpringPos) ? state.hatSpringPos : 0;
}

/**
 * Writes a pose into a character rig's joints (zero allocations).
 */
export function applyPoseToRig(
  rig: AnimatableCharacterRig,
  pose: CharacterPose,
  hatJiggle = 0,
): void {
  rig.bodyGroup.position.set(0, pose.bodyY, pose.bodyZ);
  rig.bodyGroup.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll);
  const sy = pose.squash;
  const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
  rig.bodyGroup.scale.set(sxz, sy, sxz);

  rig.headGroup.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
  rig.hatAnchor.rotation.set(hatJiggle * 0.35, 0, hatJiggle * 0.5);

  rig.leftArm.rotation.set(pose.lArmX, 0, pose.lArmZ);
  rig.rightArm.rotation.set(pose.rArmX, 0, pose.rArmZ);
  rig.leftLeg.rotation.set(pose.lLegX, 0, 0);
  rig.rightLeg.rotation.set(pose.rLegX, 0, 0);

  const trayBase = rig.trayBaseY ?? 0.78;
  rig.trayGroup.position.y = trayBase + pose.trayY;
  rig.trayGroup.rotation.z = pose.trayRoll;

  if (rig.leftBrow && rig.rightBrow) {
    const by = (rig.browBaseY ?? 0) + pose.browRaise * 0.035;
    rig.leftBrow.position.y = by;
    rig.rightBrow.position.y = by;
    // Inner ends point toward x = 0: tilt +ve makes an angry "V"
    rig.leftBrow.rotation.z = -0.12 - pose.browTilt * 0.45 + pose.browRaise * 0.15;
    rig.rightBrow.rotation.z = 0.12 + pose.browTilt * 0.45 - pose.browRaise * 0.15;
  }

  const open = pose.mouthOpen > 0.5;
  rig.neutralMouth.visible = !open;
  rig.happyMouth.visible = open;
}

/** Maps a worker sim status to an animator activity. */
export function workerActivityFor(status: string): CharacterActivity {
  switch (status) {
    case 'walking_to_order':
    case 'walking_to_station':
    case 'walking_to_pass':
    case 'walking_to_customer':
    case 'returning_idle':
      return 'walk';
    case 'cooking':
      return 'cook';
    case 'taking_order':
      return 'take_order';
    default:
      return 'idle';
  }
}

/** Maps a customer sim status (+ seat context) to an animator activity. */
export function customerActivityFor(
  status: string,
  seated: boolean,
  isEating: boolean,
): CharacterActivity {
  if (status === 'entering' || status === 'leaving') return 'walk';
  if (seated) {
    if (isEating) return 'sit_eat';
    if (status === 'waiting_to_order') return 'sit_wait';
    return 'sit';
  }
  if (status === 'waiting_to_order') return 'stand_wait';
  if (status === 'ordering') return 'stand_order';
  return 'idle';
}
