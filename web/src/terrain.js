// Terrain dioramas: a USGS elevation grid carved into a slab, coloured by
// landcover and season, with contour lines, layered rock walls, lakes,
// rivers, roads and trails, trees, waterfalls, headlamps, tufa and gulls.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBuildings, flatLayer } from './city.js';
import { CAR_COLORS, carGeometry, lightsGeometry, mulberry32 } from './life.js';
import { animateWater } from './bay.js';
import { seaSurface, seaWalls, boats, umbrellas } from './coast.js';
import { buildModels, creditsHtml } from './models.js';

// landcover classes (match pipeline/terrain.py)
const FOREST = 0, ROCK = 1, MEADOW = 2, WATER = 3, DEVELOPED = 4, SAGE = 5, SAND = 6, SNOW = 7, ALPINE = 8, LAVA = 9, GROVE = 10;

const PALETTES = {
  autumn: {
    [FOREST]: '#3c5b39', [ROCK]: '#bfc0ba', [MEADOW]: '#cbb47c', [WATER]: '#4d8db0', [DEVELOPED]: '#c9c1b3',
    [SAGE]: '#939c80', [SAND]: '#ece8dc', [SNOW]: '#f4f6f8', [ALPINE]: '#a9a594', [LAVA]: '#4f4a46', [GROVE]: '#6b8f45',
  },
  spring: {
    [FOREST]: '#3a6539', [ROCK]: '#bfc0ba', [MEADOW]: '#88bb5b', [WATER]: '#4d8db0', [DEVELOPED]: '#c9c1b3',
    [SAGE]: '#94a982', [SAND]: '#ece8dc', [SNOW]: '#f4f6f8', [ALPINE]: '#9ead88', [LAVA]: '#4f4a46', [GROVE]: '#6e9a45',
  },
};
const DECID = {
  autumn: [['#dba23a', '#c97a2b', '#b9472f', '#e4b94b', '#a6452f', '#d58d2e'],   // black oak, dogwood, maple
    ['#f2c230', '#eab52b', '#f5d14b', '#e39c27', '#f0b72d']],                    // aspen
  spring: [['#86b552', '#78a84a', '#93c060', '#6f9f45'], ['#9cc65c', '#8dbd52', '#a8cf6a']],
};
const SEABED = ['#e3d9b8', '#3fb5b9', '#1d6f9e', '#0f3157'].map((c) => new THREE.Color(c));
const CONIFER = ['#2f5a3b', '#3a6646', '#2a5236', '#41704a', '#335f3f'];

export async function loadTerrain(base, id) {
  const res = await fetch(`${base}data/${id}.json`);
  if (!res.ok) throw new Error(`No data/${id}.json yet. Run \`pixi run sierra\` first.`);
  const data = await res.json();
  const bin = await (await fetch(`${base}data/${data.grid.bin}`)).arrayBuffer();
  const { nx, ny, zmax } = data.grid;
  const q = new Uint16Array(bin, 0, nx * ny);
  const z = new Float32Array(nx * ny);
  for (let i = 0; i < z.length; i++) z[i] = (q[i] / 65535) * zmax;
  const cls = new Uint8Array(bin, nx * ny * 2, nx * ny);
  return { data, z, cls };
}

export function makeSampler(grid, z) {
  const { nx, ny, x0, y1, dx, dy } = grid;
  return (x, y) => {
    let c = (x - x0) / dx, r = (y1 - y) / dy;
    c = Math.min(Math.max(c, 0), nx - 1.001); r = Math.min(Math.max(r, 0), ny - 1.001);
    const i = c | 0, j = r | 0, fx = c - i, fy = r - j;
    const a = z[j * nx + i] * (1 - fx) + z[j * nx + i + 1] * fx;
    const b = z[(j + 1) * nx + i] * (1 - fx) + z[(j + 1) * nx + i + 1] * fx;
    return a * (1 - fy) + b * fy;
  };
}

// ------------------------------------------------------------------ ground
function terrainMesh(grid, z, cls, uniforms, cfg = {}) {
  const { nx, ny, x0, y1, dx, dy } = grid;
  const pos = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = x0 + i * dx;
      pos[k * 3 + 1] = z[k];
      pos[k * 3 + 2] = -(y1 - j * dy);
    }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let n = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b;
      idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nx * ny * 3), 3));
  // terraces: lemon groves and the cultivated lower slopes are stepped
  const terr = new Float32Array(nx * ny);
  if (cfg.terraces) {
    const nr = g.attributes.normal.array;
    for (let k = 0; k < nx * ny; k++) {
      const c = cls[k], hR = pos[k * 3 + 1] / grid.vexag + grid.h0, up = nr[k * 3 + 1];
      const slopeOk = up > 0.6 && up < 0.97;
      if (hR > 2 && slopeOk && (c === GROVE || ((c === SAGE || c === DEVELOPED || c === MEADOW) && hR < 600))) terr[k] = c === GROVE ? 1 : 0.6;
    }
  }
  g.setAttribute('aTerr', new THREE.BufferAttribute(terr, 1));
  // dune seas: ridged sand, drawn in the shader
  const dune = new Float32Array(nx * ny);
  if (cfg.dunes) for (let k = 0; k < nx * ny; k++) dune[k] = cls[k] === cfg.dunes.cls ? 1 : 0;
  g.setAttribute('aDune', new THREE.BufferAttribute(dune, 1));
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVex = { value: grid.vexag };
    sh.uniforms.uH0 = { value: grid.h0 };
    sh.uniforms.uContour = { value: grid.contour || 100 };
    sh.uniforms.uNight = uniforms.uNight;
    sh.uniforms.uDuneK = { value: cfg.dunes?.spacing ? 6.2832 / cfg.dunes.spacing : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTerr, aDune; varying float vTerr, vDune; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerr = aTerr; vDune = aDune; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uVex, uH0, uContour, uNight, uDuneK; varying float vTerr, vDune; varying vec3 vWP;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float cline(float v){ float w = fwidth(v); return (1.0 - min(abs(fract(v - 0.5) - 0.5) / max(w, 1e-5), 1.0)) * (1.0 - smoothstep(0.12, 0.35, w)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hReal = vWP.y / uVex + uH0;
        float c1 = cline(hReal / uContour), c5 = cline(hReal / (uContour * 5.0));
        diffuseColor.rgb *= 1.0 - (0.10 * c1 + 0.16 * c5) * (1.0 - 0.6 * uNight);
        diffuseColor.rgb *= 0.95 + 0.1 * h21(floor(vWP.xz / 7.0));
        if (vDune > 0.01 && uDuneK > 0.0) {
          // crescent ridges across the wind: a sharp slip face, a long gentle back
          vec2 q = vWP.xz * uDuneK;
          float w = vn(vWP.xz * uDuneK * 0.23) * 5.0 + vn(vWP.xz * uDuneK * 0.07) * 9.0;
          float ph = fract((q.x * 0.82 + q.y * 0.57) / 6.2832 + w * 0.16);
          float ridge = smoothstep(0.0, 0.82, ph) * (1.0 - smoothstep(0.82, 1.0, ph));
          float face = smoothstep(0.82, 0.9, ph) * (1.0 - smoothstep(0.96, 1.0, ph));
          diffuseColor.rgb *= 1.0 + vDune * (0.12 * ridge - 0.30 * face - 0.04);
        }
        if (vTerr > 0.01) { float tl = cline(hReal / 7.0); diffuseColor.rgb *= 1.0 - vTerr * (0.28 * tl - 0.04 * cline(hReal / 7.0 + 0.5)); }`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  // recolour for a season and a snowline (true elevation, m)
  const col = g.attributes.color.array, nrm = g.attributes.normal.array;
  const tmp = new THREE.Color(), rockC = new THREE.Color(), snowC = new THREE.Color('#f3f5f7');
  const jitter = new Float32Array(nx * ny);
  const rnd = mulberry32(37);
  for (let i = 0; i < jitter.length; i++) jitter[i] = rnd();
  const steep = cfg.steep || [0.82, 0.62];   // [fully vegetated above, bare below] (normal.y)
  function paint(season, snowline) {
    const P = { ...PALETTES[season], ...(cfg.palette?.[season] || {}) };
    const pal = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, new THREE.Color(v)]));
    rockC.copy(pal[ROCK]);
    for (let k = 0; k < nx * ny; k++) {
      const c = cls[k];
      tmp.copy(pal[c] || pal[FOREST]);
      const ny_ = nrm[k * 3 + 1], nz = nrm[k * 3 + 2];
      const hReal = pos[k * 3 + 1] / grid.vexag + grid.h0;
      // steep ground shows granite whatever grows there
      if (c === FOREST || c === MEADOW || c === ALPINE || c === SAGE || c === GROVE) {
        // (the Sierra look was tuned with this blend; places that set cfg.steep get a plain ramp)
        const rk = cfg.steep ? 1 - THREE.MathUtils.smoothstep(ny_, steep[1], steep[0]) : THREE.MathUtils.smoothstep(0.82, 0.62, ny_);
        tmp.lerp(rockC, rk * 0.85);
      }
      if (c === FOREST) tmp.offsetHSL(0, 0, (jitter[k] - 0.5) * 0.05);
      else tmp.offsetHSL(0, 0, (jitter[k] - 0.5) * 0.03);
      // snow holds on north-facing, gentler slopes first
      if (c !== WATER) {
        const line = snowline - 140 * Math.max(0, -nz) + (jitter[k] - 0.5) * 90;
        const s = THREE.MathUtils.smoothstep(hReal, line, line + 70) * THREE.MathUtils.smoothstep(ny_, 0.35, 0.6);
        if (s > 0) tmp.lerp(snowC, s * 0.92);
      }
      // the seabed: pale sand in the shallows, turquoise, then deep blue
      if (cfg.sea && hReal < 0.5) {
        const d = -hReal / (cfg.seabedScale || 1);
        if (d < 4) tmp.copy(SEABED[0]).lerp(SEABED[1], Math.max(0, d) / 4);
        else if (d < 25) tmp.copy(SEABED[1]).lerp(SEABED[2], (d - 4) / 21);
        else tmp.copy(SEABED[2]).lerp(SEABED[3], Math.min(1, (d - 25) / 55));
        tmp.lerp(rockC, THREE.MathUtils.smoothstep(0.8, 0.5, ny_) * 0.35);
      }
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    // soften the cell-sized steps between landcover patches
    for (let pass = 0; pass < (cfg.soften || 0); pass++) {
      const src = col.slice();
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const k = j * nx + i;
          for (let ch = 0; ch < 3; ch++) {
            col[k * 3 + ch] = (src[k * 3 + ch] * 4 + src[(k - 1) * 3 + ch] + src[(k + 1) * 3 + ch] + src[(k - nx) * 3 + ch] + src[(k + nx) * 3 + ch]) / 8;
          }
        }
      }
    }
    g.attributes.color.needsUpdate = true;
  }
  return { mesh, paint };
}

// layered walls around the slab: soil on top, banded granite below
function slabWalls(grid, z, depth) {
  const { nx, ny, x0, y1, dx, dy } = grid;
  const edges = [];
  const P = (i, j) => [x0 + i * dx, z[j * nx + i], -(y1 - j * dy)];
  edges.push(Array.from({ length: nx }, (_, i) => P(i, 0)));
  edges.push(Array.from({ length: ny }, (_, j) => P(nx - 1, j)));
  edges.push(Array.from({ length: nx }, (_, i) => P(nx - 1 - i, ny - 1)));
  edges.push(Array.from({ length: ny }, (_, j) => P(0, ny - 1 - j)));
  const pos = [], top = [];
  for (const e of edges) {
    for (let k = 0; k < e.length - 1; k++) {
      const [ax, ay, az] = e[k], [bx, by, bz] = e[k + 1];
      // two triangles, outward facing (edges run clockwise seen from above)
      pos.push(ax, ay, az, ax, -depth, az, bx, by, bz, bx, by, bz, ax, -depth, az, bx, -depth, bz);
      top.push(ay, ay, by, by, ay, by);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: THREE.DoubleSide });
  const band = Math.max(18, depth * 0.09);
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTop; varying float vTop; varying vec3 vWP2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop = aTop; vWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vTop; varying vec3 vWP2;
        float hh(float n){ return fract(sin(n) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float d = vTop - vWP2.y;
        float wob = sin((vWP2.x + vWP2.z) * 0.004) * ${(band * 0.35).toFixed(1)};
        float layer = floor((vWP2.y + wob) / ${band.toFixed(1)});
        vec3 a = vec3(0.25, 0.235, 0.22), b = vec3(0.2, 0.185, 0.17), c = vec3(0.3, 0.28, 0.26), e = vec3(0.16, 0.15, 0.14);
        float r = hh(layer * 7.1);
        vec3 strata = r < 0.25 ? a : r < 0.5 ? b : r < 0.75 ? c : e;
        strata *= mix(0.7, 1.0, smoothstep(${(-depth).toFixed(1)}, 0.0, vWP2.y));
        vec3 soil = vec3(0.22, 0.16, 0.11);
        diffuseColor.rgb = mix(strata, soil, smoothstep(${(depth * 0.03 + 6).toFixed(1)}, 0.0, d));`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  // bottom of the slab
  const w = (nx - 1) * dx, h = (ny - 1) * dy;
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2f2924', roughness: 1 }));
  bottom.position.set(x0 + w / 2, -depth, -(y1 - h / 2));
  const group = new THREE.Group();
  group.add(mesh, bottom);
  return group;
}

// ribbon along a draped 3D polyline [x,y,z,...] (map coords; z is height)
function ribbon(flat, width, dash = 0) {
  const pos = [];
  const n = flat.length / 3;
  let dist = 0;
  const L = [], R = [];
  for (let k = 0; k < n; k++) {
    const x = flat[k * 3], y = flat[k * 3 + 1], h = flat[k * 3 + 2];
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    let tx = flat[b * 3] - flat[a * 3], ty = flat[b * 3 + 1] - flat[a * 3 + 1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const ox = -ty * width / 2, oy = tx * width / 2;
    L.push([x + ox, h, -(y + oy)]); R.push([x - ox, h, -(y - oy)]);
  }
  for (let k = 0; k < n - 1; k++) {
    const seg = Math.hypot(flat[(k + 1) * 3] - flat[k * 3], flat[(k + 1) * 3 + 1] - flat[k * 3 + 1]);
    const on = !dash || Math.floor((dist + seg / 2) / dash) % 2 === 0;
    dist += seg;
    if (!on) continue;
    pos.push(...L[k], ...R[k], ...L[k + 1], ...L[k + 1], ...R[k], ...R[k + 1]);
  }
  return pos;
}

function ribbonMesh(list, material) {
  const pos = [];
  for (const r of list) pos.push(...r);
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

// ------------------------------------------------------------------ trees
function treeMeshes(flat, season, decid = DECID) {
  const n = flat.length / 5;
  const con = [], dec = [], pine = [], lemon = [];
  for (let i = 0; i < n; i++) {
    const k = flat[i * 5 + 4];
    (k === 0 ? con : k === 3 ? pine : k === 4 ? lemon : dec).push(i);
  }
  const group = new THREE.Group();
  const rnd = mulberry32(1890);   // Yosemite National Park
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), mat, Math.max(1, con.length));
  con.forEach((i, k) => {
    const s = flat[i * 5 + 3], H = 30 * s * (0.85 + 0.3 * rnd());
    q.setFromAxisAngle(yAxis, rnd() * 6.28);
    sc.set(H * 0.27, H, H * 0.27);
    p.set(flat[i * 5], flat[i * 5 + 2] - 1, -flat[i * 5 + 1]);
    mtx.compose(p, q, sc);
    cone.setMatrixAt(k, mtx);
    cone.setColorAt(k, col.set(CONIFER[Math.floor(rnd() * CONIFER.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.05));
  });
  cone.count = con.length;
  const blob = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, Math.max(1, dec.length));
  const decSeeds = [];
  dec.forEach((i, k) => {
    const s = flat[i * 5 + 3], r = 6.5 * s * (0.8 + 0.4 * rnd());
    q.setFromAxisAngle(yAxis, rnd() * 6.28);
    sc.set(r, r * 1.15, r);
    p.set(flat[i * 5], flat[i * 5 + 2] + r * 1.1, -flat[i * 5 + 1]);
    mtx.compose(p, q, sc);
    blob.setMatrixAt(k, mtx);
    decSeeds.push([flat[i * 5 + 4] - 1, rnd()]);
  });
  blob.count = dec.length;
  function recolor(seasonName) {
    decSeeds.forEach(([kind, r], k) => {
      const list = decid[seasonName][Math.min(kind, 1)];
      blob.setColorAt(k, col.set(list[Math.floor(r * list.length)]));
    });
    if (blob.instanceColor) blob.instanceColor.needsUpdate = true;
  }
  recolor(season);
  // umbrella pines: a tall bare trunk and a flat dark crown
  const extra = [];
  if (pine.length) {
    const pg = BGU.mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.09, 1, 5).translate(0, 0.5, 0),
      new THREE.SphereGeometry(1, 8, 5).scale(0.42, 0.13, 0.42).translate(0, 1.0, 0),
    ].map((x) => x.toNonIndexed()));
    const pm = new THREE.InstancedMesh(pg, mat, pine.length);
    pine.forEach((i, k) => {
      const s = flat[i * 5 + 3], H = 30 * s * (0.85 + 0.3 * rnd());
      q.setFromAxisAngle(yAxis, rnd() * 6.28);
      sc.set(H, H, H);
      p.set(flat[i * 5], flat[i * 5 + 2] - 0.5, -flat[i * 5 + 1]);
      mtx.compose(p, q, sc);
      pm.setMatrixAt(k, mtx);
      pm.setColorAt(k, col.set(['#3d5a33', '#46653a', '#35502e'][Math.floor(rnd() * 3)]));
    });
    extra.push(pm);
  }
  // lemon trees in their rows, olives and maquis shrubs
  if (lemon.length) {
    const lm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat, lemon.length);
    lemon.forEach((i, k) => {
      const s = flat[i * 5 + 3], r = 6 * s * (0.8 + 0.4 * rnd());
      q.setFromAxisAngle(yAxis, rnd() * 6.28);
      sc.set(r, r * 0.8, r);
      p.set(flat[i * 5], flat[i * 5 + 2] + r * 0.6, -flat[i * 5 + 1]);
      mtx.compose(p, q, sc);
      lm.setMatrixAt(k, mtx);
      lm.setColorAt(k, col.set(['#4f7a2e', '#5d8a34', '#466f2a', '#6b8f3c', '#7d8f55'][Math.floor(rnd() * 5)]));
    });
    extra.push(lm);
  }
  for (const m of [...extra, cone, blob]) { m.castShadow = true; m.receiveShadow = true; if (m.count) group.add(m); }
  return { group, recolor };
}

// ------------------------------------------------------------------ traffic on mountain roads
class Lane3 {
  constructor(flat) {
    this.p = []; this.cum = [0];
    for (let i = 0; i < flat.length; i += 3) this.p.push([flat[i], flat[i + 1], flat[i + 2]]);
    for (let i = 1; i < this.p.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    }
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

function mountainTraffic(lanesFlat, uniforms, scale, opts = {}) {
  const all = lanesFlat.map((f) => new Lane3(f));
  const first = opts.leadFirst ? all[0] : null;
  const lanes = all.filter((l) => l.len > 300 && l !== first);
  lanes.sort((a, b) => b.len - a.len);
  if (first && first.len > 300) lanes.unshift(first);
  if (!lanes.length) return null;
  const total = lanes.reduce((s, l) => s + l.len, 0);
  const rand = mulberry32(120);
  const n = Math.min(120, Math.max(6, Math.floor(total / 900)));
  const cars = Array.from({ length: n }, (_, i) => {
    const lane = i === 0 ? lanes[0] : (() => { let t = rand() * total; for (const l of lanes) { if ((t -= l.len) <= 0) return l; } return lanes[0]; })();
    return { lane, s: rand() * lane.len, dir: rand() < 0.5 ? 1 : -1, v: 11 + rand() * 7, pause: 0 };
  });
  if (opts.start) {
    // the lead car sets off from a chosen point (Positano), driving east
    const L = lanes[0];
    let best = 0, bd = Infinity;
    for (let k = 0; k < L.p.length; k++) { const d = Math.hypot(L.p[k][0] - opts.start[0], L.p[k][1] - opts.start[1]); if (d < bd) { bd = d; best = k; } }
    Object.assign(cars[0], { s: L.cum[best], dir: 1, v: opts.leadSpeed || 16 });
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  const mesh = new THREE.InstancedMesh(carGeometry(), mat, n);
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const lights = new THREE.InstancedMesh(lightsGeometry(4.4, 1.9, 0.85), lightMat, n);
  const col = new THREE.Color();
  cars.forEach((c, i) => mesh.setColorAt(i, col.set(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)])));
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh, lights);
  const tmp = {}, mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(scale, scale, scale);
  const yAxis = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3();
  const lead = { pos: new THREE.Vector3() };
  function step(dt) {
    cars.forEach((c, i) => {
      if (c.pause > 0) c.pause -= dt;
      else {
        c.s += c.v * c.dir * dt;
        if (c.s > c.lane.len || c.s < 0) { c.dir *= -1; c.s = Math.max(0, Math.min(c.lane.len, c.s)); c.pause = 2 + rand() * 4; }
      }
      c.lane.at(c.s, tmp);
      const dx = tmp.dx * c.dir, dy = tmp.dy * c.dir, off = 2.2 * scale;
      p.set(tmp.x + dy * off, tmp.z, -(tmp.y - dx * off));
      q.setFromAxisAngle(yAxis, Math.atan2(dy, dx));
      mtx.compose(p, q, one);
      mesh.setMatrixAt(i, mtx); lights.setMatrixAt(i, mtx);
      if (i === 0) lead.pos.copy(p);
    });
    mesh.instanceMatrix.needsUpdate = true; lights.instanceMatrix.needsUpdate = true;
    const k = 0.55 + uniforms.uNight.value * 3.2;
    lightMat.color.setRGB(k, k, k);
  }
  return { group, step, lead };
}

// ------------------------------------------------------------------ waterfalls
function waterfalls(falls, uniforms) {
  const group = new THREE.Group();
  const items = [];
  for (const f of falls) {
    const pts = [];
    for (let i = 0; i < f.p.length; i += 3) pts.push(new THREE.Vector3(f.p[i], f.p[i + 2], -f.p[i + 1]));
    if (pts.length < 2) continue;
    const w = f.drop > 250 ? 26 : 16;
    const pos = [], uv = [];
    let v = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (k > 0) v += pts[k].distanceTo(pts[k - 1]);
      pos.push(pts[k].x - tz * w / 2, pts[k].y, pts[k].z + tx * w / 2, pts[k].x + tz * w / 2, pts[k].y, pts[k].z - tx * w / 2);
      uv.push(0, v, 1, v);
    }
    const idx = [];
    for (let k = 0; k < pts.length - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const flow = { value: 1 };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: uniforms.uTime, uNight: uniforms.uNight, uFlow: flow, uLen: { value: v } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uNight, uFlow, uLen; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main() {
          float across = abs(vUv.x * 2.0 - 1.0);
          float width = mix(0.18, 1.0, uFlow);
          if (across > width) discard;
          float streak = n(vec2(vUv.x * 9.0, vUv.y * 0.06 - uTime * 1.6)) * 0.6 + n(vec2(vUv.x * 23.0, vUv.y * 0.15 - uTime * 3.0)) * 0.4;
          float a = (0.35 + 0.65 * streak) * (1.0 - pow(across / width, 3.0)) * uFlow;
          a *= smoothstep(0.0, 6.0, vUv.y) * (0.75 + 0.25 * smoothstep(uLen * 0.6, uLen, vUv.y));
          vec3 c = mix(vec3(1.0), vec3(0.55, 0.62, 0.78), uNight);
          gl_FragColor = vec4(c, min(1.0, a * 1.25));
        }`,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 4;
    // the dark wet streak the water leaves on the granite
    const wetMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uFlow: flow, uLen: { value: v } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.y -= 0.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: `uniform float uFlow, uLen; varying vec2 vUv;
        void main(){ float a = (1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0)) * smoothstep(0.0, 10.0, vUv.y) * smoothstep(uLen, uLen * 0.85, vUv.y);
          gl_FragColor = vec4(0.12, 0.12, 0.13, a * (0.28 + 0.27 * uFlow)); }`,
    });
    const wetG = g.clone();
    const wp = wetG.attributes.position.array;
    for (let k = 0; k < wp.length; k += 6) {          // a little wider than the water
      const cx = (wp[k] + wp[k + 3]) / 2, cz = (wp[k + 2] + wp[k + 5]) / 2;
      for (const o of [0, 3]) { wp[k + o] = cx + (wp[k + o] - cx) * 1.8; wp[k + o + 2] = cz + (wp[k + o + 2] - cz) * 1.8; }
    }
    const wet = new THREE.Mesh(wetG, wetMat);
    wet.renderOrder = 3;
    group.add(wet);
    // a soft cloud of mist where it lands
    const mistMat = new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, map: mistTexture() });
    const mist = new THREE.Sprite(mistMat);
    const last = pts[pts.length - 1];
    mist.position.set(last.x, last.y + 12, last.z);
    mist.scale.setScalar(Math.min(140, f.drop * 0.35 + 30));
    group.add(mesh, mist);
    items.push({ name: f.n.toLowerCase(), flow, mist, mistMat });
  }
  return {
    group,
    setFlow(fn) {
      for (const it of items) {
        it.flow.value = fn(it.name);
        it.mist.visible = it.flow.value > 0.05;
        it.mistMat.opacity = 0.45 * it.flow.value * (1 - 0.6 * uniforms.uNight.value);
      }
    },
  };
}

let _mist;
function mistTexture() {
  if (_mist) return _mist;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _mist = new THREE.CanvasTexture(c);
  return _mist;
}

// ------------------------------------------------------------------ night lights on the walls
function headlamps(flat, uniforms) {
  if (!flat?.length) return null;
  const n = flat.length / 3;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([flat[i * 3], flat[i * 3 + 2], -flat[i * 3 + 1]], i * 3); seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: uniforms.uTime, uNight: uniforms.uNight },
    vertexShader: `attribute float aSeed; uniform float uTime, uNight; varying float vA;
      void main(){ vA = uNight * (0.7 + 0.3 * sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 30.0));
        gl_PointSize = 5.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * 2.5, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.renderOrder = 6;
  return pts;
}

// ------------------------------------------------------------------ Mono Lake
function tufaField(flat, scale) {
  if (!flat?.length) return null;
  const n = flat.length / 4;
  const variants = [];
  const rnd = mulberry32(1881);
  for (let v = 0; v < 5; v++) {
    const prof = [];
    const steps = 9;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = (0.42 - 0.22 * t) * (0.75 + 0.5 * rnd()) * (k === steps ? 0.4 : 1);
      prof.push(new THREE.Vector2(Math.max(0.04, r), t));
    }
    prof.unshift(new THREE.Vector2(0.001, 0));
    prof.push(new THREE.Vector2(0.001, 1.02));
    variants.push(new THREE.LatheGeometry(prof, 7));
  }
  const mat = new THREE.MeshStandardMaterial({ color: '#d8ccb0', roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const buckets = variants.map(() => []);
  for (let i = 0; i < n; i++) buckets[i % 5].push(i);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  buckets.forEach((items, v) => {
    const im = new THREE.InstancedMesh(variants[v], mat, items.length);
    items.forEach((i, k) => {
      const s = flat[i * 4 + 3], H = (4 + 6 * s) * scale;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.3);
      sc.set(H * 0.55, H, H * 0.55);
      p.set(flat[i * 4], flat[i * 4 + 2] - 0.5, -flat[i * 4 + 1]);
      m.compose(p, q, sc);
      im.setMatrixAt(k, m);
    });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  });
  return group;
}

function gullFlock(center) {
  if (!center) return null;
  const n = 160;
  const pos = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.95 });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  const rnd = mulberry32(60);
  const birds = Array.from({ length: n }, () => ({ r: 200 + rnd() * 1100, a: rnd() * 6.28, w: (0.12 + rnd() * 0.2) * (rnd() < 0.5 ? 1 : -1), h: 30 + rnd() * 140, ph: rnd() * 6.28 }));
  const lead = { pos: new THREE.Vector3(center[0], center[2], -center[1]) };
  return {
    object: pts, lead,
    update(t, night) {
      birds.forEach((b, i) => {
        const a = b.a + t * b.w, wob = Math.sin(t * 0.7 + b.ph) * 60;
        pos[i * 3] = center[0] + Math.cos(a) * (b.r + wob);
        pos[i * 3 + 1] = center[2] + b.h + Math.sin(t * 1.3 + b.ph) * 15;
        pos[i * 3 + 2] = -(center[1] + Math.sin(a) * (b.r + wob));
      });
      g.attributes.position.needsUpdate = true;
      mat.opacity = 0.95 * (1 - 0.85 * night);
    },
  };
}

// ------------------------------------------------------------------ campgrounds
// little tents under the trees, and lantern light after dark
function campground(spots, uniforms) {
  const n = spots.length;
  if (!n) return null;
  const group = new THREE.Group();
  const tentG = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
  const tents = new THREE.InstancedMesh(tentG, mat, n);
  const COLORS = ['#e2582f', '#f2b531', '#3b7bc4', '#4f9a4a', '#d63f3f', '#f08a24', '#7b5aa6', '#e9e4d8'];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  const lampPos = [];
  spots.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot + Math.PI / 4);
    sc.set(p.s * 1.6, p.s * 1.25, p.s * 1.15);
    m.compose(new THREE.Vector3(p.x, p.h - 0.1, -p.y), q, sc);
    tents.setMatrixAt(i, m);
    tents.setColorAt(i, col.set(COLORS[i % COLORS.length]));
    if (i % 2 === 0) lampPos.push(p.x + p.s * 1.3, p.h + 2, -p.y);
  });
  tents.castShadow = true;
  group.add(tents);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  const glow = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uNight: uniforms.uNight, uTime: uniforms.uTime },
    vertexShader: `uniform float uNight, uTime; varying float vA;
      void main(){ vA = uNight * (0.75 + 0.25 * sin(uTime * 7.0 + position.x)); gl_PointSize = 11.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(1.0, 0.68, 0.32) * 2.2, vA * smoothstep(0.5, 0.0, d)); }`,
  });
  const pts = new THREE.Points(g, glow);
  pts.renderOrder = 6;
  group.add(pts);
  return group;
}

// ------------------------------------------------------------------ the place
export async function buildTerrainPlace({ scene, uniforms, base, cfg }) {
  const { data, z, cls } = await loadTerrain(base, cfg.id);
  const grid = { ...data.grid, contour: cfg.contour };
  const heightAt = makeSampler(grid, z);
  const [x0, y0, x1, y1] = data.meta.extent;
  const maxDim = Math.max(x1 - x0, y1 - y0);
  const [lat0, lon0] = data.meta.origin;
  // big places (the Dakar) are built at a reduced scale: scene m = real m * meta.scale
  const mScale = data.meta.scale || 1;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180) * mScale, ky = 110574 * mScale;
  const ll = (lat, lon, dz = 0) => {
    const x = (lon - lon0) * kx, y = (lat - lat0) * ky;
    return new THREE.Vector3(x, heightAt(x, y) + dz, -y);
  };

  let season = cfg.season || 'autumn';
  const terr = terrainMesh(grid, z, cls, uniforms, { palette: cfg.palette, terraces: cfg.terraces, steep: cfg.steep, soften: cfg.soften, sea: grid.sea != null, dunes: cfg.dunes, seabedScale: cfg.seabedScale });
  scene.add(terr.mesh);
  const depth = maxDim * 0.03;
  scene.add(slabWalls(grid, z, depth));

  // water
  const wScale = Math.max(1, maxDim / 4000);
  const waterMat = new THREE.MeshStandardMaterial({ color: cfg.waterColor || '#4f8fb3', roughness: 0.22, metalness: 0.0, envMapIntensity: 0.35 });
  animateWater(waterMat, uniforms, wScale);
  for (const lake of data.lakes) {
    const y = (lake.level - grid.h0) * grid.vexag + 0.4;
    const m = flatLayer([lake.r], y, waterMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  const riverMat = new THREE.MeshStandardMaterial({ color: cfg.riverColor || '#5b9cc0', roughness: 0.3, envMapIntensity: 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  animateWater(riverMat, uniforms, wScale * 0.5);
  const rw = cfg.riverScale ?? 1;
  const riv = rw > 0 ? ribbonMesh(data.rivers.map((r) => ribbon(r.p, Math.max(r.w * 1.3, grid.dx * 0.5) * rw)), riverMat) : null;
  if (riv) scene.add(riv);

  // roads and trails
  const roadMat = new THREE.MeshStandardMaterial({ color: cfg.roadColor || '#dcd5c6', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const trailMat = new THREE.MeshStandardMaterial({ color: '#8f6f47', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const ws = Math.max(1, maxDim / 9000);
  const rs = cfg.roadScale ?? ws;
  const rd = ribbonMesh(data.roads.filter((r) => r.k !== 'trail').map((r) => ribbon(r.p, r.w * 1.5 * rs)), roadMat);
  const tr = ribbonMesh(data.roads.filter((r) => r.k === 'trail').map((r) => ribbon(r.p, 2.6 * rs, 14 * rs)), trailMat);
  if (rd) scene.add(rd);
  if (tr) scene.add(tr);

  // buildings: lodges, cabins and towns
  if (data.buildings.length) {
    const colors = cfg.buildingColors || ['#8a6b52', '#7d6450', '#9a7d62', '#b49c80'];
    const list = data.buildings.map((b) => ({ ...b, c: colors[Math.floor(b.s * 997) % colors.length], noRoofBox: true }));
    scene.add(buildBuildings(list, uniforms));
  }
  // real 3D models of landmarks from Wikimedia Commons, with the boxes they replace on standby
  const models = await buildModels(data.models || [], { base, groundZ: (x, y) => heightAt(x, y) });
  scene.add(models.group);
  let boxes = null;
  if (data.model_boxes?.length) {
    const colors = cfg.buildingColors || ['#8a6b52', '#7d6450', '#9a7d62', '#b49c80'];
    boxes = buildBuildings(data.model_boxes.map((b) => ({ ...b, c: colors[Math.floor(b.s * 997) % colors.length], noRoofBox: true })), uniforms);
    boxes.visible = false;
    scene.add(boxes);
  }

  const trees = treeMeshes(data.trees, season, cfg.decid || DECID);
  scene.add(trees.group);
  const falls = waterfalls(data.falls || [], uniforms);
  scene.add(falls.group);
  const lamps = headlamps(data.lamps, uniforms);
  if (lamps) scene.add(lamps);
  // campgrounds (Camp 4 below El Cap's neighbor, Sentinel Rock's shadow)
  const rndC = mulberry32(1960);
  const spots = [];
  for (const c of cfg.camps || []) {
    const kx_ = kx, ky_ = ky;
    const cx = (c.lon - lon0) * kx_, cy = (c.lat - lat0) * ky_;
    for (let i = 0; i < c.n; i++) {
      const a = rndC() * Math.PI * 2, d = c.r * Math.sqrt(rndC());
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.7;
      spots.push({ x, y, h: heightAt(x, y), s: 5 + rndC() * 2.5, rot: rndC() * 6.28 });
    }
  }
  const camps = campground(spots, uniforms);
  if (camps) scene.add(camps);
  const tufa = tufaField(data.tufa, 3.4);
  if (tufa) scene.add(tufa);
  const gulls = gullFlock(data.gulls);
  if (gulls) scene.add(gulls.object);
  const startXY = cfg.driveStart ? [(cfg.driveStart.lon - lon0) * kx, (cfg.driveStart.lat - lat0) * ky] : null;
  const traffic = mountainTraffic(data.lanes || [], uniforms, cfg.carScale ?? Math.max(1.6, ws * 1.4),
    { leadFirst: !!data.drive, start: startXY, leadSpeed: cfg.driveSpeed });
  if (traffic) scene.add(traffic.group);

  // the sea: surface, water column on the cut edges, boats and beach umbrellas
  let fleet = null, brollies = null;
  if (grid.sea != null) {
    const sea = seaSurface(grid, uniforms, wScale * (cfg.waveScale || 2.5));
    scene.add(sea.mesh);
    const walls = seaWalls(grid, z);
    if (walls) scene.add(walls);
    const near = cfg.ferryTo ? [(cfg.ferryTo.lon - lon0) * kx, (cfg.ferryTo.lat - lat0) * ky] : null;
    fleet = boats({ routes: data.routes, anchored: data.anchored, sea: grid.sea, uniforms, scale: cfg.boatScale || 2.2, leadNear: near, speed: cfg.boatSpeed || 1 });
    scene.add(fleet.group);
    brollies = umbrellas(data.umbrellas, cfg.umbrellaScale || 2.2);
    if (brollies) scene.add(brollies);
  }

  // seasons + snow
  let weatherSnow = 0, lastLine = null;
  const snowline = () => (season === 'spring' ? cfg.snowSpring : cfg.snowAutumn) - 900 * weatherSnow;
  function repaint(force) {
    const line = snowline();
    if (force || lastLine === null || Math.abs(line - lastLine) > 15) { terr.paint(season, line); lastLine = line; }
  }
  let extraRef = null;
  const waterBase = waterMat.color.clone(), riverBase = riverMat.color.clone();
  function applySeason() {
    repaint(true);
    // mountain lakes and streams freeze over in a ski-season winter
    const frozen = cfg.frozenWinter && season === 'autumn';
    waterMat.color.copy(frozen ? new THREE.Color('#e4eaef') : waterBase);
    riverMat.color.copy(frozen ? new THREE.Color('#dfe6ec') : riverBase);
    waterMat.roughness = frozen ? 0.7 : 0.22;
    extraRef?.setSeason?.(season);
    fleet?.setSummer(season === 'spring');
    if (brollies) brollies.visible = season === 'spring';
    trees.recolor(season);
    falls.setFlow((name) => (season === 'spring' ? cfg.flowSpring?.(name) ?? 1 : cfg.flowAutumn?.(name) ?? 0.3));
  }
  applySeason();

  // labels
  const labels = data.labels.map((l, i) => ({
    text: l.t, sub: l.s, pos: new THREE.Vector3(l.x, l.z, -l.y),
    minZoom: l.k === 'town' ? 0 : l.k === '' ? 1.8 : i < 7 ? 0 : 1.4,
  }));

  // place-specific extras (the Dakar's route and convoy)
  const extra = cfg.extras ? await cfg.extras({ scene, uniforms, data, grid, heightAt, ll, kx, ky, lat0, lon0 }) : null;
  extraRef = extra;
  extra?.setSeason?.(season);

  // views, follows, film
  const views = cfg.views.map((v) => ({ ...v, target: ll(v.lat, v.lon, v.dz || 0) }));
  const V = Object.fromEntries(views.map((v) => [v.id, v.target]));
  const follows = [];
  if (traffic && cfg.drive) follows.push({ label: cfg.drive, dot: '#c7372f', obj: traffic.lead, zoom: cfg.driveZoom || 9 });
  if (gulls) follows.push({ label: 'Fly with the gulls', dot: '#ffffff', obj: gulls.lead, zoom: 6 });
  if (fleet?.lead && cfg.ferry) follows.push({ label: cfg.ferry, dot: '#1f5fa8', obj: fleet.lead, zoom: cfg.ferryZoom || 5 });
  if (extra?.follows) follows.push(...extra.follows);
  if (extra?.labels) labels.push(...extra.labels);
  const film = cfg.film({ V, ll, gulls: gulls?.lead, car: traffic?.lead, ferry: fleet?.lead, extra });

  const nTrees = data.trees.length / 5;
  const trailKm = data.roads.filter((r) => r.k === 'trail').reduce((s, r) => {
    let L = 0; for (let i = 3; i < r.p.length; i += 3) L += Math.hypot(r.p[i] - r.p[i - 3], r.p[i + 1] - r.p[i - 2]); return s + L;
  }, 0) / 1000;

  return {
    data,
    extent: data.meta.extent,
    groundHeight: grid.zmax * 0.55,
    heightAt,
    labels, views, follows,
    weather: cfg.weather || { mode: 'snow', label: 'Snow', toast: cfg.snowToast || 'First snow of the season' },
    sky: cfg.sky,
    toggles: (cfg.noSeason ? [] : [{
      id: 'season', label: cfg.seasonLabel || 'Spring snowmelt', on: season === 'spring',
      onChange(on) { season = on ? 'spring' : 'autumn'; applySeason(); return on ? cfg.springToast : cfg.autumnToast; },
    }]).concat(extra?.toggles || []).concat(models.loaded.length ? [{
      id: 'models', label: `Commons 3D models (${models.loaded.length})`, on: true,
      onChange(on) { models.setVisible(on); if (boxes) boxes.visible = !on; return on ? 'Real 3D models from Wikimedia Commons, via Wikidata' : 'Back to the simple boxes'; },
    }] : []),
    creditsHtml: creditsHtml(models.loaded),
    film, simOffset: 0,
    stats: cfg.stats ? cfg.stats({ data, nTrees, trailKm, boats: fleet?.count || 0, extra })
      : `${Math.round(nTrees).toLocaleString()} trees · ${Math.round(trailKm)} km of trails · ${data.meta.attribution}`,
    update(t, dt, ctx) {
      weatherSnow = ctx.rain;
      repaint(false);
      traffic?.step(dt);
      fleet?.update(t);
      gulls?.update(t, uniforms.uNight.value);
      falls.setFlow((name) => (season === 'spring' ? cfg.flowSpring?.(name) ?? 1 : cfg.flowAutumn?.(name) ?? 0.3));
      extra?.update?.(t, dt, ctx);
    },
    seek(t, dt) {
      if (traffic) for (let ft = 0; ft < t - dt / 2; ft += dt) traffic.step(dt);
      extra?.seek?.(t, dt);
    },
    onView: extra?.onView,
    lighting() {},
  };
}
