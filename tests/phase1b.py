"""Play the opening mission and exercise the perimeter in Chrome."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000/'
tests=Path(__file__).parent
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True,args=['--disable-background-timer-throttling'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    page.set_default_timeout(90000)
    errors=[]
    page.on('pageerror',lambda e:(errors.append(str(e)),print('Page error',e,flush=True)))
    page.on('console',lambda m:(errors.append(m.text[:1400]),print('Console error',m.text[:500],flush=True)) if m.type=='error' and 'favicon' not in m.text and '404' not in m.text else None)
    page.goto(url+'?inspect',timeout=150000)
    page.wait_for_function('window.briar',timeout=150000)
    page.get_by_role('button',name='New Game').click(no_wait_after=True)
    page.wait_for_function('briar.screen()==="hud"')
    B=page.evaluate
    B("briar.actions.setSetting('adaptive',false)")
    first=B('briar.sim.firstPerson')
    page.keyboard.press('KeyV')
    assert B('briar.sim.firstPerson')!=first
    page.keyboard.press('KeyV')
    page.keyboard.press('Space')
    page.wait_for_function('briar.sim.player.y>briar.world.height(briar.sim.player.x,briar.sim.player.z)+.15')
    page.wait_for_function('briar.sim.player.grounded')
    B("""()=>{window.missionSteps=new Set([briar.story.state.step]);window.tickMission=(keys=[],look=0)=>{
      const dt=1/45;briar.world.update(dt,{...briar.sim.player,hour:11});
      briar.sim.update(dt,{keys:new Set(keys),lookX:look,settings:briar.settings()});briar.story.update(dt,Math.abs(look));
      if(!briar.story.state.chapter)missionSteps.add(briar.story.state.step)
    };for(let i=0;i<5;i++)tickMission([],7);
    const start={...briar.sim.player};
    for(let i=0;i<150&&(!briar.sim.nearestCar()||briar.story.state.step<2);i++)tickMission(['KeyW']);
    if(!briar.sim.nearestCar()||Math.hypot(start.x-briar.sim.player.x,start.z-briar.sim.player.z)<.3)throw Error('Walk to sedan') }""")
    page.keyboard.press('KeyE')
    page.wait_for_function('briar.sim.vehicle?.type==="sedan"')
    view=B('briar.sim.firstPerson');page.keyboard.press('KeyC');assert B('briar.sim.firstPerson')!=view
    page.keyboard.press('KeyC')
    # Steer through the actual streets. No pose restoration or checkpoint injection on this route.
    route=B("""()=>{const {sim,story}=briar;
      const points=[[1.8,57,3.3],[2.5,40],[2.5,2],[2.5,-36],[2.8,-62],[7.8,-72,4.5]];
      let peak=0,brakes=0;
      for(const [x,z,r=2.5] of points){let reached=false;
        for(let i=0;i<1100;i++){const c=sim.vehicle,dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz);
          if(d<r){reached=true;break}
          const a=Math.atan2(-dx,-dz)-c.yaw,diff=Math.atan2(Math.sin(a),Math.cos(a));
          const goal=Math.max(1.9,Math.min(7.8,d*.8+1.6,7.8/(1+Math.abs(diff)*1.7)));
          const k=[];if(c.speed<goal-.3)k.push('KeyW');if(c.speed>goal+.65){k.push('Space');brakes++}
          if(Math.abs(diff)>.07)k.push(diff>0?'KeyA':'KeyD');tickMission(k);peak=Math.max(peak,c.speed)
        }if(!reached)throw Error('Missed waypoint '+x+','+z)
      }
      for(let i=0;i<150;i++)tickMission(['Space']);
      return {steps:[...missionSteps],chapter:story.state.chapter,balance:story.state.money,completed:story.state.completed,peak,brakes,parked:sim.vehicle.speed}
    }""")
    print('Opening mission',route,flush=True)
    assert route['steps']==[0,1,2,3,4] and route['chapter']==1 and route['balance']==230 and abs(route['parked'])<.8
    page.keyboard.press('KeyE');page.wait_for_function('!briar.sim.vehicle')
    page.keyboard.press('Escape');page.wait_for_function('briar.screen()==="pause"')
    paused=B('[briar.sim.player.x,briar.sim.player.z,briar.climate.state.hour]')
    page.keyboard.down('KeyW');page.wait_for_timeout(250);page.keyboard.up('KeyW')
    assert B('[briar.sim.player.x,briar.sim.player.z,briar.climate.state.hour]')==paused
    page.locator('[data-action="save"]').click()
    saved=B('({...briar.sim.player})')
    assert B('!!localStorage.getItem("projectReality.briar.v1.manual")')
    page.locator('[data-panel="settings"]:visible').click()
    for q in ['Low','Medium','High','Ultra']:
        select=page.locator('#setting-quality')
        select.select_option(q)
        state=B("""()=>{const s=briar.scene.children.find(v=>v.isDirectionalLight);return [briar.settings().quality,briar.camera.far,s.castShadow?s.shadow.mapSize.x:0,briar.graphics.textureQuality,briar.settings().ao,briar.settings().reflections]}""")
        print('Preset',state,flush=True)
        assert B('JSON.parse(localStorage.getItem("projectReality.briar.v1.settings")).quality')==q
        assert state==[q,{'Low':200,'Medium':395,'High':560,'Ultra':800}[q],{'Low':0,'Medium':1024,'High':2048,'Ultra':4096}[q],q,q!='Low',q!='Low']
    page.reload(timeout=150000);page.wait_for_function('window.briar',timeout=150000)
    assert B("briar.settings().quality==='Ultra'&&briar.camera.far===800&&briar.renderer.shadowMap.enabled")
    resume_button=page.get_by_role('button',name='Continue')
    assert resume_button.is_enabled()
    resume_button.focus()
    page.keyboard.press('Enter')
    page.wait_for_function('briar.screen()==="hud"')
    assert B('briar.story.state.money===230&&briar.story.state.chapter===1')
    B("briar.actions.setSetting('quality','Medium')")
    B("briar.sim.player.x+=3")
    page.keyboard.press('Escape');page.wait_for_function('briar.screen()==="pause"')
    page.locator('[data-action="load"]').click();page.wait_for_function('briar.screen()==="hud"')
    assert abs(B('briar.sim.player.x')-saved['x'])<.1
    print('Camera switches, jump, entry/exit, pause, manual save/load, continue and preset persistence passed',flush=True)
    print('Perimeter',B((tests/'border-check.js').read_text()),flush=True)
    assert not errors,errors
    print('No game or shader errors',flush=True)
    browser.close()

