import test from "node:test";
import assert from "node:assert/strict";
import { groupInfraredDetections, matchInfraredCatalogue } from "../js/features/infraredExplorer.js";

test("stationary peaks in multiple bands group without motion", () => {
  const d = [
    { ra: 10, dec: 20, snr: 12, detector: "D1", frameId: 0, wavelengthUm: 1 },
    { ra: 10.0001, dec: 20, snr: 8, detector: "D6", frameId: 1, wavelengthUm: 4.8 },
    { ra: 11, dec: 20, snr: 7, detector: "D3", frameId: 2, wavelengthUm: 2 },
  ];
  const g = groupInfraredDetections(d);
  assert.equal(g.length, 2);
  assert.equal(g[0].bands.length, 2);
  assert.deepEqual(g[0].wavelengthRange, [1, 4.8]);
});
test("catalogue match is positional and absence is not a discovery", () => {
  const g = groupInfraredDetections([{ ra: 30, dec: 0, snr: 10, detector: "D5", frameId: 0 }]);
  assert.equal(matchInfraredCatalogue(g, [])[0].match, null);
  assert.equal(matchInfraredCatalogue(g, [{ ra: 30.0001, dec: 0, label: "known", otype: "Star" }])[0].match.name, "known");
});
test("RA wrap near zero degrees groups correctly", () => {
  const g = groupInfraredDetections([
    { ra: 359.9999, dec: 0, snr: 8, detector: "D1", frameId: 0 },
    { ra: 0.0001, dec: 0, snr: 8, detector: "D2", frameId: 1 },
  ]);
  assert.equal(g.length, 1);
});
