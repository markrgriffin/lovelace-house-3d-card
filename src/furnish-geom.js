/* Pure geometry and parsing for "Furnish from photos" (no DOM, no three.js) — unit-tested in Node.
 * Plan coordinates follow the card: metres, x = east, y = south. A wall is one edge of a room polygon.
 * Wall coordinates: u along the wall from its left end (as seen from inside the room), v up from the floor,
 * dist = distance from the wall face into the room.
 */

/* ---------- furniture catalogue ---------- */
// place: 'wall' = hangs on the wall face, 'back' = stands with its back to the wall, 'free' = stands anywhere on the floor
export const CATALOGUE = {
  sofa: { label: 'Sofa', place: 'back', w: 2.0, d: 0.9, h: 0.85, colour: '#8b7d6b' },
  armchair: { label: 'Armchair', place: 'free', w: 0.9, d: 0.85, h: 0.9, colour: '#8b5a3c' },
  coffee_table: { label: 'Coffee table', place: 'free', w: 1.0, d: 0.55, h: 0.45, colour: '#8a6240' },
  dining_table: { label: 'Dining table', place: 'free', w: 1.6, d: 0.9, h: 0.75, colour: '#8a6240' },
  side_table: { label: 'Side table', place: 'free', w: 0.45, d: 0.45, h: 0.55, colour: '#8a6240' },
  chair: { label: 'Chair', place: 'free', w: 0.45, d: 0.5, h: 0.9, colour: '#8a6240' },
  bed: { label: 'Bed', place: 'back', w: 1.5, d: 2.0, h: 0.6, colour: '#d8d0c4' },
  wardrobe: { label: 'Wardrobe', place: 'back', w: 1.2, d: 0.6, h: 2.0, colour: '#9a7a58' },
  drawers: { label: 'Chest of drawers', place: 'back', w: 0.8, d: 0.45, h: 0.8, colour: '#9a7a58' },
  sideboard: { label: 'Sideboard', place: 'back', w: 1.5, d: 0.45, h: 0.8, colour: '#7a5638' },
  tv_unit: { label: 'TV unit', place: 'back', w: 1.5, d: 0.4, h: 0.5, colour: '#5a3f2a' },
  media_console: { label: 'Media console', place: 'back', w: 2.0, d: 0.45, h: 0.6, colour: '#5a3f2a' },
  bookcase: { label: 'Bookcase', place: 'back', w: 0.9, d: 0.3, h: 1.8, colour: '#7a5638' },
  shelving: { label: 'Shelving', place: 'back', w: 0.9, d: 0.3, h: 1.6, colour: '#7a5638' },
  tv: { label: 'TV', place: 'wall', w: 1.23, d: 0.06, h: 0.72, elev: 1.0, colour: '#151515' },
  fireplace: { label: 'Fireplace', place: 'back', w: 1.2, d: 0.3, h: 1.1, colour: '#b07a45' },
  chimney_breast: { label: 'Chimney breast', place: 'back', w: 1.5, d: 0.4, h: 2.4, colour: '#d9d2c3' },
  mirror: { label: 'Mirror', place: 'wall', w: 0.8, d: 0.04, h: 1.0, elev: 1.2, colour: '#a9784a' },
  picture: { label: 'Picture', place: 'wall', w: 0.6, d: 0.03, h: 0.45, elev: 1.4, colour: '#3a3026' },
  plant: { label: 'Plant', place: 'free', w: 0.5, d: 0.5, h: 1.2, colour: '#3f6b2a' },
  floor_lamp: { label: 'Floor lamp', place: 'free', w: 0.45, d: 0.45, h: 1.6, colour: '#e8d6a8' },
  table_lamp: { label: 'Table lamp', place: 'free', w: 0.35, d: 0.35, h: 0.6, colour: '#e8d6a8' },
  rug: { label: 'Rug', place: 'free', w: 2.0, d: 1.4, h: 0.02, colour: '#d8cfbf' },
  curtains: { label: 'Curtains', place: 'wall', w: 1.4, d: 0.12, h: 2.2, elev: 0, colour: '#7a6a5a' },
  radiator: { label: 'Radiator', place: 'wall', w: 1.0, d: 0.1, h: 0.6, elev: 0.15, colour: '#eeeeea' },
  door: { label: 'Door', place: 'wall', w: 0.85, d: 0.05, h: 2.0, elev: 0, colour: '#9a6a3a' },
  window: { label: 'Window', place: 'wall', w: 1.0, d: 0.08, h: 1.2, elev: 0.9, colour: '#4a3a2a' },
  wall_light: { label: 'Wall light', place: 'wall', w: 0.3, d: 0.15, h: 0.15, elev: 1.8, colour: '#efe6d2' },
  socket: { label: 'Socket', place: 'wall', w: 0.15, d: 0.03, h: 0.09, elev: 0.3, colour: '#f0f0ea' },
  switch: { label: 'Switch', place: 'wall', w: 0.09, d: 0.03, h: 0.09, elev: 1.2, colour: '#f0f0ea' },
  kitchen_unit: { label: 'Kitchen unit', place: 'back', w: 0.6, d: 0.6, h: 0.9, colour: '#d8d8d0' },
  fridge: { label: 'Fridge', place: 'back', w: 0.6, d: 0.65, h: 1.8, colour: '#e8e8e8' },
  cooker: { label: 'Cooker', place: 'back', w: 0.6, d: 0.6, h: 0.9, colour: '#c8c8c8' },
  basket: { label: 'Basket', place: 'free', w: 0.5, d: 0.4, h: 0.45, colour: '#b8a888' },
  pouffe: { label: 'Pouffe / footstool', place: 'free', w: 0.6, d: 0.6, h: 0.42, colour: '#6a7a8c' },
  other: { label: 'Other', place: 'free', w: 0.5, d: 0.5, h: 0.5, colour: '#9a9a9a' },
};
export const TYPES = Object.keys(CATALOGUE);
const SYNONYMS = {
  couch: 'sofa', settee: 'sofa', tv_stand: 'tv_unit', television: 'tv', lamp: 'table_lamp', standard_lamp: 'floor_lamp',
  painting: 'picture', artwork: 'picture', frame: 'picture', photo: 'picture', dresser: 'drawers', chest: 'drawers',
  cabinet: 'sideboard', cupboard: 'sideboard', stool: 'pouffe', ottoman: 'pouffe', footstool: 'pouffe', table: 'side_table',
  end_table: 'side_table', light: 'wall_light', sconce: 'wall_light', uplighter: 'wall_light', outlet: 'socket',
  light_switch: 'switch', console: 'media_console', media_unit: 'media_console', bookshelf: 'bookcase', shelf: 'shelving',
  oven: 'cooker', stove: 'cooker', blind: 'curtains', carpet: 'rug', mat: 'rug', houseplant: 'plant', desk: 'dining_table',
};
export function normType(t) {
  const k = String(t || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (Object.prototype.hasOwnProperty.call(CATALOGUE, k)) return k;
  if (Object.prototype.hasOwnProperty.call(SYNONYMS, k)) return SYNONYMS[k];
  return 'other';
}
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const finite = (v) => typeof v === 'number' && isFinite(v);
export function normColour(c, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()) || /^#?([0-9a-f]{3})$/i.exec(String(c || '').trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return '#' + h.toLowerCase();
}
// keep a model's size estimate sane for its type
export function clampDims(type, w, d, h) {
  const c = CATALOGUE[type] || CATALOGUE.other, f = (v, def, lo) => clamp(finite(v) && v > 0 ? v : def, Math.max(lo, def * 0.3), def * 3);
  return { w: f(w, c.w, 0.05), d: f(d, c.d, 0.01), h: f(h, c.h, 0.01) };
}

/* ---------- polygon helpers ---------- */
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
// pull a point inside the polygon (towards the centroid) with a margin
export function keepInside(x, y, poly, margin = 0.05) {
  const c = centroid(poly);
  const ok = (px, py) => pointInPoly(px, py, poly) && [[margin, 0], [-margin, 0], [0, margin], [0, -margin]].every(([dx, dy]) => pointInPoly(px + dx, py + dy, poly));
  if (ok(x, y)) return [x, y];
  for (let t = 0.05; t <= 1.0001; t += 0.05) { const px = x + (c[0] - x) * t, py = y + (c[1] - y) * t; if (ok(px, py)) return [px, py]; }
  return [c[0], c[1]];
}

/* ---------- walls ---------- */
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// frame for polygon edge i: inward normal, "right" direction (as seen from inside facing the wall), left end, length
export function wallFrame(poly, i) {
  const n = poly.length, a = poly[i], c = poly[(i + 1) % n];
  const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
  let nx = -dy / len, ny = dx / len; const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
  if (!pointInPoly(mx + nx * 0.03, my + ny * 0.03, poly)) { nx = -nx; ny = -ny; }
  const rx = ny, ry = -nx; // facing the wall (direction -n), right-hand side
  const left = a[0] * rx + a[1] * ry <= c[0] * rx + c[1] * ry ? a : c;
  // the wall faces the opposite way to its inward normal: a wall whose normal points south is the north wall
  const ang = Math.atan2(-nx, ny); // bearing from the room towards the wall (0 = north; x east, y south)
  const idx = ((Math.round((ang * 180) / Math.PI / 45) % 8) + 8) % 8;
  return { index: i, len, origin: [left[0], left[1]], right: [rx, ry], normal: [nx, ny], compass: COMPASS[idx] };
}
export function wallToPlan(fr, u, dist) { return [fr.origin[0] + fr.right[0] * u + fr.normal[0] * dist, fr.origin[1] + fr.right[1] * u + fr.normal[1] * dist]; }
// rotation (degrees about the vertical, three.js convention) that puts an item's back against this wall, front into the room
export function wallRotation(fr) { return (Math.atan2(fr.normal[0], fr.normal[1]) * 180) / Math.PI; }

/* ---------- homography ---------- */
function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('singular');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// H (row-major 3x3, h[8] = 1) mapping src[i] -> dst[i], four point pairs
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  return solve(A, b).concat([1]);
}
export function applyH(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }

/* ---------- camera from the four tapped wall corners ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a) => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
/* corners: {fl, fr, cl, cr} as [px, py] in image pixels (may lie outside the image);
 * wallLen and topH in metres (topH = height of the two top points above the floor).
 * Returns a camera that maps wall-world points (X along wall from left corner, Y up, Z into the room) to pixels. */
export function calibrate(corners, imgW, imgH, wallLen, topH) {
  const cx = imgW / 2, cy = imgH / 2, img = [corners.fl, corners.fr, corners.cr, corners.cl].map((p) => [p[0] - cx, p[1] - cy]);
  const wall = [[0, 0], [wallLen, 0], [wallLen, topH], [0, topH]];
  const G = homography(wall, img), Hinv = homography(img, wall);
  const h1 = [G[0], G[3], G[6]], h2 = [G[1], G[4], G[7]], h3 = [G[2], G[5], G[8]];
  const longSide = Math.max(imgW, imgH), cands = [];
  const fa = -(h1[0] * h2[0] + h1[1] * h2[1]) / (h1[2] * h2[2]); if (finite(fa) && fa > 0 && Math.abs(h1[2] * h2[2]) > 1e-14) cands.push({ f: Math.sqrt(fa), wgt: Math.abs(h1[2] * h2[2]) });
  const fb = (h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2) / (h2[2] ** 2 - h1[2] ** 2); if (finite(fb) && fb > 0 && Math.abs(h2[2] ** 2 - h1[2] ** 2) > 1e-14) cands.push({ f: Math.sqrt(fb), wgt: Math.abs(h2[2] ** 2 - h1[2] ** 2) });
  const good = cands.filter((c) => c.f > 0.4 * longSide && c.f < 2.5 * longSide);
  let f = 0.75 * longSide, fSource = 'assumed';
  if (good.length) { f = good.reduce((s, c) => s + c.f * c.wgt, 0) / good.reduce((s, c) => s + c.wgt, 0); fSource = 'measured'; }
  const Ki = (h) => [h[0] / f, h[1] / f, h[2]];
  let lam = 2 / (Math.hypot(...Ki(h1)) + Math.hypot(...Ki(h2)));
  let t = scale(Ki(h3), lam); if (t[2] < 0) { lam = -lam; t = scale(t, -1); }
  let r1 = unit(scale(Ki(h1), lam)), r2 = scale(Ki(h2), lam);
  r2 = unit(sub(r2, scale(r1, dot(r1, r2))));
  const r3 = cross(r1, r2);
  const R = [r1, r2, r3]; // columns
  const Rt = (v) => [dot(r1, v), dot(r2, v), dot(r3, v)]; // R^T v
  const C = scale(Rt(t), -1); // camera centre in wall-world coords
  return { f, fSource, cx, cy, R, t, C, Hinv, wallLen, topH, imgW, imgH,
    project(X, Y, Z) { const p = [r1[0] * X + r2[0] * Y + r3[0] * Z + t[0], r1[1] * X + r2[1] * Y + r3[1] * Z + t[1], r1[2] * X + r2[2] * Y + r3[2] * Z + t[2]]; return [cx + (f * p[0]) / p[2], cy + (f * p[1]) / p[2]]; },
    // pixel -> point on the wall plane (Z = 0): [u, v]
    toWall(px, py) { return applyH(Hinv, px - cx, py - cy); },
    // pixel -> point on the horizontal plane Y = y0: [u, dist] or null if behind the camera / above the horizon
    toFloor(px, py, y0 = 0) {
      const d = Rt([(px - cx) / f, (py - cy) / f, 1]); if (Math.abs(d[1]) < 1e-9) return null;
      const s = (y0 - C[1]) / d[1]; if (s <= 0) return null;
      return [C[0] + s * d[0], C[2] + s * d[2]];
    },
  };
}

/* ---------- AI reply parsing ---------- */
export function parseAiJson(data) {
  if (data && typeof data === 'object') return data;
  let s = String(data == null ? '' : data).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI reply contained no JSON object');
  return JSON.parse(s.slice(a, b + 1));
}
/* photos: [{w, h}] — the exact pixel size we sent. Returns {floor, photos:[{wallColour, items:[...]}], rescaled:[bool]}
 * bbox in the reply may be pixels at our size (asked for), pixels at some other size (rescaled) or Gemini-style
 * 0-1000 [ymin, xmin, ymax, xmax] (bboxFormat 'gemini'). */
export function normaliseReply(obj, photos, bboxFormat = 'pixels') {
  const out = { floor: null, photos: photos.map(() => ({ wallColour: null, items: [] })), rescaled: photos.map(() => false) };
  if (obj && obj.floor) out.floor = { type: ['wood', 'carpet', 'tile'].includes(String(obj.floor.type).toLowerCase()) ? String(obj.floor.type).toLowerCase() : 'wood', colour: normColour(obj.floor.colour || obj.floor.color, null) };
  const list = Array.isArray(obj && obj.photos) ? obj.photos : [];
  list.forEach((ph, k) => {
    const idx = finite(ph.photo) && ph.photo >= 1 && ph.photo <= photos.length ? ph.photo - 1 : k; if (idx >= photos.length) return;
    const { w, h } = photos[idx], dst = out.photos[idx];
    dst.wallColour = normColour(ph.wall_colour || ph.wall_color, null);
    let items = (Array.isArray(ph.items) ? ph.items : []).filter((it) => it && Array.isArray(it.bbox) && it.bbox.length === 4 && it.bbox.every(finite));
    items = items.map((it) => {
      let b = it.bbox.slice();
      if (bboxFormat === 'gemini') b = [(b[1] / 1000) * w, (b[0] / 1000) * h, (b[3] / 1000) * w, (b[2] / 1000) * h];
      if (b[2] < b[0]) [b[0], b[2]] = [b[2], b[0]]; if (b[3] < b[1]) [b[1], b[3]] = [b[3], b[1]];
      return Object.assign({}, it, { bbox: b });
    });
    if (bboxFormat !== 'gemini' && items.length) { // the model may have answered at a different size than we told it
      const mx = Math.max(...items.map((it) => it.bbox[2])), my = Math.max(...items.map((it) => it.bbox[3]));
      const s = Math.max(mx / w, my / h);
      if (s > 1.03) { items.forEach((it) => { it.bbox = it.bbox.map((v) => v / s); }); out.rescaled[idx] = true; }
    }
    dst.items = items.map((it, j) => {
      const type = normType(it.type), cat = CATALOGUE[type], b = it.bbox.map((v, q) => clamp(v, 0, q % 2 ? h : w));
      return {
        key: idx + ':' + j, type, label: String(it.label || cat.label).slice(0, 80),
        place: cat.place, bbox: b, w_m: it.width_m, d_m: it.depth_m, h_m: it.height_m,
        colour: normColour(it.colour || it.color, cat.colour), partial: !!it.partial,
        confidence: finite(it.confidence) ? clamp(it.confidence, 0, 1) : 0.5,
        link: it.object_id != null && it.object_id !== '' ? String(it.object_id) : null, keep: true,
      };
    });
  });
  return out;
}

/* ---------- prompt ---------- */
export function buildPrompt(room, photos, ceiling) {
  const lines = [
    `You are given ${photos.length} photo${photos.length > 1 ? 's' : ''} of one room${room.name ? ' ("' + room.name + '")' : ''}, about ${room.w.toFixed(1)} m by ${room.d.toFixed(1)} m, ceiling about ${ceiling.toFixed(1)} m.`,
    ...photos.map((p, i) => `Photo ${i + 1} faces the ${p.compass.toUpperCase()} wall (${p.len.toFixed(1)} m long) and is ${p.w} x ${p.h} pixels.`),
    'Photos are listed in that order.',
    'Give all positions in PIXEL coordinates of each photo at the size stated: x from the left edge, y from the top edge.',
    'For each photo, list every item of furniture, fixture or wall-hung object that is on or against the photographed wall, plus doors, windows, radiators, wall lights, sockets and switches. Ignore items on other walls unless that wall is also photographed.',
    `Give a tight bounding box [x_min, y_min, x_max, y_max], a type from this list: ${TYPES.join(', ')}. Also give a short label, mount (floor or wall), your estimate of real width, depth and height in metres, the dominant colour as #hex, partial (true if cut off by the frame) and confidence 0-1.`,
    'If the same physical object appears in more than one photo, give it the same "object_id" in each.',
    'Also give the dominant colour of each photographed wall and the floor type and colour. Only list items you can actually see.',
    'Reply with raw JSON only, no markdown fences, no prose, in this form:',
    '{"floor":{"type":"wood|carpet|tile","colour":"#hex"},"photos":[{"photo":1,"wall_colour":"#hex","items":[{"object_id":"obj-1","type":"tv","label":"short description","mount":"wall","bbox":[0,0,0,0],"width_m":0,"depth_m":0,"height_m":0,"colour":"#hex","partial":false,"confidence":0.9}]}]}',
  ];
  return lines.join('\n');
}

/* ---------- placement ---------- */
const EDGE = 3; // px: a bbox this close to the frame edge is cut off
// things other things can stand on
const SURFACES = new Set(['side_table', 'coffee_table', 'dining_table', 'drawers', 'sideboard', 'tv_unit', 'media_console', 'bookcase', 'shelving', 'wardrobe', 'kitchen_unit', 'cooker', 'fridge', 'other']);
// irregular outlines: the box round a plant or lamp says little about its footprint, so trust the size estimate
const ROUNDISH = new Set(['plant', 'floor_lamp', 'table_lamp', 'basket', 'pouffe', 'other', 'chair']);
// find the floor item an item sits on (its bottom edge lands in the upper part of the other item's box)
export function findSupport(it, items) {
  if (it.place === 'wall' || it.type === 'rug') return null;
  const [x0, , x1, y1] = it.bbox, xc = (x0 + x1) / 2;
  let best = null;
  items.forEach((o) => {
    if (o === it || !o.keep || !SURFACES.has(o.type)) return;
    const [ox0, oy0, ox1, oy1] = o.bbox, oh = oy1 - oy0;
    if (xc < ox0 || xc > ox1) return;
    if (y1 < oy0 - 0.1 * oh || y1 > oy0 + 0.6 * oh || y1 >= oy1 - 2) return;
    if (!ROUNDISH.has(it.type) && (x1 - x0) > (ox1 - ox0) * 1.2) return; // a box wider than the "support" is not standing on it (foliage and lampshades may overhang)
    if (!best || Math.abs(y1 - oy0) < Math.abs(y1 - best.bbox[1])) best = o;
  });
  return best;
}
/* Turn one photo's reviewed items into wall-relative placements.
 * cam: from calibrate(); fr: wallFrame(); items: normalised + reviewed; ceiling: metres */
export function placePhotoItems(items, cam, fr, ceiling) {
  const W = cam.imgW, kept = items.filter((it) => it.keep), res = new Map();
  const breasts = [];
  const dimsOf = (it) => clampDims(it.type, it.w_m, it.d_m, it.h_m);
  const cut = (it) => ({ l: it.bbox[0] <= EDGE, r: it.bbox[2] >= W - EDGE });
  // 1) wall-plane items and items that stand against the wall
  const base = (it) => {
    if (res.has(it.key)) return res.get(it.key);
    const cat = CATALOGUE[it.type], dm = dimsOf(it), [x0, y0, x1, y1] = it.bbox, xc = (x0 + x1) / 2;
    let p;
    if (cat.place === 'wall' || it.type === 'chimney_breast') {
      const bl = cam.toWall(x0, y1), br = cam.toWall(x1, y1), bc = cam.toWall(xc, y1), tc = cam.toWall(xc, y0);
      let u0 = Math.min(bl[0], br[0]), u1 = Math.max(bl[0], br[0]);
      let elev = Math.max(0, bc[1]), h = Math.max(0.02, tc[1] - bc[1]);
      if (it.type === 'chimney_breast') { elev = 0; h = Math.max(h, ceiling); }
      const c = cut(it); if (it.partial || c.l || c.r) { const extra = Math.max(0, dm.w - (u1 - u0)); if (c.l && !c.r) u0 -= extra; else if (c.r && !c.l) u1 += extra; }
      p = { u0, u1, elev, h, d: dm.d, dist: dm.d / 2, rot: wallRotation(fr), against: true, mount: 'wall' };
      if (it.type === 'chimney_breast') { p.mount = 'floor'; breasts.push(p); }
    } else {
      const support = findSupport(it, kept);
      let elev = 0, plane = 0, sp = null;
      if (support) { sp = base(support); elev = sp.elev + sp.h; plane = elev; }
      const l = cam.toFloor(x0, y1, plane), r = cam.toFloor(x1, y1, plane), m = cam.toFloor(xc, y1, plane);
      let u0, u1, front;
      // a base that lands behind the wall plane is hidden or above the floor line: fall back to the wall plane
      if (l && r && m && m[1] >= -0.05) { u0 = Math.min(l[0], r[0]); u1 = Math.max(l[0], r[0]); front = Math.max(0, m[1]); }
      else { const bl = cam.toWall(x0, y1), br = cam.toWall(x1, y1); u0 = Math.min(bl[0], br[0]); u1 = Math.max(bl[0], br[0]); front = dm.d; }
      let dist = front - dm.d / 2, against = false;
      // base cut off by the bottom of the frame: the lowest visible point is not the floor contact.
      // Use the top instead – seen from above, the highest point of the item is its back top edge.
      if (it.bbox[3] >= cam.imgH - EDGE && cam.C[1] > elev + dm.h + 0.1) {
        const tl = cam.toFloor(x0, it.bbox[1], elev + dm.h), tr = cam.toFloor(x1, it.bbox[1], elev + dm.h), tm = cam.toFloor(xc, it.bbox[1], elev + dm.h);
        if (tl && tr && tm && tm[1] >= -0.05) { u0 = tm[0] - dm.w / 2; u1 = tm[0] + dm.w / 2; dist = Math.max(0, tm[1]) + dm.d / 2; front = dist + dm.d / 2; }
      }
      const c = cut(it); if (it.partial || c.l || c.r) { const extra = Math.max(0, dm.w - (u1 - u0)); if (c.l && !c.r) u0 -= extra; else if (c.r && !c.l) u1 += extra; }
      if (cat.place === 'back' || (sp && sp.against) || front - dm.d < 0.15) { dist = dm.d / 2; against = true; }
      if (sp) { dist = Math.min(Math.max(dist, sp.dist - sp.d / 2 + dm.d / 2), sp.dist + sp.d / 2 - dm.d / 2); if (sp.against) dist = Math.max(dm.d / 2, sp.dist - sp.d / 2 + dm.d / 2); }
      dist = Math.max(dm.d / 2, dist);
      p = { u0, u1, elev, h: dm.h, d: dm.d, dist, rot: wallRotation(fr), against, mount: 'floor', on: support ? support.key : null };
    }
    res.set(it.key, p); return p;
  };
  kept.forEach(base);
  // 2) things on the face of a chimney breast come forward by its depth
  kept.forEach((it) => {
    const p = res.get(it.key); if (!p || it.type === 'chimney_breast' || !p.against || p.on) return;
    const uc = (p.u0 + p.u1) / 2, b = breasts.find((q) => uc > q.u0 && uc < q.u1); if (b) p.dist += b.d;
  });
  // 3) widths: wall-mapped span, but never silly against the model estimate
  kept.forEach((it) => {
    const p = res.get(it.key), dm = dimsOf(it); let w = p.u1 - p.u0;
    if (!(w > 0.03)) w = dm.w;
    if (p.mount === 'floor' && it.type !== 'chimney_breast') w = ROUNDISH.has(it.type) || it.type === 'rug' ? dm.w : clamp(w, 0.6 * dm.w, 1.6 * dm.w);
    p.w = w; p.u = clamp((p.u0 + p.u1) / 2, Math.min(w / 2, fr.len / 2), Math.max(fr.len - w / 2, fr.len / 2));
  });
  // 4) rug: if cut off at the bottom of the frame the front is unknown — mark low-weight
  kept.forEach((it) => { const p = res.get(it.key); p.weight = (it.partial || it.bbox[3] >= cam.imgH - EDGE || it.bbox[0] <= EDGE || it.bbox[2] >= W - EDGE ? 1 : 3) * (0.5 + it.confidence); });
  return res;
}

/* Combine all photos into plan-space furniture.
 * shots: [{fr, items, placements(Map), ceiling}], room: {id, poly}. Returns furniture records for the layout. */
export function mergeShots(shots, room, idPrefix = 'f') {
  const groups = new Map(); let n = 0;
  shots.forEach((s, si) => s.items.filter((it) => it.keep).forEach((it) => {
    const p = s.placements.get(it.key); if (!p) return;
    const key = it.link ? 'L:' + it.link + ':' + it.type : 'K:' + si + ':' + it.key;
    if (!groups.has(key)) groups.set(key, []);
    const [x, y] = wallToPlan(s.fr, p.u, p.dist);
    groups.get(key).push({ it, p, x, y, si, fr: s.fr });
  }));
  // a shared object_id only merges observations from different photos that land near each other (models reuse ids)
  const clusters = [];
  groups.forEach((obs) => {
    const local = [];
    obs.forEach((o) => {
      const dm = clampDims(o.it.type, o.it.w_m, o.it.d_m, o.it.h_m), reach = Math.max(1.2, 0.6 * (dm.w + dm.d)); // big things seen partly can be far off
      const c = local.find((cl) => !cl.some((q) => q.si === o.si) && Math.hypot(cl.reduce((a, q) => a + q.x, 0) / cl.length - o.x, cl.reduce((a, q) => a + q.y, 0) / cl.length - o.y) < reach);
      if (c) c.push(o); else local.push([o]);
    });
    clusters.push(...local);
  });
  const out = [];
  clusters.forEach((obs) => {
    const strong = obs.filter((o) => o.p.weight >= 2), use = strong.length ? strong : obs;
    const W = use.reduce((s, o) => s + o.p.weight, 0);
    let x = use.reduce((s, o) => s + o.x * o.p.weight, 0) / W, y = use.reduce((s, o) => s + o.y * o.p.weight, 0) / W;
    const best = obs.slice().sort((a, b) => (b.p.weight - a.p.weight) || ((b.it.bbox[2] - b.it.bbox[0]) * (b.it.bbox[3] - b.it.bbox[1]) - (a.it.bbox[2] - a.it.bbox[0]) * (a.it.bbox[3] - a.it.bbox[1])))[0];
    const { it, p } = best, cat = CATALOGUE[it.type];
    if (it.type === 'rug' && !strong.length) { const c = centroid(room.poly); x = c[0]; y = c[1]; }
    const dm = clampDims(it.type, it.w_m, it.d_m, it.h_m);
    out.push({
      id: idPrefix + '_' + Date.now().toString(36) + '_' + (n++).toString(36), room: room.id, type: it.type, label: it.label,
      x, y, w: round(clamp(p.w, 0.05, 8)), d: round(it.type === 'rug' ? dm.d : p.d), h: round(p.h), elev: round(p.elev), rot: Math.round(p.rot),
      colour: it.colour || cat.colour, mount: p.mount, source: 'photo', _against: p.against || p.mount === 'wall', _wall: best.fr.index, _fr: best.fr, _dist: p.dist,
    });
  });
  separate(out);
  out.forEach((f) => {
    // against-wall items were placed in wall coordinates (u clamped to the wall, dist >= d/2); a polygon test on the
    // wall line itself is ambiguous, so only free-standing items are pulled inside
    if (!f._against) { const q = keepInside(f.x, f.y, room.poly, Math.max(0.01, Math.min(0.2, f.d / 2) - 0.01)); f.x = q[0]; f.y = q[1]; }
    else { // clamp along its own wall (separation or averaging may have pushed it past the end)
      const fr = f._fr, u = (f.x - fr.origin[0]) * fr.right[0] + (f.y - fr.origin[1]) * fr.right[1], dist = (f.x - fr.origin[0]) * fr.normal[0] + (f.y - fr.origin[1]) * fr.normal[1];
      const q = wallToPlan(fr, clamp(u, Math.min(f.w / 2, fr.len / 2), Math.max(fr.len - f.w / 2, fr.len / 2)), Math.max(f.d / 2, dist)); f.x = q[0]; f.y = q[1];
    }
    f.x = round(f.x); f.y = round(f.y); delete f._against; delete f._wall; delete f._fr; delete f._dist;
  });
  return out;
}
const round = (v) => Math.round(v * 100) / 100;
// floor items standing against the same wall must not overlap: push them apart along the wall
export function separate(items) {
  const groups = new Map();
  items.forEach((f) => { if (f.mount !== 'floor' || f.elev > 0.01 || !f._against || f.type === 'rug' || f.type === 'chimney_breast') return; const k = f._wall + ':' + Math.round((f._dist - f.d / 2) / 0.2); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
  groups.forEach((list) => {
    const rot = (list[0].rot * Math.PI) / 180, rx = Math.cos(rot), ry = -Math.sin(rot); // item local X in plan
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      list.sort((a, b) => (a.x * rx + a.y * ry) - (b.x * rx + b.y * ry));
      for (let i = 0; i + 1 < list.length; i++) {
        const a = list[i], b = list[i + 1], ua = a.x * rx + a.y * ry, ub = b.x * rx + b.y * ry;
        const ov = (a.w / 2 + b.w / 2) - (ub - ua);
        if (ov > 0.02) { const s = ov / 2; a.x -= rx * s; a.y -= ry * s; b.x += rx * s; b.y += ry * s; moved = true; }
      }
      if (!moved) break;
    }
  });
}

/* ---------- photo mode helpers ---------- */
export function restoreLightCall(entity, s) {
  if (!s || s.state !== 'on') return { service: 'turn_off', data: { entity_id: entity } };
  const a = s.attributes || {}, data = { entity_id: entity };
  if (typeof a.brightness === 'number') data.brightness = a.brightness;
  if (a.color_mode === 'color_temp' && a.color_temp_kelvin) data.color_temp_kelvin = a.color_temp_kelvin;
  else if (Array.isArray(a.rgb_color) && a.color_mode && a.color_mode !== 'color_temp' && a.color_mode !== 'brightness' && a.color_mode !== 'onoff') data.rgb_color = a.rgb_color;
  return { service: 'turn_on', data };
}
