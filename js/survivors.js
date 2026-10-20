// Survivor state machine + physics.
// WAITING_ON_PEAK -> FALLING -> (WAITING | ATTACHED_TO_ROPE | LOST | RESCUED); ATTACHED -> FALLING | RESCUED | LOST.
// RESCUED and LOST are terminal, so a survivor can never be both.
import { GRAVITY, WORLD_W, RIDER_SLOTS, CLIMB_SPEED } from './constants.js';
import { clamp } from './utils.js';
import { clampSpeed } from './physics.js';
import { Ragdoll } from './ragdoll.js';

export const S = {
  WAITING: 'WAITING_ON_PEAK',
  FALLING: 'FALLING',
  ATTACHED: 'ATTACHED_TO_ROPE',
  RESCUED: 'RESCUED',
  LOST: 'LOST',
};

const ALLOWED = {
  WAITING_ON_PEAK: ['FALLING', 'ATTACHED_TO_ROPE', 'LOST'],
  FALLING: ['WAITING_ON_PEAK', 'ATTACHED_TO_ROPE', 'LOST', 'RESCUED'],
  ATTACHED_TO_ROPE: ['FALLING', 'RESCUED', 'LOST'],
  RESCUED: [],
  LOST: [],
};

export const GRAB_R = 36;          // hook grab radius
export const GRAB_SPEED = 380;     // max relative hook speed for a clean grab
const BODY_R = 14;                 // collision circle radius (chest)
const CHEST = 16;                  // chest height above the feet
const LETHAL_IMPACT = 660;

const _w = { x: 0, y: 0 };
const _f = { ax: 0, ay: 0, f: 0 };
const _n = { x: 0, y: -1 };
const _p = { x: 0, y: 0, sx: 0, sy: 1, vx: 0, vy: 0 };

export class Survivor {
  constructor(id) { this.id = id; this.reset(id, 0, 0); }

  reset(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;             // feet position
    this.vx = 0; this.vy = 0;
    this.angle = 0; this.av = 0;
    this.state = S.WAITING;
    this.stateT = 0;
    this.grounded = true;
    this.airTime = 0;
    this.restTime = 0;
    this.grip = 100;
    this.dropped = false;               // ever fell (kills the clean-rescue bonus)
    this.everAttached = false;
    this.cause = '';
    this.speech = ''; this.speechT = 0; this.speechCd = 1 + id * 0.7;
    this.waitTime = 0; this.nextUrgent = 22; this.nextNotice = 0;
    this.coreTime = 0;
    this.fade = 0;
    this.phase = id * 1.7;
    this.slot = 0;
    this.sliding = false;
    this.hit = 0;                       // recent rope-hit flash
    this.tornadoCue = 0;
    this.pos = 0;                       // fractional rope node while ATTACHED
    this.climbing = false;
    this.rag = null;                    // ragdoll skeleton while falling or dead
    this.hat = id % 3;                  // 0 none, 1 top hat, 2 cap
    this.bladeHit = null;
    this.gibbed = false;
  }

  setState(next) {
    if (this.state === next) return false;
    if (!ALLOWED[this.state].includes(next)) return false;
    this.state = next;
    this.stateT = 0;
    return true;
  }

  get chestY() { return this.y - CHEST; }
  get active() { return this.state !== S.RESCUED && this.state !== S.LOST; }

  lose(world, cause) {
    if (!this.setState(S.LOST)) return;
    this.cause = cause;
    if (cause !== 'drowned') this.makeRag();
    world.removeRider(this);
    world.onLost(this, cause);
  }

  update(dt, world) {
    this.stateT += dt;
    this.phase += dt;
    if (this.speechT > 0) this.speechT -= dt;
    if (this.speechCd > 0) this.speechCd -= dt;
    if (this.hit > 0) this.hit -= dt;
    switch (this.state) {
      case S.WAITING:
      case S.FALLING: this._physics(dt, world); break;
      case S.ATTACHED: this._attached(dt, world); break;
      case S.RESCUED: this._rescued(dt, world); break;
      case S.LOST: this._lost(dt, world); break;
    }
    this._ragdoll(dt, world);
  }

  makeRag() {
    if (this.rag) return;
    this.rag = new Ragdoll();
    this.rag.init(this.x, this.y - CHEST, this.angle, this.vx, this.vy);
  }

  /** Falling survivors flail on a ragdoll; dead ones are fully simulated and keep tumbling. */
  _ragdoll(dt, world) {
    if (this.state === S.FALLING) {
      this.makeRag();
      this.rag.step(dt, world, { cx: this.x, cy: this.y - CHEST, angle: this.angle }, 260);
    } else if (this.state === S.LOST) {
      if (!this.rag) return;
      if (this.rag.rest < 1.2) this.rag.step(dt, world, null, 0);
      this.x = this.rag.pelvisX; this.y = this.rag.pelvisY + 9;
    } else if (this.rag) this.rag = null;
  }

  _physics(dt, world) {
    const { wind, tornado, terrain } = world;
    const airborne = !this.grounded;
    wind.sample(this.x, this.y - CHEST, _w);
    tornado.forceAt(this.x, this.y - CHEST, _f, 1.8);
    const ws = airborne ? 1.7 : 0.35;
    let ax = _w.x * ws + _f.ax;
    let ay = GRAVITY + _w.y * ws + _f.ay;
    if (airborne) { ax -= this.vx * 0.12; ay -= this.vy * 0.08; }
    // Static friction: a survivor at rest on the ground is held if the net pull ALONG the surface is below the
    // friction limit. (Without this, each tick's wind velocity is integrated into position before friction
    // cancels it, so a standing survivor creeps along the ledge during every gust.)
    if (this.grounded) {
      terrain.normalAt(this.x, _n);
      const tx = -_n.y, ty = _n.x;
      const at = ax * tx + ay * ty;
      const vt0 = this.vx * tx + this.vy * ty;
      if (Math.abs(vt0) < 3 && Math.abs(at) <= 0.55 * GRAVITY * -_n.y) { ax = 0; ay = 0; this.vx = 0; this.vy = 0; }
    }
    this.vx += ax * dt; this.vy += ay * dt;
    clampSpeed(this, 760);
    this.x += this.vx * dt; this.y += this.vy * dt;

    // tornado reaction (dramatic complaint) and absorption into the core
    const tf = _f.f * tornado.ramp;
    if (tf > 0.08) world.dialogue.say(this, 'tornado');
    this.tornadoCue = tf;
    if (tornado.active && tornado.ramp > 0.5) {
      if (tornado.distance(this.x, this.y - CHEST) < tornado.radius * 0.38) this.coreTime += dt;
      else this.coreTime = Math.max(0, this.coreTime - dt);
      if (this.coreTime > 0.7) { this.lose(world, 'tornado'); return; }
    }
    if (this.x < -20 || this.x > WORLD_W + 20) { this.lose(world, 'blown'); return; }

    // terrain contact with ground-snap so we hug slopes while sliding
    const ty = terrain.heightAt(this.x);
    terrain.normalAt(this.x, _n);
    const vnNow = this.vx * _n.x + this.vy * _n.y;
    const contact = this.y >= ty || (this.grounded && this.y >= ty - 5 && vnNow <= 5);
    if (contact) {
      this.y = ty;
      if (terrain.isWaterAt(this.x)) { this.lose(world, 'drowned'); return; }
      let vn = vnNow;
      if (vn < 0) {
        const impact = -vn;
        if (impact > LETHAL_IMPACT) { this.lose(world, 'splat'); return; }
        if (impact > 180 && this.state === S.FALLING) world.onSurvivorLanded(this, impact);
        vn = impact > 250 ? impact * 0.1 : 0;       // little comedic hop
      }
      const tx = -_n.y, tyv = _n.x;
      let vt = this.vx * tx + this.vy * tyv;
      const fr = 0.55 * GRAVITY * -_n.y;
      if (Math.abs(vt) <= fr * dt) vt = 0; else vt -= Math.sign(vt) * fr * dt;
      this.vx = vt * tx + vn * _n.x;
      this.vy = vt * tyv + vn * _n.y;
      this.grounded = vn < 20;
      this.sliding = Math.abs(vt) > 40;
      this.av *= 0.8;
      // lean into the wind (wind blowing right -> lean left), on top of matching the slope
      const lean = this.state === S.WAITING ? -clamp(_w.x / 650, -0.4, 0.4) : 0;
      this.angle += (clamp(Math.atan2(_n.x, -_n.y), -0.9, 0.9) * 0.5 + lean - this.angle) * Math.min(1, 8 * dt);
    } else {
      this.grounded = false;
      this.sliding = false;
      this.angle += this.av * dt;
      if (this.av === 0) this.av = (this.id % 2 ? 1 : -1) * (2 + (this.id % 3));
    }

    if (this.grounded) {
      this.airTime = 0;
      this.av = 0;
      if (this.state === S.FALLING) {
        if (terrain.inPad(this.x)) { world.deliver(this); return; }  // landed in the zone = rescued
        const sp = Math.abs(this.vx) + Math.abs(this.vy);
        this.restTime = sp < 25 ? this.restTime + dt : 0;
        if (this.restTime > 0.5) { this.setState(S.WAITING); this.restTime = 0; this.waitTime = 0; }
      } else {
        this.waitTime += dt;
        if (this.waitTime > this.nextUrgent) { world.dialogue.say(this, 'urgent'); this.nextUrgent += 16; }
        if (this.state === S.WAITING && terrain.hasWater && terrain.waterY - this.y < 40) world.dialogue.say(this, 'tide');
      }
    } else {
      this.airTime += dt;
      if (this.state === S.WAITING && this.airTime > 0.15) {
        this.dropped = true;
        this.setState(S.FALLING);
        this.av = (this.id % 2 ? 1 : -1) * 4;
        world.dialogue.say(this, 'falling', true);
        world.onSurvivorKnocked(this);
      }
    }
  }

  /** Called each step while hanging on the rope: climb toward the slot, follow the rope, drain grip. */
  _attached(dt, world) {
    const rope = world.rope, terrain = world.terrain;
    const idx = world.riders.indexOf(this);
    const target = RIDER_SLOTS[Math.max(0, idx)];
    this.climbing = this.pos > target + 0.02;
    if (this.climbing) this.pos = Math.max(target, this.pos - CLIMB_SPEED * dt);
    rope.pointAt(this.pos, _p);
    this.x = _p.x;
    let fy = _p.y + 26;
    const gy = terrain.heightAt(this.x);
    let dragging = false;
    if (fy > gy) { fy = gy; dragging = true; }
    this.y = fy;
    this.vx = _p.vx; this.vy = _p.vy;
    // sway with the rope segment they hold
    this.angle += (Math.atan2(-_p.sx, _p.sy) * 0.8 - this.angle) * Math.min(1, 10 * dt);
    this.grounded = false;

    // Grip drain: time, violent hook acceleration, dragging on rock, tornado, strong wind; a crowded rope is harder to hold
    let drain = 1.3 + Math.max(0, rope.hookAcc - 650) * 0.012;
    if (dragging) drain += 10;
    drain += Math.abs(world.wind.x) * 0.012;
    const tf = world.tornado.active ? this.tornadoCue : 0;
    drain += tf * 25;
    drain *= 1 + 0.1 * (world.riders.length - 1);
    if (this.climbing) drain *= 0.6;                      // hands busy, but moving with purpose
    if (world.cfg.slip) {                                 // hands only give out on Hard; Easy/Normal riders hold on
      this.grip -= drain * world.cfg.grip * dt;
      const g = this.grip;
      if (g < 40) world.dialogue.say(this, 'slipping');
      if (g <= 0) { this.release(world, 'slipped'); return; }
    } else this.grip = 100;
    if (this.climbing) world.dialogue.say(this, 'climbing');

    const tn = world.tornado;
    const core = tn.active && tn.ramp > 0.5 && tn.distance(this.x, this.y - CHEST) < tn.radius * 0.38;
    this.coreTime = core ? this.coreTime + dt : Math.max(0, this.coreTime - dt);
    if (this.coreTime > 0.7) this.lose(world, 'tornado');
  }

  /** Close enough to the SAFE ZONE floor to hop off. */
  inDropZone(terrain) {
    const pad = terrain.pad;
    return this.x > pad.x0 + 8 && this.x < pad.x1 - 8 && this.y >= terrain.heightAt(this.x) - 70;
  }

  release(world, reason) {
    if (this.state !== S.ATTACHED) return;
    this.setState(S.FALLING);
    this.dropped = true;
    this.vx *= 0.8; this.vy *= 0.8;
    this.av = (this.id % 2 ? 1 : -1) * 5;
    this.grounded = false;
    this.airTime = 0;
    world.removeRider(this);
    world.dialogue.say(this, 'falling', true);
    world.onSurvivorDropped(this, reason);
  }

  tryGrab(rope, world) {
    if (this.state !== S.WAITING && this.state !== S.FALLING) return false;
    if (!world.canGrab()) return false;
    const h = rope.n - 1;
    const dx = rope.x[h] - this.x;
    const dy = rope.y[h] - (this.y - CHEST);
    if (dx * dx + dy * dy > GRAB_R * GRAB_R) return false;
    const rel = Math.hypot(rope.hookVX - this.vx, rope.hookVY - this.vy);
    if (rel > GRAB_SPEED) { world.onGrabFast(this, rel); return false; }
    if (!this.setState(S.ATTACHED)) return false;
    this.everAttached = true;
    this.grip = 100;
    this.pos = rope.n - 1;
    this.climbing = false;
    world.riders.push(this);
    world.dialogue.say(this, 'grabbed', true);
    world.onGrab(this);
    return true;
  }

  /** Capsule-ish approximation: test rope nodes and segment midpoints against a chest circle. */
  ropeImpact(rope, dt) {
    if (this.state !== S.WAITING && this.state !== S.FALLING) return 0;
    const cx = this.x, cy = this.y - CHEST;
    const n = rope.n;
    const R = BODY_R + 3;
    let strongest = 0;
    for (let i = 2; i < n; i++) {
      for (let half = 0; half < 2; half++) {
        // half 0: node i; half 1: midpoint between i-1 and i
        const nx0 = half ? (rope.x[i] + rope.x[i - 1]) * 0.5 : rope.x[i];
        const ny0 = half ? (rope.y[i] + rope.y[i - 1]) * 0.5 : rope.y[i];
        const dx = cx - nx0, dy = cy - ny0;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const ux = dx / d, uy = dy / d;
        const nvx = (rope.x[i] - rope.px[i]) / dt, nvy = (rope.y[i] - rope.py[i]) / dt;
        const rel = (nvx - this.vx) * ux + (nvy - this.vy) * uy;   // closing speed toward survivor
        if (rel > 45) {
          const m = i >= n - 3 ? 0.65 : 0.25;
          const j = rel * m * 0.7;
          this.vx += ux * j;
          this.vy += uy * j - j * 0.12;
          if (rel > strongest) strongest = rel;
        }
        // push the node out of the survivor so the rope drapes over them
        const overlap = R - d;
        const ox = ux * overlap * 0.6, oy = uy * overlap * 0.6;
        rope.x[i] -= ox; rope.y[i] -= oy;     // shift the previous position too: correct position, add no velocity
        rope.px[i] -= ox; rope.py[i] -= oy;
      }
    }
    if (strongest > 0) {
      this.hit = 0.35;
      clampSpeed(this, 520);   // many overlapping nodes must not stack into a cannon shot
    }
    return strongest;
  }

  _rescued(dt, world) {
    const pad = world.terrain.pad;
    const tx = pad.x0 + 55 + (this.slot % 6) * 56;
    this.y = pad.y;
    this.x += clamp(tx - this.x, -1, 1) * Math.min(90 * dt, Math.abs(tx - this.x));
    this.vx = 0; this.vy = 0;
    this.angle *= 0.9;
  }

  _lost(dt, world) {
    const slow = this.cause === 'splat' || this.cause === 'blades' || this.cause === 'crushed';
    this.fade += dt / (slow ? 7 : 1.6);
    if (this.cause === 'drowned') { this.y += 16 * dt; this.vx = this.vy = 0; }      // sinks quietly
    else if (!this.rag) { this.vx = this.vy = 0; }
  }
}
