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
import { buildSpaceNeedle, buildMonorail, westinBuildings, buildSpheres, buildArtworks, BEAM_TOP } from './landmarks.js';
import { Sky } from './sky.js';
import { makeFilm } from './film.js';
import { buildRain, sunPosition, todFromElevation } from './weather.js';
import { animateWater, buildFerry } from './bay.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const params = new URLSearchParams(location.search);
const uniforms = { uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 } };

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
// soft image-based light so glass and wet streets have something to reflect
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

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
const weather = { rain: params.has('rain') ? 1 : 0, rainTarget: params.has('rain') ? 1 : 0, live: params.has('live'), liveSun: null };
const GRAY_TOP = new THREE.Color('#8e99a4'), GRAY_BOT = new THREE.Color('#c9d0d5');
function applyTime(t) {
  timeOfDay = t;
  applyLighting();
}
function applyLighting() {
  const t = timeOfDay, r = weather.rain;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const a = K[i], b = K[i + 1];
  const f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  const L = (k) => a[k] + (b[k] - a[k]) * f;
  // live mode: the real sun over Seattle (moon-ish light when it is down)
  const ls = weather.live && weather.liveSun && weather.liveSun.el > 0 ? weather.liveSun : null;
  const el = ls ? Math.max(ls.el, 3) : L('el'), az = ls ? ls.az : L('az');
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(180 - az));
  sun.color.copy(lerpC(a.sun, b.sun, f)).lerp(GRAY_BOT, r * 0.6);
  sun.intensity = L('si') * (1 - 0.72 * r);
  hemi.color.copy(lerpC(a.sky, b.sky, f)).lerp(GRAY_BOT, r * 0.5);
  hemi.groundColor.copy(lerpC(a.gnd, b.gnd, f));
  hemi.intensity = L('hi') * 0.78 * (1 + 0.15 * r);
  renderer.toneMappingExposure = L('exp') * 0.94;
  const night = THREE.MathUtils.smoothstep(t, 0.6, 0.93);
  const top = lerpC(a.top, b.top, f), bot = lerpC(a.bot, b.bot, f);
  sky.set(top.lerp(GRAY_TOP.clone().multiplyScalar(1 - 0.8 * night), r * 0.75), bot.lerp(GRAY_BOT.clone().multiplyScalar(1 - 0.8 * night), r * 0.75));
  sky.fog.near = 3300 - 600 * r; sky.fog.far = 8200 - 2600 * r;
  scene.environmentIntensity = (0.16 + 0.22 * r) * (1 - 0.75 * night);
  uniforms.uWet.value = r;
  if (ground.meshes.roads) {
    ground.meshes.roads.material.roughness = 0.85 - 0.6 * r;
    ground.meshes.roads.material.emissive.set('#ff9d4d').multiplyScalar(0.11 * night);   // sodium streetlight glow
  }
  if (ground.meshes.walks) ground.meshes.walks.material.roughness = 0.95 - 0.5 * r;
  uniforms.uNight.value = night;
  bloom.strength = 0.05 + uniforms.uNight.value * 0.5;
  bloom.threshold = 1.2 - uniforms.uNight.value * 0.42;
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
sky.setExtent(data.meta.extent);
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

const spheres = data.landmarks.spheres?.length ? buildSpheres(data.landmarks.spheres, uniforms) : null;
if (spheres) scene.add(spheres.group);
scene.add(buildArtworks(data.artworks || []));

if (ground.waterMat) animateWater(ground.waterMat, uniforms);
const ferry = buildFerry(data.water, data.meta.extent, uniforms);
if (ferry) scene.add(ferry.group);
const rain = buildRain();
scene.add(rain.object);

// ------------------------------------------------------------------ labels
const labelRoot = document.getElementById('labels');
const labels = [];
function addLabel(text, sub, pos, minZoom = 0) {
  const el = document.createElement('div');
  el.className = 'label' + (minZoom ? ' minor' : '');
  el.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
  labelRoot.appendChild(el);
  labels.push({ el, pos, minZoom });
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
for (const [text, sub, px, py, ph] of data.places || []) addLabel(text, sub, toV3(px, py, ph), 1.6);
const v = new THREE.Vector3();
function updateLabels() {
  const show = document.body.classList.contains('labels-on');
  for (const l of labels) {
    v.copy(l.pos).project(camera);
    const off = Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || camera.zoom < l.minZoom;
    l.el.style.display = show && !off ? '' : 'none';
    if (!off) l.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
  }
}

// ------------------------------------------------------------------ views
const needleV = toV3(nx, ny, 60);
const westinV = w0.length ? toV3(w0[0][0], w0[0][1], 40) : needleV;
const centerV = needleV.clone().lerp(westinV, 0.45).setY(0);
const sph = data.landmarks.spheres || [];
const spheresV = sph.length ? toV3(sph.reduce((a, b) => a + b[0], 0) / sph.length, sph.reduce((a, b) => a + b[1], 0) / sph.length, 15) : westinV;
const ospP = (data.places || []).find((p) => /sculpture/i.test(p[0]));
const ospV = ospP ? toV3(ospP[2], ospP[3], 5) : centerV;
const VIEWS = {
  spheres: { target: spheresV, az: 0.9, polar: 0.55, zoom: 10 },
  osp: { target: ospV, az: 0.3, polar: 1.0, zoom: 5.5 },
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

// things every frame needs, live or in the film
function tickWorld(t, dt) {
  uniforms.uTime.value = t;
  weather.rain += (weather.rainTarget - weather.rain) * Math.min(1, dt * 0.8);
  if (Math.abs(weather.rain - weather.rainTarget) < 0.002) weather.rain = weather.rainTarget;
  if (weather.live && filmT < 0 && !capture) {
    const now = new Date();
    weather.liveSun = sunPosition(now);
    const afternoon = weather.liveSun.az > 180;
    timeOfDay = todFromElevation(weather.liveSun.el, afternoon);
    slider.value = timeOfDay;
    clockEl.textContent = now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }) + ' in Seattle';
  }
  applyLighting();
  needle.update(t);
  mono.update(t);
  spheres?.update(t);
  ferry?.update(t);
  traffic.update(dt);
  rain.update(t, controls.target, camera.zoom, weather.rain * THREE.MathUtils.clamp((camera.zoom - 0.6) / 3, 0.2, 1), uniforms.uNight.value);
  sky.update(camera, controls, { sun: sun.color, night: uniforms.uNight.value, time: t, rain: weather.rain });
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
const clockEl = document.getElementById('clock');
slider.value = timeOfDay;
const toast = (msg) => {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200);
};
function setToggle(id, on) { document.getElementById(id).classList.toggle('on', on); }
function setLive(on) {
  weather.live = on; setToggle('live', on); document.body.classList.toggle('live', on);
  if (on) toast('Sun and sky now follow the real clock in Seattle');
}
slider.addEventListener('input', () => { if (weather.live) setLive(false); applyTime(parseFloat(slider.value)); });
document.getElementById('rain').addEventListener('click', () => {
  weather.rainTarget = weather.rainTarget > 0.5 ? 0 : 1; setToggle('rain', weather.rainTarget > 0.5);
  if (weather.rainTarget) toast('Classic Seattle drizzle');
});
document.getElementById('live').addEventListener('click', () => setLive(!weather.live));
setToggle('rain', weather.rainTarget > 0.5);
if (weather.live) setLive(true);
document.getElementById('orbit').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate; controls.autoRotateSpeed = 0.6; setToggle('orbit', controls.autoRotate);
});

// share the exact view as a link
function viewParams() {
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const p = new URLSearchParams();
  p.set('cam', [controls.target.x, controls.target.z, sph.theta, sph.phi, camera.zoom].map((n) => +n.toFixed(3)).join(','));
  p.set('t', timeOfDay.toFixed(3));
  if (weather.rainTarget) p.set('rain', '1');
  if (weather.live) p.set('live', '1');
  if (!tiltOn) p.set('tilt', '0');
  return p;
}
document.getElementById('share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?${viewParams()}`;
  history.replaceState(null, '', url);
  try { await navigator.clipboard.writeText(url); toast('Link to this exact view copied'); } catch { toast('Link is in the address bar'); }
});

// 4K still: re-render at higher resolution and download a PNG
document.getElementById('photo').addEventListener('click', () => {
  const pr = renderer.getPixelRatio();
  const scale = Math.max(1, 3840 / innerWidth);
  renderer.setPixelRatio(scale); composer.setPixelRatio(scale);
  updateSun(); composer.render();
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seattle-diorama-${Date.now()}.png`; a.click();
    renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
    toast('Saved a 4K still');
  }, 'image/png');
});
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
if (params.has('cam')) {
  const [cx, cz, az, polar, zoom] = params.get('cam').split(',').map(Number);
  if ([cx, cz, az, polar, zoom].every(Number.isFinite)) setView({ target: new THREE.Vector3(cx, 0, cz), az, polar, zoom });
}
if (params.has('follow')) { // e.g. ?follow=0 rides along with the Red train
  follow = mono.trains[parseInt(params.get('follow'), 10) || 0];
  mono.update(simT);
  setView({ target: follow.pos.clone(), az: 0.9, polar: 1.0, zoom: 8 });
}
loading.remove();
document.body.classList.add('ready');

// ------------------------------------------------------------------ film
const film = makeFilm({ VIEWS, mono, needleV, westinV, centerV, spheresV, ospV });
let filmT = -1;            // < 0 when not playing
let recorder = null;
function filmFrame(ft, dt) {
  simT = film.simOffset + ft;
  const shot = film.at(ft);
  timeOfDay = shot.tod;
  setView(shot);
  tickWorld(simT, dt);
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
if (capture || params.get('ui') === '0') document.body.classList.add('film');
if (!capture) renderer.setAnimationLoop(() => {
  if (stillFrames && ++total > stillFrames) { renderer.setAnimationLoop(null); document.body.classList.add('still-done'); return; }
  timer.update();
  const dt = stillFrames ? 1 / 60 : Math.min(timer.getDelta(), 0.1);
  if (filmT >= 0) {
    filmT += dt;
    if (filmT > film.duration) endFilm(); else { filmFrame(filmT, dt); return; }
  }
  simT += dt;
  stepTween(dt);
  if (follow && !tween) {
    const d = follow.pos.clone().sub(controls.target);
    controls.target.add(d); camera.position.add(d);
  } else if (follow && tween) {
    tween.goal.target.copy(follow.pos);
  }
  controls.update(dt);
  clampTarget();
  tickWorld(simT, dt);
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
