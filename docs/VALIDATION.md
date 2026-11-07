# Validation: what was tested on real SPHEREx data, and what was not

Measured on **7 November 2026**, on this project's own machine. Everything below can be re-run with the commands
shown. The real images are **not** in this repository (not published: the licence and terms of use of the data have
not been checked, see [CREDITS.md](../CREDITS.md)); they live in `backend/data/real/`, which git ignores.

**One line:** with no hint about the target, *Find movers* recovered both fast-moving objects it was pointed at
(Barnard's Star and Epsilon Indi B) in **4 of 4** single-detector runs on real SPHEREx pixels and in both fields when
the two detectors are searched together, all within 0.8 ″/yr of the catalogue motion. The "chance lines expected"
number separates these real lines (at most 1e-4 expected by chance) from the three false ones the original rule let
through (about 17 each). The Jansky scale agrees with 2MASS and AllWISE stars to within about 10 % (2-10 %). The asteroid Arosa is seen in
a real image **and shown to move** between two images 19.5 hours apart. WISE 0855 gives a **suggestive, not
established** flux when stacked along its known path, and a blind search cannot find it. The Earth-parallax fit
recovers the distance of Makemake (52.65 AU against 52.62 AU) **when told where to look**, but the **blind** parallax
search did **not** find Makemake in the same dots (section 5): the Planet X mode has no real-data success to show.

## 1. The data

| Field | Detector | Images | Survey passes | Dates | Cutout |
|---|---|---|---|---|---|
| Barnard's Star (RA 269.4462, Dec +4.769) | D2 (1.1-1.6 µm) | 15 | 4 | 2025-08-21 to 2026-09-22 | 5′, 49 × 49 px of 6.14″ |
| Barnard's Star | D6 (4.2-5.1 µm) | 6 | 3 | 2025-08-15 to 2026-08-20 | same |
| Epsilon Indi B (RA 331.0965, Dec −56.8006) | D2 | 11 | 5 | 2025-04-26 to 2026-10-02 | same |
| Epsilon Indi B | D6 | 6 | 4 | 2025-04-29 to 2026-09-28 | same |
| WISE 0855 (RA 133.7598, Dec −7.2422 at 2026.0) | D2 and D6 | 6 + 6 | 3 | 2025-05-05 to 2026-05-14 | same (section 7) |
| Asteroid Arosa | D2 | 2 images, 3 cutouts | 1 | 2026-04-20 (00:10 and 19:42 UTC) | same (section 6) |
| Makemake (dwarf planet, 52 AU) | D2 | 7 | 4 | 2025-06-01 to 2026-06-09 | same, centred on its Horizons position (section 5) |

Cutouts come from IRSA's server-side cutout service (`backend/scripts/fetch_real_sample.py`, which asks before
downloading unless told `--yes`; `scratch/find_body_frames.py` and `scratch/fetch_asteroid_cutout.py` for the
asteroid and Makemake cutouts). The backend serves each cutout as a picture, as **real float32 pixel values**
(`dataUrl`) and as a **bad-pixel mask** from the FLAGS plane (`maskUrl`), so the detector works on the calibrated
numbers, not on an 8-bit picture. Total on disk: 60 files, 279 MB.

## 2. Blind test of *Find movers*

`node scratch/validate_real.mjs --api http://localhost:8003 --ra 269.4462 --dec 4.769 --fov 5 --det D6`
(`--det all` searches D2 and D6 together; `--relaxed 1` switches back to the original rule). Run against a backend that
serves **only** the real files (started with `SPHEREX_DATA_DIR` set to `backend/data/real`): the synthetic files in
`backend/data/fake` sit at the same sky position and would be mixed in.

The detector is **not told** what to look for. Afterwards its candidates are compared with SIMBAD (proper motions in
arcsec/yr: RA × cos Dec, Dec). "Chance lines expected" is the number of lines this good that the dots of that field
would produce by chance (pairs of dots tested × the binomial tail of the number of images that confirm the line); a
candidate is kept only if that number is below 1.

| Field, detector | Candidates | Catalogue match | Catalogue motion | Measured motion | Difference | Seen in | Significance | Chance lines expected |
|---|---|---|---|---|---|---|---|---|
| Barnard, D2 | 1 | Barnard's Star | (−0.80, +10.36) | (−1.03, +10.15) | **0.31 ″/yr** | 15 of 15 | 15 σ | 2e-21 |
| Barnard, D6 | 1 | Barnard's Star | (−0.80, +10.36) | (−0.25, +9.78) | **0.80 ″/yr** | 6 of 6 | 11 σ | 8e-6 |
| Barnard, **D2 + D6** | 1 | Barnard's Star | (−0.80, +10.36) | (−0.91, +10.19) | **0.20 ″/yr** | 21 of 21 | 19 σ | 2e-30 |
| Epsilon Indi B, D2 | 1 | Epsilon Indi B | (+3.98, −2.47) | (+3.45, −2.14) | **0.62 ″/yr** | 11 of 11 | 8 σ | 4e-15 |
| Epsilon Indi B, D6 | 1 | Epsilon Indi B | (+3.98, −2.47) | (+3.34, −2.42) | **0.65 ″/yr** | 6 of 6 | 7 σ | 1e-4 |
| Epsilon Indi B, **D2 + D6** | 1 | Epsilon Indi B | (+3.98, −2.47) | (+3.46, −2.37) | **0.53 ″/yr** | 17 of 17 | 11 σ | 3e-23 |

- **Recovered in every run** (each field has exactly one catalogued fast mover); **0 candidates without a catalogue
  match.** Searching both detectors together uses all images in one line fit: more images (21 and 17) and the
  smallest differences for Barnard.
- 0.2-0.8 ″/yr is 0.03-0.13 pixel per year.
- **The two D6 differences got a little worse** than in the previous version of this file (0.55 → 0.80 and
  0.54 → 0.65 ″/yr) after the bad-pixel mask and the other changes below; D2 got much better (next subsection).
- **A failure, and the change it caused.** The first run on Epsilon Indi B in D6 (6 images, about 9 dots each) listed
  Epsilon Indi B **and 3 false candidates**: lines of 30-85 ″/yr through dots of only 3 of the 6 images. With so few
  images and so many dots, three chance matches are likely. The rule "a line needs dots in at least half of the
  images" became "at least 60 %" (`minDetectionFraction` in `movers.js`), and later a line is dropped when one or more
  chance lines like it are expected (`maxFalseAlarm`). Re-running the original rule (`--relaxed 1`) reproduces the
  failure with numbers: the real Epsilon Indi B line has **6e-5** chance lines expected, the three false ones
  **about 17 each**. So the number separates them by six orders of magnitude. **Because the rules were set after seeing
  this failure, this D6 run is no longer an independent test of them**; a new field would be needed for that.
- **Path support** (`validate_real.mjs` prints it as a column). For each candidate the app also measures the S/N at the
  predicted position in every image (aperture of 2 pixels, only where the whole aperture is on the image and at least
  80 % of its pixels are valid), whether or not a dot was found there. The six real candidates above are supported in
  **every image that could be measured** (13 of 13 and 6 of 6 for Barnard D2 and D6, 19 of 19 for both detectors; 11 of
  11, 6 of 6 and 17 of 17 for Epsilon Indi B; S/N up to 3490). The three false candidates of the original rule are
  supported in **3 of 6, 2 of 6 and 2 of 4** measurable images.
- Two changes were made earlier because of what the real images showed: **float pixels** (an 8-bit picture turns a
  bright star into a flat-topped blob whose centre jumps) and **image registration** (every exposure has its own
  pointing error, up to about 0.7 px between passes, which over a one-year baseline looks like a motion of several
  arcsec/yr). Both are covered by synthetic tests (`scratch/test_movers.mjs`), not only by these fields.

### Barnard in D2: from 3.7 to 0.3 ″/yr in RA

Before the mask the D2 result was 3.72 ″/yr off. The star is so bright that on every one of the 21 images (D2 and
D6) its core pixels carry the FLAGS bits 0 (transient), 1 (overflow) and 2 (SUR error): peak 580-1980 MJy/sr; in the
central 5 × 5 pixels bit 0 is set in 48-84 % of them in D2 and 24-40 % in D6, bit 2 in 44-96 % (D2) and 16-24 % (D6),
bit 1 in 16-28 % (D2) and 8-16 % (D6). A centroid of a partly flagged core moves differently on each date.

**The change:** when at least 6 of the 25 pixels around a dot's peak carry a BAD flag (`coreIsCompromised` in
`frontend/js/features/movers.js`), its position is fitted with a Gaussian of fixed width (1.3 px) to the **unflagged**
pixels of the surrounding 11 × 11 window (`fitMaskedGaussian`) instead of the centroid of all pixels. The threshold
matters: applying the masked fit to every star with any flagged pixel made the faint Epsilon Indi B vanish in D6 (a
single flagged core pixel moved it by 0.4 px). Result: **3.72 → 0.31 ″/yr**, which is consistent with the
hypothesis written here earlier (a saturated, partly flagged core moves the centroid). **This was designed after
seeing the 3.72 on the same images, so it is a fix, not an independent test**; what argues it is not tuned to
these images is that it does nothing for the unsaturated star, and that it is covered by synthetic tests
(`scratch/test_movers.mjs`, `backend/tests/test_resample_and_track.py` for the mask).

## 3. Spectrum along the path, and the Jansky scale

The backend converts the aperture sum from MJy/sr to Jansky with the pixel's solid angle
(`backend/spherex/photometry.py`). The app measures a candidate **where it is on each image's date** and plots
flux against wavelength.

### Is the Jansky scale right? (`scratch/validate_photometry.py`)

For isolated, unsaturated stars of the real cutouts, the aperture flux (2-pixel radius, no aperture correction) is
compared with the flux expected from the catalogue at that image's wavelength (2MASS J and H for D2, AllWISE W2 for
D6; IRSA TAP):

| Field, detector | Stars | Measurements | Median measured / expected | Robust scatter | 16th-84th percentile |
|---|---|---|---|---|---|
| Barnard field, D2 | 5 | 33 | **0.967** | 0.031 | 0.92-0.99 |
| Barnard field, D6 | 6 | 18 | **0.895** | 0.046 | 0.84-0.93 |
| Epsilon Indi B field, D2 | 4 | 15 | **0.979** | 0.053 | 0.93-1.02 |
| Epsilon Indi B field, D6 | 2 | 3 | **0.932** | 0.024 | 0.90-0.94 |

A ratio a little below 1 is expected because the 2-pixel aperture catches only part of a star's light. So **the
Jansky scale is right to within about 10 %, and D6 is 5-10 % lower than D2**; it is not an absolute calibration. The
zero points (2MASS J 1594 Jy, H 1024 Jy; WISE W2 171.787 Jy) are written **from memory** in the script and should be
checked before the numbers are quoted outside this project.

### Real spectra

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
  **aperture sums**; it is a hint to look closer, not a classification.
  **First test on a real object (Epsilon Indi B, 7 points at 1-2 µm and 4 at 4-5 µm): ratio 0.65, "neutral", not
  "red".** This is an unresolved pair of a T1 and a T6 brown dwarf; "very red" is meant for the coldest objects
  (WISE 0855), not for T dwarfs. For Barnard's Star the flagged lower limits give about 0.48 (the app declines to
  judge them). **So the hint does not separate a cool M dwarf from an early T dwarf**, and the text of the "neutral"
  class now says so. The text also reports how smooth the spectrum is, and warns when a second source sits within
  the aperture (see WISE 0855, section 7). The two real objects are recorded as a regression in
  `scratch/test_spectrum.mjs`.

## 4. Float pixels and finer resampling (backend)

- `cutout(..., method="bilinear")` resamples with a NaN-aware bilinear kernel instead of nearest neighbour; the
  flags are never interpolated. Checked with synthetic frames of known star positions
  (`backend/tests/test_resample_and_track.py`).
- The bad-pixel mask (`mask_cutout_bytes`, 1 = a BAD flag bit is set; north up like the float pixels) has its own
  tests there.
- 112 backend tests pass (`pytest backend`). The HTTP layer of `backend/app.py` is still not covered by tests.
- One backend bug found while validating: with several fields indexed, `LocalArchive.find` raised `NoConvergence`
  for a frame whose SIP distortion diverges far from the queried position, so `/api/photometry` answered HTTP 500.
  It now treats that as "not on this frame" (regression test in `backend/tests/test_query.py`).

## 5. Planet X mode (Earth parallax): synthetic tests, and one real test that half works

`frontend/js/features/parallax.js`. A body hundreds of AU away swings across the sky as the Earth goes round the Sun
(412 ″ per 1 AU / 500 AU), plus a slow drift of its own, so its path is not the straight line *Find movers* needs.
The search tests every triple of dots from three survey passes: the middle one must be displaced from the straight
line through the other two exactly as the Earth's motion predicts for *some* distance, and dots in the other images
must confirm it. That gives the distance directly (no distance grid). Images of several fields (a body that swings out
of one cutout into the next) are brought into one common plane with the exact tangent-plane projection.

### Synthetic checks (`node scratch/test_parallax.mjs`, 56 checks)

- **The Earth's position** against independent facts: Sun's longitude 90.01° at the June 2025 solstice (expected 90),
  distance 0.98331 AU at perihelion and 1.01669 AU at aphelion (expected 0.9833 / 1.0167), longitude 100.38° at J2000.0.
- **The parallax formula** against its first-order form: −254.5″ vs −254.4″ east and 50.2″ vs 50.2″ north at 1000 AU.
- **Recovery on synthetic dot lists** (noise 0.15 px, 40 field stars and random dots per image): the distance of a
  body at 300-1200 AU is recovered to within 12 % in 6 of 6 fields, the quoted range contains the truth in 6 of 6,
  and the straight-line search finds nothing there (0 of 6): that is why the mode exists.
- **False alarms**: 0 candidates in 12 fields with no body, 0 in 32 fields with an ordinary straight-line mover.
- **A mosaic of four cutouts** with a body that swings across all of them: found at the right distance in 4 of 4
  fields; a single tile alone does not find it; 0 false candidates in 3 fields without a body.
- **On the simulated sky of the demo** (30′, ~275 dots per image): the simulated body at 600 AU is recovered at
  600-601 AU on three detectors with a drift of 65 ″/yr (injected 65), and an ordinary field gives no candidate.

### Real test: Makemake (`node scratch/real_parallax.mjs --api http://localhost:8003`)

Makemake (a dwarf planet, V ≈ 17, 52 AU) is in many D2 images over the survey; 7 cutouts were downloaded
(`scratch/find_body_frames.py` found the images through JPL Horizons and IRSA, `scratch/fetch_asteroid_cutout.py` cut
them), each **centred on the position Horizons gives for that image's time**. The ephemeris was used only to say where to cut.

1. **Fit, told where to look** (the dot nearest each cutout's centre; found in 4 of 7 images, 0.02-0.27 px from the
   ephemeris, S/N 4.3-8.5): straight drift **plus** Earth parallax gives **52.65 AU** (1σ 52.62-52.67 for a position
   error of 4″; 52.6 AU for 2″, 4″ and 8″), against **52.62 AU** from Horizons. The best straight line without
   parallax has χ² = 2 477 413, the parallax model 6.7 (3 degrees of freedom); residuals are at most 6″ (1 pixel).
   This tests the Earth's position, the parallax formula and the geometry on real images. It is a fit of 5
   parameters (position, drift east and north, distance) to 8 numbers (4 positions), so only 3 degrees of freedom
   check it, and the dots were chosen with the ephemeris.
2. **Blind search: negative result.** The blind search (`findDistantMovers`, no ephemeris) over all 72 dots of the 7
   cutouts returned 10 candidates at 52-54 AU, and **none of them is Makemake**: graded against Horizons (the
   ephemeris is used only to grade), eight of them have no dot within 4 pixels of the Horizons position (8-28 px
   away) and the other two have 2 of their 4 dots on it and the rest 8-14 px away.
   Why, and why this does not say much either way:
   - The cutouts are centred on the body, so **any** dot near a cutout's centre follows Makemake's parallax track.
     That is why every chance combination lands at 52-54 AU.
   - The body is detected in only 4 of 7 images; a 5-parameter model on 4 dots leaves 3 degrees of freedom, and chance
     combinations fit as well (rms 0.5-1.3 px). The "σ better than a straight line" figure was 800-1900 for them.
   - With only the four images in which it was detected, the search returns 58 candidates.
   A fair blind test needs cutouts that are **not** centred on the body and more detections (at least 6 or 7). We do
   not have that, so **the blind Planet X search has not been shown to work on real data.** The app now says so in the
   candidate text when a parallax candidate rests on 5 dots or fewer.
3. **A bug found by this test:** when a new candidate rivalled two earlier ones that did not rival each other, only the
   first was replaced and two mutually rival candidates stayed in the list (two identical lines). Fixed (a new
   candidate must beat all its rivals and then replaces all of them); regression test in `scratch/test_parallax.mjs`
   (the old logic leaves 1 rival pair among 52 candidates in 16 crowded fields, the new one 0).

### What it cannot claim

- The blind search has **never succeeded on real data** (above). A real field has no such body to find, and the
  simulation and the search share the same ephemeris, so synthetic recovery tests the algorithm, not the ephemeris
  (which was checked separately against the facts above and against Makemake).
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

`frontend/js/features/skybot.js`, `node scratch/validate_asteroids.mjs --api http://localhost:8003 --ra 269.4462 --dec 4.769 --fov 5 --det D6`

- **Reachability** (checked on 7 Nov 2026 from the project machine): `https://ssp.imcce.fr/webservices/skybot/api/conesearch.php`
  answers JSON with `Access-Control-Allow-Origin: *`, so the browser calls it directly and **no backend proxy is
  needed**. The older `vo.imcce.fr` address answered HTTP 403. An empty circle answers HTTP 204, a bad request HTTP 400
  with a JSON message; both are handled.
- **Speed**: 15 dates in 9.3 s, 11 in 5.7 s, 6 in 4.4 s (4 requests at a time).
- **Geometry check against the service itself**: for the one body SkyBoT lists in the Barnard field, our
  sky-to-image projection puts it 231.6″ from the centre; SkyBoT says 231.571″.
- **Why per image date**: that body moves 570″ per day, so it is a different dot in every image and can never be
  linked over months; it must be looked up at each image's own date.
- **Real images, negative control**: three body-dates fall inside our real cutouts (2015 HV228 on 2026-08-21, V = 23.4,
  listed twice by the service for that date; 2005 LF3 on 2026-03-23, V = 20.6). All are far too faint for a single
  SPHEREx exposure. For 2015 HV228 the flux at its predicted position is zero within the noise on its own date (S/N −1.0
  and −0.3) and on the other dates (median −1.0 and −0.1); for 2005 LF3 the measurement on its own date could not be
  made (median −1.1 on the other four dates). That is a consistent **negative control**, not a detection.
- **Positive test and proof of motion** (`scratch/find_asteroid_frame.py` found the target, `scratch/fetch_asteroid_cutout.py`
  downloaded three cutouts of two images, about 5 MB each): the asteroid **Arosa** (main belt, V = 14.6) lies in two
  D2 images of the same survey pass, 19.5 hours apart, and SkyBoT gives its position at each time:

  | Image (UTC) | Wavelength | At the position for 19:42 (RA 296.40882, Dec −24.04831) | At the position for 00:10 (RA 296.24573, Dec −24.00048) |
  |---|---|---|---|
  | 2026-04-20 00:10 (`..._0003_1D2`) | 1.21 µm | **0.02 ± 0.84 mJy (absent)** | **8.67 ± 0.27 mJy (S/N 33)** |
  | 2026-04-20 19:42 (`..._0163_1D2`) | 1.34 µm | **8.56 ± 0.98 mJy (S/N 8.7)** | not in this cutout |

  The source is at the SkyBoT position at each time and absent from the other one: it **moved 563″ in 19.5 hours**
  (28.8″/hour; SkyBoT says 29.0″/hour). Its flux is the same at the two wavelengths (8.67 and 8.56 mJy), as expected of
  a sunlit rock. The flux at the later position is a **107 σ** peak in the central pixel of the cutout (peak 3.58 MJy/sr
  over a background noise of 0.033); its centroid is **0.17 px = 1.0″ from the predicted position**, with no bad-flag
  pixel in the central 5 × 5. The app's own chain (SkyBoT, projection, backend photometry) gives S/N 8.7 in its
  2-pixel aperture, and the overlay draws "Arosa · V 14.5" on the dot. The other two bodies SkyBoT lists in the field
  (V = 18.9 and 22.8) have no source at their positions (the faintest measures −0.2σ).
  - It is **not unique by brightness**: it is the 4th-brightest source of the cutout (the others: 1994 σ, 112 σ,
    110 σ), and six other peaks are at least half as bright. Besides the motion, what argues it is not a star:
    **2MASS** (queried through IRSA's TAP, 43 sources with J < 16 in the field) has **no source within 10″** of the
    position, while 8.55 mJy at 1.34 µm corresponds to J ≈ 13.4 (zero point 1594 Jy, from memory), well within 2MASS's
    reach. SIMBAD is almost empty here (1 object in the whole field) and cannot be used as a star list.
- The position is geocentric; SPHEREx's own height shifts a main-belt asteroid by up to ~8″ (about one pixel); the
  measured offset is 1.0″.

## 7. WISE 0855 (the namesake object)

`backend/.venv/Scripts/python.exe -I scratch/stack_wise0855.py --api http://localhost:8003 --det D6`

WISE 0855 (the coldest known brown dwarf, 8.2 ″/yr) is bright only near 4.5 µm (W2 ≈ 13.9, from memory) and very
faint at 1 µm. In a single exposure it is at most a 3-5 σ speck, below the 5 σ detection threshold, so a **blind
search cannot find it** (tried; nothing at its position). The weaker question is whether there is flux at the
position its catalogue motion predicts. Method: the aperture sum on every image at the predicted position (epoch
2026.0, moving-object mode of `/api/photometry`), averaged with inverse-variance weights over the unflagged images,
and the same stack at 16 **control** positions (the same path shifted by 40 and 60″, where nothing is expected).

| | Unflagged images | Stack (target) | Nominal S/N | Controls: median, robust scatter | Target against controls |
|---|---|---|---|---|---|
| D6 (4.5-5.0 µm) | 4 of 6 | **0.415 ± 0.076 mJy** | 5.4 σ | +0.025 mJy, 0.091 mJy | 4.3 × the robust scatter; brighter than 15 of 16 controls |
| D2 (1.1-1.6 µm) | 5 of 6 | 0.635 ± 0.086 mJy | 7.3 σ | +0.022 mJy, 0.129 mJy | 4.7 × the robust scatter; brighter than 16 of 16 controls |

- **D6 is suggestive, not a detection.** 0.415 mJy at 4.5-5.0 µm is the same order as the expected W2 flux of the
  object (about 0.47 mJy for W2 = 13.9, both from memory; our apertures lose 5-10 %, section 3). But it rests on 4 images (two flagged
  ones are left out and would push the stack in opposite directions: +0.47 and −0.70 mJy), the nominal 5.4 σ is only
  4.3 σ against the robust scatter of the controls, and one of the 16 controls (at +4.8 mJy, on a field star) makes
  the plain scatter 1.2 mJy, which would make the target 0.1 σ. The significance depends on how the controls are
  chosen: we do not claim a detection.
- **D2 is not WISE 0855.** At 1 µm the object is millions of times fainter (J ≈ 25, from memory) than the 0.635 mJy
  measured. The flux belongs to a **2MASS star of J = 15.4, 7.5″ away**, which lies inside the measurement (a J = 15.4
  star is about 1 mJy at 1.2 µm). The app now warns about this ("a second source sits within the aperture", `blendWarning`
  in `movers.js`), and the colour hint declines to use a blended 1-2 µm measurement. So the app's colour ratio for this
  object would be wrong without the warning.
- Single measurements: D6 flux on the four unflagged dates 0.16 ± 0.15, 0.53 ± 0.11, 0.46 ± 0.54 and 0.47 ± 0.16 mJy.

## 8. Known limits, in one list

1. Six real runs on two fast-moving objects, one asteroid and one dwarf planet: not a statistical survey.
2. Saturated stars: position needs the bad-pixel mask (section 2); their flux stays a lower limit.
3. Motion below about 1 pixel (6″) over the whole period looks like a still star (Epsilon Indi B moves 4.7″/yr and is
   found only because the baseline is 1.4 years).
4. Needs images from at least 3 survey passes about 6 months apart (one detector, or both when "Use all detectors" is on).
5. Positions only, never brightness: through the variable filter the same star has a different brightness in each image.
6. Colour hint cannot separate an M dwarf from an early T dwarf (section 3). **Planet X mode: the distance fit
   works on real data when told where to look, the blind search has not been shown to work on real data** (section 5).
7. Calibration: fluxes are quick aperture sums, 2-10 % below catalogue magnitudes (section 3), not SPHEREx's own
   calibrated photometry.
8. WISE 0855 is a suggestive stack, not a detection (section 7).
9. Not checked: the licence of the real data and of Aladin Lite (GPL-3, loaded from a CDN) for a public release. What was
   found out about the data (section 9): IRSA asks for a citation (DOI) and an acknowledgement and states no other
   terms on the page that was read; that is not a licence review, and **no SPHEREx pixel is published** anywhere.

## 9. The real-data results page, and the country readout of the sky map (added 7 Nov 2026, evening)

### The results page (`frontend/results.html`, `frontend/data/real_results.json`)

A public page with **only derived numbers and charts**: no image, no pixel, no FITS name. It is the visual version of
sections 2-7 of this file: the six blind runs, the chance-line numbers (kept lines against the three false ones of the
original rule), the Barnard mask fix, the Jansky scale, the Arosa motion, the WISE 0855 stacks (the 16 control values of
each detector were taken from a fresh run of `scratch/stack_wise0855.py` on 7 Nov and reproduce the numbers above:
0.415 ± 0.076 mJy against controls with a robust scatter of 0.091 mJy in D6, 0.635 ± 0.086 mJy and 0.129 mJy in D2) and
Makemake with its **negative blind-search result written next to the successful fit**. Charts are HTML + CSS (no library, no
canvas), so text keeps its size on a phone, and every chart is followed by a real table (the chart itself is hidden from
screen readers). The numbers in the prose are filled in from the JSON (`data-n`), so they cannot drift from the charts.

`node scratch/test_results.mjs` (47 checks): the helpers (ticks, scales, lane spreading, number formats); the JSON agrees
with itself (every stated difference is the distance between its measured and catalogue vectors; the control median, the
robust scatter, "x times the scatter", "brighter than n of 16" and the nominal sigma are recomputed from the control
values; Arosa's speed is distance over time); **no image, data URL, base64, file name or pixel field, and no array
longer than 20 numbers**; every headline number also stands in this file; every chart the page asks for is built;
every number the page fills in exists in the JSON; ids, anchors and labels resolve. In the browser: desktop and phone
(375 px) without horizontal overflow, 8 charts drawn, no console errors; `scratch/audit_page.js` finds no target under
24 px except inline links, no unnamed control, and 4 "low contrast" results that are false positives of the script (the
value sits inside a pale or orange bar and is dark on it; the script only looks at the background of the parent).

Data use: the IRSA quick-release overview asks users to cite the release DOI (10.26131/IRSA629 for QR1, 10.26131/IRSA652
for QR2, 10.26131/IRSA662 for QR3, as printed on that page, read on 7 Nov) and to include an acknowledgement, and the part
of the page that was read states no other terms. The page credits SPHEREx and IRSA and lists the three DOIs; **which
release each image of ours comes from has not been matched** (the file names carry pipeline versions v20-v25), and the
acknowledgement text of the footer is in our own words, to be replaced by IRSA's exact wording before submission
(`CREDITS.md`).

### Country readout on the sky map (`frontend/js/features/skyGeo.js`, `skyContext.js`)

The box in the corner of the sky map gives the sky coordinates under the cursor (or of the centre when the pointer is
away) and, **in brackets, the country that sky point is straight above right now**: a point (RA, Dec) is at the zenith of
latitude = Dec and longitude = RA - Greenwich sidereal time at any moment. It is a way to put a country next to a sky
coordinate; it is not where SPHEREx is. It moves west by 15° an hour, so the country changes during the day. Over water the
text says how far the nearest coast is ("water, about 850 km from Brazil").

- **Astronomy**: sidereal time from Meeus 12.4; first-order precession of the coordinates to the equinox of the date
  (0.34° in 2026, 40 km on the ground); nutation and aberration ignored.
- **Borders**: Natural Earth through the `world-atlas` package, version 2.0.2 (TopoJSON, 110 m scale, 177 countries, about
  105 KB), **loaded by the browser from the jsDelivr CDN** when the map opens, like Aladin Lite. It is not stored in this
  repository (fetching it into the project would be a new download, not done without asking). If it cannot be loaded the box
  shows coordinates only and says so.
- **Tests** (`node scratch/test_skygeo.mjs`, 25 checks; the world map in them is a tiny invented one, nothing is
  downloaded): sidereal time at J2000.0 (280.4606°), at 0h UT on 2000-01-01 (99.9678°) and Meeus' example 12.a
  (197.693195°), 15.0411° an hour; precession (0.344° and 0.150° for a point at (0, 0) after 26.85 years); a sky point whose
  RA equals the sidereal time is on the Greenwich meridian; six hours later it is 90.25° west; the TopoJSON decoder (delta
  encoding, reversed arcs, a ring of two arcs, holes, a multi-polygon island); point in polygon; nearest coast against
  closed-form great-circle distances.
- **Real map, checked in the browser**: 46 of 46 interior points that I chose from memory (Romania, Indonesia, Brazil, Kenya,
  Iceland, ...) get the right country; decoding takes 11 ms, a land lookup 0.05 ms, a lookup over water 4-26 ms (done at most
  every 60 ms). Over water the nearest country can be too far: the 110 m map has no small islands (a point in the mid-Atlantic
  reports Canada instead of the Azores). That test only covers countries' interiors; near borders the answer can be off by
  tens of kilometres, as the page says.
- In the app, with five sky positions (WISE 0855, Barnard's Star, Epsilon Indi B, RA 45° Dec +89.2° and RA 10° Dec -60°) the
  readout gave a country or the distance to the nearest coast each time, hovering over the map changed it, and the console
  stayed free of errors. The box sits above Aladin's own zoom control and wraps onto two lines on a phone. Not tried: touch
  panning on a real phone, and the full-screen mode.
