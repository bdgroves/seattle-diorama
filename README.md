# Seattle Diorama

**[▶ Open the live diorama](https://bdgroves.github.io/seattle-diorama/)**

A hand-crafted-looking, fully procedural 3D diorama of Seattle, from the Space
Needle down 5th Avenue to Westlake. It is built entirely from open map data and
a few hundred lines of shader code, and runs at 60 fps in the browser.

![Seattle diorama at golden hour, with Mount Rainier behind downtown](docs/hero.jpg)

## What's in it

- **The real city.** About 1,500 buildings from OpenStreetMap with their mapped
  heights, plus the street grid, the Elliott Bay waterfront and piers, and
  Seattle Center's grounds. A GitHub Action re-pulls the map every week.
- **The Space Needle, built by hand.** Three leg pairs pinch to the waist, with
  the 100-ft halo, a sunburst under the saucer, a glowing restaurant band at
  night and a blinking beacon. Two elevators ride the core on a ~41-second trip,
  like the real ones.
- **The Monorail, running.** The Red and Blue trains run on the actual beams
  between Seattle Center and Westlake. They accelerate, cruise, brake and dwell
  at the stations. Click **Ride along** to follow one.
- **The Westin's twin towers.** The ribbed "corncob" cylinders on 5th Avenue,
  placed from their real OSM footprints.
- **The mountains.** Rainier rises behind downtown when you face south-east,
  the Olympics stand across the Sound, and Baker sits to the north. The
  panorama turns with the camera and goes rosy at sunset.
- **Seattle weather.** Toggle **Rain** for drizzle, wet streets and a lower
  sky, and **Live sun** to light the city by where the sun really is over
  Seattle right now.
- **Life.** About 8,700 trees in late-October color, plus cars, Metro buses,
  and a Washington State Ferry crossing Elliott Bay.
- **Day to night.** At night the windows light up, the streets glow sodium
  orange and the saucer shines.

| | |
|---|---|
| ![Seattle Center](docs/needle_hero.jpg) | ![Seattle at night](docs/night_hero.jpg) |

## Quick start

Requires [pixi](https://pixi.sh).

```bash
pixi run city   # download OpenStreetMap for the study area + build the scene
pixi run dev    # open the viewer at http://localhost:5173
```

In the viewer:

- **Drag** to orbit, **right-drag** to pan and **scroll** to zoom. The tilt
  goes all the way from map view to street level.
- **Fly to** the Needle or the Westin, or **ride along** with a train.
- **Photo · 4K** saves a still. **Copy link to view** puts the exact camera,
  time and weather in a shareable URL.

If the Overpass API is down, `pixi run demo` builds a synthetic test city so
you can still work on the renderer.

## Making the film

The fly-through is scripted in [`web/src/film.js`](web/src/film.js) as a list of
camera keyframes (target, azimuth, tilt, zoom and time of day). The camera
glides through them on Catmull-Rom splines. The default cut runs 48 seconds:

1. A morning establishing shot.
2. A sweep around the Needle.
3. Riding the Red train out of Seattle Center.
4. An orbit of the Westin at golden hour.
5. A pull back out as the city lights up.

There are two ways to get the video:

- **Quick: record in the browser.** Click **Record video** in the viewer. It
  plays in real time and downloads when it ends.
- **Best: render frame by frame.** This drives a browser with Playwright and
  pipes every frame to ffmpeg, so the video is perfectly smooth on any machine.

  ```bash
  pixi run film-setup                  # once
  pixi run film                        # film/seattle-diorama.mp4, 1080p60
  pixi run film --res 3840x2160        # 4K
  pixi run film --seconds 8 --fps 30   # quick test
  pixi run film --headed               # if headless rendering has no GPU
  ```

## How it works

```
OpenStreetMap ──Overpass──▶ fetch.py ──▶ build.py ──▶ scene.json ──▶ Three.js viewer
                                         shapely:                     merged meshes,
                                         project, clip,               window shader,
                                         buffer roads,                instancing,
                                         rebuild the bay              procedural sky
```

**Pipeline** (Python + shapely, [`pipeline/build.py`](pipeline/build.py)):

- **Projection.** Everything is projected to a local meter grid, clipped to the
  study box and simplified.
- **Building heights.** Heights come from `height`, then `building:levels`,
  then a type-based default. When a building is split into `building:part`s,
  the parts are used instead of the outline.
- **Elliott Bay.** Rebuilt by splitting the box along `natural=coastline`;
  OSM keeps land on the left of the line.
- **Roads.** Buffered by class and unioned, with sidewalks as a ring around
  them.
- **Street trees.** Planted along arterials with a seeded generator so the city
  is identical on every build.

**Viewer** (Three.js, [`web/src`](web/src)):

- **Draw calls.** All buildings are one merged mesh, and trees, cars and buses
  are instanced. The whole city is a handful of draw calls.
- **Windows.** They are a shader, not geometry. A procedural grid is driven by
  the distance along each facade and the floor height, anti-aliased with
  `fwidth`, and a random subset lights up at night.
- **Camera.** It is orthographic for the diorama look. Shadows follow the
  view, and the shadow map snaps to texels so it doesn't shimmer.
- **Post-processing.** Bloom for the night glow, tilt-shift for the miniature
  look, and ACES tone mapping.
- **Sky and mountains.** Both are one full-screen shader. The mountain
  panorama is drawn from compass bearings, and the horizon sits behind the far
  edge of the slab.
- **Live sun.** It uses the NOAA solar position algorithm for Seattle.

**CI**: [`.github/workflows/build.yml`](.github/workflows/build.yml) runs on
every push and weekly. It fetches OSM, builds the scene, bundles the viewer and
deploys to GitHub Pages. The built `scene.json` is also kept on the
`scene-data` branch.

## Project layout

```
pipeline/   config.py · fetch.py · build.py · film.py · make_test_osm.py
web/src/    main.js · city.js · landmarks.js · life.js · bay.js · weather.js · sky.js · film.js
```

URL parameters: `?view=needle|westin|overview` · `?t=0..1` (time of day) ·
`?rain=1` · `?live=1` · `?follow=0|1` · `?tilt=0` · `?ui=0` · `?film=play`

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, ODbL. Landmark models are stylized interpretations.
