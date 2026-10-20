// Verlet ragdoll for a stick-figure survivor: 11 points joined by distance constraints.
// 'driven' mode pins the torso to the survivor's body so limbs flail loosely; 'free' mode (dead) simulates everything.
// Limbs can be severed (their constraint is switched off) so they fly off on their own.
import { GRAVITY } from './constants.js';

export const P = { HEAD: 0, NECK: 1, PELVIS: 2, ELB_L: 3, HAND_L: 4, ELB_R: 5, HAND_R: 6, KNEE_L: 7, FOOT_L: 8, KNEE_R: 9, FOOT_R: 10 };
const N = 11;
// [a, b, length, limbGroup] limbGroup: 0 = body, 1 = left arm, 2 = right arm, 3 = left leg, 4 = right leg, 5 = head
const BONES = [
  [P.HEAD, P.NECK, 7, 5], [P.NECK, P.PELVIS, 13, 0],
  [P.NECK, P.ELB_L, 8, 1], [P.ELB_L, P.HAND_L, 8, 1],
  [P.NECK, P.ELB_R, 8, 2], [P.ELB_R, P.HAND_R, 8, 2],
  [P.PELVIS, P.KNEE_L, 6, 3], [P.KNEE_L, P.FOOT_L, 6, 3],
  [P.PELVIS, P.KNEE_R, 6, 4], [P.KNEE_R, P.FOOT_R, 6, 4],
];
// rest pose relative to the chest, local x/y (y down): used when the ragdoll is created
const REST = [[0, -13], [0, -6], [0, 7], [-5, -3], [-8, 4], [5, -3], [8, 4], [-3, 13], [-4, 19], [3, 13], [4, 19]];
const SPRING = [[P.HEAD, P.PELVIS, 20, 0.06], [P.HAND_L, P.HAND_R, 16, 0.0]];

export class Ragdoll {
  constructor() {
    this.x = new Float32Array(N); this.y = new Float32Array(N);
    this.px = new Float32Array(N); this.py = new Float32Array(N);
    this.on = new Uint8Array(BONES.length).fill(1);
    this.severed = 0;
    this.rest = 0;          // seconds spent nearly motionless
    this.t = 0;
  }

  /** Create the pose around chest (cx, cy) rotated by angle, moving at (vx, vy). */
  init(cx, cy, angle, vx, vy, dt = 1 / 60) {
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let i = 0; i < N; i++) {
      const lx = REST[i][0], ly = REST[i][1];
      this.x[i] = cx + lx * c - ly * s; this.y[i] = cy + lx * s + ly * c;
      this.px[i] = this.x[i] - vx * dt; this.py[i] = this.y[i] - vy * dt;
    }
    this.on.fill(1); this.severed = 0; this.rest = 0; this.t = 0;
  }

  /** Cut off a limb group (1..4) or the head (5). Returns true if something was cut. */
  sever(group) {
    let cut = false;
    for (let b = 0; b < BONES.length; b++) if (BONES[b][3] === group && this.on[b]) { this.on[b] = 0; cut = true; }
    if (cut) this.severed |= 1 << group;
    return cut;
  }

  /** impulse every point (blast / blade hit) */
  kick(ix, iy, spread = 0.4) {
    for (let i = 0; i < N; i++) {
      const k = 1 + (Math.random() - 0.5) * spread * 2;
      this.px[i] -= ix * k / 60; this.py[i] -= iy * k / 60;
    }
  }

  /**
   * driven = { cx, cy, angle } pins neck+pelvis to the body; null = free (dead).
   * world supplies wind, tornado and terrain.
   */
  step(dt, world, driven, flail = 0) {
    this.t += dt;
    const { wind, tornado, terrain } = world;
    const dt2 = dt * dt;
    let ax = 0, ay = GRAVITY;
    const mx = this.x[P.PELVIS], my = this.y[P.PELVIS];
    const w = _w; wind.sample(mx, my, w);
    ax += w.x * 0.9; ay += w.y * 0.9;
    tornado.forceAt(mx, my, _f, 1.6); ax += _f.ax; ay += _f.ay;
    const drag = 0.992;
    for (let i = 0; i < N; i++) {
      let vx = (this.x[i] - this.px[i]) * drag, vy = (this.y[i] - this.py[i]) * drag;
      const sp2 = vx * vx + vy * vy;
      if (sp2 > 100) { const k = 10 / Math.sqrt(sp2); vx *= k; vy *= k; }      // <= 600 u/s
      this.px[i] = this.x[i]; this.py[i] = this.y[i];
      let fx = ax, fy = ay;
      if (flail && (i === P.HAND_L || i === P.HAND_R || i === P.FOOT_L || i === P.FOOT_R)) {
        fx += Math.sin(this.t * 17 + i * 2.3) * flail; fy += Math.cos(this.t * 15 + i * 1.7) * flail;
      }
      this.x[i] += vx + fx * dt2; this.y[i] += vy + fy * dt2;
    }
    for (let it = 0; it < 6; it++) {
      if (driven) {
        const c = Math.cos(driven.angle), s = Math.sin(driven.angle);
        this._pin(P.NECK, driven.cx - (-6) * s, driven.cy + (-6) * c, dt);
        this._pin(P.PELVIS, driven.cx - 7 * s, driven.cy + 7 * c, dt);
      }
      for (let b = 0; b < BONES.length; b++) if (this.on[b]) this._bone(BONES[b][0], BONES[b][1], BONES[b][2], 0.5);
      if (this.on[0]) this._bone(P.HEAD, P.PELVIS, 20, 0.5, true);     // keep the head from folding through the torso
      for (let i = 0; i < N; i++) {
        const ty = terrain.heightAt(this.x[i]);
        if (this.y[i] > ty - 1) {
          this.y[i] = ty - 1;
          this.px[i] += (this.x[i] - this.px[i]) * 0.35;                  // ground friction
          if (this.py[i] < this.y[i] - 3) this.py[i] = this.y[i] + (this.y[i] - this.py[i]) * -0.15;   // little bounce
        }
      }
    }
    // rest detector
    let sp = 0;
    for (let i = 0; i < N; i++) sp += Math.abs(this.x[i] - this.px[i]) + Math.abs(this.y[i] - this.py[i]);
    this.rest = sp < 0.9 ? this.rest + dt : 0;
  }

  _pin(i, tx, ty, dt) {
    // move the point most of the way to the pinned target; keep velocity so limbs whip
    this.x[i] += (tx - this.x[i]) * 0.9; this.y[i] += (ty - this.y[i]) * 0.9;
    this.px[i] += (tx - this.px[i]) * 0.0;
  }

  _bone(a, b, len, stiff, onlyIfCompressed) {
    const dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a];
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-4;
    if (onlyIfCompressed && d >= len) return;
    const diff = (d - len) / d * stiff;
    this.x[a] += dx * diff; this.y[a] += dy * diff;
    this.x[b] -= dx * diff; this.y[b] -= dy * diff;
  }

  /** Iterate over drawable bones: cb(x0, y0, x1, y1, group). */
  eachBone(cb) {
    for (let b = 0; b < BONES.length; b++) {
      if (!this.on[b] || BONES[b][3] === 5) continue;
      const a = BONES[b][0], c = BONES[b][1];
      cb(this.x[a], this.y[a], this.x[c], this.y[c], BONES[b][3]);
    }
  }
  /**
   * Every body segment as a free piece (used when a body is shredded): cb(mx, my, angle, len, kind, vx, vy)
   * kind: 0 = limb bone, 1 = torso, 2 = head, 3 = neck stub.
   */
  eachPiece(cb) {
    for (let b = 0; b < BONES.length; b++) {
      const a = BONES[b][0], c = BONES[b][1], g = BONES[b][3];
      const mx = (this.x[a] + this.x[c]) / 2, my = (this.y[a] + this.y[c]) / 2;
      const vx = ((this.x[a] - this.px[a]) + (this.x[c] - this.px[c])) * 30, vy = ((this.y[a] - this.py[a]) + (this.y[c] - this.py[c])) * 30;
      cb(mx, my, Math.atan2(this.y[c] - this.y[a], this.x[c] - this.x[a]), BONES[b][2], g === 0 ? 1 : (g === 5 ? 3 : 0), vx, vy);
    }
    cb(this.x[P.HEAD], this.y[P.HEAD], 0, 4.6, 2, (this.x[P.HEAD] - this.px[P.HEAD]) * 60, (this.y[P.HEAD] - this.py[P.HEAD]) * 60);
  }
  get headX() { return this.x[P.HEAD]; }
  get headY() { return this.y[P.HEAD]; }
  get pelvisX() { return this.x[P.PELVIS]; }
  get pelvisY() { return this.y[P.PELVIS]; }
}
const _w = { x: 0, y: 0 };
const _f = { ax: 0, ay: 0, f: 0 };
