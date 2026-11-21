import * as THREE from 'three'

// One metre per texel. Only rasterize the short strips around the dirt routes.
export function bakeTrailWear(trails, distanceTo) {
  const left = Math.floor(Math.min(...trails.map((t) => t.left))) - 1
  const north = Math.floor(Math.min(...trails.map((t) => t.near))) - 1
  const width = Math.ceil(Math.max(...trails.map((t) => t.right))) - left + 2
  const depth = Math.ceil(Math.max(...trails.map((t) => t.far))) - north + 2
  const data = new Uint8Array(width * depth)
  for (const trail of trails) {
    for (let z = Math.floor(trail.near); z <= trail.far; z++)
      for (let x = Math.floor(trail.left); x <= trail.right; x++) {
        const distance = distanceTo(trail.s, x + 0.5, z + 0.5),
          edge = distance - trail.s.width * 0.5
        const wear = 1 - THREE.MathUtils.smoothstep(edge, -0.8, 3.8)
        const i = (z - north) * width + x - left
        data[i] = Math.max(data[i], Math.round(wear * 255))
      }
  }
  const map = new THREE.DataTexture(data, width, depth, THREE.RedFormat)
  map.generateMipmaps = true
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.needsUpdate = true
  return { map, transform: new THREE.Vector4(-left, -north, 1 / width, 1 / depth) }
}
