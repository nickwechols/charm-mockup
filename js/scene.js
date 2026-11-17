// The 3D scene: one or more iPhones whose screens show uploaded screen recordings or images.
// Every phone hangs off a rig: camera moves and photo angles turn the rig, layouts place phones inside it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

const W = 393, H = 852, U = 0.01;              // screen in points; 1pt = 0.01 world units
const OW = 419, OH = 878, DEPTH = 49, FZ = DEPTH / 2;
const R_BODY = 68, R_GLASS = R_BODY - 3, R_SCREEN = 55;
export const HOME = { pos: new THREE.Vector3(-5.4, 1.1, 24), target: new THREE.Vector3(0, -0.3, 0) };
export const FINISHES = {
  natural: { frame: 0x9d9c99, back: 0xa3a5a7, plate: 0xa9abad, name: 'Natural' },
  black: { frame: 0x3b3b3d, back: 0x2c2c2e, plate: 0x333335, name: 'Black' },
  white: { frame: 0xd9d8d3, back: 0xe9e8e3, plate: 0xdedcd6, name: 'White' },
  desert: { frame: 0xbfa88f, back: 0xc9b6a0, plate: 0xc4ae95, name: 'Desert' },
};

function squirclePts(w, h, r, n = 56) {
  const pts = [], corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); } };
  corner(w / 2 - r, h / 2 - r, 0); corner(-w / 2 + r, h / 2 - r, Math.PI / 2); corner(-w / 2 + r, -h / 2 + r, Math.PI); corner(w / 2 - r, -h / 2 + r, Math.PI * 1.5);
  return pts;
}
const squircle = (w, h, r) => new THREE.Shape(squirclePts(w, h, r));
/* smooth-shaded body: the outline swept by a rounded edge profile */
function makeBody(w, h, r, depth, rb) {
  const out = squirclePts(w, h, r, 64), N = out.length;
  const nrm2 = out.map((p, k) => { const a = out[(k - 1 + N) % N], b = out[(k + 1) % N]; return new THREE.Vector2(b.y - a.y, -(b.x - a.x)).normalize(); });
  const prof = [], seg = 14, half = depth / 2;
  for (let j = 0; j <= seg; j++) { const a = Math.PI / 2 - (j / seg) * Math.PI / 2; prof.push([rb - rb * Math.cos(a), half - rb + rb * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  for (let j = 0; j <= seg; j++) { const a = -(j / seg) * Math.PI / 2; prof.push([rb - rb * Math.cos(a), -half + rb + rb * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  const P = prof.length, pos = [], nor = [], idx = [];
  for (let k = 0; k < N; k++) for (let j = 0; j < P; j++) { const [ins, z, nxy, nz] = prof[j], o = out[k], n = nrm2[k]; pos.push(o.x - n.x * ins, o.y - n.y * ins, z); nor.push(n.x * nxy, n.y * nxy, nz); }
  for (let k = 0; k < N; k++) for (let j = 0; j < P - 1; j++) { const a = k * P + j, b = ((k + 1) % N) * P + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  const cap = new THREE.Shape(out.map((o, k) => new THREE.Vector2(o.x - nrm2[k].x * rb, o.y - nrm2[k].y * rb)));
  const front = new THREE.ShapeGeometry(cap); front.translate(0, 0, half);
  const back = new THREE.ShapeGeometry(cap); back.rotateY(Math.PI); back.translate(0, 0, -half);
  return [g, front, back];
}

let renderer, scene, camera, controls, rig, template, floor, key, rim, wrapEl;
let screenGeo, glassMat, islandMesh, selGeo, selMat, hitGeo, hitMat, placeholder, mats;
const phones = []; let sel = 0, fit = 1, needsRender = true, island = true;
const floorFade = { value: new THREE.Vector2(1, 1) };
let look = { lightAz: 35, lightEl: 45, lightAmt: 100, warmth: 50, shadow: 55, glare: 45, backdrop: '#ffffff' };
export const markDirty = () => { needsRender = true; };

/* ---------------------------------------------------------------- build */
export function init(host) {
  wrapEl = host;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  setup(renderer); host.append(renderer.domElement);
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  key = new THREE.DirectionalLight(0xffffff, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 34; key.shadow.blurSamples = 25; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 70 });
  rim = new THREE.DirectionalLight(0xdfe8ff, 1.1); scene.add(key, key.target, rim);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.3, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  floor.material.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vXZ;\nuniform vec2 uFade;')
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * ( 1.0 - smoothstep( 1.6, 5.2, length( vXZ / uFade ) ) ) );');
    sh.uniforms.uFade = floorFade;
  };
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200); camera.position.copy(HOME.pos);
  controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(HOME.target);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.5, zoomSpeed: 0.8, minDistance: 8, maxDistance: 45, minPolarAngle: 0.3, maxPolarAngle: Math.PI - 0.3 });
  controls.addEventListener('change', markDirty);

  rig = new THREE.Group(); scene.add(rig);
  buildTemplate();
  screenGeo = new THREE.ShapeGeometry(squircle(W, H, R_SCREEN), 1);
  const p = screenGeo.attributes.position, uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uvs[i * 2] = p.getX(i) / W + 0.5; uvs[i * 2 + 1] = p.getY(i) / H + 0.5; }
  screenGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  glassMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const isl = new THREE.ShapeGeometry(squircle(126, 37, 18.5), 8); islandMesh = isl;
  const ring = squircle(OW + 26, OH + 26, R_BODY + 13); ring.holes.push(new THREE.Path(squirclePts(OW + 12, OH + 12, R_BODY + 6)));
  selGeo = new THREE.ShapeGeometry(ring, 1); selMat = new THREE.MeshBasicMaterial({ color: 0x2b8cff, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  hitGeo = new THREE.BoxGeometry(OW, OH, DEPTH + 30); hitMat = new THREE.MeshBasicMaterial();
  placeholder = placeholderTex();
  setPhones([{}], 1, 0); applyLook(look); rig.rotation.set(0.03, 0.3, 0);
  initInteract();
  addEventListener('resize', resize); resize();
  requestAnimationFrame(loop);
}
function setup(r) {
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.VSMShadowMap;
}
function buildTemplate() {
  template = new THREE.Group();
  mats = {
    frame: new THREE.MeshPhysicalMaterial({ color: 0x9d9c99, metalness: 1, roughness: 0.24, clearcoat: 0.45, clearcoatRoughness: 0.22 }),
    back: new THREE.MeshPhysicalMaterial({ color: 0xa3a5a7, roughness: 0.55, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.6 }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0xa9abad, roughness: 0.18, metalness: 0.2, clearcoat: 1 }),
  };
  const [band, capF, capB] = makeBody(OW, OH, R_BODY, DEPTH, 10);
  template.add(new THREE.Mesh(band, mats.frame), new THREE.Mesh(capF, mats.frame), new THREE.Mesh(capB, mats.frame));
  const bandMat = new THREE.MeshPhysicalMaterial({ color: 0x45464a, roughness: 0.55, clearcoat: 0.3 }), flat = DEPTH - 20;
  [[1, 300], [1, -300], [-1, 300], [-1, -300]].forEach(([s, y]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.5, flat), bandMat); m.position.set(s * (OW / 2 - 0.5), y, 0); template.add(m); });
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([t, s]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, flat), bandMat); m.position.set(s * (OW / 2 - 96), t * (OH / 2 - 0.5), 0); template.add(m); });
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6 });
  const port = new THREE.Mesh(new THREE.CapsuleGeometry(4.2, 25, 4, 12), holeMat); port.rotation.z = Math.PI / 2; port.scale.set(1, 1, 0.3); port.position.set(0, -OH / 2 + 0.6, 0); template.add(port);
  const hg = new THREE.CylinderGeometry(1.7, 1.7, 2, 14);
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) { const h = new THREE.Mesh(hg, holeMat); h.position.set(s * (36 + i * 8.5), -OH / 2 + 0.4, 0); template.add(h); }
  const front = new THREE.Mesh(new THREE.ShapeGeometry(squircle(OW - 6, OH - 6, R_GLASS), 1), new THREE.MeshPhysicalMaterial({ color: 0x040405, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
  front.position.z = FZ + 0.2; template.add(front);
  const back = new THREE.Mesh(new THREE.ShapeGeometry(squircle(OW - 6, OH - 6, R_GLASS), 1), mats.back); back.position.z = -FZ - 0.2; back.rotation.y = Math.PI; template.add(back);
  const px = OW / 2 - 18 - 89, py = OH / 2 - 18 - 89;
  const plateau = new THREE.Mesh(new THREE.ExtrudeGeometry(squircle(178, 178, 46), { depth: 3, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 3, curveSegments: 8 }), mats.plate);
  plateau.rotation.y = Math.PI; plateau.position.set(px, py, -FZ - 0.3); template.add(plateau);
  const ringMat = new THREE.MeshPhysicalMaterial({ color: 0x8e9093, metalness: 1, roughness: 0.25 }), lensMat = new THREE.MeshPhysicalMaterial({ color: 0x05060a, roughness: 0.02, metalness: 0.4, clearcoat: 1, iridescence: 0.6 });
  const rg = new THREE.CylinderGeometry(34, 35, 8, 48), lg = new THREE.CircleGeometry(27, 48);
  [[-40, 40], [-40, -40], [40, 0]].forEach(([dx, dy]) => {
    const r = new THREE.Mesh(rg, ringMat); r.rotation.x = Math.PI / 2; r.position.set(px - dx, py + dy, -FZ - 8); template.add(r);
    const l = new THREE.Mesh(lg, lensMat); l.rotation.y = Math.PI; l.position.set(px - dx, py + dy, -FZ - 12.1); template.add(l);
  });
  const flash = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshPhysicalMaterial({ color: 0xf2efe6, roughness: 0.3 })); flash.rotation.y = Math.PI; flash.position.set(px - 40, py + 62, -FZ - 5); template.add(flash);
  const bg = new THREE.BoxGeometry(6, 1, 13);
  [[-1, 134, 32], [-1, 211, 62], [-1, 287, 62], [1, 254, 98]].forEach(([s, y, h]) => { const m = new THREE.Mesh(bg, mats.frame); m.scale.y = h; m.position.set(s * (OW / 2 + 1.5), OH / 2 - y, 0); template.add(m); });
  template.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
function placeholderTex() {
  const c = document.createElement('canvas'); c.width = 786; c.height = 1704; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, '#1c1d20'); gr.addColorStop(1, '#0e0f11'); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.textAlign = 'center'; g.font = '600 44px -apple-system, "Helvetica Neue", Arial';
  g.fillText('Drop a screen', c.width / 2, c.height / 2 - 10); g.fillText('recording here', c.width / 2, c.height / 2 + 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------------------------------------------------------------- phones */
function makePhone() {
  const g = new THREE.Group(); g.add(template.clone());
  const mat = new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: false });
  const screen = new THREE.Mesh(screenGeo, mat); screen.position.z = FZ + 0.4;
  const isl = new THREE.Mesh(islandMesh, new THREE.MeshBasicMaterial({ color: 0x000000 })); isl.position.set(0, H / 2 - 11 - 18.5, FZ + 0.45); isl.visible = island;
  const glass = new THREE.Mesh(screenGeo, glassMat); glass.position.z = FZ + 0.5;
  const ring = new THREE.Mesh(selGeo, selMat); ring.position.z = FZ - 6; ring.visible = false; ring.renderOrder = -1;
  const hit = new THREE.Mesh(hitGeo, hitMat); hit.visible = false;
  g.add(screen, isl, glass, ring, hit);
  return { g, screen, mat, isl, ring, hit, pose: null, media: null };
}
export function setPhones(list, f = 1, s = 0) {
  while (phones.length > list.length) { const p = phones.pop(); rig.remove(p.g); p.mat.dispose(); }
  while (phones.length < list.length) { const p = makePhone(); phones.push(p); rig.add(p.g); }
  list.forEach((pose, i) => placePhone(i, pose));
  fit = f; rig.scale.setScalar(f); select(Math.min(s, phones.length - 1));
}
export function placePhone(i, pose) {
  const p = phones[i]; if (!p) return;
  p.pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, ...pose };
  p.g.position.set(p.pose.x, p.pose.y, p.pose.z); p.g.rotation.set(p.pose.rx, p.pose.ry, p.pose.rz); p.g.scale.setScalar(U * p.pose.s);
  layoutChanged();
}
function layoutChanged() {
  let minY = Infinity, ex = 0, ez = 0;
  for (const p of phones) { if (!p.pose) continue; const k = p.pose.s; minY = Math.min(minY, p.pose.y - OH / 2 * U * k); ex = Math.max(ex, Math.abs(p.pose.x) + OW / 2 * U * k); ez = Math.max(ez, Math.abs(p.pose.z)); }
  if (minY === Infinity) return;
  floor.position.y = (minY - 0.5) * fit;
  floorFade.value.set(Math.max(1, ex * fit / 2.1), Math.max(1, 1 + ez * fit / 3));
  markDirty();
}
export function select(i) { sel = i; phones.forEach((p, j) => { p.ring.visible = j === sel && phones.length > 1 && ringOn; }); markDirty(); }
let ringOn = true;
export function showRing(on) { ringOn = on; select(sel); }
export const count = () => phones.length;
/* media: { kind: 'video'|'image', el, w, h } or null. The picture covers the screen (cropped, never stretched). */
const texCache = new WeakMap();
export function setMedia(i, media) {
  const p = phones[i]; if (!p) return;
  p.media = media;
  if (!media) { p.mat.map = placeholder; p.mat.needsUpdate = true; return markDirty(); }
  let t = texCache.get(media.el);
  if (!t) {
    t = media.kind === 'video' ? new THREE.VideoTexture(media.el) : new THREE.Texture(media.el);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; t.needsUpdate = true;
    const a = media.w / media.h, s = W / H;
    if (a > s) { t.repeat.set(s / a, 1); t.offset.set((1 - s / a) / 2, 0); } else { t.repeat.set(1, a / s); t.offset.set(0, (1 - a / s) / 2); }
    texCache.set(media.el, t);
  }
  p.mat.map = t; p.mat.needsUpdate = true; markDirty();
}
/* after a seek (export), push the new video frame to the GPU */
export function refreshVideos() { phones.forEach(p => { if (p.media?.kind === 'video') texCache.get(p.media.el).needsUpdate = true; }); markDirty(); }
export function setIsland(on) { island = on; phones.forEach(p => { p.isl.visible = on; }); markDirty(); }
export function setFinish(id) { const f = FINISHES[id] || FINISHES.natural; mats.frame.color.setHex(f.frame); mats.back.color.setHex(f.back); mats.plate.color.setHex(f.plate); markDirty(); }

/* ---------------------------------------------------------------- look: lighting + backdrop */
const D2R = Math.PI / 180, lerp3 = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
let floorBase = 0.34;
function fadeFloor(cam = camera) {
  const d = cam.position.clone().sub(floor.position), s = d.y / Math.max(1e-3, d.length());
  const k = Math.min(1, Math.max(0, (s - 0.06) / 0.3)); floor.material.opacity = floorBase * (0.25 + 0.75 * k * k * (3 - 2 * k));
}
export function applyLook(l) {
  look = { ...look, ...l };
  const az = look.lightAz * D2R, el = look.lightEl * D2R, amt = look.lightAmt / 100, warm = (look.warmth - 50) / 50, glare = look.glare / 100;
  key.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(30);
  const c = warm >= 0 ? lerp3([1, 1, 1], [1, 0.83, 0.64], warm) : lerp3([1, 1, 1], [0.78, 0.87, 1], -warm);
  key.color.setRGB(c[0], c[1], c[2]); key.intensity = 2.6 * amt;
  rim.position.set(-Math.sin(az) * 0.8, 0.35, -Math.cos(az)).multiplyScalar(30); rim.intensity = 1.3 * amt;
  scene.environmentIntensity = 0.3 + 0.7 * amt; scene.environmentRotation.set(0, az, 0);
  floorBase = 0.62 * look.shadow / 100; floor.visible = look.shadow > 1; fadeFloor();
  glassMat.clearcoat = glare; glassMat.specularIntensity = 0.4 + 1.6 * glare; glassMat.envMapIntensity = 0.3 + 1.7 * glare;
  markDirty();
}
const bgImgs = new Map();
export function bgImage(src) { if (!bgImgs.has(src)) { const im = new Image(); const p = new Promise(r => { im.onload = im.onerror = () => r(im); }); im.src = src; bgImgs.set(src, { im, p }); } return bgImgs.get(src); }
export const isImgBg = v => !!v && v !== 'transparent' && !v.startsWith('#');
export function paintBg(g, w, h, v) {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  if (!isImgBg(v)) { g.fillStyle = v; g.fillRect(0, 0, w, h); return; }
  const im = bgImage(v).im, iw = im.naturalWidth || 1, ih = im.naturalHeight || 1, k = Math.max(w / iw, h / ih);
  g.drawImage(im, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
}

/* ---------------------------------------------------------------- camera */
let pose = null, glide = null, shift = 0, panX = 0, panY = 0;   // pan: framing offset as a fraction of the frame (Space-drag), exported too
export function applyPose(p) {
  if (p.cam) { rig.rotation.set(...p.prot); rig.position.set(...(p.ppos || [0, 0, 0])); camera.position.set(...p.cam); camera.fov = p.fov || 26; camera.updateProjectionMatrix(); camera.lookAt(...p.target); return; }
  rig.rotation.set(p.rx, p.ry, p.rz); rig.position.set(p.px || 0, p.py || 0, 0);
  camera.position.set(0, p.camY, p.dist); camera.fov = p.fov || 26; camera.updateProjectionMatrix(); camera.lookAt(0, p.tY, 0);
}
export function setPose(p) { pose = p; controls.enabled = !p; if (p) applyPose(p); markDirty(); }
export const hasPose = () => !!pose;
function poseToView(p) { if (p.cam) return p; const d = { rx: 0, ry: 0, rz: 0, dist: 23, camY: 0.6, tY: -0.2, fov: 26, ...p }; return { cam: [0, d.camY, d.dist], target: [0, d.tY, 0], prot: [d.rx, d.ry, d.rz], fov: d.fov }; }
export function currentView() { return { cam: camera.position.toArray(), target: controls.target.toArray(), prot: [rig.rotation.x, rig.rotation.y, rig.rotation.z], fov: camera.fov }; }
export function getView() {
  let target = controls.target.clone();
  if (pose) { const dir = new THREE.Vector3(); camera.getWorldDirection(dir); target = camera.position.clone().add(dir.multiplyScalar(camera.position.distanceTo(rig.position))); }
  return { cam: camera.position.toArray(), target: target.toArray(), prot: [rig.rotation.x, rig.rotation.y, rig.rotation.z], fov: camera.fov, ppos: rig.position.toArray() };
}
export function freeAt(v) { pose = null; glide = null; controls.enabled = true; rig.rotation.set(...v.prot); rig.position.set(...(v.ppos || [0, 0, 0])); camera.position.fromArray(v.cam); controls.target.fromArray(v.target); camera.fov = v.fov || 26; camera.updateProjectionMatrix(); camera.lookAt(controls.target); markDirty(); }
export function glideTo(p, ms = 700) {
  pose = null; controls.enabled = true; rig.position.set(0, 0, 0);
  const a = currentView(), b = poseToView(p), t0 = performance.now(), L = (x, y, k) => x + (y - x) * k;
  glide = now => {
    const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.set(...a.cam.map((v, i) => L(v, b.cam[i], e))); controls.target.set(...a.target.map((v, i) => L(v, b.target[i], e)));
    rig.rotation.set(...a.prot.map((v, i) => L(v, b.prot[i], e))); camera.fov = L(a.fov, b.fov || 26, e); camera.updateProjectionMatrix(); camera.lookAt(controls.target);
    if (k >= 1) glide = null;
  };
  markDirty();
}
export function setShift(x) { shift = x; markDirty(); }
function applyShift(w, h) { if (Math.abs(shift) < 1e-4 && !panX && !panY) camera.clearViewOffset(); else camera.setViewOffset(w, h, -shift * w * 0.22 - panX * w, -panY * h, w, h); }
export function setPan(x, y) { panX = x || 0; panY = y || 0; markDirty(); }

/* ---------------------------------------------------------------- live view */
let frameAspect = null, backdrop = '#ffffff', checker = false, playing = false;
export function setPlaying(on) { playing = on; }
export function setFrame(a) { frameAspect = a; resize(); }
export function setBackdrop(v, check = false) {
  backdrop = v || backdrop; checker = check;
  const el = wrapEl;
  el.classList.toggle('check', checker);
  el.style.background = checker ? '' : isImgBg(backdrop) ? `center / cover no-repeat url("${backdrop}") #fff` : backdrop;
  if (isImgBg(backdrop)) bgImage(backdrop);
  markDirty();
}
export function resize() {
  if (!renderer) return;
  const host = wrapEl.parentElement.getBoundingClientRect(), pad = 24;
  let w = Math.max(40, host.width - pad * 2), h = Math.max(40, host.height - pad * 2);
  if (frameAspect) { if (w / h > frameAspect) w = Math.round(h * frameAspect); else h = Math.round(w / frameAspect); }
  Object.assign(wrapEl.style, { width: w + 'px', height: h + 'px' });
  renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = w / h; camera.updateProjectionMatrix(); markDirty();
}
function loop(now) {
  requestAnimationFrame(loop);
  if (glide) { glide(now); needsRender = true; } else if (!pose) controls.update(); else applyPose(pose);
  if (playing || phones.some(p => p.media?.kind === 'video' && !p.media.el.paused)) needsRender = true;
  if (!needsRender) return;
  needsRender = false;
  const w = renderer.domElement.width / renderer.getPixelRatio(), h = renderer.domElement.height / renderer.getPixelRatio();
  applyShift(w, h); fadeFloor(); renderer.render(scene, camera);
}

/* ---------------------------------------------------------------- direct manipulation
   drag a phone: it follows the cursor (in the plane facing the camera)   option-drag: turn it   shift-drag: closer / further
   drag empty space: orbit the camera   Space-drag: pan the framing   double-click empty space: reset the view */
export const hooks = { pick: null, dragStart: null, poseDrag: null, dragEnd: null, pan: null, panEnd: null, orbit: null, reset: null };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function castAt(cx, cy) { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); rig.updateMatrixWorld(); return ray; }
function hitAt(cx, cy) { const h = castAt(cx, cy).intersectObjects(phones.map(p => p.hit), false)[0]; return h ? { i: phones.findIndex(p => p.hit === h.object), point: h.point } : null; }
export function pickAt(cx, cy) { const h = hitAt(cx, cy); return h ? h.i : -1; }
let spaceHeld = false, spaceUsed = false;
export const spaceWasUsed = () => spaceUsed;
const editing = () => { const a = document.activeElement; return a && (a.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox'); };
function initInteract() {
  const frame = wrapEl, plane = new THREE.Plane(), hp = new THREE.Vector3(), cl = (v, a, b) => Math.min(b, Math.max(a, v));
  let drag = null;
  frame.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (spaceHeld) { drag = { mode: 'pan', x: e.clientX, y: e.clientY, px: panX, py: panY }; spaceUsed = true; }
    else {
      const h = hitAt(e.clientX, e.clientY);
      if (!h) { if (pose) hooks.orbit?.(); return; }            // empty space: OrbitControls takes it (after an unlock, if a camera move was driving)
      if (h.i !== sel) hooks.pick?.(h.i);
      hooks.dragStart?.();
      const p = phones[h.i].pose;
      if (e.altKey) drag = { mode: 'turn', i: h.i, x: e.clientX, y: e.clientY, pose: { ...p } };
      else if (e.shiftKey) drag = { mode: 'depth', i: h.i, y: e.clientY, pose: { ...p } };
      else { plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), h.point); drag = { mode: 'move', i: h.i, start: rig.worldToLocal(h.point.clone()), pose: { ...p } }; }
    }
    e.stopPropagation(); e.preventDefault(); frame.setPointerCapture(e.pointerId); frame.classList.add('dragging');
  }, true);
  frame.addEventListener('pointermove', e => {
    if (!drag) { if (!e.buttons) frame.classList.toggle('over-phone', !spaceHeld && pickAt(e.clientX, e.clientY) >= 0); return; }
    if (drag.mode === 'pan') { const r = renderer.domElement.getBoundingClientRect(); setPan(drag.px + (e.clientX - drag.x) / r.width, drag.py + (e.clientY - drag.y) / r.height); hooks.pan?.(panX, panY); return; }
    if (drag.mode === 'turn') return hooks.poseDrag?.(drag.i, { ry: drag.pose.ry + (e.clientX - drag.x) * 0.006, rx: cl(drag.pose.rx + (e.clientY - drag.y) * 0.006, -1.5, 1.5) });
    if (drag.mode === 'depth') return hooks.poseDrag?.(drag.i, { z: cl(drag.pose.z + (e.clientY - drag.y) * 0.04, -20, 10) });
    if (!castAt(e.clientX, e.clientY).ray.intersectPlane(plane, hp)) return;
    const l = rig.worldToLocal(hp.clone());
    hooks.poseDrag?.(drag.i, { x: drag.pose.x + l.x - drag.start.x, y: drag.pose.y + l.y - drag.start.y, z: drag.pose.z + l.z - drag.start.z });
  });
  const end = () => { if (!drag) return; const m = drag.mode; drag = null; frame.classList.remove('dragging'); m === 'pan' ? hooks.panEnd?.() : hooks.dragEnd?.(); };
  frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
  frame.addEventListener('dblclick', e => { if (pickAt(e.clientX, e.clientY) < 0) hooks.reset?.(); });
  addEventListener('keydown', e => { if (e.key !== ' ' || editing()) return; e.preventDefault(); if (!e.repeat && !spaceHeld) { spaceHeld = true; spaceUsed = false; frame.classList.add('panning'); frame.classList.remove('over-phone'); } }, true);
  const release = () => { spaceHeld = false; frame.classList.remove('panning'); };
  addEventListener('keyup', e => { if (e.key === ' ') release(); }, true);
  addEventListener('blur', release);
}
/* the home view, for resets */
export function goHome(ms = 600) { glideTo({ cam: HOME.pos.toArray(), target: HOME.target.toArray(), prot: [0.03, 0.3, 0], fov: 26 }, ms); }

/* ---------------------------------------------------------------- export renders */
const xr = {};
function offscreen(alpha) {
  if (!xr[alpha]) { xr[alpha] = new THREE.WebGLRenderer({ antialias: true, alpha, preserveDrawingBuffer: true }); setup(xr[alpha]); xr[alpha].setPixelRatio(1); }
  return xr[alpha];
}
const envs = new WeakMap();
function envFor(r) { if (!envs.has(r)) { const pm = new THREE.PMREMGenerator(r); envs.set(r, pm.fromScene(new RoomEnvironment(), 0.04).texture); pm.dispose(); } return envs.get(r); }
let comp = null;
/* one frame at w x h. p: a camera pose (or null for the camera as it is now). bg: hex, image URL, or 'transparent' */
export function renderFrame(w, h, p, bg) {
  const img = isImgBg(bg), transparent = bg === 'transparent' || img, r = offscreen(transparent);
  r.setSize(w, h, false);
  if (transparent) r.setClearColor(0x000000, 0); else r.setClearColor(new THREE.Color(bg), 1);
  const aspect = camera.aspect; camera.aspect = w / h;
  if (p) applyPose(p); camera.updateProjectionMatrix(); applyShift(w, h);
  phones.forEach(ph => { ph.ring.visible = false; });
  fadeFloor(); const env0 = scene.environment; scene.environment = envFor(r);
  r.render(scene, camera);
  scene.environment = env0; select(sel);
  camera.aspect = aspect; camera.updateProjectionMatrix(); if (pose) applyPose(pose); markDirty();
  if (!img) return r.domElement;
  comp = comp || document.createElement('canvas'); if (comp.width !== w || comp.height !== h) { comp.width = w; comp.height = h; }
  const g = comp.getContext('2d'); g.clearRect(0, 0, w, h); paintBg(g, w, h, bg); g.drawImage(r.domElement, 0, 0, w, h); return comp;
}
export const frameRect = () => renderer.domElement.getBoundingClientRect();
