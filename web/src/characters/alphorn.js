// An alphorn player in Swiss Sunday dress: the blue edelweiss shirt, a red
// embroidered vest with brass buttons, black knee breeches, white stockings
// and buckled shoes, a black felt hat with an edelweiss, a grey beard, and a
// 3.5 m spruce alphorn wrapped in rattan with a painted bell.
//
// Units are metres; he faces +x, the horn runs out along +x to its bell.
import * as THREE from 'three';
import { loft, tube, canvasTex, drawEdelweiss, furNormal, weaveNormal, knitNormal } from './geo.js';

const SKIN = '#e2b494';

function shirtTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#2b5a9e'; x.fillRect(0, 0, w, h);
    // the faint woven check under the print
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2;
    for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      drawEdelweiss(x, col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 16, 7);
    }
  }, [3, 3]);
}

function vestTexture() {
  // red wool, gold-embroidered borders and a little alpine flower garden on each front
  return canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#a41d22'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d9b24a';
    x.fillRect(0, 0, w, 6); x.fillRect(0, h - 10, w, 10);
    for (const cx of [w * 0.2, w * 0.8]) {
      // a sprig: stems and flowers in gold, white and pink
      x.strokeStyle = '#d9b24a'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(cx, h * 0.85); x.quadraticCurveTo(cx - 30, h * 0.55, cx - 10, h * 0.3); x.stroke();
      x.beginPath(); x.moveTo(cx, h * 0.85); x.quadraticCurveTo(cx + 30, h * 0.5, cx + 18, h * 0.25); x.stroke();
      drawEdelweiss(x, cx - 10, h * 0.28, 18, 8);
      x.fillStyle = '#f2a2c0'; x.beginPath(); x.arc(cx + 18, h * 0.24, 10, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#3f6fd0'; x.beginPath(); x.arc(cx + 4, h * 0.5, 8, 0, Math.PI * 2); x.fill();    // gentian
    }
  });
}

function hornTexture() {
  // spruce grain along the length, rattan wraps, and a painted bell at the far end
  return canvasTex(128, 2048, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#b77a46'); g.addColorStop(0.5, '#cf9563'); g.addColorStop(1, '#b77a46');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(110,62,28,0.35)';
    for (let i = 0; i < 40; i++) {
      x.lineWidth = 1 + (i % 3);
      const xx = (i * 37) % w;
      x.beginPath(); x.moveTo(xx, 0);
      for (let y = 0; y < h; y += 64) x.lineTo(xx + Math.sin(y * 0.01 + i) * 3, y);
      x.stroke();
    }
    // rattan (peddig) wraps: bands of tight dark windings
    for (const v of [0.08, 0.2, 0.33, 0.47, 0.6, 0.72, 0.8]) {
      const y = v * h;
      x.fillStyle = '#5a3a1c'; x.fillRect(0, y - 14, w, 28);
      x.strokeStyle = 'rgba(255,230,180,0.25)'; x.lineWidth = 1;
      for (let k = -12; k < 14; k += 3) { x.beginPath(); x.moveTo(0, y + k); x.lineTo(w, y + k + 2); x.stroke(); }
    }
    // the painted bell: dark green ground, edelweiss and red alpine roses
    const y0 = 0.86 * h;
    x.fillStyle = '#1f3d2a'; x.fillRect(0, y0, w, h - y0);
    x.fillStyle = '#d9b24a'; x.fillRect(0, y0, w, 6); x.fillRect(0, h - 8, w, 8);
    for (let k = 0; k < 6; k++) {
      drawEdelweiss(x, 20 + (k % 2) * 60, y0 + 30 + k * 40, 13, 7);
      x.fillStyle = '#d6202c'; x.beginPath(); x.arc(70 - (k % 2) * 50, y0 + 50 + k * 40, 8, 0, Math.PI * 2); x.fill();
    }
  });
}

export function buildAlphornist({ detail = 1 } = {}) {
  const man = new THREE.Group();
  const seg = Math.round(24 * detail);
  const shirtMat = new THREE.MeshStandardMaterial({ map: shirtTexture(), roughness: 0.85, normalMap: weaveNormal(), normalScale: new THREE.Vector2(0.35, 0.35) });
  const vestMat = new THREE.MeshStandardMaterial({ map: vestTexture(), roughness: 0.8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: '#1c1b1f', roughness: 0.7 });
  const skinMat = new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffb8a0'), sheenRoughness: 0.6 });
  const lipMat = new THREE.MeshPhysicalMaterial({ color: '#c98b7a', roughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color('#ffc0b0') });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.85, normalMap: knitNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
  const cuffMat = new THREE.MeshStandardMaterial({ color: '#f6f3ec', roughness: 0.8 });
  const velvet = new THREE.MeshPhysicalMaterial({ color: '#1d1b20', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#5d5866'), sheenRoughness: 0.35 });
  const leather = new THREE.MeshPhysicalMaterial({ color: '#141315', roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const silver = new THREE.MeshStandardMaterial({ color: '#d9dcdf', metalness: 0.9, roughness: 0.22 });
  const brass = new THREE.MeshStandardMaterial({ color: '#d0a646', metalness: 0.85, roughness: 0.3 });
  const greyHair = new THREE.MeshStandardMaterial({ color: '#9a958e', roughness: 0.95, normalMap: furNormal(), normalScale: new THREE.Vector2(1.2, 1.2) });
  shirtMat.userData.bakeColor = '#3a68ac';
  vestMat.userData.bakeColor = '#a41d22';

  // a body lofted up the y axis: write sections along x (height), then stand it up
  const upright = (secs, mat, opts = {}) => {
    const g = loft(secs.map((s) => ({ ...s, y: -(s.f || 0) })), { seg, sub: 3, ...opts });
    g.rotateZ(Math.PI / 2);            // x (height) -> y, section y -> -x
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  };

  // ---- legs: velvet knee breeches, knitted white stockings, buckled shoes
  for (const side of [-1, 1]) {
    const z = 0.1 * side;
    const thigh = tube([[0.0, 0.97, z], [0.012, 0.82, z], [0.012, 0.66, z], [0.0, 0.5, z], [-0.002, 0.45, z]], [0.092, 0.088, 0.078, 0.064, 0.06], { seg: 18, steps: 20 });
    man.add(new THREE.Mesh(thigh, velvet));
    const shin = tube([[-0.002, 0.47, z], [-0.012, 0.36, z], [-0.006, 0.22, z], [0.0, 0.1, z], [0.005, 0.06, z]], [0.054, 0.06, 0.048, 0.038, 0.036], { seg: 18, steps: 20 });
    man.add(new THREE.Mesh(shin, whiteMat));
    // the knee band with its little brass buckle
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.011, 8, 20).rotateX(Math.PI / 2), velvet);
    band.position.set(0, 0.455, z);
    man.add(band);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.026), brass);
    kb.position.set(0.0, 0.455, z + 0.066 * side);
    man.add(kb);
    // the shoe: lofted heel to toe, a sole and a low heel, a silver buckle on the tongue
    const shoeG = loft([
      { x: -0.07, y: 0.045, w: 0.07, h: 0.07, p: 2.4 }, { x: -0.03, y: 0.05, w: 0.088, h: 0.09, p: 2.6, top: 0.3 },
      { x: 0.04, y: 0.045, w: 0.095, h: 0.08, p: 2.6, top: 0.6 }, { x: 0.12, y: 0.035, w: 0.092, h: 0.06, p: 2.4, top: 0.8 },
      { x: 0.17, y: 0.03, w: 0.07, h: 0.045, p: 2.2 }, { x: 0.19, y: 0.028, w: 0.03, h: 0.025, p: 2 },
    ], { seg: 20, sub: 3 });
    const shoe = new THREE.Mesh(shoeG, leather);
    shoe.position.z = z;
    man.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.014, 0.09), new THREE.MeshStandardMaterial({ color: '#2b2522', roughness: 0.9 }));
    sole.position.set(0.06, 0.007, z);
    man.add(sole);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.07), sole.material);
    heel.position.set(-0.04, 0.012, z);
    man.add(heel);
    const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 4).rotateY(Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.8, 1.3), silver);
    buckle.position.set(0.07, 0.085, z);
    buckle.rotation.z = -0.5;
    man.add(buckle);
  }

  // ---- hips (breeches) and the shirt torso
  man.add(upright([
    { x: 0.86, w: 0.34, h: 0.22, f: 0 }, { x: 0.95, w: 0.36, h: 0.24, f: 0.0 }, { x: 1.04, w: 0.34, h: 0.24, f: 0.01 },
  ], velvet));
  const torso = upright([
    { x: 1.0, w: 0.33, h: 0.24, f: 0.01 }, { x: 1.12, w: 0.33, h: 0.25, f: 0.02 }, { x: 1.28, w: 0.37, h: 0.26, f: 0.01 },
    { x: 1.4, w: 0.4, h: 0.25, f: 0 }, { x: 1.48, w: 0.39, h: 0.22, f: -0.005, p: 2.4 }, { x: 1.54, w: 0.27, h: 0.17, f: 0 },
    { x: 1.58, w: 0.13, h: 0.13, f: 0 }, { x: 1.63, w: 0.115, h: 0.115, f: 0 },
  ], shirtMat);
  man.add(torso);
  // the vest, a hair bigger than the shirt, stopping below the shoulders; brass buttons down the front
  man.add(upright([
    { x: 0.98, w: 0.355, h: 0.265, f: 0.01 }, { x: 1.12, w: 0.355, h: 0.27, f: 0.02 }, { x: 1.28, w: 0.39, h: 0.28, f: 0.01 },
    { x: 1.4, w: 0.415, h: 0.27, f: 0 }, { x: 1.47, w: 0.405, h: 0.235, f: -0.005 },
  ], vestMat, { capStart: false, capEnd: false }));
  for (let k = 0; k < 5; k++) {
    for (const zz of [-0.035, 0.035]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), brass);
      b.position.set(0.14 + (k === 0 ? 0.005 : 0), 1.05 + k * 0.085, zz);
      man.add(b);
    }
  }
  // a silver watch chain across the vest
  const chain = tube([[0.135, 1.2, -0.09], [0.15, 1.16, 0], [0.135, 1.2, 0.09]], [0.004, 0.004, 0.004], { seg: 6, steps: 12 });
  man.add(new THREE.Mesh(chain, new THREE.MeshStandardMaterial({ color: '#dfe2e5', metalness: 0.9, roughness: 0.2 })));

  // ---- the head, tilted down a touch to the mouthpiece
  const head = new THREE.Group();
  head.position.set(0.02, 1.74, 0);
  head.rotation.z = -0.12;
  man.add(head);
  // the head lofted from chin to crown, the face forward (+x)
  const skullG = loft([
    { x: -0.128, w: 0.05, h: 0.05, f: 0.035 }, { x: -0.11, w: 0.095, h: 0.1, f: 0.03 }, { x: -0.07, w: 0.128, h: 0.15, f: 0.018 },
    { x: -0.03, w: 0.142, h: 0.18, f: 0.006 }, { x: 0.02, w: 0.152, h: 0.2, f: 0.0 }, { x: 0.065, w: 0.15, h: 0.205, f: -0.006 },
    { x: 0.1, w: 0.135, h: 0.185, f: -0.012 }, { x: 0.125, w: 0.095, h: 0.13, f: -0.014 }, { x: 0.138, w: 0.03, h: 0.04, f: -0.014 },
  ].map((q) => ({ ...q, y: -(q.f || 0) })), { seg: 28, sub: 3 });
  skullG.rotateZ(Math.PI / 2);
  const skull = new THREE.Mesh(skullG, skinMat);
  head.add(skull);
  // the nose: a bridge down to a rounded tip, with nostril wings
  const nose = new THREE.Mesh(tube([[0.088, 0.04, 0], [0.104, 0.012, 0], [0.114, -0.012, 0]], [0.011, 0.014, 0.019], { seg: 14, steps: 12 }), skinMat);
  head.add(nose);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), skinMat);
    wing.position.set(0.103, -0.017, 0.013 * side);
    head.add(wing);
    // ears: a curled rim around a hollow
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 8, 16, Math.PI * 1.6).scale(0.75, 1.3, 1).rotateZ(Math.PI * 0.6), skinMat);
    ear.position.set(-0.005, 0.0, 0.077 * side);
    head.add(ear);
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).scale(0.6, 1, 0.5), skinMat);
    lobe.position.set(0.0, -0.028, 0.078 * side);
    head.add(lobe);
    // eyes: white, a blue-grey iris, a black pupil, and a heavy lid as he squints into the note
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#f1ece4', roughness: 0.2, clearcoat: 1 }));
    white.position.set(0.075, 0.026, 0.033 * side);
    head.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 12, 8), new THREE.MeshPhysicalMaterial({ color: '#4f6f86', roughness: 0.15, clearcoat: 1 }));
    iris.position.set(0.084, 0.025, 0.031 * side);
    head.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 8, 6), new THREE.MeshStandardMaterial({ color: '#0b0a0a', roughness: 0.1 }));
    pupil.position.set(0.0905, 0.025, 0.0305 * side);
    head.add(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), skinMat);
    lid.position.copy(white.position); lid.rotation.z = -0.55;
    head.add(lid);
    // bushy grey eyebrows
    const brow = new THREE.Mesh(tube([[0.088, 0.044, 0.016 * side], [0.093, 0.05, 0.034 * side], [0.085, 0.046, 0.052 * side]], [0.006, 0.008, 0.005], { seg: 8, steps: 10 }), greyHair);
    head.add(brow);
  }
  // a gold earring in the right ear, the herdsman's tradition
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0022, 8, 14), brass);
  ring.position.set(0.0, -0.04, -0.082);
  head.add(ring);
  // lips pursed on the mouthpiece
  const lips = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0065, 10, 18).rotateY(Math.PI / 2), lipMat);
  lips.position.set(0.1, -0.05, 0);
  head.add(lips);
  // full grey beard round the jaw, and a moustache that droops over the lips
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.083, 24, 16, Math.PI * 0.45, Math.PI * 1.1, Math.PI * 0.42, Math.PI * 0.5).scale(1.12, 1.12, 1.0), greyHair);
  beard.position.set(0.012, -0.03, 0);
  head.add(beard);
  for (const side of [-1, 1]) {
    const tache = new THREE.Mesh(tube([[0.106, -0.034, 0.003 * side], [0.104, -0.04, 0.022 * side], [0.093, -0.058, 0.034 * side]], [0.008, 0.009, 0.004], { seg: 8, steps: 10 }), greyHair);
    head.add(tache);
  }
  const cheeks = [];
  for (const side of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), skinMat);
    ch.position.set(0.066, -0.026, 0.046 * side);
    head.add(ch);
    cheeks.push(ch);
  }
  // the neck and the stand-up shirt collar
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 18), skinMat);
  neckM.position.set(0.0, 1.62, 0);
  man.add(neckM);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.064, 0.04, 24, 1, true), shirtMat);
  collar.position.set(0.0, 1.6, 0);
  man.add(collar);
  // the black felt hat with a red band and an edelweiss
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 32), blackMat);
  brim.position.y = 0.095;
  head.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.12, 28), blackMat);
  crown.position.y = 0.16;
  head.add(crown);
  const hband = new THREE.Mesh(new THREE.CylinderGeometry(0.111, 0.112, 0.025, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#a41d22', roughness: 0.7 }));
  hband.position.y = 0.115;
  head.add(hband);
  const flower = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshStandardMaterial({
    map: canvasTex(64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); drawEdelweiss(x, 32, 32, 30, 8); }), transparent: true, side: THREE.DoubleSide,
  }));
  flower.position.set(0.0, 0.13, 0.113);
  head.add(flower);

  // ---- the alphorn, from his lips to the bell on the grass
  const mouth = new THREE.Vector3(0.12, 1.69, 0);
  const pts = [mouth, new THREE.Vector3(0.2, 1.66, 0), new THREE.Vector3(1.2, 1.24, 0), new THREE.Vector3(2.3, 0.78, 0),
    new THREE.Vector3(3.05, 0.42, 0), new THREE.Vector3(3.3, 0.27, 0), new THREE.Vector3(3.5, 0.3, 0), new THREE.Vector3(3.62, 0.44, 0)];
  const radii = [0.014, 0.016, 0.024, 0.032, 0.042, 0.06, 0.1, 0.17];
  const hornG = tube(pts, radii, { seg: Math.round(24 * detail), steps: Math.round(120 * detail), cap: false });
  const hornMap = hornTexture();
  hornMap.flipY = false;                 // the painted end belongs at the bell, not the mouthpiece
  const horn = new THREE.Mesh(hornG, new THREE.MeshStandardMaterial({ map: hornMap, roughness: 0.55, side: THREE.DoubleSide }));
  horn.material.userData.bakeColor = '#c48a55';
  horn.castShadow = true;
  man.add(horn);
  // the mouthpiece cup and the foot block under the bell
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.04, 14).rotateZ(Math.PI / 2 + 0.4), new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.5 }));
  cup.position.copy(mouth).add(new THREE.Vector3(0.0, 0.0, 0));
  man.add(cup);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.12), new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.8 }));
  foot.position.set(3.32, 0.1, 0);
  man.add(foot);

  // ---- arms: puffed edelweiss sleeves, both hands on the horn
  const hornCurve = new THREE.CatmullRomCurve3(pts);
  const onHorn = (u) => hornCurve.getPointAt(u);
  const hornAxis = (u) => hornCurve.getTangentAt(u).normalize();
  const hornR = (u) => 0.014 + (0.024 - 0.014) * Math.min(1, u / 0.3);
  // a hand wrapped round the horn: palm on one side, four fingers curling over, the thumb along it
  const hand = (u, side) => {
    const c = hornCurve.getPointAt(u), A = hornAxis(u), r = hornR(u);
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(A, A.y).normalize();     // straight down, square to the horn
    const across = new THREE.Vector3().crossVectors(A, down).normalize();
    const g = new THREE.Group();
    // palm: under and to the player's side of the horn
    const palmDir = down.clone().multiplyScalar(0.55).addScaledVector(across, side * 0.85).normalize();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12).scale(1.05, 0.62, 0.95), skinMat);
    palm.position.copy(c).addScaledVector(palmDir, r + 0.022);
    palm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), palmDir);
    g.add(palm);
    for (let f = 0; f < 4; f++) {
      const along = (f - 1.5) * 0.019;
      const len = [0.9, 1, 0.95, 0.75][f];
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const ang = (k / 4) * Math.PI * 1.25 * len;
        // start at the palm side and wrap over the top to the far side
        const dir = palmDir.clone().applyAxisAngle(A, -side * ang);
        pts.push(c.clone().addScaledVector(A, along).addScaledVector(dir, r + 0.011));
      }
      g.add(new THREE.Mesh(tube(pts, [0.0105, 0.01, 0.0095, 0.0088, 0.008], { seg: 10, steps: 14 }), skinMat));
    }
    // the thumb lies along the horn on the near side
    const tDir = palmDir.clone().applyAxisAngle(A, side * 0.9);
    const t0 = c.clone().addScaledVector(A, -0.035).addScaledVector(tDir, r + 0.02);
    const t1 = c.clone().addScaledVector(A, 0.015).addScaledVector(tDir, r + 0.011);
    g.add(new THREE.Mesh(tube([t0, t0.clone().lerp(t1, 0.5).addScaledVector(tDir, 0.004), t1], [0.012, 0.011, 0.009], { seg: 10, steps: 10 }), skinMat));
    man.add(g);
    // where the wrist meets the hand: back from the palm, toward the player
    return palm.position.clone().addScaledVector(A, -0.045).addScaledVector(palmDir, 0.01);
  };
  const arm = (shoulder, elbow, wrist) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 14), shirtMat);
    cap.position.copy(shoulder);
    man.add(cap);
    // a full, gathered shirt sleeve: puffed at the upper arm, narrowing to a white cuff
    const upper = tube([shoulder, shoulder.clone().lerp(elbow, 0.45).add(new THREE.Vector3(0, -0.01, 0)), elbow], [0.064, 0.078, 0.058], { seg: 18, steps: 18 });
    man.add(new THREE.Mesh(upper, shirtMat));
    const fore = tube([elbow, elbow.clone().lerp(wrist, 0.5), wrist], [0.058, 0.054, 0.04], { seg: 18, steps: 18 });
    man.add(new THREE.Mesh(fore, shirtMat));
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 14), shirtMat);
    joint.position.copy(elbow);
    man.add(joint);
    const dir = wrist.clone().sub(elbow).normalize();
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 18, 1, true), cuffMat);
    cuff.position.copy(wrist).addScaledVector(dir, -0.012);
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    man.add(cuff);
    const wristM = new THREE.Mesh(tube([wrist.clone().addScaledVector(dir, -0.01), wrist.clone().addScaledVector(dir, 0.03)], [0.03, 0.028], { seg: 12, steps: 4 }), skinMat);
    man.add(wristM);
  };
  const lw = hand(0.045, -1), rw = hand(0.12, 1);     // 'across' points to his right (-z)
  // (+z is his right.) The right hand steadies the horn under his lips, elbow lifted out to the side;
  // the left holds it lower down
  arm(new THREE.Vector3(0.0, 1.45, 0.19), new THREE.Vector3(0.12, 1.4, 0.31), lw);
  arm(new THREE.Vector3(0.0, 1.45, -0.19), new THREE.Vector3(0.2, 1.22, -0.27), rw);

  man.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  man.userData.mouth = mouth;
  man.userData.bellTip = pts[pts.length - 1];
  man.userData.animate = (t, blowing) => {
    const b = blowing || 0;
    // breathe; puff the cheeks and lean into the note while he plays
    torso.scale.set(1, 1, 1 + Math.sin(t * 1.2) * 0.01);
    for (const ch of cheeks) ch.scale.setScalar(1 + b * 0.9);
    head.rotation.z = -0.12 - b * 0.03;
  };
  return man;
}
