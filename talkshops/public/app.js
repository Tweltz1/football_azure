// Talk Shops: progress updates from repair shops to their customers. A plain page, no build step.
// Shop staff sign in with Supabase; customers open /?c=<token> from their text and never sign in.
// All data goes through the shared API (supabase/functions/_shared/shop.ts in this repo).
(function () {
  "use strict";
  const CFG = window.BAY_CONFIG || {};
  const DEMO_PAGE = "/demo.html";
  const DEMO_VIDEO = "/demo.mp4";
  const STAGES = [
    { key: "invited", label: "Customer invited", cust: "Check in for your repair" },
    { key: "checked_in", label: "Checked in", cust: "We have your car" },
    { key: "diagnosing", label: "Diagnosing", cust: "Inspecting your car" },
    { key: "approval", label: "Approval needed", cust: "Waiting on your approval" },
    { key: "parts", label: "Waiting on parts", cust: "Waiting on parts" },
    { key: "in_progress", label: "In progress", cust: "Repairs underway" },
    { key: "qc", label: "Quality check", cust: "Final check and road test" },
    { key: "ready", label: "Ready for pickup", cust: "Ready for pickup" },
    { key: "picked_up", label: "Picked up", cust: "Picked up" },
  ];
  const SI = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const billing = window.createShopBilling({ esc, money });
  const chargeDetail = e => e.charge ? `<small class="charge-detail">${esc(billing.calculation(e.charge))}</small>` : "";
  const ts = (t) => (typeof t === "number" ? t : Date.parse(t));
  const clock = (t) => new Date(ts(t)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayClock = (t) => { const d = new Date(ts(t)); return d.toDateString() === new Date().toDateString() ? clock(t) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + clock(t); };
  const since = (t) => { const m = Math.max(0, Math.round((Date.now() - ts(t)) / 60000)); if (m < 60) return m + "m"; const h = Math.floor(m / 60); if (h < 48) return h + "h " + (m % 60) + "m"; return Math.floor(h / 24) + "d"; };
  const vehicleStr = (j) => [j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" ");
  const estTotal = (j, approvedOnly) => j.estimate.filter((e) => !approvedOnly || e.status === "approved").reduce((a, e) => a + Number(e.price), 0);
  const awaitingDecision = (j) => j.stage === "approval" && j.estimate.some((e) => e.status === "pending");
  function estimateOutcome(j) {
    if (!j.estimate.length || j.estimate.some((e) => e.status === "pending")) return "";
    const approved = j.estimate.filter((e) => e.status === "approved").length;
    if (approved === j.estimate.length) return "Estimate approved";
    return approved ? "Estimate partially approved" : "Estimate declined";
  }
  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || ""); };
  const contact = c => [c.preference !== "email" && fmtPhone(c.phone), c.preference !== "sms" && c.email].filter(Boolean).join(" and ");
  const channelName = m => m.channel === "email" ? "Email" : "Text";
  function sendResult(j) {
    const count = j.customer.preference === "both" ? 2 : 1;
    return j.messages.slice(-count).map(m => m.delivery === "sent" ? channelName(m) + " sent" : channelName(m) + " not sent" + (m.note ? ": " + String(m.note).replace(/[.\s]+$/, "") : "")).join(". ") + ".";
  }
  const first = (name) => String(name || "").split(/\s+/)[0];

  const sb = window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

  async function api(method, path, body) {
    if (!CFG.apiUrl) throw new Error("This site is missing its server settings.");
    const headers = { "Content-Type": "application/json" };
    if (sb) {
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.Authorization = "Bearer " + token;
    }
    const res = await fetch(CFG.apiUrl.replace(/\/$/, "") + "/" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* plain text */ }
    if (!res.ok) { const err = new Error(typeof data === "string" && data ? data : "Something went wrong (" + res.status + ")."); err.status = res.status; throw err; }
    return data;
  }

  let toastT;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3000);
  }

  // ---------------- Video demo (shared by sign-in and the customer page) ----------------
  function videoModal() {
    return `<div class="modal video-modal" data-close-modal><div class="modal-card wide" role="dialog" aria-modal="true" aria-label="Talk Shops demo video">
      <div style="display:flex;align-items:center;gap:10px"><h2 style="margin-right:auto">See Talk Shops in action</h2><button class="x" data-close-modal aria-label="Close">×</button></div>
      <video src="${DEMO_VIDEO}" controls autoplay playsinline preload="metadata"></video>
      <p class="muted" style="margin:0;font-size:13.5px">A walkthrough with narration: checking in a car, sending an estimate, the customer approving it from their text link, and moving the car to ready for pickup. Turn your sound on.</p>
      <div class="btn-row"><a class="btn primary" href="${DEMO_PAGE}" style="text-decoration:none">Try the demo shop yourself</a></div>
    </div></div>`;
  }

  // ==================== Customer page (no sign-in) ====================
  const custToken = new URLSearchParams(location.search).get("c");
  const cust = { intakeDraft: {}, intakeBusy: false, data: null, draft: {}, sig: "", error: "" };

  async function loadCustomer() {
    try {
      const previous = cust.data;
      const latest = await api("GET", "shop/c/" + encodeURIComponent(custToken));
      if (cust.intakeBusy || cust.data !== previous || document.activeElement?.closest("#intakeForm")) return;
      cust.data = latest; cust.error = "";
    }
    catch (e) { cust.error = e.status === 404 ? "This link isn't valid anymore. Please call the shop." : e.message; }
    renderCustomer();
  }

  function photoFigure(p, staff = false) {
    return `<figure class="photo"><img class="img" loading="lazy" src="${esc(p.src)}" alt="${esc(p.cap)}">
      <figcaption>${esc(p.cap)}${p.source === "customer" ? "<small>From customer</small>" : ""}${p.addedAt ? `<small>${dayClock(p.addedAt)}</small>` : ""}
      ${staff ? `<button type="button" class="linkbtn" data-remove-photo="${esc(p.id)}" aria-label="Remove ${esc(p.cap)}">Remove photo</button>` : ""}</figcaption></figure>`;
  }

  function photoFolder(key, label, photos, openFolders) {
    if (!photos.length) return "";
    return `<details class="photo-folder" data-folder="${key}" ${openFolders.has(key) ? "open" : ""}>
      <summary>📁 ${label} · ${photos.length} photo${photos.length === 1 ? "" : "s"}</summary>
      <div class="folder-images">${photos.map((p) => photoFigure(p)).join("")}</div></details>`;
  }

  function intakeForm() {
    const field = (name,label,max,required=false) => `<label class="field">${label}<input name="${name}" maxlength="${max}" ${required ? "required" : ""} value="${esc(cust.intakeDraft[name] || "")}"></label>`;
    return `<form id="intakeForm" class="form-grid">
      ${field("year","Vehicle year",4)}${field("make","Make",40,true)}${field("model","Model",40,true)}${field("plate","License plate (optional)",12)}
      <label class="field full">What should the technician look at?<textarea name="concern" required maxlength="1000">${esc(cust.intakeDraft.concern || "")}</textarea></label>
      <button class="btn primary" type="submit">Save check-in details</button></form>`;
  }

  function renderCustomer() {
    $("#shopChrome").hidden = true;
    const app = $("#app");
    if (cust.error && !cust.data) { app.innerHTML = `<div class="loading"><p>${esc(cust.error)}</p></div>`; return; }
    if (!cust.data) return;
    const j = cust.data, idx = SI[j.stage];
    const openFolders = new Set(Array.from(document.querySelectorAll(".photo-folder[open]"), (el) => el.dataset.folder));
    document.title = j.shop.name + " · Your " + j.vehicle;
    const outcome = estimateOutcome(j);
    const heading = j.closed ? "This repair was closed" : j.stage === "invited" && j.intakeReceived ? "Check-in details received" :
      j.stage === "approval" && outcome ? outcome : STAGES[idx].cust;
    const evAt = (k) => { const e = [...j.events].reverse().find((x) => x.stage === k); return e ? e.t : null; };
    const tl = STAGES.filter(s => s.key !== "invited" || evAt("invited")).filter((s) => s.key !== "picked_up" || evAt(s.key) || j.photos.some((p) => p.stage === s.key)).map((s) => {
      const decided = s.key === "approval" && outcome && evAt(s.key);
      const t = decided && j.approval ? j.approval.t : evAt(s.key);
      const cls = s.key === j.stage ? "current" : (t && SI[s.key] < idx ? "done" : "todo");
      const folder = photoFolder(s.key, "View photos", j.photos.filter((p) => p.stage === s.key), openFolders);
      return `<li class="${cls}"><span>${decided ? outcome : s.label}</span><time>${t ? dayClock(t) : ""}</time>${folder}</li>`;
    }).join("");
    const pending = awaitingDecision(j) && !j.closed;
    let est = "";
    if (j.estimate.length) {
      const items = j.estimate.map((e) => {
        const d = cust.draft[e.id];
        const choice = pending && e.status === "pending"
          ? `<div class="decide"><button class="yes" data-decide="${e.id}" data-v="approved" aria-pressed="${d === "approved"}">Approve</button><button class="no" data-decide="${e.id}" data-v="declined" aria-pressed="${d === "declined"}">Decline</button></div>`
          : (e.status !== "pending" ? `<span class="pill ${e.status === "approved" ? "ok" : "bad"}">${e.status === "approved" ? "Approved" : "Declined"}</span>` : "");
        return `<div class="est-item"><div class="top"><span>${esc(e.item)}${chargeDetail(e)}</span><span>${money(e.price)}</span></div>${choice}</div>`;
      }).join("");
      const allChosen = j.estimate.filter((e) => e.status === "pending").every((e) => cust.draft[e.id]);
      const tot = pending ? j.estimate.reduce((a, e) => a + ((cust.draft[e.id] ?? e.status) === "approved" ? Number(e.price) : 0), 0) : estTotal(j, true);
      est = `<div class="c-card"><h3>Estimate</h3>${items}<div class="total"><span>${pending ? "Approved so far" : "Approved total"}</span><span>${money(tot)}</span></div>
        ${pending ? `<label class="field" style="margin-top:10px">Type your full name to sign<input id="sig" autocomplete="name" value="${esc(cust.sig)}"></label>
        <button class="btn primary" style="width:100%;margin-top:10px" id="submitApproval" ${allChosen ? "" : "disabled"}>Send my decision</button>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">${allChosen ? "Your signed decision goes straight to the shop." : "Choose approve or decline for each item."}</p>`
        : (j.approval ? `<p class="muted" style="font-size:12.5px;margin:8px 0 0">Signed by ${esc(j.approval.by)} on ${dayClock(j.approval.t)}</p>` : "")}</div>`;
    }
    const earlierPhotos = photoFolder("earlier", "Earlier photos", j.photos.filter((p) => !Object.hasOwn(SI, p.stage)), openFolders);
    const extra = j.stage === "parts" && j.eta ? `<p style="margin:6px 0 0">Parts expected <b>${esc(j.eta)}</b>.</p>`
      : j.stage === "ready" ? `<p style="margin:6px 0 0">${j.bill ? "Total due " + money(j.bill.total) : "Approved estimate " + money(estTotal(j, true))}.${j.shop.hours ? " Open " + esc(j.shop.hours) + "." : ""}</p>` : "";
    app.innerHTML = `<div class="cust-page">
      <div class="c-head"><small>${esc(j.shop.name)} · <span class="mono">${esc(j.ro)}</span></small><h2>${heading}</h2><div style="font-size:14px;margin-top:4px">${esc(j.vehicle)}</div>${extra}</div>
      <div class="c-body">
        ${j.stage === "invited" ? `<section class="c-card"><h3>Vehicle check-in</h3>${j.intakeReceived ? "<p>Your details have been sent to the shop.</p>" : intakeForm()}</section>` : ""}
        ${j.canUploadIntakePhotos ? `<section class="c-card"><h3>Photos for your technician</h3>
          <p>Show the damage, warning light or part you want checked.</p>
          <button type="button" id="customerPickPhoto" class="btn" ${j.photos.filter(p => p.source === "customer").length >= 6 ? "disabled" : ""}>Add photos</button>
          <small style="margin-left:10px">${j.photos.filter(p => p.source === "customer").length} of 6 photos added</small><p id="photoStatus" role="status" hidden></p></section>` : ""}
        ${billing.display(j.bill, j)}${est}
        ${(j.notes || []).length ? `<div class="c-card"><h3>Notes from your technician</h3><ul class="notes">${[...j.notes].reverse().map((n) => `<li><time>${dayClock(n.t)}</time><p>${esc(n.text)}</p></li>`).join("")}</ul></div>` : ""}
        <div class="c-card"><h3>Progress</h3><ul class="tl">${tl}</ul>${earlierPhotos}</div>
        ${j.concern ? `<div class="c-card"><h3>Your concern</h3><div style="font-size:14px">${esc(j.concern)}</div></div>` : ""}
        ${j.shop.phone ? `<div class="c-card call"><span>Questions? Call the shop</span><b>${esc(j.shop.phone)}</b></div>` : ""}
        <p class="cust-top">This page updates as your repair progresses.</p>
        <p class="cust-top"><a href="/privacy.html">Privacy policy</a></p>
      </div></div>`;
  }

  // ==================== Shop app (signed in) ====================
  const ui = { noteDraft: {}, view: "board", openJob: null, modal: null, authMode: "signin", authMsg: "", authErr: "", busy: false };
  const dictation = window.createDictation({ toast });
  const archive = { q: "", rows: null, keepDays: 365, loading: false, error: "", seq: 0 };
  const suggest = window.createSuggest({
    esc, money, items: () => (shop && shop.rates) || [],
    onPick(input, r) {
      if (input.dataset.suggest === "quick") {
        const form = input.form, price = $("#li-price");
        input.value = r.name;
        if (r.kind === "percent") { form.dataset.pick = ""; price.value = ""; toast("Percent items need a base amount. Use Add labor, parts or fees."); price.focus(); return; }
        form.dataset.pick = JSON.stringify(r);
        price.value = r.rate.toFixed(2);
        price.focus(); price.select();
        return;
      }
      billing.pickSaved(input, r);
    },
  });
  // Mirrors the server: new names (not already saved) join the shop's saved items, up to 250.
  function rememberLocal(list) {
    const rates = [...(shop.rates || [])], have = new Set(rates.map((r) => r.name.trim().toLowerCase()));
    for (const r of list) {
      const k = r.name.trim().toLowerCase();
      if (!k || have.has(k) || rates.length >= 250) continue;
      rates.push({ name: r.name.trim(), kind: r.kind, rate: r.rate }); have.add(k);
    }
    shop.rates = rates;
  }
  let session = null, shop = null, emailConfigured = false, jobs = [], loaded = false, loadErr = "";
  const job = (id) => jobs.find((j) => j.id === id);
  const upsertJob = (j) => { const i = jobs.findIndex((x) => x.id === j.id); if (i >= 0) jobs[i] = j; else jobs.push(j); };

  async function loadShop() {
    try {
      const me = await api("GET", "shop/me");
      shop = me.shop; emailConfigured = !!me.emailConfigured;
      jobs = shop ? await api("GET", "shop/jobs") : [];
      loadErr = "";
    } catch (e) { loadErr = e.message; }
    loaded = true;
    render();
  }

  function render() {
    if (custToken) return renderCustomer();
    const app = $("#app"), chrome = $("#shopChrome");
    document.title = "Talk Shops" + (shop ? " · " + shop.name : "");
    if (!session) { chrome.hidden = true; app.innerHTML = loginView(); renderLayer(); return; }
    if (!loaded) { chrome.hidden = true; app.innerHTML = `<div class="loading">Loading your shop…</div>`; return; }
    if (!shop) { chrome.hidden = true; app.innerHTML = setupView(true); renderLayer(); return; }
    chrome.hidden = false;
    $("#shopName").textContent = shop.name;
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.view === ui.view ? "page" : "false"));
    const err = loadErr ? `<div class="notice">${esc(loadErr)} <button class="linkbtn" id="retry">Try again</button></div>` : "";
    app.innerHTML = err + (ui.view === "checkin" ? checkinView() : ui.view === "settings" ? setupView(false) : ui.view === "archive" ? archiveView() : boardView());
    if (ui.view === "archive") { renderArchiveRows(); if (!archive.rows && !archive.loading) searchArchive(); }
    renderLayer();
  }

  const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
  const brand = () => `<div class="brand"><div class="brand-mark" aria-hidden="true">${$(".brand-mark").innerHTML}</div><div><h1>Talk Shops</h1><small>For repair shops</small></div></div>`;

  function loginView() {
    const signup = ui.authMode === "signup";
    const ico = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    return `<div class="auth"><aside class="hero">
      ${brand()}
      <div class="hero-copy">
        <h2>Keep every customer <em>in the loop.</em></h2>
        <p>Text customers as their car moves through your shop. They follow along and approve repairs from one private link, with no app and no login.</p>
        <ul class="hero-list">
          <li>${ico('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}Automatic text and email updates at every stage</li>
          <li>${ico('<path d="M20 6 9 17l-5-5"/>')}Estimates approved and signed from a phone</li>
          <li>${ico('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>')}One board for every car in the shop</li>
        </ul>
      </div>
      <div class="hero-chat" aria-hidden="true">
        <div class="o">Hi Maria, we found what's going on with your Civic. Review the estimate here: talkshops.app/s/…<small>Ridgeline Auto Repair</small></div>
        <div class="i">Approved the brakes, thanks!</div>
        <div class="o">Great. It'll be ready by 4pm.</div>
      </div>
    </aside><div class="login-wrap"><div class="login">
      <h2>${signup ? "Create your shop account" : "Shop sign in"}</h2>
      ${sb ? "" : `<p class="form-err">Sign-in isn't available on this copy of the site.</p>`}
      <button class="btn google" id="google" type="button">${googleIcon} Continue with Google</button>
      <div class="or">or use email</div>
      <form class="auth-alt" id="emailForm">
        <label class="field">Work email<input id="au-email" type="email" required autocomplete="username"></label>
        <label class="field">Password<input id="au-pass" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}"></label>
        <button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>${signup ? "Create account" : "Sign in"}</button>
      </form>
      ${ui.authErr ? `<p class="form-err" role="alert">${esc(ui.authErr)}</p>` : ""}
      ${ui.authMsg ? `<p class="form-ok" role="status">${esc(ui.authMsg)}</p>` : ""}
      <button class="linkbtn" id="authSwap" type="button" style="align-self:flex-start">${signup ? "Already have an account? Sign in" : "New shop? Create an account"}</button>
      <div class="demo-box">
        <b>Just looking?</b>
        <span class="muted" style="font-size:13.5px">Take a 3-minute guided tour with narration. Halfway through, you can get a real text and approve a repair from your own phone.</span>
        <div class="btn-row"><a class="btn primary" href="${DEMO_PAGE}?tour=1" style="text-decoration:none">▶ Guided demo</a><a class="btn" href="${DEMO_PAGE}" style="text-decoration:none">Try demo shop</a><button class="linkbtn" id="watchDemo" type="button">Watch video</button></div>
      </div>
      <p class="muted" style="font-size:13px;margin:0">Customers never sign in. They get a private link to their car's page.</p>
    </div></div></div>`;
  }

  function setupView(firstTime) {
    const s = shop || {};
    return `<div class="${firstTime ? "login-wrap" : ""}"><form class="${firstTime ? "login" : "panel"}" id="setupForm">
      ${firstTime ? brand() : ""}
      <h2>${firstTime ? "Set up your shop" : "Shop settings"}</h2>
      <p class="muted" style="margin:0">Customers see this name and phone number in notifications and on their car's page.</p>
      <label class="field">Shop name<input id="sh-name" required maxlength="80" value="${esc(s.name || "")}" placeholder="e.g. Ridgeline Auto Repair"></label>
      <label class="field">Shop phone<input id="sh-phone" inputmode="tel" maxlength="30" value="${esc(s.phone || "")}" placeholder="(555) 014-2290"></label>
      <label class="field">Hours<input id="sh-hours" maxlength="60" value="${esc(s.hours || "")}" placeholder="Mon–Fri 7:30am–6pm"></label>
      <label class="field">Shop email (optional)<input id="sh-email" type="email" maxlength="254" autocomplete="email" value="${esc(s.email || "")}" placeholder="service@yourshop.com"><span class="hint">When a customer replies to an email update, it goes here.</span></label>
      ${firstTime ? "" : `<button class="btn" type="button" data-billing="rates">Saved items: labor, parts and fees (import Excel or CSV)</button>`}
      <div class="btn-row"><button class="btn primary" type="submit">${firstTime ? "Open my shop board" : "Save"}</button>${firstTime ? `<button class="btn" type="button" id="signOut2">Sign out</button>` : ""}</div>
    </form></div>`;
  }

  function boardView() {
    const active = jobs.filter((j) => j.stage !== "picked_up" && !j.closed);
    const inShop = active.filter(j => j.stage !== "invited");
    const picked = jobs.filter((j) => j.stage === "picked_up" && !j.closed).length;
    if (!jobs.length) {
      return `<div class="empty-board"><h2>No cars yet</h2><p class="muted" style="margin:0;max-width:420px">Check in your first car. The customer gets a private link to follow along and approve work.</p><button class="btn primary" data-view="checkin">Check in a car</button></div>`;
    }
    const waiting = active.filter(awaitingDecision).length;
    const ready = active.filter((j) => j.stage === "ready").length;
    const today = new Date().toDateString();
    const sent = jobs.reduce((a, j) => a + j.messages.filter((m) => m.dir === "out" && m.delivery === "sent" && new Date(m.t).toDateString() === today).length, 0);
    let h = `<div class="stats">
      ${inShop.length === 1 ? `<button type="button" class="stat" data-open="${esc(inShop[0].id)}" aria-label="Open ${esc(vehicleStr(inShop[0]))}"><b>1</b><span>Cars in the shop</span></button>` : `<div class="stat"><b>${inShop.length}</b><span>Cars in the shop</span></div>`}
      <div class="stat warn"><b>${waiting}</b><span>Waiting on customer</span></div>
      <div class="stat ok"><b>${ready}</b><span>Ready for pickup</span></div>
      <div class="stat"><b>${sent}</b><span>Updates sent today</span></div></div>
      <div class="board-wrap"><div class="board">`;
    STAGES.filter((s) => s.key !== "picked_up").forEach((s) => {
      const list = active.filter((j) => j.stage === s.key);
      if (s.key === "invited" && !list.length) return;
      h += `<section class="col ${s.key === "approval" ? "is-approval" : ""} ${s.key === "ready" ? "is-ready" : ""}"><div class="col-h"><h3>${s.key === "approval" ? "Estimate review" : s.label}</h3><span>${list.length}</span></div>`;
      if (!list.length) h += `<div class="empty-col">No cars</div>`;
      list.forEach((j) => {
        const ev = j.events[j.events.length - 1];
        let pill = "";
        if (j.stage === "invited") pill = `<span class="pill">${j.intakeReceived ? "Intake received" : "Awaiting vehicle details"}</span>`;
        else if (j.stage === "approval" && estimateOutcome(j)) pill = `<span class="pill">${estimateOutcome(j)}</span>`;
        else if (awaitingDecision(j)) pill = `<span class="pill warn">Sent ${since(ev.t)} ago</span>`;
        else if (j.stage === "parts") pill = `<span class="pill">ETA ${esc(j.eta || "not set")}</span>`;
        const last = j.messages[j.messages.length - 1];
        const reply = last && last.dir === "in";
        h += `<button class="card" data-open="${j.id}">
          <span class="veh">${esc(vehicleStr(j) || "Vehicle details pending")}</span>
          <span class="row"><span>${esc(j.customer.name)}</span><span class="mono">${esc(j.ro)}</span></span>
          <span class="row"><span>${esc(j.concern)}</span></span>
          <span class="row"><span>${since(ev.t)} in stage</span>${reply ? `<span class="pill bad">New reply</span>` : ""}</span>${pill}</button>`;
      });
      h += `</section>`;
    });
    h += `</div></div><p class="muted" style="font-size:13px;margin-top:10px">${picked ? picked + " picked up in the last 2 days. " : ""}Tap a car to update its stage, build an estimate or message the customer. <button class="linkbtn" data-view="archive">Search picked-up cars</button></p>`;
    return h;
  }

  // ---------------- Archive: picked-up cars, kept one year ----------------
  function archiveView() {
    return `<section class="archive">
      <div class="archive-h"><h2>Archive</h2><p class="muted">Picked-up cars and repairs closed without work stay here for one year, then they are deleted automatically.</p></div>
      <label class="field archive-search">Search<input id="archiveQ" type="search" value="${esc(archive.q)}" placeholder="Customer, phone, email, vehicle, plate, RO number or concern" autocomplete="off"></label>
      <div id="archiveRows" aria-live="polite"></div></section>`;
  }
  const deleteDate = (t) => new Date(ts(t) + archive.keepDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  function renderArchiveRows() {
    const el = $("#archiveRows"); if (!el) return;
    if (archive.error) { el.innerHTML = `<div class="notice">${esc(archive.error)} <button class="linkbtn" data-archive-retry>Try again</button></div>`; return; }
    if (!archive.rows) { el.innerHTML = `<p class="muted">Loading…</p>`; return; }
    if (!archive.rows.length) { el.innerHTML = `<div class="empty-board"><p class="muted" style="margin:0">${archive.q.trim() ? "No picked-up cars match that search." : "No picked-up cars yet. When you move a car to Picked up, it lands here."}</p></div>`; return; }
    el.innerHTML = `<p class="muted archive-count">${archive.rows.length === 100 ? "Showing the 100 most recent matches" : archive.rows.length + " car" + (archive.rows.length === 1 ? "" : "s")}</p>
      <ul class="archive-list">${archive.rows.map((r) => {
        const veh = [r.vehicle?.year, r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(" ") || "Vehicle not recorded";
        return `<li class="archive-item"><button class="archive-row" data-archive-open="${esc(r.id)}">
          <span class="a-main"><b>${esc(veh)}</b>${r.plate ? `<span class="mono">${esc(r.plate)}</span>` : ""}</span>
          <span class="a-who">${esc(r.customer?.name || "")}${r.customer?.phone ? " · " + esc(fmtPhone(r.customer.phone)) : ""}${r.customer?.email ? " · " + esc(r.customer.email) : ""}</span>
          <span class="a-concern">${esc(r.concern || "")}</span>
          <span class="a-meta"><span class="mono">${esc(r.ro)}</span><span>${r.closedReason ? `<span class="pill bad">Closed</span> ${esc(r.closedReason)},` : "Picked up"} ${esc(new Date(ts(r.archivedAt)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</span>${r.total ? `<span>${money(r.total)}</span>` : ""}<span class="muted">Deletes ${deleteDate(r.archivedAt)}</span></span>
        </button><button class="archive-del" data-delete-archived="${esc(r.id)}" aria-label="Delete ${esc(r.ro)} permanently">Delete</button></li>`;
      }).join("")}</ul>`;
  }
  let archiveTimer;
  async function searchArchive() {
    const seq = ++archive.seq;
    archive.loading = true;
    try {
      const r = await api("POST", "shop/archive", { q: archive.q });
      if (seq !== archive.seq) return;
      archive.rows = r.rows; archive.keepDays = r.keepDays || 365; archive.error = "";
    } catch (e) { if (seq === archive.seq) archive.error = e.message; }
    finally { if (seq === archive.seq) archive.loading = false; }
    renderArchiveRows();
  }
  async function openArchived(id) {
    try { upsertJob(await api("GET", "shop/jobs/" + encodeURIComponent(id))); ui.openJob = id; renderLayer(); setTimeout(() => $(".x")?.focus(), 0); }
    catch (e) { toast(e.message); }
  }

  function checkinView() {
    return `<form class="panel" id="checkinForm" autocomplete="off">
      <h2>Customer check-in</h2>
      <label class="field">Check-in method<select id="ci-method"><option value="staff">Enter vehicle details at the shop</option><option value="invite">Invite customer by link</option></select></label>
      <p id="ci-help" class="muted">The customer gets a tracking link and can upload photos for the technician.</p>
      <div class="form-grid">
        <label class="field">Customer name<input id="ci-name" required maxlength="80"></label>
        <label class="field">Notify customer by<select id="ci-channel"><option value="sms">Text message</option><option value="email">Email</option><option value="both">Text and email</option></select></label>
        <label class="field" hidden id="ci-email-label">Email address<input id="ci-email" type="email" maxlength="254" autocomplete="email" disabled></label>
        <p id="ci-email-note" class="muted full" hidden>Automatic email needs a sender connection. After saving, open the email draft in this repair’s Messages.</p>
        <label class="field" id="ci-phone-label">Mobile number<input id="ci-phone" required inputmode="tel" placeholder="(555) 010-0000"></label>
        <label class="field" data-staff-intake>Year<input id="ci-year" inputmode="numeric" maxlength="4"></label>
        <label class="field" data-staff-intake>Make<input id="ci-make" required maxlength="40"></label>
        <label class="field" data-staff-intake>Model<input id="ci-model" required maxlength="40"></label>
        <label class="field" data-staff-intake>License plate<input id="ci-plate" maxlength="12"></label>
        <label class="field full" data-staff-intake>What's the concern?<textarea id="ci-concern" required maxlength="1000"></textarea></label>
        <label class="chk full"><input type="checkbox" id="ci-consent"> Customer agreed to check-in and repair updates through the selected contact method.</label>
      </div>
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Check in and notify customer</button></div>
    </form>`;
  }

  function bubble(m, j) {
    const unsent = m.dir === "out" && m.delivery && m.delivery !== "sent";
    const who = m.dir === "out" ? channelName(m) + " to customer" : esc(first(j.customer.name));
    const status = unsent ? `<span class="delivery">${m.delivery === "failed" ? "Failed" : "Not sent"}${m.note ? ": " + esc(m.note) : ""}</span>` : "";
    const text = esc(m.text).replace(esc(j.link), `<a href="${esc(j.link)}" target="_blank" rel="noopener" title="${esc(j.link)}">customer page link</a>`);
    const draft = unsent && m.channel === "email" && j.customer.email && j.customer.consent
      ? `<a class="btn" href="mailto:${esc(encodeURIComponent(j.customer.email))}?subject=${esc(encodeURIComponent(shop.name + " · " + j.ro))}&amp;body=${esc(encodeURIComponent(m.text))}">Open email draft</a>` : "";
    return `<div class="bubble ${m.dir}${unsent ? " unsent" : ""}">${text}<span class="meta">${who} · ${dayClock(m.t)}</span>${status}${draft}</div>`;
  }

  function sheetView(j) {
    const idx = SI[j.stage];
    const steps = STAGES.map((s, i) => s.key === "invited" || (j.stage === "invited" && (s.key !== "checked_in" || !j.intakeReceived)) ? "" : `<button class="step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}" data-stage="${s.key}" ${i === idx ? 'aria-current="step"' : ""}>${s.key === "approval" && i === idx ? estimateOutcome(j) || s.label : s.label}</button>`).join("");
    const next = STAGES[idx + 1];
    const rows = j.estimate.map((e) => `<tr><td>${esc(e.item)}${chargeDetail(e)}</td><td>${e.status === "pending" ? '<span class="pill warn">Pending</span>' : e.status === "approved" ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Declined</span>'}</td><td class="num">${money(e.price)}</td><td class="num">${e.status === "pending" && j.stage !== "approval" ? `<button class="linkbtn" data-del="${e.id}" aria-label="Remove ${esc(e.item)}">Remove</button>` : ""}</td></tr>`).join("");
    const log = [...j.events].reverse().map((e) => `<li><time>${clock(e.t)}</time><span>${STAGES[SI[e.stage]].label}</span></li>`).join("");
    return `<div class="scrim" data-close></div><aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <div class="sheet-h"><div><div class="mono muted">${esc(j.ro)}${j.plate ? " · " + esc(j.plate) : ""}</div><h2 id="sheetTitle">${esc(vehicleStr(j) || "Vehicle details pending")}</h2><div class="muted">${esc(j.customer.name)} · ${esc(contact(j.customer))}</div></div><button class="x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body" data-job="${esc(j.id)}">
        ${j.closed ? `<section class="sec closed-note"><p><b>Closed without repair</b> · ${esc(j.closed.reason)} · ${dayClock(j.closed.t)}</p><p class="muted">This car is in the Archive.</p><div class="btn-row"><button class="btn" data-reopen>Reopen and put back on the board</button><button class="btn danger" data-delete-job>Delete permanently</button></div></section>` : ""}
        <section class="sec"><h3>Stage</h3><div class="stepper">${steps}</div>
          <div class="btn-row" style="margin-top:10px">${next && (j.stage !== "invited" || j.intakeReceived) ? `<button class="btn primary" data-stage="${next.key}">Move to ${next.label}</button>` : ""}<a class="btn" href="${esc(j.link)}" target="_blank" rel="noopener" style="text-decoration:none">Customer's page</a>${j.stage !== "picked_up" && !j.closed ? `<button class="btn" data-close-job>Close without repair</button>` : ""}</div>
          ${j.stage === "parts" ? `<label class="field" style="margin-top:10px">Parts ETA<input id="eta" value="${esc(j.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
        </section>
        ${j.stage === "invited" && !j.intakeReceived ? `<section class="sec"><h3>Awaiting customer intake</h3><details><summary>Enter details at the shop</summary>${intakeForm()}</details></section>` : ""}
        ${j.concern ? `<section class="sec"><h3>Concern</h3><div>${esc(j.concern)}</div></section>` : ""}
        ${j.stage === "invited" && !j.intakeReceived ? "" : `<section class="sec"><h3>Estimate</h3>
          ${j.estimate.length ? `<div style="overflow-x:auto"><table class="est"><thead><tr><th>Item</th><th>Status</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${j.estimate.some((e) => e.status !== "pending") ? `<div class="total"><span>Approved total</span><span>${money(estTotal(j, true))}</span></div><div class="total sub"><span>Total quoted</span><span>${money(estTotal(j))}</span></div>` : `<div class="total"><span>Total quoted</span><span>${money(estTotal(j))}</span></div>`}` : `<p class="muted" style="margin:0">No line items yet.</p>`}
          ${j.approval ? `<p class="muted" style="font-size:13px">Signed by ${esc(j.approval.by)} on ${dayClock(j.approval.t)}</p>` : ""}
          <div class="est-add">
            <div class="est-add-h">Quick add</div>
            <form class="add-line" id="addLine"><span class="suggest-wrap"><input id="li-item" data-suggest="quick" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="${(shop.rates || []).length ? "Type or pick a saved item" : "Item, e.g. Cabin air filter"}" aria-label="Line item"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items" ${(shop.rates || []).length ? "" : "hidden"}>▾</button></span><input id="li-price" inputmode="decimal" placeholder="Price" aria-label="Price"><button class="btn" type="submit">Add</button>
              <label class="chk save-chk"><input type="checkbox" id="li-save" checked> Save new items for next time</label></form>
            <div class="est-add-or"><span>or</span></div>
            <button class="btn est-add-more" type="button" data-billing="quote">Add labor, parts or fees with hours and rates</button>
          </div>
          ${j.estimate.some((e) => e.status === "pending") && j.stage !== "approval" ? `<button class="btn primary est-send" data-stage="approval">Send estimate for approval</button>` : ""}
        </section>
        <section class="sec"><h3>Final bill</h3>
          ${j.bill ? `<p>${j.bill.mode === "upload" ? "Shop PDF" : "Itemized bill"} · ${money(j.bill.total)}</p>` : ""}
          <div class="btn-row"><button class="btn" data-billing="generated">${j.bill?.mode === "generated" ? "Edit itemized bill" : "Create itemized bill"}</button><button class="btn" data-billing="upload">Upload shop PDF</button>${j.bill?.mode==="upload" ? '<button class="linkbtn" data-billing="download">Download current PDF</button>' : ""}</div>
        </section>`}
        <section class="sec"><h3>Photos</h3><div class="photos">${j.photos.map((p) => photoFigure(p, true)).join("")}
          <button type="button" class="photo-add" id="pickPhoto">+ Add photo<br><span style="font-weight:400">Customer sees it on their page</span></button><p id="photoStatus" role="status" hidden></p></div></section>
        <section class="sec"><h3>Technician notes <span class="sec-sub">Customer sees these</span></h3>
          ${(j.notes || []).length ? `<ul class="notes">${[...j.notes].reverse().map((n) => `<li><time>${dayClock(n.t)}</time><p>${esc(n.text)}</p><button type="button" class="linkbtn" data-remove-note="${esc(n.id)}">Remove</button></li>`).join("")}</ul>` : ""}
          <form id="noteForm" class="note-form"><textarea id="noteIn" maxlength="2000" placeholder="What did you find? Tap Speak to talk instead of typing." aria-label="Technician note">${esc(ui.noteDraft[j.id] || "")}</textarea>
            <div class="btn-row"><button type="button" class="btn mic" data-dictate="#noteIn" aria-pressed="false" aria-label="Voice typing"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span class="mic-label">Speak</span></button><button class="btn primary" type="submit">Post note</button></div>
            <label class="chk"><input type="checkbox" id="noteSend" ${j.customer.consent ? "" : "disabled"}> Also notify ${esc(first(j.customer.name))} that there's an update${j.customer.consent ? "" : " (customer has not agreed to notifications)"}</label></form></section>
        <section class="sec"><h3>Messages</h3><div class="thread">${j.messages.map((m) => bubble(m, j)).join("") || '<p class="muted">No messages yet.</p>'}</div>
          <form class="add-line" id="replyForm" style="grid-template-columns:minmax(0,1fr) auto auto"><input id="replyIn" maxlength="1000" placeholder="Message ${esc(first(j.customer.name))}…" aria-label="Message"><button type="button" class="btn mic" data-dictate="#replyIn" aria-pressed="false" aria-label="Voice typing"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="btn primary" type="submit">Send</button></form></section>
        <section class="sec"><h3>History</h3><ul class="log">${log}</ul></section>
        <section class="sec danger-zone"><button class="linkbtn danger" data-delete-job>Delete this repair permanently</button><p class="muted">Removes the car, photos, messages and the customer's link. This can't be undone. To keep a record, use Close without repair instead.</p></section>
      </div></aside>`;
  }

  function closeModal() {
    const j = job(ui.modal.closeJob);
    const text = `Hi ${first(j.customer.name)}, we've closed out repair order ${j.ro} for your ${vehicleStr(j) || "vehicle"}. Thanks for considering ${shop.name}. Call us anytime if you change your mind.`;
    return `<div class="modal"><form class="modal-card" id="closeForm" role="dialog" aria-modal="true" aria-labelledby="cTitle">
      <h2 id="cTitle">Close without repair</h2>
      <p class="muted" style="margin:0"><b>Archive</b> keeps the record for one year so you can look it up or reopen it. <b>Delete</b> removes it for good.</p>
      <label class="field">Reason<select id="c-reason">${["Customer declined the repair", "Customer didn't bring the car in", "Customer went elsewhere", "Duplicate or mistake", "Other"].map((r) => `<option>${esc(r)}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="c-send" ${j.customer.consent ? "" : "disabled"}> Let ${esc(first(j.customer.name))} know ${j.customer.consent ? "" : "(customer has not agreed to notifications)"}</label>
      <label class="field" id="c-text-wrap" hidden>Message<textarea id="c-text" maxlength="1000">${esc(text)}</textarea></label>
      <div class="btn-row"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Archive</button><button class="btn danger" type="button" data-delete-job>Delete permanently</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    </form></div>`;
  }

  function stageModal() {
    const m = ui.modal, j = job(m.job), s = STAGES[SI[m.stage]];
    return `<div class="modal"><form class="modal-card" id="sendForm" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <h2 id="mTitle">Move to ${s.label}</h2>
      <p class="muted" style="margin:0">Notify ${esc(j.customer.name)} at ${esc(contact(j.customer))}</p>
      ${m.stage === "parts" ? `<label class="field">Parts ETA<input id="m-eta" value="${esc(m.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
      ${m.stage === "ready" ? `<div><strong>Final bill</strong><p>${j.bill ? money(j.bill.total) + " due at pickup" : "Optional. Customers can open their bill from the pickup link."}</p>
        <div class="btn-row"><button class="btn" type="button" data-billing="generated">Create / edit bill</button><button class="btn" type="button" data-billing="upload">Upload shop PDF</button></div></div>` : ""}
      <label class="field">Message<textarea id="m-text" maxlength="1000">${esc(m.text)}</textarea></label>
      <label class="chk"><input type="checkbox" id="m-send" ${j.customer.consent ? "checked" : "disabled"}> Notify customer ${j.customer.consent ? "" : "(customer has not agreed to notifications)"}</label>
      <div class="btn-row"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Update stage</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    </form></div>`;
  }

  function renderLayer() {
    let h = "";
    if (session && shop && ui.openJob && (ui.view === "board" || ui.view === "archive")) { const j = job(ui.openJob); if (j) h += sheetView(j); }
    if (ui.modal === "video") h += videoModal();
    else if (ui.modal?.billing) h += billing.editor(ui.modal.billing, shop, job(ui.modal.job));
    else if (ui.modal?.closeJob) h += closeModal();
    else if (ui.modal) h += stageModal();
    const prev = $(".sheet-body"), keep = prev && prev.dataset.job === ui.openJob ? prev.scrollTop : null;
    $("#layer").innerHTML = h;
    if (keep !== null && $(".sheet-body")) { $(".sheet").classList.add("no-anim"); $(".sheet-body").scrollTop = keep; }
    suggest.refresh();
    if (ui.modal?.billing) billing.updateTotal($("#billingForm"));
  }

  async function act(fn, okMsg) {
    ui.busy = true;
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(e.message); return null; }
    finally { ui.busy = false; }
  }
  async function jobAction(id, action, body, okMsg) {
    const j = await act(() => api("POST", `shop/jobs/${id}/${action}`, body), okMsg);
    if (j) { upsertJob(j); render(); }
    return j;
  }

  // ---------------- Events ----------------
  document.addEventListener("click", async (e) => {
    if (e.target.id === "photoIn") return;
    const t = e.target.closest("button,[data-close],[data-open],[data-close-modal]");
    if (!t) return;
    if (t.dataset?.billing) {
      const action = t.dataset.billing;
      if (action === "print") { window.print(); return; }
      if (action === "download") {
        const current = custToken ? cust.data : job(ui.openJob);
        const path = custToken ? "shop/c/" + encodeURIComponent(custToken) : "shop/jobs/" + current.id;
        try { const file = await api("GET", path + "/bill-file"); billing.fileDownload(file.pdf, current.bill.filename); }
        catch (err) { toast(err.message); }
        return;
      }
      if (["rates","generated","upload","quote"].includes(action)) {
        ui.modal = { billing: action, job: ui.openJob, pickup: ui.modal?.stage === "ready" ? ui.modal : null };
        renderLayer(); return;
      }
      const form = t.closest("#billingForm");
      if (form) billing.editClick(t, form);
      return;
    }
    if (t.id === "customerPickPhoto") {
      const input = $("#intakePhotoIn");
      if (!cust.intakeBusy) { input.value = ""; input.click(); }
      return;
    }
    if (t.id === "pickPhoto") {
      const input = $("#photoIn");
      if (!ui.openJob || input.disabled) return;
      input.dataset.job = ui.openJob;
      input.value = "";
      input.click();
      return;
    }
    if (t.matches("[data-close-modal]") && (t === e.target || t.tagName === "BUTTON")) { ui.modal = null; renderLayer(); return; }
    if (t.id === "watchDemo") { ui.modal = "video"; renderLayer(); return; }
    if (t.id === "google") {
      if (!sb) return;
      await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/", queryParams: { prompt: "select_account" } } });
      return;
    }
    if (t.id === "authSwap") { ui.authMode = ui.authMode === "signup" ? "signin" : "signup"; ui.authErr = ui.authMsg = ""; render(); return; }
    if (t.id === "signOut" || t.id === "signOut2") { if (sb) await sb.auth.signOut(); return; }
    if (t.id === "retry") { loadShop(); return; }
    if (t.dataset.archiveOpen) { openArchived(t.dataset.archiveOpen); return; }
    if (t.hasAttribute("data-archive-retry")) { archive.error = ""; renderArchiveRows(); searchArchive(); return; }
    if (t.hasAttribute("data-suggest-open")) return;
    if (t.dataset.view) { ui.view = t.dataset.view; ui.openJob = null; if (ui.view === "archive") archive.rows = null; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.open) { ui.openJob = t.dataset.open; renderLayer(); setTimeout(() => $(".x")?.focus(), 0); return; }
    if (t.hasAttribute("data-close")) { ui.openJob = null; renderLayer(); return; }
    if (t.hasAttribute("data-cancel")) { if (ui.busy) return; ui.modal = ui.modal?.pickup || null; renderLayer(); return; }
    if (t.dataset.stage) {
      const j = job(ui.openJob); if (!j || t.dataset.stage === j.stage) return;
      if (t.dataset.stage === "approval" && !j.estimate.some((x) => x.status === "pending")) { toast("Add at least one estimate line first"); $("#li-item")?.focus(); return; }
      const p = await act(() => api("POST", `shop/jobs/${j.id}/preview`, { stage: t.dataset.stage }));
      if (!p) return;
      ui.modal = { job: j.id, stage: t.dataset.stage, text: p.text, eta: j.eta };
      renderLayer(); $("#m-text")?.focus(); return;
    }
    if (t.dataset.removePhoto) {
      const id = ui.openJob;
      const photo = job(id)?.photos.find((p) => p.id === t.dataset.removePhoto);
      if (!photo || !window.confirm(`Remove "${photo.cap}" from this repair and the customer's page?`)) return;
      t.disabled = true;
      await jobAction(id, "remove-photo", { id: photo.id }, "Photo removed");
      t.disabled = false;
      return;
    }
    if (t.hasAttribute("data-close-job")) { ui.modal = { closeJob: ui.openJob }; renderLayer(); $("#c-reason")?.focus(); return; }
    if (t.hasAttribute("data-reopen")) {
      const j = await jobAction(ui.openJob, "reopen", {}, "Reopened. It's back on the board.");
      if (j && ui.view === "archive") searchArchive();
      return;
    }
    if (t.hasAttribute("data-delete-job") || t.dataset.deleteArchived) {
      if (ui.busy) return;
      const id = t.dataset.deleteArchived || ui.modal?.closeJob || ui.openJob;
      const j = job(id), row = archive.rows?.find((x) => x.id === id);
      const ro = j?.ro || row?.ro || "this repair";
      const veh = j ? vehicleStr(j) : [row?.vehicle?.year, row?.vehicle?.make, row?.vehicle?.model].filter(Boolean).join(" ");
      const who = j?.customer.name || row?.customer?.name || "";
      if (!window.confirm(`Permanently delete ${ro}${veh || who ? ` (${[veh, who].filter(Boolean).join(", ")})` : ""}? Photos, messages and the customer's link are removed. This can't be undone.`)) return;
      const r = await act(() => api("DELETE", "shop/jobs/" + encodeURIComponent(id)), "Repair deleted");
      if (r) {
        jobs = jobs.filter((x) => x.id !== id);
        if (archive.rows) archive.rows = archive.rows.filter((x) => x.id !== id);
        if (ui.openJob === id) ui.openJob = null;
        if (ui.modal?.closeJob === id) ui.modal = null;
        render();
      }
      return;
    }
    if (t.dataset.removeNote) {
      if (!window.confirm("Remove this note from the customer's page?")) return;
      jobAction(ui.openJob, "remove-note", { id: t.dataset.removeNote }, "Note removed"); return;
    }
    if (t.dataset.del) { jobAction(ui.openJob, "estimate", { remove: t.dataset.del }); return; }
    // customer page
    if (t.dataset.decide) { cust.draft[t.dataset.decide] = t.dataset.v; cust.sig = $("#sig")?.value ?? cust.sig; renderCustomer(); return; }
    if (t.id === "submitApproval") {
      const sig = ($("#sig").value || "").trim();
      if (sig.length < 3) { toast("Type your full name to sign"); $("#sig").focus(); return; }
      t.disabled = true;
      try { cust.data = await api("POST", `shop/c/${encodeURIComponent(custToken)}/decision`, { decisions: cust.draft, signature: sig }); cust.draft = {}; toast("Sent to " + cust.data.shop.name); }
      catch (err) { toast(err.message); }
      renderCustomer();
    }
  });

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === "billingForm") {
      if (ui.busy) return;
      const m = ui.modal, submit = f.querySelector('[type="submit"]');
      ui.busy = true; submit.disabled = true;
      try {
        if (m.billing === "rates") {
          shop = (await api("POST", "shop/me", { name: shop.name, phone: shop.phone, hours: shop.hours, rates: billing.readRows(f,true) })).shop;
        } else if (m.billing === "quote") {
          const [charge] = billing.readRows(f);
          if (!charge) throw Error("Add an estimate line first.");
          const save = !!f.elements.saveItems?.checked;
          upsertJob(await api("POST", `shop/jobs/${m.job}/estimate`, { charge, save }));
          if (save) rememberLocal([charge]);
        } else {
          const body = await billing.billBody(f);
          upsertJob(await api("POST", `shop/jobs/${m.job}/bill`, body));
          if (body.save) rememberLocal(body.lines);
        }
        if (m.pickup) {
          ui.modal = m.pickup;
          const preview = await api("POST", `shop/jobs/${m.job}/preview`, {stage:"ready"});
          ui.modal.text = preview.text;
        } else ui.modal = null;
 render(); toast(m.billing === "rates" ? "Saved items updated" : m.billing === "quote" ? "Added to estimate" : "Final bill saved");
      } catch (err) { billing.error(f, err.message); }
      finally { ui.busy = false; submit.disabled = false; const stageSubmit = $("#sendForm button[type=submit]"); if (stageSubmit) stageSubmit.disabled = false; }
      return;
    }
    if (f.id === "emailForm") {
      if (!sb) return;
      const email = $("#au-email").value.trim(), password = $("#au-pass").value;
      ui.busy = true; ui.authErr = ui.authMsg = ""; render();
      if (ui.authMode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + "/" } });
        if (error) ui.authErr = error.message;
        else if (!data.session) ui.authMsg = "Check your email for a link to finish creating your account.";
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) ui.authErr = error.message === "Invalid login credentials" ? "That email and password don't match." : error.message;
      }
      ui.busy = false; render();
      return;
    }
    if (f.id === "setupForm") {
      const body = { name: $("#sh-name").value, phone: $("#sh-phone").value, hours: $("#sh-hours").value, email: $("#sh-email").value };
      const r = await act(() => api("POST", "shop/me", body), "Saved");
      if (r) { shop = r.shop; ui.view = "board"; render(); }
      return;
    }
    if (f.id === "intakeForm") {
      if (cust.intakeBusy) return;
      const fields = Object.fromEntries(new FormData(f)), button = f.querySelector("button");
      const body = {vehicle:{year:fields.year,make:fields.make,model:fields.model}, plate:fields.plate, concern:fields.concern};
      cust.intakeBusy = true; button.disabled = true;
      try {
        if (custToken) {
          cust.data = await api("POST", `shop/c/${encodeURIComponent(custToken)}/intake`, body);
          cust.intakeDraft = {}; renderCustomer();
        } else {
          upsertJob(await api("POST", `shop/jobs/${ui.openJob}/intake`, body)); render();
        }
        toast("Check-in details saved");
      } catch (err) { toast(err.message); }
      finally { cust.intakeBusy = false; button.disabled = false; }
      return;
    }
    if (f.id === "checkinForm") {
      if (ui.busy) return;
      const invite = $("#ci-method").value === "invite";
      const g = (k) => $("#ci-" + k).value.trim();
      const j = await act(() => api("POST", "shop/jobs", {
        invite, customer: { name: g("name"), phone: g("phone"), email: g("email"), preference: g("channel"), consent: $("#ci-consent").checked },
        ...(invite ? {} : { vehicle: { year: g("year"), make: g("make"), model: g("model") }, plate: g("plate"), concern: g("concern") }),
      }));
      if (j) {
        upsertJob(j); ui.view = "board"; ui.openJob = j.id; render();
        toast("Saved. " + sendResult(j));
      }
      return;
    }
    if (f.id === "closeForm") {
      if (ui.busy) return;
      const id = ui.modal.closeJob, send = $("#c-send").checked;
      const j = await jobAction(id, "close", { reason: $("#c-reason").value, send, text: send ? $("#c-text").value.trim() : "" });
      if (j) { toast("Archived" + (send ? ". " + sendResult(j) : "")); ui.modal = null; ui.openJob = null; render(); if (ui.view === "archive") searchArchive(); }
      return;
    }
    if (f.id === "sendForm") {
      const m = ui.modal, eta = $("#m-eta");
      const body = { stage: m.stage, text: $("#m-text").value.trim(), send: $("#m-send").checked };
      if (eta) body.eta = eta.value.trim();
      const j = await jobAction(m.job, "stage", body);
      if (j) { toast("Moved to " + STAGES[SI[m.stage]].label + (body.send && body.text ? ". " + sendResult(j) : "")); ui.modal = null; if (j.stage === "picked_up") ui.openJob = null; render(); }
      return;
    }
    if (f.id === "addLine") {
      const item = $("#li-item").value.trim(), price = parseFloat($("#li-price").value.replace(/[$,]/g, ""));
      if (!item || !(price >= 0)) { toast("Enter an item and a price"); return; }
      let pick = null; try { pick = f.dataset.pick ? JSON.parse(f.dataset.pick) : null; } catch { /* none */ }
      const save = $("#li-save").checked;
      const body = pick && pick.name === item ? { charge: { name: item, kind: pick.kind, rate: Math.round(price * 100) / 100, qty: 1 }, save } : { item, price, save };
      if (await jobAction(ui.openJob, "estimate", body)) {
        if (save) rememberLocal([{ name: item, kind: pick && pick.name === item ? pick.kind : "part", rate: Math.round(price * 100) / 100 }]);
        render(); $("#li-item")?.focus();
      }
      return;
    }
    if (f.id === "noteForm") {
      if (ui.busy) return;
      dictation.stop();
      const id = ui.openJob, text = $("#noteIn").value.trim(), send = $("#noteSend").checked;
      if (!text) { toast("Type or speak a note first"); return; }
      const j = await jobAction(id, "note", { text, send }, send ? null : "Note posted to the customer's page");
      if (j) { delete ui.noteDraft[id]; render(); if (send) toast("Note posted. " + sendResult(j)); }
      return;
    }
    if (f.id === "replyForm") {
      dictation.stop();
      const v = $("#replyIn").value.trim(); if (!v) return;
      const j = await jobAction(ui.openJob, "message", { text: v });
      if (j) { toast(sendResult(j)); $("#replyIn")?.focus(); }
    }
  });

  async function encodePhoto(file) {
    // Read the picker-provided file while its temporary library URL is available.
    let bytes;
    try { bytes = await file.arrayBuffer(); }
    catch { throw new Error("The selected photo could not be read. Open it in Photos, then try again."); }
    if (!bytes.byteLength) throw new Error("The selected photo is empty. Choose it again after it loads in Photos.");
    const url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
    try {
      const img = new Image();
      img.src = url;
      try { await img.decode(); }
      catch { throw new Error("This photo could not be opened. Try a JPEG or PNG."); }
      const canvas = document.createElement("canvas");
      // The shop API accepts JPEG data URLs up to 400,000 characters.
      for (const longest of [1024, 800, 640, 480]) {
        const scale = Math.min(1, longest / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) break;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const src = canvas.toDataURL("image/jpeg", 0.72);
        if (src.startsWith("data:image/jpeg;base64,") && src.length <= 400000) return src;
      }
      throw new Error("This photo could not be resized. Try a smaller photo.");
    } finally { URL.revokeObjectURL(url); }
  }

  async function uploadIntakePhotos(input) {
    if (cust.intakeBusy || !input.files.length) return;
    cust.intakeBusy = true;
    const files = Array.from(input.files), status = $("#photoStatus");
    const room = 6 - cust.data.photos.filter(p => p.source === "customer").length;
    let count = 0, message = "";
    try {
      if (files.length > room) throw Error(`Choose up to ${room} more photos.`);
      for (const file of files) {
        status.hidden = false; status.textContent = `Sending photo ${count+1} of ${files.length}…`;
        const src = await encodePhoto(file);
        cust.data = await api("POST", `shop/c/${encodeURIComponent(custToken)}/intake-photo`, { src, cap: file.name.replace(/\.[^.]+$/, "") });
        count++;
      }
      message = `${count} photo${count === 1 ? "" : "s"} sent to your technician.`;
    } catch (err) { message = (count ? `${count} already sent. ` : "") + err.message; }
    finally { input.value = ""; cust.intakeBusy = false; }
    renderCustomer();
    const feedback = $("#photoStatus");
    if (feedback) { feedback.hidden = false; feedback.textContent = message; }
    toast(message);
  }

  document.addEventListener("cancel", (e) => {
    if (e.target.id === "photoIn" && !e.target.disabled) delete e.target.dataset.job;
  });
  async function uploadSelectedPhoto(input) {
    const file = input.files[0], id = input.dataset.job;
    if (!file || !id || input.disabled) return;
    const status = $("#photoStatus");
    if (status) { status.hidden = false; status.textContent = "Adding photo…"; }
    input.disabled = true;
    try {
      const src = await encodePhoto(file);
      const updated = await api("POST", `shop/jobs/${id}/photo`, { src, cap: file.name.replace(/\.[^.]+$/, "") });
      upsertJob(updated);
      if (ui.openJob === id) render();
      toast("Photo added to customer's page");
    } catch (error) {
      const message = error.message || "Photo upload failed. Please try again.";
      if (status) status.textContent = message;
      toast(message);
    } finally {
      input.value = "";
      input.disabled = false;
      delete input.dataset.job;
    }
  }
  document.addEventListener("change", (e) => {
    if (e.target.id === "intakePhotoIn") return uploadIntakePhotos(e.target);
    if (e.target.id === "c-send") { $("#c-text-wrap").hidden = !e.target.checked; return; }
    if (e.target.id === "ci-channel") {
      const pref = e.target.value, email = pref !== "sms", sms = pref !== "email";
      $("#ci-email-label").hidden = !email; $("#ci-email").disabled = !email; $("#ci-email").required = email;
      $("#ci-phone-label").hidden = !sms; $("#ci-phone").disabled = !sms; $("#ci-phone").required = sms;
      $("#ci-email-note").hidden = !email || emailConfigured;
      $("#ci-consent").checked = false;
      return;
    }
    if (e.target.id === "ci-method") {
      const invite = e.target.value === "invite", form = e.target.form;
      form.querySelectorAll("[data-staff-intake]").forEach(el => { el.hidden = invite; el.querySelector("input,textarea").disabled = invite; });
      form.querySelector('[type="submit"]').textContent = invite ? "Send check-in link" : "Check in and notify customer";
      $("#ci-consent").required = invite;
      $("#ci-help").textContent = invite ? "Send a private link for vehicle details, the reason for the visit and photos." : "The customer gets a tracking link and can upload photos for the technician.";
      return;
    }
    if (ui.modal?.billing) { billing.change(e, shop); return; }
    if (e.target.id === "eta") jobAction(ui.openJob, "eta", { eta: e.target.value.trim() }, "ETA saved");
    if (e.target.id === "photoIn") return uploadSelectedPhoto(e.target);
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "noteIn" && ui.openJob) { ui.noteDraft[ui.openJob] = e.target.value; return; }
    if (e.target.id === "archiveQ") { archive.q = e.target.value; clearTimeout(archiveTimer); archiveTimer = setTimeout(searchArchive, 250); return; }
    if (e.target.id === "li-item") delete e.target.form.dataset.pick;
    if (e.target.id === "intakePhotoIn") return uploadIntakePhotos(e.target);
    if (custToken && e.target.form?.id === "intakeForm") cust.intakeDraft[e.target.name] = e.target.value;
    if (ui.modal?.billing) { billing.updateTotal($("#billingForm")); return; }
    if (e.target.id === "sig") cust.sig = e.target.value;
    if (e.target.id === "photoIn") return uploadSelectedPhoto(e.target);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ui.busy) { if (ui.modal) ui.modal = ui.modal?.pickup || null; else ui.openJob = null; renderLayer(); } });

  // ---------------- Start ----------------
  if (custToken) {
    loadCustomer();
    setInterval(() => { if (!cust.intakeBusy && !document.activeElement?.closest("#intakeForm") && !Object.keys(cust.draft).length && document.visibilityState === "visible") loadCustomer(); }, 30000);
    return;
  }
  if (!sb) { render(); return; }
  sb.auth.onAuthStateChange((_event, s) => {
    const was = session?.user?.id;
    session = s;
    if (s && s.user.id !== was) { loaded = false; render(); loadShop(); }
    else if (!s) { shop = null; jobs = []; loaded = false; ui.openJob = null; ui.modal = ui.modal === "video" ? "video" : null; render(); }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) render(); });
  setInterval(async () => {
    if (!session || !shop || cust.intakeBusy || ui.view !== "board" || ui.modal || dictation.active() || document.visibilityState !== "visible") return;
    const pickerActive = () => $("#photoIn:disabled");
    if (pickerActive()) return;
    try {
      const latest = await api("GET", "shop/jobs");
      if (!pickerActive() && ui.view === "board" && !cust.intakeBusy && !ui.modal && !ui.busy && !dictation.active() && !document.activeElement?.matches("input,textarea")) { if (JSON.stringify(latest) !== JSON.stringify(jobs)) { jobs = latest; render(); } }
    } catch (e) { /* try again next time */ }
  }, 20000);
})();
