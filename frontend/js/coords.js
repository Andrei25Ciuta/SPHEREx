// coords.js – parse and format sky coordinates.
//
// Accepted input (examples):
//   RA : "133.7951"          -> decimal DEGREES (a single number = degrees)
//        "08h55m10.831s"     -> hours, minutes, seconds
//        "08 55 10.831" / "08:55:10.831"  -> also hours (2–3 parts = sexagesimal)
//   Dec: "-7.2451"           -> decimal degrees
//        "-07d14m42.53s", "-07°14′42.53″", "-07 14 42.53", "-07:14:42.53"
//
// Every parse function returns a small result object instead of throwing:
//   { ok: true,  deg: 133.7951 }
//   { ok: false, error: "human readable message" }
// so the UI can show the message next to the input field.

/**
 * Split a sexagesimal-ish string into a sign and up to 3 numeric parts.
 * "-07d14m42.53s" -> { sign: -1, parts: [7, 14, 42.53] }
 * We read the sign from the TEXT, because parseFloat("-00") === -0 would lose it
 * for declinations like "-00 30 00" (which is -0.5 deg, not +0.5).
 */
function splitParts(input) {
  let s = String(input).trim()
    .replace(/\u2212/g, "-")              // Unicode minus "−" -> ASCII "-"
    .replace(/,/g, ".");                   // allow decimal comma "133,79"

  let sign = 1;
  if (s.startsWith("-")) { sign = -1; s = s.slice(1); }
  else if (s.startsWith("+")) { s = s.slice(1); }

  // Replace unit letters/symbols and colons with spaces, then split.
  // h d m s ° ' ′ " ″ :  all act as separators.
  const tokens = s.replace(/[hdms°'′"″:]/gi, " ").trim().split(/\s+/).filter(Boolean);

  const parts = tokens.map(Number);
  return { sign, parts };
}

/** Check minutes/seconds are numbers in [0, 60). Returns an error string or null. */
function checkMinSec(parts) {
  if (parts.length === 0) return "No numbers found.";
  if (parts.some((p) => !Number.isFinite(p))) return "Contains something that is not a number.";
  if (parts.length > 3) return "Too many parts – use at most 3 (e.g. 08 55 10.8).";
  for (let i = 1; i < parts.length; i++) {
    if (parts[i] < 0 || parts[i] >= 60) return "Minutes and seconds must be between 0 and 60.";
  }
  return null;
}

/** Combine [a, b, c] into a + b/60 + c/3600. */
const toDecimal = (parts) => parts.reduce((sum, p, i) => sum + p / 60 ** i, 0);

/**
 * Parse Right Ascension. Returns degrees in [0, 360).
 * Rule: ONE plain number = degrees; units "h" or 2–3 parts = hours (×15 to get degrees).
 */
export function parseRA(input) {
  if (!String(input).trim()) return { ok: false, error: "Please enter a Right Ascension." };

  const { sign, parts } = splitParts(input);
  if (sign < 0) return { ok: false, error: "RA cannot be negative." };

  const err = checkMinSec(parts);
  if (err) return { ok: false, error: err };

  const isPlainDegrees = parts.length === 1 && !/h/i.test(String(input));
  if (isPlainDegrees) {
    const deg = parts[0];
    if (deg < 0 || deg >= 360) return { ok: false, error: "RA in degrees must be between 0 and 360." };
    return { ok: true, deg };
  }

  const hours = toDecimal(parts);
  if (parts[0] >= 24 || hours >= 24) return { ok: false, error: "RA hours must be between 0 and 24." };
  return { ok: true, deg: hours * 15 };
}

/** Parse Declination. Returns degrees in [-90, +90]. */
export function parseDec(input) {
  if (!String(input).trim()) return { ok: false, error: "Please enter a Declination." };

  const { sign, parts } = splitParts(input);
  const err = checkMinSec(parts);
  if (err) return { ok: false, error: err };

  const deg = sign * toDecimal(parts);
  if (Math.abs(deg) > 90) return { ok: false, error: "Dec must be between −90 and +90 degrees." };
  return { ok: true, deg };
}

/**
 * Format decimal degrees as sexagesimal text, handling the "59.999 -> 60" rounding carry.
 * value: number in the target unit (hours for RA, degrees for Dec)
 */
function toSexagesimal(value, secDecimals) {
  const sign = value < 0 ? "-" : "+";
  const scale = 10 ** secDecimals;
  // Work in integer units of the last decimal of seconds to avoid float carry bugs.
  let total = Math.round(Math.abs(value) * 3600 * scale);
  const s = (total % (60 * scale)) / scale; total = Math.floor(total / (60 * scale));
  const m = total % 60;
  const d = Math.floor(total / 60);
  return { sign, d, m, s };
}

const pad = (n, width) => String(n).padStart(width, "0");

/** 133.7951 -> "08h55m10.82s" */
export function formatRA(deg) {
  const { d, m, s } = toSexagesimal(deg / 15, 2);
  const h = d % 24;                      // 23h59m59.999s rounds up to 24h -> show 00h
  return `${pad(h, 2)}h${pad(m, 2)}m${s.toFixed(2).padStart(5, "0")}s`;
}

/** -7.2451 -> "-07°14′42.4″" */
export function formatDec(deg) {
  const { sign, d, m, s } = toSexagesimal(deg, 1);
  return `${sign}${pad(d, 2)}°${pad(m, 2)}′${s.toFixed(1).padStart(4, "0")}″`;
}
