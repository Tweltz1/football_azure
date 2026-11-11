"""Make short AI video clips with Veo (Gemini API) for the app TikToks.

Reads clips.json: a list of clips, each {"id", "prompt", "seconds", "resolution"?, "model"?}.
Clips already in the output folder are skipped, so pushing the same list twice never pays twice.
A hard budget cap (max_dollars in clips.json) stops before anything that would go over it.
Uses GEMINI_API_KEY (the paid training key) and only the Python standard library.
"""
import json, os, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"
KEY = os.environ.get("GEMINI_API_KEY", "")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("CLIPS_OUT", os.path.join(HERE, "out"))

# Dollars per output second (Gemini API price list, Nov 2026). Unknown models count as the dearest.
PRICE = {
    ("lite", "720p"): 0.05, ("lite", "1080p"): 0.08,
    ("fast", "720p"): 0.10, ("fast", "1080p"): 0.12,
    ("std", "720p"): 0.40, ("std", "1080p"): 0.40,
}


def call(method, url, body=None):
    sep = "&" if "?" in url else "?"
    req = urllib.request.Request(url + sep + "key=" + KEY, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} from {url.split('?')[0]}: {e.read().decode()[:2000]}")
        raise


def tier(model):
    m = model.lower()
    return "lite" if "lite" in m else "fast" if "fast" in m else "std"


def pick_model(wanted, names):
    if wanted in names:
        return wanted
    for n in names:
        if tier(n) == tier(wanted) and "3.1" in n:
            return n
    for n in names:
        if tier(n) == tier(wanted):
            return n
    sys.exit(f"No Veo model like {wanted}; have {names}")


def main():
    if not KEY:
        sys.exit("No GEMINI_API_KEY")
    cfg = json.load(open(os.path.join(HERE, "clips.json")))
    os.makedirs(OUT, exist_ok=True)
    models = call("GET", f"{API}/models?pageSize=1000").get("models", [])
    veo = [m["name"].split("/", 1)[1] for m in models if "veo" in m["name"]]
    print("Veo models on this key:", veo)
    spent = 0.0
    for clip in cfg["clips"]:
        path = os.path.join(OUT, clip["id"] + ".mp4")
        if os.path.exists(path):
            print("Already made", clip["id"])
            continue
        model = pick_model(clip.get("model", cfg.get("model", "veo-3.1-lite-generate-preview")), veo)
        res = clip.get("resolution", cfg.get("resolution", "720p"))
        secs = int(clip.get("seconds", 4))
        cost = PRICE.get((tier(model), res), 0.60) * secs
        if spent + cost > cfg["max_dollars"] + 1e-9:
            print(f"Stopping before {clip['id']}: ${spent + cost:.2f} would pass the ${cfg['max_dollars']} cap")
            break
        print(f"Making {clip['id']} with {model}, {secs}s {res} (~${cost:.2f})")
        params = {"aspectRatio": "9:16", "durationSeconds": secs, "resolution": res}
        if clip.get("negative"):
            params["negativePrompt"] = clip["negative"]
        op = call("POST", f"{API}/models/{model}:predictLongRunning",
                  {"instances": [{"prompt": clip["prompt"]}], "parameters": params})
        spent += cost
        name = op["name"]
        for _ in range(120):
            if op.get("done"):
                break
            time.sleep(10)
            op = call("GET", f"{API}/{name}")
        if "error" in op or not op.get("done"):
            print("Failed:", json.dumps(op)[:2000])
            continue
        resp = op.get("response", {})
        samples = (resp.get("generateVideoResponse") or resp).get("generatedSamples") or []
        if not samples:
            print("No video (maybe filtered):", json.dumps(resp)[:2000])
            continue
        uri = samples[0]["video"]["uri"]
        sep = "&" if "?" in uri else "?"
        with urllib.request.urlopen(uri + sep + "key=" + KEY, timeout=300) as r, open(path, "wb") as f:
            f.write(r.read())
        print("Saved", path, os.path.getsize(path), "bytes")
    print(f"Spent about ${spent:.2f} this run")


if __name__ == "__main__":
    main()
