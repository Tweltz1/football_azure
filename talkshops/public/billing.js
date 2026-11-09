"use strict";
window.createShopBilling = ({ esc, money, prices }) => {
  const kinds = ["labor", "fee", "part", "percent"];
  const roundLine = (r) => Math.round(Math.round(r.qty * 100) * Math.round(r.rate * 100) / (r.kind === "percent" ? 10000 : 100)) / 100;
  const qtyLabel = kind => kind === "percent" ? "Charge base ($)" : kind === "labor" ? "Hours" : "Quantity";
  const rateLabel = kind => kind === "percent" ? "Rate (%)" : kind === "labor" ? "Hourly rate ($)" : "Unit rate ($)";
  const calculation = r => r.kind === "percent" ? `${r.rate}% of ${money(r.qty)}` : `${r.qty}${r.kind === "labor" ? " hr" : ""} × ${money(r.rate)}`;
  const blank = { name: "", kind: "fee", rate: "", qty: 1 };
  function row(r = blank, catalog = false) {
    return `<div class="charge-row${r.check ? " needs-check" : ""}">${r.check ? `<p class="row-note">Check this one${r.note ? ": " + esc(r.note) : ""}</p>` : ""}
      ${catalog ? `<label class="field">Description<input name="name" required maxlength="120" value="${esc(r.name)}"></label>`
        : `<label class="field">Description<span class="suggest-wrap"><input name="name" required maxlength="120" value="${esc(r.name)}" data-suggest="row" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="Type to search saved items"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items">▾</button></span></label>`}
      <label class="field">Type<select name="kind">${kinds.map(k => `<option value="${k}" ${r.kind === k ? "selected" : ""}>${k[0].toUpperCase() + k.slice(1)}</option>`).join("")}</select></label>
      ${catalog ? "" : `<label class="field"><span class="qty-label">${qtyLabel(r.kind)}</span><input name="qty" type="number" required min=".01" max="${r.kind==="percent"?1000000:10000}" step=".01" value="${esc(r.qty)}"></label>`}
      <label class="field"><span class="rate-label">${rateLabel(r.kind)}</span><input name="rate" type="number" required min="0" max="1000000" step=".01" value="${esc(r.rate)}"></label>
      ${catalog ? `<label class="field hours-field" ${r.kind === "labor" ? "" : "hidden"}>Book hours (optional)<input name="hours" type="number" min="0" max="1000" step=".01" value="${r.hours ? esc(r.hours) : ""}" placeholder="e.g. 1.5"></label>` : ""}
      <button type="button" class="linkbtn" data-billing="delete-row">Remove line</button></div>`;
  }
  function readRows(form, catalog = false) {
    return Array.from(form.querySelectorAll(".charge-row"), el => {
      const val = n => el.querySelector('[name="'+n+'"]').value;
      const hours = catalog && val("kind") === "labor" ? Number(el.querySelector('[name="hours"]').value) : 0;
      return { name: val("name").trim(), kind: val("kind"), rate: Number(val("rate")), ...(catalog ? (hours > 0 ? {hours} : {}) : {qty: Number(val("qty"))}) };
    });
  }
  function catalogPicker(shop) {
    const rates = shop.rates || [];
    return rates.length ? `<label class="field">Add a saved item<span class="suggest-wrap"><input data-suggest="catalog" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="Type or pick from ${rates.length} saved item${rates.length===1?"":"s"}"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items">▾</button></span></label>` : "";
  }
  function fromQuote(j) {
    return j.estimate.filter(e => e.status === "approved").map(e => e.charge || {name:e.item,kind:"part",qty:1,rate:e.price});
  }
  // Saved items plus a freshly imported list; imported items replace saved ones with the same name and type.
  function withImported(rates, imported) {
    const key = r => r.kind + "|" + r.name.trim().toLowerCase(), fresh = new Set(imported.map(key));
    return [...imported, ...rates.filter(r => !fresh.has(key(r)))];
  }
  function importNote(imp) {
    const n = imp.items.length, flagged = imp.items.filter(r => r.check).length;
    return `<div class="form-ok import-note" data-import-ok role="status"><b>Found ${n} item${n === 1 ? "" : "s"}${imp.source ? " in " + esc(imp.source) : ""}.</b> Check each one, fix anything that's off and remove what you don't want. Nothing is saved until you press Save items.${flagged ? ` <span class="flag-count">${flagged} highlighted item${flagged === 1 ? " needs" : "s need"} a look.</span>` : ""}${imp.laborRate ? ` Your labor rate looks like ${money(imp.laborRate)}/hr.` : ""}</div>`;
  }
  // Top of the Saved items editor: quick add, search, and import / download.
  function catalogTools(count, openIo) {
    return `<p class="muted" style="margin:0">These show up as suggestions when you add estimate or bill lines.</p>
      <div class="qa-row" role="group" aria-label="Add a saved item">
        <input data-qa="name" maxlength="120" placeholder="New item, e.g. Wiper blades" aria-label="New item name" autocomplete="off">
        <select data-qa="kind" aria-label="New item type">${kinds.map(k => `<option value="${k}" ${k === "part" ? "selected" : ""}>${k[0].toUpperCase() + k.slice(1)}</option>`).join("")}</select>
        <input data-qa="rate" type="number" min="0" max="1000000" step=".01" placeholder="Price" aria-label="New item price">
        <button type="button" class="btn primary" data-billing="qa-add">Add</button>
      </div>
      <div class="rates-find"><input type="search" data-rate-search placeholder="Search your saved items" aria-label="Search saved items" autocomplete="off"><span class="muted" data-rate-count>${count} item${count === 1 ? "" : "s"}</span></div>
      <details class="rates-io" ${openIo ? "open" : ""}><summary>Import or download your list</summary>
        <label class="field">Import your price list<input data-rate-import type="file" multiple accept="${prices.accept}"></label>
        <small>Upload what you already use: a PDF, a photo of your price board or menu, an Excel sheet or a CSV, in any layout. Talk Shops finds the items and prices, and you check them before anything is saved. Matching names and types update existing items.</small>
        <label class="chk"><input type="checkbox" data-import-replace> Replace my whole list with the file (use this after editing a downloaded list, so deleted rows go away)</label>
        <p class="muted import-status" data-import-status role="status" hidden></p>
        <div class="io-links"><button type="button" class="btn" data-billing="export-xlsx">Download my list (Excel)</button><button type="button" class="linkbtn" data-billing="export-csv">Download as CSV</button><button type="button" class="linkbtn" data-billing="template">Example CSV</button></div>
        <small>To add a lot at once: download your list, add rows in Excel (name, type, rate, hours), then import it here.</small>
      </details>`;
  }
  const exportRows = f => [["name","type","rate","hours"], ...readRows(f,true).filter(r => r.name).map(r => [r.name, r.kind, r.rate, r.hours || ""])];
  const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g,'""') + '"' : String(v);
  // A one-sheet .xlsx with no library: a zip (stored, not compressed) of the minimum workbook XML.
  function xlsxBlob(rows) {
    const x = v => String(v).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    const colName = i => String.fromCharCode(65 + i);
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="4" width="12" customWidth="1"/></cols><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === "" ? "" : typeof v === "number" ? `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Saved items" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/worksheets/sheet1.xml": sheet,
    };
    const enc = new TextEncoder(), crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = b => { let c = 0xFFFFFFFF; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const parts = [], central = []; let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const n = enc.encode(name), d = enc.encode(text), c = crc(d);
      const h = new DataView(new ArrayBuffer(30)); [[0,0x04034b50,4],[4,20,2],[14,c,4],[18,d.length,4],[22,d.length,4],[26,n.length,2]].forEach(([o,v,s]) => s === 4 ? h.setUint32(o,v,true) : h.setUint16(o,v,true));
      const ch = new DataView(new ArrayBuffer(46)); [[0,0x02014b50,4],[4,20,2],[6,20,2],[16,c,4],[20,d.length,4],[24,d.length,4],[28,n.length,2],[42,offset,4]].forEach(([o,v,s]) => s === 4 ? ch.setUint32(o,v,true) : ch.setUint16(o,v,true));
      parts.push(h, n, d); central.push(ch, n); offset += 30 + n.length + d.length;
    }
    const size = central.reduce((a, b) => a + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    [[0,0x06054b50,4],[8,central.length/2,2],[10,central.length/2,2],[12,size,4],[16,offset,4]].forEach(([o,v,s]) => s === 4 ? end.setUint32(o,v,true) : end.setUint16(o,v,true));
    return new Blob([...parts, ...central, end], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  function refreshCount(f) {
    const el = f.querySelector("[data-rate-count]"); if (!el) return;
    const all = f.querySelectorAll(".charge-row").length, shown = f.querySelectorAll(".charge-row:not([hidden])").length;
    el.textContent = all === shown ? `${all} item${all === 1 ? "" : "s"}` : `${shown} of ${all} items`;
  }
  function search(f) {
    const q = (f.querySelector("[data-rate-search]")?.value || "").trim().toLowerCase();
    f.querySelectorAll(".charge-row").forEach(el => { el.hidden = !!q && !el.querySelector('[name="name"]').value.toLowerCase().includes(q); });
    refreshCount(f);
  }
  function quickAdd(f) {
    const name = f.querySelector('[data-qa="name"]'), kind = f.querySelector('[data-qa="kind"]'), rate = f.querySelector('[data-qa="rate"]');
    const n = name.value.replace(/\s+/g, " ").trim(), r = Number(rate.value);
    if (!n) { error(f, "Type a name for the new item."); name.focus(); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(rate.value.trim()) || r > (kind.value === "percent" ? 100 : 1000000)) { error(f, "Enter a price with up to 2 decimals" + (kind.value === "percent" ? " (0 to 100 for a percent)." : ".")); rate.focus(); return; }
    f.querySelector("[data-bill-error]").hidden = true;
    const rows = f.querySelector(".charge-rows");
    const same = Array.from(rows.querySelectorAll(".charge-row")).find(el => el.querySelector('[name="name"]').value.trim().toLowerCase() === n.toLowerCase() && el.querySelector('[name="kind"]').value === kind.value);
    if (same) { same.querySelector('[name="rate"]').value = r; same.classList.add("just-added"); }
    else { rows.insertAdjacentHTML("afterbegin", row({ name: n, kind: kind.value, rate: r }, true)); rows.firstElementChild.classList.add("just-added"); }
    const s = f.querySelector("[data-rate-search]"); if (s) s.value = "";
    search(f);
    name.value = ""; rate.value = ""; name.focus();
  }
  // Enter in the quick-add boxes adds the item instead of saving the whole list; typing in search filters.
  document.addEventListener("keydown", e => {
    const f = e.target.closest?.("#billingForm");
    if (!f || e.key !== "Enter") return;
    if (e.target.matches("[data-qa]")) { e.preventDefault(); quickAdd(f); }
    else if (e.target.matches("[data-rate-search]")) e.preventDefault();
  });
  document.addEventListener("input", e => { const f = e.target.closest?.("#billingForm"); if (f && e.target.matches("[data-rate-search]")) search(f); });
  // Rows hidden by search still get checked and saved: show them all before the browser validates the form.
  document.addEventListener("click", e => {
    const f = e.target.closest?.("#billingForm");
    if (f && e.target.matches('[type="submit"]') && f.querySelector("[data-rate-search]")) { f.querySelector("[data-rate-search]").value = ""; search(f); }
  }, true);
  function editor(mode, shop, j, imported) {
    const catalog = mode === "rates", quote = mode === "quote";
    const title = catalog ? "Saved items: labor, parts and fees" : quote ? "Add estimate line" : mode === "upload" ? "Upload final bill" : "Create itemized bill";
    const initial = catalog ? (imported ? withImported(shop.rates || [], imported.items) : (shop.rates || [])) : quote ? [blank] : (j?.bill?.lines || fromQuote(j));
    return `<div class="modal"><form id="billingForm" data-mode="${mode}" class="modal-card billing-editor" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2>
      ${mode === "upload" ? `<label class="field">Shop invoice (PDF, up to 3 MB)<input name="file" type="file" required accept="application/pdf,.pdf"></label>
      <label class="field">Total printed on invoice ($)<input type="number" required min="0" max="100000000" step=".01" name="total"></label>` :
      `${catalog ? catalogTools(initial.length, !!imported || !initial.length) + (imported ? importNote(imported) : "") : catalogPicker(shop)}
      ${mode === "generated" ? "<p>Review approved work, enter actual hours and add any final charges.</p>" : ""}
      <div class="charge-rows">${initial.map(r => row(r,catalog)).join("")}</div>
      ${quote ? "" : `<button type="button" class="btn" data-billing="add-row">Add line</button>`}
      ${quote ? `<label class="field">Priority<select name="priority"><option value="required">Required</option><option value="recommended" selected>Recommended</option><option value="optional">Optional</option></select></label>` : ""}
      ${catalog ? "" : `<div class="total"><span>${quote ? "Line total" : "Final total"}</span><b data-bill-total></b></div>
      <label class="chk"><input type="checkbox" name="saveItems" checked> Save new ${quote ? "item" : "lines"} to my saved items for next time</label>`}`}
      <p role="alert" class="form-err" data-bill-error hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${catalog ? "Save items" : quote ? "Add to estimate" : "Save final bill"}</button><button class="btn" type="button" data-cancel>Cancel</button></div>
      </form></div>`;
  }
  function updateTotal(f) {
    const total = f.querySelector("[data-bill-total]");
    if (total) total.textContent = money(readRows(f).reduce((sum,r)=>sum+Math.round(roundLine(r)*100),0)/100);
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function error(f,msg) { const el=f.querySelector("[data-bill-error]");el.hidden=false;el.textContent=msg; }
  async function change(e, shop) {
    const t=e.target, f=t.closest("#billingForm"); if (!f) return;
    if (t.matches("[data-rate-import]") && t.files.length) {
      const status=f.querySelector("[data-import-status]"), save=f.querySelector('[type="submit"]');
      const say=msg=>{status.hidden=!msg;status.textContent=msg ? msg+" This can take up to a minute for a PDF or photo." : "";};
      t.disabled=true; save.disabled=true; f.querySelector("[data-bill-error]").hidden=true;
      try {
        const imp=await prices.readFiles(t.files, say);
        const replace=f.querySelector("[data-import-replace]")?.checked;
        const merged=replace ? imp.items : withImported(readRows(f,true).filter(r=>r.name),imp.items);
        if(merged.length>250) throw Error("A shop can save up to 250 items. Remove some, then import again.");
        f.querySelector(".charge-rows").innerHTML=merged.map(r=>row(r,true)).join("");
        f.querySelector("[data-import-ok]")?.remove();
        f.querySelector(".rates-io").insertAdjacentHTML("afterend",importNote(replace ? {...imp, source: (imp.source||"the file") + " (replaces your list when you save)"} : imp));
        const s=f.querySelector("[data-rate-search]"); if(s) s.value=""; search(f);
        f.querySelector(".needs-check")?.scrollIntoView({block:"center",behavior:"smooth"});
      } catch(err) { error(f,err.message); }
      say(""); t.disabled=false; save.disabled=false; t.value="";
    } else if(t.name==="kind") {
      const el=t.closest(".charge-row"), qty=el.querySelector(".qty-label");
      if(qty) { qty.textContent=qtyLabel(t.value); el.querySelector('[name="qty"]').max=t.value==="percent"?"1000000":"10000"; }
      const hrs=el.querySelector(".hours-field"); if(hrs) hrs.hidden=t.value!=="labor";
      el.querySelector(".rate-label").textContent=rateLabel(t.value);
    }
    updateTotal(f);
  }
  // A saved item was picked from the suggestions in the editor.
  function pickSaved(input, r) {
    const f=input.closest("#billingForm"); if(!f) return;
    if(input.dataset.suggest==="catalog") {
      const rows=f.querySelector(".charge-rows");
      const blankRow=Array.from(rows.querySelectorAll(".charge-row")).find(el=>!el.querySelector('[name="name"]').value.trim() && !el.querySelector('[name="rate"]').value);
      const line={...r,qty:r.hours||1};
      if(blankRow) blankRow.outerHTML=row(line); else if(f.dataset.mode==="quote") rows.innerHTML=row(line); else rows.insertAdjacentHTML("beforeend",row(line));
      input.value="";
    } else {
      const el=input.closest(".charge-row");
      input.value=r.name;
      el.querySelector('[name="rate"]').value=r.rate;
      const kind=el.querySelector('[name="kind"]'); kind.value=r.kind; kind.dispatchEvent(new Event("change",{bubbles:true}));
      if(r.hours) el.querySelector('[name="qty"]').value=r.hours;
      el.querySelector('[name="qty"]')?.focus();
    }
    updateTotal(f);
  }
  function editClick(t, f) {
    if(t.dataset.billing==="add-row") { f.querySelector(".charge-rows").insertAdjacentHTML("beforeend",row(blank,f.dataset.mode==="rates")); refreshCount(f); }
    if(t.dataset.billing==="delete-row") { t.closest(".charge-row").remove(); refreshCount(f); }
    if(t.dataset.billing==="qa-add") quickAdd(f);
    if(t.dataset.billing==="export-xlsx") download(xlsxBlob(exportRows(f)),"talkshops-saved-items.xlsx");
    if(t.dataset.billing==="export-csv") download(new Blob(["\uFEFF"+exportRows(f).map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n"],{type:"text/csv"}),"talkshops-saved-items.csv");
    if(t.dataset.billing==="template") download(new Blob(["name,type,rate,hours\nTechnician labor,labor,110.00,\nFront brake pads,labor,110.00,1.5\nShop supplies,fee,12.50,\nOil filter,part,16.00,\n"],{type:"text/csv"}),"shop-rates.csv");
    updateTotal(f);
  }
  async function billBody(f) {
    if(f.dataset.mode==="upload") {
      const file=f.elements.file.files[0]; if(!file || file.size>3*1024*1024) throw Error("Choose a PDF up to 3 MB.");
      const pdf=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=()=>reject(Error("Could not read this PDF."));r.readAsDataURL(file);});
      return {mode:"upload",pdf,filename:file.name,total:Number(f.elements.total.value)};
    }
    const lines=readRows(f);if(!lines.length) throw Error("Add at least one bill line.");
    return {mode:"generated",lines,save:!!f.elements.saveItems?.checked};
  }
  function display(b,j) {
    if(!b) return "";
    return `<section class="c-card final-bill"><h3>Final bill</h3><strong>${esc(b.shopName)}</strong><div>${esc(b.phone)} · ${esc(j.ro)}</div>
    <div>${esc(j.vehicle)} · ${esc(new Date(b.issuedAt).toLocaleDateString())}</div>
    ${b.mode==="generated" ? b.lines.map(r=>`<div class="bill-item"><div>${esc(r.name)}<small>${calculation(r)}</small></div><b>${money(roundLine(r))}</b></div>`).join("") : ""}
    <div class="total"><span>Total due</span><b>${money(b.total)}</b></div><button class="btn" type="button" data-billing="${b.mode==="upload"?"download":"print"}">${b.mode==="upload"?"Download shop invoice (PDF)":"Print / save PDF"}</button></section>`;
  }
  function fileDownload(pdf,filename) {download(new Blob([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],{type:"application/pdf"}),filename);}
  return {editor,calculation,readRows,updateTotal,change,editClick,error,billBody,display,fileDownload,pickSaved,importNote};
};
