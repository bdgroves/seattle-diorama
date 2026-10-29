"""Write a synthetic Overpass-style JSON so the pipeline and viewer can be
tested without network access.  NOT real Seattle - just a plausible
street grid with the landmarks in roughly the right places.

Usage:  pixi run demo
"""
import json
import math
import random

from config import BBOX, MONORAIL_FALLBACK, RAW_DIR, SPACE_NEEDLE, WESTIN_FALLBACK, ORIGIN

LAT0, LON0 = ORIGIN
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_574.0


def unproj(x, y):
    return {"lat": LAT0 + y / KY, "lon": LON0 + x / KX}


rnd = random.Random(7)
els = []
nid = [1]


def add(kind, geom_xy, tags, closed=False):
    pts = [unproj(x, y) for x, y in geom_xy]
    if closed:
        pts.append(pts[0])
    nid[0] += 1
    els.append({"type": kind, "id": nid[0], "geometry": pts, "tags": tags})


def rect(cx, cy, w, h, ang):
    c, s = math.cos(ang), math.sin(ang)
    out = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        out.append((cx + dx * c - dy * s, cy + dx * s + dy * c))
    return out


def lp(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


S, W, N, E = BBOX
x0, y0 = lp(S, W)
x1, y1 = lp(N, E)
coast_x = lp(0 + LAT0, -122.3555)[0]
needle = lp(*SPACE_NEEDLE)

# rotated downtown grid
ang = math.radians(-32)
step = 110
streets = []
for i in range(-14, 15):
    for orient in (0, 1):
        a = ang + orient * math.pi / 2
        dx, dy = math.cos(a), math.sin(a)
        ox, oy = -dy * i * step, dx * i * step
        line = [(ox - dx * 1800, oy - dy * 1800), (ox + dx * 1800, oy + dy * 1800)]
        hw = "secondary" if i % 4 == 0 else "residential"
        add("way", line, {"highway": hw})
        streets.append(line)

# blocks of buildings
c, s = math.cos(ang), math.sin(ang)
for i in range(-14, 14):
    for j in range(-14, 14):
        bx = (i + 0.5) * step
        by = (j + 0.5) * step
        cx, cy = bx * c - by * s, bx * s + by * c
        if not (x0 < cx < x1 and y0 < cy < y1) or cx < coast_x + 60:
            continue
        d_needle = math.hypot(cx - needle[0], cy - needle[1])
        if d_needle < 230:  # Seattle Center grounds
            continue
        downtown = max(0.0, 1.0 - math.hypot(cx - 700, cy + 450) / 900)
        for k in range(4):
            sx = (k % 2 - 0.5) * 42
            sy = (k // 2 - 0.5) * 42
            px, py = cx + sx * c - sy * s, cy + sx * s + sy * c
            w, h = rnd.uniform(26, 40), rnd.uniform(26, 40)
            lv = int(2 + rnd.random() * 6 + downtown ** 1.6 * rnd.uniform(5, 38))
            add("way", rect(px, py, w, h, ang), {"building": rnd.choice(["yes", "apartments", "commercial", "office"]),
                                                 "building:levels": str(lv)}, closed=True)

# Seattle Center park + plaza
park = [(needle[0] + 230 * math.cos(t / 20 * 2 * math.pi), needle[1] + 200 * math.sin(t / 20 * 2 * math.pi)) for t in range(20)]
add("way", park, {"leisure": "park", "name": "Seattle Center"}, closed=True)
add("way", rect(needle[0] + 90, needle[1] - 40, 80, 50, 0), {"building": "civic", "height": "20", "name": "Armory"}, closed=True)
add("way", rect(needle[0], needle[1], 30, 30, 0), {"building": "yes", "name": "Space Needle", "height": "184"}, closed=True)
plaza = [(needle[0] + 40 * math.cos(t / 16 * 2 * math.pi), needle[1] + 40 * math.sin(t / 16 * 2 * math.pi)) for t in range(16)]
add("way", plaza, {"highway": "pedestrian", "area": "yes"}, closed=True)
for t in range(24):
    a = t / 24 * 2 * math.pi
    add("way", [(needle[0] + 120 * math.cos(a), needle[1] + 120 * math.sin(a)),
                (needle[0] + 200 * math.cos(a + 0.2), needle[1] + 180 * math.sin(a + 0.2))], {"highway": "footway"})

# Westin twin towers
for lat, lon, r, h in WESTIN_FALLBACK:
    cx, cy = lp(lat, lon)
    ring = [(cx + r * math.cos(t / 40 * 2 * math.pi), cy + r * math.sin(t / 40 * 2 * math.pi)) for t in range(40)]
    add("way", ring, {"building": "hotel", "name": "The Westin Seattle", "building:levels": "40"}, closed=True)

# monorail (two beams)
line = [lp(a, b) for a, b in MONORAIL_FALLBACK]
for off in (-2.7, 2.7):
    pts = []
    for k, (x, y) in enumerate(line):
        a = line[min(k + 1, len(line) - 1)]
        b = line[max(k - 1, 0)]
        dx, dy = a[0] - b[0], a[1] - b[1]
        n = math.hypot(dx, dy)
        pts.append((x - dy / n * off, y + dx / n * off))
    add("way", pts, {"railway": "monorail"})

# coastline: land on the left -> walk north to south with land to the east
coast = [(coast_x + 30 * math.sin(y / 180), y) for y in range(int(y1 + 100), int(y0 - 100), -40)]
add("way", coast, {"natural": "coastline"})

# some mapped trees
for _ in range(60):
    nid[0] += 1
    p = unproj(rnd.uniform(x0, x1), rnd.uniform(y0, y1))
    els.append({"type": "node", "id": nid[0], "lat": p["lat"], "lon": p["lon"], "tags": {"natural": "tree"}})

RAW_DIR.mkdir(parents=True, exist_ok=True)
out = RAW_DIR / "osm_test.json"
out.write_text(json.dumps({"elements": els}))
print(f"Synthetic OSM test data: {len(els)} elements -> {out}")
