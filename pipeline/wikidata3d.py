"""Find real 3D models of the landmarks in each diorama, via Wikidata.

Many OpenStreetMap features carry a `wikidata=Q...` tag. Wikidata's
"3D model" property (P4896) points at an STL file on Wikimedia Commons. This
script collects every wikidata tag in the raw OSM for each place, asks
Wikidata which of them have a 3D model, and downloads those STL files along
with their license and author from Commons.

Output
  web/public/data/models/<name>.stl     the models the viewer loads
  data/raw/models.json                  per place: which features got a model
                                        (OSM id, footprint, license...), read by
                                        build.py and terrain.py
  data/raw/models-report.txt            what was checked and what was found

Usage:  pixi run models          (after `pixi run fetch` and `pixi run sierra-fetch`)
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data" / "models"
UA = "seattle-diorama/0.1 (https://github.com/bdgroves/seattle-diorama; diorama landmarks)"
MAX_BYTES = 30_000_000          # skip anything huge; the browser has to load it

S = requests.Session()
S.headers["User-Agent"] = UA


def places():
    out = {}
    if (RAW / "osm.json").exists():
        out["seattle"] = RAW / "osm.json"
    for p in sorted(RAW.glob("*_osm.json")):
        out[p.name[: -len("_osm.json")]] = p
    return out


def footprint(el):
    """Outer ring as [[lat, lon], ...] for ways (and the largest outer of relations)."""
    if el["type"] == "way" and el.get("geometry"):
        return [[p["lat"], p["lon"]] for p in el["geometry"] if p]
    if el["type"] == "relation":
        best = []
        for m in el.get("members", []):
            if m.get("role") == "outer" and m.get("geometry") and len(m["geometry"]) > len(best):
                best = m["geometry"]
        return [[p["lat"], p["lon"]] for p in best if p]
    return []


def get(url, **params):
    for attempt in range(4):
        try:
            r = S.get(url, params=params, timeout=60)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r
        except requests.RequestException as exc:
            if attempt == 3:
                raise
            print(f"  retry ({exc})")
            time.sleep(3 * (attempt + 1))


def models_for(qids):
    """{qid: (label, [commons file names])} for items with P4896."""
    found = {}
    qids = sorted(qids)
    for i in range(0, len(qids), 50):
        batch = qids[i : i + 50]
        r = get("https://www.wikidata.org/w/api.php", action="wbgetentities", ids="|".join(batch),
                props="claims|labels", languages="en|it", format="json")
        for qid, ent in r.json().get("entities", {}).items():
            files = []
            for c in ent.get("claims", {}).get("P4896", []):
                v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(v, str):
                    files.append(v)
            if files:
                lab = ent.get("labels", {})
                label = (lab.get("en") or lab.get("it") or {}).get("value", qid)
                found[qid] = (label, files)
        time.sleep(0.5)
    return found


def commons_info(name):
    r = get("https://commons.wikimedia.org/w/api.php", action="query", titles=f"File:{name}",
            prop="imageinfo", iiprop="url|size|extmetadata|mime", format="json")
    page = next(iter(r.json()["query"]["pages"].values()))
    ii = (page.get("imageinfo") or [{}])[0]
    meta = ii.get("extmetadata", {})
    clean = lambda s: re.sub(r"<[^>]+>", "", s or "").strip()
    return {
        "url": ii.get("url"),
        "size": ii.get("size", 0),
        "page": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{name.replace(' ', '_')}",
        "license": clean(meta.get("LicenseShortName", {}).get("value")) or "see Commons",
        "artist": clean(meta.get("Artist", {}).get("value"))[:120] or "Wikimedia Commons contributor",
        "description": clean(meta.get("ImageDescription", {}).get("value"))[:200],
    }


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    per_place, all_q = {}, set()
    for pid, path in places().items():
        els = json.loads(path.read_text(encoding="utf-8"))["elements"]
        feats = []
        for el in els:
            q = el.get("tags", {}).get("wikidata", "")
            if re.fullmatch(r"Q\d+", q):
                feats.append(el)
                all_q.add(q)
        per_place[pid] = feats
        print(f"[{pid}] {len(feats)} OSM features with a wikidata tag")
    print(f"asking Wikidata about {len(all_q)} items ...")
    try:
        hits = models_for(all_q)
    except Exception as exc:  # noqa: BLE001 - never break the build over this
        print(f"Wikidata lookup failed ({exc}); no models this run")
        hits = {}
    print(f"{len(hits)} have a 3D model on Commons")

    files = {}
    for qid, (label, names) in sorted(hits.items()):
        name = names[0]
        try:
            info = commons_info(name)
        except Exception as exc:  # noqa: BLE001
            print(f"  {qid} {label}: Commons lookup failed ({exc})")
            continue
        if not info["url"] or info["size"] > MAX_BYTES:
            print(f"  {qid} {label}: skipped ({info['size'] / 1e6:.1f} MB)")
            continue
        fn = f"{qid}-{slug(label)}.stl"
        dest = OUT / fn
        if not dest.exists() or dest.stat().st_size != info["size"]:
            dest.write_bytes(get(info["url"]).content)
        files[qid] = {"file": f"models/{fn}", "label": label, "commons": name, **info}
        print(f"  {qid} {label}: {name} ({info['size'] / 1e6:.1f} MB, {info['license']})")

    manifest, report = {}, []
    for pid, feats in per_place.items():
        rows = []
        for el in feats:
            t = el["tags"]
            q = t["wikidata"]
            report.append(f"{pid}\t{q}\t{el['type']}/{el['id']}\t{t.get('name', '')}\t{'MODEL' if q in files else ''}")
            if q not in files:
                continue
            ring = footprint(el)
            lat = el.get("lat") or (sum(p[0] for p in ring) / len(ring) if ring else None)
            lon = el.get("lon") or (sum(p[1] for p in ring) / len(ring) if ring else None)
            if lat is None:
                continue
            rows.append({"qid": q, "key": f"{el['type']}{el['id']}", "osm": f"{el['type']}/{el['id']}",
                         "name": t.get("name", files[q]["label"]), "lat": lat, "lon": lon, "ring": ring,
                         "height": t.get("height"), **files[q]})
        manifest[pid] = rows
        print(f"[{pid}] {len(rows)} feature(s) get a real model")
    (RAW / "models.json").write_text(json.dumps(manifest, indent=1))
    (RAW / "models-report.txt").write_text("place\tqid\tosm\tname\tmodel\n" + "\n".join(report) + "\n")


if __name__ == "__main__":
    sys.exit(main())
