# Prompts for SPHEREx Blink

Two prompts, to be used one after the other in a new conversation with an AI assistant:

1. **PART A – Full context**: paste it first. It explains what has to be done and what is already done.
2. **PART B – Verifier + ideas**: paste it after A. It asks for an audit of the work, what is missing, and new ideas.

If the assistant can read files, also give it the project folder (`C:\Users\admin\Desktop\nasa`).
The state below is the one from **6 November 2026**. If anything has changed since then, update sections 5 and 6.

---

# PART A – Full context (paste first)

You are my technical assistant for a project at the **NASA Space Apps Challenge 2026**, challenge
**"Planet X and SPHEREx"**. Below is the full context: what I have to do, what I have already done,
and what is left. Read it carefully. **Do not answer with solutions yet**: briefly confirm that you
understood, say what is unclear, and wait for Part B.

Rules for you throughout this conversation:
- Do not invent URLs, field names in FITS files, competition rules, or facts about the data. If you don't know, say "I don't know / needs checking" and say where it can be checked.
- Always separate **verified facts** from **assumptions**.
- Answer in English.

## 1. Project goal

A **public web tool**: you enter celestial coordinates (RA/Dec) and you see **images (cutouts) from
NASA's SPHEREx space telescope** taken at **different epochs**, played like a mini-video ("blink"), so
that objects that **move** stand out. Stars stay in place; whatever shifts position (nearby brown
dwarfs, fast stars, asteroids, possibly a "Planet X") jumps out at the eye.

The 5 official test objects: **Barnard's Star, Epsilon Indi B, WISE 0855 (WISE J085510.83-071442.5),
RW Aurigae, R Draconis**. Their coordinates come from SIMBAD (with proper motion). **WISE 0855** is
the main demo case: the coldest known brown dwarf, ~8.15″/yr (≈1.3 SPHEREx pixels per year).

## 2. Decisions already approved (do not reopen them without a serious reason)

- **Vanilla JS**, ES modules, **no build step**. Aladin Lite and Plotly are loaded from a CDN, on demand.
- The list of detectors is **populated from the data** (it is not fixed). The "All" option **does not mix** detectors in the blink: the blink always runs on **a single detector**; "All" = an overview view.
- The UI accepts "no frames for this combination".
- FOV **1–30 arcmin, default 5**. The pixel scale (~6″/px) is read from the header/WCS, **not** hardcoded.
- **Data contract** (identical for mock and real): `getCutouts({ra, dec, fovArcmin, detector}) -> Frame[]`, with
  `Frame = { mjd, dateISO, detector, wavelengthMinUm, wavelengthMaxUm, imageUrl (string), flags: {anyFlagged, fractionFlagged} | null }`
  plus optional fields added later: `flagsUrl`, `pixelScaleArcsec`. To read pixels on a canvas with real data, the backend must send **CORS** headers.
- Python: `python` is a broken alias on my machine; I use **`py` = Python 3.14.0**. The backend runs in a venv (`backend/.venv`) with astropy 8.0.2 (it has wheels for 3.14).
- **Real SPHEREx data is the LAST step** (my decision of 5 Nov). Until then, everything that can be done runs on the mock and on synthetic FITS files.

## 3. Environment

- Windows 11, project folder: `C:\Users\admin\Desktop\nasa`. Git installed (2.45), branch `main`.
- Local development servers: frontend `py -m http.server 8765 -d frontend` → http://localhost:8765 ; backend `backend/.venv/Scripts/python.exe -m uvicorn app:app --app-dir backend --port 8001`. (Port 8000 was already taken.)
- After editing JS/CSS the browser keeps a cache: **Ctrl+F5**.
- **Network**: the CDS servers in Strasbourg (alasky, simbad.cds.unistra.fr) **time out after 21 s** from my network. These work: `irsa.ipac.caltech.edu` and **SIMBAD on the Harvard mirror** (`simbad.harvard.edu/simbad/sim-tap`, with CORS). For this reason the sky map takes its images from IRSA through the backend's proxy.

## 4. What has already been done (all tested in the browser, on mock / synthetic data only)

### Frontend (`frontend/`)
- **Steps 1–6 of the plan (MVP)**: responsive dark layout, `coords.js` (RA/Dec in degrees or sexagesimal, validation with clear messages), `targets.js` (5 test objects with proper-motion propagation to epoch 2026.0, with references), `urlState.js` (`?ra=&dec=&fov=&det=&mode=`), `mockSource.js` (seeded synthetic star field, one moving source, one variable star, observing schedule of 3 passes ~6 months apart), `player.js` (play/pause, slider, speed, "Frame 3/8", keyboard Space and ←/→), polish: progress bar while loading, "Try again" button, 60 s timeout on the API, ARIA, respects `prefers-reduced-motion`, no horizontal scroll at 375 px.
- **View modes**: Blink; **Difference** (frame minus the median of the frames more than 30 days away, so that an object standing still within one pass is not "learned" by the median; orange = brighter now, blue = fainter); **Stack** (mean); **Trail** (per-pixel maximum: a mover leaves a streak of dots).
- **Detector overview** ("All"): one averaged thumbnail per detector D1–D6; click = open it in the player.
- **Measurement**: click on a source → aperture photometry (radius 2 px, background ring 4–7 px) on all frames → **spectrum** (flux vs wavelength, one colour/symbol per pass) and **light curve** (flux vs date, one colour per detector) with Plotly, plus a table (accessibility). The colour palette was checked for colour blindness with a validation script.
- **Flags**: display flagged pixels in red; option "skip frames with >1 % flagged pixels".
- **Aladin Lite map**: 2MASS / AllWISE / DSS2 + SIMBAD objects + the outline of the blink field (aladin-lite 3.6.5 is loaded as an ES module).
- **Export**: PNG, WebM video (recorded from the canvas, verified that it produces a valid file), "Copy link" button.
- **Predicted position (last feature, `geometry.js`)**: for the test objects inside the field, **green ticks** around the position given by the catalogue (SIMBAD + proper motion) at the date of each frame, a dashed line with the whole path, text with the speed in px/yr and a hint if the motion is <2 px. The mock makes the mover *be* that object at a test object, with its **real speed**.

### Backend (`backend/`, FastAPI + astropy)
- `GET /api/cutouts?ra=&dec=&fov=&det=` → `{frames: Frame[]}`. Every frame is resampled (nearest neighbour) onto **one north-up/east-left grid** (exposures can be rotated differently), the median background is subtracted, then **one asinh stretch per detector**; PNGs cached on disk (the key includes the files and `STRETCH_VERSION`).
- `GET /api/photometry`, `GET /api/health`, `GET /api/hips/<survey>/...` (proxy with an allowlist of 3 IRSA surveys, with retry and cache; blocks `..` and unauthorised paths).
- `scripts/inspect_fits.py` (inspects HDUs, WCS, pixel scale, keywords, flag bits) and `scripts/make_test_fits.py` (18 **synthetic** FITS files, 9 epochs, D1–D6, different rotations; WISE 0855 moves with its real proper motion computed with `astropy.apply_space_motion`, independently of the JS).
- `spherex/query.py` indexes the local files; **the CONFIG block there (HDU names, keyword names, wavelength table) contains assumptions** that must be corrected on real data.

### Checks performed
- Backend with `curl`: JSON matching the contract, cache, CORS on PNG, clear 4xx errors, proxy with allowlist.
- Frontend on the backend: 6 detectors × 3 frames, readable canvas (CORS ok), correlation between frames ≈0.81 (alignment works).
- **End-to-end test**: on the backend, WISE 0855 appears on average **0.17 px** (max 0.29) from the predicted position in the 9 D4–D6 frames. The two sides were written independently (astropy vs JS).
- 17 Node tests pass (`scratch/test_coords.mjs`, `test_mock.mjs`, `test_measure.mjs`).
- All 5 objects × all detectors × all modes walked through: zero console errors.

### Documentation
`README.md`, `docs/DATA_CHECKLIST.md` (what to check on real files), `docs/SUBMISSION.md` (submission checklist + ~30 s video script).

### Git
A single local commit: `23079db` ("MVP, backend and stretch features"). **The "predicted position" feature and the documentation updates are NOT yet in a commit.** Nothing is on GitHub.

## 5. What has NOT been done / is unverified (important)

- **I have no real SPHEREx file.** Everything tested is on synthetic data. I do not yet know:
  - whether "science image in HDU 1, FLAGS in HDU 2" holds (it is only my hypothesis; it must be confirmed with `inspect_fits.py`);
  - the real names of the keywords (time, detector, wavelength), the units (BUNIT), whether the WCS is valid;
  - the exact names of the detectors (I assume D1–D6; I saw D2/D3/D5/D6) and the pairs (I assume D1+D4, D2+D5, D3+D6; I only saw the last two);
  - the **data access method** (SIA, TAP or an IRSA cutout service): **I do not know it and it must not be guessed**; I will check the IRSA documentation / the Resources tab of the challenge, probably after 14 Nov;
  - the real wavelength of a frame: on SPHEREx the filter is a linear variable filter, so the wavelength **changes across the detector surface**; the correct value is the one at the cutout position, not one per file;
  - which bits of the flag mask mean "unreliable pixel" (right now any bit ≠ 0 is marked, so the percentage is pessimistic);
  - whether the 30-day threshold of the Difference mode fits the real cadence.
- Photometry is in **image units, uncalibrated**.
- **Not tested** in Firefox or on a real phone (only DevTools at 375 px).
- The new backend code (photometry, HiPS proxy) was verified only manually with `curl`; **it has no automated tests (pytest)**.
- The predicted position ignores parallax (<0.6″, below 0.1 px).
- Still missing: public GitHub repo, licence, screenshot/GIF in the README, online demo, demo video, the actual registration/submission in the competition.

## 6. What I still have to do (in the planned order)

**Before the real data**
1. Commit for the "predicted position" feature + documentation.
2. Ideas I approved in principle, not yet done:
   - **Automatic candidate detection** ("Find movers"): from the Difference images, look for points that appear at different positions between passes and line up; a list with position, speed (″/yr) and direction, CSV export. The strongest feature for the "Planet X" theme; big effort.
   - **Presentation for the jury**: "Try the demo" button (loads WISE 0855 and walks through the modes with explanations), an "About" section (what SPHEREx is, why blinking works, the link to Planet X), screenshot/GIF in the README.
   - **pytest tests** for photometry and the HiPS proxy.
   - **Online demo**: frontend on GitHub Pages (static site, works on the mock).
3. Public GitHub repo, licence (e.g. MIT), README with an image.

**Last step: real data**
4. Get a real SPHEREx file → `inspect_fits.py` → tick off `docs/DATA_CHECKLIST.md` → fix CONFIG in `backend/spherex/query.py`.
5. Find the IRSA access method in the documentation (no guessed URLs) and implement it (step 8 of the plan: IRSA query + cache).
6. Compute the wavelength at the cutout position; decide the flag bits.
7. **Validation**: WISE 0855 on real data must sit on the green ticks in every frame (< 0.5 px offset; helper: `scratch/check_track.js`). Constant offset = WCS/centre problem; offset growing in time = wrong keyword/time scale; mirrored motion = flipped image.

**Submission**
8. Read the **official rules** of the competition (deadline and time zone, what must be delivered, video length, AI-use declaration), demo video (script in `docs/SUBMISSION.md`; say clearly whether the images are real or mock), final check from a clean browser (all 5 objects, keyboard, phone, map).

## 7. Project structure

```
frontend/  index.html, css/styles.css, js/{main,player,geometry,coords,targets,urlState,config}.js
           js/data/{getCutouts,mockSource,apiSource}.js   (getCutouts.js = the stable interface)
           js/features/{measure,skyContext,exporters}.js
backend/   app.py, requirements.txt, spherex/{query,cutout,stretch,photometry,cache,hips_proxy}.py,
           scripts/{inspect_fits,make_test_fits}.py     (data/, cache/, .venv/ are ignored by git)
docs/      DATA_CHECKLIST.md, SUBMISSION.md, PROMPT_HANDOFF.md
scratch/   test_coords.mjs, test_mock.mjs, test_measure.mjs, check_track.js
```

Confirm that you understood and ask whatever is unclear. Do not propose solutions yet: Part B follows.

---

# PART B – Verifier + ideas (paste after A)

You now have the full context. Your role: **critical auditor and advisor** for my project, with a
**constructive spirit of contradiction**. Don't just tell me what is good. Look for what can fail
at judging or on real data. If you have access to files or to the web, **actually verify** instead of assuming.

## B1. Verify what I have to do (order matters)

1. **The official requirements.** Find and read the official page of the "Planet X and SPHEREx" challenge (NASA Space Apps 2026, spaceappschallenge.org) and the general submission rules. Extract: the exact goal, what I am asked to deliver, the resources provided (data, APIs, tutorials), the deadline with time zone, the judging criteria, video format and length, the AI-use rule. **Tell me explicitly if anything I built does not meet the requirements** or if I missed a requirement. If you cannot access the page, tell me what to look for and where, do not invent its content.
2. **Fit with the theme.** The theme is "Planet X" (unknown/distant objects). Right now the app helps a person *see* something that moves. Evaluate honestly: is that enough, or will the judges want *detection*? What would make the difference?
3. **Audit of the "what I still have to do" list (section 6).** For each item: is it necessary, useful or optional? Is anything missing? Is the order good given the deadline? What do I cut if time is short? Propose a day-by-day/hour-by-hour plan up to the deadline, with a clear **submission MVP** (the minimum that must work perfectly).
4. **Risks on real data** (section 5). For each unverified assumption: how likely it is to be wrong, what breaks in the app then (file and function), the fastest way to check it. Think about things that often appear with real astronomical data: large files (tens to hundreds of MB per exposure), WCS with distortions, NaNs, units, time (UTC/TDB), rate limits, server-side cutout vs full download, images with much more noise than the mock, a 1.3 px/yr motion that is very hard to see.
5. **Quick technical audit of the code** (if you have access to the repo): probable bugs, edge cases (RA near 0/360, poles, large FOV, a single frame, zero frames, images of different sizes), security (the HiPS proxy, CORS `*`, parameter validation), performance (difference/median in JS on large images: 2040×2040 vs small cutouts), accessibility. For each problem: severity, file, short reproduction, fix.
6. **What is missing for submission**: public repo, licence, README with an image, online demo, video, the required declarations. Check my list in `docs/SUBMISSION.md` against the real rules.

## B2. New ideas (after the verification)

Propose **concrete ideas, ordered by the ratio of impact for judging to effort**, each with: what it does,
why it matters scientifically or for the jury, effort (hours), risks, dependence on real data (yes/no),
and how it is tested. Think in particular about:

- **Detection**: automatic candidates for moving objects (line alignment, speed and direction), confidence score, filtering by flags, exportable list (CSV / VOTable).
- **Science**: distinguishing mover vs variable vs artefact; estimating distance or class from a colour/spectrum (e.g. cold brown dwarfs shine towards 4–5 µm); parallax if the time coverage allows; comparison with the catalogue (SIMBAD) to mark what is already known and what is **new**; the link to the "Planet X" search.
- **Education / communication**: guided tour, an "explain it to me" mode, glossary, prepared examples, a 30 s story for the video.
- **Collaboration / community**: shareable links, export of results, reporting candidates.
- **Robustness**: cache, offline, error messages, automated tests, CI.
- **Other sources**: other epochs/objects from IRSA (multi-epoch WISE/NEOWISE) to compare motion over a longer interval; a SPHEREx HiPS if one exists (check the IRSA list, do not assume).

For each idea say whether it works only on mock/synthetic data or needs real data, so that it fits
my order (real data last).

## B3. Answer format

1. **Short verdict** (5 lines): where I stand against the requirements and the biggest risk.
2. **Official requirements** found (with source) and **discrepancies** against what I have.
3. **Risk table** (risk · probability · impact · how to check it quickly).
4. **Code problems** found, sorted by severity.
5. **Day-by-day/hour-by-hour plan** to the deadline, with the submission MVP marked.
6. **Top 5–8 ideas** (table: idea · impact · effort · real data? · first step).
7. **Questions for me**: only those the plan truly depends on.

Mark every statement as **[verified]** (you saw the source/code) or **[assumed]**. Be direct;
I prefer a useful criticism to a compliment.
