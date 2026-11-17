/**
 * Engine de cutscenes genérica — timeline de steps, câmera interpolada, diálogo, fade,
 * escolhas e poses. Conteúdo-agnóstica: o Game monta os steps, a engine os executa.
 *
 * Performance: nenhuma alocação por frame (vetores reutilizados).
 * Segurança: texto de diálogo entra via textContent, nunca innerHTML.
 */
import * as THREE from 'three';
import type { Pose } from './character';

// ================================================================ Tipos públicos

export interface Vec3 { x: number; y: number; z: number }

export interface CamTarget {
  pos: Vec3;
  lookAt: Vec3;
  fov?: number;
}

export type EaseFn = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface StepCamera {
  type: 'camera';
  to: CamTarget;
  duration: number;
  ease?: EaseFn;
}

export interface StepPose {
  type: 'pose';
  target: 'hostess' | 'player';
  pose: Pose;
}

export interface StepDialogue {
  type: 'dialogue';
  speaker: string;
  text: string;
  /** Se definido, avança automaticamente após N segundos. Senão, espera input. */
  auto?: number;
}

export interface StepFade {
  type: 'fade';
  /** 0 = transparente, 1 = sólido. */
  opacity: number;
  duration: number;
  color?: string;
}

export interface StepWait {
  type: 'wait';
  duration: number;
}

export interface StepChoice {
  type: 'choice';
  prompt?: string;
  options: Array<{ label: string; value: string }>;
}

export interface StepCallback {
  type: 'callback';
  fn: () => void;
}

export type SceneStep = StepCamera | StepPose | StepDialogue | StepFade | StepWait | StepChoice | StepCallback;

export interface SceneContext {
  hostessPos: Vec3;
  playerPos: Vec3;
  roomCenter: Vec3;
}

export type SceneBuilder = (ctx: SceneContext) => SceneStep[];

export interface PlayOpts {
  onPose?: (target: 'hostess' | 'player', pose: Pose) => void;
  onEnd?: (lastChoice: string | null) => void;
}

// ================================================================ Easing

function ease(t: number, fn: EaseFn): number {
  switch (fn) {
    case 'linear': return t;
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

// ================================================================ Engine

const SKIP_HOLD = 1.5;
const MIN_INPUT_DELAY = 0.25;

export class CutsceneEngine {
  playing = false;

  private steps: SceneStep[] = [];
  private idx = 0;
  private entered = false;
  private elapsed = 0;
  private skipHeld = 0;
  private choiceResult: string | null = null;
  private lastChoice: string | null = null;
  private onPose: PlayOpts['onPose'];
  private onEnd: PlayOpts['onEnd'];

  // Camera lerp (sem alocação por frame)
  private readonly camFrom: CamTarget = { pos: { x: 0, y: 2, z: 0 }, lookAt: { x: 0, y: 1, z: -1 }, fov: 70 };

  // Fade lerp
  private fadeFrom = 0;

  // DOM
  private readonly root: HTMLElement;
  private readonly fadeEl: HTMLElement;
  private readonly dlg: HTMLElement;
  private readonly speaker: HTMLElement;
  private readonly text: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly choices: HTMLElement;
  private readonly skipEl: HTMLElement;
  private readonly skipBar: HTMLElement;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    const $ = (id: string): HTMLElement => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`#${id} ausente`);
      return el;
    };
    this.root = $('cutscene');
    this.fadeEl = $('cs-fade');
    this.dlg = $('cs-dialogue');
    this.speaker = $('cs-speaker');
    this.text = $('cs-text');
    this.hint = $('cs-advance');
    this.choices = $('cs-choices');
    this.skipEl = $('cs-skip');
    this.skipBar = $('cs-skip-bar');
  }

  play(steps: SceneStep[], opts: PlayOpts = {}): void {
    this.steps = steps;
    this.idx = 0;
    this.entered = false;
    this.elapsed = 0;
    this.playing = true;
    this.skipHeld = 0;
    this.choiceResult = null;
    this.lastChoice = null;
    this.onPose = opts.onPose;
    this.onEnd = opts.onEnd;

    this.saveCamFrom();
    this.fadeFrom = 0;

    this.root.hidden = false;
    this.fadeEl.style.opacity = '0';
    this.dlg.hidden = true;
    this.choices.hidden = true;
    this.skipEl.hidden = false;
  }

  /** Chamado uma vez por frame pelo Game. */
  update(dt: number, escDown: boolean, advancePressed: boolean): void {
    if (!this.playing) return;

    // --- Skip ---
    if (escDown) {
      this.skipHeld += dt;
    } else {
      this.skipHeld = Math.max(0, this.skipHeld - dt * 3);
    }
    const skipPct = Math.min(this.skipHeld / SKIP_HOLD, 1);
    this.skipBar.style.width = `${skipPct * 100}%`;
    if (skipPct >= 1) { this.finish(); return; }

    // --- Step atual ---
    const step = this.steps[this.idx];
    if (!step) { this.finish(); return; }

    if (!this.entered) {
      this.enter(step);
      this.entered = true;
      this.elapsed = 0;
    }
    this.elapsed += dt;

    switch (step.type) {
      case 'camera': {
        const t = ease(Math.min(this.elapsed / step.duration, 1), step.ease ?? 'easeInOut');
        this.lerpCam(step.to, t);
        if (this.elapsed >= step.duration) this.next();
        break;
      }
      case 'fade': {
        const raw = Math.min(this.elapsed / step.duration, 1);
        this.fadeEl.style.opacity = String(this.fadeFrom + (step.opacity - this.fadeFrom) * raw);
        if (raw >= 1) this.next();
        break;
      }
      case 'wait':
        if (this.elapsed >= step.duration) this.next();
        break;
      case 'dialogue':
        if (step.auto) {
          if (this.elapsed >= step.auto) this.next();
        } else if (advancePressed && this.elapsed > MIN_INPUT_DELAY) {
          this.next();
        }
        break;
      case 'choice':
        if (this.choiceResult !== null) {
          this.lastChoice = this.choiceResult;
          this.next();
        }
        break;
      case 'pose':
      case 'callback':
        this.next();
        break;
    }
  }

  /** Consome tecla durante cutscene. Retorna true se consumiu. */
  handleKey(code: string): boolean {
    if (!this.playing) return false;
    const step = this.steps[this.idx];
    if (step?.type === 'choice' && this.choiceResult === null) {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (m) {
        const i = Number(m[1]) - 1;
        if (i < step.options.length) this.choiceResult = step.options[i].value;
        return true;
      }
    }
    return true;
  }

  // ================================================================ Internos

  private enter(step: SceneStep): void {
    this.dlg.hidden = true;
    this.choices.hidden = true;

    switch (step.type) {
      case 'camera':
        this.saveCamFrom();
        break;
      case 'pose':
        this.onPose?.(step.target, step.pose);
        break;
      case 'dialogue':
        this.dlg.hidden = false;
        this.speaker.textContent = step.speaker;
        this.text.textContent = step.text;
        this.hint.textContent = step.auto ? '' : '[E] continuar';
        break;
      case 'choice': {
        this.choices.hidden = false;
        this.choiceResult = null;
        const nodes: HTMLElement[] = [];
        if (step.prompt) {
          const p = document.createElement('p');
          p.className = 'cs-prompt';
          p.textContent = step.prompt;
          nodes.push(p);
        }
        step.options.forEach((opt, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cs-choice-btn';
          const kbd = document.createElement('kbd');
          kbd.textContent = String(i + 1);
          const span = document.createElement('span');
          span.textContent = opt.label;
          btn.append(kbd, span);
          btn.addEventListener('click', () => { this.choiceResult = opt.value; });
          nodes.push(btn);
        });
        this.choices.replaceChildren(...nodes);
        break;
      }
      case 'fade':
        this.fadeFrom = parseFloat(this.fadeEl.style.opacity || '0');
        if (step.color) this.fadeEl.style.background = step.color;
        else this.fadeEl.style.background = '';
        break;
      case 'callback':
        step.fn();
        break;
    }
  }

  private next(): void {
    this.idx++;
    this.entered = false;
    this.elapsed = 0;
  }

  private finish(): void {
    this.playing = false;
    this.root.hidden = true;
    this.fadeEl.style.opacity = '0';
    this.dlg.hidden = true;
    this.choices.hidden = true;
    const cb = this.onEnd;
    const choice = this.lastChoice;
    this.onEnd = undefined;
    this.onPose = undefined;
    cb?.(choice);
  }

  private saveCamFrom(): void {
    const c = this.camera;
    const dir = new THREE.Vector3();
    c.getWorldDirection(dir);
    const f = this.camFrom;
    f.pos.x = c.position.x;
    f.pos.y = c.position.y;
    f.pos.z = c.position.z;
    f.lookAt.x = c.position.x + dir.x * 5;
    f.lookAt.y = c.position.y + dir.y * 5;
    f.lookAt.z = c.position.z + dir.z * 5;
    f.fov = c.fov;
  }

  private lerpCam(to: CamTarget, t: number): void {
    const f = this.camFrom;
    this.camera.position.set(
      f.pos.x + (to.pos.x - f.pos.x) * t,
      f.pos.y + (to.pos.y - f.pos.y) * t,
      f.pos.z + (to.pos.z - f.pos.z) * t,
    );
    this.camera.lookAt(
      f.lookAt.x + (to.lookAt.x - f.lookAt.x) * t,
      f.lookAt.y + (to.lookAt.y - f.lookAt.y) * t,
      f.lookAt.z + (to.lookAt.z - f.lookAt.z) * t,
    );
    const fromFov = f.fov ?? 70;
    const toFov = to.fov ?? fromFov;
    const fov = fromFov + (toFov - fromFov) * t;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
