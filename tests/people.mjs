import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/GLTFLoader.js'
import { posePerson } from '../src/people.js'

// Decode the shipped mesh, skin and animation samplers with the game's loader.
// The DOM image decoder and renderer are outside this CPU regression test.
globalThis.self = globalThis
globalThis.Image = class {
  height = 1
  set src(value) {
    queueMicrotask(() => this.onload())
  }
}
THREE.TextureLoader.prototype.load = function (url, resolve) {
  const texture = new THREE.Texture()
  queueMicrotask(() => resolve?.(texture))
  return texture
}
const styles = ['trail-jacket', 'rose-shirt', 'denim-jacket', 'linen-shirt']
const loader = new GLTFLoader()
for (const style of styles) {
  const bytes = readFileSync(process.argv[2] + '/assets/people/' + style + '.glb')
  const gltf = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  const group = gltf.scene
  const meshes = []
  group.traverse((o) => {
    if (o.isSkinnedMesh) meshes.push(o)
  })
  assert(meshes.length >= 4)
  const detail = group.getObjectByName('Detail'),
    coarse = group.getObjectByName('Distance')
  const count = (root) => {
    let n = 0
    root.traverse((o) => {
      if (o.isSkinnedMesh) n += o.geometry.index.count / 3
    })
    return n
  }
  assert(count(detail) > 6000 && count(coarse) < count(detail) * 0.4)
  const rig = meshes[0].skeleton
  assert(rig.bones.length > 70 && rig.bones.some((o) => o.name.includes('Finger')))
  const model = {
    ready: true,
    group,
    mixer: new THREE.AnimationMixer(group),
    index: 2,
    actions: {},
  }
  for (const clip of gltf.animations) model.actions[clip.name] = model.mixer.clipAction(clip)
  const box = new THREE.Box3(),
    pos = new THREE.Vector3()
  function bounds() {
    group.updateMatrixWorld(true)
    box.makeEmpty()
    for (const mesh of detail.children)
      if (mesh.isSkinnedMesh) {
        for (let k = 0; k < mesh.geometry.index.count; k += 3) {
          mesh.getVertexPosition(mesh.geometry.index.getX(k), pos)
          box.expandByPoint(pos.applyMatrix4(mesh.matrixWorld))
        }
      }
    return box.clone()
  }
  const foot = rig.bones.find((o) => o.name.endsWith('L_Foot'))
  const tip = new THREE.Vector3()
  const range = []
  const metrics = {}
  for (const mode of [
    'idle',
    'look',
    'walk',
    'run',
    'crouch',
    'seat',
    'enter',
    'exit',
    'pivotLeft',
    'pivotRight',
  ]) {
    const action = model.actions[mode]
    assert(action, mode)
    model.mixer.stopAllAction()
    action.reset().play()
    let min = Infinity,
      max = -Infinity,
      height = 0
    for (let sample = 0; sample < 7; sample++) {
      model.mixer.update(action.getClip().duration / 8)
      const b = bounds()
      assert(b.min.toArray().every(Number.isFinite), mode)
      min = Math.min(min, b.min.y)
      max = Math.max(max, b.max.y)
      height = Math.max(height, b.max.y - b.min.y)
      if (mode === 'walk') range.push(foot.getWorldPosition(tip).z)
    }
    assert(min > -0.18 && min < 0.16, style + ' ' + mode + ' soles ' + min)
    assert(max < 2.25 && height > 0.75, style + ' ' + mode + ' height ' + height)
    metrics[mode] = Math.round(max * 100) / 100
  }
  assert(metrics.seat < metrics.idle - 0.23)
  assert(Math.max(...range) - Math.min(...range) > 0.16)
  model.mixer.stopAllAction()
  for (let i = 0; i < 25; i++) posePerson(model, 1 / 60, 1.1)
  for (let i = 0; i < 25; i++) posePerson(model, 1 / 60, 3.6)
  assert.equal(model.active.getClip().name, 'run')
  assert(Math.abs(model.actions.walk.getEffectiveWeight()) < 0.02)
  console.log(
    style,
    'bones',
    rig.bones.length,
    'triangles',
    count(detail),
    count(coarse),
    'height by pose',
    metrics,
  )
}
import { makePerson, setPersonDetail, setPersonAppearance } from '../src/people.js'
import { createSimulation } from '../src/simulation.js'

// Stream the same production GLBs into independent runtime clones.
globalThis.document = {}
THREE.FileLoader.prototype.load = function (url, resolve) {
  const file = readFileSync(process.argv[2] + '/' + url)
  queueMicrotask(() =>
    resolve(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)),
  )
}
const resident = makePerson(1, true),
  twin = makePerson(5, true),
  avatar = makePerson()
for (const m of [resident, twin, avatar]) posePerson(m, 1 / 60, 0)
await Promise.all([resident.loading, twin.loading, avatar.loading])
assert(resident.ready && twin.ready && avatar.ready)
assert.equal(resident.near[0].geometry, twin.near[0].geometry)
assert.equal(resident.near[0].material, twin.near[0].material)
assert.notEqual(resident.near[0].skeleton.bones[0], twin.near[0].skeleton.bones[0])
assert.equal(resident.character.rotation.y, Math.PI)
const rigScene = new THREE.Scene()
rigScene.add(resident.group)
const bones = resident.near[0].skeleton.bones
let matrixUpdates = 0
for (const bone of bones) {
  const original = bone.updateMatrixWorld
  bone.updateMatrixWorld = function (force) {
    matrixUpdates++
    original.call(this, force)
  }
}
rigScene.updateMatrixWorld(true)
assert.equal(matrixUpdates, bones.length)
const previousFoot = bones.find((bone) => bone.name.endsWith('L_Foot')).matrixWorld.clone()
resident.group.visible = false
matrixUpdates = 0
for (let i = 0; i < 30; i++) {
  resident.group.position.x += 0.25
  posePerson(resident, 1 / 60, 1.4)
  rigScene.updateMatrixWorld(true)
}
assert.equal(matrixUpdates, 0)
resident.group.visible = true
posePerson(resident, 0.25, 1.4)
rigScene.updateMatrixWorld()
assert.equal(matrixUpdates, bones.length)
const nextFoot = bones.find((bone) => bone.name.endsWith('L_Foot')).matrixWorld
assert(Math.abs(nextFoot.elements[12] - previousFoot.elements[12] - 7.5) < 0.2)
assert(Math.abs(nextFoot.elements[14] - previousFoot.elements[14]) > 0.01)
console.log('Hidden rig: zero bone updates across 30 frames; first visible frame updates all', bones.length, 'bones and the new walking pose.')
setPersonDetail(resident, false, false)
assert(resident.far.every((m) => m.visible) && resident.near.every((m) => !m.visible))
setPersonAppearance(avatar, true)
assert(avatar.clothes.length && avatar.clothes.every((m) => m.color.getHex() === 0xe7be91))
for (const [kind, progress] of [
  ['enter', 0.7],
  ['exit', 0.3],
]) {
  posePerson(avatar, 1 / 60, 0, { transfer: kind, progress })
  assert.equal(avatar.active.getClip().name, kind)
  assert(Math.abs(avatar.active.time / avatar.active.getClip().duration - progress) < 0.001)
}
let entryObstacle = () => false
const scene = new THREE.Scene()
const sim = createSimulation(scene, new THREE.PerspectiveCamera(68, 1, 0.1, 500), {
  height: () => 0,
  blocked: (...args) => entryObstacle(...args),
  candidates: () => [],
  signalOpen: () => true,
  locations: { depot: { x: 14, z: -94 } },
  roads: [],
})
const frame = () => sim.update(1 / 60, { settings: { quality: 'high' }, hour: 11 })
assert.equal(
  sim.npcs.filter((p) => p.role === 'race-steward' || p.role === 'delivery-coordinator').length,
  2,
)
// Use the actual thief rigs and cabin placement, including first visibility
// after a saved trip resumes. Both levels of detail use the same skeleton.
for (let slot = 0; slot < 4; slot++) {
  const thief = sim.spawnCityPerson(24 + slot, 0, 0, 'reckless-pedestrian')
  const car = sim.cars[0]
  Object.assign(thief, { x: car.x, z: car.z, ride: car })
  sim.presentOccupant(thief, 1 / 60)
  await thief.model.loading
  assert(thief.model.ready)
  assert.equal(thief.model.active, thief.model.actions.driver)
  sim.presentTheftEntry(thief, car, .45, 1 / 60)
  assert.equal(thief.model.active.getClip().name, 'enter')
  for (let i = 0; i < 24; i++) sim.presentOccupant(thief, 1 / 60)
  scene.updateMatrixWorld(true)
  const model = thief.model
  assert.equal(model.active.getClip().name, 'driver')
  if (model.style === avatar.style) assert.equal(model.active.getClip(), avatar.actions.driver.getClip())
  const local = car.model.group.matrixWorld.clone().invert()
  const joint = (name) => model.character.getObjectByName('Bip01_' + name)
    .getWorldPosition(new THREE.Vector3()).applyMatrix4(local)
  for (const side of ['L_', 'R_']) {
    assert(joint(side + 'Thigh').z - joint(side + 'Calf').z > .18)
    assert(joint(side + 'UpperArm').z - joint(side + 'Hand').z > .18)
  }
  scene.remove(model.group)
  sim.npcs.splice(sim.npcs.indexOf(thief), 1)
}
console.log('PASS all four thief rigs play player entry and seated driving clips with bent legs and hands forward.')
const car = sim.cars[0],
  c = Math.cos(car.yaw),
  s = Math.sin(car.yaw)
sim.player.x = car.x - 1.67 * c
sim.player.z = car.z + 1.67 * s
assert.equal(sim.nearestCar(), car)
let door = 0,
  peak = 0
const setDoor = car.model.setDoorOpen
car.model.setDoorOpen = (v) => {
  door = v
  peak = Math.max(peak, v)
  setDoor?.(v)
}
assert(sim.enterExit().entered)
for (let i = 0; i < 400 && !sim.vehicle; i++) frame()
assert.equal(sim.vehicle, car)
for (let i = 0; i < 82; i++) frame()
assert(peak > 0.98 && door < 0.001)
assert(scene.getObjectByName('Player').visible)
sim.toggleCamera()
frame()
assert(!scene.getObjectByName('Player').visible)
assert(sim.enterExit().ok)
for (let i = 0; i < 82; i++) frame()
assert.equal(sim.vehicle, null)
assert(door < 0.001)
console.log(
  'PASS rig streaming, independent skeletons, shared geometry/materials, LOD, clothing, vehicle entry/exit, exterior and driver cameras, contact roles.',
)

// Hold real controls through the handoff and measure the skinned player in each cabin.
const playerMesh = scene.getObjectByName('Player')
const input = new Set(['KeyW', 'KeyA'])
const parkedFleet = sim.serialize()
for (const car of sim.cars) {
  for (const fps of [15, 30, 60, 120]) {
    const save = structuredClone(parkedFleet)
    save.current = null
    save.driverView = false
    const saved = save.cars.find((v) => v.id === car.id)
    Object.assign(saved, { x: -140, z: 40, yaw: 0.6 })
    Object.assign(save.player, {
      x: saved.x + 1.65 * Math.cos(0.6),
      z: saved.z - 1.65 * Math.sin(0.6),
      y: 0,
    })
    sim.restore(save)
    const result = sim.enterExit()
    assert(result.ok && result.car === car)
    const start = [car.x, car.z, car.yaw]
    const update = (keys) => sim.update(1 / fps, { keys, settings: { quality: 'high' } })
    assert(result.approaching)
    let lastSide = Infinity
    for (let i = 0; i < 10 * fps && !sim.vehicle; i++) {
      const dx = sim.player.x - car.x, dz = sim.player.z - car.z
      lastSide = dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw)
      const along = dx * Math.sin(car.yaw) + dz * Math.cos(car.yaw)
      assert(Math.abs(lastSide) > car.spec.width / 2 || Math.abs(along) > car.spec.length / 2)
      assert.equal(car.speed, 0)
      update(input)
    }
    assert.equal(sim.vehicle, car)
    assert(lastSide < -car.spec.width / 2)
    for (let i = 0; i < Math.floor(1.15 * fps); i++) {
      update(i % 2 ? input : new Set(['KeyS', 'KeyD']))
      assert.equal(car.speed, 0)
      assert.deepEqual([car.x, car.z, car.yaw], start)
    }
    assert.equal(sim.enterExit().ok, false)
    // Give the production loader a turn even in a synchronous simulation run.
    await new Promise((resolve) => setImmediate(resolve))
    for (let i = 0; i < Math.ceil(0.35 * fps); i++) update(input)
    assert(car.speed > 0.1 && Math.hypot(car.x - start[0], car.z - start[1]) > 0.01)
    scene.updateMatrixWorld(true)
    const toCabin = car.model.group.matrixWorld.clone().invert()
    const vertex = new THREE.Vector3()
    const bounds = new THREE.Box3()
    let vertices = 0
    playerMesh.getObjectByName('Detail').traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(toCabin)
        bounds.expandByPoint(vertex)
        vertices++
      }
    })
    assert(vertices > 1000)
    const footwell = car.spec.wheel * 0.65
    assert(
      bounds.min.y >= footwell - 0.012 && bounds.max.y < car.spec.roof - 0.045,
      car.id + ' ' + fps + ' fps: driver y=' + bounds.min.y + '..' + bounds.max.y,
    )
    for (const side of ['L', 'R']) {
      const joint = (name) =>
        playerMesh
          .getObjectByName('Bip01_' + side + '_' + name)
          .getWorldPosition(new THREE.Vector3())
          .applyMatrix4(toCabin)
      const hip = joint('Thigh'),
        knee = joint('Calf'),
        ankle = joint('Foot')
      assert(
        knee.z < hip.z - 0.17 && ankle.y < knee.y - 0.09 && ankle.z < knee.z - 0.1,
        car.id + ' legs',
      )
    }
    if (fps === 60)
      console.log(
        car.name,
        'driver height above chassis datum',
        bounds.min.y.toFixed(3),
        'to',
        bounds.max.y.toFixed(3),
      )
  }
}
console.log(
  'PASS five vehicles at 15/30/60/120 FPS: entry lock, driving, seated knees and floor/roof clearance.',
)

// A wall beyond the hood leaves only the rear route. Blocking both ends denies entry.
const barrierSave = structuredClone(parkedFleet)
Object.assign(barrierSave.cars[0], { x: -140, z: 40, yaw: 0 })
Object.assign(barrierSave.player, { x: -138.3, z: 40, y: 0 })
entryObstacle = (x, z) => z < 38
sim.restore(barrierSave)
assert(sim.enterExit().approaching)
let rear = false
for (let i = 0; i < 600 && !sim.vehicle; i++) {
  frame()
  if (sim.player.z > 42.3) rear = true
}
assert(rear && sim.vehicle === sim.cars[0])
sim.restore(barrierSave)
entryObstacle = (x, z) => z < 38 || z > 42
assert.equal(sim.enterExit().ok, false)
assert.equal(sim.vehicle, null)
console.log('PASS obstructed front approach routes behind the car; two blocked ends deny entry.')
