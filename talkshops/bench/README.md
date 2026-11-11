# Price-sheet reader bench

Scores the free price-list reader (`public/price-rules.js` + `public/price-import.js`, no AI) on sheets with known answers.

- **Auto shop sheets**: made up by `gen.mjs` (realistic services, labor rates and times, ranges, "starting at", percent fees) in six layouts, as PDF, photo-like JPEG (tilt, perspective, shadow, blur, JPEG noise) or CSV.
- **Restaurant menus**: dishes and prices from the NYPL "What's on the Menu?" data (public domain), picked by `nypl_pick.py`, rendered the same way.
- **CORD receipts** (CC BY 4.0, github.com/clovaai/cord): real phone photos of receipts; checks how often OCR recovers each item's name and price, with and without the photo cleanup. `cord_pick.py` extracts them from the CORD v2 test parquet.

```
python3 nypl_pick.py            # in a folder holding the NYPL CSVs (nypl/Menu.csv ...), writes nypl-sample.json
python3 cord_pick.py cord-test.parquet cord/
node gen.mjs <out> nypl-sample.json 200
NODE_PATH=<global node_modules with playwright> node run.mjs <out> <dir with node_modules: pdfjs-dist@3.11.174, tesseract.js@5.1.1, @tesseract.js-data/eng@1.0.0> [cord/]
```
`BENCH_FILTER=photo` runs only matching cases. The report goes to `<out>/report.txt`.
