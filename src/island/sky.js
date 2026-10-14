import * as THREE from 'three';
import { makeRng } from './util.js';
import { noiseGLSL } from './glsl.js';

// Atmosfär enligt Nishita (enkel spridning med raymarching), samma konstanter i GLSL och JS.
const R_PLANET = 6371e3;
const R_ATMOS = 6471e3;
const K_RLH = [5.5e-6, 13.0e-6, 22.4e-6];
const K_MIE = 21e-6;
const SH_RLH = 8e3;
const SH_MIE = 1.2e3;
const G_MIE = 0.758;
const I_SUN = 22;
const VIEW_HEIGHT = 6372e3;

const atmosphereGLSL = /* glsl */ `
#define PI_A 3.141592653589793
vec2 rsi(vec3 r0, vec3 rd, float sr) {
  float a = dot(rd, rd);
  float b = 2.0 * dot(rd, r0);
  float c = dot(r0, r0) - sr * sr;
  float d = b * b - 4.0 * a * c;
  if (d < 0.0) return vec2(1e5, -1e5);
  return vec2((-b - sqrt(d)) / (2.0 * a), (-b + sqrt(d)) / (2.0 * a));
}
vec3 atmosphere(vec3 r, vec3 r0, vec3 pSun) {
  const int iSteps = 16;
  const int jSteps = 8;
  const float rPlanet = ${R_PLANET.toFixed(1)};
  const float rAtmos = ${R_ATMOS.toFixed(1)};
  const vec3 kRlh = vec3(${K_RLH.map((v) => v.toExponential()).join(', ')});
  const float kMie = ${K_MIE.toExponential()};
  const float shRlh = ${SH_RLH.toFixed(1)};
  const float shMie = ${SH_MIE.toFixed(1)};
  const float g = ${G_MIE};
  vec2 p = rsi(r0, r, rAtmos);
  if (p.x > p.y) return vec3(0.0);
  p.y = min(p.y, rsi(r0, r, rPlanet).x);
  float iStepSize = (p.y - p.x) / float(iSteps);
  float iTime = 0.0;
  vec3 totalRlh = vec3(0.0);
  vec3 totalMie = vec3(0.0);
  float iOdRlh = 0.0;
  float iOdMie = 0.0;
  float mu = dot(r, pSun);
  float mumu = mu * mu;
  float gg = g * g;
  float pRlh = 3.0 / (16.0 * PI_A) * (1.0 + mumu);
  float pMie = 3.0 / (8.0 * PI_A) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * g, 1.5) * (2.0 + gg));
  for (int i = 0; i < iSteps; i++) {
    vec3 iPos = r0 + r * (iTime + iStepSize * 0.5);
    float iHeight = length(iPos) - rPlanet;
    float odStepRlh = exp(-iHeight / shRlh) * iStepSize;
    float odStepMie = exp(-iHeight / shMie) * iStepSize;
    iOdRlh += odStepRlh;
    iOdMie += odStepMie;
    float jStepSize = rsi(iPos, pSun, rAtmos).y / float(jSteps);
    float jTime = 0.0;
    float jOdRlh = 0.0;
    float jOdMie = 0.0;
    for (int j = 0; j < jSteps; j++) {
      vec3 jPos = iPos + pSun * (jTime + jStepSize * 0.5);
      float jHeight = length(jPos) - rPlanet;
      jOdRlh += exp(-jHeight / shRlh) * jStepSize;
      jOdMie += exp(-jHeight / shMie) * jStepSize;
      jTime += jStepSize;
    }
    vec3 attn = exp(-(kMie * (iOdMie + jOdMie) + kRlh * (iOdRlh + jOdRlh)));
    totalRlh += odStepRlh * attn;
    totalMie += odStepMie * attn;
    iTime += iStepSize;
  }
  return ${I_SUN.toFixed(1)} * (pRlh * kRlh * totalRlh + pMie * kMie * totalMie);
}
`;

function rsi(r0, rd, sr) {
  const a = rd[0] * rd[0] + rd[1] * rd[1] + rd[2] * rd[2];
  const b = 2 * (rd[0] * r0[0] + rd[1] * r0[1] + rd[2] * r0[2]);
  const c = r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2] - sr * sr;
  const d = b * b - 4 * a * c;
  if (d < 0) return [1e5, -1e5];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)];
}

// JS-version för himmelsfärger som styr dimma, omgivningsljus och moln.
export function atmosphereJS(dir, sun, iSteps = 12, jSteps = 6) {
  const r = [dir.x, dir.y, dir.z];
  const ps = [sun.x, sun.y, sun.z];
  const r0 = [0, VIEW_HEIGHT, 0];
  const p = rsi(r0, r, R_ATMOS);
  if (p[0] > p[1]) return new THREE.Color(0, 0, 0);
  p[1] = Math.min(p[1], rsi(r0, r, R_PLANET)[0]);
  const iStep = (p[1] - p[0]) / iSteps;
  let iTime = 0;
  const tR = [0, 0, 0];
  const tM = [0, 0, 0];
  let odR = 0;
  let odM = 0;
  const mu = r[0] * ps[0] + r[1] * ps[1] + r[2] * ps[2];
  const gg = G_MIE * G_MIE;
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const pM =
    ((3 / (8 * Math.PI)) * ((1 - gg) * (mu * mu + 1))) / (Math.pow(1 + gg - 2 * mu * G_MIE, 1.5) * (2 + gg));
  for (let i = 0; i < iSteps; i++) {
    const t = iTime + iStep * 0.5;
    const ip = [r0[0] + r[0] * t, r0[1] + r[1] * t, r0[2] + r[2] * t];
    const ih = Math.hypot(ip[0], ip[1], ip[2]) - R_PLANET;
    const sR = Math.exp(-ih / SH_RLH) * iStep;
    const sM = Math.exp(-ih / SH_MIE) * iStep;
    odR += sR;
    odM += sM;
    const jStep = rsi(ip, ps, R_ATMOS)[1] / jSteps;
    let jR = 0;
    let jM = 0;
    for (let j = 0; j < jSteps; j++) {
      const jt = jStep * (j + 0.5);
      const jh = Math.hypot(ip[0] + ps[0] * jt, ip[1] + ps[1] * jt, ip[2] + ps[2] * jt) - R_PLANET;
      jR += Math.exp(-jh / SH_RLH) * jStep;
      jM += Math.exp(-jh / SH_MIE) * jStep;
    }
    for (let k = 0; k < 3; k++) {
      const attn = Math.exp(-(K_MIE * (odM + jM) + K_RLH[k] * (odR + jR)));
      tR[k] += sR * attn;
      tM[k] += sM * attn;
    }
    iTime += iStep;
  }
  return new THREE.Color(
    I_SUN * (pR * K_RLH[0] * tR[0] + pM * K_MIE * tM[0]),
    I_SUN * (pR * K_RLH[1] * tR[1] + pM * K_MIE * tM[1]),
    I_SUN * (pR * K_RLH[2] * tR[2] + pM * K_MIE * tM[2]),
  );
}

// Transmittans från marken mot solen: ger solljusets färg (vitt mitt på dagen, rött vid horisonten).
export function sunTransmittance(sun) {
  const ps = [sun.x, Math.max(sun.y, -0.2), sun.z];
  const r0 = [0, VIEW_HEIGHT, 0];
  if (rsi(r0, ps, R_PLANET)[0] > 0) return new THREE.Color(0, 0, 0);
  const len = rsi(r0, ps, R_ATMOS)[1];
  const steps = 24;
  const ds = len / steps;
  let odR = 0;
  let odM = 0;
  for (let i = 0; i < steps; i++) {
    const t = ds * (i + 0.5);
    const h = Math.hypot(r0[0] + ps[0] * t, r0[1] + ps[1] * t, r0[2] + ps[2] * t) - R_PLANET;
    odR += Math.exp(-h / SH_RLH) * ds;
    odM += Math.exp(-h / SH_MIE) * ds;
  }
  return new THREE.Color(
    Math.exp(-(K_RLH[0] * odR + K_MIE * 1.1 * odM)),
    Math.exp(-(K_RLH[1] * odR + K_MIE * 1.1 * odM)),
    Math.exp(-(K_RLH[2] * odR + K_MIE * 1.1 * odM)),
  );
}

// 3D-brus för molnen: r = Perlin-Worley (grundform), g = Worley-fbm (detalj). Tileable.
function createCloudNoise(size = 64, seed = 3) {
  const rng = makeRng(seed);
  const N3 = size * size * size;

  function worley(cells) {
    const pts = new Float32Array(cells * cells * cells * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = rng();
    const out = new Float32Array(N3);
    let k = 0;
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = ((x + 0.5) / size) * cells;
          const py = ((y + 0.5) / size) * cells;
          const pz = ((z + 0.5) / size) * cells;
          const cx = Math.floor(px);
          const cy = Math.floor(py);
          const cz = Math.floor(pz);
          let best = 1e9;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                const nz = cz + dz;
                const wx = ((nx % cells) + cells) % cells;
                const wy = ((ny % cells) + cells) % cells;
                const wz = ((nz % cells) + cells) % cells;
                const idx = ((wz * cells + wy) * cells + wx) * 3;
                const fx = nx + pts[idx] - px;
                const fy = ny + pts[idx + 1] - py;
                const fz = nz + pts[idx + 2] - pz;
                const d = fx * fx + fy * fy + fz * fz;
                if (d < best) best = d;
              }
            }
          }
          out[k++] = 1 - Math.min(1, Math.sqrt(best));
        }
      }
    }
    return out;
  }

  // Tileable gradientbrus i 3D.
  function perlin(period) {
    const grads = new Float32Array(period * period * period * 3);
    for (let i = 0; i < grads.length / 3; i++) {
      const th = rng() * Math.PI * 2;
      const zc = rng() * 2 - 1;
      const r = Math.sqrt(1 - zc * zc);
      grads[i * 3] = r * Math.cos(th);
      grads[i * 3 + 1] = r * Math.sin(th);
      grads[i * 3 + 2] = zc;
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const out = new Float32Array(N3);
    let k = 0;
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = (x / size) * period;
          const py = (y / size) * period;
          const pz = (z / size) * period;
          const ix = Math.floor(px);
          const iy = Math.floor(py);
          const iz = Math.floor(pz);
          const fx = px - ix;
          const fy = py - iy;
          const fz = pz - iz;
          let sum = 0;
          for (let c = 0; c < 8; c++) {
            const ox = c & 1;
            const oy = (c >> 1) & 1;
            const oz = (c >> 2) & 1;
            const gi =
              ((((iz + oz) % period) * period + ((iy + oy) % period)) * period + ((ix + ox) % period)) * 3;
            const dot = grads[gi] * (fx - ox) + grads[gi + 1] * (fy - oy) + grads[gi + 2] * (fz - oz);
            const w = (ox ? fade(fx) : 1 - fade(fx)) * (oy ? fade(fy) : 1 - fade(fy)) * (oz ? fade(fz) : 1 - fade(fz));
            sum += dot * w;
          }
          out[k++] = sum;
        }
      }
    }
    return out;
  }

  const p1 = perlin(4);
  const p2 = perlin(8);
  const p3 = perlin(16);
  const w1 = worley(4);
  const w2 = worley(8);
  const w3 = worley(16);
  const w4 = worley(32);

  const data = new Uint8Array(N3 * 4);
  for (let i = 0; i < N3; i++) {
    const per = (p1[i] * 0.6 + p2[i] * 0.3 + p3[i] * 0.15) * 0.9 + 0.5;
    const wLow = w1[i] * 0.625 + w2[i] * 0.25 + w3[i] * 0.125;
    // Perlin-Worley: perlinbruset formas av Worley-cellerna så att molnen blir bulliga.
    let pw = per + (wLow - 1) * 0.55 + 0.25;
    pw = Math.min(1, Math.max(0, (pw - 0.15) / 0.85));
    const detail = w2[i] * 0.25 + w3[i] * 0.45 + w4[i] * 0.3;
    data[i * 4] = Math.round(pw * 255);
    data[i * 4 + 1] = Math.round(detail * 255);
    data[i * 4 + 2] = Math.round(w1[i] * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // alltid längst bort
}
`;

const skyFragment = /* glsl */ `
precision highp sampler3D;
uniform vec3 uSunDir;
uniform vec3 uSunTrans;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyAmbient;
uniform vec3 uHorizon;
uniform float uNight;
uniform float uStorm;
uniform float uFlash;
uniform float uCoverage;
uniform float uCloudDensity;
uniform float uCloudSpeed;
uniform float uCloudSteps;
uniform float uCloudsOn;
uniform float uTime;
uniform vec2 uWindDir;
uniform sampler3D uNoise;
varying vec3 vDir;

${noiseGLSL}
${atmosphereGLSL}

#define CLOUD_BOTTOM 1300.0
#define CLOUD_TOP 2900.0

float remap(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}
float hg(float mu, float g) {
  float gg = g * g;
  return (1.0 - gg) / (4.0 * 3.14159265 * pow(1.0 + gg - 2.0 * g * mu, 1.5));
}

// textureLod i stället för texture: utan explicit LOD kräver texturuppslag i loopar derivator,
// och då vecklar ANGLE/D3D (Windows) ut hela raymarch-loopen, vilket kan göra kompileringen mycket långsam.
float cloudDensity(vec3 p, bool cheap) {
  float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
  if (h < 0.0 || h > 1.0) return 0.0;
  vec3 wind = vec3(uWindDir.x, 0.0, uWindDir.y) * uTime * uCloudSpeed;
  vec3 q = p + wind;
  float weather = textureLod(uNoise, vec3(q.xz * 0.00004, 0.37), 0.0).b;
  float cov = clamp(uCoverage + (weather - 0.5) * 0.7, 0.0, 1.0);
  float base = textureLod(uNoise, q * 0.00017, 0.0).r;
  // Platt botten, rundad topp (cumulus).
  float shape = smoothstep(0.0, 0.1, h) * smoothstep(1.0, 0.35 + 0.45 * cov, h);
  float d = remap(base * shape, 1.0 - cov, 1.0, 0.0, 1.0);
  if (d <= 0.0) return 0.0;
  if (!cheap) {
    float detail = textureLod(uNoise, q * 0.0012 + vec3(0.0, uTime * 0.004, 0.0), 0.0).g;
    d = remap(d, (1.0 - detail) * 0.32 * (1.0 - h * 0.4), 1.0, 0.0, 1.0);
  }
  return clamp(d, 0.0, 1.0) * uCloudDensity;
}

vec4 renderClouds(vec3 ro, vec3 rd) {
  if (rd.y < 0.02) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = (CLOUD_BOTTOM - ro.y) / rd.y;
  float t1 = (CLOUD_TOP - ro.y) / rd.y;
  if (t0 > 45000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  t1 = min(t1, t0 + 9000.0);
  float steps = uCloudSteps;
  float dt = (t1 - t0) / steps;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))) + uTime * 0.618);
  float t = t0 + dt * jitter;
  vec3 col = vec3(0.0);
  float T = 1.0;
  float mu = dot(rd, uLightDir);
  float phase = mix(hg(mu, 0.65), hg(mu, -0.2), 0.35);
  for (int i = 0; i < 96; i++) {
    if (float(i) >= steps || T < 0.02) break;
    vec3 p = ro + rd * t;
    float d = cloudDensity(p, false);
    if (d > 0.002) {
      float ld = 0.0;
      float ls = 55.0;
      vec3 lp = p;
      for (int j = 0; j < 5; j++) {
        lp += uLightDir * ls;
        ld += cloudDensity(lp, true) * ls;
        ls *= 1.7;
      }
      float sigma = 0.035;
      // Beer + mjukare multipel spridning + powder-effekt i kanterna.
      float beer = max(exp(-ld * sigma), exp(-ld * sigma * 0.25) * 0.7);
      float powder = 1.0 - exp(-d * 6.0);
      float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
      vec3 sunL = uLightColor * beer * phase * 16.0 * mix(0.6, 1.0, powder);
      vec3 amb = uSkyAmbient * mix(1.0, 2.2, h) + uFlash * vec3(1.5, 1.6, 2.0);
      float Tstep = exp(-d * sigma * dt);
      col += T * (sunL + amb) * (1.0 - Tstep);
      T *= Tstep;
    }
    t += dt;
  }
  float fade = exp(-t0 * 0.000055);
  col = mix(uHorizon * (1.0 - T), col, fade);
  return vec4(col, T);
}

void main() {
  vec3 rd = normalize(vDir);
  vec3 rdA = normalize(vec3(rd.x, max(rd.y, 0.0) + 0.0005, rd.z));
  vec3 sky = atmosphere(rdA, vec3(0.0, ${VIEW_HEIGHT.toFixed(1)}, 0.0), uSunDir);

  sky += vec3(0.003, 0.006, 0.014) * (1.0 + 2.0 * pow(1.0 - max(rd.y, 0.0), 3.0)) * uNight;
  if (uNight > 0.01) {
    vec3 sp = rd * 260.0;
    vec3 cell = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float h = hash13(cell);
    float star = step(0.9965, h) * smoothstep(0.14, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 100.0);
    sky += vec3(0.9, 0.95, 1.0) * star * tw * 4.0 * uNight * smoothstep(0.0, 0.15, rd.y);
    float md = dot(rd, -uSunDir);
    float moon = smoothstep(0.99935, 0.99955, md);
    float crater = 0.8 + 0.2 * fbm2(rd.xz * 900.0);
    sky += vec3(1.0, 0.97, 0.9) * moon * 3.0 * crater * uNight;
    sky += vec3(0.15, 0.2, 0.32) * pow(max(md, 0.0), 300.0) * uNight;
  }

  float sd = dot(rd, uSunDir);
  sky += uSunTrans * smoothstep(0.99955, 0.99975, sd) * 80.0 * (1.0 - uStorm);

  float lum = dot(sky, vec3(0.3, 0.5, 0.2));
  sky = mix(sky, vec3(lum) * vec3(0.55, 0.6, 0.68), uStorm * 0.85);
  sky = mix(sky, uHorizon, smoothstep(0.03, -0.05, rd.y));

  if (uCloudsOn > 0.5) {
    vec4 cl = renderClouds(vec3(cameraPosition.x, 40.0, cameraPosition.z), rd);
    sky = sky * cl.a + cl.rgb;
  }
  sky += uFlash * vec3(0.55, 0.6, 0.8) * 1.2 * smoothstep(-0.1, 0.4, rd.y);
  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createSky(globals) {
  const noise = createCloudNoise(64);
  const uniforms = {
    uSunDir: globals.uSunDir,
    uSunTrans: { value: new THREE.Color() },
    uLightDir: globals.uLightDir,
    uLightColor: { value: new THREE.Color() },
    uSkyAmbient: globals.uSkyAmbient,
    uHorizon: globals.uHorizon,
    uNight: globals.uNight,
    uStorm: globals.uStorm,
    uFlash: globals.uFlash,
    uCoverage: { value: 0.42 },
    uCloudDensity: { value: 0.9 },
    uCloudSpeed: { value: 12 },
    uCloudSteps: { value: 56 },
    uCloudsOn: { value: 1 },
    uTime: globals.uTime,
    uWindDir: globals.uWindDir,
    uNoise: { value: noise },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const geo = new THREE.SphereGeometry(4000, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  // Separat himmel för reflektioner/IBL: färre molnsteg, renderas i en cubemap.
  const envMaterial = material.clone();
  envMaterial.uniforms = { ...uniforms, uCloudSteps: { value: 20 } };
  const envMesh = new THREE.Mesh(geo, envMaterial);
  envMesh.frustumCulled = false;
  const envScene = new THREE.Scene();
  envScene.add(envMesh);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true });
  cubeRT.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const cubeCam = new THREE.CubeCamera(1, 10000, cubeRT);
  envScene.add(cubeCam);
  let pmrem = null;
  let envRT = null;

  function updateEnvironment(renderer, scene) {
    cubeCam.update(renderer, envScene);
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromCubemap(cubeRT.texture);
    scene.environment = next.texture;
    if (envRT) envRT.dispose();
    envRT = next;
  }

  return { mesh, uniforms, envCube: cubeRT.texture, updateEnvironment };
}
