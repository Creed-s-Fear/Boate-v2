/**
 * Modal menu (reception, bar, ATM...). Keys 1–9 select, Esc closes.
 * Content is rebuilt after each action to reflect the updated state.
 */
export interface MenuItem {
  label: string;
  detail?: string;
  disabled?: boolean;
  /** Return 'close' to close the menu after the action (can be async, e.g. a payment). */
  action?: () => void | 'close' | Promise<void | 'close'>;
}

export interface MenuSpec {
  title: string;
  subtitle?: string;
  items: MenuItem[];
}

export class Menu {
  private readonly el: HTMLElement;
  private builder: (() => MenuSpec) | null = null;
  private spec: MenuSpec | null = null;
  onClose: () => void = () => undefined;

  constructor() {
    const el = document.getElementById('menu');
    if (!el) throw new Error('#menu missing');
    this.el = el;
  }

  get isOpen(): boolean {
    return this.builder !== null;
  }

  open(builder: () => MenuSpec): void {
    this.builder = builder;
    this.render();
    this.el.hidden = false;
  }

  close(): void {
    if (!this.builder) return;
    this.builder = null;
    this.spec = null;
    this.el.hidden = true;
    this.onClose();
  }

  /** Returns true if the key was consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (e.code === 'Escape' || e.code === 'Backspace' || e.code === 'KeyE') {
      this.close();
      return true;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) this.select(Number(m[1]) - 1);
    return true;
  }

  private select(i: number): void {
    const item = this.spec?.items[i];
    if (!item || item.disabled || !item.action) return;
    const r = item.action();
    if (r instanceof Promise) {
      const builder = this.builder;
      void r.then((v) => {
        // the player may have closed or switched menus while waiting for the server
        if (this.builder !== builder) return;
        if (v === 'close') this.close();
        else this.render();
      });
      return;
    }
    if (r === 'close') this.close();
    else if (this.builder) this.render();
  }

  private render(): void {
    if (!this.builder) return;
    const spec = this.builder();
    this.spec = spec;
    const title = document.createElement('h2');
    title.textContent = spec.title;
    const nodes: HTMLElement[] = [title];
    if (spec.subtitle) {
      const sub = document.createElement('p');
      sub.className = 'menu-sub';
      sub.textContent = spec.subtitle;
      nodes.push(sub);
    }
    const list = document.createElement('ol');
    spec.items.forEach((item, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !!item.disabled || !item.action;
      const key = document.createElement('kbd');
      key.textContent = String(i + 1);
      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = item.label;
      btn.append(key, label);
      if (item.detail) {
        const d = document.createElement('span');
        d.className = 'menu-detail';
        d.textContent = item.detail;
        btn.append(d);
      }
      btn.addEventListener('click', () => this.select(i));
      li.append(btn);
      list.append(li);
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'menu-close';
    close.textContent = 'Close  [Esc]';
    close.addEventListener('click', () => this.close());
    nodes.push(list, close);
    this.el.replaceChildren(...nodes);
  }
}
