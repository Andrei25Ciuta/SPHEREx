# Data checklist – what to verify on REAL SPHEREx files

Run on every new kind of file (from `backend/`):

```bash
.venv\Scripts\python.exe scripts\inspect_fits.py data\real\<file>.fits
```

Everything below marked **ASSUMPTION** is what the backend currently expects. If the real
file says otherwise, change the CONFIG block in `backend/spherex/query.py` (one place).

## 1. HDU layout
- [ ] Science image is in HDU 1, `EXTNAME = IMAGE`? (**ASSUMPTION**; code tries EXTNAME, then index)
- [ ] Flag bitmask is in HDU 2, `EXTNAME = FLAGS`? (**ASSUMPTION**)
- [ ] Other HDUs (variance, zodi, PSF, wavelength WCS…)? Note names – useful for stretch features.
- [ ] Image shape (expect 2040×2040?) and dtype.

## 2. Celestial WCS
- [ ] `inspect_fits.py` prints "celestial WCS OK"?
- [ ] Real pixel scale (expect ~6.2″/px). The backend reads it from the WCS – never hardcoded.
- [ ] SIP distortion present? (`all_world2pix` handles it; just note it.)
- [ ] Sanity: a known star (e.g. from SIMBAD) lands on a bright pixel in the cutout.

## 3. Time
- [ ] Which keyword holds the observation time? Candidates tried now: `MJD-OBS, MJD-AVG, MJD_AVG, MJD-MID, MJDMID, MJD-BEG, MJD`, then `DATE-OBS, DATE-AVG, DATE-BEG`.
- [ ] Is it start, middle or end of exposure? Time scale (UTC/TDB/TT)? Matters only for very fast movers.
- [ ] Compare with `t_min` from the archive search (you saw 60800.7 for WISE 0855).

## 4. Detector
- [ ] Keyword name for the detector (tried: `DETECTOR, DETNUM, DET, ARRAY`) and its value format.
- [ ] Matches `energy_bandpassname` in the archive? Code normalizes `1`, `D1`, `SPHEREx-D1` → `D1`.
- [ ] Are there really 6 detectors, observed in pairs (D1+D4? D2+D5, D3+D6)?

## 5. Wavelength  ⚠ important
- [ ] SPHEREx uses linear variable filters: the wavelength **changes across the detector**.
      The frame's real wavelength is the one **at the cutout position**, not one per file.
- [ ] Is there a wavelength WCS / lookup HDU? If yes, compute λ at the target pixel (step 8).
- [ ] Until then: header `WAVEMIN/WAVEMAX` (invented names) or the nominal table
      `NOMINAL_WAVE_UM` in `query.py` (**ASSUMPTION**, rough).

## 6. Units and values
- [ ] `BUNIT` (MJy/sr?). NaNs for bad pixels? Typical background level?
- [ ] Is zodiacal light already subtracted? (The stretch subtracts a median per frame anyway.)

## 7. Flags
- [ ] Bit definitions (header cards like `MP_*` / `FLAG*`, or docs). `inspect_fits.py` lists them.
- [ ] Which bits mean "don't trust this pixel"? Right now **any** nonzero bit counts as flagged → `fractionFlagged` is pessimistic.

## 8. Access (step 8 – do not guess URLs)
- [ ] IRSA access method: SIA v2 / TAP / cutout service? Confirm in IRSA docs / challenge Resources tab.
- [ ] Can IRSA return cutouts server-side (avoid downloading full 2040² files)?
- [ ] Rate limits / file sizes → cache policy.

## Known behaviour of the backend (step 7)
- Every frame is resampled (nearest neighbour) onto one **north-up, east-left** grid at the median pixel scale → stars stay still even if exposures are rotated. Verified on fake data: frame-to-frame correlation ≈0.81, synthetic mover shifts the expected 5 px / 10 px.
- Frames with < 50 % valid pixels in the cutout are dropped (edge hits).
- One shared asinh stretch per detector (after per-frame median subtraction), so brightness is comparable within a blink.

## Added with the stretch features
- [ ] **Photometry** (`/api/photometry`): aperture radius 2 px, background ring 4–7 px. Check against a known star that the numbers are stable between frames of the same detector; units are BUNIT × pixels (not calibrated).
- [ ] **Flag masks**: right now every nonzero bit is drawn red. Decide which bits to show.
- [ ] **Difference mode** uses frames > 30 days away as reference. Check the real SPHEREx cadence (gaps between passes) still fits this.
- [ ] Sky map surveys come from IRSA's HiPS copies through `/api/hips` (allowlist in `backend/spherex/hips_proxy.py`). If IRSA ever publishes a SPHEREx HiPS, add it there (verify the URL in https://irsa.ipac.caltech.edu/data/hips/list first).
