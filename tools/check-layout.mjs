// Checks the layout (blender/layout.json): pieces overlapping others and unsupported pieces.
// Uses bounding boxes from assets/inventario.json. An approximate check (oriented bounding
// box on the plane + height range), good for catching positioning errors.
//
// Usage: node tools/check-layout.mjs   (or npm run conferir)
import { readFileSync } from 'node:fs';

const layout = JSON.parse(readFileSync('blender/layout.json', 'utf8'));
const inventory = JSON.parse(readFileSync('assets/inventario.json', 'utf8'));
const DEG = Math.PI / 180;

// architecture and pieces that serve as "container" or support for others: excluded from overlap test
const SKIP = /Parede|Piso|Teto|Tubulacao|Portal|Coluna|Anel_Luminoso|Plataforma|Tapete|Cabine_Cortina|Cortina|Neon_|Placa_|Arandela|Camera|Espelho|Pendente|Globo/;
// pairs that touch on purpose
const ALLOWED = [
  [/Almofada/, /Sofa|Cama/],
  [/Planta|Palmeira|Orquidea/, /Vaso/],
  [/Toalha|Flor/, /Toalha/],
  [/./, /Estante_Bar|Balcao_Bar|Jacuzzi/],
];
const allowed = (a, b) => ALLOWED.some(([x, y]) => (x.test(a) && y.test(b)) || (x.test(b) && y.test(a)));

function footprint(it) {
  const info = inventory[layout.paths[it.a]];
  const s = it.s || [1, 1, 1];
  const yaw = it.r * DEG;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const corners = [
    [info.min[0], info.min[2]],
    [info.max[0], info.min[2]],
    [info.max[0], info.max[2]],
    [info.min[0], info.max[2]],
  ].map(([x, z]) => {
    x *= s[0];
    z *= s[2];
    return [it.p[0] + x * c + z * sn, it.p[2] - x * sn + z * c]; // rotation around Y, same as in game
  });
  return { name: it.a, corners, y0: it.p[1] + info.min[1] * s[1], y1: it.p[1] + info.max[1] * s[1], p: it.p };
}

// separating axis test for two rectangles on the plane; returns the minimum penetration
function overlap(a, b) {
  let min = Infinity;
  for (const poly of [a.corners, b.corners]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1;
      const nz = -(x2 - x1);
      const l = Math.hypot(nx, nz) || 1;
      const proj = (pts) => pts.map(([x, z]) => (x * nx + z * nz) / l);
      const pa = proj(a.corners);
      const pb = proj(b.corners);
      const d = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (d <= 0) return 0;
      min = Math.min(min, d);
    }
  }
  return min;
}
const inside = (f, x, z) => {
  // point inside rectangle (cross product with constant sign)
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = f.corners[i];
    const [x2, z2] = f.corners[(i + 1) % 4];
    const cr = (x2 - x1) * (z - z1) - (z2 - z1) * (x - x1);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign && Math.sign(cr) !== sign) return false;
    sign = Math.sign(cr);
  }
  return true;
};

let problems = 0;
for (const [rname, room] of Object.entries(layout.rooms)) {
  const all = room.items.map(footprint);
  const solid = all.filter((f) => !SKIP.test(f.name));

  // 1) overlapping: boxes intersect on the plane and in height
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      if (allowed(a.name, b.name)) continue;
      const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (dy < 0.03) continue;
      const d = overlap(a, b);
      if (d > 0.04) {
        problems++;
        console.log(`[${rname}] OVERLAPS  ${a.name} (${a.p.join(', ')})  x  ${b.name} (${b.p.join(', ')})  ~${(d * 100).toFixed(0)} cm`);
      }
    }
  }

  // 2) unsupported: base above floor with nothing just below (top of another piece within 4 cm)
  for (const f of all) {
    if (SKIP.test(f.name) || f.y0 < 0.06) continue;
    const [x, , z] = f.p;
    const supported = all.some((o) => o !== f && Math.abs(o.y1 - f.y0) < 0.04 && inside(o, x, z));
    // shelves, intermediate tops and steps are not the box top: accept if center is inside a known support
    const onKnown = all.some((o) => o !== f && /Estante_Bar|Plataforma|Jacuzzi|Cabine_Cortina|Vaso|Toalha|Sofa|Cama/.test(o.name) && inside(o, x, z) && o.y1 >= f.y0 - 0.04);
    if (!supported && !onKnown) {
      problems++;
      console.log(`[${rname}] UNSUPPORTED  ${f.name} (${f.p.join(', ')})  base at y=${f.y0.toFixed(2)}`);
    }
  }
}
console.log(problems ? `\n${problems} problem(s) to review.` : 'layout clean: no overlapping or floating pieces.');
