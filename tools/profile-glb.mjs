// Cross-section profile of a piece: for vertices with |x - x0| < tolerance, shows the max
// height in each z band. Useful for finding sofa seat and backrest heights.
// Usage: node tools/profile-glb.mjs <file.glb> <x0> [tolerance] [material]
import { readFileSync } from 'node:fs';

const [file, x0s, tols = '0.08', matFilter = ''] = process.argv.slice(2);
const x0 = Number(x0s);
const tol = Number(tols);
const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const top = {};
const low = {};
for (const mesh of g.meshes) {
  for (const p of mesh.primitives) {
    const name = g.materials[p.material]?.name || '';
    if (matFilter && !name.includes(matFilter)) continue;
    const a = g.accessors[p.attributes.POSITION];
    const bv = g.bufferViews[a.bufferView];
    const stride = bv.byteStride || 12;
    const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    for (let i = 0; i < a.count; i++) {
      const o = off + i * stride;
      const x = buf.readFloatLE(o);
      if (Math.abs(x - x0) > tol) continue;
      const y = buf.readFloatLE(o + 4);
      const z = buf.readFloatLE(o + 8);
      const k = (Math.round(z / 0.05) * 0.05).toFixed(2);
      top[k] = Math.max(top[k] ?? -Infinity, y);
      low[k] = Math.min(low[k] ?? Infinity, y);
    }
  }
}
console.log(
  Object.keys(top)
    .sort((a, b) => a - b)
    .map((k) => `z${k}: ${low[k].toFixed(2)}..${top[k].toFixed(2)}`)
    .join('  '),
);
