"""Inspect a (real) SPHEREx FITS file and print what the backend needs to know.

Usage (from the backend/ folder):
    .venv\\Scripts\\python.exe scripts\\inspect_fits.py path\\to\\file.fits
    .venv\\Scripts\\python.exe scripts\\inspect_fits.py path\\to\\file.fits --all-headers

It answers the open questions from docs/DATA_CHECKLIST.md:
  * Which HDUs exist (EXTNAME, shape, dtype)? Is science in HDU 1 and FLAGS in HDU 2?
  * Is there a valid celestial WCS? What is the real pixel scale?
  * Which header keywords hold time (MJD), detector and wavelength?
  * What are the units (BUNIT)?
"""

import argparse
import sys
import warnings

import numpy as np
from astropy.io import fits
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales

# Keywords we hope to find – the exact names in real SPHEREx files are NOT known yet.
# Anything matching these fragments is printed so we can pick the right ones.
INTERESTING = ("MJD", "DATE", "TIME", "EXPT", "DETEC", "DET", "BAND", "WAVE", "LAM",
               "BUNIT", "FILTER", "CHAN", "OBS", "TELESC", "INSTR", "LEVEL", "VERSION")


def describe_wcs(header):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", AstropyWarning)
        try:
            wcs = WCS(header)
        except Exception as exc:  # noqa: BLE001 – we want to report anything
            return f"WCS could not be built: {exc}"
    if not wcs.has_celestial:
        return f"no celestial WCS (ctype={list(wcs.wcs.ctype)})"
    cel = wcs.celestial
    scales = proj_plane_pixel_scales(cel) * 3600  # deg -> arcsec
    return (f"celestial WCS OK  ctype={list(cel.wcs.ctype)}  "
            f"pixel scale = {scales[0]:.3f}\" x {scales[1]:.3f}\"/px  "
            f"distortion(SIP)={cel.sip is not None}")


def describe_data(hdu):
    data = hdu.data
    if data is None:
        return "no data"
    info = f"shape={data.shape} dtype={data.dtype}"
    if data.dtype.kind in "fiu" and data.size:
        finite = np.isfinite(data) if data.dtype.kind == "f" else np.ones(data.shape, bool)
        vals = data[finite]
        if vals.size:
            info += (f"  finite={finite.mean():.1%}  min={vals.min():.4g}  "
                     f"median={np.median(vals):.4g}  max={vals.max():.4g}")
        if data.dtype.kind in "iu":
            nonzero = np.count_nonzero(data)
            info += f"  nonzero={nonzero / data.size:.1%}"
            if nonzero:
                bits = np.bitwise_or.reduce(data[data != 0].astype(np.int64).ravel())
                set_bits = [b for b in range(64) if bits >> b & 1]
                info += f"  bits used={set_bits}"
    return info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("path")
    ap.add_argument("--all-headers", action="store_true", help="print every header card")
    args = ap.parse_args()

    with fits.open(args.path, memmap=True) as hdul:
        print(f"File: {args.path}")
        print(f"{len(hdul)} HDU(s)\n")
        for i, hdu in enumerate(hdul):
            name = hdu.header.get("EXTNAME", "(no EXTNAME)")
            print(f"=== HDU {i}: {name}  [{type(hdu).__name__}]")
            if isinstance(hdu, (fits.ImageHDU, fits.PrimaryHDU, fits.CompImageHDU)):
                print("  data :", describe_data(hdu))
                if hdu.header.get("NAXIS", 0) >= 2:
                    print("  wcs  :", describe_wcs(hdu.header))
            elif isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)):
                print(f"  table: {len(hdu.data)} rows, columns={hdu.columns.names}")

            cards = hdu.header.cards if args.all_headers else [
                c for c in hdu.header.cards if any(k in c.keyword for k in INTERESTING)]
            if cards:
                print("  header" + (" (all)" if args.all_headers else " (interesting keywords)") + ":")
                for c in cards:
                    print(f"    {c.keyword:<10} = {str(c.value)[:60]:<60} / {c.comment[:50]}")
            print()

        # Flag-bit definitions are often stored as header cards (e.g. MP_xxx / FLAGxx).
        for hdu in hdul:
            defs = [c for c in hdu.header.cards
                    if c.keyword.startswith(("MP_", "FLAG", "BIT")) and c.keyword != "BITPIX"]
            if defs:
                print(f"Possible flag-bit definitions in {hdu.header.get('EXTNAME', '?')}:")
                for c in defs:
                    print(f"    {c.keyword:<10} = {c.value}  / {c.comment}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
