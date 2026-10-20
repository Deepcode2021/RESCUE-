// Autopilot used by tests: flies the real simulation and rescues survivors. Also shared with the browser test.
import { clamp } from '../js/utils.js';
import { S } from '../js/survivors.js';
import { GRAVITY } from '../js/constants.js';

const ROPE_REACH = 19 * 11 + 30;   // anchor offset + deployed rope length

export class Bot {
  constructor(opts = {}) { this.convoy = opts.convoy !== undefined ? opts.convoy : process.env.CONVOY === '1'; this.phase = 'idle'; this.target = null; this.log = []; this.settle = 0; this.tdesc = 0; }

  // Compute control for world w. Returns {x, lift, ropeToggle}.
  control(w) {
    const h = w.heli, pad = w.terrain.pad;
    let tx = h.x, ty = h.y, vmax = 230, vmaxY = 170;
    const riders = w.riders;
    const waiting = w.survivors.filter((s) => s.state === S.WAITING || (s.state === S.FALLING && s.grounded));
    // convoy: with a free hook and a waiting survivor close by, go and fetch them too
    let detour = false;
    if (this.convoy && riders.length > 0 && riders.length < 2 && w.canGrab() && waiting.length && !this.noDetour(w)) {
      const near = Math.min(...waiting.map((s) => Math.abs(s.x - h.x)));
      detour = near < 750;
    }
    const carried = detour ? null : w.carried;
    // fuel: when low and not carrying anyone, hover just above the deck until topped up
    if (w.cfg.fuel) {
      if (!carried && w.fuel < 38) this.refuel = true;
      if (this.refuel && w.fuel >= 96) this.refuel = false;
    }
    if (this.refuel && !carried) {
      return this.fly(w, pad.cx, pad.y - 70, 220, 90);
    }
    if (carried) {
      // lift straight up first, then cross, then descend into the zone
      if (!this.carrying) { this.carrying = true; this.ledgeY = carried.y; this.phase = 'carry'; this.log.push('carry'); }
      const clearY = Math.min(pad.y - 700, this.ledgeY - 330);   // fixed at pickup: the survivor hangs from us, so carried.y moves with us
      const nearPad = Math.abs(h.x - pad.cx) < 50;
      if (nearPad || this.phase === 'deliver') { this.phase = 'deliver'; tx = pad.cx; ty = this.deliverY(w); vmax = 90; vmaxY = 80; }
      else { tx = (h.y > clearY + 40 && Math.abs(h.x - carried.x) < 120 && this.noTravel(w)) ? h.x : pad.cx; ty = clearY; vmax = 150; vmaxY = 150; }
    } else {
      if (!riders.length) this.carrying = false;
      // pick the nearest unresolved survivor that is standing/lying on terrain
      let best = null, bd = 1e9;
      for (const s of w.survivors) {
        if (s.state !== S.WAITING && !(s.state === S.FALLING && s.grounded)) continue;
        const d = riders.length ? Math.abs(s.x - h.x) : -s.x;   // alone: farthest from the safe zone first; with riders: nearest
        if (d < bd) { bd = d; best = s; }
      }
      if (best !== this.target) { this.target = best; this.phase = 'approach'; this.settle = 0; }
      if (!best) { tx = pad.cx; ty = pad.y - 400; }
      else {
        const sy = best.y - 16 - ROPE_REACH - 200;     // hook ends up ~200 above chest
        const hookDx = best.x - w.rope.hookX();
        if (this.phase === 'approach') {
          tx = best.x; ty = Math.min(sy - 40, h.y > sy ? h.y : sy);
          ty = Math.min(ty, pad.y - 700);
          if (Math.abs(h.x - best.x) < 25 && Math.abs(h.vx) < 25 && Math.abs(hookDx) < 35) { this.settle += 1 / 60; } else this.settle = 0;
          if (this.settle > 0.6) { this.phase = 'descend'; this.log.push('descend@' + w.time.toFixed(1)); this.tdesc = ty; }
          vmax = 260;
        } else {
          tx = best.x + clamp(hookDx * 0.9, -40, 40) * 0 + (best.x - w.rope.hookX()) * 0.5;
          this.tdesc += 55 / 60;
          ty = Math.min(this.tdesc, best.y - 16 - ROPE_REACH + 10);
          vmax = 90; vmaxY = 60;
          if (Math.abs(hookDx) > 90) this.phase = 'approach';
        }
      }
    }
    return this.fly(w, tx, ty, vmax, vmaxY);
  }

  /** Heli height at which the LOWEST rider's feet are ~40 above the SAFE ZONE floor. */
  deliverY(w) {
    const pad = w.terrain.pad; let low = -1e9;
    for (const r of w.riders) low = Math.max(low, r.y);
    return w.heli.y + (pad.y - 40 - low);
  }
  noDetour(w) { return w.tornado.active && w.tornado.ramp > 0.2 && Math.abs(w.tornado.x - w.heli.x) < 1000; }

  noTravel(w) { return w.carried && w.carried.state === S.ATTACHED && w.heli.y > w.carried.y - 330 && false; }

  fly(w, tx, ty, vmax, vmaxY) {
    const h = w.heli;
    // terrain clearance: when travelling far, climb above the highest ground on the path before moving sideways
    if (Math.abs(tx - h.x) > 160) {
      const dir = Math.sign(tx - h.x);
      let floorY = 1e9;
      for (let k = -150; k <= 420; k += 30) floorY = Math.min(floorY, w.terrain.heightAt(h.x + dir * k));
      const clear = floorY - 330;
      ty = Math.min(ty, clear);
      if (h.y > clear + 40) vmax = 0;
    }
    const vdx = clamp((tx - h.x) * 0.9, -vmax, vmax);
    const ax = 4 * (vdx - h.vx);
    const x = clamp(ax / 378 - w.wind.x / 378, -1, 1);
    const vdy = clamp((ty - h.y) * 1.1, -vmaxY, vmaxY);
    const ay = 4.5 * (vdy - h.vy);
    const c = clamp((GRAVITY - ay) / (GRAVITY * Math.max(0.6, Math.cos(h.angle)) * Math.max(0.3, h.power)), 0.5, 1.4);   // compensate thin air / flameout
    const lift = c >= 0.96 ? (c - 0.96) / 0.44 : (c - 0.96) / 0.3;
    return { x, lift: clamp(lift, -1, 1), ropeToggle: false };
  }
}
