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
const scene = new THREE.Scene()
const sim = createSimulation(scene, new THREE.PerspectiveCamera(68, 1, 0.1, 500), {
  height: () => 0,
  blocked: () => false,
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
