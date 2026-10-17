// Sound, synthesised with the Web Audio API (no audio files): short effects
// for actions and news, plus an ambient server-room hum that grows with the
// number of running racks. Browsers only allow audio after the player has
// interacted with the page, so the audio context starts on the first input.

export type SoundName =
  | 'place' | 'sell' | 'move' | 'click' | 'error' | 'undo' | 'cash'
  | 'goal' | 'achievement' | 'level' | 'good' | 'bad' | 'alarm' | 'research';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private enabled: boolean;
  private volume: number;
  // Throttle: the same sound at most this often (seconds).
  private readonly lastPlayed = new Map<SoundName, number>();

  constructor(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = volume;
    const unlock = (): void => {
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
    this.startHum();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  // Ambient level 0..1 (e.g. from running racks); 0 when paused.
  setAmbient(level: number): void {
    if (!this.ctx || !this.humGain) return;
    this.humGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.12, this.ctx.currentTime, 0.5);
  }

  // A low filtered-noise rumble plus mains hum: the sound of a server room.
  private startHum(): void {
    const ctx = this.ctx!;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master!);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: smoother and lower than white noise.
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    noise.connect(filter).connect(this.humGain);
    noise.start();

    for (const [freq, gain] of [[50, 0.35], [100, 0.18], [150, 0.06]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(this.humGain);
      osc.start();
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(start: number, dur: number, gain: number, freq: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + start;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || !this.enabled || this.volume <= 0) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const now = this.ctx.currentTime;
    const minGap = name === 'place' || name === 'click' ? 0.04 : 0.15;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'click':
        this.tone(1200, 0, 0.04, 'square', 0.05);
        break;
      case 'place':
        this.noiseBurst(0, 0.06, 0.25, 900);
        this.tone(220, 0, 0.12, 'triangle', 0.25, 140);
        break;
      case 'sell':
        this.tone(660, 0, 0.1, 'triangle', 0.18, 440);
        this.tone(440, 0.08, 0.14, 'triangle', 0.15, 330);
        break;
      case 'move':
        this.tone(330, 0, 0.08, 'sine', 0.2, 500);
        break;
      case 'undo':
        this.tone(500, 0, 0.1, 'sine', 0.18, 300);
        break;
      case 'error':
        this.tone(140, 0, 0.18, 'sawtooth', 0.08);
        break;
      case 'cash':
        this.tone(1320, 0, 0.08, 'square', 0.06);
        this.tone(1760, 0.07, 0.12, 'square', 0.06);
        break;
      case 'goal':
        [523, 659, 784].forEach((f, i) => this.tone(f, i * 0.08, 0.22, 'triangle', 0.2));
        break;
      case 'achievement':
        [659, 784, 988, 1319].forEach((f, i) => this.tone(f, i * 0.07, 0.3, 'triangle', 0.18));
        break;
      case 'level':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.35, 'triangle', 0.2));
        break;
      case 'research':
        [440, 554, 659].forEach((f, i) => this.tone(f, i * 0.1, 0.4, 'sine', 0.2));
        break;
      case 'good':
        this.tone(784, 0, 0.12, 'triangle', 0.2);
        this.tone(1047, 0.1, 0.25, 'triangle', 0.2);
        break;
      case 'bad':
        this.tone(330, 0, 0.2, 'triangle', 0.2, 220);
        this.tone(247, 0.18, 0.3, 'triangle', 0.18, 165);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone(880, i * 0.28, 0.14, 'square', 0.07);
          this.tone(660, i * 0.28 + 0.14, 0.14, 'square', 0.07);
        }
        break;
    }
  }
}
