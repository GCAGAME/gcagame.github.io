// Standard Gamepad API layout, shared by DualShock 4 and Xbox-style pads.
const buttons = [
  'Space', 'KeyF', 'KeyE', 'KeyV', 'ShiftLeft', 'KeyH', 'KeyS', 'KeyW',
  'KeyM', 'Escape', null, null, 'Tab', 'KeyU', 'KeyL', 'KeyI',
]

function stick(value = 0) {
  return Math.sign(value) * Math.max(0, (Math.abs(value) - 0.18) / 0.82)
}

export function createGamepad() {
  let index = -1, previous = new Set(), motor = null, nextPulse = 0, vibrating = false
  let denied = false
  const state = { held: new Set(), lookX: 0, lookY: 0 }

  function quiet() {
    if (vibrating) motor?.reset?.()?.catch(() => {})
    vibrating = false
    nextPulse = 0
  }

  function poll(focused, onPress) {
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
    if (pad) {
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
    if (!changed) for (const key of held) if (!previous.has(key)) onPress(key)
    previous.clear()
    for (const key of held) previous.add(key)
    return state
  }

  function drive(now, car, beforeSpeed, dt, impact, enabled) {
    if (!enabled || !car || !motor?.playEffect) return quiet()
    if (!impact && now < nextPulse) return
    const speed = Math.abs(car.speed)
    const revs = Math.min(1, speed / (15 * Math.max(1, Number(car.gear) || 1)))
    const acceleration = Math.min(1, Math.max(0, speed - beforeSpeed) / (dt * 6))
    const severity = Math.min(1, beforeSpeed / 20)
    const duration = impact ? 150 + 110 * severity : 145
    const strongMagnitude = impact ? 0.48 + 0.52 * severity : 0.06 + acceleration * 0.34
    const weakMagnitude = impact ? 0.36 + 0.60 * severity : 0.10 + revs * 0.32
    const actuator = motor
    vibrating = true
    nextPulse = now + (impact ? duration : 110)
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
