// Clearance is positive inside the playable county. Scenery extends beyond it.
export const bounds = Object.freeze({ west: -660, east: 660, north: -690, south: 470 })
export function clearance(x, z) {
  return Math.min(x - bounds.west, bounds.east - x, z - bounds.north, bounds.south - z)
}
export function limitX(x, margin) {
  return Math.max(bounds.west + margin, Math.min(bounds.east - margin, x))
}
export function limitZ(z, margin) {
  return Math.max(bounds.north + margin, Math.min(bounds.south - margin, z))
}
// Largest projection of a rotating rectangle onto an axis during one fixed tick.
function support(width, length, from, to) {
  const a = Math.min(from, to),
    b = Math.max(from, to)
  const project = (t) => width * Math.abs(Math.cos(t)) + length * Math.abs(Math.sin(t))
  const peak = Math.atan2(length, width)
  for (const t of [peak, -peak]) {
    if (t + Math.ceil((a - t) / Math.PI) * Math.PI <= b) return Math.hypot(width, length)
  }
  return Math.max(project(a), project(b))
}
export function carMargins(spec, yaw, turn = 0) {
  const w = spec.width / 2,
    l = spec.length / 2
  return [support(w, l, yaw, yaw + turn) + 0.002, support(l, w, yaw, yaw + turn) + 0.002]
}
