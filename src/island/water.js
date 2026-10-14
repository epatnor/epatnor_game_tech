import * as THREE from 'three';
import { noiseGLSL, rippleGLSL, terrainGLSL } from './glsl.js';

// Radiellt rutnät: tätt nära kameran, glesare längre bort.
function createOceanGeometry(rings = 190, segs = 200) {
  const positions = [0, 0, 0];
  for (let i = 1; i <= rings; i++) {
    const r = 1.1 * i + 0.00042 * i * i * i;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const b0 = 1 + i * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, a0 + s1, b0 + s);
      idx.push(a0 + s1, b0 + s1, b0 + s);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(idx);
  return geo;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;
uniform float uWaveScale;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vWaveH;
varying float vDepth;
${terrainGLSL}
#include <fog_pars_vertex>

vec3 gerstner(vec4 wave, vec3 p, inout vec3 tangent, inout vec3 binormal) {
  float steep = wave.z;
  float k = 6.2831853 / wave.w;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(wave.xy);
  float f = k * (dot(d, p.xz) - c * uTime);
  float a = steep / k;
  float sf = sin(f);
  float cf = cos(f);
  tangent += vec3(-d.x * d.x * steep * sf, d.x * steep * cf, -d.x * d.y * steep * sf);
  binormal += vec3(-d.x * d.y * steep * sf, d.y * steep * cf, -d.y * d.y * steep * sf);
  return vec3(d.x * a * cf, a * sf, d.y * a * cf);
}

void main() {
  vec3 p = vec3(position.x + uCenter.x, 0.0, position.z + uCenter.y);
  float depth = max(0.0, -sampleTerrain(p.xz).r);
  float damp = mix(0.12, 1.0, smoothstep(0.5, 12.0, depth)) * uWaveScale;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 disp = vec3(0.0);
  disp += gerstner(vec4(1.0, 0.6, 0.15 * damp, 46.0), p, tangent, binormal);
  disp += gerstner(vec4(0.7, 1.0, 0.13 * damp, 27.0), p, tangent, binormal);
  disp += gerstner(vec4(-0.4, 1.0, 0.11 * damp, 15.0), p, tangent, binormal);
  disp += gerstner(vec4(0.9, -0.3, 0.09 * damp, 8.5), p, tangent, binormal);
  disp += gerstner(vec4(0.2, 0.9, 0.07 * damp, 5.0), p, tangent, binormal);
  vec3 wp = p + disp;
  vWorld = wp;
  vWaveH = disp.y;
  vDepth = depth;
  vNormalW = normalize(cross(binormal, tangent));
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyAmbient;
uniform float uRain;
uniform float uStorm;
uniform samplerCube uEnv;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoamColor;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vWaveH;
varying float vDepth;
${noiseGLSL}
${rippleGLSL}
#include <fog_pars_fragment>

float waterH(vec2 uv, vec2 flow) {
  return fbm2(uv * 0.35 + flow * 0.5) + 0.5 * fbm2(uv * 1.15 - flow);
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 uv = vWorld.xz;
  vec2 flow = uWindDir * uTime * 0.6;

  // Detaljnormaler från brus, svagare på avstånd för att undvika flimmer.
  float e = 0.1;
  float h0 = waterH(uv, flow);
  float hx = waterH(uv + vec2(e, 0.0), flow);
  float hz = waterH(uv + vec2(0.0, e), flow);
  float strength = 0.45 * (0.35 + uWindStrength) / (1.0 + dist * 0.025);
  vec3 N = normalize(vNormalW + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * strength);
  if (uRain > 0.01) {
    vec2 rip = rainRipples(uv * 1.3, uTime * 1.2) * uRain / (1.0 + dist * 0.05);
    N = normalize(N + vec3(-rip.x, 0.0, -rip.y) * 0.6);
  }

  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = textureCube(uEnv, R).rgb;

  vec3 L = uLightDir;
  float depthF = exp(-vDepth * 0.16);
  vec3 body = mix(uDeep, uShallow, depthF);
  body = mix(body, vec3(0.86, 0.78, 0.58), exp(-vDepth * 0.8) * 0.55);
  float wrap = max(dot(N, L), 0.0) * 0.5 + 0.5;
  vec3 col = body * (uLightColor * wrap * 0.3 + uSkyAmbient * 1.3);

  // Ljus som lyser genom vågkammarna (stiliserad subsurface).
  float sss = pow(max(dot(-V, L), 0.0), 4.0) * max(vWaveH + 0.5, 0.0);
  col += uShallow * uLightColor * sss * 0.6;

  col = mix(col, refl, F);

  float rl = max(dot(R, L), 0.0);
  col += uLightColor * (pow(rl, 1200.0) * 40.0 + pow(rl, 120.0) * 0.5) * (1.0 - uStorm);

  // Skum: strandlinje i band, vågkammar och kontaktlinje.
  float shore = 1.0 - smoothstep(0.0, 1.8, vDepth);
  float foamN = fbm2(uv * 1.7 + uTime * 0.15);
  float bands = 0.5 + 0.5 * sin(vDepth * 5.0 - uTime * 1.7 + fbm2(uv * 0.4) * 5.0);
  float foam = shore * smoothstep(0.38, 0.72, bands * foamN + shore * 0.45);
  foam = max(foam, smoothstep(0.75, 1.25, vWaveH + foamN * 0.6) * 0.75);
  foam = max(foam, smoothstep(0.18, 0.0, vDepth) * smoothstep(0.2, 0.5, foamN));
  vec3 foamLit = uFoamColor * (uLightColor * max(dot(N, L), 0.0) * 0.9 + uSkyAmbient * 2.2);
  col = mix(col, foamLit, clamp(foam, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createWater(globals, envCube) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, {
    uTime: globals.uTime,
    uCenter: { value: new THREE.Vector2() },
    uWaveScale: { value: 1 },
    uHeightMap: globals.uHeightMap,
    uTerrainSize: globals.uTerrainSize,
    uTerrainRes: globals.uTerrainRes,
    uWindDir: globals.uWindDir,
    uWindStrength: globals.uWindStrength,
    uLightDir: globals.uLightDir,
    uLightColor: globals.uLightColor,
    uSkyAmbient: globals.uSkyAmbient,
    uRain: globals.uRain,
    uStorm: globals.uStorm,
    uEnv: { value: envCube },
    uShallow: { value: new THREE.Color(0x3fd6c6) },
    uDeep: { value: new THREE.Color(0x0b3f6e) },
    uFoamColor: { value: new THREE.Color(0xf4fbff) },
  });
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(createOceanGeometry(), material);
  mesh.frustumCulled = false;

  return {
    mesh,
    uniforms,
    update(camera) {
      // Rutnätet följer kameran i steg så att närområdet alltid är tätt.
      uniforms.uCenter.value.set(Math.round(camera.position.x / 4) * 4, Math.round(camera.position.z / 4) * 4);
    },
  };
}
