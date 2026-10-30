"""Terrain dioramas (Yosemite Valley, Tuolumne Meadows, Mono Lake).

    python pipeline/terrain.py fetch [--place yosemite] [--force]
    python pipeline/terrain.py build [--place yosemite]

fetch  USGS 3DEP elevation (Terrarium tiles as a fallback) and OpenStreetMap
       for each place, cached in data/raw/.
build  writes web/public/data/<place>.json (vectors, labels, metadata) and
       web/public/data/<place>.bin (heights as uint16, then landcover classes
       as uint8, both on the same north-up grid).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, polygonize, unary_union

from places import PLACES

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"
UA = "seattle-diorama/0.2 (personal cartography project)"
OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter"]

# landcover classes (match web/src/terrain.js)
FOREST, ROCK, MEADOW, WATER, DEVELOPED, SAGE, SAND, SNOW, ALPINE, LAVA, GROVE = range(11)


# ----------------------------------------------------------------- grid
class Grid:
    def __init__(self, place):
        s, w, n, e = place["bbox"]
        self.lat0, self.lon0 = (s + n) / 2, (w + e) / 2
        self.kx = 111_320.0 * math.cos(math.radians(self.lat0))
        self.ky = 110_574.0
        self.x0, self.y0 = self.proj(s, w)
        self.x1, self.y1 = self.proj(n, e)
        cell = place["cell"]
        self.nx = int(round((self.x1 - self.x0) / cell)) + 1
        self.ny = int(round((self.y1 - self.y0) / cell)) + 1
        self.dx = (self.x1 - self.x0) / (self.nx - 1)
        self.dy = (self.y1 - self.y0) / (self.ny - 1)
        self.bbox = place["bbox"]

    def proj(self, lat, lon):
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)

    def unproj(self, x, y):
        return (self.lat0 + y / self.ky, self.lon0 + x / self.kx)

    # pixel coords (col, row) of a local point; row 0 is the north edge
    def px(self, x, y):
        return ((x - self.x0) / self.dx, (self.y1 - y) / self.dy)


def bilinear(arr, c, r):
    ny, nx = arr.shape
    c = min(max(c, 0.0), nx - 1.001)
    r = min(max(r, 0.0), ny - 1.001)
    i, j = int(c), int(r)
    fx, fy = c - i, r - j
    a = arr[j, i] * (1 - fx) + arr[j, i + 1] * fx
    b = arr[j + 1, i] * (1 - fx) + arr[j + 1, i + 1] * fx
    return float(a * (1 - fy) + b * fy)


# ----------------------------------------------------------------- fetch
def fetch_dem_3dep(g: Grid) -> np.ndarray:
    import tifffile
    s, w, n, e = g.bbox
    url = ("https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
           f"?bbox={w},{s},{e},{n}&bboxSR=4326&imageSR=4326&size={g.nx},{g.ny}"
           "&format=tiff&pixelType=F32&noDataInterpretation=esriNoDataMatchAny"
           "&interpolation=RSP_BilinearInterpolation&f=image")
    r = requests.get(url, timeout=180, headers={"User-Agent": UA})
    r.raise_for_status()
    arr = tifffile.imread(io.BytesIO(r.content)).astype(np.float32)
    if arr.ndim == 3:
        arr = arr[..., 0]
    if arr.shape != (g.ny, g.nx):
        raise RuntimeError(f"3DEP returned {arr.shape}, wanted {(g.ny, g.nx)}")
    return arr


def fetch_dem_terrarium(g: Grid, z=13) -> np.ndarray:
    """AWS open Terrain Tiles (Terrarium PNG), sampled onto the grid."""
    s, w, n, e = g.bbox

    def tile_xy(lat, lon):
        x = (lon + 180) / 360 * 2 ** z
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** z
        return x, y
    tx0, ty0 = tile_xy(n, w)
    tx1, ty1 = tile_xy(s, e)
    tiles = {}
    for tx in range(int(tx0), int(tx1) + 1):
        for ty in range(int(ty0), int(ty1) + 1):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{tx}/{ty}.png"
            im = np.asarray(Image.open(io.BytesIO(requests.get(url, timeout=60).content)).convert("RGB"), dtype=np.float32)
            tiles[(tx, ty)] = im[..., 0] * 256 + im[..., 1] + im[..., 2] / 256 - 32768
    ox, oy = int(tx0), int(ty0)
    mosaic = np.zeros(((int(ty1) - oy + 1) * 256, (int(tx1) - ox + 1) * 256), np.float32)
    for (tx, ty), t in tiles.items():
        mosaic[(ty - oy) * 256:(ty - oy + 1) * 256, (tx - ox) * 256:(tx - ox + 1) * 256] = t
    out = np.zeros((g.ny, g.nx), np.float32)
    for j in range(g.ny):
        lat = n - (n - s) * j / (g.ny - 1)
        for i in range(g.nx):
            lon = w + (e - w) * i / (g.nx - 1)
            fx, fy = tile_xy(lat, lon)
            out[j, i] = bilinear(mosaic, (fx - ox) * 256 - 0.5, (fy - oy) * 256 - 0.5)
    return out


class _Done(BaseException):
    """Raised to skip the 3DEP / Terrarium chain once another source has been saved."""


def wgs84_to_lv95(lat, lon):
    """swisstopo's approximate formulas (good to about a metre)."""
    p = (np.asarray(lat) * 3600 - 169028.66) / 10000
    l = (np.asarray(lon) * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def fetch_dem_swissalti3d(g: Grid, fill_zoom=13) -> np.ndarray:
    """swisstopo swissALTI3D 2 m tiles (1 km COGs in LV95) from the STAC API,
    sampled onto the grid; Terrain Tiles fill anything outside Switzerland."""
    import tifffile
    s, w, n, e = g.bbox
    print(f"  swissALTI3D tiles for {g.nx} x {g.ny} ...", flush=True)
    url = (f"https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items"
           f"?bbox={w},{s},{e},{n}&limit=100")
    best = {}
    while url:
        r = requests.get(url, timeout=120, headers={"User-Agent": UA})
        r.raise_for_status()
        d = r.json()
        for f in d.get("features", []):
            for k, a in f.get("assets", {}).items():
                if not k.endswith(".tif") or "_2_2056_" not in k:
                    continue
                m = re.search(r"_(\d{4})_(\d{4})-(\d{4})_", k)
                if not m:
                    continue
                yr, tx, ty = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if (tx, ty) not in best or best[(tx, ty)][0] < yr:
                    best[(tx, ty)] = (yr, a["href"])
        url = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)
    print(f"  {len(best)} tiles", flush=True)
    lat = np.linspace(n, s, g.ny)[:, None] * np.ones((1, g.nx))
    lon = np.ones((g.ny, 1)) * np.linspace(w, e, g.nx)[None, :]
    E, N = wgs84_to_lv95(lat, lon)
    out = np.full((g.ny, g.nx), np.nan, np.float32)
    tx = np.floor(E / 1000).astype(int)
    ty = np.floor(N / 1000).astype(int)
    for k, ((kx, ky), (yr, href)) in enumerate(sorted(best.items())):
        sel = (tx == kx) & (ty == ky)
        if not sel.any():
            continue
        for attempt in range(4):
            try:
                rr = requests.get(href, timeout=120, headers={"User-Agent": UA})
                rr.raise_for_status()
                break
            except Exception as exc:  # noqa: BLE001
                if attempt == 3:
                    raise
                print(f"  retry {href}: {exc}", flush=True)
                time.sleep(3 + 4 * attempt)
        with tifffile.TiffFile(io.BytesIO(rr.content)) as tf:
            page = tf.pages[0]
            arr = page.asarray().astype(np.float32)
            tie = page.tags["ModelTiepointTag"].value
            scale = page.tags["ModelPixelScaleTag"].value
        x0, y0, res = tie[3], tie[4], scale[0]
        arr[arr < -1000] = np.nan
        # average 2 m down to 10 m first, so the 18 m grid doesn't alias
        k5 = 5
        hh, ww = (arr.shape[0] // k5) * k5, (arr.shape[1] // k5) * k5
        arr = arr[:hh, :ww].reshape(hh // k5, k5, ww // k5, k5).mean(axis=(1, 3))
        res = res * k5
        c = (E[sel] - x0) / res - 0.5
        r_ = (y0 - N[sel]) / res - 0.5
        h, wd = arr.shape
        c = np.clip(c, 0, wd - 1.001); r_ = np.clip(r_, 0, h - 1.001)
        i0, j0 = c.astype(int), r_.astype(int)
        fx, fy = c - i0, r_ - j0
        v = (arr[j0, i0] * (1 - fx) * (1 - fy) + arr[j0, i0 + 1] * fx * (1 - fy)
             + arr[j0 + 1, i0] * (1 - fx) * fy + arr[j0 + 1, i0 + 1] * fx * fy)
        out[sel] = v
        if k % 40 == 0:
            print(f"  ... {k}/{len(best)}", flush=True)
    miss = ~np.isfinite(out)
    print(f"  swissALTI3D covers {100 - miss.mean() * 100:.0f}% of the box; Terrain Tiles for the rest", flush=True)
    if miss.any():
        fill = fetch_dem_terrarium(g, fill_zoom)
        out[miss] = fill[miss]
        # feather the seam a little
    return out


def overpass_query(bbox, extra=""):
    s, w, n, e = bbox
    b = f"({s},{w},{n},{e})"
    extra = extra.replace("{b}", b)
    return f"""
[out:json][timeout:240];
(
  way["natural"~"^(water|wood|grassland|heath|scrub|bare_rock|scree|glacier|beach|sand|wetland|shingle)$"]{b};
  relation["natural"~"^(water|wood|grassland|scrub|bare_rock|scree|glacier|wetland)$"]{b};
  way["landuse"~"^(forest|meadow|grass|residential|commercial|retail|industrial)$"]{b};
  relation["landuse"~"^(forest|meadow)$"]{b};
  way["waterway"~"^(river|stream|waterfall)$"]{b};
  node["waterway"="waterfall"]{b};
  node["natural"~"^(peak|waterfall|cliff|saddle|rock|volcano|spring)$"]["name"]{b};
  way["natural"~"^(cliff|ridge|arete|rock)$"]["name"]{b};
  node["tourism"~"^(viewpoint|attraction|hotel)$"]["name"]{b};
  way["tourism"~"^(attraction|hotel)$"]["name"]{b};
  node["place"~"^(island|islet|locality|village|town|hamlet)$"]["name"]{b};
  way["place"~"^(island|islet)$"]{b};
  relation["place"~"^(island|islet)$"]{b};
  way["leisure"="park"]["name"]{b};
  way["leisure"="garden"]["name"]{b};
  way["natural"="coastline"]{b};
  way["landuse"~"^(orchard|vineyard|farmland|farmyard|allotments)$"]{b};
  node["natural"~"^(beach|cave_entrance|bay|cape|arch|stone)$"]["name"]{b};
  node["historic"]["name"]{b};
  way["historic"]["name"]{b};
  way["route"="ferry"]{b};
  way["highway"]{b};
  way["building"]{b};{extra}
);
out geom;
"""


def fetch(place, force=False):
    g = Grid(place)
    RAW.mkdir(parents=True, exist_ok=True)
    pid = place["id"]
    dem_path = RAW / f"{pid}_dem.npy"
    key = hashlib.md5(f"{place['bbox']}{g.nx}{g.ny}".encode()).hexdigest()[:10]
    stamp = RAW / f"{pid}_dem.key"
    if force or not dem_path.exists() or not stamp.exists() or stamp.read_text() != key:
        try:
            if place.get("dem") == "swissalti3d":
                dem = fetch_dem_swissalti3d(g, place.get("tile_zoom", 13))
                np.save(dem_path, dem)
                stamp.write_text(key)
                (RAW / f"{pid}_dem.src").write_text("swisstopo swissALTI3D (2 m), Terrain Tiles on AWS in Italy")
                print(f"  elevation {np.nanmin(dem):.0f}-{np.nanmax(dem):.0f} m")
                raise _Done()
            if place.get("dem") == "terrarium":          # outside the US: no 3DEP
                raise RuntimeError("not in the US")
            print(f"[{pid}] USGS 3DEP elevation {g.nx} x {g.ny} ...")
            dem = fetch_dem_3dep(g)
            src = "USGS 3DEP"
        except Exception as exc:  # noqa: BLE001
            print(f"  3DEP skipped ({exc}); using Terrarium tiles {g.nx} x {g.ny}")
            dem = fetch_dem_terrarium(g, place.get("tile_zoom", 13))
            src = "Terrain Tiles on AWS (SRTM, EU-DEM, bathymetry)"
        except _Done:
            dem = None
        if dem is not None:
            np.save(dem_path, dem)
            stamp.write_text(key)
            (RAW / f"{pid}_dem.src").write_text(src)
            print(f"  elevation {dem.min():.0f}-{dem.max():.0f} m")
    osm_path = RAW / f"{pid}_osm.json"
    q = overpass_query(place["bbox"], place.get("osm_extra", ""))
    qkey = hashlib.md5(q.encode()).hexdigest()[:10]
    qstamp = RAW / f"{pid}_osm.key"
    if force or not osm_path.exists() or not qstamp.exists() or qstamp.read_text() != qkey:
        last = None
        for url in OVERPASS:
            for attempt in range(2):
                try:
                    print(f"[{pid}] Overpass {url} ...")
                    r = requests.post(url, data={"data": q}, timeout=300, headers={"User-Agent": UA})
                    if r.status_code == 429 or r.status_code >= 500:
                        raise RuntimeError(f"HTTP {r.status_code}")
                    r.raise_for_status()
                    data = r.json()
                    if not data.get("elements"):
                        raise RuntimeError("empty response")
                    osm_path.write_text(json.dumps(data))
                    qstamp.write_text(qkey)
                    print(f"  {len(data['elements']):,} OSM elements")
                    break
                except Exception as exc:  # noqa: BLE001
                    last = exc
                    print(f"  failed: {exc}")
                    time.sleep(5 + 10 * attempt)
            else:
                continue
            break
        else:
            sys.exit(f"Overpass failed for {pid}: {last}")


# ----------------------------------------------------------------- OSM helpers
def coords(g, el):
    return [g.proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]


def polygon(g, el):
    if el["type"] == "way":
        pts = coords(g, el)
        if len(pts) < 4 or pts[0] != pts[-1]:
            return None
        p = Polygon(pts)
        return p if p.is_valid else p.buffer(0)
    if el["type"] == "relation":
        outers, inners = [], []
        for m in el.get("members", []):
            if m.get("type") != "way" or "geometry" not in m:
                continue
            pts = [g.proj(p["lat"], p["lon"]) for p in m["geometry"] if p]
            if len(pts) >= 2:
                (inners if m.get("role") == "inner" else outers).append(LineString(pts))
        if not outers:
            return None
        o = unary_union(list(polygonize(linemerge(outers) if len(outers) > 1 else outers)))
        if inners:
            o = o.difference(unary_union(list(polygonize(linemerge(inners) if len(inners) > 1 else inners))))
        return o if o.is_valid else o.buffer(0)
    return None


def polys(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [p for p in getattr(geom, "geoms", []) if isinstance(p, Polygon)]


def lines(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    return [l for l in getattr(geom, "geoms", []) if isinstance(l, LineString)]


def parse_len(v):
    if not v:
        return None
    m = re.match(r"^\s*([0-9.]+)\s*(m|ft|')?", str(v).split(";")[0])
    if not m:
        return None
    n = float(m.group(1))
    return n * 0.3048 if m.group(2) in ("ft", "'") else n


def ring_flat(coords_, close_drop=True):
    pts = list(coords_)
    if close_drop and len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    out = []
    for x, y in pts:
        out += [round(x, 1), round(y, 1)]
    return out


# ----------------------------------------------------------------- build
def build(place):
    pid = place["id"]
    g = Grid(place)
    dem = np.load(RAW / f"{pid}_dem.npy").astype(np.float32)
    src_path = RAW / f"{pid}_dem.src"
    dem_src = src_path.read_text() if src_path.exists() else "USGS 3DEP"
    sea_floor = place.get("sea_floor")
    if sea_floor is not None:                          # keep the seabed shallow enough for a slab
        dem = np.where(np.isfinite(dem), np.maximum(dem, sea_floor), dem)
    bad = ~np.isfinite(dem) | (dem < -500) | (dem > 9000)
    if bad.any():                                     # fill holes with the median
        dem[bad] = np.nanmedian(dem[~bad])
    els = json.loads((RAW / f"{pid}_osm.json").read_text())["elements"]
    print(f"[{pid}] grid {g.nx} x {g.ny} @ {g.dx:.1f} m, {len(els):,} OSM elements, "
          f"elevation {dem.min():.0f}-{dem.max():.0f} m")
    clip = box(g.x0, g.y0, g.x1, g.y1)
    rnd = random.Random(1864)                          # Yosemite Grant year

    # ---- sort OSM
    water, wood, meadow, rock, glacier, sand, scrub, developed = [], [], [], [], [], [], [], []
    rivers, roads, buildings, named = [], [], [], []
    coast, groves, ferries = [], [], []
    for el in els:
        t = el.get("tags", {})
        name = t.get("name", "")
        if name:
            if el["type"] == "node":
                named.append((name.lower(), Point(g.proj(el["lat"], el["lon"])), t))
            else:
                p = polygon(g, el)
                if p is None and el["type"] == "way":
                    pts = coords(g, el)
                    p = LineString(pts) if len(pts) > 1 else None
                if p is not None and not p.is_empty:
                    named.append((name.lower(), p, t))
        if el["type"] == "node":
            continue
        nat, lu, ww, hw = t.get("natural"), t.get("landuse"), t.get("waterway"), t.get("highway")
        if "building" in t:
            p = polygon(g, el)
            if p is not None and not p.is_empty:
                buildings.append((p, t, f"{el['type']}{el['id']}"))
            continue
        if t.get("natural") == "coastline" and el["type"] == "way":
            pts = coords(g, el)
            if len(pts) >= 2:
                coast.append(LineString(pts))
            continue
        if t.get("route") == "ferry" and el["type"] == "way":
            pts = coords(g, el)
            if len(pts) >= 2:
                ferries.append(LineString(pts))
            continue
        if lu in ("orchard", "vineyard", "farmland", "farmyard", "allotments"):
            p = polygon(g, el)
            if p is not None and not p.is_empty:
                groves.append(p)
            continue
        if hw and el["type"] == "way":
            pts = coords(g, el)
            if len(pts) >= 2:
                roads.append((hw, LineString(pts), t))
            continue
        if ww in ("river", "stream") and el["type"] == "way":
            pts = coords(g, el)
            if len(pts) >= 2:
                rivers.append((ww, LineString(pts), name))
            continue
        target = None
        if nat == "water" or t.get("water"):
            target = water
        elif nat == "wood" or lu == "forest":
            target = wood
        elif nat in ("grassland", "wetland", "heath") or lu in ("meadow", "grass"):
            target = meadow
        elif nat in ("bare_rock", "scree", "shingle"):
            target = rock
        elif nat == "glacier":
            target = glacier
        elif nat in ("beach", "sand"):
            target = sand
        elif nat == "scrub":
            target = scrub
        elif lu in ("residential", "commercial", "retail", "industrial"):
            target = developed
        if target is not None:
            p = polygon(g, el)
            if p is not None and not p.is_empty:
                target.append(p)

    # ---- slope (degrees) from the DEM
    gy, gx = np.gradient(dem, g.dy, g.dx)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))

    # ---- lakes: flatten the DEM under each one, remember its level
    def mask_of(geoms):
        im = Image.new("L", (g.nx, g.ny), 0)
        d = ImageDraw.Draw(im)
        for geom in geoms:
            for p in polys(geom.intersection(clip)):
                ext = [g.px(x, y) for x, y in p.exterior.coords]
                if len(ext) >= 3:
                    d.polygon(ext, fill=255)
                for hole in p.interiors:
                    h = [g.px(x, y) for x, y in hole.coords]
                    if len(h) >= 3:
                        d.polygon(h, fill=0)
        return np.asarray(im) > 127

    # ---- the sea: split the box along the OSM coastline (land is on the left)
    sea_mask = np.zeros_like(dem, bool)
    if place.get("sea"):
        land_mask = None
        if coast:
            from shapely.ops import split as _split
            merged_c = lines(linemerge(coast))
            big = clip.buffer(200)
            rings, open_lines = [], []
            for ln in merged_c:
                if ln.is_ring and Polygon(ln).area > 0:
                    rings.append(ln)                  # islands drawn as closed rings
                else:
                    open_lines.append(ln.intersection(big))
            pieces = [clip]
            for ln in open_lines:
                for seg in lines(ln):
                    nxt = []
                    for pc in pieces:
                        nxt.extend(polys(_split(pc, seg)) if pc.intersects(seg) else [pc])
                    pieces = nxt
            land_polys = []
            if open_lines:
                from shapely import STRtree
                allc = [l for ln in open_lines for l in lines(ln)]
                tree = STRtree(allc)
                for pc in pieces:
                    rp = pc.representative_point()
                    ln = allc[tree.nearest(rp)]
                    d = ln.project(rp)
                    a = ln.interpolate(max(d - 1.0, 0)); b = ln.interpolate(min(d + 1.0, ln.length))
                    cross = (b.x - a.x) * (rp.y - a.y) - (b.y - a.y) * (rp.x - a.x)
                    if cross > 0:
                        land_polys.append(pc)
            for r in rings:                            # islands: always land
                land_polys.append(Polygon(r))
            if land_polys:
                land_mask = mask_of([unary_union(land_polys)])
            print(f"  coastline: {len(merged_c)} line(s), {len(rings)} island ring(s), {len(pieces)} pieces")
        if land_mask is None:
            land_mask = dem > 0
        sea_mask = ~land_mask
        # Terrarium's z13 tiles are SRTM (0 over the sea), so shape a seabed
        # from the distance to shore: steep off the cliffs, like the real
        # Amalfi coast, which drops past 100 m within a couple of km
        dist = np.where(sea_mask, np.inf, 0.0)
        step = np.hypot(g.dx, g.dy)
        cur = (~sea_mask).copy()
        for it in range(1, int(4000 / g.dx) + 1):
            grown = cur.copy()
            grown[1:, :] |= cur[:-1, :]; grown[:-1, :] |= cur[1:, :]
            grown[:, 1:] |= cur[:, :-1]; grown[:, :-1] |= cur[:, 1:]
            if it % 2 == 0:   # alternate 8- and 4-neighbour growth: rounder fronts
                grown[1:, 1:] |= cur[:-1, :-1]; grown[:-1, :-1] |= cur[1:, 1:]
                grown[1:, :-1] |= cur[:-1, 1:]; grown[:-1, 1:] |= cur[1:, :-1]
            new = grown & ~cur
            dist[new] = it * (g.dx + step) / 2
            cur = grown
        dist[np.isinf(dist)] = 4000.0
        rs = np.random.default_rng(5)
        wob = Image.fromarray((rs.random((g.ny // 12 + 2, g.nx // 12 + 2)) * 255).astype(np.uint8)).resize((g.nx, g.ny), Image.BICUBIC)
        wob = np.asarray(wob, np.float32) / 255.0 - 0.5
        floor = abs(place.get("sea_floor", -140))
        shelf = 2.5 + floor * (1 - np.exp(-dist / 1300.0)) * (1 + 0.35 * wob)
        dem[sea_mask] = np.minimum(dem[sea_mask], -shelf[sea_mask])
        dem[sea_mask] = np.minimum(dem[sea_mask], -2.0)
        dem[land_mask] = np.maximum(dem[land_mask], 0.6)
        print(f"  sea: {sea_mask.mean() * 100:.0f}% of the box")

    lakes_out = []
    water_u = unary_union(water).intersection(clip) if water else Polygon()
    water_mask = np.zeros_like(dem, bool)
    for p in polys(water_u):
        if p.area < 4 * g.dx * g.dy:
            continue
        m = mask_of([p])
        if m.sum() < 3:
            continue
        level = float(np.median(dem[m]))
        # the DEM is hydro-flattened under lakes: only cells near the lake
        # level belong to the water (outlines that spill onto a shore slope
        # keep their ground)
        m = m & (np.abs(dem - level) < 2.5)
        if m.sum() < 3:
            continue
        dem[m] = np.minimum(dem[m], level) - 1.0
        water_mask |= m
        ps = orient(p.simplify(max(2.0, g.dx * 0.25)), 1.0)
        rings = [ring_flat(ps.exterior.coords)] + [ring_flat(h.coords) for h in ps.interiors if Polygon(h).area > g.dx * g.dy]
        if len(rings[0]) >= 6:
            lakes_out.append({"level": round(level, 1), "r": rings})
    print(f"  lakes: {len(lakes_out)}")

    # ---- landcover classes
    cls = np.full(dem.shape, FOREST, np.uint8)
    tl = place.get("treeline", 3200)
    if place["veg"] == "eastside":
        cls[dem < place.get("sage_top", 2300)] = SAGE
    if place["veg"] == "med":                         # maquis low down, chestnut and oak woods above
        cls[dem < place.get("maquis_top", 450)] = SAGE
    if place["veg"] == "alps":                        # open pasture unless OSM maps a wood
        cls[:] = MEADOW
    cls[dem > tl] = ALPINE
    if place["veg"] == "alps":
        cls[dem > place.get("alpine_top", 2750)] = ROCK
    cls[(slope > 34) & (dem > tl - 400)] = ROCK
    cls[slope > place.get("rock_slope", 38)] = ROCK
    for geoms, c in ((scrub, SAGE), (wood, FOREST), (meadow, MEADOW), (developed, DEVELOPED),
                     (rock, ROCK), (sand, SAND), (glacier, SNOW)):
        if geoms:
            cls[mask_of(geoms)] = c
    # meadows sit on flat ground: keep OSM forest off the valley floor's open meadows
    lava_rx = place.get("lava", [])
    if lava_rx:
        lava = [geom for nm, geom, t in named if any(re.search(rx, nm) for rx in lava_rx) and getattr(geom, "area", 0) > 0]
        if lava:
            cls[mask_of(lava)] = LAVA
    if groves:
        cls[mask_of(groves) & (slope < 40)] = GROVE
    if place["veg"] == "med" and developed:
        # Italian "residential" landuse wraps whole hillsides of terraced
        # gardens with a house here and there: only the built-up cores read
        # as town, the rest is gardens and lemon terraces
        cnt = np.zeros((g.ny, g.nx), np.float32)
        for p0, _t, _k in buildings:
            c = p0.centroid
            cx, cy = g.px(c.x, c.y)
            if 0 <= int(cy) < g.ny and 0 <= int(cx) < g.nx:
                cnt[int(cy), int(cx)] += 1
        dense = np.zeros_like(cnt)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                dense += np.roll(np.roll(cnt, dy, 0), dx, 1)
        core = dense >= place.get("town_density", 14)   # buildings per ~3 ha
        dev = cls == DEVELOPED
        cls[dev & ~core] = GROVE
        print(f"  town cores: {core[dev].mean() * 100:.0f}% of residential land")
    cls[water_mask] = WATER
    cls[sea_mask] = WATER
    # the dry lake margins around Mono read as pale flats
    if place["veg"] == "eastside" and lakes_out and not place.get("sea"):
        big = max(lakes_out, key=lambda l: len(l["r"][0]))["level"]
        near = (~water_mask) & (dem < big + 6) & (dem > big - 1)
        cls[near & (cls == SAGE)] = SAND

    # ---- heights: relative, exaggerated
    vex = place["vexag"]
    h0 = float(dem.min()) - 2.0
    z = (dem - h0) * vex

    def zat(x, y):
        c, r = g.px(x, y)
        return bilinear(z, c, r)

    def hat(x, y):                                # true elevation (m)
        c, r = g.px(x, y)
        return bilinear(dem, c, r)

    def drape(line: LineString, step, lift):
        line = line.simplify(max(1.0, step * 0.3))
        L = line.length
        n = max(2, int(L / step) + 1)
        out = []
        for k in range(n):
            p = line.interpolate(min(L, k * L / (n - 1)))
            out += [round(p.x, 1), round(p.y, 1), round(zat(p.x, p.y) + lift, 1)]
        return out

    # ---- rivers and streams
    water_core = water_u.buffer(-2) if not water_u.is_empty else Polygon()
    rivers_out = []
    merged = {}
    for ww, ln, nm in rivers:
        merged.setdefault((ww, nm), []).append(ln)
    for (ww, nm), lns in merged.items():
        for ln in lines(linemerge(lns)):
            ln = ln.intersection(clip)
            for seg in lines(ln.difference(water_core) if not water_core.is_empty else ln):
                if ww == "stream" and (seg.length < 400 and not nm):
                    continue
                rivers_out.append({"w": 18 if ww == "river" else 5, "p": drape(seg, g.dx * 0.7, 0.8 * vex)})
    print(f"  rivers/streams: {len(rivers_out)}")

    # ---- roads and trails
    ROAD = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
            "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link", "living_street"}
    TRAIL = {"path", "footway", "bridleway", "steps", "track", "cycleway"}
    roads_out, lanes = [], []
    groups = {}
    for hw, ln, t in roads:
        if t.get("tunnel") == "yes" and hw not in ROAD:
            continue
        kind = "road" if hw in ROAD else "service" if hw == "service" else "trail" if hw in TRAIL else None
        if kind:
            groups.setdefault(kind, []).append(ln)
            if kind == "road":
                lanes.append(ln)
    for kind, lns in groups.items():
        for ln in lines(linemerge(lns)):
            for seg in lines(ln.intersection(clip)):
                if seg.length < (30 if kind != "trail" else 60):
                    continue
                w = {"road": 8.0, "service": 5.0, "trail": 2.4}[kind]
                roads_out.append({"k": kind, "w": w, "p": drape(seg, max(g.dx * 0.6, 6), 0.9 * vex if kind != "trail" else 0.6 * vex)})
    lanes_out = []
    for ln in lines(linemerge(lanes)) if lanes else []:
        for seg in lines(ln.intersection(clip)):
            if seg.length > 300:
                lanes_out.append(drape(seg, 15, 0.9 * vex))
    print(f"  roads: {len(roads_out)}, lanes for traffic: {len(lanes_out)}")

    # ---- buildings, sitting on the ground
    import models3d
    models_out, model_keys = models3d.place(pid, g.proj, clip)
    for m in models_out:
        m["z"] = round(float(zat(m["x"], m["y"])), 1)
    if models_out:
        print(f"  Commons 3D models: {', '.join(m['name'] for m in models_out)}")
    bld_out, model_boxes = [], []
    for p0, t, key in buildings:
        for p in polys(p0.intersection(clip)):
            if p.area < place.get("min_building", 12):
                continue
            p = orient(p.simplify(0.4), 1.0)
            ring = ring_flat(p.exterior.coords)
            if len(ring) < 6:
                continue
            base = min(zat(ring[i], ring[i + 1]) for i in range(0, len(ring), 2))
            H = parse_len(t.get("height"))
            lv = t.get("building:levels")
            if H is None and lv:
                try:
                    H = float(lv) * 3.4 + 1
                except ValueError:
                    H = None
            if H is None:
                H = 5.5 if p.area < 400 else 8 + 4 * random.Random(key).random()
            sd = int(hashlib.md5(key.encode()).hexdigest()[:6], 16) / 0xFFFFFF
            (model_boxes if key in model_keys else bld_out).append(
                {"r": [ring], "m": round(base - 2, 1), "h": round(base + H, 1),
                 "k": "res" if p.area < 300 else "civ", "s": round(sd, 3)})
    print(f"  buildings: {len(bld_out)}")
    chalets_out = []
    if place.get("chalets"):
        import alpine
        chalets_out = alpine.chalets(bld_out)
        bld_out = []
        print(f"  chalets: {len(chalets_out) // 8}")

    # ---- trees
    trees = []
    near_water = np.zeros_like(cls, bool)
    if rivers_out or lakes_out:
        im = Image.new("L", (g.nx, g.ny), 0)
        d = ImageDraw.Draw(im)
        for r in rivers_out:
            pts = [g.px(r["p"][i], r["p"][i + 1]) for i in range(0, len(r["p"]), 3)]
            d.line(pts, fill=255, width=max(2, int(70 / g.dx)))
        near_water = np.asarray(im) > 0
    cap = place.get("tree_cap", 42000)
    forest = cls == FOREST
    n_forest = int(forest.sum())
    p_tree = min(0.85, cap / max(1, n_forest))
    tall = {"yosemite": 46, "tuolumne": 24, "mono": 28}.get(pid, place.get("tree_tall", 30))
    med = place["veg"] == "med"
    pick = forest | (cls == SAGE) | (cls == GROVE) if med else forest | (cls == SAGE)
    for j, i in zip(*np.nonzero(pick)):
        c = cls[j, i]
        e = dem[j, i]
        if med:
            # Amalfi: lemon groves on the terraces, maquis with stone pines and
            # olives near the sea, chestnut and oak woods higher up
            if c == GROVE:
                if rnd.random() > 0.55:
                    continue
                kind, sz = 4, 0.5 + 0.2 * rnd.random()
            elif c == SAGE:
                if rnd.random() > 0.07:
                    continue
                kind, sz = (3, 0.7 + 0.4 * rnd.random()) if rnd.random() < 0.45 else (4, 0.45)
            else:
                if rnd.random() > p_tree:
                    continue
                kind = 1 if rnd.random() < 0.7 else 0
                sz = 0.7 + 0.5 * rnd.random()
            x = g.x0 + (i + rnd.uniform(-0.45, 0.45)) * g.dx
            y = g.y1 - (j + rnd.uniform(-0.45, 0.45)) * g.dy
            trees += [round(x, 1), round(y, 1), round(zat(x, y), 1), round(sz * tall / 30, 2), kind]
            continue
        if c == SAGE:
            if rnd.random() > 0.015:                   # a few junipers and pinyons in the sage
                continue
            kind, sz = 0, 0.35
        else:
            if rnd.random() > p_tree:
                continue
            sz = 0.75 + 0.5 * rnd.random()
            kind = 0
            # deciduous: black oaks and dogwoods on Yosemite's valley floor,
            # aspens along creeks on the east side and up Lee Vining Canyon
            if pid == "yosemite" and e < 1300 and slope[j, i] < 12 and rnd.random() < 0.38:
                kind = 1
            elif near_water[j, i] and 1900 < e < 3000 and rnd.random() < (0.6 if place["veg"] == "eastside" else 0.12):
                kind = 2
            elif place["veg"] == "alps" and rnd.random() < 0.5:   # larch among the arolla pines
                kind = 1
            # thin out up high
            if e > tl - 250 and rnd.random() < (e - (tl - 250)) / 250:
                continue
        x = g.x0 + (i + rnd.uniform(-0.45, 0.45)) * g.dx
        y = g.y1 - (j + rnd.uniform(-0.45, 0.45)) * g.dy
        trees += [round(x, 1), round(y, 1), round(zat(x, y), 1), round(sz * tall / 30, 2), kind]
    print(f"  trees: {len(trees) // 5:,}")

    # ---- named things
    def find(rx):
        best = None
        for nm, geom, t in named:
            if re.search(rx, nm):
                score = 2 if isinstance(geom, Point) else 1
                if best is None or score > best[0]:
                    best = (score, geom, t)
        return best

    def ft(m):
        return f"{round(m * 3.28084 / 10) * 10:,.0f} ft"

    labels_out = []
    for label, rx, lat, lon, lift, kind in place["labels"]:
        hit = find(rx)
        if hit:
            geom, t = hit[1], hit[2]
            pt = geom if isinstance(geom, Point) else geom.representative_point() if geom.area > 0 else geom.interpolate(0.5, normalized=True)
            x, y = pt.x, pt.y
        else:
            x, y = g.proj(lat, lon)
            t = {}
        if not clip.contains(Point(x, y)):
            continue
        sub = ""
        if kind == "peak":
            # highest ground within 80 m, or the OSM ele tag
            c, r = g.px(x, y)
            rr = max(1, int(80 / g.dx))
            win = dem[max(0, int(r) - rr):int(r) + rr + 1, max(0, int(c) - rr):int(c) + rr + 1]
            ele = parse_len(t.get("ele")) or (float(win.max()) if win.size else hat(x, y))
            sub = ft(ele)
        ground = zat(x, y)
        if place.get("sea"):
            ground = max(ground, (0.0 - h0) * vex)       # sea stacks and islets sit on the water
        labels_out.append({"t": label, "s": sub, "k": kind, "x": round(x, 1), "y": round(y, 1),
                           "z": round(ground + lift * vex, 1), "osm": bool(hit)})

    # ---- waterfalls: find the cliff that matches each fall's real drop, then
    # follow the steepest way down it
    # lowest of the 8 neighbours for every cell (D8 flow direction)
    pad = np.pad(dem, 1, mode="edge")
    offs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    stack = np.stack([pad[1 + dj:1 + dj + g.ny, 1 + di:1 + di + g.nx] for dj, di in offs])
    lowest = stack.argmin(0)
    lower = stack.min(0) < dem - 0.05

    def descend(x, y, drop):
        c, r = g.px(x, y)
        i, j = int(round(c)), int(round(r))
        if not (0 <= i < g.nx and 0 <= j < g.ny):
            return [(x, y, hat(x, y))], 0.0
        top = dem[j, i]
        pts = [(g.x0 + i * g.dx, g.y1 - j * g.dy, float(top))]
        horiz = 0.0
        while horiz < drop * 2.5 + 60 and lower[j, i]:
            dj, di = offs[lowest[j, i]]
            j, i = j + dj, i + di
            if not (0 <= i < g.nx and 0 <= j < g.ny):
                break
            horiz += math.hypot(di * g.dx, dj * g.dy)
            pts.append((g.x0 + i * g.dx, g.y1 - j * g.dy, float(dem[j, i])))
            if top - dem[j, i] >= drop:
                break
        return pts, horiz

    falls_out = []
    for rx, lat, lon, drop in place.get("falls", []):
        fx, fy = g.proj(lat, lon)
        hit = find(rx)
        if hit and isinstance(hit[1], Point) and hit[1].distance(Point(fx, fy)) < 500:
            fx, fy = (fx + hit[1].x) / 2, (fy + hit[1].y) / 2
        best, best_score = None, -1
        for ox in range(-210, 211, int(g.dx)):
            for oy in range(-210, 211, int(g.dy)):
                sx, sy = fx + ox, fy + oy
                if math.hypot(ox, oy) > 210 or not clip.contains(Point(sx, sy)):
                    continue
                pts, horiz = descend(sx, sy, drop)
                got = pts[0][2] - pts[-1][2]
                if got < 0.75 * drop or got > 1.3 * drop:
                    continue
                score = got / max(horiz, 1.0) - math.hypot(ox, oy) / 2000
                if score > best_score:
                    best, best_score = pts, score
        if best is None:
            print(f"  waterfall {rx}: no cliff of {drop} m found nearby, skipped")
            continue
        flat_pts = []
        for px_, py_, _ in best:
            flat_pts += [round(px_, 1), round(py_, 1), round(zat(px_, py_) + 1.5 * vex, 1)]
        name = re.sub(r"[\^$]", "", rx).title()
        got = best[0][2] - best[-1][2]
        falls_out.append({"n": name, "drop": round(drop), "p": flat_pts})
        print(f"  waterfall {name}: {got:.0f} m of the real {drop} m found, slope {best_score:.1f}")
    # report drops on fall labels
    for lab in labels_out:
        if lab["k"] == "fall":
            near = [f for f in falls_out if math.hypot(f["p"][0] - lab["x"], f["p"][1] - lab["y"]) < 400]
            if near:
                lab["s"] = ft(max(f["drop"] for f in near)) + " drop"

    # ---- climbers' headlamps on the big walls
    lamps = []
    for lat, lon, rad in place.get("walls", []):
        cx, cy = g.proj(lat, lon)
        c0, r0 = g.px(cx, cy)
        rr = int(rad / g.dx)
        cand = []
        for j in range(max(1, int(r0) - rr), min(g.ny - 1, int(r0) + rr)):
            for i in range(max(1, int(c0) - rr), min(g.nx - 1, int(c0) + rr)):
                if slope[j, i] > 58 and math.hypot(i - c0, j - r0) < rr:
                    cand.append((i, j))
        rnd.shuffle(cand)
        for i, j in cand[:12]:
            x = g.x0 + i * g.dx
            y = g.y1 - j * g.dy
            # step out from the wall toward the downhill side
            ox, oy = -gx[j, i], gy[j, i]
            n = math.hypot(ox, oy) or 1
            x += ox / n * g.dx * 0.6
            y += oy / n * g.dx * 0.6
            lamps += [round(x, 1), round(y, 1), round(zat(x, y) + 3, 1)]
    if lamps:
        print(f"  headlamps: {len(lamps) // 3}")

    # ---- tufa towers
    tufa = []
    if place.get("tufa") and lakes_out:
        level = max(lakes_out, key=lambda l: len(l["r"][0]))["level"]
        for lat, lon, rad, count in place["tufa"]:
            cx, cy = g.proj(lat, lon)
            placed, tries = 0, 0
            while placed < count and tries < count * 60:
                tries += 1
                a, d = rnd.uniform(0, 2 * math.pi), rad * math.sqrt(rnd.random())
                x, y = cx + d * math.cos(a), cy + d * math.sin(a)
                h = hat(x, y)
                if level - 2.5 <= h <= level + 9 and clip.contains(Point(x, y)):
                    tufa += [round(x, 1), round(y, 1), round(max(zat(x, y), (level - h0) * vex), 1),
                             round(0.6 + 0.8 * rnd.random(), 2)]
                    placed += 1
        print(f"  tufa: {len(tufa) // 4}")

    gulls = None
    if place.get("gulls"):
        hit = find(r"^negit island$")
        gx_, gy_ = (hit[1].representative_point().x, hit[1].representative_point().y) if hit else g.proj(*place["gulls"])
        gulls = [round(gx_, 1), round(gy_, 1), round(zat(gx_, gy_) + 60 * vex, 1)]

    # ---- coast extras: the coast road, ferry lines, anchored boats, beach umbrellas
    sea_z = round((0.0 - h0) * vex, 2) if place.get("sea") else None
    drive = None
    if place.get("drive_rx"):
        rx = re.compile(place["drive_rx"], re.I)
        segs = [ln for hw, ln, t in roads if rx.search(f"{t.get('ref', '')} {t.get('name', '')}")]
        pieces = sorted(lines(linemerge(segs)), key=lambda l: -l.length) if segs else []
        if pieces:
            # chain the pieces end to end (tunnels and junctions break the ways up)
            chain = list(pieces[0].coords)
            rest = pieces[1:]
            grew = True
            while grew and rest:
                grew = False
                for k, pc in enumerate(rest):
                    c = list(pc.coords)
                    for cand, at_end in ((c, True), (c[::-1], True), (c, False), (c[::-1], False)):
                        a = chain[-1] if at_end else chain[0]
                        b = cand[0] if at_end else cand[-1]
                        if math.hypot(a[0] - b[0], a[1] - b[1]) < 120:
                            chain = chain + cand[1:] if at_end else cand[:-1] + chain
                            rest.pop(k); grew = True
                            break
                    if grew:
                        break
            dl = LineString(chain).intersection(clip)
            dl = max(lines(dl), key=lambda l: l.length) if lines(dl) else None
            if dl is not None and dl.length > 1000:
                # run west to east
                if dl.coords[0][0] > dl.coords[-1][0]:
                    dl = LineString(list(dl.coords)[::-1])
                drive = drape(dl, 12, 0.9 * vex)
                lanes_out.insert(0, drive)
                print(f"  coast road: {dl.length / 1000:.1f} km")

    routes = []
    if sea_z is not None:
        for ln in lines(linemerge(ferries)) if ferries else []:
            for seg in lines(ln.intersection(clip)):
                if seg.length > 1500:
                    seg = seg.simplify(25)
                    routes.append([v for x, y in seg.coords for v in (round(x, 1), round(y, 1))])
        for wp in place.get("boat_routes", []):
            pts = [g.proj(a, b) for a, b in wp]
            routes.append([v for x, y in pts for v in (round(x, 1), round(y, 1))])
        print(f"  boat routes: {len(routes)} ({len(ferries)} OSM ferry ways)")

    anchored = []
    for lat, lon, rad, count in place.get("anchorages", []):
        cx, cy = g.proj(lat, lon)
        placed, tries = 0, 0
        while placed < count and tries < count * 80:
            tries += 1
            a, d = rnd.uniform(0, 2 * math.pi), rad * math.sqrt(rnd.random())
            x, y = cx + d * math.cos(a), cy + d * math.sin(a)
            if clip.contains(Point(x, y)) and hat(x, y) < -5:
                anchored += [round(x, 1), round(y, 1), round(rnd.uniform(0, 6.28), 2), round(rnd.random(), 2)]
                placed += 1
    if anchored:
        print(f"  anchored boats: {len(anchored) // 4}")

    umbrellas = []
    if sea_z is not None and sand:
        beach = unary_union(sand).intersection(clip)
        for p in polys(beach):
            n = int(min(400, p.area / 55))
            minx, miny, maxx, maxy = p.bounds
            got, tries = 0, 0
            while got < n and tries < n * 30:
                tries += 1
                x, y = rnd.uniform(minx, maxx), rnd.uniform(miny, maxy)
                if p.contains(Point(x, y)):
                    umbrellas += [round(x, 1), round(y, 1), round(max(zat(x, y), sea_z + 0.6 * vex), 1), round(rnd.random(), 2)]
                    got += 1
        print(f"  beach umbrellas: {len(umbrellas) // 4}")

    alpine_out = {}
    if place.get("alpine"):
        import alpine
        alpine_out = alpine.extras(place, els, g, zat, hat, dem, cls, slope, clip, rnd, vex)
        alpine_out["chalets"] = chalets_out

    # ---- write
    zmax = float(z.max())
    zq = np.clip(np.round(z / zmax * 65535), 0, 65535).astype("<u2")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{pid}.bin").write_bytes(zq.tobytes() + cls.astype(np.uint8).tobytes())
    scene = {
        "meta": {
            "kind": "terrain", "place": pid, "name": place["name"],
            "origin": [g.lat0, g.lon0], "bbox": list(place["bbox"]),
            "extent": [round(g.x0, 1), round(g.y0, 1), round(g.x1, 1), round(g.y1, 1)],
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "attribution": f"Elevation: {dem_src} · Map data © OpenStreetMap contributors (ODbL)",
            "elev": [round(float(dem.min()), 1), round(float(dem.max()), 1)],
        },
        "grid": {"nx": g.nx, "ny": g.ny, "x0": round(g.x0, 2), "y1": round(g.y1, 2),
                 "dx": round(g.dx, 4), "dy": round(g.dy, 4), "zmax": round(zmax, 2),
                 "h0": round(h0, 2), "vexag": vex, "bin": f"{pid}.bin", "sea": sea_z},
        "lakes": lakes_out, "rivers": rivers_out, "roads": roads_out, "lanes": lanes_out,
        "buildings": bld_out, "trees": trees, "labels": labels_out, "falls": falls_out,
        "lamps": lamps, "tufa": tufa, "gulls": gulls,
        "drive": drive, "routes": routes, "anchored": anchored, "umbrellas": umbrellas,
        "models": models_out, "model_boxes": model_boxes,
        **alpine_out,
    }
    (OUT / f"{pid}.json").write_text(json.dumps(scene, separators=(",", ":"), default=float))
    kb = ((OUT / f"{pid}.json").stat().st_size + (OUT / f"{pid}.bin").stat().st_size) / 1e6
    print(f"  wrote {pid}.json + {pid}.bin ({kb:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "build", "all"])
    ap.add_argument("--place", action="append", help="place id (default: all)")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    ids = a.place or list(PLACES)
    failed = []
    for pid in ids:
        place = PLACES[pid]
        try:
            if a.cmd in ("fetch", "all"):
                fetch(place, a.force)
            if a.cmd in ("build", "all"):
                build(place)
        except SystemExit as exc:
            print(exc)
            failed.append(pid)
        except Exception:                      # one broken place shouldn't take the others down
            import traceback
            traceback.print_exc()
            print(f"[{pid}] FAILED")
            failed.append(pid)
    if failed:
        print(f"failed: {', '.join(failed)}")
        if len(failed) == len(ids):
            sys.exit(1)


if __name__ == "__main__":
    main()
