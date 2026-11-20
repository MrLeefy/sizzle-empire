import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GEAR_TEMPLATES } from '@/data/gear';
import { PET_SPECIES } from '@/data/pets';
import { RESTAURANT_LIST, getRestaurantTemplate } from '@/data/restaurants';
import { buildRestaurantLayout } from '@/engine/sim/layoutBuilder';
import {
  ALL_HAIR_STYLES,
  ALL_PET_MODEL_STYLES,
  GeometryPool,
  MaterialPool,
  RARITY_SHIMMER_PALETTE,
  TextureFactory,
  applyEquippedGearVisuals,
  buildCharacterRig,
  buildDriveThruCar,
  buildDriveThruCarRig,
  buildEnvironmentRig,
  buildFoodDishMesh,
  buildPetRig,
  buildStationRig,
  buildTipCoinStack,
  createRoundedBoxGeometry,
  disposeObjectTree,
  getVenueEnvironmentTheme,
  resolveTipVisualZ,
  restyleCustomerRig,
  restyleDriveThruCar,
  setTrayDishVisual,
  syncDynamicTables,
  type StationModelStyle,
} from '@/renderer/meshFactory';
import {
  VFX_QUALITY_CAPS,
  VfxSystem,
} from '@/renderer/vfxSystem';
import {
  advanceWalkPhase,
  computeCarSteeringYaw,
  createCharacterAnimState,
  evaluateCrateWiggle,
  evaluateElasticPop,
  lerpAngle,
  normalizeAngle,
  stepBlinkAndExpression,
  stepSpring,
  writeSquashStretch,
} from '@/renderer/animationHelpers';

const ALL_STATION_STYLES: readonly StationModelStyle[] = [
  'juicer',
  'blender',
  'grill',
  'fryer',
  'wok',
  'oven',
  'espresso',
  'cauldron',
  'sushi',
  'dessert',
] as const;

const ALL_EVENT_VENUE_IDS = [
  'event_crystal_cavern',
  'event_tidewater_pier',
  'event_lunar_outpost',
  'event_citadel_orchard',
  'event_citadel_inn',
  'event_citadel_keep',
  'adventure_olympus',
  'adventure_corsair',
  'event_potion_shop',
] as const;

function assertFiniteBounds(obj: THREE.Object3D, label: string): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  expect(box.isEmpty(), `${label} Box3 should not be empty`).toBe(false);
  const vals = [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  ];
  for (const v of vals) {
    expect(Number.isFinite(v), `${label} has non-finite bound: ${v}`).toBe(true);
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  expect(size.x, `${label} size.x`).toBeGreaterThan(0.005);
  expect(size.y, `${label} size.y`).toBeGreaterThan(0.005);
  expect(size.z, `${label} size.z`).toBeGreaterThan(0.005);
  expect(size.x, `${label} size.x upper bound`).toBeLessThan(120);
  expect(size.y, `${label} size.y upper bound`).toBeLessThan(120);
  expect(size.z, `${label} size.z upper bound`).toBeLessThan(120);
  return box;
}

function meshSignature(obj: THREE.Object3D): string {
  obj.updateMatrixWorld(true);
  const parts: string[] = [];
  const tmpSize = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  obj.traverse((child) => {
    if (!child.visible) return;
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      const geo = child.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      geo.boundingBox?.getSize(tmpSize);
      child.getWorldPosition(tmpPos);
      const q = (n: number) => Math.round(n * 100);
      const countTag = child instanceof THREE.InstancedMesh ? `#${child.count}` : '';
      parts.push(
        `${geo.type}${countTag}:${q(tmpSize.x * child.scale.x)},${q(tmpSize.y * child.scale.y)},${q(tmpSize.z * child.scale.z)}@${q(tmpPos.x)},${q(tmpPos.y)},${q(tmpPos.z)}`,
      );
    }
  });
  parts.sort();
  return `${parts.length}|${parts.join(';')}`;
}

function findTransparentGlassMeshes(obj: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (m && m.transparent === true && m.opacity > 0 && m.opacity < 0.6) {
        result.push(child);
        break;
      }
    }
  });
  return result;
}

// =========================================================================
// 1. POOLS, PROCEDURAL TEXTURES & LEAK-FREE DISPOSAL
// =========================================================================
describe('MaterialLibrary — GeometryPool, MaterialPool, TextureFactory & disposeObjectTree', () => {
  it('caches GeometryPool identities, tags userData.__pooled, and supports RoundedBoxGeometry in Node', () => {
    const geos = new GeometryPool();
    const a = geos.roundedBox(1.5, 0.8, 1.2, 2, 0.1);
    const b = geos.roundedBox(1.5, 0.8, 1.2, 2, 0.1);
    const c = geos.cylinder(0.2, 0.2, 0.5, 12);

    expect(a).toBe(b);
    expect(a.userData.__pooled).toBe(true);
    expect(c.userData.__pooled).toBe(true);
    expect(geos.has(a)).toBe(true);
    expect(geos.size()).toBe(2);
    expect(a.attributes.position.count).toBeGreaterThan(24);

    geos.dispose();
    expect(geos.size()).toBe(0);
    expect(geos.has(a)).toBe(false);
  });

  it('caches MaterialPool presets, separates sceneScoped materials, and runs TextureFactory safely in Node', () => {
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    // Node safety: typeof document === 'undefined' -> all 7 generators cleanly return null
    expect(textures.createCheckerboardTiles('#fff5e6', 4, 4)).toBeNull();
    expect(textures.createWoodPlanks('#d6a56e', 4, 4)).toBeNull();
    expect(textures.createStripedAwning('#ef4444', '#ffffff', 4)).toBeNull();
    expect(textures.createMarbleCounter('#fffbf4')).toBeNull();
    expect(textures.createChalkboardMenu('Test', [{ icon: '🍋', name: 'Lemonade' }], '#facc15')).toBeNull();
    expect(textures.createMarqueeSign('Test Venue', '🍋', '#facc15', '#ef4444')).toBeNull();
    expect(textures.createContactShadowDisc()).toBeNull();

    const m1 = mats.std('#ff6b6b');
    const m2 = mats.std('#ff6b6b');
    expect(m1).toBe(m2);
    expect(m1.userData.__pooled).toBe(true);

    const glass = mats.glass('#dff6ff', 0.26);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeCloseTo(0.26, 2);
    expect(glass.depthWrite).toBe(false);

    const scoped = mats.textured('venue_sign_1', null, { color: '#fffbf0', sceneScoped: true });
    expect(mats.has(scoped)).toBe(true);
    expect(mats.getStats().sceneScoped).toBe(1);
    mats.disposeSceneScoped();
    expect(mats.getStats().sceneScoped).toBe(0);
    expect(mats.has(m1)).toBe(true);

    mats.dispose();
    textures.dispose();
    expect(mats.getStats().shared).toBe(0);
  });

  it('disposeObjectTree disposes unpooled geometries & InstancedMesh buffers while sparing pooled resources', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const group = new THREE.Group();

    const pooledGeo = geos.roundedBox(1, 1, 1);
    const pooledMat = mats.glossy('#facc15');
    const unpooledGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const unpooledMat = new THREE.MeshStandardMaterial({ color: '#38bdf8' });

    const pooledSpy = vi.spyOn(pooledGeo, 'dispose');
    const pooledMatSpy = vi.spyOn(pooledMat, 'dispose');
    const unpooledSpy = vi.spyOn(unpooledGeo, 'dispose');
    const unpooledMatSpy = vi.spyOn(unpooledMat, 'dispose');

    const mPooled = new THREE.Mesh(pooledGeo, pooledMat);
    const mUnpooled = new THREE.Mesh(unpooledGeo, unpooledMat);
    const instMesh = new THREE.InstancedMesh(pooledGeo, pooledMat, 4);
    const instDisposeSpy = vi.spyOn(instMesh, 'dispose');

    group.add(mPooled, mUnpooled, instMesh);
    disposeObjectTree(group, { clearChildren: true });

    expect(unpooledSpy).toHaveBeenCalledTimes(1);
    expect(unpooledMatSpy).toHaveBeenCalledTimes(1);
    expect(instDisposeSpy).toHaveBeenCalledTimes(1);
    expect(pooledSpy).not.toHaveBeenCalled();
    expect(pooledMatSpy).not.toHaveBeenCalled();
    expect(group.children.length).toBe(0);

    geos.dispose();
    mats.dispose();
  });
});

// =========================================================================
// 2. ALL 10 DISTINCT STATION STYLES + TRANSPARENT GLASS REGRESSION
// =========================================================================
describe('StationBuilder — all 10 distinct styles, transparent glass, multi-machine & popular ring', () => {
  it('builds all 10 distinct StationModelStyles with finite bounds, transparent sushi/dessert glass, and picking tags', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    const signatures = new Set<string>();

    for (let idx = 0; idx < ALL_STATION_STYLES.length; idx++) {
      const style = ALL_STATION_STYLES[idx];
      const tpl = RESTAURANT_LIST.flatMap((r) => r.stations).find((s) => s.modelStyle === style);
      expect(tpl, `Missing real template for station style ${style}`).toBeDefined();

      const rig = buildStationRig(tpl!, idx, mats, geos, textures);
      rig.lockedCrate.visible = false;
      rig.unlockedMachine.visible = true;

      assertFiniteBounds(rig.unlockedMachine, `station:${style}:unlocked`);
      rig.lockedCrate.visible = true;
      assertFiniteBounds(rig.lockedCrate, `station:${style}:crate`);
      rig.lockedCrate.visible = false;

      signatures.add(meshSignature(rig.applianceGroup));

      // Verify raycast pick tagging on pickable machine & crate meshes
      let pickableCount = 0;
      for (const branch of [rig.lockedCrate, rig.unlockedMachine]) {
        branch.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            expect(obj.userData.pickType).toBe('station');
            expect(obj.userData.stationIndex).toBe(idx);
            pickableCount++;
          }
        });
      }
      expect(pickableCount).toBeGreaterThan(4);

      // Glass bug regression: sushi & dessert showcases MUST be truly transparent!
      if (style === 'sushi' || style === 'dessert') {
        const glassMeshes = findTransparentGlassMeshes(rig.unlockedMachine);
        expect(glassMeshes.length, `${style} must have transparent showcase glass`).toBeGreaterThanOrEqual(1);
        for (const gm of glassMeshes) {
          const mat = gm.material as THREE.MeshStandardMaterial;
          expect(mat.transparent).toBe(true);
          expect(mat.opacity).toBeGreaterThan(0);
          expect(mat.opacity).toBeLessThanOrEqual(0.35);
          expect(mat.depthWrite).toBe(false);
          expect(gm.castShadow).toBe(false);
        }
      }

      // Multi-machine progression (1..maxMachines) stays strictly inside 2.40 x 1.45 flagship envelope
      for (let m = 1; m <= rig.maxMachines; m++) {
        rig.setMachineCount(m);
        expect(rig.visibleMachines).toBe(m);
        expect(rig.extensionWings.visible).toBe(m >= 2);
        const box = assertFiniteBounds(rig.unlockedMachine, `station:${style}:m${m}`);
        const size = new THREE.Vector3();
        box.getSize(size);
        expect(size.x).toBeLessThanOrEqual(2.42);
        expect(size.z).toBeLessThanOrEqual(1.45);
      }

      // Popular ring toggles cleanly and never steals raycast taps
      rig.popularRing.visible = true;
      expect(rig.popularRing.visible).toBe(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(rig.popularRing, false).length).toBe(0);
    }

    expect(signatures.size).toBe(10);
    geos.dispose();
    mats.dispose();
    textures.dispose();
  });
});

// =========================================================================
// 3. ALL 6 ARCHETYPES + 9 EVENT VENUES + DYNAMIC TABLES + CHAIR CLEARANCE
// =========================================================================
describe('EnvironmentBuilder — 6 archetypes, 9 event venues, dynamic tables & non-clipping dining chairs', () => {
  it('builds all 6 archetypes & 9 event venues with distinct themes and finite bounds', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    const archetypeIds = [
      'citrus_press',       // counter_stand
      'smash_truck',        // food_truck
      'courtyard_cafe',     // cafe_tables
      'woodfire_trattoria', // waiter_dining
      'sunset_drive_in',    // drive_thru
      'grand_brasserie',    // grand_hall
    ];

    const archetypeSigs = new Set<string>();
    for (const id of archetypeIds) {
      const tpl = getRestaurantTemplate(id);
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      assertFiniteBounds(envRig.root, `archetype:${id}`);
      archetypeSigs.add(meshSignature(envRig.root));
      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }
    expect(archetypeSigs.size).toBe(6);

    const eventThemeIds = new Set<string>();
    const eventSigs = new Set<string>();
    for (const id of ALL_EVENT_VENUE_IDS) {
      const tpl = getRestaurantTemplate(id);
      const layout = buildRestaurantLayout(tpl);
      const theme = getVenueEnvironmentTheme(id, { skyColor: '#7ec8e3', groundColor: '#c7d9b7' });
      expect(theme.themeId).toBe(id);
      eventThemeIds.add(theme.themeId);

      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      assertFiniteBounds(envRig.root, `event:${id}`);
      eventSigs.add(meshSignature(envRig.root));
      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }
    expect(eventThemeIds.size).toBe(9);
    expect(eventSigs.size).toBe(9);

    geos.dispose();
    mats.dispose();
    textures.dispose();
  });

  it('hides locked dining tables initially, reveals them dynamically via syncDynamicTables, and maintains zero chair/pedestal clipping', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    const diningVenueIds = ['courtyard_cafe', 'woodfire_trattoria', 'grand_brasserie'];

    for (const id of diningVenueIds) {
      const tpl = getRestaurantTemplate(id);
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');

      expect(envRig.tables.length).toBeGreaterThanOrEqual(6);

      // Initially locked tables must be hidden until their slots unlock
      const initiallyLocked = envRig.tables.filter((t) => !t.unlocked);
      expect(initiallyLocked.length).toBeGreaterThan(0);
      for (const tbl of initiallyLocked) {
        expect(tbl.group.visible).toBe(false);
      }

      // Unlock all table slots dynamically and verify syncDynamicTables pops them visible
      for (const slot of layout.slots) {
        slot.unlocked = true;
      }
      const newlyUnlocked = syncDynamicTables(envRig, layout);
      expect(newlyUnlocked.length).toBe(initiallyLocked.length);
      for (const tbl of envRig.tables) {
        expect(tbl.unlocked).toBe(true);
        expect(tbl.group.visible).toBe(true);
      }

      // Stool-clipping regression check against layoutBuilder.ts coordinates
      envRig.root.updateMatrixWorld(true);
      const chairMeshes: THREE.Mesh[] = [];
      const pedestalMeshes: THREE.Mesh[] = [];
      envRig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.userData.propType === 'chair') chairMeshes.push(obj);
          if (obj.userData.propType === 'table_pedestal') pedestalMeshes.push(obj);
        }
      });
      expect(chairMeshes.length).toBeGreaterThan(0);

      const chairBoxes = chairMeshes.map((m) => new THREE.Box3().setFromObject(m));
      const pedBoxes = pedestalMeshes.map((m) => new THREE.Box3().setFromObject(m));

      for (const slot of layout.slots) {
        if (slot.kind !== 'table') continue;
        const torsoPoint = new THREE.Vector3(slot.customerPos.x, 0.55, slot.customerPos.z);

        // No solid chair part (leg, seat, backrest) may intersect customer torso center (y=0.55)!
        for (const cb of chairBoxes) {
          expect(
            cb.containsPoint(torsoPoint),
            `${id} slot ${slot.index}: chair mesh overlaps customer torso at (${torsoPoint.x}, ${torsoPoint.y}, ${torsoPoint.z})`,
          ).toBe(false);
        }

        // No table pedestal may overlap customer standing/seated position!
        const footPoint = new THREE.Vector3(slot.customerPos.x, 0.34, slot.customerPos.z);
        for (const pb of pedBoxes) {
          expect(pb.containsPoint(footPoint)).toBe(false);
        }
      }

      // Verify backrest horizontal clearance >= 0.24 behind customerPos.z
      for (const tbl of envRig.tables) {
        expect(tbl.seatTopY).toBeCloseTo(0.36, 2);
        for (const sp of tbl.seatPositions) {
          const backrestCenterZ = tbl.center.z + 0.84;
          expect(backrestCenterZ - sp.z).toBeGreaterThanOrEqual(0.24);
        }
      }

      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    geos.dispose();
    mats.dispose();
    textures.dispose();
  });
});

// =========================================================================
// 4. CHARACTERS, ROLES & ALL 75 GEAR TEMPLATES / 42 DISTINCT STYLES
// =========================================================================
describe('CharacterBuilder — roles, customer variants, hair styles & all 75 gear templates (42 styles)', () => {
  it('builds all 5 worker roles, customer variants (normal/golden/greedy/both), 6 hair styles, and restyles cleanly', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();

    const roleSigs = new Set<string>();
    for (const role of ['player', 'chef', 'waiter', 'cashier', 'helper'] as const) {
      const rig = buildCharacterRig('#f97316', '#334155', role !== 'waiter' && role !== 'cashier', mats, {
        role,
        seed: 7,
        geos,
      });
      assertFiniteBounds(rig.root, `role:${role}`);
      roleSigs.add(meshSignature(rig.bodyGroup));
      if (role === 'helper') {
        expect(rig.auraRing.visible).toBe(true);
      }
    }
    expect(roleSigs.size).toBe(5);

    // 6 distinct procedural hair styles
    const hairSigs = new Set<string>();
    for (const style of ALL_HAIR_STYLES) {
      const rig = buildCharacterRig('#38bdf8', '#78350f', false, mats, {
        role: 'customer',
        hairStyle: style,
        geos,
      });
      hairSigs.add(meshSignature(rig.hairGroup));
    }
    expect(hairSigs.size).toBe(6);

    // Customer golden + greedy composition & pool restyle
    const bothCust = buildCharacterRig('#22c55e', '#1e293b', false, mats, {
      role: 'customer',
      isGolden: true,
      isGreedy: true,
      seed: 12,
      geos,
    });
    assertFiniteBounds(bothCust.root, 'customer:golden+greedy');
    expect(bothCust.auraRing.visible).toBe(true);
    expect(bothCust.greedyBibGroup.visible).toBe(true);
    expect(bothCust.shirtMesh.scale.x).toBeGreaterThan(1.15);
    expect(bothCust.hatAnchor.children.length).toBeGreaterThan(0);

    // Restyle pooled customer back to normal
    restyleCustomerRig(
      bothCust,
      { shirtColor: '#38bdf8', hairColor: '#92400e', isGolden: false, isGreedy: false, seed: 3 },
      mats,
      geos,
    );
    expect(bothCust.auraRing.visible).toBe(false);
    expect(bothCust.greedyBibGroup.visible).toBe(false);
    expect(bothCust.shirtMesh.scale.x).toBeLessThan(1.1);
    expect(bothCust.hatAnchor.children.length).toBe(0);

    geos.dispose();
    mats.dispose();
  });

  it('verifies all 75 GEAR_TEMPLATES / 42 visualStyles, sleeve recoloring, rarity shimmers, clean unequip reset & zero leaks', () => {
    expect(GEAR_TEMPLATES.length).toBe(75);
    const uniqueStyleKeys = new Set(GEAR_TEMPLATES.map((g) => `${g.slot}:${g.visualStyle}`));
    expect(uniqueStyleKeys.size).toBe(42);

    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const rig = buildCharacterRig('#ffffff', '#78350f', true, mats, { role: 'player', geos });

    const defaultShirtMat = rig.shirtMesh.material;
    const defaultLeftSleeveMat = rig.leftArm.material;
    const defaultRightSleeveMat = rig.rightArm.material;

    const headSigs = new Map<string, string>();
    const bodySigs = new Map<string, string>();
    const handSigs = new Map<string, string>();

    for (const tpl of GEAR_TEMPLATES) {
      if (tpl.slot === 'head') {
        applyEquippedGearVisuals(rig, { head: tpl }, mats, geos);
        expect(rig.hatAnchor.children.length).toBeGreaterThan(0);
        assertFiniteBounds(rig.root, `gear:${tpl.id}`);
        if (!headSigs.has(tpl.visualStyle)) {
          headSigs.set(tpl.visualStyle, meshSignature(rig.hatAnchor));
        }
      } else if (tpl.slot === 'body') {
        applyEquippedGearVisuals(rig, { body: tpl }, mats, geos);
        expect(rig.bodyGearAnchor.children.length).toBeGreaterThan(0);
        expect(rig.defaultApronGroup.visible).toBe(false);
        assertFiniteBounds(rig.root, `gear:${tpl.id}`);
        if (!bodySigs.has(tpl.visualStyle)) {
          bodySigs.set(tpl.visualStyle, meshSignature(rig.bodyGearAnchor));
        }
      } else if (tpl.slot === 'hand') {
        applyEquippedGearVisuals(rig, { hand1: tpl, hand2: tpl }, mats, geos);
        expect(rig.hand1Anchor.children.length).toBeGreaterThan(0);
        expect(rig.hand2Anchor.children.length).toBeGreaterThan(0);
        assertFiniteBounds(rig.root, `gear:${tpl.id}`);
        if (!handSigs.has(tpl.visualStyle)) {
          handSigs.set(tpl.visualStyle, meshSignature(rig.hand1Anchor));
        }
      } else if (tpl.slot === 'ring') {
        applyEquippedGearVisuals(rig, { ring: tpl }, mats, geos);
        expect(rig.ringAnchor.children.length).toBeGreaterThan(0);
        assertFiniteBounds(rig.ringAnchor, `gear:${tpl.id}`);
      } else if (tpl.slot === 'necklace') {
        applyEquippedGearVisuals(rig, { necklace: tpl }, mats, geos);
        expect(rig.accessoryAnchor.children.length).toBeGreaterThan(0);
        assertFiniteBounds(rig.accessoryAnchor, `gear:${tpl.id}`);
      }
    }

    // All 12 head, 9 body, 19 hand visualStyles must produce genuinely distinct 3D silhouettes!
    expect(headSigs.size).toBe(12);
    expect(new Set(headSigs.values()).size).toBe(12);
    expect(bodySigs.size).toBe(9);
    expect(new Set(bodySigs.values()).size).toBe(9);
    expect(handSigs.size).toBe(19);
    expect(new Set(handSigs.values()).size).toBe(19);

    // Canonical rarity shimmer palette sanity check
    expect(RARITY_SHIMMER_PALETTE.legendary.hasShimmer).toBe(true);
    expect(RARITY_SHIMMER_PALETTE.ultimate.hasShimmer).toBe(true);
    expect(RARITY_SHIMMER_PALETTE.mythic.hasShimmer).toBe(true);

    // Sleeve recoloring check on dark kimono & mythic armor
    const blackbelt = GEAR_TEMPLATES.find((g) => g.id === 'l_body_blackbelt')!;
    applyEquippedGearVisuals(rig, { body: blackbelt }, mats, geos);
    expect(rig.shirtMesh.material).not.toBe(defaultShirtMat);
    expect(rig.leftArm.material).not.toBe(defaultLeftSleeveMat);
    expect(rig.rightArm.material).not.toBe(defaultRightSleeveMat);

    // Clean unequip reset restores base materials, apron, chef toque & empties all gear anchors!
    const pooledCountBefore = geos.size();
    applyEquippedGearVisuals(rig, {}, mats, geos);
    expect(rig.shirtMesh.material).toBe(defaultShirtMat);
    expect(rig.leftArm.material).toBe(defaultLeftSleeveMat);
    expect(rig.rightArm.material).toBe(defaultRightSleeveMat);
    expect(rig.defaultApronGroup.visible).toBe(true);
    expect(rig.bodyGearAnchor.children.length).toBe(0);
    expect(rig.hand1Anchor.children.length).toBe(0);
    expect(rig.hand2Anchor.children.length).toBe(0);
    expect(rig.accessoryAnchor.children.length).toBe(0);
    expect(rig.ringAnchor.children.length).toBe(0);
    expect(rig.hatAnchor.children.length).toBeGreaterThan(0); // restored chef toque
    expect(geos.size()).toBeGreaterThanOrEqual(pooledCountBefore);

    // Verify unpooled gear swap disposes old unpooled geometries cleanly
    const unpooledRig = buildCharacterRig('#ffffff', '#78350f', true, mats, { role: 'player' });
    const crown = GEAR_TEMPLATES.find((g) => g.id === 'u_head_crown')!;
    applyEquippedGearVisuals(unpooledRig, { head: crown }, mats);
    const unpooledMesh = unpooledRig.hatAnchor.children[0].children.find(
      (c) => c instanceof THREE.Mesh,
    ) as THREE.Mesh;
    const disposeSpy = vi.spyOn(unpooledMesh.geometry, 'dispose');
    applyEquippedGearVisuals(unpooledRig, {}, mats);
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    geos.dispose();
    mats.dispose();
  });
});

// =========================================================================
// 5. ALL 14 COMPANION PET MODELS (13 ACTIVE SPECIES + 'gnome')
// =========================================================================
describe('CharacterBuilder — all 13 active companion pet styles + gnome', () => {
  it('builds all 14 PET_SPECIES + gnome with unique 3D silhouettes, legs >= 2, and hidden dishTray', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();

    for (const sp of PET_SPECIES) {
      const rig = buildPetRig(sp.color, sp.accentColor, mats, sp.modelStyle, geos);
      assertFiniteBounds(rig.root, `pet:${sp.id}`);
      expect(rig.dishTray.visible).toBe(false);
      expect(rig.legs.length).toBeGreaterThanOrEqual(2);
    }

    const styleSigs = new Set<string>();
    for (const style of ALL_PET_MODEL_STYLES) {
      const rig = buildPetRig('#f59e0b', '#fef08a', mats, style, geos);
      assertFiniteBounds(rig.root, `petStyle:${style}`);
      expect(rig.legs.length).toBeGreaterThanOrEqual(2);
      styleSigs.add(meshSignature(rig.body));
    }
    expect(ALL_PET_MODEL_STYLES.length).toBe(14);
    expect(styleSigs.size).toBe(14);

    geos.dispose();
    mats.dispose();
  });
});

// =========================================================================
// 6. 10 MINIATURE FOOD DISHES, ROUNDED DRIVE-THRU CARS & TIP STACKS
// =========================================================================
describe('CharacterBuilder — 10 miniature dishes, rounded drive-thru cars & embossed tip stacks', () => {
  it('builds all 10 distinct miniature 3D food dishes fitting cleanly on trays', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const sigs = new Set<string>();

    for (const style of ALL_STATION_STYLES) {
      const dish = buildFoodDishMesh(style, '#f97316', '#fde047', mats, geos);
      const box = assertFiniteBounds(dish, `dish:${style}`);
      const size = new THREE.Vector3();
      box.getSize(size);
      expect(size.x).toBeLessThanOrEqual(0.6);
      expect(size.z).toBeLessThanOrEqual(0.6);
      expect(size.y).toBeLessThanOrEqual(0.5);
      sigs.add(meshSignature(dish));
    }
    expect(sigs.size).toBe(10);

    // setTrayDishVisual caches by key for zero per-frame allocations
    const anchor = new THREE.Group();
    const fallback = new THREE.Mesh(geos.sphere(0.1), mats.std('#fff'));
    const k1 = setTrayDishVisual(anchor, fallback, 'sushi', '#fb7185', '#4ade80', '', mats, geos);
    const firstChild = anchor.children[0];
    expect(fallback.visible).toBe(false);
    const k2 = setTrayDishVisual(anchor, fallback, 'sushi', '#fb7185', '#4ade80', k1, mats, geos);
    expect(k2).toBe(k1);
    expect(anchor.children[0]).toBe(firstChild);

    geos.dispose();
    mats.dispose();
  });

  it('builds rounded glossy drive-thru cars (regular & golden) and tagged tip coin stacks', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();

    const regularCar = buildDriveThruCar('#38bdf8', false, mats, geos);
    assertFiniteBounds(regularCar, 'car:regular');
    expect((regularCar.userData.wheels as THREE.Group[]).length).toBe(4);
    expect(regularCar.userData.driverHead).toBeInstanceOf(THREE.Group);
    expect(findTransparentGlassMeshes(regularCar).length).toBeGreaterThanOrEqual(1);

    const goldenRig = buildDriveThruCarRig('#38bdf8', true, mats, geos);
    assertFiniteBounds(goldenRig.root, 'car:golden');
    expect(goldenRig.hoodCrown.visible).toBe(true);
    expect((goldenRig.chassisMesh.material as THREE.MeshStandardMaterial).metalness).toBeGreaterThanOrEqual(0.7);
    restyleDriveThruCar(goldenRig, '#ef4444', false, mats);
    expect(goldenRig.hoodCrown.visible).toBe(false);

    const tip = buildTipCoinStack(mats, 'tip_42', geos);
    assertFiniteBounds(tip, 'tip_42');
    expect(tip.userData.tipId).toBe('tip_42');
    let descendantMeshes = 0;
    tip.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        expect(obj.userData.pickType).toBe('tip');
        expect(obj.userData.tipId).toBe('tip_42');
        descendantMeshes++;
      }
    });
    expect(descendantMeshes).toBeGreaterThanOrEqual(8);

    geos.dispose();
    mats.dispose();
  });
});

// =========================================================================
// 7. VFX SYSTEM CAPS, PRIORITY RECYCLING & COMPLETE RECLAMATION
// =========================================================================
describe('VfxSystem — quality caps (60/140/240), priority recycling, zero NaN & reclamation', () => {
  it('enforces exact caps across low/medium/high, recycles ambient for bursts, never produces NaN, and reclaims all particles', () => {
    const vfx = new VfxSystem('high');
    expect(vfx.getCapacity()).toBe(VFX_QUALITY_CAPS.high);
    expect(vfx.getActiveCount()).toBe(0);

    // Every InstancedMesh bucket has frustumCulled=false, instanceColor allocated, count=0
    const buckets: THREE.InstancedMesh[] = [];
    vfx.root.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        buckets.push(obj);
        expect(obj.frustumCulled).toBe(false);
        expect(obj.instanceColor).not.toBeNull();
        expect(obj.count).toBe(0);
      }
    });
    expect(buckets.length).toBe(4);

    // Stress-emit 1,000+ particles across ALL emitter types & all 10 station styles
    for (let i = 0; i < 300; i++) {
      vfx.emitSteam(i * 0.01, 1.0, 0);
    }
    expect(vfx.getActiveCount()).toBe(240);

    // Bursts succeed by recycling ambient slots while staying <= cap
    for (const style of ALL_STATION_STYLES) {
      vfx.emitStationWorkFx(0, 1.2, 0, style, '#f97316');
    }
    vfx.emitPerfectBurst(0, 1.2, 0, 12);
    vfx.emitDivineBurst(0, 1.2, 0, 16);
    vfx.emitCoinBurst(0, 1.0, 0, 7);
    vfx.emitConfetti(0, 1.5, 0, 22);
    vfx.emitSpeedDust(0, 0.1, 0, 1, 0);
    vfx.emitCrateSmash(0, 0.5, 0);
    vfx.emitHearts(0, 1.8, 0, 3);
    expect(vfx.getActiveCount()).toBeLessThanOrEqual(240);

    // Step simulation and verify zero NaN across all instanceMatrix & instanceColor arrays
    vfx.update(1 / 60);
    for (const b of buckets) {
      for (let i = 0; i < b.count * 16; i++) {
        expect(Number.isFinite(b.instanceMatrix.array[i])).toBe(true);
      }
      if (b.instanceColor) {
        for (let i = 0; i < b.count * 3; i++) {
          expect(Number.isFinite(b.instanceColor.array[i])).toBe(true);
        }
      }
    }

    // Dynamic downgrade high -> medium -> low clamps immediately!
    vfx.setQuality('medium');
    expect(vfx.getCapacity()).toBe(140);
    expect(vfx.getActiveCount()).toBeLessThanOrEqual(140);

    vfx.setQuality('low');
    expect(vfx.getCapacity()).toBe(60);
    expect(vfx.getActiveCount()).toBeLessThanOrEqual(60);

    // Run 100 ticks (5s) -> complete reclamation back to 0!
    for (let i = 0; i < 100; i++) {
      vfx.update(0.05);
    }
    expect(vfx.getActiveCount()).toBe(0);
    for (const b of buckets) {
      expect(b.count).toBe(0);
    }

    // Re-emit cleanly after reclamation & test clear + dispose
    vfx.emitConfetti(0, 1.2, 0, 10);
    expect(vfx.getActiveCount()).toBeGreaterThan(0);
    vfx.clear();
    expect(vfx.getActiveCount()).toBe(0);
    expect(() => vfx.dispose()).not.toThrow();
  });
});

// =========================================================================
// 8. ANIMATION HELPERS MATH INVARIANTS
// =========================================================================
describe('animationHelpers — shortest-angle lerp, spring stability, squash-stretch & car steering', () => {
  it('interpolates angles across ±π seams via the shortest path', () => {
    const midPos = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(Math.abs(midPos) - Math.PI)).toBeLessThan(0.01);

    const midNeg = lerpAngle(-Math.PI + 0.1, Math.PI - 0.1, 0.5);
    expect(Math.abs(Math.abs(midNeg) - Math.PI)).toBeLessThan(0.01);

    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 4);
  });

  it('steps damped spring with bounded overshoot, convergence & huge dt spike safety', () => {
    const spring = { value: 0.01, velocity: 0 };
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      const v = stepSpring(spring, 1.0, 1 / 60, 180, 12);
      if (v > peak) peak = v;
    }
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.65);
    expect(Math.abs(spring.value - 1.0)).toBeLessThan(0.02);

    // Huge dt=2.0 spike stays strictly finite
    const spikeSpring = { value: 0, velocity: 0 };
    const spikeVal = stepSpring(spikeSpring, 1.0, 2.0);
    expect(Number.isFinite(spikeVal)).toBe(true);
    expect(Number.isFinite(spikeSpring.velocity)).toBe(true);
  });

  it('evaluates elastic pop-in, volume-preserving squash-stretch, walk phase, blink, crate wiggle & car yaw', () => {
    expect(evaluateElasticPop(0)).toBeCloseTo(0.001, 4);
    expect(evaluateElasticPop(0.4)).toBeGreaterThan(1.05);
    expect(evaluateElasticPop(1)).toBe(1);

    const scale = new THREE.Vector3();
    for (const pulse of [1.0, 0.7, 0.4, 0.1, 0]) {
      writeSquashStretch(scale, pulse, 0.22);
      expect(scale.x).toBeGreaterThan(0.3);
      expect(scale.y).toBeGreaterThan(0.3);
      expect(scale.z).toBeGreaterThan(0.3);
      expect(scale.x * scale.y * scale.z).toBeCloseTo(1.0, 2);
    }
    expect(scale.x).toBe(1);
    expect(scale.y).toBe(1);
    expect(scale.z).toBe(1);

    let ph = 0;
    for (let i = 0; i < 60; i++) {
      ph = advanceWalkPhase(ph, 3.0, 1 / 60);
      expect(ph).toBeGreaterThanOrEqual(0);
      expect(ph).toBeLessThan(Math.PI * 2);
    }

    // Car facing +X (sim facing = π/2) yields yaw 0; parked damps back to 0
    expect(computeCarSteeringYaw(Math.PI / 2, true, 0, 0.1)).toBeCloseTo(0, 4);
    const turned = computeCarSteeringYaw(Math.PI / 2 + 0.4, true, 0, 0.5);
    expect(turned).toBeGreaterThan(0.1);
    const parked = computeCarSteeringYaw(Math.PI / 2 + 0.4, false, turned, 1.0);
    expect(Math.abs(parked)).toBeLessThan(Math.abs(turned));

    // Deterministic blink cycle triggers and restores eyeScaleY = 1
    const anim = createCharacterAnimState('test_chef', 0, 0, 0);
    let sawBlink = false;
    for (let i = 0; i < 600; i++) {
      const res = stepBlinkAndExpression(anim, 0.01);
      if (res.eyeScaleY < 0.5) sawBlink = true;
    }
    expect(sawBlink).toBe(true);

    // Crate wiggle activates within [0, 0.55s] and rests at 0 outside
    const wigActive = evaluateCrateWiggle(0.2, 0);
    expect(wigActive.bowScale).toBeGreaterThan(1.0);
    const wigRest = evaluateCrateWiggle(1.5, 0);
    expect(wigRest.rotZ).toBe(0);
    expect(wigRest.hopY).toBe(0);
    expect(wigRest.bowScale).toBe(1);
  });
});

// =========================================================================
// 9. ITERATION 2 REGRESSION SUITE (ALL GEOMETRY, CLEARANCE, VFX & ANIM FIXES)
// =========================================================================
function auditClosedGeometry(geo: THREE.BufferGeometry): {
  signedVolume: number;
  avgNormalAlign: number;
  minNormalAlign: number;
  invertedTriangles: number;
  topFaceNormalY: number;
  size: THREE.Vector3;
} {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  const pos = nonIndexed.attributes.position;
  const norm = nonIndexed.attributes.normal;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const faceN = new THREE.Vector3();
  const vn = new THREE.Vector3();

  let signedVolume = 0;
  let alignSum = 0;
  let minNormalAlign = 1;
  let invertedTriangles = 0;
  let triCount = 0;
  let topNySum = 0;
  let topCount = 0;

  nonIndexed.computeBoundingBox();
  const bb = nonIndexed.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const topThreshold = bb.max.y - 1e-4;

  for (let i = 0; i < pos.count; i += 3) {
    v0.fromBufferAttribute(pos, i);
    v1.fromBufferAttribute(pos, i + 1);
    v2.fromBufferAttribute(pos, i + 2);

    e1.subVectors(v1, v0);
    e2.subVectors(v2, v0);
    faceN.crossVectors(e1, e2);
    signedVolume += v0.dot(faceN) / 6;

    const area2 = faceN.length();
    if (area2 > 1e-10) {
      faceN.divideScalar(area2);
      vn.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        vn.x += norm.getX(i + k);
        vn.y += norm.getY(i + k);
        vn.z += norm.getZ(i + k);
      }
      vn.normalize();
      const align = faceN.dot(vn);
      alignSum += align;
      if (align < minNormalAlign) minNormalAlign = align;
      if (align <= 0) invertedTriangles++;
      triCount++;

      if (v0.y >= topThreshold && v1.y >= topThreshold && v2.y >= topThreshold) {
        topNySum += vn.y;
        topCount++;
      }
    }
  }

  if (nonIndexed !== geo) nonIndexed.dispose();
  return {
    signedVolume,
    avgNormalAlign: triCount > 0 ? alignSum / triCount : 0,
    minNormalAlign,
    invertedTriangles,
    topFaceNormalY: topCount > 0 ? topNySum / topCount : 0,
    size,
  };
}

describe('Iteration 2 Regressions — RoundedBox winding, Stations, Environments, Gear, VFX & Anim', () => {
  it('createRoundedBoxGeometry has positive signed volume, exact [w,h,d] dimensions, zero inverted triangles & outward +Y normals on thin/small slabs', () => {
    const cases: Array<[string, number, number, number, number, number]> = [
      ['flr_all_10_11', 10, 0.08, 11, 1, 0.04],
      ['tbl_btop', 1.16, 0.09, 0.70, 2, 0.06],
      ['chr_seat', 0.42, 0.08, 0.36, 1, 0.03],
      ['stn_lip', 1.58, 0.14, 1.30, 2, 0.05],
      ['stn_sus_rice', 0.14, 0.08, 0.22, 1, 0.032],
      ['car_roof', 0.92, 0.12, 0.82, 2, 0.05],
      ['char_shoe', 0.16, 0.10, 0.23, 1, 0.035],
      ['pet_pup_snout', 0.16, 0.11, 0.14, 1, 0.045],
      ['tool_mclv_blade', 0.042, 0.48, 0.28, 2, 0.015],
    ];

    for (const [name, w, h, d, seg, rad] of cases) {
      const geo = createRoundedBoxGeometry(w, h, d, seg, rad);
      const res = auditClosedGeometry(geo);
      expect(res.signedVolume, `${name} signedVolume`).toBeGreaterThan(0);
      expect(res.invertedTriangles, `${name} zero inverted tris`).toBe(0);
      expect(res.minNormalAlign, `${name} min normal align`).toBeGreaterThan(0.5);
      expect(res.size.x, `${name} size.x`).toBeCloseTo(w, 3);
      expect(res.size.y, `${name} size.y`).toBeCloseTo(h, 3);
      expect(res.size.z, `${name} size.z`).toBeCloseTo(d, 3);
      expect(res.avgNormalAlign, `${name} outward normal align`).toBeGreaterThan(0.95);
      expect(res.topFaceNormalY, `${name} top-face +Y normal`).toBeGreaterThan(0.95);
      geo.dispose();
    }
  });

  it('aligns dessert vitrineDome flush with vitrineBody, renders wok pan DoubleSide, and keeps m=2..4 multi-machines non-overlapping across all 10 styles', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    // 1. Dessert vitrineDome alignment check
    const dessertTpl = RESTAURANT_LIST.flatMap((r) => r.stations).find((s) => s.modelStyle === 'dessert')!;
    const dessertRig = buildStationRig(dessertTpl, 0, mats, geos, textures);
    dessertRig.lockedCrate.visible = false;
    dessertRig.unlockedMachine.visible = true;
    dessertRig.unlockedMachine.updateMatrixWorld(true);

    const glassMeshes = findTransparentGlassMeshes(dessertRig.unitSlots[0]);
    expect(glassMeshes.length).toBe(2); // vitrineBody + vitrineDome
    const domeMesh = glassMeshes.find((m) => m.geometry instanceof THREE.CylinderGeometry)!;
    const bodyMesh = glassMeshes.find((m) => !(m.geometry instanceof THREE.CylinderGeometry))!;
    expect(domeMesh).toBeDefined();
    expect(bodyMesh).toBeDefined();
    const domeSize = new THREE.Box3().setFromObject(domeMesh).getSize(new THREE.Vector3());
    const bodySize = new THREE.Box3().setFromObject(bodyMesh).getSize(new THREE.Vector3());
    expect(domeSize.x).toBeCloseTo(1.06, 2);
    expect(domeSize.z).toBeCloseTo(0.76, 2);
    expect(domeSize.x).toBeGreaterThan(domeSize.z);
    expect(domeSize.x).toBeCloseTo(bodySize.x, 2);
    expect(domeSize.z).toBeCloseTo(bodySize.z, 2);

    // 2. Wok pan DoubleSide cast-iron check
    const wokTpl = RESTAURANT_LIST.flatMap((r) => r.stations).find((s) => s.modelStyle === 'wok')!;
    const wokRig = buildStationRig(wokTpl, 0, mats, geos, textures);
    let foundDoubleSideWokPan = false;
    wokRig.unitSlots[0].traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.SphereGeometry) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.side === THREE.DoubleSide && mat.metalness >= 0.5) {
          foundDoubleSideWokPan = true;
        }
      }
    });
    expect(foundDoubleSideWokPan).toBe(true);

    // 3. Multi-machine m=2, m=3, m=4 zero pairwise XZ interpenetration across ALL 10 styles
    for (const style of ALL_STATION_STYLES) {
      const baseTpl = RESTAURANT_LIST.flatMap((r) => r.stations).find((s) => s.modelStyle === style)!;
      const tpl4 = { ...baseTpl, maxMachines: 4 };
      const rig = buildStationRig(tpl4, 0, mats, geos, textures);
      rig.lockedCrate.visible = false;
      rig.unlockedMachine.visible = true;

      for (const m of [2, 3, 4] as const) {
        rig.setMachineCount(m);
        rig.unlockedMachine.updateMatrixWorld(true);
        const unitBoxes = rig.unitSlots.slice(0, m).map((slot) => new THREE.Box3().setFromObject(slot));

        // Stay strictly within 2.28 x 1.34 cabinet footprint
        for (let i = 0; i < m; i++) {
          expect(unitBoxes[i].min.x, `${style} m=${m} u${i} minX`).toBeGreaterThanOrEqual(-1.145);
          expect(unitBoxes[i].max.x, `${style} m=${m} u${i} maxX`).toBeLessThanOrEqual(1.145);
          expect(unitBoxes[i].min.z, `${style} m=${m} u${i} minZ`).toBeGreaterThanOrEqual(-0.675);
          expect(unitBoxes[i].max.z, `${style} m=${m} u${i} maxZ`).toBeLessThanOrEqual(0.675);
        }

        // Zero pairwise XZ overlap
        for (let i = 0; i < m; i++) {
          for (let j = i + 1; j < m; j++) {
            const ovX = Math.min(unitBoxes[i].max.x, unitBoxes[j].max.x) - Math.max(unitBoxes[i].min.x, unitBoxes[j].min.x);
            const ovZ = Math.min(unitBoxes[i].max.z, unitBoxes[j].max.z) - Math.max(unitBoxes[i].min.z, unitBoxes[j].min.z);
            const intersects = ovX > 0.002 && ovZ > 0.002;
            expect(
              intersects,
              `${style} m=${m} u${i}-u${j} overlap (${ovX.toFixed(3)} x ${ovZ.toFixed(3)})`,
            ).toBe(false);
          }
        }
      }
    }

    geos.dispose();
    mats.dispose();
    textures.dispose();
  });

  it('verifies drive_thru lane clearance, food_truck wheels/shelf/chef clearances, counter_stand tip clearances, and special-venue back-wall clearances', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    // A. Drive-Thru side walls & front curb clearance on BOTH drive_thru venues
    for (const id of ['sunset_drive_in', 'highway_express']) {
      const tpl = getRestaurantTemplate(id);
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      envRig.root.updateMatrixWorld(true);

      const laneZ = layout.depth / 2 - 2.5;
      const winZ = laneZ - 3.95;
      const wallBoxes: THREE.Box3[] = [];
      envRig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry === geos.getOrCreate(`sw_dt_${Math.round((winZ - (-layout.depth / 2 - 0.12)) * 10)}`, () => createRoundedBoxGeometry(1, 1, 1))) {
          wallBoxes.push(new THREE.Box3().setFromObject(obj));
        }
      });
      expect(wallBoxes.length, `${id} drive_thru shortened side walls`).toBe(2);
      for (const wb of wallBoxes) {
        expect(wb.max.z, `${id} side wall maxZ clears inner curb`).toBeLessThanOrEqual(winZ + 0.05);
      }

      // Check NO tree pots exist in front road curb band (z > winZ)
      const potGeo = geos.getOrCreate('env_pot', () => new THREE.CylinderGeometry(0.44, 0.32, 0.54, 12));
      envRig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry === potGeo) {
          const pb = new THREE.Box3().setFromObject(obj);
          expect(pb.max.z, `${id} planter pot clears drive_thru road`).toBeLessThan(winZ);
        }
      });

      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    // B. All 5 Food Truck venues: attached wheels, shelf supports all 9 tips, cashier & edge chefs clear!
    const foodTrucks = RESTAURANT_LIST.filter((r) => r.archetype === 'food_truck');
    expect(foodTrucks.length).toBe(5);
    for (const tpl of foodTrucks) {
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      envRig.root.updateMatrixWorld(true);

      const rearBox = new THREE.Box3();
      const frontBox = new THREE.Box3();
      const shelfBox = new THREE.Box3();
      const cabBox = new THREE.Box3();
      const leftSkirtBox = new THREE.Box3();
      const tireBoxes: THREE.Box3[] = [];

      const rearGeo = geos.getOrCreate('trk_rear', () => createRoundedBoxGeometry(1, 1, 1));
      const frontGeo = geos.getOrCreate('trk_fhull', () => createRoundedBoxGeometry(1, 1, 1));
      const shelfGeo = geos.getOrCreate('trk_shelf', () => createRoundedBoxGeometry(1, 1, 1));
      const cabGeo = geos.getOrCreate('trk_cab', () => createRoundedBoxGeometry(1, 1, 1));
      const lsktGeo = geos.getOrCreate('trk_lskt', () => createRoundedBoxGeometry(1, 1, 1));
      const tireGeo = geos.getOrCreate('trk_tire', () => new THREE.CylinderGeometry(0.46, 0.46, 0.34, 16));

      envRig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.geometry === rearGeo) rearBox.setFromObject(obj);
        else if (obj.geometry === frontGeo) frontBox.setFromObject(obj);
        else if (obj.geometry === shelfGeo) shelfBox.setFromObject(obj);
        else if (obj.geometry === cabGeo) cabBox.setFromObject(obj);
        else if (obj.geometry === lsktGeo) leftSkirtBox.setFromObject(obj);
        else if (obj.geometry === tireGeo) tireBoxes.push(new THREE.Box3().setFromObject(obj));
      });

      expect(tireBoxes.length).toBe(4);
      for (const tb of tireBoxes) {
        const attached = tb.intersectsBox(frontBox) || tb.intersectsBox(rearBox);
        expect(attached, `${tpl.id} wheel attached to truck hull`).toBe(true);
        expect(tb.max.z, `${tpl.id} wheel clears customers`).toBeLessThan(1.62);
      }

      // Shelf supports all 9 tipPos X with margin and top <= 0.80
      expect(shelfBox.max.y).toBeLessThanOrEqual(0.80);
      expect(shelfBox.min.z).toBeGreaterThanOrEqual(0.83); // clears cashier torso zMax = 0.84
      expect(frontBox.min.z).toBeGreaterThanOrEqual(0.84);
      for (const slot of layout.slots) {
        expect(slot.tipPos.x).toBeGreaterThanOrEqual(shelfBox.min.x + 0.30);
        expect(slot.tipPos.x).toBeLessThanOrEqual(shelfBox.max.x - 0.30);
        // Edge serving chefs (half-width 0.43) clear leftSkirt and cab
        expect(slot.servePos.x - 0.43).toBeGreaterThan(leftSkirtBox.max.x);
        expect(slot.servePos.x + 0.43).toBeLessThan(cabBox.min.x);
      }

      // Flush cab seam with frontHull & rearWall
      expect(Math.abs(cabBox.min.x - frontBox.max.x)).toBeLessThan(0.02);
      expect(Math.abs(cabBox.min.x - rearBox.max.x)).toBeLessThan(0.02);

      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    // C. All 13 counter_stand venues: counter top <= 0.80 & edge tips clear POS register & condiments!
    const counterStands = RESTAURANT_LIST.filter((r) => r.archetype === 'counter_stand');
    expect(counterStands.length).toBe(13);
    for (const tpl of counterStands) {
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      envRig.root.updateMatrixWorld(true);

      const topGeo = geos.getOrCreate(`cs_top_${layout.width}`, () => createRoundedBoxGeometry(1, 1, 1));
      const regBGeo = geos.getOrCreate('cs_reg_b', () => createRoundedBoxGeometry(1, 1, 1));
      const regSGeo = geos.getOrCreate('cs_reg_s', () => createRoundedBoxGeometry(1, 1, 1));
      const botGeo = geos.getOrCreate('cs_bot', () => new THREE.CylinderGeometry(0.055, 0.06, 0.24, 8));

      const topBox = new THREE.Box3();
      const propBoxes: THREE.Box3[] = [];
      envRig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.geometry === topGeo) topBox.setFromObject(obj);
        if (obj.geometry === regBGeo || obj.geometry === regSGeo || obj.geometry === botGeo) {
          propBoxes.push(new THREE.Box3().setFromObject(obj));
        }
      });

      expect(topBox.max.y, `${tpl.id} counter top <= 0.80`).toBeLessThanOrEqual(0.80);
      expect(propBoxes.length).toBe(4); // regBase, regScreen, 2 condiment bottles

      for (const edgeSlot of [layout.slots[0], layout.slots[layout.slots.length - 1]]) {
        const tip = buildTipCoinStack(mats, `t_${edgeSlot.index}`, geos);
        tip.position.set(edgeSlot.tipPos.x, 0, edgeSlot.tipPos.z);
        tip.updateMatrixWorld(true);
        const tipBox = new THREE.Box3().setFromObject(tip);
        for (const pb of propBoxes) {
          expect(
            tipBox.intersectsBox(pb),
            `${tpl.id} slot ${edgeSlot.index} tip overlaps counter prop`,
          ).toBe(false);
        }
        disposeObjectTree(tip);
      }

      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    // D. event_citadel_inn shield clears tilted marquee; event_potion_shop rune clears carpet; special back-wall props non-overlapping!
    {
      const innTpl = getRestaurantTemplate('event_citadel_inn');
      const innLayout = buildRestaurantLayout(innTpl);
      const innRig = buildEnvironmentRig(innTpl, innLayout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      innRig.root.updateMatrixWorld(true);

      const shieldGeo = geos.getOrCreate('inn_shield', () => createRoundedBoxGeometry(1, 1, 1));
      const signW = Math.min(6.0, innLayout.width * 0.56);
      const marqFrmGeo = geos.getOrCreate(`marq_frm_${Math.round(signW * 10)}`, () => createRoundedBoxGeometry(1, 1, 1));
      const marqPlnGeo = geos.getOrCreate(`marq_pln_${Math.round(signW * 10)}`, () => new THREE.PlaneGeometry(1, 1));

      const shieldBox = new THREE.Box3();
      const marqBox = new THREE.Box3();
      innRig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.geometry === shieldGeo) shieldBox.setFromObject(obj);
        if (obj.geometry === marqFrmGeo || obj.geometry === marqPlnGeo) {
          marqBox.union(new THREE.Box3().setFromObject(obj));
        }
      });
      expect(shieldBox.isEmpty()).toBe(false);
      expect(marqBox.isEmpty()).toBe(false);
      expect(shieldBox.intersectsBox(marqBox)).toBe(false);
      expect(shieldBox.min.y).toBeGreaterThan(marqBox.max.y);
      disposeObjectTree(innRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    {
      const potTpl = getRestaurantTemplate('event_potion_shop');
      const potLayout = buildRestaurantLayout(potTpl);
      const potRig = buildEnvironmentRig(potTpl, potLayout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      potRig.root.updateMatrixWorld(true);

      const runeGeo = geos.getOrCreate('pot_rune', () => new THREE.RingGeometry(0.68, 0.84, 28));
      const carpetGeo = geos.getOrCreate('gh_carpet', () => createRoundedBoxGeometry(1, 1, 1));
      const winFrmGeo = geos.getOrCreate('env_wfrm', () => createRoundedBoxGeometry(1, 1, 1));

      let runeY = -1;
      let carpetMaxY = -1;
      let windowCount = 0;
      potRig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.geometry === runeGeo) runeY = obj.getWorldPosition(new THREE.Vector3()).y;
        if (obj.geometry === carpetGeo) carpetMaxY = new THREE.Box3().setFromObject(obj).max.y;
        if (obj.geometry === winFrmGeo) windowCount++;
      });
      expect(runeY).toBeGreaterThan(carpetMaxY + 0.005);
      expect(windowCount).toBe(0);
      disposeObjectTree(potRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    // Back-wall prop non-overlap on event_citadel_keep, event_tidewater_pier, adventure_corsair, event_crystal_cavern
    const winFrmGeo = geos.getOrCreate('env_wfrm', () => createRoundedBoxGeometry(1, 1, 1));
    const menuGeo = geos.getOrCreate('env_menu_brd', () => createRoundedBoxGeometry(1, 1, 1));
    for (const id of ['event_citadel_keep', 'event_tidewater_pier']) {
      const tpl = getRestaurantTemplate(id);
      const rig = buildEnvironmentRig(tpl, buildRestaurantLayout(tpl), '#c7d9b7', mats, geos, textures, '#7ec8e3');
      let winCount = 0;
      rig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry === winFrmGeo) winCount++;
      });
      expect(winCount, `${id} skips generic windows`).toBe(0);
      disposeObjectTree(rig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    {
      const corTpl = getRestaurantTemplate('adventure_corsair');
      const corRig = buildEnvironmentRig(corTpl, buildRestaurantLayout(corTpl), '#c7d9b7', mats, geos, textures, '#7ec8e3');
      corRig.root.updateMatrixWorld(true);
      const whlGeo = geos.getOrCreate('cor_whl', () => new THREE.TorusGeometry(0.52, 0.065, 8, 16));
      const menuBox = new THREE.Box3();
      const winBoxes: THREE.Box3[] = [];
      const whlBoxes: THREE.Box3[] = [];
      corRig.root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.geometry === menuGeo) menuBox.setFromObject(obj);
        if (obj.geometry === winFrmGeo) winBoxes.push(new THREE.Box3().setFromObject(obj));
        if (obj.geometry === whlGeo) whlBoxes.push(new THREE.Box3().setFromObject(obj));
      });
      expect(whlBoxes.length).toBe(2);
      for (const wb of whlBoxes) {
        expect(wb.intersectsBox(menuBox)).toBe(false);
        for (const fb of winBoxes) expect(wb.intersectsBox(fb)).toBe(false);
      }
      disposeObjectTree(corRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }

    geos.dispose();
    mats.dispose();
    textures.dispose();
  });

  it('points raygun emitter forward (+Z) and disables castShadow on transparent character/dish/car glass', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();

    const rig = buildCharacterRig('#ffffff', '#78350f', true, mats, { role: 'player', geos });
    const raygunTpl = GEAR_TEMPLATES.find((g) => g.visualStyle === 'raygun')!;
    const flaskTpl = GEAR_TEMPLATES.find((g) => g.visualStyle === 'flask')!;
    applyEquippedGearVisuals(rig, { hand1: raygunTpl, hand2: flaskTpl }, mats, geos);
    rig.root.updateMatrixWorld(true);

    const gripGeo = geos.getOrCreate('tool_ray_grip', () => createRoundedBoxGeometry(1, 1, 1));
    const emitGeo = geos.getOrCreate('tool_ray_emit', () => new THREE.SphereGeometry(0.065, 8, 8));
    const gripPos = new THREE.Vector3();
    const emitPos = new THREE.Vector3();
    let foundGrip = false;
    let foundEmit = false;
    rig.hand1Anchor.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.geometry === gripGeo) {
        obj.getWorldPosition(gripPos);
        foundGrip = true;
      } else if (obj.geometry === emitGeo) {
        obj.getWorldPosition(emitPos);
        foundEmit = true;
      }
    });
    expect(foundGrip && foundEmit).toBe(true);
    expect(emitPos.z).toBeGreaterThan(gripPos.z + 0.25);

    // Transparent glass parts on flask, dishes, and car must NOT cast shadows
    for (const gm of findTransparentGlassMeshes(rig.hand2Anchor)) {
      expect(gm.castShadow).toBe(false);
    }
    for (const style of ['juicer', 'blender'] as const) {
      const dish = buildFoodDishMesh(style, '#f97316', '#fde047', mats, geos);
      for (const gm of findTransparentGlassMeshes(dish)) {
        expect(gm.castShadow).toBe(false);
      }
    }
    const car = buildDriveThruCarRig('#38bdf8', false, mats, geos);
    for (const gm of findTransparentGlassMeshes(car.root)) {
      expect(gm.castShadow).toBe(false);
    }

    geos.dispose();
    mats.dispose();
  });

  it('VfxSystem compacts InstancedMesh buckets immediately on setQuality downgrade, holds 90+ hearts with zero ghosts, and ignores NaN/Infinity inputs', () => {
    const vfx = new VfxSystem('high');
    const buckets: THREE.InstancedMesh[] = [];
    vfx.root.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) buckets.push(obj);
    });
    const sumBucketCounts = () => buckets.reduce((acc, b) => acc + b.count, 0);

    // 1. Immediate bucket compaction on high -> low downgrade (BEFORE calling update!)
    for (let i = 0; i < 240; i++) vfx.emitSteam(i * 0.01, 1.0, 0);
    vfx.update(1 / 60);
    expect(sumBucketCounts()).toBe(240);

    vfx.setQuality('low');
    expect(vfx.getActiveCount()).toBe(60);
    expect(sumBucketCounts()).toBe(60);

    // 2. 90 simultaneous hearts render with zero ghost slots (sum === activeCount)
    vfx.clear();
    vfx.setQuality('high');
    for (let i = 0; i < 30; i++) vfx.emitHearts(i * 0.1, 1.8, 0, 3);
    vfx.update(1 / 60);
    expect(vfx.getActiveCount()).toBe(90);
    expect(sumBucketCounts()).toBe(90);
    expect(buckets[3].count).toBe(90);

    // 3. Non-finite coordinates/directions never poison buffers
    vfx.clear();
    vfx.emitSteam(NaN, NaN, NaN);
    vfx.emitSpeedDust(0, 0.1, 0, NaN, 1);
    vfx.emitSpeedDust(0, 0.1, 0, Infinity, Infinity);
    vfx.emitConfetti(Infinity, 1, 0, 10);
    vfx.emitHearts(0, 1.8, 0, NaN);
    vfx.update(1 / 60);
    for (const b of buckets) {
      for (let i = 0; i < b.count * 16; i++) {
        expect(Number.isFinite(b.instanceMatrix.array[i])).toBe(true);
      }
    }
    vfx.dispose();
  });

  it('animationHelpers guards NaN/Infinity on evaluateCrateWiggle & stepSpring and produces a smooth monotonic blink bell curve', () => {
    for (const [clk, seed] of [[NaN, 0], [Infinity, 0], [0, NaN], [-Infinity, Infinity]]) {
      const res = evaluateCrateWiggle(clk, seed);
      expect(res).toEqual({ rotZ: 0, hopY: 0, bowScale: 1 });
    }

    const s1 = { value: NaN, velocity: NaN };
    expect(stepSpring(s1, 1.0, 0)).toBe(1.0);
    expect(s1.velocity).toBe(0);

    const s2 = { value: 0.5, velocity: 0 };
    const v2 = stepSpring(s2, NaN, 1 / 60);
    expect(Number.isFinite(v2)).toBe(true);
    expect(Number.isFinite(s2.velocity)).toBe(true);

    // Smooth single-peak bell curve during blink (no 0.01 -> 1.1 -> 0.45 twitch!)
    const anim = createCharacterAnimState('blink_check', 0, 0, 0);
    anim.blinkTimer = 0.01;
    const eyelids: number[] = [];
    for (let i = 0; i < 12; i++) {
      eyelids.push(stepBlinkAndExpression(anim, 1 / 60).eyelidScaleY);
    }
    const peakIdx = eyelids.indexOf(Math.max(...eyelids));
    expect(peakIdx).toBeGreaterThanOrEqual(2);
    expect(eyelids[peakIdx]).toBeGreaterThan(1.0);
    for (let i = 1; i <= peakIdx; i++) {
      expect(eyelids[i]).toBeGreaterThanOrEqual(eyelids[i - 1] - 1e-6);
    }
    for (let i = peakIdx + 1; i < eyelids.length; i++) {
      expect(eyelids[i]).toBeLessThanOrEqual(eyelids[i - 1] + 1e-6);
    }
  });

  it('aligns all 45 food_truck rendered tip stacks inside trk_shelf X/Z with zero cashier overlap and clears centerpiece vases on all 234 dining tables', () => {
    const geos = new GeometryPool();
    const mats = new MaterialPool();
    const textures = new TextureFactory();

    // 1. All 5 food_truck venues (45 slots): resolveTipVisualZ places every tip stack 100% inside trk_shelf X/Z & clear of hired cashier
    const foodTrucks = RESTAURANT_LIST.filter((r) => r.archetype === 'food_truck');
    expect(foodTrucks.length).toBe(5);
    let checkedTruckSlots = 0;
    for (const tpl of foodTrucks) {
      const layout = buildRestaurantLayout(tpl);
      const envRig = buildEnvironmentRig(tpl, layout, '#86efac', mats, geos, textures, '#7ec8e3');
      envRig.root.updateMatrixWorld(true);

      const shelfGeo = geos.getOrCreate('trk_shelf', () => createRoundedBoxGeometry(1, 1, 1));
      const shelfBox = new THREE.Box3();
      envRig.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry === shelfGeo) {
          shelfBox.setFromObject(obj);
        }
      });

      const cashier = buildCharacterRig('#10b981', '#1e293b', false, mats, {
        role: 'cashier',
        geos,
      });
      cashier.root.position.set(
        layout.waiterHomePositions[0].x,
        0,
        layout.waiterHomePositions[0].z,
      );
      cashier.root.updateMatrixWorld(true);
      const cashierMeshBoxes: THREE.Box3[] = [];
      cashier.root.traverseVisible((obj) => {
        if (obj instanceof THREE.Mesh) {
          cashierMeshBoxes.push(new THREE.Box3().setFromObject(obj));
        }
      });
      expect(cashierMeshBoxes.length).toBeGreaterThan(10);

      for (const slot of layout.slots) {
        checkedTruckSlots += 1;
        const tipZ = resolveTipVisualZ(tpl.archetype, slot.tipPos.z);
        expect(tipZ).toBeCloseTo(1.22, 5);
        const tip = buildTipCoinStack(mats, `ft_${tpl.id}_${slot.index}`, geos);
        tip.position.set(slot.tipPos.x, 0, tipZ);
        tip.updateMatrixWorld(true);
        const tipBox = new THREE.Box3().setFromObject(tip);

        expect(tipBox.min.x, `${tpl.id} slot ${slot.index} tip min.x inside shelf`).toBeGreaterThanOrEqual(shelfBox.min.x);
        expect(tipBox.max.x, `${tpl.id} slot ${slot.index} tip max.x inside shelf`).toBeLessThanOrEqual(shelfBox.max.x);
        expect(tipBox.min.z, `${tpl.id} slot ${slot.index} tip min.z inside shelf`).toBeGreaterThanOrEqual(shelfBox.min.z);
        expect(tipBox.max.z, `${tpl.id} slot ${slot.index} tip max.z inside shelf`).toBeLessThanOrEqual(shelfBox.max.z);
        tip.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const tb = new THREE.Box3().setFromObject(obj);
            for (const cb of cashierMeshBoxes) {
              expect(
                tb.intersectsBox(cb),
                `${tpl.id} slot ${slot.index} tip mesh clears cashier rig`,
              ).toBe(false);
            }
          }
        });
        disposeObjectTree(tip);
      }

      disposeObjectTree(cashier.root);
      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }
    expect(checkedTruckSlots).toBe(45);

    // Non-food_truck archetypes preserve raw simZ untouched
    expect(resolveTipVisualZ('counter_stand', 0.80)).toBe(0.80);
    expect(resolveTipVisualZ('cafe_tables', 2.45)).toBe(2.45);
    expect(resolveTipVisualZ('drive_thru', 1.2)).toBe(1.2);

    // 2. All 27 dining venues (234 tables): centerpiece vase & flower clear rotating tip stacks with zero Box3 overlap
    const diningVenues = RESTAURANT_LIST.filter(
      (r) =>
        r.archetype === 'cafe_tables' ||
        r.archetype === 'waiter_dining' ||
        r.archetype === 'grand_hall',
    );
    expect(diningVenues.length).toBe(27);
    let checkedTables = 0;

    for (const tpl of diningVenues) {
      const layout = buildRestaurantLayout(tpl);
      for (const s of layout.slots) s.unlocked = true;
      const envRig = buildEnvironmentRig(tpl, layout, '#c7d9b7', mats, geos, textures, '#7ec8e3');
      syncDynamicTables(envRig, layout);
      envRig.root.updateMatrixWorld(true);

      const vaseGeo = geos.getOrCreate('tbl_vase', () => new THREE.CylinderGeometry(0.05, 0.065, 0.14, 10));
      const flowerGeo = geos.getOrCreate('tbl_flw', () => new THREE.SphereGeometry(0.068, 8, 6));

      for (const tbl of envRig.tables) {
        checkedTables += 1;
        const propBoxes: THREE.Box3[] = [];
        tbl.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && (obj.geometry === vaseGeo || obj.geometry === flowerGeo)) {
            propBoxes.push(new THREE.Box3().setFromObject(obj));
          }
        });
        expect(propBoxes.length, `${tpl.id} table ${tbl.tableIndex} has vase + flower`).toBe(2);

        const tip = buildTipCoinStack(mats, `dt_${tpl.id}_${tbl.tableIndex}`, geos);
        tip.position.set(tbl.center.x, 0, tbl.center.z);
        const vTmp = new THREE.Vector3();
        for (const angle of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2]) {
          tip.rotation.y = angle;
          tip.updateMatrixWorld(true);
          const tipVertexBox = new THREE.Box3();
          tip.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              const pos = obj.geometry.getAttribute('position');
              if (pos) {
                for (let vi = 0; vi < pos.count; vi++) {
                  vTmp.fromBufferAttribute(pos, vi).applyMatrix4(obj.matrixWorld);
                  tipVertexBox.expandByPoint(vTmp);
                }
              }
            }
          });
          for (const pb of propBoxes) {
            expect(
              tipVertexBox.intersectsBox(pb),
              `${tpl.id} table ${tbl.tableIndex} angle=${angle.toFixed(2)} tip overlaps centerpiece`,
            ).toBe(false);
          }
        }
        disposeObjectTree(tip);
      }

      disposeObjectTree(envRig.root, { clearChildren: true });
      mats.disposeSceneScoped();
      textures.disposeSceneScoped();
    }
    expect(checkedTables).toBe(234);

    geos.dispose();
    mats.dispose();
    textures.dispose();
  });
});
