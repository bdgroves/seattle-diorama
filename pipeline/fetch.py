"""Download OpenStreetMap features for the study area via the Overpass API.

Usage:  pixi run fetch            (uses cache if present)
        pixi run refetch          (forces a new download)
"""
import json
import sys
import time

import requests

from config import BBOX, OVERPASS_URLS, RAW_DIR, RAW_OSM, USER_AGENT


def overpass_query(bbox):
    s, w, n, e = bbox
    b = f"({s},{w},{n},{e})"
    return f"""
[out:json][timeout:180];
(
  way["building"]{b};
  relation["building"]{b};
  way["building:part"]{b};
  relation["building:part"]{b};
  way["highway"]{b};
  way["railway"]{b};
  way["natural"="water"]{b};
  relation["natural"="water"]{b};
  way["natural"="coastline"]{b};
  way["leisure"~"^(park|garden|pitch|playground|dog_park)$"]{b};
  relation["leisure"~"^(park|garden)$"]{b};
  way["landuse"~"^(grass|recreation_ground|village_green|flowerbed)$"]{b};
  way["place"="square"]{b};
  node["natural"="tree"]{b};
);
out geom;
"""


def main():
    force = "--force" in sys.argv
    if RAW_OSM.exists() and not force:
        print(f"Using cached {RAW_OSM.relative_to(RAW_OSM.parents[2])} (pixi run refetch to update)")
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    q = overpass_query(BBOX)
    last_err = None
    for url in OVERPASS_URLS:
        for attempt in range(2):
            try:
                print(f"Querying {url} ...")
                r = requests.post(url, data={"data": q}, timeout=240,
                                  headers={"User-Agent": USER_AGENT})
                if r.status_code == 429 or r.status_code >= 500:
                    raise RuntimeError(f"HTTP {r.status_code}")
                r.raise_for_status()
                data = r.json()
                n = len(data.get("elements", []))
                if n == 0:
                    raise RuntimeError("empty response")
                RAW_OSM.write_text(json.dumps(data), encoding="utf-8")
                print(f"Saved {n:,} OSM elements -> {RAW_OSM}")
                return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                print(f"  failed: {exc}")
                time.sleep(4 + attempt * 6)
    sys.exit(f"All Overpass endpoints failed: {last_err}")


if __name__ == "__main__":
    main()
