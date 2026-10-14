import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Delad laddning av karaktärer och rekvisita från manifestet. Varje glTF-fil laddas en gång;
// karaktärer klonas med SkeletonUtils.clone (Object3D.clone skulle dela skelettet).
export function createCharacterLoader(assetLoader) {
  const cache = new Map();
  const loadGltf = (file) => {
    if (!cache.has(file)) cache.set(file, assetLoader.gltf.loadAsync(assetLoader.url(file)));
    return cache.get(file);
  };

  // Returnerar { root, clips }. Klipp från animationsfilerna slås ihop; första namnet vinner.
  async function loadCharacter(entry) {
    const [main, ...anims] = await Promise.all([loadGltf(entry.file), ...(entry.animations ?? []).map(loadGltf)]);
    const root = SkeletonUtils.clone(main.scene);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinnade mesher har annars en bounding sphere från vilopose
    });
    const clips = [];
    const seen = new Set();
    for (const g of [main, ...anims]) {
      for (const clip of g.animations) {
        if (seen.has(clip.name)) continue;
        seen.add(clip.name);
        clips.push(clip);
      }
    }
    if (entry.height) {
      // Skala till önskad höjd (KayKits figurer är stiliserat stora).
      const box = new THREE.Box3().setFromObject(root);
      const s = entry.height / Math.max(0.01, box.max.y - box.min.y);
      const wrapper = new THREE.Group();
      root.scale.setScalar(s);
      wrapper.add(root);
      wrapper.name = entry.name;
      return { root: wrapper, model: root, clips };
    }
    return { root, model: root, clips };
  }

  async function loadProp(file) {
    const g = await loadGltf(file);
    const obj = g.scene.clone(true);
    obj.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    return obj;
  }

  return { loadGltf, loadCharacter, loadProp };
}
