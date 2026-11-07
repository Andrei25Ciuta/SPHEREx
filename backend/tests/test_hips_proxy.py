"""spherex.hips_proxy: the sky-tile relay must NOT be an open proxy.

Only three IRSA surveys may be relayed, and only plain file-name paths.
"""

from __future__ import annotations

import urllib.error

import pytest

from spherex import hips_proxy as hp

TILE = "CDS/2MASS/Color/Norder3/Dir0/Npix123.jpg"


class FakeResponse:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def fake_urlopen(monkeypatch, *outcomes):
    """Replace urlopen: each call returns/raises the next outcome. Returns the list of requests made."""
    calls, queue = [], list(outcomes)

    def _urlopen(request, timeout=None):
        calls.append(request)
        outcome = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)

    monkeypatch.setattr(hp.urllib.request, "urlopen", _urlopen)
    return calls


def http_error(code):
    return urllib.error.HTTPError("https://example.invalid", code, "error", {}, None)


def test_an_allowed_survey_maps_to_the_irsa_url_and_a_cache_file():
    url, cached = hp.resolve(TILE)
    assert url == "https://irsa.ipac.caltech.edu/data/hips/" + TILE
    assert cached == hp.HIPS_CACHE / "CDS/2MASS/Color" / "Norder3/Dir0/Npix123.jpg"


def test_a_bare_survey_path_means_its_properties_file():
    url, _ = hp.resolve("CDS/DSS2/color")
    assert url.endswith("/CDS/DSS2/color/properties")


@pytest.mark.parametrize("path", [
    "../etc/passwd",
    "CDS/2MASS/Color/../../secret",
    "/CDS/2MASS/Color/properties",                 # absolute path
    "CDS/2MASS/Color/%2e%2e/x",                    # percent-encoded ".."
    "CDS/2MASS/Color/properties?x=1",              # query string
    "CDS\\2MASS\\Color",                           # backslashes
    "CDS/2MASS/ColorEvil/properties",              # prefix of an allowed name, but another survey
    "CDS/2MASS",
    "CDS/Other/Color/properties",                  # a survey that is not in the allowlist
    "http://evil.example/x",
    "",
])
def test_bad_or_unlisted_paths_are_refused(path):
    with pytest.raises(hp.NotAllowed):
        hp.resolve(path)


def test_a_cached_tile_is_served_without_the_network(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    cached = tmp_path / "CDS/2MASS/Color" / "Norder3/Dir0/Npix123.jpg"
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"JPEGDATA")
    calls = fake_urlopen(monkeypatch, AssertionError("the network must not be used"))
    assert hp.fetch(TILE) == (b"JPEGDATA", "image/jpeg")
    assert calls == []


def test_a_downloaded_tile_is_cached_and_the_request_names_us(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, b"PNG!")
    assert hp.fetch("CDS/DSS2/color/Norder3/Dir0/Npix2.png") == (b"PNG!", "image/png")
    assert hp.fetch("CDS/DSS2/color/Norder3/Dir0/Npix2.png") == (b"PNG!", "image/png")
    assert len(calls) == 1                                                   # second time: from the cache
    assert calls[0].get_header("User-agent").startswith("SPHEREx-Blink")


def test_a_missing_tile_is_file_not_found_and_is_not_retried(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, http_error(404))
    with pytest.raises(FileNotFoundError):
        hp.fetch(TILE)
    assert len(calls) == 1


def test_server_errors_are_retried_once(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, http_error(503))
    with pytest.raises(urllib.error.HTTPError):
        hp.fetch(TILE)
    assert len(calls) == 2


def test_a_retry_that_works_returns_the_tile(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, http_error(503), b"OK")
    assert hp.fetch(TILE)[0] == b"OK"
    assert len(calls) == 2


def test_client_errors_are_not_retried(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, http_error(403))
    with pytest.raises(urllib.error.HTTPError):
        hp.fetch(TILE)
    assert len(calls) == 1


def test_network_failures_are_retried_once_then_reported(tmp_path, monkeypatch):
    monkeypatch.setattr(hp, "HIPS_CACHE", tmp_path)
    calls = fake_urlopen(monkeypatch, TimeoutError("timed out"))
    with pytest.raises(OSError):
        hp.fetch(TILE)
    assert len(calls) == 2
    assert not any(tmp_path.rglob("*.jpg"))                                  # nothing half-written in the cache
