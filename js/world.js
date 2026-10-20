// The simulation: owns every gameplay object and advances them one fixed step at a time.
// DOM-free on purpose so it can be tested headlessly in Node.
import { WORLD_W, MAX_RIDERS } from './constants.js';
import { mulberry32, smoothstep, clamp } from './utils.js';
import { buildConfig } from './missions.js';
import { Terrain } from './terrain.js';
import { Helicopter } from './helicopter.js';
import { Rope } from './rope.js';
import { Survivor, S } from './survivors.js';
import { Wind } from './weather.js';
import { Tornado } from './tornado.js';
import { Sparks, Debris, Popups, Blood, Gibs, Puffs } from './particles.js';
import { themeOf } from './themes.js';
import { closestOnSegment } from './physics.js';
import { P as RP } from './ragdoll.js';
import { Dialogue } from './dialogue.js';

const _a = { x: 0, y: 0 };
const _cp = { x: 0, y: 0, t: 0 };
const NO_INPUT = { x: 0, lift: 0, ropeToggle: false };

export class World {
  constructor() {
    this.terrain = new Terrain();
    this.heli = new Helicopter();
    this.rope = new Rope();
    this.wind = new Wind();
    this.tornado = new Tornado();
    this.sparks = new Sparks();
    this.blood = new Blood();
    this.gibs = new Gibs();
    this.puffs = new Puffs();
    this.debris = new Debris();
    this.popups = new Popups();
    this.dialogue = new Dialogue();
    this.survivors = [];
    this.events = [];
    this.reset(0);
  }

  /** Start a mission. `mission` = index into MISSIONS, `diff` = 'easy' | 'normal' | 'hard'. */
  reset(mission = 0, diff = 'normal') {
    const cfg = this.cfg = buildConfig(mission, diff);
    this.level = cfg.index;
    this.rnd = mulberry32(cfg.seed + 99);
    const total = this.terrain.generate(cfg.terrain, cfg.seed, cfg.tide);
    this.terrain.update(0);
    const pad = this.terrain.pad;
    this.heli.reset(pad.cx, pad.y - 30);
    this.heli.anchor(_a);
    this.rope.reset(_a.x, _a.y);
    this.wind.reset(cfg.seed, cfg.wind);
    this.tornado.reset(cfg.tornado, cfg.index);
    this.dialogue.reset();
    this.survivors = [];
    for (let i = 0; i < total; i++) {
      const l = this.terrain.ledges[i];
      const s = new Survivor(i);
      s.reset(i, l.x, l.y);
      this.survivors.push(s);
    }
    this.total = total;
    this.time = 0;
    this.score = 0;
    this.rescuedCount = 0;
    this.lostCount = 0;
    this.drops = 0;
    this.lostCauses = { tornado: 0, splat: 0, blown: 0, drowned: 0, blades: 0, crushed: 0 };
    this.fuel = 100; this.fuelOut = false; this.refueling = false; this.fuelWarn = 0;
    this.air = 1; this.heli.power = 1;
    this.riders = [];
    this.convoyBonus = 0;
    this.events.length = 0;
    this.shake = 0;
    this.flash = 0;
    this.nextLightning = 7 + this.rnd() * 6;
    this.boltSeed = 1;
    this.ended = false;
    this.endReason = '';
    this.endTimer = 0;
    this.endTime = 0;
    this.noticeCd = 0;
    this.sparks.life.fill(0);
    this.blood.reset();
    this.gibs.reset();
    this.puffs.reset();
    this.incidents = [];                              // what went wrong, for the results debrief (no gameplay effect)
    this.rings = [];                                  // expanding feedback rings (cosmetic)
    this.fastCd = 0;
    this.nearMisses = 0;
    this.redFlash = 0;
    this.theme = themeOf(this.cfg.theme);
    this.intensity = 0;                               // storm builds up over the mission (0..1)
    this.fxRnd = mulberry32(this.cfg.seed * 17 + 3);  // cosmetic randomness, kept off the gameplay stream
    this.nextSquall = 26 + this.fxRnd() * 16; this.squallStart = -99; this.squallAmp = 0;
    this.steamT = 0; this.washT = 0; this.smokeT = 0;
    this.popups.t.fill(0);
    this.debris.reset(this.heli.x, 0);
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  step(dt, input) {
    const inp = this.ended ? NO_INPUT : input;
    this.time += dt;
    const { heli, rope, wind, tornado, terrain } = this;

    // the storm grows with time, and now and then a gust front sweeps through
    this.intensity = this.escalate === false ? 0 : smoothstep(0, this.cfg.timeLimit * 0.75, this.time);   // tests can set escalate=false
    if (this.time >= this.nextSquall && !this.ended) {
      this.squallStart = this.time;
      this.squallAmp = { easy: 0.3, normal: 0.5, hard: 0.75 }[this.cfg.diffKey] || 0.5;
      this.nextSquall = this.time + 7 + 24 + this.fxRnd() * 26;
      this.emit('squall', {});
    }
    const sq = this.time - this.squallStart, bell = sq >= 0 && sq < 7 ? Math.sin(sq / 7 * Math.PI) : 0;
    this.squall = bell;
    wind.intensity = this.cfg.wind * (1 + 0.25 * this.intensity) * (1 + this.squallAmp * bell);
    wind.update(dt, this.time);
    terrain.update(this.time);
    tornado.update(dt, this.time, terrain);
    if (tornado.warning && !tornado.warned) { tornado.warned = true; this.emit('tornado_warning'); }
    if (tornado.active && !tornado.appeared) { tornado.appeared = true; this.emit('tornado_appear'); }

    if (inp.ropeAdj) rope.adjust(inp.ropeAdj, dt);
    if (inp.ropeToggle) { rope.toggle(); inp.ropeToggle = false; this.emit('rope_toggle', { deployed: rope.deployed }); }

    // engine power: thin air up high, flameout when the tank is dry
    const cfg = this.cfg;
    this.air = cfg.thin > 0 ? 1 - cfg.thin * smoothstep(350, 1050, terrain.baseY - heli.y) : 1;
    heli.power = this.air * (this.fuelOut ? 0.45 : 1);
    heli.update(dt, inp, wind, tornado, terrain);
    if (cfg.fuel && !this.ended) this.updateFuel(dt);
    if (heli.impact > 90) {
      this.addShake(Math.min(0.9, heli.impact / 400));
      this.sparks.emit(heli.x, heli.y + 28, Math.min(14, heli.impact / 20), 160, 0.5);
      this.emit('impact', { strength: heli.impact, x: heli.x, y: heli.y });
    }
    if (heli.crashed && !this.ended) { this.incidents.push({ t: this.time, kind: 'crash', cause: heli.crashReason, fuelOut: this.fuelOut }); this.emit('heli_crash', { reason: heli.crashReason }); }

    const loads = this._loads || (this._loads = []);
    loads.length = 0;
    for (let i = 0; i < this.riders.length; i++) loads.push(this.riders[i].pos);
    rope.setLoads(loads);
    this.bladeCheck();
    heli.anchor(_a);
    rope.step(dt, _a.x, _a.y, wind, tornado, terrain);

    this.dialogue.update(dt);
    this.noticeCd -= dt;
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i];
      s.update(dt, this);
      if (!this.ended && s.state === S.WAITING && s.stateT > 3 && Math.abs(s.x - heli.x) < 380 && Math.abs(s.y - heli.y) < 600 && this.time > s.nextNotice) {
        s.nextNotice = this.time + 14;
        this.dialogue.say(s, 'waiting');
      }
    }
    // rescue interaction: hook first (so a slow touch grabs), then physical rope impacts
    if (this.canGrab() && !heli.crashed) {
      for (let i = 0; i < this.survivors.length; i++) if (this.survivors[i].tryGrab(rope, this)) break;
    }
    this.dropOffRiders();
    for (let i = 0; i < this.survivors.length; i++) {
      const s = this.survivors[i];
      const hit = s.ropeImpact(rope, dt);
      if (hit > 110) this.onRopeHit(s, hit);
    }

    this.debris.update(dt, this);
    this.sparks.update(dt);
    this.puffs.update(dt, wind);
    if (this.fastCd > 0) this.fastCd -= dt;
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t > 0.9) this.rings.splice(i, 1); }
    this.ambientFx(dt);
    this.blood.update(dt, terrain);
    this.gibs.update(dt, terrain, this.blood);
    if (this.redFlash > 0) this.redFlash = Math.max(0, this.redFlash - dt * 2.2);
    this.popups.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);

    if (this.time > this.nextLightning) {
      this.nextLightning = this.time + (9 + this.rnd() * 9) / ((1 + this.intensity * 0.9) * (this.theme.lightning || 1));
      if (terrain.buildings.length) {                   // a strike jumps off a nearby rooftop
        const near = terrain.buildings.filter((b) => Math.abs((b.i0 + b.i1) * 15 - heli.x) < 700);
        if (near.length) { const b = near[Math.floor(this.fxRnd() * near.length)]; this.sparks.emit((b.i0 + this.fxRnd() * (b.i1 - b.i0)) * 30, b.top - 4, 22, 340, 0.9); }
      }
      this.flash = 1;
      this.boltSeed = 1 + Math.floor(this.rnd() * 9999);
      this.emit('lightning', {});
    }

    // end conditions
    if (!this.ended) {
      let unresolved = 0;
      for (let i = 0; i < this.survivors.length; i++) if (this.survivors[i].active) unresolved++;
      if (heli.crashed) this.finish('crash');
      else if (unresolved === 0) this.finish('done');
      else if (this.time > this.cfg.timeLimit) this.finish('storm');
    } else {
      this.endTimer += dt;
    }
  }

  finish(reason) {
    this.ended = true;
    this.endReason = reason;
    this.endTime = this.time;
    while (this.riders.length) this.riders[this.riders.length - 1].release(this, 'crash');
    this.emit('end', { reason });
  }

  addShake(a) { if (a > this.shake) this.shake = a; }

  /** Cosmetic ambience: rooftop steam, rotor downwash dust/spray and engine smoke. Never touches gameplay state. */
  ambientFx(dt) {
    const { heli, terrain, puffs } = this, r = this.fxRnd;
    const st = this.theme.steam;
    if (st && terrain.buildings.length) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.5 / st.rate;
        const b = terrain.buildings[Math.floor(r() * terrain.buildings.length)];
        const x = (b.i0 + 1 + r() * Math.max(1, b.i1 - b.i0 - 1)) * 30;
        if (Math.abs(x - heli.x) < 900) puffs.add(x, b.top - 2, (r() - 0.5) * 8, -(26 + r() * 22), 2.4 + r() * 1.6, 5 + r() * 3, 9 + r() * 5, 0);
      }
    }
    if (!heli.crashed && !this.fuelOut) {
      const alt = terrain.heightAt(heli.x) - heli.y;
      if (alt > 0 && alt < 130 && heli.power > 0.2) {
        this.washT -= dt;
        if (this.washT <= 0) {
          this.washT = 0.045;
          const water = terrain.isWaterAt(heli.x), kind = water ? 3 : (this.cfg.theme === 'dubai' ? 4 : 1);
          const side = r() < 0.5 ? -1 : 1, sp = (110 + r() * 150) * (1 - alt / 170);
          puffs.add(heli.x + side * (6 + r() * 30), heli.y + alt - 3, side * sp, -(10 + r() * 28), 0.55 + r() * 0.35, 3 + r() * 3, 26 + r() * 20, kind);
        }
      }
      if (this.fuel < 24 && this.cfg.fuel) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) { this.smokeT = 0.09; puffs.add(heli.x - 12 + (r() - 0.5) * 6, heli.y - 24, (r() - 0.5) * 20, -34, 1.5, 3, 12, 2); }
      }
    }
  }

  // ---- blades / body / gore ----
  /** The spinning rotor and the fuselage are lethal to anyone standing or tumbling through them. */
  bladeCheck() {
    const h = this.heli;
    if (h.crashed || this.ended) return;
    const c = Math.cos(h.angle), s = Math.sin(h.angle);
    const ax = h.x - 64 * c + 35 * s, ay = h.y - 64 * s - 35 * c;
    const bx = h.x + 64 * c + 35 * s, by = h.y + 64 * s - 35 * c;
    for (let i = 0; i < this.survivors.length; i++) {
      const v = this.survivors[i];
      if (v.state !== S.WAITING && v.state !== S.FALLING) continue;
      let hit = false;
      for (let k = 0; k < 2 && !hit; k++) {
        const d2 = closestOnSegment(ax, ay, bx, by, v.x, v.y - (k ? 30 : 16), _cp);
        if (d2 < 11 * 11) hit = true;
      }
      if (hit) { v.bladeHit = { x: h.x, y: h.y - 35 }; v.lose(this, 'blades'); continue; }
      const dx = v.x - h.x, dy = v.y - 16 - (h.y + 4);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      if ((lx / 44) * (lx / 44) + (ly / 22) * (ly / 22) < 1) {
        const rel = Math.hypot(h.vx - v.vx, h.vy - v.vy);
        if (rel > 170) { v.bladeHit = { x: h.x, y: h.y }; v.lose(this, 'crushed'); }
        else { const n = Math.hypot(dx, dy) || 1; v.vx += dx / n * 160; v.vy += dy / n * 160 - 60; v.grounded = false; }
      }
    }
  }

  /** Blood spray + dismemberment on a violent death. */
  gore(s, cause) {
    const cx = s.x, cy = s.y - 16;
    if (cause === 'splat') {
      this.blood.emit(cx, cy + 6, 70, 300, 0, -230);
      if (s.rag) s.rag.kick(0, -240);
    } else if (cause === 'blades' || cause === 'crushed') {
      const hx = s.bladeHit ? s.bladeHit.x : cx, hy = s.bladeHit ? s.bladeHit.y : cy;
      let dx = cx - hx, dy = cy - hy; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      if (cause === 'blades') { this.shred(s, dx, dy); return; }
      this.blood.emit(cx, cy, 70, 380, dx * 260, dy * 260 - 60);
      if (s.rag) {
        s.rag.kick(dx * 520, dy * 520 - 120);
        const r1 = 1 + Math.floor(Math.random() * 4);
        s.rag.sever(r1);
        if (cause === 'blades' && Math.random() < 0.7) s.rag.sever(1 + (r1 % 4));
        if (cause === 'blades' && Math.random() < 0.25) s.rag.sever(5);
      }
      this.addShake(0.5);
    } else if (cause === 'tornado') {
      this.blood.emit(cx, cy, 6, 120);
    }
  }

  /** Rotor contact: the body bursts into pieces that fly out, tumble and bleed, with a big blood cloud. */
  shred(s, dx, dy) {
    const cx = s.x, cy = s.y - 16;
    s.gibbed = true;
    const tx = -dy, ty = dx;                                  // rotor-tangential kick, so pieces whirl outward
    this.blood.emit(cx, cy, 190, 460, dx * 300, dy * 300 - 80);
    this.blood.emit(cx, cy, 80, 160, tx * 140, ty * 140);
    const rag = s.rag;
    const add = (mx, my, ang, len, kind, vx, vy) => {
      const k = 0.5 + Math.random();
      const sp = 140 + Math.random() * 300;
      const a = Math.random() * Math.PI * 2;
      this.gibs.add(mx, my, ang, len, kind,
        vx * 0.3 + dx * sp * k + Math.cos(a) * sp * 0.5 + tx * 120 * (Math.random() - 0.3),
        vy * 0.3 + dy * sp * k + Math.sin(a) * sp * 0.5 - 130 - Math.random() * 120,
        (Math.random() - 0.5) * 30, kind === 2 ? s.hat : 0);
    };
    if (rag) rag.eachPiece(add);
    else for (let i = 0; i < 9; i++) add(cx + (Math.random() - 0.5) * 14, cy + (Math.random() - 0.5) * 30, Math.random() * 6, 7, i === 8 ? 2 : 0, s.vx, s.vy);
    s.rag = null;
    this.addShake(0.8);
    this.redFlash = 0.55;
    this.sparks.emit(cx, cy, 10, 260, 0.5);
    this.emit('gore', { s, x: cx, y: cy });
  }

  // ---- survivor callbacks ----
  get carried() { return this.riders.length ? this.riders[this.riders.length - 1] : null; }
  removeRider(s) { const i = this.riders.indexOf(s); if (i >= 0) this.riders.splice(i, 1); }
  /** The hook is free for a new passenger once the previous one has climbed clear of it. */
  canGrab() {
    if (this.riders.length >= MAX_RIDERS) return false;
    for (let i = 0; i < this.riders.length; i++) if (this.riders[i].pos > this.rope.n - 1 - 3) return false;
    return true;
  }
  /** Lowering any rider into the SAFE ZONE lets everyone hanging inside it hop off together (convoy bonus). */
  dropOffRiders() {
    if (this.ended || !this.riders.length) return;
    const terrain = this.terrain;
    let trig = false;
    for (let i = 0; i < this.riders.length; i++) if (this.riders[i].inDropZone(terrain)) { trig = true; break; }
    if (!trig) return;
    const group = this.riders.filter((r) => terrain.inPad(r.x) && r.x > terrain.pad.x0 + 8 && r.x < terrain.pad.x1 - 8);
    for (const r of group) this.deliver(r);
    if (group.length > 1) {
      const b = Math.round(40 * (group.length - 1) * this.cfg.scoreMult);
      this.score += b; this.convoyBonus += b;
      const p = terrain.pad;
      this.popups.add(p.cx, p.y - 120, `CONVOY x${group.length}  +${b}`);
      this.emit('convoy', { n: group.length, bonus: b });
    }
  }

  deliver(s) {
    if (!s.setState(S.RESCUED)) return;
    this.removeRider(s);
    s.slot = this.rescuedCount;
    this.rescuedCount++;
    const pts = Math.round((100 + (s.dropped ? 0 : 50)) * this.cfg.scoreMult);
    this.score += pts;
    this.popups.add(s.x, s.y - 60, '+' + pts);
    this.sparks.emit(s.x, s.y - 20, 16, 200, 0.8);
    this.ring(s.x, s.y - 20, 'rescue');
    this.dialogue.say(s, 'rescued', true);
    this.emit('rescued', { s, points: pts });
  }

  /** Expanding ring of feedback at a point. kind: 'hook' | 'rescue'. */
  ring(x, y, kind) {
    if (this.rings.length >= 8) this.rings.shift();
    this.rings.push({ x, y, t: 0, kind });
  }

  onGrab(s) {
    this.sparks.emit(s.x, s.y - 16, 8, 120, 0.4);
    this.ring(s.x, s.y - 16, 'hook');
    this.popups.add(s.x, s.y - 52, 'HOOKED!');
    this.emit('grab', { s });
  }

  /** The hook touched a survivor but was moving too fast to catch them. Rate-limited so it stays a hint, not spam. */
  onGrabFast(s, rel) {
    if (this.fastCd > 0) return;
    this.fastCd = 1.6;
    this.popups.add(s.x, s.y - 52, 'TOO FAST!');
    this.emit('grab_fast', { s, rel });
  }

  /** Distance (world units) from x to the nearest edge of the safe pad; 0 when over it. */
  padGap(x) {
    const p = this.terrain.pad;
    return x < p.x0 ? p.x0 - x : (x > p.x1 ? x - p.x1 : 0);
  }

  /** A survivor died or fell within a short distance of the safe zone: tell the player how close it was. */
  checkNearMiss(s, cause) {
    const d = this.padGap(s.x);
    if (d > 0 && d <= 200 && cause !== 'blades' && cause !== 'crushed' && cause !== 'tornado') {
      this.nearMisses++;
      this.incidents.push({ t: this.time, kind: 'near', id: s.id, cause, dist: d });
      this.emit('near_miss', { s, dist: d, cause });
    }
  }

  onRopeHit(s, strength) {
    this.addShake(Math.min(0.35, strength / 1600));
    this.sparks.emit(s.x, s.y - 16, 6, 120, 0.4);
    this.dialogue.say(s, 'ropeHit', strength > 260);
    this.emit('rope_hit', { s, strength });
  }

  onSurvivorKnocked(s) {
    this.drops++;
    this.emit('knocked', { s });
  }

  onSurvivorDropped(s, reason) {
    this.drops++;
    this.incidents.push({ t: this.time, kind: 'dropped', cause: reason, id: s.id });
    this.emit('dropped', { s, reason });
  }

  onSurvivorLanded(s, impact) {
    this.addShake(Math.min(0.3, impact / 2200));
    this.sparks.emit(s.x, s.y, 8, 120, 0.4);
    this.dialogue.say(s, 'landed');
    if (impact > 430) this.blood.emit(s.x, s.y - 6, Math.min(14, (impact - 380) / 25), 150, 0, -120);
    this.emit('landed', { s, impact });
  }

  onLost(s, cause) {
    this.lostCount++;
    if (this.lostCauses[cause] !== undefined) this.lostCauses[cause]++;
    this.sparks.emit(s.x, s.y - 16, 14, 220, 0.8);
    this.addShake(0.4);
    this.incidents.push({ t: this.time, kind: 'lost', cause, id: s.id });
    this.checkNearMiss(s, cause);
    this.gore(s, cause);
    this.dialogue.say(s, cause === 'tornado' ? 'tornado' : (cause === 'drowned' ? 'drowned' : 'lost'), true);
    this.emit('lost', { s, cause });
  }

  // ---- reporting ----
  get remaining() {
    let n = 0;
    for (let i = 0; i < this.survivors.length; i++) if (this.survivors[i].active) n++;
    return n;
  }

  report() {
    const total = this.total;
    const rescued = this.rescuedCount;
    const lost = total - rescued;
    const duration = this.ended ? this.endTime : this.time;
    const clean = this.survivors.every((s) => s.state !== S.RESCUED || !s.dropped);
    const all = rescued === total;
    const perfect = all && clean;
    const mult = this.cfg.scoreMult;
    const timeBonus = all ? Math.round(Math.max(0, (this.cfg.parTime - duration) * 2) * mult) : 0;
    const perfectBonus = perfect ? Math.round(250 * mult) : 0;
    const score = this.score + timeBonus + perfectBonus;
    const success = rescued >= Math.ceil(total / 2) && this.endReason !== 'crash' || (all && this.endReason === 'crash');
    const efficiency = Math.round((rescued / total) * 100);
    return {
      success, rescued, lost, total, duration, efficiency, score,
      base: this.score, convoyBonus: this.convoyBonus, timeBonus, perfectBonus, perfect, reason: this.endReason,
      mission: this.cfg.name, difficulty: this.cfg.diffLabel, missionIndex: this.cfg.index,
      message: this.pickMessage(success, rescued, total, perfect, all),
    };
  }

  pickMessage(success, rescued, total, perfect, all) {
    const c = this.lostCauses;
    const crashed = this.endReason === 'crash';
    if (crashed && this.heli.crashReason === 'water') return 'The helicopter is now a very expensive submarine.';
    if (crashed && this.fuelOut) return 'Out of fuel, out of altitude, out of excuses. The ground was extremely welcoming.';
    if (!crashed && this.lostCauses.drowned > 0 && this.lostCauses.drowned >= total - rescued - 0) return 'The sea took them. It is very polite about it, in a wet way.';
    if (crashed) {
      return this.heli.crashReason === 'tornado'
        ? 'The tornado recycled your helicopter. It was a very efficient tornado.'
        : 'The helicopter is now abstract art. Please do not fly it again.';
    }
    if (c.blades > 0 && c.blades >= total - rescued) return 'The rotor blades have opinions about people standing too close.';
    if (perfect) return 'FLAWLESS. The survivors are suspicious of how good that was.';
    if (all) return 'Everyone made it. Some of them took the scenic route.';
    if (success) return 'Most survivors made it. The rest are the tornado\'s problem now.';
    if (rescued === 0) return this.endReason === 'storm'
      ? 'Zero rescued and the storm outlasted everyone. Even the rain looks tired.'
      : 'Zero rescued. A bold strategy. It did not pay off.';
    if (c.tornado >= c.splat && c.tornado > 0) return 'The tornado now owns your survivors. It sends its regards.';
    if (c.splat > 0) return 'Gravity wins again. Gravity always wins.';
    return 'The storm won this round. Rematch?';
  }

  /** Fuel burn, refuelling on the SAFE ZONE deck, and warnings. */
  updateFuel(dt) {
    const heli = this.heli, pad = this.terrain.pad, cfg = this.cfg;
    if (heli.crashed) return;
    const onDeck = heli.x > pad.x0 && heli.x < pad.x1 && heli.y > pad.y - 110 && Math.hypot(heli.vx, heli.vy) < 140;
    this.refueling = onDeck && this.fuel < 100;
    if (this.refueling) {
      this.fuel = Math.min(100, this.fuel + 24 * dt);
      if (this.fuelOut && this.fuel > 8) { this.fuelOut = false; this.emit('refueled', {}); }
      if (this.fuel > 30) this.fuelWarn = 0;
      return;
    }
    const base = 100 / cfg.fuel.seconds;
    const rate = base * (heli.onGround ? 0.25 : 0.45 + 0.55 * clamp(heli.collective, 0.4, 1.4));
    this.fuel = Math.max(0, this.fuel - rate * dt);
    if (this.fuel <= 25 && this.fuelWarn < 1) { this.fuelWarn = 1; this.emit('low_fuel', { level: 1 }); }
    if (this.fuel <= 10 && this.fuelWarn < 2) { this.fuelWarn = 2; this.emit('low_fuel', { level: 2 }); }
    if (this.fuel <= 0 && !this.fuelOut) { this.fuelOut = true; this.incidents.push({ t: this.time, kind: 'fuel' }); this.emit('out_of_fuel', {}); }
  }

  /** Test helper: total rope stretch right now. */
  ropeStretch() { return this.rope.stretchRatio(); }
}

export { WORLD_W };
