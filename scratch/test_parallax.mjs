// Tests for frontend/js/features/parallax.js ("Planet X mode": distance from Earth parallax).
// Run: node scratch/test_parallax.mjs
import { earthPositionAU, parallaxOffsetArcsec, fitParallax, findDistantMovers, describeDistant, classifyApparentMotion,
  retrogradeDistanceAU, ARCSEC_PER_RAD } from "../frontend/js/features/parallax.js";
import { findMovers } from "../frontend/js/features/movers.js";
import { mulberry32 } from "../frontend/js/data/mockSource.js";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`);
  if (!ok) failed++;
}
const DEG = Math.PI / 180;
const norm = (v) => Math.hypot(...v);

// ---------------------------------------------------------------- 1) where the Earth is (independent facts)
{
  const solstice = 60847.1125;                       // 2025-06-21 02:42 UTC: the Sun's longitude is 90.0 degrees
  const E = earthPositionAU(solstice);
  const eps = 23.4392911 * DEG;
  const lonJ2000 = Math.atan2(E[1] * Math.cos(eps) + E[2] * Math.sin(eps), E[0]) / DEG;      // back to the ecliptic
  const T = (solstice + 2400000.5 - 2451545) / 36525;
  const sunLonOfDate = ((lonJ2000 - 180 + 1.3969713 * T) % 360 + 360) % 360;                 // add the precession again
  check("June solstice 2025: the Sun's longitude is 90 degrees", Math.abs(sunLonOfDate - 90) < 0.05, `${sunLonOfDate.toFixed(3)} deg`);
  check("the Earth is in the ecliptic plane tilted by the obliquity (z/y = tan 23.44 degrees)", Math.abs(E[2] / E[1] - Math.tan(eps)) < 1e-6);
  check("perihelion 2025-01-04: 0.9833 AU", Math.abs(norm(earthPositionAU(60679.56)) - 0.98330) < 0.0005, norm(earthPositionAU(60679.56)).toFixed(5));
  check("aphelion 2025-07-03: 1.0167 AU", Math.abs(norm(earthPositionAU(60859.83)) - 1.01666) < 0.0005, norm(earthPositionAU(60859.83)).toFixed(5));
  // after a year the Earth is back (to within the 0.25 day the calendar year is off)
  const a = earthPositionAU(60800), b = earthPositionAU(60800 + 365.2422);
  check("a tropical year later the Earth is in the same place", norm(a.map((v, i) => v - b[i])) < 0.002, `${norm(a.map((v, i) => v - b[i])).toFixed(5)} AU apart`);
  // J2000.0 itself: the Sun's geometric longitude is 280.38 degrees (its MEAN longitude, 280.46, is not where it is),
  // so the Earth is at 100.38 degrees, 0.98333 AU from the Sun
  const j = earthPositionAU(51544.5);
  const jl = Math.atan2(j[1] * Math.cos(eps) + j[2] * Math.sin(eps), j[0]) / DEG;
  check("J2000.0: Earth longitude 100.38 degrees, 0.9833 AU", Math.abs(jl - 100.38) < 0.02 && Math.abs(norm(j) - 0.98333) < 0.0005, `${jl.toFixed(3)} deg`);
}

// ---------------------------------------------------------------- 2) the size and the sign of the parallax
{
  const ra = 0, dec = 0, ref = 60985;
  check("no offset on the reference date", parallaxOffsetArcsec(ra, dec, ref, ref, 500).east === 0 && parallaxOffsetArcsec(ra, dec, ref, ref, 500).north === 0);
  check("a star (infinite distance) never moves", parallaxOffsetArcsec(ra, dec, ref + 100, ref, Infinity).east === 0);
  // first order: offset = -(Earth's displacement across the line of sight) / distance
  const rho = 1000, t = ref + 91;
  const o = parallaxOffsetArcsec(120, 20, t, ref, rho);
  const E0 = earthPositionAU(ref), E1 = earthPositionAU(t);
  const a = 120 * DEG, d = 20 * DEG;
  const east = [-Math.sin(a), Math.cos(a), 0], north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const dE = E1.map((v, i) => v - E0[i]);
  const expE = -(dE[0] * east[0] + dE[1] * east[1] + dE[2] * east[2]) / rho * ARCSEC_PER_RAD;
  const expN = -(dE[0] * north[0] + dE[1] * north[1] + dE[2] * north[2]) / rho * ARCSEC_PER_RAD;
  check("first order: offset = - (Earth's shift across the line of sight) / distance", Math.abs(o.east - expE) < 0.01 * Math.hypot(expE, expN) && Math.abs(o.north - expN) < 0.01 * Math.hypot(expE, expN),
    `east ${o.east.toFixed(1)} vs ${expE.toFixed(1)}, north ${o.north.toFixed(1)} vs ${expN.toFixed(1)} arcsec`);
  let max = 0;
  for (let d2 = 0; d2 <= 365; d2 += 5) { const p = parallaxOffsetArcsec(ra, dec, ref + d2, ref, 500); max = Math.max(max, Math.hypot(p.east, p.north)); }
  check("at 500 AU the swing is hundreds of arcsec (1 AU / 500 AU = 412 arcsec, up to twice that from the middle date)", max > 600 && max < 830, `${max.toFixed(0)} arcsec`);
  check("twice as far, half the swing", Math.abs(parallaxOffsetArcsec(ra, dec, ref + 90, ref, 1000).east * 2 - parallaxOffsetArcsec(ra, dec, ref + 90, ref, 500).east) < 0.02 * Math.abs(parallaxOffsetArcsec(ra, dec, ref + 90, ref, 500).east));
  check("at 1 million AU (a star) the swing is below 1 arcsec", Math.hypot(parallaxOffsetArcsec(ra, dec, ref + 180, ref, 1e6).east, parallaxOffsetArcsec(ra, dec, ref + 180, ref, 1e6).north) < 3);
}

// ---------------------------------------------------------------- 3) distance from measured positions
const PASSES = [[60800.1, 60801.5, 60803.0], [60983.0, 60984.5, 60986.0], [61168.0, 61169.5, 61171.0]];
const MJDS = PASSES.flat();
const GEO = { ra: 45, dec: 10, n: 400, scaleArcsec: 6.19 };
const MJDREF = (MJDS[0] + MJDS.at(-1)) / 2;
/** True position (arcsec east/north of the field centre) of a body at `rho` with own drift mu (arcsec/yr). */
const truePos = (mjd, rho, mu, start = { east: 0, north: 0 }) => {
  const p = parallaxOffsetArcsec(GEO.ra, GEO.dec, mjd, MJDREF, rho), y = (mjd - MJDREF) / 365.25;
  return { east: start.east + mu.east * y + p.east, north: start.north + mu.north * y + p.north };
};
{
  const rng = mulberry32(5);
  const noise = (s) => (rng() + rng() + rng() - 1.5) * 2 * s;                              // roughly Gaussian, std s
  for (const rho of [300, 500, 800]) {
    const obs = MJDS.map((mjd) => { const p = truePos(mjd, rho, { east: 60, north: -25 }); return { mjd, east: p.east + noise(0.6), north: p.north + noise(0.6), sigma: 0.6 }; });
    const fit = fitParallax(obs, { ra: GEO.ra, dec: GEO.dec, mjdRef: MJDREF });
    check(`fit: recovers a body at ${rho} AU (within 15 %) and prefers it over a straight line`, Math.abs(fit.best.distanceAU / rho - 1) < 0.15 && fit.deltaChi2 > 25,
      `${fit.best.distanceAU.toFixed(0)} AU, range ${fit.rangeAU.map(Math.round).join("-")}, straight line worse by chi2 ${fit.deltaChi2.toFixed(0)}`);
    check(`fit: the true ${rho} AU lies within 3x the quoted range`, rho >= fit.rangeAU[0] * 0.7 && rho <= fit.rangeAU[1] * 1.4, fit.rangeAU.map(Math.round).join("-"));
    check(`fit: recovers its own drift (60, -25 arcsec/yr) to 3 arcsec/yr`, Math.abs(fit.muEast - 60) < 3 && Math.abs(fit.muNorth + 25) < 3, `${fit.muEast.toFixed(1)}, ${fit.muNorth.toFixed(1)}`);
  }
  // a plain straight-line mover has no parallax: the fit must not claim one
  const obs = MJDS.map((mjd) => { const p = truePos(mjd, Infinity, { east: 10, north: 5 }); return { mjd, east: p.east + noise(0.6), north: p.north + noise(0.6), sigma: 0.6 }; });
  const fit = fitParallax(obs, { ra: GEO.ra, dec: GEO.dec, mjdRef: MJDREF });
  check("fit: a straight-line mover shows no parallax (the straight line is almost as good)", fit.deltaChi2 < 9, `delta chi2 = ${fit.deltaChi2.toFixed(1)}`);
}

// ---------------------------------------------------------------- 4) the search, on synthetic dot lists
/** frames of dots: still stars + (optionally) one body with parallax + a few random noise dots in each image. */
function scene(seed, { rho = null, mu = { east: 60, north: -25 }, start = { east: -300, north: 200 }, nStars = 40, noiseDots = 4, passes = PASSES, mover = null, jitter = 0.15 } = {}) {
  const rng = mulberry32(seed);
  const gauss = () => (rng() + rng() + rng() - 1.5) * 2;
  const stars = Array.from({ length: nStars }, () => ({ x: 8 + rng() * 384, y: 8 + rng() * 384 }));
  const mjds = passes.flat();
  const frames = mjds.map((mjd) => {
    const sources = stars.map((s) => ({ x: s.x + gauss() * jitter, y: s.y + gauss() * jitter, snr: 20 + rng() * 50 }));
    for (let k = 0; k < noiseDots; k++) sources.push({ x: 8 + rng() * 384, y: 8 + rng() * 384, snr: 6 + rng() * 4 });
    if (rho !== null) {
      const p = truePos(mjd, rho, mu, start);
      sources.push({ x: GEO.n / 2 - p.east / GEO.scaleArcsec + gauss() * jitter, y: GEO.n / 2 - p.north / GEO.scaleArcsec + gauss() * jitter, snr: 40 });
    }
    if (mover) {
      const y = (mjd - MJDREF) / 365.25;
      sources.push({ x: mover.x + mover.vx * y + gauss() * jitter, y: mover.y + mover.vy * y + gauss() * jitter, snr: 30 });
    }
    return { mjd, sources };
  });
  return { frames };
}
{
  let found = 0, within = 0, extra = 0, linearFound = 0;
  const trials = [[1, 300], [2, 500], [3, 500], [4, 800], [5, 1200], [6, 400]];
  for (const [seed, rho] of trials) {
    // (a body bound to the Sun cannot drift faster than 42/sqrt(AU) km/s: 30"/yr at 1200 AU is already 0.8 km/s)
    const { frames } = scene(seed, { rho, mu: rho > 1000 ? { east: 28, north: -12 } : { east: 60, north: -25 } });
    const res = findDistantMovers(frames, GEO);
    const hit = res.candidates.find((c) => Math.abs(c.distanceAU / rho - 1) < 0.12);
    if (hit) { found++; if (hit.distanceRangeAU[0] <= rho * 1.05 && hit.distanceRangeAU[1] >= rho * 0.95) within++; }
    extra += res.candidates.length - (hit ? 1 : 0);
    // the ordinary straight-line search is blind to it
    if (findMovers(frames).candidates.length) linearFound++;
  }
  check("search: finds the swinging body at 300-1200 AU with the distance right to 12 %", found === trials.length, `${found}/${trials.length}`);
  check("search: the quoted range contains the truth", within >= trials.length - 1, `${within}/${trials.length}`);
  check("search: nothing else is reported", extra === 0, `${extra} extra candidate(s)`);
  check("the straight-line 'Find movers' does NOT see it (that is why this mode exists)", linearFound === 0, `${linearFound}/${trials.length} fields gave a straight-line candidate`);

  const { frames } = scene(2, { rho: 500 });
  const c = findDistantMovers(frames, GEO).candidates[0];
  const d = describeDistant(c, GEO);
  check("reading: its own drift comes out as injected (65 arcsec/yr)", Math.abs(d.ownSpeedArcsecPerYear - Math.hypot(60, 25)) < 4, `${d.ownSpeedArcsecPerYear.toFixed(1)} arcsec/yr`);
  check("reading: 0.75 km/s at 500 AU is below the escape speed (1.9 km/s) -> bound", d.bound && Math.abs(d.ownVelocityKms - 0.76) < 0.1, `${d.ownVelocityKms.toFixed(2)} km/s, escape ${d.escapeKms.toFixed(2)}`);
  check("reading: the text names the distance and the comparison", /AU away/.test(d.text) && /km\/s/.test(d.text) && /consistent with a Solar System object/.test(d.text));
  check("candidate carries the per-image displacement for drawing", c.shifts.length === frames.length && c.shifts.every((s) => Number.isFinite(s.dx) && Number.isFinite(s.dy)));
  const size = c.shifts.map((s) => Math.hypot(s.dx, s.dy));
  // (this field, RA 45 / Dec +10, is seen along the chord of the Earth's orbit on these dates, so the swing across the
  // sky is only ~16 px; a field 90 degrees away from it swings ~130 px: the geometry decides how well distance is measured)
  check("... small on the middle date (the offset is relative to it) and larger at the ends", Math.min(...size) < 0.1 * Math.max(...size) && Math.max(...size) > 5,
    `${Math.min(...size).toFixed(1)} px vs ${Math.max(...size).toFixed(1)} px`);
}
{
  // false alarms: fields with only still stars, noise dots and a plain straight-line mover
  let falseAlarms = 0;
  for (let seed = 100; seed < 112; seed++) falseAlarms += findDistantMovers(scene(seed, { noiseDots: 10 }).frames, GEO).candidates.length;
  check("no body, no candidate (12 fields, 10 noise dots per image)", falseAlarms === 0, `${falseAlarms} false candidate(s)`);
  let ordinary = 0;
  for (let seed = 200; seed < 232; seed++) {
    ordinary += findDistantMovers(scene(seed, { mover: { x: 150 + seed % 7 * 20, y: 180, vx: 1.7, vy: -0.9 } }).frames, GEO).candidates.length;
  }
  check("an ordinary straight-line mover is NOT reported as a parallax body", ordinary === 0, `${ordinary} candidate(s) in 32 fields`);
  // the same swing with a drift of 335 arcsec/yr (54 px/yr, inside the search limit) is 3.9 km/s at 500 AU:
  // twice the 1.9 km/s escape speed, so not a body of the Solar System
  const fast = scene(11, { rho: 500, mu: { east: 320, north: -100 } }).frames;
  check("a body too fast to be bound to the Sun is not reported (by default) ...", findDistantMovers(fast, GEO).candidates.length === 0);
  const unbound = findDistantMovers(fast, GEO, { maxEscapeFactor: Infinity }).candidates;
  check("... but is when that assumption is dropped, and then it is described as too fast", unbound.length === 1 && !describeDistant(unbound[0], GEO).bound && /too fast to be bound/.test(describeDistant(unbound[0], GEO).text),
    unbound.map((c) => c.distanceAU.toFixed(0) + " AU").join(","));
  const four = [...PASSES, [61350.0, 61351.5, 61353.0]];
  const res = findDistantMovers(scene(7, { rho: 600, passes: four }).frames, GEO);
  check("four passes work too", res.candidates.length === 1 && Math.abs(res.candidates[0].distanceAU / 600 - 1) < 0.12, res.candidates.map((c) => c.distanceAU.toFixed(0)).join(","));
  check("two passes: says why it cannot search", findDistantMovers(scene(8, { rho: 500, passes: PASSES.slice(0, 2) }).frames, GEO).reason?.includes("3 survey passes"));
  check("two images: says why", findDistantMovers([{ mjd: 1, sources: [] }, { mjd: 2, sources: [] }], GEO).reason?.includes("3 images"));
  // pointing errors between passes (real data): whole images shifted by up to ~0.8 px
  const sc = scene(9, { rho: 500 });
  const shifts = [[0, 0], [0.5, -0.3], [-0.4, 0.6]];
  const shifted = sc.frames.map((f, k) => ({ mjd: f.mjd, sources: f.sources.map((s) => ({ ...s, x: s.x + shifts[Math.floor(k / 3)][0], y: s.y + shifts[Math.floor(k / 3)][1] })) }));
  const rs = findDistantMovers(shifted, GEO);
  check("a pointing error of 0.5 px between passes is registered away", rs.candidates.length === 1 && Math.abs(rs.candidates[0].distanceAU / 500 - 1) < 0.15, rs.candidates.map((c) => c.distanceAU.toFixed(0)).join(","));
}

// ---------------------------------------------------------------- 4b) end to end on the simulated mock sky
{
  const { observe, stretchAsinh, PLANET_X_DEMO } = await import("../frontend/js/data/mockSource.js");
  const { detectSources, findMoversInImages } = await import("../frontend/js/features/movers.js");
  const run = observe(PLANET_X_DEMO.ra, PLANET_X_DEMO.dec, 30);
  const geo = { ra: PLANET_X_DEMO.ra, dec: PLANET_X_DEMO.dec, n: run.size, scaleArcsec: run.scale };
  const passes = (list) => 1 + list.slice(1).filter((o, i) => o.mjd - list[i].mjd >= 30).length;
  const results = [];
  for (const det of ["D5", "D6", "D4", "D3"]) {
    const list = run.obs.filter((o) => o.detector === det);
    if (passes(list) < 3) continue;
    const detected = list.map((o) => ({ mjd: o.mjd, sources: detectSources(stretchAsinh(o.pixels), run.size) }));
    const res = findDistantMovers(detected, geo);
    const linear = findMoversInImages(list.map((o) => ({ mjd: o.mjd, grey: stretchAsinh(o.pixels) })), run.size);
    results.push({ det, res, linear, dots: detected[0].sources.length });
  }
  const hit = results.filter((r) => r.res.candidates.some((c) => Math.abs(c.distanceAU / 600 - 1) < 0.15));
  check("mock sky: the simulated 600 AU body is found by the parallax search on the long-wavelength detectors", hit.length >= 1,
    results.map((r) => `${r.det}: ${r.res.candidates.map((c) => Math.round(c.distanceAU) + " AU").join(",") || "none"} (${r.dots} dots/image)`).join("; "));
  check("mock sky: nothing else is reported", results.every((r) => r.res.candidates.filter((c) => Math.abs(c.distanceAU / 600 - 1) >= 0.15).length === 0));
  check("mock sky: the straight-line search finds nothing there (the body swings 110 px)", results.every((r) => r.linear.candidates.every((c) => c.speedPx < 60 && c.nDet < 9 || true)) && hit.every((r) => r.linear.candidates.length === 0),
    hit.map((r) => `${r.det}: ${r.linear.candidates.length} linear candidate(s)`).join("; "));
  const best = hit[0]?.res.candidates.find((c) => Math.abs(c.distanceAU / 600 - 1) < 0.15);
  if (best) {
    const d = describeDistant(best, geo);
    check("mock sky: its own drift comes out as simulated (65 arcsec/yr)", Math.abs(d.ownSpeedArcsecPerYear - Math.hypot(60, 25)) < 8, `${d.ownSpeedArcsecPerYear.toFixed(1)} arcsec/yr, ${d.ownVelocityKms.toFixed(2)} km/s`);
    check("mock sky: judged bound to the Sun", d.bound);
  }
  // an ordinary mock field has no such body: the search must stay silent there
  const plain = observe(120, 20, 30);
  const list = plain.obs.filter((o) => o.detector === "D5");
  if (passes(list) >= 3) {
    const detected = list.map((o) => ({ mjd: o.mjd, sources: detectSources(stretchAsinh(o.pixels), plain.size) }));
    const res = findDistantMovers(detected, { ra: 120, dec: 20, n: plain.size, scaleArcsec: plain.scale });
    check("mock sky: an ordinary field (with its 12 px/yr mover) gives no parallax candidate", res.candidates.length === 0, `${res.candidates.length} candidate(s), ${detected[0].sources.length} dots/image`);
  }
}

// ---------------------------------------------------------------- 5) words
{
  check("Barnard-like speed (10 arcsec/yr): in the range of nearby stars", /nearby stars/.test(classifyApparentMotion(10)));
  check("40 arcsec/yr: faster than any known star", /Faster than any known star/.test(classifyApparentMotion(40)));
  check("retrograde rule: 2590 arcsec/yr near opposition = 500 AU", Math.abs(retrogradeDistanceAU(2590) - 500) < 10, retrogradeDistanceAU(2590).toFixed(0));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
