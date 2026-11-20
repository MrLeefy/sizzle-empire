import * as THREE from 'three';
import type { StationTemplate } from '@/types/game';
import {
  GeometryPool,
  MaterialPool,
  TextureFactory,
  createRoundedBoxGeometry,
} from './materialLibrary';

export interface StationVisualRig {
  root: THREE.Group;
  lockedCrate: THREE.Group;
  crateBowGroup: THREE.Group;
  unlockedMachine: THREE.Group;
  applianceGroup: THREE.Group;
  unitSlots: THREE.Group[];
  extensionWings: THREE.Group;
  activeGlowMesh: THREE.Mesh;
  activeGlowMeshes: THREE.Mesh[];
  animatedParts: THREE.Object3D[];
  popularRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  progressRing: THREE.Mesh;
  progressFill: THREE.Mesh;
  modelStyle: StationTemplate['modelStyle'];
  maxMachines: number;
  visibleMachines: number;
  stationIndex: number;
  setMachineCount: (count: number) => boolean;
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

const MACHINE_SLOT_LAYOUTS: Record<
  1 | 2 | 3 | 4,
  Array<{ x: number; z: number; s: number }>
> = {
  1: [{ x: 0, z: 0, s: 1.0 }],
  2: [
    { x: -0.48, z: 0, s: 0.74 },
    { x: 0.48, z: 0, s: 0.74 },
  ],
  3: [
    { x: -0.73, z: 0.04, s: 0.54 },
    { x: 0, z: -0.06, s: 0.54 },
    { x: 0.73, z: 0.04, s: 0.54 },
  ],
  4: [
    { x: -0.56, z: 0.30, s: 0.45 },
    { x: 0.56, z: 0.30, s: 0.45 },
    { x: -0.56, z: -0.31, s: 0.45 },
    { x: 0.56, z: -0.31, s: 0.45 },
  ],
};

function buildApplianceUnit(
  tpl: StationTemplate,
  mats: MaterialPool,
  geos: GeometryPool | undefined,
): { unit: THREE.Group; glowMesh: THREE.Mesh; animatedPart: THREE.Object3D } {
  const unit = new THREE.Group();
  const mainMat = mats.glossy(tpl.color, 0.26, 0.12);
  const accMat = mats.glossy(tpl.accentColor, 0.26, 0.12);
  const chromeMat = mats.metallic('#e2e8f0', 0.18, 0.8);
  const darkIronMat = mats.metallic('#273142', 0.36, 0.62);
  const brassMat = mats.metallic('#eab308', 0.22, 0.78);
  const creamMat = mats.glossy('#fffbf0', 0.34, 0.04);

  let glowMesh: THREE.Mesh;
  let animatedPart: THREE.Object3D;

  switch (tpl.modelStyle) {
    case 'juicer': {
      const base = new THREE.Mesh(
        getGeo(geos, 'stn_jui_base', () => new THREE.CylinderGeometry(0.32, 0.36, 0.16, 14)),
        chromeMat,
      );
      base.position.y = 0.08;

      const juiceCore = new THREE.Mesh(
        getGeo(geos, 'stn_jui_core', () => new THREE.CylinderGeometry(0.24, 0.21, 0.44, 14)),
        mats.emissiveGlow(tpl.color, 0.45, 0.18),
      );
      juiceCore.position.y = 0.38;
      glowMesh = juiceCore;

      // Floating citrus wheel slice inside tank
      const citrus = new THREE.Mesh(
        getGeo(geos, 'stn_jui_citrus', () => new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12)),
        accMat,
      );
      citrus.rotation.set(0.4, 0.2, 0.5);
      citrus.position.set(0.04, 0.48, 0.04);

      // Translucent glass outer juice tank (depthWrite=false, castShadow=false, renderOrder=2)
      const tankGlass = new THREE.Mesh(
        getGeo(geos, 'stn_jui_glass', () => new THREE.CylinderGeometry(0.30, 0.26, 0.56, 16)),
        mats.glass('#ffffff', 0.34),
      );
      tankGlass.position.y = 0.44;
      tankGlass.castShadow = false;
      tankGlass.receiveShadow = false;
      tankGlass.renderOrder = 2;

      const cap = new THREE.Mesh(
        getGeo(geos, 'stn_jui_cap', () => new THREE.SphereGeometry(0.30, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        accMat,
      );
      cap.position.y = 0.71;

      // Animated top fruit-press lever arm
      const pressGroup = new THREE.Group();
      pressGroup.position.set(0, 0.96, 0);
      const shaft = new THREE.Mesh(
        getGeo(geos, 'stn_jui_shaft', () => new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8)),
        chromeMat,
      );
      const lever = new THREE.Mesh(
        getGeo(geos, 'stn_jui_lever', () => createRoundedBoxGeometry(0.34, 0.055, 0.06, 1, 0.02)),
        accMat,
      );
      lever.position.set(0.14, 0.09, 0);
      const knob = new THREE.Mesh(
        getGeo(geos, 'stn_jui_knob', () => new THREE.SphereGeometry(0.055, 8, 8)),
        mainMat,
      );
      knob.position.set(0.30, 0.09, 0);
      pressGroup.add(shaft, lever, knob);
      animatedPart = pressGroup;

      // Brass front spout + waiting cup
      const spout = new THREE.Mesh(
        getGeo(geos, 'stn_jui_spout', () => new THREE.CylinderGeometry(0.03, 0.035, 0.16, 8)),
        brassMat,
      );
      spout.rotation.x = Math.PI / 2;
      spout.position.set(0, 0.20, 0.34);
      const cup = new THREE.Mesh(
        getGeo(geos, 'stn_jui_cup', () => new THREE.CylinderGeometry(0.09, 0.07, 0.16, 10)),
        creamMat,
      );
      cup.position.set(0, 0.08, 0.42);

      unit.add(base, juiceCore, citrus, tankGlass, cap, pressGroup, spout, cup);
      break;
    }

    case 'blender': {
      const motor = new THREE.Mesh(
        getGeo(geos, 'stn_bld_motor', () => createRoundedBoxGeometry(0.54, 0.24, 0.48, 2, 0.06)),
        accMat,
      );
      motor.position.y = 0.12;

      // Twin chrome dial buttons
      const dialGeo = getGeo(geos, 'stn_bld_dial', () => new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10));
      for (const dx of [-0.11, 0.11]) {
        const dial = new THREE.Mesh(dialGeo, chromeMat);
        dial.rotation.x = Math.PI / 2;
        dial.position.set(dx, 0.12, 0.25);
        unit.add(dial);
      }

      // Inner swirling smoothie cone + spinning fruit chunks
      const vortexGroup = new THREE.Group();
      vortexGroup.position.y = 0.46;
      const smoothie = new THREE.Mesh(
        getGeo(geos, 'stn_bld_core', () => new THREE.CylinderGeometry(0.22, 0.15, 0.42, 12)),
        mats.emissiveGlow(tpl.color, 0.42, 0.2),
      );
      glowMesh = smoothie;
      const chunkGeo = getGeo(geos, 'stn_bld_chunk', () => new THREE.SphereGeometry(0.055, 8, 6));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const ch = new THREE.Mesh(chunkGeo, accMat);
        ch.position.set(Math.cos(a) * 0.11, 0.10 + (i % 2) * 0.06, Math.sin(a) * 0.11);
        vortexGroup.add(ch);
      }
      vortexGroup.add(smoothie);
      animatedPart = vortexGroup;

      // Flared translucent pitcher + curved handle
      const pitcher = new THREE.Mesh(
        getGeo(geos, 'stn_bld_pitch', () => new THREE.CylinderGeometry(0.27, 0.19, 0.54, 14)),
        mats.glass('#ffffff', 0.32),
      );
      pitcher.position.y = 0.50;
      pitcher.castShadow = false;
      pitcher.receiveShadow = false;
      pitcher.renderOrder = 2;

      const handle = new THREE.Mesh(
        getGeo(geos, 'stn_bld_hdl', () => new THREE.TorusGeometry(0.14, 0.028, 6, 12, Math.PI)),
        darkIronMat,
      );
      handle.rotation.z = -Math.PI / 2;
      handle.position.set(0.24, 0.50, 0);

      const lid = new THREE.Mesh(
        getGeo(geos, 'stn_bld_lid', () => new THREE.CylinderGeometry(0.29, 0.28, 0.07, 14)),
        darkIronMat,
      );
      lid.position.y = 0.79;
      const stopper = new THREE.Mesh(
        getGeo(geos, 'stn_bld_stop', () => new THREE.CylinderGeometry(0.08, 0.09, 0.07, 10)),
        chromeMat,
      );
      stopper.position.y = 0.85;

      unit.add(motor, vortexGroup, pitcher, handle, lid, stopper);
      break;
    }

    case 'grill': {
      const basin = new THREE.Mesh(
        getGeo(geos, 'stn_grl_basin', () => createRoundedBoxGeometry(1.12, 0.16, 0.86, 2, 0.04)),
        darkIronMat,
      );
      basin.position.y = 0.08;

      const coals = new THREE.Mesh(
        getGeo(geos, 'stn_grl_coals', () => createRoundedBoxGeometry(0.96, 0.06, 0.68, 1, 0.02)),
        mats.emissiveGlow('#f97316', 0.92, 0.28),
      );
      coals.position.y = 0.14;
      glowMesh = coals;

      // 5 parallel raised dark-iron grill grates
      const barGeo = getGeo(geos, 'stn_grl_bar', () => new THREE.CylinderGeometry(0.018, 0.018, 0.98, 6));
      for (let i = -2; i <= 2; i++) {
        const bar = new THREE.Mesh(barGeo, darkIronMat);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.18, i * 0.13);
        unit.add(bar);
      }

      // 3 chunky sizzling patties/skewers on top of grates
      const sizzleGroup = new THREE.Group();
      sizzleGroup.position.y = 0.22;
      const pattyGeo = getGeo(geos, 'stn_grl_patty', () => new THREE.CylinderGeometry(0.14, 0.14, 0.065, 12));
      const garnGeo = getGeo(geos, 'stn_grl_garn', () => new THREE.BoxGeometry(0.15, 0.02, 0.15));
      for (const [px, pz] of [[-0.28, 0.06], [0.02, -0.08], [0.30, 0.08]]) {
        const pat = new THREE.Mesh(pattyGeo, mainMat);
        pat.position.set(px, 0, pz);
        const gar = new THREE.Mesh(garnGeo, accMat);
        gar.rotation.y = Math.PI / 4;
        gar.position.set(px, 0.04, pz);
        sizzleGroup.add(pat, gar);
      }
      animatedPart = sizzleGroup;

      // Connected brushed-chrome exhaust hood via rear vertical duct (ZERO floating hood!)
      const duct = new THREE.Mesh(
        getGeo(geos, 'stn_grl_duct', () => createRoundedBoxGeometry(0.24, 0.96, 0.18, 1, 0.03)),
        chromeMat,
      );
      duct.position.set(0, 0.54, -0.36);
      const hood = new THREE.Mesh(
        getGeo(geos, 'stn_grl_hood', () => createRoundedBoxGeometry(1.06, 0.22, 0.64, 2, 0.05)),
        chromeMat,
      );
      hood.position.set(0, 1.02, -0.10);
      const hoodTrim = new THREE.Mesh(
        getGeo(geos, 'stn_grl_htrim', () => createRoundedBoxGeometry(1.08, 0.05, 0.66, 1, 0.02)),
        accMat,
      );
      hoodTrim.position.set(0, 0.92, -0.10);

      unit.add(basin, coals, sizzleGroup, duct, hood, hoodTrim);
      break;
    }

    case 'fryer': {
      const body = new THREE.Mesh(
        getGeo(geos, 'stn_fry_body', () => createRoundedBoxGeometry(1.08, 0.24, 0.84, 2, 0.05)),
        chromeMat,
      );
      body.position.y = 0.12;

      const oil = new THREE.Mesh(
        getGeo(geos, 'stn_fry_oil', () => createRoundedBoxGeometry(0.92, 0.05, 0.64, 1, 0.02)),
        mats.emissiveGlow('#fbbf24', 0.78, 0.16),
      );
      oil.position.y = 0.23;
      glowMesh = oil;

      // Twin dipping fry baskets with colored rubber handles + crispy bites
      const basketsGroup = new THREE.Group();
      basketsGroup.position.y = 0.28;
      const basketGeo = getGeo(geos, 'stn_fry_bsk', () => createRoundedBoxGeometry(0.36, 0.16, 0.44, 1, 0.025));
      const handleGeo = getGeo(geos, 'stn_fry_hdl', () => createRoundedBoxGeometry(0.06, 0.05, 0.26, 1, 0.02));
      const biteGeo = getGeo(geos, 'stn_fry_bite', () => new THREE.SphereGeometry(0.06, 8, 6));
      for (const sx of [-0.25, 0.25]) {
        const bsk = new THREE.Mesh(basketGeo, darkIronMat);
        bsk.position.set(sx, 0, -0.02);
        const hdl = new THREE.Mesh(handleGeo, accMat);
        hdl.position.set(sx, 0.09, 0.28);
        hdl.rotation.x = -0.35;
        basketsGroup.add(bsk, hdl);
        for (const [bx, bz] of [[-0.08, -0.06], [0.08, -0.05], [0, 0.06]]) {
          const bite = new THREE.Mesh(biteGeo, mainMat);
          bite.position.set(sx + bx, 0.08, bz);
          basketsGroup.add(bite);
        }
      }
      animatedPart = basketsGroup;

      // Rear stainless backsplash w/ status LEDs & chrome knobs
      const splash = new THREE.Mesh(
        getGeo(geos, 'stn_fry_spl', () => createRoundedBoxGeometry(1.06, 0.44, 0.10, 1, 0.03)),
        chromeMat,
      );
      splash.position.set(0, 0.40, -0.37);
      const ledGreen = new THREE.Mesh(
        getGeo(geos, 'stn_fry_led', () => new THREE.SphereGeometry(0.036, 8, 6)),
        mats.emissiveGlow('#4ade80', 1.0, 0.15),
      );
      ledGreen.position.set(-0.34, 0.48, -0.31);
      const ledRed = new THREE.Mesh(
        getGeo(geos, 'stn_fry_led', () => new THREE.SphereGeometry(0.036, 8, 6)),
        mats.emissiveGlow('#ef4444', 1.0, 0.15),
      );
      ledRed.position.set(-0.22, 0.48, -0.31);

      unit.add(body, oil, basketsGroup, splash, ledGreen, ledRed);
      break;
    }

    case 'wok': {
      const stoveBase = new THREE.Mesh(
        getGeo(geos, 'stn_wok_base', () => new THREE.CylinderGeometry(0.42, 0.46, 0.16, 16)),
        darkIronMat,
      );
      stoveBase.position.y = 0.08;

      const flameRing = new THREE.Mesh(
        getGeo(geos, 'stn_wok_flame', () => new THREE.TorusGeometry(0.30, 0.042, 8, 18)),
        mats.emissiveGlow('#fb923c', 1.0, 0.16),
      );
      flameRing.rotation.x = Math.PI / 2;
      flameRing.position.y = 0.17;
      glowMesh = flameRing;

      // Concave cast-iron wok pan + wooden handle + colorful stir-fry toss group
      const wokGroup = new THREE.Group();
      wokGroup.position.y = 0.34;
      const wokPanMat = mats.metallic('#273142', 0.36, 0.62, undefined, 0.45, THREE.DoubleSide);
      const pan = new THREE.Mesh(
        getGeo(geos, 'stn_wok_pan', () => new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5)),
        wokPanMat,
      );
      pan.position.y = 0.24;
      const rim = new THREE.Mesh(
        getGeo(geos, 'stn_wok_rim', () => new THREE.TorusGeometry(0.42, 0.03, 6, 18)),
        darkIronMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.24;
      const handle = new THREE.Mesh(
        getGeo(geos, 'stn_wok_hdl', () => new THREE.CylinderGeometry(0.034, 0.042, 0.34, 8)),
        mats.std('#78350f', 0.55, 0.04),
      );
      handle.rotation.z = -Math.PI / 2 + 0.35;
      handle.position.set(0.54, 0.28, 0);
      const mound = new THREE.Mesh(
        getGeo(geos, 'stn_wok_mound', () => new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        mainMat,
      );
      mound.scale.set(1, 0.55, 1);
      mound.position.y = 0.08;
      const chunkGeo = getGeo(geos, 'stn_wok_chk', () => new THREE.SphereGeometry(0.065, 8, 6));
      for (const [cx, cz] of [[-0.12, 0.08], [0.14, 0.04], [0.02, -0.12]]) {
        const ch = new THREE.Mesh(chunkGeo, accMat);
        ch.position.set(cx, 0.20, cz);
        wokGroup.add(ch);
      }
      wokGroup.add(pan, rim, handle, mound);
      animatedPart = wokGroup;

      // Rear brass spice rack
      const rack = new THREE.Mesh(
        getGeo(geos, 'stn_wok_rack', () => createRoundedBoxGeometry(0.62, 0.14, 0.16, 1, 0.03)),
        brassMat,
      );
      rack.position.set(0, 0.10, -0.44);

      unit.add(stoveBase, flameRing, wokGroup, rack);
      break;
    }

    case 'oven': {
      const hearth = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_hrth', () => createRoundedBoxGeometry(1.16, 0.12, 0.96, 2, 0.04)),
        mats.std('#cbd5e1', 0.55, 0.05),
      );
      hearth.position.y = 0.06;

      const brickMat = mats.glossy('#c2410c', 0.44, 0.05);
      const dome = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_dome', () => new THREE.SphereGeometry(0.54, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)),
        brickMat,
      );
      dome.position.set(0, 0.08, -0.06);

      const arch = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_arch', () => new THREE.TorusGeometry(0.24, 0.065, 8, 14, Math.PI)),
        mats.glossy('#9a3412', 0.46, 0.06),
      );
      arch.position.set(0, 0.12, 0.40);

      const mouth = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_mouth', () => new THREE.CylinderGeometry(0.20, 0.20, 0.14, 12)),
        mats.std('#1e1410', 0.8, 0.02),
      );
      mouth.rotation.x = Math.PI / 2;
      mouth.position.set(0, 0.23, 0.34);

      const fire = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_fire', () => new THREE.SphereGeometry(0.16, 10, 8)),
        mats.emissiveGlow('#fb923c', 1.1, 0.16),
      );
      fire.scale.set(1.1, 0.72, 0.65);
      fire.position.set(0, 0.22, 0.38);
      glowMesh = fire;

      // Peel carrying mini pizza/loaf (compact overhang for clean multi-machine m=4 layout)
      const peelGroup = new THREE.Group();
      peelGroup.position.set(0.24, 0.14, 0.36);
      const peelPaddle = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_pad', () => new THREE.CylinderGeometry(0.14, 0.14, 0.022, 12)),
        mats.std('#b45309', 0.55, 0.04),
      );
      const loaf = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_loaf', () => new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12)),
        mainMat,
      );
      loaf.position.y = 0.03;
      const peelStick = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_stk', () => new THREE.CylinderGeometry(0.018, 0.02, 0.18, 6)),
        mats.std('#78350f', 0.58, 0.04),
      );
      peelStick.rotation.x = Math.PI / 2;
      peelStick.position.z = 0.15;
      peelGroup.add(peelPaddle, loaf, peelStick);
      animatedPart = peelGroup;

      // Connected chimney pipe + rain cap
      const chimney = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_chim', () => new THREE.CylinderGeometry(0.10, 0.12, 0.56, 10)),
        darkIronMat,
      );
      chimney.position.set(0, 0.78, -0.10);
      const rainCap = new THREE.Mesh(
        getGeo(geos, 'stn_ovn_rcap', () => new THREE.ConeGeometry(0.16, 0.12, 10)),
        darkIronMat,
      );
      rainCap.position.set(0, 1.12, -0.10);

      unit.add(hearth, dome, arch, mouth, fire, peelGroup, chimney, rainCap);
      break;
    }

    case 'espresso': {
      const body = new THREE.Mesh(
        getGeo(geos, 'stn_esp_body', () => createRoundedBoxGeometry(0.96, 0.56, 0.62, 2, 0.07)),
        chromeMat,
      );
      body.position.set(0, 0.30, -0.08);
      const accentPanel = new THREE.Mesh(
        getGeo(geos, 'stn_esp_pnl', () => createRoundedBoxGeometry(0.98, 0.24, 0.64, 1, 0.05)),
        accMat,
      );
      accentPanel.position.set(0, 0.44, -0.08);

      // Twin translucent bean hoppers filled with dark roasted coffee beans
      const hopperGlassGeo = getGeo(geos, 'stn_esp_hop', () => new THREE.CylinderGeometry(0.15, 0.09, 0.28, 12));
      const beanCoreGeo = getGeo(geos, 'stn_esp_bean', () => new THREE.CylinderGeometry(0.12, 0.08, 0.18, 10));
      const beanMat = mats.std('#451a03', 0.55, 0.05);
      for (const hx of [-0.22, 0.22]) {
        const beans = new THREE.Mesh(beanCoreGeo, beanMat);
        beans.position.set(hx, 0.68, -0.08);
        const hop = new THREE.Mesh(hopperGlassGeo, mats.glass('#fef3c7', 0.38));
        hop.position.set(hx, 0.73, -0.08);
        hop.castShadow = false;
        hop.receiveShadow = false;
        hop.renderOrder = 2;
        const hopLid = new THREE.Mesh(
          getGeo(geos, 'stn_esp_hlid', () => new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12)),
          darkIronMat,
        );
        hopLid.position.set(hx, 0.88, -0.08);
        unit.add(beans, hop, hopLid);
      }

      // Backlit pressure gauge (glowMesh)
      const gauge = new THREE.Mesh(
        getGeo(geos, 'stn_esp_gaug', () => new THREE.CylinderGeometry(0.085, 0.085, 0.04, 12)),
        mats.emissiveGlow('#fef08a', 0.85, 0.14),
      );
      gauge.rotation.x = Math.PI / 2;
      gauge.position.set(0, 0.46, 0.25);
      glowMesh = gauge;

      // Portafilters + drip tray + twin porcelain cups (animatedPart vibrates gently during brew!)
      const brewGroup = new THREE.Group();
      const tray = new THREE.Mesh(
        getGeo(geos, 'stn_esp_tray', () => createRoundedBoxGeometry(0.84, 0.06, 0.30, 1, 0.02)),
        darkIronMat,
      );
      tray.position.set(0, 0.03, 0.30);
      brewGroup.add(tray);

      const cupGeo = getGeo(geos, 'stn_esp_cup', () => new THREE.CylinderGeometry(0.072, 0.058, 0.11, 10));
      const pfGeo = getGeo(geos, 'stn_esp_pf', () => new THREE.CylinderGeometry(0.065, 0.055, 0.07, 10));
      const pfHdlGeo = getGeo(geos, 'stn_esp_pfh', () => new THREE.CylinderGeometry(0.018, 0.022, 0.16, 6));
      for (const bx of [-0.20, 0.20]) {
        const pf = new THREE.Mesh(pfGeo, chromeMat);
        pf.position.set(bx, 0.36, 0.28);
        const pfh = new THREE.Mesh(pfHdlGeo, darkIronMat);
        pfh.rotation.x = Math.PI / 2;
        pfh.position.set(bx, 0.36, 0.38);
        const cup = new THREE.Mesh(cupGeo, creamMat);
        cup.position.set(bx, 0.11, 0.30);
        brewGroup.add(pf, pfh, cup);
      }
      animatedPart = brewGroup;

      // Chrome steam wand on side
      const wand = new THREE.Mesh(
        getGeo(geos, 'stn_esp_wand', () => new THREE.CylinderGeometry(0.014, 0.014, 0.26, 6)),
        chromeMat,
      );
      wand.rotation.z = -0.35;
      wand.position.set(0.42, 0.26, 0.20);

      unit.add(body, accentPanel, gauge, brewGroup, wand);
      break;
    }

    case 'cauldron': {
      // Glowing hearth rune/ember disc underneath
      const hearthDisc = new THREE.Mesh(
        getGeo(geos, 'stn_cld_hrth', () => new THREE.CylinderGeometry(0.36, 0.40, 0.05, 16)),
        mats.emissiveGlow(tpl.accentColor, 0.72, 0.22),
      );
      hearthDisc.position.y = 0.03;

      // 3 tripod iron legs
      const legGeo = getGeo(geos, 'stn_cld_leg', () => new THREE.CylinderGeometry(0.045, 0.035, 0.22, 8));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const lg = new THREE.Mesh(legGeo, darkIronMat);
        lg.position.set(Math.cos(a) * 0.28, 0.11, Math.sin(a) * 0.28);
        unit.add(lg);
      }

      // Bulbous cast-iron cauldron + rolled lip + brass rings
      const pot = new THREE.Mesh(
        getGeo(geos, 'stn_cld_pot', () => new THREE.SphereGeometry(0.44, 14, 12)),
        darkIronMat,
      );
      pot.scale.set(1.06, 0.86, 1.06);
      pot.position.y = 0.42;

      const lip = new THREE.Mesh(
        getGeo(geos, 'stn_cld_lip', () => new THREE.TorusGeometry(0.36, 0.055, 8, 18)),
        darkIronMat,
      );
      lip.rotation.x = Math.PI / 2;
      lip.position.y = 0.64;

      const ringGeo = getGeo(geos, 'stn_cld_ring', () => new THREE.TorusGeometry(0.08, 0.02, 6, 10));
      for (const s of [-1, 1]) {
        const rng = new THREE.Mesh(ringGeo, brassMat);
        rng.rotation.y = Math.PI / 2;
        rng.position.set(s * 0.47, 0.45, 0);
        unit.add(rng);
      }

      // Luminous bubbling brew surface
      const brew = new THREE.Mesh(
        getGeo(geos, 'stn_cld_brew', () => new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16)),
        mats.emissiveGlow(tpl.color, 0.95, 0.14),
      );
      brew.position.y = 0.62;
      glowMesh = brew;

      // Rotating wooden stirring ladle + 4 glossy floating brew bubbles
      const stirGroup = new THREE.Group();
      stirGroup.position.y = 0.65;
      const ladle = new THREE.Mesh(
        getGeo(geos, 'stn_cld_lad', () => new THREE.CylinderGeometry(0.025, 0.032, 0.56, 8)),
        mats.std('#92400e', 0.55, 0.04),
      );
      ladle.position.set(0.14, 0.18, 0);
      ladle.rotation.z = -0.38;
      stirGroup.add(ladle);

      const bubGeo = getGeo(geos, 'stn_cld_bub', () => new THREE.SphereGeometry(0.068, 8, 8));
      const bubMat = mats.emissiveGlow(tpl.accentColor, 0.88, 0.14);
      for (const [bx, by, bz, sc] of [
        [-0.14, 0.05, 0.08, 1.0],
        [0.10, 0.08, -0.10, 0.82],
        [-0.04, 0.10, -0.06, 0.68],
        [0.18, 0.04, 0.12, 0.72],
      ]) {
        const b = new THREE.Mesh(bubGeo, bubMat);
        b.scale.setScalar(sc);
        b.position.set(bx, by, bz);
        stirGroup.add(b);
      }
      animatedPart = stirGroup;

      unit.add(hearthDisc, pot, lip, brew, stirGroup);
      break;
    }

    case 'sushi': {
      // Pale hinoki-wood prep base
      const hinoki = new THREE.Mesh(
        getGeo(geos, 'stn_sus_base', () => createRoundedBoxGeometry(1.16, 0.08, 0.84, 2, 0.03)),
        mats.glossy('#f3d5a5', 0.42, 0.04),
      );
      hinoki.position.y = 0.04;

      // Dark slate board + 5 crisp 3D nigiri/maki pieces (renderOrder=0 INSIDE glass!)
      const platterGroup = new THREE.Group();
      platterGroup.position.y = 0.10;
      const slate = new THREE.Mesh(
        getGeo(geos, 'stn_sus_slate', () => createRoundedBoxGeometry(0.96, 0.04, 0.56, 1, 0.015)),
        mats.std('#1e293b', 0.42, 0.12),
      );
      slate.renderOrder = 0;
      platterGroup.add(slate);

      const riceGeo = getGeo(geos, 'stn_sus_rice', () => createRoundedBoxGeometry(0.14, 0.08, 0.22, 1, 0.032));
      const fishGeo = getGeo(geos, 'stn_sus_fish', () => createRoundedBoxGeometry(0.15, 0.038, 0.24, 1, 0.015));
      const noriGeo = getGeo(geos, 'stn_sus_nori', () => new THREE.BoxGeometry(0.155, 0.105, 0.045));
      const noriMat = mats.std('#14532d', 0.55, 0.04);

      for (let i = -2; i <= 2; i++) {
        const nx = i * 0.18;
        const nz = i % 2 === 0 ? -0.05 : 0.08;
        const rice = new THREE.Mesh(riceGeo, creamMat);
        rice.position.set(nx, 0.06, nz);
        const fish = new THREE.Mesh(fishGeo, i % 2 === 0 ? mainMat : accMat);
        fish.position.set(nx, 0.11, nz);
        const nori = new THREE.Mesh(noriGeo, noriMat);
        nori.position.set(nx, 0.072, nz);
        platterGroup.add(rice, fish, nori);
      }

      // Wasabi dab & soy dish
      const wasabi = new THREE.Mesh(
        getGeo(geos, 'stn_sus_was', () => new THREE.SphereGeometry(0.048, 8, 6)),
        mats.glossy('#4ade80', 0.36, 0.04),
      );
      wasabi.position.set(0.38, 0.05, 0.18);
      const soyDish = new THREE.Mesh(
        getGeo(geos, 'stn_sus_soy', () => new THREE.CylinderGeometry(0.075, 0.065, 0.035, 10)),
        mats.std('#451a03', 0.2, 0.1),
      );
      soyDish.position.set(-0.38, 0.04, 0.18);
      platterGroup.add(wasabi, soyDish);
      animatedPart = platterGroup;

      // Chilled LED accent strip (glowMesh)
      const chillStrip = new THREE.Mesh(
        getGeo(geos, 'stn_sus_glow', () => createRoundedBoxGeometry(1.04, 0.032, 0.04, 1, 0.01)),
        mats.emissiveGlow('#7dd3fc', 0.85, 0.15),
      );
      chillStrip.position.set(0, 0.52, -0.34);
      glowMesh = chillStrip;

      // TRULY TRANSPARENT CHILLED GLASS SHOWCASE (FIXES OPAQUE GLASS BUG!)
      const glassCase = new THREE.Mesh(
        getGeo(geos, 'stn_sus_glass', () => createRoundedBoxGeometry(1.12, 0.46, 0.78, 1, 0.05)),
        mats.glass('#dff6ff', 0.26),
      );
      glassCase.position.y = 0.31;
      glassCase.castShadow = false;
      glassCase.receiveShadow = false;
      glassCase.renderOrder = 2;

      // Slim chrome showcase edge rails
      const railGeo = getGeo(geos, 'stn_sus_rail', () => new THREE.BoxGeometry(0.035, 0.46, 0.035));
      for (const [rx, rz] of [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.38], [0.55, 0.38]]) {
        const rail = new THREE.Mesh(railGeo, chromeMat);
        rail.position.set(rx, 0.31, rz);
        unit.add(rail);
      }

      unit.add(hinoki, platterGroup, chillStrip, glassCase);
      break;
    }

    case 'dessert': {
      // Pastel bakery base pad
      const pad = new THREE.Mesh(
        getGeo(geos, 'stn_des_pad', () => createRoundedBoxGeometry(1.12, 0.08, 0.84, 2, 0.03)),
        mats.glossy('#fce7f3', 0.34, 0.05),
      );
      pad.position.y = 0.04;

      // Warm gold display accent ring (glowMesh)
      const goldRing = new THREE.Mesh(
        getGeo(geos, 'stn_des_ring', () => new THREE.TorusGeometry(0.32, 0.025, 6, 18)),
        mats.emissiveGlow('#fde047', 0.78, 0.18),
      );
      goldRing.rotation.x = Math.PI / 2;
      goldRing.position.y = 0.095;
      glowMesh = goldRing;

      // 2-tier rotating pastry carousel inside vitrine (renderOrder=0!)
      const carousel = new THREE.Group();
      carousel.position.y = 0.10;
      const ped = new THREE.Mesh(
        getGeo(geos, 'stn_des_ped', () => new THREE.CylinderGeometry(0.06, 0.11, 0.28, 10)),
        brassMat,
      );
      ped.position.y = 0.14;
      const tier1 = new THREE.Mesh(
        getGeo(geos, 'stn_des_t1', () => new THREE.CylinderGeometry(0.36, 0.34, 0.032, 16)),
        creamMat,
      );
      tier1.position.y = 0.06;
      const tier2 = new THREE.Mesh(
        getGeo(geos, 'stn_des_t2', () => new THREE.CylinderGeometry(0.22, 0.20, 0.03, 14)),
        creamMat,
      );
      tier2.position.y = 0.28;
      carousel.add(ped, tier1, tier2);

      // 4 colorful cupcakes/macarons on bottom tier
      const cupGeo = getGeo(geos, 'stn_des_cup', () => new THREE.CylinderGeometry(0.075, 0.06, 0.08, 10));
      const frostGeo = getGeo(geos, 'stn_des_frs', () => new THREE.SphereGeometry(0.075, 8, 6));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const cx = Math.cos(a) * 0.22;
        const cz = Math.sin(a) * 0.22;
        const baseCup = new THREE.Mesh(cupGeo, i % 2 === 0 ? mainMat : accMat);
        baseCup.position.set(cx, 0.11, cz);
        const frost = new THREE.Mesh(frostGeo, i % 2 === 0 ? accMat : creamMat);
        frost.scale.set(1, 0.72, 1);
        frost.position.set(cx, 0.16, cz);
        carousel.add(baseCup, frost);
      }

      // Layered top cake + glossy red cherry
      const topCake = new THREE.Mesh(
        getGeo(geos, 'stn_des_cake', () => new THREE.CylinderGeometry(0.14, 0.15, 0.12, 14)),
        mainMat,
      );
      topCake.position.y = 0.36;
      const topGlaze = new THREE.Mesh(
        getGeo(geos, 'stn_des_glz', () => new THREE.TorusGeometry(0.13, 0.026, 6, 14)),
        creamMat,
      );
      topGlaze.rotation.x = Math.PI / 2;
      topGlaze.position.y = 0.42;
      const cherry = new THREE.Mesh(
        getGeo(geos, 'stn_des_chr', () => new THREE.SphereGeometry(0.042, 8, 8)),
        mats.glossy('#ef4444', 0.12, 0.12),
      );
      cherry.position.y = 0.46;
      carousel.add(topCake, topGlaze, cherry);
      animatedPart = carousel;

      // TRULY TRANSPARENT CURVED PASTRY VITRINE (FIXES OPAQUE GLASS BUG!)
      const vitrineGlass = mats.glass('#fff0f7', 0.24);
      const vitrineBody = new THREE.Mesh(
        getGeo(geos, 'stn_des_vbody', () => createRoundedBoxGeometry(1.06, 0.34, 0.76, 1, 0.04)),
        vitrineGlass,
      );
      vitrineBody.position.y = 0.25;
      vitrineBody.castShadow = false;
      vitrineBody.receiveShadow = false;
      vitrineBody.renderOrder = 2;

      const vitrineDome = new THREE.Mesh(
        getGeo(geos, 'stn_des_vdome', () => new THREE.CylinderGeometry(0.38, 0.38, 1.06, 14, 1, false, 0, Math.PI)),
        vitrineGlass,
      );
      vitrineDome.rotation.z = Math.PI / 2;
      vitrineDome.position.y = 0.42;
      vitrineDome.castShadow = false;
      vitrineDome.receiveShadow = false;
      vitrineDome.renderOrder = 2;

      // Slim gold end arch trims
      const archGeo = getGeo(geos, 'stn_des_arch', () => new THREE.TorusGeometry(0.38, 0.02, 6, 16, Math.PI));
      for (const sx of [-0.53, 0.53]) {
        const a = new THREE.Mesh(archGeo, brassMat);
        a.rotation.y = Math.PI / 2;
        a.position.set(sx, 0.42, 0);
        unit.add(a);
      }

      unit.add(pad, goldRing, carousel, vitrineBody, vitrineDome);
      break;
    }
  }

  unit.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const m = obj.material as THREE.MeshStandardMaterial;
      if (!m?.transparent) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    }
  });

  return { unit, glowMesh, animatedPart };
}

/**
 * Updates visible multi-machine appliance slots (1..4) and extension wings strictly within
 * the verified `2.28 × 1.34` flagship envelope. Returns `true` if count changed.
 */
export function syncStationMachineLayout(
  rig: StationVisualRig,
  machineCount: number,
): boolean {
  const clamped = Math.max(1, Math.min(rig.unitSlots.length, Math.round(machineCount))) as
    | 1
    | 2
    | 3
    | 4;
  if (clamped === rig.visibleMachines) return false;
  rig.visibleMachines = clamped;

  const pattern = MACHINE_SLOT_LAYOUTS[clamped] ?? MACHINE_SLOT_LAYOUTS[1];
  for (let i = 0; i < rig.unitSlots.length; i++) {
    const slot = rig.unitSlots[i];
    if (i < clamped) {
      const cfg = pattern[i] ?? { x: 0, z: 0, s: 1 };
      slot.visible = true;
      slot.position.set(cfg.x, 0, cfg.z);
      slot.scale.setScalar(cfg.s);
    } else {
      slot.visible = false;
    }
  }

  rig.extensionWings.visible = clamped >= 2;
  rig.contactShadow.scale.set(clamped >= 2 ? 2.48 : 1.95, 1.65, 1);
  return true;
}

/**
 * Builds a complete chunky rounded StationVisualRig supporting locked gift crate,
 * multi-machine progression (1..4), Popular Dish golden spotlight ring, transparent showcases,
 * and raycast tap picking.
 */
export function buildStationRig(
  tpl: StationTemplate,
  stationIndex: number,
  mats: MaterialPool,
  geos?: GeometryPool,
  textures?: TextureFactory,
): StationVisualRig {
  const root = new THREE.Group();
  const shadowTex = textures?.createContactShadowDisc() ?? null;

  // 1. Soft contact shadow quad (raycast disabled so it never steals taps)
  const contactShadow = new THREE.Mesh(
    getGeo(geos, 'stn_shadow_quad', () => new THREE.PlaneGeometry(1, 1)),
    mats.contactShadow(shadowTex),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.scale.set(1.95, 1.65, 1);
  contactShadow.position.y = 0.046;
  contactShadow.castShadow = false;
  contactShadow.receiveShadow = false;
  contactShadow.raycast = () => {};
  root.add(contactShadow);

  // 2. Popular Dish golden spotlight ring (raycast disabled so it never steals taps!)
  const popularRing = new THREE.Mesh(
    getGeo(geos, 'stn_pop_ring', () => new THREE.RingGeometry(0.92, 1.14, 28)),
    mats.basicMat('#facc15', 0.92, false),
  );
  popularRing.rotation.x = -Math.PI / 2;
  popularRing.position.y = 0.055;
  popularRing.visible = false;
  popularRing.castShadow = false;
  popularRing.receiveShadow = false;
  popularRing.raycast = () => {};
  root.add(popularRing);

  // 3. Chunky gift-wrapped locked crate w/ ribbon bow
  const lockedCrate = new THREE.Group();
  const oakMat = mats.glossy('#c9935b', 0.48, 0.04);
  const slatMat = mats.std('#8d5b2d', 0.58, 0.04);
  const ribbonMat = mats.glossy(tpl.color || '#facc15', 0.24, 0.16);
  const goldRibbonMat = mats.glossy('#facc15', 0.22, 0.22);

  const crateBox = new THREE.Mesh(
    getGeo(geos, 'crate_box', () => createRoundedBoxGeometry(1.36, 0.98, 1.24, 2, 0.10)),
    oakMat,
  );
  crateBox.position.y = 0.49;
  crateBox.castShadow = true;
  crateBox.receiveShadow = true;
  lockedCrate.add(crateBox);

  // Wooden slat trims
  const slatGeo = getGeo(geos, 'crate_slat', () => createRoundedBoxGeometry(1.40, 0.10, 1.28, 1, 0.025));
  for (const sy of [0.16, 0.82]) {
    const slat = new THREE.Mesh(slatGeo, slatMat);
    slat.position.y = sy;
    lockedCrate.add(slat);
  }

  // Glossy cross ribbons
  const ribX = new THREE.Mesh(
    getGeo(geos, 'crate_rib_x', () => createRoundedBoxGeometry(1.42, 0.22, 1.30, 1, 0.03)),
    ribbonMat,
  );
  ribX.position.y = 0.50;
  const ribZ = new THREE.Mesh(
    getGeo(geos, 'crate_rib_z', () => createRoundedBoxGeometry(0.22, 1.02, 1.30, 1, 0.03)),
    goldRibbonMat,
  );
  ribZ.position.y = 0.51;
  const ribTop = new THREE.Mesh(
    getGeo(geos, 'crate_rib_top', () => createRoundedBoxGeometry(1.40, 0.06, 0.22, 1, 0.02)),
    goldRibbonMat,
  );
  ribTop.position.y = 0.99;
  lockedCrate.add(ribX, ribZ, ribTop);

  // Chunky 4-loop 3D ribbon bow atop crate lid
  const crateBowGroup = new THREE.Group();
  crateBowGroup.position.set(0, 1.04, 0);
  const bowKnot = new THREE.Mesh(
    getGeo(geos, 'crate_bow_knot', () => new THREE.SphereGeometry(0.10, 10, 8)),
    goldRibbonMat,
  );
  crateBowGroup.add(bowKnot);
  const loopGeo = getGeo(geos, 'crate_bow_loop', () => new THREE.TorusGeometry(0.16, 0.052, 8, 14));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const loop = new THREE.Mesh(loopGeo, i % 2 === 0 ? goldRibbonMat : ribbonMat);
    loop.position.set(Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
    loop.rotation.y = -a;
    loop.rotation.x = 0.45;
    crateBowGroup.add(loop);
  }
  lockedCrate.add(crateBowGroup);
  root.add(lockedCrate);

  // 4. Rounded beveled cabinet (unlockedMachine)
  const unlockedMachine = new THREE.Group();
  const cabinet = new THREE.Mesh(
    getGeo(geos, 'stn_cabinet', () => createRoundedBoxGeometry(1.52, 0.84, 1.24, 2, 0.11)),
    mats.glossy('#fffaf2', 0.32, 0.08),
  );
  cabinet.position.y = 0.42;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;

  const counterLip = new THREE.Mesh(
    getGeo(geos, 'stn_lip', () => createRoundedBoxGeometry(1.58, 0.14, 1.30, 2, 0.05)),
    mats.glossy(tpl.color, 0.26, 0.12),
  );
  counterLip.position.y = 0.85;
  counterLip.castShadow = true;
  counterLip.receiveShadow = true;

  // Front drawer seam + cute chrome bar handle
  const drawerPanel = new THREE.Mesh(
    getGeo(geos, 'stn_drawer', () => createRoundedBoxGeometry(1.06, 0.34, 0.04, 1, 0.02)),
    mats.glossy('#f3e8d8', 0.36, 0.05),
  );
  drawerPanel.position.set(0, 0.48, 0.62);
  const drawerHandle = new THREE.Mesh(
    getGeo(geos, 'stn_handle', () => new THREE.CapsuleGeometry(0.025, 0.32, 4, 6)),
    mats.metallic('#e2e8f0', 0.18, 0.82),
  );
  drawerHandle.rotation.z = Math.PI / 2;
  drawerHandle.position.set(0, 0.52, 0.66);

  unlockedMachine.add(cabinet, counterLip, drawerPanel, drawerHandle);

  // Multi-machine extension wings (total width = 2.28, halfX = 1.14, hidden when machines === 1)
  const extensionWings = new THREE.Group();
  const wingBaseGeo = getGeo(geos, 'stn_wing_base', () => createRoundedBoxGeometry(0.38, 0.78, 1.18, 2, 0.08));
  const wingLipGeo = getGeo(geos, 'stn_wing_lip', () => createRoundedBoxGeometry(0.40, 0.14, 1.24, 1, 0.04));
  const wingRailGeo = getGeo(geos, 'stn_wing_rail', () => new THREE.CylinderGeometry(0.022, 0.022, 2.20, 8));
  const wingBaseMat = mats.glossy('#fffaf2', 0.34, 0.06);
  const wingLipMat = mats.glossy(tpl.color, 0.26, 0.12);
  for (const s of [-1, 1]) {
    const wb = new THREE.Mesh(wingBaseGeo, wingBaseMat);
    wb.position.set(s * 0.92, 0.39, 0);
    wb.castShadow = true;
    wb.receiveShadow = true;
    const wl = new THREE.Mesh(wingLipGeo, wingLipMat);
    wl.position.set(s * 0.94, 0.85, 0);
    wl.castShadow = true;
    wl.receiveShadow = true;
    extensionWings.add(wb, wl);
  }
  const brassRail = new THREE.Mesh(wingRailGeo, mats.metallic('#eab308', 0.2, 0.8));
  brassRail.rotation.z = Math.PI / 2;
  brassRail.position.set(0, 0.72, 0.65);
  extensionWings.add(brassRail);
  extensionWings.visible = false;
  unlockedMachine.add(extensionWings);

  // 5. Appliance group holding 1..maxMachines pooled units
  const applianceGroup = new THREE.Group();
  applianceGroup.position.y = 0.92;
  unlockedMachine.add(applianceGroup);

  const maxMachines = Math.max(1, Math.min(4, tpl.maxMachines || 2));
  const unitSlots: THREE.Group[] = [];
  const activeGlowMeshes: THREE.Mesh[] = [];
  const animatedParts: THREE.Object3D[] = [];

  for (let i = 0; i < maxMachines; i++) {
    const built = buildApplianceUnit(tpl, mats, geos);
    built.unit.visible = i === 0;
    applianceGroup.add(built.unit);
    unitSlots.push(built.unit);
    activeGlowMeshes.push(built.glowMesh);
    animatedParts.push(built.animatedPart);
  }

  // Backward-compatible progress ring handles (kept hidden by default so 2D radial pies shine cleanly)
  const progressRing = new THREE.Mesh(
    getGeo(geos, 'stn_prog_ring', () => new THREE.RingGeometry(0.42, 0.56, 20)),
    mats.basicMat('#0f172a', 0.72, false),
  );
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.y = 2.02;
  progressRing.visible = false;
  progressRing.raycast = () => {};

  const progressFill = new THREE.Mesh(
    getGeo(geos, 'stn_prog_fill', () => new THREE.CircleGeometry(0.42, 20)),
    mats.basicMat('#4ade80', 0.9, false),
  );
  progressFill.rotation.x = -Math.PI / 2;
  progressFill.position.y = 2.03;
  progressFill.visible = false;
  progressFill.raycast = () => {};

  unlockedMachine.add(progressRing, progressFill);
  root.add(unlockedMachine);

  // Tag root + all pickable crate/machine descendants with station pick metadata
  root.userData.pickType = 'station';
  root.userData.stationIndex = stationIndex;
  for (const pickBranch of [lockedCrate, unlockedMachine]) {
    pickBranch.traverse((obj) => {
      obj.userData.pickType = 'station';
      obj.userData.stationIndex = stationIndex;
    });
  }

  const rig: StationVisualRig = {
    root,
    lockedCrate,
    crateBowGroup,
    unlockedMachine,
    applianceGroup,
    unitSlots,
    extensionWings,
    activeGlowMesh: activeGlowMeshes[0],
    activeGlowMeshes,
    animatedParts,
    popularRing,
    contactShadow,
    progressRing,
    progressFill,
    modelStyle: tpl.modelStyle,
    maxMachines,
    visibleMachines: 0,
    stationIndex,
    setMachineCount: (count: number) => syncStationMachineLayout(rig, count),
  };

  syncStationMachineLayout(rig, Math.max(1, tpl.initialMachines || 1));
  return rig;
}
