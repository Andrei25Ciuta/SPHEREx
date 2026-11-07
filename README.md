# SPHEREx Blink

> **Notice:** this repository is a **personal practice / mock project** (built with AI assistance, Claude Code), started on 2026-11-05, **before** the NASA Space Apps 2026 hackathon (14-15 Nov 2026). It is not a competition submission.

**NASA Space Apps Challenge 2026 – "Planet X and SPHEREx".**
Enter a sky position → see NASA SPHEREx infrared images of that spot taken on different
dates, flipped like a mini-video ("blinking"). Stars stay still; things that **move**
(nearby brown dwarfs, fast stars, asteroids) or **change brightness** stand out.

## What it does

| Feature | How it helps find moving objects |
|---|---|
| **Blink** | Same detector, different dates, one after another (play/pause, speed, frame slider, ← →). |
| **Difference** | Each image minus the median of images from *other* survey passes: still stars vanish, orange = "it is here now", blue = "it was here before / faded". |
| **Stack** | Average of all dates: deeper, less noisy picture. |
| **Trail** | Brightest value of each pixel over all dates: a mover leaves a **trail of dots**. |
| **Compare** | You pick **image A** and **image B** (single images, or a whole survey pass averaged) and an operation: **A − B** (orange = brighter in A, blue = fainter in A: a mover is an orange dot next to a blue one, still stars vanish) or **A + B** (average, a deeper picture). Starts at "latest pass − earliest pass". Note: other dates are also other wavelengths, so bright stars can leave a faint leftover. |
| **Find movers** | One button: finds the dots in every image, links them across survey passes and lists the ones that **moved**, best first (speed in ″/yr, direction, position, how many images, significance). Click one to see its path on the blink; objects from the test list (and SIMBAD objects, with real data) are labelled "(known)"; **Check in sky map** opens the map on it. Details and limits: see below. |
| **Predicted position** | For the test objects, cream ticks show where the catalogue (SIMBAD position + proper motion) says the object must be on each frame's date, plus how far it moves in pixels. If the object sits on the ticks, the whole chain (archive → cutout → orientation → timing) is right. |
| **Catalogue stars** (real data) | Tick "Catalogue stars (SIMBAD)": the catalogued objects of the field are drawn as small teal rings, **moved to the date of each image** with their catalogue proper motion; those moving more than 1″/yr also get their name and path. SIMBAD positions are for the year 2000, so fast movers are searched in a wider circle (Barnard's Star is 4.5′ from its year-2000 spot). The same list lets **Find movers** say "(known)" for any SIMBAD object, not only the 5 test objects. Off with synthetic data (invented stars would not match SIMBAD). |
| **All detectors** | One averaged thumbnail per detector (D1–D6, 0.75–5 µm); click to blink it. |
| **Measure** | Click a source → its **spectrum** (brightness vs wavelength, per survey pass) and **light curve** (brightness vs date, per detector), plus a table. |
| **Flags** | Show flagged pixels in red (a legend says what the red means: bad pixels, not "known source"); optionally skip frames with > 1 % flagged pixels. |
| **Sky context** | Aladin Lite map of 2MASS / AllWISE / DSS2 with SIMBAD objects and the blink field outlined. Old surveys show where a fast mover *was* decades ago. A **Full screen** button gives the map the whole screen (Esc leaves it). |
| **Share** | Save the current image (PNG), record the blink as a video (WebM), copy a link that restores the exact view (`?ra=&dec=&fov=&det=&mode=`). |
| **Embed** | "Embed code" copies an `<iframe>` snippet for another web page. `?embed=1` shows only the workspace (no banner, About or footer) and keeps a one-line note saying what the data is. |
| **Test objects** | Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis – SIMBAD positions propagated with proper motion to the SPHEREx era. |

Accessible: keyboard shortcuts, ARIA labels/live regions, visible focus, reduced-motion
respected (no auto-play), colour-blind-checked chart palette, table view of all numbers.

### How "Find movers" works (and what it cannot do)

1. **Detect** dots in each image of the chosen detector (peaks above 5 σ, centred to sub-pixel accuracy).
2. **Link**: two dots from two *different survey passes* define a straight line (position = start + velocity × time). A line counts only if dots from **at least 3 passes** lie on it (two points always make a line; a third pass is the proof). Still stars are found first (zero velocity); movers are lines whose velocity is significantly different from zero (≥ 6 σ and at least ~1 pixel of total motion).
3. **Report** the movers, best first. Checked by `scratch/test_movers.mjs`: on the mock sky it finds the planted mover in 35 of 39 fields with no false candidates, and re-discovers Barnard's Star and WISE 0855 on their real catalogue speeds.

Limits, on purpose for v1: it uses **positions only** (through SPHEREx's variable filter the same star has a different brightness in every image, so brightness says nothing about motion); motion below ~1 pixel (6″) over the whole period looks like a still star (Epsilon Indi B is too slow); a mover that blends with a bright star is missed; a dot too faint in one wavelength band is missed, so **try another detector**; it needs images from ≥ 3 survey passes about 6 months apart, otherwise the button says so. It works on the 8-bit pictures the player shows, not on calibrated fluxes.

## Run – frontend only (mock data, no install)

```bash
py scripts/serve_frontend.py
```

Open http://localhost:8765 (or e.g. `/?ra=133.75976&dec=-7.24219&fov=5&det=D6&mode=diff`).
ES modules don't load from `file://`, so always serve over http.

> `scripts/serve_frontend.py` is `py -m http.server` plus a `Cache-Control: no-cache` header, so a normal reload picks up edited JS/CSS. With the plain `http.server` the browser may keep running old modules: use **Ctrl+F5**.

The mock invents a star field per position with one moving source and one variable star
(see `frontend/js/data/mockSource.js`). At a random position the mover is exaggerated
(12 px/yr) so the effect is obvious; at a **test object** the mover *is* that object and
moves with its **real** catalogue speed (WISE 0855: 1.3 px/yr). The header badge says **Synthetic demo data**.

### Public demo (GitHub Pages)

The frontend alone is a static site, so it can be published as a demo that runs on the synthetic data (no backend, no data files).
`.github/workflows/pages.yml` publishes only the `frontend/` folder. One-time setup after you push the repository to GitHub:
**Settings → Pages → Build and deployment → Source: GitHub Actions**; the next push to `main` deploys it.
The page labels itself "Synthetic demo data"; keep it that way until real SPHEREx data is wired in.

**Sky map (section 4 of the page):** its survey pictures (2MASS, AllWISE, DSS2) come from the first of these that answers: ESA's public mirror of the CDS surveys (`skies.esac.esa.int`, no setup), our backend's relay of IRSA's copies (when the backend runs), CDS (Strasbourg) directly. Some networks block CDS; then only the first two give a picture (the catalogue circles show either way). The text under the map says which source is in use; "Re-centre sky map" checks again. Set `SKY_TILES` in `frontend/js/config.js` to force one source.

## Run – with the backend (Python 3.14, FastAPI)

One-time setup:

```bash
py -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
```

Test data – **fake** files (synthetic, NOT SPHEREx) until real ones are available.
They contain WISE 0855 moving with its real SIMBAD proper motion, computed with astropy
(independent of the frontend) – the app's green "predicted position" lands on it within
~0.2 px:

```bash
backend/.venv/Scripts/python.exe backend/scripts/make_test_fits.py
```

Real files go in `backend/data/real/` (any `*.fits` under `backend/data/` is indexed).
To fetch a first real SPHEREx cutout from IRSA (search first, download only after a `[y/N]` question, report saved for pasting), follow **[docs/REAL_DATA_TEST.md](docs/REAL_DATA_TEST.md)**: `backend/scripts/fetch_real_sample.py`.
Real files in `backend/data/real/` are served by the backend: open the frontend with **`?data=api`** (add `&api=http://localhost:PORT` if the backend is not on 8001; restart the backend after code changes), e.g. `/?data=api&ra=269.4462&dec=4.769&fov=3&det=D2` after downloading Barnard's Star.
Inspect a new file first and tick off [docs/DATA_CHECKLIST.md](docs/DATA_CHECKLIST.md):

```bash
backend/.venv/Scripts/python.exe backend/scripts/inspect_fits.py backend/data/real/FILE.fits
```

Start the backend:

```bash
backend/.venv/Scripts/python.exe -m uvicorn app:app --app-dir backend --port 8001
```

Then set `DATA_SOURCE = "api"` in `frontend/js/config.js` (`API_BASE = "http://localhost:8001"`).
Nothing else changes. http://localhost:8001/ also serves the frontend itself.

### API

| Endpoint | Returns |
|---|---|
| `GET /api/cutouts?ra=&dec=&fov=&det=` | `{ frames: Frame[] }` – contract in `frontend/js/data/getCutouts.js` |
| `GET /api/photometry?ra=&dec=&det=&radius=` | `{ points: Point[] }` – aperture photometry per frame |
| `GET /api/hips/<survey>/<file>` | IRSA HiPS sky tiles relayed with CORS (allowlist of 3 surveys) |
| `GET /api/health` | indexed files + files that could not be read |
| `GET /cutouts/<file>.png` | cached cutout / flag-mask PNGs |

How a cutout is made: find frames containing the position → resample each onto **one
north-up grid** (frames can be rotated differently on the sky) → subtract each frame's
median background → **one shared asinh stretch per detector** (so brightness is comparable
within a blink) → PNG, cached on disk. Delete `backend/cache/` if you change the
stretch/cutout code without bumping `STRETCH_VERSION`.

## Tests

Frontend (Node, no install):

```bash
node scratch/test_coords.mjs
node scratch/test_mock.mjs
node scratch/test_measure.mjs
node scratch/test_movers.mjs
node scratch/test_compare.mjs
node scratch/test_catalogue.mjs
```

Backend (pytest; synthetic FITS files made on the fly, no real data and no network needed):

```bash
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe -m pytest backend
```

They cover `cutout` (north up / east left, rotated frames, edges, flags), `photometry`, `query` (headers, bad files), `stretch` and the `hips_proxy` allowlist. The HTTP layer in `backend/app.py` is not covered yet.

`scratch/check_track.js` is a browser-console helper that measures, frame by frame, how far
WISE 0855 is from its predicted position (use it again on real data).

## Project layout

```
frontend/            static site, no build step (ES modules)
  js/main.js         wires UI ↔ modules
  js/player.js       blink player + difference / stack / trail maths
  js/data/           getCutouts.js (THE interface), mockSource.js, apiSource.js
  js/features/       movers.js (Find movers), compare.js (Compare A − B), catalogue.js (SIMBAD overlay), measure.js (spectrum + light curve),
                     skyContext.js (Aladin), fullscreen.js, exporters.js
backend/             FastAPI + astropy
  spherex/           query.py, cutout.py, stretch.py, photometry.py, cache.py, hips_proxy.py
  scripts/           inspect_fits.py, make_test_fits.py
  tests/             pytest suite
scripts/             serve_frontend.py (dev server for the frontend, no stale cache)
scratch/             Node tests (test_*.mjs) and helpers
.github/workflows/   pages.yml (GitHub Pages demo)
docs/                DATA_CHECKLIST.md, SUBMISSION.md
```

## Licence, credits & data

Code: [MIT](LICENSE). Full list of sources, third-party licences and how the project was made (with AI assistance): **[CREDITS.md](CREDITS.md)**. In short:

- **SPHEREx** – NASA/JPL-Caltech; data from the NASA/IPAC Infrared Science Archive (IRSA).
- **2MASS, AllWISE, DSS2** sky images – HiPS surveys made by CDS Strasbourg, served from ESA's public mirror (skies.esac.esa.int) or IRSA's copy (relayed by our backend); original data: UMass/IPAC-Caltech (2MASS), NASA/IPAC (AllWISE), STScI (DSS).
- **SIMBAD** – CDS Strasbourg, queried through its Harvard mirror.
- **Aladin Lite** v3 (CDS) and **Plotly.js** – loaded from the jsDelivr CDN on demand.
- Test object coordinates: SIMBAD, with references in `frontend/js/targets.js`.
