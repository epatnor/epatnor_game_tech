import * as THREE from 'three';

const WATER_SWIM_DEPTH = -1.1;

function buildHero() {
  const mat = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
  const skin = mat(0xf1c27d, 0.6);
  const tunic = mat(0xb03a2e);
  const pants = mat(0x5a3e2b);
  const boots = mat(0x2e2420, 0.8);
  const hair = mat(0x3b2a1a, 0.9);
  const capeMat = mat(0x1f6f78, 0.85, { side: THREE.DoubleSide });
  const leather = mat(0x7a4b2a);
  const metal = new THREE.MeshStandardMaterial({ color: 0xd5dde2, metalness: 0.9, roughness: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, material, x, y, z) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  add(body, new THREE.CapsuleGeometry(0.27, 0.42, 6, 14), tunic, 0, 1.2, 0);
  add(body, new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), leather, 0, 1.0, 0);
  add(body, new THREE.BoxGeometry(0.1, 0.08, 0.04), gold, 0, 1.0, 0.3);
  const head = new THREE.Group();
  head.position.set(0, 1.74, 0);
  body.add(head);
  add(head, new THREE.SphereGeometry(0.26, 24, 16), skin, 0, 0, 0);
  const hairCap = add(head, new THREE.SphereGeometry(0.275, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.02);
  hairCap.rotation.x = -0.35;
  const eyeMat = mat(0x1a1a1a, 0.3);
  add(head, new THREE.SphereGeometry(0.035, 8, 6), eyeMat, -0.09, 0.02, 0.235);
  add(head, new THREE.SphereGeometry(0.035, 8, 6), eyeMat, 0.09, 0.02, 0.235);
  add(head, new THREE.SphereGeometry(0.04, 8, 6), skin, 0, -0.05, 0.26);

  const limb = (parent, x, y, len, rad, material, endMat, endGeo) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    parent.add(pivot);
    add(pivot, new THREE.CapsuleGeometry(rad, len - rad * 2, 4, 10), material, 0, -len / 2, 0);
    if (endMat) add(pivot, endGeo, endMat, 0, -len, 0.03);
    return pivot;
  };
  const legL = limb(body, -0.12, 0.9, 0.78, 0.1, pants, boots, new THREE.BoxGeometry(0.17, 0.12, 0.28));
  const legR = limb(body, 0.12, 0.9, 0.78, 0.1, pants, boots, new THREE.BoxGeometry(0.17, 0.12, 0.28));
  const armL = limb(body, -0.36, 1.48, 0.62, 0.08, tunic, skin, new THREE.SphereGeometry(0.08, 10, 8));
  const armR = limb(body, 0.36, 1.48, 0.62, 0.08, tunic, skin, new THREE.SphereGeometry(0.08, 10, 8));

  // Mantel som fladdrar med fart och vind.
  const cape = new THREE.Group();
  cape.position.set(0, 1.52, -0.24);
  body.add(cape);
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.05, 1, 6);
  capeGeo.translate(0, -0.52, 0);
  add(cape, capeGeo, capeMat, 0, 0, 0);

  // Svärd på ryggen.
  const sword = new THREE.Group();
  sword.position.set(0.05, 1.25, -0.3);
  sword.rotation.z = 0.6;
  body.add(sword);
  add(sword, new THREE.BoxGeometry(0.07, 0.85, 0.02), metal, 0, 0.1, 0);
  add(sword, new THREE.BoxGeometry(0.28, 0.05, 0.05), gold, 0, -0.33, 0);
  add(sword, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), leather, 0, -0.46, 0);
  add(sword, new THREE.SphereGeometry(0.045, 8, 6), gold, 0, -0.58, 0);

  return { root, body, head, legL, legR, armL, armR, cape };
}

function createInput() {
  const keys = new Set();
  const state = { x: 0, y: 0, run: false, jump: false, touch: false };
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // Joystick för pekskärmar.
  let joy = null;
  if (matchMedia('(pointer: coarse)').matches) {
    joy = document.createElement('div');
    joy.id = 'joystick';
    joy.innerHTML = '<div class="knob"></div>';
    document.body.appendChild(joy);
    const jump = document.createElement('button');
    jump.id = 'jump';
    jump.textContent = 'Hoppa';
    document.body.appendChild(jump);
    jump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      state.jumpTouch = true;
    });
    const knob = joy.querySelector('.knob');
    let id = null;
    const move = (t) => {
      const r = joy.getBoundingClientRect();
      const dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.min(1, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      state.jx = Math.cos(a) * len;
      state.jy = -Math.sin(a) * len;
      knob.style.transform = `translate(${state.jx * 35}px, ${-state.jy * 35}px)`;
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      id = e.changedTouches[0].identifier;
      move(e.changedTouches[0]);
    });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) move(t);
    });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          id = null;
          state.jx = 0;
          state.jy = 0;
          knob.style.transform = '';
        }
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
  }

  return () => {
    let x = 0;
    let y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (state.jx || state.jy) {
      x = state.jx;
      y = state.jy;
    }
    state.x = x;
    state.y = y;
    state.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(x, y) > 0.92 && !!(state.jx || state.jy);
    state.jump = keys.has('Space') || !!state.jumpTouch;
    state.jumpTouch = false;
    return state;
  };
}

export function createPlayer({ scene, camera, controls, terrain, colliders, floorAt, spawn, spawnYaw, globals }) {
  const hero = buildHero();
  scene.add(hero.root);
  const readInput = createInput();

  const pos = spawn.clone();
  pos.y = Math.max(terrain.getHeight(pos.x, pos.z), floorAt(pos.x, pos.z));
  const vel = new THREE.Vector3();
  let vy = 0;
  let grounded = true;
  let yaw = spawnYaw;
  let walkPhase = 0;
  let swimming = false;

  // Rutnät för kollisionsobjekt.
  const grid = new Map();
  const CELL = 8;
  for (const c of colliders) {
    const k = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(c);
  }
  function collide(p) {
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const c of list) {
          const ox = p.x - c.x;
          const oz = p.z - c.z;
          const d = Math.hypot(ox, oz);
          const min = c.r + 0.32;
          if (d < min && d > 1e-4) {
            p.x = c.x + (ox / d) * min;
            p.z = c.z + (oz / d) * min;
          }
        }
      }
    }
  }

  const groundAt = (x, z) => Math.max(terrain.getHeight(x, z), floorAt(x, z));

  // Kamera bakom hjälten.
  const behind = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-7);
  controls.target.set(pos.x, pos.y + 1.6, pos.z);
  camera.position.copy(controls.target).add(behind).add(new THREE.Vector3(0, 2.6, 0));
  controls.update();

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const next = new THREE.Vector3();

  function update(dt, t) {
    const input = readInput();
    fwd.copy(controls.target).sub(camera.position).setY(0).normalize();
    right.set(-fwd.z, 0, fwd.x);
    move.copy(fwd).multiplyScalar(input.y).addScaledVector(right, input.x);
    const amount = Math.min(1, move.length());
    if (amount > 0.01) move.normalize();

    const ground = groundAt(pos.x, pos.z);
    swimming = ground < WATER_SWIM_DEPTH;
    const speed = swimming ? 2.8 : input.run ? 8.5 : 4.3;
    const target = move.clone().multiplyScalar(speed * amount);
    vel.lerp(target, Math.min(1, dt * (grounded || swimming ? 10 : 2.5)));

    next.copy(pos).addScaledVector(vel, dt);
    collide(next);
    if (Math.hypot(next.x, next.z) > 300) next.copy(pos);
    // Stoppa vid för branta sluttningar.
    const nextGround = groundAt(next.x, next.z);
    const stepLen = Math.hypot(next.x - pos.x, next.z - pos.z);
    if (stepLen > 1e-4 && grounded && !swimming && (nextGround - ground) / stepLen > 1.4 && nextGround > pos.y + 0.3) {
      next.x = pos.x;
      next.z = pos.z;
    }
    const delta = next.clone().sub(pos);
    pos.x = next.x;
    pos.z = next.z;

    const g = groundAt(pos.x, pos.z);
    if (g < WATER_SWIM_DEPTH) {
      swimming = true;
      const surf = -1.15 + Math.sin(t * 2) * 0.05;
      pos.y += (surf - pos.y) * Math.min(1, dt * 6);
      vy = 0;
      grounded = false;
    } else {
      if (grounded && input.jump) {
        vy = 7.5;
        grounded = false;
      }
      vy -= 22 * dt;
      pos.y += vy * dt;
      if (pos.y <= g) {
        pos.y = g;
        vy = 0;
        grounded = true;
      } else if (grounded && pos.y - g < 0.5) {
        pos.y = g; // följ marken nedför
      } else {
        grounded = false;
      }
    }
    delta.y = 0;

    // Vänd hjälten mot rörelseriktningen.
    const horiz = Math.hypot(vel.x, vel.z);
    if (horiz > 0.3) {
      const targetYaw = Math.atan2(vel.x, vel.z);
      let d = targetYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 12);
    }
    hero.root.position.copy(pos);
    hero.root.rotation.y = yaw;

    // Animation.
    const runF = Math.min(1, horiz / 8.5);
    walkPhase += dt * (horiz * 1.6 + (swimming ? 3 : 0));
    const swing = Math.sin(walkPhase) * Math.min(1, horiz / 3) * (0.5 + runF * 0.4);
    if (swimming) {
      hero.armL.rotation.set(-Math.PI * 0.5 + Math.sin(walkPhase) * 0.9, 0, -0.3);
      hero.armR.rotation.set(-Math.PI * 0.5 - Math.sin(walkPhase) * 0.9, 0, 0.3);
      hero.legL.rotation.x = Math.sin(walkPhase * 2) * 0.4;
      hero.legR.rotation.x = -Math.sin(walkPhase * 2) * 0.4;
      hero.body.rotation.x = 0.5;
      hero.body.position.y = 0.1;
    } else {
      hero.legL.rotation.x = swing;
      hero.legR.rotation.x = -swing;
      hero.armL.rotation.set(-swing * 0.8, 0, -0.08);
      hero.armR.rotation.set(swing * 0.8, 0, 0.08);
      hero.body.rotation.x = runF * 0.15;
      const bob = Math.abs(Math.cos(walkPhase)) * 0.06 * Math.min(1, horiz / 3);
      const breathe = Math.sin(t * 2) * 0.01;
      hero.body.position.y = bob + breathe;
      if (!grounded) {
        hero.legL.rotation.x = 0.5;
        hero.legR.rotation.x = -0.3;
        hero.armL.rotation.x = -1.2;
        hero.armR.rotation.x = -1.2;
      }
    }
    const wind = globals.uWindStrength.value;
    hero.cape.rotation.x = 0.15 + runF * 0.9 + Math.sin(t * 6) * 0.05 * (0.5 + wind) + (grounded ? 0 : 0.4);
    hero.head.rotation.y = Math.sin(t * 0.5) * 0.15 * (1 - runF);

    // Kameran följer med samma förflyttning, så att orbit-läget behålls.
    camera.position.add(delta);
    controls.target.set(pos.x, pos.y + 1.6, pos.z);
    globals.uPlayer.value.copy(pos);
  }

  function clampCamera() {
    const h = Math.max(terrain.getHeight(camera.position.x, camera.position.z), 0) + 0.7;
    if (camera.position.y < h) camera.position.y = h;
  }

  return {
    update,
    clampCamera,
    position: pos,
    get swimming() {
      return swimming;
    },
  };
}
