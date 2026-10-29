"""Convert raw OSM (Overpass JSON) into the compact scene.json the viewer loads.

Everything is projected to a local planar grid in meters (x east, y north)
centred on config.ORIGIN, clipped to the study box, simplified and rounded.

Usage:  pixi run build  [--input data/raw/osm.json]
"""
import argparse
import hashlib
import json
import math
import random
import re
from datetime import datetime, timezone
from pathlib import Path

from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import linemerge, polygonize, split, unary_union
from shapely.prepared import prep

import config

# ----------------------------------------------------------------------------
# projection
LAT0, LON0 = config.ORIGIN
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_574.0


def proj(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


S, W, N, E = config.BBOX
X0, Y0 = proj(S, W)
X1, Y1 = proj(N, E)
CLIP = box(X0, Y0, X1, Y1)


def seed_of(key):
    return int(hashlib.md5(str(key).encode()).hexdigest()[:6], 16) / 0xFFFFFF


# ----------------------------------------------------------------------------
# OSM helpers
def way_coords(el):
    return [proj(p["lat"], p["lon"]) for p in el.get("geometry", []) if p]


def way_polygon(el):
    pts = way_coords(el)
    if len(pts) < 4 or pts[0] != pts[-1]:
        return None
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    return poly if not poly.is_empty else None


def relation_polygon(el):
    outers, inners = [], []
    for m in el.get("members", []):
        if m.get("type") != "way" or "geometry" not in m:
            continue
        pts = [proj(p["lat"], p["lon"]) for p in m["geometry"] if p]
        if len(pts) < 2:
            continue
        (inners if m.get("role") == "inner" else outers).append(LineString(pts))
    if not outers:
        return None
    outer = unary_union(list(polygonize(linemerge(outers) if len(outers) > 1 else outers)))
    if inners:
        inner = unary_union(list(polygonize(linemerge(inners) if len(inners) > 1 else inners)))
        outer = outer.difference(inner)
    if not outer.is_valid:
        outer = outer.buffer(0)
    return outer if not outer.is_empty else None


def element_polygon(el):
    if el["type"] == "way":
        return way_polygon(el)
    if el["type"] == "relation":
        return relation_polygon(el)
    return None


def polys_of(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def lines_of(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    if isinstance(geom, MultiLineString):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, LineString)]


LEN_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|meters?|ft|feet|')?\s*(?:([0-9]+(?:\.[0-9]+)?)\s*(?:\"|in))?\s*$", re.I)


def parse_len(v):
    if v is None:
        return None
    v = str(v).split(";")[0].replace(",", ".")
    m = LEN_RE.match(v)
    if not m:
        return None
    num = float(m.group(1))
    unit = (m.group(2) or "m").lower()
    if unit in ("ft", "feet", "'"):
        inches = float(m.group(3)) if m.group(3) else 0.0
        return num * 0.3048 + inches * 0.0254
    return num


def parse_float(v):
    try:
        return float(str(v).split(";")[0].replace(",", "."))
    except (TypeError, ValueError):
        return None


LEVEL_H = 3.4
DEFAULT_H = {
    "house": 8, "detached": 8, "semidetached_house": 8, "terrace": 9,
    "residential": 12, "apartments": 18, "dormitory": 15, "hotel": 30,
    "commercial": 10, "retail": 8, "office": 24, "industrial": 9,
    "warehouse": 9, "garage": 4, "garages": 4, "parking": 12, "shed": 3,
    "church": 14, "civic": 14, "public": 14, "school": 12, "university": 16,
    "stadium": 22, "roof": 6, "kiosk": 3, "service": 4, "train_station": 10,
}
KIND = {
    "house": "res", "detached": "res", "semidetached_house": "res", "terrace": "res",
    "residential": "res", "apartments": "res", "dormitory": "res",
    "hotel": "com", "commercial": "com", "retail": "com", "office": "com",
    "industrial": "ind", "warehouse": "ind", "garage": "ind", "garages": "ind",
    "parking": "ind", "shed": "ind", "service": "ind",
    "church": "civ", "civic": "civ", "public": "civ", "school": "civ",
    "university": "civ", "stadium": "civ", "train_station": "civ", "museum": "civ",
}


def building_heights(tags, key, area):
    btype = tags.get("building") or tags.get("building:part") or "yes"
    h = parse_len(tags.get("height"))
    levels = parse_float(tags.get("building:levels"))
    if h is None and levels is not None:
        roof_levels = parse_float(tags.get("roof:levels")) or 0
        h = (levels + roof_levels) * LEVEL_H + 1.0
    if h is None:
        base = DEFAULT_H.get(btype, 10 if area > 400 else 7)
        h = base * (0.85 + 0.35 * seed_of(key))
    m = parse_len(tags.get("min_height"))
    if m is None:
        ml = parse_float(tags.get("building:min_level"))
        m = ml * LEVEL_H if ml is not None else 0.0
    h = max(h, m + 2.5)
    return round(h, 1), round(m, 1), KIND.get(btype, "gen")


# ----------------------------------------------------------------------------
# geometry output helpers
def flat(coords, close_drop=True):
    pts = list(coords)
    if close_drop and len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    out = []
    for x, y in pts:
        out.extend((round(x, 1), round(y, 1)))
    return out


def poly_rings(p, tol=0.25):
    p = p.simplify(tol, preserve_topology=True)
    if p.is_empty or not isinstance(p, Polygon) or p.area < 1.0:
        return None
    p = orient(p, sign=1.0)  # exterior CCW, holes CW
    rings = [flat(p.exterior.coords)]
    for hole in p.interiors:
        if Polygon(hole).area > 2.0:
            rings.append(flat(hole.coords))
    if len(rings[0]) < 6:
        return None
    return rings


def layer(geoms, tol=0.4):
    out = []
    for g in geoms:
        for p in polys_of(g.intersection(CLIP)):
            r = poly_rings(p, tol)
            if r:
                out.append(r)
    return out


# ----------------------------------------------------------------------------
ROAD_W = {
    "motorway": 14, "trunk": 13, "primary": 12, "secondary": 10.5, "tertiary": 9,
    "unclassified": 7.5, "residential": 7.5, "living_street": 6, "service": 4.5,
    "motorway_link": 7, "trunk_link": 7, "primary_link": 7, "secondary_link": 7,
    "tertiary_link": 6, "busway": 6,
}
PATH_W = {"pedestrian": 6, "footway": 2.2, "path": 2.0, "cycleway": 2.5,
          "steps": 2.2, "track": 3}
LANE_CLASSES = {"primary", "secondary", "tertiary", "residential", "unclassified",
                "trunk", "motorway", "living_street", "primary_link",
                "secondary_link", "tertiary_link"}
TREE_STREETS = {"secondary", "tertiary", "residential", "unclassified",
                "living_street", "primary"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default=str(config.RAW_OSM))
    ap.add_argument("--output", default=str(config.SCENE_OUT))
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        raise SystemExit(f"{src} not found - run `pixi run fetch` first (or `pixi run demo`).")
    els = json.loads(src.read_text(encoding="utf-8"))["elements"]
    print(f"Loaded {len(els):,} OSM elements from {src.name}")

    needle_xy = proj(*config.SPACE_NEEDLE)
    needle_pt = Point(needle_xy)

    buildings, parts = [], []
    roads, paths, lanes, tree_streets = [], [], [], []
    water, parks, plazas, coast, monorail = [], [], [], [], []
    tree_nodes = []
    westin = []

    for el in els:
        t = el.get("tags", {})
        if el["type"] == "node":
            if t.get("natural") == "tree":
                tree_nodes.append(proj(el["lat"], el["lon"]))
            continue

        if "building" in t or "building:part" in t:
            if t.get("building") in ("no", "construction") or t.get("location") == "underground":
                continue
            if t.get("layer", "0").startswith("-"):
                continue
            poly = element_polygon(el)
            if poly is None:
                continue
            rec = {"geom": poly, "tags": t, "key": f"{el['type']}{el['id']}"}
            if "westin" in (t.get("name", "") + t.get("brand", "")).lower():
                westin.append(rec)
            (parts if "building:part" in t and "building" not in t else buildings).append(rec)
            continue

        hw = t.get("highway")
        if hw and el["type"] == "way":
            if t.get("tunnel") in ("yes", "building_passage") or t.get("layer", "0").startswith("-"):
                continue
            if t.get("area") == "yes":
                p = way_polygon(el)
                if p is not None:
                    plazas.append(p)
                continue
            pts = way_coords(el)
            if len(pts) < 2:
                continue
            line = LineString(pts)
            if hw in ROAD_W:
                w = ROAD_W[hw]
                lanes_tag = parse_float(t.get("lanes"))
                if lanes_tag and hw not in ("service",):
                    w = max(w, min(lanes_tag * 3.3, 22))
                roads.append(line.buffer(w / 2, cap_style="flat", join_style="round", quad_segs=3))
                if hw in LANE_CLASSES:
                    lanes.append(line)
                if hw in TREE_STREETS:
                    tree_streets.append((line, w))
            elif hw in PATH_W:
                paths.append(line.buffer(PATH_W[hw] / 2, cap_style="round", quad_segs=2))
            continue

        rw = t.get("railway")
        if rw == "monorail" and el["type"] == "way":
            pts = way_coords(el)
            if len(pts) >= 2:
                monorail.append(LineString(pts))
            continue

        if t.get("natural") == "coastline":
            pts = way_coords(el)
            if len(pts) >= 2:
                coast.append(LineString(pts))
            continue

        if t.get("natural") == "water":
            p = element_polygon(el)
            if p is not None:
                water.append(p)
            continue

        if t.get("leisure") or t.get("landuse"):
            p = element_polygon(el)
            if p is not None:
                parks.append(p)
            continue

        if t.get("place") == "square":
            p = element_polygon(el)
            if p is not None:
                plazas.append(p)

    # ---------------- sea from coastline (land is on the left of the way)
    if coast:
        merged = lines_of(linemerge(coast))
        bigger = CLIP.buffer(50)
        pieces = [CLIP]
        for ln in merged:
            ln = ln.intersection(bigger)
            for seg in lines_of(ln):
                nxt = []
                for pc in pieces:
                    nxt.extend(polys_of(split(pc, seg)) if pc.intersects(seg) else [pc])
                pieces = nxt
        coast_tree = STRtree(merged)
        for pc in pieces:
            rp = pc.representative_point()
            ln = merged[coast_tree.nearest(rp)]
            d = ln.project(rp)
            a = ln.interpolate(max(d - 1.0, 0))
            b = ln.interpolate(min(d + 1.0, ln.length))
            cross = (b.x - a.x) * (rp.y - a.y) - (b.y - a.y) * (rp.x - a.x)
            if cross < 0:  # right of the line -> water
                water.append(pc)
        print(f"Coastline: {len(merged)} line(s) -> {len(pieces)} pieces")

    # ---------------- Westin towers
    westin_out, westin_keys = [], set()
    for rec in westin:
        g = rec["geom"]
        if isinstance(g, MultiPolygon):
            continue
        compact = 4 * math.pi * g.area / (g.length ** 2) if g.length else 0
        if compact > 0.78 and 400 < g.area < 3000:
            h, _, _ = building_heights(rec["tags"], rec["key"], g.area)
            if h < 60:
                h = 125.0 + 8.0 * len(westin_out)
            c = g.centroid
            westin_out.append([round(c.x, 1), round(c.y, 1), round(math.sqrt(g.area / math.pi), 1), round(h, 1)])
            westin_keys.add(rec["key"])
    if len(westin_out) < 2:
        print("Westin towers not found as round OSM footprints - using approximate positions")
        westin_out = []
        for lat, lon, r, h in config.WESTIN_FALLBACK:
            x, y = proj(lat, lon)
            westin_out.append([round(x, 1), round(y, 1), r, h])
    westin_pts = [(Point(w[0], w[1]), w[2] + 4) for w in westin_out]

    def is_landmark(g):
        c = g.centroid
        if c.distance(needle_pt) < config.NEEDLE_CLEAR_RADIUS:
            return True
        return any(c.distance(p) < r for p, r in westin_pts)

    # ---------------- buildings (outline skipped when it has parts)
    part_tree = STRtree([p["geom"] for p in parts]) if parts else None
    out_b, foot = [], []

    def emit(rec):
        g = rec["geom"]
        if rec["key"] in westin_keys or is_landmark(g):
            return
        if not CLIP.contains(g.representative_point()):
            return
        h, m, kind = building_heights(rec["tags"], rec["key"], g.area)
        for p in polys_of(g.intersection(CLIP)):
            rings = poly_rings(p, 0.2)
            if rings:
                out_b.append({"r": rings, "h": h, "m": m, "k": kind,
                              "s": round(seed_of(rec["key"]), 3)})
                if m < 3:
                    foot.append(p)

    for rec in buildings:
        g = rec["geom"]
        if part_tree is not None:
            hits = part_tree.query(g, predicate="contains_properly")
            if len(hits) == 0:
                hits = [i for i in part_tree.query(g) if g.contains(parts[i]["geom"].representative_point())]
            if len(hits) > 0:
                continue
        emit(rec)
    for rec in parts:
        emit(rec)
    print(f"Buildings: {len(out_b):,} prisms ({len(buildings):,} outlines, {len(parts):,} parts)")

    # ---------------- ground layers
    road_u = unary_union(roads) if roads else Polygon()
    walk_u = road_u.buffer(2.6, quad_segs=2) if roads else Polygon()
    path_u = unary_union(paths) if paths else Polygon()
    water_u = unary_union(water) if water else Polygon()
    park_u = unary_union(parks).difference(water_u) if parks else Polygon()
    plaza_u = unary_union(plazas).difference(water_u) if plazas else Polygon()
    foot_u = unary_union(foot) if foot else Polygon()

    # ---------------- trees
    rnd = random.Random(1962)  # World's Fair year
    blocked = prep(unary_union([foot_u.buffer(2.0), road_u.buffer(0.6), water_u.buffer(1.0)]))
    trees = []
    for x, y in tree_nodes:
        if CLIP.contains(Point(x, y)):
            trees.append((x, y, 0.8 + 0.5 * rnd.random(), 0))
    for line, w in tree_streets:
        L = line.length
        d = rnd.uniform(3, 10)
        while d < L:
            p = line.interpolate(d)
            q = line.interpolate(min(d + 0.5, L))
            dx, dy = q.x - p.x, q.y - p.y
            n = math.hypot(dx, dy) or 1.0
            for side in (-1, 1):
                if rnd.random() < 0.62:
                    off = (w / 2 + 1.6) * side
                    x, y = p.x - dy / n * off, p.y + dx / n * off
                    if CLIP.contains(Point(x, y)) and not blocked.contains(Point(x, y)):
                        trees.append((x, y, 0.75 + 0.45 * rnd.random(), 0))
            d += rnd.uniform(9, 15)
    park_blocked = prep(unary_union([foot_u.buffer(3.0), path_u.buffer(1.0), road_u.buffer(1.5),
                                     water_u.buffer(1.5)]))
    for p in polys_of(park_u.intersection(CLIP)):
        n = int(p.area / 260)
        minx, miny, maxx, maxy = p.bounds
        pp = prep(p)
        placed = 0
        tries = 0
        while placed < n and tries < n * 8:
            tries += 1
            pt = Point(rnd.uniform(minx, maxx), rnd.uniform(miny, maxy))
            if pp.contains(pt) and not park_blocked.contains(pt):
                kind = 1 if rnd.random() < 0.28 else 0
                trees.append((pt.x, pt.y, 0.9 + 0.7 * rnd.random(), kind))
                placed += 1
    tree_flat = []
    for x, y, s, k in trees:
        tree_flat.extend((round(x, 1), round(y, 1), round(s, 2), k))
    print(f"Trees: {len(trees):,} ({len(tree_nodes):,} mapped in OSM)")

    # ---------------- car lanes (merged for long runs)
    lane_out = []
    for ln in lines_of(linemerge(lanes)) if lanes else []:
        for seg in lines_of(ln.intersection(CLIP)):
            if seg.length > 60:
                lane_out.append(flat(seg.simplify(0.5).coords, close_drop=False))

    # ---------------- monorail
    if monorail:
        mono = [l for l in lines_of(linemerge(monorail)) if l.length > 150]
    else:
        mono = []
    if not mono:
        print("No railway=monorail in OSM - using approximate alignment")
        mono = [LineString([proj(a, b) for a, b in config.MONORAIL_FALLBACK])]
    mono.sort(key=lambda l: -l.length)
    mono = mono[:2]
    if len(mono) == 1:
        base = mono[0]
        mono = [base.offset_curve(2.7), base.offset_curve(-2.7)]
    mono_out = []
    for l in mono:
        l = l.simplify(0.3)
        # run every line from Seattle Center (north) to Westlake (south)
        c = list(l.coords)
        if c[0][1] < c[-1][1]:
            c.reverse()
        mono_out.append(flat(c, close_drop=False))
    print(f"Monorail: {len(mono_out)} beam(s), {sum(l.length for l in mono):.0f} m")

    scene = {
        "meta": {
            "origin": [LAT0, LON0],
            "bbox": list(config.BBOX),
            "extent": [round(X0, 1), round(Y0, 1), round(X1, 1), round(Y1, 1)],
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": src.name,
            "attribution": "© OpenStreetMap contributors (ODbL)",
        },
        "buildings": out_b,
        "roads": layer([road_u], 0.4),
        "walks": layer([walk_u.difference(road_u)], 0.4),
        "paths": layer([path_u.difference(road_u)], 0.4),
        "water": layer([water_u], 0.8),
        "parks": layer([park_u], 0.6),
        "plazas": layer([plaza_u.difference(park_u)], 0.5),
        "trees": tree_flat,
        "lanes": lane_out,
        "monorail": mono_out,
        "landmarks": {
            "needle": [round(needle_xy[0], 1), round(needle_xy[1], 1)],
            "westin": westin_out,
        },
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
