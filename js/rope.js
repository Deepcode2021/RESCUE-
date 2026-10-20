// Verlet rope: ROPE_N particles, distance constraints (forward+backward sweeps), terrain collision.
// Simulation only. Drawing lives in renderer.js.
import { GRAVITY } from './constants.js';
import { clamp } from './utils.js';

export const ROPE_N = 20;
export const SEG_DEPLOYED = 11;
export const SEG_RETRACTED = 5;
export const SEG_MIN = 5;
export const SEG_MAX = 17;           // longest line = 19 x 17 = 323 units
export const ADJUST_RATE = 6;        // segment length change per second while a rope key is held
const ITER = 24;
const DAMP = 0.994;
const NODE_R = 3;

const _w = { x: 0, y: 0 };
const _f = { ax: 0, ay: 0, f: 0 };

export class Rope {
  constructor() {
    const n = ROPE_N;
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.invm = new Float32Array(n);
    this.deployed = true;
    this.seg = SEG_DEPLOYED;
    this.segTarget = SEG_DEPLOYED;
    this.carrying = false;
    this.loads = [];                 // fractional node positions of survivors hanging on the rope
    this.hookVX = 0; this.hookVY = 0;
    this.hookAcc = 0;  // smoothed hook acceleration (drives survivor grip)
    this._pvx = 0; this._pvy = 0;
    this.maxStretch = 1;
  }

  reset(ax, ay) {
    this.deployed = true; this.seg = this.segTarget = SEG_DEPLOYED;
    this.carrying = false; this.loads.length = 0;
    for (let i = 0; i < this.n; i++) {
      this.x[i] = this.px[i] = ax;
      this.y[i] = this.py[i] = ay + i * this.seg;
    }
    this._pvx = this._pvy = 0; this.hookAcc = 0;
    this.updateMass();
  }

  updateMass() {
    for (let i = 1; i < this.n; i++) this.invm[i] = 1;
    this.invm[0] = 0;
    const n = this.n;
    this.invm[n - 1] = 0.3;
    this.invm[n - 2] = 0.8;
    for (let k = 0; k < this.loads.length; k++) {           // every rider is a real weight on the rope
      const i = Math.min(n - 1, Math.max(1, Math.round(this.loads[k])));
      if (i >= n - 1) { this.invm[n - 1] = Math.min(this.invm[n - 1], 0.14); this.invm[n - 2] = Math.min(this.invm[n - 2], 0.5); }
      else this.invm[i] = Math.min(this.invm[i], 0.32);
    }
  }

  /** Interpolated position / velocity at fractional node index p (used to hang riders on the rope). */
  pointAt(p, out) {
    const i = Math.min(this.n - 2, Math.max(0, Math.floor(p))), f = Math.min(1, Math.max(0, p - i));
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * f;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * f;
    out.sx = this.x[i + 1] - this.x[i]; out.sy = this.y[i + 1] - this.y[i];
    out.vx = ((this.x[i] - this.px[i]) * (1 - f) + (this.x[i + 1] - this.px[i + 1]) * f) / (this._dt || 1 / 60);
    out.vy = ((this.y[i] - this.py[i]) * (1 - f) + (this.y[i + 1] - this.py[i + 1]) * f) / (this._dt || 1 / 60);
    return out;
  }

  setLoads(positions) { this.loads.length = 0; for (let i = 0; i < positions.length; i++) this.loads.push(positions[i]); this.carrying = this.loads.length > 0; this.updateMass(); }

  toggle() {
    this.deployed = !this.deployed;
    this.segTarget = this.deployed ? SEG_DEPLOYED : SEG_RETRACTED;
  }

  /** Continuous winch: dir -1 = reel in (shorter), +1 = pay out (longer). */
  adjust(dir, dt) {
    if (!dir) return;
    this.deployed = true;
    this.segTarget = Math.min(SEG_MAX, Math.max(SEG_MIN, this.segTarget + dir * ADJUST_RATE * dt));
  }

  length() { return this.seg * (this.n - 1); }

  step(dt, anchorX, anchorY, wind, tornado, terrain) {
    const n = this.n, x = this.x, y = this.y, px = this.px, py = this.py;
    this._dt = dt;
    this.seg += (this.segTarget - this.seg) * Math.min(1, dt * 2.2);

    // anchor follows helicopter exactly (velocity is carried by the constraint solve)
    x[0] = anchorX; y[0] = anchorY; px[0] = anchorX; py[0] = anchorY;

    const dt2 = dt * dt;
    for (let i = 1; i < n; i++) {
      let vx = (x[i] - px[i]) * DAMP;
      let vy = (y[i] - py[i]) * DAMP;
      const sp2 = vx * vx + vy * vy;
      if (sp2 > 1225) { const k = 35 / Math.sqrt(sp2); vx *= k; vy *= k; }  // <= 2100 u/s per node
      px[i] = x[i]; py[i] = y[i];
      wind.sample(x[i], y[i], _w);
      tornado.forceAt(x[i], y[i], _f, 1.0);
      const ax = _w.x * 1.7 + _f.ax;
      const ay = GRAVITY + _w.y * 1.7 + _f.ay;
      x[i] += vx + ax * dt2;
      y[i] += vy + ay * dt2;
    }

    const seg = this.seg;
    for (let it = 0; it < ITER; it++) {
      // forward sweep
      for (let i = 0; i < n - 1; i++) this._solve(i, i + 1, seg);
      // backward sweep (faster convergence for a heavy tip)
      for (let i = n - 2; i >= 0; i--) this._solve(i, i + 1, seg);
      x[0] = anchorX; y[0] = anchorY;
      // terrain collision inside the loop so the rope drapes instead of tunnelling
      for (let i = 2; i < n; i++) {
        const ty = terrain.heightAt(x[i]) - NODE_R;
        if (y[i] > ty) {
          y[i] = ty;
          px[i] += (x[i] - px[i]) * 0.25; // ground friction on the previous position
        }
      }
    }

    // hook kinematics for rescue logic
    const h = n - 1;
    this.hookVX = (x[h] - px[h]) / dt;
    this.hookVY = (y[h] - py[h]) / dt;
    const ax = (this.hookVX - this._pvx) / dt;
    const ay = (this.hookVY - this._pvy) / dt;
    const a = Math.sqrt(ax * ax + ay * ay);
    this.hookAcc += (clamp(a, 0, 4000) - this.hookAcc) * Math.min(1, dt * 6);
    this._pvx = this.hookVX; this._pvy = this.hookVY;
  }

  _solve(i, j, rest) {
    const x = this.x, y = this.y;
    const dx = x[j] - x[i], dy = y[j] - y[i];
    const d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) return;
    const d = Math.sqrt(d2);
    const w0 = this.invm[i], w1 = this.invm[j];
    const ws = w0 + w1;
    if (ws === 0) return;
    const diff = (d - rest) / d / ws;
    x[i] += dx * diff * w0; y[i] += dy * diff * w0;
    x[j] -= dx * diff * w1; y[j] -= dy * diff * w1;
  }

  /** Total chain length divided by its nominal length (1 = perfectly inextensible). */
  stretchRatio() {
    let L = 0;
    for (let i = 0; i < this.n - 1; i++) L += Math.hypot(this.x[i + 1] - this.x[i], this.y[i + 1] - this.y[i]);
    return L / (this.seg * (this.n - 1));
  }

  hookX() { return this.x[this.n - 1]; }
  hookY() { return this.y[this.n - 1]; }
}
