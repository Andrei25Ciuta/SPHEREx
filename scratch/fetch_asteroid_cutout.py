"""Download ONE 5-arcmin cutout of a chosen SPHEREx image, centred on a position (here: a known asteroid).

    backend/.venv/Scripts/python.exe scratch/fetch_asteroid_cutout.py --uri ibe/data/spherex/... --ra 296.40882 --dec -24.04831 --name Arosa

Companion of scratch/find_asteroid_frame.py. Asks "[y/N]" unless --yes. The file goes to backend/data/real/ (git ignores it).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "scripts"))
import fetch_real_sample as f  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uri", required=True, help="the image's uri from the TAP search (relative to https://irsa.ipac.caltech.edu/)")
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--size-arcmin", type=float, default=5.0)
    ap.add_argument("--name", default="asteroid")
    ap.add_argument("--max-mb", type=float, default=40.0)
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()

    url = f.cutout_url(a.uri, a.ra, a.dec, a.size_arcmin)
    print("cutout:", url)
    if not a.yes and input("Download this one cutout (about 4 MB)? [y/N] ").strip().lower() != "y":
        print("cancelled")
        return 1
    dest = ROOT / "backend" / "data" / "real" / f"asteroid_{a.name}_{Path(a.uri).stem[-40:]}.fits"
    result = f.download(url, dest, max_bytes=a.max_mb * 1e6)
    if not result["ok"]:
        print("DOWNLOAD FAILED:", result.get("error"))
        return 2
    print(f"downloaded {result['bytes'] / 1e6:.2f} MB in {result['seconds']:.1f} s -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
