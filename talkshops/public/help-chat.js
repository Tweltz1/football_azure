// "Ask Talk Shops": a help chat for shop staff about using Talk Shops.
// Answers come from the Help page (help-content.js), picked by a small trained model that runs on the device
// (help-chat-model.json from ml/help-chat/train.mjs, run by help-chat-model-run.js). No AI service, no cost per
// question. Questions it can't answer well are saved with names and numbers removed (unless the shop turned off
// "Help improve Talk Shops"), so we can add Help answers for them.
// Car repair questions are pointed to How-to; anything else gets a few close answers and the Contact Support form.
// Pages call TalkShopsHelpChat.configure({...}) and .show(true|false).
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cfg = {
    isOwner: () => true,        // technicians get a note when an answer is an owner's job
    signedIn: () => false,
    openHowTo: null,            // (question) => void, when How-to can open with the question filled in
    contact: (q) => { location.href = "/?help#help-support"; try { sessionStorage.setItem("ts-help-msg", q); } catch {} },
    lessonUrl: (id) => "/demo.html?train=" + encodeURIComponent(id),
    report: null,               // ({text, kind, guess, picked}) => void: questions it couldn't answer well, when the shop allows it
  };
  const tell = (row) => { try { cfg.report?.(row); } catch {} };
  const st = { open: false, visible: false, model: null, loading: null, failed: false, turns: [] };
  const STARTERS = ["How do I check in a car?", "How do I build an estimate?", "How do I add my team?", "How do customers get updates?"];

  // ---------- Help answers ----------
  function qa() {
    const out = new Map();
    for (const s of (window.TALKSHOPS_HELP?.sections || [])) for (const [q, a] of s.qs) out.set(q, { q, a, lesson: s.lesson, topic: s.title });
    return out;
  }
  // Answers that name an owner-only place: technicians can't do these themselves.
  const ownerJob = (a) => /\b(Owners? (open|can|choose|turn|upload|set|paste)|Pro, for owners|Settings →|open Plan|Manage Billing|Settings to change)/.test(a);

  // ---------- model ----------
  function load() {
    if (st.model || st.loading) return st.loading;
    st.loading = fetch("/help-chat-model.json?v=2").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((m) => { st.model = m; }, () => { st.failed = true; }).finally(() => { st.loading = null; paint(); });
    return st.loading;
  }
  // If the model can't load, fall back to plain word matching over the Help questions and answers.
  function wordMatch(text) {
    const F = window.HelpChatFeatures;
    const want = new Set(F ? F.words(text) : String(text).toLowerCase().split(/\W+/));
    const scored = [...qa().values()].map((x) => {
      const ws = F ? F.words(x.q + " " + x.a) : (x.q + " " + x.a).toLowerCase().split(/\W+/);
      const qs = new Set(F ? F.words(x.q) : x.q.toLowerCase().split(/\W+/));
      let s = 0; for (const w of want) { if (qs.has(w)) s += 2; else if (ws.includes(w)) s += 1; }
      return { label: x.q, s };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    return { kind: scored.length ? "choose" : "other", choices: scored.slice(0, 3).map((x) => x.label) };
  }
  function think(text) {
    const known = qa();
    if (!st.model || !window.HelpChatModel) return wordMatch(text);
    const c = window.HelpChatModel.classify(st.model, text);
    c.ranked = c.ranked.filter((r) => known.has(r.label)); // a Help question renamed since training is skipped
    if (!c.ranked.length) return wordMatch(text);
    const d = window.HelpChatModel.decide(c);
    d.choices = (d.choices || []).filter((q) => known.has(q));
    return d;
  }

  // ---------- conversation ----------
  function ask(text) {
    text = String(text || "").trim().slice(0, 300);
    if (!text) return;
    st.turns.push({ who: "me", text });
    if (!st.model && !st.failed) { st.turns.push({ who: "bot", wait: text }); paint(); load().then(() => { const i = st.turns.findIndex((t) => t.wait === text); if (i >= 0) st.turns[i] = reply(text); paint(); }); return; }
    st.turns.push(reply(text));
    paint();
  }
  function reply(text) {
    const d = think(text);
    if (d.kind === "choose" || d.kind === "other") tell({ text, kind: d.kind === "choose" ? "unsure" : "other", guess: d.choices?.[0] || "" });
    if (d.kind === "answer") return { who: "bot", answer: d.label, more: d.choices || [], q: text, alsoRepair: d.alsoRepair };
    return { who: "bot", kind: d.kind, choices: d.choices || [], q: text, alsoRepair: d.alsoRepair };
  }
  function answerHtml(label, turn) {
    const x = qa().get(label);
    if (!x) return "";
    const owner = !cfg.isOwner() && ownerJob(x.a);
    return `<div class="hc-ans"><b>${esc(x.q)}</b><p>${esc(x.a)}</p>
      ${owner ? `<p class="hc-note">This is done by a shop owner. Technicians can't change it, so ask your owner.</p>` : ""}
      <div class="hc-links">${x.lesson ? `<a href="${esc(cfg.lessonUrl(x.lesson))}">Watch the lesson →</a>` : ""}
      ${turn ? `<button type="button" class="linkbtn" data-hc-not="${turn}">Not what you asked?</button>` : ""}</div></div>`;
  }
  const choiceBtns = (list, from = "") => list.map((q) => `<button type="button" class="hc-chip" data-hc-pick="${esc(q)}" data-hc-from="${from}">${esc(q)}</button>`).join("");
  const howToBtn = (q) => cfg.openHowTo && cfg.signedIn() ? `<button type="button" class="btn sm" data-hc-howto="${esc(q)}">Ask How-to</button>` : "";
  const contactBtn = (q) => `<button type="button" class="linkbtn" data-hc-contact="${esc(q)}">Ask the Talk Shops team</button>`;
  function turnHtml(t, i) {
    if (t.who === "me") return `<div class="hc-me">${esc(t.text)}</div>`;
    if (t.wait) return `<div class="hc-bot hc-wait">Thinking…</div>`;
    if (t.picked) return `<div class="hc-bot">${answerHtml(t.picked, i)}</div>`;
    if (t.answer) {
      return `<div class="hc-bot">${answerHtml(t.answer, t.notShown ? 0 : i)}
        ${t.notShown ? `<div class="hc-more"><span>Maybe one of these:</span>${choiceBtns(t.more, i)}${contactBtn(t.q)}</div>` : ""}
        ${t.alsoRepair && !t.notShown ? `<p class="hc-small">Asking how to fix a car? ${howToBtn(t.q) || "How-to answers repair questions."}</p>` : ""}</div>`;
    }
    if (t.kind === "repair") {
      return `<div class="hc-bot"><p>That sounds like a car repair question. ${cfg.signedIn() ? "The How-to tab answers those, with steps, tools and specs." : "Shops on Talk Shops Pro can ask those in the How-to tab."}</p>
        <div class="hc-row">${howToBtn(t.q)}</div>
        ${t.choices.length ? `<div class="hc-more"><span>Or were you asking about Talk Shops?</span>${choiceBtns(t.choices.slice(0, 2), i)}</div>` : ""}</div>`;
    }
    if (t.kind === "other") {
      return `<div class="hc-bot"><p>I can only help with using Talk Shops, like checking in cars, estimates, customer texts, your team or your plan.</p>
        ${t.choices.length ? `<div class="hc-more"><span>Were you asking about one of these?</span>${choiceBtns(t.choices.slice(0, 2), i)}</div>` : ""}
        <div class="hc-row">${contactBtn(t.q)}</div></div>`;
    }
    return `<div class="hc-bot"><p>${t.choices.length ? "I'm not sure which you mean. Is it one of these?" : "I don't have an answer for that yet."}</p>
      <div class="hc-more">${choiceBtns(t.choices, i)}${contactBtn(t.q)}</div>
      ${t.alsoRepair ? `<p class="hc-small">Asking how to fix a car? ${howToBtn(t.q) || "How-to answers repair questions."}</p>` : ""}</div>`;
  }

  // ---------- page ----------
  let root;
  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.id = "helpChat";
    document.body.appendChild(root);
  }
  function paint() {
    ensure();
    root.hidden = !st.visible;
    if (!st.visible) return;
    const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M9.6 9.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 1.9-2.2 3.3M12 16.6h.01"/></svg>`;
    if (!st.open) { root.innerHTML = `<button type="button" id="askFab" class="hc-fab" aria-label="Ask a question about Talk Shops">${icon}<span>Ask</span></button>`; return; }
    const scroll = root.querySelector(".hc-log")?.scrollTop;
    root.innerHTML = `<section class="hc-panel" role="dialog" aria-label="Ask Talk Shops">
      <header class="hc-head">${icon}<div><b>Ask Talk Shops</b><small>Answers from our Help pages</small></div><button type="button" class="hc-x" data-hc-close aria-label="Close">×</button></header>
      <div class="hc-log" aria-live="polite">
        <div class="hc-bot"><p>Hi! Ask me how to do something in Talk Shops, like “how do I send an estimate?”</p>${st.turns.length ? "" : `<div class="hc-more">${choiceBtns(STARTERS)}</div>`}</div>
        ${st.turns.map(turnHtml).join("")}
      </div>
      <form class="hc-form" id="hcForm"><input id="hcQ" type="text" maxlength="300" autocomplete="off" placeholder="Type your question" aria-label="Your question"><button class="btn primary" type="submit">Ask</button></form>
      <p class="hc-foot">Car repair questions go in How-to. Still stuck? ${contactBtn("")}</p>
    </section>`;
    const log = root.querySelector(".hc-log");
    if (log) log.scrollTop = scroll != null && !st.jump ? scroll : log.scrollHeight;
    st.jump = false;
  }
  function open(q) {
    st.open = true; st.visible = true; st.jump = true; load(); paint();
    if (q) ask(q); else setTimeout(() => document.getElementById("hcQ")?.focus(), 30);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-hc-pick],[data-hc-not],[data-hc-howto],[data-hc-contact],[data-hc-close],#askFab,[data-hc-open]");
    if (!t) return;
    e.preventDefault();
    if (t.id === "askFab" || t.dataset.hcOpen !== undefined) { open(t.dataset.hcOpen || ""); return; }
    if (t.dataset.hcClose !== undefined) { st.open = false; paint(); return; }
    if (t.dataset.hcPick) { const from = st.turns[+t.dataset.hcFrom]; if (from?.q && t.dataset.hcFrom !== "") tell({ text: from.q, kind: "picked", guess: from.answer || from.choices?.[0] || "", picked: t.dataset.hcPick }); st.turns.push({ who: "me", text: t.dataset.hcPick }, { who: "bot", picked: t.dataset.hcPick }); st.jump = true; paint(); return; }
    if (t.dataset.hcNot) { const turn = st.turns[+t.dataset.hcNot]; if (turn) { turn.notShown = true; if (turn.q) tell({ text: turn.q, kind: "notit", guess: turn.answer || "" }); } paint(); return; }
    if (t.dataset.hcHowto !== undefined) { st.open = false; paint(); cfg.openHowTo?.(t.dataset.hcHowto); return; }
    if (t.dataset.hcContact !== undefined) { st.open = false; paint(); cfg.contact(t.dataset.hcContact); }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "helpAskForm") { e.preventDefault(); const box = document.getElementById("helpAskQ"); const q = box?.value?.trim(); if (box) box.value = ""; open(q); return; }
    if (e.target.id !== "hcForm") return;
    e.preventDefault();
    const box = document.getElementById("hcQ");
    const q = box?.value; if (box) box.value = "";
    st.jump = true; ask(q);
    setTimeout(() => document.getElementById("hcQ")?.focus(), 30);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) { st.open = false; paint(); } });

  window.TalkShopsHelpChat = {
    configure(o) { Object.assign(cfg, o); },
    show(on) { on = !!on; if (on === st.visible) return; st.visible = on; if (!on) st.open = false; paint(); },
    open,
    /** Fills the Contact Support message box after the chat sent someone there. */
    fillContact() {
      let msg = ""; try { msg = sessionStorage.getItem("ts-help-msg") || ""; sessionStorage.removeItem("ts-help-msg"); } catch {}
      const box = document.querySelector('#helpForm textarea[name="message"]');
      if (box && msg && !box.value) box.value = msg;
      if (box && (msg || location.hash === "#help-support")) document.getElementById("help-support")?.scrollIntoView({ block: "start" });
    },
    _ask: ask, _turns: st.turns,
  };
})();
