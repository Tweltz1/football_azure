"""Finds openly licensed food photos for Shop Stride's suggested recipes (Wikimedia Commons, no API key).

Only CC0 / public domain / CC BY / CC BY-SA photos, which allow use in a paid app. For each recipe it
saves up to 8 large candidates (resized JPEGs) plus candidates.json with creator, license and source page,
so a person picks the best one. Run by .github/workflows/stride-recipe-photos.yml ([stride-photos]).

Usage: python fetch_recipe_photos.py OUT_DIR [id=query ...]   (only those recipes, with those searches)
"""
import io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image

QUERIES = {
    'tacos': 'ground beef tacos', 'stirfry': 'stir fry chicken vegetables wok', 'spaghetti': 'spaghetti bolognese',
    'sheetpan': 'sheet pan sausage peppers', 'chili': 'beef chili bowl', 'salmon': 'salmon asparagus',
    'burgers': 'cheeseburger', 'alfredo': 'chicken alfredo pasta', 'quesadillas': 'chicken quesadilla',
    'pancakes': 'pancakes stack', 'curry': 'chicken curry rice', 'blts': 'BLT sandwich',
    'caesar': 'caesar salad', 'potroast': 'pot roast carrots potatoes', 'friedrice': 'shrimp fried rice',
    'pizza': 'pepperoni pizza', 'bowls': 'burrito bowl', 'lentilsoup': 'lentil soup',
    'tofu': 'crispy tofu vegetables', 'steakpotato': 'steak potatoes dinner', 'greekchicken': 'chicken souvlaki',
    'turkeychili': 'white bean chicken chili', 'pulledpork': 'pulled pork sandwich', 'chickentacos': 'chicken tacos',
    'shrimpzoodles': 'shrimp zucchini noodles', 'omelet': 'omelette breakfast', 'oats': 'oatmeal blueberries',
    'macncheese': 'baked macaroni and cheese', 'blackbean': 'vegetarian tacos', 'pestopasta': 'pesto pasta tomatoes',
    'veggiechili': 'vegetarian bean chili', 'quinoabowls': 'quinoa bowl roasted vegetables', 'minestrone': 'minestrone soup',
}
UA = {'User-Agent': 'ShopStride-photo-picker/1.1 (https://weltzcraft.com; recipe photo search)'}


def get(url, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if n == tries - 1:
                raise
            time.sleep(2 + n * 3)


LICENSES = ('cc0', 'public domain', 'pd', 'cc by', 'cc-by')  # CC BY and CC BY-SA (any version) allow app use with credit
COMMONS = 'https://commons.wikimedia.org/w/api.php'


def commons_search(q):
    """Big photos for a search on Wikimedia Commons, with license and author (no API key needed)."""
    params = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 40,
        'gsrsearch': f'{q} filetype:bitmap -drawing -logo -menu -map', 'prop': 'imageinfo',
        'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': 1600,
    })
    pages = json.loads(get(f'{COMMONS}?{params}')).get('query', {}).get('pages', {})
    out = []
    for pg in sorted(pages.values(), key=lambda x: x.get('index', 99)):
        ii = (pg.get('imageinfo') or [{}])[0]
        meta = ii.get('extmetadata', {})
        lic = (meta.get('LicenseShortName', {}).get('value') or '').strip()
        if ii.get('mime') != 'image/jpeg' or (ii.get('width') or 0) < 1600 or (ii.get('height') or 0) < 1000:
            continue
        if not lic.lower().startswith(LICENSES) or re.search(r'\b(nc|nd)\b', lic.lower()):
            continue
        artist = re.sub(r'<[^>]+>', '', meta.get('Artist', {}).get('value') or '').strip() or 'Unknown'
        out.append({'url': ii.get('thumburl') or ii['url'], 'title': pg.get('title'), 'creator': artist[:80], 'license': lic,
                    'source': ii.get('descriptionurl'), 'provider': 'wikimedia'})
    return out


def main(out, only=None):
    os.makedirs(out, exist_ok=True)
    found = {}
    for rid, q in (only or QUERIES).items():
        try:
            results = commons_search(q)
        except Exception as e:  # noqa: BLE001
            print(f'{rid}: search failed {e}')
            continue
        picks = []
        for res in results:
            try:
                img = Image.open(io.BytesIO(get(res.pop('url')))).convert('RGB')
            except Exception:  # noqa: BLE001
                continue
            w, h = img.size
            if w / h > 2.0 or h / w > 1.4:
                continue
            img.thumbnail((1600, 1600))
            name = f'{rid}-{len(picks) + 1}.jpg'
            img.save(os.path.join(out, name), quality=88)
            picks.append({'file': name, **res})
            if len(picks) == 8:
                break
            time.sleep(0.3)
        print(f'{rid}: {len(picks)} candidates')
        found[rid] = picks
        time.sleep(1)
    with open(os.path.join(out, 'candidates.json'), 'w') as f:
        json.dump(found, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], {k: v.replace('%', ' ') for k, v in (a.split('=', 1) for a in sys.argv[2:])} or None)
