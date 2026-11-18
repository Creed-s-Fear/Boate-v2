import * as THREE from 'three';

// Neon string curtain with physics: each string is a damped pendulum. The player's body
// pushes the strings (they wrap around and are dragged along); on release, they swing
// and settle on their own. Simulation runs in JS (~30 strings per curtain) and the result
// is sent to the shader via a 1-row texture: 1 draw call per curtain.
//
// Body contact: the string stays on the body surface and only loses the velocity component
// that would push it inside (no bounce), so with the player standing still it rests
// instead of jittering. The velocity component running around the body is preserved: that
// is what lets the string wrap around the player when the rest position ended up on the
// other side.

const BODY_RADIUS = 0.4;
const BODY_HEIGHT = 1.05; // height at which the body touches the string
const SLIDE = 5; // m/s²: push around the body for the string that needs to wrap around it
const FRICTION = 4; // 1/s: friction of the string sliding on the body (without it the string oscillates back and forth)
const _p = new THREE.Vector3();
const _local = new THREE.Vector3();

export class StringCurtain {
  constructor(piece, parent) {
    this.parent = parent;
    parent.updateWorldMatrix(true, false);
    const inv = parent.matrixWorld.clone().invert();
    piece.updateWorldMatrix(true, true);

    // merges piece meshes into a single geometry, in the room's reference frame
    const pos = [];
    const col = [];
    const rail = [];
    const index = [];
    let offset = 0;
    piece.traverse((m) => {
      if (!m.isMesh) return;
      const a = m.geometry.attributes.position;
      const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const isRail = !m.material.isMeshBasicMaterial; // metal rail; the strings are neon
      const c = m.material.color;
      const k = isRail ? 0.1 : 1;
      for (let i = 0; i < a.count; i++) {
        _p.fromBufferAttribute(a, i).applyMatrix4(mat);
        pos.push(_p.x, _p.y, _p.z);
        col.push(c.r * k, c.g * k, c.b * k);
        rail.push(isRail);
      }
      const idx = m.geometry.index;
      if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + offset);
      else for (let i = 0; i < a.count; i++) index.push(i + offset);
      offset += a.count;
    });
    const count = pos.length / 3;

    // curtain axis (along the rail) and string bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, top = -Infinity, bottom = Infinity;
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      if (!rail[i]) { top = Math.max(top, y); bottom = Math.min(bottom, y); }
    }
    const alongX = maxX - minX > maxZ - minZ;
    const A = alongX ? 0 : 2; // index of the coordinate along the rail
    const length = top - bottom;

    // each string = group of vertices with the same coordinate along the rail
    const values = [...new Set(Array.from({ length: count }, (_, i) => (rail[i] ? null : Math.round(pos[i * 3 + A] * 1000))))]
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    const centers = [];
    let start = values[0];
    let prev = values[0];
    for (let i = 1; i <= values.length; i++) {
      const v = values[i];
      if (v === undefined || v - prev > 15) {
        centers.push((start + prev) / 2000);
        start = v;
      }
      prev = v;
    }
    const n = centers.length;
    const aStr = new Float32Array(count);
    const aHang = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (rail[i]) continue;
      const a = pos[i * 3 + A];
      let best = 0;
      let bd = Infinity;
      for (let s = 0; s < n; s++) {
        const d = Math.abs(centers[s] - a);
        if (d < bd) { bd = d; best = s; }
      }
      aStr[i] = best;
      aHang[i] = THREE.MathUtils.clamp((top - pos[i * 3 + 1]) / length, 0, 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aStr', new THREE.BufferAttribute(aStr, 1));
    geo.setAttribute('aHang', new THREE.BufferAttribute(aHang, 1));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 1.0; // strings swing out of place

    // simulation state
    this.n = n;
    this.length = length;
    this.top = top;
    this.bottom = bottom;
    this.rest = new Float32Array(n * 2); // rest position (x, z) of each string
    const plane = alongX ? (minZ + maxZ) / 2 : (minX + maxX) / 2;
    for (let s = 0; s < n; s++) {
      this.rest[s * 2] = alongX ? centers[s] : plane;
      this.rest[s * 2 + 1] = alongX ? plane : centers[s];
    }
    this.box = { minX: minX - 0.9, maxX: maxX + 0.9, minZ: minZ - 0.9, maxZ: maxZ + 0.9 };
    this.p = new Float32Array(n * 2); // displacement of the bottom tip
    this.v = new Float32Array(n * 2);
    this.w2 = new Float32Array(n); // pendulum frequency (g / length), with slight variation
    this.damp = new Float32Array(n);
    // Side of each string (alternating) and how far it moves from the rail while touching
    // the body: strings fan out around the player instead of piling up at one point.
    this.side = new Float32Array(n);
    this.latX = alongX ? 0 : 1; // direction perpendicular to the rail
    this.latZ = alongX ? 1 : 0;
    for (let s = 0; s < n; s++) {
      const r = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
      this.w2[s] = (9.8 / length) * (0.9 + 0.25 * r);
      this.damp[s] = 0.75 + 0.5 * r;
      this.side[s] = (s % 2 ? 1 : -1) * (0.03 + 0.05 * r);
    }
    this.hcBody = THREE.MathUtils.clamp((top - BODY_HEIGHT) / length, 0.3, 1);
    this.data = new Float32Array(n * 4);
    for (let s = 0; s < n; s++) this.data[s * 4 + 2] = 1;
    this.texture = new THREE.DataTexture(this.data, n, 1, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.asleep = true;

    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    material.name = 'CortinaFios';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStrings = { value: this.texture };
      shader.uniforms.uCount = { value: n };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aStr;\nattribute float aHang;\nuniform sampler2D uStrings;\nuniform float uCount;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 strS = texture2D(uStrings, vec2((aStr + 0.5) / uCount, 0.5));
          // above the contact point the string goes straight to the body; below, it hangs along
          float strK = min(aHang / max(strS.z, 0.05), 1.0);
          transformed.xz += strS.xy * strK;
          transformed.y += dot(strS.xy, strS.xy) * strK * 0.2;`,
        );
    };

    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'CortinaFios';
    this.mesh.userData.dynamic = true;
    parent.add(this.mesh);
    piece.removeFromParent();
  }

  update(dt, time, playerPos, playerVel) {
    if (!this.parent.visible) return;
    _local.copy(playerPos);
    this.parent.worldToLocal(_local);
    const b = this.box;
    const near = _local.x > b.minX && _local.x < b.maxX && _local.z > b.minZ && _local.z < b.maxZ;
    if (!near && this.asleep) return;

    const touching = near && _local.y < this.top && _local.y + 1.75 > this.bottom;
    const h = Math.min(dt, 0.033);
    const { p, v, rest, data, side } = this;
    const maxD = this.length * 0.85;
    let energy = 0;
    for (let s = 0; s < this.n; s++) {
      let px = p[s * 2], pz = p[s * 2 + 1], vx = v[s * 2], vz = v[s * 2 + 1];
      // Where the pendulum pulls toward: rest position. With the body on top of rest, slightly
      // to the string's side (decided by rest position, which is fixed, to avoid toggling).
      const covered = touching && Math.hypot(rest[s * 2] - _local.x, rest[s * 2 + 1] - _local.z) < BODY_RADIUS;
      const bias = covered ? side[s] : 0;
      const bx = this.latX * bias;
      const bz = this.latZ * bias;
      // damped pendulum + minimal breeze so the curtain never looks "frozen"
      vx += (-this.w2[s] * (px - bx) - this.damp[s] * vx) * h;
      vz += (-this.w2[s] * (pz - bz) - this.damp[s] * vz) * h;
      vx += Math.sin(time * 1.1 + s * 1.7) * 0.012 * h;
      vz += Math.cos(time * 0.9 + s * 2.3) * 0.012 * h;
      px += vx * h;
      pz += vz * h;

      let hcTarget = 1;
      if (touching) {
        const cx = rest[s * 2] + px - _local.x;
        const cz = rest[s * 2 + 1] + pz - _local.z;
        const d = Math.hypot(cx, cz);
        if (d < BODY_RADIUS) {
          // direction body -> string; right at the body center the string exits to its side
          let nx = this.latX * Math.sign(side[s]);
          let nz = this.latZ * Math.sign(side[s]);
          if (d > 1e-4) { nx = cx / d; nz = cz / d; }
          // stays on the body surface...
          px = _local.x + nx * BODY_RADIUS - rest[s * 2];
          pz = _local.z + nz * BODY_RADIUS - rest[s * 2 + 1];
          // ...and only loses the velocity that would push it inside (measured relative to
          // the body: the player walking pushes the string; standing still, the string rests without bouncing)
          const vn = (vx - playerVel.x) * nx + (vz - playerVel.z) * nz;
          if (vn < 0) { vx -= nx * vn; vz -= nz * vn; }
          // friction of the string sliding around the body
          const tx = -nz;
          const tz = nx;
          const vt = (vx - playerVel.x) * tx + (vz - playerVel.z) * tz;
          const lost = vt * (1 - Math.exp(-FRICTION * h));
          vx -= tx * lost;
          vz -= tz * lost;
          // Rest position on the other side of the body: the string slides around it via the
          // shortest path (tied, each string goes to its own side) until it can return home.
          const rx = rest[s * 2] + bx - _local.x;
          const rz = rest[s * 2 + 1] + bz - _local.z;
          if (rx * nx + rz * nz < 0) {
            const along = rx * tx + rz * tz; // how far rest is to the tangent side
            const dir = Math.abs(along) > 0.02 ? Math.sign(along) : Math.sign(side[s]);
            vx += tx * dir * SLIDE * h;
            vz += tz * dir * SLIDE * h;
          }
          hcTarget = this.hcBody;
        }
      }
      const len = Math.hypot(px, pz);
      if (len > maxD) { px *= maxD / len; pz *= maxD / len; }
      p[s * 2] = px; p[s * 2 + 1] = pz; v[s * 2] = vx; v[s * 2 + 1] = vz;
      data[s * 4] = px;
      data[s * 4 + 1] = pz;
      data[s * 4 + 2] += (hcTarget - data[s * 4 + 2]) * Math.min(1, h * 9);
      energy += px * px + pz * pz + vx * vx + vz * vz;
    }
    this.texture.needsUpdate = true;
    this.asleep = !near && energy < 2e-4;
  }
}
