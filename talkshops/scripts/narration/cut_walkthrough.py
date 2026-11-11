# Cuts the walkthrough video from a tour recording: python3 cut.py VIDEO events.json PUBLIC_DIR OUT.mp4 OUT.vtt
import json, subprocess, sys, re
video, evf, pub, out, vtt = sys.argv[1:6]
KEEP = ["board", "search", "booking", "checkin", "firsttext", "estimate", "send", "onscreen", "backshop", "along"]
ev = json.load(open(evf))
plays = [(e["t"], re.search(r"/tour/([^/.?]+)\.mp3", e["src"]).group(1)) for e in ev if e["kind"] == "play" and "/tour/" in e["src"]]
ends = {}
for e in ev:
    m = re.search(r"/tour/([^/.?]+)\.mp3", e["src"])
    if e["kind"] == "end" and m: ends[m.group(1)] = e["t"]
first = {}
for t, k in plays: first.setdefault(k, t)
order = sorted(first.items(), key=lambda x: x[1])
nxt = {k: (order[i + 1][1] if i + 1 < len(order) else None) for i, (k, _) in enumerate(order)}
lines = json.load(open(pub + "/tour/lines.json")); cues = json.load(open(pub + "/tour/caption-cues.json"))
def dur(k): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f"{pub}/tour/{k}.mp3"]))
segs, off = [], 0.0
for k in KEEP:
    s = first[k]; d = dur(k)
    e = s + d + 0.8
    if nxt[k] is not None: e = min(e, nxt[k] - 0.15)
    a = max(0, s - 0.3)
    segs.append((k, a, e, off, s - a, d)); off += e - a
f, inputs = [], ["-i", video]
for i, (k, a, e, o, lead, d) in enumerate(segs):
    f.append(f"[0:v]trim={a:.3f}:{e:.3f},setpts=PTS-STARTPTS[v{i}]")
for i, (k, a, e, o, lead, d) in enumerate(segs):
    inputs += ["-i", f"{pub}/tour/{k}.mp3"]
    ms = int((o + lead) * 1000)
    f.append(f"[{i+1}:a]aresample=24000,adelay={ms}|{ms}[a{i}]")
f.append("".join(f"[v{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=0[v]")
f.append("".join(f"[a{i}]" for i in range(len(segs))) + f"amix=inputs={len(segs)}:normalize=0,atrim=0:{off:.3f}[a]")
subprocess.check_call(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "24000", out])
def ts(x):
    h, r = divmod(x, 3600); m, s = divmod(r, 60); return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"
rows = ["WEBVTT", ""]
for k, a, e, o, lead, d in segs:
    toks = lines[k].split(); cs = cues.get(k, [[0, 0]])
    for i, (t, w) in enumerate(cs):
        t2 = cs[i + 1][0] if i + 1 < len(cs) else d
        w2 = cs[i + 1][1] if i + 1 < len(cs) else len(toks)
        st, en = o + lead + t, min(o + lead + t2, o + (e - a))
        rows += [f"{ts(st)} --> {ts(en)}", " ".join(toks[w:w2]), ""]
open(vtt, "w").write("\n".join(rows))
print("segments", [(k, round(e - a, 1)) for k, a, e, o, lead, d in segs], "total", round(off, 1))
