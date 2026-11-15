#!/usr/bin/env python3
"""Read-only: split recent Cloudflare traffic per site into likely people vs bots.

Prints only aggregates (counts, countries, networks, user-agent families, paths, referrer hosts).
Visitor IPs are used in memory to count distinct visitors and are never printed (this repo's logs are public).
"""
import json, os, re, sys, urllib.request, datetime as dt
from collections import Counter, defaultdict

TOKEN = os.environ.get("CF_TOKEN", "")
SITES = ["weltzcraft.com", "hood-league.com", "talkshops.app"]
DAYS = int(os.environ.get("DAYS", "7"))

def cf(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def gql(q, v):
    return cf("https://api.cloudflare.com/client/v4/graphql", {"query": q, "variables": v})

BOT_UA = re.compile(r"bot|crawl|spider|slurp|curl|wget|python|go-http|java/|httpclient|axios|node-fetch|undici|"
                    r"headless|preview|facebookexternalhit|scan|zgrab|masscan|okhttp|libwww|ahrefs|semrush|"
                    r"mj12|dataprovider|censys|nmap|nikto|sqlmap|feedfetcher|lighthouse|pingdom|uptime|"
                    r"monitor|check|fetch|scrapy|httpx|aiohttp|playwright|puppeteer|phantom|chrome-lighthouse|"
                    r"gptbot|claude|anthropic|perplexity|bytespider|petal|yandex|baidu|bing|duckduck|applebot|"
                    r"google-|googleother|whatsapp|telegram|slack|discord|twitter|linkedin|embedly|iframely|"
                    r"expanse|palo alto|internet-measurement|l9explore|odin|netcraft|wpscan|zoominfo|"
                    r"^-?$|^mozilla/5\.0$|compatible;?\s*$", re.I)
DC_ASN = re.compile(r"amazon|aws|google|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|alibaba|tencent|"
                    r"oracle|contabo|choopa|vultr|m247|leaseweb|cloudflare|datacamp|scaleway|hostinger|ionos|"
                    r"1&1|hosting|host|server|cloud|data ?cent|colo|vps|cdn77|zenlayer|psychz|quadranet|"
                    r"hurricane|cogent|g-core|gcore|stark|pfcloud|bucklog|constant|frantech|buyvm|netcup|"
                    r"internet-measurement|censys|shodan|kaopu|ucloud|huawei|baidu|yandex|facebook|meta platforms|apple", re.I)
SCAN_PATH = re.compile(r"\.env|wp-|wordpress|\.php|\.git|xmlrpc|cgi-bin|phpmyadmin|/admin|\.aspx?|\.jsp|/vendor/|"
                       r"\.sql|\.bak|\.zip|\.tar|/\.well-known/(?!security)|/actuator|/boot|/owa|/autodiscover|"
                       r"/solr|/HNAP|/sdk|/geoserver|/console|\.yml|\.yaml|\.ini|\.config|/backup|/old|/test", re.I)

def ua_family(ua):
    u = ua.lower()
    if not u: return "(none)"
    m = re.search(r"([a-z0-9_.-]*(?:bot|crawler|spider)[a-z0-9_.-]*)", u)
    if m: return m.group(1)[:40]
    for k in ["curl", "wget", "python", "go-http", "okhttp", "java", "node", "axios", "headlesschrome", "lighthouse",
              "facebookexternalhit", "whatsapp", "zgrab", "scrapy"]:
        if k in u: return k
    os_ = "iPhone" if "iphone" in u else "iPad" if "ipad" in u else "Android" if "android" in u else \
          "Mac" if "macintosh" in u else "Windows" if "windows" in u else "Linux" if "linux" in u else "other"
    br = "Edge" if "edg/" in u else "Firefox" if "firefox" in u else "Chrome" if ("chrome" in u or "crios" in u) else \
         "Safari" if "safari" in u else "other"
    return f"{br} on {os_}"

CANDIDATES = ["clientIP", "userAgent", "clientCountryName", "clientRequestPath", "edgeResponseContentTypeName",
              "edgeResponseStatus", "requestSource", "clientAsn", "clientASNDescription", "clientRefererHost",
              "clientRequestReferer", "clientRequestHTTPHost", "clientDeviceType", "userAgentBrowser", "userAgentOS",
              "verifiedBotCategory", "botScore", "clientRequestHTTPMethodName"]
FIELDS = []

def probe(zone, start, end):
    ok = []
    for f in CANDIDATES:
        q = "query($z:String!,$s:Time!,$e:Time!){viewer{zones(filter:{zoneTag:$z}){httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$s, datetime_lt:$e}){count dimensions{%s}}}}}" % f
        r = gql(q, {"z": zone, "s": start.isoformat().replace("+00:00", "Z"), "e": end.isoformat().replace("+00:00", "Z")})
        if not r.get("errors"): ok.append(f)
        else: print(f"field {f}: {r['errors'][0].get('message','')[:90]}")
    return ok

def fetch_groups(zone, start, end):
    q = """query($z:String!,$s:Time!,$e:Time!){viewer{zones(filter:{zoneTag:$z}){
      httpRequestsAdaptiveGroups(limit:10000, filter:{datetime_geq:$s, datetime_lt:$e}){
        count dimensions{ %s }}}}}""" % " ".join(FIELDS)
    r = gql(q, {"z": zone, "s": start.isoformat().replace("+00:00", "Z"), "e": end.isoformat().replace("+00:00", "Z")})
    if r.get("errors"):
        return None, [e.get("message") for e in r["errors"]]
    rows = r["data"]["viewer"]["zones"][0]["httpRequestsAdaptiveGroups"]
    for g in rows:
        d = g["dimensions"]
        if "clientAsn" not in d and d.get("clientIP"):
            a = asn_of(d["clientIP"]); d["clientAsn"], d["clientASNDescription"] = a
        if not d.get("clientRefererHost") and d.get("clientRequestReferer"):
            d["clientRefererHost"] = re.sub(r"^https?://([^/]+).*", r"\1", d["clientRequestReferer"])
    return rows, None

# Offline IP -> network lookup (iptoasn.com, public domain), since the free plan hides the ASN field.
import bisect, gzip, ipaddress
_ASN = {"v4": ([], []), "v6": ([], [])}
def load_asn():
    for fam, url in (("v4", "https://iptoasn.com/data/ip2asn-v4.tsv.gz"), ("v6", "https://iptoasn.com/data/ip2asn-v6.tsv.gz")):
        try:
            data = gzip.decompress(urllib.request.urlopen(url, timeout=120).read()).decode()
            starts, rows = _ASN[fam]
            for line in data.splitlines():
                a, b, n, c, desc = line.split("\t")
                if n == "0": continue
                starts.append(int(ipaddress.ip_address(a))); rows.append((int(ipaddress.ip_address(b)), n, desc))
            print(f"asn db {fam}: {len(starts)} ranges")
        except Exception as ex:
            print(f"asn db {fam} failed: {ex}")
def asn_of(ip):
    try:
        x = ipaddress.ip_address(ip); starts, rows = _ASN["v4" if x.version == 4 else "v6"]
        i = bisect.bisect_right(starts, int(x)) - 1
        if i >= 0 and int(x) <= rows[i][0]: return rows[i][1], rows[i][2]
    except Exception: pass
    return 0, "unknown"

def get_rows(zone, start, end, depth=0):
    rows, err = fetch_groups(zone, start, end)
    if err: return [], err
    if len(rows) >= 10000 and depth < 4:
        mid = start + (end - start) / 2
        a, e1 = get_rows(zone, start, mid, depth + 1)
        b, e2 = get_rows(zone, mid, end, depth + 1)
        return a + b, e1 or e2
    return rows, None

def analyse(rows):
    per_ip = defaultdict(lambda: {"req": 0, "html": 0, "assets": 0, "uas": set(), "asn": "", "country": "",
                                  "paths": Counter(), "refs": Counter(), "scan": False, "bot_ua": False, "ok_ua": False})
    for g in rows:
        d, n = g["dimensions"], g["count"]
        if d.get("requestSource") not in (None, "eyeball") or not d.get("clientIP"):
            continue
        p = per_ip[d["clientIP"]]
        p["req"] += n
        ua = d.get("userAgent") or ""
        p["uas"].add(ua)
        if d.get("verifiedBotCategory") or BOT_UA.search(ua) or not ua.lower().startswith("mozilla/"): p["bot_ua"] = True
        else: p["ok_ua"] = True
        p["asn"] = f'AS{d["clientAsn"]} {d.get("clientASNDescription") or ""}'.strip()
        p["country"] = d.get("clientCountryName") or "?"
        path = d.get("clientRequestPath") or "/"
        ct = (d.get("edgeResponseContentTypeName") or "").lower()
        if ct == "html": p["html"] += n; p["paths"][path] += n
        elif ct in ("css", "js", "javascript", "png", "jpeg", "jpg", "webp", "svg", "gif", "woff", "woff2", "json", "ico", "avif"):
            p["assets"] += n
        if SCAN_PATH.search(path): p["scan"] = True
        if d.get("clientRefererHost"): p["refs"][d["clientRefererHost"]] += n

    out = {"visitors_all": len(per_ip), "requests_all": sum(p["req"] for p in per_ip.values())}
    buckets = {"likely_people": [], "maybe_people": [], "own_checks_or_cloud": [], "bots_by_user_agent": [],
               "scanners": [], "no_page": []}
    for ip, p in per_ip.items():
        dc = bool(DC_ASN.search(p["asn"]))
        if p["scan"]: b = "scanners"
        elif p["bot_ua"] and not p["ok_ua"]: b = "bots_by_user_agent"
        elif dc and re.search(r"cloudflare|akamai|fastly", p["asn"], re.I) and p["assets"] > 0 and \
                any("safari" in u.lower() and "chrome" not in u.lower() for u in p["uas"]):
            b = "likely_people"  # iCloud Private Relay exits through these networks
        elif dc: b = "own_checks_or_cloud"
        elif p["html"] == 0: b = "no_page"
        elif p["assets"] > 0 and not p["bot_ua"]: b = "likely_people"
        else: b = "maybe_people"
        buckets[b].append(p)
    out["counts"] = {k: len(v) for k, v in buckets.items()}

    def top(ps, key, n=8):
        c = Counter()
        for p in ps:
            if key == "country": c[p["country"]] += 1
            elif key == "asn": c[p["asn"][:60]] += 1
            elif key == "ua": c.update({ua_family(u) for u in p["uas"]})
            elif key == "path": c.update(set(list(p["paths"])[:20]))
            elif key == "ref": c.update(set(p["refs"]))
        return c.most_common(n)

    people = buckets["likely_people"] + buckets["maybe_people"]
    out["people"] = {"countries": top(people, "country"), "networks": top(people, "asn"),
                     "browsers": top(people, "ua"), "pages": top(people, "path", 10), "referrers": top(people, "ref"),
                     "pages_per_visitor_median": sorted(sum(p["paths"].values()) for p in people)[len(people)//2] if people else 0}
    bots = buckets["bots_by_user_agent"] + buckets["own_checks_or_cloud"] + buckets["scanners"] + buckets["no_page"]
    out["bots"] = {"user_agents": top(bots, "ua", 15), "networks": top(bots, "asn", 12), "countries": top(bots, "country"),
                   "scanner_paths": top(buckets["scanners"], "path", 8)}
    return out

def main():
    if not TOKEN:
        print("no token"); return
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
    for site in SITES:
        z = cf(f"https://api.cloudflare.com/client/v4/zones?name={site}")
        zone = (z.get("result") or [{}])[0].get("id")
        if not zone:
            print(f"TRAFFIC {site}: token can't see zone"); continue
        global FIELDS
        if not FIELDS:
            FIELDS = probe(zone, now - dt.timedelta(hours=1), now)
            print("FIELDS " + " ".join(FIELDS))
            load_asn()
        report = {"site": site, "days": []}
        all_rows = []
        for i in range(DAYS):
            end = now - dt.timedelta(days=i); start = end - dt.timedelta(days=1)
            rows, err = get_rows(zone, start, end)
            if err:
                report["days"].append({"from": start.isoformat(), "error": err[:2]}); continue
            day = analyse(rows); day["from"] = start.isoformat()[:16]
            report["days"].append({"from": day["from"], "visitors_all": day["visitors_all"], "requests_all": day["requests_all"],
                                   "counts": day["counts"]})
            all_rows += rows
        if all_rows:
            report["whole_period"] = analyse(all_rows)
        print("TRAFFIC_JSON " + json.dumps(report))
        # Cloudflare's own daily totals (what the daily review reports today), for comparison.
        q = """query($z:String!,$s:Date!,$e:Date!){viewer{zones(filter:{zoneTag:$z}){httpRequests1dGroups(limit:10, orderBy:[date_ASC], filter:{date_geq:$s, date_leq:$e}){
              dimensions{date} sum{requests pageViews browserMap{pageViews uaBrowserFamily} countryMap{clientCountryName requests} contentTypeMap{edgeResponseContentTypeName requests}} uniq{uniques}}}}}"""
        r = gql(q, {"z": zone, "s": (now - dt.timedelta(days=DAYS)).date().isoformat(), "e": now.date().isoformat()})
        print("DAILY_JSON " + json.dumps({"site": site, "data": r.get("data"), "errors": [e.get("message") for e in r.get("errors") or []]}))

        # Cloudflare Web Analytics (browser beacon), if enabled: counts only real browsers that run JS.
        try:
            acct = z["result"][0]["account"]["id"]
            q = """query($a:String!,$s:Time!,$e:Time!,$h:String!){viewer{accounts(filter:{accountTag:$a}){
              rumPageloadEventsAdaptiveGroups(limit:20, filter:{datetime_geq:$s, datetime_lt:$e, requestHost:$h}){
                count sum{visits} dimensions{date}}}}}"""
            r = gql(q, {"a": acct, "s": (now - dt.timedelta(days=DAYS)).isoformat().replace("+00:00", "Z"),
                        "e": now.isoformat().replace("+00:00", "Z"), "h": site})
            print("RUM_JSON " + json.dumps({"site": site, "data": r.get("data"), "errors": [e.get("message") for e in r.get("errors") or []]}))
        except Exception as ex:
            print(f"RUM_JSON {site} error {ex}")

if __name__ == "__main__":
    main()
