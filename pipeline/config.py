"""Study area and landmark settings shared by the pipeline scripts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW_OSM = RAW_DIR / "osm.json"
SCENE_OUT = ROOT / "web" / "public" / "data" / "scene.json"

# Seattle Center (Space Needle) down 5th Ave to Westlake, with a slice of
# Elliott Bay on the west edge.  (south, west, north, east) in WGS84.
BBOX = (47.6085, -122.3615, 47.6260, -122.3330)

# Local origin for the planar meter grid (middle of the box).
ORIGIN = ((BBOX[0] + BBOX[2]) / 2.0, (BBOX[1] + BBOX[3]) / 2.0)

# Landmarks that get hand-built models instead of OSM extrusions.
SPACE_NEEDLE = (47.62051, -122.34928)   # lat, lon
NEEDLE_CLEAR_RADIUS = 32.0              # m; OSM features inside are dropped

# The Westin Seattle, 1900 5th Ave.  Approximate tower centres used only if
# OSM does not tag the two round towers with a "Westin" name.
WESTIN_FALLBACK = [
    # lat, lon, radius_m, height_m
    (47.61392, -122.33818, 19.0, 125.0),
    (47.61336, -122.33768, 19.0, 133.0),
]

# Approximate monorail alignment, only used if OSM has no railway=monorail.
MONORAIL_FALLBACK = [
    (47.62165, -122.34905),
    (47.62060, -122.34840),
    (47.61930, -122.34750),
    (47.61840, -122.34680),
    (47.61690, -122.34450),
    (47.61520, -122.34190),
    (47.61350, -122.33910),
    (47.61190, -122.33740),
]

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

USER_AGENT = "seattle-diorama/0.1 (personal cartography project)"
