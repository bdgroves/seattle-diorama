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
    id: 'amalfi', name: 'Amalfi Coast', tz: 'Europe/Rome',
    eyebrow: 'Campania, Italy', title: 'The Amalfi <em>Coast</em>',
    blurb: 'Capri, Positano, Ravello and the coast road, cliffs dropping into a turquoise sea.',
    lat: 40.62, lon: 14.45, where: 'on the Amalfi Coast',
    load: () => import('./sierra.js').then((m) => m.sierraLoader(m.AMALFI)),
  },
  {
    id: 'zermatt', name: 'Zermatt', tz: 'Europe/Zurich',
    eyebrow: 'Valais, Switzerland', title: 'Zermatt <em>&amp;</em> the Matterhorn',
    blurb: 'Gondolas, the Gornergrat railway, ski pistes, chalets and cows below the Matterhorn, on swisstopo elevation.',
    lat: 46.0, lon: 7.75, where: 'in Zermatt',
    load: () => import('./zermatt.js').then((m) => m.zermattLoader()),
  },
  {
    id: 'dakar', name: 'Dakar Rally 2027', tz: 'Africa/Casablanca',
    eyebrow: 'Portugal & Morocco · 9–23 January 2027', title: 'Dakar <em>2027</em>',
    blurb: 'The 49th Dakar: the Algarve, a ferry to Africa, and twelve stages across Morocco to Marrakech.',
    lat: 30.9, lon: -7.0, where: 'in Morocco',
    load: () => import('./dakar.js').then((m) => m.dakarLoader()),
  },
];
