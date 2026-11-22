# Turns Gemini hat art (merch/art/raw/*.png) into stitch-ready logo files (merch/print/logo-<id>.png):
# drops the plain background, crops, and redraws every pixel in one of the logo's Printful thread colors.
#   python3 scripts/merch_art_prep.py      (reads merch/art/picks.json)
import json
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

PICKS = json.load(open('merch/art/picks.json'))
ONLY = os.environ.get('ONLY')  # e.g. ONLY=h3 redoes just that logo
if ONLY:
    PICKS = [p for p in PICKS if p['id'] == ONLY]


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lab(a):
    """sRGB (0-255) to CIELAB, so 'closest thread' matches what eyes see."""
    c = a.astype(np.float32) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]], np.float32)
    xyz /= np.array([0.9505, 1.0, 1.089], np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def nearest_map(arr, pal):
    """Index of the closest thread color for every pixel."""
    L = lab(arr)
    P = lab(np.array(pal, np.float32))
    d = ((L[..., None, :] - P[None, None]) ** 2).sum(-1)
    return d.argmin(-1).astype(np.uint8)


for pk in PICKS:
    im = Image.open(f"merch/art/raw/{pk['art']}.png").convert('RGB')
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    a = np.asarray(im).astype(np.int32)
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    near = (np.abs(a - bg).sum(axis=2) < pk.get('tol', 36))
    lbl, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))) - {0}
    fg = ~np.isin(lbl, list(edge))
    fg = ndimage.binary_opening(fg, iterations=2)
    lbl, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lbl, range(1, n + 1))
    fg = np.isin(lbl, [i + 1 for i, s in enumerate(sizes) if s > 2500])
    fg = ndimage.binary_fill_holes(fg) if pk.get('fill', True) else fg
    if pk.get('gaps'):
        # See-through gaps (between legs, inside antlers): bits of plain background the art fully encloses.
        blbl, bn = ndimage.label(near)
        bsz = ndimage.sum(near, blbl, range(1, bn + 1))
        fg &= ~np.isin(blbl, [i + 1 for i, s in enumerate(bsz) if s > pk['gaps'] and (i + 1) not in edge])
    pal = [rgb(t) for t in pk['threads']]
    g = pk.get('gamma', 1)  # >1 pulls dark fur toward black instead of a dark blue or green thread
    idx = nearest_map(255 * (a / 255) ** g, pal)
    # Smooth out single-stitch speckle: each pixel takes the most common thread around it.
    q = Image.fromarray(idx, 'P').filter(ImageFilter.ModeFilter(7))
    idx = np.asarray(q)
    out = np.zeros((*idx.shape, 4), np.uint8)
    out[..., :3] = np.array(pal, np.uint8)[idx]
    out[..., 3] = fg * 255
    ys, xs = np.where(fg)
    out = out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(out, 'RGBA').save(f"merch/print/logo-{pk['id']}.png", optimize=True)
    used = [pk['threads'][i] for i in np.unique(idx[fg])]
    print(pk['id'], pk['art'], out.shape[1], 'x', out.shape[0], used)
