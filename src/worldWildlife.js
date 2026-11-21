import * as THREE from 'three'

// Instanced bodies, legs and wings let the whole herd and flock share five
// draw calls. A nearby observer causes the deer to leave their grazing patch.
export function addWildlife({ scene, dynamic, height, observer, random }) {
  const gl = new THREE.IcosahedronGeometry(1, 1),
    hoof = new THREE.CylinderGeometry(1, 1, 1, 5)
  const herd = []
  for (const [x, z] of [
    [-135, 25],
    [-140, 22],
    [-133, 18],
    [-221, -62],
    [-227, -65],
    [35, -281],
    [29, -284],
  ])
    herd.push({
      x,
      z,
      homeX: x,
      homeZ: z,
      yaw: random() * 6.28,
      clock: random() * 6.28,
      age: random() * 25,
      scale: 0.81 + random() * 0.26,
    })
  function batch(g, color, count) {
    const mesh = new THREE.InstancedMesh(
      g,
      new THREE.MeshStandardMaterial({ color, roughness: 0.93 }),
      count,
    )
    mesh.frustumCulled = false
    scene.add(mesh)
    return mesh
  }
  const fur = batch(gl, 0x927457, herd.length * 6),
    legs = batch(hoof, 0x705c48, herd.length * 8),
    tail = batch(gl, 0xc3b59b, herd.length)
  const dummy = new THREE.Object3D(),
    up = new THREE.Vector3(0, 1, 0),
    stepDirection = new THREE.Vector3()
  let fi = 0,
    li = 0
  function updateDeer(dt) {
    fi = 0
    li = 0
    for (const [i, d] of herd.entries()) {
      const dist = Math.hypot(observer.x - d.x, observer.z - d.z)
      d.age += dt
      const flee = dist < 22,
        roam = Math.sin(d.age * 0.19 + i * 0.79) > 0.48
      const dir = flee
        ? Math.atan2(d.x - observer.x, d.z - observer.z)
        : Math.atan2(
            d.homeX + Math.sin(d.age * 0.036 + i) * 9 - d.x,
            d.homeZ + Math.cos(d.age * 0.042 + i) * 7 - d.z,
          )
      if (flee || roam)
        d.yaw +=
          Math.atan2(Math.sin(dir - d.yaw), Math.cos(dir - d.yaw)) *
          Math.min(1, dt * (flee ? 4 : 1))
      const stride = flee ? 3.5 : roam ? 0.41 : 0
      d.x += Math.sin(d.yaw) * stride * dt
      d.z += Math.cos(d.yaw) * stride * dt
      d.clock += dt * (flee ? 9 : roam ? 3.1 : 0.3)
      const base = height(d.x, d.z),
        cs = Math.cos(d.yaw),
        sn = Math.sin(d.yaw),
        s = d.scale
      function p(x, y, z) {
        return new THREE.Vector3(
          d.x + (x * cs + z * sn) * s,
          base + y * s,
          d.z + (z * cs - x * sn) * s,
        )
      }
      function oval(mesh, index, pos, sx, sy, sz, tilt = 0) {
        dummy.position.copy(pos)
        dummy.rotation.set(0, d.yaw, 0)
        dummy.rotateX(tilt)
        dummy.scale.set(sx * s, sy * s, sz * s)
        dummy.updateMatrix()
        mesh.setMatrixAt(index, dummy.matrix)
      }
      function limb(a, b, r) {
        stepDirection.copy(b).sub(a)
        dummy.position.copy(a).addScaledVector(stepDirection, 0.5)
        dummy.scale.set(r * s, stepDirection.length(), r * s)
        dummy.quaternion.setFromUnitVectors(up, stepDirection.normalize())
        dummy.updateMatrix()
        legs.setMatrixAt(li++, dummy.matrix)
      }
      const grazing = flee ? 0 : (0.5 + 0.5 * Math.sin(d.age * 0.58 + i)) * (roam ? 0.22 : 1)
      oval(fur, fi++, p(0, 0.99, 0), 0.23, 0.29, 0.58)
      oval(
        fur,
        fi++,
        p(0, 1.25 - grazing * 0.27, 0.46 + grazing * 0.06),
        0.145,
        0.34,
        0.15,
        0.62 + grazing * 0.67,
      )
      oval(
        fur,
        fi++,
        p(0, 1.48 - grazing * 0.53, 0.69 + grazing * 0.12),
        0.145,
        0.145,
        0.215,
        0.12 + grazing * 0.65,
      )
      oval(
        fur,
        fi++,
        p(0, 1.41 - grazing * 0.54, 0.85 + grazing * 0.13),
        0.09,
        0.095,
        0.155,
        0.17 + grazing * 0.6,
      )
      for (const sign of [-1, 1])
        oval(
          fur,
          fi++,
          p(sign * 0.11, 1.67 - grazing * 0.5, 0.62 + grazing * 0.13),
          0.055,
          0.13,
          0.064,
          -0.59,
        )
      oval(tail, i, p(0, 1.08, -0.51), 0.094, 0.13, 0.1, -0.5)
      for (const side of [-1, 1])
        for (const fore of [-1, 1]) {
          const cycle = Math.sin(d.clock + (side * fore < 0 ? Math.PI : 0)),
            swing = stride ? cycle * (flee ? 0.23 : 0.09) : 0
          const x = 0.131 * side,
            z = fore * 0.36
          const hip = p(x, 0.91, z),
            joint = p(x, 0.45, z + swing * 0.44 - fore * 0.047),
            foot = p(x, 0.035 + Math.max(0, swing) * 0.44, z + swing)
          limb(hip, joint, 0.048)
          limb(joint, foot, 0.031)
        }
    }
    for (const b of [fur, legs, tail]) b.instanceMatrix.needsUpdate = true
  }
  const wings = new THREE.BufferGeometry()
  wings.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0.18, 0, 0, -0.15, 0.58, 0.09, -0.06, 0.58, 0.09, -0.06, 0, 0, -0.15, 0.85, 0.12,
        -0.21,
      ],
      3,
    ),
  )
  wings.computeVertexNormals()
  const birds = new THREE.InstancedMesh(
    wings,
    new THREE.MeshLambertMaterial({ color: 0x52554d, side: THREE.DoubleSide }),
    24,
  )
  birds.frustumCulled = false
  scene.add(birds)
  let time = 0
  function flock(dt) {
    time += dt
    for (let i = 0; i < 12; i++) {
      const theta = time * 0.075 + i * 0.47,
        cx = i < 7 ? 86 : -108,
        cz = i < 7 ? -134 : 19
      const x = cx + Math.cos(theta) * 21 + i * 0.65,
        z = cz + Math.sin(theta) * 13 + i * 0.55
      const y = 12 + (i % 4) * 1.7 + Math.sin(theta * 2.7) * 1.5,
        yaw = Math.atan2(-Math.sin(theta) * 21, Math.cos(theta) * 13)
      for (let j = 0; j < 2; j++) {
        const side = j ? 1 : -1
        dummy.position.set(x, y, z)
        dummy.rotation.set(0, yaw, 0)
        dummy.rotateZ(side * (0.12 + Math.sin(time * 4.5 + i) * 0.31))
        dummy.scale.set(side * 0.52, 0.52, 0.52)
        dummy.updateMatrix()
        birds.setMatrixAt(i * 2 + j, dummy.matrix)
      }
    }
    birds.instanceMatrix.needsUpdate = true
  }
  updateDeer(0)
  flock(0)
  let tick = 0
  dynamic.push((dt) => {
    tick += dt
    if (tick > 0.065) {
      updateDeer(tick)
      flock(tick)
      tick = 0
    }
  })
}
