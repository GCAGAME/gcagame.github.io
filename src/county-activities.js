import * as THREE from 'three'

const point = (x, z, name) => ({ x, z, name })
const survey = [
  {
    id: 'archive',
    ...point(-53, -69.8, 'Municipal Archive'),
    hint: 'Along the west end of the archive steps.',
  },
  {
    id: 'quay',
    ...point(96.4, -109.1, 'Waterfront observation deck'),
    hint: 'Ride the harbor lift and look out from the timber deck.',
  },
  {
    id: 'summit',
    ...point(125.7, -375, 'North Ridge shelter'),
    hint: 'At the west side of the shelter above the last switchback.',
  },
]
const sites = {
  showroom: point(-85, -65.5, 'Foundry Motors'),
  dispatch: point(-94, -72, 'Foundry Dispatch'),
  club: point(-89, -72, 'Foundry Motor Club'),
  start: point(-90, -77.7, 'Foundry starting line'),
}
const gate = (x, z, dx, dz, name) => ({ x, z, dx, dz, name })
const races = {
  civic: {
    title: 'Civic Square Sprint',
    limit: 105,
    reward: 95,
    gates: [
      gate(-35, -77.7, 1, 0, 'Civic Square'),
      gate(2.35, -104, 0, -1, 'North Main'),
      gate(-32, -132.25, -1, 0, 'Archive Boulevard'),
      gate(-66.2, -104, 0, 1, 'Foundry Street'),
      gate(-83, -82.3, -1, 0, 'Foundry finish'),
    ],
  },
  cedar: {
    title: 'Cedar Avenue Circuit',
    limit: 135,
    reward: 120,
    gates: [
      gate(-35, -77.7, 1, 0, 'Civic Square'),
      gate(-2.4, -37, 0, 1, 'South Main'),
      gate(-30, -2.2, -1, 0, 'Cedar Avenue'),
      gate(-61.8, -40, 0, -1, 'Foundry Street'),
      gate(-83, -82.3, -1, 0, 'Foundry finish'),
    ],
  },
}
const deliveries = {
  harbor: {
    title: 'Harbor mail run',
    cargo: 'Harbor mailbag',
    reward: 80,
    pickup: point(21, -96, 'Parcel Exchange counter'),
    drop: point(68, -172, 'Harbor Dispatch'),
  },
  archive: {
    title: 'Archive transfer',
    cargo: 'Archive prints',
    reward: 65,
    pickup: point(-94, -72, 'Foundry Dispatch kiosk'),
    drop: point(-47, -70.6, 'Municipal Archive steps'),
  },
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const initial = () => ({ job: null, best: {}, races: 0, deliveries: 0, stamps: [] })
const count = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0)
const seconds = (n) =>
  Math.floor(n / 60) +
  ':' +
  String(Math.floor(n) % 60).padStart(2, '0') +
  '.' +
  Math.floor((n % 1) * 10)
function gateArt() {
  const group = new THREE.Group()
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 16; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#f2e9cf' : '#243633'
      ctx.fillRect(col * 16, row * 16, 16, 16)
    }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const checker = new THREE.MeshStandardMaterial({ map, roughness: 0.89, side: THREE.DoubleSide })
  const metal = new THREE.MeshStandardMaterial({
    color: 0x736e61,
    metalness: 0.48,
    roughness: 0.59,
  })
  const marker = new THREE.MeshStandardMaterial({ color: 0xdf783b, roughness: 0.68 })
  const pole = new THREE.CylinderGeometry(0.043, 0.052, 3.25, 8)
  const sleeve = new THREE.CylinderGeometry(0.06, 0.065, 0.68, 8)
  for (const x of [-4.45, 4.45]) {
    const post = new THREE.Mesh(pole, metal),
      stripe = new THREE.Mesh(sleeve, marker)
    post.position.set(x, 1.65, 0)
    stripe.position.set(x, 1.12, 0)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.69, 0.37), checker)
    flag.position.set(x - Math.sign(x) * 0.35, 3.1, 0)
    group.add(post, stripe, flag)
  }
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 0.65), checker)
  finish.rotation.x = -Math.PI / 2
  finish.position.y = 0.105
  group.add(finish)
  group.visible = false
  return { group, finish }
}
function surveyArt(scene, world) {
  const gold = new THREE.MeshStandardMaterial({ color: 0xb89d66, metalness: 0.56, roughness: 0.49 })
  const postMat = new THREE.MeshStandardMaterial({ color: 0x64533d, roughness: 0.91 })
  const postGeo = new THREE.BoxGeometry(0.095, 0.72, 0.095)
  const rimGeo = new THREE.CylinderGeometry(0.227, 0.212, 0.034, 24)
  const faceGeo = new THREE.CircleGeometry(0.202, 24)
  return survey.map((site, i) => {
    const board = new THREE.Group(),
      post = new THREE.Mesh(postGeo, postMat)
    post.position.y = 0.36
    board.add(post)
    const rim = new THREE.Mesh(rimGeo, gold)
    rim.position.y = 0.75
    rim.rotation.x = 0.78
    board.add(rim)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const c = canvas.getContext('2d')
    c.fillStyle = '#344f49'
    c.fillRect(0, 0, 128, 128)
    c.strokeStyle = c.fillStyle = '#e2c998'
    c.lineWidth = 2
    c.beginPath()
    c.arc(64, 64, 59, 0, 2 * Math.PI)
    c.stroke()
    c.textAlign = 'center'
    c.font = 'bold 12px sans-serif'
    c.fillText('BRIAR SURVEY', 64, 44)
    c.beginPath()
    c.moveTo(23, 79)
    c.lineTo(46, 61)
    c.lineTo(55, 69)
    c.lineTo(73, 49)
    c.lineTo(101, 79)
    c.closePath()
    c.stroke()
    c.font = 'bold 13px sans-serif'
    c.fillText('FIELD ' + (i + 1), 64, 98)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const face = new THREE.Mesh(
      faceGeo,
      new THREE.MeshStandardMaterial({ map, roughness: 0.66, metalness: 0.12 }),
    )
    face.rotation.x = -Math.PI / 2
    face.position.y = 0.019
    rim.add(face)
    board.position.set(site.x, world.height(site.x, site.z), site.z)
    scene.add(board)
    return board
  })
}

export function createCountyActivities(scene, world, sim, story, hooks) {
  let state = initial(),
    lastGate = null
  const art = gateArt()
  scene.add(art.group)
  surveyArt(scene, world)
  Object.assign(world.locations, {
    showroom: sites.showroom,
    dispatch: sites.dispatch,
    motorClub: sites.club,
    grocer: point(-24, 14.3, 'Cedar Grocer'),
    cafe: point(-79.3, -103.3, 'Juniper Kitchen'),
  })
  function target() {
    const j = state.job
    if (!j) return null
    if (j.kind === 'race') return j.step < 0 ? sites.start : races[j.id].gates[j.step]
    return deliveries[j.id][j.step ? 'drop' : 'pickup']
  }
  function syncGate() {
    const j = state.job,
      t = target()
    const key = j?.kind === 'race' ? j.id + '/' + j.step : null
    if (key === lastGate) return
    lastGate = key
    art.group.visible = key !== null
    if (!art.group.visible) return
    art.group.position.set(t.x, world.height(t.x, t.z), t.z)
    art.group.rotation.y = (t.dx ?? 1) ? Math.PI / 2 : 0
    art.finish.visible = j.step === -1 || j.step === races[j.id].gates.length - 1
  }
  function change(message, sound = 'step') {
    syncGate()
    hooks.changed()
    if (message) {
      hooks.sound(sound)
      hooks.notify(message)
    }
  }
  function begin(kind, id) {
    if (state.job) return hooks.notify('Finish or leave your current activity in Objectives.')
    const record = kind === 'race' ? races[id] : deliveries[id]
    if (!record) return
    state.job = { kind, id, step: kind === 'race' ? -1 : 0, elapsed: 0 }
    hooks.clearWaypoint()
    hooks.resume()
    change(
      record.title +
        (kind === 'race' ? ' · Bring a car to the starting line.' : ' · Collection point marked.'),
    )
  }
  function restart() {
    if (state.job?.kind !== 'race') return
    Object.assign(state.job, { step: -1, elapsed: 0 })
    change('Trial reset · Return to the Foundry starting line.')
  }
  function cancel() {
    if (!state.job) return
    state.job = null
    change('Activity ended · County mission resumed.')
  }
  function update(dt, oldX, oldZ) {
    const j = state.job
    if (j?.kind !== 'race' || j.step < 0) return
    const race = races[j.id]
    j.elapsed += dt
    if (j.elapsed >= race.limit) return restart()
    const v = sim.vehicle,
      g = target()
    if (!v) return
    const from = (oldX - g.x) * g.dx + (oldZ - g.z) * g.dz
    const to = (v.x - g.x) * g.dx + (v.z - g.z) * g.dz
    if (from > 0 || to < 0 || to <= from) return
    const t = -from / (to - from)
    const side = (oldX + t * (v.x - oldX) - g.x) * g.dz - (oldZ + t * (v.z - oldZ) - g.z) * g.dx
    if (Math.abs(side) > 4.45) return
    if (++j.step < race.gates.length) return change('Gate ' + j.step + '/' + race.gates.length)
    state.races++
    state.best[j.id] = Math.min(state.best[j.id] ?? Infinity, j.elapsed)
    story.state.money += race.reward
    state.job = null
    change(race.title + ' · ' + seconds(j.elapsed) + ' · +$' + race.reward, 'reward')
  }
  function interaction() {
    const p = sim.player,
      j = state.job
    if (
      j &&
      j.kind === 'race' &&
      j.step === -1 &&
      sim.vehicle &&
      Math.abs(sim.vehicle.speed) < 2 &&
      distance(p, sites.start) < 7
    )
      return {
        label: 'Start ' + races[j.id].title,
        run: () => {
          j.step = 0
          change('Go · Follow the marked gates.')
        },
      }
    if (sim.vehicle) return null
    if (j?.kind === 'delivery' && distance(p, target()) < 2.9) {
      const contract = deliveries[j.id]
      return {
        label: (j.step ? 'Hand over ' : 'Collect ') + contract.cargo.toLowerCase(),
        run: () => {
          if (j.step === 0) {
            j.step = 1
            change(contract.cargo + ' collected · Destination marked.')
          } else {
            state.deliveries++
            story.state.money += contract.reward
            state.job = null
            change(contract.title + ' complete · +$' + contract.reward, 'reward')
          }
        },
      }
    }
    const stamp = survey.find(
      (s) =>
        !state.stamps.includes(s.id) &&
        distance(p, s) < 1.8 &&
        Math.abs(p.y - world.height(s.x, s.z)) < 1.45,
    )
    if (!stamp) return null
    return {
      label: 'Take a survey rubbing',
      run: () => {
        if (state.stamps.includes(stamp.id)) return
        state.stamps.push(stamp.id)
        const reward = state.stamps.length === survey.length ? 100 : 20
        story.state.money += reward
        change(stamp.name + ' · ' + state.stamps.length + '/3 rubbings · +$' + reward, 'reward')
      },
    }
  }
  function describe() {
    const j = state.job
    if (!j) return null
    if (j.kind === 'delivery') {
      const c = deliveries[j.id],
        steps = [
          'Collect the ' + c.cargo.toLowerCase() + ' at ' + c.pickup.name + ' on foot.',
          'Hand it over at ' + c.drop.name + ' on foot.',
        ]
      return { title: c.title, reward: c.reward, step: j.step, steps, objective: steps[j.step] }
    }
    const r = races[j.id],
      steps = [
        'Stop a vehicle at the Foundry starting line and press E.',
        ...r.gates.map(
          (g, i) =>
            (i === r.gates.length - 1 ? 'Cross the finish line at ' : 'Pass the gate at ') +
            g.name +
            '.',
        ),
      ]
    return {
      title: r.title,
      reward: r.reward,
      steps,
      step: j.step + 1,
      objective: steps[j.step + 1],
      timer: j.step >= 0 ? Math.max(0, r.limit - j.elapsed) : null,
    }
  }
  function contact(role) {
    const race = role === 'race-steward',
      jobs = race ? races : deliveries,
      kind = race ? 'race' : 'delivery'
    const choices = Object.entries(jobs).map(([id, item]) => ({
      id: kind + '/' + id,
      label:
        item.title +
        ' · $' +
        item.reward +
        (race ? ' · ' + item.limit + ' s' : ' · ' + item.drop.name),
    }))
    hooks.openDialog({
      name: race ? 'Lee Mercer · Motor club' : 'Imani Bell · Foundry Dispatch',
      text: state.job
        ? 'You already have a route on your board. Finish it or leave it from Objectives to take another.'
        : race
          ? 'Choose a timed run. Bring any county car to the striped starting line, face east, then press E. The gates must be crossed in order.'
          : 'These local consignments are ready today. Collect the signed package and hand it over in person.',
      choices: [...(state.job ? [] : choices), { id: 'leave', label: 'See you around' }],
    })
  }
  function journal() {
    return {
      race: state.job?.kind === 'race',
      active: !!state.job,
      results: Object.entries(state.best).map(([id, n]) => races[id].title + ' · ' + seconds(n)),
      totals: state.races + ' races finished · ' + state.deliveries + ' consignments delivered',
      finds: survey.map((s) => ({
        name: s.name,
        found: state.stamps.includes(s.id),
        hint: s.hint,
      })),
      destinations: [sites.showroom, sites.club, sites.dispatch],
    }
  }
  function restore(data = {}) {
    state = initial()
    state.races = count(data.races)
    state.deliveries = count(data.deliveries)
    state.stamps = survey
      .filter((s) => Array.isArray(data.stamps) && data.stamps.includes(s.id))
      .map((s) => s.id)
    for (const id of Object.keys(races)) {
      const n = data.best?.[id]
      if (Number.isFinite(n) && n > 0 && n <= races[id].limit) state.best[id] = n
    }
    const j = data.job
    if (j && Number.isInteger(j.step)) {
      if (j.kind === 'delivery' && Object.hasOwn(deliveries, j.id) && [0, 1].includes(j.step))
        state.job = { kind: j.kind, id: j.id, step: j.step, elapsed: 0 }
      else if (
        j.kind === 'race' &&
        Object.hasOwn(races, j.id) &&
        j.step >= -1 &&
        j.step < races[j.id].gates.length &&
        Number.isFinite(j.elapsed) &&
        j.elapsed >= 0 &&
        j.elapsed < races[j.id].limit
      )
        state.job = { kind: j.kind, id: j.id, step: j.step, elapsed: j.elapsed }
    }
    syncGate()
  }
  return {
    sites,
    interaction,
    target,
    describe,
    update,
    contact,
    begin,
    cancel,
    restart,
    journal,
    restore,
    get state() {
      return state
    },
    get cargo() {
      return state.job?.kind === 'delivery' && state.job.step === 1
        ? deliveries[state.job.id].cargo
        : null
    },
  }
}
