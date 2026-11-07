"""Try REAL SPHEREx data from IRSA in the smallest possible steps.  Nothing here runs by itself.

Run from the repository root (see docs/REAL_DATA_TEST.md for the full guide):

    backend/.venv/Scripts/python.exe backend/scripts/fetch_real_sample.py
        Step A - SEARCH ONLY. Asks IRSA's catalogue (TAP) which SPHEREx images cover each of the
        5 test objects. A text query: no image is downloaded. Prints how many images, in which
        detectors, on which dates, and how many survey passes (Find movers needs >= 3).

    backend/.venv/Scripts/python.exe backend/scripts/fetch_real_sample.py --target barnard --download 1
        Step B - the same search, then downloads ONE small cutout (server-side cutout, 5 arcmin)
        and inspects it. Asks "[y/N]" before downloading.

    backend/.venv/Scripts/python.exe backend/scripts/fetch_real_sample.py --target barnard --download 4
        Step C - several dates of the same detector, and checks that the catalogue motion of the
        object matches what is in the images (the whole chain: time, WCS, orientation).

Everything printed is ALSO saved to backend/data/real/report_<time>.txt. Paste that file's text
into the chat: it contains what is needed to adapt the backend to the real files.
The ADQL query is the one from IRSA's own tutorial
(https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/); the TAP endpoint is documented at
https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html. Table and column names may change
between data releases: if the search fails, run with --schema and paste the output.
"""

from __future__ import annotations

import argparse
import csv
import io
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
for _p in (str(BACKEND), str(Path(__file__).resolve().parent)):        # `spherex` package and inspect_fits
    if _p not in sys.path:
        sys.path.insert(0, _p)

TAP_URL = "https://irsa.ipac.caltech.edu/TAP/sync"
IRSA_HOST = "https://irsa.ipac.caltech.edu/"
USER_AGENT = "SPHEREx-Blink/0.9 (NASA Space Apps 2026 project; real-data test script)"
OUT_DIR = BACKEND / "data" / "real"
DEFAULT_SIZE_ARCMIN = 5.0
DEFAULT_MAX_MB = 40.0
PASS_GAP_DAYS = 30.0                    # images further apart than this belong to different survey passes
SEARCH_YEAR = 2025.8                    # only used to place the search point; footprints are degrees wide
BANDPASS_RE = re.compile(r"^SPHEREx-D[1-6]$")

# The 5 test objects: SIMBAD J2000 position + proper motion, copied from frontend/js/targets.js
# (backend/tests/test_fetch_real_sample.py checks that the two lists still agree).
TARGETS = {
    "barnard":  {"label": "Barnard's Star",  "ra": 269.4520769586187,  "dec": 4.693364966576667,   "pmra": -801.551,  "pmdec": 10362.394},
    "epsindb":  {"label": "Epsilon Indi B",  "ra": 331.04414658852124, "dec": -56.782844195116105, "pmra": 3981.977,  "pmdec": -2466.832},
    "wise0855": {"label": "WISE 0855",       "ra": 133.81890825,       "dec": -7.247048,           "pmra": -8123.7,   "pmdec": 673.2},
    "rwaur":    {"label": "RW Aurigae",      "ra": 76.95652603458333,  "dec": 30.401438173888888,  "pmra": 7.23,      "pmdec": -20.33},
    "rdra":     {"label": "R Draconis",      "ra": 248.16761083295,    "dec": 66.75497941722,     "pmra": -20.643,   "pmdec": 6.149},
}


class TapError(RuntimeError):
    """The archive answered, but not with a table (or did not answer)."""


# ------------------------------------------------------------------ small pure helpers

def year_of_mjd(mjd: float) -> float:
    return 2000.0 + (mjd - 51544.5) / 365.25


def position_at(target: dict, year: float) -> tuple[float, float]:
    """Linear proper-motion propagation from J2000 (same formula as frontend/js/targets.js)."""
    dt = year - 2000.0
    dec = target["dec"] + target["pmdec"] * dt / 3.6e6
    mean_dec = math.radians((target["dec"] + dec) / 2)
    ra = (target["ra"] + target["pmra"] * dt / 3.6e6 / math.cos(mean_dec)) % 360.0
    return ra, dec


def build_search_query(ra: float, dec: float, bandpass: str | None = None) -> str:
    """IRSA's tutorial query: every plane whose footprint contains (ra, dec), with its file."""
    if bandpass is not None and not BANDPASS_RE.match(bandpass):
        raise ValueError(f"bandpass must look like SPHEREx-D1 ... SPHEREx-D6, not {bandpass!r}")
    where = f"1 = CONTAINS(POINT('ICRS', {ra:.8f}, {dec:.8f}), p.poly)"
    if bandpass:
        where += f" AND p.energy_bandpassname = '{bandpass}'"
    return ("SELECT a.uri AS uri, p.planeid AS planeid, p.time_bounds_lower AS mjd, "
            "p.energy_bandpassname AS bandpass "
            "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid "
            f"WHERE {where} ORDER BY p.time_bounds_lower")


SCHEMA_QUERY = ("SELECT table_name, column_name, datatype, unit FROM TAP_SCHEMA.columns "
                "WHERE table_name IN ('spherex.plane', 'spherex.artifact')")
TABLES_QUERY = "SELECT table_name FROM TAP_SCHEMA.tables WHERE table_name LIKE '%spherex%'"


def parse_csv(text: str) -> list[dict]:
    rows = list(csv.DictReader(io.StringIO(text)))
    for row in rows:
        if "mjd" in row:
            try:
                row["mjd"] = float(row["mjd"])
            except (TypeError, ValueError):
                row["mjd"] = float("nan")
    return rows


def _band(row: dict) -> str:
    return row.get("bandpass") or "?"


def summarize(rows: list[dict]) -> list[dict]:
    """Per bandpass: number of images, first/last date (MJD) and number of survey passes."""
    by_band: dict[str, list[float]] = {}
    for row in rows:
        mjd = row.get("mjd", float("nan"))
        if isinstance(mjd, float) and math.isfinite(mjd):
            by_band.setdefault(_band(row), []).append(mjd)
    out = []
    for band in sorted(by_band, key=lambda b: [int(n) for n in re.findall(r"\d+", b)] or [0]):
        mjds = sorted(by_band[band])
        passes = 1 + sum(1 for a, b in zip(mjds, mjds[1:]) if b - a > PASS_GAP_DAYS)
        out.append({"bandpass": band, "count": len(mjds), "first": mjds[0], "last": mjds[-1], "passes": passes})
    return out


def pick_rows(rows: list[dict], n: int, bandpass: str | None = None) -> list[dict]:
    """n images of ONE detector, spread over time. Default detector: the one with most survey passes."""
    fits_rows = [r for r in rows if r.get("uri", "").lower().split("?")[0].endswith(".fits")] or rows
    if bandpass is None:
        summary = summarize(fits_rows)
        if not summary:
            return []
        bandpass = max(summary, key=lambda s: (s["passes"], s["count"]))["bandpass"]
    chosen = sorted((r for r in fits_rows if _band(r) == bandpass), key=lambda r: r["mjd"])
    if n >= len(chosen):
        return chosen
    if n <= 1:
        return chosen[:1]
    indexes = sorted({round(i * (len(chosen) - 1) / (n - 1)) for i in range(n)})
    return [chosen[i] for i in indexes]


def cutout_url(uri: str, ra: float, dec: float, size_arcmin: float) -> str:
    """Server-side cutout: the file's URL + ?center=<ra>,<dec>d&size=<degrees> (as in IRSA's tutorial)."""
    base = uri if uri.startswith(("http://", "https://")) else IRSA_HOST + uri.lstrip("/")
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}center={ra:.8f},{dec:.8f}d&size={size_arcmin / 60:.6f}"


def safe_name(row: dict, index: int) -> str:
    band = re.sub(r"[^A-Za-z0-9_-]", "_", _band(row))
    return f"spherex_{band}_{row['mjd']:.3f}_{index}.fits"


# ------------------------------------------------------------------ network (each takes `opener` so tests can fake it)

def tap_query(query: str, *, timeout: float = 300, opener=urllib.request.urlopen) -> list[dict]:
    params = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": query})
    request = urllib.request.Request(f"{TAP_URL}?{params}", headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        snippet = exc.read()[:600].decode("utf-8", "replace")
        raise TapError(f"HTTP {exc.code} from the TAP service: {snippet}") from exc
    except OSError as exc:
        raise TapError(f"could not reach the TAP service: {exc}") from exc
    text = raw.decode("utf-8", "replace")
    if text.lstrip().startswith("<"):                       # an XML (VOTable) error instead of CSV
        message = re.search(r'value="ERROR"[^>]*>([^<]*)', text)
        raise TapError("the TAP service reported an error: " + (message.group(1).strip() if message else text[:400]))
    return parse_csv(text)


def download(url: str, dest: Path, *, max_bytes: float, timeout: float = 120, opener=urllib.request.urlopen) -> dict:
    """Download one file. Never raises: returns {"ok": bool, "error"?: str, "bytes", "seconds", ...}."""
    started = time.time()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=timeout) as response:
            status = getattr(response, "status", None) or response.getcode()
            content_type = response.headers.get("Content-Type", "")
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > max_bytes:
                return {"ok": False, "status": status, "error": f"the file is {int(declared) / 1e6:.1f} MB, over the {max_bytes / 1e6:.0f} MB limit"}
            chunks, total = [], 0
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    return {"ok": False, "status": status, "error": f"more than {max_bytes / 1e6:.0f} MB received, stopped"}
                chunks.append(chunk)
    except urllib.error.HTTPError as exc:
        body = exc.read()[:300].decode("utf-8", "replace")
        hint = {400: " (bad unit or size)", 500: " (no overlap with the image?)"}.get(exc.code, "")
        return {"ok": False, "status": exc.code, "error": f"HTTP {exc.code}{hint}: {body}"}
    except OSError as exc:
        return {"ok": False, "error": f"network error: {exc}"}
    data = b"".join(chunks)
    if not data.startswith(b"SIMPLE"):
        return {"ok": False, "status": status, "error": f"not a FITS file; it starts with {data[:150]!r}"}
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    part.write_bytes(data)
    part.replace(dest)
    return {"ok": True, "status": status, "bytes": total, "seconds": time.time() - started,
            "path": dest, "content_type": content_type}


# ------------------------------------------------------------------ inspecting a downloaded file

def _wavelength_at(hdul, x: float, y: float) -> str:
    """Per-pixel wavelength from WCS-WAVE, with the recipe from IRSA's tutorial. Best effort."""
    from astropy.wcs import WCS
    try:
        w = WCS(header=hdul["IMAGE"].header, fobj=hdul, key="W")
        w.sip = None
        return f"{w.pixel_to_world(x, y)!r}"
    except Exception as exc:  # noqa: BLE001 - this is exploratory: report whatever happens
        return f"failed: {type(exc).__name__}: {exc}"


def inspect_file(path: Path, ra: float, dec: float, header_dump: bool = True) -> dict:
    """What is in the file, and is there a source where the catalogue says the object is?

    ra, dec = the object's catalogue position at the observation time. Returns
    {"lines": [...], "snr": float|None, "residual_arcsec": float|None, "east": .., "north": .., "date": ..}.
    """
    import astropy.units as u
    import numpy as np
    from astropy.coordinates import SkyCoord
    from astropy.io import fits
    from astropy.wcs import WCS
    from astropy.wcs.utils import proj_plane_pixel_scales
    from inspect_fits import describe_data, describe_wcs
    from spherex.query import DATE_KEYS, MJD_KEYS

    lines: list[str] = []
    result = {"lines": lines, "snr": None, "residual_arcsec": None, "east": None, "north": None, "date": None}
    with fits.open(path, memmap=False) as hdul:
        lines.append("HDUs: " + ", ".join(f"{i}:{h.header.get('EXTNAME', 'PRIMARY' if i == 0 else '?')}" for i, h in enumerate(hdul)))
        names = [h.header.get("EXTNAME", "") for h in hdul]
        image_i = names.index("IMAGE") if "IMAGE" in names else 1
        flags_i = names.index("FLAGS") if "FLAGS" in names else (2 if len(hdul) > 2 else None)
        image = hdul[image_i]
        lines.append(f"IMAGE is HDU {image_i} ({'by name' if 'IMAGE' in names else 'by position - no EXTNAME=IMAGE'}): {describe_data(image)}")
        lines.append(f"  wcs: {describe_wcs(image.header)}")
        if flags_i is not None:
            lines.append(f"FLAGS is HDU {flags_i}: {describe_data(hdul[flags_i])}")
        lines.append(f"BUNIT: {image.header.get('BUNIT')!r}   DETECTOR: {image.header.get('DETECTOR', hdul[0].header.get('DETECTOR'))!r}")

        merged = hdul[0].header.copy()
        merged.update(image.header)
        found = {k: merged[k] for k in (*MJD_KEYS, *DATE_KEYS, "DATE") if k in merged}
        result["date"] = merged.get("DATE")
        lines.append(f"time keywords present: {found if found else 'NONE of ' + str((*MJD_KEYS, *DATE_KEYS, 'DATE'))}")
        if header_dump:
            lines.append("all keyword names, primary: " + " ".join(sorted(hdul[0].header.keys())))
            lines.append("all keyword names, IMAGE:   " + " ".join(sorted(set(image.header.keys()))))
        flag_cards = [c for c in image.header.cards if c.keyword.startswith(("MP_", "FLAG", "BIT")) and c.keyword != "BITPIX"]
        if flag_cards:
            lines.append("possible flag-bit definitions: " + "; ".join(f"{c.keyword}={c.value}" for c in flag_cards[:20]))

        wcs = WCS(image.header).celestial
        data = np.asarray(image.data, dtype=float)
        if data.ndim > 2:
            data = data.reshape(data.shape[-2:])
        ny, nx = data.shape
        x, y = (float(v) for v in wcs.all_world2pix([[ra, dec]], 0)[0])
        lines.append(f"catalogue position RA {ra:.6f} Dec {dec:.6f} -> pixel x={x:.1f} y={y:.1f} (image is {nx} x {ny})")
        lines.append(f"wavelength at the target pixel (WCS-WAVE): {_wavelength_at(hdul, x, y)}")
        lines.append(f"wavelength at the image centre   (WCS-WAVE): {_wavelength_at(hdul, nx / 2, ny / 2)}")

        if not (0 <= x < nx and 0 <= y < ny):
            lines.append("the predicted position is OUTSIDE this cutout")
            return result
        background = float(np.nanmedian(data))
        sigma = float(1.4826 * np.nanmedian(np.abs(data - background)))
        x0, x1, y0, y1 = max(0, int(x) - 4), min(nx, int(x) + 5), max(0, int(y) - 4), min(ny, int(y) + 5)
        window = data[y0:y1, x0:x1]
        if not np.isfinite(window).any():
            lines.append("the pixels around the predicted position are all NaN")
            return result
        wy, wx = np.unravel_index(np.nanargmax(window), window.shape)
        px, py = int(wx) + x0, int(wy) + y0
        snr = (float(data[py, px]) - background) / sigma if sigma > 0 else float("nan")
        peak_sky = SkyCoord(*wcs.all_pix2world([[float(px), float(py)]], 0)[0], unit="deg")
        residual = peak_sky.separation(SkyCoord(ra * u.deg, dec * u.deg)).arcsec
        east = (peak_sky.ra.deg - ra) * 3600 * math.cos(math.radians(dec))
        north = (peak_sky.dec.deg - dec) * 3600
        scale = float(np.mean(proj_plane_pixel_scales(wcs)) * 3600)
        lines.append(f"brightest pixel within 4 px of it: x={px} y={py}, value {data[py, px]:.4g}, "
                     f"background {background:.4g}, noise {sigma:.3g} -> S/N about {snr:.1f}")
        lines.append(f"  offset from the catalogue position: {residual:.1f} arcsec (east {east:+.1f}, north {north:+.1f}) = {residual / scale:.2f} px")
        result.update(snr=snr, residual_arcsec=residual, east=east, north=north)
    return result


def backend_check(path: Path) -> list[str]:
    """Can the backend's own reader understand this file as it is?"""
    from spherex.query import read_frame_file
    try:
        frame = read_frame_file(path)
    except Exception as exc:  # noqa: BLE001
        return [f"backend read_frame_file: FAILED -> {type(exc).__name__}: {exc}",
                "  (this tells us exactly what to change in the CONFIG block of backend/spherex/query.py)"]
    return [f"backend read_frame_file: OK -> detector {frame.detector}, mjd {frame.mjd:.5f} ({frame.date_iso}), "
            f"wavelength {frame.wave_min_um:.3f}-{frame.wave_max_um:.3f} um, pixel scale {frame.pixel_scale_arcsec:.3f} arcsec, shape {frame.shape}"]


# ------------------------------------------------------------------ report + command line

class Report:
    """Prints everything and keeps it, so it can be saved and pasted into the chat."""

    def __init__(self):
        self.lines: list[str] = []

    def add(self, text: str = "") -> None:
        print(text)
        self.lines.append(text)

    def save(self, directory: Path) -> Path:
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"report_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.txt"
        path.write_text("\n".join(self.lines) + "\n", encoding="utf-8")
        return path


def mjd_to_date(mjd: float) -> str:
    return datetime.fromtimestamp((mjd - 40587) * 86400, tz=timezone.utc).strftime("%Y-%m-%d")


def search_one(report: Report, label: str, ra: float, dec: float, bandpass: str | None, schema: bool) -> list[dict] | None:
    report.add(f"\n=== SEARCH: {label}  RA {ra:.6f}  Dec {dec:.6f}" + (f"  band {bandpass}" if bandpass else ""))
    query = build_search_query(ra, dec, bandpass)
    report.add("ADQL: " + query)
    started = time.time()
    try:
        rows = tap_query(query)
    except TapError as exc:
        report.add(f"SEARCH FAILED after {time.time() - started:.0f} s: {exc}")
        report.add("Tables and column names can change between data releases; listing what the archive has now:")
        schema = True
        rows = None
    else:
        report.add(f"{len(rows)} image(s) found in {time.time() - started:.0f} s")
        if rows:
            report.add(f"first uri: {rows[0].get('uri')}")
            report.add("  band       images  passes  first date   last date")
            summary = summarize(rows)
            for s in summary:
                report.add(f"  {s['bandpass']:<10} {s['count']:>6}  {s['passes']:>6}  {mjd_to_date(s['first'])}   {mjd_to_date(s['last'])}")
            good = [s["bandpass"] for s in summary if s["passes"] >= 3]
            report.add("  -> Find movers can run on: " + (", ".join(good) if good else "no detector yet (needs >= 3 survey passes)"))
    if schema:
        for title, q in (("tables with 'spherex' in the name", TABLES_QUERY), ("columns of spherex.plane / spherex.artifact", SCHEMA_QUERY)):
            try:
                found = tap_query(q)
                report.add(f"{title}: " + "; ".join(", ".join(v for v in r.values() if v) for r in found))
            except TapError as exc:
                report.add(f"{title}: could not list ({exc})")
    return rows


def confirm(question: str, assume_yes: bool) -> bool:
    if assume_yes:
        return True
    if not sys.stdin or not sys.stdin.isatty():
        return False
    return input(question + " [y/N] ").strip().lower() in ("y", "yes", "da", "d")


def run_download(report: Report, target: dict, chosen: list[dict], args) -> None:
    max_bytes = args.max_mb * 1e6
    mid_year = year_of_mjd(sum(r["mjd"] for r in chosen) / len(chosen))
    c_ra, c_dec = position_at(target, mid_year)
    plan = [(r, cutout_url(r["uri"], c_ra, c_dec, args.size_arcmin), OUT_DIR / safe_name(r, i)) for i, r in enumerate(chosen, 1)]
    report.add(f"\n=== DOWNLOAD PLAN: {len(plan)} cutout(s) of {args.size_arcmin} arcmin centred on RA {c_ra:.6f} Dec {c_dec:.6f}, detector {_band(chosen[0])}")
    for row, url, _dest in plan:
        report.add(f"  {mjd_to_date(row['mjd'])} (MJD {row['mjd']:.3f})  {url}")
    report.add(f"  (each file is refused above {args.max_mb:.0f} MB; saved under backend/data/real/, which git ignores)")
    if not confirm(f"Download these {len(plan)} file(s) from irsa.ipac.caltech.edu?", args.yes):
        report.add("Not downloaded (no confirmation). Add --yes to skip the question.")
        return

    results = []
    for row, url, dest in plan:
        report.add(f"\n--- {dest.name}")
        outcome = download(url, dest, max_bytes=max_bytes)
        if not outcome["ok"]:
            report.add(f"DOWNLOAD FAILED: {outcome['error']}")
            continue
        report.add(f"downloaded {outcome['bytes'] / 1e6:.2f} MB in {outcome['seconds']:.1f} s (HTTP {outcome['status']}, {outcome['content_type']})")
        ra, dec = position_at(target, year_of_mjd(row["mjd"]))
        try:
            info = inspect_file(dest, ra, dec)
        except Exception as exc:  # noqa: BLE001 - keep going with the other files
            report.add(f"INSPECTION FAILED: {type(exc).__name__}: {exc}")
            continue
        for line in info["lines"] + backend_check(dest):
            report.add("  " + line)
        report.add(f"  TAP time for this image: MJD {row['mjd']:.5f}; header DATE: {info['date']!r}")
        results.append((row, info))

    if results:
        report.add("\n=== SUMMARY: where the object is, versus where the catalogue says")
        report.add("  date        S/N   offset(arcsec)  east   north")
        for row, info in results:
            if info["snr"] is None:
                report.add(f"  {mjd_to_date(row['mjd'])}  (not measured)")
            else:
                report.add(f"  {mjd_to_date(row['mjd'])}  {info['snr']:>5.1f}  {info['residual_arcsec']:>13.1f}  {info['east']:+6.1f}  {info['north']:+6.1f}")
        good = [i for _, i in results if i["snr"] is not None and i["snr"] >= 8]
        if len(good) >= 2 and all(i["residual_arcsec"] < 6.2 for i in good):
            report.add("  OK: the object sits within one pixel of its catalogue track on every date -> time, WCS and orientation agree.")
        elif good:
            report.add("  CHECK: offsets above one pixel (about 6 arcsec). Constant offset = WCS/centre; growing with time = time keyword or scale; mirrored = orientation.")
        else:
            report.add("  The object is not clearly visible (S/N < 8) in these cutouts, so the track check says nothing. A bright object (Barnard's Star) is the better test.")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", default="all", choices=[*TARGETS, "all"], help="test object (default: search all five)")
    ap.add_argument("--ra", type=float, help="own position in degrees (use with --dec; replaces --target)")
    ap.add_argument("--dec", type=float)
    ap.add_argument("--bandpass", help="only this detector, e.g. SPHEREx-D6")
    ap.add_argument("--download", type=int, default=0, metavar="N", help="download N cutouts of one detector (default 0 = search only)")
    ap.add_argument("--size-arcmin", type=float, default=DEFAULT_SIZE_ARCMIN)
    ap.add_argument("--max-mb", type=float, default=DEFAULT_MAX_MB, help="refuse files bigger than this")
    ap.add_argument("--yes", action="store_true", help="do not ask before downloading")
    ap.add_argument("--schema", action="store_true", help="also list the archive's SPHEREx tables and columns")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")

    report = Report()
    report.add(f"SPHEREx Blink real-data test, {datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    report.add(f"python {sys.version.split()[0]}; args: {' '.join(argv if argv is not None else sys.argv[1:]) or '(none)'}")
    try:
        import astropy
        report.add(f"astropy {astropy.__version__}")
    except ImportError:
        report.add("astropy is NOT installed in this Python (use backend/.venv)")

    if args.ra is not None or args.dec is not None:
        if args.ra is None or args.dec is None:
            ap.error("--ra and --dec go together")
        targets = {"custom": {"label": "custom position", "ra": args.ra, "dec": args.dec, "pmra": 0.0, "pmdec": 0.0}}
    elif args.target == "all":
        targets = TARGETS
    else:
        targets = {args.target: TARGETS[args.target]}
    if args.download and len(targets) != 1:
        ap.error("--download needs ONE object: add --target barnard (or --ra/--dec)")

    searched = {}
    for key, target in targets.items():
        ra, dec = position_at(target, SEARCH_YEAR)
        searched[key] = (target, search_one(report, target["label"], ra, dec, args.bandpass, args.schema))

    if args.download:
        ((_, (target, rows)),) = searched.items()
        if not rows:
            report.add("\nNothing to download (the search found no images).")
        else:
            run_download(report, target, pick_rows(rows, args.download, args.bandpass), args)

    report.add("\nWhat to do next: paste everything above (or the saved report file) into the chat.")
    saved = report.save(OUT_DIR)
    print(f"\nReport saved to {saved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
