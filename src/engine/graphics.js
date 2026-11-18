import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Quality presets. `dpr` caps the pixel ratio; `reflection` is the fraction of the
// resolution used for floor reflection (0 disables the extra reflection pass).
export const PRESETS = {
  low: { dpr: 1.0, msaa: 0, reflection: 0.0, bloom: 0.34 },
  medium: { dpr: 1.25, msaa: 2, reflection: 0.4, bloom: 0.37 },
  // dpr capped at 1.5: on hi-DPI screens, 1.75 with MSAA 4x is costly and barely noticeable
  high: { dpr: 1.5, msaa: 4, reflection: 0.5, bloom: 0.4 },
};
export const PRESET_ORDER = ['low', 'medium', 'high'];
const MIN_SCALE = 0.55; // floor of dynamic resolution scaling

// Pre-bloom: compresses brightness peaks (specular reflections on smooth surfaces reach
// 10x white and become blinding flares). Below the knee nothing changes; above, the curve
// flattens and the peak is clamped. Neon keeps glowing, only the blowouts disappear.
const HighlightShader = {
  name: 'HighlightShader',
  uniforms: { tDiffuse: { value: null }, uKnee: { value: 1.7 }, uRange: { value: 1.1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uKnee, uRange;
    varying vec2 vUv;
    void main() {
      vec3 c = max(texture2D(tDiffuse, vUv).rgb, 0.0);
      float l = max(c.r, max(c.g, c.b));
      if (l > uKnee) {
        float x = l - uKnee;
        c *= (uKnee + uRange * x / (x + uRange)) / l; // approaches knee + range, never exceeds
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Final pass: vignette, subtle chromatic aberration at edges, film grain, and in the same
// pass, tone mapping and color space conversion for the screen (saves a full-screen pass
// that was previously separate).
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
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
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
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.info.autoReset = false;

    this.quality = 'high';
    this.scale = 1; // dynamic resolution scale (0.55 to 1)
    this.onResize = null; // callback(w, h, preset) in buffer pixels
    this.onQuality = null; // callback(name) when the level changes (by player or auto)
    this._acc = 0;
    this._frames = 0;
    this.fps = 60;
    this.composer = null;
    this._restNext = 120;
    this._resetAdapt();
  }

  _resetAdapt() {
    this._slow = 0; // consecutive seconds below target
    this._hold = 0; // seconds to wait before trying to raise resolution
    this._rest = 0; // seconds doing nothing (after a futile reduction)
    this._futile = 0; // consecutive reductions that didn't improve the frame rate
    this._probe = null; // reduction under observation: { previous fps, wait, preset }
    this._undo = null; // state before unconfirmed reductions
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
    this.composer.addPass(new ShaderPass(HighlightShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), p.bloom, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
  }

  // Player's choice: takes effect immediately and resets auto-adjustment.
  setQuality(name) {
    if (!PRESETS[name] || name === this.quality) return;
    this._resetAdapt();
    this._apply(name, 1);
  }

  _apply(quality, scale) {
    const changed = quality !== this.quality;
    this.quality = quality;
    this.scale = scale;
    if (changed) this._build();
    this.resize();
    if (changed && this.onQuality) this.onQuality(quality);
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

  // Measures frame rate (real time between frames) and calls the tuner once per second.
  _adapt() {
    const now = performance.now();
    const dt = (now - (this._last || now)) / 1000;
    this._last = now;
    // long pauses (background tab) don't count
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
    this._tune(this.fps);
  }

  // Maintains frame rate: first lowers resolution gradually; at the floor, drops a quality
  // level. Each reduction is verified: if the rate doesn't improve, the bottleneck isn't
  // the GPU (background tab, power saving, 30 Hz monitor), so the reduction is undone and
  // the tuner rests. Raising the level is up to the player (Q key).
  _tune(fps) {
    if (this._rest > 0) {
      this._rest--;
      return;
    }
    this._hold = Math.max(0, this._hold - 1);

    if (this._probe) {
      if (--this._probe.wait > 0) return; // wait for the measurement to settle after the change
      const probe = this._probe;
      this._probe = null;
      if (fps > probe.fps * 1.12) {
        this._futile = 0;
        this._undo = null;
      } else if (probe.preset || ++this._futile >= 3) {
        const undo = this._undo;
        this._resetAdapt();
        this._rest = this._restNext;
        this._restNext = Math.min(this._restNext * 2, 900);
        this._apply(undo.quality, undo.scale);
        return;
      }
    }

    if (fps >= 45) {
      this._slow = 0;
      if (fps > 57 && this.scale < 1 && this._hold === 0 && !this._undo) {
        this.scale = Math.min(1, this.scale + 0.06);
        this._hold = 4;
        this.resize();
      }
      return;
    }
    if (++this._slow < 2) return;
    this._slow = 0;
    if (this.scale > MIN_SCALE) {
      this._undo ||= { quality: this.quality, scale: this.scale };
      this._probe = { fps, wait: 2 };
      this._hold = 20; // hold low resolution for 20 s before trying to raise it
      this.scale = Math.max(MIN_SCALE, this.scale - 0.12);
      this.resize();
    } else if (fps < 40) {
      const i = PRESET_ORDER.indexOf(this.quality);
      if (i === 0) return;
      this._undo = { quality: this.quality, scale: this.scale };
      this._probe = { fps, wait: 3, preset: true };
      this._hold = 20;
      this._apply(PRESET_ORDER[i - 1], MIN_SCALE); // same resolution: only the quality level gets lighter
    }
  }

  // Full-screen pass materials, to compile alongside the scene materials during loading.
  // `screen` are the final pass's, which draw directly to the screen (with tone mapping).
  passMaterials() {
    const list = (pass) => {
      const out = [];
      for (const v of Object.values(pass)) {
        for (const m of Array.isArray(v) ? v : [v]) if (m && m.isMaterial) out.push(m);
      }
      return out;
    };
    const passes = this.composer.passes;
    return {
      target: this.composer.renderTarget1,
      offscreen: passes.slice(0, -1).flatMap(list),
      screen: list(passes[passes.length - 1]),
    };
  }

  // adapt = false when the game is paused on the menu (frame rate is intentionally low there)
  render(dt, time, adapt = true) {
    this.renderer.info.reset();
    this.finish.uniforms.uTime.value = time;
    this.composer.render(dt);
    if (adapt) this._adapt();
    else {
      this._last = 0;
      this._acc = 0;
      this._frames = 0;
    }
  }
}
