// Talk Shops: progress updates from repair shops to their customers. A plain page, no build step.
// Shop staff sign in with Supabase; customers open /?c=<token> from their text and never sign in.
// All data goes through the shared API (supabase/functions/_shared/shop.ts in this repo).
(function () {
  "use strict";
  const CFG = window.BAY_CONFIG || {};
  const DEMO_PAGE = "/demo.html";
  const DEMO_VIDEO = "/demo.mp4";
  const STAGES = [
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
  const ts = (t) => (typeof t === "number" ? t : Date.parse(t));
  const clock = (t) => new Date(ts(t)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayClock = (t) => { const d = new Date(ts(t)); return d.toDateString() === new Date().toDateString() ? clock(t) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + clock(t); };
  const since = (t) => { const m = Math.max(0, Math.round((Date.now() - ts(t)) / 60000)); if (m < 60) return m + "m"; const h = Math.floor(m / 60); if (h < 48) return h + "h " + (m % 60) + "m"; return Math.floor(h / 24) + "d"; };
  const vehicleStr = (j) => [j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" ");
  const estTotal = (j, approvedOnly) => j.estimate.filter((e) => !approvedOnly || e.status === "approved").reduce((a, e) => a + Number(e.price), 0);
  const fmtPhone = (p) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p || ""); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (p || ""); };
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
  const cust = { data: null, draft: {}, sig: "", error: "" };

  async function loadCustomer() {
    try { cust.data = await api("GET", "shop/c/" + encodeURIComponent(custToken)); cust.error = ""; }
    catch (e) { cust.error = e.status === 404 ? "This link isn't valid anymore. Please call the shop." : e.message; }
    renderCustomer();
  }

  function renderCustomer() {
    $("#shopChrome").hidden = true;
    const app = $("#app");
    if (cust.error && !cust.data) { app.innerHTML = `<div class="loading"><p>${esc(cust.error)}</p></div>`; return; }
    if (!cust.data) return;
    const j = cust.data, idx = SI[j.stage];
    document.title = j.shop.name + " · Your " + j.vehicle;
    const evAt = (k) => { const e = [...j.events].reverse().find((x) => x.stage === k); return e ? e.t : null; };
    const tl = STAGES.filter((s) => s.key !== "picked_up").map((s) => {
      const t = evAt(s.key);
      const cls = s.key === j.stage ? "current" : (t && SI[s.key] < idx ? "done" : "todo");
      return `<li class="${cls}"><span>${s.label}</span><time>${t ? dayClock(t) : ""}</time></li>`;
    }).join("");
    const pending = j.stage === "approval" && j.estimate.some((e) => e.status === "pending");
    let est = "";
    if (j.estimate.length) {
      const items = j.estimate.map((e) => {
        const d = cust.draft[e.id];
        const choice = pending && e.status === "pending"
          ? `<div class="decide"><button class="yes" data-decide="${e.id}" data-v="approved" aria-pressed="${d === "approved"}">Approve</button><button class="no" data-decide="${e.id}" data-v="declined" aria-pressed="${d === "declined"}">Decline</button></div>`
          : (e.status !== "pending" ? `<span class="pill ${e.status === "approved" ? "ok" : "bad"}">${e.status === "approved" ? "Approved" : "Declined"}</span>` : "");
        return `<div class="est-item"><div class="top"><span>${esc(e.item)}</span><span>${money(e.price)}</span></div>${choice}</div>`;
      }).join("");
      const allChosen = j.estimate.filter((e) => e.status === "pending").every((e) => cust.draft[e.id]);
      const tot = pending ? j.estimate.reduce((a, e) => a + ((cust.draft[e.id] ?? e.status) === "approved" ? Number(e.price) : 0), 0) : estTotal(j, true);
      est = `<div class="c-card"><h3>Estimate</h3>${items}<div class="total"><span>${pending ? "Approved so far" : "Approved total"}</span><span>${money(tot)}</span></div>
        ${pending ? `<label class="field" style="margin-top:10px">Type your full name to sign<input id="sig" autocomplete="name" value="${esc(cust.sig)}"></label>
        <button class="btn primary" style="width:100%;margin-top:10px" id="submitApproval" ${allChosen ? "" : "disabled"}>Send my decision</button>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">${allChosen ? "Your signed decision goes straight to the shop." : "Choose approve or decline for each item."}</p>`
        : (j.approval ? `<p class="muted" style="font-size:12.5px;margin:8px 0 0">Signed by ${esc(j.approval.by)} on ${dayClock(j.approval.t)}</p>` : "")}</div>`;
    }
    const photos = j.photos.length ? `<div class="c-card"><h3>Photos from your technician</h3><div class="photos">${j.photos.map((p) => `<figure class="photo" style="margin:0"><img class="img" src="${p.src}" alt="${esc(p.cap)}"><figcaption>${esc(p.cap)}</figcaption></figure>`).join("")}</div></div>` : "";
    const extra = j.stage === "parts" && j.eta ? `<p style="margin:6px 0 0">Parts expected <b>${esc(j.eta)}</b>.</p>`
      : j.stage === "ready" ? `<p style="margin:6px 0 0">Total due ${money(estTotal(j, true))}.${j.shop.hours ? " Open " + esc(j.shop.hours) + "." : ""}</p>` : "";
    app.innerHTML = `<div class="cust-page">
      <div class="c-head"><small>${esc(j.shop.name)} · <span class="mono">${esc(j.ro)}</span></small><h2>${STAGES[idx].cust}</h2><div style="font-size:14px;margin-top:4px">${esc(j.vehicle)}</div>${extra}</div>
      <div class="c-body">
        ${est}${photos}
        <div class="c-card"><h3>Progress</h3><ul class="tl">${tl}</ul></div>
        <div class="c-card"><h3>Your concern</h3><div style="font-size:14px">${esc(j.concern)}</div></div>
        ${j.shop.phone ? `<div class="c-card call"><span>Questions? Call the shop</span><b>${esc(j.shop.phone)}</b></div>` : ""}
        <p class="cust-top">We'll text you when anything changes. This page updates on its own.</p>
      </div></div>`;
  }

  // ==================== Shop app (signed in) ====================
  const ui = { view: "board", openJob: null, modal: null, authMode: "signin", authMsg: "", authErr: "", busy: false };
  let session = null, shop = null, jobs = [], loaded = false, loadErr = "";
  const job = (id) => jobs.find((j) => j.id === id);
  const upsertJob = (j) => { const i = jobs.findIndex((x) => x.id === j.id); if (i >= 0) jobs[i] = j; else jobs.push(j); };

  async function loadShop() {
    try {
      shop = (await api("GET", "shop/me")).shop;
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
    app.innerHTML = err + (ui.view === "checkin" ? checkinView() : ui.view === "settings" ? setupView(false) : boardView());
    renderLayer();
  }

  const googleIcon = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
  const brand = () => `<div class="brand"><div class="brand-mark" aria-hidden="true">${$(".brand-mark").innerHTML}</div><div><h1>Talk Shops</h1><small>For repair shops</small></div></div>`;

  function loginView() {
    const signup = ui.authMode === "signup";
    return `<div class="login-wrap"><div class="login">
      ${brand()}
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
      <p class="muted" style="font-size:13px;margin:0">Customers never sign in. They get a text with a link to their car's page.</p>
    </div></div>`;
  }

  function setupView(firstTime) {
    const s = shop || {};
    return `<div class="${firstTime ? "login-wrap" : ""}"><form class="${firstTime ? "login" : "panel"}" id="setupForm">
      ${firstTime ? brand() : ""}
      <h2>${firstTime ? "Set up your shop" : "Shop settings"}</h2>
      <p class="muted" style="margin:0">Customers see this name and phone number in their texts and on their car's page.</p>
      <label class="field">Shop name<input id="sh-name" required maxlength="80" value="${esc(s.name || "")}" placeholder="e.g. Ridgeline Auto Repair"></label>
      <label class="field">Shop phone<input id="sh-phone" inputmode="tel" maxlength="30" value="${esc(s.phone || "")}" placeholder="(555) 014-2290"></label>
      <label class="field">Hours<input id="sh-hours" maxlength="60" value="${esc(s.hours || "")}" placeholder="Mon–Fri 7:30am–6pm"></label>
      <div class="btn-row"><button class="btn primary" type="submit">${firstTime ? "Open my shop board" : "Save"}</button>${firstTime ? `<button class="btn" type="button" id="signOut2">Sign out</button>` : ""}</div>
    </form></div>`;
  }

  function boardView() {
    const active = jobs.filter((j) => j.stage !== "picked_up");
    const picked = jobs.length - active.length;
    if (!jobs.length) {
      return `<div class="empty-board"><h2>No cars yet</h2><p class="muted" style="margin:0;max-width:420px">Check in your first car. The customer gets a text with a link to follow along and approve work.</p><button class="btn primary" data-view="checkin">Check in a car</button></div>`;
    }
    const waiting = active.filter((j) => j.stage === "approval").length;
    const ready = active.filter((j) => j.stage === "ready").length;
    const today = new Date().toDateString();
    const sent = jobs.reduce((a, j) => a + j.messages.filter((m) => m.dir === "out" && m.delivery === "sent" && new Date(m.t).toDateString() === today).length, 0);
    let h = `<div class="stats">
      <div class="stat"><b>${active.length}</b><span>Cars in the shop</span></div>
      <div class="stat warn"><b>${waiting}</b><span>Waiting on customer</span></div>
      <div class="stat ok"><b>${ready}</b><span>Ready for pickup</span></div>
      <div class="stat"><b>${sent}</b><span>Texts sent today</span></div></div>
      <div class="board-wrap"><div class="board">`;
    STAGES.filter((s) => s.key !== "picked_up").forEach((s) => {
      const list = active.filter((j) => j.stage === s.key);
      h += `<section class="col ${s.key === "approval" ? "is-approval" : ""} ${s.key === "ready" ? "is-ready" : ""}"><div class="col-h"><h3>${s.label}</h3><span>${list.length}</span></div>`;
      if (!list.length) h += `<div class="empty-col">No cars</div>`;
      list.forEach((j) => {
        const ev = j.events[j.events.length - 1];
        let pill = "";
        if (j.stage === "approval") pill = `<span class="pill warn">Sent ${since(ev.t)} ago</span>`;
        else if (j.stage === "parts") pill = `<span class="pill">ETA ${esc(j.eta || "not set")}</span>`;
        const last = j.messages[j.messages.length - 1];
        const reply = last && last.dir === "in";
        h += `<button class="card" data-open="${j.id}">
          <span class="veh">${esc(vehicleStr(j))}</span>
          <span class="row"><span>${esc(j.customer.name)}</span><span class="mono">${esc(j.ro)}</span></span>
          <span class="row"><span>${esc(j.concern)}</span></span>
          <span class="row"><span>${since(ev.t)} in stage</span>${reply ? `<span class="pill bad">New reply</span>` : ""}</span>${pill}</button>`;
      });
      h += `</section>`;
    });
    h += `</div></div><p class="muted" style="font-size:13px;margin-top:10px">${picked ? picked + " picked up in the last 2 days. " : ""}Tap a car to update its stage, build an estimate or text the customer.</p>`;
    return h;
  }

  function checkinView() {
    return `<form class="panel" id="checkinForm" autocomplete="off">
      <h2>Check in a vehicle</h2><p class="muted" style="margin:0">The customer gets a text with a tracking link as soon as you save.</p>
      <div class="form-grid">
        <label class="field">Customer name<input id="ci-name" required maxlength="80"></label>
        <label class="field">Mobile number<input id="ci-phone" required inputmode="tel" placeholder="(555) 010-0000"></label>
        <label class="field">Year<input id="ci-year" inputmode="numeric" maxlength="4"></label>
        <label class="field">Make<input id="ci-make" required maxlength="40"></label>
        <label class="field">Model<input id="ci-model" required maxlength="40"></label>
        <label class="field">License plate<input id="ci-plate" maxlength="12"></label>
        <label class="field full">What's the concern?<textarea id="ci-concern" required maxlength="1000"></textarea></label>
        <label class="chk full"><input type="checkbox" id="ci-consent" checked> Customer agreed to receive repair updates by text. They can reply STOP at any time.</label>
      </div>
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Check in and text customer</button></div>
    </form>`;
  }

  function bubble(m, j) {
    const unsent = m.dir === "out" && m.delivery && m.delivery !== "sent";
    const who = m.dir === "out" ? "Text to customer" : esc(first(j.customer.name));
    const status = unsent ? `<span class="delivery">${m.delivery === "failed" ? "Failed" : "Not sent"}${m.note ? ": " + esc(m.note) : ""}</span>` : "";
    const text = esc(m.text).replace(esc(j.link), `<a href="${esc(j.link)}" target="_blank" rel="noopener">${esc(j.link)}</a>`);
    return `<div class="bubble ${m.dir}${unsent ? " unsent" : ""}">${text}<span class="meta">${who} · ${dayClock(m.t)}</span>${status}</div>`;
  }

  function sheetView(j) {
    const idx = SI[j.stage];
    const steps = STAGES.map((s, i) => `<button class="step ${i < idx ? "done" : ""} ${i === idx ? "current" : ""}" data-stage="${s.key}" ${i === idx ? 'aria-current="step"' : ""}>${s.label}</button>`).join("");
    const next = STAGES[idx + 1];
    const rows = j.estimate.map((e) => `<tr><td>${esc(e.item)}</td><td>${e.status === "pending" ? '<span class="pill warn">Pending</span>' : e.status === "approved" ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Declined</span>'}</td><td class="num">${money(e.price)}</td><td class="num">${e.status === "pending" && j.stage !== "approval" ? `<button class="linkbtn" data-del="${e.id}" aria-label="Remove ${esc(e.item)}">Remove</button>` : ""}</td></tr>`).join("");
    const log = [...j.events].reverse().map((e) => `<li><time>${clock(e.t)}</time><span>${STAGES[SI[e.stage]].label}</span></li>`).join("");
    return `<div class="scrim" data-close></div><aside class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <div class="sheet-h"><div><div class="mono muted">${esc(j.ro)}${j.plate ? " · " + esc(j.plate) : ""}</div><h2 id="sheetTitle">${esc(vehicleStr(j))}</h2><div class="muted">${esc(j.customer.name)} · ${esc(fmtPhone(j.customer.phone))}</div></div><button class="x" data-close aria-label="Close">×</button></div>
      <div class="sheet-body">
        <section class="sec"><h3>Stage</h3><div class="stepper">${steps}</div>
          <div class="btn-row" style="margin-top:10px">${next ? `<button class="btn primary" data-stage="${next.key}">Move to ${next.label}</button>` : ""}<a class="btn" href="${esc(j.link)}" target="_blank" rel="noopener" style="text-decoration:none">Customer's page</a></div>
          ${j.stage === "parts" ? `<label class="field" style="margin-top:10px">Parts ETA<input id="eta" value="${esc(j.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
        </section>
        <section class="sec"><h3>Concern</h3><div>${esc(j.concern)}</div></section>
        <section class="sec"><h3>Estimate</h3>
          ${j.estimate.length ? `<div style="overflow-x:auto"><table class="est"><thead><tr><th>Item</th><th>Status</th><th class="num">Price</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="total"><span>Total quoted</span><span>${money(estTotal(j))}</span></div>` : `<p class="muted" style="margin:0">No line items yet.</p>`}
          ${j.approval ? `<p class="muted" style="font-size:13px">Signed by ${esc(j.approval.by)} on ${dayClock(j.approval.t)}</p>` : ""}
          <form class="add-line" id="addLine"><input id="li-item" placeholder="Line item, e.g. Cabin air filter" aria-label="Line item"><input id="li-price" inputmode="decimal" placeholder="Price" aria-label="Price"><button class="btn" type="submit">Add</button></form>
          ${j.estimate.some((e) => e.status === "pending") && j.stage !== "approval" ? `<button class="btn primary" style="margin-top:10px" data-stage="approval">Send estimate for approval</button>` : ""}
        </section>
        <section class="sec"><h3>Photos</h3><div class="photos">${j.photos.map((p) => `<figure class="photo" style="margin:0"><img class="img" src="${p.src}" alt="${esc(p.cap)}"><figcaption>${esc(p.cap)}</figcaption></figure>`).join("")}
          <label class="photo-add" for="photoIn">+ Add photo<br><span style="font-weight:400">Customer sees it on their page</span></label><input type="file" id="photoIn" accept="image/*" hidden></div></section>
        <section class="sec"><h3>Messages</h3><div class="thread">${j.messages.map((m) => bubble(m, j)).join("") || '<p class="muted">No messages yet.</p>'}</div>
          <form class="add-line" id="replyForm" style="grid-template-columns:minmax(0,1fr) auto"><input id="replyIn" maxlength="1000" placeholder="Text ${esc(first(j.customer.name))}…" aria-label="Message"><button class="btn primary" type="submit">Send</button></form></section>
        <section class="sec"><h3>History</h3><ul class="log">${log}</ul></section>
      </div></aside>`;
  }

  function stageModal() {
    const m = ui.modal, j = job(m.job), s = STAGES[SI[m.stage]];
    return `<div class="modal"><form class="modal-card" id="sendForm" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <h2 id="mTitle">Move to ${s.label}</h2>
      <p class="muted" style="margin:0">Text to ${esc(j.customer.name)} at ${esc(fmtPhone(j.customer.phone))}</p>
      ${m.stage === "parts" ? `<label class="field">Parts ETA<input id="m-eta" value="${esc(m.eta || "")}" placeholder="e.g. Tue, Nov 10"></label>` : ""}
      <label class="field">Message<textarea id="m-text" maxlength="1000">${esc(m.text)}</textarea></label>
      <label class="chk"><input type="checkbox" id="m-send" ${j.customer.consent ? "checked" : "disabled"}> Send this text ${j.customer.consent ? "" : "(customer has not agreed to texts)"}</label>
      <div class="btn-row"><button class="btn primary" type="submit" ${ui.busy ? "disabled" : ""}>Update stage</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    </form></div>`;
  }

  function renderLayer() {
    let h = "";
    if (session && shop && ui.openJob && ui.view === "board") { const j = job(ui.openJob); if (j) h += sheetView(j); }
    if (ui.modal === "video") h += videoModal();
    else if (ui.modal) h += stageModal();
    $("#layer").innerHTML = h;
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
    const t = e.target.closest("button,[data-close],[data-open],[data-close-modal]");
    if (!t) return;
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
    if (t.dataset.view) { ui.view = t.dataset.view; ui.openJob = null; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.open) { ui.openJob = t.dataset.open; renderLayer(); setTimeout(() => $(".x")?.focus(), 0); return; }
    if (t.hasAttribute("data-close")) { ui.openJob = null; renderLayer(); return; }
    if (t.hasAttribute("data-cancel")) { ui.modal = null; renderLayer(); return; }
    if (t.dataset.stage) {
      const j = job(ui.openJob); if (!j || t.dataset.stage === j.stage) return;
      if (t.dataset.stage === "approval" && !j.estimate.some((x) => x.status === "pending")) { toast("Add at least one estimate line first"); $("#li-item")?.focus(); return; }
      const p = await act(() => api("POST", `shop/jobs/${j.id}/preview`, { stage: t.dataset.stage }));
      if (!p) return;
      ui.modal = { job: j.id, stage: t.dataset.stage, text: p.text, eta: j.eta };
      renderLayer(); $("#m-text")?.focus(); return;
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
      const body = { name: $("#sh-name").value, phone: $("#sh-phone").value, hours: $("#sh-hours").value };
      const r = await act(() => api("POST", "shop/me", body), "Saved");
      if (r) { shop = r.shop; ui.view = "board"; render(); }
      return;
    }
    if (f.id === "checkinForm") {
      const g = (k) => $("#ci-" + k).value.trim();
      const j = await act(() => api("POST", "shop/jobs", {
        customer: { name: g("name"), phone: g("phone"), consent: $("#ci-consent").checked },
        vehicle: { year: g("year"), make: g("make"), model: g("model") }, plate: g("plate"), concern: g("concern"),
      }));
      if (j) {
        upsertJob(j); ui.view = "board"; ui.openJob = j.id; render();
        const m = j.messages[0];
        toast(!m ? "Checked in" : m.delivery === "sent" ? "Checked in. Welcome text sent." : "Checked in. Text not sent: " + (m.note || "unknown error"));
      }
      return;
    }
    if (f.id === "sendForm") {
      const m = ui.modal, eta = $("#m-eta");
      const body = { stage: m.stage, text: $("#m-text").value.trim(), send: $("#m-send").checked };
      if (eta) body.eta = eta.value.trim();
      const j = await jobAction(m.job, "stage", body, "Moved to " + STAGES[SI[m.stage]].label);
      if (j) { ui.modal = null; if (j.stage === "picked_up") ui.openJob = null; render(); }
      return;
    }
    if (f.id === "addLine") {
      const item = $("#li-item").value.trim(), price = parseFloat($("#li-price").value.replace(/[$,]/g, ""));
      if (!item || !(price >= 0)) { toast("Enter an item and a price"); return; }
      if (await jobAction(ui.openJob, "estimate", { item, price })) $("#li-item")?.focus();
      return;
    }
    if (f.id === "replyForm") {
      const v = $("#replyIn").value.trim(); if (!v) return;
      const j = await jobAction(ui.openJob, "message", { text: v });
      if (j) { const last = j.messages[j.messages.length - 1]; toast(last.delivery === "sent" ? "Text sent" : "Saved. Text not sent: " + (last.note || "")); $("#replyIn")?.focus(); }
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "eta") jobAction(ui.openJob, "eta", { eta: e.target.value.trim() }, "ETA saved");
    if (e.target.id === "photoIn") {
      const file = e.target.files[0]; if (!file) return;
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas"); const s = Math.min(1, 1024 / Math.max(img.width, img.height));
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          jobAction(ui.openJob, "photo", { src: c.toDataURL("image/jpeg", 0.72), cap: file.name.replace(/\.[^.]+$/, "") }, "Photo added to customer's page");
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "sig") cust.sig = e.target.value; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (ui.modal) ui.modal = null; else ui.openJob = null; renderLayer(); } });

  // ---------------- Start ----------------
  if (custToken) {
    loadCustomer();
    setInterval(() => { if (!Object.keys(cust.draft).length && document.visibilityState === "visible") loadCustomer(); }, 30000);
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
    if (!session || !shop || ui.modal || document.visibilityState !== "visible") return;
    try { jobs = await api("GET", "shop/jobs"); if (!ui.busy && !document.activeElement?.matches("input,textarea")) render(); } catch (e) { /* try again next time */ }
  }, 20000);
})();
