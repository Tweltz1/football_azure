"use strict";
// Reads the first sheet of an Excel .xlsx file into rows of text, with no library: an .xlsx file is a zip of XML.
// Uses the browser's DecompressionStream for the zip entries.
window.readXlsxRows = async (file) => {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const notXlsx = () => Error("This file isn't an Excel .xlsx workbook. In Excel, use File > Save As and choose .xlsx or CSV.");
  if (buf.length < 22 || dv.getUint32(0, true) !== 0x04034b50) throw notXlsx();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw notXlsx();
  const entries = {}, utf8 = new TextDecoder();
  let p = dv.getUint32(end + 16, true);
  for (let k = dv.getUint16(end + 10, true); k > 0 && dv.getUint32(p, true) === 0x02014b50; k--) {
    const nameLen = dv.getUint16(p + 28, true);
    entries[utf8.decode(buf.subarray(p + 46, p + 46 + nameLen))] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), at: dv.getUint32(p + 42, true) };
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  async function text(name) {
    const e = entries[name];
    if (!e) return null;
    const start = e.at + 30 + dv.getUint16(e.at + 26, true) + dv.getUint16(e.at + 28, true);
    const data = buf.subarray(start, start + e.size);
    if (e.method === 0) return utf8.decode(data);
    if (e.method !== 8 || typeof DecompressionStream !== "function") throw Error("This browser can't open Excel files. Save the sheet as CSV and import that.");
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }
  const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
  const tags = (node, name) => Array.from(node.getElementsByTagName(name));
  const textOf = (node) => tags(node, "t").filter((t) => t.parentNode.nodeName !== "rPh").map((t) => t.textContent).join("");

  // First sheet in workbook order.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = await text("xl/workbook.xml"), rels = await text("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const first = tags(xml(wb), "sheet")[0];
    const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const rel = tags(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === rid);
    if (rel) { const target = rel.getAttribute("Target"); sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, ""); }
  }
  const sheet = await text(sheetPath);
  if (!sheet) throw notXlsx();
  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = sharedXml ? tags(xml(sharedXml), "si").map(textOf) : [];

  const colIndex = (ref) => { let n = 0; for (const ch of (/^[A-Z]+/.exec(ref || "") || [""])[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  return tags(xml(sheet), "row").map((row) => {
    const out = [];
    tags(row, "c").forEach((c, i) => {
      const type = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let value = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? textOf(c) : v;
      // Excel stores 12.45 as 12.449999999999999; keep cents.
      if (!type || type === "n") { const num = Number(value); if (value !== "" && Number.isFinite(num)) value = String(Math.round(num * 100) / 100); }
      const col = c.getAttribute("r") ? colIndex(c.getAttribute("r")) : i;
      out[col] = String(value).trim();
    });
    return Array.from(out, (x) => x ?? "");
  }).filter((r) => r.some(Boolean));
};
