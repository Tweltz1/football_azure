"""Merch concepts: place each concept's art on a transparent canvas the size of the Printful print area.
Reads merch/concepts/concepts.json + catalog.json + art/*.png, writes merch/concepts/placed/<slug>-<placement>.png and
placed/plan.json. Art named with {tone} picks the light/dark file; 'tint' art is white and gets recolored to the ink.
Embroidery placements are snapped to Printful thread colors (saved in plan.json for the store products)."""
import json, os, re, hashlib
from PIL import Image, ImageFilter

D = 'merch/concepts'
cfg = json.load(open(f'{D}/concepts.json'))
cat = json.load(open(f'{D}/catalog.json'))
os.makedirs(f'{D}/placed', exist_ok=True)
THREADS = ['#FFFFFF', '#000000', '#96A1A8', '#A67843', '#FFCC00', '#E25C27', '#CC3366', '#CC3333', '#660000',
           '#333366', '#005397', '#3399FF', '#6B5294', '#01784E', '#7BA35A']
TRGB = [tuple(int(t[i:i + 2], 16) for i in (1, 3, 5)) for t in THREADS]
hexrgb = lambda h: tuple(int(h.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))


def dist(c, b):
    rm = (c[0] + b[0]) / 2
    return (2 + rm / 256) * (c[0] - b[0]) ** 2 + 4 * (c[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (c[2] - b[2]) ** 2


def snap(img):
    px = img.load()
    count, memo = {}, {}
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 250:
                k = (r >> 3, g >> 3, b >> 3)
                if k not in memo:
                    memo[k] = min(range(len(TRGB)), key=lambda i: dist((r, g, b), TRGB[i]))
                count[memo[k]] = count.get(memo[k], 0) + 1
    total = sum(count.values()) or 1
    keep = [i for i, n in sorted(count.items(), key=lambda kv: -kv[1]) if n / total > 0.02][:6]
    memo = {}
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
                continue
            k = (r >> 3, g >> 3, b >> 3)
            if k not in memo:
                memo[k] = min(keep, key=lambda i: dist((r, g, b), TRGB[i]))
            px[x, y] = TRGB[memo[k]] + (255,)
    return [THREADS[i] for i in keep]


def tint(img, ink):
    r, g, b = hexrgb(ink)
    out = Image.new('RGBA', img.size, (r, g, b, 0))
    out.putalpha(img.getchannel('A'))
    return out


cache, plan = {}, {}
for it in cfg['items']:
    pls = cat[str(it['product_id'])]['placements']
    for c in it['colors']:
        slug = f"{it['code'].lower()}-{re.sub('[^a-z0-9]+', '-', c['name'].lower())}"
        entry = {'files': {}, 'threads': {}}
        h = hashlib.sha1()
        for layer in it['layers']:
            pl = layer['placement']
            AW, AH = map(int, pls[pl].split('x'))
            name = layer['art'].replace('{tone}', c['tone'])
            if name not in cache:
                cache[name] = Image.open(f'{D}/art/{name}.png').convert('RGBA')
            art = cache[name]
            if layer.get('tint'):
                art = tint(art, c.get('ink') or layer.get('ink') or ('#1e293b' if c['tone'] == 'dark' else '#f5f0e6'))
            bw, bh = layer['box']
            k = min(AW * bw / art.width, AH * bh / art.height)
            w, hh = max(1, round(art.width * k)), max(1, round(art.height * k))
            img = art.resize((w, hh), Image.LANCZOS)
            if pl.startswith('embroidery'):
                img.putalpha(img.getchannel('A').filter(ImageFilter.MaxFilter(3)))
                entry['threads'][pl] = snap(img)
            canvas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
            top = round(AH * layer['top']) if 'top' in layer else (AH - hh) // 2
            left = round(AW * layer.get('cx', 0.5) - w / 2)
            canvas.paste(img, (left, top), img)
            fn = f'{slug}-{pl}.png'
            canvas.save(f'{D}/placed/{fn}', optimize=True)
            h.update(open(f'{D}/placed/{fn}', 'rb').read())
            entry['files'][pl] = {'file': fn, 'w': AW, 'h': AH}
        if not entry['threads']:
            del entry['threads']
        entry['key'] = h.hexdigest()[:12]
        plan[slug] = entry
        print(slug, list(entry['files']))
json.dump(plan, open(f'{D}/placed/plan.json', 'w'), indent=1)
print(len(plan), 'combos placed')
