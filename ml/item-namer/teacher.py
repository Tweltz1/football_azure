#!/usr/bin/env python3
"""Adds the photos Gemini named (ml/gemini-teacher, release gemini-teacher) to the namer's training crops.

Each photo Gemini was sure of goes under the kind with the same name (matched by title or label, like
fixes.py), or under a new kind once at least --min-new photos share a name Gemini gave. Training only: test
photos stay the ones people labeled, so the score (and promote.py's check) isn't graded by Gemini. Photos
whose Open Images picture is already among the test photos are skipped.

Usage: python3 teacher.py --set set --crops crops [--cap 150]
"""
import argparse
import json
import os
import re
import shutil
from collections import Counter, defaultdict

from fixes import norm

# Names too vague to teach a kind of thing ("Spare parts", "Old electronics", "Wall art").
VAGUE = re.compile(r'\b(parts?|electronics|instruments|accessories|supplies|equipment|items?|stuff|misc|miscellaneous|decor|art|things?|junk|assorted)$', re.I)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--set', default='set')
    p.add_argument('--crops', default='crops')
    p.add_argument('--cap', type=int, default=150, help='at most this many Gemini photos per kind')
    p.add_argument('--min-new', type=int, default=20)
    a = p.parse_args()
    asked_path = os.path.join(a.set, 'asked.json')
    if not os.path.exists(asked_path):
        print('No Gemini-named photos yet')
        return
    sure = [r for r in json.load(open(asked_path)) if r.get('sure')]

    test_dir = os.path.join(a.crops, 'test')
    in_test = {f.split('-', 2)[2].rsplit('_', 1)[0] for d in os.listdir(test_dir)
               for f in os.listdir(os.path.join(test_dir, d)) if f.startswith('oi-')} if os.path.isdir(test_dir) else set()

    labels_path = os.path.join(a.crops, 'labels.json')
    labels = json.load(open(labels_path))
    by_name = {}
    for l in labels:
        by_name.setdefault(norm(l['title']), l['label'])
        by_name.setdefault(norm(l['label'].replace('_', ' ')), l['label'])

    groups = defaultdict(list)
    for r in sure:
        if VAGUE.search(r['name']) or r['image'] in in_test or not os.path.exists(os.path.join(a.set, 'crops', f"{r['id']}.jpg")):
            continue
        groups[norm(r['name'])].append(r)

    added, new_kinds = Counter(), []
    for name, rs in sorted(groups.items()):
        label = by_name.get(name)
        if not label:
            if len(rs) < a.min_new:
                continue
            label = 'gem_' + name.replace(' ', '_')[:40]
            title = Counter(r['name'] for r in rs).most_common(1)[0][0]
            category = Counter(r['category'] for r in rs).most_common(1)[0][0]
            labels.append({'label': label, 'title': title, 'category': category, 'item': True})
            new_kinds.append(title)
        d = os.path.join(a.crops, 'train', label)
        os.makedirs(d, exist_ok=True)
        for r in rs[:a.cap]:
            shutil.copy(os.path.join(a.set, 'crops', f"{r['id']}.jpg"), os.path.join(d, f"gem_{r['id']}.jpg"))
            added[label] += 1
    json.dump(labels, open(labels_path, 'w'), indent=1)
    print(f'Gemini-named photos added: {sum(added.values())} to {len(added)} kinds; new kinds: {", ".join(new_kinds) or "none"}')
    print('Most added: ' + ', '.join(f'{l} {n}' for l, n in added.most_common(40)))


if __name__ == '__main__':
    main()
