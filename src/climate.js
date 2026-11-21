import * as THREE from 'three'
import { loadSkyPhoto, loadEnvironmentPhoto, skyPhotoGLSL } from './skyphoto.js'

const profiles = {
  Clear: [0.16, 0, 0, 0],
  'Partly cloudy': [0.52, 0.08, 0, 0],
  Overcast: [0.92, 0.2, 0, 0],
  Rain: [0.93, 0.34, 0.55, 0],
  'Heavy rain': [1, 0.62, 1, 0],
  Fog: [0.76, 0.98, 0, 0],
  Thunderstorm: [1, 0.69, 1, 0],
  Snow: [0.9, 0.52, 0, 1],
}
const fragment = [
  'uniform float skyHaze; uniform vec3 fogColor;',
  'varying vec3 direction;uniform vec3 sunDir;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 sunColor;uniform float day;uniform float clouds;uniform float windTime;',
  skyPhotoGLSL,
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}',
  'float fbm(vec2 p){float f=.53*noise(p);p=mat2(1.7,1.1,-1.1,1.7)*p;f+=.27*noise(p);p=mat2(1.8,1.,-1.,1.8)*p;f+=.135*noise(p);return f+.065*noise(p*2.);}',
  'void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 col=mix(horizon,zenith,pow(h,.48));float ds=max(dot(d,sunDir),0.);',
  'vec2 uv=d.xz/(.12+h)*2.1+vec2(windTime*.0008,windTime*.00024);float n=fbm(uv);float cloud=smoothstep(.76-clouds*.43,.9-clouds*.42,n)*smoothstep(-.012,.14,d.y);vec3 mist=mix(vec3(.055,.075,.11),vec3(.79,.83,.86),day);mist=mix(mist,mix(sunColor,vec3(1.),.6)*1.15,day*smoothstep(.38,.83,n));col=mix(col,mist,cloud*.91);',
  'col=applySkyPhoto(col,d,day,clouds,sunColor,sunDir.y,windTime);col+=sunColor*(pow(ds,12.)*.16+pow(ds,230.)*.43+smoothstep(.99975,.99996,ds)*4.)*day*(1.-cloud*.85);',
  'float moon=max(dot(d,-sunDir),0.);col+=vec3(.72,.83,1.)*(smoothstep(.9998,.99994,moon)*1.4+pow(moon,160.)*.08)*(1.-day);float stars=step(.9988,hash(floor(d.xz*1600./(.5+h))))*(1.-day)*(1.-cloud)*smoothstep(.05,.4,h);col+=stars*.65;gl_FragColor=vec4(col,1.);',
  '#include <tonemapping_fragment>',
  '#include <colorspace_fragment>',
  'if(skyHaze>.001){float opticalDepth=skyHaze/max(.09,d.y+.08);gl_FragColor.rgb=mix(fogColor,gl_FragColor.rgb,exp(-opticalDepth));}',
  '}',
].join('\n')

export function createClimate(scene, renderer, onThunder) {
  const uniform = (v) => ({ value: v }),
    v3 = () => new THREE.Vector3(),
    color = () => new THREE.Color()
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    skyHaze: uniform(0),
    sunDir: uniform(v3()),
    zenith: uniform(color()),
    horizon: uniform(color()),
    sunColor: uniform(color()),
    day: uniform(1),
    clouds: uniform(0.3),
    windTime: uniform(0),
    photoStrength: uniform(0),
    skyPhoto: uniform(null),
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 15),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader:
        'varying vec3 direction;void main(){direction=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: true,
    }),
  )
  sky.frustumCulled = false
  sky.renderOrder = -100
  scene.add(sky)
  const sun = new THREE.DirectionalLight(0xffedcd, 2.8),
    hemi = new THREE.HemisphereLight(0xccdeee, 0x7e806d, 1.38)
  scene.add(sun, sun.target, hemi)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, {
    left: -38,
    right: 38,
    top: 38,
    bottom: -38,
    near: 1,
    far: 250,
  })
  sun.shadow.normalBias = 0.035
  sun.shadow.bias = -0.00022
  sun.shadow.radius = 2.4
  const fog = new THREE.FogExp2(0xaebfc7, 0.002)
  scene.fog = fog
  const envCanvas = document.createElement('canvas')
  envCanvas.width = 256
  envCanvas.height = 128
  const ec = envCanvas.getContext('2d'),
    gradient = ec.createLinearGradient(0, 0, 0, 128)
  ;[
    [0, '#7594b4'],
    [0.35, '#c3d4df'],
    [0.48, '#f5e8cb'],
    [0.52, '#87978a'],
    [0.75, '#4b564c'],
    [1, '#363b36'],
  ].forEach(([p, c]) => gradient.addColorStop(p, c))
  ec.fillStyle = gradient
  ec.fillRect(0, 0, 256, 128)
  ec.fillStyle = '#fff5df'
  ec.fillRect(63, 27, 13, 3)
  const reflection = new THREE.CanvasTexture(envCanvas)
  reflection.colorSpace = THREE.SRGBColorSpace
  reflection.mapping = THREE.EquirectangularReflectionMapping
  scene.environment = reflection
  const ready = Promise.all([loadSkyPhoto(), loadEnvironmentPhoto()]).then(
    ([skyTexture, environment]) => {
      if (skyTexture) {
        uniforms.skyPhoto.value = skyTexture
        uniforms.photoStrength.value = 1
      }
      if (environment) {
        scene.environment = environment
        reflection.dispose()
      }
    },
  )
  const raingeom = new THREE.BufferGeometry(),
    count = 720,
    pos = new Float32Array(count * 2 * 3),
    seeds = []
  for (let i = 0; i < count; i++) {
    seeds.push([(Math.random() - 0.5) * 40, Math.random() * 22, (Math.random() - 0.5) * 40])
  }
  const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)
  raingeom.setAttribute('position', attr)
  const rain = new THREE.LineSegments(
    raingeom,
    new THREE.LineBasicMaterial({
      color: 0xb8ced8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  )
  rain.frustumCulled = false
  scene.add(rain)
  const snowG = new THREE.BufferGeometry(),
    snowPos = new Float32Array(count * 3),
    snowAttr = new THREE.BufferAttribute(snowPos, 3).setUsage(THREE.DynamicDrawUsage)
  snowG.setAttribute('position', snowAttr)
  const snow = new THREE.Points(
    snowG,
    new THREE.PointsMaterial({
      color: 0xf2f3ed,
      size: 0.09,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  )
  snow.frustumCulled = false
  scene.add(snow)
  const splashG = new THREE.BufferGeometry(),
    splashN = 125,
    origins = new Float32Array(splashN * 3),
    phase = new Float32Array(splashN)
  for (let i = 0; i < splashN; i++) phase[i] = Math.random()
  splashG.setAttribute(
    'position',
    new THREE.BufferAttribute(origins, 3).setUsage(THREE.DynamicDrawUsage),
  )
  splashG.setAttribute('phase', new THREE.BufferAttribute(phase, 1))
  const splashU = { clock: uniform(0), strength: uniform(0), pixels: uniform(1) }
  const splashes = new THREE.Points(
    splashG,
    new THREE.ShaderMaterial({
      uniforms: splashU,
      transparent: true,
      depthWrite: false,
      vertexShader:
        'attribute float phase;uniform float clock,pixels;varying float age;void main(){age=fract(clock*1.85+phase);vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(pixels*.10/max(.25,-mv.z),1.,33.);}',
      fragmentShader:
        'varying float age;uniform float strength;void main(){vec2 q=(gl_PointCoord-.5)*vec2(2.,4.5);float ring=1.-smoothstep(.035,.19,abs(length(q)-age*.94));gl_FragColor=vec4(.77,.86,.88,ring*(1.-age)*strength*.52);}',
    }),
  )
  splashes.frustumCulled = false
  scene.add(splashes)
  let splashX = Infinity,
    splashZ = Infinity
  const state = {
    hour: 8.3,
    weather: 'Partly cloudy',
    clouds: 0.52,
    haze: 0.08,
    wet: 0,
    snow: 0,
    night: false,
    clock: 0,
    nextWeather: 215,
    lightning: 0,
  }
  const cA = color(),
    cB = color(),
    cC = color(),
    cD = color(),
    cT = color(),
    shadowRight = v3(),
    shadowUp = v3(),
    worldUp = v3().set(0, 1, 0)
  let bolt = 22,
    shadowAge = 50,
    shadowX = Infinity,
    shadowZ = Infinity
  function update(dt, p, camera, settings, world) {
    state.clock += dt
    state.hour = (state.hour + (dt * settings.timeScale) / 3600) % 24
    if (settings.weather !== 'Auto') {
      state.weather = settings.weather
    } else if ((state.nextWeather -= dt) < 0) {
      state.nextWeather = 150 + Math.random() * 190
      const choices = Object.keys(profiles).filter((n) => n !== 'Snow' || p.z < -255)
      state.weather = choices[Math.floor(Math.random() * choices.length)]
    }
    const profile = profiles[state.weather] || profiles.Clear
    const blend = 1 - Math.exp(-dt * 0.27),
      regionalSnow = p.z < -242 ? profile[3] : 0
    for (const [key, value] of [
      ['clouds', profile[0]],
      ['haze', profile[1]],
      ['wet', profile[2] + (profile[3] - regionalSnow) * 0.45],
      ['snow', regionalSnow],
    ])
      state[key] += (value - state[key]) * blend
    const a = ((state.hour - 6) * Math.PI) / 12
    uniforms.sunDir.value.set(Math.cos(a) * 0.85, Math.sin(a) * 0.9, -0.38).normalize()
    const elevation = uniforms.sunDir.value.y,
      day = THREE.MathUtils.smoothstep(elevation, -0.14, 0.24),
      gold = (1 - THREE.MathUtils.smoothstep(Math.abs(elevation), 0.01, 0.48)) * day
    state.night = elevation < -0.045
    uniforms.day.value = day
    uniforms.clouds.value = state.clouds
    uniforms.skyHaze.value =
      1.65 * THREE.MathUtils.smoothstep(state.haze, 0.1, 0.85) * Math.exp(-Math.max(0, p.y) / 650)
    uniforms.windTime.value = state.clock
    uniforms.horizon.value
      .copy(cA.set(0x26334b))
      .lerp(cB.set(0xc8d6d6), day)
      .lerp(cC.set(0xfbd6a8), gold * 0.84)
      .lerp(cD.set(0xabb8bb), state.haze * day * 0.65)
    uniforms.zenith.value
      .copy(cA.set(0x101a32))
      .lerp(cB.set(0x6d99be), day)
      .lerp(cC.set(0x9aa9b4), state.clouds * 0.63 * day)
    // Longer paths through the atmosphere attenuate blue sunlight more strongly.
    const airMass = 1 / Math.max(0.13, elevation + 0.06)
    uniforms.sunColor.value.setRGB(1, Math.exp(-0.036 * airMass), Math.exp(-0.103 * airMass))
    uniforms.sunColor.value.lerp(cA.set(0xf1f3f4), state.clouds * 0.42)
    sky.position.copy(camera.position)
    sky.scale.setScalar(44)
    const spacing = Math.max(
      0.1,
      (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x,
    )
    const sx = p.x,
      sz = p.z,
      sy = p.y
    shadowAge += dt
    const shadowRate = { Low: 4, Medium: 8, High: 16, Ultra: 30 }[settings.quality] || 8
    // Leave a colour-only frame between costly depth passes on slower GPUs.
    const shadowInterval = Math.max(1 / shadowRate, dt * 1.8)
    if (
      sun.castShadow &&
      (Math.hypot(sx - shadowX, sz - shadowZ) > 4 || shadowAge >= shadowInterval)
    ) {
      renderer.shadowMap.needsUpdate = true
      shadowAge = 0
      shadowX = sx
      shadowZ = sz
    }
    if (!sun.castShadow || shadowAge === 0) {
      const target = sun.target.position.set(sx, sy, sz)
      shadowRight.crossVectors(worldUp, uniforms.sunDir.value).normalize()
      shadowUp.crossVectors(uniforms.sunDir.value, shadowRight)
      for (const axis of [shadowRight, shadowUp]) {
        const texel = target.dot(axis) / spacing
        target.addScaledVector(axis, (Math.round(texel) - texel) * spacing)
      }
      sun.position
        .copy(uniforms.sunDir.value)
        .multiplyScalar(state.night ? -96 : 96)
        .add(sun.target.position)
    }
    sun.color.copy(state.night ? cT.set(0xb7d2f3) : uniforms.sunColor.value)
    if (state.weather === 'Thunderstorm' && state.wet > 0.4 && (bolt -= dt) < 0) {
      bolt = 12 + Math.random() * 16
      state.lightning = 1
      onThunder?.()
    }
    state.lightning = Math.max(0, state.lightning - dt * 3.8)
    sun.intensity =
      (state.night
        ? 0.25
        : day * 3.2 * Math.exp(-0.095 * airMass) * (1 - 0.89 * state.clouds * state.clouds)) +
      state.lightning * 3
    hemi.intensity = 0.25 + day * (0.85 + 0.81 * state.clouds) + state.lightning * 1.6
    hemi.color.copy(cA.set(0xb1c2e0)).lerp(cB.set(0xc7d9ef), day)
    hemi.groundColor.copy(cA.set(0x566478)).lerp(cB.set(0x988d77), day)
    fog.color
      .copy(uniforms.horizon.value)
      .lerp(uniforms.zenith.value, day * (0.27 - 0.16 * state.clouds))
      .lerp(uniforms.sunColor.value, gold * (1 - state.clouds) * 0.2)
    fog.density =
      0.00135 +
      (0.00055 + gold * 0.00145 + state.haze * 0.017) * Math.exp(-Math.max(0, p.y) / 180) +
      state.snow * 0.009
    // Suppress the daylight panorama in glass and paint after sunset.
    const skyReflection = 0.075 + day * (0.69 - state.clouds * 0.17)
    scene.environmentIntensity = settings.reflections ? skyReflection : 0
    const indoors = world.indoors?.(p.x, p.z) ?? false
    const exposure =
      (state.night ? 1.09 : 0.91 + 0.17 * state.clouds + 0.08 * gold) + (indoors ? 0.24 : 0)
    renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * Math.min(1, dt * 2)
    rain.visible = state.wet > 0.025 && !indoors
    snow.visible = state.snow > 0.025 && !indoors
    splashes.visible = rain.visible
    if (splashes.visible) {
      if (Math.hypot(p.x - splashX, p.z - splashZ) > 4) {
        splashX = Math.round(p.x / 4) * 4
        splashZ = Math.round(p.z / 4) * 4
        for (let i = 0; i < splashN; i++) {
          const j = i * 3,
            x = splashX + seeds[i][0] * 0.65,
            z = splashZ + seeds[i][2] * 0.65
          origins[j] = x
          origins[j + 1] = world.height(x, z) + 0.09
          origins[j + 2] = z
        }
        splashG.attributes.position.needsUpdate = true
      }
      splashU.clock.value = state.clock
      splashU.strength.value = state.wet
      splashU.pixels.value = renderer.domElement.height
    }
    const density = settings.quality === 'Low' ? 0.4 : 1
    if (rain.visible || snow.visible) {
      const n = Math.ceil(count * Math.max(state.wet, state.snow) * density)
      for (let i = 0; i < n; i++) {
        const [x, y, z] = seeds[i],
          t = state.clock,
          py = ((y - ((t * (snow.visible ? 1.7 : 16)) % 22) + 22) % 22) - 4
        if (rain.visible) {
          const j = i * 6,
            px = x + py * 0.13
          pos[j] = px
          pos[j + 1] = py
          pos[j + 2] = z
          pos[j + 3] = px + 0.065
          pos[j + 4] = py + 0.52
          pos[j + 5] = z + 0.04
        }
        if (snow.visible) {
          const j = i * 3
          snowPos[j] = x + Math.sin(t * 0.6 + i) * 0.9
          snowPos[j + 1] = py
          snowPos[j + 2] = z + Math.cos(t * 0.4 + i) * 0.35
        }
      }
      rain.position.copy(camera.position)
      snow.position.copy(camera.position)
      attr.needsUpdate = true
      snowAttr.needsUpdate = true
      raingeom.setDrawRange(0, n * 2)
      snowG.setDrawRange(0, n)
    }
    return state
  }
  function shadowQuality(value) {
    sun.castShadow = value !== 'Off'
    renderer.shadowMap.enabled = sun.castShadow
    renderer.shadowMap.autoUpdate = false
    const size = Math.min(
      renderer.capabilities.maxTextureSize,
      { Low: 512, Medium: 1024, High: 2048, Ultra: 4096, Off: 256 }[value] || 1024,
    )
    const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / size
    sun.shadow.normalBias = Math.max(0.012, texel * 0.58)
    sun.shadow.bias = -Math.min(0.00022, texel * 0.0018)
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    renderer.shadowMap.needsUpdate = true
  }
  function restore(s) {
    if (!s || !Number.isFinite(s.hour) || !profiles[s.weather]) throw Error('Invalid weather')
    for (const k of Object.keys(state)) if (typeof s[k] === typeof state[k]) state[k] = s[k]
    state.hour = ((state.hour % 24) + 24) % 24
  }
  return { state, update, shadowQuality, restore, ready }
}
