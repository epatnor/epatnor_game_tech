import * as THREE from 'three';

export default {
  id: 'instancing',
  title: 'Instancing',
  description:
    'Ett InstancedMesh ritar tiotusentals kuber i ett enda draw call. Varje kub får egen matris och färg, och höjden animeras som en våg över rutnätet varje bildruta.',
  setup({ scene, camera, controls, gui }) {
    camera.position.set(30, 28, 30);
    controls.target.set(0, 0, 0);
    scene.background = new THREE.Color(0x0b0e13);
    scene.fog = new THREE.Fog(0x0b0e13, 40, 110);

    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1410, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 20, 5);
    scene.add(sun);

    const params = { sida: 120, våghöjd: 3, våglängd: 0.18, hastighet: 1.5 };
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 });
    let mesh = null;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const build = () => {
      if (mesh) {
        scene.remove(mesh);
        mesh.dispose();
      }
      const side = params.sida;
      mesh = new THREE.InstancedMesh(geo, mat, side * side);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < side * side; i++) {
        const x = (i % side) / side;
        const z = Math.floor(i / side) / side;
        color.setHSL(0.48 + 0.25 * x - 0.1 * z, 0.65, 0.55);
        mesh.setColorAt(i, color);
      }
      scene.add(mesh);
      countCtrl?.updateDisplay();
    };

    const info = { instanser: '' };
    let countCtrl = null;
    gui.add(params, 'sida', 10, 300, 10).name('kuber per sida').onFinishChange(build);
    countCtrl = gui.add(info, 'instanser').disable();
    gui.add(params, 'våghöjd', 0, 8, 0.1);
    gui.add(params, 'våglängd', 0.02, 0.6, 0.01);
    gui.add(params, 'hastighet', 0, 5, 0.1);
    build();

    return {
      update(dt, t) {
        const side = params.sida;
        const half = side / 2;
        const k = params.våglängd;
        for (let i = 0; i < side * side; i++) {
          const gx = (i % side) - half;
          const gz = Math.floor(i / side) - half;
          const r = Math.hypot(gx, gz);
          const h = 1 + params.våghöjd * (0.5 + 0.5 * Math.sin(r * k - t * params.hastighet));
          dummy.position.set(gx * 0.5, h / 2, gz * 0.5);
          dummy.scale.set(0.5, h, 0.5);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        info.instanser = (side * side).toLocaleString('sv-SE');
        countCtrl.updateDisplay();
      },
      dispose() {
        mesh?.dispose();
      },
    };
  },
};
