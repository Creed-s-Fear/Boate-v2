// Bounding box of each material in a GLB (reading vertices), with optional region filter.
// Usage: node tools/prims-glb.mjs <file.glb> [xmin xmax zmin zmax]
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const region = process.argv.slice(3, 7).map(Number);
const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;

function positions(accIndex) {
  const a = g.accessors[accIndex];
  const bv = g.bufferViews[a.bufferView];
  const stride = bv.byteStride || 12;
  const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const o = off + i * stride;
    out.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)]);
  }
  return out;
}

const fmt = (a) => a.map((v) => v.toFixed(3).padStart(7)).join(' ');
for (const mesh of g.meshes) {
  for (const p of mesh.primitives) {
    let pts = positions(p.attributes.POSITION);
    if (region.length === 4) pts = pts.filter(([x, , z]) => x >= region[0] && x <= region[1] && z >= region[2] && z <= region[3]);
    if (!pts.length) continue;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of pts) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[k]);
      max[k] = Math.max(max[k], v[k]);
    }
    // most common height levels (helps find table tops, steps, bases)
    const ys = {};
    for (const [, y] of pts) ys[y.toFixed(2)] = (ys[y.toFixed(2)] || 0) + 1;
    const top = Object.entries(ys).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([y]) => y).sort((a, b) => a - b).join(' ');
    console.log(`${(g.materials[p.material]?.name || '?').padEnd(20)} min ${fmt(min)}  max ${fmt(max)}  ${String(pts.length).padStart(5)}v  y: ${top}`);
  }
}
