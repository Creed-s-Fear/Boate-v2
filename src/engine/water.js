import * as THREE from 'three';

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }`;

// Água da jacuzzi. Translúcida: o fundo da banheira aparece através dela, e as cáusticas
// são desenhadas deslocadas pela refração (parecem estar no fundo, não na superfície).
// Ondulação, espuma dos jatos, reflexo do anel e anéis em volta do jogador. 1 draw call.
export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    name: 'Water',
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2() },
      uRadius: { value: 1.28 },
      uPlayer: { value: new THREE.Vector3() }, // x, z, força (0 fora da água, 1 dentro)
      uShallow: { value: new THREE.Color(0x4ff2e4) },
      uDeep: { value: new THREE.Color(0x05495c) },
      uGlow: { value: new THREE.Color(0x9bfff4) },
      uSky: { value: new THREE.Color(0xff4fc8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uRadius;
      uniform vec2 uCenter;
      uniform vec3 uPlayer, uShallow, uDeep, uGlow, uSky;
      varying vec3 vWorld;
      ${NOISE}
      float caustic(vec2 p, float t) {
        vec2 i = p;
        float c = 1.0;
        const float inten = 0.005;
        for (int n = 0; n < 3; n++) {
          float tt = t * (1.0 - (3.5 / float(n + 1)));
          i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
        }
        c /= 3.0;
        c = 1.17 - pow(c, 1.4);
        return pow(abs(c), 8.0);
      }
      void main() {
        vec2 p = vWorld.xz - uCenter;
        float r = clamp(length(p) / uRadius, 0.0, 1.0);
        float t = uTime;
        vec3 V = normalize(cameraPosition - vWorld);

        // ondulação: ondas somadas + turbulência + anéis saindo do jogador
        vec2 q = vWorld.xz * 6.0;
        vec2 n = 0.05 * vec2(cos(q.x * 1.3 + t * 1.7), sin(q.y * 1.1 - t * 1.3));
        n += 0.035 * vec2(sin(q.y * 2.1 + q.x * 0.7 + t * 2.3), cos(q.x * 1.9 - q.y * 0.5 - t * 2.0));
        n += 0.03 * (vec2(noise(q * 1.7 + t * 0.9), noise(q * 1.7 - t * 0.8 + 9.0)) - 0.5);
        vec2 dpv = vWorld.xz - uPlayer.xy;
        float dp = length(dpv);
        float ring = sin(dp * 20.0 - t * 6.5) * exp(-dp * 2.4) * uPlayer.z;
        n += dpv / (dp + 0.001) * ring * 0.14;
        vec3 N = normalize(vec3(n.x, 1.0, n.y));
        float cosT = clamp(dot(N, V), 0.0, 1.0);
        float fres = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);

        // fundo visto por refração; mais raso no banco junto à parede
        float depth = mix(0.5, 0.2, smoothstep(0.55, 0.95, r));
        float vy = max(V.y, 0.3);
        vec2 bp = vWorld.xz - V.xz / vy * depth * 0.7 + n * 0.5;
        float c = caustic(mod(bp * 2.6, 6.28318) - 250.0, t * 0.5 + 23.0);
        float path = depth / vy;
        vec3 body = mix(uShallow, uDeep, clamp(path * 0.7, 0.0, 1.0));
        // luz vinda de baixo (iluminação submersa): mais clara no centro
        float under = 0.55 + 0.45 * (1.0 - r * r);
        vec3 col = body * (0.62 + 0.5 * under) + uGlow * c * (1.5 - 0.6 * clamp(path, 0.0, 1.0));

        // espuma em bolhas finas: 6 jatos na parede, linha da borda e em volta do jogador
        float ang = atan(p.y, p.x);
        float lobes = pow(0.5 + 0.5 * cos(ang * 6.0 + 0.5), 4.0);
        float band = smoothstep(0.3, 0.8, r) * (1.0 - smoothstep(0.88, 0.99, r));
        float fine = noise(vWorld.xz * 38.0 + vec2(t * 1.9, -t * 1.4)) * noise(vWorld.xz * 71.0 - t * 2.6);
        float jet = lobes * band;
        float foam = smoothstep(0.14, 0.4, jet * (0.2 + 3.4 * fine));
        foam = max(foam, smoothstep(0.972, 1.0, r) * (0.3 + 2.4 * fine));
        foam = max(foam, (1.0 - smoothstep(0.3, 0.52, dp)) * uPlayer.z * smoothstep(0.12, 0.34, fine));
        col += uGlow * jet * 0.22; // água agitada pelos jatos fica mais clara
        col = mix(col, vec3(0.9, 1.0, 1.0), clamp(foam, 0.0, 1.0) * 0.6);

        // reflexo rosado do anel (discreto) e brilhos especulares
        vec3 R = reflect(-V, N);
        float spec = pow(clamp(dot(R, normalize(vec3(0.45, 0.8, 0.3))), 0.0, 1.0), 70.0)
                   + pow(clamp(dot(R, normalize(vec3(-0.55, 0.75, -0.35))), 0.0, 1.0), 70.0);
        col += uSky * fres * 0.2 + vec3(1.0, 0.85, 0.95) * spec * 0.9;

        float alpha = clamp(0.7 + path * 0.3 + fres * 0.3 + foam * 0.3, 0.0, 0.97);
        gl_FragColor = vec4(clamp(col, 0.0, 4.0), alpha);
      }`,
  });
}

// Vapor: fiapos de névoa (quadros virados para a câmera, forma dada por ruído) subindo
// e se abrindo, mais um lençol de névoa rente à água. Tudo animado no shader: nenhum
// cálculo por quadro em JS e 2 draw calls.
export class Steam {
  constructor(center, radius, count = 22) {
    this.object = new THREE.Group();
    this.object.name = 'Steam';
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: center.clone() },
      uRadius: { value: radius },
      uOpacity: { value: 0.16 },
    };

    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
    for (let i = 0; i < count; i++) seed[i * 4] *= Math.PI * 2;
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(center.clone().setY(center.y + 1.3), radius + 3);

    const wisps = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          attribute vec4 aSeed;
          uniform float uTime, uRadius;
          uniform vec3 uCenter;
          varying vec2 vUv;
          varying float vLife;
          varying float vSeed;
          void main() {
            float life = fract(uTime * (0.05 + 0.035 * aSeed.w) + aSeed.z);
            float ang = aSeed.x + life * (aSeed.w - 0.5) * 2.2;
            float rr = uRadius * sqrt(aSeed.y) * (0.7 + 0.7 * life);
            vec3 c = uCenter + vec3(cos(ang) * rr, 0.08 + life * 2.2, sin(ang) * rr);
            c.x += sin(uTime * 0.31 + aSeed.x * 5.0) * 0.14 * life;
            c.z += cos(uTime * 0.27 + aSeed.x * 3.0) * 0.14 * life;
            float size = (0.5 + 1.25 * life) * (0.75 + 0.5 * aSeed.w);
            vec4 mv = viewMatrix * vec4(c, 1.0);
            mv.xy += position.xy * size; // sempre de frente para a câmera
            gl_Position = projectionMatrix * mv;
            vUv = uv;
            vLife = life;
            vSeed = aSeed.x;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpacity;
          varying vec2 vUv;
          varying float vLife;
          varying float vSeed;
          ${NOISE}
          void main() {
            vec2 q = vUv - 0.5;
            float soft = 1.0 - smoothstep(0.15, 1.0, length(q) * 2.0);
            float a0 = vSeed * 3.0 + uTime * 0.07;
            vec2 rq = vec2(cos(a0) * q.x - sin(a0) * q.y, sin(a0) * q.x + cos(a0) * q.y);
            float n = noise(rq * 3.2 + vSeed * 7.0 + vec2(0.0, -uTime * 0.12)) * 0.65
                    + noise(rq * 7.0 - vSeed * 3.0 + vec2(uTime * 0.09, 0.0)) * 0.35;
            float a = soft * smoothstep(0.3, 0.72, n);
            float fade = smoothstep(0.0, 0.14, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
            vec3 col = mix(vec3(0.62, 1.0, 0.96), vec3(1.0, 0.5, 0.86), smoothstep(0.05, 0.55, vLife));
            gl_FragColor = vec4(col * a * fade * uOpacity, 1.0);
          }`,
      }),
    );
    wisps.name = 'SteamWisps';
    wisps.renderOrder = 6;
    wisps.layers.set(1); // fora do passe de reflexo

    const mist = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.3, 40).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uRadius;
          uniform vec3 uCenter;
          varying vec3 vWorld;
          ${NOISE}
          void main() {
            float t = uTime;
            float n = noise(vWorld.xz * 2.2 + vec2(t * 0.11, -t * 0.07)) * 0.6 + noise(vWorld.xz * 5.3 - t * 0.13) * 0.4;
            float edge = 1.0 - smoothstep(0.5, 1.0, length(vWorld.xz - uCenter.xz) / (uRadius * 1.3));
            gl_FragColor = vec4(vec3(0.6, 1.0, 0.95) * smoothstep(0.35, 0.8, n) * edge * 0.2, 1.0);
          }`,
      }),
    );
    mist.name = 'SteamMist';
    mist.position.set(center.x, center.y + 0.07, center.z);
    mist.renderOrder = 3;
    mist.layers.set(1);

    this.object.add(mist, wisps);
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
  }
}
