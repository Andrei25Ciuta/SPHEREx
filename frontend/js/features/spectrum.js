// spectrum.js – a colour hint for the spectrum of a moving object (measured along its path).
//
// SPHEREx's job is spectra, and what a mover IS shows in its colour (F_nu = flux density):
//   ordinary star      F_nu falls with wavelength (Rayleigh-Jeans: ~ lambda^-2): F(4-5 um)/F(1-2 um) is about 0.1
//   reflected sunlight about flat to slightly red: 0.3 - 1.5
//   warm asteroid      adds heat glow beyond ~3.5 um, so it is red: 1.5 - 10
//   cold brown dwarf   very little light at 1-2 um, much more at 4-5 um: > 10 (WISE 0855 is the extreme)
// The thresholds are textbook orders of magnitude, applied to UNCALIBRATED aperture sums: a hint to
// look closer, not a classification. Pure functions, so they also run in Node tests.
// First test on a REAL object (7 Nov 2026, docs/VALIDATION.md §3): Epsilon Indi B (an unresolved T1 + T6 brown
// dwarf pair, D2 + D6, 7 usable points at 1-2 um and 4 at 4-5 um) gives 0.65, i.e. "neutral", NOT "red"; the "very red"
// class is for the coldest objects (WISE 0855). Barnard's Star (M dwarf) gives about 0.48 on flagged lower limits, so the
// hint cannot yet tell an M dwarf from an early T dwarf.

export const BANDS = { short: [0.7, 2.0], long: [3.5, 5.1] };       // micrometres
const MIN_POINTS = 2;                                               // measurements needed in EACH band

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Which flux column to use: Jansky when every measurement has it (real files), else the image units. */
export function fluxColumn(points) {
  const measured = points.filter((p) => p.flux !== null && p.flux !== undefined);
  return measured.length && measured.every((p) => p.fluxJy !== null && p.fluxJy !== undefined) ? "fluxJy" : "flux";
}

/**
 * points: [{ wavelengthUm, flux, fluxJy?, flagged? }] measured along the path of an object.
 * Returns { kind, ratio, text, nShort, nLong } with kind in
 * "star" | "neutral" | "red" | "very-red" | "unknown".
 */
export function colourHint(points) {
  const column = fluxColumn(points);
  const inBand = ([lo, hi]) => points
    .filter((p) => p[column] !== null && p[column] !== undefined && !p.flagged && p.wavelengthUm >= lo && p.wavelengthUm < hi)
    .map((p) => p[column]);
  const short = inBand(BANDS.short), long = inBand(BANDS.long);
  const base = { nShort: short.length, nLong: long.length };
  if (short.length < MIN_POINTS || long.length < MIN_POINTS) {
    const missing = short.length < MIN_POINTS ? "1–2 µm" : "4–5 µm";
    // Measurements that exist but were left out because their aperture has bad-pixel flags.
    const skipped = points.filter((p) => p.flagged && p[column] !== null && p[column] !== undefined
      && ((p.wavelengthUm >= BANDS.short[0] && p.wavelengthUm < BANDS.short[1]) || (p.wavelengthUm >= BANDS.long[0] && p.wavelengthUm < BANDS.long[1]))).length;
    const why = skipped
      ? ` ${skipped} measurement${skipped === 1 ? " has" : "s have"} flagged pixels in the aperture (overflow, transient or other bad-pixel bits; a very bright star can overflow the detector) and ${skipped === 1 ? "was" : "were"} left out, because their brightness is not reliable.`
      : "";
    return { ...base, kind: "unknown", ratio: null, nFlagged: skipped,
      text: `Not enough usable measurements at ${missing} to judge its colour (need ${MIN_POINTS}+ in both the 1–2 µm and the 4–5 µm range, i.e. images from a short- and a long-wavelength detector).${why}` };
  }
  const s = median(short), l = median(long);
  const ratio = s > 0 ? l / s : (l > 0 ? Infinity : 0);
  const shown = Number.isFinite(ratio) ? ratio.toFixed(ratio < 1 ? 2 : 1) : "very large";
  const head = `Colour hint: flux at 4–5 µm divided by flux at 1–2 µm = ${shown}. `;
  if (ratio >= 10) return { ...base, kind: "very-red", ratio, text: head + "Very red: far brighter at long wavelengths than at short ones. Ordinary stars are never like this; cold brown dwarfs are." };
  if (ratio >= 1.5) return { ...base, kind: "red", ratio, text: head + "Red: brighter at long wavelengths. A warm asteroid (heat glow) or a cool brown dwarf would look like this." };
  if (ratio >= 0.3) return { ...base, kind: "neutral", ratio, text: head + "Neutral: flatter than an ordinary hot star. Reflected sunlight, a star with an infrared excess, or a warm brown dwarf (the real pair Epsilon Indi B measured 0.65 here). A cool M dwarf is not far below this range, so do not read it as a classification." };
  return { ...base, kind: "star", ratio, text: head + "Star-like: it fades toward long wavelengths like an ordinary star." };
}
