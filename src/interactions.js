import * as THREE from 'three'
import { createCountyActivities } from './county-activities.js'
import { createDealership } from './dealership.js'
const items = [
  {
    id: 'water',
    name: 'Spring water',
    price: 8,
    description: 'Restores 15 health and 55 stamina.',
    usable: true,
  },
  { id: 'kit', name: 'First-aid kit', price: 32, description: 'Restores 45 health.', usable: true },
  {
    id: 'fuel',
    name: 'Fuel can',
    price: 24,
    description: 'Adds 30% fuel to your current or nearby vehicle.',
    usable: true,
  },
  {
    id: 'shell',
    name: 'Ochre field jacket',
    price: 85,
    description: 'A weatherproof jacket. Equip it from your pack.',
    permanent: true,
    usable: true,
  },
  {
    id: 'tune',
    name: 'Touring tune',
    price: 160,
    description: 'Improves acceleration for your county fleet.',
    permanent: true,
  },
  {
    id: 'garage',
    name: 'County garage pass',
    price: 120,
    description: 'Use garage service to repair your current or nearby vehicle.',
    permanent: true,
  },
  {
    id: 'ownership',
    name: 'Personal sport coupe',
    price: 380,
    description: 'Bring the sport coupe home and register it to your garage.',
    permanent: true,
  },
]
const parcel = {
    id: 'parcel',
    name: 'Sealed parcel',
    description: 'Delivery for the Parcel Exchange.',
  },
  catalog = [...items, parcel]
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export function createInteractions(scene, world, sim, story, hooks) {
  const activities = createCountyActivities(scene, world, sim, story, hooks)
  const dealer = createDealership(world, sim, story, activities, hooks)
  const dropped = [],
    changes = new Map(),
    used = new Set()
  const crateGeometry = new THREE.BoxGeometry(0.46, 0.38, 0.36),
    crateMaterial = new THREE.MeshStandardMaterial({ color: 0xa2744e, roughness: 0.89 })
  const tapeGeometry = new THREE.BoxGeometry(0.085, 0.384, 0.366),
    tapeMaterial = new THREE.MeshStandardMaterial({ color: 0xc1af85 })
  let seated = false,
    worn = null,
    benchIndex = -1
  const state = () => story.state
  function nearbyVehicle(r = 9) {
    return (
      sim.vehicle ||
      sim.cars
        .filter((c) => distance(sim.player, c) < r)
        .sort((a, b) => distance(a, sim.player) - distance(b, sim.player))[0]
    )
  }
  function buy(id) {
    const item = items.find((i) => i.id === id),
      s = state()
    if (!item) return
    if (s.owned.includes(id)) return hooks.notify('Already owned')
    if (s.money < item.price) return hooks.notify('Insufficient funds')
    s.money -= item.price
    if (item.permanent) s.owned.push(id)
    if (!item.permanent || item.usable) s.bag[id] = (s.bag[id] || 0) + 1
    if (id === 'tune') sim.cars.forEach((c) => (c.upgraded = true))
    if (id === 'ownership') {
      const c = sim.cars.find((v) => v.type === 'sports' || v.type === 'sport')
      if (c) {
        c.x = -11
        c.z = 66
        c.y = world.height(c.x, c.z)
        c.speed = 0
      }
    }
    hooks.notify(item.name + ' purchased')
    hooks.changed()
  }
  function inventory() {
    const bag = Object.entries(state().bag)
      .filter(([, n]) => n > 0)
      .map(([id, quantity]) => ({
        ...catalog.find((i) => i.id === id),
        id,
        quantity,
        droppable: !['parcel', 'shell'].includes(id),
      }))
    if (activities.cargo)
      bag.push({
        id: 'consignment',
        name: activities.cargo,
        quantity: 1,
        description: 'Signed consignment · Destination marked on the map.',
      })
    return bag
  }
  function shop() {
    return items.map((i) => ({ ...i, owned: state().owned.includes(i.id) }))
  }
  function use(id) {
    const s = state()
    if (!s.bag[id]) return
    if (id === 'shell') {
      worn = worn === 'shell' ? null : 'shell'
      sim.setAppearance?.(worn || 'default')
      hooks.notify(worn ? 'Field jacket equipped' : 'Original jacket equipped')
      hooks.changed()
      return
    }
    if (id === 'fuel') {
      const c = nearbyVehicle()
      if (!c) return hooks.notify('Stand beside a vehicle to refuel it.')
      if (c.fuel >= 99.5) return hooks.notify('Tank already full')
      c.fuel = Math.min(100, c.fuel + 30)
    } else if (id === 'water' || id === 'kit') {
      if (sim.player.health >= 99.5 && (id === 'kit' || (sim.player.stamina ?? 100) >= 99.5))
        return hooks.notify('Already fully recovered')
      sim.player.health = Math.min(100, sim.player.health + (id === 'water' ? 15 : 45))
      if (id === 'water') hooks.drink()
    } else return
    s.bag[id]--
    hooks.notify('Used ' + catalog.find((i) => i.id === id).name)
    hooks.changed()
  }
  function place(id, x, z) {
    const m = new THREE.Mesh(crateGeometry, crateMaterial),
      t = new THREE.Mesh(tapeGeometry, tapeMaterial)
    m.add(t)
    m.position.set(x, world.height(x, z) + 0.2, z)
    m.castShadow = true
    scene.add(m)
    dropped.push({ id, x, z, m })
  }
  function drop(id) {
    const s = state(),
      p = sim.player
    if (!s.bag[id] || id === 'parcel' || id === 'shell') return
    s.bag[id]--
    place(id, p.x - Math.sin(p.yaw) * 1.3, p.z - Math.cos(p.yaw) * 1.3)
    hooks.notify('Item placed on the ground')
    hooks.changed()
  }
  function presentDialog(kind, detail = false, npc = 'Local resident') {
    let dialog
    if (kind === 'race-steward' || kind === 'delivery-coordinator') return activities.contact(kind)
    if (kind === 'dispatcher') {
      dialog = {
        name: 'Parcel dispatcher',
        text: detail
          ? 'Collect the parcel here, drive it across the district, then hand it over at the marked address. The run pays $220.'
          : 'I have a parcel for a customer across town. Can you take the run?',
        choices: [
          { id: 'acceptDelivery', label: 'Accept the delivery' },
          { id: 'deliveryDetails', label: 'Ask about the route' },
          { id: 'leave', label: 'Maybe later' },
        ],
      }
    } else {
      const s = state()
      dialog = {
        name: npc,
        text: s.sideJob
          ? 'The shop by the Parcel Exchange has spring water. Bring me a bottle and I’ll pay $25.'
          : detail
            ? 'Buy a bottle of spring water for $8 at the shop. Bring it to a county resident for $25.'
            : 'Long day out here. Could you bring back a bottle of spring water?',
        choices: s.sideJob
          ? [
              { id: 'finishErrand', label: 'Hand over spring water' },
              { id: 'leave', label: 'I’ll come back' },
            ]
          : [
              { id: 'acceptErrand', label: 'Take the errand' },
              { id: 'errandDetails', label: 'Ask for details' },
              { id: 'leave', label: 'Maybe later' },
            ],
      }
    }
    if (kind !== 'dispatcher')
      dialog.choices.splice(
        -1,
        0,
        { id: 'directions', label: 'Where can I find work or a car?' },
        { id: 'surveyHint', label: 'Tell me about the survey trail' },
      )
    hooks.openDialog(dialog)
  }
  function choice(id) {
    if (id === 'lunch') {
      if (state().money < 9) return hooks.notify('Lunch costs $9')
      if (sim.player.health >= 99.5 && (sim.player.stamina ?? 100) >= 99.5)
        return hooks.notify('Already fully recovered')
      state().money -= 9
      sim.player.health = Math.min(100, sim.player.health + 12)
      hooks.drink()
      hooks.resume()
      hooks.changed()
      return hooks.notify('Lunch served · Health and stamina restored')
    }
    if (id === 'groceryWater' || id === 'groceryKit') {
      buy(id === 'groceryWater' ? 'water' : 'kit')
      return
    }
    if (id === 'directions')
      return hooks.openDialog({
        name: 'Around Foundry Row',
        text: 'Head west from Civic Square. The glass showroom faces the main road. The motor club and dispatch kiosk share the pavement outside.',
        choices: [
          { id: 'guide/showroom', label: 'Mark Foundry Motors' },
          { id: 'guide/club', label: 'Mark the motor club' },
          { id: 'guide/dispatch', label: 'Mark the dispatch kiosk' },
          { id: 'leave', label: 'Thanks for the directions' },
        ],
      })
    if (id === 'surveyHint')
      return hooks.openDialog({
        name: 'The county survey trail',
        text: 'Look for round brass plaques by the archive steps, on the raised harbor deck and beside the summit shelter. Press E up close for a rubbing. Your journal keeps the clues.',
        choices: [{ id: 'leave', label: 'I’ll look for them' }],
      })
    const [action, ref] = id.split('/')
    if (action === 'guide') {
      const site = activities.sites[ref]
      if (site) hooks.waypoint(site.x, site.z)
      return hooks.resume()
    }
    if (action === 'race' || action === 'delivery') return activities.begin(action, ref)
    if (id === 'deliveryDetails') return presentDialog('dispatcher', true)
    if (id === 'errandDetails') return presentDialog('resident', true)
    const s = state()
    if (id === 'acceptDelivery') story.accept()
    if (id === 'acceptErrand') {
      s.sideJob = true
      hooks.notify('Errand accepted · Bring a resident spring water.')
    }
    if (id === 'finishErrand') {
      if (!s.bag.water) return hooks.notify('You need a bottle of spring water.')
      s.bag.water--
      s.money += 25
      s.sideJob = false
      s.errands++
      hooks.notify('Errand complete · +$25')
    }
    hooks.resume()
    hooks.changed()
  }
  function service() {
    if (!state().owned.includes('garage')) return hooks.panel('shop')
    const c = nearbyVehicle(15)
    if (!c) return hooks.notify('Bring a vehicle to the garage.')
    c.condition = 100
    hooks.notify('Vehicle repaired')
    hooks.changed()
  }
  function check() {
    const p = sim.player,
      s = state(),
      mission = activities.interaction() || (!activities.state.job && story.interaction())
    if (mission) return mission
    if (seated) return { label: 'Stand up', run: stand }
    if (sim.vehicle) {
      if (
        distance(p, world.locations.fuel) < 8 &&
        Math.abs(sim.vehicle.speed) < 1 &&
        sim.vehicle.fuel < 99.5
      )
        return {
          label: 'Refill tank · $12',
          run: () => {
            if (s.money < 12) {
              hooks.notify('Refill costs $12')
              return
            }
            sim.vehicle.fuel = 100
            s.money -= 12
            hooks.changed()
            hooks.notify('Tank refilled')
          },
        }
      return { label: 'Exit ' + sim.vehicle.name, run: drive }
    }
    const options = []
    function add(obj, r, label, run, offset = 0) {
      if (!obj) return
      const d = distance(p, obj)
      if (d <= r) options.push({ label, run, priority: d + offset })
    }
    for (const a of dropped)
      add(a, 2.8, 'Pick up ' + (catalog.find((i) => i.id === a.id)?.name || 'item'), () => {
        s.bag[a.id] = (s.bag[a.id] || 0) + 1
        scene.remove(a.m)
        dropped.splice(dropped.indexOf(a), 1)
        hooks.changed()
        hooks.notify('Item added to your pack')
      })
    const car = sim.nearestCar()
    if (car) add(car, 6, 'Enter ' + car.name, drive, -1.6)
    for (const npc of sim.npcs || [])
      if (npc.interactive !== false && npc.model?.group.visible !== false)
        add(
          npc,
          3.1,
          'Talk to ' + (npc.name || 'resident'),
          () => presentDialog(npc.role || 'resident', false, npc.name),
          0.3,
        )
    const sites = activities.sites
    add(sites.showroom, 2.85, 'Browse Foundry Motors', () => hooks.panel('dealership'), -0.4)
    add(
      sites.club,
      2.3,
      'Speak with the race steward',
      () => activities.contact('race-steward'),
      0.55,
    )
    add(
      sites.dispatch,
      2.6,
      'Browse courier contracts',
      () => activities.contact('delivery-coordinator'),
      0.55,
    )
    add(world.locations.grocer, 2.2, 'Shop at Cedar Grocery', () =>
      hooks.openDialog({
        name: 'Cedar Grocery',
        text: 'Stock up before heading into the hills.',
        choices: [
          { id: 'groceryWater', label: 'Spring water · $8' },
          { id: 'groceryKit', label: 'First-aid kit · $32' },
          { id: 'leave', label: 'Leave the counter' },
        ],
      }),
    )
    add(world.locations.cafe, 2.3, 'Order at Juniper Kitchen', () =>
      hooks.openDialog({
        name: 'Juniper Kitchen',
        text: 'Today’s lunch is vegetable soup and sourdough. Restores 12 health and 55 stamina.',
        choices: [
          { id: 'lunch', label: 'Order lunch · $9' },
          { id: 'leave', label: 'Maybe later' },
        ],
      }),
    )
    add(world.locations.shop, 4.6, 'Browse the county shop', () => hooks.panel('shop'), 0.2)
    add(world.locations.garage, 4, 'Use garage services', service, 1.4)
    world.interactables.forEach((a, i) => {
      if (used.has(i) || a.missionOnly) return
      const power = () => {
        const before = a.label
        const result = a.activate?.(p)
        if (a.type === 'pickup') {
          s.bag.kit = (s.bag.kit || 0) + 1
          used.add(i)
          hooks.notify('First-aid kit added to your pack')
        } else if (a.type === 'bench') {
          sit(i)
          hooks.notify('Seated · E to stand')
        } else if (a.type === 'vending' || a.type === 'shop') return hooks.panel('shop')
        else if (a.type === 'fuel') {
          const c = nearbyVehicle(12)
          if (!c) return hooks.notify('Bring a vehicle to the pump.')
          if (s.money < 12) return hooks.notify('Refill costs $12')
          if (c.fuel >= 99.5) return hooks.notify('Tank already full')
          s.money -= 12
          c.fuel = 100
          hooks.notify('Tank refilled')
        } else if (a.type === 'elevator') {
          if (result !== 'Lift in motion') changes.set(i, !changes.get(i))
          hooks.notify(typeof result === 'string' ? result : 'Lift operated')
        } else {
          changes.set(i, typeof a.isOpen === 'boolean' ? a.isOpen : !changes.get(i))
          hooks.notify(typeof result === 'string' ? result : a.feedback || before || 'Done')
          hooks.sound('door')
        }
        hooks.changed()
      }
      add(
        a,
        a.radius || 2.7,
        typeof a.label === 'function' ? a.label() : a.label || 'Interact',
        power,
      )
    })
    return options.sort((a, b) => a.priority - b.priority)[0] || null
  }
  function drive() {
    const result = sim.enterExit()
    if (result?.ok) {
      hooks.sound('door')
      hooks.notify(
        result.entered
          ? 'WASD drive · Space handbrake · C camera'
          : 'Exited ' + (result.car?.name || 'vehicle'),
      )
    } else if (result?.message) hooks.notify(result.message)
  }
  function sit(i) {
    const a = world.interactables[i]
    benchIndex = i
    seated = true
    Object.assign(sim.player, {
      x: a.seatX ?? a.x,
      z: a.seatZ ?? a.z,
      yaw: a.yaw ?? sim.player.yaw,
    })
    sim.setSeated?.(true)
  }
  function stand(reposition = true) {
    const a = world.interactables[benchIndex]
    if (seated && a && reposition)
      Object.assign(sim.player, { x: a.x, z: a.z, y: world.height(a.x, a.z) })
    seated = false
    benchIndex = -1
    sim.setSeated?.(false)
  }
  function serialize() {
    const toggled = world.interactables.flatMap((a, i) =>
      (typeof a.isOpen === 'boolean' ? a.isOpen : changes.get(i)) ? [i] : [],
    )
    const key = (i) => placeKey(world.interactables[i])
    return {
      dropped: dropped.map(({ id, x, z }) => ({ id, x, z })),
      changes: toggled,
      used: [...used],
      worn,
      benchIndex,
      places: {
        open: toggled.map(key),
        doorFractions: Object.fromEntries(
          world.interactables.flatMap((a, i) => (a.restoreDoor ? [[key(i), a.fraction]] : [])),
        ),
        collected: [...used].map(key),
        seat: seated && benchIndex >= 0 ? key(benchIndex) : null,
      },
      activities: activities.state,
      dealership: dealer.state,
    }
  }
  function placeKey(obj) {
    return obj.type + '/' + obj.x.toFixed(2) + '/' + obj.z.toFixed(2)
  }
  function restore(data = {}) {
    stand(false)
    for (const a of dropped) scene.remove(a.m)
    dropped.length = 0
    const byKey = new Map(world.interactables.map((obj, i) => [placeKey(obj), i]))
    const legacy = world.interactables.flatMap((obj, i) => (obj.newDistrict ? [] : [i]))
    const legacyIndex = (i) => (data.activities ? i : legacy[i])
    const indices = (stable, previous) =>
      (Array.isArray(stable)
        ? stable.map((key) => byKey.get(key))
        : (previous || []).map(legacyIndex)
      ).filter((i) => Number.isInteger(i) && i >= 0 && i < world.interactables.length)
    const toggled = new Set(indices(data.places?.open, data.changes))
    const collected = new Set(indices(data.places?.collected, data.used))
    const seat = data.places ? byKey.get(data.places.seat) : legacyIndex(data.benchIndex)
    world.interactables.forEach((a, i) => {
      if (a.restoreDoor) a.restoreDoor(toggled.has(i), data.places?.doorFractions?.[placeKey(a)])
      else if (a.setOpen) a.setOpen(toggled.has(i))
      else if (!!changes.get(i) !== toggled.has(i)) a.activate?.()
    })
    changes.clear()
    for (const i of toggled) changes.set(i, true)
    for (const i of used) if (!collected.has(i)) world.interactables[i]?.reset?.()
    used.clear()
    for (const i of collected) {
      used.add(i)
      world.interactables[i]?.hide?.()
    }
    for (const a of data.dropped || [])
      if (Number.isFinite(a.x) && Number.isFinite(a.z) && items.some((i) => i.id === a.id))
        place(a.id, a.x, a.z)
    worn = data.worn
    sim.setAppearance?.(worn || 'default')
    if (world.interactables[seat]?.type === 'bench') sit(seat)
    activities.restore(data.activities)
    dealer.restore(data.dealership)
  }
  return {
    activities,
    dealer,
    buy,
    use,
    drop,
    inventory,
    shop,
    presentDialog,
    choice,
    check,
    drive,
    stand,
    serialize,
    restore,
    get worn() {
      return worn
    },
  }
}
