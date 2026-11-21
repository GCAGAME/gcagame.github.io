import * as THREE from 'three'

// Each tree prototype shares one vertex-coloured mesh across its instances.
// Twigs and leaf clusters are modelled in tree space and keep their volume from above.
function prototype(kind, detailed) {
  let seed = (kind.endsWith('2') ? 7289 : 293) + (kind.startsWith('fir') ? 99 : 0)
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  const pos = [],
    cols = [],
    uv = [],
    bark = [],
    color = new THREE.Color(),
    v = (x, y, z) => new THREE.Vector3(x, y, z)
  let center = v(0, 0, 0),
    extent = 1
  function tri(a, b, c, shade, wood = false) {
    color.set(wood ? 0xe3dece : 0xf1eddb).multiplyScalar(0.76 + 0.27 * random() + 0.1 * a.y)
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z)
      cols.push(color.r, color.g, color.b)
      if (wood) uv.push(0.02 + 0.2 * (0.5 + 0.49 * Math.sin((p.x + p.z) * 42)), p.y * 3)
      else
        uv.push(
          0.62 + 0.36 * Math.max(-1, Math.min(1, (p.x - center.x) / extent)),
          0.5 + 0.49 * Math.max(-1, Math.min(1, (p.z - center.z) / extent)),
        )
      bark.push(+wood)
    }
  }
  function limb(a, b, r, t, n) {
    const axis = b.clone().sub(a).normalize(),
      u = v(1, 0, 0).cross(axis).normalize(),
      w = axis.clone().cross(u)
    const ring = (p, rad, k) =>
      p
        .clone()
        .addScaledVector(u, rad * Math.cos((k * 2 * Math.PI) / n))
        .addScaledVector(w, rad * Math.sin((k * 2 * Math.PI) / n))
    for (let k = 0; k < n; k++) {
      const p = ring(a, r, k),
        q = ring(a, r, k + 1),
        e = ring(b, t, k),
        f = ring(b, t, k + 1)
      tri(p, q, e, 0x746756, true)
      tri(e, q, f, 0x786b5b, true)
    }
  }
  const pine = kind.startsWith('fir'),
    trunk = pine ? 0.018 : 0.023
  limb(v(0, 0, 0), v(0.008, 0.99, 0), trunk, 0.003, detailed ? 9 : 6)
  const branches = pine ? (detailed ? 46 : 24) : detailed ? 26 : 14
  for (let i = 0; i < branches; i++) {
    const t = (i + 0.5) / branches,
      a = i * 2.39996 + random() * 0.5,
      h = (pine ? 0.16 : 0.24) + t * (pine ? 0.81 : 0.68)
    const radius =
      (pine ? 0.26 * (1 - t) ** 0.65 : 0.32 * (0.4 + 0.6 * Math.sin(Math.PI * (t * 0.82 + 0.1)))) *
      (0.76 + random() * 0.4)
    const base = v(0.005 * h, pine ? h : 0.2 + t * 0.4, 0),
      tip = v(Math.cos(a) * radius, h + (pine ? -0.035 : 0.23 - 0.12 * t), Math.sin(a) * radius)
    limb(base, tip, trunk * (1 - t * 0.8) * 0.4, 0.002, detailed ? 5 : 3)
    const sprays = detailed ? 5 : 2
    for (let n = 0; n < sprays; n++) {
      const f = (pine ? 0.32 : 0.58) + ((pine ? 0.68 : 0.42) * n) / sprays,
        p = base.clone().lerp(tip, f)
      p.x += Math.sin(a) * (random() - 0.5) * radius * 0.5
      p.z += Math.cos(a) * (random() - 0.5) * radius * 0.5
      const width = (pine ? 0.094 : 0.098) * (0.68 + random() * 0.49) * (pine ? 1 - t * 0.7 : 1)
      const peak = p.clone().add(v(0, width * (pine ? 0.48 : 0.81), 0)),
        bottom = p.clone().add(v(0.008, -width * 0.5, 0))
      center = p
      extent = width * 1.12
      const edges = detailed ? 7 : 5,
        ring = []
      for (let j = 0; j < edges; j++) {
        const ang = (j * Math.PI * 2) / edges + a,
          rr = width * (0.67 + random() * 0.53)
        ring.push(
          p.clone().add(v(rr * Math.cos(ang), (random() - 0.6) * width * 0.61, rr * Math.sin(ang))),
        )
      }
      const palette = pine ? [0x375541, 0x4a6449, 0x587553] : [0x657d43, 0x7a914e, 0x536e3f]
      for (let j = 0; j < edges; j++) {
        const q = ring[j],
          r = ring[(j + 1) % edges]
        tri(peak, r, q, palette[(i + n) % 3])
        tri(bottom, q, r, palette[(i + n + 1) % 3])
        if (detailed) {
          const outside = q.clone().lerp(r, 0.47)
          outside.x += (q.x - p.x) * 0.35
          outside.z += (q.z - p.z) * 0.35
          outside.y -= width * 0.35
          tri(q, r, outside, palette[j % 3])
        }
      }
    }
  }
  const g = new THREE.BufferGeometry()
  for (const [name, arr, n] of [
    ['position', pos, 3],
    ['color', cols, 3],
    ['uv', uv, 2],
    ['wood', bark, 1],
  ])
    g.setAttribute(name, new THREE.Float32BufferAttribute(arr, n))
  g.computeVertexNormals()
  // Average the lighting direction over each leafy spray; the bark retains its own normals.
  const normals = g.attributes.normal
  for (let i = 0; i < bark.length; i++)
    if (!bark[i]) {
      const n = v(
        normals.getX(i) * 0.48,
        0.66 + Math.abs(normals.getY(i)) * 0.34,
        normals.getZ(i) * 0.48,
      ).normalize()
      normals.setXYZ(i, n.x, n.y, n.z)
    }
  g.computeBoundingSphere()
  return g
}

export function createWoodland(scene, batches, maps) {
  const geometries = new Map(),
    pools = new Map(),
    dummy = new THREE.Object3D(),
    tint = new THREE.Color()
  const materials = Object.fromEntries(
    Object.entries(maps).map(([k, map]) => [
      k,
      new THREE.MeshStandardMaterial({
        map,
        vertexColors: true,
        alphaTest: 0.25,
        roughness: 0.91,
        side: THREE.DoubleSide,
      }),
    ]),
  )
  let lastX = Infinity,
    lastZ = Infinity,
    lastQuality = ''
  return function update(x, z, quality, force = false) {
    if (!force && quality === lastQuality && Math.hypot(x - lastX, z - lastZ) < 4) return
    lastX = x
    lastZ = z
    lastQuality = quality
    const [near, mid] = { low: [17, 38], medium: [25, 60], high: [36, 86], ultra: [48, 112] }[
      quality
    ]
    const groups = new Map()
    for (const b of batches) {
      if (b.kind.startsWith('shrub')) continue
      const { mesh, items } = b
      if (Math.hypot(mesh.parent.userData.x - x, mesh.parent.userData.z - z) > mid + 142 && !b.local)
        continue
      let far = 0
      b.local = false
      for (const t of items) {
        const d = Math.hypot(x - t.x, z - t.z),
          hysteresis = 2
        const level =
          d < near + (t.level === 2 ? hysteresis : 0)
            ? 2
            : d < mid + (t.level === 1 ? hysteresis : 0)
              ? 1
              : 0
        t.level = level
        if (level) {
          const key = b.kind + level
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(t)
          b.local = true
        } else {
          dummy.position.set(t.x, t.y, t.z)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(t.h * b.ratio, t.h, t.h * b.ratio)
          dummy.updateMatrix()
          mesh.setMatrixAt(far, dummy.matrix)
          mesh.setColorAt(far++, tint.setScalar(t.shade))
        }
      }
      mesh.count = far
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    for (const m of pools.values()) m.visible = false
    for (const [key, items] of groups) {
      let m = pools.get(key)
      if (!m || m.instanceMatrix.count < items.length) {
        if (m) {
          scene.remove(m)
          m.dispose()
        }
        if (!geometries.has(key))
          geometries.set(key, prototype(key.slice(0, -1), key.endsWith('2')))
        m = new THREE.InstancedMesh(
          geometries.get(key),
          materials[key.startsWith('fir') ? 'fir' : 'alder'],
          2 ** Math.ceil(Math.log2(Math.max(8, items.length))),
        )
        m.name = '3D ' + key
        m.receiveShadow = true
        m.castShadow = true
        pools.set(key, m)
        scene.add(m)
      }
      m.count = items.length
      m.visible = true
      items.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z)
        dummy.rotation.set(0, t.x * 1.63 + t.z * 0.71, 0)
        dummy.scale.set(t.h * t.shade, t.h, t.h * (2 - t.shade))
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        m.setColorAt(i, tint.setRGB(t.shade, t.shade, 0.91 * t.shade))
      })
      m.instanceMatrix.needsUpdate = true
      m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
  }
}
