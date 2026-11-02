// Torres del Paine, Patagonia: Copernicus elevation with the Grey Glacier and its
// icebergs, the turquoise lakes, the Cuernos and the Torres, lenga forest that turns red
// in autumn, hikers on the W Trek, condors, and the wind (web/src/patagonia.js).
// Camera az 0 sits south of the target looking north (the classic view across Lago
// Pehoé); az ~1.5 is east of the target looking west, the Torres at sunrise.
import { buildTerrainPlace } from '../terrain.js';
import { buildPatagonia } from '../patagonia.js';

const TORRES = {
  id: 'torres',
  contour: 100,
  season: 'spring',                         // 'spring' here is the southern summer
  seasonLabel: 'Summer',
  snowSpring: 1500, snowAutumn: 950,
  springToast: 'January: trekking season, the lenga in full leaf and snow only up high',
  autumnToast: 'Late April: the lenga forests turn red and the first snow comes down the peaks',
  snowToast: 'A storm off the ice field drops snow on the massif',
  weather: { mode: 'snow', label: 'Snow', toast: 'A storm off the ice field drops snow on the massif' },
  waterColor: '#3c9fae',                    // glacial flour: Pehoé and Nordenskjöld are turquoise
  riverColor: '#62aebb',
  riverScale: 0.6,
  steep: [0.66, 0.42],
  soften: 1,
  roadScale: 1.0, carScale: 2.0, roadColor: '#cbbf9f',
  buildingColors: ['#7d5a3c', '#8a6a48', '#b04a32', '#e0d6c4', '#5f6f4e'],
  palette: {
    // golden steppe grass, dark lenga, pale granite
    spring: { 0: '#35562e', 1: '#a4a19a', 2: '#93a356', 5: '#b2a768', 8: '#8f907a', 6: '#d9cfae' },
    autumn: { 0: '#5a3a26', 1: '#a4a19a', 2: '#b49a5a', 5: '#a8935c', 8: '#8a8572', 6: '#d9cfae' },
  },
  decid: {
    // lenga in leaf, then the famous red; ñirre and calafate in the steppe
    spring: [['#3f6b31', '#4b7838', '#36602b', '#56823f', '#44702f'], ['#6d8b45', '#5f7d3c', '#7a9450']],
    autumn: [['#b8322a', '#c9482b', '#d9682c', '#a62a25', '#e08a2e', '#c23a2c'], ['#c35a2a', '#b04a2a', '#d07a34']],
  },
  sky: {
    // the Southern Patagonian Ice Field's peaks to the west and north, open steppe east
    ranges: [[0, 6.3, 0.01, 0.018], [3.4, 5.9, 0.03, 0.045]],
    peaks: [[4.3, 0.07, 0.07, 1.3], [5.2, 0.08, 0.06, 1.3]],
    snowy: 1, stars: 2, milky: 1,
  },
  critterScale: 4,
  // condors circle in the thermals over the Torres, the Cuernos and Paine Grande
  thermals: [[-50.9450, -72.9700], [-50.9900, -73.0000], [-51.0050, -73.0900], [-50.9650, -73.0450]],
  hikeNear: [-50.9900, -73.0450],
  // lenticular clouds (lat, lon, base altitude m) when the wind is up
  lenticulars: [[-50.9500, -73.0000, 4200], [-51.0000, -73.1300, 3900], [-50.9200, -73.1000, 4600]],
  stats: ({ data, nTrees, trailKm, extra }) => {
    const i = extra?.info || {};
    return `${Math.round(trailKm)} km of trails · ${i.hikers || 0} hikers · ${i.bergs || 0} icebergs · ${i.condors || 0} condors · `
      + `${Math.round(nTrees).toLocaleString()} lenga and ñirre · ${data.meta.attribution}`;
  },
  views: [
    { id: 'overview', label: 'Overview', lat: -51.010, lon: -73.060, az: 0.2, polar: 0.95, zoom: 1.0 },
    { id: 'pehoe', label: 'Cuernos across Lago Pehoé', lat: -50.990, lon: -73.020, az: -0.35, polar: 1.18, zoom: 3.6 },
    { id: 'torres', label: 'The Torres', lat: -50.9420, lon: -72.9850, az: 1.45, polar: 1.12, zoom: 6.5 },
    { id: 'frances', label: 'Valle del Francés', lat: -50.975, lon: -73.045, az: 0.05, polar: 1.02, zoom: 4.2 },
    { id: 'grande', label: 'Paine Grande', lat: -50.99889, lon: -73.09528, az: -0.4, polar: 1.1, zoom: 3.6 },
    { id: 'grey', label: 'Grey Glacier & icebergs', lat: -51.020, lon: -73.200, az: 0.25, polar: 1.08, zoom: 4.2 },
    { id: 'salto', label: 'Salto Grande', lat: -51.0510, lon: -73.0030, az: 0.3, polar: 1.15, zoom: 14 },
    { id: 'nordenskjold', label: 'Lago Nordenskjöld', lat: -51.030, lon: -72.950, az: -0.9, polar: 1.08, zoom: 3.2 },
  ],
  film: ({ V, extra }) => {
    const L = extra?.leads || {};
    return [
      // before dawn under the Torres (climbers' headlamps, refugio lights), then sunrise on them
      { t: 0, target: V.torres, az: 1.5, polar: 1.12, zoom: 5.5, tod: 0.0 },
      { t: 7, target: V.torres, az: 1.25, polar: 1.1, zoom: 6.5, tod: 0.1 },
      { t: 13, target: L.condor ? () => L.condor.pos : V.torres, az: 0.9, polar: 1.05, zoom: 9, tod: 0.18 },
      { t: 19, target: V.frances, az: 0.2, polar: 1.02, zoom: 4.2, tod: 0.26 },
      { t: 25, target: L.hiker ? () => L.hiker.pos : V.frances, az: -0.1, polar: 1.1, zoom: 18, tod: 0.33 },
      { t: 31, target: V.pehoe, az: -0.35, polar: 1.16, zoom: 3.6, tod: 0.42 },
      { t: 37, target: V.salto, az: 0.3, polar: 1.15, zoom: 10, tod: 0.5 },
      { t: 43, target: V.grande, az: -0.45, polar: 1.1, zoom: 3.4, tod: 0.6 },
      { t: 49, target: V.grey, az: 0.25, polar: 1.08, zoom: 4.2, tod: 0.7 },
      { t: 55, target: V.grey, az: -0.6, polar: 1.12, zoom: 6, tod: 0.8 },
      { t: 61, target: V.overview, az: 0.15, polar: 0.95, zoom: 1.05, tod: 0.92 },
      { t: 67, target: V.overview, az: 0.3, polar: 0.92, zoom: 1.0, tod: 1.0 },
    ];
  },
};
TORRES.extras = (ctx) => buildPatagonia({ ...ctx, cfg: TORRES });

export function torresLoader() {
  return (ctx) => buildTerrainPlace({ ...ctx, cfg: TORRES });
}
