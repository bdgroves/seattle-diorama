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

# The Spheres (Amazon), 7th & Lenora. Used if OSM has no footprints named
# "Spheres". lat, lon, radius_m, height_m
SPHERES_FALLBACK = [
    (47.61574, -122.33950, 20.0, 27.0),
    (47.61556, -122.33922, 16.0, 23.0),
    (47.61590, -122.33918, 13.0, 19.0),
]

# Place labels: (label, sub-label, OSM name regex, fallback lat, lon, height above ground m)
PLACES = [
    ("The Spheres", "Amazon · 7th & Lenora", r"\bspheres\b", 47.61574, -122.33935, 45),
    ("Olympic Sculpture Park", "Seattle Art Museum", r"olympic sculpture park", 47.61660, -122.35530, 30),
    ("Pike Place Market", "since 1907", r"^pike place market$", 47.60920, -122.34190, 40),
    ("Climate Pledge Arena", "Seattle Center", r"climate pledge arena", 47.62210, -122.35400, 40),
    ("MoPOP", "Museum of Pop Culture", r"museum of pop culture|^mopop$", 47.62145, -122.34810, 40),
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
