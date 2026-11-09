#!/usr/bin/env python3
"""Builds the training set for the shared household-item detector (Curbsy and ToteTrack).

Pulls photos with boxes for the classes in classes.json from two openly licensed sets:
  - LVIS v1 (annotations CC BY 4.0, images from COCO / Flickr): about 1,200 kinds of everyday things.
  - Open Images v7 validation and test (annotations CC BY 4.0, images CC BY 2.0): 600 kinds.
Writes Create ML's object detection format: <out>/train/annotations.json, <out>/test/annotations.json,
with the photos next to them, shrunk to at most --size pixels on the long side.

Usage: python3 prepare.py --out data --per-class 150 [--cache cache]
Needs: pip install pillow ijson
"""
import argparse
import csv
import io
import json
import os
import random
import sys
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
OI_CLASSES = 'https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv'
OI_BOXES = {
    'validation': 'https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv',
    'test': 'https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv',
}
OI_IMAGE = 'https://open-images-dataset.s3.amazonaws.com/{split}/{id}.jpg'


def log(*a):
    print(*a, flush=True)


def fetch(url, path):
    if not os.path.exists(path):
        log('downloading', url)
        tmp = path + '.part'
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, path)
    return path


def norm(name):
    return name.lower().replace(' ', '_')


def lvis_json(cache, split):
    """Path to the unzipped LVIS annotations for a split."""
    target = os.path.join(cache, f'lvis_v1_{split}.json')
    if not os.path.exists(target):
        z = fetch(LVIS[split], os.path.join(cache, f'lvis_v1_{split}.json.zip'))
        with zipfile.ZipFile(z) as zf:
            zf.extractall(cache)
        os.remove(z)
    return target


def lvis_source(cache, classes, per_class):
    """[(url, [(key, x, y, w, h)], width, height)] from LVIS, about per_class photos for each class."""
    wanted = {}  # LVIS category id -> class key
    found_names = defaultdict(list)
    images = {}
    picks = defaultdict(set)  # key -> image ids
    boxes = defaultdict(list)  # image id -> boxes
    for split in ('val', 'train'):
        path = lvis_json(cache, split)
        with open(path, 'rb') as f:
            for cat in ijson.items(f, 'categories.item'):
                names = {norm(cat['name'])} | {norm(s) for s in cat.get('synonyms', [])}
                for c in classes:
                    if any(norm(n) in names for n in c['lvis']):
                        wanted[cat['id']] = c['key']
                        found_names[c['key']].append(cat['name'])
                        break
        # Which photos show each class (the first per_class * 2 seen, picked from at random later).
        seen = defaultdict(list)
        with open(path, 'rb') as f:
            for ann in ijson.items(f, 'annotations.item'):
                key = wanted.get(ann['category_id'])
                if key and len(seen[key]) < per_class * 3:
                    seen[key].append(ann['image_id'])
        for key, ids in seen.items():
            ids = list(dict.fromkeys(ids))
            random.shuffle(ids)
            need = per_class - len(picks[key])
            picks[key].update(ids[:max(0, need)])
        chosen = set().union(*picks.values()) if picks else set()
        with open(path, 'rb') as f:
            for img in ijson.items(f, 'images.item'):
                if img['id'] in chosen and img['id'] not in images:
                    images[img['id']] = (img['coco_url'], img['width'], img['height'])
        with open(path, 'rb') as f:
            for ann in ijson.items(f, 'annotations.item'):
                key = wanted.get(ann['category_id'])
                if key and ann['image_id'] in chosen:
                    x, y, w, h = (float(v) for v in ann['bbox'])
                    boxes[ann['image_id']].append((key, x, y, w, h))
        if all(len(picks[c['key']]) >= per_class for c in classes if c['key'] in found_names):
            break
    for c in classes:
        log(f"LVIS {c['key']:16} {len(picks.get(c['key'], ())):4} photos  ({', '.join(found_names.get(c['key'], [])) or 'no match'})")
    out = []
    for iid, (url, w, h) in images.items():
        # De-duplicate boxes (one class can come from several LVIS names).
        b = list(dict.fromkeys(boxes.get(iid, [])))
        if b:
            out.append((url, b, w, h))
    return out


def oi_source(cache, classes, per_class, already):
    """Open Images photos for classes LVIS is short on. Boxes are 0-1 here; sizes come from the photo."""
    mids = {}
    with open(fetch(OI_CLASSES, os.path.join(cache, 'oi_classes.csv')), newline='') as f:
        for row in csv.reader(f):
            for c in classes:
                if row[1] in c.get('oi', []):
                    mids[row[0]] = c['key']
    by_image = defaultdict(list)
    for split, url in OI_BOXES.items():
        with open(fetch(url, os.path.join(cache, f'oi_{split}.csv')), newline='') as f:
            for row in csv.DictReader(f):
                key = mids.get(row['LabelName'])
                if key and row.get('IsGroupOf') != '1':
                    by_image[(split, row['ImageID'])].append(
                        (key, float(row['XMin']), float(row['YMin']), float(row['XMax']), float(row['YMax'])))
    counts = defaultdict(int, already)
    items = list(by_image.items())
    random.shuffle(items)
    out = []
    for (split, iid), b in items:
        if not any(counts[k] < per_class for k, *_ in b):
            continue
        for k in {k for k, *_ in b}:
            counts[k] += 1
        out.append((OI_IMAGE.format(split=split, id=iid), b, None, None))
    for c in classes:
        if c.get('oi'):
            log(f"OI   {c['key']:16} {counts[c['key']] - already.get(c['key'], 0):4} photos")
    return out


def save_photo(job):
    """Downloads one photo, shrinks it, and returns its Create ML entry (or None)."""
    url, boxes, w0, h0, out_dir, name, size = job
    path = os.path.join(out_dir, name)
    try:
        if not os.path.exists(path):
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read()
            img = Image.open(io.BytesIO(data)).convert('RGB')
            w, h = img.size
            scale = min(1.0, size / max(w, h))
            if scale < 1:
                img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            img.save(path, 'JPEG', quality=88)
        img = Image.open(path)
        W, H = img.size
    except Exception as e:  # missing or broken photos are skipped
        return None
    anns = []
    for key, a, b, c, d in boxes:
        if w0 is None:  # Open Images: corners, 0-1
            x, y, bw, bh = a * W, b * H, (c - a) * W, (d - b) * H
        else:  # LVIS: x, y, width, height in the original pixels
            s = W / w0
            x, y, bw, bh = a * s, b * s, c * s, d * s
        if bw < 10 or bh < 10:
            continue
        anns.append({'label': key, 'coordinates': {'x': x + bw / 2, 'y': y + bh / 2, 'width': bw, 'height': bh}})
    return {'image': name, 'annotations': anns} if anns else None


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--out', default='data')
    p.add_argument('--cache', default='cache')
    p.add_argument('--per-class', type=int, default=150)
    p.add_argument('--size', type=int, default=512)
    p.add_argument('--test-share', type=float, default=0.1)
    p.add_argument('--only', default='', help='comma separated class keys, for quick runs')
    a = p.parse_args()
    random.seed(7)
    os.makedirs(a.cache, exist_ok=True)
    classes = json.load(open(os.path.join(HERE, 'classes.json')))['classes']
    if a.only:
        keep = set(a.only.split(','))
        classes = [c for c in classes if c['key'] in keep]

    photos = lvis_source(a.cache, classes, a.per_class)
    have = defaultdict(int)
    for _, b, _, _ in photos:
        for k in {k for k, *_ in b}:
            have[k] += 1
    photos += oi_source(a.cache, classes, a.per_class, have)
    random.shuffle(photos)

    n_test = int(len(photos) * a.test_share)
    trained = defaultdict(int)
    for split, part in (('test', photos[:n_test]), ('train', photos[n_test:])):
        d = os.path.join(a.out, split)
        os.makedirs(d, exist_ok=True)
        jobs = [(u, b, w, h, d, f'{split}_{i:06d}.jpg', a.size) for i, (u, b, w, h) in enumerate(part)]
        with ThreadPoolExecutor(32) as pool:
            entries = [e for e in pool.map(save_photo, jobs) if e]
        json.dump(entries, open(os.path.join(d, 'annotations.json'), 'w'))
        per = defaultdict(int)
        for e in entries:
            for an in e['annotations']:
                per[an['label']] += 1
        log(f'{split}: {len(entries)} photos, {sum(per.values())} boxes')
        if split == 'train':
            trained.update(per)
            for c in classes:
                if per[c['key']] < 20:
                    log(f"  few examples for {c['key']}: {per[c['key']]}")
    # Labels file the apps read: model label -> title, category.
    # Only classes the model actually learned.
    labels = [{'label': c['key'], 'title': c['title'], 'category': c['category'], 'item': c.get('item', True)}
              for c in classes if trained[c['key']] > 0]
    json.dump(labels, open(os.path.join(a.out, 'labels.json'), 'w'), indent=1)


if __name__ == '__main__':
    sys.exit(main())
