import * as THREE from 'three'
import { strict as assert } from 'node:assert'
import { createSimulation } from '../src/simulation.js'
import { createWorld } from '../src/world.js'
import { createCampaign } from '../src/campaign.js'
// Physics uses the actual generated county and controller. Graphics assets are
// left unloaded here so this deterministic input run also works on build hosts.
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
// This run exercises the actual county physics without uploading streamed art.
THREE.FileLoader.prototype.load = function () {}
globalThis.document = {
  createElement: () => ({ getContext: () => brush }),
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
}
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(68, 1.6, 0.1, 500)
const world = createWorld(scene),
  sim = createSimulation(scene, camera, world)
const completed = []
const campaign = createCampaign(world, sim, {
  dialog(kind) {
    assert.equal(kind, 'dispatcher')
    campaign.accept()
  },
  setHour(h) {
    gameHour = h
  },
  changed() {},
  chime() {},
  celebrate(c) {
    completed.push(c.title)
  },
  notify() {},
})
const dt = 1 / 45,
  set = (...k) => new Set(k)
let frame = 0,
  gameHour = 11,
  crossings = 0
const observed = new Set()
function step(keys = set(), x = 0, y = 0) {
  world.update(dt, { ...sim.player, hour: gameHour, night: gameHour > 20 })
  sim.update(dt, {
    keys,
    lookX: x,
    lookY: y,
    settings: { quality: 'Medium' },
    wet: 0,
    night: gameHour > 20,
    hour: gameHour,
  })
  for (const actor of sim.npcs) {
    if (!actor.crossing) observed.delete(actor)
    else if (!observed.has(actor)) {
      observed.add(actor)
      crossings++
      const c = actor.crossing
      assert(world.signalOpen(c.axis, c.x, c.z))
    }
  }
  campaign.update(dt, Math.abs(x) + Math.abs(y))
  frame++
}
const angle = (x) => Math.atan2(Math.sin(x), Math.cos(x))
for (let i = 0; i < 5; i++) step(set(), 7)
for (let i = 0; i < 100 && !sim.nearestCar(); i++) step(set('KeyW'))
while (campaign.state.step < 2 && frame < 160) step(set('KeyW'))
assert(sim.enterExit().entered)
for (let i = 0; i < 400 && !sim.vehicle; i++) step()
step()
assert.equal(campaign.state.step, 3)
function drive(points, speed = 7.8) {
  let i = 0,
    t = 0,
    stuck = 0
  for (; t < points.length * 1100 && i < points.length; t++) {
    const car = sim.vehicle,
      [x, z, r = 2.5] = points[i],
      dx = x - car.x,
      dz = z - car.z,
      d = Math.hypot(dx, dz)
    if (d < r) {
      i++
      continue
    }
    const diff = angle(Math.atan2(-dx, -dz) - car.yaw),
      keys = set()
    const target = Math.max(1.9, Math.min(speed, d * 0.8 + 1.6, speed / (1 + Math.abs(diff) * 1.7)))
    if (car.speed < target - 0.3) keys.add('KeyW')
    if (car.speed > target + 0.65) keys.add('Space')
    if (diff > 0.07) keys.add('KeyA')
    if (diff < -0.07) keys.add('KeyD')
    const ox = car.x,
      oz = car.z
    step(keys)
    if (Math.hypot(car.x - ox, car.z - oz) < 0.006) {
      stuck++
    } else stuck = 0
    if (stuck > 800) break
  }
  const c = sim.vehicle
  if (i < points.length) {
    console.error({
      stage: points[i],
      coords: [c.x, c.z],
      speed: c.speed,
      yaw: c.yaw,
      frame,
      obstacles: sim.traffic
        .filter((v) => Math.hypot(v.x - c.x, v.z - c.z) < 12)
        .map((v) => [v.x, v.z]),
    })
    return false
  }
  for (let i = 0; i < 150; i++) step(set('Space'))
  console.log('arrived', c.type, c.x, c.z, 'surface', world.surface(c.x, c.z), 'frames', frame)
  return true
}
assert(
  drive([
    [1.8, 57, 3.3],
    [2.5, 40],
    [2.5, 2],
    [2.5, -36],
    [2.8, -62],
    [7.8, -72, 4.5],
  ]),
)
assert(completed.includes('Welcome to the City'))
assert(sim.enterExit().ok)
// Follow streets with normal look and walking inputs. Each leg has a bounded timeout.
function walk(points) {
  for (const [x, z, r = 1.4] of points) {
    let reached = false
    for (let i = 0; i < 3000; i++) {
      const p = sim.player,
        dx = x - p.x,
        dz = z - p.z
      if (Math.hypot(dx, dz) < r) {
        reached = true
        break
      }
      const heading = Math.atan2(-dx, -dz)
      step(set('KeyW'), angle(p.yaw - heading) / 0.0022)
    }
    assert(reached, 'Walking to ' + [x, z] + ' stopped at ' + [sim.player.x, sim.player.z])
  }
}
const interact = () => {
  const action = campaign.interaction()
  assert(action, campaign.describe().objective)
  action.run()
  step()
}
walk([
  [8, -77],
  [8, -87.2],
  [14, -87, 2],
])
interact()
interact()
walk([
  [17, -87.2],
  [56, -87.2],
  [64, -96],
  [64, -167],
  [64, -172, 2],
  [67, -172, 2],
])
interact()
assert.equal(campaign.state.chapter, 2)
const restored = sim.serialize()
restored.player.x = 5.4
restored.player.z = -239
restored.player.y = world.height(5.4, -239)
sim.restore(restored)
assert(sim.enterExit().entered)
for (let i = 0; i < 400 && !sim.vehicle; i++) step()
assert.equal(sim.vehicle.type, 'offroad')
assert(
  drive(
    [
      [8, -244, 3.4],
      [22, -255],
      [29, -259, 3.5],
      [58, -264, 4],
      [80, -286, 4],
      [76, -309, 4],
      [99, -331, 4],
      [139, -340, 4],
      [144, -353, 4],
      [125, -372, 6],
    ],
    6.1,
  ),
)
assert(sim.player.y > 10)
assert.equal(campaign.state.chapter, 3)
console.log('PASS normal controlled driving on county roads and mountain switchbacks.', completed)
const staff = sim.npcs.filter((n) => n.shift)
for (let i = 0; i < 10000 && !staff.every((p) => p.z < -93 && p.to === p.from); i++) step()
console.log(
  'Shift arrivals',
  staff.map(({ name, x, z, from, to }) => ({ name, x, z, from, to })),
  'crossings',
  crossings,
)
assert(staff.every((p) => p.z < -93 && p.to === p.from))
assert(crossings > 0)
gameHour = 21.5
for (let i = 0; i < 12000 && !staff.every((p) => p.z > -88 && p.to === p.from); i++) step()
console.log(
  'Shift departures',
  staff.map(({ name, x, z, from, to }) => ({ name, x, z, from, to })),
)
assert(staff.every((p) => p.z > -88 && p.to === p.from))

// Begin the landmark tour on foot near the archive; walk between all three interactions.
const tour = sim.serialize()
tour.current = null
Object.assign(tour.player, { x: -49, z: -72, y: 0 })
sim.restore(tour)
interact()
walk([
  [-57, -72],
  [-57, -87.2],
  [64, -80],
  [64, -129],
  [64, -127],
  [73, -126, 1],
])
interact()
walk([
  [64, -127],
  [64, -129],
  [64, -80],
  [17, -87.2],
])
interact()
assert.equal(campaign.state.chapter, 4)
// Start the timed test in its marked bay. The loop drives through every checkpoint.
const start = sim.serialize()
Object.assign(
  start.cars.find((c) => c.id === 'sedan'),
  { x: 9, z: -72, yaw: Math.PI / 2 },
)
start.current = 'sedan'
sim.restore(start)
interact()
assert(
  drive(
    [
      [4, -73, 3],
      [2.3, -81, 3.1],
      [2.35, -119],
      [2.35, -168],
      [1, -176, 3],
      [-5, -182, 3],
      [-48, -182.2],
      [-64.2, -182, 1.6],
      [-65, -174, 3],
      [-66.2, -153],
      [-66.2, -94],
      [-69.7, -20],
      [-69.7, -6],
      [-69.7, 18],
      [-66.2, 44],
      [-66, 55, 3],
      [-61, 61, 3],
      [-47, 62],
      [-9, 62, 3],
      [-1, 60, 3],
      [2.35, 54],
      [2.35, 31],
      [2.35, 5],
      [2.35, -40],
      [2.35, -63],
      [7.7, -71.5, 2.6],
    ],
    8.3,
  ),
)
assert.deepEqual(campaign.state.completed, [0, 1, 2, 3, 4])
assert.equal(campaign.state.money, 1330)
console.log('All five campaigns paid out; end balance', campaign.state.money, completed)
