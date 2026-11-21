import * as THREE from 'three'

// Render each catalog selection once while gameplay is paused. The clone
// shares its geometry and materials with the actual registered vehicle.
export function showroomPreview(renderer, county) {
  const width = 576,
    height = 192
  const stage = new THREE.Scene()
  stage.background = new THREE.Color(0x333e3c)
  const camera = new THREE.PerspectiveCamera(25, width / height, 0.1, 28)
  const light = new THREE.DirectionalLight(0xfff0d4, 2.1)
  light.position.set(-3, 5, -4)
  stage.add(light, new THREE.HemisphereLight(0xe5efff, 0x92856f, 1.45))
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x434f4c, roughness: 0.8 }),
  )
  floor.rotation.x = -Math.PI / 2
  stage.add(floor)
  const target = new THREE.WebGLRenderTarget(width, height, { colorSpace: THREE.SRGBColorSpace })
  const bytes = new Uint8Array(width * height * 4)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const brush = canvas.getContext('2d')
  const pixels = brush.createImageData(width, height)
  let signature, snapshot
  return function preview(car, paint, wheels) {
    const key = [car.id, paint, wheels, car.model.detail.children.length].join('/')
    if (key === signature) return snapshot
    const copy = car.model.detail.clone()
    copy.visible = true
    copy.position.set(0, 0, 0)
    copy.rotation.set(0, 0, 0)
    stage.add(copy)
    stage.environment = county.environment
    stage.environmentIntensity = 0.63
    const length = car.spec.length
    camera.position.set(-length * 1.13, car.spec.roof + 1.03, -length * 1.01)
    camera.lookAt(0, car.spec.roof * 0.5, 0)
    const previous = renderer.getRenderTarget()
    try {
      renderer.setRenderTarget(target)
      renderer.render(stage, camera)
      renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes)
    } finally {
      renderer.setRenderTarget(previous)
      stage.remove(copy)
    }
    const row = width * 4
    for (let y = 0; y < height; y++)
      pixels.data.set(bytes.subarray((height - y - 1) * row, (height - y) * row), y * row)
    brush.putImageData(pixels, 0, 0)
    snapshot = canvas.toDataURL('image/webp', 0.86)
    signature = key
    return snapshot
  }
}
