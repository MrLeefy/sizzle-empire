import * as THREE from 'three';

/**
 * Unit-cube RoundedBoxGeometry builder immune to the three@0.178 RoundedBoxGeometry bug
 * (which constructs BoxGeometry(w, h, d) while subtracting unit-cube 0.5/segments, inverting
 * thin/small meshes). Builds a unit cube [-0.5, +0.5]^3 first so bevel normals, face winding,
 * signed volume, bounding-box dimensions, and planar UVs are 100% exact at any aspect ratio.
 */
export function createRoundedBoxGeometry(
  width = 1,
  height = 1,
  depth = 1,
  segments = 2,
  radius = 0.08,
): THREE.BufferGeometry {
  const w = Math.max(1e-4, Number.isFinite(width) ? width : 1);
  const h = Math.max(1e-4, Number.isFinite(height) ? height : 1);
  const d = Math.max(1e-4, Number.isFinite(depth) ? depth : 1);
  const segCount = Math.max(0, Math.round(Number.isFinite(segments) ? segments : 2));
  const rawR = Number.isFinite(radius) ? radius : 0.08;
  const r = Math.max(0, Math.min(w * 0.499, h * 0.499, d * 0.499, rawR));

  if (segCount === 0 || r <= 1e-6) {
    return new THREE.BoxGeometry(w, h, d);
  }

  const seg = segCount * 2 + 1;
  const indexed = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const geom = indexed.toNonIndexed();
  indexed.dispose();

  const posAttr = geom.attributes.position;
  const normAttr = geom.attributes.normal;
  const uvAttr = geom.attributes.uv;
  const positions = posAttr.array as Float32Array;
  const normals = normAttr.array as Float32Array;
  const uvs = uvAttr.array as Float32Array;

  const halfW = w * 0.5 - r;
  const halfH = h * 0.5 - r;
  const halfD = d * 0.5 - r;
  const halfSeg = 0.5 / seg;
  const faceFloats = positions.length / 6;

  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    const px = positions[i];
    const py = positions[i + 1];
    const pz = positions[i + 2];

    const sx = px >= 0 ? 1 : -1;
    const sy = py >= 0 ? 1 : -1;
    const sz = pz >= 0 ? 1 : -1;

    let nx = px - sx * halfSeg;
    let ny = py - sy * halfSeg;
    let nz = pz - sz * halfSeg;
    if (Math.abs(nx) < 1e-7) nx = 0;
    if (Math.abs(ny) < 1e-7) ny = 0;
    if (Math.abs(nz) < 1e-7) nz = 0;

    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    const ox = sx * halfW + nx * r;
    const oy = sy * halfH + ny * r;
    const oz = sz * halfD + nz * r;

    positions[i] = ox;
    positions[i + 1] = oy;
    positions[i + 2] = oz;

    normals[i] = nx;
    normals[i + 1] = ny;
    normals[i + 2] = nz;

    const side = Math.floor(i / faceFloats);
    let u = 0.5;
    let v = 0.5;
    switch (side) {
      case 0: // +X right
        u = 0.5 - oz / d;
        v = 0.5 + oy / h;
        break;
      case 1: // -X left
        u = 0.5 + oz / d;
        v = 0.5 + oy / h;
        break;
      case 2: // +Y top
        u = 0.5 + ox / w;
        v = 0.5 - oz / d;
        break;
      case 3: // -Y bottom
        u = 0.5 + ox / w;
        v = 0.5 + oz / d;
        break;
      case 4: // +Z front
        u = 0.5 + ox / w;
        v = 0.5 + oy / h;
        break;
      case 5: // -Z back
      default:
        u = 0.5 - ox / w;
        v = 0.5 + oy / h;
        break;
    }
    uvs[j] = Math.max(0, Math.min(1, u));
    uvs[j + 1] = Math.max(0, Math.min(1, v));
  }

  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

export interface TexturedMaterialOptions {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  side?: THREE.Side;
  envMapIntensity?: number;
  sceneScoped?: boolean;
}

export interface DisposeTreeOptions {
  disposeMaterials?: boolean;
  disposeTextures?: boolean;
  clearChildren?: boolean;
}

function quantize(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function shiftHexColor(hex: string, deltaL: number, deltaS = 0): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    hsl.h,
    Math.max(0, Math.min(1, hsl.s + deltaS)),
    Math.max(0.04, Math.min(0.98, hsl.l + deltaL)),
  );
  return `#${c.getHexString()}`;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Shared GeometryPool eliminating per-entity and per-rebuild BufferGeometry allocations.
 * Every cached geometry is tagged `userData.__pooled = true` so `disposeObjectTree()`
 * never prematurely disposes shared GPU buffers while still freeing ad-hoc geometries.
 */
export class GeometryPool {
  private cache = new Map<string, THREE.BufferGeometry>();
  private owned = new Set<THREE.BufferGeometry>();

  getOrCreate<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    const existing = this.cache.get(key);
    if (existing) return existing as T;
    const geo = factory();
    geo.userData.__pooled = true;
    this.cache.set(key, geo);
    this.owned.add(geo);
    return geo;
  }

  roundedBox(
    w: number,
    h: number,
    d: number,
    segments = 2,
    radius = 0.08,
  ): THREE.BufferGeometry {
    const key = `rbox_${quantize(w)}_${quantize(h)}_${quantize(d)}_${segments}_${quantize(radius)}`;
    return this.getOrCreate(key, () => createRoundedBoxGeometry(w, h, d, segments, radius));
  }

  box(w: number, h: number, d: number): THREE.BoxGeometry {
    const key = `box_${quantize(w)}_${quantize(h)}_${quantize(d)}`;
    return this.getOrCreate(key, () => new THREE.BoxGeometry(w, h, d));
  }

  cylinder(
    rt: number,
    rb: number,
    h: number,
    radialSegs = 12,
    openEnded = false,
  ): THREE.CylinderGeometry {
    const key = `cyl_${quantize(rt)}_${quantize(rb)}_${quantize(h)}_${radialSegs}_${openEnded ? 1 : 0}`;
    return this.getOrCreate(
      key,
      () => new THREE.CylinderGeometry(rt, rb, h, radialSegs, 1, openEnded),
    );
  }

  sphere(
    r: number,
    wSegs = 12,
    hSegs = 10,
    phiStart = 0,
    phiLen = Math.PI * 2,
    thetaStart = 0,
    thetaLen = Math.PI,
  ): THREE.SphereGeometry {
    const key = `sph_${quantize(r)}_${wSegs}_${hSegs}_${quantize(phiStart)}_${quantize(phiLen)}_${quantize(thetaStart)}_${quantize(thetaLen)}`;
    return this.getOrCreate(
      key,
      () => new THREE.SphereGeometry(r, wSegs, hSegs, phiStart, phiLen, thetaStart, thetaLen),
    );
  }

  capsule(r: number, length: number, capSegs = 4, radialSegs = 8): THREE.CapsuleGeometry {
    const key = `cap_${quantize(r)}_${quantize(length)}_${capSegs}_${radialSegs}`;
    return this.getOrCreate(key, () => new THREE.CapsuleGeometry(r, length, capSegs, radialSegs));
  }

  cone(r: number, h: number, radialSegs = 10): THREE.ConeGeometry {
    const key = `cone_${quantize(r)}_${quantize(h)}_${radialSegs}`;
    return this.getOrCreate(key, () => new THREE.ConeGeometry(r, h, radialSegs));
  }

  torus(
    r: number,
    tube: number,
    radSegs = 8,
    tubSegs = 16,
    arc = Math.PI * 2,
  ): THREE.TorusGeometry {
    const key = `tor_${quantize(r)}_${quantize(tube)}_${radSegs}_${tubSegs}_${quantize(arc)}`;
    return this.getOrCreate(key, () => new THREE.TorusGeometry(r, tube, radSegs, tubSegs, arc));
  }

  plane(w: number, h: number): THREE.PlaneGeometry {
    const key = `pln_${quantize(w)}_${quantize(h)}`;
    return this.getOrCreate(key, () => new THREE.PlaneGeometry(w, h));
  }

  circle(
    r: number,
    segs = 16,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ): THREE.CircleGeometry {
    const key = `cir_${quantize(r)}_${segs}_${quantize(thetaStart)}_${quantize(thetaLength)}`;
    return this.getOrCreate(
      key,
      () => new THREE.CircleGeometry(r, segs, thetaStart, thetaLength),
    );
  }

  ring(innerR: number, outerR: number, segs = 24): THREE.RingGeometry {
    const key = `rng_${quantize(innerR)}_${quantize(outerR)}_${segs}`;
    return this.getOrCreate(key, () => new THREE.RingGeometry(innerR, outerR, segs));
  }

  dodecahedron(r: number, detail = 0): THREE.DodecahedronGeometry {
    const key = `dod_${quantize(r)}_${detail}`;
    return this.getOrCreate(key, () => new THREE.DodecahedronGeometry(r, detail));
  }

  octahedron(r: number, detail = 0): THREE.OctahedronGeometry {
    const key = `oct_${quantize(r)}_${detail}`;
    return this.getOrCreate(key, () => new THREE.OctahedronGeometry(r, detail));
  }

  contactShadowQuad(): THREE.PlaneGeometry {
    return this.plane(1, 1);
  }

  has(geo: THREE.BufferGeometry): boolean {
    return this.owned.has(geo);
  }

  size(): number {
    return this.cache.size;
  }

  dispose(): void {
    for (const geo of this.cache.values()) {
      delete geo.userData.__pooled;
      geo.dispose();
    }
    this.cache.clear();
    this.owned.clear();
  }
}

/**
 * Shared Candy-Glossy MaterialPool tuned for PMREM RoomEnvironment IBL.
 * Tracks shared vs scene-scoped materials so venue switches dispose venue textures/materials cleanly.
 */
export class MaterialPool {
  private standard = new Map<string, THREE.MeshStandardMaterial>();
  private basic = new Map<string, THREE.MeshBasicMaterial>();
  private sceneScoped = new Map<string, THREE.Material>();
  private owned = new Set<THREE.Material>();

  std(
    color: string,
    roughness = 0.42,
    metalness = 0.06,
    emissive?: string,
    emissiveIntensity = 0.48,
    side: THREE.Side = THREE.FrontSide,
  ): THREE.MeshStandardMaterial {
    const key = `std_${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissive ?? ''}_${emissive ? emissiveIntensity.toFixed(2) : 0}_${side}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      envMapIntensity: 0.9,
      side,
      ...(emissive
        ? { emissive: new THREE.Color(emissive), emissiveIntensity }
        : {}),
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  glossy(
    color: string,
    roughness = 0.24,
    metalness = 0.12,
    emissive?: string,
    emissiveIntensity = 0.45,
  ): THREE.MeshStandardMaterial {
    const key = `gls_${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissive ?? ''}_${emissive ? emissiveIntensity.toFixed(2) : 0}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      envMapIntensity: 1.15,
      ...(emissive
        ? { emissive: new THREE.Color(emissive), emissiveIntensity }
        : {}),
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  metallic(
    color: string,
    roughness = 0.2,
    metalness = 0.78,
    emissive?: string,
    emissiveIntensity = 0.45,
    side: THREE.Side = THREE.FrontSide,
  ): THREE.MeshStandardMaterial {
    const key = `met_${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}_${emissive ?? ''}_${emissive ? emissiveIntensity.toFixed(2) : 0}_${side}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      envMapIntensity: 1.35,
      side,
      ...(emissive
        ? { emissive: new THREE.Color(emissive), emissiveIntensity }
        : {}),
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  matte(color: string, roughness = 0.78, metalness = 0.02): THREE.MeshStandardMaterial {
    const key = `mat_${color}_${roughness.toFixed(2)}_${metalness.toFixed(2)}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      envMapIntensity: 0.45,
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  glass(
    tintColor = '#dff6ff',
    opacity = 0.26,
    doubleSide = false,
  ): THREE.MeshStandardMaterial {
    const clampedOpacity = Math.max(0.08, Math.min(0.65, opacity));
    const key = `glass_${tintColor}_${clampedOpacity.toFixed(2)}_${doubleSide ? 1 : 0}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tintColor),
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: clampedOpacity,
      depthWrite: false,
      envMapIntensity: 1.5,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  emissiveGlow(
    color: string,
    intensity = 0.85,
    roughness = 0.22,
  ): THREE.MeshStandardMaterial {
    const key = `emi_${color}_${intensity.toFixed(2)}_${roughness.toFixed(2)}`;
    const existing = this.standard.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: intensity,
      roughness,
      metalness: 0.05,
      envMapIntensity: 0.85,
    });
    mat.userData.__pooled = true;
    this.standard.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  basicMat(color: string, opacity = 1, depthWrite?: boolean): THREE.MeshBasicMaterial {
    const resolvedDepthWrite = depthWrite ?? opacity >= 1;
    const key = `bas_${color}_${opacity.toFixed(2)}_${resolvedDepthWrite ? 1 : 0}`;
    const existing = this.basic.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: opacity < 1,
      opacity,
      depthWrite: resolvedDepthWrite,
      side: THREE.DoubleSide,
    });
    mat.userData.__pooled = true;
    this.basic.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  textured(
    key: string,
    texture: THREE.Texture | null,
    opts: TexturedMaterialOptions = {},
  ): THREE.MeshStandardMaterial {
    const isScoped = Boolean(opts.sceneScoped);
    if (isScoped) {
      const existing = this.sceneScoped.get(key);
      if (existing) return existing as THREE.MeshStandardMaterial;
    } else {
      const existing = this.standard.get(key);
      if (existing) return existing;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(opts.color ?? '#ffffff'),
      roughness: opts.roughness ?? 0.42,
      metalness: opts.metalness ?? 0.04,
      envMapIntensity: opts.envMapIntensity ?? 0.8,
      ...(texture ? { map: texture } : {}),
      ...(opts.emissive
        ? {
            emissive: new THREE.Color(opts.emissive),
            emissiveIntensity: opts.emissiveIntensity ?? 0.2,
          }
        : {}),
      ...(opts.transparent !== undefined ? { transparent: opts.transparent } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
      ...(opts.depthWrite !== undefined ? { depthWrite: opts.depthWrite } : {}),
      ...(opts.side !== undefined ? { side: opts.side } : {}),
    });

    mat.userData.__pooled = true;
    if (isScoped) {
      mat.userData.__sceneScoped = true;
      this.sceneScoped.set(key, mat);
    } else {
      this.standard.set(key, mat);
    }
    this.owned.add(mat);
    return mat;
  }

  contactShadow(shadowTex: THREE.Texture | null = null): THREE.MeshBasicMaterial {
    const key = shadowTex ? '__contact_shadow_tex' : '__contact_shadow_flat';
    const existing = this.basic.get(key);
    if (existing) return existing;

    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(shadowTex ? '#ffffff' : '#2b1d14'),
      ...(shadowTex ? { map: shadowTex } : {}),
      transparent: true,
      opacity: shadowTex ? 0.62 : 0.24,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    mat.userData.__pooled = true;
    this.basic.set(key, mat);
    this.owned.add(mat);
    return mat;
  }

  has(mat: THREE.Material): boolean {
    return this.owned.has(mat);
  }

  disposeSceneScoped(): void {
    for (const mat of this.sceneScoped.values()) {
      delete mat.userData.__pooled;
      delete mat.userData.__sceneScoped;
      this.owned.delete(mat);
      mat.dispose();
    }
    this.sceneScoped.clear();
  }

  dispose(): void {
    this.disposeSceneScoped();
    for (const mat of this.standard.values()) {
      delete mat.userData.__pooled;
      mat.dispose();
    }
    for (const mat of this.basic.values()) {
      delete mat.userData.__pooled;
      mat.dispose();
    }
    this.standard.clear();
    this.basic.clear();
    this.owned.clear();
  }

  getStats(): { shared: number; sceneScoped: number } {
    return {
      shared: this.standard.size + this.basic.size,
      sceneScoped: this.sceneScoped.size,
    };
  }
}

/**
 * 100% Node-safe procedural CanvasTexture generator.
 * Returns `null` cleanly when `typeof document === 'undefined'` (Vitest Node environment).
 * Tracks `shared` vs `sceneScoped` textures for leak-free venue rebuilds and shutdown.
 */
export class TextureFactory {
  private shared = new Map<string, THREE.CanvasTexture>();
  private sceneScoped = new Map<string, THREE.CanvasTexture>();

  private makeCanvas(
    w: number,
    h: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === 'undefined') return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      return { canvas, ctx };
    } catch {
      return null;
    }
  }

  private finalizeTexture(
    canvas: HTMLCanvasElement,
    opts: {
      key: string;
      sceneScoped: boolean;
      repeatX?: number;
      repeatY?: number;
      clamp?: boolean;
    },
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (opts.clamp) {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    } else {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(opts.repeatX ?? 1, opts.repeatY ?? 1);
    }
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    tex.userData.__pooled = true;
    if (opts.sceneScoped) {
      tex.userData.__sceneScoped = true;
      this.sceneScoped.set(opts.key, tex);
    } else {
      this.shared.set(opts.key, tex);
    }
    return tex;
  }

  /**
   * 1. Glossy 2×2 ceramic checkerboard tiles with cream grout & subtle diagonal sheen.
   */
  createCheckerboardTiles(
    baseHex: string,
    repeatX: number,
    repeatZ: number,
  ): THREE.CanvasTexture | null {
    const rx = Math.max(1, Math.round(repeatX));
    const rz = Math.max(1, Math.round(repeatZ));
    const key = `chk_${baseHex}_${rx}_${rz}`;
    const existing = this.sceneScoped.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(256, 256);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    const tileA = shiftHexColor(baseHex, 0.055, 0.02);
    const tileB = shiftHexColor(baseHex, -0.065, 0.04);
    const half = 128;

    ctx.fillStyle = '#fff9ee';
    ctx.fillRect(0, 0, 256, 256);

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = col * half;
        const y = row * half;
        const fill = (row + col) % 2 === 0 ? tileA : tileB;
        ctx.fillStyle = fill;
        ctx.fillRect(x + 3, y + 3, half - 6, half - 6);

        // Soft glossy ceramic corner sheen
        const grad = ctx.createLinearGradient(x + 6, y + 6, x + half - 10, y + half - 10);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
        grad.addColorStop(1, 'rgba(61, 35, 20, 0.06)');
        ctx.fillStyle = grad;
        ctx.fillRect(x + 5, y + 5, half - 10, half - 10);
      }
    }

    // Warm cream grout grid
    ctx.strokeStyle = 'rgba(255, 250, 240, 0.78)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 256, 256);
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, 256);
    ctx.moveTo(0, half);
    ctx.lineTo(256, half);
    ctx.stroke();

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: true,
      repeatX: rx,
      repeatY: rz,
    });
  }

  /**
   * 2. Warm staggered wood planks with flowing grain & satin finish.
   */
  createWoodPlanks(
    baseHex: string,
    repeatX: number,
    repeatZ: number,
  ): THREE.CanvasTexture | null {
    const rx = Math.max(1, Math.round(repeatX));
    const rz = Math.max(1, Math.round(repeatZ));
    const key = `wood_${baseHex}_${rx}_${rz}`;
    const existing = this.sceneScoped.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(256, 256);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    const plankH = 64;
    const shifts = [0.03, -0.025, 0.015, -0.04];

    for (let i = 0; i < 4; i++) {
      const y = i * plankH;
      ctx.fillStyle = shiftHexColor(baseHex, shifts[i], 0.02);
      ctx.fillRect(0, y, 256, plankH);

      // Subtle flowing grain strokes
      ctx.strokeStyle = 'rgba(90, 59, 34, 0.14)';
      ctx.lineWidth = 2;
      for (let g = 0; g < 4; g++) {
        const gy = y + 10 + g * 14;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(80, gy + ((i + g) % 2 === 0 ? 4 : -4), 170, gy - 3, 256, gy);
        ctx.stroke();
      }

      // Satin highlight band
      const sheen = ctx.createLinearGradient(0, y, 0, y + plankH);
      sheen.addColorStop(0, 'rgba(255, 252, 240, 0.18)');
      sheen.addColorStop(0.5, 'rgba(255, 252, 240, 0)');
      sheen.addColorStop(1, 'rgba(61, 35, 20, 0.10)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, y, 256, plankH);

      // Plank seams
      ctx.fillStyle = '#5a3b22';
      ctx.fillRect(0, y, 256, 3);
      const jointX = (i * 96 + 48) % 256;
      ctx.fillRect(jointX, y, 3, plankH);
    }

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: true,
      repeatX: rx,
      repeatY: rz,
    });
  }

  /**
   * 3. Bold candy-striped awning fabric with subtle woven depth.
   */
  createStripedAwning(
    primaryHex: string,
    secondaryHex = '#fffdf7',
    repeatsX = 4,
  ): THREE.CanvasTexture | null {
    const rx = Math.max(1, Math.round(repeatsX));
    const key = `awn_${primaryHex}_${secondaryHex}_${rx}`;
    const existing = this.sceneScoped.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(256, 128);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    const stripeCount = 4;
    const sw = 256 / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? primaryHex : secondaryHex;
      ctx.fillRect(i * sw, 0, sw, 128);
    }

    // Subtle fabric weave lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let y = 4; y < 128; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    // Soft bottom shadow gradient for fabric depth
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(61, 35, 20, 0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: true,
      repeatX: rx,
      repeatY: 1,
    });
  }

  /**
   * 4. Creamy glossy marble counter texture (shared across venues).
   */
  createMarbleCounter(tintHex = '#fffbf4'): THREE.CanvasTexture | null {
    const key = `marble_${tintHex}`;
    const existing = this.shared.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(256, 256);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    ctx.fillStyle = tintHex;
    ctx.fillRect(0, 0, 256, 256);

    // Layered soft warm-gold and stone veins
    const veins = [
      { y0: 32, y1: 110, col: 'rgba(180, 155, 120, 0.16)', w: 4 },
      { y0: 95, y1: 185, col: 'rgba(160, 145, 130, 0.12)', w: 3 },
      { y0: 170, y1: 240, col: 'rgba(217, 175, 105, 0.14)', w: 2.5 },
      { y0: 15, y1: 210, col: 'rgba(148, 163, 184, 0.10)', w: 2 },
    ];
    for (const v of veins) {
      ctx.strokeStyle = v.col;
      ctx.lineWidth = v.w;
      ctx.beginPath();
      ctx.moveTo(0, v.y0);
      ctx.bezierCurveTo(75, v.y0 + 36, 165, v.y1 - 38, 256, v.y1);
      ctx.stroke();
    }

    // Subtle gloss flecks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 18; i++) {
      const fx = (i * 53 + 17) % 244;
      const fy = (i * 89 + 29) % 244;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: false,
      repeatX: 2,
      repeatY: 1,
    });
  }

  /**
   * 5. Illustrated café chalkboard menu with wooden frame & dish rows.
   */
  createChalkboardMenu(
    title: string,
    dishes: Array<{ icon: string; name: string }>,
    accentHex: string,
  ): THREE.CanvasTexture | null {
    const dishSig = dishes
      .slice(0, 4)
      .map((d) => d.name)
      .join('|');
    const key = `menu_${title}_${accentHex}_${dishSig}`;
    const existing = this.sceneScoped.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(512, 256);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    // Warm timber frame
    ctx.fillStyle = '#8b5a2b';
    drawRoundedRectPath(ctx, 0, 0, 512, 256, 22);
    ctx.fill();

    // Charcoal-slate chalkboard interior
    ctx.fillStyle = '#24323f';
    drawRoundedRectPath(ctx, 16, 16, 480, 224, 14);
    ctx.fill();

    // Inner creamy chalk dashed border
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.52)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    drawRoundedRectPath(ctx, 28, 28, 456, 200, 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Accent header ribbon
    ctx.fillStyle = accentHex;
    drawRoundedRectPath(ctx, 116, 36, 280, 38, 12);
    ctx.fill();
    ctx.fillStyle = '#3d2314';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const header = title.length > 18 ? "TODAY'S SPECIALS" : title.toUpperCase();
    ctx.fillText(header, 256, 56);

    // Up to 4 crisp dish rows
    const shown = dishes.slice(0, 4);
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < shown.length; i++) {
      const y = 104 + i * 33;
      const dish = shown[i];
      const label = `${dish.icon} ${dish.name.slice(0, 22)}`;

      ctx.fillStyle = '#fffbf0';
      ctx.textAlign = 'left';
      ctx.fillText(label, 48, y);

      // Dotted leader & star
      ctx.fillStyle = 'rgba(255, 251, 240, 0.45)';
      ctx.textAlign = 'right';
      ctx.fillText('• • •', 430, y);

      ctx.fillStyle = '#fde047';
      ctx.fillText('★', 462, y);
    }

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: true,
      clamp: true,
    });
  }

  /**
   * 6. Illustrated glossy candy-cartoon venue marquee signboard.
   */
  createMarqueeSign(
    venueName: string,
    dishIcon: string,
    accentHex: string,
    roofHex: string,
  ): THREE.CanvasTexture | null {
    const key = `marq_${venueName}_${dishIcon}_${accentHex}_${roofHex}`;
    const existing = this.sceneScoped.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(512, 128);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    // Outer cocoa cartoon stroke
    ctx.fillStyle = '#3d2314';
    drawRoundedRectPath(ctx, 2, 2, 508, 124, 28);
    ctx.fill();

    // Roof-colored outer candy band
    ctx.fillStyle = roofHex;
    drawRoundedRectPath(ctx, 10, 10, 492, 108, 22);
    ctx.fill();

    // Bright cream inner plaque
    ctx.fillStyle = '#fffbf0';
    drawRoundedRectPath(ctx, 20, 20, 472, 88, 16);
    ctx.fill();

    // Curved top specular white gloss strip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    drawRoundedRectPath(ctx, 32, 24, 448, 26, 12);
    ctx.fill();

    // Left circular dish emblem badge
    ctx.fillStyle = '#3d2314';
    ctx.beginPath();
    ctx.arc(64, 64, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.arc(64, 64, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(64, 64, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dishIcon || '🍽️', 64, 66);

    // Right golden star cluster
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('★', 456, 62);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('✦', 440, 44);
    ctx.fillText('✦', 468, 82);

    // Auto-scaled venue title centered between left badge and right stars
    const maxTextWidth = 316;
    let fontSize = 42;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    while (fontSize > 22) {
      ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
      if (ctx.measureText(venueName).width <= maxTextWidth) break;
      fontSize -= 2;
    }

    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3d2314';
    ctx.strokeText(venueName, 262, 66);
    const textGrad = ctx.createLinearGradient(0, 40, 0, 88);
    textGrad.addColorStop(0, '#fde047');
    textGrad.addColorStop(0.55, '#f97316');
    textGrad.addColorStop(1, '#c2410c');
    ctx.fillStyle = textGrad;
    ctx.fillText(venueName, 262, 66);

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: true,
      clamp: true,
    });
  }

  /**
   * 7. Soft radial contact shadow disc (shared across all entities & props).
   */
  createContactShadowDisc(): THREE.CanvasTexture | null {
    const key = '__contact_shadow_disc';
    const existing = this.shared.get(key);
    if (existing) return existing;

    const surface = this.makeCanvas(128, 128);
    if (!surface) return null;
    const { canvas, ctx } = surface;

    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    grad.addColorStop(0, 'rgba(42, 24, 14, 0.58)');
    grad.addColorStop(0.55, 'rgba(42, 24, 14, 0.24)');
    grad.addColorStop(1, 'rgba(42, 24, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    return this.finalizeTexture(canvas, {
      key,
      sceneScoped: false,
      clamp: true,
    });
  }

  disposeSceneScoped(): void {
    for (const tex of this.sceneScoped.values()) {
      delete tex.userData.__pooled;
      delete tex.userData.__sceneScoped;
      tex.dispose();
    }
    this.sceneScoped.clear();
  }

  dispose(): void {
    this.disposeSceneScoped();
    for (const tex of this.shared.values()) {
      delete tex.userData.__pooled;
      tex.dispose();
    }
    this.shared.clear();
  }

  getStats(): { shared: number; sceneScoped: number } {
    return {
      shared: this.shared.size,
      sceneScoped: this.sceneScoped.size,
    };
  }
}

/**
 * Recursively disposes every unpooled BufferGeometry (anything without `userData.__pooled`),
 * releases GPU instance buffers via `instancedMesh.dispose()` on every THREE.InstancedMesh,
 * and disposes any unpooled ad-hoc Material (plus optional textures) while protecting all
 * shared GeometryPool / MaterialPool / TextureFactory resources.
 */
export function disposeObjectTree(
  root: THREE.Object3D,
  options: DisposeTreeOptions = {},
): void {
  const {
    disposeMaterials = false,
    disposeTextures = false,
    clearChildren = false,
  } = options;
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTexs = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const maybeMesh = obj as THREE.Mesh;
    if (
      maybeMesh.geometry &&
      !maybeMesh.geometry.userData?.__pooled &&
      !disposedGeos.has(maybeMesh.geometry)
    ) {
      disposedGeos.add(maybeMesh.geometry);
      maybeMesh.geometry.dispose();
    }

    if (obj instanceof THREE.InstancedMesh) {
      obj.dispose();
    }

    if (maybeMesh.material) {
      const matList = Array.isArray(maybeMesh.material)
        ? maybeMesh.material
        : [maybeMesh.material];
      for (const mat of matList) {
        if (!mat || disposedMats.has(mat)) continue;
        const isPooled = Boolean(mat.userData?.__pooled);
        if (isPooled) continue;
        if (!disposeMaterials && mat.userData?.__sceneScoped) continue;

        disposedMats.add(mat);
        if (disposeTextures) {
          const stdMat = mat as THREE.MeshStandardMaterial;
          for (const tex of [
            stdMat.map,
            stdMat.emissiveMap,
            stdMat.roughnessMap,
            stdMat.metalnessMap,
            stdMat.alphaMap,
            stdMat.normalMap,
          ]) {
            if (tex && !tex.userData?.__pooled && !disposedTexs.has(tex)) {
              disposedTexs.add(tex);
              tex.dispose();
            }
          }
        }
        mat.dispose();
      }
    }
  });

  if (clearChildren) {
    root.clear();
  }
}
