// Infrared source grouping: spatial detections, no proper-motion requirement.
// This is a candidate-ranking heuristic, NOT physical spectroscopy or a discovery classifier.
export function groupInfraredDetections(detections, { radiusArcsec = 12, limit = 150 } = {}) {
  const groups = [];
  const ordered = [...detections].filter(d => Number.isFinite(d.ra) && Number.isFinite(d.dec) && Number.isFinite(d.snr))
    .sort((a,b) => b.snr - a.snr);
  for (const d of ordered) {
    const group = groups.find(g => {
      let dra = ((d.ra - g.ra + 540) % 360) - 180;
      return Math.hypot(dra * Math.cos(g.dec * Math.PI / 180), d.dec - g.dec) * 3600 <= radiusArcsec;
    });
    if (group) {
      if (group.members.some(m => m.frameId === d.frameId)) continue;
      group.members.push(d);
    } else if (groups.length < limit * 4) {
      groups.push({ ra: d.ra, dec: d.dec, members: [d] });
    }
  }
  return groups.map(g => {
    const bands = [...new Set(g.members.map(m => m.detector))].sort();
    const maxSnr = Math.max(...g.members.map(m => m.snr));
    const wavelengths = g.members.map(m => m.wavelengthUm).filter(Number.isFinite);
    // A heuristic for investigation priority, NOT an astrophysical anomaly probability.
    const score = Math.min(100, Math.round(8 * Math.log2(1 + maxSnr) + 9 * Math.min(bands.length, 6) + 3 * Math.min(g.members.length, 6)));
    return { ...g, bands, maxSnr, score, wavelengthRange: wavelengths.length ? [Math.min(...wavelengths), Math.max(...wavelengths)] : null };
  }).sort((a,b) => b.score - a.score).slice(0,limit);
}
export function matchInfraredCatalogue(groups, objects, radiusArcsec = 12) {
  return groups.map(g => {
    let nearest = null, best = Infinity;
    for (const o of objects || []) {
      if (!Number.isFinite(o.ra) || !Number.isFinite(o.dec)) continue;
      const dra = ((g.ra - o.ra + 540) % 360) - 180;
      const sep = Math.hypot(dra * Math.cos(g.dec * Math.PI / 180), g.dec - o.dec) * 3600;
      if (sep < best) { best = sep; nearest = o; }
    }
    return { ...g, match: best <= radiusArcsec ? { name: nearest.label || nearest.id || "SIMBAD source", type: nearest.otype || "unknown", separationArcsec: best } : null };
  });
}
