import { createNavigation } from './navigation.js'
import { clearance } from './boundary.js'
import { isWorldOccluded } from './hardcore-sight.js'
import { presentPedestrian, standNear, walk } from './hardcore-pedestrians.js'

const blocks = [
  [[-38, 52.1], [-53, 52.1], [-13, 52.1]],
  [[12, -72.7], [42, -72.7], [8, -72.7]],
  [[-55.9, -149], [-55.9, -170], [-55.9, -138]],
  [[71.7, -102], [71.7, -92], [71.7, -119]],
].map(path => path.map(([x, z]) => ({ x, z })))
const precincts = [[-7.5, 25], [56.5, -104], [-56.5, -154], [7.5, -201], [-55.9, 32]]
  .map(([x, z]) => ({ x, z }))
const streetNames = ['Kit Rowan', 'Alex Moss', 'Remy Fox', 'Frankie Gray']
const seriousness = { theft: 1, policeTheft: 2, shot: 1, assault: 1, officer: 2, ram: 1, reckless: 1 }
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const point = p => ({ x: p.x, z: p.z })
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && clearance(p.x, p.z) >= 0

export function createHardcoreCity(scene, world, sim, hooks = {}) {
  const player = sim.player, random = hooks.random || Math.random
  const navigation = createNavigation(world.roads)
  const reckless = [], officers = [], cases = new Map(), recoveries = new Map()
  const basePeople = sim.npcs.slice()
  let enabled = false, clock = 0, nextThink = 0, arrest = 0
  let nextTrafficAlert = 0

  function targets() {
    return enabled ? sim.npcs.filter(p => !p.inactive && !p.inVehicle && p.health > 0) : []
  }
  function canSee(observer, subject, range, peripheral = true) {
    const d = distance(observer, subject)
    if (d > range || observer.inactive || subject.inactive) return false
    if (observer.spec && (!observer.active || observer.driverHealth <= 0)) return false
    if (observer.inVehicle && (!observer.ride?.active || !observer.ride.driverActive || observer.ride.taken)) return false
    const fromY = observer.y ?? world.height(observer.x, observer.z)
    const toY = subject.y ?? world.height(subject.x, subject.z)
    if (Math.abs(fromY - toY) > range * .55) return false
    if (peripheral && d > 11 && Number.isFinite(observer.yaw)) {
      const facing = -(Math.sin(observer.yaw) * (subject.x - observer.x) +
        Math.cos(observer.yaw) * (subject.z - observer.z)) / d
      if (facing < -.32) return false
    }
    return !isWorldOccluded(world,
      { x: observer.x, y: fromY + 1.52, z: observer.z },
      { x: subject.x, y: toY + (subject.crouching ? .91 : 1.18), z: subject.z })
  }
  function fleeFrom(p, danger, seconds) {
    p.fear = { ...point(danger), until: clock + seconds }
    p.managedAI = true
    p.interactive = false
  }
  function alertDanger(location, radius = 20) {
    if (!enabled || !validPoint(location)) return
    for (const p of basePeople) {
      if (p !== location && !p.inactive && canSee(p, location, radius, false)) {
        if (!p.fear && !p.returnTo) p.returnTo = point(p)
        fleeFrom(p, location, 3 + random() * 2)
      }
    }
    if (clock >= nextTrafficAlert) {
      sim.alertTraffic?.(location.x, location.z)
      nextTrafficAlert = clock + .6
    }
  }
  function reportCrime(kind, offender = player, location = offender, victim = null) {
    if (!enabled || !seriousness[kind] || !validPoint(offender) || !validPoint(location)) return false
    const range = kind === 'shot' ? 58 : kind === 'theft' ? 23 : 33
    const quiet = kind === 'theft'
    const witness = p => p !== offender && !p.inactive && !p.inVehicle && canSee(p, offender, range, quiet)
    const officerSaw = officers.some(p => !p.inactive && canSee(p, offender, range, quiet))
    const witnessSaw = (victim && witness(victim)) ||
      basePeople.some(witness) ||
      sim.traffic.some(c => c !== offender && c.active && !c.reckless && canSee(c, offender, range * .75, quiet))
    alertDanger(location, kind === 'shot' ? 33 : 17)
    // A cruiser's door alarm radios its location once, at the time of theft.
    if (!officerSaw && !witnessSaw && kind !== 'policeTheft') return false
    // Nonviolent theft can go unreported even on an occupied street.
    if (!officerSaw && kind === 'theft' && random() >= .78) return false
    let file = cases.get(offender)
    if (!file) {
      file = { offender, stars: 0, last: point(location), seen: false, lastSeen: clock,
        decayAt: clock + 18, cooldowns: new Map() }
      cases.set(offender, file)
    }
    file.last = point(location)
    file.lastSeen = clock
    file.decayAt = clock + 18
    const throttle = kind === 'shot' ? 5 : kind === 'ram' ? 6 : 2.3
    if ((file.cooldowns.get(kind) ?? -Infinity) <= clock) {
      file.stars = Math.min(5, file.stars + seriousness[kind])
      file.cooldowns.set(kind, clock + throttle)
    }
    if (offender.spec && offender.reckless) offender.policePursued = true
    nextThink = Math.min(nextThink, clock)
    return true
  }
  function stopRiding(p) {
    if (!p.inVehicle) return true
    const car = p.ride
    // Find a safe standing position beside the actual car before relinquishing it.
    const position = standNear(world, sim, p, car, car.spec.width * .5 + .65)
    if (!position) return false
    if (!car.taken && car !== sim.vehicle) sim.stopPatrol(car)
    p.inVehicle = false
    p.ride = null
    Object.assign(p, position)
    return true
  }
  function retire(file) {
    if (!file) return
    cases.delete(file.offender)
    if (file.offender.spec) file.offender.policePursued = false
    for (const p of officers) {
      if (p.file !== file) continue
      p.file = null
      p.goal = null
      p.roadPath = null
      stopRiding(p)
    }
    if (file.offender === player) arrest = 0
  }
  function clearWanted() { retire(cases.get(player)) }

  function resetStreet(p, relocated = false) {
    const score = i => Math.min(100, distance(blocks[i][0], player)) -
      reckless.filter(other => other !== p && other.district === i).length * 35
    const order = blocks.map((_, i) => (p.slot + i) % blocks.length)
    if (relocated) order.sort((a, b) => score(b) - score(a))
    let spot, district
    for (district of order) {
      for (const home of blocks[district]) {
        spot = standNear(world, sim, p, home)
        if (spot) break
      }
      if (spot) break
    }
    if (!spot) return false
    Object.assign(p, spot, { health: p.maxHealth, inactive: false, interactive: false, fear: null,
      district, roam: 1, hostile: null, armed: false, aimPoint: null, fightUntil: 0,
      nextAction: clock + 12 + p.slot * 6 + random() * 13,
      nextStrike: clock + 1, speedAI: 1.25, goal: blocks[district][1], managedAI: true })
    return true
  }
  function resetOfficer(p) {
    stopRiding(p)
    const home = precincts[p.slot]
    const spot = standNear(world, sim, p, home)
    Object.assign(p, spot || { ...home, y: world.height(home.x, home.z) }, {
      health: p.maxHealth, inactive: p.slot !== 0, inVehicle: false, ride: null, interactive: false,
      managedAI: true, file: null, goal: null, speedAI: 0, patrolEnd: 1, roadPath: null,
    })
  }
  function extra(slot, role, home) {
    const police = role === 'police'
    const p = sim.spawnCityPerson(24 + (police ? 4 : 0) + slot, home.x, home.z, role)
    Object.assign(p, { cityRole: true, slot, maxHealth: police ? 100 : 65 + slot * 4,
      name: police ? 'County patrol ' + (slot + 1) : streetNames[slot],
      side: slot % 2 ? -1 : 1, managedAI: true, interactive: false, aiStep: 0 })
    return p
  }
  function setEnabled(value) {
    if (enabled === Boolean(value)) return
    enabled = Boolean(value)
    if (!enabled) {
      for (const file of [...cases.values()]) retire(file)
      for (const p of [...reckless, ...officers]) {
        scene.remove(p.model.group)
        const i = sim.npcs.indexOf(p)
        if (i >= 0) sim.npcs.splice(i, 1)
      }
      for (const p of basePeople) {
        if (p.cityOrigin) Object.assign(p, p.cityOrigin)
        for (const key of ['health','maxHealth','cityOrigin','managedAI','fear','returnTo','inactive','aiStep','goal','speedAI'])
          delete p[key]
        p.model.group.position.set(p.x, p.y, p.z)
      }
      recoveries.clear()
      return
    }
    clock = nextThink = nextTrafficAlert = arrest = 0
    for (const p of basePeople) {
      p.cityOrigin = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, from: p.from, to: p.to,
        interactive: p.interactive, crossing: p.crossing }
      p.health = p.maxHealth = 55
      p.aiStep = 0
    }
    if (!reckless.length) {
      blocks.forEach((path, i) => reckless.push(extra(i, 'reckless-pedestrian', path[0])))
      precincts.forEach((home, i) => officers.push(extra(i, 'police', home)))
    } else for (const p of [...reckless, ...officers]) {
      sim.npcs.push(p)
      scene.add(p.model.group)
    }
    reckless.forEach(p => resetStreet(p))
    officers.forEach(resetOfficer)
    for (const p of [...reckless, ...officers]) presentPedestrian(p, player, 0)
  }
  function damageNpc(p, amount, attacker = player) {
    if (!enabled || !sim.npcs.includes(p) || p.inactive || p.inVehicle || !(amount > 0)) return false
    reportCrime(p.role === 'police' ? 'officer' : 'assault', attacker, attacker, p)
    p.health = Math.max(0, p.health - amount)
    if (p.health > 0 && p.role === 'reckless-pedestrian') {
      if (p.hostile !== attacker) p.armed = p.slot === 3 && random() < .42
      p.hostile = attacker
      p.fightUntil = clock + 7
    }
    if (attacker !== player) hooks.showHit?.(p)
    if (p.health > 0) return true
    retire(cases.get(p))
    if (p.role === 'reckless-pedestrian' && resetStreet(p, true)) return true
    p.inactive = p.managedAI = true
    p.interactive = p.model.group.visible = false
    p.goal = null
    recoveries.set(p, clock + (p.role === 'police' ? 36 : 20))
    return true
  }
  function restoreActor(p) {
    if (p.role === 'police') { resetOfficer(p); return true }
    if (p.role === 'reckless-pedestrian') return resetStreet(p, true)
    const spot = standNear(world, sim, p, { x: p.originX, z: p.originZ })
    if (!spot) return false
    Object.assign(p, spot, { health: p.maxHealth, inactive: false, managedAI: false, fear: null,
      returnTo: null, interactive: p.cityOrigin?.interactive, from: 0, to: 1, crossing: null })
    return true
  }
  function away(p, danger, meters = 9) {
    const dx = p.x - danger.x, dz = p.z - danger.z, len = Math.hypot(dx, dz)
    const az = len > .1 ? Math.atan2(dx, dz) : p.yaw
    return { x: p.x + Math.sin(az) * meters, z: p.z + Math.cos(az) * meters }
  }
  function civilianPlan(p) {
    if (p.inactive || !p.managedAI) return
    if (p.fear && p.fear.until > clock) {
      p.goal = away(p, p.fear)
      p.speedAI = 3.7
      return
    }
    p.fear = null
    if (p.returnTo && distance(p, p.returnTo) > .8) {
      p.goal = p.returnTo
      p.speedAI = 1.75
      return
    }
    p.returnTo = p.goal = null
    p.managedAI = false
    p.interactive = p.cityOrigin?.interactive
  }
  function streetPlan(p) {
    if (p.inactive) return
    const cop = officers.find(o => o.file?.offender === p && canSee(p, o, 22, false))
    if (cop) {
      p.hostile = null
      p.aimPoint = null
      p.fear = { ...point(cop), until: clock + 4 }
    }
    if (p.fear?.until > clock) {
      p.goal = away(p, p.fear)
      p.speedAI = 4.35
      return
    }
    p.fear = null
    if (clock >= p.nextAction && !p.hostile) {
      p.nextAction = clock + 28 + random() * 40
      const options = basePeople.filter(n => !n.inactive && canSee(p, n, 19, false))
      if (!sim.vehicle && canSee(p, player, 13, false) &&
          (!options.length || random() < .29)) options.unshift(player)
      p.hostile = options[0] || null
      p.armed = p.slot === 3 && random() < .42
      p.fightUntil = clock + 8 + random() * 3
    }
    const target = p.hostile
    if (target && !target.inactive && clock < p.fightUntil && !(target === player && sim.vehicle) &&
        canSee(p, target, 24, false)) {
      const gap = distance(p, target)
      if (p.armed && gap >= 3 && gap <= 12) {
        p.speedAI = 0
        if (!p.aimPoint) {
          p.aimPoint = point(target)
          p.fireAt = clock + 1.5
          if (target === player) hooks.notify?.(p.name + ' drew a sidearm · Move to cover')
        }
        p.yaw = Math.atan2(p.x - p.aimPoint.x, p.z - p.aimPoint.z)
        if (clock >= p.fireAt) {
          reportCrime('shot', p, p)
          if (distance(p, player) < 45) hooks.onNpcShot?.(p)
          if (distance(target, p.aimPoint) < 1.35) {
            if (target === player) hooks.damagePlayer?.(14, p)
            else damageNpc(target, 14, p)
          }
          p.armed = false
          p.aimPoint = null
          p.hostile = null
          p.fear = { ...point(target), until: clock + 5 }
        }
        return
      }
      p.aimPoint = null
      p.goal = target
      p.speedAI = gap < 1.2 ? 0 : 2.8
      if (gap <= 1.6 && clock >= p.nextStrike) {
        p.nextStrike = clock + 2.1
        if (target === player) {
          reportCrime('assault', p, p)
          hooks.damagePlayer?.(6 + p.slot, p)
        } else damageNpc(target, 8 + p.slot, p)
      }
      return
    }
    p.hostile = null
    p.aimPoint = null
    const path = blocks[p.district]
    if (distance(p, path[p.roam]) < .6) p.roam = (p.roam + 1) % path.length
    p.goal = path[p.roam]
    p.speedAI = 1.07 + p.slot * .12
  }

  function sightAndDecay() {
    for (const file of [...cases.values()]) {
      const p = file.offender
      if (p.inactive || (p.spec && (!p.active || p.driverHealth <= 0))) { retire(file); continue }
      file.seen = officers.some(o => !o.inactive && canSee(o, p, o.inVehicle ? 51 : 42))
      if (file.seen) {
        file.last = point(p)
        file.lastSeen = clock
        file.decayAt = clock + 18
      } else if (clock >= file.decayAt) {
        file.stars--
        file.decayAt = clock + 11
        if (file.stars < 1) retire(file)
      }
    }
  }
  function assign() {
    const files = [...cases.values()].sort((a, b) =>
      Number(b.offender === player) - Number(a.offender === player) || b.stars - a.stars)
    const assigned = new Set()
    for (const file of files) {
      const available = officers.filter(p => !assigned.has(p) && !recoveries.has(p))
      const score = p => distance(p, file.last) + (p.inactive ? 36 : 0) - (p.file === file ? 65 : 0)
      available.sort((a, b) => score(a) - score(b))
      for (const p of available.slice(0, file.stars)) {
        if (p.inactive) {
          const ride = sim.dispatchPatrol(p.slot, file.last)
          if (ride) { p.ride = ride; p.inVehicle = true; Object.assign(p, point(ride), { y: ride.y }) }
          else {
            const spot = standNear(world, sim, p, precincts[p.slot])
            if (!spot) continue
            Object.assign(p, spot)
          }
          p.inactive = false
        }
        p.file = file
        assigned.add(p)
      }
    }
    for (const p of officers) {
      if (assigned.has(p)) continue
      p.file = null
      if (p.inVehicle) stopRiding(p)
      if (p.slot && !p.inactive && distance(p, player) > 80) {
        p.inactive = true
        p.model.group.visible = false
        Object.assign(p, precincts[p.slot], { y: world.height(precincts[p.slot].x, precincts[p.slot].z) })
      }
    }
  }
  function steerOnFoot(p, destination, direct) {
    p.goal = destination
    if (direct || distance(p, destination) < 16) return
    if (!p.roadPath || p.repath < clock || distance(p.roadEnd, destination) > 8) {
      p.roadEnd = point(destination)
      p.roadPath = navigation.route(p, destination).slice(1)
      p.repath = clock + 5
    }
    while (p.roadPath.length && distance(p, p.roadPath[0]) < 2.4) p.roadPath.shift()
    p.goal = p.roadPath[0] || destination
  }
  function officerPlan(p) {
    if (p.inactive) return
    const file = p.file, home = precincts[p.slot]
    if (!file) {
      if (p.inVehicle && !stopRiding(p)) return
      const dest = { x: home.x, z: home.z + p.patrolEnd * 4 }
      if (distance(p, dest) < .5) p.patrolEnd *= -1
      p.speedAI = 1.05
      steerOnFoot(p, dest, false)
      return
    }
    const last = file.last, target = file.offender
    const sight = canSee(p, target, p.inVehicle ? 51 : 42)
    const gap = distance(p, last)
    const targetDriving = target === player ? sim.vehicle : target.spec && target
    const movingCar = sight && targetDriving && Math.abs(targetDriving.speed) > 2
    // Every coordinate used for dispatch and search comes from a report or
    // a sighting. An unseen occupant's current speed cannot affect the chase.
    if (p.inVehicle) {
      const car = p.ride
      if (car.taken || car === sim.vehicle || !car.driverActive) { stopRiding(p); return }
      car.pursuitTarget = point(last)
      if (gap > (sight ? 15 : 10) || movingCar) return
      if (!stopRiding(p)) return
    } else if (gap > 21 || movingCar) {
      const car = sim.patrolCars[p.slot]
      if (car && car.active && !car.taken && car !== sim.vehicle && distance(p, car) < gap * .72) {
        if (distance(p, car) <= 3.9) {
          const ride = sim.dispatchPatrol(p.slot, last, p)
          if (ride) { p.ride = ride; p.inVehicle = true; return }
        } else {
          p.goal = car
          p.speedAI = 3.75
          return
        }
      }
    }
    if (!sight && gap < 8) {
      const sweep = Math.floor((clock - file.lastSeen) / 3.2) * 1.9 + p.slot * 2.1
      p.goal = { x: last.x + Math.sin(sweep) * 5, z: last.z + Math.cos(sweep) * 5 }
      p.speedAI = 1.8
    } else {
      steerOnFoot(p, last, sight)
      p.speedAI = gap > 1.35 ? 3.85 + .09 * p.slot : 0
    }
    if (sight && gap < 3.5 && !movingCar && target !== player &&
        distance(p, target) < (target.spec ? target.hullRadius + 1 : 1.75)) {
      retire(file)
      if (target.spec) target.policeStop = 8
      else if (target.role === 'reckless-pedestrian') resetStreet(target, true)
    }
  }
  function synchronize(p) {
    if (p.inVehicle && p.ride) Object.assign(p, point(p.ride), { y: p.ride.y, yaw: p.ride.yaw })
  }
  function update(dt) {
    if (!enabled || !Number.isFinite(dt) || dt <= 0) return
    clock += dt
    for (const p of officers) synchronize(p)
    if (clock >= nextThink) {
      nextThink = clock + .28
      for (const [p, at] of recoveries) if (clock >= at && restoreActor(p)) recoveries.delete(p)
      sightAndDecay()
      assign()
      for (const p of officers) {
        officerPlan(p)
        if (p.file && !p.inactive && !p.inVehicle)
          for (const n of basePeople) if (!n.inactive && !n.fear && canSee(n, p, 6, false)) {
            n.returnTo ||= point(n)
            fleeFrom(n, p, 2)
          }
      }
      for (const p of reckless) streetPlan(p)
      for (const p of basePeople) civilianPlan(p)
    }
    for (const p of sim.npcs) {
      if (!p.managedAI) continue
      if (p.inactive || p.inVehicle) { p.model.group.visible = false; continue }
      p.aiStep = (p.aiStep || 0) + dt
      const d = distance(p, player)
      if (p.aiStep < (d < 34 ? .028 : d < 82 ? .095 : .44)) continue
      const speed = walk(world, sim, p, p.goal, p.speedAI, p.aiStep)
      presentPedestrian(p, player, p.aiStep, speed)
      p.aiStep = 0
    }
    const file = cases.get(player)
    if (!file || player.health <= 0) { arrest = 0; return }
    const reach = sim.vehicle ? Math.min(4, sim.vehicle.hullRadius + .85) : 1.8
    const touching = (!sim.vehicle || Math.abs(sim.vehicle.speed) < 1.4) &&
      officers.some(p => p.file === file && !p.inVehicle && !p.inactive &&
        distance(p, player) <= reach && Math.abs(p.y - player.y) < 1.8 && canSee(p, player, reach, false))
    arrest = Math.max(0, Math.min(1, arrest + dt * (touching ? .55 : -1.1)))
    if (arrest >= 1) { clearWanted(); hooks.onArrest?.() }
  }
  function serialize() {
    if (!enabled) return null
    const id = p => p === player ? 'player' : p.role === 'reckless-pedestrian' ? 'street-' + p.slot : p.id
    return {
      cases: [...cases.values()].map(f => ({ id: id(f.offender), stars: f.stars, last: point(f.last),
        unseen: clock - f.lastSeen, decay: Math.max(0, f.decayAt - clock) })),
      street: reckless.map(p => ({ ...point(p), health: p.health, district: p.district, roam: p.roam })),
      civilians: basePeople.map(p => Math.round(p.health)),
      officers: officers.map(p => ({ ...point(p), health: p.health, active: !p.inactive,
        riding: !!p.inVehicle, suspect: p.file ? id(p.file.offender) : null })),
    }
  }
  function restore(data) {
    if (!enabled) return
    for (const f of [...cases.values()]) retire(f)
    recoveries.clear()
    clock = nextThink = nextTrafficAlert = arrest = 0
    for (const p of sim.npcs) p.aiStep = 0
    for (const p of basePeople) restoreActor(p)
    for (const p of reckless) resetStreet(p)
    for (const p of officers) resetOfficer(p)
    for (const [i, s] of (Array.isArray(data?.street) ? data.street : []).slice(0, 4).entries()) {
      const p = reckless[i]
      if (!validPoint(s) || !Number.isInteger(s.district) || !Number.isInteger(s.roam) ||
          !blocks[s.district]?.[s.roam]) continue
      const spot = standNear(world, sim, p, s)
      if (spot) Object.assign(p, spot, { health: Math.min(p.maxHealth, Math.max(1, Number(s.health) || p.maxHealth)),
        district: s.district, roam: s.roam })
    }
    for (const [i, hp] of (Array.isArray(data?.civilians) ? data.civilians : []).slice(0, basePeople.length).entries()) {
      const p = basePeople[i]
      if (!Number.isFinite(hp)) continue
      p.health = Math.min(p.maxHealth, Math.max(0, hp))
      if (p.health === 0) {
        p.inactive = p.managedAI = true
        p.interactive = p.model.group.visible = false
        recoveries.set(p, clock + 12)
      }
    }
    for (const [i, s] of (Array.isArray(data?.officers) ? data.officers : []).slice(0, 5).entries()) {
      if (!validPoint(s)) continue
      const p = officers[i], spot = standNear(world, sim, p, s)
      if (spot) Object.assign(p, spot)
      p.health = Math.min(p.maxHealth, Math.max(0, Number(s.health) || 0))
      p.inactive = !s.active || p.health <= 0
      if (p.health <= 0) recoveries.set(p, clock + 20)
    }
    for (const f of (Array.isArray(data?.cases) ? data.cases : []).slice(0, 6)) {
      if (!f || !validPoint(f.last) || !Number.isInteger(f.stars) || f.stars < 1 || f.stars > 5) continue
      const offender = f.id === 'player' ? player :
        (reckless.find(p => 'street-' + p.slot === f.id) || sim.traffic.find(c => c.id === f.id && c.reckless))
      if (!offender) continue
      cases.set(offender, { offender, stars: f.stars, last: point(f.last), seen: false,
        lastSeen: clock - Math.max(0, Math.min(90, Number(f.unseen) || 0)), cooldowns: new Map(),
        decayAt: clock + Math.max(0, Math.min(18, Number(f.decay) || 0)) })
      if (offender.spec) offender.policePursued = true
    }
    // Restore each crew only after the simulation has restored the cruiser
    // and the reported suspect. Stolen cruisers stay in the player's fleet.
    const savedOfficers = Array.isArray(data?.officers) ? data.officers : []
    for (const [i, s] of savedOfficers.slice(0, 5).entries()) {
      const p = officers[i], car = sim.patrolCars[i]
      if (!s || p.inactive || !s.suspect) continue
      const target = s.suspect === 'player' ? player :
        (reckless.find(n => 'street-' + n.slot === s.suspect) || sim.traffic.find(c => c.id === s.suspect))
      p.file = cases.get(target) || null
      if (!p.file || !s.riding || !car?.active || car.taken || distance(s, car) > 4) continue
      const ride = sim.dispatchPatrol(i, p.file.last, s)
      if (ride) {
        p.ride = ride
        p.inVehicle = true
        synchronize(p)
      }
    }
    nextThink = clock
    arrest = 0
  }
  return {
    setEnabled, update, reportCrime, damageNpc, alertDanger, clearWanted, targets, serialize, restore,
    get wanted() { return cases.get(player)?.stars || 0 },
    get status() {
      const f = cases.get(player)
      return !f ? 'Clear' : arrest > 0 ? 'Arresting' : f.seen || clock - f.lastSeen < .75 ? 'Pursuit' : 'Searching'
    },
    get arrestProgress() { return arrest },
  }
}
