import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './gallery.css';
import { createAssetLoader, modelStats } from '../assets/loader.js';
import {
  buildBroadleaf,
  buildPalm,
  buildConifer,
  buildBush,
  buildRock,
  patchFoliage,
} from '../island/vegetation.js';
import { buildHero } from '../island/player.js';
import { makeRng } from '../island/util.js';

const view = document.getElementById('view');
const list = document.getElementById('list');
const info = document.getElementById('info');
const importNote = document.getElementById('import-note');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
camera.position.set(6, 4, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x556b3a, 0.6);
scene.add(hemi);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(80, 80, 0x000000, 0x000000);
grid.material.opacity = 0.12;
grid.material.transparent = true;
grid.position.y = 0.005;
scene.add(grid);

// Minimala globala uniforms så att vegetationens vindpatch fungerar även här.
const globals = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0 },
  uLightDirView: { value: new THREE.Vector3() },
  uLightColor: { value: new THREE.Color(3, 3, 3) },
  uWet: { value: 0 },
};

const LIGHTS = {
  Dag: { dir: [1, 2.5, 1.5], color: 0xfff4e0, intensity: 3, sky: 0xbcd6ff, groundC: 0x556b3a, hemi: 0.6, env: 0.45, bg: 0x9cc3e6 },
  'Gyllene timme': { dir: [-2, 0.6, 1], color: 0xffb066, intensity: 2.6, sky: 0x7088b8, groundC: 0x3a2a1c, hemi: 0.5, env: 0.3, bg: 0xe2a26c },
  Mulet: { dir: [0.5, 3, 0.8], color: 0xd9dee6, intensity: 0.8, sky: 0xc7d0da, groundC: 0x4a5040, hemi: 1.3, env: 0.6, bg: 0xa9b3bc },
  Natt: { dir: [-1, 2, -1], color: 0x8aa6ff, intensity: 0.5, sky: 0x2a3a60, groundC: 0x0c1010, hemi: 0.2, env: 0.08, bg: 0x0f1828 },
};

const GREENS = [
  new THREE.Color().setRGB(0.36, 0.62, 0.22, THREE.SRGBColorSpace),
  new THREE.Color().setRGB(0.28, 0.55, 0.24, THREE.SRGBColorSpace),
  new THREE.Color().setRGB(0.44, 0.66, 0.2, THREE.SRGBColorSpace),
];
const AUTUMN = [
  new THREE.Color().setRGB(0.95, 0.55, 0.16, THREE.SRGBColorSpace),
  new THREE.Color().setRGB(0.85, 0.32, 0.12, THREE.SRGBColorSpace),
  new THREE.Color().setRGB(0.92, 0.74, 0.22, THREE.SRGBColorSpace),
];

function foliageMaterial(name, side = THREE.FrontSide) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side, name });
  const depth = patchFoliage(m, globals, { sway: 0.32, sss: 0.7 });
  return { m, depth };
}
const mats = {
  leaf: foliageMaterial('lövträd'),
  conifer: foliageMaterial('gran'),
  palm: foliageMaterial('palm', THREE.DoubleSide),
  bush: foliageMaterial('buske'),
  rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, name: 'sten' }),
};
const meshOf = (geo, mat) => {
  const mesh = new THREE.Mesh(geo, mat.m ?? mat);
  if (mat.depth) mesh.customDepthMaterial = mat.depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

// Procedurella modeller från ön. season = 'summer' | 'autumn'.
const entries = [
  ...[0, 1, 2].map((i) => ({
    id: `broadleaf-${i}`,
    name: `Lövträd ${'ABC'[i]}`,
    category: 'Ön: träd',
    seasonal: true,
    build: (season) => meshOf(buildBroadleaf(makeRng(10 + i), (season === 'autumn' ? AUTUMN : GREENS)[i]), mats.leaf),
  })),
  ...[0, 1, 2].map((i) => ({
    id: `palm-${i}`,
    name: `Palm ${'ABC'[i]}`,
    category: 'Ön: träd',
    build: () => meshOf(buildPalm(makeRng(40 + i)), mats.palm),
  })),
  ...[0, 1].map((i) => ({
    id: `conifer-${i}`,
    name: `Gran ${'AB'[i]}`,
    category: 'Ön: träd',
    build: () => meshOf(buildConifer(makeRng(30 + i)), mats.conifer),
  })),
  ...[
    ['utan blommor', null],
    ['rosa blommor', new THREE.Color().setRGB(1, 0.5, 0.75, THREE.SRGBColorSpace)],
    ['vita blommor', new THREE.Color().setRGB(1, 0.95, 0.85, THREE.SRGBColorSpace)],
    ['röda bär', new THREE.Color().setRGB(0.85, 0.15, 0.15, THREE.SRGBColorSpace)],
  ].map(([label, c], i) => ({
    id: `bush-${i}`,
    name: `Buske, ${label}`,
    category: 'Ön: buskar',
    build: () => meshOf(buildBush(makeRng(50 + i), c), mats.bush),
  })),
  ...[0, 1, 2].map((i) => ({
    id: `rock-${i}`,
    name: `Sten ${'ABC'[i]}`,
    category: 'Ön: stenar',
    build: () => {
      const m = meshOf(buildRock(makeRng(60 + i)), mats.rock);
      m.scale.setScalar(1.2 + i * 0.5);
      m.position.y = 0.3;
      return m;
    },
  })),
  {
    id: 'hero',
    name: 'Hjälte',
    category: 'Ön: figurer',
    build: () => buildHero().root,
  },
];

const loader = createAssetLoader(renderer);
const state = { entry: null, season: 'summer', group: false, box: true, wind: false, light: 'Dag' };
const stage = new THREE.Group();
scene.add(stage);
let boxHelper = null;

function setLight(name) {
  const L = LIGHTS[name];
  state.light = name;
  sun.position.set(...L.dir).normalize().multiplyScalar(20);
  sun.color.set(L.color);
  sun.intensity = L.intensity;
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.groundC);
  hemi.intensity = L.hemi;
  scene.environmentIntensity = L.env;
  scene.background = new THREE.Color(L.bg);
  globals.uLightColor.value.copy(sun.color).multiplyScalar(sun.intensity);
  renderButtons();
}

async function buildEntry(entry) {
  if (entry.build) return entry.build(state.season);
  const root = await loader.loadModel(entry);
  if (state.season === 'autumn' && entry.autumn) tintAutumn(root, entry.autumn);
  return root;
}

// Höstvariant för importerade modeller: tona lövmaterialen mot en angiven färg.
function tintAutumn(root, { pattern = 'leaf|leaves|foliage', color = '#d9822b', amount = 0.75 }) {
  const re = new RegExp(pattern, 'i');
  const target = new THREE.Color(color);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    o.material = list.map((m) => {
      if (!re.test(m.name)) return m;
      const c = m.clone();
      c.color.lerp(target, amount);
      return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}

async function show(entry) {
  state.entry = entry;
  for (const b of list.querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset.id === entry.id));
  stage.clear();
  if (boxHelper) {
    scene.remove(boxHelper);
    boxHelper = null;
  }
  info.innerHTML = '<p>Laddar…</p>';
  try {
    const items = state.group ? entries.filter((e) => e.category === entry.category) : [entry];
    const objects = [];
    for (const e of items) objects.push(await buildEntry(e));
    // Ställ upp sida vid sida efter bredd.
    let x = 0;
    const widths = objects.map((o) => new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).x);
    const total = widths.reduce((a, b) => a + b, 0) + (objects.length - 1) * 1.5;
    objects.forEach((o, i) => {
      o.position.x += -total / 2 + x + widths[i] / 2;
      x += widths[i] + 1.5;
      stage.add(o);
    });
    const stats = modelStats(state.group ? stage : objects[0]);
    if (state.box) {
      boxHelper = new THREE.Box3Helper(stats.box, 0x6ee7d8);
      scene.add(boxHelper);
    }
    frame(stats.box);
    renderInfo(state.group ? `${entry.category} (${items.length} st)` : entry.name, stats, entry);
  } catch (err) {
    info.innerHTML = `<h3>${entry.name}</h3><p>Kunde inte laddas: ${err.message}</p>`;
  }
}

function frame(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.6 + 0.5;
  controls.target.copy(center);
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(center).addScaledVector(dir, r * 2.6);
  sun.target.position.copy(center);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -r * 1.5;
  sc.right = sc.top = r * 1.5;
  sc.updateProjectionMatrix();
}

const fmt = (n) => Math.round(n).toLocaleString('sv-SE');

function renderInfo(title, s, entry) {
  const size = s.box.getSize(new THREE.Vector3());
  const rows = [
    ['Trianglar', fmt(s.triangles)],
    ['Vertexar', fmt(s.vertices)],
    ['Mesher', s.meshes],
    ['Material', s.materials.length],
    ['Texturer', s.textures.length],
    ['Mått (B×H×D)', `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`],
  ];
  if (entry.license) rows.push(['Licens', entry.license], ['Skapare', entry.creator ?? '–']);
  info.innerHTML = `<h3>${title}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="mats"></div>`;
  const matsEl = info.querySelector('.mats');
  for (const m of s.materials.slice(0, 12)) {
    const row = document.createElement('div');
    row.className = 'mat';
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = m.vertexColors ? 'linear-gradient(135deg,#3d6a2a,#9ccf55)' : `#${m.color?.getHexString?.() ?? '888888'}`;
    const label = document.createElement('span');
    const r = m.roughness !== undefined ? ` · grovhet ${m.roughness.toFixed(2)}` : '';
    label.innerHTML = `${m.name || m.type}<br><small>${m.type}${r}${m.vertexColors ? ' · vertexfärger' : ''}</small>`;
    row.append(sw, label);
    if (m.map?.image) row.append(thumbnail(m.map.image));
    else row.append(document.createElement('span'));
    matsEl.append(row);
  }
}

function thumbnail(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 80;
  try {
    c.getContext('2d').drawImage(img, 0, 0, 80, 80);
  } catch {
    // Komprimerade (KTX2) texturer kan inte ritas på en 2D-canvas.
  }
  return c;
}

function button(label, pressed, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', onClick);
  return b;
}

function renderButtons() {
  const lights = document.getElementById('lights');
  lights.replaceChildren(...Object.keys(LIGHTS).map((n) => button(n, n === state.light, () => setLight(n))));
  const seasons = document.getElementById('seasons');
  seasons.replaceChildren(
    ...[
      ['summer', 'Sommar'],
      ['autumn', 'Höst'],
    ].map(([k, l]) =>
      button(l, state.season === k, () => {
        state.season = k;
        renderButtons();
        if (state.entry) show(state.entry);
      }),
    ),
  );
  document.getElementById('btn-group').setAttribute('aria-pressed', String(state.group));
  document.getElementById('btn-box').setAttribute('aria-pressed', String(state.box));
  document.getElementById('btn-wind').setAttribute('aria-pressed', String(state.wind));
}

document.getElementById('btn-group').addEventListener('click', () => {
  state.group = !state.group;
  renderButtons();
  if (state.entry) show(state.entry);
});
document.getElementById('btn-box').addEventListener('click', () => {
  state.box = !state.box;
  renderButtons();
  if (state.entry) show(state.entry);
});
document.getElementById('btn-wind').addEventListener('click', () => {
  state.wind = !state.wind;
  globals.uWindStrength.value = state.wind ? 0.8 : 0;
  renderButtons();
});

function renderList() {
  const cats = [...new Set(entries.map((e) => e.category))];
  list.replaceChildren();
  for (const cat of cats) {
    const h = document.createElement('h2');
    h.textContent = cat;
    list.append(h);
    for (const e of entries.filter((x) => x.category === cat)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e.name;
      b.dataset.id = e.id;
      b.addEventListener('click', () => show(e));
      list.append(b);
    }
  }
}

async function loadImported() {
  try {
    const manifest = await loader.loadManifest();
    const models = manifest.models ?? [];
    for (const m of models) entries.push({ ...m, category: `Importerat: ${m.category}` });
    importNote.textContent = models.length
      ? `${models.length} importerade modeller från manifestet.`
      : 'Inga importerade modeller än. Lägg GLB-filer i public/assets/models/ och registrera dem i public/assets/manifest.json (se INTEGRATION_NOTES.md).';
  } catch (err) {
    importNote.textContent = `Manifestet kunde inte läsas: ${err.message}`;
  }
  renderList();
}

function resize() {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

const timer = new THREE.Timer();
timer.connect(document);
const lightDir = new THREE.Vector3();
renderer.setAnimationLoop((t) => {
  timer.update(t);
  globals.uTime.value += timer.getDelta();
  controls.update();
  camera.updateMatrixWorld();
  lightDir.copy(sun.position).sub(sun.target.position).normalize();
  globals.uLightDirView.value.copy(lightDir).transformDirection(camera.matrixWorldInverse);
  renderer.render(scene, camera);
});

setLight('Dag');
renderList();
await loadImported();
show(entries[0]);
window.__gallery = { entries, show, state };
