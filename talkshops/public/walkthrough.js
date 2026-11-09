// Before and after walk-through: a quick checklist the technician taps through at check-in and again
// when the work is done. The customer sees both on their page. Used by the shop app and the demo.
// Keep ITEMS keys in step with WALK_ITEMS in supabase/functions/_shared/shop.ts.
(function () {
  "use strict";
  const ITEMS = [
    ["exterior", "Body and glass", "Dents, scratches, chips, cracks"],
    ["lights", "Lights", "Headlights, brake lights, signals"],
    ["wipers", "Wipers and washer fluid", "Blades and spray"],
    ["tires", "Tires", "Tread, wear and pressure"],
    ["brakes", "Brakes", "Pads, rotors and pedal feel"],
    ["oil", "Engine oil", "Level and condition"],
    ["fluids", "Other fluids", "Coolant, brake, transmission, steering"],
    ["battery", "Battery", "Terminals and charge"],
    ["belts", "Belts and hoses", "Cracks, wear or soft spots"],
    ["leaks", "Leaks underneath", "Oil, coolant or other drips"],
    ["dash", "Dashboard warning lights", "Check engine, ABS, airbag"],
  ].map(([key, label, hint]) => ({ key, label, hint }));
  const LABEL = Object.fromEntries(ITEMS.map((i) => [i.key, i.label]));
  // Shop side words, customer side words.
  const STATUS = {
    good: { tech: "Good", cust: "Good" },
    soon: { tech: "Watch", cust: "Keep an eye on" },
    now: { tech: "Repair", cust: "Needs attention" },
  };
  const RANK = { now: 0, soon: 1, good: 2 };
  const T = (s, ...a) => (window.tsT ? window.tsT(s, ...a) : s.replace(/\{(\d)\}/g, (_, i) => a[+i] ?? ""));
  const KIND = { before: { title: "Check-in walk-through", short: "Check-in" }, after: { title: "After-repair walk-through", short: "After Repair" } };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const counts = (w) => {
    const c = { good: 0, soon: 0, now: 0 };
    for (const i of w?.items || []) c[i.status]++;
    return c;
  };
  const tally = (w, side) => ["now", "soon", "good"].filter((s) => counts(w)[s]).map((s) =>
    `<span class="wt-count wt-${s}">${counts(w)[s]} ${esc(side === "cust" ? T(STATUS[s][side]) : STATUS[s][side]).toLowerCase()}</span>`).join("");

  /** Section in the shop's car sheet. */
  function sheetSection(j) {
    const all = j.walkthroughs || {};
    const card = (kind) => {
      const w = all[kind];
      return `<div class="wt-slot${w ? " has" : ""}"><div class="wt-slot-h"><b>${KIND[kind].short}</b>${w ? `<time>${when(w.t)}</time>` : ""}</div>
        ${w ? `<div class="wt-tally">${tally(w, "tech")}</div><small class="muted">${w.sentAt ? "Customer notified" : "On the customer's page"}${w.mileage ? " · " + esc(w.mileage) + " mi" : ""}</small>
          <button type="button" class="btn sm" data-walk="${kind}">Edit</button>`
        : `<p class="muted">${kind === "before" ? "Record the arrival condition." : "Verify the completed work."}</p>
          <button type="button" class="btn sm${kind === "before" || all.before ? " primary" : ""}" data-walk="${kind}">Start Check</button>`}</div>`;
    };
    return `<section class="sec"><h3>Vehicle Walk-Through <span class="sec-sub">Shared with customer</span></h3><div class="wt-slots">${card("before")}${card("after")}</div></section>`;
  }

  /** Draft for the editor: the saved report, or for "after" a copy of "before" to change what was fixed. */
  function draftFor(j, kind) {
    const all = j.walkthroughs || {}, src = all[kind] || (kind === "after" ? all.before : null);
    const items = {};
    const copied = !all[kind] && !!src;
    // A copied check-in note only carries over while the item still needs attention.
    for (const i of src?.items || []) items[i.key] = { status: i.status, note: copied && i.status === "good" ? "" : i.note || "", ...(copied ? { copiedNote: i.note || "" } : {}), ...(i.tread && !copied ? { tread: { ...i.tread } } : {}) };
    return { kind, items, mileage: all[kind]?.mileage || "", summary: all[kind]?.summary || "", copied };
  }

  function editor(j, d, opt) {
    const rows = ITEMS.map((it) => {
      const cur = d.items[it.key] || {};
      const seg = ["good", "soon", "now"].map((s) => `<button type="button" class="wt-seg wt-${s}" data-walk-set="${it.key}" data-v="${s}" aria-pressed="${cur.status === s}">${STATUS[s].tech}</button>`).join("");
      return `<li class="wt-row" data-walk-row="${it.key}"><div class="wt-row-h"><div><b>${esc(it.label)}</b><small>${esc(it.hint)}</small></div><div class="wt-segs" role="group" aria-label="${esc(it.label)}">${seg}</div></div>
        ${it.key === "tires" ? treadInputs(cur.tread) : ""}<input class="wt-note" data-walk-note="${it.key}" maxlength="300" placeholder="Note for the customer (optional)" value="${esc(cur.note || "")}" aria-label="Note for ${esc(it.label)}" ${cur.status && cur.status !== "good" || cur.note ? "" : "hidden"}></li>`;
    }).join("");
    const done = Object.keys(d.items).length;
    return `<div class="modal"><form class="modal-card wt-modal" id="walkForm" role="dialog" aria-modal="true" aria-labelledby="wtTitle">
      <h2 id="wtTitle">${KIND[d.kind].title}</h2>
      <p class="muted" style="margin:0">${esc(opt.vehicle)} · ${d.copied ? "Copied from check-in. Change what's different." : "Tap what you checked and skip the rest."}</p>
      <div class="wt-bar"><span id="wtDone">${done} of ${ITEMS.length} checked</span><button type="button" class="linkbtn" data-walk-allgood>Mark the rest good</button></div>
      <ul class="wt-list">${rows}</ul>
      <label class="field">Mileage<input id="wt-miles" inputmode="numeric" maxlength="12" placeholder="e.g. 84,120" value="${esc(d.mileage)}"></label>
      <label class="field">Summary for the customer (optional)<textarea id="wt-summary" maxlength="1000" placeholder="${d.kind === "before" ? "e.g. Front brakes are worn and should be replaced soon. Everything else looks good." : "e.g. New front pads and rotors installed. Tires rotated."}">${esc(d.summary)}</textarea></label>
      <label class="chk"><input type="checkbox" id="wt-send" ${opt.consent ? "checked" : "disabled"}> Notify ${esc(opt.first)} that the report is ready${opt.consent ? "" : " (customer has not agreed to notifications)"}</label>
      <div class="btn-row"><button class="btn primary" type="submit" ${opt.busy ? "disabled" : ""}>Save walk-through</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    </form></div>`;
  }

  // Tread depth in 32nds for each tire. 2/32 is the legal minimum in most states; 4/32 and under is worth a warning.
  const TIRES = [["lf", "LF"], ["rf", "RF"], ["lr", "LR"], ["rr", "RR"]];
  const treadClass = (v) => v <= 2 ? "wt-now" : v <= 4 ? "wt-soon" : "wt-good";
  function treadInputs(t) {
    return `<div class="wt-tread"><span>Tread depth <small>(32nds)</small></span>${TIRES.map(([k, l]) => `<label>${l}<input data-walk-tread="${k}" inputmode="numeric" maxlength="2" placeholder="–" value="${t && t[k] != null ? esc(t[k]) : ""}" aria-label="${l} tread depth in 32nds"></label>`).join("")}</div>`;
  }
  function treadText(t) {
    if (!t) return "";
    const parts = TIRES.filter(([k]) => t[k] != null).map(([k, l]) => `<span class="wt-dot ${treadClass(t[k])}">${l} ${esc(t[k])}/32</span>`);
    return parts.length ? `<small class="wt-tread-out">Tread ${parts.join(" ")}</small>` : "";
  }

  /** Handles taps inside the editor. Returns true when it used the click. Changes the page in place so nothing re-renders. */
  function click(t, d) {
    if (t.dataset.walkSet) {
      const key = t.dataset.walkSet, v = t.dataset.v, cur = d.items[key];
      if (cur?.status === v) delete cur.status; else (d.items[key] ||= { note: "" }).status = v;
      const it = d.items[key];
      if (v === "good" && it?.copiedNote && it.note === it.copiedNote) { it.note = ""; const n = document.querySelector(`[data-walk-note="${key}"]`); if (n) n.value = ""; }
      if (d.items[key] && !d.items[key].status && !d.items[key].note) delete d.items[key];
      paint(d, key);
      return true;
    }
    if (t.hasAttribute("data-walk-allgood")) {
      for (const it of ITEMS) if (!d.items[it.key]?.status) { (d.items[it.key] ||= { note: "" }).status = "good"; paint(d, it.key); }
      return true;
    }
    return false;
  }
  function paint(d, key) {
    const row = document.querySelector(`[data-walk-row="${key}"]`);
    if (!row) return;
    const st = d.items[key]?.status;
    row.querySelectorAll("[data-walk-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === st)));
    const note = row.querySelector(".wt-note");
    note.hidden = !(st && st !== "good") && !note.value;
    const n = document.getElementById("wtDone");
    if (n) n.textContent = `${Object.values(d.items).filter((i) => i.status).length} of ${ITEMS.length} checked`;
  }
  function input(t, d) {
    if (t.dataset.walkTread) {
      const v = t.value.replace(/\D/g, "").slice(0, 2), tr = ((d.items.tires ||= { note: "" }).tread ||= {});
      if (v === "" || +v > 32) delete tr[t.dataset.walkTread]; else tr[t.dataset.walkTread] = +v;
      return true;
    }
    if (t.dataset.walkNote) { const k = t.dataset.walkNote; (d.items[k] ||= {}).note = t.value; return true; }
    if (t.id === "wt-miles") { d.mileage = t.value; return true; }
    if (t.id === "wt-summary") { d.summary = t.value; return true; }
    return false;
  }
  function body(d) {
    return {
      kind: d.kind, mileage: d.mileage.trim(), summary: d.summary.trim(), send: !!document.getElementById("wt-send")?.checked,
      items: ITEMS.filter((i) => d.items[i.key]?.status).map((i) => ({ key: i.key, status: d.items[i.key].status, note: (d.items[i.key].note || "").trim(),
        ...(i.key === "tires" && d.items.tires.tread && Object.keys(d.items.tires.tread).length ? { tread: d.items.tires.tread } : {}) })),
    };
  }

  /** Card on the customer's page. */
  function customerCard(j) {
    const all = j.walkthroughs || {}, before = all.before, after = all.after;
    if (!before && !after) return "";
    const both = before && after, latest = after || before;
    const keys = ITEMS.map((i) => i.key).filter((k) => [before, after].some((w) => w?.items.some((i) => i.key === k)));
    const get = (w, k) => w?.items.find((i) => i.key === k);
    keys.sort((a, b) => (RANK[get(latest, a)?.status] ?? 3) - (RANK[get(latest, b)?.status] ?? 3));
    const dot = (it) => it ? `<span class="wt-dot wt-${it.status}">${esc(T(STATUS[it.status].cust))}</span>` : `<span class="wt-dot wt-none">${T("Not checked")}</span>`;
    const rows = keys.map((k) => {
      const notes = [both && get(before, k)?.note ? `<small><b>${T("Check-in")}:</b> ${esc(get(before, k).note)}</small>` : "", get(latest, k)?.note ? `<small>${both ? "<b>" + T("After") + ":</b> " : ""}${esc(get(latest, k).note)}</small>` : ""].join("");
      return `<tr><th scope="row">${esc(T(LABEL[k]))}${notes}${k === "tires" ? treadText(get(latest, k)?.tread) : ""}</th>${both ? `<td data-l="${T("Check-in")}">${dot(get(before, k))}</td>` : ""}<td${both ? ` data-l="${T("After")}"` : ""}>${dot(get(latest, k))}</td></tr>`;
    }).join("");
    const meta = (w, name) => w ? `<p class="wt-meta"><b>${name}</b> · ${when(w.t)}${w.by ? " · " + esc(w.by) : ""}${w.mileage ? " · " + esc(w.mileage) + " mi" : ""}</p>${w.summary ? `<p class="wt-sum">${esc(w.summary)}</p>` : ""}` : "";
    return `<div class="c-card wt-card"><h3>${T("Vehicle walk-through")}</h3>
      <div class="wt-tally">${tally(latest, "cust")}</div>
      ${meta(after, T("After repair"))}${meta(before, T("At check-in"))}
      <table class="wt-table"><thead><tr><th></th>${both ? `<th>${T("Check-in")}</th><th>${T("After")}</th>` : `<th>${after ? T("After repair") : T("At check-in")}</th>`}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  window.Walkthrough = { ITEMS, sheetSection, draftFor, editor, click, input, body, customerCard };
})();
