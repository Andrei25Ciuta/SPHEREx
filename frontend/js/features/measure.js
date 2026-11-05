// measure.js – "click a source, get its spectrum and light curve".
//
// 1. The user clicks the image. We turn the click into RA/Dec (canvasToSky).
// 2. getPhotometry() measures the brightness at that RA/Dec in EVERY frame.
// 3. Two charts (Plotly, loaded from the CDN only when first needed):
//      spectrum    = flux vs wavelength, one colour per survey pass (≈ every 6 months)
//      light curve = flux vs date,       one colour per detector
//    plus a plain table (accessibility: same data without colour or a mouse).

import { getPhotometry } from "../data/getCutouts.js";
import { formatRA, formatDec } from "../coords.js";

const PLOTLY_URL = "https://cdn.jsdelivr.net/npm/plotly.js-basic-dist-min@2.35.2/plotly-basic.min.js";

// Categorical colours (dark mode), validated for colour-blind separation on our
// chart surface #1a1d2e (dataviz validate_palette.js: all checks pass).
// Colour follows the ENTITY: detector Dn always gets slot n, whatever is on screen.
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const PASS_SYMBOLS = ["circle", "square", "diamond"];     // second cue besides colour
const MAX_PASSES = 3;      // > 3 colours in a scatter are not reliably distinguishable
const TEXT = "#e5e8f1", TEXT_MUTED = "#9ca2b3", GRID = "rgba(160,170,200,0.12)", SURFACE = "#1a1d2e";
export const APERTURE_RADIUS_PX = 2;

let plotlyPromise = null;
/** Load Plotly once, on demand. Resolves to window.Plotly. */
function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  plotlyPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PLOTLY_URL;
    s.async = true;
    s.onload = () => resolve(window.Plotly);
    s.onerror = () => { plotlyPromise = null; reject(new Error("Could not load the chart library (offline?).")); };
    document.head.appendChild(s);
  });
  return plotlyPromise;
}

/**
 * Canvas click -> sky position. Image convention (mock AND backend): north up, east LEFT,
 * the requested RA/Dec exactly in the centre.
 *   fx, fy        : click position as a fraction of the canvas (0..1, from top-left)
 *   n             : image size in pixels;  scaleArcsec: arcsec per image pixel
 */
export function canvasToSky(fx, fy, { ra, dec, n, scaleArcsec }) {
  const dxArcsec = (fx * n - n / 2) * scaleArcsec;     // + = towards the right = WEST
  const dyArcsec = (fy * n - n / 2) * scaleArcsec;     // + = down = SOUTH
  const decOut = dec - dyArcsec / 3600;
  let raOut = ra - dxArcsec / 3600 / Math.cos((dec * Math.PI) / 180);
  raOut = ((raOut % 360) + 360) % 360;
  return { ra: raOut, dec: decOut, eastArcsec: -dxArcsec, northArcsec: -dyArcsec };
}

/** Split points into survey passes: a gap of > gapDays starts a new pass. */
export function groupIntoPasses(points, gapDays = 30) {
  const passes = [];
  for (const p of [...points].sort((a, b) => a.mjd - b.mjd)) {
    const last = passes.at(-1);
    if (!last || p.mjd - last.endMjd > gapDays) passes.push({ points: [p], startMjd: p.mjd, endMjd: p.mjd });
    else { last.points.push(p); last.endMjd = p.mjd; }
  }
  passes.forEach((ps, i) => { ps.label = `Pass ${i + 1} · ${ps.points[0].dateISO.slice(0, 7)}`; });
  return passes;
}

const detIndex = (det) => Math.max(0, (parseInt(String(det).replace(/\D/g, ""), 10) || 1) - 1) % SERIES.length;

function baseLayout(xTitle, yTitle, xType) {
  const axis = (title) => ({
    title: { text: title, font: { size: 12, color: TEXT_MUTED } },
    color: TEXT_MUTED, gridcolor: GRID, zerolinecolor: "rgba(160,170,200,0.3)", linecolor: GRID,
    tickfont: { size: 11, color: TEXT_MUTED },
  });
  return {
    paper_bgcolor: SURFACE, plot_bgcolor: SURFACE,
    font: { family: "Inter, system-ui, sans-serif", color: TEXT },
    margin: { l: 56, r: 12, t: 8, b: 44 },
    xaxis: { ...axis(xTitle), type: xType },
    yaxis: axis(yTitle),
    legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { size: 11, color: TEXT } },
    hoverlabel: { bgcolor: "#0d0f1a", bordercolor: "#3a3f55", font: { color: TEXT, size: 12 } },
    showlegend: true,
  };
}
const PLOT_CONFIG = {
  responsive: true, displaylogo: false,
  modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines"],
};

function spectrumTraces(points) {
  const passes = groupIntoPasses(points.filter((p) => p.flux !== null));
  // Keep the passes with the most points if there are more than we can colour safely.
  const shown = passes.length > MAX_PASSES
    ? [...passes].sort((a, b) => b.points.length - a.points.length).slice(0, MAX_PASSES).sort((a, b) => a.startMjd - b.startMjd)
    : passes;
  return shown.map((pass, i) => ({
    type: "scatter", mode: "markers", name: pass.label,
    x: pass.points.map((p) => p.wavelengthUm),
    y: pass.points.map((p) => p.flux),
    error_y: { type: "data", array: pass.points.map((p) => p.fluxErr ?? 0), color: SERIES[i], thickness: 1.5, width: 0 },
    error_x: { type: "data", array: pass.points.map((p) => (p.wavelengthMaxUm - p.wavelengthMinUm) / 2), color: SERIES[i], thickness: 1, width: 0 },
    marker: { color: SERIES[i], size: 9, symbol: PASS_SYMBOLS[i], line: { color: SURFACE, width: 2 } },
    customdata: pass.points.map((p) => [p.detector, p.dateISO.slice(0, 10), p.flagged ? " ⚠ flagged" : ""]),
    hovertemplate: "%{x:.3f} µm · %{customdata[0]}<br>%{customdata[1]}<br>flux %{y:.1f}%{customdata[2]}<extra>%{fullData.name}</extra>",
  }));
}

function lightCurveTraces(points) {
  const byDet = new Map();
  for (const p of points) if (p.flux !== null) {
    if (!byDet.has(p.detector)) byDet.set(p.detector, []);
    byDet.get(p.detector).push(p);
  }
  return [...byDet.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([det, pts]) => {
      const c = SERIES[detIndex(det)];
      return {
        type: "scatter", mode: "lines+markers", name: det,
        x: pts.map((p) => p.dateISO), y: pts.map((p) => p.flux),
        error_y: { type: "data", array: pts.map((p) => p.fluxErr ?? 0), color: c, thickness: 1.5, width: 0 },
        line: { color: c, width: 2 },
        marker: { color: c, size: 8, line: { color: SURFACE, width: 2 } },
        customdata: pts.map((p) => [p.wavelengthUm, p.flagged ? " ⚠ flagged" : ""]),
        hovertemplate: "%{x|%Y-%m-%d}<br>%{customdata[0]:.3f} µm<br>flux %{y:.1f}%{customdata[1]}<extra>" + det + "</extra>",
      };
    });
}

function renderTable(table, points) {
  const rows = points.map((p) => `<tr><td>${p.dateISO.slice(0, 16).replace("T", " ")}</td><td>${p.detector}</td>
    <td>${p.wavelengthUm.toFixed(3)}</td><td>${p.flux === null ? "—" : p.flux.toFixed(1)}</td>
    <td>${p.fluxErr === null ? "—" : p.fluxErr.toFixed(1)}</td><td>${p.flagged ? "⚠" : ""}</td></tr>`).join("");
  table.innerHTML = `<thead><tr><th>Date (UTC)</th><th>Detector</th><th>λ (µm)</th><th>Flux</th><th>± Error</th><th>Flag</th></tr></thead><tbody>${rows}</tbody>`;
}

/**
 * Measure at one position and draw everything.
 * els: { pos, charts, note, tableWrap, table, spectrum, lightcurve }
 */
export async function measureAndPlot({ query, sky, els, isCurrent }) {
  els.pos.textContent = `Measuring at RA ${formatRA(sky.ra)}  Dec ${formatDec(sky.dec)} …`;
  const points = await getPhotometry({
    centerRa: query.ra, centerDec: query.dec, fovArcmin: query.fov,
    ra: sky.ra, dec: sky.dec, radiusPx: APERTURE_RADIUS_PX,
  });
  if (!isCurrent()) return;

  const offset = `${Math.abs(sky.eastArcsec).toFixed(1)}″ ${sky.eastArcsec >= 0 ? "E" : "W"}, ` +
                 `${Math.abs(sky.northArcsec).toFixed(1)}″ ${sky.northArcsec >= 0 ? "N" : "S"} of centre`;
  const valid = points.filter((p) => p.flux !== null);
  els.pos.textContent = `Marked: RA ${formatRA(sky.ra)}  Dec ${formatDec(sky.dec)}  (${offset}) · ${valid.length} measurements`;

  renderTable(els.table, points);
  els.tableWrap.hidden = false;
  els.note.hidden = false;
  els.charts.hidden = false;

  if (!valid.length) {
    els.pos.textContent += " – too close to the edge, nothing measured.";
    return;
  }

  let Plotly;
  try { Plotly = await loadPlotly(); }
  catch (err) {
    els.charts.hidden = true;
    els.pos.textContent += ` (${err.message} The table below has the same numbers.)`;
    els.tableWrap.open = true;
    return;
  }
  if (!isCurrent()) return;
  await Plotly.react(els.spectrum, spectrumTraces(points), baseLayout("Wavelength (µm)", "Flux (image units)", "linear"), PLOT_CONFIG);
  await Plotly.react(els.lightcurve, lightCurveTraces(points), baseLayout("Date", "Flux (image units)", "date"), PLOT_CONFIG);
}

/** Remove charts (e.g. new position loaded). */
export function clearMeasurement(els) {
  els.pos.textContent = "";
  els.charts.hidden = true;
  els.note.hidden = true;
  els.tableWrap.hidden = true;
  els.table.innerHTML = "";
  if (window.Plotly) { window.Plotly.purge(els.spectrum); window.Plotly.purge(els.lightcurve); }
}
