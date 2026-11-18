import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Planar reflection added on top of the floor (additive blending). The floor keeps its
// own material and texture; this layer only adds the wet floor mirror effect.
// The reflection target uses mipmaps: puddles reflect sharp, the rest reflects blurred.
const WetShader = {
  name: 'WetFloor',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uStrength: { value: 0.7 },
    uF0: { value: 0.2 },
    uBlur: { value: new THREE.Vector2(0.6, 3.2) },
    uDistort: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vUv = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uStrength, uF0, uDistort;
    uniform vec2 uBlur;
    varying vec4 vUv;
    varying vec3 vWorld;

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
    }
    float fbm(vec2 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 3; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
      return s;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float cosT = clamp(V.y, 0.0, 1.0);
      float fres = uF0 + (1.0 - uF0) * pow(1.0 - cosT, 4.0);
      float puddle = smoothstep(0.36, 0.6, fbm(vWorld.xz * 0.45));
      vec2 rip = vec2(noise(vWorld.xz * 5.0), noise(vWorld.xz * 5.0 + 31.7)) - 0.5;
      vec2 uv = vUv.xy / vUv.w + rip * uDistort * mix(1.0, 0.2, puddle);
      float lod = mix(uBlur.y, uBlur.x, puddle);
      vec3 refl = textureLod(tDiffuse, uv, lod).rgb;
      float k = fres * uStrength * mix(0.5, 1.0, puddle);
      gl_FragColor = vec4(refl * color * k, 1.0);
    }`,
};

export class WetFloor {
  // rect: { minX, maxX, minZ, maxZ }, y: floor height
  constructor(rect, y, tint = 0xffffff) {
    const w = rect.maxX - rect.minX;
    const d = rect.maxZ - rect.minZ;
    const mesh = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: 512,
      textureHeight: 512,
      shader: WetShader,
      multisample: 0,
      clipBias: 0.003,
      color: tint,
    });
    mesh.name = 'WetFloorReflection';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((rect.minX + rect.maxX) / 2, y + 0.004, (rect.minZ + rect.maxZ) / 2);
    mesh.material.transparent = true;
    mesh.material.blending = THREE.AdditiveBlending;
    mesh.material.depthWrite = false;
    mesh.renderOrder = -10; // before curtains and other transparents
    const rt = mesh.getRenderTarget();
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.mesh = mesh;
    this.rt = rt;
    this.scale = 0.5;
  }

  // w, h in buffer pixels; scale = fraction used for reflection (0 disables)
  resize(w, h, scale) {
    this.scale = scale;
    this.mesh.visible = scale > 0;
    if (scale > 0) {
      this.rt.setSize(Math.max(64, Math.round(w * scale)), Math.max(64, Math.round(h * scale)));
    }
  }
}
