import * as THREE from 'three';
import type { GraphicsQuality, StationTemplate } from '@/types/game';

export const VFX_QUALITY_CAPS: Record<GraphicsQuality, number> = {
  low: 60,
  medium: 140,
  high: 240,
};

export const VFX_MAX_CAPACITY = 240;

type BucketIndex = 0 | 1 | 2 | 3; // 0=sphere, 1=star, 2=disc, 3=heart
type GrowMode = 'pop_shrink' | 'billow' | 'sparkle';

interface ParticleSlot {
  active: boolean;
  priority: 0 | 1; // 0 = ambient (steam/dust/work), 1 = burst (perfect/divine/coin/confetti/crate/heart)
  bucket: BucketIndex;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  swirlAmp: number;
  swirlFreq: number;
  swirlPhase: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  baseSx: number;
  baseSy: number;
  baseSz: number;
  growMode: GrowMode;
  bounceFloor: boolean;
  colorHex: number;
}

const WHITE_COLOR = new THREE.Color(0xffffff);
const CONFETTI_COLORS = [
  0xff5d8f, 0x4ade80, 0x38bdf8, 0xfacc15, 0xfb923c, 0xc084fc,
];
const PERFECT_COLORS = [0xfacc15, 0xfef08a, 0xf59e0b];
const DIVINE_COLORS = [0xc084fc, 0xe879f9, 0x38bdf8, 0xfde047];
const HEART_COLORS = [0xfb7185, 0xf43f5e, 0xf472b6];
const CRATE_WOOD_COLORS = [0xb08968, 0xd4a373, 0xfacc15, 0xfef08a];

function createHeartGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.10);
  shape.bezierCurveTo(0.14, 0.01, 0.16, 0.14, 0.06, 0.15);
  shape.bezierCurveTo(0.02, 0.155, 0, 0.11, 0, 0.08);
  shape.bezierCurveTo(0, 0.11, -0.02, 0.155, -0.06, 0.15);
  shape.bezierCurveTo(-0.16, 0.14, -0.14, 0.01, 0, -0.10);
  const geo = new THREE.ShapeGeometry(shape, 6);
  geo.center();
  return geo;
}

function parseColorHex(color: string | number, fallback = 0xfffaf0): number {
  if (typeof color === 'number' && Number.isFinite(color)) return color;
  if (typeof color === 'string') {
    const cleaned = color.trim().replace('#', '');
    const parsed = Number.parseInt(cleaned, 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isFiniteVec3(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

/**
 * Zero-allocation pooled 3D InstancedMesh VFX system (100% Node-safe).
 * Uses 4 pre-allocated InstancedMesh buckets (spheres, stars, discs, hearts)
 * with priority recycling and strict quality caps (low: 60, medium: 140, high: 240).
 */
export class VfxSystem {
  public readonly root = new THREE.Group();

  private readonly spheres: THREE.InstancedMesh;
  private readonly stars: THREE.InstancedMesh;
  private readonly discs: THREE.InstancedMesh;
  private readonly hearts: THREE.InstancedMesh;

  private readonly pool: ParticleSlot[] = [];
  private activeCount = 0;
  private quality: GraphicsQuality = 'high';
  private maxParticles: number = VFX_QUALITY_CAPS.high;
  private densityScale = 1.0;

  private readonly dummy = new THREE.Object3D();
  private readonly scratchColor = new THREE.Color();
  private rngState = 0x9e3779b9;
  private disposed = false;

  constructor(initialQuality: GraphicsQuality = 'high') {
    this.root.name = 'vfx_system_root';

    const sphereGeo = new THREE.IcosahedronGeometry(0.11, 1);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.spheres = this.initBucket(sphereGeo, sphereMat, VFX_MAX_CAPACITY);

    const starGeo = new THREE.OctahedronGeometry(0.13, 0);
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    this.stars = this.initBucket(starGeo, starMat, VFX_MAX_CAPACITY);

    const discGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.035, 10);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    this.discs = this.initBucket(discGeo, discMat, VFX_MAX_CAPACITY);

    const heartGeo = createHeartGeometry();
    const heartMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.hearts = this.initBucket(heartGeo, heartMat, VFX_MAX_CAPACITY);

    this.root.add(this.spheres, this.stars, this.discs, this.hearts);

    for (let i = 0; i < VFX_MAX_CAPACITY; i++) {
      this.pool.push({
        active: false,
        priority: 0,
        bucket: 0,
        age: 0,
        maxAge: 1,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 0,
        drag: 0,
        swirlAmp: 0,
        swirlFreq: 0,
        swirlPhase: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        vrx: 0,
        vry: 0,
        vrz: 0,
        baseSx: 1,
        baseSy: 1,
        baseSz: 1,
        growMode: 'pop_shrink',
        bounceFloor: false,
        colorHex: 0xffffff,
      });
    }

    this.setQuality(initialQuality);
  }

  private initBucket(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Force instanceColor buffer allocation before frame 1 to avoid shader recompile
    mesh.setColorAt(0, WHITE_COLOR);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    mesh.count = 0;
    return mesh;
  }

  private rand(): number {
    // Xorshift32: allocation-free, deterministic, fast
    let x = this.rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState & 0x0fffffff) / 0x10000000;
  }

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.maxParticles = VFX_QUALITY_CAPS[quality];
    this.densityScale = quality === 'low' ? 0.5 : quality === 'medium' ? 0.78 : 1.0;

    // Immediately clamp active count to new cap (prefer dropping ambient priority=0 first)
    while (this.activeCount > this.maxParticles) {
      let dropIdx = -1;
      let oldestAge = -1;
      for (let i = 0; i < this.pool.length; i++) {
        const s = this.pool[i];
        if (!s.active || s.priority !== 0) continue;
        if (s.age > oldestAge) {
          oldestAge = s.age;
          dropIdx = i;
        }
      }
      if (dropIdx === -1) {
        for (let i = 0; i < this.pool.length; i++) {
          const s = this.pool[i];
          if (!s.active) continue;
          if (s.age > oldestAge) {
            oldestAge = s.age;
            dropIdx = i;
          }
        }
      }
      if (dropIdx === -1) break;
      this.pool[dropIdx].active = false;
      this.activeCount--;
    }

    if (this.activeCount === 0) {
      this.spheres.count = 0;
      this.stars.count = 0;
      this.discs.count = 0;
      this.hearts.count = 0;
    } else if (!this.disposed) {
      // Immediately compact surviving slots into all 4 InstancedMesh buckets
      this.update(0);
    }
  }

  getQuality(): GraphicsQuality {
    return this.quality;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getCapacity(): number {
    return this.maxParticles;
  }

  getMaxParticles(): number {
    return this.maxParticles;
  }

  private scaledCount(base: number): number {
    return Math.max(1, Math.round(base * this.densityScale));
  }

  private acquireSlot(priority: 0 | 1): ParticleSlot | null {
    if (this.disposed) return null;

    if (this.activeCount < this.maxParticles) {
      for (let i = 0; i < this.pool.length; i++) {
        if (!this.pool[i].active) {
          this.pool[i].active = true;
          this.activeCount++;
          return this.pool[i];
        }
      }
    }

    if (priority === 1) {
      // Recycle oldest ambient slot so high-value bursts always appear even on 'low'
      let victimIdx = -1;
      let oldestAge = -1;
      for (let i = 0; i < this.pool.length; i++) {
        const s = this.pool[i];
        if (s.active && s.priority === 0 && s.age > oldestAge) {
          oldestAge = s.age;
          victimIdx = i;
        }
      }
      if (victimIdx !== -1) {
        return this.pool[victimIdx];
      }
    }

    return null;
  }

  private resetSlot(
    slot: ParticleSlot,
    priority: 0 | 1,
    bucket: BucketIndex,
    x: number,
    y: number,
    z: number,
    maxAge: number,
    colorHex: number,
  ): void {
    slot.priority = priority;
    slot.bucket = bucket;
    slot.age = 0;
    slot.maxAge = Number.isFinite(maxAge) ? Math.max(0.08, maxAge) : 0.5;
    slot.x = Number.isFinite(x) ? x : 0;
    slot.y = Number.isFinite(y) ? y : 0;
    slot.z = Number.isFinite(z) ? z : 0;
    slot.vx = 0;
    slot.vy = 0;
    slot.vz = 0;
    slot.gravity = 0;
    slot.drag = 0;
    slot.swirlAmp = 0;
    slot.swirlFreq = 0;
    slot.swirlPhase = this.randRange(0, Math.PI * 2);
    slot.rx = 0;
    slot.ry = 0;
    slot.rz = 0;
    slot.vrx = 0;
    slot.vry = 0;
    slot.vrz = 0;
    slot.baseSx = 1;
    slot.baseSy = 1;
    slot.baseSz = 1;
    slot.growMode = 'pop_shrink';
    slot.bounceFloor = false;
    slot.colorHex = colorHex;
  }

  emitSteam(x: number, y: number, z: number, colorHex: string | number = 0xfffaf0): void {
    if (!isFiniteVec3(x, y, z)) return;
    const slot = this.acquireSlot(0);
    if (!slot) return;
    this.resetSlot(
      slot,
      0,
      0,
      x + this.randRange(-0.18, 0.18),
      y,
      z + this.randRange(-0.18, 0.18),
      this.randRange(0.85, 1.2),
      parseColorHex(colorHex, 0xfffaf0),
    );
    slot.vx = this.randRange(-0.16, 0.16);
    slot.vy = this.randRange(0.75, 1.15);
    slot.vz = this.randRange(-0.16, 0.16);
    slot.gravity = 0.1;
    slot.drag = 0.6;
    slot.swirlAmp = 0.35;
    slot.swirlFreq = 4.2;
    slot.baseSx = this.randRange(0.9, 1.35);
    slot.baseSy = slot.baseSx;
    slot.baseSz = slot.baseSx;
    slot.growMode = 'billow';
  }

  emitStationWorkFx(
    x: number,
    y: number,
    z: number,
    style: StationTemplate['modelStyle'],
    colorHex: string | number,
  ): void {
    if (!isFiniteVec3(x, y, z)) return;
    const dishCol = parseColorHex(colorHex, 0xfacc15);

    if (style === 'grill' || style === 'wok' || style === 'oven') {
      const count = this.scaledCount(2);
      const fireColors = [0xfb923c, 0xfacc15, 0xef4444];
      for (let i = 0; i < count; i++) {
        const slot = this.acquireSlot(0);
        if (!slot) break;
        const angle = this.randRange(0, Math.PI * 2);
        const spd = this.randRange(0.5, 1.35);
        this.resetSlot(
          slot,
          0,
          0,
          x + this.randRange(-0.24, 0.24),
          y,
          z + this.randRange(-0.24, 0.24),
          this.randRange(0.32, 0.55),
          fireColors[i % fireColors.length],
        );
        slot.vx = Math.cos(angle) * spd;
        slot.vy = this.randRange(1.3, 2.3);
        slot.vz = Math.sin(angle) * spd;
        slot.gravity = -4.2;
        slot.baseSx = 0.52;
        slot.baseSy = 0.52;
        slot.baseSz = 0.52;
        slot.growMode = 'pop_shrink';
      }
      this.emitSteam(x, y + 0.18, z, 0xfff7ed);
    } else if (style === 'fryer') {
      const count = this.scaledCount(2);
      for (let i = 0; i < count; i++) {
        const slot = this.acquireSlot(0);
        if (!slot) break;
        this.resetSlot(
          slot,
          0,
          0,
          x + this.randRange(-0.26, 0.26),
          y,
          z + this.randRange(-0.18, 0.18),
          this.randRange(0.35, 0.58),
          i % 2 === 0 ? 0xfde047 : 0xf59e0b,
        );
        slot.vx = this.randRange(-0.35, 0.35);
        slot.vy = this.randRange(1.0, 1.75);
        slot.vz = this.randRange(-0.35, 0.35);
        slot.gravity = -2.8;
        slot.baseSx = 0.62;
        slot.baseSy = 0.62;
        slot.baseSz = 0.62;
      }
      this.emitSteam(x, y + 0.15, z, 0xfffbeb);
    } else if (style === 'cauldron') {
      const b1 = this.acquireSlot(0);
      if (b1) {
        this.resetSlot(
          b1,
          0,
          0,
          x + this.randRange(-0.22, 0.22),
          y,
          z + this.randRange(-0.22, 0.22),
          this.randRange(0.65, 1.0),
          dishCol,
        );
        b1.vy = this.randRange(0.85, 1.35);
        b1.swirlAmp = 0.42;
        b1.swirlFreq = 5.5;
        b1.baseSx = 0.85;
        b1.baseSy = 0.85;
        b1.baseSz = 0.85;
        b1.growMode = 'billow';
      }
      const star = this.acquireSlot(0);
      if (star) {
        this.resetSlot(
          star,
          0,
          1,
          x + this.randRange(-0.22, 0.22),
          y + 0.1,
          z + this.randRange(-0.22, 0.22),
          0.6,
          0xe9d5ff,
        );
        star.vy = this.randRange(1.0, 1.6);
        star.vry = 6;
        star.baseSx = 0.72;
        star.baseSy = 0.72;
        star.baseSz = 0.72;
        star.growMode = 'sparkle';
      }
    } else if (style === 'espresso') {
      const count = this.scaledCount(2);
      for (let i = 0; i < count; i++) {
        this.emitSteam(x + this.randRange(-0.14, 0.14), y + 0.12, z + 0.08, 0xffffff);
      }
    } else if (style === 'juicer' || style === 'blender') {
      const count = this.scaledCount(2);
      for (let i = 0; i < count; i++) {
        const slot = this.acquireSlot(0);
        if (!slot) break;
        const ang = this.randRange(0, Math.PI * 2);
        this.resetSlot(
          slot,
          0,
          0,
          x + this.randRange(-0.18, 0.18),
          y + 0.15,
          z + this.randRange(-0.18, 0.18),
          this.randRange(0.35, 0.55),
          i % 2 === 0 ? dishCol : 0xfef08a,
        );
        slot.vx = Math.cos(ang) * this.randRange(0.45, 1.0);
        slot.vy = this.randRange(1.2, 1.9);
        slot.vz = Math.sin(ang) * this.randRange(0.45, 1.0);
        slot.gravity = -4.6;
        slot.baseSx = 0.58;
        slot.baseSy = 0.58;
        slot.baseSz = 0.58;
      }
    } else {
      // sushi & dessert: chilled mist + glossy shimmer star
      this.emitSteam(x, y + 0.08, z, style === 'sushi' ? 0xe0f2fe : 0xfbcfe8);
      const star = this.acquireSlot(0);
      if (star) {
        this.resetSlot(
          star,
          0,
          1,
          x + this.randRange(-0.26, 0.26),
          y + 0.2,
          z + this.randRange(-0.2, 0.2),
          0.55,
          style === 'sushi' ? 0xe0f2fe : 0xfef08a,
        );
        star.vy = this.randRange(0.7, 1.25);
        star.vry = 5.5;
        star.baseSx = 0.7;
        star.baseSy = 0.7;
        star.baseSz = 0.7;
        star.growMode = 'sparkle';
      }
    }
  }

  emitPerfectBurst(x: number, y: number, z: number, count = 12): void {
    if (!isFiniteVec3(x, y, z) || !Number.isFinite(count) || count <= 0) return;
    const n = this.scaledCount(count);
    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = (i / n) * Math.PI * 2 + this.randRange(-0.25, 0.25);
      const spd = this.randRange(1.1, 2.5);
      this.resetSlot(
        slot,
        1,
        1,
        x + this.randRange(-0.1, 0.1),
        y,
        z + this.randRange(-0.1, 0.1),
        this.randRange(0.55, 0.9),
        PERFECT_COLORS[i % PERFECT_COLORS.length],
      );
      slot.vx = Math.cos(angle) * spd;
      slot.vy = this.randRange(2.0, 3.6);
      slot.vz = Math.sin(angle) * spd;
      slot.gravity = -3.8;
      slot.drag = 1.4;
      slot.vrx = this.randRange(-7, 7);
      slot.vry = this.randRange(-9, 9);
      slot.baseSx = this.randRange(0.78, 1.18);
      slot.baseSy = slot.baseSx;
      slot.baseSz = slot.baseSx;
      slot.growMode = 'sparkle';
    }
  }

  emitDivineBurst(x: number, y: number, z: number, count = 16): void {
    if (!isFiniteVec3(x, y, z) || !Number.isFinite(count) || count <= 0) return;
    const n = this.scaledCount(count);
    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = (i / n) * Math.PI * 2;
      const spd = this.randRange(1.3, 2.8);
      this.resetSlot(
        slot,
        1,
        1,
        x + Math.cos(angle) * 0.16,
        y,
        z + Math.sin(angle) * 0.16,
        this.randRange(0.7, 1.15),
        DIVINE_COLORS[i % DIVINE_COLORS.length],
      );
      slot.vx = Math.cos(angle) * spd;
      slot.vy = this.randRange(2.4, 4.2);
      slot.vz = Math.sin(angle) * spd;
      slot.gravity = -2.6;
      slot.drag = 1.1;
      slot.swirlAmp = 0.55;
      slot.swirlFreq = 6.5;
      slot.vrx = this.randRange(-8, 8);
      slot.vry = this.randRange(-11, 11);
      slot.baseSx = 1.25;
      slot.baseSy = 1.25;
      slot.baseSz = 1.25;
      slot.growMode = 'sparkle';
    }
  }

  emitCoinBurst(x: number, y: number, z: number, count = 7): void {
    if (!isFiniteVec3(x, y, z) || !Number.isFinite(count) || count <= 0) return;
    const n = this.scaledCount(count);
    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = this.randRange(0, Math.PI * 2);
      const spd = this.randRange(0.8, 2.1);
      this.resetSlot(
        slot,
        1,
        2,
        x,
        y,
        z,
        this.randRange(0.65, 1.0),
        i % 2 === 0 ? 0xfacc15 : 0xf59e0b,
      );
      slot.vx = Math.cos(angle) * spd;
      slot.vy = this.randRange(2.8, 4.4);
      slot.vz = Math.sin(angle) * spd;
      slot.gravity = -8.5;
      slot.drag = 0.6;
      slot.vrx = this.randRange(8, 14);
      slot.vry = this.randRange(8, 14);
      slot.baseSx = 0.95;
      slot.baseSy = 0.95;
      slot.baseSz = 0.95;
      slot.bounceFloor = true;
      slot.growMode = 'pop_shrink';
    }
  }

  emitConfetti(x: number, y: number, z: number, count = 22): void {
    if (!isFiniteVec3(x, y, z) || !Number.isFinite(count) || count <= 0) return;
    const n = this.scaledCount(count);
    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = this.randRange(0, Math.PI * 2);
      const spd = this.randRange(1.2, 3.2);
      this.resetSlot(
        slot,
        1,
        2,
        x + this.randRange(-0.18, 0.18),
        y,
        z + this.randRange(-0.18, 0.18),
        this.randRange(0.85, 1.45),
        CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      );
      slot.vx = Math.cos(angle) * spd;
      slot.vy = this.randRange(3.2, 5.2);
      slot.vz = Math.sin(angle) * spd;
      slot.gravity = -4.2;
      slot.drag = 2.6;
      slot.vrx = this.randRange(-12, 12);
      slot.vry = this.randRange(-12, 12);
      slot.vrz = this.randRange(-10, 10);
      slot.baseSx = 1.15;
      slot.baseSy = 0.4;
      slot.baseSz = 0.75;
      slot.growMode = 'pop_shrink';
    }
  }

  emitSpeedDust(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    if (!isFiniteVec3(x, y, z)) return;
    const n = this.quality === 'high' ? 2 : 1;
    const safeDirX = Number.isFinite(dirX) ? dirX : 0;
    const safeDirZ = Number.isFinite(dirZ) ? dirZ : 0;
    const mag = Math.hypot(safeDirX, safeDirZ);
    const nx = mag > 1e-6 ? -safeDirX / mag : 0;
    const nz = mag > 1e-6 ? -safeDirZ / mag : 0;

    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(0);
      if (!slot) break;
      this.resetSlot(
        slot,
        0,
        0,
        x + nx * 0.18 + this.randRange(-0.1, 0.1),
        Math.max(0.12, y),
        z + nz * 0.18 + this.randRange(-0.1, 0.1),
        this.randRange(0.32, 0.44),
        i === 0 ? 0xf5ebe0 : 0xfde68a,
      );
      slot.vx = nx * this.randRange(0.35, 0.85) + this.randRange(-0.2, 0.2);
      slot.vy = this.randRange(0.25, 0.55);
      slot.vz = nz * this.randRange(0.35, 0.85) + this.randRange(-0.2, 0.2);
      slot.drag = 2.4;
      slot.baseSx = this.randRange(0.75, 1.1);
      slot.baseSy = slot.baseSx * 0.85;
      slot.baseSz = slot.baseSx;
      slot.growMode = 'billow';
    }
  }

  emitCrateSmash(x: number, y: number, z: number): void {
    if (!isFiniteVec3(x, y, z)) return;
    const woodCount = this.scaledCount(12);
    for (let i = 0; i < woodCount; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = (i / woodCount) * Math.PI * 2 + this.randRange(-0.2, 0.2);
      const spd = this.randRange(1.6, 3.6);
      this.resetSlot(
        slot,
        1,
        2,
        x + this.randRange(-0.2, 0.2),
        y + this.randRange(0.1, 0.45),
        z + this.randRange(-0.2, 0.2),
        this.randRange(0.55, 0.95),
        CRATE_WOOD_COLORS[i % CRATE_WOOD_COLORS.length],
      );
      slot.vx = Math.cos(angle) * spd;
      slot.vy = this.randRange(2.4, 4.6);
      slot.vz = Math.sin(angle) * spd;
      slot.gravity = -8.5;
      slot.drag = 0.9;
      slot.vrx = this.randRange(-14, 14);
      slot.vry = this.randRange(-14, 14);
      slot.baseSx = 1.35;
      slot.baseSy = 0.5;
      slot.baseSz = 0.7;
      slot.bounceFloor = true;
      slot.growMode = 'pop_shrink';
    }

    const starCount = this.scaledCount(6);
    for (let i = 0; i < starCount; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      const angle = (i / starCount) * Math.PI * 2;
      this.resetSlot(
        slot,
        1,
        1,
        x,
        y + 0.5,
        z,
        this.randRange(0.6, 0.9),
        i % 2 === 0 ? 0xfacc15 : 0xfef08a,
      );
      slot.vx = Math.cos(angle) * this.randRange(1.0, 2.2);
      slot.vy = this.randRange(2.4, 3.8);
      slot.vz = Math.sin(angle) * this.randRange(1.0, 2.2);
      slot.gravity = -3.2;
      slot.vry = 9;
      slot.baseSx = 1.1;
      slot.baseSy = 1.1;
      slot.baseSz = 1.1;
      slot.growMode = 'sparkle';
    }
  }

  emitHearts(x: number, y: number, z: number, count = 3): void {
    if (!isFiniteVec3(x, y, z) || !Number.isFinite(count) || count <= 0) return;
    const n = this.scaledCount(count);
    for (let i = 0; i < n; i++) {
      const slot = this.acquireSlot(1);
      if (!slot) break;
      this.resetSlot(
        slot,
        1,
        3,
        x + this.randRange(-0.24, 0.24),
        y + i * 0.08,
        z + this.randRange(-0.18, 0.18),
        this.randRange(0.85, 1.15),
        HEART_COLORS[i % HEART_COLORS.length],
      );
      slot.vx = this.randRange(-0.18, 0.18);
      slot.vy = this.randRange(1.1, 1.5);
      slot.vz = this.randRange(-0.15, 0.15);
      slot.swirlAmp = 0.45;
      slot.swirlFreq = 5.0;
      slot.baseSx = 1.15;
      slot.baseSy = 1.15;
      slot.baseSz = 1.15;
      slot.growMode = 'pop_shrink';
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;

    let sphereCount = 0;
    let starCount = 0;
    let discCount = 0;
    let heartCount = 0;

    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s.active) continue;

      s.age += safeDt;
      if (s.age >= s.maxAge) {
        s.active = false;
        this.activeCount--;
        continue;
      }

      const t = s.age / s.maxAge;

      // Integrate velocity with gravity & exponential drag
      s.vy += s.gravity * safeDt;
      if (s.drag > 0) {
        const damp = Math.exp(-s.drag * safeDt);
        s.vx *= damp;
        s.vy *= damp;
        s.vz *= damp;
      }

      const swirlX =
        s.swirlAmp > 0 ? Math.cos(s.age * s.swirlFreq + s.swirlPhase) * s.swirlAmp : 0;
      const swirlZ =
        s.swirlAmp > 0 ? Math.sin(s.age * s.swirlFreq + s.swirlPhase) * s.swirlAmp : 0;

      s.x += (s.vx + swirlX) * safeDt;
      s.y += s.vy * safeDt;
      s.z += (s.vz + swirlZ) * safeDt;

      if (s.bounceFloor && s.y < 0.08) {
        s.y = 0.08;
        if (s.vy < 0) {
          s.vy = -s.vy * 0.42;
          s.vx *= 0.72;
          s.vz *= 0.72;
        }
      }

      s.rx += s.vrx * safeDt;
      s.ry += s.vry * safeDt;
      s.rz += s.vrz * safeDt;

      // Scale curve by growMode
      let lifeScale = 1;
      if (s.growMode === 'billow') {
        lifeScale = t < 0.35 ? 0.4 + (t / 0.35) * 0.95 : 1.35 * (1 - (t - 0.35) / 0.65);
      } else if (s.growMode === 'sparkle') {
        const env = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        lifeScale = env * (0.8 + 0.35 * Math.sin(s.age * 24 + s.swirlPhase));
      } else {
        lifeScale = t < 0.16 ? 0.25 + (t / 0.16) * 0.85 : 1.1 * (1 - (t - 0.16) / 0.84);
      }
      lifeScale = Math.max(0.001, lifeScale);

      this.dummy.position.set(s.x, s.y, s.z);
      if (s.bucket === 3) {
        // Hearts tilt slightly upward toward angled camera
        this.dummy.rotation.set(-0.45, 0, Math.sin(s.age * 6 + s.swirlPhase) * 0.16);
      } else {
        this.dummy.rotation.set(s.rx, s.ry, s.rz);
      }
      this.dummy.scale.set(
        s.baseSx * lifeScale,
        s.baseSy * lifeScale,
        s.baseSz * lifeScale,
      );
      this.dummy.updateMatrix();
      this.scratchColor.setHex(s.colorHex);

      if (s.bucket === 0 && sphereCount < VFX_MAX_CAPACITY) {
        this.spheres.setMatrixAt(sphereCount, this.dummy.matrix);
        this.spheres.setColorAt(sphereCount, this.scratchColor);
        sphereCount++;
      } else if (s.bucket === 1 && starCount < VFX_MAX_CAPACITY) {
        this.stars.setMatrixAt(starCount, this.dummy.matrix);
        this.stars.setColorAt(starCount, this.scratchColor);
        starCount++;
      } else if (s.bucket === 2 && discCount < VFX_MAX_CAPACITY) {
        this.discs.setMatrixAt(discCount, this.dummy.matrix);
        this.discs.setColorAt(discCount, this.scratchColor);
        discCount++;
      } else if (s.bucket === 3 && heartCount < VFX_MAX_CAPACITY) {
        this.hearts.setMatrixAt(heartCount, this.dummy.matrix);
        this.hearts.setColorAt(heartCount, this.scratchColor);
        heartCount++;
      }
    }

    this.flushBucket(this.spheres, sphereCount);
    this.flushBucket(this.stars, starCount);
    this.flushBucket(this.discs, discCount);
    this.flushBucket(this.hearts, heartCount);
  }

  private flushBucket(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    if (count > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  clear(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
    }
    this.activeCount = 0;
    this.spheres.count = 0;
    this.stars.count = 0;
    this.discs.count = 0;
    this.hearts.count = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();

    for (const mesh of [this.spheres, this.stars, this.discs, this.hearts]) {
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else {
        mat.dispose();
      }
      mesh.dispose();
    }
    this.root.clear();
  }
}
