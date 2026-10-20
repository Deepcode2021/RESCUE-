// Headless simulation tests for the DOM-free world. Run: node tests/sim.mjs
import { World } from '../js/world.js';
import { S } from '../js/survivors.js';
import { STEP } from '../js/constants.js';

let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) { pass++; console.log('PASS', name, info); }
  else { fail++; console.log('FAIL', name, info); }
}
const idle = () => ({ x: 0, lift: 0, ropeToggle: false });
function run(w, secs, inputFn) {
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) { w.step(STEP, inputFn ? inputFn(w, i) : idle()); }
}

// --- 1. Gravity & inertia: lift off, release controls, helicopter keeps drifting ---
{
  const w = new World();
  w.tornado.appearT = 9999; w.tornado.warnT = 9999;
  w.wind.intensity = 0; // isolate control response
  run(w, 1.2, () => ({ x: 0, lift: 1, ropeToggle: false }));
  check('heli lifts off pad with W', w.heli.y < w.terrain.pad.y - 60, `y=${w.heli.y.toFixed(0)}`);
  run(w, 1.0, () => ({ x: 1, lift: 0.2, ropeToggle: false }));
  const vxHeld = w.heli.vx;
  run(w, 0.15, idle);
  check('inertia: speed persists right after releasing controls', w.heli.vx > vxHeld * 0.6 && w.heli.vx > 50, `vx ${vxHeld.toFixed(0)} -> ${w.heli.vx.toFixed(0)}`);
  run(w, 1.5, idle);               // let upward momentum bleed off first
  const y0 = w.heli.y;
  run(w, 2.0, idle);
  check('gravity: idle helicopter eventually sinks', w.heli.y > y0 + 10, `y ${y0.toFixed(0)} -> ${w.heli.y.toFixed(0)}`);
}

// --- 2. Rope: swings, stays connected, never explodes ---
{
  const w = new World();
  w.tornado.appearT = 9999; w.tornado.warnT = 9999;
  run(w, 1.2, () => ({ x: 0, lift: 1, ropeToggle: false }));
  let maxStretch = 1, finite = true;
  let hookX0 = w.rope.hookX() - w.heli.x;
  let maxSwing = 0;
  for (let i = 0; i < 360; i++) {
    const dir = Math.floor(i / 60) % 2 ? -1 : 1;           // violent side-to-side flying
    w.step(STEP, { x: dir, lift: 0.4, ropeToggle: false });
    maxStretch = Math.max(maxStretch, w.rope.stretchRatio());
    maxSwing = Math.max(maxSwing, Math.abs(w.rope.hookX() - w.heli.x));
    for (let k = 0; k < w.rope.n; k++) if (!Number.isFinite(w.rope.x[k]) || !Number.isFinite(w.rope.y[k])) finite = false;
  }
  check('rope swings relative to helicopter', maxSwing > 40, `max hook lateral offset ${maxSwing.toFixed(0)}`);
  check('rope stays finite (no explosion)', finite);
  check('rope length stays near constant', maxStretch < 1.25, `max stretch ${maxStretch.toFixed(3)}`);
  // continues to move after heli stops
  const before = w.rope.hookX() - w.heli.x;
  run(w, 0.3, idle);
  check('rope keeps moving after input stops', Math.abs((w.rope.hookX() - w.heli.x) - before) > 1);
  // segments connected
  let worst = 0;
  for (let k = 0; k < w.rope.n - 1; k++) worst = Math.max(worst, Math.abs(Math.hypot(w.rope.x[k + 1] - w.rope.x[k], w.rope.y[k + 1] - w.rope.y[k]) - w.rope.seg));
  check('rope segments remain connected', worst < w.rope.seg * 0.8, `worst segment error ${worst.toFixed(2)}`);
}

// --- 3. Survivors: terrain collision, rope knock-off ---
{
  const w = new World();
  w.tornado.appearT = 9999; w.tornado.warnT = 9999;
  run(w, 2.0, idle);
  const s = w.survivors[0];
  check('survivor rests on ledge (terrain collision)', s.state === S.WAITING && Math.abs(s.y - w.terrain.heightAt(s.x)) < 1.5, `y=${s.y.toFixed(1)} ground=${w.terrain.heightAt(s.x).toFixed(1)}`);
  check('survivor stays put in normal wind', Math.abs(s.x - w.terrain.ledges[0].x) < 3);
  // sweep the dangling hook through the survivor (heli pinned on a straight path)
  const hy = s.y - 16 - 19 * 11 - 30 + 120;
  w.heli.x = s.x - 90; w.heli.y = hy; w.heli.vx = w.heli.vy = 0; w.heli.angle = 0;
  w.rope.reset(w.heli.x, w.heli.y + 30);
  let knocked = false;
  for (let i = 0; i < 120; i++) {
    w.heli.y = hy; w.heli.vy = 0; w.heli.vx = (i > 15 && i < 70) ? 300 : 0;
    w.step(STEP, { x: 0, lift: 0.3, ropeToggle: false });
    if (s.state !== S.WAITING) knocked = true;
  }
  check('rope impact knocks survivor off the ledge', knocked || Math.abs(s.x - w.terrain.ledges[0].x) > 5, `state=${s.state} dx=${(s.x - w.terrain.ledges[0].x).toFixed(0)}`);
  if (knocked) {
    run(w, 6, idle);
    check('knocked survivor ends in a valid terminal/resting state', [S.LOST, S.WAITING, S.RESCUED].includes(s.state), s.state);
  }
}

// --- 4. Tornado affects objects ---
{
  const w = new World();
  w.time = 90; w.tornado.update(0.016, 90, w.terrain);
  const f = { ax: 0, ay: 0, f: 0 };
  w.tornado.forceAt(w.tornado.x + 200, w.tornado.cy, f, 1);
  check('tornado produces force near it', Math.hypot(f.ax, f.ay) > 100, `|a|=${Math.hypot(f.ax, f.ay).toFixed(0)}`);
  w.tornado.forceAt(w.tornado.x + 5000, w.tornado.cy, f, 1);
  check('tornado force is zero far away', Math.hypot(f.ax, f.ay) === 0);
  // put a survivor into the funnel and watch it get lifted and lost, not teleported
  w.tornado.x = 2000; w.tornado.update(0.016, 60, w.terrain);
  const s = w.survivors[2];
  s.x = w.tornado.x + 70; s.y = w.terrain.heightAt(s.x); s.vx = s.vy = 0;
  const y00 = s.y; let maxRise = 0;
  let maxJump = 0, px = s.x, py = s.y;
  let t = 90;
  for (let i = 0; i < 600 && s.state !== S.LOST; i++) {
    t += STEP; w.time = t;
    w.tornado.update(STEP, t, w.terrain);
    s.update(STEP, w);
    maxJump = Math.max(maxJump, Math.hypot(s.x - px, s.y - py)); px = s.x; py = s.y;
    maxRise = Math.max(maxRise, y00 - s.y);
  }
  check('tornado lifts a survivor off the ground', maxRise > 80, `max rise ${maxRise.toFixed(0)}`);
  check('tornado flings survivor to a loss, with continuous motion', s.state === S.LOST && maxJump < 25, `state=${s.state} cause=${s.cause} maxStep=${maxJump.toFixed(1)}`);
}

// --- 5. State machine exclusivity ---
{
  const w = new World();
  const s = w.survivors[0];
  s.setState(S.FALLING); w.deliver(s);
  check('rescued survivor cannot also be lost', s.state === S.RESCUED && (s.lose(w, 'splat'), s.state === S.RESCUED));
  const s2 = w.survivors[1];
  s2.lose(w, 'splat');
  check('lost survivor cannot be rescued', (w.deliver(s2), s2.state === S.LOST));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
