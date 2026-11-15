import { Float32BufferAttribute } from 'three';
import { buildBlockout } from './blockout.js';

// Procura public/models/level.json ({ "glb": "boate.glb", "ktx2": true|false }).
// Se existir, carrega o GLB exportado do Blender; senão usa o cenário provisório.
export async function loadLevel(renderer, onProgress) {
  let manifest = null;
  try {
    const res = await fetch('models/level.json', { cache: 'no-cache' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('json')) manifest = await res.json();
  } catch {
    manifest = null;
  }

  if (!manifest || !manifest.glb) {
    onProgress(1, 'Cenário provisório');
    return { root: buildBlockout(), source: 'provisório' };
  }

  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (manifest.ktx2) {
    const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
    loader.setKTX2Loader(new KTX2Loader().setTranscoderPath('basis/').detectSupport(renderer));
  }
  const gltf = await loader.loadAsync('models/' + manifest.glb, (e) => {
    onProgress(e.total ? e.loaded / e.total : 0.5, 'Carregando cenário…');
  });
  gltf.scene.name = 'Level';
  dequantize(gltf.scene);
  return { root: gltf.scene, source: manifest.glb };
}

// O GLB otimizado guarda posições e normais como inteiros compactados. A colisão e a
// junção de malhas trabalham em metros, então voltamos esses atributos para float uma
// vez no carregamento (cada geometria compartilhada é convertida uma só vez).
function dequantize(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh || done.has(o.geometry)) return;
    done.add(o.geometry);
    for (const name of ['position', 'normal']) {
      const a = o.geometry.attributes[name];
      if (!a || (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute)) continue;
      const out = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        out[i * 3] = a.getX(i);
        out[i * 3 + 1] = a.getY(i);
        out[i * 3 + 2] = a.getZ(i);
      }
      o.geometry.setAttribute(name, new Float32BufferAttribute(out, 3));
    }
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}
