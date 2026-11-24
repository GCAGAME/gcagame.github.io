import { createCartography } from './ui-map.js'
import { finishes } from './dealership.js'

const paths = {
  play: '<path d="M6 3.5 20 12 6 20.5Z"/>',
  arrowRight: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  continue: '<path d="M4 9a8 8 0 1 1-.1 5M4 4v5h5m3-3v6l4 2"/>',
  fullscreen: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  volume: '<path d="m3 10 4 0 5-4v12l-5-4H3zm12-2a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m3 10 4 0 5-4v12l-5-4H3zm13-1 5 6m0-6-5 6"/>',
  settings:
    '<path d="M4 7h8m4 0h4M4 17h3m5 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  controls:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1m-13 4h1m3 0h1m3 0h1m3 0h1M8 16h8"/>',
  credits: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.3"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
}
const icon = (name) =>
  '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || '') + '</svg>'
const $ = (id) => document.getElementById(id)
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const integer = (value, def = 0) =>
  Number.isFinite(Number(value)) ? Math.round(Number(value)) : def
const money = (value) => '$' + integer(value).toLocaleString('en-US')
const clock = (hour) => {
  const mins = Math.floor(((((Number(hour) || 0) % 24) + 24) % 24) * 60 + 0.00001)
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
}
const upperFirst = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase())
const rowButton = (action, label, extra = '') =>
  '<button class="row-button ' +
  extra +
  '" ' +
  action +
  '>' +
  esc(label) +
  icon('arrowRight') +
  '</button>'
const subhead = (label) => '<h3 class="section-title">' + esc(label) + '</h3>'
const defaultSettings = {
  quality: 'High',
  resolution: 1,
  renderDistance: 500,
  shadows: 'High',
  textureQuality: 'High',
  antialias: true,
  ao: true,
  reflections: true,
  adaptive: false,
  bloom: true,
  depthOfField: false,
  motionBlur: false,
  sharpening: false,
  grading: true,
  frameCap: 'Display',
  fps: false,
  fov: 72,
  sensitivity: 1,
  cameraDistance: 5,
  headBob: true,
  timeScale: 6,
  weather: 'Auto',
  volume: 0.65,
  vibration: true,
  bloodEffects: false,
}
const choice = (key, label, values) => ({ key, label, values })
const range = (key, label, min, max, step, unit = '') => ({ key, label, min, max, step, unit })
const toggle = (key, label) => ({ key, label, type: 'toggle' })
const groups = {
  Graphics: [
    choice('quality', 'Quality preset', ['Low', 'Medium', 'High', 'Ultra']),
    range('resolution', 'Resolution scale', 0.5, 1.5, 0.05, '%'),
    toggle('adaptive', 'Adaptive resolution'),
    range('renderDistance', 'View distance', 120, 800, 10, 'm'),
    choice('shadows', 'Shadow quality', ['Off', 'Low', 'Medium', 'High', 'Ultra']),
    choice('textureQuality', 'Texture quality', ['Low', 'Medium', 'High', 'Ultra']),
    toggle('antialias', 'Anti-aliasing'),
    toggle('ao', 'Ambient occlusion'),
    toggle('reflections', 'Surface reflections'),
    toggle('bloom', 'Bloom'),
    toggle('grading', 'Color grading'),
    toggle('depthOfField', 'Focus depth of field'),
    toggle('motionBlur', 'Motion blur'),
    toggle('sharpening', 'Image sharpening'),
    choice('frameCap', 'Frame pacing', ['Display', '60', '30']),
    toggle('fps', 'Show frame rate'),
  ],
  Camera: [
    range('fov', 'Field of view', 55, 100, 1, '°'),
    range('sensitivity', 'Mouse sensitivity', 0.3, 2, 0.05, '×'),
    range('cameraDistance', 'Third-person distance', 2, 8, 0.25, 'm'),
    toggle('headBob', 'Walking head movement'),
  ],
  World: [
    toggle('bloodEffects', 'Blood Effects'),
    range('timeScale', 'Clock speed', 0, 24, 0.5, '×'),
    choice('weather', 'Weather', [
      'Auto',
      'Clear',
      'Partly cloudy',
      'Overcast',
      'Rain',
      'Heavy rain',
      'Fog',
      'Thunderstorm',
      'Snow',
    ]),
  ],
  Audio: [
    range('volume', 'Master volume', 0, 1, 0.05, '%'),
    toggle('vibration', 'Controller vibration'),
  ],
}
const controls = {
  Controller: [
    ['Left stick / right stick', 'Move or steer / look'],
    ['R2 / L2', 'Accelerate / brake or reverse'],
    ['Cross / A', 'Interact or enter / exit vehicle'],
    ['Square / X', 'Jump, vault or handbrake'],
    ['Circle / B', 'Pause or go back'],
    ['Triangle / Y', 'Change camera'],
    ['L1 / R1', 'Sprint / horn'],
    ['L3 / R3', 'Crouch / flashlight'],
    ['D-pad ↑ / →', 'Objectives / inventory'],
    ['D-pad ↓ / ←', 'Recover vehicle / headlights'],
    ['Share / Options', 'Map / pause'],
    ['D-pad or left stick', 'Navigate menus; left / right adjusts settings'],
    ['Cross / Circle', 'Select / back in menus'],
  ],
  'On foot': [
    ['W A S D', 'Move'],
    ['Mouse / arrows', 'Look around'],
    ['Shift', 'Sprint'],
    ['Space', 'Jump / vault'],
    ['Ctrl', 'Crouch'],
    ['E / left click', 'Interact'],
    ['Right click', 'Hold to focus'],
    ['F', 'Flashlight'],
    ['V', 'Switch perspective'],
  ],
  Driving: [
    ['W', 'Accelerate'],
    ['S', 'Brake / reverse'],
    ['A / D', 'Steer'],
    ['Space', 'Handbrake'],
    ['E', 'Exit vehicle'],
    ['C / V', 'Change camera'],
    ['H', 'Sound horn'],
    ['U', 'Recover vehicle'],
    ['L', 'Headlights'],
  ],
  Navigation: [
    ['M', 'County map'],
    ['I', 'Inventory'],
    ['Tab', 'Objectives'],
    ['Esc', 'Pause / back'],
  ],
  Hardcore: [
    ['Right / left mouse', 'Aim / fire on foot'],
    ['R / Q', 'Reload / cycle owned weapons'],
    ['1 / 2 / 3', 'Equip a weapon by slot'],
    ['E', 'Interact or shop'],
    ['L2 / R2 on foot', 'Aim / fire'],
    ['D-pad ↓ / R1 on foot', 'Reload / cycle weapon'],
  ],
}
const titles = {
  pause: 'Paused',
  settings: 'Settings',
  controls: 'Controls',
  credits: 'Credits',
  map: 'County map',
  inventory: 'Inventory',
  objectives: 'Objectives',
  shop: 'County store',
  dialog: 'Conversation',
  dealership: 'Foundry Motors',
  outfitters: 'County Outfitters',
  recovery: 'County rescue',
}

function formatSetting(s, value) {
  if (s.unit === '%') return Math.round(value * 100) + '%'
  return (
    Number(value)
      .toFixed(s.step < 1 ? 2 : 0)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1') + (s.unit || '')
  )
}
function settingRow(setting, value) {
  const { key, label, values } = setting
  const attrs = ' id="setting-' + key + '" data-setting="' + key + '"'
  let input
  if (values)
    input =
      '<select' +
      attrs +
      '>' +
      values
        .map(
          (v) =>
            '<option value="' +
            v +
            '"' +
            (String(v) === String(value) ? ' selected' : '') +
            '>' +
            esc(v === 'Display' ? 'Display refresh' : v) +
            '</option>',
        )
        .join('') +
      '</select>'
  else if (setting.type === 'toggle')
    input =
      '<button' +
      attrs +
      ' role="switch" aria-label="' +
      esc(label) +
      '" aria-checked="' +
      !!value +
      '" class="switch-control"></button>'
  else
    input =
      '<span class="slider-box"><input type="range"' +
      attrs +
      ' min="' +
      setting.min +
      '" max="' +
      setting.max +
      '" step="' +
      setting.step +
      '" value="' +
      Number(value) +
      '"><output for="setting-' +
      key +
      '">' +
      formatSetting(setting, value) +
      '</output></span>'
  return (
    '<div class="setting-row"><label for="setting-' +
    key +
    '">' +
    esc(label) +
    '</label>' +
    input +
    '</div>'
  )
}

export function createUI(actions = {}) {
  const root = $('interface'),
    sheet = $('sheet'),
    body = $('sheet-body'),
    cartography = createCartography()
  for (const el of root.querySelectorAll('[data-icon]')) el.innerHTML = icon(el.dataset.icon)
  let data = { settings: { ...defaultSettings } },
    view = 'loading',
    origin = 'menu',
    activeTab = 'Graphics',
    lastMini = -Infinity
  let lastVolume = 0.65,
    noticeTimer = 0,
    mapZoom = 1,
    mapCenter = null,
    panelSignature = '',
    lastHelp = ''
  let drag = null,
    dragged = false
  const valueOf = (k) => data.settings?.[k] ?? defaultSettings[k]
  const call = (key, ...args) => actions[key]?.(...args)
  const setText = (id, value) => {
    const node = $(id),
      v = String(value ?? '')
    if (node.textContent !== v) node.textContent = v
  }
  function merge(values) {
    if (!values || typeof values !== 'object') return
    data = {
      ...data,
      ...values,
      settings: values.settings ? { ...data.settings, ...values.settings } : data.settings,
    }
  }
  function setView(name) {
    view = name
    root.dataset.view = name
    root.dataset.origin = origin
    $('loading-screen').hidden = name !== 'loading'
    $('menu-screen').hidden = name !== 'menu'
    $('hud').hidden = name !== 'hud'
    $('arrest-scene').hidden = name !== 'arrestScene'
    $('panel-screen').hidden = !titles[name]
    sheet.classList.toggle('wide', ['map', 'controls'].includes(name))
    sheet.querySelector('.close-sheet').hidden = name === 'recovery'
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[hidden]'))
      document.activeElement.blur()
  }
  function soundDisplay() {
    const muted = valueOf('volume') <= 0,
      button = root.querySelector('.sound-tool'),
      state = String(muted)
    if (button.dataset.muted === state) return
    button.dataset.muted = state
    button.innerHTML =
      icon(muted ? 'muted' : 'volume') + '<span>Audio ' + (muted ? 'off' : 'on') + '</span>'
    button.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio')
  }
  function toast(text) {
    if (!text) return
    clearTimeout(noticeTimer)
    setText('notification-text', text)
    $('notification').classList.add('visible')
    noticeTimer = setTimeout(() => $('notification').classList.remove('visible'), 3000)
  }
  function changeSetting(key, value) {
    data.settings = { ...data.settings, [key]: value }
    call('settings', key, value)
    if (key === 'volume') soundDisplay()
  }
  function menu(hasSave) {
    origin = 'menu'
    merge({ hasSave: !!hasSave })
    setView('menu')
    for (const b of root.querySelectorAll('[data-mode]'))
      b.setAttribute('aria-pressed', String(b.dataset.mode === (data.mode || 'normal')))
    soundDisplay()
    root.querySelector('[data-action="continue"]').disabled = !hasSave
    setText('save-status', hasSave ? 'Saved game' : 'No save')
    cartography.draw($('overview-map'), data, 'overview')
  }
  function drawFullMap() {
    cartography.draw($('full-map'), data, 'full', mapZoom, mapCenter)
    const clear = $('clear-waypoint')
    if (clear) clear.hidden = !data.waypoint
  }
  function loading(progress, label) {
    setView('loading')
    const n = Math.round(Math.max(0, Math.min(1, Number(progress) || 0)) * 100)
    $('load-bar').style.width = n + '%'
    setText('load-percent', n + '%')
    setText('load-label', label || 'Preparing Briar County')
  }
  function paintHUD(force) {
    const mission = data.mission || {},
      player = data.player || {},
      vehicle = data.vehicle
    setText(
      'hud-mission-tag',
      mission.timer != null
        ? 'Time remaining · ' +
            Math.floor(mission.timer / 60) +
            ':' +
            String(Math.max(0, Math.floor(mission.timer)) % 60).padStart(2, '0')
        : 'Current mission',
    )
    setText('hud-mission', mission.title || 'Free exploration')
    setText('hud-objective', mission.objective || 'Explore Briar County.')
    const steps = mission.steps?.length || 1,
      current = mission.completed ? steps : Math.max(0, Number(mission.step) || 0)
    $('mission-progress').style.width = Math.min(1, current / steps) * 100 + '%'
    setText('hud-time', clock(data.hour))
    setText('hud-money', money(data.money))
    setText('hud-weather', data.weather || 'Clear')
    setText(
      'hud-fps',
      valueOf('fps') && Number.isFinite(data.fps) ? integer(data.fps) + ' FPS' : '',
    )
    const health = Math.max(0, Math.min(100, integer(player.health, 100)))
    $('health-bar').style.width = health + '%'
    setText('hud-health', health)
    const combat = data.combat
    $('combat-hud').hidden = !combat
    $('hud').classList.toggle('armed', !!combat && !vehicle)
    if (combat) {
      $('wanted-readout').hidden = !combat.wanted
      $('wanted-readout').setAttribute('aria-label', 'Wanted level ' + combat.wanted + ' of 5 · ' + combat.status)
      setText('wanted-stars', '★'.repeat(combat.wanted) + '☆'.repeat(5 - combat.wanted))
      setText('wanted-status', combat.status + (combat.arrest > 0 ? ' · ' + Math.round(combat.arrest * 100) + '%' : ''))
      $('gear-readout').hidden = !!vehicle
      setText('equipped-weapon', combat.name)
      setText('ammo-count', combat.reloading ? 'Reloading…' : combat.loaded + ' / ' + combat.reserve)
    }
    const condition =
      player.chill > 60
        ? ' · Cold'
        : player.stamina < 95
          ? ' · Stamina ' + Math.round(player.stamina) + '%'
          : ''
    setText('hud-region', (data.region || 'Briar County') + condition)
    const prompt = $('interaction')
    prompt.hidden = !data.prompt
    if (data.prompt && prompt.lastElementChild.textContent !== data.prompt)
      prompt.lastElementChild.textContent = data.prompt
    const m = data.marker,
      node = $('world-marker')
    node.hidden = !m?.visible
    if (m?.visible) {
      node.style.left = m.x + '%'
      node.style.top = m.y + '%'
      node.firstElementChild.style.background = data.waypoint ? '#91d5e3' : ''
      node.lastElementChild.textContent = integer(m.distance) + ' m'
    }
    $('driving').hidden = !vehicle
    if (vehicle) {
      setText('car-name', upperFirst(vehicle.name || vehicle.type))
      setText('car-speed', Math.abs(integer(vehicle.speed * 3.6)))
      setText('car-gear', vehicle.gear ?? 'N')
      setText('car-fuel', 'Fuel ' + integer(vehicle.fuel, 100) + '%')
      setText('car-condition', 'Body ' + integer(vehicle.condition, 100) + '%')
    }
    const help = vehicle ? 'drive' : combat ? 'armed' : 'foot'
    if (help !== lastHelp) {
      lastHelp = help
      const items = vehicle
        ? [
            ['C', 'Camera'],
            ['Space', 'Handbrake'],
            ['Esc', 'Pause'],
          ]
        : combat ? [['RMB', 'Aim'], ['LMB', 'Fire'], ['R', 'Reload'], ['Q', 'Switch'], ['E', 'Use']] : [
            ['WASD', 'Move'],
            ['V', 'Camera'],
            ['Tab', 'Objectives'],
            ['Esc', 'Pause'],
          ]
      $('hud-help').innerHTML = items
        .map(([k, v]) => '<span><kbd>' + k + '</kbd>' + v + '</span>')
        .join('')
    }
    if (force || performance.now() - lastMini > 125) {
      cartography.draw($('minimap'), data, 'mini')
      lastMini = performance.now()
    }
  }
  function hud(values) {
    merge(values)
    origin = 'game'
    setView('hud')
    paintHUD(true)
  }
  function update(values) {
    merge(values)
    if (view === 'hud') paintHUD(false)
    else if (view === 'menu') {
      soundDisplay()
      if (values?.world) cartography.draw($('overview-map'), data, 'overview')
    } else if (['inventory', 'shop', 'dialog', 'dealership', 'outfitters'].includes(view)) {
      const signature = JSON.stringify([data.money, data[view]])
      if (signature !== panelSignature) renderPanel()
    } else if (view === 'map' && values?.waypoint !== undefined) drawFullMap()
  }
  function settingsPanel() {
    const tabs = Object.keys(groups).filter(
      (t) => !data.settingKeys || groups[t].some((s) => data.settingKeys.includes(s.key)),
    )
    if (!tabs.includes(activeTab)) activeTab = tabs[0]
    return (
      '<nav class="settings-tabs" aria-label="Settings sections">' +
      tabs
        .map(
          (t) =>
            '<button data-tab="' +
            t +
            '" class="' +
            (t === activeTab ? 'selected' : '') +
            '">' +
            t +
            '</button>',
        )
        .join('') +
      '</nav>' +
      (groups[activeTab] || [])
        .filter((s) => !data.settingKeys || data.settingKeys.includes(s.key))
        .map((s) => settingRow(s, valueOf(s.key)))
        .join('')
    )
  }
  function controlGroup(name) {
    return (
      subhead(name) +
      controls[name]
        .map(
          ([key, action]) =>
            '<div class="control-row"><span>' + action + '</span><kbd>' + key + '</kbd></div>',
        )
        .join('')
    )
  }
  function objectivesPanel() {
    const m = data.mission || {}
    const steps = (m.steps || [])
      .map((s, i) => {
        const done = m.completed || i < m.step,
          current = !done && i === m.step
        return (
          '<div class="objective-row ' +
          (done ? 'done' : current ? 'current' : '') +
          '"><span class="step-dot">' +
          (done ? '✓' : '') +
          '</span><span>' +
          esc(typeof s === 'string' ? s : s.label || s.title) +
          '</span></div>'
        )
      })
      .join('')
    const missions = (data.missions || [])
      .map((entry, i) => {
        const title = typeof entry === 'string' ? entry : entry.title
        return (
          '<div class="job-row ' +
          (entry.completed ? 'done' : i === m.index ? 'current' : '') +
          '"><span class="step-dot">' +
          (entry.completed ? '✓' : '') +
          '</span>' +
          esc(title) +
          '</div>'
        )
      })
      .join('')
    const side =
      typeof data.sideObjective === 'string'
        ? data.sideObjective
        : data.sideObjective?.objective || data.sideObjective?.title
    const discoveries = (data.discoveries || [])
      .map(
        (d) =>
          '<div class="job-row done"><span class="step-dot">✓</span>' +
          esc(typeof d === 'string' ? d : d.name) +
          '</div>',
      )
      .join('')
    return (
      subhead(m.title || 'Free exploration') +
      (m.reward ? '<p class="balance">Reward ' + money(m.reward) + '</p>' : '') +
      steps +
      (side ? subhead('Local errand') + '<p class="panel-note">' + esc(side) + '</p>' : '') +
      (missions ? subhead('County missions') + missions : '') +
      (discoveries ? subhead('Discoveries') + discoveries : '') +
      countyJournal()
    )
  }
  function countyJournal() {
    const j = data.journal
    if (!j) return ''
    const guide = (key, name) =>
      '<button class="item-button" data-activity="guide" data-site="' +
      key +
      '">' +
      name +
      '</button>'
    return (
      subhead('Foundry Row') +
      '<div class="motor-actions">' +
      guide('club', 'Route to motor club') +
      guide('dispatch', 'Route to courier kiosk') +
      guide('showroom', 'Route to showroom') +
      '</div>' +
      (j.active
        ? '<div class="motor-actions">' +
          (j.race
            ? '<button class="item-button" data-activity="restart">Restart from the grid</button>'
            : '') +
          '<button class="item-button" data-activity="cancel">Leave activity</button></div>'
        : '') +
      '<p class="panel-note">' +
      esc(j.totals) +
      '</p>' +
      j.results.map((r) => '<div class="job-row done">Best time · ' + esc(r) + '</div>').join('') +
      subhead('County survey · ' + j.finds.filter((l) => l.found).length + '/3') +
      j.finds
        .map(
          (s) =>
            '<div class="list-item"><div><div class="item-name">' +
            (s.found ? '✓ ' : '') +
            esc(s.name) +
            '</div><div class="item-desc">' +
            esc(s.found ? 'Rubbing recorded' : s.hint) +
            '</div></div></div>',
        )
        .join('')
    )
  }
  function showroom() {
    const d = data.dealership
    if (!d) return ''
    const button = (action, label, value = '', disabled = false, main = false) =>
      '<button class="item-button' +
      (main ? ' main' : '') +
      '" data-dealer="' +
      action +
      '" data-value="' +
      esc(value) +
      '"' +
      (disabled ? ' disabled' : '') +
      '>' +
      esc(label) +
      '</button>'
    const wrap = (content) => '<div class="motor-actions">' + content + '</div>'
    const tab = d.models
      .map(
        (m) =>
          '<button data-dealer="browse" data-value="' +
          esc(m.id) +
          '" aria-pressed="' +
          (m.id === d.id) +
          '" class="motor-model"><strong>' +
          esc(m.name) +
          '</strong><span>' +
          (m.owned ? 'Registered' : 'Available stock') +
          '</span></button>',
      )
      .join('')
    let html =
      '<p class="balance">Available funds &nbsp; ' +
      money(data.money) +
      '</p><div class="motor-catalog">' +
      tab +
      '</div><div class="motor-heading"><span>' +
      esc(d.kind) +
      '</span><h3>' +
      esc(d.name) +
      '</h3></div>' +
      '<img class="motor-preview" src="' +
      esc(d.preview) +
      '" alt="' +
      esc(d.name) +
      ' in the selected finish">' +
      '<div class="motor-spec"><span><strong>' +
      d.speed +
      '</strong> km/h</span><span><strong>' +
      d.mass.toLocaleString('en-US') +
      '</strong> kg</span></div>'
    if (!d.owned)
      return (
        html +
        (d.lock
          ? '<p class="panel-note">Registration unlocks when you ' +
            esc(d.lock.charAt(0).toLowerCase() + d.lock.slice(1)) +
            '.</p>'
          : '') +
        wrap(
          button(
            'buy',
            'Register vehicle · ' + money(d.price),
            '',
            !!d.lock || data.money < d.price,
            true,
          ),
        )
      )
    html +=
      wrap(button('collect', 'Collect from the forecourt', '', false, true)) +
      subhead('Paintwork') +
      '<div class="motor-actions">' +
      finishes
        .map(
          (f) =>
            '<button class="item-button paint-chip" data-dealer="paint" data-value="' +
            f.id +
            '" title="' +
            esc(f.label) +
            '" ' +
            (f.id === d.paint || (f.hex && data.money < 20) ? ' disabled' : '') +
            '>' +
            '<i style="background:' +
            (f.hex || '#8d8c83') +
            '"></i>' +
            esc(f.label) +
            (f.id === d.paint ? ' ✓' : f.hex ? ' · $20' : ' · Free') +
            '</button>',
        )
        .join('') +
      '</div>' +
      subhead('Wheels and drivetrain') +
      wrap(
        button(
          'wheels',
          d.wheels === 'graphite' ? 'Graphite rims fitted ✓' : 'Graphite rims · $30',
          'graphite',
          d.wheels === 'graphite' || data.money < 30,
        ) +
          (d.wheels !== 'factory'
            ? button('wheels', 'Restore factory rims · Free', 'factory')
            : '') +
          button(
            'tune',
            d.tuned ? 'Touring tune fitted ✓' : 'Touring tune · $65',
            '',
            d.tuned || data.money < 65,
          ),
      )
    return html
  }
  function inventoryPanel(isShop) {
    const items = (isShop ? data.shop : data.inventory) || []
    return (
      '<p class="balance">Available funds &nbsp; ' +
      money(data.money) +
      '</p>' +
      (items.length
        ? items
            .map((item) => {
              const id = esc(item.id)
              let buttons = ''
              if (isShop)
                buttons =
                  '<button class="item-button main" data-buy="' +
                  id +
                  '"' +
                  (item.owned || data.money < item.price ? ' disabled' : '') +
                  '>' +
                  (item.owned ? 'Owned' : money(item.price)) +
                  '</button>'
              else {
                if (item.usable)
                  buttons +=
                    '<button class="item-button" data-use="' +
                    id +
                    '">' +
                    esc(item.useLabel || 'Use') +
                    '</button>'
                if (item.droppable)
                  buttons += '<button class="item-button" data-drop="' + id + '">Drop</button>'
              }
              return (
                '<div class="list-item"><div><div class="item-name">' +
                esc(item.name || item.id) +
                (isShop
                  ? ''
                  : '<span class="item-count">×' + integer(item.quantity, 1) + '</span>') +
                '</div><div class="item-desc">' +
                esc(item.description || '') +
                '</div></div><div class="item-actions">' +
                buttons +
                '</div></div>'
              )
            })
            .join('')
        : '<p class="panel-note">' +
          (isShop ? 'The vendor has no stock available.' : 'Your pack is empty.') +
          '</p>')
    )
  }
  function renderPanel() {
    let html = ''
    const dialogue = data.dialog || {}
    setText('sheet-title', view === 'dialog' ? dialogue.name || 'Conversation' : titles[view])
    setText(
      'sheet-kicker',
      view === 'map'
        ? 'Briar County · Navigation'
        : view === 'dialog'
          ? 'Conversation'
          : 'GCA: Grand City Adventures',
    )
    switch (view) {
      case 'recovery':
        setText('sheet-title', data.outcome === 'arrest' ? 'Under arrest' : 'You’re down')
        html = '<p class="dialogue-copy">' +
          (data.outcome === 'arrest' ? 'County patrol has taken you into custody.' : 'County rescue is taking you home.') +
          ' Return to Cedar House with full health. County fee · ' +
          money(Math.min(data.money, data.outcome === 'arrest' ? 25 : 15)) + '</p>' +
          rowButton('data-action="recover"', 'Return to Cedar House', 'main')
        break
      case 'outfitters':
        html = '<p class="outfitter-wallet">Available funds <b>' + money(data.money) + '</b></p>' +
          (data.outfitters || []).map(w => {
            const disabled = w.owned ? w.reserve > 240 - w.ammo || data.money < w.cost : data.money < w.price
            const action = 'data-outfit="' + w.id + '" data-ammo="' + w.owned + '"' + (disabled ? ' disabled' : '')
            return '<section class="outfitter-item"><h3>' + esc(w.name) + '</h3><p>' +
              w.damage + ' damage · ' + w.capacity + ' round magazine · ' +
              (1 / w.interval).toFixed(1) + ' shots/s · ' + (w.spread < 0.02 ? 'Tight' : w.spread > 0.03 ? 'Wide' : 'Medium') +
              ' spread</p>' + rowButton(action, w.owned ? w.reserve > 240 - w.ammo ? 'Reserve full' :
                '+' + w.ammo + ' reserve rounds · ' + money(w.cost) : 'Purchase · ' + money(w.price)) + '</section>'
          }).join('')
        break
      case 'pause':
        html =
          '<div class="pause-list">' +
          rowButton('data-action="resume"', 'Resume', 'main') +
          rowButton('data-action="save"', 'Save Game') +
          rowButton('data-action="load"' + (data.hasSave ? '' : ' disabled'), 'Load Game') +
          rowButton('data-panel="settings"', 'Settings') +
          rowButton('data-panel="controls"', 'Controls') +
          rowButton('data-action="menu"', 'Return to Main Menu') +
          '</div>'
        break
      case 'settings':
        html = settingsPanel() + (activeTab === 'Audio'
          ? rowButton('data-action="controllerSpeaker"', call('speakerEnabled')
            ? 'Turn off controller car audio' : 'Play car audio on controller speaker')
          : '') + (origin === 'menu'
          ? rowButton('data-action="exportJourney"', 'Export Saved Journey') +
            rowButton('data-action="importJourney"', 'Import Saved Journey')
          : '')
        break
      case 'dealership':
        html = showroom()
        break
      case 'controls':
        html =
          '<div class="control-cols"><div>' +
          controlGroup('On foot') +
          controlGroup('Hardcore') +
          '</div><div>' +
          controlGroup('Driving') +
          controlGroup('Navigation') +
          controlGroup('Controller') +
          '</div></div>'
        break
      case 'credits':
        html =
          '<p class="credit-line"><strong>GCA: Grand City Adventures</strong>A single-player driving and exploration game set in the fictional Pacific Northwest county of Briar.</p><p class="credit-line"><strong>World and vehicles</strong>GCA architecture, terrain and sound. Vehicle and district models adapted from tevy. Environmental photography and rock scans from Poly Haven. Original generated title artwork.</p><p class="credit-line"><strong>Characters</strong>Rigged character assets adapted from Microsoft. Model and software license notices accompany the source project.</p><p class="credit-line"><strong>Technology</strong>Three.js and WebGL 2. Barlow Condensed and DM Sans are distributed under the SIL Open Font License.</p>'
        break
      case 'map':
        html =
          '<div class="full-map"><canvas id="full-map" aria-label="Interactive county map. Click to mark a waypoint."></canvas><span class="atlas-north">N ↑</span><div class="map-zoom"><button data-zoom="out" aria-label="Zoom out">−</button><button data-zoom="in" aria-label="Zoom in">+</button><button data-zoom="fit" aria-label="Fit county" title="Fit county">↺</button></div></div><div class="map-legend"><span><i class="legend-pip"></i> You</span><span><i class="legend-pip orange"></i> Objective</span><span><i class="legend-pip blue"></i> Waypoint</span>' + (data.mode === 'hardcore' ? '<span><i class="legend-pip police"></i> Police</span><span><i class="legend-pip suspect"></i> Reckless pedestrian</span>' : '') + '<button id="clear-waypoint" class="item-button" data-action="clearWaypoint">Clear waypoint</button></div><p class="map-caption">Click the map to mark a waypoint. Scroll to zoom.</p>'
        if (data.mode === 'hardcore')
          html += '<div class="shop-routes">' + data.shops.map((s, i) =>
            rowButton('data-shop-route="' + i + '"', 'Route to ' + s.name)).join('') + '</div>'
        break
      case 'objectives':
        html = objectivesPanel()
        break
      case 'shop':
      case 'inventory':
        html = inventoryPanel(view === 'shop')
        break
      case 'dialog':
        html =
          '<p class="dialogue-copy">' +
          esc(dialogue.text) +
          '</p>' +
          (dialogue.choices || [])
            .map(
              (c) =>
                '<button class="dialog-choice" data-dialog="' +
                esc(c.id) +
                '">' +
                esc(c.label) +
                icon('arrowRight') +
                '</button>',
            )
            .join('')
        break
    }
    panelSignature = JSON.stringify([data.money, data[view]])
    const active = document.activeElement
    const focusKey = body.contains(active) && active.matches('[data-pad-focus]') &&
      Object.entries(active.dataset).find(([key]) => key !== 'padFocus')
    body.innerHTML = html
    if (focusKey) {
      const [key, value] = focusKey
      const target = Array.from(body.querySelectorAll('button, select, input'))
        .find(el => !el.disabled && el.dataset[key] === value && (!active.id || active.id === el.id))
      if (target) focusWithPad(target)
    }
    if (view === 'map') {
      body.querySelector('.map-caption').textContent =
        'Click to set a waypoint. Drag to pan and scroll to zoom.'
      drawFullMap()
    }
  }
  function panel(name, values = {}) {
    if (!titles[name]) return
    if (view === 'menu') origin = 'menu'
    else if (view === 'hud' || name === 'pause') origin = 'game'
    if (name === 'map' && view !== name) {
      mapCenter = null
      mapZoom = 1
    }
    merge(values)
    setView(name)
    renderPanel()
    body.scrollTop = 0
  }
  function zoomMap(amount, point) {
    const next = Math.max(1, Math.min(5, mapZoom * amount))
    if (next === mapZoom) return
    const c = $('full-map'),
      mid = cartography.at(c, c.clientWidth / 2, c.clientHeight / 2)
    if (point && mid) {
      const f = mapZoom / next
      mapCenter = { x: point.x + (mid.x - point.x) * f, z: point.z + (mid.z - point.z) * f }
    }
    mapZoom = next
    drawFullMap()
  }
  const listeners = []
  function on(target, event, handler, options) {
    target.addEventListener(event, handler, options)
    listeners.push(() => target.removeEventListener(event, handler, options))
  }
  on(root, 'click', (event) => {
    if (event.target.id === 'full-map') {
      if (dragged) {
        dragged = false
        return
      }
      const rect = event.target.getBoundingClientRect(),
        point = cartography.at(event.target, event.clientX - rect.left, event.clientY - rect.top)
      if (point && (Math.abs(point.x) > 659 || point.z < -689 || point.z > 469)) {
        toast('That point is outside Briar County.')
        return
      }
      if (point) {
        data.waypoint = point
        call('mapWaypoint', point.x, point.z)
        drawFullMap()
      }
      return
    }
    const btn = event.target.closest('button')
    if (!btn || btn.disabled) return
    const d = btn.dataset
    if (d.mode) return call('selectMode', d.mode)
    if (d.outfit) return call('outfit', d.outfit, d.ammo === 'true')
    if (d.shopRoute != null) return call('guideShop', Number(d.shopRoute))
    if (d.panel) return call('open', d.panel)
    if (d.buy != null) return call('buy', d.buy)
    if (d.use != null) return call('use', d.use)
    if (d.drop != null) return call('drop', d.drop)
    if (d.dialog != null) return call('dialog', d.dialog)
    if (d.dealer) return call('dealer', d.dealer, d.value)
    if (d.activity) return call('activity', d.activity, d.site)
    if (d.tab) {
      activeTab = d.tab
      renderPanel()
      return
    }
    if (d.setting) {
      const val = btn.getAttribute('aria-checked') !== 'true'
      btn.setAttribute('aria-checked', String(val))
      changeSetting(d.setting, val)
      return
    }
    if (d.zoom) {
      if (d.zoom === 'fit') {
        mapZoom = 1
        mapCenter = null
        drawFullMap()
      } else zoomMap(d.zoom === 'in' ? 1.4 : 1 / 1.4)
      return
    }
    if (d.action === 'clearWaypoint') {
      data.waypoint = null
      call('mapWaypoint', null, null)
      drawFullMap()
      return
    }
    if (d.action === 'sound') {
      const current = valueOf('volume')
      if (current > 0) lastVolume = current
      changeSetting('volume', current > 0 ? 0 : lastVolume || 0.65)
      return
    }
    if (d.action === 'fullscreen') {
      const job = document.fullscreenElement
        ? document.exitFullscreen?.()
        : document.documentElement.requestFullscreen?.()
      if (job) job.catch(() => toast('Fullscreen is unavailable in this browser window.'))
      return
    }
    if (d.action === 'controllerSpeaker') {
      if (btn.disabled) return
      btn.disabled = true
      Promise.resolve(call('controllerSpeaker')).finally(() => {
        if (view === 'settings') renderPanel()
      })
      return
    }
    if (d.action) call(d.action)
  })
  on(root, 'input', (event) => {
    const el = event.target
    if (!(el instanceof HTMLInputElement) || !el.dataset.setting) return
    const s = groups[activeTab]?.find((item) => item.key === el.dataset.setting)
    if (!s) return
    const v = Number(el.value)
    el.parentElement.querySelector('output').textContent = formatSetting(s, v)
    changeSetting(s.key, v)
  })
  on(root, 'change', (event) => {
    const el = event.target
    if (!(el instanceof HTMLSelectElement) || !el.dataset.setting) return
    changeSetting(el.dataset.setting, el.value)
    if (el.dataset.setting === 'quality') renderPanel()
  })
  on(
    body,
    'wheel',
    (event) => {
      if (event.target.id !== 'full-map') return
      event.preventDefault()
      const rect = event.target.getBoundingClientRect(),
        point = cartography.at(event.target, event.clientX - rect.left, event.clientY - rect.top)
      zoomMap(event.deltaY < 0 ? 1.2 : 1 / 1.2, point)
    },
    { passive: false },
  )
  on(body, 'pointerdown', (event) => {
    const c = event.target
    if (c.id !== 'full-map' || event.button !== 0) return
    const r = c.getBoundingClientRect()
    dragged = false
    drag = {
      x: event.clientX,
      y: event.clientY,
      world: cartography.at(c, event.clientX - r.left, event.clientY - r.top),
    }
    c.setPointerCapture(event.pointerId)
  })
  on(body, 'pointermove', (event) => {
    const c = event.target
    if (!drag || c.id !== 'full-map') return
    if (!dragged && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return
    const r = c.getBoundingClientRect(),
      p = cartography.at(c, event.clientX - r.left, event.clientY - r.top),
      mid = cartography.at(c, c.clientWidth / 2, c.clientHeight / 2)
    mapCenter = {
      x: Math.max(-659, Math.min(659, mid.x + drag.world.x - p.x)),
      z: Math.max(-689, Math.min(469, mid.z + drag.world.z - p.z)),
    }
    dragged = true
    drawFullMap()
  })
  on(body, 'pointerup', () => {
    drag = null
  })
  on(body, 'pointercancel', () => {
    drag = null
    dragged = false
  })
  on(document, 'keydown', (event) => {
    if (view !== 'menu' || !['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return
    const list = Array.from(root.querySelectorAll('.menu-nav button:not(:disabled)')),
      i = list.indexOf(document.activeElement)
    if (event.key === 'Enter' && document.activeElement instanceof HTMLButtonElement) return
    event.preventDefault()
    if (event.key === 'Enter') list[0]?.click()
    else
      list[
        i < 0
          ? event.key === 'ArrowDown'
            ? 0
            : list.length - 1
          : (i + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
      ]?.focus()
  })
  on(window, 'resize', () => {
    if (view === 'map') drawFullMap()
    if (view === 'menu') cartography.draw($('overview-map'), data, 'overview')
  })
  function focusWithPad(el) {
    root.querySelector('[data-pad-focus]')?.removeAttribute('data-pad-focus')
    el.setAttribute('data-pad-focus', '')
    el.focus()
  }
  return {
    cinematic: () => setView('arrestScene'),
    menuInput(code) {
      if (!['Confirm', 'Up', 'Down', 'Left', 'Right'].includes(code)) return
      const panel = view === 'menu' ? root.querySelector('.menu-nav') : body
      const items = [...panel.querySelectorAll('button:enabled, input:enabled, select:enabled')]
        .filter(el => el.getClientRects().length)
      if (view === 'menu') items.push(...root.querySelectorAll('#menu-screen .tools button:enabled'))
      const forward = code === 'Down' || code === 'Right'
      const step = forward ? 1 : -1
      if (!items.length) {
        if (code !== 'Confirm') body.scrollBy(0, step * body.clientHeight * 0.65)
        return
      }
      const i = items.indexOf(document.activeElement)
      const item = items[i]
      if (code === 'Confirm') {
        const choice = item || items[0]
        focusWithPad(choice)
        if (choice instanceof HTMLButtonElement) choice.click()
        return
      }
      if (item && (code === 'Left' || code === 'Right')) {
        if (item instanceof HTMLSelectElement) {
          item.selectedIndex = Math.max(0, Math.min(item.length - 1, item.selectedIndex + step))
          item.dispatchEvent(new Event('change', { bubbles: true }))
          return
        }
        if (item.type === 'range') {
          if (forward) item.stepUp()
          else item.stepDown()
          item.dispatchEvent(new Event('input', { bubbles: true }))
          return
        }
      }
      const next = i < 0 ? (forward ? 0 : items.length - 1) : (i + step + items.length) % items.length
      focusWithPad(items[next])
    },
    loading,
    menu,
    hud,
    update,
    panel,
    toast,
    get view() {
      return view
    },
    destroy() {
      listeners.forEach((remove) => remove())
      clearTimeout(noticeTimer)
    },
  }
}
