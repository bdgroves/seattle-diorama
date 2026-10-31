// The character studio: the Alpabzug queen and the alphorn player on a little
// round meadow, with the Matterhorn painted on the backdrop. Spin them, change
// the cow, and press play to hear the alphorn (synthesised from its natural
// harmonics, alphorn-fa and all) echo off the mountains.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildCow } from './cow.js';
import { buildAlphornist } from './alphorn.js';
import { canvasTex, drawEdelweiss } from './geo.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('still') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
camera.position.set(5.4, 2.1, 5.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.4, 1.1, 0.1);
controls.enableDamping = true;
controls.minDistance = 1.5; controls.maxDistance = 18;
controls.maxPolarAngle = 1.52;
controls.update();

// ---- sky and the painted backdrop: the Matterhorn over green hills.
// A cylinder 30 m out, 23.5 m tall, painted at 21.8 px per metre so nothing stretches.
const PX = 4096 / (2 * Math.PI * 30);
const backdrop = canvasTex(4096, 512, (x, w, h) => {
  const Y = (m) => h - (m + 3) * PX;          // metres above the meadow -> canvas y
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5f9ad8'); sky.addColorStop(0.55, '#a9cdee'); sky.addColorStop(0.8, '#dceaf4'); sky.addColorStop(1, '#eef4f6');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  // a few fair-weather clouds
  x.fillStyle = 'rgba(255,255,255,0.75)';
  for (let k = 0; k < 14; k++) {
    const cx = (k * 293) % w, cy = Y(9 + (k % 4) * 2.2);
    for (let b = 0; b < 5; b++) { x.beginPath(); x.ellipse(cx + b * 26, cy - (b % 2) * 10, 34, 16, 0, 0, Math.PI * 2); x.fill(); }
  }
  // far snowy ranges all round
  const range = (top, amp, col, snowAbove, seed) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
    const ys = [];
    for (let i = 0; i <= w; i += 6) {
      const m = top - amp * (0.5 + 0.5 * Math.sin(i * 0.011 + seed) * Math.sin(i * 0.0047 + seed * 2)) - Math.abs(Math.sin(i * 0.031 + seed)) * amp * 0.25;
      ys.push([i, Y(m)]); x.lineTo(i, Y(m));
    }
    x.lineTo(w, h); x.closePath(); x.fill();
    if (snowAbove != null) {
      x.save(); x.beginPath(); x.moveTo(0, h); for (const [i, y] of ys) x.lineTo(i, y); x.lineTo(w, h); x.closePath(); x.clip();
      x.fillStyle = 'rgba(255,255,255,0.88)'; x.fillRect(0, 0, w, Y(snowAbove)); x.restore();
    }
  };
  range(4.6, 2.2, '#93a5bb', 3.4, 1);
  // the Matterhorn, with its hooked summit leaning east
  const M = (mx) => {
    const P = (dx, m) => [mx + dx * PX, Y(m)];
    const shape = [P(-5.5, 0.6), P(-1.6, 4.2), P(-0.5, 6.6), P(0.15, 6.8), P(0.6, 5.9), P(1.8, 4.3), P(5.8, 0.6)];
    x.fillStyle = '#6f7888'; x.beginPath(); x.moveTo(...shape[0]); for (const q of shape.slice(1)) x.lineTo(...q); x.closePath(); x.fill();
    x.fillStyle = '#8b94a3'; x.beginPath(); x.moveTo(...P(0.15, 6.8)); x.lineTo(...P(0.6, 5.9)); x.lineTo(...P(1.8, 4.3)); x.lineTo(...P(5.8, 0.6)); x.lineTo(...P(0.4, 0.6)); x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.beginPath(); x.moveTo(...P(-0.5, 6.6)); x.lineTo(...P(0.15, 6.8)); x.lineTo(...P(0.6, 5.9)); x.lineTo(...P(0.1, 5.6)); x.lineTo(...P(-0.55, 6.0)); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(...P(-1.6, 4.2)); x.lineTo(...P(-2.4, 3.3)); x.lineTo(...P(-1.3, 3.6)); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(...P(1.8, 4.3)); x.lineTo(...P(2.9, 3.2)); x.lineTo(...P(1.9, 3.5)); x.closePath(); x.fill();
  };
  M(w * 0.5);
  range(1.2, 1.0, '#6f9a52', null, 3);
  range(0.4, 0.5, '#5f8a45', null, 5);
}, [1, 1]);
const sky = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 512 / PX, 96, 1, true), new THREE.MeshBasicMaterial({ map: backdrop, side: THREE.BackSide, fog: false, toneMapped: false }));
sky.position.y = 512 / PX / 2 - 3;
sky.rotation.y = params.has('skyrot') ? parseFloat(params.get('skyrot')) : 0.8;
scene.add(sky);
scene.background = new THREE.Color('#5f9ad8');
// far meadows out to the backdrop
const far = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#6c9446', roughness: 1 }));
far.position.y = -0.62;
scene.add(far);
scene.background = new THREE.Color('#cfe3f3');

// ---- light: high summer sun
scene.add(new THREE.HemisphereLight('#dceeff', '#6b7d48', 1.0));
const sun = new THREE.DirectionalLight('#fff3df', 2.8);
sun.position.set(6, 11, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---- the meadow: a round sod with a cut edge, grass and alpine flowers
const meadow = new THREE.Group();
scene.add(meadow);
const grassTex = canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#6e9a43'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = ['#5f8a3a', '#7aa84d', '#86b456', '#668f3e'][i % 4];
    x.fillRect(Math.random() * w, Math.random() * h, 2, 5);
  }
}, [6, 6]);
const top = new THREE.Mesh(new THREE.CircleGeometry(5.2, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
top.receiveShadow = true;
meadow.add(top);
const side = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.0, 0.6, 64, 1, true), new THREE.MeshStandardMaterial({
  map: canvasTex(1024, 128, (x, w, h) => {
    x.fillStyle = '#5a4130'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#4b6e33'; x.fillRect(0, 0, w, 16);
    for (let i = 0; i < 600; i++) { x.fillStyle = ['#7d6a5c', '#6b5444', '#8c8278'][i % 3]; x.beginPath(); x.arc(Math.random() * w, 24 + Math.random() * (h - 24), 2 + Math.random() * 6, 0, Math.PI * 2); x.fill(); }
  }, [4, 1]), roughness: 1,
}));
side.position.y = -0.3;
meadow.add(side);
// grass tufts and flowers
{
  const tuft = new THREE.ConeGeometry(0.03, 0.14, 4).translate(0, 0.07, 0);
  const n = 2600;
  const im = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: '#7aa84d', roughness: 0.9 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 5.1 * Math.sqrt(Math.random());
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4));
    s.setScalar(0.6 + Math.random() * 0.9);
    im.setMatrixAt(i, m4.compose(p, q, s));
  }
  im.receiveShadow = true;
  meadow.add(im);
  const FL = ['#ffffff', '#f2c230', '#3f6fd0', '#e86aa4', '#d6202c', '#b27ad8'];
  const fg = new THREE.SphereGeometry(0.022, 6, 4).translate(0, 0.1, 0);
  const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 180);
  const col = new THREE.Color();
  for (let i = 0; i < 180; i++) {
    const a = Math.random() * Math.PI * 2, r = 5.0 * Math.sqrt(Math.random());
    p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    fm.setMatrixAt(i, m4.compose(p, q.identity(), s.setScalar(0.7 + Math.random() * 0.6)));
    fm.setColorAt(i, col.set(FL[i % FL.length]));
  }
  meadow.add(fm);
  // a few edelweiss on a rock
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1).scale(1.3, 0.6, 1), new THREE.MeshStandardMaterial({ color: '#8f8c86', roughness: 0.95, flatShading: true }));
  rock.position.set(2.6, 0.1, -2.6);
  rock.castShadow = rock.receiveShadow = true;
  meadow.add(rock);
  const ew = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); drawEdelweiss(x, 32, 32, 30, 8); }), transparent: true, side: THREE.DoubleSide });
  for (let k = 0; k < 5; k++) {
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16).rotateX(-Math.PI / 2), ew);
    e.position.set(2.3 + k * 0.14, 0.32 + (k % 2) * 0.03, -2.45 - (k % 3) * 0.1);
    meadow.add(e);
  }
  // a little milking stool and a wooden fence post
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.8 });
  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), wood);
  seat.position.y = 0.3; stool.add(seat);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), wood);
  leg.position.y = 0.15; stool.add(leg);
  stool.position.set(-2.6, 0, -2.2);
  stool.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  meadow.add(stool);
}

// ---- the characters
let cow = buildCow({ breed: params.get('breed') || 'eringer', dressed: params.get('dressed') !== '0' });
cow.position.set(-0.6, 0, -1.3);
cow.rotation.y = 0.55;
scene.add(cow);
const player = buildAlphornist();
player.position.set(-2.6, 0, 1.7);
player.rotation.y = -0.35;
scene.add(player);

function swapCow(opts) {
  const pos = cow.position.clone(), rot = cow.rotation.y;
  scene.remove(cow);
  cow = buildCow(opts);
  cow.position.copy(pos); cow.rotation.y = rot;
  scene.add(cow);
}

// ---- sound: the alphorn and the cow bell
let ctx = null, master, echoIn;
function audio() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  // the valley: a short room plus two echoes off the far walls, each darker than the last
  const verb = ctx.createConvolver();
  const len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * 0.5; }
  verb.buffer = ir;
  const verbGain = ctx.createGain(); verbGain.gain.value = 0.35;
  verb.connect(verbGain).connect(master);
  echoIn = ctx.createGain();
  echoIn.connect(master); echoIn.connect(verb);
  for (const [t, g] of [[0.62, 0.32], [1.45, 0.2]]) {
    const d = ctx.createDelay(3); d.delayTime.value = t;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const fb = ctx.createGain(); fb.gain.value = 0.25;
    const out = ctx.createGain(); out.gain.value = g;
    echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out); out.connect(master);
  }
  return ctx;
}

// a brassy wave: strong low harmonics, rolling off
let wave = null;
function brass() {
  if (wave) return wave;
  const n = 24, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (k < 4 ? 1 : 2.6 / k) * (k % 2 ? 1 : 0.85);
  wave = ctx.createPeriodicWave(re, im);
  return wave;
}

const F0 = 92.5;          // an alphorn in F#: 3.4 m of spruce
function note(h, t0, dur, vel = 1) {
  const f = F0 * h;
  const osc = ctx.createOscillator(); osc.setPeriodicWave(brass());
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.value = 0;
  osc.connect(lp).connect(g).connect(echoIn);
  // a lip "scoop" up into the note, then a gentle vibrato
  osc.frequency.setValueAtTime(f * 0.965, t0);
  osc.frequency.exponentialRampToValueAtTime(f, t0 + 0.07);
  const vib = ctx.createOscillator(); vib.frequency.value = 4.8;
  const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t0); vg.gain.linearRampToValueAtTime(f * 0.006, t0 + Math.min(0.5, dur * 0.6));
  vib.connect(vg).connect(osc.frequency);
  const peak = 0.22 * vel / Math.sqrt(h / 6);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.06);
  g.gain.linearRampToValueAtTime(peak * 0.75, t0 + 0.25);
  g.gain.setValueAtTime(peak * 0.75, t0 + dur - 0.12);
  g.gain.linearRampToValueAtTime(0, t0 + dur + 0.08);
  lp.frequency.setValueAtTime(f * 1.5, t0);
  lp.frequency.linearRampToValueAtTime(f * 4.5, t0 + 0.08);
  lp.frequency.linearRampToValueAtTime(f * 3.0, t0 + dur);
  osc.start(t0); vib.start(t0);
  osc.stop(t0 + dur + 0.2); vib.stop(t0 + dur + 0.2);
}

// a little Kuhreihen-style call, on the horn's natural harmonics (11 is the
// famous "alphorn fa", between F and F#)
const TUNE = [
  [8, 1.5], [9, 0.5], [10, 1], [12, 2.5], [0, 0.5],
  [10, 0.5], [11, 0.5], [10, 0.5], [9, 0.5], [8, 2], [0, 0.6],
  [6, 1], [8, 1], [10, 1], [12, 1.5], [11, 0.5], [10, 1], [9, 0.5], [8, 0.5], [9, 1], [10, 2.5], [0, 0.5],
  [12, 0.75], [10, 0.75], [8, 0.75], [6, 0.75], [5, 1], [6, 1], [8, 4],
];
let playing = 0, playUntil = 0;
function playTune() {
  audio();
  if (ctx.state === 'suspended') ctx.resume();
  const beat = 0.42;
  let t = ctx.currentTime + 0.15;
  for (const [h, d] of TUNE) {
    if (h) note(h, t, d * beat * 0.95, h === 12 ? 1.1 : 1);
    t += d * beat;
  }
  playUntil = performance.now() / 1000 + (t - ctx.currentTime);
}
function ringBell(big = true) {
  audio();
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime;
  const base = big ? 420 : 760;
  for (const [ratio, amp, decay] of [[1, 0.25, 1.6], [2.76, 0.16, 0.9], [5.4, 0.1, 0.5], [8.93, 0.06, 0.3]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.004);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g).connect(echoIn); o.start(t0); o.stop(t0 + decay + 0.05);
  }
}

// ---- UI
const ui = {
  play: document.getElementById('play'), bell: document.getElementById('bell'), spin: document.getElementById('spin'),
  breed: document.getElementById('breed'), dress: document.getElementById('dress'),
};
let breed = params.get('breed') || 'eringer', dressed = params.get('dressed') !== '0';
ui.play.addEventListener('click', playTune);
ui.bell.addEventListener('click', () => { ringBell(true); bellHit = 1; });
ui.spin.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; ui.spin.classList.toggle('on', controls.autoRotate); });
ui.breed.addEventListener('click', () => {
  breed = breed === 'eringer' ? 'brownswiss' : 'eringer';
  ui.breed.textContent = breed === 'eringer' ? 'Show a Brown Swiss' : 'Show the Eringer queen';
  document.getElementById('cow-name').textContent = breed === 'eringer' ? 'the Eringer queen' : 'a Brown Swiss';
  swapCow({ breed, dressed });
});
ui.dress.addEventListener('click', () => {
  dressed = !dressed;
  ui.dress.textContent = dressed ? 'Everyday bell' : 'Dress her for the Alpabzug';
  swapCow({ breed, dressed });
});
controls.autoRotateSpeed = 0.8;
if (params.has('spin')) { controls.autoRotate = true; ui.spin.classList.add('on'); }
if (params.has('cam')) {
  const [a, b, c, d, e, f] = params.get('cam').split(',').map(Number);
  camera.position.set(a, b, c); controls.target.set(d, e, f); controls.update();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let bellHit = 0;
const clock = new THREE.Clock();
let frames = 0;
const stillFrames = params.has('still') ? parseInt(params.get('still') || '3', 10) : 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = stillFrames ? 2 + frames * 0.016 : clock.elapsedTime;
  const now = performance.now() / 1000;
  playing += ((now < playUntil ? 1 : 0) - playing) * Math.min(1, dt * 6);
  bellHit *= Math.exp(-dt * 2);
  cow.userData.animate(t, bellHit);
  player.userData.animate(t, playing);
  controls.update();
  renderer.render(scene, camera);
  if (stillFrames && ++frames > stillFrames) { renderer.setAnimationLoop(null); document.body.classList.add('still-done'); }
});
document.body.classList.add('ready');
