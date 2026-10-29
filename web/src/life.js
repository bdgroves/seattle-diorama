// Trees (late-October colors) and street traffic.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { toV3 } from './city.js';

// ------------------------------------------------------------------ trees
const AUTUMN = [
  ['#e9a23b', 5], ['#d8682a', 4], ['#c0442b', 3], ['#f1c84c', 4],
  ['#a8452f', 2], ['#8e9b3d', 3], ['#6d8c3c', 3], ['#b8862f', 2],
];
const CONIFER = ['#2f5c3c', '#3a6a47', '#2a4f37', '#456f4a'];

function weighted(list, r) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let t = r * total;
  for (const [c, w] of list) { if ((t -= w) <= 0) return c; }
  return list[0][0];
}

export function buildTrees(flat) {
  const n = flat.length / 4;
  const decid = [], conif = [];
  for (let i = 0; i < n; i++) {
    const t = { x: flat[i * 4], y: flat[i * 4 + 1], s: flat[i * 4 + 2], k: flat[i * 4 + 3], i };
    (t.k === 1 ? conif : decid).push(t);
  }
  const group = new THREE.Group();
  const rand = mulberry32(98101);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);

  const canopyG = new THREE.IcosahedronGeometry(1, 1);
  const coneG = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const trunkG = new THREE.CylinderGeometry(0.2, 0.32, 1, 5).translate(0, 0.5, 0);
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 1 });

  const canopy = new THREE.InstancedMesh(canopyG, leafMat, decid.length);
  const cones = new THREE.InstancedMesh(coneG, leafMat, conif.length);
  const trunks = new THREE.InstancedMesh(trunkG, trunkMat, decid.length + conif.length);
  let ti = 0;

  decid.forEach((t, i) => {
    const s = t.s, wob = 0.85 + rand() * 0.3;
    q.setFromAxisAngle(yAxis, rand() * 6.28);
    sc.set(3.3 * s * wob, 3.0 * s, 3.3 * s / wob);
    mtx.compose(toV3(t.x, t.y, 4.4 * s + 1.2), q, sc);
    canopy.setMatrixAt(i, mtx);
    col.set(weighted(AUTUMN, rand())).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.08);
    canopy.setColorAt(i, col);
    sc.set(1.6 * s, 3.2 * s, 1.6 * s);
    mtx.compose(toV3(t.x, t.y, 0), q, sc);
    trunks.setMatrixAt(ti++, mtx);
  });
  conif.forEach((t, i) => {
    const s = t.s;
    q.setFromAxisAngle(yAxis, rand() * 6.28);
    sc.set(2.8 * s, 11 * s, 2.8 * s);
    mtx.compose(toV3(t.x, t.y, 1.6 * s), q, sc);
    cones.setMatrixAt(i, mtx);
    col.set(CONIFER[Math.floor(rand() * CONIFER.length)]);
    cones.setColorAt(i, col);
    sc.set(1.4 * s, 2.0 * s, 1.4 * s);
    mtx.compose(toV3(t.x, t.y, 0), q, sc);
    trunks.setMatrixAt(ti++, mtx);
  });
  for (const m of [canopy, cones, trunks]) {
    m.castShadow = true; m.receiveShadow = true;
    if (m.count) group.add(m);
  }
  return group;
}

// ------------------------------------------------------------------ traffic
const CAR_COLORS = ['#f2efe8', '#f2efe8', '#2b2f36', '#2b2f36', '#a9b1ba', '#c7372f',
  '#36659e', '#e0b13c', '#1f5b48', '#d8d2c4', '#6d7782', '#7a2f35'];

function carGeometry() {
  const body = new THREE.BoxGeometry(4.4, 1.0, 1.9).translate(0, 0.75, 0);
  const cab = new THREE.BoxGeometry(2.3, 0.75, 1.7).translate(-0.25, 1.62, 0);
  paint(body, [1, 1, 1]);
  paint(cab, [0.32, 0.36, 0.42]);
  return BGU.mergeGeometries([body.toNonIndexed(), cab.toNonIndexed()]);
}
function busGeometry() {
  const body = new THREE.BoxGeometry(12, 2.5, 2.55).translate(0, 1.65, 0);
  const band = new THREE.BoxGeometry(12.04, 0.8, 2.6).translate(0, 2.0, 0);
  paint(body, [1, 1, 1]);
  paint(band, [0.18, 0.22, 0.27]);
  return BGU.mergeGeometries([body.toNonIndexed(), band.toNonIndexed()]);
}
function lightsGeometry(len, w, h) {
  const parts = [];
  for (const side of [-1, 1]) {
    const f = new THREE.BoxGeometry(0.2, 0.25, 0.4).translate(len / 2, h, side * (w / 2 - 0.3));
    paint(f, [1, 0.95, 0.8]); parts.push(f.toNonIndexed());
    const r = new THREE.BoxGeometry(0.2, 0.25, 0.4).translate(-len / 2, h, side * (w / 2 - 0.3));
    paint(r, [1, 0.12, 0.08]); parts.push(r.toNonIndexed());
  }
  return BGU.mergeGeometries(parts);
}
function paint(g, rgb) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

class Lane {
  constructor(flat) {
    this.p = [];
    for (let i = 0; i < flat.length; i += 2) this.p.push([flat[i], flat[i + 1]]);
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) {
      const [ax, ay] = this.p[i - 1], [bx, by] = this.p[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    this.len = this.cum[this.cum.length - 1];
  }
  // position + heading at distance s
  at(s, out) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid; }
    const [ax, ay] = this.p[lo], [bx, by] = this.p[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    out.x = ax + (bx - ax) * t; out.y = ay + (by - ay) * t;
    out.dx = (bx - ax) / seg; out.dy = (by - ay) / seg;
    return out;
  }
}

export function buildTraffic(lanesFlat, uniforms) {
  const lanes = lanesFlat.map((f) => new Lane(f)).filter((l) => l.len > 60);
  const total = lanes.reduce((s, l) => s + l.len, 0);
  const rand = mulberry32(1962);
  const nCars = Math.min(420, Math.floor(total / 55));
  const nBus = Math.min(24, Math.floor(total / 900));
  const pick = () => { // longer lanes get more traffic
    let t = rand() * total;
    for (const l of lanes) { if ((t -= l.len) <= 0) return l; }
    return lanes[0];
  };
  const make = (n, bus) => Array.from({ length: n }, () => {
    const lane = pick();
    return { lane, s: rand() * lane.len, dir: rand() < 0.5 ? 1 : -1,
      v: bus ? 7 + rand() * 2 : 8 + rand() * 6, bus, pause: 0 };
  });
  const cars = make(nCars, false), buses = make(nBus, true);

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const carMesh = new THREE.InstancedMesh(carGeometry(), mat, Math.max(cars.length, 1));
  const busMesh = new THREE.InstancedMesh(busGeometry(), mat, Math.max(buses.length, 1));
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const carLights = new THREE.InstancedMesh(lightsGeometry(4.4, 1.9, 0.85), lightMat, Math.max(cars.length, 1));
  const busLights = new THREE.InstancedMesh(lightsGeometry(12, 2.55, 0.9), lightMat, Math.max(buses.length, 1));
  carMesh.count = cars.length; carLights.count = cars.length;
  busMesh.count = buses.length; busLights.count = buses.length;
  const col = new THREE.Color();
  cars.forEach((c, i) => carMesh.setColorAt(i, col.set(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)])));
  // King County Metro-ish: green/gold and blue/teal
  buses.forEach((b, i) => busMesh.setColorAt(i, col.set(rand() < 0.5 ? '#2f8a62' : '#2e6f9e')));
  for (const m of [carMesh, busMesh]) { m.castShadow = true; m.receiveShadow = true; }

  const group = new THREE.Group();
  group.add(carMesh, busMesh, carLights, busLights);

  const tmp = {}, mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();

  function place(list, mesh, lights, dt) {
    list.forEach((c, i) => {
      if (c.pause > 0) c.pause -= dt;
      else {
        c.s += c.v * c.dir * dt;
        if (c.s > c.lane.len || c.s < 0) { // end of the run: turn around
          c.dir *= -1; c.s = Math.max(0, Math.min(c.lane.len, c.s)); c.pause = 1 + rand() * 3;
        }
      }
      c.lane.at(c.s, tmp);
      const dx = tmp.dx * c.dir, dy = tmp.dy * c.dir;
      const off = c.bus ? 2.2 : 1.9; // drive on the right
      p.set(tmp.x + dy * off, 0.14, -(tmp.y - dx * off));
      q.setFromAxisAngle(yAxis, Math.atan2(dy, dx));
      mtx.compose(p, q, one);
      mesh.setMatrixAt(i, mtx);
      lights.setMatrixAt(i, mtx);
    });
    mesh.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    update(dt) {
      place(cars, carMesh, carLights, dt);
      place(buses, busMesh, busLights, dt);
      const k = 0.55 + uniforms.uNight.value * 3.2;
      lightMat.color.setRGB(k, k, k);
    },
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
