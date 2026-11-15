import * as THREE from 'three';

// Holograma do projetor: mantém a base e os anéis da peça original e troca o cone e a
// esfera lisos por um holograma procedural: feixe com linhas de varredura, uma flor de
// lótus de pétalas translúcidas que abre e fecha, anéis orbitando, faixas de "dados"
// girando e partículas subindo. Tudo em shader, sem textura: 8 draw calls.

const CYAN = new THREE.Color(0.1, 0.95, 1.0);
const PINK = new THREE.Color(1.0, 0.2, 0.75);
const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

const COMMON_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  varying float vY;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vY = wp.y;
    vec4 mv = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

function beamMaterial(uTime) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime, uColor: { value: CYAN } },
    vertexShader: COMMON_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        // clamp antes de pow(): base negativa vira NaN e o bloom espalha preto pela tela
        float fres = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0);
        float h = clamp(vUv.y, 0.0, 1.0);
        float fade = pow(1.0 - h, 1.5);
        float lines = 0.55 + 0.45 * sin(h * 230.0 - uTime * 6.0);
        float streak = 0.7 + 0.3 * sin(vUv.x * 6.2832 * 22.0 + sin(uTime * 0.7 + h * 5.0) * 2.0);
        float flick = 0.9 + 0.1 * sin(uTime * 37.0) * sin(uTime * 11.3);
        float a = (0.07 + fres * 0.5) * fade * lines * streak * flick;
        gl_FragColor = vec4(clamp(uColor * a * 1.5, 0.0, 6.0), 1.0);
      }`,
  });
}

// faixa cilíndrica com "glifos" de dados correndo
function bandMaterial(uTime, color, speed) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime, uColor: { value: color }, uSpeed: { value: speed } },
    vertexShader: COMMON_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSpeed;
      uniform vec3 uColor;
      varying vec2 vUv;
      float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
      void main() {
        float u = vUv.x * 72.0 + uTime * uSpeed;
        float cell = floor(u);
        float on = step(0.3, hash(cell));
        float height = 0.2 + 0.8 * hash(cell + 13.0);
        float bar = on * step(abs(vUv.y - 0.5), 0.5 * height) * step(0.22, fract(u));
        float line = step(0.94, vUv.y) + step(vUv.y, 0.06);
        gl_FragColor = vec4(uColor * (bar * 0.5 + line * 0.45), 1.0);
      }`,
  });
}

// ---------- flor de lótus ----------
function lotusGeometry() {
  // camadas: [pétalas, comprimento, largura, inclinação em graus, giro inicial]
  const layers = [
    [5, 0.2, 0.1, 10, 0.0],
    [7, 0.27, 0.14, 30, 0.3],
    [8, 0.31, 0.17, 52, 0.0],
    [8, 0.33, 0.19, 72, 0.39],
    [9, 0.3, 0.17, 96, 0.0],
  ];
  const SU = 6;
  const SV = 12;
  const pos = [];
  const nor = [];
  const uv = [];
  const yaw = [];
  const tilt = [];
  const layerId = [];
  const index = [];
  let base = 0;
  layers.forEach(([count, len, wid, tiltDeg, turn], li) => {
    for (let p = 0; p < count; p++) {
      const a = turn + (p / count) * Math.PI * 2;
      for (let j = 0; j <= SV; j++) {
        const v = j / SV;
        const w = Math.sin(Math.pow(v, 0.72) * Math.PI) * wid; // fina na base e na ponta
        for (let i = 0; i <= SU; i++) {
          const u = i / SU - 0.5;
          const x = u * w;
          const y = v * len;
          // pétala em concha (bordas para dentro) e ponta levemente curvada para fora
          const z = 0.12 * v * v * len + 0.9 * (u * u) * w - 0.012;
          pos.push(x, y, z);
          nor.push(-1.8 * u, -0.24 * v, 1); // aproximação, normalizada no shader
          uv.push(i / SU, v);
          yaw.push(a);
          tilt.push((tiltDeg * Math.PI) / 180);
          layerId.push(li);
        }
      }
      for (let j = 0; j < SV; j++) {
        for (let i = 0; i < SU; i++) {
          const a0 = base + j * (SU + 1) + i;
          const a1 = a0 + 1;
          const b0 = a0 + SU + 1;
          const b1 = b0 + 1;
          index.push(a0, a1, b0, a1, b1, b0);
        }
      }
      base += (SU + 1) * (SV + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aYaw', new THREE.Float32BufferAttribute(yaw, 1));
  g.setAttribute('aTilt', new THREE.Float32BufferAttribute(tilt, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(layerId, 1));
  g.setIndex(index);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.12, 0), 0.5);
  return g;
}

function lotusMaterial(uTime) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { uTime },
    vertexShader: /* glsl */ `
      attribute float aYaw, aTilt, aLayer;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      varying float vLayer;
      mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      void main() {
        vUv = uv;
        vLayer = aLayer;
        // a flor "respira": as camadas de fora abrem e fecham mais
        float breath = sin(uTime * 0.7 - aLayer * 0.5) * 0.05 * (1.0 + aLayer);
        float spin = uTime * (0.22 - aLayer * 0.035);
        mat3 R = rotY(aYaw + spin) * rotX(aTilt + breath);
        vec3 p = R * (position + vec3(0.0, 0.0, 0.015 + aLayer * 0.006));
        // falha rápida de sinal de vez em quando
        float g = step(0.985, fract(sin(floor(uTime * 14.0) * 91.7) * 43758.5));
        p.x += g * 0.02 * sin(p.y * 90.0);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vY = wp.y;
        vec4 mv = viewMatrix * wp;
        vN = normalize(normalMatrix * (R * normalize(normal)));
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      varying float vLayer;
      void main() {
        float fres = pow(clamp(1.0 - abs(dot(normalize(vN + 1e-5), normalize(vV + 1e-5))), 0.0, 1.0), 1.6);
        float x = clamp(abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);
        float v = clamp(vUv.y, 0.0, 1.0);
        float veins = smoothstep(0.8, 1.0, abs(sin(x * 9.5))) * smoothstep(0.05, 0.3, v) * (1.0 - x);
        float midrib = (1.0 - smoothstep(0.0, 0.08, x)) * smoothstep(0.0, 0.2, v);
        float edge = smoothstep(0.78, 1.0, x);
        float scan = 0.72 + 0.28 * sin(vY * 300.0 - uTime * 7.0);
        vec3 base = mix(vec3(1.0, 0.12, 0.62), vec3(1.0, 0.72, 0.95), pow(v, 1.5));
        vec3 rim = vec3(0.25, 0.95, 1.0);
        vec3 col = base * (0.16 + 0.34 * v);
        col += base * (veins * 0.5 + midrib * 0.45);
        col += rim * (fres * 0.55 + edge * 0.6);
        // pétalas se sobrepõem (blending aditivo): intensidade baixa para não estourar em branco
        col *= scan * (1.0 - vLayer * 0.07) * 0.3;
        gl_FragColor = vec4(clamp(col, 0.0, 6.0), 1.0);
      }`,
  });
}

function particles(uTime, count = 80) {
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seed[i * 4] = Math.random() * Math.PI * 2;
    seed[i * 4 + 1] = 0.25 + Math.random() * 0.75;
    seed[i * 4 + 2] = Math.random();
    seed[i * 4 + 3] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.1);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uScale;
      varying float vA;
      varying float vMix;
      void main() {
        float t = fract(uTime * (0.07 + 0.08 * aSeed.w) + aSeed.z);
        float ang = aSeed.x + uTime * (0.25 + aSeed.w * 0.4);
        float r = (0.07 + 0.36 * t) * aSeed.y;
        vec3 p = vec3(cos(ang) * r, 0.14 + t * 1.42, sin(ang) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = sin(t * 3.14159) * (0.5 + 0.5 * sin(uTime * 6.0 + aSeed.x * 9.0));
        vMix = step(0.6, aSeed.w);
        gl_PointSize = uScale * (0.008 + 0.016 * aSeed.w) / -mv.z; // tamanho em metros -> pixels
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vMix;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = 1.0 - smoothstep(0.0, 0.5, d);
        vec3 c = mix(vec3(0.2, 0.95, 1.0), vec3(1.0, 0.35, 0.8), vMix);
        gl_FragColor = vec4(c * a * a * vA * 1.6, 1.0);
      }`,
  });
  return new THREE.Points(g, m);
}

export function createHologram(piece, parent) {
  // tira o cone, a esfera e os aros rosas originais; ficam a base, o emissor e os anéis ciano
  piece.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(piece);
  const remove = [];
  piece.traverse((m) => {
    if (m.isMesh && /^(KIT_holo|KIT_holo_pink|KIT_neon_pink)$/.test(m.material.name)) remove.push(m);
  });
  remove.forEach((m) => m.removeFromParent());

  const uTime = { value: 0 };
  const group = new THREE.Group();
  group.name = 'Holograma';
  group.userData.dynamic = true;
  const c = box.getCenter(new THREE.Vector3());
  group.position.set(c.x, box.min.y, c.z);
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(group.position);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.1, 1.5, 56, 1, true), beamMaterial(uTime));
  beam.position.y = 0.11 + 0.75;
  beam.renderOrder = 2;

  const lotus = new THREE.Mesh(lotusGeometry(), lotusMaterial(uTime));
  lotus.position.y = 0.93;
  lotus.renderOrder = 3;

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.1, 1.5) }));
  core.position.y = 0.98;

  const ringGeo = new THREE.TorusGeometry(0.39, 0.0035, 6, 96);
  const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.15) }));
  const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: PINK.clone().multiplyScalar(1.25) }));
  const dot = new THREE.SphereGeometry(0.014, 8, 6);
  const dotA = new THREE.Mesh(dot, ringA.material);
  dotA.position.x = 0.39;
  ringA.add(dotA);
  const dotB = new THREE.Mesh(dot, ringB.material);
  dotB.position.x = -0.39;
  ringB.add(dotB);
  const orbit = new THREE.Group();
  orbit.position.y = 1.03;
  orbit.add(ringA, ringB);

  const bandLow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.055, 64, 1, true), bandMaterial(uTime, CYAN, 3.0));
  bandLow.position.y = 0.6;
  const bandHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 64, 1, true), bandMaterial(uTime, PINK, -2.2));
  bandHigh.position.y = 1.5;

  const dust = particles(uTime);
  dust.layers.set(1); // partículas não entram no reflexo do piso

  group.add(beam, lotus, core, orbit, bandLow, bandHigh, dust);
  parent.add(group);

  return {
    group,
    update(dt, time, _pos, _vel, renderer) {
      if (!parent.visible) return;
      uTime.value = time;
      ringA.rotation.set(1.1 + Math.sin(time * 0.4) * 0.25, time * 0.7, 0);
      ringB.rotation.set(-0.9 + Math.cos(time * 0.3) * 0.25, -time * 0.55, 0.4);
      lotus.position.y = 0.93 + Math.sin(time * 0.9) * 0.012;
      core.position.y = lotus.position.y + 0.05;
      if (renderer) dust.material.uniforms.uScale.value = renderer.getDrawingBufferSize(_size).y * 0.714;
    },
  };
}
const _size = new THREE.Vector2();
