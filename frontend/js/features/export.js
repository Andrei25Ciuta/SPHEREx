// export.js – the candidates of "Find movers" / "Look for a distant body" as CSV and JSON.
//
// Every row says what the data is (real SPHEREx or synthetic) and carries a permalink to the exact view, so a
// file passed around cannot be mistaken for something it is not, and anyone can reopen the field it came from.
// Pure functions (no DOM): the download itself is done by main.js.

export const COLUMNS = [
  "candidate", "kind", "ra_deg", "dec_deg", "epoch_mjd", "speed_arcsec_per_yr", "pm_east_arcsec_per_yr", "pm_north_arcsec_per_yr",
  "position_angle_deg", "detections", "images", "significance_sigma", "rms_px", "known_object",
  "distance_au", "distance_range_lo_au", "distance_range_hi_au", "own_velocity_kms", "bound_to_sun",
  "asteroid_match", "asteroid_dates", "detector", "field_ra_deg", "field_dec_deg", "field_fov_arcmin", "data", "permalink",
];

/** What the data behind a file is: the sentence that must travel with it. */
export const dataLabel = (isReal) => (isReal
  ? "real SPHEREx data (served by the project's backend)"
  : "SYNTHETIC demo data (invented in the browser, NOT SPHEREx observations)");

/** One CSV cell. Text starting with = + - @ would be run as a formula by a spreadsheet: it gets a leading apostrophe. */
function cell(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (v, digits) => (Number.isFinite(v) ? Number(v.toFixed(digits)) : null);

/**
 * One flat record per candidate.
 * ctx = { isReal, detector, query: { ra, dec, fov }, permalink }
 */
export function candidateRecords(candidates, ctx) {
  return candidates.map((m) => {
    const top = m.asteroids?.[0];
    return {
      candidate: m.label,
      kind: m.distant ? "distant body (parallax)" : "mover (straight line)",
      ra_deg: round(m.ra, 6), dec_deg: round(m.dec, 6), epoch_mjd: round(m.mjdRef, 3),
      speed_arcsec_per_yr: round(m.speedArcsecPerYear, 3),
      pm_east_arcsec_per_yr: round(m.pmEastArcsecPerYear, 3), pm_north_arcsec_per_yr: round(m.pmNorthArcsecPerYear, 3),
      position_angle_deg: round(m.positionAngleDeg, 1),
      detections: m.nDet, images: m.nFrames, significance_sigma: round(m.significance, 1), rms_px: round(m.rms, 3),
      known_object: m.known ?? "",
      distance_au: m.distant ? round(m.distanceAU, 0) : null,
      distance_range_lo_au: m.distant ? round(m.distanceRangeAU?.[0], 0) : null,
      distance_range_hi_au: m.distant ? round(m.distanceRangeAU?.[1], 0) : null,
      own_velocity_kms: m.distant ? round(m.distant.ownVelocityKms, 2) : null,
      bound_to_sun: m.distant ? m.distant.bound : null,
      asteroid_match: top ? top.name : (m.asteroids ? "none within 20 arcsec" : "not checked"),
      asteroid_dates: top ? top.hits : null,
      detector: ctx.detector, field_ra_deg: round(ctx.query.ra, 5), field_dec_deg: round(ctx.query.dec, 5), field_fov_arcmin: ctx.query.fov,
      data: dataLabel(ctx.isReal), permalink: ctx.permalink,
    };
  });
}

/** CSV text (header + one line per candidate; "\r\n" line ends, as spreadsheets expect). */
export function candidatesToCsv(candidates, ctx) {
  const rows = candidateRecords(candidates, ctx);
  return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** JSON text: the same records plus what produced them and what the data is. */
export function candidatesToJson(candidates, ctx, { generated = new Date().toISOString() } = {}) {
  return JSON.stringify({
    tool: "SPHEREx Blink (NASA Space Apps 2026)",
    generated,
    data: dataLabel(ctx.isReal),
    field: { ra_deg: ctx.query.ra, dec_deg: ctx.query.dec, fov_arcmin: ctx.query.fov, detector: ctx.detector },
    permalink: ctx.permalink,
    note: "Candidates are not discoveries: each needs checking against the other detectors and the catalogues.",
    candidates: candidateRecords(candidates, ctx),
  }, null, 2) + "\n";
}

/** A file name that says what is inside: spherex-blink_candidates_<ra>_<dec>_<detector>[_synthetic].csv */
export function exportFileName(ctx, extension) {
  return `spherex-blink_candidates_${ctx.query.ra.toFixed(4)}_${ctx.query.dec.toFixed(4)}_${ctx.detector}${ctx.isReal ? "" : "_synthetic"}.${extension}`;
}
