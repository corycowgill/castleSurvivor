"""One-off clean-up of generated ground decals (PLAN 50.25).

    python3 tools/fix-decals.py            # rewrites images/decals/*.webp in place

The image model left some decals sitting on a pale, half-transparent haze that read in
game as grey paper scraps on the grass (arrowStorm, shieldScatter, ashDrift), drew `scorch` as a spiky black wing,
painted `cracks` as bright tan flagstone that glowed orange on every meadow, and put a
cyan blob in the middle of `puddle`, made `sulfurStain` paint-yellow, and
Mirefen's `bogScum` / `bogPool` neon lime round sky-blue water. Each fix is idempotent enough to run twice
without visible change; the originals are in git history.
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'images', 'decals')


def load(k):
    return np.asarray(Image.open(os.path.join(D, k + '.webp')).convert('RGBA')).astype(np.float32) / 255


def save(k, a):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(D, k + '.webp'), quality=88, method=6)


def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def dehaze(a, keep_opaque=0.75):
    """Fade out light, grey, half-transparent pixels: the haze, not the subject."""
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    w = ss(0.42, 0.7, mx) * (1 - ss(0.07, 0.2, mx - mn)) * (1 - ss(keep_opaque, 0.97, al))
    a[..., 3] = al * (1 - w)
    return a


def colorkey(a, near=0.05, far=0.13):
    """Key out a flat grey backdrop: the most common low-saturation colour."""
    rgb, al = a[..., :3], a[..., 3]
    sat = rgb.max(-1) - rgb.min(-1)
    pick = (al > 0.3) & (sat < 0.06) & (rgb.max(-1) > 0.35)
    if pick.sum() < 500:
        return a
    q = np.round(rgb[pick] * 32).astype(int)
    vals, counts = np.unique(q, axis=0, return_counts=True)
    bg = vals[counts.argmax()] / 32
    dist = np.linalg.norm(rgb - bg, axis=-1)
    a[..., 3] = al * ss(near, far, dist)
    return a


def noise(n, cell, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((n // cell + 2, n // cell + 2)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((n + cell * 2, n + cell * 2), Image.BICUBIC)
    return np.asarray(im, np.float32)[:n, :n] / 255


def puddle(n=512):
    """A muddy puddle: irregular dark water, a wet rim, a soft sky sheen."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n - 0.5
    r = np.hypot(x * 1.15, y) * 2
    warp = (noise(n, 64, 3) - 0.5) * 0.55 + (noise(n, 16, 4) - 0.5) * 0.12
    d = r + warp                                 # < 0.62 water, to 0.9 wet mud
    water = 1 - ss(0.55, 0.63, d)
    mud = 1 - ss(0.72, 0.95, d)
    grain = noise(n, 20, 5)
    mud_rgb = np.stack([0.2, 0.15, 0.1]) * (0.8 + 0.4 * grain[..., None])
    water_rgb = np.stack([0.07, 0.075, 0.07]) + 0.03 * (noise(n, 40, 6)[..., None] - 0.5)
    sheen = (1 - ss(-0.35, 0.25, x + y * 0.6)) * water * 0.22   # sky caught on the far side
    rgb = mud_rgb * (1 - water[..., None]) + water_rgb * water[..., None] + sheen[..., None] * np.array([0.7, 0.8, 0.9])
    alpha = np.maximum(water * 0.9, mud * 0.65 * (0.8 + 0.2 * grain))
    return np.dstack([rgb, alpha]).astype(np.float32)


def scorch(n=512):
    """A burn mark: charcoal core, sooty feathered edge, a few radial soot streaks."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n - 0.5
    r = np.hypot(x, y) * 2
    th = np.arctan2(y, x)
    warp = (noise(n, 64, 11) - 0.5) * 0.4 + (noise(n, 16, 12) - 0.5) * 0.08
    d = r + warp
    streak = np.clip(np.sin(th * 11 + noise(n, 96, 13) * 3) * 0.5 + 0.5, 0, 1) ** 10 * ss(0.95, 0.4, d) * 0.12
    core = 1 - ss(0.15, 0.55, d)
    soot = 1 - ss(0.35, 0.92, d)
    grain = noise(n, 8, 14)
    rgb = np.stack([0.07, 0.06, 0.055]) * (0.7 + 0.6 * grain[..., None])
    rgb = rgb + core[..., None] * (grain[..., None] > 0.9) * np.array([0.06, 0.055, 0.05])   # ash flecks
    alpha = np.clip(np.maximum(soot * 0.7, core * 0.88) + streak, 0, 0.92)
    return np.dstack([rgb, alpha]).astype(np.float32)


def mute(a, keep=0.5, tint=(1, 1, 1), alpha=1.0):
    """Pull a decal toward its own luminance (keep = saturation kept), then tint."""
    lum = (a[..., :3] @ np.array([0.3, 0.59, 0.11]))[..., None]
    a[..., :3] = (lum * (1 - keep) + a[..., :3] * keep) * np.array(tint)
    a[..., 3] *= alpha
    return a


def main():
    for k in ('arrowStorm', 'shieldScatter'):
        save(k, dehaze(colorkey(load(k))))
    # Ash is the subject, so keep it but take it from paper-white to grey ash
    a = load('ashDrift')
    a[..., :3] = a[..., :3] * np.array([0.52, 0.5, 0.48])
    a[..., 3] *= 0.75
    save('ashDrift', a)
    # Cracked dry earth, not sandstone: darker, browner, less saturated
    a = load('cracks')
    rgb = a[..., :3]
    lum = (rgb @ np.array([0.3, 0.59, 0.11]))[..., None]
    a[..., :3] = (lum * 0.6 + rgb * 0.4) * np.array([0.5, 0.42, 0.34])
    save('cracks', a)
    # Sulfur crust, not yellow paint: pulled toward ochre and let the ground through
    a = load('sulfurStain')
    lum = (a[..., :3] @ np.array([0.3, 0.59, 0.11]))[..., None]
    a[..., :3] = (lum * 0.45 + a[..., :3] * 0.55) * np.array([0.78, 0.7, 0.5])
    a[..., 3] *= 0.8
    save('sulfurStain', a)
    # Mirefen's scum and pool rims were neon lime round sky-blue water: algae is
    # olive, and bog water is the colour of tea
    a = load('bogScum')
    blue = ss(0.05, 0.2, a[..., 2] - a[..., 1])[..., None]           # the open water
    a[..., :3] = a[..., :3] * (1 - blue) + np.array([0.05, 0.07, 0.06]) * blue
    save('bogScum', mute(a, keep=0.3, tint=(0.5, 0.54, 0.36), alpha=0.8))
    save('bogPool', mute(load('bogPool'), keep=0.35, tint=(0.58, 0.62, 0.42)))
    save('puddle', puddle())
    save('scorch', scorch())


if __name__ == '__main__':
    main()
