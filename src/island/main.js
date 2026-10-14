import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import './island.css';
import { createTerrain, TERRAIN_SIZE, TERRAIN_RES } from './terrain.js';
import { createSky, atmosphereJS, sunTransmittance } from './sky.js';
import { createWater } from './water.js';
import { createVegetation } from './vegetation.js';
import { createWeather } from './weather.js';
import { createProps } from './props.js';
import { createPlayer } from './player.js';
import { createPost } from './post.js';
import { smoothstep } from './util.js';

const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const step = async (text) => {
  loadingText.textContent = text;
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
};

// Delade uniforms: alla shaders pekar på samma objekt, så en ändring här slår igenom överallt.
const globals = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 0.6 },
  uWet: { value: 0 },
  uRain: { value: 0 },
  uStorm: { value: 0 },
  uFlash: { value: 0 },
  uNight: { value: 0 },
  uHeightMap: { value: null },
  uTerrainSize: { value: TERRAIN_SIZE },
  uTerrainRes: { value: TERRAIN_RES },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  uLightDirView: { value: new THREE.Vector3() },
  uLightColor: { value: new THREE.Color() },
  uSkyAmbient: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uPlayer: { value: new THREE.Vector3() },
};

async function main() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9fb8d0, 0.0016);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 9000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.5;
  controls.maxDistance = 45;
  controls.maxPolarAngle = Math.PI * 0.53;

  await step('Formar terrängen…');
  const terrain = createTerrain(globals);
  scene.add(terrain.mesh);

  await step('Bygger lägret och bryggan…');
  const props = createProps(globals, terrain);
  scene.add(props.group);

  await step('Planterar skog, palmer och gräs…');
  const veg = createVegetation(globals, terrain, props.reserved);
  scene.add(veg.group);

  await step('Genererar molnbrus…');
  const sky = createSky(globals);
  scene.add(sky.mesh);

  await step('Fyller havet…');
  const water = createWater(globals, sky.envCube);
  scene.add(water.mesh);

  const weather = createWeather(globals);
  scene.add(weather.group);

  // Ljus: sol/måne med skuggor som följer spelaren, plus fyllnadsljus för natt och blixtar.
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -65;
  sc.right = 65;
  sc.top = 65;
  sc.bottom = -65;
  sc.near = 1;
  sc.far = 450;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8899bb, 0x223018, 0);
  scene.add(hemi);

  await step('Väcker hjälten…');
  const player = createPlayer({
    scene,
    camera,
    controls,
    terrain,
    colliders: [...veg.colliders, ...props.colliders],
    floorAt: props.floorAt,
    spawn: props.spawn,
    spawnYaw: props.spawnYaw,
    globals,
  });

  const settings = {
    time: 17.4,
    timeSpeed: 0,
    exposure: 0.9,
    grass: true,
    pixelRatio: Math.min(window.devicePixelRatio, 1.5),
  };

  const post = createPost(renderer, scene, camera, {
    hideForAO: (hide) => {
      sky.mesh.visible = !hide;
      water.mesh.visible = !hide;
      veg.grass.mesh.visible = !hide && settings.grass;
      veg.leaves.visible = !hide;
      weather.group.visible = !hide;
    },
    hideForRays: (hide) => {
      sky.mesh.visible = !hide;
      veg.grass.mesh.visible = !hide && settings.grass;
      veg.leaves.visible = !hide;
      weather.group.visible = !hide;
    },
  });

  // --- Dygn och himmel ---
  // Solbanan vrids så att kvällssolen syns snett framför kameran vid start.
  const viewDir = new THREE.Vector2(-terrain.shoreDir.x, -terrain.shoreDir.y);
  const sunsetDir = viewDir.clone().rotateAround(new THREE.Vector2(), 0.6);
  const sunAzimuth = Math.atan2(sunsetDir.y, sunsetDir.x) - Math.PI;
  const tilt = 0.45;

  const sunDir = globals.uSunDir.value;
  const lightDir = globals.uLightDir.value;
  const tmp = new THREE.Vector3();
  const sunTrans = new THREE.Color();
  const lightColor = new THREE.Color();
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const grey = new THREE.Color();
  let daylight = 1;
  let lastEnv = { dir: new THREE.Vector3(9, 9, 9), cov: -1, storm: -1, time: 0 };

  function updateSky(force = false) {
    const th = ((settings.time - 6) / 24) * Math.PI * 2;
    tmp.set(Math.cos(th), Math.sin(th) * Math.cos(tilt), Math.sin(th) * Math.sin(tilt));
    sunDir.copy(tmp).applyAxisAngle(new THREE.Vector3(0, 1, 0), -sunAzimuth);
    const storm = globals.uStorm.value;
    const elev = sunDir.y;
    daylight = smoothstep(-0.05, 0.1, elev);
    const night = 1 - smoothstep(-0.2, 0.0, elev);
    globals.uNight.value = night;

    sunTrans.copy(sunTransmittance(sunDir));
    zenith.copy(atmosphereJS(new THREE.Vector3(0, 1, 0), sunDir));
    horizon.setRGB(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      horizon.add(atmosphereJS(new THREE.Vector3(Math.cos(a), 0.06, Math.sin(a)).normalize(), sunDir));
    }
    horizon.multiplyScalar(0.25);
    const nightAmb = new THREE.Color(0.012, 0.018, 0.035);
    zenith.lerp(grey.setScalar((zenith.r + zenith.g + zenith.b) / 3).multiplyScalar(0.5), storm * 0.8);
    horizon.lerp(grey.setRGB(0.55, 0.6, 0.68).multiplyScalar(((horizon.r + horizon.g + horizon.b) / 3) * 0.8), storm * 0.85);
    globals.uSkyAmbient.value.copy(zenith).add(nightAmb.clone().multiplyScalar(night));
    globals.uHorizon.value.copy(horizon).add(nightAmb.clone().multiplyScalar(night * 0.6));
    scene.fog.color.copy(globals.uHorizon.value);
    scene.fog.density = 0.0014 + storm * 0.0045;

    // Solen på dagen, månen (motsatt riktning) på natten.
    let intensity;
    if (elev > -0.04) {
      lightDir.copy(sunDir);
      lightColor.copy(sunTrans);
      intensity = 3.4 * daylight * (1 - 0.85 * storm);
      sky.uniforms.uLightColor.value.copy(sunTrans).multiplyScalar(daylight * (1 - storm * 0.6));
    } else {
      lightDir.copy(sunDir).negate();
      lightColor.setRGB(0.55, 0.66, 1.0);
      intensity = 0.4 * night * (1 - 0.7 * storm);
      sky.uniforms.uLightColor.value.setRGB(0.55, 0.66, 1.0).multiplyScalar(0.05 * night);
    }
    if (lightDir.y < 0.02) lightDir.y = 0.02;
    lightDir.normalize();
    sun.color.copy(lightColor);
    sun.intensity = intensity;
    globals.uLightColor.value.copy(lightColor).multiplyScalar(intensity);
    sky.uniforms.uSunTrans.value.copy(sunTrans);
    hemi.color.setRGB(0.4, 0.5, 0.75);
    hemi.intensity = night * 0.35 + globals.uFlash.value * 4;

    renderer.toneMappingExposure = settings.exposure * (1 + night * 1.6);

    // Uppdatera reflektioner och IBL när himlen ändrats märkbart.
    const cov = sky.uniforms.uCoverage.value;
    const now = performance.now();
    if (
      force ||
      lastEnv.dir.distanceTo(sunDir) > 0.01 ||
      Math.abs(lastEnv.cov - cov) > 0.02 ||
      (Math.abs(lastEnv.storm - storm) > 0.02 && now - lastEnv.time > 500)
    ) {
      sky.updateEnvironment(renderer, scene);
      lastEnv = { dir: sunDir.clone(), cov, storm, time: now };
    }
  }

  // --- HUD och inställningar ---
  const counter = document.getElementById('crystals');
  const toast = document.getElementById('toast');
  counter.textContent = `0 / ${props.crystalCount}`;
  let toastTimer = 0;
  const showToast = (text) => {
    toast.textContent = text;
    toast.hidden = false;
    toastTimer = 3.5;
  };

  const gui = new GUI({ title: 'Inställningar' });
  if (window.innerWidth < 700) gui.close();
  const presets = {
    'Gyllene timme': () => setPreset(17.4, 0),
    Middag: () => setPreset(12.5, 0),
    Solnedgång: () => setPreset(18.25, 0),
    Natt: () => setPreset(22.5, 0),
    Oväder: () => setPreset(15.5, 1),
  };
  function setPreset(time, rain) {
    settings.time = time;
    weather.state.rainTarget = rain;
    sky.uniforms.uCoverage.value = rain > 0.5 ? 0.75 : 0.42;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
  const fPre = gui.addFolder('Förinställningar');
  Object.keys(presets).forEach((k) => fPre.add(presets, k));
  const fTime = gui.addFolder('Tid och himmel');
  fTime.add(settings, 'time', 0, 24, 0.01).name('klockslag').listen();
  fTime.add(settings, 'timeSpeed', 0, 1, 0.01).name('timmar per sekund');
  fTime.add(settings, 'exposure', 0.3, 2, 0.01).name('exponering');
  const fWeather = gui.addFolder('Väder');
  fWeather.add(weather.state, 'rainTarget', 0, 1, 0.01).name('regn');
  fWeather.add(sky.uniforms.uCoverage, 'value', 0, 1, 0.01).name('molntäcke');
  fWeather.add(sky.uniforms.uCloudDensity, 'value', 0.1, 2, 0.01).name('molndensitet');
  fWeather.add(weather.state, 'lightning').name('blixtar');
  const wind = { riktning: (Math.atan2(globals.uWindDir.value.y, globals.uWindDir.value.x) * 180) / Math.PI };
  const fWind = gui.addFolder('Vind');
  fWind.add(wind, 'riktning', -180, 180, 1).onChange((v) => {
    const a = (v * Math.PI) / 180;
    globals.uWindDir.value.set(Math.cos(a), Math.sin(a));
  });
  fWind.add(globals.uWindStrength, 'value', 0, 2, 0.01).name('styrka');
  const fGfx = gui.addFolder('Grafik');
  fGfx
    .add(settings, 'pixelRatio', 0.5, 2, 0.05)
    .name('renderupplösning')
    .onFinishChange((v) => {
      renderer.setPixelRatio(v);
      onResize();
    });
  fGfx.add(sky.uniforms.uCloudsOn, 'value', { på: 1, av: 0 }).name('volymetriska moln');
  fGfx.add(sky.uniforms.uCloudSteps, 'value', 16, 96, 1).name('molnsteg');
  fGfx.add(post.gtao, 'enabled').name('GTAO');
  fGfx.add(post.settings, 'rays', 0, 1.5, 0.01).name('ljusstrålar');
  fGfx.add(post.bloom, 'strength', 0, 1.5, 0.01).name('bloom');
  fGfx.add(sun, 'castShadow').name('skuggor');
  fGfx.add(settings, 'grass').name('gräs').onChange((v) => (veg.grass.mesh.visible = v));
  fGfx.add(veg.grass.uniforms.uGrassHeight, 'value', 0.3, 2, 0.01).name('gräshöjd');
  fGfx.add(post.grade.uniforms.uSaturation, 'value', 0, 2, 0.01).name('mättnad');
  fGfx.close();
  fWind.close();

  const stats = document.getElementById('stats');

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // Kompilera en shader i taget, så att laddningsskärmen hinner visa framsteg mellan varje.
  // En shader som kompileras synkront blockerar huvudtråden, så räknaren står still under just den.
  player.update(0, 0);
  controls.update();
  camera.updateMatrixWorld();
  const jobs = [{ label: 'himmel för reflektioner', run: () => updateSky(true) }];
  const seen = new Set();
  scene.traverse((obj) => {
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const key = mats.map((m) => m.uuid).join() + (obj.isInstancedMesh ? ':i' : '');
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push({ label: mats[0].name || 'övrigt', run: () => renderer.compileAsync(obj, camera, scene) });
  });
  jobs.push({
    label: 'skuggor och efterbehandling',
    run: () => {
      renderer.shadowMap.needsUpdate = true;
      post.composer.render(0);
    },
  });
  const compileStart = performance.now();
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    loadingText.textContent = `Kompilerar shaders ${i + 1} av ${jobs.length}: ${job.label}`;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const t0 = performance.now();
    await Promise.race([job.run(), new Promise((r) => setTimeout(r, 20000))]);
    const ms = performance.now() - t0;
    if (ms > 300) console.info(`Shader "${job.label}" tog ${Math.round(ms)} ms`);
  }
  console.info(`${jobs.length} kompileringssteg klara på ${Math.round(performance.now() - compileStart)} ms`);

  const timer = new THREE.Timer();
  timer.connect(document);
  let frames = 0;
  let fpsTime = 0;
  const shadowTarget = new THREE.Vector3();

  function tick(timestamp) {
    timer.update(timestamp);
    const dt = Math.min(timer.getDelta(), 0.05);
    globals.uTime.value += dt;
    const t = globals.uTime.value;

    if (settings.timeSpeed > 0) settings.time = (settings.time + settings.timeSpeed * dt) % 24;
    weather.update(dt, camera);
    updateSky();

    player.update(dt, t);
    controls.update();
    player.clampCamera();
    camera.updateMatrixWorld();

    sky.mesh.position.copy(camera.position);
    water.update(camera);
    veg.grass.uniforms.uGrassCenter.value.set(player.position.x, player.position.z);

    shadowTarget.set(Math.round(player.position.x), Math.round(player.position.y), Math.round(player.position.z));
    sun.target.position.copy(shadowTarget);
    sun.position.copy(shadowTarget).addScaledVector(lightDir, 220);
    globals.uLightDirView.value.copy(lightDir).transformDirection(camera.matrixWorldInverse);

    props.update(dt, t, player.position, (n, total) => {
      counter.textContent = `${n} / ${total}`;
      showToast(n === total ? 'Alla kristaller funna! Ön är din.' : `Kristall funnen (${n} av ${total})`);
    });
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.hidden = true;
    }

    post.update(sunDir, sunTrans, daylight, sky.uniforms.uCoverage.value);
    post.grade.uniforms.uFlash.value = globals.uFlash.value;

    renderer.shadowMap.needsUpdate = true;
    post.composer.render(dt);

    frames++;
    fpsTime += dt;
    if (fpsTime > 0.5) {
      const hh = Math.floor(settings.time);
      const mm = Math.floor((settings.time % 1) * 60);
      stats.textContent = `${Math.round(frames / fpsTime)} fps · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      frames = 0;
      fpsTime = 0;
    }
  }

  loading.hidden = true;
  renderer.setAnimationLoop(tick);
  window.__island = { settings, weather, sky, globals, player, veg };
}

main().catch((err) => {
  console.error(err);
  loadingText.textContent = `Något gick fel: ${err.message}`;
});
