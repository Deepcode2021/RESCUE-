// Full headless mission with the autopilot. Run: node tests/mission.mjs [level] [maxSeconds]
import { World } from '../js/world.js';
import { Bot } from './bot.mjs';
import { S } from '../js/survivors.js';
import { STEP } from '../js/constants.js';

const level = +(process.argv[2] || 0), maxT = +(process.argv[3] || 220);
const w = new World(); w.reset(level, process.argv[4] || 'normal');
const bot = new Bot();
let maxStretch = 1, log = [];
for (let i = 0; i < maxT / STEP && !w.ended; i++) {
  w.step(STEP, bot.control(w));
  maxStretch = Math.max(maxStretch, w.rope.stretchRatio());
  for (const e of w.events) {
    if (['grab','rescued','lost','dropped','knocked','heli_crash','tornado_warning','tornado_appear'].includes(e.type))
      log.push(`${w.time.toFixed(1)}s ${e.type}${e.s ? ' #' + e.s.id : ''}${e.cause ? ' ' + e.cause : ''}${e.reason ? ' ' + e.reason : ''}${e.points ? ' +' + e.points : ''}`);
  }
  w.events.length = 0;
}
console.log(log.join('\n'));
const r = w.report();
console.log(`\nended=${w.ended} reason=${w.endReason} t=${w.time.toFixed(1)} rescued=${r.rescued}/${r.total} lost=${r.lost} score=${r.score} success=${r.success} maxRopeStretch=${maxStretch.toFixed(3)}`);
console.log('msg:', r.message);
console.log('survivor states:', w.survivors.map(s => s.state).join(', '));
