import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedurell, skinnad testkaraktär med eget skelett och egna animationsklipp.
// Den är vår egen (ingen licensfråga) och används för att prova karaktärssystemet
// tills externa tillgångar (Quaternius, KayKit) kan laddas ner och licensgranskas.
//
// Koordinater: Y upp, karaktären tittar mot +Z, 1 enhet = 1 m. Vänster sida är +X.
// Bennamn använder understreck eftersom punkt i namn krockar med animationsspårens syntax.

const BONES = [
  // namn, förälder, lokal position
  ['Hips', null, [0, 0.95, 0]],
  ['Spine', 'Hips', [0, 0.12, 0]],
  ['Chest', 'Spine', [0, 0.2, 0]],
  ['Neck', 'Chest', [0, 0.24, 0]],
  ['Head', 'Neck', [0, 0.1, 0]],
  ['UpperArm_L', 'Chest', [0.33, 0.2, 0]],
  ['LowerArm_L', 'UpperArm_L', [0, -0.3, 0]],
  ['Hand_L', 'LowerArm_L', [0, -0.28, 0]],
  ['UpperArm_R', 'Chest', [-0.33, 0.2, 0]],
  ['LowerArm_R', 'UpperArm_R', [0, -0.3, 0]],
  ['Hand_R', 'LowerArm_R', [0, -0.28, 0]],
  ['UpperLeg_L', 'Hips', [0.12, -0.06, 0]],
  ['LowerLeg_L', 'UpperLeg_L', [0, -0.4, 0]],
  ['Foot_L', 'LowerLeg_L', [0, -0.4, 0]],
  ['UpperLeg_R', 'Hips', [-0.12, -0.06, 0]],
  ['LowerLeg_R', 'UpperLeg_R', [0, -0.4, 0]],
  ['Foot_R', 'LowerLeg_R', [0, -0.4, 0]],
];

// Mixamo-liknande namn: används för att prova retargeting mellan skelett med olika namn.
export const MIXAMO_NAMES = {
  Hips: 'mixamorig_Hips',
  Spine: 'mixamorig_Spine',
  Chest: 'mixamorig_Spine1',
  Neck: 'mixamorig_Neck',
  Head: 'mixamorig_Head',
  UpperArm_L: 'mixamorig_LeftArm',
  LowerArm_L: 'mixamorig_LeftForeArm',
  Hand_L: 'mixamorig_LeftHand',
  UpperArm_R: 'mixamorig_RightArm',
  LowerArm_R: 'mixamorig_RightForeArm',
  Hand_R: 'mixamorig_RightHand',
  UpperLeg_L: 'mixamorig_LeftUpLeg',
  LowerLeg_L: 'mixamorig_LeftLeg',
  Foot_L: 'mixamorig_LeftFoot',
  UpperLeg_R: 'mixamorig_RightUpLeg',
  LowerLeg_R: 'mixamorig_RightLeg',
  Foot_R: 'mixamorig_RightFoot',
};

export const PALETTES = {
  Krigare: { tunic: 0xb03a2e, pants: 0x5a3e2b, boots: 0x2e2420, skin: 0xf1c27d, hair: 0x3b2a1a, accent: 0xd9a441 },
  Magiker: { tunic: 0x3b3f9e, pants: 0x2b2550, boots: 0x231c30, skin: 0xe8b98c, hair: 0xd8d4cc, accent: 0x7fd3ff },
  Jägare: { tunic: 0x3f6b35, pants: 0x5b4630, boots: 0x3a2a1c, skin: 0xc68c5a, hair: 0x7a3b1c, accent: 0xb5884a },
};

function buildSkeleton(names = {}, proportions = {}) {
  const bones = {};
  const list = [];
  for (const [name, parent, p] of BONES) {
    const b = new THREE.Bone();
    b.name = names[name] ?? name;
    const s = proportions[name] ?? 1;
    b.position.set(p[0], p[1] * s, p[2]);
    bones[name] = b;
    list.push(b);
    if (parent) bones[parent].add(b);
  }
  return { bones, list, root: bones.Hips };
}

// Lägger en del på ett ben (stel skinning: vikt 1 mot ett ben).
function part(geo, boneIndex, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    idx[i * 4] = boneIndex;
    w[i * 4] = 1;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function boneWorld(skel, name) {
  skel.root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(skel.bones[name].matrixWorld);
}

// Kropp: en SkinnedMesh med ett material (vertexfärger) = ett draw call.
export function buildCharacter({ palette = PALETTES.Krigare, names = {}, proportions = {}, bulk = 1 } = {}) {
  const skel = buildSkeleton(names, proportions);
  const ix = (n) => skel.list.indexOf(skel.bones[n]);
  const at = (n) => boneWorld(skel, n);
  const parts = [];
  const capsuleBetween = (a, b, r, bone, color) => {
    const pa = at(a);
    const pb = at(b);
    const len = pa.distanceTo(pb);
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 0.6), 4, 10);
    g.translate(0, -len / 2, 0);
    g.translate(pa.x, pa.y, pa.z);
    parts.push(part(g, ix(bone), color));
  };

  // Bål och höfter.
  const hips = at('Hips');
  const chest = at('Chest');
  const torso = new THREE.CapsuleGeometry(0.27 * bulk, 0.36, 6, 14);
  torso.translate(0, (hips.y + chest.y) / 2 + 0.12, 0);
  parts.push(part(torso, ix('Spine'), palette.tunic));
  const pelvis = new THREE.CapsuleGeometry(0.24 * bulk, 0.08, 4, 12);
  pelvis.translate(0, hips.y - 0.02, 0);
  parts.push(part(pelvis, ix('Hips'), palette.pants));
  const belt = new THREE.CylinderGeometry(0.28 * bulk, 0.28 * bulk, 0.07, 16);
  belt.translate(0, hips.y + 0.06, 0);
  parts.push(part(belt, ix('Hips'), 0x6b4423));
  const buckle = new THREE.BoxGeometry(0.1, 0.07, 0.04);
  buckle.translate(0, hips.y + 0.06, 0.28 * bulk);
  parts.push(part(buckle, ix('Hips'), palette.accent));

  // Huvud.
  const head = at('Head');
  const skull = new THREE.SphereGeometry(0.26, 24, 16);
  skull.translate(head.x, head.y + 0.1, head.z);
  parts.push(part(skull, ix('Head'), palette.skin));
  for (const sx of [-0.09, 0.09]) {
    const eye = new THREE.SphereGeometry(0.035, 8, 6);
    eye.translate(head.x + sx, head.y + 0.12, head.z + 0.235);
    parts.push(part(eye, ix('Head'), 0x1a1a1a));
  }
  const nose = new THREE.SphereGeometry(0.04, 8, 6);
  nose.translate(head.x, head.y + 0.06, head.z + 0.26);
  parts.push(part(nose, ix('Head'), palette.skin));
  const neck = new THREE.CylinderGeometry(0.08, 0.09, 0.14, 10);
  neck.translate(head.x, head.y - 0.05, head.z);
  parts.push(part(neck, ix('Neck'), palette.skin));

  // Armar och ben.
  for (const s of ['L', 'R']) {
    capsuleBetween(`UpperArm_${s}`, `LowerArm_${s}`, 0.085 * bulk, `UpperArm_${s}`, palette.tunic);
    capsuleBetween(`LowerArm_${s}`, `Hand_${s}`, 0.07 * bulk, `LowerArm_${s}`, palette.skin);
    const hand = new THREE.SphereGeometry(0.075, 10, 8);
    const ph = at(`Hand_${s}`);
    hand.translate(ph.x, ph.y - 0.04, ph.z);
    parts.push(part(hand, ix(`Hand_${s}`), palette.skin));
    const shoulder = new THREE.SphereGeometry(0.11 * bulk, 12, 8);
    const ps = at(`UpperArm_${s}`);
    shoulder.translate(ps.x, ps.y, ps.z);
    parts.push(part(shoulder, ix(`UpperArm_${s}`), palette.tunic));
    capsuleBetween(`UpperLeg_${s}`, `LowerLeg_${s}`, 0.11 * bulk, `UpperLeg_${s}`, palette.pants);
    capsuleBetween(`LowerLeg_${s}`, `Foot_${s}`, 0.09 * bulk, `LowerLeg_${s}`, palette.pants);
    const boot = new THREE.BoxGeometry(0.17, 0.13, 0.3);
    const pf = at(`Foot_${s}`);
    boot.translate(pf.x, pf.y - 0.02, pf.z + 0.05);
    parts.push(part(boot, ix(`Foot_${s}`), palette.boots));
  }

  const geometry = mergeGeometries(parts);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, name: 'kropp' });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const root = new THREE.Group();
  root.name = 'Character';
  // Skelettet läggs under meshen så att SkeletonUtils.retargetClip (som bara uppdaterar
  // meshens underträd) ser aktuella benmatriser.
  mesh.add(skel.root);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(skel.list);
  mesh.bind(skeleton);
  mesh.frustumCulled = false; // skinnade mesher har annars fel bounding sphere när de rör sig

  return { root, mesh, skeleton, palette, names };
}

// --- Utbytbara skinnade delar (frisyrer, axelskydd, mantel) ---------------------------------
// Byggs mot samma vilopose och binds till karaktärens skelett med bennamn.

// Benets position i bindningsrymden (samma rymd som kroppens geometri byggdes i),
// oberoende av var karaktären står i världen just nu.
function bindPos(skeleton, suffix) {
  const i = skeleton.bones.findIndex((b) => b.name === suffix);
  return new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[i].clone().invert());
}

function skinnedPart(geo, skeleton, boneName, color, name) {
  const bone = skeleton.bones.find((b) => b.name === boneName);
  const g = part(geo, skeleton.bones.indexOf(bone), color);
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, name }));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

const boneName = (character, canonical) => character.names?.[canonical] ?? canonical;

export function buildHair(style, character) {
  const { skeleton, palette } = character;
  const head = bindPos(skeleton, boneName(character, 'Head'));
  head.y += 0.1;
  const geos = [];
  if (style === 'Kort') {
    const g = new THREE.SphereGeometry(0.275, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    g.rotateX(-0.35);
    geos.push(g);
  } else if (style === 'Hästsvans') {
    const cap = new THREE.SphereGeometry(0.275, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    cap.rotateX(-0.3);
    geos.push(cap);
    const tail = new THREE.ConeGeometry(0.09, 0.45, 10);
    tail.rotateX(Math.PI + 0.4);
    tail.translate(0, -0.1, -0.3);
    geos.push(tail);
  } else if (style === 'Långt') {
    const cap = new THREE.SphereGeometry(0.28, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    cap.rotateX(-0.25);
    geos.push(cap);
    const back = new THREE.CapsuleGeometry(0.2, 0.35, 4, 12);
    back.scale(1.2, 1, 0.5);
    back.translate(0, -0.3, -0.16);
    geos.push(back);
  } else {
    return null;
  }
  const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
  geo.translate(head.x, head.y + 0.02, head.z - 0.01);
  return skinnedPart(geo, skeleton, boneName(character, 'Head'), palette.hair, `frisyr: ${style}`);
}

export function buildPauldrons(character) {
  const { skeleton, palette } = character;
  const geos = [];
  for (const s of ['L', 'R']) {
    const p = bindPos(skeleton, boneName(character, `UpperArm_${s}`));
    const g = new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    g.scale(1, 0.8, 1.1);
    g.translate(p.x, p.y + 0.02, p.z);
    geos.push({ g, s });
  }
  // En del per sida eftersom de sitter på olika ben.
  return geos.map(({ g, s }) =>
    skinnedPart(g, skeleton, boneName(character, `UpperArm_${s}`), palette.accent, `axelskydd ${s}`),
  );
}

export function buildCape(character, color = 0x1f6f78) {
  const { skeleton } = character;
  const chest = bindPos(skeleton, boneName(character, 'Chest'));
  const g = new THREE.PlaneGeometry(0.62, 1.05, 1, 6);
  g.translate(0, -0.52, 0);
  g.rotateX(0.12);
  g.translate(chest.x, chest.y + 0.22, chest.z - 0.27);
  const mesh = skinnedPart(g, skeleton, boneName(character, 'Chest'), color, 'mantel');
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

// --- Stela tillbehör (vapen, sköld, huvudbonader) som fästs på ben -----------------------

const metal = new THREE.MeshStandardMaterial({ color: 0xd5dde2, metalness: 0.8, roughness: 0.3, name: 'stål' });
const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.35, name: 'guld' });
const wood = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.8, name: 'trä' });
const leather = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85, name: 'läder' });

function group(...meshes) {
  const g = new THREE.Group();
  for (const m of meshes) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

// Vapen byggs med greppet i origo och bladet längs -Y (handen pekar nedåt i vila).
export const WEAPONS = {
  Svärd: () =>
    group(
      mesh(new THREE.BoxGeometry(0.06, 0.8, 0.02), metal, 0, -0.5, 0),
      mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), gold, 0, -0.08, 0),
      mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), leather, 0, 0.02, 0),
    ),
  Yxa: () => {
    const head = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 16, 1, false, 0, Math.PI);
    head.rotateX(Math.PI / 2);
    head.rotateZ(Math.PI / 2);
    return group(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), wood, 0, -0.3, 0), mesh(head, metal, 0.02, -0.62, 0));
  },
  Stav: () => {
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.09, 1),
      new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x2bb8ff, emissiveIntensity: 2, name: 'kristall' }),
    );
    orb.position.y = 0.72;
    return group(mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.6, 8), wood, 0, 0.0, 0), orb);
  },
};

export const OFFHAND = {
  Sköld: () => {
    const s = new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20);
    s.rotateZ(Math.PI / 2);
    return group(mesh(s, wood, 0.06, -0.05, 0), mesh(new THREE.SphereGeometry(0.07, 10, 8), metal, 0.1, -0.05, 0));
  },
};

export const HEADGEAR = {
  Hjälm: () => {
    const dome = new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    return group(mesh(dome, metal, 0, 0.12, 0), mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), metal, 0, 0.08, 0.27));
  },
  Trollkarlshatt: () => {
    const brim = new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24);
    const cone = new THREE.ConeGeometry(0.24, 0.6, 20);
    cone.rotateX(-0.25);
    const m = new THREE.MeshStandardMaterial({ color: 0x2b2a6e, roughness: 0.85, name: 'tyg' });
    return group(mesh(brim, m, 0, 0.2, 0), mesh(cone, m, 0, 0.5, -0.06));
  },
};

// --- Animationsklipp ------------------------------------------------------------------------

const qFromEuler = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function rotTrack(bone, times, eulers) {
  const values = [];
  for (const e of eulers) values.push(...qFromEuler(...e).toArray());
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}
function posTrack(bone, times, positions) {
  return new THREE.VectorKeyframeTrack(`${bone}.position`, times, positions.flat());
}
// Sampla en funktion jämnt över en cykel (för loopade gångarter).
function cyc(n, duration, fn) {
  const times = [];
  const values = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * duration;
    times.push(t);
    values.push(fn((i / n) * Math.PI * 2));
  }
  return [times, values];
}

export function buildClips(names = {}) {
  const N = (b) => names[b] ?? b;
  const H = 0.95; // höftens vilohöjd
  const clips = [];

  // Idle: andning och lätt gungning.
  {
    const d = 2.4;
    const tr = [];
    tr.push(rotTrack(N('Chest'), ...cyc(8, d, (a) => [Math.sin(a) * 0.03, 0, 0])));
    tr.push(rotTrack(N('Head'), ...cyc(8, d, (a) => [Math.sin(a + 1) * 0.04, Math.sin(a * 0.5) * 0.08, 0])));
    tr.push(rotTrack(N('UpperArm_L'), ...cyc(8, d, (a) => [0.05, 0, 0.12 + Math.sin(a) * 0.03])));
    tr.push(rotTrack(N('UpperArm_R'), ...cyc(8, d, (a) => [0.05, 0, -0.12 - Math.sin(a) * 0.03])));
    tr.push(rotTrack(N('LowerArm_L'), ...cyc(4, d, () => [-0.15, 0, 0])));
    tr.push(rotTrack(N('LowerArm_R'), ...cyc(4, d, () => [-0.15, 0, 0])));
    tr.push(posTrack(N('Hips'), ...cyc(8, d, (a) => [0, H + Math.sin(a) * 0.01, 0])));
    clips.push(new THREE.AnimationClip('Idle', d, tr));
  }

  // Gång och löpning: samma struktur med olika amplitud och framåtlutning.
  const gait = (name, d, legAmp, kneeAmp, armAmp, elbow, lean, bob) => {
    const tr = [];
    const n = 16;
    tr.push(rotTrack(N('UpperLeg_L'), ...cyc(n, d, (a) => [Math.sin(a) * legAmp - lean * 0.3, 0, 0])));
    tr.push(rotTrack(N('UpperLeg_R'), ...cyc(n, d, (a) => [-Math.sin(a) * legAmp - lean * 0.3, 0, 0])));
    tr.push(rotTrack(N('LowerLeg_L'), ...cyc(n, d, (a) => [Math.max(0, Math.sin(a + 1.2)) * kneeAmp, 0, 0])));
    tr.push(rotTrack(N('LowerLeg_R'), ...cyc(n, d, (a) => [Math.max(0, -Math.sin(a + 1.2)) * kneeAmp, 0, 0])));
    tr.push(rotTrack(N('Foot_L'), ...cyc(n, d, (a) => [-Math.sin(a) * 0.25, 0, 0])));
    tr.push(rotTrack(N('Foot_R'), ...cyc(n, d, (a) => [Math.sin(a) * 0.25, 0, 0])));
    tr.push(rotTrack(N('UpperArm_L'), ...cyc(n, d, (a) => [-Math.sin(a) * armAmp, 0, 0.1])));
    tr.push(rotTrack(N('UpperArm_R'), ...cyc(n, d, (a) => [Math.sin(a) * armAmp, 0, -0.1])));
    tr.push(rotTrack(N('LowerArm_L'), ...cyc(n, d, () => [-elbow, 0, 0])));
    tr.push(rotTrack(N('LowerArm_R'), ...cyc(n, d, () => [-elbow, 0, 0])));
    tr.push(rotTrack(N('Spine'), ...cyc(n, d, (a) => [lean, Math.sin(a) * 0.12, 0])));
    tr.push(rotTrack(N('Head'), ...cyc(n, d, () => [-lean * 0.6, 0, 0])));
    tr.push(posTrack(N('Hips'), ...cyc(n, d, (a) => [0, H - bob * 0.5 + Math.abs(Math.cos(a)) * bob, 0])));
    return new THREE.AnimationClip(name, d, tr);
  };
  clips.push(gait('Walk', 1.0, 0.5, 0.8, 0.4, 0.25, 0.04, 0.04));
  clips.push(gait('Run', 0.62, 0.9, 1.4, 0.85, 1.2, 0.28, 0.08));

  // Attack: höger arm lyfts och hugger nedåt framåt, bålen vrids med.
  {
    const t = [0, 0.25, 0.42, 0.6, 0.9];
    clips.push(
      new THREE.AnimationClip('Attack', 0.9, [
        rotTrack(N('UpperArm_R'), t, [[0, 0, -0.1], [-2.7, 0.3, -0.3], [-0.5, -0.2, 0.1], [-0.4, -0.2, 0.1], [0, 0, -0.1]]),
        rotTrack(N('LowerArm_R'), t, [[-0.15, 0, 0], [-0.9, 0, 0], [-0.1, 0, 0], [-0.2, 0, 0], [-0.15, 0, 0]]),
        rotTrack(N('UpperArm_L'), t, [[0, 0, 0.12], [-0.4, 0, 0.4], [0.3, 0, 0.3], [0.2, 0, 0.2], [0, 0, 0.12]]),
        rotTrack(N('Spine'), t, [[0, 0, 0], [-0.1, 0.5, 0], [0.25, -0.45, 0], [0.2, -0.35, 0], [0, 0, 0]]),
        rotTrack(N('UpperLeg_L'), t, [[0, 0, 0], [0.1, 0, 0], [-0.45, 0, 0], [-0.4, 0, 0], [0, 0, 0]]),
        rotTrack(N('LowerLeg_L'), t, [[0, 0, 0], [0.1, 0, 0], [0.35, 0, 0], [0.3, 0, 0], [0, 0, 0]]),
        posTrack(N('Hips'), t, [[0, H, 0], [0, H, -0.03], [0, H - 0.08, 0.1], [0, H - 0.06, 0.08], [0, H, 0]]),
      ]),
    );
  }

  // Träff: rycker bakåt och återhämtar sig.
  {
    const t = [0, 0.1, 0.35, 0.6];
    clips.push(
      new THREE.AnimationClip('Hit', 0.6, [
        rotTrack(N('Spine'), t, [[0, 0, 0], [-0.35, 0.15, 0], [-0.1, 0.05, 0], [0, 0, 0]]),
        rotTrack(N('Head'), t, [[0, 0, 0], [-0.4, -0.2, 0], [-0.1, 0, 0], [0, 0, 0]]),
        rotTrack(N('UpperArm_L'), t, [[0, 0, 0.12], [-0.3, 0, 0.7], [0, 0, 0.3], [0, 0, 0.12]]),
        rotTrack(N('UpperArm_R'), t, [[0, 0, -0.12], [-0.3, 0, -0.7], [0, 0, -0.3], [0, 0, -0.12]]),
        posTrack(N('Hips'), t, [[0, H, 0], [0, H - 0.03, -0.12], [0, H, -0.05], [0, H, 0]]),
      ]),
    );
  }

  // Död: faller bakåt och blir liggande (spelas en gång och stannar på sista bildrutan).
  {
    const t = [0, 0.25, 0.7, 1.0, 1.4];
    clips.push(
      new THREE.AnimationClip('Death', 1.4, [
        rotTrack(N('Hips'), t, [[0, 0, 0], [0.15, 0, 0], [-0.9, 0.1, 0], [-1.45, 0.15, 0.05], [-1.5, 0.15, 0.05]]),
        posTrack(N('Hips'), t, [[0, H, 0], [0, H - 0.1, 0.05], [0, 0.55, -0.35], [0, 0.22, -0.6], [0, 0.2, -0.6]]),
        rotTrack(N('Spine'), t, [[0, 0, 0], [0.3, 0, 0], [0.1, 0, 0], [-0.05, 0, 0], [0, 0, 0]]),
        rotTrack(N('Head'), t, [[0, 0, 0], [0.2, 0, 0], [-0.3, 0.3, 0], [-0.1, 0.5, 0], [0, 0.5, 0]]),
        rotTrack(N('UpperArm_L'), t, [[0, 0, 0.12], [-0.5, 0, 0.3], [-1.2, 0, 1.1], [-0.4, 0, 1.4], [-0.3, 0, 1.4]]),
        rotTrack(N('UpperArm_R'), t, [[0, 0, -0.12], [-0.5, 0, -0.3], [-1.2, 0, -1.1], [-0.4, 0, -1.3], [-0.3, 0, -1.3]]),
        rotTrack(N('UpperLeg_L'), t, [[0, 0, 0], [-0.3, 0, 0], [-0.6, 0, 0.1], [0.2, 0, 0.15], [0.3, 0, 0.15]]),
        rotTrack(N('LowerLeg_L'), t, [[0, 0, 0], [0.4, 0, 0], [0.6, 0, 0], [0.1, 0, 0], [0.05, 0, 0]]),
        rotTrack(N('UpperLeg_R'), t, [[0, 0, 0], [0.1, 0, 0], [-0.2, 0, -0.1], [0.3, 0, -0.1], [0.35, 0, -0.1]]),
      ]),
    );
  }

  // Besvärjelse: händerna lyfts framåt, laddar och stöter ut.
  {
    const t = [0, 0.35, 0.7, 0.85, 1.3];
    clips.push(
      new THREE.AnimationClip('Spellcast', 1.3, [
        rotTrack(N('UpperArm_L'), t, [[0, 0, 0.12], [-1.2, -0.4, 0.5], [-1.0, -0.6, 0.6], [-1.55, 0, 0.15], [0, 0, 0.12]]),
        rotTrack(N('UpperArm_R'), t, [[0, 0, -0.12], [-1.2, 0.4, -0.5], [-1.0, 0.6, -0.6], [-1.55, 0, -0.15], [0, 0, -0.12]]),
        rotTrack(N('LowerArm_L'), t, [[-0.15, 0, 0], [-1.3, 0, 0], [-1.5, 0, 0], [-0.1, 0, 0], [-0.15, 0, 0]]),
        rotTrack(N('LowerArm_R'), t, [[-0.15, 0, 0], [-1.3, 0, 0], [-1.5, 0, 0], [-0.1, 0, 0], [-0.15, 0, 0]]),
        rotTrack(N('Spine'), t, [[0, 0, 0], [-0.15, 0, 0], [-0.2, 0, 0], [0.2, 0, 0], [0, 0, 0]]),
        rotTrack(N('Head'), t, [[0, 0, 0], [0.1, 0, 0], [0.15, 0, 0], [-0.05, 0, 0], [0, 0, 0]]),
        posTrack(N('Hips'), t, [[0, H, 0], [0, H - 0.04, -0.03], [0, H - 0.06, -0.05], [0, H - 0.02, 0.06], [0, H, 0]]),
      ]),
    );
  }
  return clips;
}
