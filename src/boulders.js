import * as THREE from 'three'
import { stoneScans } from './stone-scans.js'
import { hull } from './collision.js'

function geometry([packedVertices, packedIndices]) {
  const bytes = (encoded) => Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)).buffer
  const v = new THREE.InterleavedBuffer(new Int16Array(bytes(packedVertices)), 8)
  const g = new THREE.BufferGeometry()
  for (const [name, size, offset] of [
    ['position', 3, 0],
    ['normal', 3, 3],
    ['uv', 2, 6],
  ]) {
    g.setAttribute(name, new THREE.InterleavedBufferAttribute(v, size, offset, true))
  }
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(packedIndices)), 1))
  g.computeBoundingSphere()
  return g
}

export function placeBoulders(rocks, art, height, rectangle) {
  const variants = stoneScans.map((levels) => levels.map(geometry))
  const texture = (name, color) => {
    const t = art.texture('stone-' + name, color)
    // The scan's atlas follows the glTF UV convention.
    t.flipY = false
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  }
  const material = new THREE.MeshStandardMaterial({
    name: 'Weathered stone',
    map: texture('color', true),
    normalMap: texture('normal', false),
    roughnessMap: texture('rough', false),
    roughness: 0.96,
    metalness: 0,
  })
  material.normalScale.setScalar(0.82)
  const fracture = art.texture('stone-fracture')
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFracture = { value: fracture }
    const varyings = 'varying vec3 vStoneMeters; varying vec3 vStoneFace;\n'
    shader.vertexShader =
      varyings +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vStoneMeters=position*vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      vStoneFace=normal;
    `,
      )
    shader.fragmentShader = 'uniform sampler2D uFracture;\n' + varyings + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `
      #include <map_fragment>
      float nearby=1.-smoothstep(23.,48.,length(vViewPosition));
      float crackHeight=0.;
      if(nearby>.001){
        vec3 weights=pow(abs(normalize(vStoneFace)),vec3(4.));
        weights/=max(.001,weights.x+weights.y+weights.z);
        vec3 uvw=vStoneMeters*.84;
        vec4 skin=texture2D(uFracture,uvw.zy)*weights.x + texture2D(uFracture,uvw.xz)*weights.y + texture2D(uFracture,uvw.xy)*weights.z;
        float exposed=smoothstep(-.78,.16,vStoneFace.y);
        diffuseColor.rgb=mix(diffuseColor.rgb,skin.rgb*(.76+.30*exposed),nearby*(.58+.23*exposed));
        crackHeight=skin.a*.013*nearby;
      }
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 rx=cross(dy,normal),ry=cross(normal,dx);
      float det=dot(dx,rx);
      normal=normalize(max(abs(det),1.e-9)*normal-sign(det)*(dFdx(crackHeight)*rx+dFdy(crackHeight)*ry));
    `,
      )
  }
  const groups = new Map(),
    pose = new THREE.Object3D(),
    point = new THREE.Vector3(),
    color = new THREE.Color(),
    batches = []
  for (const rock of rocks) {
    const [key, group] = art.getChunk(rock.x, rock.z)
    if (!groups.has(key)) groups.set(key, { group, items: [] })
    groups.get(key).items.push(rock)
  }
  for (const { group, items } of groups.values()) {
    const seed = Math.abs(Math.round(group.userData.x * 7 + group.userData.z * 13))
    const [near, far] = variants[seed % variants.length]
    const mesh = new THREE.InstancedMesh(far, material, items.length)
    mesh.name = 'Boulders'
    mesh.castShadow = mesh.receiveShadow = true
    items.forEach(({ x, z, size, rot }, i) => {
      // Set the base into the local grade. The exact same matrix drives the collision envelope.
      const nx = (height(x - size, z) - height(x + size, z)) / (2 * size)
      const nz = (height(x, z - size) - height(x, z + size)) / (2 * size)
      const tilt = Math.min(1, 0.3 / Math.max(0.001, Math.hypot(nx, nz)))
      pose.position.set(x, height(x, z) + size * 0.22, z)
      pose.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(nx * tilt, 1, nz * tilt).normalize(),
      )
      pose.rotateY(rot)
      pose.scale.set(
        size,
        size * (0.53 + 0.085 * Math.sin(rot * 3)),
        size * (0.83 + 0.09 * Math.cos(rot)),
      )
      pose.updateMatrix()
      mesh.setMatrixAt(i, pose.matrix)
      const warm = 0.5 + 0.5 * Math.sin(rot * 2)
      mesh.setColorAt(i, color.setRGB(0.88 + 0.1 * warm, 0.92 + 0.04 * warm, 0.95 - 0.09 * warm))
      const outline = [],
        box = new THREE.Box3()
      for (let k = 0; k < near.attributes.position.count; k++) {
        point.fromBufferAttribute(near.attributes.position, k).applyMatrix4(pose.matrix)
        outline.push([point.x, point.z])
        box.expandByPoint(point)
      }
      const shape = rectangle(
        (box.min.x + box.max.x) / 2,
        (box.min.z + box.max.z) / 2,
        box.max.x - box.min.x,
        box.max.z - box.min.z,
        box.min.y,
        box.max.y,
      )
      shape.poly = hull(outline)
      shape.kind = 'rock'
    })
    // Use the combined bounds of both detail levels when the renderer culls the batch.
    mesh.computeBoundingSphere()
    const bounds = mesh.boundingSphere.clone()
    mesh.geometry = near
    mesh.computeBoundingSphere()
    mesh.boundingSphere.union(bounds)
    mesh.geometry = far
    group.add(mesh)
    if (items.some((r) => r.size > 0.45)) batches.push({ mesh, near, far, center: group.userData })
  }
  return (x, z, quality) => {
    const radius = { low: 30, medium: 54, high: 78, ultra: 105 }[quality]
    for (const { mesh, near, far, center } of batches) {
      const threshold = radius + 48 + (mesh.geometry === near ? 10 : 0)
      mesh.geometry = Math.hypot(x - center.x, z - center.z) < threshold ? near : far
    }
  }
}
