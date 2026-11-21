// A closed timber hay barn on the original 15 × 10 metre footprint.
// All parts feed the existing neighborhood material batches.
export function buildBarn(world, x, y, z) {
  const { box, poly, rod, height } = world
  // Sun-faded paint over the existing scanned wood grain.
  const timber = world.standard(
    'barnTimber',
    { map: world.materials.wood.map, roughness: 0.91 },
    [2.3, 2.3],
  )
  timber.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      'vec3 grain = texture2D(map, vMapUv).rgb; diffuseColor.rgb *= mix(vec3(.28), vec3(1.), sqrt(grain));',
    )
  }
  const plank = (dx, dy, dz, w, h, d, mat, tint) => box(x + dx, y + dy, z + dz, w, h, d, mat, tint)
  const point = ([dx, dy, dz]) => [x + dx, y + dy, z + dz]
  const face = (points, mat, tint) => poly(points.map(point), mat, tint)
  const rail = (a, b, r, mat, tint) => rod(point(a), point(b), r, r, mat, tint, 6)
  const faded = [0xc6846d, 0xd39378, 0xb77b69, 0xc88c73, 0xbf806b]
  const trim = 0xd1c0a1,
    iron = 0x555a55,
    sill = 0.32,
    eave = 5.65
  const low =
    Math.min(
      ...[-7.5, 0, 7.5].flatMap((dx) => [-5, 0, 5].map((dz) => height(x + dx, z + dz) - y)),
    ) - 0.25
  plank(0, low, 0, 15, sill - low, 10, 'concrete', 0x97948a)
  plank(0, sill, 0, 15, eave - sill, 10, 'barnTimber', 0xc08a73)
  // Vertical weatherboards with raised battens and corner casings.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const dx = -7.5 + (i + 0.5) * 0.5
      plank(dx, sill, side * 5.012, 0.496, eave - sill, 0.035, 'barnTimber', faded[(i * 7 + 2) % 5])
      plank(dx + 0.23, sill, side * 5.05, 0.045, eave - sill, 0.05, 'barnTimber', 0xb78168)
    }
    for (let i = 0; i < 20; i++) {
      const dz = -4.75 + i * 0.5
      plank(side * 7.52, sill, dz, 0.04, eave - sill, 0.496, 'barnTimber', faded[(i * 3) % 5])
      plank(side * 7.55, sill, dz + 0.23, 0.05, eave - sill, 0.047, 'barnTimber', 0xad7763)
    }
    for (const dx of [-7.46, 7.46])
      plank(dx, sill, side * 4.99, 0.19, eave - sill, 0.22, 'barnTimber', trim)
  }
  // Gambrel end walls and folded roof planes, with eaves, ridge cap and standing seams.
  const profile = [
    [-5.28, eave],
    [-3.05, 8.12],
    [0, 9.24],
    [3.05, 8.12],
    [5.28, eave],
  ]
  for (const side of [-1, 1]) {
    const end = [
      [side * 7.5, eave, -5],
      [side * 7.5, eave, 5],
      [side * 7.5, 8.12, 3.05],
      [side * 7.5, 9.24, 0],
      [side * 7.5, 8.12, -3.05],
    ]
    face(side === -1 ? end : end.reverse(), 'barnTimber', 0xbd876c)
    plank(side * 7.53, eave - 0.08, 0, 0.15, 0.19, 10.3, 'barnTimber', trim)
    plank(side * 7.55, 6.12, 0, 0.12, 1.18, 1.42, 'barnTimber', trim)
    plank(side * 7.63, 6.23, 0, 0.07, 0.96, 1.18, 'solid', 0x303b36)
    for (let k = 0; k < 5; k++)
      plank(side * 7.69, 6.27 + k * 0.18, 0, 0.09, 0.07, 1.16, 'barnTimber', 0xac9a7c)
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const [za, ya] = profile[i],
      [zb, yb] = profile[i + 1]
    face(
      [
        [-7.8, ya, za],
        [-7.8, yb, zb],
        [7.8, yb, zb],
        [7.8, ya, za],
      ],
      'metal',
      i === 1 || i === 2 ? 0x858b86 : 0x757e7a,
    )
    for (const sx of [-7.8, 7.8]) rail([sx, ya, za], [sx, yb, zb], 0.083, 'barnTimber', trim)
    for (let sx = -7.7; sx < 7.8; sx += 0.68)
      rail([sx, ya + 0.022, za], [sx, yb + 0.022, zb], 0.024, 'metal', 0x999e96)
  }
  rail([-7.86, 9.25, 0], [7.86, 9.25, 0], 0.11, 'metal', 0x929a92)
  // Closed, paired sliding hay doors; the farm is an exterior landmark.
  for (const side of [-1, 1]) {
    const dx = side * 1.3
    plank(dx, sill, 5.12, 2.57, 3.91, 0.13, 'barnTimber', 0xb18e6d)
    for (const ox of [-1.2, 1.2]) plank(dx + ox, sill, 5.2, 0.12, 3.91, 0.069, 'barnTimber', trim)
    for (const dy of [sill + 0.04, 2.2, 4.1])
      plank(dx, dy, 5.21, 2.5, 0.12, 0.075, 'barnTimber', trim)
    rail([dx - side * 1.14, 0.51, 5.25], [dx + side * 1.14, 4.1, 5.25], 0.095, 'barnTimber', trim)
    plank(side * 0.23, 1.64, 5.29, 0.09, 0.33, 0.09, 'metal', iron)
    for (const wx of [-5.22, 5.22]) {
      const wz = side * 5.1
      plank(wx, 2.49, wz, 1.67, 1.38, 0.11, 'barnTimber', trim)
      plank(wx, 2.6, wz + side * 0.065, 1.45, 1.16, 0.058, 'pane', 0x99b0ae)
      plank(wx, 2.6, wz + side * 0.109, 0.068, 1.16, 0.055, 'barnTimber', trim)
      plank(wx, 3.13, wz + side * 0.109, 1.45, 0.068, 0.055, 'barnTimber', trim)
      plank(wx, 2.44, wz, 1.82, 0.11, 0.25, 'barnTimber', trim)
    }
  }
  plank(0, 4.37, 5.19, 9.9, 0.105, 0.14, 'metal', iron)
  for (const dx of [-2.24, -0.45, 0.45, 2.24])
    plank(dx, 4.12, 5.24, 0.13, 0.31, 0.11, 'metal', iron)
  return y + low
}
