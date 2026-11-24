import * as THREE from 'three'
import { createWorld } from './world.js'
import { clearance } from './boundary.js'
import { createSimulation } from './simulation.js'
import { createUI } from './ui.js'
import { createNavigation } from './navigation.js'
import { createClimate } from './climate.js'
import { createRendering } from './rendering.js'
import { createCampaign } from './campaign.js'
import { createInteractions } from './interactions.js'
import { renderCabinMirror } from './cockpit.js'
import { createGamepad } from './gamepad.js'
import { createAudio } from './audio.js'
import { loadCompressedSurfaces } from './surfaces.js'
import { createSurvival } from './survival.js'
import { showroomPreview } from './showroom-preview.js'
import { createHardcoreCity } from './hardcore-city.js'
import { createWeapons, weapons as weaponTypes, outfitters } from './hardcore-weapons.js'

const canvas = document.getElementById('game'),
  edgeNotice = document.getElementById('world-edge'),
  audio = createAudio(),
  gamepad = createGamepad()
const defaultSettings = {
  quality: 'Medium',
  resolution: 1,
  renderDistance: 395,
  shadows: 'Medium',
  textureQuality: 'Medium',
  antialias: true,
  ao: true,
  reflections: true,
  bloom: false,
  motionBlur: false,
  depthOfField: false,
  sharpening: true,
  grading: true,
  frameCap: 'Display',
  fps: false,
  fov: 70,
  sensitivity: 1,
  cameraDistance: 5,
  headBob: true,
  timeScale: 12,
  weather: 'Auto',
  volume: 0.55,
  vibration: true,
  adaptive: true,
  bloodEffects: false,
}
const presets = {
  Low: {
    resolution: 0.72,
    renderDistance: 200,
    shadows: 'Off',
    textureQuality: 'Low',
    antialias: false,
    ao: false,
    reflections: false,
    bloom: false,
    sharpening: false,
    grading: false,
  },
  Medium: {
    resolution: 1,
    renderDistance: 395,
    shadows: 'Medium',
    textureQuality: 'Medium',
    antialias: true,
    ao: true,
    reflections: true,
    bloom: false,
    sharpening: true,
    grading: true,
  },
  High: {
    resolution: 1,
    renderDistance: 560,
    shadows: 'High',
    textureQuality: 'High',
    antialias: true,
    ao: true,
    reflections: true,
    bloom: true,
    sharpening: true,
    grading: true,
  },
  Ultra: {
    resolution: 1.25,
    renderDistance: 800,
    shadows: 'Ultra',
    textureQuality: 'Ultra',
    antialias: true,
    ao: true,
    reflections: true,
    bloom: true,
    sharpening: true,
    grading: true,
  },
}
const prefix = 'projectReality.briar.v1.',
  settingsKey = prefix + 'settings'
let mode = read(prefix + 'mode') === 'hardcore' ? 'hardcore' : 'normal'
const slot = (kind, forMode = mode) => prefix + (forMode === 'hardcore' ? 'hardcore.' : '') + kind
let arrestScene, city, arms, outcome = null, lastPadFire = false
const numbers = {
  resolution: [0.5, 1.5],
  renderDistance: [120, 800],
  fov: [55, 100],
  sensitivity: [0.3, 2],
  cameraDistance: [2, 8],
  timeScale: [0, 24],
  volume: [0, 1],
}
const enums = {
  quality: Object.keys(presets),
  shadows: ['Off', 'Low', 'Medium', 'High', 'Ultra'],
  textureQuality: ['Low', 'Medium', 'High', 'Ultra'],
  weather: [
    'Auto',
    'Clear',
    'Partly cloudy',
    'Overcast',
    'Rain',
    'Heavy rain',
    'Fog',
    'Thunderstorm',
    'Snow',
  ],
  frameCap: ['Display', '60', '30'],
}
function sanitizeSettings(raw) {
  const result = { ...defaultSettings }
  if (!raw || typeof raw !== 'object') return result
  for (const k of Object.keys(result)) {
    if (k in numbers && Number.isFinite(+raw[k]))
      result[k] = THREE.MathUtils.clamp(+raw[k], ...numbers[k])
    else if (enums[k]?.includes(raw[k])) result[k] = raw[k]
    else if (typeof result[k] === 'boolean' && typeof raw[k] === 'boolean') result[k] = raw[k]
  }
  return result
}
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
let settings = sanitizeSettings(read(settingsKey)),
  world,
  sim,
  story,
  interactions,
  survival,
  climate,
  graphics,
  navigation,
  scene,
  camera,
  renderer
let screen = 'loading',
  active = false,
  lookX = 0,
  lookY = 0,
  waypoint = null,
  savedAt = 0,
  manualAvailable = false,
  menuReturn = 'menu',
  dialogData = null
let route = [],
  routeAge = 0,
  lastTarget = '',
  fps = 60,
  hudAge = 0,
  autosaveAge = 0,
  frameAverage = 1 / 60,
  adaptiveAge = 0,
  savePending = false,
  lastCollisions = 0
let ready = false,
  unlockedFallback = false,
  returnLockUntil = 0,
  applying = false
const keys = new Set(),
  markerPos = new THREE.Vector3(),
  cameraDirection = new THREE.Vector3()
const ui = createUI({
  newGame: startNew,
  selectMode,
  recover, finishArrestScene,
  outfit: (id, ammo) => {
    if (screen === 'outfitters') arms.purchase(id, ammo)
  },
  guideShop: (index) => {
    if (screen !== 'map' || mode !== 'hardcore' || !outfitters[index]) return
    setWaypoint(outfitters[index].x, outfitters[index].z)
    resume()
  },
  continue: () => loadGame(false),
  resume,
  save: () => saveGame(true),
  controllerSpeaker: async () => info(await audio.toggleControllerSpeaker()),
  speakerEnabled: () => audio.speakerEnabled,
  exportJourney,
  importJourney,
  load: () => loadGame(true),
  menu: returnMenu,
  open: openPanel,
  close: closePanel,
  settings: setSetting,
  interact: act,
  buy: (id) => interactions.buy(id),
  use: (id) => interactions.use(id),
  drop: (id) => interactions.drop(id),
  dialog: (id) => interactions.choice(id),
  dealer: (command, value) => interactions.dealer.act(command, value),
  activity: (command, site) => {
    const a = interactions.activities
    if (command === 'restart') a.restart()
    if (command === 'cancel') a.cancel()
    if (command === 'guide' && a.sites[site]) {
      setWaypoint(a.sites[site].x, a.sites[site].z)
      resume()
    }
  },
  mapWaypoint: setWaypoint,
})
function info(msg) {
  ui.toast(msg)
}
function changed() {
  savePending = true
  routeAge = 100
  hudAge = 10
  if (!applying && ready) refresh(true)
}
function celebrate(m, last) {
  audio.play('reward')
  info((last ? 'Campaign complete' : 'Mission complete') + ' · ' + m.title + ' · +$' + m.reward)
}
function region(p) {
  if (p.z < -254) return 'North Ridge'
  if (p.z < -205) return 'North Fork · Countryside'
  if (p.x < -68 && p.x > -110 && p.z < -50 && p.z > -118) return 'Foundry Row'
  if (p.z < -38) return 'Downtown Briar'
  if (p.z < 28) return 'Pacific Service District'
  return 'Cedar Grove'
}
function setWaypoint(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) waypoint = null
  else waypoint = { x, z, name: 'Custom waypoint' }
  routeAge = 100
  changed()
  info(waypoint ? 'Map waypoint set' : 'Waypoint cleared')
}
function mapTarget() {
  return waypoint || interactions.activities.target() || story.target()
}
function payload() {
  const p = sim.player,
    v = sim.vehicle,
    c = climate.state,
    target = mapTarget(),
    mission = interactions.activities.describe() || story.describe()
  let marker = null
  if (target) {
    const d = Math.hypot(target.x - p.x, target.z - p.z)
    markerPos
      .set(target.x, world.height(target.x, target.z) + (d < 12 ? 2.45 : 4.1), target.z)
      .project(camera)
    marker = {
      x: (markerPos.x * 0.5 + 0.5) * 100,
      y: (0.5 - markerPos.y * 0.5) * 100,
      distance: d,
      visible:
        markerPos.z < 1 &&
        markerPos.z > 0 &&
        Math.abs(markerPos.x) < 0.95 &&
        Math.abs(markerPos.y) < 0.91,
    }
  }
  return {
    world,
    mode,
    combat: mode === 'hardcore' ? { ...arms.hud(), wanted: city.wanted, status: city.status, arrest: city.arrestProgress } : null,
    outfitters: screen === 'outfitters' ? arms.shop() : null,
    mapActors: mode === 'hardcore' ? city.mapActors() : [],
    shops: mode === 'hardcore' ? outfitters : [],
    outcome,
    player: p,
    vehicle: v,
    money: story.state.money,
    hour: c.hour,
    weather: c.weather,
    region: region(p),
    mission,
    missions: story.chapters.map((m, i) => ({
      ...m,
      completed: story.state.completed.includes(i),
    })),
    target,
    missionTarget: interactions.activities.target() || story.target(),
    route,
    prompt: interactions.check()?.label || '',
    waypoint,
    marker,
    settings,
    fps: Math.round(fps),
    inventory: interactions.inventory(),
    shop: interactions.shop(),
    dialog: dialogData,
    hasSave: manualAvailable,
    discoveries: story.state.discoveries,
    sideObjective: story.state.sideJob ? 'Bring a bottle of spring water to a resident.' : null,
    journal: screen === 'objectives' ? interactions.activities.journal() : null,
    dealership: screen === 'dealership' ? interactions.dealer.view() : null,
  }
}
function refresh(redraw = false) {
  if (!ready || !active) return
  const target = mapTarget(),
    key = target ? target.x.toFixed(0) + ',' + target.z.toFixed(0) : ''
  if (routeAge > 0.6 || key !== lastTarget) {
    route = navigation.route(sim.player, target)
    routeAge = 0
    lastTarget = key
  }
  const data = payload()
  ui.update(data)
  if (redraw && ['inventory', 'shop', 'objectives', 'map'].includes(screen)) ui.panel(screen, data)
}
function clearInput() {
  gamepad.quiet()
  lastPadFire = false
  arms?.release()
  keys.clear()
  lookX = lookY = 0
}
function lock() {
  if (document.pointerLockElement === canvas || screen !== 'hud') return
  try {
    const result = canvas.requestPointerLock?.()
    if (result?.catch)
      result.catch(() => {
        unlockedFallback = true
      })
  } catch {
    unlockedFallback = true
  }
}
function unlock() {
  if (document.pointerLockElement === canvas) document.exitPointerLock?.()
}
function setPlaying(wantLock = true) {
  active = true
  screen = 'hud'
  clearInput()
  audio.activate()
  audio.setVolume(settings.volume)
  ui.hud(payload())
  canvas.focus({ preventScroll: true })
  if (wantLock) lock()
}
function resume() {
  if (!active || outcome) return
  setPlaying()
  hudAge = 100
}
function openPanel(name) {
  if (!ready || (outcome && name !== 'recovery')) return
  if (
    ['map', 'inventory', 'shop', 'dialog', 'objectives', 'pause', 'dealership', 'outfitters', 'recovery'].includes(name) &&
    !active
  )
    return
  if (screen === name) {
    closePanel()
    return
  }
  if (['settings', 'credits', 'controls'].includes(name)) menuReturn = active ? 'pause' : 'menu'
  screen = name
  clearInput()
  unlock()
  audio.play('ui')
  audio.setActive(false)
  ui.panel(name, active ? payload() : { settings, world, mode, hasSave: !!latestSave() })
}
function closePanel() {
  if (['settings', 'credits', 'controls'].includes(screen)) {
    if (menuReturn === 'menu') return returnMenu()
    return openPanel('pause')
  }
  if (screen === 'menu' || screen === 'loading') return
  resume()
}
function returnMenu() {
  if (active) saveGame(false)
  active = false
  screen = 'menu'
  clearInput()
  unlock()
  audio.setActive(false)
  outcome = null
  ui.update({ world, settings, mode, shops: [] })
  ui.menu(!!latestSave())
}
function selectMode(value) {
  if (screen !== 'menu' || !['normal', 'hardcore'].includes(value)) return
  mode = value
  try { localStorage.setItem(prefix + 'mode', JSON.stringify(mode)) } catch {}
  ui.update({ mode })
  ui.menu(!!latestSave())
}
function configureMode() {
  const hard = mode === 'hardcore'
  if (hard && !city) {
    city = createHardcoreCity(scene, world, sim, {
      onArrest: officer => endEncounter('arrest', officer),
      damagePlayer: (amount) => {
        if (outcome || sim.player.health <= 0) return
        sim.player.health = Math.max(0, sim.player.health - amount)
        arms.hit(sim.player)
      },
      showHit: npc => arms.hit(npc),
      onNpcShot: (origin) => {
        if (Math.hypot(origin.x - sim.player.x, origin.z - sim.player.z) < 38) audio.play('shot')
      },
      notify: info,
    })
    arms = createWeapons(scene, world, sim, camera, city, {
      blood: () => settings.bloodEffects, wallet: () => story.state,
      sound: key => audio.play(key), changed, notify: info,
    })
  }
  sim.setHardcore(hard, {
    isOwned: id => interactions.dealer.state.owned.includes(id) ||
      (id === 'sports' && story.state.owned.includes('ownership')) ||
      (id === 'offroad' && story.state.chapter === 2),
    onCrime: (kind, actor, x, z) => city.reportCrime(kind === 'recklessDriving' ? 'reckless' : kind, actor, { x, z, y: actor.y }),
    onCrash: event => city.alertDanger(event, Math.min(25, 5 + event.closingSpeed)),
    onPedestrianImpact: (npc, damage) => city.damageNpc(npc, damage, sim.player),
  })
  city?.setEnabled(hard)
  arms?.setVisible(hard)
  outcome = null
}
function finishArrestScene() {
  if (screen !== 'arrestScene') return
  arrestScene = null
  openPanel('recovery')
}
function endEncounter(reason, officer) {
  if (outcome || mode !== 'hardcore' || applying || screen !== 'hud') return
  outcome = sim.player.health <= 0 ? 'down' : reason
  arms.resetAction()
  if (outcome === 'arrest' && officer) {
    screen = 'arrestScene'
    clearInput()
    unlock()
    audio.setActive(false)
    arrestScene = { officer, start: performance.now() }
    sim.arrestShot(officer, 0, 0)
    ui.cinematic()
  } else openPanel('recovery')
  saveGame(false)
}
function recover() {
  if (!outcome || screen !== 'recovery') return
  const fee = Math.min(story.state.money, outcome === 'arrest' ? 25 : 15)
  story.state.money -= fee
  interactions.stand(false)
  city.clearWanted()
  sim.respawn()
  survival.reset()
  arms.resetAction()
  arms.clearParticles()
  outcome = null
  routeAge = 100
  resume()
  saveGame(false)
  info('Back at Cedar House · $' + fee + ' county fee')
}
function act() {
  if (!active || screen !== 'hud') return
  const a = interactions.check()
  if (a) {
    audio.play('ui')
    a.run()
    routeAge = 2
    refresh()
  }
}
function configure(previous = {}) {
  if (!renderer) return
  if (previous.shadows !== settings.shadows) climate.shadowQuality(settings.shadows)
  if (previous.textureQuality !== settings.textureQuality) {
    graphics.textures(settings.textureQuality)
    world.setTerrainDetail(
      settings.textureQuality,
      Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        { Low: 1, Medium: 4, High: 8, Ultra: 16 }[settings.textureQuality],
      ),
    )
  }
  if (previous.quality !== settings.quality || previous.renderDistance !== settings.renderDistance)
    world.setQuality(settings.quality, settings.renderDistance)
  if (
    ['quality', 'antialias', 'resolution', 'renderDistance', 'adaptive'].some(
      (k) => previous[k] !== settings[k],
    )
  )
    graphics.resize(settings)
  audio.setVolume(settings.volume)
  camera.fov = settings.fov
  camera.updateProjectionMatrix()
}
function setSetting(key, value) {
  if (!(key in defaultSettings)) return
  const prev = { ...settings }
  if (key === 'quality' && presets[value]) settings = { ...settings, ...presets[value] }
  settings = sanitizeSettings({ ...settings, [key]: value })
  if (key === 'bloodEffects' && !settings.bloodEffects) arms?.clearParticles()
  configure(prev)
  try {
    localStorage.setItem(settingsKey, JSON.stringify(settings))
  } catch {}
  ui.update({ settings })
  if (key === 'quality' && screen === 'settings') ui.panel('settings', { settings })
  if (active) savePending = true
}
function valid(save, forMode = mode) {
  if (save?.version !== 1 || !Number.isFinite(save.time)) return false
  if ((save.mode ?? 'normal') !== forMode) return false
  const s = save.sim,
    p = s?.player,
    c = save.story,
    w = save.climate
  const pose = (o) =>
    o &&
    Number.isFinite(o.x) &&
    Math.abs(o.x) <= 900 &&
    Number.isFinite(o.z) &&
    Math.abs(o.z) <= 900 &&
    Number.isFinite(o.yaw)
  if (
    !pose(p) ||
    !Array.isArray(s.cars) ||
    s.cars.length !== 5 ||
    !s.cars.every((v) => pose(v) && Number.isFinite(v.fuel) && Number.isFinite(v.condition))
  )
    return false
  const ids = new Set(s.cars.map((v) => v.id))
  if (forMode === 'hardcore' && s.patrolCars !== undefined) {
    if (!Array.isArray(s.patrolCars) || s.patrolCars.length > 5) return false
    for (const v of s.patrolCars) {
      if (!pose(v) || !/^patrol-[0-4]$/.test(v.id) || ids.has(v.id) ||
          !Number.isFinite(v.fuel) || !Number.isFinite(v.condition)) return false
      ids.add(v.id)
    }
  }
  if (
    !['sedan', 'suv', 'sports', 'pickup', 'offroad'].every((id) => ids.has(id)) ||
    (s.current && !ids.has(s.current))
  )
    return false
  if (
    !c ||
    !Number.isInteger(c.chapter) ||
    c.chapter < 0 ||
    c.chapter > 5 ||
    !Number.isInteger(c.step) ||
    c.step < 0 ||
    c.step >= [5, 4, 4, 3, 4, 1][c.chapter]
  )
    return false
  if (
    !Number.isFinite(c.money) ||
    c.money < 0 ||
    !Array.isArray(c.owned) ||
    !Array.isArray(c.completed) ||
    !Array.isArray(c.discoveries) ||
    !c.bag ||
    typeof c.bag !== 'object' ||
    Array.isArray(c.bag)
  )
    return false
  if (
    !Object.values(c.bag).every((n) => Number.isInteger(n) && n >= 0) ||
    !Number.isFinite(c.look) ||
    !Number.isFinite(c.remaining)
  )
    return false
  const savedObjects = save.interactions
  if (
    savedObjects &&
    (![savedObjects.used, savedObjects.changes].every(
      (a) =>
        Array.isArray(a) &&
        a.every((n) => Number.isInteger(n) && n >= 0 && n < world.interactables.length),
    ) ||
      !Array.isArray(savedObjects.dropped) ||
      !savedObjects.dropped.every(
        (o) => o && typeof o.id === 'string' && Number.isFinite(o.x) && Number.isFinite(o.z),
      ))
  )
    return false
  if (!w || !Number.isFinite(w.hour) || !enums.weather.slice(1).includes(w.weather)) return false
  return true
}
function exportJourney() {
  const journey = latestSave()
  if (!journey) return info('Save a journey before exporting it.')
  const url = URL.createObjectURL(new Blob([JSON.stringify(journey)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'GCA-journey.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
function importJourney() {
  const occupied = m => active || ['manual', 'auto'].some(kind => localStorage.getItem(slot(kind, m)) !== null)
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.onchange = async () => {
    try {
      const file = input.files[0]
      if (!file) return
      if (file.size > 256 * 1024) throw Error()
      const journey = JSON.parse(await file.text(), (key, value) => {
        if (['__proto__', 'constructor', 'prototype'].includes(key) ||
            /[<>&"'\x00-\x1f]/.test(key) ||
            (typeof value === 'string' && /[<>&"'\x00-\x1f]/.test(value))) throw Error()
        return value
      })
      const importedMode = journey.mode ?? 'normal'
      if (!['normal','hardcore'].includes(importedMode) || !valid(journey, importedMode)) throw Error()
      if (occupied(importedMode)) return info('That mode already has a saved journey.')
      localStorage.setItem(slot('manual', importedMode), JSON.stringify(journey))
      mode = importedMode
      try { localStorage.setItem(prefix + 'mode', JSON.stringify(mode)) } catch {}
      latestSave()
      ui.update({ hasSave: true })
      info('Journey imported. Choose Continue from the main menu.')
    } catch {
      info('Unable to import this GCA save file.')
    }
  }
  input.click()
}
function latestSave(preferManual = false) {
  const manual = read(slot('manual')),
    auto = read(slot('auto'))
  manualAvailable = valid(manual) || valid(auto)
  if (preferManual && valid(manual)) return manual
  return [manual, auto].filter(s => valid(s)).sort((a, b) => b.time - a.time)[0] || null
}
function saveGame(manual = false) {
  if (!active || applying || !ready) return false
  const data = {
    version: 1,
    mode,
    ...(mode === 'hardcore' ? { hardcore: { arms: arms.serialize(), city: city.serialize(), outcome } } : {}),
    time: Date.now(),
    sim: sim.serialize(),
    story: story.state,
    climate: climate.state,
    interactions: interactions.serialize(),
    survival: survival.state,
    waypoint,
    settings,
  }
  try {
    localStorage.setItem(slot(manual ? 'manual' : 'auto'), JSON.stringify(data))
    savedAt = data.time
    manualAvailable = true
    autosaveAge = 0
    savePending = false
    ui.update({ hasSave: true })
    if (manual) {
      audio.play('ui')
      info('Game saved locally')
      if (screen === 'pause') ui.panel('pause', payload())
    }
    return true
  } catch {
    if (manual) info('Browser storage is unavailable. Allow local storage to save.')
    return false
  }
}
function loadGame(manual = false) {
  const s = latestSave(manual)
  if (!s) {
    info('No valid save is available')
    return
  }
  const previous = active
    ? {
        hardcore: mode === 'hardcore' && { arms: arms.serialize(), city: city.serialize(), outcome },
        sim: sim.serialize(),
        story: JSON.parse(JSON.stringify(story.state)),
        climate: { ...climate.state },
        interactions: interactions.serialize(),
        survival: { ...survival.state },
        waypoint,
      }
    : null
  function restore(v) {
    configureMode()
    sim.restore(v.sim)
    story.restore(v.story)
    climate.restore(v.climate)
    interactions.restore(v.interactions)
    survival.reset(v.survival)
    if (mode === 'hardcore') {
      city.restore(v.hardcore?.city)
      arms.restore(v.hardcore?.arms)
      outcome = ['arrest', 'down'].includes(v.hardcore?.outcome) ? v.hardcore.outcome : null
      if (outcome === 'down') sim.player.health = 0
    }
    waypoint =
      v.waypoint && Number.isFinite(v.waypoint.x) && Number.isFinite(v.waypoint.z)
        ? v.waypoint
        : null
  }
  applying = true
  try {
    restore(s)
    const old = settings
    const localSettings = read(settingsKey)
    settings = sanitizeSettings({ ...s.settings, ...localSettings, bloodEffects: localSettings?.bloodEffects === true })
    configure(old)
  } catch {
    if (previous) restore(previous)
    applying = false
    info('This save could not be restored')
    return
  }
  applying = false
  lastCollisions = sim.collisions
  autosaveAge = 0
  savePending = false
  routeAge = 100
  setPlaying(!outcome)
  if (outcome) openPanel('recovery')
  refresh()
  info('Journey restored')
}
function startNew() {
  if (!ready) return
  applying = true
  configureMode()
  sim.reset()
  story.reset()
  interactions.restore()
  survival.reset()
  if (mode === 'hardcore') {
    city.restore()
    arms.restore()
  }
  waypoint = null
  route = []
  routeAge = 100
  lastTarget = ''
  lastCollisions = 0
  Object.assign(climate.state, {
    hour: 8.3,
    weather: 'Partly cloudy',
    clouds: 0.52,
    haze: 0.08,
    wet: 0,
    snow: 0,
    clock: 0,
    nextWeather: 215,
    night: false,
  })
  applying = false
  setPlaying()
  saveGame(false)
  refresh()
  info('Look around with the mouse or arrow keys')
}
function onKey(e, down) {
  if (!ready || !down) {
    if (!down) keys.delete(e.code)
    return
  }
  if (screen === 'arrestScene' && ['Escape', 'Space', 'Enter'].includes(e.code) && !e.repeat) {
    e.preventDefault()
    finishArrestScene()
    return
  }
  if (screen !== 'hud') {
    if (e.code === 'Escape' && !e.repeat && screen !== 'menu' && screen !== 'loading') {
      e.preventDefault()
      closePanel()
    } else if (
      !e.repeat &&
      ((screen === 'map' && e.code === 'KeyM') ||
        (screen === 'inventory' && e.code === 'KeyI') ||
        (screen === 'objectives' && e.code === 'Tab'))
    ) {
      e.preventDefault()
      resume()
    }
    return
  }
  if (
    [
      'Space',
      'Tab',
      'AltLeft',
      'ControlLeft',
      'ControlRight',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'Escape',
    ].includes(e.code)
  )
    e.preventDefault()
  keys.add(e.code)
  if (!e.repeat) pressAction(e.code)
}
function pressAction(code) {
  if (sim.seated && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(code)) interactions.stand()
  switch (code) {
    case 'KeyR':
      if (mode === 'hardcore') arms.reload()
      break
    case 'KeyQ':
      if (mode === 'hardcore') arms.cycle()
      break
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
      if (mode === 'hardcore') arms.equip(weaponTypes[Number(code.slice(-1)) - 1].id)
      break
    case 'Escape':
      openPanel('pause')
      break
    case 'KeyM':
      openPanel('map')
      break
    case 'KeyI':
      openPanel('inventory')
      break
    case 'Tab':
      openPanel('objectives')
      break
    case 'KeyE':
      act()
      break
    case 'KeyV':
      sim.toggleCamera()
      break
    case 'KeyC':
      if (sim.vehicle) sim.toggleCamera()
      break
    case 'KeyF':
      sim.flash()
      break
    case 'KeyU':
      if (sim.vehicle && sim.unstuck()) info('Vehicle recovered on clear ground')
      break
    case 'KeyH':
      if (sim.vehicle) audio.play('horn')
      break
    case 'KeyL':
      if (sim.vehicle) sim.toggleLights()
      break
    case 'Space':
      if (!sim.vehicle) sim.jump()
      break
  }
}
window.addEventListener('keydown', (e) => onKey(e, true))
window.addEventListener('keyup', (e) => onKey(e, false))
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    unlockedFallback = false
    returnLockUntil = performance.now() + 160
    return
  }
  if (screen === 'hud' && active && performance.now() > returnLockUntil) openPanel('pause')
})
document.addEventListener('pointerlockerror', () => {
  unlockedFallback = true
})
document.addEventListener('mousemove', (e) => {
  if (screen !== 'hud') return
  if (
    document.pointerLockElement === canvas ||
    e.buttons === 1 ||
    e.buttons === 2 ||
    (unlockedFallback && e.buttons)
  ) {
    lookX += e.movementX
    lookY += e.movementY
  }
})
canvas.addEventListener('mousedown', (e) => {
  if (screen !== 'hud') return
  if (e.button === 2) {
    keys.add('MouseRight')
    return
  }
  if (e.button === 0) {
    if (document.pointerLockElement !== canvas && !unlockedFallback) return lock()
    if (mode === 'hardcore' && sim.canUseWeapon) arms.trigger(true)
    else act()
  }
})
document.addEventListener('mouseup', (e) => {
  if (e.button === 2) keys.delete('MouseRight')
  if (e.button === 0) arms?.trigger(false)
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
function suspend() {
  gamepad.poll(false, () => {})
  clearInput()
  if (ready && active && screen === 'hud') {
    saveGame(false)
    openPanel('pause')
  }
}
window.addEventListener('blur', suspend)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) suspend()
})
window.addEventListener('pagehide', () => {
  if (active) saveGame(false)
})
window.addEventListener('resize', () => {
  if (graphics) graphics.resize(settings)
  if (active) refresh(true)
})
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  suspend()
  info('Graphics paused. Waiting for the browser to restore the display.')
})
canvas.addEventListener('webglcontextrestored', () => {
  if (ready) {
    configure()
    info('Graphics restored · Resume when ready')
  }
})

let previousFrame = 0,
  lastRender = 0
function frame(now) {
  requestAnimationFrame(frame)
  const previousScreen = screen
  const pad = gamepad.poll(ready && !document.hidden && document.hasFocus(), code => {
    if (screen !== previousScreen) return
    if (screen === 'arrestScene' && ['Confirm', 'Escape'].includes(code)) finishArrestScene()
    else if (screen === 'hud') pressAction(code)
    else if (code === 'Escape' || (screen === 'map' && code === 'KeyM'))
      closePanel()
    else ui.menuInput(code)
  }, previousScreen !== 'hud', now, mode === 'hardcore' && !sim?.vehicle)
  if (screen === 'arrestScene' && arrestScene) {
    const t = (now - arrestScene.start) / 1000
    sim.arrestShot(arrestScene.officer, t, Math.min(.1, (now - previousFrame) / 1000))
    graphics.render(settings, false, 0, 0, climate.state.wet)
    previousFrame = now
    if (t >= 3.4) finishArrestScene()
    return
  }
  if (screen !== 'hud' || !active) {
    previousFrame = now
    lastRender = 0
    return
  }
  const cap = Number(settings.frameCap) || 0
  if (cap && lastRender && now - lastRender < 1000 / cap - 0.7) return
  const actual = previousFrame ? Math.min(0.6, (now - previousFrame) / 1000) : 1 / 60
  previousFrame = now
  lastRender = now
  const dt = Math.min(0.075, actual || 0.016),
    p = sim.player,
    oldX = p.x,
    oldZ = p.z,
    dx = lookX + pad.lookX * dt * 760,
    dy = lookY + pad.lookY * dt * 525
  const inputKeys = pad.held.size ? new Set([...keys, ...pad.held]) : keys
  lookX = lookY = 0
  frameAverage = frameAverage * 0.95 + actual * 0.05
  fps = 1 / Math.max(0.001, frameAverage)
  const c = climate.update(dt, p, camera, settings, world)
  sim.update(dt, {
    keys: survival.controls(inputKeys),
    lookX: dx,
    lookY: dy,
    settings,
    hour: c.hour,
    weather: c.weather,
    wet: c.wet,
    night: c.night,
  })
  if (mode === 'hardcore') {
    if (pad.held.has('PadFire')) arms.trigger(true)
    else if (lastPadFire) arms.trigger(false)
    lastPadFire = pad.held.has('PadFire')
    arms.update(dt, inputKeys.has('MouseRight'))
    city.update(dt)
  }
  if (screen !== 'hud') return
  survival.update(dt, c, interactions.worn, mode !== 'hardcore')
  if (mode === 'hardcore' && p.health <= 0) return endEncounter('down')
  const edgeGap = clearance(p.x, p.z)
  if (edgeNotice.hidden && edgeGap < (sim.vehicle ? 4 : 1)) edgeNotice.hidden = false
  else if (!edgeNotice.hidden && edgeGap > 8) edgeNotice.hidden = true
  world.setWetness?.(c.wet)
  world.update(dt, {
    x: p.x,
    z: p.z,
    hour: c.hour,
    weather: c.weather,
    quality: settings.quality,
    night: c.night,
    camera,
  })
  if (interactions.activities.state.job) interactions.activities.update(actual, oldX, oldZ)
  else
    story.update(
      dt,
      Math.abs(dx) +
        Math.abs(dy) +
        (keys.has('ArrowLeft') ||
        keys.has('ArrowRight') ||
        keys.has('ArrowUp') ||
        keys.has('ArrowDown')
          ? 100 * dt
          : 0),
    )
  if (waypoint && Math.hypot(p.x - waypoint.x, p.z - waypoint.z) < 4) {
    waypoint = null
    changed()
    info('Waypoint reached')
  }
  const impact = lastCollisions !== sim.collisions
  gamepad.drive(now, screen === 'hud' && sim.vehicle, impact ? sim.impactG : 0, settings.vibration)
  if (impact) {
    lastCollisions = sim.collisions
    audio.play('hit', Math.min(1, sim.impactSpeed / 16))
  }
  audio.update(dt, sim, world, c, Math.hypot(p.x - oldX, p.z - oldZ), camera)
  if (sim.vehicle && sim.firstPerson) renderCabinMirror(renderer, scene, camera, sim.vehicle, now)
  graphics.render(
    settings,
    inputKeys.has('MouseRight'),
    dx,
    dy,
    c.wet,
    !!sim.vehicle && sim.firstPerson,
    c.clock,
  )
  hudAge += dt
  routeAge += dt
  autosaveAge += dt
  adaptiveAge += actual
  if (hudAge > 0.09) {
    refresh()
    hudAge = 0
  }
  if (autosaveAge > 12 || (savePending && autosaveAge > 1)) saveGame(false)
  if (settings.adaptive && adaptiveAge > 3) {
    adaptiveAge = 0
    const scale = graphics.scale,
      goal = cap === 30 ? 30 : 60
    const next =
      fps < goal * 0.73
        ? Math.max(Math.min(0.5, settings.resolution), scale - 0.1)
        : fps > goal * 0.95
          ? Math.min(settings.resolution, scale + 0.045)
          : scale
    if (Math.abs(next - scale) > 0.025) graphics.resize(settings, next)
  }
}
async function boot() {
  const wait = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
  try {
    ui.loading(0.02, 'Preparing renderer')
    await wait()
    if (globalThis.BRIAR_ASSETS)
      THREE.DefaultLoadingManager.setURLModifier(
        (url) => globalThis.BRIAR_ASSETS[url.replace(/^\.\//, '')] || url,
      )
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(
      settings.fov,
      innerWidth / innerHeight,
      0.085,
      settings.renderDistance,
    )
    scene.userData.surfaceTextures = await loadCompressedSurfaces(renderer, (p) =>
      ui.loading(0.05 + 0.07 * p, 'Loading GPU textures'),
    )
    ui.loading(0.12, 'Surveying the county')
    await wait()
    let finishTextures,
      assetRequests = 0
    const texturesDone = new Promise((resolve) => {
      finishTextures = resolve
    })
    THREE.DefaultLoadingManager.onStart = () => assetRequests++
    THREE.DefaultLoadingManager.onProgress = (url, n, total) =>
      ui.loading(0.59 + (0.3 * n) / Math.max(1, total), 'Loading surface materials')
    THREE.DefaultLoadingManager.onLoad = () => finishTextures()
    world = createWorld(scene)
    navigation = createNavigation(world.roads)
    ui.loading(0.38, 'Building vehicles and traffic')
    await wait()
    sim = createSimulation(scene, camera, world)
    climate = createClimate(scene, renderer, () => audio.play('thunder'))
    graphics = createRendering(renderer, scene, camera)
    story = createCampaign(world, sim, {
      changed,
      notify: info,
      celebrate,
      chime: () => audio.play('step'),
      setHour: (h) => (climate.state.hour = h),
      dialog: (kind) => interactions.presentDialog(kind),
    })
    survival = createSurvival(sim, world, story, info)
    interactions = createInteractions(scene, world, sim, story, {
      outfitter: () => mode === 'hardcore' ? arms?.nearbyShop() : null,
      preview: showroomPreview(renderer, scene),
      notify: info,
      changed,
      panel: openPanel,
      openDialog: (d) => {
        dialogData = d
        if (screen === 'dialog') {
          ui.panel('dialog', payload())
          return
        }
        openPanel('dialog')
      },
      resume,
      sound: (k) => audio.play(k),
      waypoint: setWaypoint,
      clearWaypoint: () => {
        waypoint = null
        routeAge = 100
      },
      drink: () => survival.drink(),
    })
    if (assetRequests) await texturesDone
    await climate.ready
    ui.loading(0.91, 'Preparing the first frame')
    await wait()
    configure()
    climate.update(0.016, sim.player, camera, settings, world)
    world.update(0.016, {
      ...sim.player,
      hour: climate.state.hour,
      quality: settings.quality,
      night: false,
      weather: climate.state.weather,
      camera,
    })
    graphics.render(settings, false, 0, 0, 0)
    await document.fonts.ready
    ui.loading(1, 'County ready')
    await wait()
    THREE.DefaultLoadingManager.onProgress = undefined
    THREE.DefaultLoadingManager.onStart = undefined
    THREE.DefaultLoadingManager.onLoad = undefined
    await window.studioIntroFinished
    ready = true
    ui.update({ world, settings, mode })
    screen = 'menu'
    ui.menu(!!latestSave())
    requestAnimationFrame(frame)
    if (new URLSearchParams(location.search).has('inspect'))
      Object.assign(globalThis, {
        briar: {
          world,
          sim,
          story,
          climate,
          renderer,
          graphics,
          scene,
          camera,
          navigation,
          interactions,
          get hardcore() { return mode === 'hardcore' ? { arms, city, outcome } : null },
          survival,
          settings: () => settings,
          screen: () => screen,
          save: saveGame,
          load: loadGame,
          refresh,
          actions: { startNew, resume, openPanel, setSetting, act, selectMode },
        },
      })
  } catch (err) {
    THREE.DefaultLoadingManager.onProgress = undefined
    console.error(err)
    ui.loading(0, 'Unable to start the 3D world')
    const label = document.getElementById('load-label')
    if (label)
      label.textContent = /webgl/i.test(String(err))
        ? 'Enable graphics acceleration in your browser and reload.'
        : 'A game asset could not be initialized. Reload to try again.'
  }
}
boot()
