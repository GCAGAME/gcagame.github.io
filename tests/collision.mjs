import assert from 'node:assert/strict'
import {boxHull,hull,sweepHull,circleHits} from '../src/collision.js'

// Both endpoints clear a 4 cm wall. Only a swept test detects this impact.
const car=boxHull(0,0,2,4)
const wall=boxHull(0,-7,8,.04)
const hit=sweepHull(car,wall,0,-15)
assert(Math.abs(hit-(7-2-.02)/15)<1e-8)
assert.equal(sweepHull(car,wall,0,15),1)
assert.equal(sweepHull(car,boxHull(0,0,1,1),0,0),0)
assert.equal(sweepHull(car,boxHull(3,-5,1,2),0,-16),1)
const angled=boxHull(2,-6,1.8,4.7,.8)
assert(sweepHull(car,angled,1.5,-16)<1)
assert.equal(sweepHull(boxHull(0,-18,2,4),wall,0,22)<1,true)
const trunk=hull([[.2,0],[0,.2],[-.2,0],[0,-.2],[0,0]])
assert(circleHits(0,0,.02,trunk))
assert(!circleHits(1,0,.2,trunk))
assert(sweepHull(boxHull(-8,0,1.8,4.4,Math.PI/2),trunk,19,0)<1)
console.log('Passed thin wall, oblique vehicle, reverse impact, trunk, overlap and clear-path tests.')

