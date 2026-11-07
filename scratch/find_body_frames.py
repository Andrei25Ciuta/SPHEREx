"""Which real SPHEREx images contain a known Solar System body at the moment they were taken?  (search only, nothing is downloaded)

    backend/.venv/Scripts/python.exe -I scratch/find_body_frames.py --body 136472 --band SPHEREx-D2

Asks JPL Horizons for the body's position (RA, Dec, geocentric distance delta in AU) every day, then asks IRSA's catalogue (TAP)
for the images of one detector whose footprint contains that position within a day of the sample date. Prints the images with the
body's position interpolated to each image's own time, ready for scratch/fetch_asteroid_cutout.py (which downloads one 5' cutout).
Horizons: https://ssd.jpl.nasa.gov/api/horizons.api (text API, open). Body ids: 136472 = Makemake.
"""

from __future__ import annotations

import argparse
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "scripts"))
import fetch_real_sample as f  # noqa: E402

HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
MJD_OF_JD0 = 2400000.5


def ephemeris(body: str, start: str, stop: str, step: str = "1d") -> list[tuple[float, float, float, float, float]]:
    """[(mjd, ra_deg, dec_deg, delta_au, apparent_mag)] geocentric, ICRF."""
    q = {"format": "text", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
         "CENTER": "'500@399'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'", "STEP_SIZE": f"'{step}'",
         "QUANTITIES": "'1,9,20'", "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'", "TIME_DIGITS": "'FRACSEC'"}
    req = urllib.request.Request(HORIZONS + "?" + urllib.parse.urlencode(q), headers={"User-Agent": f.USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = r.read().decode("utf-8", "replace")
    rows = []
    inside = False
    for line in text.splitlines():
        if line.startswith("$$SOE"):
            inside = True
            continue
        if line.startswith("$$EOE"):
            break
        if inside:
            cells = [c.strip() for c in line.split(",")]
            # date, , , RA, DEC, APmag, S-brt, delta, deldot
            from datetime import datetime, timezone
            when = datetime.strptime(cells[0], "%Y-%b-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
            mjd = when.timestamp() / 86400.0 + 40587.0
            rows.append((mjd, float(cells[3]), float(cells[4]), float(cells[7]), float(cells[5])))
    if not rows:
        sys.exit("Horizons returned no rows:\n" + text[:600])
    return rows


def at(rows, mjd):
    """Linear interpolation of the daily rows (the sky position changes by about a minute of arc per day)."""
    for a, b in zip(rows, rows[1:]):
        if a[0] <= mjd <= b[0]:
            w = (mjd - a[0]) / (b[0] - a[0])
            return tuple(a[i] + w * (b[i] - a[i]) for i in range(1, 5))
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--body", default="136472")
    ap.add_argument("--band", default="SPHEREx-D2")
    ap.add_argument("--start", default="2025-04-20")
    ap.add_argument("--stop", default="2026-10-20")
    ap.add_argument("--every-days", type=float, default=10.0)
    ap.add_argument("--window-days", type=float, default=5.5, help="half-width of the time window around each sample date; must be at least half of --every-days or dates are skipped")
    a = ap.parse_args()

    rows = ephemeris(a.body, a.start, a.stop)
    print(f"{len(rows)} ephemeris rows; geocentric distance {min(r[3] for r in rows):.2f}-{max(r[3] for r in rows):.2f} AU; magnitude {min(r[4] for r in rows):.2f}-{max(r[4] for r in rows):.2f}")
    seen = {}
    t = rows[0][0]
    while t < rows[-1][0]:
        ra, dec, delta, mag = at(rows, t)
        query = ("SELECT a.uri AS uri, p.planeid AS planeid, p.time_bounds_lower AS mjd, p.energy_bandpassname AS bandpass "
                 "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
                 f"WHERE 1 = CONTAINS(POINT('ICRS', {ra:.6f}, {dec:.6f}), p.poly) AND p.energy_bandpassname = '{a.band}' "
                 f"AND p.time_bounds_lower BETWEEN {t - a.window_days:.4f} AND {t + a.window_days:.4f} ORDER BY p.time_bounds_lower")
        try:
            for r in f.tap_query(query):
                seen[r["uri"]] = float(r["mjd"])
        except f.TapError as exc:
            print(f"  MJD {t:.1f}: TAP error {exc}")
        t += a.every_days
    print(f"\n{len(seen)} {a.band} images contain the body at their own time:")
    print("MJD         date        RA          Dec         delta(AU)  mag    uri")
    for uri, mjd in sorted(seen.items(), key=lambda kv: kv[1]):
        pos = at(rows, mjd)
        if pos is None:
            continue
        from datetime import datetime, timezone
        d = datetime.fromtimestamp((mjd - 40587.0) * 86400, tz=timezone.utc).strftime("%Y-%m-%d")
        print(f"{mjd:.5f}  {d}  {pos[0]:10.5f}  {pos[1]:+10.5f}  {pos[2]:8.3f}  {pos[3]:5.2f}  {uri}")


if __name__ == "__main__":
    main()
