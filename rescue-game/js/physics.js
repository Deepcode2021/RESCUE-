// Collision / integration helpers shared by helicopter, survivors, and debris.
const _n = { x: 0, y: -1 };

/**
 * Resolve a single point of a body against the heightfield terrain.
 * Pushes body (x,y) out along the surface normal and reflects velocity.
 * @returns {number} normal impact speed (0 when no contact)
 */
export function resolveTerrainPoint(terrain, body, px, py, restitution) {
  const ty = terrain.heightAt(px);
  const pen = py - ty;
  if (pen <= 0) return 0;
  terrain.normalAt(px, _n);
  const depth = pen * -_n.y;
  body.x += _n.x * depth;
  body.y += _n.y * depth;
  const vn = body.vx * _n.x + body.vy * _n.y;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    const k = (1 + restitution) * vn;
    body.vx -= k * _n.x;
    body.vy -= k * _n.y;
  }
  return impact || 0.0001;
}

/** Closest point on segment AB to P; writes into out and returns squared distance. */
export function closestOnSegment(ax, ay, bx, by, px, py, out) {
  const abx = bx - ax, aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  out.x = ax + abx * t;
  out.y = ay + aby * t;
  out.t = t;
  const dx = px - out.x, dy = py - out.y;
  return dx * dx + dy * dy;
}

export function clampSpeed(body, max) {
  const s2 = body.vx * body.vx + body.vy * body.vy;
  if (s2 > max * max) {
    const k = max / Math.sqrt(s2);
    body.vx *= k; body.vy *= k;
  }
}
