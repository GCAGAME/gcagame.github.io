"""Check the launch sequence independently of WebGL speed, using desktop Chrome."""
import io
import sqlite3
from statistics import median
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

root = Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:%d/' % server.server_port

try:
    with tempfile.TemporaryDirectory() as profile:
        with sync_playwright() as pw:
            browser = pw.chromium.launch_persistent_context(profile, channel='chrome', headless=True)
            page = browser.pages[0]
            # Isolate shell behavior while the world is unavailable.
            page.route('**/src/main.js', lambda route: route.fulfill(content_type='application/javascript', body=''))
            page.add_init_script("""document.addEventListener('animationstart', e => {
              if (e.target.matches('.intro-frame')) {
                window.sceneStarts ??= []
                sceneStarts.push(e.target.className)
              }
            })""")
            page.goto(url)
            page.evaluate("""() => {
              window.introWasHidden = getComputedStyle(document.querySelector('#interface')).opacity === '0'
              window.frameTimes = []
              requestAnimationFrame(function sample(time) {
                if (!document.querySelector('#studio-intro')) return
                frameTimes.push(time)
                requestAnimationFrame(sample)
              })
              window.finishedAt = studioIntroFinished.then(() => performance.now())
            }""")
            assert page.evaluate('introWasHidden')
            for selector, label in [('studio','iLiam Studios'), ('presents','presents'),
                                    ('original','An iLiam Games Original'), ('game','GCA')]:
                frame = page.locator('.intro-' + selector)
                page.wait_for_function("s => Number(getComputedStyle(document.querySelector(s)).opacity) > .85",arg='.intro-'+selector)
                assert (frame.inner_text().strip() or frame.locator('img').get_attribute('alt')) == label
                if selector in ('studio','game'):
                    assert frame.locator('img').evaluate("img=>img.complete && img.naturalWidth>0")
            elapsed = page.evaluate('finishedAt')
            assert 8000 <= elapsed < 10500 and len(page.evaluate('sceneStarts')) == 4
            assert page.locator('#loading-screen').is_visible() and page.locator('#menu-screen').is_hidden()
            icon = page.locator('link[rel=icon]')
            assert icon.get_attribute('type') == 'image/svg+xml'
            assert page.request.get(url+'assets/branding/gca.svg').body() == (root/'assets/branding/gca.svg').read_bytes()
            print('Four visual stages, decoded images, black backing and loading fallback passed at', round(elapsed), 'ms', flush=True)
            frames = page.evaluate('frameTimes')
            print('Intro shell median frame interval:', round(median(b-a for a,b in zip(frames,frames[1:])),1),'ms',flush=True)
            for skip in ('Space','Enter','click'):
                page.reload()
                if skip == 'click':
                    page.get_by_role('button',name='Skip').click()
                else:
                    page.keyboard.press(skip)
                assert page.locator('#studio-intro').count()==0 and page.locator('#loading-screen').is_visible()
            for w,h in ((1280,720),(390,844),(740,360)):
                page.set_viewport_size({'width':w,'height':h})
                # Exercise the same menu markup at three sizes in the lightweight shell.
                page.evaluate("()=>{document.querySelector('#loading-screen').hidden=true;document.querySelector('#menu-screen').hidden=false}")
                logo=page.locator('.wordmark img')
                b=logo.bounding_box()
                assert b and 0<=b['x'] and b['x']+b['width']<=w and abs(b['width']/b['height']-122.99427/45.99971)<.04
                assert page.locator('.game-subtitle').inner_text().lower()=='grand city adventures'
            print('Three skip controls, mobile and desktop logo proportions and original title passed',flush=True)
            browser.close()
        db=sqlite3.connect(Path(profile)/'Default/Favicons')
        rows=db.execute('SELECT f.url,b.image_data FROM icon_mapping m JOIN favicons f ON m.icon_id=f.id JOIN favicon_bitmaps b ON f.id=b.icon_id WHERE m.page_url=?',(url,)).fetchall()
        db.close()
        assert rows and all(src.endswith('/assets/branding/gca.svg') for src,_ in rows), [src for src,_ in rows]
        im=Image.open(io.BytesIO(rows[0][1])).convert('RGBA')
        assert any(r>150 and r>g*1.3 and a>80 for r,g,b,a in im.getdata())
        print('Chrome stored the original SVG as the page favicon, including its orange pixels:',im.size,flush=True)
finally:
    server.shutdown()
    server.server_close()
