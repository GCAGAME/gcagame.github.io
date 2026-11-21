// Runs inside the live browser game with its production simulation and collision queries.
;() => {
  const { sim, world, camera } = briar,
    base = sim.serialize()
  const clearance = (x, z) => Math.min(x + 660, 660 - x, z + 690, 470 - z)
  const sport = sim.cars.find((c) => c.spec.max === Math.max(...sim.cars.map((v) => v.spec.max)))
  const edges = [
    ['west', -660, -110, -1, 0],
    ['east', 660, -110, 1, 0],
    ['north', 0, -690, 0, -1],
    ['south', 0, 470, 0, 1],
  ]
  const corners = [
    [-660, -690, -1, -1],
    [660, -690, 1, -1],
    [-660, 470, -1, 1],
    [660, 470, 1, 1],
  ]
  const checks = []
  function setup(x, z, yaw, drive) {
    const d = structuredClone(base)
    Object.assign(d.player, { x, z, y: world.height(x, z), yaw, pitch: 0 })
    d.current = drive ? sport.id : null
    if (drive)
      Object.assign(
        d.cars.find((c) => c.id === sport.id),
        { x, z, yaw, upgraded: true },
      )
    sim.restore(d)
  }
  function tick(keys, i) {
    sim.update([1 / 60, 1 / 30, 0.075, 1 / 120][i % 4], {
      keys: new Set(keys),
      settings: briar.settings(),
    })
    const p = sim.player,
      v = sim.vehicle
    if (
      clearance(p.x, p.z) < -0.00001 ||
      clearance(camera.position.x, camera.position.z) < -0.00001
    )
      throw Error('Escaped border')
    if (v)
      for (const a of [-0.5, 0.5])
        for (const b of [-0.5, 0.5]) {
          const w = v.spec.width * a,
            l = v.spec.length * b
          if (
            clearance(
              v.x + w * Math.cos(v.yaw) + l * Math.sin(v.yaw),
              v.z - w * Math.sin(v.yaw) + l * Math.cos(v.yaw),
            ) < -0.00001
          )
            throw Error('Vehicle corner crossed')
        }
  }
  for (const [name, x, z, ox, oz] of edges) {
    const yaw = Math.atan2(-ox, -oz)
    setup(x - ox * 2.8, z - oz * 2.8, yaw, false)
    for (let i = 0; i < 100; i++) tick(['KeyW'], i)
    if (clearance(sim.player.x, sim.player.z) > 0.48)
      throw Error(name + ' walk did not reach boundary')
    sim.toggleCamera()
    tick([], 0)
    for (let i = 0; i < 45; i++) tick(['KeyS'], i)
    if (clearance(sim.player.x, sim.player.z) < 2) throw Error('Cannot walk away')
    setup(x - ox * 7, z - oz * 7, yaw, true)
    sim.vehicle.speed = sport.spec.max * 1.2
    for (let i = 0; i < 105; i++) tick(['KeyW'], i)
    const gap = clearance(sim.vehicle.x, sim.vehicle.z)
    if (Math.abs(gap - sport.spec.length / 2) > 0.05)
      throw Error(name + ' car did not reach boundary ' + gap)
    sim.toggleCamera()
    tick([], 0)
    for (let i = 0; i < 120; i++) tick(['KeyS'], i)
    if (clearance(sim.vehicle.x, sim.vehicle.z) < gap + 3)
      throw Error('Cannot reverse from ' + name)
    for (const sign of [-1, 1]) {
      const tx = -oz * sign,
        tz = ox * sign,
        yaw = Math.atan2(-tx, -tz)
      setup(
        x - ox * (sport.spec.width / 2 + 0.01),
        z - oz * (sport.spec.width / 2 + 0.01),
        yaw,
        true,
      )
      sim.vehicle.speed = sport.spec.max * 1.2
      const start = { x: sim.vehicle.x, z: sim.vehicle.z }
      for (let i = 0; i < 43; i++) tick(['KeyW'], i)
      if ((sim.vehicle.x - start.x) * tx + (sim.vehicle.z - start.z) * tz < 40)
        throw Error('Cannot drive along ' + name)
    }
    checks.push(name)
  }
  for (const [x, z, ox, oz] of corners) {
    setup(x - ox * 6, z - oz * 6, Math.atan2(-ox, -oz), true)
    sim.vehicle.speed = sport.spec.max * 1.2
    for (let i = 0; i < 90; i++) tick(['KeyW'], i)
    if (Math.abs(sim.vehicle.x - x) > 4 || Math.abs(sim.vehicle.z - z) > 4)
      throw Error('Did not reach corner')
    for (let i = 0; i < 110; i++) tick(['KeyS', 'KeyA'], i)
    if (Math.hypot(sim.vehicle.x - x, sim.vehicle.z - z) < 6) throw Error('Corner trapped car')
    checks.push([x, z])
  }
  sim.restore(base)
  return { checks, entrySpeedKmh: 3.6 * sport.spec.max * 1.2 }
}
