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

# Curb finds that the hand-made list merges into a broader thing ("Mattress" into "Bed") but that people
# list on their own. LVIS name -> (label, title, category).
SPLIT = {
    'mattress': ('mattress', 'Mattress', 'furniture'),
    'bunk_bed': ('bunk_bed', 'Bunk bed', 'furniture'),
    'dresser': ('dresser', 'Dresser', 'furniture'),
    'chest_of_drawers_(furniture)': ('dresser', 'Dresser', 'furniture'),
    'bureau_(furniture)': ('dresser', 'Dresser', 'furniture'),
    'file_cabinet': ('filing_cabinet', 'Filing cabinet', 'furniture'),
    'bookcase': ('bookcase', 'Bookcase', 'furniture'),
    'monitor_(computer_equipment) computer_monitor': ('computer_monitor', 'Computer monitor', 'electronics'),
    'computer_monitor': ('computer_monitor', 'Computer monitor', 'electronics'),
    'armchair': ('armchair', 'Armchair', 'furniture'),
    'rocking_chair': ('rocking_chair', 'Rocking chair', 'furniture'),
    'folding_chair': ('folding_chair', 'Folding chair', 'furniture'),
    'highchair': ('high_chair', 'High chair', 'kids'),
    'coffee_table': ('coffee_table', 'Coffee table', 'furniture'),
    'dining_table': ('dining_table', 'Dining table', 'furniture'),
    'kitchen_table': ('dining_table', 'Dining table', 'furniture'),
    'floor_lamp': ('floor_lamp', 'Floor lamp', 'home'),
    'chain_saw': ('chainsaw', 'Chainsaw', 'tools'),
    'chainsaw': ('chainsaw', 'Chainsaw', 'tools'),
    'teddy_bear': ('stuffed_animal', 'Stuffed animal', 'toys'),
    'stuffed_animal': ('stuffed_animal', 'Stuffed animal', 'toys'),
    'doll': ('doll', 'Doll', 'toys'),
    'toaster_oven': ('toaster_oven', 'Toaster oven', 'appliances'),
    'crock_pot': ('slow_cooker', 'Slow cooker', 'appliances'),
    'food_processor': ('food_processor', 'Food processor', 'appliances'),
    'laundry_basket': ('laundry_basket', 'Laundry basket', 'home'),
    'power_strip': ('power_strip', 'Power strip', 'electronics'),
    'tire': ('tire', 'Tire', 'other'),
    'crate': ('crate', 'Crate', 'home'),
}

# Open Images V7 (boxes CC BY 4.0, photos CC BY 2.0) fills in common curb finds that LVIS has few or none of,
# and adds photos to thin kinds. Open Images class name -> (label, title, category); a label that LVIS also
# has keeps LVIS's title. Classes missing from Open Images are logged and skipped.
OPEN_IMAGES = {
    'Bed': ('bed', 'Bed', 'furniture'), 'Infant bed': ('crib', 'Crib', 'kids'),
    'Couch': ('sofa', 'Sofa', 'furniture'), 'Sofa bed': ('sofa_bed', 'Sofa bed', 'furniture'),
    'Studio couch': ('sofa_bed', 'Sofa bed', 'furniture'), 'Loveseat': ('sofa', 'Sofa', 'furniture'),
    'Chest of drawers': ('dresser', 'Dresser', 'furniture'), 'Filing cabinet': ('filing_cabinet', 'Filing cabinet', 'furniture'),
    'Bookcase': ('bookcase', 'Bookcase', 'furniture'), 'Nightstand': ('nightstand', 'Nightstand', 'furniture'),
    'Wardrobe': ('wardrobe', 'Wardrobe', 'furniture'), 'Cupboard': ('cupboard', 'Cupboard', 'furniture'),
    'Bathroom cabinet': ('bathroom_cabinet', 'Bathroom cabinet', 'furniture'),
    'Coffee table': ('coffee_table', 'Coffee table', 'furniture'),
    'Kitchen & dining room table': ('dining_table', 'Dining table', 'furniture'),
    'Desk': ('desk', 'Desk', 'furniture'), 'Stool': ('stool', 'Stool', 'furniture'), 'Bench': ('bench', 'Bench', 'furniture'),
    'Billiard table': ('pool_table', 'Pool table', 'sports'), 'Table tennis racket': ('ping_pong_paddle', 'Ping pong paddle', 'sports'),
    'Computer monitor': ('computer_monitor', 'Computer monitor', 'electronics'), 'Television': ('tv', 'TV', 'electronics'),
    'Printer': ('printer', 'Printer', 'electronics'), 'Desktop computer': ('desktop_computer', 'Desktop computer', 'electronics'),
    'Washing machine': ('automatic_washer', 'Washing machine', 'appliances'),
    'Refrigerator': ('refrigerator', 'Refrigerator', 'appliances'), 'Microwave oven': ('microwave', 'Microwave', 'appliances'),
    'Oven': ('oven', 'Oven', 'appliances'), 'Gas stove': ('stove', 'Stove', 'appliances'),
    'Dishwasher': ('dishwasher', 'Dishwasher', 'appliances'), 'Ceiling fan': ('ceiling_fan', 'Ceiling fan', 'home'),
    'Mechanical fan': ('fan', 'Fan', 'appliances'), 'Humidifier': ('humidifier', 'Humidifier', 'appliances'),
    'Slow cooker': ('slow_cooker', 'Slow cooker', 'appliances'), 'Pressure cooker': ('pressure_cooker', 'Pressure cooker', 'appliances'),
    'Waffle iron': ('waffle_iron', 'Waffle iron', 'appliances'), 'Coffeemaker': ('coffee_maker', 'Coffee maker', 'appliances'),
    'Toaster': ('toaster', 'Toaster', 'appliances'), 'Blender': ('blender', 'Blender', 'appliances'),
    'Mixer': ('stand_mixer', 'Stand mixer', 'appliances'), 'Food processor': ('food_processor', 'Food processor', 'appliances'),
    'Kettle': ('kettle', 'Kettle', 'appliances'), 'Sewing machine': ('sewing_machine', 'Sewing machine', 'appliances'),
    'Lawn mower': ('lawn_mower', 'Lawn mower', 'garden'), 'Tire': ('tire', 'Tire', 'other'), 'Barrel': ('barrel', 'Barrel', 'garden'),
    'Ladder': ('ladder', 'Ladder', 'tools'), 'Chainsaw': ('chainsaw', 'Chainsaw', 'tools'), 'Drill (Tool)': ('drill', 'Drill', 'tools'),
    'Toilet': ('toilet', 'Toilet', 'building'), 'Bathtub': ('bathtub', 'Bathtub', 'building'), 'Sink': ('sink', 'Sink', 'building'),
    'Door': ('door', 'Door', 'building'), 'Window blind': ('window_blinds', 'Window blinds', 'home'),
    'Stationary bicycle': ('exercise_bike', 'Exercise bike', 'sports'), 'Treadmill': ('treadmill', 'Treadmill', 'sports'),
    'Indoor rower': ('rowing_machine', 'Rowing machine', 'sports'), 'Dumbbell': ('dumbbell', 'Dumbbell', 'sports'),
    'Punching bag': ('punching_bag', 'Punching bag', 'sports'), 'Swing': ('swing', 'Swing', 'kids'),
    'Bicycle': ('bicycle', 'Bicycle', 'sports'), 'Wheelchair': ('wheelchair', 'Wheelchair', 'other'),
    'Piano': ('piano', 'Piano', 'other'), 'Tent': ('tent', 'Tent', 'sports'), 'Christmas tree': ('christmas_tree', 'Christmas tree', 'home'),
    'Teddy bear': ('stuffed_animal', 'Stuffed animal', 'toys'), 'Doll': ('doll', 'Doll', 'toys'),
    'Dog bed': ('pet_bed', 'Pet bed', 'home'), 'Cat furniture': ('cat_tree', 'Cat tree', 'home'),
    'Suitcase': ('suitcase', 'Suitcase', 'clothing'), 'Box': ('storage_box', 'Box', 'home'),
    'Flowerpot': ('flowerpot', 'Flowerpot', 'garden'), 'Lamp': ('lamp', 'Lamp', 'home'), 'Mirror': ('mirror', 'Mirror', 'home'),
    'Guitar': ('guitar', 'Guitar', 'other'), 'Drum': ('drum_musical_instrument', 'Drum', 'other'),
    'Snowboard': ('snowboard', 'Snowboard', 'sports'), 'Ski': ('ski', 'Ski', 'sports'), 'Golf cart': ('golfcart', 'Golf cart', 'sports'),
}
OI_BOXES = {
    # split -> boxes CSV; photos at https://open-images-dataset.s3.amazonaws.com/<split>/<id>.jpg
    'validation': 'https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv',
    'test': 'https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv',
    'train': 'https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv',
}
OI_CLASSES = 'https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv'
OI_MIN_BOX = 0.05  # of the photo's width and height


def open_images_boxes(cache, labels, have, cap):
    """Yields (label, (image id, x, y, w, h)) from Open Images for labels with fewer than cap boxes so far.
    Boxes are 0..1. New labels join `labels`. The boxes we use are kept in cache/oi_boxes.json, since the full
    training list is a 2 GB download."""
    import csv
    store = os.path.join(cache, 'oi_boxes.json')
    want_sig = sorted(k for k, v in OPEN_IMAGES.items() if v)
    data = json.load(open(store)) if os.path.exists(store) else None
    if not data or data.get('classes') != want_sig:
        mids = {}
        with urllib.request.urlopen(OI_CLASSES, timeout=120) as r:
            for row in csv.reader(io.TextIOWrapper(r, encoding='utf-8')):
                if len(row) == 2 and OPEN_IMAGES.get(row[1]):
                    mids[row[0]] = row[1]
        log(f'Open Images classes found: {len(mids)}; missing: {sorted(set(want_sig) - set(mids.values()))}')
        rows = defaultdict(list)  # class name -> [[split, image, x, y, w, h]]
        for split, url in OI_BOXES.items():
            n = 0
            with urllib.request.urlopen(url, timeout=600) as r:
                reader = csv.reader(io.TextIOWrapper(r, encoding='utf-8'))
                h = next(reader)
                c = {k: h.index(k) for k in ('ImageID', 'LabelName', 'XMin', 'XMax', 'YMin', 'YMax', 'IsGroupOf', 'IsDepiction')}
                for row in reader:
                    name = mids.get(row[c['LabelName']])
                    if not name or row[c['IsGroupOf']] == '1' or row[c['IsDepiction']] == '1':
                        continue
                    x0, x1, y0, y1 = (float(row[c[k]]) for k in ('XMin', 'XMax', 'YMin', 'YMax'))
                    if x1 - x0 < OI_MIN_BOX or y1 - y0 < OI_MIN_BOX or len(rows[name]) >= 1000:
                        continue
                    rows[name].append([split, row[c['ImageID']], x0, y0, x1 - x0, y1 - y0])
                    n += 1
            log(f'Open Images {split}: {n} boxes kept')
        data = {'classes': want_sig, 'rows': rows}
        json.dump(data, open(store, 'w'))
    added = defaultdict(int)
    for name, lst in sorted(data['rows'].items()):
        label, title, category = OPEN_IMAGES[name]
        if label not in labels:
            labels[label] = {'label': label, 'title': title, 'category': category}
        for split, image, x, y, w, h in lst:
            if have.get(label, 0) + added[label] >= cap:
                break
            added[label] += 1
            yield label, (f'oi-{split}-{image}', x, y, w, h)
    log('Open Images boxes added: ' + ', '.join(f'{l} {n}' for l, n in sorted(added.items())))


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
        if low not in ALWAYS and low not in curated and low not in SPLIT and (not (r & KEEP) or (r & DROP)):
            dropped += 1
            continue
        if low in SPLIT:
            key, title, category = SPLIT[low]
            info = {'label': key, 'title': title, 'category': category}
        elif low in curated:
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

    for label, (iid, x, y, w, h) in open_images_boxes(a.cache, labels, {l: len(v) for l, v in boxes.items()}, a.per_class * 2):
        boxes[label].append((iid, x, y, w, h))
        images[iid] = 'https://open-images-dataset.s3.amazonaws.com/{}/{}.jpg'.format(*iid[3:].split('-', 1))
    log('photos per kind after Open Images: ' + ', '.join(f'{l} {len(v)}' for l, v in sorted(boxes.items(), key=lambda kv: len(kv[1]))[:60]))
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
            if isinstance(iid, str) and iid.startswith('oi-'):  # Open Images boxes are 0..1
                x, y, w, h = x * W, y * H, w * W, h * H
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
