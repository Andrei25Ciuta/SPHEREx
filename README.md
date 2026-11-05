# SPHEREx Blink

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
| **All detectors** | One averaged thumbnail per detector (D1–D6, 0.75–5 µm); click to blink it. |
| **Measure** | Click a source → its **spectrum** (brightness vs wavelength, per survey pass) and **light curve** (brightness vs date, per detector), plus a table. |
| **Flags** | Show flagged pixels in red; optionally skip frames with > 1 % flagged pixels. |
| **Sky context** | Aladin Lite map of 2MASS / AllWISE / DSS2 with SIMBAD objects and the blink field outlined. Old surveys show where a fast mover *was* decades ago. |
| **Share** | Save the current image (PNG), record the blink as a video (WebM), copy a link that restores the exact view (`?ra=&dec=&fov=&det=&mode=`). |
| **Test objects** | Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis – SIMBAD positions propagated with proper motion to the SPHEREx era. |

Accessible: keyboard shortcuts, ARIA labels/live regions, visible focus, reduced-motion
respected (no auto-play), colour-blind-checked chart palette, table view of all numbers.

## Run – frontend only (mock data, no install)

```bash
py -m http.server 8765 -d frontend
```

Open http://localhost:8765 (or e.g. `/?ra=133.75976&dec=-7.24219&fov=5&det=D6&mode=diff`).
ES modules don't load from `file://`, so always serve over http.

> After editing JS/CSS, hard-reload with **Ctrl+F5** – the browser caches modules.

The mock invents a star field per position with one moving source and one variable star
(see `frontend/js/data/mockSource.js`). The header badge says **Mock data**.

## Run – with the backend (Python 3.14, FastAPI)

One-time setup:

```bash
py -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
```

Test data – **fake** files (synthetic, NOT SPHEREx) until real ones are available:

```bash
backend/.venv/Scripts/python.exe backend/scripts/make_test_fits.py
```

Real files go in `backend/data/real/` (any `*.fits` under `backend/data/` is indexed).
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

```bash
node scratch/test_coords.mjs
node scratch/test_mock.mjs
node scratch/test_measure.mjs
```

## Project layout

```
frontend/            static site, no build step (ES modules)
  js/main.js         wires UI ↔ modules
  js/player.js       blink player + difference / stack / trail maths
  js/data/           getCutouts.js (THE interface), mockSource.js, apiSource.js
  js/features/       measure.js (spectrum + light curve), skyContext.js (Aladin), exporters.js
backend/             FastAPI + astropy
  spherex/           query.py, cutout.py, stretch.py, photometry.py, cache.py, hips_proxy.py
  scripts/           inspect_fits.py, make_test_fits.py
docs/                DATA_CHECKLIST.md, SUBMISSION.md
```

## Credits & data

- **SPHEREx** – NASA/JPL-Caltech; data from the NASA/IPAC Infrared Science Archive (IRSA).
- **2MASS, AllWISE, DSS2** sky images – HiPS copies hosted by IRSA (originals: CDS Strasbourg).
- **SIMBAD** – CDS Strasbourg, queried through its Harvard mirror.
- **Aladin Lite** v3 (CDS) and **Plotly.js** – loaded from the jsDelivr CDN on demand.
- Test object coordinates: SIMBAD, with references in `frontend/js/targets.js`.
