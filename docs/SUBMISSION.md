# Submission checklist – Space Apps 2026

Order of work (decided 5 Nov): everything below, **real SPHEREx data last**.

## 1. Before submitting – verify against the official rules
- [ ] Re-read the challenge page "Planet X and SPHEREx" and the general submission rules
      on spaceappschallenge.org (deadline, time zone, required items, video length, AI-use disclosure).
      *Do not rely on this file for rules – it only lists what we expect to need.*
- [ ] Team page complete (members, location).

## 2. Real data (last step)
- [ ] One real SPHEREx file → `inspect_fits.py` → tick off `docs/DATA_CHECKLIST.md`.
- [ ] Fix the CONFIG block in `backend/spherex/query.py` if names differ.
- [ ] Access method from IRSA docs / challenge Resources tab (SIA / TAP / cutout service) → `query.py`.
- [ ] Wavelength at the cutout position (SPHEREx filters vary across the detector).
- [ ] Which flag bits really mean "bad pixel".
- [ ] Blink WISE 0855 on real data; expect ~8″/yr ≈ 1.3 px/yr – the Difference and Trail
      modes are what make this visible. **It must sit on the green predicted-position ticks**
      in every frame (`scratch/check_track.js` measures the offset; < 0.5 px is good).
- [ ] Remove or clearly label the fake FITS generator in the demo.

## 3. Repository
- [x] `git init`, first commit (`.gitignore` excludes `.venv`, `cache`, `data`, `.claude`).
- [ ] Public GitHub repo, README renders, licence chosen (e.g. MIT).
- [ ] Screenshot / GIF at the top of the README.
- [ ] Hosting the frontend (e.g. GitHub Pages works for the mock: it is a static site).
      The backend needs a Python host if the public demo should use real data.

## 4. Demo video – suggested script (~30 s; adjust to the official length limit)
1. (3 s) Title: "SPHEREx Blink – find what moves in the infrared sky".
2. (5 s) Click **WISE 0855** → images load, blink plays.
3. (6 s) Switch to **Difference**: stars vanish; the brown dwarf shows as orange (now) next
   to blue (before) – only ~1.3 px per year, invisible in a plain blink.
4. (5 s) The **green ticks** (catalogue prediction) sit right on it: physics and data agree.
5. (6 s) Click it → **spectrum** rises towards 5 µm (cold brown dwarf), light curve.
6. (5 s) **Sky map**: 2MASS from 1999 – the object was somewhere else back then.
   (Tip: "Record video" in the app gives a clean clip of the blink itself.)

Say clearly in the video whether the images are **real SPHEREx data or the mock**.

## 5. Final check (from a clean browser)
- [ ] Open the deployed link, no console errors, all 5 test objects load.
- [ ] Phone layout (DevTools 375 px) – no horizontal scroll.
- [ ] Keyboard only: Tab through controls, Space / ← → in the player.
- [ ] Sky map loads (if CDS is blocked on the venue network, use the backend → IRSA copy).
