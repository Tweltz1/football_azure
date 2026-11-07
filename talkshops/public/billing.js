"use strict";
window.createShopBilling = ({ esc, money }) => {
  const kinds = ["labor", "fee", "part", "percent"];
  const roundLine = (r) => Math.round(Math.round(r.qty * 100) * Math.round(r.rate * 100) / (r.kind === "percent" ? 10000 : 100)) / 100;
  const qtyLabel = kind => kind === "percent" ? "Charge base ($)" : kind === "labor" ? "Hours" : "Quantity";
  const rateLabel = kind => kind === "percent" ? "Rate (%)" : kind === "labor" ? "Hourly rate ($)" : "Unit rate ($)";
  const calculation = r => r.kind === "percent" ? `${r.rate}% of ${money(r.qty)}` : `${r.qty}${r.kind === "labor" ? " hr" : ""} × ${money(r.rate)}`;
  const blank = { name: "", kind: "fee", rate: "", qty: 1 };
  function row(r = blank, catalog = false) {
    return `<div class="charge-row">
      ${catalog ? `<label class="field">Description<input name="name" required maxlength="120" value="${esc(r.name)}"></label>`
        : `<label class="field">Description<span class="suggest-wrap"><input name="name" required maxlength="120" value="${esc(r.name)}" data-suggest="row" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="Type to search saved items"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items">▾</button></span></label>`}
      <label class="field">Type<select name="kind">${kinds.map(k => `<option value="${k}" ${r.kind === k ? "selected" : ""}>${k[0].toUpperCase() + k.slice(1)}</option>`).join("")}</select></label>
      ${catalog ? "" : `<label class="field"><span class="qty-label">${qtyLabel(r.kind)}</span><input name="qty" type="number" required min=".01" max="${r.kind==="percent"?1000000:10000}" step=".01" value="${esc(r.qty)}"></label>`}
      <label class="field"><span class="rate-label">${rateLabel(r.kind)}</span><input name="rate" type="number" required min="0" max="1000000" step=".01" value="${esc(r.rate)}"></label>
      <button type="button" class="linkbtn" data-billing="delete-row">Remove line</button></div>`;
  }
  function readRows(form, catalog = false) {
    return Array.from(form.querySelectorAll(".charge-row"), el => {
      const val = n => el.querySelector('[name="'+n+'"]').value;
      return { name: val("name").trim(), kind: val("kind"), rate: Number(val("rate")), ...(catalog ? {} : {qty: Number(val("qty"))}) };
    });
  }
  function catalogPicker(shop) {
    const rates = shop.rates || [];
    return rates.length ? `<label class="field">Add a saved item<span class="suggest-wrap"><input data-suggest="catalog" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="Type or pick from ${rates.length} saved item${rates.length===1?"":"s"}"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items">▾</button></span></label>` : "";
  }
  function fromQuote(j) {
    return j.estimate.filter(e => e.status === "approved").map(e => e.charge || {name:e.item,kind:"part",qty:1,rate:e.price});
  }
  function editor(mode, shop, j) {
    const catalog = mode === "rates", quote = mode === "quote";
    const title = catalog ? "Saved items: labor, parts and fees" : quote ? "Add estimate line" : mode === "upload" ? "Upload final bill" : "Create itemized bill";
    const initial = catalog ? (shop.rates || []) : quote ? [blank] : (j?.bill?.lines || fromQuote(j));
    return `<div class="modal"><form id="billingForm" data-mode="${mode}" class="modal-card billing-editor" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2>
      ${mode === "upload" ? `<label class="field">Shop invoice (PDF, up to 3 MB)<input name="file" type="file" required accept="application/pdf,.pdf"></label>
      <label class="field">Total printed on invoice ($)<input type="number" required min="0" max="100000000" step=".01" name="total"></label>` :
      `${catalog ? `<p class="muted" style="margin:0">These show up as suggestions when you add estimate or bill lines.</p><label class="field">Import from Excel or CSV<input data-rate-import type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><small>Columns: name, type, rate. Types: labor, fee, part, percent (blank means part). Matching names and types update existing items.</small>
      <button type="button" class="linkbtn" data-billing="template">Download example CSV</button>` : catalogPicker(shop)}
      ${mode === "generated" ? "<p>Review approved work, enter actual hours and add any final charges.</p>" : ""}
      <div class="charge-rows">${initial.map(r => row(r,catalog)).join("")}</div>
      ${quote ? "" : `<button type="button" class="btn" data-billing="add-row">Add line</button>`}
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
  function readCsv(text) {
    const records = []; let fields = [], field = "", quoted = false;
    const src = text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
    for (let i=0; i<src.length; i++) {
      const c=src[i];
      if (c === '"') {
        if (quoted && src[i+1] === '"') { field += '"'; i++; } else quoted = !quoted;
      } else if (!quoted && (c === "," || c === "\n")) {
        fields.push(field.trim()); field="";
        if (c === "\n") { if (fields.some(Boolean)) records.push(fields); fields=[]; }
      } else field += c;
    }
    if (quoted) throw Error("CSV contains an unclosed quotation mark.");
    fields.push(field.trim()); if (fields.some(Boolean)) records.push(fields);
    return parseRates(records, "CSV");
  }
  // Header names a shop's spreadsheet might use for each column.
  const headerNames = {
    name: ["name","description","item","item name","line item","service","product","part name","fee name"],
    type: ["type","kind","category"],
    rate: ["rate","price","cost","amount","unit price","unit cost","hourly rate","rate ($)","price ($)"],
  };
  const kindNames = { labor:"labor", labour:"labor", hours:"labor", hourly:"labor", fee:"fee", fees:"fee", part:"part", parts:"part", percent:"percent", percentage:"percent", "%":"percent" };
  function parseRates(records, what) {
    const head=(records[0] || []).map(x=>String(x).trim().toLowerCase()), rows=records.slice(1);
    const [ni,ti,ri]=["name","type","rate"].map(k=>head.findIndex(h=>headerNames[k].includes(h)));
    if (ni<0 || ri<0 || !rows.length) throw Error("The first row needs column headers: name, type and rate (type is optional), then at least one row.");
    return rows.map((values,i)=>{
      const name=String(values[ni] || "").trim(), rawKind=ti<0 ? "" : String(values[ti] || "").trim().toLowerCase();
      const kind=rawKind ? kindNames[rawKind] : "part", rawRate=String(values[ri] || "").replace(/[$,%\s]/g,""), rate=Number(rawRate);
      if (!name && !rawRate) return null;
      if (!name || name.length>120 || !kind || !/^\d+(\.\d{1,2})?$/.test(rawRate) || rate>(kind==="percent"?100:1000000))
        throw Error(`Check ${what} row ${i+2}: ${!name ? "it needs a name" : !kind ? "type must be labor, fee, part or percent" : "the rate must be a number with up to 2 decimals"}.`);
      return {name,kind,rate};
    }).filter(Boolean);
  }
  async function readRateFile(file) {
    if (/\.xls$/i.test(file.name)) throw Error("Old .xls files can't be read. In Excel, use File > Save As and choose .xlsx or CSV.");
    if (/\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type)) return parseRates(await window.readXlsxRows(file), "spreadsheet");
    return readCsv(await file.text());
  }
  function error(f,msg) { const el=f.querySelector("[data-bill-error]");el.hidden=false;el.textContent=msg; }
  async function change(e, shop) {
    const t=e.target, f=t.closest("#billingForm"); if (!f) return;
    if (t.matches("[data-rate-import]") && t.files[0]) {
      try {
        if(t.files[0].size>2000000) throw Error("Choose a file smaller than 2 MB.");
        const key=r=>r.kind+"|"+r.name.toLowerCase();
        const merged=new Map(readRows(f,true).filter(r=>r.name).map(r=>[key(r),r]));
        const imported=await readRateFile(t.files[0]);
        for(const r of imported) merged.set(key(r),r);
        if(merged.size>250) throw Error("A shop can save up to 250 items.");
        f.querySelector(".charge-rows").innerHTML=Array.from(merged.values(),r=>row(r,true)).join("");
        f.querySelector("[data-bill-error]").hidden=true;
        f.querySelector("[data-import-ok]")?.remove();
        f.querySelector(".charge-rows").insertAdjacentHTML("beforebegin",`<p class="form-ok" data-import-ok role="status">Imported ${imported.length} item${imported.length===1?"":"s"}. Press Save to keep them.</p>`);
      } catch(err) { error(f,err.message); }
      t.value="";
    } else if(t.name==="kind") {
      const el=t.closest(".charge-row"), qty=el.querySelector(".qty-label");
      if(qty) { qty.textContent=qtyLabel(t.value); el.querySelector('[name="qty"]').max=t.value==="percent"?"1000000":"10000"; }
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
      if(blankRow) blankRow.outerHTML=row({...r,qty:1}); else if(f.dataset.mode==="quote") rows.innerHTML=row({...r,qty:1}); else rows.insertAdjacentHTML("beforeend",row({...r,qty:1}));
      input.value="";
    } else {
      const el=input.closest(".charge-row");
      input.value=r.name;
      el.querySelector('[name="rate"]').value=r.rate;
      const kind=el.querySelector('[name="kind"]'); kind.value=r.kind; kind.dispatchEvent(new Event("change",{bubbles:true}));
      el.querySelector('[name="qty"]')?.focus();
    }
    updateTotal(f);
  }
  function editClick(t, f) {
    if(t.dataset.billing==="add-row") f.querySelector(".charge-rows").insertAdjacentHTML("beforeend",row(blank,f.dataset.mode==="rates"));
    if(t.dataset.billing==="delete-row") t.closest(".charge-row").remove();
    if(t.dataset.billing==="template") download(new Blob(["name,type,rate\nTechnician labor,labor,110.00\nShop supplies,fee,12.50\nOil filter,part,16.00\n"],{type:"text/csv"}),"shop-rates.csv");
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
  return {editor,calculation,readRows,updateTotal,change,editClick,error,billBody,display,fileDownload,readCsv,parseRates,readRateFile,pickSaved};
};
