// Workday tools shared by the shop app and the demo: returning customers and visit history, technician
// assignment and "My cars", mileage in and out, promised-by times, shop-only notes, quick services,
// reminder texts (declined work and next service), printing, the end-of-day summary and reply alerts.
// Each page calls Workday.init(adapter) once; the adapter reads and saves through that page's own data.
(function () {
  "use strict";
  let A = null;
  const ui = { mine: false, visits: {}, lookupT: 0, seen: null, alerts: false };
  try { ui.mine = localStorage.getItem("ts-mine") === "1"; ui.alerts = localStorage.getItem("ts-alerts") === "1"; } catch { /* private mode */ }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ts = (t) => (typeof t === "number" ? t : Date.parse(t));
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const miles = (m) => m ? Number(m).toLocaleString("en-US") + " mi" : "";
  const first = (n) => String(n || "").split(/\s+/)[0];
  const vehicle = (j) => [j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" ");
  const shortDate = (t) => new Date(ts(t)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const dueText = (t) => {
    const d = new Date(ts(t)), today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return sameDay ? time : tomorrow ? "Tomorrow " + time : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " " + time;
  };
  const localInput = (t) => { if (!t) return ""; const d = new Date(ts(t)); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const dateIn = (days) => { const d = new Date(Date.now() + days * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const open = (j) => j.stage !== "picked_up" && !j.closed;
  const $ = (s) => document.querySelector(s);

  function init(adapter) { A = adapter; }

  // ---------------- Bay cards and board bar ----------------
  /** Promised-by state: late, due within 2 hours, or later. */
  function promiseState(j) {
    if (!j.promised || !open(j)) return "";
    const left = ts(j.promised) - Date.now();
    return left < 0 ? "late" : left < 2 * 3600000 ? "soon" : "later";
  }
  function cardBits(j) {
    const st = promiseState(j);
    const due = st ? `<span class="wd-due wd-${st}" title="Promised by ${esc(new Date(ts(j.promised)).toLocaleString())}">${st === "late" ? "Late · was due " : "Due "}${esc(dueText(j.promised))}</span>` : "";
    const tech = j.tech ? `<span class="wd-tech" title="Technician: ${esc(j.tech.name)}">${esc(initials(j.tech.name))}</span>` : "";
    const svc = j.service ? `<span class="pill">${esc(j.service)}</span>` : "";
    return tech || due || svc ? `<span class="wd-bits">${tech}${svc}${due}</span>` : "";
  }
  const cardAttrs = (j) => `data-tech="${esc(j.tech?.id || "")}"`;
  /** Cards "My cars" hides. The pages' filters ask this so counts stay right. */
  const hidden = (card) => ui.mine && !!A?.me() && card.dataset.tech !== A.me();

  function boardBar(jobs) {
    const live = jobs.filter(open);
    const late = live.filter((j) => promiseState(j) === "late").length, soon = live.filter((j) => promiseState(j) === "soon").length;
    const mine = A.me() ? live.filter((j) => j.tech?.id === A.me()).length : 0;
    return `<div class="wd-bar">
      <button type="button" class="qf" data-wd-mine aria-pressed="${ui.mine}">My Cars<b>${mine}</b></button>
      ${late || soon ? `<span class="wd-due wd-${late ? "late" : "soon"}">${late ? `${late} late` : ""}${late && soon ? " · " : ""}${soon ? `${soon} due within 2 hours` : ""}</span>` : ""}
      <span class="wd-bar-gap"></span>
      <button type="button" class="btn sm" data-wd-alerts aria-pressed="${ui.alerts}" title="Sound and a notification when a customer replies or approves">${ui.alerts ? "🔔 Alerts On" : "🔕 Alerts Off"}</button>
      ${A.isOwner() ? `<button type="button" class="btn sm" data-wd-today>Today's Summary</button>` : ""}
    </div>`;
  }

  // ---------------- Alerts: customer replies and approvals ----------------
  function events(jobs) {
    const out = [];
    for (const j of jobs) {
      for (const m of j.messages || []) if (m.dir === "in") out.push({ key: j.id + "|m|" + ts(m.t), j, text: `${first(j.customer.name)} replied about the ${vehicle(j) || j.ro}` });
      if (j.approval) out.push({ key: j.id + "|a|" + ts(j.approval.t), j, text: `${first(j.customer.name)} answered the estimate for the ${vehicle(j) || j.ro}` });
    }
    return out;
  }
  /** Call after every refresh of the car list. The first call only remembers what is already there. */
  function watch(jobs) {
    const list = events(jobs);
    if (!ui.seen) { ui.seen = new Set(list.map((e) => e.key)); return; }
    const fresh = list.filter((e) => !ui.seen.has(e.key));
    fresh.forEach((e) => ui.seen.add(e.key));
    if (!fresh.length) return;
    const unseen = fresh.length;
    document.title = document.title.replace(/^\(\d+\) /, "");
    if (document.visibilityState !== "visible") document.title = `(${unseen}) ` + document.title;
    if (!ui.alerts) return;
    chime();
    const msg = fresh.length === 1 ? fresh[0].text : `${fresh.length} new customer replies`;
    A.toast?.(msg);
    try { if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification("Talk Shops", { body: msg, tag: "talkshops" }); } catch { /* not supported */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") document.title = document.title.replace(/^\(\d+\) /, ""); });
  let audio = null;
  function chime() {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.16].forEach((at, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = i ? 1046 : 784; o.type = "sine";
        g.gain.setValueAtTime(0.0001, audio.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.35);
        o.connect(g).connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.4);
      });
    } catch { /* no sound */ }
  }

  // ---------------- Check-in ----------------
  function checkinLookup() {
    return `<div class="wd-lookup"><label class="field">Returning customer? <small class="muted">(search name, phone, plate or VIN)</small>
      <input id="wd-find" type="search" autocomplete="off" placeholder="e.g. Delgado, 555-013 or 7KDL294"></label><div id="wd-found" aria-live="polite"></div></div>`;
  }
  function checkinFields() {
    const pk = A.shop()?.packages || [], crew = A.crew() || [];
    return `${pk.length ? `<label class="field full">Quick service <small class="muted">(optional, adds its items to the estimate)</small><select id="wd-svc"><option value="">None, diagnose the concern</option>${pk.map((p) => `<option value="${esc(p.id)}" data-fast="${p.fastLane ? 1 : 0}">${esc(p.name)} · ${money(p.lines.reduce((a, l) => a + l.rate * l.qty, 0))}</option>`).join("")}</select></label>
      <label class="chk full" id="wd-fast-row" hidden><input type="checkbox" id="wd-fast" checked> Fast lane: customer okayed the price at the counter, so skip diagnosis and approval and start the work</label>` : ""}
      <label class="field">Mileage in<input id="wd-miles" inputmode="numeric" maxlength="9" placeholder="e.g. 48,210"></label>
      <label class="field">Promised by <small class="muted">(optional)</small><input id="wd-promised" type="datetime-local"></label>
      ${crew.length ? `<label class="field">Technician<select id="wd-tech"><option value="">Not assigned</option>${crew.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("")}</select></label>` : ""}`;
  }
  function checkinValues() {
    const v = (id) => document.getElementById(id)?.value.trim() || "";
    const techId = v("wd-tech"), tech = (A.crew() || []).find((m) => m.id === techId);
    const promised = v("wd-promised");
    return {
      mileageIn: v("wd-miles"), ...(promised ? { promised: new Date(promised).toISOString() } : {}),
      ...(tech ? { tech: { id: tech.id, name: tech.name } } : {}),
      ...(v("wd-svc") ? { service: v("wd-svc"), fastLane: !!document.getElementById("wd-fast")?.checked } : {}),
    };
  }
  async function lookup(q) {
    const box = $("#wd-found"); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ""; return; }
    let rows = [];
    try { rows = await A.visits({ q }); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    // One row per customer and car, newest visit first.
    const seen = new Set(), uniq = rows.filter((r) => { const k = (r.customer.phone || r.customer.email || r.customer.name) + "|" + (r.vehicle?.vin || r.plate || vehicle(r)); if (seen.has(k)) return false; seen.add(k); return true; });
    ui.found = uniq;
    box.innerHTML = !uniq.length ? `<p class="muted">No past visits match. Fill in the form below.</p>`
      : `<ul class="wd-found">${uniq.slice(0, 6).map((r, i) => `<li><button type="button" class="wd-hit" data-wd-fill="${i}"><b>${esc(r.customer.name)}</b><span>${esc(vehicle(r) || "Vehicle")}${r.plate ? " · " + esc(r.plate) : ""}</span><small class="muted">Last visit ${shortDate(r.createdAt)}${r.mileage ? " · " + miles(r.mileage) : ""} · ${rows.filter((x) => x.customer.name === r.customer.name).length} visit(s)</small></button></li>`).join("")}</ul>`;
  }
  function fill(r) {
    const set = (k, v) => { const el = document.getElementById("ci-" + k); if (el && v != null) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); } };
    const c = r.customer;
    const pref = c.preference || (c.phone ? "sms" : "email");
    const ch = document.getElementById("ci-channel"); if (ch) { ch.value = pref; ch.dispatchEvent(new Event("change", { bubbles: true })); }
    set("name", c.name); set("phone", fmtPhone(c.phone)); set("email", c.email || "");
    set("year", r.vehicle?.year); set("make", r.vehicle?.make); set("model", r.vehicle?.model); set("plate", r.plate);
    set("vin", r.vehicle?.vin || ""); set("engine", r.vehicle?.engine || "");
    const box = $("#wd-found");
    if (box) box.innerHTML = `<p class="wd-note">Filled from ${esc(r.ro)} (${shortDate(r.createdAt)}).${r.mileage ? ` Last mileage ${miles(r.mileage)}.` : ""}${r.declined?.length ? ` <b>Declined last time:</b> ${esc(r.declined.join(", "))}.` : ""} Confirm consent below before saving.</p>`;
  }
  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p || ""; };

  // ---------------- Car sheet ----------------
  function sheetDetails(j) {
    const crew = A.crew() || [], live = open(j);
    const st = promiseState(j);
    return `<section class="sec wd-details" data-wd-job="${esc(j.id)}"><h3>Job Details <span class="sec-sub">Shop only</span></h3>
      <div class="wd-grid">
        ${crew.length ? `<label class="field">Technician<select data-wd-set="tech" ${live ? "" : "disabled"}><option value="">Not assigned</option>${crew.map((m) => `<option value="${esc(m.id)}" ${j.tech?.id === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}${j.tech && !crew.some((m) => m.id === j.tech.id) ? `<option selected value="${esc(j.tech.id)}">${esc(j.tech.name)}</option>` : ""}</select></label>` : ""}
        <label class="field">Promised by${st === "late" ? ' <span class="wd-due wd-late">Late</span>' : st === "soon" ? ' <span class="wd-due wd-soon">Due soon</span>' : ""}<input type="datetime-local" data-wd-set="promised" value="${esc(localInput(j.promised))}" ${live ? "" : "disabled"}></label>
        <label class="field">Mileage in<input inputmode="numeric" maxlength="9" data-wd-set="mileageIn" value="${esc(j.mileageIn ? Number(j.mileageIn).toLocaleString("en-US") : "")}" placeholder="Odometer at drop-off"></label>
        <label class="field">Mileage out<input inputmode="numeric" maxlength="9" data-wd-set="mileageOut" value="${esc(j.mileageOut ? Number(j.mileageOut).toLocaleString("en-US") : "")}" placeholder="At pickup"></label>
      </div>
      ${j.service ? `<p class="muted" style="margin:6px 0 0">Quick service: <b>${esc(j.service)}</b></p>` : ""}
      <div class="btn-row" style="margin-top:8px"><button type="button" class="btn sm" data-wd-print="order">Print Work Order</button>${j.bill || j.estimate.some((e) => e.status === "approved") ? `<button type="button" class="btn sm" data-wd-print="bill">Print Bill</button>` : ""}</div>
    </section>`;
  }
  async function saveDetail(el) {
    const id = el.closest("[data-wd-job]")?.dataset.wdJob, k = el.dataset.wdSet;
    let v = el.value.trim();
    if (k === "tech") { const m = (A.crew() || []).find((x) => x.id === v); v = m ? { id: m.id, name: m.name } : null; }
    if (k === "promised") v = v ? new Date(v).toISOString() : "";
    const j = await A.act(id, "details", { [k]: v });
    if (j) A.toast?.(k === "tech" ? (v ? "Assigned to " + v.name : "Unassigned") : k === "promised" ? (v ? "Promised time saved" : "Promised time cleared") : "Mileage saved");
  }

  /** Past visits of this car or customer. Loads on first view. */
  function visitsSection(j) {
    const v = ui.visits[j.id];
    if (!v) { setTimeout(() => loadVisits(j), 0); return `<section class="sec" id="wd-visits"><h3>Past Visits</h3><p class="muted" style="margin:0">Looking up past visits…</p></section>`; }
    if (v.err) return `<section class="sec" id="wd-visits"><h3>Past Visits</h3><p class="muted" style="margin:0">${esc(v.err)}</p></section>`;
    if (!v.rows.length) return `<section class="sec" id="wd-visits"><h3>Past Visits</h3><p class="muted" style="margin:0">First visit. Past visits by this phone number, plate or VIN show here.</p></section>`;
    return `<section class="sec" id="wd-visits"><h3>Past Visits <span class="sec-sub">${v.rows.length}</span></h3><ul class="wd-visits">${v.rows.slice(0, 8).map((r) => `<li>
      <div><b>${shortDate(r.createdAt)}</b> · <span class="mono">${esc(r.ro)}</span>${r.mileage ? " · " + miles(r.mileage) : ""}${r.total ? " · " + money(r.total) : ""}</div>
      <div>${esc(r.concern || "")}${vehicle(r) && vehicle(r) !== vehicle(j) ? ` <small class="muted">(${esc(vehicle(r))})</small>` : ""}</div>
      ${r.declined?.length ? `<div class="wd-declined">Declined: ${esc(r.declined.join(", "))}</div>` : ""}</li>`).join("")}</ul></section>`;
  }
  async function loadVisits(j) {
    if (ui.visits[j.id]) return;
    ui.visits[j.id] = { loading: true, rows: [] };
    try { ui.visits[j.id] = { rows: await A.visits({ phone: j.customer.phone, plate: j.plate, vin: j.vehicle?.vin, exclude: j.id }) }; }
    catch (e) { ui.visits[j.id] = { err: e.message || "Past visits are unavailable.", rows: [] }; }
    const el = document.getElementById("wd-visits");
    if (el && el.closest("[data-job]")?.dataset.job === j.id) el.outerHTML = visitsSection(j);
  }

  /** Reminder texts: declined work and the next service. */
  function followupSection(j) {
    if (j.stage === "invited") return "";
    const list = (j.followups || []).slice().sort((a, b) => ts(b.due) - ts(a.due));
    const declined = j.estimate.filter((e) => e.status === "declined").map((e) => e.item);
    const off = j.customer.remindersOff;
    const rows = list.map((f) => `<li><span class="pill ${f.sentAt ? "ok" : f.canceledAt ? "bad" : "warn"}">${f.sentAt ? "Sent" : f.canceledAt ? (f.canceledBy === "customer" ? "Customer stopped" : "Canceled") : "Waiting"}</span>
      <b>${f.kind === "declined" ? "Declined work" : "Next service"}</b> · ${f.sentAt ? shortDate(f.sentAt) : shortDate(f.due)}<p>${esc(f.text)}</p>
      ${!f.sentAt && !f.canceledAt ? `<button type="button" class="linkbtn" data-wd-cancel="${esc(f.id)}">Cancel</button>` : ""}</li>`).join("");
    const can = j.customer.consent && !off;
    return `<section class="sec" data-wd-job="${esc(j.id)}"><h3>Reminder Texts</h3>
      ${rows ? `<ul class="wd-fu">${rows}</ul>` : `<p class="muted" style="margin:0">${declined.length ? `${esc(first(j.customer.name))} declined ${esc(declined.join(", "))}. Schedule a friendly reminder to bring them back.` : "Schedule an oil change or next-service reminder."}</p>`}
      ${off ? `<p class="muted">${esc(first(j.customer.name))} turned off reminder texts.</p>` : !j.customer.consent ? `<p class="muted">The customer has not agreed to messages.</p>` : `<details class="wd-fu-add"${!rows && declined.length ? " open" : ""}><summary>Schedule a reminder</summary>
        <div class="wd-grid"><label class="field">Type<select id="wd-fu-kind"><option value="declined" ${declined.length ? "selected" : ""}>Declined work</option><option value="service" ${declined.length ? "" : "selected"}>Next service</option></select></label>
        <label class="field">Send on<input type="date" id="wd-fu-due" value="${dateIn(declined.length ? 30 : 90)}" min="${dateIn(1)}" max="${dateIn(360)}"></label></div>
        <div class="btn-row wd-chips">${[[30, "1 month"], [90, "3 months"], [180, "6 months"]].map(([d, l]) => `<button type="button" class="btn sm" data-wd-due="${d}">${l}</button>`).join("")}</div>
        <label class="field">Text<textarea id="wd-fu-text" maxlength="480">${esc(reminderText(j, declined.length ? "declined" : "service"))}</textarea><span class="hint">Ends with "Reply STOP to opt out." ${esc(first(j.customer.name))} can also stop reminders from their page.</span></label>
        <button type="button" class="btn primary" data-wd-schedule ${can ? "" : "disabled"}>Schedule Text</button></details>`}
    </section>`;
  }
  function reminderText(j, kind) {
    const shop = A.shop() || {}, car = vehicle(j) || "car", phone = shop.phone ? ` Call ${shop.phone} or reply` : " Reply";
    const declined = j.estimate.filter((e) => e.status === "declined").map((e) => e.item.toLowerCase());
    if (kind === "declined" && declined.length) return `Hi ${first(j.customer.name)}, it's ${shop.name || "your shop"}. When your ${car} was in, we recommended ${declined.join(" and ")}. Want us to take care of it?${phone} to set up a time.`;
    const next = j.mileageOut || j.mileageIn ? ` or around ${(Number(j.mileageOut || j.mileageIn) + 5000).toLocaleString("en-US")} miles` : "";
    return `Hi ${first(j.customer.name)}, your ${car} is coming due for its next oil change${next}. ${shop.name || "We"} would be glad to help.${phone} to book.`;
  }

  // ---------------- Notes ----------------
  const noteToggle = () => `<label class="chk"><input type="checkbox" id="noteInternal"> Shop only: the customer never sees this note</label>`;
  const noteBadge = (n) => n.internal ? `<span class="pill warn">Shop only</span> ` : "";

  // ---------------- Pickup ----------------
  const pickupField = (j) => `<label class="field">Mileage out <small class="muted">(optional)</small><input id="m-miles" inputmode="numeric" maxlength="9" value="${esc(j.mileageOut || "")}" placeholder="${j.mileageIn ? "In: " + Number(j.mileageIn).toLocaleString("en-US") : "Odometer at pickup"}"></label>`;
  const pickupValue = () => { const el = document.getElementById("m-miles"); return el && el.value.trim() ? { mileageOut: el.value.trim() } : {}; };

  // ---------------- Customer page ----------------
  function customerReminders(c) {
    const r = c.reminders;
    if (!r || (!r.waiting?.length && !r.off)) return "";
    return `<div class="c-card"><h3>Reminder texts</h3>${r.off ? `<p class="muted" style="margin:0">You turned off reminder texts from ${esc(c.shop?.name || "this shop")}.</p>`
      : `<p style="margin:0">${esc(c.shop?.name || "The shop")} will remind you about ${r.waiting.map((w) => `${w.kind === "declined" ? "the work you put off" : "your next service"} around ${shortDate(w.due)}`).join(" and ")}.</p>
      <button type="button" class="btn" data-wd-stop style="margin-top:10px">Stop reminder texts</button><p class="muted" style="font-size:13px;margin:6px 0 0">You can also reply STOP to any text.</p>`}</div>`;
  }

  // ---------------- Quick services (Settings) ----------------
  function packagesPanel() {
    const shop = A.shop() || {}, pk = shop.packages || [];
    const rates = (shop.rates || []).filter((r) => r.kind !== "percent");
    return `<section class="panel" id="wd-packages"><h2>Quick Services</h2>
      <p class="muted" style="margin:0">Bundles like "Oil change + rotation" that check in with one tap and add their items to the estimate. Fast lane ones skip diagnosis and approval because the customer okays the price at the counter.</p>
      ${pk.length ? `<ul class="wd-pk">${pk.map((p) => `<li><div><b>${esc(p.name)}</b>${p.fastLane ? ' <span class="pill ok">Fast lane</span>' : ""}<small class="muted">${esc(p.lines.map((l) => l.name).join(" · "))}</small></div><span>${money(p.lines.reduce((a, l) => a + l.rate * l.qty, 0))}</span><button type="button" class="linkbtn" data-wd-pk-del="${esc(p.id)}">Remove</button></li>`).join("")}</ul>` : ""}
      ${rates.length ? `<details class="wd-pk-add"${pk.length ? "" : " open"}><summary>Add a quick service</summary>
        <label class="field">Name<input id="wd-pk-name" maxlength="60" placeholder="e.g. Oil change + tire rotation"></label>
        <fieldset class="wd-pk-items"><legend>Items from your saved list</legend>${rates.map((r, i) => `<label class="chk"><input type="checkbox" data-wd-pk-item="${i}"> ${esc(r.name)} <span class="muted">${r.kind === "labor" ? money(r.rate) + "/hr" + (r.hours ? " × " + r.hours : "") : money(r.rate)}</span></label>`).join("")}</fieldset>
        <label class="chk"><input type="checkbox" id="wd-pk-fast" checked> Fast lane (skip diagnosis and approval)</label>
        <button type="button" class="btn primary" data-wd-pk-add>Save Quick Service</button></details>` : `<p class="muted">Add saved items first, then bundle them here.</p>`}
    </section>`;
  }
  async function savePackages(list) { await A.saveShop({ packages: list }); }

  // ---------------- Printing ----------------
  function print(kind, j) {
    const shop = A.shop() || {};
    const lines = kind === "bill" && j.bill?.lines ? j.bill.lines.map((l) => ({ item: l.name, qty: l.qty, price: l.kind === "percent" ? null : Math.round(l.rate * l.qty * 100) / 100, pct: l.kind === "percent" ? l.rate : null }))
      : j.estimate.filter((e) => kind === "order" || e.status === "approved").map((e) => ({ item: e.item, status: e.status, price: e.price }));
    const total = kind === "bill" ? (j.bill?.total ?? lines.reduce((a, l) => a + (l.price || 0), 0)) : j.estimate.filter((e) => e.status !== "declined").reduce((a, e) => a + e.price, 0);
    const walk = (j.walkthroughs?.after || j.walkthroughs?.before);
    const row = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(j.ro)} ${kind === "bill" ? "Bill" : "Work Order"}</title><style>
      body{font:13px/1.45 -apple-system,"Segoe UI",Arial,sans-serif;color:#111;margin:28px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
      .top{display:flex;justify-content:space-between;gap:20px}.ro{text-align:right}.ro b{font-size:18px}table{border-collapse:collapse;width:100%}th{text-align:left;font-weight:600;padding:3px 8px 3px 0;width:120px;vertical-align:top}td{padding:3px 0}
      .lines th,.lines td{border-bottom:1px solid #ddd;padding:6px 4px;width:auto}.num{text-align:right}.total td{font-weight:700;border:0;font-size:15px}.sig{display:flex;gap:40px;margin-top:40px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px}
      .muted{color:#555}@media print{body{margin:12mm}}</style></head><body>
      <div class="top"><div><h1>${esc(shop.name || "Repair shop")}</h1><div class="muted">${esc([shop.phone, shop.hours].filter(Boolean).join(" · "))}</div></div>
      <div class="ro"><b>${kind === "bill" ? "Final Bill" : "Work Order"}</b><br>${esc(j.ro)}<br>${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div></div>
      <h2>Customer and vehicle</h2><table>${row("Customer", j.customer.name)}${row("Phone", fmtPhone(j.customer.phone))}${row("Email", j.customer.email)}${row("Vehicle", vehicle(j))}${row("VIN", j.vehicle?.vin)}${row("Plate", j.plate)}
        ${row("Mileage in", j.mileageIn && miles(j.mileageIn))}${row("Mileage out", j.mileageOut && miles(j.mileageOut))}${kind === "order" ? row("Promised by", j.promised && new Date(ts(j.promised)).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + row("Technician", j.tech?.name) : ""}
        ${row("Checked in", shortDate(j.createdAt || j.events?.[0]?.t))}</table>
      <h2>Concern</h2><p>${esc(j.concern || "")}</p>
      <h2>${kind === "bill" ? "Charges" : "Work"}</h2>${lines.length ? `<table class="lines"><thead><tr><th>Item</th>${kind === "order" ? "<th>Status</th>" : "<th class=num>Qty</th>"}<th class="num">Price</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(l.item)}</td>${kind === "order" ? `<td>${esc({ pending: "Pending", approved: "Approved", declined: "Declined" }[l.status] || "")}</td>` : `<td class="num">${l.qty ?? 1}</td>`}<td class="num">${l.pct != null ? l.pct + "%" : money(l.price)}</td></tr>`).join("")}
        <tr class="total"><td colspan="2" class="num">${kind === "bill" ? "Total" : "Estimate (not declined)"}</td><td class="num">${money(total)}</td></tr></tbody></table>` : `<p class="muted">No line items yet.</p>`}
      ${j.approval ? `<p class="muted">Approved by ${esc(j.approval.by)} on ${shortDate(j.approval.t)}.</p>` : ""}
      ${walk ? `<h2>Walk-through</h2><p>${esc(walk.summary || walk.items.filter((i) => i.status !== "good").map((i) => i.key + (i.note ? ": " + i.note : "")).join("; ") || "All checked items good.")}</p>` : ""}
      ${kind === "order" ? `<h2>Technician notes</h2><div style="min-height:90px;border:1px solid #ccc;border-radius:4px;padding:6px">${(j.notes || []).map((n) => esc(n.text)).join("<br>")}</div>
        <div class="sig"><div>Customer authorization</div><div>Technician</div></div>` : `<div class="sig"><div>Customer signature</div><div>Date</div></div>`}
      </body></html>`;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { /* blocked */ } setTimeout(() => f.remove(), 60000); }, 250);
  }

  // ---------------- End of day ----------------
  function todaySummary(jobs) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = (t) => t && ts(t) >= start.getTime();
    const inToday = jobs.filter((j) => today(j.createdAt || j.events?.[0]?.t));
    const outToday = jobs.filter((j) => j.stage === "picked_up" && today(j.events.filter((e) => e.stage === "picked_up").at(-1)?.t));
    const decided = jobs.filter((j) => j.approval && today(j.approval.t));
    const approved = decided.reduce((a, j) => a + j.estimate.filter((e) => e.status === "approved").reduce((s, e) => s + e.price, 0), 0);
    const declined = decided.reduce((a, j) => a + j.estimate.filter((e) => e.status === "declined").reduce((s, e) => s + e.price, 0), 0);
    const billed = outToday.reduce((a, j) => a + (j.bill?.total ?? j.estimate.filter((e) => e.status === "approved").reduce((s, e) => s + e.price, 0)), 0);
    const hours = outToday.map((j) => (ts(j.events.filter((e) => e.stage === "picked_up").at(-1).t) - ts(j.createdAt || j.events[0].t)) / 3600000);
    const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
    const live = jobs.filter(open);
    const late = live.filter((j) => promiseState(j) === "late");
    const texts = jobs.reduce((a, j) => a + (j.messages || []).filter((m) => m.dir === "out" && today(m.t)).length, 0);
    const byTech = {};
    for (const j of outToday) { const n = j.tech?.name || "Unassigned"; byTech[n] = (byTech[n] || 0) + 1; }
    const tile = (n, l) => `<div class="wd-tile"><b>${n}</b><span>${l}</span></div>`;
    return `<div class="wd-tiles">${tile(inToday.length, "Checked in")}${tile(outToday.length, "Picked up")}${tile(money(billed), "Picked-up total")}${tile(money(approved), "Approved today")}${tile(money(declined), "Declined today")}${tile(avg ? (avg < 24 ? avg.toFixed(1) + " h" : (avg / 24).toFixed(1) + " d") : "–", "Avg. time in shop")}${tile(live.length, "Still in the shop")}${tile(texts, "Updates sent")}</div>
      ${Object.keys(byTech).length ? `<p><b>Cars finished by tech:</b> ${Object.entries(byTech).map(([n, c]) => `${esc(n)} ${c}`).join(" · ")}</p>` : ""}
      ${late.length ? `<p class="wd-declined"><b>Past their promised time:</b> ${late.map((j) => `${esc(vehicle(j))} (${esc(j.ro)})`).join(", ")}</p>` : ""}
      ${declined ? `<p class="muted">Tip: open cars with declined work and schedule a reminder text so that work comes back.</p>` : ""}`;
  }
  function openToday() {
    let d = document.getElementById("wd-today");
    if (!d) { d = document.createElement("dialog"); d.id = "wd-today"; d.className = "wd-dialog"; document.body.appendChild(d); }
    d.innerHTML = `<form method="dialog"><div class="wd-dialog-h"><h2>Today at ${esc(A.shop()?.name || "the shop")}</h2><button class="x" aria-label="Close">×</button></div>${todaySummary(A.jobs())}<div class="btn-row"><button class="btn primary">Done</button></div></form>`;
    d.showModal();
  }

  // ---------------- Events ----------------
  document.addEventListener("click", async (e) => {
    if (!A) return;
    const t = e.target.closest("[data-wd-mine],[data-wd-alerts],[data-wd-today],[data-wd-fill],[data-wd-print],[data-wd-due],[data-wd-schedule],[data-wd-cancel],[data-wd-stop],[data-wd-pk-add],[data-wd-pk-del]");
    if (!t) return;
    if (t.hasAttribute("data-wd-mine")) {
      if (!A.me()) return;
      ui.mine = !ui.mine; try { localStorage.setItem("ts-mine", ui.mine ? "1" : "0"); } catch { /* */ }
      t.setAttribute("aria-pressed", String(ui.mine)); A.filter?.(); return;
    }
    if (t.hasAttribute("data-wd-alerts")) {
      ui.alerts = !ui.alerts; try { localStorage.setItem("ts-alerts", ui.alerts ? "1" : "0"); } catch { /* */ }
      if (ui.alerts) { chime(); try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch { /* */ } }
      t.setAttribute("aria-pressed", String(ui.alerts)); t.textContent = ui.alerts ? "🔔 Alerts On" : "🔕 Alerts Off";
      A.toast?.(ui.alerts ? "You'll hear a chime when a customer replies or approves" : "Alerts off"); return;
    }
    if (t.hasAttribute("data-wd-today")) { openToday(); return; }
    if (t.dataset.wdFill) { const r = ui.found?.[+t.dataset.wdFill]; if (r) fill(r); return; }
    const jobId = t.closest("[data-wd-job]")?.dataset.wdJob || t.closest("[data-job]")?.dataset.job;
    if (t.dataset.wdPrint) { const j = A.job(jobId); if (j) print(t.dataset.wdPrint, j); return; }
    if (t.dataset.wdDue) { const el = document.getElementById("wd-fu-due"); if (el) el.value = dateIn(+t.dataset.wdDue); return; }
    if (t.hasAttribute("data-wd-schedule")) {
      const body = { kind: $("#wd-fu-kind").value, due: $("#wd-fu-due").value, text: $("#wd-fu-text").value.trim() };
      t.disabled = true;
      const j = await A.act(jobId, "followup", body);
      t.disabled = false;
      if (j) A.toast?.("Reminder scheduled for " + shortDate(body.due + "T12:00:00"));
      return;
    }
    if (t.dataset.wdCancel) { const j = await A.act(jobId, "followup", { cancel: t.dataset.wdCancel }); if (j) A.toast?.("Reminder canceled"); return; }
    if (t.hasAttribute("data-wd-stop")) { t.disabled = true; try { await A.stopReminders(); A.toast?.("Reminder texts are off"); } catch (err) { A.toast?.(err.message); t.disabled = false; } return; }
    if (t.hasAttribute("data-wd-pk-add")) {
      const name = $("#wd-pk-name").value.trim(), rates = (A.shop().rates || []).filter((r) => r.kind !== "percent");
      const lines = [...document.querySelectorAll("[data-wd-pk-item]:checked")].map((c) => rates[+c.dataset.wdPkItem]).filter(Boolean)
        .map((r) => ({ name: r.name, kind: r.kind, rate: r.rate, ...(r.hours ? { hours: r.hours } : {}), qty: r.kind === "labor" && r.hours ? r.hours : 1 }));
      if (!name || !lines.length) { A.toast?.("Name it and pick at least one item"); return; }
      try { await savePackages([...(A.shop().packages || []), { name, lines, fastLane: $("#wd-pk-fast").checked }]); A.toast?.("Quick service saved"); } catch (err) { A.toast?.(err.message); }
      return;
    }
    if (t.dataset.wdPkDel) { try { await savePackages((A.shop().packages || []).filter((p) => p.id !== t.dataset.wdPkDel)); A.toast?.("Removed"); } catch (err) { A.toast?.(err.message); } return; }
  });
  document.addEventListener("change", (e) => {
    if (!A) return;
    const t = e.target;
    if (t.dataset?.wdSet) { saveDetail(t); return; }
    if (t.id === "wd-svc") {
      const opt = t.selectedOptions[0], row = document.getElementById("wd-fast-row"), concern = document.getElementById("ci-concern");
      if (row) row.hidden = !t.value || opt.dataset.fast !== "1";
      if (concern) { concern.required = !t.value; if (t.value && !concern.value.trim()) concern.placeholder = opt.textContent.split(" · ")[0]; }
      return;
    }
    if (t.id === "wd-fu-kind") { const j = A.job(t.closest("[data-wd-job]")?.dataset.wdJob); if (j) $("#wd-fu-text").value = reminderText(j, t.value); }
  });
  document.addEventListener("input", (e) => {
    if (!A || e.target.id !== "wd-find") return;
    clearTimeout(ui.lookupT);
    const q = e.target.value;
    ui.lookupT = setTimeout(() => lookup(q), 300);
  });

  /** Forget cached visit lists (after a check-in, say). */
  const forget = (id) => { if (id) delete ui.visits[id]; else ui.visits = {}; };

  window.Workday = { init, cardBits, cardAttrs, hidden, boardBar, watch, checkinLookup, checkinFields, checkinValues, sheetDetails, visitsSection, followupSection,
    noteToggle, noteBadge, pickupField, pickupValue, customerReminders, packagesPanel, print, todaySummary, forget, promiseState };
})();
