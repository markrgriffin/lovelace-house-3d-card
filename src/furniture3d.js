/* Low-poly furniture built from a handful of unit primitives — no model files.
 * Local frame: X = width (centred), Y = up from the item's base, Z = depth (back at -d/2, front at +d/2). */
import * as THREE from 'three';
import { CATALOGUE } from './furnish-geom.js';

let GEO = null;
function geo() {
  if (GEO) return GEO;
  const T = THREE;
  GEO = {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(0.5, 0.5, 1, 20),
    shade: new T.CylinderGeometry(0.32, 0.5, 1, 20),
    cone: new T.ConeGeometry(0.5, 1, 14),
    sphere: new T.SphereGeometry(0.5, 16, 12),
    bowl: new T.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  };
  return GEO;
}
export function shade(hex, k) { // k < 1 darker, > 1 lighter (towards white)
  const n = parseInt(String(hex || '#999999').replace('#', ''), 16) || 0x999999;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k <= 1) { r *= k; g *= k; b *= k; } else { const t = Math.min(1, k - 1); r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
/* part: [shape, cx, cy, cz, sx, sy, sz, colour, flags]; cy is the part's centre height */
function parts(f, H) {
  const { w, d } = f, h = H, c = f.colour || (CATALOGUE[f.type] || CATALOGUE.other).colour, dk = shade(c, 0.7), out = [];
  const B = (cx, cy, cz, sx, sy, sz, col = c, fl) => out.push(['box', cx, cy, cz, sx, sy, sz, col, fl]);
  const legs = (top, inset = 0.05, t = 0.05, col = dk) => { const x = w / 2 - inset - t / 2, z = d / 2 - inset - t / 2; [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([lx, lz]) => B(lx, top / 2, lz, t, top, t, col)); };
  const front = (fn) => { const z = d / 2 + 0.004; fn(z); };
  switch (f.type) {
    case 'sofa': case 'armchair': {
      const arm = Math.min(f.type === 'sofa' ? 0.2 : 0.18, w * 0.2), seatH = h * 0.5;
      B(0, seatH / 2, 0.05 * d, w - 2 * arm, seatH, d * 0.9);
      B(0, h / 2, -d / 2 + d * 0.13, w - 2 * arm, h, d * 0.26, shade(c, 0.9));
      [-1, 1].forEach((s) => B(s * (w / 2 - arm / 2), h * 0.36, 0, arm, h * 0.72, d, shade(c, 0.85)));
      if (f.type === 'sofa' && w > 1.4) { const n = Math.max(2, Math.round((w - 2 * arm) / 0.65)), cw = (w - 2 * arm) / n; for (let i = 0; i < n; i++) B(-w / 2 + arm + cw * (i + 0.5), seatH + 0.04, 0.08 * d, cw - 0.03, 0.08, d * 0.72, shade(c, 1.08)); }
      break;
    }
    case 'coffee_table': case 'dining_table': case 'side_table':
      B(0, h - 0.025, 0, w, 0.05, d); legs(h - 0.05); break;
    case 'chair':
      B(0, h * 0.48, 0, w, 0.05, d); B(0, h * 0.75, -d / 2 + 0.03, w, h * 0.5, 0.05); legs(h * 0.46, 0.02, 0.04); break;
    case 'bed':
      B(0, h * 0.25, 0, w, h * 0.5, d, shade(c, 0.75));
      B(0, h * 0.62, 0.02, w * 0.97, h * 0.3, d * 0.95, '#eae6de');
      B(0, h * 0.75, d * 0.3, w * 0.97, h * 0.06, d * 0.38, c);
      B(0, (h + 0.45) / 2, -d / 2 + 0.04, w, h + 0.45, 0.08, shade(c, 0.6)); break;
    case 'wardrobe': case 'drawers': case 'sideboard': case 'tv_unit': case 'media_console': case 'kitchen_unit': case 'fridge': case 'cooker': {
      const plinth = ['wardrobe', 'fridge'].includes(f.type) ? 0.02 : 0.06;
      B(0, plinth + (h - plinth) / 2, 0, w, h - plinth, d);
      B(0, plinth / 2, -0.03, w * 0.96, plinth, d - 0.06, dk);
      front((z) => {
        if (f.type === 'drawers') { for (let i = 1; i < 4; i++) B(0, plinth + ((h - plinth) * i) / 4, z, w * 0.94, 0.012, 0.01, dk); }
        else if (f.type === 'cooker') { B(0, plinth + (h - plinth) * 0.42, z, w * 0.8, (h - plinth) * 0.5, 0.01, '#202020'); }
        else { const n = Math.max(1, Math.round(w / (f.type === 'wardrobe' ? 0.5 : 0.6))); for (let i = 1; i < n; i++) B(-w / 2 + (w * i) / n, plinth + (h - plinth) / 2, z, 0.012, (h - plinth) * 0.94, 0.01, dk); }
      });
      if (f.type === 'kitchen_unit' || f.type === 'cooker') B(0, h + 0.015, 0.01, w, 0.03, d + 0.02, shade(c, 0.55));
      break;
    }
    case 'bookcase': case 'shelving': {
      const t = 0.025; B(0, h / 2, -d / 2 + 0.01, w, h, 0.02, dk);
      [-1, 1].forEach((s) => B(s * (w / 2 - t / 2), h / 2, 0, t, h, d));
      const n = Math.max(2, Math.round(h / 0.38)); for (let i = 0; i <= n; i++) B(0, Math.min(h - t / 2, t / 2 + ((h - t) * i) / n), 0, w - 2 * t, t, d);
      break;
    }
    case 'tv': B(0, h / 2, 0, w, h, d, '#101010'); front((z) => B(0, h / 2, z, w * 0.96, h * 0.93, 0.005, '#1e2833')); break;
    case 'fireplace': {
      const leg = Math.max(0.1, w * 0.13), frieze = Math.max(0.12, h * 0.18);
      [-1, 1].forEach((s) => B(s * (w / 2 - leg / 2), (h - frieze) / 2, 0, leg, h - frieze, d));
      B(0, h - frieze / 2, 0, w, frieze, d);
      B(0, h + 0.03, 0.02, w * 1.08, 0.06, d + 0.06, shade(c, 0.95));
      B(0, (h - frieze) / 2, -d / 2 + 0.03, w - 2 * leg, h - frieze, 0.04, '#141414');
      B(0, 0.02, d / 2 + 0.12, w * 1.05, 0.04, 0.3, '#2a2c2e'); break;
    }
    case 'chimney_breast': B(0, h / 2, 0, w, h, d); break;
    case 'mirror': case 'picture': {
      B(0, h / 2, 0, w, h, d);
      const inner = f.type === 'mirror' ? '#c9d5dc' : shade(c, 1.35); front((z) => B(0, h / 2, z, w * 0.84, h * 0.84, 0.005, inner)); break;
    }
    case 'window': {
      B(0, h / 2, 0, w, h, d);
      front((z) => { B(0, h / 2, z, w * 0.86, h * 0.88, 0.005, '#4f6f86', { glass: true }); B(0, h / 2, z + 0.004, 0.035, h * 0.88, 0.006, c); }); break;
    }
    case 'door': B(0, h / 2, 0, w, h, d); front((z) => { B(0, h * 0.75, z, w * 0.7, h * 0.35, 0.006, dk); B(0, h * 0.28, z, w * 0.7, h * 0.4, 0.006, dk); B(w * 0.38, h * 0.48, z + 0.02, 0.03, 0.12, 0.03, '#222'); }); break;
    case 'curtains': B(0, h - 0.02, 0, w * 1.05, 0.03, 0.03, dk); [-1, 1].forEach((s) => B(s * (w / 2 - w * 0.14), h / 2, 0, w * 0.28, h - 0.04, d)); break;
    case 'radiator': { B(0, h / 2, -d / 4, w, h, d / 2); const n = Math.max(3, Math.round(w / 0.1)); front(() => { for (let i = 0; i < n; i++) B(-w / 2 + (w * (i + 0.5)) / n, h / 2, d / 4, (w / n) * 0.55, h * 0.96, d / 2, shade(c, 0.93)); }); break; }
    case 'plant': {
      const potH = Math.min(0.45, h * 0.3), potW = Math.min(w, d) * 0.55;
      out.push(['cyl', 0, potH / 2, 0, potW, potH, potW, '#6b4a33']);
      out.push(['sphere', 0, potH + (h - potH) * 0.5, 0, w, (h - potH), d, c]); break;
    }
    case 'floor_lamp': {
      const sh = Math.min(0.45, h * 0.28), sw = Math.max(0.25, w);
      out.push(['cyl', 0, 0.015, 0, sw * 0.6, 0.03, sw * 0.6, '#2a2a2a']);
      out.push(['cyl', 0, (h - sh) / 2, 0, 0.035, h - sh, 0.035, '#2a2a2a']);
      out.push(['shade', 0, h - sh / 2, 0, sw, sh, sw, c, { lamp: true }]); break;
    }
    case 'table_lamp': {
      const sh = h * 0.45; out.push(['cyl', 0, (h - sh) / 2, 0, w * 0.45, h - sh, w * 0.45, shade(c, 0.8)]);
      out.push(['shade', 0, h - sh / 2, 0, w, sh, w, c, { lamp: true }]); break;
    }
    case 'wall_light': out.push(['bowl', 0, h, 0, w, h * 2, d * 2, c, { lamp: true }]); break;
    case 'rug': B(0, Math.max(0.005, h / 2), 0, w, Math.max(0.01, h), d); break;
    case 'basket': case 'pouffe': out.push(['cyl', 0, h / 2, 0, w, h, d, c]); break;
    case 'socket': case 'switch': B(0, h / 2, 0, w, h, d); break;
    default: B(0, h / 2, 0, w, h, d);
  }
  return out;
}

/* f: furniture record; opts: {makeMat(colour, flags) -> material, wallScale, wallHeight}
 * Returns a THREE.Group positioned in the plan, with userData.furn = f.id on every part. */
export function buildFurniture(f, opts) {
  const T = THREE, G = geo(), g = new T.Group(), wall = f.mount === 'wall';
  const k = wall ? opts.wallScale : 1;
  let H = Math.max(0.005, f.h * k);
  if (f.type === 'chimney_breast') H = opts.wallHeight;
  const list = parts(f, H);
  list.forEach(([shape, cx, cy, cz, sx, sy, sz, col, fl]) => {
    const m = new T.Mesh(G[shape], opts.makeMat(col, fl || {}));
    m.position.set(cx, cy, cz); m.scale.set(Math.max(sx, 0.001), Math.max(sy, 0.001), Math.max(sz, 0.001));
    m.userData.furn = f.id; if (fl && fl.lamp) m.userData.lamp = true;
    g.add(m);
  });
  g.position.set(f.x, (f.elev || 0) * k, f.y);
  g.rotation.y = ((f.rot || 0) * Math.PI) / 180;
  g.userData.furn = f.id;
  if (wall) { const t = g.rotation.y; g.userData.normal = [Math.sin(t), Math.cos(t)]; }
  return g;
}
