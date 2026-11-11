"""Print-ready files for Printful: every product/color/logo combo gets its logo placed on a transparent canvas the
exact size of that product's print area (from merch/plan.json), using merch/products.json for size and position.
Writes merch/print/placed/<product>-<color>-<logo>.png."""
import json, os
from PIL import Image

cfg = json.load(open('merch/products.json'))
plan = json.load(open('merch/plan.json'))
os.makedirs('merch/print/placed', exist_ok=True)
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
            if fname not in cache:
                cache[fname] = Image.open(os.path.join('merch/print', fname)).convert('RGBA')
            logo = cache[fname]
            slots = [0.25, 0.75] if prod.get('wrap') else [0.5]
            w = round(AW * prod['width'] * logo_cfg.get('scale', 1))
            h = round(w * logo.height / logo.width)
            max_h = AH * (0.8 if prod.get('wrap') else 0.9)
            if h > max_h:
                h = round(max_h)
                w = round(h * logo.width / logo.height)
            img = logo.resize((w, h), Image.LANCZOS)
            canvas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
            top = round(AH * prod['top']) if not prod.get('wrap') else (AH - h) // 2
            for cx in slots:
                canvas.paste(img, (round(AW * cx - w / 2), top), img)
            canvas.save(f"merch/print/placed/{prod['key']}-{color['key']}-{lk}.png", optimize=True)
            n += 1
print(n, 'placed files')
