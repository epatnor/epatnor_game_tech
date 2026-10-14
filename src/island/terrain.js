import * as THREE from 'three';
import { makeRng, makeNoise2D, lerp, smoothstep, clamp } from './util.js';
import { noiseGLSL, rippleGLSL } from './glsl.js';

export const TERRAIN_SIZE = 640;
export const TERRAIN_RES = 321; // 2 m mellan vertexar
const ISLAND_R = 185;

const COL = {
  seabed: new THREE.Color(0xc9b48a),
  wetSand: new THREE.Color(0xc2a272),
  sand: new THREE.Color(0xf0dcaa),
  grassA: new THREE.Color(0x5fae3c),
  grassB: new THREE.Color(0x3f8a34),
  grassDry: new THREE.Color(0x9cba4a),
  rock: new THREE.Color(0x8d8a8f),
  rockWarm: new THREE.Color(0xa08470),
  path: new THREE.Color(0xb48d5c),
  snow: new THREE.Color(0xe8eef2),
};

export function createTerrain(globals, seed = 11) {
  const rng = makeRng(seed);
  const nWarp = makeNoise2D(rng);
  const nHill = makeNoise2D(rng);
  const nRidge = makeNoise2D(rng);
  const nColor = makeNoise2D(rng);
  const nForest = makeNoise2D(rng);

  const fbm = (noise, x, z, oct = 5) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x * f, z * f);
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  };
  const ridged = (x, z) => {
    let s = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < 4; i++) {
      s += a * (1 - Math.abs(nRidge(x * f, z * f)));
      f *= 2.1;
      a *= 0.5;
    }
    return s;
  };

  const mountain = new THREE.Vector2(40, -45);
  const camp = new THREE.Vector2(-55, 38);

  function rawHeight(x, z) {
    const wx = x + 32 * nWarp(x * 0.005, z * 0.005);
    const wz = z + 32 * nWarp(x * 0.005 + 50, z * 0.005 + 50);
    const d = Math.hypot(wx, wz) / ISLAND_R;
    const land = 1 - smoothstep(0.6, 1.08, d);
    let h = lerp(-24, 2.0, smoothstep(0, 1, land));
    const inland = smoothstep(0.18, 0.75, land);
    h += inland * (5 + 7 * fbm(nHill, x * 0.007, z * 0.007));
    const m = Math.max(0, 1 - Math.hypot(x - mountain.x, z - mountain.y) / 120);
    h += inland * Math.pow(m, 1.7) * 52 * (0.7 + 0.45 * ridged(x * 0.012, z * 0.012));
    // Platå för lägret.
    const cd = Math.hypot(x - camp.x, z - camp.y);
    h = lerp(h, 7.5, 1 - smoothstep(10, 24, cd));
    return h;
  }

  const N = TERRAIN_RES;
  const step = TERRAIN_SIZE / (N - 1);
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      heights[j * N + i] = rawHeight(-TERRAIN_SIZE / 2 + i * step, -TERRAIN_SIZE / 2 + j * step);
    }
  }

  function getHeight(x, z) {
    const fx = clamp((x + TERRAIN_SIZE / 2) / step, 0, N - 1.001);
    const fz = clamp((z + TERRAIN_SIZE / 2) / step, 0, N - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = heights[j * N + i];
    const h10 = heights[j * N + i + 1];
    const h01 = heights[(j + 1) * N + i];
    const h11 = heights[(j + 1) * N + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  function getNormal(x, z, out = new THREE.Vector3()) {
    const e = 1.5;
    return out
      .set(getHeight(x - e, z) - getHeight(x + e, z), 2 * e, getHeight(x, z - e) - getHeight(x, z + e))
      .normalize();
  }

  // Strandpunkt: gå från lägret mot sydväst tills marken når vattnet.
  const shoreDir = new THREE.Vector2(-0.35, 1).normalize();
  const shore = camp.clone();
  while (getHeight(shore.x, shore.y) > 0.6 && shore.length() < 300) shore.addScaledVector(shoreDir, 0.5);
  const spawn = shore.clone().addScaledVector(shoreDir, -7);

  // Topp på berget.
  let peak = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const h = heights[j * N + i];
      if (h > peak.y) peak.set(-TERRAIN_SIZE / 2 + i * step, h, -TERRAIN_SIZE / 2 + j * step);
    }
  }

  // Stig: strand → läger → bergets fot → nära toppen.
  const pathPts = [
    spawn.clone(),
    camp.clone(),
    new THREE.Vector2(-10, 5),
    new THREE.Vector2(peak.x - 25, peak.z + 20),
    new THREE.Vector2(peak.x - 6, peak.z + 6),
  ];
  function pathDist(x, z) {
    let best = 1e9;
    for (let k = 0; k < pathPts.length - 1; k++) {
      const a = pathPts[k];
      const b = pathPts[k + 1];
      const abx = b.x - a.x;
      const abz = b.y - a.y;
      const t = clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
      // Lite slingrande stig.
      const wob = 2.5 * nWarp(x * 0.03, z * 0.03);
      best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.y + abz * t)) + wob);
    }
    return best;
  }

  const forestAt = (x, z) => smoothstep(-0.05, 0.25, fbm(nForest, x * 0.012, z * 0.012, 3));

  // Geometri och vertexfärger.
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let k = 0; k < pos.count; k++) pos.setY(k, heights[k]);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;

  const colors = new Float32Array(pos.count * 3);
  // RGBA i halv precision: höjd, gräs, skog, sand.
  const texData = new Float32Array(N * N * 4);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const h = heights[k];
    const slope = 1 - nrm.getY(k);
    const cn = nColor(x * 0.04, z * 0.04) * 0.5 + 0.5;
    const sandLine = 1.6 + cn * 1.2;

    // Gräs: två toner och torrare högre upp.
    c.copy(COL.grassA).lerp(COL.grassB, smoothstep(0.3, 0.7, nColor(x * 0.013, z * 0.013) * 0.5 + 0.5));
    c.lerp(COL.grassDry, smoothstep(18, 34, h) * 0.8);
    let grass = 1;

    // Sand och strand.
    const sand = 1 - smoothstep(sandLine - 0.4, sandLine + 0.4, h);
    if (sand > 0) {
      tmp.copy(COL.sand).lerp(COL.wetSand, 1 - smoothstep(-0.2, 0.9, h));
      if (h < -0.5) tmp.copy(COL.seabed);
      c.lerp(tmp, sand);
      grass *= 1 - sand;
    }

    // Sten i branter och högt upp.
    const rock = Math.max(smoothstep(0.32, 0.48, slope), smoothstep(36, 44, h + cn * 4));
    if (rock > 0) {
      tmp.copy(COL.rock).lerp(COL.rockWarm, cn);
      c.lerp(tmp, rock);
      grass *= 1 - rock;
    }
    // Snöfläckar på toppen.
    const snow = smoothstep(52, 58, h + cn * 5) * (1 - smoothstep(0.4, 0.6, slope));
    c.lerp(COL.snow, snow);

    // Stig.
    const path = (1 - smoothstep(1.1, 2.4, pathDist(x, z))) * (h > 0.8 ? 1 : 0);
    if (path > 0) {
      c.lerp(COL.path, path * 0.9);
      grass *= 1 - path;
    }

    // Mörkare i sänkor (falsk AO från kurvatur saknas, så vi använder skogsmasken).
    const forest = forestAt(x, z) * (1 - sand) * (1 - rock);
    c.multiplyScalar(1 - forest * 0.18);

    colors[k * 3] = c.r;
    colors[k * 3 + 1] = c.g;
    colors[k * 3 + 2] = c.b;

    const grassMask = clamp(grass * (h > 0.4 ? 1 : 0) * (0.55 + 0.45 * cn), 0, 1);
    texData[k * 4] = h;
    texData[k * 4 + 1] = grassMask;
    texData[k * 4 + 2] = forest;
    texData[k * 4 + 3] = sand;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const half = new Uint16Array(texData.length);
  for (let k = 0; k < texData.length; k++) half[k] = THREE.DataUtils.toHalfFloat(texData[k]);
  const heightTex = new THREE.DataTexture(half, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.needsUpdate = true;
  globals.uHeightMap.value = heightTex;

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  material.name = 'terräng';
  material.customProgramCacheKey = () => 'terrain';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uWet = globals.uWet;
    shader.uniforms.uRain = globals.uRain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWet;
        uniform float uRain;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        ${noiseGLSL}
        ${rippleGLSL}
        float gPuddle;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float detail = fbm2(vWorldPos.xz * 0.35);
        diffuseColor.rgb *= 0.86 + 0.28 * detail;
        float flatness = smoothstep(0.93, 0.99, vWorldNormal.y);
        float aboveWater = smoothstep(0.3, 0.8, vWorldPos.y);
        gPuddle = smoothstep(0.56, 0.64, fbm2(vWorldPos.xz * 0.05 + 3.0)) * flatness * aboveWater * smoothstep(0.35, 0.9, uWet);
        diffuseColor.rgb *= mix(1.0, 0.6, uWet * aboveWater);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45 + vec3(0.01, 0.014, 0.02), gPuddle);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.4, uWet * 0.85);
        roughnessFactor = mix(roughnessFactor, 0.03, gPuddle);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (gPuddle > 0.01 && uRain > 0.01) {
          vec2 rip = rainRipples(vWorldPos.xz * 1.6, uTime) * uRain;
          vec3 nW = normalize(vec3(-rip.x * 0.7, 1.0, -rip.y * 0.7));
          vec3 nV = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          normal = normalize(mix(normal, nV, gPuddle));
        }`,
      );
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // Låt vegetationen skriva sin skogsmask tillbaka (används av fallande löv).
  function setForestMask(fn) {
    for (let k = 0; k < N * N; k++) {
      const i = k % N;
      const j = Math.floor(k / N);
      half[k * 4 + 2] = THREE.DataUtils.toHalfFloat(fn(-TERRAIN_SIZE / 2 + i * step, -TERRAIN_SIZE / 2 + j * step));
    }
    heightTex.needsUpdate = true;
  }

  return {
    mesh,
    getHeight,
    getNormal,
    pathDist,
    forestAt,
    grassAt: (x, z) => {
      const fx = Math.round((x + TERRAIN_SIZE / 2) / step);
      const fz = Math.round((z + TERRAIN_SIZE / 2) / step);
      if (fx < 0 || fz < 0 || fx >= N || fz >= N) return 0;
      return texData[(fz * N + fx) * 4 + 1];
    },
    setForestMask,
    camp,
    shore,
    shoreDir,
    spawn,
    peak,
    mountain,
    islandRadius: ISLAND_R,
  };
}
