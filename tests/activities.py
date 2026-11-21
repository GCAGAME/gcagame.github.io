"""Drive the time trial and play a courier contract in the actual browser game.

Run with Python + Playwright and Chrome. The test serves the editable project if
no URL is supplied. Isolated scenario setup places a sedan at the grid and
starts the player on Foundry Row. After acceptance all race/checkpoint movement
uses normal controls. Distant survey sites are sampled with separate fixtures.
"""
import contextlib
import argparse
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url', nargs='?')
parser.add_argument('--course', choices=['civic', 'cedar'], default='civic',
                    help='Use cedar for the separate longer course regression.')
options = parser.parse_args()

class QuietFiles(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class AssetServer(http.server.ThreadingHTTPServer):
    request_queue_size = 64


@contextlib.contextmanager
def game_url():
    if options.url:
        yield options.url
        return
    handler = functools.partial(QuietFiles, directory=str(Path(__file__).resolve().parents[1]))
    with AssetServer(('127.0.0.1', 0), handler) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            yield 'http://127.0.0.1:%d/' % server.server_port
        finally:
            server.shutdown()


with game_url() as url, sync_playwright() as pw:
    chrome = pw.chromium.launch(channel='chrome', headless=True)
    page = chrome.new_page(viewport={'width': 960, 'height': 600})
    page.set_default_timeout(180000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda msg: errors.append((msg.text, msg.location.get('url', ''))) if msg.type == 'error' and 'favicon' not in msg.text else None)
    page.on('requestfailed', lambda req: errors.append((req.failure, req.url)) if req.failure!='net::ERR_ABORTED' else None)
    page.goto(url + '?inspect', wait_until='domcontentloaded')
    page.wait_for_function('window.briar')
    page.get_by_role('button', name='New Game').click()
    check = page.evaluate
    page.wait_for_function('briar.screen()==="hud"')
    check("""()=>{const b=briar;
      b.actions.setSetting('quality','Low');b.actions.setSetting('timeScale',0);
      window.fixtureAt=(x,z,car=false)=>{
        const save=b.sim.serialize(); save.current=null;
        Object.assign(save.player,{x,z,y:b.world.height(x,z),yaw:0});
        if(car)Object.assign(save.cars.find(c=>c.id==='sedan'),{x:-90,z:-77.7,yaw:-Math.PI/2});
        b.sim.restore(save);b.refresh()
      };
      fixtureAt(-89,-72,true);
    }""")
    walking_controls = """()=>{const b=briar;
      window.tickActivity=(keys,look=0)=>{
        const x=b.sim.player.x,z=b.sim.player.z,dt=1/45;
        b.world.update(dt,{...b.sim.player,hour:11,quality:'Low',camera:b.camera});
        b.sim.update(dt,{keys:new Set(keys),settings:b.settings(),hour:11,lookX:look});
        b.interactions.activities.update(dt,x,z);
      };
      window.walkTo=(x,z,r=.45)=>{
        for(let i=0;i<1600;i++){const p=b.sim.player, dx=x-p.x,dz=z-p.z;
          if(Math.hypot(dx,dz)<r) {for(let n=0;n<12;n++)tickActivity([]);return}
          const angle=Math.atan2(-dx,-dz)-p.yaw;
          tickActivity(['KeyW'], -Math.atan2(Math.sin(angle),Math.cos(angle))/.0022)
        }throw Error('Walk blocked to '+[x,z]+' from '+[b.sim.player.x,b.sim.player.z])
      };
    }"""
    check(walking_controls)
    check("""()=>{const b=briar;
      window.driveRoute=(points)=>{
        for(const [x,z,r=2.7] of points){
          let reached=false;
          for(let i=0;i<1100;i++){
            const c=b.sim.vehicle,dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz);
            if(d<r){reached=true;break}
            const a=Math.atan2(-dx,-dz)-c.yaw,diff=Math.atan2(Math.sin(a),Math.cos(a)),keys=[];
            const goal=Math.max(2.2,Math.min(9,d*.85+1.8,9/(1+Math.abs(diff)*1.75)));
            if(c.speed<goal-.3)keys.push('KeyW');if(c.speed>goal+.6)keys.push('Space');
            if(Math.abs(diff)>.07)keys.push(diff>0?'KeyA':'KeyD');tickActivity(keys)
          }
          if(!reached){const c=b.sim.vehicle;throw Error('Driving to '+[x,z]+' blocked at '+[c.x,c.z,c.yaw]+
            ' cars '+JSON.stringify([...b.sim.cars,...b.sim.traffic].filter(v=>v!==c&&Math.hypot(c.x-v.x,c.z-v.z)<14).map(v=>[v.id,v.x,v.z,v.yaw,v.speed]))+
            ' static '+JSON.stringify([...b.world.candidates(c.x,c.z,5)].map(v=>[v.x,v.z,v.w,v.d])))}
        }
        for(let i=0;i<150;i++)tickActivity(['Space'])
      }
    }""")
    def interact(label=None):
        if label:
            current = check('briar.interactions.check()?.label')
            assert label.lower() in (current or '').lower(), (label, current)
        page.keyboard.press('KeyE')

    interact()
    page.locator('[data-dialog="race/' + options.course + '"]').click()
    check('walkTo(-90,-75.5)')
    interact('enter')
    interact('start')
    assert check('briar.interactions.activities.state.job.step') == 0
    page.keyboard.press('Tab')
    page.locator('[data-activity="restart"]').click()
    assert check('briar.interactions.activities.state.job.step') == -1
    page.keyboard.press('Tab')
    interact('start')
    routes = {
        'civic': [[-39,-77.7],[-6,-77.7],[-.2,-80,3],[2.3,-88],
                  [2.3,-121],[1.5,-128,3],[-5,-132.2,3],[-55,-132.2],[-63,-131,3.4],
                  [-66.2,-124],[-66.2,-91],[-67,-83,3.2],[-74,-82.3],[-89,-82.3]],
        'cedar': [[-37,-77.7],[-10,-77.7],[-4.0,-75,3],[-2.4,-69],[-2.4,-12],
                  [-4,-4,3],[-11,-2.2],[-51,-2.2],[-58,-4,3],[-61.8,-12],[-61.8,-66],
                  [-63,-76,3],[-69,-81,3],[-76,-82.3],[-89,-82.3]],
    }
    check('points=>driveRoute(points)', routes[options.course])
    race = check('({...briar.interactions.activities.state})')
    assert race['job'] is None and race['races'] == 1 and race['best'][options.course]>0, race
    if options.course == 'cedar':
        assert race['best']['cedar'] < 135 and check('briar.story.state.money') == 200 and not errors
        print('Cedar Avenue Circuit: five ordered gates under normal steering, restart and $120 reward', race['best'], flush=True)
        chrome.close()
        raise SystemExit(0)
    assert check('briar.story.state.money') == 175
    print('Civic Square Sprint: five ordered gates under normal steering, restart and $95 reward', race['best'], flush=True)
    interact('Exit')
    check('walkTo(-94,-72)')
    interact()
    page.locator('[data-dialog="delivery/archive"]').click()
    interact('Collect')
    assert check("briar.interactions.inventory().some(i=>i.name==='Archive prints')")
    assert check('briar.save(true)')
    check('briar.interactions.activities.cancel();briar.load(true)')
    assert check('briar.interactions.activities.state.job.step') == 1
    check('walkTo(-89,-74.65);walkTo(-69,-74.65);walkTo(-59,-74.65);walkTo(-47,-70.6)')
    interact('Hand over')
    assert check('briar.story.state.money===240 && briar.interactions.activities.state.deliveries===1')
    print('Archive delivery accepted, collected, saved in transit, restored, walked and handed over for $65.', flush=True)
    for x, z in [(-53,-69.8), (96.4,-109.1), (125.7,-375)]:
        check('([x,z])=>fixtureAt(x,z)', [x,z])
        interact('rubbing')
    assert check('briar.story.state.money===380 && briar.interactions.activities.state.stamps.length===3')
    check('fixtureAt(-85,-70.2)')
    interact('showroom door')
    check('for(let i=0;i<90;i++)tickActivity([]);walkTo(-85,-65.6)')
    interact('motors')
    page.locator('[data-dealer="browse"][data-value="suv"]').click()
    page.locator('[data-dealer="buy"]').click()
    initial_preview = page.locator('.motor-preview').get_attribute('src')
    assert initial_preview.startswith('data:image/') and len(initial_preview) > 1000
    page.locator('[data-dealer="paint"][data-value="marine"]').click()
    painted_preview = page.locator('.motor-preview').get_attribute('src')
    assert initial_preview != painted_preview, 'Selected paint must be visible on the rendered vehicle'
    page.locator('[data-dealer="wheels"][data-value="graphite"]').click()
    page.locator('[data-dealer="tune"]').click()
    page.locator('[data-dealer="collect"]').click()
    state = check("""()=>{const {sim,story,interactions}=briar,c=sim.cars.find(x=>x.id==='suv');
        return {dealer:interactions.dealer.state,cash:story.state.money,upgraded:c.upgraded,x:c.x,z:c.z}}""")
    assert state['dealer']['selected']=='suv' and state['cash']==55 and state['upgraded'] and abs(state['z']+72.2)<.2, state
    saved = json.dumps(state['dealer'], sort_keys=True)
    page.keyboard.press('Escape')
    assert check('briar.save(true)')
    page.reload(wait_until='domcontentloaded');page.wait_for_function('window.briar')
    page.get_by_role('button', name='Continue').click()
    actual = check('briar.interactions.dealer.state')
    assert json.dumps(actual, sort_keys=True)==saved and check('briar.story.state.money')==55
    assert check('briar.interactions.activities.state.stamps.length===3 && briar.interactions.activities.state.races===1')
    print('Survey rewards, walk-through dealership door, registration, collection, paint, wheels, tune and fresh reload passed.', flush=True)
    migrated = check("""()=>{const b=briar;
      const old=b.world.interactables.filter(i=>!i.newDistrict);
      const i=old.findIndex(o=>o.type==='pickup'), door=old.findIndex(o=>o.type==='door'&&o.x===14);
      if(i<0||door<0)throw Error('Missing legacy interactable fixture');
      b.interactions.restore({used:[i],changes:[door],dropped:[]});
      const result=b.interactions.serialize();
      return old[door].isOpen&&result.places.collected.includes('pickup/12.00/-93.65')&&
        !b.world.interactables.some(o=>o.newDistrict&&o.isOpen)
    }""")
    assert migrated
    print('Legacy numeric pickup and post-office door save migrated to their original places.', flush=True)
    def visit(x,z):
        check("""([x,z])=>{const b=briar,s=b.sim.serialize();s.current=null;
          Object.assign(s.player,{x,z,y:b.world.height(x,z)});b.sim.restore(s);b.refresh()}""", [x,z])
    check(walking_controls)  # Continue ran in a freshly reloaded page.
    visit(-20.9,20.85)
    interact('market door')
    check('for(let i=0;i<80;i++)tickActivity([]);walkTo(-20.9,17.35,.2);walkTo(-23.2,17.35);walkTo(-23.2,14.3)')
    assert check("briar.world.indoors(briar.sim.player.x,briar.sim.player.z)")
    assert check("briar.world.locations.grocer.name === 'Cedar Grocery'")
    interact('Cedar Grocery')
    page.locator('[data-dialog="groceryWater"]').click()
    assert check('briar.story.state.bag.water===1 && briar.story.state.money===47')
    page.locator('[data-dialog="leave"]').click()
    visit(-79.3,-103.3)
    check('briar.sim.player.health=60')
    interact('Juniper Kitchen')
    page.locator('[data-dialog="lunch"]').click()
    assert check('briar.sim.player.health>=72 && briar.story.state.money===38')
    visit(-93,-71.5)
    interact()
    page.locator('[data-dialog="delivery/harbor"]').click()
    visit(21,-96)
    interact('Collect')
    visit(68,-172)
    interact('Hand over')
    assert check('briar.story.state.money===118')
    print('Grocery purchase, lunch recovery and second courier pickup / handoff endpoints passed.',flush=True)
    assert not errors, errors
    chrome.close()
