"""Alpine extras for the terrain places (Zermatt): cable cars, gondolas and
chairlifts, the mountain railways, ski pistes, Swiss chalets and the cows.

Called from terrain.build() for places with "alpine": True. Everything is in
local metres like the rest of the scene; heights are scene z (exaggerated).
"""
from __future__ import annotations

import math

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import linemerge

LIFTS = {"cable_car", "gondola", "mixed_lift", "chair_lift", "drag_lift", "t-bar", "j-bar", "platter", "rope_tow"}
RAIL = {"rail", "narrow_gauge", "funicular", "light_rail"}
FOREST, ROCK, MEADOW, WATER, DEVELOPED, SAGE, SAND, SNOW, ALPINE = range(9)


def _lines(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "LineString"]


def extras(place, els, g, zat, hat, dem, cls, slope, clip, rnd, vex):
    def coords(el):
        return [g.proj(p["lat"], p["lon"]) for p in el.get("geometry") or [] if p]

    def drape(line, step, lift):
        L = line.length
        n = max(2, int(L / step) + 1)
        out = []
        for k in range(n):
            p = line.interpolate(min(L, k * L / (n - 1)))
            out += [round(p.x, 1), round(p.y, 1), round(zat(p.x, p.y) + lift, 1)]
        return out

    lifts, rails, pistes = [], {}, []
    tracks = {}                                      # whole lines, tunnels included, for the trains
    for el in els:
        if el.get("type") != "way":
            continue
        t = el.get("tags", {})
        a = t.get("aerialway")
        if a in LIFTS:
            pts = [p for p in coords(el) if clip.contains(Point(p))]
            if len(pts) < 2 or LineString(pts).length < 120:
                continue
            # bottom station first
            if hat(*pts[0]) > hat(*pts[-1]):
                pts = pts[::-1]
            flat = []
            for x, y in pts:
                flat += [round(x, 1), round(y, 1), round(zat(x, y), 1)]
            lifts.append({"k": a, "n": t.get("name", ""), "p": flat,
                          "occ": t.get("aerialway:occupancy", "")})
            continue
        r = t.get("railway")
        if r in RAIL and t.get("service") not in ("yard", "siding", "spur"):
            pts = coords(el)
            if len(pts) >= 2:
                who = (t.get("name", "") + " " + t.get("operator", "") + " " + t.get("network", "")).lower()
                if "gornergrat" in who or "ggb" in who or (r == "narrow_gauge" and "matterhorn" not in who and "mgb" not in who):
                    key = "Gornergratbahn"
                elif "matterhorn" in who or "mgb" in who or r == "rail":
                    key = "Matterhorn Gotthard Bahn"
                else:
                    key = t.get("name") or r
                tracks.setdefault(key, []).append(LineString(pts))
                if t.get("tunnel") in (None, "no"):
                    rails.setdefault((key, r), []).append(LineString(pts))
            continue
        if t.get("piste:type") == "downhill" and t.get("area") != "yes":
            pts = coords(el)
            if len(pts) < 2:
                continue
            ln = LineString(pts)
            if ln.is_closed or ln.length < 150:
                continue
            for seg in _lines(ln.intersection(clip)):
                if seg.length < 150:
                    continue
                c = list(seg.coords)
                if hat(*c[0]) < hat(*c[-1]):           # pistes run downhill
                    seg = LineString(c[::-1])
                d = t.get("piste:difficulty", "intermediate")
                p = drape(seg, 14, 0.7 * vex)
                e = float(np.mean([hat(seg.interpolate(f, normalized=True).x, seg.interpolate(f, normalized=True).y) for f in (0, 0.5, 1)]))
                pistes.append({"d": d, "p": p, "e": round(e), "n": t.get("name", "")})

    rails_out = []
    for (name, kind), lns in rails.items():
        for ln in _lines(linemerge(lns)):
            for seg in _lines(ln.intersection(clip)):
                if seg.length < 500:
                    continue
                rails_out.append({"n": name, "k": kind, "p": drape(seg, 10, 1.0 * vex)})
    rails_out.sort(key=lambda r: -len(r["p"]))
    def chain(lns):
        """Join pieces end to end (junctions and sidings break linemerge up)."""
        pieces = sorted(_lines(linemerge(lns)), key=lambda l: -l.length)
        if not pieces:
            return None
        line = list(pieces[0].coords)
        rest = pieces[1:]
        grew = True
        while grew and rest:
            grew = False
            best = None
            for k, pc in enumerate(rest):
                c = list(pc.coords)
                for end in (0, 1):
                    for pend in (0, 1):
                        a = line[-1] if end else line[0]
                        b = c[-1] if pend else c[0]
                        d = math.hypot(a[0] - b[0], a[1] - b[1])
                        if d < 80 and (best is None or d < best[0] or (d == best[0] and pc.length > rest[best[1]].length)):
                            best = (d, k, end, pend)
            if best:
                d, k, end, pend = best
                c = list(rest.pop(k).coords)
                if end:
                    line += (c if pend == 0 else c[::-1])
                else:
                    line = (c[::-1] if pend == 0 else c) + line
                grew = True
        return LineString(line)

    lines_out = []
    for name, lns in tracks.items():
        if "funicular" in name.lower():
            continue
        whole = chain(lns)
        if whole is None:
            continue
        seg = whole.intersection(clip)
        seg = max(_lines(seg), key=lambda l: l.length, default=None)
        if seg is not None and seg.length > 800:
            print(f"  train line {name}: {seg.length / 1000:.1f} km")
            lines_out.append({"n": name, "p": drape(seg, 10, 1.0 * vex)})

    # ---- cows: herds on the summer pastures
    ok = ((cls == MEADOW) | (cls == ALPINE)) & (dem > 1750) & (dem < 2550) & (slope < 24)
    js, is_ = np.nonzero(ok)
    cows = []
    centers = []
    tries = 0
    while len(centers) < 18 and tries < 4000 and len(js):
        tries += 1
        k = rnd.randrange(len(js))
        x = g.x0 + is_[k] * g.dx
        y = g.y1 - js[k] * g.dy
        if any(math.hypot(x - cx, y - cy) < 700 for cx, cy in centers):
            continue
        # a pasture worth the name: enough open ground around it
        j0, i0 = js[k], is_[k]
        win = ok[max(0, j0 - 5):j0 + 6, max(0, i0 - 5):i0 + 6]
        if win.mean() < 0.7:
            continue
        centers.append((x, y))
    for cx, cy in centers:
        n = rnd.randint(9, 22)
        for _ in range(n):
            for _t in range(20):
                a, d = rnd.uniform(0, 2 * math.pi), 140 * math.sqrt(rnd.random())
                x, y = cx + d * math.cos(a), cy + d * math.sin(a)
                c, r = (x - g.x0) / g.dx, (g.y1 - y) / g.dy
                ii, jj = int(round(c)), int(round(r))
                if 0 <= jj < ok.shape[0] and 0 <= ii < ok.shape[1] and ok[jj, ii]:
                    breed = 2 if rnd.random() < 0.16 else (0 if rnd.random() < 0.55 else 1)
                    cows += [round(x, 1), round(y, 1), round(zat(x, y), 1), round(rnd.uniform(0, 6.28), 2), breed]
                    break
    print(f"  lifts: {len(lifts)}, railways: {len(rails_out)}, pistes: {len(pistes)}, cows: {len(cows) // 5} in {len(centers)} herds")
    return {"lifts": lifts, "rails": rails_out, "trainlines": lines_out, "pistes": pistes, "cows": cows}


def chalets(bld_out):
    """Footprints -> oriented boxes for gabled chalets: x, y, base, w, d, h, angle, seed."""
    out = []
    for b in bld_out:
        r = b["r"][0]
        pts = [(r[i], r[i + 1]) for i in range(0, len(r), 2)]
        if len(pts) < 3:
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty:
            continue
        rect = list(poly.minimum_rotated_rectangle.exterior.coords)
        e1 = (rect[1][0] - rect[0][0], rect[1][1] - rect[0][1])
        e2 = (rect[2][0] - rect[1][0], rect[2][1] - rect[1][1])
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        long_e = e1 if l1 >= l2 else e2
        w, d = max(l1, l2), min(l1, l2)
        ang = math.atan2(long_e[1], long_e[0])
        c = poly.centroid
        base = b["m"] + 2
        h = max(4.0, b["h"] - base)
        out += [round(c.x, 1), round(c.y, 1), round(base, 1), round(w, 1), round(d, 1), round(h, 1), round(ang, 3), b["s"]]
    return out
