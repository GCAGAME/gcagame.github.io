import * as THREE from 'three'

export const tileSize = 192
const fineTile = (i, j) => i >= -4 && i < 4 && j >= -4 && j < 3
const tint = new THREE.Color(),
  grass = new THREE.Color('#e0e3cb'),
  stone = new THREE.Color('#a5aaa6'),
  snow = new THREE.Color('#ffffff')
const ramp = THREE.MathUtils.smoothstep

// A coarse cell touching a fine tile shares every six-metre edge vertex with it.
// Regular fine cells retain the same diagonal as the ground contact sampler.
export function terrainTile(ix, iz, height, soilAt, material, detailed = true) {
  const playableTile = fineTile(ix, iz)
  const fine = playableTile && detailed,
    stride = fine ? 6 : 24,
    n = tileSize / stride
  const positions = [],
    normals = [],
    colors = [],
    uv = [],
    indices = [],
    soil = [],
    vertices = new Map()
  function vertex(i, j) {
    const key = i + j * (tileSize + 1)
    if (vertices.has(key)) return vertices.get(key)
    const x = ix * tileSize + i,
      z = iz * tileSize + j,
      y = height(x, z)
    const v = positions.length / 3
    vertices.set(key, v)
    positions.push(x, y, z)
    const nx = height(x - 3, z) - height(x + 3, z),
      nz = height(x, z - 3) - height(x, z + 3)
    const length = Math.hypot(nx, 6, nz)
    normals.push(nx / length, 6 / length, nz / length)
    const noise = 0.5 + 0.5 * Math.sin(x * 0.071 + Math.cos(z * 0.033)) * Math.cos(z * 0.041)
    tint
      .copy(grass)
      .lerp(stone, ramp(y, 13, 80))
      .lerp(snow, ramp(y, 110, 162))
      .multiplyScalar(0.88 + 0.15 * noise)
    colors.push(tint.r, tint.g, tint.b)
    uv.push(x / 4.2, -z / 4.2)
    soil.push(soilAt(x, z))
    return v
  }
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = i * stride,
        z = j * stride
      const west = !fine && i === 0 && (playableTile || fineTile(ix - 1, iz)),
        east = !fine && i === n - 1 && (playableTile || fineTile(ix + 1, iz))
      const north = !fine && j === 0 && (playableTile || fineTile(ix, iz - 1)),
        south = !fine && j === n - 1 && (playableTile || fineTile(ix, iz + 1))
      const a = vertex(x, z),
        b = vertex(x, z + stride),
        c = vertex(x + stride, z + stride),
        d = vertex(x + stride, z)
      if (!(west || east || north || south)) {
        indices.push(a, c, d, a, b, c)
        continue
      }
      const ring = [a]
      if (west) for (let k = 6; k < stride; k += 6) ring.push(vertex(x, z + k))
      ring.push(b)
      if (south) for (let k = 6; k < stride; k += 6) ring.push(vertex(x + k, z + stride))
      ring.push(c)
      if (east) for (let k = 6; k < stride; k += 6) ring.push(vertex(x + stride, z + stride - k))
      ring.push(d)
      if (north) for (let k = 6; k < stride; k += 6) ring.push(vertex(x + stride - k, z))
      const center = vertex(x + stride / 2, z + stride / 2)
      ring.forEach((v, k) => indices.push(center, v, ring[(k + 1) % ring.length]))
    }
  const geometry = new THREE.BufferGeometry()
  for (const [name, values, size] of [
    ['position', positions, 3],
    ['normal', normals, 3],
    ['color', colors, 3],
    ['uv', uv, 2],
    ['soil', soil, 1],
  ]) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size))
  }
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Terrain ' + ix + ',' + iz
  mesh.receiveShadow = fine
  return mesh
}
