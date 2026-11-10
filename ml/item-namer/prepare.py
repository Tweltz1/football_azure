#!/usr/bin/env python3
"""Builds the training set for the item namer: a classifier that names one cropped thing (shared by Curbsy
and ToteTrack). The phone finds where each thing is (Apple's region finder); this names it.

Every LVIS v1 category (annotations CC BY 4.0, COCO photos) that is a made object people give away or
store is kept: WordNet decides (an artifact, not food, an animal, a person, a building or a car), and
classes with too few examples are dropped. Each box becomes a cropped photo in
<out>/train/<label>/ and <out>/test/<label>/ (Create ML's labeled-folder format).

Usage: python3 prepare.py --out crops --cache cache --per-class 80 --min-class 15
Needs: pip install pillow ijson nltk
"""
import argparse
import io
import json
import os
import random
import re
import urllib.request
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import ijson
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LVIS = {
    'train': 'https://dl.fbaipublicfiles.com/LVIS/lvis_v1_train.json.zip',
    'val': 'https://dl.fbaipublicfiles.com/LVIS/lvis_v1_val.json.zip',
}

# WordNet roots: kept when under KEEP and under none of DROP. Checked against every hypernym path.
KEEP = {'artifact.n.01'}
DROP = {
    'food.n.01', 'food.n.02', 'foodstuff.n.02', 'dish.n.02', 'beverage.n.01', 'nutriment.n.01', 'baked_goods.n.01',
    'animal.n.01', 'person.n.01', 'plant.n.02', 'body_part.n.01', 'natural_object.n.01',
    'structure.n.01', 'way.n.06', 'facility.n.01', 'land.n.04', 'road.n.01',
    'motor_vehicle.n.01', 'aircraft.n.01', 'vessel.n.02', 'train.n.01', 'public_transport.n.01', 'craft.n.02',
    'weapon.n.01', 'drug.n.01', 'cigarette.n.01', 'money.n.01', 'currency.n.01', 'document.n.01', 'sign.n.02',
    'signal.n.01', 'traffic_light.n.01', 'street_sign.n.01', 'flag.n.01', 'emblem.n.02',
}
# Kept even though WordNet files them under a dropped root.
ALWAYS = {'bicycle', 'tricycle', 'scooter', 'skateboard', 'wagon', 'wheelbarrow', 'stroller', 'kayak', 'canoe',
          'motor_scooter', 'golfcart', 'lawn_mower', 'tractor_(farm_equipment)', 'surfboard', 'sled', 'boat'}
# Never kept (too generic, or not something you give away).
NEVER = {'pole', 'post', 'wire', 'thread', 'string', 'logo', 'label', 'sticker', 'tag', 'banner', 'billboard',
         'window', 'windowpane', 'doorknob', 'faucet', 'ceiling', 'wall_socket', 'outlet', 'manhole', 'fireplug',
         'parking_meter', 'traffic_light', 'street_sign', 'stop_sign', 'license_plate', 'train_(railroad_vehicle)',
         'airplane', 'bus_(vehicle)', 'car_(automobile)', 'truck', 'tank_(storage_vessel)', 'pipe', 'water_tower',
         'lamppost', 'fire_hydrant', 'cigarette', 'condom', 'tampon', 'diaper', 'pacifier', 'toothbrush', 'razorblade',
         'syringe', 'pill', 'gun', 'rifle', 'pistol', 'knife', 'sword', 'dagger', 'bullet', 'cartridge'}

# Category from the first matching WordNet root (in this order), else 'other'.
CATEGORY_ROOTS = [
    ('furniture.n.01', 'furniture'), ('seat.n.03', 'furniture'), ('bed.n.01', 'furniture'), ('table.n.02', 'furniture'),
    ('home_appliance.n.01', 'appliances'), ('appliance.n.02', 'appliances'), ('kitchen_appliance.n.01', 'appliances'),
    ('electronic_equipment.n.01', 'electronics'), ('electronic_device.n.01', 'electronics'), ('computer.n.01', 'electronics'),
    ('telephone.n.01', 'electronics'), ('camera.n.01', 'electronics'), ('lamp.n.02', 'home'),
    ('hand_tool.n.01', 'tools'), ('power_tool.n.01', 'tools'), ('tool.n.01', 'tools'), ('measuring_instrument.n.01', 'tools'),
    ('garden_tool.n.01', 'garden'), ('lawn_mower.n.01', 'garden'), ('pot.n.04', 'garden'),
    ('building_material.n.01', 'building'), ('fixture.n.02', 'building'),
    ('toy.n.01', 'toys'), ('plaything.n.01', 'toys'), ('game_equipment.n.01', 'toys'),
    ('sports_equipment.n.01', 'sports'), ('ball.n.01', 'sports'), ('bicycle.n.01', 'sports'), ('wheeled_vehicle.n.01', 'sports'),
    ('clothing.n.01', 'clothing'), ('footwear.n.02', 'clothing'), ('bag.n.04', 'clothing'), ('bag.n.01', 'clothing'),
    ('headdress.n.01', 'clothing'), ('jewelry.n.01', 'clothing'), ('accessory.n.01', 'clothing'),
    ('publication.n.01', 'books'), ('book.n.02', 'books'),
    ('musical_instrument.n.01', 'other'),
    ('kitchen_utensil.n.01', 'home'), ('tableware.n.01', 'home'), ('container.n.01', 'home'), ('decoration.n.01', 'home'),
    ('furnishing.n.02', 'home'), ('covering.n.02', 'home'), ('device.n.01', 'home'),
]


def log(*a):
    print(*a, flush=True)


def fetch(url, path):
    if not os.path.exists(path):
        log('downloading', url)
        urllib.request.urlretrieve(url, path + '.part')
        os.replace(path + '.part', path)
    return path


def lvis_json(cache, split):
    target = os.path.join(cache, f'lvis_v1_{split}.json')
    if not os.path.exists(target):
        z = fetch(LVIS[split], os.path.join(cache, f'lvis_v1_{split}.json.zip'))
        with zipfile.ZipFile(z) as zf:
            zf.extractall(cache)
        os.remove(z)
    return target


MIN_SIDE = 96


def title_of(name):
    """LVIS 'iron_(for_clothing)' -> 'Iron'."""
    s = re.sub(r'_?\(.*?\)', '', name).replace('_', ' ').strip()
    return s[:1].upper() + s[1:]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default='crops')
    p.add_argument('--cache', default='cache')
    p.add_argument('--per-class', type=int, default=80)
    p.add_argument('--min-class', type=int, default=15)
    p.add_argument('--size', type=int, default=299)
    p.add_argument('--limit-classes', type=int, default=0, help='only the N biggest classes, for quick runs')
    a = p.parse_args()
    random.seed(11)
    os.makedirs(a.cache, exist_ok=True)

    import nltk
    nltk.download('wordnet', quiet=True)
    from nltk.corpus import wordnet as wn

    # The hand-made list merges some LVIS names into one friendlier thing ("Dishes", "Pots and pans").
    curated = {}
    for c in json.load(open(os.path.join(HERE, '..', 'household-detector', 'classes.json')))['classes']:
        for n in c['lvis']:
            curated[n.lower()] = c

    def roots(synset_name):
        try:
            s = wn.synset(synset_name)
        except Exception:
            return set()
        return {h.name() for path in s.hypernym_paths() for h in path}

    classes = {}  # LVIS category id -> {label, title, category}
    kept_names, dropped = [], 0
    with open(lvis_json(a.cache, 'val'), 'rb') as f:
        cats = list(ijson.items(f, 'categories.item'))
    for cat in cats:
        name = cat['name']
        low = name.lower()
        if low in NEVER:
            dropped += 1
            continue
        r = roots(cat.get('synset', ''))
        if low not in ALWAYS and low not in curated and (not (r & KEEP) or (r & DROP)):
            dropped += 1
            continue
        if low in curated:
            c = curated[low]
            info = {'label': c['key'], 'title': c['title'], 'category': c['category']}
        else:
            category = next((cat_ for root, cat_ in CATEGORY_ROOTS if root in r), 'other')
            info = {'label': re.sub(r'[^a-z0-9]+', '_', low).strip('_'), 'title': title_of(name), 'category': category}
        classes[cat['id']] = info
        kept_names.append(name)
    log(f'LVIS categories kept: {len(classes)} (dropped {dropped})')

    # Boxes per label, from val then train, at most per_class * 2 to pick from.
    boxes = defaultdict(list)  # label -> [(image id, x, y, w, h)]
    images = {}
    for split in ('val', 'train'):
        path = lvis_json(a.cache, split)
        with open(path, 'rb') as f:
            for ann in ijson.items(f, 'annotations.item'):
                info = classes.get(ann['category_id'])
                if not info:
                    continue
                x, y, w, h = (float(v) for v in ann['bbox'])
                if w < 24 or h < 24 or len(boxes[info['label']]) >= a.per_class * 2:
                    continue
                boxes[info['label']].append((ann['image_id'], x, y, w, h))
        needed = {iid for lst in boxes.values() for iid, *_ in lst}
        with open(path, 'rb') as f:
            for img in ijson.items(f, 'images.item'):
                if img['id'] in needed:
                    images[img['id']] = img['coco_url']

    labels = {}
    for info in classes.values():
        labels[info['label']] = info
    usable = {k: v for k, v in boxes.items() if len(v) >= a.min_class}
    if a.limit_classes:
        usable = dict(sorted(usable.items(), key=lambda kv: -len(kv[1]))[:a.limit_classes])
    log(f'classes with at least {a.min_class} examples: {len(usable)}')

    # Crops to make, grouped by photo so each photo is downloaded once.
    jobs = defaultdict(list)  # image id -> [(split, label, n, box)]
    for label, lst in usable.items():
        random.shuffle(lst)
        lst = lst[:a.per_class]
        n_test = max(2, len(lst) // 10)
        for n, (iid, x, y, w, h) in enumerate(lst):
            jobs[iid].append(('test' if n < n_test else 'train', label, n, (x, y, w, h)))

    def work(item):
        iid, crops = item
        try:
            with urllib.request.urlopen(images[iid], timeout=30) as r:
                img = Image.open(io.BytesIO(r.read())).convert('RGB')
        except Exception:
            return 0
        made = 0
        W, H = img.size
        for split, label, n, (x, y, w, h) in crops:
            pad = 0.1
            box = (max(0, x - w * pad), max(0, y - h * pad), min(W, x + w * (1 + pad)), min(H, y + h * (1 + pad)))
            crop = img.crop(tuple(int(v) for v in box))
            cw, ch = crop.size
            if cw < 16 or ch < 16:
                continue
            # Create ML can't read tiny images (the first run crashed on a 0x0 picture), so small crops are
            # scaled up to at least MIN_SIDE on the short side; big ones are shrunk to --size.
            if min(cw, ch) < MIN_SIDE:
                k = MIN_SIDE / min(cw, ch)
                crop = crop.resize((max(MIN_SIDE, round(cw * k)), max(MIN_SIDE, round(ch * k))), Image.BICUBIC)
            crop.thumbnail((a.size, a.size))
            if min(crop.size) < 16:
                continue
            d = os.path.join(a.out, split, label)
            os.makedirs(d, exist_ok=True)
            crop.save(os.path.join(d, f'{iid}_{n}.jpg'), 'JPEG', quality=88)
            made += 1
        return made

    with ThreadPoolExecutor(64) as pool:
        total = sum(pool.map(work, jobs.items()))
    log(f'crops: {total} from {len(jobs)} photos')

    # A label needs photos in train to be learned; keep test folders only for learned labels.
    learned = sorted(d for d in os.listdir(os.path.join(a.out, 'train')) if len(os.listdir(os.path.join(a.out, 'train', d))) >= 5)
    for d in os.listdir(os.path.join(a.out, 'test')):
        if d not in learned:
            import shutil
            shutil.rmtree(os.path.join(a.out, 'test', d))
    out = [{'label': l, 'title': labels[l]['title'], 'category': labels[l]['category'], 'item': True} for l in learned]
    json.dump(out, open(os.path.join(a.out, 'labels.json'), 'w'), indent=1)
    per_cat = defaultdict(int)
    for o in out:
        per_cat[o['category']] += 1
    log(f'{len(out)} kinds of things: ' + ', '.join(f'{k} {v}' for k, v in sorted(per_cat.items())))
    log('examples: ' + ', '.join(o['title'] for o in random.sample(out, min(40, len(out)))))


if __name__ == '__main__':
    main()
