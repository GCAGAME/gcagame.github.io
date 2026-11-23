import { strict as assert } from 'node:assert'
import * as THREE from 'three'
import { createWorld } from '../src/world.js'
import { createSimulation } from '../src/simulation.js'
import { boxHull, sweepHull, circleHits } from '../src/collision.js'
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
let showroom
scene.traverse((object) => {
  if (object.isLOD && object.parent.name === 'Veloce GT') showroom = object
})
assert(showroom, 'showroom uses vehicle LOD')
const eye = new THREE.PerspectiveCamera()
const displayPosition = showroom.getWorldPosition(new THREE.Vector3())
for (const [distance, close] of [[80, false], [4, true]]) {
  eye.position.copy(displayPosition)
  eye.position.z += distance
  eye.updateMatrixWorld()
  showroom.update(eye)
  assert.equal(showroom.levels[0].object.visible, close)
  assert.equal(showroom.levels[1].object.visible, !close)
}
const key = new Set(),
  dt = 1 / 30
let turns = 0,
  brakes = 0,
  stops = 0,
  resumes = 0,
  overlaps = 0,
  onPeople = 0,
  offRoad = 0
const traveled = sim.traffic.map(() => 0),
  last = sim.traffic.map((c) => [c.x, c.z, c.speed]),
  waits = sim.traffic.map(() => false)
let firstIssue
for (let t = 0; t < 150 * 30; t++) {
  world.update(dt, { ...sim.player, hour: 11, night: false })
  sim.update(dt, { keys: key, settings: { quality: 'Medium' }, hour: 11, night: false })
  sim.traffic.forEach((c, i) => {
    if (!c.active) return
    const [x, z, v] = last[i],
      delta = Math.hypot(x - c.x, z - c.z)
    traveled[i] += delta
    last[i] = [c.x, c.z, c.speed]
    if (c.turnSignal && Math.abs(c.steer) > 0.1) turns++
    if (c.braking && c.speed > 1 && v > c.speed) brakes++
    if (c.speed < 0.25 && !waits[i]) {
      stops++
      waits[i] = true
    }
    if (c.speed > 3 && waits[i]) {
      resumes++
      waits[i] = false
    }
    if (t % 8 !== 0) return
    if (!['road', 'asphalt'].includes(world.surface(c.x, c.z))) offRoad++
    const a = boxHull(c.x, c.z, c.spec.width, c.spec.length, c.yaw)
    for (const v of sim.traffic.slice(i + 1).concat(sim.cars)) {
      if (!v.active || Math.hypot(c.x - v.x, c.z - v.z) > 6) continue
      if (sweepHull(a, boxHull(v.x, v.z, v.spec.width, v.spec.length, v.yaw), 0, 0) < 1) {
        overlaps++
        firstIssue ||= { t, c: c.id, v: v.id, at: [c.x, c.z] }
      }
    }
    for (const p of [sim.player, ...sim.npcs])
      if (Math.hypot(c.x - p.x, c.z - p.z) < 4 && circleHits(p.x, p.z, 0.23, a)) {
        onPeople++
        firstIssue ||= { t, c: c.id, person: p.name, at: [c.x, c.z] }
      }
  })
}
const checks = {
  turns,
  brakes,
  stops,
  resumes,
  overlaps,
  onPeople,
  offRoad,
  traveled: traveled.map(Math.round),
  firstIssue,
}
console.log(JSON.stringify(checks))
assert(turns > 0 && brakes > 0 && stops > 0 && resumes > 0 && traveled.every((d) => d > 45))
assert.equal(overlaps, 0)
assert.equal(onPeople, 0)
assert.equal(offRoad, 0)
// Isolate a northbound approach to the signal at the origin, then release it.
const light = world.signalOpen
const lead = sim.traffic[0],
  route = lead.route
function approachSignal() {
  const start = route.points[6]
  lead.progress = route.lengths.slice(0, 6).reduce((a, b) => a + b, 0) + start.y - 33
  Object.assign(lead, { x: start.x, z: 33, yaw: 0, speed: 8, active: true })
}
function tickCount(count) {
  for (let i = 0; i < count; i++) {
    world.update(dt, { ...sim.player, hour: 11, night: false })
    sim.update(dt, { keys: key, settings: { quality: 'Medium' }, hour: 11, night: false })
  }
}
approachSignal()
world.signalOpen = () => false
tickCount(30 * 12)
console.log('signal stop', lead.x, lead.z, lead.speed)
assert(lead.z >= 9.5 && lead.z < 11 && lead.speed < 0.05)
world.signalOpen = () => true
tickCount(30 * 4)
assert(lead.z < 5 && lead.speed > 3)
world.signalOpen = light
for (const [x, z] of [[-7.048, 61.738], [-6.421, 63.068], [-9.422, 62.858], [-8.795, 64.187]])
  assert(Math.abs(world.height(x, z) - .142) < 1e-7)
for (const [z, expected] of [[61.38, .142], [60.84, .097], [60.30, .052], [59.9, .052]])
  assert(Math.abs(world.height(-8, z) - expected) < 1e-7)
assert.equal(world.height(-6, 69), .11) // The sidewalk beside the driveway.
assert.equal(world.height(-15, 72), 0)
for (const c of sim.cars) {
  const hinge = c.model.detail.getObjectByName('Driver door hinge')
  const hasDoor = ['sedan', 'sports', 'offroad'].includes(c.type)
  assert.equal(!!hinge, hasDoor)
  c.model.setDoorOpen(1)
  if (hinge) assert(hinge.rotation.y < -1)
  c.model.setDoorOpen(0)
  if (hinge) assert.equal(Math.abs(hinge.rotation.y), 0)
}
const cars = sim.cars
assert(!sim.parkCar(cars[1], { x: cars[0].x, z: cars[0].z, yaw: 0 }))
assert(!sim.parkCar(cars[2], { x: -780, z: 0, yaw: 0 }))
assert(sim.parkCar(cars[2], { x: 24.1, z: -71, yaw: 0 }))
for (const car of cars) {
  const model = car.model,
    geo = model.coarse.geometry
  assert.equal(model.wheels.length, 4)
  assert(geo.index.count / 3 < 1400)
  const shader = {
    uniforms: {},
    vertexShader: '#include <color_vertex>',
    fragmentShader: '#include <lights_physical_fragment>',
  }
  model.coarse.material.onBeforeCompile(shader)
  const stock = shader.uniforms.paintTint.value.getHex()
  model.customize({ paint: '#d0a832', wheels: 'graphite' })
  assert.equal(shader.uniforms.paintTint.value.getHex(), 0xd0a832)
  assert.equal(shader.uniforms.graphite.value, 1)
  model.customize()
  assert.equal(shader.uniforms.paintTint.value.getHex(), stock)
  assert.equal(shader.uniforms.graphite.value, 0)
  model.setLamps(2, 1, 3, 0)
  assert.deepEqual(shader.uniforms.lampPower.value.toArray(), [2, 1, 3, 0])
}
console.log(
  'PASS fleet detailing, paint and rims, lamps, safe parking, and 150 simulated seconds of actual county traffic.',
)
