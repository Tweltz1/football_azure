"""Compares Curbsy's item namer (Apple feature print + our softmax, release item-namer-vN) with ToteTrack's
(TinyCLIP Core ML model + name embeddings, release totetrack-namer-N) on the same test photos.

Fair test set: Curbsy's test crops (never used to train Curbsy's namer) whose photo comes from LVIS val,
which ToteTrack's namer never trained on (it uses LVIS train and Open Images), limited to kinds that both
namers know. LVIS kinds that ToteTrack merges into one name (glove + work glove -> Gloves) count as one kind
for both namers. Each namer picks from its own whole list of names.

  python compare.py --crops CROPS --feats FEATS --ours OURS_DIR --tote TOTE_DIR --classes classes.txt \
      --val-json lvis_v1_val.json --out OUT
"""

import argparse
import json
import os
import re
from collections import defaultdict

import coremltools as ct
import ijson
import numpy as np
from PIL import Image

SURE = (0.3, 0.5, 0.7, 0.9)


def norm(s):
    s = re.sub(r"\(.*?\)", " ", s.lower()).replace("_", " ")
    return " ".join(s.split())


def tote_groups(path):
    """LVIS name or synonym (normalized) -> ToteTrack name."""
    out = {}
    for line in open(path):
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        name, syns = line.split(":", 1)
        for s in syns.split(","):
            if s.strip():
                out.setdefault(norm(s), name.strip())
    return out


def softmax(z):
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def score(rows):
    """rows: [(top3 groups, top-1 probability, true group)]"""
    n = len(rows)
    r = {"pictures": n,
         "top1": sum(t[0] == g for t, _, g in rows) / n,
         "top3": sum(g in t[:3] for t, _, g in rows) / n,
         "whenSure": {}}
    for s in SURE:
        sure = [(t, g) for t, p, g in rows if p >= s]
        r["whenSure"][str(s)] = {"share": len(sure) / n,
                                 "right": (sum(t[0] == g for t, g in sure) / len(sure)) if sure else None}
    return r


def main():
    ap = argparse.ArgumentParser()
    for a in ("crops", "feats", "ours", "tote", "classes", "val_json", "out"):
        ap.add_argument("--" + a.replace("_", "-"), required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    groups = tote_groups(a.classes)

    def group(label):
        return groups.get(norm(label), label).lower()

    with open(a.val_json, "rb") as f:
        val_ids = {img["id"] for img in ijson.items(f, "images.item")}
    print(f"LVIS val photos: {len(val_ids)}")

    # Curbsy's namer.
    labels = json.load(open(os.path.join(a.ours, "labels.json")))
    kinds = [l["label"] for l in labels]
    W = np.fromfile(os.path.join(a.ours, "namer.f32"), dtype=np.float32).reshape(-1, len(kinds))
    idx = json.load(open(os.path.join(a.feats, "index.json")))
    F = np.fromfile(os.path.join(a.feats, "features.f32"), dtype=np.float32).reshape(len(idx), -1)
    assert F.shape[1] + 1 == W.shape[0], (F.shape, W.shape)
    feat_of = {row[2]: F[k] for k, row in enumerate(idx)}

    # ToteTrack's namer.
    tj = json.load(open(os.path.join(a.tote, "items.json")))
    tnames = [n.lower() for n in tj["names"]]
    T = np.fromfile(os.path.join(a.tote, "items.bin"), dtype=np.float16).astype(np.float32).reshape(len(tnames), tj["dim"])
    model = ct.models.MLModel(os.path.join(a.tote, "ToteNamer.mlpackage"))
    spec_in = model.get_spec().description.input[0]
    side = spec_in.type.imageType.width or 224
    tote_known = set(tnames)

    test = []
    tdir = os.path.join(a.crops, "test")
    for label in sorted(os.listdir(tdir)):
        if label.startswith("."):
            continue
        g = group(label)
        if g not in tote_known:
            continue
        for f in sorted(os.listdir(os.path.join(tdir, label))):
            if not f.endswith(".jpg") or int(f.split("_")[0]) not in val_ids:
                continue
            key = f"test/{label}/{f}"
            if key in feat_of:
                test.append((label, g, os.path.join(tdir, label, f), key))
    shared = sorted({g for _, g, _, _ in test})
    print(f"Fair test pictures: {len(test)} across {len(shared)} kinds both namers know")

    ours_rows, tote_rows, mixups = [], [], defaultdict(lambda: defaultdict(int))
    per_kind = defaultdict(lambda: [0, 0, 0])
    for i, (label, g, path, key) in enumerate(test):
        x = feat_of[key]
        x = x / max(np.linalg.norm(x), 1e-12)
        p = softmax(x @ W[:-1] + W[-1])
        order = np.argsort(-p)[:3]
        ours_top = [group(kinds[k]) for k in order]
        ours_rows.append((ours_top, float(p[order[0]]), g))

        im = Image.open(path).convert("RGB").resize((side, side), Image.BICUBIC)  # scaleFill, as on the phone
        e = np.asarray(model.predict({"image": im})["embedding"], dtype=np.float32).reshape(-1)
        e = e / max(np.linalg.norm(e), 1e-12)
        q = softmax(50.0 * (T @ e))
        torder = np.argsort(-q)[:3]
        tote_top = [tnames[k] for k in torder]
        tote_rows.append((tote_top, float(q[torder[0]]), g))

        per_kind[g][0] += 1
        per_kind[g][1] += ours_top[0] == g
        per_kind[g][2] += tote_top[0] == g
        if ours_top[0] != g:
            mixups["curbsy"][f"{g} -> {ours_top[0]}"] += 1
        if tote_top[0] != g:
            mixups["totetrack"][f"{g} -> {tote_top[0]}"] += 1
        if (i + 1) % 250 == 0:
            print(f"  {i + 1}/{len(test)}", flush=True)

    result = {
        "pictures": len(test), "kinds": len(shared),
        "curbsy": score(ours_rows), "totetrack": score(tote_rows),
        "curbsyKinds": len(kinds), "totetrackNames": len(tnames),
        "perKind": {g: {"pictures": n, "curbsy": o / n, "totetrack": t / n} for g, (n, o, t) in sorted(per_kind.items())},
        "topMixups": {k: sorted(v.items(), key=lambda kv: -kv[1])[:25] for k, v in mixups.items()},
    }
    json.dump(result, open(os.path.join(a.out, "comparison.json"), "w"), indent=1)
    for who in ("curbsy", "totetrack"):
        r = result[who]
        sure = ", ".join(f">={s}: {v['share']:.0%} of pictures, {v['right'] or 0:.0%} right" for s, v in r["whenSure"].items())
        print(f"{who}: top-1 {r['top1']:.1%}, top-3 {r['top3']:.1%}; when sure {sure}")
    wins = sum(v["curbsy"] > v["totetrack"] for v in result["perKind"].values())
    losses = sum(v["curbsy"] < v["totetrack"] for v in result["perKind"].values())
    print(f"Per kind: Curbsy better on {wins}, ToteTrack better on {losses}, tied on {len(shared) - wins - losses}")


if __name__ == "__main__":
    main()
