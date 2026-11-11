"""App Store reviews and TestFlight feedback for every app on the account, for the 5 AM Central review.

Prints a readable list, then one line starting APPSTORE_REVIEW_JSON that Claude reads from the job log.
Reads only; replying to reviews happens separately, after Tyler approves each reply.
Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (the .p8 text), DAYS (look-back for new items, default 1.05).
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

import jwt  # PyJWT with cryptography

API = "https://api.appstoreconnect.apple.com"
KEY_ID, ISSUER, P8 = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"], os.environ["ASC_KEY_P8"]
DAYS = float(os.environ.get("DAYS") or "1.05")
since = datetime.now(timezone.utc) - timedelta(days=DAYS)
unanswered_since = datetime.now(timezone.utc) - timedelta(days=14)


def token():
    now = int(time.time())
    return jwt.encode({"iss": ISSUER, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"}, P8,
                      algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def get(path, params=None):
    url = path if path.startswith("http") else API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token()})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def when(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


out = {"apps": [], "errors": []}
apps = get("/v1/apps", {"limit": 200, "fields[apps]": "name,bundleId"})["data"]
for app in apps:
    a = app["attributes"]
    entry = {"app": a["name"], "bundle_id": a["bundleId"], "app_id": app["id"], "new_reviews": [], "unanswered_reviews": 0,
             "testflight_feedback": []}
    try:
        res = get(f"/v1/apps/{app['id']}/customerReviews",
                  {"sort": "-createdDate", "limit": 100, "include": "response"})
        answered = {d["id"] for d in res["data"] if d.get("relationships", {}).get("response", {}).get("data")}
        for d in res["data"]:
            r, created = d["attributes"], when(d["attributes"]["createdDate"])
            has_reply = d["id"] in answered
            if created >= unanswered_since and not has_reply:
                entry["unanswered_reviews"] += 1
            if created >= since:
                entry["new_reviews"].append({"review_id": d["id"], "rating": r.get("rating"), "title": r.get("title"),
                                             "body": (r.get("body") or "")[:1500], "reviewer": r.get("reviewerNickname"),
                                             "territory": r.get("territory"), "created": r["createdDate"], "has_reply": has_reply})
    except urllib.error.HTTPError as e:
        out["errors"].append(f"{a['name']} reviews: HTTP {e.code}")
    for kind in ("betaFeedbackScreenshotSubmissions", "betaFeedbackCrashSubmissions"):
        try:
            res = get(f"/v1/apps/{app['id']}/{kind}", {"limit": 50, "sort": "-createdDate"})
            for d in res["data"]:
                f = d["attributes"]
                if when(f["createdDate"]) >= since:
                    entry["testflight_feedback"].append({"kind": "crash" if "Crash" in kind else "screenshot",
                                                         "comment": (f.get("comment") or "")[:1500], "email": f.get("email"),
                                                         "device": f.get("deviceModel"), "os": f.get("osVersion"),
                                                         "created": f["createdDate"]})
        except urllib.error.HTTPError as e:
            if e.code not in (403, 404):
                out["errors"].append(f"{a['name']} {kind}: HTTP {e.code}")
    out["apps"].append(entry)

for e in out["apps"]:
    print(f"== {e['app']} ({e['bundle_id']}): {len(e['new_reviews'])} new review(s), {e['unanswered_reviews']} unanswered in 14 days, "
          f"{len(e['testflight_feedback'])} TestFlight feedback")
    for r in e["new_reviews"]:
        print(f"  {r['rating']}* {r['title']!r} by {r['reviewer']} ({r['territory']}): {r['body'][:300]}")
    for f in e["testflight_feedback"]:
        print(f"  TestFlight {f['kind']} on {f['device']} iOS {f['os']}: {f['comment'][:300]}")
for err in out["errors"]:
    print("::warning::" + err)
print("APPSTORE_REVIEW_JSON " + json.dumps(out, separators=(",", ":")))
