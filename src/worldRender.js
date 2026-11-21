import * as THREE from 'three'

// Opaque static geometry shares a buffer per material and neighborhood. This
// makes a whole row of detailed buildings cost only a handful of draw calls.
export function worldRenderer(scene) {
  const materials = {},
    chunks = new Map(),
    buckets = new Map(),
    textures = []
  const loader = new THREE.TextureLoader()
  function texture(name, color = true) {
    const t =
      scene.userData.surfaceTextures?.get(name) || loader.load('assets/world/' + name + '.webp')
    if (color) t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    textures.push(t)
    return t
  }
  function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    paint(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    textures.push(t)
    return t
  }
  function standard(key, opts = {}, scale = [1, 1]) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.83, vertexColors: true, ...opts })
    m.userData.scale = scale
    m.name = key
    materials[key] = m
    return m
  }
  const solid = standard('solid')
  const metal = standard('metal', { metalness: 0.5, roughness: 0.46 })
  standard('grass', { map: texture('grass') }, [5.1, 5.1])
  standard('concrete', { map: texture('concrete') }, [4, 4])
  standard('wood', { map: texture('wood') }, [2.3, 2.3])
  standard('brick', { map: texture('brick') }, [1.45, 1.45])
  standard('asphalt', { map: texture('asphalt'), roughness: 0.96 }, [4.5, 4.5])
  const urbanRelief = []
  for (const name of ['asphalt', 'concrete', 'brick']) {
    const mat = materials[name],
      normal = texture(name + '-normal', false),
      orm = texture(name + '-orm', false)
    urbanRelief.push({ mat, normal, orm })
    mat.normalScale.setScalar(name === 'asphalt' ? 0.65 : 0.55)
  }
  function setSurfaceQuality(q) {
    for (const { mat, normal, orm } of urbanRelief) {
      const active = q === 'high' || q === 'ultra'
      const detail = active ? normal : null
      if (mat.normalMap === detail) continue
      mat.normalMap = detail
      mat.roughnessMap = mat.aoMap = active ? orm : null
      mat.needsUpdate = true
    }
  }
  standard('marking', {
    roughness: 0.99,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -3,
  })
  standard('roof', { map: texture('roof') }, [2.5, 2.5])
  standard('dirt', { map: texture('dirt') }, [4.5, 4.5])
  standard('rock', { map: texture('rock') }, [7.8, 7.8])
  const siding = canvasTexture(128, 128, (c, w, h) => {
    for (let y = 0; y < h; y += 16) {
      const g = c.createLinearGradient(0, y, 0, y + 16)
      g.addColorStop(0, '#a5a89f')
      g.addColorStop(0.18, '#d5d6cc')
      g.addColorStop(0.65, '#e6e6dc')
      g.addColorStop(1, '#f4f4ed')
      c.fillStyle = g
      c.fillRect(0, y, w, 16)
      c.fillStyle = '#83867e'
      c.fillRect(0, y + 15, w, 1)
    }
  })
  standard('siding', { map: siding }, [2, 1.55])
  const pane = canvasTexture(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w * 0.6, h)
    g.addColorStop(0, '#a6b9bf')
    g.addColorStop(0.5, '#768b8f')
    g.addColorStop(1, '#435751')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    // Sheer curtains sit behind a cool reflected sky.
    for (const left of [true, false]) {
      c.save()
      if (!left) {
        c.translate(w, 0)
        c.scale(-1, 1)
      }
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(61, 0)
      c.bezierCurveTo(53, 91, 12, 151, 29, 256)
      c.lineTo(0, 256)
      c.fill()
      c.fillStyle = 'rgba(214,202,176,.43)'
      c.fill()
      for (let i = 4; i < 28; i += 4) {
        c.strokeStyle = 'rgba(119,118,109,.21)'
        c.beginPath()
        c.moveTo(i * 1.6, 0)
        c.quadraticCurveTo(i, 130, i * 0.7, 256)
        c.stroke()
      }
      c.restore()
    }
  })
  standard('pane', { map: pane, roughness: 0.27, metalness: 0.24 }, [0, 0])
  for (let i = 0; i < 3; i++) {
    standard(
      'facade' + i,
      {
        map: texture('facade' + i),
        emissive: 0xffd995,
        emissiveMap: texture('windows' + i, false),
        emissiveIntensity: 0,
        metalness: i === 0 ? 0.24 : 0.1,
        roughness: i === 0 ? 0.3 : 0.6,
      },
      [12, 12],
    )
  }
  standard('lamp', { emissive: 0xffd8a0, emissiveIntensity: 0, metalness: 0.05 })
  standard('redLight', { emissive: 0xff2d10, emissiveIntensity: 0.08 })
  standard('greenLight', { emissive: 0x37ef9f, emissiveIntensity: 0.08 })
  // Trimmed cutouts share a transparent gutter, which prevents dark fringes
  // and keeps fine branches intact at a distance.
  function getChunk(x, z) {
    const ix = Math.floor(x / 96),
      iz = Math.floor(z / 96),
      key = ix + ',' + iz
    if (!chunks.has(key)) {
      const group = new THREE.Group()
      group.userData = { x: (ix + 0.5) * 96, z: (iz + 0.5) * 96 }
      chunks.set(key, group)
      scene.add(group)
    }
    return [key, chunks.get(key)]
  }
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    color = new THREE.Color()
  function poly(verts, mat = 'solid', tint = 0xffffff, uv = null) {
    if (mat === 'dirt') uv = verts.map((v) => [v[0] / 1.3, -v[2] / 1.3])
    const m = typeof mat === 'string' ? materials[mat] : mat
    const [ck, group] = getChunk(verts[0][0], verts[0][2])
    const key = ck + '|' + m.id
    let data = buckets.get(key)
    if (!data) {
      data = { p: [], n: [], u: [], c: [], i: [], group, m }
      buckets.set(key, data)
    }
    const [v0, v1, v2] = verts
    a.set(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2])
    b.set(v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2])
    normal.crossVectors(a, b).normalize()
    color.set(tint)
    const su = m.userData.scale?.[0] ?? 1,
      sv = m.userData.scale?.[1] ?? 1
    if (!uv) {
      const e0 = Math.hypot(...v1.map((v, i) => v - v0[i])),
        end = verts.at(-1)
      const e1 = Math.hypot(...end.map((v, i) => v - v0[i]))
      if ((!su || !sv) && verts.length <= 4)
        uv = [
          [0, 0],
          [su ? e0 / su : 1, 0],
          [su ? e0 / su : 1, sv ? e1 / sv : 1],
          [0, sv ? e1 / sv : 1],
        ]
      else {
        const along = a.clone().normalize(),
          across = normal.clone().cross(along)
        uv = verts.map((v) => {
          const delta = new THREE.Vector3(v[0] - v0[0], v[1] - v0[1], v[2] - v0[2])
          return [delta.dot(along) / (su || 1), delta.dot(across) / (sv || 1)]
        })
      }
    }
    const idx = data.p.length / 3
    for (let i = 0; i < verts.length; i++) {
      data.p.push(...verts[i])
      data.n.push(normal.x, normal.y, normal.z)
      data.u.push(...uv[i])
      data.c.push(color.r, color.g, color.b)
    }
    for (let i = 1; i < verts.length - 1; i++) data.i.push(idx, idx + i, idx + i + 1)
  }
  function box(x, y, z, w, h, d, mat = 'solid', tint = 0xffffff, angle = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return
    const cx = Math.cos(angle),
      sx = Math.sin(angle)
    function v(xx, yy, zz) {
      return [x + (xx * cx + zz * sx), y + yy, z - xx * sx + zz * cx]
    }
    const X = w / 2,
      Z = d / 2
    const p = [
      v(-X, 0, -Z),
      v(X, 0, -Z),
      v(X, 0, Z),
      v(-X, 0, Z),
      v(-X, h, -Z),
      v(X, h, -Z),
      v(X, h, Z),
      v(-X, h, Z),
    ]
    for (const indices of [
      [1, 0, 4, 5],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [2, 1, 5, 6],
      [7, 6, 5, 4],
      [0, 1, 2, 3],
    ])
      poly(
        indices.map((i) => p[i]),
        mat,
        tint,
      )
  }
  function plate(x, y, z, w, d, mat = 'solid', tint = 0xffffff, angle = 0) {
    const cs = Math.cos(angle),
      sn = Math.sin(angle)
    const verts = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ].map(([u, v]) => [x + (u * w * cs + v * d * sn) / 2, y, z + (-u * w * sn + v * d * cs) / 2])
    poly(verts, mat, tint)
  }
  function rod(start, end, r1, r2 = r1, mat = 'metal', tint = 0xffffff, sides = 8) {
    const st = new THREE.Vector3(...start),
      ed = new THREE.Vector3(...end),
      dir = ed.clone().sub(st).normalize()
    const side = new THREE.Vector3()
      .crossVectors(
        dir,
        Math.abs(dir.y) > 0.93 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
      )
      .normalize()
    const up = dir.clone().cross(side)
    function ring(i, p, r) {
      const rad = (i / sides) * Math.PI * 2
      return p
        .clone()
        .addScaledVector(side, r * Math.cos(rad))
        .addScaledVector(up, r * Math.sin(rad))
        .toArray()
    }
    for (let i = 0; i < sides; i++)
      poly([ring(i, st, r1), ring(i + 1, st, r1), ring(i + 1, ed, r2), ring(i, ed, r2)], mat, tint)
    poly(
      Array.from({ length: sides }, (_, i) => ring(i, ed, r2)),
      mat,
      tint,
    )
  }
  function finish() {
    for (const data of buckets.values()) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.p, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(data.n, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(data.c, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.u, 2))
      g.setIndex(data.i)
      g.computeBoundingSphere()
      const obj = new THREE.Mesh(g, data.m)
      obj.castShadow =
        !['asphalt', 'dirt', 'grass', 'contact', 'marking'].includes(data.m.name) &&
        !data.m.name.startsWith('signAtlas')
      obj.receiveShadow = true
      data.group.add(obj)
    }
    buckets.clear()
  }
  return {
    materials,
    setSurfaceQuality,
    textures,
    solid,
    metal,
    standard,
    texture,
    canvasTexture,
    poly,
    box,
    plate,
    rod,
    finish,
    chunks,
    getChunk,
  }
}
