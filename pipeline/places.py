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

AMALFI = {
    "id": "amalfi",
    "name": "The Amalfi Coast",
    # Capri and Punta Campanella in the west to Ravello, Minori and Maiori in the east
    "bbox": (40.525, 14.180, 40.700, 14.660),
    "cell": 35,
    "vexag": 1.4,
    "dem": "terrarium",
    "tile_zoom": 13,
    "sea": True,
    "sea_floor": -140,
    "veg": "med",
    "maquis_top": 420,
    "rock_slope": 50,          # maquis clings to all but the sheerest limestone
    "treeline": 1300,
    "tree_cap": 60000,
    "tree_tall": 22,
    "min_building": 20,
    # the SS163 Amalfitana, Positano to Vietri; SS145 over to Sorrento
    "drive_rx": r"\bSS ?163\b|amalfitana",
    "labels": [
        ("Positano", r"^positano$", 40.6281, 14.4850, 80, "town"),
        ("Praiano", r"^praiano$", 40.6122, 14.5328, 70, "town"),
        ("Amalfi", r"^amalfi$", 40.6340, 14.6027, 80, "town"),
        ("Atrani", r"^atrani$", 40.6360, 14.6080, 50, "town"),
        ("Ravello", r"^ravello$", 40.6492, 14.6116, 80, "town"),
        ("Minori", r"^minori$", 40.6500, 14.6270, 50, "town"),
        ("Capri", r"^capri$", 40.5507, 14.2426, 80, "town"),
        ("Anacapri", r"^anacapri$", 40.5530, 14.2150, 70, "town"),
        ("Sorrento", r"^sorrento$", 40.6263, 14.3757, 80, "town"),
        ("Furore", r"^furore$", 40.6200, 14.5505, 60, "town"),
        ("Conca dei Marini", r"^conca dei marini$", 40.6168, 14.5717, 50, ""),
        ("Nocelle", r"^nocelle$", 40.6300, 14.5050, 50, ""),
        ("Monte Solaro", r"monte solaro", 40.5458, 14.2205, 60, "peak"),
        ("Monte Sant'Angelo a Tre Pizzi", r"sant.angelo a tre pizzi|tre pizzi", 40.6500, 14.4990, 70, "peak"),
        ("I Faraglioni", r"faraglion", 40.5420, 14.2620, 60, ""),
        ("Grotta Azzurra", r"grotta azzurra", 40.5605, 14.2055, 50, ""),
        ("Li Galli", r"^li galli$|isole li galli", 40.5810, 14.4300, 60, ""),
        ("Fiordo di Furore", r"fiordo di furore", 40.6205, 14.5503, 45, ""),
        ("Grotta dello Smeraldo", r"grotta (dello|di) smeraldo", 40.6150, 14.5640, 45, ""),
        ("Villa Cimbrone", r"villa cimbrone", 40.6440, 14.6122, 45, ""),
        ("Villa Rufolo", r"villa rufolo", 40.6488, 14.6123, 45, ""),
        ("Sentiero degli Dei", r"sentiero degli dei|path of the gods", 40.6320, 14.5200, 45, ""),
        ("Punta Campanella", r"punta campanella", 40.5690, 14.3270, 50, ""),
        ("Marina del Cantone", r"marina del cantone", 40.5850, 14.3520, 45, ""),
        ("Spiaggia di Arienzo", r"arienzo", 40.6215, 14.4970, 40, ""),
        ("Marina di Praia", r"marina di praia", 40.6115, 14.5385, 40, ""),
        ("Villa Jovis", r"villa jovis", 40.5555, 14.2650, 50, ""),
        ("Duomo di Amalfi", r"duomo di amalfi|cattedrale di sant.andrea", 40.6344, 14.6033, 45, ""),
    ],
    "falls": [],
    "walls": [],
    # ferries and boats where OSM doesn't map a route (lat, lon waypoints, all at sea)
    "boat_routes": [
        [(40.6255, 14.4850), (40.6150, 14.5150), (40.6120, 14.5500), (40.6260, 14.5900), (40.6315, 14.6030)],   # Positano - Amalfi
        [(40.6255, 14.4850), (40.6000, 14.4300), (40.5700, 14.3500), (40.5590, 14.2800), (40.5585, 14.2420)],   # Positano - Capri
        [(40.6315, 14.6030), (40.6420, 14.6260), (40.6440, 14.6420)],                                           # Amalfi - Minori - Maiori
    ],
    # yachts at anchor off the beaches and the stacks (lat, lon, radius m, count)
    "anchorages": [
        (40.6240, 14.4860, 450, 26),    # Positano
        (40.5440, 14.2560, 500, 30),    # Faraglioni and Marina Piccola
        (40.5600, 14.2400, 400, 18),    # Marina Grande
        (40.5830, 14.4300, 600, 18),    # Li Galli
        (40.5830, 14.3530, 450, 16),    # Marina del Cantone
        (40.6315, 14.6025, 400, 14),    # Amalfi
        (40.6190, 14.4990, 300, 10),    # Arienzo and Laurito
        (40.6110, 14.5390, 300, 8),     # Marina di Praia
    ],
}


ZERMATT = {
    "id": "zermatt",
    "name": "Zermatt & the Matterhorn",
    # the Matterhorn and the Zmutt glacier in the west to Monte Rosa in the east,
    # Zermatt village in the north to Klein Matterhorn and the Italian border
    "bbox": (45.918, 7.622, 46.040, 7.880),
    "cell": 18,
    "vexag": 1.25,
    "dem": "swissalti3d",                  # swisstopo 2 m elevation; Terrarium fills Italy
    "tile_zoom": 13,
    "veg": "alps",
    "treeline": 2250,
    "alpine_top": 2750,                    # alpine meadow gives way to scree and rock
    "rock_slope": 40,
    "tree_cap": 70000,
    "tree_tall": 26,
    "min_building": 20,
    "chalets": True,
    "alpine": True,
    "osm_extra": """
  way["aerialway"]{b};
  way["railway"~"^(rail|narrow_gauge|funicular|light_rail)$"]{b};
  way["piste:type"="downhill"]{b};
  node["aerialway"="station"]["name"]{b};
  node["tourism"~"^(alpine_hut|wilderness_hut)$"]{b};
  way["tourism"~"^(alpine_hut)$"]{b};
""",
    "labels": [
        ("Matterhorn", r"^matterhorn", 45.9763, 7.6586, 120, "peak"),
        ("Zermatt", r"^zermatt$", 46.0207, 7.7491, 90, "town"),
        ("Dufourspitze · Monte Rosa", r"^dufourspitze", 45.9369, 7.8668, 120, "peak"),
        ("Breithorn", r"^breithorn$", 45.9411, 7.7477, 110, "peak"),
        ("Klein Matterhorn", r"^klein matterhorn", 45.9381, 7.7298, 100, "peak"),
        ("Gornergrat", r"^gornergrat$", 45.9839, 7.7844, 90, "peak"),
        ("Liskamm", r"^liskamm|^lyskamm", 45.9225, 7.8350, 110, "peak"),
        ("Hörnlihütte", r"h(ö|oe)rnli", 45.9824, 7.6740, 70, ""),
        ("Gornergletscher", r"^gornergletscher", 45.9555, 7.8000, 80, ""),
        ("Riffelsee", r"^riffelsee$", 45.9887, 7.7699, 60, ""),
        ("Stellisee", r"^stellisee$", 46.0078, 7.8037, 60, ""),
        ("Schwarzsee", r"^schwarzsee$", 45.9925, 7.7090, 60, ""),
        ("Sunnegga", r"^sunnegga", 46.0122, 7.7698, 60, ""),
        ("Rothorn", r"^(unter)?rothorn$", 46.0198, 7.8027, 70, ""),
        ("Trockener Steg", r"^trockener steg", 45.9618, 7.7177, 60, ""),
        ("Furi", r"^furi$", 46.0040, 7.7320, 50, ""),
        ("Findeln", r"^findeln$", 46.0128, 7.7618, 50, ""),
        ("Zmutt", r"^zmutt$", 46.0093, 7.7238, 50, ""),
        ("Riffelalp", r"^riffelalp$", 45.9958, 7.7513, 50, ""),
        ("Monte Rosa Hütte", r"monte rosa.?h(ü|u)tte", 45.9547, 7.8132, 60, ""),
        ("Theodul Pass", r"^theodul", 45.9445, 7.7090, 60, ""),
    ],
    "falls": [],
    # climbers on the Hörnli ridge and the north face light up before dawn
    "walls": [(45.9790, 7.6650, 420), (45.9775, 7.6600, 300)],
}

PLACES = {p["id"]: p for p in (YOSEMITE, TUOLUMNE, MONO, AMALFI, ZERMATT)}
