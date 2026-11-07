"""Plan, and after a yes download, a batch of 30-arcmin SPHEREx cutouts around a moving body, each cut OFF the body's own position.

    # 1. only look (no download): which images contain the body, where each cutout would be centred, how big it would be
    backend/.venv/Scripts/python.exe -I scratch/fetch_body_cutouts.py --body 136472 --name Makemake --bands SPHEREx-D1,SPHEREx-D2 --plan
    # 2. download one file to measure the real size
    ... --probe
    # 3. download all (asks "[y/N]" unless --yes)
    ... --yes

Why: a blind search for a distant body is only a fair test if the body is not at the centre of every cutout. Here each cutout is
centred on the body's JPL Horizons position PLUS a random offset of 3 to --offset-arcmin arcminutes in each of two random
directions (seeded), so the body is somewhere inside a 30' field among thousands of other dots and no dot is special because of its
place in the cutout. The ephemeris is used to choose which images to cut and where, and later only to GRADE the blind result:
the truth (body position at each image's time, cutout centre, file name) is written to scratch/blind_<name>_truth.json.

Network: JPL Horizons text API (https://ssd.jpl.nasa.gov/api/horizons.api) and IRSA's TAP and cutout service, as in
scratch/find_body_frames.py and backend/scripts/fetch_real_sample.py. Files go to backend/data/real/ (git ignores it); each file is refused above --max-mb.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "scripts"))
sys.path.insert(0, str(ROOT / "scratch"))
import fetch_real_sample as f  # noqa: E402
from find_body_frames import at, ephemeris  # noqa: E402

FIXED_MB = 4.7          # PSF cube and headers: the part of a 5-arcmin cutout (5.1 MB) that does not grow with the area (estimate: 5.1 MB minus four 49 x 49 float planes)
PLANES = 4              # IMAGE, FLAGS, VARIANCE, ZODI: 4 bytes a pixel each
PIXEL_ARCSEC = 6.14


def estimate_mb(size_arcmin: float) -> float:
    n = size_arcmin * 60 / PIXEL_ARCSEC
    return FIXED_MB + PLANES * 4 * n * n / 1e6


def body_images(rows, band: str, every_days: float, window_days: float) -> dict[str, float]:
    """{uri: mjd} of the images of one band whose footprint contains the body at the image's own time."""
    seen: dict[str, float] = {}
    t = rows[0][0]
    while t < rows[-1][0]:
        ra, dec, _delta, _mag = at(rows, t)
        query = ("SELECT a.uri AS uri, p.planeid AS planeid, p.time_bounds_lower AS mjd, p.energy_bandpassname AS bandpass "
                 "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
                 f"WHERE 1 = CONTAINS(POINT('ICRS', {ra:.6f}, {dec:.6f}), p.poly) AND p.energy_bandpassname = '{band}' "
                 f"AND p.time_bounds_lower BETWEEN {t - window_days:.4f} AND {t + window_days:.4f} ORDER BY p.time_bounds_lower")
        try:
            for r in f.tap_query(query):
                seen[r["uri"]] = float(r["mjd"])
        except f.TapError as exc:
            print(f"  MJD {t:.1f}: TAP error {exc}")
        t += every_days
    return seen


def pick_per_pass(images: dict[str, float], per_pass: int, gap_days: float = 30.0) -> dict[str, float]:
    """At most `per_pass` images from each survey pass (images less than gap_days apart are one pass), spread evenly in time within the pass.
    The choice looks only at the dates, never at where the body is in the image or how bright it is."""
    ordered = sorted(images.items(), key=lambda kv: kv[1])
    passes: list[list[tuple[str, float]]] = []
    for item in ordered:
        if passes and item[1] - passes[-1][-1][1] < gap_days:
            passes[-1].append(item)
        else:
            passes.append([item])
    chosen: dict[str, float] = {}
    for group in passes:
        k = min(per_pass, len(group))
        for i in range(k):
            uri, mjd = group[round(i * (len(group) - 1) / max(1, k - 1))] if k > 1 else group[len(group) // 2]
            chosen[uri] = mjd
    return chosen


def offset_centre(ra: float, dec: float, rng: random.Random, min_arcmin: float, max_arcmin: float) -> tuple[float, float]:
    """The body's position moved by a random offset (east, north), each component between min and max arcmin with a random sign."""
    de = rng.uniform(min_arcmin, max_arcmin) * rng.choice((-1, 1))
    dn = rng.uniform(min_arcmin, max_arcmin) * rng.choice((-1, 1))
    return ra + de / 60 / math.cos(math.radians(dec)), dec + dn / 60


def body_pixel(path: Path, ra: float, dec: float) -> tuple[float, float, tuple[int, int]] | None:
    """Where the body falls in a downloaded cutout (pixel x, y, image shape), from the file's own WCS."""
    from astropy.io import fits
    from astropy.wcs import WCS

    with fits.open(path) as hdul:
        wcs = WCS(hdul[1].header)
        x, y = wcs.all_world2pix(ra, dec, 0)
        return float(x), float(y), hdul[1].data.shape


def run_downloads(a, plan: list[dict], est: float) -> int:
    todo = plan[:1] if a.probe else plan
    if not a.yes and input(f"\nDownload {len(todo)} file(s), about {est * len(todo):.0f} MB, into backend/data/real/? [y/N] ").strip().lower() != "y":
        print("cancelled")
        return 1
    dest_dir = ROOT / "backend" / "data" / "real"
    total = 0.0
    for p in todo:
        dest = dest_dir / p["file"]
        if dest.exists():
            print(f"  {p['file']}: already there")
            continue
        result = f.download(p["url"], dest, max_bytes=a.max_mb * 1e6)
        if not result["ok"]:
            print(f"  {p['file']}: FAILED {result.get('error')}")
            continue
        total += result["bytes"] / 1e6
        where = body_pixel(dest, p["bodyRa"], p["bodyDec"])
        inside = where and 2 <= where[0] <= where[2][1] - 2 and 2 <= where[1] <= where[2][0] - 2
        print(f"  {p['file']}: {result['bytes'] / 1e6:.2f} MB in {result['seconds']:.1f} s; image {where[2] if where else '?'}; body at pixel "
              f"({where[0]:.0f}, {where[1]:.0f}) -> {'INSIDE' if inside else 'OUTSIDE the cutout'}" if where else f"  {p['file']}: {result['bytes'] / 1e6:.2f} MB, no WCS")
    print(f"\ndownloaded {total:.1f} MB")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--body", default="136472", help="JPL Horizons id (136472 = Makemake)")
    ap.add_argument("--name", default="Makemake")
    ap.add_argument("--bands", default="SPHEREx-D2")
    ap.add_argument("--start", default="2025-04-20")
    ap.add_argument("--stop", default="2026-10-20")
    ap.add_argument("--every-days", type=float, default=10.0)
    ap.add_argument("--window-days", type=float, default=5.5)
    ap.add_argument("--size-arcmin", type=float, default=30.0)
    ap.add_argument("--min-offset-arcmin", type=float, default=3.0)
    ap.add_argument("--offset-arcmin", type=float, default=8.0, help="largest offset of the cutout centre from the body, per axis")
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--per-pass", type=int, default=0, help="keep at most this many images from each survey pass (0 = all); the choice looks only at the dates")
    ap.add_argument("--max-files", type=int, default=40)
    ap.add_argument("--max-mb", type=float, default=25.0, help="refuse any file larger than this")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--plan", action="store_true", help="only list what would be downloaded")
    mode.add_argument("--probe", action="store_true", help="download only the first file, to measure the real size")
    ap.add_argument("--yes", action="store_true", help="download everything without asking")
    ap.add_argument("--from-truth", action="store_true", help="take the plan from scratch/blind_<name>_truth.json (written by an earlier --plan run) instead of searching again")
    a = ap.parse_args()
    truth = ROOT / "scratch" / f"blind_{a.name}_truth.json"
    if a.from_truth:
        saved = json.loads(truth.read_text(encoding="utf-8"))
        a.size_arcmin = saved["sizeArcmin"]
        plan = [dict(p, url=f.cutout_url(p["uri"], p["centreRa"], p["centreDec"], a.size_arcmin)) for p in saved["images"]]
        est = estimate_mb(a.size_arcmin)
        print(f"{len(plan)} cutout(s) of {a.size_arcmin:g} arcmin read from {truth.relative_to(ROOT)} (no search repeated); estimated {est:.1f} MB each")
        return run_downloads(a, plan, est) if not a.plan else 0

    rows = ephemeris(a.body, a.start, a.stop)
    print(f"{a.name}: {len(rows)} ephemeris rows; geocentric distance {min(r[3] for r in rows):.2f}-{max(r[3] for r in rows):.2f} AU; apparent magnitude {min(r[4] for r in rows):.2f}-{max(r[4] for r in rows):.2f} (Horizons)")
    rng = random.Random(a.seed)
    plan = []
    for band in [b.strip() for b in a.bands.split(",") if b.strip()]:
        images = body_images(rows, band, a.every_days, a.window_days)
        print(f"{band}: {len(images)} image(s) contain the body at their own time")
        if a.per_pass:
            images = pick_per_pass(images, a.per_pass)
            print(f"{band}: {len(images)} kept ({a.per_pass} per survey pass, spread in time)")
        for uri, mjd in sorted(images.items(), key=lambda kv: kv[1]):
            pos = at(rows, mjd)
            if pos is None:
                continue
            ra, dec, delta, mag = pos
            cra, cdec = offset_centre(ra, dec, rng, a.min_offset_arcmin, a.offset_arcmin)
            date = datetime.fromtimestamp((mjd - 40587.0) * 86400, tz=timezone.utc).strftime("%Y-%m-%d")
            plan.append({"band": band, "uri": uri, "mjd": mjd, "date": date, "bodyRa": ra, "bodyDec": dec, "deltaAu": delta, "mag": mag,
                         "centreRa": cra, "centreDec": cdec, "url": f.cutout_url(uri, cra, cdec, a.size_arcmin),
                         "file": f"blindbody_{a.name}_{band[-2:]}_{mjd:.5f}.fits"})
    plan = plan[: a.max_files]
    est = estimate_mb(a.size_arcmin)
    print(f"\n{len(plan)} cutout(s) of {a.size_arcmin:g} arcmin; estimated {est:.1f} MB each (estimate: {FIXED_MB} MB fixed + {PLANES} float planes), {est * len(plan):.0f} MB in all\n")
    print("date        band  body RA     body Dec    cutout centre RA / Dec        file")
    for p in plan:
        print(f"{p['date']}  {p['band'][-2:]}   {p['bodyRa']:9.5f}  {p['bodyDec']:+9.5f}  {p['centreRa']:9.5f} {p['centreDec']:+9.5f}   {p['file']}")
    truth.write_text(json.dumps({"body": a.name, "horizonsId": a.body, "sizeArcmin": a.size_arcmin, "seed": a.seed,
                                 "note": "Horizons positions of the body at each image's time and the centre of each cutout (the body plus a random offset). For GRADING a blind search only.",
                                 "images": [{k: v for k, v in p.items() if k != "url"} for p in plan]}, indent=1), encoding="utf-8")
    print(f"\ntruth written to {truth.relative_to(ROOT)}")
    if a.plan or not plan:
        return 0

    return run_downloads(a, plan, est)


if __name__ == "__main__":
    raise SystemExit(main())
