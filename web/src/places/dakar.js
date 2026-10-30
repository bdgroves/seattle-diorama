// The Dakar Rally 2027: the Algarve to Marrakech, 9-23 January. A terrain
// slab of southern Iberia and Morocco (built at 1/40 scale, see
// pipeline/dakar.py) with the route, bivouacs and a convoy on top.
// Camera az 0 sits out over the Sahara looking north to the Atlas and Spain.
import { buildTerrainPlace } from '../terrain.js';
import { buildRally } from '../rally.js';

const DAKAR = {
  id: 'dakar',
  contour: 500,
  snowAutumn: 2450, snowSpring: 2450,     // January on the High Atlas and the Sierra Nevada
  noSeason: true,
  waterColor: '#2f7fa8',
  seabedScale: 9,
  boatScale: 9, boatSpeed: 14,
  steep: [0.42, 0.2],
  soften: 2,
  dunes: { cls: 11, spacing: 46 },
  weather: { mode: 'rain', label: 'Winter storm', toast: 'An Atlantic storm sweeps in over the Atlas' },
  palette: {
    autumn: {
      0: '#40603a', 1: '#a88466', 2: '#8ea558', 4: '#d6b99a', 5: '#b2a376', 6: '#ddb987',
      8: '#9b8670', 9: '#c49c70', 10: '#3f6e2c', 11: '#eaa45b',
    },
  },
  sky: {
    // the open desert: low hills all round, the Atlas a faint line to the north
    ranges: [[0, 6.3, 0.004, 0.007], [2.6, 3.9, 0.008, 0.012]],
    peaks: [],
    snowy: 0, stars: 2, milky: 1,
  },
  vehicleScale: 32,
  followZoom: 9,
  viewStages: {
    overview: [],
    algarve: ['P', '1'],
    strait: ['1', 'T'],
    bouarfa: ['2', '3'],
    merzouga: ['4'],
    zagora: ['5', '6'],
    agadir: ['6', '7'],
    smara: ['8', '9', '10'],
    marrakech: ['11', '12'],
  },
  viewToasts: {
    atlas: 'Jbel Toubkal, 4,167 m: the highest peak in North Africa, snow-capped in January',
    canaries: 'The Canary Islands, with Teide (3,715 m) on Tenerife',
  },
  stats: ({ data }) => {
    const e = data.rally.edition;
    return `${e.stages} stages · ${(e.special_km || 0).toLocaleString()} km of specials · ${(e.total_km || 0).toLocaleString()} km in all · `
      + `stages drawn town to town (ASO doesn't publish the tracks) · built at 1/40 scale, heights ×9 · ${data.meta.attribution}`;
  },
  views: [
    { id: 'overview', label: 'Overview', lat: 31.2, lon: -8.0, az: 0.0, polar: 0.8, zoom: 1.0 },
    { id: 'algarve', label: 'Algarve: the start', lat: 37.1, lon: -7.4, az: 0.2, polar: 1.0, zoom: 3.2 },
    { id: 'strait', label: 'The strait & the ferry', lat: 35.9, lon: -4.6, az: -0.4, polar: 1.0, zoom: 2.8 },
    { id: 'bouarfa', label: 'Bouârfa loops', lat: 32.5, lon: -2.4, az: 0.6, polar: 1.0, zoom: 3.0 },
    { id: 'merzouga', label: 'Merzouga dunes', lat: 31.13, lon: -4.0, az: 0.3, polar: 1.05, zoom: 9 },
    { id: 'zagora', label: 'Zagora & the Draa', lat: 30.2, lon: -5.9, az: 0.2, polar: 1.0, zoom: 3.4 },
    { id: 'atlas', label: 'High Atlas & Toubkal', lat: 31.2, lon: -7.9, az: 2.95, polar: 1.12, zoom: 4.5 },
    { id: 'agadir', label: 'Agadir: rest day', lat: 30.0, lon: -9.4, az: -0.5, polar: 1.0, zoom: 3.0 },
    { id: 'smara', label: 'Smara & the refuge', lat: 26.3, lon: -12.6, az: 0.3, polar: 0.95, zoom: 2.4 },
    { id: 'marrakech', label: 'Marrakech: the finish', lat: 31.63, lon: -8.0, az: -0.3, polar: 1.05, zoom: 6 },
    { id: 'canaries', label: 'Canary Islands', lat: 28.3, lon: -15.5, az: -0.2, polar: 1.0, zoom: 3.2 },
  ],
  film: ({ V, extra }) => {
    const bikes = extra?.leads?.bikes;
    return [
      { t: 0, target: V.overview, az: 0.05, polar: 0.8, zoom: 0.95, tod: 0.06 },
      { t: 6, target: V.algarve, az: 0.2, polar: 1.0, zoom: 3.0, tod: 0.12 },
      { t: 12, target: V.strait, az: -0.4, polar: 1.0, zoom: 2.8, tod: 0.18 },
      { t: 18, target: V.bouarfa, az: 0.6, polar: 1.0, zoom: 2.8, tod: 0.24 },
      { t: 24, target: V.merzouga, az: 0.3, polar: 1.05, zoom: 7, tod: 0.32 },
      { t: 30, target: bikes ? () => bikes.pos : V.zagora, az: 0.5, polar: 1.05, zoom: 9, tod: 0.4 },
      { t: 37, target: V.atlas, az: 2.95, polar: 1.1, zoom: 4.2, tod: 0.5 },
      { t: 43, target: V.agadir, az: -0.5, polar: 1.0, zoom: 3.0, tod: 0.6 },
      { t: 49, target: V.smara, az: 0.3, polar: 0.95, zoom: 2.4, tod: 0.7 },
      { t: 55, target: V.marrakech, az: -0.3, polar: 1.05, zoom: 5, tod: 0.9 },
      { t: 61, target: V.overview, az: 0.1, polar: 0.82, zoom: 1.0, tod: 1.0 },
    ];
  },
};
DAKAR.extras = (ctx) => buildRally({ ...ctx, cfg: DAKAR });

export function dakarLoader() {
  return (ctx) => buildTerrainPlace({ ...ctx, cfg: DAKAR });
}
