"""Render two synthetic wall photos of the starter house's Living Room (5.5 x 4.5 m) with known furniture,
plus the AI reply an ideal model would give and the true positions. Used by test/browser/furnish_test.py.
Run: python3 test/fixtures/make_synthetic.py"""
import json, math, os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), 'synthetic')
W, H, CEIL = 1568, 1176, 2.4

def cam(C, target, f):
    def norm(v): l = math.sqrt(sum(x * x for x in v)); return [x / l for x in v]
    fwd = norm([target[i] - C[i] for i in range(3)])
    right = norm([fwd[1] * 0 - fwd[2] * 1, 0, fwd[0] * 1 - fwd[1] * 0])
    down = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]]
    def P(X, Y, Z):
        d = [X - C[0], Y - C[1], Z - C[2]]
        xc = sum(right[i] * d[i] for i in range(3)); yc = sum(down[i] * d[i] for i in range(3)); zc = sum(fwd[i] * d[i] for i in range(3))
        return (W / 2 + f * xc / zc, H / 2 + f * yc / zc)
    return P

def box_pts(u0, u1, y0, y1, z0, z1):
    return [(u, y, z) for u in (u0, u1) for y in (y0, y1) for z in (z0, z1)]

def bbox(P, pts):
    q = [P(*p) for p in pts]; xs = [p[0] for p in q]; ys = [p[1] for p in q]
    return [round(max(0, min(xs))), round(max(0, min(ys))), round(min(W, max(xs))), round(min(H, max(ys)))]

def draw_box(d, P, u0, u1, y0, y1, z0, z1, col):
    shade = lambda c, k: tuple(int(v * k) for v in c)
    faces = [([(u0, y0, z1), (u1, y0, z1), (u1, y1, z1), (u0, y1, z1)], 1.0), ([(u0, y1, z0), (u1, y1, z0), (u1, y1, z1), (u0, y1, z1)], 1.15),
             ([(u0, y0, z0), (u0, y0, z1), (u0, y1, z1), (u0, y1, z0)], 0.8), ([(u1, y0, z0), (u1, y0, z1), (u1, y1, z1), (u1, y1, z0)], 0.8)]
    for f, k in faces:
        d.polygon([P(*p) for p in f], fill=tuple(min(255, int(v * k)) for v in col))

def render(name, L, P, items, wall_col, floor_col):
    im = Image.new('RGB', (W, H), (70, 70, 74)); d = ImageDraw.Draw(im)
    d.polygon([P(0, 0, 0), P(L, 0, 0), P(L, 0, 3.9), P(0, 0, 3.9)], fill=floor_col)
    d.polygon([P(0, 0, 0), P(L, 0, 0), P(L, CEIL, 0), P(0, CEIL, 0)], fill=wall_col)
    reply = []
    for it in sorted(items, key=lambda i: i['z0']):
        draw_box(d, P, it['u0'], it['u1'], it['y0'], it['y1'], it['z0'], it['z1'], it['rgb'])
        b = bbox(P, box_pts(it['u0'], it['u1'], it['y0'], it['y1'], it['z0'], it['z1']))
        reply.append({'object_id': it.get('id'), 'type': it['type'], 'label': it['label'], 'mount': it['mount'], 'bbox': b,
                      'width_m': round(it['u1'] - it['u0'], 2), 'depth_m': round(it['z1'] - it['z0'], 2), 'height_m': round(it['y1'] - it['y0'], 2),
                      'colour': '#%02x%02x%02x' % it['rgb'], 'partial': b[0] <= 0 or b[1] <= 0 or b[2] >= W or b[3] >= H, 'confidence': 0.9})
    im.save(os.path.join(OUT, name + '.png'))
    corners = {'fl': P(0, 0, 0), 'fr': P(L, 0, 0), 'cl': P(0, CEIL, 0), 'cr': P(L, CEIL, 0)}
    return reply, {k: [round(v[0], 1), round(v[1], 1)] for k, v in corners.items()}

os.makedirs(OUT, exist_ok=True)
# north wall (edge 0, 5.5 m): left end = west corner
Pn = cam([2.6, 1.55, 4.2], [2.9, 1.0, 0], 1150)
north = [
    dict(type='window', label='window', mount='wall', u0=0.8, u1=1.8, y0=0.9, y1=2.1, z0=0, z1=0.06, rgb=(80, 110, 135)),
    dict(type='picture', label='small picture', mount='wall', u0=4.3, u1=4.7, y0=1.5, y1=1.85, z0=0, z1=0.03, rgb=(150, 60, 50)),
    dict(type='tv', label='wall TV', mount='wall', u0=2.2, u1=3.43, y0=1.05, y1=1.77, z0=0, z1=0.06, rgb=(20, 20, 22)),
    dict(id='obj-con', type='media_console', label='walnut media console', mount='floor', u0=1.6, u1=4.0, y0=0, y1=0.6, z0=0, z1=0.45, rgb=(95, 62, 40)),
    dict(id='obj-lamp', type='floor_lamp', label='floor lamp', mount='floor', u0=0.15, u1=0.6, y0=0, y1=1.6, z0=0.15, z1=0.6, rgb=(230, 210, 160)),
    dict(type='armchair', label='rust armchair', mount='floor', u0=3.9, u1=4.8, y0=0, y1=0.9, z0=1.4, z1=2.25, rgb=(150, 70, 45)),
]
rn, cn = render('north', 5.5, Pn, north, (232, 226, 210), (170, 120, 70))
# west wall (edge 3, 4.5 m): left end = south corner; the floor lamp stands in the north-west corner (u ~ 4.0-4.45 here)
Pw = cam([2.1, 1.5, 4.6], [2.3, 1.0, 0], 1100)
west = [
    dict(type='chimney_breast', label='blue chimney breast', mount='wall', u0=1.6, u1=3.1, y0=0, y1=2.4, z0=0, z1=0.4, rgb=(45, 75, 150)),
    dict(type='fireplace', label='pine fireplace', mount='floor', u0=1.75, u1=2.95, y0=0, y1=1.1, z0=0.4, z1=0.65, rgb=(176, 122, 69)),
    dict(type='mirror', label='arched mirror', mount='wall', u0=1.95, u1=2.75, y0=1.25, y1=2.05, z0=0.4, z1=0.44, rgb=(170, 120, 75)),
    dict(id='obj-lamp', type='floor_lamp', label='floor lamp', mount='floor', u0=3.9, u1=4.35, y0=0, y1=1.6, z0=0.15, z1=0.6, rgb=(230, 210, 160)),
]
rw, cw = render('west', 4.5, Pw, west, (232, 226, 210), (170, 120, 70))
reply = {'floor': {'type': 'wood', 'colour': '#aa7846'}, 'photos': [{'photo': 1, 'wall_colour': '#e8e2d2', 'items': rn}, {'photo': 2, 'wall_colour': '#e8e2d2', 'items': rw}]}
truth = {'room': 'living', 'photos': [{'file': 'north.png', 'edge': 0, 'corners': cn}, {'file': 'west.png', 'edge': 3, 'corners': cw}],
         # plan positions (x east, y south) of item centres
         'expect': {'tv': [2.815, 0.03], 'media_console': [2.8, 0.225], 'fireplace': [0.525, 4.5 - 2.35], 'mirror': [0.42, 4.5 - 2.35], 'armchair': [4.35, 1.825], 'floor_lamp': [0.375, 0.375]}}
json.dump(reply, open(os.path.join(OUT, 'reply.json'), 'w'), indent=1)
json.dump(truth, open(os.path.join(OUT, 'truth.json'), 'w'), indent=1)
print('wrote', OUT, cn, cw)
