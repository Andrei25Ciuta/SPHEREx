// Tests for frontend/js/features/spectrum.js (colour hint of a moving object).  Run: node scratch/test_spectrum.mjs
import { colourHint, fluxColumn, spectralSmoothness, BANDS } from "../frontend/js/features/spectrum.js";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  – " + detail : ""}`);
  if (!ok) failed++;
}

/** Points from a spectrum function F(lambda): 4 images at 1-2 um and 4 at 4-5 um. */
const spectrum = (f, extra = {}) => [1.1, 1.25, 1.5, 1.8, 4.2, 4.5, 4.7, 4.9].map((w) => ({ wavelengthUm: w, flux: f(w), ...extra }));

// A star: F_nu ~ lambda^-2 (Rayleigh-Jeans), a brown dwarf: rising to 4.5 um, an asteroid: reflected + heat glow.
const star = colourHint(spectrum((w) => 100 * w ** -2));
check("an ordinary star (F_nu ~ lambda^-2) is star-like", star.kind === "star" && star.ratio > 0.05 && star.ratio < 0.2, `ratio ${star.ratio?.toFixed(2)}`);
const flat = colourHint(spectrum(() => 50));
check("a flat spectrum (F_nu constant) is neutral", flat.kind === "neutral" && Math.abs(flat.ratio - 1) < 1e-9, `${flat.kind}, ratio ${flat.ratio?.toFixed(2)}`);
const asteroid = colourHint(spectrum((w) => 20 + (w > 3.5 ? 80 : 0)));
check("a warm asteroid (heat glow beyond 3.5 um) is red", asteroid.kind === "red", `ratio ${asteroid.ratio?.toFixed(1)}`);
const dwarf = colourHint(spectrum((w) => (w > 3.5 ? 400 : 5)));
check("a cold brown dwarf (almost dark at 1-2 um, bright at 4-5 um) is very red", dwarf.kind === "very-red", `ratio ${dwarf.ratio?.toFixed(0)}`);
check("every hint says how it was measured and which way it points", [star, asteroid, dwarf].every((h) => /4–5 µm divided by flux at 1–2 µm/.test(h.text)));

// Missing data
const onlyShort = colourHint(spectrum(() => 10).filter((p) => p.wavelengthUm < 3));
check("with only short wavelengths it says it cannot judge, and why", onlyShort.kind === "unknown" && /4–5 µm/.test(onlyShort.text) && onlyShort.ratio === null);
const onlyLong = colourHint(spectrum(() => 10).filter((p) => p.wavelengthUm > 3));
check("with only long wavelengths too", onlyLong.kind === "unknown" && /1–2 µm/.test(onlyLong.text));
check("an empty list does not crash", colourHint([]).kind === "unknown");
// A bright star (real Barnard's Star data): every aperture has overflow bits, so every measurement is flagged.
const allFlagged = colourHint(spectrum((w) => 100 * w ** -2, { flagged: true }));
check("when everything is flagged it says so, instead of 'no measurements'", allFlagged.kind === "unknown" && allFlagged.nFlagged === 8 && /flagged pixels/.test(allFlagged.text) && /left out/.test(allFlagged.text), allFlagged.text.slice(0, 60));
check("one measurement per band is not enough", colourHint([{ wavelengthUm: 1.2, flux: 1 }, { wavelengthUm: 4.5, flux: 9 }]).kind === "unknown");

// Robustness
const flagged = spectrum((w) => 100 * w ** -2);
flagged[4].flux = 1e9; flagged[4].flagged = true;                                 // a bad pixel must not decide
check("flagged measurements are ignored", colourHint(flagged).kind === "star");
const noisy = spectrum((w) => 100 * w ** -2);
noisy[5].flux = -3;                                                                // noise can make a flux negative
check("one negative flux does not break the median", colourHint(noisy).kind === "star");
check("no light at 1-2 um but some at 4-5 um is very red, not a crash", colourHint(spectrum((w) => (w > 3.5 ? 5 : -1))).kind === "very-red");
check("light nowhere is star-like by default, not NaN", Number.isFinite(colourHint(spectrum(() => 0)).ratio));

// Units
const withJy = spectrum((w) => 100 * w ** -2).map((p) => ({ ...p, fluxJy: p.flux * 1e-3 }));
check("Jansky is used when every measurement has it", fluxColumn(withJy) === "fluxJy" && fluxColumn(spectrum(() => 1)) === "flux");
check("... but not when some are missing", fluxColumn(withJy.map((p, i) => (i === 0 ? { ...p, fluxJy: null } : p))) === "flux");
check("the bands are the documented ones", BANDS.short[0] === 0.7 && BANDS.long[1] === 5.1);

// ---------------------------------------------------------------- REAL measurements (7 Nov 2026), kept as a regression
// Epsilon Indi B along its path, real SPHEREx D2 + D6 cutouts (backend /api/photometry, fluxes in mJy; flagged = bad-pixel bits in the aperture).
{
  const row = (wavelengthUm, mJy, flagged = false) => ({ wavelengthUm, flux: mJy, fluxJy: mJy / 1e3, flagged });
  const epsIndB = [row(1.245, 34.55), row(4.425, 23.80), row(1.613, 35.44), row(4.456, 22.97, true), row(1.275, 40.56), row(4.912, 20.97),
    row(1.163, 15.61, true), row(1.542, 31.40, true), row(1.109, 13.57), row(1.188, 19.29), row(1.540, 32.65, true), row(4.688, 21.41),
    row(4.439, 23.26), row(4.661, 22.06, true), row(1.579, 39.06), row(1.175, 15.11), row(1.353, 5.49, true)];
  const h = colourHint(epsIndB);
  check("REAL Epsilon Indi B (D2 + D6): 7 usable points at 1-2 um, 4 at 4-5 um", h.nShort === 7 && h.nLong === 4, `${h.nShort} / ${h.nLong}`);
  check("REAL Epsilon Indi B: ratio 0.65 -> 'neutral' (not 'red': a T dwarf pair is not as red as WISE 0855)", h.kind === "neutral" && Math.abs(h.ratio - 0.65) < 0.02, `${h.kind}, ${h.ratio?.toFixed(3)}`);
  check("the neutral text admits it is not a classification and mentions brown dwarfs", /brown dwarf/.test(h.text) && /not read it as a classification/.test(h.text));
  // Barnard's Star, real: every measurement flagged (overflow in the core) -> no judgement at all
  const barnard = [row(1.101, 5760, true), row(1.21, 2750, true), row(4.922, 3330, true), row(4.709, 3860, true)];
  check("REAL Barnard's Star: all flagged -> unknown, with the reason", colourHint(barnard).kind === "unknown" && colourHint(barnard).nFlagged === 4);
}

// ---------------------------------------------------------------- spectral smoothness (is the spectrum one object's?)
{
  const pt = (wavelengthUm, flux, flagged = false) => ({ wavelengthUm, flux, fluxErr: Math.max(0.01, flux * 0.01), flagged });
  const lambdas = [1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 4.40, 4.45, 4.50, 4.55];
  const smooth = lambdas.map((l) => pt(l, 100 * l ** -2));
  const s = spectralSmoothness(smooth);
  check("smoothness: a smooth spectrum (Rayleigh-Jeans) has small steps", s.kind === "smooth" && s.step < 0.1, `${s.kind}, step ${s.step?.toFixed(3)}`);
  const { mulberry32 } = await import("../frontend/js/data/mockSource.js");
  const rng = mulberry32(3);
  const random = lambdas.map((l) => pt(l, 5 + 200 * rng()));
  check("smoothness: random fluxes are jumpy", spectralSmoothness(random).kind === "jumpy", `step ${spectralSmoothness(random).step?.toFixed(2)}`);
  check("smoothness: too few usable points say 'unknown', not a verdict", spectralSmoothness(smooth.slice(0, 4)).kind === "unknown");
  check("smoothness: flagged points and points with S/N below 5 are ignored", spectralSmoothness(smooth.map((p, i) => (i % 2 ? { ...p, flagged: true } : p))).pairs < spectralSmoothness(smooth).pairs
    && spectralSmoothness(smooth.map((p) => ({ ...p, fluxErr: p.flux }))).kind === "unknown");
  // REAL Epsilon Indi B (mJy, unflagged, S/N >= 5): D2 + D6
  const real = [[1.109, 13.57], [1.175, 15.11], [1.188, 19.29], [1.245, 34.55], [1.275, 40.56], [1.579, 39.06], [1.613, 35.44], [4.425, 23.80], [4.439, 23.26], [4.688, 21.41], [4.912, 20.97]].map(([l, f]) => pt(l, f));
  check("REAL Epsilon Indi B: smooth", spectralSmoothness(real).kind === "smooth", `step ${spectralSmoothness(real).step?.toFixed(3)}, ${spectralSmoothness(real).pairs} pairs`);
  const hint = colourHint(real);
  check("the colour hint now also says how smooth the spectrum is", /neighbouring wavelengths/.test(hint.text) && hint.smoothness.kind === "smooth", hint.text.slice(-110));
}

// ---------------------------------------------------------------- end to end on the mock sky
// The mock mover (12 px/yr, brighter at long wavelengths) is measured along its path, and again at one fixed position.
{
  const { observe, getPhotometryMock } = await import("../frontend/js/data/mockSource.js");
  let tried = 0, followed = 0, hinted = 0, redEnough = 0, fixedLost = 0;
  for (const [ra, dec] of [[120, 20], [200, -30], [50, 45], [300, 10], [15, 60]]) {
    const run = observe(ra, dec, 10);
    const m = run.field.mover;
    if (m.knownAs) continue;
    tried++;
    const mjds = run.obs.map((o) => o.mjd);
    const mid = (Math.min(...mjds) + Math.max(...mjds)) / 2;
    const cosDec = Math.cos((dec * Math.PI) / 180);
    const east0 = -(m.x0 - run.size / 2) * run.scale, north0 = -(m.y0 - run.size / 2) * run.scale;     // arcsec from the centre, at `mid`
    const base = { centerRa: ra, centerDec: dec, fovArcmin: 10, ra: ra + east0 / 3600 / cosDec, dec: dec + north0 / 3600, radiusPx: 2 };
    const motion = { epochMjd: mid, pmEast: -m.vx * run.scale, pmNorth: -m.vy * run.scale };
    const along = await getPhotometryMock({ ...base, motion });
    const fixed = await getPhotometryMock(base);
    const mean = (pts) => { const v = pts.filter((p) => p.flux !== null).map((p) => p.flux); return v.reduce((a, b) => a + b, 0) / v.length; };
    const meanAlong = mean(along), meanFixed = mean(fixed);                 // the mover has flux 60 in the mock; its colour makes it 20-100
    if (meanAlong > 30) followed++;
    if (meanFixed < 0.5 * meanAlong) fixedLost++;
    const hint = colourHint(along);
    if (hint.kind !== "unknown") { hinted++; if (hint.kind === "red" || hint.kind === "very-red") redEnough++; }
  }
  check("mock: following the path measures the mover's light (mean flux > 30 over all images)", followed === tried, `${followed}/${tried} fields`);
  check("mock: a FIXED position sees less than half of it (so the path matters)", fixedLost === tried, `${fixedLost}/${tried} fields`);
  check("mock: at least one field has both bands to judge the colour", hinted >= 1, `${hinted} field(s)`);
  check("mock: its colour is red, as simulated", hinted > 0 && redEnough === hinted, `${redEnough}/${hinted}`);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
