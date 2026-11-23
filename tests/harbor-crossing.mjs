import { strict as assert } from 'node:assert'
import * as THREE from 'three'
import { createWorld } from '../src/world.js'
import { createSimulation } from '../src/simulation.js'
const brush = new Proxy(
  {},
  {
    get(_, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop() {} })
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 })
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
      return () => {}
    },
    set() {
      return true
    },
  },
)
globalThis.document = {
  createElement: () => ({ getContext: () => brush }),
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
}
THREE.FileLoader.prototype.load = function () {}
const scene = new THREE.Scene(),
  world = createWorld(scene),
  sim = createSimulation(scene, new THREE.PerspectiveCamera(), world)

// Compare the actual drawn triangles to the ground queried by tyres and feet.
world.update(1, { x: 150, z: -180 })
scene.updateMatrixWorld(true)
const groups = { asphalt: [], concrete: [], terrain: [] }
scene.traverse((mesh) => {
  if (!mesh.isMesh) return
  const group = mesh.name.startsWith('Terrain ') ? 'terrain' : mesh.material.name
  if (groups[group]) groups[group].push(mesh)
})
const ray = new THREE.Raycaster(undefined, new THREE.Vector3(0, -1, 0))
function top(x, z, group) {
  ray.ray.origin.set(x, 150, z)
  return ray.intersectObjects(groups[group], false)[0]?.point.y ?? -Infinity
}
for (let x = 72.25; x < 246; x += 1.5) {
  for (const offset of [-5.6, -4.2, 0, 4.2, 5.6]) {
    const z = -180 + offset,
      floor = world.height(x, z),
      mat = Math.abs(offset) > 4.5 ? 'concrete' : 'asphalt'
    const surface = top(x, z, mat)
    assert(
      Math.abs(surface - floor) < 0.006,
      `Surface mismatch at ${x}, ${z}: ${surface} vs ${floor}`,
    )
    assert(surface > top(x, z, 'terrain') + 0.015, `Terrain through road at ${x}, ${z}`)
    assert(!world.waterAt(x, z) && floor > world.waterLevel + 0.5)
  }
}
assert(world.waterAt(128, -190))
for (const x of [78.1, 110, 150, 179.9])
  for (const side of [-1, 1]) {
    const z = -180 + side * 6.36
    assert(world.blocked(x, z, 0.25, world.height(x, z) + 0.2), 'Guardrail must stop the player')
  }
// Both walk directions and both driving directions traverse the two bank transitions.
const initial = sim.serialize()
for (const driving of [false, true])
  for (const sign of [1, -1]) {
    const save = structuredClone(initial),
      x = sign > 0 ? 69 : 248,
      yaw = (-sign * Math.PI) / 2
    const start = { x, z: -180 + (driving ? 1.8 * sign : 5.35), yaw }
    Object.assign(save.player, start, { y: world.height(start.x, start.z) })
    save.current = driving ? 'sports' : null
    if (driving)
      Object.assign(
        save.cars.find((c) => c.id === 'sports'),
        start,
      )
    sim.restore(save)
    const actor = driving ? sim.vehicle : sim.player
    const keys = new Set(['KeyW', 'ShiftLeft'])
    for (let i = 0; i < 2400 && (actor.x - x) * sign < 178; i++) {
      sim.update(1 / 30, { keys })
      assert(!sim.player.swimming && actor.y >= world.waterLevel, 'Fell into water')
    }
    assert((actor.x - x) * sign >= 178, `Blocked at ${actor.x}, ${actor.z}, driving=${driving}`)
  }
// Drive directly into each rail. The vehicle hull must stop inside the walkway.
for (const side of [-1, 1]) {
  const save = structuredClone(initial)
  save.current = 'sports'
  const pose = { x: 132, z: -180, yaw: side < 0 ? 0 : Math.PI }
  Object.assign(
    save.cars.find((c) => c.id === 'sports'),
    pose,
  )
  Object.assign(save.player, pose)
  sim.restore(save)
  const keys = new Set(['KeyW'])
  for (let i = 0; i < 100; i++) sim.update(1 / 30, { keys })
  const drift = (sim.vehicle.z + 180) * side
  assert(drift > 1 && drift < 5, `Failed to stop at rail: ${drift}`)
}
for (const x of [-64, 0, 64])
  for (const z of [60, 0, -80, -130, -180]) {
    const hx = x === 0 ? 5.5 : 4.5,
      hz = z === -80 ? 5.5 : 4.5
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        for (let i = 0; i <= 10; i++) {
          const a = (i * Math.PI) / 20,
            xx = x + sx * (hx + 3.4 - 2.4 * Math.cos(a)),
            zz = z + sz * (hz + 3.4 - 2.4 * Math.sin(a))
          assert(
            Math.abs(world.height(xx, zz) - top(xx, zz, 'concrete')) < 0.008,
            `Gap in sidewalk at ${xx}, ${zz}`,
          )
        }
  }
console.log(
  'Passed deck and terrain contact across the inlet, both guardrails, four full traversals, and 60 rounded sidewalk corners.',
)
