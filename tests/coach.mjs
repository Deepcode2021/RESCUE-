// Phase 1 (first five minutes): tutorial progression, storm hold, context hints, near-miss / too-fast feedback,
// debrief text, legacy-save handling and Game integration (with stubbed DOM). Run: node tests/coach.mjs
import { World } from '../js/world.js';
import { S, GRAB_R, GRAB_SPEED } from '../js/survivors.js';
import { STEP } from '../js/constants.js';
import { Coach, buildDebrief, lossBanner, crashText, TUTORIAL_STEPS } from '../js/coach.js';

let pass = 0, fail = 0;
function check(name, cond, info = '') { if (cond) { pass++; console.log('PASS', name, info); } else { fail++; console.log('FAIL', name, info); } }
const IN = { x: 0, lift: 0, ropeToggle: false, ropeAdj: 0 };
const quiet = (w) => { w.nextSquall = 1e9; w.escalate = false; w.nextLightning = 1e9; };
const newStore = () => ({ hints: true, tutorialDone: false, hintSeen: {} });
// teleport helicopter AND snap the rope under it (a swept rope would otherwise splat survivors)
const goto = (w, x, y) => { w.heli.x = x; w.heli.y = y; w.heli.vx = w.heli.vy = 0; w.heli.onGround = false; const r = w.rope; for (let i = 0; i < r.n; i++) { r.x[i] = r.px[i] = x; r.y[i] = r.py[i] = y + i * r.seg; } };
function run(w, coach, secs, inp = IN, evs = []) { let last = null; for (let i = 0; i < secs * 60; i++) { w.step(STEP, typeof inp === 'function' ? inp(w) : inp); last = coach.update(w, STEP, false, evs) || last; w.events.length = 0; } return last; }

// ---------------------------------------------------------------- 1. tutorial progression driven by the real simulation
{
  const w = new World(); w.reset(0, 'easy'); quiet(w);
  const store = newStore(), coach = new Coach(store);
  coach.startTutorial(w);
  let info = coach.update(w, STEP, false);
  check('tutorial starts on step 1 (lift off) with no pointer', info.kind === 'tutorial' && info.id === 'lift' && info.step === 1 && info.total === TUTORIAL_STEPS && !info.mark, info.text);
  check('touch text differs from keyboard text', coach.update(w, STEP, true).text !== info.text);
  run(w, coach, 3);
  check('doing nothing does not advance the tutorial', coach.tutorialProgress.step === 0);
  run(w, coach, 6, { x: 0, lift: 1, ropeAdj: 0 });
  check('lifting off advances to step 2 (steer) and points at a survivor', coach.tutorialActive && coach.update(w, STEP, false).id === 'steer' && coach.update(w, STEP, false).mark === 'survivor', `y=${w.heli.y.toFixed(0)}`);
  const sv = coach.tut.target; check('the pointer target is a real waiting survivor', sv && sv.state === S.WAITING);
  goto(w, sv.x - 200, sv.y - 160);
  run(w, coach, 0.5, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  check('flying within 26 m of the survivor advances to step 3 (rope)', coach.update(w, STEP, false).id === 'rope');
  run(w, coach, 3, { x: 0, lift: 0.3, ropeAdj: 1 });
  check('letting the rope out advances to step 4 (hook)', coach.update(w, STEP, false).id === 'hook', `moved=${coach.tut.st.ropeMoved.toFixed(0)}`);
  // hook them for real
  const hold = (ww) => { goto(ww, sv.x, sv.y - 16 - ww.rope.length() + 4); return IN; };
  run(w, coach, 12, hold);
  check('hooking a survivor advances to step 5 (extract) and points at the pad', w.riders.length === 1 && coach.update(w, STEP, false).id === 'extract' && coach.update(w, STEP, false).mark === 'pad', `riders=${w.riders.length}`);
  const pad = w.terrain.pad;
  // lower the rider (not the helicopter) toward the pad, the way a player would
  run(w, coach, 25, (ww) => { const rd = ww.riders[0]; const y = rd ? ww.heli.y + Math.max(-3, Math.min(3, pad.y - 40 - rd.y)) : ww.heli.y; goto(ww, pad.cx, y); return IN; });
  check('delivering advances to the final step, then ends by itself', w.rescuedCount === 1 && coach.update(w, STEP, false) !== undefined, `rescued=${w.rescuedCount}`);
  run(w, coach, 6, (ww) => { ww.heli.vx = ww.heli.vy = 0; return IN; });
  check('tutorial finishes, is remembered and returns no more tutorial info', !coach.tutorialActive && store.tutorialDone === true);
}

// ---------------------------------------------------------------- 2. the storm is held back and the clock is fair while practising
{
  const w = new World(); w.reset(0, 'easy'); w.escalate = false;
  const store = newStore(), coach = new Coach(store);
  const at0 = w.tornado.appearT, limit0 = w.cfg.timeLimit;
  coach.startTutorial(w);
  run(w, coach, 40, { x: 0, lift: 0.2, ropeAdj: 0 });
  check('tornado never appears while the tutorial runs (original schedule was ' + at0.toFixed(0) + ' s)', !w.tornado.active && w.tornado.appearT >= w.time + 24, `t=${w.time.toFixed(0)} appearT=${w.tornado.appearT.toFixed(0)}`);
  check('mission clock is extended by the practice time', w.cfg.timeLimit > limit0 + 35, `${limit0} -> ${w.cfg.timeLimit.toFixed(0)}`);
  check('no gust front during the tutorial', w.nextSquall >= w.time + 29);
  coach.endTutorial();
  run(w, coach, 30, IN);
  check('after the tutorial the tornado still arrives (about 25 s later)', w.tornado.active || w.tornado.appearT < w.time + 1, `appearT=${w.tornado.appearT.toFixed(0)} t=${w.time.toFixed(0)}`);
}

// ---------------------------------------------------------------- 3. context hints
{
  const w = new World(); w.reset(0, 'normal'); quiet(w);
  const store = newStore(), coach = new Coach(store);
  let info = run(w, coach, 12);
  check('sitting on the pad shows the lift hint, with the real key', info && info.id === 'lift' && /W/.test(info.text), info && info.text);
  check('the hint is counted for the lifetime cap', store.hintSeen.lift === 1);
  const info2 = run(w, coach, 30);
  check('the same hint does not repeat within its cooldown', !info2 || info2.id !== 'lift' || !info2.fresh);
  // hints disabled
  const w2 = new World(); w2.reset(0, 'normal'); quiet(w2);
  const off = new Coach({ hints: false, hintSeen: {} });
  check('hints off: no hints at all', run(w2, off, 20) == null);
  // lifetime cap
  const w3 = new World(); w3.reset(0, 'normal'); quiet(w3);
  const capped = new Coach({ hints: true, hintSeen: { lift: 3 } });
  const r3 = run(w3, capped, 20);
  check('lifetime cap reached: the hint no longer appears', !r3 || r3.id !== 'lift');
  // legacy store without the new keys behaves like defaults
  const w4 = new World(); w4.reset(0, 'normal'); quiet(w4);
  const legacy = new Coach({ plays: 5, bests: {} });
  const r4 = run(w4, legacy, 12);
  check('older save data (no hint keys) still works and hints default ON', legacy.hintsOn && r4 && r4.id === 'lift');
}
{
  // hook too high above a survivor -> says so; truthfulness: absent when the hook is within reach
  const mk = () => { const w = new World(); w.reset(0, 'normal'); quiet(w); w.survivors.forEach((s, i) => { s.x = w.terrain.ledges[i].x; s.y = w.terrain.ledges[i].y; }); return w; };
  const w = mk(), coach = new Coach(newStore());
  const s = w.survivors[0];
  const hover = (ww) => { goto(ww, s.x, s.y - 16 - ww.rope.length() - 160); return IN; };
  const info = run(w, coach, 8, hover);
  check('hook well above a survivor: tells the player to lower the rope', info && info.id === 'ropeShort' && /E/.test(info.text), info && info.text);
  const w2 = mk(), c2 = new Coach(newStore());
  const s2 = w2.survivors[0];
  const info2 = run(w2, c2, 8, (ww) => { goto(ww, s2.x + 5, s2.y - 16 - ww.rope.length() + 10); return IN; });
  check('hook within reach: no "too high" hint (hints never lie)', !info2 || info2.id !== 'ropeShort', info2 && info2.id);
  // rope at max -> only suggests descending
  const w3 = mk(), c3 = new Coach(newStore());
  for (let i = 0; i < 400; i++) { w3.rope.adjust(1, STEP); }
  const s3 = w3.survivors[0];
  const info3 = run(w3, c3, 8, (ww) => { goto(ww, s3.x, s3.y - 16 - ww.rope.length() - 160); return IN; });
  check('rope already at maximum: hint only suggests descending', info3 && info3.id === 'ropeShort' && !/E TO LET/.test(info3.text), info3 && info3.text);
}
{
  // extraction hint: uses the real distance to the pad
  const w = new World(); w.reset(0, 'normal'); quiet(w);
  const s = w.survivors[0]; s.x = w.terrain.ledges[0].x; s.y = w.terrain.ledges[0].y;
  const coach = new Coach(newStore());
  const fresh = [], orig = coach.update.bind(coach);
  coach.update = (...a) => { const r = orig(...a); if (r && r.fresh) fresh.push({ ...r, dist: Math.round(Math.abs(w.terrain.pad.cx - w.heli.x) / 10) }); return r; };
  run(w, coach, 12, (ww) => { goto(ww, s.x, s.y - 16 - ww.rope.length() + 4); return IN; });
  check('rider aboard (setup)', w.riders.length === 1);
  run(w, coach, 12, (ww) => { ww.heli.vx = ww.heli.vy = 0; ww.heli.y = Math.min(ww.heli.y, ww.terrain.heightAt(ww.heli.x) - 300); return IN; });
  const ex = fresh.find((h) => h.id === 'extract');
  check('rider aboard and far from the pad: extraction hint quotes the true distance', ex && ex.text.includes(`${ex.dist} m`), ex && `${ex.text} (true ${ex.dist} m)`);
}

// ---------------------------------------------------------------- 4. too-fast and near-miss feedback
{
  const w = new World(); w.reset(0, 'normal'); quiet(w);
  const s = w.survivors[0], r = w.rope, h = r.n - 1;
  r.x[h] = s.x; r.y[h] = s.y - 16; r.hookVX = GRAB_SPEED + 200; r.hookVY = 0;
  const ok1 = s.tryGrab(r, w);
  const n1 = w.events.filter((e) => e.type === 'grab_fast').length;
  const ok2 = s.tryGrab(r, w);
  const n2 = w.events.filter((e) => e.type === 'grab_fast').length;
  check('hook too fast: no grab, one "grab_fast" event, rate-limited', !ok1 && !ok2 && n1 === 1 && n2 === 1 && s.state === S.WAITING);
  r.hookVX = 0; w.fastCd = 0;
  check('slow hook still grabs normally (rules unchanged)', s.tryGrab(r, w) && s.state === S.ATTACHED && w.rings.length === 1);
  const c = new Coach(newStore());
  const w2 = new World(); w2.reset(0, 'normal'); quiet(w2);
  const info = c.update(w2, STEP, false, [{ type: 'grab_fast' }]);
  check('grab_fast event triggers the "too fast" hint', info && info.id === 'tooFast' && /SLOW/.test(info.text), info && info.text);
}
{
  const w = new World(); w.reset(0, 'normal'); quiet(w);
  const pad = w.terrain.pad;
  const kill = (sv, x, cause) => { sv.x = x; sv.y = w.terrain.heightAt(x); w.events.length = 0; sv.lose(w, cause); return w.events.filter((e) => e.type === 'near_miss'); };
  const a = kill(w.survivors[0], pad.x1 + 100, 'splat');
  check('dying 10 m beside the safe zone emits a near-miss with the real distance', a.length === 1 && Math.abs(a[0].dist - 100) < 1, JSON.stringify(a.map((e) => Math.round(e.dist))));
  const b = kill(w.survivors[1], pad.x1 + 600, 'splat');
  check('dying far from the zone is not a near miss', b.length === 0);
  const c = kill(w.survivors[2], pad.x1 + 100, 'tornado');
  check('tornado deaths are not near misses', c.length === 0);
  check('near misses are recorded for the debrief', w.nearMisses === 1 && w.incidents.some((e) => e.kind === 'near'));
}

// ---------------------------------------------------------------- 5. explanations
{
  const w = new World(); w.reset(0, 'normal'); quiet(w);
  const pad = w.terrain.pad;
  w.survivors[0].x = pad.x1 + 90; w.survivors[0].y = w.terrain.heightAt(pad.x1 + 90); w.survivors[0].lose(w, 'splat');
  w.survivors[1].lose(w, 'tornado');
  w.heli.crashed = true; w.heli.crashReason = 'water'; w.step(STEP, IN);
  const lines = buildDebrief(w);
  check('debrief explains each loss, the near miss and the crash in plain language', lines.length >= 4 && lines.some((l) => /fell too far/.test(l)) && lines.some((l) => /tornado/.test(l)) && lines.some((l) => /m from the safe zone/.test(l)) && lines.some((l) => /cannot swim/.test(l)), lines.join(' | '));
  check('banners name the cause', lossBanner('drowned') === 'LOST TO THE SEA' && /ROTORS/.test(lossBanner('blades')) && lossBanner('nope') === 'SURVIVOR LOST');
  check('crash text covers fuel, water, terrain', /ran dry/.test(crashText('terrain', true)) && /water/.test(crashText('water')) && /too hard/.test(crashText('terrain')));
  const w2 = new World(); w2.reset(0, 'normal'); w2.endReason = 'storm';
  check('time-out explained', buildDebrief(w2).some((l) => /storm won/.test(l)));
}

// ---------------------------------------------------------------- 6. storage defaults for older saves
{
  globalThis.localStorage = { getItem: () => JSON.stringify({ plays: 5, bests: { 'pass:normal': { score: 400, rescued: 3 } }, storyUnlocked: 3 }), setItem() {} };
  const { storage } = await import('../js/storage.js');
  storage.load();
  const d = storage.data;
  check('legacy save keeps its progress and gains onboarding defaults', d.plays === 5 && d.storyUnlocked === 3 && d.bests['pass:normal'].score === 400 && d.hints === true && d.tutorialDone === false && typeof d.hintSeen === 'object' && d.diffChosen === false);
}

// ---------------------------------------------------------------- 7. Game integration with a stubbed DOM
{
  const noop = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : () => {}) });
  globalThis.document = { body: { classList: { contains: () => false } }, querySelectorAll: () => [] };
  const { Game, STATE } = await import('../js/game.js');
  const { storage } = await import('../js/storage.js');
  const mkGame = (data) => { Object.assign(storage.data, { plays: 0, mission: 0, difficulty: 'normal', tutorialDone: false, hints: true, hintSeen: {}, diffChosen: false }, data); storage.save = () => {}; return new Game({ renderer: noop, ui: noop, audio: noop, input: { enabled: false, clear() {}, poll: () => IN, usedTouch: false } }); };
  let g = mkGame({});
  check('brand-new pilot: default difficulty is EASY', g.diff === 'easy');
  g.startFree();
  check('brand-new pilot: first mission starts the tutorial on Easy', g.coach.tutorialActive && g.world.cfg.diffKey === 'easy' && g.mission === 0 && g.state === STATE.PLAYING);
  g.skipTutorial();
  check('skipping ends the tutorial and remembers it', !g.coach.tutorialActive && storage.data.tutorialDone === true);
  g.restart();
  check('restart after skipping does not bring the tutorial back', !g.coach.tutorialActive);
  g.replayTutorial();
  check('replay tutorial restarts Mountain Pass with the tutorial', g.coach.tutorialActive && g.mission === 0);
  g.restart();
  check('restarting during the tutorial restarts the tutorial', g.coach.tutorialActive);
  g.toggleHints();
  check('hints can be switched off and the setting is stored', storage.data.hints === false);
  g.toggleHints();
  check('and back on', storage.data.hints === true);
  g = mkGame({ plays: 7, difficulty: 'hard', diffChosen: true });
  check('returning player keeps their saved difficulty', g.diff === 'hard');
  g.mission = 0; g.startFree();
  check('returning player: no automatic tutorial', !g.coach.tutorialActive && g.world.cfg.diffKey === 'hard');
  g = mkGame({ hints: false });
  g.startFree();
  check('hints off: no automatic tutorial for a new pilot', !g.coach.tutorialActive);
  g = mkGame({ difficulty: 'hard', diffChosen: true });
  g.replayTutorial();
  check('tutorial replay never overwrites the saved difficulty/mission', storage.data.difficulty === 'hard' && g.diff === 'hard' && g.world.cfg.diffKey === 'easy');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
