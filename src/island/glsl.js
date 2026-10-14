// Delade GLSL-bitar. Varje shader inkluderar bara det den behöver,
// så att uniforms inte deklareras två gånger.

export const noiseGLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;

// Gemensamt vindfält: samma funktion används av gräs, träd, löv och regn.
export const windGLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
float windGust(vec2 p) {
  float s = dot(p, uWindDir);
  float c = dot(p, vec2(-uWindDir.y, uWindDir.x));
  return 0.55 + 0.45 * sin(s * 0.06 - uTime * 1.1) * sin(s * 0.017 + c * 0.03 - uTime * 0.43);
}
`;

// Ringar från regndroppar i ett rutnät av celler. Returnerar en normalstörning i xz.
// Kräver noiseGLSL.
export const rippleGLSL = /* glsl */ `
vec2 rainRipples(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 acc = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(float(x), float(y));
      vec3 h = hash32(c);
      float phase = fract(t * 0.9 + h.z);
      vec2 center = c + 0.5 + (h.xy - 0.5) * 0.7;
      vec2 d = p - center;
      float r = length(d);
      float ringR = phase * 0.9;
      float w = exp(-pow((r - ringR) * 12.0, 2.0)) * (1.0 - phase);
      acc += d / max(r, 1e-3) * w * sin((r - ringR) * 38.0);
    }
  }
  return acc;
}
`;

// Uppslag i terrängtexturen: r = höjd, g = gräs, b = skog, a = sand.
export const terrainGLSL = /* glsl */ `
uniform sampler2D uHeightMap;
uniform float uTerrainSize;
uniform float uTerrainRes;
vec4 sampleTerrain(vec2 xz) {
  vec2 uv = (xz / uTerrainSize + 0.5) * ((uTerrainRes - 1.0) / uTerrainRes) + 0.5 / uTerrainRes;
  return texture2D(uHeightMap, uv);
}
`;
