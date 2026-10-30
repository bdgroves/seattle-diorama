// The three Sierra Nevada dioramas. Views use real coordinates; the camera
// azimuth `az` is three.js's spherical theta (0 = camera due south looking
// north, -PI/2 = camera to the west looking east).
import { buildTerrainPlace } from '../terrain.js';

const PI = Math.PI;

export const YOSEMITE = {
  id: 'yosemite',
  contour: 100,
  snowAutumn: 3400, snowSpring: 2350,
  // late October: Yosemite Falls is usually dry; Bridalveil and the Merced
  // falls keep a thin flow. Spring snowmelt: everything roars.
  flowAutumn: (n) => (/yosemite|ribbon|horsetail/.test(n) ? 0 : /bridalveil/.test(n) ? 0.35 : 0.3),
  flowSpring: (n) => (/horsetail/.test(n) ? 0.45 : /ribbon/.test(n) ? 0.8 : 1),
  autumnToast: 'Late October: Yosemite Falls is usually dry by now',
  springToast: 'Spring snowmelt: the falls are roaring',
  snowToast: 'Snow on the rims',
  drive: 'Drive the valley loop',
  // Camp 4: the climbers' walk-in campground (36 sites) below Columbia Rock
  camps: [{ lat: 37.7424, lon: -119.6025, r: 110, n: 36 }],
  buildingColors: ['#8a6b52', '#7d6450', '#9a7d62', '#6f5a48', '#a68b6c'],
  sky: {
    ranges: [[0, 6.3, 0.016, 0.026]],
    peaks: [[1.15, 0.09, 0.05, 1.4], [2.25, 0.08, 0.04, 1.3], [0.6, 0.1, 0.055, 1.2]],
    stars: 2, milky: 1,
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 37.737, lon: -119.600, az: -0.9, polar: 0.85, zoom: 1.15 },
    { id: 'tunnel', label: 'Tunnel View', lat: 37.738, lon: -119.585, az: -1.45, polar: 1.2, zoom: 1.7 },
    { id: 'elcap', label: 'El Capitan', lat: 37.7315, lon: -119.6370, az: 0.05, polar: 1.12, zoom: 4.5 },
    { id: 'falls', label: 'Yosemite Falls', lat: 37.7530, lon: -119.5966, az: 0.15, polar: 1.12, zoom: 4.2 },
    { id: 'halfdome', label: 'Half Dome', lat: 37.7459, lon: -119.5332, az: -2.35, polar: 1.05, zoom: 4 },
    { id: 'glacier', label: 'From Glacier Point', lat: 37.735, lon: -119.545, az: -0.75, polar: 1.1, zoom: 2.6 },
    { id: 'camp4', label: 'Camp 4', lat: 37.7424, lon: -119.6025, az: -0.35, polar: 0.95, zoom: 16 },
  ],
  film: ({ V }) => [
    { t: 0, target: V.overview, az: -0.7, polar: 0.85, zoom: 1.05, tod: 0.1 },
    { t: 6, target: V.tunnel, az: -1.45, polar: 1.2, zoom: 1.7, tod: 0.18 },
    { t: 13, target: V.elcap, az: -0.15, polar: 1.12, zoom: 4.2, tod: 0.26 },
    { t: 19, target: V.falls, az: 0.2, polar: 1.12, zoom: 4.0, tod: 0.33 },
    { t: 25, target: V.halfdome, az: -1.9, polar: 1.05, zoom: 3.8, tod: 0.42 },
    { t: 31, target: V.glacier, az: -0.75, polar: 1.1, zoom: 2.6, tod: 0.52 },
    { t: 38, target: V.halfdome, az: -2.5, polar: 1.12, zoom: 3.2, tod: 0.66 },
    { t: 44, target: V.elcap, az: 0.1, polar: 1.15, zoom: 4.2, tod: 0.95 },
    { t: 50, target: V.overview, az: -1.0, polar: 0.85, zoom: 1.1, tod: 1.0 },
  ],
};

export const TUOLUMNE = {
  id: 'tuolumne',
  contour: 50,
  snowAutumn: 3200, snowSpring: 2850,
  flowAutumn: () => 0.3, flowSpring: () => 1,
  autumnToast: 'Late October: golden meadows, first dusting on Cathedral Peak',
  springToast: 'Early summer: the meadows green up as the snow lets go',
  snowToast: 'Snow is coming to the high country',
  drive: 'Drive Tioga Road',
  driveZoom: 8,
  buildingColors: ['#7f6450', '#8e735a', '#6f5a48'],
  sky: {
    ranges: [[0, 6.3, 0.02, 0.03]],
    peaks: [[1.33, 0.08, 0.075, 1.4], [0.15, 0.07, 0.065, 1.4], [2.3, 0.1, 0.05, 1.3], [3.6, 0.1, 0.045, 1.3]],
    stars: 2, milky: 1,
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 37.868, lon: -119.380, az: 0.4, polar: 0.95, zoom: 1.0 },
    { id: 'meadows', label: 'The meadows', lat: 37.874, lon: -119.370, az: 0.3, polar: 1.15, zoom: 2.5 },
    { id: 'lembert', label: 'Lembert Dome', lat: 37.8793, lon: -119.3490, az: -1.5, polar: 1.1, zoom: 4 },
    { id: 'pothole', label: 'Pothole Dome', lat: 37.8774, lon: -119.3935, az: 0.9, polar: 1.05, zoom: 5 },
    { id: 'cathedral', label: 'Cathedral Peak', lat: 37.8475, lon: -119.4050, az: 2.9, polar: 1.08, zoom: 3.5 },
  ],
  film: ({ V, car }) => [
    { t: 0, target: V.overview, az: 0.4, polar: 0.9, zoom: 0.95, tod: 0.12 },
    { t: 7, target: V.meadows, az: 0.3, polar: 1.15, zoom: 2.5, tod: 0.2 },
    { t: 13, target: V.lembert, az: -1.4, polar: 1.1, zoom: 3.8, tod: 0.28 },
    { t: 19, target: car ? () => car.pos : V.meadows, az: -0.9, polar: 1.05, zoom: 7, tod: 0.34 },
    { t: 25, target: V.pothole, az: 0.9, polar: 1.05, zoom: 4.5, tod: 0.42 },
    { t: 31, target: V.cathedral, az: 2.9, polar: 1.08, zoom: 3.4, tod: 0.52 },
    { t: 38, target: V.cathedral, az: 2.4, polar: 1.12, zoom: 3.0, tod: 0.64 },
    { t: 44, target: V.overview, az: 0.6, polar: 1.0, zoom: 1.1, tod: 0.85 },
    { t: 50, target: V.overview, az: 0.8, polar: 0.95, zoom: 1.0, tod: 1.0 },
  ],
};

export const MONO = {
  id: 'mono',
  contour: 100,
  snowAutumn: 3600, snowSpring: 2700,
  waterColor: '#3f8ea6',
  autumnToast: 'Late October: gold aspens up Lee Vining Canyon',
  springToast: 'Spring: snow on the escarpment, the creeks running high',
  snowToast: 'Snow on the Sierra crest',
  drive: 'Drive US 395',
  driveZoom: 6,
  buildingColors: ['#d8cfc0', '#c9bfae', '#b5a68f', '#e2d9c8'],
  sky: {
    ranges: [[3.4, 5.9, 0.05, 0.05], [0.2, 2.7, 0.012, 0.02]],
    peaks: [[4.25, 0.07, 0.105, 1.4], [4.6, 0.06, 0.095, 1.4], [5.2, 0.06, 0.08, 1.4], [1.75, 0.25, 0.04, 1.2]],
    stars: 2, milky: 1,
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 38.000, lon: -119.040, az: 1.5, polar: 1.0, zoom: 1.0 },
    { id: 'tufa', label: 'South Tufa', lat: 37.9405, lon: -119.0272, az: 1.1, polar: 1.18, zoom: 10 },
    { id: 'islands', label: 'Negit & Paoha', lat: 38.012, lon: -119.040, az: 0.6, polar: 0.85, zoom: 2.6 },
    { id: 'panum', label: 'Panum Crater', lat: 37.9257, lon: -119.0461, az: 0.4, polar: 0.85, zoom: 6 },
    { id: 'leevining', label: 'Lee Vining', lat: 37.957, lon: -119.120, az: 1.8, polar: 1.05, zoom: 3.5 },
  ],
  film: ({ V, gulls }) => [
    { t: 0, target: V.overview, az: 1.5, polar: 0.95, zoom: 0.95, tod: 0.1 },
    { t: 7, target: V.islands, az: 0.8, polar: 0.9, zoom: 2.4, tod: 0.18 },
    { t: 13, target: gulls ? () => gulls.pos : V.islands, az: 0.4, polar: 0.95, zoom: 5, tod: 0.26 },
    { t: 20, target: V.tufa, az: 1.3, polar: 1.15, zoom: 8, tod: 0.36 },
    { t: 27, target: V.tufa, az: 0.7, polar: 1.18, zoom: 10, tod: 0.55 },
    { t: 34, target: V.panum, az: 0.4, polar: 0.9, zoom: 5, tod: 0.63 },
    { t: 41, target: V.overview, az: 1.6, polar: 1.0, zoom: 1.1, tod: 0.82 },
    { t: 48, target: V.overview, az: 1.8, polar: 0.95, zoom: 1.0, tod: 1.0 },
  ],
};

// The Amalfi Coast: Capri and the Sorrento peninsula west, Positano to Ravello
// east. Camera az 0 sits out at sea looking north at the cliffs.
export const AMALFI = {
  id: 'amalfi',
  contour: 50,
  snowAutumn: 9999, snowSpring: 9999,
  season: 'spring',                   // 'spring' here means high summer
  seasonLabel: 'High summer',
  autumnToast: 'Late October: quiet beaches, chestnuts turning gold on the Lattari',
  springToast: 'High summer: umbrellas out, the bays full of boats',
  weather: { mode: 'rain', label: 'Rain', toast: 'A Mediterranean squall rolls in off the sea' },
  terraces: true,
  roadScale: 1.6, carScale: 2.6,
  drive: 'Drive the Amalfi Coast road', driveZoom: 9, driveSpeed: 16,
  driveStart: { lat: 40.6281, lon: 14.4850 },          // Positano, heading east
  ferry: 'Ferry to Capri', ferryZoom: 5,
  ferryTo: { lat: 40.5585, lon: 14.2420 },             // Marina Grande
  buildingColors: ['#f2e3c6', '#f4d1a6', '#efc39b', '#f6efe2', '#e8b6a0', '#f1d58a', '#dcc7b0', '#f7f3ea'],
  palette: {
    autumn: { 0: '#46663a', 1: '#d6d0c2', 2: '#a9a467', 4: '#e4d6c2', 5: '#6f8550', 6: '#d2c8b4', 10: '#678c43' },
    spring: { 0: '#3f6a3a', 1: '#d9d4c7', 2: '#9fae62', 4: '#e6d8c4', 5: '#7a8c50', 6: '#e3d7bd', 10: '#6e9a45' },
  },
  decid: {
    autumn: [['#c99a3a', '#b07a2c', '#a38a3a', '#7f8a3a', '#c4862f'], ['#c99a3a', '#a38a3a']],   // chestnut, oak
    spring: [['#4f7f35', '#5a8a3a', '#46752f', '#62913f'], ['#5a8a3a', '#4f7f35']],
  },
  sky: {
    // Vesuvius over the Bay of Naples to the north, Ischia's Epomeo off west,
    // the Monti Picentini inland to the north-east; open sea to the south
    ranges: [[0.35, 2.0, 0.011, 0.016], [5.55, 6.15, 0.004, 0.006]],
    peaks: [[4.98, 0.06, 0.03, 1.3], [5.12, 0.03, 0.012, 1.2], [1.05, 0.12, 0.028, 1.3]],
    hero: [6.21, 0.2, 0.085, 1.15],
    snowy: 0, stars: 2, milky: 1,
  },
  stats: ({ data, nTrees, boats }) => {
    let km = 0;
    const d = data.drive || [];
    for (let i = 3; i < d.length; i += 3) km += Math.hypot(d[i] - d[i - 3], d[i + 1] - d[i - 2]);
    return `${Math.round(km / 1000)} km of coast road · ${boats} boats · ${Math.round(nTrees).toLocaleString()} trees · ${data.meta.attribution}`;
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 40.600, lon: 14.420, az: 0.1, polar: 0.9, zoom: 1.0 },
    { id: 'capri', label: 'Capri & the Faraglioni', lat: 40.548, lon: 14.240, az: -0.35, polar: 1.1, zoom: 3.4 },
    { id: 'positano', label: 'Positano', lat: 40.6281, lon: 14.4850, az: 0.05, polar: 1.15, zoom: 7 },
    { id: 'gods', label: 'Path of the Gods', lat: 40.631, lon: 14.515, az: 0.35, polar: 1.05, zoom: 5 },
    { id: 'furore', label: 'Fiordo di Furore', lat: 40.6205, lon: 14.5503, az: 0.1, polar: 1.15, zoom: 10 },
    { id: 'amalfi', label: 'Amalfi & Atrani', lat: 40.6345, lon: 14.6040, az: -0.15, polar: 1.12, zoom: 8 },
    { id: 'ravello', label: 'Ravello & Villa Cimbrone', lat: 40.6470, lon: 14.6118, az: 0.55, polar: 1.12, zoom: 9 },
    { id: 'galli', label: 'Li Galli', lat: 40.581, lon: 14.430, az: 0.2, polar: 1.05, zoom: 7 },
  ],
  film: ({ V, car, ferry }) => [
    { t: 0, target: V.overview, az: 0.15, polar: 0.88, zoom: 0.95, tod: 0.05 },
    { t: 6, target: V.capri, az: -0.4, polar: 1.1, zoom: 3.4, tod: 0.1 },
    { t: 12, target: ferry ? () => ferry.pos : V.capri, az: -0.1, polar: 1.05, zoom: 5, tod: 0.16 },
    { t: 18, target: V.positano, az: 0.05, polar: 1.15, zoom: 6.5, tod: 0.22 },
    { t: 24, target: car ? () => car.pos : V.positano, az: 0.3, polar: 1.08, zoom: 9, tod: 0.28 },
    { t: 30, target: V.furore, az: 0.15, polar: 1.12, zoom: 8, tod: 0.36 },
    { t: 36, target: V.amalfi, az: -0.2, polar: 1.12, zoom: 7, tod: 0.46 },
    { t: 42, target: V.ravello, az: 0.6, polar: 1.12, zoom: 8, tod: 0.58 },
    { t: 48, target: V.gods, az: -0.25, polar: 1.0, zoom: 3, tod: 0.7 },
    { t: 54, target: V.amalfi, az: 0.0, polar: 1.05, zoom: 5, tod: 0.95 },
    { t: 60, target: V.overview, az: 0.2, polar: 0.92, zoom: 1.05, tod: 1.0 },
  ],
};

export function sierraLoader(cfg) {
  return (ctx) => buildTerrainPlace({ ...ctx, cfg });
}
export { PI };
