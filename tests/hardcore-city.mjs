import assert from 'node:assert/strict'
import * as THREE from 'three'
import { boxHull, circleHits } from '../src/collision.js'
import { patrolStep } from '../src/hardcore-pedestrians.js'
import { makePerson } from '../src/people.js'
import { createHardcoreCity } from '../src/hardcore-city.js'

// A small street with an opaque wall lets these tests vary who actually
// witnessed an event, independently of camera culling and traffic timing.
const scene = new THREE.Scene()
const walls = []
const world = {
  height: () => 0, roads: [[{ x: -8, z: -220 }, { x: -8, z: 80 }]],
  candidates: () => walls,
  blocked: (x, z, r) => walls.some(w => circleHits(x, z, r, w.poly)),
}
const player = { x: 400, y: 0, z: 400, yaw: 0, health: 100 }
const sim = {
  player, cars: [], traffic: [], npcs: [], patrolCars: [],
  spawnCityPerson(index, x, z, role) {
    const p = { x, z, y: 0, yaw: 0, originX: x, originZ: z, model: makePerson(index, true), role }
    scene.add(p.model.group)
    this.npcs.push(p)
    return p
  },
  stopPatrol(c) { Object.assign(c, { driverActive: false, available: true, pursuitTarget: null }) },
  dispatchPatrol(i, target) {
    const c = this.patrolCars[i]
    if (!c || c.taken) return null
    Object.assign(c, { active: true, driverActive: true, available: false, pursuitTarget: { ...target } })
    return c
  },
}
for (const [i, [x,z]] of [[-4.5,25],[60,-104],[-60,-154],[4,-201],[-60,32]].entries())
  sim.patrolCars.push({ id: 'patrol-' + i, x, z, y: 0, yaw: 0, speed: 0, hullRadius: 2.6,
    spec: { width: 1.8, length: 4.6, roof: 1.5 }, active: i === 0, police: true, available: true })
const resident = sim.spawnCityPerson(2, -39, 52, 'resident')
const dispatcher = sim.spawnCityPerson(3, 15, -72, 'dispatcher')
let arrests = 0, hits = 0, injuries = 0, gunshots = 0
const city = createHardcoreCity(scene, world, sim, {
  random: () => .18, onArrest: () => arrests++,
  damagePlayer: amount => { player.health -= amount; injuries++ },
  showHit: () => hits++,
  onNpcShot: () => gunshots++,
})
function tick(seconds) { for (let i = 0; i < Math.ceil(seconds * 30); i++) city.update(1 / 30) }
const police = () => sim.npcs.filter(p => p.role === 'police')
const street = () => sim.npcs.filter(p => p.role === 'reckless-pedestrian')
function restart() {
  Object.assign(player, { x: 400, y: 0, z: 400, health: 100 })
  walls.length = 0
  city.restore()
}
assert.equal(city.reportCrime('shot'), false)
city.setEnabled(true)
assert.equal(street().length, 4)
assert.equal(police().length, 5)
assert.equal(city.targets().length, 7)
assert.equal(city.reportCrime('theft'), false)
assert.equal(city.wanted, 0)
assert.equal(city.reportCrime('policeTheft'), true)
assert.equal(city.wanted, 2)
restart()

// Local witnesses see the theft. Moving behind a closed wall breaks sight,
// and neither the search point nor the cruiser's assignment follows the player.
Object.assign(player, { x: -7.5, z: 17 })
assert(city.reportCrime('theft'))
tick(.4)
const reported = city.serialize().cases[0].last
walls.push({ x: -5.5, z: 17, y: 0, top: 5, poly: boxHull(-5.5, 17, .35, 80) })
Object.assign(player, { x: -2, z: 17 })
tick(1)
assert.equal(city.status, 'Searching')
assert.deepEqual(city.serialize().cases[0].last, reported)
Object.assign(player, { x: 400, z: 400 })
tick(19)
assert.equal(city.wanted, 0)
assert.equal(arrests, 0)

restart()
Object.assign(player, { x: -7.7, z: 21 })
assert(city.reportCrime('shot'))
assert(city.reportCrime('ram'))
assert(city.damageNpc(police()[0], 4))
assert(city.reportCrime('theft'))
assert.equal(city.wanted, 5)
tick(.32)
assert.equal(police().filter(p => p.file?.offender === player).length, 5)
assert(sim.patrolCars.filter(c => c.driverActive).length >= 3)
const saved = city.serialize()
const seated = police().filter(p => p.inVehicle).length
city.restore(saved)
assert.equal(city.wanted, 5)
assert.equal(police().filter(p => p.inVehicle && p.ride.driverActive && !p.ride.available).length, seated)
Object.assign(player, { x: 400, z: 400 })
tick(20)
assert(city.wanted > 0 && city.wanted < 5, 'stars fade individually')
tick(48)
assert.equal(city.wanted, 0)

restart()
Object.assign(player, { x: -7.5, z: 27.8 })
assert(city.reportCrime('shot'))
tick(.35)
const arresting = police().find(p => p.file?.offender === player && !p.inVehicle)
const stop = { x: arresting.x, z: arresting.z }
assert.equal(arresting.speedAI, 0)
assert.equal(arresting.goal, null)
assert(Math.hypot(player.x - stop.x, player.z - stop.z) > 2)
assert(city.mapActors().includes(arresting))
assert.equal(city.mapActors().filter(p => p.role === 'reckless-pedestrian').length, 4)
tick(1.2)
assert.deepEqual({ x: arresting.x, z: arresting.z }, stop)
assert.equal(arrests, 0)
tick(.6)
assert.equal(arrests, 1)
assert.equal(city.wanted, 0)

// A bystander who is attacked reacts, and the case belongs to the aggressor.
restart()
const instigator = street()[0]
instigator.nextAction = 0
Object.assign(instigator, { x: resident.x + 1, z: resident.z })
tick(1.4)
assert(hits > 0 && resident.health < resident.maxHealth)
assert(resident.fear && resident.managedAI)
assert(city.serialize().cases.some(f => f.id === 'street-0'))
assert.equal(city.wanted, 0)
const responder = police().find(p => p.file?.offender === instigator)
assert(responder)
Object.assign(responder.ride || responder, { x: instigator.x - 8, z: instigator.z })
tick(.6)
assert(instigator.fear && instigator.speedAI > 4, 'suspect flees a nearby officer')
assert(city.damageNpc(instigator, 500))
assert.equal(street().filter(p => !p.inactive && p.health > 0).length, 4)
assert(city.damageNpc(dispatcher, 500))
assert.equal(city.targets().includes(dispatcher), false)
tick(21)
assert(city.targets().includes(dispatcher), 'mission contacts return')

restart()
Object.assign(player, { x: 110, z: 110 })
Object.assign(instigator, { x: 111, z: 110, nextAction: 0 })
tick(1.4)
assert(injuries > 0 && player.health < 100)
assert.equal(city.wanted, 0)

// The uncommon armed actor warns first, fires once at the observed spot and
// breaks off. Moving out of the aim point during that warning avoids the hit.
for (const dodge of [false, true]) {
  restart()
  Object.assign(player, { x: 110, z: 110 })
  const armed = street()[3], before = gunshots
  Object.assign(armed, { x: 118, z: 110, nextAction: 0 })
  tick(.4)
  assert(armed.aimPoint)
  assert.equal(player.health, 100)
  if (dodge) player.z += 3
  tick(1.7)
  assert.equal(gunshots, before + 1)
  assert.equal(player.health, dodge ? 100 : 86)
  assert.equal(city.wanted, 0)
}
const driver = { id: 'driver', x: -7, z: 24, y: 0, yaw: 0, speed: 7, active: true,
  reckless: true, spec: { width: 2, length: 4, roof: 1.6 }, hullRadius: 2.3 }
sim.traffic.push(driver)
assert(city.reportCrime('reckless', driver))
assert.equal(driver.policePursued, true)
assert(city.serialize().cases.some(f => f.id === 'driver'))
assert.equal(city.wanted, 0)
city.setEnabled(false)
assert.equal(sim.npcs.length, 2)
assert.equal(resident.health, undefined)
assert.equal(driver.policePursued, false)
assert.equal(city.targets().length, 0)
city.setEnabled(true)
city.setEnabled(true)
assert.equal(street().length, 4)
assert.equal(new Set(sim.npcs).size, 11)
city.setEnabled(false)
console.log('City AI passed: witnesses, cruiser alarm, covered searches, pursuit scaling and decay, arrest, NPC fights, civilian flight, hostile damage, recovery, driver cases and repeated mode switches.')

// The direct line to an assignment runs into the middle of a long wall.
const obstruction = { poly: boxHull(0, 0, .8, 9) }
walls.push(obstruction)
const unit = { x: -3, y: 0, z: 0, goal: { x: 4, z: 0 }, speedAI: 3, aiStep: 1/30, side: 1 }
let around = false
for (let i = 0; i < 22*30; i++) {
  patrolStep(world, sim, unit, i/30)
  around ||= Math.abs(unit.z) > 4.5
  assert(!world.blocked(unit.x,unit.z,.26))
}
assert(around && Math.hypot(unit.x-4,unit.z)<.5, 'patrol walked around a wall and resumed its assignment')
