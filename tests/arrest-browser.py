"""Exercise both arrest timelines and inspect the actual rendered rigs and door."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, os, sys
url = sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000/?inspect'
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', args=['--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width':850,'height':500})
    page.set_default_timeout(65000)
    errors = []
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('response',lambda r:errors.append(f'{r.status} {r.url}') if r.status>=400 else None)
    page.add_init_script("""localStorage.setItem('projectReality.briar.v1.settings',JSON.stringify({
      quality:'Low',resolution:.7,adaptive:false,ao:false,shadows:'Off'}))""")
    page.goto(url)
    page.wait_for_function('window.briar && briar.screen()==="menu"',timeout=120000)
    page.locator('[data-mode=hardcore]').click()
    page.locator('[data-action=newGame]').click()
    page.wait_for_function('briar.screen()==="hud"')
    page.evaluate("""capture => {
      const {sim,graphics,scene,renderer}=briar
      window.framesSeen=[]
      const frame=graphics.render
      graphics.render=(...args)=>{
        const result=frame(...args)
        if(briar.screen()!=='arrestScene')return result
        const player=scene.getObjectByName('Player'), rig=player.getObjectByName('Bip01_L_Hand')
        const door=sim.cars[0].model.detail.getObjectByName('Driver door hinge')
        const cuffs=['L','R'].map(side=>scene.getObjectByName(side+' wrist cuff'))
        const visible=cuffs.filter(c=>c?.visible).length
        const car=sim.cars[0]
        const sill=(car.x-player.position.x)*Math.cos(car.yaw)-(car.z-player.position.z)*Math.sin(car.yaw)-car.spec.width/2
        const now={seated:!!sim.vehicle,door:Math.abs(door.rotation.y),visible,sill,
          grounded:Math.abs(player.position.y-sim.player.y)<.04,
          locked:visible===2&&cuffs.every((c,i)=>c.children[1].rotation.z>-.01&&
            c.position.distanceTo(player.getObjectByName('Bip01_'+['L','R'][i]+'_Hand').getWorldPosition(c.position.clone()))<.055),
          fov:briar.camera.fov}
        framesSeen.push(now)
        if(capture && rig) {
          const key=now.seated?'approach':now.door>.25&&now.sill>.4?'step':now.door>.6&&now.sill>-.12?'exit':now.locked?'locked':null
          if(key && !window.images[key])window.images[key]=renderer.domElement.toDataURL('image/jpeg',.9)
        }
        return result
      }
    }""", bool(os.environ.get('GCA_CAPTURE')))
    textured = page.evaluate("""async () => {
      const {posePerson} = await import('./src/people.js')
      const officers = briar.sim.npcs.filter(p=>p.role==='police')
      for (const {model} of officers) {
        const visible=model.group.visible
        model.group.visible=true
        posePerson(model,0,0)
        await model.loading
        model.group.visible=visible
        for (const lod of [model.near,model.far]) {
          const body=lod.find(m=>m.material.name.endsWith('body'))
          const map=body.material.map, pixels=document.createElement('canvas')
          if(!map?.name.endsWith('patrol uniform') || !map.image?.width || !body.material.normalMap) return false
          pixels.width=map.image.width;pixels.height=map.image.height
          const ctx=pixels.getContext('2d');ctx.drawImage(map.image,0,0)
          const data=ctx.getImageData(0,0,pixels.width,pixels.height).data
          const {uv,skinIndex,skinWeight}=body.geometry.attributes
          for(const side of ['L','R']){
            const samples=new Set()
            for(let i=0;i<uv.count;i++){
              const bone=body.skeleton.bones[skinIndex.getX(i)]
              if(!bone.name.endsWith(side+'_Forearm') || skinWeight.getX(i)<.4) continue
              const x=Math.min(pixels.width-1,Math.floor(uv.getX(i)*pixels.width))
              const y=Math.min(pixels.height-1,Math.floor(uv.getY(i)*pixels.height))
              const j=4*(y*pixels.width+x)
              samples.add(data[j]*65536+data[j+1]*256+data[j+2])
            }
            if(samples.size<4)throw Error(model.style+' '+side+' forearm samples '+samples.size)
          }
        }
      }
      return true
    }""")
    assert textured
    for kind in ['vehicle','foot','skip']:
        page.evaluate("""kind=>{
          const {sim,world}=briar, city=briar.hardcore.city,save=sim.serialize()
          const x=1.8,z=28,car=save.cars[0]
          Object.assign(car,{x,z,yaw:0})
          Object.assign(save.player,{x:kind==='foot'?-6:x,z,y:world.height(x,z),yaw:0})
          save.current=kind==='foot'?null:car.id
          sim.restore(save);city.restore()
          const officer=sim.npcs.find(n=>n.role==='police'&&!n.inactive)
          // For a driver, the arresting officer starts across the hood.
          Object.assign(officer,{x:kind==='foot'?-8:x+2.35,z:z-.5,y:sim.player.y,yaw:0})
          window.framesSeen=[];window.images={}
          city.reportCrime('shot')
          for(let i=0;i<1200&&briar.screen()==='hud';i++)city.update(1/60)
          if(briar.screen()!=='arrestScene')throw Error('Officer could not reach arrest position '+JSON.stringify([officer.x,officer.z,officer.goal,city.wanted]))
        }""",kind)
        if kind=='skip':
            page.wait_for_function('framesSeen.some(f=>f.door>.25)')
            page.locator('[data-action=finishArrestScene]').click(timeout=3500)
        page.wait_for_function("briar.screen()==='recovery'")
        frames=page.evaluate('framesSeen')
        assert frames and not page.evaluate("!!briar.scene.getObjectByName('County arrest lighting and cuffs')")
        if kind!='skip':
            assert any(f['locked'] for f in frames)
            assert all(f['grounded'] and not f['seated'] and f['door']<.01 for f in frames if f['visible'])
            assert len(set(f['fov'] for f in frames))>=3
        if kind=='vehicle':
            seated=next(i for i,f in enumerate(frames) if f['seated'])
            door=next(i for i,f in enumerate(frames) if f['door']>.5)
            cuff=next(i for i,f in enumerate(frames) if f['visible'])
            assert any(f['seated'] and f['door']>1 for f in frames), 'Door must fully open before the driver leaves'
            assert seated<door<cuff
            assert any(f['door']>.25 and f['sill']>.4 for f in frames[door:cuff])
            assert all(f['sill']>.6 for f in frames if f['visible'])
        if kind=='foot':
            assert not any(f['seated'] or f['door']>.01 for f in frames)
        assert page.evaluate("Math.abs(briar.sim.cars[0].model.detail.getObjectByName('Driver door hinge').rotation.y)<.01")
        if os.environ.get('GCA_CAPTURE'):
            for tag,data in page.evaluate('window.images').items():
                (Path(os.environ['GCA_CAPTURE'])/(kind+'-'+tag+'.jpg')).write_bytes(base64.b64decode(data.split(',')[1]))
        page.locator('[data-action=recover]').click()
        page.wait_for_function("briar.screen()==='hud'")
        print('Passed',kind,'arrest,',len(frames),'rendered frames',flush=True)
    assert not errors,errors
    browser.close()
