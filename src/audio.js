// Procedural field recordings and motor tones keep the complete game playable offline.
export function createAudio() {
  let ctx,
    master,
    noiseBuffer,
    engine,
    motorLevel,
    wind,
    rain,
    traffic,
    tire,
    volume = 0.55,
    walk = 0,
    bird = 8,
    muted = true
  const passBy = []
  let birdSide = 1
  function gain(to, amount = 0) {
    const g = ctx.createGain()
    g.gain.value = amount
    g.connect(to)
    return g
  }
  function noiseLoop(freq, type, to) {
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      g = gain(to)
    src.buffer = noiseBuffer
    src.loop = true
    filter.type = type
    filter.frequency.value = freq
    src.connect(filter)
    filter.connect(g)
    src.start()
    return g
  }
  function activate() {
    if (!ctx)
      try {
        ctx = new AudioContext()
        master = gain(ctx.destination, 0)
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
        const data = noiseBuffer.getChannelData(0)
        let prev = 0
        for (let i = 0; i < data.length; i++) {
          prev = 0.35 * prev + (Math.random() * 2 - 1) * 0.65
          data[i] = prev
        }
        wind = noiseLoop(470, 'lowpass', master)
        rain = noiseLoop(2700, 'highpass', master)
        traffic = noiseLoop(105, 'lowpass', master)
        // Two reusable emitters carry nearby engines as their vehicles pass the listener.
        if (ctx.createPanner)
          for (let i = 0; i < 2; i++) {
            const spatial = ctx.createPanner()
            spatial.panningModel = 'equalpower'
            spatial.distanceModel = 'inverse'
            spatial.refDistance = 4
            spatial.maxDistance = 65
            spatial.rolloffFactor = 1.3
            spatial.connect(master)
            const voice = ctx.createOscillator(),
              level = gain(spatial),
              filter = ctx.createBiquadFilter()
            filter.type = 'lowpass'
            filter.frequency.value = 230
            voice.type = 'triangle'
            voice.connect(filter)
            filter.connect(level)
            voice.start()
            passBy.push({ spatial, voice, level })
          }
        tire = noiseLoop(1200, 'bandpass', master)
        engine = ctx.createOscillator()
        engine.type = 'sawtooth'
        engine.frequency.value = 36
        const fil = ctx.createBiquadFilter()
        fil.type = 'lowpass'
        fil.frequency.value = 165
        motorLevel = gain(master)
        engine.connect(fil)
        fil.connect(motorLevel)
        engine.start()
      } catch {
        ctx = null
        return
      }
    ctx.resume().catch(() => {})
    setActive(true)
  }
  function setActive(on) {
    muted = !on
    if (master) master.gain.setTargetAtTime(on ? volume * 0.55 : 0, ctx.currentTime, 0.07)
  }
  function setVolume(value) {
    volume = value
    setActive(!muted)
  }
  function tone(freq, end, length, level = 0.12, type = 'sine', delay = 0, pan = 0) {
    if (!ctx || muted || !master) return
    const t = ctx.currentTime + delay,
      o = ctx.createOscillator(),
      g = ctx.createGain()
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + length)
    o.type = type
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.025, length * 0.2))
    g.gain.exponentialRampToValueAtTime(0.0001, t + length)
    o.connect(g)
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      g.connect(p)
      p.connect(master)
      o.onended = () => {
        p.disconnect()
        g.disconnect()
      }
    } else {
      g.connect(master)
      o.onended = () => g.disconnect()
    }
    o.start(t)
    o.stop(t + length + 0.03)
  }
  function burst(length, freq, level, type = 'lowpass', delay = 0) {
    if (!ctx || muted) return
    const s = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = gain(master),
      t = ctx.currentTime + delay
    s.buffer = noiseBuffer
    s.loop = true
    f.type = type
    f.frequency.value = freq
    s.connect(f)
    f.connect(g)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(level, t + 0.018)
    g.gain.exponentialRampToValueAtTime(0.0001, t + length)
    s.start(t, Math.random())
    s.stop(t + length + 0.01)
    s.onended = () => {
      s.disconnect()
      g.disconnect()
      f.disconnect()
    }
  }
  const cue = {
    ui: () => tone(440, 585, 0.085, 0.085),
    step: () => {
      tone(660, 710, 0.11, 0.09)
      tone(850, 900, 0.14, 0.08, 'sine', 0.1)
    },
    reward: () =>
      [392, 494, 587, 784].forEach((v, i) => tone(v, v * 1.003, 0.36, 0.14, 'sine', i * 0.115)),
    horn: () => {
      tone(349, 349, 0.33, 0.15, 'sawtooth')
      tone(440, 438, 0.32, 0.12, 'triangle')
    },
    door: () => {
      burst(0.16, 400, 0.48)
      tone(92, 40, 0.1, 0.18, 'triangle')
    },
    hit: () => burst(0.24, 620, 0.54),
    thunder: () => {
      burst(2.1, 200, 0.72, 'lowpass', 0.48)
      tone(45, 28, 1.9, 0.2, 'sine', 0.65)
    },
  }
  function update(dt, sim, world, climate, traveled, camera) {
    if (!ctx || muted) return
    const t = ctx.currentTime,
      v = sim.vehicle,
      p = sim.player,
      rate = (g, x) => g.gain.setTargetAtTime(x, t, 0.13)
    rate(wind, 0.05 + climate.haze * 0.08)
    rate(rain, climate.wet * 0.2)
    let proximity = 0,
      pan = 0
    let nearest = null,
      second = null,
      nearestD = 65,
      secondD = 65
    for (const c of sim.traffic || []) {
      const dist = Math.hypot(c.x - p.x, c.z - p.z)
      if (c.active === false) continue
      if (dist < nearestD) {
        second = nearest
        secondD = nearestD
        nearest = c
        nearestD = dist
      } else if (dist < secondD) {
        second = c
        secondD = dist
      }
      if (dist < 50 && 1 - dist / 50 > proximity) {
        proximity = 1 - dist / 50
        pan = Math.tanh((c.x - p.x) / 18)
      }
    }
    const indoor = world.indoors(p.x, p.z)
    rate(
      traffic,
      ((p.z < -45 && p.z > -200 ? 0.055 : 0.013) + proximity * 0.06) * (indoor ? 0.32 : 1),
    )
    // Relative coordinates keep stereo placement stable in chase and first-person cameras.
    const yaw = camera
      ? Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
      : p.yaw
    const cs = Math.cos(yaw),
      sn = Math.sin(yaw)
    passBy.forEach(({ spatial, voice, level }, i) => {
      const c = i === 0 ? nearest : second
      if (!c) {
        rate(level, 0)
        return
      }
      const dx = c.x - p.x,
        dz = c.z - p.z,
        xx = dx * cs - dz * sn,
        zz = dx * sn + dz * cs
      if (spatial.positionX) {
        spatial.positionX.setTargetAtTime(xx, t, 0.065)
        spatial.positionY.value = -0.8
        spatial.positionZ.setTargetAtTime(zz, t, 0.065)
      } else spatial.setPosition(xx, -0.8, zz)
      voice.frequency.setTargetAtTime(43 + Math.abs(c.speed) * 3.4, t, 0.14)
      rate(level, (indoor ? 0.022 : 0.063) * (1 + Math.min(1, Math.abs(c.speed) / 12)))
    })
    const speed = v ? Math.abs(v.speed) : 0
    rate(motorLevel, v ? 0.05 + Math.min(0.09, speed * 0.005) : 0)
    rate(tire, v ? Math.min(0.14, speed * 0.003) * (1 + climate.wet) : 0)
    if (v) {
      const g = Math.max(1, +v.gear || 1)
      engine.frequency.setTargetAtTime(31 + Math.min(105, (speed * 7) / g), t, 0.12)
    }
    if (!v && traveled < 2 && Math.abs(p.y - world.height(p.x, p.z)) < 0.24) {
      walk += traveled
      if (walk > 0.93) {
        walk = 0
        const road = world.surface?.(p.x, p.z) === 'road'
        burst(0.113, road ? 920 : 2300, road ? 0.25 : 0.21)
        tone(road ? 96 : 75, 40, 0.075, 0.13, 'triangle')
      }
    }
    bird -= dt
    if (bird < 0) {
      bird = 5 + Math.random() * 10
      if (!climate.night && !indoor && climate.wet < 0.3) {
        birdSide = -birdSide
        const side = birdSide * (0.25 + Math.random() * 0.64),
          pitch = 1450 + Math.random() * 690
        const envelope = p.z < -40 && p.z > -205 && Math.abs(p.x) < 99 ? 0.43 : 1
        tone(pitch, pitch * 1.54, 0.09, 0.039 * envelope, 'sine', 0, side)
        tone(pitch * 1.43, pitch * 1.09, 0.14, 0.033 * envelope, 'sine', 0.13, side)
      } else if (proximity > 0.5) tone(250, 205, 0.24, 0.028, 'triangle', 0, pan)
    }
  }
  return { activate, setActive, setVolume, update, play: (name) => cue[name]?.() }
}
