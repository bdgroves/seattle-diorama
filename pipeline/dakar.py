"""The Dakar Rally 2027 as a diorama: Portugal's Algarve to Marrakech.

    python pipeline/dakar.py fetch     elevation tiles (cached in data/raw/)
    python pipeline/dakar.py build     web/public/data/dakar.json + dakar.bin
    python pipeline/dakar.py all

Unlike the other terrain places this one is ~1,600 km across, so it is built
at a smaller scale: everything in the scene is `1 / SCALE` of real size
(meta.scale), which keeps the slab about the size of the Amalfi one and lets
the viewer's camera, water and lighting work unchanged.

Landcover comes from geography rather than OpenStreetMap (far too much OSM
for a box this big): the desert grows southward and in the rain shadow of the
Atlas, with the real dune seas (ergs), palm oases and cities painted on.

The route comes from brooksgroves.com/dakar.json (the tracker page), with
data/dakar-route.json as a fallback. ASO publishes towns and distances, not
tracks, so stages are drawn town to town; loop stages are drawn as rings
whose length matches the published special. A few waypoints keep lines off
the sea (marked below).
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from terrain import (ALPINE, DEVELOPED, FOREST, GROVE, LAVA, MEADOW, ROCK, SAGE, SAND, WATER,  # noqa: E402
                     Grid, bilinear, fetch_dem_terrarium)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"
ERG = 11                       # dune seas (the viewer gets a palette entry and dune shading)

PLACE = {
    "id": "dakar",
    "name": "Dakar Rally 2027",
    # Madeira and Tenerife in the west to Bouârfa and Figuig in the east,
    # Seville and the Algarve in the north to the Smara desert in the south
    "bbox": (24.6, -17.4, 38.0, -0.8),
    "cell": 2000,              # real metres
}
TILE_ZOOM = 8
SCALE = 40                     # scene metres = real metres / SCALE
VEXAG = 16                     # vertical exaggeration over the (scaled) horizontal
SEA_FLOOR = -1500              # clamp the abyssal Atlantic so the slab stays shallow
ROUTE_URL = "https://brooksgroves.com/dakar.json"

# dune seas: (name, lat, lon, half-length km, half-width km, bearing of the long axis)
ERGS = [
    ("Erg Chebbi", 31.13, -3.99, 14, 4.5, 0),
    ("Erg Chegaga", 29.86, -5.98, 22, 8, 80),
    ("Erg Znaigui", 30.05, -5.75, 8, 3, 60),
    ("Erg Iguidi", 26.85, -6.6, 190, 38, 62),
    ("Erg er Raoui", 29.6, -2.3, 95, 35, 150),
    ("Laayoune dunes", 27.35, -13.05, 55, 12, 30),
    ("Tarfaya dunes", 27.85, -12.55, 30, 8, 35),
    ("Smara dunes", 26.35, -12.25, 45, 10, 25),
    ("Tafilalt sands", 30.85, -4.4, 18, 6, 20),
]
# palm oases and irrigated valleys: lat/lon polylines
OASES = [
    [(30.92, -6.90), (30.70, -6.45), (30.48, -6.05), (30.33, -5.84), (30.10, -5.65), (29.97, -5.58), (29.82, -5.72)],  # Draa
    [(31.93, -4.43), (31.70, -4.36), (31.43, -4.23), (31.28, -4.26)],                                                   # Ziz / Tafilalt
    [(30.92, -6.90), (31.06, -6.56), (31.24, -6.13), (31.37, -5.99), (31.51, -5.53)],                                  # Dadès / Todra
    [(30.42, -9.55), (30.47, -9.2), (30.47, -8.88), (30.55, -8.5)],                                                     # Souss
    [(32.11, -1.23), (32.15, -1.28)],                                                                                   # Figuig
    [(28.98, -10.06), (29.05, -10.0)],                                                                                  # Guelmim
]
# (name, lat, lon, radius km, label?)  - built-up area, night lights
CITIES = [
    ("Casablanca", 33.57, -7.59, 13, True), ("Rabat", 34.01, -6.83, 8, True), ("Marrakech", 31.63, -8.0, 9, False),
    ("Fès", 34.03, -5.0, 7, True), ("Meknes", 33.89, -5.55, 5, False), ("Tangier", 35.76, -5.83, 6, True),
    ("Tétouan", 35.57, -5.37, 4, False), ("Kenitra", 34.26, -6.58, 5, False), ("Oujda", 34.68, -1.91, 5, False),
    ("Nador", 35.17, -2.93, 4, True), ("Agadir", 30.42, -9.58, 6, False), ("Safi", 32.3, -9.24, 4, False),
    ("El Jadida", 33.25, -8.5, 3, False), ("Essaouira", 31.51, -9.77, 2, True), ("Beni Mellal", 32.34, -6.36, 4, False),
    ("Khouribga", 32.88, -6.91, 3, False), ("Ouarzazate", 30.92, -6.9, 3, True), ("Errachidia", 31.93, -4.43, 2.5, False),
    ("Taroudant", 30.47, -8.88, 2.5, False), ("Guelmim", 28.99, -10.06, 3, False), ("Tan-Tan", 28.44, -11.1, 2.5, False),
    ("Laayoune", 27.15, -13.2, 4, True), ("Zagora", 30.33, -5.84, 2, False), ("Bouârfa", 32.53, -1.95, 2, False),
    ("Smara", 26.74, -11.67, 2.5, False), ("Figuig", 32.11, -1.23, 2, False),
    ("Seville", 37.39, -5.98, 8, True), ("Málaga", 36.72, -4.42, 6, True), ("Granada", 37.18, -3.6, 5, False),
    ("Córdoba", 37.88, -4.78, 5, False), ("Cádiz", 36.53, -6.29, 3, False), ("Jerez", 36.69, -6.13, 4, False),
    ("Algeciras", 36.13, -5.45, 4, False), ("Almería", 36.84, -2.46, 4, False), ("Huelva", 37.26, -6.95, 3, False),
    ("Faro", 37.02, -7.93, 3, False), ("Portimão", 37.14, -8.54, 2, False),
    ("Las Palmas", 28.12, -15.43, 5, False), ("Santa Cruz de Tenerife", 28.47, -16.25, 4, False),
    ("Funchal", 32.65, -16.91, 3, False), ("Arrecife", 28.96, -13.55, 2, False), ("Puerto del Rosario", 28.5, -13.86, 2, False),
]
# geography labels: (text, lat, lon, kind, lift m, real elevation for peaks)
GEO = [
    ("Jbel Toubkal", 31.06, -7.915, "peak", 400, 4167),
    ("Teide", 28.272, -16.642, "peak", 400, 3715),
    ("Mulhacén", 37.053, -3.311, "peak", 400, 3479),
    ("High Atlas", 31.55, -6.3, "", 900, None),
    ("Anti-Atlas", 29.95, -8.2, "", 700, None),
    ("Middle Atlas", 33.3, -4.85, "", 900, None),
    ("Rif", 35.0, -4.55, "", 700, None),
    ("Erg Chebbi · Merzouga", 31.13, -3.99, "", 500, None),
    ("Erg Chegaga", 29.86, -5.98, "", 500, None),
    ("Draa Valley", 30.55, -6.25, "", 500, None),
    ("Sahara", 27.4, -8.6, "", 900, None),
    ("Atlantic Ocean", 31.3, -13.2, "sea", 600, None),
    ("Alboran Sea", 36.0, -3.6, "sea", 500, None),
    ("Canary Islands", 28.1, -15.1, "sea", 900, None),
    ("Madeira", 32.75, -16.95, "", 500, None),
    ("Casablanca", 33.57, -7.59, "", 400, None), ("Rabat", 34.01, -6.83, "", 400, None),
    ("Fès", 34.03, -5.0, "", 400, None), ("Tangier", 35.76, -5.83, "", 400, None),
    ("Seville", 37.39, -5.98, "", 400, None), ("Málaga", 36.72, -4.42, "", 400, None),
    ("Ouarzazate", 30.92, -6.9, "", 400, None), ("Essaouira", 31.51, -9.77, "", 400, None),
    ("Laayoune", 27.15, -13.2, "", 400, None), ("Nador", 35.17, -2.93, "", 400, None),
]
# Extra points where a straight town-to-town line would run out over the sea
# or miss a place the stage is known to visit (diorama only, approximate).
VIA = {
    "1": [(37.30, -7.40), (37.32, -6.55), (36.88, -5.90)],   # Algarve east to the strait, overland
    "4": [(31.10, -4.01)],                                     # "Through the Merzouga dunes"
}
# the ferry to Nador: across the Alboran Sea (port not yet named)
FERRY = [(36.10, -5.32), (35.95, -4.60), (35.62, -3.60), (35.30, -2.98), (35.20, -2.93)]
# loops: direction (degrees, 0 = north, clockwise) the ring heads from its town
LOOP_DIR = {"P": 20, "2": 235, "3": 300, "5": 190, "10": 100, "12": 330}
# shipping: through the strait, and the Canaries ferries (lat, lon) - all at sea
SHIPS = [
    [(36.4, -9.5), (36.05, -6.6), (35.95, -5.6), (36.0, -4.6), (36.25, -2.6), (36.6, -0.9)],
    [(35.7, -9.2), (35.85, -6.4), (35.93, -5.6), (35.98, -4.8), (36.1, -3.0)],
    [(28.15, -15.38), (28.32, -15.9), (28.45, -16.2)],
    [(28.14, -15.38), (28.6, -14.6), (28.9, -13.6)],
    [(32.62, -16.85), (31.5, -15.6), (29.8, -14.2), (28.5, -13.8)],
]


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def noise(shape, cells, seed):
    rs = np.random.default_rng(seed)
    small = (rs.random((cells + 2, cells + 2)) * 255).astype(np.uint8)
    im = Image.fromarray(small).resize((shape[1], shape[0]), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255.0


def load_route():
    try:
        r = requests.get(ROUTE_URL, timeout=30, headers={"User-Agent": "seattle-diorama (dakar)"})
        r.raise_for_status()
        d = r.json()
        assert d["route"]["stages"]
        print(f"  route from {ROUTE_URL} (updated {d.get('updated')})")
        return d
    except Exception as exc:  # noqa: BLE001
        print(f"  route: {ROUTE_URL} unavailable ({exc}); using data/dakar-route.json")
        return json.loads((ROOT / "data" / "dakar-route.json").read_text(encoding="utf-8"))


def fetch(force=False):
    RAW.mkdir(parents=True, exist_ok=True)
    g = Grid(PLACE)
    path = RAW / "dakar_dem.npy"
    if path.exists() and not force:
        print(f"[dakar] cached elevation {path.name}")
        return
    print(f"[dakar] Terrarium z{TILE_ZOOM} tiles onto {g.nx} x {g.ny} @ {PLACE['cell']} m ...")
    dem = fetch_dem_terrarium(g, TILE_ZOOM)
    np.save(path, dem)
    (RAW / "dakar_dem.src").write_text("Terrain Tiles on AWS (SRTM, ETOPO1 bathymetry)")
    print(f"  elevation {dem.min():.0f} to {dem.max():.0f} m")


def build():
    g = Grid(PLACE)
    dem = np.load(RAW / "dakar_dem.npy").astype(np.float32)
    bad = ~np.isfinite(dem)
    dem[bad] = 0
    dem = np.maximum(dem, SEA_FLOOR)
    ny, nx = dem.shape
    lat = np.linspace(g.bbox[2], g.bbox[0], ny)[:, None] * np.ones((1, nx))
    lon = np.ones((ny, 1)) * np.linspace(g.bbox[1], g.bbox[3], nx)[None, :]
    print(f"[dakar] grid {nx} x {ny} @ {g.dx:.0f} m, elevation {dem.min():.0f} to {dem.max():.0f} m")

    # ---- the sea: below sea level and connected to the edge of the box
    # (inland depressions like Sebkha Tah stay land)
    sea = np.zeros_like(dem, bool)
    low = dem < 0.5
    q = deque()
    for j in range(ny):
        for i in (0, nx - 1):
            if low[j, i] and not sea[j, i]:
                sea[j, i] = True; q.append((j, i))
    for i in range(nx):
        for j in (0, ny - 1):
            if low[j, i] and not sea[j, i]:
                sea[j, i] = True; q.append((j, i))
    while q:
        j, i = q.popleft()
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = j + dj, i + di
            if 0 <= a < ny and 0 <= b < nx and low[a, b] and not sea[a, b]:
                sea[a, b] = True; q.append((a, b))
    land = ~sea
    dem[sea] = np.minimum(dem[sea], -8.0)          # a clean shoreline
    dem[land] = np.maximum(dem[land], 1.0)
    print(f"  sea {sea.mean() * 100:.0f}% of the box")

    # ---- slope (real degrees) and the Atlantic rain shadow
    gy, gx = np.gradient(dem, g.dy, g.dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    hland = np.where(land, dem, 0.0)
    barrier = np.zeros_like(dem)
    az = math.radians(295)                            # moist air arrives from the west-north-west
    jj, ii = np.mgrid[0:ny, 0:nx]
    for dkm in range(16, 320, 16):
        d = dkm * 1000.0
        si = np.clip(np.round(ii + math.sin(az) * d / g.dx).astype(int), 0, nx - 1)
        sj = np.clip(np.round(jj - math.cos(az) * d / g.dy).astype(int), 0, ny - 1)
        barrier = np.maximum(barrier, hland[sj, si])
    shadow = smooth(500, 2200, barrier - hland)
    n1 = noise(dem.shape, 14, 1)
    n2 = noise(dem.shape, 60, 2)
    n3 = noise(dem.shape, 30, 3)
    arid = smooth(33.9, 29.0, lat) + 0.75 * shadow + 0.22 * (n1 - 0.5)
    arid = np.where(lat < 28.6, 1.0, arid)
    arid = np.where(lat > 36.0, 0.0, arid)             # Andalusia and the Algarve: winter green
    arid = np.clip(arid, 0, 1)

    cls = np.full(dem.shape, SAND, np.uint8)
    green, steppe, desert = arid < 0.36, (arid >= 0.36) & (arid < 0.64), arid >= 0.64
    cls[green] = MEADOW
    cls[green & (((dem > 450) & (n2 > 0.5)) | (dem > 1100))] = FOREST
    cls[steppe] = SAGE
    cls[steppe & (dem > 1300) & (n2 > 0.55)] = FOREST          # cedar and holm oak on the Middle Atlas
    cls[desert] = SAND
    cls[desert & (dem > 250) & (dem < 1400) & (slope < 2.2) & (n3 > 0.48)] = LAVA   # hamada: dark stony plateau
    cls[(arid > 0.36) & (slope > 7.5)] = ROCK
    cls[green & (slope > 13)] = ROCK
    cls[dem > 2550] = ALPINE

    def mask_draw(fn):
        im = Image.new("L", (nx, ny), 0)
        fn(ImageDraw.Draw(im))
        return np.asarray(im) > 127

    def px(la, lo):
        x, y = g.proj(la, lo)
        return g.px(x, y)

    # ergs: rotated ellipses with ragged edges
    for name, la, lo, a_km, b_km, brg in ERGS:
        cx, cy = g.proj(la, lo)
        t = math.radians(brg)
        ex, ey = math.sin(t), math.cos(t)               # long axis
        xs = g.x0 + ii * g.dx - cx
        ys = g.y1 - jj * g.dy - cy
        u = (xs * ex + ys * ey) / (a_km * 1000)
        v = (-xs * ey + ys * ex) / (b_km * 1000)
        r = np.hypot(u, v)
        m = (r < 1.0 + 0.35 * (n2 - 0.5)) & land & (slope < 6)
        cls[m] = ERG
    # oases
    for line in OASES:
        pts = [px(a, b) for a, b in line]
        m = mask_draw(lambda d: d.line(pts, fill=255, width=2))
        cls[m & land] = GROVE
    # cities
    lamps = []
    rnd = random.Random(2027)
    sea_z = (0.0 - SEA_FLOOR) * VEXAG / SCALE
    z = (dem - SEA_FLOOR) * VEXAG / SCALE              # scene heights

    def zat(x, y):                                     # x, y scene coords
        c, r_ = (x * SCALE - g.x0) / g.dx, (g.y1 - y * SCALE) / g.dy
        return max(bilinear(z, c, r_), sea_z)

    for name, la, lo, rk, _lab in CITIES:
        c, r_ = px(la, lo)
        rr = max(0.9, rk * 1000 / g.dx * 0.9)
        m = mask_draw(lambda d: d.ellipse([c - rr, r_ - rr, c + rr, r_ + rr], fill=255))
        cls[m & land] = DEVELOPED
        cx, cy = g.proj(la, lo)
        for _ in range(int(14 + rk * rk * 4)):
            dd = abs(rnd.gauss(0, rk * 500))
            a = rnd.uniform(0, 2 * math.pi)
            x, y = (cx + dd * math.cos(a)) / SCALE, (cy + dd * math.sin(a)) / SCALE
            lamps += [round(x, 1), round(y, 1), round(zat(x, y) + 4, 1)]
    cls[sea] = WATER
    print(f"  landcover: green {green[land].mean() * 100:.0f}%, steppe {steppe[land].mean() * 100:.0f}%, "
          f"desert {desert[land].mean() * 100:.0f}%, ergs {(cls == ERG).sum()} cells")

    # ---- the route
    d = load_route()
    R = d["route"]
    towns = R["towns"]

    def sc(la, lo):
        x, y = g.proj(la, lo)
        return x / SCALE, y / SCALE

    def drape(latlon, lift=60.0, step_km=2.5, over_sea=False):
        out = []
        for k in range(len(latlon) - 1):
            (a1, o1), (a2, o2) = latlon[k], latlon[k + 1]
            x1, y1 = g.proj(a1, o1)
            x2, y2 = g.proj(a2, o2)
            L = math.hypot(x2 - x1, y2 - y1)
            n = max(1, int(L / (step_km * 1000)))
            for s in range(n + (1 if k == len(latlon) - 2 else 0)):
                t = s / n
                x, y = (x1 + (x2 - x1) * t) / SCALE, (y1 + (y2 - y1) * t) / SCALE
                h = sea_z + 6 if over_sea else zat(x, y) + lift
                out += [round(x, 1), round(y, 1), round(h, 1)]
        return out

    def ring(key, special_km, dirdeg, seed):
        # a wobbly ring through the town, as long as the special
        t = towns[key]
        L = max(special_km, 8) * 1000.0
        rad = L / (2 * math.pi)
        cx, cy = g.proj(t["lat"], t["lon"])
        a = math.radians(dirdeg)
        ox, oy = cx + math.sin(a) * rad, cy + math.cos(a) * rad
        start = math.atan2(cy - oy, cx - ox)
        rs = random.Random(seed)
        harm = [(rs.uniform(0.04, 0.1), k, rs.uniform(0, 6.28)) for k in (2, 3, 5)]
        pts = []
        n = max(24, int(L / 2500))
        for s in range(n + 1):
            th = start + 2 * math.pi * s / n
            w = 1 + sum(amp * math.sin(k * th + ph) for amp, k, ph in harm) * math.sin(math.pi * s / n)
            x, y = ox + math.cos(th) * rad * w, oy + math.sin(th) * rad * w
            la, lo = g.unproj(x, y)
            pts.append((la, lo))
        pts[0] = pts[-1] = (t["lat"], t["lon"])
        return pts

    stages_out = []
    seen_pairs = {}
    for s in R["stages"]:
        a, b, kind = s["from"], s["to"], s.get("kind", "stage")
        ta, tb = towns[a], towns[b]
        entry = {k: s.get(k) for k in ("n", "date", "kind", "from", "to", "special_km", "liaison_km", "total_km", "note", "marathon")}
        if kind == "rest":
            entry["p"] = []
        elif kind == "transfer":
            # ferry from the strait to Nador, then the road to the bivouac
            entry["ferry"] = drape(FERRY, over_sea=True, step_km=4)
            entry["p"] = drape([FERRY[-1], (tb["lat"], tb["lon"])], step_km=3)
        elif a == b:
            entry["p"] = drape(ring(a, s.get("special_km") or 20, LOOP_DIR.get(s["n"], 0), sum(map(ord, s["n"])) * 7919), step_km=2)
            entry["loop"] = True
        else:
            pts = [(ta["lat"], ta["lon"])] + VIA.get(s["n"], []) + [(tb["lat"], tb["lon"])]
            pair = tuple(sorted((a, b)))
            if pair in seen_pairs:                       # out and back (the refuge): shift this one aside
                mid = [((pts[0][0] + pts[-1][0]) / 2 + 0.12, (pts[0][1] + pts[-1][1]) / 2 + 0.12)]
                pts = [pts[0]] + mid + [pts[-1]]
            seen_pairs[pair] = True
            entry["p"] = drape(pts)
        stages_out.append(entry)

    towns_out = []
    for key, t in towns.items():
        x, y = sc(t["lat"], t["lon"])
        used = [s["n"] for s in R["stages"] if key in (s["from"], s["to"]) and s.get("kind") != "transfer"]
        towns_out.append({"key": key, "name": t["name"], "x": round(x, 1), "y": round(y, 1), "z": round(zat(x, y), 1),
                          "role": t.get("role", ""), "approx": bool(t.get("approx")), "note": t.get("note", ""), "stages": used})

    # ---- labels
    def ft(m):
        return f"{round(m * 3.28084 / 10) * 10:,.0f} ft"
    labels = []
    order = [s["n"] for s in R["stages"]]
    for t in towns_out:
        st = [n for n in t["stages"] if n not in ("R",)]
        nums = sorted(set(st), key=order.index)
        role = {"finish": "Finish", "rest": "Rest day", "marathon": "Marathon bivouac"}.get(t["role"], "")
        if t["key"] == "algarve":
            role = "Start"
        if t["key"] == "strait":
            sub = "Ferry to Nador"
        else:
            sub = " · ".join(x for x in [role, ("Stage " if len(nums) == 1 else "Stages ") + ", ".join("Prologue" if n == "P" else n for n in nums) if nums else ""] if x)
        labels.append({"t": t["name"], "s": sub, "k": "town", "x": t["x"], "y": t["y"], "z": round(t["z"] + 900 * VEXAG / SCALE, 1)})
    for text, la, lo, kind, lift, ele in GEO:
        x, y = sc(la, lo)
        labels.append({"t": text, "s": ft(ele) if ele else "", "k": "peak" if kind == "peak" else "",
                       "x": round(x, 1), "y": round(y, 1), "z": round(zat(x, y) + lift * VEXAG / SCALE, 1)})

    routes = []
    for line in SHIPS:
        pts = [sc(a, b) for a, b in line]
        routes.append([v for x, y in pts for v in (round(x, 1), round(y, 1))])

    # ---- write
    zmax = float(z.max())
    zq = np.clip(np.round(z / zmax * 65535), 0, 65535).astype("<u2")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "dakar.bin").write_bytes(zq.tobytes() + cls.astype(np.uint8).tobytes())
    ext = [g.x0 / SCALE, g.y0 / SCALE, g.x1 / SCALE, g.y1 / SCALE]
    ed = d["edition"]
    scene = {
        "meta": {
            "kind": "terrain", "place": "dakar", "name": PLACE["name"], "scale": 1 / SCALE,
            "origin": [g.lat0, g.lon0], "bbox": list(PLACE["bbox"]),
            "extent": [round(v, 1) for v in ext],
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "attribution": "Elevation: Terrain Tiles on AWS (SRTM, ETOPO1) · Route: ASO, via brooksgroves.com/dakar-2027",
            "elev": [round(float(dem.min()), 1), round(float(dem.max()), 1)],
        },
        "grid": {"nx": nx, "ny": ny, "x0": round(g.x0 / SCALE, 2), "y1": round(g.y1 / SCALE, 2),
                 "dx": round(g.dx / SCALE, 4), "dy": round(g.dy / SCALE, 4), "zmax": round(zmax, 2),
                 "h0": float(SEA_FLOOR), "vexag": VEXAG / SCALE, "bin": "dakar.bin", "sea": round(sea_z, 2)},
        "lakes": [], "rivers": [], "roads": [], "lanes": [], "buildings": [], "trees": [], "labels": labels,
        "falls": [], "lamps": lamps, "tufa": [], "gulls": None, "drive": [], "routes": routes, "anchored": [],
        "umbrellas": [], "models": [], "model_boxes": [],
        "rally": {"edition": {k: ed.get(k) for k in ("number", "year", "name", "start_date", "end_date", "special_km", "total_km", "stages", "status", "stages_done")},
                  "updated": d.get("updated"), "towns": towns_out, "stages": stages_out},
    }
    (OUT / "dakar.json").write_text(json.dumps(scene, separators=(",", ":"), default=float))
    mb = ((OUT / "dakar.json").stat().st_size + (OUT / "dakar.bin").stat().st_size) / 1e6
    print(f"  {len(stages_out)} stages, {len(towns_out)} towns, {len(lamps) // 3} lights; wrote dakar.json + dakar.bin ({mb:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "build", "all"])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if a.cmd in ("fetch", "all"):
        fetch(a.force)
    if a.cmd in ("build", "all"):
        build()


if __name__ == "__main__":
    main()
