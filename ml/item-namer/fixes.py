#!/usr/bin/env python3
"""Learning loop: adds the name fixes people sent from Curbsy and ToteTrack to the training crops.

Reads public.junk_label_fixes from Supabase (service key, never shipped in an app). Every fix with a picture of
the item (people who turned on "Help improve item recognition") becomes a training photo:
  - under the kind of thing it was renamed to, when that kind is already learned (matched by title or label);
  - under a new kind, once at least --min-new pictures from at least --min-people different people agree.
Also writes fixes.json: the most common "guessed X, was really Y" pairs, to see where the models go wrong.

Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 fixes.py --crops crops --out out
Without the two settings it does nothing (so training still works on forks and local runs).
"""
import argparse
import base64
import io
import json
import os
import re
import urllib.request
from collections import Counter, defaultdict

from PIL import Image


def norm(s):
    s = re.sub(r'\s+\d+$', '', (s or '').strip().lower())
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    return s[:-1] if s.endswith('s') and not s.endswith('ss') and len(s) > 3 else s


def rows(url, key):
    out, offset = [], 0
    cols = 'id,user_id,app,guess_label,guess_title,guess_source,final_title,final_category,crop'
    while True:
        req = urllib.request.Request(
            f"{url.rstrip('/')}/rest/v1/junk_label_fixes?select={cols}&order=created_at&limit=1000&offset={offset}",
            headers={'apikey': key, 'Authorization': f'Bearer {key}'})
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.load(r)
        out += page
        if len(page) < 1000:
            return out
        offset += 1000


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--crops', default='crops')
    p.add_argument('--out', default='out')
    p.add_argument('--size', type=int, default=299)
    p.add_argument('--min-new', type=int, default=12)
    p.add_argument('--min-people', type=int, default=3)
    a = p.parse_args()
    url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_KEY')
    os.makedirs(a.out, exist_ok=True)
    if not url or not key:
        print('no Supabase settings: skipping name fixes')
        return
    fixes = rows(url, key)
    print(f'name fixes: {len(fixes)} ({sum(1 for f in fixes if f.get("crop"))} with a picture)')

    labels_path = os.path.join(a.crops, 'labels.json')
    labels = json.load(open(labels_path))
    by_name = {}
    for l in labels:
        by_name.setdefault(norm(l['title']), l['label'])
        by_name.setdefault(norm(l['label'].replace('_', ' ')), l['label'])

    def save(label, f):
        try:
            img = Image.open(io.BytesIO(base64.b64decode(f['crop']))).convert('RGB')
        except Exception:
            return False
        img.thumbnail((a.size, a.size))
        d = os.path.join(a.crops, 'train', label)
        os.makedirs(d, exist_ok=True)
        img.save(os.path.join(d, f"fix_{f['id']}.jpg"), 'JPEG', quality=88)
        return True

    added, new_kinds, waiting = Counter(), [], defaultdict(list)
    for f in fixes:
        if not f.get('crop'):
            continue
        name = norm(f['final_title'])
        if not name:
            continue
        if name in by_name:
            added[by_name[name]] += save(by_name[name], f)
        else:
            waiting[name].append(f)
    for name, fs in waiting.items():
        people = {f['user_id'] for f in fs}
        if len(fs) < a.min_new or len(people) < a.min_people:
            continue
        label = 'fix_' + name.replace(' ', '_')[:40]
        n = sum(save(label, f) for f in fs)
        if n >= 5:
            title = Counter(re.sub(r'\s+\d+$', '', f['final_title'].strip()) for f in fs).most_common(1)[0][0]
            category = Counter(f['final_category'] or 'other' for f in fs).most_common(1)[0][0]
            labels.append({'label': label, 'title': title, 'category': category, 'item': True})
            new_kinds.append(title)
    json.dump(labels, open(labels_path, 'w'), indent=1)

    # Mix-ups only (people who share pictures also send the guesses they kept, which only add photos).
    pairs = Counter(p for p in ((f['guess_title'] or f['guess_label'], re.sub(r'\s+\d+$', '', f['final_title'].strip())) for f in fixes)
                    if norm(p[0]) != norm(p[1]))
    report = {
        'fixes': len(fixes),
        'with_picture': sum(1 for f in fixes if f.get('crop')),
        'pictures_added': sum(added.values()),
        'new_kinds': new_kinds,
        'waiting_for_more': {k: len(v) for k, v in sorted(waiting.items(), key=lambda kv: -len(kv[1]))[:50] if k not in map(norm, new_kinds)},
        'top_mixups': [{'guessed': g, 'was': w, 'times': n} for (g, w), n in pairs.most_common(50)],
    }
    json.dump(report, open(os.path.join(a.out, 'fixes.json'), 'w'), indent=1)
    print(f"pictures added: {report['pictures_added']}, new kinds: {', '.join(new_kinds) or 'none'}")


if __name__ == '__main__':
    main()
