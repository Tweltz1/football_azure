"""Speech-check narration clips against their script.

usage: python check.py KEY=FILE ... [--json OUT]
Per clip:
 - wer: word error rate vs lines.json (normalized words)
 - talk_shops_gaps: seconds between "Talk" and "Shops"
 - questions: for each question in the script, whether Whisper heard it as a question ("?")
   and the pitch movement (semitones) on its last word: F0 at the word's end vs the median F0 of the
   sentence before it. Positive = rising.
"""
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
import sys, json, re, difflib
import numpy as np, librosa
from faster_whisper import WhisperModel

LINES = json.load(open(ROOT + "/public/tour/lines.json"))
EXTRA = json.load(open(sys.argv[sys.argv.index("--script") + 1])) if "--script" in sys.argv else {}
pairs = [a.split("=", 1) for a in sys.argv[1:] if "=" in a and not a.startswith("--")]
m = WhisperModel("small.en", device="cpu", compute_type="int8")
norm = lambda w: re.sub(r"[^a-z0-9' ]", "", re.sub(r"talk-?shop", "talk shop", w.lower()))
NUM = {"5": "five", "30": "thirty", "90": "ninety", "180": "one eighty"}
res = {}
for key, f in pairs:
    script = EXTRA.get(key) or LINES[key]
    y, sr = librosa.load(f, sr=16000)
    f0, _, _ = librosa.pyin(y, fmin=60, fmax=320, sr=sr, frame_length=1024, hop_length=160)
    times = librosa.times_like(f0, sr=sr, hop_length=160)
    rms = librosa.feature.rms(y=y, frame_length=400, hop_length=160)[0]
    rms_db = 20 * np.log10(rms / rms.max() + 1e-9)
    segs, _ = m.transcribe(f, word_timestamps=True, beam_size=5,
                           initial_prompt="Talk Shops is an app for auto repair shops.")
    words = [w for s in segs for w in s.words]
    heard = []  # (norm word, whisper word obj)
    for w in words:
        for p in w.word.strip().split():
            for q in norm(p.replace("-", " ")).split():
                heard.append((q, w))
    sw = []  # script tokens: (norm, raw)
    for raw in script.split():
        for q in raw.split("-"):
            n = norm(q)
            if n: sw.append((n, raw))
    sm = difflib.SequenceMatcher(None, [a for a, _ in sw], [a for a, _ in heard], autojunk=False)
    errs = sum(max(i2 - i1, j2 - j1) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal")
    wer = round(errs / max(1, len(sw)), 3)
    # map script index -> heard word
    s2h = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): s2h[blk.a + k] = heard[blk.b + k][1]
    gaps = []
    for (a, w1), (b, w2) in zip(heard, heard[1:]):
        if a == "talk" and b.startswith("shop"):
            # longest near-silent stretch (RMS < -32 dB re clip peak) between the two words
            a0, b1 = int(w1.start * 100), int(w2.end * 100)
            seg = rms_db[a0:b1]
            run = best = 0
            for x in seg:
                run = run + 1 if x < -32 else 0; best = max(best, run)
            gaps.append(round(best / 100, 2))
    qs = []
    for i, (n, raw) in enumerate(sw):
        if raw.endswith("?") or raw.endswith("?,"):
            w = s2h.get(i)
            if not w: qs.append({"q": raw, "found": False}); continue
            # sentence start = previous script token ending a sentence
            j = i - 1
            while j >= 0 and not re.search(r"[.!?]$", sw[j][1]): j -= 1
            ws = s2h.get(j + 1, w)
            sel = (times >= ws.start) & (times < w.start) & ~np.isnan(f0)
            base = float(np.median(f0[sel])) if sel.sum() >= 3 else None
            sel2 = (times >= w.start - 0.15) & (times <= w.end + 0.08) & ~np.isnan(f0)
            v = f0[sel2]
            end = float(np.median(v[-6:])) if len(v) >= 3 else None
            st = round(12 * np.log2(end / base), 1) if base and end else None
            qs.append({"q": raw, "heard_q": w.word.strip().endswith("?"), "st": st})
    # odd pauses: silence between two words where the script has no punctuation
    def sil(t0, t1):
        seg = rms_db[int(t0 * 100):int(t1 * 100) + 1]; run = best = 0
        for x in seg:
            run = run + 1 if x < -32 else 0; best = max(best, run)
        return best / 100
    odd = []
    idx = sorted(s2h)
    for a, b in zip(idx, idx[1:]):
        if b != a + 1: continue
        w1, w2 = s2h[a], s2h[b]
        if w1 is w2: continue
        raw = sw[a][1]
        if re.search(r"[,.!?:;]$", raw): continue
        g = sil(w1.end - 0.15, w2.start + 0.15)
        if g >= 0.3: odd.append([raw, sw[b][1], round(g, 2), round(w1.end, 1)])
    dur = len(y) / sr
    res[key] = {"wer": wer, "odd": odd, "wps": round(len(sw) / dur, 2), "talk_shops_gaps": gaps, "questions": qs,
                "text": "".join(w.word for w in words).strip()}
    print(key, json.dumps({k: v for k, v in res[key].items() if k != "text"}), flush=True)
if "--json" in sys.argv:
    json.dump(res, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
