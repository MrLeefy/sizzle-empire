import * as THREE from 'three';
import type { RestaurantLayout, RestaurantTemplate } from '@/types/game';
import {
  GeometryPool,
  MaterialPool,
  TextureFactory,
  createRoundedBoxGeometry,
} from './materialLibrary';

export interface VenueEnvironmentTheme {
  themeId: string;
  skyColor: string;
  groundColor: string;
  fogColor: string;
  hemiSky: string;
  hemiGround: string;
  rimColor: string;
  isNightVenue: boolean;
  isWaterGround: boolean;
  lightIntensityScale: number;
  floorStyle: 'tile' | 'wood' | 'stone' | 'metal' | 'pier';
}

export interface TableVisualHandle {
  group: THREE.Group;
  tableIndex: number;
  slotIndices: number[];
  center: { x: number; z: number };
  seatPositions: Array<{
    slotIndex: number;
    x: number;
    z: number;
    seatCenterZ: number;
  }>;
  seatTopY: number;
  unlocked: boolean;
  popProgress: number;
}

export interface PassDishSlotHandle {
  anchor: THREE.Group;
  plateMesh: THREE.Mesh;
  dishGroup: THREE.Group;
  haloMesh: THREE.Mesh;
  occupiedOrderId: string | null;
  currentDishKey: string;
}

export interface EnvironmentAnimatedProp {
  object: THREE.Object3D;
  kind: 'bulb' | 'flame' | 'crystal' | 'beacon' | 'water' | 'cloud' | 'orb';
  baseY: number;
  phase: number;
}

/**
 * Aligns rendered tip coin stacks and projected tip badges onto the serving
 * shelf centerline on `food_truck` venues (where `trk_shelf` sits at z = 1.15
 * so hired cashiers at z = 0.60 stay clear of the shelf and tip stacks).
 */
export function resolveTipVisualZ(
  archetype: RestaurantTemplate['archetype'],
  simZ: number,
): number {
  return archetype === 'food_truck' ? 1.22 : simZ;
}

export interface EnvironmentVisualRig {
  root: THREE.Group;
  theme: VenueEnvironmentTheme;
  tables: TableVisualHandle[];
  passDishSlots: PassDishSlotHandle[];
  animatedProps: EnvironmentAnimatedProp[];
}

const SPECIAL_VENUE_THEMES: Record<string, VenueEnvironmentTheme> = {
  event_potion_shop: {
    themeId: 'event_potion_shop',
    skyColor: '#2a1842',
    groundColor: '#372354',
    fogColor: '#2a1842',
    hemiSky: '#ddd6fe',
    hemiGround: '#581c87',
    rimColor: '#e879f9',
    isNightVenue: true,
    isWaterGround: false,
    lightIntensityScale: 0.88,
    floorStyle: 'stone',
  },
  event_crystal_cavern: {
    themeId: 'event_crystal_cavern',
    skyColor: '#162544',
    groundColor: '#253759',
    fogColor: '#162544',
    hemiSky: '#bae6fd',
    hemiGround: '#334155',
    rimColor: '#7dd3fc',
    isNightVenue: true,
    isWaterGround: false,
    lightIntensityScale: 0.88,
    floorStyle: 'stone',
  },
  event_lunar_outpost: {
    themeId: 'event_lunar_outpost',
    skyColor: '#121b38',
    groundColor: '#475569',
    fogColor: '#121b38',
    hemiSky: '#e0f2fe',
    hemiGround: '#475569',
    rimColor: '#93c5fd',
    isNightVenue: true,
    isWaterGround: false,
    lightIntensityScale: 0.90,
    floorStyle: 'metal',
  },
  event_tidewater_pier: {
    themeId: 'event_tidewater_pier',
    skyColor: '#5cc8ff',
    groundColor: '#0ea5e9',
    fogColor: '#7dd3fc',
    hemiSky: '#fffdf5',
    hemiGround: '#bae6fd',
    rimColor: '#fde68a',
    isNightVenue: false,
    isWaterGround: true,
    lightIntensityScale: 1.0,
    floorStyle: 'pier',
  },
  event_citadel_orchard: {
    themeId: 'event_citadel_orchard',
    skyColor: '#8fd3fe',
    groundColor: '#a3c977',
    fogColor: '#a5e1fa',
    hemiSky: '#fffdf5',
    hemiGround: '#fde68a',
    rimColor: '#ffd6e8',
    isNightVenue: false,
    isWaterGround: false,
    lightIntensityScale: 1.0,
    floorStyle: 'wood',
  },
  event_citadel_inn: {
    themeId: 'event_citadel_inn',
    skyColor: '#f8c98a',
    groundColor: '#c9b48a',
    fogColor: '#f8cfa0',
    hemiSky: '#fff7ed',
    hemiGround: '#fed7aa',
    rimColor: '#fde68a',
    isNightVenue: false,
    isWaterGround: false,
    lightIntensityScale: 1.0,
    floorStyle: 'wood',
  },
  event_citadel_keep: {
    themeId: 'event_citadel_keep',
    skyColor: '#9ec5f8',
    groundColor: '#c7c2b8',
    fogColor: '#b2d1f0',
    hemiSky: '#fffdf5',
    hemiGround: '#ffe8cc',
    rimColor: '#fde68a',
    isNightVenue: false,
    isWaterGround: false,
    lightIntensityScale: 1.0,
    floorStyle: 'stone',
  },
  adventure_olympus: {
    themeId: 'adventure_olympus',
    skyColor: '#7dd3fc',
    groundColor: '#ebe5d5',
    fogColor: '#b8e6ff',
    hemiSky: '#fffdf5',
    hemiGround: '#fef3c7',
    rimColor: '#fde047',
    isNightVenue: false,
    isWaterGround: false,
    lightIntensityScale: 1.05,
    floorStyle: 'stone',
  },
  adventure_corsair: {
    themeId: 'adventure_corsair',
    skyColor: '#5cc8ff',
    groundColor: '#0284c7',
    fogColor: '#8ee0f5',
    hemiSky: '#fffdf5',
    hemiGround: '#bae6fd',
    rimColor: '#fed7aa',
    isNightVenue: false,
    isWaterGround: true,
    lightIntensityScale: 1.0,
    floorStyle: 'pier',
  },
};

/**
 * Single-source-of-truth venue environment atmosphere lookup covering all 9 special venues
 * plus all 60 city defaults. Consumed directly by both `environmentBuilder` and `SceneRenderer`.
 */
export function getVenueEnvironmentTheme(
  templateId: string,
  city: { skyColor: string; groundColor: string; accentColor?: string },
): VenueEnvironmentTheme {
  const special = SPECIAL_VENUE_THEMES[templateId];
  if (special) return { ...special };
  return {
    themeId: 'default',
    skyColor: city.skyColor,
    groundColor: city.groundColor,
    fogColor: city.skyColor,
    hemiSky: '#fffdf5',
    hemiGround: '#ffe8cc',
    rimColor: '#ffd6e8',
    isNightVenue: false,
    isWaterGround: false,
    lightIntensityScale: 1.0,
    floorStyle: 'tile',
  };
}

function getGeo<T extends THREE.BufferGeometry>(
  geos: GeometryPool | undefined,
  key: string,
  factory: () => T,
): T {
  if (geos) return geos.getOrCreate(key, factory);
  const g = factory();
  g.userData.__pooled = false;
  return g;
}

function buildScallopedAwning(
  width: number,
  y: number,
  zBack: number,
  roofColor: string,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  let stripeCount = Math.max(8, Math.floor(width / 0.95));
  if (stripeCount % 2 !== 0) stripeCount += 1;
  const stripeW = width / stripeCount;
  const halfCount = stripeCount / 2;

  const slopeGeo = getGeo(
    geos,
    `awn_slp_${Math.round(stripeW * 100)}`,
    () => createRoundedBoxGeometry(stripeW * 0.99, 0.14, 0.96, 1, 0.045),
  );
  const valGeo = getGeo(
    geos,
    `awn_val_${Math.round(stripeW * 100)}`,
    () => new THREE.CylinderGeometry(stripeW * 0.48, stripeW * 0.48, 0.12, 10),
  );

  const colorMat = mats.glossy(roofColor, 0.34, 0.05);
  const creamMat = mats.glossy('#fffdf7', 0.34, 0.04);

  const slopeEven = new THREE.InstancedMesh(slopeGeo, colorMat, halfCount);
  const slopeOdd = new THREE.InstancedMesh(slopeGeo, creamMat, halfCount);
  const valEven = new THREE.InstancedMesh(valGeo, colorMat, halfCount);
  const valOdd = new THREE.InstancedMesh(valGeo, creamMat, halfCount);

  for (const im of [slopeEven, slopeOdd, valEven, valOdd]) {
    im.castShadow = true;
    im.receiveShadow = true;
  }

  const dummy = new THREE.Object3D();
  let eIdx = 0;
  let oIdx = 0;
  for (let i = 0; i < stripeCount; i++) {
    const sx = -width / 2 + stripeW * (i + 0.5);
    dummy.position.set(sx, y + 0.06, zBack + 0.36);
    dummy.rotation.set(0.24, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    if (i % 2 === 0) {
      slopeEven.setMatrixAt(eIdx, dummy.matrix);
    } else {
      slopeOdd.setMatrixAt(oIdx, dummy.matrix);
    }

    dummy.position.set(sx, y - 0.10, zBack + 0.80);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    if (i % 2 === 0) {
      valEven.setMatrixAt(eIdx, dummy.matrix);
      eIdx++;
    } else {
      valOdd.setMatrixAt(oIdx, dummy.matrix);
      oIdx++;
    }
  }
  slopeEven.instanceMatrix.needsUpdate = true;
  slopeOdd.instanceMatrix.needsUpdate = true;
  valEven.instanceMatrix.needsUpdate = true;
  valOdd.instanceMatrix.needsUpdate = true;

  g.add(slopeEven, slopeOdd, valEven, valOdd);

  // Diagonal iron support brackets attaching awning cleanly to wall
  const bracketGeo = getGeo(geos, 'awn_bracket', () => new THREE.CylinderGeometry(0.025, 0.025, 0.92, 6));
  const ironMat = mats.metallic('#334155', 0.38, 0.65);
  const bracketXs = width >= 13 ? [-width * 0.42, -width * 0.15, width * 0.15, width * 0.42] : [-width * 0.36, width * 0.36];
  for (const bx of bracketXs) {
    const br = new THREE.Mesh(bracketGeo, ironMat);
    br.position.set(bx, y - 0.36, zBack + 0.46);
    br.rotation.x = 0.85;
    g.add(br);
  }

  return g;
}

function buildFairyStringLights(
  width: number,
  yTop: number,
  zLine: number,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  animatedProps: EnvironmentAnimatedProp[],
): THREE.Group {
  const g = new THREE.Group();
  const bulbCount = Math.max(6, Math.floor(width / 1.5));
  const leftX = -width / 2 + 0.7;
  const rightX = width / 2 - 0.7;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i < bulbCount; i++) {
    const t = bulbCount === 1 ? 0.5 : i / (bulbCount - 1);
    const x = leftX + t * (rightX - leftX);
    const sag = Math.sin(t * Math.PI) * 0.22;
    points.push(new THREE.Vector3(x, yTop - 0.22 - sag, zLine));
  }

  // Connected catenary wire segments (InstancedMesh, 1 draw call!)
  const segCount = Math.max(1, bulbCount - 1);
  const wireGeo = getGeo(geos, 'fairy_wire', () => new THREE.CylinderGeometry(0.014, 0.014, 1, 6));
  const wireMesh = new THREE.InstancedMesh(wireGeo, mats.std('#334155', 0.5, 0.3), segCount);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    dir.subVectors(b, a);
    const len = dir.length();
    dummy.position.addVectors(a, b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, dir.normalize());
    dummy.scale.set(1, len, 1);
    dummy.updateMatrix();
    wireMesh.setMatrixAt(i, dummy.matrix);
  }
  wireMesh.instanceMatrix.needsUpdate = true;

  // Warm glowing bulbs (InstancedMesh, 1 draw call!)
  const bulbGeo = getGeo(geos, 'fairy_bulb', () => new THREE.SphereGeometry(0.095, 8, 6));
  const bulbMesh = new THREE.InstancedMesh(
    bulbGeo,
    mats.emissiveGlow('#fef08a', 0.95, 0.16),
    bulbCount,
  );
  for (let i = 0; i < points.length; i++) {
    dummy.position.set(points[i].x, points[i].y - 0.075, points[i].z);
    dummy.quaternion.identity();
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bulbMesh.setMatrixAt(i, dummy.matrix);
  }
  bulbMesh.instanceMatrix.needsUpdate = true;
  g.add(wireMesh, bulbMesh);

  animatedProps.push({ object: bulbMesh, kind: 'bulb', baseY: 0, phase: 0 });
  return g;
}

function buildMarqueeSignboard(
  template: RestaurantTemplate,
  w: number,
  y: number,
  z: number,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  textures: TextureFactory | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const signW = Math.min(6.0, w * 0.56);

  // Tilt marquee face gently toward angled diorama camera so venue name reads crystal-clear!
  const signPivot = new THREE.Group();
  signPivot.position.set(0, y + 0.08, z);
  signPivot.rotation.x = -0.44;
  g.add(signPivot);

  const frame = new THREE.Mesh(
    getGeo(geos, `marq_frm_${Math.round(signW * 10)}`, () => createRoundedBoxGeometry(signW + 0.24, 1.06, 0.22, 2, 0.09)),
    mats.glossy(template.themeRoofColor, 0.32, 0.12),
  );
  frame.castShadow = true;
  signPivot.add(frame);

  const signTex =
    textures?.createMarqueeSign(
      template.name,
      template.stations[0]?.icon ?? '🍽️',
      template.themeAccentColor,
      template.themeRoofColor,
    ) ?? null;

  const faceMat = mats.textured(`marq_face_${template.id}`, signTex, {
    color: signTex ? '#ffffff' : '#fffbf0',
    roughness: 0.42,
    emissive: signTex ? '#ffffff' : template.themeAccentColor,
    emissiveIntensity: signTex ? 0.08 : 0.08,
    sceneScoped: true,
  });

  const face = new THREE.Mesh(
    getGeo(geos, `marq_pln_${Math.round(signW * 10)}`, () => new THREE.PlaneGeometry(signW, 0.88)),
    faceMat,
  );
  face.position.set(0, 0, 0.12);
  signPivot.add(face);

  // 2 slim roof brackets
  const postGeo = getGeo(geos, 'marq_post', () => new THREE.CylinderGeometry(0.045, 0.05, 0.36, 8));
  const postMat = mats.metallic('#334155', 0.35, 0.65);
  for (const sx of [-signW * 0.32, signW * 0.32]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(sx, y - 0.52, z);
    g.add(p);
  }
  return g;
}

function buildPlumpPlanterTree(
  x: number,
  z: number,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  shadowTex: THREE.Texture | null,
  withApples = false,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const shadow = new THREE.Mesh(
    getGeo(geos, 'env_tree_shd', () => new THREE.PlaneGeometry(1, 1)),
    mats.contactShadow(shadowTex),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1.3, 1.3, 1);
  shadow.position.y = 0.03;
  shadow.raycast = () => {};
  g.add(shadow);

  const potMat = mats.glossy('#d97757', 0.48, 0.04);
  const pot = new THREE.Mesh(
    getGeo(geos, 'env_pot', () => new THREE.CylinderGeometry(0.44, 0.32, 0.54, 12)),
    potMat,
  );
  pot.position.y = 0.27;
  pot.castShadow = true;
  pot.receiveShadow = true;

  const rim = new THREE.Mesh(
    getGeo(geos, 'env_pot_rim', () => new THREE.TorusGeometry(0.44, 0.055, 6, 14)),
    potMat,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.53;

  const soil = new THREE.Mesh(
    getGeo(geos, 'env_soil', () => new THREE.CylinderGeometry(0.40, 0.40, 0.04, 12)),
    mats.matte('#5c3a21'),
  );
  soil.position.y = 0.52;

  const trunk = new THREE.Mesh(
    getGeo(geos, 'env_trunk', () => new THREE.CylinderGeometry(0.11, 0.15, 0.68, 10)),
    mats.std('#78350f', 0.65, 0.03),
  );
  trunk.position.y = 0.84;
  trunk.castShadow = true;

  // 3 overlapping plump candy-green canopy spheres (replaces faceted dodecahedrons!)
  const f1 = new THREE.Mesh(
    getGeo(geos, 'env_fol1', () => new THREE.SphereGeometry(0.54, 12, 10)),
    mats.glossy('#22c55e', 0.46, 0.03),
  );
  f1.position.set(0, 1.48, 0);
  f1.castShadow = true;
  const f2 = new THREE.Mesh(
    getGeo(geos, 'env_fol2', () => new THREE.SphereGeometry(0.40, 10, 8)),
    mats.glossy('#4ade80', 0.44, 0.03),
  );
  f2.position.set(-0.26, 1.38, 0.20);
  f2.castShadow = true;
  const f3 = new THREE.Mesh(
    getGeo(geos, 'env_fol3', () => new THREE.SphereGeometry(0.36, 10, 8)),
    mats.glossy('#16a34a', 0.48, 0.03),
  );
  f3.position.set(0.28, 1.36, -0.14);
  f3.castShadow = true;

  g.add(pot, rim, soil, trunk, f1, f2, f3);

  if (withApples) {
    const appleGeo = getGeo(geos, 'env_apple', () => new THREE.SphereGeometry(0.085, 8, 8));
    const appleMat = mats.glossy('#ef4444', 0.16, 0.1);
    for (const [ax, ay, az] of [
      [-0.36, 1.38, 0.34],
      [0.24, 1.56, 0.38],
      [-0.08, 1.72, 0.36],
      [0.42, 1.35, 0.18],
      [-0.34, 1.58, -0.18],
    ]) {
      const a = new THREE.Mesh(appleGeo, appleMat);
      a.position.set(ax, ay, az);
      g.add(a);
    }
  }

  return g;
}

function buildFoodTruckRoofMascot(
  style: RestaurantTemplate['stations'][0]['modelStyle'],
  accentColor: string,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const whiteMat = mats.glossy('#fffbf0', 0.3, 0.04);
  const accMat = mats.glossy(accentColor, 0.25, 0.1);

  if (style === 'espresso') {
    const cup = new THREE.Mesh(
      getGeo(geos, 'trk_m_cup', () => new THREE.CylinderGeometry(0.42, 0.30, 0.88, 14)),
      whiteMat,
    );
    cup.position.y = 0.44;
    const sleeve = new THREE.Mesh(
      getGeo(geos, 'trk_m_slv', () => new THREE.CylinderGeometry(0.38, 0.34, 0.32, 14)),
      accMat,
    );
    sleeve.position.y = 0.46;
    const lid = new THREE.Mesh(
      getGeo(geos, 'trk_m_lid', () => new THREE.CylinderGeometry(0.45, 0.46, 0.14, 14)),
      mats.glossy('#3d2314', 0.32, 0.06),
    );
    lid.position.y = 0.94;
    g.add(cup, sleeve, lid);
  } else if (style === 'grill' || style === 'fryer') {
    const bunMat = mats.glossy('#d97706', 0.38, 0.04);
    const bot = new THREE.Mesh(
      getGeo(geos, 'trk_m_bbun', () => new THREE.CylinderGeometry(0.54, 0.52, 0.16, 16)),
      bunMat,
    );
    bot.position.y = 0.08;
    const letc = new THREE.Mesh(
      getGeo(geos, 'trk_m_let', () => new THREE.CylinderGeometry(0.60, 0.58, 0.08, 12)),
      mats.glossy('#22c55e', 0.38, 0.04),
    );
    letc.position.y = 0.20;
    const pat = new THREE.Mesh(
      getGeo(geos, 'trk_m_pat', () => new THREE.CylinderGeometry(0.55, 0.55, 0.18, 16)),
      mats.glossy('#78350f', 0.45, 0.05),
    );
    pat.position.y = 0.32;
    const chs = new THREE.Mesh(
      getGeo(geos, 'trk_m_chs', () => new THREE.BoxGeometry(0.84, 0.06, 0.84)),
      mats.glossy('#facc15', 0.26, 0.08),
    );
    chs.rotation.y = Math.PI / 4;
    chs.position.y = 0.44;
    const top = new THREE.Mesh(
      getGeo(geos, 'trk_m_tbun', () => new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      bunMat,
    );
    top.position.y = 0.46;
    g.add(bot, letc, pat, chs, top);
  } else if (style === 'wok') {
    const bowl = new THREE.Mesh(
      getGeo(geos, 'trk_m_bowl', () => new THREE.CylinderGeometry(0.58, 0.34, 0.46, 16)),
      accMat,
    );
    bowl.position.y = 0.23;
    const noodles = new THREE.Mesh(
      getGeo(geos, 'trk_m_ndls', () => new THREE.SphereGeometry(0.50, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
      mats.glossy('#fde047', 0.35, 0.05),
    );
    noodles.scale.set(1, 0.55, 1);
    noodles.position.y = 0.42;
    const stickGeo = getGeo(geos, 'trk_m_stk', () => new THREE.CylinderGeometry(0.025, 0.035, 1.15, 8));
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(stickGeo, mats.std('#78350f'));
      st.position.set(0.18 + s * 0.08, 0.72, 0);
      st.rotation.z = -0.45 + s * 0.1;
      g.add(st);
    }
    g.add(bowl, noodles);
  } else if (style === 'dessert') {
    const cone = new THREE.Mesh(
      getGeo(geos, 'trk_m_cone', () => new THREE.ConeGeometry(0.34, 0.62, 12)),
      mats.glossy('#d97706', 0.44, 0.04),
    );
    cone.rotation.x = Math.PI;
    cone.position.y = 0.31;
    const sc1 = new THREE.Mesh(
      getGeo(geos, 'trk_m_sc1', () => new THREE.SphereGeometry(0.36, 12, 10)),
      mats.glossy('#f472b6', 0.26, 0.06),
    );
    sc1.position.y = 0.66;
    const sc2 = new THREE.Mesh(
      getGeo(geos, 'trk_m_sc2', () => new THREE.SphereGeometry(0.26, 10, 8)),
      whiteMat,
    );
    sc2.position.y = 0.96;
    const ch = new THREE.Mesh(
      getGeo(geos, 'trk_m_chr', () => new THREE.SphereGeometry(0.10, 8, 8)),
      mats.glossy('#ef4444', 0.14, 0.12),
    );
    ch.position.y = 1.22;
    g.add(cone, sc1, sc2, ch);
  } else {
    const citrus = new THREE.Mesh(
      getGeo(geos, 'trk_m_cit', () => new THREE.CylinderGeometry(0.52, 0.52, 0.16, 16)),
      accMat,
    );
    citrus.rotation.x = Math.PI / 2;
    citrus.position.y = 0.52;
    const inner = new THREE.Mesh(
      getGeo(geos, 'trk_m_citi', () => new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16)),
      mats.glossy('#fef08a', 0.24, 0.08),
    );
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.52;
    g.add(citrus, inner);
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

function buildPassCounter(
  w: number,
  passZ: number,
  template: RestaurantTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  textures: TextureFactory | undefined,
  passDishSlots: PassDishSlotHandle[],
): THREE.Group {
  const g = new THREE.Group();
  const passLen = w - 3.2;

  const base = new THREE.Mesh(
    getGeo(geos, `pass_base_${Math.round(passLen * 10)}`, () => createRoundedBoxGeometry(passLen, 0.82, 0.74, 2, 0.08)),
    mats.glossy(template.themeWallColor, 0.38, 0.05),
  );
  base.position.set(0, 0.41, passZ);
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const marbleTex = textures?.createMarbleCounter('#fffbf4') ?? null;
  const topMat = mats.textured('pass_marble_top', marbleTex, {
    color: marbleTex ? '#ffffff' : '#fffbf4',
    roughness: 0.24,
    metalness: 0.08,
    sceneScoped: false,
  });
  const top = new THREE.Mesh(
    getGeo(geos, `pass_top_${Math.round(passLen * 10)}`, () => createRoundedBoxGeometry(passLen + 0.2, 0.10, 0.88, 2, 0.045)),
    topMat,
  );
  top.position.set(0, 0.87, passZ);
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);

  // Overhead brass heat-lamp bar + 3 copper bell shades + glowing amber bulbs
  const brassMat = mats.metallic('#e5b94c', 0.22, 0.78);
  const copperMat = mats.metallic('#d97706', 0.24, 0.72);
  const bulbMat = mats.emissiveGlow('#fdba74', 0.95, 0.16);
  const halfRail = passLen * 0.44;

  const postGeo = getGeo(geos, 'pass_post', () => new THREE.CylinderGeometry(0.04, 0.045, 1.04, 8));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, brassMat);
    p.position.set(s * halfRail, 1.42, passZ);
    g.add(p);
  }
  const rail = new THREE.Mesh(
    getGeo(geos, `pass_rail_${Math.round(passLen * 10)}`, () => new THREE.CylinderGeometry(0.036, 0.036, halfRail * 2 + 0.1, 8)),
    brassMat,
  );
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 1.92, passZ);
  g.add(rail);

  const shadeGeo = getGeo(geos, 'pass_shade', () => new THREE.ConeGeometry(0.24, 0.22, 12));
  const bulbGeo = getGeo(geos, 'pass_bulb', () => new THREE.SphereGeometry(0.08, 8, 6));
  const lampSpan = passLen * 0.26;
  for (const lx of [-lampSpan, 0, lampSpan]) {
    const sh = new THREE.Mesh(shadeGeo, copperMat);
    sh.position.set(lx, 1.84, passZ);
    const blb = new THREE.Mesh(bulbGeo, bulbMat);
    blb.position.set(lx, 1.74, passZ);
    g.add(sh, blb);
  }

  // Glossy brass service bell
  const bell = new THREE.Mesh(
    getGeo(geos, 'pass_bell', () => new THREE.SphereGeometry(0.11, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
    brassMat,
  );
  bell.position.set(-halfRail + 0.35, 0.92, passZ + 0.18);
  g.add(bell);

  // 6 Waiting Dish Slot Anchors (hidden by default; shown by SceneRenderer for ready_at_pass orders!)
  const slotSpan = Math.min(passLen - 2.4, 8.4);
  const plateGeo = getGeo(geos, 'pass_plate', () => new THREE.CylinderGeometry(0.24, 0.20, 0.035, 14));
  const haloGeo = getGeo(geos, 'pass_halo', () => new THREE.TorusGeometry(0.29, 0.032, 6, 16));
  const plateMat = mats.glossy('#fffbf0', 0.24, 0.05);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const sx = -slotSpan / 2 + t * slotSpan;
    const anchor = new THREE.Group();
    anchor.position.set(sx, 0.93, passZ);
    anchor.visible = false;

    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    const dishGroup = new THREE.Group();
    dishGroup.position.y = 0.025;
    const haloMesh = new THREE.Mesh(haloGeo, mats.basicMat('#facc15', 0.9, false));
    haloMesh.rotation.x = Math.PI / 2;
    haloMesh.position.y = 0.14;
    haloMesh.visible = false;

    anchor.add(plateMesh, dishGroup, haloMesh);
    g.add(anchor);
    passDishSlots.push({
      anchor,
      plateMesh,
      dishGroup,
      haloMesh,
      occupiedOrderId: null,
      currentDishKey: '',
    });
  }

  return g;
}

function buildDiningTables(
  template: RestaurantTemplate,
  layout: RestaurantLayout,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  shadowTex: THREE.Texture | null,
  tables: TableVisualHandle[],
): THREE.Group {
  const g = new THREE.Group();
  const isRoundCafe = template.archetype === 'cafe_tables';

  // Group table slots by (tipPos.x, tipPos.z)
  const clusters = new Map<
    string,
    {
      tx: number;
      tz: number;
      slots: typeof layout.slots;
    }
  >();

  for (const slot of layout.slots) {
    if (slot.kind !== 'table') continue;
    const key = `${slot.tipPos.x.toFixed(2)}_${slot.tipPos.z.toFixed(2)}`;
    let entry = clusters.get(key);
    if (!entry) {
      entry = { tx: slot.tipPos.x, tz: slot.tipPos.z, slots: [] };
      clusters.set(key, entry);
    }
    entry.slots.push(slot);
  }

  const woodMat = mats.glossy('#b07543', 0.36, 0.06);
  const darkWoodMat = mats.std('#6b4226', 0.48, 0.06);
  const clothMat = mats.glossy(template.themeAccentColor, 0.38, 0.05);
  const linenMat = mats.glossy('#fffbf0', 0.4, 0.02);
  const cushionMat = mats.glossy(template.themeRoofColor, 0.36, 0.05);

  const pedGeo = getGeo(geos, 'tbl_ped', () => new THREE.CylinderGeometry(0.11, 0.20, 0.66, 12));
  const roundTopGeo = getGeo(geos, 'tbl_rtop', () => new THREE.CylinderGeometry(0.50, 0.50, 0.09, 16));
  const roundClothGeo = getGeo(geos, 'tbl_rcloth', () => new THREE.CylinderGeometry(0.38, 0.38, 0.02, 14));
  const rectTopGeo = getGeo(geos, 'tbl_btop', () => createRoundedBoxGeometry(1.16, 0.09, 0.70, 2, 0.06));
  const rectRunGeo = getGeo(geos, 'tbl_brun', () => createRoundedBoxGeometry(0.84, 0.022, 0.46, 1, 0.01));
  const vaseGeo = getGeo(geos, 'tbl_vase', () => new THREE.CylinderGeometry(0.05, 0.065, 0.14, 10));
  const flowerGeo = getGeo(geos, 'tbl_flw', () => new THREE.SphereGeometry(0.068, 8, 6));

  // Harmonized Chair Geometry:
  // legs y ∈ [0, 0.28], seat y ∈ [0.28, 0.36] (seatTopY = 0.36), backrest y ∈ [0.36, 0.78] at z = +0.84
  const chairLegGeo = getGeo(geos, 'chr_leg', () => new THREE.CylinderGeometry(0.025, 0.022, 0.28, 6));
  const chairSeatGeo = getGeo(geos, 'chr_seat', () => createRoundedBoxGeometry(0.42, 0.08, 0.36, 1, 0.03));
  const chairBackGeo = getGeo(geos, 'chr_back', () => createRoundedBoxGeometry(0.42, 0.42, 0.08, 1, 0.035));

  let tableIndex = 0;
  for (const cluster of clusters.values()) {
    const tblGroup = new THREE.Group();
    tblGroup.position.set(cluster.tx, 0, cluster.tz);

    // Contact shadow
    const shd = new THREE.Mesh(
      getGeo(geos, 'tbl_shd', () => new THREE.PlaneGeometry(1, 1)),
      mats.contactShadow(shadowTex),
    );
    shd.rotation.x = -Math.PI / 2;
    shd.scale.set(1.65, 1.25, 1);
    shd.position.set(0, 0.046, -0.04);
    shd.raycast = () => {};
    tblGroup.add(shd);

    // Table pedestal & top shifted to local z = -0.08 for generous leg & chest clearance!
    const ped = new THREE.Mesh(pedGeo, darkWoodMat);
    ped.position.set(0, 0.34, -0.08);
    ped.castShadow = true;
    ped.receiveShadow = true;
    ped.userData.propType = 'table_pedestal';
    tblGroup.add(ped);

    if (isRoundCafe) {
      const top = new THREE.Mesh(roundTopGeo, woodMat);
      top.position.set(0, 0.72, -0.08);
      top.castShadow = true;
      top.receiveShadow = true;
      const cloth = new THREE.Mesh(roundClothGeo, clothMat);
      cloth.position.set(0, 0.77, -0.08);
      tblGroup.add(top, cloth);
    } else {
      const top = new THREE.Mesh(rectTopGeo, linenMat);
      top.position.set(0, 0.72, -0.08);
      top.castShadow = true;
      top.receiveShadow = true;
      const runner = new THREE.Mesh(rectRunGeo, clothMat);
      runner.position.set(0, 0.77, -0.08);
      tblGroup.add(top, runner);
    }

    // Mini ceramic centerpiece vase shifted clear of rotating tip stacks (r <= 0.30 at (0, 0)):
    // round cafe tables (cloth r = 0.38 around z = -0.08) -> (0, -0.37);
    // rectangular dining tables (top X ∈ [-0.58, 0.58], Z ∈ [-0.43, 0.27]) -> (-0.38, -0.22).
    const vaseX = isRoundCafe ? 0 : -0.38;
    const vaseZ = isRoundCafe ? -0.37 : -0.22;
    const vase = new THREE.Mesh(vaseGeo, linenMat);
    vase.position.set(vaseX, 0.83, vaseZ);
    const flower = new THREE.Mesh(flowerGeo, clothMat);
    flower.position.set(vaseX, 0.92, vaseZ);
    tblGroup.add(vase, flower);

    const slotIndices: number[] = [];
    const seatPositions: TableVisualHandle['seatPositions'] = [];

    for (const slot of cluster.slots) {
      slotIndices.push(slot.index);
      const seatX = slot.customerPos.x - cluster.tx;
      const seatCenterZ = 0.62;
      seatPositions.push({
        slotIndex: slot.index,
        x: slot.customerPos.x,
        z: slot.customerPos.z,
        seatCenterZ: cluster.tz + seatCenterZ,
      });

      const chairGroup = new THREE.Group();
      chairGroup.userData.propType = 'chair';

      // 4 slim corner legs (y ∈ [0, 0.28])
      for (const [lx, lz] of [
        [-0.15, -0.11],
        [0.15, -0.11],
        [-0.15, 0.11],
        [0.15, 0.11],
      ]) {
        const leg = new THREE.Mesh(chairLegGeo, darkWoodMat);
        leg.position.set(seatX + lx, 0.14, seatCenterZ + lz);
        leg.castShadow = true;
        chairGroup.add(leg);
      }

      // Cushioned seat (y ∈ [0.28, 0.36], seatTopY = 0.36, z ∈ [tz + 0.44, tz + 0.80])
      const seat = new THREE.Mesh(chairSeatGeo, cushionMat);
      seat.position.set(seatX, 0.32, seatCenterZ);
      seat.castShadow = true;
      seat.receiveShadow = true;
      chairGroup.add(seat);

      // Curved backrest at z = +0.84 (y ∈ [0.36, 0.78], z ∈ [tz + 0.80, tz + 0.88])
      const backrest = new THREE.Mesh(chairBackGeo, woodMat);
      backrest.position.set(seatX, 0.57, 0.84);
      backrest.castShadow = true;
      backrest.receiveShadow = true;
      chairGroup.add(backrest);

      chairGroup.traverse((child) => {
        child.userData.propType = 'chair';
      });
      tblGroup.add(chairGroup);
    }

    const unlocked = slotIndices.some((idx) => Boolean(layout.slots[idx]?.unlocked));
    tblGroup.visible = unlocked;
    g.add(tblGroup);

    tables.push({
      group: tblGroup,
      tableIndex: tableIndex++,
      slotIndices,
      center: { x: cluster.tx, z: cluster.tz },
      seatPositions,
      seatTopY: 0.36,
      unlocked,
      popProgress: unlocked ? 1 : 0,
    });
  }

  return g;
}

function buildSpecialVenueProps(
  themeId: string,
  w: number,
  d: number,
  wallH: number,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  animatedProps: EnvironmentAnimatedProp[],
): THREE.Group {
  const g = new THREE.Group();
  const hw = w / 2;
  const hd = d / 2;

  if (themeId === 'event_potion_shop') {
    // Backlit apothecary shelves + colorful glowing flasks
    const shelfMat = mats.std('#4c2a6a', 0.5, 0.1);
    const shelfGeo = getGeo(geos, 'pot_shelf', () => createRoundedBoxGeometry(2.6, 0.08, 0.30, 1, 0.02));
    const flaskGeo = getGeo(geos, 'pot_flask', () => new THREE.SphereGeometry(0.11, 8, 8));
    const flaskColors = ['#facc15', '#38bdf8', '#f472b6', '#4ade80', '#c084fc'];
    for (const sx of [-hw + 2.4, hw - 2.4]) {
      for (const sy of [1.35, 1.85]) {
        const sh = new THREE.Mesh(shelfGeo, shelfMat);
        sh.position.set(sx, sy, -hd + 0.14);
        g.add(sh);
        for (let f = 0; f < 5; f++) {
          const fl = new THREE.Mesh(
            flaskGeo,
            mats.emissiveGlow(flaskColors[(f + Math.round(sy)) % flaskColors.length], 0.95, 0.14),
          );
          fl.position.set(sx - 0.9 + f * 0.45, sy + 0.14, -hd + 0.16);
          g.add(fl);
        }
      }
    }

    // Glowing violet arcane rune floor circle in center aisle (cleanly above carpet top 0.0605)
    const rune = new THREE.Mesh(
      getGeo(geos, 'pot_rune', () => new THREE.RingGeometry(0.68, 0.84, 28)),
      mats.basicMat('#c084fc', 0.82, false),
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(0, 0.068, 2.2);
    rune.raycast = () => {};
    g.add(rune);

    // Floating arcane orbs & glowing giant mushrooms outside perimeter
    const mushStemGeo = getGeo(geos, 'pot_mstem', () => new THREE.CylinderGeometry(0.18, 0.24, 0.85, 10));
    const mushCapGeo = getGeo(geos, 'pot_mcap', () => new THREE.SphereGeometry(0.58, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const orbGeo = getGeo(geos, 'pot_orb', () => new THREE.SphereGeometry(0.24, 10, 8));
    let phase = 0;
    for (const [mx, mz, col] of [
      [-hw - 1.3, -hd + 2.2, '#a855f7'],
      [hw + 1.3, -hd + 2.2, '#2dd4bf'],
      [-hw - 1.3, hd - 2.2, '#2dd4bf'],
      [hw + 1.3, hd - 2.2, '#a855f7'],
    ] as const) {
      const stem = new THREE.Mesh(mushStemGeo, mats.glossy('#f5e6ff', 0.42, 0.04));
      stem.position.set(mx, 0.42, mz);
      const cap = new THREE.Mesh(mushCapGeo, mats.emissiveGlow(col, 0.72, 0.25));
      cap.position.set(mx, 0.82, mz);
      const orb = new THREE.Mesh(orbGeo, mats.emissiveGlow('#e879f9', 1.0, 0.12));
      orb.position.set(mx, 1.95, mz);
      g.add(stem, cap, orb);
      animatedProps.push({ object: orb, kind: 'orb', baseY: 1.95, phase: phase++ * 1.4 });
    }
  } else if (themeId === 'event_crystal_cavern') {
    // Tall glowing faceted crystal clusters flanking exterior
    const spireGeo = getGeo(geos, 'cav_spire', () => new THREE.OctahedronGeometry(0.45, 0));
    const colors = ['#38bdf8', '#c084fc', '#f59e0b'];
    const coords: Array<[number, number]> = [
      [-hw - 1.4, -hd + 1.4],
      [hw + 1.4, -hd + 1.4],
      [-hw - 1.5, 0],
      [hw + 1.5, 0],
      [-hw - 1.4, hd - 1.8],
      [hw + 1.4, hd - 1.8],
    ];
    coords.forEach(([cx, cz], idx) => {
      const cluster = new THREE.Group();
      cluster.position.set(cx, 0, cz);
      const mat = mats.emissiveGlow(colors[idx % colors.length], 0.85, 0.16);
      for (let s = 0; s < 3; s++) {
        const sp = new THREE.Mesh(spireGeo, mat);
        sp.scale.set(0.65 + s * 0.15, 1.9 + s * 0.45, 0.65 + s * 0.15);
        sp.position.set((s - 1) * 0.32, 0.65 + s * 0.15, (s % 2) * 0.22);
        sp.rotation.z = (s - 1) * 0.24;
        cluster.add(sp);
      }
      g.add(cluster);
      animatedProps.push({ object: cluster, kind: 'crystal', baseY: 0, phase: idx * 0.9 });
    });

    // Timber mine arches along back wall (flanking chalkboard & windows cleanly)
    const timberMat = mats.std('#78350f', 0.65, 0.05);
    const postGeo = getGeo(geos, 'cav_post', () => createRoundedBoxGeometry(0.32, wallH + 0.3, 0.32, 1, 0.04));
    for (const px of [-hw + 1.4, -2.0, 2.0, hw - 1.4]) {
      const p = new THREE.Mesh(postGeo, timberMat);
      p.position.set(px, (wallH + 0.3) / 2, -hd + 0.18);
      g.add(p);
    }
    // Gem-filled ore cart at (-hw - 1.7, 0, 2.4)
    const cart = new THREE.Group();
    cart.position.set(-hw - 1.7, 0, 2.4);
    const body = new THREE.Mesh(
      getGeo(geos, 'cav_cart', () => createRoundedBoxGeometry(1.1, 0.72, 1.4, 1, 0.06)),
      mats.metallic('#475569', 0.42, 0.6),
    );
    body.position.y = 0.56;
    const gemHeap = new THREE.Mesh(
      getGeo(geos, 'cav_heap', () => new THREE.DodecahedronGeometry(0.42, 0)),
      mats.emissiveGlow('#38bdf8', 0.9, 0.14),
    );
    gemHeap.position.y = 0.98;
    cart.add(body, gemHeap);
    g.add(cart);
  } else if (themeId === 'event_lunar_outpost') {
    // Lunar craters outside perimeter
    const craterGeo = getGeo(geos, 'lun_crater', () => new THREE.TorusGeometry(1.1, 0.22, 8, 16));
    const craterMat = mats.matte('#64748b');
    for (const [cx, cz] of [[-hw - 2.4, -4], [hw + 2.4, -2], [-hw - 2.3, 5], [hw + 2.4, 6]]) {
      const cr = new THREE.Mesh(craterGeo, craterMat);
      cr.rotation.x = Math.PI / 2;
      cr.position.set(cx, 0.02, cz);
      g.add(cr);
    }
    // Glowing neon cyan/violet trim strips along back wall
    const neonStrip = new THREE.Mesh(
      getGeo(geos, `lun_neon_${w}`, () => createRoundedBoxGeometry(w, 0.10, 0.10, 1, 0.03)),
      mats.emissiveGlow('#22d3ee', 1.0, 0.15),
    );
    neonStrip.position.set(0, wallH - 0.15, -hd + 0.08);
    g.add(neonStrip);

    // Retro rotating satellite dish on back-right
    const dishGroup = new THREE.Group();
    dishGroup.position.set(hw + 1.5, 1.4, -hd + 1.2);
    const dishMast = new THREE.Mesh(
      getGeo(geos, 'lun_mast', () => new THREE.CylinderGeometry(0.12, 0.18, 1.4, 10)),
      mats.metallic('#cbd5e1'),
    );
    dishMast.position.set(hw + 1.5, 0.7, -hd + 1.2);
    const dishBowl = new THREE.Mesh(
      getGeo(geos, 'lun_dish', () => new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42)),
      mats.metallic('#e2e8f0'),
    );
    dishBowl.rotation.x = Math.PI * 0.72;
    const dishTip = new THREE.Mesh(
      getGeo(geos, 'lun_dtip', () => new THREE.SphereGeometry(0.11, 8, 6)),
      mats.emissiveGlow('#38bdf8', 1.0, 0.12),
    );
    dishTip.position.set(0, 0.35, 0.32);
    dishGroup.add(dishBowl, dishTip);
    g.add(dishMast, dishGroup);
    animatedProps.push({ object: dishGroup, kind: 'beacon', baseY: 1.4, phase: 0 });

    // Glowing hydroponic dome planters at corners
    const podGeo = getGeo(geos, 'lun_pod', () => new THREE.SphereGeometry(0.54, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const plantGeo = getGeo(geos, 'lun_plt', () => new THREE.SphereGeometry(0.32, 10, 8));
    for (const [px, pz] of [[-hw - 1.3, -hd + 2], [-hw - 1.3, hd - 2], [hw + 1.3, hd - 2]]) {
      const podBase = new THREE.Mesh(
        getGeo(geos, 'lun_pbase', () => new THREE.CylinderGeometry(0.56, 0.52, 0.34, 12)),
        mats.metallic('#94a3b8'),
      );
      podBase.position.set(px, 0.17, pz);
      const plant = new THREE.Mesh(plantGeo, mats.emissiveGlow('#4ade80', 0.65, 0.25));
      plant.position.set(px, 0.54, pz);
      const dome = new THREE.Mesh(podGeo, mats.glass('#bae6fd', 0.32));
      dome.position.set(px, 0.34, pz);
      dome.renderOrder = 2;
      g.add(podBase, plant, dome);
    }
  } else if (themeId === 'event_tidewater_pier') {
    // 8 chunky timber pier pilings rising out of water w/ white seafoam rings
    const pilingGeo = getGeo(geos, 'pier_pile', () => new THREE.CylinderGeometry(0.26, 0.28, 1.35, 10));
    const foamGeo = getGeo(geos, 'pier_foam', () => new THREE.TorusGeometry(0.34, 0.06, 6, 14));
    const woodMat = mats.std('#78350f', 0.68, 0.04);
    const foamMat = mats.glossy('#f0f9ff', 0.3, 0.05);
    for (const px of [-hw - 0.55, hw + 0.55]) {
      for (const pz of [-hd + 1.5, -2.5, 2.5, hd - 1.5]) {
        const pile = new THREE.Mesh(pilingGeo, woodMat);
        pile.position.set(px, 0.32, pz);
        pile.castShadow = true;
        const foam = new THREE.Mesh(foamGeo, foamMat);
        foam.rotation.x = Math.PI / 2;
        foam.position.set(px, -0.02, pz);
        g.add(pile, foam);
      }
    }

    // Red-and-white lifebuoy rings hung on walls
    const buoyGeo = getGeo(geos, 'pier_buoy', () => new THREE.TorusGeometry(0.32, 0.10, 8, 16));
    for (const bx of [-hw + 2.2, hw - 2.2]) {
      const buoy = new THREE.Mesh(buoyGeo, mats.glossy('#ef4444', 0.28, 0.06));
      buoy.position.set(bx, 1.65, -hd + 0.08);
      g.add(buoy);
    }

    // Miniature red-and-white striped lighthouse at back-right w/ rotating glowing beacon!
    const lh = new THREE.Group();
    lh.position.set(hw + 2.0, 0, -hd + 1.4);
    const lhBase = new THREE.Mesh(
      getGeo(geos, 'pier_lhb', () => new THREE.CylinderGeometry(0.62, 0.82, 2.6, 14)),
      mats.glossy('#ffffff', 0.32, 0.04),
    );
    lhBase.position.y = 1.3;
    const lhStripe = new THREE.Mesh(
      getGeo(geos, 'pier_lhs', () => new THREE.CylinderGeometry(0.69, 0.75, 0.72, 14)),
      mats.glossy('#ef4444', 0.28, 0.06),
    );
    lhStripe.position.y = 1.3;
    const lhRoof = new THREE.Mesh(
      getGeo(geos, 'pier_lhr', () => new THREE.ConeGeometry(0.72, 0.75, 12)),
      mats.glossy('#ef4444', 0.28, 0.08),
    );
    lhRoof.position.y = 3.35;
    const beacon = new THREE.Mesh(
      getGeo(geos, 'pier_lhbcn', () => new THREE.CylinderGeometry(0.42, 0.42, 0.44, 12)),
      mats.emissiveGlow('#fef08a', 1.15, 0.12),
    );
    beacon.position.y = 2.82;
    lh.add(lhBase, lhStripe, lhRoof, beacon);
    g.add(lh);
    animatedProps.push({ object: beacon, kind: 'beacon', baseY: 2.82, phase: 0 });
  } else if (themeId === 'event_citadel_orchard') {
    // Stacked harvest crates & golden hay bales flanking sides
    const crateMat = mats.std('#b45309', 0.62, 0.04);
    const hayMat = mats.glossy('#eab308', 0.55, 0.04);
    const crateGeo = getGeo(geos, 'orch_crate', () => createRoundedBoxGeometry(0.85, 0.68, 0.85, 1, 0.06));
    const hayGeo = getGeo(geos, 'orch_hay', () => new THREE.CylinderGeometry(0.48, 0.48, 0.92, 12));
    for (const s of [-1, 1]) {
      const cr = new THREE.Mesh(crateGeo, crateMat);
      cr.position.set(s * (hw + 1.35), 0.34, -0.8);
      cr.castShadow = true;
      const hay = new THREE.Mesh(hayGeo, hayMat);
      hay.rotation.z = Math.PI / 2;
      hay.position.set(s * (hw + 1.4), 0.48, 0.8);
      hay.castShadow = true;
      g.add(cr, hay);
    }
    // Colorful triangular bunting across front awning
    const flagGeo = getGeo(geos, 'orch_flag', () => new THREE.ConeGeometry(0.20, 0.34, 3));
    const flagCols = ['#ef4444', '#facc15', '#38bdf8', '#4ade80', '#f472b6'];
    for (let i = 0; i < 9; i++) {
      const fx = -hw + 1.0 + (i / 8) * (w - 2.0);
      const fl = new THREE.Mesh(flagGeo, mats.glossy(flagCols[i % flagCols.length], 0.32, 0.05));
      fl.rotation.x = Math.PI;
      fl.position.set(fx, wallH - 0.36, -hd + 1.28);
      g.add(fl);
    }
  } else if (themeId === 'event_citadel_inn') {
    // Tudor oak wall beams (flanking chalkboard & windows cleanly) + oak ale barrels + torches + crest shield
    const oakMat = mats.std('#5c3a21', 0.6, 0.05);
    const beamGeo = getGeo(geos, 'inn_beam', () => createRoundedBoxGeometry(0.22, wallH, 0.14, 1, 0.02));
    for (const bx of [-hw + 1.0, -2.35, 2.35, hw - 1.0]) {
      const bm = new THREE.Mesh(beamGeo, oakMat);
      bm.position.set(bx, wallH / 2, -hd + 0.04);
      g.add(bm);
    }
    const barrelGeo = getGeo(geos, 'inn_bar', () => new THREE.CylinderGeometry(0.42, 0.42, 0.92, 12));
    const hoopGeo = getGeo(geos, 'inn_hoop', () => new THREE.TorusGeometry(0.43, 0.03, 6, 14));
    for (const [bx, bz] of [[-hw - 1.2, hd - 1.4], [hw + 1.2, hd - 1.4], [-hw - 1.2, -hd + 2.2], [hw + 1.2, -hd + 2.2]]) {
      const brl = new THREE.Mesh(barrelGeo, oakMat);
      brl.position.set(bx, 0.46, bz);
      brl.castShadow = true;
      const hoop = new THREE.Mesh(hoopGeo, mats.metallic('#334155'));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(bx, 0.64, bz);
      g.add(brl, hoop);
    }
    // Flickering amber torch sconces (clear of beams & windows)
    const flameGeo = getGeo(geos, 'inn_flame', () => new THREE.ConeGeometry(0.11, 0.28, 8));
    let phase = 0;
    for (const tx of [-3.0, 3.0]) {
      const fl = new THREE.Mesh(flameGeo, mats.emissiveGlow('#fb923c', 1.15, 0.14));
      fl.position.set(tx, 2.05, -hd + 0.22);
      g.add(fl);
      animatedProps.push({ object: fl, kind: 'flame', baseY: 2.05, phase: phase++ * 1.5 });
    }
    // Golden heraldic shield mounted cleanly ABOVE the tilted marquee frame (zero text-plane intersection!)
    const shield = new THREE.Mesh(
      getGeo(geos, 'inn_shield', () => createRoundedBoxGeometry(0.76, 0.86, 0.14, 2, 0.08)),
      mats.metallic('#facc15', 0.22, 0.8),
    );
    shield.position.set(0, wallH + 1.78, -hd - 0.08);
    g.add(shield);
  } else if (themeId === 'event_citadel_keep') {
    // Castle crenellations + crimson royal banners + 2 rounded corner turrets w/ red roofs + braziers
    const stoneMat = mats.glossy('#cbd5e1', 0.46, 0.06);
    const merlonGeo = getGeo(geos, 'keep_merl', () => createRoundedBoxGeometry(0.82, 0.56, 0.48, 1, 0.05));
    for (let x = -hw + 0.6; x <= hw - 0.6; x += 1.6) {
      const m = new THREE.Mesh(merlonGeo, stoneMat);
      m.position.set(x, wallH + 0.24, -hd - 0.20);
      g.add(m);
    }
    const bannerGeo = getGeo(geos, 'keep_ban', () => createRoundedBoxGeometry(0.86, 1.65, 0.08, 1, 0.02));
    for (const bx of [-hw + 2.4, hw - 2.4]) {
      const ban = new THREE.Mesh(bannerGeo, mats.glossy('#dc2626', 0.4, 0.08));
      ban.position.set(bx, 1.65, -hd + 0.05);
      g.add(ban);
    }
    const turretGeo = getGeo(geos, 'keep_tur', () => new THREE.CylinderGeometry(1.05, 1.12, 4.2, 14));
    const roofGeo = getGeo(geos, 'keep_roof', () => new THREE.ConeGeometry(1.32, 1.85, 14));
    for (const s of [-1, 1]) {
      const tur = new THREE.Mesh(turretGeo, stoneMat);
      tur.position.set(s * (hw + 1.4), 2.1, -hd - 0.2);
      tur.castShadow = true;
      const rf = new THREE.Mesh(roofGeo, mats.glossy('#dc2626', 0.34, 0.08));
      rf.position.set(s * (hw + 1.4), 5.05, -hd - 0.2);
      g.add(tur, rf);
    }
    // Flaming golden braziers
    const bowlGeo = getGeo(geos, 'keep_braz', () => new THREE.CylinderGeometry(0.38, 0.22, 0.65, 12));
    const flameGeo = getGeo(geos, 'keep_flm', () => new THREE.ConeGeometry(0.22, 0.48, 8));
    let ph = 0;
    for (const s of [-1, 1]) {
      const br = new THREE.Mesh(bowlGeo, mats.metallic('#eab308'));
      br.position.set(s * (hw + 1.25), 0.32, hd - 1.5);
      const fl = new THREE.Mesh(flameGeo, mats.emissiveGlow('#fb923c', 1.15, 0.14));
      fl.position.set(s * (hw + 1.25), 0.84, hd - 1.5);
      g.add(br, fl);
      animatedProps.push({ object: fl, kind: 'flame', baseY: 0.84, phase: ph++ * 1.7 });
    }
  } else if (themeId === 'adventure_olympus') {
    // Doric marble columns + triangular pediment + Olympic braziers + bobbing clouds!
    const marbleMat = mats.glossy('#fffdf7', 0.26, 0.06);
    const goldMat = mats.metallic('#facc15', 0.2, 0.82);
    const colGeo = getGeo(geos, 'oly_col', () => new THREE.CylinderGeometry(0.30, 0.34, 3.2, 14));
    const capGeo = getGeo(geos, 'oly_cap', () => createRoundedBoxGeometry(0.84, 0.24, 0.84, 1, 0.04));
    for (const [cx, cz] of [[-hw - 0.4, -hd + 0.4], [hw + 0.4, -hd + 0.4], [-hw - 0.4, hd - 0.8], [hw + 0.4, hd - 0.8]]) {
      const col = new THREE.Mesh(colGeo, marbleMat);
      col.position.set(cx, 1.6, cz);
      col.castShadow = true;
      const cap = new THREE.Mesh(capGeo, goldMat);
      cap.position.set(cx, 3.24, cz);
      g.add(col, cap);
    }
    // Symmetrical classical Greek triangular marble pediment crowning the back wall
    const pedGeo = getGeo(geos, 'oly_ped_gable', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-4.4, 0);
      shape.lineTo(4.4, 0);
      shape.lineTo(0, 1.25);
      shape.closePath();
      const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: false });
      eg.translate(0, 0, -0.19);
      return eg;
    });
    const ped = new THREE.Mesh(pedGeo, marbleMat);
    ped.position.set(0, wallH + 0.05, -hd - 0.24);
    const frieze = new THREE.Mesh(
      getGeo(geos, 'oly_frieze', () => createRoundedBoxGeometry(9.2, 0.18, 0.48, 1, 0.04)),
      goldMat,
    );
    frieze.position.set(0, wallH + 0.04, -hd - 0.24);
    g.add(ped, frieze);

    // Bobbing fluffy Mount Olympus clouds outside perimeter
    const cloudMat = mats.glossy('#ffffff', 0.38, 0.02);
    const cGeo = getGeo(geos, 'oly_cld', () => new THREE.SphereGeometry(0.72, 10, 8));
    const cCoords: Array<[number, number, number]> = [
      [-hw - 2.3, 0.7, -4.5],
      [hw + 2.3, 0.9, -3.0],
      [-hw - 2.4, 0.6, 3.5],
      [hw + 2.4, 0.8, 4.2],
    ];
    cCoords.forEach(([cx, cy, cz], idx) => {
      const cloud = new THREE.Group();
      cloud.position.set(cx, cy, cz);
      for (const [ox, oy, oz, sc] of [[0, 0, 0, 1.0], [-0.55, -0.1, 0.1, 0.78], [0.55, -0.1, -0.1, 0.82]]) {
        const puff = new THREE.Mesh(cGeo, cloudMat);
        puff.scale.setScalar(sc);
        puff.position.set(ox, oy, oz);
        cloud.add(puff);
      }
      g.add(cloud);
      animatedProps.push({ object: cloud, kind: 'cloud', baseY: cy, phase: idx * 1.4 });
    });
  } else if (themeId === 'adventure_corsair') {
    // Twin ship helm wheels flanking center chalkboard (clear of both chalkboard and side windows!)
    const woodMat = mats.std('#78350f', 0.56, 0.05);
    const goldMat = mats.metallic('#facc15', 0.18, 0.85);
    const wheelRingGeo = getGeo(geos, 'cor_whl', () => new THREE.TorusGeometry(0.52, 0.065, 8, 16));
    const spokeGeo = getGeo(geos, 'cor_whl_spk', () => new THREE.CylinderGeometry(0.025, 0.025, 1.18, 6));
    const hubGeo = getGeo(geos, 'cor_whl_hub', () => new THREE.CylinderGeometry(0.11, 0.11, 0.12, 10));
    for (const wx of [-2.55, 2.55]) {
      const wheel = new THREE.Group();
      wheel.position.set(wx, 1.72, -hd + 0.08);
      const wheelRing = new THREE.Mesh(wheelRingGeo, woodMat);
      const hub = new THREE.Mesh(hubGeo, goldMat);
      hub.rotation.x = Math.PI / 2;
      wheel.add(wheelRing, hub);
      for (let s = 0; s < 4; s++) {
        const sp = new THREE.Mesh(spokeGeo, woodMat);
        sp.rotation.z = (s * Math.PI) / 4;
        wheel.add(sp);
      }
      g.add(wheel);
    }

    // Overflowing treasure chest at (+hw + 1.4, 0, +hd - 1.8)
    const chest = new THREE.Group();
    chest.position.set(hw + 1.45, 0, hd - 1.8);
    const cBox = new THREE.Mesh(
      getGeo(geos, 'cor_cbox', () => createRoundedBoxGeometry(1.1, 0.65, 0.78, 1, 0.06)),
      woodMat,
    );
    cBox.position.y = 0.34;
    const goldHeap = new THREE.Mesh(
      getGeo(geos, 'cor_gold', () => new THREE.SphereGeometry(0.42, 10, 8)),
      goldMat,
    );
    goldHeap.scale.set(1.1, 0.62, 0.85);
    goldHeap.position.y = 0.68;
    const cLid = new THREE.Mesh(
      getGeo(geos, 'cor_clid', () => createRoundedBoxGeometry(1.12, 0.24, 0.78, 1, 0.08)),
      woodMat,
    );
    cLid.position.set(0, 0.88, -0.35);
    cLid.rotation.x = -0.85;
    chest.add(cBox, goldHeap, cLid);
    g.add(chest);

    // Curved tropical palm trees at rear corners
    const trunkGeo = getGeo(geos, 'cor_ptk', () => new THREE.CylinderGeometry(0.14, 0.22, 2.4, 10));
    const frondGeo = getGeo(geos, 'cor_frnd', () => createRoundedBoxGeometry(0.32, 0.08, 1.25, 1, 0.03));
    const frondMat = mats.glossy('#22c55e', 0.42, 0.04);
    for (const s of [-1, 1]) {
      const palm = new THREE.Group();
      palm.position.set(s * (hw + 1.45), 0, -hd + 1.5);
      const tk = new THREE.Mesh(trunkGeo, woodMat);
      tk.position.y = 1.2;
      tk.rotation.z = s * -0.15;
      palm.add(tk);
      for (let f = 0; f < 5; f++) {
        const a = (f / 5) * Math.PI * 2;
        const fr = new THREE.Mesh(frondGeo, frondMat);
        fr.position.set(s * 0.2 + Math.sin(a) * 0.55, 2.35, Math.cos(a) * 0.55);
        fr.rotation.y = a;
        fr.rotation.x = 0.32;
        palm.add(fr);
      }
      g.add(palm);
    }

    // Mini brass deck cannons flanking front left
    const canGeo = getGeo(geos, 'cor_can', () => new THREE.CylinderGeometry(0.16, 0.24, 0.95, 12));
    const cannon = new THREE.Mesh(canGeo, mats.metallic('#334155', 0.32, 0.72));
    cannon.rotation.z = Math.PI / 2 - 0.15;
    cannon.position.set(-hw - 1.4, 0.52, hd - 2.0);
    g.add(cannon);
  }

  return g;
}

/**
 * Checks `layout.slots` for newly unlocked tables and returns any table handles that just transitioned
 * from hidden (`false`) to visible (`true`).
 */
export function syncDynamicTables(
  envRig: EnvironmentVisualRig,
  layout: RestaurantLayout,
): TableVisualHandle[] {
  const newlyUnlocked: TableVisualHandle[] = [];
  for (const tbl of envRig.tables) {
    const shouldBeUnlocked = tbl.slotIndices.some((idx) => Boolean(layout.slots[idx]?.unlocked));
    if (shouldBeUnlocked && !tbl.unlocked) {
      tbl.unlocked = true;
      tbl.group.visible = true;
      tbl.popProgress = 0.001;
      newlyUnlocked.push(tbl);
    } else if (!shouldBeUnlocked && tbl.unlocked) {
      tbl.unlocked = false;
      tbl.group.visible = false;
      tbl.popProgress = 0;
    }
  }
  return newlyUnlocked;
}

/**
 * Builds the complete glossy rounded 3D diorama environment for any of the 47 restaurant templates
 * across all 6 archetypes and all 9 special event/adventure themes.
 */
export function buildEnvironmentRig(
  template: RestaurantTemplate,
  layout: RestaurantLayout,
  cityGroundColor: string,
  mats: MaterialPool,
  geos?: GeometryPool,
  textures?: TextureFactory,
  citySkyColor = '#7ec8e3',
): EnvironmentVisualRig {
  const root = new THREE.Group();
  root.name = `env_${template.id}`;

  const theme = getVenueEnvironmentTheme(template.id, {
    skyColor: citySkyColor,
    groundColor: cityGroundColor,
    accentColor: template.themeAccentColor,
  });

  const w = layout.width;
  const d = layout.depth;
  const wallH = 3.05;
  const tables: TableVisualHandle[] = [];
  const passDishSlots: PassDishSlotHandle[] = [];
  const animatedProps: EnvironmentAnimatedProp[] = [];
  const shadowTex = textures?.createContactShadowDisc() ?? null;

  // 1. Outer Ground Surround (fresh rich meadow/earth or shimmering turquoise water!)
  let resolvedGroundHex = theme.groundColor;
  if (theme.themeId === 'default' && !theme.isWaterGround) {
    const gc = new THREE.Color(theme.groundColor);
    gc.offsetHSL(0, 0.28, -0.10);
    resolvedGroundHex = `#${gc.getHexString()}`;
  }
  const surroundMat = theme.isWaterGround
    ? mats.glossy(resolvedGroundHex, 0.18, 0.22)
    : mats.matte(resolvedGroundHex, 0.85, 0.02);
  const surround = new THREE.Mesh(
    getGeo(geos, `env_surr_${w}_${d}`, () => new THREE.PlaneGeometry(w + 40, d + 46)),
    surroundMat,
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.08;
  surround.receiveShadow = true;
  root.add(surround);

  if (template.archetype === 'food_truck') {
    // =========================================================================
    // ARCHETYPE 2: OPEN-AIR CUTAWAY FOOD TRUCK (ZERO WALL/WORKER CLIPPING!)
    // =========================================================================
    const plaza = new THREE.Mesh(
      getGeo(geos, `trk_plaza_${w}_${d}`, () => createRoundedBoxGeometry(w + 2.6, 0.12, d + 1.6, 2, 0.12)),
      mats.glossy('#e7dfd2', 0.62, 0.04),
    );
    plaza.position.set(0, -0.02, 0);
    plaza.receiveShadow = true;
    root.add(plaza);

    // Kitchen interior checker floor centered inside truck footprint (x ∈ [-5.30, +5.30])
    const floorTex = textures?.createCheckerboardTiles(template.themeFloorColor, 5, 3) ?? null;
    const truckFloorMat = mats.textured(`trk_flr_${template.id}`, floorTex, {
      color: floorTex ? '#ffffff' : template.themeFloorColor,
      roughness: 0.36,
      sceneScoped: true,
    });
    const truckFloor = new THREE.Mesh(
      getGeo(geos, 'trk_in_flr', () => createRoundedBoxGeometry(10.6, 0.08, 6.5, 1, 0.04)),
      truckFloorMat,
    );
    truckFloor.position.set(0, 0.05, -2.15);
    truckFloor.receiveShadow = true;
    root.add(truckFloor);

    const hullMat = mats.glossy(template.themeRoofColor, 0.26, 0.14);
    const stripeMat = mats.glossy(template.themeAccentColor, 0.24, 0.14);
    const chromeMat = mats.metallic('#e2e8f0', 0.18, 0.82);

    // Rear Truck Wall centered at x = 0 (x ∈ [-5.30, +5.30], z = -5.45, clear of back workSpots!)
    const rearWall = new THREE.Mesh(
      getGeo(geos, 'trk_rear', () => createRoundedBoxGeometry(10.6, 2.75, 0.44, 2, 0.16)),
      hullMat,
    );
    rearWall.position.set(0, 1.45, -5.45);
    rearWall.castShadow = true;
    rearWall.receiveShadow = true;
    const rearStripe = new THREE.Mesh(
      getGeo(geos, 'trk_rstripe', () => createRoundedBoxGeometry(10.66, 0.30, 0.48, 1, 0.04)),
      stripeMat,
    );
    rearStripe.position.set(0, 1.15, -5.45);
    root.add(rearWall, rearStripe);

    // Cutaway Left Rear End Panel & Side Skirt (x ∈ [-5.66, -5.30], clear of slot[0] chef & flush with hull!)
    const leftCheek = new THREE.Mesh(
      getGeo(geos, 'trk_lchk', () => createRoundedBoxGeometry(0.36, 2.4, 2.5, 2, 0.10)),
      hullMat,
    );
    leftCheek.position.set(-5.48, 1.28, -4.20);
    leftCheek.castShadow = true;
    const leftSkirt = new THREE.Mesh(
      getGeo(geos, 'trk_lskt', () => createRoundedBoxGeometry(0.36, 0.96, 6.70, 2, 0.10)),
      hullMat,
    );
    leftSkirt.position.set(-5.48, 0.48, -2.10);
    leftSkirt.castShadow = true;
    // Right hull-to-cab seam bridge (x ∈ [+5.30, +5.66], flush between rearWall, frontHull & cab!)
    const rightSkirt = new THREE.Mesh(
      getGeo(geos, 'trk_rskt', () => createRoundedBoxGeometry(0.36, 0.96, 6.70, 2, 0.10)),
      hullMat,
    );
    rightSkirt.position.set(5.48, 0.48, -2.10);
    rightSkirt.castShadow = true;
    root.add(leftCheek, leftSkirt, rightSkirt);

    // Front Serving Hull centered at x = 0 (x ∈ [-5.30, +5.30], z ∈ [+0.87, +1.41], clear of cashier 0.60 & customers 2.05!)
    const frontHull = new THREE.Mesh(
      getGeo(geos, 'trk_fhull', () => createRoundedBoxGeometry(10.6, 0.71, 0.54, 2, 0.12)),
      hullMat,
    );
    frontHull.position.set(0, 0.355, 1.14);
    frontHull.castShadow = true;
    frontHull.receiveShadow = true;
    const frontStripe = new THREE.Mesh(
      getGeo(geos, 'trk_fstripe', () => createRoundedBoxGeometry(10.64, 0.18, 0.58, 1, 0.03)),
      stripeMat,
    );
    frontStripe.position.set(0, 0.44, 1.14);

    // Fold-out stainless serving shelf (x ∈ [-5.25, +5.25] supports all 9 tips; top y = 0.79 flush beneath tips; z ∈ [+0.87, +1.53]!)
    const shelf = new THREE.Mesh(
      getGeo(geos, 'trk_shelf', () => createRoundedBoxGeometry(10.5, 0.08, 0.66, 2, 0.035)),
      chromeMat,
    );
    shelf.position.set(0, 0.75, 1.20);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    root.add(frontHull, frontStripe, shelf);

    // Scalloped Truck Awning + Marquee Sign + Fairy Lights + Giant 3D Roof Mascot!
    root.add(buildScallopedAwning(10.4, 2.86, -5.25, template.themeRoofColor, mats, geos));
    root.add(buildMarqueeSignboard(template, 10.4, 3.45, -5.35, mats, geos, textures));
    root.add(buildFairyStringLights(10.0, 2.86, -4.08, mats, geos, animatedProps));

    const mascot = buildFoodTruckRoofMascot(
      template.stations[0]?.modelStyle ?? 'grill',
      template.themeAccentColor,
      mats,
      geos,
    );
    mascot.position.set(-4.1, 3.05, -5.35);
    root.add(mascot);

    // Chunky Rounded Right-Side Truck Cab (x ∈ [+5.30, +7.15], flush seam & clear of slot[8] chef xMax=5.23!)
    const cab = new THREE.Mesh(
      getGeo(geos, 'trk_cab', () => createRoundedBoxGeometry(1.85, 2.15, 4.90, 2, 0.22)),
      hullMat,
    );
    cab.position.set(6.225, 1.15, -1.60);
    cab.castShadow = true;
    cab.receiveShadow = true;

    const hood = new THREE.Mesh(
      getGeo(geos, 'trk_hood', () => createRoundedBoxGeometry(0.72, 1.10, 3.70, 2, 0.18)),
      hullMat,
    );
    hood.position.set(7.35, 0.78, -1.60);
    hood.castShadow = true;

    const windshield = new THREE.Mesh(
      getGeo(geos, 'trk_wsh', () => createRoundedBoxGeometry(0.14, 0.90, 3.50, 1, 0.04)),
      mats.glass('#93c5fd', 0.42),
    );
    windshield.position.set(7.15, 1.62, -1.60);
    windshield.castShadow = false;
    windshield.receiveShadow = false;
    windshield.renderOrder = 2;

    const bumper = new THREE.Mesh(
      getGeo(geos, 'trk_bump', () => createRoundedBoxGeometry(0.24, 0.26, 4.00, 1, 0.07)),
      chromeMat,
    );
    bumper.position.set(7.76, 0.38, -1.60);

    // Glowing round headlights framed cleanly inside 390px viewport
    const hlGeo = getGeo(geos, 'trk_hl', () => new THREE.SphereGeometry(0.20, 10, 8));
    const hlMat = mats.emissiveGlow('#fef9c3', 1.1, 0.14);
    for (const hz of [-2.85, -0.35]) {
      const hl = new THREE.Mesh(hlGeo, hlMat);
      hl.scale.set(0.45, 1, 1);
      hl.position.set(7.72, 0.84, hz);
      root.add(hl);
    }
    root.add(cab, hood, windshield, bumper);

    // 4 Firmly Attached Rubber Wheels w/ Chrome Hubcaps & Fender Arches (ZERO floating wheels!)
    const tireGeo = getGeo(geos, 'trk_tire', () => new THREE.CylinderGeometry(0.46, 0.46, 0.34, 16));
    const hubGeo = getGeo(geos, 'trk_hub', () => new THREE.CylinderGeometry(0.24, 0.24, 0.38, 14));
    const fenderGeo = getGeo(geos, 'trk_fend', () => new THREE.TorusGeometry(0.50, 0.06, 6, 14, Math.PI));
    const tireMat = mats.std('#1e293b', 0.72, 0.05);
    for (const [wx, wz] of [[-3.5, 1.36], [3.5, 1.36], [-3.5, -5.58], [3.5, -5.58]]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(wx, 0.46, wz);
      tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, chromeMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, 0.46, wz);
      root.add(tire, hub);
      if (wz > 0) {
        const fender = new THREE.Mesh(fenderGeo, stripeMat);
        fender.position.set(wx, 0.46, 1.41);
        root.add(fender);
      }
    }

    // Outdoor Chalkboard A-Frame Menu on left plaza (clear of entrancePos & slots!)
    const menuTex =
      textures?.createChalkboardMenu(template.name, template.stations, template.themeAccentColor) ??
      null;
    const menuBoard = new THREE.Mesh(
      getGeo(geos, 'trk_menu', () => createRoundedBoxGeometry(1.1, 1.15, 0.12, 1, 0.03)),
      mats.textured(`trk_menu_${template.id}`, menuTex, {
        color: menuTex ? '#ffffff' : '#24323f',
        roughness: 0.48,
        sceneScoped: true,
      }),
    );
    menuBoard.position.set(-6.05, 0.60, 2.3);
    menuBoard.rotation.y = 0.45;
    menuBoard.castShadow = true;
    root.add(menuBoard);

    // Corner street planters framing the food truck plaza
    root.add(buildPlumpPlanterTree(-w / 2 - 1.2, 4.2, mats, geos, shadowTex));
    root.add(buildPlumpPlanterTree(w / 2 + 1.8, 4.2, mats, geos, shadowTex));
  } else {
    // =========================================================================
    // SHARED ROUNDED DIORAMA SHELL (counter_stand, cafe, waiter, grand, drive_thru)
    // =========================================================================
    const curbColor = theme.floorStyle === 'pier' ? '#7c5332' : '#64748b';
    const curb = new THREE.Mesh(
      getGeo(geos, `env_curb_${w}_${d}`, () => createRoundedBoxGeometry(w + 0.72, 0.22, d + 0.72, 2, 0.14)),
      mats.glossy(curbColor, 0.52, 0.06),
    );
    curb.position.set(0, -0.07, 0);
    curb.receiveShadow = true;
    root.add(curb);

    // Floor Zone Contrast (Kitchen Checkerboard vs Dining Warm Wood/Stone) — ZERO leaked tileMat!
    const splitZ =
      template.archetype === 'waiter_dining' || template.archetype === 'grand_hall'
        ? (layout.passCounterPos?.z ?? -0.8)
        : template.archetype === 'cafe_tables'
          ? -0.35
          : null;

    if (splitZ !== null) {
      const kitchenD = splitZ - -d / 2;
      const diningD = d / 2 - splitZ;

      const kTex =
        textures?.createCheckerboardTiles(
          template.themeFloorColor,
          Math.max(2, Math.round(w / 2.2)),
          Math.max(2, Math.round(kitchenD / 2.2)),
        ) ?? null;
      const kFloor = new THREE.Mesh(
        getGeo(geos, `flr_k_${w}_${Math.round(kitchenD * 10)}`, () => createRoundedBoxGeometry(w, 0.08, kitchenD, 1, 0.03)),
        mats.textured(`flr_k_${template.id}`, kTex, {
          color: kTex ? '#ffffff' : template.themeFloorColor,
          roughness: 0.36,
          envMapIntensity: 0.7,
          sceneScoped: true,
        }),
      );
      kFloor.position.set(0, 0.0, (-d / 2 + splitZ) / 2);
      kFloor.receiveShadow = true;

      const diningBaseHex =
        theme.floorStyle === 'stone' || theme.floorStyle === 'metal'
          ? template.themeFloorColor
          : '#d6a56e';
      const dTex =
        theme.floorStyle === 'stone' || theme.floorStyle === 'metal'
          ? textures?.createCheckerboardTiles(
              diningBaseHex,
              Math.max(2, Math.round(w / 2.6)),
              Math.max(2, Math.round(diningD / 2.6)),
            ) ?? null
          : textures?.createWoodPlanks(
              diningBaseHex,
              Math.max(3, Math.round(w / 2.6)),
              Math.max(2, Math.round(diningD / 2.6)),
            ) ?? null;
      const dFloor = new THREE.Mesh(
        getGeo(geos, `flr_d_${w}_${Math.round(diningD * 10)}`, () => createRoundedBoxGeometry(w, 0.08, diningD, 1, 0.03)),
        mats.textured(`flr_d_${template.id}`, dTex, {
          color: dTex ? '#ffffff' : diningBaseHex,
          roughness: 0.46,
          envMapIntensity: 0.65,
          sceneScoped: true,
        }),
      );
      dFloor.position.set(0, 0.0, (splitZ + d / 2) / 2);
      dFloor.receiveShadow = true;

      const divider = new THREE.Mesh(
        getGeo(geos, `flr_div_${w}`, () => createRoundedBoxGeometry(w - 0.1, 0.03, 0.14, 1, 0.015)),
        mats.metallic('#e5b94c', 0.24, 0.76),
      );
      divider.position.set(0, 0.048, splitZ);
      root.add(kFloor, dFloor, divider);
    } else {
      const fTex =
        theme.floorStyle === 'pier' || theme.floorStyle === 'wood'
          ? textures?.createWoodPlanks(
              template.themeFloorColor,
              Math.max(3, Math.round(w / 2.4)),
              Math.max(3, Math.round(d / 2.4)),
            ) ?? null
          : textures?.createCheckerboardTiles(
              template.themeFloorColor,
              Math.max(2, Math.round(w / 2.2)),
              Math.max(2, Math.round(d / 2.2)),
            ) ?? null;
      const floor = new THREE.Mesh(
        getGeo(geos, `flr_all_${w}_${d}`, () => createRoundedBoxGeometry(w, 0.08, d, 1, 0.04)),
        mats.textured(`flr_all_${template.id}`, fTex, {
          color: fTex ? '#ffffff' : template.themeFloorColor,
          roughness: 0.38,
          envMapIntensity: 0.7,
          sceneScoped: true,
        }),
      );
      floor.position.set(0, 0.0, 0);
      floor.receiveShadow = true;
      root.add(floor);
    }

    // Rounded Back Wall, Lower Wainscoting & Side Half-Walls
    const wallMat = mats.glossy(template.themeWallColor, 0.44, 0.04);
    const wainscotMat = mats.glossy(template.themeAccentColor, 0.46, 0.05);
    const trimWoodMat = mats.glossy('#b07543', 0.36, 0.05);

    const backWall = new THREE.Mesh(
      getGeo(geos, `bw_${w}`, () => createRoundedBoxGeometry(w + 0.44, wallH, 0.42, 2, 0.10)),
      wallMat,
    );
    backWall.position.set(0, wallH / 2, -d / 2 - 0.20);
    backWall.castShadow = true;
    backWall.receiveShadow = true;

    const wainscot = new THREE.Mesh(
      getGeo(geos, `bw_ws_${w}`, () => createRoundedBoxGeometry(w + 0.48, 0.88, 0.46, 1, 0.05)),
      wainscotMat,
    );
    wainscot.position.set(0, 0.44, -d / 2 - 0.20);
    wainscot.receiveShadow = true;

    // Side Half-Walls: on drive_thru terminate at the service window line so BOTH car lanes stay 100% open!
    const isDriveThru = template.archetype === 'drive_thru';
    const dtWinZ = d / 2 - 2.5 - 3.95;
    const sideBackZ = -d / 2 - 0.12;
    const sideFrontZ = isDriveThru ? dtWinZ : d / 2 + 0.12;
    const sideDepth = Math.max(2.0, sideFrontZ - sideBackZ);
    const sideCenterZ = (sideBackZ + sideFrontZ) / 2;
    const sideKey = isDriveThru ? `sw_dt_${Math.round(sideDepth * 10)}` : `sw_${d}`;

    const sideWallGeo = getGeo(geos, sideKey, () => createRoundedBoxGeometry(0.36, 1.32, sideDepth, 2, 0.08));
    const sideCapGeo = getGeo(geos, `${sideKey}_cap`, () => createRoundedBoxGeometry(0.44, 0.10, sideDepth + 0.04, 1, 0.04));
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(sideWallGeo, wallMat);
      sw.position.set(s * (w / 2 + 0.18), 0.66, sideCenterZ);
      sw.castShadow = true;
      sw.receiveShadow = true;
      const cap = new THREE.Mesh(sideCapGeo, trimWoodMat);
      cap.position.set(s * (w / 2 + 0.18), 1.34, sideCenterZ);
      root.add(sw, cap);
    }
    root.add(backWall, wainscot);

    // Framed Sunny Windows with Flower Boxes on Back Wall (skipped where special venues mount themed wall props!)
    const skipBackWallWindows =
      theme.themeId === 'event_potion_shop' ||
      theme.themeId === 'event_citadel_keep' ||
      theme.themeId === 'event_tidewater_pier';
    if (!skipBackWallWindows) {
      const winPositions = w >= 14 ? [-w * 0.33, w * 0.33] : [-w * 0.32, w * 0.32];
      const winFrameGeo = getGeo(geos, 'env_wfrm', () => createRoundedBoxGeometry(1.48, 1.04, 0.10, 1, 0.04));
      const winPaneGeo = getGeo(geos, 'env_wpn', () => new THREE.PlaneGeometry(1.26, 0.84));
      const winSillGeo = getGeo(geos, 'env_wsil', () => createRoundedBoxGeometry(1.62, 0.10, 0.26, 1, 0.03));
      const winGlassMat = mats.emissiveGlow(theme.isNightVenue ? '#312e81' : '#bae6fd', 0.42, 0.14);
      const blossomGeo = getGeo(geos, 'env_blos', () => new THREE.SphereGeometry(0.11, 8, 6));

      for (const wx of winPositions) {
        const frm = new THREE.Mesh(winFrameGeo, mats.glossy('#fffbf0', 0.34, 0.04));
        frm.position.set(wx, 1.65, -d / 2 + 0.03);
        const pane = new THREE.Mesh(winPaneGeo, winGlassMat);
        pane.position.set(wx, 1.65, -d / 2 + 0.09);
        const sill = new THREE.Mesh(winSillGeo, trimWoodMat);
        sill.position.set(wx, 1.12, -d / 2 + 0.10);
        const bush = new THREE.Mesh(
          getGeo(geos, 'env_wbush', () => createRoundedBoxGeometry(1.1, 0.18, 0.18, 1, 0.06)),
          mats.glossy('#22c55e', 0.45, 0.03),
        );
        bush.position.set(wx, 1.24, -d / 2 + 0.12);
        const fl1 = new THREE.Mesh(blossomGeo, mats.glossy('#fb7185', 0.3, 0.05));
        fl1.position.set(wx - 0.28, 1.32, -d / 2 + 0.16);
        const fl2 = new THREE.Mesh(blossomGeo, mats.glossy('#fde047', 0.3, 0.05));
        fl2.position.set(wx + 0.28, 1.32, -d / 2 + 0.16);
        root.add(frm, pane, sill, bush, fl1, fl2);
      }
    }

    // Center Illustrated Chalkboard Menu on Back Wall
    const menuTex =
      textures?.createChalkboardMenu(template.name, template.stations, template.themeAccentColor) ??
      null;
    const menuBoard = new THREE.Mesh(
      getGeo(geos, 'env_menu_brd', () => createRoundedBoxGeometry(2.25, 1.10, 0.09, 1, 0.035)),
      mats.textured(`menu_brd_${template.id}`, menuTex, {
        color: menuTex ? '#ffffff' : '#24323f',
        roughness: 0.48,
        sceneScoped: true,
      }),
    );
    menuBoard.position.set(0, 1.72, -d / 2 + 0.05);
    root.add(menuBoard);

    // Floating Kitchen Spice Shelves & Colorful Ceramic Jars flanking chalkboard (default/city venues)
    if (!skipBackWallWindows && theme.themeId === 'default' && w >= 10) {
      const shelfGeo = getGeo(geos, 'env_kshelf', () => createRoundedBoxGeometry(1.18, 0.08, 0.24, 1, 0.025));
      const jarGeo = getGeo(geos, 'env_kjar', () => new THREE.CylinderGeometry(0.075, 0.08, 0.22, 10));
      const lidGeo = getGeo(geos, 'env_klid', () => new THREE.CylinderGeometry(0.082, 0.082, 0.04, 10));
      const plateGeo = getGeo(geos, 'env_kplt', () => new THREE.CylinderGeometry(0.14, 0.12, 0.04, 12));
      const jarColors = ['#f97316', '#22c55e', '#facc15', '#ec4899'];
      const shelfXs = w >= 14 ? [-2.45, 2.45] : [-1.85, 1.85];
      shelfXs.forEach((sx, si) => {
        const sh = new THREE.Mesh(shelfGeo, trimWoodMat);
        sh.position.set(sx, 1.48, -d / 2 + 0.14);
        sh.castShadow = true;
        root.add(sh);
        for (let j = 0; j < 2; j++) {
          const jx = sx - 0.30 + j * 0.28;
          const jar = new THREE.Mesh(jarGeo, mats.glossy(jarColors[(si * 2 + j) % jarColors.length], 0.25, 0.08));
          jar.position.set(jx, 1.63, -d / 2 + 0.14);
          const lid = new THREE.Mesh(lidGeo, mats.metallic('#eab308', 0.22, 0.78));
          lid.position.set(jx, 1.75, -d / 2 + 0.14);
          root.add(jar, lid);
        }
        // Stacked crisp white ceramic plates on outer half of shelf
        for (let p = 0; p < 3; p++) {
          const pl = new THREE.Mesh(plateGeo, mats.glossy('#fffbf0', 0.22, 0.06));
          pl.position.set(sx + 0.34, 1.54 + p * 0.042, -d / 2 + 0.14);
          root.add(pl);
        }
      });
    }

    // Warm Interior Baseboard Trim along Back Wall for crisp floor-wall grounding
    const baseboard = new THREE.Mesh(
      getGeo(geos, `env_bbrd_${w}`, () => createRoundedBoxGeometry(w, 0.14, 0.08, 1, 0.02)),
      trimWoodMat,
    );
    baseboard.position.set(0, 0.10, -d / 2 + 0.03);
    root.add(baseboard);

    // Scalloped Striped Awning + Marquee Sign + Connected Fairy String Lights
    root.add(buildScallopedAwning(w, wallH, -d / 2, template.themeRoofColor, mats, geos));
    root.add(buildMarqueeSignboard(template, w, wallH + 0.56, -d / 2 + 0.05, mats, geos, textures));
    root.add(buildFairyStringLights(w, wallH - 0.04, -d / 2 + 0.78, mats, geos, animatedProps));

    // Corner Planter Trees (for city & orchard venues; on drive_thru keep all foliage safely behind winZ!)
    const useDefaultTrees =
      theme.themeId === 'default' || theme.themeId === 'event_citadel_orchard';
    if (useDefaultTrees) {
      const withApples = theme.themeId === 'event_citadel_orchard';
      const treeCoords: Array<[number, number]> = isDriveThru
        ? [
            [-w / 2 - 1.15, -d / 2 + 1.2],
            [w / 2 + 1.15, -d / 2 + 1.2],
          ]
        : [
            [-w / 2 - 1.15, -d / 2 + 1.2],
            [w / 2 + 1.15, -d / 2 + 1.2],
            [-w / 2 - 1.15, d / 2 - 1.1],
            [w / 2 + 1.15, d / 2 - 1.1],
          ];
      for (const [tx, tz] of treeCoords) {
        root.add(buildPlumpPlanterTree(tx, tz, mats, geos, shadowTex, withApples));
      }
      // Side hedges with colorful blossoms (shifted behind winZ on drive_thru so zero planters/hedges touch the road curb)
      const hedgeGeo = getGeo(geos, 'env_hedge', () => createRoundedBoxGeometry(0.75, 0.68, 2.2, 2, 0.28));
      const hedgeMat = mats.glossy('#22c55e', 0.44, 0.03);
      const hedgeBlosGeo = getGeo(geos, 'env_hblos', () => new THREE.SphereGeometry(0.11, 8, 6));
      const hedgeZ = isDriveThru ? sideCenterZ : 0;
      for (const s of [-1, 1]) {
        const hdg = new THREE.Mesh(hedgeGeo, hedgeMat);
        hdg.position.set(s * (w / 2 + 1.15), 0.34, hedgeZ);
        hdg.castShadow = true;
        root.add(hdg);
        for (let b = 0; b < 3; b++) {
          const fl = new THREE.Mesh(
            hedgeBlosGeo,
            mats.glossy(b % 2 === 0 ? '#fb7185' : '#fde047', 0.3, 0.05),
          );
          fl.position.set(s * (w / 2 + 1.10), 0.66, hedgeZ - 0.65 + b * 0.65);
          root.add(fl);
        }
      }
    }

    // Front Sidewalk / Threshold Apron + Daytime City Street, Crosswalk, Bench, A-Frame Sign & Flower Boxes
    if (template.archetype !== 'drive_thru') {
      const isSunnyCityStreet =
        !theme.isWaterGround &&
        !theme.isNightVenue &&
        theme.themeId !== 'adventure_olympus';

      // Woven Striped Welcome Mat with Gold Border at Doorway (all non-drive-thru venues)
      const matBorder = new THREE.Mesh(
        getGeo(geos, 'env_wmat_brd', () => createRoundedBoxGeometry(2.96, 0.04, 1.26, 1, 0.04)),
        mats.glossy(theme.isNightVenue ? '#334155' : '#78350f', 0.58, 0.04),
      );
      matBorder.position.set(0, 0.036, d / 2 - 0.55);
      const matMesh = new THREE.Mesh(
        getGeo(geos, 'env_wmat', () => createRoundedBoxGeometry(2.74, 0.05, 1.08, 1, 0.04)),
        mats.glossy(template.themeAccentColor, 0.52, 0.04),
      );
      matMesh.position.set(0, 0.045, d / 2 - 0.55);
      root.add(matBorder, matMesh);

      if (isSunnyCityStreet) {
        const paverTex = textures?.createSidewalkPavers(Math.max(4, Math.round((w + 16) / 2.2)), 1) ?? null;
        const sidewalkMat = paverTex
          ? mats.textured(`env_swalk_pav_${w}`, paverTex, { color: '#ffffff', roughness: 0.64, sceneScoped: false })
          : mats.glossy('#e6dfd1', 0.62, 0.03);
        const sidewalk = new THREE.Mesh(
          getGeo(geos, `env_swalk_${w}`, () => createRoundedBoxGeometry(w + 16, 0.12, 2.65, 1, 0.04)),
          sidewalkMat,
        );
        sidewalk.position.set(0, -0.02, d / 2 + 1.62);
        sidewalk.receiveShadow = true;
        root.add(sidewalk);

        // Raised sidewalk stone curb lip
        const curbLip = new THREE.Mesh(
          getGeo(geos, `env_swcurb_${w}`, () => createRoundedBoxGeometry(w + 16, 0.15, 0.24, 1, 0.05)),
          mats.glossy('#d6cfc0', 0.56, 0.04),
        );
        curbLip.position.set(0, -0.005, d / 2 + 2.95);
        curbLip.receiveShadow = true;
        root.add(curbLip);

        // Foreground Sunlit Asphalt Street + Crisp Pedestrian Crosswalk + Gapped Yellow Lane Dashes
        const roadTex = textures?.createAsphaltStreet(Math.max(5, Math.round((w + 22) / 3.2))) ?? null;
        const roadMat = roadTex
          ? mats.textured(`env_street_${w}`, roadTex, { color: '#ffffff', roughness: 0.78, sceneScoped: false })
          : mats.matte('#525b6d', 0.85, 0.03);
        const street = new THREE.Mesh(
          getGeo(geos, `env_street_mesh_${w}`, () => createRoundedBoxGeometry(w + 22, 0.06, 4.2, 1, 0.02)),
          roadMat,
        );
        street.position.set(0, -0.065, d / 2 + 5.15);
        street.receiveShadow = true;
        root.add(street);

        // Crisp white zebra crosswalk stripes right in front of the entrance
        const xwGeo = getGeo(geos, 'env_xw_stripe', () => createRoundedBoxGeometry(0.46, 0.02, 2.55, 1, 0.008));
        const xwMat = mats.glossy('#fffbf0', 0.48, 0.02);
        for (let i = -2; i <= 2; i++) {
          const stripe = new THREE.Mesh(xwGeo, xwMat);
          stripe.position.set(i * 0.82, -0.03, d / 2 + 4.95);
          stripe.receiveShadow = true;
          root.add(stripe);
        }

        // Yellow dashed lane line cleanly skipping the crosswalk zone (|x| >= 2.85)
        const dashXs: number[] = [];
        for (let dx = 3.05; dx <= w / 2 + 8; dx += 2.05) {
          dashXs.push(-dx, dx);
        }
        if (dashXs.length > 0) {
          const rdDashGeo = getGeo(geos, 'env_rd_dash', () => createRoundedBoxGeometry(1.12, 0.018, 0.16, 1, 0.006));
          const rdDashes = new THREE.InstancedMesh(rdDashGeo, mats.glossy('#fde047', 0.45, 0.04), dashXs.length);
          const dd = new THREE.Object3D();
          for (let i = 0; i < dashXs.length; i++) {
            dd.position.set(dashXs[i], -0.028, d / 2 + 4.95);
            dd.updateMatrix();
            rdDashes.setMatrixAt(i, dd.matrix);
          }
          rdDashes.instanceMatrix.needsUpdate = true;
          root.add(rdDashes);
        }

        // Cozy Terracotta Flower Boxes flanking front entrance wall (strictly clear of doorway x ∈ [-1.6, +1.6])
        const potBoxGeo = getGeo(geos, 'env_epot', () => createRoundedBoxGeometry(1.55, 0.42, 0.50, 2, 0.07));
        const potSoilGeo = getGeo(geos, 'env_eshrub', () => createRoundedBoxGeometry(1.38, 0.30, 0.38, 2, 0.12));
        const potBloomGeo = getGeo(geos, 'env_ebloom', () => new THREE.SphereGeometry(0.115, 8, 6));
        const potMat = mats.glossy('#c2613b', 0.46, 0.04);
        const potLeafMat = mats.glossy('#22c55e', 0.44, 0.03);
        for (const side of [-1, 1]) {
          const fx = side * Math.max(2.65, w * 0.30);
          const fz = d / 2 + 0.62;
          const pBox = new THREE.Mesh(potBoxGeo, potMat);
          pBox.position.set(fx, 0.22, fz);
          pBox.castShadow = true;
          pBox.receiveShadow = true;
          const pShrub = new THREE.Mesh(potSoilGeo, potLeafMat);
          pShrub.position.set(fx, 0.48, fz);
          pShrub.castShadow = true;
          root.add(pBox, pShrub);
          const bColors = ['#fb7185', '#fde047', '#f97316', '#c084fc'];
          for (let bi = 0; bi < 4; bi++) {
            const bl = new THREE.Mesh(potBloomGeo, mats.glossy(bColors[(bi + (side > 0 ? 1 : 0)) % 4], 0.28, 0.05));
            bl.position.set(fx - 0.48 + bi * 0.32, 0.64 + (bi % 2) * 0.04, fz + (bi % 2 === 0 ? 0.06 : -0.05));
            root.add(bl);
          }
        }

        // Slatted Wooden Park Bench on Left Sidewalk (visibly framing portrait foreground!)
        const benchX = -Math.max(3.4, w * 0.36);
        const benchZ = d / 2 + 2.02;
        const benchWood = mats.glossy('#b46b3a', 0.44, 0.05);
        const ironMat = mats.metallic('#334155', 0.36, 0.65);
        const benchGroup = new THREE.Group();
        benchGroup.position.set(benchX, 0.04, benchZ);
        const bSeat = new THREE.Mesh(
          getGeo(geos, 'env_bnch_seat', () => createRoundedBoxGeometry(1.65, 0.09, 0.52, 1, 0.03)),
          benchWood,
        );
        bSeat.position.set(0, 0.38, 0);
        bSeat.castShadow = true;
        const bBack = new THREE.Mesh(
          getGeo(geos, 'env_bnch_back', () => createRoundedBoxGeometry(1.65, 0.40, 0.08, 1, 0.03)),
          benchWood,
        );
        bBack.position.set(0, 0.66, -0.22);
        bBack.rotation.x = -0.15;
        bBack.castShadow = true;
        const bLegGeo = getGeo(geos, 'env_bnch_leg', () => createRoundedBoxGeometry(0.10, 0.42, 0.48, 1, 0.02));
        for (const lx of [-0.66, 0.66]) {
          const leg = new THREE.Mesh(bLegGeo, ironMat);
          leg.position.set(lx, 0.21, 0);
          benchGroup.add(leg);
        }
        benchGroup.add(bSeat, bBack);
        root.add(benchGroup);

        // Cute Wooden A-Frame Sidewalk Chalkboard Menu on Right Sidewalk
        const signGroup = new THREE.Group();
        signGroup.position.set(Math.max(3.15, w * 0.33), 0.04, d / 2 + 1.85);
        signGroup.rotation.y = -0.35;
        const signPanel = new THREE.Mesh(
          getGeo(geos, 'env_aframe', () => createRoundedBoxGeometry(0.76, 0.92, 0.14, 1, 0.03)),
          mats.textured(`sw_aframe_${template.id}`, menuTex, {
            color: menuTex ? '#ffffff' : '#24323f',
            roughness: 0.46,
            sceneScoped: true,
          }),
        );
        signPanel.position.y = 0.48;
        signPanel.castShadow = true;
        const signFrame = new THREE.Mesh(
          getGeo(geos, 'env_aframe_rim', () => createRoundedBoxGeometry(0.84, 0.10, 0.20, 1, 0.03)),
          benchWood,
        );
        signFrame.position.y = 0.96;
        signGroup.add(signPanel, signFrame);
        root.add(signGroup);

        // Ornate Vintage Streetlamps tucked neatly inside portrait frame on sidewalk corners
        const lampBaseGeo = getGeo(geos, 'env_lbase', () => new THREE.CylinderGeometry(0.15, 0.20, 0.36, 10));
        const lampPostGeo = getGeo(geos, 'env_lpost', () => new THREE.CylinderGeometry(0.055, 0.085, 2.35, 8));
        const lampGlobeGeo = getGeo(geos, 'env_lglb', () => new THREE.SphereGeometry(0.22, 10, 8));
        const lampCapGeo = getGeo(geos, 'env_lcap', () => new THREE.ConeGeometry(0.26, 0.18, 10));
        const glowMat = mats.emissiveGlow('#fef08a', 0.95, 0.14);
        for (const s of [-1, 1]) {
          const lx = s * (w / 2 + 0.48);
          const lz = d / 2 + 1.05;
          const lb = new THREE.Mesh(lampBaseGeo, ironMat);
          lb.position.set(lx, 0.20, lz);
          const lp = new THREE.Mesh(lampPostGeo, ironMat);
          lp.position.set(lx, 1.35, lz);
          lp.castShadow = true;
          const glb = new THREE.Mesh(lampGlobeGeo, glowMat);
          glb.position.set(lx, 2.64, lz);
          const lcap = new THREE.Mesh(lampCapGeo, ironMat);
          lcap.position.set(lx, 2.86, lz);
          root.add(lb, lp, glb, lcap);
        }
      } else {
        // Themed entrance threshold apron for Cavern / Lunar / Potion / Pier / Olympus venues
        const apronColor = theme.isWaterGround
          ? '#8b5e34'
          : theme.themeId === 'adventure_olympus'
            ? '#e7e0d2'
            : theme.themeId === 'event_potion_shop'
              ? '#432b61'
              : '#334155';
        const apron = new THREE.Mesh(
          getGeo(geos, `env_apron_${w}`, () => createRoundedBoxGeometry(w + 2.4, 0.10, 2.2, 1, 0.05)),
          mats.glossy(apronColor, 0.62, 0.05),
        );
        apron.position.set(0, -0.03, d / 2 + 1.25);
        apron.receiveShadow = true;
        root.add(apron);
      }
    }

    // =========================================================================
    // ARCHETYPE-SPECIFIC INTERIORS
    // =========================================================================
    if (template.archetype === 'counter_stand') {
      // Widened counter wings & calibrated top surface (y = 0.79) so tip stacks (y = 0.80..1.08)
      // rest cleanly on the marble counter with ZERO overlap against POS register or condiments!
      const counterLen = w - 0.64;
      const counterBase = new THREE.Mesh(
        getGeo(geos, `cs_base_${w}`, () => createRoundedBoxGeometry(counterLen, 0.70, 0.78, 2, 0.07)),
        mats.glossy('#d69f6c', 0.42, 0.04),
      );
      counterBase.position.set(0, 0.35, 0.72);
      counterBase.castShadow = true;
      counterBase.receiveShadow = true;
      root.add(counterBase);

      // Decorative vertical front slats via InstancedMesh (1 draw call!)
      const slatCount = Math.max(8, Math.floor(counterLen / 0.48));
      const slatGeo = getGeo(geos, 'cs_slat', () => createRoundedBoxGeometry(0.14, 0.56, 0.06, 1, 0.02));
      const slats = new THREE.InstancedMesh(slatGeo, mats.std('#9a6235', 0.52, 0.04), slatCount);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < slatCount; i++) {
        const sx = -counterLen / 2 + 0.35 + (i / (slatCount - 1)) * (counterLen - 0.7);
        dummy.position.set(sx, 0.35, 1.12);
        dummy.updateMatrix();
        slats.setMatrixAt(i, dummy.matrix);
      }
      slats.instanceMatrix.needsUpdate = true;
      root.add(slats);

      // Bottom recessed wood kick-plate & brass foot rail along counter front
      const counterKick = new THREE.Mesh(
        getGeo(geos, `cs_kick_${w}`, () => createRoundedBoxGeometry(counterLen + 0.04, 0.12, 0.84, 1, 0.03)),
        mats.std('#6b4226', 0.56, 0.04),
      );
      counterKick.position.set(0, 0.07, 0.72);
      const footRail = new THREE.Mesh(
        getGeo(geos, `cs_frail_${w}`, () => new THREE.CylinderGeometry(0.026, 0.026, counterLen - 0.3, 8)),
        mats.metallic('#eab308', 0.22, 0.82),
      );
      footRail.rotation.z = Math.PI / 2;
      footRail.position.set(0, 0.14, 1.18);
      root.add(counterKick, footRail);

      // Glossy marble countertop (top surface y = 0.79, flush beneath tip shadow y = 0.80!)
      const marbleTex = textures?.createMarbleCounter('#fffbf4') ?? null;
      const counterTop = new THREE.Mesh(
        getGeo(geos, `cs_top_${w}`, () => createRoundedBoxGeometry(w - 0.44, 0.09, 0.98, 2, 0.04)),
        mats.textured('cs_marble_top', marbleTex, {
          color: marbleTex ? '#ffffff' : '#fffbf4',
          roughness: 0.24,
          metalness: 0.06,
          sceneScoped: false,
        }),
      );
      counterTop.position.set(0, 0.745, 0.72);
      counterTop.castShadow = true;
      counterTop.receiveShadow = true;
      root.add(counterTop);

      // Cute POS Cash Register on far-left wing (clear of slot[0] tip stack across w = 10, 11, 12!)
      const regX = -(w / 2 - 0.54);
      const regBase = new THREE.Mesh(
        getGeo(geos, 'cs_reg_b', () => createRoundedBoxGeometry(0.46, 0.22, 0.38, 1, 0.04)),
        mats.glossy('#334155', 0.32, 0.2),
      );
      regBase.position.set(regX, 0.90, 0.58);
      const regScreen = new THREE.Mesh(
        getGeo(geos, 'cs_reg_s', () => createRoundedBoxGeometry(0.36, 0.24, 0.06, 1, 0.02)),
        mats.emissiveGlow('#e0f2fe', 0.55, 0.18),
      );
      regScreen.position.set(regX, 1.09, 0.52);
      regScreen.rotation.x = -0.3;
      root.add(regBase, regScreen);

      // Transparent glass sneeze guard seated flush on marble counter front edge
      const guard = new THREE.Mesh(
        getGeo(geos, `cs_grd_${w}`, () => createRoundedBoxGeometry(w * 0.34, 0.42, 0.04, 1, 0.015)),
        mats.glass('#dff6ff', 0.28),
      );
      guard.position.set(w * 0.14, 1.00, 1.12);
      guard.castShadow = false;
      guard.receiveShadow = false;
      guard.renderOrder = 2;
      root.add(guard);

      // Condiment / Cup Caddy on far-right wing (clear of slot[last] tip stack across w = 10, 11, 12!)
      const cadX = w / 2 - 0.54;
      const b1 = new THREE.Mesh(
        getGeo(geos, 'cs_bot', () => new THREE.CylinderGeometry(0.055, 0.06, 0.24, 8)),
        mats.glossy('#ef4444', 0.26, 0.06),
      );
      b1.position.set(cadX - 0.09, 0.91, 0.60);
      const b2 = new THREE.Mesh(
        getGeo(geos, 'cs_bot', () => new THREE.CylinderGeometry(0.055, 0.06, 0.24, 8)),
        mats.glossy('#facc15', 0.26, 0.06),
      );
      b2.position.set(cadX + 0.09, 0.91, 0.60);
      root.add(b1, b2);
    } else if (template.archetype === 'cafe_tables') {
      root.add(buildDiningTables(template, layout, mats, geos, shadowTex, tables));
    } else if (template.archetype === 'waiter_dining') {
      const passZ = layout.passCounterPos?.z ?? -0.8;
      root.add(buildPassCounter(w, passZ, template, mats, geos, textures, passDishSlots));
      root.add(buildDiningTables(template, layout, mats, geos, shadowTex, tables));
    } else if (template.archetype === 'grand_hall') {
      const passZ = layout.passCounterPos?.z ?? -1.6;
      root.add(buildPassCounter(w, passZ, template, mats, geos, textures, passDishSlots));
      root.add(buildDiningTables(template, layout, mats, geos, shadowTex, tables));

      // Royal Velvet Carpet Runner down central aisle (x ∈ [-0.71, +0.71], clear of inner tables!)
      const carpet = new THREE.Mesh(
        getGeo(geos, 'gh_carpet', () => createRoundedBoxGeometry(1.42, 0.025, 10.6, 1, 0.01)),
        mats.glossy(template.themeRoofColor, 0.52, 0.04),
      );
      carpet.position.set(0, 0.048, 3.90);
      carpet.receiveShadow = true;
      const goldTrimGeo = getGeo(geos, 'gh_ctrim', () => new THREE.BoxGeometry(0.08, 0.028, 10.6));
      const goldMat = mats.metallic('#facc15', 0.22, 0.8);
      for (const s of [-0.64, 0.64]) {
        const gt = new THREE.Mesh(goldTrimGeo, goldMat);
        gt.position.set(s, 0.05, 3.90);
        root.add(gt);
      }
      root.add(carpet);

      // 4 Fluted Wall Pillars w/ glowing sconces flush inside side walls
      const pilGeo = getGeo(geos, 'gh_pil', () => new THREE.CylinderGeometry(0.28, 0.30, 2.85, 12));
      const capGeo = getGeo(geos, 'gh_pcap', () => createRoundedBoxGeometry(0.72, 0.22, 0.72, 1, 0.04));
      const sconceGeo = getGeo(geos, 'gh_snc', () => new THREE.SphereGeometry(0.14, 8, 8));
      const pilMat = mats.glossy('#fffbf0', 0.34, 0.05);
      const sconceMat = mats.emissiveGlow('#fde68a', 0.95, 0.15);
      for (const px of [-w / 2 + 0.32, w / 2 - 0.32]) {
        for (const pz of [-0.2, 7.2]) {
          const pil = new THREE.Mesh(pilGeo, pilMat);
          pil.position.set(px, 1.42, pz);
          pil.castShadow = true;
          const cap = new THREE.Mesh(capGeo, goldMat);
          cap.position.set(px, 2.88, pz);
          const snc = new THREE.Mesh(sconceGeo, sconceMat);
          snc.position.set(px + (px < 0 ? 0.32 : -0.32), 2.1, pz);
          root.add(pil, cap, snc);
        }
      }

      // 2 Warm Brass & Crystal Chandeliers high along back-dining perimeter
      const hoopGeo = getGeo(geos, 'gh_choop', () => new THREE.TorusGeometry(0.68, 0.045, 8, 18));
      const candleGeo = getGeo(geos, 'gh_ccnd', () => new THREE.SphereGeometry(0.085, 8, 6));
      for (const cx of [-4.6, 4.6]) {
        const ch = new THREE.Group();
        ch.position.set(cx, 3.65, -0.4);
        const hoop = new THREE.Mesh(hoopGeo, goldMat);
        hoop.rotation.x = Math.PI / 2;
        ch.add(hoop);
        for (let c = 0; c < 6; c++) {
          const a = (c / 6) * Math.PI * 2;
          const cnd = new THREE.Mesh(candleGeo, sconceMat);
          cnd.position.set(Math.cos(a) * 0.68, 0.10, Math.sin(a) * 0.68);
          ch.add(cnd);
        }
        root.add(ch);
      }
    } else if (template.archetype === 'drive_thru') {
      const laneZ = d / 2 - 2.5;

      // Two-lane rounded asphalt road covering front lane (laneZ) & inner lane (laneZ - 2.0)
      const road = new THREE.Mesh(
        getGeo(geos, `dt_road_${w}`, () => createRoundedBoxGeometry(w + 26, 0.08, 4.10, 1, 0.03)),
        mats.std('#334155', 0.82, 0.04),
      );
      road.position.set(0, 0.02, laneZ - 0.85);
      road.receiveShadow = true;
      root.add(road);

      // Raised concrete curbs
      const curbGeo = getGeo(geos, `dt_curb_${w}`, () => createRoundedBoxGeometry(w + 22, 0.16, 0.28, 1, 0.04));
      const concreteMat = mats.glossy('#cbd5e1', 0.56, 0.04);
      for (const cz of [laneZ + 1.32, laneZ - 3.00]) {
        const cb = new THREE.Mesh(curbGeo, concreteMat);
        cb.position.set(0, 0.08, cz);
        cb.receiveShadow = true;
        root.add(cb);
      }

      // Instanced Yellow Road Dashes along lane divider z = laneZ - 1.00 (1 draw call!)
      const dashCount = 19;
      const dashGeo = getGeo(geos, 'dt_dash', () => createRoundedBoxGeometry(1.15, 0.02, 0.16, 1, 0.01));
      const dashes = new THREE.InstancedMesh(
        dashGeo,
        mats.emissiveGlow('#facc15', 0.4, 0.35),
        dashCount,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < dashCount; i++) {
        dummy.position.set(-18.9 + i * 2.1, 0.07, laneZ - 1.00);
        dummy.updateMatrix();
        dashes.setMatrixAt(i, dummy.matrix);
      }
      dashes.instanceMatrix.needsUpdate = true;
      root.add(dashes);

      // NON-CLIPPING Service Window Counter at z = laneZ - 3.95 (1.19 units clear of inner-lane cars!)
      const winZ = laneZ - 3.95;
      const winBase = new THREE.Mesh(
        getGeo(geos, `dt_wbase_${w}`, () => createRoundedBoxGeometry(w - 2.2, 0.84, 0.56, 2, 0.07)),
        mats.glossy(template.themeRoofColor, 0.3, 0.1),
      );
      winBase.position.set(0, 0.42, winZ);
      winBase.castShadow = true;
      winBase.receiveShadow = true;

      const winSill = new THREE.Mesh(
        getGeo(geos, `dt_wsill_${w}`, () => createRoundedBoxGeometry(w - 2.0, 0.08, 0.72, 1, 0.03)),
        mats.metallic('#e2e8f0', 0.22, 0.72),
      );
      winSill.position.set(0, 0.87, winZ);

      // Upper transparent transom window (y = 1.98, workers serve freely underneath!)
      const transom = new THREE.Mesh(
        getGeo(geos, `dt_trans_${w}`, () => createRoundedBoxGeometry(w - 2.6, 0.58, 0.08, 1, 0.02)),
        mats.glass('#dff6ff', 0.28),
      );
      transom.position.set(0, 1.98, winZ);
      transom.castShadow = false;
      transom.receiveShadow = false;
      transom.renderOrder = 2;

      // Overhead Drive-Thru Canopy w/ glowing neon fascia strip
      const canopy = new THREE.Mesh(
        getGeo(geos, `dt_can_${w}`, () => createRoundedBoxGeometry(w - 1.2, 0.24, 2.3, 2, 0.08)),
        mats.glossy(template.themeRoofColor, 0.28, 0.12),
      );
      canopy.position.set(0, 2.68, laneZ - 3.55);
      canopy.castShadow = true;

      const neon = new THREE.Mesh(
        getGeo(geos, `dt_neon_${w}`, () => createRoundedBoxGeometry(w - 1.1, 0.09, 2.36, 1, 0.03)),
        mats.emissiveGlow(template.themeAccentColor, 0.95, 0.16),
      );
      neon.position.set(0, 2.62, laneZ - 3.55);

      const postGeo = getGeo(geos, 'dt_post', () => new THREE.CylinderGeometry(0.09, 0.10, 2.68, 10));
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(postGeo, mats.metallic('#cbd5e1'));
        p.position.set(s * (w / 2 - 0.9), 1.34, winZ);
        p.castShadow = true;
        root.add(p);
      }
      root.add(winBase, winSill, transom, canopy, neon);

      // Illuminated Drive-Thru Menu Board & Speaker Post on entry shoulder
      const dtMenuTex =
        textures?.createChalkboardMenu('DRIVE-THRU', template.stations, template.themeAccentColor) ??
        null;
      const dtMenu = new THREE.Mesh(
        getGeo(geos, 'dt_menu_b', () => createRoundedBoxGeometry(1.45, 1.05, 0.18, 1, 0.04)),
        mats.textured(`dt_menu_${template.id}`, dtMenuTex, {
          color: dtMenuTex ? '#ffffff' : '#24323f',
          roughness: 0.35,
          emissive: '#ffffff',
          emissiveIntensity: 0.12,
          sceneScoped: true,
        }),
      );
      dtMenu.position.set(-w / 2 - 1.45, 1.35, laneZ - 3.15);
      dtMenu.rotation.y = 0.28;
      dtMenu.castShadow = true;

      const spkPost = new THREE.Mesh(
        getGeo(geos, 'dt_spkp', () => new THREE.CylinderGeometry(0.06, 0.08, 1.35, 8)),
        mats.metallic('#94a3b8'),
      );
      spkPost.position.set(-w / 2 - 0.45, 0.68, laneZ - 3.15);
      const spkBox = new THREE.Mesh(
        getGeo(geos, 'dt_spkb', () => createRoundedBoxGeometry(0.32, 0.42, 0.20, 1, 0.04)),
        mats.glossy(template.themeAccentColor, 0.3, 0.12),
      );
      spkBox.position.set(-w / 2 - 0.45, 1.35, laneZ - 3.15);
      root.add(dtMenu, spkPost, spkBox);
    }
  }

  // Bespoke 3D Diorama Props for ALL 9 Special Event & Adventure Venues!
  if (theme.themeId !== 'default') {
    root.add(
      buildSpecialVenueProps(
        theme.themeId,
        w,
        d,
        wallH,
        mats,
        geos,
        animatedProps,
      ),
    );
  }

  const rig: EnvironmentVisualRig = {
    root,
    theme,
    tables,
    passDishSlots,
    animatedProps,
  };
  root.userData.envRig = rig;
  return rig;
}

/**
 * Backward-compatible helper returning `THREE.Group` directly (with `root.userData.envRig` populated).
 */
export function buildEnvironmentGroup(
  template: RestaurantTemplate,
  layout: RestaurantLayout,
  cityGroundColor: string,
  mats: MaterialPool,
  geos?: GeometryPool,
  textures?: TextureFactory,
  citySkyColor?: string,
): THREE.Group {
  return buildEnvironmentRig(
    template,
    layout,
    cityGroundColor,
    mats,
    geos,
    textures,
    citySkyColor,
  ).root;
}
