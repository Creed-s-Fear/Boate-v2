// Generates blender/layout.json: the floor plan of the club and the jacuzzi suite using
// pieces from assets/drive. This is the single source of the assembly: the browser uses
// it in the preview (?kit) and Blender reproduces it via MCP.
//
// Conventions: metres, glTF axes (Y up, piece front = +Z), yaw in degrees around Y.
// In Blender: (x, y, z) -> (x, -z, y) and yaw becomes rotation around Z.
//
// Usage: node tools/make-layout.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const inventory = JSON.parse(readFileSync('assets/inventario.json', 'utf8'));
const pathOf = {};
for (const key of Object.keys(inventory)) pathOf[key.split('/').pop().replace('.glb', '')] = key;

const rooms = {
  club: { label: 'Lounge', items: [], fills: [], lights: [] },
  spa: { label: 'Jacuzzi', items: [], fills: [], lights: [] },
  shared: { label: '', items: [], fills: [], lights: [] },
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = Math.PI / 180;

function add(room, a, x, y, z, r = 0, extra = {}) {
  if (!pathOf[a]) throw new Error('unknown piece: ' + a);
  rooms[room].items.push({ a, p: [r3(x), r3(y), r3(z)], r: r3(r), ...extra });
}
function fill(room, n, size, pos, m, extra = {}) {
  rooms[room].fills.push({ n, size: size.map(r3), p: pos.map(r3), m, ...extra });
}
function light(room, c, i, d, pos) {
  rooms[room].lights.push({ c, i, d, p: pos.map(r3) });
}
// places a piece relative to another: (lx, lz) in the parent's frame rotated by `yaw`
function rel(px, pz, yaw, lx, lz) {
  const s = Math.sin(yaw * DEG);
  const c = Math.cos(yaw * DEG);
  return [px + lx * c + lz * s, pz - lx * s + lz * c];
}

// =====================================================================
// LOUNGE: interior x -6..6, z -12..12, walls 3.0 m, ceiling at 3.5 m
// =====================================================================
const HW = 6;
const HL = 12;
const WT = 0.13; // wall origin offset so the face sits at the interior boundary
const CEIL = 3.5;
const LISA = 'KIT_Parede_Lisa';
const PAINEL = 'KIT_Parede_Painel';

// walls
const slotsX = [-4.8, -2.4, 0, 2.4, 4.8];
[PAINEL, LISA, null, LISA, PAINEL].forEach((a, i) => a && add('club', a, slotsX[i], 0, -HL - WT, 0));
[LISA, PAINEL, null, PAINEL, LISA].forEach((a, i) => a && add('club', a, slotsX[i], 0, HL + WT, 180));
for (let i = 0; i < 10; i++) {
  const z = -10.8 + i * 2.4;
  add('club', i % 2 ? LISA : PAINEL, -HW - WT, 0, z, 90);
  add('club', Math.abs(z) < 5 ? LISA : PAINEL, HW + WT, 0, z, -90);
}
// back portal (open, leads to the corridor) and front entrance (closed door)
for (const [z, r, n] of [
  [-HL - WT, 0, 'fundo'],
  [HL + WT, 180, 'entrada'],
]) {
  add('club', 'KIT_Portal', 0, 0, z, r);
  const zc = z > 0 ? HL + 0.125 : -HL - 0.125;
  fill('club', `portal_${n}_esq`, [0.17, 3.0, 0.25], [-1.115, 1.5, zc], 'KIT_metal_black', { collide: true });
  fill('club', `portal_${n}_dir`, [0.17, 3.0, 0.25], [1.115, 1.5, zc], 'KIT_metal_black', { collide: true });
  fill('club', `portal_${n}_topo`, [2.06, 0.38, 0.25], [0, 2.81, zc], 'KIT_metal_black');
}
add('club', 'KIT_Porta_Portal', 0, 0, HL + WT, 180);
// dark strip between the top of the walls (3.0) and the ceiling (3.5), with neon cornice
fill('club', 'faixa_fundo', [12.5, 0.5, 0.25], [0, 3.25, -HL - 0.125], 'KIT_metal_black');
fill('club', 'faixa_frente', [12.5, 0.5, 0.25], [0, 3.25, HL + 0.125], 'KIT_metal_black');
fill('club', 'faixa_esq', [0.25, 0.5, 24.5], [-HW - 0.125, 3.25, 0], 'KIT_metal_black');
fill('club', 'faixa_dir', [0.25, 0.5, 24.5], [HW + 0.125, 3.25, 0], 'KIT_metal_black');
fill('club', 'sanca_esq', [0.03, 0.03, 23.4], [-HW + 0.03, 3.04, 0], 'KIT_neon_pink');
fill('club', 'sanca_dir', [0.03, 0.03, 23.4], [HW - 0.03, 3.04, 0], 'KIT_neon_cyan');
for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('club', 'KIT_Coluna', sx * 5.73, 0, sz * 11.73, 0);

// floor and ceiling (4 m modules); in the central corridor some floor sections have neon
[-4, 0, 4].forEach((x, ix) => {
  [-10, -6, -2, 2, 6, 10].forEach((z, iz) => {
    if (x === 0 && [-10, -2, 6].includes(z)) {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) add('club', 'KIT_Piso_Neon', x + dx, 0, z + dz, 0);
    } else {
      add('club', 'KIT_Piso_Modulo', x, 0, z, x === 0 ? 90 : 0);
    }
    add('club', 'KIT_Teto_Modulo', x, CEIL, z, ((ix + iz) % 2) * 180);
  });
});

// curtain booths (left), opening facing the central corridor
const BX = -4.1;
[6.4, 0.4, -5.6].forEach((bz, i) => {
  const yaw = 90;
  const at = (lx, lz) => rel(BX, bz, yaw, lx, lz);
  add('club', 'KIT_Cabine_Cortina', BX, 0, bz, yaw);
  let [x, z] = at(0, -0.72);
  add('club', 'KIT_Sofa_Curvo', x, 0.13, z, yaw);
  // table slightly in front of the seat (leg room)
  [x, z] = at(0, 0.46);
  add('club', 'KIT_Mesa_Lounge', x, 0.13, z, yaw);
  const top = 0.13 + 0.75;
  [x, z] = at(0.02, 0.44);
  add('club', i === 1 ? 'KIT_Narguile' : 'KIT_Balde_Gelo', x, top, z, 30);
  [x, z] = at(-0.29, 0.58);
  add('club', i === 1 ? 'KIT_Copo_Whisky' : 'KIT_Taca_Champanhe', x, top, z, 0);
  [x, z] = at(0.29, 0.32);
  add('club', i === 1 ? 'KIT_Copo_Whisky' : 'KIT_Taca_Champanhe', x, top, z, 0);
  [x, z] = at(0.2, 0.66);
  add('club', 'KIT_Luminaria_Cubo', x, top, z, 15);
  // (the curved sofa already has modelled cushions: don't place extras on top)
  light('club', '#ff2bd6', 10, 6.5, [BX + 0.3, 2.1, bz]);
});
// between booths: lattice screens, plant and wall sconces
for (const z of [3.4, -2.6]) {
  add('club', 'KIT_Biombo_Trelica', -5.2, 0, z, 0);
  add('club', 'KIT_Biombo_Trelica', -3.86, 0, z, 0);
  add('club', 'KIT_Planta_Vaso', -2.7, 0, z, 40);
}
for (const z of [8.4, 3.4, -2.6, -8.4]) add('club', 'KIT_Arandela', -HW + 0.14, 2.05, z + 0.62, 90);

// bar (right): 4 curved modules, shelves behind, stools in front
const barZ = [-3.765, -1.255, 1.255, 3.765];
const barX = 3.45;
barZ.forEach((bz, i) => {
  add('club', 'KIT_Balcao_Bar', barX, 0, bz, -90);
  // countertop: approximate curve z_l = -0.2 - 0.26 x²
  const on = (lx) => rel(barX, bz, -90, lx, -0.2 - 0.26 * lx * lx);
  const sets = [
    ['KIT_Coqueteleira', 'KIT_Taca_Martini', 'KIT_Copo_Highball', 'KIT_Garrafa_Rosa'],
    ['KIT_Bandeja', 'KIT_Garrafa_Neon', 'KIT_Copo_Whisky', 'KIT_Cinzeiro'],
    ['KIT_Copo_Highball', 'KIT_Balde_Gelo', 'KIT_Taca_Champanhe', 'KIT_Garrafa_Azul'],
    ['KIT_Garrafa_Whisky', 'KIT_Copo_Whisky', 'KIT_Taca_Martini', 'KIT_Luminaria_Cubo'],
  ][i];
  [-0.82, -0.3, 0.28, 0.8].forEach((lx, k) => {
    const [x, z] = on(lx);
    add('club', sets[k], x, 1.12, z, k * 47);
    if (sets[k] === 'KIT_Bandeja') {
      for (const [dx, dz] of [[-0.1, 0], [0.08, 0.08], [0.06, -0.1]]) add('club', 'KIT_Copo_Shot', x + dx, 1.145, z + dz, 0);
    }
  });
});
const shelfBottles = ['KIT_Garrafa_Neon', 'KIT_Garrafa_Rosa', 'KIT_Garrafa_Vinho', 'KIT_Garrafa_Whisky', 'KIT_Garrafa_Azul'];
[-3.72, -1.86, 0, 1.86, 3.72].forEach((ez, i) => {
  add('club', 'KIT_Estante_Bar', 5.6, 0, ez, -90);
  // bottles on the 3 glass shelves and glasses on the countertop
  [1.035, 1.435, 1.835].forEach((y, s) => {
    const n = s === 2 ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const lx = (k - (n - 1) / 2) * (s === 2 ? 0.28 : 0.27);
      const [x, z] = rel(5.6, ez, -90, lx, 0.02);
      add('club', shelfBottles[(i * 3 + s * 2 + k) % shelfBottles.length], x, y, z, (i + k * 3 + s) * 37);
    }
  });
  for (const [lx, a] of [[-0.55, 'KIT_Copo_Highball'], [-0.4, 'KIT_Copo_Shot'], [0.45, 'KIT_Taca_Martini'], [0.6, 'KIT_Coqueteleira']]) {
    const [x, z] = rel(5.6, ez, -90, lx + (i % 2) * 0.08, 0.05);
    add('club', a, x, 0.63, z, i * 60);
  }
});
for (let i = 0; i < 8; i++) add('club', 'KIT_Banqueta_Bar', 2.72 + (i % 2 ? 0.22 : 0), 0, -4.4 + i * (8.8 / 7), i * 40);
for (let i = 0; i < 6; i++) add('club', 'KIT_Pendente', 3.55, 3.03, -4.25 + i * 1.7, i * 60);
light('club', '#19f0e0', 12, 7, [2.9, 2.2, -2.6]);
light('club', '#19f0e0', 12, 7, [2.9, 2.2, 2.6]);
add('club', 'KIT_Placa_Drink', HW - 0.02, 2.15, 7.2, -90);
add('club', 'KIT_Placa_Coracao', HW - 0.02, 2.2, -7.2, -90);

// back: signs, VIP ropes, lanterns, speakers
add('club', 'KIT_Placa_Lotus', -2.3, 2.45, -HL + 0.1, 0);
add('club', 'KIT_Placa_Glifos', 2.5, 2.25, -HL + 0.1, 0);
add('club', 'KIT_Corda_VIP', -2.15, 0, -10.5, 0);
add('club', 'KIT_Corda_VIP', 2.15, 0, -10.5, 0);
add('club', 'KIT_Lanterna_Chao', -1.45, 0, -11.45, 0);
add('club', 'KIT_Lanterna_Chao', 1.45, 0, -11.45, 0);
add('club', 'KIT_Caixa_Som', -3.35, 0, -11.5, 12);
add('club', 'KIT_Caixa_Som', 3.35, 0, -11.5, -12);
light('club', '#ff4f9a', 12, 7, [0, 2.4, -10.2]);
// back left corner: lounge with armchairs
add('club', 'KIT_Tapete', -4.0, 0.012, -9.5, 0);
add('club', 'KIT_Mesa_Lounge', -4.0, 0, -9.5, 0);
add('club', 'KIT_Poltrona', -5.05, 0, -9.5, 90);
add('club', 'KIT_Poltrona', -4.0, 0, -10.75, 0);
add('club', 'KIT_Puff', -2.95, 0, -9.2, 0);
add('club', 'KIT_Garrafa_Whisky', -4.05, 0.75, -9.45, 20);
add('club', 'KIT_Copo_Whisky', -3.82, 0.75, -9.62, 0);
add('club', 'KIT_Copo_Whisky', -4.2, 0.75, -9.68, 0);
add('club', 'KIT_Cinzeiro', -3.9, 0.75, -9.3, 30);
// floor cushions on the rug (the kit's loose cushions go here, not on the sofas)
add('club', 'KIT_Almofada', -3.45, 0.025, -10.05, 20);
add('club', 'KIT_Almofada', -4.75, 0.025, -8.5, -15);
// back right corner: dance cage and tall table
add('club', 'KIT_Gaiola_Danca', 4.55, 0, -10.3, 0);
add('club', 'KIT_Mesa_Alta', 2.5, 0, -8.6, 0);
add('club', 'KIT_Banqueta_Bar', 1.95, 0, -8.35, 0);
add('club', 'KIT_Banqueta_Bar', 2.95, 0, -9.05, 0);
add('club', 'KIT_Taca_Martini', 2.42, 1.08, -8.55, 0);
add('club', 'KIT_Copo_Highball', 2.62, 1.08, -8.68, 0);

// centre: holographic projector and mirror ball
add('club', 'KIT_Holo_Projetor', -0.85, 0, 2.4, 0);
add('club', 'KIT_Globo_Espelhado', 0.35, 2.36, -3.2, 0);

// front right: pole dance stage, glass dividers, poufs
add('club', 'KIT_Palco_PoleDance', 3.95, 0, 9.55, -140);
add('club', 'KIT_Divisoria_Vidro', 2.55, 0, 6.95, 0);
add('club', 'KIT_Divisoria_Vidro', 4.15, 0, 6.95, 0);
add('club', 'KIT_Puff', 1.75, 0, 8.3, 0);
add('club', 'KIT_Puff', 2.1, 0, 10.7, 0);
add('club', 'KIT_Mesa_Alta', 1.3, 0, 9.5, 0);
add('club', 'KIT_Garrafa_Neon', 1.3, 1.08, 9.5, 0);
light('club', '#9a4bff', 12, 7, [3.4, 2.5, 9.0]);
// front left: VIP alcove with round bed behind curtains
add('club', 'KIT_Cama_Redonda', -4.3, 0, 10.2, 135);
add('club', 'KIT_Cortina_Reta_Violeta', -5.05, 0, 8.5, 0);
add('club', 'KIT_Cortina_Reta_Violeta', -3.3, 0, 8.5, 0);
add('club', 'KIT_Cortina_Fios_Neon', -2.45, 0, 9.35, 90);
add('club', 'KIT_Cortina_Fios_Neon', -2.45, 0, 10.95, 90);
add('club', 'KIT_Luminaria_Cubo', -5.5, 0, 9.0, 0, { s: [3, 3, 3] });
light('club', '#ff2bd6', 9, 5.5, [-4.2, 2.2, 10.2]);
// front wall: mirrors, speakers, terminal, lanterns, cameras
add('club', 'KIT_Espelho_Neon', -4.8, 1.6, HL - 0.03, 180);
add('club', 'KIT_Espelho_Neon', 4.8, 1.6, HL - 0.03, 180);
add('club', 'KIT_Terminal', 1.75, 0, 11.6, 180);
add('club', 'KIT_Lanterna_Chao', -1.45, 0, 11.45, 0);
add('club', 'KIT_Caixa_Som', -2.4, 0, 11.45, 170);
add('club', 'KIT_Camera_Seguranca', 5.75, 2.82, 11.75, -135);
add('club', 'KIT_Camera_Seguranca', -5.75, 2.82, -11.75, 45);
// neon art on the side walls
add('club', 'KIT_Neon_Anel_Rosa', -HW + 0.05, 1.95, 3.25, 90);
add('club', 'KIT_Neon_Anel_Ciano', -HW + 0.05, 1.75, 3.6, 90);
add('club', 'KIT_Neon_Anel_Rosa', -HW + 0.05, 1.95, -2.75, 90);
add('club', 'KIT_Neon_Anel_Ciano', -HW + 0.05, 1.75, -2.4, 90);
add('club', 'KIT_Neon_Curva_Rosa', HW - 0.05, 1.7, 8.9, -90);
add('club', 'KIT_Neon_Reto_Ciano', HW - 0.05, 1.45, -9.0, -90);
add('club', 'KIT_Neon_Canto_Rosa', HW - 0.05, 1.55, -8.3, -90);

// corridor: x -1..1, z -16.25..-12.25, ceiling 3.0
const CZ0 = -HL - 0.25;
const CL = 4.0;
for (const z of [CZ0 - 1, CZ0 - 3]) {
  add('club', 'KIT_Piso_Neon', 0, 0, z, 0);
  add('club', LISA, -1 - WT, 0, z, 90, { s: [2.0 / 2.4, 1, 1] });
  add('club', LISA, 1 + WT, 0, z, -90, { s: [2.0 / 2.4, 1, 1] });
}
fill('club', 'corredor_teto', [2.52, 0.2, CL], [0, 3.1, CZ0 - CL / 2], 'KIT_metal_black');
[0.55, 1.75, 2.95].forEach((d, i) => {
  const m = i % 2 ? 'KIT_neon_pink' : 'KIT_neon_cyan';
  const z = CZ0 - d;
  fill('club', `corredor_neon${i}_e`, [0.035, 2.9, 0.035], [-0.92, 1.45, z], m);
  fill('club', `corredor_neon${i}_d`, [0.035, 2.9, 0.035], [0.92, 1.45, z], m);
  fill('club', `corredor_neon${i}_t`, [1.875, 0.035, 0.035], [0, 2.9, z], m);
});
add('club', 'KIT_Placa_Coracao', 0, 2.68, CZ0 - CL + 0.03, 0);
light('club', '#ff7ab8', 5, 4.5, [0, 2.3, CZ0 - CL + 1.0]); // lights the gold door at the end of the corridor

// =====================================================================
// JACUZZI: 10 x 10 m room, ceiling 3.2. The local frame of the reference image
// (back at -Z, left wall at -X) is rotated 90° in world space: the left wall,
// where the door is, connects to the end of the corridor.
// =====================================================================
const DOOR_X = -4.1; // door position along the left wall (measured in the model)
const SCX = DOOR_X; // room centre in world (x): the door lands at x = 0
const SCZ = CZ0 - CL - 5.2; // room centre in world (z)
const S = (xl, zl) => [SCX + zl, SCZ - xl];
function spa(a, xl, y, zl, r = 0, extra = {}, room = 'spa') {
  const [x, z] = S(xl, zl);
  add(room, a, x, y, z, r + 90, extra);
}
function spaLight(c, i, d, xl, y, zl) {
  const [x, z] = S(xl, zl);
  light('spa', c, i, d, [x, y, z]);
}

for (const sx of [-2.5, 2.5]) for (const sz of [-2.5, 2.5]) spa('JAC_31_Piso', sx, 0, sz, 0);
spa('JAC_35_Teto', 0, 3.2, 0, 0);
spa('JAC_36_Tubulacao', 0, 2.66, 0, 0);
spa('JAC_32_Parede_Fundo', 0, 0, -5, 0);
spa('JAC_34_Parede_Direita', 5, 0, 0, -90);
spa('JAC_34_Parede_Direita', 0, 0, 5, 180);
// left wall goes in "shared": visible from the corridor even when the room is off.
// `cut` = door opening (in piece coordinates) to cut out; becomes a boolean in Blender.
spa('JAC_33_Parede_Esquerda', -5, 0, 0, 90, { cut: { x: [DOOR_X - 0.53, DOOR_X + 0.53], y: [0, 2.23] }, n: 'JAC_33_Parede_Esquerda' }, 'shared');

spa('JAC_02_Plataforma_Degraus', 0, 0, 0, 0);
spa('JAC_01_Jacuzzi', 0, 0, 0, 0);
spa('JAC_03_Anel_Luminoso', 0, 3.2 - 1.04, 0, 0);
for (const a of [45, 135, 225, 315]) spa('JAC_04_Cortina', 3.02 * Math.sin(a * DEG), 0, 3.02 * Math.cos(a * DEG), a);
spaLight('#ff2bd6', 7, 9, 0, 2.75, 0);
spaLight('#2ff5e6', 2.5, 5, 0, 1.5, 0);

// back: sofas, cushions, side tables with lamp, potted plants
for (const sx of [-2.6, 2.6]) {
  spa('JAC_05_Sofa', sx, 0, -4.3, 0);
  // cushions upright on the seat (top at 0.51 m), leaning against the backrest (face at z -0.25 from sofa)
  spa('JAC_07_Almofada', sx - 0.78, 0.52, -4.43, 10, { rx: -12 });
  spa('JAC_07_Almofada', sx + 0.8, 0.52, -4.43, -8, { rx: -12 });
  spa('JAC_17_Luminaria_Piso', sx + Math.sign(sx) * 1.6, 0, -3.72, 0);
}
for (const sx of [-1.02, 1.02]) {
  spa('JAC_09_Mesa_Sofa', sx, 0, -4.5, 0);
  spa('JAC_18_Luminaria_Mesa', sx, 0.73, -4.5, 0);
}
spa('JAC_26_Portavela', -1.02 + 0.13, 0.73, -4.42, 0);
spa('JAC_13_Vaso_Alto', 0, 0, -4.48, 0);
spa('JAC_11_Planta_Folha_Larga', 0, 0.5, -4.48, 0);
for (const sx of [-4.42, 4.42]) {
  spa('JAC_13_Vaso_Alto', sx, 0, -4.42, 0);
  spa('JAC_12_Palmeira', sx, 0.5, -4.42, sx > 0 ? 90 : 0);
}
spa('JAC_13_Vaso_Alto', 4.5, 0, 4.5, 0);
spa('JAC_11_Planta_Folha_Larga', 4.5, 0.5, 4.5, 120);
spaLight('#ff4f9a', 4, 6, 0, 1.9, -3.6);

// chaise longues (feet facing the bathtub) and pedestal tables with drinks
// The door is in the front-left corner (x -5, z 4.1): this strip is kept clear for entry.
spa('JAC_06_Chaise', 1.15, 0, 3.95, -164);
spa('JAC_06_Chaise', 3.12, 0, 3.12, -135); // headrest clear of the corner vase
const M1 = [2.3, 4.35];
spa('JAC_08_Mesa_Pedestal', M1[0], 0, M1[1], 0);
spa('JAC_24_Bandeja', M1[0], 0.58, M1[1], 0);
spa('JAC_21_Garrafa_Cristal', M1[0] - 0.07, 0.6, M1[1] + 0.05, 0);
spa('JAC_22_Copo_Baixo', M1[0] + 0.13, 0.6, M1[1] + 0.08, 0);
spa('JAC_22_Copo_Baixo', M1[0] + 0.05, 0.6, M1[1] - 0.12, 0);
const M2 = [4.25, 2.35];
spa('JAC_08_Mesa_Pedestal', M2[0], 0, M2[1], 0);
spa('JAC_23_Taca_Coupe', M2[0] - 0.1, 0.58, M2[1] + 0.1, 0);
spa('JAC_23_Taca_Coupe', M2[0] + 0.13, 0.58, M2[1] + 0.05, 0);
spa('JAC_25_Tigela_Frutas', M2[0], 0.58, M2[1] - 0.17, 0);
spa('JAC_26_Portavela', M2[0] - 0.2, 0.58, M2[1] - 0.11, 0);

// dresser on the right wall
const AP = [4.72, 0.75];
spa('JAC_10_Aparador', AP[0], 0, AP[1], -90);
const apTop = 0.81;
// left to right on the top (1.8 m): rolled towels (crosswise), candle and
// bottle, folded towels with flower, diffuser and bottle, orchid in vase
spa('JAC_19_Toalha_Enrolada', AP[0], apTop, AP[1] - 0.74, 90);
spa('JAC_19_Toalha_Enrolada', AP[0], apTop, AP[1] - 0.52, 90);
spa('JAC_19_Toalha_Enrolada', AP[0], apTop + 0.19, AP[1] - 0.63, 90);
spa('JAC_29_Vela_Pilar', AP[0] + 0.08, apTop, AP[1] - 0.3, 0);
spa('JAC_28_Frasco_Spa', AP[0] - 0.08, apTop, AP[1] - 0.22, 0);
spa('JAC_20_Toalha_Dobrada', AP[0], apTop, AP[1] + 0.08, 90);
spa('JAC_20_Toalha_Dobrada', AP[0], apTop + 0.1, AP[1] + 0.08, 90);
spa('JAC_30_Flor_Orquidea', AP[0] - 0.02, apTop + 0.2, AP[1] + 0.08, 60, { rx: -80 });
spa('JAC_27_Difusor', AP[0] + 0.06, apTop, AP[1] + 0.38, 0);
spa('JAC_28_Frasco_Spa', AP[0] - 0.09, apTop, AP[1] + 0.44, 0);
spa('JAC_15_Vaso_Orquidea', AP[0], apTop, AP[1] + 0.68, 0);
spa('JAC_14_Orquidea', AP[0], apTop + 0.2, AP[1] + 0.68, -90);
spaLight('#ffb070', 4, 5, 4.0, 1.7, 0.75);

// lanterns and candles around the platform; lattice panels near the door
// lanterns around the platform, in the gaps between furniture (the 22° one was inside the chaise longue)
for (const a of [58, 158, 202, 338]) spa('JAC_16_Lanterna', 3.4 * Math.sin(a * DEG), 0, 3.4 * Math.cos(a * DEG), a);
for (const a of [68, 112, 248, 292]) spa('JAC_29_Vela_Pilar', 2.72 * Math.sin(a * DEG), 0.15, 2.72 * Math.cos(a * DEG), 0);
for (const a of [90, 270]) spa('JAC_26_Portavela', 2.72 * Math.sin(a * DEG), 0.15, 2.72 * Math.cos(a * DEG), 0);
spa('JAC_16_Lanterna', -0.55, 0, 4.62, 0);
// standalone lattice panels: they have a smooth back, so they lean against the bed alcove wall
add('club', 'JAC_37_Painel_Trelica', -3.75, 0, HL - 0.05, 180);
add('club', 'JAC_37_Painel_Trelica', -2.85, 0, HL - 0.05, 180);

// =====================================================================
// DOOR between the corridor and the jacuzzi: hinge at x = +0.53, opens inward
// =====================================================================
const doors = [
  {
    n: 'spa',
    a: 'JAC_38_Porta',
    type: 'hinge',
    angle: -96,
    rooms: 'club,spa',
    pivot: [0.53, 0, r3(SCZ + 5.1)],
    r: 180,
    offset: [0.53, 0, 0],
  },
];

const out = {
  nota: 'Generated by tools/make-layout.mjs. Metres, glTF axes (Y up), yaw in degrees around Y.',
  assetsBase: 'assets/drive/Objetos/',
  paths: pathOf,
  rooms,
  doors,
  spawn: { p: [0.9, 0.02, 9.3], yaw: 0 },
  spaCenter: [r3(SCX), 0, r3(SCZ)],
};
writeFileSync('blender/layout.json', JSON.stringify(out, null, 1));
const count = (k) => Object.values(rooms).reduce((t, r) => t + r[k].length, 0);
const used = new Set(Object.values(rooms).flatMap((r) => r.items.map((i) => i.a)));
used.add('JAC_38_Porta');
const unused = Object.keys(pathOf).filter((k) => !used.has(k));
console.log(`layout.json: ${count('items')} pieces, ${count('fills')} fills, ${count('lights')} lights`);
console.log(`models used: ${used.size} of ${Object.keys(pathOf).length}`);
console.log('unused:', unused.join(', ') || 'none');
