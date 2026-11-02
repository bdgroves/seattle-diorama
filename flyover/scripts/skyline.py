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
    """Row of the topmost terrain pixel in each column (h where no terrain reaches), and how
    far away that terrain is (metres along the view)."""
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
    col, row, half, dz = col[inb], row[inb], half[inb], dz[inb]
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
    dist = np.full(w, 1e9)
    for k in np.unique(hw):
        sel = hw == k
        cc, rr, dd = c0[sel], row[sel], dz[sel]
        for o in range(-k, k + 1):
            c = cc + o
            m = (c >= 0) & (c < w)
            m[m] &= rr[m] <= top[c[m]] + 1.0
            np.minimum.at(dist, c[m], dd[m])
    return np.clip(top, 0, h), dist


def mask(img, top, dist=None, tol=4):
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
    # forge3d meshes the nearest ridges a little lower than the full DEM: walk down each
    # column from the projected line while it is still smooth, bright, unbroken sky
    lum = f.mean(axis=2)
    run = np.ones(w, bool)
    cols = np.arange(w)
    start = np.clip(top.astype(int) - tol, 1, h - 1)
    base = f[start - 1, cols]                          # the sky colour where the walk begins
    # how far down to look: a long way under a ridge close by, hardly at all for distant peaks
    reach = np.full(w, 260) if dist is None else np.where(dist < 3000, 260, np.where(dist < 12000, 120, 30))
    walk = np.zeros_like(sky)
    for k in range(0, 260):
        r = start + k
        okc = run & (r < h)
        rr = np.minimum(r, h - 1)
        step = np.abs(f[rr, cols] - f[rr - 1, cols]).max(axis=1)
        drift = np.abs(f[rr, cols] - base).max(axis=1)
        cond = okc & (k < reach) & (step < 4) & (drift < 12) & (lum[rr, cols] > 200)
        walk[rr[cond], cols[cond]] = True
        run = cond
        if not run.any():
            break
    # real gaps are wide bands; a walk that slipped down one column into smooth summit snow
    # is a thin streak, and a horizontal opening removes it
    from scipy import ndimage
    walk = ndimage.binary_opening(walk, structure=np.ones((1, 15), bool))
    sky |= walk
    # and a hairline column the projection missed is filled in
    return ndimage.binary_closing(sky, structure=np.ones((1, 7), bool)) | sky
