#!/usr/bin/env python3
"""Learning loop, last step: makes a trained namer the one phones use, if it's at least as good.

Phones (and new app builds) take the namer from release item-namer-current (manifest.json + namer.f32 +
labels.json). A candidate (out/ of a training run, or a release item-namer-vN) replaces it only when, on its
own test photos, it is right about as often when it's at least 70% sure (the only time the apps trust it)
and is that sure about as often. Test photos change between runs (new fixes, new kinds), hence the small
allowances.

Usage: python3 promote.py --dir out [--tag item-namer-v2] [--force]
Needs GH_TOKEN and GITHUB_REPOSITORY (set in GitHub Actions).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

CURRENT = 'item-namer-current'
RIGHT_SLACK = 0.02   # may be right up to 2 points less often when sure...
SHARE_SLACK = 0.03   # ...and sure for up to 3 points fewer photos
SURE = '0.7'


def gh(*args, check=True):
    return subprocess.run(['gh', *args], check=check, capture_output=True, text=True)


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True, help='folder with namer.f32, labels.json, metrics.json')
    ap.add_argument('--tag', default='', help='the release the candidate came from, for the record')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    repo = os.environ['GITHUB_REPOSITORY']
    new = json.load(open(os.path.join(a.dir, 'metrics.json')))

    old = None
    with tempfile.TemporaryDirectory() as tmp:
        if gh('release', 'download', CURRENT, '-R', repo, '-D', tmp, '-p', 'metrics.json', check=False).returncode == 0:
            old = json.load(open(os.path.join(tmp, 'metrics.json')))

    def sure(m):
        # fit.py writes percentages: {"share": 18.5, "accuracy": 89.3}
        s = m.get('whenSure', {}).get(SURE, {})
        return float(s.get('accuracy') or 0) / 100, float(s.get('share') or 0) / 100

    n_right, n_share = sure(new)
    print(f'candidate {a.tag or a.dir}: {new.get("kinds")} kinds, top-1 {new.get("testAccuracy")}, '
          f'when {SURE}+ sure: {n_share:.1%} of photos, {n_right:.1%} right')
    if old:
        o_right, o_share = sure(old)
        print(f'current {old.get("tag", "?")}: {old.get("kinds")} kinds, top-1 {old.get("testAccuracy")}, '
              f'when {SURE}+ sure: {o_share:.1%} of photos, {o_right:.1%} right')
        good = n_right >= o_right - RIGHT_SLACK and n_share >= o_share - SHARE_SLACK
        if not good and not a.force:
            print('Not better: phones keep the current namer.')
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                open(os.environ['GITHUB_STEP_SUMMARY'], 'a').write(f'Item namer {a.tag}: not promoted (worse when sure than {old.get("tag")}).\n')
            return
    else:
        print('No current namer yet.')

    new['tag'] = a.tag
    metrics = os.path.join(a.dir, 'metrics.json')
    json.dump(new, open(metrics, 'w'), indent=1)
    manifest = os.path.join(a.dir, 'manifest.json')
    json.dump({'tag': a.tag, 'kinds': new.get('kinds'),
               'namerSha256': sha(os.path.join(a.dir, 'namer.f32')),
               'labelsSha256': sha(os.path.join(a.dir, 'labels.json'))}, open(manifest, 'w'), indent=1)
    if gh('release', 'view', CURRENT, '-R', repo, check=False).returncode != 0:
        gh('release', 'create', CURRENT, '-R', repo, '--latest=false', '--title', 'Item namer (current)',
           '--notes', 'The item namer phones use now. Replaced by item-namer-promote when a retrained one does at '
                      'least as well; see metrics.json for which version it is.')
    # Weights and labels first, manifest last: a phone only fetches files the manifest names, by fingerprint.
    gh('release', 'upload', CURRENT, '-R', repo, '--clobber',
       os.path.join(a.dir, 'namer.f32'), os.path.join(a.dir, 'labels.json'), metrics)
    gh('release', 'upload', CURRENT, '-R', repo, '--clobber', manifest)
    print(f'Promoted {a.tag or a.dir} to {CURRENT}.')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        open(os.environ['GITHUB_STEP_SUMMARY'], 'a').write(f'Item namer {a.tag}: promoted to {CURRENT}.\n')


if __name__ == '__main__':
    sys.exit(main())
