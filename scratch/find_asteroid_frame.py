"""Find a real SPHEREx image that contains a moderately bright known asteroid (for a POSITIVE test of the asteroid check).

    backend/.venv/Scripts/python.exe scratch/find_asteroid_frame.py --mjd 61150 --days 2

Search only: it asks IRSA's catalogue (TAP, text) for D2 images in the time window whose centre is near the ecliptic,
asks SkyBoT (IMCCE) which known asteroids lie in each of them at that moment, and prints the brightest candidates.
Nothing is downloaded. The chosen asteroid is then fetched with scratch/fetch_asteroid_cutout.py (one 5' cutout).
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "scripts"))
import fetch_real_sample as f  # noqa: E402

import astropy.units as u  # noqa: E402
from astropy.coordinates import SkyCoord  # noqa: E402

SKYBOT = "https://ssp.imcce.fr/webservices/skybot/api/conesearch.php"


def decode_point(hexstr: str) -> tuple[float, float]:
    """PostGIS EWKB point (little endian): 1 + 4 type + 4 srid + 2 doubles."""
    raw = bytes.fromhex(hexstr)
    x, y = struct.unpack("<dd", raw[9:25])
    return x % 360.0, y


def skybot(ra: float, dec: float, radius_deg: float, mjd: float) -> list[dict]:
    q = urllib.parse.urlencode({"-ep": f"{mjd + 2400000.5:.5f}", "-ra": f"{ra:.6f}", "-dec": f"{dec:.6f}", "-rd": f"{radius_deg:.4f}",
                                "-mime": "json", "-output": "basic", "-loc": "500"})
    req = urllib.request.Request(f"{SKYBOT}?{q}", headers={"User-Agent": f.USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
            if r.status == 204 or not body.strip():
                return []
            return json.loads(body)
    except Exception as exc:  # noqa: BLE001
        print("  SkyBoT failed:", exc)
        return []


def sexa(h: str, d: str) -> tuple[float, float]:
    c = SkyCoord(f"{h} {d}", unit=(u.hourangle, u.deg))
    return float(c.ra.deg), float(c.dec.deg)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mjd", type=float, default=61150.0)
    ap.add_argument("--days", type=float, default=2.0)
    ap.add_argument("--band", default="SPHEREx-D2")
    ap.add_argument("--max-beta", type=float, default=4.0, help="ecliptic latitude of the image centre, degrees")
    ap.add_argument("--vmax", type=float, default=15.5)
    ap.add_argument("--tries", type=int, default=10)
    a = ap.parse_args()

    query = ("SELECT a.uri AS uri, p.planeid AS planeid, p.time_bounds_lower AS mjd, p.pt AS pt FROM spherex.artifact a "
             "JOIN spherex.plane p ON a.planeid = p.planeid "
             f"WHERE p.energy_bandpassname = '{a.band}' AND p.time_bounds_lower BETWEEN {a.mjd} AND {a.mjd + a.days} "
             "ORDER BY p.time_bounds_lower")
    rows = f.tap_query(query)
    print(f"{len(rows)} {a.band} images between MJD {a.mjd} and {a.mjd + a.days}")
    near = []
    for r in rows:
        ra, dec = decode_point(r["pt"])
        beta = SkyCoord(ra * u.deg, dec * u.deg).barycentrictrueecliptic.lat.deg
        if abs(beta) <= a.max_beta:
            near.append((r, ra, dec, beta))
    print(f"{len(near)} of them centred within {a.max_beta} deg of the ecliptic")
    if not near:
        return
    step = max(1, len(near) // a.tries)
    found = []
    for r, ra, dec, beta in near[::step][: a.tries]:
        mjd = float(r["mjd"])
        objs = skybot(ra, dec, 1.2, mjd)
        for o in objs:
            try:
                v = float(o["VMag (mag)"])
            except (TypeError, ValueError):
                continue
            if v > a.vmax:
                continue
            ora, odec = sexa(o["RA (hms)"], o["DEC (dms)"])
            found.append((v, o["Name"], o["Class"], ora, odec, mjd, r["uri"], float(o["d (arcsec)"]) / 3600, float(o.get("Err (arcsec)", 0) or 0)))
        print(f"  MJD {mjd:.4f} centre ({ra:.2f}, {dec:+.2f}) beta {beta:+.1f}: {len(objs)} known bodies, {sum(1 for x in found if x[5] == mjd)} with V <= {a.vmax}")
    print("\nCandidates (brightest first):")
    print("V     name              class        RA         Dec        MJD         dist from centre (deg)  pos err (arcsec)")
    for v, name, cls, ora, odec, mjd, uri, dist, err in sorted(found)[:15]:
        print(f"{v:5.1f} {name:17} {cls:12} {ora:10.5f} {odec:+10.5f} {mjd:.5f} {dist:6.2f}  {err:6.2f}  {uri.split('/')[-1]}")


if __name__ == "__main__":
    main()
