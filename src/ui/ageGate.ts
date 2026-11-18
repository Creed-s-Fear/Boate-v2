const STORAGE_KEY = 'joh.age.v1';

export class AgeGate {
  private readonly root: HTMLElement;

  constructor() {
    const el = document.getElementById('age-gate');
    if (!el) throw new Error('#age-gate ausente');
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
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage indisponível */ }
      this.root.hidden = true;
      onVerified();
    }, { once: true });

    document.getElementById('age-deny')!.addEventListener('click', () => {
      const msg = document.createElement('div');
      msg.className = 'age-denied';
      msg.textContent = 'Este conteúdo é restrito para maiores de 18 anos.';
      this.root.replaceChildren(msg);
    }, { once: true });
  }
}
