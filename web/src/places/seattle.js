// Seattle Center to Westlake: buildings, the Needle, the Monorail, the
// Westin, the Spheres, the bay and its ferry.
import * as THREE from 'three';
import { buildBuildings, buildGround, toV3 } from '../city.js';
import { buildTrees, buildTraffic } from '../life.js';
import { buildSpaceNeedle, buildMonorail, westinBuildings, buildSpheres, buildArtworks, BEAM_TOP } from '../landmarks.js';
import { animateWater, buildFerry } from '../bay.js';
import { SEATTLE_SKY } from '../sky.js';

export async function load({ scene, uniforms, base }) {
  const res = await fetch(`${base}data/scene.json`);
  if (!res.ok) throw new Error('No scene.json yet. Run `pixi run city` (or `pixi run demo`) first.');
  const data = await res.json();

  const ground = buildGround(data, data.meta);
  scene.add(ground.group);
  scene.add(buildBuildings(data.buildings.concat(westinBuildings(data.landmarks.westin)), uniforms));
  scene.add(buildTrees(data.trees));
  const traffic = buildTraffic(data.lanes, uniforms);
  scene.add(traffic.group);

  const needle = buildSpaceNeedle(uniforms);
  const [nx, ny] = data.landmarks.needle;
  needle.group.position.copy(toV3(nx, ny, 0));
  scene.add(needle.group);
  const mono = buildMonorail(data.monorail, uniforms);
  scene.add(mono.group);
  const spheres = data.landmarks.spheres?.length ? buildSpheres(data.landmarks.spheres, uniforms) : null;
  if (spheres) scene.add(spheres.group);
  scene.add(buildArtworks(data.artworks || []));
  if (ground.waterMat) animateWater(ground.waterMat, uniforms);
  const ferry = buildFerry(data.water, data.meta.extent, uniforms);
  if (ferry) scene.add(ferry.group);

  // ---- labels
  const labels = [];
  const label = (text, sub, pos, minZoom = 0) => labels.push({ text, sub, pos, minZoom });
  label('Space Needle', '1962 · 605 ft', toV3(nx, ny, 196));
  const w0 = data.landmarks.westin;
  if (w0.length) {
    const cx = w0.reduce((s, w) => s + w[0], 0) / w0.length, cy = w0.reduce((s, w) => s + w[1], 0) / w0.length;
    label('The Westin Seattle', 'twin towers · 5th Ave', toV3(cx, cy, Math.max(...w0.map((w) => w[3])) + 18));
  }
  const m0 = mono.trains[0].path;
  const ms = m0.at(12), me = m0.at(m0.len - 10);
  label('Seattle Center Stn', 'Monorail', toV3(ms.x, ms.y, BEAM_TOP + 22));
  label('Westlake Stn', 'Monorail', toV3(me.x, me.y, BEAM_TOP + 22));
  for (const [text, sub, px, py, ph] of data.places || []) label(text, sub, toV3(px, py, ph), 1.6);

  // ---- views
  const needleV = toV3(nx, ny, 60);
  const westinV = w0.length ? toV3(w0[0][0], w0[0][1], 40) : needleV;
  const centerV = needleV.clone().lerp(westinV, 0.45).setY(0);
  const sph = data.landmarks.spheres || [];
  const spheresV = sph.length ? toV3(sph.reduce((a, b) => a + b[0], 0) / sph.length, sph.reduce((a, b) => a + b[1], 0) / sph.length, 15) : westinV;
  const ospP = (data.places || []).find((p) => /sculpture/i.test(p[0]));
  const ospV = ospP ? toV3(ospP[2], ospP[3], 5) : centerV;
  const views = [
    { id: 'overview', label: 'Overview', target: centerV, az: 0.75, polar: 0.98, zoom: 1.4 },
    { id: 'needle', label: 'Space Needle', target: needleV, az: -0.55, polar: 1.12, zoom: 4.6 },
    { id: 'westin', label: 'The Westin', target: westinV, az: 0.35, polar: 1.05, zoom: 5.2 },
    { id: 'spheres', label: 'The Spheres', target: spheresV, az: 0.9, polar: 0.55, zoom: 10 },
    { id: 'osp', label: 'Sculpture Park', target: ospV, az: 0.3, polar: 1.0, zoom: 5.5 },
  ];

  // Red train dwells at Seattle Center until simT = 18; the film starts at
  // simT = 2 so it pulls out of the station at film t = 16.
  const red = () => mono.trains[0].pos;
  const film = [
    { t: 0, target: centerV, az: 0.55, polar: 0.9, zoom: 1.25, tod: 0.12 },
    { t: 6, target: ospV, az: 0.2, polar: 1.0, zoom: 3.2, tod: 0.18 },
    { t: 11, target: needleV, az: -0.2, polar: 1.12, zoom: 4.2, tod: 0.26 },
    { t: 16, target: red, az: -0.75, polar: 1.08, zoom: 5.2, tod: 0.32 },
    { t: 21, target: red, az: -0.5, polar: 1.0, zoom: 7.5, tod: 0.37 },
    { t: 26, target: red, az: -0.2, polar: 1.02, zoom: 7.0, tod: 0.41 },
    { t: 31, target: spheresV, az: 0.5, polar: 0.6, zoom: 8.5, tod: 0.46 },
    { t: 36, target: westinV, az: 0.1, polar: 1.1, zoom: 5.0, tod: 0.52 },
    { t: 41, target: westinV, az: 0.6, polar: 1.12, zoom: 4.6, tod: 0.64 },
    { t: 47, target: centerV, az: 0.9, polar: 0.95, zoom: 1.6, tod: 0.86 },
    { t: 53, target: centerV, az: 1.05, polar: 0.92, zoom: 1.4, tod: 1.0 },
  ];

  return {
    data,
    extent: data.meta.extent,
    groundHeight: 0,
    labels,
    views,
    follows: [
      { label: 'Red train', dot: '#c8322b', obj: mono.trains[0], zoom: 7 },
      { label: 'Blue train', dot: '#2c64b0', obj: mono.trains[1], zoom: 7 },
    ],
    weather: { mode: 'rain', label: 'Rain', toast: 'Classic Seattle drizzle' },
    sky: SEATTLE_SKY,
    toggles: [],
    film, simOffset: 2,
    stats: `${data.buildings.length.toLocaleString()} buildings · ${(data.trees.length / 4).toLocaleString()} trees · ${data.meta.attribution}`,
    update(t, dt) {
      needle.update(t); mono.update(t); spheres?.update(t); ferry?.update(t); traffic.update(dt);
    },
    seek(t, dt) { for (let ft = 0; ft < t - dt / 2; ft += dt) traffic.update(dt); },
    lighting({ night, rain }) {
      if (ground.meshes.roads) {
        ground.meshes.roads.material.roughness = 0.85 - 0.6 * rain;
        ground.meshes.roads.material.emissive.set('#ff9d4d').multiplyScalar(0.11 * night); // sodium streetlights
      }
      if (ground.meshes.walks) ground.meshes.walks.material.roughness = 0.95 - 0.5 * rain;
    },
  };
}
