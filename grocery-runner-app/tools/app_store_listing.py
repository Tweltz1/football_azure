"""Fills in Shop Stride's App Store listing through the App Store Connect API, using the repo's
App Store Connect secrets. Safe to re-run: it only sets what store/listing.json says.

Sets: categories, subtitle, privacy policy URL, age rating (all "none"), content rights, the 1.0
version's description, keywords, support URL, promotional text, review notes, the build,
and (when a screenshots folder is given) the 6.9" iPhone screenshots.

Never does: App Privacy answers (Apple has no API for them), pricing, review contact details, or
submitting for review. Those stay with the account holder. Never prints the key or token.

Usage: python app_store_listing.py [screenshots_dir] [build_number]
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

BUNDLE_ID = "com.tweltz1.groceryrunner"
API = "https://api.appstoreconnect.apple.com/v1"
HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, "..", "store", "listing.json")))
SHOTS = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
WANT_BUILD = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED", "INVALID_BINARY"}

_token = {"value": "", "at": 0}
todo = []  # things left for the account holder


def token():
    now = int(time.time())
    if now - _token["at"] > 600:
        _token["value"] = jwt.encode(
            {"iss": os.environ["APP_STORE_CONNECT_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
            os.environ["APP_STORE_CONNECT_KEY"],
            algorithm="ES256",
            headers={"kid": os.environ["APP_STORE_CONNECT_KEY_ID"], "typ": "JWT"},
        )
        _token["at"] = now
    return _token["value"]


def call(method, path, payload=None, query=None):
    url = (path if path.startswith("http") else API + path) + ("?" + urllib.parse.urlencode(query) if query else "")
    headers = {"Authorization": "Bearer " + token(), "Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            details = "; ".join((x.get("code", "") + ": " + x.get("detail", ""))[:300] for x in json.loads(body).get("errors", [])[:3])
        except Exception:
            details = body[:300]
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {details}") from None


def step(name, fn):
    try:
        fn()
        print(f"OK    {name}")
    except Exception as e:  # keep going so one problem doesn't hide the rest
        print(f"FAIL  {name}: {e}")
        todo.append(f"{name} (the API said: {e})")


apps = call("GET", "/apps", query={"filter[bundleId]": BUNDLE_ID})["data"]
if not apps:
    sys.exit(f"No App Store Connect app with bundle ID {BUNDLE_ID}")
app_id = apps[0]["id"]
print(f"App: {apps[0]['attributes']['name']} ({app_id})")

# App info (categories, subtitle, privacy policy, age rating): the one still being edited.
infos = call("GET", f"/apps/{app_id}/appInfos")["data"]
info = next((i for i in infos if (i["attributes"].get("state") or i["attributes"].get("appStoreState")) not in ("READY_FOR_DISTRIBUTION", "READY_FOR_SALE")), infos[0])


def categories():
    rel = {"primaryCategory": {"data": {"type": "appCategories", "id": L["primaryCategory"]}}}
    if L.get("secondaryCategory"):
        rel["secondaryCategory"] = {"data": {"type": "appCategories", "id": L["secondaryCategory"]}}
    call("PATCH", f"/appInfos/{info['id']}", {"data": {"type": "appInfos", "id": info["id"], "relationships": rel}})


def info_localization():
    locs = call("GET", f"/appInfos/{info['id']}/appInfoLocalizations")["data"]
    loc = next((x for x in locs if x["attributes"]["locale"] == L["locale"]), None)
    attrs = {"subtitle": L["subtitle"], "privacyPolicyUrl": L["privacyPolicyUrl"]}
    if loc:
        call("PATCH", f"/appInfoLocalizations/{loc['id']}", {"data": {"type": "appInfoLocalizations", "id": loc["id"], "attributes": attrs}})
    else:
        attrs.update(locale=L["locale"], name=L["name"])
        call("POST", "/appInfoLocalizations", {"data": {"type": "appInfoLocalizations", "attributes": attrs,
             "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info["id"]}}}}})


# Every content question answered "none" / "no": Shop Stride is a grocery list with no web
# browsing, chat, ads, user-to-user content, gambling or mature content.
FREQUENCY = {
    "alcoholTobaccoOrDrugUseOrReferences", "contests", "gamblingSimulated", "gunsOrOtherWeapons", "horrorOrFearThemes",
    "matureOrSuggestiveThemes", "medicalOrTreatmentInformation", "profanityOrCrudeHumor", "sexualContentGraphicAndNudity",
    "sexualContentOrNudity", "violenceCartoonOrFantasy", "violenceRealistic", "violenceRealisticProlongedGraphicOrSadistic",
}
YES_NO = {
    "gambling", "unrestrictedWebAccess", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance",
    "userGeneratedContent", "advertising", "healthOrWellnessTopics",
}


def age_rating():
    decl = call("GET", f"/appInfos/{info['id']}/ageRatingDeclaration")["data"]
    attrs = {}
    for k in decl["attributes"]:
        if k in FREQUENCY:
            attrs[k] = "NONE"
        elif k in YES_NO:
            attrs[k] = False
    # Apple adds questions over time. When it names one this script doesn't know, answer it
    # "no" (or "none" if it turns out to be a how-often question) and try again.
    import re
    for _ in range(25):
        try:
            call("PATCH", f"/ageRatingDeclarations/{decl['id']}", {"data": {"type": "ageRatingDeclarations", "id": decl["id"], "attributes": attrs}})
            break
        except RuntimeError as e:
            m = re.search(r"attribute '(\w+)'", str(e))
            if not m or attrs.get(m.group(1)) == "NONE":
                raise
            attrs[m.group(1)] = "NONE" if m.group(1) in attrs else False
    print("      answered: " + ", ".join(f"{k}={v}" for k, v in sorted(attrs.items())))
    after = call("GET", f"/appInfos/{info['id']}/ageRatingDeclaration")["data"]["attributes"]
    blank = [k for k, v in after.items() if v is None and k not in ("kidsAgeBand", "ageRatingOverride", "koreaAgeRatingOverride", "developerAgeRatingInfoUrl")]
    if blank:
        todo.append("Age rating questions the API left blank: " + ", ".join(blank))


def content_rights():
    call("PATCH", f"/apps/{app_id}", {"data": {"type": "apps", "id": app_id, "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}}})


step("Categories", categories)
step("Subtitle and privacy policy URL", info_localization)
step("Age rating (all none)", age_rating)
step("Content rights", content_rights)

# The version being prepared (1.0 until the first release).
versions = call("GET", f"/apps/{app_id}/appStoreVersions", query={"filter[platform]": "IOS", "limit": "20"})["data"]
version = next((v for v in versions if (v["attributes"].get("appVersionState") or v["attributes"].get("appStoreState")) in EDITABLE
                or v["attributes"].get("appStoreState") in EDITABLE), None)
if not version:
    sys.exit("No editable iOS version in App Store Connect (is one already in review?)")
vid = version["id"]
print(f"Version: {version['attributes']['versionString']} ({version['attributes'].get('appStoreState')})")

if L.get("copyright"):
    step("Copyright", lambda: call("PATCH", f"/appStoreVersions/{vid}", {"data": {"type": "appStoreVersions", "id": vid,
         "attributes": {"copyright": L["copyright"]}}}))
elif not version["attributes"].get("copyright"):
    todo.append("Copyright line on the version page (for example: 2026 Your Name)")

vlocs = call("GET", f"/appStoreVersions/{vid}/appStoreVersionLocalizations")["data"]
vloc = next((x for x in vlocs if x["attributes"]["locale"] == L["locale"]), None)


def version_text():
    global vloc
    attrs = {k: L[k] for k in ("description", "keywords", "supportUrl", "promotionalText")}
    if vloc:
        call("PATCH", f"/appStoreVersionLocalizations/{vloc['id']}", {"data": {"type": "appStoreVersionLocalizations", "id": vloc["id"], "attributes": attrs}})
    else:
        attrs["locale"] = L["locale"]
        vloc = call("POST", "/appStoreVersionLocalizations", {"data": {"type": "appStoreVersionLocalizations", "attributes": attrs,
                    "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})["data"]


def review_notes():
    attrs = {"notes": L["reviewNotes"], "demoAccountRequired": False}
    contact = {k: os.environ.get(e, "").strip() for k, e in (("contactFirstName", "APP_REVIEW_FIRST_NAME"), ("contactLastName", "APP_REVIEW_LAST_NAME"),
               ("contactPhone", "APP_REVIEW_PHONE"), ("contactEmail", "APP_REVIEW_EMAIL"))}
    if all(contact.values()):
        attrs.update(contact)
    try:
        detail = call("GET", f"/appStoreVersions/{vid}/appStoreReviewDetail").get("data")
    except RuntimeError:
        detail = None
    if detail:
        call("PATCH", f"/appStoreReviewDetails/{detail['id']}", {"data": {"type": "appStoreReviewDetails", "id": detail["id"], "attributes": attrs}})
        a = {**detail["attributes"], **attrs}
        if not (a.get("contactFirstName") and a.get("contactPhone") and a.get("contactEmail")):
            todo.append("App Review contact name, phone and email (version page > App Review Information)")
    else:
        call("POST", "/appStoreReviewDetails", {"data": {"type": "appStoreReviewDetails", "attributes": attrs,
             "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
        if "contactEmail" not in attrs:
            todo.append("App Review contact name, phone and email (version page > App Review Information)")


def build():
    q = {"filter[app]": app_id, "filter[processingState]": "VALID", "sort": "-uploadedDate", "limit": "1",
         "filter[preReleaseVersion.version]": version["attributes"]["versionString"]}
    if WANT_BUILD:
        q["filter[version]"] = WANT_BUILD
    found = call("GET", "/builds", query=q)["data"]
    if not found:
        raise RuntimeError(f"no processed build {WANT_BUILD or ''} for version {version['attributes']['versionString']} yet")
    b = found[0]
    call("PATCH", f"/appStoreVersions/{vid}/relationships/build", {"data": {"type": "builds", "id": b["id"]}})
    print(f"      build {b['attributes']['version']} uploaded {b['attributes']['uploadedDate']}")


step("Description, keywords, support URL, promotional text", version_text)
step("Review notes (no account in the app)", review_notes)
step("Build", build)


def screenshots():
    files = [os.path.join(SHOTS, f) for f in L["screenshots"] if os.path.exists(os.path.join(SHOTS, f))]
    if not files:
        raise RuntimeError(f"no screenshots found in {SHOTS}")
    sets = call("GET", f"/appStoreVersionLocalizations/{vloc['id']}/appScreenshotSets")["data"]
    sset = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == "APP_IPHONE_67"), None)
    if not sset:
        sset = call("POST", "/appScreenshotSets", {"data": {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": "APP_IPHONE_67"},
                    "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": vloc["id"]}}}}})["data"]
    for old in call("GET", f"/appScreenshotSets/{sset['id']}/appScreenshots")["data"]:
        call("DELETE", f"/appScreenshots/{old['id']}")
    ids = []
    for path in files:
        blob = open(path, "rb").read()
        shot = call("POST", "/appScreenshots", {"data": {"type": "appScreenshots",
                    "attributes": {"fileName": os.path.basename(path), "fileSize": len(blob)},
                    "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": sset["id"]}}}}})["data"]
        for op in shot["attributes"]["uploadOperations"]:
            part = blob[op["offset"]: op["offset"] + op["length"]]
            req = urllib.request.Request(op["url"], data=part, method=op["method"],
                                         headers={h["name"]: h["value"] for h in op.get("requestHeaders", [])})
            urllib.request.urlopen(req, timeout=120).read()
        call("PATCH", f"/appScreenshots/{shot['id']}", {"data": {"type": "appScreenshots", "id": shot["id"],
             "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(blob).hexdigest()}}})
        ids.append(shot["id"])
        print(f"      uploaded {os.path.basename(path)}")
    call("PATCH", f"/appScreenshotSets/{sset['id']}/relationships/appScreenshots",
         {"data": [{"type": "appScreenshots", "id": i} for i in ids]})


if SHOTS:
    step('6.9" iPhone screenshots', screenshots)


def one(kind, id_):
    return {"data": {"type": kind, "id": id_}}


def price_free():
    try:
        sched = call("GET", f"/apps/{app_id}/appPriceSchedule", query={"include": "manualPrices"})
        if sched.get("included"):
            print("      already set")
            return
    except RuntimeError:
        pass
    free, nxt = None, f"/apps/{app_id}/appPricePoints?filter%5Bterritory%5D=USA&limit=200"
    while nxt and not free:
        r = call("GET", nxt)
        free = next((x for x in r["data"] if float(x["attributes"]["customerPrice"]) == 0), None)
        nxt = r.get("links", {}).get("next")
    if not free:
        raise RuntimeError("no free price point found")
    call("POST", "/appPriceSchedules", {"data": {"type": "appPriceSchedules", "relationships": {
        "app": one("apps", app_id), "baseTerritory": one("territories", "USA"),
        "manualPrices": {"data": [{"type": "appPrices", "id": "${p1}"}]}}},
        "included": [{"type": "appPrices", "id": "${p1}", "attributes": {"startDate": None},
                      "relationships": {"appPricePoint": one("appPricePoints", free["id"])}}]})


def availability():
    try:
        call("GET", f"/apps/{app_id}/appAvailabilityV2")
        print("      already set")
        return
    except RuntimeError:
        pass
    lands, nxt = [], "/territories?limit=200"
    while nxt:
        r = call("GET", nxt)
        lands += [t["id"] for t in r["data"]]
        nxt = r.get("links", {}).get("next")
    ids = [(t, "${t%d}" % i) for i, t in enumerate(lands)]
    call("POST", "https://api.appstoreconnect.apple.com/v2/appAvailabilities", {"data": {"type": "appAvailabilities",
        "attributes": {"availableInNewTerritories": True},
        "relationships": {"app": one("apps", app_id), "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": i} for _, i in ids]}}},
        "included": [{"type": "territoryAvailabilities", "id": i, "attributes": {"available": True},
                      "relationships": {"territory": one("territories", t)}} for t, i in ids]})
    print(f"      {len(lands)} territories")


step("Price (free)", price_free)
step("Availability (every country)", availability)

todo += [
    "App Privacy answers (Apple has no API for these)",
    "Press Add for Review, then Submit to App Review",
]
print("\nLeft for the account holder:")
for t in todo:
    print(" - " + t)
