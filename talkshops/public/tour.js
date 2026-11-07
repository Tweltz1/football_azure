// Voice-guided tour of the demo shop (/demo.html?tour=1).
// It drives the demo page by clicking its own buttons, highlights what it talks about,
// and plays one narration clip per step (/tour/<step>.mp3, captions from lines.json).
// Midway, the visitor can get ONE real text (POST /shop/demo/text) and approve or decline
// the estimate on their own phone; the tour waits for that decision, then carries on.
(function () {
  "use strict";
  if (!/[?&]tour=1\b/.test(location.search)) return;
  const CFG = window.BAY_CONFIG || {};
  const API = (CFG.apiUrl || "").replace(/\/$/, "");
  const q = (s) => document.querySelector(s);
  const qa = (s) => [...document.querySelectorAll(s)];
  const escT = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const css = `
  #tourBlock{position:fixed;inset:0;z-index:60;cursor:default}
  #tourSpot{position:fixed;z-index:61;pointer-events:none;border-radius:12px;box-shadow:0 0 0 3px #f2a650,0 0 0 9999px rgba(8,12,18,.5);transition:all .35s ease;opacity:0}
  #tourSpot.on{opacity:1}
  .tour-tap{position:fixed;z-index:62;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(242,166,80,.55);border:2px solid #f2a650;pointer-events:none;animation:tourTap .55s ease-out forwards}
  @keyframes tourTap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
  #tourPanel{position:fixed;z-index:63;left:50%;transform:translateX(-50%);bottom:calc(14px + env(safe-area-inset-bottom,0px));width:min(680px,calc(100% - 24px));background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);padding:14px 16px;font-family:var(--f-body);box-sizing:border-box}
  #tourPanel .t-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  #tourPanel .t-step{font-family:var(--f-mono);font-size:12px;color:var(--muted);margin-right:auto}
  #tourPanel .t-cap{font-size:15.5px;line-height:1.45;max-height:30vh;overflow:auto}
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
  @media (max-width:600px){#tourPanel .t-cap{font-size:14.5px;max-height:22vh}}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  let LINES = {};
  const audio = new Audio();
  audio.preload = "auto";
  let paused = false, ended = false, muted = false;
  let spotSel = null, stepNo = 0;
  const STEPS = 9;
  class Stop extends Error {}
  const check = () => { if (ended) throw new Stop(); };

  // ---------- timing ----------
  async function wait(ms) {
    let left = ms;
    while (left > 0) { check(); await new Promise((r) => setTimeout(r, 100)); if (!paused) left -= 100; }
    check();
  }
  let clip = null; // {key, done:Promise, t0, est}
  function say(key) {
    check();
    setCaption(LINES[key] || "");
    const words = (LINES[key] || "").split(/\s+/).length;
    const est = Math.max(3, words / 2.4); // fallback seconds if audio can't play
    const c = { key, est, fallback: false, elapsed: 0 };
    c.done = new Promise((resolve) => {
      let fallbackTimer = null;
      const finish = () => { clearInterval(fallbackTimer); audio.onended = audio.onerror = null; resolve(); };
      const useFallback = () => {
        if (c.fallback) return;
        c.fallback = true;
        fallbackTimer = setInterval(() => { if (!paused) c.elapsed += 0.1; if (c.elapsed >= est || ended) finish(); }, 100);
      };
      audio.onended = finish;
      audio.onerror = useFallback;
      audio.src = "/tour/" + key + ".mp3";
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
  function highlight(sel) {
    spotSel = sel;
    const el = sel && (typeof sel === "string" ? q(sel) : sel);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    } else spot.classList.remove("on");
    requestAnimationFrame(track);
  })();
  async function tap(sel) {
    check();
    const el = typeof sel === "string" ? q(sel) : sel;
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    const el = q(sel); if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
    el.value = "";
    for (const ch of String(text)) { check(); el.value += ch; el.dispatchEvent(new Event("input", { bubbles: true })); await wait(45); }
  }

  // ---------- panel ----------
  const panel = document.createElement("div"); panel.id = "tourPanel"; panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "Guided tour");
  panel.innerHTML = `<div class="t-top"><span class="t-step" id="tStep"></span>
    <button class="t-btn" id="tPause" type="button">Pause</button>
    <button class="t-btn" id="tMute" type="button">Mute</button>
    <button class="t-btn" id="tEnd" type="button">End tour</button></div>
    <div class="t-cap" id="tCap" aria-live="polite"></div><div id="tExtra"></div>`;
  function setCaption(t) { q("#tCap").textContent = t; }
  function setStep(n) { stepNo = n; q("#tStep").textContent = `Guided tour · ${n} of ${STEPS}`; }
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

  function endTour(early) {
    ended = true; paused = false;
    try { audio.pause(); } catch (e) { /* ignore */ }
    spotSel = null; block.remove(); stopPolling();
    history.replaceState(null, "", location.pathname + location.hash);
    panel.querySelector(".t-top").innerHTML = `<span class="t-step">${early ? "Tour ended" : "Tour complete"}</span>`;
    setCaption(early ? "You're in the demo shop now. Click around as much as you like; it's all sample data." : "Thanks for taking the tour!");
    extra(`<div class="t-row" style="margin-top:10px"><a class="t-btn primary" href="/demo.html?tour=1" style="text-decoration:none">Replay tour</a>
      <button class="t-btn" type="button" id="tClose">Explore the demo shop</button>
      <a class="t-btn" href="/" style="text-decoration:none">Back to sign in</a></div>`);
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

  // ---------- the tour ----------
  const openSheet = async (ro) => {
    if (q(".sheet")) { await tap(".sheet .x"); await wait(300); }
    await tap(`[data-open="${ro}"]`);
  };
  async function run() {
    document.body.append(block, spot, panel);
    setStep(1);
    q("#resetBtn")?.click(); // start from the same sample cars every time
    await wait(200);
    highlight(".topbar .brand");
    await say("intro");

    setStep(2);
    const board = say("board");
    highlight(".board-wrap");
    await cue(0.42); highlight(".stats");
    await cue(0.7); highlight(".col.is-approval");
    await board;

    setStep(3);
    const ci = say("checkin");
    await tap('.tab[data-view="checkin"]');
    highlight("#checkinForm");
    await cue(0.18);
    await type("#ci-name", "Sam Ortiz"); await type("#ci-phone", "(555) 019-4410");
    await type("#ci-year", "2014"); await type("#ci-make", "Mazda"); await type("#ci-model", "CX-5");
    await type("#ci-plate", "3CXF882");
    await cue(0.5); await type("#ci-concern", "Squealing belt on cold starts");
    await cue(0.72); highlight(q("#ci-consent")?.closest("label"));
    await cue(0.9); highlight('#checkinForm .btn.primary'); await tap('#checkinForm .btn.primary');
    await ci;

    setStep(4);
    const ft = say("firsttext");
    highlight(".sheet .thread");
    await cue(0.55); highlight(".sheet .thread .bubble");
    await cue(0.8); highlight(".sheet .thread");
    await ft;

    setStep(5);
    const est = say("estimate");
    spotSel = null;
    await openSheet("RO-1044");
    highlight(".sheet");
    await cue(0.45); highlight("#addLine");
    await type("#li-item", "Recharge AC refrigerant"); await type("#li-price", "189"); await tap("#addLine button");
    await cue(0.8);
    await type("#li-item", "Replace AC condenser"); await type("#li-price", "624"); await tap("#addLine button");
    highlight(qa(".sheet .sec").find((s) => /Estimate/.test(s.textContent)));
    await est;

    setStep(6);
    const sd = say("send");
    await tap('.sheet .btn.primary[data-stage="approval"]');
    highlight("#sendForm");
    await cue(0.35); highlight("#m-text");
    await cue(0.85); await tap("#sendForm .btn.primary");
    highlight(".sheet .thread");
    await sd;

    setStep(7);
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
      if (!q(".sheet")) await tap('[data-open="RO-1044"]');
      setStep(8);
      const g = say("gotit");
      highlight(".sheet .thread");
      await cue(0.4); highlight(qa(".sheet .sec").find((s) => /Estimate/.test(s.textContent)));
      await cue(0.75); highlight(qa(".sheet .thread .bubble.in").pop());
      await g;
    } else {
      try { audio.pause(); } catch (e) { /* ignore */ }
      const os = say("onscreen");
      await tap("#viewAsCust");
      highlight(qa(".c-card")[0]);
      await cue(0.35);
      const est2 = qa(".c-card").find((c) => /Estimate|approve/i.test(c.textContent));
      if (est2) highlight(est2);
      await cue(0.55); await tap(qa('[data-decide][data-v="approved"]')[0]);
      await cue(0.62); await tap(qa('[data-decide][data-v="declined"]')[1]);
      await cue(0.8); highlight("#sig"); await type("#sig", "Lena Brooks");
      await cue(0.93); await tap("#submitApproval");
      await os;
      setStep(8);
      const bs = say("backshop");
      await tap("#backToShop");
      await wait(300);
      highlight(qa(".sheet .sec").find((s) => /Estimate/.test(s.textContent)));
      await cue(0.45); highlight(".sheet .thread");
      await bs;
    }

    setStep(9);
    const al = say("along");
    highlight(".sheet .stepper");
    for (const [stage, f] of [["in_progress", 0.22], ["qc", 0.32], ["ready", 0.62]]) {
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

    const wr = say("wrap");
    if (q(".sheet")) await tap(".sheet .x");
    highlight(".board-wrap");
    await wr;
    endTour(false);
  }

  function start() {
    fetch("/tour/lines.json").then((r) => r.json()).then((l) => { LINES = l; }).catch(() => {}).finally(() => {
      const gate = document.createElement("div"); gate.id = "tourStart";
      gate.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="tsH">
        <h2 id="tsH">Guided demo</h2>
        <p>A narrated walk-through of a repair shop using Talk Shops, about 3 minutes. Turn your sound on. Halfway through you can get a real text and approve a repair from your own phone.</p>
        <div class="t-row"><button class="btn primary" id="tsGo" type="button">▶ Start the tour</button><button class="btn" id="tsNo" type="button">Explore on my own</button></div></div>`;
      document.body.appendChild(gate);
      q("#tsGo").focus();
      q("#tsNo").onclick = () => { gate.remove(); history.replaceState(null, "", location.pathname); };
      q("#tsGo").onclick = () => {
        gate.remove();
        // Unlock audio on this tap (mobile browsers only allow playback after a user gesture).
        audio.src = "/tour/intro.mp3"; audio.play().then(() => audio.pause()).catch(() => {});
        run().catch((e) => { if (!(e instanceof Stop)) { console.error(e); endTour(true); } });
      };
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
