from playwright.sync_api import sync_playwright
import sys
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000/'
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel="chrome",headless=True,args=['--enable-unsafe-swiftshader','--no-first-run'])
    page=browser.new_page(viewport={'width':1280,'height':720});errs=[]
    page.on('pageerror',lambda error:errs.append(str(error)))
    page.on('console',lambda msg:errs.append(msg.text[:500]) if msg.type=='error' and '404' not in msg.text else None)
    page.goto(url+'?inspect',wait_until='domcontentloaded');page.wait_for_function('window.briar',timeout=120000)
    page.get_by_role('button',name='New Game').click()
    page.wait_for_timeout(3600)
    d=page.evaluate("""()=>{
      const {sim,world,interactions,story,climate,survival}=briar;
      function go(a){const s=sim.serialize();s.current=null;Object.assign(s.player,{x:a.x,z:a.z,y:world.height(a.x,a.z)});sim.restore(s)}
      function select(a){go(a);const t=interactions.check();if(!t) throw Error('No prompt for '+a.type);return t}
      const bench=world.interactables.find(a=>a.type==='bench');select(bench).run();let seat=sim.seated&&Math.hypot(sim.player.x-bench.seatX,sim.player.z-bench.seatZ)<.2;
      interactions.check().run();let stand=!sim.seated&&!world.blocked(sim.player.x,sim.player.z,.2,sim.player.y+.6);
      const supply=world.interactables.find(a=>a.type==='pickup');const prev=story.state.bag.kit||0;
      select(supply).run();const pickup=story.state.bag.kit===prev+1;
      const saved=interactions.serialize();interactions.restore({});interactions.restore(saved);
      const once=interactions.check()?.label!=='Collect supply box';const door=world.interactables.find(a=>a.type==='door');select(door).run();const open=door.isOpen;
      briar.save(true);door.setOpen(false);briar.load(true);const savedDoor=door.isOpen;
      const lift=world.interactables.find(a=>a.type==='elevator');go(lift);const bottom=world.height(lift.x,lift.z);select(lift).run();
      for(let i=0;i<230;i++){sim.update(.05,{keys:new Set(),settings:briar.settings()});world.update(.05,{x:lift.x,z:lift.z,hour:8,quality:'Medium',night:false})}
      const top=world.height(lift.x,lift.z),p=sim.player;interactions.check().run();for(let i=0;i<230;i++){sim.update(.05,{keys:new Set(),settings:briar.settings()});world.update(.05,{x:lift.x,z:lift.z,hour:8,quality:'Medium',night:false})}
      const liftDown=Math.abs(world.height(lift.x,lift.z)-bottom)<.12;const floors=top>bottom+2&&liftDown;
      const settings=briar.settings();briar.actions.setSetting('weather','Snow');go(world.locations.summit);
      for(let i=0;i<135;i++)climate.update(.1,sim.player,briar.camera,briar.settings(),world);
      const snow=climate.state.snow>.8;
      const cold=climate.state;survival.reset();Object.assign(sim.player,{speed:6.4});for(let i=0;i<50;i++)survival.update(.5,cold,null);
      const fatigue=survival.state.stamina<25;const before=survival.state.stamina;story.state.bag.water=1;interactions.use('water');const better=survival.state.stamina>before;
      // Cross the full quay under real walking input, then continue into its end rail.
      go({x:86.8,z:-116});sim.player.yaw=-Math.PI/2;
      let quayDry=true;
      for(let i=0;i<900;i++){
        sim.update(1/60,{keys:new Set(['KeyW']),settings});
        if(sim.player.swimming || world.waterAt(sim.player.x,sim.player.z))quayDry=false
      }
      const quayWalk=quayDry && sim.player.x>126 && sim.player.x<126.85 && Math.abs(sim.player.y+.28)<.015;
      // Each tower footing spans all four terrain corners under its actual footprint.
      const towerFootings=[-1,1].every(dx=>[-1,1].every(dz=>{
        const x=83+dx*2.6,z=-118+dz*2.6;
        const pad=[...world.candidates(x,z,.05)].find(c=>Math.abs(c.x-x)<.001 && Math.abs(c.z-z)<.001 && c.w===1.12)
        return pad && [-.56,.56].every(a=>[-.56,.56].every(b=>{
          const ground=world.height(x+a,z+b);return pad.y <= ground-.19 && pad.top >= ground+.17
        }))
      }));
      const lake={x:139,z:-119};go(lake);sim.update(.05,{keys:new Set(),settings});const swim=sim.player.swimming&&sim.player.y>=world.height(lake.x,lake.z);
      const car=sim.cars[0];go({x:car.x+1.8,z:car.z});const enter=sim.enterExit().entered;const f=sim.firstPerson;sim.toggleCamera();const cabin=sim.firstPerson!==f;sim.toggleLights();const lights=car.headlights;for(let i=0;i<80;i++)sim.update(1/60,{settings});const exit=sim.enterExit().ok;
      climate.state.hour=0;climate.update(.03,sim.player,briar.camera,settings,world);const dark=climate.state.night;
      climate.state.hour=12;climate.update(.03,sim.player,briar.camera,settings,world);const bright=!climate.state.night;
      const graph=briar.navigation.route(world.locations.home,world.locations.summit);
      return {seat,stand,pickup,once,open,savedDoor,floors,snow,fatigue,better,swim,quayWalk,towerFootings,enter,exit,cabin,lights,dark,bright,gps:graph.length>=9,surfaceCompression:briar.scene.userData.surfaceTextures.size};
    }""")
    print('FIELD',d,flush=True)
    print('ERRORS',errs,flush=True)
    browser.close()
    if not all(v for k,v in d.items() if k!='surfaceCompression') or errs:sys.exit(1)

