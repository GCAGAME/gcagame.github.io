"""Render the live game's sound graph into stereo buffers in Chromium."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

script = (Path(__file__).resolve().parents[1] / 'src/audio.js').read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    result = page.evaluate("""async source => {
      const {createAudio}=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      async function channels(x, cue) {
        let buffer,seed=17;const saved=Math.random
        Math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296}
        window.AudioContext=class extends OfflineAudioContext{
          constructor(){super(2,24000,24000);buffer=this}
          resume(){return Promise.resolve()}
        }
        const system=createAudio();system.activate()
        const sim={player:{x:0,y:0,z:0,yaw:0},traffic:x?[{x,z:0,speed:9}]:[]}
        system.update(.016,sim,{indoors:()=>false,height:()=>0},{haze:0,wet:0,night:true},0)
        if(cue)system.play(cue)
        const b=await buffer.startRendering();Math.random=saved
        return [0,1].map(c=>Math.sqrt(b.getChannelData(c).reduce((a,v)=>a+v*v,0)/b.length))
      }
      return {left:await channels(-5),right:await channels(5),idle:await channels(0),
        door:await channels(0,'door'),reward:await channels(0,'reward')}
    }""", script)
    assert result['left'][0] > result['left'][1] and result['right'][1] > result['right'][0], result
    assert all(result[c][0] > result['idle'][0] for c in ['door','reward']), result
    print('Spatial traffic changes sides. Door and mission reward signals are audible in the rendered buffer.',json.dumps(result))
    browser.close()
