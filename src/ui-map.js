const COUNTY = { minX: -220, maxX: 225, minZ: -422, maxZ: 130 }
const PARCHMENT = '#e4ead3'
const ORANGE = '#ff995f'
const lerp = (a, b, t) => a + (b - a) * t

// A cached survey of the playable terrain. Roads, buildings and markers share the
// same world coordinates as the simulation and the route planner.
function survey(world) {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity
  for (const line of world?.roads || [])
    for (const p of line) {
      minX = Math.min(p.x, minX)
      maxX = Math.max(p.x, maxX)
      minZ = Math.min(p.z, minZ)
      maxZ = Math.max(p.z, maxZ)
    }
  const bounds = Number.isFinite(minX)
    ? { minX: minX - 43, maxX: maxX + 43, minZ: minZ - 35, maxZ: maxZ + 35 }
    : COUNTY
  const terrainBounds = {
    minX: Math.min(-660, bounds.minX),
    maxX: Math.max(660, bounds.maxX),
    minZ: Math.min(-690, bounds.minZ),
    maxZ: Math.max(470, bounds.maxZ),
  }
  const tile = document.createElement('canvas')
  tile.width = 1030
  tile.height = Math.round(
    (tile.width * (terrainBounds.maxZ - terrainBounds.minZ)) /
      (terrainBounds.maxX - terrainBounds.minX),
  )
  const ctx = tile.getContext('2d'),
    nx = 128,
    nz = Math.round((nx * tile.height) / tile.width)
  const cellW = tile.width / nx,
    cellH = tile.height / nz
  const elevation = Array.from({ length: nz + 1 }, () => new Float32Array(nx + 1))
  const terrain = Array.from({ length: nz + 1 }, () => new Uint8Array(nx + 1))
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = lerp(terrainBounds.minX, terrainBounds.maxX, i / nx),
        z = lerp(terrainBounds.minZ, terrainBounds.maxZ, j / nz)
      elevation[j][i] = world?.height?.(x, z) || 0
      terrain[j][i] = world?.waterAt?.(x, z) ? 1 : 0
    }
  ctx.fillStyle = '#38493d'
  ctx.fillRect(0, 0, tile.width, tile.height)
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const h = elevation[j][i],
        dh = elevation[j + 1][i] - h + elevation[j][i + 1] - h
      const t = Math.min(14, Math.max(-7, h * 0.1 + dh * 0.7))
      ctx.fillStyle = terrain[j][i] ? '#304e55' : `rgb(${55 + t} ${72 + t} ${61 + t * 0.8})`
      ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1)
    }
  ctx.lineWidth = 0.8
  ctx.strokeStyle = '#a9b9a13b'
  ctx.beginPath()
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const values = [
        elevation[j][i],
        elevation[j][i + 1],
        elevation[j + 1][i + 1],
        elevation[j + 1][i],
      ]
      const lo = Math.min(...values),
        hi = Math.max(...values)
      const points = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ]
      for (let level = Math.floor(lo / 3) * 3 + 3; level <= hi; level += 3) {
        const hits = []
        for (let k = 0; k < 4; k++) {
          const next = (k + 1) % 4,
            a = values[k],
            b = values[next]
          if (a < level === b < level) continue
          const f = (level - a) / (b - a)
          hits.push([
            lerp(points[k][0], points[next][0], f) * cellW,
            lerp(points[k][1], points[next][1], f) * cellH,
          ])
        }
        for (let k = 0; k + 1 < hits.length; k += 2) {
          ctx.moveTo(...hits[k])
          ctx.lineTo(...hits[k + 1])
        }
      }
    }
  ctx.stroke()
  return { tile, bounds, terrainBounds }
}

function marker(ctx, point, color, radius, diamond = false) {
  ctx.save()
  ctx.translate(point.x, point.y)
  ctx.beginPath()
  ctx.fillStyle = color
  ctx.strokeStyle = '#253329'
  ctx.lineWidth = 1.4
  if (diamond) {
    ctx.rotate(Math.PI / 4)
    ctx.rect(-radius, -radius, radius * 2, radius * 2)
  } else ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export function createCartography() {
  let world = null,
    base = null
  const projections = new WeakMap()
  function draw(canvas, data, mode, zoom = 1, center = null) {
    if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return
    const source = data.world
    if (!base || (source && source !== world)) {
      world = source
      base = survey(world)
    }
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2)
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { bounds, tile, terrainBounds } = base,
      player = data.player || world?.locations?.home || { x: -12, z: 67 }
    const bx = bounds.maxX - bounds.minX,
      bz = bounds.maxZ - bounds.minZ
    let cx = (bounds.minX + bounds.maxX) / 2,
      cz = (bounds.minZ + bounds.maxZ) / 2
    let scale = Math.min((w - 25) / bx, (h - 25) / bz) * zoom
    if (mode === 'mini') {
      cx = player.x
      cz = player.z
      scale = w / (data.vehicle ? 130 : 87)
    }
    if (mode === 'overview') {
      cx = 2
      cz = -118
      scale = Math.max(w / 287, h / 230)
    }
    if (center) {
      cx = center.x
      cz = center.z
    }
    const project = (p) => ({ x: (p.x - cx) * scale + w / 2, y: (p.z - cz) * scale + h / 2 })
    projections.set(canvas, (x, y) => ({
      x: (x - w / 2) / scale + cx,
      z: (y - h / 2) / scale + cz,
    }))
    ctx.fillStyle = '#35463c'
    ctx.fillRect(0, 0, w, h)
    const start = project({ x: terrainBounds.minX, z: terrainBounds.minZ })
    ctx.drawImage(
      tile,
      start.x,
      start.y,
      (terrainBounds.maxX - terrainBounds.minX) * scale,
      (terrainBounds.maxZ - terrainBounds.minZ) * scale,
    )
    ctx.lineWidth = 0.6
    ctx.strokeStyle = '#d0dbbd1a'
    ctx.beginPath()
    const grid = (mode === 'mini' ? 20 : 50) * scale
    let gx = (w / 2 - cx * scale) % grid,
      gy = (h / 2 - cz * scale) % grid
    for (; gx < w; gx += grid) {
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, h)
    }
    for (; gy < h; gy += grid) {
      ctx.moveTo(0, gy)
      ctx.lineTo(w, gy)
    }
    ctx.stroke()
    ctx.fillStyle = mode === 'mini' ? '#879384' : '#728273'
    for (const b of world?.buildings || []) {
      const p = project({ x: b.x - b.w / 2, z: b.z - b.d / 2 }),
        bw = b.w * scale,
        bd = b.d * scale
      if (p.x > w || p.y > h || p.x + bw < 0 || p.y + bd < 0) continue
      ctx.fillRect(p.x, p.y, bw, bd)
    }
    function paths(lines, color, width) {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (const line of lines) {
        line.forEach((p, index) => {
          const q = project(p)
          if (index === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        })
      }
      ctx.stroke()
    }
    const roads = world?.roads || []
    paths(roads, '#233629', Math.max(1.8, 4.8 * scale))
    paths(roads, '#c3c8ac', Math.max(1, 2.6 * scale))
    if (mode !== 'overview' && data.route?.length > 1)
      paths([data.route], data.waypoint ? '#9dd2dc' : ORANGE, mode === 'mini' ? 2.4 : 2.8)
    const printed = []
    const locations = Object.entries(world?.locations || {}).filter(
      ([key]) => !['shop', 'garage'].includes(key),
    )
    for (const [key, loc] of locations) {
      const p = project(loc)
      if (p.x < 2 || p.x > w - 2 || p.y < 2 || p.y > h - 2) continue
      if (mode === 'full') {
        marker(ctx, p, '#d6dfbd', 2.8)
        const label = loc.name || key,
          offset = 7
        ctx.font = '600 10px "DM Sans",sans-serif'
        const tw = ctx.measureText(label).width
        const tx = p.x + tw + offset > w ? p.x - tw - offset : p.x + offset,
          ty = p.y + 3
        if (
          tx < 3 ||
          printed.some((r) => tx < r.x + r.w + 4 && tx + tw > r.x - 4 && Math.abs(r.y - ty) < 13)
        )
          continue
        printed.push({ x: tx, y: ty, w: tw })
        ctx.strokeStyle = '#273b32'
        ctx.lineWidth = 3
        ctx.strokeText(label, tx, ty)
        ctx.fillStyle = PARCHMENT
        ctx.fillText(label, tx, ty)
      } else if (mode === 'overview' && ['downtown', 'landmark1', 'trailhead'].includes(key))
        marker(ctx, p, ORANGE, 2.6, true)
    }
    if (mode !== 'overview') {
      for (const shop of data.shops || []) marker(ctx, project(shop), '#f5df8d', 3.4, true)
      const goal = data.missionTarget || (!data.waypoint ? data.target : null)
      if (goal) marker(ctx, project(goal), ORANGE, 4.2, true)
      if (data.waypoint) marker(ctx, project(data.waypoint), '#91d5e3', 4.2, true)
      const p = project(player)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(-(player.yaw || 0))
      ctx.beginPath()
      ctx.moveTo(0, -7)
      ctx.lineTo(5, 5)
      ctx.lineTo(0, 3.4)
      ctx.lineTo(-5, 5)
      ctx.closePath()
      ctx.strokeStyle = '#172c25'
      ctx.lineWidth = 2
      ctx.fillStyle = '#fbf5d9'
      ctx.stroke()
      ctx.fill()
      ctx.restore()
    }
  }
  return { draw, at: (canvas, x, y) => projections.get(canvas)?.(x, y) }
}
