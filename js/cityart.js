// Pixel-art scenery, baked once per mission onto offscreen canvases (browser only; the simulation never imports this).
//  - bakeBuilding(): one canvas per rooftop block, drawn at 3 world units per pixel so everything stays chunky.
//  - bakeScenery(): parallax backdrop layers with real landmarks (Eiffel Tower, Sea Link, Empire State, Tokyo Tower, Burj Khalifa...).
import { mulberry32 } from './utils.js';

export const S = 3;                                   // world units per pixel
const CREAM = '#ece7d6', DIM = '#8a867a', DARK = '#070707', DOT = '#2c2c2a', MID = '#161615';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
function line(c, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; c.fillStyle = col;
  for (let n = 0; n < 4000; n++) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function dots(c, x, y, w, h, rnd, density, col = DOT) {
  c.fillStyle = col;
  const n = Math.floor(w * h * density);
  for (let i = 0; i < n; i++) c.fillRect(Math.floor(x + rnd() * w), Math.floor(y + rnd() * h), 1, 1);
}
function win(c, x, y, w, h, lit) {
  if (lit) { R(c, x, y, w, h, CREAM); return; }
  R(c, x, y, w, 1, DIM); R(c, x, y + h - 1, w, 1, DIM); R(c, x, y, 1, h, DIM); R(c, x + w - 1, y, 1, h, DIM);
}

// ------------------------------------------------------------------------------------------------ buildings
const KIND = {
  haussmann: { lit: 0.32, ww: 3, wh: 5, gx: 4, gy: 4 },
  slum: { lit: 0.42, ww: 2, wh: 3, gx: 3, gy: 3 },
  tower: { lit: 0.34, ww: 2, wh: 3, gx: 2, gy: 2 },
  neon: { lit: 0.58, ww: 2, wh: 3, gx: 2, gy: 2 },
  glass: { lit: 0.28, ww: 2, wh: 4, gx: 1, gy: 1 },
};

/** b = {x0, x1, top, kind, seed}; terrain geometry: flat roof x0..x1, walls slope to base over `dx`; body runs to `bottom`. */
export function bakeBuilding(b, base, bottom, dx) {
  const rnd = mulberry32(b.seed * 7 + 5);
  const pad = 14;                                                      // px of room above the roof for chimneys, tanks, antennas
  const xL = b.x0 - dx, xR = b.x1 + dx, yT = b.top - pad * S;
  const w = Math.ceil((xR - xL) / S), h = Math.ceil((bottom - yT) / S);
  const cv = mk(w, h), c = cv.getContext('2d');
  const dxp = Math.round(dx / S), topP = pad, baseP = Math.round((base - yT) / S);
  // body
  c.fillStyle = DARK; c.beginPath();
  c.moveTo(0, baseP); c.lineTo(dxp, topP); c.lineTo(w - dxp, topP); c.lineTo(w, baseP); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
  c.save(); c.clip();
  dots(c, 0, topP, w, h - topP, rnd, 0.06);
  const K = KIND[b.kind] || KIND.tower;
  const x0 = dxp + 2, x1 = w - dxp - 2;
  const pitchX = K.ww + K.gx, pitchY = K.wh + K.gy;
  const cols = Math.max(1, Math.floor((x1 - x0) / pitchX));
  const offX = Math.round(x0 + ((x1 - x0) - cols * pitchX + K.gx) / 2);
  let y = topP + (b.kind === 'haussmann' ? 11 : 4);
  let floor = 0;
  const lit = K.lit;
  while (y + K.wh < baseP + 40 && y + K.wh < h - 2) {
    for (let i = 0; i < cols; i++) {
      const wx = offX + i * pitchX;
      if (b.kind === 'slum') {                                         // ragged shacks: windows only on some cells
        if (rnd() < 0.45) continue;
      }
      win(c, wx, y, K.ww, K.wh, rnd() < lit);
      if (b.kind === 'haussmann') { R(c, wx - 1, y + K.wh + 1, K.ww + 2, 1, DIM); }       // wrought-iron balcony rail
    }
    if (b.kind === 'slum') {                                           // corrugated sheet line
      if (floor % 2 === 1) R(c, x0 - 1, y + K.wh + 1, x1 - x0 + 2, 1, DIM);
    }
    if (b.kind === 'tower' || b.kind === 'glass') { if (floor % 6 === 5) R(c, x0 - 1, y + K.wh + 1, x1 - x0 + 2, 1, DIM); }
    y += pitchY; floor++;
  }
  if (b.kind === 'neon') {                                             // vertical neon signs on the facade
    const signs = 1 + Math.floor(rnd() * 2);
    for (let s = 0; s < signs; s++) {
      const sx = Math.round(x0 + 3 + rnd() * Math.max(1, (x1 - x0) - 10)), sy = topP + 8 + Math.floor(rnd() * 20), sh = 18 + Math.floor(rnd() * 22);
      R(c, sx, sy, 5, sh, DARK); R(c, sx, sy, 5, 1, CREAM); R(c, sx, sy + sh - 1, 5, 1, CREAM); R(c, sx, sy, 1, sh, CREAM); R(c, sx + 4, sy, 1, sh, CREAM);
      for (let k = 2; k < sh - 2; k += 3) R(c, sx + 1 + (k % 2), sy + k, 2, 2, CREAM);
    }
  }
  if (b.kind === 'haussmann') {                                        // mansard roof band + dormers
    R(c, dxp, topP, w - 2 * dxp, 9, MID);
    for (let x = dxp + 3; x < w - dxp - 5; x += 9) { R(c, x, topP + 2, 4, 5, DARK); R(c, x, topP + 2, 4, 1, CREAM); R(c, x + 1, topP + 4, 2, 2, rnd() < 0.4 ? CREAM : DIM); }
    R(c, dxp, topP + 9, w - 2 * dxp, 1, CREAM);
  }
  c.restore();
  // outline: roof + walls (the body bottom stays open)
  c.fillStyle = CREAM;
  R(c, dxp, topP, w - 2 * dxp, 1, CREAM);
  line(c, 0, baseP, dxp, topP, CREAM); line(c, w - 1, baseP, w - 1 - dxp, topP, CREAM);
  line(c, 0, baseP, 0, h, CREAM); line(c, w - 1, baseP, w - 1, h, CREAM);
  // rooftop furniture (above the flat roof line, not collidable)
  const rx0 = dxp + 3, rx1 = w - dxp - 4;
  const place = () => Math.round(rx0 + rnd() * Math.max(1, rx1 - rx0 - 6));
  const rb = (x, wd, ht) => { R(c, x, topP - ht, wd, ht, DARK); R(c, x, topP - ht, wd, 1, CREAM); R(c, x, topP - ht, 1, ht, CREAM); R(c, x + wd - 1, topP - ht, 1, ht, CREAM); };
  if (b.kind === 'haussmann') {
    for (let i = 0; i < 3; i++) { const x = place(); rb(x, 3, 3 + Math.floor(rnd() * 3)); R(c, x, topP - 7, 3, 1, DIM); }     // chimney pots
  } else if (b.kind === 'slum') {
    const tanks = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < tanks; i++) { const x = place(); rb(x, 6, 5); R(c, x + 2, topP - 8, 2, 3, CREAM); line(c, x + 1, topP, x + 1, topP - 2, DIM); }          // water tanks
    const x = place(); line(c, x, topP, x, topP - 11, CREAM); line(c, x - 2, topP - 9, x + 2, topP - 9, CREAM);                                              // antenna
    const d = place(); c.fillStyle = CREAM; c.beginPath(); c.arc(d, topP - 5, 3, Math.PI, 0); c.fill(); line(c, d, topP - 5, d, topP, DIM);                  // satellite dish
    for (let i = 0; i < 3; i++) R(c, place(), topP - 2 - (i & 1), 1 + (i & 1), 2, DIM);                                                                      // laundry
  } else {
    if (rnd() < 0.8) { const x = place(); rb(x, 5 + Math.floor(rnd() * 4), 3 + Math.floor(rnd() * 3)); }
    if (rnd() < 0.7) { const x = place(); line(c, x, topP, x, topP - 4 - Math.floor(rnd() * 9), CREAM); }
    if (rnd() < 0.5) { const x = place(); rb(x, 3, 4); R(c, x + 3, topP - 2, 3, 2, DIM); }
  }
  return { canvas: cv, xL, yT, w, h };
}

// ------------------------------------------------------------------------------------------------ scenery
function skyline(c, rnd, W, bottom, o) {
  let x = -4;
  while (x < W) {
    const w = o.wMin + Math.floor(rnd() * (o.wMax - o.wMin));
    const h = o.hMin + Math.floor(rnd() * (o.hMax - o.hMin));
    const y = bottom - h;
    R(c, x, y, w, h, MID);
    dots(c, x, y, w, h, rnd, o.dots, '#3a3a37');
    R(c, x, y, w, 1, o.edge || DIM);
    R(c, x, y, 1, h, o.edge || DIM);
    // lit windows
    for (let wy = y + 3; wy < bottom - 3; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() < o.lit) R(c, wx, wy, 1, 2, CREAM);
    if (rnd() < 0.35) { const ax = x + 1 + Math.floor(rnd() * Math.max(1, w - 2)); line(c, ax, y, ax, y - 3 - Math.floor(rnd() * 6), DIM); }
    if (rnd() < 0.25 && w > 8) { R(c, x + 2, y - 2, w - 4, 2, MID); R(c, x + 2, y - 2, w - 4, 1, DIM); }
    x += w + (rnd() < 0.3 ? 1 + Math.floor(rnd() * 3) : 0);
  }
}
function stars(c, rnd, W, H, n) { for (let i = 0; i < n; i++) R(c, rnd() * W, rnd() * H, 1, 1, rnd() < 0.2 ? DIM : '#3a3a37'); }

// --- landmarks (all drawn with the foot of the structure at (x, g)) ---
function eiffel(c, x, g, hgt = 78) {
  const k = hgt / 78, X = (v) => x + v * k, Y = (v) => g - v * k;
  const leg = (s) => { line(c, X(s * 17), Y(0), X(s * 11), Y(20), CREAM); line(c, X(s * 11), Y(20), X(s * 7), Y(36), CREAM); line(c, X(s * 7), Y(36), X(s * 4), Y(56), CREAM); line(c, X(s * 4), Y(56), X(s * 2), Y(70), CREAM); line(c, X(s * 14), Y(0), X(s * 8.5), Y(20), CREAM); line(c, X(s * 8.5), Y(20), X(s * 5.5), Y(36), CREAM); line(c, X(s * 5.5), Y(36), X(s * 3), Y(56), CREAM); };
  leg(-1); leg(1);
  R(c, X(-12), Y(21), 24 * k, 2, CREAM); R(c, X(-6.5), Y(37), 13 * k, 2, CREAM); R(c, X(-3.5), Y(57), 7 * k, 2, CREAM);
  for (let i = 0; i < 6; i++) { const y0 = i * 3.3; line(c, X(-14 + i * 0.5), Y(y0), X(14 - i * 0.5 - 2), Y(y0 + 3.3), DIM); line(c, X(14 - i * 0.5), Y(y0), X(-14 + i * 0.5 + 2), Y(y0 + 3.3), DIM); }
  c.fillStyle = CREAM; c.beginPath(); c.ellipse(Math.round(x), Math.round(Y(0)), 9 * k, 9 * k, 0, Math.PI, 0); c.lineWidth = 1; c.strokeStyle = CREAM; c.stroke();
  line(c, X(-2), Y(70), X(0), Y(hgt + 8), CREAM); line(c, X(2), Y(70), X(0), Y(hgt + 8), CREAM);
  line(c, X(0), Y(hgt + 8), X(0), Y(hgt + 14), CREAM);
}
function dome(c, x, g, r, col = CREAM) { c.fillStyle = MID; c.beginPath(); c.arc(Math.round(x), Math.round(g), r, Math.PI, 0); c.fill(); c.strokeStyle = col; c.lineWidth = 1; c.stroke(); line(c, x, g - r, x, g - r - 4, col); }
function sacreCoeur(c, x, g) { R(c, x - 14, g - 12, 28, 12, MID); R(c, x - 14, g - 12, 28, 1, CREAM); dome(c, x, g - 12, 8); dome(c, x - 11, g - 12, 4); dome(c, x + 11, g - 12, 4); R(c, x - 3, g - 12, 1, 12, DIM); R(c, x + 3, g - 12, 1, 12, DIM); }
function arcDeTriomphe(c, x, g) { R(c, x - 10, g - 20, 20, 20, MID); R(c, x - 10, g - 20, 20, 2, CREAM); R(c, x - 10, g - 20, 1, 20, CREAM); R(c, x + 9, g - 20, 1, 20, CREAM); R(c, x - 4, g - 12, 8, 12, DARK); R(c, x - 4, g - 12, 8, 1, CREAM); R(c, x - 4, g - 12, 1, 12, CREAM); R(c, x + 3, g - 12, 1, 12, CREAM); for (let i = -8; i < 8; i += 3) R(c, x + i, g - 17, 2, 3, DIM); }
function notreDame(c, x, g) { R(c, x - 12, g - 22, 7, 22, MID); R(c, x + 5, g - 22, 7, 22, MID); R(c, x - 5, g - 14, 10, 14, MID); for (const o of [-12, 5]) { R(c, x + o, g - 22, 7, 1, CREAM); R(c, x + o, g - 22, 1, 22, CREAM); R(c, x + o + 6, g - 22, 1, 22, CREAM); R(c, x + o + 2, g - 16, 3, 5, DARK); } c.fillStyle = CREAM; c.beginPath(); c.arc(x, g - 9, 3, 0, 7); c.fill(); R(c, x - 5, g - 14, 10, 1, CREAM); }
function seaLink(c, x, g, W) {                                          // Bandra-Worli Sea Link: deck, 2 inverted-Y towers, stay cables
  R(c, x - 70, g - 6, 140, 2, CREAM); R(c, x - 70, g - 4, 140, 1, DIM);
  for (const tx of [x - 24, x + 24]) {
    R(c, tx - 1, g - 56, 2, 52, CREAM); line(c, tx - 5, g - 6, tx - 1, g - 40, CREAM); line(c, tx + 5, g - 6, tx + 1, g - 40, CREAM);
    for (let i = 0; i < 9; i++) { const d = 4 + i * 5; line(c, tx, g - 54 + i * 2, tx - d, g - 6, DIM); line(c, tx, g - 54 + i * 2, tx + d, g - 6, DIM); }
  }
  for (let i = -66; i < 70; i += 12) R(c, x + i, g - 4, 1, 4, DIM);
}
function gateway(c, x, g) {                                            // Gateway of India: central arch, flanking turrets, little domes
  R(c, x - 14, g - 26, 28, 26, MID); R(c, x - 14, g - 26, 28, 1, CREAM); R(c, x - 14, g - 26, 1, 26, CREAM); R(c, x + 13, g - 26, 1, 26, CREAM);
  c.fillStyle = DARK; c.beginPath(); c.moveTo(x - 6, g); c.lineTo(x - 6, g - 14); c.arc(x, g - 14, 6, Math.PI, 0); c.lineTo(x + 6, g); c.fill(); c.strokeStyle = CREAM; c.lineWidth = 1; c.stroke();
  for (const o of [-14, 10]) { R(c, x + o, g - 32, 4, 8, MID); R(c, x + o, g - 32, 4, 1, CREAM); dome(c, x + o + 2, g - 32, 2); }
  dome(c, x, g - 26, 6);
}
function empire(c, x, g) { const t = [[26, 8], [20, 28], [14, 40], [10, 52], [6, 58]]; let y = g; t.forEach(([w, h], i) => { R(c, x - w / 2, y - h, w, h, MID); R(c, x - w / 2, y - h, w, 1, CREAM); R(c, x - w / 2, y - h, 1, h, CREAM); R(c, x + w / 2 - 1, y - h, 1, h, CREAM); for (let k = 3; k < h - 2; k += 4) for (let j = -w / 2 + 3; j < w / 2 - 3; j += 3) if ((i + k + j) % 3) R(c, x + j, y - h + k, 1, 2, CREAM); y -= h - 1; }); line(c, x, y, x, y - 22, CREAM); R(c, x - 1, y - 12, 3, 1, CREAM); }
function chrysler(c, x, g) { R(c, x - 9, g - 52, 18, 52, MID); R(c, x - 9, g - 52, 1, 52, CREAM); R(c, x + 8, g - 52, 1, 52, CREAM); R(c, x - 9, g - 52, 18, 1, CREAM); for (let i = 0; i < 6; i++) { const w = 8 - i; c.fillStyle = MID; c.beginPath(); c.arc(x, g - 52 - i * 3, w, Math.PI, 0); c.fill(); c.strokeStyle = CREAM; c.lineWidth = 1; c.stroke(); } line(c, x, g - 70, x, g - 90, CREAM); for (let k = 4; k < 48; k += 4) for (let j = -6; j < 6; j += 3) if ((k + j) & 1) R(c, x + j, g - 52 + k, 1, 2, CREAM); }
function oneWTC(c, x, g) { const h = 100; R(c, x - 8, g - 70, 16, 70, MID); R(c, x - 8, g - 70, 1, 70, CREAM); R(c, x + 7, g - 70, 1, 70, CREAM); line(c, x - 8, g - 70, x, g - h, CREAM); line(c, x + 8, g - 70, x, g - h, CREAM); line(c, x, g - h, x, g - h - 18, CREAM); for (let k = 3; k < 66; k += 4) for (let j = -6; j < 6; j += 3) if ((k + j + 9) % 4) R(c, x + j, g - 70 + k, 1, 2, CREAM); }
function liberty(c, x, g) { R(c, x - 5, g - 8, 10, 8, MID); R(c, x - 5, g - 8, 10, 1, CREAM); R(c, x - 2, g - 22, 4, 14, MID); R(c, x - 2, g - 22, 4, 1, CREAM); R(c, x - 2, g - 28, 4, 6, CREAM); line(c, x + 2, g - 24, x + 4, g - 34, CREAM); R(c, x + 3, g - 37, 3, 3, CREAM); for (let i = -4; i <= 4; i += 2) line(c, x, g - 28, x + i, g - 31, CREAM); }
function tokyoTower(c, x, g) { const H = 104; for (const s of [-1, 1]) { line(c, x + s * 14, g, x + s * 6, g - 46, CREAM); line(c, x + s * 6, g - 46, x + s * 3, g - 78, CREAM); line(c, x + s * 11, g, x + s * 4.5, g - 46, DIM); } R(c, x - 9, g - 45, 18, 2, CREAM); R(c, x - 5, g - 70, 10, 2, CREAM); for (let i = 0; i < 9; i++) { const y = i * 5; line(c, x - 13 + i * 0.7, g - y, x + 13 - i * 0.7 - 2, g - y - 5, DIM); line(c, x + 13 - i * 0.7, g - y, x - 13 + i * 0.7 + 2, g - y - 5, DIM); } line(c, x - 3, g - 78, x, g - H, CREAM); line(c, x + 3, g - 78, x, g - H, CREAM); line(c, x, g - H, x, g - H - 12, CREAM); }
function skytree(c, x, g) { R(c, x - 1, g - 150, 3, 150, CREAM); line(c, x - 7, g, x - 1, g - 60, CREAM); line(c, x + 8, g, x + 2, g - 60, CREAM); R(c, x - 5, g - 112, 11, 3, CREAM); R(c, x - 4, g - 123, 9, 2, CREAM); line(c, x, g - 150, x, g - 172, CREAM); for (let k = 0; k < 8; k++) line(c, x - 6 + k * 0.5, g - k * 8, x + 6 - k * 0.5, g - k * 8 - 8, DIM); }
function fuji(c, x, g, w, h) { c.fillStyle = MID; c.beginPath(); c.moveTo(x - w / 2, g); c.lineTo(x - w * 0.09, g - h); c.lineTo(x + w * 0.09, g - h); c.lineTo(x + w / 2, g); c.fill(); c.strokeStyle = DIM; c.lineWidth = 1; c.stroke(); c.fillStyle = CREAM; c.beginPath(); c.moveTo(x - w * 0.16, g - h * 0.74); c.lineTo(x - w * 0.09, g - h); c.lineTo(x + w * 0.09, g - h); c.lineTo(x + w * 0.16, g - h * 0.74); c.lineTo(x + w * 0.08, g - h * 0.8); c.lineTo(x, g - h * 0.72); c.lineTo(x - w * 0.08, g - h * 0.8); c.fill(); }
function burj(c, x, g) {
  const tiers = [[20, 36], [16, 36], [12, 34], [9, 30], [6, 26], [4, 24]]; let y = g;
  tiers.forEach(([w, h], i) => { R(c, x - w / 2, y - h, w, h, MID); R(c, x - w / 2, y - h, 1, h, CREAM); R(c, x + w / 2 - 1, y - h, 1, h, CREAM); R(c, x - w / 2, y - h, w, 1, DIM); for (let k = 2; k < h - 1; k += 3) for (let j = -w / 2 + 2; j < w / 2 - 2; j += 2) if ((k + j + i) % 3) R(c, x + j, y - h + k, 1, 1, CREAM); y -= h; });
  line(c, x - 2, y, x, y - 34, CREAM); line(c, x + 2, y, x, y - 34, CREAM);
}
function burjAlArab(c, x, g) { R(c, x - 22, g - 3, 36, 3, CREAM); c.strokeStyle = CREAM; c.lineWidth = 1; c.fillStyle = MID; c.beginPath(); c.moveTo(x - 20, g - 3); c.quadraticCurveTo(x - 24, g - 36, x - 6, g - 62); c.lineTo(x + 2, g - 62); c.quadraticCurveTo(x - 10, g - 30, x + 10, g - 3); c.fill(); c.stroke(); line(c, x - 6, g - 62, x - 6, g - 74, CREAM); for (let k = 8; k < 54; k += 5) line(c, x - 16 + k * 0.2, g - 3 - k, x + 4 + k * 0.1, g - 3 - k, DIM); }
function lighthouse(c, x, g) { c.fillStyle = MID; c.beginPath(); c.moveTo(x - 6, g); c.lineTo(x - 3, g - 40); c.lineTo(x + 3, g - 40); c.lineTo(x + 6, g); c.fill(); c.strokeStyle = CREAM; c.lineWidth = 1; c.stroke(); R(c, x - 5, g - 43, 10, 3, CREAM); R(c, x - 3, g - 50, 6, 7, DARK); R(c, x - 3, g - 50, 6, 1, CREAM); R(c, x - 1, g - 47, 2, 3, CREAM); R(c, x - 4, g - 53, 8, 3, CREAM); for (let k = 8; k < 36; k += 10) R(c, x - 4 + k / 10, g - k, 8 - k / 10 * 2, 2, DIM); }
function cargoShip(c, x, g) { R(c, x - 30, g - 6, 60, 6, MID); R(c, x - 30, g - 6, 60, 1, CREAM); R(c, x + 12, g - 18, 14, 12, MID); R(c, x + 12, g - 18, 14, 1, CREAM); for (let i = 0; i < 4; i++) R(c, x + 14 + i * 3, g - 15, 2, 2, CREAM); for (let i = 0; i < 5; i++) { R(c, x - 26 + i * 7, g - 12, 6, 6, i % 2 ? DIM : MID); R(c, x - 26 + i * 7, g - 12, 6, 1, CREAM); } R(c, x + 18, g - 24, 2, 6, CREAM); }
function crane(c, x, g) { R(c, x, g - 50, 2, 50, CREAM); R(c, x - 20, g - 50, 44, 2, CREAM); line(c, x + 1, g - 56, x - 20, g - 50, DIM); line(c, x + 1, g - 56, x + 24, g - 50, DIM); R(c, x - 20, g - 48, 1, 14, DIM); for (let k = 0; k < 9; k++) line(c, x, g - k * 6, x + 2, g - k * 6 - 6, DIM); }
function oilRig(c, x, g) { R(c, x - 14, g - 30, 28, 4, CREAM); for (const o of [-12, -4, 4, 12]) R(c, x + o, g - 26, 2, 26, DIM); R(c, x - 8, g - 40, 10, 10, MID); R(c, x - 8, g - 40, 10, 1, CREAM); line(c, x + 4, g - 30, x + 12, g - 56, CREAM); R(c, x + 11, g - 56, 3, 2, CREAM); line(c, x - 14, g - 26, x + 14, g - 4, DIM); }
function mountainRange(c, rnd, W, g, hMin, hMax, snow, step = 14) {
  c.fillStyle = MID; c.beginPath(); c.moveTo(0, g);
  const pts = []; let x = 0;
  while (x <= W + step) { const y = g - (hMin + rnd() * (hMax - hMin)) * (0.5 + 0.5 * Math.sin(x * 0.011 + 1)); pts.push([x, y]); c.lineTo(x, y); x += step * (0.6 + rnd() * 1.1); }
  c.lineTo(W, g); c.closePath(); c.fill();
  c.strokeStyle = DIM; c.lineWidth = 1; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke();
  if (snow) pts.forEach(([px, py]) => { if (g - py > snow) { c.fillStyle = CREAM; c.beginPath(); c.moveTo(px, py); c.lineTo(px - 5, py + 7); c.lineTo(px - 2, py + 5); c.lineTo(px, py + 9); c.lineTo(px + 2, py + 5); c.lineTo(px + 5, py + 7); c.fill(); } });
  dots(c, 0, g - hMax, W, hMax, rnd, 0.02, '#2a2a28');
}
function pines(c, rnd, W, g, n) { for (let i = 0; i < n; i++) { const x = Math.floor(rnd() * W), h = 8 + Math.floor(rnd() * 12); c.fillStyle = MID; c.beginPath(); c.moveTo(x, g - h); c.lineTo(x - 4, g - 2); c.lineTo(x + 4, g - 2); c.fill(); line(c, x, g - h, x - 4, g - 2, DIM); line(c, x, g - h, x + 4, g - 2, DIM); } }
function prayerFlags(c, x0, y0, x1, y1) { line(c, x0, y0, x1, y1, DIM); for (let i = 0; i <= 12; i++) { const t = i / 12, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 4; R(c, x, y, 2, 3, i % 2 ? CREAM : DIM); } }
function radioMast(c, x, g) { R(c, x, g - 70, 2, 70, CREAM); for (let k = 0; k < 10; k++) line(c, x - 3, g - k * 7, x + 5, g - k * 7 - 7, DIM); R(c, x - 3, g - 40, 8, 1, CREAM); R(c, x - 5, g - 62, 12, 1, CREAM); }

/** Layers back to front: {canvas, px, py, w, h, bottom(world y of the layer's baseline)} */
export function bakeScenery(theme, baseY, worldW, seed) {
  const rnd = mulberry32(seed * 131 + 9);
  // marks: [{x (0..1 of layer width), kind}] -> resolved to the topmost painted pixel near x, so beacons sit on the real landmark tips
  const mkLayer = (par, hpx, build, bottomOffset = 0, wanted = []) => {
    const wpx = Math.ceil((worldW * par + 1500) / S), cv = mk(wpx, hpx + 260), c = cv.getContext('2d');
    c.fillStyle = '#050505'; c.fillRect(0, hpx - 2, wpx, 262);          // solid body below the baseline so no gap ever shows
    build(c, wpx, hpx);
    const marks = [];
    for (const m of wanted) {
      const x = Math.round(m.x * wpx), x0 = Math.max(0, x - 4);
      let top = -1;
      try {
        const d = c.getImageData(x0, 0, 9, hpx).data;
        scan: for (let y = 0; y < hpx; y++) for (let k = 0; k < 9; k++) if (d[(y * 9 + k) * 4 + 3] > 40) { top = y; break scan; }
      } catch (e) { top = Math.round(hpx * 0.4); }
      if (top < 0) top = Math.round(hpx * 0.4);
      marks.push({ x, y: top + (m.dy || 0), kind: m.kind, ph: m.x * 37 });
    }
    return { canvas: cv, par, hpx, bottom: baseY + bottomOffset, marks };
  };
  const layers = [];
  const L0 = mkLayer(0.08, 300, (c, w, h) => { stars(c, rnd, w, h * 0.7, Math.floor(w * 0.35)); });
  layers.push(L0);
  const sky = (par, hpx, o, lm, off, wanted) => mkLayer(par, hpx, (c, w, h) => {
    skyline(c, rnd, w, h, o);
    lm(c, w, h);
  }, off, wanted);
  switch (theme) {
    case 'paris': {
      layers.push(sky(0.22, 210, { wMin: 7, wMax: 15, hMin: 14, hMax: 50, dots: 0.06, lit: 0.16 }, (c, w, h) => { eiffel(c, w * 0.42, h, 130); sacreCoeur(c, w * 0.12, h); arcDeTriomphe(c, w * 0.68, h); notreDame(c, w * 0.86, h); }, 0, [{ x: 0.42, kind: 'beam' }, { x: 0.42, kind: 'sparkle', dy: 8 }, { x: 0.12, kind: 'glow', dy: 4 }, { x: 0.68, kind: 'glow', dy: 2 }]));
      layers.push(sky(0.45, 130, { wMin: 9, wMax: 20, hMin: 18, hMax: 64, dots: 0.05, lit: 0.22 }, (c, w, h) => {}, 40));
      break; }
    case 'mumbai': {
      layers.push(sky(0.2, 230, { wMin: 6, wMax: 13, hMin: 40, hMax: 112, dots: 0.06, lit: 0.2 }, (c, w, h) => { seaLink(c, w * 0.34, h - 24, w); gateway(c, w * 0.78, h); for (let i = 0; i < 9; i++) line(c, w * (0.52 + i * 0.012), h, w * (0.52 + i * 0.012), h - 8, DIM); }, 0, [{ x: 0.34, kind: 'blink' }, { x: 0.37, kind: 'blink' }, { x: 0.78, kind: 'glow', dy: 6 }]));
      layers.push(sky(0.45, 140, { wMin: 6, wMax: 12, hMin: 14, hMax: 44, dots: 0.08, lit: 0.34 }, () => {}, 40));
      break; }
    case 'newyork': {
      layers.push(sky(0.2, 280, { wMin: 8, wMax: 16, hMin: 40, hMax: 128, dots: 0.05, lit: 0.18 }, (c, w, h) => { empire(c, w * 0.3, h); chrysler(c, w * 0.58, h); oneWTC(c, w * 0.8, h); liberty(c, w * 0.08, h); }, 0, [{ x: 0.3, kind: 'blink' }, { x: 0.3, kind: 'beam' }, { x: 0.58, kind: 'blink' }, { x: 0.8, kind: 'blink' }, { x: 0.08, kind: 'glow', dy: 2 }]));
      layers.push(sky(0.45, 170, { wMin: 9, wMax: 18, hMin: 30, hMax: 90, dots: 0.05, lit: 0.26 }, () => {}, 40));
      break; }
    case 'tokyo': {
      layers.push(mkLayer(0.1, 240, (c, w, h) => { fuji(c, w * 0.7, h, 170, 62); }, 0));
      layers.push(sky(0.22, 300, { wMin: 7, wMax: 14, hMin: 30, hMax: 100, dots: 0.05, lit: 0.3 }, (c, w, h) => { tokyoTower(c, w * 0.3, h); skytree(c, w * 0.62, h); }, 0, [{ x: 0.3, kind: 'blink' }, { x: 0.62, kind: 'blink' }, { x: 0.3, kind: 'glow', dy: 30 }, { x: 0.62, kind: 'glow', dy: 40 }]));
      layers.push(sky(0.45, 170, { wMin: 7, wMax: 15, hMin: 24, hMax: 80, dots: 0.05, lit: 0.42 }, () => {}, 40, Array.from({ length: 16 }, (_, i) => ({ x: 0.04 + i * 0.058 + (i % 3) * 0.01, kind: 'neon', dy: 7 + (i % 4) * 5 }))));
      break; }
    case 'dubai': {
      layers.push(sky(0.2, 360, { wMin: 7, wMax: 14, hMin: 40, hMax: 120, dots: 0.05, lit: 0.22 }, (c, w, h) => { burj(c, w * 0.34, h); burjAlArab(c, w * 0.72, h); }, 0, [{ x: 0.34, kind: 'blink' }, { x: 0.34, kind: 'beam' }, { x: 0.72, kind: 'glow', dy: 6 }]));
      layers.push(sky(0.45, 210, { wMin: 8, wMax: 16, hMin: 36, hMax: 110, dots: 0.05, lit: 0.26 }, () => {}, 40));
      break; }
    case 'harbor': {
      layers.push(mkLayer(0.14, 120, (c, w, h) => { lighthouse(c, w * 0.3, h); oilRig(c, w * 0.62, h); cargoShip(c, w * 0.8, h); cargoShip(c, w * 0.12, h); crane(c, w * 0.48, h); }, 10, [{ x: 0.3, kind: 'beam' }, { x: 0.48, kind: 'blink' }, { x: 0.62, kind: 'blink' }]));
      layers.push(mkLayer(0.35, 180, (c, w, h) => { mountainRange(c, rnd, w, h, 40, 120, 0); }, 40));
      break; }
    case 'himalaya': {
      layers.push(mkLayer(0.12, 320, (c, w, h) => { mountainRange(c, rnd, w, h, 120, 260, 120, 22); }, -40));
      layers.push(mkLayer(0.3, 240, (c, w, h) => { mountainRange(c, rnd, w, h, 70, 200, 90, 16); prayerFlags(c, w * 0.18, h - 70, w * 0.26, h - 40); radioMast(c, w * 0.6, h); }, 20));
      layers.push(mkLayer(0.5, 150, (c, w, h) => { mountainRange(c, rnd, w, h, 40, 110, 0, 12); pines(c, rnd, w, h, Math.floor(w / 18)); }, 60));
      break; }
    default: {                                                         // 'alps'
      layers.push(mkLayer(0.12, 300, (c, w, h) => { mountainRange(c, rnd, w, h, 100, 230, 100, 20); }, -30));
      layers.push(mkLayer(0.3, 210, (c, w, h) => { mountainRange(c, rnd, w, h, 60, 160, 70, 14); }, 20));
      layers.push(mkLayer(0.5, 140, (c, w, h) => { mountainRange(c, rnd, w, h, 30, 90, 0, 12); pines(c, rnd, w, h, Math.floor(w / 14)); }, 60));
    }
  }
  return layers;
}
