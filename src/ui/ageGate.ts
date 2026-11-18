const STORAGE_KEY = 'joh.age.v1';

export class AgeGate {
  private readonly root: HTMLElement;

  constructor() {
    const el = document.getElementById('age-gate');
    if (!el) throw new Error('#age-gate missing');
    this.root = el;
  }

  private isVerified(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  show(onVerified: () => void): void {
    if (this.isVerified()) {
      this.root.hidden = true;
      onVerified();
      return;
    }
    this.root.hidden = false;

    document.getElementById('age-confirm')!.addEventListener('click', () => {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ }
      this.root.hidden = true;
      onVerified();
    }, { once: true });

    document.getElementById('age-deny')!.addEventListener('click', () => {
      const msg = document.createElement('div');
      msg.className = 'age-denied';
      msg.textContent = 'This content is restricted to adults aged 18 and over.';
      this.root.replaceChildren(msg);
    }, { once: true });
  }
}
