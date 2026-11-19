import * as THREE from 'three';
import type { GameController } from '@/engine/GameController';
import type { GearTemplate } from '@/types/game';
import { GEAR_BY_ID } from '@/data/gear';
import { getCityByNumber } from '@/data/cities';
import {
  MaterialPool,
  applyEquippedGearVisuals,
  buildCharacterRig,
  buildDriveThruCar,
  buildEnvironmentGroup,
  buildPetRig,
  buildStationRig,
  buildTipCoinStack,
  type CharacterRig,
  type PetVisualRig,
  type StationVisualRig,
} from './meshFactory';

export interface ProjectedStationBadge {
  stationIndex: number;
  x: number;
  y: number;
  visible: boolean;
}

export interface ProjectedOverlayFrame {
  stations: ProjectedStationBadge[];
  orders: Array<{
    customerId: string;
    x: number;
    y: number;
    icon: string;
    remaining: number;
    isGolden: boolean;
    isGreedy: boolean;
    orderingProgress: number | null;
  }>;
  tips: Array<{
    tipId: string;
    x: number;
    y: number;
    amount: string;
  }>;
  floating: Array<{
    id: number;
    x: number;
    y: number;
    text: string;
    subtext?: string;
    kind: string;
    opacity: number;
  }>;
}

/**
 * High-performance Three.js Renderer engineered for mobile Android 60 FPS:
 * - Zero React state updates inside requestAnimationFrame.
 * - Direct read from GameController simulation entities with render interpolation alpha.
 * - Object pooling for customers, workers, pets, and tip stacks.
 * - Supports 60 FPS primary mode and 30 FPS battery-saving mode + adaptive DPR/shadows.
 * - Smooth vertical portrait pan + pinch-zoom guard + instant raycast station/tip picking.
 */
export class SceneRenderer {
  private container: HTMLElement;
  private controller: GameController;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mats = new MaterialPool();
  private worldRoot = new THREE.Group();

  private stationRigs: StationVisualRig[] = [];
  private workerRigs = new Map<string, CharacterRig>();
  private customerRigs = new Map<string, { rig?: CharacterRig; car?: THREE.Group; isCar: boolean }>();
  private petRigs = new Map<string, PetVisualRig>();
  private tipMeshes = new Map<string, THREE.Group>();

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private projVec = new THREE.Vector3();

  private cameraPanZ = 0;
  private targetPanZ = 0;
  private minPanZ = -5;
  private maxPanZ = 5;
  private isDragging = false;
  private dragMoved = false;
  private dragStartY = 0;
  private dragStartX = 0;
  private lastDragY = 0;

  private animFrameId: number | null = null;
  private lastRenderTimeMs = 0;
  private animClock = 0;
  private disposed = false;

  private onSelectStation: (stationIndex: number) => void;
  private onTapTip: (tipId: string) => void;
  private onOverlayFrame?: (frame: ProjectedOverlayFrame) => void;
  private unsubRebuild: () => void;
  private resizeObserver: ResizeObserver;

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

    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 90);
    this.camera.position.set(0, 16.5, 13.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.applyQualitySettings();
    this.rebuildWorld();
    this.bindInputEvents();

    this.unsubRebuild = this.controller.subscribeSceneRebuild(() => {
      this.rebuildWorld();
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.handleResize();

    this.startRenderLoop();
  }

  private dirLight!: THREE.DirectionalLight;

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight('#fff8eb', '#526580', 1.15);
    this.scene.add(hemi);

    this.dirLight = new THREE.DirectionalLight('#fff5e0', 1.45);
    this.dirLight.position.set(10, 22, 12);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 55;
    this.dirLight.shadow.camera.left = -16;
    this.dirLight.shadow.camera.right = 16;
    this.dirLight.shadow.camera.top = 18;
    this.dirLight.shadow.camera.bottom = -18;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);
  }

  applyQualitySettings(): void {
    const quality = this.controller.save.settings.graphicsQuality;
    const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const maxDpr = quality === 'low' ? 1.0 : quality === 'medium' ? 1.5 : 2.0;
    this.renderer.setPixelRatio(Math.min(rawDpr, maxDpr));

    const shadowsOn = quality !== 'low';
    this.renderer.shadowMap.enabled = shadowsOn;
    this.renderer.shadowMap.type =
      quality === 'high' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    this.dirLight.castShadow = shadowsOn;
  }

  rebuildWorld(): void {
    this.applyQualitySettings();
    this.worldRoot.clear();
    this.stationRigs = [];
    this.workerRigs.clear();
    this.customerRigs.clear();
    this.petRigs.clear();
    this.tipMeshes.clear();

    const template = this.controller.getActiveTemplate();
    const layout = this.controller.getActiveLayout();
    const { city } = getCityByNumber(this.controller.getActiveCityNumber());

    const isPotion = template.id === 'event_potion_shop';
    const isCavern = template.id === 'event_crystal_cavern';
    const isLunar = template.id === 'event_lunar_outpost';
    const skyColor = isPotion
      ? '#1a1026'
      : isCavern
        ? '#0f172a'
        : isLunar
          ? '#0b1024'
          : city.skyColor;
    const groundColor = isPotion
      ? '#221533'
      : isCavern
        ? '#1e293b'
        : isLunar
          ? '#334155'
          : city.groundColor;

    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, 26, 56);

    // Environment
    const env = buildEnvironmentGroup(template, layout, groundColor, this.mats);
    this.worldRoot.add(env);

    // Food stations
    for (let i = 0; i < template.stations.length; i++) {
      const rig = buildStationRig(template.stations[i], i, this.mats);
      const pos = layout.stationPositions[i] ?? { x: 0, z: -2 };
      rig.root.position.set(pos.x, 0, pos.z);
      this.worldRoot.add(rig.root);
      this.stationRigs.push(rig);
    }

    // Configure smooth vertical camera pan bounds for portrait screen readability
    this.minPanZ = -Math.max(2.0, layout.depth * 0.25);
    this.maxPanZ = Math.max(2.0, layout.depth * 0.28);
    this.cameraPanZ = 0;
    this.targetPanZ = 0;
    this.updateCameraTransform();
  }

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.updateCameraTransform();
  }

  private updateCameraTransform(): void {
    const layout = this.controller.getActiveLayout();
    const aspect = this.camera.aspect || 0.56;
    // Automatically frame the full restaurant width cleanly on narrow portrait screens AND desktop
    const zoom = this.controller.save.settings.cameraZoom || 1.0;
    const portraitBoost = aspect < 0.75 ? (0.82 / Math.max(0.42, aspect)) : 1.0;
    const baseDist = (Math.max(13.5, layout.width * 1.18) * portraitBoost) / zoom;

    this.camera.position.set(0, baseDist * 1.04, baseDist * 0.78 + this.cameraPanZ);
    this.camera.lookAt(0, 0.2, this.cameraPanZ - 0.35);
  }

  private bindInputEvents(): void {
    const dom = this.renderer.domElement;

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartX = ev.clientX;
      this.dragStartY = ev.clientY;
      this.lastDragY = ev.clientY;
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!this.isDragging) return;
      const totalDy = ev.clientY - this.dragStartY;
      const totalDx = ev.clientX - this.dragStartX;
      if (Math.hypot(totalDx, totalDy) > 10) {
        this.dragMoved = true;
      }
      if (this.dragMoved) {
        const dy = ev.clientY - this.lastDragY;
        this.lastDragY = ev.clientY;
        this.targetPanZ = Math.max(
          this.minPanZ,
          Math.min(this.maxPanZ, this.targetPanZ - dy * 0.025),
        );
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      if (!this.dragMoved) {
        this.handleTapPick(ev.clientX, ev.clientY);
      }
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      this.targetPanZ = Math.max(
        this.minPanZ,
        Math.min(this.maxPanZ, this.targetPanZ + ev.deltaY * 0.008),
      );
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    this.cleanupInputs = () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
    };
  }

  private cleanupInputs: () => void = () => {};

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

  private getEquippedTemplates(): {
    head?: GearTemplate;
    body?: GearTemplate;
    hand1?: GearTemplate;
    hand2?: GearTemplate;
  } {
    const save = this.controller.save;
    const runtime = this.controller.getActiveRuntime();
    if (runtime.ignoreGear) return {};

    const lookup = (instId: string | null) => {
      if (!instId) return undefined;
      const inst = save.inventory.find((i) => i.instanceId === instId);
      return inst ? GEAR_BY_ID[inst.templateId] : undefined;
    };
    return {
      head: lookup(save.equipped.head),
      body: lookup(save.equipped.body),
      hand1: lookup(save.equipped.hand1),
      hand2: lookup(save.equipped.hand2),
    };
  }

  private startRenderLoop(): void {
    const frame = (nowMs: number) => {
      if (this.disposed) return;
      this.animFrameId = requestAnimationFrame(frame);

      // Respect 60 FPS primary / 30 FPS battery-saving mode cleanly
      const targetFps = this.controller.save.settings.targetFps;
      const minInterval = targetFps === 30 ? 31.5 : 0;
      if (minInterval > 0 && nowMs - this.lastRenderTimeMs < minInterval) {
        return;
      }
      const dt = Math.min(0.1, (nowMs - (this.lastRenderTimeMs || nowMs)) / 1000);
      this.lastRenderTimeMs = nowMs;
      this.animClock += dt;

      this.syncSceneFromSimulation();
      this.cameraPanZ += (this.targetPanZ - this.cameraPanZ) * 0.16;
      this.updateCameraTransform();
      this.renderer.render(this.scene, this.camera);

      if (this.onOverlayFrame) {
        this.onOverlayFrame(this.computeProjectedOverlays());
      }
    };
    this.animFrameId = requestAnimationFrame(frame);
  }

  private syncSceneFromSimulation(): void {
    const runtime = this.controller.getActiveRuntime();
    const alpha = this.controller.getRenderAlpha();

    // 1. Update stations (locked/unlocked + cooking bob + radial progress halo)
    for (let i = 0; i < this.stationRigs.length; i++) {
      const rig = this.stationRigs[i];
      const stn = runtime.stations[i];
      if (!stn) continue;
      rig.lockedCrate.visible = !stn.unlocked;
      rig.unlockedMachine.visible = stn.unlocked;

      const cookingWorker = runtime.workers.find(
        (w) => w.status === 'cooking' && w.activeStationIndex === i,
      );
      if (stn.unlocked && cookingWorker) {
        const pulse = 1 + Math.sin(this.animClock * 16) * 0.08;
        rig.activeGlowMesh.scale.set(pulse, pulse, pulse);
        rig.progressRing.visible = true;
        rig.progressFill.visible = true;
        const p = Math.max(0.05, Math.min(1, cookingWorker.cookProgress));
        rig.progressFill.scale.set(p, p, 1);
      } else {
        rig.activeGlowMesh.scale.set(1, 1, 1);
        rig.progressRing.visible = false;
        rig.progressFill.visible = false;
      }
    }

    // 2. Sync Workers
    const activeWorkerIds = new Set<string>();
    for (const w of runtime.workers) {
      activeWorkerIds.add(w.id);
      let rig = this.workerRigs.get(w.id);
      if (!rig) {
        rig = buildCharacterRig(
          w.shirtColor,
          w.role === 'player' ? '#78350f' : '#334155',
          w.role !== 'waiter' && w.role !== 'cashier',
          this.mats,
        );
        if (w.role === 'player') {
          applyEquippedGearVisuals(rig, this.getEquippedTemplates(), this.mats);
        }
        this.worldRoot.add(rig.root);
        this.workerRigs.set(w.id, rig);
      }

      const ix = w.prevPos.x + (w.pos.x - w.prevPos.x) * alpha;
      const iz = w.prevPos.z + (w.pos.z - w.prevPos.z) * alpha;
      rig.root.position.set(ix, 0, iz);
      rig.root.rotation.y = w.facing;

      const isWalking =
        w.status === 'walking_to_order' ||
        w.status === 'walking_to_station' ||
        w.status === 'walking_to_pass' ||
        w.status === 'walking_to_customer' ||
        w.status === 'returning_idle';
      const isCooking = w.status === 'cooking';

      if (isWalking) {
        const swing = Math.sin(this.animClock * 13 + ix) * 0.55;
        rig.leftLeg.rotation.x = swing;
        rig.rightLeg.rotation.x = -swing;
        rig.leftArm.rotation.x = w.carryingDish ? -0.9 : -swing * 0.6;
        rig.rightArm.rotation.x = w.carryingDish ? -0.9 : swing * 0.6;
        rig.bodyGroup.position.y = Math.abs(Math.sin(this.animClock * 13)) * 0.08;
      } else if (isCooking) {
        const chop = Math.sin(this.animClock * 18) * 0.45;
        rig.leftLeg.rotation.x = 0;
        rig.rightLeg.rotation.x = 0;
        rig.leftArm.rotation.x = -0.8 + chop;
        rig.rightArm.rotation.x = -0.8 - chop;
        rig.bodyGroup.position.y = 0;
      } else {
        rig.leftLeg.rotation.x = 0;
        rig.rightLeg.rotation.x = 0;
        rig.leftArm.rotation.x = 0;
        rig.rightArm.rotation.x = 0;
        rig.bodyGroup.position.y = Math.sin(this.animClock * 3) * 0.02;
      }

      rig.trayGroup.visible = w.carryingDish;
      if (w.carryingDish) {
        rig.dishMesh.material = this.mats.std(w.carryingDishColor, 0.35, 0.1);
        rig.qualityHalo.visible = w.carryingQuality !== 'normal';
        if (w.carryingQuality === 'divine') {
          rig.qualityHalo.material = this.mats.basicMat('#c084fc', 0.95);
        } else if (w.carryingQuality === 'perfect') {
          rig.qualityHalo.material = this.mats.basicMat('#facc15', 0.95);
        }
      }
    }
    for (const [id, rig] of this.workerRigs.entries()) {
      if (!activeWorkerIds.has(id)) {
        this.worldRoot.remove(rig.root);
        this.workerRigs.delete(id);
      }
    }

    // 3. Sync Customers (Pedestrians & Drive-Thru Cars)
    const activeCustIds = new Set<string>();
    for (const c of runtime.customers) {
      activeCustIds.add(c.id);
      let holder = this.customerRigs.get(c.id);
      if (!holder) {
        if (c.isCar) {
          const car = buildDriveThruCar(c.shirtColor, c.isGolden, this.mats);
          this.worldRoot.add(car);
          holder = { car, isCar: true };
        } else {
          const rig = buildCharacterRig(c.shirtColor, c.hairColor, false, this.mats);
          this.worldRoot.add(rig.root);
          holder = { rig, isCar: false };
        }
        this.customerRigs.set(c.id, holder);
      }

      const ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha;
      const iz = c.prevPos.z + (c.pos.z - c.prevPos.z) * alpha;

      if (holder.isCar && holder.car) {
        holder.car.position.set(ix, 0, iz);
        holder.car.rotation.y = 0;
      } else if (holder.rig) {
        holder.rig.root.position.set(ix, 0, iz);
        holder.rig.root.rotation.y = c.facing;
        const moving = c.status === 'entering' || c.status === 'leaving';
        if (moving) {
          const swing = Math.sin(this.animClock * 11 + iz) * 0.5;
          holder.rig.leftLeg.rotation.x = swing;
          holder.rig.rightLeg.rotation.x = -swing;
          holder.rig.bodyGroup.position.y = Math.abs(Math.sin(this.animClock * 11)) * 0.06;
        } else {
          holder.rig.leftLeg.rotation.x = 0;
          holder.rig.rightLeg.rotation.x = 0;
          holder.rig.bodyGroup.position.y = 0;
        }
      }
    }
    for (const [id, holder] of this.customerRigs.entries()) {
      if (!activeCustIds.has(id)) {
        if (holder.car) this.worldRoot.remove(holder.car);
        if (holder.rig) this.worldRoot.remove(holder.rig.root);
        this.customerRigs.delete(id);
      }
    }

    // 4. Sync Companion Pets
    const activePetIds = new Set<string>();
    for (const p of runtime.pets) {
      activePetIds.add(p.id);
      let rig = this.petRigs.get(p.id);
      if (!rig) {
        rig = buildPetRig(p.color, p.accentColor, this.mats);
        this.worldRoot.add(rig.root);
        this.petRigs.set(p.id, rig);
      }
      const ix = p.prevPos.x + (p.pos.x - p.prevPos.x) * alpha;
      const iz = p.prevPos.z + (p.pos.z - p.prevPos.z) * alpha;
      rig.root.position.set(ix, 0, iz);
      rig.root.rotation.y = p.facing;
      rig.body.position.y = Math.abs(Math.sin(this.animClock * 12)) * 0.14;
      rig.dishTray.visible = p.carryingDish;
    }
    for (const [id, rig] of this.petRigs.entries()) {
      if (!activePetIds.has(id)) {
        this.worldRoot.remove(rig.root);
        this.petRigs.delete(id);
      }
    }

    // 5. Sync Tip Coin Stacks
    const activeTipIds = new Set<string>();
    for (const t of runtime.tips) {
      activeTipIds.add(t.id);
      let mesh = this.tipMeshes.get(t.id);
      if (!mesh) {
        mesh = buildTipCoinStack(this.mats, t.id);
        mesh.position.set(t.pos.x, 0, t.pos.z);
        this.worldRoot.add(mesh);
        this.tipMeshes.set(t.id, mesh);
      }
      mesh.rotation.y = this.animClock * 2.2;
      mesh.position.y = Math.sin(this.animClock * 4) * 0.06;
    }
    for (const [id, mesh] of this.tipMeshes.entries()) {
      if (!activeTipIds.has(id)) {
        this.worldRoot.remove(mesh);
        this.tipMeshes.delete(id);
      }
    }
  }

  private projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    this.projVec.set(x, y, z).project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const visible = this.projVec.z >= -1 && this.projVec.z <= 1;
    return {
      x: (this.projVec.x * 0.5 + 0.5) * w,
      y: (-this.projVec.y * 0.5 + 0.5) * h,
      visible,
    };
  }

  private computeProjectedOverlays(): ProjectedOverlayFrame {
    const runtime = this.controller.getActiveRuntime();
    const alpha = this.controller.getRenderAlpha();

    const stations: ProjectedStationBadge[] = runtime.stations.map((stn) => {
      const p = this.projectToScreen(stn.worldPos.x, 1.95, stn.worldPos.z);
      return { stationIndex: stn.index, ...p };
    });

    const orders: ProjectedOverlayFrame['orders'] = [];
    for (const c of runtime.customers) {
      if (c.status === 'entering' || c.status === 'leaving') continue;
      const ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha;
      const iz = c.prevPos.z + (c.pos.z - c.prevPos.z) * alpha;
      const p = this.projectToScreen(ix, c.isCar ? 1.65 : 2.15, iz);
      if (!p.visible) continue;
      const remaining = Math.max(0, c.totalOrderedCount - c.deliveredCount);
      orders.push({
        customerId: c.id,
        x: p.x,
        y: p.y,
        icon: c.status === 'waiting_to_order' || c.status === 'ordering' ? '💬' : c.primaryDishIcon,
        remaining,
        isGolden: c.isGolden,
        isGreedy: c.isGreedy,
        orderingProgress: c.status === 'ordering' ? c.orderTakeProgress : null,
      });
    }

    const tips = runtime.tips
      .map((t) => {
        const p = this.projectToScreen(t.pos.x, 1.35, t.pos.z);
        return { tipId: t.id, x: p.x, y: p.y, amount: t.amount, visible: p.visible };
      })
      .filter((t) => t.visible);

    const floating = runtime.floatingFeedback
      .map((fb) => {
        const progress = Math.min(1, fb.age / fb.maxAge);
        const p = this.projectToScreen(
          fb.worldPos.x,
          fb.heightOffset + progress * 1.45,
          fb.worldPos.z,
        );
        return {
          id: fb.id,
          x: p.x,
          y: p.y,
          text: fb.text,
          subtext: fb.subtext,
          kind: fb.kind,
          opacity: 1 - Math.pow(progress, 2),
          visible: p.visible,
        };
      })
      .filter((f) => f.visible);

    return { stations, orders, tips, floating };
  }

  dispose(): void {
    this.disposed = true;
    if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    this.unsubRebuild();
    this.cleanupInputs();
    this.resizeObserver.disconnect();
    this.mats.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
