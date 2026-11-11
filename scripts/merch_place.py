"""Makes print-ready files for Printful: each logo placed on a transparent canvas the exact size of the
product's print area (from merch/plan.json), using the width/top shares in merch/products.json."""
import json, os
from PIL import Image

cfg = json.load(open('merch/products.json'))
plan = json.load(open('merch/plan.json'))
os.makedirs('merch/print/placed', exist_ok=True)
for item in cfg['items']:
    p = plan.get(item['slug'])
    if not p:
        continue
    AW, AH = p['area']['w'], p['area']['h']
    logo = Image.open(os.path.join('merch/print', item['file'])).convert('RGBA')
    w = round(AW * item['width'])
    h = round(w * logo.height / logo.width)
    if h > AH * 0.9:
        h = round(AH * 0.9)
        w = round(h * logo.width / logo.height)
    logo = logo.resize((w, h), Image.LANCZOS)
    canvas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
    canvas.paste(logo, ((AW - w) // 2, round(AH * item['top'])), logo)
    canvas.save(f"merch/print/placed/{item['slug']}.png", optimize=True)
    print(item['slug'], AW, AH, '->', w, h)
