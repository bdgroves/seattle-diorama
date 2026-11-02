"""The flight: where the camera is and what it looks at, every frame.

The path is a handful of keyframes (a time, an eye point and an aim point, each
as latitude, longitude and altitude in metres). The eye follows a smooth spline
through its points at a speed that changes smoothly between keyframes; the aim
glides between its points the same way. Nothing here needs the viewer, so

    pixi run path

draws the flight over the terrain (out/flight_map.png) and prints the speed and
the height above the ground along the way.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import ndimage
from scipy.interpolate import PchipInterpolator

import config

LANDMARK = (-50.9420, -72.9850, 2400)      # the Torres, for the map

# (eye (lat, lon, alt m), aim (lat, lon, alt m), speed through this point m/s, lens fov deg, note)
# Times come from the speeds: each stretch takes its length / the average of its two speeds.
# The sun is fixed just after sunrise, low in the east-south-east, so the flight runs west
# to east and ends looking west at the Torres with the sun behind the camera.
KEYS = [
    # 1. The south end of Lago Grey, looking up the lake to the ice front.
    ((-51.1150, -73.1350, 650), (-51.0050, -73.2150, 300), 230, 42, "Lago Grey"),
    # 2. Low up the lake, over the icebergs, to the Grey Glacier.
    ((-51.0600, -73.1750, 700), (-51.0000, -73.2250, 250), 480, 44, "icebergs"),
    ((-51.0250, -73.1950, 780), (-50.9850, -73.2350, 320), 320, 42, "Grey Glacier"),
    # 3. Turning east, past Paine Grande's west side.
    ((-51.0200, -73.1500, 1500), (-50.9989, -73.0953, 2500), 620, 46, "Paine Grande"),
    # 4. Over Lago Pehoé to the Cuernos: the postcard view.
    ((-51.0650, -73.0900, 1300), (-50.9850, -73.0250, 2000), 800, 46, "Lago Pehoé"),
    ((-51.0500, -73.0400, 1100), (-50.9850, -73.0150, 1900), 460, 44, "the Cuernos"),
    # 5. Up the Valle del Francés, between Paine Grande and the Cuernos.
    ((-51.0050, -73.0450, 1300), (-50.9600, -73.0500, 1500), 520, 48, "Valle del Francés"),
    ((-50.9700, -73.0480, 1700), (-50.9500, -73.0500, 2000), 300, 46, "Mirador Británico"),
    # 6. Climbing east over the Cuernos, past the Torres at their own height.
    ((-50.9750, -73.0000, 2700), (-50.9440, -72.9850, 2200), 820, 48, "over the Cuernos"),
    ((-50.9600, -72.9500, 2100), (-50.9430, -72.9850, 2100), 450, 44, "the Torres"),
    # 7. Swinging south over the steppe to finish on the whole massif across Lago
    #    Nordenskjöld, the classic view, with the sun behind the camera.
    ((-51.0000, -72.9050, 1700), (-50.9750, -73.0000, 1700), 950, 46, "Ascencio, swinging south"),
    ((-51.0500, -72.8900, 1200), (-50.9800, -73.0100, 1500), 0, 44, "the massif over Lago Nordenskjöld"),
]
HOLD_S = 5.0
FPS = 30
MIN_CLEARANCE = 200.0          # metres above the highest ground within LOOK_RADIUS of the eye
LOOK_RADIUS = 300.0
FOV = 50.0


def to_utm(lat, lon):
    from rasterio.warp import transform
    xs, ys = transform("EPSG:4326", config.CRS, list(np.atleast_1d(lon)), list(np.atleast_1d(lat)))
    return np.array(xs), np.array(ys)


def catmull_rom(points: np.ndarray, samples: int = 400) -> np.ndarray:
    """Uniform Catmull-Rom through the points; `samples` per segment, keyframe k at index k*samples."""
    p = np.vstack([points[0], points, points[-1]])
    t = np.linspace(0.0, 1.0, samples, endpoint=False)[:, None]
    seg = [0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
           for p0, p1, p2, p3 in zip(p[:-3], p[1:-2], p[2:-1], p[3:])]
    return np.vstack(seg + [points[-1:]])


@dataclass
class Flight:
    t: np.ndarray        # seconds, per frame
    eye: np.ndarray      # (n, 3) easting, northing, altitude
    aim: np.ndarray      # (n, 3)
    fov: np.ndarray      # lens, degrees
    clearance: np.ndarray
    speed: np.ndarray    # m/s along the path
    lifted: float        # most the clearance check had to raise the path, metres
    key_t: np.ndarray    # when the camera passes each keyframe, seconds


def ground_max(dem: np.ndarray) -> np.ndarray:
    k = max(1, int(round(LOOK_RADIUS / config.DEM_RES)))
    return ndimage.maximum_filter(dem, size=2 * k + 1)


def sample(grid: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    col = (x - config.LEFT) / config.DEM_RES - 0.5
    row = (config.TOP - y) / config.DEM_RES - 0.5
    return ndimage.map_coordinates(grid, [row, col], order=1, mode="nearest")


def key_times(s_k: np.ndarray) -> np.ndarray:
    v = np.array([k[2] for k in KEYS], dtype=float)
    seg = np.diff(s_k) / np.maximum((v[:-1] + v[1:]) / 2, 20.0)
    return np.concatenate([[0.0], np.cumsum(seg)])


def plan(dem: np.ndarray | None = None, fps: int = FPS) -> Flight:
    ex, ey = to_utm([k[0][0] for k in KEYS], [k[0][1] for k in KEYS])
    ax, ay = to_utm([k[1][0] for k in KEYS], [k[1][1] for k in KEYS])
    eye_k = np.column_stack([ex, ey, [k[0][2] for k in KEYS]])
    aim_k = np.column_stack([ax, ay, [k[1][2] for k in KEYS]])

    samples = 400
    dense = catmull_rom(eye_k, samples)
    arc = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))])
    s_k = arc[np.arange(len(KEYS)) * samples]
    times = key_times(s_k)
    # the hold: one more key at the same place, HOLD_S later
    times = np.append(times, times[-1] + HOLD_S)
    s_k = np.append(s_k, s_k[-1])
    aim_k = np.vstack([aim_k, aim_k[-1]])
    fov_k = np.array([k[3] for k in KEYS] + [KEYS[-1][3]], dtype=float)
    s_of_t = PchipInterpolator(times, s_k)            # smooth, never runs backwards

    n = int(round(times[-1] * fps)) + 1
    t = np.arange(n) / fps
    s = s_of_t(t)
    eye = np.column_stack([np.interp(s, arc, dense[:, j]) for j in range(3)])
    # where the path has a repeated point (a hold), arc length stalls: hold the eye there
    aim = np.column_stack([PchipInterpolator(times, aim_k[:, j])(t) for j in range(3)])
    fov = PchipInterpolator(times, fov_k)(t)
    speed = np.abs(s_of_t(t, 1))

    lifted = 0.0
    clear = np.full(n, np.nan)
    if dem is not None:
        top = sample(ground_max(dem), eye[:, 0], eye[:, 1])
        need = np.maximum(0.0, top + MIN_CLEARANCE - eye[:, 2])
        if need.max() > 0:
            # raise smoothly: spread each lift over a couple of seconds either side
            lift = ndimage.maximum_filter1d(need, size=2 * fps + 1)
            lift = ndimage.gaussian_filter1d(lift, fps * 0.8)
            lift = np.maximum(lift, need)
            eye[:, 2] += lift
            lifted = float(lift.max())
        clear = eye[:, 2] - sample(dem, eye[:, 0], eye[:, 1])
    return Flight(t, eye, aim, fov, clear, speed, lifted, times)


def camera(eye: np.ndarray, aim: np.ndarray, min_h: float, fov: float = FOV) -> dict:
    """The viewer's orbit camera (target, distance, angles) for an eye looking at an aim point.
    Viewer world: x = easting, y = height above the DEM minimum, z = -northing."""
    def world(p):
        return np.array([p[0], p[2] - min_h, -p[1]])
    e, a = world(eye), world(aim)
    off = e - a
    r = float(np.linalg.norm(off))
    return {"cmd": "set_terrain_camera", "phi_deg": math.degrees(math.atan2(off[2], off[0])),
            "theta_deg": math.degrees(math.acos(np.clip(off[1] / r, -1, 1))), "radius": r,
            "fov_deg": fov, "target": [float(v) for v in a]}


def report(f: Flight) -> None:
    print(f"{len(f.t)} frames, {f.t[-1]:.0f} s at {FPS} fps")
    for t0, k in zip(f.key_t, KEYS):
        i = min(int(round(t0 * FPS)), len(f.t) - 1)
        c = f"{f.clearance[i]:5.0f} m up" if np.isfinite(f.clearance[i]) else ""
        print(f"  {t0:5.1f} s  {k[4]:<22} {f.speed[i]:5.0f} m/s  lens {f.fov[i]:3.0f}  {c}")
    if np.isfinite(f.clearance).any():
        i = int(np.nanargmin(f.clearance))
        print(f"  lowest: {f.clearance[i]:.0f} m above the ground at {f.t[i]:.1f} s; "
              f"path raised by up to {f.lifted:.0f} m to clear the terrain")


def draw_map(f: Flight, dem: np.ndarray, path) -> None:
    """Hillshade with the flight drawn on: eye track coloured by time, aim lines every 2 s."""
    from PIL import Image, ImageDraw
    step = 4
    z = dem[::step, ::step].astype(np.float64)
    gy, gx = np.gradient(z, config.DEM_RES * step)
    az, el = np.radians(315), np.radians(40)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    shade = np.sin(el) * np.cos(slope) + np.cos(el) * np.sin(slope) * np.cos(az - aspect)
    zn = (z - z.min()) / (z.max() - z.min())
    base = np.clip(0.25 + 0.6 * shade, 0, 1)[..., None] * (0.55 + 0.45 * zn[..., None]) * np.array([235, 230, 220])
    img = Image.fromarray(base.astype(np.uint8)).convert("RGB")
    d = ImageDraw.Draw(img)

    def px(x, y):
        return ((x - config.LEFT) / (config.DEM_RES * step), (config.TOP - y) / (config.DEM_RES * step))

    n = len(f.t)
    for i in range(0, n, max(1, FPS * 2)):
        d.line([px(*f.eye[i, :2]), px(*f.aim[i, :2])], fill=(255, 255, 255), width=1)
    for i in range(n - 1):
        u = i / max(n - 1, 1)
        col = (int(255 * u), int(80 + 100 * (1 - u)), int(255 * (1 - u)))
        d.line([px(*f.eye[i, :2]), px(*f.eye[i + 1, :2])], fill=col, width=3)
    for t0, k in zip(f.key_t, KEYS):
        note = k[4]
        i = min(int(round(t0 * FPS)), n - 1)
        x, y = px(*f.eye[i, :2])
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 255, 0))
        d.text((x + 6, y - 6), f"{t0:g}s {note}", fill=(255, 255, 0))
    hx, hy = to_utm(LANDMARK[0], LANDMARK[1])
    x, y = px(hx[0], hy[0])
    d.text((x - 20, y + 6), "Torres", fill=(255, 120, 200))
    img.save(path)
    print(f"wrote {path}")


def main() -> int:
    import rasterio
    dem = None
    if config.DEM.exists():
        with rasterio.open(config.DEM) as src:
            dem = src.read(1)
    f = plan(dem)
    report(f)
    if dem is not None:
        config.OUT.mkdir(parents=True, exist_ok=True)
        draw_map(f, dem, config.OUT / "flight_map.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
