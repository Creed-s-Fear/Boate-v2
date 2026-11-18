/**
 * DOM-based HUD. Security: all text goes through textContent (never innerHTML) — the
 * player name is user input. Performance: only touches the DOM when the value changes.
 */
const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from HTML`);
  return el as T;
};

const MAX_TOASTS = 4;

export class Hud {
  private readonly root = $('hud');
  private readonly name = $('hud-name');
  private readonly money = $('hud-money');
  private readonly items = $('hud-items');
  private readonly objective = $('hud-objective');
  private readonly clock = $('hud-clock');
  private readonly zone = $('hud-zone');
  private readonly mode = $('hud-mode');
  private readonly fps = $('hud-fps');
  private readonly prompt = $('prompt');
  private readonly toasts = $('toasts');
  private readonly help = $('help');
  private readonly crosshair = $('crosshair');
  private readonly vibe = $('bar-vibe');
  private readonly buzz = $('bar-buzz');
  private readonly cache = new Map<HTMLElement, string>();

  show(): void {
    this.root.hidden = false;
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v;
  }

  private set(el: HTMLElement, text: string): void {
    if (this.cache.get(el) === text) return;
    this.cache.set(el, text);
    el.textContent = text;
  }

  setName(v: string): void { this.set(this.name, v); }
  setMoney(v: string): void { this.set(this.money, v); }
  setObjective(v: string): void { this.set(this.objective, v); }
  setClock(v: string): void { this.set(this.clock, v); }
  setZone(v: string): void { this.set(this.zone, v); }
  setFps(v: string): void { this.set(this.fps, v); }

  setMode(first: boolean): void {
    this.set(this.mode, first ? '1st person  [V]' : '3rd person  [V]');
    this.crosshair.hidden = !first;
  }

  setItems(list: string[]): void {
    const key = list.join('|');
    if (this.cache.get(this.items) === key) return;
    this.cache.set(this.items, key);
    this.items.replaceChildren(...list.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }));
  }

  setBars(vibe: number, buzz: number): void {
    const v = `${Math.round(vibe)}%`;
    const b = `${Math.round(buzz * 100)}%`;
    if (this.vibe.style.width !== v) this.vibe.style.width = v;
    if (this.buzz.style.width !== b) this.buzz.style.width = b;
  }

  setPrompt(text: string | null): void {
    if (text === null) {
      this.prompt.hidden = true;
      return;
    }
    this.prompt.hidden = false;
    this.set(this.prompt, text);
  }

  notify(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > MAX_TOASTS) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => el.classList.add('fade'), 4200);
    window.setTimeout(() => el.remove(), 4800);
  }

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }
}
