// Sanity test for the pure parts of mockSource.js. Run: node scratch/test_mock.mjs
import { mulberry32, makeSchedule, renderPixels, stretchAsinh, mjdToISO } from "../frontend/js/data/mockSource.js";

const rng = mulberry32(12345);
const sched = makeSchedule(rng);
const perDet = {};
for (const s of sched) perDet[s.detector] = (perDet[s.detector] || 0) + 1;
console.log("visits:", sched.length, "per detector:", perDet);
console.log("first/last date:", mjdToISO(sched[0].mjd), mjdToISO(sched.at(-1).mjd));

// One bright moving source on an empty field: find the brightest pixel at t=-0.5 and +0.5 yr.
const size = 48;
const field = { stars: [], variable: { x: 0, y: 0, flux: 0, periodDays: 100 },
  mover: { x0: 24, y0: 24, vx: 12, vy: 0, flux: 60 } };
for (const t of [-0.5, 0, 0.5]) {
  const img = renderPixels(field, size, 60800, t, 4.5, mulberry32(1));
  let best = 0; for (let i = 1; i < img.length; i++) if (img[i] > img[best]) best = i;
  const grey = stretchAsinh(img);
  console.log(`t=${t} yr  peak at x=${best % size}, y=${Math.floor(best / size)}  grey=${grey[best]}`);
}
