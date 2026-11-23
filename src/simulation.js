import { clearance, limitX, limitZ, carMargins } from './boundary.js'
import { boxHull, circleHits, sweepHull } from './collision.js'
import * as THREE from 'three'
import { makeCar, vehicleSpecs } from './sim-models.js'
import { makePerson, posePerson, setPersonDetail, setPersonAppearance } from './people.js'

const STANDARD_GRAVITY = 9.80665
const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt))
const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const approach = (a, b, d) => (Math.abs(a - b) <= d ? b : a + Math.sign(b - a) * d)
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const NAMES = [
  'Ana Vale',
  'Nico Chen',
  'Ellis Ford',
  'Mara Ortiz',
  'Dev Patel',
  'Sol Harris',
  'Jules Reed',
  'Rory Bell',
  'Isa Park',
  'Amos Ward',
  'Tessa Lane',
  'Sam Okafor',
]
const SPOTS = [
  ['sedan', -8, 63, -1.13],
  ['suv', -49, 66, -Math.PI / 2],
  ['sports', -10, -87, Math.PI / 2],
  ['pickup', 56, -123, Math.PI / 2],
  ['offroad', 8, -239, 0],
]
const SIGNAL_X = [-64, 0, 64],
  SIGNAL_Z = [0, -80, -130, -180]
const CAM_ORDER = new THREE.Euler(0, 0, 0, 'YXZ')
const temp = new THREE.Vector3(),
  desiredCam = new THREE.Vector3(),
  targetCam = new THREE.Vector3()
const wetMountain = (s) => s === 'dirt' || s === 'trail' || s === 'gravel'
const CAR_DETAIL = { low: 13, medium: 21, high: 30, ultra: 39 }
const PERSON_DETAIL = { low: 7, medium: 12, high: 17, ultra: 23 }
function setCasterCount(model, count) {
  if (model.casterCount === count) return
  model.shadowParts.forEach((mesh, i) => (mesh.castShadow = i < count))
  model.casterCount = count
}

function crossingBetween(a, b) {
  const mx = (a[0] + b[0]) / 2,
    mz = (a[1] + b[1]) / 2
  for (const x of SIGNAL_X)
    for (const z of SIGNAL_Z) {
      if (
        Math.abs(mx - x) < 1 &&
        Math.abs(Math.abs(mz - z) - 7) < 1.3 &&
        Math.abs(a[0] - b[0]) > 11 &&
        Math.abs(a[0] - b[0]) < 20
      )
        return { x, z, axis: 'x', a, b }
      if (
        Math.abs(mz - z) < 1 &&
        Math.abs(Math.abs(mx - x) - 7) < 1.3 &&
        Math.abs(a[1] - b[1]) > 11 &&
        Math.abs(a[1] - b[1]) < 20
      )
        return { x, z, axis: 'z', a, b }
    }
  return null
}

function footprintDistance(x, z, car) {
  const dx = x - car.x,
    dz = z - car.z,
    s = Math.sin(car.yaw),
    c = Math.cos(car.yaw)
  const lateral = Math.abs(c * dx - s * dz) - car.spec.width * 0.5
  const length = Math.abs(s * dx + c * dz) - car.spec.length * 0.5
  return Math.hypot(Math.max(0, lateral), Math.max(0, length))
}
function signalNear(x, z, radius = 4.4) {
  const j = SIGNAL_X.find((n) => Math.abs(x - n) < radius),
    k = SIGNAL_Z.find((n) => Math.abs(z - n) < radius)
  return j === undefined || k === undefined ? null : { x: j, z: k, id: j + ',' + k }
}
function buildRoute(corners, lane = 2.45) {
  const positions = corners.map(([x, z]) => new THREE.Vector2(x, z))
  const result = []
  const right = (dir) => new THREE.Vector2(-dir.y, dir.x).multiplyScalar(lane)
  for (let i = 0; i < positions.length; i++) {
    const a = positions[(i + positions.length - 1) % positions.length],
      b = positions[i],
      c = positions[(i + 1) % positions.length]
    const incoming = b.clone().sub(a).normalize(),
      out = c.clone().sub(b).normalize()
    const entry = b.clone().add(right(incoming)).addScaledVector(incoming, -6.5)
    const exit = b.clone().add(right(out)).addScaledVector(out, 6.5)
    const corner = b.clone().add(right(incoming)).add(right(out))
    result.push(entry)
    for (let t = 1; t <= 6; t++) {
      const u = t / 6
      result.push(
        entry
          .clone()
          .multiplyScalar((1 - u) ** 2)
          .addScaledVector(corner, 2 * u * (1 - u))
          .addScaledVector(exit, u * u),
      )
    }
  }
  const lengths = [],
    total = result.reduce((sum, p, i) => {
      const len = p.distanceTo(result[(i + 1) % result.length])
      lengths.push(len)
      return sum + len
    }, 0)
  return { points: result, lengths, total }
}
function sampleRoute(route, d) {
  let offset = ((d % route.total) + route.total) % route.total
  let i = 0
  for (; i < route.lengths.length - 1 && offset > route.lengths[i]; i++) offset -= route.lengths[i]
  const a = route.points[i],
    b = route.points[(i + 1) % route.points.length],
    t = offset / Math.max(0.0001, route.lengths[i])
  return { x: lerp(a.x, b.x, t), z: lerp(a.y, b.y, t), yaw: Math.atan2(a.x - b.x, a.y - b.y) }
}
export function createSimulation(scene, camera, world) {
  const player = {
    x: -12,
    y: 0,
    z: 67,
    yaw: -0.69,
    pitch: -0.092,
    health: 100,
    speed: 0,
    grounded: true,
    crouching: false,
    swimming: false,
    steps: 0,
    flashlight: false,
    seated: false,
    surface: 'asphalt',
  }
  const avatar = makePerson(0)
  scene.add(avatar.group)
  const cars = [],
    traffic = [],
    npcs = []
  let current = null,
    first = true,
    driverView = false,
    elapsed = 0,
    phase = 0,
    vertical = 0,
    vx = 0,
    vz = 0,
    cruiseYaw = 0,
    camYaw = 0,
    camPitch = 0.19,
    orbitWait = 0,
    seat = false,
    approachDoor = null,
    transfer = null,
    collisionCooldown = 0,
    impactSpeed = 0,
    impactG = 0,
    violation = 0,
    lastSignal = '',
    doorIdle = 0,
    collisions = 0,
    appearance = 'field',
    headHeight = 1.64,
    snapping = true,
    quality = 'high',
    tick = 0,
    foodClock = 0
  const floor = (x, z) => world.height(x, z)
  const surfaceAt = (x, z) => world.surface?.(x, z) ?? world.surfaceAt?.(x, z) ?? 'road'
  const wetAt = (x, z) => world.waterAt?.(x, z) === true
  world.setDoorOccupancyTest?.((poly, bottom, top, pad, x, z, reach) => {
    function personHits(p, radius, height) {
      return (
        Math.abs(x - p.x) <= reach + radius &&
        Math.abs(z - p.z) <= reach + radius &&
        p.y <= top &&
        p.y + height >= bottom &&
        circleHits(p.x, p.z, radius + pad, poly)
      )
    }
    if (
      (!current && personHits(player, 0.29, player.crouching ? 1.24 : 1.8)) ||
      npcs.some((p) => personHits(p, 0.2, 1.8))
    )
      return true
    for (const group of [cars, traffic])
      for (const car of group) {
        if (
          !car.active ||
          Math.hypot(x - car.x, z - car.z) > reach + car.hullRadius + pad ||
          car.y > top ||
          car.y + car.spec.roof < bottom
        )
          continue
        if (
          sweepHull(
            boxHull(car.x, car.z, car.spec.width, car.spec.length, car.yaw),
            poly,
            0,
            0,
            pad,
          ) < 1
        )
          return true
      }
    return false
  })
  const blocked = (x, z, r, y, head) =>
    world.blocked(x, z, r, y, head) || Math.abs(x) > 900 || Math.abs(z) > 900
  function carEntity(type, x, z, yaw, id, color, ai = false) {
    const spec = vehicleSpecs[type],
      model = makeCar(type, color, ai)
    scene.add(model.group)
    return {
      id,
      type,
      name: spec.name,
      spec,
      hullRadius: Math.hypot(spec.width, spec.length) * .5,
      model,
      x,
      y: floor(x, z),
      z,
      yaw,
      speed: 0,
      gear: 'N',
      longitudinalG: 0, lateralG: 0, wheelTorqueNm: 0,
      fuel: 100,
      condition: 100,
      headlights: false,
      braking: false,
      upgraded: false,
      steer: 0,
      roll: 0,
      lean: 0,
      tilt: 0,
      travelYaw: yaw,
      wheelSpin: 0,
      bounce: 0,
      prevSpeed: 0,
      turnSignal: 0,
      ai,
      active: true,
    }
  }
  SPOTS.forEach(([type, x, z, yaw]) => cars.push(carEntity(type, x, z, yaw, type)))
  const routes = [
    buildRoute([
      [0, 60],
      [0, -180],
      [64, -180],
      [64, 60],
    ]),
    buildRoute([
      [-64, 0],
      [64, 0],
      [64, -130],
      [-64, -130],
    ]),
    buildRoute([
      [0, -180],
      [0, 60],
      [-64, 60],
      [-64, -180],
    ]),
    buildRoute([
      [64, -80],
      [-64, -80],
      [-64, -180],
      [64, -180],
    ]),
  ]
  const trafficPaint = [
    0x7e8781, 0xc2b7a0, 0x5c7480, 0x6e5149, 0x4a5050, 0xd4cdbd, 0x53636c, 0x666d60,
  ]
  for (let i = 0; i < 8; i++) {
    const route = routes[i % routes.length],
      progress = route.total * ((0.17 + i * 0.293) % 1),
      at = sampleRoute(route, progress)
    const v = carEntity(
      ['sedan', 'suv', 'pickup', 'sedan'][i % 4],
      at.x,
      at.z,
      at.yaw,
      'traffic-' + i,
      trafficPaint[i],
      true,
    )
    Object.assign(v, {
      route,
      progress,
      initialProgress: progress,
      cruise: 6.2 + (i % 4) * 0.93,
      speed: 4.3,
    })
    traffic.push(v)
  }
  const walks = [
    [
      [7.3, -72.7],
      [7.3, -7],
      [-7.3, -7],
      [-7.3, -72.7],
    ],
    [
      [-7.9, -7],
      [-7.9, -71],
    ],
    [
      [-30, -72.7],
      [-7.3, -72.7],
      [7.3, -72.7],
      [7.3, -87.3],
      [14, -87.3],
      [14, -89],
      [14, -91.4],
      [14, -95],
      [19, -95],
    ],
    [
      [33, -87.3],
      [23, -87.3],
      [14, -87.3],
      [14, -89],
      [14, -91.4],
      [14, -94],
      [22, -94],
    ],
    [
      [71.7, -119],
      [71.7, -91],
    ],
    [
      [-55.9, -139],
      [-55.9, -171],
    ],
    [
      [-53, 52.1],
      [-10, 52.1],
    ],
    [
      [10, -172.1],
      [53, -172.1],
    ],
    [
      [-55.9, -69],
      [-55.9, -10],
    ],
    [
      [-48, -122.1],
      [-11, -122.1],
    ],
    [
      [11, 7.8],
      [51, 7.8],
    ],
  ]
  const depot = world.locations.depot
  const actor = (index, x, z, role, path = null) => {
    const model = makePerson(index + 1, true),
      p = {
        x,
        z,
        originX: x,
        originZ: z,
        name: NAMES[index % NAMES.length],
        role,
        path,
        model,
        y: floor(x, z),
        yaw: index * 1.7,
        dir: 1,
        from: 0,
        to: 1,
        crossing: null,
        phase: index * 0.8,
        rest: (index % 3) * 0.4,
        speed: 0.91 + (index % 5) * 0.09,
        clock: index * 1.1,
        shift: index === 3 ? [7.4, 16.6] : index === 4 ? [10.2, 18.3] : null,
      }
    scene.add(model.group)
    npcs.push(p)
    return p
  }
  actor(0, depot.x + 0.75, depot.z + 0.35, 'dispatcher')
  walks.forEach((path, i) => {
    const t = (i * 0.673 + 0.31) % 1
    actor(
      i + 1,
      lerp(path[0][0], path[1][0], t),
      lerp(path[0][1], path[1][1], t),
      i === 1 ? 'courier' : 'resident',
      path,
    )
  })
  actor(npcs.length, -89, -72, 'race-steward').name = 'Lee Mercer'
  actor(npcs.length, -93, -71.5, 'delivery-coordinator').name = 'Imani Bell'
  const publicDoor = world.interactables?.find(
    (a) => a.type === 'door' && Math.abs(a.x - depot.x) < 1.1 && Math.abs(a.z - depot.z) < 3.0,
  )
  function doorOpen() {
    return publicDoor?.isOpen ?? publicDoor?.label?.toLowerCase().startsWith('close ')
  }
  function changeDoor(open) {
    if (!publicDoor || doorOpen() === open) return
    if (publicDoor.setOpen) publicDoor.setOpen(open)
    else publicDoor.activate()
  }
  const headlights = [],
    lampsTarget = []
  for (const sign of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xffe4ad, 0, 67, 0.32, 0.58, 1.3)
    const aim = new THREE.Object3D()
    lamp.target = aim
    scene.add(lamp, aim)
    headlights.push(lamp)
    lampsTarget.push(aim)
  }
  const flashlight = new THREE.SpotLight(0xffefce, 0, 53, 0.49, 0.65, 1.25)
  const flashTarget = new THREE.Object3D()
  flashlight.target = flashTarget
  scene.add(flashlight, flashTarget)
  function nearestCar() {
    let nearest = null,
      best = 2.6
    for (const car of cars) {
      const d = footprintDistance(player.x, player.z, car)
      if (d <= best && Math.abs(car.y - player.y) < 3) {
        best = d
        nearest = car
      }
    }
    return nearest
  }
  function nearestNpc() {
    let npc = null,
      d = 3.5
    for (const p of npcs) {
      const dist = distance(player, p)
      if (dist < d) {
        npc = p
        d = dist
      }
    }
    return npc
  }
  function obstacleForFeet(x, z) {
    if (blocked(x, z, 0.29, player.y + 0.34, player.y + (player.crouching ? 1.24 : 1.8)))
      return true
    for (const car of cars.concat(traffic)) {
      if (
        car.active &&
        Math.hypot(car.x - x, car.z - z) < 5 &&
        footprintDistance(x, z, car) < 0.24 &&
        Math.abs(player.y - car.y) < car.spec.roof - 0.1
      )
        return true
    }
    return false
  }
  function updateFeet(dt, keys, settings, lookX, lookY) {
    if (!transfer) avatar.group.scale.setScalar(1)
    if (!seat) {
      player.yaw = angle(player.yaw - lookX)
      player.pitch = clamp(player.pitch - lookY, -1.25, 1.22)
    }
    player.swimming =
      wetAt(player.x, player.z) && floor(player.x, player.z) < (world.waterLevel ?? -1.9) - 0.88
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
      strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
    const norm = Math.hypot(forward, strafe),
      sn = Math.sin(player.yaw),
      cs = Math.cos(player.yaw)
    const wantsCrouch = keys.has('ControlLeft') || keys.has('ControlRight')
    player.crouching =
      wantsCrouch ||
      (player.crouching &&
        (world.doorCeiling?.(player.x, player.z, player.y) ?? Infinity) < player.y + 1.8)
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight')
    const speed = seat
      ? 0
      : player.swimming
        ? 2.1
        : player.crouching
          ? 1.55
          : fast && forward >= 0
            ? 6.4
            : approachDoor ? 1.8 : 3.05
    const moveSin = approachDoor ? Math.sin(approachDoor.heading) : sn
    const moveCos = approachDoor ? Math.cos(approachDoor.heading) : cs
    const dx = norm ? ((strafe * moveCos - forward * moveSin) * speed) / norm : 0
    const dz = norm ? ((-forward * moveCos - strafe * moveSin) * speed) / norm : 0
    vx = approach(vx, dx, dt * (norm ? 17 : 22))
    vz = approach(vz, dz, dt * (norm ? 17 : 22))
    const nx = player.x + vx * dt,
      nz = player.z + vz * dt
    if (!obstacleForFeet(nx, player.z) && floor(nx, player.z) - player.y < 0.59) player.x = nx
    else vx = 0
    if (!obstacleForFeet(player.x, nz) && floor(player.x, nz) - player.y < 0.59) player.z = nz
    else vz = 0
    const ground = floor(player.x, player.z)
    if (player.swimming) {
      vertical = 0
      player.y = damp(player.y, (world.waterLevel ?? -1.9) - 0.91, 5, dt)
      player.grounded = false
    } else {
      vertical -= 19.6 * dt
      if (vertical > 0) {
        const ceiling = world.doorCeiling?.(player.x, player.z, player.y) ?? Infinity
        const head = player.y + (player.crouching ? 1.24 : 1.8)
        if (head + vertical * dt >= ceiling) {
          player.y += Math.max(0, ceiling - head)
          vertical = 0
        }
      }
      player.y += vertical * dt
      if (player.y <= ground) {
        player.y = ground
        vertical = 0
        player.grounded = true
      } else player.grounded = false
    }
    player.speed = Math.hypot(vx, vz)
    player.surface = surfaceAt(player.x, player.z)
    phase += dt * player.speed * (player.swimming ? 1.3 : 2.9)
    player.steps = Math.floor(phase / Math.PI)
    if (player.health < 100 && (foodClock += dt) > 4) {
      player.health = Math.min(player.health + 0.55, 100)
      foodClock = 0
    }
    avatar.group.visible = !!approachDoor || !first
    avatar.group.position.set(player.x, player.y, player.z)
    if (!transfer) {
      const facing = player.speed > .35 ? Math.atan2(-vx, -vz) : player.yaw
      const turn = angle(facing - avatar.group.rotation.y) * (1 - Math.exp(-10 * dt))
      avatar.group.rotation.y += turn
      posePerson(avatar, dt, player.speed, { seat, turn: turn / dt, crouch: player.crouching, swim: player.swimming })
    }
    headHeight = damp(headHeight, seat ? 1.19 : player.crouching ? 1.13 : 1.65, 12, dt)
    targetCam.set(player.x, player.y + headHeight, player.z)
    if (first && !approachDoor) {
      const bob =
        settings.headBob !== false && player.grounded
          ? Math.sin(phase * 2) * 0.024 * Math.min(1, player.speed / 3)
          : 0
      camera.position.copy(targetCam)
      camera.position.y += bob
      CAM_ORDER.set(player.pitch, player.yaw, 0, 'YXZ')
      camera.quaternion.setFromEuler(CAM_ORDER)
    } else {
      const dist = clamp(Number(settings.cameraDistance) || 4.2, 2.1, 8.5),
        heightAngle = clamp(0.22 - player.pitch, -0.16, 1.12)
      desiredCam.set(
        player.x + sn * dist * Math.cos(heightAngle),
        targetCam.y + dist * Math.sin(heightAngle),
        player.z + cs * dist * Math.cos(heightAngle),
      )
      chase(targetCam, desiredCam, dt)
      temp.copy(targetCam)
      temp.x -= sn * 0.7
      temp.z -= cs * 0.7
      camera.lookAt(temp)
    }
    flashlight.position.set(player.x, player.y + headHeight - 0.14, player.z)
    flashTarget.position.set(
      flashlight.position.x - sn * Math.cos(player.pitch) * 15,
      flashlight.position.y + Math.sin(player.pitch) * 15,
      flashlight.position.z - cs * Math.cos(player.pitch) * 15,
    )
    flashlight.visible = player.flashlight
    flashlight.intensity = player.flashlight ? 43 : 0
  }
  function chase(focus, dest, dt) {
    const dx = dest.x - focus.x,
      dy = dest.y - focus.y,
      dz = dest.z - focus.z
    const checks = Math.ceil(Math.hypot(dx, dy, dz) / 0.38)
    let t = 1
    for (let i = 1; i <= checks; i++) {
      const k = i / checks,
        x = focus.x + dx * k,
        z = focus.z + dz * k,
        y = focus.y + dy * k
      if (blocked(x, z, 0.13, y) || y < floor(x, z) + 0.24) {
        t = Math.max(0.1, (i - 1) / checks)
        break
      }
    }
    temp.set(focus.x + dx * t, focus.y + dy * t, focus.z + dz * t)
    if (snapping || t < 1) camera.position.copy(temp)
    else camera.position.lerp(temp, 1 - Math.exp(-14 * dt))
  }
  function traceCar(c, x, z, yaw, dx = 0, dz = 0, turn = 0, footprint = null) {
    const width = c.spec.width,
      length = c.spec.length,
      radius = c.hullRadius
    const moving = footprint || boxHull(x, z, width, length, yaw),
      padding = radius * Math.abs(turn)
    const terrain = floor(x, z),
      end = floor(x + dx, z + dz)
    const bottom = Math.min(terrain, end) + 0.11,
      top = Math.max(terrain, end) + c.spec.roof
    const travel = Math.hypot(dx, dz)
    const midX = x + dx * .5, midZ = z + dz * .5
    const reach = radius + padding
    const halfX = reach + Math.abs(dx) * .5, halfZ = reach + Math.abs(dz) * .5
    let first = 1
    for (const shape of world.candidates(midX, midZ, reach + travel * .5)) {
      // Grid cells include shapes elsewhere on the block. Only overlapping
      // swept bounds need an exact separating-axis test.
      if (Math.abs(shape.x - midX) > halfX + shape.w * .5 ||
          Math.abs(shape.z - midZ) > halfZ + shape.d * .5) continue
      if (shape.top < bottom || shape.y > top) continue
      first = Math.min(first, sweepHull(moving, shape.poly, dx, dz, padding))
    }
    for (const group of [cars, traffic])
      for (const other of group) {
        if (other === c || !other.active || other.y > top || other.y + other.spec.roof < bottom)
          continue
        const offsetX = other.x - midX, offsetZ = other.z - midZ
        const range = reach + travel * .5 + other.hullRadius + .15
        if (offsetX * offsetX + offsetZ * offsetZ > range * range) continue
        first = Math.min(
          first,
          sweepHull(
            moving,
            boxHull(other.x, other.z, other.spec.width, other.spec.length, other.yaw),
            dx,
            dz,
            padding,
          ),
        )
      }
    for (const [px, pz] of moving) {
      if (wetAt(px + dx, pz + dz) || clearance(px, pz) < -0.00001) return 0
    }
    return first
  }
  function parkCar(c, destination) {
    if (c === current || !cars.includes(c) || !destination) return false
    const { x, z, yaw } = destination
    if (![x, z, yaw].every(Number.isFinite) || traceCar(c, x, z, yaw) !== 1) return false
    const proposed = { x, z, yaw, spec: c.spec }
    if (!current && footprintDistance(player.x, player.z, proposed) < .45) return false
    if (npcs.some((p) => footprintDistance(p.x, p.z, proposed) < .4)) return false
    Object.assign(c, { x, z, yaw, travelYaw: yaw, clearPose: { x, z, yaw }, speed: 0,
      prevSpeed: 0, steer: 0, lean: 0, tilt: 0, bounce: 0, braking: false, gear: 'N' })
    positionCar(c, 1)
    return true
  }
  function recoverCar(c, manual = false) {
    if (!manual && traceCar(c, c.x, c.z, c.yaw) === 1) return true
    // On a hillside the centre of a recovery pose can clear the rock's top
    // while the downhill end of the chassis is still over the embedded rock.
    const { width, length } = c.spec
    const footprint = boxHull(c.x, c.z, width, length, c.yaw)
    const embeddedRocks = [...world.candidates(c.x, c.z, Math.hypot(width, length) * 0.5)].filter(
      (shape) => shape.kind === 'rock' && sweepHull(footprint, shape.poly, 0, 0, 0) < 1,
    )
    const clear = (pose) => {
      if (!pose || traceCar(c, pose.x, pose.z, pose.yaw) !== 1) return false
      const next = boxHull(pose.x, pose.z, width, length, pose.yaw)
      return embeddedRocks.every((shape) => sweepHull(next, shape.poly, 0, 0, 0) === 1)
    }
    let pose = null
    if (!manual && clear(c.clearPose)) pose = c.clearPose
    // Search locally first. Road nodes also cover an old save inside a large building.
    for (let radius = manual ? 3 : 0.4; !pose && radius <= 18; radius += 0.8) {
      for (let k = 0; k < 24; k++) {
        const a = c.yaw + (k * Math.PI) / 12,
          t = { x: c.x + radius * Math.sin(a), z: c.z + radius * Math.cos(a), yaw: c.yaw }
        if (clear(t)) {
          pose = t
          break
        }
      }
    }
    if (!pose) {
      const roadPoses = world.roads.flat().map((node) => ({ ...node, yaw: c.yaw }))
      roadPoses.sort((a, b) => distance(a, c) - distance(b, c))
      pose = roadPoses.find(clear)
    }
    if (!pose) return false
    Object.assign(c, pose, { speed: 0, travelYaw: pose.yaw, steer: 0, clearPose: { ...pose } })
    positionCar(c, 0)
    snapping = true
    if (c === current) Object.assign(player, { x: c.x, z: c.z, y: c.y, yaw: c.yaw })
    return true
  }
  function updateDrive(dt, keys, settings, lookX, lookY, wet) {
    const c = current,
      s = c.spec
    avatar.group.visible = false
    flashlight.visible = false
    flashlight.intensity = 0
    recoverCar(c)
    const throttle = keys.has('KeyW'),
      back = keys.has('KeyS'),
      hand = keys.has('Space')
    const turn = Number(keys.has('KeyA')) - Number(keys.has('KeyD'))
    const groundType = surfaceAt(c.x, c.z)
    const loose = ['grass', 'field', 'forest', 'snow', 'rock'].includes(groundType)
    const grip =
      (1 - 0.3 * wet) *
      (loose
        ? c.type === 'offroad'
          ? 0.93
          : 0.6
        : wetMountain(groundType)
          ? c.type === 'offroad'
            ? 1
            : 0.77
          : 1)
    const oldHeading = c.travelYaw
    const before = c.speed,
      abs = Math.abs(before),
      upgraded = c.upgraded ? 1.2 : 1
    const power = s.power * upgraded * (c.fuel > 0 ? 0.5 + 0.005 * c.condition : 0)
    c.braking = hand || (back && before > 0) || (throttle && before < -0.4)
    let driveAcceleration = 0
    if (throttle && !back) {
      if (before < -0.4) c.speed += dt * s.brake
      else driveAcceleration = power * Math.max(0.09, 1 - abs / (s.max * upgraded)) * (loose ? 0.8 : 1)
    } else if (back && !throttle) {
      if (before > 0.4) c.speed -= dt * s.brake * grip
      else driveAcceleration = -power * 0.46 * Math.max(0, 1 - abs / 7)
    }
    c.speed += dt * driveAcceleration
    // Total driven-wheel torque (NÂ·m) from tractive force before drag and braking.
    c.wheelTorqueNm = s.mass * driveAcceleration * s.wheel
    const friction =
      (0.3 + abs * 0.009 + abs * abs * 0.00043) * (1500 / s.mass) + (loose ? 0.85 : 0)
    if (abs > 0.25 && !hand) c.speed -= Math.sin(c.tilt) * 2.6 * dt
    c.speed = approach(
      c.speed,
      0,
      dt * (friction + (!throttle && !back ? 0.4 : 0) + (hand ? s.brake * 0.99 : 0)),
    )
    if (c.braking && abs < 0.45 && hand) c.speed = 0
    c.speed = clamp(c.speed, -8, s.max * upgraded)
    c.steer = damp(c.steer, turn * (0.545 / (1 + abs * 0.047)), 9, dt)
    const yawStep = (c.speed / s.axle) * Math.tan(c.steer) * grip * dt
    const nextYaw = angle(c.yaw + yawStep)
    const gripRate = (hand ? 2.3 : s.grip) * grip
    c.travelYaw = angle(c.travelYaw + angle(nextYaw - c.travelYaw) * (1 - Math.exp(-gripRate * dt)))
    const dx = -Math.sin(c.travelYaw) * c.speed * dt,
      dz = -Math.cos(c.travelYaw) * c.speed * dt
    let nx = c.x + dx,
      nz = c.z + dz
    if (clearance(nx, nz) < Math.hypot(s.width, s.length) * 0.5 + 0.01) {
      const [mx, mz] = carMargins(s, c.yaw, yawStep)
      nx = limitX(nx, mx)
      nz = limitZ(nz, mz)
      // Dissipate the blocked component; retain useful speed on a glancing approach.
      const hitX = Math.abs(nx - c.x - dx) > 1e-7,
        hitZ = Math.abs(nz - c.z - dz) > 1e-7
      if (hitX || hitZ) {
        const alignment = Math.hypot(
          hitX ? 0 : Math.sin(c.travelYaw),
          hitZ ? 0 : Math.cos(c.travelYaw),
        )
        c.speed *= Math.exp(-(1 - alignment) * 13 * dt)
      }
    }
    const fraction = traceCar(c, c.x, c.z, c.yaw, nx - c.x, nz - c.z, yawStep)
    if (fraction < 1) {
      const travel = Math.hypot(nx - c.x, nz - c.z) + Math.abs(yawStep) * s.length
      const safe = Math.max(0, fraction - 0.012 / Math.max(0.012, travel))
      c.x += (nx - c.x) * safe
      c.z += (nz - c.z) * safe
      c.yaw = angle(c.yaw + yawStep * safe)
      const reboundSpeed = abs > 0.7 ? -Math.sign(c.speed) * Math.min(1.4, abs * 0.12) : 0
      if (collisionCooldown <= 0) {
        if (abs > 2.4) {
          const damage = Math.max(0, (abs - 2) * 0.7)
          c.condition = Math.max(12, c.condition - damage)
          player.health = Math.max(15, player.health - damage * 0.36)
          impactSpeed = abs
          // Average collision deceleration over a modeled 100 ms contact interval.
          impactG = Math.abs(c.speed - reboundSpeed) / (0.1 * STANDARD_GRAVITY)
          c.bounce = 0.025 + 0.13 * Math.min(1, abs / 16)
          collisions++
        }
        collisionCooldown = 0.25
      }
      c.speed = reboundSpeed
      c.travelYaw = c.yaw
    } else {
      c.x = nx
      c.z = nz
      c.yaw = nextYaw
      c.clearPose = { x: nx, z: nz, yaw: nextYaw }
    }
    // Resolve the fixed-step change in velocity along and across the prior direction of travel.
    const turnAngle = c.travelYaw - oldHeading
    c.longitudinalG = (c.speed * Math.cos(turnAngle) - before) / (dt * STANDARD_GRAVITY)
    c.lateralG = c.speed * Math.sin(turnAngle) / (dt * STANDARD_GRAVITY)
    c.gear =
      Math.abs(c.speed) < 0.18
        ? 'N'
        : c.speed < 0
          ? 'R'
          : Math.min(6, 1 + Math.floor(c.speed / 7.6))
    c.fuel = Math.max(
      0,
      c.fuel - dt * (0.0009 + Math.abs(c.speed) * 0.00047) * (throttle ? 1.5 : 1),
    )
    c.turnSignal = Math.abs(c.steer) > 0.21 ? Math.sign(c.steer) : 0
    const intersection = signalNear(c.x, c.z)
    if (intersection && intersection.id !== lastSignal) {
      const axis = Math.abs(Math.sin(c.travelYaw)) > 0.707 ? 'x' : 'z'
      if (Math.abs(c.speed) > 0.65 && isRedAt(intersection.x, intersection.z, axis)) violation++
    }
    lastSignal = intersection?.id ?? ''
    c.prevSpeed = before
    positionCar(c, dt, true)
    Object.assign(player, {
      x: c.x,
      y: c.y,
      z: c.z,
      yaw: c.yaw,
      speed: Math.abs(c.speed),
      surface: groundType,
    })
    if (lookX || lookY) {
      camYaw = angle(camYaw - lookX)
      camPitch = clamp(camPitch + lookY, -0.22, 0.97)
      orbitWait = 1.35
    }
    orbitWait -= dt
    if (orbitWait <= 0 && abs > 0.8) {
      camYaw = damp(camYaw, 0, 3.1, dt)
      camPitch = damp(camPitch, 0.2, 2.1, dt)
    }
    cruiseYaw = angle(cruiseYaw + angle(c.yaw - cruiseYaw) * (1 - Math.exp(-8.2 * dt)))
    if (driverView && !transfer) {
      const p = c.model.eye
      camera.position
        .set(p.x, p.y, p.z)
        .applyQuaternion(c.model.group.quaternion)
        .add(c.model.group.position)
      CAM_ORDER.set(
        0.1 - camPitch + c.model.group.rotation.x,
        c.yaw + camYaw,
        c.model.group.rotation.z * 0.7,
        'YXZ',
      )
      camera.quaternion.setFromEuler(CAM_ORDER)
    } else {
      const heading = cruiseYaw + camYaw
      const dist =
        clamp(Number(settings.cameraDistance) || 4.2, 2.1, 8.5) * 0.56 +
        3.9 +
        Math.min(abs * 0.032, 0.92)
      targetCam.set(c.x, c.y + s.roof * 0.77, c.z)
      desiredCam.set(
        c.x + Math.sin(heading) * dist * Math.cos(camPitch),
        targetCam.y + Math.sin(camPitch) * dist + 0.44,
        c.z + Math.cos(heading) * dist * Math.cos(camPitch),
      )
      chase(targetCam, desiredCam, dt)
      temp.copy(targetCam)
      temp.x -= Math.sin(heading) * 1.15
      temp.z -= Math.cos(heading) * 1.15
      camera.lookAt(temp)
    }
    if (c.bounce > 0.002) camera.rotateX(-c.bounce * 0.32)
  }
  function positionCar(c, dt, driven = false) {
    const s = c.spec,
      sn = Math.sin(c.yaw),
      cs = Math.cos(c.yaw),
      half = s.axle * 0.5,
      w = s.width * 0.45
    c.y = floor(c.x, c.z)
    const front = floor(c.x - sn * half, c.z - cs * half),
      rear = floor(c.x + sn * half, c.z + cs * half)
    const left = floor(c.x - cs * w, c.z + sn * w),
      right = floor(c.x + cs * w, c.z - sn * w)
    c.tilt = damp(
      c.tilt,
      Math.atan2(front - rear, s.axle) +
        (driven
          ? clamp(((c.speed - c.prevSpeed) / Math.max(dt, 0.01)) * 0.0028, -0.032, 0.027)
          : 0),
      8,
      dt,
    )
    c.lean = damp(
      c.lean,
      Math.atan2(right - left, w * 2) - clamp(c.steer * c.speed * 0.006, -0.078, 0.078),
      7,
      dt,
    )
    c.bounce = damp(c.bounce, 0, 10, dt)
    c.model.group.position.set(c.x, c.y + c.bounce + 0.012, c.z)
    c.model.group.rotation.set(c.tilt, c.yaw, c.lean, 'YXZ')
    c.wheelSpin = (c.wheelSpin - (c.speed * dt) / s.wheel) % (2 * Math.PI)
    if (c.model.detail.visible)
      for (let i = 0; i < c.model.wheels.length; i++) {
        const { turn, roll } = c.model.wheels[i]
        turn.rotation.y = i < 2 ? c.steer : 0
        roll.rotation.x = c.wheelSpin
      }
    if (c.model.steering) c.model.steering.rotation.z = c.steer * 3.3
  }
  function updateCarAppearance(c, night) {
    if (
      !c.ai &&
      c !== current &&
      (c.model.group.position.x !== c.x || c.model.group.position.z !== c.z)
    )
      positionCar(c, 0.016)
    const distanceTo = distance(c, player),
      limit = (CAR_DETAIL[quality] ?? 21) * (c.model.detail.visible ? 1.09 : 0.94)
    c.model.group.visible = c.active && distanceTo < (quality === 'low' ? 182 : 325)
    c.model.detail.visible = c === current || distanceTo < limit
    c.model.coarse.visible = !c.model.detail.visible
    c.model.showCockpit(c === current && driverView && !transfer, c)
    const shadows =
      c === current ? (quality === 'low' ? 1 : 5) : distanceTo < 9 ? 5 : distanceTo < 18 ? 1 : 0
    setCasterCount(c.model, c.model.detail.visible ? shadows : 0)
    const signal = c.turnSignal
    const pulse = elapsed % 1.02 < 0.47
    c.model.setLamps(
      c.headlights || (c.ai && night) ? 2.8 : .075,
      c.braking ? 2.35 : night ? .80 : .055,
      signal > 0 && pulse ? 3.1 : 0,
      signal < 0 && pulse ? 3.1 : 0,
    )
  }
  function updateHeadlights() {
    for (let i = 0; i < 2; i++) {
      const lamp = headlights[i]
      lamp.visible = !!current?.headlights
      lamp.intensity = current?.headlights ? 64 : 0
      if (!current?.headlights) continue
      const c = current,
        side = i === 0 ? -1 : 1
      lamp.position
        .set(side * c.spec.width * 0.33, c.spec.roof * 0.52, -c.spec.length * 0.5 - 0.08)
        .applyQuaternion(c.model.group.quaternion)
        .add(c.model.group.position)
      lampsTarget[i].position
        .set(side * c.spec.width * 0.7, 0.12, -31)
        .applyQuaternion(c.model.group.quaternion)
        .add(c.model.group.position)
    }
  }
  function isRedAt(x, z, axis) {
    return world.signalOpen ? !world.signalOpen(axis, x, z) : false
  }
  function advanceTraffic(c, i, dt, night) {
    const dist = distance(c, player),
      active =
        (!night || i % 4 !== 2 || dist < 65) && (quality !== 'low' || i % 3 !== 2 || dist < 45)
    c.active = active
    if (!active) {
      c.model.group.visible = false
      return
    }
    if (dist > 155 && (tick + i) % 4 !== 0) {
      return
    }
    const step = dist > 155 ? dt * 4 : dt
    // Look ahead along the lane, so drivers signal and ease off before a turn.
    const look = sampleRoute(c.route, c.progress + Math.max(6, c.speed * 1.65))
    const bend = angle(look.yaw - c.yaw)
    c.turnSignal = Math.abs(bend) > .20 ? Math.sign(bend) : 0
    let target = Math.min(c.cruise * (night ? .82 : 1), 10 / (1 + Math.abs(bend)))
    const sin = Math.sin(c.yaw), cos = Math.cos(c.yaw)
    const half = c.spec.length * .5
    let room = Infinity
    const yieldTo = (actor) => {
      const dx = actor.x - c.x, dz = actor.z - c.z
      if (Math.abs(dx) > 25 || Math.abs(dz) > 25) return
      const along = -sin * dx - cos * dz, across = cos * dx - sin * dz
      if (along <= 0) return
      const diff = (actor.yaw || 0) - c.yaw
      const longitudinal = actor.spec
        ? .5 * (Math.abs(Math.cos(diff)) * actor.spec.length + Math.abs(Math.sin(diff)) * actor.spec.width) : .34
      const lateral = actor.spec
        ? .5 * (Math.abs(Math.sin(diff)) * actor.spec.length + Math.abs(Math.cos(diff)) * actor.spec.width) : .38
      if (Math.abs(across) > lateral + c.spec.width * .5 + .15) return
      const gap = Math.max(0, along - half - longitudinal - .7)
      room = Math.min(room, gap)
      const lead = actor.spec ? Math.max(0, actor.speed * Math.cos(diff)) : 0
      // Brake for a stopped object within the available distance, and leave
      // a speed-dependent following gap behind another moving vehicle.
      target = Math.min(target, Math.sqrt(lead * lead + 6.8 * gap), lead + Math.max(0, gap - c.speed * .75) * .65)
    }
    if (!current) yieldTo(player)
    for (const p of npcs) yieldTo(p)
    for (const v of cars) yieldTo(v)
    for (const v of traffic) if (v !== c && v.active) yieldTo(v)

    const axis = Math.abs(sin) > .707 ? 'x' : 'z'
    const probe = signalNear(c.x - sin * 13.5, c.z - cos * 13.5, 11.5)
    if (probe && isRedAt(probe.x, probe.z, axis)) {
      const along = -(probe.x - c.x) * sin - (probe.z - c.z) * cos
      const side = (probe.x - c.x) * cos - (probe.z - c.z) * sin
      const line = (axis === 'x' ? (probe.x === 0 ? 5.5 : 4.5) : (probe.z === -80 ? 5.5 : 4.5)) + 3.15 + half
      // Once a bumper has crossed the stop line, let the intersection clear.
      if (Math.abs(side) < 4 && along >= line - .12) {
        const gap = Math.max(0, along - line)
        room = Math.min(room, gap)
        target = Math.min(target, Math.sqrt(6.8 * gap))
      }
    }
    c.braking = target < c.speed - .1 || (target < .1 && room < .1)
    c.speed = approach(c.speed, target, step * (c.braking ? 4.8 : 1.65))
    const movement = Math.min(room, c.speed * step)
    const nextProgress = (c.progress + movement) % c.route.total
    const at = sampleRoute(c.route, nextProgress)
    const dx = at.x - c.x, dz = at.z - c.z
    const yawDelta = angle(at.yaw - c.yaw) * (1 - Math.exp(-10 * step))
    if (movement > 0) {
      const body = boxHull(c.x, c.z, c.spec.width, c.spec.length, c.yaw)
      if (traceCar(c, c.x, c.z, c.yaw, dx, dz, yawDelta, body) < 1) {
        c.speed = 0
        c.braking = true
        updateCarAppearance(c, night)
        return
      }
      const touches = (p) => Math.abs(c.x - p.x) < 5 && Math.abs(c.z - p.z) < 5 &&
        sweepHull(body, boxHull(p.x, p.z, .62, .62), dx, dz, Math.abs(yawDelta) * half) < 1
      if ((!current && touches(player)) || npcs.some(touches)) {
        c.speed = 0
        c.braking = true
        updateCarAppearance(c, night)
        return
      }
    }
    if (movement + .0001 < c.speed * step) c.speed = movement / step
    c.progress = nextProgress
    const old = c.yaw
    c.x = at.x
    c.z = at.z
    c.yaw = angle(c.yaw + yawDelta)
    c.steer = clamp(angle(c.yaw - old) * smootherTurn(step, c.speed), -0.39, 0.39)
    positionCar(c, step)
    updateCarAppearance(c, night)
  }
  function smootherTurn(dt, speed) {
    return 2.8 / (Math.max(dt, 0.001) * Math.max(speed, 2))
  }
  function crossingIsClear(cross) {
    if (isRedAt(cross.x, cross.z, cross.axis)) return false
    const [ax, az] = cross.a,
      [bx, bz] = cross.b,
      l2 = (bx - ax) ** 2 + (bz - az) ** 2
    for (const car of current ? [...traffic, current] : traffic) {
      if (!car.active || Math.hypot((ax + bx) * 0.5 - car.x, (az + bz) * 0.5 - car.z) > 30) continue
      for (const ahead of [0, 0.5, 1.0, 1.6, 2.1]) {
        const x = car.x - Math.sin(car.yaw) * car.speed * ahead,
          z = car.z - Math.cos(car.yaw) * car.speed * ahead
        const t = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2, 0, 1)
        if (Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t) < 2.9) return false
      }
    }
    return true
  }
  function nextStop(p, hour) {
    p.from = p.to
    p.crossing = null
    if (p.shift) {
      const onDuty = hour >= p.shift[0] && hour < p.shift[1]
      const destination = onDuty ? p.path.length - 1 : 0
      p.to = p.from + Math.sign(destination - p.from)
      if (p.from === p.to) {
        p.rest = 0.8
        return
      }
    } else p.to = (p.from + 1) % p.path.length
    p.rest = 0.18 + (p.from % 3) * 0.18
  }
  function advancePerson(p, i, dt, hour, night) {
    const dist = distance(player, p)
    p.model.group.visible = dist < (quality === 'low' ? 43 : 76)
    const near = dist < (PERSON_DETAIL[quality] ?? 12) * (p.model.detailed ? 1.09 : 0.94)
    setPersonDetail(p.model, near, near && dist < 12)
    const interval = !p.model.group.visible ? 24 : dist > 31 ? 3 : 1
    if ((tick + i) % interval !== 0) return
    dt *= interval
    p.clock += dt
    p.rest -= dt
    let speed = 0
    const previousYaw = p.yaw
    if (p.path && p.rest <= 0) {
      const tt = p.path[p.to],
        origin = p.path[p.from],
        dx = tt[0] - p.x,
        dz = tt[1] - p.z,
        remain = Math.hypot(dx, dz)
      if (remain < 0.17 || p.to === p.from) {
        nextStop(p, hour)
      } else {
        const cross = crossingBetween(origin, tt)
        if (cross && !p.crossing) {
          if (!crossingIsClear(cross)) {
            p.rest = 0.24
            posePerson(p.model, dt, 0, { look: true })
            return
          }
          p.crossing = cross
        }
        const atDoor =
          p.shift && Math.abs(p.x - depot.x) < 1.0 && Math.abs(p.z - (depot.z - 2)) < 3.65
        if (atDoor) {
          changeDoor(true)
          doorIdle = 3.2
          // Approach from outside the sweep and wait for passage, including on the return shift.
          if (publicDoor?.fraction < 0.98) {
            posePerson(p.model, dt, 0, { look: true })
            return
          }
        }
        const occupied = (car) => {
          if (!car.active || Math.abs(car.x - p.x) > 8 || Math.abs(car.z - p.z) > 8) return false
          const lead = .55
          return footprintDistance(p.x + dx / remain * lead, p.z + dz / remain * lead, car) < .46
        }
        const nearMoving = traffic.some(occupied) || cars.some(occupied)
        const stopping = distance(p, player) < 1.45
        if (!nearMoving && !stopping) {
          p.yaw = angle(p.yaw + angle(Math.atan2(-dx, -dz) - p.yaw) * (1 - Math.exp(-6 * dt)))
          const alignment = Math.max(.12, Math.cos(angle(Math.atan2(-dx, -dz) - p.yaw)))
          const stride = Math.min(
              remain,
              dt * p.speed * alignment * (p.crossing ? 1.35 : night && !p.shift ? 0.78 : 1),
            ),
            nx = p.x + (dx / remain) * stride,
            nz = p.z + (dz / remain) * stride
          if (!blocked(nx, nz, 0.2, p.y + 0.55, p.y + 1.8)) {
            p.x = nx
            p.z = nz
            speed = stride / dt
          } else if (atDoor) {
            p.rest = 0.1
          } else if (!p.shift) {
            ;[p.from, p.to] = [p.to, p.from]
            p.crossing = null
            p.rest = 1.1
          }
        } else if (stopping) {
          p.yaw += angle(Math.atan2(p.x - player.x, p.z - player.z) - p.yaw) * (1 - Math.exp(-5 * dt))
        }
      }
    } else if (!p.path && dist < 6) {
      p.yaw = angle(
        p.yaw + angle(Math.atan2(p.x - player.x, p.z - player.z) - p.yaw) * Math.min(1, dt * 3),
      )
    }
    p.y = floor(p.x, p.z)
    p.phase += dt * (speed > 0 ? speed * 5.1 : 0.6)
    p.model.group.position.set(p.x, p.y, p.z)
    p.model.group.rotation.y = p.yaw
    posePerson(p.model, dt, speed, {
      look: dist < 2.4 || (p.clock + i * 3) % 18 < 4,
      turn: angle(p.yaw - previousYaw) / dt,
    })
  }
  function startTransfer(car, mode, standing) {
    transfer?.car.model.setDoorOpen?.(0)
    transfer = { car, mode, elapsed: 0, x: standing.x, y: floor(standing.x, standing.z), z: standing.z }
  }

  const seatAnchor = new THREE.Vector3()
  const transferKeys = new Set()
  function presentDriver(dt) {
    const car = current || transfer?.car
    if (!car) return
    const cabin = car.model.cabin
    const body = car.model.group
    const footwell = car.spec.wheel * 0.65
    const pose = avatar.driverPose
    const scale = pose
      ? Math.min(1, (car.spec.roof - 0.07 - footwell) / (pose.top - pose.bottom))
      : 1
    const base = pose
      ? Math.min(
          car.spec.roof - 0.07 - pose.top * scale,
          Math.max(footwell - pose.bottom * scale, cabin.y - 0.98 * pose.top * scale),
        )
      : footwell
    seatAnchor
      .set(cabin.x, base, cabin.z + 0.05)
      .applyQuaternion(body.quaternion)
      .add(body.position)
    avatar.group.visible = transfer ? true : !driverView
    if (!transfer) {
      avatar.group.quaternion.copy(body.quaternion)
      avatar.group.scale.setScalar(scale)
      avatar.group.position.copy(seatAnchor)
      posePerson(avatar, dt, 0, { driver: true })
      return
    }
    transfer.elapsed += dt
    const progress = Math.min(1, transfer.elapsed / 1.25)
    const throughDoor = THREE.MathUtils.smoothstep(progress, 0.2, 0.84)
    const sitting = transfer.mode === 'enter' ? throughDoor : 1 - throughDoor
    const exterior = transfer
    const { x, y, z } = seatAnchor
    avatar.group.rotation.set(0, car.yaw, 0)
    avatar.group.quaternion.slerp(body.quaternion, sitting)
    avatar.group.scale.setScalar(lerp(1, scale, sitting))
    avatar.group.position.set(
      lerp(exterior.x, x, sitting),
      lerp(exterior.y, y, sitting),
      lerp(exterior.z, z, sitting),
    )
    const openness =
      THREE.MathUtils.smoothstep(progress, 0, 0.24) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.76, 1))
    car.model.setDoorOpen?.(openness)
    posePerson(
      avatar,
      dt,
      0,
      sitting >= 0.98 ? { driver: true } : { transfer: transfer.mode, progress },
    )
    if (progress === 1) transfer = null
  }

  // Test short footpaths on both sides of the bumpers before committing to a walk.
  function driverPath(car) {
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw)
    const side = car.spec.width / 2 + 0.57, end = car.spec.length / 2 + 0.58
    const point = (x, z) => ({ x: car.x + c*x + s*z, z: car.z - s*x + c*z })
    const door = point(-side, car.model.cabin.z)
    const routes = [[door]]
    for (const z of [-end, end]) {
      const left = point(-side, z), right = point(side, z)
      routes.push([left, door], [right, left, door])
    }
    let best = null, shortest = Infinity
    for (const route of routes) {
      let from = player, length = 0
      for (const to of route) {
        const span = distance(from, to), samples = Math.max(1, Math.ceil(span / 0.12))
        let ground = floor(from.x, from.z)
        for (let i = 1; i <= samples; i++) {
          const x = lerp(from.x, to.x, i / samples), z = lerp(from.z, to.z, i / samples)
          const y = floor(x, z)
          if (obstacleForFeet(x,z) || wetAt(x,z) || Math.abs(y-ground) >= 0.59) {
            length = Infinity
            break
          }
          ground = y
        }
        if (!Number.isFinite(length)) break
        length += span
        from = to
      }
      if (length < shortest) { best = route; shortest = length }
    }
    return best
  }

  const walkForward = new Set(['KeyW'])
  function walkToDoor(dt, settings) {
    const walk = approachDoor, target = walk.route[0], remaining = distance(player, target)
    if (remaining < 0.09) {
      walk.route.shift()
      vx = vz = 0
      if (!walk.route.length) {
        approachDoor = null
        beginEntry(walk.car)
        walk.onDoor?.()
      }
      return
    }
    walk.heading = Math.atan2(player.x-target.x, player.z-target.z)
    player.yaw += angle(walk.heading - player.yaw) * (1 - Math.exp(-8 * dt))
    updateFeet(dt, walkForward, settings, 0, 0)
    walk.stalled = distance(player,target) < remaining - 0.0001 ? 0 : walk.stalled + dt
    if (walk.stalled > 0.4) {
      approachDoor = null
      vx = vz = 0
    }
  }

  function enterExit(onDoor = null) {
    if (approachDoor) return { ok: false, message: "Walking to the driver’s door." }
    if (transfer)
      return { ok: false, entered: !!current, car: transfer.car, message: 'Wait for the door.' }
    if (current) {
      const car = current
      if (Math.abs(car.speed) > 2.5)
        return { ok: false, entered: false, car, message: 'Slow down to leave the vehicle.' }
      const cos = Math.cos(car.yaw),
        sin = Math.sin(car.yaw),
        s = car.spec
      const offsets = [
        [-s.width * 0.5 - 0.65, 0],
        [s.width * 0.5 + 0.65, 0],
        [-s.width * 0.5 - 0.65, 0.9],
        [0, s.length * 0.5 + 0.75],
      ]
      let spot = null
      for (const [side, long] of offsets) {
        const x = car.x + side * cos + long * sin,
          z = car.z - side * sin + long * cos
        if (
          !blocked(x, z, 0.32, floor(x, z) + 0.6) &&
          !wetAt(x, z) &&
          !cars.some((o) => o !== car && footprintDistance(x, z, o) < 0.31)
        ) {
          spot = { x, z }
          break
        }
      }
      if (!spot)
        return {
          ok: false,
          entered: false,
          car,
          message: 'Move the vehicle to make room beside a door.',
        }
      car.speed = 0
      car.braking = false
      car.steer = 0
      car.gear = 'N'
      startTransfer(car, 'exit', spot)
      current = null
      Object.assign(player, {
        ...spot,
        y: floor(spot.x, spot.z),
        yaw: car.yaw,
        pitch: -0.035,
        grounded: true,
        speed: 0,
      })
      vertical = vx = vz = 0
      snapping = true
      avatar.group.visible = !first
      return { ok: true, entered: false, car, message: 'Left ' + car.name }
    }
    const car = nearestCar()
    if (!car)
      return { ok: false, entered: false, car: null, message: 'Walk closer to a parked vehicle.' }
    const route = driverPath(car)
    if (!route) return { ok: false, message: 'The path to the driver door is blocked.' }
    if (route.length > 1 || distance(player, route[0]) > 0.32) {
      seat = player.seated = false
      vx = vz = 0
      approachDoor = { car, route, stalled: 0, onDoor }
      return { ok: true, entered: true, approaching: true, car }
    }
    return beginEntry(car)
  }

  function beginEntry(car) {
    startTransfer(car, 'enter', player)
    current = car
    car.speed = car.steer = 0
    seat = false
    player.seated = false
    player.flashlight = false
    avatar.group.visible = false
    Object.assign(player, { x: car.x, y: car.y, z: car.z, yaw: car.yaw, pitch: 0, speed: 0 })
    vertical = vx = vz = 0
    camYaw = 0
    camPitch = 0.2
    cruiseYaw = car.yaw
    orbitWait = 0
    snapping = true
    return { ok: true, entered: true, car, message: car.name }
  }
  function toggleCamera() {
    if (current) driverView = !driverView
    else first = !first
    snapping = true
    return current ? driverView : first
  }
  function jump() {
    if (!current && !approachDoor && !transfer && !seat && player.grounded) {
      vertical = 6.25
      player.grounded = false
      return true
    }
    return false
  }
  function flash() {
    if (current) return toggleLights()
    player.flashlight = !player.flashlight
    return player.flashlight
  }
  function toggleLights() {
    if (!current) return false
    current.headlights = !current.headlights
    return current.headlights
  }
  function setSeated(value) {
    seat = !!value && !current
    player.seated = seat
    vx = vz = 0
    return seat
  }
  function setAppearance(id) {
    appearance = id || 'field'
    setPersonAppearance(avatar, String(appearance).toLowerCase().includes('shell') || appearance === 'rain')
  }
  let remainder = 0,
    pendingX = 0,
    pendingY = 0
  function reset() {
    approachDoor = null
    transfer?.car.model.setDoorOpen?.(0)
    transfer = null
    avatar.group.scale.setScalar(1)
    avatar.group.rotation.set(0, 0, 0)
    remainder = pendingX = pendingY = 0
    cars.forEach((c) => (c.clearPose = null))
    Object.assign(player, {
      x: -12,
      z: 67,
      y: floor(-12, 67),
      yaw: -0.72,
      pitch: -0.092,
      health: 100,
      speed: 0,
      grounded: true,
      crouching: false,
      swimming: false,
      steps: 0,
      flashlight: false,
      seated: false,
    })
    current = null
    first = true
    driverView = false
    elapsed = phase = vertical = vx = vz = violation = collisions = tick = 0
    seat = false
    lastSignal = ''
    headHeight = 1.65
    snapping = true
    doorIdle = foodClock = collisionCooldown = 0
    setAppearance('field')
    SPOTS.forEach(([, x, z, yaw], i) => {
      Object.assign(cars[i], {
        x,
        z,
        yaw,
        travelYaw: yaw,
        clearPose: { x, z, yaw },
        speed: 0,
        prevSpeed: 0,
        longitudinalG: 0, lateralG: 0, wheelTorqueNm: 0,
        fuel: 100,
        condition: 100,
        upgraded: false,
        headlights: false,
        braking: false,
        steer: 0,
        lean: 0,
        tilt: 0,
        bounce: 0,
        gear: 'N',
      })
      positionCar(cars[i], 1)
      updateCarAppearance(cars[i], false)
    })
    for (const c of traffic) {
      c.progress = c.initialProgress
      Object.assign(c, sampleRoute(c.route, c.progress), {
        speed: 4.3,
        active: true,
        steer: 0,
        braking: false,
      })
      positionCar(c, 1)
      updateCarAppearance(c, false)
    }
    for (const [i, p] of npcs.entries()) {
      Object.assign(p, {
        x: p.originX,
        z: p.originZ,
        y: floor(p.originX, p.originZ),
        yaw: i * 1.7,
        from: 0,
        to: 1,
        crossing: null,
        phase: i * 0.8,
        rest: (i % 3) * 0.4,
        clock: i * 1.1,
      })
      p.model.group.position.set(p.x, p.y, p.z)
      p.model.group.rotation.y = p.yaw
    }
    avatar.group.visible = false
    camera.position.set(player.x, player.y + 1.65, player.z)
    camera.quaternion.setFromEuler(CAM_ORDER.set(player.pitch, player.yaw, 0, 'YXZ'))
    updateHeadlights()
    flashlight.visible = false
    flashlight.intensity = 0
  }
  function update(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return
    const fixed = 1 / 60
    remainder += Math.min(dt, 0.15)
    pendingX += input.lookX || 0
    pendingY += input.lookY || 0
    const count = Math.floor((remainder + 1e-9) / fixed)
    if (!count) return
    const controls = { ...input, lookX: pendingX / count, lookY: pendingY / count }
    remainder = Math.max(0, remainder - count * fixed)
    pendingX = pendingY = 0
    for (let i = 0; i < count; i++) stepSimulation(fixed, controls, i === count - 1)
  }
  function stepSimulation(dt, input = {}, present = true) {
    if (!Number.isFinite(dt) || dt <= 0) return
    dt = Math.min(dt, 0.075)
    elapsed += dt
    tick++
    collisionCooldown -= dt
    const { keys = new Set(), settings = {}, wet = 0, night = false } = input
    quality = (settings.quality ?? settings.preset ?? 'high').toString().toLowerCase()
    const sense = clamp(Number(settings.sensitivity) || 1, 0.05, 5) * 0.0022
    const lookX =
      (input.lookX || 0) * sense +
      (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * 1.66 * dt
    const lookY =
      (input.lookY || 0) * sense +
      (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * 1.15 * dt
    if (approachDoor) walkToDoor(dt, settings)
    else if (current) updateDrive(dt, transfer ? transferKeys : keys, settings, lookX, lookY, wet)
    else updateFeet(dt, transfer ? transferKeys : keys, settings, lookX, lookY)
    if (current || transfer) presentDriver(dt)
    const cropped = keys.has('MouseRight'),
      fov = clamp(Number(settings.fov) || 68, 40, 110) * (cropped ? 0.7 : 1)
    if (Math.abs(camera.fov - fov) > 0.035) {
      camera.fov = damp(camera.fov, fov, 12, dt)
      camera.updateProjectionMatrix()
    }
    if (present) for (const c of cars) updateCarAppearance(c, night)
    traffic.forEach((c, i) => advanceTraffic(c, i, dt, night))
    npcs.forEach((p, i) => advancePerson(p, i, dt, input.hour ?? 11, night))
    if (doorIdle > 0) {
      doorIdle -= dt
      if (doorIdle <= 0 && publicDoor && distance(player, publicDoor) > 2.6) changeDoor(false)
    }
    if (clearance(camera.position.x, camera.position.z) < 0.25) {
      camera.position.x = limitX(camera.position.x, 0.25)
      camera.position.z = limitZ(camera.position.z, 0.25)
      camera.position.y = Math.max(
        camera.position.y,
        floor(camera.position.x, camera.position.z) + 0.2,
      )
    }
    if (present) updateHeadlights()
    snapping = false
  }
  function serialize() {
    return {
      player: {
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        pitch: player.pitch,
        health: player.health,
        flashlight: player.flashlight,
      },
      cars: cars.map(({ id, x, z, yaw, fuel, condition, headlights, upgraded }) => ({
        id,
        x,
        z,
        yaw,
        fuel,
        condition,
        headlights,
        upgraded,
      })),
      current: current?.id ?? null,
      fleetParking: 2,
      first,
      driverView,
      appearance,
      violation,
    }
  }
  function restore(data) {
    if (!data || !data.player || !Array.isArray(data.cars)) throw Error('Invalid simulation save.')
    const validPose = (v) =>
      Number.isFinite(v.x) &&
      Number.isFinite(v.z) &&
      Math.abs(v.x) <= 900 &&
      Math.abs(v.z) <= 900 &&
      Number.isFinite(v.yaw)
    if (
      !validPose(data.player) ||
      !data.cars.every(
        (v) => v && validPose(v) && Number.isFinite(v.fuel) && Number.isFinite(v.condition),
      )
    )
      throw Error('Invalid position in save.')
    reset()
    const p = data.player
    Object.assign(player, {
      x: limitX(p.x, 0.3),
      z: limitZ(p.z, 0.3),
      y: floor(limitX(p.x, 0.3), limitZ(p.z, 0.3)),
      yaw: angle(p.yaw),
      pitch: clamp(Number(p.pitch) || 0, -1.25, 1.22),
      health: clamp(Number.isFinite(p.health) ? p.health : 100, 1, 100),
      flashlight: !!p.flashlight,
    })
    if (Number.isFinite(p.y)) player.y = clamp(p.y, player.y, player.y + 10)
    for (const saved of data.cars) {
      const c = cars.find((v) => v.id === saved.id)
      if (!c) continue
      const [mx, mz] = carMargins(c.spec, saved.yaw)
      Object.assign(c, {
        x: limitX(saved.x, mx),
        z: limitZ(saved.z, mz),
        yaw: angle(saved.yaw),
        travelYaw: angle(saved.yaw),
        // A restored car may share its saved spot with freshly initialized traffic.
        // Recover near that spot instead of using the spawn pose cached by reset().
        clearPose: null,
        fuel: clamp(saved.fuel, 0, 100),
        condition: clamp(saved.condition, 1, 100),
        headlights: !!saved.headlights,
        upgraded: !!saved.upgraded,
      })
      positionCar(c, 1)
    }
    first = data.first !== false
    driverView = !!data.driverView
    current = cars.find((v) => v.id === data.current) || null
    // The untouched pickup in older saves was parked nose-first into the westbound lane.
    if (!data.fleetParking) {
      const truck = cars.find((v) => v.id === 'pickup')
      if (truck !== current && truck.x === 56 && truck.z === -129 && truck.yaw === 0)
        parkCar(truck, { x: 56, z: -123, yaw: Math.PI / 2 })
    }
    setAppearance(data.appearance)
    violation = Number(data.violation) || 0
    cruiseYaw = current?.yaw ?? player.yaw
    camYaw = 0
    camPitch = 0.2
    stepSimulation(1 / 60, {})
    return true
  }
  reset()
  return {
    player,
    cars,
    npcs,
    traffic,
    reset,
    update,
    serialize,
    restore,
    enterExit,
    unstuck: () => !transfer && current && recoverCar(current, true),
    nearestCar,
    parkCar,
    nearestNpc,
    toggleCamera,
    jump,
    flash,
    toggleLights,
    setSeated,
    setAppearance,
    isRedAt,
    get vehicle() {
      return current
    },
    get firstPerson() {
      return current ? driverView : first
    },
    get trafficViolation() {
      return violation
    },
    get impactG() {
      return impactG
    },
    get impactSpeed() {
      return impactSpeed
    },
    get collisions() {
      return collisions
    },
    get seated() {
      return seat
    },
  }
}
