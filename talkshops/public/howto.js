// Talk Shops how-to assistant: the "How-to" tab where shop staff ask how to do a job (oil change,
// pulling a component, a diagnostic question) for a car in the bay or any vehicle. Answers come from
// POST shop/howto (Gemini, key kept on the server) and are guidance only: confirm specs in service info.
(function () {
  "use strict";
  const MIC = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
  const QUICK = ["Oil and filter change", "Front brake pads and rotors", "Replace serpentine belt", "Replace battery", "Replace spark plugs", "Cabin air filter", "What does code P0420 mean?"];

  window.createShopHowTo = function ({ esc, api, toast, cars, locked = () => false }) {
    const st = { carId: "", vehicle: { year: "", make: "", model: "", engine: "" }, turns: [], busy: false };
    const label = (v) => [v.year, v.make, v.model, v.engine].filter(Boolean).join(" ");

    function safetyNote() {
      return `<div class="howto-safety" role="note"><b>Guidance, not factory data.</b> Answers are AI-generated for trained technicians. Always confirm torque specs, fluid types and capacities, and procedures in the manufacturer's service information, and follow your shop's safety practices. Hybrid and EV high-voltage, airbag (SRS) and AC refrigerant work need proper training and certification.</div>`;
    }

    // Starter shops see what the assistant does and how to get it (it's a Pro feature).
    function upsell() {
      return `<section class="howto">
        <div class="howto-head"><h2>Repair how-to</h2><p class="muted">Ask how to do a job and get steps, tools, parts, typical specs and safety notes.</p></div>
        <div class="howto-pro"><b>The How-to assistant is part of Talk Shops Pro.</b>
          <p>Your techs can ask how to do any job on the car in the bay, by typing or speaking, and get step-by-step guidance in seconds. Pro also includes 3,000 texts a month.</p>
          <button class="btn primary" data-view="plan">See Pro on the Plan tab</button></div>
      </section>`;
    }

    function view() {
      if (locked()) return upsell();
      const list = cars().filter((j) => j.vehicle && (j.vehicle.make || j.vehicle.model));
      const v = st.vehicle;
      return `<section class="howto">
        <div class="howto-head"><h2>Repair how-to</h2><p class="muted">Ask how to do a job and get steps, tools, parts, typical specs and safety notes.</p></div>
        ${safetyNote()}
        <form id="howtoForm" class="howto-form" autocomplete="off">
          <div class="howto-veh">
            ${list.length ? `<label class="field howto-car">Car in the bay<select id="howtoCar"><option value="">Another vehicle</option>${list.map((j) => `<option value="${esc(j.id)}" ${st.carId === j.id ? "selected" : ""}>${esc([j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" "))}${j.ro ? " · " + esc(j.ro) : ""}</option>`).join("")}</select></label>` : ""}
            <label class="field">Year<input id="howtoYear" inputmode="numeric" maxlength="4" value="${esc(v.year)}" placeholder="2016"></label>
            <label class="field">Make<input id="howtoMake" maxlength="30" value="${esc(v.make)}" placeholder="Honda"></label>
            <label class="field">Model<input id="howtoModel" maxlength="40" value="${esc(v.model)}" placeholder="Civic"></label>
            <label class="field">Engine<input id="howtoEngine" maxlength="40" value="${esc(v.engine)}" placeholder="Optional, e.g. 2.0L"></label>
          </div>
          <label class="field">What do you need to do?<textarea id="howtoQ" rows="2" maxlength="500" placeholder="e.g. Replace the front wheel bearing, or how do I remove the intake manifold?"></textarea></label>
          <div class="howto-actions">
            <button type="button" class="btn mic" data-dictate="#howtoQ" aria-pressed="false" aria-label="Voice typing">${MIC}<span class="mic-label">Speak</span></button>
            <button class="btn primary" type="submit" id="howtoAsk" ${st.busy ? "disabled" : ""}>${st.busy ? "Looking it up…" : "Ask"}</button>
            ${st.turns.length ? `<button type="button" class="linkbtn" data-howto-clear>Clear answers</button>` : ""}
          </div>
          <div class="howto-quick" aria-label="Common jobs">${QUICK.map((q) => `<button type="button" class="howto-chip" data-howto-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        </form>
        <div id="howtoThread" aria-live="polite">${thread()}</div>
      </section>`;
    }

    const items = (title, arr, cls = "") => arr && arr.length ? `<div class="howto-block ${cls}"><h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";

    // Part numbers come from the AI: always shown with "verify by VIN" and a lookup link.
    const search = (q) => "https://www.google.com/search?q=" + encodeURIComponent(q);
    function partNumbers(t) {
      const list = t.res.partNumbers || [];
      if (!list.length) return "";
      return `<div class="howto-block pn"><h4>Part numbers <span class="muted">· verify by VIN with your parts supplier</span></h4><ul class="howto-pn">${list.map((p) => {
        const num = [p.brand, p.number].filter(Boolean).join(" ");
        const q = p.number ? `${num} ${t.vehicle}` : `${t.vehicle} ${p.part} part number`;
        return `<li><span class="pn-part">${esc(p.part)}</span>${p.number ? `<b class="pn-num">${esc(num)}</b>` : `<span class="muted">Number varies; check by VIN</span>`}<a href="${esc(search(q.trim()))}" target="_blank" rel="noopener">${p.number ? "Look up" : "Find it"}</a>${p.note ? `<small>${esc(p.note)}</small>` : ""}</li>`;
      }).join("")}</ul></div>`;
    }

    function turn(t, i) {
      const head = `<div class="howto-q"><b>${esc(t.q)}</b>${t.vehicle ? `<span class="pill">${esc(t.vehicle)}</span>` : ""}</div>`;
      if (t.loading) return `<article class="howto-card is-loading">${head}<p class="muted">Looking it up. Longer jobs can take up to half a minute…</p></article>`;
      if (t.error) return `<article class="howto-card">${head}<p class="form-err">${esc(t.error)}</p><button type="button" class="btn sm" data-howto-retry="${i}">Try again</button></article>`;
      const r = t.res;
      return `<article class="howto-card">${head}
        <p class="howto-answer">${esc(r.answer)}</p>
        ${items("Safety", r.safety, "warn")}
        ${r.specs.length ? `<div class="howto-block specs"><h4>Typical specs <span class="muted">· verify in service info</span></h4><ul>${r.specs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        <div class="howto-cols">${items("Tools", r.tools)}${items("Parts and fluids", r.parts)}</div>
        ${partNumbers(t)}
        ${r.steps.length ? `<div class="howto-block"><h4>Steps</h4><ol class="howto-steps">${r.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
        <div class="howto-foot">
          ${r.ideas.length ? `<div class="howto-quick">${r.ideas.map((q) => `<button type="button" class="howto-chip" data-howto-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
          <button type="button" class="linkbtn" data-howto-copy="${i}">Copy</button>
        </div>
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

    async function ask(q, render) {
      if (locked()) { render(); return; }
      q = String(q || "").trim();
      if (q.length < 3) { toast("Type what you need to do"); document.getElementById("howtoQ")?.focus(); return; }
      if (st.busy) return;
      readVehicle();
      const vehicle = { ...st.vehicle }, vl = label(vehicle);
      // Earlier answers about the same vehicle give follow-ups their context.
      const history = st.turns.filter((t) => t.res && t.vehicle === vl).slice(-3).map((t) => ({ q: t.q, a: [t.res.answer, ...t.res.steps].join(" ").slice(0, 900) }));
      const t = { q, vehicle: vl, loading: true };
      st.turns.push(t); st.busy = true;
      const qi = document.getElementById("howtoQ"); if (qi) qi.value = "";
      if (!document.getElementById("howtoThread")) render(); else paint();
      document.getElementById("howtoThread")?.scrollIntoView({ behavior: "smooth", block: "start" });
      try { t.res = await api("POST", "shop/howto", { question: q, vehicle, history }); }
      catch (err) { t.error = err.message || "The assistant is unavailable right now."; t.vehicleObj = vehicle; }
      t.loading = false; st.busy = false;
      if (!document.getElementById("howtoThread")) return; // left the tab; the answer shows when they come back
      paint();
      const clear = document.querySelector("[data-howto-clear]");
      if (!clear) { const a = document.querySelector(".howto-actions"); if (a) a.insertAdjacentHTML("beforeend", `<button type="button" class="linkbtn" data-howto-clear>Clear answers</button>`); }
    }

    function copyText(t) {
      const r = t.res, sec = (h, a) => a.length ? `\n${h}:\n` + a.map((x) => "- " + x).join("\n") : "";
      return `${t.q}${t.vehicle ? " (" + t.vehicle + ")" : ""}\n\n${r.answer}` + sec("Safety", r.safety) + sec("Typical specs (verify in service info)", r.specs)
        + sec("Tools", r.tools) + sec("Parts and fluids", r.parts)
        + sec("Part numbers (AI suggestions, verify by VIN)", (r.partNumbers || []).map((p) => `${p.part}: ${[p.brand, p.number].filter(Boolean).join(" ") || "check by VIN"}${p.note ? " (" + p.note + ")" : ""}`)) + (r.steps.length ? "\nSteps:\n" + r.steps.map((x, i) => `${i + 1}. ${x}`).join("\n") : "")
        + "\n\nAI guidance from Talk Shops. Confirm specs and procedures in the manufacturer's service information.";
    }

    /** Clicks inside the tab. Returns true when handled. */
    function click(t, render) {
      if (t.dataset.howtoAsk) {
        ask(t.dataset.howtoAsk, render); return true;
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
    });
    document.addEventListener("input", (e) => { if (/^howto(Year|Make|Model|Engine)$/.test(e.target.id || "")) readVehicle(); });

    /** Opens the tab for one car (from its detail sheet). */
    function openFor(j) {
      st.carId = j.id;
      st.vehicle = { year: j.vehicle?.year || "", make: j.vehicle?.make || "", model: j.vehicle?.model || "", engine: j.vehicle?.engine || "" };
    }

    return { view, click, submit, openFor };
  };
})();
