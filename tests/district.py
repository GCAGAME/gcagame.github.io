"""Smoke-test the streamed district, actual portals and tuned-car collisions in Chrome."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv)>1 else (Path(__file__).resolve().parents[2]/'Play GCA.html').as_uri()
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1100,'height':680})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text[:700]) if m.type=='error' and 'favicon' not in m.text else None)
    page.goto(url+'?inspect',wait_until='domcontentloaded',timeout=150000)
    page.wait_for_function('window.briar',timeout=150000)
    page.get_by_role('button',name='New Game').click()
    page.evaluate("""()=>{briar.actions.setSetting('quality','High');briar.actions.setSetting('timeScale',0)}""")
    for name,x,z,direction in [('showroom',-85,-69,1),('cafe',-80.5,-92,-1),('market',-20.9,19.5,-1)]:
        page.evaluate("""([name,x,z,d])=>{
          const {sim,world}=briar,s=sim.serialize();s.current=null;s.first=true
          Object.assign(s.player,{x,z:z-d*1.35,y:0,yaw:d===1?Math.PI:0,pitch:0});sim.restore(s)
          const door=world.interactables.find(a=>a.label.toLowerCase().includes(name+' door'))
          if(!door || !world.blocked(x,z,.3,.2))throw Error('Closed door '+name)
        }""",[name,x,z,direction])
        page.wait_for_function("briar.screen()==='hud'")
        page.wait_for_function("(name)=>briar.interactions.check()?.label?.toLowerCase().includes(name+' door')",arg=name,timeout=18000)
        page.keyboard.press('KeyE')
        page.wait_for_function("(name)=>briar.world.interactables.some(a=>a.label.toLowerCase().includes(name+' door')&&a.isOpen)",arg=name,timeout=18000)
        page.evaluate("""([x,z,d])=>{const {world,sim}=briar
          for(let i=0;i<75;i++)world.update(1/60,{...sim.player,hour:14})
          if(world.blocked(x,z,.3,.2))throw Error('Open door still solid')
          for(let i=0;i<72;i++)sim.update(1/60,{keys:new Set(['KeyW'])})
          if(!world.indoors(sim.player.x,sim.player.z)||(sim.player.z-z)*d<.45)throw Error('Could not walk through '+z+' '+sim.player.z)
        }""",[x,z,direction])
        print('Walked through',name,flush=True)
    impacts=page.evaluate("""()=>{const {world,sim}=briar,save=sim.serialize()
      const target=[...world.candidates(-148,66,170)].filter(o=>o.poly?.length===10&&o.top-o.y>3&&o.w<1.7)
        .find(o=>{for(let z=o.z+2;z<o.z+17;z+=1)
          if([...world.candidates(o.x,z,3)].some(q=>q!==o&&Math.abs(q.x-o.x)<q.w/2+2&&Math.abs(q.z-z)<q.d/2+2.4))return false
          return !world.waterAt(o.x,o.z)})
      if(!target)throw Error('No clear trunk run')
      const result=[]
      for(const [label,x,z,yaw,side] of [['tree trunk',target.x,target.z,0,1],['market rear wall',-23,9.7,Math.PI,-1]]){
        const s=structuredClone(save),car=s.cars.find(c=>c.id==='sports')
        s.current=car.id;Object.assign(car,{x,z:z+side*9,yaw,upgraded:true});sim.restore(s)
        const v=sim.vehicle;v.speed=v.spec.max*1.2;const speed=v.speed
        const count=sim.collisions
        for(let i=0;i<18&&sim.collisions===count;i++)sim.update(1/30,{keys:new Set(['KeyW'])})
        if(sim.collisions===count||side*(v.z-z)<=0)throw Error(label+' tunneling')
        const impact=v.z
        for(let i=0;i<80;i++)sim.update(1/60,{keys:new Set(['KeyS'])})
        if((v.z-impact)*side<.6)throw Error(label+' recovery')
        result.push([label,Math.round(speed*3.6)])
      }return result}""")
    print('Stopped and reversed at maximum tuned speed',impacts,flush=True)
    page.evaluate("""()=>{const {sim}=briar,s=sim.serialize(),car=s.cars.find(c=>c.id==='sedan')
      s.current='sedan';Object.assign(car,{x:-83,z:-126,yaw:Math.PI});sim.restore(s)
      for(let i=0;i<180 && sim.vehicle.z<-119.5;i++){
        const keys=sim.vehicle.speed<4?['KeyW']:[]
        sim.update(1/60,{keys:new Set(keys)})
      }
      if(sim.vehicle.z<-120.2)throw Error('Public parking deck entrance')
      for(let i=0;i<140;i++)sim.update(1/60,{keys:new Set(['KeyS'])})
      if(sim.vehicle.z>-123)throw Error('Could not reverse out of parking deck')
    }""")
    print('Drove under the public parking deck and reversed out',flush=True)
    page.evaluate("""()=>{const b=briar;const s=b.sim.serialize();s.current=null;Object.assign(s.player,{x:-84,z:-72,y:0,yaw:3});b.sim.restore(s);b.actions.setSetting('weather','Clear')}""")
    page.wait_for_function("briar.scene.children.some(m=>m.name==='apartment-block LOD 1'&&m.visible&&m.count>0)",timeout=25000)
    for hour in [15.5,18,23]:
        page.evaluate("hour=>{briar.climate.state.hour=hour}",hour)
        page.wait_for_timeout(550)
    assert not errors,errors
    browser.close()

