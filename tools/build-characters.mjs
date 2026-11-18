// Generates game characters (public/models/personagens/) from sources in assets/personagens/fonte/.
//   npm run personagens
//
// - Cyber A–D have no skeleton: they inherit the skeleton and animations from Tropical (same body base,
//   aligned to ~2 cm). Each vertex copies the weights of the nearest Tropical points facing
//   the same direction (so the arm doesn't pull weight from the torso).
// - Meshes of ~590k triangles are reduced to ~30k; 4096 texture becomes WebP 2048.
// - The bartender only has textures reduced: mesh, morphs, bones and physics extras stay intact.
// - Geometry compressed with meshopt (the game decompresses on load).
import { mkdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = 'assets/personagens/fonte/';
const OUT = 'public/models/personagens/';
const TARGET_TRIS = 30_000;
const TEX = 2048;
const RIG = 'Tropical_animada.glb';
const CLIPS = { TRP_Tripo_Idle: 'idle', TRP_Tripo_Andar: 'walk' };

const MODELS = [
  { src: 'Cyber_A_tatuagens.glb', out: 'cyber_a.glb' },
  { src: 'Cyber_B_franja.glb', out: 'cyber_b.glb' },
  { src: 'Cyber_C_ondulado.glb', out: 'cyber_c.glb' },
  { src: 'Cyber_D_renda_vermelha.glb', out: 'cyber_d.glb' },
];

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
mkdirSync(OUT, { recursive: true });

const tris = (doc) =>
  doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);

const reduce = (doc) => {
  const ratio = Math.min(1, TARGET_TRIS / tris(doc));
  return doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false }));
};

const finish = async (doc, file, extra = []) => {
  await doc.transform(
    ...extra,
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(OUT + file, doc);
  console.log(`${file}: ${Math.round(tris(doc) / 1000)}k triangles, ${(statSync(OUT + file).size / 1e6).toFixed(1)} MB`);
};

const onlyPrim = (doc) => {
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prims = node.getMesh().listPrimitives();
  if (prims.length !== 1) throw new Error(`expected 1 primitive, found ${prims.length}`);
  return { node, prim: prims[0] };
};

const read = (acc) => {
  const n = acc.getCount();
  const k = acc.getElementSize();
  const out = new Float32Array(n * k);
  const v = new Array(k);
  for (let i = 0; i < n; i++) {
    acc.getElement(i, v);
    for (let j = 0; j < k; j++) out[i * k + j] = v[j];
  }
  return out;
};

// ---------------------------------------------------------------- skeleton weights by neighborhood
const CELL = 0.03;
function buildGrid(pos) {
  const g = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    const key = `${Math.floor(pos[i * 3] / CELL)},${Math.floor(pos[i * 3 + 1] / CELL)},${Math.floor(pos[i * 3 + 2] / CELL)}`;
    let b = g.get(key);
    if (!b) g.set(key, (b = []));
    b.push(i);
  }
  return g;
}

function nearest(g, pos, nor, x, y, z, nx, ny, nz, K) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  const best = [];
  for (let r = 0; r <= 10; r++) {
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (let k = -r; k <= r; k++) {
          if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
          const b = g.get(`${cx + i},${cy + j},${cz + k}`);
          if (!b) continue;
          for (const q of b) {
            // opposite normal = other surface (arm vs torso, thigh vs thigh)
            if (nor[q * 3] * nx + nor[q * 3 + 1] * ny + nor[q * 3 + 2] * nz < 0.2) continue;
            const d = Math.hypot(pos[q * 3] - x, pos[q * 3 + 1] - y, pos[q * 3 + 2] - z);
            if (best.length < K || d < best[best.length - 1].d) {
              best.push({ q, d });
              best.sort((a, b2) => a.d - b2.d);
              if (best.length > K) best.pop();
            }
          }
        }
    if (best.length >= K && best[K - 1].d < r * CELL) break;
  }
  return best;
}

// Limb radius: a vertex only follows the arm/leg if it's inside it. Long hair resting on
// the shoulder picked up arm weight and stretched with the hand.
// Arms only: on legs the simple neighborhood already deforms well, and cutting there created seams.
// (tight radius on upper arm released inner arm skin: it flapped down to the ribs)
const LIMB_RADIUS = { UpperArm: 0.12, ForeArm: 0.1, Hand: 0.12 };
const LIMB_FADE = 0.05;

/**
 * Hair resting on the shoulder sits above the shoulder joint and inward (neck side); arm skin
 * never sits there. In this region the upper arm loses influence, with a 3 cm transition.
 */
function shoulderHairFactor(b, x, y) {
  if (!b.name.startsWith('UpperArm')) return 1;
  const [jx, jy] = b.seg;
  const above = (y - (jy - 0.03)) / 0.03;
  const inward = (Math.abs(jx) - 0.02 - Math.abs(x)) / 0.03;
  return 1 - Math.min(1, Math.max(0, Math.min(above, inward)));
}
const HAND_SIDE = /^(ForeArm|Hand)/;
const HIP_SIDE = /^(Thigh|Shin|Hips|Spine$)/;
const limbRadius = (name) => {
  const k = Object.keys(LIMB_RADIUS).find((p) => name.startsWith(p));
  return k ? LIMB_RADIUS[k] : null;
};

function segDist(s, x, y, z) {
  const [ax, ay, az, bx, by, bz] = s;
  const vx = bx - ax, vy = by - ay, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / (vx * vx + vy * vy + vz * vz || 1)));
  return Math.hypot(ax + vx * t - x, ay + vy * t - y, az + vz * t - z);
}

/** Segment of each bone in the rest pose (from joint to child joint). */
function boneSegments(doc) {
  const skin = doc.getRoot().listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices();
  const head = joints.map((_, j) => {
    const m = ibm.getElement(j, new Array(16));
    return invertTranslation(m);
  });
  return joints.map((node, j) => {
    const child = node.listChildren().find((c) => joints.includes(c));
    const [ax, ay, az] = head[j];
    let end;
    if (child) end = head[joints.indexOf(child)];
    else {
      // tip (hand, head, finger): extends in the parent's direction
      const parent = joints.findIndex((p) => p.listChildren().includes(node));
      const [px, py, pz] = head[parent];
      const len = node.getName() === 'Head' ? 0.25 : 0.1;
      const d = Math.hypot(ax - px, ay - py, az - pz) || 1;
      end = node.getName() === 'Head' ? [ax, ay + len, az] : [ax + ((ax - px) / d) * len, ay + ((ay - py) / d) * len, az + ((az - pz) / d) * len];
    }
    return { name: node.getName(), seg: [ax, ay, az, ...end], radius: limbRadius(node.getName()) };
  });
}

/** Joint position from the inverse bind matrix (orthonormal rotation: inverse = transpose). */
function invertTranslation(m) {
  const [tx, ty, tz] = [m[12], m[13], m[14]];
  return [-(m[0] * tx + m[1] * ty + m[2] * tz), -(m[4] * tx + m[5] * ty + m[6] * tz), -(m[8] * tx + m[9] * ty + m[10] * tz)];
}

/** Off-body geometry (hair, loose lace): follows the nearest torso/head bone, no blending. */
function torsoBone(bones, x, y, z) {
  let best = -1, bd = Infinity;
  bones.forEach((b, j) => {
    const d = segDist(b.seg, x, y, z);
    if (b.radius !== null && d > b.radius) return;
    if (d < bd) [best, bd] = [j, d];
  });
  return best;
}

function transferWeights(rig, target) {
  const g = buildGrid(rig.pos);
  const n = target.pos.length / 3;
  const joints = new Uint8Array(n * 4);
  const weights = new Float32Array(n * 4);
  let offBody = 0;
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [target.pos[i * 3], target.pos[i * 3 + 1], target.pos[i * 3 + 2]];
    const [nx, ny, nz] = [target.nor[i * 3], target.nor[i * 3 + 1], target.nor[i * 3 + 2]];
    let near = nearest(g, rig.pos, rig.nor, x, y, z, nx, ny, nz, 6);
    if (near.length === 0) near = nearest(g, rig.pos, rig.nor, x, y, z, 0, 0, 0, 6); // without normal filter
    const acc = new Map();
    for (const { q, d } of near) {
      const f = 1 / (d + 0.005) ** 2;
      for (let k = 0; k < 4; k++) {
        const w = rig.wgt[q * 4 + k];
        if (w > 0) acc.set(rig.jnt[q * 4 + k], (acc.get(rig.jnt[q * 4 + k]) ?? 0) + w * f);
      }
    }
    // arm only pulls the vertex if it's inside the arm; influence fades gradually (no seam)
    for (const [j, w] of [...acc]) {
      const b = rig.bones[j];
      if (b.radius === null) continue;
      const inside = Math.min(1, Math.max(0, (b.radius + LIMB_FADE - segDist(b.seg, x, y, z)) / LIMB_FADE));
      const f = inside * shoulderHairFactor(b, x, y);
      if (f <= 0) acc.delete(j);
      else acc.set(j, w * f);
    }
    let top = [...acc].sort((a, b) => b[1] - a[1]);
    // hand and hip don't mix on the same vertex (mesh fused in A-pose)
    const leadName = rig.bones[top[0]?.[0]]?.name ?? '';
    const opposite = HAND_SIDE.test(leadName) ? HIP_SIDE : HIP_SIDE.test(leadName) ? HAND_SIDE : null;
    if (opposite) top = top.filter(([j]) => !opposite.test(rig.bones[j].name));
    top = top.slice(0, 4);
    if (top.length === 0) {
      offBody++;
      top = [[torsoBone(rig.bones, x, y, z), 1]];
    }
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    top.forEach(([j, w], k) => {
      joints[i * 4 + k] = j;
      weights[i * 4 + k] = w / sum;
    });
  }
  return { joints, weights, offBody };
}

// Each model has its own arm angle; with arms more closed than Tropical's, the hand
// fell on the reference's thigh and inherited leg weight. Closes the reference arms (only for
// the neighbor search) at the angle that best fits each side.
const ARM_CHAIN = { L: /^(UpperArm|ForeArm|Hand)\.?L$/, R: /^(UpperArm|ForeArm|Hand)\.?R$/ };

function posedRig(rig, angles) {
  const pos = Float32Array.from(rig.pos);
  const nor = Float32Array.from(rig.nor);
  for (const side of ['L', 'R']) {
    const ang = angles[side];
    if (!ang) continue;
    const chain = new Set(rig.bones.flatMap((b, j) => (ARM_CHAIN[side].test(b.name) ? [j] : [])));
    const pivot = rig.bones.find((b) => b.name === `UpperArm.${side}` || b.name === `UpperArm${side}`).seg;
    // left arm sits at +X: closing = rotate in Z negative direction
    const a = side === 'L' ? -ang : ang;
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < pos.length / 3; i++) {
      let f = 0;
      for (let k = 0; k < 4; k++) if (chain.has(rig.jnt[i * 4 + k])) f += rig.wgt[i * 4 + k];
      if (f === 0) continue;
      const dx = rig.pos[i * 3] - pivot[0], dy = rig.pos[i * 3 + 1] - pivot[1];
      pos[i * 3] = rig.pos[i * 3] + f * (pivot[0] + dx * c - dy * s - rig.pos[i * 3]);
      pos[i * 3 + 1] = rig.pos[i * 3 + 1] + f * (pivot[1] + dx * s + dy * c - rig.pos[i * 3 + 1]);
      const nx = rig.nor[i * 3], ny = rig.nor[i * 3 + 1];
      nor[i * 3] = nx + f * (nx * c - ny * s - nx);
      nor[i * 3 + 1] = ny + f * (nx * s + ny * c - ny);
    }
  }
  return { ...rig, pos, nor };
}

function fitArms(rig, target) {
  const angles = { L: 0, R: 0 };
  for (const side of ['L', 'R']) {
    // hand and forearm band, on the correct side of the body
    const probe = [];
    for (let i = 0; i < target.pos.length / 3; i += 3) {
      const x = target.pos[i * 3], y = target.pos[i * 3 + 1];
      if (y > 0.65 && y < 1.15 && (side === 'L' ? x > 0.12 : x < -0.12)) probe.push(i);
    }
    let best = Infinity;
    for (let ang = 0; ang <= 0.3001; ang += 0.03) {
      const r = posedRig(rig, { ...angles, [side]: ang });
      const g = buildGrid(r.pos);
      const ds = probe.map((i) => nearest(g, r.pos, r.nor, ...target.pos.slice(i * 3, i * 3 + 3), ...target.nor.slice(i * 3, i * 3 + 3), 1)[0]?.d ?? 1).sort((a, b) => a - b);
      const score = ds[Math.floor(ds.length * 0.75)];
      if (score < best) [best, angles[side]] = [score, ang];
    }
  }
  return angles;
}

// AI-generated meshes come with the hand fused to the hip (touching in A-pose). When moving the arm,
// this membrane stretched from hand to thigh. Removes triangles connecting forearm/hand to thigh/hip.
function cutFusedHands(idx, joints, bones) {
  const lead = (v) => bones[joints[v * 4]].name;
  const out = [];
  let cut = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const names = [lead(idx[t]), lead(idx[t + 1]), lead(idx[t + 2])];
    if (names.some((n) => HAND_SIDE.test(n)) && names.some((n) => HIP_SIDE.test(n))) {
      cut++;
      continue;
    }
    out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const touched = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const names = [lead(idx[t]), lead(idx[t + 1]), lead(idx[t + 2])];
    if (names.some((n) => HAND_SIDE.test(n)) && names.some((n) => HIP_SIDE.test(n))) touched.add(idx[t]).add(idx[t + 1]).add(idx[t + 2]);
  }
  return { idx: out, cut, touched };
}

/**
 * Fills the holes left by the cut (side of thigh and palm): follows the open border around
 * the removed triangles and fills it with the border's own vertices, which already have weights and UV.
 */
function fillCutHoles(idx, pos, touched) {
  const n = pos.length / 3;
  const ids = new Map();
  const weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
    if (!ids.has(k)) ids.set(k, ids.size);
    weld[i] = ids.get(k);
  }
  const near = new Set([...touched].map((v) => weld[v]));
  const uses = new Map();
  const edges = [];
  for (let t = 0; t < idx.length; t += 3) {
    for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const u = weld[a] < weld[b] ? `${weld[a]},${weld[b]}` : `${weld[b]},${weld[a]}`;
      uses.set(u, (uses.get(u) ?? 0) + 1);
      edges.push([a, b, u]);
    }
  }
  // open border, traversed in reverse: so the patch faces the same side as the surrounding skin
  const next = new Map();
  const rep = new Map();
  for (const [a, b, u] of edges) {
    if (uses.get(u) !== 1 || !near.has(weld[a]) || !near.has(weld[b])) continue;
    next.set(weld[b], weld[a]);
    rep.set(weld[a], a);
    rep.set(weld[b], b);
  }
  const out = [...idx];
  const seen = new Set();
  let holes = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let k = start;
    while (!seen.has(k) && next.has(k) && loop.length < 300) {
      seen.add(k);
      loop.push(rep.get(k));
      k = next.get(k);
    }
    if (k !== start || loop.length < 3) continue;
    out.push(...earClip(loop, pos));
    holes++;
  }
  return { idx: out, holes };
}

/** Triangulation of a nearly-planar 3D polygon (ear clipping), preserving vertex winding. */
function earClip(poly, pos) {
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const nrm = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay, az] = P(poly[i]);
    const [bx, by, bz] = P(poly[(i + 1) % poly.length]);
    nrm[0] += (ay - by) * (az + bz);
    nrm[1] += (az - bz) * (ax + bx);
    nrm[2] += (ax - bx) * (ay + by);
  }
  const len = Math.hypot(...nrm) || 1;
  const N = nrm.map((v) => v / len);
  const U = Math.abs(N[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const X = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
  const xl = Math.hypot(...X);
  const Xn = X.map((v) => v / xl);
  const Y = [N[1] * Xn[2] - N[2] * Xn[1], N[2] * Xn[0] - N[0] * Xn[2], N[0] * Xn[1] - N[1] * Xn[0]];
  const p2 = new Map(poly.map((v) => {
    const p = P(v);
    return [v, [p[0] * Xn[0] + p[1] * Xn[1] + p[2] * Xn[2], p[0] * Y[0] + p[1] * Y[1] + p[2] * Y[2]]];
  }));
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) > 0 && cross(b, c, p) > 0 && cross(c, a, p) > 0;
  const tris = [];
  const V = [...poly];
  let guard = 0;
  while (V.length > 3 && guard++ < 10_000) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i + V.length - 1) % V.length], b = V[i], c = V[(i + 1) % V.length];
      const [pa, pb, pc] = [p2.get(a), p2.get(b), p2.get(c)];
      if (cross(pa, pb, pc) <= 0) continue; // concave corner
      if (V.some((v) => v !== a && v !== b && v !== c && inside(p2.get(v), pa, pb, pc))) continue;
      tris.push(a, b, c);
      V.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  // remainder (twisted polygon): simple fan
  for (let i = 1; i + 1 < V.length; i++) tris.push(V[0], V[i], V[i + 1]);
  return tris;
}

/** Disconnected pieces of the mesh (vertices at the same position count as connected, even with different UV). */
function islands(idx, pos) {
  const n = pos.length / 3;
  const key = (i) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const same = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    if (same.has(k)) join(i, same.get(k));
    else same.set(k, i);
  }
  for (let t = 0; t < idx.length; t += 3) {
    join(idx[t], idx[t + 1]);
    join(idx[t], idx[t + 2]);
  }
  const used = new Uint8Array(n);
  for (const v of idx) used[v] = 1;
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * With the hand fused to the hip, the entire hand can inherit thigh weight. After the cut it becomes
 * a loose piece at hip height: anything not the main body, beside the body at hand height and
 * following thigh/hip, switches to follow that side's hand.
 */
function rescueHands(idx, pos, joints, weights, bones) {
  const hand = { L: bones.findIndex((b) => /^Hand\.?L$/.test(b.name)), R: bones.findIndex((b) => /^Hand\.?R$/.test(b.name)) };
  let freed = 0;
  for (const part of islands(idx, pos).slice(1)) {
    const c = [0, 0, 0];
    for (const v of part) for (let k = 0; k < 3; k++) c[k] += pos[v * 3 + k] / part.length;
    if (c[1] < 0.55 || c[1] > 1.05 || Math.abs(c[0]) < 0.12) continue;
    const hipLed = part.filter((v) => HIP_SIDE.test(bones[joints[v * 4]].name)).length;
    if (hipLed < part.length / 2) continue;
    const j = c[0] > 0 ? hand.L : hand.R;
    for (const v of part) {
      joints.set([j, 0, 0, 0], v * 4);
      weights.set([1, 0, 0, 0], v * 4);
    }
    freed += part.length;
  }
  return freed;
}

// ---------------------------------------------------------------- reference skeleton
const rigDoc = await io.read(SRC + RIG);
const r = onlyPrim(rigDoc).prim;
const rig = {
  pos: read(r.getAttribute('POSITION')),
  nor: read(r.getAttribute('NORMAL')),
  jnt: read(r.getAttribute('JOINTS_0')),
  wgt: read(r.getAttribute('WEIGHTS_0')),
  bones: boneSegments(rigDoc),
};
for (let i = 0; i < rig.wgt.length; i += 4) {
  const s = rig.wgt[i] + rig.wgt[i + 1] + rig.wgt[i + 2] + rig.wgt[i + 3] || 1;
  for (let k = 0; k < 4; k++) rig.wgt[i + k] /= s;
}

const renameClips = (doc) => {
  for (const a of doc.getRoot().listAnimations()) if (CLIPS[a.getName()]) a.setName(CLIPS[a.getName()]);
};

// Tropical: already has skeleton; just reduce.
{
  const doc = await io.read(SRC + RIG);
  renameClips(doc);
  await reduce(doc);
  await finish(doc, 'tropical.glb', [dedup(), prune({ keepLeaves: true })]);
}

// Cyber: own geometry and texture on Tropical's skeleton.
for (const m of MODELS) {
  const src = await io.read(SRC + m.src);
  const { node: srcNode, prim: sp } = onlyPrim(src);
  const M = srcNode.getWorldMatrix();
  if (Math.abs(M[0] - 1) + Math.abs(M[5] - 1) + Math.abs(M[10] - 1) + Math.abs(M[1]) + Math.abs(M[2]) + Math.abs(M[4]) > 1e-4) {
    throw new Error(`${m.src}: node with rotation/scale, not supported`);
  }
  srcNode.setTranslation([0, 0, 0]); // they were exported side by side (x = 1, 2, 3, 4)
  await reduce(src);

  const target = { pos: read(sp.getAttribute('POSITION')), nor: read(sp.getAttribute('NORMAL')) };
  const uv = read(sp.getAttribute('TEXCOORD_0'));
  const arms = fitArms(rig, target);
  console.log(`  ${m.src}: reference arms closed at L ${arms.L.toFixed(2)} rad, R ${arms.R.toFixed(2)} rad`);
  const { joints, weights, offBody } = transferWeights(posedRig(rig, arms), target);
  const srcIdx = sp.getIndices().getArray();
  const freed = rescueHands(cutFusedHands(srcIdx, joints, rig.bones).idx, target.pos, joints, weights, rig.bones);
  if (freed) console.log(`  ${m.src}: ${freed} hand vertices that were stuck to the thigh returned to the hand`);
  // cut again with corrected weights: the wrist reconnects to the forearm, only the bridge to the thigh is removed
  const cutResult = cutFusedHands(srcIdx, joints, rig.bones);
  const { idx, holes } = fillCutHoles(cutResult.idx, target.pos, cutResult.touched);
  if (cutResult.cut) console.log(`  ${m.src}: ${cutResult.cut} triangles connecting hand and hip removed, ${holes} holes filled`);

  const doc = await io.read(SRC + RIG);
  renameClips(doc);
  const { node, prim } = onlyPrim(doc);
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr, normalized = false) => doc.createAccessor().setType(type).setArray(arr).setNormalized(normalized).setBuffer(buf);
  for (const sem of prim.listSemantics()) prim.setAttribute(sem, null);
  prim
    .setAttribute('POSITION', acc('VEC3', target.pos))
    .setAttribute('NORMAL', acc('VEC3', target.nor))
    .setAttribute('TEXCOORD_0', acc('VEC2', uv))
    .setAttribute('JOINTS_0', acc('VEC4', joints))
    .setAttribute('WEIGHTS_0', acc('VEC4', weights))
    .setIndices(acc('SCALAR', target.pos.length / 3 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx)));

  const sm = sp.getMaterial();
  const mat = prim.getMaterial();
  const img = sm.getBaseColorTexture();
  const tex = doc.createTexture(m.out).setImage(img.getImage()).setMimeType(img.getMimeType());
  mat
    .setName(m.out.replace('.glb', ''))
    .setBaseColorTexture(tex)
    .setBaseColorFactor(sm.getBaseColorFactor())
    .setMetallicFactor(sm.getMetallicFactor())
    .setRoughnessFactor(sm.getRoughnessFactor());
  node.setName(m.out.replace('.glb', ''));
  node.getMesh().setName(m.out.replace('.glb', ''));
  console.log(`  ${m.src}: ${offBody} of ${target.pos.length / 3} vertices off-body (hair etc.) locked to torso/head`);
  await finish(doc, m.out, [dedup(), prune({ keepLeaves: true })]);
}

// Bartender: smaller textures; no prune (hair collision bones don't deform the mesh and would be removed).
{
  const doc = await io.read(SRC + 'Bartender_Mulher_v6.glb');
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85, slots: /^(?!baseColor).*/ }),
  );
  await finish(doc, 'bartender.glb');
}
