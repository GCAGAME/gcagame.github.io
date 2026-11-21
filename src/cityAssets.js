import * as THREE from 'three'

// Stream the local glTF derivatives by distance. Repeated props share instanced draws.
export function cityAssets(scene) {
  const groups = new Map(),
    images = new Map(),
    loader = new THREE.FileLoader()
  const texLoader = new THREE.TextureLoader(),
    pose = new THREE.Object3D(),
    extent = new THREE.Vector3()
  const decode = (encoded, Type) =>
    new Type(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer)
  const glow = []
  function texture(name, color = false) {
    if (!name) return null
    if (!images.has(name)) {
      const t = texLoader.load('assets/city/' + name + '.webp')
      t.flipY = false
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 4
      if (color) t.colorSpace = THREE.SRGBColorSpace
      images.set(name, t)
    }
    return images.get(name)
  }
  function place(name, x, y, z, options = {}) {
    if (!groups.has(name)) groups.set(name, { name, instances: [], batches: new Map() })
    groups.get(name).instances.push({ x, y, z, ...options })
  }
  function load(group, lod) {
    group.batches.set(lod, null)
    loader.load(
      'assets/city/' + group.name + '-' + lod + '.mesh',
      (data) => {
        const { materials, parts, size } = JSON.parse(data)
        const meshes = parts.map((part) => {
          const s = materials[part.m],
            g = new THREE.BufferGeometry()
          const pos = Float32Array.from(
            decode(part.p, Int16Array),
            (v, i) => (v * size[i % 3]) / 32767,
          )
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          g.setAttribute('normal', new THREE.BufferAttribute(decode(part.n, Int8Array), 3, true))
          g.setAttribute('uv', new THREE.BufferAttribute(decode(part.uv, Float32Array), 2))
          if (part.c)
            g.setAttribute('color', new THREE.BufferAttribute(decode(part.c, Uint8Array), 3, true))
          g.setIndex(new THREE.BufferAttribute(decode(part.i, Uint16Array), 1))
          const distantBuilding = lod === 2 && group.instances[0].landmark
          const m = new THREE.MeshStandardMaterial({
            map: texture(s.bc, true),
            normalMap: distantBuilding ? null : texture(s.nm),
            roughnessMap: distantBuilding ? null : texture(s.orm),
            metalnessMap: distantBuilding ? null : texture(s.orm),
            aoMap: distantBuilding ? null : texture(s.ao),
            roughness: distantBuilding ? 0.79 : (s.rough ?? 1),
            metalness: distantBuilding ? 0.08 : (s.metal ?? (s.orm ? 1 : 0)),
            alphaTest: s.mask ? 0.4 : 0,
            vertexColors: !!part.c,
            side: s.mask ? THREE.DoubleSide : THREE.FrontSide,
          })
          if (s.rgb) m.color.fromArray(s.rgb)
          if (s.lit) {
            m.emissive.set(0xffddb0)
            m.emissiveMap = m.map
            m.emissiveIntensity = 0
            glow.push(m)
          }
          const mesh = new THREE.InstancedMesh(g, m, group.instances.length)
          mesh.receiveShadow = true
          mesh.castShadow = !['street-gully-grate', 'bracken-fern', 'grass-clump'].includes(
            group.name,
          )
          mesh.name = group.name + ' LOD ' + lod
          mesh.count = 0
          mesh.visible = false
          scene.add(mesh)
          return mesh
        })
        group.batches.set(lod, { meshes, size })
        dirty = true
      },
      undefined,
      () => {
        group.batches.delete(lod)
        dirty = true
      },
    )
  }
  let dirty = true,
    oldX = Infinity,
    oldZ = Infinity,
    lastQ = '',
    lastNight = -1
  return {
    place,
    update(x, z, quality, distance, night) {
      if (night !== lastNight || dirty) {
        for (const m of glow) m.emissiveIntensity = night * 0.8
        lastNight = night
      }
      if (!dirty && quality === lastQ && Math.hypot(x - oldX, z - oldZ) < 4) return
      dirty = false
      oldX = x
      oldZ = z
      lastQ = quality
      const near = { low: 27, medium: 55, high: 90, ultra: 135 }[quality] || 55
      for (const group of groups.values()) {
        for (const batch of group.batches.values())
          if (batch) for (const mesh of batch.meshes) mesh.count = 0
        for (const p of group.instances) {
          const d = Math.hypot(x - p.x, z - p.z)
          if (
            d > (p.landmark ? distance + 35 : (p.range ?? near + 15)) ||
            (p.plant && (quality === 'low' || d > near * 0.62))
          )
            continue
          const lod = p.landmark ? (d < near ? 1 : 2) : (p.lod ?? 1)
          if (!group.batches.has(lod)) load(group, lod)
          const batch =
            group.batches.get(lod) || (p.landmark && group.batches.get(lod === 1 ? 2 : 1))
          if (!batch) continue
          pose.position.set(p.x, p.y, p.z)
          pose.rotation.set(0, p.yaw || 0, 0)
          if (p.size) pose.scale.fromArray(p.size).divide(extent.fromArray(batch.size))
          else pose.scale.setScalar(p.scale ?? 1)
          pose.updateMatrix()
          for (const mesh of batch.meshes) {
            mesh.setMatrixAt(mesh.count, pose.matrix)
            mesh.count++
          }
        }
        for (const batch of group.batches.values())
          if (batch)
            for (const mesh of batch.meshes) {
              mesh.visible = mesh.count > 0
              if (mesh.visible) {
                mesh.instanceMatrix.needsUpdate = true
                mesh.computeBoundingSphere()
              }
            }
      }
    },
  }
}
