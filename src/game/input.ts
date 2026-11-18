/**
 * Keyboard + mouse (pointer lock). State read per frame; `endFrame()` resets deltas.
 * No input data leaves the client — when multiplayer is added, the server should
 * receive only intents (e.g. "move forward") and validate everything.
 */
const MAX_MOUSE_DELTA = 200; // discard spikes in movementX/Y (known bug in some browsers)

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += clampDelta(e.movementX);
      this.mouseDY += clampDelta(e.movementY);
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
    });
  }

  lock(): void {
    try {
      void Promise.resolve(this.canvas.requestPointerLock()).catch(() => undefined);
    } catch {
      /* pointer lock requires user gesture; the pause overlay covers the failure */
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

function clampDelta(v: number): number {
  return Math.max(-MAX_MOUSE_DELTA, Math.min(MAX_MOUSE_DELTA, v));
}
