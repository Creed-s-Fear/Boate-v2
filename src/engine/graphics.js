import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Presets de qualidade. `dpr` é o teto do pixel ratio; `reflection` é a fração da
// resolução usada no reflexo do piso (0 desliga o passe extra de reflexo).
export const PRESETS = {
  baixa: { dpr: 1.0, msaa: 0, reflection: 0.0, bloom: 0.42 },
  media: { dpr: 1.25, msaa: 2, reflection: 0.4, bloom: 0.45 },
  alta: { dpr: 1.75, msaa: 4, reflection: 0.6, bloom: 0.48 },
};
export const PRESET_ORDER = ['baixa', 'media', 'alta'];

// Passe final barato: vinheta, leve aberração cromática nas bordas e granulação.
const FinishShader = {
  name: 'FinishShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.05 },
    uAberration: { value: 0.006 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - uVignette * smoothstep(0.08, 0.5, d);
      float g = hash(vUv * 913.0 + fract(uTime) * 71.0) - 0.5;
      col *= 1.0 + g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Graphics {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.info.autoReset = false;

    this.quality = 'alta';
    this.scale = 1; // escala dinâmica de resolução (0.55 a 1)
    this.onResize = null; // callback(w, h, preset) em pixels do buffer
    this._acc = 0;
    this._frames = 0;
    this._slow = 0;
    this.fps = 60;
    this.composer = null;
  }

  get preset() {
    return PRESETS[this.quality];
  }

  init(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._build();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  _build() {
    const p = this.preset;
    if (this.composer) {
      this.composer.passes.forEach((pass) => pass.dispose && pass.dispose());
      this.composer.renderTarget1.dispose();
      this.composer.renderTarget2.dispose();
    }
    const target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: p.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), p.bloom, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
  }

  setQuality(name) {
    if (!PRESETS[name] || name === this.quality) return;
    this.quality = name;
    this.scale = 1;
    this._build();
    this.resize();
  }

  cycleQuality() {
    const i = PRESET_ORDER.indexOf(this.quality);
    this.setQuality(PRESET_ORDER[(i + 1) % PRESET_ORDER.length]);
    return this.quality;
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const p = this.preset;
    const dpr = Math.min(devicePixelRatio || 1, p.dpr) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.onResize) this.onResize(Math.round(w * dpr), Math.round(h * dpr), p);
  }

  // Ajusta a resolução sozinho para segurar a taxa de quadros.
  _adapt() {
    // tempo real entre quadros; pausas longas (aba em segundo plano) não contam
    const now = performance.now();
    const dt = (now - (this._last || now)) / 1000;
    this._last = now;
    if (dt > 0.25 || document.hidden) {
      this._acc = 0;
      this._frames = 0;
      return;
    }
    this._acc += dt;
    this._frames++;
    if (this._acc < 1) return;
    this.fps = this._frames / this._acc;
    this._acc = 0;
    this._frames = 0;
    if (document.hidden) return;
    this._hold = Math.max(0, (this._hold || 0) - 1);
    if (this.fps < 45) {
      this._slow++;
      if (this._slow >= 2 && this.scale > 0.55) {
        this.scale = Math.max(0.55, this.scale - 0.12);
        this._slow = 0;
        this._hold = 20; // segura a resolução baixa por 20 s antes de tentar subir
        this.resize();
      }
    } else {
      this._slow = 0;
      if (this.fps > 57 && this.scale < 1 && this._hold === 0) {
        this.scale = Math.min(1, this.scale + 0.06);
        this._hold = 4;
        this.resize();
      }
    }
  }

  render(dt, time) {
    this.renderer.info.reset();
    this.finish.uniforms.uTime.value = time;
    this.composer.render(dt);
    this._adapt(dt);
  }
}
