// charm mockup: upload screen recordings (or images), put them on one or more 3D iPhones, move the camera, export MP4 or PNG.
import * as V from './scene.js';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), D2R = Math.PI / 180;
const GRAD = 'vendor/gradient.webp';

/* ------------------------------------------------------------------ presets */
const P = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => ({ x, y, z, rx, ry, rz, s });
const LAYOUTS = [
  { id: 'single', name: 'Single', fit: 1, phones: [P()] },
  { id: 'pair', name: 'Pair', fit: 0.78, phones: [P(-2.5, 0, -0.6, 0, 0.22), P(2.5, 0, -0.6, 0, -0.22)] },
  { id: 'fan3', name: 'Fan of 3', fit: 0.64, phones: [P(-4.9, 0, -1.7, 0, 0.52), P(), P(4.9, 0, -1.7, 0, -0.52)] },
  { id: 'fan5', name: 'Fan of 5', fit: 0.48, phones: [P(-9, 0, -4.2, 0, 0.8), P(-4.75, 0, -1.3, 0, 0.42), P(), P(4.75, 0, -1.3, 0, -0.42), P(9, 0, -4.2, 0, -0.8)] },
  { id: 'row', name: 'Staggered', fit: 0.46, phones: [P(-9.2, 0.9), P(-4.6, -0.9), P(0, 0.9), P(4.6, -0.9), P(9.2, 0.9)] },
  { id: 'stack', name: 'Depth', fit: 0.7, pairs: false, sel: 0, phones: [P(-2.9, 0, 0, 0, 0.38), P(0.2, 0, -3.6, 0, 0.38), P(3.3, 0, -7.2, 0, 0.38)] },
];
// camera moves; keys at u = 0..1 of the clip, stretched to its length
const SEQS = [
  { id: 'still', name: 'Still', desc: 'Front on, no movement', keys: [{ u: 0, ry: 0, rx: 0.02, dist: 22.5, camY: 0.4, tY: -0.25 }, { u: 1, ry: 0, rx: 0.02, dist: 22.5, camY: 0.4, tY: -0.25 }] },
  { id: 'float', name: 'Float', desc: 'Straight on with a gentle float', keys: Array.from({ length: 7 }, (_, k) => ({ u: k / 6, ry: Math.sin(k * 1.1) * 0.07, rx: 0.02 + Math.cos(k * 0.9) * 0.025, dist: 22.5, camY: 0.4, tY: -0.25, py: Math.sin(k * 1.3) * 0.12 })) },
  { id: 'orbit', name: 'Hero orbit', desc: 'Slow three-quarter orbit', keys: [{ u: 0, ry: -0.62, rx: 0.08, dist: 24, camY: 1.2, tY: -0.25 }, { u: 0.5, ry: 0, rx: 0.02, dist: 21.5, camY: 0.5, tY: -0.25 }, { u: 1, ry: 0.58, rx: 0.07, dist: 23, camY: 1.0, tY: -0.25 }] },
  { id: 'push', name: 'Slow push', desc: 'Starts wide, glides in close', keys: [{ u: 0, ry: 0.22, rx: 0.05, dist: 31, camY: 1.8, tY: -0.3 }, { u: 1, ry: 0.04, rx: 0.02, dist: 14.5, camY: 1.4, tY: 1.0 }] },
  { id: 'arc', name: 'Rising arc', desc: 'Low left to high right', keys: [{ u: 0, ry: -0.55, rx: -0.1, dist: 21, camY: -4.5, tY: 0.4, fov: 28 }, { u: 0.5, ry: 0, rx: 0.02, dist: 20, camY: 0.6, tY: -0.1, fov: 27 }, { u: 1, ry: 0.5, rx: 0.2, dist: 21, camY: 6, tY: -0.5, fov: 26 }] },
  { id: 'low', name: 'Low angle', desc: 'Dramatic low camera, slow push', keys: [{ u: 0, ry: 0.55, rx: -0.2, rz: 0.08, dist: 20, camY: -5.2, tY: 0.6, fov: 30 }, { u: 1, ry: 0.18, rx: -0.12, rz: 0.04, dist: 16.5, camY: -3.6, tY: 0.5, fov: 30 }] },
  { id: 'rise', name: 'Tilt up', desc: 'Rises from lying flat to upright', keys: [{ u: 0, rx: -1.25, ry: 0.15, rz: 0.1, dist: 23, camY: 4, tY: -0.6 }, { u: 0.22, rx: 0.04, ry: 0.08, dist: 21.5, camY: 0.7, tY: -0.25 }, { u: 1, rx: 0.05, ry: -0.22, dist: 21, camY: 0.9, tY: -0.25 }] },
  { id: 'reveal', name: 'Spin reveal', desc: 'Starts on the back, turns to face you', keys: [{ u: 0, ry: Math.PI + 0.5, rx: 0.1, dist: 24, camY: 1.6, tY: -0.3 }, { u: 0.16, ry: 0.9, rx: 0.06, dist: 22.5, camY: 1, tY: -0.3 }, { u: 0.28, ry: 0.12, rx: 0.02, dist: 21.5, camY: 0.6, tY: -0.3 }, { u: 1, ry: -0.08, rx: 0.03, dist: 21, camY: 0.6, tY: -0.3 }] },
  { id: 'over', name: 'Overhead tilt', desc: 'High camera, phone turns beneath', keys: [{ u: 0, ry: -0.25, rx: 0.55, rz: -0.18, dist: 19, camY: 9.5, tY: -0.4, fov: 28 }, { u: 1, ry: 0.2, rx: 0.42, rz: 0.12, dist: 18, camY: 8, tY: -0.4, fov: 28 }] },
  { id: 'turn', name: 'Turntable', desc: 'One full turn', keys: Array.from({ length: 9 }, (_, k) => ({ u: k / 8, ry: -0.3 + Math.PI * 2 * k / 8, rx: 0.05, dist: 23.5, camY: 1, tY: -0.3 })) },
];
const ANGLES = [
  { id: 'front', name: 'Front', pose: { rx: 0, ry: 0, rz: 0, dist: 21.5, camY: 0, tY: 0 } },
  { id: 'close', name: 'Close up', pose: { rx: 0, ry: 0, rz: 0, dist: 11, camY: 1.6, tY: 1.6 } },
  { id: 'q-left', name: 'Three quarter left', pose: { rx: 0.04, ry: 0.45, rz: 0, dist: 22, camY: 0.8, tY: -0.1 } },
  { id: 'q-right', name: 'Three quarter right', pose: { rx: 0.04, ry: -0.45, rz: 0, dist: 22, camY: 0.8, tY: -0.1 } },
  { id: 'hero', name: 'Low hero', pose: { rx: -0.15, ry: 0.35, rz: 0.06, dist: 19, camY: -5, tY: 0.5, fov: 30 } },
  { id: 'over', name: 'Overhead', pose: { rx: 0.5, ry: -0.2, rz: -0.15, dist: 19, camY: 9, tY: -0.4, fov: 28 } },
  { id: 'float', name: 'Floating tilt', pose: { rx: 0.25, ry: -0.3, rz: 0.12, dist: 22, camY: 2.5, tY: 0 } },
  { id: 'side', name: 'Side profile', pose: { rx: 0.02, ry: 1.2, rz: 0, dist: 22, camY: 0.5, tY: 0 } },
];
const LIGHTS = [
  { id: 'studio', name: 'Studio', c: ['#f4f4f2', '#d9d9d6'], v: { lightAz: 35, lightEl: 45, lightAmt: 100, warmth: 50, shadow: 55, glare: 45 } },
  { id: 'soft', name: 'Softbox', c: ['#ffffff', '#ececea'], v: { lightAz: 0, lightEl: 62, lightAmt: 85, warmth: 52, shadow: 32, glare: 28 } },
  { id: 'golden', name: 'Golden hour', c: ['#ffd9a8', '#e8925a'], v: { lightAz: 72, lightEl: 16, lightAmt: 115, warmth: 88, shadow: 72, glare: 62 } },
  { id: 'dramatic', name: 'Dramatic', c: ['#9a9a9a', '#1e1e1e'], v: { lightAz: -78, lightEl: 24, lightAmt: 125, warmth: 44, shadow: 88, glare: 72 } },
  { id: 'daylight', name: 'Daylight', c: ['#e6f0ff', '#a9c4ea'], v: { lightAz: -32, lightEl: 55, lightAmt: 105, warmth: 24, shadow: 45, glare: 40 } },
];
const BGS = [['#ffffff', 'White'], ['#f4f3ef', 'Warm grey'], ['#111214', 'Black'], [GRAD, 'Blue gradient']];
const FORMATS = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const PFORMATS = { fit: null, '1:1': 1, '4:5': 0.8, '9:16': 9 / 16, '16:9': 16 / 9 };
const POSE = [['ry', 'Turn', -90, 90, 1, 'deg'], ['rx', 'Tilt', -45, 45, 1, 'deg'], ['rz', 'Roll', -45, 45, 1, 'deg'], ['x', 'Across', -14, 14, 0.1, 'cm'], ['y', 'Up and down', -8, 8, 0.1, 'cm'], ['z', 'Depth', -14, 6, 0.1, 'cm'], ['s', 'Size', 0.5, 1.5, 0.01, 'pct']];
const POSEFMT = { deg: v => Math.round(v) + '°', cm: v => (v > 0.04 ? '+' : '') + (v * 1.685).toFixed(1) + ' cm', pct: v => Math.round(v * 100) + '%' };

/* ------------------------------------------------------------------ state */
const ST = { tab: 'video', layout: 'single', poses: [P()], sel: 0, mirror: true, assign: [null], seq: 'orbit', autoLen: true, len: 8, zoom: 1, motion: 1, frame: 0, lockCam: false,
  fmt: '9:16', vres: 1, fps: 30, angle: 'front', views: [], pfmt: 'fit', pres: 4096, pbg: 'transparent', finish: 'natural', island: true, customBg: false,
  look: { lightPreset: 'studio', ...LIGHTS[0].v, backdrop: '#ffffff' } };
try { const o = JSON.parse(localStorage.getItem('charm-mockup') || '{}'); Object.assign(ST, o, { look: { ...ST.look, ...(o.look || {}) } }); } catch {}
const save = () => { try { localStorage.setItem('charm-mockup', JSON.stringify(ST)); } catch {} };

/* ------------------------------------------------------------------ media library (IndexedDB: survives reloads) */
const db = (() => { let p; const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('charm-mockup', 1); r.onupgradeneeded = () => { r.result.createObjectStore('media'); r.result.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = (store, mode, fn) => open().then(d => new Promise((res, rej) => { const t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { all: () => tx('media', 'readonly', s => s.getAll()), put: v => tx('media', 'readwrite', s => s.put(v, v.id)), del: id => tx('media', 'readwrite', s => s.delete(id)),
    get: k => tx('kv', 'readonly', s => s.get(k)), set: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)) }; })();
const MEDIA = new Map();   // id -> { id, name, kind, url, el, w, h, dur, thumb }
async function loadMedia(rec) {
  const url = URL.createObjectURL(rec.blob), kind = rec.type.startsWith('video') ? 'video' : 'image';
  let el, w, h, dur = 0, thumb;
  if (kind === 'video') {
    el = document.createElement('video'); Object.assign(el, { muted: true, loop: true, playsInline: true, preload: 'auto', src: url });
    await new Promise((res, rej) => { el.onloadeddata = res; el.onerror = () => rej(new Error('Could not read ' + rec.name)); });
    w = el.videoWidth; h = el.videoHeight; dur = el.duration || 0;
    el.currentTime = Math.min(0.5, dur / 3); await new Promise(r => { el.onseeked = r; setTimeout(r, 1500); });
    const c = document.createElement('canvas'); c.height = 160; c.width = Math.round(160 * w / h); c.getContext('2d').drawImage(el, 0, 0, c.width, c.height); thumb = c.toDataURL('image/jpeg', 0.8);
    el.currentTime = 0;
  } else { el = new Image(); el.src = url; await el.decode(); w = el.naturalWidth; h = el.naturalHeight; thumb = url; }
  const m = { id: rec.id, name: rec.name, kind, url, el, w, h, dur, thumb }; MEDIA.set(m.id, m); return m;
}
async function addFiles(files, target) {
  files = [...files].filter(f => /^(video|image)\//.test(f.type));
  if (!files.length) return toast('Drop videos or images');
  let first = null;
  for (const f of files) {
    const rec = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name, type: f.type, blob: f };
    try { const m = await loadMedia(rec); await db.put(rec); first = first || m; } catch (e) { console.error(e); toast(`Could not read ${f.name}`); }
  }
  if (!first) return;
  const i = target ?? (ST.assign[ST.sel] ? -1 : ST.sel);
  if (i >= 0) assign(i, first.id); else renderMedia();
  toast(files.length > 1 ? `${files.length} added` : 'Added');
}
function assign(i, id) {
  ST.assign[i] = id; save();
  V.setMedia(i, id ? MEDIA.get(id) : null);
  syncVideos(); renderMedia(); renderPhones(); rebuild();
}
async function removeMedia(id) {
  const m = MEDIA.get(id); if (!m) return;
  ST.assign = ST.assign.map(a => a === id ? null : a); ST.assign.forEach((a, i) => { if (!a) V.setMedia(i, null); });
  if (m.kind === 'video') m.el.pause(); URL.revokeObjectURL(m.url); MEDIA.delete(id); await db.del(id); save(); renderMedia(); renderPhones(); rebuild();
}
const assignedVideos = () => [...new Set(ST.assign.filter(Boolean))].map(id => MEDIA.get(id)).filter(m => m && m.kind === 'video');

/* ------------------------------------------------------------------ timeline: camera keys + every assigned video, in step */
const CH = ['rx', 'ry', 'rz', 'dist', 'camY', 'tY', 'fov', 'py', 'px'], DEF = { rx: 0, ry: 0, rz: 0, dist: 23, camY: 0.6, tY: -0.2, fov: 26, py: 0, px: 0 };
const NEUTRAL = { rx: 0.03, ry: 0, rz: 0, camY: 0.6, tY: -0.2 };
const length = () => ST.autoLen ? Math.max(0, ...assignedVideos().map(m => m.dur)) || ST.len : ST.len;
function keysFor(T) {
  const seq = SEQS.find(s => s.id === ST.seq) || SEQS[0];
  return seq.keys.map(k => { const o = { ...DEF, ...k, t: k.u * T }; for (const c of ['rx', 'ry', 'rz', 'camY', 'tY']) o[c] = NEUTRAL[c] + (o[c] - NEUTRAL[c]) * ST.motion; o.dist /= ST.zoom; return o; });
}
function camAt(K, t) {
  if (t <= K[0].t) return K[0]; if (t >= K[K.length - 1].t) return K[K.length - 1];
  let i = 0; while (K[i + 1].t < t) i++;
  const a = K[i], b = K[i + 1], h = b.t - a.t, u = (t - a.t) / h, pv = K[i - 1], nx = K[i + 2], o = {};
  for (const c of CH) { const m0 = pv ? (b[c] - pv[c]) / (b.t - pv.t) * h : 0, m1 = nx ? (nx[c] - a[c]) / (nx.t - a.t) * h : 0, u2 = u * u, u3 = u2 * u;
    o[c] = (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[c] + (u3 - u2) * m1; }
  return o;
}
const TL = { t: 0, T: 8, K: null, playing: false, t0: 0, raf: 0, exporting: false, cancel: false };
function rebuild() { const f = TL.T ? TL.t / TL.T : 0; TL.T = length(); TL.K = keysFor(TL.T); TL.t = clamp(f * TL.T, 0, TL.T); if (ST.tab === 'video' && !TL.playing && !TL.exporting) seek(TL.t); renderTransport(); renderSeqs(); }
function applyAt(t) { if (ST.lockCam) { if (V.hasPose()) V.freeAt(V.getView()); } else V.setPose(camAt(TL.K, t)); }
function syncVideos(play = TL.playing) {
  for (const m of assignedVideos()) { const want = m.dur ? TL.t % m.dur : 0; if (Math.abs(m.el.currentTime - want) > 0.08) m.el.currentTime = want; if (play) m.el.play().catch(() => {}); else m.el.pause(); }
}
function play() {
  if (TL.exporting) return; if (ST.tab !== 'video') setTab('video');
  if (TL.t >= TL.T - 0.02) TL.t = 0;
  TL.playing = true; V.setPlaying(true); TL.t0 = performance.now() - TL.t * 1000; syncVideos(true);
  const step = now => { if (!TL.playing) return; TL.t = (now - TL.t0) / 1000; if (TL.t >= TL.T) { TL.t = 0; TL.t0 = now; syncVideos(true); } applyAt(TL.t); renderTransport(); TL.raf = requestAnimationFrame(step); };
  TL.raf = requestAnimationFrame(step); renderTransport();
}
function pause() { TL.playing = false; V.setPlaying(false); cancelAnimationFrame(TL.raf); syncVideos(false); renderTransport(); }
function seek(t) { pause(); TL.t = clamp(t, 0, TL.T); syncVideos(false); applyAt(TL.t); renderTransport(); }

/* ------------------------------------------------------------------ phones: layouts, picking, posing */
const layoutOf = id => LAYOUTS.find(l => l.id === id) || LAYOUTS[0];
const partner = i => layoutOf(ST.layout).pairs === false ? -1 : (ST.poses.length - 1 - i === i ? -1 : ST.poses.length - 1 - i);
const mirrorOf = p => ({ ...p, x: -p.x, ry: -p.ry, rz: -p.rz });
function useLayout(id, keepMedia = true) {
  const L = layoutOf(id), was = ST.assign, ids = [...MEDIA.keys()];
  ST.layout = L.id; ST.poses = L.phones.map(p => ({ ...p })); ST.sel = L.sel ?? Math.floor(ST.poses.length / 2);
  // keep what was on screen; new phones get the other uploads in turn
  const pool = [...was.filter(Boolean), ...ids.filter(x => !was.includes(x))];
  ST.assign = ST.poses.map((_, i) => keepMedia && pool.length ? pool[i % pool.length] : null);
  applyPhones(); save(); renderPhones(); renderMedia(); rebuild();
}
function applyPhones() {
  const L = layoutOf(ST.layout);
  V.setPhones(ST.poses, L.fit, ST.sel);
  ST.assign.forEach((id, i) => V.setMedia(i, id ? MEDIA.get(id) || null : null));
  syncVideos();
}
function selectPhone(i) { if (i < 0 || i >= ST.poses.length) return; ST.sel = i; V.select(i); save(); renderPhones(); renderMedia(); }
function setPose(patch) {
  const i = ST.sel; ST.poses[i] = { ...ST.poses[i], ...patch }; V.placePhone(i, ST.poses[i]);
  const j = partner(i); if (ST.mirror && j >= 0) { ST.poses[j] = mirrorOf(ST.poses[i]); V.placePhone(j, ST.poses[j]); }
  save();
}

/* ------------------------------------------------------------------ export: MP4 */
const toast = t => { const e = $('.toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 1800); };
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
const seekTo = (v, t) => new Promise(r => { if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) return r(); const done = () => { v.removeEventListener('seeked', done); r(); }; v.addEventListener('seeked', done); v.currentTime = t; setTimeout(done, 3000); });
async function exportVideo() {
  if (TL.exporting) return;
  if (!('VideoEncoder' in window)) return toast('This browser cannot encode video; use Chrome');
  const lockView = ST.lockCam ? V.getView() : null;
  pause(); rebuild();
  const [bw, bh] = FORMATS[ST.fmt], q = ST.vres === 2 ? 2 : 1, w = bw * q, h = bh * q, ss = q === 1 ? 2 : 1, fps = ST.fps, total = Math.max(1, Math.ceil(TL.T * fps));
  let config = null;
  for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.64002a', 'avc1.640028', 'avc1.4d0033', 'avc1.42003e']) {
    const c = { codec, width: w, height: h, bitrate: (w * h > 6e6 ? 60 : 24) * 1e6, bitrateMode: 'variable', framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch {}
  }
  if (!config) return toast('H.264 encoding is not available here');
  TL.exporting = true; TL.cancel = false; document.body.classList.add('exporting'); renderProgress(0, total);
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
  let err = null; const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { err = e; } }); enc.configure(config);
  const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d', { alpha: false }); g.imageSmoothingQuality = 'high';
  const bg = bgv(ST.look.backdrop); if (V.isImgBg(bg)) await V.bgImage(bg).p;
  const vids = assignedVideos(), t0 = performance.now();
  try {
    for (let f = 0; f < total; f++) {
      if (TL.cancel || err) break;
      const t = f / fps;
      await Promise.all(vids.map(m => seekTo(m.el, m.dur ? t % m.dur : 0))); V.refreshVideos();
      const big = V.renderFrame(w * ss, h * ss, lockView || camAt(TL.K, t), bg);
      let src = big; if (ss > 1) { g.drawImage(big, 0, 0, w, h); src = out; }
      const fr = new VideoFrame(src, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(fr, { keyFrame: f % (fps * 2) === 0 }); fr.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (f % 3 === 0) { renderProgress(f + 1, total, (performance.now() - t0) / (f + 1) * (total - f - 1)); await new Promise(r => setTimeout(r, 0)); }
    }
    await enc.flush();
    if (!TL.cancel && !err) { muxer.finalize(); const name = `charm_${ST.seq}_${ST.fmt.replace(':', 'x')}_${q === 2 ? '4K' : '1080p'}.mp4`; download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), name); toast(`Exported ${name}`); }
    else toast(err ? 'Export failed, see console' : 'Export cancelled');
    if (err) console.error(err);
  } catch (e) { console.error(e); toast('Export failed, see console'); }
  try { enc.close(); } catch {}
  TL.exporting = false; document.body.classList.remove('exporting'); renderProgress(); seek(TL.t);
}
/* ------------------------------------------------------------------ export: PNG */
function trimAlpha(c, pad = 0.04) {
  const g = c.getContext('2d', { willReadFrequently: true }), { width: w, height: h } = c, d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad); x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
}
async function exportPhoto() {
  if (TL.exporting) return;
  TL.exporting = true; document.body.classList.add('exporting'); renderProgress(0, 1, 0, 'photo');
  try {
    const long = ST.pres, a = PFORMATS[ST.pfmt], bg = bgv(ST.pbg); if (V.isImgBg(bg)) await V.bgImage(bg).p;
    let w, h;
    if (a) { if (a >= 1) { w = long; h = Math.round(long / a); } else { h = long; w = Math.round(long * a); } }
    else { const r = V.frameRect(), ar = r.width / r.height; if (ar >= 1) { w = long; h = Math.round(long / ar); } else { h = long; w = Math.round(long * ar); } }
    const copy = s => { const o = document.createElement('canvas'); o.width = s.width; o.height = s.height; o.getContext('2d').drawImage(s, 0, 0); return o; };
    let out;
    if (a) out = copy(V.renderFrame(w, h, null, bg));
    else {
      out = trimAlpha(copy(V.renderFrame(w, h, null, 'transparent')));
      const k = long / Math.max(out.width, out.height);
      if (k > 1.05) out = trimAlpha(copy(V.renderFrame(Math.min(8192, Math.round(w * k)), Math.min(8192, Math.round(h * k)), null, 'transparent')));
      if (bg !== 'transparent') { const o = document.createElement('canvas'); o.width = out.width; o.height = out.height; const g = o.getContext('2d'); V.paintBg(g, o.width, o.height, bg); g.drawImage(out, 0, 0); out = o; }
    }
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    download(blob, `charm_${ST.angle}_${ST.pfmt === 'fit' ? 'fit' : ST.pfmt.replace(':', 'x')}_${out.width}x${out.height}${bg === 'transparent' ? '_transparent' : ''}.png`);
    toast('PNG exported');
  } catch (e) { console.error(e); toast('Export failed, see console'); }
  TL.exporting = false; document.body.classList.remove('exporting'); renderProgress();
}

/* ------------------------------------------------------------------ panel */
const panel = document.createElement('aside'); panel.id = 'studio';
const seg = (group, opts) => `<div class="st-seg" data-group="${group}">${opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
const slider = (k, label, min, max, step, attr) => `<div class="st-slider"><div class="st-sl-top"><span>${label}</span><output data-out="${k}"></output></div><input type="range" ${attr}="${k}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></div>`;
function layoutGlyph(L) {
  const it = L.phones.map(p => { const d = 26 / (26 - p.z), w = 4.19 * Math.max(0.12, Math.abs(Math.cos(p.ry))) * p.s * d, h = 8.78 * p.s * d; return { x: p.x * d, y: -p.y * d, w, h, z: p.z, k: 0.16 * Math.sin(p.ry) }; });
  const x0 = Math.min(...it.map(a => a.x - a.w / 2)), x1 = Math.max(...it.map(a => a.x + a.w / 2)), y0 = Math.min(...it.map(a => a.y - a.h / 2)), y1 = Math.max(...it.map(a => a.y + a.h / 2));
  const f = Math.min(50 / (x1 - x0), 32 / (y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, X = v => ((v - cx) * f).toFixed(1), Y = v => ((v - cy) * f).toFixed(1);
  return `<svg viewBox="-30 -20 60 40" aria-hidden="true">${[...it].sort((a, b) => a.z - b.z).map(a => { const l = a.x - a.w / 2, r = a.x + a.w / 2, hl = a.h / 2 * (1 - a.k), hr = a.h / 2 * (1 + a.k); return `<polygon points="${X(l)},${Y(a.y - hl)} ${X(r)},${Y(a.y - hr)} ${X(r)},${Y(a.y + hr)} ${X(l)},${Y(a.y + hl)}" class="g-face"/>`; }).join('')}</svg>`;
}
panel.innerHTML = `
  <header class="st-head"><div class="st-tabs" role="tablist"><button data-tab="video">Video</button><button data-tab="photo">Photo</button></div><span class="st-brand">charm mockup</span></header>
  <div class="st-scroll">
    <section><h3>Screens<span class="st-for"></span></h3>
      <div class="st-media"></div>
      <p class="st-note">Drop screen recordings or images anywhere, or onto a phone. Click one to put it on the selected phone.</p>
    </section>
    <section class="st-phones"><h3>Phones</h3>
      <div class="st-layouts st-layouts6">${LAYOUTS.map(L => `<button class="st-angle st-layout" data-layout="${L.id}">${layoutGlyph(L)}<span>${L.name}</span></button>`).join('')}</div>
      <div class="st-multi">
        <div class="st-pick"></div>
        <p class="st-note">Click a phone, here or in the shot, to choose its screen and pose it.</p>
        <div class="st-pose">${POSE.map(([k, l, a, b, s]) => slider(k, l, a, b, s, 'data-pose')).join('')}
          <label class="st-row st-mirror"><span>Mirror to phone <b class="st-mate"></b></span><input type="checkbox" data-mirror></label>
          <button class="st-link" data-posereset>Reset this phone</button></div>
      </div>
      <div class="st-row"><span>Finish</span><div class="st-swatches st-finish">${Object.entries(V.FINISHES).map(([id, f]) => `<button data-finish="${id}" title="${f.name}" style="background:#${f.frame.toString(16).padStart(6, '0')}"></button>`).join('')}</div></div>
      <label class="st-row"><span>Dynamic Island</span><input type="checkbox" data-island></label>
    </section>
    <div class="st-pane" data-pane="video">
      <section><h3>Camera move</h3><div class="st-seqs"></div></section>
      <section><h3>Length</h3>
        <label class="st-row"><span>Match the screen recording</span><input type="checkbox" data-autolen></label>
        <div class="st-lenrow">${slider('len', 'Seconds', 2, 60, 0.5, 'data-ui')}</div>
        <label class="st-row"><span>Lock camera</span><input type="checkbox" data-lockcam></label>
        <p class="st-note st-lock-note">Drag or zoom to place the camera; the screens keep playing and the camera stays put.</p>
        <div class="st-row"><span>Framing</span>${seg('frame', [[-1, 'Left'], [0, 'Center'], [1, 'Right']])}</div>
        <div class="st-camfx">${slider('zoom', 'Zoom', 0.6, 1.6, 0.05, 'data-ui')}${slider('motion', 'Camera motion', 0, 1.5, 0.05, 'data-ui')}</div>
      </section>
    </div>
    <div class="st-pane" data-pane="photo">
      <section><h3>Angle</h3><div class="st-angles"></div><button class="st-link" data-saveview>Save current view as an angle</button>
        <p class="st-note">Drag around the phones to fine-tune any angle.</p></section>
      <section><div class="st-row"><span>Framing</span>${seg('frame', [[-1, 'Left'], [0, 'Center'], [1, 'Right']])}</div></section>
    </div>
    <section><h3>Look</h3>
      <div class="st-row"><span>Background</span><div class="st-swatches st-bgs"></div></div>
    </section>
    <section class="st-light"><h3>Lighting</h3>
      <div class="st-lps">${LIGHTS.map(l => `<button class="st-lp" data-lp="${l.id}"><i style="background:linear-gradient(135deg,${l.c[0]},${l.c[1]})"></i>${l.name}</button>`).join('')}</div>
      <div class="st-lightpad"><div class="st-pad" role="slider" tabindex="0" aria-label="Light direction and height"><span class="st-pad-ring"></span><span class="st-pad-ring r2"></span><span class="st-pad-phone"></span><b class="st-pad-front">Front</b><span class="st-pad-ray"></span><span class="st-pad-dot"></span></div>
        <dl class="st-pad-read"><dt>Direction</dt><dd data-lo="az"></dd><dt>Height</dt><dd data-lo="el"></dd><p>Drag the light around the phone. Closer to the middle is higher.</p></dl></div>
      ${slider('lightAmt', 'Brightness', 30, 200, 1, 'data-light')}${slider('warmth', 'Warmth', 0, 100, 1, 'data-light').replace('st-slider', 'st-slider st-warm')}${slider('shadow', 'Floor shadow', 0, 100, 1, 'data-light')}${slider('glare', 'Screen glare', 0, 100, 1, 'data-light')}
    </section>
  </div>
  <footer class="st-foot">
    <div class="st-pane" data-pane="video">
      <div class="st-row"><span>Format</span>${seg('fmt', Object.keys(FORMATS).map(k => [k, k]))}</div>
      <div class="st-row"><span>Resolution</span>${seg('vres', [[1, '1080p'], [2, '4K']])}</div>
      <div class="st-row"><span>Frame rate</span>${seg('fps', [[30, '30'], [60, '60']])}</div>
      <button class="st-export" data-do="video">Export MP4</button>
    </div>
    <div class="st-pane" data-pane="photo">
      <div class="st-row"><span>Format</span>${seg('pfmt', [['fit', 'Fit'], ['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16'], ['16:9', '16:9']])}</div>
      <div class="st-row"><span>Size</span>${seg('pres', [[2048, '2K'], [4096, '4K']])}</div>
      <button class="st-export" data-do="photo">Export PNG</button>
    </div>
    <div class="st-progress" hidden><div class="st-bar"><i></i></div><div class="st-ptext"></div><button class="st-cancel">Cancel</button></div>
  </footer>`;
document.body.prepend(panel);
const extraCss = document.createElement('style');
extraCss.textContent = `
  .st-head{gap:10px}.st-brand{font-size:12.5px;font-weight:650;color:var(--st-sub);letter-spacing:.2px}
  .st-media{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:0 8px}
  .st-mitem{position:relative;aspect-ratio:9/16;border-radius:9px;overflow:hidden;background:#e8e8e4;box-shadow:inset 0 0 0 1px rgba(0,0,0,.05);transition:transform .12s,box-shadow .15s}
  .st-mitem img{width:100%;height:100%;object-fit:cover;display:block}
  .st-mitem:hover{transform:translateY(-1px)}.st-mitem:active{transform:scale(.97)}
  .st-mitem.on{box-shadow:0 0 0 2px var(--st-bg),0 0 0 3.5px #2b8cff}
  .st-mitem em{position:absolute;left:4px;bottom:4px;padding:1px 5px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-style:normal;font-variant-numeric:tabular-nums}
  .st-mitem i{position:absolute;right:3px;top:3px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-style:normal;line-height:18px;text-align:center;font-size:12px;opacity:0;transition:opacity .15s}
  .st-mitem:hover i{opacity:1}
  .st-madd{aspect-ratio:9/16;border-radius:9px;background:#f1f1ee;color:var(--st-sub);font-size:22px;box-shadow:inset 0 0 0 1.5px #dcdcd7;transition:background .15s,color .15s}
  .st-madd:hover{background:#e9e9e5;color:var(--st-ink)}
  .st-mnone{aspect-ratio:9/16;border-radius:9px;background:#1a1b1e;color:#9a9a96;font-size:11px;line-height:1.2;padding:4px}
  .st-mnone.on{box-shadow:0 0 0 2px var(--st-bg),0 0 0 3.5px #2b8cff}
  .st-layouts6{grid-template-columns:repeat(3,1fr)!important;gap:6px!important}
  .st-finish button{box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
  .st-swatches .st-sw-img{background-size:cover;background-position:center}
  .st-swatches .st-sw-up{background:#f1f1ee;color:var(--st-sub);font-size:15px;line-height:22px;text-align:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
  .st-swatches button.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.14),0 0 0 2px var(--st-bg),0 0 0 3.5px var(--st-ink)}
  .st-lenrow{transition:opacity .2s}.st-lenrow.off{opacity:.35;pointer-events:none}
  body.exporting #stage{pointer-events:none}
`;
document.head.append(extraCss);

function renderMedia() {
  const cur = ST.assign[ST.sel];
  $('.st-media', panel).innerHTML = `<button class="st-mnone${!cur ? ' on' : ''}" data-media="" title="Empty screen">Empty</button>`
    + [...MEDIA.values()].map(m => `<button class="st-mitem${m.id === cur ? ' on' : ''}" data-media="${m.id}" title="${m.name}"><img src="${m.thumb}" alt="">${m.kind === 'video' ? `<em>${m.dur.toFixed(1)}s</em>` : ''}<i data-mdel="${m.id}" title="Remove">×</i></button>`).join('')
    + '<button class="st-madd" data-madd title="Add screen recordings or images">+</button>';
  $$('.st-for', panel).forEach(e => e.textContent = ST.poses.length > 1 ? ` on phone ${ST.sel + 1}` : '');
}
function renderPhones() {
  const multi = ST.poses.length > 1;
  panel.classList.toggle('multi', multi);
  $$('[data-layout]', panel).forEach(b => b.classList.toggle('on', b.dataset.layout === ST.layout));
  $$('[data-finish]', panel).forEach(b => b.classList.toggle('on', b.dataset.finish === ST.finish));
  $('[data-island]', panel).checked = ST.island;
  if (!multi) return;
  $('.st-pick', panel).innerHTML = ST.poses.map((_, i) => { const m = MEDIA.get(ST.assign[i]); return `<button class="st-chip${i === ST.sel ? ' on' : ''}" data-phone="${i}">${m ? `<img src="${m.thumb}" alt="">` : ''}<b>${i + 1}</b></button>`; }).join('');
  const p = ST.poses[ST.sel];
  POSE.forEach(([k, , , , , f]) => { const v = k[0] === 'r' ? p[k] / D2R : p[k], el = $(`[data-pose="${k}"]`, panel); if (document.activeElement !== el) el.value = v; $(`[data-out="${k}"]`, panel).textContent = POSEFMT[f](v); });
  const j = partner(ST.sel); $('.st-mirror', panel).hidden = j < 0; if (j >= 0) { $('.st-mate', panel).textContent = j + 1; $('[data-mirror]', panel).checked = ST.mirror; }
}
function renderSeqs() {
  $('.st-seqs', panel).innerHTML = SEQS.map(s => `<button class="st-seq${s.id === ST.seq ? ' on' : ''}" data-seq="${s.id}"><span><b>${s.name}</b><small>${s.desc}</small></span><em>${TL.T.toFixed(1)}s</em></button>`).join('');
}
function renderAngles() {
  $('.st-angles', panel).innerHTML = [...ANGLES, ...ST.views].map(a => `<button class="st-angle${a.id === ST.angle ? ' on' : ''}" data-angle="${a.id}"><span>${a.name}</span>${a.view ? `<i data-vdel="${a.id}" title="Remove">×</i>` : ''}</button>`).join('');
}
const FMT = { pct: v => Math.round(v * 100) + '%', s: v => (+v).toFixed(1) + 's' };
function renderControls() {
  panel.dataset.tab = ST.tab; $$('[data-tab]', panel).forEach(b => b.classList.toggle('on', b.dataset.tab === ST.tab));
  $$('.st-seg', panel).forEach(g => $$('button', g).forEach(b => b.classList.toggle('on', String(ST[g.dataset.group]) === b.dataset.v)));
  for (const k of ['zoom', 'motion', 'len']) { const el = $(`[data-ui="${k}"]`, panel); el.value = ST[k]; $(`[data-out="${k}"]`, panel).textContent = k === 'len' ? FMT.s(k === 'len' && ST.autoLen ? TL.T : ST[k]) : FMT.pct(ST[k]); }
  $('[data-autolen]', panel).checked = ST.autoLen; $('.st-lenrow', panel).classList.toggle('off', ST.autoLen && assignedVideos().length > 0);
  $('[data-lockcam]', panel).checked = ST.lockCam; panel.classList.toggle('cam-locked', ST.lockCam);
  const bgOpts = ST.tab === 'photo' ? [['transparent', 'Transparent'], ...BGS] : BGS, cur = ST.tab === 'photo' ? ST.pbg : ST.look.backdrop;
  const custom = ST.customBg && customBgUrl ? [['custom', 'Your photo']] : [];
  $('.st-bgs', panel).innerHTML = [...bgOpts, ...custom].map(([v, l]) => `<button data-bg="${v}" title="${l}" class="${v.startsWith('#') || v === 'transparent' ? '' : 'st-sw-img'}${v === cur ? ' on' : ''}" style="${v === 'transparent' ? 'background:repeating-conic-gradient(#d8d8d4 0 25%,#fff 0 50%) 0 0/8px 8px' : v.startsWith('#') ? `background:${v}` : `background-image:url(${bgv(v)})`}"></button>`).join('')
    + '<button class="st-sw-up" data-bgup title="Upload a background photo">+</button>';
  renderLight();
}
const LFMT = { lightAmt: v => Math.round(v) + '%', warmth: v => v < 42 ? 'Cool' : v > 58 ? 'Warm' : 'Neutral', shadow: v => Math.round(v) + '%', glare: v => Math.round(v) + '%' };
const azName = a => { const d = Math.round(a); if (Math.abs(d) <= 12) return 'Front'; if (Math.abs(d) >= 160) return 'Behind'; return `${Math.abs(d)}° ${d > 0 ? 'right' : 'left'}`; };
function renderLight() {
  const L = ST.look;
  $$('[data-light]', panel).forEach(el => { const k = el.dataset.light; if (document.activeElement !== el) el.value = L[k]; $(`[data-out="${k}"]`, panel).textContent = LFMT[k](L[k]); });
  $$('[data-lp]', panel).forEach(b => b.classList.toggle('on', b.dataset.lp === L.lightPreset));
  const pad = $('.st-pad', panel), R = (pad.clientWidth || 128) / 2 - 11, az = L.lightAz * D2R, r = (90 - L.lightEl) / 80, x = Math.sin(az) * r * R, y = Math.cos(az) * r * R;
  $('.st-pad-dot', pad).style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  const ray = $('.st-pad-ray', pad); ray.style.width = Math.hypot(x, y).toFixed(1) + 'px'; ray.style.transform = `rotate(${Math.atan2(y, x)}rad)`;
  $('[data-lo="az"]', panel).textContent = azName(L.lightAz); $('[data-lo="el"]', panel).textContent = Math.round(L.lightEl) + '°';
}
function setLook(patch) { ST.look = { ...ST.look, ...patch }; V.applyLook(ST.look); save(); renderLight(); }
function renderProgress(f, total, eta, kind) {
  const pr = $('.st-progress', panel);
  if (!TL.exporting) { pr.hidden = true; panel.classList.remove('busy'); return; }
  panel.classList.add('busy'); pr.hidden = false;
  $('.st-bar i', panel).style.transform = `scaleX(${total ? f / total : 0})`;
  const s = Math.max(0, Math.round((eta || 0) / 1000));
  $('.st-ptext', panel).textContent = kind === 'photo' ? 'Rendering PNG…' : `Frame ${f} of ${total}${f > 3 ? ` · about ${s >= 60 ? Math.floor(s / 60) + 'm ' : ''}${s % 60}s left` : ''}`;
  $('.st-cancel', panel).hidden = kind === 'photo';
}
const bar = $('#bar');
function renderTransport() {
  bar.classList.toggle('playing', TL.playing); bar.style.visibility = ST.tab === 'video' ? '' : 'hidden';
  const f = TL.T ? clamp(TL.t / TL.T, 0, 1) : 0;
  $('.tp-track i', bar).style.transform = `scaleX(${f})`;
  if (document.activeElement !== $('input', bar)) $('input', bar).value = Math.round(f * 1000);
  $('.tp-time', bar).textContent = `${TL.t.toFixed(1)} / ${TL.T.toFixed(1)}s`;
}
function frameFor() {
  if (ST.tab === 'video') { const [w, h] = FORMATS[ST.fmt]; V.setFrame(w / h); V.setBackdrop(bgv(ST.look.backdrop)); }
  else { V.setFrame(PFORMATS[ST.pfmt]); V.setBackdrop(ST.pbg === 'transparent' ? '#ffffff' : bgv(ST.pbg), ST.pbg === 'transparent'); }
  V.setShift(ST.frame);
}
function setTab(tab) {
  ST.tab = tab; save(); renderControls(); frameFor(); renderTransport();
  if (tab === 'photo') { pause(); goAngle(ST.angle); } else { rebuild(); seek(TL.t); }
}
function goAngle(id) { const a = [...ANGLES, ...ST.views].find(x => x.id === id); if (!a) return; ST.angle = id; save(); renderAngles(); V.setPose(null); V.glideTo(a.pose || a.view, 700); }

/* light dial */
(() => {
  const pad = $('.st-pad', panel);
  const from = (cx, cy) => { const r = pad.getBoundingClientRect(), R = r.width / 2 - 11, dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2), d = Math.min(1, Math.hypot(dx, dy) / R); setLook({ lightPreset: 'custom', lightAz: Math.round(Math.atan2(dx, dy) / D2R), lightEl: Math.round(90 - d * 80) }); };
  let drag = false;
  pad.addEventListener('pointerdown', e => { drag = true; pad.setPointerCapture(e.pointerId); pad.classList.add('drag'); from(e.clientX, e.clientY); });
  pad.addEventListener('pointermove', e => { if (drag) from(e.clientX, e.clientY); });
  const end = () => { drag = false; pad.classList.remove('drag'); }; pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
})();

let customBgUrl = null;
const bgv = v => v === 'custom' ? customBgUrl || '#ffffff' : v;   // 'custom' = the uploaded background photo, kept in IndexedDB
panel.addEventListener('click', e => {
  const t = e.target;
  const tab = t.closest('[data-tab]'); if (tab) return setTab(tab.dataset.tab);
  const del = t.closest('[data-mdel]'); if (del) { e.stopPropagation(); return removeMedia(del.dataset.mdel); }
  const md = t.closest('[data-media]'); if (md) return assign(ST.sel, md.dataset.media || null);
  if (t.closest('[data-madd]')) { fileTarget = ST.sel; return $('#mediaFile').click(); }
  const ly = t.closest('[data-layout]'); if (ly) return useLayout(ly.dataset.layout);
  const ph = t.closest('[data-phone]'); if (ph) return selectPhone(+ph.dataset.phone);
  if (t.closest('[data-posereset]')) { const L = layoutOf(ST.layout), i = ST.sel, j = partner(i); [i, j].forEach(k => { if (k >= 0 && L.phones[k]) { ST.poses[k] = { ...L.phones[k] }; V.placePhone(k, ST.poses[k]); } }); save(); return renderPhones(); }
  const fin = t.closest('[data-finish]'); if (fin) { ST.finish = fin.dataset.finish; V.setFinish(ST.finish); save(); return renderPhones(); }
  const sq = t.closest('[data-seq]'); if (sq) { ST.seq = sq.dataset.seq; save(); TL.t = 0; rebuild(); return play(); }
  const vd = t.closest('[data-vdel]'); if (vd) { e.stopPropagation(); ST.views = ST.views.filter(v => v.id !== vd.dataset.vdel); if (ST.angle === vd.dataset.vdel) ST.angle = 'front'; save(); return renderAngles(); }
  const an = t.closest('[data-angle]'); if (an) return goAngle(an.dataset.angle);
  if (t.closest('[data-saveview]')) { ST.views.push({ id: 'v' + Date.now().toString(36), name: `My angle ${ST.views.length + 1}`, view: V.currentView() }); ST.angle = ST.views.at(-1).id; save(); renderAngles(); return toast('Angle saved'); }
  if (t.closest('[data-bgup]')) return $('#bgFile').click();
  const bg = t.closest('[data-bg]'); if (bg) { if (ST.tab === 'photo') ST.pbg = bg.dataset.bg; else setLook({ backdrop: bg.dataset.bg }); save(); renderControls(); return frameFor(); }
  const lp = t.closest('[data-lp]'); if (lp) return setLook({ lightPreset: lp.dataset.lp, ...LIGHTS.find(l => l.id === lp.dataset.lp).v });
  const sb = t.closest('.st-seg button');
  if (sb) { const g = sb.parentNode.dataset.group; ST[g] = ['fps', 'pres', 'frame', 'vres'].includes(g) ? +sb.dataset.v : sb.dataset.v; save(); renderControls(); return frameFor(); }
  const d = t.closest('[data-do]'); if (d) return d.dataset.do === 'video' ? exportVideo() : exportPhoto();
  if (t.closest('.st-cancel')) TL.cancel = true;
});
panel.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-mirror]')) { ST.mirror = t.checked; const j = partner(ST.sel); if (ST.mirror && j >= 0) { ST.poses[j] = mirrorOf(ST.poses[ST.sel]); V.placePhone(j, ST.poses[j]); } save(); return; }
  if (t.matches('[data-island]')) { ST.island = t.checked; V.setIsland(ST.island); return save(); }
  if (t.matches('[data-autolen]')) { ST.autoLen = t.checked; save(); rebuild(); return renderControls(); }
  if (t.matches('[data-lockcam]')) { ST.lockCam = t.checked; save(); if (ST.lockCam && V.hasPose()) V.freeAt(V.getView()); else seek(TL.t); return renderControls(); }
});
panel.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.pose) { const k = t.dataset.pose; setPose({ [k]: k[0] === 'r' ? +t.value * D2R : +t.value }); return renderPhones(); }
  if (t.dataset.light) return setLook({ lightPreset: 'custom', [t.dataset.light]: +t.value });
  if (t.dataset.ui) { ST[t.dataset.ui] = +t.value; if (t.dataset.ui === 'len') ST.autoLen = false; save(); rebuild(); renderControls(); }
});

/* transport */
$('.tp-play', bar).onclick = () => TL.playing ? pause() : play();
$('input', bar).addEventListener('input', e => seek(+e.target.value / 1000 * TL.T));
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName) && document.activeElement.type !== 'range') return;
  if (e.key === ' ' && ST.tab === 'video') { e.preventDefault(); TL.playing ? pause() : play(); }
});

/* files: picker, drag and drop (onto a phone puts it on that phone) */
let fileTarget = null;
$('#mediaFile').addEventListener('change', e => { addFiles(e.target.files, fileTarget); fileTarget = null; e.target.value = ''; });
$('#bgFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const u = URL.createObjectURL(f), im = new Image(); im.src = u; try { await im.decode(); } catch { return toast('Could not read that image'); }
  const k = Math.min(1, 3840 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
  customBgUrl = c.toDataURL('image/jpeg', 0.92); await db.set('bg', customBgUrl); ST.customBg = true;
  if (ST.tab === 'photo') ST.pbg = 'custom'; else setLook({ backdrop: 'custom' });
  save(); renderControls(); frameFor(); toast('Background set');
});
let dragN = 0;
addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dragN++; document.body.classList.add('dragging'); });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault(); dragN = 0; document.body.classList.remove('dragging');
  const i = V.count() > 1 ? V.pickAt(e.clientX, e.clientY) : (document.elementFromPoint(e.clientX, e.clientY)?.closest('#frame') ? 0 : -1);
  if (i >= 0) selectPhone(i);
  addFiles(e.dataTransfer.files, i >= 0 ? i : undefined);
});

/* ------------------------------------------------------------------ boot */
(async () => {
  V.init($('#frame'));
  V.setOnPick(i => selectPhone(i));
  V.setFinish(ST.finish); V.setIsland(ST.island); V.applyLook(ST.look);
  try { for (const rec of await db.all()) await loadMedia(rec).catch(e => console.warn(e)); } catch (e) { console.warn(e); }
  if (ST.customBg) { customBgUrl = await db.get('bg'); if (!customBgUrl) ST.customBg = false; }
  if (ST.look.backdrop === 'custom' && !customBgUrl) ST.look.backdrop = '#ffffff';
  if (ST.pbg === 'custom' && !customBgUrl) ST.pbg = 'transparent';
  ST.assign = ST.poses.map((_, i) => MEDIA.has(ST.assign[i]) ? ST.assign[i] : null);
  applyPhones();
  renderMedia(); renderPhones(); renderAngles(); renderControls();
  rebuild(); frameFor();
  if (ST.tab === 'photo') goAngle(ST.angle); else seek(0);
  window.charm = { ST, TL, MEDIA, play, pause, seek, exportVideo, exportPhoto, useLayout, assign };
})();
