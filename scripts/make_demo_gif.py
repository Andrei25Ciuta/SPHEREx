"""Make the README / demo GIF from the backend's cutouts (no browser needed).

    backend/.venv/Scripts/python.exe scripts/make_demo_gif.py                    # WISE 0855, D6, blink + difference
    ... scripts/make_demo_gif.py --mode blink|diff|both --det D5 --out docs/img/blink.gif
    ... scripts/make_demo_gif.py --real            # ONLY when the backend serves real SPHEREx files (drops the label)

Needs the backend running (`py -m uvicorn app:app --port 8001` in backend/) with the synthetic frames of
`backend/scripts/make_test_fits.py` in backend/data/, and Pillow (`pip install pillow`; the backend venv has it).
Frames are the backend's PNGs (one shared asinh stretch per detector). "diff" = frame minus the per-pixel median of
the frames more than 30 days away (the same rule as the app's Difference mode): orange = brighter now, blue =
fainter. Every frame carries the date, the detector and, unless --real, a visible "SYNTHETIC DATA - NOT SPHEREx".

The label is the point: the demo must never pass for real SPHEREx data. The picture committed in docs/img/ was made
from the synthetic frames; a GIF of real images is for your own pitch video, not for the repository (the licence
and terms of use of the data were not checked, see CREDITS.md).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def get(url, timeout=60):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def load_frames(api, ra, dec, fov, det):
    q = urllib.parse.urlencode(dict(ra=ra, dec=dec, fov=fov, det=det))
    frames = json.loads(get(f"{api}/api/cutouts?{q}"))["frames"]
    frames = sorted((f for f in frames if f["detector"] == det), key=lambda f: f["mjd"])
    if not frames:
        sys.exit(f"No frames for {det} at this position (is the backend running, and are there files in backend/data?).")
    out = []
    for f in frames:
        im = Image.open(io.BytesIO(get(f["imageUrl"]))).convert("L")
        out.append((f, np.asarray(im, np.float32)))
    return out


def diff_rgb(frames):
    mjd = np.array([f["mjd"] for f, _ in frames])
    stack = np.stack([a for _, a in frames])
    res = []
    for i in range(len(frames)):
        ref = np.abs(mjd - mjd[i]) > 30
        if not ref.any():
            ref = np.arange(len(frames)) != i
        d = stack[i] - np.median(stack[ref], axis=0)
        s = max(8.0, 1.4826 * np.median(np.abs(d - np.median(d))) * 3)       # robust noise scale
        v = np.clip(d / (4 * s) * 255, -255, 255)
        pos, neg = np.clip(v, 0, 255), np.clip(-v, 0, 255)
        rgb = np.full(d.shape + (3,), 12.0, np.float32)
        rgb[..., 0] += pos; rgb[..., 1] += pos * 0.55          # orange = brighter now
        rgb[..., 2] += neg; rgb[..., 1] += neg * 0.45          # blue = fainter / was here before
        res.append(np.clip(rgb, 0, 255).astype(np.uint8))
    return res


def caption(img, lines):
    d = ImageDraw.Draw(img)
    size = max(12, img.width // 36)
    try:
        font = ImageFont.truetype("arial.ttf", size)
    except OSError:
        font = ImageFont.load_default()
    step = size + 4
    h = step * len(lines) + 6
    d.rectangle([0, img.height - h, img.width, img.height], fill=(0, 0, 0))
    for k, t in enumerate(lines):
        d.text((6, img.height - h + 3 + k * step), t, fill=(255, 255, 255), font=font)
    return img


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8001")
    ap.add_argument("--ra", type=float, default=133.7951)
    ap.add_argument("--dec", type=float, default=-7.2451)
    ap.add_argument("--fov", type=float, default=5.0)
    ap.add_argument("--det", default="D6")
    ap.add_argument("--mode", choices=["blink", "diff", "both"], default="both")
    ap.add_argument("--scale", type=int, default=0, help="integer upscale (nearest neighbour); 0 = auto, ~520 px wide")
    ap.add_argument("--ms", type=int, default=600, help="milliseconds per frame")
    ap.add_argument("--loops", type=int, default=2, help="repeats of each mode inside the GIF")
    ap.add_argument("--title", default="WISE 0855")
    ap.add_argument("--real", action="store_true", help="data are real SPHEREx files (drops the SYNTHETIC label)")
    ap.add_argument("--out", default="docs/img/demo.gif")
    a = ap.parse_args()

    frames = load_frames(a.api, a.ra, a.dec, a.fov, a.det)
    n = len(frames)
    if a.scale <= 0:
        a.scale = max(2, round(520 / frames[0][1].shape[1]))
    label = None if a.real else "SYNTHETIC DATA - NOT SPHEREx"
    sequence = []
    if a.mode in ("blink", "both"):
        base = [np.repeat(arr[..., None], 3, axis=2).astype(np.uint8) for _, arr in frames]
        sequence += [("Blink", i, base[i]) for _ in range(a.loops) for i in range(n)]
    if a.mode in ("diff", "both"):
        dr = diff_rgb(frames)
        sequence += [("Difference (orange = now, blue = before)", i, dr[i]) for _ in range(a.loops) for i in range(n)]

    imgs = []
    for mode, i, arr in sequence:
        im = Image.fromarray(arr).resize((arr.shape[1] * a.scale, arr.shape[0] * a.scale), Image.NEAREST)
        f = frames[i][0]
        lines = [f"{a.title} | {mode}", f"{f['dateISO'][:10]} | {a.det} | frame {i + 1}/{n}"] + ([label] if label else [])
        imgs.append(caption(im, lines).convert("P", palette=Image.ADAPTIVE))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=a.ms, loop=0, optimize=True)
    print(f"wrote {out} ({out.stat().st_size / 1024:.0f} KB, {len(imgs)} frames, {a.det}, "
          f"{'REAL' if a.real else 'SYNTHETIC-labelled'})")
    if out.stat().st_size > 10 * 1024 * 1024:
        print("WARNING: larger than 10 MB - lower --scale or --loops (project pages often cap image size).")


if __name__ == "__main__":
    main()
