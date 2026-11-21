// Road graph built from the same center lines as the street geometry.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export function createNavigation(roads) {
  const segments = [],
    nodes = [],
    byKey = new Map()
  function node(p) {
    const key = Math.round(p.x * 100) + ',' + Math.round(p.z * 100)
    if (byKey.has(key)) return byKey.get(key)
    const n = { x: p.x, z: p.z, edges: [] }
    nodes.push(n)
    byKey.set(key, n)
    return n
  }
  for (const line of roads)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i]
      if (distance(a, b) > 0.03) segments.push({ a, b, points: [node(a), node(b)] })
    }
  const cross = (x, z, u, v) => x * v - z * u
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i],
        t = segments[j],
        dx = s.b.x - s.a.x,
        dz = s.b.z - s.a.z,
        ux = t.b.x - t.a.x,
        uz = t.b.z - t.a.z
      const det = cross(dx, dz, ux, uz)
      if (Math.abs(det) < 0.0001) continue
      const x = t.a.x - s.a.x,
        z = t.a.z - s.a.z,
        ta = cross(x, z, ux, uz) / det,
        tb = cross(x, z, dx, dz) / det
      if (ta < -0.0001 || ta > 1.0001 || tb < -0.0001 || tb > 1.0001) continue
      const n = node({ x: s.a.x + dx * ta, z: s.a.z + dz * ta })
      s.points.push(n)
      t.points.push(n)
    }
  const links = []
  for (const s of segments) {
    const points = Array.from(new Set(s.points)).sort((a, b) => distance(a, s.a) - distance(b, s.a))
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        w = distance(a, b)
      if (w < 0.02) continue
      a.edges.push({ to: b, w })
      b.edges.push({ to: a, w })
      links.push({ a, b })
    }
  }
  function project(p) {
    let best = null,
      dist = Infinity
    for (const link of links) {
      const { a, b } = link,
        dx = b.x - a.x,
        dz = b.z - a.z,
        t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)))
      const q = { x: a.x + t * dx, z: a.z + t * dz },
        d = distance(p, q)
      if (d < dist) {
        dist = d
        best = { ...q, link }
      }
    }
    return best
  }
  function route(from, to) {
    const copy = (p) => ({ x: p.x, z: p.z })
    if (!to) return []
    const start = project(from),
      end = project(to)
    if (!start || !end || distance(from, to) < 14) return [copy(from), copy(to)]
    if (start.link === end.link) return [copy(from), copy(start), copy(end), copy(to)]
    const costs = new Map(),
      prev = new Map(),
      queue = []
    for (const n of [start.link.a, start.link.b]) {
      costs.set(n, distance(n, start))
      queue.push(n)
    }
    while (queue.length) {
      queue.sort((a, b) => costs.get(b) - costs.get(a))
      const n = queue.pop()
      for (const { to: m, w } of n.edges) {
        const c = costs.get(n) + w
        if (c >= (costs.get(m) ?? Infinity)) continue
        costs.set(m, c)
        prev.set(m, n)
        queue.push(m)
      }
    }
    const exits = [end.link.a, end.link.b].sort(
      (a, b) =>
        (costs.get(a) ?? Infinity) +
        distance(a, end) -
        (costs.get(b) ?? Infinity) -
        distance(b, end),
    )
    if (!costs.has(exits[0])) return [copy(from), copy(to)]
    const path = []
    for (let n = exits[0]; n; n = prev.get(n)) path.push(copy(n))
    return [copy(from), copy(start), ...path.reverse(), copy(end), copy(to)]
  }
  return { route }
}
