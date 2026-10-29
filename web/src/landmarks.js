// Hand-built landmarks: the Space Needle, the Westin's twin towers and the
// Seattle Center Monorail with its two trains.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { toV3 } from './city.js';

// cylinder between two points
function strut(p1, p2, r) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const c = new THREE.CylinderGeometry(r, r, dir.length(), 5);
  c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  c.translate((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2);
  return c;
}

// =================================================================== Needle
// Dimensions are approximate and stylized (top of spire ~184 m, saucer ~158 m).
export function buildSpaceNeedle(uniforms) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.55 });
  const warmWhite = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.4, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2e4256', roughness: 0.15, metalness: 0.2,
    emissive: new THREE.Color('#ffd29a'), emissiveIntensity: 0 });
  const legGlow = new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.55,
    emissive: new THREE.Color('#cfe0ff'), emissiveIntensity: 0 });

  // --- legs: three pairs that pinch into the "waist", then flare to the saucer
  const radiusAt = (h) => {
    const keys = [[0, 15.5], [28, 10.5], [70, 5.6], [96, 4.4], [122, 5.4], [140, 8.0], [150, 10.5]];
    for (let i = 1; i < keys.length; i++) {
      if (h <= keys[i][0]) {
        const [h0, r0] = keys[i - 1], [h1, r1] = keys[i];
        const t = (h - h0) / (h1 - h0);
        return r0 + (r1 - r0) * (t * t * (3 - 2 * t));
      }
    }
    return keys[keys.length - 1][1];
  };
  const spreadAt = (h) => 0.24 * Math.exp(-h / 22) + 0.05 + 0.07 * Math.max(0, (h - 110) / 40);
  const legGeoms = [];
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const h = (i / 48) * 150;
        const a = (k * 2 * Math.PI) / 3 + side * spreadAt(h) + 0.35;
        const r = radiusAt(h);
        pts.push(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r));
      }
      legGeoms.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.85, 7, false));
    }
  }
  const legs = new THREE.Mesh(BGU.mergeGeometries(legGeoms), legGlow);
  g.add(legs);

  // cross braces between each leg pair, and the rings
  const braces = [];
  for (let k = 0; k < 3; k++) {
    for (const h of [8, 18, 40, 60]) {
      const a0 = (k * 2 * Math.PI) / 3 + 0.35;
      const r = radiusAt(h);
      const p1 = new THREE.Vector3(Math.cos(a0 - spreadAt(h)) * r, h, Math.sin(a0 - spreadAt(h)) * r);
      const p2 = new THREE.Vector3(Math.cos(a0 + spreadAt(h)) * r, h, Math.sin(a0 + spreadAt(h)) * r);
      braces.push(strut(p1, p2, 0.35));
    }
  }
  g.add(new THREE.Mesh(BGU.mergeGeometries(braces.map((b) => b.toNonIndexed())), white));
  const halo = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(30) + 0.4, 0.9, 6, 48), gold);
  halo.rotation.x = Math.PI / 2; halo.position.y = 30;
  g.add(halo);
  const waist = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(96) + 0.3, 0.55, 6, 32), white);
  waist.rotation.x = Math.PI / 2; waist.position.y = 96;
  g.add(waist);

  // central core with the elevator spine
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.6, 150, 12).translate(0, 75, 0), warmWhite));

  // --- the top house (saucer), lathed from a profile (r, h)
  const prof = [[0, 143], [3, 144], [9, 149], [15, 153.2], [20.5, 156.2], [21.6, 157.2]];
  const under = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 64);
  g.add(new THREE.Mesh(under, white));
  // underside ribs (the sunburst)
  const ribs = [];
  for (let i = 0; i < 24; i++) {
    const rib = new THREE.BoxGeometry(12, 0.6, 0.5).translate(9.5, 0, 0);
    rib.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.atan2(4.7, 12)));
    rib.translate(0, 151.6, 0);
    rib.rotateY((i / 24) * Math.PI * 2);
    ribs.push(rib.toNonIndexed());
  }
  g.add(new THREE.Mesh(BGU.mergeGeometries(ribs), warmWhite));
  // glass restaurant / observation band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(20.6, 21.4, 4.2, 64, 1, true).translate(0, 159.3, 0), glass);
  g.add(band);
  // open deck + glass railing
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(22.4, 22.4, 0.7, 64).translate(0, 161.8, 0), white));
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(22.3, 22.3, 2.2, 64, 1, true).translate(0, 163.2, 0),
    new THREE.MeshStandardMaterial({ color: '#cfe3f0', transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide }));
  g.add(rail);
  // roof cone, spire and beacon
  const roofProf = [[20.2, 162], [19.0, 163.6], [13, 166.8], [6.5, 169.6], [3, 171], [0, 171.4]];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(roofProf.map(([r, h]) => new THREE.Vector2(r, h)), 64), white));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.6, 6, 10).translate(0, 174, 0), warmWhite));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 9, 8).translate(0, 181.5, 0), warmWhite));
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#ff5a3c', toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), beaconMat);
  beacon.position.y = 186;
  g.add(beacon);

  // base pavilion ring + plaza disc
  const pav = new THREE.LatheGeometry([[17, 0], [27, 0], [27, 4.8], [24, 6.2], [17, 6.2]].map(([r, h]) => new THREE.Vector2(r, h)), 48);
  g.add(new THREE.Mesh(pav, warmWhite));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 0.25, 48).translate(0, 0.12, 0),
    new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.9 })));

  // two elevator cars riding the spine (a real ride is ~41 s)
  const elevMat = new THREE.MeshStandardMaterial({ color: '#e0a83e', roughness: 0.35, metalness: 0.3,
    emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 });
  const elevs = [0, 1].map((i) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.4, 2.2), elevMat);
    const a = i * Math.PI + 0.35;
    e.position.set(Math.cos(a) * 3.2, 10, Math.sin(a) * 3.2);
    g.add(e);
    return e;
  });

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rail.castShadow = false;
  beacon.castShadow = false;

  return {
    group: g,
    update(t) {
      const n = uniforms.uNight.value;
      glass.emissiveIntensity = n * 1.3;
      legGlow.emissiveIntensity = n * 0.1;
      elevMat.emissiveIntensity = n * 1.2;
      const blink = Math.sin(t * 3.1) > 0.2 ? 1 : 0.15;
      beaconMat.color.setRGB(1.0 + 3 * n * blink, 0.35 + 0.8 * n * blink, 0.24 + 0.5 * n * blink);
      elevs.forEach((e, i) => {
        const ph = ((t / 41) + i * 0.5) % 2;
        const u = ph < 1 ? ph : 2 - ph;           // up then down
        const eased = u * u * (3 - 2 * u);
        e.position.y = 3 + eased * 147;
      });
    },
  };
}

// =================================================================== Westin
// Scalloped "corncob" cylinders, fed through the normal building generator.
export function westinBuildings(towers) {
  const out = [];
  towers.forEach(([x, y, r, h], k) => {
    const ring = [];
    const N = 96;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = r * (1 + 0.045 * Math.cos(a * 16));
      ring.push(Math.round((x + Math.cos(a) * rr) * 10) / 10, Math.round((y + Math.sin(a) * rr) * 10) / 10);
    }
    out.push({ r: [ring], h, m: 0, k: 'com', s: 0.21 + k * 0.03, c: '#ece5d8', noRoofBox: true });
    // stepped crown
    const crown = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      crown.push(Math.round((x + Math.cos(a) * r * 0.62) * 10) / 10, Math.round((y + Math.sin(a) * r * 0.62) * 10) / 10);
    }
    out.push({ r: [crown], h: h + 5, m: h, k: 'ind', s: 0.5, c: '#d6cfc2', noRoofBox: true });
  });
  // low podium between the towers
  if (towers.length >= 2) {
    const [a, b] = towers;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, w = Math.max(a[2], b[2]) * 1.15;
    const ext = Math.max(a[2], b[2]) * 0.6;
    const p = [
      [a[0] - ux * ext - uy * w, a[1] - uy * ext + ux * w],
      [b[0] + ux * ext - uy * w, b[1] + uy * ext + ux * w],
      [b[0] + ux * ext + uy * w, b[1] + uy * ext - ux * w],
      [a[0] - ux * ext + uy * w, a[1] - uy * ext - ux * w],
    ];
    // keep CCW orientation
    const area = p.reduce((s, [x1, y1], i) => { const [x2, y2] = p[(i + 1) % 4]; return s + x1 * y2 - x2 * y1; }, 0);
    if (area < 0) p.reverse();
    out.push({ r: [p.flat()], h: 11, m: 0, k: 'com', s: 0.4, c: '#d9d1c3', noRoofBox: true });
  }
  return out;
}

// =================================================================== Monorail
class Path2 {
  constructor(flat) {
    this.p = [];
    for (let i = 0; i < flat.length; i += 2) this.p.push(new THREE.Vector2(flat[i], flat[i + 1]));
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(s) {
    s = Math.max(0, Math.min(this.len, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const a = this.p[i - 1], b = this.p[i];
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (s - this.cum[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg };
  }
}

const BEAM_TOP = 8.6;

function trainCarGeometry(len, nose) {
  // side profile in (x along track, y up), extruded across the 3 m width
  const s = new THREE.Shape();
  const h0 = -1.2, h1 = 3.1, r = nose ? 1.8 : 0.35;
  const x0 = -len / 2, x1 = len / 2;
  s.moveTo(x0 + 0.2, h0);
  s.lineTo(x1 - (nose ? 1.2 : 0.2), h0);
  if (nose) s.quadraticCurveTo(x1 + 0.4, h0 + 0.4, x1, h0 + 1.9);
  else s.lineTo(x1, h0 + 0.2);
  s.lineTo(x1 - (nose ? 0.6 : 0), h1 - r);
  s.quadraticCurveTo(x1 - (nose ? 0.6 : 0), h1, x1 - r - (nose ? 0.6 : 0), h1);
  s.lineTo(x0 + 0.35, h1);
  s.quadraticCurveTo(x0, h1, x0, h1 - 0.35);
  s.lineTo(x0, h0 + 0.2);
  s.quadraticCurveTo(x0, h0, x0 + 0.2, h0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.25,
    bevelSize: 0.22, bevelSegments: 2, curveSegments: 8 });
  geo.translate(0, 0, -1.3);
  // paint by height: skirt, window band, roof
  const pos = geo.attributes.position, c = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const v = y > 0.9 && y < 2.3 ? [0.16, 0.2, 0.26] : y >= 2.3 ? [1, 1, 1] : [0.86, 0.86, 0.86];
    c.set(v, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export function buildMonorail(lines, uniforms) {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: '#d5d0c6', roughness: 0.9 });
  const paths = lines.map((f) => new Path2(f));

  // beams
  const beamGeoms = [];
  for (const path of paths) {
    const step = 6;
    for (let s = 0; s < path.len; s += step) {
      const a = path.at(s), b = path.at(Math.min(path.len, s + step));
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 0.2) continue;
      const box = new THREE.BoxGeometry(L + 0.05, 1.6, 0.9);
      box.rotateY(Math.atan2(b.y - a.y, b.x - a.x));
      box.translate((a.x + b.x) / 2, BEAM_TOP - 0.8, -(a.y + b.y) / 2);
      beamGeoms.push(box.toNonIndexed());
    }
  }
  // T-columns every ~28 m (shared when the beams run side by side)
  const colGeoms = [];
  const main = paths[0], other = paths[1];
  for (let s = 10; s < main.len - 4; s += 28) {
    const a = main.at(s);
    let mid = { x: a.x, y: a.y }, span = 1.4, ang = Math.atan2(a.dy, a.dx) + Math.PI / 2;
    if (other) {
      let best = null, bd = 1e9;
      for (let t = Math.max(0, s - 40); t < Math.min(other.len, s + 40); t += 1) {
        const q = other.at(t); const d = Math.hypot(q.x - a.x, q.y - a.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (best && bd < 9) {
        mid = { x: (a.x + best.x) / 2, y: (a.y + best.y) / 2 };
        span = bd + 1.6; ang = Math.atan2(best.y - a.y, best.x - a.x);
      }
    }
    const col = new THREE.CylinderGeometry(0.7, 1.0, BEAM_TOP - 1.6, 8).translate(mid.x, (BEAM_TOP - 1.6) / 2, -mid.y);
    const cap = new THREE.BoxGeometry(span, 1.0, 1.3);
    cap.rotateY(ang);
    cap.translate(mid.x, BEAM_TOP - 2.1, -mid.y);
    colGeoms.push(col.toNonIndexed(), cap.toNonIndexed());
  }
  const beams = new THREE.Mesh(BGU.mergeGeometries([...beamGeoms, ...colGeoms]), concrete);
  beams.castShadow = beams.receiveShadow = true;
  g.add(beams);

  // Seattle Center station canopy at the north end
  const n0 = paths[0].at(0);
  const st = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 16).translate(0, BEAM_TOP + 5.4, 0),
    new THREE.MeshStandardMaterial({ color: '#ebe6dc', roughness: 0.8 }));
  st.rotation.y = Math.atan2(paths[0].at(23).y - n0.y, paths[0].at(23).x - n0.x);
  const sc = paths[0].at(18), sc2 = paths[1] ? paths[1].at(18) : sc;
  st.position.set((sc.x + sc2.x) / 2, 0, -(sc.y + sc2.y) / 2);
  st.castShadow = true;
  g.add(st);

  // trains: Red on one beam, Blue on the other (4 articulated cars each)
  const liveries = [['Red', '#c8322b'], ['Blue', '#2c64b0']];
  const trains = paths.slice(0, 2).map((path, i) => {
    const [name, hex] = liveries[i];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: hex, roughness: 0.45,
      emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
    const cars = [];
    const lens = [9.6, 9.0, 9.0, 9.6];
    lens.forEach((L, k) => {
      const geo = trainCarGeometry(L, k === 0 || k === 3);
      if (k === 3) geo.rotateY(Math.PI);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      g.add(m);
      cars.push({ mesh: m, off: lens.slice(0, k).reduce((s, v) => s + v + 0.5, 0) + L / 2 });
    });
    return { name, path, cars, mat, total: 39.6, phase: i * 0.5, pos: new THREE.Vector3() };
  });

  // trapezoidal speed profile: accelerate, cruise, brake
  const SPEED = 20, ACC = 2.2, DWELL = 18;
  const profile = (run) => {
    let v = SPEED, ta = v / ACC, da = 0.5 * ACC * ta * ta;
    if (2 * da > run) { ta = Math.sqrt(run / ACC); v = ACC * ta; da = run / 2; }
    const tc = (run - 2 * da) / v;
    return { tRun: 2 * ta + tc, dist(τ) {
      if (τ < ta) return 0.5 * ACC * τ * τ;
      if (τ < ta + tc) return da + v * (τ - ta);
      const r = 2 * ta + tc - τ;
      return run - 0.5 * ACC * r * r;
    } };
  };
  return {
    group: g,
    trains,
    update(t) {
      const n = uniforms.uNight.value;
      for (const tr of trains) {
        tr.mat.emissiveIntensity = n * 0.25;
        const run = tr.path.len - tr.total - 6;
        const pf = (tr.pf ||= profile(run));
        const tRun = pf.tRun;
        const cycle = 2 * (tRun + DWELL);
        const ph = (((t + tr.phase * cycle) % cycle) + cycle) % cycle;
        let d;
        if (ph < DWELL) d = 0;
        else if (ph < DWELL + tRun) d = pf.dist(ph - DWELL);
        else if (ph < 2 * DWELL + tRun) d = run;
        else d = run - pf.dist(ph - 2 * DWELL - tRun);
        const head = 3 + d;
        for (const c of tr.cars) {
          const s = head + tr.total - c.off;
          const a = tr.path.at(s);
          c.mesh.position.set(a.x, BEAM_TOP - 0.2, -a.y);
          c.mesh.rotation.y = Math.atan2(a.dy, a.dx);
        }
        const mid = tr.path.at(head + tr.total / 2);
        tr.pos.set(mid.x, BEAM_TOP, -mid.y);
      }
    },
  };
}

export { BEAM_TOP };
