"""Print-ready files for Printful: every product/color/logo combo gets its logo placed on a transparent canvas the
exact size of that product's print area (from merch/plan.json), using merch/products.json for size and position.
Writes merch/print/placed/<product>-<color>-<logo>.png."""
import json, os
from PIL import Image, ImageFilter

cfg = json.load(open('merch/products.json'))
plan = json.load(open('merch/plan.json'))
os.makedirs('merch/print/placed', exist_ok=True)
# Embroidery can only use Printful's thread colors, so hat files are snapped to them (the photo then matches the
# stitched hat) and the colors used are saved in merch/threads.json for the store products.
# Only the threads that suit our marks (Printful also offers greens, reds and purples).
THREADS = ['#FFFFFF', '#000000', '#A67843', '#FFCC00', '#E25C27', '#333366', '#005397']
TRGB = [tuple(int(t[i:i + 2], 16) for i in (1, 3, 5)) for t in THREADS]


def hexrgb(t):
    return tuple(int(t.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))


def nearest(c, allowed):
    def d(b):
        rm = (c[0] + b[0]) / 2
        return (2 + rm / 256) * (c[0] - b[0]) ** 2 + 4 * (c[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (c[2] - b[2]) ** 2
    return min(allowed, key=lambda i: d(TRGB[i]))


def snap(img, only=None):
    """Pick the logo's main thread colors from its solid pixels, then redraw every pixel in one of them."""
    global TRGB
    base = TRGB
    if only:  # a logo can bring its own thread colors (all Printful threads), e.g. red + gold stripes
        TRGB = [tuple(int(t[i:i + 2], 16) for i in (1, 3, 5)) for t in only]
    try:
        return _snap(img, only or THREADS)
    finally:
        TRGB = base


def _snap(img, names):
    px = img.load()
    count, memo = {}, {}
    everything = range(len(TRGB))
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 250:
                k = (r >> 3, g >> 3, b >> 3)
                if k not in memo:
                    memo[k] = nearest((r, g, b), everything)
                count[memo[k]] = count.get(memo[k], 0) + 1
    total = sum(count.values()) or 1
    keep = [i for i, n in sorted(count.items(), key=lambda kv: -kv[1]) if n / total > 0.03][:6]
    memo = {}
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            k = (r >> 3, g >> 3, b >> 3)
            if k not in memo:
                memo[k] = nearest((r, g, b), keep)
            px[x, y] = TRGB[memo[k]] + (255,)
    return [names[i] for i in keep]


threads = {}
cache = {}
n = 0
for prod in cfg['products']:
    for color in prod['colors']:
        p = plan.get(f"{prod['key']}-{color['key']}")
        if not p:
            continue
        AW, AH = p['area']['w'], p['area']['h']
        lks = prod.get('logos') or [k for k, l in cfg['logos'].items() if not l.get('solo')]
        for lk in lks:
            logo_cfg = cfg['logos'][lk]
            fname = logo_cfg[color['tone']]
            if p['placement'].startswith('embroidery') and 'hat' in logo_cfg:
                fname = logo_cfg['hat'][color['tone']]
            if fname not in cache:
                cache[fname] = Image.open(os.path.join('merch/print', fname)).convert('RGBA')
            logo = cache[fname]
            if logo_cfg.get('tint'):
                # One-color art (drawn white) recolored to this garment's ink, e.g. a tonal print.
                ink = color.get('ink') or ('#1e293b' if color['tone'] == 'dark' else '#f5f0e6')
                rgb = tuple(int(ink.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
                tinted = Image.new('RGBA', logo.size, rgb + (0,))
                tinted.putalpha(logo.getchannel('A'))
                logo = tinted
            slots = [0.25, 0.75] if prod.get('wrap') else [0.5]
            # Every logo is fitted into the same box on a product (fractions of the print area), so a wide W, a
            # round seal and a tall monogram all read about the same size. 'scale' is a small optical nudge.
            bw, bh = prod['box']
            k = logo_cfg.get('scale', 1) * min(AW * bw / logo.width, AH * bh / logo.height)
            w, h = round(logo.width * k), round(logo.height * k)
            img = logo.resize((w, h), Image.LANCZOS)
            slug = f"{prod['key']}-{color['key']}-{lk}"
            if p['placement'].startswith('embroidery'):
                # Thicken thin lines a touch so small lettering still holds stitches, then use real thread colors.
                img.putalpha(img.getchannel('A').filter(ImageFilter.MaxFilter(3)))
                threads[slug] = snap(img, logo_cfg.get('threads'))
                # A color can ask for a stitched outline around one logo (so dark art doesn't vanish into a dark hat).
                edge = (color.get('outline') or {}).get(lk)
                if edge:
                    r = 12
                    big = Image.new('RGBA', (w + 2 * r, h + 2 * r), (0, 0, 0, 0))
                    big.paste(img, (r, r))
                    halo = big.getchannel('A').filter(ImageFilter.MaxFilter(2 * r + 1))
                    under = Image.new('RGBA', big.size, hexrgb(edge) + (0,))
                    under.putalpha(halo)
                    img = Image.alpha_composite(under, big)
                    w, h = img.size
                    if edge.upper() not in [t.upper() for t in threads[slug]]:
                        threads[slug].append(edge)
                # ...or swap one thread color for another (a tan deer on a khaki hat becomes a dark deer).
                swap = {k.upper(): v.upper() for k, v in (color.get('swap') or {}).items()}
                if swap:
                    px = img.load()
                    rgbmap = {hexrgb(k): hexrgb(v) for k, v in swap.items()}
                    for y in range(h):
                        for x in range(w):
                            c = px[x, y]
                            if c[3] and c[:3] in rgbmap:
                                px[x, y] = rgbmap[c[:3]] + (255,)
                    threads[slug] = list(dict.fromkeys(swap.get(t.upper(), t) for t in threads[slug]))
            canvas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
            top = round(AH * prod['top']) if 'top' in prod else (AH - h) // 2
            for cx in slots:
                canvas.paste(img, (round(AW * (prod.get('cx', cx) if len(slots) == 1 else cx) - w / 2), top), img)
            canvas.save(f"merch/print/placed/{slug}.png", optimize=True)
            # Extra print spots (e.g. the name down a sleeve), same ink as the main logo.
            for ex in p.get('extras', []):
                ec = next(x for x in prod.get('extra', []) if x['placement'] == ex['placement'])
                EW, EH = ex['area']['w'], ex['area']['h']
                art = Image.open(os.path.join('merch/print', ec['file'])).convert('RGBA')
                if ec.get('tint'):
                    ink = color.get('ink') or ('#1e293b' if color['tone'] == 'dark' else '#f5f0e6')
                    rgb = tuple(int(ink.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
                    t = Image.new('RGBA', art.size, rgb + (0,))
                    t.putalpha(art.getchannel('A'))
                    art = t
                # An embroidered spot (e.g. the name on a hat's back) is stitched in one thread picked per hat
                # color: the color's own 'back' thread, else the spot's thread for that tone.
                ethread = None
                if ex['placement'].startswith('embroidery'):
                    ethread = (color.get('back') or ec.get('thread', {}).get(color['tone']) or '#FFFFFF').upper()
                    t = Image.new('RGBA', art.size, hexrgb(ethread) + (0,))
                    t.putalpha(art.getchannel('A'))
                    art = t
                k2 = min(EW * ec['box'][0] / art.width, EH * ec['box'][1] / art.height)
                art = art.resize((max(1, round(art.width * k2)), max(1, round(art.height * k2))), Image.LANCZOS)
                if ethread:
                    # Hard edges only (stitches have no half-tones), thickened a touch so small letters hold.
                    a = art.getchannel('A').filter(ImageFilter.MaxFilter(3)).point(lambda v: 255 if v >= 128 else 0)
                    art = Image.new('RGBA', art.size, hexrgb(ethread) + (0,))
                    art.putalpha(a)
                    threads[f"{slug}--{ex['placement']}"] = [ethread]
                ecan = Image.new('RGBA', (EW, EH), (0, 0, 0, 0))
                etop = (round(EH * ec['top']) if 'top' in ec else
                        EH - art.height - round(EH * ec['bottom']) if 'bottom' in ec else (EH - art.height) // 2)
                ecan.paste(art, ((EW - art.width) // 2, etop), art)
                ecan.save(f"merch/print/placed/{slug}--{ex['placement']}.png", optimize=True)
            n += 1
json.dump(threads, open('merch/threads.json', 'w'), indent=1)
print(n, 'placed files,', len(threads), 'embroidered')
