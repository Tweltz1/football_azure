"""Fetch freely licensed photos (CC0/PD first, then CC BY / BY-SA with credit) for the weltzcraft.com sample sites.

Runs in GitHub Actions (the cloud dev box can't reach image hosts). For each business type it
searches Wikimedia Commons, downloads the best match per slot, crops/resizes to WebP and writes
weltzcraft-site/img/sample/<type>-<slot>.webp plus credits.json.
"""
import io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from PIL import Image, ImageOps

OUT = 'weltzcraft-site/img/sample'
Q = {
  'coffee':  ['coffee shop counter cafe interior', 'latte art', 'barista making espresso', 'croissant coffee'],
  'barber':  ['barbershop interior chairs mirrors', 'barber haircut', 'barber tools scissors', 'barber chair'],
  'auto':    ['auto mechanic garage car lift', 'mechanic working on car engine', 'car engine bay open hood', 'tire change garage wheel'],
  'lawn':    ['green lawn front yard house', 'lawn mower grass', 'garden flowers', 'garden stone path landscaping'],
  'bakery':  ['bakery bread', 'croissants', 'decorated birthday cake', 'chocolate chip cookies'],
  'fitness': ['gym fitness', 'group fitness class gym', 'dumbbells rack gym', 'yoga class mat'],
  'boutique':['clothing store interior', 'clothes on hangers rack', 'leather handbag', 'fashion shoes'],
  'running': ['runner tying running shoes', 'woman jogging park', 'trail running', 'marathon runners'],
}
BRANDS = re.compile(r'starbucks|chanel|prada|gucci|louis vuitton|mercedes|amg|bmw|nike|adidas|mizuno|asics|puma|fortepan|logo|nebula|ambigram|receipt|invoice|google|negative', re.I)
SIZES = {0: (1600, 900), 1: (800, 800), 2: (800, 800), 3: (800, 800)}
UA = {'User-Agent': 'WeltzcraftSamplePhotos/1.0 (https://weltzcraft.com)'}

def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if binary else json.loads(data)

COMMONS = 'https://commons.wikimedia.org/w/api.php?'
LIC_RANK = lambda l: 0 if re.search(r'cc0|public domain|pd', l, re.I) else 1 if re.fullmatch(r'cc[ -]by(?:[ -][\d.]+)?', l.strip(), re.I) else 2 if re.search(r'cc[ -]by[ -]sa', l, re.I) else 9

def search(q, extra):
    """Wikimedia Commons search; returns candidates with a free license, best licenses first."""
    params = {'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': q + ' filetype:bitmap', 'gsrnamespace': '6',
              'gsrlimit': '40', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': str(extra.get('w', 1600))}
    for attempt in range(4):
        time.sleep(1)
        try:
            pages = (get(COMMONS + urllib.parse.urlencode(params)).get('query') or {}).get('pages') or {}
            break
        except Exception as e:
            print('  search failed', q, e); time.sleep(10 * (attempt + 1)); pages = {}
    out = []
    for pg in sorted(pages.values(), key=lambda p: p.get('index', 99)):
        ii = (pg.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata') or {}
        lic = (md.get('LicenseShortName') or {}).get('value', '')
        rank = LIC_RANK(lic)
        if rank > 2 or not ii.get('thumburl'): continue
        if extra.get('wide') and ii.get('width', 0) < ii.get('height', 1) * 1.25: continue
        artist = re.sub('<[^>]+>', '', (md.get('Artist') or {}).get('value', '')).strip()
        out.append({'url': ii['thumburl'], 'width': ii.get('thumbwidth') or ii.get('width'), 'height': ii.get('thumbheight') or ii.get('height'),
                    'title': pg.get('title', '').replace('File:', ''), 'creator': artist[:80], 'license': lic,
                    'source': 'wikimedia commons', 'foreign_landing_url': ii.get('descriptionurl'), 'rank': rank})
    return out

def main():
    os.makedirs(OUT, exist_ok=True)
    cpath = f'{OUT}/credits.json'
    credits = json.load(open(cpath)) if os.path.exists(cpath) else {}
    used, missing = {v.get('url') for v in credits.values()}, []
    rpath = f'{OUT}/rejects.json'
    rejects = set(json.load(open(rpath))) if os.path.exists(rpath) else set()
    for kind, queries in Q.items():
        for slot, q in enumerate(queries):
            if os.path.exists(f'{OUT}/{kind}-{slot}.webp'): continue
            want = SIZES[slot]
            tries = ([{'wide': 1, 'w': 1600}] if slot == 0 else []) + [{'w': 1600 if slot == 0 else 1200}]
            done = False
            for extra in tries:
                for r in search(q, extra):
                    url = r.get('url')
                    if not url or url in used or r.get('title') in rejects or BRANDS.search(r.get('title') or ''): continue
                    w, h = r.get('width') or 0, r.get('height') or 0
                    if w and w < want[0] * .75: continue
                    try:
                        im = Image.open(io.BytesIO(get(url, True)))
                        im = ImageOps.exif_transpose(im).convert('RGB')
                    except Exception as e:
                        print('  skip', url, e); continue
                    if im.width < want[0] * .75 or im.height < want[1] * .75: continue
                    sat = sum(im.convert('HSV').resize((64, 64)).getchannel('S').getdata()) / 4096
                    if sat < 40: print('  skip grey', r.get('title')); continue
                    im = ImageOps.fit(im, want, Image.LANCZOS)
                    path = f'{OUT}/{kind}-{slot}.webp'
                    im.save(path, 'WEBP', quality=78, method=6)
                    used.add(url)
                    credits[f'{kind}-{slot}'] = {'url': url, 'query': q, 'title': r.get('title'), 'creator': r.get('creator'),
                        'license': r.get('license'), 'source': r.get('source'), 'page': r.get('foreign_landing_url')}
                    print(f'{kind}-{slot}: {r.get("source")} {r.get("title")!r} {os.path.getsize(path)//1024}KB')
                    done = True; break
                if done: break
            if not done: missing.append(f'{kind}-{slot}')
    json.dump(credits, open(f'{OUT}/credits.json', 'w'), indent=1)
    print('missing:', missing)

if __name__ == '__main__':
    main()
