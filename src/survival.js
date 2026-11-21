export function createSurvival(sim, world, story, notify) {
  const state = { stamina: 100, chill: 0 }
  const tiredKeys = new Set()
  let tired = false,
    peak = 0,
    airborne = false
  function reset(saved) {
    state.stamina = Math.max(
      0,
      Math.min(100, Number.isFinite(saved?.stamina) ? saved.stamina : 100),
    )
    state.chill = Math.max(0, Math.min(100, Number.isFinite(saved?.chill) ? saved.chill : 0))
    tired = state.stamina < 3
    airborne = false
    peak = sim.player.y
    sim.player.stamina = state.stamina
  }
  function controls(keys) {
    if (!tired) return keys
    tiredKeys.clear()
    for (const key of keys) if (key !== 'ShiftLeft' && key !== 'ShiftRight') tiredKeys.add(key)
    return tiredKeys
  }
  function update(dt, climate, worn) {
    const p = sim.player
    const running = !sim.vehicle && !p.swimming && p.speed > 4.1,
      water = p.swimming && !sim.vehicle
    state.stamina = Math.min(
      100,
      Math.max(
        0,
        state.stamina +
          dt *
            (running
              ? -3.5
              : water && p.speed > 1
                ? -1.1
                : p.speed < 0.35 || sim.vehicle
                  ? 7
                  : 2.1),
      ),
    )
    if (state.stamina < 1) tired = true
    if (state.stamina > 22) tired = false
    const exposed = !sim.vehicle && !world.indoors?.(p.x, p.z)
    const cold = water ? 1.15 : exposed && climate.snow > 0.42 && worn !== 'shell' ? 0.48 : 0
    const oldChill = state.chill
    state.chill = Math.max(0, Math.min(100, state.chill + dt * (cold || -1.65)))
    if (oldChill < 60 && state.chill >= 60)
      notify('Getting cold · Find shelter or equip a field jacket')
    if (state.chill > 72) p.health = Math.max(0, p.health - dt * 0.57)
    if (sim.seated) p.health = Math.min(100, p.health + dt * 0.45)
    if (p.grounded && airborne) {
      const fall = peak - world.height(p.x, p.z)
      if (fall > 3.25) p.health = Math.max(0, p.health - (fall - 3.25) * 7)
      airborne = false
    } else if (!sim.vehicle && !p.grounded && !water) {
      peak = airborne ? Math.max(peak, p.y) : p.y
      airborne = true
    } else if (sim.vehicle || water) airborne = false
    if (p.health <= 0) {
      const save = sim.serialize(),
        home = world.locations.home
      save.current = null
      Object.assign(save.player, {
        x: home.x,
        z: home.z,
        y: world.height(home.x, home.z),
        health: 70,
      })
      sim.restore(save)
      reset()
      const fee = Math.min(story.state.money, 15)
      story.state.money -= fee
      notify('Recovered at Cedar House · County rescue fee $' + fee)
    }
    p.stamina = state.stamina
    p.chill = state.chill
  }
  return {
    state,
    controls,
    update,
    reset,
    drink() {
      state.stamina = Math.min(100, state.stamina + 55)
      sim.player.stamina = state.stamina
    },
  }
}
