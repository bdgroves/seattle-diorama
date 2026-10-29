// Buildings, ground layers and the diorama slab, generated from scene.json.
import * as THREE from 'three';

// scene.json uses x east / y north (meters). three.js: X east, Y up, Z south.
export const toV3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

const ringPts = (flat) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]));
  return pts;
};

// ---------------------------------------------------------------- palettes
const PAL = {
  res: ['#ead9c3', '#e4c8ae', '#dcc9b9', '#f0e3cf', '#d3bca8', '#e8cfc0', '#e2d3bd'],
  com: ['#d8dde1', '#cbd4da', '#e2e4e1', '#c3ccd1', '#dcd4c6', '#d1d8d1', '#e6ddcf'],
  civ: ['#ead8b4', '#ddcca8', '#e8ddcb', '#e5cfae'],
  ind: ['#cbc2b6', '#bfb7ad', '#d4cabd', '#c6bdb0'],
  tall: ['#b8c7d3', '#a9bccb', '#c6d2da', '#a2b4c3', '#cdd3d6', '#bcc6c2'],
};
PAL.gen = [...PAL.res, ...PAL.com];

function buildingColor(b) {
  if (b.c) return new THREE.Color(b.c);
  const list = b.h > 48 ? PAL.tall : PAL[b.k] || PAL.gen;
  return new THREE.Color(list[Math.floor(b.s * 997) % list.length]);
}

// ---------------------------------------------------------------- material
// MeshStandardMaterial + a procedural window grid driven by per-vertex
// "distance along facade" (aU) and world height. Windows glow at night.
export function makeBuildingMaterial(uniforms) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = uniforms.uNight;
    sh.uniforms.uWet = uniforms.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aU; attribute float aWin; attribute float aSeed;
        varying float vU; varying float vWin; varying float vSeed; varying float vWY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vU = aU; vWin = aWin; vSeed = aSeed; vWY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uWet;
        varying float vU; varying float vWin; varying float vSeed; varying float vWY;
        float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float colW = 2.6 + vSeed * 1.8;
        float flH = 3.4 + fract(vSeed * 7.13) * 0.6;
        vec2 cell = vec2(vU / colW, (vWY - 0.6) / flH);
        vec2 fw = fwidth(cell);
        float aa = clamp(1.0 - max(fw.x, fw.y) * 2.2, 0.0, 1.0);
        vec2 f = fract(cell);
        float ww = 0.18 + fract(vSeed * 3.7) * 0.14;
        float win = step(ww, f.x) * step(f.x, 1.0 - ww) * step(0.3, f.y) * step(f.y, 0.84);
        win *= vWin * step(3.8, vWY);
        float winAA = mix(0.42 * vWin * step(3.8, vWY), win, aa);
        float ao = mix(0.60, 1.0, smoothstep(0.0, 16.0, vWY));
        diffuseColor.rgb *= mix(1.0, ao, step(0.5, vWin) * 0.6 + 0.4);
        vec3 glass = mix(vec3(0.36, 0.45, 0.55), vec3(0.06, 0.08, 0.12), uNight);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, winAA * 0.78);
        diffuseColor.rgb *= 1.0 - 0.22 * uWet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, winAA);
        roughnessFactor = mix(roughnessFactor, 0.35, uWet * 0.6);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float lit = step(0.6, h31(vec3(floor(cell), vSeed * 113.0)));
        vec3 warm = mix(vec3(1.0, 0.74, 0.42), vec3(0.85, 0.9, 1.0), step(0.8, h31(vec3(floor(cell) + 3.1, vSeed))));
        totalEmissiveRadiance += winAA * mix(lit, 0.13, 1.0 - aa) * uNight * warm * 0.95;`);
  };
  return mat;
}

// ---------------------------------------------------------------- buildings
export function buildBuildings(list, uniforms) {
  const pos = [], nor = [], col = [], aU = [], aWin = [], aSeed = [];
  const roofBoxes = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();

  const tri = (p1, p2, p3, n, color, u1, u2, u3, win, seed) => {
    e1.subVectors(p2, p1); e2.subVectors(p3, p1); fn.crossVectors(e1, e2);
    if (fn.dot(n) < 0) { [p2, p3] = [p3, p2]; [u2, u3] = [u3, u2]; }
    for (const [p, u] of [[p1, u1], [p2, u2], [p3, u3]]) {
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(color.r, color.g, color.b);
      aU.push(u); aWin.push(win); aSeed.push(seed);
    }
  };

  const up = new THREE.Vector3(0, 1, 0);
  for (const bld of list) {
    const color = buildingColor(bld);
    const roofCol = color.clone().lerp(new THREE.Color('#b9b4ab'), 0.45).multiplyScalar(1.03);
    const win = bld.k === 'ind' || bld.h < 5.5 ? 0 : 1;
    const { h, m = 0, s: seed = 0.5 } = bld;

    // walls
    for (const ring of bld.r) {
      const n = ring.length / 2;
      let u = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x1 = ring[i * 2], y1 = ring[i * 2 + 1], x2 = ring[j * 2], y2 = ring[j * 2 + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.05) continue;
        // rings are CCW (holes CW) in x/y, so outward normal is the right-hand side
        const out = new THREE.Vector3((y2 - y1) / len, 0, (x2 - x1) / len);
        const A0 = toV3(x1, y1, m), B0 = toV3(x2, y2, m), A1 = toV3(x1, y1, h), B1 = toV3(x2, y2, h);
        tri(A0, B0, B1, out, color, u, u + len, u + len, win, seed);
        tri(A0, B1, A1, out, color, u, u + len, u, win, seed);
        u += len;
      }
    }
    // roof
    const contour = ringPts(bld.r[0]);
    const holes = bld.r.slice(1).map(ringPts);
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    for (const f of faces) {
      a.copy(toV3(all[f[0]].x, all[f[0]].y, h));
      b.copy(toV3(all[f[1]].x, all[f[1]].y, h));
      c.copy(toV3(all[f[2]].x, all[f[2]].y, h));
      tri(a.clone(), b.clone(), c.clone(), up, roofCol, 0, 0, 0, 0, seed);
    }
    // rooftop mechanical boxes on bigger buildings
    if (h > 22 && !bld.noRoofBox) {
      const cen = centroid(bld.r[0]);
      if (cen && cen.area > 250 && pointInRing(cen.x, cen.y, bld.r[0])) {
        const sz = Math.min(14, Math.sqrt(cen.area) * 0.32);
        roofBoxes.push({ x: cen.x, y: cen.y, h, sx: sz, sz: sz * (0.6 + seed * 0.5), sy: 2.4 + seed * 2.5, rot: seed * 6.28 });
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(aWin, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(aSeed, 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, makeBuildingMaterial(uniforms));
  mesh.castShadow = mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  if (roofBoxes.length) {
    const boxG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(boxG, new THREE.MeshStandardMaterial({ color: '#c9c6c0', roughness: 0.9 }), roofBoxes.length);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    roofBoxes.forEach((r, i) => {
      q.setFromAxisAngle(up, r.rot);
      sc.set(r.sx, r.sy, r.sz);
      mtx.compose(toV3(r.x, r.y, r.h), q, sc);
      im.setMatrixAt(i, mtx);
    });
    im.castShadow = im.receiveShadow = true;
    group.add(im);
  }
  return group;
}

function centroid(ring) {
  let A = 0, cx = 0, cy = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i * 2], y1 = ring[i * 2 + 1], x2 = ring[j * 2], y2 = ring[j * 2 + 1];
    const cr = x1 * y2 - x2 * y1;
    A += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  if (Math.abs(A) < 1e-6) return null;
  return { x: cx / (3 * A), y: cy / (3 * A), area: Math.abs(A / 2) };
}

function pointInRing(x, y, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2], yi = ring[i * 2 + 1], xj = ring[j * 2], yj = ring[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- flat layers
export function flatLayer(polys, y, material) {
  const pos = [];
  for (const rings of polys) {
    const contour = ringPts(rings[0]);
    const holes = rings.slice(1).map(ringPts);
    const all = contour.concat(...holes);
    for (const f of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      const p = f.map((k) => all[k]);
      // make the triangle face up (+Y): in x/-y space CCW-from-above
      const cross = (p[1].x - p[0].x) * (p[2].y - p[0].y) - (p[1].y - p[0].y) * (p[2].x - p[0].x);
      const order = cross > 0 ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) pos.push(p[k].x, y, -p[k].y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

export const GROUND = {
  land: '#ddd6c6',
  walks: '#ece6da',
  roads: '#8e949c',
  paths: '#e6d8bd',
  plazas: '#efe7d7',
  parks: '#b3c98c',
  water: '#5ea6c6',
  slab: '#6f5b49',
  slabDark: '#4b3d31',
};

export function buildGround(scene, meta) {
  const [x0, y0, x1, y1] = meta.extent;
  const W = x1 - x0, H = y1 - y0, T = 46;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const group = new THREE.Group();

  // the diorama slab: soil sides with a darker base
  const side = new THREE.MeshStandardMaterial({ color: GROUND.slab, roughness: 1 });
  const top = new THREE.MeshStandardMaterial({ color: GROUND.land, roughness: 0.95 });
  const bottom = new THREE.MeshStandardMaterial({ color: GROUND.slabDark, roughness: 1 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, T, H), [side, side, top, bottom, side, side]);
  slab.position.set(cx, -T / 2, -cy);
  slab.receiveShadow = true;
  group.add(slab);

  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...extra });
  const water = mat(GROUND.water, { roughness: 0.18, metalness: 0.05 });
  const layers = [
    ['parks', 0.05, mat(GROUND.parks)],
    ['plazas', 0.07, mat(GROUND.plazas)],
    ['walks', 0.09, mat(GROUND.walks)],
    ['paths', 0.11, mat(GROUND.paths)],
    ['roads', 0.13, mat(GROUND.roads, { roughness: 0.85 })],
    ['water', 0.15, water],
  ];
  const meshes = {};
  for (const [key, y, m] of layers) {
    if (!scene[key]?.length) continue;
    meshes[key] = flatLayer(scene[key], y, m);
    group.add(meshes[key]);
  }
  return { group, meshes, waterMat: water };
}
