import * as THREE from 'three';
import type {
  GearTemplate,
  RestaurantLayout,
  RestaurantTemplate,
  StationTemplate,
} from '@/types/game';

/**
 * Shared material cache so every low-poly entity reuses GPU shader programs
 * and avoids per-frame allocations on mobile Android GPUs.
 */
export class MaterialPool {
  private standard = new Map<string, THREE.MeshStandardMaterial>();
  private basic = new Map<string, THREE.MeshBasicMaterial>();

  std(color: string, roughness = 0.65, metalness = 0.08, emissive?: string): THREE.MeshStandardMaterial {
    const key = `${color}_${roughness}_${metalness}_${emissive ?? ''}`;
    let mat = this.standard.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness,
        metalness,
        emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
        emissiveIntensity: emissive ? 0.45 : 0,
      });
      this.standard.set(key, mat);
    }
    return mat;
  }

  basicMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
    const key = `${color}_${opacity}`;
    let mat = this.basic.get(key);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
      });
      this.basic.set(key, mat);
    }
    return mat;
  }

  dispose(): void {
    for (const m of this.standard.values()) m.dispose();
    for (const m of this.basic.values()) m.dispose();
    this.standard.clear();
    this.basic.clear();
  }
}

function addShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

// ============================================================================
// ENVIRONMENT BUILDER (6 ARCHETYPES + THEMED CITY SURROUNDINGS)
// ============================================================================

export function buildEnvironmentGroup(
  template: RestaurantTemplate,
  layout: RestaurantLayout,
  cityGroundColor: string,
  mats: MaterialPool,
): THREE.Group {
  const group = new THREE.Group();
  const { width, depth } = layout;

  // Wide city ground plane around the restaurant
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(width + 30, depth + 36),
    mats.std(cityGroundColor, 0.92, 0),
  );
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.y = -0.06;
  outerGround.receiveShadow = true;
  group.add(outerGround);

  // Main stylized restaurant floor slab with border curb
  const floorBase = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.5, 0.14, depth + 0.5),
    mats.std('#475569', 0.8, 0.05),
  );
  floorBase.position.y = -0.07;
  floorBase.receiveShadow = true;
  group.add(floorBase);

  const floorTop = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, depth),
    mats.std(template.themeFloorColor, 0.78, 0.04),
  );
  floorTop.position.y = 0.01;
  floorTop.receiveShadow = true;
  group.add(floorTop);

  // Subtle checkerboard accent tiles using InstancedMesh (1 draw call!)
  const tileSize = 1.6;
  const cols = Math.floor(width / tileSize);
  const rows = Math.floor(depth / tileSize);
  const tileGeo = new THREE.PlaneGeometry(tileSize * 0.94, tileSize * 0.94);
  const altColor = new THREE.Color(template.themeFloorColor).multiplyScalar(0.92);
  const tileMat = new THREE.MeshStandardMaterial({
    color: altColor,
    roughness: 0.82,
    metalness: 0.02,
  });
  const tileCount = Math.ceil((cols * rows) / 2);
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, tileCount);
  const dummy = new THREE.Object3D();
  let tIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 !== 0) continue;
      if (tIdx >= tileCount) break;
      dummy.position.set(
        -width / 2 + (c + 0.5) * tileSize + (width - cols * tileSize) / 2,
        0.045,
        -depth / 2 + (r + 0.5) * tileSize + (depth - rows * tileSize) / 2,
      );
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      tiles.setMatrixAt(tIdx++, dummy.matrix);
    }
  }
  tiles.count = tIdx;
  tiles.receiveShadow = true;
  group.add(tiles);

  // Back wall + decorative trim + restaurant fascia sign
  const wallH = 2.6;
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, wallH, 0.35),
    mats.std(template.themeWallColor, 0.72, 0.04),
  );
  backWall.position.set(0, wallH / 2, -depth / 2 - 0.15);
  addShadows(backWall, true, true);
  group.add(backWall);

  // Side low walls
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 1.4, depth),
    mats.std(template.themeWallColor, 0.75, 0.04),
  );
  leftWall.position.set(-width / 2 - 0.15, 0.7, 0);
  addShadows(leftWall, true, true);
  group.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.x = width / 2 + 0.15;
  group.add(rightWall);

  // Striped stylized roof awning along the back wall
  const stripeCount = Math.max(6, Math.floor(width / 1.1));
  const stripeW = width / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const color = i % 2 === 0 ? template.themeRoofColor : '#fffdf7';
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeW, 0.16, 1.35),
      mats.std(color, 0.55, 0.05),
    );
    stripe.position.set(-width / 2 + (i + 0.5) * stripeW, wallH + 0.06, -depth / 2 + 0.45);
    stripe.rotation.x = 0.24;
    addShadows(stripe, true, false);
    group.add(stripe);
  }

  // Accent signboard centered on back wall
  const signFrame = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(5.2, width * 0.52), 0.72, 0.22),
    mats.std(template.themeAccentColor, 0.4, 0.15, template.themeAccentColor),
  );
  signFrame.position.set(0, wallH + 0.46, -depth / 2 - 0.05);
  group.add(signFrame);

  // Archetype-specific architecture
  if (template.archetype === 'counter_stand') {
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1.6, 0.95, 0.85),
      mats.std(template.themeAccentColor, 0.55, 0.08),
    );
    counter.position.set(0, 0.48, 0.7);
    addShadows(counter);
    group.add(counter);

    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1.4, 0.12, 1.05),
      mats.std('#fffbf2', 0.35, 0.05),
    );
    counterTop.position.set(0, 0.99, 0.7);
    addShadows(counterTop);
    group.add(counterTop);
  } else if (template.archetype === 'food_truck') {
    // Detailed stylized low-poly food truck framing the kitchen!
    const truckGroup = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1.4, 0.9, 0.7),
      mats.std(template.themeRoofColor, 0.42, 0.2),
    );
    hull.position.set(0, 0.5, 0.75);
    truckGroup.add(hull);

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(width - 2.0, 0.1, 0.95),
      mats.std('#f8fafc', 0.35, 0.1),
    );
    shelf.position.set(0, 0.98, 0.75);
    truckGroup.add(shelf);

    // Truck cab nose on the right side
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.7, 2.2),
      mats.std(template.themeAccentColor, 0.4, 0.2),
    );
    cab.position.set(width / 2 - 0.4, 1.0, -0.3);
    truckGroup.add(cab);

    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.75, 1.8),
      mats.std('#7dd3fc', 0.15, 0.4),
    );
    windshield.position.set(width / 2 + 0.42, 1.35, -0.3);
    truckGroup.add(windshield);

    // 4 chunky wheels
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 14);
    const wheelMat = mats.std('#1e293b', 0.85, 0.1);
    for (const [wx, wz] of [
      [-width / 2 + 1.8, 1.1],
      [width / 2 - 0.8, 1.1],
      [-width / 2 + 1.8, -3.5],
      [width / 2 - 0.8, -3.5],
    ]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.45, wz);
      truckGroup.add(w);
    }
    addShadows(truckGroup);
    group.add(truckGroup);
  } else if (layout.isDriveThru) {
    // Asphalt road lane + crisp yellow center stripe + window counter
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width + 24, 0.08, 4.4),
      mats.std('#334155', 0.9, 0.02),
    );
    road.position.set(0, 0.03, depth / 2 - 2.3);
    road.receiveShadow = true;
    group.add(road);

    for (let x = -width / 2 - 8; x <= width / 2 + 8; x += 2.2) {
      const dash = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.02, 0.14),
        mats.std('#facc15', 0.6, 0),
      );
      dash.position.set(x, 0.08, depth / 2 - 2.3);
      group.add(dash);
    }

    const serviceWindow = new THREE.Mesh(
      new THREE.BoxGeometry(width - 1.6, 0.95, 0.75),
      mats.std(template.themeAccentColor, 0.5, 0.1),
    );
    serviceWindow.position.set(0, 0.48, depth / 2 - 4.7);
    addShadows(serviceWindow);
    group.add(serviceWindow);
  }

  // Kitchen pass counter for waiter_dining & grand_hall
  if (layout.passCounterPos) {
    const passLen = width - 3.0;
    const passBase = new THREE.Mesh(
      new THREE.BoxGeometry(passLen, 0.92, 0.8),
      mats.std('#334155', 0.5, 0.15),
    );
    passBase.position.set(0, 0.46, layout.passCounterPos.z);
    addShadows(passBase);
    group.add(passBase);

    const passMarble = new THREE.Mesh(
      new THREE.BoxGeometry(passLen + 0.2, 0.12, 0.96),
      mats.std('#f8fafc', 0.25, 0.1),
    );
    passMarble.position.set(0, 0.96, layout.passCounterPos.z);
    addShadows(passMarble);
    group.add(passMarble);
  }

  // Stylized Dining Tables & Chairs for table-based layouts
  const seenTables = new Set<string>();
  for (const slot of layout.slots) {
    if (slot.kind !== 'table') continue;
    const tKey = `${slot.tipPos.x.toFixed(1)},${slot.tipPos.z.toFixed(1)}`;
    if (seenTables.has(tKey)) continue;
    seenTables.add(tKey);

    const tableGrp = new THREE.Group();
    tableGrp.position.set(slot.tipPos.x, 0, slot.tipPos.z);

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.22, 0.68, 10),
      mats.std('#475569', 0.5, 0.3),
    );
    leg.position.y = 0.34;
    tableGrp.add(leg);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.1, 14),
      mats.std('#fff7ed', 0.45, 0.05),
    );
    top.position.y = 0.72;
    tableGrp.add(top);

    const cloth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.11, 14),
      mats.std(template.themeAccentColor, 0.65, 0.02),
    );
    cloth.position.y = 0.725;
    tableGrp.add(cloth);

    // 2 cute wooden stools
    for (const cx of [-0.68, 0.68]) {
      const chair = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.2, 0.44, 10),
        mats.std('#b45309', 0.7, 0.05),
      );
      chair.position.set(cx, 0.22, 0.48);
      tableGrp.add(chair);
    }

    addShadows(tableGrp);
    group.add(tableGrp);
  }

  // Cozy decorative potted trees flanking entrance & corners
  const plantCoords = [
    [-width / 2 - 0.9, -depth / 2 + 1.0],
    [width / 2 + 0.9, -depth / 2 + 1.0],
    [-width / 2 - 0.9, depth / 2 - 0.8],
    [width / 2 + 0.9, depth / 2 - 0.8],
  ];
  for (const [px, pz] of plantCoords) {
    const plant = buildPottedTree(mats);
    plant.position.set(px, 0, pz);
    group.add(plant);
  }

  // Warm glowing café bulbs hanging under the awning
  const bulbGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const bulbMat = mats.std('#fef08a', 0.2, 0.1, '#facc15');
  const bulbCount = Math.max(5, Math.floor(width / 1.8));
  for (let i = 0; i < bulbCount; i++) {
    const t = bulbCount === 1 ? 0.5 : i / (bulbCount - 1);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(-width / 2 + 0.8 + t * (width - 1.6), wallH - 0.15, -depth / 2 + 1.0);
    group.add(bulb);
  }

  // Front sidewalk stone strip & welcome mat (for pedestrian venues)
  if (!layout.isDriveThru) {
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(width + 18, 0.05, 2.4),
      mats.std('#d6d3d1', 0.88, 0.02),
    );
    sidewalk.position.set(0, -0.02, depth / 2 + 1.5);
    sidewalk.receiveShadow = true;
    group.add(sidewalk);

    const welcomeMat = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.04, 1.1),
      mats.std(template.themeAccentColor, 0.85, 0),
    );
    welcomeMat.position.set(0, 0.05, depth / 2 - 0.55);
    welcomeMat.receiveShadow = true;
    group.add(welcomeMat);
  }

  return group;
}

function buildPottedTree(mats: MaterialPool): THREE.Group {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.3, 0.55, 10),
    mats.std('#c2410c', 0.75, 0.04),
  );
  pot.position.y = 0.28;
  g.add(pot);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 0.6, 8),
    mats.std('#78350f', 0.85, 0),
  );
  trunk.position.y = 0.72;
  g.add(trunk);

  const crown1 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.55, 0),
    mats.std('#16a34a', 0.75, 0),
  );
  crown1.position.y = 1.32;
  g.add(crown1);

  const crown2 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.38, 0),
    mats.std('#22c55e', 0.7, 0),
  );
  crown2.position.set(0.18, 1.65, 0.1);
  g.add(crown2);

  addShadows(g);
  return g;
}

// ============================================================================
// DETAILED MULTI-PART 3D FOOD STATIONS (10 UNIQUE STYLES + PROGRESS RING)
// ============================================================================

export interface StationVisualRig {
  root: THREE.Group;
  lockedCrate: THREE.Group;
  unlockedMachine: THREE.Group;
  activeGlowMesh: THREE.Mesh;
  progressRing: THREE.Mesh;
  progressFill: THREE.Mesh;
  stationIndex: number;
}

export function buildStationRig(
  tpl: StationTemplate,
  stationIndex: number,
  mats: MaterialPool,
): StationVisualRig {
  const root = new THREE.Group();
  root.userData = { pickType: 'station', stationIndex };

  // Locked wooden shipping crate with glowing blueprint band
  const lockedCrate = new THREE.Group();
  const crateBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.0, 1.2),
    mats.std('#b08968', 0.85, 0.02),
  );
  crateBox.position.y = 0.5;
  lockedCrate.add(crateBox);

  const ribbonX = new THREE.Mesh(
    new THREE.BoxGeometry(1.36, 0.18, 0.24),
    mats.std('#facc15', 0.4, 0.2, '#eab308'),
  );
  ribbonX.position.y = 0.55;
  lockedCrate.add(ribbonX);

  const ribbonZ = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.18, 1.26),
    mats.std('#facc15', 0.4, 0.2, '#eab308'),
  );
  ribbonZ.position.y = 0.55;
  lockedCrate.add(ribbonZ);
  addShadows(lockedCrate);
  root.add(lockedCrate);

  // Unlocked detailed stylized appliance
  const unlockedMachine = new THREE.Group();

  // Stainless/painted base cabinet
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.88, 1.28),
    mats.std('#f8fafc', 0.42, 0.12),
  );
  cabinet.position.y = 0.44;
  unlockedMachine.add(cabinet);

  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.54, 0.16, 1.34),
    mats.std(tpl.color, 0.4, 0.15),
  );
  trim.position.y = 0.88;
  unlockedMachine.add(trim);

  // Appliance top specific to style
  let activeGlowMesh: THREE.Mesh;

  switch (tpl.modelStyle) {
    case 'juicer':
    case 'blender': {
      const carafe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.26, 0.72, 12),
        mats.std(tpl.color, 0.15, 0.2, tpl.color),
      );
      carafe.position.set(0, 1.32, 0);
      unlockedMachine.add(carafe);
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12),
        mats.std(tpl.accentColor, 0.4, 0.2),
      );
      lid.position.set(0, 1.72, 0);
      unlockedMachine.add(lid);
      activeGlowMesh = carafe;
      break;
    }
    case 'oven': {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        mats.std('#c2410c', 0.75, 0.05),
      );
      dome.position.set(0, 0.94, -0.05);
      unlockedMachine.add(dome);
      const hearthGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.34, 0.14),
        mats.std('#f97316', 0.2, 0, '#fb923c'),
      );
      hearthGlow.position.set(0, 1.15, 0.54);
      unlockedMachine.add(hearthGlow);
      const chimney = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 0.55, 10),
        mats.std('#475569', 0.6, 0.2),
      );
      chimney.position.set(0, 1.7, -0.2);
      unlockedMachine.add(chimney);
      activeGlowMesh = hearthGlow;
      break;
    }
    case 'espresso': {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.72, 0.72),
        mats.std('#334155', 0.3, 0.6),
      );
      body.position.set(0, 1.32, -0.1);
      unlockedMachine.add(body);
      const hopper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.12, 0.35, 10),
        mats.std('#78350f', 0.4, 0.1),
      );
      hopper.position.set(-0.24, 1.82, -0.1);
      unlockedMachine.add(hopper);
      const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12),
        mats.std(tpl.accentColor, 0.3, 0.2, tpl.color),
      );
      gauge.rotation.x = Math.PI / 2;
      gauge.position.set(0.22, 1.44, 0.28);
      unlockedMachine.add(gauge);
      activeGlowMesh = gauge;
      break;
    }
    case 'cauldron': {
      const pot = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 12, 10),
        mats.std('#1e293b', 0.4, 0.5),
      );
      pot.position.set(0, 1.24, 0);
      unlockedMachine.add(pot);
      const brew = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12),
        mats.std(tpl.color, 0.15, 0.1, tpl.color),
      );
      brew.position.set(0, 1.54, 0);
      unlockedMachine.add(brew);
      activeGlowMesh = brew;
      break;
    }
    case 'sushi':
    case 'dessert': {
      const showcase = new THREE.Mesh(
        new THREE.BoxGeometry(1.26, 0.56, 0.92),
        mats.std('#e0f2fe', 0.1, 0.25),
      );
      showcase.position.set(0, 1.24, 0);
      unlockedMachine.add(showcase);
      const platter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.16, 12),
        mats.std(tpl.color, 0.4, 0.1, tpl.accentColor),
      );
      platter.position.set(0, 1.15, 0);
      unlockedMachine.add(platter);
      activeGlowMesh = platter;
      break;
    }
    default: {
      // Grill / Fryer / Wok with sizzling cooktop & metallic exhaust hood
      const cooktop = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.16, 0.92),
        mats.std('#1e293b', 0.35, 0.6),
      );
      cooktop.position.set(0, 1.04, 0);
      unlockedMachine.add(cooktop);

      const burner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.36, 0.12, 12),
        mats.std(tpl.color, 0.3, 0.1, tpl.accentColor),
      );
      burner.position.set(0, 1.16, 0);
      unlockedMachine.add(burner);

      const hood = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 0.42, 4),
        mats.std('#cbd5e1', 0.3, 0.6),
      );
      hood.rotation.y = Math.PI / 4;
      hood.position.set(0, 1.95, -0.15);
      unlockedMachine.add(hood);
      activeGlowMesh = burner;
      break;
    }
  }

  addShadows(unlockedMachine);
  root.add(unlockedMachine);

  // Floating 3D radial progress halo above station when cooking
  const progressRing = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.62, 24),
    mats.basicMat('#1e293b', 0.72),
  );
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.set(0, 2.25, 0);
  progressRing.visible = false;
  root.add(progressRing);

  const progressFill = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.61, 24),
    mats.basicMat('#22c55e', 0.95),
  );
  progressFill.rotation.x = -Math.PI / 2;
  progressFill.position.set(0, 2.27, 0);
  progressFill.visible = false;
  root.add(progressFill);

  // Tag all child meshes for instant raycast station selection
  root.traverse((c) => {
    c.userData.pickType = 'station';
    c.userData.stationIndex = stationIndex;
  });

  return {
    root,
    lockedCrate,
    unlockedMachine,
    activeGlowMesh,
    progressRing,
    progressFill,
    stationIndex,
  };
}

// ============================================================================
// EXPRESSIVE STYLIZED 3D CHARACTERS (WITH LIVE EQUIPPED GEAR & WALK CYCLE)
// ============================================================================

export interface CharacterRig {
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
}

export function buildCharacterRig(
  shirtColor: string,
  hairColor: string,
  isChef: boolean,
  mats: MaterialPool,
): CharacterRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const legGeo = new THREE.CapsuleGeometry(0.11, 0.22, 4, 8);
  const pantsMat = mats.std('#1e293b', 0.8, 0.05);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.14, 0.24, 0);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.14, 0.24, 0);
  bodyGroup.add(rightLeg);

  const shirtMesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26, 0.34, 6, 10),
    mats.std(shirtColor, 0.65, 0.05),
  );
  shirtMesh.position.y = 0.76;
  bodyGroup.add(shirtMesh);

  if (isChef) {
    // Crisp white chef apron front panel
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.44, 0.14),
      mats.std('#ffffff', 0.7, 0.02),
    );
    apron.position.set(0, 0.68, 0.18);
    bodyGroup.add(apron);
  }

  const skinMat = mats.std('#fed7aa', 0.6, 0.02);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skinMat);
  head.position.y = 1.3;
  bodyGroup.add(head);

  // Cute expressive eyes
  const eyeMat = mats.std('#0f172a', 0.2, 0.1);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeMat);
  eyeL.position.set(-0.1, 1.32, 0.24);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.1;
  bodyGroup.add(eyeL, eyeR);

  // Hair cap
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mats.std(hairColor, 0.75, 0.02),
  );
  hair.position.y = 1.33;
  bodyGroup.add(hair);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.26, 4, 8);
  const leftArm = new THREE.Mesh(armGeo, mats.std(shirtColor, 0.65, 0.05));
  leftArm.position.set(-0.34, 0.82, 0);
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, mats.std(shirtColor, 0.65, 0.05));
  rightArm.position.set(0.34, 0.82, 0);
  bodyGroup.add(rightArm);

  // Accessory anchors
  const hatAnchor = new THREE.Group();
  hatAnchor.position.set(0, 1.54, 0);
  bodyGroup.add(hatAnchor);

  if (isChef) {
    // Default crisp chef toque
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10),
      mats.std('#ffffff', 0.6, 0),
    );
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 10, 8),
      mats.std('#ffffff', 0.65, 0),
    );
    puff.position.y = 0.18;
    hatAnchor.add(band, puff);
  }

  const hand1Anchor = new THREE.Group();
  hand1Anchor.position.set(0.38, 0.72, 0.22);
  bodyGroup.add(hand1Anchor);

  const hand2Anchor = new THREE.Group();
  hand2Anchor.position.set(-0.38, 0.72, 0.22);
  bodyGroup.add(hand2Anchor);

  // Serving tray + plated dish + quality aura
  const trayGroup = new THREE.Group();
  trayGroup.position.set(0, 0.92, 0.48);
  trayGroup.visible = false;

  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.05, 12),
    mats.std('#e2e8f0', 0.3, 0.6),
  );
  trayGroup.add(tray);

  const dishMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    mats.std('#ffd166', 0.4, 0.1),
  );
  dishMesh.scale.set(1, 0.65, 1);
  dishMesh.position.y = 0.12;
  trayGroup.add(dishMesh);

  const qualityHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.04, 6, 16),
    mats.basicMat('#facc15', 0.9),
  );
  qualityHalo.rotation.x = Math.PI / 2;
  qualityHalo.position.y = 0.14;
  qualityHalo.visible = false;
  trayGroup.add(qualityHalo);

  bodyGroup.add(trayGroup);

  addShadows(root);
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
  };
}

/**
 * Applies live 3D visual equipment accessories onto the Player Chef Avatar!
 */
export function applyEquippedGearVisuals(
  rig: CharacterRig,
  equippedTemplates: {
    head?: GearTemplate;
    body?: GearTemplate;
    hand1?: GearTemplate;
    hand2?: GearTemplate;
  },
  mats: MaterialPool,
): void {
  // Update Body coat color
  if (equippedTemplates.body) {
    rig.shirtMesh.material = mats.std(equippedTemplates.body.color, 0.48, 0.18);
  } else {
    rig.shirtMesh.material = mats.std('#ffffff', 0.65, 0.05);
  }

  // Rebuild Headgear
  rig.hatAnchor.clear();
  const head = equippedTemplates.head;
  if (!head) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), mats.std('#ffffff'));
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), mats.std('#ffffff'));
    puff.position.y = 0.18;
    rig.hatAnchor.add(band, puff);
  } else if (head.visualStyle === 'crown' || head.visualStyle === 'crown_helm') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.24, 0.24, 8),
      mats.std(head.color, 0.25, 0.7, head.accentColor),
    );
    rig.hatAnchor.add(base);
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.22, 4),
        mats.std(head.accentColor, 0.2, 0.7),
      );
      const a = (i / 4) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2);
      rig.hatAnchor.add(spike);
    }
  } else if (head.visualStyle === 'helmet' || head.visualStyle === 'visor_helm') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10),
      mats.std(head.color, 0.3, 0.5),
    );
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.14, 0.2),
      mats.std(head.accentColor, 0.15, 0.4, head.accentColor),
    );
    visor.position.set(0, -0.04, 0.22);
    rig.hatAnchor.add(dome, visor);
  } else {
    // Cap / Toque / Hood
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.14, 10),
      mats.std(head.color, 0.5, 0.1),
    );
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      mats.std(head.color, 0.5, 0.1),
    );
    crown.position.y = 0.14;
    const badge = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      mats.std(head.accentColor, 0.3, 0.3, head.accentColor),
    );
    badge.position.set(0, 0.12, 0.26);
    rig.hatAnchor.add(brim, crown, badge);
  }

  // Rebuild Hand 1 & Hand 2 Tools
  const buildTool = (tool?: GearTemplate): THREE.Group => {
    const g = new THREE.Group();
    if (!tool) return g;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8),
      mats.std('#78350f', 0.7, 0.1),
    );
    handle.rotation.x = Math.PI / 3;
    g.add(handle);

    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.26, 0.06),
      mats.std(tool.color, 0.25, 0.65, tool.rarity === 'mythic' || tool.rarity === 'ultimate' ? tool.accentColor : undefined),
    );
    headMesh.position.set(0, 0.16, 0.24);
    g.add(headMesh);
    return g;
  };

  rig.hand1Anchor.clear();
  if (equippedTemplates.hand1) rig.hand1Anchor.add(buildTool(equippedTemplates.hand1));
  rig.hand2Anchor.clear();
  if (equippedTemplates.hand2) rig.hand2Anchor.add(buildTool(equippedTemplates.hand2));

  addShadows(rig.root);
}

// ============================================================================
// DRIVE-THRU LOW-POLY CAR + COMPANION PET + TIP COIN STACK
// ============================================================================

export function buildDriveThruCar(color: string, isGolden: boolean, mats: MaterialPool): THREE.Group {
  const g = new THREE.Group();
  const bodyColor = isGolden ? '#facc15' : color;
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.52, 0.95),
    mats.std(bodyColor, isGolden ? 0.2 : 0.4, isGolden ? 0.75 : 0.2, isGolden ? '#eab308' : undefined),
  );
  chassis.position.y = 0.4;
  g.add(chassis);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.44, 0.84),
    mats.std('#e0f2fe', 0.2, 0.35),
  );
  cabin.position.set(-0.08, 0.82, 0);
  g.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10);
  const wheelMat = mats.std('#0f172a', 0.85, 0.1);
  for (const [wx, wz] of [
    [-0.5, 0.5],
    [0.5, 0.5],
    [-0.5, -0.5],
    [0.5, -0.5],
  ]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.22, wz);
    g.add(w);
  }
  addShadows(g);
  return g;
}

export interface PetVisualRig {
  root: THREE.Group;
  body: THREE.Group;
  dishTray: THREE.Mesh;
}

export function buildPetRig(
  color: string,
  accentColor: string,
  mats: MaterialPool,
): PetVisualRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    mats.std(color, 0.55, 0.08),
  );
  torso.scale.set(1.0, 0.88, 1.18);
  torso.position.y = 0.32;
  body.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 10, 8),
    mats.std(color, 0.55, 0.08),
  );
  head.position.set(0, 0.52, 0.2);
  body.add(head);

  // Cute ears
  const earGeo = new THREE.ConeGeometry(0.08, 0.18, 6);
  const earL = new THREE.Mesh(earGeo, mats.std(accentColor, 0.5, 0.1));
  earL.position.set(-0.13, 0.72, 0.18);
  const earR = earL.clone();
  earR.position.x = 0.13;
  body.add(earL, earR);

  // Tail
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    mats.std(accentColor, 0.6, 0.05),
  );
  tail.position.set(0, 0.36, -0.32);
  body.add(tail);

  // Golden delivery dish floating on pet's back/tray when delivering
  const dishTray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.2, 0.12, 12),
    mats.std('#facc15', 0.25, 0.6, '#f59e0b'),
  );
  dishTray.position.set(0, 0.76, 0.05);
  dishTray.visible = false;
  body.add(dishTray);

  addShadows(root);
  return { root, body, dishTray };
}

export function buildTipCoinStack(mats: MaterialPool, tipId: string): THREE.Group {
  const g = new THREE.Group();
  g.userData = { pickType: 'tip', tipId };
  for (let i = 0; i < 3; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.07, 14),
      mats.std('#facc15', 0.2, 0.75, '#f59e0b'),
    );
    coin.position.set(i === 2 ? 0.06 : 0, 0.84 + i * 0.08, 0);
    coin.userData = { pickType: 'tip', tipId };
    g.add(coin);
  }
  return g;
}
