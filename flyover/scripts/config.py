"""Shared settings for the Torres del Paine flyover (forge3d).

Adapted from the Icefields Parkway flyover (github.com/bdgroves/icefields-flyover).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
OUT = ROOT / "out"

CRS = "EPSG:32718"             # WGS 84 / UTM zone 18S, metres (Sentinel-2's own grid here)

# Lago Grey and the edge of the Southern Patagonian Ice Field in the west to Laguna Amarga
# in the east; Lago Pehoé and Salto Grande in the south to the north side of the Paine massif.
WEST, EAST = -73.36, -72.78
SOUTH, NORTH = -51.17, -50.84
DEM_RES = 20.0                 # metres; the source is the 30 m Copernicus DEM
IMAGE_RES = 10.0               # Sentinel-2's native 10 m
IMAGE_TILES = 2                # north/south halves keep each texture a sensible size

DEM = DATA / "paine_dem_20m.tif"
# Patagonian summer, clearest passes first. Paine is famously cloudy, so the gaps are filled
# from the next summer back, using Sentinel-2's own scene classification.
IMAGE_BEST = None
IMAGE_DATE = ("2025-12-15", "2026-03-31")
IMAGE_FALLBACK = ("2024-12-01", "2025-03-31")


def image_path(k: int) -> Path:
    return DATA / f"sentinel2_{k}.png"


def graded(path: Path) -> Path:
    return path.with_name(path.stem + "_graded.png")


# Sunrise: February 10, 2026, 7:35 am in Magallanes (UTC-3). The sun is about six degrees up
# in the east-south-east, lighting the east faces of the Torres and the Cuernos.
SUN_UTC = (2026, 2, 10, 10, 35, 0)
SUN_LATLON = (-50.95, -73.0)

VIDEO = OUT / "torres_del_paine_flyover.mp4"


def grid():
    """(left, top, width px, height px) of the DEM grid in CRS metres."""
    from rasterio.warp import transform_bounds
    l, b, r, t = transform_bounds("EPSG:4326", CRS, WEST, SOUTH, EAST, NORTH)
    left, top = round(l / 100) * 100, round(t / 100) * 100
    w, h = int((r - left) // DEM_RES), int((top - b) // DEM_RES)
    return left, top, w, h


def bounds():
    left, top, w, h = grid()
    return left, top, left + w * DEM_RES, top - h * DEM_RES


def image_tiles():
    """(path, left, top, right, bottom) for each imagery tile, north first."""
    left, top, right, bottom = bounds()
    edges = [top - (top - bottom) * k / IMAGE_TILES for k in range(IMAGE_TILES + 1)]
    edges = [round(e / IMAGE_RES) * IMAGE_RES for e in edges]
    edges[0], edges[-1] = top, bottom
    return [(image_path(k), left, edges[k], right, edges[k + 1]) for k in range(IMAGE_TILES)]


LEFT, TOP, RIGHT, BOTTOM = bounds()
