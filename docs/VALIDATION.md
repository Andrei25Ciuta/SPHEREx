# Validation: what was tested on real SPHEREx data, and what was not

Measured on **7 November 2026**, on this project's own machine. Everything below can be re-run with the commands
shown. The real images are **not** in this repository (not published: the licence and terms of use of the data have
not been checked, see [CREDITS.md](../CREDITS.md)); they live in `backend/data/real/`, which git ignores.

**One line:** with no hint about the target, *Find movers* recovered both fast-moving objects it was pointed at
(Barnard's Star and Epsilon Indi B) in all **4 of 4** runs on real SPHEREx pixels; in three of the four the measured
motion is within 0.6 ″/yr of the catalogue, for Barnard in detector D2 (strongly saturated core) it is 3.7 ″/yr off and
we do not yet know why. **One run first produced 3 false candidates**; the rule was tightened afterwards (section 2),
so that run is no longer an independent test. The known-asteroid check has one **positive** real detection (section 6,
a single image). The colour hint was tried on a real brown dwarf and gave "neutral", not a classification (section 3).
The Planet X (parallax) mode has **not** been run on real images (section 5).

## 1. The data

| Field | Detector | Images | Survey passes | Dates | Cutout |
|---|---|---|---|---|---|
| Barnard's Star (RA 269.4462, Dec +4.769) | D2 (1.1-1.6 µm) | 15 | 4 | 2025-08-21 to 2026-09-22 | 5′, 49 × 49 px of 6.14″ |
| Barnard's Star | D6 (4.2-5.1 µm) | 6 | 3 | 2025-08-15 to 2026-08-20 | same |
| Epsilon Indi B (RA 331.0965, Dec −56.8006) | D2 | 11 | 5 | 2025-04-26 to 2026-10-02 | same |
| Epsilon Indi B | D6 | 6 | 4 | 2025-04-29 to 2026-09-28 | same |
| (RA 296.40882, Dec −24.04831) | D2 | 1 | 1 | 2026-04-20 | same; centred on the asteroid Arosa (section 6) |

Cutouts come from IRSA's server-side cutout service (`backend/scripts/fetch_real_sample.py`, which asks before
downloading unless told `--yes`). The backend serves each cutout both as a picture and as **real float32 pixel values** (`dataUrl`), so the
detector works on the calibrated numbers, not on an 8-bit picture. Total on disk: 39 files, 177 MB.

## 2. Blind test of *Find movers*

`node scratch/validate_real.mjs --api http://localhost:8001 --ra 269.4462 --dec 4.769 --fov 5 --det D6`

The detector is **not told** what to look for. Afterwards its candidates are compared with SIMBAD (proper motions in
arcsec/yr: RA × cos Dec, Dec).

| Field, detector | Candidates found | Catalogue match | Catalogue motion | Measured motion | Difference | Seen in | Significance |
|---|---|---|---|---|---|---|---|
| Barnard, D6 | 1 | Barnard's Star | (−0.80, +10.36) | (−0.25, +10.43) | **0.55 ″/yr** | 6 of 6 | 11 σ |
| Barnard, D2 | 1 | Barnard's Star | (−0.80, +10.36) | (−4.42, +11.21) | **3.72 ″/yr** | 15 of 15 | 13 σ |
| Epsilon Indi B, D2 | 1 | Epsilon Indi B | (+3.98, −2.47) | (+3.45, −2.15) | **0.61 ″/yr** | 11 of 11 | 8 σ |
| Epsilon Indi B, D6 | 1 (after the rule change below) | Epsilon Indi B | (+3.98, −2.47) | (+3.53, −2.76) | **0.54 ″/yr** | 6 of 6 | 7 σ |

- **Recovered 4 of 4** runs (every field has exactly one catalogued fast mover); **0 candidates without a catalogue match** with the final rule.
- 0.54-0.61 ″/yr is about 0.1 pixel per year, below the 0.15 px the detector assumes as the best precision of one
  centroid.
- **A failure, and the change it caused.** The first run on Epsilon Indi B in D6 (6 images, about 9 dots each) listed
  Epsilon Indi B **and 3 false candidates**: lines of 60-85 ″/yr through dots of only 3 of the 6 images. With so few
  images and so many dots, three chance matches are likely. The rule "a line needs dots in at least half of the
  images" became "at least 60 %" (4 of 6; `minDetectionFraction` in `movers.js`). The other three real runs and the
  synthetic checks in `scratch/test_movers.mjs` are unchanged (mock sky: 35 of 39 planted movers found, 0 false), and
  a new check covers the 3-of-6 case. **Because the rule was changed after seeing this failure, this D6 run is no
  longer an independent test of it**; a new field would be needed for that.
- Two changes were made because of what the real images showed: **float pixels** (an 8-bit picture turns a bright star
  into a flat-topped blob whose centre jumps) and **image registration** (every exposure has its own pointing
  error, up to about 0.7 px between passes, which over a one-year baseline looks like a motion of several
  arcsec/yr). Both are covered by synthetic tests (`scratch/test_movers.mjs`), not only by these three fields.

### Open problem: Barnard in D2 is 3.7 ″/yr off in RA

The star is so bright that on every one of the 21 images (D2 and D6) its core pixels carry the FLAGS bits 0
(transient), 1 (overflow) and 2 (SUR error): peak 580-1980 MJy/sr; in the central 5 × 5 pixels bit 0 is set in
48-84 % of them in D2 and 24-40 % in D6, bit 2 in 44-96 % (D2) and 16-24 % (D6), bit 1 in 16-28 % (D2) and 8-16 % (D6).
**Hypothesis, not tested:** a saturated, partly flagged core moves the centroid differently on each date. D6, whose core is less affected, agrees to 0.55 ″/yr, and the unsaturated Epsilon Indi B agrees to
0.61 ″/yr, which points the same way. Registration on field stars did not change the D2 result. To settle it we
would need a second fast mover that is bright but not saturated, or the per-pixel flags used as a mask in the
centroid (not done).

## 3. Spectrum along the path, and the Jansky scale

The backend converts the aperture sum from MJy/sr to Jansky with the pixel's solid angle
(`backend/spherex/photometry.py`). The app measures a candidate **where it is on each image's date** and plots
flux against wavelength.

- **Barnard's Star** (D2 + D6, 21 images): 2.8-9.4 Jy at 1.1-1.7 µm and 3.3-4.1 Jy at 4.5-4.9 µm. All 21 are flagged
  (section 2), so they are **lower limits**, and the colour hint declines to judge ("21 measurements have flagged
  pixels ... and were left out"). From memory (not checked here), the star is of order 10 Jy in the near infrared
  and a few Jy near 4.6 µm: the same order, which is all we claim.
- **Epsilon Indi B** (D2 + D6, 17 images): 14-19 mJy at 1.1-1.2 µm and 31-41 mJy from 1.25 µm up to 1.6 µm (one
  flagged image at 1.35 µm gives 5.5 mJy), signal-to-noise 130-790 per image in D2; **21-24 mJy at 4.4-4.9 µm**, S/N
  about 150-230 per image in D6 (the four unflagged points: 23.8, 21.0, 21.4 and 23.3 mJy). A rise from 1.1 to 1.3 µm
  is what is expected of a brown dwarf (from memory, not checked).
- **Colour hint** (`frontend/js/features/spectrum.js`): the ratio of the median flux at 4-5 µm to the median at 1-2 µm
  (star-like < 0.3, neutral 0.3-1.5, red 1.5-10, very red > 10). The thresholds are textbook orders of magnitude on
  **uncalibrated aperture sums**; it is a hint to look closer, not a classification.
  **First test on a real object (Epsilon Indi B, 7 points at 1-2 µm and 4 at 4-5 µm): ratio 0.65, "neutral", not
  "red".** This is an unresolved pair of a T1 and a T6 brown dwarf; "very red" is meant for the coldest objects
  (WISE 0855), not for T dwarfs. For Barnard's Star the flagged lower limits give about 0.48 (the app declines to
  judge them). **So the hint does not separate a cool M dwarf from an early T dwarf**, and the text of the "neutral"
  class now says so. It is kept as a "look closer" prompt, not as a classification. The two real objects are
  recorded as a regression in `scratch/test_spectrum.mjs`.

## 4. Float pixels and finer resampling (backend)

- `cutout(..., method="bilinear")` resamples with a NaN-aware bilinear kernel instead of nearest neighbour; the
  flags are never interpolated. Checked with synthetic frames of known star positions
  (`backend/tests/test_resample_and_track.py`).
- 111 backend tests pass (`pytest backend`). The HTTP layer of `backend/app.py` is still not covered by tests.
- One backend bug found while validating: with several fields indexed, `LocalArchive.find` raised `NoConvergence`
  for a frame whose SIP distortion diverges far from the queried position, so `/api/photometry` answered HTTP 500.
  It now treats that as "not on this frame" (regression test in `backend/tests/test_query.py`).

## 5. Planet X mode (Earth parallax): synthetic only

`frontend/js/features/parallax.js`. A body hundreds of AU away swings across the sky as the Earth goes round the Sun
(412 ″ per 1 AU / 500 AU), plus a slow drift of its own, so its path is not the straight line *Find movers* needs.
The search tests every triple of dots from three survey passes: the middle one must be displaced from the straight
line through the other two exactly as the Earth's motion predicts for *some* distance, and dots in the other images
must confirm it. That gives the distance directly (no distance grid).

What was checked (`node scratch/test_parallax.mjs`, 48 checks):

- **The Earth's position** against independent facts: Sun's longitude 90.01° at the June 2025 solstice (expected 90),
  distance 0.98331 AU at perihelion and 1.01669 AU at aphelion (expected 0.9833 / 1.0167), longitude 100.38° at J2000.0.
- **The parallax formula** against its first-order form: −254.5″ vs −254.4″ east and 50.2″ vs 50.2″ north at 1000 AU.
- **Recovery on synthetic dot lists** (noise 0.15 px, 40 field stars and random dots per image): the distance of a
  body at 300-1200 AU is recovered to within 12 % in 6 of 6 fields, the quoted range contains the truth in 6 of 6,
  and the straight-line search finds nothing there (0 of 6): that is why the mode exists.
- **False alarms**: 0 candidates in 12 fields with no body, 0 in 32 fields with an ordinary straight-line mover.
- **On the simulated sky of the demo** (30′, ~275 dots per image): the simulated body at 600 AU is recovered at
  600-601 AU on three detectors with a drift of 65 ″/yr (injected 65), and an ordinary field gives no candidate.

What it **cannot** claim:

- It has **never been run on real data**. A real field has no such body to find, and the simulation and the search
  share the same ephemeris, so recovery tests the algorithm, not the ephemeris (the ephemeris was checked
  separately against the facts above).
- The Earth's position is the low-precision Sun formula of Meeus (good to ~0.0002 AU), measured from the Sun, not
  from the Solar System barycentre (up to 0.005 AU, 2″ at 500 AU, 0.3 px).
- The body's own motion is taken as a straight line over one to two years, and it must be bound to the Sun (own
  speed below 1.5 × the escape speed at that distance); a body that violates this is not reported unless that
  assumption is switched off.
- The geometry decides how well a distance is measured: with the schedule used in the tests, a field at ecliptic
  longitude ~134° swings 133 px at 500 AU, one at RA 45°, Dec +10° only 16 px. (From memory, not checked here:
  SPHEREx looks about 90° from the Sun, which would give every field the large swing on both sides of the year.)
- A body 500 AU away swings up to ~800″ (13 arcmin, more than twice the 5′ default field), so the mode needs the
  widest field the app offers (30′).
- The distance range is statistical (1 σ for the fit); it does not include these systematics.

## 6. Known asteroids (SkyBoT)

`frontend/js/features/skybot.js`, `node scratch/validate_asteroids.mjs --api http://localhost:8001 --ra 269.4462 --dec 4.769 --fov 5 --det D6`

- **Reachability** (checked on 7 Nov 2026 from the project machine): `https://ssp.imcce.fr/webservices/skybot/api/conesearch.php`
  answers JSON with `Access-Control-Allow-Origin: *`, so the browser calls it directly and **no backend proxy is
  needed**. The older `vo.imcce.fr` address answered HTTP 403. An empty circle answers HTTP 204, a bad request HTTP 400
  with a JSON message; both are handled.
- **Speed**: 15 dates in 9.3 s, 11 in 5.7 s, 6 in 4.4 s (4 requests at a time).
- **Geometry check against the service itself**: for the one body SkyBoT lists in the Barnard field, our
  sky-to-image projection puts it 231.6″ from the centre; SkyBoT says 231.571″.
- **Why per image date**: that body moves 570″ per day, so it is a different dot in every image and can never be
  linked over months; it must be looked up at each image's own date.
- **Real images**: three body-dates fall inside our real cutouts (2015 HV228 on 2026-08-21, V = 23.4, listed twice
  by the service for that date; 2005 LF3 on 2026-03-23, V = 20.6). All are far too faint for a single SPHEREx
  exposure. For 2015 HV228 the flux at its predicted position is zero within the noise on its own date (S/N −1.0 and
  −0.3) and on the other dates (median −1.0 and −0.1); for 2005 LF3 the measurement on its own date could not be
  made (median −1.1 on the other four dates). That is a consistent **negative control**, not a detection.
- **Positive test, one image** (`scratch/find_asteroid_frame.py` found the target, `scratch/fetch_asteroid_cutout.py`
  downloaded one 5.1 MB cutout): the asteroid **Arosa** (main belt, V = 14.6) lies in the D2 image
  `level2_2026W17_1B_0163_1D2` (2026-04-20, MJD 61150.82142, 1.32-1.35 µm), 0.70° from the image centre. SkyBoT puts it
  at RA 296.40882, Dec −24.04831 (position uncertainty 0.02″).
  - **A source of 107 σ** (peak 3.58 MJy/sr over a background noise of 0.033) sits in the central pixel; its centroid
    is **0.17 px = 1.0″ from the predicted position**. Aperture flux 8.55 mJy at 1.34 µm, no bad-flag pixel in the
    central 5 × 5. The app's own chain (SkyBoT, projection, backend photometry) gives S/N 8.7 in its 2-pixel
    aperture, and the overlay draws "Arosa · V 14.5" on the dot. The other two bodies SkyBoT lists in the field
    (V = 18.9 and 22.8) have no source at their positions (the faintest measures −0.2σ).
  - It is **not unique by brightness**: it is the 4th-brightest source of the cutout (the others: 1994 σ, 112 σ,
    110 σ), and six other peaks are at least half as bright. What argues it is not a star: **2MASS** (queried through
    IRSA's TAP, 43 sources with J < 16 in the field) has **no source within 10″** of the position, while 8.55 mJy at
    1.34 µm corresponds to J ≈ 13.4 (zero point 1594 Jy, from memory), well within 2MASS's reach; and the flux
    matches V = 14.6 with the ordinary V − J ≈ 1.2 of sunlit rock (from memory, not checked). SIMBAD is almost empty
    here (1 object in the whole field) and cannot be used as a star list.
  - **What it does not prove:** one image cannot show that the source moves. The same asteroid is 0.8 days earlier in
    another D2 image, at RA 296.246, Dec −24.000; a second cutout (about 5 MB) would show it **absent** from that spot
    on the other date. Not downloaded.
- The position is geocentric; SPHEREx's own height shifts a main-belt asteroid by up to ~8″ (about one pixel); the
  measured offset is 1.0″.

## 7. Known limits, in one list

1. Four real runs on two fast-moving objects and one asteroid: not a statistical survey.
2. Saturated stars: position and flux unreliable (section 2); the flags are not yet used as a mask.
3. Motion below about 1 pixel (6″) over the whole period looks like a still star (Epsilon Indi B moves 4.7″/yr and is
   found only because the baseline is 1.4 years).
4. Needs one detector with images from at least 3 survey passes about 6 months apart.
5. Positions only, never brightness: through the variable filter the same star has a different brightness in each image.
6. Colour hint (cannot separate an M dwarf from an early T dwarf) and Planet X mode (synthetic only): see sections 3 and 5.
   The asteroid detection (section 6) is one image, without proof of motion.
7. Calibration: fluxes are quick aperture sums, not SPHEREx's own calibrated photometry.
8. Not checked: the licence of the real data and of Aladin Lite (GPL-3, loaded from a CDN) for a public release.
