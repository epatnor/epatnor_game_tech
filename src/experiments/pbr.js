import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export default {
  id: 'pbr',
  title: 'PBR & skuggor',
  description:
    'Ett rutnät av MeshStandardMaterial där metalness ökar åt höger och roughness uppåt. Miljöljus från RoomEnvironment via PMREM, plus en riktad sol med mjuka skuggor.',
  setup({ renderer, scene, camera, controls, gui }) {
    renderer.shadowMap.enabled = true;
    // Smala skärmar (mobil) behöver backa kameran för att få plats med hela rutnätet.
    camera.position.set(0, 5, camera.aspect < 1 ? 12 / camera.aspect : 12);
    controls.target.set(0, 2, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.background = new THREE.Color(0x10141b);
    scene.environmentIntensity = 0.6;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a303b, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const sphereGeo = new THREE.SphereGeometry(0.42, 64, 32);
    const N = 6;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const mat = new THREE.MeshStandardMaterial({
          color: 0xd9a066,
          metalness: i / (N - 1),
          roughness: Math.max(0.04, j / (N - 1)),
        });
        const s = new THREE.Mesh(sphereGeo, mat);
        s.position.set((i - (N - 1) / 2) * 1.05, 0.6 + j * 1.0, 0);
        s.castShadow = true;
        s.receiveShadow = true;
        scene.add(s);
      }
    }

    const sun = new THREE.DirectionalLight(0xfff1dd, 2.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun, sun.target);

    const params = { azimut: 35, höjd: 50, exponering: 1, miljöljus: 0.6, skuggor: true };
    const placeSun = () => {
      const az = THREE.MathUtils.degToRad(params.azimut);
      const el = THREE.MathUtils.degToRad(params.höjd);
      sun.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(15);
    };
    placeSun();

    gui.add(params, 'azimut', -180, 180, 1).onChange(placeSun);
    gui.add(params, 'höjd', 5, 90, 1).onChange(placeSun);
    gui.add(sun, 'intensity', 0, 6, 0.1).name('solstyrka');
    gui.add(params, 'miljöljus', 0, 2, 0.01).onChange((v) => (scene.environmentIntensity = v));
    gui.add(params, 'exponering', 0.2, 2.5, 0.01).onChange((v) => (renderer.toneMappingExposure = v));
    gui.add(params, 'skuggor').onChange((v) => (sun.castShadow = v));
  },
};
