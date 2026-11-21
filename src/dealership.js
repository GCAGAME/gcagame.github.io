const models = {
  sedan: { kind: 'Sedan', price: 0 },
  suv: { kind: 'Touring SUV', price: 210 },
  pickup: { kind: 'Utility pickup', price: 265 },
  offroad: { kind: 'Trail 4×4', price: 300, unlock: 'Record one survey rubbing' },
  sports: { kind: 'Sport coupe', price: 380, unlock: 'Finish a motor club race' },
}
export const finishes = [
  { id: 'factory', label: 'Factory finish', hex: null },
  { id: 'marine', label: 'Marine blue', hex: '#356c87' },
  { id: 'sage', label: 'Juniper green', hex: '#66785a' },
  { id: 'ember', label: 'Oxide red', hex: '#a54033' },
  { id: 'pearl', label: 'Warm ivory', hex: '#d6ccad' },
]
const bays = [-78, -82].map((x) => ({ x, z: -72.2, yaw: 0 }))
const factory = () => ({ paint: 'factory', wheels: 'factory', tune: false })
const fresh = () => ({ owned: ['sedan'], selected: 'sedan', trim: {} })
export function createDealership(world, sim, story, activities, hooks) {
  let state = fresh(),
    browsing = 'sedan'
  const car = (id) => sim.cars.find((c) => c.id === id)
  const owned = (id) =>
    state.owned.includes(id) || (id === 'sports' && story.state.owned.includes('ownership'))
  const unlocked = (id) =>
    id === 'offroad'
      ? activities.state.stamps.length > 0
      : id === 'sports'
        ? activities.state.races > 0
        : true
  const trim = (id) => state.trim[id] ?? factory()
  function apply(id) {
    const c = car(id),
      t = trim(id)
    c.model.customize?.({ paint: finishes.find((f) => f.id === t.paint).hex, wheels: t.wheels })
    c.upgraded = t.tune || story.state.owned.includes('tune')
  }
  function charge(amount) {
    if (story.state.money < amount) {
      hooks.notify('Insufficient funds')
      return false
    }
    story.state.money -= amount
    return true
  }
  function view() {
    const c = car(browsing),
      t = trim(browsing),
      m = models[browsing]
    return {
      id: browsing,
      name: c.name,
      kind: m.kind,
      price: m.price,
      selected: state.selected === browsing,
      models: Object.keys(models).map((id) => ({ id, name: car(id).name, owned: owned(id) })),
      owned: owned(browsing),
      lock: unlocked(browsing) || owned(browsing) ? null : m.unlock,
      mass: c.spec.mass,
      speed: Math.round(c.spec.max * 3.6),
      paint: t.paint,
      wheels: t.wheels,
      tuned: t.tune || story.state.owned.includes('tune'),
      preview: hooks.preview(c, t.paint, t.wheels),
    }
  }
  function act(command, value) {
    const site = activities.sites.showroom
    if (sim.vehicle || Math.hypot(sim.player.x - site.x, sim.player.z - site.z) > 3.05) return
    if (command === 'browse') {
      if (Object.hasOwn(models, value)) browsing = value
      hooks.changed()
      return
    }
    const id = browsing,
      c = car(id)
    if (command === 'buy') {
      if (owned(id) || !unlocked(id) || !charge(models[id].price)) return
      state.owned.push(id)
      if (id === 'sports' && !story.state.owned.includes('ownership'))
        story.state.owned.push('ownership')
      hooks.notify(c.name + ' registered · Ready for collection')
    } else {
      if (!owned(id)) return
      const t = trim(id)
      if (command === 'collect') {
        // Prefer the car's current bay so repeatedly selecting it does not consume another space.
        const ordered = bays
          .slice()
          .sort((a, b) => Math.hypot(c.x - a.x, c.z - a.z) - Math.hypot(c.x - b.x, c.z - b.z))
        const bay = ordered.find((position) => sim.parkCar(c, position))
        if (!bay)
          return hooks.notify('Both collection bays are occupied. Move a vehicle and try again.')
        state.selected = id
        hooks.waypoint(bay.x, bay.z)
        hooks.notify(c.name + ' is waiting in the marked bay.')
      } else if (command === 'paint') {
        const f = finishes.find((p) => p.id === value)
        if (!f || value === t.paint || !charge(value === 'factory' ? 0 : 20)) return
        t.paint = value
        hooks.notify(c.name + ' · ' + f.label)
      } else if (command === 'wheels') {
        if (
          !['factory', 'graphite'].includes(value) ||
          value === t.wheels ||
          !charge(value === 'factory' ? 0 : 30)
        )
          return
        t.wheels = value
        hooks.notify(value === 'factory' ? 'Factory rims fitted' : 'Graphite rims fitted')
      } else if (command === 'tune') {
        if (t.tune || story.state.owned.includes('tune') || !charge(65)) return
        t.tune = true
        hooks.notify('Touring tune fitted · Acceleration upgraded')
      } else return
      state.trim[id] = t
      apply(id)
    }
    hooks.sound('ui')
    hooks.changed()
  }
  function restore(data = {}) {
    state = fresh()
    if (Array.isArray(data.owned))
      state.owned = [...new Set(['sedan', ...data.owned.filter((id) => Object.hasOwn(models, id))])]
    if (story.state.owned.includes('ownership') && !state.owned.includes('sports'))
      state.owned.push('sports')
    if (Object.hasOwn(models, data.selected) && owned(data.selected)) state.selected = data.selected
    browsing = state.selected
    for (const id of Object.keys(models)) {
      const t = data.trim?.[id]
      if (t && owned(id))
        state.trim[id] = {
          paint: finishes.some((f) => f.id === t.paint) ? t.paint : 'factory',
          wheels: t.wheels === 'graphite' ? 'graphite' : 'factory',
          tune: t.tune === true,
        }
      apply(id)
    }
  }
  return {
    view,
    act,
    restore,
    get state() {
      return state
    },
  }
}
