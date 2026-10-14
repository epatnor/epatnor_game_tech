import * as THREE from 'three';

// Kanoniska animationer och hur de brukar heta i olika paket. Matchningen är skiftlägesokänslig
// och första träff vinner. Namnen för Quaternius och KayKit bygger på tidigare kända versioner
// och måste kontrolleras mot de nedladdade filerna (se CHARACTERS.md).
export const DEFAULT_ALIASES = {
  idle: [/^idle$/i, /^idle[_ ]?a$/i, /idle/i],
  walk: [/^walk$/i, /^walking[_ ]?a$/i, /walk(?!.*back)/i],
  run: [/^run$/i, /^running[_ ]?a$/i, /run(?!.*back)/i],
  attack: [/^attack$/i, /sword.*attack|attack.*sword/i, /1h.*(attack|slice|chop)/i, /punch|slash|attack/i],
  hit: [/^hit$/i, /hit[_ ]?(a|react)/i, /hit|damage/i],
  death: [/^death$/i, /death[_ ]?a/i, /death|die/i],
  spellcast: [/^spellcast$/i, /spell.*(cast|shoot|simple)/i, /spell|cast/i],
};

// Sockelnamn för stela tillbehör, matchade mot bennamn.
// Mönstren prövas i ordning; den första som matchar något ben vinner. KayKit har särskilda
// "handslot"-ben (handslot.r, efter GLTFLoaders namnstädning "handslotr") där vapnen ska sitta.
const SOCKETS = {
  handR: [/(^|_|:)handslot_?r$/i, /(^|_|:)(hand_?r|righthand|wrist_?r)$/i],
  handL: [/(^|_|:)handslot_?l$/i, /(^|_|:)(hand_?l|lefthand|wrist_?l)$/i],
  head: [/(^|_|:)head$/i],
  chest: [/(^|_|:)(chest|spine1|spine2|upperchest)$/i],
};

const ONE_SHOT = new Set(['attack', 'hit', 'spellcast']);

export class CharacterController {
  // root: objektet som innehåller SkinnedMesh och skelett. clips: AnimationClip[].
  // clipMap: { kanoniskt: klippnamn } går före alias, t.ex. för ersättningsklipp.
  constructor(root, clips, { aliases = DEFAULT_ALIASES, clipMap = {}, fade = 0.25, walkSpeed = 1.6, runSpeed = 4.5 } = {}) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.fade = fade;
    this.walkSpeed = walkSpeed; // m/s som gångklippet är gjort för
    this.runSpeed = runSpeed;
    this.timeScale = 1;
    this.clips = clips;
    this.actions = {}; // kanoniskt namn -> action
    this.rawActions = {}; // klippnamn -> action
    for (const clip of clips) this.rawActions[clip.name] = this.mixer.clipAction(clip);
    for (const [key, name] of Object.entries(clipMap)) {
      if (this.rawActions[name]) this.actions[key] = this.rawActions[name];
    }
    for (const [key, patterns] of Object.entries(aliases)) {
      if (this.actions[key]) continue;
      for (const re of patterns) {
        const clip = clips.find((c) => re.test(c.name));
        if (clip) {
          this.actions[key] = this.rawActions[clip.name];
          break;
        }
      }
    }
    this.body = null;
    root.traverse((o) => {
      if (o.isSkinnedMesh && !this.body) this.body = o;
    });
    this.skeleton = this.body?.skeleton ?? null;
    this.attachments = {};
    this.parts = {};
    this.current = null;
    this.locomotion = 'idle';
    this.oneShot = null;
    this.dead = false;
    this.speed = 0;

    this.mixer.addEventListener('finished', (e) => {
      if (this.dead) return;
      if (e.action === this.oneShot) {
        this.oneShot = null;
        this._crossTo(this.actions[this.locomotion] ?? this.actions.idle, this.fade);
      }
    });
    if (this.actions.idle) this._crossTo(this.actions.idle, 0);
  }

  get available() {
    return Object.keys(this.actions);
  }

  _crossTo(action, fade = this.fade, { once = false } = {}) {
    if (!action) return;
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (once) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    if (this.current && this.current !== action) {
      if (!once && !action.isRunning()) action.reset();
      action.play();
      // Gångarter synkas i fas så att fötterna inte hoppar vid övertoning.
      if (!once && this.current.loop === THREE.LoopRepeat) {
        const p = this.current.time / this.current.getClip().duration;
        action.time = p * action.getClip().duration;
      }
      this.current.crossFadeTo(action, fade, false);
    } else {
      action.reset().play();
    }
    this.current = action;
  }

  // Spela ett kanoniskt eller rått klippnamn direkt.
  play(name, { fade = this.fade, once } = {}) {
    if (this.dead && name !== 'death') this.revive();
    const action = this.actions[name] ?? this.rawActions[name];
    if (!action) return false;
    if (name === 'death') return this.die();
    const isOnce = once ?? ONE_SHOT.has(name);
    if (isOnce) this.oneShot = action;
    else {
      this.oneShot = null;
      if (['idle', 'walk', 'run'].includes(name)) this.locomotion = name;
    }
    this._crossTo(action, fade, { once: isOnce });
    return true;
  }

  // Engångsanimation (attack, träff, besvärjelse) som återgår till rörelsen efteråt.
  trigger(name) {
    if (this.dead) return false;
    return this.play(name, { once: true });
  }

  die() {
    const a = this.actions.death;
    if (!a) return false;
    this.dead = true;
    this.oneShot = null;
    this._crossTo(a, this.fade * 0.6, { once: true });
    return true;
  }

  revive() {
    this.dead = false;
    this.oneShot = null;
    this._crossTo(this.actions[this.locomotion] ?? this.actions.idle, this.fade);
  }

  // Välj stå/gå/spring efter fart (m/s) och anpassa uppspelningshastigheten efter farten.
  setSpeed(speed) {
    this.speed = speed;
    if (this.dead) return;
    const next = speed < 0.15 ? 'idle' : speed < (this.walkSpeed + this.runSpeed) / 2 ? 'walk' : 'run';
    const walk = this.actions.walk;
    const run = this.actions.run;
    if (walk) walk.timeScale = next === 'walk' ? THREE.MathUtils.clamp(speed / this.walkSpeed, 0.5, 1.6) : 1;
    if (run) run.timeScale = next === 'run' ? THREE.MathUtils.clamp(speed / this.runSpeed, 0.7, 1.5) : 1;
    if (next !== this.locomotion) {
      this.locomotion = next;
      if (!this.oneShot) this._crossTo(this.actions[next], this.fade);
    }
  }

  update(dt) {
    this.mixer.timeScale = this.timeScale;
    this.mixer.update(dt);
  }

  // --- Utrustning ---------------------------------------------------------------------------

  findBone(pattern) {
    if (!this.skeleton) return null;
    const list =
      typeof pattern === 'string' ? (SOCKETS[pattern] ?? [new RegExp(`(^|_|:)${pattern}$`, 'i')]) : [pattern];
    for (const re of list) {
      const bone = this.skeleton.bones.find((b) => re.test(b.name));
      if (bone) return bone;
    }
    return null;
  }

  // Stelt tillbehör på ett ben (vapen, sköld, hjälm). offset: {position, rotation, scale}.
  attach(slot, object, socket = slot, offset = {}) {
    this.detach(slot);
    if (!object) return null;
    const bone = this.findBone(socket);
    if (!bone) return null;
    if (offset.position) object.position.copy(offset.position);
    if (offset.rotation) object.rotation.copy(offset.rotation);
    if (offset.scale) object.scale.setScalar(offset.scale);
    bone.add(object);
    this.attachments[slot] = object;
    return object;
  }

  detach(slot) {
    const old = this.attachments[slot];
    if (old) old.parent?.remove(old);
    delete this.attachments[slot];
  }

  // Skinnad del (kläder, frisyr) som delar karaktärens skelett. Delar från en annan
  // modell med samma bennamn binds om till det här skelettet.
  setPart(slot, meshes) {
    for (const m of this.parts[slot] ?? []) m.parent?.remove(m);
    delete this.parts[slot];
    if (!meshes) return;
    const list = Array.isArray(meshes) ? meshes : [meshes];
    for (const m of list) {
      if (m.isSkinnedMesh && this.skeleton) {
        const skeleton =
          m.skeleton && m.skeleton !== this.skeleton ? rebindSkeleton(m.skeleton, this.skeleton) : this.skeleton;
        m.bind(skeleton, this.body.bindMatrix);
      }
      this.body.parent.add(m);
    }
    this.parts[slot] = list;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
  }
}

// Bygger ett skelett med målskelettets ben men delens egna inversa bindningsmatriser,
// matchat på bennamn. Ben som saknas i målet ger en varning och pekar på roten.
function rebindSkeleton(source, target) {
  const byName = new Map(target.bones.map((b) => [b.name, b]));
  const bones = source.bones.map((b) => {
    const t = byName.get(b.name);
    if (!t) console.warn(`Benet "${b.name}" saknas i målskelettet`);
    return t ?? target.bones[0];
  });
  return new THREE.Skeleton(bones, source.boneInverses);
}
