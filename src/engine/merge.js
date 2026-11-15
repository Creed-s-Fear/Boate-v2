import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();

// Coordenadas de um atributo como Float32Array de trincas. Depois do carregamento os
// atributos já são assim e o vetor é usado direto; o caminho genérico cobre o resto.
function triples(attr) {
  if (attr.array instanceof Float32Array && !attr.isInterleavedBufferAttribute && attr.itemSize === 3) return attr.array;
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

// Junta várias malhas numa geometria só (posição, normal e índice), com a transformação
// de cada uma já aplicada: a de mundo, ou a relativa a um pai quando `inverse` é a matriz
// de mundo invertida desse pai. Escreve direto nos vetores finais, o que é várias vezes
// mais rápido do que clonar cada geometria, transformar e só então juntar.
export function mergeMeshes(meshes, { inverse = null, normals = true } = {}) {
  let vertices = 0;
  let indices = 0;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    vertices += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  const withNormals = normals && meshes.every((mesh) => mesh.geometry.attributes.normal);
  const position = new Float32Array(vertices * 3);
  const normal = withNormals ? new Float32Array(vertices * 3) : null;
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);

  let v = 0; // vértices já escritos
  let k = 0; // índices já escritos
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const count = g.attributes.position.count;
    if (inverse) _m.multiplyMatrices(inverse, mesh.matrixWorld);
    else _m.copy(mesh.matrixWorld);
    const e = _m.elements;

    const src = triples(g.attributes.position);
    for (let i = 0, o = v * 3; i < count * 3; i += 3, o += 3) {
      const x = src[i];
      const y = src[i + 1];
      const z = src[i + 2];
      position[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      position[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      position[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }

    if (normal) {
      const t = _n.getNormalMatrix(_m).elements;
      const srcN = triples(g.attributes.normal);
      for (let i = 0, o = v * 3; i < count * 3; i += 3, o += 3) {
        const x = srcN[i];
        const y = srcN[i + 1];
        const z = srcN[i + 2];
        const nx = t[0] * x + t[3] * y + t[6] * z;
        const ny = t[1] * x + t[4] * y + t[7] * z;
        const nz = t[2] * x + t[5] * y + t[8] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        normal[o] = nx / l;
        normal[o + 1] = ny / l;
        normal[o + 2] = nz / l;
      }
    }

    // peça espelhada (escala negativa) inverte a face: troca a ordem de cada triângulo
    const flip = _m.determinant() < 0;
    const idx = g.index ? g.index.array : null;
    const total = idx ? idx.length : count;
    for (let i = 0; i + 2 < total; i += 3) {
      const a = idx ? idx[i] : i;
      const b = idx ? idx[i + 1] : i + 1;
      const c = idx ? idx[i + 2] : i + 2;
      index[k++] = v + a;
      index[k++] = v + (flip ? c : b);
      index[k++] = v + (flip ? b : c);
    }
    v += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  if (normal) out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setIndex(new THREE.BufferAttribute(k === index.length ? index : index.subarray(0, k), 1));
  return out;
}
