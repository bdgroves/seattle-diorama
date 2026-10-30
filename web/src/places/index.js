// Every diorama the viewer can show. `?place=<id>` picks one.
export const PLACES = [
  {
    id: 'seattle', name: 'Seattle',
    eyebrow: 'Seattle, Washington', title: 'Seattle Center <em>to</em> Westlake',
    blurb: 'The Needle, the Monorail and the Westin, rebuilt from open map data.',
    lat: 47.6205, lon: -122.3493, where: 'in Seattle',
    load: () => import('./seattle.js').then((m) => m.load),
  },
  {
    id: 'yosemite', name: 'Yosemite Valley',
    eyebrow: 'Yosemite National Park, California', title: 'Yosemite <em>Valley</em>',
    blurb: 'El Capitan, Half Dome and the falls, carved from USGS elevation data.',
    lat: 37.737, lon: -119.60, where: 'in Yosemite',
    load: () => import('./sierra.js').then((m) => m.sierraLoader(m.YOSEMITE)),
  },
  {
    id: 'tuolumne', name: 'Tuolumne Meadows',
    eyebrow: 'Yosemite high country, California', title: 'Tuolumne <em>Meadows</em>',
    blurb: 'Granite domes, the Tuolumne River and Cathedral Peak at 8,600 feet.',
    lat: 37.873, lon: -119.36, where: 'at Tuolumne Meadows',
    load: () => import('./sierra.js').then((m) => m.sierraLoader(m.TUOLUMNE)),
  },
  {
    id: 'mono', name: 'Mono Lake',
    eyebrow: 'Mono Basin, California', title: 'Mono <em>Lake</em>',
    blurb: 'Tufa towers, Negit and Paoha, and the Sierra rising behind the lake.',
    lat: 37.99, lon: -119.04, where: 'at Mono Lake',
    load: () => import('./sierra.js').then((m) => m.sierraLoader(m.MONO)),
  },
];
