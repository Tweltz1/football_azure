"""End-to-end check of store manager sign-in against the live store-portal function.

Makes a throwaway user and partner store, signs in with a real email code (made with the admin API, so no
inbox is needed), asks for the store, approves the request the way the admin page does (straight in the
tables, since the admin password is not in GitHub), edits layout/sales/out-of-stock/news, checks the app
endpoints see it, checks another user is refused, then deletes everything it made. Prints no secrets.

Run by the Shop Stride workflow when a commit message contains [stride-portal-e2e]."""
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
import uuid

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]
BASE = f"https://{REF}.supabase.co"
API = f"https://api.supabase.com/v1/projects/{REF}"


def req(method, url, body=None, headers=None, ok=(200, 201, 204)):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", "User-Agent": "stride-e2e", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=60) as res:
            text = res.read().decode()
            return res.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, {"raw": text[:200]}


_, keys = req("GET", f"{API}/api-keys?reveal=true", headers={"Authorization": f"Bearer {TOKEN}"})
SERVICE = next(k["api_key"] for k in keys if k.get("name") == "service_role")
ANON = next(k["api_key"] for k in keys if k.get("name") == "anon")
SVC = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}
FN = f"{BASE}/functions/v1/store-portal"
APPFN = f"{BASE}/functions/v1/grocery-runner"

made_users, made_store = [], None
failures = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def portal(body, token=None):
    return req("POST", FN, body, {"x-manager-token": token} if token else {})


def sign_in(email):
    # A real email code, made by the admin API instead of read from an inbox.
    s, link = req("POST", f"{BASE}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email}, SVC)
    if s not in (200, 201):
        s, link = req("POST", f"{BASE}/auth/v1/admin/users", {"email": email, "email_confirm": True}, SVC)
        s, link = req("POST", f"{BASE}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email}, SVC)
    code = link.get("email_otp") or link.get("properties", {}).get("email_otp")
    s, sess = portal({"action": "login-verify", "email": email, "code": code})
    check(f"sign in with an email code ({email.split('@')[1]})", s == 200 and sess.get("access_token"), f"{s} {sess}")
    s, u = req("GET", f"{BASE}/auth/v1/user", headers={"apikey": ANON, "Authorization": f"Bearer {sess['access_token']}"})
    made_users.append(u["id"])
    return sess["access_token"], u["id"]


try:
    tag = uuid.uuid4().hex[:8]
    s, r = portal({"action": "login-verify", "email": "nobody@example.com", "code": "000000"})
    check("wrong code is refused", s == 401, s)
    s, r = portal({"action": "me"})
    check("manager call without sign-in is refused", s == 401, s)

    token, uid = sign_in(f"stride-e2e-{tag}@walmart.com")
    s, me = portal({"action": "me"}, token)
    check("new manager has no stores", s == 200 and me["stores"] == [], f"{s} {me}")

    # Ask for a new store (far from any real store: middle of Lake Superior).
    s, r = portal({"action": "claim", "person": "E2E Tester", "title": "Store Manager", "phone": "(715) 555-0100",
                   "chain": "walmart", "store_name": f"E2E Test Store {tag}", "address": "1 Test Rd, Nowhere, WI",
                   "lat": 47.5, "lon": -87.5, "note": "automated test"}, token)
    check("claim saved", s == 200 and r["claim"]["status"] == "pending", f"{s} {r}")
    claim_id = r["claim"]["id"]
    _, rows = req("GET", f"{BASE}/rest/v1/grocery_store_claims?select=work_email,phone&id=eq.{claim_id}", headers=SVC)
    check("work email flagged, phone cleaned", rows[0]["work_email"] is True and rows[0]["phone"] == "715-555-0100", rows)
    s, r = portal({"action": "store", "store_id": str(uuid.uuid4())}, token)
    check("no editing before approval", s == 403, s)

    # Only one request per store at a time.
    token2, _ = sign_in(f"stride-e2e-{tag}-second@gmail.com")
    s, r = portal({"action": "claim", "person": "Second Person", "title": "Manager", "phone": "715-555-0101",
                   "chain": "walmart", "store_name": "Same store", "address": "1 Test Rd", "lat": 47.5001, "lon": -87.5001}, token2)
    check("a second request for a store being checked is refused", s == 409, f"{s} {r}")

    # Approve with the email's Approve button (a signed link), like Tyler would.
    exp = int(time.time()) + 3600
    sig = hmac.new(f"store-claims:{SERVICE}".encode(), f"{claim_id}.{exp}".encode(), hashlib.sha256).hexdigest()[:40]
    good = f"{claim_id}.{exp}.{sig}"
    s, r = portal({"action": "decide-view", "token": good[:-1] + ("0" if good[-1] != "0" else "1")})
    check("a tampered approve link is refused", s == 401, s)
    s, view = portal({"action": "decide-view", "token": good})
    check("approve link shows the request", s == 200 and view.get("person") == "E2E Tester" and "user_id" not in view, f"{s} {view}")
    s, r = portal({"action": "decide", "token": good, "choice": "approve"})
    check("approve link approves (and makes the new store)", s == 200 and r.get("status") == "approved", f"{s} {r}")
    made_store = r.get("partner_id")
    s, r = portal({"action": "decide", "token": good, "choice": "approve"})
    check("the same link can't decide twice", s == 400, s)

    # A claimed store takes no more requests.
    s, r = portal({"action": "claim", "person": "Second Person", "title": "Manager", "phone": "715-555-0101", "partner_id": made_store}, token2)
    check("a claimed store refuses new requests", s == 409, f"{s} {r}")
    s, found = portal({"action": "find-stores", "query": f"E2E Test Store {tag}"}, token2)
    check("search shows it as claimed", s == 200 and found and found[0].get("claimed") is True, f"{s} {found}")

    # Password sign-in.
    pw = "e2e-" + uuid.uuid4().hex
    s, r = portal({"action": "set-password", "password": pw}, token)
    check("manager sets a password", s == 200, f"{s} {r}")
    s, r = portal({"action": "login-password", "email": f"stride-e2e-{tag}@walmart.com", "password": pw})
    check("manager signs in with email + password", s == 200 and r.get("access_token"), f"{s}")
    s, r = portal({"action": "login-password", "email": f"stride-e2e-{tag}@walmart.com", "password": pw + "x"})
    check("wrong password is refused", s == 401, s)
    token = r.get("access_token") or token

    s, me = portal({"action": "me"}, token)
    check("approved store shows for the manager", s == 200 and [x["id"] for x in me["stores"]] == [made_store], f"{s} {me}")
    S = {"store_id": made_store}
    s, r = portal({"action": "layout-set", "category": "Frozen pizza", "aisle": "12", **S}, token)
    check("one layout line saved", s == 200, f"{s} {r}")
    s, r = portal({"action": "layout-set", "category": "Bananas", "department": "Produce", **S}, token)
    check("department line saved", s == 200, f"{s} {r}")
    s, r = portal({"action": "deal-add", "item": "Cheerios 12 oz", "price": "$2.99", **S}, token)
    check("one sale added", s == 200, f"{s} {r}")
    s, r = portal({"action": "out-set", "item": "Eggs", **S}, token)
    check("item marked out of stock", s == 200, f"{s} {r}")
    s, r = portal({"action": "notice", "text": "Open 7-3 on Thanksgiving\n\n", **S}, token)
    check("notice saved", s == 200 and r["notice"] == "Open 7-3 on Thanksgiving", f"{s} {r}")
    s, st = portal({"action": "store", **S}, token)
    check("store summary has everything", s == 200 and len(st["layout"]) == 2 and len(st["deals"]) == 1 and len(st["outs"]) == 1, f"{s} {st}")

    # What the app sees for an Apple Maps pin at that spot (the app function keeps the partner list a minute).
    time.sleep(65)
    app = {"apikey": ANON, "Authorization": f"Bearer {ANON}"}
    key = "walmart:g47500xm87500"
    s, d = req("POST", APPFN, {"action": "deals", "store": key, "items": ["cheerios", "eggs", "almond milk"]}, app)
    check("app: sale + out-of-stock on the list", s == 200 and "cheerios" in d["deals"] and list(d["outs"]) == ["eggs"], f"{s} {d}")
    s, info = req("POST", APPFN, {"action": "store-info", "store": key}, app)
    check("app: store news + all deals", s == 200 and info["notice"] == "Open 7-3 on Thanksgiving" and len(info["deals"]) == 1, f"{s} {info}")
    s, a = req("POST", APPFN, {"action": "aisles", "store": key, "items": ["DiGiorno frozen pizza"], "depts": 2}, app)
    check("app: official aisle", s == 200 and a.get("digiorno frozen pizza", {}).get("aisle") == "12", f"{s} {a}")

    deal_id = st["deals"][0]["id"]
    s, r = portal({"action": "deal-remove", "id": deal_id, **S}, token)
    check("sale removed", s == 200 and r["removed"] == 1, f"{s} {r}")
    _, log = req("GET", f"{BASE}/rest/v1/grocery_partner_changes?select=what,who&partner_id=eq.{made_store}", headers=SVC)
    check("every save logged", len(log) == 6 and all(x["who"].startswith("stride-e2e-") for x in log), log)

    # Someone else can't touch it.
    other, _ = sign_in(f"stride-e2e-{tag}-other@gmail.com")
    s, r = portal({"action": "deal-add", "item": "Vandal", **S}, other)
    check("another signed-in user is refused", s == 403, s)
    s, r = portal({"action": "store", **S})
    check("no sign-in, no key is refused", s == 401, s)
finally:
    if made_store:
        req("DELETE", f"{BASE}/rest/v1/grocery_partner_stores?id=eq.{made_store}", headers=SVC)
    for u in made_users:
        req("DELETE", f"{BASE}/rest/v1/grocery_store_claims?user_id=eq.{u}", headers=SVC)
        req("DELETE", f"{BASE}/auth/v1/admin/users/{u}", headers=SVC)
    print(f"cleaned up: store={'yes' if made_store else 'none'}, users={len(made_users)}")

if failures:
    raise SystemExit(f"{len(failures)} check(s) failed: {', '.join(failures)}")
print("All store portal checks passed.")
