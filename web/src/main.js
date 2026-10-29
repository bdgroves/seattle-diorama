import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

import { buildBuildings, buildGround, toV3 } from './city.js';
import { buildTrees, buildTraffic } from './life.js';
import { buildSpaceNeedle, buildMonorail, westinBuildings, BEAM_TOP } from './landmarks.js';
import { Sky } from './sky.js';
import { makeFilm } from './film.js';

const params = new URLSearchParams(location.search);
const uniforms = { uNight: { value: 0 } };

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();

// ------------------------------------------------------------------ camera
const VIEW_H = 1500; // meters visible vertically at zoom 1
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -6000, 12000);
function fitCamera() {
  const a = innerWidth / innerHeight;
  camera.left = (-VIEW_H * a) / 2; camera.right = (VIEW_H * a) / 2;
  camera.top = VIEW_H / 2; camera.bottom = -VIEW_H / 2;
  camera.updateProjectionMatrix();
}
fitCamera();

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.12;          // near top-down
controls.maxPolarAngle = 1.32;          // almost street level
controls.minZoom = 0.7;
controls.maxZoom = 22;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;    // pan across the ground plane
controls.rotateSpeed = 0.55;

function setView({ target, az, polar, zoom, dist = 3000 }) {
  controls.target.copy(target);
  const p = new THREE.Vector3().setFromSphericalCoords(dist, polar, az).add(target);
  camera.position.copy(p);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  controls.update();
}

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight('#cfe6f5', '#b8a990', 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
sun.shadow.radius = 2;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 6000;
scene.add(sun, sun.target);

const sky = new Sky(scene);

// ------------------------------------------------------------------ post
const composer = new EffectComposer(renderer,
  new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.55, 0.9);
composer.addPass(bloom);
const tiltH = new ShaderPass(HorizontalTiltShiftShader);
const tiltV = new ShaderPass(VerticalTiltShiftShader);
composer.addPass(tiltH); composer.addPass(tiltV);
composer.addPass(new OutputPass());
let tiltOn = params.get('tilt') !== '0';
function setTilt() {
  const amt = tiltOn ? 1.6 : 0;
  tiltH.uniforms.h.value = amt / innerWidth;
  tiltV.uniforms.v.value = amt / innerHeight;
  tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
  tiltH.enabled = tiltV.enabled = tiltOn;
}
setTilt();

// ------------------------------------------------------------------ time of day
// t: 0 = late morning, 0.5 = golden hour, 1 = night
const K = [
  { t: 0.0, az: 160, el: 46, sun: '#fffaf0', si: 2.9, sky: '#d8ecf8', gnd: '#c2b8a4', hi: 1.35, top: '#8fc0e3', bot: '#eef4f3', exp: 1.08 },
  { t: 0.5, az: 236, el: 13, sun: '#ffbf80', si: 2.7, sky: '#ffe2c4', gnd: '#9a8a78', hi: 1.0, top: '#e5a585', bot: '#fde8cf', exp: 1.1 },
  { t: 0.75, az: 255, el: 2, sun: '#ff7f5a', si: 0.9, sky: '#8b7fae', gnd: '#3c3446', hi: 0.55, top: '#3a3f72', bot: '#d38a7a', exp: 1.05 },
  { t: 1.0, az: 140, el: 38, sun: '#8ea6dc', si: 0.4, sky: '#2f4570', gnd: '#111827', hi: 0.55, top: '#060a16', bot: '#1c2645', exp: 1.15 },
];
const ca = new THREE.Color(), cb = new THREE.Color();
const lerpC = (a, b, t) => ca.set(a).lerp(cb.set(b), t).clone();
let timeOfDay = params.has('t') ? parseFloat(params.get('t')) : 0.36;
const sunDir = new THREE.Vector3();
function applyTime(t) {
  timeOfDay = t;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1];
  const f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  const L = (k) => a[k] + (b[k] - a[k]) * f;
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L('el')), THREE.MathUtils.degToRad(180 - L('az')));
  sun.color.copy(lerpC(a.sun, b.sun, f));
  sun.intensity = L('si');
  hemi.color.copy(lerpC(a.sky, b.sky, f));
  hemi.groundColor.copy(lerpC(a.gnd, b.gnd, f));
  hemi.intensity = L('hi');
  renderer.toneMappingExposure = L('exp');
  sky.set(lerpC(a.top, b.top, f), lerpC(a.bot, b.bot, f));
  uniforms.uNight.value = THREE.MathUtils.smoothstep(t, 0.6, 0.93);
  bloom.strength = 0.15 + uniforms.uNight.value * 0.5;
  bloom.threshold = 0.92 - uniforms.uNight.value * 0.15;
  document.body.classList.toggle('night', t > 0.62);
}

// ------------------------------------------------------------------ load city
const loading = document.getElementById('loading');
const res = await fetch('./data/scene.json');
if (!res.ok) {
  loading.innerHTML = 'No <code>scene.json</code> yet. Run <code>pixi run city</code> (or <code>pixi run demo</code>) first.';
  throw new Error('scene.json missing');
}
const data = await res.json();
const [x0, y0, x1, y1] = data.meta.extent;
const extent = { x0, y0, x1, y1 };

const ground = buildGround(data, data.meta);
scene.add(ground.group);
const allBuildings = data.buildings.concat(westinBuildings(data.landmarks.westin));
scene.add(buildBuildings(allBuildings, uniforms));
scene.add(buildTrees(data.trees));
const traffic = buildTraffic(data.lanes, uniforms);
scene.add(traffic.group);

const needle = buildSpaceNeedle(uniforms);
const [nx, ny] = data.landmarks.needle;
needle.group.position.copy(toV3(nx, ny, 0));
scene.add(needle.group);

const mono = buildMonorail(data.monorail, uniforms);
scene.add(mono.group);

// ------------------------------------------------------------------ labels
const labelRoot = document.getElementById('labels');
const labels = [];
function addLabel(text, sub, pos) {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
  labelRoot.appendChild(el);
  labels.push({ el, pos });
}
addLabel('Space Needle', '1962 · 605 ft', toV3(nx, ny, 196));
const w0 = data.landmarks.westin;
if (w0.length) {
  const cx = w0.reduce((s, w) => s + w[0], 0) / w0.length, cy = w0.reduce((s, w) => s + w[1], 0) / w0.length;
  addLabel('The Westin Seattle', 'twin towers · 5th Ave', toV3(cx, cy, Math.max(...w0.map((w) => w[3])) + 18));
}
const m0 = mono.trains[0].path;
const ms = m0.at(12), me = m0.at(m0.len - 10);
addLabel('Seattle Center Stn', 'Monorail', toV3(ms.x, ms.y, BEAM_TOP + 22));
addLabel('Westlake Stn', 'Monorail', toV3(me.x, me.y, BEAM_TOP + 22));
const v = new THREE.Vector3();
function updateLabels() {
  const show = document.body.classList.contains('labels-on');
  for (const l of labels) {
    v.copy(l.pos).project(camera);
    const off = Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
    l.el.style.display = show && !off ? '' : 'none';
    if (!off) l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}

// ------------------------------------------------------------------ views
const needleV = toV3(nx, ny, 60);
const westinV = w0.length ? toV3(w0[0][0], w0[0][1], 40) : needleV;
const centerV = needleV.clone().lerp(westinV, 0.45).setY(0);
const VIEWS = {
  overview: { target: centerV, az: 0.75, polar: 0.98, zoom: 1.4 },
  needle: { target: needleV, az: -0.55, polar: 1.12, zoom: 4.6 },
  westin: { target: westinV, az: 0.35, polar: 1.05, zoom: 5.2 },
};
let follow = null;
let tween = null;
function flyTo(name) {
  follow = null;
  const goal = VIEWS[name];
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  tween = { t: 0, from: { target: controls.target.clone(), az: sph.theta, polar: sph.phi, zoom: camera.zoom }, goal };
}
function stepTween(dt) {
  if (!tween) return;
  tween.t = Math.min(1, tween.t + dt / 1.6);
  const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
  const { from, goal } = tween;
  let dAz = goal.az - from.az;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
  setView({
    target: from.target.clone().lerp(goal.target, e),
    az: from.az + dAz * e,
    polar: from.polar + (goal.polar - from.polar) * e,
    zoom: from.zoom + (goal.zoom - from.zoom) * e,
  });
  if (tween.t >= 1) tween = null;
}

// ------------------------------------------------------------------ shadows follow the view
const shadowTmp = new THREE.Vector3();
function updateSun() {
  const halfView = (VIEW_H / camera.zoom) * 0.5 * Math.max(1, innerWidth / innerHeight);
  const size = THREE.MathUtils.clamp(halfView * 1.5, 220, 1500);
  const sc = sun.shadow.camera;
  if (Math.abs(sc.right - size) > 1) {
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.updateProjectionMatrix();
  }
  // snap the focus point to the shadow texel grid to stop shimmering
  const texel = (2 * size) / sun.shadow.mapSize.x;
  shadowTmp.copy(controls.target).setY(0);
  shadowTmp.x = Math.round(shadowTmp.x / texel) * texel;
  shadowTmp.z = Math.round(shadowTmp.z / texel) * texel;
  sun.target.position.copy(shadowTmp);
  sun.position.copy(shadowTmp).addScaledVector(sunDir, 2500);
}

// keep the camera over the diorama
function clampTarget() {
  const t = controls.target;
  const cx = THREE.MathUtils.clamp(t.x, x0, x1), cz = THREE.MathUtils.clamp(t.z, -y1, -y0);
  if (cx !== t.x || cz !== t.z) {
    const d = new THREE.Vector3(cx - t.x, 0, cz - t.z);
    t.add(d); camera.position.add(d);
  }
}

// ------------------------------------------------------------------ UI
const slider = document.getElementById('time');
slider.value = timeOfDay;
slider.addEventListener('input', () => applyTime(parseFloat(slider.value)));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => flyTo(b.dataset.view)));
document.querySelectorAll('[data-follow]').forEach((b) => b.addEventListener('click', () => {
  tween = null;
  follow = mono.trains[parseInt(b.dataset.follow, 10)];
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  tween = { t: 0, from: { target: controls.target.clone(), az: sph.theta, polar: sph.phi, zoom: camera.zoom },
    goal: { target: follow.pos.clone(), az: sph.theta, polar: Math.min(sph.phi, 1.08), zoom: 7 } };
}));
document.getElementById('tilt').addEventListener('click', (e) => {
  tiltOn = !tiltOn; setTilt(); e.currentTarget.classList.toggle('on', tiltOn);
});
document.getElementById('tilt').classList.toggle('on', tiltOn);
document.getElementById('lbl').addEventListener('click', (e) => {
  document.body.classList.toggle('labels-on'); e.currentTarget.classList.toggle('on');
});
canvas.addEventListener('pointerdown', () => { tween = null; });
controls.addEventListener('start', () => { if (!follow) tween = null; });
addEventListener('keydown', (e) => { if (e.key === 'Escape') follow = null; });
document.getElementById('meta').textContent =
  `${data.buildings.length.toLocaleString()} buildings · ${(data.trees.length / 4).toLocaleString()} trees · ${data.meta.attribution}`;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fitCamera(); setTilt();
});

// ------------------------------------------------------------------ go
let simT = params.has('sim') ? parseFloat(params.get('sim')) : 0;
applyTime(timeOfDay);
setView(VIEWS[params.get('view')] || VIEWS.overview);
if (params.has('follow')) { // e.g. ?follow=0 rides along with the Red train
  follow = mono.trains[parseInt(params.get('follow'), 10) || 0];
  mono.update(simT);
  setView({ target: follow.pos.clone(), az: 0.9, polar: 1.0, zoom: 8 });
}
loading.remove();
document.body.classList.add('ready');

// ------------------------------------------------------------------ film
const film = makeFilm({ VIEWS, mono, needleV, westinV, centerV });
let filmT = -1;            // < 0 when not playing
let recorder = null;
function filmFrame(ft, dt) {
  simT = film.simOffset + ft;
  needle.update(simT);
  mono.update(simT);
  traffic.update(dt);
  const shot = film.at(ft);
  applyTime(shot.tod);
  setView(shot);
  updateSun();
  composer.render();
}
function startFilm(record) {
  follow = null; tween = null;
  document.body.classList.add('film');
  controls.enabled = false;
  filmT = 0;
  if (record) {
    const stream = canvas.captureStream(60);
    const type = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm']
      .find((m) => MediaRecorder.isTypeSupported(m));
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 24_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type }));
      a.download = `seattle-diorama.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      a.click();
    };
    recorder.start();
  }
}
function endFilm() {
  filmT = -1;
  recorder?.stop(); recorder = null;
  document.body.classList.remove('film');
  controls.enabled = true;
  slider.value = timeOfDay;
}
document.getElementById('play').addEventListener('click', () => startFilm(false));
document.getElementById('rec').addEventListener('click', () => startFilm(true));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && filmT >= 0) endFilm(); });
if (params.get('film') === 'play') startFilm(false);

const timer = new THREE.Timer();
timer.connect(document);
const fpsEl = document.getElementById('fps');
let frames = 0, fpsT = 0, total = 0;
const stillFrames = params.has('still') ? parseInt(params.get('still') || '3', 10) : 0; // for screenshots
const capture = params.get('film') === 'capture';
if (capture) document.body.classList.add('film');
if (!capture) renderer.setAnimationLoop(() => {
  if (stillFrames && ++total > stillFrames) { renderer.setAnimationLoop(null); document.body.classList.add('still-done'); return; }
  timer.update();
  const dt = stillFrames ? 1 / 60 : Math.min(timer.getDelta(), 0.1);
  if (filmT >= 0) {
    filmT += dt;
    if (filmT > film.duration) endFilm(); else { filmFrame(filmT, dt); return; }
  }
  simT += dt;
  needle.update(simT);
  mono.update(simT);
  traffic.update(dt);
  stepTween(dt);
  if (follow && !tween) {
    const d = follow.pos.clone().sub(controls.target);
    controls.target.add(d); camera.position.add(d);
  } else if (follow && tween) {
    tween.goal.target.copy(follow.pos);
  }
  controls.update();
  clampTarget();
  updateSun();
  composer.render();
  updateLabels();
  frames++; fpsT += dt;
  if (fpsT > 0.5) { fpsEl.textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
});

window.__diorama = {
  applyTime, flyTo, camera, controls, setView, VIEWS,
  film: {
    duration: film.duration,
    // render film frame at time t (s) and return it as a data URL
    frame(t, dt, type = 'image/png', quality = 0.95) { filmFrame(t, dt); return canvas.toDataURL(type, quality); },
  },
};
document.body.classList.add('booted');
