#!/usr/bin/env python3
"""Item namer, step 2: a softmax classifier on top of Apple's feature prints (features.swift).

The phone runs the same Vision feature print on each part of the photo, then one matrix multiply with these
weights: no Core ML model to ship or compile, and new kinds from the learning loop just add rows.
Writes <out>/namer.f32 (float32: (dims + 1) x kinds, last row is the bias), labels.json order = columns,
and metrics.json (top-1 and top-3 accuracy on test pictures it never saw).

Usage: python3 fit.py --feats feats --crops crops --out out
"""
import argparse
import json
import os

import numpy as np


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--feats', default='feats')
    p.add_argument('--crops', default='crops')
    p.add_argument('--out', default='out')
    p.add_argument('--epochs', type=int, default=400)
    p.add_argument('--decay', type=float, default=1e-4)
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = np.random.default_rng(5)

    index = json.load(open(os.path.join(a.feats, 'index.json')))
    X = np.fromfile(os.path.join(a.feats, 'features.f32'), dtype=np.float32).reshape(len(index), -1)
    X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-8
    dims = X.shape[1]
    labels_info = {l['label']: l for l in json.load(open(os.path.join(a.crops, 'labels.json')))}
    kinds = sorted({lab for split, lab in index if split == 'train' and lab in labels_info})
    col = {k: n for n, k in enumerate(kinds)}
    keep = np.array([lab in col for _, lab in index])
    y = np.array([col.get(lab, -1) for _, lab in index])
    is_test = np.array([s == 'test' for s, _ in index]) & keep
    train_all = np.where(np.array([s == 'train' for s, _ in index]) & keep)[0]
    rng.shuffle(train_all)
    n_val = len(train_all) // 10
    val, tr = train_all[:n_val], train_all[n_val:]
    print(f'{len(kinds)} kinds, {len(tr)} training, {len(val)} validation, {is_test.sum()} test pictures, {dims} features')

    # Inputs scaled so plain gradient steps behave; the scale is folded into the weights at the end.
    mean = X[tr].mean(0)
    scale = X[tr].std(0) + 1e-6
    Z = (X - mean) / scale
    W = np.zeros((dims, len(kinds)), dtype=np.float32)
    b = np.zeros(len(kinds), dtype=np.float32)
    Y = np.zeros((len(tr), len(kinds)), dtype=np.float32)
    Y[np.arange(len(tr)), y[tr]] = 1
    # Adam on full batches (30k x 768 fits easily).
    mW, vW, mb, vb = (np.zeros_like(W), np.zeros_like(W), np.zeros_like(b), np.zeros_like(b))
    lr, b1, b2 = 0.01, 0.9, 0.999

    def acc(idx, top=1):
        s = Z[idx] @ W + b
        best = np.argsort(-s, axis=1)[:, :top]
        return float((best == y[idx][:, None]).any(1).mean()) if len(idx) else 0.0

    best_val, best = -1, (W.copy(), b.copy())
    Zt = Z[tr]
    for t in range(1, a.epochs + 1):
        s = Zt @ W + b
        s -= s.max(1, keepdims=True)
        P = np.exp(s)
        P /= P.sum(1, keepdims=True)
        G = (P - Y) / len(tr)
        gW = Zt.T @ G + a.decay * W
        gb = G.sum(0)
        mW = b1 * mW + (1 - b1) * gW; vW = b2 * vW + (1 - b2) * gW * gW
        mb = b1 * mb + (1 - b1) * gb; vb = b2 * vb + (1 - b2) * gb * gb
        W -= lr * (mW / (1 - b1 ** t)) / (np.sqrt(vW / (1 - b2 ** t)) + 1e-8)
        b -= lr * (mb / (1 - b1 ** t)) / (np.sqrt(vb / (1 - b2 ** t)) + 1e-8)
        if t % 25 == 0:
            v = acc(val)
            print(f'  epoch {t}: training {acc(tr[:5000]) * 100:.1f}%, validation {v * 100:.1f}%', flush=True)
            if v > best_val:
                best_val, best = v, (W.copy(), b.copy())
    W, b = best
    test_idx = np.where(is_test)[0]
    metrics = {
        'kinds': len(kinds),
        'trainingPictures': int(len(tr)),
        'testPictures': int(len(test_idx)),
        'validationAccuracy': round(best_val * 100, 1),
        'testAccuracy': round(acc(test_idx) * 100, 1),
        'testTop3Accuracy': round(acc(test_idx, 3) * 100, 1),
        'features': 'VNGenerateImageFeaturePrintRequest revision 2, L2-normalized',
    }
    print(json.dumps(metrics))
    # Fold the input scaling into the weights: score = x_norm @ W' + b'.
    W2 = (W / scale[:, None]).astype(np.float32)
    b2_ = (b - (mean / scale) @ W).astype(np.float32)
    np.concatenate([W2, b2_[None, :]], 0).astype('<f4').tofile(os.path.join(a.out, 'namer.f32'))
    json.dump([{**labels_info[k], 'label': k} for k in kinds], open(os.path.join(a.out, 'labels.json'), 'w'), indent=1)
    json.dump(metrics, open(os.path.join(a.out, 'metrics.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
