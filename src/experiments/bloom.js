import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export default {
  id: 'bloom',
  title: 'Bloom',
  description:
    'Efterbehandling med EffectComposer: scenen renderas till en HDR-buffert, UnrealBloomPass sprider ljuset från pixlar över tröskeln och OutputPass gör tonmappning och färgrymd.',
  setup({ renderer, scene, camera, gui }) {
    camera.position.set(0, 2, 11);
    scene.background = new THREE.Color(0x05070a);

    scene.add(new THREE.AmbientLight(0x404858, 0.4));

    const knots = [];
    const hues = [0.47, 0.02, 0.6, 0.12, 0.85];
    hues.forEach((hue, i) => {
      const c = new THREE.Color().setHSL(hue, 0.9, 0.55);
      const m = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.7, 0.18, 160, 20, 2 + (i % 3), 3),
        new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.4, roughness: 0.4 }),
      );
      const a = (i / hues.length) * Math.PI * 2;
      m.position.set(Math.cos(a) * 3.5, Math.sin(a * 2) * 0.6, Math.sin(a) * 3.5);
      scene.add(m);
      knots.push(m);
    });

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.35, metalness: 0.6 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    scene.add(floor);

    const size = renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(size.clone(), 0.6, 0.3, 0.7);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const params = { glöd: 1.4, rotation: 0.4 };
    gui.add(bloom, 'strength', 0, 3, 0.01).name('styrka');
    gui.add(bloom, 'radius', 0, 1, 0.01).name('radie');
    gui.add(bloom, 'threshold', 0, 1, 0.01).name('tröskel');
    gui.add(params, 'glöd', 0, 6, 0.1).onChange((v) => knots.forEach((k) => (k.material.emissiveIntensity = v)));
    gui.add(renderer, 'toneMappingExposure', 0.2, 3, 0.01).name('exponering');
    gui.add(params, 'rotation', 0, 2, 0.01);

    return {
      update(dt) {
        knots.forEach((k, i) => {
          k.rotation.x += dt * params.rotation * (1 + i * 0.1);
          k.rotation.y += dt * params.rotation * 0.7;
        });
      },
      render() {
        composer.render();
      },
      resize(w, h) {
        composer.setSize(w, h);
      },
      dispose() {
        bloom.dispose();
        composer.dispose();
      },
    };
  },
};
