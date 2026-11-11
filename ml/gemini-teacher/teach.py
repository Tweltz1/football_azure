#!/usr/bin/env python3
"""Gemini as the teacher for the on-phone item namers (Curbsy's ml/item-namer and ToteTrack's TinyCLIP namer).

Open Images V7 (boxes CC BY 4.0, photos CC BY 2.0) has many boxes that people only labeled with a broad kind:
"Furniture", "Tool", "Toy", "Kitchenware". The namers can't learn from those. This asks Gemini what each one
is exactly ("Step stool", "Hand saw", "Toy truck"), and keeps the ones it is sure of as new training photos.

The set grows a little every run (the free Gemini key has a daily limit) and lives in the GitHub release
`gemini-teacher` as teacher.zip:
  asked.json        every box asked so far: {id, image, box, broad, name, category, sure} (unsure ones too,
                    so they aren't asked again)
  crops/<id>.jpg    a 299 px picture of each box Gemini was sure of
Only Open Images *train* photos are used, and both namers add these pictures to training only, never to their
test photos, so their scores stay honest (checked by people, not by Gemini).

Usage: GEMINI_API_KEY=... python3 teach.py --cache cache --set set --requests 150
  --set: folder with the current set (unzipped teacher.zip); new answers are added to it.
Without GEMINI_API_KEY it does nothing.
"""
import argparse
import base64
import csv
import io
import json
import os
import random
import re
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OI_BOXES = 'https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv'
OI_CLASSES = 'https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv'
PHOTO = 'https://open-images-dataset.s3.amazonaws.com/train/{}.jpg'
# Broad Open Images kinds -> the category to suggest. Boxes of these are named by Gemini.
BROAD = {
    'Furniture': 'furniture', 'Table': 'furniture', 'Chair': 'furniture', 'Shelf': 'furniture', 'Cabinetry': 'furniture',
    'Drawer': 'furniture', 'Home appliance': 'appliances', 'Kitchen appliance': 'appliances',
    'Kitchenware': 'home', 'Kitchen utensil': 'home', 'Tableware': 'home', 'Container': 'home', 'Box': 'home',
    'Bathroom accessory': 'home', 'Plumbing fixture': 'building', 'Tool': 'tools', 'Toy': 'toys',
    'Sports equipment': 'sports', 'Hiking equipment': 'sports', 'Ball (Object)': 'sports',
    'Musical instrument': 'other', 'Office supplies': 'other', 'Luggage and bags': 'clothing',
    'Fashion accessory': 'clothing', 'Footwear': 'clothing', 'Personal care': 'home', 'Medical equipment': 'other',
    'Auto part': 'other', 'Lantern': 'home', 'Clock': 'home', 'Vase': 'home', 'Picture frame': 'home',
}
CATEGORIES = ['furniture', 'appliances', 'electronics', 'home', 'kids', 'clothing', 'books', 'sports', 'tools',
              'garden', 'building', 'toys', 'other']
# Broad kinds that still say what the thing is ("Chair"): Gemini can name the exact kind ("Office chair"), but a
# box with an exact kind at the same spot wins over them, and they win over the vaguest ones ("Furniture").
SOMEWHAT = {'Table', 'Chair', 'Shelf', 'Cabinetry', 'Drawer', 'Box', 'Ball (Object)', 'Lantern', 'Clock', 'Vase',
            'Picture frame', 'Footwear'}
MIN_BOX = 0.15        # of the photo's width and height: big enough to tell what it is
PER_BROAD = 4000      # candidate boxes kept per broad kind
BATCH = 10            # pictures per Gemini request
MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']
SIZE = 299


def log(*a):
    print(*a, flush=True)


def iou(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    w, h = min(ax1, bx1) - max(ax0, bx0), min(ay1, by1) - max(ay0, by0)
    if w <= 0 or h <= 0:
        return 0.0
    inter = w * h
    return inter / ((ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter)


def candidates(cache):
    """Broad-only boxes from Open Images train: {broad: [[image, x0, y0, x1, y1], ...]}. A broad box that is
    also boxed with a more exact kind (same spot) is skipped: the namers already learn from that one. The boxes CSV
    is 2 GB and sorted by photo, so it's read once, a photo at a time, and the result is kept in the cache."""
    path = os.path.join(cache, 'candidates.json')
    if os.path.exists(path):
        return json.load(open(path))
    os.makedirs(cache, exist_ok=True)
    names = {}
    with urllib.request.urlopen(OI_CLASSES, timeout=120) as r:
        for row in csv.reader(io.TextIOWrapper(r, encoding='utf-8')):
            if len(row) == 2:
                names[row[0]] = row[1]
    random.seed(7)
    out = defaultdict(list)
    seen = defaultdict(int)

    def level(n):
        return 2 if n not in BROAD else 1 if n in SOMEWHAT else 0

    def photo_done(image, boxes):
        for n, b, ok in boxes:
            if n not in BROAD or not ok:
                continue
            if any(level(m) > level(n) and iou(b, e) > 0.6 for m, e, _ in boxes):
                continue
            seen[n] += 1
            row = [image, *[round(v, 4) for v in b]]
            # Reservoir sample, so the kept boxes come from the whole list, not its first photos.
            if len(out[n]) < PER_BROAD:
                out[n].append(row)
            else:
                k = random.randrange(seen[n])
                if k < PER_BROAD:
                    out[n][k] = row

    with urllib.request.urlopen(OI_BOXES, timeout=1200) as r:
        reader = csv.reader(io.TextIOWrapper(r, encoding='utf-8'))
        h = next(reader)
        c = {k: h.index(k) for k in ('ImageID', 'LabelName', 'XMin', 'XMax', 'YMin', 'YMax', 'IsGroupOf',
                                     'IsDepiction', 'IsTruncated', 'IsOccluded')}
        image, boxes, n = None, [], 0
        for row in reader:
            if row[c['ImageID']] != image:
                if image:
                    photo_done(image, boxes)
                image, boxes = row[c['ImageID']], []
            n += 1
            if n % 2000000 == 0:
                log(f'  {n} boxes read')
            name = names.get(row[c['LabelName']], '')
            x0, x1, y0, y1 = (float(row[c[k]]) for k in ('XMin', 'XMax', 'YMin', 'YMax'))
            ok = (row[c['IsGroupOf']] == '0' and row[c['IsDepiction']] == '0' and row[c['IsTruncated']] == '0'
                  and row[c['IsOccluded']] == '0' and x1 - x0 >= MIN_BOX and y1 - y0 >= MIN_BOX)
            boxes.append((name, (x0, y0, x1, y1), ok))
        if image:
            photo_done(image, boxes)
    log(f'Open Images train boxes read: {n}; broad-only boxes kept: ' + ', '.join(f'{k} {len(v)}' for k, v in sorted(out.items())))
    json.dump(out, open(path, 'w'))
    return out


def crop(row):
    """299 px picture of the box with a little room around it, or None."""
    image, x0, y0, x1, y1 = row
    try:
        with urllib.request.urlopen(PHOTO.format(image), timeout=30) as r:
            img = Image.open(io.BytesIO(r.read())).convert('RGB')
    except Exception:
        return None
    W, H = img.size
    w, h = (x1 - x0) * W, (y1 - y0) * H
    pad = 0.1 * max(w, h)
    box = (max(0, x0 * W - pad), max(0, y0 * H - pad), min(W, x1 * W + pad), min(H, y1 * H + pad))
    c = img.crop(tuple(int(v) for v in box))
    if min(c.size) < 48:
        return None
    c.thumbnail((SIZE, SIZE))
    buf = io.BytesIO()
    c.save(buf, 'JPEG', quality=88)
    return buf.getvalue()


def system_prompt():
    names = [l.strip() for l in open(os.path.join(HERE, 'names.txt')) if l.strip() and not l.startswith('#')]
    return '\n'.join([
        'You label training photos for an app that names everyday things in photos (things people give away on the curb,',
        'or pack in storage totes). Each photo is cut from a bigger photo around one thing.',
        'For each photo, give the short everyday name of the main thing: 1 to 3 words, singular, capitalized like',
        '"Office chair", no brand, no color or material unless it is part of the usual name ("Wood dresser" -> "Dresser").',
        'Prefer a name from this list when one fits exactly; otherwise use the most common everyday name:',
        '; '.join(names),
        'sure = true only when the thing is clearly visible and you are confident of the exact kind. sure = false when',
        'it is blurry, mostly hidden, mostly a person or animal, several different things, a drawing or screen, or',
        'you can only tell the broad kind ("furniture", "toy", "tool").',
        f'category: one of {", ".join(CATEGORIES)}.',
        'Answer for every photo, in order, with its number.',
    ])


SCHEMA = {
    'type': 'OBJECT',
    'properties': {'photos': {'type': 'ARRAY', 'items': {
        'type': 'OBJECT',
        'properties': {'n': {'type': 'INTEGER'}, 'name': {'type': 'STRING'},
                       'category': {'type': 'STRING', 'enum': CATEGORIES}, 'sure': {'type': 'BOOLEAN'}},
        'required': ['n', 'name', 'category', 'sure']}}},
    'required': ['photos'],
}


class OutOfQuota(Exception):
    pass


def ask(key, system, jpegs, hints):
    """Gemini's answers for a batch of pictures: [{n, name, category, sure}]."""
    parts = []
    for n, (j, hint) in enumerate(zip(jpegs, hints), 1):
        parts.append({'text': f'Photo {n} (tagged "{hint}" by the dataset):'})
        parts.append({'inline_data': {'mime_type': 'image/jpeg', 'data': base64.b64encode(j).decode()}})
    body = json.dumps({
        'system_instruction': {'parts': [{'text': system}]},
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {'responseMimeType': 'application/json', 'responseSchema': SCHEMA, 'temperature': 0.1,
                             'maxOutputTokens': 2048},
    }).encode()
    busy = 0
    for attempt in range(8):
        model = MODELS[min(attempt // 4, len(MODELS) - 1)]
        req = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            data=body, headers={'content-type': 'application/json', 'x-goog-api-key': key})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.load(r)
            text = out['candidates'][0]['content']['parts'][0]['text']
            return json.loads(text).get('photos', [])
        except urllib.error.HTTPError as e:
            full = e.read().decode('utf-8', 'replace')
            log(f'  Gemini {model} error {e.code}: {" ".join(full.split())[:400]}')
            if e.code == 429 and 'perday' in full.lower():
                busy += 1
                if busy >= 2:
                    raise OutOfQuota(full[:300])
            if e.code not in (429, 500, 503):
                return None
        except Exception as e:  # bad JSON, timeouts
            log(f'  Gemini {model} problem: {type(e).__name__}')
        time.sleep(min(60, 5 * 2 ** (attempt % 4)))
    return None


def rid(row):
    """Stable id of a box: photo id plus its corners in thousandths."""
    return row[0] + '_' + '_'.join(str(int(v * 1000)) for v in row[1:])


def clean(name):
    name = re.sub(r'\s+', ' ', re.sub(r'[^A-Za-z0-9 &\'-]', ' ', name or '')).strip()[:40]
    return name[:1].upper() + name[1:]


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--cache', default='cache')
    p.add_argument('--set', default='set')
    p.add_argument('--requests', type=int, default=150, help='Gemini requests this run (the free key allows a few hundred a day)')
    p.add_argument('--minutes', type=float, default=75, help='stop asking after this long, so the set is always saved')
    a = p.parse_args()
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        log('No GEMINI_API_KEY: nothing to ask.')
        return
    os.makedirs(os.path.join(a.set, 'crops'), exist_ok=True)
    asked_path = os.path.join(a.set, 'asked.json')
    asked = json.load(open(asked_path)) if os.path.exists(asked_path) else []
    done = {r['id'] for r in asked}
    log(f'Asked before: {len(asked)} ({sum(r["sure"] for r in asked)} sure)')

    cand = candidates(a.cache)
    # Take the broad kinds in turn, so each run covers all of them.
    queues = {b: [r for r in rows if rid(r) not in done]
              for b, rows in cand.items()}
    todo = []
    while any(queues.values()) and len(todo) < a.requests * BATCH * 2:
        for b in sorted(queues):
            if queues[b]:
                todo.append((b, queues[b].pop()))
    log(f'Boxes left to ask: {sum(len(v) for v in queues.values()) + len(todo)}; trying {len(todo)} this run')

    system = system_prompt()
    stop_at = time.time() + a.minutes * 60
    sent, new, sure_new = 0, 0, 0
    with ThreadPoolExecutor(16) as pool:
        for i in range(0, len(todo), BATCH * 4):
            if sent >= a.requests or time.time() > stop_at:
                if time.time() > stop_at:
                    log('Out of time for this run: saving what we have.')
                break
            chunk = todo[i:i + BATCH * 4]
            pics = [(b, row, j) for (b, row), j in zip(chunk, pool.map(lambda t: crop(t[1]), chunk)) if j]
            for k in range(0, len(pics), BATCH):
                if sent >= a.requests or time.time() > stop_at:
                    break
                batch = pics[k:k + BATCH]
                try:
                    answers = ask(key, system, [j for _, _, j in batch], [b for b, _, _ in batch])
                except OutOfQuota:
                    log('Gemini daily limit reached: saving what we have.')
                    sent = a.requests
                    break
                sent += 1
                if not answers:
                    continue
                by_n = {x.get('n'): x for x in answers}
                for n, (b, row, j) in enumerate(batch, 1):
                    x = by_n.get(n)
                    if not x:
                        continue
                    name = clean(x.get('name'))
                    sure = bool(x.get('sure')) and bool(name) and name.lower() != b.lower()
                    box_id = rid(row)
                    cat = x.get('category') if x.get('category') in CATEGORIES else BROAD.get(b, 'other')
                    asked.append({'id': box_id, 'image': row[0], 'box': row[1:], 'broad': b, 'name': name,
                                  'category': cat, 'sure': sure})
                    new += 1
                    if sure:
                        open(os.path.join(a.set, 'crops', f'{box_id}.jpg'), 'wb').write(j)
                        sure_new += 1
                if sent % 20 == 0:
                    log(f'  {sent} requests, {new} answers, {sure_new} sure')
                    json.dump(asked, open(asked_path, 'w'))  # a cut-short run still keeps its answers
                time.sleep(2)
    json.dump(asked, open(asked_path, 'w'))
    names = defaultdict(int)
    for r in asked:
        if r['sure']:
            names[r['name']] += 1
    log(f'This run: {sent} requests, {new} answers, {sure_new} sure. Set now: {len(asked)} asked, '
        f'{sum(names.values())} sure photos, {len(names)} names.')
    log('Most common names: ' + ', '.join(f'{n} {c}' for n, c in sorted(names.items(), key=lambda kv: -kv[1])[:60]))


if __name__ == '__main__':
    main()
