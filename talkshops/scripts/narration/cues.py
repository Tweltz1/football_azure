"""Build caption cues [[start_seconds, display_word_index], ...] for clips.
usage: python cues.py KEY=MP3 ... ; updates caption-cues.json in place.
Display words = lines.json text split on whitespace (what tour.js shows)."""
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
import sys, json, re, difflib
from faster_whisper import WhisperModel

TOUR = ROOT + "/public/tour/"
L = json.load(open(TOUR + "lines.json"))
C = json.load(open(TOUR + "caption-cues.json"))
m = WhisperModel("small.en", device="cpu", compute_type="int8")
norm = lambda w: re.sub(r"[^a-z0-9' ]", "", re.sub(r"talk-?shop", "talk shop", w.lower().replace("-", " "))).split()

for arg in sys.argv[1:]:
    key, f = arg.split("=", 1)
    toks = L[key].split()
    segs, _ = m.transcribe(f, word_timestamps=True, beam_size=5,
                           initial_prompt="Talk Shops is an app for auto repair shops.")
    heard = [(n, w.start) for s in segs for w in s.words for n in norm(w.word)]
    flat = [(n, i) for i, t in enumerate(toks) for n in norm(t)]
    sm = difflib.SequenceMatcher(None, [a for a, _ in flat], [a for a, _ in heard], autojunk=False)
    start = {}
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            ti = flat[b.a + k][1]
            start.setdefault(ti, heard[b.b + k][1])
    # phrases: break after punctuation, or every 8 words
    cues, n = [[0, 0]], 0
    for i, t in enumerate(toks[:-1]):
        n += 1
        if re.search(r"[,.!?:;]$", t) or (n >= 8 and not re.search(r"[,.!?:;]$", toks[i + 1])):
            j = i + 1
            # time for token j: its own start, else the next known start
            tt = next((start[x] for x in range(j, len(toks)) if x in start), None)
            if tt is not None and tt > cues[-1][0] + 0.4:
                cues.append([round(tt, 2), j]); n = 0
    C[key] = cues
    print(key, len(cues), "cues, matched", len(start), "/", len(toks), flush=True)

json.dump(C, open(TOUR + "caption-cues.json", "w"), separators=(",", ":"))
