// Talk Shops how-to assistant: the "How-to" tab where shop staff ask how to do a job (oil change,
// pulling a component, a diagnostic question) for a car in the bay or any vehicle. Answers come from
// POST shop/howto (Gemini, key kept on the server) and are guidance only: confirm specs in service info.
(function () {
  "use strict";
  const MIC = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  const QUICK = ["Oil and Filter Change", "Front Brake Pads and Rotors", "Replace Serpentine Belt", "Replace Battery", "Replace Spark Plugs", "Cabin Air Filter", "What Does Code P0420 Mean?"];

  window.createShopHowTo = function ({ esc, api, toast, cars, locked = () => false }) {
    const st = { carId: "", vehicle: { year: "", make: "", model: "", engine: "" }, turns: [], busy: false };
    const label = (v) => [v.year, v.make, v.model, v.engine].filter(Boolean).join(" ");

    function safetyNote() {
      return `<div class="howto-safety" role="note"><b>Guidance, not factory data.</b> Answers are AI-generated for trained technicians. Always confirm torque specs, fluid types and capacities, and procedures in the manufacturer's service information, and follow your shop's safety practices. Hybrid and EV high-voltage, airbag (SRS) and AC refrigerant work need proper training and certification.</div>`;
    }

    // Starter shops see what the assistant does and how to get it (it's a Pro feature).
    function upsell() {
      return `<section class="howto">
        <div class="howto-head"><h2>Repair How-To</h2><p class="muted">Ask how to do a job and get steps, tools, parts, typical specs and safety notes.</p></div>
        <div class="howto-pro"><b>The How-To Assistant is part of Talk Shops Pro.</b>
          <p>Your techs can ask how to do any job on the car in the bay, by typing or speaking, and get step-by-step guidance in seconds. Pro also includes 3,000 texts a month.</p>
          <button class="btn primary" data-view="plan">See Pro on the Plan tab</button></div>
      </section>`;
    }

    function view() {
      if (locked()) return upsell();
      const list = cars().filter((j) => j.vehicle && (j.vehicle.make || j.vehicle.model));
      const v = st.vehicle;
      return `<section class="howto">
        <div class="howto-head"><h2>Repair How-To</h2><p class="muted">Ask how to do a job and get steps, tools, parts, typical specs and safety notes.</p></div>
        ${safetyNote()}
        <form id="howtoForm" class="howto-form" autocomplete="off">
          <div class="howto-veh">
            ${list.length ? `<label class="field howto-car">Car in the Bay<select id="howtoCar"><option value="">Another Vehicle</option>${list.map((j) => `<option value="${esc(j.id)}" ${st.carId === j.id ? "selected" : ""}>${esc([j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" "))}${j.ro ? " · " + esc(j.ro) : ""}</option>`).join("")}</select></label>` : ""}
            <label class="field">Year<input id="howtoYear" inputmode="numeric" maxlength="4" value="${esc(v.year)}" placeholder="2016"></label>
            <label class="field">Make<input id="howtoMake" maxlength="30" value="${esc(v.make)}" placeholder="Honda"></label>
            <label class="field">Model<input id="howtoModel" maxlength="40" value="${esc(v.model)}" placeholder="Civic"></label>
            <label class="field">Engine<input id="howtoEngine" maxlength="40" value="${esc(v.engine)}" placeholder="Optional, e.g. 2.0L"></label>
          </div>
          <label class="field">What Do You Need to Do?<textarea id="howtoQ" rows="2" maxlength="500" placeholder="e.g. Replace the front wheel bearing, or how do I remove the intake manifold?">${esc(st.prefill || "")}</textarea></label>
          <div id="howtoSuggest" class="howto-suggest" aria-live="polite">${suggestHtml()}</div>
          <div id="howtoVideos" class="howto-videos">${videosHtml()}</div>
          <div class="howto-actions">
            <button type="button" class="btn mic" data-dictate="#howtoQ" aria-pressed="false" aria-label="Voice typing">${MIC}<span class="mic-label">Speak</span></button>
            <button class="btn primary" type="submit" id="howtoAsk" ${st.busy ? "disabled" : ""}>${st.busy ? "Looking it up…" : "Ask"}</button>
            ${st.turns.length ? `<button type="button" class="linkbtn" data-howto-clear>Clear Answers</button>` : ""}
          </div>
          <div class="howto-quick" aria-label="Common jobs">${QUICK.map((q) => `<button type="button" class="howto-chip" data-howto-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        </form>
        <div id="howtoThread" aria-live="polite">${thread()}</div>
      </section>`;
    }

    // Saved answers for this vehicle: shown as you type, picked with no AI call.
    let sugT = 0, sugSeq = 0;
    st.suggestions = [];
    function suggestHtml() {
      if (!st.suggestions.length) return "";
      return `<span class="howto-suggest-h">Saved Answers for This Vehicle</span>${st.suggestions.map((x) => `<button type="button" class="howto-chip saved" data-howto-saved="${esc(x.id)}" data-q="${esc(x.question)}">${esc(x.question)}${x.worked ? ` <span class="howto-ok">✓ ${x.worked}</span>` : ""}</button>`).join("")}`;
    }
    function loadSuggestions() {
      clearTimeout(sugT);
      sugT = setTimeout(async () => {
        readVehicle();
        const seq = ++sugSeq;
        if (!st.vehicle.make || !st.vehicle.model) { st.suggestions = []; } else {
          try { st.suggestions = (await api("POST", "shop/howto/suggest", { vehicle: st.vehicle, q: document.getElementById("howtoQ")?.value || "" })).suggestions || []; }
          catch { st.suggestions = []; }
        }
        if (seq !== sugSeq) return;
        const el = document.getElementById("howtoSuggest"); if (el) el.innerHTML = suggestHtml();
      }, 350);
    }

    function feedback(r, i) {
      if (!r.libraryId) return "";
      const s = r.saved;
      const tips = (r.tips || []).map((x) => `<li>${esc(x.text)}</li>`).join("");
      return `<div class="howto-learn">
        ${s ? `<p class="howto-saved-note"><b>Saved Answer</b> · used ${s.uses} time${s.uses === 1 ? "" : "s"}${s.worked ? ` · ${s.worked} shop${s.worked === 1 ? "" : "s"} said it worked` : ""}${s.askedFor && s.askedFor !== r.vehicle ? ` · first asked for a ${esc(s.askedFor)}` : ""} <button type="button" class="linkbtn" data-howto-fresh="${i}">Ask for a Fresh Answer</button></p>` : ""}
        <div class="howto-rate"><span>Did This Work?</span>
          <button type="button" class="btn sm" data-howto-rate="${i}" data-worked="1" aria-pressed="${r.myRating === true}">This Worked</button>
          <button type="button" class="btn sm" data-howto-rate="${i}" data-worked="0" aria-pressed="${r.myRating === false}">Not Right</button>
          ${r.retired ? `<small>Thanks. The next person who asks gets a fresh answer.</small>` : ""}</div>
        <div class="howto-tips"><h4>Tips From Techs</h4>${tips ? `<ul>${tips}</ul>` : ""}
          <div class="howto-tip-add"><input id="howtoTip-${i}" maxlength="300" placeholder="Tip for the next tech, e.g. drop the skid plate first" aria-describedby="howtoTipNote"><button type="button" class="btn sm" data-howto-tip="${i}">Save Tip</button></div><small id="howtoTipNote" class="howto-fine">Tips are shared with techs at other shops without your shop name. Leave out customer details.</small></div>
      </div>`;
    }

    const items = (title, arr, cls = "") => arr && arr.length ? `<div class="howto-block ${cls}"><h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";

    // Part numbers come from the AI: always shown with "verify by VIN" and a lookup link.
    const search = (q) => "https://www.google.com/search?q=" + encodeURIComponent(q);
    function partNumbers(t) {
      const list = t.res.partNumbers || [];
      if (!list.length) return "";
      const line = (kind, brand, number) => {
        const num = [brand, number].filter(Boolean).join(" ");
        return `<span class="pn-kind">${kind}</span><b class="pn-num">${esc(num)}</b><a href="${esc(search(`${num} ${t.vehicle}`.trim()))}" target="_blank" rel="noopener">Look Up</a>`;
      };
      return `<div class="howto-block pn"><h4>Part Numbers <span class="muted">· verify by VIN with your parts supplier</span></h4><ul class="howto-pn">${list.map((p) => `<li><span class="pn-part">${esc(p.part)}</span>
        ${p.number ? line("OEM", p.brand, p.number) : p.altNumber ? "" : `<span class="pn-kind">OEM</span><span class="muted">Varies; check by VIN</span><a href="${esc(search(`${t.vehicle} ${p.part} OEM part number`.trim()))}" target="_blank" rel="noopener">Find It</a>`}
        ${p.altNumber ? line("Aftermarket", p.altBrand, p.altNumber) : ""}
        ${p.note ? `<small>${esc(p.note)}</small>` : ""}</li>`).join("")}</ul></div>`;
    }

    // CarCareKiosk (link only; their terms don't allow reusing their content). Its page for a car is
    // /videos/<Make>/<Model>/<Year>, e.g. /videos/Ford/F-150/2017; without a full vehicle, a site search.
    const UPPER = new Set(["bmw", "gmc", "rav4", "mdx", "rdx", "tlx", "ilx", "tsx", "srx", "cts", "ats", "xt5", "es", "is", "gs", "rx", "nx", "gx", "lx", "fj", "gti", "suv"]);
    const cap = (w) => w.split(/(\s+|-)/).map((p) => UPPER.has(p.toLowerCase()) ? p.toUpperCase() : p.length > 3 || /^[a-z]+$/i.test(p) && p.length > 2 ? p.charAt(0).toUpperCase() + p.slice(1) : p.toUpperCase()).join("");
    const ytLink = (vl, q) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${vl} ${q}`.trim());
    // Video links cost no AI: shown as soon as there's a car and a job, before anyone presses Ask.
    function videosHtml() {
      const q = (document.getElementById("howtoQ")?.value || "").trim(), v = st.vehicle, vl = label({ ...v, engine: "" });
      if (!v.make || !v.model) return "";
      // As soon as a car is set: videos for the car; once a job is typed, YouTube narrows to that job.
      const job = q.length >= 3 ? q : "";
      const t = { v, vehicle: vl, q: job };
      return `<span>Watch It Done${job ? "" : ` <small>(type a job to narrow YouTube)</small>`}:</span><a href="${esc(ytLink(vl, job || "repair"))}" target="_blank" rel="noopener">YouTube Videos</a><a href="${esc(videoLink(t))}" target="_blank" rel="noopener">CarCareKiosk Videos</a>`;
    }
    // Same links for a car's detail sheet, next to "Open Repair Guide" (vehicle + concern).
    window.TalkShopsVideoLinks = (veh, job) => {
      const v = { year: String(veh?.year || ""), make: veh?.make || "", model: veh?.model || "" };
      if (!v.make || !v.model) return "";
      const vl = label(v), q = String(job || "").replace(/\s+/g, " ").trim().slice(0, 70);
      return `<a class="linkbtn" href="${esc(ytLink(vl, q || "repair"))}" target="_blank" rel="noopener">YouTube Videos</a><a class="linkbtn" href="${esc(videoLink({ v, vehicle: vl, q }))}" target="_blank" rel="noopener">CarCareKiosk Videos</a>`;
    };
    function paintVideos() { const el = document.getElementById("howtoVideos"); if (el) el.innerHTML = videosHtml(); }
    function videoLink(t) {
      const v = t.v || {};
      if (v.make && v.model && /^\d{4}$/.test(v.year || "")) {
        const seg = (x) => encodeURIComponent(cap(String(x).trim()).replace(/\s+/g, "_"));
        return `https://www.carcarekiosk.com/videos/${seg(v.make)}/${seg(v.model)}/${v.year}`;
      }
      return search(`site:carcarekiosk.com ${t.vehicle} ${t.q}`.trim());
    }

    function turn(t, i) {
      const head = `<div class="howto-q"><b>${esc(t.q)}</b>${t.vehicle ? `<span class="pill">${esc(t.vehicle)}</span>` : ""}</div>`;
      if (t.loading) return `<article class="howto-card is-loading">${head}<p class="muted">Looking it up. Longer jobs can take up to half a minute…</p></article>`;
      if (t.error) return `<article class="howto-card">${head}<p class="form-err">${esc(t.error)}</p><button type="button" class="btn sm" data-howto-retry="${i}">Try again</button></article>`;
      const r = t.res;
      return `<article class="howto-card">${head}
        <p class="howto-answer">${esc(r.answer)}</p>
        <div class="howto-videos"><span>Watch It Done:</span><a href="${esc(ytLink(label({ ...(t.v || {}), engine: "" }) || t.vehicle, t.q))}" target="_blank" rel="noopener">YouTube Videos</a><a href="${esc(videoLink(t))}" target="_blank" rel="noopener">CarCareKiosk Videos</a></div>
        ${items("Safety", r.safety, "warn")}
        ${r.specs.length ? `<div class="howto-block specs"><h4>Typical Specs <span class="muted">· verify in service info</span></h4><ul>${r.specs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        <div class="howto-cols">${items("Tools", r.tools)}${items("Parts and Fluids", r.parts)}</div>
        ${partNumbers(t)}
        ${r.steps.length ? `<div class="howto-block"><h4>Steps</h4><ol class="howto-steps">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
        <div class="howto-foot">
          ${r.ideas.length ? `<div class="howto-quick">${r.ideas.map((q) => `<button type="button" class="howto-chip" data-howto-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
          <span class="howto-links"><button type="button" class="linkbtn" data-howto-copy="${i}">Copy</button></span>
        </div>
        ${feedback(r, i)}
        <p class="howto-fine">AI guidance. Confirm specs and procedures in the manufacturer's service information.</p>
      </article>`;
    }

    // Newest first, so the latest answer sits right under the question box on a phone.
    function thread() { return st.turns.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => turn(t, i)).join(""); }
    function paint() {
      const el = document.getElementById("howtoThread"); if (el) el.innerHTML = thread();
      const b = document.getElementById("howtoAsk"); if (b) { b.disabled = st.busy; b.textContent = st.busy ? "Looking it up…" : "Ask"; }
    }

    function readVehicle() {
      const val = (id) => (document.getElementById(id)?.value || "").trim();
      if (!document.getElementById("howtoMake")) return;
      st.vehicle = { year: val("howtoYear"), make: val("howtoMake"), model: val("howtoModel"), engine: val("howtoEngine") };
    }

    async function ask(q, render, opts = {}) {
      st.prefill = "";
      if (locked()) { render(); return; }
      q = String(q || "").trim();
      if (q.length < 3) { toast("Type what you need to do"); document.getElementById("howtoQ")?.focus(); return; }
      if (st.busy) return;
      readVehicle();
      const vehicle = { ...st.vehicle }, vl = label(vehicle);
      // Earlier answers about the same vehicle give follow-ups their context.
      const history = st.turns.filter((t) => t.res && t.vehicle === vl).slice(-3).map((t) => ({ q: t.q, a: [t.res.answer, ...t.res.steps].join(" ").slice(0, 900) }));
      const t = { q, vehicle: vl, v: vehicle, loading: true };
      st.turns.push(t); st.busy = true;
      const qi = document.getElementById("howtoQ"); if (qi) qi.value = ""; paintVideos();
      if (!document.getElementById("howtoThread")) render(); else paint();
      document.getElementById("howtoThread")?.scrollIntoView({ behavior: "smooth", block: "start" });
      try { t.res = await api("POST", "shop/howto", { question: q, vehicle, history: opts.answerId || opts.fresh ? [] : history, ...opts }); }
      catch (err) { t.error = err.message || "The assistant is unavailable right now."; t.vehicleObj = vehicle; }
      t.loading = false; st.busy = false;
      if (!document.getElementById("howtoThread")) return; // left the tab; the answer shows when they come back
      paint();
      const clear = document.querySelector("[data-howto-clear]");
      if (!clear) { const a = document.querySelector(".howto-actions"); if (a) a.insertAdjacentHTML("beforeend", `<button type="button" class="linkbtn" data-howto-clear>Clear Answers</button>`); }
    }

    function copyText(t) {
      const r = t.res, sec = (h, a) => a.length ? `\n${h}:\n` + a.map((x) => "- " + x).join("\n") : "";
      return `${t.q}${t.vehicle ? " (" + t.vehicle + ")" : ""}\n\n${r.answer}` + sec("Safety", r.safety) + sec("Typical specs (verify in service info)", r.specs)
        + sec("Tools", r.tools) + sec("Parts and fluids", r.parts)
        + sec("Part numbers (AI suggestions, verify by VIN)", (r.partNumbers || []).map((p) => `${p.part}: OEM ${[p.brand, p.number].filter(Boolean).join(" ") || "check by VIN"}${p.altNumber ? ", aftermarket " + [p.altBrand, p.altNumber].filter(Boolean).join(" ") : ""}${p.note ? " (" + p.note + ")" : ""}`)) + (r.steps.length ? "\nSteps:\n" + r.steps.map((x, i) => `${i + 1}. ${x}`).join("\n") : "")
        + "\n\nAI guidance from Talk Shops. Confirm specs and procedures in the manufacturer's service information.";
    }

    /** Clicks inside the tab. Returns true when handled. */
    function click(t, render) {
      if (t.dataset.howtoAsk) {
        ask(t.dataset.howtoAsk, render); return true;
      }
      if (t.dataset.howtoSaved) { ask(t.dataset.q, render, { answerId: t.dataset.howtoSaved }); return true; }
      if (t.dataset.howtoFresh !== undefined) { const o = st.turns[+t.dataset.howtoFresh]; if (o) ask(o.q, render, { fresh: true }); return true; }
      if (t.dataset.howtoRate !== undefined) {
        const o = st.turns[+t.dataset.howtoRate]; if (!o?.res?.libraryId) return true;
        const worked = t.dataset.worked === "1";
        api("POST", "shop/howto/rate", { id: o.res.libraryId, worked }).then((r) => {
          o.res.myRating = worked; o.res.retired = r.retired;
          if (o.res.saved) Object.assign(o.res.saved, { worked: r.worked, notRight: r.notRight });
          paint(); toast(worked ? "Thanks, marked as worked" : "Thanks, we'll get a better answer next time");
        }, (err) => toast(err.message));
        return true;
      }
      if (t.dataset.howtoTip !== undefined) {
        const o = st.turns[+t.dataset.howtoTip], input = document.getElementById("howtoTip-" + t.dataset.howtoTip);
        const text = (input?.value || "").trim();
        if (!o?.res?.libraryId || text.length < 3) { toast("Type a tip first"); input?.focus(); return true; }
        api("POST", "shop/howto/tip", { id: o.res.libraryId, text }).then((r) => { o.res.tips = r.tips; paint(); toast("Tip saved"); }, (err) => toast(err.message));
        return true;
      }
      if (t.dataset.howtoRetry !== undefined) {
        const old = st.turns[+t.dataset.howtoRetry]; if (!old || st.busy) return true;
        st.turns.splice(+t.dataset.howtoRetry, 1);
        if (old.vehicleObj) st.vehicle = old.vehicleObj;
        render(); ask(old.q, render); return true;
      }
      if (t.hasAttribute("data-howto-clear")) { if (st.busy) return true; st.turns = []; render(); return true; }
      if (t.dataset.howtoCopy !== undefined) {
        const turnData = st.turns[+t.dataset.howtoCopy];
        if (turnData?.res) navigator.clipboard?.writeText(copyText(turnData)).then(() => toast("Copied"), () => toast("Couldn't copy on this device"));
        return true;
      }
      return false;
    }

    function submit(f, render) {
      if (f.id !== "howtoForm") return false;
      ask(document.getElementById("howtoQ")?.value, render); return true;
    }

    // The "Car in the bay" picker fills in the vehicle fields; typed details survive re-renders.
    document.addEventListener("change", (e) => {
      const el = e.target;
      if (el.id !== "howtoCar") return;
      st.carId = el.value;
      const j = cars().find((x) => x.id === el.value);
      const v = j ? { year: j.vehicle.year || "", make: j.vehicle.make || "", model: j.vehicle.model || "", engine: j.vehicle.engine || "" } : { year: "", make: "", model: "", engine: "" };
      st.vehicle = v;
      for (const [id, k] of [["howtoYear", "year"], ["howtoMake", "make"], ["howtoModel", "model"], ["howtoEngine", "engine"]]) { const i = document.getElementById(id); if (i) i.value = v[k]; }
      document.getElementById("howtoQ")?.focus();
      loadSuggestions(); paintVideos();
    });
    document.addEventListener("input", (e) => {
      if (/^howto(Year|Make|Model|Engine)$/.test(e.target.id || "")) { readVehicle(); loadSuggestions(); paintVideos(); }
      if (e.target.id === "howtoQ") { loadSuggestions(); paintVideos(); }
    });

    /** Opens the tab for one car (from its detail sheet). */
    function openFor(j, question = "") {
      st.carId = j.id;
      st.prefill = String(question).slice(0, 500);
      st.vehicle = { year: j.vehicle?.year || "", make: j.vehicle?.make || "", model: j.vehicle?.model || "", engine: j.vehicle?.engine || "" };
      st.suggestions = []; loadSuggestions();
    }

    return { view, click, submit, openFor };
  };
})();
