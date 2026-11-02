// Patagonian extras for Torres del Paine: icebergs off the Grey Glacier, Andean condors
// riding the thermals over the massif, hikers on the W Trek, the refugios' lights after
// dark, and the wind: spray torn off the lakes and lenticular clouds over the towers.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './life.js';

function colored(geo, hex) {
  const g = geo.toNonIndexed();
  const c = new THREE.Color(hex), n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ icebergs
function icebergs(flat, uniforms) {
  const n = (flat?.length || 0) / 4;
  const group = new THREE.Group();
  if (!n) return { group, update() {} };
  const rnd = mulberry32(1879);
  // a few lumpy shapes: a low-poly rock, squashed, with a flat-ish top
  const shapes = [0, 1, 2].map((v) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + 0.5 * rnd();
      p.setXYZ(i, p.getX(i) * k * (1 + v * 0.25), Math.min(p.getY(i) * k, 0.55 + 0.1 * v), p.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({ color: '#d4eef6', roughness: 0.35, metalness: 0, flatShading: true,
    emissive: '#3aa3c9', emissiveIntensity: 0.12 });
  const items = [];
  const meshes = shapes.map((g, v) => {
    const idx = [];
    for (let i = v; i < n; i += 3) idx.push(i);
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, idx.length));
    m.count = idx.length;
    m.castShadow = true; m.receiveShadow = true;
    idx.forEach((i, k) => items.push({ m, k, x: flat[i * 4], y: flat[i * 4 + 1], z: flat[i * 4 + 2],
      s: flat[i * 4 + 3] * 14, rot: rnd() * 6.28, ph: rnd() * 6.28 }));
    group.add(m);
    return m;
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  function update(t) {
    for (const it of items) {
      // a slow drift south on the current, and a gentle bob
      const dx = Math.sin(t * 0.01 + it.ph) * 20, dy = Math.cos(t * 0.013 + it.ph) * 15;
      p.set(it.x + dx, it.z - it.s * 0.15 + Math.sin(t * 0.6 + it.ph) * 0.4, -(it.y + dy));
      q.setFromAxisAngle(yAxis, it.rot + t * 0.004);
      sc.set(it.s, it.s * 0.8, it.s * 0.9);
      it.m.setMatrixAt(it.k, m4.compose(p, q, sc));
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update, count: n };
}

// ------------------------------------------------------------------ Andean condors
function condorGeometry() {
  // a long plank of a wing with fingered tips, white patches on top, a white ruff
  const parts = [
    colored(new THREE.BoxGeometry(3.0, 0.08, 0.55).translate(0, 0, 0.05), '#1c1b1d'),          // wings
    colored(new THREE.BoxGeometry(1.5, 0.09, 0.22).translate(0, 0.01, -0.12), '#e9e6df'),       // white secondaries
    colored(new THREE.BoxGeometry(0.35, 0.22, 0.95).translate(0, -0.05, 0.1), '#1c1b1d'),       // body
    colored(new THREE.BoxGeometry(0.28, 0.16, 0.12).translate(0, 0.0, -0.42), '#f2efe8'),       // ruff
    colored(new THREE.BoxGeometry(0.14, 0.12, 0.2).translate(0, 0.0, -0.56), '#9a6a5a'),        // bare head
    colored(new THREE.BoxGeometry(0.5, 0.05, 0.35).translate(0, -0.02, 0.68), '#1c1b1d'),       // tail
  ];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      parts.push(colored(new THREE.BoxGeometry(0.35, 0.04, 0.07).translate(s * (1.65 + 0.06 * k), 0.02 + 0.03 * k, -0.15 + k * 0.12), '#1c1b1d'));
    }
  }
  return BGU.mergeGeometries(parts);
}

function condors(spots, heightAt, scale) {
  const group = new THREE.Group();
  const per = 5;
  const n = spots.length * per;
  if (!n) return { group, update() {}, lead: null };
  const mesh = new THREE.InstancedMesh(condorGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), n);
  mesh.castShadow = true; mesh.frustumCulled = false;
  group.add(mesh);
  const rnd = mulberry32(3000);
  const birds = [];
  spots.forEach((s) => {
    for (let k = 0; k < per; k++) {
      birds.push({ ...s, r: 220 + rnd() * 380, h: 120 + rnd() * 420, w: (0.05 + rnd() * 0.04) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28 });
    }
  });
  const lead = { pos: new THREE.Vector3() };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale);
  const e = new THREE.Euler();
  let wind = 0;
  function update(t) {
    birds.forEach((b, i) => {
      // circling in a thermal, the circle drifting downwind (east) when the wind is up
      const a = b.ph + t * b.w * (1 + wind * 0.8);
      const drift = wind * (((t * 6 + b.ph * 300) % 2400) - 600);
      const x = b.x + Math.cos(a) * b.r + drift, y = b.y + Math.sin(a) * b.r;
      const z = Math.max(heightAt(x, y) + 80, b.z + b.h + Math.sin(t * 0.07 + b.ph) * 60);
      p.set(x, z, -y);
      const heading = a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2);
      e.set(0, -heading + Math.PI / 2, (b.w > 0 ? 1 : -1) * 0.38, 'YZX');
      mesh.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), sc));
      if (i === 0) lead.pos.copy(p);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update, lead, setWind(w) { wind = w; } };
}

// ------------------------------------------------------------------ hikers on the trails
class Path3 {
  constructor(flat) {
    this.p = []; this.cum = [0];
    for (let i = 0; i < flat.length; i += 3) this.p.push([flat[i], flat[i + 1], flat[i + 2]]);
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(s, o) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], seg = this.cum[hi] - this.cum[lo] || 1, t = (s - this.cum[lo]) / seg;
    o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t; o.z = a[2] + (b[2] - a[2]) * t;
    o.dx = (b[0] - a[0]) / seg; o.dy = (b[1] - a[1]) / seg;
    return o;
  }
}

function hikerGeometry() {
  return BGU.mergeGeometries([
    colored(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 6).translate(0, 0.45, 0), '#3b4250'),     // legs
    colored(new THREE.CylinderGeometry(0.3, 0.28, 0.75, 6).translate(0, 1.25, 0), '#ffffff'),     // jacket (instance colour)
    colored(new THREE.BoxGeometry(0.5, 0.75, 0.35).translate(0, 1.35, 0.32), '#7a5a3a'),          // pack
    colored(new THREE.SphereGeometry(0.2, 6, 4).translate(0, 1.82, 0), '#e0b090'),                // head
  ]);
}

function hikers(roads, scale, near) {
  const group = new THREE.Group();
  const trails = (roads || []).filter((r) => r.k === 'trail').map((r) => new Path3(r.p)).filter((p) => p.len > 1200);
  trails.sort((a, b) => b.len - a.len);
  // the lead hiker starts on the trail closest to `near` (the Valle del Francés)
  if (near) {
    let best = 0, bd = Infinity;
    trails.forEach((tr, k) => tr.p.forEach((pt) => { const d = Math.hypot(pt[0] - near[0], pt[1] - near[1]); if (d < bd) { bd = d; best = k; } }));
    if (trails.length) trails.unshift(trails.splice(best, 1)[0]);
  }
  const use = trails.slice(0, 40);
  if (!use.length) return { group, update() {}, lead: null, count: 0 };
  const total = use.reduce((s, p) => s + p.len, 0);
  const n = Math.min(160, Math.max(20, Math.round(total / 900)));
  const rnd = mulberry32(1978);   // the year Torres del Paine became a UNESCO biosphere reserve
  const JACKETS = ['#e2412b', '#f2a81f', '#2a6fd1', '#2f9a5a', '#d63a7a', '#f26a1f', '#7a4fd1', '#1fb3b3', '#f2d21f'];
  const people = Array.from({ length: n }, (_, i) => {
    const tr = i < 4 ? use[0] : (() => { let t = rnd() * total; for (const p of use) { if ((t -= p.len) <= 0) return p; } return use[0]; })();
    return { tr, s: i < 4 ? tr.len * 0.3 + i * 25 : rnd() * tr.len, dir: i < 4 ? 1 : rnd() < 0.5 ? 1 : -1, v: 0.9 + rnd() * 0.5, pause: 0 };
  });
  const mesh = new THREE.InstancedMesh(hikerGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), n);
  const col = new THREE.Color();
  people.forEach((_, i) => mesh.setColorAt(i, col.set(JACKETS[i % JACKETS.length])));
  mesh.castShadow = true; mesh.frustumCulled = false;
  group.add(mesh);
  const tmp = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const lead = { pos: new THREE.Vector3() };
  let wind = 0;
  // walking pace is sped up (like everything else here) so you can see them move
  const SPEED = 3.5;
  function step(dt) {
    people.forEach((h, i) => {
      if (h.pause > 0) h.pause -= dt;
      else {
        h.s += h.v * SPEED * (1 - 0.55 * wind) * h.dir * dt;
        if (h.s > h.tr.len || h.s < 0) { h.dir *= -1; h.s = Math.max(0, Math.min(h.tr.len, h.s)); h.pause = 4 + rnd() * 8; }
      }
      h.tr.at(h.s, tmp);
      const dx = tmp.dx * h.dir, dy = tmp.dy * h.dir;
      p.set(tmp.x + dy * 1.2 * scale, tmp.z - 0.3, -(tmp.y - dx * 1.2 * scale));
      // leaning into the wind
      q.setFromAxisAngle(yAxis, Math.atan2(dy, dx) - Math.PI / 2);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
      if (i === 0) lead.pos.copy(p);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  step(0);
  return { group, update: step, lead, count: n, setWind(w) { wind = w; } };
}

// ------------------------------------------------------------------ lights after dark
function glowPoints(pts, uniforms, size, rgb) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uNight: uniforms.uNight, uTime: uniforms.uTime },
    vertexShader: `uniform float uNight, uTime; varying float vA;
      void main(){ vA = uNight * (0.85 + 0.15 * sin(uTime * 3.0 + position.x)); gl_PointSize = ${size.toFixed(1)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(${rgb}) * 2.2, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const p = new THREE.Points(g, mat);
  p.renderOrder = 6;
  return p;
}

// ------------------------------------------------------------------ the wind
function spray(flat, uniforms) {
  const n = (flat?.length || 0) / 3;
  if (!n) return { object: new THREE.Group(), update() {} };
  const pos = new Float32Array(n * 3), base = new Float32Array(n * 3), seed = new Float32Array(n);
  const rnd = mulberry32(120);
  for (let i = 0; i < n; i++) { base.set([flat[i * 3], flat[i * 3 + 2], -flat[i * 3 + 1]], i * 3); seed[i] = rnd(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const amt = { value: 0 };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uAmt: amt, uNight: uniforms.uNight },
    vertexShader: `attribute float aSeed; uniform float uAmt; varying float vA;
      void main(){ vA = uAmt; gl_PointSize = 3.0 + 3.0 * aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uNight; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(mix(vec3(1.0), vec3(0.45, 0.5, 0.6), uNight), vA * 0.8 * smoothstep(0.5, 0.1, d)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  function update(t, w) {
    amt.value = w;
    pts.visible = w > 0.01;
    if (!pts.visible) return;
    for (let i = 0; i < n; i++) {
      // each gust lifts a sheet of spray and carries it east, low over the water
      const u = (t * (0.35 + 0.3 * seed[i]) + seed[i] * 7) % 1;
      pos[i * 3] = base[i * 3] + u * 260;
      pos[i * 3 + 1] = base[i * 3 + 1] + 2 + Math.sin(u * Math.PI) * 14;
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.sin(seed[i] * 40 + t) * 20;
    }
    g.attributes.position.needsUpdate = true;
  }
  return { object: pts, update };
}

function lenticulars(centers) {
  // stacked lens clouds that sit still over the peaks while the wind tears past
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#f6f4f0', roughness: 1, transparent: true, opacity: 0.88, depthWrite: false });
  const rnd = mulberry32(51);
  for (const c of centers) {
    const L = 2600 + rnd() * 2200;
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 10), mat);
      const s = L * (1 - k * 0.18);
      m.scale.set(s, 140 - k * 25, s * 0.42);
      m.position.set(c.x + k * 120, c.z + k * 230, -c.y);
      m.rotation.y = 0.15 + rnd() * 0.3;
      group.add(m);
    }
  }
  group.visible = false;
  return group;
}

// ------------------------------------------------------------------ all together
export async function buildPatagonia({ scene, uniforms, data, heightAt, ll, cfg }) {
  const group = new THREE.Group();
  scene.add(group);
  const xy = (lat, lon, dz = 0) => { const v = ll(lat, lon, dz); return { x: v.x, y: -v.z, z: v.y }; };
  const bergs = icebergs(data.icebergs, uniforms);
  group.add(bergs.group);
  const birds = condors((cfg.thermals || []).map(([la, lo]) => xy(la, lo)), heightAt, cfg.condorScale || 9);
  group.add(birds.group);
  const nearXY = cfg.hikeNear ? xy(cfg.hikeNear[0], cfg.hikeNear[1]) : null;
  const walkers = hikers(data.roads, cfg.hikerScale || 4.5, nearXY ? [nearXY.x, nearXY.y] : null);
  group.add(walkers.group);
  // the refugios, campgrounds and lodges light up after dark
  const lamps = [];
  for (const l of data.labels) {
    if (/refugio|hotel|campamento/i.test(l.t)) lamps.push(l.x, heightAt(l.x, l.y) + 6, -l.y);
  }
  if (lamps.length) group.add(glowPoints(lamps, uniforms, 14, '1.0, 0.7, 0.36'));
  const sprays = spray(data.lakepts, uniforms);
  group.add(sprays.object);
  const lens = lenticulars((cfg.lenticulars || []).map(([la, lo, alt]) => { const p = xy(la, lo); return { ...p, z: (alt - data.grid.h0) * data.grid.vexag }; }));
  group.add(lens);

  let wind = 0, windTarget = 0;
  const follows = [];
  if (walkers.lead) follows.push({ label: 'Hike the W', dot: '#e2412b', obj: walkers.lead, zoom: 22 });
  if (birds.lead) follows.push({ label: 'Soar with a condor', dot: '#1c1b1d', obj: birds.lead, zoom: 10 });

  const toggles = [{
    id: 'wind', label: 'Patagonian wind', on: false,
    onChange(on) {
      windTarget = on ? 1 : 0;
      return on ? 'The westerlies come howling off the ice field: spray tears off the lakes, lenticular clouds stack up over the towers'
        : 'The wind drops, for now';
    },
  }];

  return {
    follows,
    toggles,
    leads: { hiker: walkers.lead, condor: birds.lead },
    update(t, dt) {
      wind += (windTarget - wind) * Math.min(1, (dt || 0) * 0.7);
      birds.setWind(wind); walkers.setWind?.(wind);
      lens.visible = wind > 0.05;
      lens.children.forEach((m) => { m.material.opacity = 0.88 * wind; });
      bergs.update(t);
      birds.update(t);
      walkers.update(Math.min(dt || 0, 0.1));
      sprays.update(t, wind);
    },
    seek(t, dt) { for (let ft = 0; ft < t - dt / 2; ft += Math.max(dt, 0.5)) walkers.update(Math.max(dt, 0.5)); },
    info: { bergs: bergs.count || 0, hikers: walkers.count || 0, condors: (cfg.thermals || []).length * 5 },
  };
}
