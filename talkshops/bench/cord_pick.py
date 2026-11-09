# CORD v2 test split (CC BY 4.0, github.com/clovaai/cord) to receipt JPEGs + item labels for bench/run.mjs.
#   python3 cord_pick.py <cord-test.parquet> <outDir>
import json, sys, os, pyarrow.parquet as pq
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
rows = []
for i, r in enumerate(pq.read_table(src).to_pylist()):
    gt = json.loads(r['ground_truth'])['gt_parse']
    menu = gt.get('menu', [])
    menu = menu if isinstance(menu, list) else [menu]
    items = [{'name': m['nm'], 'price': m['price']} for m in menu if isinstance(m, dict) and isinstance(m.get('nm'), str) and isinstance(m.get('price'), str)]
    if not items: continue
    f = f'cord-{i}.jpg'
    open(os.path.join(out, f), 'wb').write(r['image']['bytes'])
    rows.append({'id': f'cord-{i}', 'file': f, 'items': items})
json.dump(rows, open(os.path.join(out, 'cord.json'), 'w'))
print(len(rows), 'receipts')
