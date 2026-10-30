// Real 3D models of landmarks, from Wikimedia Commons.
//
// The pipeline (pipeline/wikidata3d.py) follows each OSM feature's wikidata
// tag to Wikidata's "3D model" property (P4896) and downloads the STL from
// Commons. Here each model is stood up, sized and turned to match its real
// OSM footprint (or its OSM height when tagged), and coloured to sit in with
// the rest of the diorama. The plain boxes they replace are kept in a second
// mesh, so the "Commons 3D models" toggle can swap between the two.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const STONE = ['#ebe4d6', '#e4dccb', '#efe9de', '#ddd5c4'];

export async function buildModels(list, { base, groundZ = () => 0 }) {
  const group = new THREE.Group();
  const loaded = [];
  if (!list?.length) return { group, loaded, setVisible() {} };
  const loader = new STLLoader();
  await Promise.all(list.map(async (m, i) => {
    try {
      const geo = await loader.loadAsync(`${base}data/${m.file}`);
      // STL files are almost always Z-up; stand them up in three.js's Y-up world
      geo.rotateX(-Math.PI / 2);
      geo.computeBoundingBox();
      let bb = geo.boundingBox, sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      // a model that comes out lying down (much wider than tall while the real
      // thing is tagged tall) was probably authored Y-up already
      if (m.h && sy < 0.6 * Math.max(sx, sz) && m.h > 1.5 * (m.w || 0)) {
        geo.rotateX(Math.PI / 2);
        geo.computeBoundingBox(); bb = geo.boundingBox;
        sx = bb.max.x - bb.min.x; sy = bb.max.y - bb.min.y; sz = bb.max.z - bb.min.z;
      }
      // centre on the footprint, base on the ground; long side along +X
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      if (sz > sx) { geo.rotateY(Math.PI / 2); [sx, sz] = [sz, sx]; }
      // size: the tagged height wins, then the footprint's long side, else ~6 m (a sculpture)
      let k = m.h ? m.h / sy : m.w ? m.w / sx : 6 / sy;
      if (m.w && k * sx > 2.2 * m.w + 10) k = (2.2 * m.w + 10) / sx;   // never sprawl far past its footprint
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: STONE[i % STONE.length], roughness: 0.62, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(k);
      mesh.rotation.y = m.angle || 0;
      mesh.position.set(m.x, m.z ?? groundZ(m.x, m.y), -m.y);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = m;
      group.add(mesh);
      loaded.push({ ...m, height: Math.round(k * sy), mesh });
    } catch (err) {
      console.warn(`Commons model ${m.qid} (${m.name}) did not load`, err);
    }
  }));
  return {
    group, loaded,
    setVisible(on) { group.visible = on; },
  };
}

// "3D models from Wikimedia Commons: Name (Author, License) ..." for the credit line
export function creditsHtml(loaded) {
  if (!loaded.length) return '';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = loaded.map((m) => `<a href="${esc(m.page)}" target="_blank" rel="noopener" title="${esc(m.commons)}">${esc(m.name)}</a> (${esc(m.artist)}, ${esc(m.license)})`);
  return ` · 3D models from Wikimedia Commons: ${items.join(', ')}`;
}
