// Small geometry helpers for the hand-built characters: lofted bodies with
// smooth cross-sections, tubes with a varying radius, and baking a group of
// meshes down to one vertex-coloured geometry for instancing.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

const lerp = (a, b, t) => a + (b - a) * t;
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * A body lofted along the x axis. Each section: { x, y (centre), w (width, z),
 * h (height), p (squareness: 2 = ellipse, higher = boxier), top (extra
 * flattening of the upper half, 0..1) }. Sections are interpolated smoothly.
 * color(x, y, z, u) -> THREE.Color gives vertex colours (u = angle 0..1).
 */
export function loft(sections, { seg = 28, sub = 4, color, capStart = true, capEnd = true } = {}) {
  const S = [];
  const keys = ['x', 'y', 'w', 'h', 'p', 'top'];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[Math.max(0, i - 1)], b = sections[i], c = sections[i + 1], d = sections[Math.min(sections.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, o = {};
      for (const key of keys) o[key] = catmull(a[key] ?? (key === 'p' ? 2 : 0), b[key] ?? (key === 'p' ? 2 : 0), c[key] ?? (key === 'p' ? 2 : 0), d[key] ?? (key === 'p' ? 2 : 0), t);
      S.push(o);
    }
  }
  const last = sections[sections.length - 1];
  S.push({ p: 2, top: 0, ...last });
  const pos = [], col = [], idx = [], uv = [];
  const c = new THREE.Color();
  for (let si = 0; si < S.length; si++) {
    const s = S[si];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const e = 2 / Math.max(1.2, s.p || 2);
      let yy = Math.sign(sn) * Math.abs(sn) ** e * s.h / 2;
      if (sn > 0) yy *= 1 - (s.top || 0) * 0.3;
      const zz = Math.sign(cs) * Math.abs(cs) ** e * s.w / 2;
      const x = s.x, y = s.y + yy, z = zz;
      pos.push(x, y, z);
      uv.push(j / seg, si / (S.length - 1));
      if (color) { color(x, y, z, j / seg, c); col.push(c.r, c.g, c.b); }
    }
  }
  const R = S.length;
  for (let i = 0; i < R - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, cc = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const capAt = (ring, flip) => {
    const s = S[ring];
    const ci = pos.length / 3;
    pos.push(s.x, s.y, 0);
    uv.push(0.5, ring ? 1 : 0);
    if (color) { color(s.x, s.y, 0, 0, c); col.push(c.r, c.g, c.b); }
    for (let j = 0; j < seg; j++) {
      const a = ring * seg + j, b = ring * seg + (j + 1) % seg;
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) capAt(0, false);
  if (capEnd) capAt(R - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A tube along points with a radius per point (smooth curve, smooth radius). */
export function tube(points, radii, { seg = 12, steps = 40, color, cap = true } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const frames = { normals: [], binormals: [] };
  {
    let N = null;
    for (let i = 0; i <= steps; i++) {
      const T = curve.getTangentAt(i / steps).normalize();
      if (!N) {
        const ref = Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        N = new THREE.Vector3().crossVectors(T, ref).normalize();
      } else {
        N = N.clone().addScaledVector(T, -N.dot(T)).normalize();
      }
      frames.normals.push(N.clone());
      frames.binormals.push(new THREE.Vector3().crossVectors(T, N).normalize());
    }
  }
  const pos = [], col = [], idx = [], uv = [];
  const c = new THREE.Color(), v = new THREE.Vector3();
  const rAt = (t) => {
    const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f));
    return lerp(radii[i], radii[i + 1], f - i);
  };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = curve.getPointAt(t), r = rAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      v.copy(p).addScaledVector(N, Math.cos(th) * r).addScaledVector(B, Math.sin(th) * r);
      pos.push(v.x, v.y, v.z);
      uv.push(j / seg, t);
      if (color) { color(t, j / seg, c); col.push(c.r, c.g, c.b); }
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, cc = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  if (cap) {
    for (const [ring, flip] of [[0, true], [steps, false]]) {
      const p = curve.getPointAt(ring / steps);
      const ci = pos.length / 3;
      pos.push(p.x, p.y, p.z);
      uv.push(0.5, ring / steps);
      if (color) { color(ring / steps, 0, c); col.push(c.r, c.g, c.b); }
      for (let j = 0; j < seg; j++) {
        const a = ring * seg + j, b = ring * seg + (j + 1) % seg;
        if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Paint a whole geometry one colour (vertex colours). */
export function tint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * Bake every mesh under `root` (with its world transform relative to root)
 * into one non-indexed geometry with vertex colours, for InstancedMesh use.
 * Meshes without vertex colours take their material colour.
 */
export function bake(root, { skip } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || (skip && skip(o))) return;
    let g = o.geometry.clone();
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const m = o.material;
    // textured materials say what colour they read as from a distance
    const base = m?.userData?.bakeColor ? new THREE.Color(m.userData.bakeColor) : (m && m.color) ? m.color : new THREE.Color('#ffffff');
    if (!g.attributes.color) tint(g, base.getHex());
    else if ((m && m.color && !m.vertexColors) || m?.userData?.bakeColor) tint(g, base.getHex());
    else if (m && m.color) {
      const ca = g.attributes.color.array;
      for (let i = 0; i < ca.length; i += 3) { ca[i] *= base.r; ca[i + 1] *= base.g; ca[i + 2] *= base.b; }
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push(g);
  });
  return BGU.mergeGeometries(parts);
}

/** A small canvas texture helper. */
export function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

// an edelweiss: five to eight felted white bracts in a star with a yellow heart
export function drawEdelweiss(x, cx, cy, r, petals = 7) {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = '#ffffff';
  for (let k = 0; k < petals; k++) {
    x.rotate((Math.PI * 2) / petals);
    x.beginPath();
    x.ellipse(0, -r * 0.55, r * 0.2, r * 0.5, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#e8d36a';
  x.beginPath(); x.arc(0, 0, r * 0.22, 0, Math.PI * 2); x.fill();
  x.restore();
}
