"""Browser integration for mode isolation, inventory, sight, combat, custody and recovery."""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000/?inspect'
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 780, 'height': 500})
    page.add_init_script("""if (!localStorage.getItem('projectReality.briar.v1.settings'))
      localStorage.setItem('projectReality.briar.v1.settings', JSON.stringify({
        quality:'Low', shadows:'Off', resolution:.55, textureQuality:'Low', renderDistance:180,
        ao:false, reflections:false, antialias:false, adaptive:false
      }))""")
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('response', lambda r: errors.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    page.set_default_timeout(45000)
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_function('window.briar', timeout=180000)
    ev = page.evaluate
    click = lambda selector: page.locator(selector).click(no_wait_after=True)

    def screen(name):
        page.wait_for_function('name => briar.screen() === name', arg=name)

    def menu():
        page.keyboard.press('Escape')
        click('[data-action=menu]')
        screen('menu')

    def start():
        click('[data-action=newGame]')
        screen('hud')

    start()
    initial_people = ev('briar.sim.npcs.length')
    assert ev('!briar.hardcore && !briar.sim.canUseWeapon && briar.sim.patrolCars.length === 0')
    ev('briar.story.state.money = 111')
    menu()
    # Version-1 saves made before the mode selector used the original Normal slot.
    assert ev("""() => {
      const key = 'projectReality.briar.v1.auto', save = JSON.parse(localStorage.getItem(key))
      if (save.version !== 1) return false
      delete save.mode
      Object.assign(save.story, {chapter: 1, step: 0, completed: [0]})
      localStorage.setItem(key, JSON.stringify(save))
      return true
    }""")
    click('[data-mode=hardcore]')
    assert page.locator('[data-action=continue]').is_disabled()
    start()
    assert ev("briar.hardcore.arms.hud().loaded === 8 && briar.sim.player.health === 100")
    assert ev("briar.sim.npcs.filter(n=>n.role==='reckless-pedestrian' && !n.inactive).length===4")
    assert ev("briar.sim.traffic.filter(c=>c.reckless).length===1 && !briar.settings().bloodEffects")
    print('PASS mode slots, starter, four active reckless pedestrians and one reckless driver', flush=True)

    # Set up encounters in the actual county. Inputs, collisions, transactions and
    # persistence below run through the same systems used in the live game.
    ev("""() => {
      window.at = (x,z,yaw=0) => Object.assign(briar.sim.player, {x,z,y:briar.world.height(x,z),yaw,pitch:0})
      window.simTick = (keys=[]) => briar.sim.update(1/60,{keys:new Set(keys),settings:briar.settings()})
      window.combatTick = (n,aim=true) => { for(let i=0;i<n;i++) briar.hardcore.arms.update(1/60,aim) }
      window.activeMotes = () => briar.scene.getObjectByName('County outfitters').children
        .filter(o => o.isMesh && o.geometry.type==='OctahedronGeometry' && o.visible)
    }""")
    page.mouse.down(button='right')
    page.mouse.click(470, 300)
    page.wait_for_function('briar.hardcore.arms.hud().loaded === 7')
    page.mouse.up(button='right')
    page.keyboard.press('r')
    page.wait_for_function('briar.hardcore.arms.hud().loaded === 8')
    assert ev('briar.hardcore.arms.hud().reserve === 15')
    page.keyboard.press('m')
    click('[data-shop-route="1"]')
    assert ev("briar.save() && JSON.parse(localStorage.getItem('projectReality.briar.v1.hardcore.auto')).waypoint.z < -240")
    for x, z in [(24.1, -96.6), (7, -246.4)]:
        ev(f'() => {{at({x},{z});briar.refresh()}}')
        page.keyboard.press('e')
        screen('outfitters')
        if x > 20:
            assert page.locator('[data-outfit=swift]').is_disabled()
            click('[data-outfit=rook]')
            assert ev("briar.story.state.money === 68 && briar.hardcore.arms.hud().reserve === 31")
        else:
            ev('briar.story.state.money = 500; briar.refresh(true)')
            click('[data-outfit=swift]')
            click('[data-outfit=crest]')
            assert ev("briar.story.state.money === 105 && briar.hardcore.arms.hud().name === 'Crest Carbine'")
        page.keyboard.press('Escape')
    page.keyboard.press('1')
    assert ev("briar.hardcore.arms.hud().name === 'Rook Sidearm'")
    page.keyboard.press('q')
    assert ev("briar.hardcore.arms.hud().name === 'Swift Repeater'")
    print('PASS mouse fire and aim, timed reload, two counter interactions, route, purchases and weapon switching', flush=True)

    trace = ev("""async () => {
      const {isWorldOccluded} = await import('./src/hardcore-sight.js')
      const {world,sim}=briar, {arms,city}=briar.hardcore
      const door=world.interactables.find(d=>d.restoreDoor && Math.abs(d.x-14)<2 && Math.abs(d.z+90)<3)
      const outside={x:14,y:1.4,z:-87}, inside={x:14,y:1.4,z:-93}
      door.restoreDoor(false,0)
      const closed=isWorldOccluded(world,outside,inside)
      door.restoreDoor(true,1)
      const open=!isWorldOccluded(world,outside,inside)
      door.restoreDoor(false,0)
      const actor=sim.npcs.find(n=>n.role==='reckless-pedestrian')
      at(14,-87)
      Object.assign(actor,{x:14,z:-93,y:world.height(14,-93)})
      const shoot=() => {simTick(['MouseRight']);arms.trigger(true);combatTick(1);arms.trigger(false);combatTick(28)}
      const hp=actor.health
      shoot()
      const protectedByDoor=actor.health===hp
      door.restoreDoor(true,1)
      shoot()
      const damaged=actor.health < hp
      // Inspect feedback before its 300 ms lifetime expires.
      arms.clearParticles()
      arms.hit(actor)
      const neutral=activeMotes().length===3 && activeMotes().every(o=>o.material.color.getHex()===0xf6dda0)
      briar.actions.setSetting('bloodEffects',true)
      arms.clearParticles();arms.hit(actor)
      const stylized=activeMotes().length===5 && activeMotes().every(o=>o.material.color.getHex()===0xc85254)
      briar.actions.setSetting('bloodEffects',false)
      return {closed,open,protectedByDoor,damaged,neutral,stylized,cleared:!activeMotes().length}
    }""")
    assert all(trace.values()), trace
    print('PASS closed/open moving door, NPC shot damage, neutral feedback and immediate blood toggle', flush=True)
    ev('briar.actions.setSetting("bloodEffects",true);briar.save(true)')
    menu()
    click('[data-mode=normal]')
    assert page.locator('[data-action=continue]').is_enabled()
    click('[data-action=continue]')
    screen('hud')
    assert ev(f'briar.story.state.money===111 && briar.sim.npcs.length==={initial_people} && !briar.sim.traffic.some(c=>c.reckless)')
    assert ev('briar.story.state.chapter === 1 && briar.story.state.completed.join() === "0"')
    print('PASS Continue restored a pre-mode version-1 Normal campaign and balance', flush=True)
    menu()
    click('[data-mode=hardcore]')
    click('[data-action=continue]')
    screen('hud')
    assert ev("briar.story.state.money===105 && briar.hardcore.arms.hud().name==='Swift Repeater'")
    # Make a witnessed offense on open ground and let the arrest countdown complete.
    ev("""() => {
      const {city}=briar.hardcore, cop=briar.sim.npcs.find(n=>n.role==='police'&&!n.inactive)
      at(-8,25);Object.assign(cop,{x:-8,z:26,y:briar.sim.player.y,yaw:0})
      city.reportCrime('theft')
      if (!city.wanted) throw Error('Officer failed to witness theft')
      for(let i=0;i<200 && briar.screen()==='hud';i++) city.update(1/60)
    }""")
    screen('recovery')
    assert page.locator('#sheet-title').text_content() == 'Under arrest'
    page.keyboard.press('Escape')
    screen('recovery')
    click('[data-action=recover]')
    screen('hud')
    assert ev('briar.story.state.money===80 && briar.hardcore.city.wanted===0 && briar.sim.player.health===100')
    ev('briar.sim.player.health=0')
    screen('recovery')
    assert ev("briar.hardcore.outcome==='down'")
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.briar',timeout=180000)
    assert page.locator('[data-mode=hardcore]').get_attribute('aria-pressed') == 'true'
    click('[data-action=continue]')
    screen('recovery')
    assert ev("briar.settings().bloodEffects && briar.sim.player.health === 0")
    click('[data-action=recover]')
    assert ev("briar.story.state.money===65 && briar.sim.player.health===100 && briar.sim.player.x===briar.world.locations.home.x")
    assert not errors, errors
    print('PASS mode switch and restore, custody, death, reload while down, persistent preference and no browser errors', flush=True)
    browser.close()
