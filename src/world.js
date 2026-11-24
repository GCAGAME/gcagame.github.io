import { bakeTrailWear } from './trailSurface.js'
import { placeBoulders } from './boulders.js'
import { clearance } from './boundary.js'
import { terrainTile, tileSize } from './terrainTile.js'
import { createWoodland } from './woodland.js'
import { boxHull, circleHits } from './collision.js'
import * as THREE from 'three'
import { worldRenderer } from './worldRender.js'
import { cityAssets } from './cityAssets.js'
import { populateTown } from './worldTown.js'

const point = (x, z, name) => ({ x, z, name })
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
function generator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
const locations = {
  home: point(-12, 67, 'Cedar House'),
  downtown: point(9, -72, 'Civic Square'),
  depot: point(14, -88, 'Parcel Exchange'),
  delivery: point(68, -172, 'Harbor Dispatch'),
  trailhead: point(4, -238, 'North Ridge Trailhead'),
  summit: point(124, -374, 'North Ridge Lookout'),
  landmark1: point(-47, -71, 'Municipal Archive'),
  landmark2: point(77, -126, 'Harbor Water Tower'),
  fuel: point(-9, -13, 'Pacific Service'),
  shop: point(14, -88, 'Parcel Exchange'),
  garage: point(-16, 69, 'Cedar Garage'),
}

export function createWorld(scene) {
  const art = worldRenderer(scene)
  const city = cityAssets(scene)
  const { box, poly, rod, materials: m } = art
  const random = generator(821991),
    waterLevel = -1.9,
    buildings = [],
    interactables = [],
    obstacles = new Map()
  const roads = [],
    segments = [],
    dynamic = [],
    trees = [],
    rocks = [],
    floors = [],
    canopies = [], interiors = []
  const observer = { x: -12, z: 67 }
  let quality = 'high',
    elapsed = 0,
    signalTime = 0,
    wet = 0,
    cullTimer = 2,
    cullX = 9999,
    cullZ = 9999
  let doorOccupancyTest = () => false
  const lights = []
  const info = (name) => locations[name]
  function rectangle(x, z, w, d, y = 0, top = 10000, condition = null) {
    const rect = { x, z, w, d, y, top, condition, poly: boxHull(x, z, w, d) }
    for (let i = Math.floor((x - w / 2) / 16); i <= Math.floor((x + w / 2) / 16); i++)
      for (let j = Math.floor((z - d / 2) / 16); j <= Math.floor((z + d / 2) / 16); j++) {
        const key = i + ',' + j
        if (!obstacles.has(key)) obstacles.set(key, [])
        obstacles.get(key).push(rect)
      }
    return rect
  }
  function candidates(x, z, r) {
    const found = new Set()
    for (let i = Math.floor((x - r) / 16); i <= Math.floor((x + r) / 16); i++)
      for (let j = Math.floor((z - r) / 16); j <= Math.floor((z + r) / 16); j++)
        for (const shape of obstacles.get(i + ',' + j) || [])
          if (!shape.condition || shape.condition()) found.add(shape)
    return found
  }
  function blocked(x, z, r = 0.4, y = 0, head = y + 0.85) {
    if (clearance(x, z) < r) return true
    for (let i = Math.floor((x - r) / 16); i <= Math.floor((x + r) / 16); i++)
      for (let j = Math.floor((z - r) / 16); j <= Math.floor((z + r) / 16); j++) {
        for (const o of obstacles.get(i + ',' + j) || []) {
          if (o.condition && !o.condition()) continue
          if (y > o.top + 0.03 || (o.kind === 'door' ? head : y + 0.85) < o.y) continue
          const dx = Math.max(0, Math.abs(x - o.x) - o.w / 2),
            dz = Math.max(0, Math.abs(z - o.z) - o.d / 2)
          if (dx * dx + dz * dz <= r * r && circleHits(x, z, r, o.poly)) return true
        }
      }
    return false
  }
  function doorCeiling(x, z, feet) {
    let ceiling = Infinity
    for (const door of candidates(x, z, 0.29)) {
      if (door.kind === 'door' && door.y > feet && circleHits(x, z, 0.29, door.poly))
        ceiling = Math.min(ceiling, door.y)
    }
    return ceiling
  }
  function ridge(x, z) {
    const n =
      Math.sin(x * 0.031 + z * 0.018) * 0.48 +
      Math.sin(x * 0.053 - z * 0.03) * 0.23 +
      Math.sin(x * 0.014 - z * 0.021) * 0.64
    const rim =
      smooth(160, 440, Math.abs(x)) * 0.8 + smooth(180, 420, z) * 0.7 + smooth(300, 560, -z)
    const peak = Math.pow(
      0.48 + 0.52 * Math.abs(Math.sin(x * 0.011 + z * 0.009 + Math.sin(z * 0.026) * 0.5)),
      2.5,
    )
    const mountain =
      smooth(218, 415, -z) *
      (0.32 + 0.68 * smooth(-30, 90, x)) *
      (65 + 14 * Math.sin(x * 0.015) + 6 * Math.sin(z * 0.038))
    const rolling =
      smooth(115, 175, Math.abs(x)) *
      (3 + 3 * Math.sin(x * 0.021 + z * 0.017) + 1.6 * Math.sin(z * 0.032))
    return mountain + rim * (23 + 78 * peak + 17 * n) + rolling
  }
  function naturalHeight(x, z) {
    const cx = 139 + Math.sin((z + 115) * 0.013) * 11
    const basin = Math.hypot((x - cx) / 48, (z + 119) / 151)
    const distance = clearance(x, z)
    if (distance < 125) {
      // Blend into foothills inside the county and two irregular ridgelines outside.
      // Distance is continuous at corners; the independent mountain folds cross them.
      const fold = Math.sin(x * 0.011 + z * 0.007) + 0.55 * Math.cos(z * 0.018 - x * 0.009)
      const shoulder = 36 + 7 * fold + 3 * Math.sin(z * 0.023 - x * 0.015)
      const outside =
        distance >= 0
          ? -distance
          : Math.hypot(Math.max(0, Math.abs(x) - 660), Math.max(0, -690 - z, z - 470))
      const crest = (center, width) => Math.exp(-((outside - center) ** 2) / (width * width))
      // Oblique spurs and incised gullies vary across each ridge as well as along it.
      const spur = Math.sin(x * 0.026 - z * 0.019 + 0.8 * Math.sin(z * 0.033))
      const gully = Math.abs(Math.sin(x * 0.043 + z * 0.027 + 1.2 * spur))
      const spine = Math.abs(Math.sin(x * 0.019 + z * 0.023 + 1.8 * spur))
      const ribs = 15 * (1 - spine) ** 4 - 8 * gully ** 3
      const relief = (16 * spur + 11 * (1 - 2 * gully) + ribs) * smooth(24, 110, outside)
      const peaks =
        shoulder +
        relief +
        (38 + 12 * fold) * crest(119 + 22 * fold, 53) +
        (112 + 37 * Math.sin(x * 0.014 - z * 0.012) + 14 * Math.sin(z * 0.029 + x * 0.021)) *
          crest(313 + 43 * fold, 93) +
        94 * smooth(335, 595, outside)
      const blend = smooth(0, 125, distance)
      return blend > 0 ? peaks * (1 - blend) + ridge(x, z) * blend : peaks
    }
    let g = ridge(x, z)
    g -= (1 - smooth(0.73, 1.07, basin)) * 10.5
    return g
  }
  // The east road crosses the inlet and climbs to the trail. Sample its grade
  // at the same six-metre stations used by the asphalt and the terrain mesh.
  const crossingZ = -180,
    west = 72,
    east = 246
  const deckEdge = 6.5
  const rise = naturalHeight(east, crossingZ)
  function crossingGrade(x) {
    const station = Math.floor((x - west) / 6)
    const t = (x - west) / 6 - station
    const n = (east - west) / 6
    return (rise * ((1 - t) * station ** 2 + t * (station + 1) ** 2)) / (n * n)
  }
  function rawHeight(x, z) {
    const ground = naturalHeight(x, z)
    if (x < west || x >= east + 18 || Math.abs(z - crossingZ) >= 24) return ground
    // Preserve the submerged channel between abutments. Shape the two banks
    // and blend the far approach back into the hillside beyond the pavement.
    const bank = 1 - smooth(78, 90, x) + smooth(168, 180, x)
    const influence =
      bank * (1 - smooth(12, 24, Math.abs(z - crossingZ))) * (1 - smooth(east, east + 18, x))
    return ground + (crossingGrade(x) - ground) * influence
  }
  // Use the same piecewise planes that make up the terrain mesh, keeping
  // tires and the player's feet on the rendered surface even on steep slopes.
  const step = 6
  function terrainHeight(x, z) {
    const ax = Math.floor(x / step) * step,
      az = Math.floor(z / step) * step
    const u = (x - ax) / step,
      v = (z - az) / step
    const h00 = rawHeight(ax, az),
      h11 = rawHeight(ax + step, az + step)
    if (u >= v) return h00 * (1 - u) + rawHeight(ax + step, az) * (u - v) + h11 * v
    return h00 * (1 - v) + rawHeight(ax, az + step) * (v - u) + h11 * u
  }
  const bridge = (x, z) => x >= west && x <= east && Math.abs(z - crossingZ) <= deckEdge
  function inRect(x, z, v) {
    return Math.abs(x - v.x) <= v.w / 2 && Math.abs(z - v.z) <= v.d / 2
  }
  function indoors(x, z) {
    return interiors.some((v) => inRect(x, z, v))
  }
  // Index walkable top faces using the same triangle fan emitted by art.poly.
  // The collision surface then follows curved curbs and cut-and-fill grades exactly.
  const pavement = new Map()
  function recordPavement(vertices) {
    const [a] = vertices
    for (let i = 1; i + 1 < vertices.length; i++) {
      const b = vertices[i],
        c = vertices[i + 1]
      const bx = b[0] - a[0],
        bz = b[2] - a[2],
        cx = c[0] - a[0],
        cz = c[2] - a[2]
      const det = bx * cz - bz * cx
      if (Math.abs(det) < 1e-9) continue
      const tri = { a, bx, bz, cx, cz, det, by: b[1] - a[1], cy: c[1] - a[1] }
      const xs = [a[0], b[0], c[0]],
        zs = [a[2], b[2], c[2]]
      for (let ix = Math.floor(Math.min(...xs) / 8); ix <= Math.floor(Math.max(...xs) / 8); ix++) {
        for (
          let iz = Math.floor(Math.min(...zs) / 8);
          iz <= Math.floor(Math.max(...zs) / 8);
          iz++
        ) {
          const key = ix + ',' + iz
          if (!pavement.has(key)) pavement.set(key, [])
          pavement.get(key).push(tri)
        }
      }
    }
  }
  function height(x, z) {
    let y = terrainHeight(x, z)
    const nearby = pavement.get(Math.floor(x / 8) + ',' + Math.floor(z / 8))
    if (nearby)
      for (const t of nearby) {
        const dx = x - t.a[0],
          dz = z - t.a[2]
        const u = (dx * t.cz - dz * t.cx) / t.det,
          v = (t.bx * dz - t.bz * dx) / t.det
        if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8)
          y = Math.max(y, t.a[1] + u * t.by + v * t.cy)
      }
    for (const floor of floors) {
      if (inRect(x, z, floor) && (!floor.polygon || circleHits(x, z, 0, floor.polygon)))
        return Math.max(y, floor.level(x, z))
    }
    return y
  }
  function waterAt(x, z) {
    return (
      !bridge(x, z) &&
      x > 78 &&
      x < 209 &&
      z > -278 &&
      z < 44 &&
      terrainHeight(x, z) < waterLevel - 0.06 &&
      !floors.some((f) => f.aboveWater && inRect(x, z, f))
    )
  }
  function road(points, width = 10, kind = 'road') {
    const path = points.map(([x, z]) => ({ x, z }))
    roads.push(path)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i],
        dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz)
      segments.push({ a, b, dx, dz, len, sx: dz / len, sz: -dx / len, width, kind })
    }
  }
  const eastWest = [-110, -64, 0, 64]
  for (const z of [60, 0, -80, -130, -180])
    road(
      [...eastWest, ...(z === crossingZ ? [west, east] : [z === -130 ? 84 : z === -80 ? 90 : 105])].map(x => [x, z]),
      z === -80 ? 11 : 9,
    )
  for (const x of [-64, 0, 64]) {
    const axis =
      x === 0 ? [103, 60, 0, -80, -130, -180, -240, -300] : [90, 60, 0, -80, -130, -180, -212]
    road(
      axis.map((z) => [x, z]),
      x === 0 ? 11 : 9,
    )
  }
  road(
    [
      [0, -240],
      [28, -259],
      [59, -264],
      [83, -287],
      [75, -310],
      [99, -331],
      [140, -340],
      [145, -354],
      [125, -373],
    ],
    7,
    'dirt',
  )
  road(
    [
      [-110, 60],
      [-146, 69],
      [-177, 44],
      [-190, 6],
      [-203, -44],
      [-181, -76],
      [-110, -80],
    ],
    6,
    'dirt',
  )
  road(
    [
      [246, -180],
      [259, -149],
      [271, -125],
    ],
    6,
    'dirt',
  )
  function distanceTo(s, x, z) {
    const t = clamp(((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / (s.len * s.len), 0, 1)
    return Math.hypot(x - s.a.x - s.dx * t, z - s.a.z - s.dz * t)
  }
  function closestRoad(x, z, pad = 0) {
    for (const s of segments) {
      if (distanceTo(s, x, z) <= s.width / 2 + pad) return s
    }
    return null
  }
  function surface(x, z) {
    if (waterAt(x, z)) return 'water'
    const s = closestRoad(x, z)
    if (s) return s.kind
    if (x > -94 && x < 100 && z < -17 && z > -203) return 'road'
    return z < -257 ? 'dirt' : 'grass'
  }
  function signalOpen(axis, x = 0, z = 0) {
    const phase =
      (signalTime + Math.abs(Math.round(x / 64)) * 3 + Math.abs(Math.round(z / 61)) * 2) % 22
    return axis === 'x' ? phase >= 11 && phase < 20.5 : phase < 9.5
  }
  function tree(x, z, h, kind = 'fir') {
    if (waterAt(x, z) || bridge(x, z)) return
    if (kind === 'alder' && h < 2.1) kind = 'shrub'
    trees.push({
      x,
      z,
      h,
      kind: kind + (random() < 0.5 ? '1' : '2'),
      mirror: random() < 0.5 ? -1 : 1,
      shade: 0.83 + random() * 0.24,
    })
    if (h > 2.1 && clearance(x, z) >= 0) {
      const radius = Math.max(0.095, h * (kind === 'fir' ? 0.018 : 0.023) * 1.08)
      const trunk = rectangle(
        x,
        z,
        radius * 2,
        radius * 2,
        terrainHeight(x, z) - 0.2,
        terrainHeight(x, z) + h * 0.8,
      )
      trunk.poly = Array.from({ length: 10 }, (_, i) => [
        x + radius * Math.cos((i * Math.PI) / 5),
        z + radius * Math.sin((i * Math.PI) / 5),
      ])
    }
  }
  function stone(x, z, size) {
    rocks.push({ x, z, size, rot: random() * 6.28 })
  }
  // Terrain pages are loaded into the scene as their disk intersects the
  // draw distance. The underlying height field stays available to physics.
  const terrainPages = new Map(),
    terrainMat = m.grass.clone()
  terrainMat.vertexColors = true
  const dirtUniform = { value: m.dirt.map },
    gravelUniform = { value: art.texture('gravel') }
  const baseGrass = terrainMat.map,
    baseSoil = m.dirt.map,
    baseRock = art.texture('rock')
  const swardRelief = art.texture('sward-relief', false),
    soilRelief = art.texture('soil-relief', false)
  const dampGround = { value: 0 }
  // Sample these channels as linear data: tangent normal X/Y and measured roughness.
  const soilCoordinates = `vec2 soilCoordinates(vec2 p){
    return vec2(p.x,-p.y)/1.30 + .17*vec2(sin(p.y*.39+p.x*.16),cos(p.x*.31-p.y*.19));
  }`
  m.dirt.normalMap = soilRelief
  m.dirt.onBeforeCompile = (shader) => {
    shader.uniforms.uDamp = dampGround
    shader.vertexShader =
      'varying vec2 trailPosition;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntrailPosition=position.xz;',
      )
    shader.fragmentShader =
      soilCoordinates +
      '\nuniform float uDamp; varying vec2 trailPosition;\n' +
      shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `
      vec2 soilUV=soilCoordinates(trailPosition);
      vec3 detail=texture2D(normalMap,soilUV).rgb;
      diffuseColor.rgb*=texture2D(map,soilUV).rgb*(1.-uDamp*.19);
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor=clamp(.60+.36*detail.b-uDamp*.23,.34,1.);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      vec2 relief=(detail.rg*2.-1.)*.60;
      normal=normalize(tbn*vec3(relief,sqrt(max(.01,1.-dot(relief,relief)))));
    `,
      )
  }
  const rockUniform = { value: baseRock }
  let detailGeneration = 0,
    detailTextures = []
  async function setTerrainDetail(level, anisotropy) {
    const revision = ++detailGeneration
    const baseFiltering = Math.min(anisotropy, { Low: 1, Medium: 2, High: 4, Ultra: 8 }[level])
    for (const tex of art.textures) {
      if (tex.anisotropy !== baseFiltering) {
        tex.anisotropy = baseFiltering
        tex.needsUpdate = true
      }
    }
    terrainMat.map = baseGrass
    terrainMat.normalMap = swardRelief
    terrainMat.bumpMap = null
    dirtUniform.value = m.dirt.map = baseSoil
    terrainMat.needsUpdate = true
    rockUniform.value = baseRock
    for (const tex of detailTextures) tex.dispose()
    detailTextures = []
    if (level !== 'High' && level !== 'Ultra') return
    const suffix = level === 'Ultra' ? 'detail' : 'high',
      loaded = []
    try {
      for (const file of ['grass-' + suffix, 'rock-' + suffix, 'grass-normal', 'soil-high']) {
        const tex = await new THREE.TextureLoader().loadAsync('assets/world/' + file + '.webp')
        loaded.push(tex)
        if (detailGeneration !== revision) {
          loaded.forEach((t) => t.dispose())
          return
        }
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.anisotropy = anisotropy
        if (!file.endsWith('normal')) tex.colorSpace = THREE.SRGBColorSpace
      }
      detailTextures = loaded
      rockUniform.value = loaded[1]
      terrainMat.map = loaded[0]
      terrainMat.bumpMap = null
      terrainMat.normalMap = loaded[2]
      terrainMat.normalScale.setScalar(0.35)
      terrainMat.needsUpdate = true
      dirtUniform.value = m.dirt.map = loaded[3]
    } catch {
      loaded.forEach((t) => t.dispose())
    }
  }
  const terrainSnow = { value: new THREE.Color(0xe5e9e9) }
  const tufts = { value: art.texture('meadow-tufts') }
  const grassCover = { value: art.texture('meadow-cover') }
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassCover = grassCover
    shader.uniforms.uTrailCoverage = { value: trailWear.map }
    shader.uniforms.uTrailTransform = { value: trailWear.transform }
    shader.uniforms.uTufts = tufts
    shader.uniforms.uDamp = dampGround
    shader.uniforms.uSoilRelief = { value: soilRelief }
    shader.uniforms.uSoil = dirtUniform
    shader.uniforms.uGravel = gravelUniform
    shader.uniforms.uRock = rockUniform
    shader.uniforms.uSnow = terrainSnow
    shader.vertexShader =
      'attribute float soil; varying float vSoil; varying vec3 vGroundNormal; varying float vAltitude;\nvarying vec3 vLandscape;\n' +
      shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSoil=soil;vGroundNormal=normal;vAltitude=position.y;vLandscape=position;',
    )
    shader.fragmentShader =
      'uniform sampler2D uGrassCover;\n' +
      soilCoordinates +
      '\nuniform sampler2D uTrailCoverage; uniform vec4 uTrailTransform; uniform sampler2D uTufts; uniform float uDamp; uniform sampler2D uSoilRelief; varying float vSoil; varying vec3 vGroundNormal; uniform sampler2D uSoil; uniform sampler2D uGravel; uniform sampler2D uRock;uniform vec3 uSnow;varying float vAltitude;varying vec3 vLandscape;\n' +
      shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `float rangeToEye=distance(vLandscape,cameraPosition);
      float farBlend=smoothstep(75.,135.,rangeToEye);
      vec3 face=normalize(vGroundNormal);
      float slope=1.-abs(face.y);
      float trail=vSoil;
      if(vSoil>.001 && farBlend<1.) {
        float worn=texture2D(uTrailCoverage,(vLandscape.xz+uTrailTransform.xy)*uTrailTransform.zw).r;
        trail=mix(worn,vSoil,farBlend);
      }
      vec3 broad=mix(vec3(.18,.22,.105),vec3(.17,.135,.088),trail);
      vec2 pastureUV=vLandscape.xz/39.+.24*vec2(sin(vLandscape.z*.024),sin(vLandscape.x*.033));
      vec3 pasture=texture2D(uGrassCover,pastureUV).rgb;
      float meadowCover=smoothstep(.065,.25,dot(pasture,vec3(.23,.61,.16)));
      broad=mix(broad,mix(broad*vec3(.76,.8,.66),pasture*vec3(1.12,1.24,.93),.45+.31*meadowCover),1.-trail);
      if(farBlend>0. && (vAltitude>40. || slope>.05)) {
        // One low-frequency rock sample carries strata, scree and broken snow lines at distance.
        vec2 strata=vLandscape.xz*.024+vec2(vAltitude*.028,-vAltitude*.019);
        vec3 mineral=texture2D(uRock,strata).rgb;
        float grain=dot(mineral,vec3(.26,.56,.18));
        float bedrock=max(smoothstep(.055,.32,slope),smoothstep(55.,130.,vAltitude));
        float bands=.5+.5*sin(vAltitude*.32+vLandscape.x*.031+sin(vLandscape.z*.058)*2.4);
        vec3 screeColor=mix(vec3(.115,.122,.108),vec3(.22,.195,.154),smoothstep(.2,.88,bands));
        broad=mix(broad*(.88+.35*grain),mix(screeColor,mineral,.68),bedrock);
        float snowline=vAltitude-32.*slope+12.*face.z+27.*(grain-.35);
        float cover=smoothstep(127.,167.,snowline)*(1.-smoothstep(.19,.60,slope));
        broad=mix(broad,uSnow,cover*.9);
      }
      vec2 tangentRelief=vec2(0.);
      float groundRough=.89;
      if(farBlend<1.) {
      vec2 ground=vLandscape.xz;
      // Dephase nearby grass tufts without stretching their physical 2.51-metre footprint.
      vec2 grassUV=vec2(ground.x,-ground.y)/2.51+.22*vec2(sin(ground.y*.33+ground.x*.11),cos(ground.x*.37-ground.y*.16));
      vec3 blades=texture2D(map,grassUV).rgb;
      float micro=1.-smoothstep(24.,54.,rangeToEye);
      vec3 relief=vec3(.5,.5,.76);
      if(micro>.001) relief=mix(relief,texture2D(normalMap,grassUV).rgb,micro);
      float meadow=.5+.27*sin(ground.x*.068+.95*sin(ground.y*.081))+.20*cos(ground.y*.049-ground.x*.016);
      vec3 clumps=texture2D(uTufts,mat2(.89,.456,-.456,.89)*grassUV*1.23+vec2(.31,.67)).rgb;
      blades=mix(blades,clumps,.20+.49*smoothstep(.21,.77,1.-meadow));
      float tufts=clamp((blades.g-blades.r)*4.+.51,0.,1.);
      diffuseColor.rgb=blades*mix(vec3(.91,1.10,.85),vec3(1.08,1.02,.90),meadow);
      diffuseColor.rgb*=mix(vec3(.91,1.02,.88),vec3(1.09,1.03,.9),meadowCover);
      tangentRelief=(relief.rg*2.-1.)*.68;
      groundRough=.59+.38*relief.b;
      float dryness=meadow+.12*sin(ground.y*.131+cos(ground.x*.074))-.19*tufts;
      float earth=smoothstep(.04,.94,max(trail+.19*(dryness-.4)*sin(trail*3.14159),smoothstep(.39,.80,dryness)*(.52+.32*smoothstep(8.,68.,vAltitude))));
      if(earth>.025) {
        vec2 soilUV=soilCoordinates(ground);
        vec2 turned=mat2(.79,.613,-.613,.79)*soilUV*.86+vec2(.37,.61);
        float soilBlend=smoothstep(.19,.80,meadow+.17*sin(ground.x*.33+ground.y*.17));
        vec3 soil=mix(texture2D(uSoil,soilUV).rgb,texture2D(uSoil,turned).rgb,soilBlend);
        vec3 soilMicro=vec3(.5,.5,.72);
        if(micro>.001){
          vec3 baseMicro=texture2D(uSoilRelief,soilUV).rgb;
          vec3 turnedMicro=texture2D(uSoilRelief,turned).rgb;
          turnedMicro.rg=mat2(.79,-.613,.613,.79)*(turnedMicro.rg-.5)+.5;
          soilMicro=mix(soilMicro,mix(baseMicro,turnedMicro,soilBlend),micro);
        }
        diffuseColor.rgb=mix(diffuseColor.rgb,soil,earth);
        tangentRelief=mix(tangentRelief,(soilMicro.rg*2.-1.)*.60,earth);
        groundRough=mix(groundRough,.60+.36*soilMicro.b,earth);
      }
      float scree=clamp(smoothstep(.05,.26,slope)*(.49+.49*meadow)+sin(trail*3.14159)*.33,0.,1.);
      if(scree>.01) {
        vec3 gravel=texture2D(uGravel,ground/3.+vec2(vAltitude*.11,0.)).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,gravel,scree);
        tangentRelief*=1.-.64*scree;
        groundRough=mix(groundRough,.76+.17*gravel.g,scree);
      }
      float patchNoise=meadow;
      float rockMix=max(smoothstep(.12,.43,slope),smoothstep(65.,131.,vAltitude+14.*patchNoise)*.82);
      if(rockMix>.006) {
      vec3 r=texture2D(uRock,ground*.23).rgb;
      if(slope>.10) {
        vec3 cliffX=texture2D(uRock,vec2(ground.y,vAltitude)*.23).rgb;
        vec3 cliffZ=texture2D(uRock,vec2(ground.x,vAltitude)*.23).rgb;
        r=mix(r,mix(cliffZ,cliffX,smoothstep(-.2,.2,abs(face.x)-abs(face.z))),smoothstep(.10,.42,slope));
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,r,rockMix);
      groundRough=mix(groundRough,.69+.21*r.g,rockMix);
      tangentRelief*=1.-rockMix;
      }
      float snow=smoothstep(112.,141.,vAltitude+7.*sin(vLandscape.x*.085)+8.*cos(vLandscape.z*.15));
      diffuseColor.rgb=mix(diffuseColor.rgb,uSnow,snow);
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,broad,farBlend)*(1.-.19*uDamp);
      tangentRelief*=1.-farBlend;
    `,
    )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor=clamp(groundRough-uDamp*.20,.36,1.);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        'normal=normalize(tbn*vec3(tangentRelief,sqrt(max(.01,1.-dot(tangentRelief,tangentRelief)))));',
      )
  }
  terrainMat.normalMap = swardRelief
  let drawDistance = 395
  const pageSize = tileSize,
    groves = new Map()
  function groveAt(x, z) {
    const ix = Math.floor(x / pageSize),
      iz = Math.floor(z / pageSize),
      key = ix + ',' + iz
    if (!groves.has(key)) {
      const group = new THREE.Group()
      group.userData = { x: (ix + 0.5) * pageSize, z: (iz + 0.5) * pageSize }
      scene.add(group)
      groves.set(key, group)
    }
    return [key, groves.get(key)]
  }
  const trails = segments
    .filter((s) => s.kind === 'dirt')
    .map((s) => ({
      s,
      left: Math.min(s.a.x, s.a.x + s.dx) - 14,
      right: Math.max(s.a.x, s.a.x + s.dx) + 14,
      near: Math.min(s.a.z, s.a.z + s.dz) - 14,
      far: Math.max(s.a.z, s.a.z + s.dz) + 14,
    }))
  const trailWear = bakeTrailWear(trails, distanceTo)
  function soilAt(x, z) {
    for (const t of trails)
      if (x >= t.left && x <= t.right && z >= t.near && z <= t.far) {
        const weight = 1 - smooth(t.s.width * 0.5, t.s.width * 0.5 + 9, distanceTo(t.s, x, z))
        if (weight > 0) return weight
      }
    return 0
  }
  function loadTerrain(ix, iz, detailed) {
    const mesh = terrainTile(ix, iz, rawHeight, soilAt, terrainMat, detailed)
    mesh.userData.detailed = detailed
    scene.add(mesh)
    terrainPages.set(ix + ',' + iz, mesh)
  }
  function stream(x, z, force = false) {
    if (!force && Math.hypot(x - cullX, z - cullZ) < 16) return
    cullX = x
    cullZ = z
    rockLOD(x, z, quality)
    const distance = drawDistance
    for (const g of art.chunks.values())
      g.visible = Math.hypot(x - g.userData.x, z - g.userData.z) < distance + 68
    for (const g of groves.values())
      g.visible = Math.hypot(x - g.userData.x, z - g.userData.z) < distance + 140
    // The ground must also fill the far corners of the perspective frustum.
    const groundDistance = distance * 1.65 + 155
    const r = Math.ceil(groundDistance / pageSize),
      cx = Math.floor(x / pageSize),
      cz = Math.floor(z / pageSize),
      active = new Set()
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const ix = cx + i,
          iz = cz + j
        const tileDistance = Math.hypot(x - (ix + 0.5) * pageSize, z - (iz + 0.5) * pageSize)
        if (tileDistance > groundDistance) continue
        const key = ix + ',' + iz
        active.add(key)
        const old = terrainPages.get(key)
        const detailRange = { low: 65, medium: 120, high: 200, ultra: 300 }[quality] + 136
        const detailed =
          ix >= -4 &&
          ix < 4 &&
          iz >= -4 &&
          iz < 3 &&
          ((iz === -1 && (ix === 0 || ix === 1)) || tileDistance < detailRange + (old?.userData.detailed ? 32 : 0))
        if (old && old.userData.detailed !== detailed) {
          scene.remove(old)
          old.geometry.dispose()
        }
        if (!old || old.userData.detailed !== detailed) loadTerrain(ix, iz, detailed)
      }
    for (const [key, mesh] of terrainPages)
      if (!active.has(key)) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        terrainPages.delete(key)
      }
  }
  function at(s, t, lift, offset) {
    const x = s.a.x + s.dx * t + s.sx * offset,
      z = s.a.z + s.dz * t + s.sz * offset
    return [x, (bridge(x, z) ? crossingGrade(x) : terrainHeight(x, z)) + lift, z]
  }
  function strip(s, t0, t1, o0, o1, lift, mat, tint) {
    const scale = m[mat].userData.scale
    const u0 = o0 / (scale[0] || 1),
      u1 = o1 / (scale[0] || 1),
      v0 = (t0 * s.len) / (scale[1] || 1),
      v1 = (t1 * s.len) / (scale[1] || 1)
    const points = [
      at(s, t0, lift, o0),
      at(s, t1, lift, o0),
      at(s, t1, lift, o1),
      at(s, t0, lift, o1),
    ]
    if (mat === 'asphalt' || mat === 'concrete') recordPavement(points)
    poly(
      points,
      mat,
      tint,
      [
        [u0, v0],
        [u0, v1],
        [u1, v1],
        [u1, v0],
      ],
    )
  }
  const cornerRadius = 3.4,
    walkWidth = 2
  const streetRows = [60, 0, -80, -130, -180],
    streetColumns = [-64, 0, 64]
  function crossingWidth(s, p) {
    if (!streetRows.includes(p.z) || !streetColumns.includes(p.x)) return 0
    return s.dx === 0 ? (p.z === -80 ? 5.5 : 4.5) : p.x === 0 ? 5.5 : 4.5
  }
  for (const s of segments) {
    const paved = s.kind === 'road'
    const crossing = paved && s.a.x === west && s.a.z === crossingZ && s.b.x === east
    const urban = Math.max(s.a.z, s.b.z) >= -180 && Math.max(Math.abs(s.a.x), Math.abs(s.b.x)) < 111
    const lanes = s.width / 2,
      steps = crossing ? s.len / 3 : Math.ceil(s.len / 4)
    const startWidth = crossingWidth(s, s.a),
      endWidth = crossingWidth(s, s.b)
    const startCut = paved && s.dx === 0 ? startWidth / s.len : 0
    const endCut = 1 - (paved && s.dx === 0 ? endWidth / s.len : 0)
    const walkStart = startWidth ? (startWidth + cornerRadius) / s.len : 0
    const walkEnd = endWidth ? 1 - (endWidth + cornerRadius) / s.len : 1
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps,
        t1 = (i + 1) / steps
      const lift = 0.048 + (s.dx !== 0 ? 0.004 : 0)
      const rt0 = Math.max(t0, startCut),
        rt1 = Math.min(t1, endCut)
      if (paved && rt1 > rt0) strip(s, rt0, rt1, -lanes, lanes, lift, 'asphalt', 0xb2b6b5)
      if (paved && (urban || crossing)) {
        for (const side of [-1, 1]) {
          const off = side * lanes,
            edge = side * (lanes + 2)
          const midX = s.a.x + (s.dx * (t0 + t1)) / 2
          const curbCut = s.a.z === 60 && s.dz === 0 && side === -1 && midX > -23 && midX < -5
          const from = Math.max(t0, walkStart),
            to = Math.min(t1, walkEnd)
          if (!curbCut && to > from) {
            strip(s, from, to, Math.min(off, edge), Math.max(off, edge), 0.11, 'concrete', 0xc6c7c2)
            // Expansion cuts follow the dimensions of the poured sidewalk slabs.
            strip(
              s,
              from,
              Math.min(to, from + 0.021 / s.len),
              Math.min(off, edge),
              Math.max(off, edge),
              0.112,
              'solid',
              0x928e83,
            )
            strip(
              s,
              from,
              to,
              Math.min(off, off + side * 0.17),
              Math.max(off, off + side * 0.17),
              0.115,
              'concrete',
              0xbcbbae,
            )
            const edgeQuad = [
              at(s, from, 0.112, off),
              at(s, to, 0.112, off),
              at(s, to, 0.04, off),
              at(s, from, 0.04, off),
            ]
            poly(side < 0 ? edgeQuad : edgeQuad.reverse(), 'concrete', 0xb2b0a5)
          }
        }
      }
      const markStart = Math.max(t0, startWidth ? (startWidth + 2.9) / s.len : 0)
      const markEnd = Math.min(t1, endWidth ? 1 - (endWidth + 2.9) / s.len : 1)
      if (paved && markEnd > markStart) {
        for (const off of [-0.152, 0.152])
          strip(s, markStart, markEnd, off - 0.064, off + 0.064, 0.069, 'marking', 0xc2a56b)
      }
    }
    // A joined gravel apron covers the outside of each mountain switchback.
    if (!paved) {
      const center = [s.a.x, height(s.a.x, s.a.z) + 0.043, s.a.z]
      for (let i = 0; i < 12; i++) {
        const v = (k) => {
          const a = (k / 12) * Math.PI * 2,
            x = center[0] + Math.cos(a) * lanes,
            z = center[2] + Math.sin(a) * lanes
          return [x, height(x, z) + 0.044, z]
        }
        poly([center, v(i + 1), v(i)], 'dirt', 0xd9d3c5)
      }
    }
  }
  // Tangential quarter-circles share endpoints with both straight walks.
  function topFace(points, material, tint) {
    const [a, b, c] = points
    if ((b[2] - a[2]) * (c[0] - a[0]) < (b[0] - a[0]) * (c[2] - a[2])) points.reverse()
    recordPavement(points)
    const scale = m[material].userData.scale
    poly(
      points,
      material,
      tint,
      points.map(([x, , z]) => [x / scale[0], z / scale[1]]),
    )
  }
  for (const x of streetColumns)
    for (const z of streetRows) {
      const hx = x === 0 ? 5.5 : 4.5,
        hz = z === -80 ? 5.5 : 4.5
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const cx = x + sx * (hx + cornerRadius),
            cz = z + sz * (hz + cornerRadius)
          function vertex(angle, radius, lift) {
            const xx = cx - sx * radius * Math.cos(angle),
              zz = cz - sz * radius * Math.sin(angle)
            return [xx, terrainHeight(xx, zz) + lift, zz]
          }
          const ax = x + sx * hx,
            az = z + sz * hz
          const anchor = [ax, terrainHeight(ax, az) + 0.052, az]
          for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 20,
              b = ((i + 1) * Math.PI) / 20
            const band = (outer, inner, h) => [
              vertex(a, outer, h),
              vertex(b, outer, h),
              vertex(b, inner, h),
              vertex(a, inner, h),
            ]
            topFace(
              [anchor, vertex(a, cornerRadius, 0.052), vertex(b, cornerRadius, 0.052)],
              'asphalt',
              0xb2b6b5,
            )
            topFace(band(cornerRadius, cornerRadius - walkWidth, 0.11), 'concrete', 0xc6c7c2)
            topFace(band(cornerRadius, cornerRadius - 0.17, 0.115), 'concrete', 0xbcbbae)
            const face = [
              vertex(a, cornerRadius, 0.115),
              vertex(b, cornerRadius, 0.115),
              vertex(b, cornerRadius, 0.04),
              vertex(a, cornerRadius, 0.04),
            ]
            poly(sx * sz < 0 ? face.reverse() : face, 'concrete', 0xb2b0a5)
          }
        }
    }
  // Fascia, piers and guardrails follow the same deck stations as the asphalt.
  for (let x = 78; x < 180; x += 3) {
    const y = crossingGrade(x),
      next = crossingGrade(x + 3)
    for (const side of [-1, 1]) {
      const z = crossingZ + side * deckEdge
      const face = [
        [x, y + 0.11, z],
        [x + 3, next + 0.11, z],
        [x + 3, next - 0.55, z],
        [x, y - 0.55, z],
      ]
      poly(side > 0 ? face.reverse() : face, 'concrete', 0xa7a7a1)
      const railZ = z - side * 0.14
      if ((x - 78) % 6 === 0) box(x, y + 0.11, railZ, 0.12, 0.98, 0.13, 'metal', 0x647071)
      if (x === 177) box(x + 3, next + 0.11, railZ, 0.12, 0.98, 0.13, 'metal', 0x647071)
      for (const h of [0.57, 1.06])
        rod([x, y + h, railZ], [x + 3, next + h, railZ], 0.06, 0.06, 'metal', 0xb9c3be, 8)
      rectangle(x + 1.5, railZ, 3, 0.14, y + 0.08, next + 1.13)
    }
    if ((x - 78) % 18 === 0 && x > 78) {
      for (const offset of [-3.5, 3.5]) {
        const z = crossingZ + offset,
          base = terrainHeight(x, z) - 0.25
        box(x, base, z, 0.9, Math.max(0.1, y - 0.4 - base), 1.15, 'concrete', 0x979990)
      }
      box(x, y - 0.6, crossingZ, 1.3, 0.5, 2 * deckEdge, 'concrete', 0xa0a198)
    }
    poly(
      [
        [x, y - 0.54, crossingZ - deckEdge],
        [x + 3, next - 0.54, crossingZ - deckEdge],
        [x + 3, next - 0.54, crossingZ + deckEdge],
        [x, y - 0.54, crossingZ + deckEdge],
      ],
      'concrete',
      0x888c85,
    )
  }
  const context = {
    doorOccupied: (...args) => doorOccupancyTest(...args),
    ...art,
    city,
    scene,
    random,
    locations,
    buildings,
    interactables,
    rectangle,
    height,
    tree,
    stone,
    closestRoad,
    waterAt,
    lights,
    dynamic,
    signalOpen,
    floors,
    interiors, canopies,
    observer,
  }
  populateTown(context)
  const roofs = interiors.concat(canopies)
  function sheltered(x, y, z) {
    return roofs.some(r => y < r.roof && inRect(x, z, r))
  }
  // Use the same volumes for precipitation, pavement shading and reflections.
  const rainShader = 'bool rainSheltered(vec3 p){' + roofs.map(r =>
    `if(p.y < ${r.roof.toFixed(3)} && all(lessThanEqual(abs(p.xz - vec2(${r.x.toFixed(3)},${r.z.toFixed(3)})),vec2(${(r.w/2).toFixed(3)},${(r.d/2).toFixed(3)})))) return true;`
  ).join('\n') + 'return false;}'
  for (const mat of [m.asphalt, m.concrete]) {
    const road = mat === m.asphalt
    mat.roughness = road ? .95 : .88
    if (road) mat.metalness = .04
    mat.onBeforeCompile = shader => {
      shader.uniforms.surfaceRain = dampGround
      shader.vertexShader = 'varying vec3 rainPosition;\n' + shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nrainPosition=(modelMatrix*vec4(transformed,1.)).xyz;')
      shader.fragmentShader = rainShader + '\nvarying vec3 rainPosition;uniform float surfaceRain;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\nfloat rainAmount=rainSheltered(rainPosition)?0.:surfaceRain;' +
        (road ? 'diffuseColor.rgb*=1.-rainAmount*.27;' : ''))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor*=1.-rainAmount*' + (road ? '.758;' : '.432;'))
      if (road) shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor+=rainAmount*.28;')
    }
    mat.customProgramCacheKey = () => 'rain-' + mat.name
  }
  // Short grass follows meadow margins. Damp hollows support larger fern stands.
  // A separate seeded sequence keeps the county's trees and rock colliders reproducible.
  const scatter = generator(743195)
  for (const [cx, cz, radius] of [
    [-148, 68, 54],
    [-188, 4, 63],
    [45, -259, 49],
    [99, -323, 44],
    [132, -357, 32],
    [-149, -77, 43],
    [268, -131, 35],
    [-88, 126, 44],
  ]) {
    for (let i = 0; i < 55; i++) {
      const a = scatter() * Math.PI * 2,
        dist = Math.sqrt(scatter()) * radius
      const x = cx + Math.cos(a) * dist,
        z = cz + Math.sin(a) * dist
      const fern = scatter() < 0.18
      for (let j = 0; j < (fern ? 3 : 7); j++) {
        const xx = x + (scatter() - 0.5) * 6,
          zz = z + (scatter() - 0.5) * 5
        if (closestRoad(xx, zz, 0.15) || waterAt(xx, zz) || blocked(xx, zz, 0.28, height(xx, zz)))
          continue
        city.place(fern ? 'bracken-fern' : 'grass-clump', xx, height(xx, zz) - 0.045, zz, {
          plant: true,
          scale: fern ? 0.42 + scatter() * 0.4 : 0.27 + scatter() * 0.48,
          yaw: scatter() * 6.28,
        })
      }
    }
  }

  // Thickets and clearings follow the same road network as the traffic.
  for (let i = 0; i < 3700; i++) {
    const x = -450 + random() * 900,
      z = -535 + random() * 810
    const inTown = x > -116 && x < 103 && z > -216 && z < 107
    if (inTown || closestRoad(x, z, 3.5) || waterAt(x, z) || blocked(x, z, 3, height(x, z)))
      continue
    if (
      Math.hypot(x - 124, z + 374) < 11 ||
      Math.hypot(x + 171, z - 11) < 35 ||
      Math.hypot(x - 8, z + 238) < 13
    )
      continue
    const grove = 0.5 + 0.5 * Math.sin(x * 0.047 + Math.sin(z * 0.032) * 1.7) * Math.cos(z * 0.052)
    if (random() > 0.3 + 0.56 * grove || height(x, z) > 125) continue
    tree(x, z, 6 + random() * 13, random() < 0.86 ? 'fir' : 'alder')
    if (i % 5 === 0) stone(x + 2, z + 1, 1 + random() * 2.3)
  }
  // Cluster trees on both sides of the foothills, leaving room to travel along the rim.
  // Use an independent seed so the existing county keeps its placement.
  const rimRandom = generator(16023)
  for (let k = 0; k < 340; k++) {
    const side = k % 4,
      along = (Math.floor(k / 4) + rimRandom()) / 85,
      band = Math.floor(k / 4) % 3 === 0 ? 22 + rimRandom() * 48 : -20 - rimRandom() * 44
    const cx = side < 2 ? (side === 0 ? -660 + band : 660 - band) : -650 + 1300 * along
    const cz = side >= 2 ? (side === 2 ? -690 + band : 470 - band) : -680 + 1140 * along
    for (let j = 0; j < 6; j++) {
      const x = cx + (rimRandom() - 0.5) * 22,
        z = cz + (rimRandom() - 0.5) * 22
      if (Math.abs(clearance(x, z)) > 10)
        tree(x, z, 7 + rimRandom() * 10, rimRandom() < 0.91 ? 'fir' : 'alder')
    }
  }
  const groveUniform = { value: new THREE.Vector3(-12, 1, 67) },
    windUniform = { value: 0 },
    plantBatches = []
  function bakePlants() {
    const variants = ['fir1', 'fir2', 'alder1', 'alder2', 'shrub1', 'shrub2'],
      ratios = [0.33, 0.41, 0.71, 0.92, 1.35, 1.62]
    const plane = new THREE.PlaneGeometry(1, 1)
    plane.translate(0, 0.5, 0)
    const temp = new THREE.Object3D(),
      tint = new THREE.Color()
    variants.forEach((kind, idx) => {
      const leaf = new THREE.MeshStandardMaterial({
        map: art.texture(kind),
        color: 0xd8d9c6,
        alphaTest: 0.31,
        side: THREE.DoubleSide,
        roughness: 0.94,
      })
      leaf.onBeforeCompile = (shader) => {
        shader.uniforms.uGroveEye = groveUniform
        shader.uniforms.uBreeze = windUniform
        shader.vertexShader =
          'uniform vec3 uGroveEye;uniform float uBreeze;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nobjectNormal=normalize(vec3(0.35,0.9,0.2));',
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec2 center=instanceMatrix[3].xz;
          vec2 toward=normalize(uGroveEye.xz-center+vec2(.0001)); vec2 side=vec2(toward.y,-toward.x);
          float blade=position.x+sin(uBreeze+center.x*.24+center.y*.13)*position.y*position.y*.008;
          transformed.x=blade*side.x; transformed.z=blade*side.y;
        `,
        )
      }
      const groups = new Map()
      for (const t of trees)
        if (t.kind === kind) {
          const [key, group] = groveAt(t.x, t.z)
          if (!groups.has(key)) groups.set(key, { group, items: [] })
          groups.get(key).items.push(t)
        }
      for (const { group, items } of groups.values()) {
        const mesh = new THREE.InstancedMesh(plane, leaf, items.length)
        items.forEach((t, i) => {
          t.y = terrainHeight(t.x, t.z) - 0.02
          temp.position.set(t.x, t.y, t.z)
          const width = t.h * ratios[idx]
          temp.scale.set(width, t.h, width)
          temp.rotation.set(0, 0, 0)
          temp.updateMatrix()
          mesh.setMatrixAt(i, temp.matrix)
          mesh.setColorAt(i, tint.setRGB(t.shade, t.shade, t.shade))
        })
        mesh.computeBoundingSphere()
        mesh.boundingSphere.radius += 14
        mesh.receiveShadow = true
        group.add(mesh)
        plantBatches.push({ mesh, count: items.length, items, kind, ratio: ratios[idx] })
      }
    })
  }
  bakePlants()
  const rockLOD = placeBoulders(rocks, art, height, rectangle)
  const treeLOD = createWoodland(scene, plantBatches, {
    fir: art.texture('fir-canopy'),
    alder: art.texture('alder-canopy'),
  })
  art.finish()
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x426f71,
    metalness: 0.24,
    roughness: 0.31,
    transparent: true,
    opacity: 0.91,
  })
  const waveTime = { value: 0 }
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWave = waveTime
    shader.vertexShader = 'varying vec2 vLake;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvLake=position.xy;',
    )
    shader.fragmentShader = 'varying vec2 vLake;uniform float uWave;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float swell=sin(vLake.y*3.4+vLake.x*.29+sin(vLake.x*1.5)+uWave*1.4);
      float ripple=sin(vLake.y*10.+vLake.x*.67-uWave*.8);
      normal=normalize(normal+vec3(swell*.06+ripple*.025,0.,ripple*.046));
      diffuseColor.rgb+=vec3(.014,.027,.026)*smoothstep(.84,1.,swell)*smoothstep(-.3,.9,ripple);
    `,
    )
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(139, 320), waterMat)
  water.rotation.x = -Math.PI / 2
  water.position.set(143, waterLevel, -116)
  scene.add(water)
  function setWetness(value = 0) {
    wet = clamp(Number(value) || 0, 0, 1)
    dampGround.value = wet

  }
  function setQuality(value, distance) {
    const q = String(value || 'high').toLowerCase()
    quality = ['low', 'medium', 'high', 'ultra'].includes(q) ? q : 'high'
    art.setSurfaceQuality(quality)
    drawDistance = distance ?? { low: 200, medium: 395, high: 560, ultra: 800 }[quality]
    const density = { low: 0.5, medium: 0.74, high: 0.91, ultra: 1 }[quality]
    for (const { mesh, count, kind } of plantBatches)
      if (kind.startsWith('shrub')) mesh.count = Math.max(1, Math.ceil(count * density))
    treeLOD(cullX === 9999 ? -12 : cullX, cullZ === 9999 ? 67 : cullZ, quality, true)
    stream(cullX === 9999 ? -12 : cullX, cullZ === 9999 ? 67 : cullZ, true)
  }
  let wasNight = -1,
    lastSignal = -1
  function update(dt, state = {}) {
    elapsed += dt
    signalTime += dt
    cullTimer += dt
    waveTime.value = elapsed
    windUniform.value = elapsed * 0.7
    const x = state.x ?? -12,
      z = state.z ?? 67
    groveUniform.value.set(x, 1, z)
    treeLOD(x, z, quality)
    observer.x = x
    observer.z = z
    if (cullTimer > 0.4) {
      cullTimer = 0
      stream(x, z)
    }
    const hour = state.hour ?? 14,
      night = 1 - smooth(-0.12, 0.13, Math.sin(((hour - 6) * Math.PI) / 12))
    city.update(x, z, quality, drawDistance, night)
    if (Math.abs(night - wasNight) > 0.045) {
      for (let i = 0; i < 3; i++) m['facade' + i].emissiveIntensity = night * 0.88
      m.lamp.emissiveIntensity = 0.05 + night * 2.7
      for (const light of lights) light.intensity = night * light.userData.power
      wasNight = night
    }
    const step = Math.floor(signalTime * 3)
    if (step !== lastSignal) {
      lastSignal = step
      for (const move of dynamic) move(dt, true)
    } else for (const move of dynamic) move(dt, false)
  }
  setQuality('medium')
  return {
    setDoorOccupancyTest(test) {
      doorOccupancyTest = test
    },
    height,
    blocked,
    doorCeiling,
    candidates,
    update,
    locations,
    roads,
    buildings,
    interactables,
    setQuality,
    setWetness,
    setTerrainDetail,
    surface,
    waterAt,
    waterLevel,
    signalOpen,
    indoors, sheltered, rainShader,
    get wetness() {
      return wet
    },
    get textures() {
      return art.textures
    },
  }
}
