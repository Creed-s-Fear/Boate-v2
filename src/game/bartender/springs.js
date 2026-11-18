// Spring bones for Jack of Hearts characters: hair (later also apron ties) swings with inertia and gravity and stays out of
// the body. Plain three.js, no dependencies. Verlet on bone tails, after the VRM spring bone: each joint keeps its tail's
// last two positions; per step the tail moves by its inertia (minus drag), a pull back toward the pose the animation gives
// (stiffness), and gravity; optionally the lower joints aim along their rest direction as seen from a body bone ("follow":
// hair lying down the back stays behind when the body leans or the head turns); it is kept at the bone's length from the head
// and pushed out of every collider.
//
// Needs from the GLB (hair_build.py makes them):
//   chains      bones <prefix>_0 .. <prefix>_<n>, each a child of the previous; the last one is only the tip (not simulated)
//   colliders   SpringCol_<name> (sphere: the bone is the centre), SpringCol_<name>_a / _b (capsule ends), or a half plane
//               SpringCol_<name>_a / _b / _c [/ _d] (anchor, toward the free side, up [, side]: only points in a band below the
//               anchor, and on the _d side of it when present, are held), on body bones
//   settings    armature node extras (three.js userData): spring_chains = [{root, bones, stiffness, stiffness_root, drag,
//               gravity, hit_radius, follow?, follow_stiffness?, follow_from?, follow_ramp?}] (stiffness eases from stiffness_root at the head to stiffness at the tip), spring_colliders = [{name, type, radius, band?, sided?}] (JSON strings; metres, seconds)
// Usage:
//   const springs = attachSprings(gltf.scene);     // right after loading (rest pose); null when the model has no springs
//   each frame, AFTER mixer.update(dt):  springs.update(dt);
//   springs.reset() puts every chain back on the current animated pose (after a teleport or a cut).
import * as THREE from 'three';

const V = () => new THREE.Vector3();
// stiffness eases from stiffness_root at the first joint to stiffness at the last: the hair near the head follows the head,
// the ends hang
function stiffAt(cc, i) {
  const r = cc.stiffness_root ?? cc.stiffness, n = Math.max(1, cc.bones - 1), t = Math.min(1, i / n);
  return r * Math.pow(cc.stiffness / r, Math.sqrt(t));
}
export function attachSprings(root, opts = {}) {
  let holder = null;
  root.traverse(o => { if (!holder && o.userData && o.userData.spring_chains) holder = o; });
  if (!holder) return null;
  const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
  const chainCfg = parse(holder.userData.spring_chains), colCfg = parse(holder.userData.spring_colliders || '[]');
  const o = { step: 1 / 60, maxSteps: 4, ...opts };
  root.updateMatrixWorld(true);
  const bone = n => root.getObjectByName('SpringCol_' + n);
  const colliders = colCfg.map(c => c.type === 'sphere' ? { type: 'sphere', a: bone(c.name), r: c.radius, A: V() }
      : c.type === 'plane' ? { type: 'plane', a: bone(c.name + '_a'), b: bone(c.name + '_b'), c: bone(c.name + '_c'), d: c.sided ? bone(c.name + '_d') : null,
                               r: c.radius, band: c.band ?? 10, A: V(), B: V(), C: V(), D: V(), N: V(), U: V(), S: V() }
      : { type: 'capsule', a: bone(c.name + '_a'), b: bone(c.name + '_b'), r: c.radius, A: V(), B: V() })
    .filter(c => c.a && (c.type === 'sphere' || c.b) && (c.type !== 'plane' || c.c))
    .filter((c, i) => !(o.skip || []).includes(colCfg[i]?.name));      // opts.skip: collider names to leave out (tuning)
  const chains = [];
  for (const cc of chainCfg) {
    const prefix = cc.root.replace(/_0$/, ''); const joints = [];
    for (let i = 0; i < cc.bones; i++) {
      const b = root.getObjectByName(`${prefix}_${i}`), t = root.getObjectByName(`${prefix}_${i + 1}`);
      if (!b || !t) break;
      const head = b.getWorldPosition(V()), tail = t.getWorldPosition(V());
      // follow: lower joints aim along their rest direction as seen from a body bone instead of from the head (the hair
      // lies down the back and stays behind the shoulders when she leans or turns her head; a direction, not a place, so
      // the hair can still slide along the back instead of bunching up)
      const fb = cc.follow ? root.getObjectByName(cc.follow) : null;
      const wf = fb ? Math.min(1, Math.max(0, (i - (cc.follow_from ?? 1) + 1) / (cc.follow_ramp ?? 2))) : 0;
      const dirF = fb ? tail.clone().sub(head).normalize().applyQuaternion(fb.getWorldQuaternion(new THREE.Quaternion()).invert()) : null;
      joints.push({ bone: b, restQ: b.quaternion.clone(), axis: t.position.clone().normalize(), len: head.distanceTo(tail),
                    stiff: stiffAt(cc, i), cur: tail.clone(), prev: tail.clone(), fb, wf, dirF });
    }
    if (joints.length) chains.push({ cfg: cc, joints });
  }
  const g = new THREE.Vector3(0, -1, 0);
  const pq = new THREE.Quaternion(), pqi = new THREE.Quaternion(), wq = new THREE.Quaternion(), dq = new THREE.Quaternion(), fq = new THREE.Quaternion();
  const head = V(), restDir = V(), next = V(), tmp = V(), to = V(), q = V(), ab = V(), tgt = V();
  function closest(c, p, out) {
    if (c.type === 'sphere') return out.copy(c.A);
    ab.subVectors(c.B, c.A); const t = Math.min(1, Math.max(0, tmp.subVectors(p, c.A).dot(ab) / ab.lengthSq()));
    return out.copy(c.A).addScaledVector(ab, t);
  }
  function collide(p, hr) {
    for (const c of colliders) {
      if (c.type === 'plane') {     // half plane: below the anchor, keep the point on the normal's side (e.g. hair behind the shoulders)
        const h = tmp.subVectors(p, c.A).dot(c.U);
        if (h > 0 || h < -c.band || (c.d && tmp.dot(c.S) < 0)) continue;
        const d = tmp.dot(c.N), R = c.r + hr;
        if (d < R) p.addScaledVector(c.N, R - d);
        continue;
      }
      closest(c, p, q); const R = c.r + hr; tmp.subVectors(p, q); const d = tmp.length();
      if (d < R) p.copy(q).addScaledVector(tmp, R / Math.max(d, 1e-6));
    }
  }
  function pose(j) {            // parent's world rotation, the joint head and the direction the animation points the bone
    j.bone.parent.getWorldQuaternion(pq); j.bone.getWorldPosition(head);
    restDir.copy(j.axis).applyQuaternion(j.restQ).applyQuaternion(pq);
  }
  function orient(j) {          // turn the bone so it points at its simulated tail
    to.subVectors(j.cur, head).normalize(); dq.setFromUnitVectors(restDir, to);
    wq.copy(pq).multiply(j.restQ).premultiply(dq);
    j.bone.quaternion.copy(pqi.copy(pq).invert()).multiply(wq);
    j.bone.updateMatrixWorld(true);
  }
  function step(dt) {
    for (const c of colliders) {
      c.a.getWorldPosition(c.A); if (c.b) c.b.getWorldPosition(c.B);
      if (c.type === 'plane') {
        c.c.getWorldPosition(c.C); c.N.subVectors(c.B, c.A).normalize(); c.U.subVectors(c.C, c.A).normalize();
        if (c.d) { c.d.getWorldPosition(c.D); c.S.subVectors(c.D, c.A).normalize(); }
      }
    }
    for (const ch of chains) {
      const { drag, gravity, hit_radius: hr = 0.01 } = ch.cfg;
      for (const j of ch.joints) {
        pose(j);
        next.copy(j.cur).addScaledVector(tmp.subVectors(j.cur, j.prev), 1 - drag).addScaledVector(g, gravity * dt);
        if (j.wf > 0) {
          j.fb.getWorldQuaternion(fq); tgt.copy(j.dirF).applyQuaternion(fq);
          next.addScaledVector(restDir, j.stiff * (1 - j.wf) * dt).addScaledVector(tgt, (ch.cfg.follow_stiffness ?? 1.5) * j.wf * dt);
        } else next.addScaledVector(restDir, j.stiff * dt);
        next.sub(head).normalize().multiplyScalar(j.len).add(head);
        collide(next, hr);
        next.sub(head).normalize().multiplyScalar(j.len).add(head);
        j.prev.copy(j.cur); j.cur.copy(next);
        orient(j);
      }
    }
  }
  let acc = 0;
  const api = {
    chains, colliders,
    reset() {
      root.updateMatrixWorld(true);
      for (const ch of chains) for (const j of ch.joints) {
        j.bone.quaternion.copy(j.restQ); j.bone.updateMatrixWorld(true); pose(j);
        j.cur.copy(head).addScaledVector(restDir, j.len); j.prev.copy(j.cur);
      }
      acc = 0;
    },
    update(dt) {
      root.updateMatrixWorld(true);
      if (dt > 0.25) { api.reset(); return; }      // long pause (tab hidden, scrubbing): start from the pose again
      acc += dt; let n = 0;
      while (acc >= o.step && n < o.maxSteps) { step(o.step); acc -= o.step; n++; }
      if (n === o.maxSteps) acc = 0;
      if (n === 0) for (const ch of chains) for (const j of ch.joints) { pose(j); orient(j); }   // keep the animated parent's motion
    },
    // debug: wireframe colliders (follow their bones) and the simulated tails
    debug(scene) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.35, depthTest: false });
      const meshes = colliders.filter(c => c.type !== 'plane').map(c => {
        const m = c.type === 'sphere' ? new THREE.Mesh(new THREE.SphereGeometry(c.r, 16, 10), mat)
                                      : new THREE.Mesh(new THREE.CapsuleGeometry(c.r, 1, 6, 12), mat);
        m.renderOrder = 999; scene.add(m); return { c, m };
      });
      const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffff00, size: 6, sizeAttenuation: false, depthTest: false }));
      pts.renderOrder = 1000; scene.add(pts);
      return () => {
        for (const { c, m } of meshes) {
          c.a.getWorldPosition(c.A);
          if (c.type === 'sphere') { m.position.copy(c.A); continue; }
          c.b.getWorldPosition(c.B); const L = c.A.distanceTo(c.B);
          m.position.copy(c.A).add(c.B).multiplyScalar(0.5); m.scale.set(1, 1, 1);
          m.geometry.dispose(); m.geometry = new THREE.CapsuleGeometry(c.r, L, 6, 12);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.subVectors(c.B, c.A).normalize());
        }
        const arr = []; for (const ch of chains) for (const j of ch.joints) arr.push(j.cur.x, j.cur.y, j.cur.z);
        pts.geometry.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      };
    },
  };
  api.reset();
  return api;
}
