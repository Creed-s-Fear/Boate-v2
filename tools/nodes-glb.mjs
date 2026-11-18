// Lists mesh nodes from a GLB and each one's bounding box (in meters, glTF axes).
// Usage: node tools/nodes-glb.mjs <file.glb> [filter]
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const file = process.argv[2];
const filter = (process.argv[3] || '').toLowerCase();
const buf = readFileSync(file);
const g = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const f = (v) => v.toArray().map((x) => x.toFixed(2).padStart(6)).join(' ');

function matrix(n) {
  if (n.matrix) return new Matrix4().fromArray(n.matrix);
  return new Matrix4().compose(
    new Vector3(...(n.translation || [0, 0, 0])),
    new Quaternion(...(n.rotation || [0, 0, 0, 1])),
    new Vector3(...(n.scale || [1, 1, 1])),
  );
}
function visit(i, parent, depth) {
  const n = g.nodes[i];
  const world = parent.clone().multiply(matrix(n));
  if (n.mesh !== undefined) {
    const box = new Box3();
    const mats = new Set();
    let tris = 0;
    for (const p of g.meshes[n.mesh].primitives) {
      const a = g.accessors[p.attributes.POSITION];
      box.union(new Box3(new Vector3(...a.min), new Vector3(...a.max)).applyMatrix4(world));
      mats.add(g.materials[p.material]?.name || '?');
      tris += (p.indices !== undefined ? g.accessors[p.indices].count : a.count) / 3;
    }
    const name = n.name || '(unnamed)';
    if (!filter || name.toLowerCase().includes(filter) || [...mats].join(' ').toLowerCase().includes(filter)) {
      console.log(`${' '.repeat(depth)}${name.padEnd(30 - depth)} min ${f(box.min)}  max ${f(box.max)}  ${String(tris).padStart(5)}t  ${[...mats].join(',')}`);
    }
  } else if (!filter) {
    console.log(`${' '.repeat(depth)}${n.name || '(unnamed)'} [empty]`);
  }
  for (const c of n.children || []) visit(c, world, depth + 1);
}
for (const i of g.scenes[g.scene || 0].nodes) visit(i, new Matrix4(), 0);
