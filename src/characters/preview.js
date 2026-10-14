import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import '../gallery/gallery.css';
import './preview.css';
import { createAssetLoader, modelStats } from '../assets/loader.js';
import { CharacterController } from './controller.js';
import { createCharacterLoader } from './load.js';
import { retargetClip, invertMap } from './retarget.js';
import {
  buildCharacter,
  buildClips,
  buildHair,
  buildPauldrons,
  buildCape,
  PALETTES,
  MIXAMO_NAMES,
  WEAPONS,
  OFFHAND,
  HEADGEAR,
} from './hero.js';

const view = document.getElementById('view');
const panel = document.getElementById('panel');
const info = document.getElementById('info');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc3e6);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
camera.position.set(2.6, 1.8, 4.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

const sun = new THREE.DirectionalLight(0xfff4e0, 3);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -3;
sc.right = sc.top = 3;
scene.add(sun, new THREE.HemisphereLight(0xbcd6ff, 0x556b3a, 0.6));
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(8, 48),
  new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- Karaktärer ------------------------------------------------------------------------------

const PRESETS = {
  Krigare: {
    palette: PALETTES.Krigare,
    hair: 'Kort',
    weapon: 'Svärd',
    offhand: true,
    head: 'Inget',
    cape: false,
    pauldrons: true,
  },
  Magiker: {
    palette: PALETTES.Magiker,
    hair: 'Långt',
    weapon: 'Stav',
    offhand: false,
    head: 'Trollkarlshatt',
    cape: true,
    pauldrons: false,
  },
  Jägare: {
    palette: PALETTES.Jägare,
    hair: 'Hästsvans',
    weapon: 'Yxa',
    offhand: false,
    head: 'Inget',
    cape: true,
    pauldrons: false,
  },
  'Jätte (retargetad)': {
    palette: { ...PALETTES.Krigare, tunic: 0x6b5b3e, pants: 0x3e3326, skin: 0x8fae7a, hair: 0x2a2a2a },
    hair: 'Ingen',
    weapon: 'Yxa',
    offhand: false,
    head: 'Hjälm',
    cape: false,
    pauldrons: true,
    giant: true,
  },
};

// Vapnens läge i handen: greppet i handflatan, bladet framåt.
const WEAPON_OFFSET = {
  Svärd: { position: new THREE.Vector3(0, -0.06, 0.02), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
  Yxa: { position: new THREE.Vector3(0, -0.06, 0.02), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
  Stav: { position: new THREE.Vector3(0, -0.06, 0.02), rotation: new THREE.Euler(0, 0, 0) },
};

const loader = createAssetLoader(renderer);
// Importerade karaktärer från manifestet (namn -> post), laddade via den delade karaktärsladdaren.
const imported = {};
const characterLoader = createCharacterLoader(loader);
const loadImported = (entry) => characterLoader.loadCharacter(entry);
const loadProp = (file) => characterLoader.loadProp(file);
const exporter = new GLTFExporter();
const sourceClips = buildClips();
let sourceHero = null; // referens för retargeting

const state = {
  preset: 'Krigare',
  source: 'procedurell',
  equip: { ...PRESETS.Krigare },
  speed: 0,
  skeleton: false,
  glbBytes: 0,
};
let char = null; // { root, controller, character, clips, isGLB }
let skeletonHelper = null;

function makeCharacter(preset) {
  const p = PRESETS[preset];
  if (!p.giant) {
    const character = buildCharacter({ palette: p.palette });
    return { character, clips: buildClips() };
  }
  // Jätten har Mixamo-liknande bennamn och andra proportioner. Klippen retargetas från
  // standardskelettet med SkeletonUtils.retargetClip i stället för att byggas om.
  const proportions = {
    Spine: 1.15,
    Chest: 1.15,
    UpperLeg_L: 1.2,
    UpperLeg_R: 1.2,
    LowerLeg_L: 1.25,
    LowerLeg_R: 1.25,
    Foot_L: 1.25,
    Foot_R: 1.25,
  };
  const scaledHip = 0.95 * 1.25;
  proportions.Hips = scaledHip / 0.95;
  const character = buildCharacter({ palette: p.palette, names: MIXAMO_NAMES, proportions, bulk: 1.35 });
  if (!sourceHero) sourceHero = buildCharacter();
  const targetToSource = invertMap(MIXAMO_NAMES); // { mixamo-namn: vårt namn }
  const t0 = performance.now();
  const clips = sourceClips.map((clip) =>
    retargetClip(character.mesh, sourceHero.mesh, clip, { names: targetToSource, hip: 'Hips', fps: 30 }),
  );
  state.retargetMs = performance.now() - t0;
  return { character, clips };
}

async function equipImported() {
  const c = char.controller;
  const { entry } = char;
  const e = state.equip;
  c.attach('weapon', e.weapon && e.weapon !== 'Inget' ? await loadProp(entry.weapons[e.weapon]) : null, 'handR');
  c.attach('offhand', e.offhand && e.offhand !== 'Ingen' ? await loadProp(entry.offhand[e.offhand]) : null, 'handL');
  // Modellens egna delar (hjälm, mantel, käke …) kan slås av och på.
  char.root.traverse((o) => {
    if (o.isMesh && o.name in state.parts) o.visible = state.parts[o.name];
  });
  refreshInfo();
}

function equip() {
  if (!char) return;
  if (char.entry) return equipImported();
  const c = char.controller;
  const e = state.equip;
  c.attach('weapon', e.weapon !== 'Inget' ? WEAPONS[e.weapon]() : null, 'handR', WEAPON_OFFSET[e.weapon]);
  c.attach('offhand', e.offhand ? OFFHAND.Sköld() : null, 'handL', { position: new THREE.Vector3(0.04, -0.05, 0) });
  c.attach('head', e.head !== 'Inget' ? HEADGEAR[e.head]() : null, 'head');
  if (char.character) {
    // Skinnade delar finns bara för de procedurella karaktärerna (byggda mot samma vilopose).
    c.setPart('hair', buildHair(e.hair, char.character));
    c.setPart('cape', e.cape ? buildCape(char.character, e.palette?.accent ?? 0x1f6f78) : null);
    c.setPart('pauldrons', e.pauldrons ? buildPauldrons(char.character) : null);
  }
  refreshInfo();
}

async function load() {
  if (char) {
    char.controller.dispose();
    scene.remove(char.root);
  }
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper = null;
  }
  info.innerHTML = '<p>Bygger…</p>';
  const entry = imported[state.preset];
  if (entry) {
    const { root, clips } = await loadImported(entry);
    const controller = new CharacterController(root, clips, { fade: state.fade ?? 0.25, clipMap: entry.clipMap });
    controller.timeScale = state.timeScale ?? 1;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    scene.add(root);
    char = { root, controller, character: null, clips, entry };
    state.parts = {};
    root.traverse((o) => {
      if (o.isMesh && !/body$/i.test(o.name)) state.parts[o.name] = true;
    });
    if (state.skeleton) {
      skeletonHelper = new THREE.SkeletonHelper(root);
      scene.add(skeletonHelper);
    }
    await equip();
    controller.setSpeed(state.speed);
    const box = new THREE.Box3().setFromObject(root);
    controls.target.set(0, (box.max.y + box.min.y) / 2, 0);
    renderPanel();
    return;
  }
  const { character, clips } = makeCharacter(state.preset);
  let root = character.root;
  let usedClips = clips;
  let usedCharacter = character;
  state.glbBytes = 0;
  if (state.source === 'GLB-rundtur') {
    // Exportera till GLB och ladda tillbaka: bevisar att skelett, skinning och klipp överlever glTF.
    const glb = await exporter.parseAsync(character.root, { binary: true, animations: clips });
    state.glbBytes = glb.byteLength;
    const gltf = await loader.gltf.parseAsync(glb, '');
    root = gltf.scene;
    usedClips = gltf.animations;
    usedCharacter = null;
  }
  const controller = new CharacterController(root, usedClips, { fade: state.fade ?? 0.25 });
  controller.timeScale = state.timeScale ?? 1;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  scene.add(root);
  char = { root, controller, character: usedCharacter, clips: usedClips };
  if (state.skeleton) {
    skeletonHelper = new THREE.SkeletonHelper(root);
    scene.add(skeletonHelper);
  }
  equip();
  controller.setSpeed(state.speed);
  const box = new THREE.Box3().setFromObject(root);
  controls.target.set(0, (box.max.y + box.min.y) / 2, 0);
  renderPanel();
}

// --- Panel -----------------------------------------------------------------------------------

function chips(items, isOn, onClick, isDisabled = () => false) {
  const div = document.createElement('div');
  div.className = 'chips';
  for (const [value, label] of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(isOn(value)));
    b.disabled = isDisabled(value);
    b.addEventListener('click', () => onClick(value));
    div.append(b);
  }
  return div;
}

function fieldset(title, ...children) {
  const f = document.createElement('fieldset');
  const l = document.createElement('legend');
  l.textContent = title;
  f.append(l, ...children);
  return f;
}

function slider(id, label, min, max, step, value, fmt, onInput) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /><output for="${id}">${fmt(value)}</output>`;
  const input = row.querySelector('input');
  const out = row.querySelector('output');
  input.addEventListener('input', () => {
    out.textContent = fmt(+input.value);
    onInput(+input.value);
  });
  return row;
}

function select(id, label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label for="${id}">${label}</label><select id="${id}">${options.map((o) => `<option${o === value ? ' selected' : ''}>${o}</option>`).join('')}</select><span></span>`;
  row.querySelector('select').addEventListener('change', (e) => onChange(e.target.value));
  return row;
}

function checkbox(id, label, value, onChange) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label for="${id}">${label}</label><input id="${id}" type="checkbox"${value ? ' checked' : ''} /><span></span>`;
  row.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
  return row;
}

const ANIMS = [
  ['idle', 'Idle'],
  ['walk', 'Walk'],
  ['run', 'Run'],
  ['attack', 'Attack'],
  ['hit', 'Hit'],
  ['death', 'Death'],
  ['spellcast', 'Spellcast'],
];

function renderPanel() {
  const c = char?.controller;
  panel.replaceChildren(
    fieldset(
      'Karaktär',
      chips(
        [...Object.keys(imported), ...Object.keys(PRESETS)].map((k) => [k, k]),
        (k) => k === state.preset,
        (k) => {
          state.preset = k;
          const ent = imported[k];
          state.equip = ent
            ? { weapon: ent.defaultWeapon ?? 'Inget', offhand: ent.defaultOffhand ?? 'Ingen' }
            : { ...PRESETS[k] };
          load();
        },
      ),
    ),
    fieldset(
      'Animation',
      chips(
        ANIMS.map(([k, l]) => [k, char?.entry?.substitutes?.includes(k) ? `${l}*` : l]),
        (k) => c && c.current === c.actions[k],
        (k) => {
          if (k === 'death') c.die();
          else if (['attack', 'hit', 'spellcast'].includes(k)) c.trigger(k);
          else {
            const speeds = { idle: 0, walk: c.walkSpeed, run: c.runSpeed };
            state.speed = speeds[k];
            c.revive?.();
            c.setSpeed(state.speed);
            c.play(k);
            renderPanel();
          }
          setTimeout(renderPanel, 50);
        },
        (k) => !c?.actions[k],
      ),
      slider(
        'speed',
        'Rörelse',
        0,
        6,
        0.1,
        state.speed,
        (v) => `${v.toFixed(1)} m/s`,
        (v) => {
          state.speed = v;
          c.setSpeed(v);
        },
      ),
      slider(
        'timescale',
        'Uppspelning',
        0.1,
        2,
        0.05,
        state.timeScale ?? 1,
        (v) => `${v.toFixed(2)}×`,
        (v) => {
          state.timeScale = v;
          c.timeScale = v;
        },
      ),
      slider(
        'fade',
        'Övertoning',
        0,
        1,
        0.05,
        state.fade ?? 0.25,
        (v) => `${v.toFixed(2)} s`,
        (v) => {
          state.fade = v;
          c.fade = v;
        },
      ),
    ),
    char?.entry ? importedEquipment() : proceduralEquipment(),
    fieldset(
      'Visning',
      ...(char?.entry
        ? []
        : [
            select('source', 'Källa', ['procedurell', 'GLB-rundtur'], state.source, (v) => {
              state.source = v;
              load();
            }),
          ]),
      checkbox('skeleton', 'Skelett', state.skeleton, (v) => {
        state.skeleton = v;
        if (v && char && !skeletonHelper) {
          skeletonHelper = new THREE.SkeletonHelper(char.root);
          scene.add(skeletonHelper);
        } else if (!v && skeletonHelper) {
          scene.remove(skeletonHelper);
          skeletonHelper = null;
        }
      }),
    ),
  );
  refreshInfo();
}

function importedEquipment() {
  const { entry } = char;
  const prefix = entry.file.split('/').pop().replace('.glb', '_');
  return fieldset(
    'Utrustning',
    select('weapon', 'Vapen', ['Inget', ...Object.keys(entry.weapons ?? {})], state.equip.weapon, (v) => {
      state.equip.weapon = v;
      equip();
    }),
    select('offhand', 'Vänster hand', ['Ingen', ...Object.keys(entry.offhand ?? {})], state.equip.offhand, (v) => {
      state.equip.offhand = v;
      equip();
    }),
    ...Object.keys(state.parts).map((name, i) =>
      checkbox(`part-${i}`, name.replace(prefix, ''), state.parts[name], (v) => {
        state.parts[name] = v;
        equip();
      }),
    ),
  );
}

function proceduralEquipment() {
  return fieldset(
    'Utrustning',
    select('weapon', 'Vapen', ['Inget', ...Object.keys(WEAPONS)], state.equip.weapon, (v) => {
      state.equip.weapon = v;
      equip();
    }),
    checkbox('offhand', 'Sköld', state.equip.offhand, (v) => {
      state.equip.offhand = v;
      equip();
    }),
    select('head', 'Huvud', ['Inget', ...Object.keys(HEADGEAR)], state.equip.head, (v) => {
      state.equip.head = v;
      equip();
    }),
    select('hair', 'Frisyr', ['Ingen', 'Kort', 'Hästsvans', 'Långt'], state.equip.hair, (v) => {
      state.equip.hair = v;
      equip();
    }),
    checkbox('cape', 'Mantel', state.equip.cape, (v) => {
      state.equip.cape = v;
      equip();
    }),
    checkbox('pauldrons', 'Axelskydd', state.equip.pauldrons, (v) => {
      state.equip.pauldrons = v;
      equip();
    }),
  );
}

function refreshInfo() {
  if (!char) return;
  const s = modelStats(char.root);
  const c = char.controller;
  const size = s.box.getSize(new THREE.Vector3());
  const rows = [
    [
      'Källa',
      state.source === 'GLB-rundtur'
        ? `GLB (${(state.glbBytes / 1024).toFixed(0)} kB), laddad med GLTFLoader`
        : 'procedurell',
    ],
    ['Ben', c.skeleton?.bones.length ?? 0],
    ['Trianglar', Math.round(s.triangles).toLocaleString('sv-SE')],
    ['Mesher', s.meshes],
    ['Material', s.materials.length],
    ['Höjd', `${size.y.toFixed(2)} m`],
    ['Klipp', char.clips.map((k) => k.name).join(', ')],
    ['Aktivt', c.current?.getClip().name ?? '–'],
  ];
  if (char.entry) {
    rows[0] = ['Källa', `${char.entry.file.split('/').pop()} (GLB) + ${char.entry.animations.length} animationsfiler`];
    rows.push(['Licens', char.entry.license], ['Skapare', char.entry.creator]);
    if (char.entry.substitutes?.length)
      rows.push([
        '* Ersättning',
        Object.entries(char.entry.clipMap)
          .map(([k, v]) => `${k} → ${v}`)
          .join(', '),
      ]);
  }
  if (PRESETS[state.preset]?.giant)
    rows.push(['Retargeting', `${char.clips.length} klipp på ${Math.round(state.retargetMs ?? 0)} ms`]);
  info.innerHTML = `<h3>${state.preset}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

// --- Loop ------------------------------------------------------------------------------------

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
let infoTimer = 0;
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);
  char?.controller.update(dt);
  controls.update();
  renderer.render(scene, camera);
  infoTimer += dt;
  if (infoTimer > 0.5) {
    infoTimer = 0;
    refreshInfo();
  }
});

try {
  const manifest = await loader.loadManifest();
  for (const e of manifest.characters ?? []) imported[e.name] = e;
  const first = Object.values(imported)[0];
  if (first) {
    state.preset = first.name;
    state.equip = { weapon: first.defaultWeapon ?? 'Inget', offhand: first.defaultOffhand ?? 'Ingen' };
  }
} catch (err) {
  console.warn('Manifestet kunde inte läsas', err);
}
state.parts = {};
await load();
window.__characters = {
  state,
  get char() {
    return char;
  },
  load,
};
