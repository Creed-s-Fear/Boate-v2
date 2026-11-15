// Otimiza o GLB exportado do Blender para a web, sem mexer no .blend:
//  - solda vértices e simplifica as malhas (erro máximo pequeno: visualmente igual);
//  - objetos pequenos (copos, garrafas) são simplificados com mais força;
//  - comprime a geometria com meshopt (o jogo descomprime ao carregar).
// Nós, nomes, instâncias, luzes e propriedades personalizadas são preservados.
//
// Uso: node tools/optimize-glb.mjs blender/export/boate_raw.glb public/models/boate.glb
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('uso: node tools/optimize-glb.mjs <entrada.glb> <saida.glb>');
  process.exit(1);
}
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();

const tris = () =>
  root.listMeshes().reduce((t, m) => t + m.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = tris();

await doc.transform(dedup(), weld());

// Só simplifica peças densas e orgânicas (tecidos, estofados, plantas, copos e garrafas).
// Arquitetura, treliças, neon, placas e as peças grandes de curva brilhante (anel,
// plataforma, banheira) ficam como vieram: nelas a simplificação apaga barras finas ou
// aparece como ondulação no brilho.
const SIMPLIFY = new RegExp(
  '^(KIT_(Cabine_Cortina|Cortina_|Sofa_Curvo|Cama_Redonda|Poltrona|Puff|Almofada|Balcao_Bar|Banqueta|Mesa_|Planta|' +
    'Balde|Copo|Taca|Garrafa|Coqueteleira|Narguile|Cinzeiro|Bandeja|Lanterna|Pendente|Caixa_Som|Corda)' +
    '|JAC_(04|05|06|07|08|09|10|11|12|13|14|15|19|21|22|23|24|25|26|27|28|29|30)_)',
);
let touched = 0;
for (const mesh of root.listMeshes()) {
  const name = mesh.getName();
  if (!SIMPLIFY.test(name)) continue;
  // tamanho da peça (maior dimensão em metros)
  let size = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const min = pos.getMin([0, 0, 0]);
    const max = pos.getMax([0, 0, 0]);
    size = Math.max(size, max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  }
  // erro é relativo ao tamanho da malha: peça grande = erro de ~2 mm por metro;
  // objeto pequeno (visto de longe) aguenta bem mais.
  const small = size < 0.45;
  const options = { simplifier: MeshoptSimplifier, ratio: small ? 0.3 : 0.45, error: small ? 0.02 : 0.0012 };
  for (const prim of mesh.listPrimitives()) {
    const count = prim.getIndices()?.getCount() ?? 0;
    if (count < 180) continue; // menos de 60 triângulos: não compensa
    simplifyPrimitive(prim, options);
    touched++;
  }
}

await doc.transform(prune({ keepLeaves: true, keepAttributes: false }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);

const after = tris();
const mb = (f) => (statSync(f).size / 1048576).toFixed(2);
console.log(`malhas únicas: ${root.listMeshes().length}, primitivas simplificadas: ${touched}`);
console.log(`triângulos nas malhas únicas: ${before} -> ${after} (${Math.round((after / before) * 100)}%)`);
console.log(`arquivo: ${mb(src)} MB -> ${mb(dst)} MB`);
