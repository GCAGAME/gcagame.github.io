"""Run against the local game or a standalone file URL. Requires Playwright and Chrome."""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000/'
captures=Path(sys.argv[2]) if len(sys.argv)>2 else None
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='chrome',headless=True,args=['--disable-background-timer-throttling'])
    page=browser.new_page(viewport={'width':1280,'height':720})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text[:500]) if m.type=='error' and '404' not in m.text else None)
    page.goto(url+'?inspect');page.wait_for_function('window.briar',timeout=120000)
    page.get_by_role('button',name='New Game').click()
    page.wait_for_timeout(1200)
    if captures:page.screenshot(path=captures/'phase1-start.jpg')
    print('impacts',page.evaluate("""()=>{
      const {sim,world}=briar,save=sim.serialize(),out=[];
      const rocks=[...world.candidates(0,-100,580)].filter(o=>o.kind==='rock'&&o.w>2&&Math.abs(o.x)<410&&o.z>-410);
      const spot=rocks.find(o=>{for(let z=o.z;z<o.z+17;z+=1){
        if([...world.candidates(o.x,z,4)].some(q=>q!==o&&Math.abs(q.x-o.x)<q.w/2+2.4&&Math.abs(q.z-z)<q.d/2+2.7)||world.waterAt(o.x,z))return false
      }return true});if(!spot)throw Error('No clear approach');
      const dt=[1/120,1/30,.075,1/60];
      for(const car of sim.cars)for(const speed of [4,15,car.spec.max,car.spec.max*1.2]){
        const state=structuredClone(save),c=state.cars.find(v=>v.id===car.id);
        Object.assign(c,{x:spot.x,z:spot.z+12,yaw:0,upgraded:speed>car.spec.max});state.current=c.id;sim.restore(state);
        sim.vehicle.speed=speed;const start=sim.collisions;
        for(let i=0;i<360&&sim.collisions===start;i++)sim.update(dt[i%4],{keys:new Set(['KeyW'])});
        if(sim.collisions===start||sim.vehicle.z<=spot.z||sim.vehicle.z>spot.z+spot.w/2+car.spec.length/2+.7)throw Error('Failed impact '+car.id+' '+speed);
        const impact=sim.vehicle.z;for(let i=0;i<60;i++)sim.update(1/60,{keys:new Set(['KeyS'])});
        if(sim.vehicle.z<impact+.7)throw Error('Failed reverse '+car.id);out.push([c.id,Math.round(speed*3.6)]);
      }
      const embedded=structuredClone(save);embedded.current='sedan';Object.assign(embedded.cars[0],{x:spot.x,z:spot.z,yaw:0});sim.restore(embedded);
      if(Math.hypot(sim.vehicle.x-spot.x,sim.vehicle.z-spot.z)<spot.w*.55)throw Error('Recovery failed');
      const before={x:sim.vehicle.x,z:sim.vehicle.z};if(!sim.unstuck()||Math.hypot(sim.vehicle.x-before.x,sim.vehicle.z-before.z)<2.9)throw Error('Unstuck failed');
      function driveAt(hz){
        const s=structuredClone(save);s.current='sedan';Object.assign(s.cars[0],{x:-2,z:-214,yaw:0});sim.restore(s);
        for(let i=0;i<hz;i++)sim.update(1/hz,{keys:new Set(['KeyW'])});return [sim.vehicle.x,sim.vehicle.z,sim.vehicle.speed];
      }
      const a=driveAt(30),b=driveAt(120);if(a.some((v,i)=>Math.abs(v-b[i])>.00001))throw Error('Frame-rate dependent physics');
      sim.restore(save);return out;
    }"""),flush=True)
    for name in ['Low','Medium','High','Ultra']:
        stats=page.evaluate("""q=>{const b=briar;b.actions.setSetting('quality',q);const trees=b.scene.children.filter(m=>m.visible&&m.name.startsWith('3D ')),sun=b.scene.children.find(m=>m.isDirectionalLight);
        return {lod:trees.map(m=>[m.name,m.count,m.geometry.attributes.position.count]),shadow:sun.castShadow?sun.shadow.mapSize.x:0,far:b.camera.far,textures:b.graphics.textureQuality,ao:b.settings().ao,reflections:b.settings().reflections}}""",name)
        print(name,stats,flush=True)
        assert stats['lod'] and stats['far']=={'Low':200,'Medium':395,'High':560,'Ultra':800}[name]
        max_shadow=page.evaluate('briar.renderer.capabilities.maxTextureSize')
        assert stats['shadow']==min(max_shadow,{'Low':0,'Medium':1024,'High':2048,'Ultra':4096}[name])
        assert stats['textures']==name and stats['ao']==(name!='Low') and stats['reflections']==(name!='Low')
        if name in ('High','Ultra'):
            page.wait_for_function("""size=>briar.scene.children.some(mesh=>
              mesh.material?.name==='grass' && mesh.material.normalMap?.image?.width===1024
              && mesh.material.map?.image?.width===size)""",arg=1024 if name=='High' else 2048,
                                   polling=250,timeout=120000)
        page.wait_for_timeout(350)
        assert page.locator('#interface').get_attribute('data-view')=='hud'
    page.evaluate("briar.actions.setSetting('quality','Medium')")
    if captures:
        page.wait_for_timeout(3500);page.screenshot(path=captures/'phase1-final.jpg')
    assert not errors,errors
    browser.close()

