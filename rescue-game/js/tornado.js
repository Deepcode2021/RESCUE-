// Growing tornado: a distance-dependent force field (inward + tangential + lift) and animation state.
import { WORLD_W } from './constants.js';
import { clamp, smoothstep } from './utils.js';

const COLUMN_H = 950;

export class Tornado {
  constructor() { this.reset(0); }

  /** tc = { at, maxR, grow, x } from the mission config; level only seeds the drift phase. */
  reset(tc = { at: 16, maxR: 210, grow: 75, x: WORLD_W - 420 }, level = 0) {
    this.level = level;
    this.appearT = tc.at;                           // when it becomes visible
    this.warnT = tc.at - 6;                         // warning cue
    this.maxR = tc.maxR;
    this.growTime = tc.grow;
    this.x = tc.x;
    this.baseY = 1200;
    this.radius = 0;
    this.visibility = 0;   // 0..1 fade-in of the drawing
    this.ramp = 0;         // 0..1 force multiplier
    this.angle = 0;
    this.active = false;
    this.warned = false;
    this.warning = false;
    this.height = COLUMN_H;
    this.cy = 0;
    this.time = 0;
  }

  update(dt, t, terrain) {
    this.time = t;
    this.warning = t >= this.warnT && t < this.appearT + 4;
    this.baseY = terrain.heightAt(this.x) + 10;
    this.cy = this.baseY - this.height * 0.4;
    if (t < this.appearT) { this.active = false; this.ramp = 0; this.visibility = 0; this.radius = 0; return; }
    this.active = true;
    const age = t - this.appearT;
    this.radius = 38 + (this.maxR - 38) * smoothstep(0, this.growTime, age);
    this.visibility = clamp(age / 4, 0, 1);
    this.ramp = 0.12 + 0.88 * smoothstep(2, 34, age); // warning period: weak at first
    this.angle += dt * (3.2 + this.radius * 0.006);
    // slow wandering drift, bounded so it never fully walls off the course
    this.x += (-7 + 14 * Math.sin(t * 0.07 + this.level)) * dt;
    this.x = clamp(this.x, 1500, WORLD_W - 260);
    this.baseY = terrain.heightAt(this.x) + 10;
    this.cy = this.baseY - this.height * 0.4;
  }

  /** Normalised elliptical distance helper; returns raw distance in world units. */
  distance(x, y) {
    const dx = x - this.x;
    const dy = (y - this.cy) * 0.4;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Writes acceleration (u/s^2) into out.ax/out.ay for a body of the given susceptibility.
   * Smooth falloff: strongest at the core, zero beyond 3.2 radii.
   * Components: inward pull, counter-clockwise tangential swirl, and lift near the funnel axis.
   */
  forceAt(x, y, out, scale) {
    out.ax = 0; out.ay = 0; out.f = 0;
    if (!this.active) return out;
    const dx = x - this.x;
    const dyRaw = y - this.cy;
    const dy = dyRaw * 0.4;                       // tall elliptical influence zone
    const r = Math.sqrt(dx * dx + dy * dy) + 1e-3;
    const rInf = this.radius * 3.2;
    if (r >= rInf) return out;
    const k = 1 - r / rInf;
    const f = k * k;
    out.f = f;
    const s = f * this.ramp * scale;
    const nx = dx / r, ny = dy / r;
    const rawR = Math.sqrt(dx * dx + dyRaw * dyRaw) + 1e-3;
    const tx = dyRaw / rawR, ty = -dx / rawR;     // counter-clockwise tangent (screen space)
    const aIn = 330, aTan = 470, aUp = 1500;
    const lift = (1 - smoothstep(0, this.radius * 2.2, Math.abs(dx)))
      * (y < this.baseY + 60 && y > this.baseY - this.height - 120 ? 1 : 0.2);
    out.ax = (-nx * aIn + tx * aTan) * s;
    out.ay = (-ny * aIn * 0.5 + ty * aTan) * s - aUp * lift * s;
    return out;
  }
}
