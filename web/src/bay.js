// Elliott Bay: rippling water and a Washington State Ferry crossing the slice
// of bay on the west edge of the diorama.
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

export function animateWater(material, uniforms) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uNight; varying vec3 vWPos;
        float wv(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wp = vWPos.xz;
        float w = wv(wp, vec2(0.8, 0.6), 0.09, 1.3) + wv(wp, vec2(-0.3, 0.95), 0.13, 1.7) + 0.6 * wv(wp, vec2(0.95, -0.2), 0.31, 2.3);
        diffuseColor.rgb *= 0.93 + 0.05 * w;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wn = vec3(
          0.10 * cos(dot(vWPos.xz, vec2(0.8, 0.6)) * 0.09 + uTime * 1.3) + 0.07 * cos(dot(vWPos.xz, vec2(0.95, -0.2)) * 0.31 + uTime * 2.3),
          0.0,
          0.10 * cos(dot(vWPos.xz, vec2(-0.3, 0.95)) * 0.13 + uTime * 1.7));
        normal = normalize(normal + (viewMatrix * vec4(wn, 0.0)).xyz);`);
  };
  material.needsUpdate = true;
}

// --- ferry ------------------------------------------------------------------
function paint(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.toNonIndexed();
}

function ferryGeometry() {
  // Jumbo-class double-ender, ~140 m. Long axis on +X.
  const L = 140, W = 27;
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-L / 2, 0);
  hullShape.quadraticCurveTo(-L / 2 - 6, W / 4, -L / 2 + 4, W / 2);
  hullShape.lineTo(L / 2 - 4, W / 2);
  hullShape.quadraticCurveTo(L / 2 + 6, W / 4, L / 2, 0);
  hullShape.quadraticCurveTo(L / 2 + 6, -W / 4, L / 2 - 4, -W / 2);
  hullShape.lineTo(-L / 2 + 4, -W / 2);
  hullShape.quadraticCurveTo(-L / 2 - 6, -W / 4, -L / 2, 0);
  const deck = (h, inset, hex, y) => {
    const s = new THREE.Shape(hullShape.getPoints(24).map((p) => new THREE.Vector2(p.x * (1 - inset / L * 2), p.y * (1 - inset / W * 2))));
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    return paint(g, hex);
  };
  const parts = [
    deck(3.0, 0, '#f4f2ec', 0),         // hull
    deck(1.2, 0.3, '#2f7a4f', 3.0),     // WSF green stripe
    deck(4.5, 1.2, '#f4f2ec', 4.2),     // car deck
    deck(4.0, 10, '#f6f4ef', 8.7),      // passenger deck
    deck(1.2, 10.5, '#3a4654', 12.7),   // window band
    deck(2.5, 30, '#f4f2ec', 13.9),     // wheelhouse level
  ];
  for (const sx of [-1, 1]) {           // twin wheelhouses, one at each end
    parts.push(paint(new THREE.BoxGeometry(8, 3.2, 14).translate(sx * 52, 18, 0), '#f4f2ec'));
    parts.push(paint(new THREE.BoxGeometry(8.2, 1.1, 14.2).translate(sx * 52, 18.7, 0), '#2c3640'));
  }
  parts.push(paint(new THREE.CylinderGeometry(2.4, 2.8, 7, 12).translate(-6, 19.8, 0), '#2f7a4f'));
  parts.push(paint(new THREE.CylinderGeometry(2.4, 2.8, 7, 12).translate(6, 19.8, 0), '#2f7a4f'));
  return BGU.mergeGeometries(parts);
}

function insideAny(x, y, polys) {
  for (const rings of polys) {
    let inside = false;
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i * 2], yi = ring[i * 2 + 1], xj = ring[j * 2], yj = ring[j * 2 + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

// Find a straight lane through the bay that stays on the water for its whole length.
function findLane(water, ext) {
  const [x0, y0, x1, y1] = ext;
  let best = null;
  for (let ang = -0.9; ang <= 0.9; ang += 0.15) {
    for (let fx = 0.02; fx < 0.5; fx += 0.02) {
      const cx = x0 + (x1 - x0) * fx, cy = (y0 + y1) / 2;
      const dx = Math.sin(ang), dy = Math.cos(ang);
      // grow the lane both ways while it stays on water (with ferry clearance)
      const ok = (s) => {
        const x = cx + dx * s, y = cy + dy * s;
        return x > x0 + 10 && x < x1 - 10 && y > y0 + 10 && y < y1 - 10 &&
          insideAny(x, y, water) && insideAny(x - dy * 22, y + dx * 22, water) && insideAny(x + dy * 22, y - dx * 22, water);
      };
      if (!ok(0)) continue;
      let a = 0, b = 0;
      while (ok(a - 10)) a -= 10;
      while (ok(b + 10)) b += 10;
      if (!best || b - a > best.len) best = { len: b - a, ax: cx + dx * a, ay: cy + dy * a, bx: cx + dx * b, by: cy + dy * b };
    }
  }
  return best && best.len > 260 ? best : null;
}

export function buildFerry(water, ext, uniforms) {
  const lane = findLane(water || [], ext);
  if (!lane) return null;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6,
    emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0 });
  const ship = new THREE.Mesh(ferryGeometry(), mat);
  ship.castShadow = true; ship.receiveShadow = true;
  // a soft foam wake behind the hull
  const wakeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(90, 18).rotateX(-Math.PI / 2), wakeMat);
  const group = new THREE.Group();
  group.add(ship, wake);
  const L = lane.len - 160, speed = 9;  // ~17 knots
  const heading = Math.atan2(lane.by - lane.ay, lane.bx - lane.ax);
  return {
    group,
    update(t) {
      const period = (2 * L) / speed + 30;
      const ph = t % period;
      const leg = (L / speed) + 15;
      let s, dir;
      if (ph < leg) { s = Math.min(1, ph / (L / speed)); dir = 1; } else { s = 1 - Math.min(1, (ph - leg) / (L / speed)); dir = -1; }
      const e = s * s * (3 - 2 * s);
      const k = 80 / lane.len + e * (L / lane.len);
      const x = lane.ax + (lane.bx - lane.ax) * k, y = lane.ay + (lane.by - lane.ay) * k;
      ship.position.set(x, 0.2 + Math.sin(t * 0.8) * 0.15, -y);
      ship.rotation.set(0, heading, Math.sin(t * 0.6) * 0.004);
      const moving = s > 0.001 && s < 0.999;
      wake.visible = moving;
      wake.position.set(x - Math.cos(heading) * dir * 105, 0.25, -(y - Math.sin(heading) * dir * 105));
      wake.rotation.y = heading;
      mat.emissiveIntensity = uniforms.uNight.value * 0.35;
    },
  };
}
