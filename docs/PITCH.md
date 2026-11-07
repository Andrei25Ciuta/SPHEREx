# Pitch: 3-minute script, slides, questions

> **Cum îl folosești (RO):** textul de mai jos e în engleză, pentru juriu. Scenariul are ~430 de cuvinte (≈ 3 minute vorbite
> calm). Tot ce e marcat **[sintetic]** se vede pe date inventate; tot ce e marcat **[real]** a fost măsurat pe date SPHEREx
> reale (vezi [VALIDATION.md](VALIDATION.md)). Spune mereu care e care: asta e „Validity" și e ce te deosebește. Ghidul de
> predare oficial apare pe 13 nov: verifică lungimea maximă a videoclipului înainte să filmezi (nu am putut verifica pagina 2026).

## 0. Before you start

- Open **https://mateibut.github.io/SPHEREx/** (synthetic demo, no install) and keep a second tab with the Planet X demo:
  `?ra=136.5&dec=16.6&fov=30&det=D5` (press *Look for a distant body*).
- For the real-data part use screenshots or a screen recording of your own machine (backend + `?data=api`): the
  real images are **not** in the repository on purpose.
- If the network fails: the demo still runs (only the sky map and the charts need a CDN); *Take the 1-minute tour* works offline;
  `docs/img/demo.gif` shows blink and difference.

## 1. The 3-minute script

| Time | Say | On screen |
|---|---|---|
| 0:00 | "Every six months SPHEREx maps the whole sky in infrared. Between two maps, anything that moves (a brown dwarf, an asteroid, maybe a distant planet) changes place. Finding that by eye in images this size is hopeless. We built the tool that makes it obvious." | Hero, then the workspace |
| 0:20 | "Blink: the same detector on different dates. Stars stay still. WISE 0855, the coldest known brown dwarf, jumps. Difference removes the stars: orange where it is now, blue where it was." **[sintetic]** | Click *WISE 0855*, play, switch to *Difference* |
| 0:50 | "One button, *Find movers*, finds the dots, links them across survey passes and lists what moved: speed, direction, significance, and whether it is already known. SPHEREx is a spectrometer, so for each candidate we measure it where it was on every date and plot its spectrum: a colour hint tells a brown dwarf from a star." | *Find movers*, click a candidate, *Spectrum along its path* |
| 1:20 | "A planet hundreds of AU away does not move in a straight line: as the Earth goes round the Sun it swings back and forth, in a loop. A straight-line search cannot see it. Our Planet X mode asks which dots follow that swing, and reads off the distance. Here, a **simulated** body at 600 AU: recovered at 601. No planet is claimed." **[sintetic]** | Planet X demo, *Look for a distant body*, show the drawn path |
| 1:55 | "Is it real? We ran Find movers blind on real SPHEREx pixels: Barnard's Star and Epsilon Indi B, no hint. Both found, zero false candidates, and in two of the three runs the motion is within 0.6 arcseconds per year of the catalogue. It also showed us a failure: in one detector Barnard's Star is saturated and comes out 3.7 off. It is written down." **[real]** | Slide with the table of [VALIDATION.md](VALIDATION.md) §2 |
| 2:35 | "Everything is open, runs in a browser with no install, and every export says whether its data is real or synthetic. Over three hundred automated checks. The demo you saw is synthetic; the validation was real." | Export CSV, the data badge |
| 2:55 | "SPHEREx Blink: find what moves." | Title |

## 2. Slides (7)

1. **The problem**: SPHEREx maps the sky every ~6 months; things that move are the signal; by eye it does not scale.
2. **Blink and Difference**: the GIF (`docs/img/demo.gif`, labelled synthetic).
3. **Find movers + spectrum along the path**: one candidate list, known objects labelled, colour hint.
4. **Planet X mode**: a drawing of the Earth's orbit and the loop a distant body makes; "straight line vs loop".
5. **Validation on real data**: the table of §2 of [VALIDATION.md](VALIDATION.md), including the failure.
6. **What we do not claim**: Planet X mode never run on real data; no real asteroid detected yet; colour hint not yet used on a real object.
7. **Credits and honesty**: sources ([CREDITS.md](../CREDITS.md)), built with Claude Code, repository started 2026-11-05, links.

## 3. The five judging criteria

| Criterion | Evidence to point at |
|---|---|
| **Impact** | Turns "stare at 2,000-pixel images" into one button and a ranked list; runs in any browser; exports for follow-up (CSV/JSON, each row says what the data is and links back). |
| **Creativity** | Planet X mode: distance from the Earth-parallax swing, searched as triples of dots from three passes; spectrum measured along the moving object's path. |
| **Validity** | Blind test on real data (3 of 3 recovered, 0 false); 342 automated tests; a failure documented instead of hidden; every claim labelled real or synthetic. |
| **Relevance** | The challenge is "Planet X and SPHEREx": moving objects in SPHEREx images, and what separates a nearby mover from a distant planet. |
| **Presentation** | A 1-minute guided tour that works offline, a labelled GIF, this script, a README that starts with what is real and what is not. |

## 4. Numbers you can say (and where they come from)

| Number | Source |
|---|---|
| 3 of 3 real fast movers recovered blind, 0 false candidates | [VALIDATION.md](VALIDATION.md) §2 (`scratch/validate_real.mjs`) |
| Motion within 0.55 and 0.61 ″/yr of the catalogue (Barnard D6, Epsilon Indi B D2) | same |
| Barnard D2: 3.72 ″/yr off, cause unknown (saturated core is the hypothesis) | same, "Open problem" |
| Simulated body at 600 AU recovered at 600-601 AU | [VALIDATION.md](VALIDATION.md) §5 (`scratch/test_parallax.mjs`) |
| 111 backend tests + 231 browser-side checks (7 Nov 2026) | `pytest backend`, `node scratch/test_*.mjs` |
| SkyBoT answers 15 image dates in 9 s | [VALIDATION.md](VALIDATION.md) §6 |

## 5. Do **not** say

- "We found a planet" / "a new object". Candidates are not discoveries (the exports say so).
- "Planet X mode works on real data". It has only been run on synthetic data.
- "Calibrated SPHEREx spectra". The fluxes are quick aperture sums in Jansky, uncalibrated by us.
- "It works for any field". It was tested on three real cutouts.
- "The colour classification is validated". It has not been used on a real object yet.

## 6. Questions you may get

**Is this really finding Planet X?** No. It is a tool that could: it separates a nearby straight-line mover from a body whose path is dominated by Earth's parallax, and gives a distance. The body in the demo is simulated; no real candidate exists.

**Why not machine learning?** The signal is geometry (a dot in different places on different dates), which is explainable and needs no training set. A judge can read why a candidate was listed.

**How do you know the real-data result is not just tuned?** The thresholds were fixed on synthetic data and on Barnard's Star; Epsilon Indi B was downloaded after that, so it is a second, untuned field (as far as our records show). Still only two objects.

**What does "saturated" mean here?** Barnard's Star is so bright that the FLAGS bits for overflow and transient are set in much of its core. Its position in one detector is 3.7 ″/yr off; we say so and do not know the cause yet.

**Do you detect real asteroids?** The overlay and the matching work (SkyBoT, per image date; for the one body in our Barnard field our projection puts it 231.6″ from the centre and the service says 231.571″), but the only bodies in our real cutouts were too faint to see, so there is no positive detection yet.

**How precise is the distance?** On synthetic data, within about 1 % statistically. On real data we cannot say; systematics (ephemeris, a straight own motion) are not in the quoted range.

**Does it scale to the whole sky?** No. It works on field cutouts up to 30′. A survey pipeline would link across many fields.

**Why three survey passes?** Two dots always make a line; a third pass proves it. For the parallax search, three passes also give the one constraint that makes the distance testable.

**What about the data licence?** Not checked yet. That is why real images and FITS files are not in the repository.

**What did the AI do?** The project was built with Claude Code (Anthropic) and says so in the README and [CREDITS.md](../CREDITS.md). *Add, in your own words, what you decided and what you ran and checked yourself.*

**What is next?** A positive asteroid test on a bright body; using the pixel flags as a mask for saturated stars; colour class on a real brown dwarf (needs the 4-5 µm cutouts of Epsilon Indi B, about 25 MB); linking across several fields for Planet X.

## 7. If something breaks live

| Problem | Do this |
|---|---|
| No network | Use the demo as is; skip the sky map and charts (CDN). Run the tour. Show the GIF. |
| The backend is not running | Say the real-data part is shown from a recording; show the table in VALIDATION.md. |
| *Look for a distant body* finds nothing | The field must be the Planet X demo field, 30′, detector D5 (use the *Planet X (simulated)* button). |
| A question you cannot answer | "We did not test that; here is what we did test." Then the table. |
