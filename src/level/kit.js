import * as THREE from 'three';
import { mergeMeshes } from '../engine/merge.js';
import { applyFx } from './shaderFx.js';

// Rules for the Blender-exported scene with KIT_* and JAC_* pieces.
// Everything here is decided by the piece or material NAME, so Blender doesn't need
// extra tags: just keep the piece names.

// ---------- materials ----------
// Final emissive strength for each material (the original uses intensity 8–12, which blows out the bloom)
// and whether it becomes an unlit material (cheaper; neon tubes don't need lighting).
const EMISSIVE = {
  KIT_neon_pink: [2.6, true],
  KIT_neon_cyan: [2.0, true],
  KIT_neon_violet: [2.5, true],
  KIT_neon_warm: [1.9, true],
  KIT_j_flame: [3.0, true],
  KIT_screen_cyan: [1.6, true],
  KIT_glow_pink: [1.5, false],
  KIT_flute_pink: [0.85, false],
  KIT_glow_pink_soft: [0.45, false],
  KIT_curtain: [0.6, false],
  KIT_curtain_violet: [0.6, false],
};
const WET = new Set(['KIT_floor_wet', 'KIT_j_floor']);
const WATER = 'KIT_j_water';

const TWEAK = {
  KIT_floor_wet: (m) => {
    m.envMapIntensity = 0.5;
  },
  KIT_j_floor: (m) => {
    m.envMapIntensity = 0.5;
  },
  KIT_curtain: (m) => {
    m.side = THREE.DoubleSide;
  },
  KIT_curtain_violet: (m) => {
    m.side = THREE.DoubleSide;
  },
  KIT_holo: (m) => {
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
  },
  KIT_holo_pink: (m) => {
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
  },
};

function convertMaterial(src) {
  const name = src.name;
  const em = EMISSIVE[name];
  if (em && em[1]) {
    return applyFx(new THREE.MeshBasicMaterial({ name, color: src.emissive.clone().multiplyScalar(em[0]) }));
  }
  // No clearcoat/sheen: MeshStandardMaterial compiles a much lighter shader.
  const m = new THREE.MeshStandardMaterial({
    name,
    color: src.color.clone(),
    roughness: src.roughness,
    metalness: src.metalness,
    side: src.side,
  });
  if (src.emissive && src.emissive.r + src.emissive.g + src.emissive.b > 0) {
    m.emissive.copy(src.emissive);
    m.emissiveIntensity = em ? em[0] : Math.min(src.emissiveIntensity ?? 1, 1.2);
  }
  if (src.transparent || src.opacity < 1) {
    m.transparent = true;
    m.opacity = src.opacity;
    m.depthWrite = false;
  }
  if (TWEAK[name]) TWEAK[name](m);
  return applyFx(m);
}

// ---------- collision ----------
// 'mesh' uses the piece's triangles; 'box' a box of its size; 'cyl' a cylinder.
// Full walls, floors and columns are flat slabs: the box collides the same and saves 2/3 of
// collision triangles (less memory and faster setup). Only pieces with gaps or steps keep
// their triangles: portal, wall with door cutout, bar, stage, sofa.
const RULES = [
  [/^(KIT_Parede_|KIT_Piso_|KIT_Coluna)/, 'box'],
  [/^(JAC_31_|JAC_32_|JAC_34_)/, 'box'],
  [/^(KIT_Portal|KIT_Balcao_Bar|KIT_Estante_Bar|KIT_Palco_|KIT_Sofa_Curvo)/, 'mesh'],
  [/^(JAC_02_|JAC_33_)/, 'mesh'],
  // bathtub: 15 cm step profile (climbs the rim on the outside, descends into the water on the inside)
  [/^JAC_01_Jacuzzi/, 'lathe', { profile: [[0, 0.15], [0.55, 0.15], [0.55, 0.3], [0.8, 0.3], [0.8, 0.45], [1.05, 0.45], [1.05, 0.6], [1.3, 0.6], [1.3, 0.75], [1.62, 0.75], [1.62, 0.6], [1.92, 0.6], [1.92, 0]] }],
  [/^KIT_Cabine_Cortina/, 'cyl', { r: 1.5, h: 0.13 }],
  [/^KIT_Cama_Redonda/, 'cyl', { r: 1.2, h: 0.6 }],
  [/^KIT_Gaiola_Danca/, 'cyl', { r: 0.85, h: 2.5 }],
  [/^KIT_Mesa_Lounge/, 'cyl', { r: 0.4, h: 0.75 }],
  [/^KIT_Mesa_Alta/, 'cyl', { r: 0.3, h: 1.08 }],
  [/^KIT_Banqueta_Bar/, 'cyl', { r: 0.21, h: 0.86 }],
  [/^KIT_Puff/, 'cyl', { r: 0.36, h: 0.45 }],
  [/^KIT_Poltrona/, 'cyl', { r: 0.47, h: 0.76 }],
  [/^KIT_Holo_Projetor/, 'cyl', { r: 0.42, h: 1.2 }],
  [/^KIT_Planta_Vaso/, 'cyl', { r: 0.3, h: 0.6 }],
  [/^KIT_Lanterna_Chao/, 'cyl', { r: 0.18, h: 1.0 }],
  [/^JAC_13_Vaso_Alto/, 'cyl', { r: 0.3, h: 0.75 }],
  [/^JAC_08_Mesa_Pedestal/, 'cyl', { r: 0.42, h: 0.58 }],
  [/^JAC_09_Mesa_Sofa/, 'cyl', { r: 0.24, h: 0.73 }],
  [/^(KIT_Porta_Portal|KIT_Divisoria_Vidro|KIT_Biombo_Trelica|KIT_Caixa_Som|KIT_Terminal|KIT_Corda_VIP)/, 'box'],
  [/^(JAC_05_Sofa|JAC_06_Chaise|JAC_10_Aparador|JAC_37_Painel_Trelica)/, 'box'],
];
// pieces that spin slowly (kept outside mesh merging)
const SPIN = [[/^KIT_Globo_Espelhado/, 0.35]];

const PIECE = /^(KIT_|JAC_|FILL_)/;
const isPieceRoot = (o) => PIECE.test(o.name) && !(o.parent && PIECE.test(o.parent.name));
const _box = new THREE.Box3();
const _b = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

export function isKitLevel(root) {
  let found = false;
  root.traverse((o) => {
    if (!found && /^(KIT_|JAC_)/.test(o.name)) found = true;
  });
  return found;
}

// Converts materials, marks wet floor/water and creates simple colliders (COL_*).
export function prepareKit(root) {
  const cache = new Map();
  const colMat = new THREE.MeshBasicMaterial();
  const pieces = [];
  const spinners = [];

  root.traverse((o) => {
    if (o.isMesh) {
      const src = o.material;
      if (!cache.has(src.name)) cache.set(src.name, convertMaterial(src));
      o.material = cache.get(src.name);
      if (WET.has(src.name)) o.userData.wet = true;
      if (src.name === WATER) o.userData.water = true;
    }
    if (o.isLight) {
      const ud = o.userData.cd !== undefined ? o.userData : o.parent ? o.parent.userData : {};
      if (ud.cd !== undefined) o.intensity = ud.cd;
      if (ud.dist !== undefined) o.distance = ud.dist;
      o.decay = 2;
      o.castShadow = false;
    }
    if ((o.isMesh || o.isGroup) && isPieceRoot(o)) pieces.push(o);
  });

  for (const piece of pieces) {
    for (const [re, speed] of SPIN) {
      if (re.test(piece.name)) {
        piece.userData.spin = speed;
        spinners.push(piece);
      }
    }
    const rule = RULES.find(([re]) => re.test(piece.name));
    if (!rule) continue;
    const [, type, opt] = rule;
    if (type === 'mesh') {
      piece.traverse((m) => {
        if (m.isMesh && !m.userData.water) m.userData.collide = true;
      });
      continue;
    }
    let col;
    if (type === 'cyl' || type === 'lathe') {
      // In world coordinates (the optimized GLB embeds scale in piece nodes):
      // solid of revolution on the vertical axis through the piece center, resting on its base.
      piece.updateWorldMatrix(true, true);
      _box.setFromObject(piece);
      _box.getCenter(_center);
      if (type === 'cyl') {
        col = new THREE.Mesh(new THREE.CylinderGeometry(opt.r, opt.r, opt.h, 20), colMat);
        col.position.set(_center.x, _box.min.y + opt.h / 2, _center.z);
      } else {
        const points = opt.profile.map(([r, y]) => new THREE.Vector2(r, y));
        col = new THREE.Mesh(new THREE.LatheGeometry(points, 40), colMat);
        col.position.set(_center.x, _box.min.y, _center.z);
      }
      col.name = 'COL_' + piece.name;
      root.add(col);
      continue;
    } else {
      // box the size of the piece, in its local frame
      _box.makeEmpty();
      piece.updateWorldMatrix(true, true);
      const inv = piece.matrixWorld.clone().invert();
      piece.traverse((m) => {
        if (!m.isMesh) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        _b.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
        _box.union(_b);
      });
      _box.getSize(_size);
      _box.getCenter(_center);
      col = new THREE.Mesh(new THREE.BoxGeometry(_size.x, _size.y, _size.z), colMat);
      col.position.copy(_center);
    }
    col.name = 'COL_' + piece.name;
    piece.add(col);
  }
  return { materials: cache.size, pieces: pieces.length, spinners };
}

// Merges static meshes in a group into one mesh per material (and per layer):
// hundreds of pieces become a few dozen draw calls.
export function batchStatic(container, skip) {
  container.updateWorldMatrix(true, true);
  const inv = container.matrixWorld.clone().invert();
  const buckets = new Map();
  let merged = 0;
  container.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isInstancedMesh || skip(o)) return;
    const layer = o.layers.mask;
    const key = o.material.uuid + '|' + layer;
    if (!buckets.has(key)) buckets.set(key, { material: o.material, layer, meshes: [], wet: false });
    const b = buckets.get(key);
    b.meshes.push(o);
    if (o.userData.wet) b.wet = true;
    merged++;
  });
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeMeshes(b.meshes, { inverse: inv }), b.material);
    mesh.name = 'BATCH_' + b.material.name;
    mesh.layers.mask = b.layer;
    if (b.wet) mesh.userData.wet = true;
    container.add(mesh);
  }
  for (const b of buckets.values()) for (const o of b.meshes) o.removeFromParent();
  return { merged, batches: buckets.size };
}
