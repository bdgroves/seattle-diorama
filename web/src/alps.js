// Zermatt's moving parts: gabled chalets with geranium boxes, cable cars,
// gondolas and chairlifts on their cables, the Gornergrat and Matterhorn
// Gotthard trains, ski pistes with skiers in winter, herds of cows (a few
// dressed up for the Alpabzug) and paragliders in summer, and Swiss flags.
//
// Data comes from pipeline/alpine.py: lifts, rails, pistes, cows, chalets.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './life.js';

function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
const B = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

// polyline [x,y,z,...] in map coords -> distance lookups
class Path3 {
  constructor(flat) {
    this.p = []; this.cum = [0];
    for (let i = 0; i < flat.length; i += 3) this.p.push([flat[i], flat[i + 1], flat[i + 2]]);
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.len = this.cum[this.cum.length - 1] || 1;
  }
  at(s, o) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], seg = this.cum[hi] - this.cum[lo] || 1, t = (s - this.cum[lo]) / seg;
    o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t; o.z = a[2] + (b[2] - a[2]) * t;
    o.dx = (b[0] - a[0]) / seg; o.dy = (b[1] - a[1]) / seg; o.dz = (b[2] - a[2]) / seg;
    return o;
  }
}

function ribbonGeo(list, width) {
  const pos = [];
  for (const flat of list) {
    const n = flat.length / 3;
    const L = [], R = [];
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      let tx = flat[b * 3] - flat[a * 3], ty = flat[b * 3 + 1] - flat[a * 3 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const ox = -ty * width / 2, oy = tx * width / 2, h = flat[k * 3 + 2];
      L.push([flat[k * 3] + ox, h, -(flat[k * 3 + 1] + oy)]); R.push([flat[k * 3] - ox, h, -(flat[k * 3 + 1] - oy)]);
    }
    for (let k = 0; k < n - 1; k++) pos.push(...L[k], ...R[k], ...L[k + 1], ...L[k + 1], ...R[k], ...R[k + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ chalets
function chaletMeshes(flat, uniforms) {
  const n = (flat || []).length / 8;
  if (!n) return null;
  // unit chalet: 1 x 1 x 1 walls (stone base, larch above), gable roof along x
  const base = new THREE.BoxGeometry(1, 0.34, 1).translate(0, 0.17, 0);
  const wood = new THREE.BoxGeometry(1, 0.66, 1).translate(0, 0.67, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.62, 0); roofShape.lineTo(0, 0.42); roofShape.lineTo(0.62, 0); roofShape.lineTo(0.58, -0.03); roofShape.lineTo(0, 0.37); roofShape.lineTo(-0.58, -0.03);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.14, bevelEnabled: false }).translate(0, 0, -0.57).rotateY(Math.PI / 2).translate(0, 1.0, 0);
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#76787c', roughness: 0.85 });
  woodMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vSeed;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position; vSeed = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vLoc; varying float vSeed;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // windows in rows on each floor, red geraniums in boxes under them
        float u = abs(vLoc.x) > 0.499 ? vLoc.z : vLoc.x;
        float fl = (vLoc.y - 0.34) / 0.66 * 2.0;         // two floors of wood
        float fy = fract(fl), fx = fract((u + 0.5) * 3.0);
        bool side = abs(vLoc.y - 1.0) > 0.001 && vLoc.y > 0.345;
        float win = side && fx > 0.3 && fx < 0.7 && fy > 0.35 && fy < 0.8 ? 1.0 : 0.0;
        float box = side && fx > 0.25 && fx < 0.75 && fy > 0.2 && fy < 0.33 ? 1.0 : 0.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.15, 0.15), win * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.12, 0.12), box * 0.9);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float lit = step(0.35, fract(vSeed * 7.3 + floor(fl) * 0.37 + floor((u + 0.5) * 3.0) * 0.21));
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * win * lit * uNight * 1.6;`);
  };
  const group = new THREE.Group();
  const meshes = [[base, stoneMat], [wood, woodMat], [roof, roofMat]].map(([gm, mt]) => {
    const m = new THREE.InstancedMesh(gm, mt, n);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const WOOD = ['#6b4a32', '#7a5538', '#5e3f2a', '#83603f', '#6f4c33', '#8b6a48'];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const [x, y, z, w, d, h, ang, seed] = flat.slice(i * 8, i * 8 + 8);
    // hotels in town keep their bulk; the roof height follows the depth
    p.set(x, z, -y); q.setFromAxisAngle(yAxis, ang); s.set(w, Math.min(h, 22), d);
    m4.compose(p, q, s);
    meshes[0].setMatrixAt(i, m4); meshes[1].setMatrixAt(i, m4);
    const rs = new THREE.Vector3(w, Math.max(4, d * 0.9), d);
    p.set(x, z + Math.min(h, 22) * 1.0 - Math.max(4, d * 0.9) * 1.0, -y);
    // roof: sits on top of the walls, its height scales with the depth
    const top = z + Math.min(h, 22);
    m4.compose(new THREE.Vector3(x, top - rs.y * 1.0, -y), q, rs);
    meshes[2].setMatrixAt(i, m4);
    meshes[1].setColorAt(i, c.set(WOOD[Math.floor(seed * 997) % WOOD.length]));
  }
  return { group, setWinter(on) { roofMat.color.set(on ? '#f4f6f8' : '#76787c'); } };
}

// ------------------------------------------------------------------ lifts
const LIFT = {
  cable_car: { pylon: 30, cabin: 'tram', speed: 9 },
  gondola: { pylon: 20, cabin: 'gondola', gap: 70, speed: 6 },
  mixed_lift: { pylon: 20, cabin: 'gondola', gap: 70, speed: 6 },
  chair_lift: { pylon: 12, cabin: 'chair', gap: 22, speed: 4 },
  drag_lift: { pylon: 7, cabin: null }, 't-bar': { pylon: 7, cabin: null }, 'j-bar': { pylon: 7, cabin: null },
  platter: { pylon: 7, cabin: null }, rope_tow: { pylon: 3, cabin: null },
};

function liftSystem(lifts, uniforms, scale, rideRx) {
  const group = new THREE.Group();
  const cableVerts = [];
  const pylons = [], stations = [];
  const runs = [];          // { path (cable), kind, n, gap, speed, loop }
  for (const L of lifts) {
    const spec = LIFT[L.k] || LIFT.gondola;
    const P = [];
    for (let i = 0; i < L.p.length; i += 3) P.push([L.p[i], L.p[i + 1], L.p[i + 2]]);
    const supports = P.map((q, i) => [q[0], q[1], q[2] + (i === 0 || i === P.length - 1 ? 9 : spec.pylon)]);
    // direction and the sideways offset for the two cables
    const d0 = P[P.length - 1][0] - P[0][0], d1 = P[P.length - 1][1] - P[0][1], dl = Math.hypot(d0, d1) || 1;
    const sx = -d1 / dl, sy = d0 / dl;
    const off = spec.cabin === 'tram' ? 4 : spec.cabin ? 3.2 : 0.8;
    const cable = (side) => {
      const out = [];
      for (let i = 0; i < supports.length - 1; i++) {
        const a = supports[i], b = supports[i + 1];
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(4, Math.ceil(span / 25));
        const sag = span * 0.035;
        for (let k = (i ? 1 : 0); k <= steps; k++) {
          const t = k / steps;
          out.push(a[0] + (b[0] - a[0]) * t + sx * off * side, a[1] + (b[1] - a[1]) * t + sy * off * side,
            a[2] + (b[2] - a[2]) * t - sag * 4 * t * (1 - t));
        }
      }
      return out;
    };
    const up = cable(1), down = cable(-1);
    for (const c of [up, down]) {
      for (let i = 0; i < c.length / 3 - 1; i++) cableVerts.push(c[i * 3], c[i * 3 + 2], -c[i * 3 + 1], c[i * 3 + 3], c[i * 3 + 5], -c[i * 3 + 4]);
    }
    supports.forEach((q, i) => {
      if (i === 0 || i === supports.length - 1) stations.push({ x: P[i][0], y: P[i][1], z: P[i][2], ang: Math.atan2(d1, d0), big: spec.cabin === 'tram' || spec.cabin === 'gondola' });
      else pylons.push({ x: q[0], y: q[1], z: P[i][2], h: spec.pylon, ang: Math.atan2(d1, d0) });
    });
    if (spec.cabin) {
      const upP = new Path3(up), downP = new Path3(down.slice().reverse().flatMap((_, i, arr) => (i % 3 === 0 ? [] : [])));
      // the return cable, top to bottom
      const rev = [];
      for (let i = down.length / 3 - 1; i >= 0; i--) rev.push(down[i * 3], down[i * 3 + 1], down[i * 3 + 2]);
      runs.push({ kind: spec.cabin, up: upP, down: new Path3(rev), gap: spec.gap, speed: spec.speed * 2.5, name: L.n });
      void downP;
    }
  }
  const cables = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(cableVerts, 3)),
    new THREE.LineBasicMaterial({ color: '#2a2724', transparent: true, opacity: 0.75 }));
  group.add(cables);

  // pylons and stations
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pylonG = BGU.mergeGeometries([B(1.2, 1, 1.2, 0, 0.5, 0, '#8d9196'), B(1.4, 0.05, 8, 0, 1.0, 0, '#6d7176')]);
  const pyl = new THREE.InstancedMesh(pylonG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), Math.max(1, pylons.length));
  pylons.forEach((o, i) => { p.set(o.x, o.z, -o.y); q.setFromAxisAngle(yAxis, o.ang); s.set(1.6, o.h, 1.6); pyl.setMatrixAt(i, m4.compose(p, q, s)); });
  pyl.count = pylons.length; pyl.castShadow = true;
  const stG = BGU.mergeGeometries([B(1, 0.7, 1, 0, 0.35, 0, '#d9d6cf'), B(1.1, 0.12, 1.1, 0, 0.76, 0, '#4b4e52')]);
  const st = new THREE.InstancedMesh(stG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), Math.max(1, stations.length));
  stations.forEach((o, i) => { p.set(o.x, o.z, -o.y); q.setFromAxisAngle(yAxis, o.ang); s.set(o.big ? 26 : 12, o.big ? 12 : 6, o.big ? 18 : 8); st.setMatrixAt(i, m4.compose(p, q, s)); });
  st.count = stations.length; st.castShadow = true;
  group.add(pyl, st);

  // carriers
  const geo = {
    gondola: BGU.mergeGeometries([B(2.4, 2.3, 2.0, 0, -2.6, 0, '#c4232c'), B(2.45, 0.8, 2.05, 0, -2.2, 0, '#1f2328'), B(0.15, 1.5, 0.15, 0, -0.75, 0, '#3a3d42')]),
    tram: BGU.mergeGeometries([B(9, 4, 4.2, 0, -5.5, 0, '#c4232c'), B(9.05, 1.4, 4.25, 0, -5.0, 0, '#1f2328'), B(2.5, 0.6, 1.5, 0, -3.2, 0, '#55595e'), B(0.3, 3, 0.3, 0, -1.6, 0, '#3a3d42')]),
    chair: BGU.mergeGeometries([B(2.2, 0.25, 1.0, 0, -2.4, 0, '#33373d'), B(2.2, 1.0, 0.2, 0, -1.95, -0.45, '#33373d'), B(0.12, 2.2, 0.12, 0, -1.1, 0, '#55595e')]),
  };
  const carriers = { gondola: [], tram: [], chair: [] };
  runs.forEach((r) => {
    if (r.kind === 'tram') {
      carriers.tram.push({ r, side: 0 }); carriers.tram.push({ r, side: 1 });
    } else {
      const loop = r.up.len + r.down.len;
      const n = Math.min(80, Math.floor(loop / r.gap));
      for (let i = 0; i < n; i++) carriers[r.kind].push({ r, s: (i / n) * loop });
    }
  });
  const meshes = {};
  const matC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
  for (const k of Object.keys(carriers)) {
    if (!carriers[k].length) continue;
    const m = new THREE.InstancedMesh(geo[k], matC, carriers[k].length);
    m.castShadow = true; m.frustumCulled = false;
    meshes[k] = m; group.add(m);
  }
  const tmp = {};
  const lead = { pos: new THREE.Vector3() };
  // ride along on the longest gondola or tram
  const ride = runs.find((r) => rideRx && rideRx.test(r.name)) || runs.slice().sort((a, b) => b.up.len - a.up.len)[0];
  function update(t) {
    for (const k of Object.keys(meshes)) {
      carriers[k].forEach((c, i) => {
        const r = c.r;
        let path, s;
        if (k === 'tram') {
          // two cabins shuttle in counterweight: one up while the other comes down, a pause at the ends
          const run = r.up.len / (r.speed * 1.6), cyc = 2 * (run + 20), ph = (t % cyc);
          let u = ph < run ? ph / run : ph < run + 20 ? 1 : ph < 2 * run + 20 ? 1 - (ph - run - 20) / run : 0;
          u = u * u * (3 - 2 * u);
          if (c.side) { path = r.down; s = u * r.down.len; } else { path = r.up; s = u * r.up.len; }
        } else {
          const loop = r.up.len + r.down.len;
          const ss = (c.s + t * r.speed) % loop;
          if (ss < r.up.len) { path = r.up; s = ss; } else { path = r.down; s = ss - r.up.len; }
        }
        path.at(s, tmp);
        p.set(tmp.x, tmp.z, -tmp.y);
        q.setFromAxisAngle(yAxis, Math.atan2(tmp.dy, tmp.dx));
        s_.setScalar(scale);
        meshes[k].setMatrixAt(i, m4.compose(p, q, s_));
        if (ride && r === ride && ((k === 'tram' && c.side === 0) || (k !== 'tram' && i === carriers[k].findIndex((cc) => cc.r === ride)))) lead.pos.copy(p);
      });
      meshes[k].instanceMatrix.needsUpdate = true;
    }
  }
  const s_ = new THREE.Vector3();
  return { group, update, lead, rideName: ride?.name, count: lifts.length };
}

// ------------------------------------------------------------------ trains
function trainSystem(rails, scale, trainlines) {
  const group = new THREE.Group();
  if (!rails?.length) return { group, update() {}, leads: {} };
  const bed = new THREE.Mesh(ribbonGeo(rails.map((r) => r.p.map((v, i) => (i % 3 === 2 ? v + 0.4 : v))), 4.5),
    new THREE.MeshStandardMaterial({ color: '#5a524a', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  bed.receiveShadow = true;
  group.add(bed);
  const carG = BGU.mergeGeometries([B(15, 2.9, 2.7, 0, 1.75, 0, '#c8202a'), B(15.05, 0.9, 2.75, 0, 2.2, 0, '#1f2328'), B(14, 0.35, 2.3, 0, 3.35, 0, '#e9e6df'), B(13, 0.5, 2.2, 0, 0.25, 0, '#2b2b2b')]);
  // the longest piece of each line carries the trains
  const lines = {};
  for (const r of trainlines?.length ? trainlines : rails) if (!lines[r.n] || lines[r.n].p.length < r.p.length) lines[r.n] = r;
  const trains = [];
  Object.values(lines).forEach((r, li) => {
    const path = new Path3(r.p);
    const cars = /gornergrat/i.test(r.n) ? 2 : 4;
    for (let k = 0; k < 2; k++) trains.push({ path, cars, phase: k * 0.5 + li * 0.13, v: /gornergrat/i.test(r.n) ? 9 : 16, name: r.n });
  });
  const total = trains.reduce((s, t) => s + t.cars, 0);
  const mesh = new THREE.InstancedMesh(carG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }), total);
  mesh.castShadow = true; mesh.frustumCulled = false;
  group.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale);
  const e = new THREE.Euler();
  const tmp = {};
  const leads = {};
  for (const t of trains) if (!leads[t.name]) leads[t.name] = { pos: new THREE.Vector3() };
  const DWELL = 25;
  function update(time) {
    let k = 0;
    for (const t of trains) {
      const run = t.path.len / t.v, cyc = 2 * (run + DWELL), ph = (time + t.phase * cyc) % cyc;
      let u, dir;
      if (ph < run) { u = ph / run; dir = 1; } else if (ph < run + DWELL) { u = 1; dir = 1; } else if (ph < 2 * run + DWELL) { u = 1 - (ph - run - DWELL) / run; dir = -1; } else { u = 0; dir = -1; }
      u = u * u * (3 - 2 * u);
      for (let c = 0; c < t.cars; c++) {
        const s = u * t.path.len - dir * c * 15.6 * scale;
        t.path.at(s, tmp);
        const hx = tmp.dx * dir, hy = tmp.dy * dir;
        p.set(tmp.x, tmp.z - 0.6, -tmp.y);
        e.set(0, Math.atan2(hy, hx), Math.atan(tmp.dz * dir), 'YZX');
        q.setFromEuler(e);
        mesh.setMatrixAt(k++, m4.compose(p, q, sc));
        if (c === 0 && t === trains.find((tt) => tt.name === t.name)) leads[t.name].pos.copy(p);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, leads };
}

// ------------------------------------------------------------------ pistes and skiers
const PISTE = { novice: '#2d8a3e', easy: '#2f6fd6', intermediate: '#d43a2f', advanced: '#1b1b1b', expert: '#1b1b1b', freeride: '#e08a1e', extreme: '#e08a1e' };
function pisteSystem(pistes, scale) {
  const group = new THREE.Group();
  const byColor = {};
  for (const p of pistes || []) (byColor[PISTE[p.d] || '#d43a2f'] ||= []).push(p);
  const groomed = { all: [], glacier: [] };
  const lineMeshes = [];
  const snowMat = new THREE.MeshStandardMaterial({ color: '#fbfcfd', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const band = (list) => new THREE.Mesh(ribbonGeo(list.map((p) => p.p), 26), snowMat);
  const allBand = band(pistes || []);
  const glacierList = (pistes || []).filter((p) => p.e > 3150);
  const glacierBand = band(glacierList);
  allBand.receiveShadow = glacierBand.receiveShadow = true;
  group.add(allBand, glacierBand);
  for (const [col, list] of Object.entries(byColor)) {
    const mat = new THREE.MeshBasicMaterial({ color: col, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const all = new THREE.Mesh(ribbonGeo(list.map((p) => p.p.map((v, i) => (i % 3 === 2 ? v + 0.3 : v))), 5), mat);
    const gl = new THREE.Mesh(ribbonGeo(list.filter((p) => p.e > 3150).map((p) => p.p.map((v, i) => (i % 3 === 2 ? v + 0.3 : v))), 5), mat);
    group.add(all, gl);
    lineMeshes.push({ all, gl });
  }
  void groomed;
  // skiers
  const paths = (pistes || []).map((p) => ({ path: new Path3(p.p), glacier: p.e > 3150 })).filter((p) => p.path.len > 200);
  const N = Math.min(420, paths.length * 6);
  const rnd = mulberry32(1865);              // first ascent of the Matterhorn
  const skierG = BGU.mergeGeometries([B(0.5, 1.1, 0.35, 0, 0.95, 0, '#ffffff'), B(0.3, 0.3, 0.3, 0, 1.65, 0, '#f2d4b5'), B(1.7, 0.06, 0.12, 0, 0.05, 0.15, '#222222'), B(1.7, 0.06, 0.12, 0, 0.05, -0.15, '#222222')]);
  const mesh = new THREE.InstancedMesh(skierG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), Math.max(1, N));
  mesh.castShadow = true; mesh.frustumCulled = false;
  const JACKET = ['#e2312b', '#1f5fbf', '#f2c230', '#2f8f6b', '#e86a1a', '#7a2f8f', '#111111', '#f2efe8'];
  const col = new THREE.Color();
  const skiers = [];
  for (let i = 0; i < N; i++) {
    const pick = paths[Math.floor(rnd() * paths.length)];
    skiers.push({ p: pick, s: rnd() * pick.path.len, v: 7 + rnd() * 9, ph: rnd() * 6.28, w: 4 + rnd() * 8 });
    mesh.setColorAt(i, col.set(JACKET[Math.floor(rnd() * JACKET.length)]));
  }
  group.add(mesh);
  let winter = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pp = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale), zero = new THREE.Vector3(0, 0, 0);
  const e = new THREE.Euler();
  const tmp = {};
  function setWinter(on) {
    winter = on;
    allBand.visible = on; glacierBand.visible = !on;
    for (const l of lineMeshes) { l.all.visible = on; l.gl.visible = !on; }
  }
  function update(t, dt) {
    skiers.forEach((k, i) => {
      if (!winter && !k.p.glacier) { mesh.setMatrixAt(i, m4.compose(pp.set(0, -1e5, 0), q, zero)); return; }
      k.s += k.v * dt;
      if (k.s > k.p.path.len) {
        k.p = paths[Math.floor(Math.random() * paths.length)];
        if (!winter && !k.p.glacier) k.p = paths.find((x) => x.glacier) || k.p;
        k.s = 0;
      }
      k.p.path.at(k.s, tmp);
      // carve turns either side of the line
      const sw = Math.sin(k.s / 18 + k.ph);
      const ox = -tmp.dy * sw * k.w, oy = tmp.dx * sw * k.w;
      pp.set(tmp.x + ox, tmp.z + 0.4, -(tmp.y + oy));
      e.set(0, Math.atan2(tmp.dy, tmp.dx) + Math.cos(k.s / 18 + k.ph) * 0.6, -0.25, 'YZX');
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(pp, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, setWinter, km: (pistes || []).reduce((s, p) => s + new Path3(p.p).len, 0) / 1000 };
}

// ------------------------------------------------------------------ cows
function cowHerd(flat, scale) {
  const n = (flat || []).length / 5;
  const group = new THREE.Group();
  if (!n) return { group, update() {}, count: 0 };
  const body = BGU.mergeGeometries([
    B(2.0, 0.85, 0.85, 0, 1.15, 0, '#ffffff'),                    // barrel
    B(0.55, 0.5, 0.45, 1.25, 1.35, 0, '#ffffff'),                 // head
    B(0.25, 0.18, 0.36, 1.55, 1.25, 0, '#e8c9b5'),                // muzzle
    ...[[0.7, 0.28], [0.7, -0.28], [-0.7, 0.28], [-0.7, -0.28]].map(([x, z]) => B(0.18, 0.75, 0.18, x, 0.38, z, '#ffffff')),
    B(0.08, 0.6, 0.08, -1.05, 1.0, 0, '#ffffff'),                 // tail
    B(0.08, 0.22, 0.08, 1.2, 1.65, 0.18, '#e9e2cf'), B(0.08, 0.22, 0.08, 1.2, 1.65, -0.18, '#e9e2cf'),   // horns
    B(0.22, 0.26, 0.22, 1.0, 0.82, 0, '#d4a531'),                 // the bell
  ]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const mesh = new THREE.InstancedMesh(body, mat, n);
  mesh.castShadow = true;
  // the Alpabzug crowns: flowers and a big ribboned bell
  const fancyIdx = [];
  for (let i = 0; i < n; i++) if (flat[i * 5 + 4] === 2) fancyIdx.push(i);
  const crownG = BGU.mergeGeometries([
    ...[-0.24, -0.08, 0.08, 0.24].map((z, k) => paint(new THREE.SphereGeometry(0.14, 6, 4).translate(1.2, 1.78, z), ['#e2312b', '#f2c230', '#ffffff', '#3f7fd6'][k])),
    B(0.5, 0.06, 0.5, 1.2, 1.7, 0, '#2f8f3e'),
    B(0.36, 0.42, 0.36, 1.0, 0.7, 0, '#e2b33a'), B(0.05, 0.4, 0.4, 1.0, 1.0, 0, '#c4232c'),
  ]);
  const crowns = new THREE.InstancedMesh(crownG, mat, Math.max(1, fancyIdx.length));
  crowns.count = fancyIdx.length;
  const COAT = ['#2b211c', '#8a6d55', '#9a7a5e'];              // Eringer black, Brown Swiss
  const col = new THREE.Color();
  const cows = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale);
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const [x, y, z, h, breed] = flat.slice(i * 5, i * 5 + 5);
    cows.push({ x, y, z, h, seed: (i * 0.618) % 1 });
    mesh.setColorAt(i, col.set(breed === 0 ? COAT[0] : breed === 1 ? COAT[1] : COAT[2]));
  }
  group.add(mesh, crowns);
  function update(t) {
    let f = 0;
    cows.forEach((c, i) => {
      // graze: drift slowly, turn now and then
      const head = c.h + Math.sin(t * 0.05 + c.seed * 40) * 0.8;
      p.set(c.x + Math.sin(t * 0.03 + c.seed * 9) * 2.5, c.z, -(c.y + Math.cos(t * 0.027 + c.seed * 7) * 2.5));
      q.setFromAxisAngle(yAxis, head);
      m4.compose(p, q, sc);
      mesh.setMatrixAt(i, m4);
      if (fancyIdx[f] === i) { crowns.setMatrixAt(f, m4); f++; }
    });
    mesh.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  }
  return { group, update, count: n, fancy: fancyIdx.length };
}

// ------------------------------------------------------------------ paragliders
function paragliders(spots, heightAt, scale) {
  const group = new THREE.Group();
  const wingG = new THREE.BufferGeometry();
  {
    // an arched wing of cells, lines down to the pilot
    const parts = [];
    const COLS = [['#e2312b', '#ffffff'], ['#f2c230', '#1f5fbf'], ['#2f8f6b', '#f2efe8'], ['#e86a1a', '#7a2f8f'], ['#1f5fbf', '#f2c230'], ['#c4232c', '#f2c230']];
    void COLS;
    for (let k = -5; k <= 5; k++) {
      const a = (k / 5) * 0.75;
      parts.push(B(1.2, 0.35, 2.2, 0, 0, 0, k % 2 ? '#ffffff' : '#e2312b').rotateX(a).translate(0, 7 * Math.cos(a), 7 * Math.sin(a)));
    }
    parts.push(B(0.4, 0.8, 0.4, 0, -0.4, 0, '#2b2f36'));
    wingG.copy(BGU.mergeGeometries(parts));
  }
  const n = spots.length * 2;
  const mesh = new THREE.InstancedMesh(wingG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), n);
  mesh.castShadow = true; mesh.frustumCulled = false;
  const WING = ['#ffffff', '#ffe08a', '#bfe3ff', '#ffc2b8', '#d9f2c2', '#ffd6f0'];
  const col = new THREE.Color();
  const gl = [];
  for (let i = 0; i < n; i++) {
    const s = spots[i % spots.length];
    gl.push({ ...s, ph: i * 1.7, r: 120 + (i % 3) * 70, top: s.top + (i % 2) * 120 });
    mesh.setColorAt(i, col.set(WING[i % WING.length]));
  }
  group.add(mesh);
  const lead = { pos: new THREE.Vector3() };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(scale, scale, scale);
  const e = new THREE.Euler();
  function update(t) {
    gl.forEach((g, i) => {
      // circle in a thermal, drifting down from the launch toward the village, then start again
      const cyc = 240, u = ((t + g.ph * 30) % cyc) / cyc;
      const cx = g.x + (g.lx - g.x) * u, cy = g.y + (g.ly - g.y) * u;
      const a = t * 0.25 + g.ph;
      const x = cx + Math.cos(a) * g.r, y = cy + Math.sin(a) * g.r;
      const ground = heightAt(x, y);
      const z = Math.max(ground + 60, g.top - (g.top - (g.lz + 40)) * u);
      p.set(x, z, -y);
      e.set(0, a + Math.PI / 2, -0.35, 'YZX');
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
      if (i === 0) lead.pos.copy(p);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { group, update, lead };
}

// ------------------------------------------------------------------ Swiss flags
function swissFlags(points, scale) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#d52b1e'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#ffffff'; x.fillRect(26, 13, 12, 38); x.fillRect(13, 26, 38, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  const flagMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.5 });
  const flags = [];
  for (const pt of points) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6).translate(0, 3, 0), poleMat);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2, 6, 1).translate(1.1, 0, 0), flagMat);
    flag.position.y = 4.8;
    const g = new THREE.Group();
    g.add(pole, flag);
    g.position.set(pt.x, pt.z, -pt.y);
    g.scale.setScalar(scale);
    g.rotation.y = pt.rot || 0;
    pole.castShadow = flag.castShadow = true;
    group.add(g);
    flags.push(flag);
  }
  function update(t) {
    flags.forEach((f, i) => {
      const pa = f.geometry.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const xx = pa.getX(k);
        pa.setZ(k, Math.sin(xx * 2.2 - t * 4 + i) * 0.18 * xx);
      }
      pa.needsUpdate = true;
    });
  }
  return { group, update };
}

// ------------------------------------------------------------------ all together
export async function buildAlps({ scene, uniforms, data, heightAt, ll, cfg }) {
  const group = new THREE.Group();
  scene.add(group);
  const S = cfg.critterScale || 3;
  const chalets = chaletMeshes(data.chalets, uniforms);
  if (chalets) group.add(chalets.group);
  const lifts = liftSystem(data.lifts || [], uniforms, cfg.liftScale || 2.2, cfg.rideRx);
  group.add(lifts.group);
  const trains = trainSystem(data.rails, cfg.trainScale || 1.6, data.trainlines);
  group.add(trains.group);
  const pistes = pisteSystem(data.pistes, S);
  group.add(pistes.group);
  const cows = cowHerd(data.cows, S);
  group.add(cows.group);
  const xy = (lat, lon) => { const v = ll(lat, lon); return { x: v.x, y: -v.z, z: v.y }; };
  const spots = (cfg.paraglide || []).map((s) => {
    const a = xy(s.from[0], s.from[1]), b = xy(s.to[0], s.to[1]);
    return { x: a.x, y: a.y, top: a.z + 250, lx: b.x, ly: b.y, lz: b.z };
  });
  const gliders = paragliders(spots, heightAt, S * 1.3);
  group.add(gliders.group);
  const flags = swissFlags((cfg.flags || []).map((f) => ({ ...xy(f[0], f[1]), rot: f[2] || 0 })), S * 1.6);
  group.add(flags.group);

  let winter = false;
  function setSeason(season) {
    winter = season !== 'spring';
    chalets?.setWinter(winter);
    pistes.setWinter(winter);
    cows.group.visible = !winter;
    gliders.group.visible = !winter;
  }
  const follows = [];
  const gg = Object.keys(trains.leads).find((k) => /gornergrat/i.test(k));
  if (gg) follows.push({ label: 'Ride the Gornergrat train', dot: '#c8202a', obj: trains.leads[gg], zoom: 14 });
  if (lifts.rideName !== undefined) follows.push({ label: cfg.rideLabel || `Ride the ${lifts.rideName || 'gondola'}`, dot: '#c4232c', obj: lifts.lead, zoom: 12 });
  if (spots.length) follows.push({ label: 'Fly with a paraglider', dot: '#f2c230', obj: gliders.lead, zoom: 10 });

  return {
    follows,
    leads: { train: gg ? trains.leads[gg] : null, lift: lifts.lead, glider: gliders.lead },
    setSeason,
    update(t, dt) {
      lifts.update(t);
      trains.update(t);
      pistes.update(t, Math.min(dt, 0.1));
      if (!winter) { cows.update(t); gliders.update(t); }
      flags.update(t);
    },
    seek(t) { lifts.update(t); trains.update(t); for (let k = 0; k < 60; k++) pistes.update(t, 0.5); },
    info: { lifts: lifts.count, pisteKm: pistes.km, cows: cows.count, fancy: cows.fancy, chalets: (data.chalets || []).length / 8 },
  };
}
