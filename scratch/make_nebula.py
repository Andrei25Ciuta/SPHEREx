"""Generate our OWN nebula image (no third-party pixels, so no licence problem).

Palette (green / gold / mint on near-black) was sampled from a reference photo's colours;
only the colours are reused, no pixels, no composition copied.

  hero  : frontend/img/header-nebula-hd.jpg   2560x1440
  page  : frontend/img/bg-nebula.jpg          1920x1080, darkened so UI text keeps its contrast

Run:  backend/.venv/Scripts/python.exe scratch/make_nebula.py
Method: double domain-warped fractal noise = fluid gas clouds, soft dust lanes, gold filaments,
colour ramps, then crisp stars (diffraction spikes on the brightest), glow, grain, vignette.
"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 2560, 1440
rng = np.random.default_rng(2026)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def smooth(cell, seed):
    r = np.random.default_rng(seed)
    gw, gh = int(np.ceil(W / cell)) + 3, int(np.ceil(H / cell)) + 3
    a = Image.fromarray(r.random((gh, gw)).astype(np.float32), mode="F")
    a = a.resize((int(gw * cell), int(gh * cell)), Image.BICUBIC)
    return np.asarray(a)[:H, :W]


def fbm(cell, octaves, seed, gain=0.52):
    t, amp, norm = np.zeros((H, W), np.float32), 1.0, 0.0
    for i in range(octaves):
        t += smooth(max(2.0, cell / 2 ** i), seed + 7 * i) * amp
        norm += amp
        amp *= gain
    return t / norm


def ridged(cell, octaves, seed):
    t, amp, norm = np.zeros((H, W), np.float32), 1.0, 0.0
    for i in range(octaves):
        n = smooth(max(2.0, cell / 2 ** i), seed + 5 * i)
        t += (1 - np.abs(2 * n - 1)) ** 2 * amp
        norm += amp
        amp *= 0.55
    return t / norm


def sample(field, ox, oy):
    xi = np.clip(xx + ox, 0, W - 1).astype(np.int32)
    yi = np.clip(yy + oy, 0, H - 1).astype(np.int32)
    return field[yi, xi]


def norm01(a, lo=15, hi=99.5):
    p0, p1 = np.percentile(a, [lo, hi])
    return np.clip((a - p0) / (p1 - p0), 0, 1)


def blob(cx, cy, rx, ry):
    return np.exp(-(((xx - cx * W) / (rx * W)) ** 2 + ((yy - cy * H) / (ry * H)) ** 2))


def cloud(seed, cell=520, w1=520, w2=760):
    """p + fbm(p + fbm(p)) style double warp: fluid, swirling gas."""
    A, B, C, D = (fbm(cell, 6, seed + 11 * k) for k in range(4))
    r1x = sample(B, (A - 0.5) * w1, (C - 0.5) * w1)
    r1y = sample(D, (C - 0.5) * w1, (A - 0.5) * w1)
    return norm01(sample(A, (r1x - 0.5) * w2, (r1y - 0.5) * w2))


# --- layout: where the gas lives --------------------------------------------------------
mass = (1.00 * blob(0.66, 0.66, 0.21, 0.27) +        # bright lower-right lobe
        0.85 * blob(0.50, 0.34, 0.19, 0.25) +        # upper-centre cloud (gold)
        0.70 * blob(0.38, 0.60, 0.17, 0.21) +        # teal swirls
        0.40 * blob(0.86, 0.40, 0.15, 0.30) +        # faint right-edge wisps
        0.30 * blob(0.12, 0.78, 0.15, 0.20) +
        0.25 * blob(0.25, 0.20, 0.18, 0.16))
gas = cloud(11) ** 1.25
density = gas * np.clip(mass, 0, 1.15)

dust = cloud(47, cell=380, w1=420, w2=560)                       # soft dark lanes
density *= 1 - 0.5 * np.clip((dust - 0.55) / 0.30, 0, 1) ** 1.4
density *= 0.80 + 0.35 * fbm(34, 4, 91)                          # fine texture
density = np.clip(density, 0, 1)

gold_zone = blob(0.52, 0.34, 0.16, 0.21) + 0.30 * blob(0.72, 0.56, 0.09, 0.11)
gold_gas = cloud(63, cell=420, w1=480, w2=700) ** 1.2
fil = np.clip((ridged(130, 5, 77) - 0.55) / 0.30, 0, 1)         # thin bright filaments
gold = np.clip(gold_zone * (1.25 * gold_gas + 0.9 * fil), 0, 1)
teal_zone = blob(0.37, 0.62, 0.15, 0.18)


# --- colour ramps (sampled from the reference photo's colours) ---------------------------
def ramp(t, stops):
    xs = [s[0] for s in stops]
    return np.stack([np.interp(t, xs, [s[1][c] for s in stops]) for c in range(3)], axis=-1)


col = ramp(density, [
    (0.00, (0.006, 0.010, 0.008)), (0.18, (0.020, 0.075, 0.050)), (0.42, (0.060, 0.260, 0.150)),
    (0.68, (0.300, 0.640, 0.400)), (0.88, (0.600, 0.880, 0.690)), (1.00, (0.920, 1.000, 0.940))])
col = col * (1 - 0.5 * teal_zone[..., None]) + np.array([0.03, 0.50, 0.46], np.float32) * (density * teal_zone)[..., None] * 0.8
gold_c = np.array([0.90, 0.74, 0.30], np.float32)
col = col * (1 - 0.6 * gold[..., None]) + gold_c * (0.95 * gold ** 1.0 + 0.9 * gold * density)[..., None]
col = 1 - np.exp(-1.55 * col)                                    # soft tone-map
col = np.clip(col, 0, 1) ** 1.12

# --- stars -------------------------------------------------------------------------------
layer = np.zeros((H, W, 3), np.float32)                          # values 0..255


def splat(cx, cy, color, peak, sigma):
    r = int(sigma * 4) + 1
    x0, y0 = int(round(cx)), int(round(cy))
    xs = np.arange(max(0, x0 - r), min(W, x0 + r + 1))
    ys = np.arange(max(0, y0 - r), min(H, y0 + r + 1))
    if xs.size == 0 or ys.size == 0:
        return
    k = np.outer(np.exp(-((ys - cy) ** 2) / (2 * sigma ** 2)), np.exp(-((xs - cx) ** 2) / (2 * sigma ** 2)))
    layer[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1, :] += k[:, :, None] * (np.asarray(color, np.float32) * 255.0 * peak)


tints = [(1.0, 1.0, 1.0), (0.80, 1.0, 0.88), (1.0, 0.93, 0.74), (0.84, 0.93, 1.0)]


def place(n, correlated):
    pts = []
    while len(pts) < n:
        x, y = rng.integers(0, W), rng.integers(0, H)
        p = (0.20 + 0.9 * density[y, x]) if correlated else 1.0
        if rng.random() < p:
            pts.append((float(x), float(y)))
    return pts


for x, y in place(5600, True):                                   # faint field
    b = min(0.7, (rng.pareto(2.0) + 1) * 0.06)
    splat(x, y, tints[rng.integers(0, 4)], b, rng.uniform(0.7, 1.15))
for x, y in place(650, True):                                    # medium
    splat(x, y, tints[rng.integers(0, 4)], rng.uniform(0.55, 0.95), rng.uniform(1.0, 1.6))
for x, y in place(75, False):                                    # bright, spikes and bloom
    t = np.asarray(tints[rng.integers(0, 4)], np.float32)
    peak = rng.uniform(0.8, 1.0)
    splat(x, y, t, peak, rng.uniform(1.5, 2.2))
    n = int(34 + 70 * peak)
    for k in range(1, n):
        a = peak * 0.5 * (1 - k / n) ** 2
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            px, py = int(round(x + dx)), int(round(y + dy))
            if 0 <= px < W and 0 <= py < H:
                layer[py, px, :] += t * 255 * a
    splat(x, y, t, 0.12, 10.0)                                   # soft glow

# glittering gold dust inside the gold filaments
cand = np.argwhere(gold > 0.30)
if len(cand):
    w = gold[cand[:, 0], cand[:, 1]] ** 2
    for i in rng.choice(len(cand), size=min(3200, len(cand)), replace=False, p=w / w.sum()):
        y, x = cand[i]
        splat(float(x), float(y), (1.0, 0.86, 0.45), rng.uniform(0.25, 0.75), rng.uniform(0.6, 0.9))

layer = np.clip(layer, 0, 255)
res = 255 - (255 - col * 255) * (255 - layer) / 255                # screen blend
res += rng.normal(0, 1.8, (H, W, 1)) + rng.normal(0, 0.6, (H, W, 3))     # film grain
r2 = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
res *= (1 - 0.30 * np.clip(r2 / 2, 0, 1))[:, :, None]              # vignette
hero = Image.fromarray(np.clip(res, 0, 255).astype(np.uint8))
hero.save("frontend/img/header-nebula-hd.jpg", quality=84, optimize=True, progressive=True)

bg = hero.resize((1920, 1080), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
bg_arr = np.asarray(bg).astype(np.float32) * 0.42
Image.fromarray(np.clip(bg_arr, 0, 255).astype(np.uint8)).save("frontend/img/bg-nebula.jpg", quality=78, optimize=True, progressive=True)
print("hero", (W, H), "| page background max value:", int(bg_arr.max()), "p99.9:", int(np.percentile(bg_arr, 99.9)),
      "| dark corner mean:", int(res[:200, :200].mean()))
