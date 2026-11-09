"use strict";
// Price list import: reads whatever a shop already uses for prices (CSV, Excel, PDF, a photo of the price board)
// into saved items. Simple sheets with clear columns are read here in the browser; anything else goes to
// POST shop/price-import, where Gemini reads it. Nothing is saved until the owner reviews the list and presses Save.
window.createPriceImport = ({ api }) => {
  const MAX_FILES = 5, MAX_FILE = 4400000, MAX_TEXT = 60000;
  const accept = ".csv,.xlsx,.pdf,.txt,image/*,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function csvRecords(text) {
    const records = []; let fields = [], field = "", quoted = false;
    const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const sep = (src.split("\n")[0].match(/\t/g) || []).length > (src.split("\n")[0].match(/,/g) || []).length ? "\t" : ",";
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '"') { if (quoted && src[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === sep || c === "\n")) {
        fields.push(field.trim()); field = "";
        if (c === "\n") { if (fields.some(Boolean)) records.push(fields); fields = []; }
      } else field += c;
    }
    fields.push(field.trim()); if (fields.some(Boolean)) records.push(fields);
    return records;
  }

  // Header words a shop's sheet might use for each column.
  const headers = {
    name: ["name", "description", "desc", "item", "item name", "item description", "line item", "service", "services", "service name", "service description", "product", "part", "part name", "part description", "fee name", "job", "job name", "operation", "labor operation"],
    type: ["type", "kind", "item type", "line type", "charge type"],
    rate: ["rate", "price", "cost", "amount", "unit price", "unit cost", "hourly rate", "retail", "retail price", "sell price", "sale price", "list price", "charge", "customer price", "our price"],
    hours: ["hours", "hrs", "hr", "labor hours", "labor hrs", "book hours", "book time", "labor time", "time"],
  };
  const kinds = { labor: "labor", labour: "labor", hourly: "labor", fee: "fee", fees: "fee", service: "fee", services: "fee", part: "part", parts: "part", percent: "percent", percentage: "percent", "%": "percent" };
  const norm = (s) => String(s || "").toLowerCase().replace(/\(.*?\)|[$#:*]/g, "").replace(/\s+/g, " ").trim();
  const col = (head, key) => head.findIndex((h) => headers[key].includes(h));

  // A sheet with a clear header row (name and price, maybe type) and clean numbers. Anything less certain returns null
  // and goes to the AI, which also copes with categories, price ranges, labor times and odd layouts.
  function readLocal(records) {
    for (let at = 0; at < Math.min(records.length, 15); at++) {
      const head = records[at].map(norm), ni = col(head, "name"), ri = col(head, "rate"), ti = col(head, "type"), hi = col(head, "hours");
      if (ni < 0 || ri < 0) continue;
      // Extra columns (category, notes): let the AI work out what they mean. Hours are read here only with a type column
      // (the layout of Download my list), so a time on a flat-priced job isn't mistaken for labor.
      if (head.some((h, i) => h && ![ni, ri, ti, hi].includes(i)) || (hi >= 0 && ti < 0)) return null;
      const items = [];
      for (const row of records.slice(at + 1)) {
        const name = String(row[ni] || "").replace(/\s+/g, " ").trim(), raw = String(row[ri] || "").replace(/[$,%\s]/g, "");
        if (!name && !raw) continue;
        const kind = ti < 0 || !String(row[ti] || "").trim() ? "part" : kinds[String(row[ti]).trim().toLowerCase()];
        if (!name || name.length > 120 || !kind || !/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) > (kind === "percent" ? 100 : 1000000)) return null;
        const hrs = hi < 0 ? "" : String(row[hi] || "").trim();
        if (hrs && (kind !== "labor" || !/^\d+(\.\d{1,2})?$/.test(hrs) || Number(hrs) > 1000)) return null;
        items.push({ name, kind, rate: Number(raw), ...(Number(hrs) > 0 ? { hours: Number(hrs) } : {}) });
      }
      return items.length ? items : null;
    }
    return null;
  }

  const base64 = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(Error("Could not read " + blob.name + "."));
    r.readAsDataURL(blob);
  });
  const ask = (body) => api("POST", "shop/price-import", body);

  // ---- Free reading on this device: PDF text (pdf.js), photo cleanup + OCR (Tesseract.js), then PriceRules ----
  const LIB = {
    pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    ocr: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
    ocrWorker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    ocrCore: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    ocrLang: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
  };
  const loaded = {};
  const script = (src) => loaded[src] ||= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src; el.async = true; el.onload = resolve;
    el.onerror = () => { delete loaded[src]; reject(Error("Could not load the free reader. Check your connection.")); };
    document.head.appendChild(el);
  });
  // Good enough to skip the AI: a few items found.
  const enough = (r) => r.items.length >= 3;
  const rulesOn = (lines, ocr = false) => window.PriceRules.parse(lines, { ocr });

  async function pdfDoc(file) {
    await script(LIB.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
    return window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  }
  async function pdfLines(doc) {
    const lines = [];
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
      const page = await doc.getPage(n), content = await page.getTextContent();
      lines.push(...window.PriceRules.toLines(content.items.map((t) => ({ str: t.str, x: t.transform[4], y: t.transform[5], h: Math.abs(t.transform[3]) || t.height }))));
    }
    return lines;
  }
  // A scanned PDF has no text: draw its pages so OCR can read them.
  async function pdfPages(doc) {
    const out = [];
    for (let n = 1; n <= Math.min(doc.numPages, 5); n++) {
      const page = await doc.getPage(n), view = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, 2200 / Math.max(view.width, view.height)) });
      const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      out.push(c);
    }
    return out;
  }

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error("Could not open " + file.name + ". Take a screenshot of it, or save it as a JPEG or PDF.")); i.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  /**
   * Photo cleanup before OCR, the classic image-analysis steps: grayscale, contrast stretch, straighten (the angle whose
   * rows of text line up best), and an adaptive threshold that evens out glare and shadow.
   */
  function cleanForOcr(src) {
    const scale = Math.min(1, 2400 / Math.max(src.width || src.naturalWidth, src.height || src.naturalHeight));
    const W = Math.round((src.naturalWidth || src.width) * scale), H = Math.round((src.naturalHeight || src.height) * scale);
    const gray = (canvas) => { const d = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data, out = new Float32Array(canvas.width * canvas.height); for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return out; };
    const draw = (w, h, angle) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.translate(w / 2, h / 2); g.rotate(angle); g.drawImage(src, -w / 2, -h / 2, w, h); return c; };

    // Straighten: on a small copy, try angles from -8 to 8 degrees and keep the one with the sharpest row profile.
    const sw = Math.min(500, W), sh = Math.round(H * sw / W);
    let best = 0, bestScore = -1;
    for (let deg = -8; deg <= 8; deg += 1) {
      const px = gray(draw(sw, sh, deg * Math.PI / 180));
      let mean = 0; const rows = new Float32Array(sh);
      for (let y = 0; y < sh; y++) { let dark = 0; for (let x = 0; x < sw; x++) if (px[y * sw + x] < 128) dark++; rows[y] = dark; mean += dark; }
      mean /= sh; let score = 0; for (const r of rows) score += (r - mean) ** 2;
      if (score > bestScore) { bestScore = score; best = deg; }
    }
    const c = draw(W, H, best * Math.PI / 180), px = gray(c);
    // Contrast stretch between the 2nd and 98th percentile.
    const hist = new Uint32Array(256); for (const v of px) hist[v | 0]++;
    let lo = 0, hi = 255, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > px.length * 0.02) { lo = v; break; } }
    acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > px.length * 0.02) { hi = v; break; } }
    const span = Math.max(1, hi - lo); for (let i = 0; i < px.length; i++) px[i] = Math.min(255, Math.max(0, (px[i] - lo) * 255 / span));
    // Adaptive threshold: compare each pixel with the mean of its neighborhood (integral image), so uneven light doesn't matter.
    const r = Math.max(8, Math.round(Math.min(W, H) / 40)), sum = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += px[y * W + x]; sum[(y + 1) * (W + 1) + x + 1] = sum[y * (W + 1) + x + 1] + row; } }
    const img = c.getContext("2d").createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      const mean = (sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1] - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = px[y * W + x] < mean - 12 ? 0 : 255, i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }
  async function ocrLines(canvases, onStatus) {
    await script(LIB.ocr);
    onStatus("Reading the text on this device (the first time downloads the free reader)…");
    const worker = await window.Tesseract.createWorker("eng", 1, { workerPath: LIB.ocrWorker, corePath: LIB.ocrCore, langPath: LIB.ocrLang });
    try {
      const lines = [];
      for (const c of canvases) {
        const { data } = await worker.recognize(c);
        lines.push(...(data.lines?.length ? data.lines.map((l) => l.text) : String(data.text || "").split("\n")));
      }
      return lines;
    } finally { worker.terminate(); }
  }
  const jpeg = (canvas) => canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  function photoCanvas(img) {
    const scale = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /**
   * `ai`: "fallback" (default) reads for free first and asks Gemini only when that finds too little;
   * "always" goes straight to Gemini; "never" stays on this device.
   */
  async function readOne(file, ai, onStatus) {
    const name = file.name || "file", lower = name.toLowerCase();
    // Free result, or Gemini when the free one is thin. If Gemini can't help, keep whatever was found for free.
    const finish = async (free, body) => {
      if (free && ai !== "always" && (enough(free) || ai === "never" || !body)) return { ...free, method: "free" };
      if (ai === "never" || !body) return { ...(free || { items: [] }), method: "free" };
      onStatus(`Reading ${name} with AI…`);
      try { return { ...(await ask(await body())), method: "ai" }; }
      catch (err) { if (free?.items.length) return { ...free, method: "free", aiError: err.message }; throw err; }
    };
    if (/\.(xls|numbers|docx?|pages|odt|ods)$/.test(lower)) throw Error(`${name}: save it as PDF, .xlsx or CSV first, then upload that.`);
    if (/\.xlsx$/.test(lower) || /spreadsheetml/.test(file.type) || /\.(csv|tsv|txt)$/.test(lower) || /^text\//.test(file.type)) {
      const records = /\.xlsx$/.test(lower) || /spreadsheetml/.test(file.type) ? await window.readXlsxRows(file) : csvRecords(await file.text());
      if (!records.length) throw Error(`${name} looks empty.`);
      const local = readLocal(records);
      if (local) return { items: local, method: "free" };
      const text = records.map((r) => r.join("\t")).join("\n");
      if (text.length > MAX_TEXT && ai === "always") throw Error(`${name} is too long to read at once. Split it into smaller sheets.`);
      return finish(rulesOn(records.map((r) => r.filter(Boolean).join("   "))), text.length > MAX_TEXT ? null : async () => ({ text }));
    }
    if (/\.pdf$/.test(lower) || file.type === "application/pdf") {
      const big = file.size > MAX_FILE, toAi = big ? null : async () => ({ mime: "application/pdf", data: await base64(file) });
      if (ai === "always") { if (big) throw Error(`${name} is too big. Upload a PDF under 4 MB, or one page at a time.`); return finish(null, toAi); }
      let free = null;
      try {
        const doc = await pdfDoc(file);
        const lines = await pdfLines(doc);
        free = rulesOn(lines);
        // Scanned PDF (no text): clean up the page images and read them with OCR, unless Gemini will do it anyway.
        if (!lines.length && (ai === "never" || big)) free = rulesOn(await ocrLines((await pdfPages(doc)).map(cleanForOcr), onStatus), true);
      } catch (err) { if (ai === "never" || big) throw err; }
      if (big && !free?.items.length) throw Error(`${name} is too big. Upload a PDF under 4 MB, or one page at a time.`);
      return finish(free, toAi);
    }
    if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/.test(lower)) {
      const img = await loadImage(file), canvas = photoCanvas(img), toAi = async () => ({ mime: "image/jpeg", data: jpeg(canvas) });
      if (ai === "always") return finish(null, toAi);
      let free = null;
      try { onStatus(`Cleaning up ${name}…`); free = rulesOn(await ocrLines([cleanForOcr(img)], onStatus), true); }
      catch (err) { if (ai === "never") throw err; }
      return finish(free, toAi);
    }
    throw Error(`${name}: upload a PDF, a photo, an Excel .xlsx or a CSV file.`);
  }

  let lastFiles = [];
  /** Reads up to 5 files into one list (later files win on the same name and type). */
  async function readFiles(list, onStatus = () => {}, opts = {}) {
    const files = Array.from(list || []).slice(0, MAX_FILES);
    if (!files.length) throw Error("Choose a file first.");
    lastFiles = files;
    const merged = new Map(), names = [], methods = new Set();
    let laborRate = null, aiError = "";
    for (const [i, f] of files.entries()) {
      onStatus(files.length > 1 ? `Reading ${f.name} (${i + 1} of ${files.length})…` : `Reading ${f.name}…`);
      const r = await readOne(f, opts.ai || "fallback", onStatus);
      methods.add(r.method);
      if (r.aiError) aiError = r.aiError;
      if (r.laborRate) laborRate = r.laborRate;
      for (const it of r.items || []) merged.set(it.kind + "|" + it.name.toLowerCase(), it);
      names.push(f.name);
    }
    const items = Array.from(merged.values()).slice(0, 250);
    if (!items.length) throw Error(`No prices found in ${names.join(", ")}. Try a clearer, straight-on photo or a different page.`);
    return { items, laborRate, ai: methods.has("ai"), free: !methods.has("ai"), aiError, source: names.join(", ") };
  }
  const canRetryWithAi = () => lastFiles.length > 0;
  const retryWithAi = (onStatus) => readFiles(lastFiles, onStatus, { ai: "always" });

  return { accept, readFiles, readLocal, csvRecords, canRetryWithAi, retryWithAi, cleanForOcr };
};
