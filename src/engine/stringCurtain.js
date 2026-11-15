import * as THREE from 'three';

// Cortina de fios de neon com física: cada fio é um pêndulo amortecido. O corpo do
// jogador empurra os fios (eles contornam o corpo e são arrastados junto); ao soltar,
// balançam e param sozinhos. A simulação roda em JS (uns 30 fios por cortina) e o
// resultado vai para o shader por uma textura de 1 linha: 1 draw call por cortina.
//
// Contato com o corpo: o fio fica na superfície dele e perde só a velocidade que o faria
// entrar (sem quique), então com o jogador parado ele assenta em vez de tremer. A parte
// da velocidade que corre em volta do corpo é mantida: é ela que deixa o fio contornar o
// jogador quando o lugar de repouso ficou do outro lado.

const BODY_RADIUS = 0.4;
const BODY_HEIGHT = 1.05; // altura em que o corpo toca o fio
const SLIDE = 5; // m/s²: empurrão em volta do corpo para o fio que precisa contorná-lo
const FRICTION = 4; // 1/s: atrito do fio escorregando no corpo (sem ele o fio fica indo e voltando)
const _p = new THREE.Vector3();
const _local = new THREE.Vector3();

export class StringCurtain {
  constructor(piece, parent) {
    this.parent = parent;
    parent.updateWorldMatrix(true, false);
    const inv = parent.matrixWorld.clone().invert();
    piece.updateWorldMatrix(true, true);

    // junta as malhas da peça numa geometria só, no referencial da sala
    const pos = [];
    const col = [];
    const rail = [];
    const index = [];
    let offset = 0;
    piece.traverse((m) => {
      if (!m.isMesh) return;
      const a = m.geometry.attributes.position;
      const mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
      const isRail = !m.material.isMeshBasicMaterial; // trilho de metal; os fios são neon
      const c = m.material.color;
      const k = isRail ? 0.1 : 1;
      for (let i = 0; i < a.count; i++) {
        _p.fromBufferAttribute(a, i).applyMatrix4(mat);
        pos.push(_p.x, _p.y, _p.z);
        col.push(c.r * k, c.g * k, c.b * k);
        rail.push(isRail);
      }
      const idx = m.geometry.index;
      if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + offset);
      else for (let i = 0; i < a.count; i++) index.push(i + offset);
      offset += a.count;
    });
    const count = pos.length / 3;

    // eixo da cortina (ao longo do trilho) e limites dos fios
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, top = -Infinity, bottom = Infinity;
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      if (!rail[i]) { top = Math.max(top, y); bottom = Math.min(bottom, y); }
    }
    const alongX = maxX - minX > maxZ - minZ;
    const A = alongX ? 0 : 2; // índice da coordenada ao longo do trilho
    const length = top - bottom;

    // cada fio = grupo de vértices com a mesma coordenada ao longo do trilho
    const values = [...new Set(Array.from({ length: count }, (_, i) => (rail[i] ? null : Math.round(pos[i * 3 + A] * 1000))))]
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    const centers = [];
    let start = values[0];
    let prev = values[0];
    for (let i = 1; i <= values.length; i++) {
      const v = values[i];
      if (v === undefined || v - prev > 15) {
        centers.push((start + prev) / 2000);
        start = v;
      }
      prev = v;
    }
    const n = centers.length;
    const aStr = new Float32Array(count);
    const aHang = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      if (rail[i]) continue;
      const a = pos[i * 3 + A];
      let best = 0;
      let bd = Infinity;
      for (let s = 0; s < n; s++) {
        const d = Math.abs(centers[s] - a);
        if (d < bd) { bd = d; best = s; }
      }
      aStr[i] = best;
      aHang[i] = THREE.MathUtils.clamp((top - pos[i * 3 + 1]) / length, 0, 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aStr', new THREE.BufferAttribute(aStr, 1));
    geo.setAttribute('aHang', new THREE.BufferAttribute(aHang, 1));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 1.0; // os fios saem do lugar

    // estado da simulação
    this.n = n;
    this.length = length;
    this.top = top;
    this.bottom = bottom;
    this.rest = new Float32Array(n * 2); // posição de repouso (x, z) de cada fio
    const plane = alongX ? (minZ + maxZ) / 2 : (minX + maxX) / 2;
    for (let s = 0; s < n; s++) {
      this.rest[s * 2] = alongX ? centers[s] : plane;
      this.rest[s * 2 + 1] = alongX ? plane : centers[s];
    }
    this.box = { minX: minX - 0.9, maxX: maxX + 0.9, minZ: minZ - 0.9, maxZ: maxZ + 0.9 };
    this.p = new Float32Array(n * 2); // deslocamento da ponta de baixo
    this.v = new Float32Array(n * 2);
    this.w2 = new Float32Array(n); // frequência do pêndulo (g / comprimento), com leve variação
    this.damp = new Float32Array(n);
    // Lado de cada fio (alternado) e quanto ele se afasta do trilho enquanto encosta no
    // corpo: os fios se abrem em leque em volta do jogador em vez de empilhar num ponto só.
    this.side = new Float32Array(n);
    this.latX = alongX ? 0 : 1; // direção perpendicular ao trilho
    this.latZ = alongX ? 1 : 0;
    for (let s = 0; s < n; s++) {
      const r = Math.abs(Math.sin(s * 12.9898) * 43758.5453) % 1;
      this.w2[s] = (9.8 / length) * (0.9 + 0.25 * r);
      this.damp[s] = 0.75 + 0.5 * r;
      this.side[s] = (s % 2 ? 1 : -1) * (0.03 + 0.05 * r);
    }
    this.hcBody = THREE.MathUtils.clamp((top - BODY_HEIGHT) / length, 0.3, 1);
    this.data = new Float32Array(n * 4);
    for (let s = 0; s < n; s++) this.data[s * 4 + 2] = 1;
    this.texture = new THREE.DataTexture(this.data, n, 1, THREE.RGBAFormat, THREE.FloatType);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.asleep = true;

    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    material.name = 'CortinaFios';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uStrings = { value: this.texture };
      shader.uniforms.uCount = { value: n };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aStr;\nattribute float aHang;\nuniform sampler2D uStrings;\nuniform float uCount;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 strS = texture2D(uStrings, vec2((aStr + 0.5) / uCount, 0.5));
          // acima do ponto de contato o fio vai reto até o corpo; abaixo, pende junto
          float strK = min(aHang / max(strS.z, 0.05), 1.0);
          transformed.xz += strS.xy * strK;
          transformed.y += dot(strS.xy, strS.xy) * strK * 0.2;`,
        );
    };

    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'CortinaFios';
    this.mesh.userData.dynamic = true;
    parent.add(this.mesh);
    piece.removeFromParent();
  }

  update(dt, time, playerPos, playerVel) {
    if (!this.parent.visible) return;
    _local.copy(playerPos);
    this.parent.worldToLocal(_local);
    const b = this.box;
    const near = _local.x > b.minX && _local.x < b.maxX && _local.z > b.minZ && _local.z < b.maxZ;
    if (!near && this.asleep) return;

    const touching = near && _local.y < this.top && _local.y + 1.75 > this.bottom;
    const h = Math.min(dt, 0.033);
    const { p, v, rest, data, side } = this;
    const maxD = this.length * 0.85;
    let energy = 0;
    for (let s = 0; s < this.n; s++) {
      let px = p[s * 2], pz = p[s * 2 + 1], vx = v[s * 2], vz = v[s * 2 + 1];
      // Para onde o pêndulo puxa: o repouso. Com o corpo em cima do repouso, um pouco para o
      // lado do fio (decidido pelo repouso, que não muda, para não ficar ligando e desligando).
      const covered = touching && Math.hypot(rest[s * 2] - _local.x, rest[s * 2 + 1] - _local.z) < BODY_RADIUS;
      const bias = covered ? side[s] : 0;
      const bx = this.latX * bias;
      const bz = this.latZ * bias;
      // pêndulo amortecido + uma brisa mínima para a cortina nunca ficar "congelada"
      vx += (-this.w2[s] * (px - bx) - this.damp[s] * vx) * h;
      vz += (-this.w2[s] * (pz - bz) - this.damp[s] * vz) * h;
      vx += Math.sin(time * 1.1 + s * 1.7) * 0.012 * h;
      vz += Math.cos(time * 0.9 + s * 2.3) * 0.012 * h;
      px += vx * h;
      pz += vz * h;

      let hcTarget = 1;
      if (touching) {
        const cx = rest[s * 2] + px - _local.x;
        const cz = rest[s * 2 + 1] + pz - _local.z;
        const d = Math.hypot(cx, cz);
        if (d < BODY_RADIUS) {
          // direção corpo -> fio; bem no centro do corpo o fio sai pelo lado dele
          let nx = this.latX * Math.sign(side[s]);
          let nz = this.latZ * Math.sign(side[s]);
          if (d > 1e-4) { nx = cx / d; nz = cz / d; }
          // fica na superfície do corpo...
          px = _local.x + nx * BODY_RADIUS - rest[s * 2];
          pz = _local.z + nz * BODY_RADIUS - rest[s * 2 + 1];
          // ...e perde só a velocidade que o faria entrar nele (medida em relação ao corpo:
          // o jogador andando empurra o fio; parado, o fio assenta sem quicar)
          const vn = (vx - playerVel.x) * nx + (vz - playerVel.z) * nz;
          if (vn < 0) { vx -= nx * vn; vz -= nz * vn; }
          // atrito do fio escorregando em volta do corpo
          const tx = -nz;
          const tz = nx;
          const vt = (vx - playerVel.x) * tx + (vz - playerVel.z) * tz;
          const lost = vt * (1 - Math.exp(-FRICTION * h));
          vx -= tx * lost;
          vz -= tz * lost;
          // Repouso do outro lado do corpo: o fio escorrega em volta dele pelo caminho mais
          // curto (empatado, cada fio vai para o seu lado) até poder voltar ao lugar.
          const rx = rest[s * 2] + bx - _local.x;
          const rz = rest[s * 2 + 1] + bz - _local.z;
          if (rx * nx + rz * nz < 0) {
            const along = rx * tx + rz * tz; // quanto o repouso está para o lado da tangente
            const dir = Math.abs(along) > 0.02 ? Math.sign(along) : Math.sign(side[s]);
            vx += tx * dir * SLIDE * h;
            vz += tz * dir * SLIDE * h;
          }
          hcTarget = this.hcBody;
        }
      }
      const len = Math.hypot(px, pz);
      if (len > maxD) { px *= maxD / len; pz *= maxD / len; }
      p[s * 2] = px; p[s * 2 + 1] = pz; v[s * 2] = vx; v[s * 2 + 1] = vz;
      data[s * 4] = px;
      data[s * 4 + 1] = pz;
      data[s * 4 + 2] += (hcTarget - data[s * 4 + 2]) * Math.min(1, h * 9);
      energy += px * px + pz * pz + vx * vx + vz * vz;
    }
    this.texture.needsUpdate = true;
    this.asleep = !near && energy < 2e-4;
  }
}
