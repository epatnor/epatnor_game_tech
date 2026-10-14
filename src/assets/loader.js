import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Gemensam laddningskedja för importerade tillgångar (glTF 2.0 / GLB).
// Avkodarna kopieras till public/decoders av scripts/copy-decoders.mjs.

// Sajtens rot: i dev serveras public/ från '/', i bygget ligger JS i <rot>/static/.
// (BASE_URL är './' för GitHub Pages och kan inte användas från sidor i undermappar.)
const BASE = import.meta.env.DEV ? '/' : new URL('../', import.meta.url).href;

export function createAssetLoader(renderer) {
  const draco = new DRACOLoader().setDecoderPath(`${BASE}decoders/draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}decoders/basis/`).detectSupport(renderer);
  const gltf = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const texLoader = new THREE.TextureLoader();
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  async function loadManifest() {
    const res = await fetch(`${BASE}assets/manifest.json`);
    if (!res.ok) throw new Error(`Manifestet kunde inte laddas (${res.status})`);
    return res.json();
  }

  // Laddar en modell en gång; varje anrop får en egen klon som delar geometri och material.
  async function loadModel(entry) {
    if (!cache.has(entry.file)) {
      cache.set(
        entry.file,
        gltf.loadAsync(`${BASE}assets/${entry.file}`).then((g) => {
          stylize(g.scene, entry.material ?? {});
          return g;
        }),
      );
    }
    const g = await cache.get(entry.file);
    const root = g.scene.clone(true);
    if (entry.scale) root.scale.setScalar(entry.scale);
    return root;
  }

  async function loadTexture(entry) {
    if (!cache.has(entry.file)) {
      const url = `${BASE}assets/${entry.file}`;
      const promise = entry.file.endsWith('.ktx2') ? ktx2.loadAsync(url) : texLoader.loadAsync(url);
      cache.set(
        entry.file,
        promise.then((t) => {
          // Färgtexturer i sRGB, data (normal, roughness) linjärt.
          t.colorSpace = entry.kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(8, maxAniso);
          return t;
        }),
      );
    }
    return cache.get(entry.file);
  }

  // Behåll de författade materialen men dämpa PBR-svaret så att de passar den målade stilen.
  function stylize(root, opts) {
    const minRough = opts.minRoughness ?? 0.65;
    const normalScale = opts.normalScale ?? 0.6;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = opts.castShadow ?? true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.isMeshStandardMaterial) {
          m.roughness = Math.max(m.roughness, minRough);
          if (!opts.keepMetal) m.metalness = Math.min(m.metalness, 0.1);
          if (m.normalScale) m.normalScale.multiplyScalar(normalScale);
        }
        // Löv och gräskort: alphaTest i stället för genomskinlighet (ingen sortering, mindre overdraw).
        if (m.map && (m.transparent || m.alphaTest > 0 || /leaf|leaves|foliage|grass|fern/i.test(m.name))) {
          m.transparent = false;
          m.alphaTest = Math.max(m.alphaTest, 0.5);
          m.side = THREE.DoubleSide;
        }
        for (const key of ['map', 'emissiveMap']) if (m[key]) m[key].anisotropy = Math.min(8, maxAniso);
      }
    });
  }

  return { loadManifest, loadModel, loadTexture, gltf };
}

// Statistik för galleriet och prestandabudgeten.
export function modelStats(root) {
  const materials = new Set();
  const textures = new Set();
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    const inst = o.isInstancedMesh ? o.count : 1;
    triangles += ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst;
    vertices += g.attributes.position.count * inst;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  return { triangles, vertices, meshes, materials: [...materials], textures: [...textures], box };
}

// Gör om en laddad modell till InstancedMesh-objekt, ett per delmesh, för upprepad vegetation.
export function toInstanced(root, matrices) {
  const group = new THREE.Group();
  root.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mesh = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, tmp.multiplyMatrices(m, o.matrixWorld)));
    mesh.castShadow = o.castShadow;
    mesh.receiveShadow = o.receiveShadow;
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  return group;
}

// Vindvikter för importerad vegetation: 0 vid roten, 1 i toppen. Material vars namn
// matchar leafPattern får fladder (aWind.y = 1). Behövs för vindpatchen i vegetation.js.
export function addWindWeights(root, leafPattern = /leaf|leaves|foliage|crown|needle/i) {
  const box = new THREE.Box3().setFromObject(root);
  const height = Math.max(0.001, box.max.y - box.min.y);
  root.traverse((o) => {
    if (!o.isMesh || o.geometry.attributes.aWind) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const leaf = mats.some((m) => leafPattern.test(m.name)) ? 1 : 0;
    const pos = o.geometry.attributes.position;
    const w = new Float32Array(pos.count * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      w[i * 2] = Math.max(0, (v.y - box.min.y) / height);
      w[i * 2 + 1] = leaf;
    }
    o.geometry.setAttribute('aWind', new THREE.BufferAttribute(w, 2));
  });
}
