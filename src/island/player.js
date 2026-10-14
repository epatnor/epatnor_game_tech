import * as THREE from 'three';

const WATER_SWIM_DEPTH = -1.1;

export function buildHero() {
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

// Styrning som i World of Warcraft:
// höger musknapp + dra styr hjälten (vänder sig efter kameran), vänster + dra är fri mouselook,
// båda knapparna springer framåt, A/D svänger (strafe med höger knapp nedtryckt), Q/E strafe.
// På pekskärm: dra för att titta, joystick för att gå.
function createInput(dom) {
  const keys = new Set();
  const state = {
    camYaw: 0,
    pitch: 0.32,
    dist: 9,
    distTarget: 9,
    left: false,
    right: false,
    jx: 0,
    jy: 0,
    jumpTouch: false,
  };
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    state.left = state.right = false;
  });

  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  const touches = new Map();
  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') {
      if (e.button === 0) state.left = true;
      if (e.button === 2) state.right = true;
      dom.style.cursor = 'none';
    } else {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  });
  const release = (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) state.left = false;
      if (e.button === 2) state.right = false;
      if (!state.left && !state.right) dom.style.cursor = '';
    } else {
      touches.delete(e.pointerId);
    }
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);
  dom.addEventListener('pointermove', (e) => {
    let dx = 0;
    let dy = 0;
    if (e.pointerType === 'mouse') {
      if (!state.left && !state.right) return;
      dx = e.movementX;
      dy = e.movementY;
    } else {
      const t = touches.get(e.pointerId);
      if (!t) return;
      dx = e.clientX - t.x;
      dy = e.clientY - t.y;
      t.x = e.clientX;
      t.y = e.clientY;
    }
    state.camYaw -= dx * 0.005;
    state.pitch = Math.min(1.35, Math.max(-0.35, state.pitch + dy * 0.005));
  });
  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      state.distTarget = Math.min(40, Math.max(2.5, state.distTarget * Math.exp(e.deltaY * 0.0012)));
    },
    { passive: false },
  );

  // Joystick för pekskärmar.
  if (matchMedia('(pointer: coarse)').matches) {
    const joy = document.createElement('div');
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

  const input = { forward: 0, strafe: 0, turn: 0, walk: false, jump: false, steering: false, joystick: false };
  function read() {
    const k = (c) => keys.has(c);
    const ad = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    input.steering = state.right;
    input.forward = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    if (state.left && state.right) input.forward = 1;
    input.strafe = (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0);
    input.turn = 0;
    if (state.right) input.strafe = Math.max(-1, Math.min(1, input.strafe + ad));
    else input.turn = ad;
    input.walk = k('ShiftLeft') || k('ShiftRight');
    input.jump = k('Space') || state.jumpTouch;
    state.jumpTouch = false;
    input.joystick = !!(state.jx || state.jy);
    input.jx = state.jx;
    input.jy = state.jy;
    return input;
  }

  return { state, read };
}

export function createPlayer({ scene, camera, dom, terrain, colliders, floorAt, spawn, spawnYaw, globals }) {
  const hero = buildHero();
  scene.add(hero.root);
  const controls = createInput(dom);
  const cam = controls.state;

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

  // Kameran börjar bakom hjälten.
  cam.camYaw = yaw;
  const camTarget = new THREE.Vector3();

  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const next = new THREE.Vector3();

  function update(dt, t) {
    const input = controls.read();
    // Sväng med A/D (kameran följer med), eller vänd hjälten efter kameran med höger musknapp.
    if (input.steering) yaw = cam.camYaw;
    else if (input.turn) {
      const dyaw = -input.turn * 2.6 * dt;
      yaw += dyaw;
      cam.camYaw += dyaw;
    }
    let backward = false;
    if (input.joystick) {
      // Pekskärm: joysticken går relativt kameran och hjälten vänder sig åt rörelseriktningen.
      fwd.set(Math.sin(cam.camYaw), 0, Math.cos(cam.camYaw));
      right.set(-fwd.z, 0, fwd.x);
      move.copy(fwd).multiplyScalar(input.jy).addScaledVector(right, input.jx);
    } else {
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      right.set(-fwd.z, 0, fwd.x);
      move.copy(fwd).multiplyScalar(input.forward).addScaledVector(right, input.strafe);
      backward = input.forward < 0;
    }
    const amount = Math.min(1, move.length());
    if (amount > 0.01) move.normalize();

    const ground = groundAt(pos.x, pos.z);
    swimming = ground < WATER_SWIM_DEPTH;
    let speed = swimming ? 2.8 : input.walk ? 2.5 : 7;
    if (backward) speed *= 0.6;
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

    // Med joystick vänder sig hjälten mot rörelseriktningen; annars styr A/D och musen.
    const horiz = Math.hypot(vel.x, vel.z);
    if (input.joystick && horiz > 0.3) {
      const targetYaw = Math.atan2(vel.x, vel.z);
      let d = targetYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 12);
    }
    hero.root.position.copy(pos);
    hero.root.rotation.y = yaw;

    // Animation.
    const runF = Math.min(1, horiz / 7);
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

    // Kameran kretsar runt hjälten enligt kamerans vinkel, lutning och avstånd.
    cam.dist += (cam.distTarget - cam.dist) * Math.min(1, dt * 10);
    camTarget.set(pos.x, pos.y + 1.6, pos.z);
    const cp = Math.cos(cam.pitch);
    camera.position.set(
      camTarget.x - Math.sin(cam.camYaw) * cp * cam.dist,
      camTarget.y + Math.sin(cam.pitch) * cam.dist,
      camTarget.z - Math.cos(cam.camYaw) * cp * cam.dist,
    );
    clampCamera();
    camera.lookAt(camTarget);
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
    get yaw() {
      return yaw;
    },
    camera: cam,
    get swimming() {
      return swimming;
    },
  };
}
