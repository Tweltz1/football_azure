// Walk-around photos: the shop asks a customer for 8 photos of the car (front, back, both sides, four corners),
// the customer's page guides them shot by shot, Gemini suggests damage boxes, and the technician confirms
// or fixes them before the customer sees them. Used by app.js (shop and customer pages).
(function () {
  "use strict";
  // Top-down guide: where to stand for each shot. Front of the car is at the top; "right" is the passenger side.
  const ANGLES = [
    { key: "front", label: "Front", at: [50, 5], tip: "Stand in front of the car, far enough back to fit both headlights." },
    { key: "front_right", label: "Front passenger corner", at: [90, 9], tip: "Stand at the front corner on the passenger side." },
    { key: "right", label: "Passenger side", at: [95, 50], tip: "Step back until the whole passenger side fits, wheel to wheel." },
    { key: "rear_right", label: "Rear passenger corner", at: [90, 91], tip: "Stand at the back corner on the passenger side." },
    { key: "rear", label: "Rear", at: [50, 95], tip: "Stand behind the car so both taillights fit." },
    { key: "rear_left", label: "Rear driver corner", at: [10, 91], tip: "Stand at the back corner on the driver side." },
    { key: "left", label: "Driver side", at: [5, 50], tip: "Step back until the whole driver side fits, wheel to wheel." },
    { key: "front_left", label: "Front driver corner", at: [10, 9], tip: "Stand at the front corner on the driver side." },
  ];
  const BY = Object.fromEntries(ANGLES.map((a) => [a.key, a]));
  const KINDS = { scratch: "Scratch", dent: "Dent", crack: "Crack", chip: "Chip", scuff: "Scuff", rust: "Rust", broken: "Broken part", other: "Other damage" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (n) => (n * 100).toFixed(1) + "%";
  let cfg = null, busy = false, review = null, lightbox = null;

  function guide(key) {
    const [cx, cy] = BY[key].at, dx = 50 - cx, dy = 50 - cy, len = Math.hypot(dx, dy) || 1;
    const ex = cx + dx / len * 18, ey = cy + dy / len * 18;
    return `<svg class="wa-guide" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="34" y="18" width="32" height="64" rx="11" class="wa-car"/>
      <path d="M38 33 Q50 27 62 33 L60 41 Q50 38 40 41 Z" class="wa-glass"/><path d="M40 66 Q50 69 60 66 L62 72 Q50 76 38 72 Z" class="wa-glass"/>
      <rect x="31" y="27" width="4" height="10" rx="2" class="wa-wheel"/><rect x="65" y="27" width="4" height="10" rx="2" class="wa-wheel"/>
      <rect x="31" y="63" width="4" height="10" rx="2" class="wa-wheel"/><rect x="65" y="63" width="4" height="10" rx="2" class="wa-wheel"/>
      <line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" class="wa-ray"/>
      <circle cx="${cx}" cy="${cy}" r="5.5" class="wa-you"/></svg>`;
  }
  function boxes(marks, numbered) {
    return (marks || []).map((m, i) => `<span class="wa-box${m.confirmed === false ? " wa-sugg" : ""}" style="left:${pct(m.x)};top:${pct(m.y)};width:${pct(m.w)};height:${pct(m.h)}">${numbered ? `<b>${i + 1}</b>` : ""}</span>`).join("");
  }

  // ---------------- Customer page ----------------
  function customerCard(j) {
    const w = j.walkaround;
    if (!w || (!w.requested && !w.photos.length)) return "";
    const have = Object.fromEntries(w.photos.map((p) => [p.angle, p]));
    const next = ANGLES.find((a) => !have[a.key]);
    const found = w.photos.flatMap((p) => p.marks.map((m) => ({ ...m, angle: p.angle, photo: p.id })));
    const tiles = ANGLES.map((a) => {
      const p = have[a.key];
      return `<button type="button" class="wa-tile${p ? " done" : ""}" ${p ? `data-wa-view="${esc(p.id)}"` : w.canUpload ? `data-wa-shoot="${a.key}"` : "disabled"} aria-label="${esc(a.label)}${p ? ", photo taken" : ""}">
        ${p ? `<span class="wa-ph"><img src="${p.src}" alt="">${boxes(p.marks)}</span><span class="wa-ok" aria-hidden="true">✓</span>` : guide(a.key)}<span class="wa-l">${esc(a.label)}</span></button>`;
    }).join("");
    const intro = w.canUpload
      ? (next ? `<p>${esc(j.shop.name)} asked for photos of your car from all sides, so you both have a record of its condition. Tap each spot, or use the button to go in order.</p>
          <div class="wa-next">${guide(next.key)}<div><b>Next: ${esc(next.label)}</b><small>${esc(next.tip)}</small><button type="button" class="btn primary" data-wa-shoot="${next.key}" ${busy ? "disabled" : ""}>${busy ? "Sending…" : "Take photo"}</button></div></div>`
        : `<p class="wa-thanks">All 8 photos sent. Thank you! Tap any photo to retake it.</p>`)
      : "";
    const list = found.length ? `<h4 class="wa-h4">Damage noted by the shop</h4><ol class="wa-found">${found.map((m) =>
      `<li><button type="button" class="linkbtn" data-wa-view="${esc(m.photo)}">${esc(KINDS[m.kind] || "Damage")}</button> · ${esc(m.note || BY[m.angle].label)}</li>`).join("")}</ol>` : "";
    return `<section class="c-card wa-card"><h3>Walk-around photos <span class="wa-count">${w.photos.length} of 8</span></h3>
      <div class="wa-bar"><span style="width:${w.photos.length / 8 * 100}%"></span></div>
      ${intro}<div class="wa-grid">${tiles}</div>${list}<p id="waStatus" role="status" class="wa-status" hidden></p></section>`;
  }
  function shoot(angle) {
    if (busy) return;
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.setAttribute("capture", "environment");
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      busy = true; cfg.renderCustomer();
      try {
        const src = await cfg.encode(file);
        cfg.setCustomer(await cfg.api("POST", `shop/c/${encodeURIComponent(cfg.token())}/walkaround`, { angle, src }));
        busy = false; cfg.renderCustomer();
        const done = cfg.customer().walkaround.photos.length;
        status(done >= 8 ? "All 8 photos sent. Thank you!" : `${BY[angle].label} photo sent. ${8 - done} to go.`);
      } catch (err) { busy = false; cfg.renderCustomer(); status(err.message); }
    });
    input.click();
  }
  function status(text) { const el = document.getElementById("waStatus"); if (el) { el.hidden = false; el.textContent = text; } cfg.toast(text); }

  // ---------------- Shop car sheet ----------------
  function sheetSection(j) {
    const req = j.walkaroundRequest, photos = j.walkaround || [];
    if (!req && !photos.length) return `<section class="sec"><h3>Walk-around photos <span class="sec-sub">For body work and condition records</span></h3>
      <p class="muted" style="margin:0 0 8px">The customer's page guides them through 8 photos of the car. AI suggests damage and you confirm it before they see it.</p>
      <div class="btn-row"><button type="button" class="btn" data-wa-request>Ask ${esc(cfg.first(j.customer.name))} for walk-around photos</button></div>
      <label class="chk"><input type="checkbox" id="wa-send" ${j.customer.consent ? "checked" : "disabled"}> Notify the customer with the link${j.customer.consent ? "" : " (customer has not agreed to notifications)"}</label></section>`;
    const have = Object.fromEntries(photos.map((p) => [p.angle, p]));
    const pending = photos.reduce((n, p) => n + p.marks.filter((m) => !m.confirmed).length, 0);
    const confirmed = photos.reduce((n, p) => n + p.marks.filter((m) => m.confirmed).length, 0);
    const unscanned = photos.filter((p) => !p.aiAt).length;
    const tiles = ANGLES.map((a) => {
      const p = have[a.key];
      return p ? `<button type="button" class="wa-tile done" data-wa-open="${esc(p.id)}" aria-label="Review ${esc(a.label)} photo"><span class="wa-ph"><img src="${p.src}" alt="">${boxes(p.marks)}</span>
          ${p.marks.some((m) => !m.confirmed) ? `<span class="wa-flag">${p.marks.filter((m) => !m.confirmed).length} to review</span>` : ""}<span class="wa-l">${esc(a.label)}</span></button>`
        : `<div class="wa-tile empty">${guide(a.key)}<span class="wa-l">${esc(a.label)}</span></div>`;
    }).join("");
    return `<section class="sec" id="waSec"><h3>Walk-around photos <span class="sec-sub">${photos.length} of 8 from the customer</span></h3>
      ${photos.length ? `<p class="wa-sum">${confirmed ? `<span class="wa-pill ok">${confirmed} confirmed</span>` : ""}${pending ? `<span class="wa-pill warn">${pending} AI suggestion${pending === 1 ? "" : "s"} to review</span>` : ""}${!confirmed && !pending && !unscanned ? '<span class="wa-pill">No damage marked</span>' : ""}</p>` : `<p class="muted" style="margin:0 0 8px">Waiting on the customer. They'll see the guide on their page${req ? "" : "."}${req ? ` (asked ${new Date(req.t).toLocaleDateString([], { month: "short", day: "numeric" })}).` : ""}</p>`}
      <div class="wa-grid">${tiles}</div>
      <div class="btn-row">${unscanned ? `<button type="button" class="btn primary" data-wa-ai ${busy ? "disabled" : ""}>${busy ? "Checking photos…" : `Find damage with AI (${unscanned} photo${unscanned === 1 ? "" : "s"})`}</button>` : ""}
        ${req ? `<button type="button" class="linkbtn" data-wa-stop>Stop asking for photos</button>` : `<button type="button" class="linkbtn" data-wa-request>Ask for more photos</button>`}</div>
      ${pending ? `<p class="muted wa-help">Tap a photo to confirm, change or remove each mark. The customer only sees confirmed marks.</p>` : ""}</section>`;
  }

  function reviewView() {
    const j = cfg.job(review.job), p = (j?.walkaround || []).find((x) => x.id === review.photo);
    if (!p) { review = null; return ""; }
    const rows = review.marks.map((m, i) => `<li class="wa-mrow${m.confirmed ? " ok" : ""}"><b class="wa-n">${i + 1}</b>
        <select data-wa-kind="${i}" aria-label="Kind of damage ${i + 1}">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${m.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <input data-wa-note="${i}" maxlength="140" value="${esc(m.note || "")}" placeholder="Where, e.g. rear bumper" aria-label="Note for mark ${i + 1}">
        <button type="button" class="btn sm${m.confirmed ? " primary" : ""}" data-wa-confirm="${i}" aria-pressed="${!!m.confirmed}">${m.confirmed ? "Confirmed" : "Confirm"}</button>
        <button type="button" class="linkbtn danger" data-wa-del="${i}">Remove</button>
        ${m.source === "ai" ? '<small class="wa-src">AI suggestion</small>' : ""}</li>`).join("");
    return `<div class="modal wa-modal-wrap"><div class="modal-card wa-modal" role="dialog" aria-modal="true" aria-labelledby="waTitle">
      <h2 id="waTitle">${esc(BY[p.angle].label)}</h2>
      <p class="muted" style="margin:0">Tap the photo to add a mark. Confirm what's really damage and remove the rest. Only confirmed marks show on the customer's page.</p>
      <div class="wa-ph wa-big" data-wa-canvas><img src="${p.src}" alt="${esc(BY[p.angle].label)} photo">${boxes(review.marks, true)}</div>
      ${review.marks.length ? `<ol class="wa-marks">${rows}</ol><button type="button" class="linkbtn" data-wa-allok>Confirm all</button>` : `<p class="muted" style="margin:0">${p.aiAt ? "The AI didn't find damage here." : "No marks yet."}</p>`}
      <div class="btn-row"><button type="button" class="btn primary" data-wa-save>Save marks</button><button type="button" class="btn" data-wa-cancel>Cancel</button>
        ${p.aiAt ? `<button type="button" class="linkbtn" data-wa-rescan>Check again with AI</button>` : ""}<button type="button" class="linkbtn danger" data-wa-remove>Delete photo</button></div>
    </div></div>`;
  }
  function lightboxView() {
    const p = (cfg.customer()?.walkaround?.photos || []).find((x) => x.id === lightbox);
    if (!p) { lightbox = null; return ""; }
    return `<div class="modal wa-modal-wrap" data-wa-close><div class="modal-card wa-modal" role="dialog" aria-modal="true" aria-label="${esc(BY[p.angle].label)} photo">
      <h2>${esc(BY[p.angle].label)}</h2><div class="wa-ph wa-big"><img src="${p.src}" alt="">${boxes(p.marks, true)}</div>
      ${p.marks.length ? `<ol class="wa-found">${p.marks.map((m) => `<li><b>${esc(KINDS[m.kind] || "Damage")}</b>${m.note ? " · " + esc(m.note) : ""}</li>`).join("")}</ol>` : ""}
      <div class="btn-row">${cfg.customer().walkaround.canUpload ? `<button type="button" class="btn" data-wa-shoot="${p.angle}">Retake photo</button>` : ""}<button type="button" class="btn" data-wa-close>Close</button></div></div></div>`;
  }
  function paintLayer() {
    let el = document.getElementById("waLayer");
    if (!el) { el = document.createElement("div"); el.id = "waLayer"; document.body.appendChild(el); }
    el.innerHTML = review ? reviewView() : lightbox ? lightboxView() : "";
  }

  async function shopAction(id, action, body, ok) {
    busy = true; cfg.render();
    try { const j = await cfg.api("POST", `shop/jobs/${id}/${action}`, body); cfg.onJob(j); if (ok) cfg.toast(typeof ok === "function" ? ok(j) : ok); return j; }
    catch (err) { cfg.toast(err.message); return null; }
    finally { busy = false; cfg.render(); }
  }

  function onClick(e) {
    if (!cfg) return;
    const t = e.target.closest("button,[data-wa-canvas],[data-wa-close]");
    if (!t) return;
    // Customer
    if (t.dataset.waShoot) { e.stopPropagation(); lightbox = null; paintLayer(); shoot(t.dataset.waShoot); return; }
    if (t.dataset.waView) { lightbox = t.dataset.waView; paintLayer(); return; }
    if (t.hasAttribute("data-wa-close") && (t === e.target || t.tagName === "BUTTON")) { lightbox = null; paintLayer(); return; }
    // Shop
    const id = cfg.openJob();
    if (t.hasAttribute("data-wa-request")) { const j = cfg.job(id); shopAction(id, "walkaround-request", { send: !!document.getElementById("wa-send")?.checked }, j?.customer.consent && document.getElementById("wa-send")?.checked ? (r) => "Asked for photos. " + cfg.sendResult(r) : "Walk-around guide is on the customer's page"); return; }
    if (t.hasAttribute("data-wa-stop")) { shopAction(id, "walkaround-request", { on: false }, "The customer's page no longer asks for photos"); return; }
    if (t.hasAttribute("data-wa-ai")) {
      shopAction(id, "walkaround-ai", {}, (j) => { const n = (j.walkaround || []).reduce((s, p) => s + p.marks.filter((m) => !m.confirmed).length, 0); return n ? `AI found ${n} possible spot${n === 1 ? "" : "s"}. Review them before the customer sees them.` : "AI didn't find damage in these photos."; });
      return;
    }
    if (t.dataset.waOpen) { const p = (cfg.job(id)?.walkaround || []).find((x) => x.id === t.dataset.waOpen); if (p) { review = { job: id, photo: p.id, marks: p.marks.map((m) => ({ ...m })) }; paintLayer(); } return; }
    if (!review) return;
    if (t.hasAttribute("data-wa-canvas")) {
      const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, w = 0.16, h = 0.12;
      review.marks.push({ x: Math.min(1 - w, Math.max(0, x - w / 2)), y: Math.min(1 - h, Math.max(0, y - h / 2)), w, h, kind: "scratch", note: "", source: "shop", confirmed: true });
      paintLayer(); return;
    }
    if (t.dataset.waConfirm) { const m = review.marks[+t.dataset.waConfirm]; m.confirmed = !m.confirmed; paintLayer(); return; }
    if (t.dataset.waDel) { review.marks.splice(+t.dataset.waDel, 1); paintLayer(); return; }
    if (t.hasAttribute("data-wa-allok")) { review.marks.forEach((m) => { m.confirmed = true; }); paintLayer(); return; }
    if (t.hasAttribute("data-wa-cancel")) { review = null; paintLayer(); return; }
    if (t.hasAttribute("data-wa-save")) {
      const r = review; review = null; paintLayer();
      shopAction(r.job, "walkaround-marks", { photoId: r.photo, marks: r.marks }, (j) => { const n = r.marks.filter((m) => m.confirmed).length; return n ? `${n} mark${n === 1 ? "" : "s"} confirmed for the customer` : "Marks saved"; });
      return;
    }
    if (t.hasAttribute("data-wa-rescan")) { const r = review; review = null; paintLayer(); shopAction(r.job, "walkaround-ai", { photoId: r.photo }, "Checked again. Review the new suggestions."); return; }
    if (t.hasAttribute("data-wa-remove")) { const r = review; review = null; paintLayer(); shopAction(r.job, "walkaround-remove", { photoId: r.photo }, "Photo deleted"); return; }
  }
  function onInput(e) {
    if (!review) return;
    const t = e.target;
    if (t.dataset.waKind) review.marks[+t.dataset.waKind].kind = t.value;
    if (t.dataset.waNote) review.marks[+t.dataset.waNote].note = t.value;
  }

  /**
   * cfg: { api, encode, toast, first, sendResult,
   *   customer page: token(), customer(), setCustomer(data), renderCustomer(),
   *   shop: job(id), openJob(), onJob(job), render() }
   */
  function init(c) {
    cfg = c;
    // Capture phase, so the page's own click handler never sees these buttons.
    document.addEventListener("click", (e) => { if (e.target.closest("[data-wa-shoot],[data-wa-view],[data-wa-close],[data-wa-request],[data-wa-stop],[data-wa-ai],[data-wa-open],#waLayer")) { onClick(e); e.stopPropagation(); } }, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (review || lightbox)) { review = null; lightbox = null; paintLayer(); e.stopPropagation(); } }, true);
  }

  window.Walkaround = { ANGLES, KINDS, init, customerCard, sheetSection };
})();
