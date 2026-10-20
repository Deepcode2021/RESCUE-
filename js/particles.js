// Pooled particle systems: chalk sparks, wind-blown debris, and floating score popups. No per-frame allocation.
import { GRAVITY, WORLD_W } from './constants.js';
import { TAU } from './utils.js';

const _w = { x: 0, y: 0 };
const _f = { ax: 0, ay: 0, f: 0 };

export class Sparks {
  constructor(count = 180) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.life = new Float32Array(count); this.max = new Float32Array(count);
    this.size = new Float32Array(count);
    this.next = 0;
  }
  emit(x, y, n, speed, life = 0.6, dirX = 0, dirY = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.count;
      const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65);
      this.x[i] = x; this.y[i] = y;
      this.vx[i] = Math.cos(a) * s + dirX; this.vy[i] = Math.sin(a) * s + dirY;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = 1.2 + Math.random() * 2.2;
    }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vy[i] += GRAVITY * 0.35 * dt;
      this.vx[i] *= 1 - 1.5 * dt; this.vy[i] *= 1 - 1.5 * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
    }
  }
}

export class Debris {
  constructor(count = 38) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.rot = new Float32Array(count); this.vr = new Float32Array(count);
    this.size = new Float32Array(count); this.shape = new Uint8Array(count);
    this.age = new Float32Array(count);
  }
  reset(cx, cy) {
    for (let i = 0; i < this.count; i++) this.spawn(i, cx, cy, true);
  }
  spawn(i, cx, cy, anywhere) {
    this.x[i] = cx + (Math.random() - 0.5) * 1500;
    this.y[i] = anywhere ? 80 + Math.random() * 1000 : 80 + Math.random() * 600;
    this.vx[i] = 0; this.vy[i] = 0;
    this.rot[i] = Math.random() * TAU; this.vr[i] = (Math.random() - 0.5) * 6;
    this.size[i] = 3 + Math.random() * 6;
    this.shape[i] = (Math.random() * 3) | 0;
    this.age[i] = Math.random() * 6;
  }
  update(dt, world) {
    const { wind, tornado, terrain, heli } = world;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      wind.sample(this.x[i], this.y[i], _w);
      tornado.forceAt(this.x[i], this.y[i], _f, 3.2);
      // debris is light: relative-velocity drag toward a wind-driven airspeed + tornado force
      const ax = (_w.x * 2.6 - this.vx[i]) * 1.4 + _f.ax;
      const ay = 40 + (_w.y * 2 - this.vy[i]) * 1.4 + _f.ay;
      this.vx[i] += ax * dt; this.vy[i] += ay * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt * (1 + _f.f * 6);
      const ty = terrain.heightAt(this.x[i]);
      if (this.y[i] > ty - 2) { this.y[i] = ty - 2; this.vy[i] *= -0.3; this.vx[i] *= 0.7; }
      if (Math.abs(this.x[i] - heli.x) > 1000 || this.x[i] < -50 || this.x[i] > WORLD_W + 50 || this.age[i] > 14) {
        // recycle near the helicopter, biased upwind so the storm feels continuous
        this.spawn(i, heli.x + (wind.x > 0 ? -600 : 600), 0, false);
      }
    }
  }
}

export class Popups {
  constructor(count = 10) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.t = new Float32Array(count);
    this.text = new Array(count).fill('');
    this.next = 0;
  }
  add(x, y, text) {
    const i = this.next; this.next = (this.next + 1) % this.count;
    this.x[i] = x; this.y[i] = y; this.t[i] = 1.6; this.text[i] = text;
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.t[i] > 0) { this.t[i] -= dt; this.y[i] -= 38 * dt; }
    }
  }
}

/** Blood: red pixels that fly, then stick to the ground / walls and fade after a while. */
export class Blood {
  constructor(count = 1500) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.life = new Float32Array(count); this.size = new Float32Array(count);
    this.stuck = new Uint8Array(count);
    this.next = 0;
  }
  reset() { this.life.fill(0); this.stuck.fill(0); }
  emit(x, y, n, speed, dirX = 0, dirY = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.count;
      const a = Math.random() * TAU, s = speed * (0.2 + Math.random() * 0.8);
      this.x[i] = x + (Math.random() - 0.5) * 6; this.y[i] = y + (Math.random() - 0.5) * 6;
      this.vx[i] = Math.cos(a) * s + dirX * (0.4 + Math.random() * 0.6); this.vy[i] = Math.sin(a) * s + dirY * (0.4 + Math.random() * 0.6);
      this.life[i] = 8 + Math.random() * 7; this.size[i] = 2.2 + Math.random() * 3.4; this.stuck[i] = 0;
    }
  }
  update(dt, terrain) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.stuck[i]) continue;
      this.vy[i] += GRAVITY * dt; this.vx[i] *= 1 - 0.8 * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      const ty = terrain.heightAt(this.x[i]);
      if (this.y[i] >= ty - 0.5) { this.y[i] = ty - 1; this.stuck[i] = 1; this.vx[i] = this.vy[i] = 0; }
    }
  }
}

/** Gibs: the pieces of a shredded body. Each is a bone, torso chunk or head that tumbles, bounces and leaves a blood trail. */
export class Gibs {
  constructor(count = 160) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.ang = new Float32Array(count); this.av = new Float32Array(count);
    this.len = new Float32Array(count); this.kind = new Uint8Array(count);
    this.life = new Float32Array(count); this.trail = new Float32Array(count);
    this.hat = new Uint8Array(count);
    this.next = 0;
  }
  reset() { this.life.fill(0); }
  add(x, y, ang, len, kind, vx, vy, av, hat = 0) {
    const i = this.next; this.next = (this.next + 1) % this.count;
    this.x[i] = x; this.y[i] = y; this.ang[i] = ang; this.len[i] = len; this.kind[i] = kind;
    this.vx[i] = vx; this.vy[i] = vy; this.av[i] = av; this.life[i] = 16 + Math.random() * 6; this.trail[i] = 0; this.hat[i] = hat;
  }
  update(dt, terrain, blood) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const sp = Math.hypot(this.vx[i], this.vy[i]);
      if (sp > 4 || this.y[i] < terrain.heightAt(this.x[i]) - 3) {
        this.vy[i] += GRAVITY * 0.95 * dt; this.vx[i] *= 1 - 0.35 * dt;
        this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.ang[i] += this.av[i] * dt;
        if (sp > 70) {                                   // blood trail while flying
          this.trail[i] += dt;
          if (this.trail[i] > 0.035) { this.trail[i] = 0; blood.emit(this.x[i], this.y[i], 1, 40, this.vx[i] * 0.1, this.vy[i] * 0.1); }
        }
        const ty = terrain.heightAt(this.x[i]);
        if (this.y[i] > ty - 2) {
          this.y[i] = ty - 2;
          if (this.vy[i] > 90) blood.emit(this.x[i], this.y[i] - 2, 4, 110, 0, -60);
          this.vy[i] *= -0.32; this.vx[i] *= 0.6; this.av[i] *= 0.5;
          if (Math.abs(this.vy[i]) < 25) { this.vy[i] = 0; this.vx[i] *= 0.7; this.av[i] *= 0.6; }
        }
      }
    }
  }
}

/** Puffs: soft growing clouds for rooftop steam, rotor downwash dust/spray and engine smoke. kind 0 steam, 1 dust, 2 smoke, 3 spray, 4 sand */
export class Puffs {
  constructor(count = 200) {
    this.count = count;
    this.x = new Float32Array(count); this.y = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.life = new Float32Array(count); this.max = new Float32Array(count);
    this.size = new Float32Array(count); this.grow = new Float32Array(count);
    this.kind = new Uint8Array(count);
    this.next = 0;
  }
  reset() { this.life.fill(0); }
  add(x, y, vx, vy, life, size, grow, kind) {
    const i = this.next; this.next = (this.next + 1) % this.count;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.kind[i] = kind;
  }
  update(dt, wind) {
    const wx = wind ? wind.x : 0;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = this.kind[i];
      this.vx[i] += (wx * 0.9 - this.vx[i]) * 0.8 * dt;
      if (k === 3) this.vy[i] += GRAVITY * 0.4 * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] += this.grow[i] * dt;
    }
  }
}
