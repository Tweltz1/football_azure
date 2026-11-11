"""Fetch free-to-use (CC0 / public domain) photos for the weltzcraft.com sample sites.

Runs in GitHub Actions (the cloud dev box can't reach image hosts). For each business type it
searches Openverse, downloads the best match per slot, crops/resizes to WebP and writes
weltzcraft-site/img/sample/<type>-<slot>.webp plus credits.json.
"""
import io, json, os, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageOps

OUT = 'weltzcraft-site/img/sample'
Q = {
  'coffee':  ['coffee shop interior', 'latte art', 'barista coffee', 'croissant coffee'],
  'barber':  ['barber shop', 'barber haircut', 'barber tools scissors', 'barber chair'],
  'auto':    ['auto repair garage', 'mechanic car repair', 'car engine', 'car tire wheel'],
  'lawn':    ['landscaped garden lawn', 'lawn mower grass', 'garden flowers', 'backyard patio garden'],
  'bakery':  ['bakery bread', 'croissants', 'cake bakery', 'cookies baking'],
  'fitness': ['gym fitness', 'fitness class', 'dumbbells weights', 'yoga'],
  'boutique':['clothing boutique', 'clothes rack fashion', 'handbag fashion', 'fashion shoes'],
  'running': ['running shoes', 'runner road running', 'trail running', 'marathon runners'],
}
SIZES = {0: (1600, 900), 1: (800, 800), 2: (800, 800), 3: (800, 800)}
UA = {'User-Agent': 'weltzcraft-sample-photos/1.0'}

def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if binary else json.loads(data)

def search(q, extra):
    params = {'q': q, 'license': 'cc0,pdm', 'page_size': '30', 'mature': 'false', **extra}
    try:
        return get('https://api.openverse.org/v1/images/?' + urllib.parse.urlencode(params)).get('results', [])
    except Exception as e:
        print('  search failed', q, extra, e); return []

def main():
    os.makedirs(OUT, exist_ok=True)
    credits, used, missing = {}, set(), []
    for kind, queries in Q.items():
        for slot, q in enumerate(queries):
            want = SIZES[slot]
            tries = [{'source': 'stocksnap'}, {'source': 'rawpixel'}, {'size': 'large'}, {}]
            if slot == 0: tries = [dict(t, aspect_ratio='wide') for t in tries] + tries
            done = False
            for extra in tries:
                for r in search(q, extra):
                    url = r.get('url')
                    if not url or url in used: continue
                    w, h = r.get('width') or 0, r.get('height') or 0
                    if w and w < want[0] * .75: continue
                    try:
                        im = Image.open(io.BytesIO(get(url, True)))
                        im = ImageOps.exif_transpose(im).convert('RGB')
                    except Exception as e:
                        print('  skip', url, e); continue
                    if im.width < want[0] * .75 or im.height < want[1] * .75: continue
                    im = ImageOps.fit(im, want, Image.LANCZOS)
                    path = f'{OUT}/{kind}-{slot}.webp'
                    im.save(path, 'WEBP', quality=78, method=6)
                    used.add(url)
                    credits[f'{kind}-{slot}'] = {'query': q, 'title': r.get('title'), 'creator': r.get('creator'),
                        'license': r.get('license'), 'source': r.get('source'), 'page': r.get('foreign_landing_url')}
                    print(f'{kind}-{slot}: {r.get("source")} {r.get("title")!r} {os.path.getsize(path)//1024}KB')
                    done = True; break
                if done: break
                time.sleep(1)
            if not done: missing.append(f'{kind}-{slot}')
    json.dump(credits, open(f'{OUT}/credits.json', 'w'), indent=1)
    print('missing:', missing)

if __name__ == '__main__':
    main()
