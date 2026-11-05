"""Write FAKE SPHEREx-like FITS files so the backend can be built before we have real ones.

    .venv\\Scripts\\python.exe scripts\\make_test_fits.py            # -> backend/data/fake/*.fits

EVERYTHING in these files is invented. The layout copies only our ASSUMPTIONS:
  HDU 0  empty primary
  HDU 1  EXTNAME=IMAGE  float32, celestial TAN WCS, ~6.2"/px    (ASSUMPTION)
  HDU 2  EXTNAME=FLAGS  int32 bitmask, same WCS                 (ASSUMPTION)
  header keywords MJD-OBS, DATE-OBS, DETECTOR, WAVEMIN, WAVEMAX  (INVENTED names)
Real keyword names come from scripts/inspect_fits.py on a real file (see docs/DATA_CHECKLIST.md).

To exercise the hard parts of the pipeline, each fake exposure has a slightly different
pointing AND a different sky rotation, and one source near WISE 0855 moves
(EXAGGERATED: 60"/yr instead of the real ~8"/yr, so it is obvious in a test blink).
"""

from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS

OUT = Path(__file__).resolve().parents[1] / "data" / "fake"

CENTER_RA, CENTER_DEC = 133.7951, -7.2451     # around WISE 0855 (epoch ~2025)
NPIX = 400                                    # real SPHEREx arrays are 2040x2040; small = fast
PIX_DEG = 6.2 / 3600                          # ASSUMPTION ~6.2"/px
DETECTOR_PAIRS = [(1, 4), (2, 5), (3, 6)]     # observed together (ASSUMPTION for 1+4)
WAVE_UM = {1: (0.75, 1.09), 2: (1.10, 1.62), 3: (1.63, 2.41),
           4: (2.42, 3.82), 5: (3.83, 4.41), 6: (4.42, 5.00)}   # ASSUMPTION
FIRST_MJD = 60800.7
N_EPOCHS = 9                                  # -> each detector gets 3 epochs
MOVER_ARCSEC_PER_YR = (-60.0, 6.0)            # EXAGGERATED proper motion (RA*cosDec, Dec)

rng = np.random.default_rng(42)
N_STARS = 600
# Fixed "sky": star positions spread over a field larger than one exposure.
star_ra = CENTER_RA + rng.uniform(-0.45, 0.45, N_STARS) / np.cos(np.radians(CENTER_DEC))
star_dec = CENTER_DEC + rng.uniform(-0.45, 0.45, N_STARS)
star_flux = 10 ** rng.uniform(1.3, 3.2, N_STARS)


def make_wcs(ra0, dec0, rot_deg):
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra0, dec0]
    w.wcs.crpix = [NPIX / 2 + 0.5, NPIX / 2 + 0.5]
    c, s = np.cos(np.radians(rot_deg)), np.sin(np.radians(rot_deg))
    w.wcs.cd = PIX_DEG * np.array([[-c, s], [s, c]])   # RA increases to the left
    return w


def render(wcs, ras, decs, fluxes, sigma=0.9):
    img = rng.normal(100.0, 1.0, (NPIX, NPIX)).astype(np.float32)   # background + noise
    x, y = wcs.all_world2pix(ras, decs, 0)
    yy, xx = np.mgrid[0:NPIX, 0:NPIX]
    for xi, yi, f in zip(x, y, fluxes):
        if -5 < xi < NPIX + 5 and -5 < yi < NPIX + 5:
            x0, x1 = int(max(xi - 5, 0)), int(min(xi + 6, NPIX))
            y0, y1 = int(max(yi - 5, 0)), int(min(yi + 6, NPIX))
            sub = (slice(y0, y1), slice(x0, x1))
            img[sub] += f / (2 * np.pi * sigma**2) * np.exp(
                -((xx[sub] - xi) ** 2 + (yy[sub] - yi) ** 2) / (2 * sigma**2))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.fits"):
        old.unlink()
    for e in range(N_EPOCHS):
        # Survey-like cadence: 3 visit groups ~6 months apart, a few days within each group.
        mjd = FIRST_MJD + (e // 3) * 182.6 + (e % 3) * 2.3
        years = (mjd - FIRST_MJD) / 365.25
        mover_ra = CENTER_RA + MOVER_ARCSEC_PER_YR[0] * years / 3600 / np.cos(np.radians(CENTER_DEC))
        mover_dec = CENTER_DEC + MOVER_ARCSEC_PER_YR[1] * years / 3600
        ras = np.append(star_ra, mover_ra)
        decs = np.append(star_dec, mover_dec)

        for det in DETECTOR_PAIRS[e % 3]:
            # Brightness depends on wavelength: the brown dwarf is much brighter at long wavelengths.
            mover_flux = 300.0 if det >= 4 else 40.0
            wcs = make_wcs(CENTER_RA + rng.uniform(-0.05, 0.05), CENTER_DEC + rng.uniform(-0.05, 0.05),
                           rot_deg=rng.uniform(0, 360))
            img = render(wcs, ras, decs, np.append(star_flux, mover_flux))
            flags = np.zeros(img.shape, np.int32)
            flags[rng.random(img.shape) < 0.002] = 1          # sparse "hot pixels"
            flags[:, :3] |= 2                                  # edge
            img[flags & 1 > 0] = np.nan

            hdr = wcs.to_header()
            t = Time(mjd, format="mjd")
            hdr["MJD-OBS"] = (mjd, "FAKE: mid-exposure MJD")
            hdr["DATE-OBS"] = (t.isot, "FAKE")
            hdr["DETECTOR"] = (det, "FAKE: detector number 1-6")
            hdr["WAVEMIN"] = (WAVE_UM[det][0], "[um] FAKE")
            hdr["WAVEMAX"] = (WAVE_UM[det][1], "[um] FAKE")
            hdr["BUNIT"] = ("MJy/sr", "FAKE")
            hdr["COMMENT"] = "SYNTHETIC TEST FILE - NOT SPHEREx DATA"

            hdul = fits.HDUList([
                fits.PrimaryHDU(),
                fits.ImageHDU(img, hdr, name="IMAGE"),
                fits.ImageHDU(flags, wcs.to_header(), name="FLAGS"),
            ])
            name = OUT / f"fake_e{e:02d}_D{det}.fits"
            hdul.writeto(name, overwrite=True)
            print("wrote", name.name, f"mjd={mjd:.2f}")


if __name__ == "__main__":
    main()
