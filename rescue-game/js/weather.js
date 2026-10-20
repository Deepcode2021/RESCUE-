// Global wind field (smooth base + scheduled gusts + local turbulence) and a reusable rain pool.
import { mulberry32, clamp, lerp } from './utils.js';

export class Wind {
  constructor() { this.reset(0, 1); }

  reset(seed, intensity) {
    this.rnd = mulberry32(seed * 31 + 7);
    this.intensity = intensity;
    this.phase = this.rnd() * 6;
    this.dir = this.rnd() < 0.5 ? -1 : 1;
    this.base = 0;
    this.gust = 0;
    this.gustTarget = 0;
    this.nextGust = 5 + this.rnd() * 4;
    this.gustEnd = 0;
    this.t = 0;
    this.x = 0;          // current large-scale wind acceleration (u/s^2)
    this.y = 0;
    this.strength = 0;   // 0..1 for HUD
    this.gustFlag = false;
  }

  update(dt, t) {
    this.t = t;
    const I = this.intensity;
    // slowly varying baseline
    this.base = this.dir * I * 55 * (0.65 + 0.35 * Math.sin(t * 0.11 + this.phase))
      + I * 22 * Math.sin(t * 0.29 + this.phase * 1.7);
    // scheduled gusts: pick a target, hold, release
    if (t >= this.nextGust) {
      this.gustTarget = (this.rnd() < 0.7 ? this.dir : -this.dir) * I * (90 + this.rnd() * 90);
      this.gustEnd = t + 1.2 + this.rnd() * 1.6;
      this.nextGust = this.gustEnd + 4 + this.rnd() * 6;
    }
    if (t > this.gustEnd) this.gustTarget = 0;
    const rate = Math.abs(this.gustTarget) > Math.abs(this.gust) ? 2.8 : 1.1;
    this.gust += (this.gustTarget - this.gust) * Math.min(1, rate * dt);
    this.gustFlag = Math.abs(this.gust) > 60;
    this.x = this.base + this.gust;
    this.y = 10 * I * Math.sin(t * 0.7 + this.phase);
    this.strength = clamp(Math.abs(this.x) / (I * 190), 0, 1);
  }

  /** Local wind acceleration at a point (adds smooth turbulence). */
  sample(x, y, out) {
    const t = this.t;
    const turb = 0.25 * this.intensity;
    out.x = this.x + 38 * turb * Math.sin(x * 0.011 + t * 1.3) * Math.sin(y * 0.017 - t * 0.9);
    out.y = this.y + 30 * turb * Math.sin(x * 0.015 - t * 1.1 + y * 0.01);
    return out;
  }
}

/** Precipitation in normalised screen space [0,1]^2: rain, snow, sand or petals. Reused forever, no allocation. */
export class Rain {
  constructor(count = 420) {
    this.max = count;
    this.count = count;           // number drawn (density * max)
    this.mode = 'rain';
    this.density = 1;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.sp = new Float32Array(count);
    this.len = new Float32Array(count);
    this.ph = new Float32Array(count);
    this.slant = 0.25;
    this.t = 0;
    this.setMode('rain', 0.62);
  }
  setMode(mode, density = 1) {
    this.mode = mode; this.density = density;
    this.count = Math.max(10, Math.min(this.max, Math.round(this.max * density)));
    for (let i = 0; i < this.max; i++) this.respawn(i, true);
  }
  setDensity(d) { this.density = d; this.count = Math.max(10, Math.min(this.max, Math.round(this.max * d))); }
  respawn(i, anywhere) {
    const m = this.mode;
    this.ph[i] = Math.random() * 6.28;
    if (m === 'sand') {            // streams across the screen
      this.x[i] = anywhere ? Math.random() * 1.4 - 0.2 : -0.1 - Math.random() * 0.1; this.y[i] = Math.random();
      this.sp[i] = 0.9 + Math.random() * 1.2; this.len[i] = 0.02 + Math.random() * 0.05; return;
    }
    this.x[i] = Math.random() * 1.4 - 0.2;
    this.y[i] = anywhere ? Math.random() : -0.05 - Math.random() * 0.1;
    if (m === 'snow') { this.sp[i] = 0.07 + Math.random() * 0.14; this.len[i] = 1 + Math.random() * 2.2; }
    else if (m === 'petal') { this.sp[i] = 0.07 + Math.random() * 0.1; this.len[i] = 2 + Math.random() * 2.5; }
    else { this.sp[i] = 1.1 + Math.random() * 0.8; this.len[i] = 0.025 + Math.random() * 0.03; }
  }
  update(dt, windX) {
    this.t += dt;
    const target = clamp(windX / 150, -1, 1) * 0.55 + 0.12;
    this.slant = lerp(this.slant, target, Math.min(1, dt * 2));
    const m = this.mode, wx = clamp(windX / 150, -1, 1);
    for (let i = 0; i < this.count; i++) {
      if (m === 'rain') {
        this.y[i] += this.sp[i] * dt; this.x[i] += this.sp[i] * this.slant * dt * 0.6;
        if (this.y[i] > 1.05 || this.x[i] > 1.3 || this.x[i] < -0.4) this.respawn(i, false);
      } else if (m === 'sand') {
        this.x[i] += (this.sp[i] * (0.6 + Math.abs(wx)) + 0.3) * dt; this.y[i] += Math.sin(this.t * 2 + this.ph[i]) * 0.02 * dt;
        if (this.x[i] > 1.2) this.respawn(i, false);
      } else {                     // snow / petals: slow fall, sway, pushed by the wind
        this.y[i] += this.sp[i] * dt;
        this.x[i] += (wx * 0.22 + Math.sin(this.t * 1.3 + this.ph[i]) * 0.045) * dt;
        if (this.y[i] > 1.05 || this.x[i] > 1.3 || this.x[i] < -0.4) this.respawn(i, false);
      }
    }
  }
}
