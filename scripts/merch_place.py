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


def nearest(c, allowed):
    def d(b):
        rm = (c[0] + b[0]) / 2
        return (2 + rm / 256) * (c[0] - b[0]) ** 2 + 4 * (c[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (c[2] - b[2]) ** 2
    return min(allowed, key=lambda i: d(TRGB[i]))


def snap(img):
    """Pick the logo's main thread colors from its solid pixels, then redraw every pixel in one of them."""
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
    return [THREADS[i] for i in keep]


threads = {}
cache = {}
n = 0
for prod in cfg['products']:
    for color in prod['colors']:
        p = plan.get(f"{prod['key']}-{color['key']}")
        if not p:
            continue
        AW, AH = p['area']['w'], p['area']['h']
        for lk, logo_cfg in cfg['logos'].items():
            fname = logo_cfg[color['tone']]
            if p['placement'].startswith('embroidery') and 'hat' in logo_cfg:
                fname = logo_cfg['hat'][color['tone']]
            if fname not in cache:
                cache[fname] = Image.open(os.path.join('merch/print', fname)).convert('RGBA')
            logo = cache[fname]
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
                threads[slug] = snap(img)
            canvas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
            top = round(AH * prod['top']) if 'top' in prod else (AH - h) // 2
            for cx in slots:
                canvas.paste(img, (round(AW * cx - w / 2), top), img)
            canvas.save(f"merch/print/placed/{slug}.png", optimize=True)
            n += 1
json.dump(threads, open('merch/threads.json', 'w'), indent=1)
print(n, 'placed files,', len(threads), 'embroidered')
