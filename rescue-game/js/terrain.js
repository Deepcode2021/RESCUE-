// Procedural mountain / sea-stack terrain stored as a heightfield polyline (one vertex every DX units).
// Ocean missions add a dynamic water level (tide): heightAt() returns the water surface wherever rock is below it.
import { WORLD_W } from './constants.js';
import { mulberry32, hash2, lerp, smoothstep } from './utils.js';

export const DX = 30;

export class Terrain {
  constructor() {
    this.n = Math.floor(WORLD_W / DX) + 1;
    this.ys = new Float32Array(this.n);
    this.ledges = [];   // {x, y, hw} narrow pinnacles where survivors wait
    this.peaks = [];
    this.pad = { x0: 140, x1: 520, y: 1160, cx: 330 };
    this.seed = 1;
    this.baseY = 1200;
    this.hasWater = false;
    this.waterBase = 1200;
    this.waterY = 1e9;      // current water surface (y grows downward; rising tide lowers this number)
    this.tideRate = 0; this.tideMax = 0;
    this.buildings = [];    // rooftop blocks (city missions only): {i0, i1, top, kind, seed, pad}
    this.version = 0;       // bumps on every generate() so the renderer knows to re-bake art
  }

  /**
   * Build the terrain from a mission terrain config `tc` (see missions.js). Deterministic for a given seed.
   * @returns {number} survivor count for this layout
   */
  generate(tc, seed, tide) {
    this.seed = seed;
    const rnd = mulberry32(seed * 7919 + 13);
    const { n, ys, pad } = this;
    const base = this.baseY = tc.base;
    pad.y = tc.padY;
    this.hasWater = !!tc.water;
    this.waterBase = base;
    this.tideRate = tide ? tide.rate : 0;
    this.tideMax = tide ? tide.max : 0;
    this.waterY = this.hasWater ? base : 1e9;
    this.version++;
    this.buildings = [];
    if (tc.city) return this._generateCity(tc, rnd);

    let peaks, survivorPeaks;
    if (tc.peaks) {
      peaks = tc.peaks.map((p) => ({ x: p.x, h: p.h, w: p.w }));
      survivorPeaks = tc.survivorPeaks;
    } else {
      const r = tc.random;
      peaks = [];
      const count = r.count, span = 2500;
      for (let i = 0; i < count; i++) {
        peaks.push({
          x: 900 + (i * span) / (count - 1) + (rnd() - 0.5) * 240,
          h: r.hMin + rnd() * (r.hMax - r.hMin),
          w: r.wMin + rnd() * (r.wMax - r.wMin),
        });
      }
      peaks.push({ x: 660 + rnd() * 80, h: 150 + rnd() * 80, w: 150 });
      peaks.push({ x: 2000 + rnd() * 300, h: 170 + rnd() * 100, w: 190 });
      const idx = [];
      for (let i = 0; i < count; i++) idx.push(i);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      }
      survivorPeaks = idx.slice(0, r.survivors);
    }
    this.peaks = peaks;

    const amp = tc.jitter;
    const phase = rnd() * 6;
    const flatJit = this.hasWater ? 0 : 0.4;       // open water stays perfectly flat
    for (let i = 0; i < n; i++) {
      const x = i * DX;
      let hgt = 0;
      for (let p = 0; p < peaks.length; p++) {
        const pk = peaks[p];
        const d = Math.abs(x - pk.x) / pk.w;
        if (d < 1) {
          const v = pk.h * (1 - d) * (1 + 0.07 * Math.sin(x * 0.05 + phase));
          if (v > hgt) hgt = v;
        }
      }
      const jitter = (hash2(i, seed) - 0.5) * 2 * amp * (hgt > 0 ? 1 : flatJit);
      ys[i] = base - hgt + jitter;
    }

    // Safe base: flat pad (deck) with smooth shoulders
    for (let i = 0; i < n; i++) {
      const x = i * DX;
      const dist = x < pad.x0 ? pad.x0 - x : (x > pad.x1 ? x - pad.x1 : 0);
      const blend = 1 - smoothstep(0, 130, dist);
      ys[i] = lerp(ys[i], pad.y, blend);
    }

    // Narrow pinnacle ledges
    this.ledges.length = 0;
    const flat2 = tc.ledgeVerts === 2;
    for (let k = 0; k < survivorPeaks.length; k++) {
      const pk = peaks[survivorPeaks[k]];
      const iL = Math.round(pk.x / DX);
      const ly = tc.exactLedges ? base - pk.h : ys[iL];
      const a = flat2 ? iL : iL - 1, b = iL + 1;
      for (let i = a; i <= b; i++) ys[i] = ly;
      for (let s = 1; s <= 2; s++) {
        ys[a - s] = Math.max(ys[a - s], ly + 24 * (s + 1));
        ys[b + s] = Math.max(ys[b + s], ly + 24 * (s + 1));
      }
      this.ledges.push({ x: flat2 ? (iL + 0.5) * DX : iL * DX, y: ly, hw: flat2 ? DX * 0.5 : DX });
    }
    this.ledges.sort((p, q) => p.x - q.x);
    return this.ledges.length;
  }

  /**
   * City layout: flat rooftops separated by street-level gaps, joined by one-cell steep walls (the heightfield still rules).
   * Survivors wait on the middles of wide, tall-enough roofs; the SAFE ZONE is a flat roof at the far left.
   */
  _generateCity(tc, rnd) {
    const { n, ys, pad } = this;
    const c = tc.city, base = tc.base;
    ys.fill(base);
    const a = 3, b = Math.round(pad.x1 / DX) + 1;
    pad.y = base - c.padH;
    for (let i = a; i <= b; i++) ys[i] = pad.y;
    this.buildings.push({ i0: a, i1: b, top: pad.y, kind: c.kinds[0], seed: 1, pad: true });
    let i = b + 1;
    for (let guard = 0; guard < 80; guard++) {
      const gap = c.gapMin + Math.floor(rnd() * (c.gapMax - c.gapMin + 1));
      const w = c.wMin + Math.floor(rnd() * (c.wMax - c.wMin + 1));
      const i0 = i + gap, i1 = i0 + w - 1;
      if (i1 > n - 3) break;
      const top = base - (c.hMin + rnd() * (c.hMax - c.hMin));
      for (let k = i0; k <= i1; k++) ys[k] = top;
      this.buildings.push({ i0, i1, top, kind: c.kinds[Math.floor(rnd() * c.kinds.length)], seed: 2 + this.buildings.length, pad: false });
      i = i1 + 1;
    }
    const cand = this.buildings.filter((bd) => !bd.pad && (bd.i1 - bd.i0) * DX >= 120 && base - bd.top >= c.minSurvH);
    const count = Math.min(c.survivors, cand.length);
    this.ledges.length = 0;
    for (let k = 0; k < count; k++) {
      const bd = cand[Math.min(cand.length - 1, Math.floor((k + 0.5) * cand.length / count))];
      bd.survivor = true;
      this.ledges.push({ x: ((bd.i0 + bd.i1) / 2) * DX, y: bd.top, hw: ((bd.i1 - bd.i0) / 2) * DX });
    }
    this.ledges.sort((p, q) => p.x - q.x);
    this.peaks = [];
    return this.ledges.length;
  }

  /** Advance the tide. Call once per simulation step with mission time. */
  update(t) {
    if (this.hasWater) this.waterY = this.waterBase - Math.min(this.tideMax, this.tideRate * t);
  }

  rawY(x) {
    if (x <= 0) return this.ys[0];
    if (x >= WORLD_W - 0.001) return this.ys[this.n - 1];
    const f = x / DX;
    const i = f | 0;
    return this.ys[i] + (this.ys[i + 1] - this.ys[i]) * (f - i);
  }

  heightAt(x) {
    const y = this.rawY(x);
    return this.hasWater && y > this.waterY ? this.waterY : y;
  }

  isWaterAt(x) { return this.hasWater && this.rawY(x) >= this.waterY - 0.01; }

  slopeAt(x) {
    const xc = x < 0 ? 0 : (x > WORLD_W - 0.001 ? WORLD_W - 0.001 : x);
    const i = (xc / DX) | 0;
    let y0 = this.ys[i], y1 = this.ys[i + 1];
    if (this.hasWater) { if (y0 > this.waterY) y0 = this.waterY; if (y1 > this.waterY) y1 = this.waterY; }
    return (y1 - y0) / DX;
  }

  /** Outward (upward) unit normal written into out. */
  normalAt(x, out) {
    const s = this.slopeAt(x);
    const len = Math.sqrt(1 + s * s);
    out.x = s / len;
    out.y = -1 / len;
    return out;
  }

  inPad(x) { return x >= this.pad.x0 && x <= this.pad.x1; }
}
