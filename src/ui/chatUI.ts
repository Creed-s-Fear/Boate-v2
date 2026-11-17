/**
 * UI de conversa com as anfitriãs: balões de chat com opções do jogador.
 * Substitui o menu genérico durante as conversas, dando a sensação de
 * diálogo real com personalidades distintas.
 */
import {
  startDialogue, nextRound, chooseOption, getInviteResponse,
  type DialogueState,
} from '../game/dialogue';

export interface ChatCallbacks {
  onAffinityChange: (name: string, delta: number, total: number) => void;
  onBuyDrink: () => void;
  onTip: () => void;
  onInvite: (accept: boolean) => void;
  onClose: () => void;
  canBuyDrink: () => boolean;
  canInvite: () => boolean;
  hasReservation: () => boolean;
  hostessPrice: () => number;
}

export class ChatUI {
  private readonly el: HTMLElement;
  private readonly messages: HTMLElement;
  private readonly options: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly heartsEl: HTMLElement;
  private readonly affPopup: HTMLElement;
  private state: DialogueState | null = null;
  private cb: ChatCallbacks | null = null;
  private roundCount = 0;
  private typing = false;
  private hostessNameStr = '';

  constructor() {
    const el = document.getElementById('chat');
    if (!el) throw new Error('#chat ausente');
    this.el = el;
    this.messages = el.querySelector('#chat-messages')!;
    this.options = el.querySelector('#chat-options')!;
    this.nameEl = el.querySelector('#chat-name')!;
    this.heartsEl = el.querySelector('#chat-hearts')!;
    this.affPopup = el.querySelector('#chat-aff')!;
  }

  get isOpen(): boolean {
    return this.state !== null;
  }

  open(hostessName: string, affinity: number, inRoom: boolean, cb: ChatCallbacks): void {
    this.state = startDialogue(hostessName, affinity, inRoom);
    if (!this.state) return;
    this.cb = cb;
    this.roundCount = 0;
    this.hostessNameStr = hostessName;
    this.nameEl.textContent = hostessName;
    this.updateHearts(affinity);
    this.messages.innerHTML = '';
    this.el.hidden = false;
    this.renderHistory();
    this.renderOptions();
  }

  close(): void {
    this.state = null;
    this.cb = null;
    this.el.hidden = true;
    this.messages.innerHTML = '';
    this.options.innerHTML = '';
  }

  handleKey(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      this.cb?.onClose();
      this.close();
      return true;
    }
    if (this.typing) return true;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m) {
      const idx = Number(m[1]) - 1;
      this.selectOption(idx);
    }
    return true;
  }

  private selectOption(idx: number): void {
    if (!this.state || !this.state.round) return;
    const btns = this.options.querySelectorAll('button[data-action]');
    const btn = btns[idx] as HTMLButtonElement | undefined;
    if (!btn || btn.disabled) return;

    const action = btn.dataset.action!;

    if (action === 'close') {
      this.cb?.onClose();
      this.close();
      return;
    }
    if (action === 'drink') {
      this.cb?.onBuyDrink();
      return;
    }
    if (action === 'tip') {
      this.cb?.onTip();
      return;
    }
    if (action === 'invite') {
      const resp = getInviteResponse(this.hostessNameStr, this.state.affinity);
      this.addMessage('hostess', resp.text);
      if (resp.accept) {
        this.cb?.onInvite(true);
        setTimeout(() => this.close(), 1200);
      } else {
        this.cb?.onInvite(false);
        this.renderOptions();
      }
      return;
    }
    if (action === 'continue') {
      if (nextRound(this.state)) {
        this.addMessage('hostess', this.state.round!.line);
        this.renderOptions();
      }
      return;
    }

    // dialogue option
    const optIdx = parseInt(action, 10);
    if (isNaN(optIdx)) return;

    const result = chooseOption(this.state, optIdx);
    this.roundCount++;

    // show player message immediately
    this.addMessage('player', this.state.round!.options[optIdx].text);

    // show affinity popup
    this.showAffinityDelta(result.affinityDelta);
    this.updateHearts(this.state.affinity);
    this.cb?.onAffinityChange(this.hostessNameStr, result.affinityDelta, this.state.affinity);

    // type hostess reply with delay
    this.typing = true;
    this.options.innerHTML = '<div class="chat-typing">...</div>';
    const delay = 400 + Math.min(result.reply.length * 15, 1200);
    setTimeout(() => {
      this.typing = false;
      this.addMessage('hostess', result.reply);
      // advance to next round or offer continue/actions
      if (nextRound(this.state!)) {
        this.addMessage('hostess', this.state!.round!.line);
      }
      this.renderOptions();
    }, delay);
  }

  private addMessage(speaker: 'hostess' | 'player', text: string): void {
    const div = document.createElement('div');
    div.className = `chat-msg chat-${speaker}`;
    if (speaker === 'hostess') {
      const name = document.createElement('span');
      name.className = 'chat-speaker';
      name.textContent = this.hostessNameStr;
      div.append(name);
    }
    const p = document.createElement('p');
    p.textContent = text;
    div.append(p);
    this.messages.append(div);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private renderHistory(): void {
    if (!this.state) return;
    for (const msg of this.state.history) {
      this.addMessage(msg.speaker, msg.text);
    }
  }

  private renderOptions(): void {
    if (!this.state) return;
    this.options.innerHTML = '';
    let idx = 0;

    // dialogue options (if round is active)
    if (this.state.round) {
      for (let i = 0; i < this.state.round.options.length; i++) {
        const opt = this.state.round.options[i];
        this.addOptionBtn(String(i), opt.text, idx++);
      }
    }

    // action options (every 2 rounds or when no round)
    if (!this.state.round || this.roundCount >= 2) {
      if (!this.state.inRoom) {
        if (this.cb?.canBuyDrink()) {
          this.addOptionBtn('drink', '🍸 Pagar um drink — R$30', idx++);
        }
        this.addOptionBtn('tip', '💰 Dar uma gorjeta — R$50', idx++);
        if (this.cb?.canInvite()) {
          const price = this.cb.hostessPrice();
          this.addOptionBtn('invite', `💜 Convidar para a suíte — R$${price}`, idx++, !this.cb.hasReservation());
        }
      }
    }

    // continue or leave
    if (!this.state.round) {
      this.addOptionBtn('continue', '💬 Continuar conversando', idx++);
    }
    this.addOptionBtn('close', '👋 Até mais', idx++);
  }

  private addOptionBtn(action: string, text: string, idx: number, disabled = false): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.action = action;
    btn.disabled = disabled;
    const kbd = document.createElement('kbd');
    kbd.textContent = String(idx + 1);
    const span = document.createElement('span');
    span.textContent = text;
    btn.append(kbd, span);
    btn.addEventListener('click', () => this.selectOption(idx));
    this.options.append(btn);
  }

  private updateHearts(affinity: number): void {
    const n = Math.round(Math.max(0, Math.min(100, affinity)) / 20);
    this.heartsEl.textContent = '♥'.repeat(n) + '♡'.repeat(5 - n);
  }

  private showAffinityDelta(delta: number): void {
    if (delta === 0) return;
    this.affPopup.textContent = delta > 0 ? `+${delta} ♥` : `${delta} ♥`;
    this.affPopup.className = `chat-aff-popup ${delta > 0 ? 'good' : 'bad'}`;
    this.affPopup.hidden = false;
    setTimeout(() => { this.affPopup.hidden = true; }, 1500);
  }
}
