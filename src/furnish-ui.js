/* "Furnish from photos" wizard (admins only). Mixed into the card class; uses this._hass, this._layout, this._dom.
 * Steps: photos -> corners (while the AI runs) -> review -> place. */
import {
  CATALOGUE, TYPES, wallFrame, calibrate, parseAiJson, normaliseReply, buildPrompt, placePhotoItems, mergeShots,
  restoreLightCall, clamp,
} from './furnish-geom.js';

const MAX_PHOTOS = 6, LONG_EDGE = 1568, MARGIN = 0.18;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SVGNS = 'http://www.w3.org/2000/svg';
const HANDLES = [['cl', 'Ceiling left'], ['cr', 'Ceiling right'], ['fr', 'Floor right'], ['fl', 'Floor left']];
const FLOOR_KEY = { wood: 'oak', carpet: 'carpet_beige', tile: 'tile_light' };

export const FURNISH_STYLE = `
.fx{position:absolute;inset:0;z-index:8;background:#121418;display:none;flex-direction:column;font-size:13px}
.fx.show{display:flex}
.fx .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.12)}
.fx .hd b{font-size:15px;flex:1 1 auto}.fx .steps{display:flex;gap:4px;opacity:.8}.fx .steps span{padding:2px 8px;border-radius:10px;background:#252a31;font-size:12px}.fx .steps span.on{background:#1e88e5}
.fx .bd{flex:1 1 auto;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
.fx .ft{display:flex;gap:6px;justify-content:flex-end;align-items:center;padding:8px 10px;border-top:1px solid rgba(255,255,255,.12);flex-wrap:wrap}
.fx .ft .grow{flex:1 1 auto;opacity:.8}
.fx .cols{display:flex;gap:12px;flex-wrap:wrap}.fx .cols>div{flex:1 1 260px;min-width:0}
.fx .card{background:#1b1f25;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px}
.fx .thumbs{display:flex;gap:8px;flex-wrap:wrap}.fx .thumb{width:150px;background:#0f1114;border:1px solid rgba(255,255,255,.15);border-radius:8px;overflow:hidden}
.fx .thumb img{width:100%;height:84px;object-fit:cover;display:block}.fx .thumb div{padding:4px 6px;display:flex;gap:4px;align-items:center;justify-content:space-between}
.fx select,.fx input[type=number],.fx input[type=text]{background:#0f1114;color:#e8eaed;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:5px}
.fx svg.room{width:100%;max-height:220px;touch-action:none}.fx svg.room .edge{stroke:#5d6b7a;stroke-width:7;cursor:pointer;stroke-linecap:round}
.fx svg.room .edge.has{stroke:#2e9d5b}.fx svg.room .edge.on{stroke:#1e88e5}.fx svg.room text{fill:#e8eaed;font-size:11px;pointer-events:none}
.fx .tabs{display:flex;gap:4px;flex-wrap:wrap}.fx .tabs button.on{background:#1e88e5;border-color:#1e88e5}
.fx .stagewrap{position:relative;width:100%;background:#08090b;border-radius:8px;overflow:hidden}
.fx svg.ph{display:block;width:100%;max-height:60vh;touch-action:none;user-select:none}
.fx svg.ph .hdl{cursor:grab}.fx svg.ph .bx{fill:rgba(30,136,229,.12);stroke:#1e88e5;cursor:move}.fx svg.ph .bx.off{stroke:#888;fill:none;stroke-dasharray:6 6}
.fx svg.ph .bx.sel{stroke:#ffc107;fill:rgba(255,193,7,.12)}.fx svg.ph .rz{fill:#ffc107;cursor:nwse-resize}
.fx svg.ph text{font-size:22px;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:4px;pointer-events:none}
.fx .items{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow:auto}
.fx .it{display:grid;grid-template-columns:20px 16px 1fr auto;gap:6px;align-items:center;padding:4px;border-radius:6px;cursor:pointer}
.fx .it:hover{background:rgba(255,255,255,.05)}.fx .it.sel{background:rgba(255,193,7,.15)}.fx .it .sw{width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,.3)}
.fx .it small{opacity:.6}.fx .it.off span{text-decoration:line-through;opacity:.5}
.fx .ed{display:grid;grid-template-columns:auto 1fr;gap:6px 8px;align-items:center;margin-top:8px}
.fx .status{padding:6px 10px;border-radius:8px;background:#1b2633;border:1px solid #2d4a66}.fx .status.err{background:#3a1b1b;border-color:#8a2b2b}.fx .status.ok{background:#1b3324;border-color:#2e6b44}
.fx .spin{display:inline-block;width:12px;height:12px;border:2px solid #9cc7f0;border-top-color:transparent;border-radius:50%;animation:fxs 1s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes fxs{to{transform:rotate(360deg)}}
.fx .sws{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.fx .sws input[type=color]{width:46px;height:28px;border:none;background:none;padding:0}
.fx .pick{cursor:crosshair}.fx .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}.fx h4{font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.04em}
.fx label.btn{display:inline-block}
`;

/* ---------- image helpers ---------- */
async function decode(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* fall through */ } }
  const url = URL.createObjectURL(file);
  try { return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('cannot decode')); im.src = url; }); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
// re-encode as a real JPEG, long edge <= 1568 px (the size the model works at, so its pixel answers line up)
export async function prepPhoto(file) {
  let img; try { img = await decode(file); } catch (e) { throw new Error(`Couldn't read ${file.name || 'that photo'} – use a JPEG, PNG or WebP image`); }
  const sw = img.width, sh = img.height, k = Math.min(1, LONG_EDGE / Math.max(sw, sh)), w = Math.round(sw * k), h = Math.round(sh * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  if (img.close) img.close();
  const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not encode the photo');
  return { blob, w, h, canvas: cv, url: URL.createObjectURL(blob) };
}
function sampleColour(canvas, x, y, r = 7) {
  const g = canvas.getContext('2d'), x0 = clamp(Math.round(x - r), 0, canvas.width - 1), y0 = clamp(Math.round(y - r), 0, canvas.height - 1);
  const w = Math.min(2 * r + 1, canvas.width - x0), h = Math.min(2 * r + 1, canvas.height - y0), d = g.getImageData(x0, y0, w, h).data;
  let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
  const hx = (v) => Math.round(v / n).toString(16).padStart(2, '0'); return '#' + hx(R) + hx(G) + hx(B);
}
const slug = (s) => String(s || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'room';

export const FurnishMixin = {
  /* ----- open / close ----- */
  _openFurnish(roomId) {
    if (!this._isAdmin()) { this._toast('Only administrators can furnish rooms from photos'); return; }
    const room = this._layout.rooms.find((r) => r.id === roomId); if (!room) return;
    if (!this._fx || this._fx.roomId !== roomId) {
      this._furnishCleanup();
      let ent = this._config.ai_task_entity || ''; if (!ent) { try { ent = localStorage.getItem('bh3d_ai') || ''; } catch (e) { /* ignore */ } }
      this._fx = { roomId, step: 'photos', shots: [], edge: null, cur: 0, ceiling: this._layout.ceiling || 2.4, floor: null, ai: { status: 'idle' }, entity: ent, replace: true, applyWalls: true, applyFloor: true, sel: null, draw: false, pick: null };
    }
    this._dom.fx.classList.add('show'); this._fxRender();
  },
  _closeFurnish() { this._fxPhotoMode(false); this._dom.fx.classList.remove('show'); },
  _furnishCleanup() {
    if (this._fx) { this._fxPhotoMode(false); this._fx.shots.forEach((s) => s.url && URL.revokeObjectURL(s.url)); }
    this._fx = null; if (this._dom && this._dom.fx) { this._dom.fx.classList.remove('show'); this._dom.fx.innerHTML = ''; }
  },
  _fxRoom() { return this._layout.rooms.find((r) => r.id === this._fx.roomId); },

  /* ----- photo mode: room lights to neutral white while photographing ----- */
  _fxRoomLights() { const out = []; this._markers.forEach((m) => { if (m.data.kind === 'light' && (m.roomId || this._roomAt(m.data.x, m.data.y)) === this._fx.roomId) out.push(m.data.entity); }); return out; },
  async _fxPhotoMode(on) {
    const fx = this._fx; if (!fx) return;
    if (on && !fx.saved) {
      fx.saved = {}; const ents = this._fxRoomLights();
      for (const e of ents) {
        const s = this._hass.states[e]; fx.saved[e] = s ? JSON.parse(JSON.stringify(s)) : null;
        const modes = (s && s.attributes && s.attributes.supported_color_modes) || [], colour = modes.some((m) => ['color_temp', 'hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m));
        try { await this._hass.callService('light', 'turn_on', Object.assign({ entity_id: e, brightness_pct: 100 }, colour ? { color_temp_kelvin: 4000 } : {})); } catch (err) { /* keep going */ }
      }
      this._toast(ents.length ? `Photo mode: ${ents.length} light${ents.length > 1 ? 's' : ''} set to neutral white` : 'No lights placed in this room yet');
    } else if (!on && fx.saved) {
      const saved = fx.saved; fx.saved = null;
      for (const e of Object.keys(saved)) { const c = restoreLightCall(e, saved[e]); try { await this._hass.callService('light', c.service, c.data); } catch (err) { /* ignore */ } }
    }
    if (this._dom.fx.classList.contains('show')) this._fxRender();
  },

  /* ----- render ----- */
  _fxRender() {
    const fx = this._fx, el = this._dom.fx, room = this._fxRoom(); if (!fx || !room) return;
    const stepNames = [['photos', '1 Photos'], ['corners', '2 Corners'], ['review', '3 Review']];
    el.innerHTML = `<div class="hd"><b>📷 Furnish ${esc(room.name)} from photos</b><div class="steps">${stepNames.map(([k, n]) => `<span class="${fx.step === k ? 'on' : ''}">${n}</span>`).join('')}</div><button class="btn" data-x>✕</button></div><div class="bd"></div><div class="ft"></div>`;
    el.querySelector('[data-x]').addEventListener('click', () => this._closeFurnish());
    const bd = el.querySelector('.bd'), ft = el.querySelector('.ft');
    if (fx.step === 'photos') this._fxPhotos(bd, ft, room);
    else if (fx.step === 'corners') this._fxCorners(bd, ft, room);
    else this._fxReview(bd, ft, room);
  },
  _fxStatus() {
    const a = this._fx.ai;
    if (a.status === 'running') return `<div class="status"><span class="spin"></span>${esc(a.msg || 'Analysing photos…')}</div>`;
    if (a.status === 'error') return `<div class="status err">⚠️ ${esc(a.error)} <button class="btn" data-retry>Retry</button></div>`;
    if (a.status === 'done') return `<div class="status ok">✓ ${a.count} items found${a.rescaled ? ' (positions rescaled)' : ''}</div>`;
    return '';
  },

  /* step 1: photos per wall */
  _fxPhotos(bd, ft, room) {
    const fx = this._fx, ents = Object.keys(this._hass.states).filter((e) => e.startsWith('ai_task.')).sort(), lights = this._fxRoomLights();
    if (fx.edge == null) fx.edge = room.poly.map((_, i) => i).find((i) => !room.open.includes(i));
    const xs = room.poly.map((p) => p[0]), ys = room.poly.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, D = Math.max(...ys) - y0;
    const pad = Math.max(W, D) * 0.18, edges = room.poly.map((_, i) => i).filter((i) => !room.open.includes(i));
    const svgEdges = edges.map((i) => {
      const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length], fr = wallFrame(room.poly, i), n = fx.shots.filter((s) => s.edge === i).length;
      const mx = (a[0] + b[0]) / 2 - fr.normal[0] * pad * 0.45, my = (a[1] + b[1]) / 2 - fr.normal[1] * pad * 0.45;
      return `<line class="edge ${n ? 'has' : ''} ${fx.edge === i ? 'on' : ''}" data-edge="${i}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" vector-effect="non-scaling-stroke"/>
        <text x="${mx}" y="${my}" text-anchor="middle" dominant-baseline="middle" style="font-size:${Math.max(W, D) * 0.055}px">${esc(fr.compass)}${n ? ' 📷' + (n > 1 ? n : '') : ''}</text>`;
    }).join('');
    bd.innerHTML = `
      <div class="cols">
        <div class="card"><b>How to take the photos</b><div class="hint">One photo per wall, taken straight on with the normal 1× camera (not panorama or 0.5×). Stand against the opposite wall and get both corners in if you can – a long wall can have two overlapping photos. Daylight or the main lights on gives the truest colours.</div>
          ${lights.length ? `<div class="row"><button class="btn ${fx.saved ? 'pri' : ''}" data-pm>${fx.saved ? '💡 Photo mode on – restore lights' : '💡 Photo mode: lights to neutral white'}</button></div>` : ''}
          <label style="display:block;margin-top:10px">Ceiling height (m) <input type="number" data-ceil min="1.8" max="6" step="0.05" value="${fx.ceiling}" style="width:80px"></label>
          <label style="display:block;margin-top:8px">AI Task entity <select data-ent><option value="">Preferred (Settings → AI Task)</option>${ents.map((e) => `<option value="${esc(e)}" ${e === fx.entity ? 'selected' : ''}>${esc(this._name(e))}</option>`).join('')}</select></label>
          <div class="hint">Works best with a capable vision model (Claude Sonnet/Opus or similar). Small fast models miss and invent items.</div>
        </div>
        <div class="card"><b>Tap a wall, then add its photo</b>
          <svg class="room" viewBox="${x0 - pad} ${y0 - pad} ${W + 2 * pad} ${D + 2 * pad}"><polygon points="${room.poly.map((p) => p.join(',')).join(' ')}" fill="#1f262e"/>${svgEdges}</svg>
          <div class="tabs">${edges.map((i) => { const fr = wallFrame(room.poly, i), n = fx.shots.filter((s) => s.edge === i).length; return `<button class="btn ${fx.edge === i ? 'on' : ''}" data-wall="${i}">${esc(fr.compass)} · ${fr.len.toFixed(1)} m${n ? ' 📷' : ''}</button>`; }).join('')}</div>
          <div class="row"><label class="btn ${fx.edge == null ? '' : 'pri'}" style="text-align:center;${fx.edge == null || fx.shots.length >= MAX_PHOTOS ? 'opacity:.4;pointer-events:none' : ''}">➕ Add photo${fx.edge != null ? ' of the ' + esc(wallFrame(room.poly, fx.edge).compass) + ' wall' : ''}<input type="file" accept="image/*" multiple data-file style="display:none"></label></div>
        </div>
      </div>
      <div class="thumbs">${fx.shots.map((s, k) => `<div class="thumb"><img src="${s.url}"><div><select data-w="${k}">${edges.map((i) => `<option value="${i}" ${i === s.edge ? 'selected' : ''}>${esc(wallFrame(room.poly, i).compass)}</option>`).join('')}</select><button class="btn" data-rm="${k}">✕</button></div></div>`).join('')}</div>`;
    ft.innerHTML = `<span class="grow">${fx.shots.length ? fx.shots.length + ' photo' + (fx.shots.length > 1 ? 's' : '') : 'No photos yet'}${fx.ai.status === 'done' ? ' · already analysed' : ''}</span>
      ${fx.ai.status === 'done' ? '<button class="btn" data-skip>Corners →</button>' : ''}<button class="btn pri" data-go ${fx.shots.length ? '' : 'disabled'}>${fx.ai.status === 'done' ? 'Analyse again' : 'Analyse photos →'}</button>`;
    bd.querySelectorAll('[data-edge],[data-wall]').forEach((l) => l.addEventListener('click', () => { fx.edge = Number(l.dataset.edge != null ? l.dataset.edge : l.dataset.wall); this._fxRender(); }));
    const fi = bd.querySelector('[data-file]'); if (fi) fi.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - fx.shots.length);
      for (const f of files) {
        try { const p = await prepPhoto(f); fx.shots.push({ edge: fx.edge, url: p.url, blob: p.blob, canvas: p.canvas, w: p.w, h: p.h, corners: null, top: fx.ceiling, items: [], wallColour: null }); }
        catch (err) { this._toast(err.message); }
      }
      const next = edges.find((i) => !fx.shots.some((x) => x.edge === i)); if (next != null) fx.edge = next;
      fx.ai = { status: 'idle' }; this._fxRender();
    });
    bd.querySelectorAll('[data-w]').forEach((s) => s.addEventListener('change', () => { fx.shots[Number(s.dataset.w)].edge = Number(s.value); fx.shots[Number(s.dataset.w)].corners = null; fx.ai = { status: 'idle' }; this._fxRender(); }));
    bd.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { const s = fx.shots.splice(Number(b.dataset.rm), 1)[0]; if (s && s.url) URL.revokeObjectURL(s.url); fx.ai = { status: 'idle' }; this._fxRender(); }));
    const pm = bd.querySelector('[data-pm]'); if (pm) pm.addEventListener('click', () => this._fxPhotoMode(!fx.saved));
    bd.querySelector('[data-ceil]').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v > 1) { fx.ceiling = v; fx.shots.forEach((s) => { s.top = v; }); } });
    bd.querySelector('[data-ent]').addEventListener('change', (e) => { fx.entity = e.target.value; try { localStorage.setItem('bh3d_ai', fx.entity); } catch (err) { /* ignore */ } });
    const go = ft.querySelector('[data-go]'); if (go) go.addEventListener('click', () => { fx.step = 'corners'; fx.cur = 0; this._fxAnalyse(); this._fxRender(); });
    const sk = ft.querySelector('[data-skip]'); if (sk) sk.addEventListener('click', () => { fx.step = 'corners'; this._fxRender(); });
  },

  /* upload + AI (runs while the user taps corners) */
  async _fxUpload(shot, name) {
    if (!this._isAdmin()) throw new Error('Only administrators can upload photos');
    const fd = new FormData(); fd.append('media_content_id', 'media-source://media_source/local'); fd.append('file', new File([shot.blob], name, { type: 'image/jpeg' }));
    const h = this._hass, opts = { method: 'POST', body: fd };
    let resp;
    if (typeof h.fetchWithAuth === 'function') resp = await h.fetchWithAuth('/api/media_source/local_source/upload', opts);
    else resp = await fetch((h.hassUrl ? h.hassUrl('') : '') + '/api/media_source/local_source/upload', Object.assign(opts, { headers: { Authorization: 'Bearer ' + h.auth.data.access_token } }));
    if (resp.status === 401 || resp.status === 403) throw new Error('Home Assistant refused the upload (administrator required)');
    if (resp.status === 413) throw new Error('Photo too large for Home Assistant');
    if (!resp.ok) { let t = ''; try { t = await resp.text(); } catch (e) { /* ignore */ } throw new Error(`Upload failed (${resp.status}) ${t.slice(0, 120)}`); }
    let j = {}; try { j = await resp.json(); } catch (e) { /* ignore */ }
    return j.media_content_id || 'media-source://media_source/local/' + name;
  },
  async _fxAnalyse() {
    const fx = this._fx, room = this._fxRoom(), run = (fx.run || 0) + 1; fx.run = run;
    const set = (a) => { if (this._fx !== fx || fx.run !== run) return; fx.ai = a; this._fxRefreshStatus(); };
    try {
      if (!this._isAdmin()) throw new Error('Only administrators can furnish rooms from photos');
      set({ status: 'running', msg: 'Uploading photos to Home Assistant media…' });
      const counts = {};
      for (const s of fx.shots) {
        const fr = wallFrame(room.poly, s.edge), c = fr.compass.replace('-', ''); counts[c] = (counts[c] || 0) + 1;
        s.media = await this._fxUpload(s, `house3d_${slug(room.id)}_${c}${counts[c]}.jpg`);
      }
      if (!this._isAdmin()) throw new Error('Only administrators can furnish rooms from photos');
      set({ status: 'running', msg: `Asking the AI about ${fx.shots.length} photo${fx.shots.length > 1 ? 's' : ''} – this takes 30–90 s. Tap the corners meanwhile.` });
      const xs = room.poly.map((p) => p[0]), ys = room.poly.map((p) => p[1]);
      const prompt = buildPrompt({ name: room.name, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) }, fx.shots.map((s) => { const fr = wallFrame(room.poly, s.edge); return { compass: fr.compass, len: fr.len, w: s.w, h: s.h }; }), fx.ceiling);
      const call = async (instructions) => {
        const service_data = { task_name: 'house-3d-card furnish from photos', instructions, attachments: fx.shots.map((s) => ({ media_content_id: s.media, media_content_type: 'image/jpeg' })) };
        if (fx.entity) service_data.entity_id = fx.entity;
        const r = await this._hass.callWS({ type: 'call_service', domain: 'ai_task', service: 'generate_data', service_data, return_response: true });
        return r && r.response ? r.response.data : r && r.data;
      };
      let data = await call(prompt), obj;
      try { obj = parseAiJson(data); } catch (e) { data = await call(prompt + '\nYour last reply was not valid JSON. Reply with JSON only.'); obj = parseAiJson(data); }
      if (this._fx !== fx || fx.run !== run) return; // superseded by a newer run
      const norm = normaliseReply(obj, fx.shots.map((s) => ({ w: s.w, h: s.h })), this._config.ai_bbox_format || 'pixels');
      fx.shots.forEach((s, i) => { s.items = norm.photos[i].items; s.wallColour = norm.photos[i].wallColour; });
      fx.floor = norm.floor || { type: 'wood', colour: null };
      set({ status: 'done', count: fx.shots.reduce((n, s) => n + s.items.length, 0), rescaled: norm.rescaled.some(Boolean) });
    } catch (e) {
      const m = (e && (e.message || e.code)) || String(e);
      set({ status: 'error', error: /not found|Unable to find|preferred/i.test(m) ? 'No AI Task entity – pick one on the Photos step or set a preferred one in Settings → AI Task. (' + m + ')' : m });
    }
  },
  _fxRefreshStatus() {
    if (!this._fx || !this._dom.fx.classList.contains('show')) return;
    const st = this._dom.fx.querySelector('[data-status]'); if (st) { st.innerHTML = this._fxStatus(); const r = st.querySelector('[data-retry]'); if (r) r.addEventListener('click', () => this._fxAnalyse()); }
    const nx = this._dom.fx.querySelector('[data-review]'); if (nx) nx.disabled = this._fx.ai.status !== 'done';
  },

  /* a zoomable photo with margins so corners outside the frame can still be placed */
  _fxStage(host, shot) {
    const mx = Math.round(shot.w * MARGIN), my = Math.round(shot.h * MARGIN);
    host.innerHTML = `<div class="stagewrap"><svg class="ph" viewBox="${-mx} ${-my} ${shot.w + 2 * mx} ${shot.h + 2 * my}" preserveAspectRatio="xMidYMid meet"><rect x="${-mx}" y="${-my}" width="${shot.w + 2 * mx}" height="${shot.h + 2 * my}" fill="#08090b"/><image href="${shot.url}" x="0" y="0" width="${shot.w}" height="${shot.h}"/><g class="ov"></g></svg></div>`;
    const svg = host.querySelector('svg'), toImg = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); const q = m ? pt.matrixTransform(m.inverse()) : pt; return [q.x, q.y]; };
    return { svg, ov: svg.querySelector('.ov'), toImg, lim: [-mx, -my, shot.w + mx, shot.h + my], unit: Math.max(shot.w, shot.h) / 100 };
  },
  _fxDefaultCorners(s) { return { cl: [s.w * 0.06, s.h * 0.08], cr: [s.w * 0.94, s.h * 0.08], fr: [s.w * 0.94, s.h * 0.86], fl: [s.w * 0.06, s.h * 0.86] }; },

  /* step 2: corners */
  _fxCorners(bd, ft, room) {
    const fx = this._fx, s = fx.shots[fx.cur]; if (!s) { fx.step = 'photos'; return this._fxRender(); }
    if (!s.corners) s.corners = this._fxDefaultCorners(s);
    s.seen = true; const fr = wallFrame(room.poly, s.edge);
    bd.innerHTML = `<div data-status>${this._fxStatus()}</div>
      <div class="tabs">${fx.shots.map((x, k) => `<button class="btn ${k === fx.cur ? 'on' : ''}" data-tab="${k}">${k + 1}. ${esc(wallFrame(room.poly, x.edge).compass)}${x.seen ? ' ✓' : ''}</button>`).join('')}</div>
      <div class="hint">Drag the four handles onto the corners of the <b>${esc(fr.compass)} wall</b> (${fr.len.toFixed(2)} m): where it meets the floor and the ceiling. If a corner is outside the photo, drag the handle off the picture to where it would be. If the ceiling corners are hidden, put the top handles at any height you know and enter it.</div>
      <div data-stage></div>
      <label>Top handles are <input type="number" data-top min="0.3" max="6" step="0.05" value="${s.top}" style="width:76px"> m above the floor</label>`;
    const st = this._fxStage(bd.querySelector('[data-stage]'), s), u = st.unit;
    const draw = () => {
      const c = s.corners, pts = ['fl', 'fr', 'cr', 'cl'].map((k) => c[k].join(',')).join(' ');
      st.ov.innerHTML = `<polygon points="${pts}" fill="rgba(30,136,229,.12)" stroke="#1e88e5" stroke-width="${u * 0.35}"/>` +
        HANDLES.map(([k, lab]) => `<g class="hdl" data-h="${k}"><circle cx="${c[k][0]}" cy="${c[k][1]}" r="${u * 2.2}" fill="rgba(255,193,7,.25)" stroke="#ffc107" stroke-width="${u * 0.4}"/><circle cx="${c[k][0]}" cy="${c[k][1]}" r="${u * 0.45}" fill="#ffc107"/><text x="${c[k][0] + u * 2.6}" y="${c[k][1] + (k[0] === 'c' ? u * 4 : -u * 2.6)}" style="font-size:${u * 2.4}px">${lab}</text></g>`).join('');
    };
    draw();
    let drag = null;
    st.svg.addEventListener('pointerdown', (e) => { const g = e.target.closest('[data-h]'); if (!g) return; drag = g.dataset.h; try { st.svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault(); });
    st.svg.addEventListener('pointermove', (e) => { if (!drag) return; const p = st.toImg(e); s.corners[drag] = [clamp(p[0], st.lim[0], st.lim[2]), clamp(p[1], st.lim[1], st.lim[3])]; draw(); });
    const up = () => { drag = null; }; st.svg.addEventListener('pointerup', up); st.svg.addEventListener('pointercancel', up);
    bd.querySelector('[data-top]').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (v > 0) s.top = v; });
    bd.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { fx.cur = Number(b.dataset.tab); this._fxRender(); }));
    const rt = bd.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', () => this._fxAnalyse());
    const allSeen = fx.shots.every((x) => x.seen);
    ft.innerHTML = `<button class="btn" data-back>← Photos</button><span class="grow">${allSeen ? 'All corners set' : `Photo ${fx.cur + 1} of ${fx.shots.length}`}</span>
      ${fx.cur < fx.shots.length - 1 ? '<button class="btn" data-next>Next photo →</button>' : ''}<button class="btn pri" data-review ${fx.ai.status === 'done' ? '' : 'disabled'}>Review items →</button>`;
    ft.querySelector('[data-back]').addEventListener('click', () => { fx.step = 'photos'; this._fxRender(); });
    const nx = ft.querySelector('[data-next]'); if (nx) nx.addEventListener('click', () => { fx.cur++; this._fxRender(); });
    ft.querySelector('[data-review]').addEventListener('click', () => {
      const miss = fx.shots.findIndex((x) => !x.seen); if (miss >= 0) { fx.cur = miss; this._toast('Check the corners on this photo first'); return this._fxRender(); }
      fx.step = 'review'; fx.cur = 0; fx.sel = null; this._fxRender();
    });
  },

  /* step 3: review boxes on each photo */
  _fxReview(bd, ft, room) {
    const fx = this._fx, s = fx.shots[fx.cur], fr = wallFrame(room.poly, s.edge);
    if (!s.wallColour) s.wallColour = '#e9e4da';
    const links = new Map(); fx.shots.forEach((x, si) => x.items.forEach((it) => { if (it.link) { if (!links.has(it.link)) links.set(it.link, []); links.get(it.link).push(si + 1); } }));
    const sel = s.items.find((it) => it.key === fx.sel);
    bd.innerHTML = `<div class="tabs">${fx.shots.map((x, k) => `<button class="btn ${k === fx.cur ? 'on' : ''}" data-tab="${k}">${k + 1}. ${esc(wallFrame(room.poly, x.edge).compass)} (${x.items.filter((i) => i.keep).length})</button>`).join('')}</div>
      <div class="cols"><div style="flex:2 1 420px"><div data-stage class="${fx.pick ? 'pick' : ''}"></div>
        <div class="row" style="margin-top:6px"><button class="btn ${fx.draw ? 'pri' : ''}" data-draw>${fx.draw ? 'Drag on the photo to draw…' : '✏️ Draw a missed item'}</button>
        <span class="hint">${fx.pick ? 'Tap the photo to pick the colour' : 'Drag a box to move it, its corner to resize. Untick anything the AI invented.'}</span></div></div>
        <div class="card" style="flex:1 1 260px"><b>Items on the ${esc(fr.compass)} wall</b>
          <div class="items">${s.items.map((it) => `<div class="it ${it.keep ? '' : 'off'} ${it.key === fx.sel ? 'sel' : ''}" data-it="${it.key}"><input type="checkbox" data-keep="${it.key}" ${it.keep ? 'checked' : ''}><div class="sw" style="background:${esc(it.colour)}"></div><span>${esc(it.label)} <small>${esc(CATALOGUE[it.type].label)}${it.link && links.get(it.link) && links.get(it.link).length > 1 ? ' · also in photo ' + links.get(it.link).filter((n) => n !== fx.cur + 1).join(', ') : ''}</small></span><small>${Math.round(it.confidence * 100)}%</small></div>`).join('') || '<div class="hint">Nothing found on this photo.</div>'}</div>
          ${sel ? `<div class="ed"><span>Type</span><select data-e="type">${TYPES.map((t) => `<option value="${t}" ${t === sel.type ? 'selected' : ''}>${esc(CATALOGUE[t].label)}</option>`).join('')}</select>
            <span>Name</span><input type="text" data-e="label" value="${esc(sel.label)}">
            <span>Colour</span><div class="sws"><input type="color" data-e="colour" value="${esc(sel.colour)}"><button class="btn" data-pick="item">Pick from photo</button></div>
            <span>Same object as</span><input type="text" data-e="link" placeholder="link id, e.g. obj-3" value="${esc(sel.link || '')}">
            <span></span><button class="btn dan" data-del>Delete box</button></div>` : '<div class="hint">Tap an item to edit it.</div>'}
          <h4 style="margin:12px 0 4px">Colours</h4>
          <div class="sws"><span>Wall</span><input type="color" data-wc value="${esc(s.wallColour)}"><button class="btn" data-pick="wall">Pick</button><label><input type="checkbox" data-aw ${fx.applyWalls ? 'checked' : ''}> apply</label></div>
          <div class="sws" style="margin-top:6px"><span>Floor</span><select data-ft>${['wood', 'carpet', 'tile'].map((t) => `<option ${fx.floor && fx.floor.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select><input type="color" data-fc value="${esc((fx.floor && fx.floor.colour) || '#c9974f')}"><button class="btn" data-pick="floor">Pick</button><label><input type="checkbox" data-af ${fx.applyFloor ? 'checked' : ''}> apply</label></div>
          <div class="hint">Colours picked from night photos come out warm – check them.</div>
        </div></div>`;
    const st = this._fxStage(bd.querySelector('[data-stage]'), s), u = st.unit;
    const draw = () => {
      st.ov.innerHTML = s.items.map((it) => { const [x0, y0, x1, y1] = it.bbox; return `<g data-b="${it.key}"><rect class="bx ${it.keep ? '' : 'off'} ${it.key === fx.sel ? 'sel' : ''}" x="${x0}" y="${y0}" width="${Math.max(1, x1 - x0)}" height="${Math.max(1, y1 - y0)}" stroke-width="${u * 0.35}"/>${it.keep ? `<text x="${x0 + u}" y="${y0 + u * 3}" style="font-size:${u * 2.2}px">${esc(it.label)}</text>` : ''}${it.key === fx.sel ? `<rect class="rz" data-rz="${it.key}" x="${x1 - u * 1.4}" y="${y1 - u * 1.4}" width="${u * 2.8}" height="${u * 2.8}"/>` : ''}</g>`; }).join('');
    };
    draw();
    let act = null;
    st.svg.addEventListener('pointerdown', (e) => {
      const p = st.toImg(e);
      if (fx.pick) {
        const col = sampleColour(s.canvas, clamp(p[0], 0, s.w - 1), clamp(p[1], 0, s.h - 1));
        if (fx.pick === 'wall') s.wallColour = col; else if (fx.pick === 'floor') fx.floor = Object.assign(fx.floor || { type: 'wood' }, { colour: col }); else if (sel) sel.colour = col;
        fx.pick = null; return this._fxRender();
      }
      if (fx.draw) { const it = { key: 'u' + Date.now().toString(36), type: 'other', label: 'New item', place: 'free', bbox: [p[0], p[1], p[0], p[1]], colour: '#9a9a9a', partial: false, confidence: 1, link: null, keep: true }; s.items.push(it); fx.sel = it.key; act = { mode: 'rz', it, p }; }
      else {
        const rz = e.target.closest('[data-rz]'), b = e.target.closest('[data-b]');
        const it = rz ? s.items.find((x) => x.key === rz.dataset.rz) : b ? s.items.find((x) => x.key === b.dataset.b) : null;
        if (!it) return; if (fx.sel !== it.key) { fx.sel = it.key; act = { mode: 'sel', it, p, b0: it.bbox.slice() }; } else act = { mode: rz ? 'rz' : 'mv', it, p, b0: it.bbox.slice() };
      }
      try { st.svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault();
    });
    st.svg.addEventListener('pointermove', (e) => {
      if (!act) return; const p = st.toImg(e), it = act.it;
      if (act.mode === 'mv' || act.mode === 'sel') { const dx = p[0] - act.p[0], dy = p[1] - act.p[1]; if (act.mode === 'sel' && Math.hypot(dx, dy) < u) return; act.mode = 'mv'; it.bbox = [act.b0[0] + dx, act.b0[1] + dy, act.b0[2] + dx, act.b0[3] + dy]; }
      else { it.bbox[2] = clamp(p[0], it.bbox[0] + 2, s.w); it.bbox[3] = clamp(p[1], it.bbox[1] + 2, s.h); }
      draw();
    });
    const up = () => { if (!act) return; const it = act.it; it.bbox = [clamp(Math.min(it.bbox[0], it.bbox[2]), 0, s.w), clamp(Math.min(it.bbox[1], it.bbox[3]), 0, s.h), clamp(Math.max(it.bbox[0], it.bbox[2]), 0, s.w), clamp(Math.max(it.bbox[1], it.bbox[3]), 0, s.h)]; if (act.mode === 'rz' && fx.draw) { fx.draw = false; if (it.bbox[2] - it.bbox[0] < 6 || it.bbox[3] - it.bbox[1] < 6) { s.items = s.items.filter((x) => x !== it); fx.sel = null; } } act = null; this._fxRender(); };
    st.svg.addEventListener('pointerup', up); st.svg.addEventListener('pointercancel', up);
    bd.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { fx.cur = Number(b.dataset.tab); fx.sel = null; fx.pick = null; this._fxRender(); }));
    bd.querySelectorAll('[data-it]').forEach((r) => r.addEventListener('click', (e) => { if (e.target.matches('input')) return; fx.sel = r.dataset.it; this._fxRender(); }));
    bd.querySelectorAll('[data-keep]').forEach((c) => c.addEventListener('change', () => { const it = s.items.find((x) => x.key === c.dataset.keep); it.keep = c.checked; this._fxRender(); }));
    bd.querySelector('[data-draw]').addEventListener('click', () => { fx.draw = !fx.draw; fx.pick = null; this._fxRender(); });
    bd.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { fx.pick = b.dataset.pick; fx.draw = false; this._fxRender(); }));
    if (sel) {
      const E = (k) => bd.querySelector(`[data-e=${k}]`);
      E('type').addEventListener('change', (e) => { const was = CATALOGUE[sel.type]; sel.type = e.target.value; sel.place = CATALOGUE[sel.type].place; if (sel.label === was.label || sel.label === 'New item') sel.label = CATALOGUE[sel.type].label; ['w_m', 'd_m', 'h_m'].forEach((k) => delete sel[k]); this._fxRender(); });
      E('label').addEventListener('change', (e) => { sel.label = e.target.value; this._fxRender(); });
      E('colour').addEventListener('input', (e) => { sel.colour = e.target.value; });
      E('link').addEventListener('change', (e) => { sel.link = e.target.value.trim() || null; this._fxRender(); });
      bd.querySelector('[data-del]').addEventListener('click', () => { s.items = s.items.filter((x) => x !== sel); fx.sel = null; this._fxRender(); });
    }
    bd.querySelector('[data-wc]').addEventListener('input', (e) => { s.wallColour = e.target.value; });
    bd.querySelector('[data-fc]').addEventListener('input', (e) => { fx.floor = Object.assign(fx.floor || { type: 'wood' }, { colour: e.target.value }); });
    bd.querySelector('[data-ft]').addEventListener('change', (e) => { fx.floor = Object.assign(fx.floor || {}, { type: e.target.value }); });
    bd.querySelector('[data-aw]').addEventListener('change', (e) => { fx.applyWalls = e.target.checked; });
    bd.querySelector('[data-af]').addEventListener('change', (e) => { fx.applyFloor = e.target.checked; });
    const n = fx.shots.reduce((k, x) => k + x.items.filter((i) => i.keep).length, 0), old = (this._layout.furniture || []).filter((f) => f.source === 'photo' && (this._roomAt(f.x, f.y) || f.room) === room.id).length;
    ft.innerHTML = `<button class="btn" data-back>← Corners</button><span class="grow">${old ? `<label><input type="checkbox" data-rep ${fx.replace ? 'checked' : ''}> Replace the ${old} items placed from photos before (keeps ones you added by hand)</label>` : ''}</span><button class="btn pri" data-place ${n ? '' : 'disabled'}>Place ${n} items in ${esc(room.name)}</button>`;
    ft.querySelector('[data-back]').addEventListener('click', () => { fx.step = 'corners'; this._fxRender(); });
    const rp = ft.querySelector('[data-rep]'); if (rp) rp.addEventListener('change', (e) => { fx.replace = e.target.checked; });
    ft.querySelector('[data-place]').addEventListener('click', () => this._fxPlace());
  },

  /* turn the reviewed boxes into furniture in the layout (not saved until the user presses Save) */
  _fxPlace() {
    const fx = this._fx, room = this._fxRoom(), L = this._layout;
    let furn;
    try {
      const shots = fx.shots.map((s) => {
        const fr = wallFrame(room.poly, s.edge), cam = calibrate(s.corners, s.w, s.h, fr.len, s.top);
        s.items.forEach((it) => { it.place = CATALOGUE[it.type].place; });
        return { fr, items: s.items, placements: placePhotoItems(s.items, cam, fr, fx.ceiling), ceiling: fx.ceiling };
      });
      furn = mergeShots(shots, { id: room.id, poly: room.poly });
    } catch (e) { this._toast('Could not place items: ' + (e.message || e)); return; }
    if (fx.replace) {
      const gone = L.furniture.filter((f) => f.source === 'photo' && (this._roomAt(f.x, f.y) || f.room) === room.id);
      gone.forEach((f) => this._dropFurn(f.id)); L.furniture = L.furniture.filter((f) => !gone.includes(f));
    }
    L.furniture.push(...furn);
    if (fx.applyWalls) fx.shots.forEach((s) => { if (s.wallColour) room.edgeColors[s.edge] = s.wallColour; });
    if (fx.applyFloor && fx.floor) { room.floor = FLOOR_KEY[fx.floor.type] || 'oak'; if (fx.floor.colour) room.floorColor = fx.floor.colour; }
    L.ceiling = fx.ceiling;
    this._touch(); this._buildRooms(); this._updateLighting(); this._closeFurnish(); this._select({ type: 'room', id: room.id });
    this._toast(`Placed ${furn.length} items – drag to fine-tune, then 💾 Save`);
  },
};
