// All Canvas 2D drawing. Hand-drawn look = stable per-vertex wobble (hash-based, never re-randomised per frame)
// plus a faint offset duplicate stroke ("chalk"). World coordinates are drawn through a camera transform.
import { WORLD_W, WORLD_H } from './constants.js';
import { DX } from './terrain.js';
import { hashS, hash2, clamp, TAU, mulberry32 } from './utils.js';
import { S, GRAB_R, GRAB_SPEED } from './survivors.js';
import { HOOK_OFFSET } from './helicopter.js';
import { HeliSprites, PU, COLORS } from './sprites.js';
import { bakeBuilding, bakeScenery, S as PXS } from './cityart.js';
import * as fx from './themefx.js';

const WHITE = '#f2efe6';
const FONT = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS","Marker Felt",cursive';
const CHEST = 16;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cssW = 800; this.cssH = 600; this.dpr = 1;
    this.viewW = 900; this.viewH = 900; this.k = 1; this.u = 1;
    this.cam = { x: 0, y: 0 };
    this.left = 0; this.top = 0;
    // wind streaks (screen-space, recycled)
    this.sx = new Float32Array(16); this.sy = new Float32Array(16); this.sl = new Float32Array(16);
    for (let i = 0; i < 16; i++) { this.sx[i] = Math.random(); this.sy[i] = Math.random(); this.sl[i] = 0.08 + Math.random() * 0.14; }
    this.vignette = null;
    this.sprites = new HeliSprites();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(200, r.width); this.cssH = Math.max(200, r.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    const aspect = this.cssW / this.cssH;
    let vh = 900, vw = vh * aspect;
    if (vw < 700) { vw = 700; vh = vw / aspect; }   // portrait: keep proportions, show more vertically
    this.viewW = vw; this.viewH = vh;
    this.k = this.canvas.width / vw;                // device px per world unit (uniform: no stretching)
    this.u = dpr / this.k;                          // world units per CSS pixel
    // cached vignette
    const v = document.createElement('canvas');
    v.width = 256; v.height = Math.max(64, Math.round(256 / aspect));
    const vc = v.getContext('2d');
    const g = vc.createRadialGradient(v.width / 2, v.height / 2, v.height * 0.3, v.width / 2, v.height / 2, v.width * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    vc.fillStyle = g; vc.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  }

  snapCamera(world) {
    this.cam.x = world.heli.x; this.cam.y = world.heli.y + this.viewH * 0.08;
    this._clampCam();
  }

  _clampCam() {
    const maxL = Math.max(0, WORLD_W - this.viewW);
    this.left = clamp(this.cam.x - this.viewW / 2, 0, maxL);
    let top = this.cam.y - this.viewH / 2;
    const minT = -330, maxT = WORLD_H + 20 - this.viewH;
    top = maxT < minT ? (minT + maxT) / 2 : clamp(top, minT, maxT);
    this.top = top;
  }

  updateCamera(world, dt) {
    const h = world.heli;
    const tx = h.x + clamp(h.vx * 0.45, -220, 220);
    const ty = h.y + this.viewH * 0.1 + clamp(h.vy * 0.18, -90, 90);
    const a = 1 - Math.exp(-3.5 * dt);
    this.cam.x += (tx - this.cam.x) * a;
    this.cam.y += (ty - this.cam.y) * a;
    this._clampCam();
  }

  // ------------------------------------------------------------------ frame
  render(game) {
    const { world, rain, state } = game;
    const tm = this.tm = state === 'TITLE' ? game.titleT : world.time;   // animation clock (waves, flags)
    const ctx = this.ctx, k = this.k, u = this.u;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#030303';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const sh = world.shake * 16;
    const ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;
    const L = this.left + ox, T = this.top + oy;
    const R = L + this.viewW, B = T + this.viewH;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // parallax scenery: real-place skylines / mountain ranges, baked once per mission
    this._ensureArt(world);
    const th = world.theme, I = world.intensity || 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    fx.drawSky(ctx, this.cssW, this.cssH, th, tm);
    this.drawScenery(ctx, L, T, th, tm, I);

    // world
    ctx.setTransform(k, 0, 0, k, -L * k, -T * k);
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE;
    this.drawTornado(ctx, world, L, R, u);
    this.drawDebris(ctx, world, L, R, u);
    if (world.terrain.buildings.length) this.drawCity(ctx, world.terrain, L, R, B + 40, u);
    else this.drawTerrain(ctx, world.terrain, L, R, B + 40, u);
    if (world.terrain.hasWater) this.drawWater(ctx, world.terrain, L, R, B + 40, u, tm);
    this.drawPad(ctx, world, u);
    if (state === 'PLAYING') this.drawGuides(ctx, world, game.coachMark, u, tm);
    this.drawRings(ctx, world, u);
    if (th.fx.includes('neon') && world.terrain.buildings.length) fx.drawRoofNeon(ctx, world.terrain, L, R, tm, DX);
    for (let i = 0; i < world.survivors.length; i++) this.drawSurvivor(ctx, world.survivors[i], u);
    this.drawRope(ctx, world.rope, u);
    this.drawHeli(ctx, world.heli, u, world);
    this.drawPuffs(ctx, world.puffs, L, R);
    this.drawSparks(ctx, world, u);
    this.drawPopups(ctx, world, u);

    // colour grade: multiply the scene by the place's tint, then paint gore on top so blood stays red
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = th.tint; ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(k, 0, 0, k, -L * k, -T * k);
    this.drawGibs(ctx, world.gibs, L, R, u);
    this.drawBlood(ctx, world.blood, L, R);

    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (world.cfg.dark > 0 && state !== 'TITLE') this.drawNight(ctx, world, L, T, R, tm);
    const W = this.cssW, H = this.cssH, F = th.fx;
    if (F.includes('fog')) fx.drawFog(ctx, W, H, th, tm, I);
    if (F.includes('haze')) fx.drawHaze(ctx, W, H, tm);
    if (F.includes('glints')) fx.drawGlints(ctx, W, H, tm);
    if (F.includes('birds')) fx.drawBirds(ctx, W, H, tm);
    if (F.includes('sheets')) fx.drawSheets(ctx, W, H, tm, I);
    if (F.includes('sirens')) fx.drawSirens(ctx, W, H, tm);
    this.drawRain(ctx, rain);
    this.drawStreaks(ctx, world);
    if (world.flash > 0) this.drawLightning(ctx, world);
    if (state !== 'TITLE') {
      this.drawIndicators(ctx, world, L, T);
      this.drawBubbles(ctx, world, L, T);
    }
    ctx.globalAlpha = 1;
    if (world.redFlash > 0) { ctx.globalAlpha = world.redFlash * 0.45; ctx.fillStyle = '#a3141a'; ctx.fillRect(0, 0, this.cssW, this.cssH); ctx.globalAlpha = 1; }
    ctx.drawImage(this.vignette, 0, 0, this.cssW, this.cssH);
  }

  // ------------------------------------------------------------------ helpers
  twice(ctx, u, fn) {
    fn();
    ctx.save();
    ctx.translate(0.9 * u, -0.7 * u);
    ctx.globalAlpha *= 0.38;
    ctx.lineWidth *= 0.7;
    fn();
    ctx.restore();
  }

  _ensureArt(world) {
    const t = world.terrain, key = world.cfg.id + ':' + t.version;
    if (this._artKey === key) return;
    this._artKey = key;
    this.layers = bakeScenery(world.cfg.theme, t.baseY, WORLD_W, world.cfg.seed);
    this.bcache = new Array(t.buildings.length).fill(null);
  }

  drawScenery(ctx, L, T, th, tm, I) {
    const k = this.k, T0 = 450;
    ctx.imageSmoothingEnabled = false;
    for (const ly of this.layers) {
      const qy = Math.min(0.85, ly.par * 1.6);
      ctx.setTransform(k, 0, 0, k, -(L * ly.par) * k, -(T * qy + T0 * (1 - qy)) * k);
      ctx.drawImage(ly.canvas, 0, ly.bottom - ly.hpx * PXS, ly.canvas.width * PXS, ly.canvas.height * PXS);
      if (ly.marks && ly.marks.length) fx.drawMarks(ctx, ly, th, tm, PXS, ly.bottom - ly.hpx * PXS, I);
    }
  }

  /** Rooftop city: pre-baked pixel buildings, one canvas each, blitted without smoothing so pixels stay crisp. */
  drawCity(ctx, t, L, R, bottom, u) {
    ctx.fillStyle = '#040404';
    ctx.fillRect(L - 10, t.baseY, R - L + 20, bottom - t.baseY + 60);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < t.buildings.length; i++) {
      const b = t.buildings[i];
      if ((b.i1 + 1) * DX < L - 40 || (b.i0 - 1) * DX > R + 40) continue;
      let c = this.bcache[i];
      if (!c) c = this.bcache[i] = bakeBuilding({ x0: b.i0 * DX, x1: b.i1 * DX, top: b.top, kind: b.kind, seed: b.seed }, t.baseY, WORLD_H + 80, DX);
      ctx.drawImage(c.canvas, c.xL, c.yT, c.w * PXS, c.h * PXS);
    }
    if (!t.hasWater) {                                      // street level: dashed kerb line
      ctx.strokeStyle = WHITE; ctx.globalAlpha = 0.5; ctx.lineWidth = 2 * u; ctx.setLineDash([10 * u, 8 * u]);
      ctx.beginPath(); ctx.moveTo(L - 10, t.baseY + 2); ctx.lineTo(R + 10, t.baseY + 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }

  drawFarRidge(ctx, l, r, bottom, u) {
    ctx.strokeStyle = WHITE; ctx.globalAlpha = 0.13; ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    const step = 70;
    for (let x = Math.floor(l / step) * step - step; x < r + step; x += step) {
      const i = Math.round(x / step);
      const y = 880 - 260 * hash2(i, 77) - 120 * Math.sin(i * 0.37);
      if (x === Math.floor(l / step) * step - step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawTerrain(ctx, t, L, R, bottom, u) {
    const i0 = Math.max(0, Math.floor(L / DX) - 1), i1 = Math.min(t.n - 1, Math.ceil(R / DX) + 1);
    const wy = t.hasWater ? t.waterY : 1e9;
    const isW = (i) => t.ys[i] >= wy;                                  // vertex is under (or at) the sea
    const px = (i) => i * DX + (isW(i) ? 0 : hashS(i, 3) * 2.2);
    const py = (i) => (isW(i) ? wy : t.ys[i] + hashS(i, 4) * 2.2);
    // solid fill hides everything behind terrain
    ctx.beginPath();
    ctx.moveTo(px(i0), bottom);
    for (let i = i0; i <= i1; i++) ctx.lineTo(px(i), py(i));
    ctx.lineTo(px(i1), bottom); ctx.closePath();
    ctx.fillStyle = '#060606'; ctx.fill();
    // ridge outline + chalk duplicate (open water segments are drawn by drawWater instead)
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.6 * u;
    this.twice(ctx, u, () => {
      ctx.beginPath();
      let pen = false;
      for (let i = i0; i <= i1; i++) {
        const open = i < i1 && isW(i) && isW(i + 1);
        if (!pen) { if (!open) { ctx.moveTo(px(i), py(i)); pen = true; } }
        else { ctx.lineTo(px(i), py(i)); if (open) pen = false; }
      }
      ctx.stroke();
    });
    // hatching strokes below the ridge
    ctx.globalAlpha = 0.4; ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      if (isW(i) || hash2(i, 5) < 0.45) continue;
      const x = px(i), y = py(i) + 10;
      ctx.moveTo(x, y); ctx.lineTo(x - 11, y + 22 + hash2(i, 6) * 26);
    }
    ctx.stroke();
    // faint dotted terrain indicator
    ctx.globalAlpha = 0.3; ctx.setLineDash([2 * u, 9 * u]); ctx.lineWidth = 2 * u;
    ctx.beginPath();
    let pen2 = false;
    for (let i = i0; i <= i1; i++) {
      if (isW(i)) { pen2 = false; continue; }
      if (!pen2) { ctx.moveTo(px(i), py(i) + 26); pen2 = true; } else ctx.lineTo(px(i), py(i) + 26);
    }
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  /** Animated sea surface: two chalk wave lines, scrolling foam dashes, faint tint below the surface. */
  drawWater(ctx, t, L, R, bottom, u, time) {
    const wy = t.waterY;
    const wave = (x, ph) => Math.sin(x * 0.021 + time * 1.7 + ph) * 4.5 + Math.sin(x * 0.047 - time * 2.4 + ph * 2) * 2.4;
    const x0 = Math.floor(L / 24) * 24 - 24;
    ctx.save();
    ctx.beginPath();
    for (let x = x0; x <= R + 24; x += 24) { const y = wy + wave(x, 0); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.lineTo(R + 24, bottom); ctx.lineTo(x0, bottom); ctx.closePath();
    ctx.fillStyle = 'rgba(242,239,230,0.05)'; ctx.fill();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.2 * u;
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = pass ? 0.35 : 0.9; ctx.lineWidth = (pass ? 1.4 : 2.2) * u;
      ctx.beginPath();
      for (let x = x0; x <= R + 24; x += 24) { const y = wy + wave(x, pass ? 1.3 : 0) + (pass ? 7 : 0); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22; ctx.lineWidth = 1.5 * u;
    for (let k = 0; k < 3; k++) {
      ctx.setLineDash([16 * u, 30 * u]); ctx.lineDashOffset = -(time * (24 + k * 9)) * (k % 2 ? -1 : 1);
      ctx.beginPath(); const y = wy + 22 + k * 24; ctx.moveTo(L - 40, y); ctx.lineTo(R + 40, y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
  }

  drawPad(ctx, world, u) {
    const p = world.terrain.pad, t = this.tm;
    ctx.save();
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE;
    ctx.lineWidth = 3 * u;
    ctx.beginPath(); ctx.moveTo(p.x0, p.y - 3); ctx.lineTo(p.x1, p.y - 3); ctx.stroke();
    ctx.setLineDash([14 * u, 10 * u]); ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.moveTo(p.x0, p.y - 10); ctx.lineTo(p.x1, p.y - 10); ctx.stroke();
    ctx.setLineDash([]);
    // posts + flags
    for (const x of [p.x0, p.x1]) {
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.moveTo(x, p.y - 3); ctx.lineTo(x, p.y - 90); ctx.stroke();
      const fl = Math.sin(t * 5 + x) * 4;
      ctx.beginPath(); ctx.moveTo(x, p.y - 90); ctx.lineTo(x + (x === p.x0 ? 30 : -30), p.y - 80 + fl); ctx.lineTo(x, p.y - 70); ctx.stroke();
    }
    // flat helipad ring with H
    ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.ellipse(p.cx, p.y - 2, 62, 11, 0, 0, TAU); ctx.stroke();
    ctx.font = `bold ${22}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(p.cx, p.y - 2); ctx.scale(1, 0.34); ctx.fillText('H', 0, 0); ctx.restore();
    ctx.font = `bold 18px ${FONT}`;
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 3);
    ctx.fillText('SAFE ZONE', p.cx, p.y - 112);
    ctx.beginPath(); ctx.moveTo(p.cx, p.y - 98); ctx.lineTo(p.cx - 8, p.y - 110 + 22 - 6); ctx.moveTo(p.cx, p.y - 98); ctx.lineTo(p.cx + 8, p.y - 88); ctx.stroke();
    if (world.terrain.hasWater && !world.terrain.buildings.length) this.drawShip(ctx, world, u, t);
    ctx.restore();
  }

  /** Rescue ship: cabin, funnel with drifting smoke and plank lines (the pad itself is the deck). */
  drawShip(ctx, world, u, t) {
    const p = world.terrain.pad;
    ctx.save(); ctx.strokeStyle = WHITE; ctx.setLineDash([]); ctx.lineWidth = 2.2 * u; ctx.globalAlpha = 0.9;
    const cx0 = p.x0 + 28;
    ctx.beginPath(); ctx.rect(cx0, p.y - 58, 70, 55); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx0 + 16 + i * 19, p.y - 36, 5, 0, TAU); ctx.stroke(); }
    const fx = p.x1 - 80;
    ctx.beginPath(); ctx.moveTo(fx, p.y - 3); ctx.lineTo(fx + 4, p.y - 75); ctx.lineTo(fx + 34, p.y - 75); ctx.lineTo(fx + 38, p.y - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + 2, p.y - 62); ctx.lineTo(fx + 36, p.y - 62); ctx.stroke();
    const dir = world.wind.x >= 0 ? 1 : -1;
    for (let k = 0; k < 7; k++) {
      ctx.globalAlpha = 0.5 - k * 0.065;
      const x = fx + 19 + dir * k * 11 + Math.sin(t * 3 + k) * 4, y = p.y - 82 - k * 13;
      ctx.beginPath(); ctx.arc(x, y, 4 + k * 1.6, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 0.45;
    for (const off of [16, 34]) { ctx.beginPath(); ctx.moveTo(p.x0 - 70, p.y + off); ctx.lineTo(p.x1 + 70, p.y + off); ctx.stroke(); }
    ctx.restore();
  }

  /** Blackout: searchlight around the helicopter, pulsing flare beacons on survivors and the deck, dim tornado glow. */
  drawNight(ctx, w, L, T, R, tm) {
    const cfg = w.cfg, k = this.k;
    const d = cfg.dark * (1 - Math.min(1, w.flash * 1.1) * 0.85);   // lightning briefly lights the world
    const [hx, hy] = this.toScreen(w.heli.x, w.heli.y + 70, L, T);
    const r = Math.min(this.cssW, this.cssH) * 0.5 * cfg.light + 70;
    const g = ctx.createRadialGradient(hx, hy, r * 0.1, hx, hy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${(d * 0.3).toFixed(3)})`); g.addColorStop(1, `rgba(0,0,0,${d.toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.cssW, this.cssH);
    // the tornado glows faintly through the dark so you can still dodge it
    ctx.save(); ctx.setTransform(k, 0, 0, k, -L * k, -T * k);
    this.drawTornado(ctx, w, L, R, this.u, 0.5);
    ctx.restore();
    // flares
    ctx.save(); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.8;
    const ring = (x, y, phase, size) => {
      const [sx, sy] = this.toScreen(x, y, L, T);
      if (sx < -20 || sx > this.cssW + 20 || sy < -20 || sy > this.cssH + 20) return;
      ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tm * 5 + phase));
      ctx.beginPath(); ctx.arc(sx, sy, size, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy - size - 2); ctx.lineTo(sx, sy - size - 12); ctx.stroke();
    };
    for (let i = 0; i < w.survivors.length; i++) {
      const s = w.survivors[i];
      if (s.state === S.WAITING || s.state === S.FALLING || s.state === S.ATTACHED) ring(s.x, s.y - 16, s.id * 1.7, 7);
    }
    const p = w.terrain.pad;
    ring(p.x0, p.y - 94, 0, 6); ring(p.x1, p.y - 94, 3, 6); ring(p.cx, p.y - 6, 1.5, 9);
    ctx.restore();
  }

  drawTornado(ctx, w, L, R, u, dim = 1) {
    const tn = w.tornado;
    if (!tn.active) {
      if (tn.warning) {            // warning cue: pulsing dashed column where it will form
        const a = 0.25 + 0.25 * Math.sin(w.time * 8);
        if (tn.x > L - 200 && tn.x < R + 200) {
          ctx.save(); ctx.globalAlpha = a * dim; ctx.strokeStyle = WHITE; ctx.lineWidth = 2 * u;
          ctx.setLineDash([10 * u, 12 * u]);
          ctx.beginPath(); ctx.ellipse(tn.x, tn.baseY - 6, 70, 12, 0, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tn.x - 70, tn.baseY - 6); ctx.lineTo(tn.x - 100, tn.baseY - 700); ctx.moveTo(tn.x + 70, tn.baseY - 6); ctx.lineTo(tn.x + 100, tn.baseY - 700); ctx.stroke();
          ctx.restore();
        }
      }
      return;
    }
    if (tn.x + tn.radius * 2 < L || tn.x - tn.radius * 2 > R) return;
    const N = 18, H = tn.height, rr = tn.radius;
    ctx.save(); ctx.strokeStyle = WHITE; ctx.lineCap = 'round';
    for (let k = 0; k < N; k++) {
      const f = k / (N - 1);
      const y = tn.baseY - f * H;
      const rx = rr * (0.22 + 0.95 * Math.pow(f, 1.15));
      const ry = rx * 0.2;
      const cx = tn.x + Math.sin(tn.time * 1.2 + f * 3.4) * rr * 0.28 * f;
      const a0 = tn.angle * (1 + f * 0.6) + k * 1.37;
      ctx.lineWidth = (1.4 + 1.6 * f) * u;
      ctx.globalAlpha = tn.visibility * (0.3 + 0.5 * f) * dim;
      ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, a0, a0 + Math.PI * 1.15); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, y, rx * 0.96, ry * 0.9, 0, a0 + Math.PI, a0 + Math.PI * 1.9); ctx.stroke();
    }
    // funnel edge lines
    ctx.globalAlpha = tn.visibility * 0.35 * dim; ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(tn.x - rr * 0.22, tn.baseY); ctx.quadraticCurveTo(tn.x - rr * 0.6, tn.baseY - H * 0.5, tn.x - rr * 1.17, tn.baseY - H);
    ctx.moveTo(tn.x + rr * 0.22, tn.baseY); ctx.quadraticCurveTo(tn.x + rr * 0.6, tn.baseY - H * 0.5, tn.x + rr * 1.17, tn.baseY - H);
    ctx.stroke();
    ctx.restore();
  }

  drawDebris(ctx, w, L, R, u) {
    const d = w.debris;
    ctx.save(); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5 * u; ctx.globalAlpha = 0.75;
    ctx.beginPath();
    for (let i = 0; i < d.count; i++) {
      const x = d.x[i], y = d.y[i];
      if (x < L - 20 || x > R + 20) continue;
      const s = d.size[i], c = Math.cos(d.rot[i]) * s, sn = Math.sin(d.rot[i]) * s;
      if (d.shape[i] === 0) { ctx.moveTo(x - c, y - sn); ctx.lineTo(x + c, y + sn); }
      else if (d.shape[i] === 1) { ctx.moveTo(x + c, y + sn); ctx.lineTo(x - sn, y + c); ctx.lineTo(x - c, y - sn); ctx.closePath(); }
      else { ctx.moveTo(x + c - sn * 0.6, y + sn + c * 0.6); ctx.lineTo(x - c - sn * 0.6, y - sn + c * 0.6); ctx.lineTo(x - c + sn * 0.6, y - sn - c * 0.6); ctx.lineTo(x + c + sn * 0.6, y + sn - c * 0.6); ctx.closePath(); }
    }
    ctx.stroke(); ctx.restore();
  }

  // ------------------------------------------------------------------ helicopter
  drawHeli(ctx, h, u, world) {
    const view = h.face || 0;
    const spr = this.sprites.get(view);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, -34 * PU, -19 * PU, spr.width * PU, spr.height * PU);
    const crashed = h.crashed;
    const hub = this.sprites.hub(view);
    const hy = hub[1] * PU;
    // main rotor: a long blurred blade line that "breathes" with the rotation, tips drooping a little
    if (!crashed) {
      const ph = h.rotor;
      const len = 80 * (0.84 + 0.16 * Math.abs(Math.cos(ph)));
      const droop = 3 + 2 * Math.abs(Math.sin(ph * 0.5));
      ctx.strokeStyle = COLORS.CREAM; ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.2; ctx.lineWidth = 7 * u;
      ctx.beginPath(); ctx.moveTo(-86, hy + 3); ctx.lineTo(86, hy + 3); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.lineWidth = 2.6 * u;
      ctx.beginPath(); ctx.moveTo(-len, hy + droop); ctx.lineTo(0, hy); ctx.lineTo(len, hy + droop); ctx.stroke();
      if (view !== 0) {                    // tail rotor spinning
        const tx = -view * 32 * PU * 0.0 + (view > 0 ? -31 : 31) * PU, ty = -9 * PU;
        const tr = Math.sin(ph * 1.7) * 11;
        ctx.globalAlpha = 0.9; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.moveTo(tx, ty - tr); ctx.lineTo(tx, ty + tr); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = COLORS.CREAM; ctx.lineWidth = 2.4 * u; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-44, hy + 8); ctx.lineTo(-10, hy + 2); ctx.moveTo(14, hy + 3); ctx.lineTo(52, hy + 16); ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ rope
  drawRope(ctx, r, u) {
    const n = r.n, x = r.x, y = r.y;
    ctx.save();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2 * u;
    this.twice(ctx, u, () => {
      ctx.beginPath();
      ctx.moveTo(x[0], y[0]);
      for (let i = 1; i < n - 1; i++) {
        const mx = (x[i] + x[i + 1]) * 0.5, my = (y[i] + y[i + 1]) * 0.5;
        ctx.quadraticCurveTo(x[i], y[i], mx, my);
      }
      ctx.lineTo(x[n - 1], y[n - 1]);
      ctx.stroke();
    });
    // hook (J shape aligned with last segment)
    const hx = x[n - 1], hy = y[n - 1];
    const ang = Math.atan2(hy - y[n - 2], hx - x[n - 2]);
    ctx.translate(hx, hy); ctx.rotate(ang - Math.PI / 2);
    ctx.lineWidth = 2.6 * u;
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, 9); ctx.arc(6, 9, 6, Math.PI, Math.PI * 0.2, true); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ survivors
  drawBlood(ctx, bl, L, R) {
    ctx.save();
    ctx.fillStyle = '#c1272d';
    for (let i = 0; i < bl.count; i++) {
      const lf = bl.life[i];
      if (lf <= 0) continue;
      const x = bl.x[i];
      if (x < L - 10 || x > R + 10) continue;
      ctx.globalAlpha = lf < 2 ? lf / 2 : 1;
      const sz = bl.size[i];
      if (bl.stuck[i]) ctx.fillRect(Math.round(x / 1.5) * 1.5 - sz * 0.4, Math.round(bl.y[i] / 1.5) * 1.5 - sz * 0.3, sz * 1.8, sz * 0.8);
      else ctx.fillRect(Math.round(x / 1.5) * 1.5, Math.round(bl.y[i] / 1.5) * 1.5, sz, sz);
    }
    ctx.restore();
  }

  /** Expanding rings: a hook catch (small) or a delivery (big). Cosmetic only. */
  drawRings(ctx, world, u) {
    if (!world.rings.length) return;
    ctx.save(); ctx.strokeStyle = WHITE;
    for (const r of world.rings) {
      const f = r.t / 0.9, big = r.kind === 'rescue';
      ctx.globalAlpha = (1 - f) * 0.95; ctx.lineWidth = (big ? 3.4 : 2.6) * u;
      ctx.beginPath(); ctx.arc(r.x, r.y, (big ? 16 : 10) + f * (big ? 130 : 70), 0, TAU); ctx.stroke();
      if (big) { ctx.beginPath(); ctx.arc(r.x, r.y, 8 + f * 80, 0, TAU); ctx.stroke(); }
    }
    ctx.restore();
  }

  /**
   * Teaching aids drawn from the real rules: the exact grab radius around nearby survivors (turns red when the hook
   * is too fast to catch them), the drop-off box over the pad while riders are aboard, and the tutorial's pointer.
   */
  drawGuides(ctx, world, mark, u, tm) {
    if (world.ended || world.heli.crashed) return;
    const rope = world.rope, hx = rope.hookX(), hy = rope.hookY(), pad = world.terrain.pad;
    ctx.save();
    ctx.lineCap = 'round'; ctx.textAlign = 'center';
    // 1) grab range around survivors the hook is close to
    if (world.canGrab()) {
      for (let i = 0; i < world.survivors.length; i++) {
        const s = world.survivors[i];
        if (s.state !== S.WAITING && s.state !== S.FALLING) continue;
        const cy = s.y - 16, d = Math.hypot(hx - s.x, hy - cy);
        if (d > 190) continue;
        const fast = Math.hypot(rope.hookVX - s.vx, rope.hookVY - s.vy) > GRAB_SPEED;
        const col = fast ? '#ff6a5c' : WHITE, pulse = 1 + Math.sin(tm * 7) * 0.05;
        ctx.strokeStyle = col; ctx.fillStyle = col;
        ctx.globalAlpha = 0.85; ctx.lineWidth = 2.2 * u; ctx.setLineDash([6 * u, 5 * u]);
        ctx.beginPath(); ctx.arc(s.x, cy, GRAB_R * pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(hx, hy, 3.4 * u, 0, TAU); ctx.fill();
        if (fast && d < GRAB_R * 3) { ctx.font = `bold ${13 * u}px ${FONT}`; ctx.fillText('SLOW DOWN', s.x, cy - GRAB_R - 12); }
      }
    }
    // 2) drop-off box: exactly the region where riders hop off (inside the pad posts, within 70 units of the ground)
    if (world.riders.length || (mark && mark.mark === 'pad')) {
      const a = 0.55 + Math.sin(tm * 4) * 0.25;
      ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.globalAlpha = a; ctx.lineWidth = 2.6 * u; ctx.setLineDash([12 * u, 8 * u]);
      ctx.strokeRect(pad.x0 + 8, pad.y - 70, pad.x1 - pad.x0 - 16, 70); ctx.setLineDash([]);
      ctx.globalAlpha = 0.9; ctx.font = `bold ${13 * u}px ${FONT}`;
      ctx.fillText('LOWER THEM IN HERE', pad.cx, pad.y - 78);
    }
    // 3) tutorial pointer
    if (mark && mark.mark) {
      const bob = Math.sin(tm * 5) * 6, x = mark.markX, y = mark.mark === 'pad' ? pad.y - 130 : mark.markY - 118;
      ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.globalAlpha = 0.95; ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.moveTo(x, y + 22 + bob); ctx.lineTo(x - 11, y + bob); ctx.lineTo(x + 11, y + bob); ctx.closePath(); ctx.fill();
      ctx.font = `bold ${13 * u}px ${FONT}`; ctx.fillText(mark.mark === 'pad' ? 'SAFE ZONE' : 'RESCUE THIS ONE', x, y - 6 + bob);
    }
    ctx.restore();
  }

  /** Body parts from a shredded survivor: white chalk bones with a bloody end, tumbling and fading out. */
  drawGibs(ctx, g, L, R, u) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < g.count; i++) {
      const lf = g.life[i];
      if (lf <= 0) continue;
      const x = g.x[i];
      if (x < L - 30 || x > R + 30) continue;
      ctx.globalAlpha = lf < 3 ? lf / 3 : 1;
      ctx.save(); ctx.translate(x, g.y[i]); ctx.rotate(g.ang[i]);
      const k = g.kind[i], h = g.len[i] * 0.8;
      ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE;
      if (k === 2) {
        ctx.lineWidth = 3.2 * u; ctx.beginPath(); ctx.arc(0, 0, 6.2, 0, TAU); ctx.stroke();
        this._hat(ctx, 0, 0, 0, g.hat[i], u);
        ctx.fillStyle = '#c1272d'; ctx.fillRect(-4, 1, 8, 5);
      } else {
        ctx.lineWidth = (k === 1 ? 7 : 4.4) * u;
        ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
        ctx.strokeStyle = '#c1272d'; ctx.lineWidth = (k === 1 ? 7.4 : 4.8) * u;
        ctx.beginPath(); ctx.moveTo(h - 3.5, 0); ctx.lineTo(h, 0); ctx.moveTo(-h, 0); ctx.lineTo(-h + (k === 1 ? 6 : 3), 0); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  _hat(ctx, hx, hy, ang, kind, u) {
    if (!kind) return;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang); ctx.fillStyle = WHITE; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6 * u;
    if (kind === 1) { ctx.fillRect(-4, -9.5, 8, 5); ctx.fillRect(-7, -5, 14, 1.8); }          // top hat
    else { ctx.fillRect(-5, -7.5, 10, 3); ctx.fillRect(1, -5, 7, 1.6); }                    // cap with a peak
    ctx.restore();
  }

  /** Falling and dead survivors are drawn from their Verlet ragdoll; standing ones from the animated stick pose. */
  drawSurvivor(ctx, s, u) {
    if (s.gibbed || (s.state === S.LOST && s.fade >= 1)) return;
    const a = s.state === S.LOST ? Math.min(1, (1 - s.fade) * 1.6) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    if (s.rag && (s.state === S.FALLING || s.state === S.LOST)) {
      const r = s.rag;
      ctx.lineWidth = 2.5 * u;
      ctx.beginPath();
      r.eachBone((x0, y0, x1, y1) => { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); });
      ctx.stroke();
      if (!(r.severed & 32)) {
        ctx.beginPath(); ctx.arc(r.headX, r.headY, 4.6, 0, TAU); ctx.stroke();
        const nx = r.x[1], ny = r.y[1];
        this._hat(ctx, r.headX, r.headY, Math.atan2(r.headX - nx, ny - r.headY), s.hat, u);
      }
      ctx.restore();
      return;
    }
    ctx.translate(s.x, s.y - CHEST);
    ctx.rotate(s.angle);
    ctx.lineWidth = 2.5 * u;
    const t = s.phase;
    let la = 0, ra = 0, ll = 0.35, rl = -0.35, armUp = false;
    switch (s.state) {
      case S.WAITING: armUp = (Math.sin(t * 0.9) > 0.1); ra = Math.sin(t * 7) * 0.5; la = -0.4; break;
      case S.FALLING: la = Math.sin(t * 15) * 1.1; ra = Math.cos(t * 13) * 1.1; ll = Math.sin(t * 12) * 0.9; rl = -Math.sin(t * 12) * 0.9; armUp = true; break;
      case S.ATTACHED: armUp = true; ll = s.climbing ? Math.sin(t * 9) * 0.55 : Math.sin(t * 2) * 0.2 + 0.1; rl = -ll; break;
      case S.RESCUED: armUp = true; ra = Math.sin(t * 9) * 0.35; break;
      default: la = Math.sin(t * 15); ra = Math.cos(t * 14); ll = Math.sin(t * 12); rl = -ll;
    }
    ctx.beginPath(); ctx.arc(0, -12, 4.8, 0, TAU); ctx.stroke();
    this._hat(ctx, 0, -12, 0, s.hat, u);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(0, 7);                       // torso
    if (s.state === S.ATTACHED) {                              // both hands up on the rope, alternating while climbing
      const c = s.climbing ? Math.sin(t * 9) * 6 : 0;
      ctx.moveTo(0, -4); ctx.lineTo(-5, -14 + c * 0.5); ctx.lineTo(-1, -26 + c);
      ctx.moveTo(0, -4); ctx.lineTo(5, -14 - c * 0.5); ctx.lineTo(1, -26 - c);
    } else if (armUp) {
      ctx.moveTo(0, -4); ctx.lineTo(-9 + la * 4, -17 + la * 2);
      ctx.moveTo(0, -4); ctx.lineTo(9 + ra * 5, -17 - ra * 3);
    } else {
      ctx.moveTo(0, -4); ctx.lineTo(-8, 3 + la * 3);
      ctx.moveTo(0, -4); ctx.lineTo(8, 1 + ra * 8);
    }
    ctx.moveTo(0, 7); ctx.lineTo(Math.sin(ll) * 9, 7 + Math.cos(ll) * 9);
    ctx.moveTo(0, 7); ctx.lineTo(Math.sin(rl) * 9, 7 + Math.cos(rl) * 9);
    ctx.stroke();
    if (s.hit > 0) {
      ctx.lineWidth = 1.6 * u; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const an = i * 1.57 + 0.8; ctx.moveTo(Math.cos(an) * 16, Math.sin(an) * 16); ctx.lineTo(Math.cos(an) * 23, Math.sin(an) * 23); }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSparks(ctx, w, u) {
    const p = w.sparks;
    ctx.save(); ctx.fillStyle = WHITE; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.4 * u;
    for (let i = 0; i < p.count; i++) {
      if (p.life[i] <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.life[i] / p.max[i] * 1.4);
      ctx.beginPath(); ctx.moveTo(p.x[i], p.y[i]); ctx.lineTo(p.x[i] - p.vx[i] * 0.03, p.y[i] - p.vy[i] * 0.03); ctx.stroke();
    }
    ctx.restore();
  }

  drawPopups(ctx, w, u) {
    const p = w.popups;
    ctx.save(); ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.font = `bold 26px ${FONT}`;
    for (let i = 0; i < p.count; i++) {
      if (p.t[i] <= 0) continue;
      ctx.globalAlpha = Math.min(1, p.t[i]);
      ctx.fillText(p.text[i], p.x[i], p.y[i]);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ screen-space layers
  drawRain(ctx, rain) { fx.drawPrecip(ctx, this.cssW, this.cssH, rain); }

  /** Soft growing clouds: rooftop steam, downwash dust/spray, engine smoke. */
  drawPuffs(ctx, p, L, R) {
    const COL = ['rgb(235,235,240)', 'rgb(170,165,150)', 'rgb(70,70,72)', 'rgb(210,230,245)', 'rgb(225,190,120)'];
    ctx.save();
    for (let i = 0; i < p.count; i++) {
      const lf = p.life[i];
      if (lf <= 0) continue;
      const x = p.x[i];
      if (x < L - 60 || x > R + 60) continue;
      const k = p.kind[i], f = lf / p.max[i];
      ctx.globalAlpha = (k === 2 ? 0.55 : k === 0 ? 0.3 : 0.4) * Math.min(1, f * 1.6);
      ctx.fillStyle = COL[k];
      ctx.beginPath(); ctx.arc(x, p.y[i], p.size[i], 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawStreaks(ctx, w) {
    const W = this.cssW, H = this.cssH, wx = w.wind.x;
    const str = Math.min(1, Math.abs(wx) / 120);
    if (str < 0.15) return;
    const dir = wx > 0 ? 1 : -1;
    ctx.save(); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.14 + 0.22 * str;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      this.sx[i] += dir * (0.25 + str * 0.9) * (1 / 60);
      if (this.sx[i] > 1.2) this.sx[i] = -0.2; else if (this.sx[i] < -0.2) this.sx[i] = 1.2;
      const x = this.sx[i] * W, y = this.sy[i] * H, l = this.sl[i] * W * (0.5 + str);
      ctx.moveTo(x, y); ctx.lineTo(x - dir * l, y + Math.sin(i + w.time) * 3);
    }
    ctx.stroke(); ctx.restore();
  }

  drawLightning(ctx, w) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.3, w.flash * 0.3);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (w.flash > 0.45) {
      const rnd = mulberry32(w.boltSeed);
      let x = rnd() * this.cssW, y = 0;
      ctx.globalAlpha = Math.min(1, w.flash); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < this.cssH * 0.6) { x += (rnd() - 0.5) * 70; y += 22 + rnd() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  toScreen(x, y, L, T) { return [(x - L) * this.k / this.dpr, (y - T) * this.k / this.dpr]; }

  drawBubbles(ctx, w, L, T) {
    ctx.save();
    ctx.font = `bold 13px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (let i = 0; i < w.survivors.length; i++) {
      const s = w.survivors[i];
      if (s.speechT <= 0 || !s.speech) continue;
      const [sx, sy] = this.toScreen(s.x, s.y - 52, L, T);
      const tw = ctx.measureText(s.speech).width, bw = tw + 18, bh = 26;
      let bx = clamp(sx - bw / 2, 8, this.cssW - bw - 8);
      let by = clamp(sy - bh - 8, 56, this.cssH - bh - 90);
      ctx.globalAlpha = Math.min(1, s.speechT * 3);
      ctx.fillStyle = '#050505'; ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();
      const tx = clamp(sx, bx + 12, bx + bw - 12);
      ctx.beginPath(); ctx.moveTo(tx - 5, by + bh); ctx.lineTo(clamp(sx, bx, bx + bw), by + bh + 8); ctx.lineTo(tx + 5, by + bh);
      ctx.fillStyle = '#050505'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = WHITE; ctx.fillText(s.speech, bx + 9, by + bh / 2 + 1);
    }
    ctx.restore();
  }

  /** Edge chevrons pointing to off-screen survivors (hollow) and the safe zone (filled "Z"). */
  drawIndicators(ctx, w, L, T) {
    const W = this.cssW, H = this.cssH, m = 26;
    const draw = (x, y, label, filled) => {
      const [sx, sy] = this.toScreen(x, y, L, T);
      if (sx > 0 && sx < W && sy > 0 && sy < H) return;
      const px = clamp(sx, m, W - m), py = clamp(sy, 70, H - 100);
      const an = Math.atan2(sy - py, sx - px);
      ctx.save(); ctx.translate(px, py); ctx.rotate(an);
      ctx.strokeStyle = WHITE; ctx.fillStyle = WHITE; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath();
      if (filled) ctx.fill(); else ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.fillStyle = WHITE; ctx.globalAlpha = 0.7; ctx.font = `bold 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(label, clamp(px - Math.cos(an) * 20, 16, W - 16), clamp(py - Math.sin(an) * 20 + 4, 80, H - 90));
      ctx.restore();
    };
    draw(w.terrain.pad.cx, w.terrain.pad.y - 30, 'ZONE', true);
    for (let i = 0; i < w.survivors.length; i++) {
      const s = w.survivors[i];
      if (s.state === S.WAITING || s.state === S.FALLING) draw(s.x, s.y - 20, '', false);
    }
    const tn = w.tornado;
    if (tn.active) draw(tn.x, tn.cy, 'TORNADO', false);
  }
}
