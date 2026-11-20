import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyPoseToRig,
  createCharacterPoseState,
  customerActivityFor,
  getHatJiggle,
  stepCharacterPose,
  workerActivityFor,
  type CharacterActivity,
  type CharacterAnimInput,
  type CharacterPose,
} from '@/renderer/characterAnimator';
import { GeometryPool, MaterialPool, buildCharacterRig } from '@/renderer/meshFactory';

function input(activity: CharacterActivity, clock: number, extra: Partial<CharacterAnimInput> = {}): CharacterAnimInput {
  return {
    activity,
    dt: 1 / 60,
    clock,
    speed: 2,
    carrying: false,
    impatience: 0,
    hopPulse: 0,
    isHappy: false,
    ...extra,
  };
}

function maxJointDelta(a: CharacterPose, b: CharacterPose): number {
  const keys: (keyof CharacterPose)[] = ['lArmX', 'rArmX', 'lLegX', 'rLegX', 'bodyPitch', 'headPitch', 'bodyY'];
  return Math.max(...keys.map((k) => Math.abs(a[k] - b[k])));
}

function allFinite(p: CharacterPose): boolean {
  return Object.values(p).every((v) => Number.isFinite(v));
}

describe('characterAnimator — pose-blended chibi animation', () => {
  it('maps every worker & customer sim status onto an animator activity', () => {
    expect(workerActivityFor('walking_to_station')).toBe('walk');
    expect(workerActivityFor('returning_idle')).toBe('walk');
    expect(workerActivityFor('cooking')).toBe('cook');
    expect(workerActivityFor('taking_order')).toBe('take_order');
    expect(workerActivityFor('idle')).toBe('idle');
    expect(customerActivityFor('entering', false, false)).toBe('walk');
    expect(customerActivityFor('waiting_to_order', true, false)).toBe('sit_wait');
    expect(customerActivityFor('waiting_for_food', true, true)).toBe('sit_eat');
    expect(customerActivityFor('waiting_for_food', true, false)).toBe('sit');
    expect(customerActivityFor('waiting_to_order', false, false)).toBe('stand_wait');
    expect(customerActivityFor('ordering', false, false)).toBe('stand_order');
    expect(customerActivityFor('waiting_for_food', false, false)).toBe('idle');
  });

  it('walks with opposed legs/arms and a gentle, smooth (cusp-free) body bob', () => {
    const st = createCharacterPoseState(1.3, 'walk');
    let sawOpposed = false;
    let minY = Infinity;
    let maxY = -Infinity;
    const ys: number[] = [];
    for (let i = 0; i < 120; i++) {
      const p = stepCharacterPose(st, input('walk', i / 60), 0);
      ys.push(p.bodyY);
      expect(p.squash).toBe(1);
      if (Math.abs(p.lLegX) > 0.3) {
        expect(Math.sign(p.lLegX)).toBe(-Math.sign(p.rLegX));
        expect(Math.sign(p.lArmX)).toBe(-Math.sign(p.lLegX));
        sawOpposed = true;
      }
      minY = Math.min(minY, p.bodyY);
      maxY = Math.max(maxY, p.bodyY);
    }
    expect(sawOpposed).toBe(true);
    expect(maxY - minY).toBeGreaterThan(0.01);
    expect(maxY - minY).toBeLessThan(0.04);
    // No hop-like kinks: frame-to-frame acceleration of the bob stays tiny once blended in
    for (let i = 40; i < ys.length - 1; i++) {
      expect(Math.abs(ys[i + 1] - 2 * ys[i] + ys[i - 1])).toBeLessThan(0.0015);
    }
  });

  it('cross-fades between activities without snapping (cook -> walk)', () => {
    const st = createCharacterPoseState(0.7, 'cook');
    let clock = 0;
    for (let i = 0; i < 60; i++) stepCharacterPose(st, input('cook', (clock += 1 / 60)), 0);
    const before = { ...st.current };
    const after = stepCharacterPose(st, input('walk', (clock += 1 / 60)), 0);
    // One frame after the switch the pose is still near the cooking pose
    expect(maxJointDelta(before, after)).toBeLessThan(0.25);
    for (let i = 0; i < 30; i++) stepCharacterPose(st, input('walk', (clock += 1 / 60)), 0);
    expect(st.blend).toBe(1);
  });

  it('holds the tray with both arms forward whenever carrying', () => {
    for (const act of ['walk', 'idle'] as const) {
      const st = createCharacterPoseState(2, act);
      let p: CharacterPose = st.current;
      for (let i = 0; i < 40; i++) p = stepCharacterPose(st, input(act, i / 60, { carrying: true }), 0);
      expect(p.lArmX).toBeLessThan(-1.1);
      expect(p.rArmX).toBeLessThan(-1.1);
    }
  });

  it('raises "yay!" arms, opens the mouth and lifts the body during a celebration hop', () => {
    const st = createCharacterPoseState(3, 'idle');
    for (let i = 0; i < 30; i++) stepCharacterPose(st, input('idle', i / 60), 0);
    const p = stepCharacterPose(st, input('idle', 0.6, { hopPulse: 0.5, isHappy: true }), 0);
    expect(p.lArmX).toBeLessThan(-2);
    expect(p.rArmX).toBeLessThan(-2);
    expect(p.bodyY).toBeGreaterThan(0.2);
    expect(p.mouthOpen).toBe(1);
  });

  it('leans into turns while walking and frowns when impatient', () => {
    const st = createCharacterPoseState(0, 'walk');
    let facing = 0;
    let p: CharacterPose = st.current;
    for (let i = 0; i < 30; i++) {
      facing += 0.05; // steady left turn
      p = stepCharacterPose(st, input('walk', i / 60), facing);
    }
    expect(st.turnLean).toBeLessThan(-0.05);

    const cross = createCharacterPoseState(0, 'idle');
    for (let i = 0; i < 30; i++) p = stepCharacterPose(cross, input('idle', i / 60, { impatience: 1 }), 0);
    expect(p.browTilt).toBeGreaterThan(0.3);
  });

  it('stays finite & bounded under NaN / Infinity / huge dt inputs', () => {
    const st = createCharacterPoseState(Number.NaN, 'idle');
    const acts: CharacterActivity[] = ['idle', 'walk', 'cook', 'take_order', 'stand_wait', 'stand_order', 'sit', 'sit_wait', 'sit_eat'];
    for (const act of acts) {
      const p = stepCharacterPose(
        st,
        { activity: act, dt: Number.POSITIVE_INFINITY, clock: Number.NaN, speed: Number.NaN, carrying: false, impatience: Number.NaN, hopPulse: Number.NaN, isHappy: false },
        Number.NaN,
      );
      expect(allFinite(p)).toBe(true);
      const p2 = stepCharacterPose(st, input(act, 1e6, { dt: 5 }), 1e9);
      expect(allFinite(p2)).toBe(true);
      expect(p2.squash).toBeGreaterThanOrEqual(0.78);
      expect(p2.squash).toBeLessThanOrEqual(1.25);
      expect(Number.isFinite(getHatJiggle(st))).toBe(true);
    }
  });

  it('applies poses onto a real chibi rig with volume-preserving squash, brows & mouth swaps', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const rig = buildCharacterRig('#38bdf8', '#334155', false, mats, { role: 'customer', geos });
    expect(rig.outlineMeshes.length).toBeGreaterThanOrEqual(10);
    for (const hull of rig.outlineMeshes) expect(hull.castShadow).toBe(false);
    expect(rig.headGroup.scale.x).toBeGreaterThan(1.1);

    const st = createCharacterPoseState(1, 'sit_eat');
    let sawOpen = false;
    let sawClosed = false;
    for (let i = 0; i < 90; i++) {
      const p = stepCharacterPose(st, input('sit_eat', i / 60), 0);
      applyPoseToRig(rig, p, getHatJiggle(st));
      const s = rig.bodyGroup.scale;
      expect(s.x * s.y * s.z).toBeCloseTo(1, 5);
      if (rig.happyMouth.visible) sawOpen = true;
      if (rig.neutralMouth.visible) sawClosed = true;
      expect(rig.happyMouth.visible).toBe(!rig.neutralMouth.visible);
    }
    expect(sawOpen && sawClosed).toBe(true);

    const p = stepCharacterPose(st, input('idle', 2, { hopPulse: 0.5, isHappy: true }), 0);
    applyPoseToRig(rig, p);
    expect(rig.leftBrow.position.y).toBeGreaterThan(rig.browBaseY);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(Number.isFinite(box.min.y) && Number.isFinite(box.max.y)).toBe(true);
    geos.dispose();
    mats.dispose();
  });
});

describe('smoothCharacterMotion — eased, corner-rounding render motion', () => {
  it('rounds a 90° path corner into an arc, eases to a stop on target, and snaps on teleports', async () => {
    const { createCharacterAnimState, smoothCharacterMotion, resolveSmoothFacing } = await import(
      '@/renderer/animationHelpers'
    );
    const st = createCharacterAnimState('walker', 0, 0, 0);
    const dt = 1 / 60;
    // Sim walks +Z at 2.5 u/s for 1s, then turns sharply to +X for 1s, then stops.
    let simX = 0;
    let simZ = 0;
    let maxFacingStep = 0;
    let prevFacing = st.facing;
    let cutCorner = false;
    for (let i = 0; i < 240; i++) {
      if (i < 60) simZ += 2.5 * dt;
      else if (i < 120) simX += 2.5 * dt;
      smoothCharacterMotion(st, simX, simZ, dt);
      resolveSmoothFacing(st, i < 60 ? 0 : Math.PI / 2, dt);
      const step = Math.abs(st.facing - prevFacing);
      maxFacingStep = Math.max(maxFacingStep, step);
      prevFacing = st.facing;
      if (i > 60 && i < 90 && st.smoothX > 0.02 && st.smoothZ < 2.49) cutCorner = true;
    }
    expect(cutCorner).toBe(true); // arcs around the corner instead of a hard 90° turn
    expect(maxFacingStep).toBeLessThan(0.12); // no single-frame snap turns
    expect(st.smoothX).toBeCloseTo(2.5, 2); // settles exactly on the sim target
    expect(st.smoothZ).toBeCloseTo(2.5, 2);
    expect(Math.hypot(st.smoothVX, st.smoothVZ)).toBeLessThan(0.05);

    smoothCharacterMotion(st, 20, 20, dt); // teleport
    expect(st.smoothX).toBe(20);
    smoothCharacterMotion(st, Number.NaN, 0, dt);
    expect(st.smoothX).toBe(20);
  });
});
