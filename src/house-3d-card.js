/* House 3D Card for Home Assistant
 * Rotatable 3D mimic of a house with live lights, sockets and climate.
 * https://github.com/markrgriffin/lovelace-house-3d-card   (MIT)
 * Bundled with three.js (MIT, https://threejs.org)
 */
import * as THREE from 'three';
const VERSION = __VERSION__;

/* ---------- default plan (metres; x = east, y = south; measured from the floorplan at ~60 px/m) ---------- */
const DEFAULT_PLAN = {
  wallHeight: 1.5,
  groundColor: '#2c3b2f',
  rooms: [
    { id: 'living', name: 'Living Room', areas: 'living room, lounge', floor: 'oak', poly: [[0, 0], [5.5, 0], [5.5, 4.5], [0, 4.5]] },
    { id: 'kitchen', name: 'Kitchen', areas: 'kitchen', floor: 'tile_light', poly: [[5.5, 0], [10, 0], [10, 4.5], [5.5, 4.5]] },
    { id: 'hall', name: 'Hall', areas: 'hall, hallway', floor: 'oak', poly: [[0, 4.5], [10, 4.5], [10, 6], [0, 6]] },
    { id: 'bedroom', name: 'Bedroom', areas: 'bedroom', floor: 'carpet_beige', poly: [[0, 6], [6, 6], [6, 10], [0, 10]] },
    { id: 'bathroom', name: 'Bathroom', areas: 'bathroom', floor: 'tile_light', poly: [[6, 6], [10, 6], [10, 10], [6, 10]] },
  ],
  doors: [{ x: 2.5, y: 4.5, w: 0.9 }, { x: 7.5, y: 4.5, w: 0.9 }, { x: 3, y: 6, w: 0.9 }, { x: 8, y: 6, w: 0.8 }, { x: 10, y: 5.25, w: 0.9 }],
  plan: null,
  markers: [],
};

const FLOORS = {
  oak: { label: 'Wood – oak', pattern: 'wood', color: '#c9974f' },
  pine: { label: 'Wood – pine', pattern: 'wood', color: '#e2c38a' },
  walnut: { label: 'Wood – walnut', pattern: 'wood', color: '#7d5633' },
  grey_wood: { label: 'Wood – grey wash', pattern: 'wood', color: '#a8a296' },
  carpet_beige: { label: 'Carpet – beige', pattern: 'carpet', color: '#cdbfa6' },
  carpet_grey: { label: 'Carpet – grey', pattern: 'carpet', color: '#8e9299' },
  carpet_blue: { label: 'Carpet – blue', pattern: 'carpet', color: '#5f7896' },
  carpet_green: { label: 'Carpet – green', pattern: 'carpet', color: '#6f8a6a' },
  tile_light: { label: 'Tile – light', pattern: 'tile', color: '#dcdcd6' },
  tile_slate: { label: 'Tile – slate', pattern: 'tile', color: '#5d6368' },
  concrete: { label: 'Plain / concrete', pattern: 'plain', color: '#9a9a98' },
};
const PATTERN_SIZE = { wood: 2.0, carpet: 1.0, tile: 1.2, plain: 1.0 }; // metres covered by one texture repeat
const DEFAULT_WALL = '#e9e4da';
const MAXL = 12;

/* ---------- helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = (v, s = 0.05) => Math.round(Math.round(v / s) * s * 100) / 100;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function hexToRgb(hex) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return isNaN(n) ? [1, 1, 1] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function kelvinToRgb(k) {
  const t = clamp(k, 1000, 12000) / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ---------- procedural floor textures (greyscale-ish, tinted by floor colour in the shader) ---------- */
function makePatternCanvas(pattern) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(pattern.length * 7919 + 13);
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  if (pattern === 'wood') {
    const planks = 10, ph = S / planks;
    for (let p = 0; p < planks; p++) {
      const off = Math.floor(r() * S), seams = [off, (off + S * (0.45 + r() * 0.2)) % S].sort((a, b) => a - b);
      const bounds = [0, ...seams, S];
      for (let k = 0; k < bounds.length - 1; k++) {
        const v = Math.floor(226 + r() * 29); g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(bounds[k], p * ph, bounds[k + 1] - bounds[k], ph);
      }
      for (let i = 0; i < 26; i++) { // grain
        const y = p * ph + r() * ph, a = 0.03 + r() * 0.06;
        g.strokeStyle = `rgba(60,40,20,${a})`; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= S; x += 64) g.lineTo(x, y + (r() - 0.5) * 3); g.stroke();
      }
      g.fillStyle = 'rgba(30,20,10,0.35)'; g.fillRect(0, p * ph, S, 1.5);
      seams.forEach((sx) => g.fillRect(sx, p * ph, 1.5, ph));
    }
  } else if (pattern === 'carpet') {
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = 190 + r() * 65; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  } else if (pattern === 'tile') {
    const n = 2, ts = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = Math.floor(225 + r() * 28); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(i * ts, j * ts, ts, ts);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.04})`; g.fillRect(i * ts + r() * ts, j * ts + r() * ts, 6 + r() * 30, 4 + r() * 20); }
    }
    g.fillStyle = 'rgba(40,40,40,0.75)';
    for (let i = 0; i < n; i++) { g.fillRect(i * ts - 2, 0, 4, S); g.fillRect(0, i * ts - 2, S, 4); }
    g.fillRect(S - 2, 0, 2, S); g.fillRect(0, S - 2, S, 2);
  } else {
    for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.035})`; g.fillRect(r() * S, r() * S, 4 + r() * 40, 4 + r() * 40); }
  }
  return c;
}
function makeGlowCanvas() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return c;
}

/* ---------- shaders: per-room lighting so light never bleeds through walls ---------- */
const VERT = `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FRAG = `
#define MAXL ${MAXL}
uniform sampler2D map; uniform float useMap; uniform vec3 tint; uniform float ambient; uniform float uvScale; uniform float sel;
uniform int nL; uniform vec3 lPos[MAXL]; uniform vec3 lCol[MAXL]; uniform float lRad[MAXL];
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){
  vec3 base = tint; if (useMap > 0.5) base *= texture2D(map, vUv * uvScale).rgb;
  vec3 N = normalize(vN);
  float shade = 0.82 + 0.18 * dot(N, normalize(vec3(0.35, 1.0, 0.45)));
  vec3 light = vec3(ambient * shade);
  for (int i = 0; i < MAXL; i++) {
    if (i >= nL) break;
    vec3 L = lPos[i] - vW; float d = max(length(L), 0.001);
    float a = clamp(1.0 - d / lRad[i], 0.0, 1.0); a = a * a * (3.0 - 2.0 * a);
    float nd = max(dot(N, L / d), 0.0);
    light += lCol[i] * a * (0.3 + 0.7 * nd);
  }
  vec3 c = min(base * light, vec3(1.0));
  c = mix(c, vec3(0.25, 0.65, 1.0), sel * 0.28);
  gl_FragColor = vec4(c, 1.0);
}`;

const STYLE = `
:host{display:block}
.wrap{position:relative;width:100%;height:var(--bh3d-h,70vh);min-height:340px;overflow:hidden;border-radius:var(--ha-card-border-radius,12px);background:var(--bh3d-bg,#14171a);font-family:var(--paper-font-body1_-_font-family,Roboto,sans-serif);color:#e8eaed;user-select:none;-webkit-user-select:none}
.stage{position:absolute;inset:0}
.wrap.editing .stage{right:286px}
canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none;display:block}
.ovl{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.lbl{position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font-size:11px;padding:1px 5px;border-radius:8px;background:rgba(0,0,0,.55);color:#dfe3e8}
.lbl.sel{background:#1e88e5;color:#fff}
.chip{position:absolute;transform:translate(-50%,-130%);white-space:nowrap;font-size:12px;padding:3px 8px;border-radius:12px;background:rgba(38,50,66,.92);border:1px solid #5d7a99;color:#fff;pointer-events:auto;cursor:pointer}
.chip small{opacity:.75;margin-left:4px}
.chip.heating{background:rgba(180,80,10,.92);border-color:#ffab5e}
.chip.off{opacity:.65}
.chip.sel{outline:2px solid #1e88e5}
.tb{position:absolute;left:8px;top:8px;display:flex;gap:6px;flex-wrap:wrap;z-index:3}
.tb button,.btn{background:rgba(30,34,40,.85);color:#e8eaed;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:6px 10px;font-size:13px;cursor:pointer}
.tb button.on{background:#1e88e5;border-color:#1e88e5}
.btn.pri{background:#1e88e5;border-color:#1e88e5}.btn.dan{background:#b3261e;border-color:#b3261e}
.panel{position:absolute;right:8px;top:8px;bottom:8px;width:270px;max-width:calc(100% - 16px);background:rgba(24,27,32,.94);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:10px;overflow:auto;z-index:4;font-size:13px;display:none}
.panel.show{display:block}
.panel h3{margin:2px 0 8px;font-size:14px}.panel h4{margin:12px 0 4px;font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.04em}
.panel label{display:block;margin:8px 0 2px;opacity:.85}
.panel input[type=text],.panel input[type=number],.panel select,.dlg input[type=text],.dlg textarea{width:100%;box-sizing:border-box;background:#0f1114;color:#e8eaed;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:6px}
.panel input[type=range]{width:100%}.panel input[type=color]{width:100%;height:30px;border:none;background:none;padding:0}
.panel .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.panel .row .btn{flex:1 1 auto}
.hint{opacity:.65;font-size:12px;margin-top:6px;line-height:1.35}
.dlg{position:absolute;inset:0;background:rgba(0,0,0,.6);z-index:6;display:none;align-items:center;justify-content:center}
.dlg.show{display:flex}
.dlg .box{background:#1b1e23;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:12px;width:min(440px,calc(100% - 24px));max-height:calc(100% - 24px);display:flex;flex-direction:column;gap:8px}
.dlg .list{overflow:auto;flex:1 1 auto;min-height:120px;max-height:50vh}
.dlg .it{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.07);cursor:pointer;display:flex;justify-content:space-between;gap:8px}
.dlg .it:hover{background:rgba(255,255,255,.06)}.dlg .it small{opacity:.6;display:block}.dlg .it.done{opacity:.35}
.dlg textarea{height:40vh;font-family:monospace;font-size:11px}
.pop{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(24,27,32,.96);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:12px 14px;z-index:5;display:none;min-width:240px;text-align:center}
.pop.show{display:block}.pop .t{font-size:14px;margin-bottom:6px}.pop .big{display:flex;align-items:center;justify-content:center;gap:16px}
.pop .big button{width:46px;height:46px;border-radius:50%;font-size:24px;line-height:1;background:#2a3038;color:#fff;border:1px solid rgba(255,255,255,.25);cursor:pointer}
.pop .tv{font-size:30px;font-weight:500;min-width:90px}.pop .sub{opacity:.75;font-size:12px;margin:4px 0 8px}
.pop .modes{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:8px}
.drawbar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:rgba(24,27,32,.96);border:1px solid #ffc107;border-radius:12px;padding:8px 12px;z-index:5;display:none;font-size:13px;text-align:center}
.drawbar.show{display:block}.drawbar .row{display:flex;gap:6px;justify-content:center;margin-top:6px}
.toast{position:absolute;left:50%;top:12px;transform:translateX(-50%);background:rgba(0,0,0,.8);padding:6px 12px;border-radius:16px;font-size:12px;z-index:7;display:none}
.msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.7;font-size:14px;text-align:center;padding:20px}
@media (max-width:600px){.panel{top:auto;left:8px;right:8px;width:auto;height:44%;}.wrap.editing .stage{right:0;bottom:46%}}
`;

class House3DCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._markers = new Map();   // entity_id -> marker object
    this._rooms = new Map();     // room id -> scene objects
    this._states = {};
    this._edit = false; this._shape = false; this._labels = false;
    this._sel = null;            // {type:'marker'|'room'|'door', id}
    this._pointers = new Map();
  }

  /* ----- Lovelace API ----- */
  setConfig(config) {
    this._config = Object.assign({ height: 'calc(100vh - 130px)', storage_key: 'default', allow_edit: true, ambient: 'auto', background: '#14171a', marker_scale: 1 }, config || {});
  }
  static getStubConfig() { return {}; }
  getCardSize() { return 10; }
  getGridOptions() { return { columns: 'full', rows: 10, min_rows: 6 }; }
  set hass(h) { this._hass = h; if (this._ready) this._syncStates(false); else this._start(); }
  connectedCallback() { this._connected = true; this._buildDom(); this._start(); }
  disconnectedCallback() { this._connected = false; this._dispose(); }

  /* ----- DOM ----- */
  _buildDom() {
    if (this._dom) return;
    const root = this.shadowRoot;
    root.innerHTML = `<style>${STYLE}</style>
      <div class="wrap"><div class="msg">Loading 3D house…</div><div class="stage"><div class="ovl"></div></div>
      <div class="tb"></div><div class="panel"></div><div class="pop"></div><div class="drawbar"></div><div class="dlg"><div class="box"></div></div><div class="toast"></div></div>`;
    const q = (s) => root.querySelector(s);
    this._dom = { wrap: q('.wrap'), stage: q('.stage'), msg: q('.msg'), ovl: q('.ovl'), tb: q('.tb'), panel: q('.panel'), pop: q('.pop'), drawbar: q('.drawbar'), dlg: q('.dlg'), dlgBox: q('.dlg .box'), toast: q('.toast') };
    this._dom.wrap.style.setProperty('--bh3d-h', this._config.height);
    this._dom.wrap.style.setProperty('--bh3d-bg', this._config.background);
  }
  _toast(t) { const el = this._dom.toast; el.textContent = t; el.style.display = 'block'; clearTimeout(this._toastT); this._toastT = setTimeout(() => (el.style.display = 'none'), 2200); }

  /* ----- start / dispose ----- */
  async _start() {
    if (this._starting || this._ready || !this._hass || !this._connected || !this._dom) return;
    this._starting = true;
    try {
      if (!this._layout) await this._loadLayout();
      if (!this._connected) return;
      this._initScene(); this._buildRooms(); this._buildMarkers(); this._renderToolbar();
      this._ready = true; this._dom.msg.style.display = 'none';
      this._syncStates(true);
    } catch (e) {
      console.error('house-3d-card start failed', e); this._dom.msg.textContent = 'house-3d-card failed to start: ' + (e && e.message ? e.message : e);
    } finally { this._starting = false; }
  }
  _dispose() {
    this._ready = false;
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this._renderer) {
      this._scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
      Object.values(this._tex || {}).forEach((t) => t.dispose());
      if (this._planMesh) { this._planMesh.geometry.dispose(); this._planMesh.material.dispose(); this._planMesh = null; }
      this._renderer.dispose(); try { this._renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      this._renderer.domElement.remove(); this._renderer = null;
    }
    this._markers.forEach((m) => m.labelEl && m.labelEl.remove());
    this._markers.clear(); this._rooms.clear(); this._states = {}; this._tex = null;
  }

  /* ----- persistence (HA frontend storage: system-wide if available, else per-user) ----- */
  get _key() { return 'bh3d_' + this._config.storage_key; } // prefix kept stable across versions – layouts survive upgrades
  _defaultLayout() {
    const p = JSON.parse(JSON.stringify(this._config.plan || DEFAULT_PLAN));
    p.markers = p.markers || [];
    (this._config.entities || []).forEach((e) => { const o = typeof e === 'string' ? { entity: e } : e; if (o && o.entity) p.markers.push(o); });
    return p;
  }
  _normalise(l) {
    l.v = 1; l.wallHeight = l.wallHeight || 1.5; l.groundColor = l.groundColor || '#2c3b2f';
    l.rooms = (l.rooms || []).filter((r) => r && Array.isArray(r.poly) && r.poly.length >= 3);
    l.rooms.forEach((r, i) => { r.id = r.id || 'room' + i; r.name = r.name || r.id; r.floor = FLOORS[r.floor] ? r.floor : 'oak'; r.open = r.open || []; r.link = r.link || []; r.areas = r.areas || ''; });
    l.doors = l.doors || []; l.markers = (l.markers || []).filter((m) => m && m.entity);
    if (l.plan && typeof l.plan === 'object') { l.plan = Object.assign({ url: '', width: 10, x: 0, y: 0, rotation: 0, opacity: 0.85, always: false }, l.plan); if (!l.plan.url) l.plan = null; } else l.plan = null;
    l.markers.forEach((m) => {
      m.kind = m.kind || this._kindFor(m.entity);
      if (typeof m.x !== 'number' || typeof m.y !== 'number') { const r = l.rooms.find((rr) => rr.id === m.room) || l.rooms[0]; const c = r ? centroid(r.poly) : [0, 0]; m.x = c[0]; m.y = c[1]; }
      if (typeof m.h !== 'number') m.h = m.kind === 'light' ? 2.0 : m.kind === 'socket' ? 0.3 : 1.1;
      if (typeof m.r !== 'number') m.r = 4.5;
    });
    return l;
  }
  _kindFor(entity) { const d = entity.split('.')[0]; return d === 'light' ? 'light' : d === 'climate' ? 'climate' : 'socket'; }
  async _loadLayout() {
    let val = null;
    try { const r = await this._hass.callWS({ type: 'frontend/get_system_data', key: this._key }); val = r && r.value; } catch (e) { /* older HA: no system store */ }
    if (!val) { try { const r = await this._hass.callWS({ type: 'frontend/get_user_data', key: this._key }); val = r && r.value; } catch (e) { /* ignore */ } }
    this._layout = this._normalise(val && val.rooms ? val : this._defaultLayout());
  }
  async _saveLayout() {
    const value = JSON.parse(JSON.stringify(this._layout));
    try { await this._hass.callWS({ type: 'frontend/set_system_data', key: this._key, value }); return 'all users'; }
    catch (e) { await this._hass.callWS({ type: 'frontend/set_user_data', key: this._key, value }); return 'this user'; }
  }

  /* ----- scene ----- */
  _initScene() {
    const T = THREE, wrap = this._dom.wrap;
    this._renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setClearColor(0x000000, 0);
    const cv = this._renderer.domElement; this._dom.stage.insertBefore(cv, this._dom.ovl);
    this._scene = new T.Scene(); this._camera = new T.PerspectiveCamera(38, 1, 0.1, 400);
    this._gRooms = new T.Group(); this._gMarkers = new T.Group(); this._gHandles = new T.Group(); this._gDraw = new T.Group();
    this._scene.add(this._gRooms, this._gMarkers, this._gHandles, this._gDraw);
    this._ray = new T.Raycaster(); this._uAmbient = { value: 0.6 };
    this._tex = {};
    Object.keys(PATTERN_SIZE).forEach((p) => { const t = new T.CanvasTexture(makePatternCanvas(p)); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; this._tex[p] = t; });
    this._tex.glow = new T.CanvasTexture(makeGlowCanvas());
    this._geo = { bulb: new T.SphereGeometry(0.12, 16, 12), hit: new T.SphereGeometry(0.3, 8, 6), plate: new T.BoxGeometry(0.3, 0.06, 0.3), led: new T.SphereGeometry(0.07, 12, 8), puck: new T.CylinderGeometry(0.14, 0.14, 0.1, 16), ring: new T.RingGeometry(0.16, 0.22, 24), vtx: new T.SphereGeometry(0.16, 10, 8), door: new T.BoxGeometry(0.24, 0.24, 0.24) };
    this._hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    try { this._ambMode = localStorage.getItem('bh3d_amb') || this._config.ambient; } catch (e) { this._ambMode = this._config.ambient; }
    cv.addEventListener('pointerdown', (e) => this._onDown(e)); cv.addEventListener('pointermove', (e) => this._onMove(e));
    cv.addEventListener('pointerup', (e) => this._onUp(e)); cv.addEventListener('pointercancel', (e) => this._onUp(e, true));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this._view.radius = clamp(this._view.radius * (e.deltaY > 0 ? 1.1 : 0.9), 2, 150); this._render(); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this._dom.stage);
    this._resize(true);
  }
  _bounds() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    this._layout.rooms.forEach((r) => r.poly.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
    if (x0 > x1) { x0 = y0 = 0; x1 = y1 = 10; }
    return { x0, y0, x1, y1, w: x1 - x0, d: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  _fitView() {
    const b = this._bounds(), asp = this._camera.aspect || 1, portrait = asp < 0.85;
    const w = portrait ? b.d : b.w, d = portrait ? b.w : b.d, tf = Math.tan((this._camera.fov * Math.PI) / 360);
    const radius = Math.max(w / 2 / (tf * asp), (d * 0.55) / tf) * 1.1;
    return { theta: portrait ? -Math.PI / 2 : 0, phi: 0.72, radius, target: [b.cx, 0, b.cy] };
  }
  _resize(first) {
    if (!this._renderer) return;
    const w = this._dom.stage.clientWidth || 600, h = this._dom.stage.clientHeight || 400;
    this._renderer.setSize(w, h, false); const prev = this._camera.aspect; this._camera.aspect = w / h; this._camera.updateProjectionMatrix();
    if (first || !this._view) this._view = this._layout.view ? JSON.parse(JSON.stringify(this._layout.view)) : this._fitView();
    else if (prev && Math.abs(prev - w / h) > 0.01) this._view.radius = clamp(this._view.radius * clamp(prev / (w / h), 0.4, 2.5), 2, 150); // keep the same width of house in view when the stage changes shape
    this._render();
  }
  _render() { if (this._raf || !this._renderer) return; this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); }); }
  _draw() {
    if (!this._renderer) return;
    const v = this._view, c = this._camera, sp = Math.sin(v.phi);
    c.position.set(v.target[0] + v.radius * sp * Math.sin(v.theta), v.target[1] + v.radius * Math.cos(v.phi), v.target[2] + v.radius * sp * Math.cos(v.theta));
    c.lookAt(v.target[0], v.target[1], v.target[2]);
    const k = clamp(v.radius / 16, 1, 2.4) * this._config.marker_scale;
    this._markers.forEach((m) => m.head.scale.setScalar(k));
    this._gHandles.children.forEach((hd) => hd.scale.setScalar(clamp(v.radius / 18, 1, 2.5)));
    this._renderer.render(this._scene, c);
    this._placeLabels();
  }
  _placeLabels() {
    const w = this._dom.stage.clientWidth, h = this._dom.stage.clientHeight, p = new THREE.Vector3();
    this._markers.forEach((m) => {
      const el = m.labelEl; if (!el) return;
      const show = m.data.kind === 'climate' || this._labels || this._edit;
      if (!show) { el.style.display = 'none'; return; }
      p.set(m.data.x, m.data.h, m.data.y).project(this._camera);
      if (p.z > 1 || p.z < -1) { el.style.display = 'none'; return; }
      el.style.display = 'block'; el.style.left = ((p.x + 1) / 2) * w + 'px'; el.style.top = ((1 - p.y) / 2) * h - 8 + 'px';
    });
  }

  /* ----- rooms: floor + inward-facing single-sided walls (near walls cull away automatically) ----- */
  _roomMaterial(tintHex, pattern, lights) {
    const T = THREE, useMap = pattern && pattern !== 'none';
    return new T.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: T.FrontSide,
      uniforms: Object.assign({
        map: { value: useMap ? this._tex[pattern] : this._tex.plain }, useMap: { value: useMap ? 1 : 0 }, tint: { value: new T.Vector3(...hexToRgb(tintHex)) },
        ambient: this._uAmbient, uvScale: { value: useMap ? 1 / PATTERN_SIZE[pattern] : 1 }, sel: { value: 0 },
      }, lights),
    });
  }
  _newLights() {
    const T = THREE, mk = () => Array.from({ length: MAXL }, () => new T.Vector3());
    return { nL: { value: 0 }, lPos: { value: mk() }, lCol: { value: mk() }, lRad: { value: new Array(MAXL).fill(1) } };
  }
  _buildRooms() {
    const T = THREE, L = this._layout, H = L.wallHeight;
    this._gRooms.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    this._gRooms.clear(); this._rooms.clear();
    // ground
    const b = this._bounds(), gl = this._newLights(), gm = this._roomMaterial(L.groundColor, 'plain', gl);
    if (L.plan) { const pw = L.plan.width, ph = pw / ((this._planTex && this._planTex.url === L.plan.url) ? this._planTex.aspect : 1.5); b.x0 = Math.min(b.x0, L.plan.x); b.y0 = Math.min(b.y0, L.plan.y); b.x1 = Math.max(b.x1, L.plan.x + pw); b.y1 = Math.max(b.y1, L.plan.y + ph); b.w = b.x1 - b.x0; b.d = b.y1 - b.y0; b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; }
    const ground = new T.Mesh(new T.PlaneGeometry(b.w + 16, b.d + 16), gm); ground.rotation.x = -Math.PI / 2; ground.position.set(b.cx, -0.03, b.cy);
    this._gRooms.add(ground); this._ground = { lights: gl, mesh: ground };
    L.rooms.forEach((room) => {
      const lights = this._newLights(), fl = FLOORS[room.floor] || FLOORS.oak;
      // floor
      const contour = room.poly.map((p) => new T.Vector2(p[0], p[1])), tris = T.ShapeUtils.triangulateShape(contour, []);
      const pos = [], nor = [], uv = [], idx = [];
      room.poly.forEach((p) => { pos.push(p[0], 0, p[1]); nor.push(0, 1, 0); uv.push(p[0], p[1]); });
      tris.forEach((t) => idx.push(t[0], t[1], t[2]));
      const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); fg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); fg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); fg.setIndex(idx);
      const fm = this._roomMaterial(room.floorColor || fl.color, fl.pattern, lights); fm.side = T.DoubleSide;
      const floor = new T.Mesh(fg, fm); floor.userData.room = room.id;
      // walls
      const wp = [], wn = [], wu = [], wi = [];
      const quad = (ax, ay, bx, by, y0, y1, nx, ny) => {
        const s = wp.length / 3; wp.push(ax, y0, ay, bx, y0, by, bx, y1, by, ax, y1, ay);
        for (let k = 0; k < 4; k++) wn.push(nx, 0, ny); wu.push(0, y0, 1, y0, 1, y1, 0, y1); wi.push(s, s + 1, s + 2, s, s + 2, s + 3);
      };
      const n = room.poly.length;
      for (let i = 0; i < n; i++) {
        if (room.open.includes(i)) continue;
        let a = room.poly[i], c = room.poly[(i + 1) % n];
        let dx = c[0] - a[0], dy = c[1] - a[1]; const len = Math.hypot(dx, dy); if (len < 0.01) continue;
        let nx = -dy / len, ny = dx / len; const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        if (!pointInPoly(mx + nx * 0.03, my + ny * 0.03, room.poly)) { const t = a; a = c; c = t; dx = -dx; dy = -dy; nx = -nx; ny = -ny; }
        const ux = dx / len, uy = dy / len, gaps = [];
        L.doors.forEach((d) => {
          const t = (d.x - a[0]) * ux + (d.y - a[1]) * uy, perp = Math.abs((d.x - a[0]) * -uy + (d.y - a[1]) * ux);
          if (perp < 0.2 && t > -0.05 && t < len + 0.05) gaps.push([clamp(t - d.w / 2, 0, len), clamp(t + d.w / 2, 0, len)]);
        });
        gaps.sort((g1, g2) => g1[0] - g2[0]);
        let cur = 0; const P = (t) => [a[0] + ux * t, a[1] + uy * t];
        gaps.forEach((g) => {
          if (g[0] > cur + 0.01) { const p0 = P(cur), p1 = P(g[0]); quad(p0[0], p0[1], p1[0], p1[1], 0, H, nx, ny); }
          if (H > 2.1 && g[1] > Math.max(cur, g[0])) { const p0 = P(Math.max(cur, g[0])), p1 = P(g[1]); quad(p0[0], p0[1], p1[0], p1[1], 2.05, H, nx, ny); }
          cur = Math.max(cur, g[1]);
        });
        if (cur < len - 0.01) { const p0 = P(cur), p1 = P(len); quad(p0[0], p0[1], p1[0], p1[1], 0, H, nx, ny); }
      }
      const wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(wp, 3)); wg.setAttribute('normal', new T.Float32BufferAttribute(wn, 3)); wg.setAttribute('uv', new T.Float32BufferAttribute(wu, 2)); wg.setIndex(wi);
      const wm = this._roomMaterial(room.wallColor || DEFAULT_WALL, 'none', lights);
      const wall = new T.Mesh(wg, wm);
      this._gRooms.add(floor, wall);
      this._rooms.set(room.id, { room, floor, wall, lights });
    });
    this._applySelection(); this._buildHandles(); this._buildPlanImage();
  }
  _buildPlanImage() {
    const T = THREE, p = this._layout.plan;
    if (this._planMesh) { this._scene.remove(this._planMesh); this._planMesh.geometry.dispose(); this._planMesh.material.dispose(); this._planMesh = null; }
    if (!p || !p.url) { this._render(); return; }
    const apply = (tex, aspect) => {
      if (!this._scene) return;
      const w = p.width, h = w / aspect, geo = new T.PlaneGeometry(w, h), mat = new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: p.opacity, depthWrite: false });
      const m = new T.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.rotation.z = -(p.rotation || 0) * Math.PI / 180; m.position.set(p.x + w / 2, 0.012, p.y + h / 2); m.renderOrder = 1;
      if (this._planMesh) { this._scene.remove(this._planMesh); }
      this._planMesh = m; this._scene.add(m); this._updatePlanVisibility(); this._render();
    };
    if (this._planTex && this._planTex.url === p.url) { apply(this._planTex.tex, this._planTex.aspect); return; }
    new T.TextureLoader().load(p.url, (tex) => { tex.colorSpace = T.SRGBColorSpace; this._planTex = { url: p.url, tex, aspect: tex.image.width / tex.image.height }; apply(tex, this._planTex.aspect); if (this._ground) { this._buildRooms(); this._updateLighting(); } }, undefined, () => this._toast('Could not load plan image: ' + p.url));
  }
  _updatePlanVisibility() { if (this._planMesh) this._planMesh.visible = !!(this._layout.plan && (this._edit || this._layout.plan.always)); }
  _roomAt(x, y) { const r = this._layout.rooms.find((rr) => pointInPoly(x, y, rr.poly)); return r ? r.id : null; }

  /* ----- markers ----- */
  _buildMarkers() {
    Array.from(this._markers.keys()).forEach((id) => this._removeMarkerObj(id));
    this._layout.markers.forEach((d) => this._addMarkerObj(d));
  }
  _removeMarkerObj(id) {
    const m = this._markers.get(id); if (!m) return;
    this._gMarkers.remove(m.group); m.group.traverse((o) => { if (o.material && o.material !== this._hitMat) o.material.dispose(); });
    if (m.labelEl) m.labelEl.remove(); this._markers.delete(id);
  }
  _addMarkerObj(d) {
    const T = THREE; this._removeMarkerObj(d.entity);
    const group = new T.Group(), head = new T.Group(); group.add(head);
    const m = { data: d, group, head, state: undefined };
    const hit = new T.Mesh(this._geo.hit, this._hitMat); hit.userData.marker = d.entity; head.add(hit); m.hit = hit;
    const halo = new T.Sprite(new T.SpriteMaterial({ map: this._tex.glow, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); halo.visible = false; head.add(halo); m.halo = halo;
    if (d.kind === 'light') {
      m.body = new T.Mesh(this._geo.bulb, new T.MeshBasicMaterial({ color: 0x6b6f76 })); head.add(m.body);
    } else if (d.kind === 'socket') {
      const plate = new T.Mesh(this._geo.plate, new T.MeshBasicMaterial({ color: 0xe6e6e6 })); head.add(plate);
      const rim = new T.Mesh(new T.BoxGeometry(0.34, 0.04, 0.34), new T.MeshBasicMaterial({ color: 0x8a8d91 })); rim.position.y = -0.02; head.add(rim);
      m.body = new T.Mesh(this._geo.led, new T.MeshBasicMaterial({ color: 0x555555 })); m.body.position.y = 0.06; head.add(m.body); halo.position.y = 0.06;
    } else {
      m.body = new T.Mesh(this._geo.puck, new T.MeshBasicMaterial({ color: 0x5d7a99 })); head.add(m.body);
    }
    // floor ring + stem (placement aids)
    m.ring = new T.Mesh(this._geo.ring, new T.MeshBasicMaterial({ color: 0x29b6f6, side: T.DoubleSide, transparent: true, opacity: 0.9 })); m.ring.rotation.x = -Math.PI / 2; group.add(m.ring);
    m.stem = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1, 0)]), new T.LineBasicMaterial({ color: 0x8aa0b4, transparent: true, opacity: 0.6 })); group.add(m.stem);
    const el = document.createElement('div'); el.className = d.kind === 'climate' ? 'chip' : 'lbl'; this._dom.ovl.appendChild(el); m.labelEl = el;
    if (d.kind === 'climate') el.addEventListener('click', (ev) => { ev.stopPropagation(); if (this._edit) this._select({ type: 'marker', id: d.entity }); else this._openClimate(d.entity); });
    this._gMarkers.add(group); this._markers.set(d.entity, m);
    this._poseMarker(m); this._updateMarker(m, true);
    return m;
  }
  _poseMarker(m) {
    const d = m.data; m.group.position.set(d.x, 0, d.y); m.head.position.y = d.h; m.ring.position.y = 0.02; m.stem.scale.y = Math.max(d.h, 0.01);
    m.ring.visible = this._edit; m.stem.visible = this._edit || d.kind === 'climate';
    m.roomId = this._roomAt(d.x, d.y);
  }
  _name(entity) { const s = this._hass && this._hass.states[entity]; return (s && s.attributes.friendly_name) || entity; }
  _lightInfo(m) {
    const s = this._hass.states[m.data.entity]; if (!s || s.state !== 'on') return null;
    const a = s.attributes; let rgb = [1, 0.84, 0.62];
    if (Array.isArray(a.rgb_color)) rgb = a.rgb_color.map((v) => v / 255);
    else if (a.color_temp_kelvin) rgb = kelvinToRgb(a.color_temp_kelvin);
    else if (a.color_temp) rgb = kelvinToRgb(1e6 / a.color_temp);
    const b = typeof a.brightness === 'number' ? clamp(a.brightness / 255, 0.02, 1) : 1;
    return { rgb, b };
  }
  _updateMarker(m, force) {
    const s = this._hass.states[m.data.entity]; if (!force && s === m.state) return false; m.state = s;
    const d = m.data, st = s ? s.state : 'unavailable', dead = !s || st === 'unavailable' || st === 'unknown', el = m.labelEl;
    if (d.kind === 'light') {
      const li = this._lightInfo(m);
      if (li) { m.body.material.color.setRGB(li.rgb[0], li.rgb[1], li.rgb[2]); m.halo.visible = true; m.halo.material.color.setRGB(li.rgb[0], li.rgb[1], li.rgb[2]); m.halo.material.opacity = 0.35 + 0.65 * li.b; m.halo.scale.setScalar(0.7 + 1.1 * li.b); }
      else { m.body.material.color.set(dead ? 0x3a3d42 : 0x70757d); m.halo.visible = false; }
      el.textContent = this._name(d.entity);
    } else if (d.kind === 'socket') {
      const col = dead ? 0x555555 : st === 'on' ? 0x1fe05a : 0xff2b2b;
      m.body.material.color.set(col); m.halo.visible = !dead; m.halo.material.color.set(col); m.halo.material.opacity = st === 'on' ? 0.95 : 0.7; m.halo.scale.setScalar(st === 'on' ? 0.75 : 0.6);
      el.textContent = this._name(d.entity);
    } else {
      const a = (s && s.attributes) || {}, cur = a.current_temperature, tgt = a.temperature, heating = a.hvac_action === 'heating';
      m.body.material.color.set(heating ? 0xff8a2b : dead || st === 'off' ? 0x555b63 : 0x5d7a99);
      el.className = 'chip' + (heating ? ' heating' : '') + (st === 'off' || dead ? ' off' : '') + (this._sel && this._sel.id === d.entity ? ' sel' : '');
      el.innerHTML = `🌡 ${cur != null ? Number(cur).toFixed(1) + '°' : '–'}<small>→ ${tgt != null ? Number(tgt).toFixed(1) + '°' : st}</small>`;
      el.title = this._name(d.entity);
    }
    if (d.kind !== 'climate') el.className = 'lbl' + (this._sel && this._sel.id === d.entity ? ' sel' : '');
    return true;
  }
  _updateLighting() {
    const buckets = new Map(); this._rooms.forEach((_, id) => buckets.set(id, [])); const outside = [];
    this._markers.forEach((m) => {
      if (m.data.kind !== 'light') return; const li = this._lightInfo(m); if (!li) return;
      const I = 0.2 + 1.4 * li.b, entry = { x: m.data.x, y: m.data.h, z: m.data.y, c: li.rgb.map((v) => v * I), r: m.data.r * (0.55 + 0.45 * li.b), I };
      if (!m.roomId || !buckets.has(m.roomId)) { outside.push(entry); return; }
      buckets.get(m.roomId).push(entry);
      (this._rooms.get(m.roomId).room.link || []).forEach((id) => buckets.has(id) && buckets.get(id).push(entry));
    });
    const fill = (u, list) => {
      list.sort((a, b) => b.I - a.I); const n = Math.min(list.length, MAXL); u.nL.value = n;
      for (let i = 0; i < n; i++) { u.lPos.value[i].set(list[i].x, list[i].y, list[i].z); u.lCol.value[i].set(list[i].c[0], list[i].c[1], list[i].c[2]); u.lRad.value[i] = list[i].r; }
    };
    this._rooms.forEach((ro, id) => fill(ro.lights, buckets.get(id)));
    if (this._ground) fill(this._ground.lights, outside);
  }
  _updateAmbient() {
    let a = 0.6; const mode = this._ambMode;
    if (mode === 'day') a = 0.85; else if (mode === 'night') a = 0.3;
    else if (typeof mode === 'number' || !isNaN(parseFloat(mode))) a = clamp(parseFloat(mode), 0.05, 1);
    else { const sun = this._hass.states['sun.sun']; if (sun) { const el = sun.attributes.elevation; a = typeof el === 'number' ? 0.3 + 0.55 * clamp((el + 6) / 16, 0, 1) : sun.state === 'above_horizon' ? 0.85 : 0.3; } }
    this._uAmbient.value = this._edit ? Math.max(a, 0.6) : a; // never edit in the dark
  }
  _syncStates(force) {
    if (!this._ready) return; let changed = force, lights = force;
    this._markers.forEach((m) => { if (this._updateMarker(m, force)) { changed = true; if (m.data.kind === 'light') lights = true; } });
    const sun = this._hass.states['sun.sun']; if (force || sun !== this._sunState) { this._sunState = sun; this._updateAmbient(); changed = true; }
    if (lights) this._updateLighting();
    if (this._climateOpen) this._renderClimate();
    if (changed) this._render();
  }

  /* ----- pointer handling: drag = orbit, pinch/wheel = zoom, two-finger/shift/right-drag = pan ----- */
  _ndc(e) { const r = this._renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  _pick(e, objs) { this._ray.setFromCamera(this._ndc(e), this._camera); const h = this._ray.intersectObjects(objs, false); return h.length ? h[0] : null; }
  _pickMarker(e) { const hits = []; this._markers.forEach((m) => hits.push(m.hit)); const h = this._pick(e, hits); return h ? h.object.userData.marker : null; }
  _planePoint(e, y) { this._ray.setFromCamera(this._ndc(e), this._camera); const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out = new THREE.Vector3(); return this._ray.ray.intersectPlane(pl, out) ? out : null; }
  _onDown(e) {
    const cv = this._renderer.domElement; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 1) {
      this._p0 = { x: e.clientX, y: e.clientY, t: performance.now() }; this._moved = false; this._long = false; this._drag = null;
      if (this._edit) {
        if (this._shape) { const h = this._pick(e, this._gHandles.children); if (h) this._drag = { type: h.object.userData.type, ref: h.object.userData }; }
        if (!this._drag) { const id = this._pickMarker(e); if (id) this._drag = { type: 'marker', id }; }
      }
      clearTimeout(this._longT);
      this._longT = setTimeout(() => { if (!this._moved && this._pointers.size === 1 && !this._edit) { const id = this._pickMarker(e); if (id) { this._long = true; this._moreInfo(id); } } }, 600);
    } else { clearTimeout(this._longT); this._moved = true; this._pinch = null; }
  }
  _onMove(e) {
    const p = this._pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; const v = this._view;
    if (this._pointers.size === 1) {
      if (!this._moved && Math.hypot(e.clientX - this._p0.x, e.clientY - this._p0.y) > 6) { this._moved = true; clearTimeout(this._longT); }
      if (!this._moved) return;
      if (this._drag) this._dragTo(e);
      else if (e.shiftKey || (e.buttons & 2)) this._pan(dx, dy);
      else { v.theta -= dx * 0.008; v.phi = clamp(v.phi - dy * 0.006, 0.02, 1.5); }
      this._render();
    } else if (this._pointers.size === 2) {
      const pts = Array.from(this._pointers.values()), dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      if (this._pinch) { v.radius = clamp(v.radius * (this._pinch.dist / Math.max(dist, 1)), 2, 150); this._pan(mx - this._pinch.mx, my - this._pinch.my); }
      this._pinch = { dist, mx, my }; this._render();
    }
  }
  _pan(dx, dy) {
    const v = this._view, k = v.radius * 0.0016, ct = Math.cos(v.theta), st = Math.sin(v.theta);
    v.target[0] += (-dx * ct - dy * st) * k; v.target[2] += (dx * st - dy * ct) * k;
  }
  _onUp(e, cancelled) {
    const had = this._pointers.size; this._pointers.delete(e.pointerId); clearTimeout(this._longT); this._pinch = null;
    if (had === 1 && !cancelled) {
      if (this._drag && this._moved) { if (this._drag.type === 'marker') { const m = this._markers.get(this._drag.id); if (m) { this._poseMarker(m); this._updateLighting(); } } this._dirty = true; this._render(); }
      else if (!this._moved && !this._long) this._tap(e);
    }
    this._drag = null;
  }
  _dragTo(e) {
    const dr = this._drag;
    if (dr.type === 'marker') {
      const m = this._markers.get(dr.id); if (!m) return; const pt = this._planePoint(e, m.data.h); if (!pt) return;
      m.data.x = snap(pt.x); m.data.y = snap(pt.z); this._poseMarker(m); this._updateLighting();
      if (!this._sel || this._sel.id !== dr.id) this._select({ type: 'marker', id: dr.id });
    } else {
      const pt = this._planePoint(e, dr.type === 'vtx' ? this._layout.wallHeight + 0.05 : 1.0); if (!pt) return; const nx = snap(pt.x), ny = snap(pt.z);
      if (dr.type === 'vtx') dr.ref.refs.forEach(([ri, vi]) => { this._layout.rooms[ri].poly[vi] = [nx, ny]; });
      else if (dr.type === 'door') { const d = this._layout.doors[dr.ref.index]; d.x = nx; d.y = ny; }
      const keep = dr.ref; this._buildRooms(); // handles are rebuilt; keep dragging the same logical handle
      const again = this._gHandles.children.find((hd) => hd.userData.type === keep.type && (keep.type === 'door' ? hd.userData.index === keep.index : Math.abs(hd.position.x - nx) < 1e-6 && Math.abs(hd.position.z - ny) < 1e-6));
      if (again) dr.ref = again.userData;
      this._markers.forEach((m) => (m.roomId = this._roomAt(m.data.x, m.data.y))); this._updateLighting();
    }
  }
  _startDraw() { this._drawing = []; this._sel = null; this._applySelection(); this._renderPanel(); this._renderDrawbar(); }
  _stopDraw() { this._drawing = null; this._gDraw.clear(); this._dom.drawbar.classList.remove('show'); }
  _renderDrawbar() {
    const d = this._drawing, bar = this._dom.drawbar; if (!d) { bar.classList.remove('show'); return; }
    bar.innerHTML = `<div>Drawing room – tap each corner in order (${d.length} so far)</div><div class="row"><button class="btn" data-a="undo">Undo point</button><button class="btn pri" data-a="finish" ${d.length < 3 ? 'disabled' : ''}>Finish room</button><button class="btn" data-a="cancel">Cancel</button></div>`;
    bar.classList.add('show');
    bar.querySelector('[data-a=undo]').addEventListener('click', () => { d.pop(); this._drawPreview(); this._renderDrawbar(); });
    bar.querySelector('[data-a=cancel]').addEventListener('click', () => { this._stopDraw(); this._renderPanel(); this._render(); });
    bar.querySelector('[data-a=finish]').addEventListener('click', () => this._finishDraw());
  }
  _drawPreview() {
    const T = THREE, d = this._drawing; this._gDraw.clear(); if (!d || !d.length) { this._render(); return; }
    const y = 0.03, pts = d.map((p) => new T.Vector3(p[0], y, p[1]));
    if (pts.length > 1) this._gDraw.add(new T.Line(new T.BufferGeometry().setFromPoints(pts.concat(pts.length > 2 ? [pts[0]] : [])), new T.LineBasicMaterial({ color: 0xffc107 })));
    d.forEach((p) => { const m = new T.Mesh(this._geo.vtx, new T.MeshBasicMaterial({ color: 0xffc107 })); m.position.set(p[0], y, p[1]); m.scale.setScalar(0.7); this._gDraw.add(m); });
    this._render();
  }
  _finishDraw() {
    const d = this._drawing; if (!d || d.length < 3) return;
    const id = 'room_' + Date.now().toString(36); this._layout.rooms.push({ id, name: 'New room', areas: '', floor: 'oak', open: [], link: [], poly: d.slice() });
    this._stopDraw(); this._touch(); this._buildRooms(); this._updateLighting(); this._select({ type: 'room', id });
  }
  _tap(e) {
    if (this._drawing) {
      const pt = this._planePoint(e, 0); if (!pt) return; const p = [snap(pt.x), snap(pt.z)];
      const d = this._drawing; if (d.length >= 3 && Math.hypot(p[0] - d[0][0], p[1] - d[0][1]) < 0.3) return this._finishDraw();
      // snap to existing corners so shared walls line up
      let best = null, bd = 0.25; this._layout.rooms.forEach((r) => r.poly.forEach((q) => { const dd = Math.hypot(q[0] - p[0], q[1] - p[1]); if (dd < bd) { bd = dd; best = q; } }));
      d.push(best ? [best[0], best[1]] : p); this._drawPreview(); this._renderDrawbar(); return;
    }
    const id = this._pickMarker(e);
    if (this._edit) {
      if (this._shape) { const h = this._pick(e, this._gHandles.children); if (h && h.object.userData.type === 'door') return this._select({ type: 'door', id: h.object.userData.index }); }
      if (id) return this._select({ type: 'marker', id });
      const floors = []; this._rooms.forEach((r) => floors.push(r.floor)); const h = this._pick(e, floors);
      return this._select(h ? { type: 'room', id: h.object.userData.room } : null);
    }
    if (!id) { this._closeClimate(); return; }
    const m = this._markers.get(id), s = this._hass.states[id];
    if (m.data.kind === 'climate') return this._openClimate(id);
    if (!s || s.state === 'unavailable') return this._toast(this._name(id) + ' is unavailable');
    this._hass.callService('homeassistant', 'toggle', { entity_id: id });
  }
  _moreInfo(id) { this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: id }, bubbles: true, composed: true })); }

  /* ----- climate popup ----- */
  _openClimate(id) { this._climateOpen = id; this._pendingT = null; this._renderClimate(); }
  _closeClimate() { this._climateOpen = null; this._dom.pop.classList.remove('show'); }
  _renderClimate() {
    const id = this._climateOpen, s = this._hass.states[id], pop = this._dom.pop; if (!id) return;
    if (!s) { this._closeClimate(); return; }
    const a = s.attributes, step = a.target_temp_step || 0.5, tgt = this._pendingT != null ? this._pendingT : a.temperature;
    pop.innerHTML = `<div class="t">${esc(this._name(id))}</div>
      <div class="big"><button data-d="-1">−</button><div class="tv">${tgt != null ? Number(tgt).toFixed(1) + '°' : '–'}</div><button data-d="1">+</button></div>
      <div class="sub">target · now ${a.current_temperature != null ? Number(a.current_temperature).toFixed(1) + '°' : '–'} · ${esc(a.hvac_action || s.state)}</div>
      <div class="modes">${(a.hvac_modes || []).map((md) => `<button class="btn ${md === s.state ? 'pri' : ''}" data-m="${esc(md)}">${esc(md)}</button>`).join('')}</div>
      <div class="modes"><button class="btn" data-more>More…</button><button class="btn" data-close>Close</button></div>`;
    pop.classList.add('show');
    pop.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const base = this._pendingT != null ? this._pendingT : (a.temperature != null ? a.temperature : a.current_temperature || 20);
      this._pendingT = clamp(Math.round((base + step * Number(b.dataset.d)) / step) * step, a.min_temp != null ? a.min_temp : 5, a.max_temp != null ? a.max_temp : 35);
      clearTimeout(this._setT); const t = this._pendingT;
      this._setT = setTimeout(() => { this._hass.callService('climate', 'set_temperature', { entity_id: id, temperature: t }); setTimeout(() => { this._pendingT = null; if (this._climateOpen) this._renderClimate(); }, 2500); }, 700);
      this._renderClimate();
    }));
    pop.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => this._hass.callService('climate', 'set_hvac_mode', { entity_id: id, hvac_mode: b.dataset.m })));
    pop.querySelector('[data-more]').addEventListener('click', () => this._moreInfo(id));
    pop.querySelector('[data-close]').addEventListener('click', () => this._closeClimate());
  }

  /* ----- toolbar ----- */
  _renderToolbar() {
    const tb = this._dom.tb, admin = !this._hass.user || this._hass.user.is_admin, amb = { auto: '🌗 Auto', day: '☀️ Day', night: '🌙 Night' };
    const am = amb[this._ambMode] ? this._ambMode : 'auto';
    tb.innerHTML = (this._config.allow_edit && admin ? `<button data-a="edit" class="${this._edit ? 'on' : ''}">✏️ ${this._edit ? 'Editing' : 'Edit'}</button>` : '') +
      `<button data-a="amb">${amb[am]}</button><button data-a="lbl" class="${this._labels ? 'on' : ''}">🏷️</button><button data-a="fit">⟲</button>`;
    tb.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'edit') this._setEdit(!this._edit);
      if (a === 'amb') { const order = ['auto', 'day', 'night']; this._ambMode = order[(order.indexOf(am) + 1) % 3]; try { localStorage.setItem('bh3d_amb', this._ambMode); } catch (e) { /* ignore */ } this._updateAmbient(); }
      if (a === 'lbl') this._labels = !this._labels;
      if (a === 'fit') this._view = this._layout.view ? JSON.parse(JSON.stringify(this._layout.view)) : this._fitView();
      this._renderToolbar(); this._render();
    }));
  }

  /* ----- edit mode ----- */
  async _setEdit(on) {
    if (!on && this._dirty && !confirm('Discard unsaved layout changes?')) return;
    if (!on && this._dirty) { this._layout = null; await this._loadLayout(); this._buildRooms(); this._buildMarkers(); this._syncStates(true); }
    this._edit = on; this._dom.wrap.classList.toggle('editing', on); this._shape = false; this._stopDraw(); this._updatePlanVisibility(); this._dirty = false; this._sel = null; this._closeClimate();
    this._updateAmbient(); this._markers.forEach((m) => this._poseMarker(m)); this._buildHandles(); this._applySelection(); this._renderPanel(); this._renderToolbar(); this._render();
  }
  _select(sel) { this._sel = sel; this._applySelection(); this._renderPanel(); this._render(); }
  _applySelection() {
    this._rooms.forEach((r, id) => { r.floor.material.uniforms.sel.value = this._edit && this._sel && this._sel.type === 'room' && this._sel.id === id ? 1 : 0; });
    this._markers.forEach((m) => { const on = this._sel && this._sel.type === 'marker' && this._sel.id === m.data.entity; m.ring.material.color.set(on ? 0xffc107 : 0x29b6f6); if (m.labelEl) m.labelEl.classList.toggle('sel', !!on); });
  }
  _buildHandles() {
    if (!this._gHandles) return; const T = THREE;
    this._gHandles.children.forEach((c) => c.material.dispose()); this._gHandles.clear();
    if (!this._edit || !this._shape) return;
    const H = this._layout.wallHeight, map = new Map();
    this._layout.rooms.forEach((r, ri) => r.poly.forEach((p, vi) => { const k = p[0].toFixed(2) + ',' + p[1].toFixed(2); if (!map.has(k)) map.set(k, { x: p[0], y: p[1], refs: [] }); map.get(k).refs.push([ri, vi]); }));
    map.forEach((v) => { const h = new T.Mesh(this._geo.vtx, new T.MeshBasicMaterial({ color: 0xffc107 })); h.position.set(v.x, H + 0.05, v.y); h.userData = { type: 'vtx', refs: v.refs }; this._gHandles.add(h); });
    this._layout.doors.forEach((d, index) => { const sel = this._sel && this._sel.type === 'door' && this._sel.id === index; const h = new T.Mesh(this._geo.door, new T.MeshBasicMaterial({ color: sel ? 0xff4081 : 0x00e5ff })); h.position.set(d.x, 1.0, d.y); h.userData = { type: 'door', index }; this._gHandles.add(h); });
  }
  _touch() { this._dirty = true; }
  _renderPanel() {
    const P = this._dom.panel; if (!this._edit) { P.classList.remove('show'); P.innerHTML = ''; return; }
    P.classList.add('show'); const L = this._layout, sel = this._sel; let html = '';
    const footer = `<h4>Layout</h4><div class="row"><button class="btn pri" data-a="save">💾 Save</button><button class="btn" data-a="cancel">Cancel</button></div>`;
    if (sel && sel.type === 'marker' && this._markers.has(sel.id)) {
      const d = this._markers.get(sel.id).data;
      html = `<h3>${esc(this._name(d.entity))}</h3><div class="hint">${esc(d.entity)} · drag it on the plan to move</div>
        <label>Show as</label><select data-f="kind"><option value="light">Light (glows)</option><option value="socket">Socket (red/green LED)</option><option value="climate">Climate</option></select>
        <label>Height above floor: <span data-o="h">${d.h.toFixed(2)}</span> m</label><input type="range" data-f="h" min="0.05" max="2.6" step="0.05" value="${d.h}">
        ${d.kind === 'light' ? `<label>Light reach: <span data-o="r">${d.r.toFixed(1)}</span> m</label><input type="range" data-f="r" min="1" max="10" step="0.25" value="${d.r}">` : ''}
        <div class="row"><button class="btn" data-a="toggle">Test toggle</button><button class="btn dan" data-a="del">Remove</button></div>
        <div class="row"><button class="btn" data-a="back">← Back</button></div>`;
    } else if (sel && sel.type === 'room' && this._rooms.has(sel.id)) {
      const r = this._rooms.get(sel.id).room, fl = FLOORS[r.floor];
      html = `<h3>Room</h3><label>Name</label><input type="text" data-f="name" value="${esc(r.name)}">
        <label>HA areas that belong here (comma separated)</label><input type="text" data-f="areas" value="${esc(r.areas)}">
        <label>Floor</label><select data-f="floor">${Object.keys(FLOORS).map((k) => `<option value="${k}">${esc(FLOORS[k].label)}</option>`).join('')}</select>
        <label>Floor colour</label><input type="color" data-f="floorColor" value="${esc(r.floorColor || fl.color)}">
        <label>Wall colour</label><input type="color" data-f="wallColor" value="${esc(r.wallColor || DEFAULT_WALL)}">
        <div class="row"><button class="btn" data-a="wallAll">Use wall colour in all rooms</button></div>
        <div class="row"><button class="btn" data-a="addhere">➕ Add entity here</button><button class="btn" data-a="back">← Back</button></div>
        ${this._shape ? '<div class="row"><button class="btn dan" data-a="delroom">Delete room</button></div>' : ''}`;
    } else if (sel && sel.type === 'door' && L.doors[sel.id]) {
      const d = L.doors[sel.id];
      html = `<h3>Door / opening</h3><div class="hint">Drag the cyan cube onto any wall line. Both rooms' walls open automatically.</div>
        <label>Width: <span data-o="w">${d.w.toFixed(2)}</span> m</label><input type="range" data-f="w" min="0.5" max="4" step="0.05" value="${d.w}">
        <div class="row"><button class="btn dan" data-a="deldoor">Delete door</button><button class="btn" data-a="back">← Back</button></div>`;
    } else {
      html = `<h3>Edit mode</h3><div class="hint">Tap a marker or a room to edit it. Drag markers to position them. Drag empty space to rotate; pinch / wheel to zoom; two fingers (or shift-drag) to pan.</div>
        <h4>Entities</h4><div class="row"><button class="btn pri" data-a="add">➕ Add entity</button><button class="btn" data-a="auto">⚡ Auto-add by area</button></div>
        <div class="hint">${L.markers.length} placed</div>
        <h4>House</h4><label>Wall height: <span data-o="wh">${L.wallHeight.toFixed(2)}</span> m</label><input type="range" data-f="wh" min="0.2" max="2.6" step="0.05" value="${L.wallHeight}">
        <label>Ground colour</label><input type="color" data-f="ground" value="${esc(L.groundColor)}">
        <div class="row"><button class="btn ${this._shape ? 'pri' : ''}" data-a="shape">📐 Shape mode ${this._shape ? 'ON' : 'off'}</button></div>
        ${this._shape ? `<div class="hint">Yellow balls = wall corners (shared corners move together). Cyan cubes = doors.</div><div class="row"><button class="btn pri" data-a="draw">✏️ Draw room</button><button class="btn" data-a="addroom">➕ Box room</button></div><div class="row"><button class="btn" data-a="adddoor">➕ Door</button><button class="btn" data-a="scale">Scale plan…</button></div>` : ''}
        <h4>Floor-plan image</h4>
        ${L.plan ? `<div class="hint">${esc(L.plan.url)}</div><label>Image width: <span data-o="pw">${L.plan.width.toFixed(1)}</span> m</label><input type="range" data-f="pw" min="2" max="60" step="0.1" value="${L.plan.width}">
        <label>Offset X: <span data-o="px">${L.plan.x.toFixed(1)}</span> m</label><input type="range" data-f="px" min="-30" max="30" step="0.1" value="${L.plan.x}">
        <label>Offset Y: <span data-o="py">${L.plan.y.toFixed(1)}</span> m</label><input type="range" data-f="py" min="-30" max="30" step="0.1" value="${L.plan.y}">
        <label>Rotation: <span data-o="pr">${(L.plan.rotation || 0).toFixed(0)}</span>°</label><input type="range" data-f="pr" min="-180" max="180" step="1" value="${L.plan.rotation || 0}">
        <label>Opacity</label><input type="range" data-f="po" min="0.1" max="1" step="0.05" value="${L.plan.opacity}">
        <label><input type="checkbox" data-f="pa" ${L.plan.always ? 'checked' : ''}> Show image outside edit mode too</label>
        <div class="row"><button class="btn" data-a="planurl">Change image</button><button class="btn dan" data-a="planrm">Remove image</button></div>` : `<div class="hint">Put a plan image in <code>/config/www/</code> and set its URL (e.g. <code>/local/plan.png</code>) – it appears on the ground so you can trace rooms over it with Shape mode → Draw room.</div><div class="row"><button class="btn" data-a="planurl">🖼️ Set plan image</button></div>`}
        <div class="row"><button class="btn" data-a="view">📷 Save this camera angle as default</button></div>
        <div class="row"><button class="btn" data-a="io">Export / import</button><button class="btn dan" data-a="reset">Reset</button></div>`;
    }
    P.innerHTML = html + footer;
    const $ = (s) => P.querySelector(s), on = (s, ev, fn) => { const el = $(s); if (el) el.addEventListener(ev, fn); };
    // field wiring
    if (sel && sel.type === 'marker' && this._markers.has(sel.id)) {
      const m = this._markers.get(sel.id), d = m.data; $('[data-f=kind]').value = d.kind;
      on('[data-f=kind]', 'change', (e) => { d.kind = e.target.value; d.h = d.kind === 'light' ? 2.0 : d.kind === 'socket' ? 0.3 : 1.1; this._addMarkerObj(d); this._touch(); this._updateLighting(); this._select(sel); });
      on('[data-f=h]', 'input', (e) => { d.h = Number(e.target.value); $('[data-o=h]').textContent = d.h.toFixed(2); this._poseMarker(m); this._updateLighting(); this._touch(); this._render(); });
      on('[data-f=r]', 'input', (e) => { d.r = Number(e.target.value); $('[data-o=r]').textContent = d.r.toFixed(1); this._updateLighting(); this._touch(); this._render(); });
      on('[data-a=toggle]', 'click', () => this._hass.callService('homeassistant', 'toggle', { entity_id: d.entity }));
      on('[data-a=del]', 'click', () => { L.markers = L.markers.filter((x) => x !== d); this._removeMarkerObj(d.entity); this._touch(); this._updateLighting(); this._select(null); });
    } else if (sel && sel.type === 'room' && this._rooms.has(sel.id)) {
      const r = this._rooms.get(sel.id).room; $('[data-f=floor]').value = r.floor;
      on('[data-f=name]', 'change', (e) => { r.name = e.target.value; this._touch(); });
      on('[data-f=areas]', 'change', (e) => { r.areas = e.target.value; this._touch(); });
      on('[data-f=floor]', 'change', (e) => { r.floor = e.target.value; delete r.floorColor; this._touch(); this._buildRooms(); this._updateLighting(); this._select(sel); });
      on('[data-f=floorColor]', 'input', (e) => { r.floorColor = e.target.value; this._rooms.get(r.id).floor.material.uniforms.tint.value.set(...hexToRgb(r.floorColor)); this._touch(); this._render(); });
      on('[data-f=wallColor]', 'input', (e) => { r.wallColor = e.target.value; this._rooms.get(r.id).wall.material.uniforms.tint.value.set(...hexToRgb(r.wallColor)); this._touch(); this._render(); });
      on('[data-a=wallAll]', 'click', () => { const c = r.wallColor || DEFAULT_WALL; L.rooms.forEach((x) => (x.wallColor = c)); this._touch(); this._buildRooms(); this._updateLighting(); this._render(); });
      on('[data-a=addhere]', 'click', () => this._openPicker(r.id));
      on('[data-a=delroom]', 'click', () => { if (!confirm('Delete room "' + r.name + '"?')) return; L.rooms = L.rooms.filter((x) => x !== r); this._touch(); this._buildRooms(); this._markers.forEach((m) => this._poseMarker(m)); this._updateLighting(); this._select(null); });
    } else if (sel && sel.type === 'door' && L.doors[sel.id]) {
      const d = L.doors[sel.id];
      on('[data-f=w]', 'input', (e) => { d.w = Number(e.target.value); $('[data-o=w]').textContent = d.w.toFixed(2); this._touch(); this._buildRooms(); this._updateLighting(); this._render(); });
      on('[data-a=deldoor]', 'click', () => { L.doors.splice(sel.id, 1); this._touch(); this._sel = null; this._buildRooms(); this._updateLighting(); this._select(null); });
    } else {
      on('[data-a=add]', 'click', () => this._openPicker(null));
      on('[data-a=auto]', 'click', () => this._autoAdd());
      on('[data-f=wh]', 'input', (e) => { L.wallHeight = Number(e.target.value); $('[data-o=wh]').textContent = L.wallHeight.toFixed(2); this._touch(); this._buildRooms(); this._updateLighting(); this._render(); });
      on('[data-f=ground]', 'input', (e) => { L.groundColor = e.target.value; this._ground.mesh.material.uniforms.tint.value.set(...hexToRgb(L.groundColor)); this._touch(); this._render(); });
      on('[data-a=shape]', 'click', () => { this._shape = !this._shape; this._buildHandles(); this._renderPanel(); this._render(); });
      on('[data-a=adddoor]', 'click', () => { L.doors.push({ x: snap(this._view.target[0]), y: snap(this._view.target[2]), w: 0.85 }); this._touch(); this._buildRooms(); this._select({ type: 'door', id: L.doors.length - 1 }); this._buildHandles(); this._render(); });
      on('[data-a=addroom]', 'click', () => { const x = snap(this._view.target[0]), y = snap(this._view.target[2]), id = 'room_' + Date.now().toString(36); L.rooms.push({ id, name: 'New room', areas: '', floor: 'oak', open: [], link: [], poly: [[x - 1.5, y - 1.5], [x + 1.5, y - 1.5], [x + 1.5, y + 1.5], [x - 1.5, y + 1.5]] }); this._touch(); this._buildRooms(); this._updateLighting(); this._select({ type: 'room', id }); });
      on('[data-a=scale]', 'click', () => { const f = parseFloat(prompt('Multiply every plan dimension by (e.g. 0.9 = 10% smaller):', '1.0')); if (!f || f <= 0 || f === 1) return; L.rooms.forEach((r) => (r.poly = r.poly.map((p) => [snap(p[0] * f), snap(p[1] * f)]))); L.doors.forEach((d) => { d.x = snap(d.x * f); d.y = snap(d.y * f); }); L.markers.forEach((m) => { m.x = snap(m.x * f); m.y = snap(m.y * f); }); this._touch(); this._buildRooms(); this._markers.forEach((m) => this._poseMarker(m)); this._updateLighting(); this._view = this._fitView(); this._render(); });
      on('[data-a=draw]', 'click', () => this._startDraw());
      const pl = () => { this._touch(); this._buildPlanImage(); };
      on('[data-f=pw]', 'input', (e) => { L.plan.width = Number(e.target.value); $('[data-o=pw]').textContent = L.plan.width.toFixed(1); pl(); });
      on('[data-f=px]', 'input', (e) => { L.plan.x = Number(e.target.value); $('[data-o=px]').textContent = L.plan.x.toFixed(1); pl(); });
      on('[data-f=py]', 'input', (e) => { L.plan.y = Number(e.target.value); $('[data-o=py]').textContent = L.plan.y.toFixed(1); pl(); });
      on('[data-f=pr]', 'input', (e) => { L.plan.rotation = Number(e.target.value); $('[data-o=pr]').textContent = L.plan.rotation.toFixed(0); pl(); });
      on('[data-f=po]', 'input', (e) => { L.plan.opacity = Number(e.target.value); pl(); });
      on('[data-f=pa]', 'change', (e) => { L.plan.always = e.target.checked; this._touch(); this._updatePlanVisibility(); this._render(); });
      on('[data-a=planurl]', 'click', () => { const url = prompt('Plan image URL (e.g. /local/plan.png):', L.plan ? L.plan.url : '/local/plan.png'); if (!url) return; const width = parseFloat(prompt('How wide is the whole image in metres? (you can fine-tune with the slider)', L.plan ? L.plan.width : '12')); L.plan = Object.assign({ width: 12, x: 0, y: 0, rotation: 0, opacity: 0.85, always: false }, L.plan || {}, { url: url.trim(), width: width > 0 ? width : (L.plan ? L.plan.width : 12) }); this._touch(); this._buildPlanImage(); this._renderPanel(); });
      on('[data-a=planrm]', 'click', () => { L.plan = null; this._touch(); this._buildPlanImage(); this._renderPanel(); });
      on('[data-a=view]', 'click', () => { L.view = JSON.parse(JSON.stringify(this._view)); this._touch(); this._toast('Camera angle stored – press Save to keep it'); });
      on('[data-a=io]', 'click', () => this._openIO());
      on('[data-a=reset]', 'click', () => { if (!confirm('Reset the plan, colours and ALL placed entities to the built-in defaults? (Takes effect when you press Save.)')) return; this._layout = this._normalise(this._defaultLayout()); this._touch(); this._buildRooms(); this._buildMarkers(); this._syncStates(true); this._view = this._fitView(); this._select(null); });
    }
    on('[data-a=back]', 'click', () => this._select(null));
    on('[data-a=save]', 'click', async () => { try { const where = await this._saveLayout(); this._dirty = false; this._toast('Saved for ' + where); this._setEdit(false); } catch (e) { this._toast('Save failed: ' + (e.message || e.code || e)); } });
    on('[data-a=cancel]', 'click', () => this._setEdit(false));
  }

  /* ----- entity picker / auto add ----- */
  _areaName(entity) {
    const h = this._hass, reg = h.entities && h.entities[entity]; let aid = reg && reg.area_id;
    if (!aid && reg && reg.device_id && h.devices && h.devices[reg.device_id]) aid = h.devices[reg.device_id].area_id;
    return aid && h.areas && h.areas[aid] ? h.areas[aid].name : '';
  }
  _roomForArea(area) { const a = norm(area); if (!a) return null; return this._layout.rooms.find((r) => norm(r.name) === a || String(r.areas).split(',').some((x) => norm(x) === a)) || null; }
  _placeNew(entity, roomId) {
    const L = this._layout, room = L.rooms.find((r) => r.id === roomId), kind = this._kindFor(entity); let x, y;
    if (room) {
      const c = centroid(room.poly), free = (px, py) => pointInPoly(px, py, room.poly) && !L.markers.some((mk) => Math.hypot(mk.x - px, mk.y - py) < 0.4);
      x = c[0]; y = c[1];
      for (let i = 0; i < 80 && !free(x, y); i++) { const ang = i * 2.4, rad = 0.3 + 0.12 * i; x = c[0] + Math.cos(ang) * rad; y = c[1] + Math.sin(ang) * rad; }
      if (!pointInPoly(x, y, room.poly)) { x = c[0]; y = c[1]; }
    } else { x = this._view.target[0]; y = this._view.target[2]; }
    const d = { entity, kind, x: snap(x), y: snap(y), h: kind === 'light' ? 2.0 : kind === 'socket' ? 0.3 : 1.1, r: 4.5 };
    L.markers.push(d); this._addMarkerObj(d); this._touch(); return d;
  }
  _candidates() {
    const h = this._hass; return Object.keys(h.states).filter((id) => /^(light|switch|climate|input_boolean|fan)\./.test(id)).filter((id) => { const reg = h.entities && h.entities[id]; return !(reg && (reg.hidden || reg.entity_category)); }).sort((a, b) => this._name(a).localeCompare(this._name(b)));
  }
  _openPicker(roomId) {
    const box = this._dom.dlgBox, room = roomId && this._layout.rooms.find((r) => r.id === roomId);
    box.innerHTML = `<b>Add entity${room ? ' to ' + esc(room.name) : ''}</b><input type="text" placeholder="Search name, entity id or area…"><div class="list"></div><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn" data-x>Done</button></div>`;
    const inp = box.querySelector('input'), list = box.querySelector('.list'), all = this._candidates();
    const draw = () => {
      const f = norm(inp.value); let n = 0;
      list.innerHTML = all.map((id) => { const area = this._areaName(id), placed = this._markers.has(id); if (f && !norm(id + this._name(id) + area).includes(f)) return ''; if (++n > 150) return ''; return `<div class="it ${placed ? 'done' : ''}" data-id="${esc(id)}"><div>${esc(this._name(id))}<small>${esc(id)}</small></div><small>${esc(area)}${placed ? ' ✓' : ''}</small></div>`; }).join('') || '<div class="hint">No matches</div>';
      list.querySelectorAll('.it').forEach((it) => it.addEventListener('click', () => {
        const id = it.dataset.id; if (this._markers.has(id)) return this._toast('Already placed');
        const target = roomId || (this._roomForArea(this._areaName(id)) || {}).id || null; this._placeNew(id, target);
        const rn = target ? this._layout.rooms.find((r) => r.id === target).name : 'centre of view'; this._toast('Added → ' + rn); this._updateLighting(); this._render(); draw();
      }));
    };
    inp.addEventListener('input', draw); box.querySelector('[data-x]').addEventListener('click', () => { this._dom.dlg.classList.remove('show'); this._renderPanel(); });
    draw(); this._dom.dlg.classList.add('show');
  }
  _autoAdd() {
    let n = 0;
    this._candidates().forEach((id) => {
      if (this._markers.has(id) || !/^(light|climate)\./.test(id)) return; const s = this._hass.states[id];
      if (Array.isArray(s.attributes.entity_id)) return; // skip light groups – they would double the light
      const room = this._roomForArea(this._areaName(id)); if (!room) return; this._placeNew(id, room.id); n++;
    });
    this._updateLighting(); this._renderPanel(); this._render();
    this._toast(n ? `Added ${n} lights / thermostats by area – drag them into position` : 'Nothing new matched – check each room’s "HA areas" field');
  }
  _openIO() {
    const box = this._dom.dlgBox;
    box.innerHTML = `<b>Export / import layout (JSON)</b><div class="hint">Select all + copy to back it up. Paste a saved layout and press Import to restore.</div><textarea spellcheck="false"></textarea><label style="font-size:12px"><input type="checkbox" data-keep checked> Keep my placed entities (import rooms, doors, colours and plan image only)</label><div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn" data-i>Import</button><button class="btn" data-x>Close</button></div>`;
    const ta = box.querySelector('textarea'); ta.value = JSON.stringify(this._layout);
    box.querySelector('[data-x]').addEventListener('click', () => this._dom.dlg.classList.remove('show'));
    box.querySelector('[data-i]').addEventListener('click', () => {
      try { const v = JSON.parse(ta.value); if (!v || !Array.isArray(v.rooms)) throw new Error('no rooms[] in JSON'); const keep = box.querySelector('[data-keep]').checked && this._layout.markers.length; if (keep) v.markers = this._layout.markers; this._layout = this._normalise(v); this._touch(); this._buildRooms(); this._buildMarkers(); this._syncStates(true); this._dom.dlg.classList.remove('show'); this._select(null); this._toast('Imported – press Save to keep it'); }
      catch (e) { this._toast('Import failed: ' + e.message); }
    });
    this._dom.dlg.classList.add('show');
  }
}

if (!customElements.get('house-3d-card')) {
  customElements.define('house-3d-card', House3DCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'house-3d-card', name: 'House 3D Card', description: 'Rotatable 3D house mimic with live lights, sockets and climate.', preview: false, documentationURL: 'https://github.com/markrgriffin/lovelace-house-3d-card' });
  console.info('%c HOUSE-3D-CARD %c v' + VERSION + ' ', 'background:#1e88e5;color:#fff', 'background:#333;color:#fff');
}
