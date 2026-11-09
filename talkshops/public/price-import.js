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
  // Photos are shrunk to a sharp-enough JPEG so they upload quickly from a phone.
  async function photo(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error("Could not open " + file.name + ". Take a screenshot of it, or save it as a JPEG or PDF.")); i.src = url; });
      const scale = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.85).split(",")[1];
    } finally { URL.revokeObjectURL(url); }
  }

  const ask = (body) => api("POST", "shop/price-import", body);
  async function readOne(file) {
    const name = file.name || "file", lower = name.toLowerCase();
    if (/\.(xls|numbers|docx?|pages|odt|ods)$/.test(lower)) throw Error(`${name}: save it as PDF, .xlsx or CSV first, then upload that.`);
    if (/\.xlsx$/.test(lower) || /spreadsheetml/.test(file.type) || /\.(csv|tsv|txt)$/.test(lower) || /^text\//.test(file.type)) {
      const records = /\.xlsx$/.test(lower) || /spreadsheetml/.test(file.type) ? await window.readXlsxRows(file) : csvRecords(await file.text());
      if (!records.length) throw Error(`${name} looks empty.`);
      const local = readLocal(records);
      if (local) return { items: local, ai: false };
      const text = records.map((r) => r.join("\t")).join("\n");
      if (text.length > MAX_TEXT) throw Error(`${name} is too long to read at once. Split it into smaller sheets.`);
      return { ...(await ask({ text })), ai: true };
    }
    if (/\.pdf$/.test(lower) || file.type === "application/pdf") {
      if (file.size > MAX_FILE) throw Error(`${name} is too big. Upload a PDF under 4 MB, or one page at a time.`);
      return { ...(await ask({ mime: "application/pdf", data: await base64(file) })), ai: true };
    }
    if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/.test(lower)) {
      return { ...(await ask({ mime: "image/jpeg", data: await photo(file) })), ai: true };
    }
    throw Error(`${name}: upload a PDF, a photo, an Excel .xlsx or a CSV file.`);
  }

  /** Reads up to 5 files into one list (later files win on the same name and type). */
  async function readFiles(list, onStatus = () => {}) {
    const files = Array.from(list || []).slice(0, MAX_FILES);
    if (!files.length) throw Error("Choose a file first.");
    const merged = new Map(), names = [];
    let laborRate = null, ai = false;
    for (const [i, f] of files.entries()) {
      onStatus(files.length > 1 ? `Reading ${f.name} (${i + 1} of ${files.length})…` : `Reading ${f.name}…`);
      const r = await readOne(f);
      ai = ai || r.ai;
      if (r.laborRate) laborRate = r.laborRate;
      for (const it of r.items || []) merged.set(it.kind + "|" + it.name.toLowerCase(), it);
      names.push(f.name);
    }
    const items = Array.from(merged.values()).slice(0, 250);
    if (!items.length) throw Error(`No prices found in ${names.join(", ")}. Try a clearer photo or a different page.`);
    return { items, laborRate, ai, source: names.join(", ") };
  }

  return { accept, readFiles, readLocal, csvRecords };
};
