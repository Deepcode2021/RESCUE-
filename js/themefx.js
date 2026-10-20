// Canvas helpers for per-place atmosphere: sky, sun/moon, beacons, searchlights, neon, fog, birds, haze, sirens.
// Everything is cheap (a few pre-rendered soft sprites + simple strokes) and takes a time value so it animates.
import { TAU } from './utils.js';

const sprites = new Map();
/** Soft round glow in one colour, rendered once. */
function glow(color) {
  let c = sprites.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color + '66'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    sprites.set(color, c);
  }
  return c;
}
function blob(color) {
  const k = 'blob' + color;
  let c = sprites.get(k);
  if (!c) {
    c = document.createElement('canvas'); c.width = 256; c.height = 90;
    const g = c.getContext('2d'); g.translate(128, 45); g.scale(1, 0.35);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    gr.addColorStop(0, color + 'cc'); gr.addColorStop(1, color + '00');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill();
    sprites.set(k, c);
  }
  return c;
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const NEON = ['#ff2fa8', '#2fe6ff', '#ffd02f', '#8a6cff'];

/** Sky gradient + a big soft sun/moon, in screen space (before the parallax layers). */
export function drawSky(ctx, W, H, th, tm) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.sky[0]); g.addColorStop(0.55, th.sky[1]); g.addColorStop(1, th.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const b = th.body;
  if (!b) return;
  const x = b.x * W, y = b.y * H, pulse = 1 + Math.sin(tm * 0.4) * 0.04;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const r = b.r * 3.2 * pulse;
  ctx.globalAlpha = 0.5; ctx.drawImage(glow(b.color), x - r, y - r, r * 2, r * 2);
  if (b.disc) { ctx.globalAlpha = 0.9; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x, y, b.r * 0.55, 0, TAU); ctx.fill(); }
  ctx.restore();
}

/** Dynamic lights on landmarks. Coordinates are already in the layer's world units; (ox, oy) maps layer pixels to them. */
export function drawMarks(ctx, layer, th, tm, scale, oy, intensity = 0) {
  if (!layer.marks || !layer.marks.length) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const m of layer.marks) {
    const x = m.x * scale, y = oy + m.y * scale;
    switch (m.kind) {
      case 'blink': {                                             // aircraft warning light: slow double blink
        const p = (tm * 0.9 + m.ph) % 1.6, on = p < 0.14 || (p > 0.3 && p < 0.44);
        if (!on) break;
        ctx.globalAlpha = 0.95; ctx.drawImage(glow('#ff3b30'), x - 26, y - 26 - 4, 52, 52);
        ctx.fillStyle = '#ff6a5c'; ctx.fillRect(x - 3, y - 7, 6, 6); break; }
      case 'glow': {
        ctx.globalAlpha = 0.5 + Math.sin(tm * 1.7 + m.ph) * 0.12; ctx.drawImage(glow('#ffc766'), x - 60, y - 30, 120, 120); break; }
      case 'beam': {                                              // sweeping searchlight cone
        const a = -Math.PI / 2 + Math.sin(tm * 0.55 + m.ph) * 0.85, len = 900, w = 0.09;
        const gx = x + Math.cos(a) * len, gy = y + Math.sin(a) * len;
        const gr = ctx.createLinearGradient(x, y, gx, gy);
        gr.addColorStop(0, th.body ? th.body.color + 'aa' : '#ffffffaa'); gr.addColorStop(1, '#ffffff00');
        ctx.globalAlpha = 0.5; ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - w) * len, y + Math.sin(a - w) * len); ctx.lineTo(x + Math.cos(a + w) * len, y + Math.sin(a + w) * len); ctx.fill();
        ctx.globalAlpha = 0.7; ctx.drawImage(glow('#ffffff'), x - 16, y - 16, 32, 32); break; }
      case 'sparkle': {                                           // the hourly Eiffel-style twinkle burst
        const cyc = tm % 11; if (cyc > 3.2) break;
        ctx.fillStyle = '#fff';
        for (let k = 0; k < 26; k++) {
          const ph = hash(k + m.ph) * 6, f = Math.sin(cyc * 14 + ph * 9);
          if (f < 0.35) continue;
          const sx = x + (hash(k * 3.1) - 0.5) * 64, sy = y + hash(k * 7.7) * 380;
          ctx.globalAlpha = f; ctx.fillRect(sx, sy, 6, 6);
        }
        break; }
      case 'neon': {
        const col = NEON[Math.floor(m.ph * 3.3) % 4], flick = Math.sin(tm * 3 + m.ph * 5) > -0.75 ? 1 : 0.25;
        ctx.globalAlpha = (0.55 + Math.sin(tm * 2 + m.ph) * 0.2) * flick;
        ctx.drawImage(glow(col), x - 44, y - 12, 88, 70);
        ctx.globalAlpha = 0.9 * flick; ctx.fillStyle = col; ctx.fillRect(x - 12, y + 8, 24, 4); break; }
    }
  }
  ctx.restore();
}

/** Neon strips glowing along the near rooftops (Tokyo). World space. */
export function drawRoofNeon(ctx, t, L, R, tm, DX) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < t.buildings.length; i++) {
    const b = t.buildings[i];
    const x0 = b.i0 * DX, x1 = (b.i1 + 1) * DX;
    if (x1 < L - 40 || x0 > R + 40) continue;
    const col = NEON[(b.seed >>> 0) % 4], flick = Math.sin(tm * 2.4 + b.seed) > -0.8 ? 1 : 0.3;
    ctx.globalAlpha = 0.85 * flick; ctx.fillStyle = col; ctx.fillRect(x0 + 2, b.top - 4, x1 - x0 - 4, 3);
    ctx.globalAlpha = 0.45 * flick; ctx.drawImage(glow(col), x0, b.top - 48, x1 - x0, 90);
  }
  ctx.restore();
}

/** Drifting fog banks (screen space). */
export function drawFog(ctx, W, H, th, tm, intensity) {
  const col = th.sky[2].length === 7 ? '#c8d2e0' : '#c8d2e0';
  const sp = blob(col);
  ctx.save();
  ctx.globalAlpha = 0.1 + 0.1 * intensity;
  for (let i = 0; i < 6; i++) {
    const w = W * (0.7 + (i % 3) * 0.25), h = w * 0.3;
    const x = ((tm * (6 + i * 3) + i * 400) % (W + w * 2)) - w;
    ctx.drawImage(sp, (i % 2 ? W - x - w : x), H * (0.5 + 0.09 * i) - h / 2, w, h);
  }
  ctx.restore();
}

/** A loose V-flock of small birds crossing the sky. */
export function drawBirds(ctx, W, H, tm) {
  ctx.save(); ctx.strokeStyle = '#f2efe6'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const per = 38, f = (tm % per) / per, x0 = -80 + f * (W + 200), y0 = H * 0.2 + Math.sin(f * 6) * 20;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    const x = x0 - row * 16, y = y0 + side * row * 9 + Math.sin(tm * 2 + i) * 2;
    const fl = Math.sin(tm * 9 + i * 1.3) * 4;
    ctx.moveTo(x - 6, y + fl); ctx.lineTo(x, y); ctx.lineTo(x + 6, y + fl);
  }
  ctx.stroke(); ctx.restore();
}

/** Heat haze and glints for the desert city. */
export function drawHaze(ctx, W, H, tm) {
  ctx.save();
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(255,170,60,0)'); g.addColorStop(1, 'rgba(255,170,60,0.16)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  ctx.strokeStyle = 'rgba(255,210,140,0.12)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = H * (0.6 + i * 0.09);
    ctx.beginPath();
    for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.03 + tm * 2 + i * 2) * 3; if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  ctx.restore();
}
export function drawGlints(ctx, W, H, tm) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffe3a0';
  for (let i = 0; i < 24; i++) {
    const f = Math.sin(tm * (1.5 + hash(i) * 2) + i * 4);
    if (f < 0.55) continue;
    ctx.globalAlpha = f; const x = hash(i * 2.3) * W, y = H * (0.3 + hash(i * 5.1) * 0.35);
    ctx.fillRect(x - 4, y, 9, 1.5); ctx.fillRect(x, y - 4, 1.5, 9);
  }
  ctx.restore();
}

/** Slanting sheets of monsoon rain that sweep across the whole screen now and then. */
export function drawSheets(ctx, W, H, tm, intensity) {
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const per = 7 + i * 3, f = ((tm + i * 3.3) % per) / per;
    const x = -W * 0.4 + f * W * 1.8, w = W * 0.35;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(200,240,220,0)'); g.addColorStop(0.5, `rgba(200,240,220,${(0.07 + 0.07 * intensity).toFixed(3)})`); g.addColorStop(1, 'rgba(200,240,220,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w - 120, H); ctx.lineTo(x - 120, H); ctx.fill();
  }
  ctx.restore();
}

/** Emergency lights flicker at the edges of the screen (New York). */
export function drawSirens(ctx, W, H, tm) {
  const cyc = tm % 24; if (cyc > 7) return;
  const on = Math.floor(tm * 3) % 2, a = Math.sin(cyc / 7 * Math.PI) * 0.22;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(glow(on ? '#ff2a2a' : '#2a5aff'), -W * 0.2, H * 0.5, W * 0.7, H * 0.7);
  ctx.drawImage(glow(on ? '#2a5aff' : '#ff2a2a'), W * 0.5, H * 0.5, W * 0.7, H * 0.7);
  ctx.restore();
}

/** Precipitation drawing for every mode. */
export function drawPrecip(ctx, W, H, rain) {
  ctx.save();
  const m = rain.mode;
  if (m === 'rain') {
    ctx.strokeStyle = 'rgba(242,239,230,0.38)'; ctx.lineWidth = 1; ctx.beginPath();
    const sl = rain.slant * 0.6;
    for (let i = 0; i < rain.count; i++) { const x = rain.x[i] * W, y = rain.y[i] * H, l = rain.len[i] * H; ctx.moveTo(x, y); ctx.lineTo(x + l * sl, y + l); }
    ctx.stroke();
  } else if (m === 'snow') {
    ctx.fillStyle = 'rgba(250,250,255,0.85)';
    for (let i = 0; i < rain.count; i++) { const s = rain.len[i]; ctx.fillRect(Math.round(rain.x[i] * W), Math.round(rain.y[i] * H), s, s); }
  } else if (m === 'petal') {
    for (let i = 0; i < rain.count; i++) {
      const x = rain.x[i] * W, y = rain.y[i] * H, s = rain.len[i], a = rain.ph[i] + rain.t * 2;
      ctx.fillStyle = i % 3 ? 'rgba(255,170,205,0.85)' : 'rgba(255,215,230,0.85)';
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, 0.55 + 0.45 * Math.sin(a * 1.7)); ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  } else if (m === 'sand') {
    ctx.strokeStyle = 'rgba(240,200,130,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < rain.count; i++) { const x = rain.x[i] * W, y = rain.y[i] * H, l = rain.len[i] * W; ctx.moveTo(x, y); ctx.lineTo(x - l, y + l * 0.05); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(210,150,70,0.07)'; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
