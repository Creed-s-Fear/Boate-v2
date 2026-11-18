import { Float32BufferAttribute } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// The GLB URL comes from the <link id="level" rel="preload"> that vite.config.js injects
// into index.html from public/models/level.json ({ "glb": "boate.glb" }). The browser
// starts downloading the model alongside the code, without waiting for the game to ask,
// and the URL carries a content hash: a new model is never confused with a cached old one.
// Without this link (no GLB), the provisional scene is used.
export async function loadLevel(onProgress) {
  const link = document.getElementById('level');
  if (!link) {
    const { buildBlockout } = await import('./blockout.js');
    onProgress(1);
    return { root: buildBlockout(), source: 'provisional' };
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(link.href, (e) => {
    // with server compression the reported total is smaller than actual: clamp to 1
    onProgress(e.total ? Math.min(e.loaded / e.total, 1) : 0.5);
  });
  gltf.scene.name = 'Level';
  dequantize(gltf.scene);
  return { root: gltf.scene, source: link.getAttribute('href') };
}

// The optimized GLB stores positions and normals as packed integers. Collision and
// mesh merging work in metres, so we convert these attributes back to float once
// at load time (each shared geometry is converted only once).
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

// Reads three coordinates from the source buffer (interleaved or not). "Normalized"
// integers store fractions: divide by the type's max, as three.js does.
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
