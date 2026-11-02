# Torres del Paine flyover (forge3d)

A flight over Torres del Paine in Chilean Patagonia at sunrise, rendered with
[forge3d](https://github.com/milos-agathon/forge3d): up Lago Grey past the icebergs to the
Grey Glacier, east past Paine Grande, over Lago Pehoé to the Cuernos, up the Valle del
Francés, over the Cuernos and round to the Base de las Torres as the sun lights the towers.

It's the companion to the `torres` place in the diorama viewer, and it's adapted from the
[Icefields Parkway flyover](https://github.com/bdgroves/icefields-flyover).

Everything runs on GitHub Actions (`.github/workflows/torres-flyover.yml`, run it by hand):

1. **mode `data`**: Copernicus GLO-30 elevation (20 m, UTM 18S) and Sentinel-2 true colour
   (10 m) from the clearest summer passes, graded (`scripts/prep.py`), published to the
   `torres-flyover-data` branch. The flight map and logs go to `torres-flyover-log`.
2. **mode `stills`**: full-size frames at chosen seconds, to `torres-flyover-stills`.
3. **mode `film`**: the whole flight in parallel pieces, then the MP4, a web copy and a
   poster on `torres-flyover-video`.

To change the flight, edit `KEYS` in `scripts/flight.py` (`python scripts/flight.py` prints
the timing and, with the data present, draws the path on a map).

## Data

- **Terrain:** Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA (AWS open data).
- **Imagery:** Copernicus Sentinel-2 Level-2A (2024–2026 summers), via Element 84's Earth Search.
- **Sun:** February 10, 2026, 7:35 am in Magallanes (UTC-3), from forge3d's solar calculator.
