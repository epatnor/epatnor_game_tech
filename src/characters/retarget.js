import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Retargeting av animationsklipp mellan skelett med olika bennamn och proportioner.
//
// Två vägar:
// 1. renameClip: billig. Fungerar när skeletten har samma vilopose och benorientering och bara
//    namnen skiljer (t.ex. två paket från samma rigg). Spåren döps bara om.
// 2. retargetClip: SkeletonUtils.retargetClip samplar källan bildruta för bildruta och räknar om
//    rotationerna i världsrymd till målets ben. Klarar olika benorientering och proportioner,
//    men kräver att vilopose är ungefär lika (T-pose mot A-pose behöver localOffsets).

// Döper om spår enligt { källben: målben }. Spår för ben utan mappning tas bort.
export function renameClip(clip, map) {
  const tracks = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = t.name.slice(0, dot);
    const prop = t.name.slice(dot + 1);
    const to = map[bone];
    if (!to) continue;
    const copy = t.clone();
    copy.name = `${to}.${prop}`;
    tracks.push(copy);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// targetMesh/sourceMesh: SkinnedMesh. names: { målben: källben }. hip: källans höftben.
// Höftens förflyttning skalas med höjdkvoten mellan målets och källans höft.
export function retargetClip(targetMesh, sourceMesh, clip, { names, hip = 'Hips', fps = 30, localOffsets } = {}) {
  const hipHeight = (mesh, name) => {
    mesh.skeleton.pose();
    const bone = mesh.skeleton.bones.find((b) => b.name === name);
    mesh.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).y;
  };
  const targetHip = Object.keys(names).find((k) => names[k] === hip);
  const scale = targetHip ? hipHeight(targetMesh, targetHip) / hipHeight(sourceMesh, hip) : 1;
  const out = SkeletonUtils.retargetClip(targetMesh, sourceMesh, clip, {
    names,
    hip,
    fps,
    scale,
    localOffsets,
    useFirstFramePosition: false,
  });
  out.name = clip.name;
  // retargetClip skriver positionsspåret på ".bones[namn]"-form; vi normaliserar till "namn.position".
  for (const t of out.tracks) t.name = t.name.replace(/^\.bones\[(.+?)\]/, '$1');
  // Vilopose återställs efter samplingen.
  targetMesh.skeleton.pose();
  sourceMesh.skeleton.pose();
  return out;
}

// Inverterar en namnmappning { a: b } -> { b: a }.
export const invertMap = (map) => Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
