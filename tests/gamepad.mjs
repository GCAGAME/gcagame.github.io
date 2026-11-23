import assert from 'node:assert/strict'
import { createGamepad, drivingRumble } from '../src/gamepad.js'

const effects = []
const pad = {
  index: 0, mapping: 'standard', connected: true, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
  vibrationActuator: {
    async playEffect(type, params) { effects.push(params) },
    async reset() { effects.push('reset') },
  },
}
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true })
const gamepad = createGamepad()
const presses = []
const poll = (menu = false, now = 0) => gamepad.poll(true, key => presses.push(key), menu, now)
poll()
for (const [index, key] of [[0, 'KeyE'], [1, 'Escape'], [2, 'Space'], [3, 'KeyV'],
  [12, 'Tab'], [13, 'KeyU'], [14, 'KeyL'], [15, 'KeyI']]) {
  pad.buttons[index].pressed = true
  poll()
  poll()
  pad.buttons[index].pressed = false
  poll()
  assert.deepEqual(presses.splice(0), [key])
}
poll(true)
pad.axes[0] = 1
for (const time of [0, 10, 419, 421]) poll(true, time)
assert.deepEqual(presses.splice(0), ['Right', 'Right'])
pad.axes[0] = 0
poll(true)
pad.buttons[12].pressed = true
poll(true)
assert.deepEqual(presses, ['Up'])

const coast = { longitudinalG: 0, lateralG: 0, wheelTorqueNm: 0 }
const idle = drivingRumble(coast)
assert(idle.strongMagnitude > 0 && idle.strongMagnitude < 0.04)
assert(idle.weakMagnitude > 0 && idle.weakMagnitude < 0.04)
assert.deepEqual(drivingRumble({ ...coast, speed: 30, gear: 4 }), idle)
const braking = drivingRumble({ ...coast, longitudinalG: -0.75 })
const corner = drivingRumble({ ...coast, lateralG: 0.75 })
const torque = drivingRumble({ ...coast, wheelTorqueNm: 2800 })
assert.deepEqual(corner, braking)
assert(braking.strongMagnitude > torque.strongMagnitude)
assert(torque.weakMagnitude > braking.weakMagnitude)
assert(braking.period < idle.period && torque.period < idle.period)
assert.deepEqual(drivingRumble({ ...coast, wheelTorqueNm: -2800 }), torque)
const limit = drivingRumble({ longitudinalG: 100, lateralG: 100, wheelTorqueNm: 20000 })
assert(limit.strongMagnitude <= 1 && limit.weakMagnitude <= 1 && limit.duration > 0)

const drive = (time, impactG = 0, enabled = true) => gamepad.drive(time, coast, impactG, enabled)
drive(0)
assert.equal(effects.at(-1).weakMagnitude, idle.weakMagnitude)
drive(10)
assert.equal(effects.length, 1)
drive(170)
assert.equal(effects.length, 2)
drive(200, 21)
assert.equal(effects.at(-1).strongMagnitude, 1)
assert.equal(effects.at(-1).weakMagnitude, 1)
drive(343)
assert(effects.at(-1).strongMagnitude > idle.strongMagnitude && effects.at(-1).strongMagnitude < 1)
drive(561)
assert.equal(effects.at(-1).strongMagnitude, idle.strongMagnitude)
drive(600, 0, false)
assert.equal(effects.at(-1), 'reset')
console.log('Passed controller layout, navigation, idle rumble, G-force, wheel torque, pulse timing, and impact decay.')
