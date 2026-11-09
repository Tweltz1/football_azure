// Voice-guided tour and training lessons in the demo shop.
//   /demo.html?tour=1         the guided tour of everything Talk Shops does
//   /demo.html?train=<id>     one in-depth lesson (the list lives in training.js)
// It drives the demo page by clicking its own buttons, highlights what it talks about,
// and plays one narration clip per step (/tour/<key>.mp3, captions from /tour/lines.json).
// Midway through the tour, the visitor can get ONE real text (POST /shop/demo/text) and approve or
// decline the estimate on their own phone; the tour waits for that decision, then carries on.
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  const LESSONS = (window.TALKSHOPS_TRAINING && window.TALKSHOPS_TRAINING.lessons) || [];
  const lessonIx = LESSONS.findIndex((l) => l.id === params.get("train"));
  const lesson = LESSONS[lessonIx] || null;
  if (params.get("tour") !== "1" && !lesson) return;
  window.TOUR_ACTIVE = true;
  const CFG = window.BAY_CONFIG || {};
  const API = (CFG.apiUrl || "").replace(/\/$/, "");
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const escT = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const css = `
  #tourBlock{position:fixed;inset:0;z-index:60;cursor:default}
  #tourSpot{position:fixed;z-index:61;pointer-events:none;border-radius:12px;box-shadow:0 0 0 3px #f2a650,0 0 0 9999px rgba(8,12,18,.16);transition:opacity .15s ease;opacity:0}
  #tourSpot.on{opacity:1}
  .tour-tap{position:fixed;z-index:62;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(242,166,80,.55);border:2px solid #f2a650;pointer-events:none;animation:tourTap .55s ease-out forwards}
  @keyframes tourTap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
  #tourPanel{position:fixed;z-index:63;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));width:min(680px,calc(100% - 24px));background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);padding:14px 16px;font-family:var(--f-body);box-sizing:border-box}
  #tourPanel .t-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  #tourPanel .t-step{font-family:var(--f-mono);font-size:12px;color:var(--muted);margin-right:auto}
  #tourPanel .t-cap{font-size:15.5px;line-height:1.45;overflow-wrap:anywhere}
  #tourPanel .t-btn{font:600 13px var(--f-body);border:1px solid var(--line);background:var(--surface-2);color:var(--fg);border-radius:8px;padding:6px 10px;cursor:pointer}
  #tourPanel .t-btn.primary{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
  #tourPanel .t-btn:disabled{opacity:.55;cursor:default}
  #tourPanel form{display:grid;gap:8px;margin-top:10px}
  #tourPanel input[type=tel]{font:500 17px var(--f-body);padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--fg);width:100%;box-sizing:border-box}
  #tourPanel label.t-chk{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--muted)}
  #tourPanel .t-row{display:flex;gap:8px;flex-wrap:wrap}
  #tourPanel .t-err{color:var(--bad);font-size:14px;margin:8px 0 0}
  #tourPanel .t-wait{display:flex;align-items:center;gap:10px;margin-top:10px;font-weight:600}
  #tourPanel .t-dot{width:10px;height:10px;border-radius:50%;background:var(--warn);animation:tourPulse 1.2s ease-in-out infinite}
  @keyframes tourPulse{50%{opacity:.25}}
  #tourStart{position:fixed;inset:0;z-index:64;display:grid;place-items:center;background:rgba(8,12,18,.6);padding:16px}
  #tourStart .card{background:var(--surface);color:var(--fg);border-radius:16px;padding:22px;max-width:420px;box-shadow:0 10px 40px rgba(0,0,0,.4);font-family:var(--f-body)}
  #tourStart h2{font-family:var(--f-display);font-size:28px;margin:0 0 6px}
  #tourStart p{margin:0 0 14px;color:var(--muted);line-height:1.45}
  #tourStart .t-row{display:flex;gap:8px;flex-wrap:wrap}
  #tourStart .btn{text-decoration:none}
  #tourPanel.top{bottom:auto;top:calc(10px + env(safe-area-inset-top,0px))}
  #tourPanel{max-height:80dvh;overflow-y:auto;overscroll-behavior:contain}
  @media (max-width:760px){
    #tourPanel{padding:10px 12px;bottom:calc(8px + env(safe-area-inset-bottom,0px))}
    #tourPanel .t-cap{font-size:15px;line-height:1.4}
    #tourPanel .t-top{flex-wrap:wrap;gap:4px 6px}
    #tourPanel .t-step{min-width:60px;flex:1}
    #tourPanel .t-btn{padding:7px 9px;white-space:nowrap}
    html:has(#tourPanel){scroll-padding-block:70px 90px}
    body:has(#tourPanel) .sheet-body{scroll-padding-block:12px}
  }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  let LINES = {}, timings = {};
  function captionsFor(key, words, estimate) {
    const cues = timings[key];
    if (cues?.length) return cues;
    return words.flatMap((_, i) => i % 8 === 0 ? [[i * estimate / words.length, i]] : []);
  }
  const audio = new Audio();
  audio.preload = "auto";
  let paused = false, ended = false, muted = false;
  let spotSel = null, stepNo = 0;
  let STEPS = 13;
  class Stop extends Error {}
  const check = () => { if (ended) throw new Stop(); };

  // ---------- timing ----------
  async function wait(ms) {
    let left = ms;
    while (left > 0) { check(); await new Promise((r) => setTimeout(r, 100)); if (!paused) left -= 100; }
    check();
  }
  let clip = null; // {key, done:Promise, t0, est}
  // Debug aid: /demo.html?train=bay&tourdebug=1 logs every highlight, tap or typing target that isn't on the page.
  const DEBUG = params.has("tourdebug");
  let sayKey = "";
  const miss = (what, sel, el) => { if (DEBUG && sel && !el) console.warn("[tour-miss]", sayKey, what, typeof sel === "string" ? sel : String(sel)); };
  function say(key) {
    sayKey = key;
    check();
    const words = (LINES[key] || "").split(/\s+/).length;
    const est = Math.max(3, words / 2.4); // fallback seconds if audio can't play
    const c = { key, est, fallback: false, elapsed: 0 };
    const tokens = (LINES[key] || "").split(/\s+/);
    const cues = captionsFor(key, tokens, est);
    let shown = -1;
    const showAt = seconds => {
      let i = 0;
      while (i + 1 < cues.length && cues[i + 1][0] <= seconds) i++;
      if (shown === i || ended) return;
      shown = i;
      setCaption(tokens.slice(cues[i][1], cues[i + 1]?.[1]).join(" "));
    };
    showAt(0);
    c.done = new Promise((resolve) => {
      let fallbackTimer = null;
      const finish = () => { clearInterval(fallbackTimer); audio.ontimeupdate = null; audio.onended = audio.onerror = null; resolve(); };
      const useFallback = () => {
        if (c.fallback) return;
        c.fallback = true;
        fallbackTimer = setInterval(() => { if (!paused) c.elapsed += 0.1; showAt(c.elapsed / est * (cues.at(-1)[0] + 2)); if (c.elapsed >= est || ended) finish(); }, 100);
      };
      audio.ontimeupdate = () => showAt(audio.currentTime);
      audio.onended = finish;
      audio.onerror = useFallback;
      audio.src = "/tour/" + key + ".mp3?v=6";
      audio.muted = muted;
      const p = audio.play();
      if (p && p.catch) p.catch(useFallback);
    });
    clip = c;
    return c.done;
  }
  // Wait until the current clip is a fraction of the way through.
  async function cue(f) {
    const c = clip;
    for (;;) {
      check();
      if (c !== clip) return;
      const pos = c.fallback ? c.elapsed / c.est : (audio.duration ? audio.currentTime / audio.duration : 0);
      if (pos >= f || audio.ended) return;
      await new Promise((r) => setTimeout(r, 80));
    }
  }

  // ---------- spotlight, taps, typing ----------
  const spot = document.createElement("div"); spot.id = "tourSpot";
  const block = document.createElement("div"); block.id = "tourBlock";
  function reveal(el, behavior = "smooth") {
    if (!el?.scrollIntoView || el.closest(".tabs,.topbar")) return;
    const mobile = window.matchMedia("(max-width:760px)").matches;
    el.scrollIntoView({ block: mobile ? "center" : "nearest", inline: "nearest", behavior });
  }
  function highlight(sel) {
    spotSel = sel;
    const el = sel && (typeof sel === "string" ? q(sel) : sel);
    miss("highlight", sel, el);
    reveal(el);
  }
  (function track() {
    let el = spotSel && (typeof spotSel === "string" ? q(spotSel) : spotSel);
    // While a pop-up is open, light up the pop-up rather than something it covers.
    const modal = q(".modal-card");
    if (el && modal && !modal.contains(el)) el = modal;
    if (el && el.isConnected) {
      const r = el.getBoundingClientRect(), pad = 6;
      Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
      spot.classList.add("on");
      const P = document.getElementById("tourPanel");
      if (P && !P.querySelector("input:focus")) {
        const pr = P.getBoundingClientRect();
        if (r.top < pr.bottom + 8 && r.bottom > pr.top - 8) {
          const roomAbove = r.top;
          const roomBelow = document.documentElement.clientHeight - r.bottom;
          P.classList.toggle("top", roomAbove > roomBelow);
        }
      }
    } else spot.classList.remove("on");
    requestAnimationFrame(track);
  })();
  async function tap(sel) {
    check();
    const el = typeof sel === "string" ? q(sel) : sel;
    miss("tap", sel, el);
    if (!el) return;
    reveal(el);
    await wait(250);
    const r = el.getBoundingClientRect();
    const dot = document.createElement("div"); dot.className = "tour-tap";
    dot.style.left = r.left + r.width / 2 + "px"; dot.style.top = r.top + r.height / 2 + "px";
    document.body.appendChild(dot); setTimeout(() => dot.remove(), 600);
    await wait(300);
    // The page may have re-drawn itself meanwhile (it refreshes every minute); click the current copy.
    const now = typeof sel === "string" ? q(sel) : el;
    if (now && now.isConnected) now.click();
    await wait(250);
  }
  async function type(sel, text) {
    const el = q(sel); miss("type", sel, el); if (!el) return;
    el.focus({ preventScroll: true });
    reveal(el, "instant");
    el.value = "";
    for (const ch of String(text)) { check(); el.value += ch; el.dispatchEvent(new Event("input", { bubbles: true })); await wait(45); }
  }

  // ---------- panel ----------
  const panel = document.createElement("div"); panel.id = "tourPanel"; panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Guided tour");
  panel.innerHTML = `<div class="t-top"><span class="t-step" id="tStep"></span>
    <button class="t-btn" id="tPause" type="button">Pause</button>
    <button class="t-btn" id="tMute" type="button">Mute</button>
    <button class="t-btn" id="tEnd" type="button">${lesson ? "End lesson" : "End tour"}</button></div>
    <div class="t-cap" id="tCap" aria-live="polite"></div><div id="tExtra"></div>`;
  function setCaption(t) { q("#tCap").textContent = t; }
  function setStep(n) { stepNo = n; q("#tStep").textContent = lesson ? `Lesson ${lessonIx + 1}: ${lesson.title} · ${n} of ${STEPS}` : `Guided tour · ${n} of ${STEPS}`; }
  function extra(html) { q("#tExtra").innerHTML = html || ""; }
  panel.addEventListener("click", (e) => {
    const id = e.target.id;
    if (id === "tPause") {
      paused = !paused;
      e.target.textContent = paused ? "Resume" : "Pause";
      if (paused) audio.pause(); else if (audio.src && !audio.ended && clip && !clip.fallback) audio.play().catch(() => {});
    }
    if (id === "tMute") { muted = !muted; audio.muted = muted; e.target.textContent = muted ? "Unmute" : "Mute"; }
    if (id === "tEnd") endTour(true);
  });

  // Takeaways stay on screen after the narration so staff can consult them at the counter.
  const takeaways = {
    bay: "Use Awaiting approval to find estimates with an unanswered line. A signed estimate can stay in Estimate review until the shop moves the car.",
    checkin: "For an after-hours drop-off, invite the customer by link. Open their repair when the intake arrives and move it to Checked in when the vehicle is at the shop.",
    estimates: "Open the diagram on a matching estimate line to explain the part. For evidence from this particular car, attach a technician photo. A shop owner sends the finished estimate.",
    customer: "Customers decide on each pending line and sign once. The approved total includes only the work they accepted. Use the same repair link to check progress later.",
    photos: "In your shop, Add photo accepts a camera shot or a library image. Customers can open View photos at the corresponding stage under Progress. Staff can use Remove photo on the repair to take down a mistaken upload.",
    smart: "Use suggested reply puts the draft in the message box. Edit it, then tap Send. For a conversation that needs a person, choose Pause auto-replies for this repair in Messages.",
    pickup: "Before notifying the customer, review the approved work and final total. An owner can create an itemized bill or attach the shop’s PDF. Open the customer’s page to check what they will see.",
    settings: "For a price-list import, start with the example CSV. Include name and rate, then set type to labor, part, fee or percent. A row without a type imports as a part.",
    walkaround: "Review each photo yourself. Confirm accurate marks, remove false matches and tap the image to add damage the scan missed. Customers see the marks you confirm."
  };

  function endTour(early) {
    ended = true; paused = false; window.TOUR_ACTIVE = false;
    try { audio.pause(); } catch (e) { /* ignore */ }
    spotSel = null; block.remove(); stopPolling();
    history.replaceState(null, "", location.pathname + location.hash);
    const next = lesson && LESSONS[lessonIx + 1];
    if (lesson) {
      panel.querySelector(".t-top").innerHTML = `<span class="t-step">${early ? "Lesson ended" : "Lesson complete"} · ${escT(lesson.title)}</span>`;
      setCaption(early ? "You're in the demo shop. Try it yourself; it's all sample data." : takeaways[lesson.id] || (next ? "Nice work. Try it yourself in the demo shop, or go on to the next lesson." : "That's the last lesson. You're ready to run your shop on Talk Shops."));
      extra(`<div class="t-row" style="margin-top:10px">${next ? `<a class="t-btn primary" href="/demo.html?train=${next.id}" style="text-decoration:none">Next: ${escT(next.title)}</a>` : ""}
        <a class="t-btn" href="/demo.html?train=${lesson.id}" style="text-decoration:none">Replay</a>
        <a class="t-btn" href="/demo.html?view=training" style="text-decoration:none">All lessons</a>
        <button class="t-btn" type="button" id="tClose">Try it myself</button></div>`);
    } else {
      panel.querySelector(".t-top").innerHTML = `<span class="t-step">${early ? "Tour ended" : "Tour complete"}</span>`;
      setCaption(early ? "You're in the demo shop now. Click around as much as you like; it's all sample data." : "Thanks for taking the tour!");
      extra(`<div class="t-row" style="margin-top:10px"><a class="t-btn primary" href="/demo.html?tour=1" style="text-decoration:none">Replay tour</a>
        <a class="t-btn" href="/demo.html?view=training" style="text-decoration:none">Training lessons</a>
        <button class="t-btn" type="button" id="tClose">Explore the demo shop</button>
        <a class="t-btn" href="/" style="text-decoration:none">Back to Talk Shops</a></div>`);
    }
    q("#tClose").onclick = () => panel.remove();
  }

  // ---------- texting step ----------
  let pollTimer = null;
  function stopPolling() { clearTimeout(pollTimer); pollTimer = null; }
  async function post(path, body) {
    const res = await fetch(API + "/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await res.text();
    let data = text; try { data = JSON.parse(text); } catch (e) { /* plain text */ }
    if (!res.ok) throw new Error(typeof data === "string" && data ? data : "Something went wrong (" + res.status + ").");
    return data;
  }
  // Resolves with the decision the visitor made on their phone, or null if they chose the on-screen version.
  function textingStep() {
    return new Promise((resolve) => {
      extra(`<form id="tPhoneForm" autocomplete="on">
          <input type="tel" id="tPhone" inputmode="tel" autocomplete="tel" placeholder="Your cell number" aria-label="Your cell number" required>
          <label class="t-chk"><input type="checkbox" id="tConsent"> Text me one demo message with a link. Msg &amp; data rates may apply. No follow-up texts.</label>
          <div class="t-row"><button class="t-btn primary" type="submit" id="tSend">Text me the link</button><button class="t-btn" type="button" id="tSkip">Show me on screen</button></div>
          <p class="t-err" id="tErr" hidden></p></form>`);
      const err = (m) => { const p = q("#tErr"); p.textContent = m; p.hidden = !m; };
      q("#tSkip").onclick = () => resolve(null);
      q("#tPhoneForm").onsubmit = async (e) => {
        e.preventDefault();
        if (!q("#tConsent").checked) { err("Check the box to agree to one demo text."); return; }
        if (!API) { err("Texting isn't available on this copy of the site. Let's do it on screen."); await wait(2500); resolve(null); return; }
        q("#tSend").disabled = true; err("");
        let token;
        try { token = (await post("shop/demo/text", { phone: q("#tPhone").value, consent: true })).token; }
        catch (x) { err(x.message + " Continuing on screen…"); try { await wait(4500); } catch (s) { return; } resolve(null); return; }
        extra(`<div class="t-wait"><span class="t-dot"></span><span>Text sent. Waiting for your decision…</span></div>
          <div class="t-row" style="margin-top:8px"><button class="t-btn" type="button" id="tSkip2">Show me on screen instead</button></div>`);
        q("#tSkip2").onclick = () => { stopPolling(); resolve(null); };
        say("waiting").catch(() => {});
        const started = Date.now();
        const poll = async () => {
          if (ended) return;
          try {
            const res = await fetch(API + "/shop/c/" + token);
            if (res.ok) { const v = await res.json(); if (v && v.approval) { stopPolling(); resolve(v); return; } }
          } catch (x) { /* try again */ }
          if (Date.now() - started > 15 * 60000) { resolve(null); return; }
          pollTimer = setTimeout(poll, 3000);
        };
        pollTimer = setTimeout(poll, 3000);
      };
      setTimeout(() => q("#tPhone")?.focus(), 50);
    });
  }
  // Copy the decision from the visitor's phone onto Lena's car in the demo shop.
  function applyRemote(v) {
    const lena = job("RO-1044");
    const order = { recharge: 0, condenser: 1 };
    let yes = 0;
    v.estimate.forEach((e) => { const line = lena.estimate[order[e.id]]; if (line) { line.status = e.status; if (e.status === "approved") yes++; } });
    const by = (v.approval && v.approval.by) || "Customer";
    lena.approval = { by, t: Date.now() };
    lena.messages.push({ dir: "in", t: Date.now(), text: `Approved ${yes} of ${lena.estimate.length} items on the estimate (signed: ${by}).` });
    save();
  }

  // ---------- helpers for the scripts ----------
  const sec = (re) => qa(".sheet .sec").find((s) => re.test(s.querySelector("h3")?.textContent || ""));
  const openSheet = async (ro) => {
    if (q(".modal")) { await tap("[data-cancel]"); await wait(200); }
    if (q(".sheet")) { await tap(".sheet .x"); await wait(300); }
    if (!q(`[data-open="${ro}"]`)) { await tab("board"); await wait(250); }
    await tap(`[data-open="${ro}"]`);
    await wait(250);
  };
  // On a phone, Settings, Plan and Training live under More, so open that sheet the way a person would.
  const shown = (el) => !!el && el.getClientRects().length > 0;
  async function tab(view) {
    if (q(".sheet")) { await tap(".sheet .x"); await wait(200); }
    const b = q(`.tab[data-view="${view}"]`);
    if (!shown(b) && shown(q(".tab-more"))) {
      await tap(".tab-more"); await wait(300);
      highlight(".more-sheet"); await wait(700);
      await tap(`[data-more-view="${view}"]`);
    } else await tap(b);
    await wait(250);
  }
  // The tab bar, or on a phone, the More button that holds the rest.
  const tabSel = (view) => shown(q(`.tab[data-view="${view}"]`)) ? `.tab[data-view="${view}"]` : ".tab-more";
  // Choose an option in a select the way a person would, so the page's change handlers run.
  async function pick(sel, value) {
    const el = typeof sel === "string" ? q(sel) : sel; miss("pick", sel, el); if (!el) return;
    reveal(el); await wait(250); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); el.dispatchEvent(new Event("input", { bubbles: true })); await wait(300);
  }
  // Open one stage column on the Bay, sort it, then go back to all stages.
  async function stageView(stage, sort) {
    await tap(`[data-stage-focus="${stage}"]`); await wait(300);
    const col = q(`.col[data-stage="${stage}"]`); highlight(col?.querySelector(".stage-controls") || col);
    if (sort) await pick(col?.querySelector("[data-stage-sort]"), sort);
  }
  // Show the sign-in page (not a tab) in the demo shop.
  async function page(view) { await closeAll(); window.demoGo?.(view); await wait(300); }
  // Type into a saved-item box, then pick the first suggestion.
  async function pickSaved(text) {
    await type("#li-item", text);
    await wait(500);
    highlight("#suggestList");
    await wait(700);
    const opt = q("#suggestList .suggest-o");
    if (opt) await tap(opt);
    await wait(300);
  }
  async function search(sel, text) {
    await type(sel, text);
    await wait(300);
  }
  async function clearInput(sel) {
    const el = q(sel); if (!el) return;
    el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(200);
  }
  async function closeAll() {
    if (q(".modal")) { await tap("[data-cancel]"); await wait(200); }
    if (q(".sheet")) { await tap(".sheet .x"); await wait(200); }
  }
  // Reset the demo shop and go to a view without any narration.
  async function begin(view) {
    document.body.append(block, spot, panel);
    q("#resetBtn")?.click(); // start from the same sample cars every time
    await wait(200);
    if (location.hash) { history.replaceState(null, "", location.pathname + location.search); render(); }
    if (view) await tab(view);
  }
  const step = () => setStep(stepNo + 1);

  // ---------- the guided tour ----------
  async function runTour() {
    STEPS = 13;
    await begin("board");
    setStep(1);
    highlight(".topbar .brand");
    await say("intro");

    setStep(2);
    const board = say("board");
    highlight(".board-top h2");
    await cue(0.17); highlight(".queue-sub");
    await cue(0.33); highlight(".board-wrap");
    await cue(0.55); highlight(q(".card.age-old") || ".board-wrap");
    await cue(0.8); highlight(q(".card .urgency")?.closest(".card") || ".board-wrap");
    await board;

    setStep(3);
    const sr = say("search");
    highlight(".board-search");
    await cue(0.1); await search("#boardSearch", "whitaker");
    highlight(".board-wrap");
    await cue(0.36); await clearInput("#boardSearch");
    await cue(0.42); highlight('[data-queue="approval"]'); await tap('[data-queue="approval"]'); await wait(300); highlight(".board-wrap");
    await cue(0.52); await tap('[data-queue="all"]'); highlight(".queue-filters");
    await cue(0.58); await stageView("in_progress", "urgency");
    await cue(0.72); await tap("[data-stage-back]"); await wait(250); highlight(".tabs");
    await sr;

    setStep(4);
    const ci = say("checkin");
    await tab("checkin");
    highlight("#checkinForm");
    await cue(0.12);
    await type("#ci-name", "Sam Ortiz");
    await cue(0.2); highlight(q("#ci-channel")?.closest("label"));
    const chSel = q("#ci-channel"); if (chSel) { chSel.value = "both"; chSel.dispatchEvent(new Event("change", { bubbles: true })); }
    await cue(0.36); highlight("#checkinForm");
    await type("#ci-phone", "(555) 019-4410"); await type("#ci-email", "sam.ortiz@example.com");
    await type("#ci-year", "2014"); await type("#ci-make", "Mazda"); await type("#ci-model", "CX-5");
    await type("#ci-plate", "3CXF882");
    await cue(0.62); await type("#ci-concern", "Squealing belt on cold starts");
    await cue(0.78); highlight(q("#ci-consent")?.closest("label")); await tap("#ci-consent");
    await cue(0.92); highlight("#checkinForm .btn.primary"); await tap("#checkinForm .btn.primary");
    await ci;

    setStep(5);
    const ft = say("firsttext");
    highlight(".sheet .thread");
    await cue(0.5); highlight(".sheet .thread .bubble");
    await cue(0.75); highlight(".sheet .thread .bubble .meta");
    await ft;

    setStep(6);
    const est = say("estimate");
    spotSel = null;
    await openSheet("RO-1044");
    highlight("#estSec");
    await cue(0.38); highlight(".est-add");
    await pickSaved("recharge"); highlight(".est-add"); await tap("#addLine button[type=submit]");
    await cue(0.68);
    await pickSaved("condenser"); highlight(".est-add"); await tap("#addLine button[type=submit]");
    await cue(0.85); highlight(q("#li-save")?.closest("label"));
    await est;

    setStep(7);
    const sd = say("send");
    highlight(".est-send"); await tap(".est-send");
    highlight("#sendForm");
    await cue(0.35); highlight("#m-text");
    await cue(0.85); await tap("#sendForm .btn.primary");
    highlight(".sheet .thread");
    await sd;

    setStep(8);
    highlight(null);
    say("tryit");
    const remote = await textingStep();
    check();
    extra("");
    if (remote) {
      try { audio.pause(); } catch (e) { /* ignore */ }
      applyRemote(remote);
      render();
      await wait(300);
      if (!q(".sheet")) await openSheet("RO-1044");
      setStep(9);
      const g = say("gotit");
      highlight(".sheet .thread");
      await cue(0.4); highlight("#estSec");
      await cue(0.75); highlight(qa(".sheet .thread .bubble.in").pop());
      await g;
    } else {
      try { audio.pause(); } catch (e) { /* ignore */ }
      const os = say("onscreen");
      await tap("#viewAsCust");
      highlight(".c-head");
      await cue(0.25);
      const est2 = qa(".c-card").find((c) => /Estimate/i.test(c.textContent));
      if (est2) highlight(est2);
      await cue(0.45); await tap(qa('[data-decide][data-v="approved"]')[0]);
      await cue(0.52); await tap(qa('[data-decide][data-v="declined"]')[1]);
      await cue(0.66); highlight("#sig"); await type("#sig", "Lena Brooks");
      await cue(0.76); await tap("#submitApproval");
      await cue(0.84); highlight("#privacyLink");
      await os;
      setStep(9);
      await tap("#backToShop");
      highlight("#estSec .est");
      await wait(350);
      const bs = say("backshop");
      await cue(0.70);
      highlight("#approvalSignature");
      await bs;
    }

    setStep(10);
    const al = say("along");
    highlight(".sheet .stepper");
    for (const [stage, f] of [["in_progress", 0.2], ["qc", 0.3], ["ready", 0.62]]) {
      await cue(f);
      highlight(`.sheet .step[data-stage="${stage}"]`);
      await tap(`.sheet .step[data-stage="${stage}"]`);
      highlight("#sendForm");
      await wait(900);
      await tap("#sendForm .btn.primary");
      highlight(".sheet .stepper");
    }
    highlight(".sheet .thread");
    await al;

    setStep(11);
    const ar = say("archive");
    await tab("archive");
    highlight(".archive");
    await cue(0.4); highlight(".archive-search"); await search("#archiveQ", "delgado");
    await cue(0.75); highlight(".archive-list");
    await ar;

    setStep(12);
    const st = say("settings");
    await tab("settings");
    highlight("#setupForm");
    await cue(0.3); highlight(q("#sh-email")?.closest("label"));
    await cue(0.5); highlight("#savedItems");
    await cue(0.75); highlight("#importBox");
    await st;

    setStep(13);
    const pl = say("plan");
    await tab("plan");
    highlight(".plan-page");
    await cue(0.3); highlight(".plan-cards");
    await cue(0.5); await tap('[data-plan-interval="year"]'); highlight(".plan-cards");
    await cue(0.72); highlight(".plan-fine");
    await pl;

    const wr = say("wrap");
    highlight(tabSel("training"));
    await cue(0.45); await tab("board"); highlight(".board-wrap");
    await wr;
    endTour(false);
  }

  // ---------- training lessons ----------
  const TRAIN = {
    async bay() {
      STEPS = 6; await begin("board");
      step(); { const c = say("bay-1"); highlight(".tabs"); await cue(0.62); highlight(tabSel("settings")); await c; }
      step(); {
        const c = say("bay-2"); highlight(".board-top");
        await cue(0.22); highlight(".queue-add");
        await cue(0.36); highlight(".queue-filters");
        await cue(0.55); await tap('[data-queue="approval"]'); highlight(".board-wrap");
        await cue(0.85); await tap('[data-queue="all"]'); highlight(".queue-filters");
        await c;
      }
      step(); {
        const c = say("bay-3"); highlight(".board-wrap");
        await cue(0.28); highlight(q('[data-stage-focus="diagnosing"]') || ".board-wrap");
        await cue(0.33); await stageView("diagnosing");
        await cue(0.45); await pick('.col[data-stage="diagnosing"] [data-stage-sort]', "stage");
        await cue(0.55); await pick('.col[data-stage="diagnosing"] [data-stage-sort]', "urgency");
        await cue(0.68); highlight('.col[data-stage="diagnosing"] [data-stage-filter]');
        await cue(0.86); await tap("[data-stage-back]"); await wait(250); highlight(".board-wrap");
        await c;
      }
      step(); {
        const c = say("bay-4"); highlight(".board .card");
        await cue(0.25); highlight(qa(".card").find((x) => x.querySelector(".pill.bad")) || ".board .card");
        await cue(0.33); highlight(q(".card .urgency")?.closest(".card") || ".board .card");
        await cue(0.6); highlight(q(".card.age-ok") || ".board .card");
        await cue(0.7); highlight(q(".card.age-mid") || ".board .card");
        await cue(0.82); highlight(q(".card.age-old") || ".board .card");
        await c;
      }
      step(); {
        const c = say("bay-5"); highlight(".board-search");
        await cue(0.35); await search("#boardSearch", "whitaker"); highlight(".board-wrap");
        await cue(0.7); await clearInput("#boardSearch"); highlight(".board-wrap");
        await cue(0.85); highlight('.tab[data-view="archive"]');
        await c;
      }
      step(); { const c = say("bay-6"); highlight('[data-open="RO-1041"]'); await cue(0.4); await tap('[data-open="RO-1041"]'); highlight(".sheet"); await c; }
    },
    async checkin() {
      STEPS = 7; await begin("board");
      step(); { const c = say("ci-1"); await tab("checkin"); highlight(q("#ci-method")?.closest("label")); await c; }
      step(); { const c = say("ci-2"); highlight(q("#ci-method")?.closest("label")); await cue(0.6); highlight("#ci-help"); await c; }
      step(); {
        const c = say("ci-3"); highlight(q("#ci-name")?.closest("label")); await type("#ci-name", "Sam Ortiz");
        await cue(0.3); highlight(q("#ci-channel")?.closest("label"));
        await cue(0.55); const s = q("#ci-channel"); if (s) { s.value = "both"; s.dispatchEvent(new Event("change", { bubbles: true })); }
        highlight("#checkinForm .form-grid"); await type("#ci-phone", "(555) 019-4410"); await type("#ci-email", "sam.ortiz@example.com");
        await c;
      }
      step(); {
        const c = say("ci-4"); highlight("#checkinForm .form-grid");
        await type("#ci-year", "2014"); await type("#ci-make", "Mazda"); await type("#ci-model", "CX-5"); await type("#ci-plate", "3CXF882");
        await cue(0.5); highlight(q("#ci-concern")?.closest("label")); await type("#ci-concern", "Squealing belt on cold starts");
        await cue(0.78); highlight(".urgency-field"); const m = q('.urgency-field input[value="medium"]'); if (m) await tap(m.closest("label") || m);
        await c;
      }
      step(); {
        const c = say("ci-5"); highlight(q("#ci-consent")?.closest("label")); await cue(0.45); await tap("#ci-consent");
        await cue(0.8); highlight("#checkinForm .btn.primary"); await tap("#checkinForm .btn.primary");
        await c;
      }
      step(); { const c = say("ci-6"); highlight(".sheet .thread"); await cue(0.6); await tap(".sheet .x"); highlight(".board .col"); await c; }
      step(); {
        const c = say("ci-7"); await openSheet("RO-1044"); highlight("[data-edit-customer]");
        await cue(0.2); await tap("[data-edit-customer]"); await wait(250); highlight("#customerForm");
        await cue(0.4); await pick("#ec-channel", "sms"); highlight(q("#ec-channel")?.closest("label"));
        await cue(0.6); highlight(q("#ec-consent")?.closest("label")); await tap("#ec-consent");
        await cue(0.85); await tap("#customerForm .btn.primary"); await wait(250); highlight(".sheet-h");
        await c;
      }
    },
    async stages() {
      STEPS = 5; await begin("board");
      step(); { const c = say("st-1"); await cue(0.3); await openSheet("RO-1046"); highlight(".sheet .stepper"); await c; }
      step(); { const c = say("st-2"); highlight('.sheet .btn.primary[data-stage]'); await tap('.sheet .btn.primary[data-stage]'); highlight("#sendForm"); await cue(0.45); highlight("#m-text"); await c; }
      step(); { const c = say("st-3"); highlight(q("#m-send")?.closest("label")); await cue(0.85); highlight("#sendForm .btn.primary"); await tap("#sendForm .btn.primary"); highlight(".sheet .stepper"); await c; }
      step(); {
        const c = say("st-4"); await openSheet("RO-1042"); highlight(q("#eta")?.closest("label") || ".sheet .stepper");
        await cue(0.45); await openSheet("RO-1045"); highlight("#billSec");
        await c;
      }
      step(); {
        const c = say("st-5"); highlight("#replyForm");
        await cue(0.3); await type("#replyIn", "Your car is washed and ready. See you before 6!"); await tap("#replyForm .btn.primary");
        highlight(".sheet .thread");
        await c;
      }
    },
    async estimates() {
      STEPS = 7; await begin("board");
      step(); { const c = say("es-1"); await openSheet("RO-1044"); highlight("#estSec"); await cue(0.6); highlight(".est-add"); await c; }
      step(); { const c = say("es-2"); highlight(".est-add"); await cue(0.2); await pickSaved("recharge"); highlight(".est-add"); await cue(0.85); await tap("#addLine button[type=submit]"); highlight("#estSec"); await c; }
      step(); { const c = say("es-3"); q("#li-item")?.blur(); await wait(300); highlight(".suggest-btn"); await tap(".suggest-btn"); highlight("#suggestList"); await cue(0.6); await pickSaved("condenser"); await tap("#addLine button[type=submit]"); highlight("#estSec"); await c; }
      step(); {
        const c = say("es-pri"); highlight(".pri-pick");
        await cue(0.55); const sel = qa(".pri-sel").pop(); highlight(sel?.closest("td"));
        if (sel) { sel.value = "optional"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
        await wait(300); highlight("#estSec table");
        await c;
      }
      step(); { const c = say("es-4"); highlight(q("#li-save")?.closest("label")); await cue(0.55); highlight("#laborBtn"); await c; }
      step(); { const c = say("es-5"); highlight(".est-send"); await cue(0.2); await tap(".est-send"); highlight("#sendForm"); await cue(0.6); await tap("#sendForm .btn.primary"); highlight(".sheet .stepper"); await c; }
      step(); { const c = say("es-6"); await openSheet("RO-1042"); highlight("#estSec"); await c; }
    },
    async walk() {
      STEPS = 5; await begin("board");
      step(); { const c = say("wk-1"); await openSheet("RO-1046"); q("#walkSec")?.scrollIntoView({ block: "center" }); highlight("#walkSec"); await c; }
      step(); {
        const c = say("wk-2"); await tap('[data-walk="before"]'); await wait(300); highlight(".wt-list");
        await cue(0.55); highlight('[data-walk-row="battery"]'); await tap('[data-walk-set="battery"][data-v="now"]');
        await cue(0.75); await type('[data-walk-note="battery"]', "Battery tested weak at 9.8 volts");
        await c;
      }
      step(); {
        const c = say("wk-3"); highlight(".wt-bar"); await cue(0.12); await tap("[data-walk-allgood]"); highlight(".wt-list");
        await cue(0.35); await type("#wt-miles", "84,120"); highlight(q("#wt-miles")?.closest("label"));
        await cue(0.5); await type("#wt-summary", "Battery is weak and should be replaced. Everything else looks good."); highlight(q("#wt-summary")?.closest("label"));
        await cue(0.7); highlight(q("#wt-send")?.closest("label"));
        await cue(0.88); await tap("#walkForm .btn.primary"); await wait(300); highlight("#walkSec");
        await c;
      }
      step(); {
        const c = say("wk-4"); q("#walkSec")?.scrollIntoView({ block: "center" }); highlight('[data-walk="after"]');
        await cue(0.15); await tap('[data-walk="after"]'); await wait(300); highlight(".wt-list");
        await cue(0.55); highlight('[data-walk-row="battery"]'); await tap('[data-walk-set="battery"][data-v="good"]');
        await cue(0.85); await tap("#walkForm .btn.primary"); await wait(300); highlight("#walkSec");
        await c;
      }
      step(); { const c = say("wk-5"); await tap("#viewAsCust"); await wait(400); q(".wt-card")?.scrollIntoView({ block: "start" }); highlight(".wt-card"); await cue(0.5); highlight(".wt-table"); await c; }
    },
    async walkaround() {
      STEPS = 6; await begin("board");
      const review = async (id, act) => { await tap(`[data-wa-open="${id}"]`); await wait(300); highlight(".wa-modal"); return act; };
      step(); {
        const c = say("wa-1"); await openSheet("RO-1046"); q("#waSec")?.scrollIntoView({ block: "center" }); highlight("#waSec");
        await cue(0.6); highlight("[data-wa-request]"); await cue(0.75); await tap("[data-wa-request]"); await wait(300); highlight("#waSec");
        await c;
      }
      step(); {
        const c = say("wa-2"); await tap("#viewAsCust"); await wait(400); q(".wa-card")?.scrollIntoView({ block: "start" }); highlight(".wa-card");
        await cue(0.3); highlight(".wa-grid"); await cue(0.55); highlight(".wa-next"); await cue(0.8); highlight(".wa-next .btn");
        await c;
      }
      step(); {
        const c = say("wa-3"); await tap("#backToShop"); await wait(300); await openSheet("RO-1043"); q("#waSec")?.scrollIntoView({ block: "center" }); highlight("#waSec");
        await cue(0.3); highlight("[data-wa-ai]"); await tap("[data-wa-ai]"); await wait(2200); highlight("#waSec .wa-grid");
        await c;
      }
      step(); {
        const c = say("wa-4"); await cue(0.15); await review("wa-rear");
        await cue(0.45); await tap('[data-wa-confirm="0"]'); highlight(".wa-marks");
        await cue(0.7); highlight(".wa-big");
        await c; await tap("[data-wa-save]"); await wait(300);
      }
      step(); {
        const c = say("wa-5"); await review("wa-right");
        await cue(0.4); highlight(".wa-marks"); await cue(0.5); await tap('[data-wa-del="0"]');
        await cue(0.65); await tap("[data-wa-save]"); await wait(300); highlight("#waSec");
        await c;
      }
      step(); {
        const c = say("wa-6"); await tap("#viewAsCust"); await wait(400); q(".wa-card")?.scrollIntoView({ block: "start" }); highlight(".wa-card");
        await cue(0.45); highlight(q(".wa-found") || ".wa-card");
        await c;
      }
    },
    async customer() {
      STEPS = 5; await begin("board");
      step(); { const c = say("cu-1"); await cue(0.5); await openSheet("RO-1041"); highlight("#viewAsCust"); await cue(0.85); await tap("#viewAsCust"); highlight(".c-head"); await c; }
      step(); {
        const c = say("cu-2"); highlight(".c-head"); await cue(0.2);
        highlight(qa(".c-card").find((x) => /Estimate/.test(x.textContent)));
        await cue(0.35); highlight(".pri-line");
        const diagram = q(".est-item .repair-details summary");
        if (diagram) { await tap(diagram); highlight(diagram.parentElement); await wait(900); await tap(diagram); }
        await cue(0.55); highlight(qa(".c-card").find((x) => /Estimate/.test(x.textContent)));
        await cue(0.6); await tap(qa('[data-decide][data-v="approved"]')[0]);
        await cue(0.75); await tap(qa('[data-decide][data-v="declined"]')[1]);
        await c;
      }
      step(); { const c = say("cu-3"); highlight("#sig"); await type("#sig", "Maria Delgado"); await cue(0.55); await tap("#submitApproval"); highlight(qa(".c-card")[0]); await c; }
      step(); {
        const c = say("cu-4"); highlight(qa(".c-card").find((x) => /Photos/.test(x.textContent)));
        await cue(0.2); highlight(qa(".c-card").find((x) => /Notes/.test(x.textContent)));
        await cue(0.4); highlight(qa(".c-card").find((x) => /Progress/.test(x.textContent)));
        await cue(0.6); highlight(".c-card.call");
        await cue(0.75); highlight("#privacyLink");
        await c;
      }
      step(); { const c = say("cu-5"); highlight(".c-head"); await cue(0.7); await tap("#backToShop"); highlight("#estSec"); await c; }
    },
    async photos() {
      STEPS = 4; await begin("board");
      step(); { const c = say("ph-1"); await openSheet("RO-1041"); highlight("#photoSec"); await c; }
      step(); { const c = say("ph-2"); highlight(".photo-add"); await c; }
      step(); {
        const c = say("ph-3"); highlight("#noteSec"); await cue(0.2);
        await type("#noteIn", "Brake fluid tested at 4% moisture. Flush recommended with the brake job.");
        await cue(0.55); highlight("#noteSec .btn.mic");
        await c;
      }
      step(); { const c = say("ph-4"); highlight(q("#noteSend")?.closest("label")); await tap("#noteSend"); await cue(0.60); highlight("#noteSec .btn.primary"); await tap("#noteSec .btn.primary"); highlight("#noteSec .notes"); await c; }
    },
    async howto() {
      STEPS = 5; await begin("board");
      step(); { const c = say("ht-1"); highlight('.tab[data-view="howto"]'); await c; }
      step(); {
        const c = say("ht-2"); await cue(0.2); await openSheet("RO-1046"); highlight(".howto-link");
        await cue(0.55); await tap(".howto-link button"); highlight(".howto-veh");
        await c;
      }
      step(); {
        const c = say("ht-3"); highlight(q("#howtoCar")?.closest("label") || ".howto-veh");
        await cue(0.2); highlight(q("#howtoEngine")?.closest("label"));
        await cue(0.4); highlight(q("#howtoQ")?.closest("label"));
        await cue(0.55); highlight(".howto-actions .mic");
        await cue(0.7); highlight(".howto-form > .howto-quick");
        await cue(0.88); const chip = qa(".howto-form .howto-chip").find((b) => /battery/i.test(b.textContent)); if (chip) await tap(chip);
        highlight("#howtoThread");
        await c;
      }
      step(); {
        const c = say("ht-4"); await wait(300); highlight(".howto-answer");
        await cue(0.12); highlight(".howto-block.warn");
        await cue(0.2); highlight(".howto-block.specs");
        await cue(0.3); highlight(".howto-cols");
        await cue(0.4); highlight(".howto-steps");
        await cue(0.55); highlight(".howto-foot .howto-quick");
        await cue(0.82); highlight("[data-howto-copy]");
        await c;
      }
      step(); { const c = say("ht-5"); highlight(".howto-safety"); await cue(0.8); highlight(".howto-fine"); await c; }
    },
    async pickup() {
      STEPS = 4; await begin("board");
      step(); { const c = say("pk-1"); await openSheet("RO-1045"); highlight("#billSec"); await cue(0.35); await tap("#makeBill"); highlight("#billSec"); await cue(0.7); highlight("#uploadBill"); await c; }
      step(); {
        const c = say("pk-2"); highlight('.sheet .step[data-stage="picked_up"]'); await tap('.sheet .btn.primary[data-stage="picked_up"]');
        highlight("#sendForm"); await cue(0.5); await tap("#sendForm .btn.primary"); highlight(".board-wrap");
        await cue(0.8); highlight('.tab[data-view="archive"]');
        await c;
      }
      step(); {
        const c = say("pk-3"); await openSheet("RO-1046"); highlight("#closeJobBtn"); await cue(0.2); await tap("#closeJobBtn");
        highlight("#closeForm"); await cue(0.45); highlight(q("#c-reason")?.closest("label"));
        await cue(0.65); await tap("#c-send"); highlight("#closeForm");
        await cue(0.88); await tap("#closeForm .btn.primary"); highlight(".board-wrap");
        await c;
      }
      step(); { const c = say("pk-4"); await openSheet("RO-1044"); highlight("#dangerSec"); await c; }
    },
    async archive() {
      STEPS = 4; await begin("board");
      step(); { const c = say("ar-1"); await tab("archive"); highlight(".archive"); await c; }
      step(); { const c = say("ar-2"); highlight(".archive-search"); await cue(0.45); await search("#archiveQ", "delgado"); highlight("#archiveRows"); await c; }
      step(); { const c = say("ar-3"); highlight(".archive-row .a-meta"); await c; }
      step(); { const c = say("ar-4"); await tap(".archive-row"); highlight(".sheet"); await cue(0.55); highlight("#archivedNote"); await c; }
    },
    async settings() {
      STEPS = 5; await begin("board");
      step(); { const c = say("se-1"); await tab("settings"); highlight("#setupForm"); await c; }
      step(); { const c = say("se-2"); highlight(q("#sh-email")?.closest("label")); await c; }
      step(); {
        const c = say("se-3"); highlight("#savedItems");
        await cue(0.6); highlight("#rateForm"); await type("#r-name", "Wiper blades (pair)"); await type("#r-rate", "39");
        await tap("#rateForm .btn"); highlight("#savedItems");
        await c;
      }
      step(); { const c = say("se-4"); highlight("#importBox"); await cue(0.75); highlight("#rateTemplate"); await c; }
      step(); {
        const c = say("se-5"); q(".age-settings")?.scrollIntoView({ block: "center" }); highlight(".age-settings");
        await cue(0.3); highlight(".age-thresholds"); await type('[name="ageWarningDays"]', "2"); q('[name="ageWarningDays"]')?.dispatchEvent(new Event("input", { bubbles: true }));
        await cue(0.5); highlight(".age-color-pickers");
        await cue(0.65); highlight(".age-preview");
        await cue(0.85); highlight("#setupForm .btn.primary"); await tap("#setupForm .btn.primary");
        await c;
      }
    },
    async help() {
      STEPS = 2; await begin("board");
      step(); { const c = say("hp-1"); await tab("help"); highlight(".help-heading"); await cue(0.3); highlight("#help-guides"); const d = q("#help-guides details"); if (d) await tap(d.querySelector("summary")); await cue(0.75); highlight(q(".help-center details:not(#help-guides details)")?.closest("section") || "#help-training"); await c; }
      step(); { const c = say("hp-2"); q("#help-support")?.scrollIntoView({ block: "start" }); highlight("#help-support"); await cue(0.5); highlight("#helpForm"); await c; }
    },
    async team() {
      STEPS = 5; await begin("board");
      step(); { const c = say("tm-1"); await tab("settings"); highlight("#teamPanel"); await wait(600); highlight("#teamPanel"); await c; }
      step(); { const c = say("tm-2"); highlight("#teamPanel > p"); await cue(0.55); highlight(".team-list"); await c; }
      step(); { const c = say("tm-3"); highlight(q("#teamPanel p strong")?.closest("p") || "#teamPanel"); await c; }
      step(); {
        const c = say("tm-4"); highlight("#teamInviteForm");
        await cue(0.12); await type("#tm-email", "sam@ridgelineauto.com"); await type("#tm-name", "Sam Lee");
        await cue(0.3); await tap("#teamInviteForm .btn.primary"); await wait(700);
        highlight(q(".team-row.pending") || ".team-list");
        await cue(0.55); highlight(q(".team-link") || "#teamPanel");
        await c;
      }
      step(); { const c = say("tm-5"); highlight(q("[data-team-role]")?.closest(".team-row") || ".team-list"); await cue(0.45); highlight(q(".team-row.pending") || ".team-list"); await cue(0.7); highlight(q("[data-team-remove]") || ".team-list"); await c; }
    },
    async smart() {
      STEPS = 5; await begin("board");
      const sample = async (topic, auto) => {
        const d = q("#smartDemo"); if (d && !d.open) { await tap("#smartDemo summary"); await wait(200); }
        const sel = q("#sampleSms"); if (sel) { sel.value = topic; highlight(sel); await wait(500); }
        const box = q("#demoAuto"); if (box && box.checked !== auto) await tap(box);
        await tap("#simulateSms"); await wait(400);
      };
      step(); { const c = say("sm-1"); await openSheet("RO-1041"); q("#msgSec")?.scrollIntoView({ block: "center" }); highlight("#msgSec"); await c; }
      step(); {
        const c = say("sm-2"); const choices = q("#smartDemo"); if (choices) choices.open = true; highlight("#sampleSms");
        await cue(0.3); await sample("status", false); highlight(q("#msgSec .thread .bubble:last-child") || "#msgSec .thread");
        await cue(0.72); highlight(q("#demoDraft") || "#msgSec .thread"); if (q("#demoDraft")) { await tap("#demoDraft"); highlight("#replyIn"); }
        await c;
      }
      step(); { const c = say("sm-3"); await cue(0.1); await sample("hours", true); highlight(q("#msgSec .thread .bubble:last-child") || "#msgSec .thread"); await c; }
      step(); { const c = say("sm-4"); await cue(0.15); await sample("review", true); highlight(q("#msgSec .thread .bubble:last-child") || "#msgSec .thread"); await c; }
      step(); {
        const c = say("sm-5"); await tab("settings"); q("#smartSettings")?.scrollIntoView({ block: "center" }); highlight("#smartSettings");
        await cue(0.55); const d = q("#smartSchedule"); if (d && !d.open) await tap("#smartSchedule summary"); highlight("#smartSettings");
        await c;
      }
    },
    async signin() {
      STEPS = 5; await begin("board");
      step(); { const c = say("si-1"); await page("signin"); highlight("#signinCard"); await cue(0.42); highlight("#demoGoogle"); await cue(0.55); highlight("#demoSignin"); await cue(0.72); highlight("#demoSignup"); await c; }
      step(); { const c = say("si-2"); highlight("#forgotPw"); await cue(0.2); await tap("#forgotPw"); highlight("#forgotForm"); await c; }
      step(); {
        const c = say("si-3"); await tap("#fpText"); await wait(300); highlight("#signinCard");
        await cue(0.3); await type("#fp-code", "482913");
        await cue(0.5); await type("#fp-pass", "brakes-2026");
        await cue(0.78); await tap("#resetForm .btn.primary"); highlight(".board-wrap");
        await c;
      }
      step(); {
        const c = say("si-4"); await tab("settings"); q("#recoveryPanel")?.scrollIntoView({ block: "center" }); highlight("#recoveryPanel");
        await cue(0.55); await type("#rc-phone", "(555) 014-7788");
        await cue(0.8); await tap("#recoveryPhoneForm .btn.primary"); highlight("#recoveryPanel");
        await c;
      }
      step(); { const c = say("si-5"); await cue(0.05); await type("#rc-code", "123456"); await tap("#recoveryCodeForm .btn.primary"); await wait(300); highlight("#recoveryPanel"); await c; }
    },
    async plan() {
      STEPS = 4; await begin("board");
      step(); { const c = say("pl-1"); highlight(".plan-banner"); await c; }
      step(); {
        const c = say("pl-2"); await tab("plan"); highlight(".plan-cards");
        await cue(0.25); highlight(qa(".plan-card")[0]); await cue(0.55); highlight(qa(".plan-card")[1]);
        await cue(0.82); await tap('[data-plan-interval="year"]'); highlight(".plan-cards");
        await c;
      }
      step(); { const c = say("pl-3"); highlight(".plan-fine"); await c; }
      step(); { const c = say("pl-4"); highlight(".plan-page"); await c; }
    },
  };

  function start() {
    const name = lesson ? lesson.title : "Guided demo";
    Promise.all([
      fetch("/tour/lines.json?v=4").then(r => r.json()).then(lines => { LINES = lines; }).catch(() => {}),
      fetch("/tour/caption-cues.json?v=3").then(r => r.json()).then(cues => { timings = cues; }).catch(() => {})
    ]).then(() => {
      const gate = document.createElement("div"); gate.id = "tourStart";
      gate.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="tsH">
        ${lesson ? `<p style="margin:0 0 4px;font-size:13px">Training · Lesson ${lessonIx + 1} of ${LESSONS.length} · about ${lesson.mins} min</p>` : ""}
        <h2 id="tsH">${escT(name)}</h2>
        <p>${lesson ? escT(lesson.desc) + " Turn your sound on. It runs in the demo shop with sample cars." : "A narrated walk-through of an auto shop using Talk Shops, about 5 minutes. Turn your sound on. Halfway through you can approve work from your own phone."}</p>
        <div class="t-row"><button class="btn primary" id="tsGo" type="button">▶ ${lesson ? "Start the lesson" : "Start the tour"}</button><button class="btn" id="tsNo" type="button">${lesson ? "Not now" : "Explore on my own"}</button></div></div>`;
      document.body.appendChild(gate);
      q("#tsGo").focus();
      q("#tsNo").onclick = () => { gate.remove(); window.TOUR_ACTIVE = false; history.replaceState(null, "", location.pathname + (lesson ? "?view=training" : "")); if (lesson) { ui.view = "training"; render(); } };
      q("#tsGo").onclick = () => {
        gate.remove();
        // Unlock audio on this tap (mobile browsers only allow playback after a user gesture).
        audio.src = "/tour/intro.mp3"; audio.play().then(() => audio.pause()).catch(() => {});
        const go = lesson ? async () => { await TRAIN[lesson.id](); await wait(400); endTour(false); } : runTour;
        go().catch((e) => { if (!(e instanceof Stop)) { console.error(e); endTour(true); } });
      };
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
