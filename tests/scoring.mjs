// Phase 2 (medals, personal bests, results): score formula, medal tiers, record rules, save migration and Game integration.
// Run: node tests/scoring.mjs
import { World } from '../js/world.js';
import { S } from '../js/survivors.js';
import { MISSIONS, buildConfig } from '../js/missions.js';
import { computeScore, evaluateMedal, medalGoals, isSuccess, MEDAL, MEDAL_STARS, GOLD_TIME_FRACTION } from '../js/scoring.js';
import { applyRun, cleanRecord, migrateSave, SAVE_VERSION } from '../js/records.js';

let pass = 0, fail = 0;
function check(name, cond, info = '') { if (cond) { pass++; console.log('PASS', name, info); } else { fail++; console.log('FAIL', name, info); } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const part = (bd, id) => (bd.parts.find((p) => p.id === id) || { points: 0 }).points;

// a plain run summary (what summarize() produces), defaults = a clean, fast-enough Normal run of a 3-survivor mission without fuel
const mk = (o = {}) => ({ total: 3, rescued: 3, lost: 0, remaining: 0, cleanRescues: 3, convoyBonus: 0, duration: 100, parTime: 140, timeLimit: 210, mult: 1,
  crashed: false, endReason: 'done', hasFuel: false, fuelPct: 0, ...o });

// ---------------------------------------------------------------- 1. score components
{
  const bd = computeScore(mk());
  check('rescue = 100 per survivor', part(bd, 'rescue') === 300);
  check('clean pickups = 50 per never-dropped survivor', part(bd, 'clean') === 150);
  check('speed = 2 per second under par (140-100 = 40 s)', part(bd, 'speed') === 80);
  check('flawless = 250', part(bd, 'flawless') === 250);
  check('no fuel line on a mission without fuel', !bd.parts.some((p) => p.id === 'fuel'));
  check('total is the sum of the visible parts (every component explained)', bd.total === bd.parts.reduce((a, p) => a + p.points, 0) && bd.total === 780, `total=${bd.total}`);
  check('every part has a label and a detail', bd.parts.every((p) => p.label && p.detail && p.id));
  const fuel = computeScore(mk({ hasFuel: true, fuelPct: 50 }));
  check('fuel efficiency = 0.8 per % left on fuel missions', part(fuel, 'fuel') === 40);
  const full = computeScore(mk({ hasFuel: true, fuelPct: 100 }));
  check('fuel bonus is capped at 80 x multiplier', part(full, 'fuel') === 80);
  check('fuel over 100% or below 0 is clamped', part(computeScore(mk({ hasFuel: true, fuelPct: 400 })), 'fuel') === 80 && part(computeScore(mk({ hasFuel: true, fuelPct: -20 })), 'fuel') === 0);
  const ez = computeScore(mk({ mult: 0.75 })).total, nm = computeScore(mk({ mult: 1 })).total, hd = computeScore(mk({ mult: 1.5 })).total;
  check('same run scores more on harder difficulties (x0.75 < x1 < x1.5)', ez < nm && nm < hd, `${ez} < ${nm} < ${hd}`);
  check('deterministic: same input, same breakdown', same(computeScore(mk()), computeScore(mk())));
  check('convoy bonus passes through unchanged', part(computeScore(mk({ convoyBonus: 80 })), 'convoy') === 80);
}

// ---------------------------------------------------------------- 2. score boundaries and no negatives
{
  check('duration exactly at par earns 0 speed (and is not negative)', part(computeScore(mk({ duration: 140 })), 'speed') === 0);
  check('slower than par never subtracts', part(computeScore(mk({ duration: 400 })), 'speed') === 0 && computeScore(mk({ duration: 400 })).total === 300 + 150 + 250);
  check('instant run is capped by par (max 2 x par)', part(computeScore(mk({ duration: 0 })), 'speed') === 280);
  const zero = computeScore(mk({ rescued: 0, cleanRescues: 0, lost: 3, remaining: 0 }));
  check('0 rescued scores exactly 0 (not negative)', zero.total === 0 && zero.parts.every((p) => p.points >= 0));
  const crash = computeScore(mk({ crashed: true, endReason: 'crash' }));
  check('crash after rescuing everyone forfeits speed/flawless/fuel but keeps rescue points', part(crash, 'speed') === 0 && part(crash, 'flawless') === 0 && crash.total === 450);
  const partial = computeScore(mk({ rescued: 2, cleanRescues: 2, lost: 1 }));
  check('partial rescue gets no speed/flawless bonus', partial.total === 300 && !partial.parts.some((p) => p.id === 'speed' || p.id === 'flawless'));
  const dropped = computeScore(mk({ cleanRescues: 2 }));
  check('a dropped-then-rescued survivor: no clean points, no flawless, speed still earned', part(dropped, 'clean') === 100 && part(dropped, 'flawless') === 0 && part(dropped, 'speed') === 80);
  const fastDirty = computeScore(mk({ duration: 20, cleanRescues: 1 })).total;
  const slowClean = computeScore(mk({ duration: 140 })).total;
  check('reckless speed is never rewarded over a careful clean run', slowClean > fastDirty, `clean/slow ${slowClean} > fast/3 drops ${fastDirty}`);
  const junk = [NaN, Infinity, -Infinity, -5, undefined, null, 'x'];
  let okJunk = true;
  for (const j of junk) for (const k of ['rescued', 'cleanRescues', 'convoyBonus', 'duration', 'parTime', 'mult', 'fuelPct', 'total']) {
    const s = computeScore(mk({ hasFuel: true, [k]: j }));
    if (!Number.isFinite(s.total) || s.total < 0 || s.parts.some((p) => !Number.isFinite(p.points) || p.points < 0)) { okJunk = false; console.log('  bad', k, j, s.total); }
  }
  check('invalid/NaN/negative inputs always give a finite score >= 0', okJunk);
  check('rescued > total or clean > rescued are clamped', computeScore(mk({ rescued: 9, cleanRescues: 9 })).total === computeScore(mk()).total);
}

// ---------------------------------------------------------------- 3. medals
{
  const med = (o) => evaluateMedal(mk(o)).medal;
  check('0 rescued = no medal', med({ rescued: 0, cleanRescues: 0 }) === MEDAL.NONE);
  check('1 of 3 rescued = no medal (below half)', med({ rescued: 1, cleanRescues: 1 }) === MEDAL.NONE);
  check('2 of 3 rescued (half rounded up) = bronze', med({ rescued: 2, cleanRescues: 2 }) === MEDAL.BRONZE);
  check('2 of 4 rescued = bronze, 1 of 4 = none', med({ total: 4, rescued: 2, cleanRescues: 2 }) === MEDAL.BRONZE && med({ total: 4, rescued: 1, cleanRescues: 1 }) === MEDAL.NONE);
  check('2 of 5 = none, 3 of 5 = bronze (ceil(5/2) = 3)', med({ total: 5, rescued: 2, cleanRescues: 2 }) === MEDAL.NONE && med({ total: 5, rescued: 3, cleanRescues: 3 }) === MEDAL.BRONZE);
  check('half rescued but the helicopter crashed = no medal', med({ rescued: 2, cleanRescues: 2, crashed: true, endReason: 'crash' }) === MEDAL.NONE);
  check('all rescued then crashed = bronze (completed, but not intact)', med({ crashed: true, endReason: 'crash' }) === MEDAL.BRONZE);
  check('all rescued, intact, but a survivor was dropped = silver', med({ cleanRescues: 2 }) === MEDAL.SILVER);
  check('all rescued, intact, clean but too slow = silver', med({ duration: 200 }) === MEDAL.SILVER);
  check('all rescued, intact, clean and fast = gold', med({ duration: 100 }) === MEDAL.GOLD);
  const gt = 210 * GOLD_TIME_FRACTION;
  check('gold time boundary: exactly 80% of the limit is gold, a hair over is silver', med({ duration: gt }) === MEDAL.GOLD && med({ duration: gt + 0.01 }) === MEDAL.SILVER, `limit ${gt}s`);
  check('time-out with survivors left = no medal', med({ rescued: 1, cleanRescues: 1, remaining: 2, endReason: 'storm' }) === MEDAL.NONE);
  check('stars differ by count, not colour: ☆☆☆ / ★☆☆ / ★★☆ / ★★★', same(MEDAL_STARS, ['☆☆☆', '★☆☆', '★★☆', '★★★']));
  // success and bronze are the same rule: a run is a completion exactly when it earns at least bronze
  let agree = true, n = 0;
  for (const total of [3, 4, 5]) for (let rescued = 0; rescued <= total; rescued++) for (const crashed of [false, true]) for (const dropped of [false, true]) {
    const r = mk({ total, rescued, cleanRescues: Math.max(0, rescued - (dropped ? 1 : 0)), crashed, endReason: crashed ? 'crash' : 'done' });
    n++; if (isSuccess(r) !== (evaluateMedal(r).medal > 0)) { agree = false; console.log('  disagree', r); }
  }
  check(`success <=> medal >= bronze over ${n} combinations (no medal for failed runs)`, agree);
  // next-medal explanation
  const ev0 = evaluateMedal(mk({ rescued: 1, cleanRescues: 1 }));
  check('no medal -> next is bronze with unmet requirements listed', ev0.next.medal === MEDAL.BRONZE && ev0.next.reqs.some((q) => !q.met));
  check('bronze -> next is silver', evaluateMedal(mk({ crashed: true, endReason: 'crash' })).next.medal === MEDAL.SILVER);
  const evS = evaluateMedal(mk({ duration: 200 }));
  check('silver -> next is gold, naming the time limit it missed', evS.next.medal === MEDAL.GOLD && evS.next.reqs.some((q) => !q.met && /Finish within 2:48/.test(q.text)), evS.next.reqs.map((q) => q.text).join(' | '));
  check('gold -> nothing further', evaluateMedal(mk()).next === null);
  const goals = medalGoals({ total: 4, timeLimit: 280 });
  check('briefing goals list all three tiers with the same thresholds', goals.length === 3 && /2 of 4/.test(goals[0].text) && /all 4/.test(goals[1].text) && /3:44/.test(goals[2].text), goals.map((g) => g.text).join(' | '));
  const tight = [];
  for (let i = 0; i < MISSIONS.length; i++) for (const d of ['easy', 'normal', 'hard']) { const c = buildConfig(i, d); if (c.timeLimit * GOLD_TIME_FRACTION < c.parTime) tight.push(`${MISSIONS[i].id}:${d}`); }
  console.log('INFO gold time is tighter than the par time on:', tight.join(', ') || 'none', '(documented as a balancing question; not asserted)');
  check('gold time threshold is positive and below the time limit everywhere', MISSIONS.every((_, i) => ['easy', 'normal', 'hard'].every((d) => { const c = buildConfig(i, d); return c.timeLimit * GOLD_TIME_FRACTION > 0 && c.timeLimit * GOLD_TIME_FRACTION < c.timeLimit; })));
}

// ---------------------------------------------------------------- 4. real World reports
const IN = { x: 0, lift: 0, ropeToggle: false, ropeAdj: 0 };
function deliver(w, i, dropped = false) { const s = w.survivors[i]; s.dropped = dropped; s.setState(S.ATTACHED); w.deliver(s); return s.state === S.RESCUED; }
function lose(w, i) { const s = w.survivors[i]; s.setState(S.FALLING); s.lose(w, 'splat'); return s.state === S.LOST; }
{
  const w = new World(); w.reset(0, 'normal'); w.escalate = false; w.nextSquall = 1e9;
  check('helper: survivors can be delivered through the real rules', deliver(w, 0) && deliver(w, 1) && w.rescuedCount === 2);
  w.time = 90; w.finish('done');
  const r = w.report();
  check('half rescued, nobody crashed: success + bronze', r.success && r.medal === MEDAL.BRONZE, `medal=${r.medal} lost=${r.lost} left=${r.remaining}`);
  check('report distinguishes lost from left-behind (one survivor is simply still waiting)', r.lost === 0 && r.remaining === 1 && r.rescued === 2);
  check('report base equals the live in-game score (rescue + clean + convoy parts)', r.base === w.score, `${r.base} vs ${w.score}`);
  check('report score = base + bonuses (none here: not everyone rescued)', r.score === r.base && r.timeBonus === 0 && r.perfectBonus === 0);
  check('report carries a breakdown that sums to the score', r.breakdown.reduce((a, p) => a + p.points, 0) === r.score);
  const before = JSON.stringify([w.score, w.time, w.rescuedCount, w.lostCount, w.heli.x, w.rnd()]);
  const again = w.report(); w.report();
  const after = JSON.stringify([w.score, w.time, w.rescuedCount, w.lostCount, w.heli.x, w.rnd()]);
  check('report() is pure: repeated calls give the same result and change nothing in the simulation', again.score === r.score && again.medal === r.medal && before.split(',').slice(0, 5).join() === after.split(',').slice(0, 5).join());
}
{
  const w = new World(); w.reset(0, 'normal'); w.escalate = false; w.nextSquall = 1e9;
  deliver(w, 0); deliver(w, 1); deliver(w, 2); w.time = 100; w.finish('done');
  const r = w.report();
  check('flawless fast clear = gold, perfect flag, score matches the formula', r.medal === MEDAL.GOLD && r.perfect && r.score === computeScore(mk({ duration: 100 })).total, `score=${r.score}`);
  check('legacy fields are still reported (timeBonus/perfectBonus/convoyBonus)', r.timeBonus === 80 && r.perfectBonus === 250 && r.convoyBonus === 0);
}
{
  const w = new World(); w.reset(0, 'hard'); w.escalate = false; w.nextSquall = 1e9;
  deliver(w, 0); deliver(w, 1, true); lose(w, 2); w.time = 120; w.finish('done');
  const r = w.report();
  check('hard run: one dropped, one lost: success, bronze, x1.5 applied, lost counted truthfully', r.success && r.lost === 1 && r.remaining === 0 && r.medal === MEDAL.BRONZE && r.score === Math.round(100 * 1.5) * 2 + Math.round(50 * 1.5), `score=${r.score} (2 rescues x 150 + 1 clean x 75)`);
}
{
  const w = new World(); w.reset(0, 'normal'); w.escalate = false; w.nextSquall = 1e9;
  deliver(w, 0); lose(w, 1); lose(w, 2); w.time = 80; w.finish('done');
  const r = w.report();
  check('failed run: no success, no medal, score is only what was earned (>= 0)', !r.success && r.medal === 0 && r.score === 150 && r.lost === 2);
}
{
  const w = new World(); w.reset(0, 'normal'); w.escalate = false; w.nextSquall = 1e9;
  deliver(w, 0); deliver(w, 1); deliver(w, 2); w.heli.crashed = true; w.time = 60; w.finish('crash');
  const r = w.report();
  check('crash after saving everyone: success but only bronze, no speed/flawless', r.success && r.medal === MEDAL.BRONZE && r.timeBonus === 0 && r.perfectBonus === 0 && !r.fullClear);
}
{
  const w = new World(); w.reset(0, 'normal'); const a = w.runId; w.reset(0, 'normal'); const b = w.runId;
  check('each started mission gets a new runId', b === a + 1);
  check('practice flag is off by default and reset every time', w.practice === false);
  w.practice = true; deliver(w, 0); deliver(w, 1); deliver(w, 2); w.time = 90; w.finish('done');
  const r = w.report();
  check('a practice run is flagged and never carries a medal', r.practice === true && r.medal === 0 && r.success === true);
  w.reset(0, 'normal'); check('reset clears the practice flag', w.practice === false);
}
{
  // every mission x difficulty produces a sane report in every end state
  let ok = true;
  for (let i = 0; i < MISSIONS.length; i++) for (const d of ['easy', 'normal', 'hard']) {
    const w = new World(); w.reset(i, d); w.escalate = false; w.nextSquall = 1e9;
    for (let k = 0; k < w.total; k++) deliver(w, k);
    w.time = 77; w.finish('done');
    const r = w.report();
    if (!(Number.isFinite(r.score) && r.score >= 0 && r.medal >= 1 && r.fullClear && r.lost === 0 && r.breakdown.length >= 3)) { ok = false; console.log('  bad', MISSIONS[i].id, d, r.score, r.medal); }
    const w2 = new World(); w2.reset(i, d); w2.time = 5; w2.finish('storm');
    const r2 = w2.report();
    if (!(r2.score === 0 && r2.medal === 0 && !r2.success && r2.remaining === w2.total)) { ok = false; console.log('  bad zero', MISSIONS[i].id, d); }
  }
  check(`all ${MISSIONS.length} missions x 3 difficulties report consistently (clear earns a medal, empty run scores 0)`, ok);
  const s1 = (() => { const w = new World(); w.reset(1, 'normal'); for (let k = 0; k < 3; k++) deliver(w, k); w.time = 90; w.finish('done'); return w.report().score; })();
  const s2 = (() => { const w = new World(); w.reset(1, 'normal'); for (let k = 0; k < 3; k++) deliver(w, k); w.time = 90; w.finish('done'); return w.report().score; })();
  check('scoring is consistent per mission and difficulty', s1 === s2);
  // a real flown run: the sim is untouched by Phase 2 (score only counts what happened)
  const w = new World(); w.reset(0, 'easy'); w.escalate = false; w.nextSquall = 1e9;
  for (let i = 0; i < 60 * 20; i++) { w.step(1 / 60, IN); w.events.length = 0; }
  const r = w.report(); check('an idle 20 s flight scores exactly 0 and earns nothing', r.score === 0 && r.medal === 0 && r.rescued === 0);
}

// ---------------------------------------------------------------- 5. personal-best record rules (pure)
{
  const run = (o) => ({ success: true, score: 500, rescued: 3, medal: MEDAL.SILVER, duration: 120, fullClear: true, ...o });
  let { rec, flags } = applyRun(null, run());
  check('first success on an empty record: score, medal, time, attempt and completion all set', rec.score === 500 && rec.medal === 2 && rec.bestTime === 120 && rec.attempts === 1 && rec.completions === 1 && rec.rescued === 3);
  check('first completion is flagged with new score, new medal and new time', flags.firstClear && flags.newScore && flags.newMedal && flags.newTime);
  const base = rec;
  ({ rec, flags } = applyRun(base, run({ score: 300, medal: MEDAL.BRONZE, duration: 150 })));
  check('a lower score, lower medal and slower time overwrite nothing', rec.score === 500 && rec.medal === 2 && rec.bestTime === 120 && !flags.newScore && !flags.newMedal && !flags.newTime);
  check('...but the attempt is still counted', rec.attempts === 2 && rec.completions === 2);
  ({ rec, flags } = applyRun(base, run({ score: 700, medal: MEDAL.GOLD, duration: 100 })));
  check('a better score, medal and time each update and are flagged', rec.score === 700 && rec.medal === 3 && rec.bestTime === 100 && flags.newScore && flags.newMedal && flags.newTime && !flags.firstClear);
  ({ rec, flags } = applyRun(base, run({ success: false, score: 800, rescued: 1, medal: 0, fullClear: false, duration: 30 })));
  check('a failed attempt never overwrites a success (even with a higher raw score or a shorter time)', rec.score === 500 && rec.medal === 2 && rec.bestTime === 120 && !flags.newScore && !flags.newTime);
  check('...failures only add an attempt', rec.attempts === 2 && rec.completions === 1);
  ({ rec } = applyRun(base, run({ score: 900, medal: MEDAL.BRONZE, fullClear: false, rescued: 2, duration: 40 })));
  check('a partial completion (half rescued) cannot set a best time, only a score', rec.bestTime === 120 && rec.score === 900 && rec.medal === 2);
  ({ rec } = applyRun(null, run({ score: 300, medal: MEDAL.BRONZE, fullClear: false, rescued: 2, duration: 40 })));
  check('a first partial completion has no best time at all', rec.bestTime === null && rec.medal === 1);
  ({ rec } = applyRun(null, run({ success: false, score: 150, rescued: 1, medal: 0, fullClear: false })));
  check('failure on an empty record keeps partial progress, but no medal, no time, no completion', rec.score === 150 && rec.medal === 0 && rec.bestTime === null && rec.completions === 0 && rec.attempts === 1 && rec.rescued === 1);
  const prev = Object.freeze({ ...base }); let mutated = false;
  try { applyRun(prev, run()); } catch (e) { mutated = true; }
  check('applyRun does not mutate the previous record', !mutated && same(prev, base));
  const bad = applyRun(null, { success: true, score: NaN, rescued: -4, medal: 99, duration: -1, fullClear: true }).rec;
  check('garbage run values are sanitised (no NaN, medal capped at 3, no negative time)', bad.score === 0 && bad.rescued === 0 && bad.medal === 3 && bad.bestTime === null);
  check('score 0 is never flagged as a new best', applyRun(null, run({ score: 0, medal: 0 })).flags.newScore === false);
}

// ---------------------------------------------------------------- 6. storage + migration (fresh module per case so defaults are real)
let modN = 0;
const mem = (initial) => { const m = { v: initial }; globalThis.localStorage = { getItem: () => m.v, setItem: (k, v) => { m.v = v; } }; return m; };
const freshStorage = async (raw) => { const m = mem(raw); const { storage } = await import(`../js/storage.js?case=${modN++}`); storage.load(); return { storage, m }; };
{
  const legacy = JSON.stringify({ plays: 9, mission: 3, difficulty: 'hard', storyUnlocked: 4, storyDone: false, storyChapter: 3, muted: true, bests: { 'pass:normal': { score: 400, rescued: 3 }, 'sea:easy': { score: 120, rescued: 1 } } });
  const { storage } = await freshStorage(legacy);
  const d = storage.data;
  check('old v1 save keeps all progress (plays, story, settings)', d.plays === 9 && d.storyUnlocked === 4 && d.storyChapter === 3 && d.muted === true && d.difficulty === 'hard' && d.mission === 3);
  const b = storage.bestFor('pass', 'normal');
  check('old best record is upgraded in place: score/rescued kept, new fields defaulted', b.score === 400 && b.rescued === 3 && b.medal === 0 && b.bestTime === null && b.attempts === 0 && b.completions === 0);
  check('both old records survive', storage.bestFor('sea', 'easy').score === 120);
  check('save is stamped with the new version', d.saveVersion === SAVE_VERSION);
  const out = storage.recordRun('pass', 'normal', { success: true, score: 450, rescued: 3, medal: 2, duration: 130, fullClear: true });
  check('first new-style run on an old record: keeps the old score as the floor, flags medal + time + score', out.rec.score === 450 && out.flags.newMedal && out.flags.newTime && out.flags.newScore);
  const low = storage.recordRun('pass', 'normal', { success: true, score: 100, rescued: 3, medal: 1, duration: 200, fullClear: true });
  check('and then a worse run overwrites nothing', low.rec.score === 450 && low.rec.medal === 2 && low.rec.bestTime === 130 && low.rec.attempts === 2);
  check('the story keys are untouched by recording', d.storyUnlocked === 4 && d.storyChapter === 3);
}
{
  const { storage, m } = await freshStorage(null);
  storage.recordRun('pass', 'normal', { success: true, score: 500, rescued: 3, medal: 3, duration: 100, fullClear: true });
  storage.recordRun('pass', 'hard', { success: true, score: 900, rescued: 3, medal: 1, duration: 150, fullClear: true });
  storage.recordRun('sea', 'normal', { success: false, score: 100, rescued: 1, medal: 0, duration: 60, fullClear: false });
  check('records are separate per difficulty', storage.bestFor('pass', 'normal').medal === 3 && storage.bestFor('pass', 'hard').medal === 1 && storage.bestFor('pass', 'easy').attempts === 0);
  check('records are separate per mission', storage.bestFor('sea', 'normal').score === 100 && storage.bestFor('sea', 'normal').medal === 0 && storage.bestFor('pass', 'normal').score === 500);
  check('a hard run does not lower or replace the normal record', storage.bestFor('pass', 'normal').score === 500 && storage.bestFor('pass', 'normal').attempts === 1);
  check('unplayed missions read as empty records, not errors', same(storage.bestFor('dubai', 'hard'), cleanRecord(null)) && storage.bestFor('dubai', 'hard').score === 0);
  const re = await freshStorage(m.v);
  check('records persist through a reload', same(re.storage.bestFor('pass', 'hard'), storage.bestFor('pass', 'hard')) && re.storage.bestFor('pass', 'normal').bestTime === 100);
  const again = re.storage.recordBest('pass', 'normal', 100, 1);
  check('legacy recordBest() still works and does not lower anything', again === false && re.storage.bestFor('pass', 'normal').score === 500);
}
{
  const cases = {
    'invalid JSON': '{not json',
    'JSON null': 'null',
    'JSON number': '5',
    'JSON array': '[1,2,3]',
    'bests is an array': JSON.stringify({ plays: 3, bests: [1, 2] }),
    'bests is null': JSON.stringify({ plays: 3, bests: null }),
    'bests is a string': JSON.stringify({ plays: 3, bests: 'oops' }),
    'records of wrong types': JSON.stringify({ plays: 3, bests: { 'pass:normal': 'x', 'sea:easy': 7, 'tall:hard': null, 'night:easy': [1] } }),
    'negative / NaN-ish / string numbers': JSON.stringify({ bests: { 'pass:normal': { score: -50, rescued: 'many', medal: -1, bestTime: -3, attempts: 'x', completions: 1e99 } } }),
    'medal out of range + time zero': JSON.stringify({ bests: { 'pass:normal': { score: 10, rescued: 1, medal: 99, bestTime: 0, attempts: 2.7, completions: 1.2 } } }),
  };
  for (const [name, raw] of Object.entries(cases)) {
    let threw = false, st;
    try { st = (await freshStorage(raw)).storage; } catch (e) { threw = true; }
    const b = !threw && Object.values(st.data.bests).every((r) => same(r, cleanRecord(r)) && r.medal >= 0 && r.medal <= 3 && r.score >= 0 && r.attempts >= 0 && (r.bestTime === null || r.bestTime > 0));
    const usable = !threw && st.bestFor('pass', 'normal') && typeof st.data.storyUnlocked === 'number' && st.data.storyUnlocked >= 1 && typeof st.data.bests === 'object' && !Array.isArray(st.data.bests);
    let canWrite = false;
    if (!threw) { st.recordRun('pass', 'normal', { success: true, score: 100, rescued: 3, medal: 1, duration: 90, fullClear: true }); canWrite = st.bestFor('pass', 'normal').score >= 100; }
    check(`malformed save "${name}": loads, sanitises, and still records`, !threw && b && usable && canWrite);
  }
  const keep = (await freshStorage(JSON.stringify({ plays: 3, storyUnlocked: 5, storyDone: true, bests: [1] }))).storage.data;
  check('a malformed bests object never erases story progress or counters', keep.plays === 3 && keep.storyUnlocked === 5 && keep.storyDone === true);
  const txt = (await freshStorage(JSON.stringify({ storyUnlocked: '4', plays: '7' }))).storage.data;
  check('numbers saved as text are recovered rather than reset (story unlock kept)', txt.storyUnlocked === 4 && txt.plays === 7);
  const neg = (await freshStorage(JSON.stringify({ storyUnlocked: -3, plays: NaN }))).storage.data;
  check('unusable numbers fall back to safe defaults', neg.storyUnlocked === 1 && neg.plays === 0);
  const once = migrateSave(JSON.parse(JSON.stringify({ bests: { 'a:b': { score: 5.9, rescued: 2 } }, plays: 2 })));
  const twice = migrateSave(JSON.parse(JSON.stringify(once)));
  check('migrateSave is idempotent', same(once, twice));
  check('migrateSave tolerates non-objects', migrateSave(null) === null && migrateSave(7) === 7 && migrateSave(undefined) === undefined);
  // storage fully blocked
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const { storage: blocked } = await import(`../js/storage.js?case=${modN++}`);
  let ok = true; try { blocked.load(); blocked.recordRun('pass', 'normal', { success: true, score: 1, rescued: 3, medal: 1, duration: 9, fullClear: true }); } catch (e) { ok = false; }
  check('blocked localStorage: load and recording do not throw, the session still has its records', ok && blocked.bestFor('pass', 'normal').score === 1);
}

// ---------------------------------------------------------------- 7. UI helper
{
  const { recordText } = await import('../js/ui.js');
  check('recordText: empty record -> empty string', recordText(cleanRecord(null)) === '');
  check('recordText: legacy record shows score and rescued only', recordText(cleanRecord({ score: 400, rescued: 3 })) === '400 pts · 3 rescued');
  const t = recordText(cleanRecord({ score: 700, rescued: 3, medal: 3, bestTime: 95, attempts: 4, completions: 2 }));
  check('recordText: full record shows medal (stars + name), best time, attempts', /★★★ GOLD/.test(t) && /1:35/.test(t) && /4 attempts/.test(t), t);
}

// ---------------------------------------------------------------- 8. Game integration (stubbed DOM)
{
  const shown = [];
  const ui = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : k === 'showResults' ? (r, o) => shown.push({ r, o }) : () => {}) });
  const noop = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : () => {}) });
  globalThis.document = { body: { classList: { contains: () => false } }, querySelectorAll: () => [] };
  const m = mem(null);
  const { Game, STATE } = await import('../js/game.js?p2');
  const { storage } = await import('../js/storage.js');   // the module the game imported
  storage.save = () => {};
  Object.assign(storage.data, { plays: 9, mission: 0, difficulty: 'normal', tutorialDone: true, hints: true, hintSeen: {}, diffChosen: true, bests: {}, storyUnlocked: 1, storyChapter: 0 });
  const mkGame = () => new Game({ renderer: noop, ui, audio: noop, input: { enabled: false, clear() {}, poll: () => IN, usedTouch: false } });
  const g = mkGame();
  const finishWith = (fn) => { g.world.escalate = false; g.world.nextSquall = 1e9; fn(g.world); g.finishMission(); return shown[shown.length - 1]; };
  const clear = (t = 100) => (w) => { for (let k = 0; k < w.total; k++) deliver(w, k); w.time = t; w.finish('done'); };

  g.mission = 0; g.diff = 'normal'; g.mode = 'free';
  g.start(0, 'normal', { tutorial: false });
  check('a normal start is not practice', g.world.practice === false);
  let out = finishWith(clear(100));
  let rec = storage.bestFor('pass', 'normal');
  check('first clear is recorded once: gold, best time, score, 1 attempt', rec.medal === 3 && rec.bestTime === 100 && rec.attempts === 1 && rec.completions === 1 && rec.score === out.r.score, JSON.stringify(rec));
  check('results get the record flags (first completion, new medal, new time, new score)', out.o.record.flags.firstClear && out.o.record.flags.newMedal && out.o.record.flags.newTime && out.o.newBest);
  check('results are for a success and the game state is MISSION_SUCCESS', g.state === STATE.SUCCESS && out.r.success);
  const n0 = shown.length;
  g.finishMission(); g.finishMission();
  rec = storage.bestFor('pass', 'normal');
  check('processing the same finished run again creates no duplicate record (attempts stay 1, no extra results screen)', rec.attempts === 1 && rec.completions === 1 && shown.length === n0);
  g.state = STATE.PLAYING; g.finishMission();
  check('...even if the state machine is poked back to PLAYING', storage.bestFor('pass', 'normal').attempts === 1);

  // retry = new run id: a worse run counts as an attempt but overwrites nothing
  g.restart();
  check('retry starts a new run (new id)', g.world.runId !== g._finishedRun);
  out = finishWith((w) => { deliver(w, 0); lose(w, 1); lose(w, 2); w.time = 70; w.finish('done'); });
  rec = storage.bestFor('pass', 'normal');
  check('retry that fails: attempts 2, but the earlier gold, time and score are intact', rec.attempts === 2 && rec.medal === 3 && rec.bestTime === 100 && rec.score > out.r.score && g.state === STATE.FAILED);
  check('failed run carries no medal and no record flags', out.r.medal === 0 && !out.o.record.flags.newScore && !out.o.record.flags.newMedal && !out.o.newBest);
  g.restart();
  out = finishWith(clear(120));
  rec = storage.bestFor('pass', 'normal');
  check('retry that succeeds slower keeps the faster time and gold, counts the attempt', rec.attempts === 3 && rec.bestTime === 100 && rec.medal === 3 && !out.o.record.flags.newTime);
  g.restart();
  out = finishWith(clear(60));
  check('retry that is faster updates the best time and flags it', storage.bestFor('pass', 'normal').bestTime === 60 && out.o.record.flags.newTime && out.o.record.flags.newScore);

  // difficulty separation through the Game
  g.diff = 'hard'; g.start(0, 'hard', { tutorial: false });
  finishWith(clear(150));
  check('the same mission on Hard is its own record (normal untouched)', storage.bestFor('pass', 'hard').attempts === 1 && storage.bestFor('pass', 'normal').attempts === 4);
  const info = (g.diff = 'normal', g.selectInfo());
  check('selectInfo exposes medals per difficulty and the medal goals for the briefing', info.medals.normal === 3 && info.medals.hard === 3 && info.medals.easy === 0 && info.goals.length === 3 && info.best.bestTime === 60);

  // tutorial / practice: nothing recorded, nothing unlocked
  const before = JSON.stringify(storage.data.bests);
  g.replayTutorial();
  check('tutorial run is marked practice and runs on Mountain Pass at Easy', g.world.practice === true && g.coach.tutorialActive && g.world.cfg.diffKey === 'easy');
  out = finishWith(clear(60));
  check('finishing the tutorial records nothing at all (no medal, no attempt, no score)', JSON.stringify(storage.data.bests) === before && out.o.record === null && out.r.medal === 0 && out.r.practice === true && !out.o.newBest);
  check('...and the pass:easy record stayed empty', storage.bestFor('pass', 'easy').attempts === 0 && storage.bestFor('pass', 'easy').score === 0);
  g.skipTutorial(); g.finishMission();
  check('skipping the tutorial mid-run does not turn it into a recorded run', JSON.stringify(storage.data.bests) === before);
  g.restart();
  check('restart after the tutorial is a real run again (not practice)', g.world.practice === false && !g.coach.tutorialActive);
  finishWith(clear(100));
  check('and that real run records under the saved difficulty (the tutorial never changed it)', g.world.cfg.diffKey === 'normal' && storage.bestFor('pass', 'normal').attempts === 5 && storage.bestFor('pass', 'easy').attempts === 0);

  // campaign: story shares the record store, unlock rules unchanged
  const unlockedBefore = storage.data.storyUnlocked;
  g.mode = 'story'; g.chapter = 0; g.diff = 'normal'; g.start(1, 'normal', { tutorial: false });
  out = finishWith(clear(100));
  check('story mission: records under the same mission+difficulty key (story and free play share records)', storage.bestFor('sea', 'normal').attempts === 1 && storage.bestFor('sea', 'normal').medal === 3);
  check('story progression is unchanged: success still unlocks the next chapter', storage.data.storyUnlocked === Math.max(unlockedBefore, 2) && storage.data.storyChapter === 1);
  g.chapter = 1; g.start(2, 'normal', { tutorial: false });
  const unl = storage.data.storyUnlocked;
  finishWith((w) => { deliver(w, 0); lose(w, 1); lose(w, 2); lose(w, 3); w.time = 50; w.finish('done'); });
  check('a failed story mission unlocks nothing and records an attempt only', storage.data.storyUnlocked === unl && storage.bestFor('tall', 'normal').attempts === 1 && storage.bestFor('tall', 'normal').medal === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
