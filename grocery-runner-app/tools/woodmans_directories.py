"""Rebuilds store/directories/woodmans-*.csv from the store directories Woodman's publishes.

Every Woodman's store page on woodmans-food.com links a printable PDF: page 1 is the store map (drawn by
hand into src/lib/routing/woodmans.ts), page 2 is an A-Z "Store Directory" of categories and aisles. This
reads page 2 of each PDF listed in stores.json ("pdf") and writes one CSV per store. Needs poppler's
pdftotext. Usage: python3 tools/woodmans_directories.py [folder of already-downloaded PDFs]
"""
import csv, html, json, os, re, subprocess, sys, tempfile, urllib.request

HERE = os.path.join(os.path.dirname(__file__), "..", "store", "directories")
DEPTS = {"DAIRY": "dairy", "MEAT": "meat", "PRODUCE": "produce", "BAKERY": "bakery", "DELI": "deli", "FROZEN": "frozen"}
# Everyday names shoppers type, looked up under the directory's own wording (first match wins).
ALIASES = {
    "Toilet Paper": ["Toilet Tissue", "Bathroom Tissue"],
    "Tissues": ["Facial Tissue"],
    "Kleenex": ["Facial Tissue"],
    "Diapers": ["Disposable Diapers", "Diapers"],
    "Baby Wipes": ["Baby Wipes", "Baby Needs"],
    "Dog Food": ["Dog Food-Dry", "Dog Food", "Dog Food-Canned/Dry", "Dog Food-Canned", "Pet Food"],
    "Kitty Litter": ["Cat Litter"],
    "Ziploc Bags": ["Food Bags"],
    "Sandwich Bags": ["Food Bags"],
    "Laundry": ["Laundry Detergent", "Laundry Supplies"],
    "Ibuprofen": ["Pain Relievers", "Aspirin"],
    "Tylenol": ["Pain Relievers", "Aspirin"],
    "Advil": ["Pain Relievers", "Aspirin"],
    "Body Wash": ["Bath Soap", "Bath Products"],
    "Conditioner": ["Shampoo"],
    "Spaghetti": ["Spaghetti-Dry", "Pasta", "Noodles"],
    "Beans": ["Beans, Canned & Dry", "Baked Beans"],
    "Juice": ["Juices", "Juice"],
    "Soda": ["Soda-Canned", "Soda", "Soda-Bottled"],
    "Pop": ["Soda-Canned", "Soda", "Soda-Bottled"],
    "Bottled Water": ["Water-Bottled", "Water"],
    "Candy Bars": ["Candy"],
}
DAIRY_WORDS = ["Milk", "Eggs", "Butter", "Yogurt", "Cheese"]


def words(pdf):
    out = subprocess.run(["pdftotext", "-bbox", "-f", "2", "-l", "2", pdf, "-"], capture_output=True, text=True, check=True).stdout
    width = float(re.search(r'<page width="([\d.]+)"', out).group(1))
    found = []
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out):
        x0, y0, x1, y1 = map(float, m.groups()[:4])
        t = html.unescape(m.group(5))
        # The right-hand panel (store name, hours, phone) starts at ~85% of the page width.
        if x0 < 0.845 * width and t not in ("STORE", "DIRECTORY"):
            found.append((x0, (y0 + y1) / 2, t))
    return found


def entries(pdf):
    """(category, aisle text) pairs. A category has lower-case letters; an aisle text has none."""
    lines = []
    for w in sorted(words(pdf), key=lambda w: w[1]):
        if lines and abs(lines[-1][0] - w[1]) < 3.5:
            lines[-1][1].append(w)
        else:
            lines.append([w[1], [w]])
    out = []
    for _, line in lines:
        name, val = [], []
        for _x, _y, t in sorted(line):
            # A lone lower-case letter is a typo'd aisle ("Cookies  k").
            is_val = (not re.search(r"[a-z’']", t) and t not in ("&", "-")) or bool(re.fullmatch(r"[a-z]", t))
            if is_val and name:
                val.append(t)
            else:
                if name and val:
                    out.append((" ".join(name), " ".join(val)))
                    name, val = [], []
                name.append(t)
        if name and val:
            out.append((" ".join(name), " ".join(val)))
    return out


def location(text, aisles):
    """First usable place in "25, MEAT", "FRONT OF R,T,V", "PRODUCE/13": (aisle, department) or None."""
    for tok in re.split(r"[,/\s]+", text.upper()):
        if re.fullmatch(r"\d{1,2}", tok) and (1 <= int(tok) <= 29 or 30 <= int(tok) <= 40):
            return tok, None
        if re.fullmatch(r"[A-Z]", tok):
            return tok, None
        if tok == "SODA":
            return "SODA", None
        if tok in DEPTS:
            return None, DEPTS[tok]
        if tok in ("OF", "FRONT", "HABA"):
            continue  # "FRONT OF Z", "HABA L"
        if tok in ("FE", "END", "CORNER", "BY", "LIQUOR", "PET", "SUPPLIES", "SOUTH", "BACK", "WALL", "–"):
            return None  # no spot on the map
    return None


def rows_for(pdf, aisles):
    rows, seen = [], {}
    off_floor = lambda a: a.isdigit() and int(a) > aisles  # a wall or soda aisle
    for cat, val in entries(pdf):
        cat = re.sub(r"\s*-\s*", "-", re.sub(r"\s+", " ", cat)).strip()
        loc = None if re.fullmatch(r"[a-z]", val) else location(val, aisles)  # "k" is a misprint, not aisle K
        if not loc:
            continue
        row = (cat, loc[0] or "", (loc[1] or "").capitalize())
        if cat.lower() in seen:
            # Listed twice ("Cat Litter 25" and "Cat Litter V"): keep the one on the sales floor.
            i = seen[cat.lower()]
            if off_floor(rows[i][1]) and row[1] and not off_floor(row[1]):
                rows[i] = row
            continue
        seen[cat.lower()] = len(rows)
        rows.append(row)
    by = {c.lower(): (a, d) for c, a, d in rows}
    for alias, sources in ALIASES.items():
        if alias.lower() in seen:
            continue
        hit = next((by[s.lower()] for s in sources if s.lower() in by), None)
        if hit:
            seen[alias.lower()] = len(rows)
            rows.append((alias, hit[0], hit[1]))
    for w in DAIRY_WORDS:
        if w.lower() not in seen:
            rows.append((w, "", "Dairy"))
    return rows


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
    for store in json.load(open(os.path.join(HERE, "stores.json"))):
        if store.get("chain") != "woodmans" or not store.get("pdf"):
            continue
        pdf = os.path.join(folder, store["file"].replace(".csv", ".pdf"))
        if not os.path.exists(pdf):
            req = urllib.request.Request(store["pdf"], headers={"User-Agent": "shop-stride-directory"})
            open(pdf, "wb").write(urllib.request.urlopen(req, timeout=60).read())
        rows = rows_for(pdf, store.get("aisles", 24))
        with open(os.path.join(HERE, store["file"]), "w", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["category", "aisle", "department"])
            w.writerows(rows)
        print(f"{store['name']}: {len(rows)} lines")


if __name__ == "__main__":
    main()
