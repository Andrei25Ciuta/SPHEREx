"""scripts/fetch_real_sample.py - the real-data test script. Everything here runs OFFLINE:
IRSA's answers are faked and the "downloaded" files are synthetic FITS files we build ourselves."""

from __future__ import annotations

import io
import re
import shutil
import urllib.error
from pathlib import Path

import astropy.units as u
import numpy as np
import pytest
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.time import Time

import fetch_real_sample as frs
from conftest import add_star, make_wcs

REPO = Path(__file__).resolve().parents[2]


# ------------------------------------------------------------------ helpers

class FakeResponse:
    """Just enough of an HTTP response for the script."""

    def __init__(self, body: bytes = b"", headers=None, status=200):
        self._body, self.status, self.headers = body, status, headers or {}
        self._pos = 0

    def read(self, n=-1):
        if n is None or n < 0:
            n = len(self._body)
        chunk = self._body[self._pos:self._pos + n]
        self._pos += len(chunk)
        return chunk

    def getcode(self):
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def opener_returning(response):
    calls = []

    def _open(request, timeout=None):
        calls.append(request)
        if isinstance(response, BaseException):
            raise response
        return response

    _open.calls = calls
    return _open


def http_error(code, body=b"server said no"):
    return urllib.error.HTTPError("https://example.invalid", code, "error", {}, io.BytesIO(body))


def make_epoch_file(path: Path, mjd: float, star_at_mjd: float | None = None, target="barnard", seed=0) -> Path:
    """A synthetic noisy cutout (rotated, off-centre) with a bright star where `target` was on `star_at_mjd`."""
    t = frs.TARGETS[target]
    ra, dec = frs.position_at(t, frs.year_of_mjd(mjd if star_at_mjd is None else star_at_mjd))
    cra, cdec = frs.position_at(t, frs.year_of_mjd(mjd))
    npix = 60
    wcs = make_wcs(cra + 0.0005, cdec - 0.0004, npix, rot_deg=30)
    img = np.random.default_rng(seed).normal(100.0, 1.0, (npix, npix)).astype(np.float32)
    x, y = wcs.all_world2pix([ra], [dec], 0)
    add_star(img, float(x[0]), float(y[0]), 2000.0)
    hdr = wcs.to_header()
    hdr["MJD-OBS"], hdr["DETECTOR"], hdr["BUNIT"] = mjd, 6, "MJy/sr"
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(img, hdr, name="IMAGE"),
                  fits.ImageHDU(np.zeros((npix, npix), np.int32), wcs.to_header(), name="FLAGS")]).writeto(path, overwrite=True)
    return path


ROWS = [  # what the archive would say: detector D6 seen on 3 survey passes
    {"uri": f"ibe/data/spherex/qr2/level2/plane{i}_D6.fits", "planeid": f"p{i}", "mjd": mjd, "bandpass": "SPHEREx-D6"}
    for i, mjd in enumerate([60800.1, 60801.8, 60980.5, 60982.0, 61165.3, 61166.9])
] + [{"uri": "ibe/data/spherex/qr2/level2/other_D2.fits", "planeid": "q1", "mjd": 60900.0, "bandpass": "SPHEREx-D2"}]


# ------------------------------------------------------------------ pure helpers

def test_the_target_list_agrees_with_the_frontend_list():
    text = (REPO / "frontend/js/targets.js").read_text(encoding="utf-8")
    pattern = re.compile(r'id: "(\w+)".*?\bra: ([-\d.]+), dec: ([-\d.]+),\s*pmra: ([-\d.]+), pmdec: ([-\d.]+)', re.S)
    in_js = {m[0]: tuple(float(v) for v in m[1:]) for m in pattern.findall(text)}
    assert set(in_js) == set(frs.TARGETS)
    for key, (ra, dec, pmra, pmdec) in in_js.items():
        t = frs.TARGETS[key]
        assert (t["ra"], t["dec"], t["pmra"], t["pmdec"]) == pytest.approx((ra, dec, pmra, pmdec))


@pytest.mark.filterwarnings("ignore:ERFA function")        # astropy notes that it overrides the distance: expected
def test_position_at_matches_astropys_space_motion():
    t = frs.TARGETS["wise0855"]
    ra, dec = frs.position_at(t, 2026.0)
    start = SkyCoord(ra=t["ra"] * u.deg, dec=t["dec"] * u.deg, pm_ra_cosdec=t["pmra"] * u.mas / u.yr, pm_dec=t["pmdec"] * u.mas / u.yr,
                     distance=1 * u.kpc, radial_velocity=0 * u.km / u.s, obstime=Time("J2000"), frame="icrs")
    expected = start.apply_space_motion(new_obstime=Time(2026.0, format="jyear"))
    assert SkyCoord(ra * u.deg, dec * u.deg).separation(expected).arcsec < 0.5


def test_search_query_is_irsas_tutorial_query():
    q = frs.build_search_query(133.8, -7.25)
    assert "FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid" in q
    assert "1 = CONTAINS(POINT('ICRS', 133.80000000, -7.25000000), p.poly)" in q
    assert q.endswith("ORDER BY p.time_bounds_lower")
    assert "energy_bandpassname =" not in q
    assert "AND p.energy_bandpassname = 'SPHEREx-D6'" in frs.build_search_query(1, 2, "SPHEREx-D6")


@pytest.mark.parametrize("bad", ["D6", "SPHEREx-D7", "SPHEREx-D1' OR 1=1 --", "", "sphEREx-D1"])
def test_a_bandpass_that_is_not_a_detector_name_is_refused(bad):
    with pytest.raises(ValueError):
        frs.build_search_query(1, 2, bad)


def test_csv_is_parsed_and_dates_become_numbers():
    rows = frs.parse_csv('uri,planeid,mjd,bandpass\n"ibe/a,b.fits",p1,60800.5,SPHEREx-D2\nibe/c.fits,p2,,SPHEREx-D2\n')
    assert rows[0]["uri"] == "ibe/a,b.fits" and rows[0]["mjd"] == 60800.5
    assert np.isnan(rows[1]["mjd"])


def test_summary_counts_images_and_survey_passes_per_detector():
    summary = {s["bandpass"]: s for s in frs.summarize(ROWS)}
    assert summary["SPHEREx-D6"]["count"] == 6 and summary["SPHEREx-D6"]["passes"] == 3
    assert summary["SPHEREx-D2"]["passes"] == 1
    assert [s["bandpass"] for s in frs.summarize(ROWS)] == ["SPHEREx-D2", "SPHEREx-D6"]       # natural detector order


def test_pick_rows_takes_one_detector_spread_over_time():
    picked = frs.pick_rows(ROWS, 3)
    assert {r["bandpass"] for r in picked} == {"SPHEREx-D6"}                                   # the detector with most passes
    assert [r["mjd"] for r in picked][0] == 60800.1 and [r["mjd"] for r in picked][-1] == 61166.9
    assert len(frs.pick_rows(ROWS, 1)) == 1 and len(frs.pick_rows(ROWS, 99)) == 6
    assert {r["bandpass"] for r in frs.pick_rows(ROWS, 5, "SPHEREx-D2")} == {"SPHEREx-D2"}
    assert frs.pick_rows([], 3) == []


def test_cutout_url_follows_the_tutorial_form():
    url = frs.cutout_url("ibe/data/spherex/x.fits", 133.8, -7.25, 5.0)
    assert url == "https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits?center=133.80000000,-7.25000000d&size=0.083333"
    assert frs.cutout_url("/ibe/y.fits", 1, 2, 3).startswith("https://irsa.ipac.caltech.edu/ibe/y.fits?")
    assert frs.cutout_url("https://other.example/z.fits", 1, 2, 3).startswith("https://other.example/z.fits?center=")


def test_file_names_are_safe():
    name = frs.safe_name({"bandpass": "SPHEREx-D6/../x y", "mjd": 60800.12345}, 2)
    assert name == "spherex_SPHEREx-D6____x_y_60800.123_2.fits"          # every "/", "." and " " became "_"
    assert "/" not in name and " " not in name


# ------------------------------------------------------------------ network (faked)

def test_tap_query_sends_a_csv_request_and_parses_the_answer():
    csv_text = b"uri,planeid,mjd,bandpass\nibe/a.fits,p1,60800.5,SPHEREx-D2\n"
    opener = opener_returning(FakeResponse(csv_text))
    rows = frs.tap_query("SELECT 1", opener=opener)
    assert rows == [{"uri": "ibe/a.fits", "planeid": "p1", "mjd": 60800.5, "bandpass": "SPHEREx-D2"}]
    request = opener.calls[0]
    assert request.full_url.startswith("https://irsa.ipac.caltech.edu/TAP/sync?")
    assert "FORMAT=csv" in request.full_url and "QUERY=SELECT+1" in request.full_url and "LANG=ADQL" in request.full_url
    assert request.get_header("User-agent").startswith("SPHEREx-Blink")


def test_tap_errors_become_readable_messages():
    with pytest.raises(frs.TapError, match="HTTP 400.*server said no"):
        frs.tap_query("x", opener=opener_returning(http_error(400)))
    with pytest.raises(frs.TapError, match="could not reach"):
        frs.tap_query("x", opener=opener_returning(TimeoutError("timed out")))
    votable = b'<?xml version="1.0"?><VOTABLE><INFO name="QUERY_STATUS" value="ERROR">Table spherex.plane not found</INFO></VOTABLE>'
    with pytest.raises(frs.TapError, match="Table spherex.plane not found"):
        frs.tap_query("x", opener=opener_returning(FakeResponse(votable)))


def test_a_downloaded_fits_file_is_saved(tmp_path):
    dest = tmp_path / "sub" / "a.fits"
    body = b"SIMPLE  =                    T" + b" " * 100
    result = frs.download("https://x/a.fits", dest, max_bytes=1e6, opener=opener_returning(FakeResponse(body, {"Content-Type": "application/fits"})))
    assert result["ok"] and result["bytes"] == len(body) and dest.read_bytes() == body
    assert not list(tmp_path.rglob("*.part"))


def test_an_html_error_page_is_not_saved_as_fits(tmp_path):
    dest = tmp_path / "a.fits"
    result = frs.download("https://x", dest, max_bytes=1e6, opener=opener_returning(FakeResponse(b"<html>Service unavailable</html>")))
    assert not result["ok"] and "not a FITS file" in result["error"] and "Service unavailable" in result["error"]
    assert not dest.exists()


def test_files_over_the_limit_are_refused_before_and_while_downloading(tmp_path):
    dest = tmp_path / "big.fits"
    declared = frs.download("https://x", dest, max_bytes=1000, opener=opener_returning(FakeResponse(b"SIMPLE", {"Content-Length": "5000000"})))
    assert not declared["ok"] and "over the" in declared["error"]
    streamed = frs.download("https://x", dest, max_bytes=1000, opener=opener_returning(FakeResponse(b"SIMPLE" + b"0" * 5000)))
    assert not streamed["ok"] and "stopped" in streamed["error"]
    assert not dest.exists()


def test_download_failures_are_reported_not_raised(tmp_path):
    no_overlap = frs.download("https://x", tmp_path / "a.fits", max_bytes=1e6, opener=opener_returning(http_error(500, b"no overlap")))
    assert not no_overlap["ok"] and "HTTP 500" in no_overlap["error"] and "no overlap" in no_overlap["error"]
    offline = frs.download("https://x", tmp_path / "a.fits", max_bytes=1e6, opener=opener_returning(OSError("connection reset")))
    assert not offline["ok"] and "network error" in offline["error"]


# ------------------------------------------------------------------ inspecting a file

def test_inspect_finds_the_star_where_the_catalogue_says(tmp_path):
    path = make_epoch_file(tmp_path / "e1.fits", 60800.1)
    ra, dec = frs.position_at(frs.TARGETS["barnard"], frs.year_of_mjd(60800.1))
    info = frs.inspect_file(path, ra, dec)
    assert info["snr"] > 50 and info["residual_arcsec"] < 6.2                      # within one pixel
    text = "\n".join(info["lines"])
    assert "IMAGE is HDU 1 (by name)" in text and "FLAGS is HDU 2" in text and "celestial WCS OK" in text
    assert info["date"] is None


def test_inspect_says_so_when_the_position_is_outside_the_cutout(tmp_path):
    path = make_epoch_file(tmp_path / "e1.fits", 60800.1)
    info = frs.inspect_file(path, 10.0, -50.0)
    assert any("OUTSIDE" in line for line in info["lines"]) and info["snr"] is None


def test_the_backend_check_reports_ok_or_what_is_missing(write_frame):
    good, _ = write_frame()
    assert frs.backend_check(good)[0].startswith("backend read_frame_file: OK")
    bad, _ = write_frame(time_keyword=False, name="no_time.fits")
    failed = frs.backend_check(bad)
    assert failed[0].startswith("backend read_frame_file: FAILED") and "no time keyword" in failed[0]


# ------------------------------------------------------------------ the whole command, offline

@pytest.fixture
def offline(monkeypatch, tmp_path):
    """No network, no real output folder: IRSA answers with ROWS, 'downloads' copy prepared files."""
    monkeypatch.setattr(frs, "OUT_DIR", tmp_path / "out")
    monkeypatch.setattr(frs, "tap_query", lambda query, **kw: [dict(r) for r in ROWS])
    state = {"files": [], "downloads": 0}

    def fake_download(url, dest, *, max_bytes, **kw):
        state["downloads"] += 1
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(state["files"].pop(0), dest)
        return {"ok": True, "status": 200, "bytes": dest.stat().st_size, "seconds": 0.1, "path": dest, "content_type": "application/fits"}

    monkeypatch.setattr(frs, "download", fake_download)
    return state


def test_search_only_downloads_nothing_and_saves_a_report(offline, tmp_path, capsys):
    assert frs.main(["--target", "barnard"]) == 0
    out = capsys.readouterr().out
    assert offline["downloads"] == 0
    assert "SPHEREx-D6" in out and "Find movers can run on: SPHEREx-D6" in out
    reports = list((tmp_path / "out").glob("report_*.txt"))
    assert len(reports) == 1 and "Barnard's Star" in reports[0].read_text(encoding="utf-8")


def test_search_of_all_targets_lists_each_one(offline, capsys):
    frs.main([])
    out = capsys.readouterr().out
    for t in frs.TARGETS.values():
        assert f"=== SEARCH: {t['label']}" in out


def test_download_asks_first_and_does_nothing_without_an_answer(offline, capsys):
    frs.main(["--target", "barnard", "--download", "2"])          # under pytest stdin is not a terminal: no answer = no
    out = capsys.readouterr().out
    assert offline["downloads"] == 0 and "Not downloaded" in out and "DOWNLOAD PLAN: 2 cutout(s)" in out


def test_download_needs_one_object():
    with pytest.raises(SystemExit):
        frs.main(["--download", "1"])


def test_a_consistent_two_epoch_download_reports_ok(offline, tmp_path, capsys):
    offline["files"] = [make_epoch_file(tmp_path / "in1.fits", 60800.1, seed=1), make_epoch_file(tmp_path / "in2.fits", 61166.9, seed=2)]
    frs.main(["--target", "barnard", "--download", "2", "--yes"])
    out = capsys.readouterr().out
    assert offline["downloads"] == 2
    assert "=== SUMMARY" in out and "OK: the object sits within one pixel" in out
    assert "backend read_frame_file: OK" in out
    assert len(list((tmp_path / "out").glob("report_*.txt"))) == 1


def test_a_motion_the_catalogue_does_not_explain_is_flagged(offline, tmp_path, capsys):
    # the second file shows the star where Barnard's Star was a year EARLIER: 10 arcsec off the catalogue track
    offline["files"] = [make_epoch_file(tmp_path / "in1.fits", 60800.1, seed=1),
                        make_epoch_file(tmp_path / "in2.fits", 61166.9, star_at_mjd=60800.1, seed=2)]
    frs.main(["--target", "barnard", "--download", "2", "--yes"])
    out = capsys.readouterr().out
    assert "CHECK: offsets above one pixel" in out and "OK: the object sits" not in out


def test_a_failed_search_lists_the_archive_tables_instead_of_crashing(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(frs, "OUT_DIR", tmp_path / "out")

    def failing(query, **kw):
        if "TAP_SCHEMA" in query:
            return [{"table_name": "spherex.plane_renamed"}]
        raise frs.TapError("HTTP 400 from the TAP service: unknown table spherex.artifact")

    monkeypatch.setattr(frs, "tap_query", failing)
    assert frs.main(["--target", "barnard"]) == 0
    out = capsys.readouterr().out
    assert "SEARCH FAILED" in out and "unknown table" in out and "spherex.plane_renamed" in out
