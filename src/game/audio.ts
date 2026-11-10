// Tiny WebAudio synthesizer – no sample files, positional pan/attenuation.

export type SfxKind =
  | "pistol"
  | "shotgun"
  | "empty"
  | "enemyShot"
  | "plasma"
  | "hurt"
  | "enemyPain"
  | "enemyDie"
  | "pickup"
  | "explosion"
  | "switch"
  | "exit"
  | "step";

export class Sound {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  muted = false;
  hum: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  startAmbient() {
    if (!this.ctx || !this.master || this.hum) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 1.5);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = "sawtooth";
    o2.type = "sine";
    o1.frequency.value = 41;
    o2.frequency.value = 62;
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 60;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    o1.start();
    o2.start();
    lfo.start();
    this.hum = { osc: [o1, o2, lfo], gain: g };
  }

  stopAmbient() {
    if (!this.hum || !this.ctx) return;
    const h = this.hum;
    h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => h.osc.forEach((o) => o.stop()), 800);
    this.hum = null;
  }

  private out(pan: number, vol: number): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  private burst(dest: AudioNode, t: number, dur: number, freq: number, q: number, type: BiquadFilterType, gain: number) {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.25), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, f0: number, f1: number, type: OscillatorType, gain: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(kind: SfxKind, dist = 0, pan = 0) {
    if (!this.ctx || this.muted) return;
    const vol = Math.max(0, 1 - dist / 22);
    if (vol <= 0.01) return;
    const d = this.out(pan, vol);
    if (!d) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case "pistol":
        this.burst(d, t, 0.18, 3200, 0.8, "bandpass", 0.9);
        this.burst(d, t, 0.35, 700, 0.5, "lowpass", 0.5);
        this.tone(d, t, 0.14, 240, 50, "sawtooth", 0.35);
        break;
      case "shotgun":
        this.burst(d, t, 0.55, 2400, 0.6, "lowpass", 1.0);
        this.burst(d, t + 0.01, 0.4, 600, 0.5, "lowpass", 0.9);
        this.tone(d, t, 0.3, 110, 28, "sawtooth", 0.6);
        // pump
        this.burst(d, t + 0.42, 0.06, 2200, 2, "bandpass", 0.4);
        this.burst(d, t + 0.55, 0.07, 1500, 2, "bandpass", 0.4);
        break;
      case "empty":
        this.burst(d, t, 0.04, 3000, 3, "bandpass", 0.4);
        break;
      case "enemyShot":
        this.burst(d, t, 0.2, 2200, 0.7, "bandpass", 0.7);
        this.tone(d, t, 0.18, 320, 70, "square", 0.18);
        break;
      case "plasma":
        this.tone(d, t, 0.45, 900, 140, "sawtooth", 0.25);
        this.tone(d, t, 0.45, 450, 90, "sine", 0.3);
        break;
      case "hurt":
        this.tone(d, t, 0.25, 160, 55, "sawtooth", 0.5);
        this.burst(d, t, 0.15, 900, 1, "lowpass", 0.5);
        break;
      case "enemyPain":
        this.tone(d, t, 0.14, 260, 140, "square", 0.2);
        this.burst(d, t, 0.1, 1200, 1, "bandpass", 0.3);
        break;
      case "enemyDie":
        this.tone(d, t, 0.6, 280, 40, "sawtooth", 0.35);
        this.tone(d, t + 0.05, 0.5, 190, 30, "square", 0.2);
        this.burst(d, t, 0.4, 1000, 0.8, "lowpass", 0.4);
        break;
      case "pickup":
        this.tone(d, t, 0.1, 660, 660, "square", 0.15);
        this.tone(d, t + 0.09, 0.16, 990, 990, "square", 0.15);
        break;
      case "explosion":
        this.burst(d, t, 1.2, 900, 0.5, "lowpass", 1.4);
        this.tone(d, t, 0.9, 80, 18, "sawtooth", 0.9);
        this.burst(d, t + 0.05, 0.6, 3000, 0.5, "bandpass", 0.5);
        break;
      case "switch":
        this.burst(d, t, 0.05, 1800, 2, "bandpass", 0.3);
        this.burst(d, t + 0.1, 0.05, 1200, 2, "bandpass", 0.3);
        break;
      case "exit":
        this.tone(d, t, 0.2, 440, 440, "triangle", 0.3);
        this.tone(d, t + 0.15, 0.2, 660, 660, "triangle", 0.3);
        this.tone(d, t + 0.3, 0.4, 880, 880, "triangle", 0.3);
        break;
      case "step":
        this.burst(d, t, 0.07, 240, 0.7, "lowpass", 0.22);
        break;
    }
  }
}
