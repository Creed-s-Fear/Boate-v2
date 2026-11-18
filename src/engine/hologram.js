import * as THREE from 'three';

// Projector hologram: keeps the base and rings from the original piece and replaces the
// smooth cone and sphere with a procedural hologram: beam with scan lines, a translucent
// petal lotus flower that opens and closes, orbiting rings, spinning "data" bands and
// rising particles. All in shaders, no textures: 8 draw calls.

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
        // clamp before pow(): a negative base becomes NaN and bloom spreads black across the screen
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

// cylindrical band with scrolling "data glyphs"
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

// ---------- lotus flower ----------
function lotusGeometry() {
  // layers: [petals, length, width, tilt in degrees, initial rotation]
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
        const w = Math.sin(Math.pow(v, 0.72) * Math.PI) * wid; // thin at base and tip
        for (let i = 0; i <= SU; i++) {
          const u = i / SU - 0.5;
          const x = u * w;
          const y = v * len;
          // cupped petal (edges curving inward) with tip slightly curving outward
          const z = 0.12 * v * v * len + 0.9 * (u * u) * w - 0.012;
          pos.push(x, y, z);
          nor.push(-1.8 * u, -0.24 * v, 1); // approximation, normalized in shader
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
        // the flower "breathes": outer layers open and close more
        float breath = sin(uTime * 0.7 - aLayer * 0.5) * 0.05 * (1.0 + aLayer);
        float spin = uTime * (0.22 - aLayer * 0.035);
        mat3 R = rotY(aYaw + spin) * rotX(aTilt + breath);
        vec3 p = R * (position + vec3(0.0, 0.0, 0.015 + aLayer * 0.006));
        // brief signal glitch every now and then
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
        // petals overlap (additive blending): low intensity to avoid blowing out to white
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
        gl_PointSize = uScale * (0.008 + 0.016 * aSeed.w) / -mv.z; // size in meters -> pixels
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

// ---------- holographic wall signs (lotus and glyphs) ----------
// Background with fake depth (parallax from viewing direction): the content appears to
// be behind glass, in layers. A single quad, no texture.
function signMaterial(uTime, color, accent, w, h, kind, right, up, normal) {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: {
      uTime,
      uColor: { value: color },
      uAccent: { value: accent },
      uSize: { value: new THREE.Vector2(w, h) },
      uKind: { value: kind },
      uRight: { value: right },
      uUp: { value: up },
      uNormal: { value: normal },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uRight, uUp, uNormal;
      varying vec2 vUv;
      varying vec3 vT;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 vd = cameraPosition - wp.xyz;
        vT = vec3(dot(vd, uRight), dot(vd, uUp), dot(vd, uNormal));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uKind;
      uniform vec3 uColor, uAccent;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying vec3 vT;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float inside(vec2 u) { return step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0); }
      float stroke(float d, float t) { return 1.0 - smoothstep(t, t + 0.06, abs(d)); }
      // invented glyph: up to 7 strokes on a 3x3 grid, randomized per cell
      float glyph(vec2 cell, vec2 f, float seed) {
        vec2 q = (f - 0.5) * 2.6;
        if (abs(q.x) > 1.0 || abs(q.y) > 1.0) return 0.0;
        float t = 0.1;
        float lx = step(abs(q.x), 0.72);
        float ly = step(abs(q.y), 0.72);
        float on = step(0.5, hash(cell + seed + 1.1)) * stroke(q.y - 0.62, t) * lx;
        on = max(on, step(0.5, hash(cell + seed + 2.3)) * stroke(q.y, t) * lx);
        on = max(on, step(0.5, hash(cell + seed + 3.7)) * stroke(q.y + 0.62, t) * lx);
        on = max(on, step(0.55, hash(cell + seed + 4.9)) * stroke(q.x - 0.62, t) * ly);
        on = max(on, step(0.55, hash(cell + seed + 5.3)) * stroke(q.x, t) * ly);
        on = max(on, step(0.55, hash(cell + seed + 6.1)) * stroke(q.x + 0.62, t) * ly);
        on = max(on, step(0.72, hash(cell + seed + 7.7)) * stroke((q.x + q.y) * 0.707, t) * lx);
        return on;
      }
      // columns of glyphs falling, each at its own speed, with trail
      float rain(vec2 uv, float cols, float seed, float speed) {
        vec2 gp = uv * vec2(cols, cols * uSize.y / uSize.x);
        float col = floor(gp.x);
        gp.y += uTime * speed * (0.5 + hash(vec2(col, seed)));
        vec2 cell = floor(gp);
        float change = floor(uTime * 1.3 + hash(cell + seed) * 8.0);
        float head = fract(gp.y * 0.11 + hash(vec2(col, seed + 3.0)));
        return glyph(cell + change * 0.37, fract(gp), seed) * (0.25 + 0.75 * head * head);
      }
      void main() {
        vec3 T = normalize(vT + vec3(0.0, 0.0, 0.0001));
        vec2 par = T.xy / max(abs(T.z), 0.3);
        vec2 uv = vUv;
        float scan = 0.72 + 0.28 * sin(uv.y * uSize.y * 420.0 - uTime * 5.0);
        float flick = 0.92 + 0.08 * sin(uTime * 23.0) * sin(uTime * 7.1);
        float sw = (uv.y - fract(uTime * 0.17)) * 18.0;
        float sweep = exp(-sw * sw);
        float b = min(min(uv.x, 1.0 - uv.x) * uSize.x, min(uv.y, 1.0 - uv.y) * uSize.y);
        float edge = 1.0 - smoothstep(0.0, 0.035, b);
        vec3 col = uColor * (0.05 + edge * 0.5 + sweep * 0.3);
        if (uKind < 0.5) {
          // lotus: background grid and rings pulsing from center, at different depths
          vec2 u1 = uv - par * 0.1 / uSize;
          vec2 g = abs(fract(u1 * uSize * 9.0) - 0.5);
          float grid = (1.0 - smoothstep(0.0, 0.035, min(g.x, g.y))) * inside(u1);
          vec2 u2 = uv - par * 0.05 / uSize;
          float r = length((u2 - vec2(0.5, 0.42)) * vec2(uSize.x / uSize.y, 1.0));
          float rings = pow(0.5 + 0.5 * sin(r * 34.0 - uTime * 2.6), 6.0) * exp(-r * 3.2) * inside(u2);
          col += uColor * grid * 0.16 + uAccent * rings * 0.9;
          float tu = uv.x * 46.0 + uTime * 2.0;
          col += uColor * step(uv.y, 0.1) * step(0.03, uv.y) * step(0.45, hash(vec2(floor(tu), 9.0))) * step(0.25, fract(tu)) * 0.5;
        } else {
          // glyphs: three layers of "rain" at different depths
          vec2 u1 = uv - par * 0.03 / uSize;
          vec2 u2 = uv - par * 0.09 / uSize;
          vec2 u3 = uv - par * 0.17 / uSize;
          col += uAccent * rain(u1, 5.0, 1.0, 0.55) * inside(u1) * 0.9;
          col += uColor * rain(u2, 8.0, 5.0, 0.9) * inside(u2) * 0.5;
          col += uColor * rain(u3, 13.0, 9.0, 1.4) * inside(u3) * 0.22;
        }
        gl_FragColor = vec4(clamp(col * scan * flick, 0.0, 5.0), 1.0);
      }`,
  });
}

// particles rising in a shallow box in front of the sign
function signDust(uTime, w, h, count = 46) {
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.max(w, h));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale: { value: 700 }, uSize: { value: new THREE.Vector2(w, h) } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uScale;
      uniform vec2 uSize;
      varying float vA;
      varying float vMix;
      void main() {
        float t = fract(uTime * (0.05 + 0.06 * aSeed.w) + aSeed.z);
        vec3 p = vec3((aSeed.x - 0.5) * uSize.x * 1.05, (t - 0.5) * uSize.y * 1.1, 0.03 + aSeed.y * 0.22);
        p.x += sin(uTime * 0.6 + aSeed.x * 20.0) * 0.02;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = sin(t * 3.14159) * (0.5 + 0.5 * sin(uTime * 5.0 + aSeed.x * 31.0));
        vMix = step(0.55, aSeed.w);
        gl_PointSize = uScale * (0.006 + 0.012 * aSeed.w) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying float vMix;
      void main() {
        float a = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
        vec3 c = mix(vec3(0.2, 0.95, 1.0), vec3(1.0, 0.35, 0.8), vMix);
        gl_FragColor = vec4(c * a * a * vA * 1.4, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.layers.set(1);
  return pts;
}

export function createHoloSign(piece, parent) {
  const isLotus = /Lotus/.test(piece.name);
  piece.updateWorldMatrix(true, true);
  // the original translucent panel gives the size and position; it's removed and the hologram takes its place
  const panels = [];
  piece.traverse((m) => {
    if (m.isMesh && /^KIT_holo/.test(m.material.name)) panels.push(m);
  });
  if (!panels.length) return null;
  const box = new THREE.Box3();
  panels.forEach((m) => box.expandByObject(m));
  panels.forEach((m) => m.removeFromParent());

  const normal = new THREE.Vector3(0, 0, 1).transformDirection(piece.matrixWorld);
  normal.y = 0;
  normal.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const size = box.getSize(new THREE.Vector3());
  const w = Math.abs(size.x * right.x) + Math.abs(size.z * right.z);
  const h = size.y;

  const uTime = { value: 0 };
  const group = new THREE.Group();
  group.name = 'PlacaHolografica';
  group.userData.dynamic = true;
  group.position.copy(box.getCenter(new THREE.Vector3())).addScaledVector(normal, 0.02);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  parent.updateWorldMatrix(true, false);
  parent.worldToLocal(group.position);

  const color = isLotus ? CYAN : PINK;
  const accent = isLotus ? PINK : CYAN;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMaterial(uTime, color, accent, w, h, isLotus ? 0 : 1, right, up, normal));
  panel.renderOrder = 2;
  const dust = signDust(uTime, w, h);
  group.add(panel, dust);

  let lotus = null;
  if (isLotus) {
    // 3D flower protruding from the sign, tilted toward the room
    lotus = new THREE.Mesh(lotusGeometry(), lotusMaterial(uTime));
    lotus.scale.setScalar(0.5);
    lotus.position.set(0, -h * 0.16, 0.17);
    lotus.rotation.x = 1.05;
    lotus.renderOrder = 3;
    group.add(lotus);
  }
  parent.add(group);

  return {
    group,
    update(dt, time, _pos, _vel, renderer) {
      if (!parent.visible) return;
      uTime.value = time;
      if (lotus) lotus.position.y = -h * 0.16 + Math.sin(time * 0.8) * 0.01;
      if (renderer) dust.material.uniforms.uScale.value = renderer.getDrawingBufferSize(_size).y * 0.714;
    },
  };
}

export function createHologram(piece, parent) {
  // remove the original cone, sphere and pink rings; keep the base, emitter and cyan rings
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
  dust.layers.set(1); // particles are excluded from the floor reflection pass

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
