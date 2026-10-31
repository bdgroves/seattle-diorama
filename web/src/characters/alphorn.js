// An alphorn player in Swiss Sunday dress: the blue edelweiss shirt, a red
// embroidered vest with brass buttons, black knee breeches, white stockings
// and buckled shoes, a black felt hat with an edelweiss, a grey beard, and a
// 3.5 m spruce alphorn wrapped in rattan with a painted bell.
//
// Units are metres; he faces +x, the horn runs out along +x to its bell.
import * as THREE from 'three';
import { loft, tube, canvasTex, drawEdelweiss } from './geo.js';

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
  const shirtMat = new THREE.MeshStandardMaterial({ map: shirtTexture(), roughness: 0.85 });
  const vestMat = new THREE.MeshStandardMaterial({ map: vestTexture(), roughness: 0.8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: '#1c1b1f', roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: '#d0a646', metalness: 0.85, roughness: 0.3 });
  const greyHair = new THREE.MeshStandardMaterial({ color: '#8e8a84', roughness: 0.95 });
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

  // ---- legs: black knee breeches, white stockings, buckled shoes
  for (const side of [-1, 1]) {
    const z = 0.1 * side;
    const thigh = tube([[0.0, 0.95, z], [0.01, 0.7, z], [0.0, 0.47, z]], [0.085, 0.075, 0.062], { seg: 14, steps: 12 });
    man.add(Object.assign(new THREE.Mesh(thigh, blackMat), { castShadow: true }));
    const shin = tube([[0.0, 0.48, z], [-0.01, 0.3, z], [0.0, 0.08, z]], [0.058, 0.055, 0.042], { seg: 14, steps: 12 });
    man.add(Object.assign(new THREE.Mesh(shin, whiteMat), { castShadow: true }));
    // the knee band with its little brass buckle
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 16).rotateX(Math.PI / 2), blackMat);
    band.position.set(0, 0.47, z);
    man.add(band);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.03), brass);
    kb.position.set(0.0, 0.47, z + 0.065 * side);
    man.add(kb);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10).scale(1.9, 0.75, 0.95), blackMat);
    shoe.position.set(0.06, 0.045, z);
    man.add(shoe);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.05), new THREE.MeshStandardMaterial({ color: '#d9dcdf', metalness: 0.9, roughness: 0.25 }));
    buckle.position.set(0.15, 0.07, z);
    man.add(buckle);
  }

  // ---- hips (breeches) and the shirt torso
  man.add(upright([
    { x: 0.86, w: 0.34, h: 0.22, f: 0 }, { x: 0.95, w: 0.36, h: 0.24, f: 0.0 }, { x: 1.04, w: 0.34, h: 0.24, f: 0.01 },
  ], blackMat));
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
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18).scale(1.0, 1.15, 0.9), skinMat);
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(1.2, 1.3, 0.9), skinMat);
  nose.position.set(0.105, -0.005, 0);
  head.add(nose);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8).scale(0.5, 1.2, 0.5), skinMat);
    ear.position.set(0.0, 0.0, 0.095 * side);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.2 }));
    eye.position.set(0.09, 0.03, 0.035 * side);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.035), greyHair);
    brow.position.set(0.097, 0.052, 0.036 * side);
    head.add(brow);
  }
  // a gold earring in the right ear, the herdsman's tradition
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 6, 12), brass);
  ring.position.set(0.0, -0.035, -0.1);
  head.add(ring);
  // grey beard and moustache, and the cheeks that puff when he blows
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(1.05, 1.1, 1.05), greyHair);
  beard.position.set(0.02, -0.02, 0);
  head.add(beard);
  const tache = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6).scale(0.6, 0.45, 1.6), greyHair);
  tache.position.set(0.1, -0.045, 0);
  head.add(tache);
  const cheeks = [];
  for (const side of [-1, 1]) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skinMat);
    ch.position.set(0.078, -0.03, 0.048 * side);
    head.add(ch);
    cheeks.push(ch);
  }
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
  const leftGrip = onHorn(0.045).add(new THREE.Vector3(0, -0.005, 0.03));
  const rightGrip = onHorn(0.12).add(new THREE.Vector3(0, -0.01, -0.03));
  const arm = (shoulder, elbow, hand) => {
    const upper = tube([shoulder, shoulder.clone().lerp(elbow, 0.5).add(new THREE.Vector3(0, 0, 0)), elbow], [0.06, 0.068, 0.05], { seg: 14, steps: 14 });
    man.add(Object.assign(new THREE.Mesh(upper, shirtMat), { castShadow: true }));
    const fore = tube([elbow, elbow.clone().lerp(hand, 0.5), hand], [0.05, 0.048, 0.035], { seg: 14, steps: 14 });
    man.add(Object.assign(new THREE.Mesh(fore, shirtMat), { castShadow: true }));
    const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), whiteMat);
    cuff.position.copy(hand.clone().lerp(elbow, 0.06));
    man.add(cuff);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10).scale(1.1, 0.9, 1), skinMat);
    fist.position.copy(hand);
    man.add(fist);
  };
  arm(new THREE.Vector3(0.0, 1.47, 0.18), new THREE.Vector3(0.06, 1.28, 0.25), leftGrip);
  arm(new THREE.Vector3(0.0, 1.47, -0.18), new THREE.Vector3(0.18, 1.23, -0.24), rightGrip);

  man.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  man.userData.mouth = mouth;
  man.userData.bellTip = pts[pts.length - 1];
  man.userData.animate = (t, blowing) => {
    const b = blowing || 0;
    // breathe; puff the cheeks and lean into the note while he plays
    torso.scale.set(1, 1, 1 + Math.sin(t * 1.2) * 0.01);
    for (const ch of cheeks) ch.scale.setScalar(1 + b * 0.7);
    head.rotation.z = -0.12 - b * 0.03;
  };
  return man;
}
