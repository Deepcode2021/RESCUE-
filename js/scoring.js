// Scoring and medals. Pure functions of a run summary: nothing here touches the simulation, so it cannot change gameplay.
//
// SCORE  = rescues + clean pickups + convoy + speed + flawless + fuel   (every part is >= 0, so the total can never be negative)
//   rescue    100 per survivor delivered                          x difficulty multiplier (0.75 / 1 / 1.5)
//   clean      50 per delivered survivor who was never dropped    x multiplier
//   convoy     40 x (n-1) when n riders are delivered together    x multiplier        (accrued live by the world)
//   speed      2 per second under the par time (40 s per survivor + 20 s) x multiplier
//              ONLY when everyone is rescued and the helicopter did not crash. Maximum 2 x par x multiplier.
//   flawless  250 when everyone is rescued, nobody was ever dropped, and the helicopter did not crash   x multiplier
//   fuel      0.8 per % of fuel left (max 80), fuel missions only, everyone rescued, no crash           x multiplier
// Losing survivors or crashing is never subtracted: it simply forfeits those points and the bonuses above.
// A faster run only earns extra if it is also a clean, complete rescue, so reckless speed is never rewarded.

export const RESCUE_PTS = 100, CLEAN_PTS = 50, FLAWLESS_PTS = 250, SPEED_PER_SEC = 2, FUEL_PER_PCT = 0.8;

// MEDALS (provisional thresholds: not yet validated by human playtesting)
export const MEDAL = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3 };
export const MEDAL_NAMES = ['NO MEDAL', 'BRONZE', 'SILVER', 'GOLD'];
export const MEDAL_STARS = ['☆☆☆', '★☆☆', '★★☆', '★★★'];   // shape + name, never colour alone
export const GOLD_TIME_FRACTION = 0.8;     // PROVISIONAL: Gold needs to finish within 80% of the mission's time limit

const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export const medalName = (m) => MEDAL_NAMES[m] || MEDAL_NAMES[0];

/** Snapshot of a finished (or running) mission, taken from the world. Plain data. */
export function summarize(world) {
  const total = world.total;
  const duration = fin(world.ended ? world.endTime : world.time);
  const rescuedSv = world.survivors.filter((s) => s.state === 'RESCUED');
  const crashed = world.endReason === 'crash' || !!world.heli.crashed;
  return {
    total, rescued: world.rescuedCount,
    lost: world.lostCount,
    remaining: world.survivors.filter((s) => s.active).length,
    cleanRescues: rescuedSv.filter((s) => !s.dropped).length,
    convoyBonus: world.convoyBonus,
    duration, parTime: world.cfg.parTime, timeLimit: world.cfg.timeLimit, mult: world.cfg.scoreMult,
    crashed, endReason: world.endReason,
    hasFuel: !!world.cfg.fuel, fuelPct: fin(world.fuel),
  };
}

/** Score breakdown. Returns { parts: [{id, label, detail, points}], total }. */
export function computeScore(run) {
  const m = fin(run.mult, 1);
  const total = Math.max(0, Math.floor(fin(run.total))), rescued = Math.min(total, Math.max(0, Math.floor(fin(run.rescued))));
  const clean = Math.min(rescued, Math.max(0, Math.floor(fin(run.cleanRescues))));
  const all = total > 0 && rescued === total;
  const intact = all && !run.crashed;
  const parts = [];
  const add = (id, label, detail, points) => parts.push({ id, label, detail, points: Math.max(0, Math.round(fin(points))) });
  add('rescue', 'Survivors rescued', `${rescued} x ${Math.round(RESCUE_PTS * m)}`, rescued * Math.round(RESCUE_PTS * m));
  add('clean', 'Clean pickups (never dropped)', `${clean} x ${Math.round(CLEAN_PTS * m)}`, clean * Math.round(CLEAN_PTS * m));
  add('convoy', 'Convoy bonus', 'several riders delivered together', run.convoyBonus);
  if (intact) {
    const secs = Math.max(0, fin(run.parTime) - fin(run.duration));
    add('speed', 'Speed bonus', `${Math.floor(secs)} s under par (${fmt(run.parTime)})`, secs * SPEED_PER_SEC * m);
    if (clean === total) add('flawless', 'Flawless bonus', 'everyone rescued, nobody dropped, no crash', FLAWLESS_PTS * m);
    if (run.hasFuel) add('fuel', 'Fuel efficiency', `${Math.round(fin(run.fuelPct))}% fuel left`, Math.min(100, Math.max(0, fin(run.fuelPct))) * FUEL_PER_PCT * m);
  }
  const sum = parts.reduce((a, p) => a + p.points, 0);
  return { parts, total: Math.max(0, Math.round(sum)) };
}

/** Did the mission count as completed? (same rule the game always used) */
export function isSuccess(run) {
  const half = Math.ceil(run.total / 2);
  return (run.rescued >= half && !run.crashed) || (run.total > 0 && run.rescued === run.total);
}

/** The requirement checklist for each medal tier, with met/unmet for this run. */
export function medalTiers(run) {
  const half = Math.ceil(run.total / 2);
  const all = run.total > 0 && run.rescued === run.total;
  const goldTime = run.timeLimit * GOLD_TIME_FRACTION;
  const clean = all && run.cleanRescues === run.total;
  return [
    { medal: MEDAL.BRONZE, reqs: [
      { text: `Rescue at least ${half} of ${run.total}`, met: run.rescued >= half },
      { text: 'Do not crash before everyone is saved', met: !run.crashed || all },
    ] },
    { medal: MEDAL.SILVER, reqs: [
      { text: `Rescue all ${run.total}`, met: all },
      { text: 'Bring the helicopter home intact', met: !run.crashed },
    ] },
    { medal: MEDAL.GOLD, reqs: [
      { text: 'Never drop a survivor', met: clean },
      { text: `Finish within ${fmt(goldTime)} (80% of the time limit)`, met: all && run.duration <= goldTime },
    ] },
  ];
}

/** Medal earned by a run (0 = none) plus the checklist and the first tier not yet reached. */
export function evaluateMedal(run) {
  const tiers = medalTiers(run);
  let medal = MEDAL.NONE;
  for (const t of tiers) { if (t.reqs.every((r) => r.met)) medal = t.medal; else break; }
  const nextTier = medal >= MEDAL.GOLD ? null : tiers[medal];          // tiers[0] = bronze, so tiers[medal] is the next one up
  return { medal, tiers, next: nextTier };
}

/** Static requirement text for the mission briefing (no run yet). */
export function medalGoals(cfg) {
  const total = cfg.total, half = Math.ceil(total / 2);
  return [
    { medal: MEDAL.BRONZE, text: `Rescue at least ${half} of ${total} without crashing first` },
    { medal: MEDAL.SILVER, text: `Rescue all ${total} and keep the helicopter intact` },
    { medal: MEDAL.GOLD, text: `Silver, plus never drop a survivor, within ${fmt(cfg.timeLimit * GOLD_TIME_FRACTION)}` },
  ];
}
