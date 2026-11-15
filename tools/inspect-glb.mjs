// Lê todos os .glb de uma pasta (sem executar nada deles) e resume cada um:
// tamanho em metros, triângulos, materiais, texturas, animações.
// Uso: node tools/inspect-glb.mjs <pasta> [saida.json]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const dir = process.argv[2];
const outFile = process.argv[3];
if (!dir) {
  console.error('uso: node tools/inspect-glb.mjs <pasta> [saida.json]');
  process.exit(1);
}

function walk(d, list = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p, list);
    else if (name.toLowerCase().endsWith('.glb')) list.push(p);
  }
  return list;
}

function readJson(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é GLB');
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('chunk JSON ausente');
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

function nodeMatrix(n) {
  const m = new Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  const t = new Vector3(...(n.translation || [0, 0, 0]));
  const r = new Quaternion(...(n.rotation || [0, 0, 0, 1]));
  const s = new Vector3(...(n.scale || [1, 1, 1]));
  return m.compose(t, r, s);
}

function inspect(file) {
  const g = readJson(file);
  const box = new Box3();
  let tris = 0;
  let prims = 0;
  const nodes = g.nodes || [];
  const visit = (i, parent) => {
    const n = nodes[i];
    const world = parent.clone().multiply(nodeMatrix(n));
    if (n.mesh !== undefined) {
      for (const p of g.meshes[n.mesh].primitives) {
        prims++;
        const pos = g.accessors[p.attributes.POSITION];
        const count = p.indices !== undefined ? g.accessors[p.indices].count : pos.count;
        tris += Math.floor(count / 3);
        if (pos.min && pos.max) {
          const b = new Box3(new Vector3(...pos.min), new Vector3(...pos.max)).applyMatrix4(world);
          box.union(b);
        }
      }
    }
    for (const c of n.children || []) visit(c, world);
  };
  const scene = (g.scenes || [])[g.scene || 0] || { nodes: [] };
  for (const i of scene.nodes) visit(i, new Matrix4());

  const size = box.isEmpty() ? [0, 0, 0] : box.getSize(new Vector3()).toArray();
  const r = (v) => Math.round(v * 100) / 100;
  const mats = (g.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    return {
      name: m.name || '',
      color: (pbr.baseColorFactor || [1, 1, 1, 1]).map(r),
      metal: pbr.metallicFactor ?? 1,
      rough: pbr.roughnessFactor ?? 1,
      emissive: m.emissiveFactor ? m.emissiveFactor.map(r) : null,
      emissiveStrength: m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? null,
      alpha: m.alphaMode || 'OPAQUE',
      tex: !!(pbr.baseColorTexture || m.normalTexture || m.emissiveTexture),
      ext: Object.keys(m.extensions || {}),
    };
  });
  return {
    size: size.map(r),
    min: box.isEmpty() ? [0, 0, 0] : box.min.toArray().map(r),
    max: box.isEmpty() ? [0, 0, 0] : box.max.toArray().map(r),
    tris,
    prims,
    nodes: nodes.length,
    nodeNames: nodes.map((n) => n.name).filter(Boolean).slice(0, 40),
    mats,
    images: (g.images || []).length,
    animations: (g.animations || []).length,
    skins: (g.skins || []).length,
    extensions: g.extensionsUsed || [],
    generator: g.asset?.generator || '',
  };
}

const out = {};
let totalTris = 0;
for (const file of walk(dir).sort()) {
  const key = relative(dir, file).replace(/\\/g, '/');
  try {
    const info = inspect(file);
    info.kb = Math.round(statSync(file).size / 1024);
    out[key] = info;
    totalTris += info.tris;
    const em = info.mats.filter((m) => m.emissive && m.emissive.some((v) => v > 0)).length;
    console.log(
      `${key.split('/').pop().replace('.glb', '').padEnd(28)} ${info.size.map((v) => v.toFixed(2).padStart(6)).join(' ')}  ` +
        `y0=${info.min[1].toFixed(2).padStart(5)}  ${String(info.tris).padStart(6)} tris  ${info.prims}p ${info.mats.length}m ` +
        `${em}em ${info.images}img${info.animations ? ' anim' : ''}`,
    );
  } catch (e) {
    console.log(`${key}: ERRO ${e.message}`);
  }
}
console.log(`\n${Object.keys(out).length} arquivos, ${totalTris} triângulos no total`);
const gens = new Set(Object.values(out).map((o) => o.generator));
const exts = new Set(Object.values(out).flatMap((o) => o.extensions));
console.log('gerador:', [...gens].join(' | '), ' extensões:', [...exts].join(', ') || 'nenhuma');
if (outFile) writeFileSync(outFile, JSON.stringify(out, null, 1));
