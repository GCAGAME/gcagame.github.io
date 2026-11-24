import * as THREE from 'three'

// Use the same town fleet and both levels of detail. The markings and worn
// body panels belong to these instances, never to a shared fleet material.
export function markPatrolCar(car) {
  const label = document.createElement('canvas')
  label.width = 256
  label.height = 64
  const paint = label.getContext('2d')
  paint.fillStyle = '#e9e4cd'
  paint.fillRect(0, 0, 256, 64)
  paint.fillStyle = '#233a46'
  paint.fillRect(0, 49, 256, 15)
  paint.font = 'bold 42px sans-serif'
  paint.textAlign = 'center'
  paint.fillText('POLICE', 128, 41)
  const texture = new THREE.CanvasTexture(label)
  texture.colorSpace = THREE.SRGBColorSpace
  const doorMark = new THREE.MeshStandardMaterial({ map: texture, roughness: .82 })
  const panel = new THREE.PlaneGeometry(1.82, .44)
  for (const side of [-1, 1]) {
    const badge = new THREE.Mesh(panel, doorMark)
    badge.rotation.y = side * Math.PI / 2
    badge.position.set(side * car.spec.width * .495, .81, 0)
    car.model.group.add(badge)
  }
  const lamps = []
  const shell = new THREE.BoxGeometry(.48, .11, .21)
  for (const [i, color] of [0xd9584c, 0x619de0].entries()) {
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .15 })
    const lamp = new THREE.Mesh(shell, material)
    lamp.position.set((i - .5) * .5, car.spec.roof + .04, -.03)
    car.model.group.add(lamp)
    lamps.push(material)
  }
  car.setBeacon = (time, running) => {
    const side = Math.floor(time * 2.8) % 2
    lamps.forEach((material, i) => { material.emissiveIntensity = running && i === side ? 2.4 : .15 })
  }
}

export function weatherRecklessCar(car) {
  const body = car.model.detail.getObjectByName(car.spec.name + ' body')
  for (const part of [body, car.model.coarse]) {
    const material = part.material
    const original = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
      original(shader, renderer)
      shader.vertexShader = 'varying vec3 vRustPoint;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRustPoint = position;
        // A shallow crease in the front quarter panel.
        float dent = exp(-10. * pow(position.z + 1.55, 2.) - 18. * pow(position.y - .70, 2.));
        transformed.x -= .108 * dent * smoothstep(.52, .83, position.x);`,
      )
      shader.fragmentShader = 'varying vec3 vRustPoint;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 p = vRustPoint;
        float mottling = sin(p.z * 9. + sin(p.y * 13.)) * .23 + cos(p.y * 19. - p.x * 7.) * .16;
        float rocker = 1. - smoothstep(.28, .84, p.y + mottling);
        float patches = smoothstep(.22, .46, mottling + .22 * cos(p.z * 4. + p.x * 5.));
        float rust = max(rocker, patches) * smoothstep(.12, .80, vFleetFinish.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.24, .076, .029) * (1. + mottling), rust * .94);`,
      )
    }
    const originalKey = material.customProgramCacheKey()
    material.customProgramCacheKey = () => originalKey + '/worn-body'
  }
}

// The normal component of relative velocity and the change in velocity of
// each participant determine injury. A side scrape or a slow parking tap can
// therefore make contact without taking health.
export function measureImpact(a, b, nx, nz) {
  const heading = a.travelYaw ?? a.yaw
  const vx = -Math.sin(heading) * a.speed
  const vz = -Math.cos(heading) * a.speed
  const otherHeading = b?.travelYaw ?? b?.yaw ?? 0
  const bx = -Math.sin(otherHeading) * (b?.speed || 0)
  const bz = -Math.cos(otherHeading) * (b?.speed || 0)
  const closingSpeed = Math.max(0, -((vx - bx) * nx + (vz - bz) * nz))
  const massShare = b ? b.spec.mass / (a.spec.mass + b.spec.mass) : 1
  const deltaA = closingSpeed * massShare * 1.10
  const deltaB = closingSpeed * (1 - massShare) * 1.10
  return { closingSpeed, deltaA, deltaB, vx: vx + nx * deltaA, vz: vz + nz * deltaA }
}

export function impactInjury(deltaV) {
  return Math.min(100, Math.round(0.155 * Math.max(0, deltaV - 3.5) ** 2))
}
