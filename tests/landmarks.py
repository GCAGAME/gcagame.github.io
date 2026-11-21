"""Check actual streamed landmark transforms, roof texture coordinates and farm contact in Chrome."""
import sys
from playwright.sync_api import sync_playwright

url = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8000/').rstrip('/')
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome')
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.goto(url + '?inspect', wait_until='domcontentloaded', timeout=150000)
    page.wait_for_function('window.briar', timeout=150000)
    page.evaluate("() => { briar.actions.startNew(); briar.actions.openPanel('pause') }")
    for lod, distance in [(1, 18), (2, 120)]:
        sample = page.wait_for_function("""
        ([lod, distance]) => {
          const { world, scene } = briar
          world.setQuality('high', 560)
          world.update(0.5, { x: -40 + distance, z: -107, hour: 14 })
          for (const obj of scene.children) {
            if (obj.name !== 'office-tower LOD ' + lod || !obj.visible) continue
            const map = obj.material.map
            if (!map?.image?.width || !map.generateMipmaps || map.colorSpace !== 'srgb') continue
            if (lod === 1 && !obj.material.normalMap?.image?.width) continue
            const a = obj.instanceMatrix.array
            for (let i = 0; i < obj.count * 16; i += 16) {
              if (Math.abs(a[i + 12] + 40) < 0.01 && Math.abs(a[i + 14] + 107) < 0.01)
                return [a[i], a[i + 5], a[i + 10]]
            }
          }
        }
    """, arg=[lod, distance], timeout=60000).json_value()
        print('Office detail', lod, sample, flush=True)
        assert min(sample) > 0 and max(sample) - min(sample) < 1e-6
    print('Geometry', page.evaluate("""
        () => {
          const { world, scene } = briar
          let gables = 0
          scene.traverse((mesh) => {
            if (mesh.material?.name !== 'siding') return
            const { position: p, uv } = mesh.geometry.attributes,
              index = mesh.geometry.index
            for (let n = 0; n < index.count; n += 3) {
              const a = index.getX(n),
                b = index.getX(n + 1),
                c = index.getX(n + 2)
              if (
                Math.abs(p.getY(a) - p.getY(b)) > 0.01 ||
                p.getY(c) - p.getY(a) < 0.3 ||
                Math.abs(p.getX(a) - p.getX(b)) > 0.01 ||
                Math.abs(p.getX(a) - p.getX(c)) > 0.01 ||
                Math.abs((p.getZ(a) + p.getZ(b)) / 2 - p.getZ(c)) > 0.01
              )
                continue
              if (Math.abs((uv.getX(a) + uv.getX(b)) / 2 - uv.getX(c)) > 0.001)
                throw Error('Sheared siding at ' + [p.getX(c), p.getZ(c)])
              gables++
            }
          })
          if (!gables) throw Error('No residential gables were inspected')
          const silo = [...world.candidates(-156, 10, 0.01)].find(
            (s) => s.x === -156 && s.z === 10 && s.w === 4,
          )
          if (!silo || silo.poly.length !== 14) throw Error('Silo shape')
          for (const [x, z] of silo.poly)
            if (silo.y > world.height(x, z)) throw Error('Floating silo rim')
          const barn = [...world.candidates(-168, 10, 0.01)].find(
            (s) => s.x === -168 && s.z === 10 && s.w === 15,
          )
          if (!barn || barn.d !== 10) throw Error('Barn footprint')
          for (const [x, z] of barn.poly)
            if (barn.y > world.height(x, z)) throw Error('Floating foundation')
          if (
            !world.blocked(-156, 10, 0.2, world.height(-156, 10) + 0.34) ||
            world.blocked(-154.1, 11.9, 0.05, world.height(-154.1, 11.9) + 0.34)
          )
            throw Error('Silo footing')
          return { gables, siloRimPoints: silo.poly.length, barnCorners: barn.poly.length }
        }
    """), flush=True)
    assert not errors, errors
    browser.close()
