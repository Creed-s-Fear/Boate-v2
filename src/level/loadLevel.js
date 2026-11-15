import { Float32BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// O endereço do GLB vem do <link id="level" rel="preload"> que o vite.config.js põe no
// index.html a partir de public/models/level.json ({ "glb": "boate.glb" }). O navegador
// começa a baixar o modelo junto com o código, sem esperar o jogo pedir, e o endereço leva
// um resumo do conteúdo: modelo novo nunca é confundido com o antigo que ficou em cache.
// Sem esse link (não há GLB), entra o cenário provisório.
export async function loadLevel(onProgress) {
  const link = document.getElementById('level');
  if (!link) {
    const { buildBlockout } = await import('./blockout.js');
    onProgress(1);
    return { root: buildBlockout(), source: 'provisório' };
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(link.href, (e) => {
    // com compressão no servidor o total informado é menor que o recebido: limita em 1
    onProgress(e.total ? Math.min(e.loaded / e.total, 1) : 0.5);
  });
  gltf.scene.name = 'Level';
  dequantize(gltf.scene);
  return { root: gltf.scene, source: link.getAttribute('href') };
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
      o.geometry.setAttribute(name, new Float32BufferAttribute(toFloat(a), 3));
    }
    o.geometry.boundingBox = null;
    o.geometry.boundingSphere = null;
  });
}

// Lê as três coordenadas direto do vetor de origem (intercalado ou não). Inteiros
// "normalizados" guardam frações: divide pelo máximo do tipo, como o three.js faz.
function toFloat(a) {
  const mixed = a.isInterleavedBufferAttribute;
  const src = mixed ? a.data.array : a.array;
  const stride = mixed ? a.data.stride : a.itemSize;
  let scale = 1;
  let signed = false;
  if (a.normalized) {
    if (src instanceof Int8Array) scale = 1 / 127;
    else if (src instanceof Uint8Array) scale = 1 / 255;
    else if (src instanceof Int16Array) scale = 1 / 32767;
    else if (src instanceof Uint16Array) scale = 1 / 65535;
    signed = src instanceof Int8Array || src instanceof Int16Array;
  }
  const out = new Float32Array(a.count * 3);
  for (let i = 0, s = mixed ? a.offset : 0, o = 0; i < a.count; i++, s += stride, o += 3) {
    out[o] = src[s] * scale;
    out[o + 1] = src[s + 1] * scale;
    out[o + 2] = src[s + 2] * scale;
  }
  if (signed) for (let i = 0; i < out.length; i++) if (out[i] < -1) out[i] = -1;
  return out;
}
