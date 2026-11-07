// Could SPHEREx see a distant planet (a "Planet X")?  A back-of-the-envelope limit built from what we MEASURED on real frames.
//
//   node scratch/planet_x_limits.mjs --api http://localhost:8003
//
// 1. The faintest source the dot detector finds in ONE image, measured by injecting fake stars into real frames of clean fields
//    (scratch/calibrate_real.mjs, run on 2026-11-07; the numbers are typed below). The fakes have the PSF of the FITS headers (FWHM
//    5.15" in D2, 6.61" in D6) integrated over the pixels; 100 % of their light falls inside the 2-pixel aperture, so aperture flux = total flux.
// 2. A sanity check of that scale on a real body: Makemake (V about 17, from memory) in the 7 real D2 cutouts of
//    scratch/real_parallax.mjs: its measured flux, and in how many images a dot was found.
// 3. A planet shines by reflected sunlight: V = H + 5 log10(r * delta), and its diameter follows from H and the albedo
//    D = 1329 km / sqrt(albedo) * 10^(-H/5). From the limit of step 1 this gives the largest distance at which a body of a
//    given size would still be found in one image, and in a stack.
//
// FROM MEMORY, not checked here: the H-D-albedo relation and the 1329 km constant; the colour of the Sun (V - J = 1.2 in Vega
// magnitudes, J_AB - J_Vega = 0.91, so J_AB = V - 0.29 for a body with the colour of the Sun); the size, albedo and orbit
// ranges of the hypothetical Planet Nine (radius 2-4 Earth radii, semi-major axis 400-800 AU, perihelion 200-350 AU); the Earth's
// radius (6371 km). Thermal emission is ignored on purpose: at 40 K the Planck curve at 4.6 um is e^-78 of its own scale.

import { apertureSnr, detectSources } from "../frontend/js/features/movers.js";
import { loadField, parseArgs } from "./lib_real.mjs";

const args = parseArgs();
const api = args.api ?? "http://localhost:8003";

// ---- 1) single-image limits, measured (scratch/calibrate_real.mjs, "Single-image detection reaches 50 % at ... and 90 % at ...")
const APERTURE_SHARE = 1.0;                                                        // share of a star's light inside the 2 px circle for these PSFs (calibrate_real.mjs prints 99-100 %)
const MEASURED = [   // total flux (mJy) at which one image detects the fake 50 % / 90 % of the time, in fields with a clean background (calibrate_real.mjs, 40 fakes per cell)
  { label: "WISE 0855 field, D2 (1.1-1.6 um)", ap50: 0.63, ap90: 0.96, band: "D2", snr: "12.9 / 19.8" },
  { label: "WISE 0855 field, D6 (4.2-5.1 um)", ap50: 0.86, ap90: 1.34, band: "D6", snr: "5.6 / 8.8" },
  { label: "Epsilon Indi B field, D6", ap50: 0.68, ap90: 1.12, band: "D6", snr: "6.4 / 10.5" },
];
const abFromMjy = (mjy) => 8.9 - 2.5 * Math.log10(mjy / 1000);                    // AB magnitude from a flux density in mJy
const mjyFromAb = (ab) => 1000 * 10 ** ((8.9 - ab) / 2.5);

console.log(`# Planet X: what could SPHEREx see in one image?\n`);
console.log(`Fakes have the PSF of the FITS headers integrated over the pixels: ${(100 * APERTURE_SHARE).toFixed(0)} % of their light falls inside the 2-pixel aperture.
`);
console.log(`| field | 50 % limit (total mJy -> AB; S/N in the 2-pixel aperture) | 90 % limit |`);
console.log(`|---|---|---|`);
for (const m of MEASURED) {
  const t50 = m.ap50 / APERTURE_SHARE, t90 = m.ap90 / APERTURE_SHARE;
  console.log(`| ${m.label} | ${t50.toFixed(2)} mJy -> AB ${abFromMjy(t50).toFixed(2)} (S/N ${m.snr.split(" / ")[0]}) | ${t90.toFixed(2)} mJy -> AB ${abFromMjy(t90).toFixed(2)} (S/N ${m.snr.split(" / ")[1]}) |`);
}

// ---- 2) sanity check on a real body: Makemake
const ROWS = [   // mjd, RA, Dec of Makemake at that time (JPL Horizons, as in real_parallax.mjs)
  [60827.32163, 200.00676, 21.52277], [60834.86410, 199.93729, 21.48510], [60860.00764, 199.81978, 21.29442],
  [61040.16488, 202.30080, 20.14061], [61049.25866, 202.34957, 20.20221], [61195.65318, 200.74359, 21.01326], [61200.60870, 200.69920, 20.98785],
];
const omega = (6.14 / 206264.806) ** 2;
console.log(`\n## Makemake in 7 real D2 cutouts (centred on its Horizons position): flux at the dot nearest the centre\n`);
console.log(`| date | wavelength um | dot within 5 px | aperture flux mJy | S/N (ring noise) | total flux mJy | AB mag |`);
console.log(`|---|---|---|---|---|---|---|`);
const totals = [];
for (const [mjd, ra, dec] of ROWS) {
  const f = await loadField(api, ra, dec, 5, "D2");
  const k = f.frames.findIndex((x) => Math.abs(x.mjd - mjd) < 1e-3);
  if (k < 0) { console.log(`| MJD ${mjd} | not served by the backend | | | | | |`); continue; }
  const { arrays, masks, n } = f;
  const dots = detectSources(arrays[k], n, { sigmaFloor: 1e-9, mask: masks[k], detectSigma: 4 });
  const near = dots.map((d) => ({ ...d, r: Math.hypot(d.x - n / 2, d.y - n / 2) })).filter((d) => d.r <= 5).sort((a, b) => a.r - b.r)[0];
  const x = near ? near.x : n / 2, y = near ? near.y : n / 2;
  const ap = apertureSnr(arrays[k], n, x, y, 2);
  if (!ap) { console.log(`| ${f.frames[k].dateISO.slice(0, 10)} | | ${near ? "yes" : "no"} | not measurable | | | |`); continue; }
  const apMjy = ap.flux * omega * 1e9, totalMjy = apMjy / APERTURE_SHARE;
  totals.push({ found: !!near, total: totalMjy });
  console.log(`| ${f.frames[k].dateISO.slice(0, 10)} | ${f.frames[k].wavelengthUm?.toFixed?.(2) ?? "?"} | ${near ? "yes (S/N " + near.snr.toFixed(1) + ")" : "no"} | ${apMjy.toFixed(2)} | ${ap.snr.toFixed(1)} | ${totalMjy.toFixed(2)} | ${totalMjy > 0 ? abFromMjy(totalMjy).toFixed(2) : "-"} |`);
}
const ok = totals.filter((t) => t.total > 0).map((t) => t.total).sort((a, b) => a - b);
if (ok.length) console.log(`\nMedian total flux ${ok[Math.floor(ok.length / 2)].toFixed(2)} mJy = AB ${abFromMjy(ok[Math.floor(ok.length / 2)]).toFixed(2)}; a dot was found in ${totals.filter((t) => t.found).length} of ${totals.length} images (compare with the 50 % limit above).`);

// ---- 3) reflected light of a planet
const R_EARTH_KM = 6371;
const hFrom = (diameterKm, albedo) => -5 * Math.log10((diameterKm * Math.sqrt(albedo)) / 1329);   // absolute magnitude from size and albedo
const vAt = (h, distanceAu) => h + 5 * Math.log10(distanceAu * distanceAu);                       // r = delta = d: near opposition, d >> 1 AU
const maxDistanceAu = (h, vLimit) => 10 ** ((vLimit - h) / 10);
const J_AB_TO_V = 0.29;                                                                           // V = J_AB + 0.29 for a Sun-coloured body (from memory)

console.log(`\n## Reflected light of a planet (sizes in Earth radii, albedo 0.3 / 0.5)\n`);
const t50 = MEASURED[0].ap50 / APERTURE_SHARE, t90 = MEASURED[0].ap90 / APERTURE_SHARE;
const vLimits = [
  { label: "one image, 50 % of the time", v: abFromMjy(t50) + J_AB_TO_V },
  { label: "one image, 90 % of the time", v: abFromMjy(t90) + J_AB_TO_V },
  { label: "stack of 15 images (-1.47 mag)", v: abFromMjy(t90) + J_AB_TO_V + 2.5 * Math.log10(Math.sqrt(15)) },
  { label: "stack of 60 images (-2.22 mag)", v: abFromMjy(t90) + J_AB_TO_V + 2.5 * Math.log10(Math.sqrt(60)) },
];
console.log(`Limits in V (D2 clean field, Sun-coloured body): ${vLimits.map((l) => `${l.label}: V ${l.v.toFixed(1)}`).join("; ")}\n`);
console.log(`| radius | albedo | H | V at 300 AU | V at 500 AU | V at 1000 AU | farthest AU: ${vLimits.map((l) => l.label).join(" | ")} |`);
console.log(`|---|---|---|---|---|---|${vLimits.map(() => "---").join("|")}|`);
for (const r of [2, 3, 4]) for (const p of [0.3, 0.5]) {
  const h = hFrom(2 * r * R_EARTH_KM, p);
  console.log(`| ${r} R_E | ${p} | ${h.toFixed(1)} | ${vAt(h, 300).toFixed(1)} | ${vAt(h, 500).toFixed(1)} | ${vAt(h, 1000).toFixed(1)} | ${vLimits.map((l) => maxDistanceAu(h, l.v).toFixed(0)).join(" | ")} |`);
}
const hMake = hFrom(1430, 0.8);
console.log(`\nCheck of the formula on Makemake (diameter about 1430 km, albedo about 0.8, both from memory): H = ${hMake.toFixed(2)}, V at 52 AU = ${vAt(hMake, 52).toFixed(1)} (the real value is about 17).`);
const hStack = hFrom(2 * 3 * R_EARTH_KM, 0.4);
const need = 10 ** ((vAt(hStack, 500) - vLimits[1].v) / 2.5);
console.log(`A 3 R_E, albedo 0.4 body at 500 AU is V ${vAt(hStack, 500).toFixed(1)}: ${(vAt(hStack, 500) - vLimits[1].v).toFixed(1)} magnitudes below the 90 % one-image limit, i.e. a flux ratio of ${need.toFixed(0)}, which a plain stack would need about ${(need ** 2).toFixed(0)} images to reach (noise falls as the square root; the body moves, so the images must be shifted along its track first).`);
void mjyFromAb;
