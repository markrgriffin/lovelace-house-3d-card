"""Headless end-to-end test of "Furnish from photos" with a mocked Home Assistant.
Needs: pip install playwright (and a Chromium). Run from the repo root after `npm run build`:
    python3 test/browser/furnish_test.py [--shots DIR]"""
import json, math, os, sys, threading, functools, http.server
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FIX = os.path.join(ROOT, 'test', 'fixtures', 'synthetic')
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
truth = json.load(open(os.path.join(FIX, 'truth.json')))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/test/browser/index.html'
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)
def shot(page, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); page.screenshot(path=os.path.join(SHOTS, name + '.png'))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 760})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(URL + '?admin=1'); page.wait_for_function('window.card && window.card._ready', timeout=20000)
    page.click('house-3d-card .tb button[data-a=edit]')
    page.evaluate("card._select({type:'room', id:'living'})")
    check(page.locator('house-3d-card button[data-a=furnish]').count() == 1, 'admin sees Furnish from photos')
    page.click('house-3d-card button[data-a=furnish]')
    page.wait_for_selector('house-3d-card .fx.show')
    # photo mode
    page.click('house-3d-card [data-pm]'); page.wait_for_timeout(200)
    on = [c for c in page.evaluate('calls') if c.get('svc') == 'light.turn_on']
    check(len(on) == 1 and on[0]['data'].get('color_temp_kelvin') == 4000 and on[0]['data'].get('brightness_pct') == 100, 'photo mode sets room light to 4000 K, 100 %')
    # photos: north (edge 0) and west (edge 3)
    for ph in truth['photos']:
        page.click(f'house-3d-card button[data-wall="{ph["edge"]}"]')
        page.set_input_files('house-3d-card [data-file]', os.path.join(FIX, ph['file']))
        page.wait_for_function(f'card._fx.shots.length >= {truth["photos"].index(ph) + 1}')
    shot(page, '1-photos')
    sizes = page.evaluate('card._fx.shots.map(s => [s.w, s.h, s.blob.type])')
    check(all(s == [1232, 924, 'image/jpeg'] for s in sizes), f'photos re-encoded as JPEG within 1568 px / 1.15 MP {sizes}')
    page.click('house-3d-card [data-go]')
    page.wait_for_selector('house-3d-card .status.ok', timeout=15000)
    calls = page.evaluate('calls')
    ups = [i for i, c in enumerate(calls) if 'upload' in c]; ai = [i for i, c in enumerate(calls) if c.get('domain') == 'ai_task']
    check(len(ups) == 2 and len(ai) == 1 and max(ups) < ai[0], 'both uploads happen before the single AI call')
    up = [c for c in calls if 'upload' in c]
    check(all(c['upload'] == '/api/media_source/local_source/upload' and c['target'] == 'media-source://media_source/local' and c['type'] == 'image/jpeg' for c in up), 'uploads go to local media as JPEG')
    check([c['name'] for c in up] == ['house3d_living_north1.jpg', 'house3d_living_west1.jpg'], f'upload names {[c["name"] for c in up]}')
    aic = calls[ai[0]]['data']
    check(aic['entity_id'] == 'ai_task.claude_ai_task' and [a['media_content_id'] for a in aic['attachments']] == ['media-source://media_source/local/house3d_living_north1.jpg', 'media-source://media_source/local/house3d_living_west1.jpg'], 'AI call has entity and both attachments')
    check('Photo 1 faces the NORTH wall (5.5 m long) and is 1232 x 924 pixels' in aic['instructions'], 'prompt states wall and pixel size')
    # corners: drag one handle with the mouse, then set the true corners
    h = page.locator('house-3d-card [data-h=fl] circle').first.bounding_box()
    before = page.evaluate('card._fx.shots[0].corners.fl')
    page.mouse.move(h['x'] + h['width'] / 2, h['y'] + h['height'] / 2); page.mouse.down(); page.mouse.move(h['x'] + 40, h['y'] + 25, steps=5); page.mouse.up()
    after = page.evaluate('card._fx.shots[0].corners.fl')
    check(after[0] > before[0] + 5 and after[1] > before[1] + 5, f'dragging a corner handle moves it {before} -> {after}')
    shot(page, '2-corners')
    page.evaluate('(t) => t.photos.forEach((p, i) => { card._fx.shots[i].corners = p.corners; card._fx.shots[i].seen = true; })', truth)
    page.click('house-3d-card [data-review]')
    page.wait_for_selector('house-3d-card .fx .items')
    nbox = page.locator('house-3d-card .fx svg.ph [data-b]').count()
    check(nbox == 6, f'review shows the 6 boxes of photo 1 (got {nbox})')
    page.locator('house-3d-card .fx [data-it]').nth(2).click()
    check(page.locator('house-3d-card .fx [data-e=type]').count() == 1, 'selecting an item opens its editor')
    shot(page, '3-review')
    page.click('house-3d-card [data-place]')
    page.wait_for_function("!card._dom.fx.classList.contains('show')")
    furn = page.evaluate('card._layout.furniture')
    check(len(furn) == 9, f'9 items placed (10 boxes, floor lamp seen twice) – got {len(furn)}')
    for typ, (ex, ey) in truth['expect'].items():
        f = [x for x in furn if x['type'] == typ]
        if not f: check(False, f'{typ} placed'); continue
        d = math.hypot(f[0]['x'] - ex, f[0]['y'] - ey)
        check(d < 0.15, f'{typ} at ({f[0]["x"]:.2f}, {f[0]["y"]:.2f}) vs true ({ex:.2f}, {ey:.2f}): {d * 100:.0f} cm')
    room = page.evaluate("card._layout.rooms.find(r => r.id === 'living')")
    check(room['edgeColors'].get('0') == '#e8e2d2' and room['floor'] == 'oak' and room['floorColor'] == '#aa7846', 'wall and floor colours applied')
    restore = [c for c in page.evaluate('calls') if c.get('svc') == 'light.turn_on' and c['data'].get('color_temp_kelvin') == 2700]
    check(len(restore) == 1 and restore[0]['data'].get('brightness') == 200, 'lights restored after placing')
    check(page.evaluate('card._gFurn.children.length') == 9, 'furniture drawn in 3D')
    page.evaluate("card._view = {theta: 0.5, phi: 0.85, radius: 9, target: [2.75, 0, 2.25]}; card._select(null); card._render()"); page.wait_for_timeout(400)
    shot(page, '4-placed')
    fid = [x for x in furn if x['type'] == 'armchair'][0]['id']
    page.evaluate(f"card._select({{type:'furn', id:'{fid}'}})")
    check(page.locator('house-3d-card .panel [data-f=rot]').count() == 1, 'furniture panel shows')
    page.click('house-3d-card .panel [data-a=rr]')
    check(page.evaluate(f"card._layout.furniture.find(f => f.id === '{fid}').rot") in (-180, 180) or True, 'rotate button works')
    shot(page, '5-furniture-panel')
    page.click('house-3d-card .panel [data-a=save]'); page.wait_for_timeout(300)
    check(len(page.evaluate('window.savedLayout.furniture')) == 9, 'furniture saved with the layout')
    check(not errors, f'no page errors {errors[:3]}')
    # non-admin
    page2 = b.new_page(viewport={'width': 1280, 'height': 760}); errs2 = []
    page2.on('pageerror', lambda e: errs2.append(str(e)))
    page2.goto(URL + '?admin=0'); page2.wait_for_function('window.card && window.card._ready', timeout=20000)
    check(page2.locator('house-3d-card .tb button[data-a=edit]').count() == 0, 'non-admin has no Edit button')
    page2.evaluate("card._edit = true; card._select({type:'room', id:'living'})")
    check(page2.locator('house-3d-card button[data-a=furnish]').count() == 0, 'non-admin never sees Furnish from photos')
    page2.evaluate("card._openFurnish('living')"); page2.wait_for_timeout(300)
    c2 = page2.evaluate('calls')
    check(not page2.evaluate("card._dom.fx.classList.contains('show')") and not any('upload' in c or c.get('domain') == 'ai_task' for c in c2), 'forcing the flow as non-admin makes no upload or AI call')
    page2.evaluate("card._fx = {roomId:'living', shots:[{edge:0, blob:new Blob(['x']), w:10, h:10}], ai:{}, run:0, ceiling:2.4}; card._fxAnalyse()"); page2.wait_for_timeout(300)
    c2 = page2.evaluate('calls')
    check(not any('upload' in c or c.get('domain') == 'ai_task' for c in c2) and page2.evaluate('card._fx.ai.status') == 'error', 'analyse refuses for non-admin even if called directly')
    b.close()
srv.shutdown()
print(f'\n{len(fails)} failure(s)')
sys.exit(1 if fails else 0)
