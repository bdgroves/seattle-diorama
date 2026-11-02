"""Where the sky is, from the terrain itself: project every DEM cell through the same camera
the forge3d viewer uses and keep, for each image column, the highest row any terrain reaches.
Colour alone can't tell forge3d's pale horizon from sunlit summit snow; geometry can."""
from __future__ import annotations

import math

import numpy as np

import config

_cache = {}


def _points(dem, step):
    key = (id(dem), step)
    if key not in _cache:
        z = dem[::step, ::step].astype(np.float64)
        rows, cols = np.mgrid[0:z.shape[0], 0:z.shape[1]]
        x = config.LEFT + (cols * step + 0.5) * config.DEM_RES
        y = config.TOP - (rows * step + 0.5) * config.DEM_RES
        _cache[key] = (x.ravel(), y.ravel(), z.ravel())
    return _cache[key]


def skyline(dem, eye, aim, fov_deg, w, h, step=1):
    """Row of the topmost terrain pixel in each column (h where no terrain reaches)."""
    x, y, z = _points(dem, step)
    E = np.array([eye[0], eye[2], -eye[1]])
    A = np.array([aim[0], aim[2], -aim[1]])
    P = np.stack([x, z, -y], axis=1)
    f = A - E
    f /= np.linalg.norm(f)
    r = np.cross(f, [0.0, 1.0, 0.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    d = P - E
    dz = d @ f
    ok = dz > 50.0
    d, dz = d[ok], dz[ok]
    t = math.tan(math.radians(fov_deg) / 2)
    foc = (h / 2) / t                                  # vertical field of view
    col = w / 2 + (d @ r) / dz * foc
    row = h / 2 - (d @ u) / dz * foc
    half = (config.DEM_RES * step) / dz * foc * 0.75   # each cell's width on screen
    inb = (col > -half - 1) & (col < w + half + 1)
    col, row, half = col[inb], row[inb], half[inb]
    top = np.full(w, float(h))
    hw = np.minimum(np.ceil(half).astype(int), 96)
    c0 = np.round(col).astype(int)
    for k in np.unique(hw):
        sel = hw == k
        cc, rr = c0[sel], row[sel]
        for o in range(-k, k + 1):
            c = cc + o
            m = (c >= 0) & (c < w)
            np.minimum.at(top, c[m], rr[m])
    return np.clip(top, 0, h)


def mask(img, top, tol=4):
    """Sky above the projected skyline; within a few pixels of it, trust colour: a pixel
    matching the sky just above belongs to the sky."""
    h, w = img.shape[:2]
    rows = np.arange(h)[:, None]
    sky = rows < (top[None, :] - tol)
    f = img.astype(np.float32)
    ref_row = np.clip(top - tol - 2, 0, h - 1).astype(int)
    ref = f[ref_row, np.arange(w)]                     # the sky colour just above, per column
    band = (rows >= top[None, :] - tol) & (rows <= top[None, :] + tol)
    near = np.abs(f - ref[None, :, :]).max(axis=2) < 7
    sky |= band & near
    return sky
