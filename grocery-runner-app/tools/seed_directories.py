"""Loads public store directories (store/directories/*.csv) as a store's own aisle list. Safe to re-run.

Each store becomes a row in grocery_partner_stores (the same tables the store portal fills), so the app shows
its aisles "from the store" ahead of shopper votes. The store's position comes from stores.json, or is looked
up once from its address with OpenStreetMap Nominatim. The partner link key is random and never printed:
nobody can log in to the portal as these stores, an admin can still manage them there. Never prints the token."""
import csv
import hashlib
import json
import os
import re
import secrets
import urllib.parse
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ["SUPABASE_PROJECT_ID"]
HERE = os.path.join(os.path.dirname(__file__), "..", "store", "directories")
DEPARTMENTS = {"produce", "bakery", "deli", "meat", "pantry", "frozen", "dairy", "household", "health", "baby", "pet"}


def sql(query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        method="POST",
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "grocery-runner-setup"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read() or b"null")


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def geocode(address):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": address, "format": "json", "limit": 1})
    req = urllib.request.Request(url, headers={"User-Agent": "shop-stride-directory-seed"})
    hits = json.loads(urllib.request.urlopen(req, timeout=30).read())
    return (float(hits[0]["lat"]), float(hits[0]["lon"])) if hits else (None, None)


def rows_of(path):
    out = {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            category = (r.get("category") or "").strip()[:80]
            aisle = (r.get("aisle") or "").strip().upper()
            dept = (r.get("department") or "").strip().lower()
            if not category or category.lower() in out:
                continue
            if aisle and not re.fullmatch(r"[A-Z0-9][A-Z0-9 -]{0,11}", aisle):
                raise SystemExit(f"{path}: bad aisle {aisle!r} for {category!r}")
            if dept and dept not in DEPARTMENTS:
                raise SystemExit(f"{path}: bad department {dept!r} for {category!r}")
            if aisle or dept:
                out[category.lower()] = (category, aisle or None, dept or None)
    return list(out.values())


for store in json.load(open(os.path.join(HERE, "stores.json"))):
    rows = rows_of(os.path.join(HERE, store["file"]))
    lat, lon = store.get("lat"), store.get("lon")
    found = sql(f"select id, lat, lon from public.grocery_partner_stores where name = {q(store['name'])} and chain = {q(store['chain'])} limit 1")
    if found:
        pid = found[0]["id"]
        lat, lon = lat or found[0]["lat"], lon or found[0]["lon"]
    if lat is None or lon is None:
        try:
            lat, lon = geocode(store["address"])
        except Exception as e:  # noqa: BLE001
            print(f"::warning::Could not look up {store['name']}: {e}")
    if lat is None:
        print(f"::warning::No position for {store['name']}; skipped (add lat/lon to stores.json).")
        continue
    if not found:
        key_hash = hashlib.sha256(secrets.token_urlsafe(32).encode()).hexdigest()
        pid = sql(
            "insert into public.grocery_partner_stores (name, chain, lat, lon, key_hash) values "
            f"({q(store['name'])}, {q(store['chain'])}, {lat}, {lon}, {q(key_hash)}) returning id"
        )[0]["id"]
    values = ",".join(f"({q(pid)}, {q(c)}, {q(a)}, {q(d)})" for c, a, d in rows)
    sql(
        f"update public.grocery_partner_stores set lat = {lat}, lon = {lon}, active = true, layout_updated_at = now() where id = {q(pid)};"
        f"delete from public.grocery_partner_aisles where partner_id = {q(pid)};"
        f"insert into public.grocery_partner_aisles (partner_id, category, aisle, department) values {values};"
    )
    print(f"{store['name']}: {len(rows)} directory lines at {lat:.4f}, {lon:.4f}")
