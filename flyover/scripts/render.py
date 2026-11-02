"""Step 3: fly the camera over Torres del Paine, and write the MP4.

    python render.py --preview                 # every 3rd frame at 640x360 -> out/preview.mp4
    python render.py --stills 0,20,40,60,94    # a few full-size frames -> out/stills/
    python render.py                           # the whole flight, 1920x1080 at 30 fps
    python render.py --frames-dir out/frames --chunk 3 --chunks 30   # one piece, as JPEGs
    python render.py --encode out/frames       # the pieces -> out/torres_del_paine_flyover.mp4

Terrain: Copernicus 30 m DEM at 20 m. Imagery: Sentinel-2 at 10 m. The sun is placed
just after a February sunrise; each frame gets a painted dawn sky, a warm grade and
distance haze, and the flight's opening and closing titles.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

import forge3d as f3d

import config
import flight

# Dawn sky, zenith to horizon, and a faint warm haze toward the horizon.
ZENITH = np.array([0.18, 0.30, 0.56])
HORIZON = np.array([0.98, 0.78, 0.66])
WARM = np.array([0.06, 0.015, -0.05])       # golden-hour highlights...
COOL = np.array([-0.06, 0.0, 0.07])        # ...and blue shadows
CONTRAST = 1.10
HAZE_MAX = 0.16
SATURATE = 1.25                          # the satellite colours need a lift after lighting
# Terrain shadows come from sun_visibility (traced through the heightfield), not a shadow
# map: over a 100 km scene the shadow map's texels are tens of metres and leave blocky
# grey patches on flat ground like the lakes.
PBR = {"enabled": True, "exposure": 0.9, "msaa": 8, "shadow_technique": "none",
       "height_ao": {"enabled": True, "strength": 0.7, "max_distance": 1500.0},
       "sun_visibility": {"enabled": True, "mode": "soft", "max_distance": 20000.0}}
LITE = {"msaa": 4}
PRESERVE_COLORS = False     # forge3d's colour-preserving overlay mode crushes shadows to black
# forge3d's physical sky with aerial perspective (distant walls fade into the air), and a
# thin layer of valley haze that catches the low sun as light shafts.
SKY = {"enabled": True, "turbidity": 3.2, "ground_albedo": 0.25, "sun_intensity": 0.55,
       "aerial_perspective": True, "sky_exposure": 0.65}
HAZE = {"enabled": True, "mode": "height", "density": 0.004, "height_falloff": 0.12, "scattering": 0.55,
        "absorption": 0.15, "light_shafts": True, "shaft_intensity": 0.30, "steps": 32, "half_res": False}
# A gentle sun and a strong sky light. forge3d's sun adds a specular sheen that doesn't depend
# on the ground's colour, so at full strength it turns dark forest and deep lakes pale grey
# wherever the ground faces the light; the sky light only scales the imagery's own colours.
SUN_INTENSITY = 0.4
TERRAIN = {"zscale": 1.0, "ambient": 0.5}


class _Tee:
    """Wraps the viewer's stdout so everything it prints also lands in out/viewer.log."""

    def __init__(self, stream, log):
        self._s, self._log = stream, log

    def _keep(self, line):
        if line:
            self._log.write(line)
            self._log.flush()
        return line

    def readline(self, *a):
        return self._keep(self._s.readline(*a))

    def read(self, *a):
        return self._keep(self._s.read(*a))

    def __iter__(self):
        for line in self._s:
            yield self._keep(line)

    def __getattr__(self, name):
        return getattr(self._s, name)


def open_viewer(log_path, **kw):
    """open_viewer_async, with the viewer's own messages saved to a log file."""
    import forge3d.viewer as fv
    log = open(log_path, "w", encoding="utf-8", errors="replace")
    real_popen = fv.subprocess.Popen

    def popen(*a, **k):
        proc = real_popen(*a, **k)
        if proc.stdout is not None:
            proc.stdout = _Tee(proc.stdout, log)
        return proc

    fv.subprocess.Popen = popen
    try:
        return f3d.open_viewer_async(timeout=180.0, **kw)
    finally:
        fv.subprocess.Popen = real_popen


def sky_mask(img: np.ndarray) -> np.ndarray:
    """The viewer's background: a smooth, near-white, grey gradient joined to the top edge."""
    from scipy import ndimage
    lo, hi = img.min(axis=2), img.max(axis=2)
    lum = img.mean(axis=2).astype(np.float32)
    smooth = np.abs(lum - ndimage.uniform_filter(lum, 3)) < 1.5
    cand = (lo >= 228) & (hi - lo <= 10) & smooth
    lab, n = ndimage.label(cand)
    top = np.unique(lab[0][lab[0] > 0])
    sky = np.isin(lab, top)
    # close pinholes left by the smoothness test
    return ndimage.binary_closing(sky, iterations=2) | sky


def finish(png: Path) -> np.ndarray:
    """Evening look: a painted sky behind the terrain, warm highlights and cool shadows on the
    land, and haze thickening toward the skyline (distant ridges sit near it)."""
    img = np.asarray(Image.open(png).convert("RGB")).astype(np.int16)
    sky = sky_mask(img)
    h = img.shape[0]
    # skyline: the typical height where the sky ends, never so high it squashes the gradient
    first_land = np.argmin(sky, axis=0)
    first_land[sky.all(axis=0)] = h
    horizon = int(np.clip(np.median(first_land), 0.30 * h, h))
    x = img.astype(np.float64) / 255.0

    lum = x @ np.array([0.2126, 0.7152, 0.0722])
    hi = np.clip((lum - 0.2) / 0.6, 0, 1)[..., None]
    hi = hi * hi * (3 - 2 * hi)
    x = x * (1 + hi * WARM) * (1 + (1 - hi) * COOL)
    x = np.clip((x - 0.5) * CONTRAST + 0.5, 0, 1)
    gray = (x @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    x = np.clip(gray + (x - gray) * SATURATE, 0, 1)
    # haze: strongest just under the skyline, gone ~40% of the frame further down
    d = np.clip((np.arange(h) - horizon) / (0.25 * h), 0, 1)[:, None, None]
    x = x * (1 - HAZE_MAX * (1 - d) ** 2) + HORIZON * HAZE_MAX * (1 - d) ** 2

    t = np.clip(np.arange(h) / max(horizon, 1), 0.0, 1.0)[:, None] ** 1.5
    paint = ZENITH * (1 - t) + HORIZON * t
    x[sky] = np.broadcast_to(paint[:, None, :], x.shape)[sky]
    # soften the skyline edge by a pixel
    a = sky.astype(np.float64)
    from scipy.ndimage import gaussian_filter
    a = gaussian_filter(a, 0.8)[..., None]
    sky_img = np.broadcast_to(paint[:, None, :], x.shape)
    x = x * (1 - a) + sky_img * a
    return np.clip(x * 255.0 + 0.5, 0, 255).astype(np.uint8)


FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
TITLES = [  # (start s, end s, big line, small line)
    (0.6, 6.0, "Torres del Paine", "Patagonia, Chile · a flight at sunrise"),
    (-6.5, -0.4, "Grey Glacier to the Torres", "Copernicus DEM · Sentinel-2 · forge3d · brooksgroves.com"),
]


def titles(rgb: np.ndarray, t: float, total: float) -> np.ndarray:
    """Fade the opening and closing titles in and out, lower left, with a soft shadow."""
    from PIL import ImageDraw, ImageFilter, ImageFont
    for t0, t1, big, small in TITLES:
        a0, a1 = (t0 if t0 >= 0 else total + t0), (t1 if t1 >= 0 else total + t1)
        if not a0 <= t <= a1:
            continue
        k = min(1.0, (t - a0) / 0.8, (a1 - t) / 0.8)
        h, w = rgb.shape[:2]
        S = h / 1080
        layer = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(layer)
        fb, fs = ImageFont.truetype(FONT_B, int(64 * S)), ImageFont.truetype(FONT, int(28 * S))
        x, y = int(70 * S), int(h - 190 * S)
        d.text((x, y), big, font=fb, fill=255)
        d.text((x + 2, y + int(84 * S)), small, font=fs, fill=230)
        shadow = np.asarray(layer.filter(ImageFilter.GaussianBlur(6 * S)), np.float32)[..., None] / 255 * 0.55 * k
        text = np.asarray(layer, np.float32)[..., None] / 255 * k
        out = rgb.astype(np.float32) * (1 - shadow)
        out = out * (1 - text) + 252 * text
        rgb = np.clip(out, 0, 255).astype(np.uint8)
    return rgb


def encode(frames: Path, out: Path, fps: int) -> int:
    ffmpeg = shutil.which("ffmpeg")
    n = len(list(frames.glob("frame_*.jpg")))
    print(f"encoding {n} frames from {frames}")
    r = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", str(fps), "-i", str(frames / "frame_%05d.jpg"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                        "-vf", "scale=out_color_matrix=bt709", "-colorspace", "bt709", "-color_primaries", "bt709",
                        "-color_trc", "bt709", "-movflags", "+faststart", str(out)])
    if r.returncode == 0:
        print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
    return r.returncode


def uv(left, top, right, bottom):
    W, H = config.RIGHT - config.LEFT, config.TOP - config.BOTTOM
    return ((left - config.LEFT) / W, (config.TOP - top) / H, (right - config.LEFT) / W, (config.TOP - bottom) / H)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--preview", action="store_true", help="640x360, every 3rd frame, quick")
    ap.add_argument("--stills", type=str, default=None, help="comma-separated seconds, e.g. 0,9,20,41,64")
    ap.add_argument("--size", type=str, default="1920x1080")
    ap.add_argument("--fps", type=int, default=flight.FPS)
    ap.add_argument("--lite", action="store_true", help="lighter antialiasing")
    ap.add_argument("--forge-sky", action="store_true", help="forge3d's physical sky instead of the painted one")
    ap.add_argument("--haze", action="store_true",
                    help="forge3d's volumetric haze (needs --forge-sky: it tints the background, so the sky can't be painted)")
    ap.add_argument("--out", type=str, default=None)
    ap.add_argument("--frames-dir", type=str, default=None, help="write frames as JPEGs here instead of an MP4")
    ap.add_argument("--chunk", type=int, default=0)
    ap.add_argument("--chunks", type=int, default=1)
    ap.add_argument("--encode", type=str, default=None, help="encode a folder of frames into the MP4")
    args = ap.parse_args()
    if args.encode:
        config.OUT.mkdir(parents=True, exist_ok=True)
        return encode(Path(args.encode), Path(args.out) if args.out else config.VIDEO, args.fps)

    for p in (config.DEM, *(config.graded(t[0]) for t in config.image_tiles())):
        if not p.exists():
            print(f"Missing {p.name}. Run: pixi run data, then pixi run prep")
            return 1
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None and not args.stills:
        print("ffmpeg must be on PATH")
        return 1

    with rasterio.open(config.DEM) as src:
        dem = src.read(1)
    min_h = float(dem.min())
    path = flight.plan(dem, args.fps)
    flight.report(path)

    w, h = (640, 360) if args.preview else map(int, args.size.lower().split("x"))
    frames_dir = Path(args.frames_dir) if args.frames_dir else None
    if args.stills:
        frames = [min(int(round(float(s) * args.fps)), len(path.t) - 1) for s in args.stills.split(",")]
    elif frames_dir:
        N = len(path.t)
        lo, hi = N * args.chunk // args.chunks, N * (args.chunk + 1) // args.chunks
        frames_dir.mkdir(parents=True, exist_ok=True)
        frames = [i for i in range(lo, hi) if not (frames_dir / f"frame_{i:05d}.jpg").exists()]
        print(f"chunk {args.chunk + 1}/{args.chunks}: frames {lo}-{hi - 1}, {len(frames)} to render")
        if not frames:
            return 0
    elif args.preview:
        frames = list(range(0, len(path.t), 3))
    else:
        frames = list(range(len(path.t)))
    out_fps = args.fps / 3 if args.preview else args.fps
    config.OUT.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else (config.OUT / "preview.mp4" if args.preview else config.VIDEO)
    stills_dir = config.OUT / "stills"
    if args.stills:
        stills_dir.mkdir(parents=True, exist_ok=True)

    encoder = None
    partial = out.with_suffix(".part.mp4")
    if not args.stills and not frames_dir:
        encoder = subprocess.Popen(
            [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}",
             "-framerate", f"{out_fps:g}", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
             "-pix_fmt", "yuv420p", "-vf", "scale=out_color_matrix=bt709", "-colorspace", "bt709",
             "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-f", "mp4",
             str(partial)], stdin=subprocess.PIPE)

    sun = f3d.sun_position_utc(*config.SUN_LATLON, *config.SUN_UTC)
    print(f"Sun: azimuth {sun.azimuth:.0f} deg, {sun.elevation:.0f} deg up")
    pbr = dict(PBR, **LITE) if (args.lite or args.preview) else dict(PBR)
    if args.forge_sky:
        pbr["sky"] = SKY
    if args.haze:
        pbr["volumetrics"] = HAZE
    snapshot = config.OUT / "_frame.png"
    start = time.perf_counter()
    viewer = open_viewer(config.OUT / "viewer.log", width=w, height=h, terrain_path=str(config.DEM),
                         fov_deg=flight.FOV, title="Torres del Paine")
    try:
        for k, (p, l, t, r, b) in enumerate(config.image_tiles()):
            viewer.load_overlay(f"sentinel2_{k}", config.graded(p), extent=uv(l, t, r, b), z_order=k,
                                preserve_colors=PRESERVE_COLORS)
        viewer.send_ipc({"cmd": "set_terrain_sun", "azimuth_deg": float(sun.azimuth),
                         "elevation_deg": float(sun.elevation), "intensity": SUN_INTENSITY})
        viewer.send_ipc({"cmd": "set_terrain_pbr", **pbr})
        viewer.send_ipc({"cmd": "set_terrain", **TERRAIN})
        viewer.send_ipc(flight.camera(path.eye[frames[0]], path.aim[frames[0]], min_h, path.fov[frames[0]]))
        time.sleep(2.0)
        for n, i in enumerate(frames):
            viewer.send_ipc(flight.camera(path.eye[i], path.aim[i], min_h, float(path.fov[i])))
            viewer.snapshot(snapshot, w, h)
            rgb = np.asarray(Image.open(snapshot).convert("RGB")) if args.forge_sky else finish(snapshot)
            rgb = titles(rgb, float(path.t[i]), float(path.t[-1]))
            if frames_dir:
                Image.fromarray(rgb).save(frames_dir / f"frame_{i:05d}.jpg", quality=93)
            elif args.stills:
                Image.fromarray(rgb).save(stills_dir / f"still_{path.t[i]:05.1f}s.png")
            else:
                encoder.stdin.write(rgb.tobytes())
            if n % 30 == 0 or args.stills:
                el = time.perf_counter() - start
                print(f"  frame {n + 1}/{len(frames)}  ({path.t[i]:.1f} s)  "
                      f"~{el / (n + 1) * (len(frames) - n - 1) / 60:.0f} min left", end="\r")
        print()
    finally:
        viewer.close()
        snapshot.unlink(missing_ok=True)
        if encoder is not None:
            encoder.stdin.close()
    if encoder is not None:
        if encoder.wait() != 0:
            print("ffmpeg failed")
            return 1
        partial.replace(out)
        print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB) in {(time.perf_counter() - start) / 60:.0f} min")
    elif frames_dir:
        print(f"wrote {len(frames)} frames to {frames_dir}")
    else:
        print(f"wrote {len(frames)} stills to {stills_dir}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (TimeoutError, f3d.viewer.ViewerError) as err:
        log = config.OUT / "viewer.log"
        print(f"\nThe viewer stopped answering ({err}).")
        if log.exists():
            lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
            print("\n".join("  " + s for s in lines[-25:]))
        print("Try again with --lite, and send the log above if it still stalls.")
        sys.exit(1)
