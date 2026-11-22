import { buildBarn } from './barn.js'
import * as THREE from 'three'
import { fitBuilding } from './cityAssets.js'
import { foundryRow } from './foundryRow.js'
import { movingDoor } from './movingDoor.js'
import { hull } from './collision.js'
import { addWildlife } from './worldWildlife.js'

// All distances are in metres. Building footprints, portals, driveways and
// their collision shapes are authored together so the visible town is solid.
export function populateTown(w) {
  const {
    box,
    plate,
    poly,
    rod,
    standard,
    scene,
    materials,
    random: r,
    rectangle,
    buildings,
    interactables,
    height,
    tree,
    stone,
    lights,
    dynamic,
  } = w
  const frame = 0xe1ded0,
    iron = 0x404846,
    cedar = 0xb99570,
    post = 0x72776c
  const signCache = new Map(),
    signPages = []
  const contact = w.canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 5, 64, 64, 63)
    g.addColorStop(0, 'rgba(25,27,21,.38)')
    g.addColorStop(0.49, 'rgba(27,31,24,.23)')
    g.addColorStop(1, 'rgba(28,30,27,0)')
    c.fillStyle = g
    c.fillRect(0, 0, 128, 128)
  })
  standard(
    'contact',
    {
      map: contact,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    },
    [0, 0],
  )
  function shade(x, z, wid, dep, y = 0.06) {
    plate(x, y, z, wid, dep, 'contact')
  }
  function building(x, z, wid, d, h, base = height(x, z) - 0.1) {
    buildings.push({ x, z, w: wid, d })
    rectangle(x, z, wid, d, base, height(x, z) + h)
  }
  const sign = paintSign.bind(null, false)
  function paintSign(fitLetters, x, y, z, wid, h, text, subtitle = '', angle = 0, bg = '#31433d', fg = '#e9e4cd') {
    const key = [text, subtitle, bg, fg, fitLetters ? wid / h : 0].join('|')
    if (!signCache.has(key)) {
      // Share the shopfront and wayfinding artwork across a neighborhood draw.
      // The half-texel inset keeps the adjacent cells out of the letter borders.
      const slot = signCache.size % 64,
        page = Math.floor(signCache.size / 64)
      const W = 512,
        H = 128,
        col = slot % 4,
        row = Math.floor(slot / 4)
      if (!signPages[page]) {
        const map = w.canvasTexture(2048, 2048, () => {})
        map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
        signPages[page] = standard('signAtlas' + page, { map, roughness: 0.74 }, [0, 0])
      }
      const mat = signPages[page],
        c = mat.map.image.getContext('2d')
      c.save()
      c.translate(col * W, row * H)
      c.fillStyle = bg
      c.fillRect(0, 0, W, H)
      c.strokeStyle = fg
      c.globalAlpha = 0.45
      c.lineWidth = 2
      c.strokeRect(6, 6, W - 12, H - 12)
      c.globalAlpha = 1
      c.fillStyle = fg
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      if (fitLetters) {
        // Lay out type in the physical plaque's proportions before packing its atlas cell.
        const width = H * wid / h
        c.scale(W / width, 1)
        function line(value, weight, px, baseline) {
          c.font = weight + ' ' + px + 'px Arial, sans-serif'
          const fit = Math.min(1, (width - 32) / Math.max(1, c.measureText(value).width))
          c.font = weight + ' ' + px * fit + 'px Arial, sans-serif'
          c.fillText(value, width / 2, H * baseline)
        }
        line(text, 'bold', subtitle ? 55 : 71, subtitle ? .39 : .52)
        if (subtitle) line(subtitle, '500', 24, .76)
      } else {
        c.font = 'bold ' + (subtitle ? 44 : 52) + 'px Arial, sans-serif'
        c.fillText(text, W / 2, subtitle ? H * 0.4 : H * 0.52, W - 34)
        if (subtitle) {
          c.font = '500 19px Arial, sans-serif'
          c.fillText(subtitle, W / 2, H * 0.76, W - 44)
        }
      }
      c.restore()
      mat.map.needsUpdate = true
      const u = (col * W + 0.5) / 2048,
        u1 = ((col + 1) * W - 0.5) / 2048
      const v = 1 - ((row + 1) * H - 0.5) / 2048,
        v1 = 1 - (row * H + 0.5) / 2048
      signCache.set(key, {
        mat,
        uv: [
          [u, v],
          [u1, v],
          [u1, v1],
          [u, v1],
        ],
      })
    }
    const cs = Math.cos(angle),
      sn = Math.sin(angle),
      v = (u, yy) => [x + u * cs, y + yy, z - u * sn]
    const entry = signCache.get(key)
    poly(
      [v(-wid / 2, 0), v(wid / 2, 0), v(wid / 2, h), v(-wid / 2, h)],
      entry.mat,
      0xffffff,
      entry.uv,
    )
  }
  function bench(x, z, angle = 0) {
    const cs = Math.cos(angle),
      sn = Math.sin(angle)
    const at = (a, b) => [x + a * cs + b * sn, z + b * cs - a * sn]
    const b = (a, y, v, wi, h, d, mat, col) => {
      const [xx, zz] = at(a, v)
      box(xx, y, zz, wi, h, d, mat, col, angle)
    }
    for (const dx of [-0.66, 0.66]) {
      b(dx, 0.07, 0, 0.1, 0.39, 0.6, 'metal', iron)
      b(dx, 0.4, -0.27, 0.1, 0.57, 0.1, 'metal', iron)
    }
    for (let i = 0; i < 5; i++) b(0, 0.46, -0.25 + i * 0.12, 1.8, 0.08, 0.1, 'wood', 0xd6c7a1)
    for (let i = 0; i < 3; i++) b(0, 0.66 + i * 0.13, -0.26, 1.8, 0.1, 0.08, 'wood', 0xd6c7a1)
    shade(x, z, 2.3, 1.2, 0.127)
    rectangle(x, z, 1.65, 0.53, 0, 1)
    const [xx, zz] = at(0, 0.87)
    interactables.push({
      x: xx,
      z: zz,
      type: 'bench',
      label: 'Sit on bench',
      angle,
      seatX: x,
      seatZ: z,
      seatY: 0.49,
      yaw: angle + Math.PI,
      activate() {
        return 'Resting on the bench'
      },
    })
  }
  function timberFence(x1, z1, x2, z2, heightFence = 0.9, wood = true) {
    const dx = x2 - x1,
      dz = z2 - z1,
      d = Math.hypot(dx, dz),
      n = Math.ceil(d / 2.2),
      angle = -Math.atan2(dz, dx)
    const cm = wood ? 'wood' : 'metal',
      c = wood ? 0xcbbca1 : 0x657169
    for (let k = 0; k <= n; k++) {
      const x = x1 + (dx * k) / n,
        z = z1 + (dz * k) / n,
        y = height(x, z)
      box(x, y, z, 0.11, heightFence + 0.12, 0.11, cm, c)
    }
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n,
        x = x1 + dx * t,
        z = z1 + dz * t,
        y = height(x, z)
      for (const ry of [0.27, 0.77])
        box(x, y + heightFence * ry, z, d / n + 0.05, 0.085, 0.08, cm, c, angle)
    }
    if (Math.abs(dx) < 0.01 || Math.abs(dz) < 0.01)
      rectangle(
        (x1 + x2) / 2,
        (z1 + z2) / 2,
        Math.max(0.15, Math.abs(dx)),
        Math.max(0.15, Math.abs(dz)),
        height(x1, z1) - 0.05,
        height(x1, z1) + heightFence,
      )
  }
  function gable(x, y, z, wid, dep, rise, color, roof = 'roof') {
    const X = wid / 2,
      Z = dep / 2,
      ey = y + 0.05
    // Ridge runs east-west. The gable ends carry siding under the overhang.
    poly(
      [
        [x - X, y, z - Z],
        [x - X, y, z + Z],
        [x - X, y + rise, z],
      ],
      'siding',
      color,
    )
    poly(
      [
        [x + X, y, z + Z],
        [x + X, y, z - Z],
        [x + X, y + rise, z],
      ],
      'siding',
      color,
    )
    poly(
      [
        [x - X - 0.29, ey, z + Z + 0.3],
        [x + X + 0.29, ey, z + Z + 0.3],
        [x + X + 0.29, ey + rise, z],
        [x - X - 0.29, ey + rise, z],
      ],
      roof,
      0xe6e1d6,
    )
    poly(
      [
        [x + X + 0.29, ey, z - Z - 0.3],
        [x - X - 0.29, ey, z - Z - 0.3],
        [x - X - 0.29, ey + rise, z],
        [x + X + 0.29, ey + rise, z],
      ],
      roof,
      0xe6e1d6,
    )
    for (const s of [-1, 1])
      box(x, ey - 0.12, z + s * (Z + 0.29), wid + 0.66, 0.17, 0.12, 'solid', frame)
    box(x, y + rise + 0.03, z, wid + 0.7, 0.08, 0.17, 'metal', 0x606263)
  }
  function windowPane(x, y, z, wid, h, face, shutters = false) {
    box(x, y - 0.075, z + face * 0.025, wid + 0.23, h + 0.2, 0.12, 'solid', frame)
    box(x, y, z + face * 0.103, wid, h, 0.035, 'pane', 0xf1f2ed)
    for (const off of [-0.005]) box(x + off, y, z + face * 0.135, 0.052, h, 0.032, 'solid', frame)
    box(x, y + h * 0.54, z + face * 0.138, wid, 0.056, 0.035, 'solid', frame)
    box(x, y - 0.11, z + face * 0.103, wid + 0.31, 0.09, 0.25, 'solid', 0xc7c5b7)
    if (shutters)
      for (const side of [-1, 1]) {
        box(x + side * (wid / 2 + 0.26), y, z + face * 0.04, 0.32, h, 0.09, 'wood', 0x84948d)
        for (const off of [0.15, 0.85])
          box(
            x + side * (wid / 2 + 0.26),
            y + h * off,
            z + face * 0.1,
            0.35,
            0.07,
            0.04,
            'solid',
            0x70827b,
          )
      }
  }
  // Animated leaves of a door have their own mesh, while everything around
  // them stays in the neighborhood's static buffers.
  standard('utilityLight', { color: 0xffefdb, emissive: 0xffdfa9, emissiveIntensity: 1.05 })
  const doorHardware = new THREE.MeshStandardMaterial({
    color: 0xb0b2a7,
    metalness: 0.67,
    roughness: 0.36,
  })
  const doorWindow = new THREE.MeshStandardMaterial({
    color: 0xc1d5d0,
    transparent: true,
    opacity: 0.27,
    depthWrite: false,
    roughness: 0.17,
  })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x353c38, roughness: 0.86 })
  function door(
    x,
    z,
    face,
    color,
    label = 'Front door',
    type = 'door',
    wide = 1.13,
    tall = 2.13,
    roll = false,
  ) {
    const base = height(x, z),
      group = new THREE.Group()
    group.position.set(x - wide / 2, base, z)
    scene.add(group)
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.64 })
    const fittings = new THREE.Group()
    function part(cx, cy, cz, width, h, depth, mat) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, h, depth), mat)
      mesh.position.set(cx, cy, cz)
      mesh.castShadow = mat !== doorWindow
      mesh.receiveShadow = true
      if (mat === doorHardware || mat === rubber) fittings.add(mesh)
      else group.add(mesh)
    }
    const mid = wide / 2,
      stile = Math.min(0.17, wide * 0.13)
    // Build a real opening in the leaf so the glazing reads from either side.
    const sill = roll ? tall * 0.66 : tall * 0.46,
      head = roll ? tall * 0.82 : tall * 0.89
    part(mid, sill / 2, 0, wide, sill, 0.105, material)
    part(mid, (head + tall) / 2, 0, wide, tall - head, 0.105, material)
    for (const xx of [stile / 2, wide - stile / 2])
      part(xx, (sill + head) / 2, 0, stile, head - sill, 0.105, material)
    part(mid, (sill + head) / 2, 0, wide - 2 * stile, head - sill, 0.022, doorWindow)
    for (const yy of [sill, head]) part(mid, yy, 0, wide - 2 * stile, 0.034, 0.087, rubber)
    if (roll) {
      for (let i = 1; i < 5; i++)
        part(mid, (tall * i) / 6, 0.054, wide - 0.06, 0.027, 0.013, rubber)
      for (let i = 1; i < 6; i++)
        part((wide * i) / 6, (head + sill) / 2, 0, 0.067, head - sill, 0.085, material)
      part(mid, 0.12, face * 0.08, 0.43, 0.048, 0.08, doorHardware)
    } else {
      for (const f of [-1, 1]) {
        part(wide - 0.12, 1.0, f * 0.061, 0.13, 0.26, 0.022, doorHardware)
        part(wide - 0.175, 1.04, f * 0.086, 0.19, 0.043, 0.055, doorHardware)
        part(mid, 0.18, f * 0.054, wide - 0.13, 0.24, 0.012, doorHardware)
      }
      for (const yy of [0.29, tall - 0.33]) part(0.033, yy, 0, 0.065, 0.13, 0.126, doorHardware)
    }
    for (const dx of [-1, 1])
      box(x + dx * (mid + 0.035), base, z, 0.07, tall + 0.055, 0.24, 'metal', 0x667169)
    box(x, base + tall, z, wide + 0.14, 0.066, 0.24, 'metal', 0x667169)
    group.add(fittings)
    let open = false
    const motion = movingDoor(w, group, x, z, base, wide, tall, face, roll)
    const obj = {
      x,
      z: z + face * 0.6,
      type,
      label: 'Open ' + label.toLowerCase(),
      get isOpen() {
        return open
      },
      get fraction() {
        return motion.fraction
      },
      restoreDoor(value, fraction) {
        this.setOpen(value)
        motion.restore(
          Number.isFinite(fraction) ? THREE.MathUtils.clamp(fraction, 0, 1) : Number(open),
        )
      },
      setOpen(value) {
        open = Boolean(value)
        this.label = (open ? 'Close ' : 'Open ') + label.toLowerCase()
      },
      activate() {
        this.setOpen(!open)
        return label + (open ? ' opened' : ' closed')
      },
    }
    interactables.push(obj)
    dynamic.push((dt, tick) => {
      motion.advance(Number(open), dt)
      if (tick) fittings.visible = Math.hypot(w.observer.x - x, w.observer.z - z) < 42
    })
    return obj
  }
  function mailbox(x, z, color) {
    box(x, 0.04, z, 0.095, 1, 0.095, 'wood', cedar)
    box(x, 0.97, z, 0.37, 0.21, 0.55, 'metal', color)
    box(x, 1.14, z, 0.32, 0.065, 0.51, 'metal', color)
    box(x + 0.2, 1.08, z, 0.026, 0.14, 0.15, 'metal', 0xb75b43)
    shade(x, z, 0.85, 0.75, 0.065)
  }
  function house(x, z, front, index, home = false) {
    const wid = home ? 12.5 : 8.3 + r() * 3.2,
      dep = home ? 8.8 : 7 + r() * 2.5,
      stories = home ? 2 : index % 3 === 0 ? 2 : 1
    const h = stories === 2 ? 5.6 : 3.05,
      wall = ['#b2b49d', '#9caaa4', '#dbcaad', '#b7c2be', '#c3b8a5', '#a6ada0'][index % 6]
    const frontZ = z + (front * dep) / 2,
      wallMat = index % 6 === 4 ? 'brick' : 'siding',
      tint = wallMat === 'brick' ? 0xe3dcce : wall
    buildings.push({ x, z, w: wid, d: dep })
    shade(x, z, wid + 3.2, dep + 2.2, 0.026)
    box(x, 0.02, z, wid + 0.13, 0.34, dep + 0.13, 'concrete', 0x92978e)
    if (!home) {
      box(x, 0.3, z, wid, h - 0.3, dep, wallMat, tint)
      rectangle(x, z, wid, dep, 0, h + 2)
    } else {
      box(x, 0.28, z - (front * dep) / 2, wid, h - 0.28, 0.22, wallMat, tint)
      rectangle(x, z - (front * dep) / 2, wid, 0.22, 0, h)
      for (const side of [-1, 1]) {
        box(x + (side * wid) / 2, 0.28, z, 0.2, h - 0.28, dep, wallMat, tint)
        rectangle(x + (side * wid) / 2, z, 0.2, dep, 0, h)
      }
      const opening = x + wid * 0.18,
        threshold = 1.15
      for (const [start, end] of [
        [x - wid / 2, opening - threshold / 2],
        [opening + threshold / 2, x + wid / 2],
      ]) {
        box((start + end) / 2, 0, frontZ, end - start, h, 0.2, wallMat, tint)
        rectangle((start + end) / 2, frontZ, end - start, 0.2, 0, h)
      }
      box(opening, 2.16, frontZ, threshold, h - 2.16, 0.2, wallMat, tint)
      // Keep the finish above the concrete foundation; both previously met at 0.36 m.
      const floorTop = 0.373
      plate(x, floorTop, z, wid - 0.2, dep - 0.2, 'wood', 0xcdbb9e)
      box(x, 3.16, z, wid - 0.17, 0.11, dep - 0.17, 'solid', 0xe9e3d5)
      const backZ = z - front * (dep / 2 - 0.125)
      box(x, floorTop, backZ, wid - 0.2, 2.8, 0.04, 'solid', 0xb4baaa)
      box(x, floorTop, backZ + front * 0.04, wid - 0.2, 0.12, 0.06, 'wood', frame)
      for (const side of [-1, 1]) {
        const innerX = x + side * (wid / 2 - 0.12)
        box(innerX, floorTop, z, 0.04, 2.8, dep - 0.2, 'solid', 0xd8cbba)
        box(innerX - side * 0.043, floorTop, z, 0.06, 0.12, dep - 0.2, 'wood', frame)
      }
      // A framed pair of landscape prints on the wall above the coffee table.
      for (const [i, sky] of [0x9bb7b9, 0xcbb797].entries()) {
        const xx = x + 0.42 + 1.17 * i, zz = backZ + front * 0.05
        box(xx, 1.36, zz, 1.03, 0.83, 0.06, 'wood', 0x886747)
        box(xx, 1.42, zz + front * 0.04, 0.92, 0.71, 0.035, 'solid', sky)
        const faceZ = zz + front * 0.061
        const ridge = [[xx-0.46,1.42,faceZ],[xx+0.46,1.42,faceZ],[xx+0.46,1.70,faceZ],
          [xx+0.16,1.87+i*.05,faceZ],[xx-0.06,1.69,faceZ],[xx-.29,1.8,faceZ],[xx-.46,1.66,faceZ]]
        poly(front > 0 ? ridge : ridge.reverse(), 'solid', i ? 0x687a70 : 0x718882)
      }
      w.floors.push({ x, z, w: wid - 0.22, d: dep - 0.22, level: () => floorTop })
      w.interiors.push({ x, z, w: wid - 0.1, d: dep - 0.1 })
      // A furnished living room sits behind the working front door.
      box(x - 2, 0.4, z - 0.3, 2.29, 0.24, 1.04, 'solid', 0x677669)
      for (const dx of [-0.51, 0.51]) {
        box(x - 2 + dx, 0.64, z - 0.22, 1.0, 0.17, 0.73, 'solid', 0x8d9b88)
        box(x - 2 + dx, 0.8, z - 0.61, 1.0, 0.38, 0.19, 'solid', 0x82917d)
      }
      box(x - 2, 0.64, z - 0.7, 2.35, 0.57, 0.29, 'solid', 0x758173)
      box(x - 2, 0.37, z + 1.2, 1.3, 0.35, 0.66, 'wood', 0xccad86)
      // Reading corner against the rear wall, clear of the route from the porch.
      const shelfZ = z - front * (dep / 2 - 0.45),
        shelfX = x - 2.3
      for (const yy of [0.45, 1.02, 1.59, 2.16])
        box(shelfX, yy, shelfZ, 2.35, 0.075, 0.54, 'wood', 0xb68d67)
      for (const dx of [-1.14, 1.14])
        box(shelfX + dx, 0.36, shelfZ, 0.085, 1.9, 0.54, 'wood', 0xa77d57)
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 10; k++)
          box(
            shelfX - 0.94 + k * 0.17,
            0.525 + row * 0.57,
            shelfZ,
            0.13,
            0.27 + (k % 3) * 0.055,
            0.32,
            'solid',
            [0x6a8076, 0xa46b50, 0xb79e76, 0x56697a][(row + k) % 4],
          )
      rectangle(shelfX, shelfZ, 2.35, 0.54, 0.36, 2.26)
      plate(x - 2, floorTop + .006, z + 0.45, 3.7, 2.75, 'solid', 0x978774)
      for (const dx of [-1, 1])
        box(x - 2 + dx * 1.09, 0.69, z - 0.3, 0.21, 0.27, 0.95, 'solid', 0x899386)
      rectangle(x - 2, z - 0.3, 2.35, 1.1, 0.36, 1.2)
      rectangle(x - 2, z + 1.2, 1.3, 0.66, 0.36, 0.72)
      const lampX = x - 0.35
      rod([lampX, 0.36, z - 0.62], [lampX, 0.43, z - 0.62], 0.24, 0.24, 'metal', iron)
      rod([lampX, 0.42, z - 0.62], [lampX, 1.64, z - 0.62], 0.032, 0.032, 'metal', iron)
      rod([lampX, 1.52, z - 0.62], [lampX, 1.84, z - 0.62], 0.28, 0.19, 'solid', 0xdac7a3)
      rectangle(lampX, z - 0.62, 0.48, 0.48, 0.36, 1.84)
      door(opening, frontZ, front, 0x80674c, 'house door')
    }
    gable(x, h, z, wid + 0.35, dep + 0.22, stories === 2 ? 2.05 : 2.36, tint)
    const chimneyX = x - wid * 0.31
    box(chimneyX, h + 0.35, z - 0.63, 0.91, 2.25, 0.74, 'brick', 0xe1d6c4)
    box(chimneyX, h + 2.5, z - 0.63, 1.03, 0.14, 0.83, 'concrete', 0xa9ada1)
    for (const side of [-1, 1])
      box(
        x + side * (wid / 2 - 0.08),
        0.29,
        frontZ + front * 0.021,
        0.14,
        h - 0.25,
        0.16,
        'solid',
        frame,
      )
    const entryX = x + wid * 0.18
    if (!home) {
      box(entryX, 0.24, frontZ + front * 0.075, 1.22, 2.16, 0.12, 'solid', frame)
      box(entryX, 0.24, frontZ + front * 0.14, 1.02, 2.03, 0.05, 'wood', 0xb4a285)
      box(entryX, 0.99, frontZ + front * 0.18, 0.55, 0.79, 0.025, 'pane', 0xebede8)
      const faceZ = frontZ + front * 0.19
      for (const yy of [0.92, 1.78]) box(entryX, yy, faceZ, 0.65, 0.055, 0.045, 'wood', frame)
      for (const dx of [-0.3, 0.3]) box(entryX + dx, 0.96, faceZ, 0.05, 0.82, 0.045, 'wood', frame)
      box(entryX + 0.38, 1.02, faceZ, 0.09, 0.2, 0.05, 'metal', iron)
      box(entryX + 0.33, 1.13, faceZ + front * 0.042, 0.15, 0.035, 0.048, 'metal', iron)
    }
    windowPane(x - wid * 0.26, 1.02, frontZ, 1.74, 1.26, front, index % 2 === 0)
    for (const side of [-1, 1])
      for (const offset of [-0.2, 0.23]) {
        const xx = x + side * (wid * 0.5 + 0.055),
          zz = z + dep * offset
        for (let story = 0; story < stories; story++) {
          const yy = 1.02 + story * 2.68
          box(xx, yy - 0.08, zz, 0.105, 1.33, 1.45, 'solid', frame)
          box(xx + side * 0.069, yy, zz, 0.065, 1.16, 1.26, 'pane', 0xd4dfdf)
          box(xx + side * 0.11, yy + 0.62, zz, 0.043, 0.063, 1.27, 'solid', frame)
          box(xx + side * 0.08, yy - 0.13, zz, 0.21, 0.083, 1.52, 'wood', 0xcac4af)
        }
      }
    if (stories === 2)
      for (const dd of [-0.27, 0.25]) windowPane(x + wid * dd, 3.66, frontZ, 1.6, 1.24, front)
    const porchWid = 3.55,
      porchZ = frontZ + front * 0.89
    box(entryX, 0.05, porchZ, porchWid, 0.2, 1.95, 'wood', 0xb2aaa0)
    for (const side of [-1, 1]) {
      box(
        entryX + side * (porchWid / 2 - 0.12),
        0.2,
        frontZ + front * 1.72,
        0.19,
        2.22,
        0.19,
        'solid',
        frame,
      )
    }
    box(entryX, 2.4, porchZ, porchWid + 0.38, 0.15, 2.2, 'wood', 0xa49b84)
    if (home || index % 3 === 0) gable(entryX, 2.55, porchZ, porchWid + 0.35, 2.22, 0.57, tint)
    const toStreet = z > 60 ? 65.2 : z > 25 ? 54.8 : z > 0 ? 5.8 : -5.8
    const len = Math.abs(frontZ - toStreet)
    if (frontZ * front < toStreet * front)
      plate(entryX, 0.058, (frontZ + toStreet) / 2, 1.22, len, 'concrete', 0xe0dccf)
    if (z > 27 && z < 92) {
      const gX = x + (home ? 8.6 : -wid * 0.61 - 1.5),
        gz = home ? 74.2 : z - front * 1.1
      const gd = home ? 8.4 : 6.3,
        gw = home ? 5.8 : 3.22,
        gh = home ? 2.75 : 2.38,
        gFront = gz + (front * gd) / 2
      const driveEnd = z > 60 ? 60 : 58.3
      plate(
        gX,
        0.071,
        (gFront + driveEnd) / 2,
        gw + 0.82,
        Math.abs(gFront - driveEnd) + 0.2,
        'concrete',
        0xd6d2c5,
      )
      if (home) {
        for (const s of [-1, 1]) {
          box(gX + (s * gw) / 2, 0, gz, 0.2, gh, gd, 'siding', tint)
          rectangle(gX + (s * gw) / 2, gz, 0.2, gd, 0, gh)
        }
        box(gX, 0, gz - (front * gd) / 2, gw, gh, 0.2, 'siding', tint)
        rectangle(gX, gz - (front * gd) / 2, gw, 0.2, 0, gh)
        plate(gX, 0.034, gz, gw, gd, 'concrete', 0xaaa99c)
        box(gX, gh - 0.06, gz, gw - 0.18, 0.09, gd - 0.15, 'solid', 0xbebfb3)
        for (const zz of [gz-1.65, gz+1.65]) {
          box(gX, gh-.14, zz, 1.64, .08, .18, 'metal', iron)
          box(gX, gh-.155, zz, 1.52, .025, .13, 'utilityLight')
        }
        const back = gz - front * (gd / 2 - .14)
        box(gX, 1.06, back, gw - .62, 1.31, .09, 'wood', 0xb29873)
        for (let i = 0; i < 7; i++) {
          const xx = gX - 1.75 + .49*i
          box(xx, 1.47, back+front*.075, .045, .4+(i%3)*.09, .07, 'metal', 0xacb4ae)
          box(xx, 1.43, back+front*.079, .083, .17, .08, 'solid', i%2?0x986e4c:0x607770)
        }
        const benchZ = gz - front * (gd / 2 - 0.55)
        box(gX, 0.04, benchZ, gw - 0.52, 0.82, 0.76, 'metal', 0x61736e)
        box(gX, 0.86, benchZ, gw - 0.4, 0.12, 0.84, 'wood', 0xc0946f)
        rectangle(gX, benchZ, gw - 0.4, 0.84, 0, 0.98)
        for (const dx of [-0.75, 0, 0.75]) {
          box(gX + dx, 0.98, benchZ, 0.52, 0.25, 0.32, 'metal', 0x895e49)
          box(gX + dx, 1.23, benchZ, 0.22, 0.064, 0.09, 'metal', iron)
          for (const yy of [0.27, 0.56])
            box(gX + dx, yy, benchZ + front * 0.39, 0.38, 0.034, 0.04, 'metal', frame)
        }
        door(gX, gFront, front, 0xb9beb4, 'garage door', 'garage', gw - 0.21, gh - 0.13, true)
        w.interiors.push({ x: gX, z: gz, w: gw - 0.1, d: gd - 0.1 })
      } else {
        box(gX, 0, gz, gw, gh, gd, 'siding', tint)
        rectangle(gX, gz, gw, gd, 0, gh + 0.4)
        box(gX, 0.08, gFront + front * 0.055, gw - 0.35, gh - 0.24, 0.09, 'solid', 0xc0c4b9)
        for (let k = 1; k < 6; k++)
          box(gX, 0.1 + k * 0.31, gFront + front * 0.125, gw - 0.48, 0.025, 0.02, 'solid', 0x969c92)
      }
      gable(gX, gh, gz, gw, gd, 0.88, tint)
      const mx = x - wid * 0.36,
        mz = front > 0 ? 52.4 : 67.45
      mailbox(mx, mz, index % 2 ? 0x607371 : 0x575e57)
      if (!home && Math.abs(x) > 29) {
        tree(x + wid * 0.68, frontZ + front * 1.2, 4.8 + r() * 3, 'alder')
        timberFence(x + wid * 0.75, z - 2.4, x + wid * 0.75, z + 3, 0.8)
      }
    }
    // Downspouts, a meter box, hedge plantings and foundation rock break up
    // long stretches of siding at eye level.
    box(x - wid * 0.465, 0.35, frontZ + front * 0.12, 0.09, h - 0.3, 0.09, 'metal', 0xb9bcaf)
    box(x + wid * 0.42, 1.02, frontZ + front * 0.12, 0.3, 0.37, 0.13, 'metal', 0x9eaa9d)
    for (let k = 0; k < 3; k++) {
      const bx = x - wid * 0.42 + k * 0.77,
        bz = frontZ + front * 0.58
      tree(bx, bz, 0.85 + r() * 0.28, 'alder')
      stone(bx + 0.2, bz + front * 0.22, 0.15 + r() * 0.12)
    }
  }
  house(-24.6, 78.4, -1, 1, true)
  house(-47, 80, -1, 2)
  house(-85, 78, -1, 5)
  house(22, 79, -1, 4)
  house(44, 80, -1, 1)
  house(87, 78, -1, 3)
  for (const [i, x] of [-88, -46, -22, 20, 42, 86].entries())
    house(x, 43.7 + (i % 2) * 1.4, 1, i + 2)
  // The driveway widens toward the arterial, giving the introductory sedan a
  // direct route onto either street.
  const drivewayHeight = 0.142, pavementHeight = 0.052
  const apronEdge = 61.38, rampToe = 60.30
  // Continue the two existing driveway edges towards the street. Both axle
  // contact patches sit on the level section before the short concrete ramp.
  function drivewayEdge(z) {
    const t = (70.1 - z) / 8.1
    return [[-19.1 + 5.6 * t, z], [-9.8 + 4.95 * t, z]]
  }
  const [backLeft, backRight] = drivewayEdge(70.1)
  const [frontLeft, frontRight] = drivewayEdge(apronEdge)
  const [toeLeft, toeRight] = drivewayEdge(rampToe)
  function drivewayLevel(x, z) {
    const t = THREE.MathUtils.clamp((z - rampToe) / (apronEdge - rampToe), 0, 1)
    return pavementHeight + (drivewayHeight - pavementHeight) * t
  }
  const driveway = [backLeft, backRight, toeRight, toeLeft]
  const drivewayBox = new THREE.Box2().setFromPoints(driveway.map(([x, z]) => new THREE.Vector2(x, z)))
  const center = drivewayBox.getCenter(new THREE.Vector2())
  const size = drivewayBox.getSize(new THREE.Vector2())
  w.floors.push({
    x: center.x, z: center.y, w: size.x, d: size.y,
    polygon: hull(driveway), level: drivewayLevel,
  })
  // Sample the existing road ribbon at its rendered height from the bottom
  // of this ramp to the opposite kerb. No second asphalt surface is drawn.
  w.floors.push({
    x: (toeLeft[0] + toeRight[0]) / 2, z: (rampToe + 55.5) / 2,
    w: toeRight[0] - toeLeft[0], d: rampToe - 55.5, level: () => pavementHeight,
  })
  for (const section of [[backLeft, backRight, frontRight, frontLeft], [frontLeft, frontRight, toeRight, toeLeft]]) {
    poly(
      section.map(([x, z]) => [x, drivewayLevel(x, z), z]),
      'concrete', 0xefece3,
      section.map(([, z], index) => [index === 1 || index === 2 ? 2.2 : 0, (70.1 - z) / 4.05]),
    )
  }
  plate(-15.2, 0.144, 68.82, 7.65, 0.024, 'solid', 0xacaea4)
  plate(-11.98, 0.144, 63.95, 7.4, 0.021, 'solid', 0xa8aaa2)
  for (const [x, z, h, kind] of [
    [-36, 70, 10, 'fir'],
    [-36, 83, 14, 'fir'],
    [-56, 83, 16, 'fir'],
    [-20, 92, 13, 'fir'],
    [11, 82, 10, 'alder'],
    [12, 40, 8, 'alder'],
    [32, 51, 8, 'alder'],
    [-32, 46, 10, 'fir'],
    [54, 74, 10, 'fir'],
    [76, 47, 10, 'fir'],
    [29, 31, 13, 'fir'],
    [-81, 65, 7, 'alder'],
    [-99, 72, 14, 'fir'],
    [-49, 38, 8, 'alder'],
  ])
    tree(x, z, h, kind)
  // The street-facing gardens remain short at the intersection. Specimen
  // trees frame the first view toward the skyline above layered shrubs.
  for (const [x, z, h, kind] of [
    [-11.7, 49.2, 8.3, 'alder'],
    [-12.4, 36.6, 8.5, 'fir'],
    [-10.3, 25.7, 6.1, 'alder'],
    [-31.8, 24, 9, 'fir'],
    [-35.6, 11, 10, 'fir'],
    [-34.5, 30.4, 8, 'alder'],
    [11.8, 51.5, 7.2, 'alder'],
    [13.3, 70.3, 6.2, 'alder'],
    [23.8, 10.9, 8.4, 'alder'],
    [-10.7, 10.6, 7.3, 'alder'],
  ]) {
    tree(x, z, h, kind)
    shade(x, z, h * 0.55, h * 0.43, 0.036)
  }
  function garden(x, z, wid, dep) {
    box(x, 0.012, z, wid, 0.055, dep, 'dirt', 0x827662)
    for (let i = 0; i < Math.ceil(wid / 0.72); i++) {
      const xx = x - wid * 0.43 + (wid * 0.86 * i) / Math.max(1, Math.ceil(wid / 0.72) - 1)
      const zz = z + (r() - 0.5) * dep * 0.63
      tree(xx, zz, 0.56 + r() * 0.52, 'alder')
      stone(xx + 0.31, zz + 0.24, 0.12 + r() * 0.095)
    }
  }
  garden(-14.5, 52.4, 9, 1.64)
  garden(14.9, 52.5, 7.1, 1.32)
  garden(-18.5, 70.65, 5.4, 1.3)
  garden(12.6, 68.7, 5.2, 1.24)
  garden(-11.4, 30.2, 3.4, 1.4)
  timberFence(-32.4, 52.8, -21.2, 52.8, 0.65)
  // Wood utility crossarms and hanging lines follow the residential block.
  const poleX = [-100, -57.2, -22, 17, 56, 95]
  for (let i = 0; i < poleX.length; i++) {
    const x = poleX[i],
      z = 52.1
    rod([x, 0.02, z], [x, 8.6, z], 0.155, 0.087, 'wood', 0xab9471)
    box(x, 8.09, z, 2.0, 0.14, 0.16, 'wood', 0xbbae94)
    for (const off of [-0.82, 0, 0.82]) {
      box(x + off, 8.21, z, 0.12, 0.22, 0.12, 'solid', 0xa5b4ad)
      if (i + 1 < poleX.length)
        for (let k = 0; k < 5; k++) {
          const v = (t) => [
            x + (poleX[i + 1] - x) * t + off,
            8.45 - Math.sin(t * Math.PI) * 1.45,
            z,
          ]
          rod(v(k / 5), v((k + 1) / 5), 0.018, 0.018, 'solid', 0x343b37, 4)
        }
    }
    rectangle(x, z, 0.29, 0.29, 0, 8.7)
  }
  // Shared batched city structures, with several distinct rooflines, podiums,
  // recessed windows, mechanical floors and corner awnings.
  function commercial(x, z, wid, dep, h, style = 0, label = '', front = 1) {
    const podium = h > 12 ? 3.7 : 0,
      base = height(x, z),
      top = base + h
    building(x, z, wid, dep, h)
    shade(x, z, wid + 4, dep + 3, 0.066)
    if (podium)
      box(x, base, z, wid + 0.35, podium, dep + 0.35, style % 2 ? 'brick' : 'concrete', 0xd0cfbf)
    box(
      x,
      base + podium,
      z,
      wid,
      h - podium,
      dep,
      'facade' + style,
      style === 0 ? 0xcbdadd : style === 1 ? 0xe5e3d3 : 0xe4d9c8,
    )
    box(x, top, z, wid + 0.38, 0.31, dep + 0.36, 'concrete', 0xb6b8af)
    if (h > 21) {
      if (style !== 2) {
        const count = Math.ceil(wid / 6)
        for (let j = 0; j <= count; j++) {
          const xx = x - wid / 2 + (j * wid) / count
          for (const f of [-1, 1])
            box(
              xx,
              base + podium,
              z + f * (dep / 2 + 0.035),
              0.17,
              h - podium,
              0.17,
              'metal',
              0x9ba8a5,
            )
        }
      }
      const trimColor = style === 2 ? 0xa3a499 : 0xa9b1b0
      const every = style === 2 ? 6 : 10
      for (let yy = podium + every; yy < h - 0.25; yy += every)
        box(x, base + yy, z, wid + 0.28, 0.21, dep + 0.28, 'solid', trimColor)
      const setHeight = h > 42 ? 4.5 : 1.7
      box(
        x - 1,
        top + 0.25,
        z + 1,
        wid * 0.63,
        setHeight,
        dep * 0.58,
        style === 0 ? 'facade0' : 'concrete',
        0xb2b9b6,
      )
      box(
        x - 1,
        top + setHeight + 0.25,
        z + 1,
        wid * 0.63 + 0.35,
        0.2,
        dep * 0.58 + 0.35,
        'metal',
        0x9ca9a8,
      )
      if (h > 52)
        rod(
          [x - 1, top + setHeight, z],
          [x - 1, top + setHeight + 7, z],
          0.11,
          0.03,
          'metal',
          0xadb8b5,
        )
    }
    for (let k = 0; k < 2; k++) {
      box(x + wid * 0.27, top + 0.25, z + dep * (k * 0.3 - 0.14), 2.2, 0.95, 1.4, 'metal', 0xa7b2ad)
      for (let l = 0; l < 5; l++)
        box(
          x + wid * 0.27 - 0.8 + l * 0.4,
          top + 1.2,
          z + dep * (k * 0.3 - 0.14),
          0.15,
          0.03,
          1.18,
          'metal',
          0x6f7b76,
        )
    }
    const fz = z + (front * dep) / 2
    if (podium || label) {
      for (let k = 0; k < Math.floor(wid / 3.1); k++) {
        const xx = x - wid / 2 + 1.75 + k * 3.1
        box(xx, 0.38, fz + front * 0.21, 2.65, 2.28, 0.055, 'pane', 0xd5e0e0)
        box(xx, 2.34, fz + front * 0.254, 2.7, 0.07, 0.08, 'metal', iron)
        box(xx, 0.38, fz + front * 0.255, 0.08, 2.28, 0.08, 'metal', iron)
      }
      const awning = style === 2 ? 0x637c6c : style === 1 ? 0x89664f : 0x526d72
      box(x, 2.99, fz + front * 0.72, wid + 0.46, 0.18, 1.45, 'metal', awning)
      if (label)
        sign(
          x,
          3.43,
          fz + front * 0.31,
          Math.min(wid - 0.8, 8),
          1.18,
          label,
          '',
          front > 0 ? 0 : Math.PI,
          '#354741',
          '#eee8d4',
        )
    }
  }
  const skyline = [
    [-86, -30, 17, 26, 12, 2, 'COLUMBIA WORKS'],

    [-41, -28, 23, 15, 20, 2, 'CASCADIA PRINT'],
    [-41, -53, 17, 17, 39, 1, ''],
    [-17, -35, 12, 27, 16, 2, 'MOSS & PINE'],
    [26, -39, 19, 18, 49, 0, ''],
    [47, -52, 11, 24, 27, 2, ''],
    [44, -23, 13, 16, 17, 1, 'NORTH BANK'],
    [84, -33, 21, 19, 13, 2, 'IRONWORKS'],
    [87, -59, 22, 18, 28, 1, ''],

    [-83, -119, 18, 7, 9, 2, ''],
    [-40, -107, 19, 20, 69, 0, ''],
    [-16, -107, 12, 24, 27, 1, 'CIVIC OFFICES'],
    [-52, -120, 8, 8, 8, 2, ''],
    [45, -105, 18, 23, 36, 1, ''],
    [22, -117, 15, 10, 11, 2, ''],
    [84, -99, 18, 17, 24, 0, ''],
    [-88, -155, 17, 28, 21, 2, 'HARBOR HOUSE'],
    [-41, -153, 21, 24, 34, 2, ''],
    [-19, -149, 11, 16, 13, 2, ''],
    [24, -154, 16, 25, 56, 1, ''],
    [47, -153, 11, 16, 11, 2, ''],
    [87, -148, 21, 17, 15, 2, 'PACIFIC CANNERY'],
    [-84, -195, 20, 13, 7, 2, ''],
    [-40, -197, 30, 16, 8, 2, 'NORTH YARD'],
    [39, -196, 24, 13, 7, 2, 'HARBOR DISPATCH'],
  ]
  const architecture = new Map([
    ['26,-39', 'office-tower'],
    ['-40,-107', 'office-tower'],
    ['24,-154', 'office-tower'],
    ['-41,-53', 'apartment-block'],
    ['87,-59', 'apartment-block'],
    ['-41,-153', 'apartment-block'],
    ['-83,-119', 'parking-garage'],
    ['39,-196', 'parking-garage'],
  ])
  for (const args of skyline) {
    const [x, z, width, depth, h] = args,
      kind = architecture.get(x + ',' + z)
    if (!kind) {
      commercial(...args)
      continue
    }
    const tall = kind === 'parking-garage' ? Math.min(h, 7.5) : h
    const fit = fitBuilding(kind, width, tall, depth)
    let deck = 0
    if (kind === 'parking-garage') {
      // The ground level is open to the street. Upper parking decks share one
      // overhead collider and the support piers retain independent footprints.
      deck = 3.25
      const face = z < -180 ? 1 : -1
      buildings.push({ x, z, w: width, d: depth })
      rectangle(x, z, fit.w, fit.d, deck, deck + fit.h)
      rectangle(x, z, width, depth, deck - 0.15, deck + 0.01)
      box(x, deck - 0.15, z, width, 0.16, depth, 'concrete', 0xb6b6a8)
      plate(x, 0.09, z, width, depth, 'asphalt', 0xa8aba4)
      for (const side of [-1, 1]) {
        for (const end of [-1, 1]) {
          const px = x + side * (width / 2 - 0.4),
            pz = z + end * (depth / 2 - 0.47)
          box(px, 0.08, pz, 0.65, deck, 0.65, 'concrete', 0xc1bfb2)
          rectangle(px, pz, 0.65, 0.65, 0, deck)
        }
      }
      const back = z - face * (depth / 2 - 0.15)
      box(x, 0.07, back, width, 0.76, 0.24, 'concrete', 0xb5b2a9)
      rectangle(x, back, width, 0.24, 0, 0.83)
      for (let dx = -width / 2 + 1; dx < width / 2; dx += 2.85)
        plate(x + dx, 0.103, z, 0.085, depth - 0.9, 'marking', 0xe4d9b9)
      sign(
        x,
        deck - 0.67,
        z + face * (depth / 2 + 0.02),
        width * 0.54,
        0.64,
        'PUBLIC PARKING',
        '',
        face > 0 ? 0 : Math.PI,
        '#325553',
        '#f2ecd5',
      )
    } else building(x, z, fit.w, fit.d, fit.h)
    shade(x, z, width + 4, depth + 4, 0.066)
    w.city.place(kind, x, height(x, z) + deck + 0.02, z, {
      landmark: true,
      scale: fit.scale,
    })
  }
  foundryRow(w, { door, sign: paintSign.bind(null, true), shade })
  plate(-24, 0.072, 22.2, 16, 5.8, 'concrete', 0xd3cbbb)
  bench(-19, 22.2)
  garden(-31.3, 23.3, 2.9, 1.25)
  // Walk-in post office at the package counter. Its front wall has a genuine
  // opening through which both cameras can pass.
  function depot() {
    const x = 22,
      z = -98,
      wid = 24,
      dep = 16,
      frontZ = -90,
      h = 5.5
    buildings.push({ x, z, w: wid, d: dep })
    w.interiors.push({ x, z, w: wid - 0.2, d: dep - 0.2 })
    w.floors.push({ x, z, w: wid - 0.2, d: dep - 0.2, level: () => 0.11 })
    plate(x, 0.11, z, wid, dep, 'concrete', 0xe1d9be)
    const wall = (xx, zz, wi, dd) => {
      box(xx, 0, zz, wi, h, dd, 'brick', 0xe3d7c5)
      rectangle(xx, zz, wi, dd, 0, h)
    }
    wall(x, z - dep / 2, wid, 0.22)
    wall(x - wid / 2, z, 0.24, dep)
    wall(x + wid / 2, z, 0.24, dep)
    wall(11.2, frontZ, 2.4, 0.24)
    wall(24.7, frontZ, 18.6, 0.24)
    box(14, 2.7, frontZ, 2.8, h - 2.7, 0.24, 'brick')
    box(x, h, z, wid + 0.6, 0.32, dep + 0.62, 'concrete', 0xbabeb4)
    for (const dx of [19, 23.5, 28, 32]) windowPane(dx, 0.72, frontZ, 2.8, 1.85, 1)
    sign(
      x,
      3.52,
      frontZ + 0.145,
      15,
      1.4,
      'PARCEL EXCHANGE',
      'POST â€¢ FREIGHT â€¢ SUPPLIES',
      0,
      '#354941',
    )
    box(x, 3.1, frontZ + 0.85, wid + 0.24, 0.17, 1.8, 'metal', 0x697d6c)
    box(23, 0.12, -98, 8, 1.03, 0.91, 'wood', 0xc5b292)
    rectangle(23, -98, 8, 0.91, 0, 1.25)
    for (let i = 0; i < 7; i++) {
      const xx = 12.2 + (i % 4) * 1.16,
        zz = -103 + Math.floor(i / 4)
      box(xx, 0.12, zz, 0.94, 0.64 + (i % 3) * 0.27, 0.7, 'siding', 0xbca180)
    }
    for (const xx of [17.8, 25.1, 30.2]) box(xx, 0.12, -104, 0.1, 3.15, 1.4, 'metal', iron)
    for (let k = 0; k < 3; k++) box(24, 0.93 + k * 0.93, -104, 13, 0.1, 1.4, 'wood', 0xb1a07e)
    for (const xx of [15.5, 22, 28.5]) {
      for (const zz of [-93.8, -101.5]) {
        box(xx, h-.14, zz, 2.3, .14, .34, 'metal', iron)
        box(xx, h-.17, zz, 2.18, .04, .25, 'utilityLight')
      }
    }
    // A waist-high writing ledge with outgoing envelopes along the lobby wall.
    box(32.95, .11, -94.8, .93, .93, 3.45, 'wood', 0xb39774)
    box(32.95, 1.04, -94.8, 1.06, .07, 3.55, 'solid', 0xd5c7a9)
    for (let i=0;i<3;i++) box(32.87,1.11,-95.8+i*.61,.33,.034,.22,'solid',0xece5cf)
    rectangle(32.95,-94.8,1.06,3.55,.11,1.12)
    // Sorting shelves, taped parcels, wall pigeonholes and a counter scale.
    for (let level = 0; level < 3; level++)
      for (let i = 0; i < 8; i++) {
        const px = 18.4 + i * 1.52,
          py = 1.03 + level * 0.93,
          ph = 0.32 + ((i + level) % 3) * 0.11
        box(px, py, -104, 1.02, ph, 0.77, 'solid', 0xbf956d)
        box(px, py + ph, -104, 0.15, 0.01, 0.78, 'solid', 0xd8bc91)
        box(px + 0.18, py + 0.11, -103.61, 0.31, 0.13, 0.012, 'solid', 0xe6dfcb)
      }
    rectangle(24, -104, 13, 1.4, 0.11, 3.57)
    for (let i = 0; i < 9; i++) box(26 + i * 0.68, 1.4, -105.68, 0.055, 1.4, 0.48, 'wood', 0xaf8866)
    for (let i = 0; i < 4; i++)
      box(28.72, 1.4 + i * 0.45, -105.68, 5.51, 0.055, 0.48, 'wood', 0xc19770)
    box(21.3, 1.15, -98, 0.67, 0.12, 0.54, 'metal', iron)
    box(21.3, 1.27, -98, 0.59, 0.045, 0.46, 'metal', 0xa7aca6)
    box(24.2, 1.15, -98, 0.8, 0.38, 0.49, 'solid', 0xc49a71)
    door(14, frontZ, 1, 0x627c72, 'post office door', 'door', 2.75, 2.62)
    sign(20, 1.7, -102.85, 3.8, 0.88, 'COLLECTIONS', 'PARCEL COUNTER', 0, '#e2dcc9', '#50584c')
  }
  depot()
  // The municipal archive faces a paved forecourt across from the square.
  const ax = -47,
    az = -62
  building(ax, az, 14, 9, 8)
  box(ax, 0, az, 14, 6.7, 9, 'concrete', 0xf0e4cb)
  box(ax, 6.66, az, 14.8, 0.45, 9.5, 'concrete', 0xdcd7c5)
  for (let i = -2; i <= 2; i++)
    rod(
      [ax + i * 2.4, 0.28, az - 5.4],
      [ax + i * 2.4, 5.65, az - 5.4],
      0.26,
      0.24,
      'concrete',
      0xe4e0d2,
      10,
    )
  box(ax, 5.59, az - 4.7, 14.8, 0.77, 2.65, 'concrete', 0xdfd9c6)
  sign(ax, 5.72, az - 6.05, 9, 0.64, 'MUNICIPAL ARCHIVE', '', Math.PI, '#767d70', '#f0e7d0')
  for (let i = 0; i < 3; i++)
    box(
      ax,
      0.04 + i * 0.13,
      az - 5.72 + i * 0.19,
      14.1 - i * 0.27,
      0.15,
      2.15 - i * 0.34,
      'concrete',
      0xe1ddcb,
    )
  plate(-47, 0.075, -72, 17, 3.4, 'concrete', 0xdad6c5)
  // Downtown parking space connects directly to the street.
  plate(17, 0.073, -69, 23, 12.2, 'asphalt', 0xc0c0b7)
  for (const x of [6.25, 11.35, 16.45, 21.55, 26.65])
    plate(x, 0.088, -71, 0.12, 6.5, 'solid', 0xe0d7ac)
  for (const x of [8.8, 13.9, 19, 24.1]) box(x, 0.1, -67.8, 2, 0.12, 0.22, 'concrete', 0xbabbb0)
  // A petrol station with a canopy, pump islands and a lit fascia.
  const fx = -16,
    fz = -13
  plate(fx, 0.069, fz, 20, 15, 'asphalt', 0xc1c1b6)
  for (const xx of [-18, -12]) {
    box(xx, 0.08, fz, 1, 0.18, 3.8, 'concrete', 0xcdcbbd)
    box(xx, 0.24, fz, 0.24, 3.9, 0.34, 'metal', 0xabaaa1)
    for (const zz of [fz - 1.25, fz + 1.25]) {
      box(xx, 0.24, zz, 0.63, 1.4, 0.48, 'solid', 0xd6c6aa)
      box(xx, 1.1, zz + 0.245, 0.46, 0.31, 0.04, 'pane', 0xc5d5d0)
      box(xx, 0.29, zz + 0.247, 0.5, 0.46, 0.035, 'solid', 0xb9533a)
    }
  }
  box(-15, 4.0, fz, 11, 0.43, 7.8, 'solid', 0xebdfc9)
  box(-15, 4.22, fz, 11.1, 0.2, 7.9, 'metal', 0xb85840)
  sign(-15, 4.06, fz + 3.93, 6, 0.39, 'PACIFIC SERVICE', '', 0, '#bf704b', '#fff0d6')
  // Waterfront water tower, timber quay and loading yard.
  const wx = 83,
    wz = -118
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const px = wx + sx * 2.6,
        pz = wz + sz * 2.6
      const corners = [-0.56, 0.56].flatMap((dx) =>
        [-0.56, 0.56].map((dz) => height(px + dx, pz + dz)),
      )
      const bottom = Math.min(...corners) - 0.2,
        cap = Math.max(...corners) + 0.18
      box(px, bottom, pz, 1.12, cap - bottom, 1.12, 'concrete', 0xb4b0a0)
      box(px, cap, pz, 0.64, 0.07, 0.64, 'metal', 0x62695f)
      rectangle(px, pz, 1.12, 1.12, bottom, cap + 0.07)
      rod([px, cap + 0.06, pz], [wx + sx * 1.8, 9.8, wz + sz * 1.8], 0.19, 0.13, 'metal', 0x777d70)
      rod(
        [wx + sx * 2.53, 1.2, wz + sz * 2.53],
        [wx - sx * 1.88, 8.8, wz + sz * 1.88],
        0.075,
        0.075,
        'metal',
        0x697268,
      )
      rectangle(wx + sx * 2.6, wz + sz * 2.6, 0.38, 0.38, cap, 9.9)
    }
  rod([wx, 9.14, wz], [wx, 13.9, wz], 3.4, 3.4, 'wood', 0xa68d6e, 18)
  for (const yy of [9.25, 10.0, 11.45, 12.8, 13.83])
    rod([wx, yy, wz], [wx, yy + 0.1, wz], 3.46, 3.46, 'metal', 0x5f6d65, 18)
  rod([wx, 13.94, wz], [wx, 15.3, wz], 3.61, 0.14, 'metal', 0xa5a79a, 18)
  sign(wx, 10.78, wz + 3.44, 4.15, 1.06, 'HARBOR', 'WATER DISTRICT', 0, '#a69a7d', '#353e37')
  // Tank outlet and service ladder.
  rod(
    [wx + 0.84, height(wx + 0.84, wz) - 0.15, wz],
    [wx + 0.84, 9.2, wz],
    0.16,
    0.16,
    'metal',
    0x606c65,
    12,
  )
  for (const dx of [-0.28, 0.28]) {
    rod([wx + dx, 0.36, wz - 3.59], [wx + dx, 14.1, wz - 3.59], 0.044, 0.044, 'metal', 0x95998e)
    for (const yy of [9.6, 11.5, 13.6])
      rod([wx + dx, yy, wz - 3.59], [wx + dx, yy, wz - 3.32], 0.045, 0.045, 'metal', 0x747b74)
  }
  for (let yy = 0.68; yy < 14.1; yy += 0.34)
    rod([wx - 0.28, yy, wz - 3.59], [wx + 0.28, yy, wz - 3.59], 0.033, 0.033, 'metal', 0x919586)
  // The lift serves a real waterfront observation deck. Its platform carries
  // the character through the same height query used for all walking physics.
  function harborLift() {
    const lx = 90.8,
      lz = -110.5,
      deckX = 95.2,
      deckW = 6,
      deckD = 5.6,
      rise = 3.7
    const base = height(lx, lz),
      top = base + rise
    const deck = { x: deckX, z: lz, w: deckW, d: deckD, level: () => top }
    const postHeight = (xx, zz) => height(xx, zz) - 0.28
    box(deckX, top - 0.18, lz, deckW, 0.18, deckD, 'wood', 0xc4ac8c)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const xx = deckX + sx * (deckW / 2 - 0.12),
          zz = lz + sz * (deckD / 2 - 0.12)
        const bottom = postHeight(xx, zz)
        box(xx, bottom, zz, 0.24, top + 1.03 - bottom, 0.24, 'metal', 0x677b75)
      }
    for (const sz of [-1, 1]) {
      const zz = lz + sz * (deckD / 2 - 0.09)
      box(deckX, top + 0.95, zz, deckW, 0.07, 0.09, 'metal', 0x84928a)
      box(deckX, top + 0.42, zz, deckW, 0.045, 0.045, 'metal', 0x84928a)
      rectangle(deckX, zz, deckW, 0.1, top, top + 1)
    }
    w.floors.push(deck)
    const east = deckX + deckW / 2 - 0.09
    for (const yy of [0.42, 0.95]) box(east, top + yy, lz, 0.08, 0.065, deckD, 'metal', 0x84928a)
    rectangle(east, lz, 0.1, deckD, top, top + 1)
    for (const s of [-1, 1]) {
      box(lx, base - 0.03, lz + s * 1.38, 0.22, rise + 1.6, 0.21, 'metal', 0x76827c)
      box(lx, base + rise + 1.45, lz, 1.3, 0.15, 2.92, 'metal', 0x808a80)
      box(lx - 0.86, base, lz + s * 1.51, 0.14, 1.17, 0.13, 'metal', 0x717a71)
    }
    sign(lx, base + 1.07, lz + 1.5, 1.64, 0.66, 'HARBOR LIFT', 'OBSERVATION DECK', 0, '#485f55')
    const lift = new THREE.Group()
    lift.position.set(lx, base, lz)
    scene.add(lift)
    const deckMetal = new THREE.MeshStandardMaterial({
      color: 0x798783,
      roughness: 0.62,
      metalness: 0.46,
    })
    const zinc = new THREE.MeshStandardMaterial({
      color: 0xafb6a9,
      roughness: 0.48,
      metalness: 0.52,
    })
    function part(x, y, z, width, h, d, m) {
      const obj = new THREE.Mesh(new THREE.BoxGeometry(width, h, d), m)
      obj.position.set(x, y, z)
      obj.castShadow = obj.receiveShadow = true
      lift.add(obj)
    }
    part(0, -0.02, 0, 2.8, 0.19, 2.6, deckMetal)
    for (const s of [-1, 1]) {
      part(0, 0.89, s * 1.22, 2.75, 0.07, 0.07, zinc)
      part(0, 0.46, s * 1.22, 2.75, 0.04, 0.04, zinc)
      for (const corner of [-1, 1]) part(corner * 1.3, 0.48, s * 1.22, 0.065, 0.91, 0.065, zinc)
    }
    let level = 0,
      destination = 0
    w.floors.unshift({ x: lx, z: lz, w: 2.8, d: 2.6, level: () => base + level + 0.075 })
    const action = {
      type: 'elevator',
      label: 'Ride lift to observation deck',
      x: lx,
      z: lz,
      radius: 2.6,
      activate(player) {
        if (!player) {
          destination = destination ? 0 : rise
          level = destination
          lift.position.y = base + level
        } else {
          if (Math.abs(destination - level) > 0.06) return 'Lift in motion'
          if (Math.abs((player.y ?? base) - (base + level)) > 1.65) {
            destination = level > rise * 0.5 ? 0 : rise
          } else {
            player.x = lx
            player.z = lz
            player.y = base + level + 0.075
            destination = level > rise * 0.5 ? 0 : rise
          }
        }
        this.label = destination ? 'Ride lift to street' : 'Ride lift to observation deck'
        return destination ? 'Lift ascending' : 'Lift descending'
      },
    }
    interactables.push(action)
    dynamic.push((dt) => {
      const delta = destination - level
      if (Math.abs(delta) < 0.0001) return
      level += Math.sign(delta) * Math.min(Math.abs(delta), dt * 1.65)
      lift.position.y = base + level
    })
  }
  harborLift()
  // Timber landing from the shoreline to the end of the original quay.
  const quayStart = 87,
    quayEnd = 127,
    quayZ = -116,
    surface = -0.28
  for (let i = 0; i < 160; i++) {
    box(
      quayStart + (i + 0.5) * 0.25,
      surface - 0.14,
      quayZ,
      0.246,
      0.14,
      2.6,
      'wood',
      [0xc0a489, 0xbda186, 0xc7ad90, 0xb9a087][i % 4],
    )
  }
  for (const side of [-1, 1]) {
    const zz = quayZ + side * 1.15
    box(107, surface - 0.43, zz, 40, 0.29, 0.18, 'wood', 0x8f7e67)
    for (let xx = 89; xx <= 126; xx += 4) {
      const foot = Math.min(surface - 0.5, height(xx, zz) - 0.38)
      rod([xx, foot, zz], [xx, surface + 0.94, zz], 0.16, 0.135, 'wood', 0xac947b, 12)
      rod([xx, surface + 0.79, zz], [xx, surface + 0.88, zz], 0.146, 0.146, 'metal', 0x676f68, 12)
      rectangle(xx, zz, 0.28, 0.28, foot, surface + 0.94)
      const span = Math.min(4, quayEnd - 0.15 - xx)
      if (span > 0) {
        for (const yy of [0.44, 0.87])
          rod(
            [xx, surface + yy, zz],
            [xx + span, surface + yy, zz],
            0.036,
            0.036,
            'metal',
            0x7f8881,
          )
        rectangle(xx + span / 2, zz, span, 0.085, surface, surface + 0.9)
      }
    }
  }
  box(126.85, surface + 0.78, quayZ, 0.12, 0.1, 2.55, 'wood', 0xbc9f80)
  rectangle(126.85, quayZ, 0.12, 2.55, surface, surface + 0.88)
  w.floors.push({ x: 107, z: quayZ, w: 40, d: 2.6, level: () => surface, aboveWater: true })
  // Bus shelter, seats and municipal furniture by the main arterial.
  function shelter(x, z) {
    for (const dx of [-1.68, 1.68]) {
      box(x + dx, 0.11, z, 0.13, 2.45, 0.13, 'metal', iron)
      box(x + dx, 0.11, z - 0.91, 0.13, 2.45, 0.13, 'metal', iron)
    }
    box(x, 0.94, z - 0.93, 3.4, 1.43, 0.06, 'pane', 0xb4c5c2)
    box(x, 2.55, z - 0.32, 3.91, 0.13, 1.94, 'metal', 0x65736d)
    bench(x, z - 0.35)
    sign(x, 2.2, z - 0.84, 2.0, 0.31, 'CITY TRANSIT', '', 0, '#435d54')
  }
  shelter(28, -72)
  bench(-35, -72)
  box(78, 0, -115, 2.5, 0.07, 1.35, 'concrete', 0xc4beb0)
  bench(78, -115)
  function playground() {
    plate(42, 0.045, 21, 15, 11, 'dirt', 0xcdb68b)
    for (const xx of [38, 44])
      for (const zz of [19.8, 23.2]) {
        rod([xx, 0.04, zz], [xx, 3, 21.5], 0.09, 0.09, 'metal', 0x6a8185, 6)
      }
    rod([37.8, 3.04, 21.5], [44.2, 3.04, 21.5], 0.09, 0.09, 'metal', 0x966f49)
    for (const xx of [39.4, 42.5]) {
      for (const side of [-1, 1])
        rod(
          [xx + side * 0.35, 0.76, 21.5],
          [xx + side * 0.35, 3, 21.5],
          0.022,
          0.022,
          'metal',
          0x646c68,
          5,
        )
      box(xx, 0.7, 21.5, 0.84, 0.08, 0.32, 'solid', 0x69736b)
    }
    bench(50, 18.9, -Math.PI / 2)
    for (const [xx, zz] of [
      [36, 25],
      [53, 24],
      [48, 11],
    ])
      tree(xx, zz, 6 + r() * 3, 'alder')
  }
  playground()
  // Reserve the road approaches for crossings, and vary intersection phases.
  const signals = []
  for (const z of [0, -80, -130, -180])
    for (const x of [-64, 0, 64]) {
      const xHalf = x === 0 ? 5.5 : 4.5,
        zHalf = z === -80 ? 5.5 : 4.5
      for (const side of [-1, 1]) {
        for (let k = 0; k < 7; k++) {
          const xx = x + (k - 3) * 1.11,
            zz = z + (k - 3) * 1.11
          plate(xx, 0.094, z + side * (zHalf + 1.8), 0.5, 2.1, 'solid', 0xdad9c8)
          plate(x + side * (xHalf + 1.8), 0.096, zz, 2.1, 0.5, 'solid', 0xdad9c8)
        }
      }
      for (const axis of ['x', 'z'])
        for (const side of [-1, 1]) {
          const xx = x + (axis === 'x' ? side : -side) * (xHalf + 1.25),
            zz = z + side * (zHalf + 1.2)
          if (axis === 'x') {
            rod([xx, 0.1, zz], [xx, 3.89, zz], 0.07, 0.064, 'metal', post)
            box(xx, 3.14, zz, 0.26, 0.74, 0.39, 'metal', 0x434a40)
          } else {
            rod([xx, 0.1, zz], [xx, 4.25, zz], 0.074, 0.062, 'metal', post)
            box(xx, 3.44, zz, 0.38, 0.76, 0.25, 'metal', 0x444b42)
          }
          signals.push({
            x,
            z,
            axis,
            px: xx + (axis === 'x' ? side * 0.144 : 0),
            py: axis === 'x' ? 3.5 : 3.8,
            pz: zz + (axis === 'z' ? side * 0.146 : 0),
          })
        }
    }
  const lampGeom = new THREE.SphereGeometry(0.09, 7, 5)
  const signalMesh = new THREE.InstancedMesh(
    lampGeom,
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    signals.length * 2,
  )
  const o = new THREE.Object3D(),
    sc = new THREE.Color()
  signals.forEach((s, i) => {
    for (let k = 0; k < 2; k++) {
      o.position.set(s.px, s.py + (k ? 0.175 : -0.175), s.pz)
      o.updateMatrix()
      signalMesh.setMatrixAt(i * 2 + k, o.matrix)
    }
  })
  scene.add(signalMesh)
  function changeSignals(dt, tick) {
    if (!tick) return
    signals.forEach((s, i) => {
      const go = w.signalOpen(s.axis, s.x, s.z)
      signalMesh.setColorAt(i * 2, sc.setHex(go ? 0x76ffba : 0x254638))
      signalMesh.setColorAt(i * 2 + 1, sc.setHex(go ? 0x68443a : 0xff7657))
    })
    signalMesh.instanceColor.needsUpdate = true
  }
  changeSignals(0, true)
  dynamic.push(changeSignals)
  function streetlight(x, z, face = 1) {
    const base = height(x, z)
    // The street grid extends past the level bank on the harbor side.
    if (w.waterAt(x, z) || (x > 78 && base < -0.2)) return
    rod([x, base - 0.1, z], [x, base + 6.1, z], 0.092, 0.058, 'metal', 0x83908b)
    rod([x, base + 5.82, z], [x + face * 0.42, base + 6.37, z], 0.062, 0.052, 'metal', 0x83908b)
    rod([x + face * 0.42, base + 6.37, z], [x + face * 1.6, base + 6.46, z], 0.052, 0.042, 'metal', 0x83908b)
    box(x + face * 1.58, base + 6.34, z, 0.63, 0.16, 0.36, 'metal', 0x6c7771)
    box(x + face * 1.58, base + 6.315, z, 0.52, 0.046, 0.29, 'lamp', 0xf0dfb8)
  }
  for (const x of [-64, 0, 64])
    for (let z = -200; z <= 50; z += 26) {
      const side = Math.round(z / 26) % 2 === 0 ? 1 : -1
      streetlight(x + side * (x === 0 ? 7 : 6.08), z, -side)
    }
  for (const z of [-80, -130, 0])
    for (const x of [-91, -42, -23, 29, 47, 89]) streetlight(x, z + 6.75, 1)
  for (const [x, z] of [
    [8, -69],
    [14, -90],
  ]) {
    const l = new THREE.PointLight(0xffd5a1, 0, 14, 2)
    l.position.set(x, 4.7, z)
    l.userData.power = 28
    lights.push(l)
    scene.add(l)
  }
  rod([-7.68, 0.09, 52.18], [-7.68, 3.16, 52.18], 0.061, 0.048, 'metal', 0x829189)
  sign(-7.68, 2.65, 52.25, 2.15, 0.38, 'CEDAR AVE', '', 0, '#486455')
  sign(-7.63, 3.03, 52.18, 2.25, 0.37, 'NORTH MAIN', '', Math.PI / 2, '#486455')
  rod([6.83, 0.1, -73.02], [6.83, 4.75, -73.02], 0.057, 0.047, 'metal', 0x839088)
  sign(6.83, 4.25, -72.96, 3.25, 0.55, 'CIVIC SQUARE', '', 0, '#486455')
  // Shop and inventory props have explicit interaction meanings in the UI.
  box(31.5, 0.11, -89.22, 0.93, 1.94, 0.64, 'metal', 0x8e5b40)
  sign(31.5, 0.98, -88.88, 0.72, 0.88, 'SODA', 'COLD DRINKS', 0, '#a96d45')
  interactables.push({ x: 31.5, z: -88, type: 'vending', label: 'Buy provisions' })
  const packModel = new THREE.Mesh(
    new THREE.BoxGeometry(0.49, 0.39, 0.41),
    new THREE.MeshStandardMaterial({ color: 0xbc986d, roughness: 0.86 }),
  )
  const packTape = new THREE.Mesh(
    new THREE.BoxGeometry(0.084, 0.394, 0.414),
    new THREE.MeshStandardMaterial({ color: 0xd3bc93, roughness: 0.6 }),
  )
  packModel.add(packTape)
  packModel.position.set(12, 0.31, -94)
  packModel.castShadow = packModel.receiveShadow = true
  scene.add(packModel)
  const pack = {
    x: 12,
    z: -93.65,
    type: 'pickup',
    label: 'Collect supply box',
    activate() {
      this.hide()
      return 'Supply box collected'
    },
    hide() {
      packModel.visible = false
    },
    reset() {
      packModel.visible = true
    },
  }
  interactables.push(pack)
  const switchLight = new THREE.PointLight(0xffe7bf, 0, 10, 2)
  switchLight.position.set(-25, 2.7, 77)
  scene.add(switchLight)
  const switchX = -21.6,
    switchZ = 74.3
  box(switchX, 1.22, switchZ, 0.16, 0.23, 0.08, 'solid', 0xd7cbb6)
  let lit = false
  interactables.push({
    x: switchX,
    z: switchZ + 0.4,
    type: 'switch',
    label: 'Toggle house light',
    activate() {
      lit = !lit
      switchLight.intensity = lit ? 30 : 0
      return lit ? 'House light on' : 'House light off'
    },
  })
  // Rural details: farm buildings, silo, paddocks and a narrow gravel lane.
  const barnX = -168,
    barnZ = 10,
    barnY = height(barnX, barnZ)
  const foundation = buildBarn(w, barnX, barnY, barnZ)
  building(barnX, barnZ, 15, 10, 9.3, foundation)
  const siloX = barnX + 12,
    siloY = height(siloX, barnZ)
  const rim = Array.from({ length: 14 }, (_, i) => {
    const angle = (i * Math.PI) / 7
    return [siloX - 2 * Math.sin(angle), barnZ - 2 * Math.cos(angle)]
  })
  const foot = Math.min(...rim.map(([x, z]) => height(x, z))) - 0.08
  rod([siloX, foot, barnZ], [siloX, siloY + 9, barnZ], 2, 2, 'metal', 0xb6b7a9, 14)
  rod([siloX, siloY + 9, barnZ], [siloX, siloY + 10.3, barnZ], 2.1, 0.19, 'metal', 0x9faaa0, 14)
  rectangle(siloX, barnZ, 4, 4, foot, siloY + 10.3).poly = hull(rim)
  timberFence(-163, -3, -140, -3, 1.2)
  timberFence(-140, -3, -140, 22, 1.2)
  for (let i = 0; i < 10; i++) {
    const xx = -195 + r() * 28,
      zz = -12 - r() * 27,
      y = height(xx, zz)
    rod([xx, y + 0.06, zz], [xx, y + 1.27, zz], 0.98, 0.98, 'siding', 0xbfa568, 10)
  }
  // Mountain switchbacks and lookout; the tower deck stays beside the marker.
  const tx = 7,
    tz = -245,
    ty = height(tx, tz)
  for (const xx of [tx - 1.33, tx + 1.33]) box(xx, ty, tz, 0.15, 2.3, 0.15, 'wood', cedar)
  box(tx, ty + 0.88, tz, 3.08, 1.42, 0.18, 'wood', 0xb1a489)
  sign(
    tx,
    ty + 0.96,
    tz + 0.106,
    2.85,
    1.2,
    'NORTH RIDGE',
    'TRAILHEAD  /  LOOKOUT',
    0,
    '#495b4b',
    '#e9dfba',
  )
  const sx = 129,
    sz = -375,
    sy = height(sx, sz)
  for (const xx of [sx - 2.3, sx + 2.3])
    for (const zz of [sz - 1.8, sz + 1.8])
      box(xx, height(xx, zz) - 0.1, zz, 0.17, 3.1, 0.17, 'wood', 0xb19a75)
  box(sx, sy + 2.9, sz, 5.34, 0.2, 4.33, 'wood', 0xaa9575)
  gable(sx, sy + 3.05, sz, 5.4, 4.4, 0.8, 0xab9777)
  for (const zz of [sz - 0.63, sz + 0.63]) {
    box(sx, sy + 0.41, zz, 3.5, 0.13, 0.39, 'wood', 0xc4a883)
    for (const xx of [sx - 1.2, sx + 1.2]) box(xx, sy, zz, 0.13, 0.46, 0.27, 'wood', 0x9c8d72)
  }
  for (const [x, z] of [
    [123, -368],
    [150, -342],
    [82, -295],
    [70, -269],
    [-3, -235],
  ]) {
    tree(x, z, 7 + r() * 8, 'fir')
    stone(x + 2.7, z - 1.9, 1.05)
  }
  addWildlife(w)
}
