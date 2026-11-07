"""Is WISE 0855 in the real SPHEREx images?  Stack its flux along its known path and compare with control positions.

    backend/.venv/Scripts/python.exe -I scratch/stack_wise0855.py --api http://localhost:8003 --det D6

WISE 0855 (the coldest known brown dwarf, ~8 arcsec/yr, J = 25 at 1 um but bright at 4.5 um) is far too faint to show as a dot
in one SPHEREx exposure, so a blind search cannot find it. The question here is the weaker one: at the position its catalogue
proper motion predicts for each image's date, is there flux when all the images are added up?

  * target: the aperture sum at the predicted position on every image (backend /api/photometry, moving-object mode);
  * controls: the same measurement at 16 positions 40 and 60 arcsec away (same path, shifted), where nothing is expected;
  * the stack is the inverse-variance mean over the unflagged images. The nominal error assumes the per-image errors are right;
    the control scatter does not assume anything, so the significance is quoted both ways.

Catalogue position and motion are the ones in frontend/js/targets.js (Kirkpatrick et al. 2021, epoch J2000.0). Use a backend that
serves REAL data only (started with SPHEREX_DATA_DIR set to backend/data/real), or the synthetic frames of
backend/data/fake at the same sky position are mixed in.
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.parse
import urllib.request

RA_J2000, DEC_J2000 = 133.81890825, -7.247048   # J2000.0 (frontend/js/targets.js)
PM_EAST, PM_NORTH = -8.1237, 0.6732          # arcsec/yr (pmra, pmdec in mas/yr: -8123.7, +673.2; pmra already includes cos dec)
EPOCH_YEAR, EPOCH_MJD = 2026.0, 61041.0      # the app's reference epoch (SPHEREX_REF_EPOCH); MJD of 2026-01-01
# The position at that epoch (what positionAtEpoch() in targets.js gives): the archive is asked about THIS spot,
# and the motion offsets in /api/photometry are counted from EPOCH_MJD.
_dt = EPOCH_YEAR - 2000.0
DEC0 = DEC_J2000 + PM_NORTH * _dt / 3600.0
RA0 = RA_J2000 + PM_EAST * _dt / 3600.0 / math.cos(math.radians((DEC_J2000 + DEC0) / 2))


def points(api: str, ra: float, dec: float, det: str, radius: float) -> list[dict]:
    q = urllib.parse.urlencode({"ra": ra, "dec": dec, "det": det, "radius": radius, "epoch_mjd": EPOCH_MJD, "pm_east": PM_EAST, "pm_north": PM_NORTH})
    with urllib.request.urlopen(f"{api}/api/photometry?{q}", timeout=120) as r:
        return json.load(r)["points"]


def stack(pts: list[dict]) -> tuple[float, float, int]:
    """Inverse-variance mean (Jy), its nominal error, and the number of images used (unflagged, with an error)."""
    good = [p for p in pts if p["fluxJy"] is not None and p["fluxJyErr"] and not p["flagged"]]
    if not good:
        return float("nan"), float("nan"), 0
    w = [1 / p["fluxJyErr"] ** 2 for p in good]
    mean = sum(wi * p["fluxJy"] for wi, p in zip(w, good)) / sum(w)
    return mean, 1 / math.sqrt(sum(w)), len(good)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8003")
    ap.add_argument("--det", default="D6")
    ap.add_argument("--radius", type=float, default=2.0, help="aperture radius, pixels")
    a = ap.parse_args()

    target = points(a.api, RA0, DEC0, a.det, a.radius)
    print(f"{len(target)} {a.det} images with WISE 0855 on its predicted path")
    print("date        lambda(um)   flux(mJy)  error(mJy)  S/N   flagged")
    for p in target:
        f, e = p["fluxJy"], p["fluxJyErr"]
        print(f"{p['dateISO'][:10]}  {p['wavelengthUm']:8.3f}   {f * 1e3:9.3f}  {e * 1e3:9.3f}  {f / e if e else float('nan'):5.1f}   {p['flagged']}")
    mean, err, n = stack(target)
    print(f"\nSTACK of {n} unflagged images: {mean * 1e3:.3f} +- {err * 1e3:.3f} mJy  (nominal {mean / err:.1f} sigma)")

    controls = []
    for radius_arcsec in (40.0, 60.0):
        for k in range(8):
            ang = math.radians(45 * k + (22.5 if radius_arcsec > 50 else 0))
            dE, dN = radius_arcsec * math.sin(ang), radius_arcsec * math.cos(ang)
            m, e, nn = stack(points(a.api, RA0 + dE / 3600 / math.cos(math.radians(DEC0)), DEC0 + dN / 3600, a.det, a.radius))
            if nn:
                controls.append(m)
    if len(controls) >= 4:
        mu = sum(controls) / len(controls)
        sd = math.sqrt(sum((c - mu) ** 2 for c in controls) / (len(controls) - 1))
        srt = sorted(controls)
        med = srt[len(srt) // 2] if len(srt) % 2 else 0.5 * (srt[len(srt) // 2 - 1] + srt[len(srt) // 2])
        mad = sorted(abs(c - med) for c in controls)
        robust = 1.4826 * (mad[len(mad) // 2] if len(mad) % 2 else 0.5 * (mad[len(mad) // 2 - 1] + mad[len(mad) // 2]))
        print("control stacks (mJy), sorted:", " ".join(f"{c * 1e3:+.2f}" for c in srt))
        print(f"{len(controls)} CONTROL positions (same path shifted 40-60 arcsec): mean {mu * 1e3:+.3f} mJy, scatter {sd * 1e3:.3f} mJy; "
              f"median {med * 1e3:+.3f} mJy, robust scatter (1.4826 x MAD) {robust * 1e3:.3f} mJy")
        print(f"target minus control mean = {(mean - mu) * 1e3:.3f} mJy = {(mean - mu) / sd:.1f} x the control scatter, "
              f"{(mean - med) / robust if robust else float('nan'):.1f} x the robust scatter; "
              f"brighter than {sum(1 for c in controls if c < mean)} of {len(controls)} controls")


if __name__ == "__main__":
    main()
