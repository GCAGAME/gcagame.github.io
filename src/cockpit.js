import * as THREE from 'three'
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js'

// Measurements in body-local metres. Front/rear pairs describe the glass at its sill and header.
const cabins = {
  sedan: {
    w: 0.73,
    sill: 0.99,
    roof: 1.38,
    front: [-0.87, -0.23],
    rear: [1.47, 0.83],
    post: 0.26,
    eyeZ: 0.45,
    accent: '#ce976c',
    trim: '#514541',
    seat: '#514d49',
  },
  suv: {
    w: 0.8,
    sill: 1.21,
    roof: 1.74,
    front: [-0.75, -0.11],
    rear: [2.26, 2.13],
    post: 0.54,
    eyeZ: 0.53,
    accent: '#82b6b0',
    trim: '#67574a',
    seat: '#68594d',
  },
  sports: {
    w: 0.77,
    sill: 0.86,
    roof: 1.17,
    front: [-1.36, -0.45],
    rear: [1.35, 0.63],
    post: 0.52,
    eyeZ: 0.22,
    accent: '#ff7356',
    trim: '#393d44',
    seat: '#403b3b',
  },
  pickup: {
    w: 0.84,
    sill: 1.22,
    roof: 1.75,
    front: [-1.1, -0.41],
    rear: [0.98, 0.89],
    post: -0.02,
    eyeZ: 0.18,
    accent: '#e9ad66',
    trim: '#59574d',
    seat: '#595e60',
  },
  offroad: {
    w: 0.79,
    sill: 0.99,
    roof: 1.41,
    front: [-0.48, -0.32],
    rear: [1.66, 1.55],
    post: 0.47,
    eyeZ: 0.49,
    accent: '#deb269',
    trim: '#586052',
    seat: '#5a6154',
  },
}

export function driverEye(type) {
  const { w, sill, roof, eyeZ } = cabins[type]
  return { x: -w * 0.48, y: sill + (roof - sill) * 0.62, z: eyeZ }
}

function faceTexture(width, height, draw) {
  const canvas = globalThis.document?.createElement?.('canvas')
  const ctx = canvas?.getContext('2d')
  if (!ctx) return new THREE.MeshBasicMaterial({ color: 0x253038 })
  canvas.width = width
  canvas.height = height
  draw(ctx)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return new THREE.MeshBasicMaterial({ map, toneMapped: false })
}

function instruments(name, accent, maxSpeed) {
  return faceTexture(768, 256, (ctx) => {
    const bg = ctx.createLinearGradient(0, 0, 0, 256)
    bg.addColorStop(0, '#242f34')
    bg.addColorStop(1, '#0e151a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 768, 256)
    ctx.textAlign = 'center'
    for (const [cx, limit, unit] of [
      [174, maxSpeed, 'km/h'],
      [594, 100, 'FUEL %'],
    ]) {
      const cy = 136
      ctx.lineWidth = 4
      ctx.strokeStyle = '#566568'
      ctx.beginPath()
      ctx.arc(cx, cy, 112, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i <= 40; i++) {
        const angle = (0.78 + (i / 40) * 1.44) * Math.PI
        const x = Math.cos(angle),
          y = Math.sin(angle),
          major = i % 5 === 0
        ctx.strokeStyle = i >= 34 && unit === 'km/h' ? accent : '#dce6df'
        ctx.lineWidth = major ? 4 : 2
        ctx.beginPath()
        ctx.moveTo(cx + x * 104, cy + y * 104)
        ctx.lineTo(cx + x * (major ? 89 : 98), cy + y * (major ? 89 : 98))
        ctx.stroke()
        if (major) {
          ctx.fillStyle = '#e1e9e4'
          ctx.font = 'bold 18px Arial'
          ctx.fillText(Math.round((limit * i) / 40), cx + x * 73, cy + y * 73 + 6)
        }
      }
      ctx.fillStyle = '#b7c7c3'
      ctx.font = '17px Arial'
      ctx.fillText(unit, cx, cy + 55)
    }
    ctx.fillStyle = accent
    ctx.fillRect(322, 85, 124, 3)
    ctx.font = 'bold 23px Arial'
    ctx.fillText(name.split(' ')[0].toUpperCase(), 384, 128)
    ctx.font = '16px Arial'
    ctx.fillStyle = '#c6d1ce'
    ctx.fillText(name.split(' ').slice(1).join(' ').toUpperCase(), 384, 158)
  })
}

const solids = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.82,
  side: THREE.DoubleSide,
})
const pointerMat = new THREE.MeshBasicMaterial({ color: 0xff8954, toneMapped: false })

let upholstery, mirrorTarget, mirrorSurface
const mirrorScreen = new THREE.Vector3()
const mirrorCamera = new THREE.PerspectiveCamera(26, 0.193 / 0.045, 0.05, 190)
let lastMirrorFrame = -Infinity
function upholsteryMaterial() {
  if (upholstery) return upholstery
  const size = 128,
    data = new Uint8Array(size * size * 4)
  let seed = 71
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const value = 202 + (seed >>> 27) + (i % 4 === 0 || Math.floor(i / size) % 4 === 0 ? -20 : 12)
    data.set([value, value, value, 255], i * 4)
  }
  const map = new THREE.DataTexture(data, size, size)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  upholstery = new THREE.MeshStandardMaterial({
    map,
    vertexColors: true,
    roughness: 0.94,
    side: THREE.DoubleSide,
  })
  return upholstery
}
function mirrorMaterial() {
  if (!mirrorSurface) {
    mirrorTarget = new THREE.WebGLRenderTarget(256, 60)
    mirrorTarget.texture.repeat.x = -1
    mirrorTarget.texture.offset.x = 1
    mirrorSurface = new THREE.MeshBasicMaterial({ map: mirrorTarget.texture, color: 0xe0e5e3 })
  }
  return mirrorSurface
}
export function renderCabinMirror(renderer, scene, camera, car, now) {
  const mirror = car.model.mirror
  if (!mirror?.parent.visible || now - lastMirrorFrame < 200) return
  lastMirrorFrame = now
  mirror.getWorldPosition(mirrorCamera.position)
  camera.updateMatrixWorld()
  mirrorScreen.copy(mirrorCamera.position).project(camera)
  if (
    Math.abs(mirrorScreen.x) > 1.4 ||
    Math.abs(mirrorScreen.y) > 1.2 ||
    mirrorScreen.z > 1 ||
    mirrorScreen.z < -1
  )
    return
  mirrorCamera.quaternion.copy(car.model.group.quaternion)
  mirrorCamera.rotateY(Math.PI)
  mirrorCamera.rotateX(-0.06)
  const previous = renderer.getRenderTarget(),
    shadows = renderer.shadowMap.needsUpdate
  mirror.visible = false
  renderer.shadowMap.needsUpdate = false
  try {
    renderer.setRenderTarget(mirrorTarget)
    renderer.render(scene, mirrorCamera)
  } finally {
    renderer.setRenderTarget(previous)
    renderer.shadowMap.needsUpdate = shadows
    mirror.visible = true
  }
}

export function createCockpit(type, spec) {
  const p = cabins[type],
    eye = driverEye(type)
  const { w, sill, roof, front, rear, trim, seat, accent } = p
  const group = new THREE.Group()
  group.name = spec.name + ' driving interior'
  const shell = [],
    wheelParts = [],
    fabric = []
  const wheel = new THREE.Group()
  const rubber = '#262a2c',
    metal = '#a5ada9',
    cloth = '#c1bdb2'
  const floor = sill - 0.67,
    wheelZ = eye.z - 0.56,
    wheelY = sill - 0.11
  const dashZ = wheelZ - 0.29,
    dashY = sill - 0.12
  const matrix = new THREE.Matrix4()
  function part(geometry, color, x, y, z, rx = 0, ry = 0, rz = 0, batch = shell) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    const tint = new THREE.Color(color),
      rgb = new Float32Array(g.attributes.position.count * 3)
    for (let i = 0; i < rgb.length; i += 3) tint.toArray(rgb, i)
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3))
    g.deleteAttribute('uv')
    matrix.makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z)
    g.applyMatrix4(matrix)
    if (batch === shell && [seat, lining, cloth].includes(color)) {
      // Project the weave in metres so its scale stays consistent around seat bolsters.
      const uv = [],
        pos = g.attributes.position,
        n = g.attributes.normal
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          y = pos.getY(i),
          z = pos.getZ(i)
        if (Math.abs(n.getY(i)) > 0.65) uv.push(x * 14, z * 14)
        else if (Math.abs(n.getX(i)) > 0.65) uv.push(z * 14, y * 14)
        else uv.push(x * 14, y * 14)
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      fabric.push(g)
    } else batch.push(g)
  }
  function box(x, y, z, width, height, depth, color, rx = 0, ry = 0, rz = 0, batch = shell) {
    part(new THREE.BoxGeometry(width, height, depth), color, x, y, z, rx, ry, rz, batch)
  }
  // Rounded upholstery, armrests and instrument housings with a soft bevel at each edge.
  function pad(x, y, z, width, height, depth, r, color, rx = 0, batch = shell) {
    r = Math.min(r, width * 0.45, height * 0.45)
    const shape = new THREE.Shape(),
      a = width / 2,
      b = height / 2
    shape.moveTo(-a + r, -b)
    shape.lineTo(a - r, -b)
    shape.quadraticCurveTo(a, -b, a, -b + r)
    shape.lineTo(a, b - r)
    shape.quadraticCurveTo(a, b, a - r, b)
    shape.lineTo(-a + r, b)
    shape.quadraticCurveTo(-a, b, -a, b - r)
    shape.lineTo(-a, -b + r)
    shape.quadraticCurveTo(-a, -b, -a + r, -b)
    const bevel = Math.min(0.012, depth * 0.2, r * 0.35)
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 5,
    })
    g.translate(0, 0, -depth / 2)
    part(g, color, x, y, z, rx, 0, 0, batch)
  }
  function beam(a, b, width, depth, color) {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b)
    const delta = end.clone().sub(start)
    const g = new THREE.BoxGeometry(width, delta.length(), depth)
    g.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    )
    const mid = start.lerp(end, 0.5)
    part(g, color, mid.x, mid.y, mid.z)
  }
  function quad(a, b, c, d, color) {
    const g = new THREE.BufferGeometry()
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3),
    )
    g.computeVertexNormals()
    part(g, color, 0, 0, 0)
  }
  function panel(x, y, z, width, height, material, rx = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
    mesh.position.set(x, y, z)
    mesh.rotation.x = rx
    group.add(mesh)
    return mesh
  }
  const belt = '#303436',
    lining = '#aaaeb1'
  const headerZ = front[1] + 0.16,
    ceilingY = roof + 0.048
  const rearSill =
    sill + { sedan: 0.17, suv: 0.17, sports: 0.18, pickup: 0.15, offroad: 0.015 }[type]
  const topW = w * (type === 'offroad' || type === 'pickup' ? 0.96 : 0.84)
  box(0, floor, (front[0] + rear[0]) / 2, 2 * w + 0.06, 0.08, rear[0] - front[0] + 0.14, '#363839')
  box(0, (floor + sill) / 2, front[0], 2 * w + 0.06, sill - floor + 0.04, 0.07, belt)
  box(0, (floor + rearSill) / 2, rear[0], 2 * w + 0.06, rearSill - floor + 0.07, 0.085, trim)
  box(0, rearSill - 0.045, rear[0] - 0.015, 2 * w + 0.045, 0.038, 0.3, belt)
  box(
    0,
    ceilingY + 0.014,
    (headerZ + rear[1]) / 2,
    2 * topW + 0.08,
    0.045,
    rear[1] - headerZ + 0.09,
    lining,
  )
  // Trim the rear opening to the model's glass, including the pickup's narrow cab window.
  const rearWidth = { sedan: 0.55, suv: 0.61, sports: 0.44, pickup: 0.51, offroad: 0.62 }[type]
  const rearBase = [-w, rearSill, rear[0] - 0.012],
    rearTop = [-topW, ceilingY, rear[1] - 0.012]
  const lower = [-rearWidth, rearSill + 0.016, rear[0] - 0.016]
  const inset = type === 'pickup' ? 0.15 : 0.052
  const upper = [
    -rearWidth * 0.96,
    ceilingY - inset,
    rear[1] + ((rear[0] - rear[1]) * inset) / (ceilingY - rearSill) - 0.02,
  ]
  const opposite = ([x, y, z]) => [-x, y, z]
  quad(rearBase, lower, upper, rearTop, lining)
  quad(opposite(rearBase), opposite(lower), opposite(upper), opposite(rearTop), lining)
  quad(rearTop, upper, opposite(upper), opposite(rearTop), lining)
  quad(rearBase, lower, opposite(lower), opposite(rearBase), belt)
  for (const [a, b] of [
    [lower, upper],
    [upper, opposite(upper)],
    [opposite(upper), opposite(lower)],
    [opposite(lower), lower],
  ]) {
    beam(a, b, 0.014, 0.014, rubber)
  }
  if (type === 'sports') {
    pad(0, rearSill - 0.19, rear[0] - 0.075, 1.1, 0.23, 0.035, 0.035, trim)
    for (let i = 0; i < 6; i++)
      box(0, rearSill - 0.13 - i * 0.023, rear[0] - 0.105, 0.78, 0.009, 0.014, belt)
  }
  for (const side of [-1, 1]) {
    pad(
      side * topW * 0.56,
      ceilingY - 0.011,
      headerZ + 0.156,
      topW * 0.69,
      0.023,
      0.202,
      0.01,
      cloth,
      -0.035,
    )
    box(side * topW * 0.38, ceilingY - 0.025, headerZ + 0.21, 0.085, 0.012, 0.02, belt)
  }
  pad(0, ceilingY - 0.01, headerZ + 0.25, 0.145, 0.025, 0.122, 0.011, cloth)
  box(0, ceilingY - 0.027, headerZ + 0.23, 0.079, 0.008, 0.055, '#dfded3')
  for (const side of [-1, 1]) {
    const x = side * w,
      topX = side * topW
    const f = [x, sill, front[0]],
      ft = [topX, ceilingY, headerZ],
      r = [x, rearSill, rear[0]],
      rt = [topX, ceilingY, rear[1]]
    beam(f, ft, 0.055, 0.065, lining)
    beam(rt, ft, 0.058, 0.06, lining)
    beam(r, rt, 0.1, 0.09, lining)
    quad([x, sill, rear[0] - 0.25], r, rt, [x, sill, rear[0]], trim)
    // Close the corners between the sloping windscreen, rear glass and door openings.
    quad(f, ft, [topX, ceilingY, headerZ + 0.06], [x, sill, front[0] + 0.09], lining)
    quad(r, rt, [topX, ceilingY, rear[1] - 0.11], [x, sill, rear[0] - 0.18], lining)
    beam([x, sill, p.post], [topX, ceilingY, p.post + 0.03], 0.05, 0.081, belt)
    box(
      x,
      (floor + sill) / 2,
      (rear[0] + front[0]) / 2,
      0.055,
      sill - floor + 0.04,
      rear[0] - front[0] + 0.05,
      trim,
    )
    box(
      x - side * 0.02,
      sill - 0.025,
      (rear[0] + front[0]) / 2,
      0.07,
      0.05,
      rear[0] - front[0],
      rubber,
    )
    for (const [lo, hi] of [
      [front[0] + 0.04, p.post - 0.04],
      [p.post + 0.04, rear[0] - 0.08],
    ]) {
      const span = hi - lo,
        mid = (hi + lo) / 2
      box(x - side * 0.038, sill - 0.108, mid, 0.018, 0.013, span * 0.88, metal)
      pad(x - side * 0.045, sill - 0.24, mid, 0.08, 0.085, span * 0.67, 0.032, belt)
      box(x - side * 0.065, sill - 0.152, lo + span * 0.3, 0.03, 0.026, 0.12, metal)
    }
  }
  // Cowl, layered dash fascia and padded passenger-side bolster.
  const cowlDepth = Math.max(0.1, dashZ - front[0] + 0.13)
  pad(
    0,
    dashY + 0.015,
    dashZ - cowlDepth / 2 + 0.022,
    2 * w - 0.035,
    0.17,
    cowlDepth,
    0.048,
    rubber,
  )
  pad(0, dashY - 0.115, dashZ + 0.003, 2 * w - 0.05, 0.21, 0.115, 0.048, trim)
  box(0, dashY - 0.065, dashZ + 0.067, 2 * w - 0.105, 0.009, 0.012, metal)
  pad(w * 0.46, dashY - 0.13, dashZ + 0.068, w * 0.62, 0.089, 0.018, 0.02, trim)
  box(w * 0.46, dashY - 0.097, dashZ + 0.085, 0.105, 0.012, 0.012, rubber)
  for (const vx of [-w * 0.82, 0.01, w * 0.82]) {
    const width = vx === 0.01 ? 0.23 : 0.115
    pad(vx, dashY + 0.005, dashZ + 0.052, width, 0.058, 0.034, 0.012, '#191e21')
    for (let i = -1; i <= 1; i++)
      box(vx, dashY + 0.005 + i * 0.014, dashZ + 0.074, width - 0.017, 0.004, 0.009, metal)
  }
  const faceZ = dashZ + 0.1,
    gaugeY = dashY + 0.041,
    gaugeW = 0.395,
    gaugeH = gaugeW / 3
  pad(eye.x, gaugeY, dashZ + 0.038, gaugeW + 0.026, gaugeH + 0.025, 0.074, 0.035, '#191d20')
  panel(
    eye.x,
    gaugeY,
    faceZ,
    gaugeW,
    gaugeH,
    instruments(spec.name, accent, Math.ceil((spec.max * 3.6) / 40) * 40),
  )
  const needles = [174, 594].map((px) => {
    const pivot = new THREE.Group()
    pivot.position.set(
      eye.x + (px / 768 - 0.5) * gaugeW,
      gaugeY + (0.5 - 136 / 256) * gaugeH,
      faceZ + 0.002,
    )
    const g = new THREE.ConeGeometry(0.0033, 0.047, 4)
    g.translate(0, 0.021, 0)
    pivot.add(new THREE.Mesh(g, pointerMat))
    group.add(pivot)
    return pivot
  })
  const center = faceTexture(384, 160, (ctx) => {
    ctx.fillStyle = '#16232a'
    ctx.fillRect(0, 0, 384, 160)
    ctx.fillStyle = accent
    ctx.fillRect(19, 22, 5, 25)
    ctx.fillStyle = '#f0f2e8'
    ctx.font = 'bold 25px Arial'
    ctx.fillText('CLIMATE', 34, 45)
    ctx.font = '49px Arial'
    ctx.fillText('20°', 20, 115)
    ctx.fillText('20°', 276, 115)
    ctx.fillStyle = '#859c9b'
    ctx.font = '18px Arial'
    ctx.fillText('AUTO', 158, 104)
    ctx.fillRect(20, 136, 344, 2)
  })
  pad(0.038, dashY - 0.14, faceZ, 0.25, 0.129, 0.028, 0.017, '#22282a')
  panel(0.038, dashY - 0.14, faceZ + 0.022, 0.23, 0.096, center)
  // Center tunnel with shifter boot, selector, and padded armrest.
  const consoleY = floor + 0.21
  pad(0, consoleY, (eye.z + dashZ) / 2, 0.2, 0.18, eye.z - dashZ + 0.36, 0.032, belt)
  pad(0, consoleY + 0.097, wheelZ + 0.1, 0.145, 0.021, 0.2, 0.009, metal)
  pad(0, consoleY + 0.12, wheelZ + 0.1, 0.1, 0.035, 0.14, 0.012, rubber)
  box(0, consoleY + 0.18, wheelZ + 0.1, 0.024, 0.1, 0.032, metal, -0.15)
  pad(0, consoleY + 0.225, wheelZ + 0.095, 0.069, 0.058, 0.075, 0.018, rubber)
  pad(0, consoleY + 0.12, eye.z + 0.08, 0.17, 0.055, 0.27, 0.023, seat)
  function chair(x, z, driver = false) {
    const sw = w * 0.75,
      cushion = floor + 0.19
    pad(x, cushion, z - 0.12, sw, 0.105, 0.44, 0.045, seat)
    for (const sign of [-1, 1])
      pad(x + sign * sw * 0.42, cushion + 0.055, z - 0.11, 0.083, 0.083, 0.4, 0.032, trim)
    const backHeight = driver ? 0.32 : Math.min(0.49, sill - cushion - 0.055)
    const cy = cushion + backHeight * 0.55
    pad(x, cy, z + 0.15, sw, 0.99 * backHeight, 0.095, 0.072, seat, 0.15)
    pad(x, cy, z + 0.084, sw * 0.66, backHeight * 0.8, 0.034, 0.04, trim, 0.15)
    for (let j = -1; j <= 1; j++)
      box(x, cy + j * 0.065, z + 0.06 + j * 0.01, sw * 0.53, 0.004, 0.008, seat, 0.15)
    if (!driver) {
      const top = cy + backHeight * 0.49
      for (const dx of [-0.074, 0.074])
        box(x + dx, top + 0.034, z + 0.18, 0.014, 0.098, 0.014, metal)
      pad(x, top + 0.126, z + 0.19, sw * 0.56, 0.16, 0.102, 0.053, seat, 0.12)
    }
  }
  chair(eye.x, eye.z + 0.045, true)
  chair(-eye.x, eye.z + 0.045)
  if (type !== 'sports') {
    const back = rear[0] - 0.31,
      cushion = floor + 0.22
    const height = rearSill - cushion - 0.04,
      middle = cushion + height * 0.55
    pad(0, cushion, back - 0.19, 2 * w - 0.15, 0.13, 0.4, 0.05, seat)
    pad(0, middle, back, 2 * w - 0.16, height, 0.12, 0.055, trim, 0.13)
    for (const sx of [-eye.x, eye.x]) {
      pad(sx, middle, back - 0.078, 0.4, height * 0.78, 0.036, 0.035, seat, 0.13)
      for (const side of [-1, 1]) {
        pad(sx + side * 0.205, middle, back - 0.071, 0.065, height * 0.83, 0.076, 0.032, trim, 0.13)
        box(sx + side * 0.168, middle, back - 0.104, 0.003, height * 0.65, 0.004, cloth, 0.13)
      }
      for (const dx of [-0.059, 0.059])
        box(sx + dx, rearSill + 0.01, back + 0.035, 0.012, 0.09, 0.012, metal)
      pad(sx, rearSill + 0.081, back + 0.036, 0.24, 0.125, 0.09, 0.038, seat, 0.12)
    }
  }
  // Separate wheel assembly so the rim, hub and spokes rotate together.
  wheel.position.set(eye.x, wheelY, wheelZ)
  wheel.rotation.x = -0.22
  const rotor = new THREE.Group()
  wheel.add(rotor)
  group.add(wheel)
  part(new THREE.TorusGeometry(0.162, 0.019, 10, 64), rubber, 0, 0, 0, 0, 0, 0, wheelParts)
  for (const sign of [-1, 1]) {
    box(sign * 0.106, -0.022, 0, 0.1, 0.033, 0.027, trim, 0, 0, sign * 0.19, wheelParts)
    box(sign * 0.104, -0.034, 0.015, 0.077, 0.006, 0.007, metal, 0, 0, sign * 0.19, wheelParts)
  }
  box(0, -0.104, 0, 0.032, 0.105, 0.024, metal, 0, 0, 0, wheelParts)
  pad(0, -0.015, 0.008, 0.141, 0.102, 0.043, 0.033, rubber, 0, wheelParts)
  box(0, -0.006, 0.035, 0.035, 0.008, 0.005, metal, 0, 0, 0, wheelParts)
  box(eye.x, wheelY - 0.067, (wheelZ + dashZ) / 2, 0.08, 0.079, wheelZ - dashZ, belt)
  // Headliner trim and a compact rear-view mirror above the main road sightline.
  beam([0, ceilingY, headerZ], [0, ceilingY - 0.048, headerZ + 0.1], 0.017, 0.018, belt)
  pad(0, ceilingY - 0.062, headerZ + 0.11, 0.206, 0.055, 0.022, 0.012, rubber)
  const mirror = panel(0, ceilingY - 0.062, headerZ + 0.132, 0.193, 0.045, mirrorMaterial())
  const badge = faceTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#303335'
    ctx.fillRect(0, 0, 128, 64)
    ctx.strokeStyle = '#a8b1ac'
    ctx.lineWidth = 3
    ctx.strokeRect(3, 3, 122, 58)
    ctx.fillStyle = '#f0f0e5'
    ctx.font = 'bold 34px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(
      spec.name
        .split(' ')
        .map((word) => word[0])
        .join(''),
      64,
      44,
    )
  })
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.026), badge)
  emblem.position.set(0, -0.006, 0.042)
  rotor.add(emblem)
  for (const sign of [-1, 1]) {
    for (let j = 0; j < 3; j++)
      box(sign * (0.089 + j * 0.014), -0.018, 0.02, 0.008, 0.011, 0.005, belt, 0, 0, 0, wheelParts)
  }
  for (const [pieces, parent] of [
    [shell, group],
    [fabric, group],
    [wheelParts, rotor],
  ]) {
    parent.add(
      new THREE.Mesh(mergeGeometries(pieces), pieces === fabric ? upholsteryMaterial() : solids),
    )
    for (const g of pieces) g.dispose()
  }
  return {
    group,
    mirror,
    update(car) {
      rotor.rotation.z = car.steer * 3.3
      const speedFraction = Math.min(
        1,
        (Math.abs(car.speed) * 3.6) / (Math.ceil((spec.max * 3.6) / 40) * 40),
      )
      needles[0].rotation.z = Math.PI * (0.72 - 1.44 * speedFraction)
      needles[1].rotation.z = Math.PI * (0.72 - (1.44 * car.fuel) / 100)
    },
  }
}

export function cabinEnds(type) {
  return [cabins[type].front[0], cabins[type].rear[0] + (type === 'pickup' ? 0.13 : 0.045)]
}
