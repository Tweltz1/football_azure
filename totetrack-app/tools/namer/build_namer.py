"""Builds ToteTrack's item namer: TinyCLIP (MIT license, github.com/wkcn/TinyCLIP) turned into a Core ML
image encoder, plus a text embedding for every name in items.txt.

In the app, each object found in a Snap photo is cropped, run through the image encoder, and named by the
item whose text embedding is closest (cosine similarity). Adding a name to items.txt only needs this script
to run again; the image encoder never changes.

Usage: python build_namer.py OUT_DIR
Writes OUT_DIR/ToteNamer.mlpackage, OUT_DIR/items.json ({"dim": D, "names": [...]}) and
OUT_DIR/items.bin (float16, len(names) x D, row-major, each row L2-normalized).
"""

import json
import os
import sys
import urllib.request

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


def load_items():
    """Returns [(name, [descriptions])], merging repeated names."""
    items = {}
    for line in open(os.path.join(HERE, "items.txt")):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, desc = line.partition("|")
        name, desc = name.strip(), (desc.strip() or name.strip()).lower()
        items.setdefault(name, []).append(desc)
    return list(items.items())


class ImageEncoder(torch.nn.Module):
    """224x224 RGB in 0..1 -> L2-normalized embedding."""

    def __init__(self, model):
        super().__init__()
        self.model = model
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, image):
        x = (image - self.mean) / self.std
        f = self.model.get_image_features(pixel_values=x)
        return f / f.norm(dim=-1, keepdim=True)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    model = CLIPModel.from_pretrained(MODEL).eval()
    processor = CLIPProcessor.from_pretrained(MODEL)
    size = model.config.vision_config.image_size
    print(f"{MODEL}: image size {size}, embedding {model.config.projection_dim}")

    # Text side: average the templates and descriptions for each name.
    items = load_items()
    rows = []
    with torch.no_grad():
        for name, descs in items:
            prompts = [t.format(d) for d in descs for t in TEMPLATES]
            tok = processor(text=prompts, return_tensors="pt", padding=True)
            e = model.get_text_features(**tok)
            e = e / e.norm(dim=-1, keepdim=True)
            e = e.mean(0)
            rows.append((e / e.norm()).numpy())
    emb = np.stack(rows).astype(np.float32)
    emb.astype(np.float16).tofile(os.path.join(out, "items.bin"))
    json.dump({"dim": int(emb.shape[1]), "names": [n for n, _ in items], "model": MODEL},
              open(os.path.join(out, "items.json"), "w"))
    print(f"{len(items)} item names embedded")

    # Image side: Core ML, image input scaled to 0..1, weights stored as 8-bit.
    enc = ImageEncoder(model).eval()
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
    ml.save(os.path.join(out, "ToteNamer.mlpackage"))

    # Sanity check in PyTorch on a few COCO photos: print the top names for each.
    samples = {
        "kitchen": "http://images.cocodataset.org/val2017/000000397133.jpg",
        "teddy bears": "http://images.cocodataset.org/val2017/000000000632.jpg",
        "laptop desk": "http://images.cocodataset.org/val2017/000000001000.jpg",
        "sports": "http://images.cocodataset.org/val2017/000000000139.jpg",
    }
    names = [n for n, _ in items]
    for label, url in samples.items():
        try:
            img = Image.open(urllib.request.urlopen(url, timeout=30)).convert("RGB").resize((size, size))
        except Exception as e:
            print(f"  {label}: couldn't fetch ({e})")
            continue
        x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).permute(2, 0, 1)[None]
        with torch.no_grad():
            f = enc(x)[0].numpy()
        top = np.argsort(-(emb @ f))[:5]
        print(f"  {label}: " + ", ".join(f"{names[i]} {emb[i] @ f:.3f}" for i in top))


if __name__ == "__main__":
    main()
