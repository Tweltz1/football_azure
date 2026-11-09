// Talk Shops: progress updates from repair shops to their customers. A plain page, no build step.
// Shop staff sign in with Supabase; customers open /?c=<token> from their text and never sign in.
// All data goes through the shared API (supabase/functions/_shared/shop.ts in this repo).
(function () {
  "use strict";
  const CFG = window.BAY_CONFIG || {};
  const DEMO_PAGE = "/demo.html";
  const DEMO_VIDEO = "/demo.mp4?v=2";
  const STAGES = [
    { key: "invited", label: "Customer invited", cust: "Check In for Your Repair" },
    { key: "checked_in", label: "Checked In", cust: "We Have Your Car" },
    { key: "diagnosing", label: "Diagnosing", cust: "Inspecting Your Car" },
    { key: "approval", label: "Approval Needed", cust: "Waiting on Your Approval" },
    { key: "parts", label: "Waiting on Parts", cust: "Waiting on Parts" },
    { key: "in_progress", label: "In Progress", cust: "Repairs Underway" },
    { key: "qc", label: "Quality Check", cust: "Final Check and Road Test" },
    { key: "ready", label: "Ready for Pickup", cust: "Ready for Pickup" },
    { key: "picked_up", label: "Picked Up", cust: "Picked Up" },
  ];
  const SI = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const billing = window.createShopBilling({ esc, money });
  let plan = null;
  const planUi = window.createShopPlan({ esc, api: (...a) => api(...a), toast: (m) => toast(m) });
  const howTo = window.createShopHowTo({ esc, api: (...a) => api(...a), toast: (m) => toast(m), cars: () => (jobs || []).filter((j) => j.stage !== "picked_up" && !j.closed), locked: () => !!plan && plan.howTo === false });
  const chargeDetail = e => e.charge ? `<small class="charge-detail">${esc(billing.calculation(e.charge))}</small>` : "";
  const ts = (t) => (typeof t === "number" ? t : Date.parse(t));
  const clock = (t) => new Date(ts(t)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayClock = (t) => { const d = new Date(ts(t)); return d.toDateString() === new Date().toDateString() ? clock(t) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + clock(t); };
  const since = (t) => { const m = Math.max(0, Math.round((Date.now() - ts(t)) / 60000)); if (m < 60) return m + "m"; const h = Math.floor(m / 60); if (h < 48) return h + "h " + (m % 60) + "m"; return Math.floor(h / 24) + "d"; };
  const vehicleStr = (j) => ShopDisplay.vehicle([j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" "));
  const estTotal = (j, approvedOnly) => j.estimate.filter((e) => !approvedOnly || e.status === "approved").reduce((a, e) => a + Number(e.price), 0);
  const awaitingDecision = (j) => j.stage === "approval" && j.estimate.some((e) => e.status === "pending");
  function estimateOutcome(j) {
    if (!j.estimate.length || j.estimate.some((e) => e.status === "pending")) return "";
    const approved = j.estimate.filter((e) => e.status === "approved").length;
    if (approved === j.estimate.length) return "Estimate Approved";
    return approved ? "Estimate Partially Approved" : "Estimate Declined";
  }
  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || ""); };
  const contact = c => [c.preference !== "email" && fmtPhone(c.phone), c.preference !== "sms" && c.email].filter(Boolean).join(" and ");
  const channelName = m => m.channel === "email" ? "Email" : "Text";
  function sendResult(j) {
    const count = j.customer.preference === "both" ? 2 : 1;
    return j.messages.slice(-count).map(m => m.delivery === "sent" ? channelName(m) + " sent" : channelName(m) + " not sent" + (m.note ? ": " + String(m.note).replace(/[.\s]+$/, "") : "")).join(". ") + ".";
  }
  // Required / recommended / optional on each estimate line (older lines have none).
  const PRI = {
    required: { label: "Required", cls: "bad", cust: "Needed to fix your concern or for safety." },
    recommended: { label: "Recommended", cls: "warn", cust: "Advised soon to prevent bigger problems." },
    optional: { label: "Optional", cls: "", cust: "Can wait if you prefer." },
  };
  const PRI_ORDER = { required: 0, recommended: 1, optional: 2 };
  const priOptions = (v) => Object.entries(PRI).map(([k, p]) => `<option value="${k}" ${k === (v || "recommended") ? "selected" : ""}>${p.label}</option>`).join("");
  const priPill = (e) => e.priority && PRI[e.priority] ? `<span class="pill pri ${PRI[e.priority].cls}">${PRI[e.priority].label}</span>` : "";
  const first = (name) => String(name || "").split(/\s+/)[0];

  // Keep account requests on the site's domain for networks that block Supabase.
  function accountFetch(input, options) {
    const request = new Request(input, options);
    const url = new URL(request.url);
    if (url.origin === new URL(CFG.supabaseUrl).origin && url.pathname.startsWith("/auth/v1/")) {
      const local = new URL("/account-api/" + url.pathname.slice("/auth/v1/".length), location.origin);
      local.search = url.search;
      return fetch(new Request(local, request));
    }
    return fetch(request);
  }
  const sb = window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { fetch: accountFetch } })
    : null;

  async function api(method, path, body) {
    if (!CFG.apiUrl) throw new Error("This site is missing its server settings.");
    const headers = { "Content-Type": "application/json" };
    if (sb) {
      const { data } = await sb.auth.getSession();
      const token = data?.session?.access_token;
      if (token) headers.Authorization = "Bearer " + token;
    }
    const url = path.startsWith("shop/")
      ? "/shop-api/" + path
      : CFG.apiUrl.replace(/\/$/, "") + "/" + path;
    const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
      <video src="${DEMO_VIDEO}" controls autoplay playsinline preload="metadata"><track kind="captions" srclang="en" label="English" src="/walkthrough-en.vtt?v=2" default></video>
      <p class="muted" style="margin:0;font-size:13.5px">A walkthrough with narration: checking in a car, sending an estimate, the customer approving it from their text link, and moving the car to ready for pickup. Turn your sound on.</p>
      <div class="btn-row"><a class="btn primary" href="${DEMO_PAGE}" style="text-decoration:none">Explore Demo Shop</a><a class="btn" href="${DEMO_PAGE}?tour=1">Open Interactive Tour</a></div>
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
    const heading = j.closed ? "This Repair Was Closed" : j.stage === "invited" && j.intakeReceived ? "Check-In Details Received" :
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
      const items = [...j.estimate].sort((a, b) => (PRI_ORDER[a.priority] ?? 1) - (PRI_ORDER[b.priority] ?? 1)).map((e) => {
        const d = cust.draft[e.id];
        const choice = pending && e.status === "pending"
          ? `<div class="decide"><button class="yes" data-decide="${e.id}" data-v="approved" aria-pressed="${d === "approved"}">Approve</button><button class="no" data-decide="${e.id}" data-v="declined" aria-pressed="${d === "declined"}">Decline</button></div>`
          : (e.status !== "pending" ? `<span class="pill ${e.status === "approved" ? "ok" : "bad"}">${e.status === "approved" ? "Approved" : "Declined"}</span>` : "");
        const pri = e.priority && PRI[e.priority] ? `<div class="pri-line">${priPill(e)}<span>${PRI[e.priority].cust}</span></div>` : "";
        return `<div class="est-item pri-${esc(e.priority || "none")}"><div class="top"><span>${esc(e.item)}${chargeDetail(e)}</span><span>${money(e.price)}</span></div>${pri}${window.repairPhotoFor(e.item, e.status === "declined" ? "Part" : "What's being worked on")}${window.repairGuideFor(e.item, { photo: false })}${choice}</div>`;
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
      <div class="c-head"><small>${esc(j.shop.name)} · <span class="mono">${esc(j.ro)}</span></small><h2>${heading}</h2><div style="font-size:14px;margin-top:4px">${esc(ShopDisplay.vehicle(j.vehicle))}</div>${extra}</div>
      <div class="c-body">
        ${j.stage === "invited" ? `<section class="c-card"><h3>Vehicle check-in</h3>${j.intakeReceived ? "<p>Your details have been sent to the shop.</p>" : intakeForm()}</section>` : ""}
        ${j.canUploadIntakePhotos ? `<section class="c-card"><h3>Photos for your technician</h3>
          <p>Show the damage, warning light or part you want checked.</p>
          <button type="button" id="customerPickPhoto" class="btn" ${j.photos.filter(p => p.source === "customer").length >= 6 ? "disabled" : ""}>Add photos</button>
          <small style="margin-left:10px">${j.photos.filter(p => p.source === "customer").length} of 6 photos added</small><p id="photoStatus" role="status" hidden></p></section>` : ""}
        ${window.Walkaround.customerCard(j)}
        ${billing.display(j.bill, j)}${est}
        ${window.Walkthrough.customerCard(j)}
        ${(j.notes || []).length ? `<div class="c-card"><h3>Notes from your technician</h3><ul class="notes">${[...j.notes].reverse().map((n) => `<li><time>${dayClock(n.t)}</time><p>${esc(n.text)}</p>${window.repairPhotoFor(n.text, "Part mentioned")}</li>`).join("")}</ul></div>` : ""}
        <div class="c-card"><h3>Progress</h3><ul class="tl">${tl}</ul>${earlierPhotos}</div>
        ${j.concern ? `<div class="c-card"><h3>Your concern</h3><div style="font-size:14px">${esc(j.concern)}</div></div>` : ""}
        ${j.shop.phone ? `<div class="c-card call"><span>Questions? Call the shop</span><b>${esc(j.shop.phone)}</b></div>` : ""}
        <p class="cust-top">This page updates as your repair progresses.</p>
        <p class="cust-top"><a href="/privacy.html">Privacy Policy</a></p>
      </div></div>`;
  }

  // ==================== Shop app (signed in) ====================
  const ui = { noteDraft: {}, view: "board", openJob: null, modal: null, authMode: new URLSearchParams(location.search).get("login") === "signup" ? "signup" : "signin", authMsg: "", authErr: "", busy: false, reset: null };
  // Shop Settings: the phone that can get password reset codes.
  const recovery = { data: null, loading: false, pending: "", err: "" };
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
  let role = null, mainOwner = false;
  const isOwner = () => role === "owner";
  const team = window.createShopTeam({ esc, api: (...a) => api(...a), toast: (m) => toast(m) });
  // Staff invite link: /?join=<token>. Kept in this browser until it's used, so it survives signing up by email.
  const JOIN_KEY = "talkshops-join";
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* private mode */ } } };
  let joinToken = new URLSearchParams(location.search).get("join") || store.get(JOIN_KEY) || "";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(joinToken)) joinToken = "";
  store.set(JOIN_KEY, joinToken);
  const join = { info: null, err: "" };
  const authRedirect = () => location.origin + "/" + (joinToken ? "?join=" + encodeURIComponent(joinToken) : "");
  let session = null, shop = null, emailConfigured = false, jobs = [], loaded = false, loadErr = "";
  const job = (id) => jobs.find((j) => j.id === id);
  const upsertJob = (j) => { const i = jobs.findIndex((x) => x.id === j.id); if (i >= 0) jobs[i] = j; else jobs.push(j); };

  async function acceptInvite() {
    if (!joinToken) return;
    try {
      const r = await api("POST", "shop/join/" + encodeURIComponent(joinToken));
      setTimeout(() => toast(`Welcome to ${r.shopName}. You're signed in as ${r.role === "owner" ? "an owner" : "a technician"}.`), 400);
      join.err = "";
    } catch (e) { join.err = e.message; }
    joinToken = ""; store.set(JOIN_KEY, "");
    const q = new URLSearchParams(location.search);
    if (q.has("join")) { q.delete("join"); history.replaceState(history.state, "", "/" + (q.toString() ? "?" + q : "") + location.hash); }
  }

  async function loadShop() {
    try {
      await acceptInvite();
      const me = await api("GET", "shop/me");
      shop = me.shop; emailConfigured = !!me.emailConfigured; plan = me.plan || null;
      role = me.role || null; mainOwner = !!me.mainOwner;
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
    if (new URLSearchParams(location.search).has("contact")) {
      chrome.hidden = true;
      document.title = "Contact Sales · Talk Shops";
      app.innerHTML = salesView();
      return;
    }
    if (new URLSearchParams(location.search).has("help")) {
      ui.view = "help";
      chrome.hidden = true;
      document.title = "Help & Support · Talk Shops";
      app.innerHTML = helpView();
      return;
    }
    // The sign-in page is /?login (a real file the host always serves); /login forwards there.
    const onLoginPage = location.pathname === "/login" || location.pathname === "/login/" || new URLSearchParams(location.search).has("login") || new URLSearchParams(location.search).has("join");
    if (!session) {
      chrome.hidden = true;
      if (onLoginPage) document.title = ui.authMode === "signup" ? "Create Your Account · Talk Shops" : "Shop Sign In · Talk Shops";
      app.innerHTML = onLoginPage ? loginView() : homeView();
      renderLayer();
      return;
    }
    if (onLoginPage) { const q = new URLSearchParams(location.search); q.delete("login"); history.replaceState(history.state, "", "/" + (q.toString() ? "?" + q : "") + location.hash); }
    if (!loaded) { chrome.hidden = true; app.innerHTML = `<div class="loading">Loading your shop…</div>`; return; }
    if (!shop) { chrome.hidden = true; app.innerHTML = setupView(true); renderLayer(); return; }
    if (!isOwner() && ui.view === "plan") ui.view = "board";
    chrome.hidden = false;
    $("#shopName").textContent = shop.name;
    $("#bayTab").textContent = bayName();
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.view === ui.view ? "page" : "false"));
    const planTab = document.querySelector('.tab[data-view="plan"]'); if (planTab) planTab.hidden = !isOwner();
    $("#shopName").textContent = shop.name + (isOwner() ? "" : " · Technician");
    const err = (loadErr ? `<div class="notice">${esc(loadErr)} <button class="linkbtn" id="retry">Try again</button></div>` : "")
      + (join.err ? `<div class="notice">${esc(join.err)}</div>` : "")
      + (ui.view === "plan" || ui.view === "training" || ui.view === "help" ? "" : isOwner() ? planUi.banner(plan) : techBanner(plan));
    app.innerHTML = err + (ui.view === "help" ? helpView() : ui.view === "checkin" ? checkinView() : ui.view === "settings" ? (isOwner() ? setupView(false) : techSettingsView()) : ui.view === "archive" ? archiveView() : ui.view === "plan" ? planUi.view(plan) : ui.view === "howto" ? howTo.view() : ui.view === "training" ? window.TALKSHOPS_TRAINING.view(esc) : boardView());
    if (ui.view === "board") filterBoard();
    if (ui.view === "settings" && !recovery.data && !recovery.loading && !recovery.err) loadRecovery();
    if (ui.view === "archive") { renderArchiveRows(); if (!archive.rows && !archive.loading) searchArchive(); }
    renderLayer();
  }

  const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
  const brand = () => `<div class="brand"><div class="brand-mark" aria-hidden="true">${$(".brand-mark").innerHTML}</div><div><h1>Talk Shops</h1><small>For repair shops</small></div></div>`;

  const supportEmail = "support@talkshops.app";
  const signInHelp = `<p class="muted" style="margin:0">Need help? <a class="login-home" href="/?help">Visit Help &amp; Support</a></p>`;

  function helpView() {
    const guides = [
      ["Checking In a Vehicle", "Open Check In, choose your check-in method, and enter the customer and vehicle details. Confirm permission to send updates, then send the customer their private repair link.", "checkin"],
      ["Updating Customer Information", "Open a vehicle in the Bay and select Edit Customer Info. Update the name, phone, email or notification preference, confirm consent when contact details change, and save.", "checkin"],
      ["Sending an Estimate", "Open the vehicle, add estimate items and their prices, and choose Required, Recommended or Optional. An owner can send the estimate for approval; customers review and sign from their repair link.", "estimates"],
      ["Moving Cars Through the Bay", "Open a vehicle and choose its next stage. Review the customer notification before sending. Use the Bay search and filters to find repairs that need attention.", "stages"],
      ["Finishing a Repair", "An owner can prepare the final bill, mark the car Ready for Pickup and confirm pickup. Find past repairs in Archive.", "pickup"],
      ["Inviting Your Team", "Owners can open Settings → Team to invite staff as owners or technicians. Each person signs in with the email address that received the invitation.", "team"],
    ];
    const faqs = [
      ["Do customers need an account?", "No. Customers open the private repair link sent by the shop to view updates, photos and estimates."],
      ["I did not receive my account confirmation email.", "Check that you entered the correct email address and look in spam or junk. If you signed up through Google, use Continue with Google with that same account. Contact support below if you still cannot get in."],
      ["How do I reset my password?", "Choose Forgot password? on Shop Sign In. Request a code by email, or by text if you previously verified a reset phone in Settings."],
      ["A customer did not receive an update. What should I check?", "Open the repair and review the message delivery result. Verify the customer’s phone, email, notification preference and consent through Edit Customer Info. Correct the details before sending another update."],
      ["Where can I manage my subscription?", "Shop owners can open Plan to review their plan and use Manage Billing. Technicians can ask an owner for help with billing."],
      ["What can technicians do?", "Technicians can work on repairs and customer updates. Owners handle shop settings, team invitations, billing, estimate approval requests and closing repairs."],
    ];
    return `<section class="help-center">
      <header class="help-heading"><div><p class="muted">Talk Shops Support</p><h2>How Can We Help?</h2><p class="muted">Quick answers and practical guides for your shop.</p></div><a class="btn" href="${session ? "/" : "/?login"}">${session ? "Back to My Shop" : "Shop Sign In"}</a></header>
      <div class="help-actions"><a class="panel" href="#help-guides"><b>Quick Guides</b><span>Find the steps for everyday tasks.</span></a><a class="panel" href="#help-training"><b>Walkthroughs &amp; Training</b><span>Follow along with sample vehicles.</span></a><a class="panel" href="#help-support"><b>Contact Support</b><span>Get help from our team by email.</span></a></div>
      <section class="panel" id="help-guides"><h3>Quick Guides</h3>${guides.map(([title, body, lesson]) => `<details><summary>${esc(title)}</summary><p>${esc(body)}</p><a href="/demo.html?train=${lesson}">Watch the Lesson →</a></details>`).join("")}</section>
      <section class="panel" id="help-training"><h3>Walkthroughs &amp; Training</h3><p class="muted">Narrated lessons use a demo shop with sample cars. Turn your sound on to follow along.</p><a class="btn primary" href="/demo.html?tour=1">Start the Guided Tour</a><div class="help-lessons">${window.TALKSHOPS_TRAINING.lessons.map(l => `<a href="/demo.html?train=${esc(l.id)}">${esc(l.title)} <small class="muted">${l.mins} min</small></a>`).join("")}</div></section>
      <section class="panel"><h3>Common Questions</h3>${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</section>
      <section class="panel" id="help-support"><h3>Contact Support</h3><p class="muted">Describe what happened and what you were trying to do. We’ll reply to the email below. Please leave out passwords and customer information.</p>
        <form id="helpForm" class="help-form">
          <label class="field">Your Name<input name="name" autocomplete="name" required maxlength="100" value="${esc(session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || "")}"></label>
          <label class="field">Reply Email<input name="email" type="email" autocomplete="email" required maxlength="254" value="${esc(session?.user?.email || "")}"></label>
          <label class="field">Shop Name<input name="shop" autocomplete="organization" required maxlength="160" value="${esc(shop?.name || "")}"></label>
          <label class="field">Phone Number (Optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40" value="${esc(shop?.phone || "")}"></label>
          <label class="field help-wide">Topic<select name="topic"><option>Using Talk Shops</option><option>Account or Sign-In</option><option>Customer Notifications</option><option>Plans and Billing</option><option>Report a Problem</option><option>Feature Request</option></select></label>
          <label class="field help-wide">How Can We Help?<textarea name="message" required maxlength="3400" rows="5"></textarea></label>
          <div hidden aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
          <p id="helpStatus" class="help-wide" role="status" aria-live="polite"></p><button class="btn primary" type="submit">Send to Support</button>
        </form><p class="muted">You can also email <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      </section>
    </section>`;
  }

  function salesView() {
    return `<div class="login-wrap"><section class="login" style="width:min(520px,100%)">
      ${brand()}<h2>Contact Sales</h2>
      <p class="muted">Tell us about your shop and how we can help. Our team will reply by email.</p>
      <form class="auth-alt" id="salesForm">
        <label class="field">Your Name<input name="name" autocomplete="name" required maxlength="100"></label>
        <label class="field">Work Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label class="field">Shop Name<input name="shop" autocomplete="organization" required maxlength="160"></label>
        <label class="field">Phone Number (Optional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
        <label class="field">How Can We Help?<textarea name="message" required maxlength="4000" rows="5" placeholder="Tell us what you’re looking for or ask a question."></textarea></label>
        <div hidden aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <p id="salesStatus" role="status" aria-live="polite" style="margin:0"></p>
        <button class="btn primary" type="submit">Send Request</button>
      </form>
      <a href="/">Back to Home</a>
    </section></div>`;
  }

  function forgotView() {
    const r = ui.reset || { step: "ask", email: "" };
    const ask = r.step === "ask";
    return `<div class="login-wrap"><section class="login">
      ${brand()}
      <h2>Reset your password</h2>
      ${ask ? `<p class="muted" style="margin:0">Enter the email you sign in with. We'll send a 6-digit code to that email, or by text to the phone you verified in Shop Settings.</p>
      <form class="auth-alt" id="forgotForm">
        <label class="field">Work email<input id="fp-email" type="email" required autocomplete="username" value="${esc(r.email || "")}"></label>
        <button class="btn primary" type="submit" name="channel" value="email" ${ui.busy ? "disabled" : ""}>Email me a code</button>
        <button class="btn" type="submit" name="channel" value="sms" ${ui.busy ? "disabled" : ""}>Text me a code</button>
      </form>` : `<p class="form-ok" role="status" style="margin:0">${esc(r.msg || "")}</p>
      <form class="auth-alt" id="resetForm">
        <label class="field">6-digit code<input id="fp-code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code"></label>
        <label class="field">New password<input id="fp-pass" type="password" required minlength="8" maxlength="72" autocomplete="new-password"><span class="hint">At least 8 characters.</span></label>
        <button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Set new password and sign in</button>
      </form>
      <button class="linkbtn" id="fpAgain" type="button" style="align-self:flex-start">Didn't get it? Send another code</button>`}
      ${ui.authErr ? `<p class="form-err" role="alert">${esc(ui.authErr)}</p>` : ""}
      ${signInHelp}
      <button class="linkbtn" id="fpBack" type="button" style="align-self:flex-start">← Back to sign in</button>
    </section></div>`;
  }

  function recoveryPanel() {
    const d = recovery.data;
    let body;
    if (!d) body = recovery.err ? `<p class="form-err" role="alert">${esc(recovery.err)}</p>` : `<p class="muted" style="margin:0">Loading…</p>`;
    else if (recovery.pending) body = `<p class="muted" style="margin:0">We texted a code to ${esc(recovery.pending)}. Enter it to finish.</p>
      <form id="recoveryCodeForm" class="auth-alt"><label class="field">6-digit code<input id="rc-code" inputmode="numeric" maxlength="7" required autocomplete="one-time-code"></label>
      <div class="btn-row"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Verify phone</button><button class="btn" type="button" id="rcCancel">Cancel</button></div></form>`;
    else if (d.verified) body = `<p style="margin:0">Reset codes can be texted to <b>${esc(d.phone)}</b>.</p>
      <div class="btn-row"><button class="btn" type="button" id="rcChange">Use a different phone</button><button class="btn" type="button" id="rcRemove">Remove</button></div>`;
    else body = `<p class="muted" style="margin:0">Add a mobile number so you can get a text if you forget your password. We'll text a code to confirm it's yours.</p>
      <form id="recoveryPhoneForm" class="auth-alt"><label class="field">Mobile number<input id="rc-phone" inputmode="tel" maxlength="30" required autocomplete="tel" placeholder="(555) 014-2290"></label>
      <div class="btn-row"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Text me a code</button></div></form>`;
    return `<section class="panel" id="recoveryPanel" style="margin-top:18px;display:flex;flex-direction:column;gap:12px">
      <h2 style="font-size:20px">Password reset phone</h2>
      ${body}
      ${d && recovery.err ? `<p class="form-err" role="alert">${esc(recovery.err)}</p>` : ""}
      <p class="muted" style="margin:0;font-size:13.5px">You can always reset your password by email from the sign-in page.</p>
    </section>`;
  }
  async function loadRecovery() {
    recovery.loading = true;
    try { recovery.data = await api("GET", "shop/recovery"); recovery.err = ""; }
    catch (e) { recovery.err = e.message; }
    recovery.loading = false;
    if (ui.view === "settings") render();
  }

  function loginView() {
    if (ui.authMode === "forgot") return forgotView();
    const signup = ui.authMode === "signup";
    return `<div class="login-wrap"><section class="login">
      ${brand()}
      ${joinBanner()}
      <h2>${signup ? (joinToken ? "Create your account" : "Create your shop account") : "Shop Sign In"}</h2>
      ${sb ? "" : `<p class="form-err">Sign-in isn't available on this copy of the site.</p>`}
      <button class="btn google" id="google" type="button">${googleIcon} Continue with Google</button>
      <div class="or">or use email</div>
      <form class="auth-alt" id="emailForm">
        <label class="field">Work email<input id="au-email" type="email" required autocomplete="username" value="${esc(join.info?.email || "")}"></label>
        <label class="field">Password<input id="au-pass" type="password" required minlength="8" autocomplete="${signup ? "new-password" : "current-password"}"></label>
        ${signup ? `<label class="field">Confirm password<input id="au-confirm" type="password" required autocomplete="new-password"></label>` : ""}
        <button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>${signup ? "Create my account" : "Sign in"}</button>
      </form>
      ${signup ? "" : `<button class="linkbtn" id="forgotPw" type="button" style="align-self:flex-start">Forgot password?</button>`}
      ${ui.authErr ? `<p class="form-err" role="alert">${esc(ui.authErr)}</p>` : ""}
      ${ui.authMsg ? `<p class="form-ok" role="status">${esc(ui.authMsg)}</p>` : ""}
      ${joinToken ? `<button class="linkbtn" id="authSwap" type="button">${signup ? "Already have an account? Sign in" : "Create an account"}</button>` : `<a class="linkbtn" href="${signup ? "/?login" : "/?login=signup"}">${signup ? "Already have an account? Sign in" : "Create an account"}</a>`}
      <small class="muted">Customers use their repair link. Only shop staff need an account.</small>
      ${signInHelp}
      <a class="login-home" href="/">← Back to Talk Shops</a>
    </section></div>`;
  }

  function homeView() {
    return `<div class="front">
      <header class="front-nav"><div class="front-inner">
        <a class="front-wordmark" href="#top" aria-label="Talk Shops home"><span class="brand-mark" aria-hidden="true">${$(".brand-mark").innerHTML}</span>Talk Shops</a>
        <nav aria-label="Main navigation"><a href="/?help">Help</a><a href="#plans">Compare Plans</a><a class="front-sign" href="/?login">Shop Sign In</a></nav>
      </div></header>
      <section class="front-hero" id="top"><div class="front-inner">
        <div class="front-intro"><h1>Keep customers in the loop, <em>from check-in to pickup.</em></h1>
          <p>See which repairs are waiting on approval and which cars are ready for pickup, all from one board. Send a private link by text or email so they can see photos, approve work and open their final bill. No customer account required.</p>
          <div class="front-actions"><a class="front-cta" href="${DEMO_PAGE}">Explore Demo Shop <span aria-hidden="true">↗</span></a><a class="front-tour" href="${DEMO_PAGE}?tour=1">Take the Guided Tour →</a></div>
        </div>
        <div class="front-preview" aria-label="Example customer repair page">
          <div class="front-window"><span>Customer view</span><span>Sample repair</span></div>
          <div class="front-order"><small>RIDGELINE AUTO REPAIR</small><h2>2018 Honda Civic</h2><span>Brake service · RO-1001</span></div>
          <ol class="front-timeline"><li><b>Vehicle checked in</b><small>9:10 AM</small></li><li><b>Inspection photos shared</b><small>9:42 AM</small></li><li><b>Estimate approved</b><small>10:03 AM</small></li></ol>
          <div class="front-estimate"><div><b>Front brake pads</b><small>Approved by customer</small></div><strong>$240.00</strong></div>
        </div>
      </div></section>
      <section class="front-work"><div class="front-inner">
        <div class="front-workflow"><h2>From the Service Counter to the Customer’s Phone</h2>
          <p>Your team works from one repair order. The customer follows that repair through the same private link from drop-off to pickup.</p>
          <dl><div><dt>Get the Story Before Drop-Off</dt><dd>Invite customers to describe the concern and upload photos, so the technician can see what they’re coming in for.</dd></div>
          <div><dt>See Which Cars Need Attention</dt><dd>Search the Bay by customer, vehicle or repair order. Filter for estimates awaiting a decision or cars ready for pickup.</dd></div>
          <div><dt>Show What the Technician Found</dt><dd>Record the vehicle’s condition with walk-around photos and before-and-after checklists. Share findings with technician notes and repair diagrams.</dd></div>
          <div><dt>Know What the Customer Approved</dt><dd>Customers approve or decline each estimate item and sign on their phone. The shop sees their choices, the approved total and when they signed.</dd></div>
          <div><dt>Quote Using Your Shop’s Rates</dt><dd>Import labor, parts and fees from Excel or CSV. Reuse saved prices and enter hours or quantities when building an estimate.</dd></div>
          <div><dt>Make Pickup Easier</dt><dd>Send the final total with an itemized bill or your own PDF. Look up the repair in the archive when the customer comes back.</dd></div></dl>
          <button class="linkbtn" id="watchDemo" type="button">Watch the walkthrough video →</button>
        </div>
      </div></section>
      <section class="front-plans" id="plans"><div class="front-inner">
        <h2>Choose Your Plan</h2><p>Both plans include the Bay board, customer repair links, photo updates, signed estimate decisions, final bills and unlimited email.</p>
        <div class="front-tiers">
          <article><h3>Talk Shops Starter</h3><strong>$59<small> / month</small></strong><p><b>1,000 texts</b> per month</p><p>3 staff seats · up to 2 owners</p><small>Annual billing: $590/year</small><p><a class="btn primary" href="/?login=signup">Create your shop account</a></p></article>
          <article><h3>Talk Shops Pro</h3><strong>$99<small> / month</small></strong><p><b>3,000 texts</b> per month</p><p>8 staff seats · up to 3 owners</p><p><b>Smart Replies</b> can answer routine texts about repair status, shop hours or estimate links. Your shop chooses which replies go out automatically.</p><p><b>AI Repair Assistant</b> gives technicians a starting point for repair procedures and tool lists.</p><small>Annual billing: $990/year</small><p><a class="btn primary" href="/?login=signup">Create your shop account</a></p></article>
        </div>
        <h3 class="front-market-title">Plan Comparison</h3>
        <table class="front-market"><thead><tr><th scope="col">Plan</th><th scope="col">Monthly</th><th scope="col">Included in this plan</th></tr></thead><tbody>
          <tr><th scope="row">Talk Shops Starter</th><td>$59</td><td>Customer updates, approvals and 1,000 texts</td></tr>
          <tr><th scope="row">Talk Shops Pro</th><td>$99</td><td>Everything in Starter, plus Smart Replies, the AI repair assistant and higher staff and text limits</td></tr>
          <tr><th scope="row"><a href="https://www.shopmonkey.io/pricing">Shopmonkey Basic</a></th><td>$239</td><td>Shop management, two-way texting and electronic signatures</td></tr>
          <tr><th scope="row"><a href="https://www.tekmetric.com/pricing">Tekmetric Scale</a></th><td>$439</td><td>Shop management, two-way texting and technician board</td></tr>
        </tbody></table>
        <small class="front-source">Selected plans at month-to-month list prices, checked November 8, 2026. Competitor plans include additional shop-management features.</small>
      </div></section>
      <footer class="front-footer"><div class="front-inner"><b>Talk Shops</b><a href="/?help">Help &amp; Support</a><a href="/?contact=sales">Contact Sales</a><a href="/privacy.html">Privacy Policy</a></div></footer>
    </div>`;
  }

  function setupView(firstTime) {
    const s = shop || {};
    return `<div class="${firstTime ? "login-wrap" : ""}"><form class="${firstTime ? "login" : "panel"}" id="setupForm">
      ${firstTime ? brand() : ""}
      ${firstTime && join.err ? `<p class="form-err" role="alert">${esc(join.err)}</p><p class="muted" style="margin:0">Joining someone else's shop? Ask the owner to send a new invite to the email you signed in with. Or set up your own shop below.</p>` : ""}
      <h2>${firstTime ? "Set up your shop" : "Shop Settings"}</h2>
      <p class="muted" style="margin:0">Customers see this name and phone number in notifications and on their car's page.</p>
      <label class="field">Shop name<input id="sh-name" required maxlength="80" value="${esc(s.name || "")}" placeholder="e.g. Ridgeline Auto Repair"></label>
      <label class="field">Shop phone<input id="sh-phone" inputmode="tel" maxlength="30" value="${esc(s.phone || "")}" placeholder="(555) 014-2290"></label>
      <label class="field">Hours<input id="sh-hours" maxlength="60" value="${esc(s.hours || "")}" placeholder="Mon–Fri 7:30am–6pm"></label>
      ${!firstTime && plan?.smartReplies ? `<fieldset><legend>Smart Replies</legend><p class="hint">Choose questions Talk Shops may answer automatically by text. Leave all unchecked for staff review.</p>${[["status","Repair status"],["hours","Posted shop hours"],["link","Resend estimate link"]].map(([key,label])=>`<label class="chk"><input type="checkbox" name="smartTopic" value="${key}" ${s.smartTopics?.includes(key)?"checked":""}>${label}</label>`).join("")}<details><summary>Schedule and signature</summary>
      <label class="field">Sign replies as<input id="sr-sign" maxlength="60" value="${esc(s.smartSchedule?.signature || "")}" placeholder="Service team"></label>
      <label class="chk"><input type="checkbox" id="sr-after" ${s.smartSchedule?.afterHours?"checked":""}>Auto-send only outside these shop hours</label>
      <label class="field">Time zone<input id="sr-zone" value="${esc(s.smartSchedule?.zone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago")}"></label>
      <div class="btn-row">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=>`<label><input type="checkbox" name="sr-day" value="${i+1}" ${(s.smartSchedule?.days||[1,2,3,4,5]).includes(i+1)?"checked":""}>${d}</label>`).join("")}</div>
      <div class="btn-row"><label>Opens <input type="time" id="sr-open" value="${esc(s.smartSchedule?.open || "08:00")}"></label><label>Closes <input type="time" id="sr-close" value="${esc(s.smartSchedule?.close || "17:00")}"></label></div></details><a href="/demo.html?smart=1" target="_blank" rel="noopener">Try sample customer texts</a></fieldset>` : ""}
      <label class="field">Shop email (optional)<input id="sh-email" type="email" maxlength="254" autocomplete="email" value="${esc(s.email || "")}" placeholder="service@yourshop.com"><span class="hint">When a customer replies to an email update, it goes here.</span></label>
      ${firstTime ? "" : window.BayAge.fields(s)}
      ${firstTime ? "" : `<button class="btn" type="button" data-billing="rates">Saved items: labor, parts and fees (import Excel or CSV)</button>`}
      <div class="btn-row"><button class="btn primary" type="submit">${firstTime ? "Open my shop board" : "Save"}</button>${firstTime ? `<button class="btn" type="button" id="signOut2">Sign Out</button>` : ""}</div>
    </form>${firstTime ? "" : team.panel(render) + recoveryPanel()}</div>`;
  }

  function joinBanner() {
    if (!joinToken) return "";
    if (join.err) return `<p class="form-err" role="alert">${esc(join.err)}</p>`;
    if (!join.info) return `<p class="muted" style="margin:0">Checking your invite…</p>`;
    const i = join.info;
    return `<div class="join-note" role="status"><b>${esc(i.shopName)}</b> invited you to join as ${i.role === "owner" ? "an Owner" : "a Technician"}.
      ${ui.authMode === "signup" ? "Create your account" : "Sign in or create an account"} with <b>${esc(i.email)}</b> and the shop opens for you.</div>`;
  }

  // Technicians see the shop's details but can't change them; the reset phone is their own.
  function techSettingsView() {
    const s = shop || {};
    const row = (k, v) => v ? `<div class="ro-row"><span class="muted">${k}</span><b>${esc(v)}</b></div>` : "";
    return `<div><section class="panel" style="display:flex;flex-direction:column;gap:10px">
      <h2>Shop Settings</h2>
      ${row("Shop name", s.name)}${row("Shop phone", s.phone)}${row("Hours", s.hours)}${row("Shop email", s.email)}
      <p class="muted" style="margin:0">You're signed in as a <b>technician</b>. A shop owner can change these details, prices, the plan and the team.</p>
    </section>${recoveryPanel()}</div>`;
  }

  function techBanner(p) {
    if (!p || p.canWork) return "";
    return `<div class="plan-banner ended"><span><b>Customer updates are paused.</b> The shop's plan needs attention. Ask a shop owner to open the Plan tab.</span></div>`;
  }

  function boardView() {
    window.BayAge.apply(shop);
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
    const filters = [["all", "All Cars", inShop.length], ["approval", "Awaiting Approval", waiting], ["ready", "Ready for Pickup", ready]];
    let h = `<div class="board-top queue-top"><div><h2>${esc(bayName())}</h2><p class="muted queue-sub">${inShop.length} car${inShop.length === 1 ? "" : "s"} in the shop · ${sent} update${sent === 1 ? "" : "s"} sent today</p></div><button class="btn primary queue-add" data-view="checkin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Check In Vehicle</button></div>
      <div class="queue-tools"><label class="board-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="boardSearch" type="search" placeholder="Search name, vehicle, RO, phone…" aria-label="Search cars in the shop" value="${esc(ui.q || "")}" autocomplete="off"></label>
      <div class="queue-filters" role="group" aria-label="Filter vehicles">${filters.map(([key, label, count]) => `<button type="button" class="qf ${key === "approval" ? "warn" : key === "ready" ? "ok" : ""}" data-queue="${key}" aria-pressed="${key === (ui.queue || "all")}">${label}<b>${count}</b></button>`).join("")}</div></div>
      ${window.BayAge.legend(shop)}
      <p class="board-none muted" id="boardNone" hidden></p>
      <div class="board-wrap"><div class="board">`;
    STAGES.filter((s) => s.key !== "picked_up").forEach((s) => {
      const list = active.filter((j) => j.stage === s.key);
      if (s.key === "invited" && !list.length) return;
      h += `<section data-stage="${s.key}" class="col ${s.key === "approval" ? "is-approval" : ""} ${s.key === "ready" ? "is-ready" : ""}"><div class="col-h"><h3>${s.key === "approval" ? "Estimate Review" : s.label}</h3><span>${list.length}</span></div>`;
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
        const age = ageOf(j);
        const hay = [vehicleStr(j), j.customer.name, j.customer.phone, j.customer.email, j.ro, j.concern, j.plate, j.vehicle?.plate, j.vehicle?.vin].filter(Boolean).join(" ").toLowerCase();
        const qk = awaitingDecision(j) ? "approval" : j.stage === "ready" ? "ready" : "other";
        h += `<button class="card ${age.cls}" ${window.BayBoard.metadata(j)} data-open="${j.id}" data-queue-key="${qk}" data-s="${esc(hay)}">
          <span class="veh queue-vehicle">${esc(vehicleStr(j) || "Vehicle details pending")}<span class="chev" aria-hidden="true">›</span></span>
          <span class="row"><span>${esc(ShopDisplay.name(j.customer.name))}</span><span class="mono">${esc(j.ro)}</span></span>
          ${j.concern ? `<span class="row concern"><span>${esc(j.concern)}</span></span>` : ""}
          <span class="row card-foot"><span class="age-chip" title="Time in the shop">${age.label} in shop</span><span class="pill stage-pill">${esc(s.key === "approval" ? "Estimate Review" : s.label)}</span>${pill}${reply ? `<span class="pill bad">New reply</span>` : ""}<span class="in-stage">${since(ev.t)} in stage</span></span></button>`;
      });
      h += `</section>`;
    });
    h += `</div></div><p class="muted" style="font-size:13px;margin-top:10px">${picked ? picked + " picked up in the last 2 days. " : ""}Tap a car to update its stage, build an estimate or message the customer. <button class="linkbtn" data-view="archive">Search picked-up cars</button></p>`;
    return h;
  }

  const bayName = () => (shop && shop.name ? shop.name + " Bay" : "Shop bay");
  // Time in the shop since check-in: green under a day, amber 1 to 3 days, red after that.
  function ageOf(j) {
    const start = ts(j.createdAt || j.events[0]?.t);
    return { label: since(start), cls: window.BayAge.bucket(start, shop) };
  }
  // Filters cards in place, so typing never re-renders the board or drops the keyboard.
  function filterBoard() {
    const q = (ui.q || "").trim().toLowerCase(), terms = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    document.querySelectorAll(".board .col").forEach((col) => {
      let n = 0;
      const q2 = ui.queue && ui.queue !== "all" ? ui.queue : "";
      col.querySelectorAll(".card[data-s]").forEach((c) => { const ok = (!q2 || c.dataset.queueKey === q2) && terms.every((t) => c.dataset.s.includes(t)); c.hidden = !ok; if (ok) n++; });
      col.classList.toggle("search-hide", !!((terms.length || q2) && !n));
      const count = col.querySelector(".col-h span"); if (count) count.textContent = n;
      shown += n;
    });
    const none = $("#boardNone");
    const q2 = ui.queue && ui.queue !== "all" ? ui.queue : "";
    if (none) { none.hidden = (!terms.length && !q2) || shown > 0; none.textContent = terms.length ? `No cars in the shop match "${(ui.q || "").trim()}". Picked-up cars are in the Archive.` : q2 === "approval" ? "No cars are awaiting approval." : "No cars are ready for pickup."; }
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
        const veh = vehicleStr(r) || "Vehicle not recorded";
        return `<li class="archive-item"><button class="archive-row" data-archive-open="${esc(r.id)}">
          <span class="a-main"><b>${esc(veh)}</b>${r.plate ? `<span class="mono">${esc(r.plate)}</span>` : ""}</span>
          <span class="a-who">${esc(ShopDisplay.name(r.customer?.name))}${r.customer?.phone ? " · " + esc(fmtPhone(r.customer.phone)) : ""}${r.customer?.email ? " · " + esc(r.customer.email) : ""}</span>
          <span class="a-concern">${esc(r.concern || "")}</span>
          <span class="a-meta"><span class="mono">${esc(r.ro)}</span><span>${r.closedReason ? `<span class="pill bad">Closed</span> ${esc(r.closedReason)},` : "Picked up"} ${esc(new Date(ts(r.archivedAt)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</span>${r.total ? `<span>${money(r.total)}</span>` : ""}<span class="muted">Deletes ${deleteDate(r.archivedAt)}</span></span>
        </button>${isOwner() ? `<button class="archive-del" data-delete-archived="${esc(r.id)}" aria-label="Delete ${esc(r.ro)} permanently">Delete</button>` : ""}</li>`;
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
      <h2>Customer Check-In</h2>
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
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Check In and Notify Customer</button></div>
    </form>`;
  }

  function bubble(m, j) {
    const unsent = m.dir === "out" && m.delivery && m.delivery !== "sent";
    const who = m.dir === "out" ? (m.autoReply ? "Auto-replied" : channelName(m) + " to customer" + (m.sender ? " · "+esc(m.sender) : "")) : esc(first(j.customer.name));
    const status = unsent ? `<strong class="delivery-state">${m.delivery === "failed" ? "Delivery failed" : "Message not sent"}</strong>${m.note ? `<details class="delivery-detail"><summary>Delivery details</summary><p>${esc(m.note)}</p></details>` : ""}` : "";
    const text = !j.link ? esc(m.text) : esc(m.text).replace(esc(j.link), `<a href="${esc(j.link)}" target="_blank" rel="noopener" title="${esc(j.link)}">Customer Page</a>`);
    const draft = unsent && m.channel === "email" && j.customer.email && j.customer.consent
      ? `<a class="btn" href="mailto:${esc(encodeURIComponent(j.customer.email))}?subject=${esc(encodeURIComponent(shop.name + " · " + j.ro))}&amp;body=${esc(encodeURIComponent(m.text))}">Open email draft</a>` : "";
    return `<div class="bubble ${m.dir}${unsent ? " unsent" : ""}">${text}<span class="meta">${who} · ${dayClock(m.t)}</span>${status}${draft}</div>`;
  }

  function sheetView(j) {
    const idx = SI[j.stage];
    const steps = STAGES.map((s, i) => s.key === "invited" || (j.stage === "invited" && (s.key !== "checked_in" || !j.intakeReceived)) ? "" : `<button class="step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}" data-stage="${s.key}" ${i === idx ? 'aria-current="step"' : ""} ${s.key === "approval" && !isOwner() && i !== idx ? 'disabled title="A shop owner sends the estimate for approval"' : ""}>${s.key === "approval" && i === idx ? estimateOutcome(j) || s.label : s.label}</button>`).join("");
    const next = STAGES[idx + 1];
    const rows = j.estimate.map((e) => `<tr><td>${esc(e.item)}${chargeDetail(e)}<div class="pri-cell">${e.status === "pending" ? `<select class="pri-sel" data-pri="${esc(e.id)}" aria-label="Priority for ${esc(e.item)}">${priOptions(e.priority)}</select>` : priPill(e)}</div>${window.repairGuideFor(e.item)}</td><td>${e.status === "pending" ? '<span class="pill warn">Pending</span>' : e.status === "approved" ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Declined</span>'}</td><td class="num">${money(e.price)}</td><td class="num">${e.status === "pending" && j.stage !== "approval" ? `<button class="linkbtn" data-del="${e.id}" aria-label="Remove ${esc(e.item)}">Remove</button>` : ""}</td></tr>`).join("");
    const log = [...j.events].reverse().map((e) => `<li><time>${clock(e.t)}</time><span>${STAGES[SI[e.stage]].label}</span></li>`).join("");
    return `<div class="scrim" data-close></div><aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <div class="sheet-h"><div><div class="mono muted">${esc(j.ro)}${j.plate ? " · " + esc(j.plate) : ""}</div><h2 id="sheetTitle">${esc(vehicleStr(j) || "Vehicle details pending")}</h2><div class="muted">${esc(ShopDisplay.name(j.customer.name))} · ${esc(contact(j.customer))}</div><button type="button" class="linkbtn" data-edit-customer>Edit Customer Info</button></div><button class="x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body" data-job="${esc(j.id)}">
        ${j.closed ? `<section class="sec closed-note"><p><b>Closed without repair</b> · ${esc(j.closed.reason)} · ${dayClock(j.closed.t)}</p><p class="muted">This car is in the Archive.</p>${isOwner() ? `<div class="btn-row"><button class="btn" data-reopen>Reopen and put back on the board</button><button class="btn danger" data-delete-job>Delete permanently</button></div>` : ""}</section>` : ""}
        <section class="sec"><details class="stage-picker" ${window.TOUR_ACTIVE ? "open" : ""}><summary><span>Repair Stage</span><strong>${STAGES[idx].key === "approval" ? estimateOutcome(j) || STAGES[idx].label : STAGES[idx].label}</strong></summary><div class="stepper">${steps}</div></details>
          <div class="btn-row" style="margin-top:10px">${next && (j.stage !== "invited" || j.intakeReceived) && (next.key !== "approval" || isOwner()) ? `<button class="btn primary" data-stage="${next.key}">Move to ${next.label}</button>` : ""}<a class="btn" href="${esc(j.link)}" target="_blank" rel="noopener" style="text-decoration:none">Customer Page</a>${j.stage !== "picked_up" && !j.closed && isOwner() ? `<button class="btn" data-close-job>Close Without Repair</button>` : ""}</div>
          ${j.stage === "parts" ? `<label class="field" style="margin-top:10px">Parts ETA<input id="eta" value="${esc(j.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
        </section>
        ${j.stage === "invited" && !j.intakeReceived ? `<section class="sec"><h3>Awaiting customer intake</h3><details><summary>Enter details at the shop</summary>${intakeForm()}</details></section>` : ""}
        ${j.concern ? `<section class="sec"><h3>Concern</h3><div>${esc(j.concern)}</div></section>` : ""}
        ${vehicleStr(j) && !j.closed && j.stage !== "picked_up" ? `<p class="howto-link"><button class="linkbtn" data-howto-job="${esc(j.id)}">Open Repair Guide</button></p>` : ""}
        ${j.stage === "invited" && !j.intakeReceived ? "" : window.Walkthrough.sheetSection(j)}
        ${j.stage === "invited" && !j.intakeReceived ? "" : `<section class="sec"><h3>Estimate</h3>
          ${j.estimate.length ? `<div style="overflow-x:auto"><table class="est"><thead><tr><th>Item</th><th>Status</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${j.estimate.some((e) => e.status !== "pending") ? `<div class="total"><span>Approved total</span><span>${money(estTotal(j, true))}</span></div><div class="total sub"><span>Total quoted</span><span>${money(estTotal(j))}</span></div>` : `<div class="total"><span>Total quoted</span><span>${money(estTotal(j))}</span></div>`}` : `<p class="muted" style="margin:0">No line items yet.</p>`}
          ${j.approval ? `<p class="muted" style="font-size:13px">Signed by ${esc(j.approval.by)} on ${dayClock(j.approval.t)}</p>` : ""}
          <div class="est-add">
            <div class="est-add-h">Quick add</div>
            <form class="add-line" id="addLine"><span class="suggest-wrap"><input id="li-item" data-suggest="quick" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="${(shop.rates || []).length ? "Type or pick a saved item" : "Item, e.g. Cabin air filter"}" aria-label="Line item"><button type="button" class="suggest-btn" data-suggest-open aria-label="Show saved items" ${(shop.rates || []).length ? "" : "hidden"}>▾</button></span><input id="li-price" inputmode="decimal" placeholder="Price" aria-label="Price"><button class="btn" type="submit">Add</button>
              <label class="pri-pick">Priority<select id="li-pri">${priOptions(ui.lastPri)}</select></label>
              ${isOwner() ? `<label class="chk save-chk"><input type="checkbox" id="li-save" checked> Save new items for next time</label>` : ""}</form>
            <div class="est-add-or"><span>or</span></div>
            <button class="btn est-add-more" type="button" data-billing="quote">Add labor, parts or fees with hours and rates</button>
          </div>
          ${j.estimate.some((e) => e.status === "pending") && j.stage !== "approval" ? (isOwner() ? `<button class="btn primary est-send" data-stage="approval">Send estimate for approval</button>` : `<p class="muted est-send-note">A shop owner reviews these lines and sends the estimate to ${esc(first(j.customer.name))}.</p>`) : ""}
        </section>
        <section class="sec"><h3>Final Bill</h3>
          ${j.bill ? `<p>${j.bill.mode === "upload" ? "Shop PDF" : "Itemized bill"} · ${money(j.bill.total)}</p>` : isOwner() ? "" : `<p class="muted" style="margin:0">No final bill yet. A shop owner creates it.</p>`}
          <div class="btn-row">${isOwner() ? `<button class="btn" data-billing="generated">${j.bill?.mode === "generated" ? "Edit itemized bill" : "Create itemized bill"}</button><button class="btn" data-billing="upload">Upload shop PDF</button>` : ""}${j.bill?.mode==="upload" ? '<button class="linkbtn" data-billing="download">Download current PDF</button>' : ""}</div>
        </section>`}
        <section class="sec"><h3>Photos</h3><div class="photos">${j.photos.map((p) => photoFigure(p, true)).join("")}
          <button type="button" class="photo-add" id="pickPhoto">+ Add photo<br><span style="font-weight:400">Customer sees it on their page</span></button><p id="photoStatus" role="status" hidden></p></div></section>
        ${j.closed || j.stage === "picked_up" && !(j.walkaround || []).length ? "" : window.Walkaround.sheetSection(j)}
        <section class="sec"><h3>Technician Notes <span class="sec-sub">Shared with customer</span></h3>
          ${(j.notes || []).length ? `<ul class="notes">${[...j.notes].reverse().map((n) => `<li><time>${dayClock(n.t)}</time><p>${esc(n.text)}</p><button type="button" class="linkbtn" data-remove-note="${esc(n.id)}">Remove</button></li>`).join("")}</ul>` : ""}
          <form id="noteForm" class="note-form"><textarea id="noteIn" maxlength="2000" placeholder="Describe your findings…" aria-label="Technician note">${esc(ui.noteDraft[j.id] || "")}</textarea>
            <div class="btn-row"><button type="button" class="btn mic" data-dictate="#noteIn" aria-pressed="false" aria-label="Voice typing"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg><span class="mic-label">Speak</span></button><button class="btn primary" type="submit">Post Note</button></div>
            <label class="chk"><input type="checkbox" id="noteSend" ${j.customer.consent ? "" : "disabled"}> Notify ${esc(ShopDisplay.name(first(j.customer.name)))} about this note${j.customer.consent ? "" : " (customer has not agreed to notifications)"}</label></form></section>
        <section class="sec"><h3>Messages</h3><div class="thread">${j.messages.map((m) => bubble(m, j)).join("") || '<p class="muted">No messages yet.</p>'}</div>
          ${plan?.smartReplies ? `<div class="btn-row"><button class="linkbtn" type="button" data-smart-pause>${j.smartPaused?"Resume auto-replies":"Pause auto-replies for this repair"}</button>${j.messages.at(-1)?.incomingSms && j.messages.at(-1)?.suggestion ? '<button class="btn sm" type="button" data-smart-draft>Use suggested reply</button>' : j.messages.at(-1)?.incomingSms ? '<button class="btn sm" type="button" data-smart-ai>Draft reply for review</button>' : ""}</div>` : ""}
          <form class="add-line" id="replyForm" style="grid-template-columns:minmax(0,1fr) auto auto"><input id="replyIn" maxlength="1000" placeholder="Message ${esc(first(j.customer.name))}…" aria-label="Message"><button type="button" class="btn mic" data-dictate="#replyIn" aria-pressed="false" aria-label="Voice typing"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="btn primary" type="submit">Send</button></form></section>
        <section class="sec"><h3>History</h3><ul class="log">${log}</ul></section>
        ${isOwner() ? `<section class="sec danger-zone"><details class="repair-management"><summary>Manage Repair</summary><button class="linkbtn danger" data-delete-job>Delete this repair permanently</button><p class="muted">Removes the car, photos, messages and the customer's link. This can't be undone. To keep a record, use Close without repair instead.</p></details></section>` : ""}
      </div></aside>`;
  }

  function customerModal() {
    const c = job(ui.modal.customerJob).customer, preference = c.preference || "sms";
    return `<div class="modal"><form class="modal-card customer-editor" id="customerForm" role="dialog" aria-modal="true" aria-labelledby="ecTitle">
      <h2 id="ecTitle">Edit Customer Info</h2>
      <p class="muted" style="margin:0">Changes apply to this repair and future updates. Saving does not send a message.</p>
      <label class="field">Customer Name<input id="ec-name" autocomplete="name" required maxlength="80" value="${esc(c.name)}"></label>
      <label class="field">Notify Customer By<select id="ec-channel"><option value="sms" ${preference === "sms" ? "selected" : ""}>Text message</option><option value="email" ${preference === "email" ? "selected" : ""}>Email</option><option value="both" ${preference === "both" ? "selected" : ""}>Text and email</option></select></label>
      <label class="field">Mobile Number<input id="ec-phone" type="tel" autocomplete="tel" maxlength="30" ${preference !== "email" ? "required" : ""} value="${esc(c.phone || "")}"></label>
      <label class="field">Email Address<input id="ec-email" type="email" autocomplete="email" maxlength="254" ${preference !== "sms" ? "required" : ""} value="${esc(c.email || "")}"></label>
      <label class="chk"><input type="checkbox" id="ec-consent" ${c.consent ? "checked" : ""}> Customer agreed to repair updates through the selected contact method.</label>
      <small class="muted">If you change the contact details or notification method, confirm consent again. Leave unchecked to pause notifications.</small>
      <p id="ec-error" role="alert" class="form-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">Save Changes</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    </form></div>`;
  }

  function customerContactChanged() {
    $("#ec-consent").checked = false;
    $("#ec-phone").required = $("#ec-channel").value !== "email";
    $("#ec-email").required = $("#ec-channel").value !== "sms";
  }

  function closeModal() {
    const j = job(ui.modal.closeJob);
    const text = `Hi ${first(j.customer.name)}, we've closed out repair order ${j.ro} for your ${vehicleStr(j) || "vehicle"}. Thanks for considering ${shop.name}. Call us anytime if you change your mind.`;
    return `<div class="modal"><form class="modal-card" id="closeForm" role="dialog" aria-modal="true" aria-labelledby="cTitle">
      <h2 id="cTitle">Close Without Repair</h2>
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
      <p class="muted" style="margin:0">Notify ${esc(ShopDisplay.name(j.customer.name))} at ${esc(contact(j.customer))}</p>
      ${m.stage === "parts" ? `<label class="field">Parts ETA<input id="m-eta" value="${esc(m.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
      ${m.stage === "ready" ? `<div><strong>Final Bill</strong><p>${j.bill ? money(j.bill.total) + " due at pickup" : "Optional. Customers can open their bill from the pickup link."}</p>
        ${isOwner() ? `<div class="btn-row"><button class="btn" type="button" data-billing="generated">Create / edit bill</button><button class="btn" type="button" data-billing="upload">Upload shop PDF</button></div>` : ""}</div>` : ""}
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
    else if (ui.modal?.customerJob) h += customerModal();
    else if (ui.modal?.closeJob) h += closeModal();
    else if (ui.modal?.walk) { const j = job(ui.modal.job); h += window.Walkthrough.editor(j, ui.modal.walk, { vehicle: vehicleStr(j) || j.ro, first: first(j.customer.name), consent: j.customer.consent, busy: ui.busy }); }
    else if (ui.modal) h += stageModal();
    const prev = $(".sheet-body"), keep = prev && prev.dataset.job === ui.openJob ? prev.scrollTop : null;
    const stageOpen = keep !== null && prev.querySelector(".stage-picker")?.open;
    $("#layer").innerHTML = h;
    if (stageOpen && $(".stage-picker")) $(".stage-picker").open = true;
    if (keep !== null && $(".sheet-body")) { $(".sheet").classList.add("no-anim"); $(".sheet-body").scrollTop = keep; }
    suggest.refresh();
    if (!isOwner()) $('#billingForm [name="saveItems"]')?.closest("label")?.remove();
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
    if (t.dataset.queue) { ui.queue = t.dataset.queue; document.querySelectorAll("[data-queue]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); filterBoard(); return; }
    if (ui.modal?.walk && window.Walkthrough.click(t, ui.modal.walk)) return;
    if (t.dataset.walk) { const j = job(ui.openJob); if (j) { ui.modal = { walk: window.Walkthrough.draftFor(j, t.dataset.walk), job: j.id }; renderLayer(); } return; }
    if(t.hasAttribute("data-smart-ai")){
      const id=ui.openJob, at=job(id)?.messages.at(-1)?.t, input=$("#replyIn"), before=input.value;t.disabled=true;
      try {const result=await api("POST","shop/jobs/"+id+"/smart-draft",{at});
        if(ui.openJob===id && input.isConnected && input.value===before){input.value=result.draft;input.focus();}
      }catch(e){toast(e.message);}finally{t.disabled=false;}return;
    }
    if(t.hasAttribute("data-smart-draft")) {const input=$("#replyIn");input.value=job(ui.openJob)?.messages.at(-1)?.suggestion || "";input.focus();return;}
    if(t.hasAttribute("data-smart-pause")) {const j=job(ui.openJob);if(j)await jobAction(j.id,"smart-pause",{paused:!j.smartPaused});return;}
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
      await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authRedirect(), queryParams: { prompt: "select_account" } } });
      return;
    }
    if (t.id === "forgotPw") { ui.authMode = "forgot"; ui.reset = { step: "ask", email: $("#au-email")?.value.trim() || "" }; ui.authErr = ui.authMsg = ""; render(); $("#fp-email")?.focus(); return; }
    if (t.id === "fpBack") { ui.authMode = "signin"; ui.authErr = ui.authMsg = ""; const email = ui.reset?.email; ui.reset = null; render(); if (email && $("#au-email")) $("#au-email").value = email; return; }
    if (t.id === "fpAgain") { ui.reset = { ...ui.reset, step: "ask" }; ui.authErr = ""; render(); return; }
    if (t.id === "rcChange") { recovery.data = { ...recovery.data, verified: false }; recovery.err = ""; render(); $("#rc-phone")?.focus(); return; }
    if (t.id === "rcCancel") { recovery.pending = ""; recovery.err = ""; recovery.data = null; render(); return; }
    if (t.id === "rcRemove") {
      if (ui.busy) return; ui.busy = true;
      try { recovery.data = await api("DELETE", "shop/recovery"); recovery.err = ""; toast("Reset phone removed"); } catch (err) { recovery.err = err.message; }
      ui.busy = false; render(); return;
    }
    if (t.id === "authSwap") { ui.authMode = ui.authMode === "signup" ? "signin" : "signup"; ui.authErr = ui.authMsg = ""; render(); return; }
    if (t.id === "signOut" || t.id === "signOut2") { if (sb) await sb.auth.signOut(); return; }
    if (t.id === "retry") { loadShop(); return; }
    if (t.dataset.archiveOpen) { openArchived(t.dataset.archiveOpen); return; }
    if (t.hasAttribute("data-archive-retry")) { archive.error = ""; renderArchiveRows(); searchArchive(); return; }
    if (t.hasAttribute("data-suggest-open")) return;
    if (await team.click(t, render)) return;
    if (await planUi.click(t, render)) return;
    if (howTo.click(t, render)) return;
    if (t.dataset.howtoJob) { const j = job(t.dataset.howtoJob); if (j) howTo.openFor(j); ui.view = "howto"; ui.openJob = null; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.view === "plan") api("GET", "shop/plan").then((p) => { plan = p; if (ui.view === "plan") render(); }).catch(() => {});
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
    if (t.hasAttribute("data-edit-customer")) { ui.modal = { customerJob: ui.openJob }; renderLayer(); $("#ec-name")?.focus(); return; }
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
    if (f.id === "helpForm") {
      const button = f.querySelector('[type="submit"]'), status = $("#helpStatus");
      if (button.disabled) return;
      const data = Object.fromEntries(new FormData(f));
      data.message = `Support request: ${data.topic}\nShop ID: ${shop?.id || "Not signed in"}\nRole: ${role || "Visitor"}\n\n${data.message}`;
      button.disabled = true; button.textContent = "Sending…"; status.textContent = "";
      f.setAttribute("aria-busy", "true");
      try {
        await api("POST", "shop/sales", data);
        f.innerHTML = '<p class="form-ok help-wide" role="status">Your support request has been sent. Our team will reply to your email.</p>';
      } catch (error) {
        status.textContent = error.message; status.className = "form-err help-wide";
        button.disabled = false; button.textContent = "Send to Support";
      } finally { f.removeAttribute("aria-busy"); }
      return;
    }
    if (f.id === "salesForm") {
      const button = f.querySelector('[type="submit"]'), status = $("#salesStatus");
      if (button.disabled) return;
      const data = Object.fromEntries(new FormData(f));
      button.disabled = true; button.textContent = "Sending…"; status.textContent = "";
      try {
        await api("POST", "shop/sales", data);
        f.innerHTML = '<p class="form-ok" role="status">Your request has been sent. Our team will reply to your email.</p>';
      } catch (error) {
        status.textContent = error.message;
        status.className = "form-err";
        button.disabled = false; button.textContent = "Send Request";
      }
      return;
    }
    if (howTo.submit(f, render)) return;
    if (await team.submit(f, render)) return;
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
          const priority = ui.lastPri = f.elements.priority?.value || "recommended";
          upsertJob(await api("POST", `shop/jobs/${m.job}/estimate`, { charge, save, priority }));
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
    if (f.id === "forgotForm") {
      if (ui.busy) return;
      const email = $("#fp-email").value.trim(), channel = e.submitter?.value === "sms" ? "sms" : "email";
      ui.busy = true; ui.authErr = ""; ui.reset = { step: "ask", email }; render();
      try { const r = await api("POST", "shop/auth/forgot", { email, channel }); ui.reset = { step: "code", email, channel, msg: r.message }; }
      catch (err) { ui.authErr = err.message; }
      ui.busy = false; render(); $("#fp-code")?.focus();
      return;
    }
    if (f.id === "resetForm") {
      if (ui.busy || !sb) return;
      const email = ui.reset.email, code = $("#fp-code").value.replace(/\s/g, ""), password = $("#fp-pass").value;
      ui.busy = true; ui.authErr = ""; f.querySelector("[type=submit]").disabled = true;
      try {
        await api("POST", "shop/auth/reset", { email, code, password });
        const { error } = await sb.auth.signInWithPassword({ email, password });
        ui.authMode = "signin"; ui.reset = null;
        if (error) ui.authMsg = "Your password was changed. Sign in with your new password.";
        else toast("Password changed");
      } catch (err) { ui.authErr = err.message; }
      ui.busy = false; render();
      if ($("#fp-code")) { $("#fp-code").value = code; $("#fp-pass").value = password; }
      return;
    }
    if (f.id === "recoveryPhoneForm" || f.id === "recoveryCodeForm") {
      if (ui.busy) return;
      ui.busy = true; recovery.err = ""; f.querySelector("[type=submit]").disabled = true;
      const typed = f.querySelector("input").value;
      try {
        if (f.id === "recoveryPhoneForm") { const r = await api("POST", "shop/recovery/phone", { phone: $("#rc-phone").value }); recovery.pending = r.phone; }
        else { recovery.data = await api("POST", "shop/recovery/verify", { code: $("#rc-code").value }); recovery.pending = ""; toast("Phone verified"); }
      } catch (err) { recovery.err = err.message; }
      ui.busy = false; render();
      if (recovery.err) { const again = $("#" + f.id + " input"); if (again) again.value = typed; } else $("#rc-code")?.focus();
      return;
    }
    if (f.id === "emailForm") {
      if (!sb || ui.busy) return;
      const email = $("#au-email").value.trim(), password = $("#au-pass").value;
      const confirm = $("#au-confirm");
      if (confirm && confirm.value !== password) {
        confirm.setCustomValidity("Enter the same password in both fields.");
        confirm.reportValidity();
        confirm.setCustomValidity("");
        return;
      }
      ui.busy = true;
      ui.authErr = ui.authMsg = "";
      const submit = f.querySelector("[type=submit]");
      submit.disabled = true;
      submit.textContent = ui.authMode === "signup" ? "Creating account…" : "Signing in…";
      f.setAttribute("aria-busy", "true");
      $(".form-err")?.remove();
      $(".form-ok")?.remove();
      try {
        if (ui.authMode === "signup") {
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect() } });
          if (error) throw error;
          if (!data.session) ui.authMsg = "If a new account can be created with this email, check your inbox and spam for a confirmation link. Already signed up with Google? Choose Continue with Google. For an existing email/password account, sign in or use Forgot password.";
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
      } catch (err) {
        ui.authErr = /failed to fetch|load failed|networkerror/i.test(err.message)
          ? "We couldn't reach the account service. Check your connection and try again."
          : err.message === "Invalid login credentials" ? "That email and password don't match." : err.message;
      } finally {
        ui.busy = false;
        render();
        if (ui.authErr && $("#au-email")) $("#au-email").value = email;
      }
      return;
    }
    if (f.id === "customerForm") {
      if (ui.busy) return;
      const id = ui.modal.customerJob;
      const body = { name: $("#ec-name").value.trim(), phone: $("#ec-phone").value.trim(), email: $("#ec-email").value.trim(), preference: $("#ec-channel").value, consent: $("#ec-consent").checked };
      const button = f.querySelector('[type="submit"]'), error = $("#ec-error");
      ui.busy = true; button.disabled = true; button.textContent = "Saving…"; error.hidden = true;
      f.setAttribute("aria-busy", "true");
      try {
        const updated = await api("POST", `shop/jobs/${id}/customer`, body);
        upsertJob(updated); ui.modal = null;
        if (archive.rows) archive.rows = archive.rows.map((r) => r.id === id ? { ...r, customer: updated.customer } : r);
        render(); toast("Customer info saved"); $("[data-edit-customer]")?.focus();
      } catch (err) { error.textContent = err.message; error.hidden = false; }
      finally { ui.busy = false; button.disabled = false; button.textContent = "Save Changes"; f.removeAttribute("aria-busy"); }
      return;
    }
    if (f.id === "setupForm") {
      const ageSettings = f.querySelector(".age-settings") ? window.BayAge.read(f) : undefined;
      if (ageSettings === null) return;
      const body = { ageSettings, name: $("#sh-name").value, phone: $("#sh-phone").value, hours: $("#sh-hours").value, email: $("#sh-email").value };
      if($("#sr-zone")) body.smartSchedule={afterHours:$("#sr-after").checked,zone:$("#sr-zone").value,days:Array.from(f.querySelectorAll('[name="sr-day"]:checked'),e=>Number(e.value)),open:$("#sr-open").value,close:$("#sr-close").value,signature:$("#sr-sign").value};
      if(f.querySelector('[name="smartTopic"]')) body.smartTopics=Array.from(f.querySelectorAll('[name="smartTopic"]:checked'),el=>el.value);
      const r = await act(() => api("POST", "shop/me", body), "Saved");
      if (r) { shop = r.shop; if (r.plan) plan = r.plan; if (r.role) { role = r.role; mainOwner = !!r.mainOwner; } ui.view = "board"; render(); }
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
      const save = !!$("#li-save")?.checked;
      const priority = ui.lastPri = $("#li-pri")?.value || "recommended";
      const body = pick && pick.name === item ? { charge: { name: item, kind: pick.kind, rate: Math.round(price * 100) / 100, qty: 1 }, save, priority } : { item, price, save, priority };
      if (await jobAction(ui.openJob, "estimate", body)) {
        if (save) rememberLocal([{ name: item, kind: pick && pick.name === item ? pick.kind : "part", rate: Math.round(price * 100) / 100 }]);
        render(); $("#li-item")?.focus();
      }
      return;
    }
    if (f.id === "walkForm") {
      if (ui.busy) return;
      const m = ui.modal, body = window.Walkthrough.body(m.walk);
      if (!body.items.length) { toast("Mark at least one item first"); return; }
      const j = await jobAction(m.job, "walkthrough", body);
      if (j) { ui.modal = null; render(); toast("Walk-through saved" + (body.send ? ". " + sendResult(j) : " to the customer's page")); }
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
    if (e.target.id === "ec-channel") { customerContactChanged(); return; }
    if (e.target.dataset?.teamRole) { team.change(e.target, render); return; }
    if (e.target.dataset?.pri && ui.openJob) { jobAction(ui.openJob, "estimate", { setPriority: e.target.dataset.pri, priority: e.target.value }, "Priority updated"); return; }
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
    if (e.target.id === "ec-phone" || e.target.id === "ec-email") { customerContactChanged(); return; }
    if (e.target.id === "noteIn" && ui.openJob) { ui.noteDraft[ui.openJob] = e.target.value; return; }
    if (ui.modal?.walk && window.Walkthrough.input(e.target, ui.modal.walk)) return;
    if (e.target.id === "boardSearch") { ui.q = e.target.value; filterBoard(); return; }
    if (e.target.id === "archiveQ") { archive.q = e.target.value; clearTimeout(archiveTimer); archiveTimer = setTimeout(searchArchive, 250); return; }
    if (e.target.id === "li-item") delete e.target.form.dataset.pick;
    if (e.target.id === "intakePhotoIn") return uploadIntakePhotos(e.target);
    if (custToken && e.target.form?.id === "intakeForm") cust.intakeDraft[e.target.name] = e.target.value;
    if (ui.modal?.billing) { billing.updateTotal($("#billingForm")); return; }
    if (e.target.id === "sig") cust.sig = e.target.value;
    if (e.target.id === "photoIn") return uploadSelectedPhoto(e.target);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !ui.busy) { if (ui.modal) ui.modal = ui.modal?.pickup || null; else ui.openJob = null; renderLayer(); } });

  window.Walkaround.init({
    api, encode: encodePhoto, toast, first, sendResult,
    token: () => custToken, customer: () => cust.data, setCustomer: (d) => { cust.data = d; }, renderCustomer,
    job, openJob: () => ui.openJob, onJob: (j) => upsertJob(j), render: () => { if (custToken) return; render(); },
  });

  // ---------------- Start ----------------
  if (custToken) {
    loadCustomer();
    setInterval(() => { if (!cust.intakeBusy && !document.activeElement?.closest("#intakeForm") && !Object.keys(cust.draft).length && document.visibilityState === "visible") loadCustomer(); }, 30000);
    return;
  }
  if (!sb) { render(); return; }
  if (joinToken) {
    if (new URLSearchParams(location.search).has("join")) ui.authMode = "signup";
    api("GET", "shop/join/" + encodeURIComponent(joinToken))
      .then((i) => { join.info = i; })
      .catch((e) => { join.err = e.message; joinToken = ""; store.set(JOIN_KEY, ""); })
      .finally(() => { if (!session) { render(); const em = $("#au-email"); if (em && join.info && !em.value) em.value = join.info.email; } });
  }
  // Show the public page before session recovery or refresh finishes.
  render();
  // Back from Stripe: say so, and refresh the plan a few times while Stripe's confirmation arrives.
  const planNote = planUi.returned();
  if (planNote) {
    setTimeout(() => toast(planNote), 600);
    [3000, 8000, 20000].forEach((ms) => setTimeout(async () => { if (!shop) return; try { plan = await api("GET", "shop/plan"); render(); } catch (e) { /* later */ } }, ms));
  }
  sb.auth.onAuthStateChange((_event, s) => {
    const was = session?.user?.id;
    session = s;
    if (s && s.user.id !== was) { loaded = false; render(); loadShop(); }
    else if (!s) { Object.assign(recovery, { data: null, pending: "", err: "" }); team.reset(); role = null; mainOwner = false; join.err = ""; shop = null; jobs = []; loaded = false; ui.openJob = null; ui.modal = ui.modal === "video" ? "video" : null; if (was || !$("#emailForm")) render(); }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session && !$("#emailForm")) render(); });
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
