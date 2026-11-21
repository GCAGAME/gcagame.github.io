import * as THREE from 'three'
import { boxHull, hull } from './collision.js'

// One transform drives both the visible panel and its solid footprint.
export function movingDoor(world, group, x, z, base, width, height, face, lift) {
  const hinge = x - width / 2,
    thickness = 0.14
  const reach = width + thickness
  // Register every cell the leaf can reach, then narrow the bounds to its current pose.
  const body = world.rectangle(hinge, z, reach * 2, reach * 2, base, base + height)
  body.kind = 'door'
  let fraction = 0
  function pose(value) {
    const angle = lift ? 0 : face * value * 1.53
    const bottom = base + (lift ? value * (height - 0.03) : 0)
    const cx = hinge + (Math.cos(angle) * width) / 2,
      cz = z - (Math.sin(angle) * width) / 2
    return { angle, bottom, cx, cz, poly: boxHull(cx, cz, width, thickness, angle) }
  }
  function apply(value, p) {
    fraction = value
    group.rotation.y = p.angle
    group.position.y = body.y = p.bottom
    body.top = p.bottom + height
    body.poly = p.poly
    body.x = p.cx
    body.z = p.cz
    body.w = Math.abs(Math.cos(p.angle)) * width + Math.abs(Math.sin(p.angle)) * thickness
    body.d = Math.abs(Math.sin(p.angle)) * width + Math.abs(Math.cos(p.angle)) * thickness
  }
  apply(0, pose(0))
  return {
    get fraction() {
      return fraction
    },
    restore(value) {
      // A saved pose may share space with an NPC now following a different schedule.
      for (const v of [value, fraction, 1, 0]) {
        const p = pose(v)
        if (!world.doorOccupied(p.poly, p.bottom, p.bottom + height, 0, hinge, z, reach)) {
          apply(v, p)
          break
        }
      }
    },
    advance(target, dt) {
      if (target === fraction) return
      let end = THREE.MathUtils.damp(fraction, target, 7, dt)
      if (Math.abs(end - target) < 0.0005) end = target
      const start = fraction,
        steps = Math.max(1, Math.ceil(Math.abs(end - start) / 0.08))
      for (let i = 1; i <= steps; i++) {
        const v = start + ((end - start) * i) / steps,
          p = pose(v)
        // Chord plus sagitta covers the outer corners between both angular poses.
        const pad = reach * (1 - Math.cos((p.angle - group.rotation.y) / 2))
        const swept = lift ? body.poly : hull([...body.poly, ...p.poly])
        if (
          world.doorOccupied(
            swept,
            Math.min(body.y, p.bottom),
            Math.max(body.top, p.bottom + height),
            pad,
            hinge,
            z,
            reach,
          )
        )
          break
        apply(v, p)
      }
    },
  }
}
