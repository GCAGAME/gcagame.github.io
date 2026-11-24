import * as THREE from 'three'
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js'
import { boxHull } from './collision.js'
import { prismFraction, worldHitFraction } from './hardcore-sight.js'

// All values are fictional game balance. Inventory is kept per journey.
export const weapons = [
  { id: 'rook', name: 'Rook Sidearm', damage: 23, spread: 0.026, interval: 0.34, capacity: 8, reload: 1.1, price: 0, ammo: 16, cost: 12 },
  { id: 'swift', name: 'Swift Repeater', damage: 18, spread: 0.041, interval: 0.14, capacity: 18, reload: 1.6, price: 140, ammo: 36, cost: 24 },
  { id: 'crest', name: 'Crest Carbine', damage: 38, spread: 0.012, interval: 0.43, capacity: 12, reload: 1.4, price: 255, ammo: 24, cost: 28 },
]
export const outfitters = [
  { name: 'Parcel Exchange Outfitters', x: 24.1, z: -96.6, signZ: -97.53, signY: 0.72, yaw: 0 },
  { name: 'North Ridge Outfitters', x: 7, z: -246.4, signZ: -245.11, signY: 1.58, yaw: Math.PI },
]
const bounded = (v, max, fallback) => Number.isInteger(v) ? Math.max(0, Math.min(max, v)) : fallback

function shopSign(site, world) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#384a46'
  ctx.fillRect(0, 0, 512, 128)
  ctx.strokeStyle = '#ceb88a'
  ctx.lineWidth = 3
  ctx.strokeRect(8, 8, 496, 112)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f7eed5'
  ctx.font = 'bold 48px "Barlow Condensed", sans-serif'
  ctx.fillText('OUTFITTERS', 256, 66)
  ctx.font = '24px sans-serif'
  ctx.fillText('ARMS  /  AMMUNITION', 256, 102)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), new THREE.MeshBasicMaterial({ map }))
  sign.position.set(site.x, world.height(site.x, site.z) + site.signY, site.signZ)
  sign.rotation.y = site.yaw
  return sign
}

export function createWeapons(scene, world, sim, camera, city, hooks) {
  const group = new THREE.Group(), prop = new THREE.Group()
  group.name = 'County outfitters'
  scene.add(group)
  group.add(prop, ...outfitters.map(site => shopSign(site, world)))
  const body = new THREE.MeshStandardMaterial({ color: 0x46545a, roughness: 0.55, metalness: 0.32 }),
    grip = new THREE.MeshStandardMaterial({ color: 0x58493c, roughness: 0.92 }),
    trim = new THREE.MeshStandardMaterial({ color: 0x283137, roughness: 0.78 }),
    bead = new THREE.MeshStandardMaterial({ color: 0xe5dbab, roughness: 0.7 })
  function part(w, h, d, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    prop.add(mesh)
    return mesh
  }
  // Chamfered slide catches the county lighting along its top edge.
  const profile = new THREE.Shape()
  profile.moveTo(-.025, -.021)
  profile.lineTo(.025, -.021)
  profile.lineTo(.025, .013)
  profile.lineTo(.017, .023)
  profile.lineTo(-.017, .023)
  profile.lineTo(-.025, .013)
  profile.closePath()
  const upper = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, { depth: .21, bevelEnabled: false }), body)
  upper.geometry.translate(0, 0, -.21)
  upper.position.z = .035
  prop.add(upper)
  part(.043, .028, .16, 0, -.028, -.046, trim)
  part(.043, .099, .06, 0, -.081, .011, grip).rotation.x = -.21
  part(.047, .009, .067, 0, -.129, .02, trim)
  part(.012, .042, .008, 0, -.051, -.062, trim)
  part(.012, .008, .069, 0, -.071, -.033, trim)
  const sight = part(.009, .012, .014, 0, .028, -.15, trim)
  // Mount the front bead and keep the rear notch fixed as the barrel length changes.
  const insert = new THREE.Mesh(new THREE.BoxGeometry(.004, .006, .002), bead)
  insert.position.set(0, .001, .0075)
  sight.add(insert)
  for (const side of [-1, 1]) {
    part(.008, .009, .016, .014 * side, .027, .021, trim)
    for (let i = 0; i < 4; i++)
      part(.002, .029, .003, .0251 * side, -.004, .009 - i * .009, trim)
  }
  const fixedTrim = prop.children.filter(mesh => mesh.material === trim && mesh !== sight)
  const hardware = mergeGeometries(fixedTrim.map(mesh => {
    mesh.updateMatrix()
    return mesh.geometry.applyMatrix4(mesh.matrix)
  }))
  prop.remove(...fixedTrim)
  fixedTrim.forEach(mesh => mesh.geometry.dispose())
  prop.add(new THREE.Mesh(hardware, trim))
  const stock = part(.04, .055, .12, 0, -.024, .087, grip)
  const magazine = part(.038, .094, .047, 0, -.074, -.114, trim)
  const foregrip = part(.05, .041, .13, 0, -.032, -.19, grip)
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.044), new THREE.MeshBasicMaterial({ color: 0xffce7a }))
  prop.add(flash)
  const mote = new THREE.OctahedronGeometry(0.045)
  const colors = [0xf6dda0, 0xc85254].map(color => new THREE.MeshBasicMaterial({ color }))
  const particles = Array.from({ length: 24 }, () => {
    const mesh = new THREE.Mesh(mote, colors[0])
    mesh.visible = false
    group.add(mesh)
    return { mesh, velocity: new THREE.Vector3(), life: 0 }
  })
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(), end = new THREE.Vector3()
  const offset = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3()
  let selected, bag, cooldown, reloadTime, queued, held, flashTime, alertTime = 0, particle = 0
  function restore(data) {
    bag = {}
    for (const gun of weapons) {
      const saved = data?.bag?.[gun.id]
      if (gun !== weapons[0] && (!saved || typeof saved !== 'object')) continue
      bag[gun.id] = { loaded: bounded(saved?.loaded, gun.capacity, gun.capacity), reserve: bounded(saved?.reserve, 240, gun.ammo) }
    }
    selected = weapons.find(w => w.id === data?.selected && bag[w.id]) || weapons[0]
    resetAction()
    clearParticles()
  }
  function resetAction() {
    alertTime = cooldown = reloadTime = flashTime = 0
    held = queued = flash.visible = prop.visible = false
  }
  function clearParticles() {
    for (const p of particles) { p.life = 0; p.mesh.visible = false }
  }
  function hit(target) {
    const blood = hooks.blood() === true
    for (let i = 0; i < (blood ? 5 : 3); i++) {
      const p = particles[particle++ % particles.length]
      p.life = 0.18 + Math.random() * 0.12
      p.mesh.material = colors[Number(blood)]
      p.mesh.position.set(target.x, target.y + 1.1, target.z)
      p.velocity.set(Math.random() * 2 - 1, 0.6 + Math.random(), Math.random() * 2 - 1)
      p.mesh.visible = true
    }
  }
  function reload() {
    const ammo = bag[selected.id]
    if (!sim.canUseWeapon || reloadTime || ammo.loaded === selected.capacity) return
    if (!ammo.reserve) return hooks.notify('No reserve rounds · Visit an outfitter')
    reloadTime = selected.reload
    hooks.sound('reload')
  }
  function equip(id) {
    const gun = weapons.find(w => w.id === id)
    if (!gun || !bag[id] || selected === gun) return
    selected = gun
    reloadTime = 0
    cooldown = Math.max(cooldown, 0.2)
    held = queued = false
    hooks.changed()
  }
  function cycle() {
    const owned = weapons.filter(w => bag[w.id])
    equip(owned[(owned.indexOf(selected) + 1) % owned.length].id)
  }
  function nearbyShop() {
    if (sim.vehicle || sim.seated) return null
    const p = sim.player
    return outfitters.find(s => Math.hypot(p.x - s.x, p.z - s.z) <= 2.1 &&
      Math.abs(p.y - world.height(s.x, s.z)) < 1 &&
      worldHitFraction(world, { x: p.x, y: p.y + 1, z: p.z }, { x: s.x, y: p.y + 1, z: s.z }) === 1)
  }
  function purchase(id, ammoOnly) {
    const gun = weapons.find(w => w.id === id)
    if (!nearbyShop() || !gun) return
    const ammo = bag[id], price = ammoOnly ? gun.cost : gun.price
    if (ammoOnly ? !ammo || ammo.reserve > 240 - gun.ammo : !!ammo) return
    if (hooks.wallet().money < price) return hooks.notify('Insufficient funds')
    hooks.wallet().money -= price
    if (ammoOnly) ammo.reserve += gun.ammo
    else {
      bag[id] = { loaded: gun.capacity, reserve: gun.ammo }
      equip(id)
    }
    hooks.sound('ui')
    hooks.changed()
  }
  function fire(aim) {
    const ammo = bag[selected.id]
    if (!ammo.loaded) {
      if (ammo.reserve) reload()
      else { held = false; hooks.notify('Out of ammunition · Visit an outfitter') }
      return
    }
    ammo.loaded--
    cooldown = selected.interval
    flashTime = 0.055
    hooks.sound('shot')
    const p = sim.player
    // In chase view the camera sits behind the avatar. Fire from the player's
    // eye line so backing a camera around a corner cannot bypass cover.
    if (sim.aimFirstPerson || sim.firstPerson) {
      origin.copy(camera.position)
      camera.getWorldDirection(direction)
    } else {
      origin.set(p.x, p.y + (p.crouching ? 1.13 : 1.65), p.z)
      direction.set(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch))
    }
    right.set(-direction.z, 0, direction.x).normalize()
    up.crossVectors(right, direction)
    const spread = selected.spread * (aim ? 0.22 : 1) * (p.speed > 3 ? 1.5 : 1)
    direction.addScaledVector(right, (Math.random() * 2 - 1) * spread)
    direction.addScaledVector(up, (Math.random() * 2 - 1) * spread).normalize()
    end.copy(origin).addScaledVector(direction, 78)
    let nearest = worldHitFraction(world, origin, end), target = null
    for (const car of [...sim.cars, ...sim.traffic, ...(sim.patrolCars || [])]) {
      if (!car.active || Math.hypot(car.x - p.x, car.z - p.z) > 82) continue
      nearest = Math.min(nearest, prismFraction(origin, end, { y: car.y, top: car.y + car.spec.roof,
        poly: boxHull(car.x, car.z, car.spec.width, car.spec.length, car.yaw) }))
    }
    for (const npc of city.targets()) {
      if (Math.hypot(npc.x - p.x, npc.z - p.z) > 79) continue
      const t = prismFraction(origin, end, { y: npc.y, top: npc.y + 1.8, poly: boxHull(npc.x, npc.z, 0.56, 0.44, npc.yaw) })
      if (t < nearest) { nearest = t; target = npc }
    }
    city.reportCrime('shot', p)
    if (target) { hit(target); city.damageNpc(target, selected.damage, p) }
  }
  function update(dt, aim) {
    cooldown = Math.max(0, cooldown - dt)
    flashTime = Math.max(0, flashTime - dt)
    const available = sim.canUseWeapon
    alertTime = Math.max(0, alertTime - dt)
    if (available && aim && !alertTime) {
      city.alertDanger(sim.player, 12)
      alertTime = 1.4
    }
    if (!available) { held = queued = false; reloadTime = 0 }
    if (reloadTime > 0) {
      reloadTime = Math.max(0, reloadTime - dt)
      if (!reloadTime) {
        const ammo = bag[selected.id], n = Math.min(selected.capacity - ammo.loaded, ammo.reserve)
        ammo.loaded += n
        ammo.reserve -= n
      }
    }
    if (available && (held || queued) && !cooldown && !reloadTime) fire(aim)
    queued = false
    prop.visible = available
    if (available) {
      const compact = selected === weapons[0], length = compact ? 1 : selected === weapons[1] ? 1.35 : 1.85
      upper.scale.z = length
      sight.position.z = .035 - .196 * length
      stock.visible = !compact
      magazine.visible = !compact
      foregrip.visible = selected === weapons[2]
      flash.position.z = .035 - .22 * length
      flash.visible = flashTime > 0
      const fp = sim.firstPerson || sim.aimFirstPerson
      if (fp) {
        // The front bead sits 0.029 m above the slide origin. Center it on
        // the camera ray so the iron sight and the actual point of aim agree.
        offset.set(aim ? 0 : 0.16, aim ? -0.029 : -0.16, -0.36 + flashTime * 0.48)
        prop.position.copy(offset.applyQuaternion(camera.quaternion)).add(camera.position)
        prop.quaternion.copy(camera.quaternion)
      } else {
        const p = sim.player
        offset.set(0.25, p.crouching ? 0.76 : 1, -0.22).applyAxisAngle(up.set(0, 1, 0), p.yaw)
        prop.position.set(p.x, p.y, p.z).add(offset)
        prop.rotation.set(p.pitch, p.yaw, 0, 'YXZ')
      }
      if (reloadTime > 0) prop.rotateX(-0.65 * Math.sin(Math.PI * reloadTime / selected.reload))
    }
    for (const p of particles) if (p.life > 0) {
      p.life -= dt
      p.mesh.visible = p.life > 0
      p.mesh.position.addScaledVector(p.velocity, dt)
      p.velocity.y -= 4 * dt
      p.mesh.scale.setScalar(Math.max(0.1, p.life * 4))
    }
  }
  restore()
  return {
    update, restore, reload, equip, cycle, purchase, nearbyShop, hit, clearParticles, resetAction,
    trigger(down) { held = down; if (down) queued = true },
    release() { held = queued = false },
    serialize: () => ({ selected: selected.id, bag: Object.fromEntries(Object.entries(bag).map(([id, a]) => [id, { ...a }])) }),
    hud: () => ({ name: selected.name, ...bag[selected.id], reloading: reloadTime > 0 }),
    shop: () => weapons.map(w => ({ ...w, owned: !!bag[w.id], reserve: bag[w.id]?.reserve || 0 })),
    setVisible(value) { group.visible = value },
  }
}
