// Procedural Web Audio: rotor, wind, rain loops + one-shot effects. Nothing is created until a user gesture.
// Music slot: attachMusic(url) routes an optional <audio> track through the master gain (licensed music can be added later).
export class AudioEngine {
  constructor() {
    this.ctx = null; this.muted = false; this.ready = false;
    this.master = null; this.loops = null; this.noiseBuf = null; this.musicEl = null;
  }

  /** Must be called from a user gesture (click / key / touch). Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(ctx.destination);
      // 2 s of white noise, reused by every noise-based sound
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.loops = {
        rain: this._noiseLoop('highpass', 2200, 0.7),
        wind: this._noiseLoop('bandpass', 420, 0.9),
        rotor: this._rotor(),
        winch: this._noiseLoop('bandpass', 1500, 4),
        tension: this._drone(),
      };
      this.ratchet = this._ratchet();
      this.lastLen = 0; this.cueT = 0; this.creakT = 0;
      this.ready = true;
    } catch (e) { this.ready = false; }
  }

  _noiseLoop(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { g, f };
  }

  /** Low two-oscillator drone: silent at first, swells as the storm intensifies. */
  _drone() {
    const ctx = this.ctx, amp = ctx.createGain(); amp.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    for (const f of [55, 58.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    lp.connect(amp); amp.connect(this.master);
    return { amp, lp };
  }

  /** Winch ratchet: the winch noise loop's gain is chopped by a square LFO to make a clicking sound. */
  _ratchet() {
    const ctx = this.ctx, lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17;
    const depth = ctx.createGain(); depth.gain.value = 0.5; lfo.connect(depth);
    const rg = ctx.createGain(); rg.gain.value = 0.5;            // 0.5 +/- 0.5 = clicking on/off
    depth.connect(rg.gain);
    const g = this.loops.winch.g; g.disconnect(); g.connect(rg); rg.connect(this.master);
    lfo.start();
    return { lfo, depth, rg };
  }

  _rotor() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 46;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const amp = ctx.createGain(); amp.gain.value = 0;
    const chop = ctx.createGain(); chop.gain.value = 0.5;               // chopper "thump" via LFO on a gain stage
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 13;
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth); lfoDepth.connect(chop.gain);
    osc.connect(lp); lp.connect(chop); chop.connect(amp); amp.connect(this.master);
    osc.start(); lfo.start();
    return { amp, lfo, osc };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.03);
    if (this.musicEl) this.musicEl.muted = m;
  }

  /** Per-frame ambience update. active=false silences loops (title / pause / results). */
  update(world, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, L = this.loops;
    if (!active) {
      L.rain.g.gain.setTargetAtTime(active === null ? 0.03 : 0, t, 0.1);
      L.wind.g.gain.setTargetAtTime(0, t, 0.1);
      L.rotor.amp.gain.setTargetAtTime(0, t, 0.1);
      L.winch.g.gain.setTargetAtTime(0, t, 0.05);
      L.tension.amp.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    const h = world.heli, tn = world.tornado;
    const th = world.theme, mode = th ? th.precip.mode : 'rain', I = world.intensity || 0;
    // the precipitation loop changes character per place: hiss of rain, soft snow, rasping sand, thin petals
    const pv = mode === 'snow' ? 0.012 : mode === 'sand' ? 0.07 : mode === 'petal' ? 0.02 : 0.045;
    L.rain.f.type = mode === 'sand' ? 'bandpass' : 'highpass'; L.rain.f.frequency.setTargetAtTime(mode === 'sand' ? 2600 : 2200, t, 0.2);
    L.rain.g.gain.setTargetAtTime(pv * (0.8 + 0.6 * I + 0.4 * (world.squall || 0)), t, 0.2);
    L.tension.amp.gain.setTargetAtTime(0.012 + 0.05 * I * I + 0.03 * (world.squall || 0), t, 0.5);
    L.tension.lp.frequency.setTargetAtTime(130 + 200 * I, t, 0.5);
    // winch ratchet while the rope length changes
    const len = world.rope.length(), moving = Math.abs(len - this.lastLen) > 0.06;
    this.lastLen = len;
    L.winch.g.gain.setTargetAtTime(moving ? 0.08 : 0, t, 0.04);
    L.winch.f.frequency.setTargetAtTime(1300 + 60 * len * 0.01, t, 0.1);
    // creaking grip on Hard
    if (world.cfg.slip && world.riders.length) {
      let g = 100; for (const r of world.riders) if (r.grip < g) g = r.grip;
      this.creakT -= 1 / 60;
      if (g < 45 && this.creakT <= 0) { this.creak(); this.creakT = 0.55 + g / 80; }
    }
    // ambient cue from the place, every so often
    this.cueT -= 1 / 60;
    if (this.cueT <= 0) { this.cueT = 14 + Math.random() * 16; this.cue(world.cfg.theme); }
    const wv = 0.02 + 0.11 * world.wind.strength + (tn.active ? 0.12 * tn.ramp * tn.visibility : 0);
    L.wind.g.gain.setTargetAtTime(wv, t, 0.15);
    L.wind.f.frequency.setTargetAtTime(300 + 500 * world.wind.strength + (tn.active ? 250 : 0), t, 0.2);
    L.rotor.amp.gain.setTargetAtTime(h.crashed ? 0 : 0.11 + 0.06 * h.collective, t, 0.1);
    L.rotor.lfo.frequency.setTargetAtTime(9 + h.collective * 5, t, 0.1);
  }

  tone(freq, dur, type = 'sine', vol = 0.18, slideTo = 0, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  burst(dur, freq, vol = 0.25, type = 'lowpass') {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ---- named effects ----
  // ---- v6 feedback sounds ----
  hooked() { this.tone(660, 0.07, 'triangle', 0.16); this.tone(990, 0.12, 'triangle', 0.16, 0, 0.07); }
  tooFast() { this.tone(240, 0.12, 'square', 0.07, 170); }
  nearMiss() { this.tone(494, 0.18, 'triangle', 0.15, 0, 0); this.tone(392, 0.4, 'triangle', 0.15, 330, 0.18); }
  tick() { this.tone(880, 0.05, 'sine', 0.06); }
  // ---- v5 effects ----
  gore() {
    this.burst(0.5, 700, 0.5, 'lowpass'); this.burst(0.22, 2600, 0.3, 'bandpass'); this.tone(70, 0.35, 'sine', 0.4, 28);
    for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.09, 500 + Math.random() * 500, 0.22, 'lowpass'), 90 + i * 85 + Math.random() * 40);
  }
  creak() { this.tone(180 + Math.random() * 60, 0.35, 'sawtooth', 0.05, 120 + Math.random() * 40); this.tone(360, 0.25, 'square', 0.025, 300); }
  fanfare(n = 2) { const f = [392, 494, 587, 784, 988]; for (let i = 0; i < Math.min(5, n + 2); i++) this.tone(f[i], 0.26, 'triangle', 0.2, 0, i * 0.09); this.tone(196, 0.9, 'sine', 0.16, 0, 0.1); }
  squall() { this.burst(2.4, 500, 0.3, 'bandpass'); this.tone(90, 1.8, 'sawtooth', 0.06, 160); }
  thunderLater() { setTimeout(() => this.thunder(), 300 + Math.random() * 2200); }
  /** One distant sound that belongs to the place. */
  cue(theme) {
    switch (theme) {
      case 'paris': for (const [f, v] of [[196, 0.1], [392, 0.06], [587, 0.04], [830, 0.025]]) this.tone(f, 2.6, 'sine', v); setTimeout(() => this.tone(196, 2.4, 'sine', 0.08), 1300); break;
      case 'mumbai': this.tone(233, 0.28, 'sawtooth', 0.045, 0); this.tone(293, 0.28, 'sawtooth', 0.04, 0); setTimeout(() => { this.tone(233, 0.45, 'sawtooth', 0.045); this.tone(293, 0.45, 'sawtooth', 0.04); }, 380); break;
      case 'newyork': for (let i = 0; i < 3; i++) this.tone(720, 0.5, 'sine', 0.05, 980, i * 0.55); break;
      case 'tokyo': [1318, 988, 1318, 988].forEach((f, i) => this.tone(f, 0.13, 'sine', 0.07, 0, i * 0.2)); break;
      case 'dubai': this.burst(2.2, 2400, 0.12, 'bandpass'); break;
      case 'harbor': this.tone(98, 1.6, 'sawtooth', 0.07, 92); break;
      case 'himalaya': [1568, 2093, 1760, 2349].forEach((f, i) => this.tone(f, 1.4, 'sine', 0.025, 0, i * 0.22)); break;
      default: this.tone(147, 1.8, 'triangle', 0.04, 140);
    }
  }
  click() { this.tone(520, 0.06, 'square', 0.08); }
  grab() { this.tone(330, 0.09, 'triangle', 0.2, 520); }
  ropeHit(s) { this.burst(0.12, 900, Math.min(0.3, 0.08 + s / 1500), 'bandpass'); }
  impact(s) { this.burst(0.28, 260, Math.min(0.5, 0.12 + s / 700)); this.tone(90, 0.2, 'sine', Math.min(0.35, s / 900), 45); }
  rescue() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, 0, i * 0.08)); }
  lost() { this.tone(320, 0.5, 'sawtooth', 0.14, 70); }
  warning() { for (let i = 0; i < 3; i++) { this.tone(660, 0.22, 'square', 0.11, 0, i * 0.5); this.tone(495, 0.22, 'square', 0.11, 0, i * 0.5 + 0.25); } }
  splash() { this.burst(0.45, 1400, 0.3, 'bandpass'); this.tone(240, 0.3, 'sine', 0.15, 90); }
  chop() { this.burst(0.25, 1800, 0.35, 'bandpass'); this.tone(150, 0.18, 'sawtooth', 0.18, 60); }
  thunder() { this.burst(1.6, 180, 0.35); }
  crash() { this.burst(0.9, 500, 0.5); this.tone(120, 0.6, 'sawtooth', 0.25, 30); }
  success() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, 0, i * 0.14)); }
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, 0, i * 0.18)); }

  attachMusic(url) {
    if (!this.ctx) return;
    this.musicEl = new Audio(url); this.musicEl.loop = true; this.musicEl.muted = this.muted;
    const src = this.ctx.createMediaElementSource(this.musicEl);
    const g = this.ctx.createGain(); g.gain.value = 0.35;
    src.connect(g); g.connect(this.master);
    this.musicEl.play().catch(() => {});
  }
}
