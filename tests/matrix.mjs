// Runs the autopilot on every mission x difficulty and prints a summary table. Run: node tests/matrix.mjs
import { World } from '../js/world.js';
import { Bot } from './bot.mjs';
import { MISSIONS, DIFF_ORDER } from '../js/missions.js';
import { STEP } from '../js/constants.js';

const only = process.argv[2] !== undefined ? +process.argv[2] : null;
console.log('mission'.padEnd(16), 'diff'.padEnd(7), 'result'.padEnd(34), 'time  score  fuelEnd  stretch');
for (let m = 0; m < MISSIONS.length; m++) {
  if (only !== null && m !== only) continue;
  for (const d of DIFF_ORDER) {
    const w = new World(); w.reset(m, d);
    const bot = new Bot();
    let maxStretch = 1, nan = false;
    for (let i = 0; i < (w.cfg.timeLimit + 5) / STEP && !w.ended; i++) {
      w.step(STEP, bot.control(w));
      if ((i & 15) === 0) {
        maxStretch = Math.max(maxStretch, w.rope.stretchRatio());
        if (!Number.isFinite(w.heli.x + w.heli.y + w.rope.x[19])) { nan = true; break; }
      }
      w.events.length = 0;
    }
    const r = w.report();
    const res = `${r.rescued}/${r.total} ${w.endReason}${w.endReason === 'crash' ? '(' + w.heli.crashReason + ')' : ''} lost:${JSON.stringify(w.lostCauses).replace(/"|:0|,?\w+:0/g, '')}`.slice(0, 34);
    console.log(MISSIONS[m].name.padEnd(16), d.padEnd(7), res.padEnd(34), String(Math.round(w.time)).padStart(4), String(r.score).padStart(6), String(Math.round(w.fuel)).padStart(6), ' ', maxStretch.toFixed(2), nan ? 'NaN!' : '');
  }
}
