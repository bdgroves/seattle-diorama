"""Place the Commons 3D models found by wikidata3d.py on their real OSM footprints.

Shared by build.py (Seattle) and terrain.py (the terrain places). Each model
gets the footprint's centre, its long and short side and orientation (from
the minimum rotated rectangle), and the OSM height when tagged. The viewer
sizes and turns the model to match.
"""
import json
import math
import re
from pathlib import Path

from shapely.geometry import Point, Polygon

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"


def parse_m(v):
    if not v:
        return None
    m = re.match(r"\s*([\d.]+)\s*(m|ft|')?", str(v))
    if not m:
        return None
    x = float(m.group(1))
    return x * 0.3048 if m.group(2) in ("ft", "'") else x


def load(pid):
    p = RAW / "models.json"
    if not p.exists():
        return []
    return json.loads(p.read_text()).get(pid, [])


def place(pid, proj, clip=None):
    """Model records in local metres for this place, and the OSM keys they replace."""
    out, keys = [], set()
    for r in load(pid):
        ring = [proj(a, b) for a, b in r.get("ring") or []]
        cx, cy = proj(r["lat"], r["lon"])
        if clip is not None and not clip.contains(Point(cx, cy)):
            continue
        w = d = ang = None
        if len(ring) >= 4:
            poly = Polygon(ring).buffer(0)
            if not poly.is_empty:
                c = poly.centroid
                cx, cy = c.x, c.y
                rect = list(poly.minimum_rotated_rectangle.exterior.coords)
                e1 = (rect[1][0] - rect[0][0], rect[1][1] - rect[0][1])
                e2 = (rect[2][0] - rect[1][0], rect[2][1] - rect[1][1])
                l1, l2 = math.hypot(*e1), math.hypot(*e2)
                long_e = e1 if l1 >= l2 else e2
                w, d = max(l1, l2), min(l1, l2)
                ang = math.atan2(long_e[1], long_e[0])
        out.append({
            "qid": r["qid"], "key": r["key"], "name": r["name"], "file": r["file"],
            "x": round(cx, 1), "y": round(cy, 1),
            "w": round(w, 1) if w else None, "d": round(d, 1) if d else None,
            "angle": round(ang, 3) if ang is not None else None,
            "h": parse_m(r.get("height")),
            "license": r.get("license"), "artist": r.get("artist"), "page": r.get("page"),
            "commons": r.get("commons"),
        })
        keys.add(r["key"])
    return out, keys
