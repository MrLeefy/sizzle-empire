import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GameController } from '@/engine/GameController';
import type {
  GearTemplate,
  RestaurantRuntimeState,
  StationTemplate,
} from '@/types/game';
import { GEAR_BY_ID } from '@/data/gear';
import { PET_SPECIES_BY_ID } from '@/data/pets';
import { getCityByNumber } from '@/data/cities';
import { d } from '@/engine/economy/bigNumber';
import { getStationUnlockCost } from '@/engine/economy/economy';
import {
  GeometryPool,
  MaterialPool,
  TextureFactory,
  applyEquippedGearVisuals,
  buildCharacterRig,
  buildDriveThruCarRig,
  buildEnvironmentRig,
  buildPetRig,
  buildStationRig,
  buildTipCoinStack,
  disposeObjectTree,
  resolveTipVisualZ,
  restyleCustomerRig,
  restyleDriveThruCar,
  setTrayDishVisual,
  syncDynamicTables,
  type CharacterRig,
  type DriveThruCarRig,
  type EnvironmentVisualRig,
  type EquippedGearVisualSet,
  type PetVisualRig,
  type StationVisualRig,
} from './meshFactory';
import {
  advanceWalkPhase,
  computeCarSteeringYaw,
  createCarAnimState,
  createCharacterAnimState,
  createPetAnimState,
  evaluateCrateWiggle,
  evaluateElasticPop,
  expDampFactor,
  hashEntitySeed,
  lerpAngle,
  resolveSmoothFacing,
  smoothCharacterMotion,
  stepBlinkAndExpression,
  writeSquashStretch,
  type CarAnimState,
  type CharacterAnimState,
  type PetAnimState,
} from './animationHelpers';
import { VfxSystem } from './vfxSystem';
import {
  applyPoseToRig,
  createCharacterPoseState,
  customerActivityFor,
  getHatJiggle,
  stepCharacterPose,
  workerActivityFor,
  type CharacterPoseState,
} from './characterAnimator';
import type {
  ProjectedCookingSlot,
  ProjectedOverlayFrame,
  ProjectedStationBadge,
} from './overlayTypes';

export type {
  ProjectedCookingSlot,
  ProjectedOverlayFrame,
  ProjectedStationBadge,
} from './overlayTypes';

const CAMERA_FOV_DEG = 36;
const TAN_HALF_FOV_Y = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEG / 2));
const MIN_CAMERA_ZOOM = 0.7;
const MAX_CAMERA_ZOOM = 1.65;
const CAM_Y_RATIO = 0.88;
const CAM_Z_RATIO = 0.96;
const CAM_DIST_NORM = Math.hypot(CAM_Y_RATIO, CAM_Z_RATIO);

const PEDESTRIAN_POOL_CAP = 24;
const CAR_POOL_CAP = 10;
const TIP_POOL_CAP = 16;

interface CustomerRigHolder {
  rig?: CharacterRig;
  car?: DriveThruCarRig;
  isCar: boolean;
}

/**
 * High-craft Three.js Diorama Renderer for Sizzle Empire (60/30 FPS mobile-optimized):
 * - Startup PMREM RoomEnvironment IBL + 3-point warm diorama lighting + PCFSoft shadows.
 * - Zero React state updates inside requestAnimationFrame; cached viewport dimensions.
 * - GeometryPool + MaterialPool + TextureFactory + object pooling for zero VRAM leaks.
 * - Live 6-slot gear hot-swap & same-runtime rebuild guard (zero flicker on equip/unequip).
 * - Two-finger pinch-to-zoom, smooth damping, micro-punch, expressive animations & pooled 3D VFX.
 */
export class SceneRenderer {
  private container: HTMLElement;
  private controller: GameController;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private geos = new GeometryPool();
  private mats = new MaterialPool();
  private textures = new TextureFactory();
  private vfx: VfxSystem;
  private worldRoot = new THREE.Group();

  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private envMap: THREE.Texture | null = null;
  private hemiLight!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private isDarkVenue = false;
  private lightIntensityScale = 1.0;
  private lastShadowSize = 0;

  private envRig: EnvironmentVisualRig | null = null;
  private stationRigs: StationVisualRig[] = [];
  private workerRigs = new Map<string, CharacterRig>();
  private customerRigs = new Map<string, CustomerRigHolder>();
  private petRigs = new Map<string, PetVisualRig>();
  private tipMeshes = new Map<string, THREE.Group>();

  // Recycle pools warm across despawns & venue rebuilds
  private pedestrianPool: CharacterRig[] = [];
  private carPool: DriveThruCarRig[] = [];
  private tipPool: THREE.Group[] = [];

  // Per-entity animation states & state-diff trackers
  private workerAnims = new Map<string, CharacterAnimState>();
  private customerAnims = new Map<string, CharacterAnimState>();
  private workerPoses = new Map<string, CharacterPoseState>();
  private customerPoses = new Map<string, CharacterPoseState>();
  private carAnims = new Map<string, CarAnimState>();
  private petAnims = new Map<string, PetAnimState>();
  private tipSpawnPop = new Map<string, number>();

  private stationUnlockedPrev: boolean[] = [];
  private stationLevelPrev: number[] = [];
  private stationMachinesPrev: number[] = [];
  private stationUnlockSprings: number[] = [];
  private stationUpgradePulses: number[] = [];
  private stationWorkVfxTimers: number[] = [];
  private stationIdleSteamTimers: number[] = [];
  private passSteamTimers: number[] = [0, 0, 0, 0, 0, 0];
  private seenFeedbackIds = new Set<number>();
  private lastPopularStationIndex: number | null = null;

  // Same-runtime rebuild guard & live 6-slot gear diffing
  private lastRuntimeRef: RestaurantRuntimeState | null = null;
  private lastVenueKey = '';
  private lastEquippedKey = '';
  private hasHighRarityGear = false;
  private playerGearSparkleTimer = 0;

  // Cached crate affordability (avoids calling d(runtime.cash) every frame!)
  private cachedAffordableCashStr = '';
  private cachedAffordableFlags: boolean[] = [];

  // Scratch math objects (zero per-frame allocations)
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private projVec = new THREE.Vector3();
  private scratchScale = new THREE.Vector3(1, 1, 1);

  // Camera framing, pinch-to-zoom, pan & micro-punch state
  private viewportWidth = 1;
  private viewportHeight = 1;
  private cameraPanZ = 0;
  private targetPanZ = 0;
  private minPanZ = -5;
  private maxPanZ = 5;
  private currentZoom = 1.0;
  private targetZoom = 1.0;
  private lastSyncedSettingsZoom = 1.0;
  private cameraDirty = true;
  private cameraPunchAmp = 0;
  private cameraPunchPhase = 0;

  // Multi-pointer pan & pinch-to-zoom state machine
  private activePointers = new Map<number, { x: number; y: number }>();
  private gestureMode: 'none' | 'pan' | 'pinch' = 'none';
  private primaryPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private lastDragY = 0;
  private pinchStartDist = 0;
  private pinchStartZoom = 1.0;
  private gestureMoved = false;
  private suppressTapUntilAllUp = false;
  private wheelZoomSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private animFrameId: number | null = null;
  private lastRenderTimeMs = 0;
  private animClock = 0;
  private disposed = false;

  private onSelectStation: (stationIndex: number) => void;
  private onTapTip: (tipId: string) => void;
  private onOverlayFrame?: (frame: ProjectedOverlayFrame) => void;
  private unsubRebuild: () => void;
  private resizeObserver: ResizeObserver;
  private cleanupInputs: () => void = () => {};

  constructor(params: {
    container: HTMLElement;
    controller: GameController;
    onSelectStation: (stationIndex: number) => void;
    onTapTip: (tipId: string) => void;
    onOverlayFrame?: (frame: ProjectedOverlayFrame) => void;
  }) {
    this.container = params.container;
    this.controller = params.controller;
    this.onSelectStation = params.onSelectStation;
    this.onTapTip = params.onTapTip;
    this.onOverlayFrame = params.onOverlayFrame;

    this.scene = new THREE.Scene();
    this.scene.add(this.worldRoot);

    this.vfx = new VfxSystem(this.controller.save.settings.graphicsQuality);
    this.scene.add(this.vfx.root);

    this.viewportWidth = Math.max(1, this.container.clientWidth);
    this.viewportHeight = Math.max(1, this.container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV_DEG,
      this.viewportWidth / this.viewportHeight,
      0.5,
      170,
    );
    this.camera.position.set(0, 16.5, 13.5);
    this.camera.lookAt(0, 0.25, 0);

    const initialZoom = this.clampZoom(this.controller.save.settings.cameraZoom);
    this.currentZoom = initialZoom;
    this.targetZoom = initialZoom;
    this.lastSyncedSettingsZoom = initialZoom;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.initEnvironmentMap();
    this.setupLighting();
    this.applyQualitySettings();
    this.rebuildWorld();
    this.bindInputEvents();

    this.unsubRebuild = this.controller.subscribeSceneRebuild(() => {
      this.handleSceneRebuildSignal();
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();

    this.startRenderLoop();
  }

  private initEnvironmentMap(): void {
    try {
      const roomEnv = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
      this.envMap = this.envRenderTarget.texture;
      roomEnv.dispose();
      pmrem.dispose();
    } catch {
      this.envRenderTarget = null;
      this.envMap = null;
    }
  }

  private setupLighting(): void {
    // 1. Bright sunny sky + warm honey-peach ground bounce (vibrant Eatventure miniature lighting)
    this.hemiLight = new THREE.HemisphereLight('#fffdf5', '#f7cfa0', 1.15);
    this.scene.add(this.hemiLight);

    // 2. Warm sunlit key light with crisp diagonal PCFSoft shadows + normalBias to prevent bevel acne
    this.dirLight = new THREE.DirectionalLight('#fff2d2', 1.52);
    this.dirLight.position.set(10.5, 21, 13.5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    this.dirLight.shadow.camera.near = 4;
    this.dirLight.shadow.camera.far = 56;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.035;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // 3. Soft pastel back-left rim light giving rounded characters & stations toy-like silhouette pop
    this.rimLight = new THREE.DirectionalLight('#ffe4f2', 0.52);
    this.rimLight.position.set(-11, 13, -12);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight);
  }

  applyQualitySettings(): void {
    if (this.disposed) return;
    const quality = this.controller.save.settings.graphicsQuality;
    const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const maxDpr = quality === 'low' ? 1.0 : quality === 'medium' ? 1.5 : 2.0;
    this.renderer.setPixelRatio(Math.min(rawDpr, maxDpr));

    const shadowsOn = quality !== 'low';
    const targetShadowSize = quality === 'high' ? 2048 : 1024;
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.dirLight.castShadow = shadowsOn;

    // Three.js 0.178 shadow reallocation fix: dispose & null map when resolution changes
    if (shadowsOn && this.lastShadowSize !== targetShadowSize) {
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
      this.dirLight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
      this.dirLight.shadow.needsUpdate = true;
      this.lastShadowSize = targetShadowSize;
    } else if (!shadowsOn && this.dirLight.shadow.map) {
      this.dirLight.shadow.map.dispose();
      this.dirLight.shadow.map = null;
      this.lastShadowSize = 0;
    }

    // Toggle PMREM IBL cleanly on/off by quality
    const scale = this.lightIntensityScale;
    if (quality === 'low' || !this.envMap) {
      this.scene.environment = null;
      this.hemiLight.intensity = (this.isDarkVenue ? 0.96 : 1.10) * scale;
    } else {
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = this.isDarkVenue
        ? quality === 'high'
          ? 0.38
          : 0.30
        : quality === 'high'
          ? 0.52
          : 0.42;
      this.hemiLight.intensity = (this.isDarkVenue ? 0.80 : 0.90) * scale;
    }

    this.dirLight.intensity = (this.isDarkVenue ? 1.12 : 1.32) * scale;
    this.renderer.toneMappingExposure = this.isDarkVenue ? 1.05 : 1.07;
    this.vfx.setQuality(quality);
  }

  private computeVenueKey(runtime: RestaurantRuntimeState): string {
    const template = this.controller.getActiveTemplate();
    const cityNum = this.controller.getActiveCityNumber();
    return `${template.id}|${cityNum}|${runtime.restaurantStageIndex}|${runtime.modeContext}`;
  }

  /**
   * Same-runtime rebuild guard: if `equipGear`/`unequipGear` or in-venue upgrades emit a rebuild
   * signal while the venue & runtime instance haven't changed, refresh in-place (zero world flicker!).
   */
  private handleSceneRebuildSignal(): void {
    if (this.disposed) return;
    const runtime = this.controller.getActiveRuntime();
    const venueKey = this.computeVenueKey(runtime);
    if (runtime === this.lastRuntimeRef && venueKey === this.lastVenueKey && this.envRig) {
      this.refreshInPlace(runtime);
      return;
    }
    this.rebuildWorld();
  }

  private refreshInPlace(runtime: RestaurantRuntimeState): void {
    // 1. Live 6-slot gear hot-swap on player rig
    this.syncPlayerEquippedGear(runtime, true);

    // 2. Immediately sync dynamic tables (e.g., add_table upgrade)
    if (this.envRig) {
      const newlyUnlocked = syncDynamicTables(this.envRig, this.controller.getActiveLayout());
      if (newlyUnlocked.length > 0) {
        for (const tbl of newlyUnlocked) {
          this.vfx.emitPerfectBurst(tbl.center.x, 0.85, tbl.center.z, 8);
        }
        this.triggerCameraPunch(0.08);
      }
    }

    // 3. Immediately sync station machines
    for (let i = 0; i < this.stationRigs.length; i++) {
      const stn = runtime.stations[i];
      if (!stn) continue;
      if (this.stationRigs[i].setMachineCount(stn.machines)) {
        this.stationMachinesPrev[i] = stn.machines;
        this.stationUpgradePulses[i] = 1.0;
        this.vfx.emitConfetti(stn.worldPos.x, 1.35, stn.worldPos.z, 12);
        this.triggerCameraPunch(0.08);
      }
    }
  }

  private recycleActiveEntities(): void {
    for (const holder of this.customerRigs.values()) {
      if (holder.rig) {
        this.releasePedestrianRig(holder.rig);
      }
      if (holder.car) {
        this.releaseCarRig(holder.car);
      }
    }
    this.customerRigs.clear();

    for (const tip of this.tipMeshes.values()) {
      this.releaseTipMesh(tip);
    }
    this.tipMeshes.clear();
  }

  private releasePedestrianRig(rig: CharacterRig): void {
    this.worldRoot.remove(rig.root);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    rig.root.scale.set(1, 1, 1);
    rig.bodyGroup.position.set(0, 0, 0);
    rig.bodyGroup.rotation.set(0, 0, 0);
    rig.bodyGroup.scale.set(1, 1, 1);
    rig.leftLeg.rotation.set(0, 0, 0);
    rig.rightLeg.rotation.set(0, 0, 0);
    rig.leftArm.rotation.set(0, 0, 0);
    rig.rightArm.rotation.set(0, 0, 0);
    rig.headGroup.rotation.set(0, 0, 0);
    rig.hatAnchor.rotation.set(0, 0, 0);
    rig.trayGroup.rotation.set(0, 0, 0);
    rig.trayGroup.position.y = rig.trayBaseY;
    rig.leftEye.scale.y = rig.eyeBaseScaleY;
    rig.rightEye.scale.y = rig.eyeBaseScaleY;
    rig.eyelids.visible = false;
    rig.eyelids.scale.y = 0.01;
    if (this.pedestrianPool.length < PEDESTRIAN_POOL_CAP) {
      this.pedestrianPool.push(rig);
    } else {
      disposeObjectTree(rig.root);
    }
  }

  private releaseCarRig(car: DriveThruCarRig): void {
    this.worldRoot.remove(car.root);
    car.root.position.set(0, 0, 0);
    car.root.rotation.set(0, 0, 0);
    car.root.scale.set(1, 1, 1);
    car.bodyGroup.position.set(0, 0, 0);
    car.bodyGroup.rotation.set(0, 0, 0);
    car.bodyGroup.scale.set(1, 1, 1);
    for (const wheel of car.wheels) {
      wheel.rotation.set(0, 0, 0);
    }
    if (this.carPool.length < CAR_POOL_CAP) {
      this.carPool.push(car);
    } else {
      disposeObjectTree(car.root);
    }
  }

  private releaseTipMesh(tip: THREE.Group): void {
    this.worldRoot.remove(tip);
    tip.position.set(0, 0, 0);
    tip.rotation.set(0, 0, 0);
    tip.scale.set(1, 1, 1);
    if (this.tipPool.length < TIP_POOL_CAP) {
      this.tipPool.push(tip);
    } else {
      disposeObjectTree(tip);
    }
  }

  rebuildWorld(): void {
    if (this.disposed) return;

    // 1. Detach and recycle pooled customers/cars/tips before disposing worldRoot
    this.recycleActiveEntities();

    // 2. Dispose all non-pooled geometries, instanced meshes, and venue-scoped materials/textures
    disposeObjectTree(this.worldRoot, { clearChildren: true });
    this.mats.disposeSceneScoped();
    this.textures.disposeSceneScoped();

    // 3. Clear active maps & diff trackers
    this.envRig = null;
    this.stationRigs = [];
    this.workerRigs.clear();
    this.petRigs.clear();
    this.workerAnims.clear();
    this.customerAnims.clear();
    this.workerPoses.clear();
    this.customerPoses.clear();
    this.carAnims.clear();
    this.petAnims.clear();
    this.tipSpawnPop.clear();
    this.stationUnlockedPrev = [];
    this.stationLevelPrev = [];
    this.stationMachinesPrev = [];
    this.stationUnlockSprings = [];
    this.stationUpgradePulses = [];
    this.stationWorkVfxTimers = [];
    this.stationIdleSteamTimers = [];
    this.passSteamTimers = [0, 0, 0, 0, 0, 0];
    this.seenFeedbackIds.clear();
    this.lastEquippedKey = '';
    this.lastPopularStationIndex = null;
    this.cachedAffordableCashStr = '';
    this.cachedAffordableFlags = [];
    this.vfx.clear();

    const runtime = this.controller.getActiveRuntime();
    const template = this.controller.getActiveTemplate();
    const layout = this.controller.getActiveLayout();
    const { city } = getCityByNumber(this.controller.getActiveCityNumber());

    this.lastRuntimeRef = runtime;
    this.lastVenueKey = this.computeVenueKey(runtime);

    // 4. Build diorama environment & consume single-source-of-truth venue theme!
    this.envRig = buildEnvironmentRig(
      template,
      layout,
      city.groundColor,
      this.mats,
      this.geos,
      this.textures,
      city.skyColor,
    );
    this.worldRoot.add(this.envRig.root);

    const theme = this.envRig.theme;
    this.isDarkVenue = theme.isNightVenue;
    this.lightIntensityScale = theme.lightIntensityScale;
    this.hemiLight.color.set(theme.hemiSky);
    this.hemiLight.groundColor.set(theme.hemiGround);
    this.rimLight.color.set(theme.rimColor);
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.Fog(theme.fogColor, 36, 90);

    // Fit directional shadow frustum tightly to venue floorplan
    const halfW = Math.max(8, layout.width * 0.68 + 2.5);
    const halfD = Math.max(9, layout.depth * 0.68 + 2.5);
    this.dirLight.shadow.camera.left = -halfW;
    this.dirLight.shadow.camera.right = halfW;
    this.dirLight.shadow.camera.top = halfD;
    this.dirLight.shadow.camera.bottom = -halfD;
    this.dirLight.shadow.camera.near = 4;
    this.dirLight.shadow.camera.far = 56;
    this.dirLight.shadow.camera.updateProjectionMatrix();

    this.applyQualitySettings();

    // 5. Build all food station rigs & seed state-diff arrays
    for (let i = 0; i < template.stations.length; i++) {
      const rig = buildStationRig(
        template.stations[i],
        i,
        this.mats,
        this.geos,
        this.textures,
      );
      const pos = layout.stationPositions[i] ?? { x: 0, z: -2 };
      rig.root.position.set(pos.x, 0, pos.z);
      const stn = runtime.stations[i];
      if (stn) {
        rig.setMachineCount(stn.machines);
        rig.lockedCrate.visible = !stn.unlocked;
        rig.unlockedMachine.visible = stn.unlocked;
      }
      this.worldRoot.add(rig.root);
      this.stationRigs.push(rig);

      this.stationUnlockedPrev.push(Boolean(stn?.unlocked));
      this.stationLevelPrev.push(stn?.level ?? 0);
      this.stationMachinesPrev.push(stn?.machines ?? 1);
      this.stationUnlockSprings.push(stn?.unlocked ? 1 : 0);
      this.stationUpgradePulses.push(0);
      this.stationWorkVfxTimers.push(0);
      this.stationIdleSteamTimers.push((i * 0.37) % 1.1);
    }

    // 6. Seed seen feedback IDs so initial load never replays stale bursts
    for (const fb of runtime.floatingFeedback) {
      this.seenFeedbackIds.add(fb.id);
    }

    // 7. Reset portrait pan bounds & camera framing
    this.minPanZ = -Math.max(2.0, layout.depth * 0.25);
    this.maxPanZ = Math.max(2.0, layout.depth * 0.28);
    this.cameraPanZ = 0;
    this.targetPanZ = 0;
    this.cameraPunchAmp = 0;
    this.cameraDirty = true;
    this.updateCameraTransform();
    this.cameraDirty = false;
  }

  private clampZoom(z: number): number {
    if (!Number.isFinite(z) || z <= 0) return 1.0;
    return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, z));
  }

  private handleResize(): void {
    if (this.disposed) return;
    this.viewportWidth = Math.max(1, this.container.clientWidth);
    this.viewportHeight = Math.max(1, this.container.clientHeight);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.cameraDirty = true;
    this.updateCameraTransform();
    this.cameraDirty = false;
  }

  private updateCameraTransform(): void {
    const layout = this.controller.getActiveLayout();
    const aspect = Math.max(0.35, this.camera.aspect || 0.56);
    const zoom = this.clampZoom(this.currentZoom);

    // Tight, lush portrait diorama framing for 36° FOV (shows back wall, awning, faces & foreground street)
    const desiredWidth = Math.max(10.8, layout.width + 1.4);
    const tanHalfH = TAN_HALF_FOV_Y * aspect;
    const distForWidth = (desiredWidth * 0.5) / tanHalfH;
    const distForDepth = (Math.max(10.0, layout.depth * 0.68) * 0.5) / TAN_HALF_FOV_Y;
    const idealEuclideanDist = Math.max(distForWidth, distForDepth) / zoom;
    const baseDist = idealEuclideanDist / CAM_DIST_NORM;

    // Transient micro-punch offset (never mutates cameraPanZ or targetPanZ!)
    const punchWave =
      this.cameraPunchAmp > 0.0005
        ? Math.sin(this.cameraPunchPhase) * this.cameraPunchAmp
        : 0;

    this.camera.position.set(
      0,
      baseDist * CAM_Y_RATIO - punchWave * 0.55,
      baseDist * CAM_Z_RATIO + this.cameraPanZ - punchWave * 0.85,
    );
    this.camera.lookAt(0, 0.42, this.cameraPanZ - 0.12);

    // Scale fog dynamically with camera distance so Grand Hall on 390px portrait NEVER fogs out!
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = Math.max(30, idealEuclideanDist * 1.25);
      this.scene.fog.far = Math.max(72, idealEuclideanDist * 2.45);
    }
  }

  private triggerCameraPunch(strength = 0.09): void {
    this.cameraPunchAmp = Math.min(0.18, Math.max(this.cameraPunchAmp, strength));
    this.cameraPunchPhase = 0;
    this.cameraDirty = true;
  }

  private commitZoomSettingOnce(): void {
    const rounded = Math.round(this.clampZoom(this.targetZoom) * 100) / 100;
    this.lastSyncedSettingsZoom = rounded;
    this.controller.updateSettings({ cameraZoom: rounded });
  }

  private bindInputEvents(): void {
    const dom = this.renderer.domElement;

    const getFirstTwoPointers = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      const iter = this.activePointers.values();
      const p1 = iter.next().value;
      const p2 = iter.next().value;
      if (!p1 || !p2) return null;
      return [p1, p2];
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      try {
        dom.setPointerCapture?.(ev.pointerId);
      } catch {
        // Ignore capture errors on synthetic pointers
      }
      this.activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (this.activePointers.size === 1) {
        this.gestureMode = 'pan';
        this.primaryPointerId = ev.pointerId;
        this.dragStartX = ev.clientX;
        this.dragStartY = ev.clientY;
        this.lastDragY = ev.clientY;
        this.gestureMoved = false;
        this.suppressTapUntilAllUp = false;
      } else if (this.activePointers.size === 2) {
        const pair = getFirstTwoPointers();
        if (pair) {
          this.gestureMode = 'pinch';
          this.suppressTapUntilAllUp = true;
          this.pinchStartDist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
          this.pinchStartZoom = this.targetZoom;
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!this.activePointers.has(ev.pointerId)) return;
      this.activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (this.gestureMode === 'pinch' && this.activePointers.size >= 2) {
        const pair = getFirstTwoPointers();
        if (pair) {
          const curDist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
          const denom = Math.max(12, this.pinchStartDist);
          const ratio = Math.max(0.01, 1 + (curDist - this.pinchStartDist) / denom);
          this.targetZoom = Math.max(
            MIN_CAMERA_ZOOM,
            Math.min(MAX_CAMERA_ZOOM, this.pinchStartZoom * ratio),
          );
          this.cameraDirty = true;
        }
      } else if (this.gestureMode === 'pan' && ev.pointerId === this.primaryPointerId) {
        if (
          !this.gestureMoved &&
          Math.hypot(ev.clientX - this.dragStartX, ev.clientY - this.dragStartY) > 10
        ) {
          this.gestureMoved = true;
        }
        if (this.gestureMoved) {
          const dy = ev.clientY - this.lastDragY;
          this.lastDragY = ev.clientY;
          const panScale = 0.024 / Math.max(0.5, this.currentZoom);
          this.targetPanZ = Math.max(
            this.minPanZ,
            Math.min(this.maxPanZ, this.targetPanZ - dy * panScale),
          );
          this.cameraDirty = true;
        }
      }
    };

    const onPointerEnd = (ev: PointerEvent) => {
      if (!this.activePointers.has(ev.pointerId)) return;
      this.activePointers.delete(ev.pointerId);
      try {
        if (dom.hasPointerCapture?.(ev.pointerId)) {
          dom.releasePointerCapture(ev.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      if (this.gestureMode === 'pinch') {
        if (this.activePointers.size < 2) {
          this.commitZoomSettingOnce();
          if (this.activePointers.size === 1) {
            const nextEntry = this.activePointers.entries().next().value;
            if (nextEntry) {
              this.primaryPointerId = nextEntry[0];
              this.lastDragY = nextEntry[1].y;
              this.gestureMode = 'pan';
              this.gestureMoved = true;
            }
          } else {
            this.gestureMode = 'none';
            this.primaryPointerId = null;
            this.suppressTapUntilAllUp = false;
          }
        } else {
          // Re-anchor pinch baseline to remaining finger pair (e.g., 3rd-finger handoff)
          const pair = getFirstTwoPointers();
          if (pair) {
            this.pinchStartDist = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
            this.pinchStartZoom = this.targetZoom;
          }
        }
      } else if (this.gestureMode === 'pan') {
        if (
          ev.type === 'pointerup' &&
          !this.gestureMoved &&
          !this.suppressTapUntilAllUp &&
          ev.pointerId === this.primaryPointerId
        ) {
          this.handleTapPick(ev.clientX, ev.clientY);
        }
        if (this.activePointers.size === 0) {
          this.gestureMode = 'none';
          this.primaryPointerId = null;
          this.suppressTapUntilAllUp = false;
        }
      }
    };

    const onWindowBlur = () => {
      if (this.gestureMode === 'pinch') {
        this.commitZoomSettingOnce();
      }
      this.activePointers.clear();
      this.gestureMode = 'none';
      this.primaryPointerId = null;
      this.suppressTapUntilAllUp = false;
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      if (!Number.isFinite(ev.deltaY)) return;
      if (ev.ctrlKey || ev.metaKey) {
        const expArg = Math.max(-10, Math.min(10, -ev.deltaY * 0.0025));
        this.targetZoom = Math.max(
          MIN_CAMERA_ZOOM,
          Math.min(MAX_CAMERA_ZOOM, this.targetZoom * Math.exp(expArg)),
        );
        this.cameraDirty = true;
        if (this.wheelZoomSaveTimer !== null) {
          clearTimeout(this.wheelZoomSaveTimer);
        }
        this.wheelZoomSaveTimer = setTimeout(() => {
          this.wheelZoomSaveTimer = null;
          if (!this.disposed) this.commitZoomSettingOnce();
        }, 250);
      } else {
        this.targetPanZ = Math.max(
          this.minPanZ,
          Math.min(this.maxPanZ, this.targetPanZ + ev.deltaY * 0.008),
        );
        this.cameraDirty = true;
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', onWindowBlur);
    dom.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupInputs = () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      window.removeEventListener('blur', onWindowBlur);
      dom.removeEventListener('wheel', onWheel);
      if (this.wheelZoomSaveTimer !== null) {
        clearTimeout(this.wheelZoomSaveTimer);
        this.wheelZoomSaveTimer = null;
      }
    };
  }

  private handleTapPick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // 1. Check tips first (easy rewarding tap!)
    const tipObjs = Array.from(this.tipMeshes.values());
    if (tipObjs.length > 0) {
      const tipHits = this.raycaster.intersectObjects(tipObjs, true);
      if (tipHits.length > 0) {
        const tipId = tipHits[0].object.userData.tipId as string | undefined;
        if (tipId) {
          this.onTapTip(tipId);
          return;
        }
      }
    }

    // 2. Check food stations
    const stnObjs = this.stationRigs.map((s) => s.root);
    const hits = this.raycaster.intersectObjects(stnObjs, true);
    if (hits.length > 0) {
      const idx = hits[0].object.userData.stationIndex as number | undefined;
      if (idx !== undefined) {
        this.onSelectStation(idx);
      }
    }
  }

  private computeEquippedVisualKey(runtime: RestaurantRuntimeState): string {
    if (runtime.ignoreGear) return 'IGNORED';
    const eq = this.controller.save.equipped;
    return `${eq.head ?? ''}|${eq.body ?? ''}|${eq.hand1 ?? ''}|${eq.hand2 ?? ''}|${eq.ring ?? ''}|${eq.necklace ?? ''}`;
  }

  private getEquippedTemplates(runtime: RestaurantRuntimeState): EquippedGearVisualSet {
    if (runtime.ignoreGear) return {};
    const save = this.controller.save;
    const lookup = (instId: string | null): GearTemplate | undefined => {
      if (!instId) return undefined;
      const inst = save.inventory.find((i) => i.instanceId === instId);
      return inst ? GEAR_BY_ID[inst.templateId] : undefined;
    };
    return {
      head: lookup(save.equipped.head),
      body: lookup(save.equipped.body),
      hand1: lookup(save.equipped.hand1),
      hand2: lookup(save.equipped.hand2),
      ring: lookup(save.equipped.ring),
      necklace: lookup(save.equipped.necklace),
    };
  }

  private syncPlayerEquippedGear(
    runtime: RestaurantRuntimeState,
    playCelebrateFx: boolean,
  ): void {
    const eqKey = this.computeEquippedVisualKey(runtime);
    if (eqKey === this.lastEquippedKey) return;

    const player = runtime.workers.find((w) => w.role === 'player');
    if (!player) return;
    const playerRig = this.workerRigs.get(player.id);
    if (!playerRig) return;

    const templates = this.getEquippedTemplates(runtime);
    applyEquippedGearVisuals(playerRig, templates, this.mats, this.geos);

    const equippedList = Object.values(templates).filter(Boolean) as GearTemplate[];
    this.hasHighRarityGear = equippedList.some(
      (g) => g.rarity === 'legendary' || g.rarity === 'ultimate' || g.rarity === 'mythic',
    );
    const hasMythic = equippedList.some((g) => g.rarity === 'mythic');

    if (playCelebrateFx && this.lastEquippedKey !== '') {
      const anim = this.workerAnims.get(player.id);
      if (anim) {
        anim.hopPulse = 0.72;
        anim.happyTimer = 0.9;
      }
      if (hasMythic) {
        this.vfx.emitDivineBurst(player.pos.x, 1.35, player.pos.z, 12);
      } else {
        this.vfx.emitPerfectBurst(player.pos.x, 1.35, player.pos.z, 9);
      }
    }

    this.lastEquippedKey = eqKey;
  }

  private refreshAffordableCrateCache(runtime: RestaurantRuntimeState): void {
    const unlockedSig = runtime.stations.map((s) => (s.unlocked ? '1' : '0')).join('');
    const cacheKey = `${runtime.cash}|${unlockedSig}`;
    if (cacheKey === this.cachedAffordableCashStr) return;

    this.cachedAffordableCashStr = cacheKey;
    const template = this.controller.getActiveTemplate();
    const cityNum = this.controller.getActiveCityNumber();
    const cash = d(runtime.cash);

    this.cachedAffordableFlags = runtime.stations.map((stn, idx) => {
      if (stn.unlocked) return false;
      const stnTpl = template.stations[idx];
      if (!stnTpl) return false;
      const cost = getStationUnlockCost(stnTpl, cityNum, runtime.difficultyMultiplier);
      return cash.gte(cost);
    });
  }

  private resolveStationTemplateForOrder(
    runtime: RestaurantRuntimeState,
    orderId: string | null,
    fallbackColor: string,
  ): StationTemplate | null {
    const template = this.controller.getActiveTemplate();
    if (orderId) {
      const ord = runtime.orders.find((o) => o.id === orderId);
      if (ord && template.stations[ord.stationIndex]) {
        return template.stations[ord.stationIndex];
      }
    }
    const byColor = template.stations.find((s) => s.color === fallbackColor);
    return byColor ?? template.stations[0] ?? null;
  }

  private startRenderLoop(): void {
    const frame = (nowMs: number) => {
      if (this.disposed) return;
      this.animFrameId = requestAnimationFrame(frame);

      const targetFps = this.controller.save.settings.targetFps;
      const minInterval = targetFps === 30 ? 31.5 : 0;
      if (minInterval > 0 && nowMs - this.lastRenderTimeMs < minInterval) {
        return;
      }

      const dt = Math.min(0.1, Math.max(0, (nowMs - (this.lastRenderTimeMs || nowMs)) / 1000));
      this.lastRenderTimeMs = nowMs;
      this.animClock += dt;

      this.syncSceneFromSimulation(dt);
      this.vfx.update(dt);
      this.stepCamera(dt);

      this.renderer.render(this.scene, this.camera);

      if (this.onOverlayFrame) {
        this.onOverlayFrame(this.computeProjectedOverlays());
      }
    };
    this.animFrameId = requestAnimationFrame(frame);
  }

  private stepCamera(dt: number): void {
    if (this.gestureMode !== 'pinch') {
      const settingsZoom = this.clampZoom(this.controller.save.settings.cameraZoom);
      if (Math.abs(settingsZoom - this.lastSyncedSettingsZoom) > 0.0005) {
        this.targetZoom = settingsZoom;
        this.lastSyncedSettingsZoom = settingsZoom;
        this.cameraDirty = true;
      }
    }

    const dampT = expDampFactor(12, dt);

    if (Math.abs(this.targetPanZ - this.cameraPanZ) > 0.0005) {
      this.cameraPanZ += (this.targetPanZ - this.cameraPanZ) * dampT;
      this.cameraDirty = true;
    } else if (this.cameraPanZ !== this.targetPanZ) {
      this.cameraPanZ = this.targetPanZ;
      this.cameraDirty = true;
    }

    if (Math.abs(this.targetZoom - this.currentZoom) > 0.0005) {
      this.currentZoom += (this.targetZoom - this.currentZoom) * dampT;
      this.cameraDirty = true;
    } else if (this.currentZoom !== this.targetZoom) {
      this.currentZoom = this.targetZoom;
      this.cameraDirty = true;
    }

    if (this.cameraPunchAmp > 0.0005) {
      this.cameraPunchPhase += dt * 24;
      this.cameraPunchAmp *= Math.exp(-11 * dt);
      if (this.cameraPunchAmp <= 0.0005) {
        this.cameraPunchAmp = 0;
      }
      this.cameraDirty = true;
    }

    if (this.cameraDirty) {
      this.updateCameraTransform();
      this.cameraDirty = false;
    }
  }

  private syncSceneFromSimulation(dt: number): void {
    const runtime = this.controller.getActiveRuntime();
    const template = this.controller.getActiveTemplate();
    const layout = this.controller.getActiveLayout();
    const alpha = this.controller.getRenderAlpha();
    const quality = this.controller.save.settings.graphicsQuality;
    const shadowTex = this.textures.createContactShadowDisc();
    const dampFast = expDampFactor(14, dt);

    // 0A. Trigger 3D VFX from newly spawned floatingFeedback events
    const activeFbIds = new Set<number>();
    for (const fb of runtime.floatingFeedback) {
      activeFbIds.add(fb.id);
      if (!this.seenFeedbackIds.has(fb.id)) {
        this.seenFeedbackIds.add(fb.id);
        const fx = fb.worldPos.x;
        const fy = Math.max(0.85, fb.heightOffset);
        const fz = fb.worldPos.z;
        if (fb.kind === 'divine') {
          this.vfx.emitDivineBurst(fx, fy, fz, 16);
          this.vfx.emitCoinBurst(fx, fy, fz, 6);
        } else if (fb.kind === 'perfect') {
          this.vfx.emitPerfectBurst(fx, fy, fz, 12);
          this.vfx.emitCoinBurst(fx, fy, fz, 5);
        } else if (fb.kind === 'golden') {
          this.vfx.emitPerfectBurst(fx, fy, fz, 10);
          this.vfx.emitCoinBurst(fx, fy, fz, 8);
        } else if (fb.kind === 'cash') {
          this.vfx.emitCoinBurst(fx, fy, fz, 4);
        } else if (fb.kind === 'tip') {
          this.vfx.emitCoinBurst(fx, fy, fz, 7);
        } else if (fb.kind === 'gem') {
          this.vfx.emitConfetti(fx, fy, fz, 18);
          this.vfx.emitPerfectBurst(fx, fy, fz, 10);
          this.triggerCameraPunch(0.09);
        } else if (fb.kind === 'milestone') {
          this.vfx.emitConfetti(fx, fy, fz, 22);
          this.triggerCameraPunch(0.11);
        }
      }
    }
    // Prune expired IDs to keep seenFeedbackIds small
    if (this.seenFeedbackIds.size > 96) {
      for (const id of this.seenFeedbackIds) {
        if (!activeFbIds.has(id)) this.seenFeedbackIds.delete(id);
      }
    }

    // 0B. Dynamic dining table pop-ins & environment animated props
    if (this.envRig) {
      const newlyUnlocked = syncDynamicTables(this.envRig, layout);
      for (const tbl of newlyUnlocked) {
        this.vfx.emitPerfectBurst(tbl.center.x, 0.85, tbl.center.z, 8);
        this.triggerCameraPunch(0.08);
      }
      for (const tbl of this.envRig.tables) {
        if (tbl.unlocked && tbl.popProgress < 1) {
          tbl.popProgress = Math.min(1, tbl.popProgress + dt * 2.8);
          const sc = evaluateElasticPop(tbl.popProgress);
          tbl.group.scale.set(sc, sc, sc);
        } else if (tbl.unlocked && tbl.group.scale.x !== 1) {
          tbl.group.scale.set(1, 1, 1);
        }
      }

      for (const prop of this.envRig.animatedProps) {
        if (prop.kind === 'flame') {
          const fl = 0.88 + Math.sin(this.animClock * 16 + prop.phase) * 0.16;
          prop.object.scale.set(1, fl, 1);
        } else if (prop.kind === 'crystal') {
          const cy = 1 + Math.sin(this.animClock * 2.6 + prop.phase) * 0.04;
          prop.object.scale.set(1, cy, 1);
        } else if (prop.kind === 'beacon') {
          prop.object.rotation.y += dt * 1.4;
        } else if (prop.kind === 'cloud' || prop.kind === 'orb') {
          prop.object.position.y =
            prop.baseY + Math.sin(this.animClock * 1.8 + prop.phase) * 0.18;
        }
      }

      // Sync 3D waiting food dishes on pass counter (order.status === 'ready_at_pass')
      if (this.envRig.passDishSlots.length > 0) {
        const readyOrders = runtime.orders.filter((o) => o.status === 'ready_at_pass');
        for (let i = 0; i < this.envRig.passDishSlots.length; i++) {
          const slot = this.envRig.passDishSlots[i];
          const ord = readyOrders[i];
          if (ord) {
            const stnTpl = template.stations[ord.stationIndex] ?? template.stations[0];
            slot.anchor.visible = true;
            slot.occupiedOrderId = ord.id;
            if (stnTpl) {
              slot.currentDishKey = setTrayDishVisual(
                slot.dishGroup,
                slot.plateMesh,
                stnTpl.modelStyle,
                stnTpl.color,
                stnTpl.accentColor,
                slot.currentDishKey,
                this.mats,
                this.geos,
              );
              slot.plateMesh.visible = true;
            }
            slot.haloMesh.visible = ord.quality !== 'normal';
            if (ord.quality === 'divine') {
              slot.haloMesh.material = this.mats.basicMat('#c084fc', 0.92, false);
            } else if (ord.quality === 'perfect') {
              slot.haloMesh.material = this.mats.basicMat('#facc15', 0.92, false);
            }
            this.passSteamTimers[i] = (this.passSteamTimers[i] ?? 0) + dt;
            if (this.passSteamTimers[i] >= 0.85) {
              this.passSteamTimers[i] = 0;
              this.vfx.emitSteam(slot.anchor.position.x, slot.anchor.position.y + 0.25, slot.anchor.position.z);
            }
          } else {
            slot.anchor.visible = false;
            slot.occupiedOrderId = null;
          }
        }
      }
    }

    // 1. Pre-group cooking workers by station in O(W)
    const cookingCountByStation = new Int32Array(this.stationRigs.length);
    for (const w of runtime.workers) {
      if (
        w.status === 'cooking' &&
        w.activeStationIndex !== null &&
        w.activeStationIndex >= 0 &&
        w.activeStationIndex < cookingCountByStation.length
      ) {
        cookingCountByStation[w.activeStationIndex]++;
      }
    }

    // Refresh cached crate affordability once per cash/unlock string change
    this.refreshAffordableCrateCache(runtime);

    // Popular dish spotlight transition burst
    const activePopularIdx =
      runtime.popularDishStationIndex !== null &&
      runtime.simTime < runtime.popularDishEndsAt
        ? runtime.popularDishStationIndex
        : null;
    if (activePopularIdx !== null && activePopularIdx !== this.lastPopularStationIndex) {
      const popStn = runtime.stations[activePopularIdx];
      if (popStn) {
        this.vfx.emitPerfectBurst(popStn.worldPos.x, 1.35, popStn.worldPos.z, 10);
      }
    }
    this.lastPopularStationIndex = activePopularIdx;

    const workVfxInterval = quality === 'high' ? 0.16 : quality === 'medium' ? 0.24 : 0.38;

    // 2. Sync Stations (unlock pop-in, crate wiggle, upgrade squash-stretch, multi-machine, cook jiggle, work VFX)
    for (let i = 0; i < this.stationRigs.length; i++) {
      const rig = this.stationRigs[i];
      const stn = runtime.stations[i];
      const stnTpl = template.stations[i];
      if (!stn || !stnTpl) continue;

      // Detect unlock false -> true
      if (stn.unlocked && !this.stationUnlockedPrev[i]) {
        this.stationUnlockedPrev[i] = true;
        this.stationUnlockSprings[i] = 0.001;
        this.stationUpgradePulses[i] = 1.0;
        this.vfx.emitCrateSmash(stn.worldPos.x, 0.55, stn.worldPos.z);
        this.vfx.emitConfetti(stn.worldPos.x, 1.3, stn.worldPos.z, 20);
        this.triggerCameraPunch(0.12);
      }
      // Detect level upgrade
      if (stn.level > this.stationLevelPrev[i]) {
        this.stationLevelPrev[i] = stn.level;
        this.stationUpgradePulses[i] = 1.0;
        this.vfx.emitPerfectBurst(stn.worldPos.x, 1.35, stn.worldPos.z, 5);
      }
      // Detect machine count increase
      if (stn.machines !== this.stationMachinesPrev[i]) {
        this.stationMachinesPrev[i] = stn.machines;
        rig.setMachineCount(stn.machines);
        this.stationUpgradePulses[i] = 1.0;
        this.vfx.emitConfetti(stn.worldPos.x, 1.35, stn.worldPos.z, 12);
        this.triggerCameraPunch(0.08);
      }

      rig.lockedCrate.visible = !stn.unlocked;
      rig.unlockedMachine.visible = stn.unlocked;
      rig.progressRing.visible = false;
      rig.progressFill.visible = false;

      // Popular dish golden spotlight ring
      const isPop = activePopularIdx === i;
      rig.popularRing.visible = isPop;
      if (isPop) {
        const ringScale = 1 + Math.sin(this.animClock * 5) * 0.06;
        rig.popularRing.scale.set(ringScale, ringScale, 1);
      }

      if (!stn.unlocked) {
        // Affordable gift-box crate wiggle!
        if (this.cachedAffordableFlags[i]) {
          const wig = evaluateCrateWiggle(this.animClock, i * 1.13);
          rig.lockedCrate.rotation.z = wig.rotZ;
          rig.lockedCrate.position.y = wig.hopY;
          rig.crateBowGroup.scale.setScalar(wig.bowScale);
        } else {
          rig.lockedCrate.rotation.z = 0;
          rig.lockedCrate.position.y = 0;
          rig.crateBowGroup.scale.setScalar(1);
        }
        continue;
      }

      // Elastic pop-in + upgrade squash-and-stretch + cooking jiggle
      if (this.stationUnlockSprings[i] < 1) {
        this.stationUnlockSprings[i] = Math.min(1, this.stationUnlockSprings[i] + dt * 2.6);
      }
      if (this.stationUpgradePulses[i] > 0) {
        this.stationUpgradePulses[i] = Math.max(0, this.stationUpgradePulses[i] - dt * 2.4);
      }

      const popSc = evaluateElasticPop(this.stationUnlockSprings[i]);
      writeSquashStretch(this.scratchScale, this.stationUpgradePulses[i], 0.18);

      const isCooking = cookingCountByStation[i] > 0;
      const cookJiggleY = isCooking ? Math.sin(this.animClock * 20 + i) * 0.032 : 0;
      const cookRotZ = isCooking ? Math.sin(this.animClock * 14 + i) * 0.018 : 0;

      rig.unlockedMachine.scale.set(
        popSc * this.scratchScale.x,
        popSc * this.scratchScale.y * (1 + cookJiggleY),
        popSc * this.scratchScale.z,
      );
      rig.unlockedMachine.rotation.z = cookRotZ;

      // Per-style appliance sub-part animation & work VFX
      for (let u = 0; u < rig.visibleMachines; u++) {
        const glow = rig.activeGlowMeshes[u];
        const part = rig.animatedParts[u];
        if (glow) {
          const gPulse = isCooking ? 1 + Math.sin(this.animClock * 16 + u) * 0.08 : 1;
          glow.scale.setScalar(gPulse);
        }
        if (part) {
          if (rig.modelStyle === 'dessert') {
            part.rotation.y += dt * (isCooking ? 4.2 : 1.1);
          } else if (rig.modelStyle === 'blender') {
            if (isCooking) part.rotation.y += dt * 15;
          } else if (rig.modelStyle === 'cauldron') {
            part.rotation.y += dt * (isCooking ? 4.5 : 1.2);
          } else if (rig.modelStyle === 'juicer') {
            part.position.y = isCooking
              ? 0.96 - Math.abs(Math.sin(this.animClock * 14 + u)) * 0.10
              : 0.96;
          } else if (rig.modelStyle === 'fryer') {
            part.position.y = isCooking
              ? 0.28 + Math.sin(this.animClock * 15 + u) * 0.05
              : 0.28;
          } else if (rig.modelStyle === 'wok') {
            part.rotation.z = isCooking ? Math.sin(this.animClock * 18 + u) * 0.14 : 0;
            part.position.y = isCooking
              ? 0.34 + Math.abs(Math.sin(this.animClock * 18 + u)) * 0.06
              : 0.34;
          } else if (rig.modelStyle === 'grill') {
            part.position.y = isCooking
              ? 0.22 + Math.abs(Math.sin(this.animClock * 20 + u)) * 0.03
              : 0.22;
          } else if (rig.modelStyle === 'espresso') {
            part.position.x = isCooking ? Math.sin(this.animClock * 38 + u) * 0.012 : 0;
          }
        }
      }

      if (isCooking) {
        this.stationWorkVfxTimers[i] += dt;
        if (this.stationWorkVfxTimers[i] >= workVfxInterval) {
          this.stationWorkVfxTimers[i] = 0;
          this.vfx.emitStationWorkFx(
            stn.worldPos.x,
            1.42,
            stn.worldPos.z,
            stnTpl.modelStyle,
            stnTpl.color,
          );
        }
      } else if (
        stnTpl.modelStyle === 'oven' ||
        stnTpl.modelStyle === 'cauldron' ||
        stnTpl.modelStyle === 'espresso' ||
        stnTpl.modelStyle === 'wok'
      ) {
        this.stationIdleSteamTimers[i] += dt;
        if (this.stationIdleSteamTimers[i] >= 1.1) {
          this.stationIdleSteamTimers[i] = 0;
          this.vfx.emitSteam(stn.worldPos.x, 1.52, stn.worldPos.z);
        }
      }
    }

    // 3. Sync Workers (expressive walk/cook/take_order/idle, 3D dish trays, live 6-slot gear)
    const activeWorkerIds = new Set<string>();
    const isInitialWorkerSync = this.workerRigs.size === 0;
    for (const w of runtime.workers) {
      activeWorkerIds.add(w.id);
      let ix = w.prevPos.x + (w.pos.x - w.prevPos.x) * alpha;
      let iz = w.prevPos.z + (w.pos.z - w.prevPos.z) * alpha;

      let rig = this.workerRigs.get(w.id);
      let anim = this.workerAnims.get(w.id);
      if (!rig) {
        const seed = Math.round(hashEntitySeed(w.id) * 1000);
        rig = buildCharacterRig(
          w.shirtColor,
          w.role === 'player' ? '#78350f' : '#334155',
          w.role !== 'waiter' && w.role !== 'cashier',
          this.mats,
          { role: w.role, seed, geos: this.geos, shadowTex },
        );
        this.worldRoot.add(rig.root);
        this.workerRigs.set(w.id, rig);
        anim = createCharacterAnimState(
          w.id,
          w.facing,
          ix,
          iz,
          isInitialWorkerSync,
        );
        this.workerAnims.set(w.id, anim);

        if (!isInitialWorkerSync) {
          this.vfx.emitConfetti(ix, 1.1, iz, 14);
        }
      }
      if (!anim) {
        anim = createCharacterAnimState(w.id, w.facing, ix, iz, true);
        this.workerAnims.set(w.id, anim);
      }

      // Smooth the sim's corner-y waypoint motion into eased arcs, then derive speed & facing
      smoothCharacterMotion(anim, ix, iz, dt);
      ix = anim.smoothX;
      iz = anim.smoothZ;
      const dx = ix - anim.prevRenderX;
      const dz = iz - anim.prevRenderZ;
      const smoothSpeed = Math.hypot(anim.smoothVX, anim.smoothVZ);
      anim.lastSpeed += (smoothSpeed - anim.lastSpeed) * expDampFactor(8, dt);
      anim.prevRenderX = ix;
      anim.prevRenderZ = iz;

      let targetFacing = w.facing;
      if (w.status === 'cooking' && w.activeStationIndex !== null) {
        // Face the machine squarely while cooking (sim facing is the last walk direction = sideways)
        const cookStn = runtime.stations[w.activeStationIndex];
        if (cookStn) {
          const fx = cookStn.worldPos.x - w.pos.x;
          const fz = cookStn.worldPos.z - w.pos.z;
          // Snap to the machine's front/back axis so chefs never stand side-on to it
          targetFacing = Math.abs(fz) > 0.05 ? (fz < 0 ? Math.PI : 0) : Math.atan2(fx, fz);
        }
      } else if (w.status === 'idle') {
        targetFacing = 0; // idle staff turn to face the player/camera
      }
      if (w.status === 'taking_order' && w.activeCustomerId) {
        const targetCust = runtime.customers.find((c) => c.id === w.activeCustomerId);
        if (targetCust) {
          targetFacing = Math.atan2(targetCust.pos.x - ix, targetCust.pos.z - iz);
        }
      }
      if (w.status === 'taking_order') {
        anim.facing = lerpAngle(anim.facing, targetFacing, expDampFactor(9, dt));
      } else {
        resolveSmoothFacing(anim, targetFacing, dt);
      }

      rig.root.position.set(ix, 0, iz);
      rig.root.rotation.y = anim.facing;

      // Pop-in elastic scale
      if (anim.spawnProgress < 1) {
        anim.spawnProgress = Math.min(1, anim.spawnProgress + dt * 3.0);
        rig.root.scale.setScalar(evaluateElasticPop(anim.spawnProgress));
      } else if (rig.root.scale.x !== 1) {
        rig.root.scale.set(1, 1, 1);
      }

      // Blinking & happy expression
      const expr = stepBlinkAndExpression(anim, dt);
      rig.leftEye.scale.y = rig.eyeBaseScaleY * expr.eyeScaleY;
      rig.rightEye.scale.y = rig.eyeBaseScaleY * expr.eyeScaleY;
      rig.eyelids.visible = expr.eyelidScaleY > 0.06;
      rig.eyelids.scale.y = expr.eyelidScaleY;

      if (anim.hopPulse > 0) {
        anim.hopPulse = Math.max(0, anim.hopPulse - dt * 2.6);
      }

      // Pose-blended procedural animation (walk / carry / cook / take order / idle)
      const workerActivity = workerActivityFor(w.status);
      let pose = this.workerPoses.get(w.id);
      if (!pose) {
        pose = createCharacterPoseState(anim.phaseSeed, workerActivity, anim.facing);
        this.workerPoses.set(w.id, pose);
      }
      const workerPose = stepCharacterPose(
        pose,
        {
          activity: workerActivity,
          dt,
          clock: this.animClock,
          speed: anim.lastSpeed,
          carrying: w.carryingDish,
          impatience: 0,
          hopPulse: anim.hopPulse,
          isHappy: expr.isHappy,
        },
        anim.facing,
      );
      applyPoseToRig(rig, workerPose, getHatJiggle(pose));

      if (workerActivity === 'walk') {
        // Speed dust puffs behind fast walkers!
        anim.dustCooldown = Math.max(0, anim.dustCooldown - dt);
        if (anim.lastSpeed > 2.4 && anim.dustCooldown <= 0) {
          anim.dustCooldown = 0.22;
          this.vfx.emitSpeedDust(ix, 0.12, iz, dx, dz);
        }
      }

      // Carrying 3D food dish on tray + Perfect/Divine trail VFX
      rig.trayGroup.visible = w.carryingDish;
      if (w.carryingDish) {
        const dishTpl = this.resolveStationTemplateForOrder(
          runtime,
          w.activeOrderId,
          w.carryingDishColor,
        );
        if (dishTpl) {
          rig.currentDishKey = setTrayDishVisual(
            rig.dishAnchor,
            rig.dishMesh,
            dishTpl.modelStyle,
            w.carryingDishColor || dishTpl.color,
            dishTpl.accentColor,
            rig.currentDishKey,
            this.mats,
            this.geos,
          );
        }
        rig.qualityHalo.visible = w.carryingQuality !== 'normal';
        if (w.carryingQuality === 'divine') {
          rig.qualityHalo.material = this.mats.basicMat('#c084fc', 0.95, false);
        } else if (w.carryingQuality === 'perfect') {
          rig.qualityHalo.material = this.mats.basicMat('#facc15', 0.95, false);
        }

        anim.sparkleCooldown = Math.max(0, anim.sparkleCooldown - dt);
        if (w.carryingQuality !== 'normal' && anim.sparkleCooldown <= 0) {
          anim.sparkleCooldown = 0.28;
          if (w.carryingQuality === 'divine') {
            this.vfx.emitDivineBurst(ix, 1.05, iz, 2);
          } else {
            this.vfx.emitPerfectBurst(ix, 1.05, iz, 2);
          }
        }
      }

      // Subtle periodic shimmer when player wears Legendary/Ultimate/Mythic gear
      if (w.role === 'player' && this.hasHighRarityGear) {
        this.playerGearSparkleTimer += dt;
        if (this.playerGearSparkleTimer >= 0.95) {
          this.playerGearSparkleTimer = 0;
          this.vfx.emitPerfectBurst(ix, 1.45, iz, 1);
        }
      }
    }

    // Live 6-slot gear diffing (catches Potion Shop ignoreGear, equip swaps, etc.)
    this.syncPlayerEquippedGear(runtime, true);

    for (const [id, rig] of this.workerRigs.entries()) {
      if (!activeWorkerIds.has(id)) {
        this.worldRoot.remove(rig.root);
        disposeObjectTree(rig.root);
        this.workerRigs.delete(id);
        this.workerAnims.delete(id);
        this.workerPoses.delete(id);
      }
    }

    // 4. Sync Customers (Pooled Pedestrians & Rounded Drive-Thru Cars!)
    const activeCustIds = new Set<string>();
    for (const c of runtime.customers) {
      activeCustIds.add(c.id);
      let ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha;
      let iz = c.prevPos.z + (c.pos.z - c.prevPos.z) * alpha;

      let holder = this.customerRigs.get(c.id);
      if (!holder) {
        if (c.isCar) {
          let car = this.carPool.pop();
          if (car) {
            restyleDriveThruCar(car, c.shirtColor, c.isGolden, this.mats);
          } else {
            car = buildDriveThruCarRig(c.shirtColor, c.isGolden, this.mats, this.geos, shadowTex);
          }
          this.worldRoot.add(car.root);
          holder = { car, isCar: true };
          this.carAnims.set(c.id, createCarAnimState(c.id, ix, iz, true, c.deliveredCount));
        } else {
          const seed = Math.round(hashEntitySeed(c.id) * 1000);
          let rig = this.pedestrianPool.pop();
          if (rig) {
            restyleCustomerRig(
              rig,
              {
                shirtColor: c.shirtColor,
                hairColor: c.hairColor,
                isGolden: c.isGolden,
                isGreedy: c.isGreedy,
                seed,
              },
              this.mats,
              this.geos,
            );
          } else {
            rig = buildCharacterRig(c.shirtColor, c.hairColor, false, this.mats, {
              role: 'customer',
              isGolden: c.isGolden,
              isGreedy: c.isGreedy,
              seed,
              geos: this.geos,
              shadowTex,
            });
          }
          this.worldRoot.add(rig.root);
          holder = { rig, isCar: false };
          this.customerAnims.set(
            c.id,
            createCharacterAnimState(c.id, c.facing, ix, iz, true, c.deliveredCount),
          );
        }
        this.customerRigs.set(c.id, holder);
      }

      if (holder.isCar && holder.car) {
        const car = holder.car;
        const canim =
          this.carAnims.get(c.id) ?? createCarAnimState(c.id, ix, iz, true, c.deliveredCount);
        this.carAnims.set(c.id, canim);

        const distMoved = Math.hypot(ix - canim.prevRenderX, iz - canim.prevRenderZ);
        canim.prevRenderX = ix;
        canim.prevRenderZ = iz;

        const moving = c.status === 'entering' || c.status === 'leaving' || distMoved > 0.004;
        if (canim.wasMoving && !moving) {
          canim.hopPulse = 0.45; // cute arrival brake dip!
        }
        canim.wasMoving = moving;

        if (c.deliveredCount > canim.lastDeliveredCount) {
          canim.lastDeliveredCount = c.deliveredCount;
          canim.hopPulse = 1.0;
          this.vfx.emitHearts(ix, 1.45, iz, 3);
        }
        if (canim.hopPulse > 0) {
          canim.hopPulse = Math.max(0, canim.hopPulse - dt * 2.4);
        }

        // Exact +X-nose drive-thru yaw & rolling wheels!
        canim.yaw = computeCarSteeringYaw(c.facing, moving, canim.yaw, dt);
        car.root.position.set(ix, 0, iz);
        car.root.rotation.y = canim.yaw;

        if (distMoved > 0.0005) {
          const dWheel = distMoved / 0.23;
          canim.wheelAngle += dWheel;
          for (const wGrp of car.wheels) {
            wGrp.rotation.z -= dWheel;
          }
        }

        const bounce = moving
          ? Math.abs(Math.sin(canim.wheelAngle * 1.5)) * 0.035
          : Math.sin(this.animClock * 26 + canim.phaseSeed) * 0.008;
        const happyBounce = canim.hopPulse > 0 ? Math.sin(canim.hopPulse * Math.PI) * 0.14 : 0;
        car.bodyGroup.position.y = bounce + happyBounce;
        car.bodyGroup.rotation.z = canim.hopPulse > 0 ? Math.sin(canim.hopPulse * Math.PI * 2) * 0.06 : 0;
      } else if (holder.rig) {
        const rig = holder.rig;
        const canim =
          this.customerAnims.get(c.id) ??
          createCharacterAnimState(c.id, c.facing, ix, iz, true, c.deliveredCount);
        this.customerAnims.set(c.id, canim);

        smoothCharacterMotion(canim, ix, iz, dt);
        ix = canim.smoothX;
        iz = canim.smoothZ;
        const custSpeed = Math.hypot(canim.smoothVX, canim.smoothVZ);
        canim.lastSpeed += (custSpeed - canim.lastSpeed) * expDampFactor(8, dt);
        canim.prevRenderX = ix;
        canim.prevRenderZ = iz;

        // Happy hop + floating hearts when a dish is delivered!
        if (c.deliveredCount > canim.lastDeliveredCount) {
          canim.lastDeliveredCount = c.deliveredCount;
          canim.hopPulse = 1.0;
          const deliveredSlot = layout.slots[c.slotIndex];
          canim.happyTimer = deliveredSlot?.kind === 'table' ? 2.6 : 1.15;
          this.vfx.emitHearts(ix, 1.95, iz, 3);
        }
        if (canim.hopPulse > 0) {
          canim.hopPulse = Math.max(0, canim.hopPulse - dt * 2.5);
        }

        const expr = stepBlinkAndExpression(canim, dt);
        rig.leftEye.scale.y = rig.eyeBaseScaleY * expr.eyeScaleY;
        rig.rightEye.scale.y = rig.eyeBaseScaleY * expr.eyeScaleY;
        rig.eyelids.visible = expr.eyelidScaleY > 0.06;
        rig.eyelids.scale.y = expr.eyelidScaleY;

        // Golden customer periodic sparkle
        if (c.isGolden) {
          canim.sparkleCooldown -= dt;
          if (canim.sparkleCooldown <= 0) {
            canim.sparkleCooldown = 0.65;
            this.vfx.emitPerfectBurst(ix, 1.35, iz, 1);
          }
        }

        resolveSmoothFacing(canim, c.facing, dt);
        rig.root.position.set(ix, 0, iz);
        rig.root.rotation.y = canim.facing;

        const moving = c.status === 'entering' || c.status === 'leaving';
        const slot = layout.slots[c.slotIndex];
        const isSeatedTable = !moving && slot?.kind === 'table';
        // Seated diners chomp away happily for a couple of seconds after each delivery
        const isEating = isSeatedTable && canim.happyTimer > 0 && canim.hopPulse <= 0.15;
        const custActivity = customerActivityFor(c.status, isSeatedTable, isEating);
        const impatience = Math.min(1, Math.max(0, (c.patienceTimer - 6) / 18));

        let cpose = this.customerPoses.get(c.id);
        if (!cpose) {
          cpose = createCharacterPoseState(canim.phaseSeed, custActivity, canim.facing);
          this.customerPoses.set(c.id, cpose);
        }
        const custPose = stepCharacterPose(
          cpose,
          {
            activity: custActivity,
            dt,
            clock: this.animClock,
            speed: canim.lastSpeed,
            carrying: false,
            impatience,
            hopPulse: canim.hopPulse,
            isHappy: expr.isHappy,
          },
          canim.facing,
        );
        applyPoseToRig(rig, custPose, getHatJiggle(cpose));
      }
    }

    for (const [id, holder] of this.customerRigs.entries()) {
      if (!activeCustIds.has(id)) {
        if (holder.rig) this.releasePedestrianRig(holder.rig);
        if (holder.car) this.releaseCarRig(holder.car);
        this.customerRigs.delete(id);
        this.customerAnims.delete(id);
        this.customerPoses.delete(id);
        this.carAnims.delete(id);
      }
    }

    // 5. Sync Companion Pets (all 13 active species modelStyles, scamper vs calm idle, 3D dish trays)
    const activePetIds = new Set<string>();
    for (const p of runtime.pets) {
      activePetIds.add(p.id);
      const ix = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
      const iz = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;

      let rig = this.petRigs.get(p.id);
      if (rig && rig.speciesId !== p.speciesId) {
        this.worldRoot.remove(rig.root);
        disposeObjectTree(rig.root);
        this.petRigs.delete(p.id);
        rig = undefined;
      }
      if (!rig) {
        const modelStyle = PET_SPECIES_BY_ID[p.speciesId]?.modelStyle ?? 'pup';
        rig = buildPetRig(p.color, p.accentColor, this.mats, modelStyle, this.geos, shadowTex);
        rig.speciesId = p.speciesId;
        this.worldRoot.add(rig.root);
        this.petRigs.set(p.id, rig);
        this.petAnims.set(p.id, createPetAnimState(p.id, p.facing, ix, iz, true));
      }

      const panim = this.petAnims.get(p.id) ?? createPetAnimState(p.id, p.facing, ix, iz, true);
      this.petAnims.set(p.id, panim);

      const dx = ix - panim.prevRenderX;
      const dz = iz - panim.prevRenderZ;
      const instSpeed = dt > 0.0001 ? Math.hypot(dx, dz) / dt : 0;
      panim.lastSpeed += (instSpeed - panim.lastSpeed) * expDampFactor(10, dt);
      panim.prevRenderX = ix;
      panim.prevRenderZ = iz;

      panim.facing = lerpAngle(panim.facing, p.facing, dampFast);
      rig.root.position.set(ix, 0, iz);
      rig.root.rotation.y = panim.facing;

      const isScampering =
        p.status === 'delivering_to_customer' ||
        p.status === 'collecting_tip' ||
        panim.lastSpeed > 0.25;

      if (isScampering) {
        panim.hopPhase = advanceWalkPhase(panim.hopPhase, panim.lastSpeed, dt, 10, 22);
        const s = Math.sin(panim.hopPhase);
        const absS = Math.abs(s);
        rig.body.position.y = absS * 0.16;
        rig.body.rotation.x = 0.10;
        rig.body.rotation.z = s * 0.11;
        const sy = 1 + (absS - 0.4) * 0.14;
        rig.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

        panim.dustCooldown = Math.max(0, panim.dustCooldown - dt);
        if (panim.dustCooldown <= 0) {
          panim.dustCooldown = 0.25;
          this.vfx.emitSpeedDust(ix, 0.10, iz, dx, dz);
        }
      } else {
        // Calm idle breathing (no frantic hopping!)
        const idle = Math.sin(this.animClock * 3.5 + panim.phaseSeed);
        rig.body.position.y = idle * 0.025;
        rig.body.rotation.x *= 1 - dampFast;
        rig.body.rotation.z = Math.sin(this.animClock * 2.2 + panim.phaseSeed) * 0.04;
        rig.body.scale.set(1, 1, 1);
      }

      // Expressive species sub-parts: tail wag, wing flutter, lucky_cat wave
      if (rig.tailGroup) {
        rig.tailGroup.rotation.y = Math.sin(this.animClock * (isScampering ? 16 : 6) + panim.phaseSeed) * 0.35;
      }
      if (rig.leftWing && rig.rightWing) {
        const flap = Math.sin(this.animClock * (isScampering ? 18 : 5) + panim.phaseSeed) * 0.32;
        rig.leftWing.rotation.z = 0.22 + flap;
        rig.rightWing.rotation.z = -0.22 - flap;
      } else if (rig.rightWing) {
        // Lucky cat beckoning paw wave!
        rig.rightWing.rotation.x = Math.sin(this.animClock * 6 + panim.phaseSeed) * 0.32;
      }

      rig.dishTray.visible = p.carryingDish;
      if (p.carryingDish) {
        const dishTpl = this.resolveStationTemplateForOrder(runtime, p.activeOrderId, '');
        if (dishTpl) {
          rig.currentDishKey = setTrayDishVisual(
            rig.dishAnchor,
            rig.dishTray,
            dishTpl.modelStyle,
            dishTpl.color,
            dishTpl.accentColor,
            rig.currentDishKey,
            this.mats,
            this.geos,
          );
          rig.dishTray.visible = true;
        }
        rig.qualityHalo.visible = p.carryingQuality !== 'normal';
        if (p.carryingQuality === 'divine') {
          rig.qualityHalo.material = this.mats.basicMat('#c084fc', 0.92, false);
        } else if (p.carryingQuality === 'perfect') {
          rig.qualityHalo.material = this.mats.basicMat('#facc15', 0.92, false);
        }

        panim.sparkleCooldown = Math.max(0, panim.sparkleCooldown - dt);
        if (panim.sparkleCooldown <= 0) {
          panim.sparkleCooldown = 0.28;
          this.vfx.emitPerfectBurst(ix, 0.95, iz, 1);
        }
      }
    }

    for (const [id, rig] of this.petRigs.entries()) {
      if (!activePetIds.has(id)) {
        this.worldRoot.remove(rig.root);
        disposeObjectTree(rig.root);
        this.petRigs.delete(id);
        this.petAnims.delete(id);
      }
    }

    // 6. Sync Tip Coin Stacks (pooled + elastic spawn pop-in + raycast re-tagging!)
    const activeTipIds = new Set<string>();
    for (const t of runtime.tips) {
      activeTipIds.add(t.id);
      let mesh = this.tipMeshes.get(t.id);
      if (!mesh) {
        mesh = this.tipPool.pop();
        if (mesh) {
          mesh.traverse((obj) => {
            obj.userData.pickType = 'tip';
            obj.userData.tipId = t.id;
          });
        } else {
          mesh = buildTipCoinStack(this.mats, t.id, this.geos, shadowTex);
        }
        const tipZ = resolveTipVisualZ(this.controller.getActiveTemplate().archetype, t.pos.z);
        mesh.position.set(t.pos.x, 0, tipZ);
        this.worldRoot.add(mesh);
        this.tipMeshes.set(t.id, mesh);
        this.tipSpawnPop.set(t.id, 0.001);
      }

      const popT = Math.min(1, (this.tipSpawnPop.get(t.id) ?? 1) + dt * 3.4);
      this.tipSpawnPop.set(t.id, popT);
      const popSc = evaluateElasticPop(popT);
      mesh.scale.setScalar(popSc);
      const tipSeed = hashEntitySeed(t.id);
      mesh.rotation.y = this.animClock * 2.2 + tipSeed;
      mesh.position.y = (0.5 + 0.5 * Math.sin(this.animClock * 4 + tipSeed)) * 0.06;
    }

    for (const [id, mesh] of this.tipMeshes.entries()) {
      if (!activeTipIds.has(id)) {
        this.releaseTipMesh(mesh);
        this.tipMeshes.delete(id);
        this.tipSpawnPop.delete(id);
      }
    }
  }

  private projectToScreen(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; visible: boolean } {
    this.projVec.set(x, y, z).project(this.camera);
    const visible = this.projVec.z >= -1 && this.projVec.z <= 1;
    return {
      x: (this.projVec.x * 0.5 + 0.5) * this.viewportWidth,
      y: (-this.projVec.y * 0.5 + 0.5) * this.viewportHeight,
      visible,
    };
  }

  private computeProjectedOverlays(): ProjectedOverlayFrame {
    const runtime = this.controller.getActiveRuntime();
    const alpha = this.controller.getRenderAlpha();

    // Group ALL actively cooking workers per station in one O(W) pass
    const cookingByStation = new Map<number, ProjectedCookingSlot[]>();
    for (const w of runtime.workers) {
      if (w.status !== 'cooking' || w.activeStationIndex === null) continue;
      const wrig = this.workerRigs.get(w.id);
      const wx = wrig ? wrig.root.position.x : w.pos.x;
      const wz = wrig ? wrig.root.position.z : w.pos.z;
      // Timer floats clear above the chef's hat so it never covers the face or body
      const slotProj = this.projectToScreen(wx, 2.7, wz);
      if (!slotProj.visible) continue;
      let list = cookingByStation.get(w.activeStationIndex);
      if (!list) {
        list = [];
        cookingByStation.set(w.activeStationIndex, list);
      }
      list.push({
        progress: Math.max(0, Math.min(1, w.cookProgress)),
        remainingSec: Math.max(0, (1 - Math.min(1, w.cookProgress)) * Math.max(0, w.cookDuration)),
        quality: w.carryingQuality,
        x: slotProj.x,
        y: slotProj.y,
      });
    }

    const activePopularIdx =
      runtime.popularDishStationIndex !== null &&
      runtime.simTime < runtime.popularDishEndsAt
        ? runtime.popularDishStationIndex
        : null;

    const stations: ProjectedStationBadge[] = runtime.stations.map((stn) => {
      const p = this.projectToScreen(stn.worldPos.x, 2.25, stn.worldPos.z - 0.65);
      const slots = cookingByStation.get(stn.index);
      const pulse = Math.max(0, Math.min(1, this.stationUpgradePulses[stn.index] ?? 0));
      return {
        stationIndex: stn.index,
        x: p.x,
        y: p.y,
        visible: p.visible,
        isPopular: activePopularIdx === stn.index,
        ...(slots && slots.length > 0 ? { cookingSlots: slots } : {}),
        ...(pulse > 0.001 ? { justUpgradedPulse: pulse } : {}),
      };
    });

    // Keep the player chef always visible: overlays over this screen rect turn see-through
    const occluders: ProjectedOverlayFrame['occluders'] = [];
    const player = runtime.workers.find((w) => w.role === 'player');
    if (player) {
      const prig = this.workerRigs.get(player.id);
      const px = prig ? prig.root.position.x : player.pos.x;
      const pz = prig ? prig.root.position.z : player.pos.z;
      const feet = this.projectToScreen(px, 0, pz);
      const top = this.projectToScreen(px, 2.2, pz);
      if (feet.visible || top.visible) {
        const h = Math.max(8, feet.y - top.y);
        const halfW = h * 0.32;
        occluders.push({ x0: feet.x - halfW, y0: top.y, x1: feet.x + halfW, y1: feet.y });
      }
    }

    const orders: ProjectedOverlayFrame['orders'] = [];
    for (const c of runtime.customers) {
      if (
        c.status !== 'waiting_to_order' &&
        c.status !== 'ordering' &&
        c.status !== 'waiting_for_food'
      ) {
        continue;
      }
      const ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha;
      const iz = c.prevPos.z + (c.pos.z - c.prevPos.z) * alpha;
      const p = this.projectToScreen(ix, c.isCar ? 1.72 : 2.12, iz);
      if (!p.visible) continue;

      const remaining = Math.max(0, c.totalOrderedCount - c.deliveredCount);
      const hopPulse = c.isCar
        ? (this.carAnims.get(c.id)?.hopPulse ?? 0)
        : (this.customerAnims.get(c.id)?.hopPulse ?? 0);

      orders.push({
        customerId: c.id,
        x: p.x,
        y: p.y,
        icon:
          c.status === 'waiting_to_order' || c.status === 'ordering'
            ? '💬'
            : c.primaryDishIcon,
        remaining,
        isGolden: c.isGolden,
        isGreedy: c.isGreedy,
        orderingProgress: c.status === 'ordering' ? c.orderTakeProgress : null,
        status: c.status,
        ...(hopPulse > 0.001 ? { deliveredPulse: Math.max(0, Math.min(1, hopPulse)) } : {}),
      });
    }

    const tips: ProjectedOverlayFrame['tips'] = [];
    const activeArchetype = this.controller.getActiveTemplate().archetype;
    for (const t of runtime.tips) {
      const tipZ = resolveTipVisualZ(activeArchetype, t.pos.z);
      const p = this.projectToScreen(t.pos.x, 1.32, tipZ);
      if (!p.visible) continue;
      tips.push({ tipId: t.id, x: p.x, y: p.y, amount: t.amount });
    }

    const floating: ProjectedOverlayFrame['floating'] = [];
    for (const fb of runtime.floatingFeedback) {
      const progress = Math.max(0, Math.min(1, fb.maxAge > 0 ? fb.age / fb.maxAge : 1));
      const p = this.projectToScreen(
        fb.worldPos.x,
        fb.heightOffset + progress * 1.45,
        fb.worldPos.z,
      );
      if (!p.visible) continue;
      floating.push({
        id: fb.id,
        x: p.x,
        y: p.y,
        text: fb.text,
        subtext: fb.subtext,
        kind: fb.kind,
        opacity: 1 - progress * progress,
        progress,
      });
    }

    return { stations, orders, tips, floating, occluders };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.unsubRebuild();
    this.cleanupInputs();
    this.resizeObserver.disconnect();

    for (const rig of this.pedestrianPool) disposeObjectTree(rig.root);
    this.pedestrianPool = [];
    for (const car of this.carPool) disposeObjectTree(car.root);
    this.carPool = [];
    for (const tip of this.tipPool) disposeObjectTree(tip);
    this.tipPool = [];

    disposeObjectTree(this.worldRoot, { clearChildren: true });

    this.vfx.dispose();
    this.scene.remove(this.vfx.root);

    this.scene.environment = null;
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;
    this.envMap = null;

    this.dirLight.shadow.dispose();
    this.geos.dispose();
    this.mats.dispose();
    this.textures.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
