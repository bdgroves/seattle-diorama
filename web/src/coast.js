// Coastal dioramas (the Amalfi Coast): the sea itself, the water column on
// the slab's cut edges, ferries and hydrofoils on their lines, yachts and
// sailboats at anchor off the beaches, and summer beach umbrellas.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { animateWater, wakeMaterial } from './bay.js';
import { mulberry32 } from './life.js';

// ------------------------------------------------------------------ sea surface
export function seaSurface(grid, uniforms, scale) {
  const { nx, ny, x0, y1, dx, dy, sea } = grid;
  const w = (nx - 1) * dx, h = (ny - 1) * dy;
  const mat = new THREE.MeshStandardMaterial({
    color: '#1d6e9c', transparent: true, opacity: 0.6, roughness: 0.12, metalness: 0.05,
    envMapIntensity: 0.5, depthWrite: false,
  });
  animateWater(mat, uniforms, scale);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
  plane.position.set(x0 + w / 2, sea, -(y1 - h / 2));
  plane.receiveShadow = true;
  plane.renderOrder = 2;
  return { mesh: plane, mat };
}

// the water column seen in cross-section where the slab is cut through the sea
export function seaWalls(grid, z) {
  const { nx, ny, x0, y1, dx, dy, sea } = grid;
  const P = (i, j) => [x0 + i * dx, z[j * nx + i], -(y1 - j * dy)];
  const edges = [
    Array.from({ length: nx }, (_, i) => P(i, 0)),
    Array.from({ length: ny }, (_, j) => P(nx - 1, j)),
    Array.from({ length: nx }, (_, i) => P(nx - 1 - i, ny - 1)),
    Array.from({ length: ny }, (_, j) => P(0, ny - 1 - j)),
  ];
  const pos = [], depth = [];
  for (const e of edges) {
    for (let k = 0; k < e.length - 1; k++) {
      const [ax, ay, az] = e[k], [bx, by, bz] = e[k + 1];
      if (ay >= sea && by >= sea) continue;
      const ta = Math.min(ay, sea), tb = Math.min(by, sea);
      pos.push(ax, sea, az, ax, ta, az, bx, sea, bz, bx, sea, bz, ax, ta, az, bx, tb, bz);
      depth.push(0, sea - ta, 0, 0, sea - ta, sea - tb);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: `attribute float aDepth; varying float vD;
      void main(){ vD = aDepth; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vD;
      void main(){ float t = clamp(vD / 160.0, 0.0, 1.0);
        vec3 c = mix(vec3(0.20, 0.62, 0.76), vec3(0.04, 0.17, 0.34), t);
        gl_FragColor = vec4(c, 0.88); }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 3;
  return mesh;
}

// ------------------------------------------------------------------ boats
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function hullShape(L, W) {
  const s = new THREE.Shape();
  s.moveTo(-L / 2, -W / 2);
  s.lineTo(L * 0.22, -W / 2);
  s.quadraticCurveTo(L * 0.48, -W * 0.35, L / 2, 0);
  s.quadraticCurveTo(L * 0.48, W * 0.35, L * 0.22, W / 2);
  s.lineTo(-L / 2, W / 2);
  s.lineTo(-L / 2, -W / 2);
  return s;
}
function slab(shape, y0, y1, hex, inset = 1) {
  const pts = shape.getPoints(12).map((p) => new THREE.Vector2(p.x * inset, p.y * inset));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return paint(g, hex);
}
const box = (sx, sy, sz, x, y, z, hex) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex);

// Capri hydrofoils and ferries: white, with a blue stripe and dark windows
function ferryGeo() {
  const L = 42, W = 9, s = hullShape(L, W);
  return BGU.mergeGeometries([
    slab(s, -0.5, 1.6, '#f4f3ef'), slab(s, 1.6, 2.3, '#1f5fa8', 1.01), slab(s, 2.3, 3.2, '#f4f3ef'),
    box(L * 0.55, 2.4, W * 0.82, -2, 4.4, 0, '#f4f3ef'), box(L * 0.56, 1.0, W * 0.84, -2, 4.6, 0, '#26303a'),
    box(6, 1.8, W * 0.6, 8, 6.3, 0, '#f4f3ef'), box(6.1, 0.7, W * 0.62, 8, 6.5, 0, '#26303a'),
  ]);
}
function yachtGeo() {
  const L = 18, W = 5, s = hullShape(L, W);
  return BGU.mergeGeometries([
    slab(s, -0.4, 1.4, '#fbfaf6'), slab(s, 1.4, 1.6, '#d7d1c4', 0.98),
    box(7, 1.4, 3.6, -1.5, 2.3, 0, '#fbfaf6'), box(7.1, 0.6, 3.7, -1.5, 2.4, 0, '#2a3440'),
    box(3.2, 0.9, 3.0, -1.2, 3.4, 0, '#fbfaf6'),
  ]);
}
function sailGeo() {
  const L = 13, W = 4, s = hullShape(L, W);
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0.5, 1.6, 0, 0.5, 15, 0, -5, 1.9, 0], 3));
  sail.computeVertexNormals();
  return BGU.mergeGeometries([
    slab(s, -0.4, 1.1, '#f6f3ea'), box(3.5, 0.9, 2.4, -1.5, 1.6, 0, '#f6f3ea'),
    paint(new THREE.CylinderGeometry(0.12, 0.12, 15, 5).translate(0.5, 8.5, 0), '#b9b4aa'),
    paint(sail, '#fffdf7'),
  ]);
}

class Route {
  constructor(flat) {
    this.p = []; this.cum = [0];
    for (let i = 0; i < flat.length; i += 2) this.p.push([flat[i], flat[i + 1]]);
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(s, o) {
    s = Math.max(0, Math.min(this.len, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], seg = this.cum[hi] - this.cum[lo] || 1, t = (s - this.cum[lo]) / seg;
    o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t;
    o.dx = (b[0] - a[0]) / seg; o.dy = (b[1] - a[1]) / seg;
    return o;
  }
}

export function boats({ routes, anchored, sea, uniforms, scale = 2, leadNear = null, speed = 1 }) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
  const rnd = mulberry32(1544);
  const yAxis = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  const S = new THREE.Vector3(scale, scale, scale);

  // ferries: two per line, going opposite ways, dwelling at the ports
  const lines = (routes || []).map((f) => new Route(f)).filter((r) => r.len > 800);
  if (leadNear && lines.length) {
    // the followed ferry is the one whose line ends nearest that port (Capri)
    const d = (r) => Math.min(...[r.p[0], r.p[r.p.length - 1]].map((q) => Math.hypot(q[0] - leadNear[0], q[1] - leadNear[1])) ) - r.len * 1e-3;
    lines.sort((a, b) => d(a) - d(b));
  }
  const ferries = [];
  lines.forEach((r, i) => {
    for (const k of [0, 1]) ferries.push({ r, phase: (k * 0.5 + i * 0.17) % 1, v: (15 + rnd() * 4) * speed });
  });
  const fMesh = new THREE.InstancedMesh(ferryGeo(), mat, Math.max(1, ferries.length));
  fMesh.count = ferries.length;
  fMesh.castShadow = true;
  group.add(fMesh);
  const wakes = ferries.map(() => {
    const wm = wakeMaterial(uniforms);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(120 * scale, 34 * scale).rotateX(-Math.PI / 2).translate(-60 * scale, 0, 0), wm);
    w.renderOrder = 4;
    group.add(w);
    return { w, wm };
  });

  // boats at anchor; a share of them only come out in high summer
  const n = (anchored || []).length / 4;
  const kinds = [[], []];
  for (let i = 0; i < n; i++) kinds[anchored[i * 4 + 3] < 0.55 ? 0 : 1].push(i);
  const yMesh = new THREE.InstancedMesh(yachtGeo(), mat, Math.max(1, kinds[0].length));
  const sMesh = new THREE.InstancedMesh(sailGeo(), mat, Math.max(1, kinds[1].length));
  for (const mm of [yMesh, sMesh]) { mm.castShadow = true; group.add(mm); }
  const lightPos = [];
  for (const [mesh, list] of [[yMesh, kinds[0]], [sMesh, kinds[1]]]) {
    list.forEach((i, k) => {
      const x = anchored[i * 4], y = anchored[i * 4 + 1], h = anchored[i * 4 + 2];
      q.setFromAxisAngle(yAxis, h);
      p.set(x, sea, -y);
      m.compose(p, q, S);
      mesh.setMatrixAt(k, m);
      lightPos.push(x, sea + (mesh === sMesh ? 16 : 5) * scale, -y);
    });
  }
  // anchor lights and ferry lights at night
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
  const lmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uNight: uniforms.uNight },
    vertexShader: `uniform float uNight; varying float vA; void main(){ vA = uNight; gl_PointSize = 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * 2.0, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const lights = new THREE.Points(lg, lmat);
  lights.renderOrder = 6;
  group.add(lights);
  const fLights = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(ferries.length * 3), 3)), lmat);
  fLights.frustumCulled = false;
  group.add(fLights);

  const lead = { pos: new THREE.Vector3() };
  const tmp = {};
  const DWELL = 25;
  let summer = true;
  function setSummer(on) {
    summer = on;
    yMesh.count = on ? kinds[0].length : Math.ceil(kinds[0].length * 0.35);
    sMesh.count = on ? kinds[1].length : Math.ceil(kinds[1].length * 0.2);
  }
  setSummer(false);
  function update(t) {
    const fp = fLights.geometry.attributes.position.array;
    ferries.forEach((f, i) => {
      const run = f.r.len / f.v, cycle = 2 * (run + DWELL);
      const ph = (t + f.phase * cycle) % cycle;
      let s, dir;
      if (ph < run) { const u = ph / run; s = (u * u * (3 - 2 * u)) * f.r.len; dir = 1; }
      else if (ph < run + DWELL) { s = f.r.len; dir = 1; }
      else if (ph < 2 * run + DWELL) { const u = (ph - run - DWELL) / run; s = (1 - u * u * (3 - 2 * u)) * f.r.len; dir = -1; }
      else { s = 0; dir = -1; }
      f.r.at(s, tmp);
      const hx = tmp.dx * dir, hy = tmp.dy * dir;
      const moving = ph < run || (ph > run + DWELL && ph < 2 * run + DWELL);
      p.set(tmp.x, sea + 0.4 * Math.sin(t * 0.8 + i), -tmp.y);
      q.setFromAxisAngle(yAxis, Math.atan2(hy, hx));
      m.compose(p, q, S);
      fMesh.setMatrixAt(i, m);
      const { w, wm } = wakes[i];
      w.visible = moving;
      w.position.set(tmp.x - hx * 18 * scale, sea + 0.3, -(tmp.y - hy * 18 * scale));
      w.rotation.y = Math.atan2(hy, hx);
      wm.uniforms.uAmount.value = moving ? 1 : 0;
      fp.set([tmp.x, sea + 8 * scale, -tmp.y], i * 3);
      if (i === 0) lead.pos.copy(p);
    });
    fMesh.instanceMatrix.needsUpdate = true;
    fLights.geometry.attributes.position.needsUpdate = true;
    // a gentle bob for the boats at anchor
    const bob = Math.sin(t * 0.9) * 0.25;
    yMesh.position.y = bob; sMesh.position.y = -bob;
  }
  return { group, update, lead, setSummer, count: n + ferries.length };
}

// ------------------------------------------------------------------ beach umbrellas (summer only)
export function umbrellas(flat, scale = 2) {
  const n = (flat || []).length / 4;
  if (!n) return null;
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4).translate(0, 1.1, 0);
  const top = new THREE.ConeGeometry(1.25, 0.55, 8).translate(0, 2.35, 0);
  const g = BGU.mergeGeometries([paint(pole, '#ffffff'), paint(top, '#ffffff')]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(g, mat, n);
  // Positano's orange, Amalfi's blue and yellow stripes
  const COLORS = ['#f08a24', '#f08a24', '#2f6fb4', '#f2c230', '#e9e4d8', '#2f8f6b'];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), S = new THREE.Vector3(scale, scale, scale), p = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    p.set(flat[i * 4], flat[i * 4 + 2] - 0.2, -flat[i * 4 + 1]);
    m.compose(p, q, S);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(COLORS[Math.floor(flat[i * 4 + 3] * COLORS.length)]));
  }
  mesh.castShadow = true;
  return mesh;
}
