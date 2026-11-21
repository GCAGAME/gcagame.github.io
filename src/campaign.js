const chapters = [
  {
    title: 'Welcome to the City',
    reward: 150,
    steps: [
      'Look around your new neighborhood.',
      'Walk to the sedan in your driveway.',
      'Enter your sedan.',
      'Drive to the marked downtown parking bay.',
      'Stop inside the marked bay.',
    ],
  },
  {
    title: 'Delivery Driver',
    reward: 220,
    steps: [
      'Meet the dispatcher at the depot on foot.',
      'Collect the parcel from the depot counter.',
      'Take the parcel to the delivery address.',
      'Step out and hand over the parcel.',
    ],
  },
  {
    title: 'Mountain Exploration',
    reward: 300,
    steps: [
      'Find and enter the trailhead off-roader.',
      'Drive to the trail junction.',
      'Follow the switchbacks to the upper trail.',
      'Stop at the summit overlook.',
    ],
  },
  {
    title: 'City Discovery',
    reward: 180,
    steps: [
      'Visit the first landmark and record it on foot.',
      'Visit the second landmark and record it on foot.',
      'Return to the downtown depot and sign the register.',
    ],
  },
  {
    title: 'Night Drive',
    reward: 400,
    steps: [
      'Start the evening road test at the downtown bay in a vehicle.',
      'Drive to the marked junction. Observe the speed limit and signals.',
      'Continue to the residential checkpoint.',
      'Return to the downtown bay and park before time runs out.',
    ],
  },
]
const fresh = () => ({
  chapter: 0,
  step: 0,
  completed: [],
  money: 80,
  bag: {},
  owned: [],
  remaining: 0,
  look: 0,
  discoveries: [],
  sideJob: false,
  errands: 0,
})
const near = (a, b, r) => a && b && Math.hypot(a.x - b.x, a.z - b.z) <= r
const inBay = (p, center) =>
  Math.abs(p.x - center.x) <= 2.85 && p.z >= center.z - 3.8 && p.z <= center.z + 4.3
export function createCampaign(world, sim, hooks) {
  let state = fresh(),
    parkTime = 0,
    speedPenalty = 0,
    violations = 0
  const L = world.locations
  const point = (x, z, name) => ({ x, z, name })
  const vehicleTarget = (type) => {
    const c = sim.cars.find((v) => v.type === type)
    return c ? point(c.x, c.z, c.name) : null
  }
  function target() {
    const i = state.step
    switch (state.chapter) {
      case 0:
        return i < 3 ? vehicleTarget('sedan') : L.downtown
      case 1:
        return i < 2 ? L.depot : L.delivery
      case 2:
        return [
          vehicleTarget('offroad'),
          point(20, -254, 'Trail junction'),
          point(92, -325, 'Upper switchbacks'),
          L.summit,
        ][i]
      case 3:
        return [L.landmark1, L.landmark2, L.depot][i]
      case 4:
        return [
          L.downtown,
          point(2, -130, 'Civic junction'),
          point(-2, 58, 'Residential checkpoint'),
          L.downtown,
        ][i]
      default:
        return null
    }
  }
  function advance() {
    if (state.chapter >= chapters.length) return
    const current = chapters[state.chapter]
    parkTime = 0
    if (++state.step >= current.steps.length) {
      state.money += current.reward
      state.completed.push(state.chapter)
      if (state.chapter === 2) state.discoveries.push('Summit overlook')
      state.chapter++
      state.step = 0
      state.remaining = 0
      hooks.celebrate(current, state.chapter === chapters.length)
    } else hooks.chime()
    hooks.changed()
  }
  function update(dt, look) {
    if (state.chapter >= chapters.length) return
    const s = state.step,
      p = sim.player,
      v = sim.vehicle,
      t = target()
    switch (state.chapter) {
      case 0:
        if (s === 0) {
          state.look += Math.abs(look)
          if (state.look > 24) advance()
        } else if (s === 1 && near(p, t, 4.8)) advance()
        else if (s === 2 && v?.type === 'sedan') advance()
        else if (s === 3 && v && near(p, t, 24)) advance()
        else if (s === 4 && inBay(p, t) && v && Math.abs(v.speed) < 0.8) {
          if ((parkTime += dt) > 0.45) advance()
        } else parkTime = 0
        break
      case 1:
        if (s === 2 && near(p, t, 13)) advance()
        break
      case 2:
        if (s === 0 && v?.type === 'offroad') advance()
        else if (
          s > 0 &&
          v?.type === 'offroad' &&
          near(p, t, s === 3 ? 12 : 19) &&
          (s !== 3 || Math.abs(v.speed) < 2.2)
        )
          advance()
        break
      case 4:
        if (s === 0) break
        state.remaining = Math.max(0, state.remaining - dt)
        speedPenalty -= dt
        if ((sim.trafficViolation ?? 0) !== violations) {
          violations = sim.trafficViolation ?? 0
          state.remaining = Math.max(0, state.remaining - 12)
          hooks.notify('Red signal · 12 seconds deducted')
        }
        if (v && Math.abs(v.speed) > 14 && speedPenalty <= 0) {
          state.remaining = Math.max(0, state.remaining - 8)
          speedPenalty = 5
          hooks.notify('50 km/h limit exceeded · 8 seconds deducted')
        }
        if (state.remaining <= 0) {
          state.step = 0
          hooks.notify('Time expired. Return to the downtown bay to retry.')
          hooks.changed()
          break
        }
        if (v && (s === 3 ? inBay(p, t) && Math.abs(v.speed) < 0.9 : near(p, t, 13))) advance()
        break
    }
  }
  function interaction() {
    const ch = state.chapter,
      s = state.step,
      p = sim.player,
      v = sim.vehicle,
      t = target()
    if (!near(p, t, ch === 4 ? 10 : 6)) return null
    if (ch === 1 && !v && s === 0)
      return { label: 'Talk to the dispatcher', run: () => hooks.dialog('dispatcher') }
    if (ch === 1 && !v && s === 1)
      return {
        label: 'Pick up the parcel',
        run: () => {
          state.bag.parcel = 1
          advance()
        },
      }
    if (ch === 1 && !v && s === 3)
      return {
        label: 'Hand over the parcel',
        run: () => {
          delete state.bag.parcel
          advance()
        },
      }
    if (ch === 3 && !v)
      return {
        label: s < 2 ? 'Record ' + t.name : 'Sign the field register',
        run: () => {
          if (s < 2) state.discoveries.push(t.name)
          advance()
        },
      }
    if (ch === 4 && s === 0 && v && Math.abs(v.speed) < 1.5)
      return {
        label: 'Start the night drive',
        run: () => {
          hooks.setHour(21.25)
          state.remaining = 180
          violations = sim.trafficViolation ?? 0
          speedPenalty = 0
          advance()
        },
      }
    return null
  }
  function describe() {
    const c = chapters[state.chapter]
    return c
      ? {
          ...c,
          step: state.step,
          index: state.chapter,
          objective: c.steps[state.step],
          timer: state.remaining || undefined,
        }
      : {
          title: 'Free exploration',
          objective: 'Explore Briar County, take an errand, or set a waypoint on the map.',
          steps: [],
          step: 0,
          index: 5,
          completed: true,
        }
  }
  return {
    get state() {
      return state
    },
    chapters,
    describe,
    interaction,
    target,
    update,
    accept() {
      if (state.chapter === 1 && state.step === 0) {
        advance()
        return true
      }
      return false
    },
    reset() {
      state = fresh()
      parkTime = 0
      speedPenalty = 0
    },
    restore(data) {
      if (
        !data ||
        !Number.isInteger(data.chapter) ||
        data.chapter < 0 ||
        data.chapter > chapters.length ||
        !Number.isInteger(data.step) ||
        data.step < 0 ||
        data.step >= (chapters[data.chapter]?.steps.length ?? 1) ||
        !Number.isFinite(data.money) ||
        data.money < 0 ||
        !Array.isArray(data.completed) ||
        !Array.isArray(data.owned) ||
        !Array.isArray(data.discoveries) ||
        !data.bag ||
        typeof data.bag !== 'object' ||
        Array.isArray(data.bag)
      )
        throw Error('Invalid campaign')
      state = { ...fresh(), ...data }
      parkTime = 0
      violations = sim.trafficViolation ?? 0
    },
  }
}
