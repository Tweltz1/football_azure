"""Chatterbox narration with per-chunk checking (Ryan lively voice).

usage: python generate.py OUTDIR key [key ...]
Each chunk (~220 chars, a question always ends its chunk) is generated, transcribed by Whisper,
and retried with a new seed (up to TRIES) when:
  - any word is wrong, missing or extra (numbers and "Talk Shops" spelling ignored), or
  - the chunk ends with a yes/no question whose pitch doesn't rise at the end (< +2 semitones), or
  - there is a pause of 0.3s+ inside a sentence where the script has no punctuation.
The best take (fewest problems, then biggest question rise) is kept.
"""
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
import sys, re, json, os, difflib
import perth
perth.PerthImplicitWatermarker = perth.DummyWatermarker
import numpy as np, torch, torchaudio, librosa
from chatterbox.tts import ChatterboxTTS
from faster_whisper import WhisperModel

REF = ROOT + "/voice-reference-ryan.mp3"
LINES = json.load(open(ROOT + "/public/tour/lines.json"))
TRIES = 5
torch.set_num_threads(4)
SPOKEN = [("Tap Done to", "Tap done to"), ("tap Start Check under After Repair", "tap start check under after repair"), ("Check also notify, if", "Check also notify if"), ("for 189 dollars", "for a hundred eighty-nine dollars"), ("for 624.", "for six twenty-four.")]
WH = re.compile(r"^(how|what|when|where|why|who|which)\b", re.I)

def tts_text(t):
    for a, b in SPOKEN: t = t.replace(a, b)
    return re.sub(r"\bTalk Shops\b", "Talkshops", t)

def chunks(text):
    sents = [s.strip() for s in re.findall(r"[^.!?]+[.!?]+[\"')]*\s*|[^.!?]+$", text) if s.strip()]
    out, cur = [], ""
    for s in sents:
        if cur and len(cur) + 1 + len(s) > 220:
            out.append(cur); cur = s
        else:
            cur = (cur + " " + s).strip()
        if cur.endswith("?"):
            out.append(cur); cur = ""
    if cur: out.append(cur)
    return out

def norm(t):
    t = re.sub(r"talk-?shops?", "talkshops", t.lower()).replace("-", " ")
    return [w for w in (re.sub(r"[^a-z0-9']", "", x) for x in t.split()) if w and not re.search(r"\d", w)]

NUMW = set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand dollars".split())

def has_punct(text, word):
    w = re.sub(r"[^A-Za-z0-9']", "", word)
    return bool(w) and bool(re.search(r"\b" + re.escape(w) + r"[,.!?:;]", text, re.I))

def problems(wav16, text, wm):
    segs, _ = wm.transcribe(wav16, word_timestamps=True, beam_size=5, language="en",
                            initial_prompt="Talkshops is an app for auto repair shops.")
    words = [w for s in segs for w in s.words]
    heard = norm(" ".join(w.word for w in words))
    want = norm(text)
    heard = [w for w in heard if w not in NUMW]; want = [w for w in want if w not in NUMW]
    sm = difflib.SequenceMatcher(None, want, heard, autojunk=False)
    errs = sum(max(i2 - i1, j2 - j1) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal")
    # odd pauses: gap between consecutive whisper words, where the earlier word has no punctuation
    rms = librosa.feature.rms(y=wav16, frame_length=400, hop_length=160)[0]
    db = 20 * np.log10(rms / (rms.max() + 1e-9) + 1e-9)
    odd = 0
    for a, b in zip(words, words[1:]):
        if has_punct(text, a.word): continue
        seg = db[int((a.end - 0.15) * 100):int((b.start + 0.15) * 100) + 1]
        run = best = 0
        for x in seg:
            run = run + 1 if x < -32 else 0; best = max(best, run)
        if best >= 25: odd += 1
    return errs, odd, " ".join(w.word.strip() for w in words)

def rise(wav16):
    f0, _, _ = librosa.pyin(wav16, fmin=60, fmax=320, sr=16000, frame_length=1024, hop_length=160)
    v = np.where(~np.isnan(f0))[0]
    if len(v) < 20: return None
    end = np.median(f0[v[-6:]])
    last_t = v[-1]
    base_idx = v[(v < last_t - 35) & (v > last_t - 250)]
    if len(base_idx) < 10: return None
    return float(12 * np.log2(end / np.median(f0[base_idx])))

def main():
    outdir = sys.argv[1]; os.makedirs(outdir, exist_ok=True)
    model = ChatterboxTTS.from_pretrained(device="cpu")
    model.prepare_conditionals(REF, exaggeration=0.75)
    wm = WhisperModel("small.en", device="cpu", compute_type="int8")
    report = {}
    for key in sys.argv[2:]:
        parts, rep = [], []
        for ci, c in enumerate(chunks(tts_text(LINES[key]))):
            last = re.split(r"(?<=[.!?])\s+", c)[-1]
            yesno = c.endswith("?") and not WH.search(last) and not re.search(r",\s*(how|what|is)\b", last, re.I)
            best = None
            for t in range(TRIES):
                torch.manual_seed(1000 * ci + 17 * t + 3)
                w = model.generate(c, exaggeration=0.75, cfg_weight=0.35)
                w16 = librosa.resample(w[0].numpy(), orig_sr=model.sr, target_sr=16000)
                errs, odd, heard = problems(w16, c, wm)
                r = rise(w16) if c.endswith("?") else None
                bad = errs + odd + (1 if yesno and (r is None or r < 2) else 0)
                score = (bad, -(r or -99) if c.endswith("?") else 0)
                if best is None or score < best[0]:
                    best = (score, w, dict(take=t, errs=errs, odd=odd, rise=r and round(r, 1), heard=heard))
                if bad == 0: break
            parts += [best[1], torch.zeros(1, int(model.sr * 0.3))]
            rep.append(dict(chunk=c, **best[2]))
            print(key, ci, json.dumps(best[2]), flush=True)
        torchaudio.save(f"{outdir}/{key}.wav", torch.cat(parts[:-1], dim=1), model.sr)
        report[key] = rep
        json.dump(report, open(f"{outdir}/report.json", "w"), indent=1)
        print("wrote", key, flush=True)

if __name__ == "__main__":
    main()
