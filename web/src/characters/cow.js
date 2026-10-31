// A Swiss cow, built by hand: the Eringer of the Valais (compact, dark, lyre
// horns, the queen of the cow fights) or a Brown Swiss (grey-brown with the
// pale muzzle ring). Dressed for the Alpabzug she wears a crown of paper roses
// and fir, ribbons, garlands on her horns and a big bell on an embroidered strap.
//
// Units are metres; the cow faces +x, stands on y = 0, z is her left/right.
import * as THREE from 'three';
import { loft, tube, tint, canvasTex, drawEdelweiss, furNormal } from './geo.js';

const BREEDS = {
  eringer: { coat: '#2b1f19', back: '#4a2f22', belly: '#22190f', muzzle: '#3a2c24', nose: '#1a1412', horn: '#e9dcc0', tip: '#2a2420', withers: 1.22, horns: 'lyre' },
  brownswiss: { coat: '#76624f', back: '#8a7663', belly: '#5f4d3f', muzzle: '#efe6d6', nose: '#2b2522', horn: '#e7dcc4', tip: '#3a332c', withers: 1.42, horns: 'short' },
};

function strapTexture() {
  // red leather embroidered with edelweiss and little cows, brass studs along the edges
  return canvasTex(512, 64, (x, w, h) => {
    x.fillStyle = '#9b1c1f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1c1714'; x.fillRect(0, 0, w, 7); x.fillRect(0, h - 7, w, 7);
    for (let i = 0; i < w; i += 16) {
      x.fillStyle = '#d8b24a';
      x.beginPath(); x.arc(i + 8, 3.5, 2.6, 0, Math.PI * 2); x.arc(i + 8, h - 3.5, 2.6, 0, Math.PI * 2); x.fill();
    }
    for (let i = 0; i < w; i += 64) {
      drawEdelweiss(x, i + 20, h / 2, 15);
      // a tiny white cow in profile
      x.fillStyle = '#f4efe2';
      x.fillRect(i + 40, h / 2 - 5, 16, 8);
      x.fillRect(i + 54, h / 2 - 8, 6, 6);
      x.fillRect(i + 41, h / 2 + 3, 2.5, 6); x.fillRect(i + 52, h / 2 + 3, 2.5, 6);
    }
  }, [3, 1]);
}

function paperRose(color, size, lo = false) {
  // a ring of petals around a tight centre, like the crepe-paper roses on Alpabzug crowns
  const g = new THREE.Group();
  const petal = new THREE.SphereGeometry(size * 0.45, lo ? 4 : 8, lo ? 3 : 6).scale(1, 0.45, 0.8);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
  for (let ring = 0; ring < (lo ? 1 : 2); ring++) {
    const n = ring ? 5 : (lo ? 5 : 7), r = ring ? size * 0.28 : size * 0.55;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.4;
      const m = new THREE.Mesh(petal, mat);
      m.position.set(Math.cos(a) * r, ring * size * 0.18, Math.sin(a) * r);
      m.rotation.set(0, -a, ring ? 0.9 : 0.35);
      g.add(m);
    }
  }
  const heart = new THREE.Mesh(new THREE.SphereGeometry(size * 0.22, lo ? 4 : 8, lo ? 3 : 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.8 }));
  heart.position.y = size * 0.3;
  g.add(heart);
  return g;
}

function bellGeometry(h = 0.42) {
  // cast bronze Glocke: shoulder, waist and a flared lip
  const pts = [[0.0, h], [0.08, h], [0.12, h * 0.93], [0.13, h * 0.78], [0.135, h * 0.55], [0.15, h * 0.32], [0.18, h * 0.14], [0.215, h * 0.03], [0.22, 0], [0.2, 0.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 28);
}

export function buildCow({ breed = 'eringer', dressed = true, detail = 1 } = {}) {
  const B = BREEDS[breed] || BREEDS.eringer;
  const S = B.withers / 1.22;                 // Brown Swiss stands taller
  const coat = new THREE.Color(B.coat), back = new THREE.Color(B.back), belly = new THREE.Color(B.belly), muzzle = new THREE.Color(B.muzzle);
  const cow = new THREE.Group();
  const seg = Math.round(30 * detail);
  const lo = detail < 0.75;
  // a short, velvety summer coat: sheen at grazing angles and fine hair in the normals
  const fur = lo ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 })
    : new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.76, sheen: 0.55, sheenRoughness: 0.5,
      sheenColor: new THREE.Color(B.back).lerp(new THREE.Color('#ffffff'), 0.12), normalMap: furNormal(), normalScale: new THREE.Vector2(0.45, 0.45),
    });

  // ---- body, neck and head in one loft, nose to tail
  const sections = [
    { x: -1.06, y: 1.07, w: 0.2, h: 0.28, p: 2.4 },                         // tailhead and pin bones
    { x: -0.98, y: 1.04, w: 0.42, h: 0.52, p: 2.6, top: 0.7 },
    { x: -0.84, y: 1.0, w: 0.55, h: 0.7, p: 2.8, top: 0.85 },                 // the rump, square-topped
    { x: -0.64, y: 0.98, w: 0.63, h: 0.8, p: 2.7, top: 0.9 },                 // hook bones
    { x: -0.4, y: 0.95, w: 0.66, h: 0.86, p: 2.4, top: 0.7, bot: 0.3 },
    { x: -0.1, y: 0.93, w: 0.71, h: 0.9, p: 2.3, top: 0.5, bot: 0.7 },        // a full belly of summer grass
    { x: 0.2, y: 0.94, w: 0.69, h: 0.89, p: 2.3, top: 0.4, bot: 0.5 },
    { x: 0.42, y: 0.98, w: 0.6, h: 0.86, p: 2.3, top: 0.3 },                  // chest and shoulders
    { x: 0.6, y: 1.01, w: 0.47, h: 0.82, p: 2.2, top: 0.2, bot: 0.5 },        // brisket
    { x: 0.74, y: 1.06, w: 0.36, h: 0.66, p: 2.1, bot: 0.8 },                 // the dewlap hangs under the neck
    { x: 0.88, y: 1.12, w: 0.29, h: 0.5, p: 2.0, bot: 0.6 },
    { x: 1.0, y: 1.17, w: 0.27, h: 0.4, p: 2.0 },
    { x: 1.07, y: 1.21, w: 0.33, h: 0.35, p: 2.6, top: 0.2 },                 // poll, between the horns
    { x: 1.17, y: 1.19, w: 0.35, h: 0.37, p: 2.5 },                           // the broad forehead, eyes
    { x: 1.27, y: 1.12, w: 0.29, h: 0.35, p: 2.2, bot: 0.4 },                 // cheeks and jaw
    { x: 1.38, y: 1.04, w: 0.22, h: 0.29, p: 2.1 },
    { x: 1.48, y: 0.985, w: 0.2, h: 0.23, p: 2.2 },
    { x: 1.56, y: 0.955, w: 0.215, h: 0.2, p: 2.8 },                          // the wide muzzle
    { x: 1.61, y: 0.95, w: 0.18, h: 0.16, p: 2.8 },
  ].map((s) => ({ ...s, x: s.x * S, y: s.y * S, w: s.w * S, h: s.h * S }));
  const c1 = new THREE.Color();
  const colorFn = (ox, oy) => (x, y, z, u, out) => {
    x += ox; y += oy;
    // darker underneath, a warmer stripe down the back, a pale ring round the muzzle (Brown Swiss)
    const up = (y - 0.95 * S) / (0.45 * S);
    out.copy(coat);
    if (up > 0.55 && x < 0.95 * S) out.lerp(back, Math.min(1, (up - 0.55) * 2.2));
    if (up < -0.4) out.lerp(belly, Math.min(1, (-0.4 - up) * 2));
    if (x > 1.47 * S) out.copy(muzzle);
    const n = Math.sin(x * 23.1 + z * 17.3) * Math.cos(y * 19.7 - z * 11.1);
    c1.copy(out).offsetHSL(0, 0, n * 0.025);
    out.copy(c1);
  };
  const body = loft(sections.slice(0, 12), {
    seg, sub: Math.max(2, Math.round(4 * detail)), color: colorFn(0, 0),
  });
  const bodyMesh = new THREE.Mesh(body, fur);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  cow.add(bodyMesh);

  // the head is a separate pivot for the chewing nod: re-use a slice of the loft? Keep it simple:
  // nod the whole front with a small group holding the head extras
  const head = new THREE.Group();
  head.position.set(0.98 * S, 1.17 * S, 0);
  cow.add(head);
  const H = (x, y, z) => new THREE.Vector3(x * S - head.position.x, y * S - head.position.y, z * S);
  // the head is its own loft on a pivot at the poll, so it can nod and chew
  const headSecs = [{ x: 0.93 * S, y: 1.13 * S, w: 0.28 * S, h: 0.42 * S, p: 2 }].concat(sections.slice(11))
    .map((q) => ({ ...q, x: q.x - head.position.x, y: q.y - head.position.y }));
  const headMesh = new THREE.Mesh(loft(headSecs, { seg, sub: Math.max(2, Math.round(4 * detail)), color: colorFn(head.position.x, head.position.y) }), fur);
  headMesh.castShadow = true;
  head.add(headMesh);

  // bones under the hide: hooks and pins at the hips, the shoulder blades, the spine
  const bump = (x, y, z, r, sx, sy, sz) => {
    const g = new THREE.SphereGeometry(r * S, lo ? 8 : 16, lo ? 6 : 12).scale(sx, sy, sz);
    const c = new THREE.Color(); colorFn(0, 0)(x * S, y * S, z * S, 0, c);
    const m = new THREE.Mesh(tint(g, '#' + c.getHexString()), fur);
    m.position.set(x * S, y * S, z * S);
    m.castShadow = true;
    cow.add(m);
  };

  // ---- legs: forelegs straight, hind legs with the hock bent back
  const legCol = (dark) => (t, u, out) => out.copy(t < 0.06 ? new THREE.Color('#1a1714') : dark);
  const legs = [];
  for (const side of [-1, 1]) {
    const fl = tube([[0.5, 0.04, 0.16], [0.49, 0.18, 0.16], [0.5, 0.3, 0.162], [0.5, 0.42, 0.165], [0.5, 0.5, 0.165], [0.5, 0.64, 0.15], [0.47, 0.98, 0.1]].map(([x, y, z]) => [x * S, y * S, z * side * S]),
      [0.052, 0.046, 0.05, 0.064, 0.058, 0.08, 0.1].map((r) => r * S), { seg: Math.round(14 * detail), steps: Math.round(30 * detail), color: legCol(belly) });
    const hl = tube([[-0.69, 0.04, 0.16], [-0.7, 0.18, 0.16], [-0.73, 0.34, 0.165], [-0.78, 0.47, 0.17], [-0.74, 0.58, 0.168], [-0.68, 0.72, 0.16], [-0.6, 0.98, 0.1]].map(([x, y, z]) => [x * S, y * S, z * side * S]),
      [0.052, 0.046, 0.05, 0.07, 0.085, 0.11, 0.13].map((r) => r * S), { seg: Math.round(14 * detail), steps: Math.round(30 * detail), color: legCol(belly) });
    // split hooves: two glossy toes, and the dewclaws behind
    const hoofMat = new THREE.MeshPhysicalMaterial({ color: '#1b1714', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.4 });
    for (const lx of [0.5, -0.69]) {
      for (const toe of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, lo ? 8 : 14, lo ? 6 : 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.25, 1.2, 0.55), hoofMat);
        h.position.set((lx + 0.02) * S, 0.0, (0.16 * side + toe * 0.023) * S);
        h.castShadow = true;
        cow.add(h);
      }
      for (const toe of [-1, 1]) {
        const dc = new THREE.Mesh(new THREE.SphereGeometry(0.013 * S, 6, 4), hoofMat);
        dc.position.set((lx - 0.045) * S, 0.1 * S, (0.16 * side + toe * 0.02) * S);
        cow.add(dc);
      }
    }
    for (const g of [fl, hl]) {
      const m = new THREE.Mesh(g, fur);
      m.castShadow = true;
      cow.add(m);
      legs.push(m);
    }
    // dew claws and the split hoof suggested with a dark ring
  }

  // ---- udder and teats
  const udder = new THREE.Mesh(new THREE.SphereGeometry(0.17 * S, 16, 12).scale(1.2, 0.8, 1), new THREE.MeshStandardMaterial({ color: breed === 'eringer' ? '#4a3a33' : '#c9a596', roughness: 0.7 }));
  udder.position.set(-0.45 * S, 0.62 * S, 0);
  cow.add(udder);
  for (const [dx, dz] of [[0.07, 0.07], [0.07, -0.07], [-0.07, 0.07], [-0.07, -0.07]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * S, 0.014 * S, 0.07 * S, 6), udder.material);
    t.position.set(-0.45 * S + dx * S, 0.5 * S, dz * S);
    cow.add(t);
  }

  // ---- eyes, nostrils, ears, horns (on the head pivot)
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#160d09', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  // the wet, dark nose pad and the line of the mouth
  const nosePad = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, lo ? 10 : 24, lo ? 8 : 16).scale(0.42, 0.62, 1.0),
    new THREE.MeshPhysicalMaterial({ color: B.nose, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
  nosePad.position.copy(H(1.6, 0.96, 0));
  head.add(nosePad);
  const mouthLine = tube([H(1.57, 0.895, -0.08), H(1.63, 0.9, 0), H(1.57, 0.895, 0.08)], [0.006 * S, 0.007 * S, 0.006 * S], { seg: 6, steps: 10 });
  head.add(new THREE.Mesh(mouthLine, new THREE.MeshStandardMaterial({ color: '#120d0b', roughness: 0.6 })));
  if (breed === 'eringer') {
    // the Eringer's curly forelock between the horns
    for (let k = 0; k < (lo ? 6 : 16); k++) {
      const a = k * 2.399, r = 0.035 + (k % 4) * 0.012;
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.022 * S, 8, 6), fur);
      curl.geometry = tint(curl.geometry, B.coat);
      curl.position.copy(H(1.12 + Math.sin(a) * r * 0.6, 1.36 + Math.cos(a) * r * 0.25, Math.cos(a) * r));
      head.add(curl);
    }
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03 * S, 12, 8), eyeMat);
    eye.position.copy(H(1.27, 1.22, 0.14 * side));
    head.add(eye);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.034 * S, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), fur);
    lid.geometry = tint(lid.geometry, B.coat);
    lid.position.copy(eye.position); lid.rotation.z = -0.3;
    head.add(lid);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.02 * S, 10, 8).scale(0.5, 1.15, 0.8), new THREE.MeshStandardMaterial({ color: '#080605', roughness: 0.9 }));
    nostril.position.copy(H(1.638, 0.965, 0.042 * side));
    nostril.rotation.x = side * 0.5;
    head.add(nostril);
    // ears: a cupped leaf with a pink lining, sticking out under the horns
    const earG = new THREE.SphereGeometry(0.12 * S, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(0.42, 0.22, 1.0);
    const ear = new THREE.Mesh(tint(earG, B.coat), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    ear.position.copy(H(1.1, 1.25, 0.27 * side));
    ear.rotation.set(side * 0.3, 0, side * -0.2);
    head.add(ear);
    const lining = new THREE.Mesh(new THREE.SphereGeometry(0.075 * S, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.35, 0.12, 0.85), new THREE.MeshStandardMaterial({ color: '#c9928a', roughness: 0.8 }));
    lining.position.copy(ear.position).add(new THREE.Vector3(0.01, 0.012, 0));
    lining.rotation.copy(ear.rotation);
    head.add(lining);
    // horns: the Eringer's lyre sweeps out, forward and up; Brown Swiss short and curved
    const hornPts = B.horns === 'lyre'
      ? [[1.12, 1.32, 0.12], [1.11, 1.36, 0.25], [1.16, 1.44, 0.34], [1.26, 1.53, 0.33], [1.33, 1.6, 0.26]]
      : [[1.12, 1.32, 0.12], [1.12, 1.35, 0.22], [1.17, 1.41, 0.27], [1.23, 1.46, 0.25]];
    const horn = tube(hornPts.map(([x, y, z]) => H(x, y, z * side)), [0.045, 0.038, 0.028, 0.018, 0.008].slice(0, hornPts.length).map((r) => r * S),
      { seg: 10, steps: 24, color: (t, u, out) => out.copy(new THREE.Color(B.horn)).lerp(new THREE.Color(B.tip), Math.max(0, (t - 0.7) / 0.3)) });
    const hm = new THREE.Mesh(horn, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }));
    hm.castShadow = true;
    head.add(hm);
  }

  // ---- tail with its switch
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-1.0 * S, 1.17 * S, 0);
  cow.add(tailPivot);
  const tailG = tube([[0, 0, 0], [-0.06, -0.12, 0], [-0.08, -0.4, 0], [-0.06, -0.62, 0]].map(([x, y, z]) => [x * S, y * S, z * S]), [0.035, 0.025, 0.02, 0.018].map((r) => r * S),
    { seg: 8, steps: 18, color: (t, u, out) => out.copy(coat) });
  tailPivot.add(new THREE.Mesh(tailG, fur));
  // the switch: a brush of long dark hairs
  const hairMat = new THREE.MeshStandardMaterial({ color: '#15100d', roughness: 0.9 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.045 * S, 10, 8).scale(0.8, 1.8, 0.8), hairMat);
  core.position.set(-0.06 * S, -0.7 * S, 0);
  tailPivot.add(core);
  for (let k = 0; k < (lo ? 0 : 26); k++) {
    const a = k * 2.399, r = 0.012 + (k % 5) * 0.006;
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.012 * S, (0.2 + (k % 3) * 0.05) * S, 4).translate(0, -(0.1 + (k % 3) * 0.025) * S, 0), hairMat);
    strand.position.set((-0.06 + Math.cos(a) * r) * S, -0.64 * S, Math.sin(a) * r * S);
    strand.rotation.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
    tailPivot.add(strand);
  }

  // ---- an ordinary bell on a plain strap, for every cow
  const neck = new THREE.Group();
  neck.position.set(0.84 * S, 1.07 * S, 0);
  cow.add(neck);
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a043', metalness: 0.85, roughness: 0.32 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#b07a35', metalness: 0.9, roughness: 0.3 });

  // the strap: an oval band round the neck
  const strapRing = (wide, map, color) => {
    // an open band round the neck (axis along x), tipped so it hangs lower at the front
    const g = new THREE.CylinderGeometry(1, 1, wide, 48, 1, true).rotateZ(Math.PI / 2).scale(1, 0.3 * S, 0.19 * S);
    const band = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, map, roughness: 0.6, side: THREE.DoubleSide }));
    if (map) band.material.userData.bakeColor = '#a8232a';
    band.rotation.z = 0.35;
    return band;
  };

  let bell;
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0.1 * S, -0.29 * S, 0);
  neck.add(bellPivot);
  if (!dressed) {
    neck.add(strapRing(0.05 * S, null, '#3b2a20'));
    bell = new THREE.Mesh(bellGeometry(0.2 * S).scale(0.6, 1, 0.6), bronze);
    bell.position.y = -0.2 * S;
    bellPivot.add(bell);
  } else {
    // ---- dressed for the Alpabzug
    neck.add(strapRing(0.14 * S, strapTexture(), '#ffffff'));
    // the buckle and a brass boss with an edelweiss on it

    // the big bell (a bronze Glocke, half a metre across at the lip)
    bell = new THREE.Mesh(bellGeometry(0.42 * S), bronze);
    bell.position.y = -0.46 * S;
    bell.castShadow = true;
    bellPivot.add(bell);
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 10, 8), new THREE.MeshStandardMaterial({ color: '#3a3532', metalness: 0.6, roughness: 0.5 }));
    clapper.position.y = -0.36 * S;
    bellPivot.add(clapper);
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.06 * S, 0.018 * S, 8, 16, Math.PI), brass);
    yoke.position.y = -0.03 * S; yoke.rotation.z = Math.PI;
    bellPivot.add(yoke);
    // an embroidered heart on the bell's crown
    const heart = new THREE.Mesh(new THREE.CircleGeometry(0.08 * S, 24), new THREE.MeshStandardMaterial({
      map: canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#b07a35'; x.fillRect(0, 0, w, h); drawEdelweiss(x, 32, 32, 26, 8); }), roughness: 0.5, metalness: 0.4,
    }));
    heart.position.set(0.18 * S, -0.23 * S, 0); heart.rotation.y = Math.PI / 2;
    bellPivot.add(heart);

    // the crown: a dome of fir with paper roses between the horns and down the forehead
    const crown = new THREE.Group();
    crown.position.copy(H(1.14, 1.4, 0));
    head.add(crown);
    const fir = new THREE.MeshStandardMaterial({ color: '#2f5a2c', roughness: 0.9 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17 * S, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.1, 1.0, 1.25), fir);
    crown.add(dome);
    // fir sprigs bristling out of the dome
    for (let k = 0; k < (lo ? 10 : 26); k++) {
      const a = k * 2.399, up = 0.15 + (k % 5) * 0.16;
      const sprig = new THREE.Mesh(new THREE.ConeGeometry(0.03 * S, 0.16 * S, 5), fir);
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
      sprig.position.copy(dir).multiplyScalar(0.17 * S);
      sprig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      crown.add(sprig);
    }
    const PAPER = ['#d6202c', '#f4f0e6', '#e86aa4', '#f2c230', '#3f73d0', '#d6202c', '#f08a24', '#ffffff'];
    for (let k = 0; k < (lo ? 12 : 22); k++) {
      const a = k * 2.399, up = 0.25 + ((k * 7) % 11) / 11 * 1.1;
      const r = paperRose(PAPER[k % PAPER.length], (0.06 + (k % 3) * 0.012) * S * (lo ? 1.25 : 1), lo);
      const dir = new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up) * 1.15);
      r.position.copy(dir).multiplyScalar(0.19 * S);
      r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      crown.add(r);
    }
    // the tall centrepiece: a little fir tree hung with a heart
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.07 * S, 0.34 * S, 8), fir);
    tree.position.y = 0.32 * S;
    crown.add(tree);
    const topHeart = new THREE.Mesh(new THREE.SphereGeometry(0.035 * S, 10, 8), new THREE.MeshStandardMaterial({ color: '#d6202c', roughness: 0.5 }));
    topHeart.position.y = 0.5 * S;
    crown.add(topHeart);
    // garlands of little flowers spiralling round each horn
    for (const side of [-1, 1]) {
      const hornPts = B.horns === 'lyre'
        ? [[1.12, 1.32, 0.12], [1.11, 1.36, 0.25], [1.16, 1.44, 0.34], [1.26, 1.53, 0.33], [1.33, 1.6, 0.26]]
        : [[1.12, 1.32, 0.12], [1.12, 1.35, 0.22], [1.17, 1.41, 0.27], [1.23, 1.46, 0.25]];
      const curve = new THREE.CatmullRomCurve3(hornPts.map(([x, y, z]) => H(x, y, z * side)));
      for (let k = 0; k < (lo ? 4 : 9); k++) {
        const p = curve.getPointAt(0.08 + k * (lo ? 0.2 : 0.09));
        const f = paperRose(PAPER[(k + (side > 0 ? 3 : 0)) % PAPER.length], 0.03 * S * (lo ? 1.4 : 1), lo);
        f.position.copy(p).add(new THREE.Vector3(0, 0.03 * S, 0));
        head.add(f);
      }
    }
    // ribbons streaming down both sides of the face
    const RIB = ['#d6202c', '#ffffff', '#2f8f3e', '#f2c230', '#3f73d0'];
    const ribbons = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const g = new THREE.PlaneGeometry(0.035 * S, 0.55 * S, 1, 8).translate(0, -0.275 * S, 0);
        const rb = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: RIB[(k + (side > 0 ? 2 : 0)) % RIB.length], roughness: 0.6, side: THREE.DoubleSide }));
        rb.position.copy(H(1.1 + k * 0.02, 1.36, (0.2 + k * 0.025) * side));
        rb.rotation.y = Math.PI / 2;
        head.add(rb);
        ribbons.push({ m: rb, base: g.attributes.position.array.slice(), k, side });
      }
    }
    cow.userData.ribbons = ribbons;
  }

  cow.userData.parts = { head, tailPivot, bellPivot, legs };
  cow.userData.breed = breed;
  cow.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---- idle life: chewing nod, tail swish, ear flick, bell swing, ribbons in the breeze
  cow.userData.animate = (t, speak) => {
    head.rotation.z = Math.sin(t * 1.4) * 0.025 + Math.sin(t * 0.31) * 0.04;
    head.rotation.y = Math.sin(t * 0.23) * 0.08;
    tailPivot.rotation.x = Math.sin(t * 1.9) * 0.35 * (0.5 + 0.5 * Math.sin(t * 0.37));
    tailPivot.rotation.z = -0.08 + Math.sin(t * 1.3) * 0.06;
    bellPivot.rotation.x = Math.sin(t * 2.3) * 0.12 + (speak || 0) * Math.sin(t * 9) * 0.2;
    bellPivot.rotation.z = Math.sin(t * 1.7) * 0.05;
    for (const r of cow.userData.ribbons || []) {
      const pa = r.m.geometry.attributes.position, b = r.base;
      for (let i = 0; i < pa.count; i++) {
        const y = b[i * 3 + 1];
        pa.setZ(i, b[i * 3 + 2] + Math.sin(t * 3 + y * 12 + r.k) * 0.03 * Math.abs(y) / (0.55 * S) * S);
      }
      pa.needsUpdate = true;
    }
  };
  return cow;
}
