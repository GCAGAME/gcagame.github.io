import assert from 'node:assert/strict'
import { createGamepad } from '../src/gamepad.js'

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

const drive = (time, speed, impact = 0) => gamepad.drive(time, { speed, gear: 1 }, speed, 1/60, impact, true)
drive(0, 0)
drive(300, -0.10)
assert.deepEqual(effects, [])
drive(500, 4)
drive(510, 0)
assert.equal(effects.at(-1), 'reset')
drive(600, 0, 21)
assert.equal(effects.at(-1).strongMagnitude, 1)
assert.equal(effects.at(-1).weakMagnitude, 1)
drive(743, 0)
assert(effects.at(-1).strongMagnitude > 0 && effects.at(-1).strongMagnitude < 1)
drive(962, 0)
assert.equal(effects.at(-1), 'reset')
effects.length = 0
drive(1200, 0)
assert.deepEqual(effects, [])
console.log('Passed controller layout, menu directions and repeat, stopped rumble, and impact decay.')
