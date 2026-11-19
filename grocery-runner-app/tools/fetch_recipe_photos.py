"""Finds openly licensed food photos for Shop Stride's suggested recipes (Openverse, no API key).

Only CC0 / public domain / CC BY / CC BY-SA photos, which allow use in a paid app. For each recipe it
saves up to 6 large candidates (resized JPEGs) plus candidates.json with creator, license and source page,
so a person picks the best one. Run by .github/workflows/stride-recipe-photos.yml ([stride-photos]).

Usage: python fetch_recipe_photos.py OUT_DIR [id=query ...]   (only those recipes, with those searches)
"""
import io, json, os, sys, time, urllib.parse, urllib.request
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
}
OK = {'cc0', 'pdm', 'by', 'by-sa'}
UA = {'User-Agent': 'ShopStride-photo-picker/1.0 (+https://weltzcraft.com)'}


def get(url, tries=3):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if n == tries - 1:
                raise
            time.sleep(2 + n * 3)


def main(out, only=None):
    os.makedirs(out, exist_ok=True)
    found = {}
    for rid, q in (only or QUERIES).items():
        params = urllib.parse.urlencode({'q': q, 'license': ','.join(sorted(OK)), 'category': 'photograph', 'page_size': 40, 'mature': 'false'})
        try:
            data = json.loads(get(f'https://api.openverse.org/v1/images/?{params}'))
        except Exception as e:  # noqa: BLE001
            print(f'{rid}: search failed {e}')
            continue
        picks = []
        for res in data.get('results', []):
            if res.get('license') not in OK or (res.get('width') or 0) < 1400:
                continue
            try:
                img = Image.open(io.BytesIO(get(res['url']))).convert('RGB')
            except Exception:  # noqa: BLE001
                continue
            w, h = img.size
            if w < 1200 or h < 800 or w / h > 2.2 or h / w > 1.6:
                continue
            img.thumbnail((1600, 1600))
            name = f'{rid}-{len(picks) + 1}.jpg'
            img.save(os.path.join(out, name), quality=88)
            picks.append({
                'file': name, 'title': res.get('title'), 'creator': res.get('creator'), 'license': res.get('license'),
                'license_version': res.get('license_version'), 'license_url': res.get('license_url'),
                'source': res.get('foreign_landing_url'), 'provider': res.get('source'),
            })
            if len(picks) == 6:
                break
            time.sleep(0.5)
        print(f'{rid}: {len(picks)} candidates')
        found[rid] = picks
        time.sleep(1.5)
    with open(os.path.join(out, 'candidates.json'), 'w') as f:
        json.dump(found, f, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], {k: v.replace('%', ' ') for k, v in (a.split('=', 1) for a in sys.argv[2:])} or None)
