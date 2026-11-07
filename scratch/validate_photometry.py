"""Is our Jansky scale right?  Compare aperture fluxes of isolated field stars with their catalogue magnitudes.

    backend/.venv/Scripts/python.exe -I scratch/validate_photometry.py --ra 269.4462 --dec 4.769 --det D2

Real SPHEREx cutouts in backend/data/real/ (git-ignored); star magnitudes from IRSA's TAP (2MASS point sources for
the near infrared, AllWISE for 4.6 um). For every isolated, unsaturated star and every image it prints the ratio
  measured flux / flux expected from the catalogue at that image's wavelength
and the overall median. The expected flux uses zero points written from memory (Cohen+2003 for 2MASS: J 1594 Jy at 1.235 um,
H 1024 Jy at 1.662 um; Jarrett+2011 for WISE W2: 171.787 Jy at 4.6028 um): CHECK them before quoting the result.
A ratio below 1 is expected: the 2-pixel aperture catches only part of the star's light (no aperture correction is applied).
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "scripts"))
import fetch_real_sample as f  # noqa: E402
from spherex.photometry import measure  # noqa: E402
from spherex.query import LocalArchive  # noqa: E402

TWOMASS = [(1.235, 1594.0, "j_m"), (1.662, 1024.0, "h_m"), (2.159, 666.7, "k_m")]    # (um, zero point Jy, column) - from memory
W2 = (4.6028, 171.787)                                                                # (um, zero point Jy) - from memory


def expected_near_ir(row: dict, wavelength_um: float) -> float | None:
    """F_nu (Jy) at wavelength, log-log interpolation/extrapolation through the 2MASS J and H (and Ks) points."""
    pts = []
    for lam, zp, col in TWOMASS:
        try:
            mag = float(row[col])
        except (KeyError, ValueError):
            continue
        pts.append((math.log(lam), math.log(zp * 10 ** (-0.4 * mag))))
    if len(pts) < 2:
        return None
    (x0, y0), (x1, y1) = pts[0], pts[1]
    slope = (y1 - y0) / (x1 - x0)
    return math.exp(y0 + slope * (math.log(wavelength_um) - x0))


def expected_w2(row: dict, wavelength_um: float) -> float | None:
    try:
        mag = float(row["w2mpro"])
    except (KeyError, ValueError):
        return None
    f_w2 = W2[1] * 10 ** (-0.4 * mag)
    return f_w2 * (W2[0] / wavelength_um) ** 2                   # Rayleigh-Jeans scaling between 4.2 and 5.1 um


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--det", default="D2")
    ap.add_argument("--fov-arcmin", type=float, default=4.5, help="stars inside this square (cutouts are 5 arcmin)")
    ap.add_argument("--jmax", type=float, default=14.0)
    ap.add_argument("--jmin", type=float, default=9.0, help="brighter stars may saturate")
    ap.add_argument("--isolation-arcsec", type=float, default=25.0)
    a = ap.parse_args()

    archive = LocalArchive(ROOT / "backend" / "data" / "real")
    frames = archive.find(a.ra, a.dec, a.det)
    if not frames:
        sys.exit("no real frames here")
    wave = [(fr.wave_min_um + fr.wave_max_um) / 2 for fr in frames]
    print(f"{len(frames)} {a.det} frames, {min(wave):.2f}-{max(wave):.2f} um")
    half = a.fov_arcmin / 120.0
    box = f"BOX('ICRS', {a.ra}, {a.dec}, {2 * half / math.cos(math.radians(a.dec))}, {2 * half})"
    near_ir = a.det in ("D1", "D2", "D3")
    if near_ir:
        rows = f.tap_query(f"SELECT ra, dec, j_m, h_m, k_m, ph_qual, cc_flg, gal_contam FROM fp_psc WHERE 1=CONTAINS(POINT('ICRS', ra, dec), {box})")
    else:
        rows = f.tap_query(f"SELECT ra, dec, w1mpro, w2mpro, w2sigmpro, ph_qual, cc_flags, ext_flg FROM allwise_p3as_psd WHERE 1=CONTAINS(POINT('ICRS', ra, dec), {box})")
    print(f"{len(rows)} catalogue sources in the field ({'2MASS' if near_ir else 'AllWISE'})")
    key = "j_m" if near_ir else "w2mpro"
    stars = []
    for r in rows:
        try:
            r["_ra"], r["_dec"], r["_m"] = float(r["ra"]), float(r["dec"]), float(r[key])
        except (ValueError, KeyError):
            continue
        stars.append(r)
    good = []
    for r in stars:
        if not (a.jmin <= r["_m"] <= a.jmax if near_ir else 6.0 <= r["_m"] <= 13.0):
            continue
        if near_ir and not str(r.get("ph_qual", "")).startswith("A"):
            continue
        neighbours = [o for o in stars if o is not r and math.hypot((o["_ra"] - r["_ra"]) * math.cos(math.radians(r["_dec"])), o["_dec"] - r["_dec"]) * 3600 < a.isolation_arcsec and o["_m"] < r["_m"] + 3]
        if neighbours:
            continue
        good.append(r)
    print(f"{len(good)} isolated stars with {key} in range")

    ratios_all = []
    print("\nstar (RA, Dec)            mag    images   median measured/expected   scatter")
    for r in good:
        pts = measure(frames, r["_ra"], r["_dec"], 2.0)
        ratios = []
        for p in pts:
            if p["flux"] is None or p["fluxJy"] is None or p["flagged"] or p["flux"] <= 0 or p["fluxErr"] in (None, 0) or p["flux"] / p["fluxErr"] < 10:
                continue
            lam = p["wavelengthUm"]
            exp = expected_near_ir(r, lam) if near_ir else expected_w2(r, lam)
            if exp:
                ratios.append(p["fluxJy"] / exp)
        if len(ratios) >= 2:
            ratios_all.extend(ratios)
            print(f"({r['_ra']:.4f}, {r['_dec']:+.4f})   {r['_m']:5.2f}   {len(ratios):4d}     {np.median(ratios):8.3f}                 {1.4826 * np.median(np.abs(np.array(ratios) - np.median(ratios))):.3f}")
    if ratios_all:
        arr = np.array(ratios_all)
        print(f"\nALL: {len(arr)} measurements of {len(good)} stars: median ratio {np.median(arr):.3f}, robust scatter {1.4826 * np.median(np.abs(arr - np.median(arr))):.3f} "
              f"(16th-84th percentile {np.percentile(arr, 16):.2f}-{np.percentile(arr, 84):.2f})")
    else:
        print("no usable measurement")


if __name__ == "__main__":
    main()
