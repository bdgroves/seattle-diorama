"""Terrain dioramas: one entry per place.

bbox      (south, west, north, east) in WGS84
cell      target grid spacing in meters (the DEM is resampled to this)
vexag     vertical exaggeration (1.0 = true scale)
veg       how to fill land OSM doesn't classify: "sierra" (forest below
          treeline, granite where steep) or "eastside" (sagebrush below
          `sage_top`, Jeffrey pine above, granite where steep)
labels    (label, OSM-name regex, fallback lat, lon, height above ground m, kind)
          kind: "peak" shows the elevation, "fall" the drop, "" just the name
falls     (OSM-name regex, lat, lon, drop m) of waterfalls to animate
"""

YOSEMITE = {
    "id": "yosemite",
    "name": "Yosemite Valley",
    "bbox": (37.703, -119.690, 37.772, -119.515),
    "cell": 18,
    "vexag": 1.0,
    "veg": "sierra",
    "treeline": 3150,
    "labels": [
        ("El Capitan", r"^el capitan$", 37.7342, -119.6378, 70, "peak"),
        ("Half Dome", r"^half dome$", 37.7459, -119.5332, 70, "peak"),
        ("Glacier Point", r"^glacier point$", 37.7306, -119.5738, 60, "peak"),
        ("Yosemite Falls", r"^upper yosemite fall", 37.7568, -119.5965, 90, "fall"),
        ("Bridalveil Fall", r"^bridalveil fall", 37.7166, -119.6463, 70, "fall"),
        ("Sentinel Dome", r"^sentinel dome$", 37.7230, -119.5843, 60, "peak"),
        ("Cathedral Rocks", r"^cathedral rocks$", 37.7183, -119.6366, 60, "peak"),
        ("Three Brothers", r"three brothers|^eagle peak$", 37.7449, -119.6142, 60, "peak"),
        ("North Dome", r"^north dome$", 37.7586, -119.5545, 60, "peak"),
        ("Vernal Fall", r"^vernal fall", 37.7276, -119.5441, 60, "fall"),
        ("Nevada Fall", r"^nevada fall", 37.7246, -119.5334, 60, "fall"),
        ("Tunnel View", r"^tunnel view$", 37.7156, -119.6773, 40, ""),
        ("Camp 4", r"^camp 4$|^camp iv$", 37.7423, -119.6022, 35, ""),
        ("The Ahwahnee", r"ahwahnee", 37.7461, -119.5743, 40, ""),
    ],
    # (OSM-name regex, lat, lon of the lip, drop in m from NPS / Wikipedia)
    "falls": [
        (r"^upper yosemite fall", 37.7568, -119.5965, 436),
        (r"^lower yosemite fall", 37.7505, -119.5968, 98),
        (r"^bridalveil fall", 37.7163, -119.6467, 189),
        (r"^vernal fall", 37.7276, -119.5441, 97),
        (r"^nevada fall", 37.7247, -119.5330, 181),
        (r"^ribbon fall", 37.7395, -119.6510, 491),
        (r"^horsetail fall", 37.7300, -119.6290, 305),
    ],
    # climbers on the big walls light up at night
    "walls": [
        (37.7310, -119.6365, 600),   # El Capitan, the Nose and Salathé side
        (37.7459, -119.5332, 450),   # Half Dome's NW face
    ],
}

TUOLUMNE = {
    "id": "tuolumne",
    "name": "Tuolumne Meadows",
    "bbox": (37.832, -119.440, 37.905, -119.315),
    "cell": 16,
    "vexag": 1.25,
    "veg": "sierra",
    "treeline": 3250,
    "labels": [
        ("Lembert Dome", r"^lembert dome$", 37.8793, -119.3490, 60, "peak"),
        ("Cathedral Peak", r"^cathedral peak$", 37.8475, -119.4050, 70, "peak"),
        ("Unicorn Peak", r"^unicorn peak$", 37.8525, -119.3953, 60, "peak"),
        ("Pothole Dome", r"^pothole dome$", 37.8774, -119.3935, 50, "peak"),
        ("Fairview Dome", r"^fairview dome$", 37.8778, -119.4192, 60, "peak"),
        ("Dog Dome", r"^dog dome$", 37.8810, -119.3550, 45, "peak"),
        ("Tuolumne Meadows", r"^tuolumne meadows$", 37.8734, -119.3690, 40, ""),
        ("Cathedral Lakes", r"cathedral lake", 37.8434, -119.4166, 40, ""),
        ("Soda Springs", r"^soda springs$", 37.8790, -119.3640, 35, ""),
    ],
    "falls": [],
    "walls": [],
}

MONO = {
    "id": "mono",
    "name": "Mono Lake",
    "bbox": (37.900, -119.205, 38.080, -118.860),
    "cell": 45,
    "vexag": 1.7,
    "veg": "eastside",
    "sage_top": 2350,
    # dark volcanic ground (Negit is black cinder; Paoha is pale lake sediment)
    "lava": [r"^negit island$"],
    "treeline": 3300,
    "labels": [
        ("Mono Lake", r"^mono lake$", 38.0050, -119.0500, 60, ""),
        ("Negit Island", r"^negit island$", 38.0255, -119.0505, 90, ""),
        ("Paoha Island", r"^paoha island$", 38.0010, -119.0290, 90, ""),
        ("South Tufa", r"^south tufa", 37.9401, -119.0277, 70, ""),
        ("Panum Crater", r"^panum crater$", 37.9257, -119.0461, 90, "peak"),
        ("Lee Vining", r"^lee vining$", 37.9575, -119.1218, 70, ""),
        ("Mono Lake County Park", r"mono lake county park", 38.0207, -119.1474, 60, ""),
        ("Black Point", r"^black point$", 38.0465, -119.1000, 80, "peak"),
    ],
    "falls": [],
    "walls": [],
    # tufa towers grow along these shores (lat, lon, radius m, count)
    "tufa": [
        (37.9405, -119.0272, 420, 110),  # South Tufa
        (37.9430, -119.0205, 300, 35),   # Navy Beach
        (38.0215, -119.1465, 260, 30),   # County Park
        (38.0050, -119.1520, 250, 20),   # Old Marina
    ],
    # California gulls nest on the islets around Negit
    "gulls": (38.0255, -119.0505),
}

PLACES = {p["id"]: p for p in (YOSEMITE, TUOLUMNE, MONO)}
