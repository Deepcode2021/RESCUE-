// Helicopter rigid body: collective + tilt control, thrust along the rotor axis, drag, wind, tornado, terrain.
import { GRAVITY, WORLD_W } from './constants.js';
import { clamp, approach } from './utils.js';
import { resolveTerrainPoint, clampSpeed } from './physics.js';

// Local collision points (x, y, isSkid). y is down; skids are the only points allowed a firm landing.
const PTS = [
  [-22, 30, 1], [22, 30, 1],
  [-52, -14, 0], [34, 8, 0], [-40, -34, 0], [40, -34, 0],
];
export const HOOK_OFFSET = 30;
const MAX_SPEED = 560;
const SKID_CRASH = 330;
const BODY_CRASH = 150;

const _w = { x: 0, y: 0 };
const _f = { ax: 0, ay: 0, f: 0 };

export class Helicopter {
  constructor() { this.reset(0, 0); }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = 0; this.av = 0;
    this.collective = 0.96;
    this.power = 1;        // engine power multiplier (thin air, fuel flameout)
    this.rotor = 0;
    this.onGround = false;
    this.crashed = false;
    this.crashReason = '';
    this.impact = 0;       // last impact speed (read by world for shake/audio)
    this.ax = 0; this.ay = 0; // last applied acceleration (HUD/rope use)
    this.face = 0; this.faceWant = 0; this.faceT = 0;   // sprite view: -1 left, 0 front, 1 right
  }

  /** World position of the rope anchor under the fuselage. */
  anchor(out) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    out.x = this.x - HOOK_OFFSET * s;
    out.y = this.y + HOOK_OFFSET * c;
    return out;
  }

  update(dt, input, wind, tornado, terrain) {
    this.impact = 0;
    let lift = 0, mv = 0;
    if (!this.crashed) { lift = clamp(input.lift, -1, 1); mv = clamp(input.x, -1, 1); }

    // Collective: eased toward a target (inertia in the lift response too)
    const target = this.crashed ? 0.2 : (lift >= 0 ? 0.96 + 0.44 * lift : 0.96 + 0.3 * lift);
    this.collective = approach(this.collective, target, 2.4 * dt);

    // Tilt: spring-damper toward the commanded bank angle -> horizontal acceleration emerges from thrust vector
    const tiltT = this.crashed ? 0 : mv * 0.42;
    this.av += ((tiltT - this.angle) * 42 - this.av * 8.2) * dt;
    this.angle += this.av * dt;
    this.angle = clamp(this.angle, -1.15, 1.15);

    const T = this.collective * GRAVITY * this.power;
    let ax = Math.sin(this.angle) * T;
    let ay = -Math.cos(this.angle) * T + GRAVITY;

    // Air resistance (linear + quadratic)
    const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const k = 0.5 + 0.0013 * sp;
    ax -= this.vx * k;
    ay -= this.vy * k;

    // Wind + tornado
    wind.sample(this.x, this.y, _w);
    ax += _w.x; ay += _w.y;
    tornado.forceAt(this.x, this.y, _f, 0.55);
    ax += _f.ax; ay += _f.ay;
    this.ax = ax; this.ay = ay;

    // Semi-implicit Euler
    this.vx += ax * dt;
    this.vy += ay * dt;
    clampSpeed(this, MAX_SPEED);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // World bounds (soft walls)
    if (this.x < 40) { this.x = 40; if (this.vx < 0) this.vx *= -0.3; }
    if (this.x > WORLD_W - 40) { this.x = WORLD_W - 40; if (this.vx > 0) this.vx *= -0.3; }
    if (this.y < -250) { this.y = -250; if (this.vy < 0) this.vy *= -0.2; }

    // Terrain collisions
    this.onGround = false;
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    for (let i = 0; i < PTS.length; i++) {
      const p = PTS[i];
      const px = this.x + p[0] * c - p[1] * s;
      const py = this.y + p[0] * s + p[1] * c;
      const imp = resolveTerrainPoint(terrain, this, px, py, 0.18);
      if (imp > 0) {
        if (!this.crashed && terrain.isWaterAt(px)) { this.crashed = true; this.crashReason = 'water'; }
        if (imp > this.impact) this.impact = imp;
        if (p[2]) this.onGround = true;
        if (!this.crashed && imp > (p[2] ? SKID_CRASH : BODY_CRASH)) {
          this.crashed = true;
          this.crashReason = 'terrain';
        }
      }
    }
    if (this.onGround) {
      // skid friction + level out on the ground
      this.vx *= 1 - Math.min(1, 3.2 * dt);
      this.av *= 1 - Math.min(1, 4 * dt);
    }

    // Sucked into the vortex core
    if (!this.crashed && tornado.active && tornado.ramp > 0.6 && tornado.distance(this.x, this.y) < tornado.radius * 0.35) {
      this.crashed = true;
      this.crashReason = 'tornado';
    }

    this.rotor += dt * (18 + this.collective * 14);
    this._updateFace(dt, mv);
  }

  /** Which sprite to show: turns through the front view like a real aircraft yawing round. */
  _updateFace(dt, mv) {
    let want = this.faceWant;
    if (mv > 0.3 || this.vx > 120) want = 1;
    else if (mv < -0.3 || this.vx < -120) want = -1;
    else if (Math.abs(mv) < 0.1 && Math.abs(this.vx) < 45) want = 0;
    if (want !== this.faceWant) { this.faceWant = want; this.faceT = 0; }
    this.faceT += dt;
    if (this.face !== this.faceWant && this.faceT > 0.13) {
      this.face += Math.sign(this.faceWant - this.face);
      this.faceT = 0;
    }
  }
}
