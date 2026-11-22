"""Bounded, fixture-based regional sampling and renderer stress in the actual browser game."""
import sys
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8000/'
with sync_playwright() as pw:
    b=pw.chromium.launch(channel='chrome',headless=True)
    p=b.new_page(viewport={'width':1280,'height':720});errors=[];failed=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    p.on('console',lambda m:errors.append(m.text[:200]) if m.type=='error' else None)
    p.on('requestfailed',lambda r:failed.append((r.failure,r.url)))
    p.on('response',lambda r:failed.append((r.status,r.url)) if r.status>=400 else None)
    p.goto(url+'?inspect',wait_until='domcontentloaded',timeout=160000);p.wait_for_function('window.briar',timeout=160000)
    p.evaluate("()=>{const b=briar;b.actions.startNew();b.actions.setSetting('quality','Low');b.actions.setSetting('adaptive',false);b.actions.openPanel('pause')}")
    print('Coverage',p.evaluate("""
        () => {
          const { sim, world, graphics, settings, camera } = briar,
            points = [],
            hits = {},
            surface = {}
          for (let x = -600; x <= 600; x += 150)
            for (let z = -620; z <= 430; z += 150) points.push(['grid', x, z])
          for (const road of world.roads)
            for (const [i, v] of road.entries()) {
              points.push(['road node', v.x, v.z])
              if (i)
                points.push(['road midpoint', (v.x + road[i - 1].x) / 2, (v.z + road[i - 1].z) / 2])
            }
          for (const [k, v] of Object.entries(world.locations)) points.push([k, v.x, v.z])
          for (const v of [
            ['farm', -168, 18],
            ['showroom', -85, -69],
            ['cafe', -80.5, -92],
            ['grocer', -20.9, 19.5],
            ['parking', -83, -119],
            ['bridge', 137, -180],
          ])
            points.push(v)
          let moved = 0,
            stationary = 0
          const skipped = []
          for (const [name, x, z] of points) {
            let start
            for (const r of [0, 1.8, 3.5, 6, 9]) {
              for (let i = 0; i < 8; i++) {
                const X = x + r * Math.cos((i * Math.PI) / 4),
                  Z = z + r * Math.sin((i * Math.PI) / 4),
                  y = world.height(X, Z)
                if (!world.blocked(X, Z, 0.32, y + 0.34)) {
                  start = { x: X, z: Z, y }
                  break
                }
              }
              if (start) break
            }
            if (!start) {
              skipped.push([name, x, z])
              continue
            }
            Object.assign(sim.player, start)
            hits[name] = (hits[name] || 0) + 1
            world.update(0.5, { ...start, hour: 12, camera })
            for (let i = 0; i < 18; i++)
              sim.update(1 / 60, { keys: new Set(['KeyW']), hour: 12, settings: settings() })
            const actor = sim.player
            if (
              !Number.isFinite(actor.x + actor.y + actor.z) ||
              actor.y < world.height(actor.x, actor.z) - 0.25
            )
              throw Error('Ground contact ' + [name, x, z])
            if (Math.hypot(actor.x - start.x, actor.z - start.z) > 0.08) moved++
            else stationary++
            const s = world.surface(actor.x, actor.z)
            surface[s] = (surface[s] || 0) + 1
            if (name !== 'road node' && name !== 'road midpoint')
              graphics.render(settings(), false, 0, 0, 0)
          }
          return { hits, surface, moved, stationary, skipped }
        }
    """),flush=True)
    print('Repeat controls',p.evaluate("""
        () => {
          const { sim, world, actions } = briar
          sim.reset()
          const car = sim.cars[0]
          const finishTransfer = () => { for (let n = 0; n < 80; n++) sim.update(1/60) }
          for (let i = 0; i < 24; i++) {
            Object.assign(sim.player, {
              x: car.x - 1.6 * Math.cos(car.yaw),
              z: car.z + 1.6 * Math.sin(car.yaw),
              y: car.y,
            })
            if (!sim.enterExit().entered) throw Error('Entry ' + i)
            for (let n = 0; n < 480 && !sim.vehicle; n++) sim.update(1/60)
            finishTransfer()
            sim.toggleCamera()
            sim.toggleCamera()
            if (sim.enterExit().entered !== false || sim.vehicle) throw Error('Exit ' + i)
            finishTransfer()
          }
          for (let i = 0; i < 12; i++) {
            if (!briar.save(true)) throw Error('Save')
            briar.load(true)
          }
          return { enterExit: 24, camera: 48, savesAndLoads: 12 }
        }
    """),flush=True)
    for cycle in range(2):
        for q in ['Low','Medium','High','Ultra']:
            p.evaluate("""
        (q) => {
          const b = briar
          b.actions.setSetting('quality', q)
          b.actions.setSetting('adaptive', false)
          b.actions.setSetting('frameCap', 'Display')
          b.actions.setSetting('timeScale', 0)
          b.actions.setSetting('weather', 'Clear')
          const s = b.sim.serialize()
          s.current = null
          Object.assign(s.player, { x: -72, z: -81, yaw: 1.1, pitch: 0 })
          b.sim.restore(s)
          b.actions.resume()
        }
    """,q)
            p.wait_for_timeout(2200)
            result=p.evaluate("""
        () =>
          new Promise((resolve, reject) => {
            const b = briar,
              g = b.graphics,
              f = g.render,
              ts = []
            const timer = setTimeout(() => {
              g.render = f
              reject(Error('No completed frame sample after 20 seconds'))
            }, 20000)
            g.render = function (...args) {
              f.apply(g, args)
              ts.push(performance.now())
              if (ts.at(-1) - ts[0] > 3500) {
                clearTimeout(timer)
                g.render = f
                resolve({
                  fps: +((1000 * (ts.length - 1)) / (ts.at(-1) - ts[0])).toFixed(1),
                  frames: ts.length,
                  ...b.renderer.info.memory,
                  heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576),
                })
              }
            }
          })
    """)
            print('Preset',cycle+1,q,result,flush=True)
    # Read the automatic slot written by the running game, then wait for its next timer tick.
    previous = p.evaluate("() => JSON.parse(localStorage.getItem('projectReality.briar.v1.auto'))?.time || 0")
    p.wait_for_function("before => (JSON.parse(localStorage.getItem('projectReality.briar.v1.auto'))?.time || 0) > before",
                        arg=previous, timeout=60000)
    print('Automatic save timer wrote a new snapshot', flush=True)
    print('Errors',errors,failed,flush=True);assert not errors and not failed
    b.close()
