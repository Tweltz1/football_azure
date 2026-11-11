"""Make short AI video clips with Veo (Gemini API) for the app TikToks.

Reads clips.json: a list of clips, each {"id", "prompt", "seconds", "resolution"?, "model"?}.
Clips already in the output folder are skipped, so pushing the same list twice never pays twice.
A hard budget cap (max_dollars in clips.json) stops before anything that would go over it.
Uses GEMINI_API_KEY (the paid training key) and only the Python standard library.
"""
import base64, json, os, sys, time, urllib.request, urllib.error

API = "https://generativelanguage.googleapis.com/v1beta"
KEY = os.environ.get("GEMINI_API_KEY", "")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("CLIPS_OUT", os.path.join(HERE, "out"))

# Dollars per output second (Gemini API price list, Nov 2026). Unknown models count as the dearest.
PRICE = {
    ("omni", "720p"): 0.07, ("omni", "1080p"): 0.14,
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
    if "omni" in m:
        return "omni"
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
    print(f"No Veo model like {wanted} listed; trying it by name anyway")
    return wanted


def make_veo(model, clip, secs, res, path):
    params = {"aspectRatio": "9:16", "durationSeconds": secs, "resolution": res}
    if clip.get("negative"):
        params["negativePrompt"] = clip["negative"]
    op = call("POST", f"{API}/models/{model}:predictLongRunning",
              {"instances": [{"prompt": clip["prompt"]}], "parameters": params})
    name = op["name"]
    for _ in range(120):
        if op.get("done"):
            break
        time.sleep(10)
        op = call("GET", f"{API}/{name}")
    resp = op.get("response", {})
    samples = (resp.get("generateVideoResponse") or resp).get("generatedSamples") or []
    if not samples:
        print("No video:", json.dumps(op)[:2000])
        return False
    download(samples[0]["video"]["uri"], path)
    return True


def download(uri, path):
    sep = "&" if "?" in uri else "?"
    with urllib.request.urlopen(uri + sep + "key=" + KEY, timeout=300) as r, open(path, "wb") as f:
        f.write(r.read())


def skeleton(x):
    """The response with long strings cut, for the log."""
    if isinstance(x, dict):
        return {k: skeleton(v) for k, v in x.items()}
    if isinstance(x, list):
        return [skeleton(v) for v in x]
    if isinstance(x, str) and len(x) > 200:
        return x[:60] + f"...({len(x)} chars)"
    return x


def find_video(x):
    """Base64 data or a uri for the first video anywhere in the response."""
    if isinstance(x, dict):
        mime = str(x.get("mime_type") or x.get("mimeType") or "")
        if (mime.startswith("video") or x.get("type") == "video") and (x.get("data") or x.get("uri")):
            return x.get("data"), x.get("uri")
        for v in x.values():
            got = find_video(v)
            if got:
                return got
    if isinstance(x, list):
        for v in x:
            got = find_video(v)
            if got:
                return got
    return None


def make_omni(model, clip, secs, res, path):
    """Gemini Omni Flash, through the Interactions API (Veo previews were shut down)."""
    prompt = clip["prompt"]
    if clip.get("negative"):
        prompt += " Avoid: " + clip["negative"] + "."
    body = {"model": model, "input": prompt,
            "response_format": {"type": "video", "duration": f"{secs}s", "aspect_ratio": "9:16", "resolution": res}}
    it = call("POST", f"{API}/interactions", body)
    for _ in range(120):
        if it.get("status") not in ("in_progress", "queued", "pending", "running"):
            break
        time.sleep(10)
        it = call("GET", f"{API}/interactions/{it['id']}")
    print("Response:", json.dumps(skeleton(it))[:3000])
    got = find_video(it)
    if not got:
        print("No video found")
        return False
    data, uri = got
    if data:
        open(path, "wb").write(base64.b64decode(data))
    else:
        download(uri, path)
    return True


def main():
    if not KEY:
        sys.exit("No GEMINI_API_KEY")
    cfg = json.load(open(os.path.join(HERE, "clips.json")))
    os.makedirs(OUT, exist_ok=True)
    models, token = [], ""
    for _ in range(20):
        page = call("GET", f"{API}/models?pageSize=100" + (f"&pageToken={token}" if token else ""))
        models += [m["name"].split("/", 1)[1] for m in page.get("models", [])]
        token = page.get("nextPageToken")
        if not token:
            break
    veo = [m for m in models if "veo" in m or "omni" in m]
    print(len(models), "models on this key; Veo:", veo)
    if not veo:
        print("All models:", models)
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
        if model.startswith("veo"):
            ok = make_veo(model, clip, secs, res, path)
        else:
            ok = make_omni(model, clip, secs, res, path)
        spent += cost
        if ok:
            print("Saved", path, os.path.getsize(path), "bytes")
    print(f"Spent about ${spent:.2f} this run")


if __name__ == "__main__":
    main()
