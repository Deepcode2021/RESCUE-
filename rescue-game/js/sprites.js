// Pixel-art sprites baked at start-up onto tiny offscreen canvases (browser only).
// The helicopter has three views: facing LEFT, front/MID (hovering) and facing RIGHT. Rotors are animated at draw time.
export const PU = 3.2;                         // world units per sprite pixel
const CREAM = '#ece7d6', SHADE = '#9d998b', DARK = '#0a0a0a';
const W = 64, H = 34, OX = 34, OY = 19;         // canvas size and the pixel that sits on the helicopter origin

function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(OX + x), Math.round(OY + y), w, h); }
function ell(c, cx, cy, rx, ry, col) {
  c.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.0001))));
    c.fillRect(Math.round(OX + cx - half), Math.round(OY + cy + y), half * 2 + 1, 1);
  }
}

function drawSide(c) {
  // tail boom (tapering) + fin + stabiliser
  for (let x = -31; x <= -9; x++) {
    const t = (x + 31) / 22, thick = Math.round(2 + 3 * t), yc = -5 - Math.round((1 - t) * 0.0);
    px(c, x, yc - Math.floor(thick / 2), 1, thick, CREAM);
  }
  px(c, -33, -14, 3, 10, CREAM); px(c, -31, -14, 1, 4, SHADE);       // fin
  px(c, -31, -4, 6, 1, SHADE);
  // fuselage
  ell(c, 2, -1, 14, 9, CREAM);
  ell(c, 4, 4, 13, 4, SHADE);                                         // belly shading
  ell(c, 2, -3, 12, 7, CREAM);
  // engine hump + mast
  px(c, -7, -12, 12, 3, CREAM); px(c, -1, -15, 2, 4, SHADE);
  px(c, -6, -10, 1, 1, DARK);
  // canopy
  ell(c, 9, -3, 6, 5, DARK); px(c, 6, -6, 2, 1, CREAM); px(c, 5, -5, 1, 1, CREAM);
  px(c, 11, -3, 1, 4, SHADE);
  // door + side window
  px(c, -3, -7, 1, 10, DARK); px(c, -9, -6, 5, 4, DARK); px(c, -8, -5, 1, 1, CREAM);
  px(c, -12, 3, 22, 1, DARK);
  // skids and struts
  px(c, -14, 12, 30, 2, CREAM); px(c, 15, 10, 3, 2, CREAM); px(c, -15, 11, 1, 1, CREAM);
  px(c, -8, 7, 1, 5, SHADE); px(c, 7, 7, 1, 5, SHADE);
  // landing light
  px(c, 15, 0, 1, 1, CREAM);
}

function drawFront(c) {
  // tail stub behind (looks like a fin above the roof)
  px(c, -1, -17, 2, 7, SHADE);
  // fuselage
  ell(c, 0, -1, 11, 10, CREAM);
  ell(c, 0, 6, 8, 4, SHADE);
  px(c, -6, -13, 12, 3, CREAM);                                       // engine cowl
  px(c, -1, -17, 2, 4, SHADE);                                        // mast
  // windshield: two panes with a divider
  px(c, -8, -9, 7, 8, DARK); px(c, 2, -9, 7, 8, DARK); px(c, -1, -9, 3, 8, CREAM);
  px(c, -7, -8, 2, 1, CREAM); px(c, 3, -8, 2, 1, CREAM);
  // lower chin window
  px(c, -4, 0, 9, 3, DARK);
  // doors / panel lines
  px(c, -10, -4, 1, 8, DARK); px(c, 10, -4, 1, 8, DARK);
  // skids (seen end-on: wide bars) and struts
  px(c, -15, 13, 31, 2, CREAM); px(c, -10, 8, 1, 5, SHADE); px(c, 10, 8, 1, 5, SHADE);
  px(c, -13, 14, 1, 1, CREAM); px(c, 15, 14, 1, 1, CREAM);
  // lights
  px(c, -7, 6, 1, 1, CREAM); px(c, 7, 6, 1, 1, CREAM);
}

export class HeliSprites {
  constructor() {
    const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
    this.right = mk(); drawSide(this.right.getContext('2d'));
    this.left = mk(); const lc = this.left.getContext('2d'); lc.translate(W, 0); lc.scale(-1, 1); lc.drawImage(this.right, 0, 0);
    // mirrored sprite is offset by (W - 2*OX) pixels: shift so the origin pixel stays at OX
    const shifted = mk(); const sc = shifted.getContext('2d'); sc.drawImage(this.left, 2 * OX - W, 0); this.left = shifted;
    this.mid = mk(); drawFront(this.mid.getContext('2d'));
  }
  /** view: -1 left, 0 front, 1 right */
  get(view) { return view < 0 ? this.left : (view > 0 ? this.right : this.mid); }
  /** Mast top (hub) in sprite pixels relative to origin, per view. */
  hub(view) { return view === 0 ? [0, -17] : [0, -15]; }
}

/** Little pixel hat sprites are drawn with fillRect at runtime (see renderer). */
export const COLORS = { CREAM, SHADE, DARK };
