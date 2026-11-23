// Standard Gamepad API layout, shared by DualShock 4 and Xbox-style pads.
const buttons = [
  'KeyE', 'Escape', 'Space', 'KeyV', 'ShiftLeft', 'KeyH', 'KeyS', 'KeyW',
  'KeyM', 'Escape', 'ControlLeft', 'KeyF', 'Tab', 'KeyU', 'KeyL', 'KeyI',
]

function stick(value = 0) {
  return Math.sign(value) * Math.max(0, (Math.abs(value) - 0.18) / 0.82)
}

// Full-scale tuning points are 1.2 horizontal g and 4,500 N·m total wheel torque.
export function drivingRumble({ longitudinalG, lateralG, wheelTorqueNm }) {
  const load = Math.min(1, Math.hypot(longitudinalG, lateralG) / 1.2)
  const torque = Math.min(1, Math.abs(wheelTorqueNm) / 4500)
  const effort = Math.max(load, torque)
  const period = Math.round(170 - 90 * effort)
  return {
    strongMagnitude: 0.018 + 0.57 * load + 0.10 * torque,
    weakMagnitude: 0.025 + 0.10 * load + 0.48 * torque,
    period,
    // Overlap at idle for a steady hum; leave a short gap between pulses under load.
    duration: Math.round(period + 10 - 30 * effort),
  }
}

export function createGamepad() {
  let index = -1, previous = new Set(), motor = null, nextPulse = 0, vibrating = false
  let denied = false, inMenu = false, repeatAt = Infinity
  let impactAt = -Infinity, impactStrength = 0, aftershockPlayed = false
  const state = { held: new Set(), lookX: 0, lookY: 0 }

  function quiet() {
    if (vibrating) motor?.reset?.()?.catch(() => {})
    vibrating = false
    nextPulse = 0
    impactAt = -Infinity
  }

  function poll(focused, onPress, menu = false, now = performance.now()) {
    let pad
    if (focused && !denied) {
      try {
        const pads = Array.from(navigator.getGamepads?.() || [])
        const supported = p => p?.connected && p.mapping === 'standard'
        pad = supported(pads[index]) ? pads[index] : pads.find(supported)
      } catch (error) {
        if (error.name === 'SecurityError') denied = true
      }
    }
    const changed = (pad?.index ?? -1) !== index
    if (changed) {
      quiet()
      index = pad?.index ?? -1
      motor = pad?.vibrationActuator
    }
    const held = state.held
    held.clear()
    state.lookX = stick(pad?.axes[2])
    state.lookY = stick(pad?.axes[3])
    let navigation = null
    if (pad && menu) {
      const pressed = i => pad.buttons[i]?.pressed
      if (pressed(0)) held.add('Confirm')
      if (pressed(1) || pressed(9)) held.add('Escape')
      if (pressed(8)) held.add('KeyM')
      const [x, y] = pad.axes
      if (pressed(12)) navigation = 'Up'
      else if (pressed(13)) navigation = 'Down'
      else if (pressed(14)) navigation = 'Left'
      else if (pressed(15)) navigation = 'Right'
      else if (Math.max(Math.abs(x), Math.abs(y)) > 0.45) {
        navigation = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'Left' : 'Right') : (y < 0 ? 'Up' : 'Down')
      }
      if (navigation) held.add(navigation)
    } else if (pad) {
      buttons.forEach((key, i) => {
        if (key && pad.buttons[i]?.pressed) held.add(key)
      })
      const [x, y] = pad.axes
      if (x < -0.30) held.add('KeyA')
      if (x > 0.30) held.add('KeyD')
      if (y < -0.30) held.add('KeyW')
      if (y > 0.30) held.add('KeyS')
    }
    // Snapshot on connect and focus regain so held buttons cannot select a menu item.
    if (changed || menu !== inMenu) repeatAt = Infinity
    else {
      for (const key of held) {
        if (!previous.has(key)) {
          onPress(key)
          if (key === navigation) repeatAt = now + 420
        } else if (key === navigation && now >= repeatAt) {
          onPress(key)
          repeatAt = now + 165
        }
      }
    }
    inMenu = menu
    previous.clear()
    for (const key of held) previous.add(key)
    return state
  }

  function drive(now, car, impactG, enabled) {
    if (!enabled || !car || !motor?.playEffect) return quiet()
    let duration, strongMagnitude, weakMagnitude
    if (impactG > 0) {
      impactStrength = Math.min(1, impactG / 18)
      impactAt = now
      aftershockPlayed = false
      duration = 85 + 55 * impactStrength
      strongMagnitude = 0.48 + 0.52 * impactStrength
      weakMagnitude = 0.30 + 0.70 * impactStrength
    } else if (now - impactAt < 150 + 210 * impactStrength) {
      if (aftershockPlayed || now - impactAt < 85 + 55 * impactStrength) return
      aftershockPlayed = true
      duration = Math.max(1, 150 + 210 * impactStrength - (now - impactAt))
      strongMagnitude = 0.14 + 0.56 * impactStrength
      weakMagnitude = 0.08 + 0.23 * impactStrength
    } else {
      if (now < nextPulse) return
      const rumble = drivingRumble(car)
      duration = rumble.duration
      strongMagnitude = rumble.strongMagnitude
      weakMagnitude = rumble.weakMagnitude
      nextPulse = now + rumble.period
    }
    const actuator = motor
    vibrating = true
    actuator.playEffect('dual-rumble', { duration, strongMagnitude, weakMagnitude })
      .catch(() => {
        if (motor === actuator) {
          motor = null
          vibrating = false
        }
      })
  }

  return { poll, drive, quiet }
}
