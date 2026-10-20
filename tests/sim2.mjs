const IN2 = { x: 0, lift: 0, ropeToggle: false };
// Headless checks for the mission system and new hazards. Run: node tests/sim2.mjs
import { World } from '../js/world.js';
import { S } from '../js/survivors.js';
import { STEP } from '../js/constants.js';
import { MISSIONS, DIFF_ORDER, buildConfig } from '../js/missions.js';

let pass = 0, fail = 0;
function check(name, cond, info = '') { if (cond) { pass++; console.log('PASS', name, info); } else { fail++; console.log('FAIL', name, info); } }
const idle = { x: 0, lift: 0, ropeToggle: false };
function run(w, secs, input) { for (let i = 0, n = Math.round(secs / STEP); i < n; i++) w.step(STEP, typeof input === 'function' ? input(w) : (input || idle)); }
const noStorm = (w) => { w.tornado.appearT = 9999; w.tornado.warnT = 9999; w.nextSquall = 1e9; w.escalate = false; };

// --- 1. every mission x difficulty builds a sane, stable starting layout ---
{
  let bad = [];
  for (let m = 0; m < MISSIONS.length; m++) for (const d of DIFF_ORDER) {
    const w = new World(); w.reset(m, d); noStorm(w);
    const cfg = w.cfg;
    run(w, 3);
    const t = w.terrain;
    const tag = `${cfg.name}/${d}`;
    if (w.survivors.length !== cfg.total || t.ledges.length !== cfg.total) bad.push(tag + ' survivor count');
    for (const s of w.survivors) {
      if (s.state !== S.WAITING) bad.push(`${tag} survivor ${s.id} ${s.state}`);
      if (Math.abs(s.y - t.heightAt(s.x)) > 1.5) bad.push(`${tag} survivor ${s.id} not on ground`);
      if (t.isWaterAt(s.x)) bad.push(`${tag} survivor ${s.id} starts in water`);
    }
    if (w.heli.crashed || !w.heli.onGround) bad.push(tag + ' heli not resting on pad');
    if (t.isWaterAt(w.heli.x) || t.isWaterAt(t.pad.x0 + 10) || t.isWaterAt(t.pad.x1 - 10)) bad.push(tag + ' pad is water');
    const xs = w.survivors.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 150) bad.push(tag + ' survivors too close');
    if (xs[0] < t.pad.x1 + 120) bad.push(tag + ' survivor too close to pad');
  }
  check('all 6 missions x 3 difficulties: stable layout, survivors on ground, heli on deck', bad.length === 0, bad.slice(0, 4).join('; '));
}

// --- 2. static friction: wind alone never dislodges standing survivors (regression for the creeping bug) ---
for (const m of [0, 2, 7, 10]) {
  const w = new World(); w.reset(m, 'hard'); noStorm(w);
  let maxWind = 0, moved = 0;
  const x0 = w.survivors.map((s) => s.x);
  const hx = w.heli.x, hy = w.heli.y;
  for (let i = 0; i < 60 * 150; i++) {
    w.heli.x = hx; w.heli.y = hy; w.heli.vx = w.heli.vy = 0;       // pin the parked helicopter so its rope can't wander into survivors
    w.step(STEP, idle); maxWind = Math.max(maxWind, Math.abs(w.wind.x));
  }
  w.survivors.forEach((s, i) => { moved = Math.max(moved, Math.abs(s.x - x0[i])); });
  check(`wind alone cannot slide survivors (${MISSIONS[m].name} hard, 150 s, max wind ${maxWind.toFixed(0)})`, w.survivors.every((s) => s.state === S.WAITING) && moved < 1, `max drift ${moved.toFixed(2)}`);
}

// --- 3. tide: water rises at the configured rate, caps, floods low rocks, never the deck ---
{
  const w = new World(); w.reset(1, 'normal'); noStorm(w);
  const rate = w.cfg.tide.rate, cap = w.cfg.tide.max, base = w.terrain.waterBase;
  run(w, 40);
  check('tide rises at configured rate', Math.abs((base - w.terrain.waterY) - rate * 40) < 0.5, `rise ${(base - w.terrain.waterY).toFixed(1)} expected ${(rate * 40).toFixed(1)}`);
  const low = w.survivors.find((s) => s.y > base - 60);
  const tFlood = (base - low.y) / rate;          // seconds until the rising sea reaches the low survivor's feet
  run(w, tFlood - 40 - 4);
  check('low-rock survivor is still safe just before the sea reaches them', low.state === S.WAITING, `t=${w.time.toFixed(0)} (flood at ~${tFlood.toFixed(0)})`);
  run(w, 12);
  check('rising sea drowns the low-rock survivor', low.state === S.LOST && low.cause === 'drowned' && w.lostCauses.drowned === 1, `state=${low.state} cause=${low.cause}`);
  run(w, 150);
  check('tide caps at max and never floods the deck', Math.abs((base - w.terrain.waterY) - cap) < 0.01 && w.terrain.waterY > w.terrain.pad.y + 20, `rise ${(base - w.terrain.waterY).toFixed(1)}, deck ${(w.terrain.waterY - w.terrain.pad.y).toFixed(0)} above water`);
  check('high-rock survivors unaffected by tide', w.survivors.filter((s) => s !== low).every((s) => s.state === S.WAITING));
}

// --- 4. water kills: helicopter splash, falling survivor drowns ---
{
  const w = new World(); w.reset(1, 'normal'); noStorm(w);
  w.heli.x = 1400; w.heli.y = 1160; w.heli.vx = w.heli.vy = 0;       // skids reach ~1190; sea at 1200 -> bodies touch water
  run(w, 2, { x: 0, lift: -1, ropeToggle: false });
  check('helicopter touching the sea crashes (splash)', w.heli.crashed && w.heli.crashReason === 'water', `reason=${w.heli.crashReason}`);
  const w2 = new World(); w2.reset(1, 'normal'); noStorm(w2);
  const s = w2.survivors[0]; s.x = 1300; s.y = 900; s.vx = s.vy = 0; s.grounded = false; s.setState(S.FALLING);
  run(w2, 4);
  check('survivor falling into open water drowns', s.state === S.LOST && s.cause === 'drowned', `state=${s.state} cause=${s.cause}`);
}

// --- 5. fuel: burns, refuels on deck, flameout ---
{
  const w = new World(); w.reset(2, 'normal'); noStorm(w);
  const hover = (ww) => ({ x: 0, lift: Math.max(-1, Math.min(1, 0.12 + (ww.heli.y - 1000) * 0.01 - ww.heli.vy * 0.02)), ropeToggle: false });
  run(w, 3, { x: 0, lift: 1, ropeToggle: false });
  run(w, 30, hover);
  check('fuel burns while flying', w.fuel < 97 && w.fuel > 85, `fuel ${w.fuel.toFixed(1)} after ~33 s (tank ${w.cfg.fuel.seconds} s)`);
  w.fuel = 60; const f0 = w.fuel;
  run(w, 4, (ww) => { ww.heli.x = ww.terrain.pad.cx; ww.heli.y = ww.terrain.pad.y - 60; ww.heli.vx = ww.heli.vy = 0; return { x: 0, lift: 0.3, ropeToggle: false }; });
  check('hovering low over the SAFE ZONE refuels', w.fuel > f0 + 15 && w.refueling, `fuel ${f0.toFixed(0)} -> ${w.fuel.toFixed(0)} refueling=${w.refueling}`);
  w.heli.crashed = false; w.fuel = 0.05; w.heli.x = w.terrain.pad.cx; w.heli.y = 300; w.heli.vy = 0; w.heli.vx = 0;
  run(w, 3, { x: 0, lift: 1, ropeToggle: false });
  check('empty tank -> engine out, helicopter sinks even at full lift', w.fuelOut && w.heli.power < 0.5 && w.heli.vy > 20, `power ${w.heli.power.toFixed(2)} vy ${w.heli.vy.toFixed(0)}`);
}

// --- 6. thin air ---
{
  const w = new World(); w.reset(2, 'normal'); noStorm(w);
  run(w, 0.1);
  check('full engine power at sea level', w.air > 0.99, `air ${w.air.toFixed(2)}`);
  w.heli.y = 300; w.heli.x = 1500; run(w, 0.1);
  check('thin air reduces power high up but stays able to climb', w.air < 0.85 && 1.4 * w.air > 1.03, `air ${w.air.toFixed(2)} max thrust ${(1.4 * w.air).toFixed(2)} g`);
  for (const d of DIFF_ORDER) {
    const c = buildConfig(2, d);
    check(`thin air on ${d} leaves climb margin`, 1.4 * (1 - c.thin) > 1.03, `max thrust ${(1.4 * (1 - c.thin)).toFixed(3)} g`);
  }
}

// --- 7. difficulty scaling + score multiplier ---
{
  const e = buildConfig(0, 'easy'), n = buildConfig(0, 'normal'), h = buildConfig(0, 'hard');
  check('difficulty scales wind/tornado/grip monotonically', e.wind < n.wind && n.wind < h.wind && e.tornado.at > n.tornado.at && n.tornado.at > h.tornado.at && e.grip < n.grip && n.grip < h.grip && e.tornado.maxR < h.tornado.maxR);
  const pts = {};
  for (const d of DIFF_ORDER) { const w = new World(); w.reset(0, d); const s = w.survivors[0]; s.setState(S.FALLING); w.deliver(s); pts[d] = w.score; }
  check('score multiplier x0.75 / x1 / x1.5 for a clean rescue', pts.easy === 113 && pts.normal === 150 && pts.hard === 225, JSON.stringify(pts));
}

// --- 8. mission 1 is unchanged from v1 (regression) ---
{
  const w = new World(); w.reset(0, 'normal');
  check('mission 1 normal keeps the original layout', w.terrain.ledges.length === 3 && Math.abs(w.terrain.ledges[0].x - 960) < 1 && Math.abs(w.terrain.ledges[0].y - 700.2) < 0.5 && w.tornado.appearT === 16 && w.wind.intensity === 1, `ledge0 ${w.terrain.ledges[0].x}/${w.terrain.ledges[0].y.toFixed(1)}`);
}

// --- 9. new in v4: rope winch, blades/body kills, ragdoll, city terrain ---
{
  const w = new World(); w.reset(0, 'normal'); noStorm(w);
  const pin = (ww, adj) => { ww.heli.x = 1200; ww.heli.y = 300; ww.heli.vx = ww.heli.vy = 0; return { x: 0, lift: 0, ropeToggle: false, ropeAdj: adj }; };
  run(w, 6, (ww) => pin(ww, 1)); const long = w.rope.length();
  run(w, 10, (ww) => pin(ww, -1)); const short = w.rope.length();
  check('rope winch lets out to ~320 and reels in to ~95 (stretch stays <1.06)', long > 300 && short < 110 && w.ropeStretch() < 1.06, `${long.toFixed(0)} / ${short.toFixed(0)} stretch ${w.ropeStretch().toFixed(3)}`);
}
{
  const w = new World(); w.reset(0, 'normal'); noStorm(w);
  const s = w.survivors[0];
  const bl0 = w.blood.life.filter((x) => x > 0).length;
  w.heli.x = s.x - 30; w.heli.y = s.y + 12; w.heli.vx = w.heli.vy = 0; w.heli.crashed = false; w.heli.angle = 0;   // rotor disc sweeps through the survivor
  w.bladeCheck(); run(w, 0.05);
  const gibsN = () => w.gibs.life.filter((x) => x > 0).length;
  check('rotor blades shred a survivor: big blood burst + 11 flying pieces, no intact body', s.state === S.LOST && s.cause === 'blades' && s.gibbed && !s.rag && gibsN() === 11 && w.blood.life.filter((x) => x > 0).length > bl0 + 150 && w.lostCauses.blades === 1, `state=${s.state} gibs=${gibsN()} blood=${w.blood.life.filter((x) => x > 0).length}`);
  const spread0 = Math.max(...w.gibs.x.filter((_, i) => w.gibs.life[i] > 0)) - Math.min(...w.gibs.x.filter((_, i) => w.gibs.life[i] > 0));
  run(w, 0.6);
  const xs = w.gibs.x.filter((_, i) => w.gibs.life[i] > 0);
  check('gib pieces splash outward (spread grows) and stay finite', Math.max(...xs) - Math.min(...xs) > spread0 + 40 && [...w.gibs.x, ...w.gibs.y].every(Number.isFinite), `spread ${spread0.toFixed(0)} -> ${(Math.max(...xs) - Math.min(...xs)).toFixed(0)}`);
  run(w, 5);
  const onGround = w.gibs.y.every((y, i) => w.gibs.life[i] <= 0 || y <= w.terrain.heightAt(w.gibs.x[i]) + 1);
  check('gib pieces come to rest on the ground, none fall through', onGround && w.gibs.vy.every((v, i) => w.gibs.life[i] <= 0 || Math.abs(v) < 400));
}
{
  const w = new World(); w.reset(0, 'normal'); noStorm(w);
  const s = w.survivors[1]; s.y -= 200; s.grounded = false; s.setState(S.FALLING); s.vx = 0; s.vy = 0;
  let fallRag = false;
  for (let i = 0; i < 60; i++) { w.step(STEP, IN2); if (s.rag) fallRag = true; if (s.state !== S.FALLING) break; }
  check('falling survivors flail on a ragdoll', fallRag);
}
{
  for (const m of [6, 7, 8, 9, 10]) {
    const w = new World(); w.reset(m, 'normal'); noStorm(w);
    const t = w.terrain;
    const ok = t.buildings.length >= 8 && w.survivors.length === w.total && t.ledges.every((l) => Math.abs(t.heightAt(l.x) - l.y) < 1)
      && t.buildings.filter((b) => b.survivor).every((b) => (b.i1 - b.i0) * 30 >= 120);
    check(`city ${w.cfg.name}: ${t.buildings.length} rooftops, survivors on solid roofs`, ok);
    run(w, 20);
    check(`city ${w.cfg.name}: 20 s idle is stable (no NaN, nobody moved)`, w.survivors.every((s) => Number.isFinite(s.x) && s.state === S.WAITING) && Number.isFinite(w.heli.y));
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
