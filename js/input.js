// Keyboard + touch/pointer input. Produces a smoothed analog sample {x, lift, ropeToggle} for the simulation.
import { approach } from './utils.js';

const GAME_KEYS = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyQ', 'KeyR', 'KeyP', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, up: false, down: false, ropeIn: false, ropeOut: false };
    this.sample = { x: 0, lift: 0, ropeToggle: false, ropeAdj: 0 };
    this.onPause = null; this.onRestart = null; this.onAnyKey = null; this.onEnter = null;
    this.enabled = false;       // true only while PLAYING (so keys don't scroll or act on menus)
    this.usedTouch = false;
  }

  attach(touchRoot) {
    window.addEventListener('keydown', (e) => {
      if (this.onAnyKey) this.onAnyKey();
      if (e.code === 'Enter' && this.onEnter) { this.onEnter(e); return; }
      if (!GAME_KEYS.has(e.code)) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat && this.onPause) this.onPause(); return; }
      if (e.code === 'KeyR') { if (!e.repeat && this.onRestart) this.onRestart(); return; }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());

    if (touchRoot) {
      touchRoot.querySelectorAll('[data-hold]').forEach((btn) => {
        const k = btn.dataset.hold;
        const set = (v) => { this.touch[k] = v; btn.classList.toggle('down', v); };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.usedTouch = true; btn.setPointerCapture(e.pointerId); set(true); if (this.onAnyKey) this.onAnyKey(); });
        const up = (e) => { e.preventDefault(); set(false); };
        btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', () => set(false));
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    }
    // never scroll / zoom the page while playing
    document.addEventListener('touchmove', (e) => { if (this.enabled) e.preventDefault(); }, { passive: false });
  }

  clear() {
    this.keys.clear();
    for (const k in this.touch) this.touch[k] = false;
    document.querySelectorAll('[data-hold].down').forEach((b) => b.classList.remove('down'));
    this.sample.x = 0; this.sample.lift = 0; this.sample.ropeToggle = false; this.sample.ropeAdj = 0;
  }

  /** Advance smoothing by dt and return the shared sample object. */
  poll(dt) {
    const k = this.keys, t = this.touch, s = this.sample;
    const left = k.has('KeyA') || k.has('ArrowLeft') || t.left;
    const right = k.has('KeyD') || k.has('ArrowRight') || t.right;
    const up = k.has('KeyW') || k.has('ArrowUp') || k.has('Space') || t.up;
    const down = k.has('KeyS') || k.has('ArrowDown') || t.down;
    s.ropeAdj = ((k.has('KeyE') || t.ropeOut) ? 1 : 0) - ((k.has('KeyQ') || t.ropeIn) ? 1 : 0);
    const tx = (right ? 1 : 0) - (left ? 1 : 0);
    const tl = up ? 1 : (down ? -1 : 0);
    s.x = approach(s.x, tx, 7 * dt);
    s.lift = approach(s.lift, tl, (tl === 0 ? 9 : 5) * dt);
    return s;
  }
}
