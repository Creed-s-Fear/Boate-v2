// Histogram of vertex coordinates for a material in a region: helps measure
// frames and gaps. Usage: node tools/hist-glb.mjs <file.glb> <material> <axis x|y|z> [xmin xmax]
import { readFileSync } from 'node:fs';

const [file, matName, axis, xmin = -Infinity, xmax = Infinity] = process.argv.slice(2);
const k = { x: 0, y: 1, z: 2 }[axis];
const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const g = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const hist = {};
for (const mesh of g.meshes) {
  for (const p of mesh.primitives) {
    if ((g.materials[p.material]?.name || '') !== matName) continue;
    const a = g.accessors[p.attributes.POSITION];
    const bv = g.bufferViews[a.bufferView];
    const stride = bv.byteStride || 12;
    const off = binStart + (bv.byteOffset || 0) + (a.byteOffset || 0);
    for (let i = 0; i < a.count; i++) {
      const o = off + i * stride;
      const v = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
      if (v[0] < Number(xmin) || v[0] > Number(xmax)) continue;
      const key = v[k].toFixed(2);
      hist[key] = (hist[key] || 0) + 1;
    }
  }
}
const rows = Object.entries(hist).sort((a, b) => a[0] - b[0]);
console.log(rows.map(([v, n]) => `${v}:${n}`).join('  '));
