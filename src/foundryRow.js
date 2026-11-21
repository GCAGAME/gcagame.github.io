import { fitBuilding } from './cityAssets.js'
import * as THREE from 'three'
import { makeCar } from './sim-models.js'

// Three existing lots are fitted out around their original street entrances.
// Wall panels and door openings define both the rendered shell and its collision.
export function foundryRow(w, { door, sign, shade }) {
  const { box, poly, plate, rod, rectangle, city, standard } = w
  const ink = 0x323b3d,
    ivory = 0xebdec4
  standard('storeGlass', {
    color: 0xc6d8d7,
    metalness: 0.14,
    roughness: 0.15,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  standard('caseLight', { color: 0xffefcc, emissive: 0xffdb9e, emissiveIntensity: 1.75 })
  // Repeating ceramic tile at physical scale, shared by all three shops.
  const tile = w.canvasTexture(128, 128, (c) => {
    c.fillStyle = '#a69e8f'
    c.fillRect(0, 0, 128, 128)
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const light = 82 + ((row * 3 + col * 7) % 5)
        c.fillStyle = 'hsl(39, 12%, ' + light + '%)'
        c.fillRect(col * 32 + 1, row * 32 + 1, 31, 31)
      }
  })
  standard('shopTile', { map: tile, roughness: 0.77 }, [2.4, 2.4])
  function till(x, y, z) {
    box(x, y, z, 0.32, 0.04, 0.23, 'metal', ink)
    box(x, y + 0.04, z, 0.07, 0.17, 0.07, 'metal', ink)
    box(x, y + 0.21, z, 0.36, 0.23, 0.055, 'solid', 0x37413e)
    box(x, y + 0.23, z + 0.031, 0.315, 0.18, 0.012, 'solid', 0x88a9a1)
  }
  const rooms = []
  // Paved lots meet the existing curbs. Control joints and planting strips follow
  // each parcel, leaving intersections, signal stop lines and entries clear.
  for (const [x, z, width, depth] of [
    [-89, -54, 37, 39],
    [-88, -106, 37, 39],
    [-33, -40, 50, 65],
    [32, -40, 50, 65],
    [-33, -105, 50, 35],
    [32, -105, 50, 35],
    [-33, -155, 50, 35],
    [32, -155, 50, 35],
  ]) {
    plate(x, 0.034, z, width, depth, 'concrete', 0xc4bfaf)
    for (let xx = x - width / 2 + 3.3; xx < x + width / 2; xx += 3.3)
      plate(xx, 0.041, z, 0.018, depth, 'solid', 0x918d83)
    for (let zz = z - depth / 2 + 3.3; zz < z + depth / 2; zz += 3.3)
      plate(x, 0.042, zz, width, 0.018, 'solid', 0x918d83)
  }
  for (const [xx, zz] of [
    [-104, -72.1],
    [-98.6, -72.1],
    [-73, -88.5],
    [-52, -88.9],
    [11.5, -13],
    [12.2, -30],
    [52, -37],
    [53, -68],
    [-12, -58],
  ]) {
    box(xx, 0.055, zz, 2.25, 0.29, 1.6, 'concrete', 0xcfcab9)
    plate(xx, 0.35, zz, 2.05, 1.4, 'dirt', 0x82735e)
    for (const off of [-0.55, 0.47])
      city.place('bracken-fern', xx + off, 0.33, zz, { scale: 0.78, yaw: xx + off, range: 58 })
    rectangle(xx, zz, 2.25, 1.6, 0.03, 0.39)
  }
  for (const [xx, zz, ww, dd, yaw] of [
    [-43, 14, 9.5, 8.5, Math.PI],
    [-85, 15, 10, 9.5, 0],
  ]) {
    const fit = fitBuilding('red-cottage', ww, 7.2, dd)
    city.place('red-cottage', xx, 0.02, zz, { landmark: true, scale: fit.scale, yaw })
    w.buildings.push({ x: xx, z: zz, w: fit.w, d: fit.d })
    rectangle(xx, zz, fit.w, fit.d, 0, fit.h)
    shade(xx, zz, ww + 2, dd + 2, 0.034)
  }
  // A pair of narrow brick-fronted workshops closes the west end of the motor row.
  box(-103.4, 0, -61.3, 12.4, 8.4, 15.4, 'brick', 0xc8a28f)
  rectangle(-103.4, -61.3, 12.4, 15.4, 0, 8.8)
  w.buildings.push({ x: -103.4, z: -61.3, w: 12.4, d: 15.4 })
  box(-103.4, 8.39, -61.3, 12.75, 0.31, 15.75, 'concrete', ivory)
  for (const xx of [-106.5, -100.3]) {
    for (const yy of [0.42, 4.72]) {
      box(xx, yy, -69.09, 4.95, yy < 1 ? 2.55 : 2.4, 0.13, 'pane', 0xdee3db)
      for (const offset of [-2.5, -0.85, 0.85, 2.5])
        box(xx + offset, yy, -69.2, 0.11, 2.56, 0.18, 'metal', ink)
      box(xx, yy + 1.81, -69.19, 5.04, 0.08, 0.17, 'metal', ink)
      box(xx, yy - 0.1, -69.16, 5.28, 0.12, 0.31, 'concrete', ivory)
    }
    sign(
      xx,
      3.31,
      -69.15,
      5.2,
      0.82,
      xx < -103 ? 'IRON & OAK' : 'PRINT HOUSE',
      '',
      Math.PI,
      '#65554a',
      '#f4dfb7',
    )
  }
  function shop({ x, z, width, depth, eave, face, entrance, label, wallTint, finish }) {
    const front = z + (face * depth) / 2,
      back = z - (face * depth) / 2,
      left = x - width / 2,
      right = x + width / 2
    w.buildings.push({ x, z, w: width, d: depth })
    shade(x, z, width + 4, depth + 3, 0.063)
    function wall(xx, zz, ww, dd) {
      box(xx, 0, zz, ww, eave, dd, finish, wallTint)
      rectangle(xx, zz, ww, dd, 0, eave)
    }
    wall(x, back, width, 0.27)
    for (const end of [left, right]) wall(end, z, 0.25, depth)
    plate(x, 0.109, z, width, depth, 'shopTile', label === 'showroom' ? 0xaab1b1 : 0xf0e1ca)
    w.floors.push({ x, z, w: width - 0.13, d: depth - 0.13, level: () => 0.109 })
    w.interiors.push({ x, z, w: width - 0.1, d: depth - 0.1 })
    for (const [a, b] of [
      [left, entrance - 0.83],
      [entrance + 0.83, right],
    ]) {
      const wid = b - a,
        mid = (b + a) / 2
      rectangle(mid, front, wid, 0.15, 0, eave)
      box(mid, 0, front, wid, 0.42, 0.27, finish, wallTint)
      box(mid, 0.42, front, wid, eave - 1.05, 0.04, 'storeGlass')
      box(mid, eave - 0.63, front, wid, 0.66, 0.3, 'metal', ink)
      const count = Math.ceil(wid / 2.4)
      for (let k = 0; k <= count; k++)
        box(a + (wid * k) / count, 0.32, front, 0.075, eave - 0.5, 0.16, 'metal', ink)
      box(mid, 2.68, front, wid, 0.072, 0.16, 'metal', ink)
    }
    box(entrance, 2.43, front, 1.68, eave - 2.43, 0.2, finish, wallTint)
    door(entrance, front, face, ink, label + ' door', 'door', 1.66, 2.43).newDistrict = true
    rooms.push({ x, z, y: eave - 0.68 })
    return { front, back, left, right }
  }
  function furniture(name, x, z, yaw = 0, options = {}) {
    const { w: width, d: depth, ...rest } = options
    city.place(name, x, 0.114, z, { yaw, range: 48, ...rest })
    if (width && depth) rectangle(x, z, width, depth, 0.07, 1.38)
  }
  const showroom = shop({
    x: -85,
    z: -60.5,
    width: 22,
    depth: 17,
    eave: 4.75,
    face: -1,
    entrance: -85,
    label: 'showroom',
    wallTint: 0xd5ab84,
    finish: 'brick',
  })
  // Northlight sawtooth roof with a glazed vertical face and open steel trusses underneath.
  for (let i = 0; i < 3; i++) {
    const a = showroom.back - (17 * i) / 3,
      b = a - 17 / 3
    const roof = [
      [-96.22, 4.78, a],
      [-73.78, 4.78, a],
      [-73.78, 6.36, b],
      [-96.22, 6.36, b],
    ]
    poly(roof, 'metal', 0x87908c)
    poly(roof.map(([x, y, z]) => [x, y - 0.07, z]).reverse(), 'wood', 0xd9bea0)
    box(-85, 4.72, b, 22.4, 1.66, 0.09, 'pane', 0xe5dcc2)
    for (let xx = -95.8; xx < -73.8; xx += 2.2) box(xx, 4.7, b, 0.074, 1.7, 0.14, 'metal', ink)
    for (const xx of [-96, -74])
      poly(
        [
          [xx, 4.75, a],
          [xx, 4.75, b],
          [xx, 6.36, b],
        ],
        'brick',
        0xb99678,
      )
    box(-85, 4.5, b, 22.15, 0.14, 0.17, 'metal', ink)
    for (let xx = -95; xx < -75; xx += 4.0) {
      rod([xx, 4.55, b], [xx + 2, 6.16, b], 0.044, 0.044, 'metal', ink, 5)
      rod([xx + 2, 6.16, b], [xx + 4, 4.55, b], 0.044, 0.044, 'metal', ink, 5)
    }
  }
  for (const xx of [-94, -86, -78]) {
    box(xx, 4.31, -59, 0.09, 0.19, 12, 'metal', ink)
    box(xx, 4.21, -59, 0.15, 0.07, 5.3, 'caseLight')
  }
  box(-85, 3.55, -69.77, 22.9, 0.28, 1.8, 'metal', 0x737b78)
  box(-85, 4.04, -69.19, 15.8, 1.21, 0.25, 'metal', ink)
  sign(
    -85,
    4.09,
    -69.33,
    15.5,
    1.13,
    'FOUNDRY MOTORS',
    'SALES   /   SERVICE   /   COLLECTIONS',
    Math.PI,
    '#244c50',
    '#f5e9c7',
  )
  for (const xx of [-95.55, -74.45]) {
    box(xx, 0, -69.18, 0.5, 5.82, 0.62, 'brick', 0xbe8c6f)
    box(xx, 5.81, -69.18, 0.66, 0.16, 0.77, 'concrete', ivory)
  }
  plate(-85, 0.077, -72, 24, 5.7, 'asphalt', 0xc5c5bd)
  for (const xx of [-75.8, -80, -84]) plate(xx, 0.095, -72.25, 0.09, 4.3, 'marking', ivory)
  box(-85, 0.11, -63.7, 4, 0.89, 0.73, 'wood', 0xb78255)
  box(-85, 1, -63.7, 4.15, 0.12, 0.84, 'metal', 0x5c615a)
  rectangle(-85, -63.7, 4, 0.84, 0, 1.16)
  sign(-85, 0.33, -64.09, 2.9, 0.46, 'COLLECTIONS', '', Math.PI, '#495654', '#eadfc8')
  box(-77.7, 0.11, -52.64, 5.6, 0.95, 0.78, 'wood', 0xab8565)
  box(-77.7, 1.06, -52.64, 5.69, 0.09, 0.84, 'solid', ivory)
  rectangle(-77.7, -52.64, 5.7, 0.82, 0.1, 1.16)
  sign(-77.8, 2.07, -52.18, 4.3, 0.6, 'PAINT SAMPLES', '', Math.PI, '#6f5747', '#f6e5cd')
  for (const [i, col] of [0x943d2f, 0x607667, 0x506a8e, 0xc3ab85, 0x62676a, 0xcdcdbe].entries())
    box(-79.5 + i * 0.68, 1.42, -52.23, 0.49, 0.42, 0.1, 'metal', col)
  furniture('office-desk', -78, -56, Math.PI, { w: 1.45, d: 0.75 })
  furniture('bentwood-cafe-chair', -78, -55, -0.2, { w: 0.45, d: 0.45 })
  furniture('potted-houseplant', -75.3, -67.4, 0, { lod: 2, w: 0.75, d: 0.7 })
  const show = makeCar('sports', 0xa84b34)
  const displayLOD = new THREE.LOD()
  displayLOD.addLevel(show.detail, 0)
  displayLOD.addLevel(show.coarse, 26, 0.12)
  show.group.add(displayLOD)
  show.group.position.set(-91, 0.17, -60)
  show.group.rotation.y = 0.5
  w.getChunk(-91, -60)[1].add(show.group)
  rectangle(-91, -60, 3.3, 4.8, 0.1, 1.8)
  shade(-91, -60, 5.3, 7, 0.118)
  box(-91, 0.115, -60, 4.5, 0.048, 6.4, 'concrete', 0xaba89c)
  box(-94.05, 0.09, -70.4, 1.8, 1.5, 0.42, 'wood', 0x8d7356)
  rectangle(-94.05, -70.4, 1.8, 0.42, 0, 1.61)
  box(-94.05, 1.59, -70.4, 2.07, 0.12, 0.67, 'metal', ink)
  sign(-94.05, 0.88, -70.62, 1.68, 0.62, 'DISPATCH', 'COURIERS', Math.PI, '#773c29', '#fff4dc')

  // A slatted display wall and spec lectern surround the existing show car.
  for (let k = 0; k < 25; k++) box(-94.4 + k * 0.4, 0.13, -52.19, 0.29, 3.8, 0.08, 'wood', 0xb68765)
  sign(
    -89.4,
    1.65,
    -52.26,
    6.3,
    1.55,
    'FOUNDRY MOTORS',
    'BRIAR COUNTY   /   EST. 1968',
    Math.PI,
    '#294a4c',
    '#f2dcb7',
  )
  box(-88.6, 0.115, -62.6, 0.46, 0.06, 0.37, 'metal', ink)
  box(-88.6, 0.175, -62.6, 0.085, 0.86, 0.085, 'metal', ink)
  box(-88.6, 1.03, -62.6, 0.74, 0.43, 0.07, 'metal', ink)
  sign(-88.6, 1.06, -62.64, 0.68, 0.36, 'SPORT', 'COLLECTION', Math.PI, '#e7ddc8', '#303b39')
  rectangle(-88.6, -62.6, 0.74, 0.37, 0.11, 1.46)
  till(-83.8, 1.12, -63.7)

  const cafe = shop({
    x: -84,
    z: -102,
    width: 19.6,
    depth: 20,
    eave: 3.75,
    face: 1,
    entrance: -80.5,
    label: 'cafe',
    wallTint: 0xc0a083,
    finish: 'brick',
  })
  // Painted plaster above the timber dado and a matte ceiling soften the brick shell.
  box(-84, 3.62, -102, 19.35, 0.1, 19.72, 'solid', 0xd7cbb6)
  box(-84, 1.3, -111.83, 19.24, 2.31, 0.06, 'solid', 0x97a68e)
  for (const end of [-93.64, -74.36]) {
    box(end, 1.28, -102, 0.06, 2.34, 19.62, 'solid', 0xd4c8af)
    box(end, 1.22, -102, 0.14, 0.08, 19.62, 'wood', 0xb48560)
  }
  for (const zz of [-97.6, -102.7, -107.8]) {
    furniture('four-seat-restaurant-table', -84.9, zz, 0, { w: 1.2, d: 0.76 })
    furniture('bentwood-cafe-chair', -84.9, zz + 0.83, Math.PI, { w: 0.48, d: 0.48 })
    furniture('bentwood-cafe-chair', -84.9, zz - 0.83, 0, { w: 0.48, d: 0.48 })
  }
  box(-84, 3.73, -102, 20.25, 0.35, 20.65, 'concrete', ivory)
  city.place('apartment-block', -84, 4.07, -103, {
    landmark: true,
    scale: fitBuilding('apartment-block', 18.9, 12, 18.4).scale,
  })
  box(-84, 3.04, cafe.front + 0.56, 19.45, 0.16, 1.5, 'metal', 0x597365)
  sign(
    -87.5,
    2.99,
    cafe.front + 1.32,
    8.9,
    0.71,
    'JUNIPER KITCHEN',
    'FOUNDRY ROW',
    0,
    '#3e5448',
    '#f1ddaf',
  )
  for (const zz of [-97.3, -102, -106.8]) {
    furniture('restaurant-booth-double', -91.4, zz, Math.PI / 2, { w: 1.15, d: 1.2 })
    furniture('four-seat-restaurant-table', -89.9, zz, Math.PI / 2, { w: 0.8, d: 1.3 })
    furniture('bentwood-cafe-chair', -88.9, zz, Math.PI / 2, { w: 0.45, d: 0.5 })
  }
  for (const xx of [-88, -84.5]) {
    furniture('four-seat-restaurant-table', xx, -89.5, 0, { w: 1.2, d: 0.77 })
    furniture('bentwood-cafe-chair', xx, -88.65, Math.PI, { w: 0.45, d: 0.43 })
    furniture('bentwood-cafe-chair', xx, -90.35, 0, { w: 0.45, d: 0.43 })
  }
  furniture('a-frame-chalkboard-sign', -77.9, -90.3, 0.16, { w: 0.64, d: 0.45 })
  box(-77.4, 0.1, -103.9, 1.62, 1.1, 6.2, 'wood', 0xb7906c)
  rectangle(-77.4, -103.9, 1.62, 6.2, 0, 1.3)

  // Lathe-turned shades, tableware and a working-height coffee bar.
  for (const zz of [-97.3, -102, -106.8]) {
    rod([-89.9, 2.71, zz], [-89.9, 3.72, zz], 0.018, 0.018, 'metal', ink)
    rod([-89.9, 2.55, zz], [-89.9, 2.76, zz], 0.32, 0.1, 'metal', 0xa87747, 16)
    rod([-89.9, 2.54, zz], [-89.9, 2.55, zz], 0.27, 0.27, 'caseLight', ivory, 16)
    for (const offset of [-0.33, 0.33]) {
      rod([-89.9, 0.878, zz + offset], [-89.9, 0.896, zz + offset], 0.13, 0.14, 'solid', ivory, 14)
      rod(
        [-89.9, 0.896, zz + offset],
        [-89.9, 0.99, zz + offset],
        0.042,
        0.053,
        'solid',
        0xc7d3bc,
        12,
      )
    }
  }
  box(-84, 0.12, -111.84, 19.2, 1.17, 0.11, 'wood', 0x967454)
  box(-84, 1.29, -111.78, 19.2, 0.09, 0.2, 'wood', 0xd8b890)
  sign(
    -81.6,
    1.54,
    -111.79,
    4.8,
    1.57,
    'JUNIPER KITCHEN',
    'COFFEE   /   SOUP   /   DAILY LUNCH',
    0,
    '#334b43',
    '#f7e8ca',
  )
  box(-77.4, 1.2, -103.9, 1.72, 0.09, 6.3, 'solid', ivory)
  box(-77.4, 1.29, -105.6, 0.73, 0.43, 0.51, 'metal', 0x93a69d)
  box(-77.4, 1.59, -105.34, 0.76, 0.11, 0.1, 'metal', ink)
  till(-77.42, 1.29, -102.1)
  furniture('potted-houseplant', -75.9, -110.1, 0, { lod: 2, w: 1.4, d: 1.3 })

  const market = shop({
    x: -24,
    z: 14.6,
    width: 14,
    depth: 9.8,
    eave: 3.72,
    face: 1,
    entrance: -20.9,
    label: 'market',
    wallTint: 0xd6c2a2,
    finish: 'brick',
  })
  box(-24, 3.7, 14.6, 14.5, 0.22, 10.4, 'metal', ink)
  box(-24, 3.88, 14.6, 13.7, 0.38, 9.7, 'brick', ivory)
  for (let i = 0; i < 19; i++) {
    const x = -31 + (14 * (i + 0.5)) / 19
    poly(
      [
        [x - 0.37, 3.2, 19.48],
        [x - 0.37, 2.74, 20.88],
        [x + 0.37, 2.74, 20.88],
        [x + 0.37, 3.2, 19.48],
      ],
      'solid',
      i % 2 ? 0xe4d6b4 : 0x477263,
    )
    box(x, 2.53, 20.87, 0.74, 0.24, 0.055, 'solid', i % 2 ? 0xe4d6b4 : 0x477263)
  }
  box(-24, 3.22, market.front + 0.35, 6.75, 1.08, 0.36, 'wood', 0xa17d58)
  sign(-24, 3.28, market.front + 0.55, 6.54, 1.0, 'CEDAR GROCERY', '', 0, '#3b564d', '#f5edcf')
  for (const xx of [-28.6, -25.9])
    furniture('grocery-shelf-run', xx, 13.35, Math.PI / 2, { lod: 2, w: 1.05, d: 2.54 })
  furniture('grocery-shelf-run', -21.1, 10.6, 0, { lod: 2, w: 2.55, d: 1.05 })
  furniture('a-frame-chalkboard-sign', -27.4, 21, 0.12, { w: 0.6, d: 0.42 })
  // Matte soffit and diffused strips above the aisles.
  box(-24, 3.59, 14.6, 13.77, 0.11, 9.56, 'solid', 0xe2dacb)
  for (const xx of [-28, -24, -20]) {
    box(xx, 3.5, 14.6, 0.28, 0.09, 4.6, 'metal', ink)
    box(xx, 3.48, 14.6, 0.19, 0.025, 4.45, 'caseLight', ivory)
  }
  box(-21.25, 0.11, 14, 1.03, 0.91, 2.65, 'wood', 0xab805e)
  box(-21.25, 1.02, 14, 1.1, 0.1, 2.73, 'solid', 0xd8d6c4)
  rectangle(-21.25, 14, 1.1, 2.73, 0.11, 1.12)
  till(-21.27, 1.12, 14.83)
  // Produce bins against the rear wall keep the purchase point and main aisle clear.
  for (let k = 0; k < 4; k++) {
    const xx = -29.45 + k * 1.65,
      zz = 10.62
    box(xx, 0.11, zz, 1.56, 0.76, 1.12, 'wood', 0xac825d)
    for (const side of [-1, 1]) {
      box(xx, 0.87, zz + side * 0.54, 1.55, 0.18, 0.055, 'wood', 0xc7a078)
      box(xx + side * 0.75, 0.87, zz, 0.055, 0.18, 1.06, 'wood', 0xc7a078)
    }
    rectangle(xx, zz, 1.56, 1.12, 0.11, 1.05)
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 6; col++) {
        const px = xx - 0.56 + col * 0.22 + (row % 2) * 0.055,
          pz = zz - 0.3 + row * 0.27
        const tint = [0xa34733, 0xcf8e37, 0x86a456, 0xb85943][k]
        rod([px, 0.88, pz], [px, 1.0, pz], 0.07, 0.105, 'solid', tint, 8)
        rod([px, 1.0, pz], [px, 1.07, pz], 0.105, 0.042, 'solid', tint, 8)
      }
  }
  sign(-27, 1.55, 9.87, 4.4, 0.92, 'FARM PRODUCE', 'SEASONAL FRUIT', 0, '#3b564d', '#f5edcf')
  // One inverse-square fixture is reused as the player moves between rooms.
  const lamp = new THREE.PointLight(0xffdeb6, 0, 17, 2)
  w.scene.add(lamp)
  w.dynamic.push((dt, tick) => {
    if (!tick) return
    const room = rooms.find((r) => Math.hypot(r.x - w.observer.x, r.z - w.observer.z) < 15)
    lamp.visible = !!room
    if (room) {
      lamp.position.set(room.x, room.y, room.z)
      lamp.intensity = 48
    }
  })
  for (const [x, z] of [
    [-70.1, -72.8],
    [-55.4, -86.4],
    [-8.1, 9.3],
    [7.8, -68.5],
    [56.9, -135.8],
  ]) {
    furniture('fire-hydrant', x, z, 0, { w: 0.5, d: 0.48, range: 42 })
  }
  for (const x of [-87, -74.2])
    furniture('parking-meter', x, -73.4, 0.08, { w: 0.22, d: 0.25, range: 38 })
  for (const [x, z] of [
    [-89, -84.2],
    [-35, -75.1],
    [-4.9, 12],
    [-4.9, 39],
    [63, -175.8],
  ])
    city.place('street-gully-grate', x, -0.255, z, { range: 45 })
}
