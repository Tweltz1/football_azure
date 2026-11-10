"""Builds ToteTrack's item namer: TinyCLIP (MIT license, github.com/wkcn/TinyCLIP) as a Core ML image encoder,
plus a text embedding for every item name.

In the app, each object found in a Snap photo is cropped, run through the image encoder, and named by the
item whose text embedding is closest (cosine similarity).

With --train DATA_DIR (a dataset from ../detector/prepare_lvis.py and prepare_openimages.py), it also learns
from real photos: it crops every labeled box, and trains a small adapter on the image embeddings so that each
crop lands next to its label's name. The adapter is built into the Core ML model, the labels join the
vocabulary, and names that weren't trained still work as before. Test accuracy, before and after, goes to
the log.

Usage: python build_namer.py OUT_DIR [--train DATA_DIR]
Writes OUT_DIR/ToteNamer.mlpackage, OUT_DIR/items.json ({"dim": D, "names": [...]}) and
OUT_DIR/items.bin (float16, len(names) x D, row-major, each row L2-normalized).
"""

import argparse
import json
import os
import random
from collections import defaultdict

import coremltools as ct
import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.environ.get("NAMER_MODEL", "wkcn/TinyCLIP-ViT-39M-16-Text-19M-YFCC15M")
MEAN = [0.48145466, 0.4578275, 0.40821073]
STD = [0.26862954, 0.26130258, 0.27577711]
TEMPLATES = [
    "a photo of {}.",
    "a photo of {} in a storage tote.",
    "a close-up photo of {}.",
    "{} on a table.",
]
CROPS_PER_LABEL = 400
LOGIT_SCALE = 50.0


def load_items():
    """Returns {name: [descriptions]} from items.txt, merging repeated names."""
    items = {}
    for line in open(os.path.join(HERE, "items.txt")):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, desc = line.partition("|")
        name, desc = name.strip(), (desc.strip() or name.strip()).lower()
        items.setdefault(name, []).append(desc)
    return items


class ImageEncoder(torch.nn.Module):
    """224x224 RGB in 0..1 -> L2-normalized embedding, through the optional adapter."""

    def __init__(self, model, adapter=None):
        super().__init__()
        self.model = model
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))
        d = model.config.projection_dim
        self.register_buffer("adapter", torch.eye(d) if adapter is None else adapter)

    def raw(self, image):
        x = (image - self.mean) / self.std
        f = self.model.visual_projection(self.model.vision_model(pixel_values=x).pooler_output)
        return f / f.norm(dim=-1, keepdim=True)

    def forward(self, image):
        f = self.raw(image) @ self.adapter.T
        return f / f.norm(dim=-1, keepdim=True)


def embed_text(model, processor, descs):
    with torch.no_grad():
        prompts = [t.format(d) for d in descs for t in TEMPLATES]
        tok = processor(text=prompts, return_tensors="pt", padding=True)
        e = model.text_projection(model.text_model(**tok).pooler_output)
        e = e / e.norm(dim=-1, keepdim=True)
        e = e.mean(0)
        return (e / e.norm()).numpy()


def load_crops(data_dir, size):
    """Yields (split, label, 224x224 tensor) for every labeled box, at most CROPS_PER_LABEL per label."""
    random.seed(5)
    per_label = defaultdict(int)
    for split in ("train", "test"):
        rows = json.load(open(os.path.join(data_dir, split, "annotations.json")))
        random.shuffle(rows)
        cap = CROPS_PER_LABEL if split == "train" else CROPS_PER_LABEL // 4
        for r in rows:
            anns = [a for a in r["annotations"] if per_label[(split, a["label"])] < cap]
            if not anns:
                continue
            im = Image.open(os.path.join(data_dir, split, r["image"])).convert("RGB")
            for a in anns:
                c = a["coordinates"]
                pad = 0.1 * max(c["width"], c["height"])
                box = (max(0, c["x"] - c["width"] / 2 - pad), max(0, c["y"] - c["height"] / 2 - pad),
                       min(im.width, c["x"] + c["width"] / 2 + pad), min(im.height, c["y"] + c["height"] / 2 + pad))
                if box[2] - box[0] < 16 or box[3] - box[1] < 16:
                    continue
                crop = im.crop(box).resize((size, size), Image.BICUBIC)
                yield split, a["label"], torch.from_numpy(np.asarray(crop, dtype=np.float32) / 255.0).permute(2, 0, 1)
                per_label[(split, a["label"])] += 1


def accuracy(feats, labels, text):
    sims = feats @ text.T
    top = sims.topk(min(5, text.shape[0]), dim=1).indices
    return (top[:, 0] == labels).float().mean().item(), (top == labels[:, None]).any(1).float().mean().item()


def embed_crops(enc, crops):
    """Embeds crops in batches as they're read, so only the embeddings stay in memory."""
    feats, labels, splits, batch = [], [], [], []

    def flush():
        with torch.no_grad():
            feats.append(enc.raw(torch.stack([c[2] for c in batch])))
        labels.extend(c[1] for c in batch)
        splits.extend(c[0] for c in batch)
        batch.clear()
        if len(labels) % 6400 == 0:
            print(f"  {len(labels)} crops embedded", flush=True)

    for c in crops:
        batch.append(c)
        if len(batch) == 64:
            flush()
    if batch:
        flush()
    return torch.cat(feats), labels, splits


def train_adapter(feats, labels, splits, label_names, label_text):
    index = {n: i for i, n in enumerate(label_names)}
    labels = torch.tensor([index[l] for l in labels])
    is_train = torch.tensor([s == "train" for s in splits])
    text = torch.from_numpy(label_text)
    xtr, ytr, xte, yte = feats[is_train], labels[is_train], feats[~is_train], labels[~is_train]
    print(f"{len(xtr)} training crops, {len(xte)} test crops, {len(label_names)} labels")

    before = accuracy(xte, yte, text)
    d = feats.shape[1]
    W = torch.nn.Parameter(torch.eye(d))
    opt = torch.optim.AdamW([W], lr=1e-3, weight_decay=0)
    for epoch in range(40):
        perm = torch.randperm(len(xtr))
        for i in range(0, len(xtr), 256):
            idx = perm[i:i + 256]
            f = xtr[idx] @ W.T
            f = f / f.norm(dim=-1, keepdim=True)
            loss = torch.nn.functional.cross_entropy(LOGIT_SCALE * f @ text.T, ytr[idx])
            # Stay close to the original model so untrained names keep working.
            loss = loss + 0.05 * ((W - torch.eye(d)) ** 2).sum()
            opt.zero_grad()
            loss.backward()
            opt.step()
    W = W.detach()
    adapted = xte @ W.T
    adapted = adapted / adapted.norm(dim=-1, keepdim=True)
    after = accuracy(adapted, yte, text)
    print(f"Test accuracy over {len(label_names)} trained item types (top-1 / top-5):")
    print(f"  before training: {before[0]:.1%} / {before[1]:.1%}")
    print(f"  after training:  {after[0]:.1%} / {after[1]:.1%}")
    pred = (adapted @ text.T).argmax(1)
    per = sorted(((pred[yte == i] == i).float().mean().item(), (yte == i).sum().item(), n)
                 for i, n in enumerate(label_names) if (yte == i).any())
    print("Per item type (accuracy, test crops):")
    for acc, n, name in per:
        print(f"  {name}: {acc:.0%} ({n})")
    return W


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--train")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    model = CLIPModel.from_pretrained(MODEL).eval()
    processor = CLIPProcessor.from_pretrained(MODEL)
    size = model.config.vision_config.image_size
    print(f"{MODEL}: image size {size}, embedding {model.config.projection_dim}")

    items = load_items()
    adapter = None
    if args.train:
        print("Embedding crops of every labeled box…", flush=True)
        feats, labels, splits = embed_crops(ImageEncoder(model).eval(), load_crops(args.train, size))
        label_names = sorted(set(labels))
        label_text = np.stack([embed_text(model, processor, items.get(n, [n.lower()])) for n in label_names])
        adapter = train_adapter(feats, labels, splits, label_names, label_text)
        lower = {n.lower() for n in items}
        for n in label_names:
            if n.lower() not in lower:
                items[n] = [n.lower()]

    names = list(items)
    emb = np.stack([embed_text(model, processor, items[n]) for n in names]).astype(np.float32)
    emb.astype(np.float16).tofile(os.path.join(args.out, "items.bin"))
    json.dump({"dim": int(emb.shape[1]), "names": names, "model": MODEL, "trained": bool(args.train)},
              open(os.path.join(args.out, "items.json"), "w"))
    print(f"{len(names)} item names embedded")

    # Core ML: image input scaled to 0..1, adapter built in, weights stored as 8-bit.
    enc = ImageEncoder(model, adapter).eval()
    example = torch.rand(1, 3, size, size)
    traced = torch.jit.trace(enc, example)
    ml = ct.convert(
        traced,
        inputs=[ct.ImageType(name="image", shape=example.shape, scale=1 / 255.0, color_layout=ct.colorlayout.RGB)],
        outputs=[ct.TensorType(name="embedding")],
        convert_to="mlprogram",
        minimum_deployment_target=ct.target.iOS16,
        compute_precision=ct.precision.FLOAT16,
    )
    ml = ct.optimize.coreml.linear_quantize_weights(ml, ct.optimize.coreml.OptimizationConfig(
        global_config=ct.optimize.coreml.OpLinearQuantizerConfig(mode="linear_symmetric", weight_threshold=2048)))
    ml.short_description = "ToteTrack item namer (TinyCLIP image encoder, MIT license)"
    ml.save(os.path.join(args.out, "ToteNamer.mlpackage"))
    print("Saved ToteNamer.mlpackage")


if __name__ == "__main__":
    main()
