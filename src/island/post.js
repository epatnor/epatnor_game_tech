import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Ljusstrålar i skärmrymd: scenen renderas svart mot vit himmel i halv upplösning,
// sedan samplas ljuset radiellt mot solens position på skärmen.
class GodRaysPass extends Pass {
  constructor(scene, camera, hide) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.hide = hide;
    this.occRT = new THREE.WebGLRenderTarget(256, 256);
    this.black = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tOcc: { value: null },
        uSun: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color() },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tOcc;
        uniform vec2 uSun;
        uniform float uAspect;
        uniform float uIntensity;
        uniform vec3 uColor;
        varying vec2 vUv;
        #define SAMPLES 64
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          if (uIntensity <= 0.0) { gl_FragColor = base; return; }
          vec2 delta = (vUv - uSun) / float(SAMPLES) * 0.95;
          vec2 uv = vUv;
          float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          uv -= delta * jitter;
          float illum = 0.0;
          float decay = 1.0;
          for (int i = 0; i < SAMPLES; i++) {
            uv -= delta;
            float s = texture2D(tOcc, uv).r;
            s *= smoothstep(0.55, 0.0, length((uv - uSun) * vec2(uAspect, 1.0)));
            illum += s * decay;
            decay *= 0.965;
          }
          illum /= float(SAMPLES);
          gl_FragColor = vec4(base.rgb + uColor * illum * uIntensity, base.a);
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.occRT.setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    this.material.uniforms.uAspect.value = w / h;
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.material.uniforms.uIntensity.value > 0) {
      const oldClear = renderer.getClearColor(new THREE.Color());
      const oldAlpha = renderer.getClearAlpha();
      const oldBg = this.scene.background;
      this.hide(true);
      this.scene.overrideMaterial = this.black;
      this.scene.background = null;
      renderer.setRenderTarget(this.occRT);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      this.scene.overrideMaterial = null;
      this.scene.background = oldBg;
      this.hide(false);
      renderer.setClearColor(oldClear, oldAlpha);
    }
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tOcc.value = this.occRT.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.12 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.35 },
    uShadowTint: { value: new THREE.Color(0.93, 0.97, 1.06) },
    uHighTint: { value: new THREE.Color(1.05, 1.0, 0.94) },
    uFlash: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uFlash;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c *= mix(uShadowTint, uHighTint, smoothstep(0.0, 1.0, l));
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * dot(d, d) * 1.6;
      c += uFlash * vec3(0.75, 0.8, 1.0) * 0.12;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { hideForAO, hideForRays }) {
  const composer = new EffectComposer(renderer);
  composer.renderTarget1.samples = 4;
  composer.renderTarget2.samples = 4;
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  // Dölj objekt som inte passar AO-passets egna material (förskjutna i shadern eller genomskinliga).
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (...args) => {
    hideForAO(true);
    gtaoRender(...args);
    hideForAO(false);
  };
  composer.addPass(gtao);

  const rays = new GodRaysPass(scene, camera, hideForRays);
  composer.addPass(rays);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.55, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const sunScreen = new THREE.Vector3();
  return {
    composer,
    gtao,
    rays,
    bloom,
    grade,
    settings: { rays: 0.55 },
    update(sunDir, sunColor, daylight, coverage) {
      sunScreen.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      const inFront = sunScreen.z < 1 ? 1 : 0;
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sunScreen.x), Math.abs(sunScreen.y)), 1.0, 1.8);
      rays.material.uniforms.uSun.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
      rays.material.uniforms.uColor.value.copy(sunColor);
      rays.material.uniforms.uIntensity.value =
        this.settings.rays * inFront * onScreen * daylight * (1 - coverage * 0.7) * 1.4;
    },
    setSize(w, h) {
      composer.setSize(w, h);
    },
  };
}
