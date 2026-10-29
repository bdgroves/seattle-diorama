// The "director": a scripted camera move + time of day, evaluated at any
// film time t (seconds). Used for live playback/recording in the browser and
// for frame-by-frame rendering by pipeline/film.py.
import * as THREE from 'three';

export function makeFilm({ VIEWS, mono, needleV, westinV, centerV, spheresV, ospV }) {
  const red = () => mono.trains[0].pos;
  // az = camera azimuth (radians, three.js spherical theta), polar = tilt from
  // straight down, zoom = ortho zoom, tod = time of day (0 morning .. 1 night)
  const keys = [
    { t: 0, target: centerV, az: 0.55, polar: 0.9, zoom: 1.25, tod: 0.12 },
    { t: 6, target: ospV, az: 0.2, polar: 1.0, zoom: 3.2, tod: 0.18 },          // Sculpture Park + the bay
    { t: 11, target: needleV, az: -0.2, polar: 1.12, zoom: 4.2, tod: 0.26 },
    { t: 16, target: red, az: -0.75, polar: 1.08, zoom: 5.2, tod: 0.32 },       // Red train departs
    { t: 21, target: red, az: -0.5, polar: 1.0, zoom: 7.5, tod: 0.37 },
    { t: 26, target: red, az: -0.2, polar: 1.02, zoom: 7.0, tod: 0.41 },
    { t: 31, target: spheresV, az: 0.5, polar: 0.6, zoom: 8.5, tod: 0.46 },     // the Spheres
    { t: 36, target: westinV, az: 0.1, polar: 1.1, zoom: 5.0, tod: 0.52 },
    { t: 41, target: westinV, az: 0.6, polar: 1.12, zoom: 4.6, tod: 0.64 },
    { t: 47, target: centerV, az: 0.9, polar: 0.95, zoom: 1.6, tod: 0.86 },
    { t: 53, target: centerV, az: 1.05, polar: 0.92, zoom: 1.4, tod: 1.0 },
  ];
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

  // Red train dwells at Seattle Center until simT = 18; start the film so it
  // pulls out of the station at film t = 16.
  return { at, duration, simOffset: 2 };
}
