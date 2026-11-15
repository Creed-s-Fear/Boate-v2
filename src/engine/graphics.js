import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Presets de qualidade. `dpr` é o teto do pixel ratio; `reflection` é a fração da
// resolução usada no reflexo do piso (0 desliga o passe extra de reflexo).
export const PRESETS = {
  baixa: { dpr: 1.0, msaa: 0, reflection: 0.0, bloom: 0.34 },
  media: { dpr: 1.25, msaa: 2, reflection: 0.4, bloom: 0.37 },
  // dpr limitado a 1,5: em tela de alta densidade 1,75 com MSAA 4x custa caro e quase não se nota
  alta: { dpr: 1.5, msaa: 4, reflection: 0.5, bloom: 0.4 },
};
export const PRESET_ORDER = ['baixa', 'media', 'alta'];
const MIN_SCALE = 0.55; // piso da escala dinâmica de resolução

// Antes do bloom: comprime os picos de brilho (reflexo de luz em superfície lisa chega a
// 10x o branco e vira um clarão que ofusca). Abaixo do joelho nada muda; acima, a curva
// achata e o pico fica limitado. O neon continua brilhando, só os estouros somem.
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
        c *= (uKnee + uRange * x / (x + uRange)) / l; // tende a joelho + faixa, nunca passa
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Passe final: vinheta, leve aberração cromática nas bordas, granulação e, no mesmo
// passe, o mapeamento de tons e a conversão de cor para a tela (economiza um passe de
// tela cheia que antes era separado).
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

    this.quality = 'alta';
    this.scale = 1; // escala dinâmica de resolução (0.55 a 1)
    this.onResize = null; // callback(w, h, preset) em pixels do buffer
    this.onQuality = null; // callback(nome) quando o nível muda (pelo jogador ou sozinho)
    this._acc = 0;
    this._frames = 0;
    this.fps = 60;
    this.composer = null;
    this._restNext = 120;
    this._resetAdapt();
  }

  _resetAdapt() {
    this._slow = 0; // segundos seguidos abaixo da meta
    this._hold = 0; // segundos de espera antes de tentar subir a resolução
    this._rest = 0; // segundos sem mexer em nada (depois de uma redução inútil)
    this._futile = 0; // reduções seguidas que não melhoraram a taxa
    this._probe = null; // redução em observação: { fps de antes, wait, preset }
    this._undo = null; // como estava antes das reduções ainda não confirmadas
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

  // Escolha do jogador: vale na hora e zera o ajuste automático.
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

  // Mede a taxa de quadros (tempo real entre quadros) e chama o ajuste uma vez por segundo.
  _adapt() {
    const now = performance.now();
    const dt = (now - (this._last || now)) / 1000;
    this._last = now;
    // pausas longas (aba em segundo plano) não contam
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

  // Segura a taxa de quadros: primeiro baixa a resolução aos poucos; no piso, desce um
  // nível de qualidade. Cada redução é conferida: se a taxa não melhora, o limite não é a
  // placa de vídeo (aba em segundo plano, economia de energia, monitor de 30 Hz), então a
  // redução é desfeita e o ajuste descansa. Subir de nível é com o jogador (tecla G).
  _tune(fps) {
    if (this._rest > 0) {
      this._rest--;
      return;
    }
    this._hold = Math.max(0, this._hold - 1);

    if (this._probe) {
      if (--this._probe.wait > 0) return; // espera a medida assentar depois da mudança
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
      this._hold = 20; // segura a resolução baixa por 20 s antes de tentar subir
      this.scale = Math.max(MIN_SCALE, this.scale - 0.12);
      this.resize();
    } else if (fps < 40) {
      const i = PRESET_ORDER.indexOf(this.quality);
      if (i === 0) return;
      this._undo = { quality: this.quality, scale: this.scale };
      this._probe = { fps, wait: 3, preset: true };
      this._hold = 20;
      this._apply(PRESET_ORDER[i - 1], MIN_SCALE); // mesma resolução: só o nível fica mais leve
    }
  }

  // Materiais dos passes de tela cheia, para compilar junto com os do cenário na carga.
  // `screen` são os do último passe, que desenha direto na tela (com mapeamento de tons).
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

  // adapt = false quando o jogo está parado no menu (lá a taxa de quadros é baixa de propósito)
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
