import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import './style.css';
import { experiments } from './experiments/index.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const nav = document.getElementById('nav');
const desc = document.getElementById('desc');
const stats = document.createElement('div');
stats.id = 'stats';
document.body.appendChild(stats);

for (const exp of experiments) {
  const link = document.createElement('a');
  link.href = `#${exp.id}`;
  link.textContent = exp.title;
  link.dataset.id = exp.id;
  nav.appendChild(link);
}

const timer = new THREE.Timer();
timer.connect(document);
renderer.info.autoReset = false; // flera pass per bildruta (efterbehandling) ska summeras
let current = null;

function disposeScene(scene) {
  scene.traverse((obj) => {
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of materials) {
      if (!m) continue;
      for (const value of Object.values(m)) {
        if (value?.isTexture) value.dispose();
      }
      m.dispose();
    }
  });
  if (scene.environment) scene.environment.dispose();
  if (scene.background?.isTexture) scene.background.dispose();
}

function resetRenderer() {
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x0b0e13, 1);
}

function load(id) {
  const exp = experiments.find((e) => e.id === id) ?? experiments[0];
  if (current) {
    current.api.dispose?.();
    current.gui.destroy();
    current.controls.dispose();
    disposeScene(current.scene);
  }

  resetRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(6, 4, 8);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const gui = new GUI({ title: exp.title });
  if (window.innerWidth <= 640) gui.close();

  const api = exp.setup({ renderer, scene, camera, controls, gui, THREE }) ?? {};
  current = { exp, scene, camera, controls, gui, api };

  desc.textContent = exp.description;
  for (const link of nav.children) {
    if (link.dataset.id === exp.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${exp.title} · Game Tech Lab`;
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  if (!current) return;
  current.camera.aspect = w / h;
  current.camera.updateProjectionMatrix();
  current.api.resize?.(w, h);
}

let frames = 0;
let fpsTime = 0;

function tick(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  renderer.info.reset();
  const { scene, camera, controls, api } = current;
  controls.update();
  api.update?.(dt, t);
  if (api.render) api.render();
  else renderer.render(scene, camera);

  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    const info = renderer.info.render;
    stats.textContent = `${Math.round(frames / fpsTime)} fps · ${info.calls} draw calls · ${(info.triangles / 1000).toFixed(1)}k tris`;
    frames = 0;
    fpsTime = 0;
  }
}

window.addEventListener('resize', onResize);
window.addEventListener('hashchange', () => load(location.hash.slice(1)));
load(location.hash.slice(1));
renderer.setAnimationLoop(tick);
