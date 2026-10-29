// Seattle weather: rain streaks that follow the camera, plus Seattle's
// real sun position for "live" mode.
import * as THREE from 'three';

export function buildRain(count = 9000) {
  const pos = new Float32Array(count * 2 * 3);
  const seed = new Float32Array(count * 2);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 2 - 1, y = Math.random(), z = Math.random() * 2 - 1;
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], (i * 2 + k) * 3);
      seed[i * 2 + k] = Math.random();
      end[i * 2 + k] = k;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const uniforms = {
    uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() },
    uSize: { value: 600 }, uHeight: { value: 260 }, uAmount: { value: 0 },
    uColor: { value: new THREE.Color('#dfe8f2') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSeed; attribute float aEnd;
      uniform float uTime, uSize, uHeight, uAmount; uniform vec3 uCenter;
      varying float vA;
      void main() {
        float fall = 70.0 + aSeed * 30.0;                // m/s, stylized
        float y = fract(position.y - uTime * fall / uHeight + aSeed * 7.0) * uHeight;
        vec3 p = vec3(uCenter.x + position.x * uSize, y - aEnd * (5.0 + aSeed * 4.0), uCenter.z + position.z * uSize);
        p.x += aEnd * 1.2;                               // a little wind from the south-west
        vA = step(aSeed, uAmount * 0.32) * (0.08 + 0.3 * aEnd);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA;
      void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 10;
  return {
    object: lines,
    update(t, target, zoom, amount, night) {
      uniforms.uTime.value = t;
      uniforms.uCenter.value.copy(target);
      uniforms.uSize.value = THREE.MathUtils.clamp(900 / zoom, 70, 1100);
      uniforms.uHeight.value = THREE.MathUtils.clamp(500 / zoom, 60, 600);
      uniforms.uAmount.value = amount;
      uniforms.uColor.value.set(night > 0.5 ? '#8fa0bf' : '#e4ecf4');
      lines.visible = amount > 0.01;
    },
  };
}

// Solar position (NOAA simplified), returns compass azimuth + elevation in degrees.
export function sunPosition(date, lat = 47.6205, lon = -122.3493) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * rad;
  const ha = lst - ra;
  const latR = lat * rad;
  const el = Math.asin(Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(latR) - Math.sin(latR) * Math.cos(ha));
  return { az: ((az / rad) + 360) % 360, el: el / rad };
}

// Map a real sun elevation onto the diorama's 0..1 time-of-day palette.
export function todFromElevation(el, afternoon) {
  if (el >= 40) return 0;
  if (el >= 11) return afternoon ? 0.5 * (40 - el) / 29 : 0.15 * (40 - el) / 29;
  if (el >= 2) return 0.5 + 0.25 * (11 - el) / 9;
  if (el >= -8) return 0.75 + 0.25 * (2 - el) / 10;
  return 1;
}
