import * as THREE from 'three';
import { makeRng, smoothstep } from './util.js';
import { noiseGLSL, windGLSL, terrainGLSL } from './glsl.js';

function quadGeometry(count, seedFn) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = seedFn();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  return geo;
}

export function createWeather(globals) {
  const rng = makeRng(77);
  const group = new THREE.Group();
  const shared = {
    uTime: globals.uTime,
    uWindDir: globals.uWindDir,
    uWindStrength: globals.uWindStrength,
    uHeightMap: globals.uHeightMap,
    uTerrainSize: globals.uTerrainSize,
    uTerrainRes: globals.uTerrainRes,
    uSkyAmbient: globals.uSkyAmbient,
    uLightColor: globals.uLightColor,
    uFlash: globals.uFlash,
    uRainAmount: globals.uRain,
  };

  // Fallande regn: strimmor orienterade längs hastigheten (gravitation + vind).
  const rainUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(rainUniforms, shared, { uBox: { value: new THREE.Vector3(50, 28, 50) } });
  const rain = new THREE.Mesh(
    quadGeometry(26000, rng),
    new THREE.ShaderMaterial({
      uniforms: rainUniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        ${windGLSL}
        ${terrainGLSL}
        attribute vec4 aSeed;
        uniform float uRainAmount;
        uniform vec3 uBox;
        varying float vA;
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          if (aSeed.w > uRainAmount) {
            vA = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec3 vel = vec3(uWindDir.x * uWindStrength * 7.0, -13.0 - aSeed.w * 3.0, uWindDir.y * uWindStrength * 7.0);
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          p = mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5 + cameraPosition;
          float ground = max(sampleTerrain(p.xz).r, 0.0);
          vA = step(ground, p.y) * 0.3;
          vec3 axis = normalize(vel);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(axis, toCam));
          float len = 0.55 + aSeed.w * 0.35;
          vec3 wp = p + side * position.x * 0.016 + axis * position.y * len;
          vUv = vec2(position.x + 0.5, position.y);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSkyAmbient;
        uniform vec3 uLightColor;
        uniform float uFlash;
        varying float vA;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          float a = vA * (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.4, vUv.y);
          vec3 col = uSkyAmbient * 3.0 + uLightColor * 0.25 + vec3(uFlash * 2.0);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }`,
    }),
  );
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  group.add(rain);

  // Stänk där dropparna träffar marken eller vattnet.
  const splashUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(splashUniforms, shared);
  const splashes = new THREE.Mesh(
    quadGeometry(3000, rng),
    new THREE.ShaderMaterial({
      uniforms: splashUniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        ${noiseGLSL}
        ${terrainGLSL}
        uniform float uTime;
        uniform float uRainAmount;
        attribute vec4 aSeed;
        varying float vA;
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          if (aSeed.w > uRainAmount) {
            vA = 0.0;
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          float cyc = uTime * 2.4 + aSeed.x * 10.0;
          float idx = floor(cyc);
          float life = fract(cyc);
          vec2 r2 = vec2(hash12(vec2(idx, aSeed.y * 100.0)), hash12(vec2(aSeed.z * 100.0, idx)));
          vec2 xz = cameraPosition.xz + (r2 - 0.5) * 36.0;
          float y = max(sampleTerrain(xz).r, 0.0) + 0.02;
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float size = 0.08 + life * 0.2;
          vec3 p = vec3(xz.x, y, xz.y) + camRight * position.x * size * 2.0 + vec3(0.0, position.y * size * 0.8, 0.0);
          vA = (1.0 - life) * 0.45;
          vUv = vec2(position.x + 0.5, position.y);
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSkyAmbient;
        uniform float uFlash;
        varying float vA;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          vec2 d = vec2(vUv.x - 0.5, vUv.y) * vec2(2.0, 1.0);
          float r = length(d);
          float crown = smoothstep(1.0, 0.7, r) * smoothstep(0.3, 0.6, r);
          gl_FragColor = vec4(uSkyAmbient * 3.5 + vec3(uFlash * 2.0), crown * vA);
          #include <fog_fragment>
        }`,
    }),
  );
  splashes.frustumCulled = false;
  splashes.renderOrder = 5;
  group.add(splashes);

  // Blixtstråle: tunt rör längs en sicksackbana långt bort.
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 32, 40), fog: false });
  let bolt = null;
  function makeBolt(center) {
    if (bolt) {
      group.remove(bolt);
      bolt.geometry.dispose();
    }
    const pts = [];
    const ang = rng() * Math.PI * 2;
    const dist = 900 + rng() * 900;
    let p = new THREE.Vector3(center.x + Math.cos(ang) * dist, 1300, center.z + Math.sin(ang) * dist);
    pts.push(p.clone());
    while (p.y > 0) {
      p = p.clone().add(new THREE.Vector3((rng() - 0.5) * 120, -60 - rng() * 60, (rng() - 0.5) * 120));
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
    bolt = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, 3.5, 4, false), boltMat);
    bolt.frustumCulled = false;
    group.add(bolt);
  }

  const state = {
    rainTarget: 0,
    rain: 0,
    wet: 0,
    lightning: true,
    flash: 0,
    nextFlash: 3,
    flicker: 0,
  };

  function update(dt, camera) {
    state.rain += (state.rainTarget - state.rain) * Math.min(1, dt * 0.35);
    const wetTarget = state.rain > 0.12 ? 1 : 0;
    const rate = wetTarget > state.wet ? 0.15 : 0.025; // blött fort, torkar långsamt
    state.wet += (wetTarget - state.wet) * Math.min(1, dt * rate);
    globals.uRain.value = state.rain;
    globals.uWet.value = state.wet;
    globals.uStorm.value = smoothstep(0.05, 0.85, state.rain);

    if (state.lightning && state.rain > 0.55) {
      state.nextFlash -= dt;
      if (state.nextFlash <= 0) {
        state.flash = 1;
        state.flicker = 0.12 + rng() * 0.1;
        state.nextFlash = 4 + rng() * 9;
        makeBolt(camera.position);
      }
    }
    if (state.flicker > 0) {
      state.flicker -= dt;
      if (state.flicker <= 0 && rng() < 0.7) state.flash = 0.8;
    }
    state.flash = Math.max(0, state.flash - dt * 4.5);
    globals.uFlash.value = state.flash * (0.75 + 0.25 * Math.sin(performance.now() * 0.08));
    if (bolt) bolt.visible = state.flash > 0.25;
  }

  return { group, state, update, rain, splashes };
}
