// 2D convex hulls with a vertical interval. Coordinates are in world metres.
export function hull(points) {
  points = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  function chain(list) {
    const q = []
    for (const p of list) {
      while (q.length > 1) {
        const a = q[q.length - 2],
          b = q[q.length - 1]
        if ((b[0] - a[0]) * (p[1] - a[1]) > (b[1] - a[1]) * (p[0] - a[0]) + 1e-8) break
        q.pop()
      }
      q.push(p)
    }
    return q.slice(0, -1)
  }
  return [...chain(points), ...chain(points.reverse())]
}
export function boxHull(x, z, width, length, yaw = 0) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw)
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => [
    x + (c * u * width) / 2 + (s * v * length) / 2,
    z - (s * u * width) / 2 + (c * v * length) / 2,
  ])
}
export function circleHits(x, z, r, poly) {
  let inside = true
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      px = x - a[0],
      pz = z - a[1]
    if (dx * pz - dz * px < 0) inside = false
    const t = Math.max(0, Math.min(1, (dx * px + dz * pz) / (dx * dx + dz * dz || 1)))
    if ((px - t * dx) ** 2 + (pz - t * dz) ** 2 <= r * r) return true
  }
  return inside
}
// Intersect the time interval on every separating axis. Angular padding bounds
// each corner's arc for the whole substep, including a purely rotating bumper.
export function sweepHull(a, b, dx, dz, padding = 0, contact = null) {
  let entry = -Infinity,
    exit = Infinity, nx = 0, nz = 0
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const j = (i + 1) % p.length,
        ax = p[j][1] - p[i][1],
        az = p[i][0] - p[j][0],
        len = Math.hypot(ax, az)
      if (len < 1e-9) continue
      let lo = Infinity,
        hi = -Infinity,
        left = Infinity,
        right = -Infinity
      for (const v of a) {
        const d = v[0] * ax + v[1] * az
        lo = Math.min(lo, d)
        hi = Math.max(hi, d)
      }
      for (const v of b) {
        const d = v[0] * ax + v[1] * az
        left = Math.min(left, d)
        right = Math.max(right, d)
      }
      const speed = dx * ax + dz * az,
        margin = padding * len
      if (Math.abs(speed) < 1e-10) {
        if (hi + margin < left || lo - margin > right) return 1
        continue
      }
      const t0 = (left - hi - margin) / speed,
        t1 = (right - lo + margin) / speed
      const start = Math.min(t0, t1)
      if (contact && start > entry) {
        const scale = -Math.sign(speed) / len
        nx = ax * scale
        nz = az * scale
      }
      entry = Math.max(entry, start)
      exit = Math.min(exit, Math.max(t0, t1))
      if (exit < entry || exit < 0 || entry > 1) return 1
    }
  if (contact) { contact.nx = nx; contact.nz = nz }
  return Math.max(0, Math.min(1, entry))
}
