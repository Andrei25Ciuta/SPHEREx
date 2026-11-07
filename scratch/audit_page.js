// Quick accessibility / responsive audit of the SPHEREx Blink page. Paste it into the browser console (or run it with the
// Browser pane's javascript tool) on the loaded page, at the viewport you want to check:  phone 375 x 812, tablet 768 x 1024,
// projector 1280 x 720. It checks what a script CAN check; it does not replace a screen reader or a real phone (see docs/ACCESSIBILITY.md).
//
//   horizontal overflow, small touch targets (< 24 px = WCAG 2.5.8; < 44 px = the usual comfortable touch size),
//   text smaller than 12 px, text contrast against a plain background (WCAG 1.4.3: 4.5:1, or 3:1 for large text),
//   controls without an accessible name.
(() => {
  const vw = innerWidth;
  const out = { viewport: `${vw} x ${innerHeight}`, docScrollWidth: document.documentElement.scrollWidth };
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden]") && !el.closest(".sr-only");
  };
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}`;

  out.overflow = [...document.querySelectorAll("body *")]
    .filter((el) => vis(el) && el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed")
    .slice(0, 8).map((el) => `${desc(el)} right=${Math.round(el.getBoundingClientRect().right)}`);

  const interactive = [...document.querySelectorAll("a[href], button, input, select, summary, textarea")].filter(vis);
  out.interactive = interactive.length;
  const side = (el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); };
  out.targetsUnder24 = interactive.filter((el) => side(el) < 24 && el.type !== "radio" && el.type !== "checkbox").map((el) => `${desc(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  out.targetsUnder44 = interactive.filter((el) => side(el) < 44).length;
  out.noAccessibleName = interactive.filter((el) => !(el.getAttribute("aria-label") || el.getAttribute("title") || (el.labels && el.labels.length) || el.textContent.trim() || el.getAttribute("aria-labelledby"))).map(desc);

  const texts = [...document.querySelectorAll("body *")].filter((el) => vis(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  out.textUnder12px = texts.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12).slice(0, 10).map((el) => `${desc(el)} ${getComputedStyle(el).fontSize}`);

  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const background = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.backgroundImage !== "none") return null; const b = parse(s.backgroundColor); if (b && b.a > 0.5) return b.c; } return [14, 28, 34]; };
  const low = [];
  for (const el of texts) {
    const s = getComputedStyle(el), fg = parse(s.color), bg = background(el);
    if (!fg || !bg) continue;                                        // text over an image or gradient: not checked here
    const l1 = lum(fg.c), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) low.push(`${desc(el)} ${ratio.toFixed(2)}:1 "${el.textContent.trim().slice(0, 30)}"`);
  }
  out.lowContrast = low.slice(0, 10);
  return out;
})();
