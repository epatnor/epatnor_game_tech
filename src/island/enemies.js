import * as THREE from 'three';
import { CharacterController } from '../characters/controller.js';
import { makeRng } from './util.js';

// Skelettfiender: enkel tillståndsmaskin per fiende.
// idle → (spelaren inom AGGRO) → chase → (inom ATTACK_RANGE) attack → … → return → idle
// dead: ligger kvar, sjunker ner och återuppstår vid sin startpunkt efter en stund.
const AGGRO = 14;
const LEASH = 38;
const ATTACK_RANGE = 1.7;
const VIEW_DISTANCE = 95;

export async function createEnemies({ scene, terrain, characterLoader, entries, player, count = 9, height = 1.85, onTarget }) {
  const rng = makeRng(31337);
  const spots = [];
  const spawn = player.position.clone();
  for (let tries = 0; tries < 4000 && spots.length < count; tries++) {
    const a = rng() * Math.PI * 2;
    const r = 30 + rng() * (terrain.islandRadius - 40);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = terrain.getHeight(x, z);
    if (h < 2 || h > 32) continue;
    if (1 - terrain.getNormal(x, z).y > 0.35) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < 45) continue;
    if (Math.hypot(x - terrain.camp.x, z - terrain.camp.y) < 22) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 16)) continue;
    spots.push(new THREE.Vector3(x, h, z));
  }

  const enemies = [];
  for (let i = 0; i < spots.length; i++) {
    const entry = entries[i % entries.length];
    const { root, clips } = await characterLoader.loadCharacter({ ...entry, height });
    const controller = new CharacterController(root, clips, { clipMap: entry.clipMap, walkSpeed: 1.4, runSpeed: 4 });
    if (entry.defaultWeapon && entry.weapons?.[entry.defaultWeapon]) {
      controller.attach('weapon', await characterLoader.loadProp(entry.weapons[entry.defaultWeapon]), 'handR');
    }
    if (entry.defaultOffhand && entry.offhand?.[entry.defaultOffhand]) {
      controller.attach('offhand', await characterLoader.loadProp(entry.offhand[entry.defaultOffhand]), 'handL');
    }
    const home = spots[i];
    root.position.copy(home);
    root.rotation.y = rng() * Math.PI * 2;
    scene.add(root);
    enemies.push({
      name: entry.name,
      root,
      controller,
      home,
      pos: home.clone(),
      yaw: root.rotation.y,
      maxHp: 100,
      hp: 100,
      state: 'idle',
      cooldown: 0,
      hitTimer: -1,
      deadTimer: 0,
    });
  }

  const tmp = new THREE.Vector3();

  function moveTowards(e, target, speed, dt) {
    tmp.subVectors(target, e.pos).setY(0);
    const dist = tmp.length();
    if (dist < 0.05) return dist;
    tmp.multiplyScalar(1 / dist);
    const step = Math.min(dist, speed * dt);
    const nx = e.pos.x + tmp.x * step;
    const nz = e.pos.z + tmp.z * step;
    // Gå inte ut i vattnet.
    if (terrain.getHeight(nx, nz) > 0.4) {
      e.pos.x = nx;
      e.pos.z = nz;
      player.collide?.(e.pos);
    }
    turnTowards(e, Math.atan2(tmp.x, tmp.z), dt);
    return dist;
  }

  function turnTowards(e, targetYaw, dt) {
    let d = targetYaw - e.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.yaw += d * Math.min(1, dt * 8);
  }

  function update(dt, camera) {
    const p = player.position;
    for (const e of enemies) {
      const toPlayer = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
      const fromHome = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      e.cooldown -= dt;

      if (e.state === 'dead') {
        e.deadTimer += dt;
        if (e.deadTimer > 10) e.pos.y -= dt * 0.25; // sjunker ner i marken
        if (e.deadTimer > 16) {
          // Återuppstår vid startpunkten.
          e.pos.copy(e.home);
          e.hp = e.maxHp;
          e.state = 'idle';
          e.deadTimer = 0;
          e.controller.revive();
          e.controller.play('Skeletons_Awaken_Standing', { once: true });
        }
      } else {
        const alive = !player.dead;
        if (e.state === 'idle' && alive && toPlayer < AGGRO) {
          e.state = 'chase';
          e.controller.play('Skeletons_Taunt', { once: true });
          onTarget?.(e);
        }
        if ((e.state === 'chase' || e.state === 'attack') && (!alive || fromHome > LEASH)) e.state = 'return';

        let speed = 0;
        if (e.state === 'chase') {
          if (toPlayer > ATTACK_RANGE) {
            if (!e.controller.oneShot) {
              moveTowards(e, p, 3.2, dt);
              speed = 3.2;
            }
          } else {
            e.state = 'attack';
          }
        }
        if (e.state === 'attack') {
          turnTowards(e, Math.atan2(p.x - e.pos.x, p.z - e.pos.z), dt);
          if (toPlayer > ATTACK_RANGE + 0.6) e.state = 'chase';
          else if (e.cooldown <= 0 && !e.controller.oneShot) {
            e.controller.trigger('attack');
            e.cooldown = 1.9;
            e.hitTimer = 0.5;
          }
        }
        if (e.state === 'return') {
          const d = moveTowards(e, e.home, 2.2, dt);
          speed = 2.2;
          if (d < 0.5) {
            e.state = 'idle';
            e.hp = e.maxHp;
            speed = 0;
          }
        }
        // Träffen räknas en bit in i hugget, och bara om spelaren fortfarande är nära.
        if (e.hitTimer >= 0) {
          e.hitTimer -= dt;
          if (e.hitTimer < 0 && toPlayer < ATTACK_RANGE + 0.5 && !player.dead) {
            player.takeDamage(9 + Math.floor(Math.random() * 6));
            onTarget?.(e);
          }
        }
        e.controller.setSpeed(speed);
        e.pos.y = terrain.getHeight(e.pos.x, e.pos.z);
      }

      // Håll isär fienderna.
      for (const o of enemies) {
        if (o === e || o.state === 'dead' || e.state === 'dead') continue;
        const dx = e.pos.x - o.pos.x;
        const dz = e.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0 && d < 1.1) {
          e.pos.x += (dx / d) * (1.1 - d) * 0.5;
          e.pos.z += (dz / d) * (1.1 - d) * 0.5;
        }
      }

      e.root.position.copy(e.pos);
      e.root.rotation.y = e.yaw;
      // Långt bort: göm och hoppa över animationen.
      const far = e.pos.distanceTo(camera.position) > VIEW_DISTANCE;
      e.root.visible = !far;
      if (!far) e.controller.update(dt);
    }
  }

  // Spelarens anfall: träffar fiender inom räckhåll i en kon framför hjälten.
  const fwd = new THREE.Vector3();
  function playerAttack(pos, yaw, { range = 2.6, damage = 34 } = {}) {
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    let hit = null;
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      tmp.subVectors(e.pos, pos).setY(0);
      const d = tmp.length();
      if (d > range || (d > 0.3 && tmp.normalize().dot(fwd) < 0.35)) continue;
      e.hp = Math.max(0, e.hp - damage);
      hit = e;
      if (e.hp <= 0) {
        e.state = 'dead';
        e.controller.die();
      } else {
        e.controller.trigger('hit');
        if (e.state === 'idle' || e.state === 'return') e.state = 'chase';
      }
    }
    if (hit) onTarget?.(hit);
    return hit;
  }

  return { enemies, update, playerAttack };
}
