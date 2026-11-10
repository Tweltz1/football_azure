/* Repairs on an estimate: lines that share a `group` name (e.g. "Front brake job") are one repair.
   The customer sees one item with a combined price and approves or declines it as a whole.
   Shared by the real app (app.js) and the demo shop (demo.html). */
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PRI_ORDER = { required: 0, recommended: 1, optional: 2 };
  const keyOf = (e) => e.group ? "g:" + String(e.group).toLowerCase() : "l:" + e.id;

  /** Decision units in first-seen order: { key, name (null for a single line), lines, price, priority, status }. */
  function units(estimate) {
    const map = new Map();
    for (const e of estimate || []) {
      const k = keyOf(e);
      if (!map.has(k)) map.set(k, { key: k, name: e.group || null, lines: [] });
      map.get(k).lines.push(e);
    }
    return [...map.values()].map((u) => {
      const pri = u.lines.map((e) => e.priority).filter((p) => p in PRI_ORDER).sort((a, b) => PRI_ORDER[a] - PRI_ORDER[b])[0] || "";
      const st = u.lines.every((e) => e.status === u.lines[0].status) ? u.lines[0].status : "pending";
      return { ...u, price: u.lines.reduce((a, e) => a + Number(e.price), 0), priority: pri, status: st, ids: u.lines.map((e) => String(e.id)).join(",") };
    });
  }
  /** Repairs still open for more lines (none of their lines decided yet). */
  const openNames = (estimate) => units(estimate).filter((u) => u.name && u.lines.every((e) => e.status === "pending")).map((u) => u.name);

  /** Staff estimate table body: each repair gets a header row with its total, then its lines indented. */
  function staffRows(estimate, rowHtml) {
    return units(estimate).map((u) => !u.name ? rowHtml(u.lines[0], false)
      : `<tr class="grp-head"><td colspan="2"><b>${esc(u.name)}</b><span class="grp-sub">${u.lines.length === 1 ? "One repair · put its other parts and labor in it too" : `One repair · the customer approves or declines these ${u.lines.length} lines together`}</span></td><td class="num"><b>${money(u.price)}</b></td><td></td></tr>`
        + u.lines.map((e) => rowHtml(e, true)).join("")).join("");
  }
  /** The "Repair" picker under a pending line: on its own, an open repair, or a new one. */
  function lineSelect(e, estimate) {
    const names = openNames(estimate);
    const opts = [`<option value="">On its own</option>`, ...names.map((n) => `<option value="${esc(n)}" ${e.group === n ? "selected" : ""}>Part of: ${esc(n)}</option>`), `<option value="__new">New repair…</option>`];
    return `<label class="grp-pick">Repair<select class="grp-sel" data-grp="${esc(e.id)}" aria-label="Repair for ${esc(e.item)}">${opts.join("")}</select></label>`;
  }
  /** For the quick-add form: type a repair name or pick an open one; blank keeps the line on its own. */
  function addField(estimate, last) {
    const names = openNames(estimate);
    const v = last && names.some((n) => n.toLowerCase() === String(last).toLowerCase()) ? last : "";
    return `<label class="grp-pick grp-add">Part of a repair<input id="li-grp" list="li-grp-list" maxlength="60" autocomplete="off" placeholder="Optional, e.g. Front brake job" value="${esc(v)}"><datalist id="li-grp-list">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist></label>`;
  }
  /** Handles the line picker. apply(lineId, groupName) saves it. Returns true if the event was ours. */
  function onChange(target, apply) {
    if (target.classList?.contains("grp-sel")) {
      if (target.value === "__new") {
        const id = target.dataset.grp, label = target.closest(".grp-pick");
        label.innerHTML = `Repair<input class="grp-new" data-grp-new="${esc(id)}" maxlength="60" placeholder="Name it, e.g. Front brake job" aria-label="New repair name">`;
        label.querySelector("input").focus();
        return true;
      }
      apply(target.dataset.grp, target.value);
      return true;
    }
    if (target.dataset?.grpNew !== undefined) {
      const v = target.value.trim();
      if (v) apply(target.dataset.grpNew, v);
      return true;
    }
    return false;
  }
  // Enter in the new-name box saves it without submitting anything else.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset?.grpNew !== undefined) { e.preventDefault(); e.target.blur(); }
  });

  /** Customer card for one repair (2+ lines). o: { T, PRI, pending, draft(id), extras(lines) } */
  function custItem(u, o) {
    const T = o.T;
    const d = o.draft(u.lines[0].id);
    const choice = o.pending && u.status === "pending"
      ? `<div class="decide"><button class="yes" data-decide="${esc(u.ids)}" data-v="approved" aria-pressed="${d === "approved"}">${T("Approve")}</button><button class="no" data-decide="${esc(u.ids)}" data-v="declined" aria-pressed="${d === "declined"}">${T("Decline")}</button></div>`
      : (u.status !== "pending" ? `<span class="pill ${u.status === "approved" ? "ok" : "bad"}">${u.status === "approved" ? T("Approved") : T("Declined")}</span>` : "");
    const P = o.PRI[u.priority];
    const pri = P ? `<div class="pri-line"><span class="pill pri ${P.cls}">${T(P.label)}</span><span>${T(P.cust)}</span></div>` : "";
    const lines = `<ul class="grp-lines">${u.lines.map((e) => `<li><span>${esc(e.item)}</span><span>${money(e.price)}</span></li>`).join("")}</ul>`;
    return `<div class="est-item est-group pri-${esc(u.priority || "none")}"><div class="top"><span>${esc(u.name)}</span><span>${money(u.price)}</span></div>
      <p class="grp-note">${T("One repair: these parts and labor go together, so you approve or decline them as one.")}</p>${lines}${pri}${o.extras(u.lines)}${choice}</div>`;
  }
  /** Customer estimate list: repairs and single lines, most urgent first. single(e) renders an ungrouped line as before. */
  function custList(estimate, o, single) {
    return units(estimate).sort((a, b) => (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1))
      .map((u) => u.name ? custItem(u, o) : single(u.lines[0])).join("");
  }
  /** Ids a customer Approve/Decline button covers. */
  const idsOf = (btn) => String(btn.dataset.decide).split(",");
  /** Units the customer decides, for "Approved 1 of 2 items". */
  const count = (estimate) => units(estimate).length;

  window.EstGroups = { units, openNames, staffRows, lineSelect, addField, onChange, custList, idsOf, count };
})();
