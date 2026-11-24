import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createSimulation } from '../src/simulation.js'
import { createWorld } from '../src/world.js'
import { boxHull, sweepHull } from '../src/collision.js'
import { measureImpact, impactInjury } from '../src/hardcore-vehicles.js'
import { createHardcoreCity } from '../src/hardcore-city.js'

// The same controller and fleet models used in the game, on an empty test
// street so geometry, not random ambient traffic, determines each impact.
const brush = new Proxy({}, { get: (_, key) => {
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} })
  if (key === 'measureText') return (s) => ({ width: String(s).length * 8 })
  if (key === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
  return () => {}
} })
globalThis.document = {
  createElement: () => ({ getContext: () => brush }),
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }),
}
THREE.FileLoader.prototype.load = () => {}
const obstacles = []
const world = {
  height: () => 0, surface: () => 'road', blocked: () => false,
  candidates: () => obstacles, signalOpen: () => true,
  roads: [[{ x: 0, z: 60 }, { x: 0, z: -180 }], [{ x: -64, z: 0 }, { x: 64, z: 0 }]],
  locations: { home: { x: -12, z: 67 }, depot: { x: 14, z: -88 } },
}
const camera = new THREE.PerspectiveCamera()
const sim = createSimulation(new THREE.Scene(), camera, world)
const crimes = [], crashes = []
const owned = new Set(['sedan'])
const hooks = {
  spawnRandom: () => .1,
  isOwned: (id) => owned.has(id),
  onCrime: (...crime) => crimes.push(crime),
  onCrash: (crash) => crashes.push(crash),
}
function step(seconds, ...keys) {
  const input = { keys: new Set(keys) }
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1 / 60, input)
}
function enter(car) {
  const side = -(car.spec.width * .5 + .57), z = car.model.cabin.z
  Object.assign(sim.player, { x: car.x + Math.cos(car.yaw) * side + Math.sin(car.yaw) * z,
    y: 0, z: car.z - Math.sin(car.yaw) * side + Math.cos(car.yaw) * z })
  assert.equal(sim.enterExit().ok, true)
  step(1.3)
  assert.equal(sim.vehicle, car)
}
function placePlayerCar(x, z, speed) {
  const save = sim.serialize()
  save.current = 'sedan'
  Object.assign(save.cars.find((v) => v.id === 'sedan'), { x, z, yaw: 0 })
  Object.assign(save.player, { x, z, health: 100 })
  sim.restore(save)
  sim.vehicle.speed = speed
  crashes.length = crimes.length = 0
}
assert.equal(sim.patrolCars.length, 0)
assert.equal(sim.traffic.length, 8)
sim.setHardcore(true, hooks)
sim.reset()
assert.equal(sim.traffic.filter((v) => v.reckless).length, 1)
assert.equal(sim.patrolCars.filter((v) => v.active).length, 1)
assert.equal(sim.canUseWeapon, true)
sim.toggleCamera()
step(.1, 'MouseRight')
assert.equal(sim.aimFirstPerson, true)
step(.1)
assert.equal(sim.aimFirstPerson, false)
assert.equal(sim.firstPerson, false)
enter(sim.cars[0])
assert.equal(sim.canUseWeapon, false)
assert.deepEqual(crimes, [])
sim.respawn()
enter(sim.cars[1])
assert.deepEqual(crimes.map((c) => c[0]), ['theft'])
sim.respawn()
owned.add('suv')
enter(sim.cars[1])
assert.equal(crimes.length, 1)
sim.respawn()
const cruiser = sim.patrolCars[0]
assert.equal(sim.dispatchPatrol(0, { x: 0, z: -50 }, { x: 400, z: 400 }), null)
assert.equal(sim.dispatchPatrol(0, { x: 0, z: -50 }, cruiser), cruiser)
assert.equal(cruiser.available, false)
const oldZ = cruiser.z
step(3)
assert(Math.abs(cruiser.z - oldZ) > 2, 'patrol physically drives on a route')
sim.stopPatrol(cruiser)
enter(cruiser)
assert.equal(crimes.at(-1)[0], 'policeTheft')
const patrolSave = sim.serialize()
assert.equal(patrolSave.cars.length, 5)
sim.restore(patrolSave)
assert.equal(sim.vehicle.id, 'patrol-0')
assert.equal(sim.dispatchPatrol(0, { x: 0, z: 0 }), null)
sim.respawn()
assert.equal(sim.vehicle, null)
assert.equal(cruiser.available, true)
assert.equal(sim.player.health, 100)

obstacles.push({ x: 350, z: 83, w: 80, d: .3, y: 0, top: 4, poly: boxHull(350, 83, 80, .3) })
placePlayerCar(350, 86.4, 3)
step(.8)
assert.equal(sim.player.health, 100)
placePlayerCar(350, 95, 20)
step(1)
assert.equal(crashes.length, 1)
assert(crashes[0].closingSpeed > 18 && crashes[0].damage > 40 && sim.player.health < 60)
placePlayerCar(350, 95, 42)
step(.8)
assert.equal(sim.player.health, 0)
sim.respawn()

// Holding the accelerator on a centred vehicle well before contact can
// report a ram. Coasting into the same vehicle still causes collision damage.
function ram(throttle) {
  const save = sim.serialize()
  Object.assign(save.cars[1], { x: 350, z: 32, yaw: 0 })
  sim.restore(save)
  placePlayerCar(350, 56, 16)
  step(1.8, ...(throttle ? ['KeyW'] : []))
  assert(crashes.some((c) => c.other === sim.cars[1]))
  assert(sim.player.health < 100)
}
ram(false)
assert(!crimes.some((c) => c[0] === 'ram'))
ram(true)
assert(crimes.some((c) => c[0] === 'ram'))

const heavy = { yaw: 0, speed: 16, spec: { mass: 2200 } }
const light = { yaw: 0, speed: 16, spec: { mass: 1350 } }
assert.equal(measureImpact(heavy, light, 0, 1).closingSpeed, 0)
light.speed = 0
const rear = measureImpact(heavy, light, 0, 1)
assert(rear.deltaB > rear.deltaA)
assert.equal(impactInjury(measureImpact(heavy, null, 1, 0).deltaA), 0)

// Put the player in the path of an already speeding driver. Neither its lane
// choice nor the burst of speed depends on the player's position.
const r = sim.traffic.find((v) => v.reckless)
const start = r.route.points[6]
const distToStraight = r.route.lengths.slice(0, 6).reduce((a, b) => a + b, 0)
placePlayerCar(start.x + 31, start.y, 0)
Object.assign(r, { x: start.x + 12, z: start.y, progress: distToStraight + 12, yaw: -Math.PI / 2,
  travelYaw: -Math.PI / 2, speed: 16, burstUntil: 30, burstAt: 60, reportAfter: 0 })
step(2)
assert(crashes.some((c) => c.car === r && c.other === sim.vehicle && c.damage > 0))
assert(r.driverHealth < 100)
assert(!crimes.some((c) => c[0] === 'ram'))
assert(crimes.some((c) => c[0] === 'recklessDriving' && c[1] === r))
const suspect = { x: r.x, z: r.z, health: r.driverHealth }
sim.restore(sim.serialize())
assert(Math.hypot(r.x - suspect.x, r.z - suspect.z) < .4)
assert.equal(r.driverHealth, suspect.health)
sim.respawn()
sim.reset()
world.signalOpen = () => false
Object.assign(r, { x: -23, z: start.y, progress: distToStraight - 23 - start.x,
  yaw: -Math.PI / 2, travelYaw: -Math.PI / 2, speed: 14, burstUntil: 12, burstAt: 30 })
step(3)
assert(r.x > 1, 'speeding driver crosses a red light along its own route')
world.signalOpen = () => true
sim.setHardcore(false)
sim.reset()
assert.equal(sim.patrolCars.length, 0)
assert.equal(sim.traffic.length, 8)
assert(sim.traffic.every(c => !Object.hasOwn(c, 'driverHealth')))
assert(!Object.hasOwn(sim.serialize(), 'patrolCars'))
assert(!Object.hasOwn(sim.serialize(), 'trafficDrivers'))
assert.equal(sim.canUseWeapon, false)
sim.setHardcore(true, hooks)
sim.reset()
assert.equal(sim.patrolCars.length, 5)
assert.equal(sim.traffic.filter((v) => v.reckless).length, 1)
console.log('PASS collision severity, minor impacts, ramming, reckless traffic, patrol driving and theft, ownership, respawn, persistence, mode isolation.')

// Normal drivers use the same injury curve, including when already below 15 HP.
sim.setHardcore(false, hooks)
for (const [speed, health, fatal] of [[3,100,false], [20,100,false], [20,10,true]]) {
  placePlayerCar(350, speed === 3 ? 86.4 : 95, speed)
  sim.player.health = health
  step(1)
  assert.equal(sim.fatalCrash, fatal)
  if (speed === 3) assert.equal(sim.player.health, health)
  else assert(sim.player.health < health)
  if (fatal) assert.equal(sim.player.health, 0)
}
sim.respawn()
assert.equal(sim.fatalCrash,false)

// The simulation above isolates impact forces. Exercise the same extra cars
// on the generated county's roads with its actual buildings and other cars.
const countyScene = new THREE.Scene(), county = createWorld(countyScene)
const live = createSimulation(countyScene, new THREE.PerspectiveCamera(), county)
live.setHardcore(true, { spawnRandom: () => .1 })
live.reset()
const patrol = live.dispatchPatrol(0, { x: 62, z: -78 }, live.patrolCars[0])
const extra = [live.traffic.find(c => c.reckless), patrol]
const traveled = [0, 0], previous = extra.map(c => [c.x, c.z])
const countyInput = { keys: new Set(), hour: 11 }
for (let i = 0; i < 70 * 30; i++) {
  county.update(1 / 30, { ...live.player, hour: 11, night: false })
  live.update(1 / 30, countyInput)
  if (i % 6) continue
  for (const [index, c] of extra.entries()) {
    const body = boxHull(c.x, c.z, c.spec.width, c.spec.length, c.yaw)
    traveled[index] += Math.hypot(c.x - previous[index][0], c.z - previous[index][1])
    previous[index] = [c.x, c.z]
    for (const obstacle of county.candidates(c.x, c.z, c.hullRadius)) {
      if (obstacle.top < c.y + .11 || obstacle.y > c.y + c.spec.roof) continue
      assert.equal(sweepHull(body, obstacle.poly, 0, 0), 1, c.id + ' intersected scenery')
    }
    for (const other of live.traffic.concat(live.cars, live.patrolCars)) {
      if (other === c || !other.active || Math.hypot(c.x - other.x, c.z - other.z) > 7) continue
      assert.equal(sweepHull(body, boxHull(other.x, other.z, other.spec.width, other.spec.length, other.yaw), 0, 0),
        1, JSON.stringify({ frame: i, car: [c.id, c.x, c.z, c.yaw, c.speed],
          other: [other.id, other.x, other.z, other.yaw, other.speed] }))
    }
  }
}
assert(traveled[0] > 80 && traveled[1] > 15)
console.log('PASS 70 simulated seconds on county roads; reckless driver and patrol traveled', traveled.map(Math.round), 'metres with clear hulls.')

// Resume a witnessed pursuit on the northbound road and drive under ordinary
// controls, keeping a cruiser in view until the sport coupe opens a gap.
live.reset()
const city = createHardcoreCity(countyScene, county, live, { random: () => .85 })
city.setEnabled(true)
const save = live.serialize(), caseSave = city.serialize()
Object.assign(save.cars.find(c => c.id === 'sports'), { x: 2, z: -185, yaw: 0 })
Object.assign(save.player, { x: 2, z: -185, yaw: 0 })
Object.assign(save.patrolCars[0], { x: 2, z: -164, yaw: 0 })
save.current = 'sports'
caseSave.cases = [{ id: 'player', stars: 1, last: { x: 2, z: -185 }, unseen: 0, decay: 18 }]
Object.assign(caseSave.officers[0], { x: 2, z: -164, riding: true, active: true, suspect: 'player' })
live.restore(save)
city.restore(caseSave)
assert.equal(city.wanted, 1)
assert.equal(live.patrolCars[0].driverActive, true)
live.vehicle.speed = 20
live.patrolCars[0].speed = 8
let peakGap = 0, sawSearch = false, activePursuit = false
for (let i = 0; i < 42 * 30 && city.wanted; i++) {
  const keys = new Set()
  if (live.player.z > -302 + live.vehicle.speed ** 2 / 22) keys.add('KeyW')
  else keys.add('Space')
  county.update(1 / 30, { ...live.player, hour: 11, night: false })
  live.update(1 / 30, { ...countyInput, keys })
  city.update(1 / 30)
  const unit = live.patrolCars[0]
  peakGap = Math.max(peakGap, Math.hypot(unit.x - live.player.x, unit.z - live.player.z))
  sawSearch ||= city.status === 'Searching'
  activePursuit ||= unit.driverActive && unit.speed > 8 && unit.z < -170
}
assert(activePursuit && sawSearch && peakGap > 55 && live.player.z < -270 && city.wanted === 0,
  JSON.stringify({ activePursuit, sawSearch, peakGap, z: live.player.z, policeZ: live.patrolCars[0].z, wanted: city.wanted }))
console.log('PASS sport coupe escaped north past the trailhead under normal driving controls; peak cruiser gap', Math.round(peakGap), 'metres.')

// A normal start at Cedar House should produce an observable theft of the
// real starter car, followed by an opportunity to recover that same car.
live.reset()
city.restore()
const starter = live.cars[0], home = { x: starter.x, z: starter.z }
const kit = live.npcs.find(n => n.role === 'reckless-pedestrian' && n.slot === 0)
let opened = false, boarded = false, maxTravel = 0
for (let frame = 0; frame < 50 * 30; frame++) {
  live.update(1 / 30, countyInput)
  city.update(1 / 30)
  opened ||= !!kit.theft?.opening
  if (starter.npcDriver === kit) {
    if (!boarded) {
      const driveSave = live.serialize(), streetSave = city.serialize()
      live.restore(driveSave)
      city.restore(streetSave)
      assert.equal(starter.npcDriver, kit)
      assert.equal(kit.ride, starter)
      assert.notEqual(live.nearestCar(), starter)
    }
    boarded = true
    maxTravel = Math.max(maxTravel, Math.hypot(starter.x - home.x, starter.z - home.z))
  } else if (boarded) break
}
assert(opened && boarded, 'Cedar House resident reached the driver door and stole the starter car')
assert(maxTravel > 8, 'the stolen car moved ' + maxTravel + ' metres')
assert.equal(kit.inVehicle, false)
assert(live.availableToSteal(starter))
assert.equal(city.wanted, 0)
console.log('PASS visible starter-car theft, occupied-car exclusion, save/load and recovery;', Math.round(maxTravel), 'metres driven.')

let roll = .25
live.setHardcore(true, { spawnRandom: () => roll })
live.reset()
assert(!live.traffic.some(c => c.reckless))
const empty = live.serialize()
roll = .24999
live.restore(empty)
assert(!live.traffic.some(c => c.reckless), 'loading an empty slot preserves the next scheduled roll')
for (let i = 0; i < 26 * 30; i++) live.update(1 / 30, countyInput)
assert.equal(live.traffic.filter(c => c.reckless && !c.police).length, 1)
for (const [sample, expected] of [[.05, 'pickup'], [.44, 'sedan'], [.8, 'suv']]) {
  const values = [.24999, sample, .5, .3]
  live.setHardcore(true, { spawnRandom: () => values.shift() ?? .4 })
  live.reset()
  const rusty = live.traffic.find(c => c.reckless)
  assert.equal(rusty.type, expected)
  assert(!rusty.police && !rusty.setBeacon)
  live.restore(live.serialize())
  assert.equal(live.traffic.find(c => c.reckless).type, expected)
}
console.log('PASS 25% cutoff, later spawn, random civilian models and saved selection.')
