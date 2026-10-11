import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wallFrame, wallToPlan, wallRotation, homography, applyH, calibrate, parseAiJson, normaliseReply,
  placePhotoItems, mergeShots, findSupport, normType, normColour, buildPrompt, keepInside, restoreLightCall,
} from '../src/furnish-geom.js';

const ROOM = [[0, 0], [4.9, 0], [4.9, 4.1], [0, 4.1]]; // x east, y south
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ± ${tol}, got ${a}`);

// synthetic pinhole camera in wall-world coords (X along wall, Y up, Z into room); image y down
function makeCam({ C, target, f, W, H }) {
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const fwd = norm([target[0] - C[0], target[1] - C[1], target[2] - C[2]]);
  const right = norm([fwd[1] * 0 - fwd[2] * 1, fwd[2] * 0 - fwd[0] * 0, fwd[0] * 1 - fwd[1] * 0]); // fwd x up
  const down = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
  return (X, Y, Z) => {
    const d = [X - C[0], Y - C[1], Z - C[2]];
    const xc = right[0] * d[0] + right[1] * d[1] + right[2] * d[2], yc = down[0] * d[0] + down[1] * d[1] + down[2] * d[2], zc = fwd[0] * d[0] + fwd[1] * d[1] + fwd[2] * d[2];
    return [W / 2 + (f * xc) / zc, H / 2 + (f * yc) / zc];
  };
}

test('wall frames: left end, inward normal, compass and rotation', () => {
  const n = wallFrame(ROOM, 0); // y = 0 edge = north wall
  assert.equal(n.compass, 'north'); assert.deepEqual(n.origin, [0, 0]); near(n.right[0], 1, 1e-9); near(n.normal[1], 1, 1e-9); near(n.len, 4.9, 1e-9);
  const e = wallFrame(ROOM, 1); assert.equal(e.compass, 'east'); assert.deepEqual(e.origin, [4.9, 0]); // facing east, left is north
  const s = wallFrame(ROOM, 2); assert.equal(s.compass, 'south'); assert.deepEqual(s.origin, [4.9, 4.1]);
  const w = wallFrame(ROOM, 3); assert.equal(w.compass, 'west'); assert.deepEqual(w.origin, [0, 4.1]); // facing west, left is south
  const p = wallToPlan(w, 1.4, 0.2); near(p[0], 0.2, 1e-9); near(p[1], 4.1 - 1.4, 1e-9);
  // rotation puts local +Z (front) along the inward normal
  [n, e, s, w].forEach((fr) => { const t = (wallRotation(fr) * Math.PI) / 180; near(Math.sin(t), fr.normal[0], 1e-9); near(Math.cos(t), fr.normal[1], 1e-9); });
});

test('homography maps the four points exactly', () => {
  const src = [[10, 20], [900, 40], [880, 700], [30, 650]], dst = [[0, 0], [4.9, 0], [4.9, 2.4], [0, 2.4]];
  const H = homography(src, dst);
  src.forEach((p, i) => { const q = applyH(H, p[0], p[1]); near(q[0], dst[i][0], 1e-9); near(q[1], dst[i][1], 1e-9); });
});

test('calibrate recovers focal length, camera position and floor points from an oblique view', () => {
  const W = 1568, H = 1176, L = 4.9, top = 2.4, f = 1150;
  const P = makeCam({ C: [1.9, 1.55, 3.7], target: [2.8, 1.0, 0], f, W, H });
  const corners = { fl: P(0, 0, 0), fr: P(L, 0, 0), cl: P(0, top, 0), cr: P(L, top, 0) };
  const cam = calibrate(corners, W, H, L, top);
  assert.equal(cam.fSource, 'measured'); near(cam.f, f, 5, 'focal');
  near(cam.C[0], 1.9, 0.01, 'Cx'); near(cam.C[1], 1.55, 0.01, 'Cy'); near(cam.C[2], 3.7, 0.01, 'Cz');
  [[1.2, 0.6], [3.9, 0.3], [2.5, 2.2]].forEach(([u, d]) => { const px = P(u, 0, d); const q = cam.toFloor(px[0], px[1]); near(q[0], u, 0.005); near(q[1], d, 0.005); });
  const px = P(3.0, 0.6, 0.4), q = cam.toFloor(px[0], px[1], 0.6); near(q[0], 3.0, 0.005); near(q[1], 0.4, 0.005); // elevated plane
  const wp = P(1.5, 1.05, 0), wq = cam.toWall(wp[0], wp[1]); near(wq[0], 1.5, 1e-6); near(wq[1], 1.05, 1e-6);
  const back = cam.project(2, 1, 1), fwd = P(2, 1, 1); near(back[0], fwd[0], 0.5); near(back[1], fwd[1], 0.5);
});

test('calibrate works with corners outside the frame and falls back on a straight-on view', () => {
  const W = 1568, H = 724, L = 4.9, top = 2.4;
  const P = makeCam({ C: [2.6, 1.4, 2.5], target: [2.2, 1.1, 0], f: 900, W, H });
  const corners = { fl: P(0, 0, 0), fr: P(L, 0, 0), cl: P(0, top, 0), cr: P(L, top, 0) };
  assert.ok(corners.fl[0] < 0 || corners.cl[1] < 0 || corners.fr[0] > W, 'some corner should be off-image');
  const cam = calibrate(corners, W, H, L, top);
  const px = P(1.0, 0, 0.5), q = cam.toFloor(px[0], px[1]); near(q[0], 1.0, 0.03); near(q[1], 0.5, 0.03);
  // exactly fronto-parallel: focal length cannot be measured, wall mapping still exact
  const F = makeCam({ C: [2.45, 1.2, 4.0], target: [2.45, 1.2, 0], f: 1000, W, H });
  const c2 = { fl: F(0, 0, 0), fr: F(L, 0, 0), cl: F(0, top, 0), cr: F(L, top, 0) }, cam2 = calibrate(c2, W, H, L, top);
  assert.equal(cam2.fSource, 'assumed'); const w = F(1.5, 1.0, 0), wq = cam2.toWall(w[0], w[1]); near(wq[0], 1.5, 1e-6); near(wq[1], 1.0, 1e-6);
});

test('parseAiJson strips fences and prose', () => {
  assert.deepEqual(parseAiJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAiJson('Here you go: {"a":{"b":2}} thanks'), { a: { b: 2 } });
  assert.deepEqual(parseAiJson({ a: 3 }), { a: 3 });
  assert.throws(() => parseAiJson('no json here'));
});

test('normaliseReply: types, colours, links, rescale and gemini boxes', () => {
  const reply = { floor: { type: 'Wood', colour: '8A5A32' }, photos: [{ photo: 1, wall_colour: '#d8cfa0', items: [
    { object_id: 'obj-1', type: 'Couch', bbox: [100, 300, 900, 700], colour: 'zzz' },
    { type: 'tv', bbox: [3000, 100, 3100, 200] }, // beyond the stated width -> whole photo rescaled
  ] }] };
  const out = normaliseReply(reply, [{ w: 1568, h: 724 }]);
  assert.equal(out.floor.type, 'wood'); assert.equal(out.floor.colour, '#8a5a32');
  const [a, b] = out.photos[0].items; assert.equal(a.type, 'sofa'); assert.equal(a.colour, '#8b7d6b'); assert.equal(a.link, 'obj-1');
  assert.ok(out.rescaled[0]); assert.ok(b.bbox[2] <= 1568);
  const g = normaliseReply({ photos: [{ items: [{ type: 'tv', bbox: [100, 200, 300, 400] }] }] }, [{ w: 1000, h: 500 }], 'gemini');
  assert.deepEqual(g.photos[0].items[0].bbox, [200, 50, 400, 150]);
  assert.equal(normType('painting'), 'picture'); assert.equal(normType('spaceship'), 'other'); assert.equal(normColour('#abc'), '#aabbcc');
});

test('supports: lamp on a side table, ornament on a console; not the fire tools on the fireplace', () => {
  const items = [
    { key: 'a', type: 'table_lamp', place: 'free', bbox: [732, 255, 885, 495], keep: true },
    { key: 'b', type: 'side_table', place: 'free', bbox: [748, 470, 882, 675], keep: true },
    { key: 'c', type: 'other', place: 'free', bbox: [1125, 262, 1392, 502], keep: true },
    { key: 'd', type: 'media_console', place: 'back', bbox: [352, 462, 1345, 662], keep: true },
    { key: 'e', type: 'other', place: 'free', bbox: [935, 500, 1022, 680], keep: true },
    { key: 'f', type: 'fireplace', place: 'back', bbox: [597, 338, 1016, 672], keep: true },
  ];
  assert.equal(findSupport(items[0], items).key, 'b');
  assert.equal(findSupport(items[2], items).key, 'd');
  assert.equal(findSupport(items[4], items), null);
  assert.equal(findSupport(items[3], items), null);
});

test('end to end on a synthetic room: positions within a few cm', () => {
  const W = 1568, H = 1176, L = 4.9, top = 2.4;
  const P = makeCam({ C: [2.45, 1.5, 3.9], target: [2.45, 1.0, 0], f: 1100, W, H });
  const fr = wallFrame(ROOM, 0), corners = { fl: P(0, 0, 0), fr: P(L, 0, 0), cl: P(0, top, 0), cr: P(L, top, 0) };
  const cam = calibrate(corners, W, H, L, top);
  const box = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  // TV on the wall 1.50-2.73 m, bottom 1.05 m, 0.72 high; console 1.10-4.25 m, 0.45 deep, 0.6 high against the wall
  const tv = box([P(1.5, 1.05, 0), P(2.73, 1.05, 0), P(1.5, 1.77, 0), P(2.73, 1.77, 0)]);
  const con = box([P(1.1, 0, 0.45), P(4.25, 0, 0.45), P(1.1, 0.6, 0.45), P(4.25, 0.6, 0.45), P(1.1, 0.6, 0)]);
  const cube = (u0, u1, y0, y1, z0, z1) => box([u0, u1].flatMap((u) => [y0, y1].flatMap((y) => [z0, z1].map((z) => P(u, y, z)))));
  const chair = cube(3.0, 3.9, 0, 0.9, 0.6, 1.45); // free-standing, front edge 1.45 m out
  assert.ok(chair[3] < H - 5, 'chair base inside the frame');
  const items = [
    { key: 't', type: 'tv', place: 'wall', bbox: tv, w_m: 1.25, d_m: 0.05, h_m: 0.72, keep: true, confidence: 0.9 },
    { key: 'c', type: 'media_console', place: 'back', bbox: con, w_m: 3.2, d_m: 0.45, h_m: 0.6, keep: true, confidence: 0.9 },
    { key: 'a', type: 'armchair', place: 'free', bbox: chair, w_m: 0.9, d_m: 0.85, h_m: 0.9, keep: true, confidence: 0.9 },
  ];
  const pl = placePhotoItems(items, cam, fr, top);
  const t = pl.get('t'); near(t.u0, 1.5, 0.04); near(t.u1, 2.73, 0.04); near(t.elev, 1.05, 0.02); near(t.h, 0.72, 0.02);
  const c = pl.get('c'); near(c.u0, 1.1, 0.05); near(c.u1, 4.25, 0.05); assert.ok(c.against); near(c.dist, 0.225, 0.01);
  const a = pl.get('a'); near(a.u, 3.45, 0.1); near(a.dist, 1.025, 0.1); assert.ok(!a.against);
  // base below the bottom of the frame: estimated from the top edge instead
  const low = cube(1.8, 2.7, 0, 0.9, 1.8, 2.65); const cutItem = { key: 'k', type: 'armchair', place: 'free', bbox: [low[0], low[1], low[2], Math.min(H, low[3])], w_m: 0.9, d_m: 0.85, h_m: 0.9, keep: true, confidence: 0.9, partial: true };
  assert.ok(low[3] > H && low[0] > 5 && low[2] < W - 5, 'base out of frame at the bottom only');
  const pc = placePhotoItems([cutItem], cam, fr, top).get('k'); near(pc.u, 2.25, 0.15, 'cut-off u (perspective widens the box towards the camera)'); near(pc.dist, 2.225, 0.12, 'cut-off dist');
  const merged = mergeShots([{ fr, items, placements: pl, ceiling: top }], { id: 'living', poly: ROOM });
  const mt = merged.find((m) => m.type === 'tv'); near(mt.x, 2.115, 0.02); near(mt.y, 0.03, 0.02); assert.equal(mt.mount, 'wall');
});

test('wall items stay on east and south walls; reused object ids do not merge different things', () => {
  const W = 1232, H = 924;
  const mk = (edge, items) => { const fr = wallFrame(ROOM, edge), cam = calibrate({ fl: [100, 800], fr: [1130, 800], cl: [100, 100], cr: [1130, 100] }, W, H, fr.len, 2.4); return { fr, items, placements: placePhotoItems(items, cam, fr, 2.4), ceiling: 2.4 }; };
  const pic = (key, link) => ({ key, type: 'picture', place: 'wall', bbox: [560, 300, 660, 380], w_m: 0.4, d_m: 0.03, h_m: 0.3, keep: true, confidence: 0.9, link });
  const east = mergeShots([mk(1, [pic('e', null)])], { id: 'r', poly: ROOM })[0]; near(east.x, 4.9 - 0.015, 0.01, 'east wall x');
  const south = mergeShots([mk(2, [pic('s', null)])], { id: 'r', poly: ROOM })[0]; near(south.y, 4.1 - 0.015, 0.01, 'south wall y');
  const sofaN = { key: 'a', type: 'sofa', place: 'back', bbox: [300, 600, 900, 800], w_m: 2, d_m: 0.9, h_m: 0.85, keep: true, confidence: 0.9, link: 'obj-1' };
  const unitW = { key: 'b', type: 'tv_unit', place: 'back', bbox: [300, 650, 900, 800], w_m: 1.5, d_m: 0.4, h_m: 0.5, keep: true, confidence: 0.9, link: 'obj-1' };
  const sofaW = Object.assign({}, sofaN, { key: 'c' });
  assert.equal(mergeShots([mk(0, [sofaN]), mk(3, [unitW])], { id: 'r', poly: ROOM }).length, 2, 'different types keep their own place');
  assert.equal(mergeShots([mk(0, [sofaN]), mk(2, [sofaW])], { id: 'r', poly: ROOM }).length, 2, 'same type, far apart: two sofas');
  assert.equal(normType('constructor'), 'other'); assert.equal(normType('__proto__'), 'other');
});

test('keepInside and prompt', () => {
  const q = keepInside(-1, 2, ROOM, 0.1); assert.ok(q[0] > 0.09 && q[0] < 4.9);
  const p = buildPrompt({ name: 'Living', w: 4.9, d: 4.1 }, [{ compass: 'north', len: 4.9, w: 1568, h: 724 }], 2.4);
  assert.match(p, /Photo 1 faces the NORTH wall \(4\.9 m long\) and is 1568 x 724 pixels/); assert.match(p, /raw JSON only/);
});

test('restoreLightCall', () => {
  assert.deepEqual(restoreLightCall('light.a', { state: 'off' }), { service: 'turn_off', data: { entity_id: 'light.a' } });
  assert.deepEqual(restoreLightCall('light.a', { state: 'on', attributes: { brightness: 120, color_mode: 'color_temp', color_temp_kelvin: 2700 } }), { service: 'turn_on', data: { entity_id: 'light.a', brightness: 120, color_temp_kelvin: 2700 } });
  assert.deepEqual(restoreLightCall('light.a', { state: 'on', attributes: { brightness: 50, color_mode: 'rgb', rgb_color: [255, 0, 0] } }).data.rgb_color, [255, 0, 0]);
});
