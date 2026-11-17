/**
 * Trilha procedural (WebAudio) — sem arquivos de áudio, sem licenças.
 * Scheduler com lookahead: setInterval agenda notas ~120ms à frente no relógio do AudioContext,
 * o que mantém o ritmo estável mesmo com o main thread ocupado.
 */
const BPM = 122;
const LOOKAHEAD = 0.12;
const BASS_NOTES = [55, 55, 65.41, 49]; // A1, A1, C2, G1

export class ClubAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextTime = 0;
  private step = 0;
  private muted = false;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.filter).connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.25);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.nextTime = ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 25);
  }

  /** volume 0..1, cutoff em Hz (abafa o som quando o jogador está longe da pista). */
  setMix(volume: number, cutoff: number): void {
    if (!this.ctx || !this.master || !this.filter) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : volume * 0.45, t, 0.2);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.2);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const stepDur = 60 / BPM / 4;
    // Aba em segundo plano atrasa o timer: pula em vez de disparar uma rajada de notas.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(s: number, t: number): void {
    if (s % 4 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t, 0.22);
    if (s % 2 === 1) this.hat(t, 0.06);
    if (s % 16 === 8) this.clap(t);
    if (s % 4 === 2) this.bass(t, BASS_NOTES[Math.floor(s / 16) % BASS_NOTES.length]);
  }

  private out(): GainNode {
    return this.master as GainNode;
  }

  private kick(t: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(g).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out());
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, vol: number): void {
    this.noiseHit(t, 'highpass', 7000, vol, 0.05);
  }

  private clap(t: number): void {
    this.noiseHit(t, 'bandpass', 1500, 0.45, 0.16);
  }

  private bass(t: number, freq: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(f).connect(g).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
