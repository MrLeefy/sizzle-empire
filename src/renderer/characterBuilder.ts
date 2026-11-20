import * as THREE from 'three';
import type {
  GearTemplate,
  PetSpeciesTemplate,
  Rarity,
  StationTemplate,
  WorkerRole,
} from '@/types/game';
import {
  GeometryPool,
  MaterialPool,
  createRoundedBoxGeometry,
  disposeObjectTree,
} from './materialLibrary';

export type HairStyleId =
  | 'bob'
  | 'spiky'
  | 'bun'
  | 'ponytail'
  | 'curly'
  | 'side_part';

export type StationModelStyle = StationTemplate['modelStyle'];
export type PetModelStyle = PetSpeciesTemplate['modelStyle'];

export const ALL_HAIR_STYLES: readonly HairStyleId[] = [
  'bob',
  'spiky',
  'bun',
  'ponytail',
  'curly',
  'side_part',
] as const;

export const ALL_PET_MODEL_STYLES: readonly PetModelStyle[] = [
  'chick',
  'pup',
  'kitten',
  'pony',
  'penguin',
  'turtle',
  'panda',
  'bot',
  'lucky_cat',
  'red_fox',
  'kraken',
  'dragon',
  'mole',
  'gnome',
] as const;

export const SKIN_TONE_PALETTE: readonly string[] = [
  '#ffe0c4',
  '#f8cfa6',
  '#ebb484',
  '#d49464',
  '#ad6e44',
  '#7a492b',
] as const;

/**
 * Canonical rarity shimmer palette for 3D equipped gear trims & sparkle accents:
 * Common (Silver/Slate), Rare (Leaf-Green), Epic (Royal-Purple),
 * Legendary (Sunny-Gold), Ultimate (Fiery Ruby-Red), Mythic (Prismatic Aqua-Teal).
 */
export const RARITY_SHIMMER_PALETTE: Record<
  Rarity,
  { highlight: string; primary: string; hasShimmer: boolean }
> = {
  common: { highlight: '#E2E8F0', primary: '#94A3B8', hasShimmer: false },
  rare: { highlight: '#86EFAC', primary: '#22C55E', hasShimmer: false },
  epic: { highlight: '#D8B4FE', primary: '#9333EA', hasShimmer: false },
  legendary: { highlight: '#FEF08A', primary: '#F59E0B', hasShimmer: true },
  ultimate: { highlight: '#FCA5A5', primary: '#EF4444', hasShimmer: true },
  mythic: { highlight: '#67E8F9', primary: '#06B6D4', hasShimmer: true },
};

export interface CharacterBuildOptions {
  role?: WorkerRole | 'customer';
  isGolden?: boolean;
  isGreedy?: boolean;
  skinColor?: string;
  hairStyle?: HairStyleId;
  seed?: number;
  geos?: GeometryPool;
  shadowTex?: THREE.Texture | null;
}

export interface CustomerRestyleOptions {
  shirtColor: string;
  hairColor: string;
  isGolden: boolean;
  isGreedy: boolean;
  seed?: number;
  skinColor?: string;
  hairStyle?: HairStyleId;
}

export interface EquippedGearVisualSet {
  head?: GearTemplate;
  body?: GearTemplate;
  hand1?: GearTemplate;
  hand2?: GearTemplate;
  ring?: GearTemplate;
  necklace?: GearTemplate;
}

export interface CharacterRig {
  // --- Original 13 fields (100% backward-compatible) ---
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  trayGroup: THREE.Group;
  dishMesh: THREE.Mesh;
  qualityHalo: THREE.Mesh;
  shirtMesh: THREE.Mesh;
  hatAnchor: THREE.Group;
  hand1Anchor: THREE.Group;
  hand2Anchor: THREE.Group;

  // --- Expressive, role, gear, pooling & animation handles ---
  headGroup: THREE.Group;
  hairGroup: THREE.Group;
  bodyGearAnchor: THREE.Group;
  accessoryAnchor: THREE.Group;
  ringAnchor: THREE.Group;
  leftEye: THREE.Mesh;
  rightEye: THREE.Mesh;
  eyelids: THREE.Group;
  mouthGroup: THREE.Group;
  neutralMouth: THREE.Mesh;
  happyMouth: THREE.Group;
  dishAnchor: THREE.Group;
  contactShadow: THREE.Mesh;
  auraRing: THREE.Mesh;
  defaultApronGroup: THREE.Group;
  skinMeshes: THREE.Mesh[];
  shoeMeshes: THREE.Mesh[];
  greedyBibGroup: THREE.Group;
  baseShirtColor: string;
  baseSleeveColor: string;
  baseIsChef: boolean;
  baseRole: WorkerRole | 'customer';
  hairStyle: HairStyleId;
  currentDishKey: string;
}

export interface PetVisualRig {
  root: THREE.Group;
  body: THREE.Group;
  dishTray: THREE.Mesh;
  modelStyle: PetModelStyle;
  speciesId?: string;
  headGroup: THREE.Group;
  tailGroup?: THREE.Group;
  leftWing?: THREE.Object3D;
  rightWing?: THREE.Object3D;
  legs: THREE.Object3D[];
  dishAnchor: THREE.Group;
  qualityHalo: THREE.Mesh;
  contactShadow: THREE.Mesh;
  currentDishKey: string;
}

export interface DriveThruCarRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  chassisMesh: THREE.Mesh;
  roofMesh: THREE.Mesh;
  hoodCrown: THREE.Group;
  wheels: THREE.Group[];
  driverHead: THREE.Group;
  contactShadow: THREE.Mesh;
  isGolden: boolean;
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

function clearAnchorGroup(anchor: THREE.Group): void {
  for (let i = anchor.children.length - 1; i >= 0; i--) {
    const child = anchor.children[i];
    disposeObjectTree(child);
    anchor.remove(child);
  }
}

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.Material | THREE.Material[] | undefined;
      const isTransparent = Array.isArray(mat)
        ? mat.some((m) => Boolean(m?.transparent))
        : Boolean(mat?.transparent);
      child.castShadow = isTransparent ? false : cast;
      child.receiveShadow = isTransparent ? false : receive;
    }
  });
}

function pickFromSeed<T>(list: readonly T[], seed: number): T {
  const idx = Math.abs(Math.floor(seed)) % list.length;
  return list[idx];
}

function buildDefaultChefToque(
  mats: MaterialPool,
  geos: GeometryPool | undefined,
  scale = 1,
  bandColor?: string,
): THREE.Group {
  const g = new THREE.Group();
  const whiteMat = mats.glossy('#ffffff', 0.35, 0.04);

  const band = new THREE.Mesh(
    getGeo(geos, 'toque_band', () => new THREE.CylinderGeometry(0.28, 0.27, 0.17, 12)),
    whiteMat,
  );
  band.position.y = 0.07;
  g.add(band);

  if (bandColor) {
    const trim = new THREE.Mesh(
      getGeo(geos, 'toque_trim', () => new THREE.TorusGeometry(0.275, 0.022, 6, 16)),
      mats.metallic(bandColor, 0.24, 0.65),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.04;
    g.add(trim);
  }

  const puffGeo = getGeo(geos, 'toque_puff', () => new THREE.SphereGeometry(0.185, 10, 8));
  const puffOffsets: Array<[number, number, number]> = [
    [0, 0.25, 0],
    [-0.12, 0.21, 0.07],
    [0.12, 0.21, 0.07],
    [0, 0.21, -0.11],
  ];
  for (const [px, py, pz] of puffOffsets) {
    const puff = new THREE.Mesh(puffGeo, whiteMat);
    puff.position.set(px, py, pz);
    g.add(puff);
  }

  g.scale.setScalar(scale);
  enableShadows(g, true, true);
  return g;
}

function buildGoldenMiniCrown(
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const goldMat = mats.metallic('#facc15', 0.18, 0.82, '#f59e0b', 0.35);
  const rubyMat = mats.emissiveGlow('#ef4444', 0.75, 0.18);

  const band = new THREE.Mesh(
    getGeo(geos, 'mini_crown_band', () => new THREE.CylinderGeometry(0.22, 0.19, 0.14, 10)),
    goldMat,
  );
  band.position.y = 0.07;
  g.add(band);

  const spikeGeo = getGeo(geos, 'mini_crown_spike', () => new THREE.ConeGeometry(0.055, 0.14, 5));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sp = new THREE.Mesh(spikeGeo, goldMat);
    sp.position.set(Math.sin(a) * 0.17, 0.18, Math.cos(a) * 0.17);
    g.add(sp);
  }

  const gem = new THREE.Mesh(
    getGeo(geos, 'mini_crown_gem', () => new THREE.OctahedronGeometry(0.048, 0)),
    rubyMat,
  );
  gem.position.set(0, 0.09, 0.21);
  g.add(gem);
  enableShadows(g, true, true);
  return g;
}

function buildHairStyleMeshes(
  style: HairStyleId,
  hairColor: string,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const hairMat = mats.glossy(hairColor, 0.38, 0.06);

  const domeGeo = getGeo(
    geos,
    'hair_dome',
    () => new THREE.SphereGeometry(0.368, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
  );

  if (style === 'bob') {
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.y = 0.02;
    g.add(dome);

    const curlGeo = getGeo(geos, 'hair_bob_curl', () => new THREE.SphereGeometry(0.115, 10, 8));
    for (const side of [-1, 1]) {
      const curl = new THREE.Mesh(curlGeo, hairMat);
      curl.position.set(side * 0.31, -0.04, 0.11);
      g.add(curl);
    }
    const bang = new THREE.Mesh(
      getGeo(geos, 'hair_bob_bang', () => createRoundedBoxGeometry(0.34, 0.10, 0.12, 1, 0.04)),
      hairMat,
    );
    bang.position.set(0, 0.22, 0.27);
    g.add(bang);
  } else if (style === 'spiky') {
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.y = 0.02;
    g.add(dome);

    const spikeGeo = getGeo(geos, 'hair_spike', () => new THREE.ConeGeometry(0.09, 0.22, 7));
    const specs: Array<[number, number, number, number, number]> = [
      [0, 0.37, 0.14, 0.32, 0],
      [-0.14, 0.34, 0.06, 0.15, 0.38],
      [0.14, 0.34, 0.06, 0.15, -0.38],
      [-0.11, 0.35, -0.10, -0.25, 0.28],
      [0.11, 0.35, -0.10, -0.25, -0.28],
    ];
    for (const [x, y, z, rx, rz] of specs) {
      const spike = new THREE.Mesh(spikeGeo, hairMat);
      spike.position.set(x, y, z);
      spike.rotation.set(rx, 0, rz);
      g.add(spike);
    }
  } else if (style === 'bun') {
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.y = 0.02;
    g.add(dome);

    const bun = new THREE.Mesh(
      getGeo(geos, 'hair_bun', () => new THREE.SphereGeometry(0.155, 10, 8)),
      hairMat,
    );
    bun.position.set(0, 0.40, -0.08);
    g.add(bun);

    const tie = new THREE.Mesh(
      getGeo(geos, 'hair_scrunchie', () => new THREE.TorusGeometry(0.115, 0.032, 6, 12)),
      mats.glossy('#fb7185', 0.32, 0.08),
    );
    tie.rotation.x = Math.PI / 2;
    tie.position.set(0, 0.33, -0.08);
    g.add(tie);
  } else if (style === 'ponytail') {
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.y = 0.02;
    g.add(dome);

    const fringe = new THREE.Mesh(
      getGeo(geos, 'hair_pt_fringe', () => createRoundedBoxGeometry(0.28, 0.09, 0.11, 1, 0.035)),
      hairMat,
    );
    fringe.position.set(-0.05, 0.21, 0.28);
    fringe.rotation.z = 0.22;
    g.add(fringe);

    const tie = new THREE.Mesh(
      getGeo(geos, 'hair_pt_tie', () => new THREE.TorusGeometry(0.08, 0.025, 6, 10)),
      mats.glossy('#facc15', 0.28, 0.15),
    );
    tie.position.set(0, 0.12, -0.34);
    g.add(tie);

    const tailTop = new THREE.Mesh(
      getGeo(geos, 'hair_pt_top', () => new THREE.SphereGeometry(0.13, 10, 8)),
      hairMat,
    );
    tailTop.position.set(0, 0.08, -0.39);
    g.add(tailTop);

    const tailTip = new THREE.Mesh(
      getGeo(geos, 'hair_pt_tip', () => new THREE.SphereGeometry(0.10, 10, 8)),
      hairMat,
    );
    tailTip.position.set(0, -0.08, -0.44);
    g.add(tailTip);
  } else if (style === 'curly') {
    const puffGeo = getGeo(geos, 'hair_curly_puff', () => new THREE.SphereGeometry(0.15, 10, 8));
    const puffs: Array<[number, number, number]> = [
      [0, 0.32, 0.04],
      [-0.22, 0.24, 0.14],
      [0.22, 0.24, 0.14],
      [-0.31, 0.08, 0.0],
      [0.31, 0.08, 0.0],
      [-0.18, 0.24, -0.22],
      [0.18, 0.24, -0.22],
      [0, 0.16, -0.28],
    ];
    for (const [px, py, pz] of puffs) {
      const p = new THREE.Mesh(puffGeo, hairMat);
      p.position.set(px, py, pz);
      g.add(p);
    }
  } else {
    // 'side_part'
    const dome = new THREE.Mesh(domeGeo, hairMat);
    dome.position.y = 0.02;
    g.add(dome);

    const quiff = new THREE.Mesh(
      getGeo(geos, 'hair_quiff', () => new THREE.CapsuleGeometry(0.085, 0.22, 4, 8)),
      hairMat,
    );
    quiff.position.set(0.05, 0.24, 0.26);
    quiff.rotation.z = 1.25;
    g.add(quiff);

    const ridge = new THREE.Mesh(
      getGeo(geos, 'hair_part_ridge', () => createRoundedBoxGeometry(0.18, 0.08, 0.26, 1, 0.03)),
      hairMat,
    );
    ridge.position.set(-0.14, 0.30, 0.02);
    g.add(ridge);
  }

  enableShadows(g, true, true);
  return g;
}

function buildGreedyBibGroup(
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const bibMat = mats.glossy('#fffbf0', 0.38, 0.02);
  const trimMat = mats.glossy('#fb7185', 0.32, 0.06);

  const bib = new THREE.Mesh(
    getGeo(geos, 'greedy_bib', () => createRoundedBoxGeometry(0.32, 0.28, 0.08, 1, 0.035)),
    bibMat,
  );
  bib.position.set(0, 0.65, 0.24);
  g.add(bib);

  const tie = new THREE.Mesh(
    getGeo(geos, 'greedy_bib_tie', () => new THREE.TorusGeometry(0.175, 0.026, 6, 14)),
    trimMat,
  );
  tie.rotation.x = Math.PI / 2 + 0.18;
  tie.position.set(0, 0.82, 0.02);
  g.add(tie);

  // Tiny cutlery icon dot on bib
  const emblem = new THREE.Mesh(
    getGeo(geos, 'greedy_bib_emblem', () => new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10)),
    mats.glossy('#f97316', 0.28, 0.1),
  );
  emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0, 0.64, 0.285);
  g.add(emblem);

  enableShadows(g, true, true);
  return g;
}

/**
 * Builds a chunky, expressive Eatventure-caliber chibi character rig for all 5 worker roles
 * (player, chef, waiter, cashier, helper) and customers (normal, golden, greedy, golden+greedy).
 */
export function buildCharacterRig(
  shirtColor: string,
  hairColor: string,
  isChef: boolean,
  mats: MaterialPool,
  options: CharacterBuildOptions = {},
): CharacterRig {
  const geos = options.geos;
  const role: WorkerRole | 'customer' =
    options.role ?? (isChef ? 'chef' : 'customer');
  const isGolden = Boolean(options.isGolden);
  const isGreedy = Boolean(options.isGreedy);
  const seed = options.seed ?? 0;

  const skinColor =
    options.skinColor ??
    (role === 'player' ? '#fbd3b0' : pickFromSeed(SKIN_TONE_PALETTE, seed + 1));
  const hairStyle: HairStyleId =
    options.hairStyle ??
    (role === 'player'
      ? 'side_part'
      : pickFromSeed(ALL_HAIR_STYLES, seed + 3));

  const effectiveShirtColor = isGolden ? '#facc15' : shirtColor;
  const baseSleeveColor =
    role === 'waiter' ? '#f8fafc' : effectiveShirtColor;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Soft radial ground contact shadow (essential on 'low' quality!)
  const contactShadow = new THREE.Mesh(
    getGeo(geos, 'char_shadow_quad', () => new THREE.PlaneGeometry(1, 1)),
    mats.contactShadow(options.shadowTex ?? null),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(0.92, 0.92, 1);
  contactShadow.position.y = 0.025;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  contactShadow.raycast = () => {};
  root.add(contactShadow);

  // Aura ring (visible for helper & golden customers)
  const auraColor = role === 'helper' ? '#c084fc' : '#facc15';
  const auraRing = new THREE.Mesh(
    getGeo(geos, 'char_aura_ring', () => new THREE.RingGeometry(0.36, 0.50, 24)),
    mats.basicMat(auraColor, 0.78, false),
  );
  auraRing.rotation.x = -Math.PI / 2;
  auraRing.position.y = 0.04;
  auraRing.visible = role === 'helper' || isGolden;
  auraRing.raycast = () => {};
  root.add(auraRing);

  const skinMat = mats.std(skinColor, 0.52, 0.02);
  const skinMeshes: THREE.Mesh[] = [];
  const shoeMeshes: THREE.Mesh[] = [];

  // Hip-pivoted chunky legs
  const legGeo = getGeo(geos, 'char_leg_pivoted', () => {
    const g = new THREE.CapsuleGeometry(0.10, 0.16, 4, 8);
    g.translate(0, -0.14, 0);
    return g;
  });
  const pantsMat = isGolden
    ? mats.metallic('#ca8a04', 0.25, 0.65)
    : mats.std(role === 'customer' ? '#334155' : '#263044', 0.58, 0.04);

  const shoeGeo = getGeo(
    geos,
    'char_shoe',
    () => createRoundedBoxGeometry(0.16, 0.10, 0.23, 1, 0.035),
  );
  const shoeMat = isGolden
    ? mats.metallic('#f59e0b', 0.22, 0.72)
    : mats.glossy(role === 'customer' ? '#f8fafc' : '#3d2314', 0.34, 0.06);

  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.125, 0.34, 0);
  const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
  leftShoe.position.set(0, -0.26, 0.04);
  leftLeg.add(leftShoe);
  shoeMeshes.push(leftShoe);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.125, 0.34, 0);
  const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
  rightShoe.position.set(0, -0.26, 0.04);
  rightLeg.add(rightShoe);
  shoeMeshes.push(rightShoe);
  bodyGroup.add(leftLeg, rightLeg);

  // Plump rounded torso (bottom at y = 0.30 so seated bodyGroup.y = 0.06 rests right on seatTopY = 0.36!)
  const torsoGeo = getGeo(
    geos,
    'char_torso',
    () => new THREE.CapsuleGeometry(0.24, 0.18, 6, 12),
  );
  const shirtMat = isGolden
    ? mats.metallic('#facc15', 0.18, 0.72, '#f59e0b', 0.35)
    : mats.glossy(effectiveShirtColor, 0.36, 0.06);
  const shirtMesh = new THREE.Mesh(torsoGeo, shirtMat);
  shirtMesh.position.set(0, 0.64, 0);
  if (isGreedy) {
    shirtMesh.scale.set(1.22, 1.04, 1.12);
  } else {
    shirtMesh.scale.set(1.06, 1.0, 0.94);
  }
  bodyGroup.add(shirtMesh);

  // Shoulder-pivoted arms with separate skin hand nubs
  const armGeo = getGeo(geos, 'char_arm_pivoted', () => {
    const g = new THREE.CapsuleGeometry(0.09, 0.16, 4, 8);
    g.translate(0, -0.12, 0);
    return g;
  });
  const sleeveMat = isGolden
    ? mats.metallic('#facc15', 0.18, 0.72, '#f59e0b', 0.35)
    : mats.glossy(baseSleeveColor, 0.38, 0.05);
  const handGeo = getGeo(geos, 'char_hand_nub', () => new THREE.SphereGeometry(0.08, 10, 8));

  const armX = isGreedy ? 0.39 : 0.34;
  const leftArm = new THREE.Mesh(armGeo, sleeveMat);
  leftArm.position.set(-armX, 0.76, 0);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.set(0, -0.24, 0.02);
  leftArm.add(leftHand);
  skinMeshes.push(leftHand);

  const rightArm = new THREE.Mesh(armGeo, sleeveMat);
  rightArm.position.set(armX, 0.76, 0);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.set(0, -0.24, 0.02);
  rightArm.add(rightHand);
  skinMeshes.push(rightHand);
  bodyGroup.add(leftArm, rightArm);

  // Gear anchors on arms
  const hand1Anchor = new THREE.Group();
  hand1Anchor.position.set(0, -0.22, 0.08);
  rightArm.add(hand1Anchor);

  const hand2Anchor = new THREE.Group();
  hand2Anchor.position.set(0, -0.22, 0.08);
  leftArm.add(hand2Anchor);

  const ringAnchor = new THREE.Group();
  ringAnchor.position.set(0, -0.21, 0.04);
  rightArm.add(ringAnchor);

  // Gear anchors on body
  const bodyGearAnchor = new THREE.Group();
  bodyGroup.add(bodyGearAnchor);

  const accessoryAnchor = new THREE.Group();
  bodyGroup.add(accessoryAnchor);

  // Role-default chef apron (hidden when body gear equips, restored on unequip)
  const defaultApronGroup = new THREE.Group();
  bodyGroup.add(defaultApronGroup);

  // Greedy bib group (toggled by isGreedy and restyleCustomerRig)
  const greedyBibGroup = buildGreedyBibGroup(mats, geos);
  greedyBibGroup.visible = isGreedy;
  bodyGroup.add(greedyBibGroup);

  // Role-specific outfit details
  if (role === 'player' || role === 'chef') {
    const apronMat = mats.glossy('#fffbf0', 0.4, 0.02);
    const apron = new THREE.Mesh(
      getGeo(geos, 'role_chef_apron', () => createRoundedBoxGeometry(0.38, 0.36, 0.08, 1, 0.03)),
      apronMat,
    );
    apron.position.set(0, 0.54, 0.21);
    defaultApronGroup.add(apron);

    // Double-breasted buttons
    const btnGeo = getGeo(geos, 'role_btn', () => new THREE.SphereGeometry(0.026, 8, 6));
    const btnMat =
      role === 'player'
        ? mats.metallic('#facc15', 0.22, 0.78)
        : mats.std('#334155', 0.4, 0.2);
    for (const bx of [-0.07, 0.07]) {
      for (const by of [0.64, 0.74]) {
        const b = new THREE.Mesh(btnGeo, btnMat);
        b.position.set(bx, by, 0.24);
        defaultApronGroup.add(b);
      }
    }

    if (role === 'player') {
      // Coral neckerchief ring
      const scarf = new THREE.Mesh(
        getGeo(geos, 'player_scarf', () => new THREE.TorusGeometry(0.18, 0.034, 6, 14)),
        mats.glossy('#f97316', 0.32, 0.06),
      );
      scarf.rotation.x = Math.PI / 2 + 0.14;
      scarf.position.set(0, 0.85, 0.02);
      defaultApronGroup.add(scarf);
    } else {
      // White lapel panel on colored chef coat
      const lapel = new THREE.Mesh(
        getGeo(geos, 'chef_lapel', () => createRoundedBoxGeometry(0.24, 0.22, 0.05, 1, 0.02)),
        apronMat,
      );
      lapel.position.set(0, 0.70, 0.22);
      defaultApronGroup.add(lapel);
    }
  } else if (role === 'waiter') {
    // Bistro crimson 3D bowtie + white waiter towel draped over leftArm + half waist apron
    const bowMat = mats.glossy('#ef4444', 0.3, 0.08);
    const wingGeo = getGeo(geos, 'bowtie_wing', () => new THREE.ConeGeometry(0.055, 0.10, 6));
    const leftWing = new THREE.Mesh(wingGeo, bowMat);
    leftWing.rotation.z = -Math.PI / 2;
    leftWing.position.set(-0.055, 0.85, 0.23);
    const rightWing = new THREE.Mesh(wingGeo, bowMat);
    rightWing.rotation.z = Math.PI / 2;
    rightWing.position.set(0.055, 0.85, 0.23);
    const knot = new THREE.Mesh(
      getGeo(geos, 'bowtie_knot', () => new THREE.SphereGeometry(0.032, 8, 6)),
      bowMat,
    );
    knot.position.set(0, 0.85, 0.24);
    bodyGroup.add(leftWing, rightWing, knot);

    const waistApron = new THREE.Mesh(
      getGeo(geos, 'waiter_apron', () => createRoundedBoxGeometry(0.42, 0.24, 0.10, 1, 0.03)),
      mats.glossy('#fffbf0', 0.42, 0.02),
    );
    waistApron.position.set(0, 0.47, 0.20);
    bodyGroup.add(waistApron);

    const towel = new THREE.Mesh(
      getGeo(geos, 'waiter_towel', () => createRoundedBoxGeometry(0.14, 0.20, 0.15, 1, 0.03)),
      mats.glossy('#ffffff', 0.42, 0.02),
    );
    towel.position.set(0, -0.14, 0.02);
    leftArm.add(towel);
  } else if (role === 'cashier') {
    const waistApron = new THREE.Mesh(
      getGeo(geos, 'cashier_apron', () => createRoundedBoxGeometry(0.42, 0.24, 0.10, 1, 0.03)),
      mats.std('#1e293b', 0.55, 0.05),
    );
    waistApron.position.set(0, 0.47, 0.20);
    bodyGroup.add(waistApron);

    const notepad = new THREE.Mesh(
      getGeo(geos, 'cashier_pad', () => createRoundedBoxGeometry(0.14, 0.14, 0.04, 1, 0.015)),
      mats.glossy('#fef08a', 0.35, 0.04),
    );
    notepad.position.set(0.11, 0.50, 0.25);
    bodyGroup.add(notepad);
  } else if (role === 'helper') {
    // VIP Helper: golden epaulettes + emissive chest star badge
    const goldMat = mats.metallic('#facc15', 0.2, 0.8, '#f59e0b', 0.4);
    const epGeo = getGeo(
      geos,
      'helper_epaulette',
      () => createRoundedBoxGeometry(0.16, 0.07, 0.18, 1, 0.025),
    );
    for (const side of [-1, 1]) {
      const ep = new THREE.Mesh(epGeo, goldMat);
      ep.position.set(side * 0.31, 0.83, 0);
      bodyGroup.add(ep);
    }
    const badge = new THREE.Mesh(
      getGeo(geos, 'helper_star', () => new THREE.OctahedronGeometry(0.08, 0)),
      mats.emissiveGlow('#fde047', 0.9, 0.18),
    );
    badge.position.set(0, 0.69, 0.26);
    bodyGroup.add(badge);
  } else {
    // Customer crew collar
    const collar = new THREE.Mesh(
      getGeo(geos, 'cust_collar', () => new THREE.TorusGeometry(0.16, 0.026, 6, 12)),
      mats.glossy('#ffffff', 0.42, 0.02),
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.85, 0);
    bodyGroup.add(collar);
  }

  // Head group (chunky chibi scale!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.15, 0);
  bodyGroup.add(headGroup);

  const skull = new THREE.Mesh(
    getGeo(geos, 'char_skull', () => new THREE.SphereGeometry(0.35, 14, 12)),
    skinMat,
  );
  skull.scale.set(1.04, 0.96, 1.0);
  headGroup.add(skull);
  skinMeshes.push(skull);

  // Cute round ears
  const earGeo = getGeo(geos, 'char_ear', () => new THREE.SphereGeometry(0.072, 8, 8));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.35, -0.02, 0);
    headGroup.add(ear);
    skinMeshes.push(ear);
  }

  // Glossy dark eyes with twin unlit white catchlights
  const eyeGeo = getGeo(geos, 'char_eye', () => new THREE.SphereGeometry(0.056, 10, 8));
  const eyeMat = mats.glossy('#1e1410', 0.12, 0.08);
  const catchBigGeo = getGeo(geos, 'char_catch_big', () => new THREE.SphereGeometry(0.022, 6, 6));
  const catchSmallGeo = getGeo(geos, 'char_catch_sm', () => new THREE.SphereGeometry(0.011, 6, 6));
  const catchMat = mats.basicMat('#ffffff', 1);

  const makeEye = (side: -1 | 1): THREE.Mesh => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.scale.set(0.92, 1.15, 0.65);
    eye.position.set(side * 0.125, 0.015, 0.315);
    const c1 = new THREE.Mesh(catchBigGeo, catchMat);
    c1.position.set(0.018, 0.022, 0.038);
    const c2 = new THREE.Mesh(catchSmallGeo, catchMat);
    c2.position.set(-0.016, -0.016, 0.036);
    eye.add(c1, c2);
    return eye;
  };
  const leftEye = makeEye(-1);
  const rightEye = makeEye(1);
  headGroup.add(leftEye, rightEye);

  // Blinking eyelids
  const eyelids = new THREE.Group();
  const lidGeo = getGeo(
    geos,
    'char_eyelid',
    () => new THREE.SphereGeometry(0.064, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  );
  for (const side of [-1, 1]) {
    const lid = new THREE.Mesh(lidGeo, skinMat);
    lid.position.set(side * 0.125, 0.032, 0.316);
    eyelids.add(lid);
    skinMeshes.push(lid);
  }
  eyelids.scale.y = 0.01;
  eyelids.visible = false;
  headGroup.add(eyelids);

  // Rosy coral cheeks
  const cheekGeo = getGeo(geos, 'char_cheek', () => new THREE.SphereGeometry(0.058, 8, 6));
  const cheekMat = mats.std('#ff8fab', 0.62, 0.02);
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.scale.set(1.3, 0.72, 0.35);
    cheek.position.set(side * 0.205, -0.065, 0.28);
    cheek.rotation.y = side * 0.32;
    headGroup.add(cheek);
  }

  // Mouth (neutral smile + happy open grin)
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -0.105, 0.32);
  headGroup.add(mouthGroup);

  const neutralMouth = new THREE.Mesh(
    getGeo(geos, 'char_mouth_neutral', () => new THREE.TorusGeometry(0.052, 0.013, 6, 12, Math.PI)),
    mats.std('#4a2518', 0.45, 0.02),
  );
  neutralMouth.rotation.z = Math.PI;
  mouthGroup.add(neutralMouth);

  const happyMouth = new THREE.Group();
  const grinBg = new THREE.Mesh(
    getGeo(geos, 'char_mouth_happy', () => new THREE.CircleGeometry(0.064, 12, Math.PI, Math.PI)),
    mats.basicMat('#7f1d1d', 1),
  );
  grinBg.position.set(0, 0.02, 0.008);
  const tongue = new THREE.Mesh(
    getGeo(geos, 'char_tongue', () => new THREE.SphereGeometry(0.026, 6, 6)),
    mats.glossy('#fb7185', 0.3, 0.02),
  );
  tongue.position.set(0, -0.022, 0.014);
  happyMouth.add(grinBg, tongue);
  happyMouth.visible = false;
  mouthGroup.add(happyMouth);

  // Procedural hair
  const hairGroup = new THREE.Group();
  hairGroup.add(buildHairStyleMeshes(hairStyle, hairColor, mats, geos));
  headGroup.add(hairGroup);

  // Hat anchor mounted inside headGroup so hats nod with head
  const hatAnchor = new THREE.Group();
  hatAnchor.position.set(0, 0.28, 0);
  headGroup.add(hatAnchor);

  if (role === 'player') {
    hatAnchor.add(buildDefaultChefToque(mats, geos, 1.0));
  } else if (role === 'chef') {
    hatAnchor.add(buildDefaultChefToque(mats, geos, 0.9));
  } else if (role === 'helper') {
    hatAnchor.add(buildDefaultChefToque(mats, geos, 1.02, '#facc15'));
  } else if (role === 'cashier') {
    const visorGroup = new THREE.Group();
    const band = new THREE.Mesh(
      getGeo(geos, 'cashier_visor_band', () => new THREE.TorusGeometry(0.355, 0.048, 8, 16)),
      mats.glossy(shirtColor, 0.3, 0.08),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.04;
    const bill = new THREE.Mesh(
      getGeo(geos, 'cashier_visor_bill', () => createRoundedBoxGeometry(0.44, 0.045, 0.28, 1, 0.02)),
      mats.glossy(shirtColor, 0.26, 0.1),
    );
    bill.position.set(0, -0.03, 0.30);
    visorGroup.add(band, bill);
    hatAnchor.add(visorGroup);
  } else if (isGolden) {
    hatAnchor.add(buildGoldenMiniCrown(mats, geos));
  }

  // Carrying tray group (mounted on bodyGroup)
  const trayGroup = new THREE.Group();
  trayGroup.position.set(0, 0.78, 0.46);
  trayGroup.visible = false;
  bodyGroup.add(trayGroup);

  const trayPlatter = new THREE.Mesh(
    getGeo(geos, 'tray_platter', () => new THREE.CylinderGeometry(0.31, 0.28, 0.055, 16)),
    mats.metallic('#e2e8f0', 0.22, 0.65),
  );
  trayGroup.add(trayPlatter);

  const dishMesh = new THREE.Mesh(
    getGeo(geos, 'tray_fallback_dish', () => new THREE.SphereGeometry(0.18, 10, 8)),
    mats.glossy('#facc15', 0.28, 0.08),
  );
  dishMesh.position.y = 0.12;
  trayGroup.add(dishMesh);

  const dishAnchor = new THREE.Group();
  dishAnchor.position.set(0, 0.035, 0);
  trayGroup.add(dishAnchor);

  const qualityHalo = new THREE.Mesh(
    getGeo(geos, 'tray_quality_halo', () => new THREE.TorusGeometry(0.35, 0.038, 8, 18)),
    mats.basicMat('#facc15', 0.92, false),
  );
  qualityHalo.rotation.x = Math.PI / 2;
  qualityHalo.position.y = 0.14;
  qualityHalo.visible = false;
  trayGroup.add(qualityHalo);

  enableShadows(bodyGroup, true, true);
  // Keep transparent / unlit parts non-shadow-casting
  qualityHalo.castShadow = false;
  qualityHalo.receiveShadow = false;

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    trayGroup,
    dishMesh,
    qualityHalo,
    shirtMesh,
    hatAnchor,
    hand1Anchor,
    hand2Anchor,
    headGroup,
    hairGroup,
    bodyGearAnchor,
    accessoryAnchor,
    ringAnchor,
    leftEye,
    rightEye,
    eyelids,
    mouthGroup,
    neutralMouth,
    happyMouth,
    dishAnchor,
    contactShadow,
    auraRing,
    defaultApronGroup,
    skinMeshes,
    shoeMeshes,
    greedyBibGroup,
    baseShirtColor: effectiveShirtColor,
    baseSleeveColor,
    baseIsChef: isChef || role === 'player' || role === 'chef' || role === 'helper',
    baseRole: role,
    hairStyle,
    currentDishKey: '',
  };
}

/**
 * Restyles a recycled pedestrian customer rig from the object pool in O(1) without allocating a new rig.
 */
export function restyleCustomerRig(
  rig: CharacterRig,
  opts: CustomerRestyleOptions,
  mats: MaterialPool,
  geos?: GeometryPool,
): void {
  const seed = opts.seed ?? 0;
  const skinColor = opts.skinColor ?? pickFromSeed(SKIN_TONE_PALETTE, seed + 1);
  const hairStyle = opts.hairStyle ?? pickFromSeed(ALL_HAIR_STYLES, seed + 3);

  const shirtMat = opts.isGolden
    ? mats.metallic('#facc15', 0.18, 0.72, '#f59e0b', 0.35)
    : mats.glossy(opts.shirtColor, 0.36, 0.06);
  const pantsMat = opts.isGolden
    ? mats.metallic('#ca8a04', 0.25, 0.65)
    : mats.std('#334155', 0.58, 0.04);
  const shoeMat = opts.isGolden
    ? mats.metallic('#f59e0b', 0.22, 0.72)
    : mats.glossy('#f8fafc', 0.34, 0.06);
  const skinMat = mats.std(skinColor, 0.52, 0.02);

  rig.shirtMesh.material = shirtMat;
  rig.leftArm.material = shirtMat;
  rig.rightArm.material = shirtMat;
  rig.leftLeg.material = pantsMat;
  rig.rightLeg.material = pantsMat;

  for (const s of rig.skinMeshes) s.material = skinMat;
  for (const sh of rig.shoeMeshes) sh.material = shoeMat;

  // Greedy proportions & scalloped bib
  if (opts.isGreedy) {
    rig.shirtMesh.scale.set(1.22, 1.04, 1.12);
    rig.leftArm.position.x = -0.39;
    rig.rightArm.position.x = 0.39;
  } else {
    rig.shirtMesh.scale.set(1.06, 1.0, 0.94);
    rig.leftArm.position.x = -0.34;
    rig.rightArm.position.x = 0.34;
  }
  rig.greedyBibGroup.visible = opts.isGreedy;

  // Golden crown + aura ring
  rig.auraRing.visible = opts.isGolden;
  if (opts.isGolden) {
    rig.auraRing.material = mats.basicMat('#facc15', 0.8, false);
  }
  clearAnchorGroup(rig.hatAnchor);
  if (opts.isGolden) {
    rig.hatAnchor.add(buildGoldenMiniCrown(mats, geos));
  }

  // Hair update
  clearAnchorGroup(rig.hairGroup);
  rig.hairGroup.add(buildHairStyleMeshes(hairStyle, opts.hairColor, mats, geos));
  rig.hairGroup.scale.setScalar(1);
  rig.hairStyle = hairStyle;
  rig.baseShirtColor = opts.isGolden ? '#facc15' : opts.shirtColor;
  rig.baseSleeveColor = rig.baseShirtColor;

  // Reset facial expression & pose
  rig.eyelids.visible = false;
  rig.eyelids.scale.y = 0.01;
  rig.neutralMouth.visible = true;
  rig.happyMouth.visible = false;
  rig.trayGroup.visible = false;
}

// =========================================================================
// ALL 42 LIVE GEAR VISUAL STYLES (ALL 75 TEMPLATES IN src/data/gear.ts)
// =========================================================================

function buildHeadGearMesh(
  tpl: GearTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): { group: THREE.Group; shrinkHair: boolean } {
  const g = new THREE.Group();
  const isHigh = tpl.rarity === 'ultimate' || tpl.rarity === 'mythic';
  const mainMat =
    tpl.visualStyle === 'crown' || tpl.visualStyle === 'crown_helm'
      ? mats.metallic(tpl.color, 0.18, 0.78, isHigh ? tpl.accentColor : undefined, 0.25)
      : mats.glossy(tpl.color, 0.28, isHigh ? 0.3 : 0.1);
  const accMat = isHigh
    ? mats.emissiveGlow(tpl.accentColor, 0.75, 0.2)
    : mats.glossy(tpl.accentColor, 0.25, 0.25);

  let shrinkHair = false;

  switch (tpl.visualStyle) {
    case 'cap': {
      const dome = new THREE.Mesh(
        getGeo(geos, 'gear_cap_dome', () => new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52)),
        mainMat,
      );
      dome.position.y = -0.02;
      const bill = new THREE.Mesh(
        getGeo(geos, 'gear_cap_bill', () => createRoundedBoxGeometry(0.38, 0.055, 0.28, 1, 0.025)),
        accMat,
      );
      bill.position.set(0, 0.01, 0.28);
      bill.rotation.x = 0.12;
      const capBand = new THREE.Mesh(
        getGeo(geos, 'gear_cap_band', () => new THREE.TorusGeometry(0.355, 0.032, 6, 16)),
        accMat,
      );
      capBand.rotation.x = Math.PI / 2;
      capBand.position.y = 0.03;
      const btn = new THREE.Mesh(
        getGeo(geos, 'gear_cap_btn', () => new THREE.SphereGeometry(0.052, 8, 6)),
        accMat,
      );
      btn.position.y = 0.35;
      const badge = new THREE.Mesh(
        getGeo(geos, 'gear_cap_badge', () => new THREE.CylinderGeometry(0.075, 0.075, 0.032, 10)),
        accMat,
      );
      badge.rotation.x = Math.PI / 2;
      badge.position.set(0, 0.14, 0.34);
      g.add(dome, bill, capBand, btn, badge);

      if (tpl.rarity === 'legendary' || isHigh) {
        const wingGeo = getGeo(geos, 'gear_cap_wing', () => createRoundedBoxGeometry(0.05, 0.12, 0.24, 1, 0.02));
        for (const s of [-1, 1]) {
          const w = new THREE.Mesh(wingGeo, accMat);
          w.position.set(s * 0.38, 0.12, -0.02);
          w.rotation.z = s * -0.35;
          g.add(w);
        }
      }
      break;
    }

    case 'bandana': {
      const wrap = new THREE.Mesh(
        getGeo(geos, 'gear_bandana_wrap', () => new THREE.TorusGeometry(0.355, 0.062, 8, 16)),
        mainMat,
      );
      wrap.rotation.x = Math.PI / 2;
      wrap.position.y = -0.08;
      const crest = new THREE.Mesh(
        getGeo(geos, 'gear_bandana_crest', () => createRoundedBoxGeometry(0.18, 0.10, 0.04, 1, 0.02)),
        accMat,
      );
      crest.position.set(0, -0.08, 0.37);
      const knot = new THREE.Mesh(
        getGeo(geos, 'gear_bandana_knot', () => new THREE.SphereGeometry(0.075, 8, 6)),
        mainMat,
      );
      knot.position.set(0.16, -0.09, -0.34);
      const tailGeo = getGeo(geos, 'gear_bandana_tail', () => createRoundedBoxGeometry(0.07, 0.24, 0.03, 1, 0.012));
      const t1 = new THREE.Mesh(tailGeo, mainMat);
      t1.position.set(0.24, -0.19, -0.39);
      t1.rotation.set(0.25, 0.2, 0.42);
      const t2 = new THREE.Mesh(tailGeo, accMat);
      t2.position.set(0.11, -0.22, -0.38);
      t2.rotation.set(0.35, -0.15, 0.12);
      g.add(wrap, crest, knot, t1, t2);
      break;
    }

    case 'visor': {
      const band = new THREE.Mesh(
        getGeo(geos, 'gear_visor_band', () => new THREE.TorusGeometry(0.355, 0.048, 8, 16)),
        mainMat,
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.05;
      const bill = new THREE.Mesh(
        getGeo(geos, 'gear_visor_bill', () => createRoundedBoxGeometry(0.46, 0.048, 0.30, 1, 0.022)),
        accMat,
      );
      bill.position.set(0, -0.04, 0.31);
      bill.rotation.x = 0.08;
      const studGeo = getGeo(geos, 'gear_visor_stud', () => new THREE.SphereGeometry(0.035, 8, 6));
      for (const s of [-1, 1]) {
        const stud = new THREE.Mesh(studGeo, mats.metallic('#e2e8f0'));
        stud.position.set(s * 0.36, -0.05, 0.10);
        g.add(stud);
      }
      g.add(band, bill);
      break;
    }

    case 'toque': {
      const toque = buildDefaultChefToque(mats, geos, 1.05, tpl.accentColor);
      toque.children[0].castShadow = true;
      g.add(toque);
      break;
    }

    case 'beret': {
      const tilt = new THREE.Group();
      tilt.rotation.z = -0.22;
      const puff = new THREE.Mesh(
        getGeo(geos, 'gear_beret_puff', () => new THREE.SphereGeometry(0.36, 12, 8)),
        mainMat,
      );
      puff.scale.set(1.12, 0.44, 1.12);
      puff.position.set(0.04, 0.10, 0);
      const rim = new THREE.Mesh(
        getGeo(geos, 'gear_beret_rim', () => new THREE.TorusGeometry(0.30, 0.034, 6, 16)),
        accMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0.02, -0.02, 0);
      const stem = new THREE.Mesh(
        getGeo(geos, 'gear_beret_stem', () => new THREE.CylinderGeometry(0.022, 0.032, 0.09, 8)),
        mainMat,
      );
      stem.position.set(0.04, 0.28, 0);
      tilt.add(puff, rim, stem);
      g.add(tilt);
      break;
    }

    case 'hood': {
      shrinkHair = true;
      const cowl = new THREE.Mesh(
        getGeo(geos, 'gear_hood_cowl', () => new THREE.SphereGeometry(0.415, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.72)),
        mainMat,
      );
      cowl.position.set(0, -0.08, -0.04);
      const tail = new THREE.Mesh(
        getGeo(geos, 'gear_hood_tail', () => new THREE.ConeGeometry(0.22, 0.38, 8)),
        mainMat,
      );
      tail.position.set(0, 0.06, -0.34);
      tail.rotation.x = -1.05;
      const trim = new THREE.Mesh(
        getGeo(geos, 'gear_hood_trim', () => new THREE.TorusGeometry(0.36, 0.036, 6, 16)),
        accMat,
      );
      trim.position.set(0, -0.04, 0.15);
      g.add(cowl, tail, trim);
      break;
    }

    case 'tall_toque': {
      const brim = new THREE.Mesh(
        getGeo(geos, 'gear_tall_brim', () => new THREE.CylinderGeometry(0.37, 0.37, 0.05, 14)),
        mainMat,
      );
      brim.position.y = 0.0;
      const crown = new THREE.Mesh(
        getGeo(geos, 'gear_tall_crown', () => new THREE.CylinderGeometry(0.31, 0.25, 0.48, 12)),
        mainMat,
      );
      crown.position.y = 0.25;
      const belt = new THREE.Mesh(
        getGeo(geos, 'gear_tall_belt', () => new THREE.CylinderGeometry(0.285, 0.275, 0.09, 12)),
        accMat,
      );
      belt.position.y = 0.12;
      const medal = new THREE.Mesh(
        getGeo(geos, 'gear_tall_medal', () => new THREE.OctahedronGeometry(0.085, 0)),
        accMat,
      );
      medal.position.set(0, 0.15, 0.29);
      const topCap = new THREE.Mesh(
        getGeo(geos, 'gear_tall_cap', () => new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)),
        mainMat,
      );
      topCap.position.y = 0.46;
      g.add(brim, crown, belt, medal, topCap);
      break;
    }

    case 'goggles': {
      const strap = new THREE.Mesh(
        getGeo(geos, 'gear_gog_strap', () => new THREE.TorusGeometry(0.355, 0.042, 6, 16)),
        mainMat,
      );
      strap.rotation.x = Math.PI / 2;
      strap.position.y = -0.04;
      const bezelGeo = getGeo(geos, 'gear_gog_bezel', () => new THREE.CylinderGeometry(0.115, 0.115, 0.10, 12));
      const lensGeo = getGeo(geos, 'gear_gog_lens', () => new THREE.SphereGeometry(0.095, 10, 8));
      const lensMat = mats.emissiveGlow(tpl.accentColor, 0.9, 0.12);
      for (const s of [-1, 1]) {
        const bez = new THREE.Mesh(bezelGeo, mats.metallic(tpl.color, 0.24, 0.65));
        bez.rotation.x = Math.PI / 2;
        bez.position.set(s * 0.145, -0.02, 0.33);
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.scale.set(1, 1, 0.55);
        lens.position.set(s * 0.145, -0.02, 0.365);
        g.add(bez, lens);
      }
      const bridge = new THREE.Mesh(
        getGeo(geos, 'gear_gog_bridge', () => createRoundedBoxGeometry(0.14, 0.045, 0.05, 1, 0.015)),
        mainMat,
      );
      bridge.position.set(0, -0.02, 0.35);
      g.add(strap, bridge);
      break;
    }

    case 'helmet': {
      shrinkHair = true;
      const shell = new THREE.Mesh(
        getGeo(geos, 'gear_helm_shell', () => new THREE.SphereGeometry(0.405, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.64)),
        mainMat,
      );
      shell.position.y = -0.10;
      const rim = new THREE.Mesh(
        getGeo(geos, 'gear_helm_rim', () => new THREE.TorusGeometry(0.40, 0.04, 6, 16)),
        mats.metallic(tpl.color, 0.25, 0.6),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.04;
      const fin = new THREE.Mesh(
        getGeo(geos, 'gear_helm_fin', () => createRoundedBoxGeometry(0.08, 0.20, 0.44, 1, 0.03)),
        accMat,
      );
      fin.position.set(0, 0.26, 0);
      const lamp = new THREE.Mesh(
        getGeo(geos, 'gear_helm_lamp', () => new THREE.CylinderGeometry(0.09, 0.10, 0.10, 12)),
        mats.emissiveGlow(tpl.accentColor, 1.0, 0.15),
      );
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, 0.10, 0.38);
      const guardGeo = getGeo(geos, 'gear_helm_guard', () => createRoundedBoxGeometry(0.08, 0.22, 0.18, 1, 0.025));
      for (const s of [-1, 1]) {
        const guard = new THREE.Mesh(guardGeo, mainMat);
        guard.position.set(s * 0.39, -0.08, 0);
        g.add(guard);
      }
      g.add(shell, rim, fin, lamp);
      break;
    }

    case 'visor_helm': {
      shrinkHair = true;
      const dome = new THREE.Mesh(
        getGeo(geos, 'gear_vhelm_dome', () => new THREE.SphereGeometry(0.42, 14, 12)),
        mainMat,
      );
      dome.position.y = -0.12;
      const visor = new THREE.Mesh(
        getGeo(geos, 'gear_vhelm_visor', () => new THREE.SphereGeometry(0.432, 12, 8, -0.78, 1.56, 0.95, 0.82)),
        mats.emissiveGlow(tpl.accentColor, 0.85, 0.12),
      );
      visor.position.y = -0.12;
      visor.rotation.y = Math.PI / 2;
      const collar = new THREE.Mesh(
        getGeo(geos, 'gear_vhelm_collar', () => new THREE.TorusGeometry(0.32, 0.048, 6, 16)),
        mats.metallic('#e2e8f0'),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = -0.34;
      const antGeo = getGeo(geos, 'gear_vhelm_ant', () => new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6));
      const orbGeo = getGeo(geos, 'gear_vhelm_orb', () => new THREE.SphereGeometry(0.042, 8, 6));
      for (const s of [-1, 1]) {
        const ant = new THREE.Mesh(antGeo, mats.metallic('#e2e8f0'));
        ant.position.set(s * 0.38, 0.08, -0.04);
        const orb = new THREE.Mesh(orbGeo, accMat);
        orb.position.set(s * 0.38, 0.22, -0.04);
        g.add(ant, orb);
      }
      g.add(dome, visor, collar);
      break;
    }

    case 'crown': {
      const band = new THREE.Mesh(
        getGeo(geos, 'gear_crown_band', () => new THREE.CylinderGeometry(0.32, 0.27, 0.20, 10)),
        mainMat,
      );
      band.position.y = 0.08;
      const velvet = new THREE.Mesh(
        getGeo(geos, 'gear_crown_velvet', () => new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        mats.glossy(tpl.accentColor, 0.45, 0.05),
      );
      velvet.position.y = 0.10;
      const spikeGeo = getGeo(geos, 'gear_crown_spike', () => new THREE.ConeGeometry(0.075, 0.22, 5));
      const pearlGeo = getGeo(geos, 'gear_crown_pearl', () => new THREE.SphereGeometry(0.032, 6, 6));
      const pearlMat = mats.glossy('#fffbeb', 0.18, 0.15);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = new THREE.Mesh(spikeGeo, mainMat);
        sp.position.set(Math.sin(a) * 0.26, 0.24, Math.cos(a) * 0.26);
        const pr = new THREE.Mesh(pearlGeo, pearlMat);
        pr.position.set(Math.sin(a) * 0.26, 0.36, Math.cos(a) * 0.26);
        g.add(sp, pr);
      }
      const jewel = new THREE.Mesh(
        getGeo(geos, 'gear_crown_jewel', () => new THREE.OctahedronGeometry(0.072, 0)),
        accMat,
      );
      jewel.position.set(0, 0.10, 0.31);
      g.add(band, velvet, jewel);
      break;
    }

    case 'crown_helm': {
      shrinkHair = true;
      const shell = new THREE.Mesh(
        getGeo(geos, 'gear_chelm_shell', () => new THREE.SphereGeometry(0.41, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)),
        mainMat,
      );
      shell.position.y = -0.10;
      const diadem = new THREE.Mesh(
        getGeo(geos, 'gear_chelm_diadem', () => new THREE.OctahedronGeometry(0.11, 0)),
        accMat,
      );
      diadem.position.set(0, 0.16, 0.37);
      const wingGeo = getGeo(geos, 'gear_chelm_feather', () => createRoundedBoxGeometry(0.06, 0.24, 0.12, 1, 0.02));
      for (const s of [-1, 1]) {
        for (let f = 0; f < 3; f++) {
          const feather = new THREE.Mesh(wingGeo, accMat);
          feather.position.set(s * (0.42 + f * 0.08), 0.06 + f * 0.11, -0.06 - f * 0.04);
          feather.rotation.z = s * (-0.35 - f * 0.16);
          g.add(feather);
        }
      }
      const halo = new THREE.Mesh(
        getGeo(geos, 'gear_chelm_halo', () => new THREE.TorusGeometry(0.24, 0.024, 8, 18)),
        accMat,
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.42;
      g.add(shell, diadem, halo);
      break;
    }

    default: {
      const fallback = new THREE.Mesh(
        getGeo(geos, 'gear_head_fallback', () => new THREE.CylinderGeometry(0.30, 0.28, 0.22, 12)),
        mainMat,
      );
      fallback.position.y = 0.11;
      g.add(fallback);
      break;
    }
  }

  // Canonical rarity shimmer accent for Legendary / Ultimate / Mythic headgear
  const rarityShimmer = RARITY_SHIMMER_PALETTE[tpl.rarity];
  if (rarityShimmer.hasShimmer) {
    const gemGeo = getGeo(geos, 'gear_rarity_star', () => new THREE.OctahedronGeometry(0.048, 0));
    const shimmerMat = mats.emissiveGlow(rarityShimmer.primary, 0.92, 0.14);
    const spark = new THREE.Mesh(gemGeo, shimmerMat);
    spark.position.set(0.26, 0.34, 0.14);
    g.add(spark);
    if (tpl.rarity === 'mythic') {
      const goldSpark = new THREE.Mesh(gemGeo, mats.emissiveGlow('#FEF08A', 0.95, 0.12));
      goldSpark.scale.setScalar(0.75);
      goldSpark.position.set(-0.26, 0.36, 0.12);
      g.add(goldSpark);
    }
  }

  enableShadows(g, true, true);
  return { group: g, shrinkHair };
}

function applyBodyGearStyle(
  rig: CharacterRig,
  tpl: GearTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): void {
  const isHigh = tpl.rarity === 'ultimate' || tpl.rarity === 'mythic';
  const bodyMat =
    tpl.visualStyle === 'armor'
      ? mats.metallic(tpl.color, 0.26, 0.58)
      : tpl.visualStyle === 'mythic_armor'
        ? mats.metallic(tpl.color, 0.16, 0.78, tpl.accentColor, 0.22)
        : mats.glossy(tpl.color, 0.36, 0.08);
  const accMat = isHigh
    ? mats.emissiveGlow(tpl.accentColor, 0.8, 0.2)
    : mats.glossy(tpl.accentColor, 0.28, 0.16);

  // Recolor shirt & sleeves per style rules
  if (tpl.visualStyle === 'apron') {
    const creamUnder = mats.glossy('#fffbf0', 0.4, 0.02);
    rig.shirtMesh.material = creamUnder;
    rig.leftArm.material = creamUnder;
    rig.rightArm.material = creamUnder;
  } else if (tpl.visualStyle === 'vest') {
    const whiteSleeve = mats.glossy('#f8fafc', 0.38, 0.04);
    rig.shirtMesh.material = bodyMat;
    rig.leftArm.material = whiteSleeve;
    rig.rightArm.material = whiteSleeve;
  } else {
    rig.shirtMesh.material = bodyMat;
    rig.leftArm.material = bodyMat;
    rig.rightArm.material = bodyMat;
  }

  rig.defaultApronGroup.visible = false;

  const g = new THREE.Group();

  switch (tpl.visualStyle) {
    case 'apron': {
      const bib = new THREE.Mesh(
        getGeo(geos, 'gear_apron_bib', () => createRoundedBoxGeometry(0.42, 0.44, 0.12, 1, 0.04)),
        bodyMat,
      );
      bib.position.set(0, 0.56, 0.22);
      const strap = new THREE.Mesh(
        getGeo(geos, 'gear_apron_strap', () => new THREE.TorusGeometry(0.18, 0.022, 6, 12)),
        bodyMat,
      );
      strap.rotation.x = Math.PI / 2 + 0.18;
      strap.position.set(0, 0.84, 0);
      const pocket = new THREE.Mesh(
        getGeo(geos, 'gear_apron_pocket', () => createRoundedBoxGeometry(0.24, 0.14, 0.05, 1, 0.02)),
        accMat,
      );
      pocket.position.set(0, 0.48, 0.27);
      const bow = new THREE.Mesh(
        getGeo(geos, 'gear_apron_bow', () => createRoundedBoxGeometry(0.22, 0.10, 0.08, 1, 0.03)),
        accMat,
      );
      bow.position.set(0, 0.50, -0.26);
      g.add(bib, strap, pocket, bow);
      break;
    }

    case 'tee': {
      const collar = new THREE.Mesh(
        getGeo(geos, 'gear_tee_collar', () => new THREE.TorusGeometry(0.18, 0.032, 6, 14)),
        accMat,
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.85, 0);
      const stripe = new THREE.Mesh(
        getGeo(geos, 'gear_tee_stripe', () => new THREE.CylinderGeometry(0.265, 0.265, 0.10, 14)),
        accMat,
      );
      stripe.position.set(0, 0.64, 0);
      const patch = new THREE.Mesh(
        getGeo(geos, 'gear_tee_patch', () => new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10)),
        mats.glossy('#ffffff', 0.35, 0.05),
      );
      patch.rotation.x = Math.PI / 2;
      patch.position.set(0.10, 0.72, 0.24);
      g.add(collar, stripe, patch);
      break;
    }

    case 'vest': {
      const lapelGeo = getGeo(geos, 'gear_vest_lapel', () => createRoundedBoxGeometry(0.17, 0.40, 0.10, 1, 0.03));
      for (const s of [-1, 1]) {
        const lap = new THREE.Mesh(lapelGeo, bodyMat);
        lap.position.set(s * 0.13, 0.63, 0.21);
        g.add(lap);
      }
      const placket = new THREE.Mesh(
        getGeo(geos, 'gear_vest_placket', () => createRoundedBoxGeometry(0.09, 0.38, 0.07, 1, 0.02)),
        mats.glossy('#ffffff', 0.38, 0.02),
      );
      placket.position.set(0, 0.63, 0.21);
      const pocketSq = new THREE.Mesh(
        getGeo(geos, 'gear_vest_sq', () => createRoundedBoxGeometry(0.09, 0.07, 0.03, 1, 0.01)),
        accMat,
      );
      pocketSq.position.set(-0.13, 0.72, 0.26);
      const btnGeo = getGeo(geos, 'gear_vest_btn', () => new THREE.SphereGeometry(0.022, 6, 6));
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(btnGeo, mats.metallic('#e2e8f0'));
        b.position.set(0, 0.54 + i * 0.09, 0.25);
        g.add(b);
      }
      g.add(placket, pocketSq);
      break;
    }

    case 'jacket': {
      const collar = new THREE.Mesh(
        getGeo(geos, 'gear_jkt_collar', () => new THREE.CylinderGeometry(0.19, 0.20, 0.09, 12)),
        accMat,
      );
      collar.position.set(0, 0.86, 0);
      const sash = new THREE.Mesh(
        getGeo(geos, 'gear_jkt_sash', () => createRoundedBoxGeometry(0.56, 0.08, 0.08, 1, 0.025)),
        accMat,
      );
      sash.position.set(0, 0.66, 0.22);
      sash.rotation.z = -0.78;
      const vialGeo = getGeo(geos, 'gear_jkt_vial', () => new THREE.CylinderGeometry(0.025, 0.025, 0.11, 8));
      for (let i = -1; i <= 1; i++) {
        const vial = new THREE.Mesh(vialGeo, mats.emissiveGlow(tpl.accentColor, 0.55, 0.2));
        vial.position.set(i * 0.11, 0.66 - i * 0.10, 0.27);
        g.add(vial);
      }
      g.add(collar, sash);
      break;
    }

    case 'tux': {
      const vShirt = new THREE.Mesh(
        getGeo(geos, 'gear_tux_v', () => new THREE.ConeGeometry(0.16, 0.32, 4)),
        mats.glossy('#ffffff', 0.35, 0.04),
      );
      vShirt.rotation.x = Math.PI;
      vShirt.position.set(0, 0.70, 0.22);
      const wingGeo = getGeo(geos, 'gear_tux_bow', () => new THREE.ConeGeometry(0.055, 0.11, 6));
      const bwL = new THREE.Mesh(wingGeo, accMat);
      bwL.rotation.z = -Math.PI / 2;
      bwL.position.set(-0.055, 0.84, 0.26);
      const bwR = new THREE.Mesh(wingGeo, accMat);
      bwR.rotation.z = Math.PI / 2;
      bwR.position.set(0.055, 0.84, 0.26);
      const tailGeo = getGeo(geos, 'gear_tux_tail', () => createRoundedBoxGeometry(0.18, 0.30, 0.06, 1, 0.02));
      for (const s of [-1, 1]) {
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.position.set(s * 0.12, 0.38, -0.24);
        tail.rotation.x = 0.22;
        g.add(tail);
      }
      g.add(vShirt, bwL, bwR);
      break;
    }

    case 'kimono': {
      const wrapGeo = getGeo(geos, 'gear_kim_wrap', () => createRoundedBoxGeometry(0.10, 0.42, 0.08, 1, 0.025));
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(wrapGeo, accMat);
        w.position.set(s * 0.08, 0.68, 0.23);
        w.rotation.z = s * 0.52;
        g.add(w);
      }
      const obi = new THREE.Mesh(
        getGeo(geos, 'gear_kim_obi', () => new THREE.CylinderGeometry(0.285, 0.285, 0.16, 14)),
        accMat,
      );
      obi.position.set(0, 0.50, 0);
      const obiBow = new THREE.Mesh(
        getGeo(geos, 'gear_kim_bow', () => createRoundedBoxGeometry(0.32, 0.22, 0.12, 1, 0.04)),
        accMat,
      );
      obiBow.position.set(0, 0.50, -0.30);
      const beltTail = new THREE.Mesh(
        getGeo(geos, 'gear_kim_tail', () => createRoundedBoxGeometry(0.10, 0.24, 0.05, 1, 0.02)),
        accMat,
      );
      beltTail.position.set(0.08, 0.36, 0.26);
      g.add(obi, obiBow, beltTail);
      break;
    }

    case 'armor': {
      const plate = new THREE.Mesh(
        getGeo(geos, 'gear_arm_plate', () => createRoundedBoxGeometry(0.48, 0.38, 0.16, 2, 0.05)),
        bodyMat,
      );
      plate.position.set(0, 0.66, 0.18);
      const core = new THREE.Mesh(
        getGeo(geos, 'gear_arm_core', () => new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12)),
        accMat,
      );
      core.rotation.x = Math.PI / 2;
      core.position.set(0, 0.67, 0.27);
      const pauldronGeo = getGeo(geos, 'gear_arm_pauldron', () => new THREE.SphereGeometry(0.16, 10, 8));
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(pauldronGeo, bodyMat);
        p.position.set(s * 0.37, 0.82, 0);
        g.add(p);
      }
      const belt = new THREE.Mesh(
        getGeo(geos, 'gear_arm_belt', () => new THREE.CylinderGeometry(0.28, 0.28, 0.10, 12)),
        mats.std('#3d2314', 0.45, 0.2),
      );
      belt.position.set(0, 0.46, 0);
      g.add(plate, core, belt);
      break;
    }

    case 'cape': {
      const furCollar = new THREE.Mesh(
        getGeo(geos, 'gear_cape_fur', () => new THREE.TorusGeometry(0.24, 0.075, 8, 16)),
        mats.glossy('#fffbeb', 0.45, 0.04),
      );
      furCollar.rotation.x = Math.PI / 2;
      furCollar.position.set(0, 0.84, 0);
      const claspGeo = getGeo(geos, 'gear_cape_clasp', () => new THREE.SphereGeometry(0.052, 8, 6));
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(claspGeo, accMat);
        c.position.set(s * 0.16, 0.82, 0.22);
        g.add(c);
      }
      const capeMesh = new THREE.Mesh(
        getGeo(geos, 'gear_cape_drape', () => createRoundedBoxGeometry(0.62, 0.68, 0.07, 1, 0.03)),
        bodyMat,
      );
      capeMesh.position.set(0, 0.52, -0.32);
      capeMesh.rotation.x = 0.24;
      const hem = new THREE.Mesh(
        getGeo(geos, 'gear_cape_hem', () => createRoundedBoxGeometry(0.64, 0.09, 0.08, 1, 0.025)),
        accMat,
      );
      hem.position.set(0, 0.22, -0.40);
      hem.rotation.x = 0.24;
      g.add(furCollar, capeMesh, hem);
      break;
    }

    case 'mythic_armor': {
      const plate = new THREE.Mesh(
        getGeo(geos, 'gear_marm_plate', () => createRoundedBoxGeometry(0.50, 0.42, 0.18, 2, 0.05)),
        bodyMat,
      );
      plate.position.set(0, 0.66, 0.18);
      const crest = new THREE.Mesh(
        getGeo(geos, 'gear_marm_crest', () => new THREE.OctahedronGeometry(0.11, 0)),
        accMat,
      );
      crest.position.set(0, 0.68, 0.29);
      const paulGeo = getGeo(geos, 'gear_marm_paul', () => new THREE.SphereGeometry(0.185, 10, 8));
      const finGeo = getGeo(geos, 'gear_marm_fin', () => createRoundedBoxGeometry(0.06, 0.22, 0.18, 1, 0.02));
      const wingGeo = getGeo(geos, 'gear_marm_wing', () => createRoundedBoxGeometry(0.10, 0.48, 0.05, 1, 0.02));
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(paulGeo, bodyMat);
        p.position.set(s * 0.40, 0.84, 0);
        const f = new THREE.Mesh(finGeo, accMat);
        f.position.set(s * 0.45, 0.94, 0);
        f.rotation.z = s * -0.45;
        const w = new THREE.Mesh(wingGeo, accMat);
        w.position.set(s * 0.34, 0.78, -0.28);
        w.rotation.z = s * -0.52;
        g.add(p, f, w);
      }
      const tasset = new THREE.Mesh(
        getGeo(geos, 'gear_marm_tasset', () => createRoundedBoxGeometry(0.46, 0.14, 0.32, 1, 0.04)),
        accMat,
      );
      tasset.position.set(0, 0.42, 0.04);
      g.add(plate, crest, tasset);
      break;
    }

    default: {
      const belt = new THREE.Mesh(
        getGeo(geos, 'gear_body_fallback', () => new THREE.CylinderGeometry(0.28, 0.28, 0.10, 12)),
        accMat,
      );
      belt.position.y = 0.52;
      g.add(belt);
      break;
    }
  }

  // Canonical rarity glow trim for Legendary / Ultimate / Mythic outfits
  const bodyShimmer = RARITY_SHIMMER_PALETTE[tpl.rarity];
  if (bodyShimmer.hasShimmer) {
    const trimRing = new THREE.Mesh(
      getGeo(geos, 'gear_body_rarity_trim', () => new THREE.TorusGeometry(0.285, 0.018, 6, 16)),
      mats.emissiveGlow(bodyShimmer.primary, 0.85, 0.16),
    );
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.set(0, 0.43, 0);
    g.add(trimRing);
  }

  enableShadows(g, true, true);
  rig.bodyGearAnchor.add(g);
}

function buildHandToolMesh(
  tpl: GearTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const isHigh = tpl.rarity === 'ultimate' || tpl.rarity === 'mythic';
  const mainMat =
    tpl.visualStyle === 'spatula' ||
    tpl.visualStyle === 'ladle' ||
    tpl.visualStyle === 'cleaver' ||
    tpl.visualStyle === 'sceptre' ||
    tpl.visualStyle === 'mythic_cleaver' ||
    tpl.visualStyle === 'mythic_hammer'
      ? mats.metallic(tpl.color, 0.2, 0.76, isHigh ? tpl.accentColor : undefined, 0.2)
      : mats.glossy(tpl.color, 0.28, 0.14);
  const accMat = isHigh
    ? mats.emissiveGlow(tpl.accentColor, 0.85, 0.18)
    : mats.glossy(tpl.accentColor, 0.25, 0.24);
  const woodMat = mats.std('#78350f', 0.62, 0.04);
  const steelMat = mats.metallic('#e2e8f0', 0.18, 0.82);

  switch (tpl.visualStyle) {
    case 'spoon': {
      const shaft = new THREE.Mesh(
        getGeo(geos, 'tool_spoon_shaft', () => new THREE.CylinderGeometry(0.026, 0.032, 0.44, 8)),
        mainMat,
      );
      shaft.position.y = 0.16;
      const bowl = new THREE.Mesh(
        getGeo(geos, 'tool_spoon_bowl', () => new THREE.SphereGeometry(0.105, 10, 8)),
        mainMat,
      );
      bowl.scale.set(0.85, 1.25, 0.38);
      bowl.position.set(0, 0.42, 0.02);
      const ring = new THREE.Mesh(
        getGeo(geos, 'tool_spoon_ring', () => new THREE.TorusGeometry(0.036, 0.012, 6, 10)),
        accMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      g.add(shaft, bowl, ring);
      break;
    }

    case 'spatula': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_spat_grip', () => new THREE.CylinderGeometry(0.035, 0.035, 0.20, 8)),
        accMat,
      );
      grip.position.y = 0.06;
      const neck = new THREE.Mesh(
        getGeo(geos, 'tool_spat_neck', () => new THREE.CylinderGeometry(0.018, 0.02, 0.18, 8)),
        mainMat,
      );
      neck.position.y = 0.22;
      const blade = new THREE.Mesh(
        getGeo(geos, 'tool_spat_blade', () => createRoundedBoxGeometry(0.19, 0.22, 0.025, 1, 0.01)),
        mainMat,
      );
      blade.position.set(0, 0.39, 0.03);
      blade.rotation.x = 0.22;
      const slotGeo = getGeo(geos, 'tool_spat_slot', () => new THREE.BoxGeometry(0.022, 0.13, 0.032));
      for (const sx of [-0.04, 0.04]) {
        const sl = new THREE.Mesh(slotGeo, accMat);
        sl.position.set(sx, 0.39, 0.03);
        sl.rotation.x = 0.22;
        g.add(sl);
      }
      g.add(grip, neck, blade);
      break;
    }

    case 'whisk': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_whisk_grip', () => new THREE.CylinderGeometry(0.042, 0.038, 0.22, 10)),
        mainMat,
      );
      grip.position.y = 0.06;
      const wireGeo = getGeo(geos, 'tool_whisk_wire', () => new THREE.TorusGeometry(0.095, 0.012, 6, 14));
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(wireGeo, steelMat);
        w.scale.set(0.75, 1.4, 0.75);
        w.position.y = 0.30;
        w.rotation.y = (i * Math.PI) / 3;
        g.add(w);
      }
      g.add(grip);
      break;
    }

    case 'ladle': {
      const handle = new THREE.Mesh(
        getGeo(geos, 'tool_ladle_handle', () => new THREE.CylinderGeometry(0.022, 0.025, 0.46, 8)),
        mainMat,
      );
      handle.position.y = 0.18;
      const cup = new THREE.Mesh(
        getGeo(geos, 'tool_ladle_cup', () => new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)),
        mainMat,
      );
      cup.position.set(0, 0.44, 0.08);
      const broth = new THREE.Mesh(
        getGeo(geos, 'tool_ladle_broth', () => new THREE.CircleGeometry(0.105, 12)),
        accMat,
      );
      broth.rotation.x = -Math.PI / 2;
      broth.position.set(0, 0.43, 0.08);
      g.add(handle, cup, broth);
      break;
    }

    case 'knife': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_knife_grip', () => createRoundedBoxGeometry(0.055, 0.18, 0.07, 1, 0.02)),
        mainMat,
      );
      grip.position.y = 0.06;
      const guard = new THREE.Mesh(
        getGeo(geos, 'tool_knife_guard', () => createRoundedBoxGeometry(0.08, 0.03, 0.10, 1, 0.01)),
        steelMat,
      );
      guard.position.y = 0.16;
      const blade = new THREE.Mesh(
        getGeo(geos, 'tool_knife_blade', () => new THREE.ConeGeometry(0.075, 0.36, 4)),
        steelMat,
      );
      blade.scale.set(0.28, 1, 1);
      blade.position.y = 0.36;
      g.add(grip, guard, blade);
      break;
    }

    case 'pan': {
      const handle = new THREE.Mesh(
        getGeo(geos, 'tool_pan_handle', () => new THREE.CylinderGeometry(0.028, 0.032, 0.26, 8)),
        woodMat,
      );
      handle.position.y = 0.08;
      const bowl = new THREE.Mesh(
        getGeo(geos, 'tool_pan_bowl', () => new THREE.CylinderGeometry(0.22, 0.14, 0.09, 14)),
        mainMat,
      );
      bowl.rotation.x = Math.PI / 2;
      bowl.position.set(0, 0.36, 0.04);
      const rim = new THREE.Mesh(
        getGeo(geos, 'tool_pan_rim', () => new THREE.TorusGeometry(0.17, 0.02, 6, 14)),
        accMat,
      );
      rim.position.set(0, 0.36, 0.08);
      g.add(handle, bowl, rim);
      break;
    }

    case 'torch': {
      const tank = new THREE.Mesh(
        getGeo(geos, 'tool_torch_tank', () => new THREE.CylinderGeometry(0.075, 0.08, 0.28, 10)),
        mainMat,
      );
      tank.position.y = 0.12;
      const nozzle = new THREE.Mesh(
        getGeo(geos, 'tool_torch_noz', () => new THREE.CylinderGeometry(0.022, 0.032, 0.14, 8)),
        mats.metallic('#eab308'),
      );
      nozzle.rotation.x = Math.PI / 3;
      nozzle.position.set(0, 0.28, 0.08);
      const flame = new THREE.Mesh(
        getGeo(geos, 'tool_torch_flame', () => new THREE.ConeGeometry(0.055, 0.18, 8)),
        mats.emissiveGlow(tpl.accentColor, 1.0, 0.15),
      );
      flame.rotation.x = Math.PI / 3;
      flame.position.set(0, 0.35, 0.20);
      g.add(tank, nozzle, flame);
      break;
    }

    case 'wheel': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_wheel_grip', () => new THREE.CylinderGeometry(0.038, 0.034, 0.22, 8)),
        mainMat,
      );
      grip.position.y = 0.08;
      const disc = new THREE.Mesh(
        getGeo(geos, 'tool_wheel_disc', () => new THREE.CylinderGeometry(0.135, 0.135, 0.022, 16)),
        steelMat,
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.y = 0.32;
      const axle = new THREE.Mesh(
        getGeo(geos, 'tool_wheel_axle', () => new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8)),
        mainMat,
      );
      axle.rotation.z = Math.PI / 2;
      axle.position.y = 0.32;
      g.add(grip, disc, axle);
      break;
    }

    case 'pin': {
      const barrel = new THREE.Mesh(
        getGeo(geos, 'tool_pin_barrel', () => new THREE.CylinderGeometry(0.072, 0.072, 0.36, 12)),
        mainMat,
      );
      barrel.rotation.z = Math.PI / 2;
      barrel.position.y = 0.22;
      const endGeo = getGeo(geos, 'tool_pin_end', () => new THREE.CylinderGeometry(0.034, 0.034, 0.12, 8));
      for (const s of [-1, 1]) {
        const end = new THREE.Mesh(endGeo, accMat);
        end.rotation.z = Math.PI / 2;
        end.position.set(s * 0.23, 0.22, 0);
        g.add(end);
      }
      g.add(barrel);
      break;
    }

    case 'grinder': {
      const base = new THREE.Mesh(
        getGeo(geos, 'tool_gr_base', () => new THREE.CylinderGeometry(0.055, 0.085, 0.18, 10)),
        mainMat,
      );
      base.position.y = 0.09;
      const waist = new THREE.Mesh(
        getGeo(geos, 'tool_gr_waist', () => new THREE.CylinderGeometry(0.075, 0.055, 0.18, 10)),
        mainMat,
      );
      waist.position.y = 0.26;
      const cap = new THREE.Mesh(
        getGeo(geos, 'tool_gr_cap', () => new THREE.SphereGeometry(0.076, 10, 8)),
        mainMat,
      );
      cap.position.y = 0.36;
      const knob = new THREE.Mesh(
        getGeo(geos, 'tool_gr_knob', () => new THREE.SphereGeometry(0.034, 8, 6)),
        mats.metallic(tpl.accentColor),
      );
      knob.position.y = 0.44;
      const collar = new THREE.Mesh(
        getGeo(geos, 'tool_gr_collar', () => new THREE.TorusGeometry(0.08, 0.016, 6, 12)),
        mats.metallic(tpl.accentColor),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.02;
      g.add(base, waist, cap, knob, collar);
      break;
    }

    case 'cleaver': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_clv_grip', () => createRoundedBoxGeometry(0.055, 0.19, 0.075, 1, 0.02)),
        woodMat,
      );
      grip.position.y = 0.06;
      const blade = new THREE.Mesh(
        getGeo(geos, 'tool_clv_blade', () => createRoundedBoxGeometry(0.032, 0.34, 0.22, 1, 0.012)),
        mainMat,
      );
      blade.position.set(0, 0.33, 0.04);
      const spine = new THREE.Mesh(
        getGeo(geos, 'tool_clv_spine', () => createRoundedBoxGeometry(0.04, 0.34, 0.035, 1, 0.01)),
        accMat,
      );
      spine.position.set(0, 0.33, -0.06);
      const eye = new THREE.Mesh(
        getGeo(geos, 'tool_clv_eye', () => new THREE.TorusGeometry(0.028, 0.01, 6, 10)),
        accMat,
      );
      eye.rotation.y = Math.PI / 2;
      eye.position.set(0, 0.44, 0.09);
      g.add(grip, blade, spine, eye);
      break;
    }

    case 'sticks': {
      const stickGeo = getGeo(geos, 'tool_stick', () => new THREE.ConeGeometry(0.022, 0.56, 6));
      const wrapGeo = getGeo(geos, 'tool_stick_wrap', () => new THREE.CylinderGeometry(0.026, 0.026, 0.14, 6));
      for (const s of [-1, 1]) {
        const sub = new THREE.Group();
        sub.rotation.z = s * 0.14;
        sub.position.x = s * 0.03;
        const st = new THREE.Mesh(stickGeo, mainMat);
        st.position.y = 0.26;
        const wr = new THREE.Mesh(wrapGeo, accMat);
        wr.position.y = 0.08;
        sub.add(st, wr);
        g.add(sub);
      }
      break;
    }

    case 'pickaxe': {
      const shaft = new THREE.Mesh(
        getGeo(geos, 'tool_pick_shaft', () => new THREE.CylinderGeometry(0.03, 0.034, 0.52, 8)),
        woodMat,
      );
      shaft.position.y = 0.22;
      const socket = new THREE.Mesh(
        getGeo(geos, 'tool_pick_sock', () => createRoundedBoxGeometry(0.11, 0.11, 0.11, 1, 0.025)),
        accMat,
      );
      socket.position.y = 0.45;
      const bladeGeo = getGeo(geos, 'tool_pick_blade', () => new THREE.ConeGeometry(0.065, 0.28, 5));
      const pickMat = mats.emissiveGlow(tpl.color, 0.78, 0.18);
      for (const s of [-1, 1]) {
        const bl = new THREE.Mesh(bladeGeo, pickMat);
        bl.position.set(0, 0.44, s * 0.17);
        bl.rotation.x = s * 1.35;
        g.add(bl);
      }
      g.add(shaft, socket);
      break;
    }

    case 'anchor': {
      const shank = new THREE.Mesh(
        getGeo(geos, 'tool_anc_shank', () => new THREE.CylinderGeometry(0.032, 0.036, 0.48, 8)),
        mainMat,
      );
      shank.position.y = 0.24;
      const stock = new THREE.Mesh(
        getGeo(geos, 'tool_anc_stock', () => createRoundedBoxGeometry(0.28, 0.055, 0.055, 1, 0.02)),
        mainMat,
      );
      stock.position.y = 0.36;
      const ring = new THREE.Mesh(
        getGeo(geos, 'tool_anc_ring', () => new THREE.TorusGeometry(0.07, 0.018, 6, 12)),
        accMat,
      );
      ring.position.y = 0.52;
      const arms = new THREE.Mesh(
        getGeo(geos, 'tool_anc_arms', () => new THREE.TorusGeometry(0.17, 0.032, 6, 12, Math.PI)),
        mainMat,
      );
      arms.rotation.z = Math.PI;
      arms.position.y = 0.18;
      const flukeGeo = getGeo(geos, 'tool_anc_fluke', () => new THREE.ConeGeometry(0.055, 0.12, 4));
      for (const s of [-1, 1]) {
        const fl = new THREE.Mesh(flukeGeo, accMat);
        fl.position.set(s * 0.17, 0.22, 0);
        g.add(fl);
      }
      g.add(shank, stock, ring, arms);
      break;
    }

    case 'raygun': {
      // Counter-rotate inside hand-tool group (which applies rotation.x = +PI/2)
      // so the plasma barrel & emitter aim cleanly forward (+Z) when held!
      const gunGroup = new THREE.Group();
      gunGroup.rotation.x = -Math.PI / 2;
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_ray_grip', () => createRoundedBoxGeometry(0.065, 0.18, 0.09, 1, 0.02)),
        mainMat,
      );
      grip.position.set(0, -0.02, -0.02);
      grip.rotation.x = -0.25;
      const barrel = new THREE.Mesh(
        getGeo(geos, 'tool_ray_barrel', () => createRoundedBoxGeometry(0.11, 0.13, 0.36, 1, 0.04)),
        mainMat,
      );
      barrel.position.set(0, 0.10, 0.10);
      const coilGeo = getGeo(geos, 'tool_ray_coil', () => new THREE.TorusGeometry(0.085, 0.018, 6, 12));
      for (const cz of [0.14, 0.22]) {
        const coil = new THREE.Mesh(coilGeo, accMat);
        coil.position.set(0, 0.10, cz);
        gunGroup.add(coil);
      }
      const emitter = new THREE.Mesh(
        getGeo(geos, 'tool_ray_emit', () => new THREE.SphereGeometry(0.065, 8, 8)),
        accMat,
      );
      emitter.position.set(0, 0.10, 0.31);
      gunGroup.add(grip, barrel, emitter);
      g.add(gunGroup);
      break;
    }

    case 'sceptre': {
      const staff = new THREE.Mesh(
        getGeo(geos, 'tool_scp_staff', () => new THREE.CylinderGeometry(0.028, 0.032, 0.58, 8)),
        mainMat,
      );
      staff.position.y = 0.26;
      const collar = new THREE.Mesh(
        getGeo(geos, 'tool_scp_collar', () => new THREE.CylinderGeometry(0.095, 0.06, 0.09, 10)),
        mainMat,
      );
      collar.position.y = 0.50;
      const jewel = new THREE.Mesh(
        getGeo(geos, 'tool_scp_jewel', () => new THREE.OctahedronGeometry(0.105, 0)),
        accMat,
      );
      jewel.position.y = 0.62;
      const archGeo = getGeo(geos, 'tool_scp_arch', () => new THREE.TorusGeometry(0.12, 0.015, 6, 12));
      for (let i = 0; i < 2; i++) {
        const arch = new THREE.Mesh(archGeo, mainMat);
        arch.position.y = 0.62;
        arch.rotation.y = (i * Math.PI) / 2;
        g.add(arch);
      }
      g.add(staff, collar, jewel);
      break;
    }

    case 'flask': {
      const bulb = new THREE.Mesh(
        getGeo(geos, 'tool_flk_bulb', () => new THREE.SphereGeometry(0.145, 12, 10)),
        mats.emissiveGlow(tpl.color, 0.85, 0.14),
      );
      bulb.position.y = 0.20;
      const neck = new THREE.Mesh(
        getGeo(geos, 'tool_flk_neck', () => new THREE.CylinderGeometry(0.045, 0.055, 0.14, 10)),
        mats.glass('#dff6ff', 0.35),
      );
      neck.position.y = 0.38;
      const cork = new THREE.Mesh(
        getGeo(geos, 'tool_flk_cork', () => new THREE.CylinderGeometry(0.048, 0.04, 0.06, 8)),
        woodMat,
      );
      cork.position.y = 0.46;
      const rune = new THREE.Mesh(
        getGeo(geos, 'tool_flk_rune', () => new THREE.TorusGeometry(0.19, 0.016, 6, 16)),
        accMat,
      );
      rune.position.y = 0.22;
      rune.rotation.set(0.65, 0.3, 0.4);
      g.add(bulb, neck, cork, rune);
      break;
    }

    case 'mythic_cleaver': {
      const grip = new THREE.Mesh(
        getGeo(geos, 'tool_mclv_grip', () => createRoundedBoxGeometry(0.06, 0.20, 0.08, 1, 0.02)),
        mats.std('#1e293b', 0.35, 0.2),
      );
      grip.position.y = 0.05;
      const guard = new THREE.Mesh(
        getGeo(geos, 'tool_mclv_guard', () => createRoundedBoxGeometry(0.12, 0.06, 0.30, 1, 0.02)),
        accMat,
      );
      guard.position.set(0, 0.16, 0.04);
      const blade = new THREE.Mesh(
        getGeo(geos, 'tool_mclv_blade', () => createRoundedBoxGeometry(0.042, 0.48, 0.28, 2, 0.015)),
        mainMat,
      );
      blade.position.set(0, 0.42, 0.05);
      const edge = new THREE.Mesh(
        getGeo(geos, 'tool_mclv_edge', () => createRoundedBoxGeometry(0.048, 0.48, 0.04, 1, 0.01)),
        accMat,
      );
      edge.position.set(0, 0.42, 0.18);
      const rune = new THREE.Mesh(
        getGeo(geos, 'tool_mclv_rune', () => new THREE.OctahedronGeometry(0.085, 0)),
        accMat,
      );
      rune.position.set(0, 0.42, 0.05);
      g.add(grip, guard, blade, edge, rune);
      break;
    }

    case 'mythic_hammer': {
      const shaft = new THREE.Mesh(
        getGeo(geos, 'tool_mham_shaft', () => new THREE.CylinderGeometry(0.032, 0.036, 0.56, 8)),
        steelMat,
      );
      shaft.position.y = 0.24;
      const head = new THREE.Mesh(
        getGeo(geos, 'tool_mham_head', () => createRoundedBoxGeometry(0.28, 0.22, 0.22, 2, 0.05)),
        mainMat,
      );
      head.position.y = 0.52;
      const starCore = new THREE.Mesh(
        getGeo(geos, 'tool_mham_core', () => new THREE.TorusGeometry(0.135, 0.025, 6, 14)),
        accMat,
      );
      starCore.rotation.y = Math.PI / 2;
      starCore.position.y = 0.52;
      const studGeo = getGeo(geos, 'tool_mham_stud', () => new THREE.ConeGeometry(0.035, 0.06, 4));
      for (const s of [-1, 1]) {
        for (const dy of [-0.05, 0.05]) {
          const st = new THREE.Mesh(studGeo, accMat);
          st.rotation.z = s * -Math.PI / 2;
          st.position.set(s * 0.16, 0.52 + dy, 0);
          g.add(st);
        }
      }
      g.add(shaft, head, starCore);
      break;
    }

    default: {
      const rod = new THREE.Mesh(
        getGeo(geos, 'tool_fallback', () => new THREE.CylinderGeometry(0.03, 0.03, 0.44, 8)),
        mainMat,
      );
      rod.position.y = 0.22;
      g.add(rod);
      break;
    }
  }

  // Canonical rarity shimmer crystal on Legendary / Ultimate / Mythic hand tools
  const toolShimmer = RARITY_SHIMMER_PALETTE[tpl.rarity];
  if (toolShimmer.hasShimmer) {
    const orb = new THREE.Mesh(
      getGeo(geos, 'tool_rarity_orb', () => new THREE.OctahedronGeometry(0.046, 0)),
      mats.emissiveGlow(toolShimmer.highlight, 0.95, 0.12),
    );
    if (tpl.visualStyle === 'raygun') {
      orb.position.set(0, 0.34, -0.18);
    } else {
      orb.position.set(0, 0.46, 0.12);
    }
    g.add(orb);
  }

  g.rotation.x = Math.PI / 2;
  enableShadows(g, true, true);
  return g;
}

function buildRingAccessoryMesh(
  tpl: GearTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const rarityInfo = RARITY_SHIMMER_PALETTE[tpl.rarity];
  const isGlowing =
    tpl.rarity === 'epic' || rarityInfo.hasShimmer;
  const band = new THREE.Mesh(
    getGeo(geos, 'gear_ring_band', () => new THREE.TorusGeometry(0.088, 0.022, 8, 14)),
    mats.metallic(tpl.color, 0.18, 0.78),
  );
  band.rotation.x = Math.PI / 2;
  const gem = new THREE.Mesh(
    getGeo(geos, 'gear_ring_gem', () => new THREE.OctahedronGeometry(0.052, 0)),
    isGlowing
      ? mats.emissiveGlow(rarityInfo.hasShimmer ? rarityInfo.primary : tpl.accentColor, 0.92, 0.14)
      : mats.glossy(tpl.accentColor, 0.2, 0.3),
  );
  gem.position.set(0, 0.02, 0.09);
  g.add(band, gem);

  if (rarityInfo.hasShimmer) {
    const spark = new THREE.Mesh(
      getGeo(geos, 'gear_ring_spark', () => new THREE.OctahedronGeometry(0.034, 0)),
      mats.emissiveGlow(rarityInfo.highlight, 1.0, 0.12),
    );
    spark.position.set(0.07, 0.07, 0.11);
    g.add(spark);
  }
  return g;
}

function buildNecklaceAccessoryMesh(
  tpl: GearTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): THREE.Group {
  const g = new THREE.Group();
  const rarityInfo = RARITY_SHIMMER_PALETTE[tpl.rarity];
  const isGlowing =
    tpl.rarity === 'epic' || rarityInfo.hasShimmer;

  const chain = new THREE.Mesh(
    getGeo(geos, 'gear_neck_chain', () => new THREE.TorusGeometry(0.22, 0.020, 8, 18)),
    mats.metallic(tpl.color, 0.22, 0.74),
  );
  chain.rotation.x = Math.PI / 2 + 0.25;
  chain.position.set(0, 0.83, 0.02);

  const pendant = new THREE.Mesh(
    getGeo(geos, 'gear_neck_pend', () => new THREE.OctahedronGeometry(0.068, 0)),
    isGlowing
      ? mats.emissiveGlow(rarityInfo.hasShimmer ? rarityInfo.primary : tpl.accentColor, 0.92, 0.14)
      : mats.glossy(tpl.accentColor, 0.22, 0.32),
  );
  pendant.position.set(0, 0.73, 0.27);
  g.add(chain, pendant);

  if (rarityInfo.hasShimmer) {
    const beadGeo = getGeo(geos, 'gear_neck_bead', () => new THREE.SphereGeometry(0.030, 8, 6));
    const beadMat = mats.emissiveGlow(rarityInfo.highlight, 0.85, 0.16);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(beadGeo, beadMat);
      b.position.set(s * 0.10, 0.76, 0.24);
      g.add(b);
    }
  }
  return g;
}

/**
 * Applies all 6 equipped gear slots (head, body, hand1, hand2, ring, necklace) onto a CharacterRig
 * in-place with zero leaks. Cleanly resets sleeves, shirt, hair scale, and default chef apron/toque
 * when slots are unequipped or when `runtime.ignoreGear === true`.
 */
export function applyEquippedGearVisuals(
  rig: CharacterRig,
  equippedTemplates: EquippedGearVisualSet,
  mats: MaterialPool,
  geos?: GeometryPool,
): void {
  clearAnchorGroup(rig.hatAnchor);
  clearAnchorGroup(rig.bodyGearAnchor);
  clearAnchorGroup(rig.hand1Anchor);
  clearAnchorGroup(rig.hand2Anchor);
  clearAnchorGroup(rig.accessoryAnchor);
  clearAnchorGroup(rig.ringAnchor);

  // 1. Body slot
  if (equippedTemplates.body) {
    applyBodyGearStyle(rig, equippedTemplates.body, mats, geos);
  } else {
    const defaultShirt = mats.glossy(rig.baseShirtColor, 0.36, 0.06);
    const defaultSleeve = mats.glossy(rig.baseSleeveColor, 0.38, 0.05);
    rig.shirtMesh.material = defaultShirt;
    rig.leftArm.material = defaultSleeve;
    rig.rightArm.material = defaultSleeve;
    rig.defaultApronGroup.visible = rig.baseIsChef;
  }

  // 2. Head slot
  if (equippedTemplates.head) {
    const { group, shrinkHair } = buildHeadGearMesh(equippedTemplates.head, mats, geos);
    rig.hairGroup.scale.setScalar(shrinkHair ? 0.90 : 1.0);
    rig.hatAnchor.add(group);
  } else {
    rig.hairGroup.scale.setScalar(1.0);
    if (rig.baseIsChef) {
      rig.hatAnchor.add(
        buildDefaultChefToque(
          mats,
          geos,
          rig.baseRole === 'chef' ? 0.9 : 1.0,
          rig.baseRole === 'helper' ? '#facc15' : undefined,
        ),
      );
    }
  }

  // 3. Hand 1 & Hand 2 slots
  if (equippedTemplates.hand1) {
    rig.hand1Anchor.add(buildHandToolMesh(equippedTemplates.hand1, mats, geos));
  }
  if (equippedTemplates.hand2) {
    const tool2 = buildHandToolMesh(equippedTemplates.hand2, mats, geos);
    tool2.scale.x = -1;
    rig.hand2Anchor.add(tool2);
  }

  // 4. Ring slot (right hand sparkle band + gem)
  if (equippedTemplates.ring) {
    rig.ringAnchor.add(buildRingAccessoryMesh(equippedTemplates.ring, mats, geos));
  }

  // 5. Necklace slot (neck collar chain + chest pendant)
  if (equippedTemplates.necklace) {
    rig.accessoryAnchor.add(buildNecklaceAccessoryMesh(equippedTemplates.necklace, mats, geos));
  }
}

// =========================================================================
// ALL 10 MINIATURE 3D FOOD DISH MODELS (TRAYS & PASS COUNTER)
// =========================================================================

export function buildFoodDishMesh(
  style: StationModelStyle,
  dishColor: string,
  accentColor: string,
  mats: MaterialPool,
  geos?: GeometryPool,
): THREE.Group {
  const g = new THREE.Group();
  const mainMat = mats.glossy(dishColor, 0.28, 0.08);
  const accMat = mats.glossy(accentColor, 0.28, 0.1);
  const whiteMat = mats.glossy('#fffbf0', 0.32, 0.04);

  switch (style) {
    case 'juicer': {
      const cup = new THREE.Mesh(
        getGeo(geos, 'dish_jui_cup', () => new THREE.CylinderGeometry(0.11, 0.085, 0.22, 12)),
        mats.glass('#ffffff', 0.34),
      );
      cup.position.y = 0.11;
      cup.renderOrder = 2;
      const liquid = new THREE.Mesh(
        getGeo(geos, 'dish_jui_liq', () => new THREE.CylinderGeometry(0.095, 0.075, 0.17, 12)),
        mainMat,
      );
      liquid.position.y = 0.095;
      const wedge = new THREE.Mesh(
        getGeo(geos, 'dish_jui_wedge', () => new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10)),
        accMat,
      );
      wedge.rotation.z = Math.PI / 2;
      wedge.position.set(0.09, 0.21, 0);
      const straw = new THREE.Mesh(
        getGeo(geos, 'dish_jui_straw', () => new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6)),
        whiteMat,
      );
      straw.position.set(-0.03, 0.18, 0);
      straw.rotation.z = 0.22;
      g.add(liquid, cup, wedge, straw);
      break;
    }

    case 'blender': {
      const cup = new THREE.Mesh(
        getGeo(geos, 'dish_bld_cup', () => new THREE.CylinderGeometry(0.105, 0.08, 0.20, 12)),
        mainMat,
      );
      cup.position.y = 0.10;
      const dome = new THREE.Mesh(
        getGeo(geos, 'dish_bld_dome', () => new THREE.SphereGeometry(0.105, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        mats.glass('#ffffff', 0.34),
      );
      dome.position.y = 0.19;
      dome.renderOrder = 2;
      const cream1 = new THREE.Mesh(
        getGeo(geos, 'dish_bld_cr1', () => new THREE.SphereGeometry(0.075, 8, 6)),
        whiteMat,
      );
      cream1.position.y = 0.21;
      const cream2 = new THREE.Mesh(
        getGeo(geos, 'dish_bld_cr2', () => new THREE.SphereGeometry(0.048, 8, 6)),
        accMat,
      );
      cream2.position.y = 0.26;
      const straw = new THREE.Mesh(
        getGeo(geos, 'dish_bld_straw', () => new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6)),
        accMat,
      );
      straw.position.set(0.03, 0.23, 0);
      straw.rotation.z = -0.20;
      g.add(cup, cream1, cream2, dome, straw);
      break;
    }

    case 'grill': {
      const plate = new THREE.Mesh(
        getGeo(geos, 'dish_grl_plate', () => new THREE.CylinderGeometry(0.20, 0.18, 0.03, 14)),
        whiteMat,
      );
      plate.position.y = 0.015;
      const bunMat = mats.glossy('#d97706', 0.42, 0.04);
      const botBun = new THREE.Mesh(
        getGeo(geos, 'dish_grl_bbun', () => new THREE.CylinderGeometry(0.135, 0.13, 0.045, 12)),
        bunMat,
      );
      botBun.position.y = 0.05;
      const lettuce = new THREE.Mesh(
        getGeo(geos, 'dish_grl_let', () => new THREE.CylinderGeometry(0.15, 0.145, 0.025, 10)),
        mats.glossy('#22c55e', 0.4, 0.04),
      );
      lettuce.position.y = 0.08;
      const patty = new THREE.Mesh(
        getGeo(geos, 'dish_grl_pat', () => new THREE.CylinderGeometry(0.135, 0.135, 0.048, 12)),
        mainMat,
      );
      patty.position.y = 0.115;
      const cheese = new THREE.Mesh(
        getGeo(geos, 'dish_grl_chs', () => new THREE.BoxGeometry(0.20, 0.018, 0.20)),
        accMat,
      );
      cheese.rotation.y = Math.PI / 4;
      cheese.position.y = 0.145;
      const topBun = new THREE.Mesh(
        getGeo(geos, 'dish_grl_tbun', () => new THREE.SphereGeometry(0.138, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        bunMat,
      );
      topBun.position.y = 0.148;
      g.add(plate, botBun, lettuce, patty, cheese, topBun);
      break;
    }

    case 'fryer': {
      const carton = new THREE.Mesh(
        getGeo(geos, 'dish_fry_box', () => createRoundedBoxGeometry(0.18, 0.16, 0.13, 1, 0.025)),
        accMat,
      );
      carton.position.y = 0.08;
      const fryGeo = getGeo(geos, 'dish_fry_baton', () => createRoundedBoxGeometry(0.032, 0.15, 0.032, 1, 0.008));
      for (let i = -2; i <= 2; i++) {
        const fry = new THREE.Mesh(fryGeo, mainMat);
        fry.position.set(i * 0.032, 0.18 + (i % 2 === 0 ? 0.02 : 0), (i % 2) * 0.02);
        fry.rotation.z = -i * 0.09;
        g.add(fry);
      }
      g.add(carton);
      break;
    }

    case 'wok': {
      const bowl = new THREE.Mesh(
        getGeo(geos, 'dish_wok_bowl', () => new THREE.CylinderGeometry(0.19, 0.11, 0.12, 14)),
        accMat,
      );
      bowl.position.y = 0.06;
      const broth = new THREE.Mesh(
        getGeo(geos, 'dish_wok_broth', () => new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45)),
        mainMat,
      );
      broth.scale.set(1, 0.45, 1);
      broth.position.y = 0.11;
      const egg = new THREE.Mesh(
        getGeo(geos, 'dish_wok_egg', () => new THREE.CylinderGeometry(0.055, 0.055, 0.022, 10)),
        whiteMat,
      );
      egg.position.set(-0.04, 0.16, 0.03);
      const stickGeo = getGeo(geos, 'dish_wok_stick', () => new THREE.CylinderGeometry(0.008, 0.012, 0.34, 6));
      const woodMat = mats.std('#b45309', 0.55, 0.04);
      for (const s of [-1, 1]) {
        const st = new THREE.Mesh(stickGeo, woodMat);
        st.rotation.z = Math.PI / 2 - 0.12;
        st.rotation.y = s * 0.14;
        st.position.set(0.04, 0.17, s * 0.035);
        g.add(st);
      }
      g.add(bowl, broth, egg);
      break;
    }

    case 'oven': {
      const peel = new THREE.Mesh(
        getGeo(geos, 'dish_ovn_peel', () => new THREE.CylinderGeometry(0.21, 0.21, 0.024, 14)),
        mats.std('#b45309', 0.58, 0.04),
      );
      peel.position.y = 0.012;
      const crust = new THREE.Mesh(
        getGeo(geos, 'dish_ovn_crust', () => new THREE.CylinderGeometry(0.185, 0.185, 0.032, 14)),
        mats.glossy('#e9a84b', 0.46, 0.04),
      );
      crust.position.y = 0.038;
      const sauce = new THREE.Mesh(
        getGeo(geos, 'dish_ovn_sauce', () => new THREE.CylinderGeometry(0.155, 0.155, 0.018, 12)),
        mainMat,
      );
      sauce.position.y = 0.056;
      const topGeo = getGeo(geos, 'dish_ovn_top', () => new THREE.CylinderGeometry(0.032, 0.032, 0.016, 8));
      const pos: Array<[number, number]> = [
        [-0.07, -0.05],
        [0.07, -0.04],
        [-0.04, 0.07],
        [0.06, 0.06],
      ];
      for (const [tx, tz] of pos) {
        const tp = new THREE.Mesh(topGeo, accMat);
        tp.position.set(tx, 0.07, tz);
        g.add(tp);
      }
      g.add(peel, crust, sauce);
      break;
    }

    case 'espresso': {
      const saucer = new THREE.Mesh(
        getGeo(geos, 'dish_esp_saucer', () => new THREE.CylinderGeometry(0.17, 0.13, 0.026, 14)),
        whiteMat,
      );
      saucer.position.y = 0.013;
      const mug = new THREE.Mesh(
        getGeo(geos, 'dish_esp_mug', () => new THREE.CylinderGeometry(0.105, 0.09, 0.15, 12)),
        whiteMat,
      );
      mug.position.y = 0.095;
      const handle = new THREE.Mesh(
        getGeo(geos, 'dish_esp_hdl', () => new THREE.TorusGeometry(0.05, 0.015, 6, 10, Math.PI)),
        accMat,
      );
      handle.rotation.z = -Math.PI / 2;
      handle.position.set(0.10, 0.10, 0);
      const coffee = new THREE.Mesh(
        getGeo(geos, 'dish_esp_cof', () => new THREE.CylinderGeometry(0.092, 0.092, 0.02, 12)),
        mainMat,
      );
      coffee.position.y = 0.165;
      const foam = new THREE.Mesh(
        getGeo(geos, 'dish_esp_foam', () => new THREE.SphereGeometry(0.032, 8, 6)),
        whiteMat,
      );
      foam.scale.set(1.2, 0.35, 1.2);
      foam.position.y = 0.176;
      g.add(saucer, mug, handle, coffee, foam);
      break;
    }

    case 'cauldron': {
      const potMat = mats.metallic('#263044', 0.34, 0.65);
      const pot = new THREE.Mesh(
        getGeo(geos, 'dish_cld_pot', () => new THREE.SphereGeometry(0.15, 12, 10)),
        potMat,
      );
      pot.scale.set(1.05, 0.78, 1.05);
      pot.position.y = 0.11;
      const rim = new THREE.Mesh(
        getGeo(geos, 'dish_cld_rim', () => new THREE.TorusGeometry(0.125, 0.022, 6, 12)),
        potMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.20;
      const brew = new THREE.Mesh(
        getGeo(geos, 'dish_cld_brew', () => new THREE.CylinderGeometry(0.12, 0.12, 0.025, 12)),
        mats.emissiveGlow(dishColor, 0.85, 0.18),
      );
      brew.position.y = 0.195;
      const bubGeo = getGeo(geos, 'dish_cld_bub', () => new THREE.SphereGeometry(0.032, 8, 6));
      const b1 = new THREE.Mesh(bubGeo, mats.emissiveGlow(accentColor, 0.75, 0.15));
      b1.position.set(-0.04, 0.23, 0.03);
      const b2 = new THREE.Mesh(bubGeo, mats.emissiveGlow(accentColor, 0.75, 0.15));
      b2.scale.setScalar(0.75);
      b2.position.set(0.05, 0.25, -0.03);
      g.add(pot, rim, brew, b1, b2);
      break;
    }

    case 'sushi': {
      const board = new THREE.Mesh(
        getGeo(geos, 'dish_sus_board', () => createRoundedBoxGeometry(0.28, 0.04, 0.20, 1, 0.015)),
        mats.std('#1e293b', 0.42, 0.12),
      );
      board.position.y = 0.02;
      const riceGeo = getGeo(geos, 'dish_sus_rice', () => createRoundedBoxGeometry(0.085, 0.052, 0.13, 1, 0.022));
      const fishGeo = getGeo(geos, 'dish_sus_fish', () => createRoundedBoxGeometry(0.092, 0.026, 0.145, 1, 0.012));
      const noriGeo = getGeo(geos, 'dish_sus_nori', () => new THREE.BoxGeometry(0.095, 0.072, 0.032));
      const noriMat = mats.std('#14532d', 0.55, 0.04);
      for (const sx of [-0.065, 0.055]) {
        const rice = new THREE.Mesh(riceGeo, whiteMat);
        rice.position.set(sx, 0.065, 0);
        const fish = new THREE.Mesh(fishGeo, mainMat);
        fish.position.set(sx, 0.098, 0);
        const nori = new THREE.Mesh(noriGeo, noriMat);
        nori.position.set(sx, 0.072, 0);
        g.add(rice, fish, nori);
      }
      const wasabi = new THREE.Mesh(
        getGeo(geos, 'dish_sus_was', () => new THREE.SphereGeometry(0.03, 8, 6)),
        mats.glossy(accentColor, 0.35, 0.05),
      );
      wasabi.position.set(0.11, 0.055, 0.06);
      g.add(board, wasabi);
      break;
    }

    case 'dessert': {
      const saucer = new THREE.Mesh(
        getGeo(geos, 'dish_des_saucer', () => new THREE.CylinderGeometry(0.18, 0.15, 0.028, 14)),
        whiteMat,
      );
      saucer.position.y = 0.014;
      const tier1 = new THREE.Mesh(
        getGeo(geos, 'dish_des_t1', () => new THREE.CylinderGeometry(0.135, 0.14, 0.10, 14)),
        mainMat,
      );
      tier1.position.y = 0.078;
      const icing1 = new THREE.Mesh(
        getGeo(geos, 'dish_des_ic1', () => new THREE.TorusGeometry(0.125, 0.026, 6, 14)),
        accMat,
      );
      icing1.rotation.x = Math.PI / 2;
      icing1.position.y = 0.13;
      const tier2 = new THREE.Mesh(
        getGeo(geos, 'dish_des_t2', () => new THREE.CylinderGeometry(0.088, 0.095, 0.08, 12)),
        accMat,
      );
      tier2.position.y = 0.17;
      const cherry = new THREE.Mesh(
        getGeo(geos, 'dish_des_chr', () => new THREE.SphereGeometry(0.038, 8, 8)),
        mats.glossy('#ef4444', 0.14, 0.12),
      );
      cherry.position.y = 0.235;
      g.add(saucer, tier1, icing1, tier2, cherry);
      break;
    }
  }

  enableShadows(g, true, true);
  return g;
}

/**
 * Zero-allocation tray visual updater: only swaps children when `(style, dishColor, accentColor)` changes.
 */
export function setTrayDishVisual(
  dishAnchor: THREE.Group,
  fallbackDishMesh: THREE.Mesh,
  style: StationModelStyle,
  dishColor: string,
  accentColor: string,
  prevKey: string,
  mats: MaterialPool,
  geos?: GeometryPool,
): string {
  const nextKey = `${style}|${dishColor}|${accentColor}`;
  if (nextKey === prevKey) return prevKey;

  clearAnchorGroup(dishAnchor);
  const dish = buildFoodDishMesh(style, dishColor, accentColor, mats, geos);
  dishAnchor.add(dish);
  fallbackDishMesh.visible = false;
  return nextKey;
}

// =========================================================================
// ALL 14 COMPANION PET MODELS (13 ACTIVE SPECIES + 'gnome')
// =========================================================================

function addCutePetFace(
  headGroup: THREE.Group,
  zFront: number,
  yEye: number,
  eyeSep: number,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): void {
  const eyeGeo = getGeo(geos, 'pet_eye', () => new THREE.SphereGeometry(0.038, 8, 8));
  const eyeMat = mats.glossy('#1e1410', 0.12, 0.08);
  const catchGeo = getGeo(geos, 'pet_catch', () => new THREE.SphereGeometry(0.015, 6, 6));
  const catchMat = mats.basicMat('#ffffff', 1);
  const cheekGeo = getGeo(geos, 'pet_cheek', () => new THREE.SphereGeometry(0.036, 8, 6));
  const cheekMat = mats.std('#ff8fab', 0.6, 0.02);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(s * eyeSep, yEye, zFront);
    const c = new THREE.Mesh(catchGeo, catchMat);
    c.position.set(0.012, 0.014, 0.028);
    eye.add(c);
    headGroup.add(eye);

    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.scale.set(1.25, 0.7, 0.4);
    cheek.position.set(s * (eyeSep + 0.05), yEye - 0.045, zFront - 0.02);
    headGroup.add(cheek);
  }
}

export function buildPetRig(
  color: string,
  accentColor: string,
  mats: MaterialPool,
  modelStyle: PetModelStyle = 'pup',
  geos?: GeometryPool,
  shadowTex?: THREE.Texture | null,
): PetVisualRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const contactShadow = new THREE.Mesh(
    getGeo(geos, 'pet_shadow_quad', () => new THREE.PlaneGeometry(1, 1)),
    mats.contactShadow(shadowTex ?? null),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(0.76, 0.76, 1);
  contactShadow.position.y = 0.02;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  contactShadow.raycast = () => {};
  root.add(contactShadow);

  const mainMat =
    modelStyle === 'lucky_cat'
      ? mats.metallic(color, 0.22, 0.65, '#f59e0b', 0.2)
      : mats.glossy(color, 0.36, 0.06);
  const accMat = mats.glossy(accentColor, 0.36, 0.06);

  const headGroup = new THREE.Group();
  let tailGroup: THREE.Group | undefined;
  let leftWing: THREE.Object3D | undefined;
  let rightWing: THREE.Object3D | undefined;
  const legs: THREE.Object3D[] = [];
  let trayY = 0.78;

  switch (modelStyle) {
    case 'chick': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_chick_body', () => new THREE.SphereGeometry(0.25, 12, 10)),
        mainMat,
      );
      torso.scale.set(1, 0.95, 1.08);
      torso.position.set(0, 0.32, 0);
      body.add(torso);

      headGroup.position.set(0, 0.42, 0.08);
      body.add(headGroup);
      addCutePetFace(headGroup, 0.20, 0.02, 0.095, mats, geos);

      const beak = new THREE.Mesh(
        getGeo(geos, 'pet_chick_beak', () => new THREE.ConeGeometry(0.055, 0.11, 5)),
        accMat,
      );
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, -0.02, 0.26);
      headGroup.add(beak);

      const crestGeo = getGeo(geos, 'pet_chick_crest', () => new THREE.ConeGeometry(0.036, 0.11, 5));
      for (const ox of [-0.04, 0, 0.04]) {
        const cr = new THREE.Mesh(crestGeo, accMat);
        cr.position.set(ox, 0.18, 0.02);
        cr.rotation.z = -ox * 4;
        headGroup.add(cr);
      }

      const wingGeo = getGeo(geos, 'pet_chick_wing', () => new THREE.SphereGeometry(0.11, 8, 6));
      const lw = new THREE.Mesh(wingGeo, mainMat);
      lw.scale.set(0.45, 0.85, 1.15);
      lw.position.set(-0.24, 0.32, 0);
      const rw = new THREE.Mesh(wingGeo, mainMat);
      rw.scale.set(0.45, 0.85, 1.15);
      rw.position.set(0.24, 0.32, 0);
      leftWing = lw;
      rightWing = rw;
      body.add(lw, rw);

      const footGeo = getGeo(geos, 'pet_chick_foot', () => createRoundedBoxGeometry(0.10, 0.06, 0.15, 1, 0.02));
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(footGeo, accMat);
        f.position.set(s * 0.10, 0.05, 0.03);
        body.add(f);
        legs.push(f);
      }
      tailGroup = new THREE.Group();
      const tailTuft = new THREE.Mesh(
        getGeo(geos, 'pet_chick_tail', () => new THREE.ConeGeometry(0.06, 0.12, 5)),
        mainMat,
      );
      tailTuft.rotation.x = -0.8;
      tailGroup.add(tailTuft);
      tailGroup.position.set(0, 0.38, -0.25);
      body.add(tailGroup);
      break;
    }

    case 'pup': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_pup_body', () => createRoundedBoxGeometry(0.38, 0.28, 0.56, 2, 0.12)),
        mainMat,
      );
      torso.position.set(0, 0.30, 0);
      const belly = new THREE.Mesh(
        getGeo(geos, 'pet_pup_belly', () => new THREE.SphereGeometry(0.16, 10, 8)),
        accMat,
      );
      belly.scale.set(0.95, 0.65, 1.25);
      belly.position.set(0, 0.22, 0.04);
      const collar = new THREE.Mesh(
        getGeo(geos, 'pet_pup_col', () => new THREE.TorusGeometry(0.16, 0.028, 6, 14)),
        mats.glossy('#ef4444', 0.28, 0.1),
      );
      collar.rotation.x = Math.PI / 2 - 0.35;
      collar.position.set(0, 0.39, 0.20);
      body.add(torso, belly, collar);

      headGroup.position.set(0, 0.48, 0.25);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_pup_head', () => new THREE.SphereGeometry(0.21, 12, 10)),
        mainMat,
      );
      const snout = new THREE.Mesh(
        getGeo(geos, 'pet_pup_snout', () => createRoundedBoxGeometry(0.16, 0.11, 0.14, 1, 0.045)),
        accMat,
      );
      snout.position.set(0, -0.04, 0.18);
      const nose = new THREE.Mesh(
        getGeo(geos, 'pet_pup_nose', () => new THREE.SphereGeometry(0.036, 8, 6)),
        mats.glossy('#1e293b', 0.15, 0.1),
      );
      nose.position.set(0, -0.01, 0.25);
      headGroup.add(head, snout, nose);
      addCutePetFace(headGroup, 0.17, 0.04, 0.085, mats, geos);

      const earGeo = getGeo(geos, 'pet_pup_ear', () => new THREE.ConeGeometry(0.075, 0.19, 6));
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, mainMat);
        ear.position.set(s * 0.14, 0.20, 0);
        ear.rotation.z = s * -0.25;
        headGroup.add(ear);
      }

      const pawGeo = getGeo(geos, 'pet_pup_paw', () => new THREE.CylinderGeometry(0.055, 0.06, 0.18, 8));
      for (const [lx, lz] of [[-0.12, 0.17], [0.12, 0.17], [-0.12, -0.17], [0.12, -0.17]]) {
        const p = new THREE.Mesh(pawGeo, accMat);
        p.position.set(lx, 0.09, lz);
        body.add(p);
        legs.push(p);
      }

      tailGroup = new THREE.Group();
      const pom = new THREE.Mesh(
        getGeo(geos, 'pet_pup_tail', () => new THREE.SphereGeometry(0.085, 8, 8)),
        accMat,
      );
      tailGroup.add(pom);
      tailGroup.position.set(0, 0.36, -0.30);
      body.add(tailGroup);
      break;
    }

    case 'kitten': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_cat_body', () => new THREE.SphereGeometry(0.24, 12, 10)),
        mainMat,
      );
      torso.scale.set(0.95, 0.92, 1.18);
      torso.position.set(0, 0.28, 0);
      const bib = new THREE.Mesh(
        getGeo(geos, 'pet_cat_bib', () => new THREE.SphereGeometry(0.14, 8, 8)),
        accMat,
      );
      bib.position.set(0, 0.27, 0.18);
      body.add(torso, bib);

      headGroup.position.set(0, 0.48, 0.20);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_cat_head', () => new THREE.SphereGeometry(0.20, 12, 10)),
        mainMat,
      );
      const nose = new THREE.Mesh(
        getGeo(geos, 'pet_cat_nose', () => new THREE.ConeGeometry(0.028, 0.036, 3)),
        mats.glossy('#fb7185', 0.3, 0.04),
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, -0.02, 0.20);
      const earGeo = getGeo(geos, 'pet_cat_ear', () => new THREE.ConeGeometry(0.068, 0.14, 4));
      const whiskGeo = getGeo(geos, 'pet_cat_whk', () => new THREE.BoxGeometry(0.13, 0.012, 0.012));
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, mainMat);
        ear.position.set(s * 0.13, 0.17, 0);
        ear.rotation.z = s * -0.2;
        headGroup.add(ear);
        for (const dy of [-0.01, -0.04]) {
          const w = new THREE.Mesh(whiskGeo, mats.std('#3d2314'));
          w.position.set(s * 0.16, dy, 0.16);
          w.rotation.z = s * dy * 4;
          headGroup.add(w);
        }
      }
      headGroup.add(head, nose);
      addCutePetFace(headGroup, 0.17, 0.03, 0.082, mats, geos);

      const pawGeo = getGeo(geos, 'pet_cat_paw', () => new THREE.CylinderGeometry(0.048, 0.052, 0.16, 8));
      for (const [lx, lz] of [[-0.11, 0.15], [0.11, 0.15], [-0.11, -0.15], [0.11, -0.15]]) {
        const p = new THREE.Mesh(pawGeo, accMat);
        p.position.set(lx, 0.08, lz);
        body.add(p);
        legs.push(p);
      }

      tailGroup = new THREE.Group();
      const t1 = new THREE.Mesh(
        getGeo(geos, 'pet_cat_t1', () => new THREE.CapsuleGeometry(0.036, 0.24, 4, 8)),
        mainMat,
      );
      t1.position.set(0, 0.14, -0.05);
      t1.rotation.x = -0.35;
      const tip = new THREE.Mesh(
        getGeo(geos, 'pet_cat_tip', () => new THREE.SphereGeometry(0.046, 8, 6)),
        accMat,
      );
      tip.position.set(0, 0.28, -0.11);
      tailGroup.add(t1, tip);
      tailGroup.position.set(0, 0.30, -0.24);
      body.add(tailGroup);
      break;
    }

    case 'pony': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_pony_body', () => createRoundedBoxGeometry(0.36, 0.30, 0.60, 2, 0.12)),
        mainMat,
      );
      torso.position.set(0, 0.38, 0);
      const neck = new THREE.Mesh(
        getGeo(geos, 'pet_pony_neck', () => new THREE.CylinderGeometry(0.11, 0.14, 0.26, 10)),
        mainMat,
      );
      neck.position.set(0, 0.54, 0.22);
      neck.rotation.x = 0.28;
      body.add(torso, neck);

      headGroup.position.set(0, 0.66, 0.30);
      body.add(headGroup);
      const skull = new THREE.Mesh(
        getGeo(geos, 'pet_pony_head', () => new THREE.SphereGeometry(0.17, 10, 8)),
        mainMat,
      );
      const muzzle = new THREE.Mesh(
        getGeo(geos, 'pet_pony_muz', () => createRoundedBoxGeometry(0.15, 0.14, 0.22, 1, 0.05)),
        mainMat,
      );
      muzzle.position.set(0, -0.04, 0.16);
      headGroup.add(skull, muzzle);
      addCutePetFace(headGroup, 0.14, 0.03, 0.08, mats, geos);

      // Sculpted 4-tuft mane
      const maneGeo = getGeo(geos, 'pet_pony_mane', () => new THREE.SphereGeometry(0.075, 8, 6));
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(maneGeo, accMat);
        m.position.set(0, 0.14 - i * 0.06, -0.05 - i * 0.06);
        headGroup.add(m);
      }
      const earGeo = getGeo(geos, 'pet_pony_ear', () => new THREE.ConeGeometry(0.045, 0.13, 5));
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(earGeo, mainMat);
        e.position.set(s * 0.10, 0.16, -0.02);
        headGroup.add(e);
      }

      const legGeo = getGeo(geos, 'pet_pony_leg', () => new THREE.CylinderGeometry(0.05, 0.052, 0.26, 8));
      const hoofGeo = getGeo(geos, 'pet_pony_hoof', () => new THREE.CylinderGeometry(0.056, 0.06, 0.06, 8));
      const hoofMat = mats.std('#1e293b', 0.4, 0.15);
      for (const [lx, lz] of [[-0.12, 0.20], [0.12, 0.20], [-0.12, -0.20], [0.12, -0.20]]) {
        const lg = new THREE.Group();
        const shaft = new THREE.Mesh(legGeo, mainMat);
        shaft.position.y = 0.13;
        const hoof = new THREE.Mesh(hoofGeo, hoofMat);
        hoof.position.y = 0.03;
        lg.add(shaft, hoof);
        lg.position.set(lx, 0, lz);
        body.add(lg);
        legs.push(lg);
      }

      tailGroup = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const plume = new THREE.Mesh(maneGeo, accMat);
        plume.position.set(0, -i * 0.07, -i * 0.07);
        plume.scale.setScalar(1.15 - i * 0.15);
        tailGroup.add(plume);
      }
      tailGroup.position.set(0, 0.44, -0.32);
      body.add(tailGroup);
      trayY = 0.88;
      break;
    }

    case 'penguin': {
      const egg = new THREE.Mesh(
        getGeo(geos, 'pet_png_body', () => new THREE.CapsuleGeometry(0.22, 0.22, 6, 12)),
        mainMat,
      );
      egg.position.set(0, 0.36, 0);
      const belly = new THREE.Mesh(
        getGeo(geos, 'pet_png_belly', () => new THREE.SphereGeometry(0.19, 10, 8)),
        accMat,
      );
      belly.scale.set(0.88, 1.15, 0.55);
      belly.position.set(0, 0.34, 0.13);
      const bow = new THREE.Mesh(
        getGeo(geos, 'pet_png_bow', () => createRoundedBoxGeometry(0.14, 0.055, 0.05, 1, 0.02)),
        mats.glossy('#ef4444', 0.28, 0.08),
      );
      bow.position.set(0, 0.47, 0.20);
      body.add(egg, belly, bow);

      headGroup.position.set(0, 0.54, 0.04);
      body.add(headGroup);
      addCutePetFace(headGroup, 0.18, 0.02, 0.085, mats, geos);
      const beak = new THREE.Mesh(
        getGeo(geos, 'pet_png_beak', () => new THREE.ConeGeometry(0.058, 0.12, 5)),
        mats.glossy('#f97316', 0.3, 0.06),
      );
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, -0.02, 0.23);
      headGroup.add(beak);

      const flipGeo = getGeo(geos, 'pet_png_flip', () => createRoundedBoxGeometry(0.06, 0.26, 0.14, 1, 0.025));
      const lw = new THREE.Mesh(flipGeo, mainMat);
      lw.position.set(-0.24, 0.36, 0);
      lw.rotation.z = 0.22;
      const rw = new THREE.Mesh(flipGeo, mainMat);
      rw.position.set(0.24, 0.36, 0);
      rw.rotation.z = -0.22;
      leftWing = lw;
      rightWing = rw;
      body.add(lw, rw);

      const footGeo = getGeo(geos, 'pet_png_foot', () => createRoundedBoxGeometry(0.11, 0.055, 0.18, 1, 0.02));
      const orangeMat = mats.glossy('#f97316', 0.32, 0.05);
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(footGeo, orangeMat);
        f.position.set(s * 0.11, 0.04, 0.06);
        body.add(f);
        legs.push(f);
      }
      trayY = 0.86;
      break;
    }

    case 'turtle': {
      const shell = new THREE.Mesh(
        getGeo(geos, 'pet_trt_shell', () => new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        mainMat,
      );
      shell.position.set(0, 0.16, 0);
      const rim = new THREE.Mesh(
        getGeo(geos, 'pet_trt_rim', () => new THREE.TorusGeometry(0.31, 0.042, 6, 16)),
        accMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 0.16, 0);
      body.add(shell, rim);

      const bumpGeo = getGeo(geos, 'pet_trt_bump', () => new THREE.CylinderGeometry(0.06, 0.08, 0.04, 6));
      const bumps: Array<[number, number, number]> = [
        [0, 0.46, 0],
        [-0.14, 0.38, 0.10],
        [0.14, 0.38, 0.10],
        [-0.14, 0.38, -0.10],
        [0.14, 0.38, -0.10],
      ];
      for (const [bx, by, bz] of bumps) {
        const b = new THREE.Mesh(bumpGeo, accMat);
        b.position.set(bx, by, bz);
        body.add(b);
      }

      const skinMat = mats.glossy('#34d399', 0.38, 0.04);
      headGroup.position.set(0, 0.24, 0.36);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_trt_head', () => new THREE.SphereGeometry(0.14, 10, 8)),
        skinMat,
      );
      headGroup.add(head);
      addCutePetFace(headGroup, 0.11, 0.02, 0.065, mats, geos);

      const flipGeo = getGeo(geos, 'pet_trt_leg', () => createRoundedBoxGeometry(0.12, 0.10, 0.16, 1, 0.04));
      for (const [lx, lz] of [[-0.24, 0.20], [0.24, 0.20], [-0.24, -0.20], [0.24, -0.20]]) {
        const fl = new THREE.Mesh(flipGeo, skinMat);
        fl.position.set(lx, 0.07, lz);
        body.add(fl);
        legs.push(fl);
      }
      tailGroup = new THREE.Group();
      const tail = new THREE.Mesh(
        getGeo(geos, 'pet_trt_tail', () => new THREE.ConeGeometry(0.04, 0.11, 5)),
        skinMat,
      );
      tail.rotation.x = -Math.PI / 2;
      tailGroup.add(tail);
      tailGroup.position.set(0, 0.14, -0.34);
      body.add(tailGroup);
      trayY = 0.56;
      break;
    }

    case 'panda': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_pnd_body', () => new THREE.SphereGeometry(0.27, 12, 10)),
        mainMat,
      );
      torso.scale.set(1.0, 0.95, 1.12);
      torso.position.set(0, 0.32, 0);
      const saddle = new THREE.Mesh(
        getGeo(geos, 'pet_pnd_sad', () => new THREE.CylinderGeometry(0.255, 0.265, 0.14, 12)),
        accMat,
      );
      saddle.position.set(0, 0.36, 0.04);
      body.add(torso, saddle);

      headGroup.position.set(0, 0.56, 0.18);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_pnd_head', () => new THREE.SphereGeometry(0.23, 12, 10)),
        mainMat,
      );
      headGroup.add(head);

      const patchGeo = getGeo(geos, 'pet_pnd_patch', () => new THREE.SphereGeometry(0.075, 8, 6));
      const earGeo = getGeo(geos, 'pet_pnd_ear', () => new THREE.SphereGeometry(0.08, 8, 8));
      for (const s of [-1, 1]) {
        const patch = new THREE.Mesh(patchGeo, accMat);
        patch.scale.set(1.0, 1.2, 0.4);
        patch.position.set(s * 0.09, 0.03, 0.185);
        patch.rotation.z = s * 0.25;
        const ear = new THREE.Mesh(earGeo, accMat);
        ear.position.set(s * 0.17, 0.19, 0);
        headGroup.add(patch, ear);
      }
      addCutePetFace(headGroup, 0.20, 0.03, 0.09, mats, geos);

      // Cute bamboo sprig
      const bamboo = new THREE.Mesh(
        getGeo(geos, 'pet_pnd_bam', () => new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6)),
        mats.glossy('#22c55e', 0.35, 0.05),
      );
      bamboo.position.set(0.14, -0.05, 0.18);
      bamboo.rotation.z = -0.7;
      headGroup.add(bamboo);

      const legGeo = getGeo(geos, 'pet_pnd_leg', () => new THREE.CylinderGeometry(0.068, 0.072, 0.18, 8));
      for (const [lx, lz] of [[-0.14, 0.15], [0.14, 0.15], [-0.14, -0.15], [0.14, -0.15]]) {
        const l = new THREE.Mesh(legGeo, accMat);
        l.position.set(lx, 0.09, lz);
        body.add(l);
        legs.push(l);
      }
      trayY = 0.88;
      break;
    }

    case 'bot': {
      const disc = new THREE.Mesh(
        getGeo(geos, 'pet_bot_disc', () => new THREE.CylinderGeometry(0.32, 0.34, 0.22, 16)),
        mainMat,
      );
      disc.position.set(0, 0.18, 0);
      const visor = new THREE.Mesh(
        getGeo(geos, 'pet_bot_visor', () => createRoundedBoxGeometry(0.36, 0.11, 0.12, 1, 0.035)),
        accMat,
      );
      visor.position.set(0, 0.20, 0.27);
      const ledMat = mats.emissiveGlow('#67e8f9', 1.1, 0.12);
      const ledGeo = getGeo(geos, 'pet_bot_led', () => new THREE.SphereGeometry(0.036, 8, 6));
      for (const s of [-1, 1]) {
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(s * 0.09, 0.20, 0.33);
        body.add(led);
      }
      const suction = new THREE.Mesh(
        getGeo(geos, 'pet_bot_suc', () => new THREE.TorusGeometry(0.28, 0.026, 6, 16)),
        mats.emissiveGlow('#38bdf8', 0.85, 0.2),
      );
      suction.rotation.x = Math.PI / 2;
      suction.position.y = 0.06;

      headGroup.position.set(0, 0.32, 0);
      const dome = new THREE.Mesh(
        getGeo(geos, 'pet_bot_dome', () => new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        mats.metallic('#e2e8f0'),
      );
      const ant = new THREE.Mesh(
        getGeo(geos, 'pet_bot_ant', () => new THREE.CylinderGeometry(0.014, 0.014, 0.18, 6)),
        mats.metallic('#94a3b8'),
      );
      ant.position.y = 0.27;
      const orb = new THREE.Mesh(
        getGeo(geos, 'pet_bot_orb', () => new THREE.SphereGeometry(0.045, 8, 6)),
        ledMat,
      );
      orb.position.y = 0.38;
      headGroup.add(dome, ant, orb);
      body.add(disc, visor, suction, headGroup);

      const whlGeo = getGeo(geos, 'pet_bot_whl', () => new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10));
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(whlGeo, accMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 0.32, 0.09, 0);
        body.add(w);
        legs.push(w);
      }
      trayY = 0.72;
      break;
    }

    case 'lucky_cat': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_body', () => new THREE.CapsuleGeometry(0.22, 0.20, 6, 12)),
        mainMat,
      );
      torso.position.set(0, 0.32, 0);
      const collar = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_col', () => new THREE.TorusGeometry(0.18, 0.035, 6, 14)),
        accMat,
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.45, 0);
      const bell = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_bell', () => new THREE.SphereGeometry(0.055, 8, 8)),
        mats.metallic('#fde047', 0.16, 0.85),
      );
      bell.position.set(0, 0.43, 0.20);
      const koban = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_koban', () => createRoundedBoxGeometry(0.14, 0.20, 0.04, 1, 0.03)),
        mats.metallic('#fef08a', 0.16, 0.85),
      );
      koban.position.set(0, 0.25, 0.21);
      body.add(torso, collar, bell, koban);

      headGroup.position.set(0, 0.56, 0.02);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_head', () => new THREE.SphereGeometry(0.21, 12, 10)),
        mainMat,
      );
      const earGeo = getGeo(geos, 'pet_lcat_ear', () => new THREE.ConeGeometry(0.072, 0.15, 4));
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, mainMat);
        ear.position.set(s * 0.13, 0.18, 0);
        const inner = new THREE.Mesh(
          getGeo(geos, 'pet_lcat_inear', () => new THREE.ConeGeometry(0.045, 0.10, 4)),
          accMat,
        );
        inner.position.set(s * 0.13, 0.17, 0.03);
        headGroup.add(ear, inner);
      }
      headGroup.add(head);
      addCutePetFace(headGroup, 0.18, 0.02, 0.085, mats, geos);

      // Raised waving beckoning right paw!
      const wavePaw = new THREE.Mesh(
        getGeo(geos, 'pet_lcat_wave', () => new THREE.CapsuleGeometry(0.055, 0.16, 4, 8)),
        mainMat,
      );
      wavePaw.position.set(0.24, 0.54, 0.08);
      wavePaw.rotation.z = -0.35;
      rightWing = wavePaw;
      body.add(wavePaw);

      const footGeo = getGeo(geos, 'pet_lcat_foot', () => new THREE.SphereGeometry(0.075, 8, 6));
      for (const s of [-1, 1]) {
        const f = new THREE.Mesh(footGeo, mainMat);
        f.position.set(s * 0.12, 0.08, 0.16);
        body.add(f);
        legs.push(f);
      }
      trayY = 0.88;
      break;
    }

    case 'red_fox': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_fox_body', () => createRoundedBoxGeometry(0.36, 0.26, 0.52, 2, 0.11)),
        mainMat,
      );
      torso.position.set(0, 0.28, 0);
      const tummy = new THREE.Mesh(
        getGeo(geos, 'pet_fox_tum', () => createRoundedBoxGeometry(0.28, 0.12, 0.42, 1, 0.05)),
        mats.std('#3d2314', 0.55, 0.04),
      );
      tummy.position.set(0, 0.17, 0);
      body.add(torso, tummy);

      headGroup.position.set(0, 0.46, 0.24);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_fox_head', () => new THREE.SphereGeometry(0.20, 12, 10)),
        mainMat,
      );
      const mask = new THREE.Mesh(
        getGeo(geos, 'pet_fox_mask', () => createRoundedBoxGeometry(0.24, 0.11, 0.10, 1, 0.04)),
        accMat,
      );
      mask.position.set(0, -0.04, 0.15);
      const earGeo = getGeo(geos, 'pet_fox_ear', () => new THREE.ConeGeometry(0.075, 0.16, 5));
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, accMat);
        ear.position.set(s * 0.14, 0.17, 0);
        ear.rotation.z = s * -0.25;
        headGroup.add(ear);
      }
      headGroup.add(head, mask);
      addCutePetFace(headGroup, 0.17, 0.04, 0.085, mats, geos);

      const pawGeo = getGeo(geos, 'pet_fox_paw', () => new THREE.CylinderGeometry(0.052, 0.056, 0.16, 8));
      const darkPaw = mats.std('#291810', 0.52, 0.05);
      for (const [lx, lz] of [[-0.12, 0.16], [0.12, 0.16], [-0.12, -0.16], [0.12, -0.16]]) {
        const p = new THREE.Mesh(pawGeo, darkPaw);
        p.position.set(lx, 0.08, lz);
        body.add(p);
        legs.push(p);
      }

      // Oversized bushy ringed tail (4 alternating spheres!)
      tailGroup = new THREE.Group();
      const ringGeo = getGeo(geos, 'pet_fox_tring', () => new THREE.SphereGeometry(0.115, 8, 8));
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(ringGeo, i % 2 === 0 ? mainMat : accMat);
        seg.scale.setScalar(1.05 - i * 0.1);
        seg.position.set(0, 0.04 + i * 0.04, -i * 0.13);
        tailGroup.add(seg);
      }
      tailGroup.position.set(0, 0.30, -0.28);
      body.add(tailGroup);
      break;
    }

    case 'kraken': {
      const mantle = new THREE.Mesh(
        getGeo(geos, 'pet_krk_mantle', () => new THREE.SphereGeometry(0.28, 12, 10)),
        mainMat,
      );
      mantle.scale.set(0.95, 1.15, 0.95);
      mantle.position.set(0, 0.42, 0);
      body.add(mantle);

      const finGeo = getGeo(geos, 'pet_krk_fin', () => new THREE.SphereGeometry(0.095, 8, 6));
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(finGeo, accMat);
        fin.scale.set(1.2, 0.45, 0.8);
        fin.position.set(s * 0.26, 0.54, 0);
        body.add(fin);
      }
      const spotGeo = getGeo(geos, 'pet_krk_spot', () => new THREE.SphereGeometry(0.042, 6, 6));
      const spotMat = mats.emissiveGlow(accentColor, 0.8, 0.2);
      for (const [sx, sy, sz] of [[-0.14, 0.62, 0.12], [0.16, 0.58, -0.10], [0, 0.66, -0.12]]) {
        const sp = new THREE.Mesh(spotGeo, spotMat);
        sp.position.set(sx, sy, sz);
        body.add(sp);
      }

      headGroup.position.set(0, 0.38, 0.06);
      body.add(headGroup);
      addCutePetFace(headGroup, 0.20, 0.0, 0.10, mats, geos);

      // 6 plump radial curled tentacles!
      const tentGeo = getGeo(geos, 'pet_krk_tent', () => new THREE.CapsuleGeometry(0.055, 0.18, 4, 8));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tent = new THREE.Mesh(tentGeo, mainMat);
        tent.position.set(Math.cos(a) * 0.22, 0.11, Math.sin(a) * 0.22);
        tent.rotation.z = -Math.cos(a) * 0.85;
        tent.rotation.x = Math.sin(a) * 0.85;
        body.add(tent);
        legs.push(tent);
      }
      trayY = 0.86;
      break;
    }

    case 'dragon': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_drg_body', () => createRoundedBoxGeometry(0.36, 0.30, 0.52, 2, 0.12)),
        mainMat,
      );
      torso.position.set(0, 0.32, 0);
      const belly = new THREE.Mesh(
        getGeo(geos, 'pet_drg_belly', () => createRoundedBoxGeometry(0.24, 0.22, 0.38, 1, 0.06)),
        accMat,
      );
      belly.position.set(0, 0.26, 0.10);
      body.add(torso, belly);

      headGroup.position.set(0, 0.52, 0.24);
      body.add(headGroup);
      const head = new THREE.Mesh(
        getGeo(geos, 'pet_drg_head', () => new THREE.SphereGeometry(0.20, 12, 10)),
        mainMat,
      );
      const snout = new THREE.Mesh(
        getGeo(geos, 'pet_drg_snout', () => createRoundedBoxGeometry(0.18, 0.12, 0.16, 1, 0.045)),
        mainMat,
      );
      snout.position.set(0, -0.04, 0.16);
      const hornGeo = getGeo(geos, 'pet_drg_horn', () => new THREE.ConeGeometry(0.045, 0.18, 6));
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, accMat);
        horn.position.set(s * 0.12, 0.20, -0.04);
        horn.rotation.set(-0.35, 0, s * -0.3);
        headGroup.add(horn);
      }
      headGroup.add(head, snout);
      addCutePetFace(headGroup, 0.17, 0.04, 0.09, mats, geos);

      // Sculpted bat-dragon wings
      const wingGeo = getGeo(geos, 'pet_drg_wing', () => createRoundedBoxGeometry(0.28, 0.22, 0.04, 1, 0.015));
      const lw = new THREE.Mesh(wingGeo, accMat);
      lw.position.set(-0.30, 0.44, -0.02);
      lw.rotation.set(0.2, 0.35, 0.35);
      const rw = new THREE.Mesh(wingGeo, accMat);
      rw.position.set(0.30, 0.44, -0.02);
      rw.rotation.set(0.2, -0.35, -0.35);
      leftWing = lw;
      rightWing = rw;
      body.add(lw, rw);

      const legGeo = getGeo(geos, 'pet_drg_leg', () => new THREE.CylinderGeometry(0.058, 0.064, 0.18, 8));
      for (const [lx, lz] of [[-0.13, 0.16], [0.13, 0.16], [-0.13, -0.16], [0.13, -0.16]]) {
        const l = new THREE.Mesh(legGeo, mainMat);
        l.position.set(lx, 0.09, lz);
        body.add(l);
        legs.push(l);
      }

      tailGroup = new THREE.Group();
      const tailShaft = new THREE.Mesh(
        getGeo(geos, 'pet_drg_tail', () => new THREE.ConeGeometry(0.08, 0.38, 6)),
        mainMat,
      );
      tailShaft.rotation.x = -Math.PI / 2 - 0.25;
      tailShaft.position.set(0, 0.05, -0.16);
      const flameSpade = new THREE.Mesh(
        getGeo(geos, 'pet_drg_flame', () => new THREE.OctahedronGeometry(0.085, 0)),
        mats.emissiveGlow(accentColor, 0.95, 0.15),
      );
      flameSpade.position.set(0, 0.10, -0.36);
      tailGroup.add(tailShaft, flameSpade);
      tailGroup.position.set(0, 0.30, -0.24);
      body.add(tailGroup);
      trayY = 0.86;
      break;
    }

    case 'mole': {
      const torso = new THREE.Mesh(
        getGeo(geos, 'pet_mol_body', () => new THREE.SphereGeometry(0.26, 12, 10)),
        mainMat,
      );
      torso.scale.set(1.02, 0.88, 1.15);
      torso.position.set(0, 0.26, 0);
      body.add(torso);

      headGroup.position.set(0, 0.40, 0.18);
      body.add(headGroup);
      const snout = new THREE.Mesh(
        getGeo(geos, 'pet_mol_snout', () => new THREE.SphereGeometry(0.08, 8, 8)),
        mats.glossy('#fb7185', 0.32, 0.05),
      );
      snout.position.set(0, -0.02, 0.18);
      // Miniature golden miner hard-hat + glowing headlamp!
      const hat = new THREE.Mesh(
        getGeo(geos, 'pet_mol_hat', () => new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
        accMat,
      );
      hat.position.set(0, 0.08, -0.04);
      const lamp = new THREE.Mesh(
        getGeo(geos, 'pet_mol_lamp', () => new THREE.CylinderGeometry(0.055, 0.055, 0.06, 10)),
        mats.emissiveGlow('#fef08a', 1.1, 0.12),
      );
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(0, 0.17, 0.15);
      headGroup.add(snout, hat, lamp);
      addCutePetFace(headGroup, 0.14, 0.04, 0.08, mats, geos);

      const digMat = mats.glossy('#fbcfe8', 0.4, 0.04);
      const frontPawGeo = getGeo(geos, 'pet_mol_fpaw', () => createRoundedBoxGeometry(0.14, 0.08, 0.18, 1, 0.03));
      const backPawGeo = getGeo(geos, 'pet_mol_bpaw', () => createRoundedBoxGeometry(0.10, 0.08, 0.12, 1, 0.03));
      for (const s of [-1, 1]) {
        const fp = new THREE.Mesh(frontPawGeo, digMat);
        fp.position.set(s * 0.21, 0.07, 0.18);
        const bp = new THREE.Mesh(backPawGeo, digMat);
        bp.position.set(s * 0.15, 0.06, -0.18);
        body.add(fp, bp);
        legs.push(fp, bp);
      }
      trayY = 0.78;
      break;
    }

    case 'gnome': {
      const tunic = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_body', () => new THREE.CapsuleGeometry(0.20, 0.18, 6, 10)),
        mainMat,
      );
      tunic.position.set(0, 0.30, 0);
      const belt = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_belt', () => new THREE.CylinderGeometry(0.215, 0.215, 0.07, 12)),
        mats.std('#3d2314'),
      );
      belt.position.set(0, 0.26, 0);
      const buckle = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_bkl', () => createRoundedBoxGeometry(0.08, 0.08, 0.04, 1, 0.01)),
        accMat,
      );
      buckle.position.set(0, 0.26, 0.21);
      body.add(tunic, belt, buckle);

      headGroup.position.set(0, 0.50, 0);
      body.add(headGroup);
      const face = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_face', () => new THREE.SphereGeometry(0.16, 10, 8)),
        mats.std('#fbd3b0', 0.52, 0.02),
      );
      const nose = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_nose', () => new THREE.SphereGeometry(0.062, 8, 8)),
        mats.glossy('#fb7185', 0.38, 0.04),
      );
      nose.position.set(0, -0.02, 0.16);
      const beard = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_beard', () => new THREE.ConeGeometry(0.15, 0.26, 8)),
        mats.glossy('#ffffff', 0.45, 0.02),
      );
      beard.rotation.x = Math.PI;
      beard.position.set(0, -0.15, 0.10);
      const tallHat = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_hat', () => new THREE.ConeGeometry(0.20, 0.44, 10)),
        mainMat,
      );
      tallHat.position.set(0, 0.26, -0.02);
      tallHat.rotation.x = -0.18;
      const hatBand = new THREE.Mesh(
        getGeo(geos, 'pet_gnm_band', () => new THREE.TorusGeometry(0.175, 0.026, 6, 14)),
        accMat,
      );
      hatBand.rotation.x = Math.PI / 2;
      hatBand.position.set(0, 0.08, 0);
      headGroup.add(face, nose, beard, tallHat, hatBand);
      addCutePetFace(headGroup, 0.13, 0.03, 0.065, mats, geos);

      const bootGeo = getGeo(geos, 'pet_gnm_boot', () => createRoundedBoxGeometry(0.12, 0.10, 0.18, 1, 0.03));
      const bootMat = mats.std('#3d2314');
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(bootGeo, bootMat);
        b.position.set(s * 0.10, 0.06, 0.04);
        body.add(b);
        legs.push(b);
      }
      trayY = 0.98;
      break;
    }
  }

  // Delivery dish tray atop pet (visible only while carryingDish)
  const dishTray = new THREE.Mesh(
    getGeo(geos, 'pet_dish_tray', () => new THREE.CylinderGeometry(0.26, 0.24, 0.055, 14)),
    mats.metallic('#facc15', 0.22, 0.72),
  );
  dishTray.position.set(0, trayY, 0.02);
  dishTray.visible = false;
  body.add(dishTray);

  const dishAnchor = new THREE.Group();
  dishAnchor.position.set(0, 0.03, 0);
  dishTray.add(dishAnchor);

  const qualityHalo = new THREE.Mesh(
    getGeo(geos, 'pet_quality_halo', () => new THREE.TorusGeometry(0.29, 0.032, 8, 16)),
    mats.basicMat('#facc15', 0.92, false),
  );
  qualityHalo.rotation.x = Math.PI / 2;
  qualityHalo.position.y = 0.12;
  qualityHalo.visible = false;
  dishTray.add(qualityHalo);

  enableShadows(body, true, true);
  qualityHalo.castShadow = false;
  qualityHalo.receiveShadow = false;

  return {
    root,
    body,
    dishTray,
    modelStyle,
    headGroup,
    tailGroup,
    leftWing,
    rightWing,
    legs,
    dishAnchor,
    qualityHalo,
    contactShadow,
    currentDishKey: '',
  };
}

// =========================================================================
// ROUNDED GLOSSY DRIVE-THRU CARS (SPINNING WHEELS + CHIBI DRIVER HEAD)
// =========================================================================

export function buildDriveThruCarRig(
  color: string,
  isGolden: boolean,
  mats: MaterialPool,
  geos?: GeometryPool,
  shadowTex?: THREE.Texture | null,
): DriveThruCarRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Soft oval contact shadow
  const contactShadow = new THREE.Mesh(
    getGeo(geos, 'car_shadow_quad', () => new THREE.PlaneGeometry(1, 1)),
    mats.contactShadow(shadowTex ?? null),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(2.05, 1.24, 1);
  contactShadow.position.y = 0.025;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  contactShadow.raycast = () => {};
  root.add(contactShadow);

  const paintMat = isGolden
    ? mats.metallic('#facc15', 0.16, 0.82, '#f59e0b', 0.35)
    : mats.glossy(color, 0.24, 0.28);

  // Rounded glossy chassis (+X is front)
  const chassisMesh = new THREE.Mesh(
    getGeo(geos, 'car_chassis', () => createRoundedBoxGeometry(1.78, 0.48, 0.98, 2, 0.14)),
    paintMat,
  );
  chassisMesh.position.set(0, 0.42, 0);
  bodyGroup.add(chassisMesh);

  // Cab roof cap + slim pillars
  const roofMesh = new THREE.Mesh(
    getGeo(geos, 'car_roof', () => createRoundedBoxGeometry(0.92, 0.12, 0.82, 2, 0.05)),
    paintMat,
  );
  roofMesh.position.set(-0.08, 0.96, 0);
  bodyGroup.add(roofMesh);

  const pillarGeo = getGeo(geos, 'car_pillar', () => new THREE.CylinderGeometry(0.025, 0.028, 0.32, 6));
  const pillarMat = mats.std('#1e293b', 0.4, 0.2);
  for (const [px, pz] of [[-0.48, -0.36], [-0.48, 0.36], [0.32, -0.36], [0.32, 0.36]]) {
    const pil = new THREE.Mesh(pillarGeo, pillarMat);
    pil.position.set(px, 0.78, pz);
    bodyGroup.add(pil);
  }

  // Transparent glossy windshield / cabin glass (revealing chibi driver!)
  const cabinGlass = new THREE.Mesh(
    getGeo(geos, 'car_glass', () => createRoundedBoxGeometry(0.94, 0.34, 0.84, 1, 0.08)),
    mats.glass('#bae6fd', 0.40),
  );
  cabinGlass.position.set(-0.08, 0.78, 0);
  cabinGlass.castShadow = false;
  cabinGlass.receiveShadow = false;
  cabinGlass.renderOrder = 2;
  bodyGroup.add(cabinGlass);

  // Cute chibi driver head visible inside cabin facing +X
  const driverHead = new THREE.Group();
  driverHead.position.set(0.04, 0.74, 0.14);
  driverHead.rotation.y = Math.PI / 2;
  const drvSkull = new THREE.Mesh(
    getGeo(geos, 'car_drv_head', () => new THREE.SphereGeometry(0.175, 10, 8)),
    mats.std('#fbd3b0', 0.52, 0.02),
  );
  const drvHair = new THREE.Mesh(
    getGeo(geos, 'car_drv_hair', () => new THREE.SphereGeometry(0.185, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)),
    mats.glossy('#451a03', 0.38, 0.05),
  );
  drvHair.position.y = 0.02;
  driverHead.add(drvSkull, drvHair);
  addCutePetFace(driverHead, 0.145, 0.01, 0.065, mats, geos);
  const steeringWheel = new THREE.Mesh(
    getGeo(geos, 'car_steer', () => new THREE.TorusGeometry(0.09, 0.016, 6, 12)),
    pillarMat,
  );
  steeringWheel.position.set(0, -0.07, 0.22);
  steeringWheel.rotation.x = 0.45;
  driverHead.add(steeringWheel);
  bodyGroup.add(driverHead);

  // Chrome front & rear bumpers
  const chromeMat = mats.metallic('#e2e8f0', 0.2, 0.75);
  const bumperGeo = getGeo(geos, 'car_bumper', () => createRoundedBoxGeometry(0.14, 0.13, 0.92, 1, 0.045));
  for (const sx of [-0.90, 0.90]) {
    const bump = new THREE.Mesh(bumperGeo, chromeMat);
    bump.position.set(sx, 0.27, 0);
    bodyGroup.add(bump);
  }

  // Front grille + glowing warm headlights (+X) & ruby taillights (-X)
  const grille = new THREE.Mesh(
    getGeo(geos, 'car_grille', () => createRoundedBoxGeometry(0.05, 0.14, 0.36, 1, 0.015)),
    chromeMat,
  );
  grille.position.set(0.89, 0.42, 0);
  bodyGroup.add(grille);

  const headLightMat = mats.emissiveGlow('#fef9c3', 1.0, 0.12);
  const tailLightMat = mats.emissiveGlow('#ef4444', 0.9, 0.15);
  const lightGeo = getGeo(geos, 'car_light', () => new THREE.SphereGeometry(0.085, 8, 8));
  for (const sz of [-0.30, 0.30]) {
    const hl = new THREE.Mesh(lightGeo, headLightMat);
    hl.scale.set(0.5, 1, 1);
    hl.position.set(0.89, 0.45, sz);
    const tl = new THREE.Mesh(lightGeo, tailLightMat);
    tl.scale.set(0.5, 0.9, 1);
    tl.position.set(-0.89, 0.45, sz);
    bodyGroup.add(hl, tl);
  }

  // Golden car miniature hood crown
  const hoodCrown = buildGoldenMiniCrown(mats, geos);
  hoodCrown.scale.setScalar(0.65);
  hoodCrown.position.set(0.62, 0.66, 0);
  hoodCrown.visible = isGolden;
  bodyGroup.add(hoodCrown);

  // 4 spinning wheel groups (spin around local Z axis when driving along +X!)
  const tireGeo = getGeo(geos, 'car_tire', () => new THREE.CylinderGeometry(0.23, 0.23, 0.17, 14));
  const hubGeo = getGeo(geos, 'car_hub', () => new THREE.CylinderGeometry(0.13, 0.13, 0.185, 10));
  const spokeGeo = getGeo(geos, 'car_spoke', () => new THREE.BoxGeometry(0.19, 0.036, 0.195));
  const tireMat = mats.std('#1e293b', 0.72, 0.05);

  const wheels: THREE.Group[] = [];
  for (const [wx, wz] of [[-0.54, -0.49], [-0.54, 0.49], [0.54, -0.49], [0.54, 0.49]]) {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.23, wz);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    hub.rotation.x = Math.PI / 2;
    const spoke = new THREE.Mesh(spokeGeo, pillarMat);
    wg.add(tire, hub, spoke);
    root.add(wg);
    wheels.push(wg);
  }

  enableShadows(bodyGroup, true, true);
  cabinGlass.castShadow = false;
  cabinGlass.receiveShadow = false;
  for (const wg of wheels) enableShadows(wg, true, true);

  const rig: DriveThruCarRig = {
    root,
    bodyGroup,
    chassisMesh,
    roofMesh,
    hoodCrown,
    wheels,
    driverHead,
    contactShadow,
    isGolden,
  };
  root.userData.carRig = rig;
  root.userData.wheels = wheels;
  root.userData.bodyGroup = bodyGroup;
  root.userData.driverHead = driverHead;
  root.userData.contactShadow = contactShadow;
  return rig;
}

export function restyleDriveThruCar(
  rig: DriveThruCarRig,
  color: string,
  isGolden: boolean,
  mats: MaterialPool,
): void {
  const paintMat = isGolden
    ? mats.metallic('#facc15', 0.16, 0.82, '#f59e0b', 0.35)
    : mats.glossy(color, 0.24, 0.28);
  rig.chassisMesh.material = paintMat;
  rig.roofMesh.material = paintMat;
  rig.hoodCrown.visible = isGolden;
  rig.isGolden = isGolden;
}

export function buildDriveThruCar(
  color: string,
  isGolden: boolean,
  mats: MaterialPool,
  geos?: GeometryPool,
): THREE.Group {
  return buildDriveThruCarRig(color, isGolden, mats, geos).root;
}

// =========================================================================
// EMBOSSED GLEAMING TIP COIN STACK
// =========================================================================

export function buildTipCoinStack(
  mats: MaterialPool,
  tipId: string,
  geos?: GeometryPool,
  shadowTex?: THREE.Texture | null,
): THREE.Group {
  const g = new THREE.Group();

  // Tabletop shadow disc sitting flush on table/counter surface (y = 0.80)
  const shadow = new THREE.Mesh(
    getGeo(geos, 'tip_shadow', () => new THREE.CircleGeometry(0.30, 14)),
    mats.contactShadow(shadowTex ?? null),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.80;
  shadow.castShadow = false;
  shadow.receiveShadow = false;
  g.add(shadow);

  const coinMat = mats.metallic('#facc15', 0.16, 0.84, '#f59e0b', 0.35);
  const rimMat = mats.metallic('#eab308', 0.18, 0.85);
  const coinGeo = getGeo(geos, 'tip_coin', () => new THREE.CylinderGeometry(0.22, 0.22, 0.065, 16));
  const rimGeo = getGeo(geos, 'tip_coin_rim', () => new THREE.TorusGeometry(0.20, 0.022, 6, 16));

  const offsets: Array<[number, number]> = [
    [0, 0],
    [-0.02, 0.02],
    [0.04, -0.01],
    [0.01, 0.03],
  ];
  for (let i = 0; i < 4; i++) {
    const [ox, oz] = offsets[i];
    const y = 0.84 + i * 0.08;
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.set(ox, y, oz);
    coin.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(ox, y + 0.025, oz);
    g.add(coin, rim);
  }

  // Top embossed star emblem
  const emblem = new THREE.Mesh(
    getGeo(geos, 'tip_emblem', () => new THREE.CylinderGeometry(0.10, 0.10, 0.018, 6)),
    mats.metallic('#fef08a', 0.14, 0.88),
  );
  emblem.position.set(0.01, 1.12, 0.03);
  g.add(emblem);

  // Floating gleam 4-point sparkle star cap
  const sparkleMat = mats.emissiveGlow('#fef9c3', 1.1, 0.12);
  const sparkGeo = getGeo(geos, 'tip_spark', () => new THREE.OctahedronGeometry(0.085, 0));
  const s1 = new THREE.Mesh(sparkGeo, sparkleMat);
  s1.scale.set(0.35, 1.25, 0.35);
  s1.position.set(0.14, 1.25, 0.08);
  const s2 = new THREE.Mesh(sparkGeo, sparkleMat);
  s2.scale.set(1.25, 0.35, 0.35);
  s2.position.set(0.14, 1.25, 0.08);
  g.add(s1, s2);

  // Tag EVERY descendant mesh for guaranteed raycast tip resolution
  g.traverse((obj) => {
    obj.userData.pickType = 'tip';
    obj.userData.tipId = tipId;
  });
  return g;
}
