import assert from 'node:assert/strict'
import { terrainTile, tileSize } from '../src/terrainTile.js'

// Compare each complete boundary polyline, including vertex heights and normals.
// An asymmetric analytic test surface exposes reversed indexing and coarse T-junctions.
const height = (x, z) => 43 * Math.sin(x * 0.025 + z * 0.013) + 12 * Math.cos(z * 0.061)
const cache = new Map()
function get(i, j) {
  const id = [i, j].join(',')
  if (!cache.has(id))
    cache.set(id, terrainTile(i, j, height, () => 0, undefined, (i + j) % 2 === 0).geometry)
  return cache.get(id)
}
function edge(geometry, axis, coord) {
  const p = geometry.attributes.position,
    n = geometry.attributes.normal,
    points = []
  for (let k = 0; k < p.count; k++) {
    if ((axis === 'x' ? p.getX(k) : p.getZ(k)) === coord)
      points.push([
        axis === 'x' ? p.getZ(k) : p.getX(k),
        p.getY(k),
        n.getX(k),
        n.getY(k),
        n.getZ(k),
      ])
  }
  return points.sort((a, b) => a[0] - b[0])
}
let joins = 0
for (let i = -5; i <= 4; i++)
  for (let j = -5; j <= 3; j++) {
    const g = get(i, j)
    const a = edge(g, 'x', (i + 1) * tileSize),
      b = edge(g, 'z', (j + 1) * tileSize)
    assert.deepEqual(a, edge(get(i + 1, j), 'x', (i + 1) * tileSize))
    assert.deepEqual(b, edge(get(i, j + 1), 'z', (j + 1) * tileSize))
    assert(a.length >= 9 && b.length >= 9)
    const p = g.attributes.position,
      idx = g.index.array
    let area = 0
    for (let k = 0; k < idx.length; k += 3) {
      const [u, v, w] = idx.subarray(k, k + 3)
      const signed =
        (p.getZ(v) - p.getZ(u)) * (p.getX(w) - p.getX(u)) -
        (p.getX(v) - p.getX(u)) * (p.getZ(w) - p.getZ(u))
      assert(signed > 0)
      area += signed / 2
    }
    assert.equal(area, tileSize * tileSize)
    joins += 2
  }
console.log(joins + ' tile joins match; all triangles face up and cover each tested tile exactly.')
