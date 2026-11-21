"""Exercise the real saved doorway, actors, meshes and collision queries in Chrome."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8000/'
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome')
    page = browser.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url+'?inspect',wait_until='domcontentloaded');page.wait_for_function('window.briar',timeout=160000)
    print(page.evaluate("""
        () => {
          const { sim, world, scene, actions } = briar
          actions.startNew()
          actions.openPanel('pause')
          const actor = sim.player,
            npc = sim.npcs[0]
          let poses = 0,
            cycles = 0,
            walks = 0
          const step = (dt) => world.update(dt, { ...actor, hour: 12 })
          for (const door of world.interactables.filter((d) => d.restoreDoor)) {
            const group = scene.children.find((g) => {
              const m = g.children[0],
                w = m?.geometry?.parameters?.width
              return (
                w &&
                Math.abs(g.position.x + w / 2 - door.x) < 0.001 &&
                Math.abs(Math.abs(g.position.z - door.z) - 0.6) < 0.001
              )
            })
            if (!group) throw Error(door.label)
            const hinge = group.position.x,
              z = group.position.z,
              base = world.height(door.x, z)
            const width = group.children[0].geometry.parameters.width
            function inspect(p, r = 0.29) {
              const a = group.rotation.y,
                dx = p.x - hinge,
                dz = p.z - z
              const localX = dx * Math.cos(a) - dz * Math.sin(a),
                localZ = dx * Math.sin(a) + dz * Math.cos(a)
              const distance = Math.hypot(
                Math.max(0, -localX, localX - width),
                Math.max(0, Math.abs(localZ) - 0.07),
              )
              if (p.y + 1.8 > group.position.y + 0.0001 && distance < r - 0.00001)
                throw Error('Intersection ' + door.label + ' ' + door.fraction)
              const cx = hinge + (Math.cos(a) * width) / 2,
                cz = z - (Math.sin(a) * width) / 2
              const shape = [...world.candidates(cx, cz, 0.01)].find(
                (o) => o.kind === 'door' && Math.hypot(o.x - cx, o.z - cz) < 0.001,
              )
              if (
                !shape ||
                Math.abs(shape.y - group.position.y) > 0.001 ||
                shape.poly.some(([x, z]) => !Number.isFinite(x + z))
              )
                throw Error('Desynchronized collider')
            }
            for (const hz of [15, 30, 60, 120])
              for (const at of [0.4, width * 0.55, width - 0.08]) {
                Object.assign(actor, { x: door.x, z: z + 6, y: base })
                door.restoreDoor(true, 1)
                Object.assign(actor, { x: hinge + at, z, y: base })
                door.setOpen(false)
                for (let i = 0; i < hz; i++) {
                  step(1 / hz)
                  inspect(actor)
                }
                if (door.fraction <= 0) throw Error('Closed through player')
                const saved = door.fraction
                if (hz === 30 && at === width * 0.55) {
                  if (!briar.save(true)) throw Error('Could not save obstructed door')
                  actor.z += 6
                  door.restoreDoor(true, 1)
                  briar.load(true)
                  if (Math.abs(door.fraction - saved) > 0.00001 || door.isOpen)
                    throw Error('Partial door save')
                } else door.restoreDoor(false, saved)
                inspect(actor)
                actor.z += 6
                for (let i = 0; i < hz * 2; i++) step(1 / hz)
                if (door.fraction !== 0) throw Error('Did not resume')
                poses++
              }
            door.restoreDoor(true, 1)
            const savedNPC = { x: npc.x, y: npc.y, z: npc.z }
            Object.assign(npc, { x: door.x, z, y: base })
            door.setOpen(false)
            for (let i = 0; i < 75; i++) {
              step(1 / 60)
              inspect(npc, 0.2)
            }
            if (door.fraction <= 0) throw Error('Closed through NPC')
            Object.assign(npc, savedNPC)
            for (let i = 0; i < 20; i++) {
              door.activate()
              for (let j = 0; j < 5; j++) step(1 / 30)
              cycles++
            }
            door.restoreDoor(false, 0)
            if (door.type === 'garage') {
              Object.assign(actor, { x: door.x, z: z + 5, y: base })
              door.restoreDoor(true, 1)
              Object.assign(actor, { x: door.x, z, y: base, grounded: true })
              const tick = (keys = []) => {
                sim.update(1 / 60, { keys: new Set(keys), hour: 12 })
                step(1 / 60)
              }
              for (let i = 0; i < 60; i++) tick(['ControlLeft'])
              door.setOpen(false)
              for (let i = 0; i < 120; i++) tick(['ControlLeft'])
              tick()
              if (!actor.crouching || actor.y + 1.24 > group.position.y + .00001)
                throw Error('Standing through a lowered garage door')
              door.setOpen(true)
              for (let i = 0; i < 120; i++) tick()
              if (actor.crouching || door.fraction !== 1) throw Error('Standing did not resume')
              sim.jump()
              let peak = actor.y
              for (let i = 0; i < 60; i++) {
                tick()
                peak = Math.max(peak, actor.y)
                if (actor.y + 1.8 > group.position.y + .00001)
                  throw Error('Jumped through the overhead door')
              }
              if (peak <= base + .05 || !actor.grounded) throw Error('Jump did not rise and land')
            }
            if (!door.label.includes('showroom')) continue
            for (const hz of [15, 30, 60, 120])
              for (const sprint of [false, true]) {
                Object.assign(actor, { x: door.x, z: z - 0.65, y: base, yaw: Math.PI })
                door.restoreDoor(true, 1)
                const keys = new Set(sprint ? ['KeyW', 'ShiftLeft'] : ['KeyW'])
                for (let i = 0; i < hz; i++) {
                  if (i === Math.ceil(hz * 0.12)) door.setOpen(false)
                  sim.update(1 / hz, { keys, hour: 12 })
                  step(1 / hz)
                  inspect(actor)
                }
                door.setOpen(true)
                const escaped = actor.z > z + width + 0.29
                for (let i = 0; i < hz; i++) {
                  sim.update(1 / hz, { keys: new Set([escaped ? 'KeyW' : 'KeyS']) })
                  step(1 / hz)
                  inspect(actor)
                }
                if (Math.abs(actor.z - z) < 0.6)
                  throw Error(
                    'Failed escape ' +
                      JSON.stringify({
                        hz,
                        sprint,
                        escaped,
                        x: actor.x,
                        z: actor.z,
                        doorZ: z,
                        yaw: actor.yaw,
                        fraction: door.fraction,
                      }),
                  )
                walks++
              }
          }
          if (poses !== 72 || cycles !== 120 || walks !== 8) throw Error('Missing door coverage')
          return { poses, cycles, walks }
        }
    """),flush=True)
    assert not errors, errors
    browser.close()
