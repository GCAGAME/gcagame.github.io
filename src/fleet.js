import * as THREE from 'three'
import { cabinEnds, createCockpit, driverEye } from './cockpit.js'
import { fleetMeshes } from './fleet-meshes.js'

// The original GLBs have separate wheel and steering pivots. Their geometry is
// indexed and shared by every copy of the same model, including moving traffic.
const geometryCache = new Map()
function geometry(type, part) {
  const key = type + '/' + part
  if (geometryCache.has(key)) return geometryCache.get(key)
  const [, vertices, indices] = fleetMeshes[type][part]
  const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  const data = bytes(vertices)
  const view = new DataView(data.buffer)
  const count = data.length / 20
  const positions = new Float32Array(count * 3)
  const normals = new Int8Array(count * 3)
  const colors = new Uint8Array(count * 3)
  const finishes = new Uint8Array(count * 3)
  const hasAtlas = ['expedition', 'doorExpedition', 'steeringAtlas'].includes(part)
  const uvs = hasAtlas ? new Uint16Array(count * 2) : null
  for (let i = 0; i < count; i++) {
    const base = i * 20
    for (let c = 0; c < 3; c++) {
      positions[i * 3 + c] = view.getInt16(base + c * 2, true) / 8192
      normals[i * 3 + c] = view.getInt8(base + 6 + c)
      colors[i * 3 + c] = data[base + 9 + c]
      finishes[i * 3 + c] = data[base + 12 + c]
    }
    if (uvs) {
      uvs[i * 2] = view.getUint16(base + 16, true)
      uvs[i * 2 + 1] = view.getUint16(base + 18, true)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true))
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3, true))
  g.setAttribute('finish', new THREE.BufferAttribute(finishes, 3, true))
  if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2, true))
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(indices).buffer), 1))
  g.computeBoundingSphere()
  geometryCache.set(key, g)
  return g
}

const shadowPixels = new Uint8Array(64 * 64 * 4)
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 64; x++) {
    const u = Math.abs((x + 0.5) / 32 - 1),
      v = Math.abs((y + 0.5) / 32 - 1)
    const d = Math.pow(u ** 4 + v ** 4, 0.25),
      i = (x + y * 64) * 4
    shadowPixels[i] = shadowPixels[i + 1] = shadowPixels[i + 2] = 35
    shadowPixels[i + 3] = Math.round(110 * THREE.MathUtils.smoothstep(1 - d, 0, 0.45))
  }
const shadeMap = new THREE.DataTexture(shadowPixels, 64, 64, THREE.RGBAFormat)
shadeMap.magFilter = shadeMap.minFilter = THREE.LinearFilter
shadeMap.needsUpdate = true
const shadeMat = new THREE.MeshBasicMaterial({
  map: shadeMap,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  opacity: 0.85,
})
const shadePlane = new THREE.PlaneGeometry(1, 1)

const glass = new THREE.MeshPhysicalMaterial({
  name: 'Automotive laminated glass',
  color: 0x728a8d,
  roughness: 0.105,
  metalness: 0.12,
  clearcoat: 0.65,
  transparent: true,
  opacity: 0.31,
  side: THREE.DoubleSide,
  forceSinglePass: true,
  depthWrite: false,
})

function surface(state, near) {
  const options = { vertexColors: true, roughness: 1, metalness: 1 }
  const mat = near
    ? new THREE.MeshPhysicalMaterial({ ...options, clearcoat: 0.94, clearcoatRoughness: 0.16 })
    : new THREE.MeshStandardMaterial(options)
  mat.name = near ? 'Automotive paint, trim and lamps' : 'Distant automotive finishes'
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, state)
    const varying = 'varying vec3 vFleetFinish; varying vec3 vFleetGlow;\n'
    shader.vertexShader =
      varying +
      'attribute vec3 finish; uniform vec3 paintTint; uniform float graphite; uniform vec4 lampPower; uniform float indicatorX;\n' +
      shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      float kind = floor(finish.z * 255.0 + 0.5);
      bool painted = kind == 1.;
      vFleetFinish = vec3(finish.xy, painted ? 1. : .035);
      vColor.xyz = pow(vColor.xyz,vec3(2.2));
      if (painted) vColor.xyz *= paintTint;
      if (kind == 2.) vColor.xyz = mix(vColor.xyz,vec3(.063,.073,.081),graphite * .91);
      vFleetGlow = vec3(0.);
      if (kind == 3.) vFleetGlow = vec3(1.0,.90,.72) * lampPower.x;
      if (kind == 4.) vFleetGlow = vec3(1.0,.022,.007) * lampPower.y;
      bool corner = (kind == 3. || kind == 4.) && abs(position.x) > indicatorX;
      float turn = 0.;
      if (kind == 5. || (corner && position.x < 0.)) turn = lampPower.z;
      if (kind == 6. || (corner && position.x > 0.)) turn = lampPower.w;
      vFleetGlow += vec3(1.,.32,.016) * turn;
    `,
    )
    shader.fragmentShader = varying + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n roughnessFactor *= max(.1,vFleetFinish.x);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\n metalnessFactor *= vFleetFinish.y;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += vFleetGlow;',
      )
    if (near)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n material.clearcoat *= vFleetFinish.z;',
      )
  }
  mat.customProgramCacheKey = () => (near ? 'gca-fleet-paint' : 'gca-fleet-distance')
  return mat
}

const textureCache = new Map()
function vehicleTexture(name, color = false) {
  if (textureCache.has(name)) return textureCache.get(name)
  const path = 'assets/world/' + name + '.webp'
  const texture = new THREE.TextureLoader().load(globalThis.BRIAR_ASSETS?.[path] || path)
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  texture.anisotropy = 4
  textureCache.set(name, texture)
  return texture
}
function expeditionMaterial(state) {
  const orm = vehicleTexture('fleet-expedition-surface')
  const mat = new THREE.MeshPhysicalMaterial({
    map: vehicleTexture('fleet-expedition', true),
    normalMap: vehicleTexture('fleet-expedition-normal'),
    roughnessMap: orm,
    metalnessMap: orm,
    metalness: 0.46,
    roughness: 0.94,
    clearcoat: 0.24,
    clearcoatRoughness: 0.37,
    normalScale: new THREE.Vector2(0.8, 0.8),
  })
  mat.name = 'Weathered expedition bodywork'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.paintTint = state.paintTint
    shader.fragmentShader = 'uniform vec3 paintTint;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec4 bodyAtlas = texture2D(map, vMapUv);
      float wear = clamp(dot(bodyAtlas.rgb,vec3(.24,.64,.12)) / .36, .12, 1.35);
      diffuseColor.rgb *= mix(bodyAtlas.rgb,paintTint*wear,bodyAtlas.a);
    `,
    )
  }
  mat.customProgramCacheKey = () => 'expedition-painted-atlas'
  return mat
}

const defaults = {
  sedan: 0x607e91,
  suv: 0x887a6d,
  sports: 0xb44531,
  pickup: 0x71847a,
  offroad: 0xb49c6c,
}
const wheelParts = ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']

export function makeFleetCar(type, spec, color = defaults[type]) {
  const asset = fleetMeshes[type]
  const state = {
    paintTint: { value: new THREE.Color(color) },
    graphite: { value: 0 },
    lampPower: { value: new THREE.Vector4(0.12, 0.06, 0, 0) },
    indicatorX: { value: spec.width * 0.363 },
  }
  const group = new THREE.Group(),
    detail = new THREE.Group()
  group.name = spec.name
  group.add(detail)
  const finish = surface(state, true)
  function mesh(part, parent, material) {
    const object = new THREE.Mesh(geometry(type, part), material)
    object.name = spec.name + ' ' + part
    object.receiveShadow = true
    parent.add(object)
    return object
  }
  const contact = new THREE.Mesh(shadePlane, shadeMat)
  contact.rotation.x = -Math.PI / 2
  contact.position.y = 0.071
  contact.scale.set(spec.width * 1.22, spec.length * 1.09, 1)
  detail.add(contact)
  const body = mesh('body', detail, finish)
  if (asset.glass) mesh('glass', detail, glass)
  const weathered = asset.expedition ? expeditionMaterial(state) : null
  const expedition = weathered ? mesh('expedition', detail, weathered) : null
  let hinge = null,
    doorPanel = null
  if (asset.door || asset.doorExpedition) {
    hinge = new THREE.Group()
    hinge.name = 'Driver door hinge'
    hinge.position.fromArray((asset.door || asset.doorExpedition)[0])
    detail.add(hinge)
    if (asset.door) doorPanel = mesh('door', hinge, finish)
    if (asset.doorExpedition) doorPanel = mesh('doorExpedition', hinge, weathered)
    if (asset.doorGlass) mesh('doorGlass', hinge, glass)
  }
  const wheels = wheelParts.map((part) => {
    const turn = new THREE.Group()
    turn.position.fromArray(asset[part][0])
    detail.add(turn)
    const roll = mesh(part, turn, finish)
    return { turn, roll }
  })
  let steering = null
  if (asset.steering_wheel || asset.steeringAtlas) {
    const part = asset.steeringAtlas ? 'steeringAtlas' : 'steering_wheel'
    steering = mesh(part, detail, asset.steeringAtlas ? weathered : finish)
    steering.position.fromArray(asset[part][0])
  }
  const coarse = mesh('coarse', group, surface(state, false))
  coarse.visible = false
  const column = steering?.position
  const cabin = column
    ? { x: column.x, y: Math.min(spec.roof - 0.18, column.y + 0.29), z: column.z + 0.32 }
    : { x: -spec.width * 0.211, y: spec.roof * (type === 'offroad' ? 0.72 : 0.82), z: -0.07 }
  let cockpit
  function showCockpit(enabled, car) {
    if (enabled && !cockpit) {
      cockpit = createCockpit(type, spec)
      group.add(cockpit.group)
      // Keep the actual bonnet, bumpers and pickup bed visible beyond the cabin shell.
      const limits = new THREE.Vector2(...cabinEnds(type))
      for (const source of [body, expedition].filter(Boolean)) {
        const original = source.material
        const cropped = original.clone()
        cropped.side = THREE.DoubleSide
        cropped.onBeforeCompile = (shader, renderer) => {
          original.onBeforeCompile(shader, renderer)
          shader.uniforms.cabinLimits = { value: limits }
          shader.vertexShader = 'varying float bodyZ;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>', '#include <begin_vertex>\nbodyZ = position.z;')
          shader.fragmentShader = 'varying float bodyZ; uniform vec2 cabinLimits;\n' +
            shader.fragmentShader.replace('#include <clipping_planes_fragment>',
              '#include <clipping_planes_fragment>\nif(bodyZ > cabinLimits.x && bodyZ < cabinLimits.y) discard;')
        }
        cropped.customProgramCacheKey = () => 'outside-cabin/' + original.customProgramCacheKey()
        cockpit.group.add(new THREE.Mesh(source.geometry, cropped))
      }
    }
    if (cockpit) cockpit.group.visible = enabled
    if (enabled) {
      detail.visible = false
      cockpit.update(car)
    }
  }
  function customize({ paint = null, wheels = 'factory' } = {}) {
    state.paintTint.value.set(
      typeof paint === 'string' && /^#[0-9a-f]{6}$/i.test(paint) ? paint : color,
    )
    state.graphite.value = Number(wheels === 'graphite')
  }
  function setLamps(head, tail, left, right) {
    state.lampPower.value.set(head, tail, left, right)
  }
  function setDoorOpen(fraction) {
    if (hinge) hinge.rotation.y = -1.04 * THREE.MathUtils.clamp(fraction, 0, 1)
  }
  return {
    group,
    detail,
    coarse,
    wheels,
    steering,
    cabin,
    eye: driverEye(type),
    showCockpit,
    get mirror() { return cockpit?.mirror },
    customize,
    setLamps,
    setDoorOpen,
    shadowParts: [
      expedition || body,
      ...(doorPanel ? [doorPanel] : []),
      ...wheels.map((w) => w.roll),
      ...(expedition ? [body] : []),
    ],
  }
}
