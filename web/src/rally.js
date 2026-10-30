// The Dakar Rally on the terrain: the route (specials, the ferry and the
// transfer), bivouacs at the stage towns, and a convoy of bikes, cars and
// trucks driving the whole rally with dust trailing behind.
//
// Route data comes from the scene's `rally` block (pipeline/dakar.py), already
// draped on the terrain in scene coordinates. Lines are drawn a constant width
// on screen, so they read at every zoom.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './life.js';

const AMBER = new THREE.Color('#f2a33a'), INK = new THREE.Color('#1c1a16');

// world units per CSS pixel for the current orthographic camera
function pxSize(renderer, camera) {
  const h = renderer.domElement.height / renderer.getPixelRatio();
  return (camera.top - camera.bottom) / camera.zoom / Math.max(1, h);
}

function routeMesh(stages, uniforms) {
  const pos = [], perp = [], side = [], dist = [], stg = [], kind = [];
  const idx = [];
  const add = (flat, si, k) => {
    const n = flat.length / 3;
    if (n < 2) return;
    let d = 0;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = flat[b * 3] - flat[a * 3], ty = flat[b * 3 + 1] - flat[a * 3 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      if (i > 0) d += Math.hypot(flat[i * 3] - flat[i * 3 - 3], flat[i * 3 + 1] - flat[i * 3 - 2]);
      for (const sd of [-1, 1]) {
        pos.push(flat[i * 3], flat[i * 3 + 2], -flat[i * 3 + 1]);
        perp.push(-ty, -tx);            // perpendicular, in (x, z) world space
        side.push(sd); dist.push(d); stg.push(si); kind.push(k);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const v = base + i * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  };
  stages.forEach((s, si) => {
    if (s.ferry?.length) add(s.ferry, si, 2);
    if (s.p?.length) add(s.p, si, s.kind === 'transfer' ? 1 : 0);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPerp', new THREE.Float32BufferAttribute(perp, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute('aStage', new THREE.Float32BufferAttribute(stg, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();

  const shared = { uPx: { value: 10 }, uSel: { value: 0 }, uTime: uniforms.uTime, uNight: uniforms.uNight };
  const make = (xray) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: !xray, side: THREE.DoubleSide,
    uniforms: { ...shared, uXray: { value: xray ? 1 : 0 }, uAmber: { value: AMBER }, uInk: { value: INK } },
    vertexShader: `
      attribute vec2 aPerp; attribute float aSide, aDist, aStage, aKind;
      uniform float uPx, uSel; varying float vSide, vDist, vKind, vSelOn, vAny;
      void main() {
        int m = int(uSel + 0.5);
        float on = float((m >> int(aStage + 0.5)) & 1);
        vSelOn = on; vAny = m > 0 ? 1.0 : 0.0;
        float w = (aKind > 0.5 ? 3.2 : 4.6) + 3.0 * on;
        vec3 p = position + vec3(aPerp.x, 0.0, aPerp.y) * aSide * w * uPx;
        p.y += 2.0 * uPx;
        vSide = aSide; vDist = aDist; vKind = aKind;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uPx, uTime, uNight, uXray; uniform vec3 uAmber, uInk;
      varying float vSide, vDist, vKind, vSelOn, vAny;
      void main() {
        float e = abs(vSide);
        if (vKind > 0.5 && fract(vDist / (uPx * 18.0)) > 0.55) discard;
        vec3 core = vKind > 1.5 ? vec3(0.93, 0.97, 1.0) : vKind > 0.5 ? vec3(0.99, 0.95, 0.85) : uAmber;
        // a light pulse running along the selected stage, in the direction of travel
        float flow = vSelOn * smoothstep(0.75, 1.0, fract((vDist - uTime * uPx * 140.0) / (uPx * 90.0)));
        core = mix(core, vec3(1.0, 0.98, 0.9), flow * 0.8);
        vec3 c = mix(core, uInk, smoothstep(0.55, 0.8, e));
        c *= 1.0 + uNight * 0.6;
        float a = 1.0 - smoothstep(0.88, 1.0, e);
        a *= mix(1.0, 0.35, vAny * (1.0 - vSelOn));
        if (uXray > 0.5) a *= 0.22;
        gl_FragColor = vec4(c, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, make(false));
  const ghost = new THREE.Mesh(g, make(true));
  mesh.renderOrder = 8; ghost.renderOrder = 7;
  mesh.frustumCulled = ghost.frustumCulled = false;
  mesh.onBeforeRender = (r, _s, cam) => { shared.uPx.value = pxSize(r, cam); };
  const group = new THREE.Group();
  group.add(ghost, mesh);
  return { group, setSel(mask) { shared.uSel.value = mask; }, px: shared.uPx };
}

// ------------------------------------------------------------------ vehicles
function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
const B = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
function carGeo() {          // a T1 prototype: low and wide, roof scoop, spare wheels behind
  return BGU.mergeGeometries([
    B(4.6, 0.9, 2.3, 0, 0.95, 0, '#ffffff'), B(2.2, 0.75, 1.9, -0.2, 1.75, 0, '#ffffff'),
    B(1.5, 0.55, 1.75, 0.05, 1.8, 0, '#26303a'), B(0.6, 0.35, 0.5, -0.6, 2.25, 0, '#ffffff'),
    ...[[1.5, 1.1], [1.5, -1.1], [-1.5, 1.1], [-1.5, -1.1]].map(([x, z]) => B(0.9, 0.9, 0.35, x, 0.45, z, '#1b1b1b')),
  ]);
}
function bikeGeo() {
  return BGU.mergeGeometries([
    B(2.2, 0.6, 0.35, 0, 0.75, 0, '#ffffff'), B(0.8, 0.45, 0.6, 0.55, 1.15, 0, '#ffffff'),
    B(0.55, 0.9, 0.45, -0.2, 1.55, 0, '#30343a'), B(0.4, 0.4, 0.4, -0.05, 2.15, 0, '#f2efe8'),
    B(0.75, 0.75, 0.2, 0.95, 0.38, 0, '#1b1b1b'), B(0.75, 0.75, 0.2, -0.95, 0.38, 0, '#1b1b1b'),
  ]);
}
function truckGeo() {
  return BGU.mergeGeometries([
    B(2.6, 2.4, 2.5, 2.4, 2.0, 0, '#ffffff'), B(0.2, 1.0, 2.2, 3.72, 2.6, 0, '#26303a'),
    B(4.4, 2.5, 2.5, -1.3, 2.25, 0, '#ffffff'), B(8.6, 0.4, 2.0, 0, 0.95, 0, '#2b2b2b'),
    ...[[2.8, 1.2], [2.8, -1.2], [-0.4, 1.2], [-0.4, -1.2], [-2.4, 1.2], [-2.4, -1.2]].map(([x, z]) => B(1.3, 1.3, 0.5, x, 0.65, z, '#1b1b1b')),
  ]);
}
function ferryGeo() {
  return BGU.mergeGeometries([
    B(150, 10, 26, 0, 4, 0, '#f4f1ea'), B(150.5, 2.4, 26.4, 0, 1.5, 0, '#1f4f8a'),
    B(90, 9, 22, -10, 13, 0, '#ffffff'), B(91, 2, 22.4, -10, 12, 0, '#26303a'), B(12, 9, 6, -30, 22, 0, '#c7372f'),
  ]);
}

class Path3 {
  constructor() { this.p = []; this.cum = [0]; this.k = []; this.st = []; }
  push(x, y, z, kind, st) {
    if (this.p.length) {
      const q = this.p[this.p.length - 1];
      const d = Math.hypot(x - q[0], y - q[1]);
      if (d < 1e-3) return;
      this.cum.push(this.cum[this.cum.length - 1] + d);
    }
    this.p.push([x, y, z]); this.k.push(kind); this.st.push(st);
  }
  get len() { return this.cum[this.cum.length - 1]; }
  at(s, o) {
    s = ((s % this.len) + this.len) % this.len;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], seg = this.cum[hi] - this.cum[lo] || 1, t = (s - this.cum[lo]) / seg;
    o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t;
    o.dx = (b[0] - a[0]) / seg; o.dy = (b[1] - a[1]) / seg;
    o.kind = this.k[lo]; o.stage = this.st[lo];
    return o;
  }
}

export async function buildRally({ scene, uniforms, data, heightAt, cfg }) {
  const R = data.rally;
  const stages = R.stages;
  const rnd = mulberry32(2027);
  const group = new THREE.Group();
  scene.add(group);
  const sea = data.grid.sea;
  const ground = (x, y) => Math.max(heightAt(x, y), sea);

  // ---- the route
  const route = routeMesh(stages, uniforms);
  group.add(route.group);

  // ---- bivouacs: a ring of tents and support trucks round a tall pin
  const VS = cfg.vehicleScale || 26;
  const tentG = paint(new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), '#ffffff');
  const towns = R.towns.filter((t) => t.key !== 'strait');
  const tentsPer = 34, trucksPer = 10;
  const tents = new THREE.InstancedMesh(tentG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), towns.length * tentsPer);
  const parked = new THREE.InstancedMesh(truckGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), towns.length * trucksPer);
  const TENT = ['#f2a33a', '#f2efe8', '#2f6fb4', '#c7372f', '#f2c230', '#f2efe8', '#2f8f6b'];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pins = [];
  const campLights = [];
  let ti = 0, pi_ = 0;
  for (const t of towns) {
    const cx = t.x, cy = t.y;
    for (let i = 0; i < tentsPer; i++) {
      const a = rnd() * Math.PI * 2, d = 40 + 150 * Math.sqrt(rnd());
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      p.set(x, ground(x, y), -y); q.setFromAxisAngle(yAxis, rnd() * 6.28); sc.setScalar(9 + rnd() * 5);
      tents.setMatrixAt(ti, m4.compose(p, q, sc)); tents.setColorAt(ti, col.set(TENT[Math.floor(rnd() * TENT.length)])); ti++;
      if (i % 3 === 0) campLights.push(x, ground(x, y) + 12, -y);
    }
    for (let i = 0; i < trucksPer; i++) {
      const a = (i / trucksPer) * Math.PI * 2 + rnd() * 0.3, d = 230 + rnd() * 40;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      p.set(x, ground(x, y), -y); q.setFromAxisAngle(yAxis, a + Math.PI / 2); sc.setScalar(VS * 0.55);
      parked.setMatrixAt(pi_, m4.compose(p, q, sc)); parked.setColorAt(pi_, col.set(i % 3 ? '#f2efe8' : '#1f4f8a')); pi_++;
    }
    const tint = t.role === 'marathon' ? '#8b3a2a' : t.role === 'rest' ? '#1c1a16' : t.role === 'finish' ? '#f2efe8' : '#f2a33a';
    const h = 300;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, h, 6).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(26, 14, 10), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4, emissive: tint, emissiveIntensity: 0.15 }));
    head.position.y = h;
    const pin = new THREE.Group();
    pin.add(pole, head);
    pin.position.set(cx, ground(cx, cy), -cy);
    pole.castShadow = head.castShadow = true;
    group.add(pin);
    pins.push({ key: t.key, head });
  }
  tents.castShadow = parked.castShadow = true;
  group.add(tents, parked);

  // ---- the convoy follows the whole rally in order
  const path = new Path3();
  stages.forEach((s, si) => {
    const put = (flat, kind) => { for (let i = 0; i < flat.length; i += 3) path.push(flat[i], flat[i + 1], flat[i + 2], kind, si); };
    if (s.ferry?.length) put(s.ferry, 2);
    if (s.p?.length) put(s.p, s.kind === 'transfer' ? 1 : 0);
  });
  const CLASSES = [
    { id: 'bikes', label: 'Ride with the bikes', dot: '#f08a24', geo: bikeGeo(), n: 7, gap: 1100, start: 0, v: 270,
      colors: ['#f08a24', '#f08a24', '#c7372f', '#1f4fa0', '#f2efe8', '#2b2f36', '#f2c230'] },
    { id: 'cars', label: 'Ride with the cars', dot: '#c7372f', geo: carGeo(), n: 8, gap: 1300, start: -11000, v: 255,
      colors: ['#c7372f', '#f2efe8', '#1f4fa0', '#2b2f36', '#f2a33a', '#2f8f6b', '#e9e4d8', '#7a2f8f'] },
    { id: 'trucks', label: 'Ride with the trucks', dot: '#1f4f8a', geo: truckGeo(), n: 5, gap: 1600, start: -24000, v: 235,
      colors: ['#1f4fa0', '#c7372f', '#e07b2a', '#f2efe8', '#2f8f6b'] },
  ];
  const vehicles = [];
  const matV = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
  for (const c of CLASSES) {
    c.mesh = new THREE.InstancedMesh(c.geo, matV, c.n);
    c.mesh.castShadow = true;
    c.mesh.frustumCulled = false;
    c.lead = { pos: new THREE.Vector3(), stage: 0 };
    for (let i = 0; i < c.n; i++) {
      c.mesh.setColorAt(i, col.set(c.colors[i % c.colors.length]));
      vehicles.push({ c, i, s: c.start - i * c.gap * (0.8 + rnd() * 0.5), v: c.v * (0.95 + rnd() * 0.1), ph: rnd() * 100, wig: 0.5 + rnd(), last: null });
    }
    group.add(c.mesh);
  }
  const ferry = new THREE.Mesh(ferryGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
  ferry.scale.setScalar(VS * 0.16);
  ferry.castShadow = true;
  ferry.visible = false;
  group.add(ferry);

  // dust: soft puffs dropped behind every vehicle on the dirt
  const PUFFS = 16;
  const nP = vehicles.length * PUFFS;
  const dPos = new Float32Array(nP * 3), dBirth = new Float32Array(nP).fill(-1e9);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dg.setAttribute('aBirth', new THREE.BufferAttribute(dBirth, 1));
  const dustU = { uPx: route.px, uClock: { value: 0 }, uNight: uniforms.uNight };
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: dustU,
    vertexShader: `attribute float aBirth; uniform float uPx, uClock; varying float vA;
      void main(){ float age = uClock - aBirth; vA = age < 0.0 ? 0.0 : (1.0 - smoothstep(0.0, 3.2, age));
        gl_PointSize = (${(VS * 3.2).toFixed(1)} + age * ${(VS * 6).toFixed(1)}) / uPx;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, age * ${(VS * 1.5).toFixed(1)}, 0.0), 1.0); }`,
    fragmentShader: `uniform float uNight; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
        float a = vA * 0.42 * smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(mix(vec3(0.86, 0.74, 0.56), vec3(0.3, 0.29, 0.3), uNight * 0.7), a); }`,
  }));
  dust.frustumCulled = false;
  dust.renderOrder = 9;
  group.add(dust);

  // night: headlights on the vehicles, lanterns in the bivouacs
  const lightPos = new Float32Array(vehicles.length * 3 + campLights.length);
  lightPos.set(campLights, vehicles.length * 3);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
  const lights = new THREE.Points(lg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uNight: uniforms.uNight },
    vertexShader: `uniform float uNight; varying float vA; void main(){ vA = uNight; gl_PointSize = 5.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.92, 0.72) * 2.4, vA * smoothstep(0.5, 0.0, d)); }`,
  }));
  lights.frustumCulled = false;
  lights.renderOrder = 10;
  group.add(lights);

  const tmp = {}, tmp2 = {};
  let clock = 0, puffI = 0;
  function step(dt) {
    clock += dt;
    dustU.uClock.value = clock;
    let ferryAt = null;
    vehicles.forEach((v, k) => {
      v.s += v.v * dt * (0.85 + 0.3 * Math.sin(clock * 0.31 + v.ph));
      path.at(v.s, tmp);
      // weave a little either side of the straight schematic line
      const off = Math.sin(v.s / 900 + v.ph) * 35 * v.wig;
      const x = tmp.x - tmp.dy * off, y = tmp.y + tmp.dx * off;
      const onFerry = tmp.kind === 2;
      const h = onFerry ? sea + 6 : ground(x, y);
      path.at(v.s + 60, tmp2);
      const heading = Math.atan2(tmp2.y - tmp.y, tmp2.x - tmp.x);
      p.set(onFerry ? tmp.x : x, h, -(onFerry ? tmp.y : y));
      q.setFromAxisAngle(yAxis, heading);
      sc.setScalar(onFerry ? 0.0001 : VS);
      v.c.mesh.setMatrixAt(v.i, m4.compose(p, q, sc));
      if (v.i === 0) { v.c.lead.pos.copy(p); v.c.lead.stage = tmp.stage; }
      if (onFerry && !ferryAt) ferryAt = { x: tmp.x, y: tmp.y, heading };
      lightPos.set([p.x + Math.cos(heading) * VS * 2.6, h + VS * 1.2, p.z - Math.sin(heading) * VS * 2.6], k * 3);
      // dust on the dirt, not on the ferry or tarmac transfers
      if (!onFerry && tmp.kind === 0 && (!v.last || Math.hypot(v.last[0] - x, v.last[1] - y) > VS * 3)) {
        v.last = [x, y];
        dPos.set([x - Math.cos(heading) * VS * 2.5, h + VS * 0.6, -(y - Math.sin(heading) * VS * 2.5)], puffI * 3);
        dBirth[puffI] = clock;
        puffI = (puffI + 1) % nP;
      }
    });
    for (const c of CLASSES) c.mesh.instanceMatrix.needsUpdate = true;
    dg.attributes.position.needsUpdate = true;
    dg.attributes.aBirth.needsUpdate = true;
    lg.attributes.position.needsUpdate = true;
    ferry.visible = !!ferryAt;
    if (ferryAt) { ferry.position.set(ferryAt.x, sea, -ferryAt.y); ferry.rotation.y = ferryAt.heading; }
  }

  // ---- stage labels
  const labels = [];
  const order = stages.map((s) => s.n);
  stages.forEach((s) => {
    const f = s.p?.length ? s.p : s.ferry;
    if (!f?.length || s.kind === 'rest') return;
    const n = f.length / 3;
    const k = s.loop ? Math.floor(n * 0.5) : Math.floor(n * 0.5);
    const txt = s.n === 'P' ? 'Prologue' : s.kind === 'transfer' ? 'Ferry & transfer' : `Stage ${s.n}`;
    const sub = s.special_km ? `${s.special_km} km special${s.marathon ? ' · marathon' : ''}` : '';
    labels.push({ text: txt, sub, pos: new THREE.Vector3(f[k * 3], f[k * 3 + 2] + 160, -f[k * 3 + 1]), minZoom: 1.5 });
  });

  // ---- selecting stages from the views
  const bit = (ns) => ns.reduce((m, n) => { const i = order.indexOf(n); return i >= 0 ? m | (1 << i) : m; }, 0);
  const describe = (ns) => ns.map((n) => stages.find((s) => s.n === n)).filter(Boolean);
  const name = (k) => R.towns.find((t) => t.key === k)?.name || k;
  function onView(id) {
    const ns = cfg.viewStages?.[id] || [];
    route.setSel(bit(ns));
    const ss = describe(ns).filter((s) => s.kind !== 'rest');
    if (!ss.length) return cfg.viewToasts?.[id] || null;
    const parts = ss.map((s) => {
      const what = s.n === 'P' ? 'Prologue' : s.kind === 'transfer' ? 'Transfer' : `Stage ${s.n}`;
      const where = s.from === s.to ? `${name(s.from)} loop` : `${name(s.from)} → ${name(s.to)}`;
      return `${what}: ${where}${s.special_km ? `, ${s.special_km} km special` : ''}`;
    });
    return parts.join(' · ');
  }

  return {
    labels,
    follows: CLASSES.map((c) => ({ label: c.label, dot: c.dot, obj: c.lead, zoom: cfg.followZoom || 9 })),
    leads: Object.fromEntries(CLASSES.map((c) => [c.id, c.lead])),
    update(t, dt) { step(Math.min(dt, 0.1)); },
    seek(t, dt) { for (let ft = 0; ft < t - dt / 2; ft += dt) step(dt); },
    onView,
    pathKm: path.len / (data.meta.scale || 1) / 1000,
  };
}
