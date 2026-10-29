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
        diffuseColor.rgb *= 0.95 + 0.03 * w;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wn = vec3(
          0.035 * cos(dot(vWPos.xz, vec2(0.8, 0.6)) * 0.09 + uTime * 1.3) + 0.025 * cos(dot(vWPos.xz, vec2(0.95, -0.2)) * 0.31 + uTime * 2.3)
            + 0.02 * cos(dot(vWPos.xz, vec2(0.31, 0.95)) * 0.53 + uTime * 2.9),
          0.0,
          0.035 * cos(dot(vWPos.xz, vec2(-0.3, 0.95)) * 0.13 + uTime * 1.7) + 0.02 * cos(dot(vWPos.xz, vec2(-0.9, 0.4)) * 0.47 + uTime * 2.6));
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

// Jumbo Mark II-style double-ended ferry, ~140 m x 27 m. Long axis on +X.
// Returns { body, glass } geometries: glass gets its own material so the
// cabin windows can glow at night.
function ferryGeometry() {
  const L = 140, W = 27;
  // plan shape: straight sides, tapered rounded ends (identical at both ends)
  const plan = (inset) => {
    const l = L / 2 - inset, w = W / 2 - inset, taper = 20;
    const s = new THREE.Shape();
    s.moveTo(-l + taper, -w);
    s.lineTo(l - taper, -w);
    s.bezierCurveTo(l - 6, -w, l, -w * 0.55, l, 0);
    s.bezierCurveTo(l, w * 0.55, l - 6, w, l - taper, w);
    s.lineTo(-l + taper, w);
    s.bezierCurveTo(-l + 6, w, -l, w * 0.55, -l, 0);
    s.bezierCurveTo(-l, -w * 0.55, -l + 6, -w, -l + taper, -w);
    return s;
  };
  const slab = (inset, y0, y1, hex) => {
    const g = new THREE.ExtrudeGeometry(plan(inset), { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
    return paint(g, hex);
  };
  const box = (sx, sy, sz, x, y, z, hex) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex);
  const WHITE = '#f3f2ee', GREEN = '#1f6b45', DARK = '#26303a', DECK = '#9aa19c';
  const body = [], glass = [];

  body.push(slab(0, -0.5, 2.6, '#e9e8e2'));          // hull at the waterline
  body.push(slab(-0.05, 2.6, 3.6, GREEN));           // the WSF green stripe
  body.push(slab(0, 3.6, 10.2, WHITE));              // car decks
  // open vehicle bays along the sides and at both ends
  for (const side of [-1, 1]) {
    for (let x = -50; x <= 50; x += 12.5) body.push(box(9.5, 3.2, 0.4, x, 6.6, side * (W / 2 + 0.05), DARK));
  }
  for (const end of [-1, 1]) body.push(box(0.4, 4.6, 14, end * (L / 2 - 0.1), 6.0, 0, '#3a434c'));
  body.push(slab(-0.6, 10.2, 10.6, DECK));          // promenade deck edge
  body.push(slab(9, 10.6, 15.2, WHITE));             // passenger cabin
  glass.push(slab(8.85, 11.4, 13.8, DARK));          // continuous cabin windows
  body.push(slab(8.4, 15.2, 15.6, DECK));            // sun deck
  body.push(box(56, 3.2, W - 26, 0, 17.2, 0, WHITE)); // upper superstructure
  glass.push(box(56.2, 1.2, W - 25.8, 0, 17.6, 0, DARK));
  // pilothouses at both ends with wrap-around windows, plus masts and radar
  for (const end of [-1, 1]) {
    body.push(box(9, 3.4, 13, end * 46, 17.3, 0, WHITE));
    glass.push(box(9.2, 1.4, 13.2, end * 46, 17.9, 0, DARK));
    body.push(box(9.6, 0.4, 13.6, end * 46, 19.2, 0, WHITE));
    body.push(paint(new THREE.CylinderGeometry(0.25, 0.3, 7, 6).translate(end * 44, 22.5, 0), WHITE));
    body.push(box(0.4, 0.3, 4.5, end * 44, 24.2, 0, DARK));
  }
  // twin oval stacks: white, green band, black cap
  for (const x of [-9, 9]) {
    const stack = (y0, y1, hex) => {
      const c = new THREE.CylinderGeometry(2.6, 2.9, y1 - y0, 20);
      c.scale(1.4, 1, 0.75); c.translate(x, (y0 + y1) / 2, 0);
      return paint(c, hex);
    };
    body.push(stack(18.8, 23.5, WHITE), stack(23.5, 24.6, GREEN), stack(24.6, 25.4, '#1b1d20'));
  }
  // life-raft canisters along the rails
  for (const side of [-1, 1]) {
    for (let x = -36; x <= 36; x += 6) {
      if (Math.abs(x) < 4) continue;
      const c = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 8);
      c.rotateX(Math.PI / 2); c.translate(x, 16.2, side * (W / 2 - 9.6));
      body.push(paint(c, '#e8e5dc'));
    }
  }
  return { body: BGU.mergeGeometries(body), glass: BGU.mergeGeometries(glass) };
}

// V-shaped foam wake (centre churn + Kelvin arms), drawn behind the stern.
function wakeMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: uniforms.uTime, uAmount: { value: 1 }, uNight: uniforms.uNight },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uAmount, uNight; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main() {
        float x = 1.0 - vUv.x;           // 0 at the stern, 1 far behind
        float y = vUv.y - 0.5;
        float core = exp(-pow(y / (0.04 + 0.12 * x), 2.0)) * (1.0 - x);
        float arm = exp(-pow((abs(y) - 0.42 * x) / 0.018, 2.0)) * (1.0 - x) * smoothstep(0.0, 0.08, x);
        float fizz = 0.65 + 0.35 * h(floor(vec2(x * 90.0 - uTime * 6.0, y * 40.0)));
        float a = (core * 0.85 + arm * 0.55) * fizz * uAmount;
        gl_FragColor = vec4(mix(vec3(1.0), vec3(0.55, 0.62, 0.75), uNight), a);
      }`,
  });
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
  const geo = ferryGeometry();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.15, metalness: 0.3,
    emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0 });
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(geo.body, mat);
  const glass = new THREE.Mesh(geo.glass, glassMat);
  hull.castShadow = hull.receiveShadow = true;
  ship.add(hull, glass);
  // foam wake: plane whose u runs from the stern backwards
  const wakeGeo = new THREE.PlaneGeometry(180, 70).rotateX(-Math.PI / 2);
  wakeGeo.translate(-90, 0, 0); // stern at local x=0, trailing to -x
  const wakeMat = wakeMaterial(uniforms);
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
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
      // wake strength follows speed (derivative of the eased position)
      const speedNow = 6 * s * (1 - s);
      wakeMat.uniforms.uAmount.value = Math.min(1, speedNow * 1.2);
      wake.visible = speedNow > 0.02;
      const hd = dir > 0 ? heading : heading + Math.PI;   // direction of travel
      wake.position.set(x - Math.cos(hd) * 70, 0.3, -(y - Math.sin(hd) * 70));
      wake.rotation.y = hd;
      glassMat.emissiveIntensity = uniforms.uNight.value * 1.4;
    },
  };
}
