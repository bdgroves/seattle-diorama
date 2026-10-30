"""Render the scripted fly-through to an MP4, frame by frame.

Every frame is rendered at an exact film time, so the video is perfectly
smooth no matter how slow the machine is (unlike screen recording).

Usage:  pixi run film                       1920x1080 @ 60 fps -> film/seattle-diorama.mp4
        pixi run film --res 3840x2160       4K
        pixi run film --fps 30 --seconds 10 quick test
        pixi run film --quality best        slower x264 preset, smaller file
        pixi run film --headed              visible browser window (if headless is slow / no GPU)
"""
import argparse
import base64
import functools
import http.server
import shutil
import subprocess
import sys
import threading
import time

from playwright.sync_api import sync_playwright

from config import ROOT

DIST = ROOT / "web" / "dist"
OUT_DIR = ROOT / "film"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(directory):
    handler = functools.partial(QuietHandler, directory=str(directory))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", default="1920x1080")
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--seconds", type=float, default=None, help="render only the first N seconds")
    ap.add_argument("--start", type=float, default=0.0, help="segment start (s), for rendering in parallel pieces")
    ap.add_argument("--end", type=float, default=None, help="segment end (s)")
    ap.add_argument("--quality", choices=["fast", "best"], default="fast")
    ap.add_argument("--no-tilt", action="store_true", help="turn off the miniature blur")
    ap.add_argument("--headed", action="store_true", help="show the browser window (most reliable GPU use)")
    ap.add_argument("--software-gl", action="store_true", help="force SwiftShader (no GPU)")
    ap.add_argument("--place", default="seattle", help="seattle, yosemite, tuolumne or mono")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    if not (DIST / "index.html").exists():
        sys.exit("web/dist is missing - run `pixi run bundle` first.")
    need = "scene.json" if args.place == "seattle" else f"{args.place}.json"
    if not (DIST / "data" / need).exists():
        sys.exit(f"No {need} in the bundle - run `pixi run city` / `pixi run sierra` first.")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("ffmpeg not found (it is in pixi.toml - try `pixi install`).")

    w, h = (int(v) for v in args.res.lower().split("x"))
    out = args.out or str(OUT_DIR / ("seattle-diorama.mp4" if args.place == "seattle" else f"{args.place}-diorama.mp4"))
    OUT_DIR.mkdir(exist_ok=True)
    httpd = serve(DIST)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html?film=capture&t=0.1&place={args.place}" + ("&tilt=0" if args.no_tilt else "")

    gl_args = (["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if args.software_gl
               else ["--enable-gpu", "--ignore-gpu-blocklist"])
    preset = ["-preset", "slow", "-crf", "16"] if args.quality == "best" else ["-preset", "veryfast", "-crf", "18"]
    enc = subprocess.Popen(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(args.fps), "-i", "-",
         "-c:v", "libx264", *preset, "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
        stdin=subprocess.PIPE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed, args=gl_args)
        page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        page.on("pageerror", lambda e: print("page error:", e))
        page.goto(url, wait_until="networkidle")
        page.wait_for_selector("body.booted", state="attached", timeout=120_000)
        renderer = page.evaluate("""() => {
            const gl = document.getElementById('c').getContext('webgl2');
            const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
            return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
        }""")
        print(f"GPU: {renderer}")

        duration = page.evaluate("window.__diorama.film.duration")
        if args.seconds:
            duration = min(duration, args.seconds)
        end = min(duration, args.end) if args.end is not None else duration
        dt = 1.0 / args.fps
        f0 = int(round(args.start * args.fps))
        n = int(round(end * args.fps)) - f0
        # warm-up frames so shaders compile and shadows settle
        for _ in range(3):
            page.evaluate(f"window.__diorama.film.frame(0, {dt})")
        page.evaluate(f"window.__diorama.film.seek({f0 * dt}, {dt})")
        t0 = time.time()
        for i in range(n):
            data_url = page.evaluate(f"window.__diorama.film.frame({(f0 + i) * dt}, {dt})")
            enc.stdin.write(base64.b64decode(data_url.split(",", 1)[1]))
            if i % args.fps == 0 or i == n - 1:
                el = time.time() - t0
                eta = el / (i + 1) * (n - i - 1)
                print(f"\rframe {i + 1}/{n}  ({(i + 1) / max(el, 1e-6):.1f} fps, ~{eta:.0f}s left)   ", end="", flush=True)
        print()
        browser.close()

    enc.stdin.close()
    enc.wait()
    httpd.shutdown()
    print(f"Saved {out}")


if __name__ == "__main__":
    main()
