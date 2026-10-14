import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from './util.js';
import { windGLSL, terrainGLSL } from './glsl.js';

const UP = new THREE.Vector3(0, 1, 0);
let cacheKey = 0;

// Vind + genomlysning (SSS) på MeshStandardMaterial. Returnerar ett matchande skuggmaterial
// så att skuggorna rör sig med vinden.
export function patchFoliage(material, globals, { sway = 0.3, sss = 0.6 } = {}) {
  const key = `foliage-${cacheKey++}`;
  const vertexPars = `${windGLSL}
    uniform float uSway;
    attribute vec2 aWind;
    varying float vLeaf;`;
  const vertexMain = `
    #ifdef USE_INSTANCING
      vec3 rootW = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 instRot = mat3(modelMatrix) * mat3(instanceMatrix);
    #else
      vec3 rootW = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      mat3 instRot = mat3(modelMatrix);
    #endif
    float gust = windGust(rootW.xz) * uWindStrength;
    float ph = dot(rootW.xz, vec2(0.37, 0.71));
    float ww = aWind.x;
    vec3 dispW = vec3(uWindDir.x, 0.0, uWindDir.y) * gust * uSway * ww * ww;
    dispW.xz += vec2(sin(uTime * 1.7 + ph), cos(uTime * 1.3 + ph)) * 0.35 * gust * ww * uSway;
    float hp = dot(position, vec3(3.1, 4.7, 2.3));
    dispW += vec3(sin(uTime * 7.0 + hp), sin(uTime * 9.0 + hp * 1.3), cos(uTime * 8.0 + hp)) * 0.035 * aWind.y * (0.3 + gust);
    transformed += inverse(instRot) * dispW;
    vLeaf = aWind.y;`;
  const shared = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uWindDir = globals.uWindDir;
    shader.uniforms.uWindStrength = globals.uWindStrength;
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexPars}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexMain}`);
  };
  material.onBeforeCompile = (shader) => {
    shared(shader);
    shader.uniforms.uLightDirView = globals.uLightDirView;
    shader.uniforms.uLightColor = globals.uLightColor;
    shader.uniforms.uSSS = { value: sss };
    shader.uniforms.uWet = globals.uWet;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uLightDirView;
        uniform vec3 uLightColor;
        uniform float uSSS;
        uniform float uWet;
        varying float vLeaf;`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.72, uWet);')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, uWet * vLeaf);',
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vd = normalize(-vViewPosition);
          float back = pow(max(dot(vd, uLightDirView), 0.0), 4.0);
          outgoingLight += uLightColor * diffuseColor.rgb * (back * uSSS + 0.05) * vLeaf;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: material.side });
  depth.onBeforeCompile = shared;
  depth.customProgramCacheKey = () => `${key}-depth`;
  return depth;
}

// Gör en geometri redo för sammanslagning: icke-indexerad, färg, vindvikter och ev. egna normaler.
function finalize(geo, { color, wind, normal } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const n = pos.count;
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  if (!g.attributes.color) {
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      color(p, c);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  if (!g.attributes.aWind) {
    const w = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const v = wind(p);
      w[i * 2] = v[0];
      w[i * 2 + 1] = v[1];
    }
    g.setAttribute('aWind', new THREE.BufferAttribute(w, 2));
  }
  if (normal) {
    const nrm = g.attributes.normal;
    const out = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      normal(p, out, i);
      nrm.setXYZ(i, out.x, out.y, out.z);
    }
  }
  return g;
}

const srgb = (c, r, g, b) => c.setRGB(r, g, b, THREE.SRGBColorSpace);
const bump = (p, seed) =>
  Math.sin(p.x * 2.3 + seed) * Math.sin(p.y * 2.9 + seed * 1.7) * Math.sin(p.z * 2.1 + seed * 0.6);

function blob(radius, detail, seed, center) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = 1 + 0.2 * bump(p, seed);
    p.multiplyScalar(k);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.translate(center.x, center.y, center.z);
  return g;
}

export function buildBroadleaf(rng, leaf) {
  const H = 3.4 + rng() * 1.4;
  const total = H + 3.2;
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.38, H, 8, 5);
  trunk.translate(0, H / 2, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + 0.14 * Math.sin(tp.getY(i) * 0.9));
  const bark = (p, c) => srgb(c, 0.42, 0.29, 0.19).multiplyScalar(0.85 + 0.2 * Math.sin(p.y * 7));
  parts.push(finalize(trunk, { color: bark, wind: (p) => [Math.pow(p.y / total, 1.5) * 0.6, 0] }));
  for (let b = 0; b < 3; b++) {
    const br = new THREE.CylinderGeometry(0.06, 0.12, 1.7, 5);
    br.translate(0, 0.85, 0);
    br.rotateZ(0.75 + rng() * 0.3);
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, H - 0.8 - rng() * 0.6, 0);
    parts.push(finalize(br, { color: bark, wind: (p) => [Math.pow(p.y / total, 1.5) * 0.8, 0.2] }));
  }
  const C = new THREE.Vector3(0, H + 1.2, 0);
  const blobs = 6 + Math.floor(rng() * 3);
  for (let k = 0; k < blobs; k++) {
    const off = new THREE.Vector3((rng() - 0.5) * 3.0, (rng() - 0.35) * 1.8, (rng() - 0.5) * 3.0);
    const r = 1.15 + rng() * 0.7;
    const g = blob(r, 2, rng() * 10, C.clone().add(off));
    parts.push(
      finalize(g, {
        color: (p, c) => {
          const t = THREE.MathUtils.clamp((p.y - (C.y - 1.8)) / 4.2, 0, 1);
          c.copy(leaf).multiplyScalar(0.55 + 0.65 * t + 0.08 * bump(p, 4));
        },
        wind: (p) => [p.y / total, 1],
        // Sfäriska normaler runt hela kronan ger mjuk, stiliserad belysning.
        normal: (p, out) => out.copy(p).sub(C).normalize().lerp(UP, 0.15).normalize(),
      }),
    );
  }
  return mergeGeometries(parts);
}

export function buildPalm(rng) {
  const H = 6 + rng() * 2.5;
  const lean = 1.2 + rng() * 1.2;
  const segs = 10;
  const pt = (t) => new THREE.Vector3(lean * t * t, H * t, 0);
  const parts = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const a = pt(t0);
    const b = pt((i + 1) / segs);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const r0 = 0.27 - 0.1 * t0;
    const cyl = new THREE.CylinderGeometry(r0 * 0.88, r0, len * 1.04, 8, 1);
    q.setFromUnitVectors(UP, dir.normalize());
    cyl.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    cyl.translate(mid.x, mid.y, mid.z);
    const ring = i % 2 === 0;
    parts.push(
      finalize(cyl, {
        color: (p, c) => (ring ? srgb(c, 0.58, 0.45, 0.3) : srgb(c, 0.47, 0.35, 0.22)),
        wind: () => [t0 * t0 * 0.8, 0],
      }),
    );
  }
  const crown = pt(1);
  const fronds = 9;
  for (let f = 0; f < fronds; f++) {
    const plane = new THREE.PlaneGeometry(1, 1, 2, 10);
    const pos = plane.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const wnd = new Float32Array(pos.count * 2);
    const L = 3.4 + rng() * 0.8;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const s = pos.getY(i) + 0.5;
      const side = pos.getX(i);
      const w = 1.0 * Math.sin(Math.PI * Math.min(1, s * 1.05 + 0.05));
      pos.setXYZ(i, s * L, -s * s * 1.9 + 0.35 * s - Math.abs(side) * 0.3, side * w);
      srgb(c, 0.3, 0.58, 0.2).lerp(srgb(new THREE.Color(), 0.68, 0.72, 0.28), s * s);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      wnd[i * 2] = 0.8 + 0.4 * s;
      wnd[i * 2 + 1] = s;
    }
    plane.setAttribute('color', new THREE.BufferAttribute(col, 3));
    plane.setAttribute('aWind', new THREE.BufferAttribute(wnd, 2));
    plane.rotateZ(0.15 + rng() * 0.35);
    plane.rotateY((f / fronds) * Math.PI * 2 + rng() * 0.3);
    plane.translate(crown.x, crown.y, crown.z);
    parts.push(finalize(plane, { normal: (p, out) => out.set(0, 1, 0) }));
  }
  for (let k = 0; k < 3; k++) {
    const nut = new THREE.SphereGeometry(0.17, 8, 6);
    const a = (k / 3) * Math.PI * 2;
    nut.translate(crown.x + Math.cos(a) * 0.25, crown.y - 0.3, crown.z + Math.sin(a) * 0.25);
    parts.push(finalize(nut, { color: (p, c) => srgb(c, 0.36, 0.24, 0.12), wind: () => [0.8, 0] }));
  }
  return mergeGeometries(parts);
}

export function buildConifer(rng) {
  const parts = [];
  const tiers = 4 + Math.floor(rng() * 2);
  const total = 1.4 + tiers * 1.15 + 2.4;
  const trunk = new THREE.CylinderGeometry(0.14, 0.26, 1.8, 6);
  trunk.translate(0, 0.9, 0);
  parts.push(finalize(trunk, { color: (p, c) => srgb(c, 0.38, 0.26, 0.17), wind: () => [0, 0] }));
  for (let i = 0; i < tiers; i++) {
    const r = 2.1 - i * (1.5 / tiers);
    const cone = new THREE.ConeGeometry(r, 2.4, 9, 1).toNonIndexed();
    cone.computeVertexNormals();
    cone.rotateY(rng() * Math.PI);
    cone.translate(0, 2.4 + i * 1.15, 0);
    const n = cone.attributes.normal;
    for (let k = 0; k < n.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(n, k).lerp(UP, 0.35).normalize();
      n.setXYZ(k, v.x, v.y, v.z);
    }
    parts.push(
      finalize(cone, {
        color: (p, c) => srgb(c, 0.14, 0.38, 0.24).multiplyScalar(0.7 + 0.5 * (p.y / total)),
        wind: (p) => [p.y / total, 0.4],
      }),
    );
  }
  return mergeGeometries(parts);
}

export function buildBush(rng, flowers) {
  const parts = [];
  const C = new THREE.Vector3(0, 0.45, 0);
  const leaf = srgb(new THREE.Color(), 0.3, 0.55, 0.2);
  for (let k = 0; k < 3 + Math.floor(rng() * 2); k++) {
    const off = new THREE.Vector3((rng() - 0.5) * 1.2, rng() * 0.3, (rng() - 0.5) * 1.2);
    const g = blob(0.55 + rng() * 0.35, 1, rng() * 10, C.clone().add(off));
    parts.push(
      finalize(g, {
        color: (p, c) => c.copy(leaf).multiplyScalar(0.55 + 0.6 * THREE.MathUtils.clamp(p.y / 1.3, 0, 1)),
        wind: (p) => [0.35 * THREE.MathUtils.clamp(p.y / 1.3, 0, 1), 1],
        normal: (p, out) => out.copy(p).sub(C).normalize().lerp(UP, 0.2).normalize(),
      }),
    );
  }
  if (flowers) {
    const fc = flowers;
    for (let k = 0; k < 14; k++) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.8 + 0.2, rng() - 0.5).normalize();
      const s = new THREE.IcosahedronGeometry(0.09, 0);
      const pnt = C.clone().addScaledVector(dir, 0.85);
      s.translate(pnt.x, pnt.y, pnt.z);
      parts.push(finalize(s, { color: (p, c) => c.copy(fc), wind: () => [0.35, 1] }));
    }
  }
  return mergeGeometries(parts);
}

export function buildRock(rng) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const p = new THREE.Vector3();
  const seed = rng() * 10;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.multiplyScalar(1 + 0.28 * bump(p, seed));
    p.y *= 0.7;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  const grey = srgb(new THREE.Color(), 0.56, 0.55, 0.58);
  const moss = srgb(new THREE.Color(), 0.36, 0.52, 0.22);
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(grey)
      .multiplyScalar(0.85 + 0.15 * bump(new THREE.Vector3().fromBufferAttribute(pos, i), seed + 3))
      .lerp(moss, THREE.MathUtils.smoothstep(nrm.getY(i), 0.55, 0.85));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// Spatialt rutnät för att hålla avstånd mellan objekt.
class Occupancy {
  constructor(cell = 6) {
    this.cell = cell;
    this.map = new Map();
  }
  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }
  free(x, z, r) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.map.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const o of list) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
      }
    }
    return true;
  }
  add(x, z, r) {
    const k = this.key(x, z);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push({ x, z, r });
  }
}

// --- KayKit Forest Nature Pack (CC0) --------------------------------------------------------
// Modellerna registreras i manifestet med en roll (tree-broadleaf, tree-conifer, tree-bare, bush,
// rock, grass-short, grass-tall). Varje modell är en mesh med det gemensamma materialet "forest".
export async function loadForestKit(assetLoader, manifest) {
  const entries = (manifest.models ?? []).filter((m) => m.id.startsWith('kaykit-forest-') && m.role);
  const roles = {};
  let texture = null;
  await Promise.all(
    entries.map(async (m) => {
      const g = await assetLoader.gltf.loadAsync(assetLoader.url(m.file));
      g.scene.updateMatrixWorld(true);
      let geo = null;
      g.scene.traverse((o) => {
        if (o.isMesh && !geo) {
          geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
          texture ??= o.material.map;
        }
      });
      (roles[m.role] ??= []).push({ name: m.name, geo });
    }),
  );
  for (const list of Object.values(roles)) list.sort((a, b) => a.name.localeCompare(b.name));
  if (texture) texture.anisotropy = 8;
  return { roles, texture };
}

// Vindvikter för en importerad växt: 0 vid roten, 1 i toppen; fladder ovanför leafStart.
function addWindWeights(geo, leafStart = 0.35) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(0.001, max.y - min.y);
  const pos = geo.attributes.position;
  const w = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min.y) / h;
    w[i * 2] = t;
    w[i * 2 + 1] = THREE.MathUtils.smoothstep(t, leafStart, leafStart + 0.25);
  }
  geo.setAttribute('aWind', new THREE.BufferAttribute(w, 2));
  return geo;
}

// tuft: valfri importerad grästuva (geometri med uv) som ersätter de procedurella stråna.
function createGrass(globals, { count = 170000, R = 44, tuft = null, map = null, seed = 99, name = 'gräs' } = {}) {
  const levels = 3; // 5 trianglar per strå
  const pos = [];
  for (let k = 0; k < levels; k++) {
    const y = k / levels;
    const w = 0.5 * (1 - y * 0.85);
    pos.push(-w, y, 0, w, y, 0);
  }
  pos.push(0, 1, 0);
  const idx = [];
  for (let k = 0; k < levels - 1; k++) {
    const a = 2 * k;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = 2 * (levels - 1);
  idx.push(last, last + 1, last + 2);

  const geo = new THREE.InstancedBufferGeometry();
  let tuftHeight = 1;
  if (tuft) {
    tuft.computeBoundingBox();
    tuftHeight = tuft.boundingBox.max.y;
    geo.setAttribute('position', tuft.attributes.position);
    geo.setAttribute('normal', tuft.attributes.normal);
    geo.setAttribute('uv', tuft.attributes.uv);
    geo.setIndex(tuft.index);
  } else {
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(
        new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
        3,
      ),
    );
    geo.setIndex(idx);
  }
  const rng = makeRng(seed);
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    off[i * 4] = (rng() * 2 - 1) * R;
    off[i * 4 + 1] = (rng() * 2 - 1) * R;
    off[i * 4 + 2] = rng();
    off[i * 4 + 3] = rng();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;

  const uniforms = {
    uGrassCenter: { value: new THREE.Vector2() },
    uGrassR: { value: R },
    uGrassHeight: { value: 1 },
    uGrassRoot: { value: new THREE.Color(0x2f6a22) },
    uGrassTip: { value: new THREE.Color(0x9ccf55) },
    uTuftHeight: { value: tuftHeight },
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.82, side: THREE.DoubleSide, name, map });
  if (tuft) material.defines = { TUFT: '' };
  material.customProgramCacheKey = () => `grass-${name}-${tuft ? 'tuft' : 'blade'}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uTime: globals.uTime,
      uWindDir: globals.uWindDir,
      uWindStrength: globals.uWindStrength,
      uHeightMap: globals.uHeightMap,
      uTerrainSize: globals.uTerrainSize,
      uTerrainRes: globals.uTerrainRes,
      uPlayer: globals.uPlayer,
      uWet: globals.uWet,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${windGLSL}
        ${terrainGLSL}
        attribute vec4 aOffset;
        uniform vec2 uGrassCenter;
        uniform float uGrassR;
        uniform float uGrassHeight;
        uniform float uTuftHeight;
        uniform vec3 uPlayer;
        varying float vGrassW;
        varying vec3 vGrassTint;
        varying vec3 vFlowerCol;
        varying float vFlower;
        varying vec3 vGrassN;`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace(
        '#include <begin_vertex>',
        `vec2 base = uGrassCenter + mod(aOffset.xy - uGrassCenter + uGrassR, 2.0 * uGrassR) - uGrassR;
        vec4 tr = sampleTerrain(base);
        float distF = 1.0 - smoothstep(uGrassR * 0.6, uGrassR, length(base - uGrassCenter));
        float keep = step(aOffset.z, tr.g) * distF;
        float flower = step(0.972, aOffset.w);
        float bladeH = (0.4 + aOffset.w * 0.55 + flower * 0.12) * keep * uGrassHeight;
        float ang = aOffset.z * 81.0 + aOffset.w * 17.0;
        float ca = cos(ang);
        float sa = sin(ang);
        #ifdef TUFT
          // Importerad tuva: modellens egna form, roterad och skalad per instans.
          float wy = clamp(position.y / uTuftHeight, 0.0, 1.0);
          float sc = (0.8 + aOffset.w * 0.7) * keep * uGrassHeight;
          bladeH = uTuftHeight * sc;
          vec2 xz = vec2(position.x * ca - position.z * sa, position.x * sa + position.z * ca) * sc;
          vec3 transformed = vec3(base.x + xz.x, tr.r + position.y * sc - 0.03, base.y + xz.y);
        #else
          float wy = position.y;
          vec2 lx = vec2(position.x * 0.13, wy * wy * 0.3 * bladeH);
          vec2 xz = vec2(lx.x * ca - lx.y * sa, lx.x * sa + lx.y * ca);
          vec3 transformed = vec3(base.x + xz.x, tr.r + wy * bladeH - 0.03, base.y + xz.y);
        #endif
        float gust = windGust(base) * uWindStrength;
        vec2 bend = uWindDir * gust * 0.9
          + vec2(sin(uTime * 2.3 + aOffset.z * 40.0), cos(uTime * 1.9 + aOffset.w * 30.0)) * 0.12 * (0.3 + gust);
        vec2 toP = base - uPlayer.xz;
        float pd = length(toP);
        bend += toP / max(pd, 0.001) * smoothstep(1.4, 0.2, pd) * 1.3 * step(uPlayer.y - 1.0, tr.r);
        float bw = wy * wy;
        transformed.xz += bend * bw * bladeH;
        transformed.y -= min(length(bend), 1.0) * bw * bladeH * 0.4;
        vGrassW = wy;
        vGrassTint = vec3(0.85 + 0.3 * aOffset.w, 0.9 + 0.2 * aOffset.z, 0.85);
        vFlower = flower;
        float fsel = fract(aOffset.z * 7.0);
        vFlowerCol = fsel < 0.25 ? vec3(1.0, 0.45, 0.7) : fsel < 0.5 ? vec3(1.0, 1.0, 0.92) : fsel < 0.75 ? vec3(1.0, 0.82, 0.2) : vec3(0.5, 0.62, 1.0);
        vGrassN = normalize(vec3(bend.x * 0.3, 1.0, bend.y * 0.3));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uGrassRoot;
        uniform vec3 uGrassTip;
        uniform float uWet;
        varying float vGrassW;
        varying vec3 vGrassTint;
        varying vec3 vFlowerCol;
        varying float vFlower;
        varying vec3 vGrassN;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef TUFT
          // Färgen kommer från tuvans textur (map_fragment); här bara variation och mörkare rot.
          diffuseColor.rgb *= vGrassTint * mix(0.6, 1.0, vGrassW) * mix(1.0, 0.7, uWet);
        #else
          vec3 gc = mix(uGrassRoot, uGrassTip, smoothstep(0.0, 1.0, vGrassW)) * vGrassTint;
          if (vFlower > 0.5 && vGrassW > 0.78) gc = vFlowerCol * 0.9;
          gc *= mix(0.55, 1.0, vGrassW);
          diffuseColor.rgb = gc * mix(1.0, 0.7, uWet);
        #endif`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(vGrassN, 0.0)).xyz);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, uWet);',
      );
  };
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}

function createLeaves(globals, count = 700) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  );
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const rng = makeRng(5);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, {
    uTime: globals.uTime,
    uWindDir: globals.uWindDir,
    uWindStrength: globals.uWindStrength,
    uHeightMap: globals.uHeightMap,
    uTerrainSize: globals.uTerrainSize,
    uTerrainRes: globals.uTerrainRes,
    uCenter: globals.uPlayer,
    uLightColor: globals.uLightColor,
    uSkyAmbient: globals.uSkyAmbient,
  });
  const material = new THREE.ShaderMaterial({
    name: 'fallande löv',
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${windGLSL}
      ${terrainGLSL}
      attribute vec4 aSeed;
      uniform vec3 uCenter;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        float R = 30.0;
        float period = 9.0 + aSeed.w * 6.0;
        float life = fract(uTime / period + aSeed.x);
        vec2 home = (aSeed.yz - 0.5) * 2.0 * R;
        vec2 base = uCenter.xz + mod(home - uCenter.xz + R, 2.0 * R) - R;
        vec4 tr = sampleTerrain(base);
        float startH = tr.r + 6.0 + aSeed.w * 4.0;
        float fallT = life * period;
        vec2 drift = uWindDir * uWindStrength * fallT * (1.0 + aSeed.x) * windGust(base);
        vec3 p = vec3(base + drift, mix(startH, tr.r, life));
        p.x += sin(uTime * 2.0 + aSeed.x * 30.0) * 0.5;
        p.z += cos(uTime * 1.7 + aSeed.y * 20.0) * 0.5;
        float g2 = sampleTerrain(p.xz).r;
        p.y = max(p.y, g2 + 0.04);
        float ang = uTime * (2.0 + aSeed.w * 3.0) + aSeed.x * 10.0;
        float c = cos(ang);
        float s = sin(ang);
        vec3 axis = normalize(vec3(sin(aSeed.y * 10.0), 0.6, cos(aSeed.z * 10.0)));
        vec3 v = position * 0.17;
        v = v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        p += v;
        vAlpha = tr.b * smoothstep(0.0, 0.06, life) * step(0.6, tr.r) * (1.0 - smoothstep(R * 0.7, R, length(base - uCenter.xz)));
        vColor = mix(vec3(0.9, 0.5, 0.12), vec3(0.6, 0.7, 0.2), fract(aSeed.w * 3.0));
        vUv = uv;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLightColor;
      uniform vec3 uSkyAmbient;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        vec2 d = (vUv - 0.5) * vec2(2.0, 1.1);
        if (length(d) > 0.5 || vAlpha < 0.35) discard;
        vec3 col = vColor * (uSkyAmbient * 1.6 + uLightColor * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function createVegetation(globals, terrain, reserved, kit = null) {
  const rng = makeRng(2024);
  const group = new THREE.Group();
  const occ = new Occupancy(6);
  const colliders = [];
  for (const r of reserved) occ.add(r.x, r.z, r.r);

  const tmpN = new THREE.Vector3();
  const sample = (tries, accept) => {
    const out = [];
    const R = terrain.islandRadius * 1.15;
    for (let t = 0; t < tries; t++) {
      const x = (rng() * 2 - 1) * R;
      const z = (rng() * 2 - 1) * R;
      const h = terrain.getHeight(x, z);
      const slope = 1 - terrain.getNormal(x, z, tmpN).y;
      const res = accept(x, z, h, slope);
      if (!res) continue;
      if (!occ.free(x, z, res.r)) continue;
      if (terrain.pathDist(x, z) < (res.path ?? 2.6)) continue;
      occ.add(x, z, res.r);
      out.push({ x, z, h, r: res.r, slope });
      if (out.length >= res.max) break;
    }
    return out;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  // Instanserna delas upp på varianter och sedan på rutor om CHUNK meter. En enda stor
  // InstancedMesh kan aldrig sorteras bort, men en ruta utanför kamerans (eller skuggkamerans)
  // synfält hoppas över helt.
  const CHUNK = 64;
  function instanced(geos, material, depth, points, opts) {
    const buckets = new Map();
    points.forEach((p, i) => {
      const gi = i % geos.length;
      const key = `${gi}:${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      if (!buckets.has(key)) buckets.set(key, { gi, pts: [] });
      buckets.get(key).pts.push(p);
    });
    for (const { gi, pts } of buckets.values()) {
      const mesh = new THREE.InstancedMesh(geos[gi], material, pts.length);
      pts.forEach((p, i) => {
        const sc = opts.scale(p);
        e.set((rng() - 0.5) * opts.tilt, opts.yaw ? opts.yaw(p) : rng() * Math.PI * 2, (rng() - 0.5) * opts.tilt);
        q.setFromEuler(e);
        v.set(p.x, p.h - opts.sink, p.z);
        s.set(sc, sc * (opts.stretch ? 0.8 + rng() * 0.5 : 1), sc);
        m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4);
        const b = 0.85 + rng() * 0.3;
        mesh.setColorAt(i, col.setRGB(b, b, b));
        if (opts.collide) colliders.push({ x: p.x, z: p.z, r: opts.collide * sc });
      });
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = true;
      if (depth) mesh.customDepthMaterial = depth;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  // KayKit-modeller (om de laddats) ersätter de procedurella; samma placering och instansiering.
  const K = kit?.roles ?? {};
  const kitGeos = (role, leafStart) => (K[role] ?? []).map((m) => addWindWeights(m.geo.clone(), leafStart));
  const kitMat = (name, side = THREE.FrontSide) =>
    new THREE.MeshStandardMaterial({ map: kit.texture, roughness: 0.85, side, name });

  // Lövträd: tre gröna varianter och en höstvariant.
  const leafColors = [
    srgb(new THREE.Color(), 0.36, 0.62, 0.22),
    srgb(new THREE.Color(), 0.28, 0.55, 0.24),
    srgb(new THREE.Color(), 0.44, 0.66, 0.2),
    srgb(new THREE.Color(), 0.95, 0.55, 0.16),
  ];
  const leafMat = K['tree-broadleaf']
    ? kitMat('lövträd')
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, name: 'lövträd' });
  const leafDepth = patchFoliage(leafMat, globals, { sway: 0.32, sss: 0.75 });
  const broadleafPts = sample(30000, (x, z, h, slope) => {
    if (h < 2.5 || h > 32 || slope > 0.32) return null;
    if (terrain.grassAt(x, z) < 0.15) return null;
    if (rng() > terrain.forestAt(x, z) * 1.1 + 0.04) return null;
    return { r: 2.4, max: 560 };
  });
  instanced(
    K['tree-broadleaf'] ? kitGeos('tree-broadleaf', 0.3) : leafColors.map((c, i) => buildBroadleaf(makeRng(10 + i), c)),
    leafMat,
    leafDepth,
    broadleafPts,
    K['tree-broadleaf']
      ? { scale: () => 1.25 + rng() * 0.5, tilt: 0.06, sink: 0.25, collide: 0.3 }
      : { scale: () => 0.8 + rng() * 0.6, tilt: 0.08, sink: 0.2, collide: 0.45 },
  );

  const conMat = K['tree-conifer']
    ? kitMat('barrträd')
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, name: 'granar' });
  const conDepth = patchFoliage(conMat, globals, { sway: 0.22, sss: 0.35 });
  const coniferPts = sample(20000, (x, z, h, slope) => {
    if (h < 15 || h > 46 || slope > 0.45) return null;
    if (rng() > 0.45 + terrain.forestAt(x, z) * 0.5) return null;
    return { r: 1.9, max: 240 };
  });
  instanced(
    K['tree-conifer'] ? kitGeos('tree-conifer', 0.2) : [buildConifer(makeRng(30)), buildConifer(makeRng(31))],
    conMat,
    conDepth,
    coniferPts,
    {
      scale: () => (K['tree-conifer'] ? 1.0 + rng() * 0.45 : 0.8 + rng() * 0.7),
      tilt: 0.05,
      sink: 0.2,
      stretch: !K['tree-conifer'],
      collide: K['tree-conifer'] ? 0.3 : 0.4,
    },
  );

  // Kala träd på höjderna (bara med KayKit).
  let barePts = [];
  if (K['tree-bare']) {
    const bareMat = kitMat('kala träd');
    const bareDepth = patchFoliage(bareMat, globals, { sway: 0.15, sss: 0 });
    barePts = sample(12000, (x, z, h, slope) => {
      if (h < 12 || h > 48 || slope > 0.5) return null;
      if (rng() > 0.35) return null;
      return { r: 2.2, max: 70 };
    });
    instanced(kitGeos('tree-bare', 0.5), bareMat, bareDepth, barePts, {
      scale: () => 1.1 + rng() * 0.5,
      tilt: 0.08,
      sink: 0.2,
      collide: 0.25,
    });
  }

  const palmMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    side: THREE.DoubleSide,
    name: 'palmer',
  });
  const palmDepth = patchFoliage(palmMat, globals, { sway: 0.45, sss: 0.9 });
  const palmPts = sample(30000, (x, z, h, slope) => {
    if (h < 0.7 || h > 3.6 || slope > 0.25) return null;
    return { r: 2.6, max: 90, path: 2.2 };
  });
  instanced([buildPalm(makeRng(40)), buildPalm(makeRng(41)), buildPalm(makeRng(42))], palmMat, palmDepth, palmPts, {
    scale: () => 0.85 + rng() * 0.4,
    tilt: 0.0,
    sink: 0.15,
    // Palmerna lutar ut mot havet.
    yaw: (p) => Math.atan2(-p.z, p.x) + (rng() - 0.5) * 0.8,
    collide: 0.35,
  });

  const bushMat = K.bush
    ? kitMat('buskar')
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, name: 'buskar' });
  const bushDepth = patchFoliage(bushMat, globals, { sway: 0.25, sss: 0.6 });
  const bushPts = sample(30000, (x, z, h, slope) => {
    if (h < 1.6 || h > 36 || slope > 0.4) return null;
    if (rng() > 0.3 + terrain.forestAt(x, z) * 0.6) return null;
    return { r: 1.0, max: 650, path: 1.9 };
  });
  instanced(
    K.bush
      ? kitGeos('bush', 0)
      : [
          buildBush(makeRng(50), null),
          buildBush(makeRng(51), srgb(new THREE.Color(), 1.0, 0.5, 0.75)),
          buildBush(makeRng(52), srgb(new THREE.Color(), 1.0, 0.95, 0.85)),
          buildBush(makeRng(53), srgb(new THREE.Color(), 0.85, 0.15, 0.15)),
        ],
    bushMat,
    bushDepth,
    bushPts,
    {
      scale: () => (K.bush ? 1.6 + rng() * 1.2 : 0.7 + rng() * 0.6),
      tilt: 0.1,
      sink: K.bush ? 0.05 : 0.1,
      castShadow: false,
    },
  );

  const rockMat = K.rock
    ? kitMat('stenar')
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, name: 'stenar' });
  rockMat.customProgramCacheKey = () => 'rock';
  rockMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = globals.uWet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.6, uWet);')
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uWet);',
      );
  };
  const rockPts = sample(30000, (x, z, h, slope) => {
    if (h < -1.5) return null;
    if (rng() > 0.05 + slope * 1.4 + (h > 30 ? 0.3 : 0)) return null;
    return { r: 1.8, max: 230, path: 2.0 };
  });
  instanced(
    K.rock ? K.rock.map((m) => m.geo) : [buildRock(makeRng(60)), buildRock(makeRng(61)), buildRock(makeRng(62))],
    rockMat,
    null,
    rockPts,
    {
      scale: () => (K.rock ? 1.4 + Math.pow(rng(), 2) * 4 : 0.5 + Math.pow(rng(), 2) * 2.2),
      tilt: K.rock ? 0.3 : 0.6,
      sink: K.rock ? 0.1 : 0.25,
      stretch: !K.rock,
      collide: K.rock ? 0.35 : 0.9,
    },
  );

  // Skogsmasken till terrängtexturen: högre nära lövträd, så att löven faller där träden står.
  const treeOcc = new Occupancy(8);
  for (const p of broadleafPts) treeOcc.add(p.x, p.z, 0);
  terrain.setForestMask((x, z) => {
    let best = 1e9;
    const cx = Math.floor(x / 8);
    const cz = Math.floor(z / 8);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = treeOcc.map.get(`${cx + dx},${cz + dz}`);
        if (list) for (const o of list) best = Math.min(best, Math.hypot(o.x - x, o.z - z));
      }
    }
    return 1 - THREE.MathUtils.smoothstep(best, 2, 9);
  });

  // Gräs: KayKits tuvor (låga och höga) i samma oändliga, vindpåverkade system, annars procedurella strån.
  let grass;
  const extraGrass = [];
  if (K['grass-short'] && K['grass-tall']) {
    grass = createGrass(globals, { count: 38000, tuft: K['grass-short'][0].geo, map: kit.texture, name: 'gräs (låg)' });
    const tall = createGrass(globals, {
      count: 10000,
      tuft: K['grass-tall'][0].geo,
      map: kit.texture,
      seed: 7,
      name: 'gräs (hög)',
    });
    // Samma reglage styr båda.
    tall.uniforms.uGrassCenter = grass.uniforms.uGrassCenter;
    tall.uniforms.uGrassHeight = grass.uniforms.uGrassHeight;
    extraGrass.push(tall);
    grass.mesh.add(tall.mesh);
  } else {
    grass = createGrass(globals);
  }
  group.add(grass.mesh);
  const leaves = createLeaves(globals);
  group.add(leaves);

  return {
    group,
    colliders,
    grass,
    leaves,
    counts: {
      broadleaf: broadleafPts.length,
      conifer: coniferPts.length,
      palm: palmPts.length,
      bush: bushPts.length,
      rock: rockPts.length,
    },
  };
}
