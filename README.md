# Seattle Diorama

A stylized, tilt-able 3D diorama of Seattle Center down 5th Avenue to Westlake:
the **Space Needle**, the **Seattle Center Monorail** (Red and Blue trains running
on their beams) and **The Westin Seattle**'s twin towers, set in a city built from
OpenStreetMap data with late-October trees, traffic, and a morning-to-night slider.

## Quick start

```bash
pixi run city   # download OSM for the study area + build web/public/data/scene.json
pixi run dev    # npm install (first time) + open the viewer at http://localhost:5173
```

No network for OSM? `pixi run demo` builds a **synthetic** test city (fake street
grid, real landmark positions) so you can check the renderer. Run `pixi run city`
afterwards to replace it with real Seattle.

Other tasks: `pixi run refetch` (ignore the cached download), `pixi run bundle`
(static site in `web/dist/`, host it anywhere), `pixi run preview`.

## Making the film

The fly-through is scripted in `web/src/film.js`: a list of camera keyframes
(target, azimuth, tilt, zoom, time of day) that the camera glides through. The
default cut runs about 48 s: a morning establishing shot, a sweep around the
Needle, riding the Red train out of Seattle Center, an orbit of the Westin at
golden hour, then a pull back out as the city lights up.

There are two ways to get a video:

- **Quick: record in the browser.** In `pixi run dev`, click **Record video**.
  The film plays in real time and downloads as `.webm` or `.mp4` when it ends.
  **▶ Play the film** previews it without recording, and Esc stops it.
- **Best: render frame by frame.**

  ```bash
  pixi run film-setup                  # once: downloads the Chromium the renderer drives
  pixi run film                        # film/seattle-diorama.mp4, 1080p60
  pixi run film --res 3840x2160        # 4K
  pixi run film --seconds 8 --fps 30   # quick test
  pixi run film --headed               # use this if headless rendering is slow (no GPU)
  ```

  Each frame is rendered at an exact time and piped to ffmpeg, so the result is
  perfectly smooth no matter how fast your machine is.

To change the film, edit the `keys` in `film.js`. Each key is a moment, such
as `{ t: 21, target: red, az: -0.5, polar: 1.0, zoom: 7.5, tod: 0.38 }`.
`target` can be a fixed point or a function, such as the moving train.

## How it fits together

```
pipeline/
  config.py          study box, landmark coordinates, fallbacks
  fetch.py           Overpass API -> data/raw/osm.json (cached)
  build.py           OSM -> local meters -> clipped, simplified scene.json
  make_test_osm.py   synthetic Overpass-style data for offline testing
  film.py            frame-by-frame film renderer (Playwright + ffmpeg)
web/
  src/city.js        building extrusion + window shader, ground layers, slab
  src/landmarks.js   Space Needle, Westin towers, monorail beams + trains
  src/life.js        autumn trees (instanced), cars and buses
  src/film.js        the scripted fly-through (camera keyframes)
  src/main.js        ortho camera, lights, time of day, bloom, tilt-shift, UI
```

**Pipeline** (`build.py`): buildings get heights from `height`, then
`building:levels`, then a type-based default. Outlines that have
`building:part`s are skipped in favor of the parts. Water comes from
`natural=water` plus Elliott Bay rebuilt from `natural=coastline`. Roads are
buffered by class and unioned, with sidewalks as a ring around them. Street
trees come from mapped `natural=tree` nodes plus trees planted along
residential and arterial streets, and scattered through parks (seeded, so the
result is repeatable). The monorail uses `railway=monorail` if mapped.

**Viewer**: everything static is merged into a handful of draw calls. All
buildings are one mesh, and trees and cars are instanced. Windows aren't
geometry: a shader draws them from facade distance and floor height, and
lights a random subset at night. The camera is orthographic for the diorama
look, with the tilt left free (0.12–1.32 rad from vertical).

## Landmarks

These are procedural models with approximate, stylized dimensions:

- **Space Needle**: three leg pairs pinching to a waist, the 100-ft halo,
  the saucer with sunburst ribs, glass band and deck, roof cone and spire,
  plus two elevator cars riding the core on a ~41 s trip.
- **Westin**: scalloped "corncob" cylinders run through the same window
  shader. If OSM tags the round towers with "Westin", their real footprints
  and centers are used. Otherwise the code falls back to approximate
  coordinates in `config.py`.
- **Monorail**: beams on T-columns every ~28 m. Each train has four
  articulated cars that dwell at the stations and ease in and out.

URL params for screenshots and links: `?view=needle|westin|overview`,
`?t=0..1` (time of day), `?follow=0|1` (ride a train), `?tilt=0`.

Map data © OpenStreetMap contributors, ODbL.
