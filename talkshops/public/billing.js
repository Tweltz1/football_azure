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
      <label class="field">Description<input name="name" required maxlength="120" value="${esc(r.name)}"></label>
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
    return rates.length ? `<label class="field">Add a saved rate<select data-catalog><option value="">Choose a fee, part or labor rate</option>${rates.map((r,i) => `<option value="${i}">${esc(r.name)} · ${r.kind==="percent" ? r.rate + "%" : money(r.rate)}${r.kind === "labor" ? "/hr" : ""}</option>`).join("")}</select></label>` : "";
  }
  function fromQuote(j) {
    return j.estimate.filter(e => e.status === "approved").map(e => e.charge || {name:e.item,kind:"part",qty:1,rate:e.price});
  }
  function editor(mode, shop, j) {
    const catalog = mode === "rates", quote = mode === "quote";
    const title = catalog ? "Shop rates and fees" : quote ? "Add estimate line" : mode === "upload" ? "Upload final bill" : "Create itemized bill";
    const initial = catalog ? (shop.rates || []) : quote ? [blank] : (j?.bill?.lines || fromQuote(j));
    return `<div class="modal"><form id="billingForm" data-mode="${mode}" class="modal-card billing-editor" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2>
      ${mode === "upload" ? `<label class="field">Shop invoice (PDF, up to 3 MB)<input name="file" type="file" required accept="application/pdf,.pdf"></label>
      <label class="field">Total printed on invoice ($)<input type="number" required min="0" max="100000000" step=".01" name="total"></label>` :
      `${catalog ? `<label class="field">Import rates from CSV<input data-rate-import type="file" accept=".csv,text/csv"></label><small>Columns: name, type, rate. Types: labor, fee, part, percent. Matching names and types update existing rates.</small>
      <button type="button" class="linkbtn" data-billing="template">Download example CSV</button>` : catalogPicker(shop)}
      ${mode === "generated" ? "<p>Review approved work, enter actual hours and add any final charges.</p>" : ""}
      <div class="charge-rows">${initial.map(r => row(r,catalog)).join("")}</div>
      ${quote ? "" : `<button type="button" class="btn" data-billing="add-row">Add line</button>`}
      ${catalog ? "" : `<div class="total"><span>${quote ? "Line total" : "Final total"}</span><b data-bill-total></b></div>`}`}
      <p role="alert" class="form-err" data-bill-error hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${catalog ? "Save shop rates" : quote ? "Add to estimate" : "Save final bill"}</button><button class="btn" type="button" data-cancel>Cancel</button></div>
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
    const headers=(records.shift() || []).map(x=>x.toLowerCase()), indexes=["name","type","rate"].map(k=>headers.indexOf(k));
    if (indexes.includes(-1) || !records.length) throw Error("Include name,type,rate headers and at least one row.");
    return records.map((values,i)=>{
      const [name,rawKind,rawRate]=indexes.map(k=>values[k] || ""), kind=rawKind.toLowerCase(), rate=Number(rawRate);
      if (!name || name.length>120 || !kinds.includes(kind) || !/^\d+(\.\d{1,2})?$/.test(rawRate) || rate>(kind==="percent"?100:1000000)) throw Error("Check CSV row "+(i+2)+".");
      return {name,kind,rate};
    });
  }
  function error(f,msg) { const el=f.querySelector("[data-bill-error]");el.hidden=false;el.textContent=msg; }
  async function change(e, shop) {
    const t=e.target, f=t.closest("#billingForm"); if (!f) return;
    if (t.matches("[data-rate-import]") && t.files[0]) {
      try {
        if(t.files[0].size>256000) throw Error("Choose a CSV smaller than 250 KB.");
        const key=r=>r.kind+"|"+r.name.toLowerCase();
        const merged=new Map(readRows(f,true).filter(r=>r.name).map(r=>[key(r),r]));
        for(const r of readCsv(await t.files[0].text())) merged.set(key(r),r);
        if(merged.size>250) throw Error("A shop can save up to 250 rates.");
        f.querySelector(".charge-rows").innerHTML=Array.from(merged.values(),r=>row(r,true)).join("");
        f.querySelector("[data-bill-error]").hidden=true;
      } catch(err) { error(f,err.message); }
      t.value="";
    } else if (t.matches("[data-catalog]") && t.value!=="") {
      const r=shop.rates[Number(t.value)], rows=f.querySelector(".charge-rows");
      if(f.dataset.mode==="quote") rows.innerHTML="";
      rows.insertAdjacentHTML("beforeend",row({...r,qty:1}));t.value="";
    } else if(t.name==="kind") {
      const el=t.closest(".charge-row"), qty=el.querySelector(".qty-label");
      if(qty) { qty.textContent=qtyLabel(t.value); el.querySelector('[name="qty"]').max=t.value==="percent"?"1000000":"10000"; }
      el.querySelector(".rate-label").textContent=rateLabel(t.value);
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
    return {mode:"generated",lines};
  }
  function display(b,j) {
    if(!b) return "";
    return `<section class="c-card final-bill"><h3>Final bill</h3><strong>${esc(b.shopName)}</strong><div>${esc(b.phone)} · ${esc(j.ro)}</div>
    <div>${esc(j.vehicle)} · ${esc(new Date(b.issuedAt).toLocaleDateString())}</div>
    ${b.mode==="generated" ? b.lines.map(r=>`<div class="bill-item"><div>${esc(r.name)}<small>${calculation(r)}</small></div><b>${money(roundLine(r))}</b></div>`).join("") : ""}
    <div class="total"><span>Total due</span><b>${money(b.total)}</b></div><button class="btn" type="button" data-billing="${b.mode==="upload"?"download":"print"}">${b.mode==="upload"?"Download shop invoice (PDF)":"Print / save PDF"}</button></section>`;
  }
  function fileDownload(pdf,filename) {download(new Blob([Uint8Array.from(atob(pdf),c=>c.charCodeAt(0))],{type:"application/pdf"}),filename);}
  return {editor,calculation,readRows,updateTotal,change,editClick,error,billBody,display,fileDownload,readCsv};
};
