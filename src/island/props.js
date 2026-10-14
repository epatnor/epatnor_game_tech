import * as THREE from 'three';
import { makeRng } from './util.js';
import { windGLSL } from './glsl.js';

const std = (color, roughness = 0.85, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function billboardGeometry(count, rng) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  return geo;
}

function createFire(globals, pos, rng) {
  const group = new THREE.Group();
  const flames = new THREE.Mesh(
    billboardGeometry(90, rng),
    new THREE.ShaderMaterial({
      name: 'eld',
      uniforms: { uTime: globals.uTime, uFirePos: { value: pos.clone() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFirePos;
        attribute vec4 aSeed;
        varying float vLife;
        varying vec2 vUv;
        varying float vSpark;
        void main() {
          float spark = step(0.86, aSeed.x);
          float speed = mix(0.9 + aSeed.x * 0.6, 0.5, spark);
          float life = fract(uTime * speed + aSeed.y);
          float rise = mix(1.6, 4.0, spark);
          vec3 p = uFirePos + vec3((aSeed.z - 0.5) * 0.55 * (1.0 - life), life * rise, (aSeed.w - 0.5) * 0.55 * (1.0 - life));
          p.x += sin(uTime * 5.0 + aSeed.x * 20.0) * mix(0.08, 0.5, spark) * life;
          p.z += cos(uTime * 4.0 + aSeed.w * 20.0) * mix(0.08, 0.5, spark) * life;
          float size = mix(mix(0.6, 0.12, life), 0.05, spark);
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          p += (camRight * position.x + camUp * position.y) * size;
          vLife = life;
          vUv = uv;
          vSpark = spark;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying vec2 vUv;
        varying float vSpark;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d) * (1.0 - vLife);
          vec3 col = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.22, 0.04), vLife) * mix(5.0, 9.0, vSpark);
          gl_FragColor = vec4(col * a, a);
        }`,
    }),
  );
  flames.frustumCulled = false;
  group.add(flames);

  // Rök som driver med samma vindfält som vegetationen.
  const smoke = new THREE.Mesh(
    billboardGeometry(40, rng),
    new THREE.ShaderMaterial({
      name: 'rök',
      uniforms: {
        uTime: globals.uTime,
        uWindDir: globals.uWindDir,
        uWindStrength: globals.uWindStrength,
        uFirePos: { value: pos.clone() },
        uSkyAmbient: globals.uSkyAmbient,
        uLightColor: globals.uLightColor,
      },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        ${windGLSL}
        uniform vec3 uFirePos;
        attribute vec4 aSeed;
        varying float vLife;
        varying vec2 vUv;
        void main() {
          float life = fract(uTime * 0.12 + aSeed.y);
          float t = life * 8.0;
          vec3 p = uFirePos + vec3(0.0, 1.2 + t * 0.9, 0.0);
          p.xz += uWindDir * uWindStrength * t * t * 0.35 * windGust(uFirePos.xz);
          p.xz += vec2(sin(t + aSeed.x * 6.0), cos(t * 0.8 + aSeed.z * 6.0)) * 0.3 * life;
          float size = mix(0.5, 3.0, life);
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          p += (camRight * position.x + camUp * position.y) * size;
          vLife = life;
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSkyAmbient;
        uniform vec3 uLightColor;
        varying float vLife;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * smoothstep(0.0, 0.1, vLife) * (1.0 - vLife) * 0.28;
          vec3 col = vec3(0.55) * (uSkyAmbient * 2.5 + uLightColor * 0.4);
          gl_FragColor = vec4(col, a);
        }`,
    }),
  );
  smoke.frustumCulled = false;
  group.add(smoke);

  const light = new THREE.PointLight(0xff8a3c, 40, 30, 2);
  light.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
  group.add(light);

  return {
    group,
    update(t) {
      light.intensity = 40 * (0.8 + 0.12 * Math.sin(t * 13) + 0.08 * Math.sin(t * 31 + 1.3));
    },
  };
}

function createFlag(globals) {
  const geo = new THREE.PlaneGeometry(1.8, 1.1, 18, 8);
  geo.translate(0.9, 0, 0);
  const mat = std(0x9e2b25, 0.8, { side: THREE.DoubleSide, name: 'flagga' });
  const inject = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uWindDir = globals.uWindDir;
    shader.uniforms.uWindStrength = globals.uWindStrength;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${windGLSL}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float u = position.x / 1.8;
      float g = windGust((modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz) * uWindStrength;
      transformed.z += sin(position.x * 3.0 - uTime * (4.0 + g * 6.0)) * 0.18 * u * (0.4 + g);
      transformed.y -= u * u * 0.5 * (1.0 - min(g, 1.0));`,
    );
  };
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => 'flag';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = inject;
  depth.customProgramCacheKey = () => 'flag-depth';
  const mesh = shadowed(new THREE.Mesh(geo, mat));
  mesh.customDepthMaterial = depth;
  return mesh;
}

function signTexture(lines) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8a6440';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(60,40,20,0.35)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 20 + i * 28);
    ctx.bezierCurveTo(170, 10 + i * 29, 340, 35 + i * 27, 512, 18 + i * 28);
    ctx.stroke();
  }
  ctx.fillStyle = '#2e1d0e';
  ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * 80));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createProps(globals, terrain) {
  const rng = makeRng(404);
  const group = new THREE.Group();
  const colliders = [];
  const reserved = [];
  const wood = std(0x8a6a48, 0.85);
  const darkWood = std(0x5c4430, 0.9);
  const stone = std(0x8f8c92, 0.9, { flatShading: true });

  // --- Läger ---
  const camp = terrain.camp;
  const campY = terrain.getHeight(camp.x, camp.y);
  const firePos = new THREE.Vector3(camp.x, campY + 0.15, camp.y);
  reserved.push({ x: camp.x, z: camp.y, r: 13 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + rng() * 0.08, 0), stone));
    s.position.set(firePos.x + Math.cos(a) * 0.75, campY + 0.1, firePos.z + Math.sin(a) * 0.75);
    s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    group.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const log = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 7), darkWood));
    log.position.copy(firePos).add(new THREE.Vector3(0, 0.25, 0));
    log.rotation.set(0.9, (i / 3) * Math.PI * 2, 0, 'YXZ');
    group.add(log);
  }
  colliders.push({ x: firePos.x, z: firePos.z, r: 1.0 });
  const fire = createFire(globals, firePos, rng);
  group.add(fire.group);

  // Sittstockar runt elden.
  for (let i = 0; i < 3; i++) {
    const a = 0.6 + i * 2.1;
    const lx = firePos.x + Math.cos(a) * 2.6;
    const lz = firePos.z + Math.sin(a) * 2.6;
    const log = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 1.8, 10), wood));
    log.position.set(lx, terrain.getHeight(lx, lz) + 0.22, lz);
    log.rotation.set(0, -a, Math.PI / 2, 'YXZ');
    group.add(log);
    colliders.push({ x: lx, z: lz, r: 0.6 });
  }

  // Tält.
  const tentPos = new THREE.Vector3(camp.x - 5.5, 0, camp.y - 3);
  tentPos.y = terrain.getHeight(tentPos.x, tentPos.z);
  const cloth = std(0xd9c7a0, 0.95, { side: THREE.DoubleSide });
  const tent = new THREE.Group();
  for (const sgn of [-1, 1]) {
    const panel = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), cloth));
    panel.rotation.set(0, 0, 0);
    panel.rotation.x = -Math.PI / 2 + sgn * 0.95;
    panel.position.set(0, 0.95, sgn * 0.62);
    tent.add(panel);
  }
  const ridge = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), darkWood));
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = 1.85;
  tent.add(ridge);
  tent.position.copy(tentPos);
  tent.rotation.y = 0.5;
  group.add(tent);
  colliders.push({ x: tentPos.x, z: tentPos.z, r: 1.7 });

  // Tunnor och lådor.
  const barrelMat = std(0x7a5534, 0.8);
  for (let i = 0; i < 3; i++) {
    const bx = camp.x + 4.5 + (i % 2) * 0.8;
    const bz = camp.y - 3.5 + i * 0.7;
    const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.32, 0.9, 12), barrelMat));
    b.position.set(bx, terrain.getHeight(bx, bz) + 0.45, bz);
    group.add(b);
    colliders.push({ x: bx, z: bz, r: 0.45 });
  }
  const crate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wood));
  crate.position.set(camp.x + 3.5, terrain.getHeight(camp.x + 3.5, camp.y - 5.5) + 0.35, camp.y - 5.5);
  crate.rotation.y = 0.4;
  group.add(crate);
  colliders.push({ x: crate.position.x, z: crate.position.z, r: 0.6 });

  // Flaggstång med flagga som rör sig med vinden.
  const poleX = camp.x + 6.5;
  const poleZ = camp.y + 2;
  const poleY = terrain.getHeight(poleX, poleZ);
  const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 8), darkWood));
  pole.position.set(poleX, poleY + 3, poleZ);
  group.add(pole);
  const flag = createFlag(globals);
  flag.position.set(poleX, poleY + 5.35, poleZ);
  group.add(flag);
  colliders.push({ x: poleX, z: poleZ, r: 0.3 });

  // --- Brygga ---
  const dir = new THREE.Vector3(terrain.shoreDir.x, 0, terrain.shoreDir.y);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const dockStart = new THREE.Vector3(terrain.shore.x, 0, terrain.shore.y).addScaledVector(dir, -2.5);
  const dockLen = 24;
  const deckY = 1.15;
  const yaw = Math.atan2(dir.x, dir.z);
  for (let d = 0; d < dockLen; d += 0.5) {
    const plank = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.44), (d * 2) % 3 ? wood : darkWood));
    const p = dockStart.clone().addScaledVector(dir, d);
    plank.position.set(p.x, deckY + (rng() - 0.5) * 0.02, p.z);
    plank.rotation.y = yaw + (rng() - 0.5) * 0.03;
    group.add(plank);
  }
  for (let d = 0; d <= dockLen; d += 3) {
    for (const sgn of [-1, 1]) {
      const p = dockStart.clone().addScaledVector(dir, d).addScaledVector(side, sgn * 1.1);
      const ground = terrain.getHeight(p.x, p.z);
      const h = deckY - ground + 0.3;
      const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, h, 8), darkWood));
      post.position.set(p.x, ground + h / 2 - 0.1, p.z);
      group.add(post);
    }
  }
  const dockEnd = dockStart.clone().addScaledVector(dir, dockLen - 1.5);
  for (let d = -2; d < dockLen; d += 4) {
    const p = dockStart.clone().addScaledVector(dir, d);
    reserved.push({ x: p.x, z: p.z, r: 3 });
  }

  // --- Vägskylt vid stranden ---
  const spawn = terrain.spawn;
  const signX = spawn.x + side.x * 2.5;
  const signZ = spawn.y + side.z * 2.5;
  const signY = terrain.getHeight(signX, signZ);
  const signPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8), darkWood));
  signPost.position.set(signX, signY + 1.2, signZ);
  group.add(signPost);
  const board = shadowed(
    new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.7, 0.06),
      [wood, wood, wood, wood, std(0xffffff, 0.8, { map: signTexture(['Azshara', 'Island']) }), wood],
    ),
  );
  board.position.set(signX, signY + 1.95, signZ);
  board.rotation.y = yaw;
  group.add(board);
  colliders.push({ x: signX, z: signZ, r: 0.3 });
  reserved.push({ x: spawn.x, z: spawn.y, r: 6 });

  // --- Kristaller ---
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x9feaff,
    emissive: 0x2bb8ff,
    emissiveIntensity: 2.2,
    roughness: 0.12,
    metalness: 0.1,
    flatShading: true,
    name: 'kristaller',
  });
  const spots = [];
  spots.push(new THREE.Vector3(terrain.peak.x, terrain.peak.y, terrain.peak.z));
  spots.push(new THREE.Vector3(dockEnd.x, deckY, dockEnd.z));
  spots.push(new THREE.Vector3(tentPos.x + 2.5, terrain.getHeight(tentPos.x + 2.5, tentPos.z + 3), tentPos.z + 3));
  for (const a of [0.5, 2.4, 4.3]) {
    let lastGood = 40;
    for (let r = 40; r < 220; r += 2) {
      if (terrain.getHeight(Math.cos(a) * r, Math.sin(a) * r) > 2) lastGood = r;
    }
    const r = Math.max(30, lastGood - 20);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    spots.push(new THREE.Vector3(x, terrain.getHeight(x, z), z));
  }
  const crystals = spots.map((s, i) => {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
    gem.scale.set(1, 1.8, 1);
    gem.castShadow = true;
    g.add(gem);
    for (let k = 0; k < 3; k++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), crystalMat);
      shard.scale.set(1, 2, 1);
      shard.position.set(Math.cos(k * 2.1) * 0.7, -0.5, Math.sin(k * 2.1) * 0.7);
      shard.rotation.set(Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4);
      g.add(shard);
    }
    const base = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), stone));
    base.position.y = -0.95;
    base.scale.y = 0.5;
    g.add(base);
    g.position.set(s.x, s.y + 1.35, s.z);
    group.add(g);
    if (i !== 1) reserved.push({ x: s.x, z: s.z, r: 3 });
    return { group: g, gem, collected: false, phase: i * 1.7 };
  });

  // Golv som spelaren kan stå på utöver terrängen (bryggan).
  function floorAt(x, z) {
    const rel = new THREE.Vector3(x - dockStart.x, 0, z - dockStart.z);
    const along = rel.dot(dir);
    const across = Math.abs(rel.dot(side));
    if (along > -0.3 && along < dockLen && across < 1.25) return deckY + 0.05;
    return -Infinity;
  }

  let collected = 0;
  function update(dt, t, playerPos, onCollect) {
    fire.update(t);
    for (const c of crystals) {
      if (c.collected) {
        c.group.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
        c.group.position.y += dt * 2;
        if (c.group.scale.x < 0.02) c.group.visible = false;
        continue;
      }
      c.gem.rotation.y += dt * 0.8;
      c.gem.position.y = Math.sin(t * 1.6 + c.phase) * 0.15;
      const dx = playerPos.x - c.group.position.x;
      const dz = playerPos.z - c.group.position.z;
      const dy = playerPos.y + 1 - c.group.position.y;
      if (dx * dx + dz * dz < 2.2 && Math.abs(dy) < 2.5) {
        c.collected = true;
        collected++;
        onCollect?.(collected, crystals.length);
      }
    }
    // Flaggan pekar med vinden.
    flag.rotation.y = Math.atan2(-globals.uWindDir.value.y, globals.uWindDir.value.x);
  }

  return {
    group,
    colliders,
    reserved,
    floorAt,
    update,
    firePos,
    crystalCount: crystals.length,
    spawn: new THREE.Vector3(spawn.x, terrain.getHeight(spawn.x, spawn.y), spawn.y),
    spawnYaw: yaw + Math.PI,
  };
}
