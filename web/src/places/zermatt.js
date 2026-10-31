// Zermatt and the Matterhorn: swisstopo's swissALTI3D elevation with the
// lifts, the mountain railways, the ski pistes, the chalets of the village and
// the cows on the summer pastures (pipeline/alpine.py, web/src/alps.js).
// Camera az 0 sits south of the target looking north; az ~2.4 is the classic
// view from Zermatt, north-east of the Matterhorn, looking south-west.
import { buildTerrainPlace } from '../terrain.js';
import { buildAlps } from '../alps.js';

const ZERMATT = {
  id: 'zermatt',
  contour: 100,
  season: 'spring',                       // 'spring' here is high summer
  seasonLabel: 'Summer',
  frozenWinter: true,
  snowSpring: 3350, snowAutumn: 1150,     // summer: only the high snowfields; winter: everything
  springToast: 'Summer: cows on the pastures, paragliders over the village, skiing only up on the glacier',
  autumnToast: 'Ski season: snow to the valley floor and every piste open',
  snowToast: 'Fresh snow over the Matterhorn',
  weather: { mode: 'snow', label: 'Snow', toast: 'Fresh snow over the Matterhorn' },
  steep: [0.62, 0.42],
  soften: 1,
  roadScale: 1.0, carScale: 2.0, roadColor: '#cfc8bb',
  palette: {
    spring: { 0: '#2c4a2b', 1: '#9b9a97', 2: '#7fa34b', 4: '#bdb5a8', 5: '#7d8a5a', 8: '#a3a874' },
    autumn: { 0: '#2c4a2b', 1: '#9b9a97', 2: '#d9dde2', 4: '#c9c3b8', 5: '#d9dde2', 8: '#e3e6ea' },
  },
  // larches and arolla pines: green in summer, bare in winter
  decid: {
    spring: [['#6f9a3c', '#7aa646', '#628d36', '#86b052'], ['#6f9a3c', '#7aa646']],
    autumn: [['#8a7e6c', '#7e7262', '#968a76'], ['#8a7e6c', '#7e7262']],
  },
  sky: {
    // the Weisshorn and the Dom to the north, the Dent Blanche west, Monte Rosa's
    // wall to the south-east
    ranges: [[0, 6.3, 0.03, 0.045]],
    peaks: [[0.1, 0.06, 0.1, 1.4], [5.9, 0.07, 0.09, 1.4], [4.8, 0.08, 0.085, 1.3], [0.55, 0.06, 0.08, 1.3]],
    snowy: 1, stars: 2, milky: 1,
  },
  critterScale: 4,
  metaHtml: ' · <a href="./characters.html">Meet the Alpabzug queen and the alphorn player &rarr;</a>',
  rideRx: /matterhorn express 1|zermatt - furi/i,
  rideLabel: 'Ride the gondola from Zermatt',
  paraglide: [
    { from: [46.0198, 7.8027], to: [46.0215, 7.7495] },   // off the Rothorn into the village
    { from: [45.9839, 7.7844], to: [46.0180, 7.7470] },   // off Gornergrat
    { from: [46.0122, 7.7698], to: [46.0230, 7.7470] },   // Sunnegga
  ],
  alphorns: [[45.98905, 7.7712], [45.9845, 7.7848], [46.0117, 7.7705], [46.0035, 7.7310]],
  facing: [45.9763, 7.6586],
  flags: [[45.9824, 7.6740, 0.4], [45.9839, 7.7844, 2.0], [46.0207, 7.7491, 1.0], [45.9381, 7.7298, 0]],
  stats: ({ data, nTrees, extra }) => {
    const i = extra?.info || {};
    return `${i.lifts || 0} lifts · ${Math.round(i.pisteKm || 0)} km of pistes · ${i.cows || 0} cows (${i.fancy || 0} dressed for the Alpabzug) · `
      + `${Math.round(i.chalets || 0).toLocaleString()} chalets · ${Math.round(nTrees).toLocaleString()} larches and pines · ${data.meta.attribution.replace('swisstopo swissALTI3D', '© swisstopo swissALTI3D')}`;
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 45.985, lon: 7.735, az: 2.45, polar: 1.0, zoom: 1.05 },
    { id: 'matterhorn', label: 'The Matterhorn', lat: 45.9775, lon: 7.6600, az: 2.35, polar: 1.15, zoom: 4.2 },
    { id: 'zermatt', label: 'Zermatt village', lat: 46.0200, lon: 7.7480, az: 2.6, polar: 1.05, zoom: 12 },
    { id: 'gornergrat', label: 'Gornergrat & Monte Rosa', lat: 45.955, lon: 7.820, az: 3.75, polar: 1.12, zoom: 3.0 },
    { id: 'riffelsee', label: 'Riffelsee', lat: 45.9887, lon: 7.7699, az: 1.55, polar: 1.2, zoom: 16 },
    { id: 'hornli', label: 'Hörnli ridge & hut', lat: 45.9800, lon: 7.6700, az: 2.2, polar: 1.1, zoom: 9 },
    { id: 'paradise', label: 'Matterhorn Glacier Paradise', lat: 45.9420, lon: 7.7300, az: 3.4, polar: 1.1, zoom: 6 },
    { id: 'sunnegga', label: 'Sunnegga & Stellisee', lat: 46.0090, lon: 7.7900, az: 1.4, polar: 1.12, zoom: 7 },
    { id: 'gorner', label: 'Gorner Glacier', lat: 45.9560, lon: 7.8000, az: 2.0, polar: 1.0, zoom: 2.6 },
    { id: 'pastures', label: 'Cows above Findeln', lat: 46.00654, lon: 7.78239, az: 0.9, polar: 1.1, zoom: 50 },
    { id: 'alphorn', label: 'Alphorn at Riffelsee', lat: 45.98905, lon: 7.7712, az: 1.2, polar: 1.25, zoom: 75 },
  ],
  film: ({ V, extra }) => {
    const L = extra?.leads || {};
    return [
      { t: 0, target: V.overview, az: 2.3, polar: 0.92, zoom: 0.95, tod: 0.08 },
      { t: 6, target: V.matterhorn, az: 2.35, polar: 1.12, zoom: 3.8, tod: 0.14 },
      { t: 12, target: V.zermatt, az: 2.6, polar: 1.05, zoom: 10, tod: 0.2 },
      { t: 18, target: L.train ? () => L.train.pos : V.gornergrat, az: 2.0, polar: 1.08, zoom: 14, tod: 0.27 },
      { t: 24, target: V.gornergrat, az: 3.75, polar: 1.12, zoom: 3.0, tod: 0.34 },
      { t: 30, target: V.pastures, az: 2.4, polar: 1.15, zoom: 45, tod: 0.42 },
      { t: 36, target: L.lift ? () => L.lift.pos : V.paradise, az: 1.8, polar: 1.05, zoom: 11, tod: 0.5 },
      { t: 42, target: V.riffelsee, az: 1.55, polar: 1.2, zoom: 12, tod: 0.62 },
      { t: 48, target: V.hornli, az: 2.2, polar: 1.1, zoom: 7, tod: 0.74 },
      { t: 54, target: V.matterhorn, az: 2.5, polar: 1.12, zoom: 3.2, tod: 0.86 },
      { t: 60, target: V.overview, az: 2.5, polar: 0.92, zoom: 1.0, tod: 1.0 },
    ];
  },
};
ZERMATT.extras = (ctx) => buildAlps({ ...ctx, cfg: ZERMATT });

export function zermattLoader() {
  return (ctx) => buildTerrainPlace({ ...ctx, cfg: ZERMATT });
}
