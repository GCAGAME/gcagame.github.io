import * as THREE from 'three'
import { GLTFLoader } from '../vendor/GLTFLoader.js'
import { clone as cloneCharacter } from '../vendor/SkeletonUtils.js'

const wardrobe = ['trail-jacket', 'rose-shirt', 'denim-jacket', 'linen-shirt']
const library = new Map()
const uniforms = new Map()
const drivingPoses = new WeakMap()
const loader = new GLTFLoader()

// Three updates every descendant's world matrix during the scene traversal,
// even when a group is hidden. These visual rigs are independent of navigation.
class CharacterGroup extends THREE.Group {
  updateMatrixWorld(force) {
    if (this.visible) super.updateMatrixWorld(force)
  }
}

// Adapt the shipped seated pose to pedals and wheel in the rig's local forward (+Z).
// Bake once per character asset. Each driver plays the clip on their own skeleton.
function driverPose(character, seatClip) {
  const mixer = new THREE.AnimationMixer(character)
  mixer.clipAction(seatClip).play()
  mixer.update(0.3)
  const bones = []
  character.traverse((o) => {
    if (o.isBone) bones.push(o)
  })
  function aim(from, to, direction) {
    const a = bones.find((b) => b.name.endsWith(from)),
      b = bones.find((b) => b.name.endsWith(to))
    const parentInverse = a.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    const along = b
      .getWorldPosition(new THREE.Vector3())
      .sub(a.getWorldPosition(new THREE.Vector3()))
    const rotation = new THREE.Quaternion().setFromUnitVectors(
      along.normalize().applyQuaternion(parentInverse),
      new THREE.Vector3(...direction).normalize().applyQuaternion(parentInverse),
    )
    a.quaternion.premultiply(rotation)
  }
  for (const [side, spread] of [
    ['L', 0.1],
    ['R', -0.1],
  ]) {
    aim(side + '_Thigh', side + '_Calf', [spread, 0.03, 1])
    aim(side + '_Calf', side + '_Foot', [0, -0.58, 0.82])
    aim(side + '_UpperArm', side + '_Forearm', [spread, -0.78, 0.55])
    aim(side + '_Forearm', side + '_Hand', [-spread, 0.4, 0.9])
  }
  character.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(character, true)
  const tracks = bones.flatMap((b) => [
    new THREE.VectorKeyframeTrack(b.name + '.position', [0], b.position.toArray()),
    new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', [0], b.quaternion.toArray()),
  ])
  mixer.stopAllAction()
  mixer.uncacheRoot(character)
  return {
    clip: new THREE.AnimationClip('driver', 1, tracks),
    bottom: bounds.min.y,
    top: bounds.max.y,
  }
}

function loadResident(model) {
  if (!library.has(model.style)) {
    const path = './assets/people/' + model.style + '.glb'
    library.set(model.style, loader.loadAsync(path))
  }
  if (model.patrolUniform && !uniforms.has(model.style)) {
    const texture = new THREE.TextureLoader().loadAsync('./assets/people/patrol-' + model.style + '.webp')
      .then(map => {
        map.colorSpace = THREE.SRGBColorSpace
        map.flipY = false
        map.name = model.style + ' patrol uniform'
        return map
      })
      .catch(() => {
        // The original GLB already contains a complete textured body.
        uniforms.delete(model.style)
        return null
      })
    uniforms.set(model.style, texture)
  }
  return Promise.all([library.get(model.style), model.patrolUniform && uniforms.get(model.style)]).then(([asset, uniform]) => {
    const character = cloneCharacter(asset.scene)
    if (model.canDrive) {
      if (!drivingPoses.has(asset)) {
        const seat = asset.animations.find((clip) => clip.name === 'seat')
        drivingPoses.set(asset, driverPose(character, seat))
      }
      model.driverPose = drivingPoses.get(asset)
    }
    character.rotation.y = Math.PI
    model.character = character
    model.group.add(character)
    character.traverse((object) => {
      if (!object.isSkinnedMesh) return
      let parent = object
      while (parent && !/^(Detail|Distance)/.test(parent.name)) parent = parent.parent
      const meshes = parent?.name.startsWith('Distance') ? model.far : model.near
      meshes.push(object)
      object.receiveShadow = true
      // Local deformation envelope covers all authored human poses in metres.
      object.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.5)
      if (uniform && object.material.name.endsWith('body')) {
        object.material = object.material.clone()
        object.material.map = uniform
      } else if (!model.npc && object.material.name.endsWith('body')) {
        object.material = object.material.clone()
        object.material.color.set(model.tint)
        model.clothes.push(object.material)
      }
    })
    model.mixer = new THREE.AnimationMixer(character)
    for (const [i, clip] of asset.animations.entries()) {
      clip.userData = asset.parser.json.animations[i].extras || {}
      model.actions[clip.name] = model.mixer.clipAction(clip)
    }
    if (model.driverPose) model.actions.driver = model.mixer.clipAction(model.driverPose.clip)
    model.ready = true
    setPersonDetail(model, model.detailed, model.shadow)
    posePerson(model, 0, model.pendingSpeed || 0, model.pendingPose)
    model.pendingPose = null
    return model
  })
}

export function makePerson(index = 0, npc = false, canDrive = !npc) {
  const model = {
    group: new CharacterGroup(),
    index,
    npc,
    canDrive,
    style: wardrobe[index % wardrobe.length],
    near: [],
    far: [],
    clothes: [],
    actions: {},
    detailed: true,
    shadow: true,
    ready: false,
    loading: null,
    tint: 0xffffff,
    active: null,
  }
  model.group.name = npc ? 'Resident ' + index : 'Player'
  return model
}

export function setPersonAppearance(model, shell) {
  model.tint = shell ? 0xe7be91 : 0xffffff
  for (const material of model.clothes) material.color.set(model.tint)
}

export function setPersonDetail(model, detailed, shadow) {
  model.detailed = detailed
  model.shadow = shadow
  for (const mesh of model.near) {
    mesh.visible = detailed
    mesh.castShadow = shadow && detailed
  }
  for (const mesh of model.far) {
    mesh.visible = !detailed
    mesh.castShadow = false
  }
}

export function posePerson(model, dt, speed, state = {}) {
  if (!model.group.visible) return
  // Defer texture decoding and skeleton allocation until the actor is first in view.
  if (!model.ready) {
    model.pendingPose = state
    model.pendingSpeed = speed
    if (!model.loading && typeof document !== 'undefined')
      model.loading = loadResident(model).catch(error => {
        model.loadFailed = true
        console.error('Character asset:', model.style, error)
      })
    return
  }
  const pivot = Math.abs(state.turn || 0) > 0.85 && speed < 0.45
  const mode =
    (state.driver && 'driver') || state.transfer ||
    (state.seat
      ? 'seat'
      : state.crouch
        ? 'crouch'
        : pivot
          ? state.turn > 0
            ? 'pivotLeft'
            : 'pivotRight'
          : speed > 2.45
            ? 'run'
            : speed > 0.08
              ? 'walk'
              : state.look
                ? 'look'
                : 'idle')
  const action = model.actions[mode]
  if (!action) return
  if (model.active !== action) {
    const last = model.active
    // Restore the action's weight after a previous cross-fade faded it out.
    action.reset().setEffectiveWeight(1).play()
    if (last && mode === 'driver' && last !== model.actions.enter) last.stop()
    else if (last) action.crossFadeFrom(last, 0.18, false)
    else if (mode === 'idle') action.time = (model.index * 0.47) % action.getClip().duration
    model.active = action
  }
  if (state.transfer) {
    action.time = state.progress * (action.getClip().duration - 0.001)
    action.timeScale = 0
    model.mixer.update(dt)
    return
  }
  action.timeScale =
    mode === 'walk' || mode === 'run'
      ? Math.max(
          0.4,
          Math.min(
            2.4,
            speed / (action.getClip().userData?.strideSpeed || (mode === 'run' ? 3.8 : 1.4)),
          ),
        )
      : 1
  model.mixer.update(dt)
  if (model.character) {
    // Preserve the existing swim posture while the legs and arms continue moving.
    const tilt = state.swim ? -0.76 : 0
    model.character.rotation.x = THREE.MathUtils.damp(model.character.rotation.x, tilt, 9, dt)
  }
}
