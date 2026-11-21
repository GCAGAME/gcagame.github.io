import sys
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000/?inspect'
if '?' not in URL: URL+='?inspect'
issues=[]
def verify(condition,label):
    print(('PASS ' if condition else 'FAIL ')+label,flush=True)
    if not condition: issues.append(label)
with sync_playwright() as play:
    browser=play.chromium.launch(channel="chrome",headless=True,args=['--no-first-run','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling'])
    page=browser.new_page(viewport=dict(width=1040,height=670),device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: (print('ERROR',e,flush=True),errors.append(str(e))))
    page.on('console',lambda msg: (print('CONSOLE',msg.text[:1100],flush=True),errors.append(msg.text)) if msg.type=='error' and 'favicon' not in msg.text and '404' not in msg.text else None)
    page.on('requestfailed',lambda req: print('REQFAIL',req.url[:120],flush=True))
    page.goto(URL,timeout=120000,wait_until='domcontentloaded')
    page.wait_for_function("window.briar || document.getElementById('load-label').textContent.includes('could not')",timeout=180000)
    verify(page.evaluate('!!window.briar'),'Game initialization')
    if not page.evaluate('!!window.briar'): raise RuntimeError(page.locator('#load-label').inner_text())
    B=lambda s:page.evaluate('() => {'+s+'}')
    print('WORLD',B("return {roads:briar.world.roads.length,buildings:briar.world.buildings.length,interactables:briar.world.interactables.map(a=>[a.type,typeof a.label==='function'?a.label():a.label]),cars:briar.sim.cars.map(c=>c.name),draws:briar.renderer.info.render.calls}"),flush=True)
    verify(page.locator('[data-action="continue"]').is_disabled(),'Continue gated on valid save')
    page.get_by_role('button',name='New Game').click(timeout=20000)
    page.wait_for_function('briar.screen()==="hud"',timeout=15000)
    verify(B("return briar.sim.player.x===-12 && !!briar.story.target()"),'New Game at house, marked car objective')
    page.keyboard.press('KeyM');page.wait_for_function('briar.screen()==="map"')
    verify(page.locator('#full-map').is_visible(),'Map opens via M')
    page.locator('#full-map').click(position={'x':150,'y':100})
    page.keyboard.press('KeyM');page.wait_for_function('briar.screen()==="hud"')
    page.keyboard.press('KeyI');verify(page.locator('#sheet-title').text_content()=='Inventory' and B("return briar.screen()")== 'inventory','Inventory via I')
    page.keyboard.press('KeyI');page.keyboard.press('Tab');verify(page.locator('#sheet-title').text_content()=='Objectives' and B("return briar.screen()")== 'objectives','Objectives via Tab')
    page.keyboard.press('Tab')
    # Keep the real UI and controls; deterministic controller timesteps make physics checks independent of GPU speed.
    result=B("""
const {sim,story,world,scene,camera}=briar;
let run=(n,keys=[],x=0,y=0)=>{for(let i=0;i<n;i++){sim.update(1/60,{keys:new Set(keys),lookX:i===0?x:0,lookY:i===0?y:0,settings:briar.settings(),night:false,wet:0});story.update(1/60,Math.abs(i===0?x:0))}};
let start={...sim.player};run(1,[],20,-2);let yaw=sim.player.yaw;run(1,[], -20,2);run(36,['KeyW']);let walked=Math.hypot(sim.player.x-start.x,sim.player.z-start.z);
sim.jump();run(12);let jump=sim.player.y-world.height(sim.player.x,sim.player.z);run(120);let landed=sim.player.grounded;
let got=sim.enterExit();run(4);let initial=sim.cars[0].yaw;run(30,['KeyW','KeyA']);let delta=Math.abs(sim.cars[0].yaw-initial),speed=sim.cars[0].speed;run(65,['Space']);let parked=Math.abs(sim.cars[0].speed);
return {yaw:yaw!==start.yaw,walked,jump,landed,entry:got.ok,speed,delta,parked,step:story.state.step};
""")
    print('CORE',result,flush=True)
    verify(result['yaw'] and result['walked']>.4,'Mouse delta look and grounded walking')
    verify(result['jump']>.3 and result['landed'],'Jump, gravity and landing')
    verify(result['entry'] and result['speed']>.5 and result['delta']>.003 and result['parked']<.8,'Vehicle entry, acceleration, steering, handbrake')
    verify(result['step']>=3,'First mission tracks walk and entry')
    if not result['entry']:
        raise RuntimeError('Starter car inaccessible')
    # Exercise objectives at real map coordinates. Road traversal is tested independently.
    result=B("""
const {sim,story,world,interactions,climate}=briar,L=world.locations;
const tick=(n=1)=>{for(let i=0;i<n;i++)story.update(1/60,0)};
function move(where,vehicle){
 const d=sim.serialize(),loc=typeof where==='string'?L[where]:where;d.player.x=loc.x;d.player.z=loc.z;d.player.y=world.height(loc.x,loc.z);d.current=vehicle??null;
 if(vehicle){const c=d.cars.find(c=>c.id===vehicle);c.x=loc.x;c.z=loc.z}
 sim.restore(d);tick(2);
}
move('downtown','sedan');tick(45);let welcome=story.state.chapter===1&&story.state.money===230;
move('depot');briar.actions.act();let dialog=briar.screen()==='dialog';interactions.choice('deliveryDetails');interactions.choice('acceptDelivery');briar.actions.act();let parcel=story.state.bag.parcel===1;
move('delivery','sedan');sim.enterExit();briar.actions.act();let delivered=story.state.chapter===2&&!story.state.bag.parcel;
move({x:8,z:-239},'offroad');move({x:20,z:-254},'offroad');move({x:92,z:-325},'offroad');move('summit','offroad');let mountain=story.state.chapter===3;
move('landmark1');briar.actions.act();move('landmark2');briar.actions.act();move('depot');briar.actions.act();let discovery=story.state.chapter===4;
move('downtown','sedan');briar.actions.act();const night=climate.state.hour>20&&story.state.remaining>0;let retry=true;
for(let i=0;i<12;i++){
  story.update(181,0);
  retry=retry && story.state.step===0;
  briar.actions.act();
  retry=retry && story.state.step===1;
}
move({x:2,z:-130},'sedan');move({x:-2,z:58},'sedan');move('downtown','sedan');tick(2);
return {welcome,dialog,parcel,delivered,mountain,discovery,night,retry,finished:story.state.chapter===5,money:story.state.money,steps:story.state.completed};
""")
    print('MISSIONS',result,flush=True)
    for k in ['welcome','dialog','parcel','delivered','mountain','discovery','night','retry','finished']:verify(result[k],k)
    result=B("""
const {sim,story,interactions,world,climate,camera}=briar;
const s=story.state,old=s.money;interactions.buy('water');interactions.buy('shell');interactions.buy('tune');interactions.drop('water');const dropped=interactions.serialize().dropped.length;interactions.use('shell');
briar.actions.setSetting('quality','Low');briar.actions.setSetting('weather','Rain');let low=!briar.renderer.shadowMap.enabled;
for(let i=0;i<90;i++)climate.update(.1,sim.player,camera,briar.settings(),world);
let wet=climate.state.wet;const before=climate.state.hour;for(let i=0;i<60;i++)climate.update(.1,sim.player,camera,briar.settings(),world);
const time=climate.state.hour!==before;briar.save(true);const saved=JSON.parse(localStorage.getItem('projectReality.briar.v1.manual'));
s.money=1;sim.player.x+=48;briar.load(true);
return {low,wet,time,dropped,cash:saved.story.money<old&&story.state.money===saved.story.money,pose:Math.abs(sim.player.x-saved.sim.player.x)<.15,mission:story.state.completed.length===5,owned:story.state.owned.includes('shell'),worn:interactions.serialize().worn,upgrades:sim.cars.every(c=>c.upgraded)};
""")
    print('SYSTEMS',result,flush=True)
    for k in ['low','time','dropped','cash','pose','mission','owned','worn','upgrades']:verify(result[k],k)
    verify(result['wet']>.45,'Smooth rain transition')
    page.keyboard.press('Escape');page.wait_for_timeout(250)
    if B('return briar.screen()')!='pause':B("briar.actions.openPanel('pause')")
    verify(page.get_by_role('button',name='Resume').is_visible(),'Pause menu')
    page.get_by_role('button',name='Return to Main Menu').click()
    verify(page.locator('[data-action="continue"]').is_enabled(),'Saved journey enables Continue')
    page.get_by_role('button',name='Continue').click()
    verify(B('return briar.story.state.chapter===5'),'Continue restores completed campaign')
    verify(not errors,'No JavaScript or shader errors')
    print('FAILURES',issues,flush=True)
    browser.close()
if issues:sys.exit(1)

