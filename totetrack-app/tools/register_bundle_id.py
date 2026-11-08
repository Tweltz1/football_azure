"""Registers the ToteTrack bundle ID with Apple using the repo's App Store Connect secrets,
so it shows up in App Store Connect > New App. Safe to re-run. Never prints the key or token."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

IDENTIFIER = "com.tweltz1.totetrack"
NAME = "ToteTrack"

now = int(time.time())
token = jwt.encode(
    {"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
    os.environ["APP_STORE_CONNECT_KEY"],
    algorithm="ES256",
    headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"], "typ": "JWT"},
)
BASE = "https://api.appstoreconnect.apple.com/v1/bundleIds"


def request(url, payload=None):
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload else "GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        try:
            details = "; ".join(
                (e.get("code", "") + ": " + e.get("detail", ""))[:320] for e in json.loads(body).get("errors", [])[:3]
            )
        except Exception:
            details = "Apple API rejected request"
        raise RuntimeError(f"Apple returned HTTP {error.code}: {details}") from None


found = request(BASE + "?" + urllib.parse.urlencode({"filter[identifier]": IDENTIFIER})).get("data")
if found:
    bundle_id = found[0]["id"]
    print(IDENTIFIER + ": already registered")
else:
    bundle_id = request(BASE, {"data": {"type": "bundleIds", "attributes": {"name": NAME, "platform": "IOS", "identifier": IDENTIFIER}}})["data"]["id"]
    print(IDENTIFIER + ": registered")

# Sign in with Apple must be switched on for the App ID before a build that uses it can be signed.
caps = request(f"{BASE}/{bundle_id}/bundleIdCapabilities").get("data", [])
if any(c["attributes"].get("capabilityType") == "APPLE_ID_AUTH" for c in caps):
    print("Sign in with Apple: already on")
else:
    request(
        "https://api.appstoreconnect.apple.com/v1/bundleIdCapabilities",
        {
            "data": {
                "type": "bundleIdCapabilities",
                "attributes": {
                    "capabilityType": "APPLE_ID_AUTH",
                    "settings": [{"key": "APPLE_ID_AUTH_APP_CONSENT", "options": [{"key": "PRIMARY_APP_CONSENT"}]}],
                },
                "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}},
            }
        },
    )
    print("Sign in with Apple: turned on")
