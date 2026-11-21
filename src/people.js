import * as THREE from 'three'
import { GLTFLoader } from '../vendor/GLTFLoader.js'
import { clone as cloneCharacter } from '../vendor/SkeletonUtils.js'

const wardrobe = ['trail-jacket', 'rose-shirt', 'denim-jacket', 'linen-shirt']
const library = new Map()
const loader = new GLTFLoader()

// Three updates every descendant's world matrix during the scene traversal,
// even when a group is hidden. These visual rigs are independent of navigation.
class CharacterGroup extends THREE.Group {
  updateMatrixWorld(force) {
    if (this.visible) super.updateMatrixWorld(force)
  }
}

function loadResident(model) {
  if (!library.has(model.style)) {
    const path = './assets/people/' + model.style + '.glb'
    library.set(model.style, loader.loadAsync(path))
  }
  return library.get(model.style).then((asset) => {
    const character = cloneCharacter(asset.scene)
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
      if (!model.npc && object.material.name.endsWith('body')) {
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
    model.ready = true
    setPersonDetail(model, model.detailed, model.shadow)
    posePerson(model, 0, 0, { idle: true })
    return model
  })
}

export function makePerson(index = 0, npc = false) {
  const model = {
    group: new CharacterGroup(),
    index,
    npc,
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
    if (!model.loading && typeof document !== 'undefined')
      model.loading = loadResident(model).catch((error) =>
        console.error('Character asset:', model.style, error),
      )
    return
  }
  const pivot = Math.abs(state.turn || 0) > 0.85 && speed < 0.45
  const mode =
    state.transfer ||
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
    if (last) action.crossFadeFrom(last, 0.18, false)
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
