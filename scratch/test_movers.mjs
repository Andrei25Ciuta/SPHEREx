// Tests for frontend/js/features/movers.js ("Find movers").  Run: node scratch/test_movers.mjs
import { detectSources, findMovers, findMoversInImages, describeMover, matchKnownObject } from "../frontend/js/features/movers.js";
import { mulberry32, renderPixels, stretchAsinh, observe } from "../frontend/js/data/mockSource.js";
import { TARGETS, positionAtEpoch } from "../frontend/js/targets.js";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`);
  if (!ok) failed++;
}
const emptyField = () => ({
  stars: [],
  variable: { x: 0, y: 0, flux: 0, periodDays: 100 },
  mover: { x0: 0, y0: 0, vx: 0, vy: 0, flux: 0 },
});

// ---------------------------------------------------------------- 1) detection
{
  const field = emptyField();
  field.stars.push({ x: 30.3, y: 40.7, flux: 200 });
  const grey = stretchAsinh(renderPixels(field, 64, 60800, 0, 3, mulberry32(1)));
  const dots = detectSources(grey, 64);
  const off = dots.length ? Math.hypot(dots[0].x - 30.3, dots[0].y - 40.7) : NaN;
  check("detects exactly one injected star", dots.length === 1, `${dots.length} dot(s)`);
  check("its centre is within 0.25 px", off < 0.25, `off by ${off.toFixed(2)} px`);

  let falseDots = 0;
  for (let seed = 1; seed <= 10; seed++) {
    falseDots += detectSources(stretchAsinh(renderPixels(emptyField(), 200, 60800, 0, 3, mulberry32(seed))), 200).length;
  }
  check("pure noise gives (almost) no dots", falseDots <= 2, `${falseDots} dots in 10 noise-only 200x200 images`);
}

// ---------------------------------------------------------------- 2) synthetic scenes
// Three survey passes about half a year apart, a few visits each (like the mock schedule).
const MJDS = [60800, 60801.7, 60803.4, 60983, 60984.7, 60986.4, 61165, 61166.7];
function scene(seed, speed, angle) {
  const rng = mulberry32(seed);
  const size = 120, field = emptyField();
  for (let i = 0; i < 90; i++) {
    field.stars.push({ x: rng() * size, y: rng() * size, flux: Math.min(400, 8 * Math.pow(rng(), -1.2)) });
  }
  const mid = (MJDS[0] + MJDS.at(-1)) / 2;
  // Keep the mover's track at least 5 px from every star: a mover that sits on top of a bright
  // star blends with it (a documented limit, checked separately below).
  for (let tries = 0; tries < 200; tries++) {
    field.mover = { x0: 40 + rng() * 40, y0: 40 + rng() * 40, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, flux: 60 };
    const clear = MJDS.every((mjd) => {
      const yrs = (mjd - mid) / 365.25;
      const px = field.mover.x0 + field.mover.vx * yrs, py = field.mover.y0 + field.mover.vy * yrs;
      return field.stars.every((s) => Math.hypot(s.x - px, s.y - py) >= 5);
    });
    if (clear) break;
  }
  const frames = MJDS.map((mjd, i) => ({
    mjd,
    grey: stretchAsinh(renderPixels(field, size, mjd, (mjd - mid) / 365.25, 3.5, mulberry32(seed * 100 + i))),
  }));
  return { size, field, frames, mid };
}
/** Does a candidate match the true mover (position at its reference date, and speed)? */
function isTrueMover(c, field, mid) {
  const years = (c.mjdRef - mid) / 365.25;
  const dist = Math.hypot(c.x - (field.mover.x0 + field.mover.vx * years), c.y - (field.mover.y0 + field.mover.vy * years));
  const truthSpeed = Math.hypot(field.mover.vx, field.mover.vy);
  return dist < 1.0 && Math.abs(c.speedPx / truthSpeed - 1) < 0.2;
}

for (const speed of [12, 3, 1.7, 1.3]) {
  let ok = 0, extra = 0;
  const seeds = [11, 12, 13, 14];
  for (const seed of seeds) {
    const s = scene(seed, speed, mulberry32(seed)() * 2 * Math.PI);
    const { candidates } = findMoversInImages(s.frames, s.size);
    if (candidates.some((c) => isTrueMover(c, s.field, s.mid))) ok++;
    extra += candidates.filter((c) => !isTrueMover(c, s.field, s.mid)).length;
  }
  check(`finds a ${speed} px/yr mover (${(speed * 6.2).toFixed(1)}"/yr)`, ok === seeds.length && extra === 0,
    `${ok}/${seeds.length} found, ${extra} false candidate(s)`);
}
{
  // Motion far below one pixel over the whole period must NOT be reported (it looks like a still star).
  let reported = 0;
  for (const seed of [21, 22, 23]) {
    const s = scene(seed, 0.2, 1.0);
    reported += findMoversInImages(s.frames, s.size).candidates.length;
  }
  check("a 0.2 px/yr 'mover' is treated as a still star", reported === 0, `${reported} candidate(s)`);
  let falseAlarms = 0;
  for (const seed of [31, 32, 33, 34, 35, 36]) {
    const s = scene(seed, 0, 0);
    falseAlarms += findMoversInImages(s.frames, s.size).candidates.length;
  }
  check("a field with nothing moving gives no candidates", falseAlarms === 0, `${falseAlarms} candidate(s) in 6 fields`);
}

// ---------------------------------------------------------------- 3) the real mock, end to end
/**
 * The detector a user would blink: one with images from >= 3 survey passes. The mock mover is
 * a cold brown dwarf – invisible near 1 um, bright near 4 um – so we take the reddest such
 * detector (a dot that is not there cannot be tracked).
 */
function pickDetector(run) {
  const byDet = new Map();
  for (const o of run.obs) byDet.set(o.detector, [...(byDet.get(o.detector) || []), o]);
  const passes = (list) => 1 + list.slice(1).filter((o, i) => o.mjd - list[i].mjd >= 30).length;
  const usable = [...byDet.values()].filter((l) => l.length >= 3 && passes(l) >= 3);
  return usable.sort((a, b) => b[0].wlMin - a[0].wlMin)[0] ?? null;
}
{
  const rng = mulberry32(2026);
  let tested = 0, found = 0, extra = 0;
  for (let k = 0; k < 40; k++) {
    const ra = rng() * 360, dec = -60 + rng() * 120;
    const run = observe(ra, dec, 10);
    const best = pickDetector(run);
    if (!best) continue;
    tested++;
    const mid = (run.obs[0].mjd + run.obs.at(-1).mjd) / 2;
    const frames = best.map((o) => ({ mjd: o.mjd, grey: stretchAsinh(o.pixels) }));
    const { candidates } = findMoversInImages(frames, run.size);
    if (candidates.some((c) => isTrueMover(c, run.field, mid))) found++;
    extra += candidates.filter((c) => !isTrueMover(c, run.field, mid)).length;
  }
  // The misses are movers that blend with a bright star (see the limits at the top of movers.js).
  check("mock sky: the planted mover is found in >= 85 % of fields", found / tested >= 0.85, `${found}/${tested}`);
  check("mock sky: at most 2 false candidates in all those fields", extra <= 2, `${extra} false`);
}

// ---------------------------------------------------------------- 4) known catalogue objects
for (const id of ["barnard", "wise0855", "epsindb"]) {
  const t = TARGETS.find((x) => x.id === id);
  const p = positionAtEpoch(t, 2025.6);
  const run = observe(p.ra, p.dec, 10);
  const geo = { ra: p.ra, dec: p.dec, n: run.size, scaleArcsec: run.scale };
  const pm = Math.hypot(t.pmra, t.pmdec) / 1000;
  // Like a user, try every detector that has images from >= 3 survey passes; one match is enough.
  const byDet = new Map();
  for (const o of run.obs) byDet.set(o.detector, [...(byDet.get(o.detector) || []), o]);
  const passes = (list) => 1 + list.slice(1).filter((o, i) => o.mjd - list[i].mjd >= 30).length;
  const tried = [];
  let hit = null;
  for (const [det, list] of byDet) {
    if (list.length < 3 || passes(list) < 3) continue;
    const frames = list.map((o) => ({ mjd: o.mjd, grey: stretchAsinh(o.pixels) }));
    const { candidates } = findMoversInImages(frames, run.size);
    const m = candidates.map((c) => matchKnownObject(c, geo, TARGETS)).find(Boolean);
    tried.push(`${det}${m ? " found" : ""}(${list.length} img)`);
    if (m && !hit) hit = m;
  }
  const motion = (pm / run.scale) * 1.0;                       // about one year of observations
  const detail = `${pm.toFixed(1)}"/yr = ${motion.toFixed(2)} px/yr; tried ${tried.join(", ")}` +
    (hit ? `; matched ${hit.target.label} (${hit.distPx.toFixed(2)} px off)` : "; no match");
  if (motion >= 1.2) check(`re-discovers ${t.label}`, !!hit && hit.target.id === id, detail);
  else console.log(`INFO  ${t.label}: ${detail}  (moves less than ~1 px over the survey: too slow for this method, expected)`);
}

// ---------------------------------------------------------------- 5) describing a candidate, edge cases
{
  const geo = { ra: 100, dec: 20, n: 100, scaleArcsec: 6 };
  const right = describeMover({ x: 50, y: 50, vx: 2, vy: 0 }, geo);
  const up = describeMover({ x: 50, y: 50, vx: 0, vy: -2 }, geo);
  check("moving right on the image = moving west", right.compass === "W" && Math.abs(right.positionAngleDeg - 270) < 1e-6, `${right.compass} ${right.positionAngleDeg.toFixed(0)} deg`);
  check("moving up on the image = moving north", up.compass === "N" && Math.abs(up.positionAngleDeg) < 1e-6, `${up.compass} ${up.positionAngleDeg.toFixed(0)} deg`);
  check("speed in arcsec/yr = pixels/yr x scale", Math.abs(right.speedArcsecPerYear - 12) < 1e-9, `${right.speedArcsecPerYear} "/yr`);
  check("a candidate at the image centre sits at the field centre",
    Math.abs(right.ra - 100) < 1e-6 && Math.abs(right.dec - 20) < 1e-6, `RA ${right.ra.toFixed(5)} Dec ${right.dec.toFixed(5)}`);

  check("fewer than 3 images -> no candidates and a reason",
    findMovers([{ mjd: 1, sources: [] }, { mjd: 100, sources: [] }]).reason === "needs at least 3 images");
  check("images from only 2 survey passes -> a reason (two passes cannot prove a line)",
    findMovers([{ mjd: 0, sources: [] }, { mjd: 1, sources: [] }, { mjd: 200, sources: [] }]).reason?.includes("3 survey passes"));
  let threw = false;
  try { findMovers([{ mjd: 5, sources: [] }, { mjd: 1, sources: [] }, { mjd: 9, sources: [] }]); } catch { threw = true; }
  check("images out of time order are rejected", threw);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
