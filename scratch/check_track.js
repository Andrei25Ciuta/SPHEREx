// Browser-console helper: how far is WISE 0855 from its predicted position, frame by frame?
// Open the app page (http://localhost:8765), paste this file into the DevTools console, then:
//   await checkTrack("api", "D6")    // or "mock"; any detector name
window.checkTrack = async function (source, det) {
  const { positionAtEpoch, TARGETS } = await import("/js/targets.js");
  const { skyToCanvas, mjdToYear } = await import("/js/geometry.js");
  const { getCutoutsMock } = await import("/js/data/mockSource.js");
  const { getCutoutsApi } = await import("/js/data/apiSource.js");
  const wise = TARGETS.find((t) => t.id === "wise0855");
  const q = { ra: 133.75976, dec: -7.24219, fovArcmin: 5, detector: det };   // quick-pick position
  const frames = (source === "api" ? await getCutoutsApi(q) : await getCutoutsMock(q))
    .filter((f) => f.detector === det).sort((a, b) => a.mjd - b.mjd);
  const rows = [];
  for (const f of frames) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = f.imageUrl; await img.decode();
    const n = img.naturalWidth, c = document.createElement("canvas"); c.width = c.height = n;
    const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, n, n).data;
    const g = (x, y) => d[4 * (y * n + x)];
    const all = []; for (let i = 0; i < n * n; i++) all.push(d[4 * i]); all.sort((a, b) => a - b);
    const bg = all[all.length >> 1];
    const scale = f.pixelScaleArcsec ?? (q.fovArcmin * 60) / n;
    const p = positionAtEpoch(wise, mjdToYear(f.mjd));
    const { fx, fy } = skyToCanvas(p.ra, p.dec, { ra: q.ra, dec: q.dec, n, scaleArcsec: scale });
    const px = fx * n, py = fy * n;                       // edge coordinates
    let sw = 0, sx = 0, sy = 0;                           // light centroid within 3 px
    for (let y = Math.floor(py - 3); y <= Math.ceil(py + 3); y++) for (let x = Math.floor(px - 3); x <= Math.ceil(px + 3); x++) {
      if (x < 0 || y < 0 || x >= n || y >= n || Math.hypot(x + 0.5 - px, y + 0.5 - py) > 3) continue;
      const w = Math.max(0, g(x, y) - bg); sw += w; sx += w * (x + 0.5); sy += w * (y + 0.5);
    }
    rows.push(`${f.dateISO.slice(0, 10)}  predicted (${px.toFixed(2)}, ${py.toFixed(2)})  measured (${(sx / sw).toFixed(2)}, ${(sy / sw).toFixed(2)})  offset ${Math.hypot(sx / sw - px, sy / sw - py).toFixed(2)} px`);
  }
  return rows;
};
