import * as THREE from 'three'
import { posePerson } from './people.js'

const smooth = THREE.MathUtils.smoothstep
const v = () => new THREE.Vector3()
const pos = bone => bone.getWorldPosition(v())
const wrist = (model, side, joint) => model.character.getObjectByName('Bip01_' + side + '_' + joint)

// Rotate each joint in its parent's coordinate system, keeping the authored
// bone lengths. The pole picks the natural outward bend of the elbow.
function aim(bone, child, target) {
  const base = pos(bone), inv = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
  const a = pos(child).sub(base).normalize().applyQuaternion(inv)
  const b = target.clone().sub(base).normalize().applyQuaternion(inv)
  bone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(a, b))
  bone.updateWorldMatrix(false, true)
}
function reach(model, side, target, weight, pole) {
  if (weight <= 0) return
  const shoulder = wrist(model, side, 'UpperArm'), elbow = wrist(model, side, 'Forearm'), hand = wrist(model, side, 'Hand')
  const origin = pos(shoulder), mid = pos(elbow), end = pos(hand)
  const a = mid.distanceTo(origin), b = end.distanceTo(mid)
  const restShoulder = shoulder.quaternion.clone(), restElbow = elbow.quaternion.clone()
  const direction = target.clone().sub(origin)
  const d = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + .001, a + b - .001)
  direction.normalize()
  const along = (a*a + d*d - b*b) / (2*d)
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction)).normalize()
  aim(shoulder, elbow, origin.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a*a-along*along))))
  aim(elbow, hand, origin.addScaledVector(direction, d))
  if (weight < 1) {
    shoulder.quaternion.slerp(restShoulder,1-weight)
    elbow.quaternion.slerp(restElbow,1-weight)
    shoulder.updateWorldMatrix(false,true)
  }
}

export function createArrestCinematic(scene) {
  const group = new THREE.Group()
  group.name = 'County arrest lighting and cuffs'
  const metal = new THREE.MeshStandardMaterial({ color: 0xedf3fa, metalness: .68, roughness: .24, emissive: 0x263341 })
  const rings = ['L','R'].map(side => {
    const mount = new THREE.Group()
    mount.name = side + ' wrist cuff'
    const fixed = new THREE.Mesh(new THREE.TorusGeometry(.045, .009, 8, 24, Math.PI), metal)
    const pivot = new THREE.Group()
    pivot.position.x = -.045
    const jaw = fixed.clone()
    jaw.rotation.z = Math.PI
    jaw.position.x = .045
    pivot.add(jaw)
    const lock = new THREE.Mesh(new THREE.BoxGeometry(.023,.029,.021),metal)
    lock.position.x = .044
    mount.add(fixed, pivot, lock)
    group.add(mount)
    return { mount, pivot }
  })
  const links = Array.from({ length: 6 }, () => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(.011,.0035,6,12), metal)
    group.add(mesh)
    return mesh
  })
  const halo = haloTexture()
  const lights = [0x426fff,0xff4c45].map(color => {
    const lamp = new THREE.PointLight(color, 0, 18)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: halo, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }))
    glow.scale.setScalar(.9)
    lamp.add(glow)
    group.add(lamp)
    return lamp
  })
  let corrections = []
  function restorePose() {
    for (const [bone,q] of corrections) bone.quaternion.copy(q)
    corrections = []
  }
  function light(cruiser, center, facing, t) {
    if (!group.parent) scene.add(group)
    const back = v().set(Math.sin(facing),0,Math.cos(facing))
    const right = v().set(Math.cos(facing),0,-Math.sin(facing))
    const base = cruiser ? cruiser.model.group.position : center.clone().addScaledVector(back, 4)
    lights.forEach((lamp,i) => {
      const pulse = .5 + .5 * Math.cos(t * 5 + i*Math.PI)
      lamp.position.copy(base).addScaledVector(cruiser ? v().set(Math.cos(cruiser.yaw),0,-Math.sin(cruiser.yaw)) : right, (i ? 1 : -1)*(cruiser ? .25 : 1.5))
      lamp.position.y += cruiser ? cruiser.spec.roof + .13 : 1.8
      lamp.intensity = (cruiser ? 35 : 13) * (.24 + .76*pulse)
      lamp.children[0].visible = !!cruiser
      lamp.children[0].material.opacity = .22 + .62*pulse
    })
  }
  function frame(avatar, officer, facing, t, dt) {
    const back = v().set(Math.sin(facing),0,Math.cos(facing))
    const right = v().set(Math.cos(facing),0,-Math.sin(facing))
    const center = avatar.group.position.clone().addScaledVector(back,.25)
    center.y += .99
    const at = [-1,1].map(sign => center.clone().addScaledVector(right,sign*.083))
    posePerson(avatar, dt, 0, { look: true })
    if (!avatar.ready || !officer.model.ready) {
      for (const {mount} of rings) mount.visible = false
      for (const link of links) link.visible = false
      return center
    }
    for (const model of [avatar, officer.model]) {
      model.group.updateWorldMatrix(true,true)
      for (const side of ['L','R']) for (const joint of ['UpperArm','Forearm']) {
        const bone = wrist(model, side, joint)
        corrections.push([bone,bone.quaternion.clone()])
      }
    }
    const anchors = []
    for (const [i,side] of ['L','R'].entries()) {
      const sign = i ? 1 : -1
      // The rigs face local -Z; the left wrist lies on the player's local -X side.
      reach(avatar, side, at[i], smooth(t,.55,1.85), right.clone().multiplyScalar(sign).setY(-.45))
      const hand = pos(wrist(avatar,side,'Hand')), forearm = pos(wrist(avatar,side,'Forearm'))
      const anchor = hand.clone().lerp(forearm,.12)
      anchors.push(anchor)
      const lockAt = 2.45 + i*.63
      const copHand = wrist(officer.model,side,'Hand')
      reach(officer.model, side, anchor, smooth(t,1.35,lockAt)*(1-smooth(t,lockAt+.37,lockAt+.84)),right.clone().multiplyScalar(sign).setY(-.55))
      const {mount,pivot} = rings[i]
      mount.visible = t > 1.85 + i*.35
      mount.position.copy(pos(copHand)).lerp(anchor,smooth(t,lockAt-.42,lockAt))
      mount.quaternion.setFromUnitVectors(v().set(0,0,1),forearm.sub(hand).normalize())
      pivot.rotation.z = -.98*(1-smooth(t,lockAt,lockAt+.33))
    }
    links.forEach((link,i) => {
      link.visible = t >= 3.4
      if (!link.visible) return
      const a=rings[0].mount.position, b=rings[1].mount.position, k=(i+.5)/links.length
      link.position.copy(a).lerp(b,k)
      link.position.y -= .014*Math.sin(k*Math.PI)
      link.quaternion.setFromUnitVectors(v().set(1,0,0),b.clone().sub(a).normalize())
      link.rotateX(i%2 ? .95 : .12)
      link.scale.x = Math.max(.9,a.distanceTo(b)/links.length/.021)
    })
    return anchors[0].lerp(anchors[1],.5)
  }
  function end() {
    restorePose()
    for (const {mount} of rings) mount.visible = false
    for (const link of links) link.visible = false
    group.removeFromParent()
  }
  return { frame, light, restorePose, end }
}

function haloTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(32,32,0,32,32,32)
  for (const [at,alpha] of [[0,1],[.12,.95],[.35,.3],[1,0]]) g.addColorStop(at,'rgba(255,255,255,'+alpha+')')
  ctx.fillStyle = g
  ctx.fillRect(0,0,64,64)
  return new THREE.CanvasTexture(canvas)
}
