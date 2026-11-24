import * as THREE from 'three'
import { posePerson, setPersonDetail } from './people.js'

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const bends = [0, .55, -.55, 1.06, -1.06, 1.54, -1.54]
const capMaterial = new THREE.MeshStandardMaterial({ color: 0x253748, roughness: .95 })
const badgeMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c778, roughness: .42 })
const crown = new THREE.CylinderGeometry(.091, .103, .065, 10)
const visor = new THREE.BoxGeometry(.145, .014, .074)
const badge = new THREE.BoxGeometry(.034, .042, .007)
const sidearmBody = new THREE.BoxGeometry(.055, .064, .2)
const sidearmGrip = new THREE.BoxGeometry(.049, .095, .057)
const streetTints = [0xd68569, 0xaac082, 0xdfa65f, 0x9481b0]

// Only the role-specific actors share these accessory shapes. The original
// skin textures and animated rigs continue to drive both levels of detail.
function dress(p) {
  const model = p.model
  if (!model.ready || p.dressed || !p.cityRole) return
  const officer = p.role === 'police'
  const tinted = new Map()
  for (const mesh of [...model.near, ...model.far]) {
    const base = mesh.material
    if (officer || !base.name.endsWith('body')) continue
    if (!tinted.has(base)) {
      const copy = base.clone()
      copy.color.multiply(new THREE.Color(streetTints[p.slot]))
      tinted.set(base, copy)
    }
    mesh.material = tinted.get(base)
  }
  if (officer) {
    const head = model.character.getObjectByName('Bip01_Head')
    if (head) {
      const hat = new THREE.Group()
      const top = new THREE.Mesh(crown, capMaterial)
      const bill = new THREE.Mesh(visor, capMaterial)
      const shield = new THREE.Mesh(badge, badgeMaterial)
      bill.position.set(0, -.025, -.091)
      shield.position.set(0, .003, -.10)
      hat.add(top, bill, shield)
      model.group.add(hat)
      // Attach in the head's rest orientation while retaining metre-scale
      // geometry in rigs authored with different skeleton scales.
      const point = model.group.worldToLocal(head.getWorldPosition(new THREE.Vector3()))
      hat.position.set(point.x, point.y + .18, point.z)
      head.attach(hat)
    }
  } else if (p.slot === 3) {
    const hand = model.character.getObjectByName('Bip01_R_Hand')
    if (hand) {
      const prop = new THREE.Group()
      const body = new THREE.Mesh(sidearmBody, capMaterial)
      const grip = new THREE.Mesh(sidearmGrip, capMaterial)
      body.position.set(0, .045, -.064)
      prop.add(body, grip)
      model.group.add(prop)
      prop.position.copy(model.group.worldToLocal(hand.getWorldPosition(new THREE.Vector3())))
      hand.attach(prop)
      p.sidearm = prop
    }
  }
  p.dressed = true
}

export function presentPedestrian(p, player, dt, speed = 0) {
  const range = distance(p, player)
  const group = p.model.group
  group.visible = !p.inactive && !p.inVehicle && range < 75
  if (!group.visible) return
  group.position.set(p.x, p.y, p.z)
  group.rotation.set(0, p.yaw, 0)
  if (p.model.detailed !== (range < 18) || p.model.shadow !== (range < 12))
    setPersonDetail(p.model, range < 18, range < 12)
  posePerson(p.model, dt, speed, { look: speed < .1 })
  dress(p)
  if (p.sidearm) p.sidearm.visible = !!p.aimPoint
}

function nearCar(x, z, y, car) {
  if (!car.active || Math.abs(car.x - x) > 5 || Math.abs(car.z - z) > 5 ||
      Math.abs(car.y - y) >= car.spec.roof) return false
  const dx = x - car.x, dz = z - car.z, sn = Math.sin(car.yaw), cs = Math.cos(car.yaw)
  return Math.abs(cs * dx - sn * dz) < car.spec.width * .5 + .29 &&
    Math.abs(sn * dx + cs * dz) < car.spec.length * .5 + .29
}

export function canStand(world, sim, p, x, z) {
  const y = world.height(x, z)
  if (world.waterAt?.(x, z) || world.blocked(x, z, .26, y + .27, y + 1.75)) return false
  for (const group of [sim.cars, sim.traffic, sim.patrolCars])
    for (const car of group) if (nearCar(x, z, y, car)) return false
  if (!sim.vehicle && distance(sim.player, { x, z }) < .51 && Math.abs(sim.player.y - y) < 1.5) return false
  for (const actor of sim.npcs)
    if (actor !== p && !actor.inactive && !actor.inVehicle &&
        Math.abs(actor.x - x) < .5 && Math.abs(actor.z - z) < .5 && Math.abs(actor.y - y) < 1.5 &&
        Math.hypot(actor.x - x, actor.z - z) < .47) return false
  return true
}

export function standNear(world, sim, p, target, radius = 0) {
  for (let r = radius; r <= radius + 5; r += .65) {
    for (let i = 0; i < (r === 0 ? 1 : 14); i++) {
      const a = (p.slot || 0) + i * Math.PI / 7
      const x = target.x + r * Math.sin(a), z = target.z + r * Math.cos(a)
      if (canStand(world, sim, p, x, z)) return { x, z, y: world.height(x, z) }
    }
  }
  return null
}

export function walk(world, sim, p, goal, speed, dt) {
  if (!goal || speed <= 0 || dt <= 0) return 0
  const side = p.side ?? 1
  let remaining = Math.min(dt, .65) * speed, moved = 0
  // Even distant, infrequently updated characters sweep in short strides.
  // A sidewalk prop or the edge of a moving door cannot be skipped in one tick.
  while (remaining > .002) {
    const dx = goal.x - p.x, dz = goal.z - p.z, gap = Math.hypot(dx, dz)
    if (gap < .12) break
    const dir = Math.atan2(dx, dz)
    const step = Math.min(gap, remaining, .22)
    let advanced = false
    for (const bend of bends) {
      const a = dir + bend * side, sn = Math.sin(a), cs = Math.cos(a)
      const x = p.x + sn * step, z = p.z + cs * step
      const y = world.height(x, z)
      if (Math.abs(y - p.y) > .45 || !canStand(world, sim, p, x, z)) continue
      // Choose the freer side far enough ahead to get past corners.
      const lead = Math.min(gap, Math.max(step, .48))
      if (lead > step && !canStand(world, sim, p, p.x + sn * lead, p.z + cs * lead)) continue
      Object.assign(p, { x, y, z, yaw: Math.atan2(-sn, -cs) })
      advanced = true
      break
    }
    if (!advanced) break
    moved += step
    remaining -= step
  }
  return moved / dt
}

// Search locally only when ordinary steering stops closing the distance.
// A blocked destination (such as the centre of a cruiser) is approached
// through the nearest reachable cell. The regular walk still sweeps each step.
function detour(world, sim, p, goal) {
  const stride = .9, radius = 12
  const queue = [{ x: p.x, z: p.z, i: 0, j: 0, parent: null }]
  const seen = new Set([0]), key = (i, j) => i + j * 32
  let best = queue[0], bestGap = distance(p, goal)
  for (let k = 0; k < queue.length; k++) {
    const here = queue[k]
    const gap = distance(here, goal)
    if (gap < bestGap) { bestGap = gap; best = here }
    if (gap < stride) break
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const i = here.i + di, j = here.j + dj
      if (Math.abs(i) > radius || Math.abs(j) > radius || seen.has(key(i,j))) continue
      const x = p.x + i * stride, z = p.z + j * stride
      if (!canStand(world, sim, p, x, z) ||
          !canStand(world, sim, p, (x + here.x) / 2, (z + here.z) / 2) ||
          Math.abs(world.height(x,z) - world.height(here.x,here.z)) > .45) continue
      seen.add(key(i,j))
      queue.push({ x, z, i, j, parent: here })
    }
  }
  const path = []
  for (let node = best; node.parent; node = node.parent) path.push({ x: node.x, z: node.z })
  return path.reverse()
}

export function patrolStep(world, sim, p, clock) {
  const goal = p.goal
  if (!goal || !p.speedAI) { p.detour = p.footWatch = null; return 0 }
  const gap = distance(p, goal)
  if (!p.footWatch || distance(p.footWatch, goal) > 3) {
    p.detour = null
    p.footWatch = { x: goal.x, z: goal.z, at: clock, gap }
  }
  const watch = p.footWatch
  if (clock - watch.at >= 1.25) {
    if (gap > .7 && watch.gap - gap < .25 && !p.detour?.length) p.detour = detour(world, sim, p, goal)
    else if (p.detour?.length && distance(p, p.detour[0]) > .4 && watch.last &&
             distance(p, watch.last) < .22) p.detour = null
    Object.assign(watch, { gap, at: clock, last: { x: p.x, z: p.z } })
  }
  while (p.detour?.length && distance(p, p.detour[0]) < .32) p.detour.shift()
  return walk(world, sim, p, p.detour?.[0] || goal, p.speedAI, p.aiStep)
}
