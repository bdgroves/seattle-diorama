// The "director": a scripted camera move + time of day, evaluated at any
// film time t (seconds). Each place supplies its own keyframes:
//   { t, target, az, polar, zoom, tod }
// target is a Vector3 or a function returning one (e.g. a moving train).
// az = camera azimuth (three.js spherical theta), polar = tilt from straight
// down, zoom = ortho zoom, tod = time of day (0 morning .. 1 night).
import * as THREE from 'three';

export function makeFilm(keys, simOffset = 0) {
  const duration = keys[keys.length - 1].t;
  // Catmull-Rom keeps the camera gliding through keys instead of stopping at each
  const cr = (p0, p1, p2, p3, u) => {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  };
  const tgt = (k) => (typeof k.target === 'function' ? k.target() : k.target);
  const out = { target: new THREE.Vector3() };

  function at(t) {
    t = THREE.MathUtils.clamp(t, 0, duration);
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
    const k1 = keys[i], k2 = keys[i + 1];
    const k0 = keys[i - 1] || k1, k3 = keys[i + 2] || k2;
    const u = (t - k1.t) / (k2.t - k1.t);
    const [a, b, c, d] = [k0, k1, k2, k3].map(tgt);
    out.target.set(cr(a.x, b.x, c.x, d.x, u), cr(a.y, b.y, c.y, d.y, u), cr(a.z, b.z, c.z, d.z, u));
    for (const p of ['az', 'polar', 'zoom']) out[p] = cr(k0[p], k1[p], k2[p], k3[p], u);
    const s = u * u * (3 - 2 * u);
    out.tod = k1.tod + (k2.tod - k1.tod) * s;
    return out;
  }
  return { at, duration, simOffset };
}
