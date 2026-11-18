// Eye life for Jack of Hearts characters with real eyes: blinks and small gaze shifts. Plain three.js, no dependencies.
//
// Needs from the GLB (eyes_build.py makes them):
//   morph targets  blink_L, blink_R            lids fully closed
//                  blink_L_half, blink_R_half  lids half closed (the in-between keeps the lid on the eyeball surface;
//                                              a straight blend from open to closed would cut ~0.6 mm into it)
//   bones          LeftEye, RightEye           children of Head, at the eyeball centres
// Usage:
//   const eyes = attachEyes(gltf.scene);         // right after loading, while the skeleton is still in its rest pose
//   each frame, AFTER mixer.update(dt):  eyes.update(dt);
//   eyes.blink() forces a blink now; eyes.set({ blink: 0..1, yaw, pitch }) freezes a state (degrees), eyes.set(null) resumes.
// Material notes for the game: the cornea (F_cornea_mat) is clear (transmission) and the eye-shadow shell (F_eyeshell_mat)
// is a soft dark layer; neither may cast shadows, or the eyeball goes dark (attachEyes turns that off on what it finds).
// attachEyes also turns the cornea into an additive reflection layer (see below); pass { cornea: 'transmission' } to keep
// the GLB's physical cornea (only worth it for extreme close-ups).
import * as THREE from 'three';

const ease = x => x * x * (3 - 2 * x);

export function attachEyes(root, opts = {}) {
  const o = { minGap: 2.5, maxGap: 6.0, close: 0.075, hold: 0.03, open: 0.15, doubleChance: 0.15,
              yaw: 7, pitch: 3, saccadeEvery: [0.8, 3.0], ...opts };
  const meshes = [];
  root.traverse(m => {
    if (m.isMesh && /cornea|eyeshell/i.test(m.material?.name || '')) m.castShadow = false;
    if (m.isMesh && /cornea/i.test(m.material?.name || '') && opts.cornea !== 'transmission') {
      // three.js transmission samples a blurred copy of the screen: at game distance it washes the iris to grey. The cornea
      // becomes a black additive layer instead: it only adds its reflection and the light's highlight on the wet eye.
      const c = m.material; c.transmission = 0; c.color.setRGB(0, 0, 0); c.transparent = true; c.depthWrite = false;
      c.blending = THREE.AdditiveBlending; c.roughness = 0.04; c.needsUpdate = true;
    }
    if (m.isMesh && m.morphTargetDictionary && 'blink_L' in m.morphTargetDictionary) meshes.push(m);
  });
  const bones = ['LeftEye', 'RightEye'].map(n => root.getObjectByName(n)).filter(Boolean);
  // gaze axes in each eye's parent space, from the rest pose (character faces +Z, up +Y in the loaded scene)
  root.updateMatrixWorld(true);
  const rig = bones.map(b => {
    const pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq); const inv = pq.clone().invert();
    const rootQ = new THREE.Quaternion(); root.getWorldQuaternion(rootQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rootQ).applyQuaternion(inv);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootQ).applyQuaternion(inv);
    return { b, rest: b.quaternion.clone(), up, right };
  });
  let t = 0, nextBlink = 1 + Math.random() * 2, blinkT = -1, twice = false;
  let gaze = { yaw: 0, pitch: 0 }, target = { yaw: 0, pitch: 0 }, nextSacc = 0.5;
  let frozen = null;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  function weights(w) {        // closedness 0..1 -> (half, full) influences
    return w < 0.5 ? [2 * w, 0] : [2 - 2 * w, 2 * w - 1];
  }
  function apply(w, yaw, pitch) {
    const [h, f] = weights(Math.min(Math.max(w, 0), 1));
    for (const m of meshes) {
      const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      for (const s of ['L', 'R']) { inf[d['blink_' + s]] = f; if (('blink_' + s + '_half') in d) inf[d['blink_' + s + '_half']] = h; }
    }
    for (const r of rig) {
      qa.setFromAxisAngle(r.up, THREE.MathUtils.degToRad(yaw)); qb.setFromAxisAngle(r.right, THREE.MathUtils.degToRad(-pitch));
      r.b.quaternion.copy(qa).multiply(qb).multiply(r.rest);
    }
  }
  function blinkCurve(s) {     // seconds since the blink started -> closedness
    const { close, hold, open } = o;
    if (s < close) return ease(s / close);
    if (s < close + hold) return 1;
    if (s < close + hold + open) return 1 - ease((s - close - hold) / open);
    return -1;
  }
  return {
    meshes, bones,
    blink() { blinkT = 0; },
    set(state) { frozen = state; if (state) apply(state.blink ?? 0, state.yaw ?? 0, state.pitch ?? 0); },
    update(dt) {
      if (frozen) { apply(frozen.blink ?? 0, frozen.yaw ?? 0, frozen.pitch ?? 0); return; }
      t += dt;
      if (blinkT < 0 && t >= nextBlink) { blinkT = 0; twice = Math.random() < o.doubleChance; }
      let w = 0;
      if (blinkT >= 0) {
        blinkT += dt; w = blinkCurve(blinkT);
        if (w < 0) { if (twice) { twice = false; blinkT = 0; w = 0; } else { blinkT = -1; w = 0; nextBlink = t + o.minGap + Math.random() * (o.maxGap - o.minGap); } }
      }
      if (t >= nextSacc) {        // small saccade: new target, held for a while; sometimes back to centre
        const back = Math.random() < 0.35;
        target = back ? { yaw: 0, pitch: 0 } : { yaw: (Math.random() * 2 - 1) * o.yaw, pitch: (Math.random() * 2 - 1) * o.pitch };
        nextSacc = t + o.saccadeEvery[0] + Math.random() * (o.saccadeEvery[1] - o.saccadeEvery[0]);
      }
      const k = 1 - Math.exp(-dt * 28);     // ~40 ms to settle: saccades are fast
      gaze.yaw += (target.yaw - gaze.yaw) * k; gaze.pitch += (target.pitch - gaze.pitch) * k;
      apply(w, gaze.yaw, gaze.pitch);
    },
  };
}
