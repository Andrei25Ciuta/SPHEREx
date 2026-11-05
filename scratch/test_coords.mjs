// Quick sanity tests for coords.js and targets.js. Run: node scratch/test_coords.mjs
import { parseRA, parseDec, formatRA, formatDec } from "../frontend/js/coords.js";
import { TARGETS, positionAtEpoch } from "../frontend/js/targets.js";

const cases = [
  ["RA", parseRA, "133.7951"], ["RA", parseRA, "08h55m10.831s"], ["RA", parseRA, "08 55 10.831"],
  ["RA", parseRA, "08:55:10.831"], ["RA", parseRA, "24h00m00s"], ["RA", parseRA, "-10"], ["RA", parseRA, "h"],
  ["Dec", parseDec, "-7.2451"], ["Dec", parseDec, "-07d14m42.53s"], ["Dec", parseDec, "−07°14′42.53″"],
  ["Dec", parseDec, "-00 30 00"], ["Dec", parseDec, "+91"], ["Dec", parseDec, "12 75 00"], ["Dec", parseDec, "abc"],
];
for (const [k, fn, s] of cases) console.log(k.padEnd(4), JSON.stringify(s).padEnd(18), JSON.stringify(fn(s)));
console.log(formatRA(133.7951), formatDec(-7.2451), formatRA(359.99999), formatDec(-0.5));
for (const t of TARGETS) { const p = positionAtEpoch(t); console.log(t.label.padEnd(16), p.ra.toFixed(5), p.dec.toFixed(5)); }
