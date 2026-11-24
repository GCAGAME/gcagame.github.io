// Clip a world-space segment against a convex collision footprint and its height.
// Doors use the same moving footprint and vertical interval as the physics engine.
export function prismFraction(from, to, shape) {
  let enter = 0, leave = 1
  function clip(start, change) {
    if (Math.abs(change) < 1e-9) return start >= 0
    const t = -start / change
    if (change > 0) enter = Math.max(enter, t)
    else leave = Math.min(leave, t)
    return enter <= leave
  }
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
  if (!clip(from.y - shape.y, dy) || !clip(shape.top - from.y, -dy)) return 1
  const poly = shape.poly
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ex = b[0] - a[0], ez = b[1] - a[1]
    if (!clip(ex * (from.z - a[1]) - ez * (from.x - a[0]), ex * dz - ez * dx)) return 1
  }
  return enter
}

export function worldHitFraction(world, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z
  const radius = Math.max(Math.abs(dx), Math.abs(dz)) / 2
  let end = 1
  for (const shape of world.candidates((to.x + from.x) / 2, (to.z + from.z) / 2, radius))
    end = Math.min(end, prismFraction(from, to, shape))
  // Terrain triangles and walkable decks can hide actors across a rise.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) * end / 2))
  for (let i = 1; i <= steps; i++) {
    const t = end * i / steps
    if (from.y + (to.y - from.y) * t < world.height(from.x + dx * t, from.z + dz * t) - 0.04)
      return t
  }
  return end
}

export function isWorldOccluded(world, from, to) {
  return worldHitFraction(world, from, to) < 0.9999
}
