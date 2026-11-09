import csv, json, random, collections, re
random.seed(7)
csv.field_size_limit(10**8)
menus = {r['id']: r for r in csv.DictReader(open('nypl/Menu.csv', encoding='utf-8'))}
pages = {r['id']: r['menu_id'] for r in csv.DictReader(open('nypl/MenuPage.csv', encoding='utf-8'))}
dishes = {r['id']: r['name'] for r in csv.DictReader(open('nypl/Dish.csv', encoding='utf-8'))}
by = collections.defaultdict(list)
for r in csv.DictReader(open('nypl/MenuItem.csv', encoding='utf-8')):
    try: p = float(r['price'])
    except: continue
    if p <= 0: continue
    m = menus.get(pages.get(r['menu_page_id'], ''), {})
    if m.get('currency') != 'Dollars': continue
    name = re.sub(r'\s+', ' ', dishes.get(r['dish_id'], '')).strip()
    if not name or len(name) > 70 or not re.search('[a-zA-Z]{3}', name) or re.search(r'\d', name): continue
    hp = r['high_price']
    by[r['menu_page_id']].append({'name': name, 'price': round(p, 2), 'high': round(float(hp), 2) if hp else None, 'y': float(r['ypos'] or 0)})
good = [k for k, v in by.items() if 8 <= len(v) <= 30 and len({i['name'].lower() for i in v}) == len(v)]
pick = random.sample(good, 150)
out = []
for k in pick:
    items = sorted(by[k], key=lambda i: i['y'])
    m = menus[pages[k]]
    out.append({'id': 'nypl-' + k, 'title': (m.get('sponsor') or 'Menu').title()[:40], 'items': [{'name': i['name'], 'price': i['price'], 'high': i['high']} for i in items]})
json.dump(out, open('nypl-sample.json', 'w'), indent=0)
print(len(good), len(out), out[0]['items'][:3])
