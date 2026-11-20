/**
 * Dev-only character lab: `npm run dev` then open /tools/character-lab.html
 * Query params: ?activity=walk&carry=1&hop=1
 */
import * as THREE from 'three';
import {
  GeometryPool,
  MaterialPool,
  TextureFactory,
  buildCharacterRig,
  type CharacterRig,
} from '@/renderer/meshFactory';
import {
  applyPoseToRig,
  createCharacterPoseState,
  getHatJiggle,
  stepCharacterPose,
  type CharacterActivity,
  type CharacterPoseState,
} from '@/renderer/characterAnimator';
import { stepBlinkAndExpression, createCharacterAnimState } from '@/renderer/animationHelpers';

const ACTIVITIES: CharacterActivity[] = [
  'idle', 'walk', 'cook', 'take_order', 'stand_wait', 'stand_order', 'sit', 'sit_wait', 'sit_eat',
];

const params = new URLSearchParams(location.search);
let activity = (params.get('activity') as CharacterActivity) || 'walk';
let carry = params.get('carry') === '1';
let hopEvery = params.get('hop') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fdcff');
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4.2, 7.6);
camera.lookAt(0, 0.85, 0);

scene.add(new THREE.HemisphereLight('#ffffff', '#c9a27e', 1.6));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: '#f6e7cf', roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const geos = new GeometryPool();
const mats = new MaterialPool();
const tex = new TextureFactory();
const shadowTex = tex.createContactShadowDisc();

interface Actor { rig: CharacterRig; pose: CharacterPoseState; anim: ReturnType<typeof createCharacterAnimState>; hop: number }
const actors: Actor[] = [];
const specs: Array<[string, string, Parameters<typeof buildCharacterRig>[4]]> = [
  ['#f97316', '#78350f', { role: 'player' }],
  ['#38bdf8', '#334155', { role: 'chef', seed: 4 }],
  ['#ef4444', '#1e293b', { role: 'waiter', seed: 9 }],
  ['#10b981', '#92400e', { role: 'cashier', seed: 2 }],
  ['#a78bfa', '#111827', { role: 'customer', seed: 17 }],
  ['#22c55e', '#7c2d12', { role: 'customer', isGolden: true, seed: 5 }],
  ['#fb7185', '#1e293b', { role: 'customer', isGreedy: true, seed: 11 }],
];
specs.forEach(([shirt, hair, opts], i) => {
  const rig = buildCharacterRig(shirt, hair, opts?.role === 'chef' || opts?.role === 'player', mats, {
    ...opts,
    geos,
    shadowTex,
  });
  const col = i % 4;
  const row = Math.floor(i / 4);
  rig.root.position.set((col - 1.5) * 1.35 + row * 0.67, 0, row * -1.5 + 0.6);
  rig.root.rotation.y = 0.25;
  scene.add(rig.root);
  actors.push({
    rig,
    pose: createCharacterPoseState(i * 1.37, activity),
    anim: createCharacterAnimState(`lab_${i}`, 0, 0, 0),
    hop: 0,
  });
});

const bar = document.getElementById('bar')!;
function renderBar(): void {
  bar.innerHTML = '';
  for (const a of ACTIVITIES) {
    const b = document.createElement('button');
    b.textContent = a;
    b.className = a === activity ? 'on' : '';
    b.onclick = () => { activity = a; renderBar(); };
    bar.appendChild(b);
  }
  const c = document.createElement('button');
  c.textContent = carry ? 'carry: on' : 'carry: off';
  c.onclick = () => { carry = !carry; renderBar(); };
  bar.appendChild(c);
  const h = document.createElement('button');
  h.textContent = 'yay!';
  h.onclick = () => { for (const a of actors) { a.hop = 1; a.anim.happyTimer = 1.2; } };
  bar.appendChild(h);
  const auto = document.createElement('button');
  auto.textContent = hopEvery ? 'auto-yay: on' : 'auto-yay: off';
  auto.onclick = () => { hopEvery = !hopEvery; renderBar(); };
  bar.appendChild(auto);
}
renderBar();

let last = performance.now();
let clock = 0;
let hopTimer = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  hopTimer += dt;
  if (hopEvery && hopTimer > 2.5) {
    hopTimer = 0;
    for (const a of actors) { a.hop = 1; a.anim.happyTimer = 1.2; }
  }
  for (const a of actors) {
    a.hop = Math.max(0, a.hop - dt * 2.5);
    const expr = stepBlinkAndExpression(a.anim, dt);
    a.rig.leftEye.scale.y = a.rig.eyeBaseScaleY * expr.eyeScaleY;
    a.rig.rightEye.scale.y = a.rig.eyeBaseScaleY * expr.eyeScaleY;
    a.rig.eyelids.visible = expr.eyelidScaleY > 0.06;
    a.rig.eyelids.scale.y = expr.eyelidScaleY;
    a.rig.trayGroup.visible = carry;
    const p = stepCharacterPose(a.pose, {
      activity,
      dt,
      clock,
      speed: 2.2,
      carrying: carry,
      impatience: activity === 'stand_wait' ? 0.8 : 0,
      hopPulse: a.hop,
      isHappy: expr.isHappy,
    }, a.rig.root.rotation.y);
    applyPoseToRig(a.rig, p, getHatJiggle(a.pose));
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
