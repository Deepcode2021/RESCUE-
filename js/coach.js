// Onboarding: a skippable guided tutorial and context-sensitive hints, plus plain-language explanations of failures.
// DOM-free (takes the world and a settings object), so every rule is testable in Node.
// Hints only describe what the actual rescue rules allow: grab radius/speed come from survivors.js, drop-off from inDropZone().
import { GRAB_R, GRAB_SPEED, S } from './survivors.js';
import { SEG_MAX } from './rope.js';

const M = (u) => Math.round(u / 10);            // world units -> the "metres" shown on the HUD (10 u = 1 m)

const keys = (touch, kb, tc) => (touch ? tc : kb);

/** The player's nearest survivor that can still be hooked (waiting or falling). */
export function nearestSurvivor(world) {
  let best = null, bd = Infinity;
  for (const s of world.survivors) {
    if (s.state !== S.WAITING && s.state !== S.FALLING) continue;
    const d = Math.abs(s.x - world.heli.x);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------ tutorial
// Each step reads real world state; nothing is faked. `mark` tells the renderer what to point at.
const STEPS = [
  {
    id: 'lift', mark: null,
    text: (t) => keys(t, 'HOLD W (OR SPACE) TO LIFT OFF', 'HOLD ▲ TO LIFT OFF'),
    done: (c) => c.world.heli.y < c.st.y0 - 60,
  },
  {
    id: 'steer', mark: 'survivor',
    text: (t) => keys(t, 'TILT WITH A / D (OR ARROWS) TO FLY TO THE MARKED SURVIVOR. S DESCENDS. ARROWS AT THE SCREEN EDGE POINT TO THEM.', 'USE ◀ ▶ TO FLY TO THE MARKED SURVIVOR. ▼ DESCENDS. ARROWS AT THE SCREEN EDGE POINT TO THEM.'),
    done: (c) => !!c.target && Math.abs(c.world.heli.x - c.target.x) < 260,
  },
  {
    id: 'rope', mark: 'survivor',
    text: (t) => keys(t, 'THE ROPE IS ADJUSTABLE: HOLD E TO LET IT OUT, Q TO REEL IT IN.', 'THE ROPE IS ADJUSTABLE: ROPE ▼ LETS IT OUT, ROPE ▲ REELS IT IN.'),
    done: (c) => c.st.ropeMoved >= 40,
  },
  {
    id: 'hook', mark: 'survivor',
    text: () => 'HOVER THE HOOK OVER THE SURVIVOR AND MOVE SLOWLY. THE RING SHOWS THE GRAB RANGE; IT TURNS RED IF YOU ARE TOO FAST.',
    done: (c) => c.world.riders.length > 0 || c.world.rescuedCount > 0,
  },
  {
    id: 'extract', mark: 'pad',
    text: () => 'THEY CLIMB THE ROPE BY THEMSELVES. FLY BACK TO THE SAFE ZONE AND LOWER THEM TOWARD THE PAD UNTIL THEY HOP OFF.',
    done: (c) => c.world.rescuedCount > 0,
  },
  {
    id: 'done', mark: null, timed: 5,
    text: () => 'RESCUED! A ROPE CARRIES UP TO 3 AT ONCE. THE STORM ARRIVES SOON, SO KEEP GOING.',
    done: () => false,
  },
];
export const TUTORIAL_STEPS = STEPS.length;

// ------------------------------------------------------------------------------------------ context hints
// Each rule: when(c) -> bool, evaluated while the situation holds for `hold` seconds. `max` caps lifetime shows.
const HINTS = [
  { id: 'lift', hold: 4, text: (t) => keys(t, 'HOLD W (OR SPACE) TO LIFT OFF', 'HOLD ▲ TO LIFT OFF'),
    when: (c) => c.world.heli.onGround && c.world.time > 4 && c.world.riders.length === 0 && c.world.rescuedCount === 0 },
  { id: 'steer', hold: 5, text: (t) => keys(t, 'TILT WITH A / D TO FLY TOWARD THE SURVIVORS. ARROWS AT THE SCREEN EDGE SHOW WHERE THEY ARE.', 'USE ◀ ▶ TO FLY TOWARD THE SURVIVORS. ARROWS AT THE SCREEN EDGE SHOW WHERE THEY ARE.'),
    when: (c) => !c.world.heli.onGround && c.world.riders.length === 0 && c.near && Math.abs(c.near.x - c.world.heli.x) > 500 && Math.abs(c.world.heli.vx) < 25 && c.world.time > 8 },
  { id: 'ropeShort', hold: 2, text: (t, c) => (c.ropeMax
      ? 'THE HOOK IS TOO HIGH. DESCEND TO REACH THEM.'
      : keys(t, 'THE HOOK IS TOO HIGH. HOLD E TO LET THE ROPE OUT, OR DESCEND WITH S.', 'THE HOOK IS TOO HIGH. HOLD ROPE ▼ TO LET IT OUT, OR DESCEND WITH ▼.')),
    when: (c) => c.world.riders.length < 3 && c.near && Math.abs(c.near.x - c.world.heli.x) < 150 && c.hookGap > 90 && c.speed < 70 },
  { id: 'ropeLong', hold: 2.5, text: (t) => keys(t, 'THE HOOK IS BELOW THEM. REEL THE ROPE IN WITH Q, OR RISE WITH W.', 'THE HOOK IS BELOW THEM. HOLD ROPE ▲ TO REEL IT IN, OR RISE WITH ▲.'),
    when: (c) => c.world.riders.length < 3 && c.near && Math.abs(c.near.x - c.world.heli.x) < 120 && c.hookGap < -70 && c.speed < 70 },
  { id: 'extract', hold: 4, text: (t, c) => `FLY TO THE SAFE ZONE (${c.padDx < 0 ? '◀' : '▶'} ${M(Math.abs(c.padDx))} m AWAY) AND LOWER THEM TOWARD THE PAD.`,
    when: (c) => c.world.riders.length > 0 && Math.abs(c.padDx) > 260 },
  { id: 'lowerIn', hold: 2.5, text: (t) => keys(t, 'LOWER THE ROPE UNTIL THEIR FEET ARE CLOSE TO THE PAD (E, OR DESCEND WITH S). EVERYONE ON THE ROPE HOPS OFF TOGETHER.', 'LOWER THE ROPE UNTIL THEIR FEET ARE CLOSE TO THE PAD (ROPE ▼ OR ▼). EVERYONE ON THE ROPE HOPS OFF TOGETHER.'),
    when: (c) => c.world.riders.length > 0 && c.riderOverPad && !c.riderLowEnough && c.speed < 90 },
  { id: 'moreRiders', hold: 1, text: () => 'YOU HAVE ROOM: THE ROPE CARRIES UP TO 3. HOOK ANOTHER SURVIVOR BEFORE HEADING BACK.',
    when: (c) => c.world.riders.length === 1 && c.world.canGrab() && c.near && Math.abs(c.near.x - c.world.heli.x) < 700 },
];
const HINT_GAP = 9, HINT_SHOW = 6.5, HINT_COOLDOWN = 35, HINT_LIFETIME_CAP = 3;

export class Coach {
  /** store: the persistent settings object (storage.data): uses hints, tutorialDone, hintSeen. */
  constructor(store) {
    this.store = store;
    this.tut = null;          // tutorial state while active
    this.reset();
  }

  reset() {
    this.hold = {};           // hint id -> seconds the condition has held
    this.cool = {};           // hint id -> session cooldown
    this.gap = 3;             // seconds before the next hint may appear
    this.showT = 0;
    this.lastLen = 0;
    this.current = null;      // {id, text}
  }

  get hintsOn() { return this.store.hints !== false; }
  get tutorialActive() { return !!this.tut; }
  get tutorialProgress() { return this.tut ? { step: this.tut.i, total: STEPS.length } : null; }

  startTutorial(world) {
    this.reset();
    this.tut = { i: 0, st: { y0: world.heli.y, ropeMoved: 0 }, target: null, doneT: 0, startT: world.time };
    this.lastLen = world.rope.length();
    this.tut.target = nearestSurvivor(world);
  }

  /** Leave the tutorial (completed or skipped). Remembers that it was seen, so it never auto-starts again. */
  endTutorial() {
    this.tut = null;
    this.store.tutorialDone = true;
    this.current = null;
  }

  /**
   * Called every rendered frame while PLAYING.
   * While the tutorial runs the storm is held back (tornado, gust fronts) and the mission clock is extended so
   * practising never costs the player. Returns what the UI should show: {kind, text, mark, markX, markY, step, total} or null.
   */
  update(world, dt, touch, events = []) {
    this.tickRope(world);
    if (this.tut) return this.updateTutorial(world, dt, touch);
    if (!this.hintsOn) { this.current = null; return null; }
    return this.updateHints(world, dt, touch, events);
  }

  tickRope(world) {
    const len = world.rope.length();
    if (this.tut) this.tut.st.ropeMoved += Math.abs(len - this.lastLen);
    this.lastLen = len;
  }

  updateTutorial(world, dt, touch) {
    const t = this.tut;
    // keep the storm away and the clock fair while practising
    const tn = world.tornado;
    if (tn.appearT < world.time + 25) { tn.appearT = world.time + 25; tn.warnT = world.time + 19; }
    if (world.nextSquall < world.time + 30) world.nextSquall = world.time + 30;
    world.cfg.timeLimit += dt;
    if (!t.target || (t.target.state !== S.WAITING && t.target.state !== S.FALLING)) t.target = nearestSurvivor(world);
    if (world.ended || world.heli.crashed) { this.endTutorial(); return null; }
    const step = STEPS[t.i];
    const c = { world, st: t.st, target: t.target };
    if (step.timed) {
      t.doneT += dt;
      if (t.doneT >= step.timed) { this.endTutorial(); return null; }
    } else if (step.done(c)) {
      t.i++; t.doneT = 0;
      if (STEPS[t.i].id === 'steer' || STEPS[t.i].id === 'rope' || STEPS[t.i].id === 'hook') { /* target persists */ }
      if (t.i >= STEPS.length) { this.endTutorial(); return null; }
    }
    const cur = STEPS[t.i];
    let mark = null, mx = 0, my = 0;
    if (cur.mark === 'survivor' && t.target) { mark = 'survivor'; mx = t.target.x; my = t.target.y; }
    else if (cur.mark === 'pad') { mark = 'pad'; mx = world.terrain.pad.cx; my = world.terrain.pad.y; }
    return { kind: 'tutorial', id: cur.id, text: cur.text(touch), mark, markX: mx, markY: my, step: t.i + 1, total: STEPS.length };
  }

  context(world) {
    const h = world.heli, r = world.rope, n = r.n;
    const near = nearestSurvivor(world), pad = world.terrain.pad;
    const hookY = r.y[n - 1];
    const c = {
      world, near,
      speed: Math.hypot(h.vx, h.vy),
      hookGap: near ? (near.y - 16) - hookY : 0,       // >0: the hook is above their chest
      ropeMax: r.length() >= (n - 1) * SEG_MAX * 0.97,
      padDx: pad.cx - h.x,
      riderOverPad: false, riderLowEnough: false,
    };
    for (const s of world.riders) {
      if (s.x > pad.x0 + 8 && s.x < pad.x1 - 8) { c.riderOverPad = true; if (s.inDropZone(world.terrain)) c.riderLowEnough = true; }
    }
    return c;
  }

  updateHints(world, dt, touch, events) {
    // transient, event-driven hint: the hook touched someone but was too fast to catch them
    let forced = null;
    for (const e of events) if (e.type === 'grab_fast' && this.canShow('tooFast')) forced = { id: 'tooFast', forced: true, text: 'TOO FAST TO CATCH THEM. SLOW THE HOOK DOWN AND TRY AGAIN.' };
    if (this.showT > 0) { this.showT -= dt; if (this.showT <= 0) this.current = null; }
    for (const id in this.cool) if (this.cool[id] > 0) this.cool[id] -= dt;
    this.gap -= dt;
    if (world.ended || world.heli.crashed) { this.current = null; return null; }
    const c = this.context(world);
    let pick = forced;
    for (const hnt of HINTS) {
      if (hnt.when(c)) this.hold[hnt.id] = (this.hold[hnt.id] || 0) + dt; else this.hold[hnt.id] = 0;
      if (!pick && this.hold[hnt.id] >= hnt.hold && this.canShow(hnt.id)) pick = { id: hnt.id, text: hnt.text(touch, c) };
    }
    if (pick && (this.gap <= 0 || pick.forced) && (!this.current || pick.id !== this.current.id)) {
      this.current = pick; this.showT = HINT_SHOW; this.gap = HINT_GAP;
      this.cool[pick.id] = HINT_COOLDOWN;
      const seen = this.store.hintSeen || (this.store.hintSeen = {});
      seen[pick.id] = (seen[pick.id] | 0) + 1;
      this.hold[pick.id] = 0;
      return { kind: 'hint', id: pick.id, text: pick.text, fresh: true };
    }
    return this.current ? { kind: 'hint', id: this.current.id, text: this.current.text, fresh: false } : null;
  }

  canShow(id) {
    const seen = this.store.hintSeen || {};
    return (seen[id] | 0) < HINT_LIFETIME_CAP && !(this.cool[id] > 0);
  }
}

// ------------------------------------------------------------------------------------------ explanations
const LOSS = {
  tornado: { banner: 'LOST TO THE TORNADO', why: 'was pulled into the tornado. Keep the rope and riders well away from the funnel.' },
  splat: { banner: 'LOST: LONG FALL', why: 'fell too far onto hard ground. Keep riders low when you slow down, and lower them gently.' },
  blown: { banner: 'BLOWN OFF THE MAP', why: 'was blown off the edge of the world by the wind.' },
  drowned: { banner: 'LOST TO THE SEA', why: 'was lost to the rising water. Rescue the low rocks and streets first.' },
  blades: { banner: 'SHREDDED! KEEP THE ROTORS AWAY', why: 'was hit by the rotor blades. Hover beside a survivor, never into them, and keep the rotor disc clear.' },
  crushed: { banner: 'SQUISHED! SLOW DOWN NEAR PEOPLE', why: 'was hit by the helicopter body at speed.' },
};
const DROP = {
  slipped: 'lost their grip (Hard mode). Fly smoothly, avoid dragging the rope over rock and stay clear of the tornado.',
  crash: 'fell when the helicopter crashed.',
};
const CRASH = {
  water: 'The helicopter touched the water. It cannot swim, so stay above the rising sea.',
  terrain: 'The helicopter hit the ground or a wall too hard. Slow down near terrain and land gently.',
  tornado: 'The tornado tore the helicopter apart. Keep clear of the funnel.',
};

export function lossBanner(cause) { return (LOSS[cause] || { banner: 'SURVIVOR LOST' }).banner; }
export function crashText(reason, fuelOut) {
  if (fuelOut) return 'The engine ran dry. Hover low over the SAFE ZONE to refuel before the tank empties.';
  return CRASH[reason] || 'The helicopter crashed.';
}

/** Plain-language debrief lines for the results screen, built only from what actually happened (world.incidents). */
export function buildDebrief(world) {
  const lines = [];
  const id = (s) => `SURVIVOR ${s + 1}`;
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  for (const e of world.incidents) {
    if (e.kind === 'lost') lines.push(`${fmt(e.t)}  ${id(e.id)} ${(LOSS[e.cause] || { why: 'was lost.' }).why}`);
    else if (e.kind === 'dropped' && e.cause !== 'crash') lines.push(`${fmt(e.t)}  ${id(e.id)} ${(DROP[e.cause] || 'fell from the rope.')}`);
    else if (e.kind === 'near') lines.push(`${fmt(e.t)}  So close: ${id(e.id)} was only ${M(e.dist)} m from the safe zone.`);
    else if (e.kind === 'crash') lines.push(`${fmt(e.t)}  ${crashText(e.cause, e.fuelOut)}`);
    else if (e.kind === 'fuel') lines.push(`${fmt(e.t)}  ${crashText('', true)}`);
  }
  if (world.endReason === 'storm') lines.push('Time ran out: the storm won. Carry more than one survivor at a time to save minutes.');
  return lines;
}
