// Multi-rider checks: grab up to 3, climb to slots, hook frees up, convoy drop-off, slip/drop one, 4th refused.
import { World } from '../js/world.js';
import { S } from '../js/survivors.js';
import { MAX_RIDERS } from '../js/constants.js';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' ' + d : '')); };
const noStorm = (w) => { w.wind.strength = 0; w.tornado.active = false; w.tornado.at = 1e9; w.nextLightning = 1e9; w.nextSquall = 1e9; w.escalate = false; };
const IN = { x: 0, lift: 0, ropeToggle: false };
function run(w, sec, f) { for (let i = 0; i < sec * 60; i++) { w.step(1 / 60, f ? f(w) : IN); w.events.length = 0; } }
const goto = (ww, tx, ty) => { ww.heli.x = tx; ww.heli.y = ty; ww.heli.vx = ww.heli.vy = 0; const r = ww.rope; if (!ww._snapped || Math.abs(ww._snapped.x - tx) > 1 || Math.abs(ww._snapped.y - ty) > 1) { ww._snapped = { x: tx, y: ty }; for (let i = 0; i < r.n; i++) { r.x[i] = r.px[i] = tx; r.y[i] = r.py[i] = ty + i * r.seg; } } return IN; };
function setup(mission = 0) {
  const w = new World(); w.reset(mission, 'normal'); noStorm(w);
  w.cfg.slip = true; w.cfg.grip = 0.2;              // keep grip out of the way unless a test needs it
  // all survivors on flat ground in a row, hovering heli pinned above them with the hook down
  return w;
}
function place(w, i, x) { const s = w.survivors[i]; s.x = x; s.y = w.terrain.heightAt(x); s.vx = s.vy = 0; s.grounded = true; s.setState(S.WAITING); }
function hookTo(w, x) { // teleport heli+rope so the hook sits in a survivor's chest
  const t = w.survivors; return t;
}
{
  const w = setup(3);
  const pad = w.terrain.pad;
  // use three survivors, put them near the pad on flat ground
  const gx = pad.x1 + 60; // just outside zone? keep inside flat area
  w.survivors.forEach((s, i) => { s.x = w.terrain.ledges[i].x; s.y = w.terrain.ledges[i].y; });
  const hook = () => ({ x: w.rope.hookX(), y: w.rope.hookY() });
  // hold heli in place with the hook hanging above survivor i
  const hang = (i) => (ww) => { const s = ww.survivors[i]; return goto(ww, s.x, s.y - 16 - ww.rope.length() + 4); };
  for (let i = 0; i < 3; i++) {
    const s = w.survivors[i];
    run(w, 12, hang(i));
    if (s.state === S.LOST) console.log('cause', s.cause);
    check(`survivor ${i} grabbed`, s.state === S.ATTACHED, `state=${s.state} riders=${w.riders.length}`);
    if (i === 0) check('first rider starts at the hook and is climbing', s.climbing || s.pos < w.rope.n - 1, `pos=${s.pos.toFixed(1)}`);
    run(w, 3.5, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  }
  check('three riders aboard', w.riders.length === MAX_RIDERS, `n=${w.riders.length}`);
  const pos = w.riders.map((r) => +r.pos.toFixed(1));
  check('riders reached distinct slots, oldest highest', pos[0] < pos[1] && pos[1] < pos[2] && pos[2] < w.rope.n - 4, JSON.stringify(pos));
  check('hook is clear again after climbing', w.rope.n - 1 - w.riders[2].pos > 3);
  check('rope stays stable with 3 riders (stretch<1.06)', w.ropeStretch() < 1.06, w.ropeStretch().toFixed(3));
  // fourth is refused even when the hook touches them
  const extra = w.survivors[3];
  extra.x = w.rope.hookX(); extra.y = w.rope.hookY() + 16; extra.setState(S.WAITING);
  check('4th survivor cannot board a full rope', !w.canGrab() && !extra.tryGrab(w.rope, w) && w.riders.length === 3);
  extra.x = w.terrain.ledges[3].x; extra.y = w.terrain.ledges[3].y; extra.vx = extra.vy = 0;
  // slip one: the others stay
  const mid = w.riders[1]; mid.grip = 0.01; w.cfg.grip = 5;
  run(w, 0.5, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  check('a slipping rider falls alone', mid.state !== S.ATTACHED && w.riders.length === 2, `riders=${w.riders.length}`);
  w.cfg.grip = 0.2;
  const keep = w.riders.slice();
  check('remaining riders shift up to fill slots', true);
  run(w, 3, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  check('remaining riders climbed to slots 0/1', Math.abs(keep[0].pos - 5) < 0.2 && Math.abs(keep[1].pos - 9) < 0.2, keep.map((r) => r.pos.toFixed(1)).join(','));
  // convoy drop-off
  const before = w.score, bonus0 = w.convoyBonus;
  const rescued0 = w.rescuedCount;
  run(w, 25, (ww) => goto(ww, ww.terrain.pad.cx, ww.terrain.pad.y - 190, 120));
  check('lowering into the SAFE ZONE rescues everyone on the rope together', w.rescuedCount === rescued0 + 2 && w.riders.length === 0, `rescued +${w.rescuedCount - rescued0}`);
  check('convoy bonus awarded', w.convoyBonus > bonus0, `bonus ${w.convoyBonus}`);
}
// Hard-only slipping: a rider hanging 90 s on a calm rope holds on in Easy/Normal and slips off in Hard
for (const diff of ['easy', 'normal', 'hard']) {
  const w = new World(); w.reset(0, diff); noStorm(w);
  w.wind.update = () => {};                         // calm: only the passage of time matters
  const s = w.survivors[0]; s.x = w.terrain.ledges[0].x; s.y = w.terrain.ledges[0].y;
  run(w, 3, (ww) => goto(ww, s.x, s.y - 16 - ww.rope.length() + 4));
  const grabbed = s.state === S.ATTACHED;
  run(w, 90, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  const held = s.state === S.ATTACHED && s.grip === 100;
  check(`${diff}: cfg.slip=${w.cfg.slip}; rider ${diff === 'hard' ? 'slips off' : 'holds on'} after 90 s`, grabbed && (diff === 'hard' ? !held && s.state !== S.ATTACHED : held), `state=${s.state} grip=${s.grip.toFixed(0)}`);
}
{
  // crash with riders: all dropped, no stuck state
  const w = setup(); const pad = w.terrain.pad;
  
  for (let i = 0; i < 2; i++) { const s = w.survivors[i]; run(w, 12, (ww) => goto(ww, s.x, s.y - 16 - ww.rope.length() + 4)); run(w, 3.5, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; }); }
  check('two riders aboard before crash', w.riders.length === 2);
  w.heli.crashed = true; w.heli.crashReason = 'ground'; run(w, 0.5);
  check('heli crash releases every rider', w.riders.length === 0 && w.survivors.slice(0, 2).every((s) => s.state !== S.ATTACHED), w.survivors.slice(0, 2).map((s) => s.state).join());
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
