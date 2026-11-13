// Paying the final bill: the Pay button on the customer page, payments on the car's Final Bill section, and the
// owner's Card Payments box in Settings → Customers & Booking. Cards go to the shop's own Stripe account.
// app.js calls Pay.init(adapter) once (same adapter shape as Grow).
(function () {
  "use strict";
  let A = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (t) => new Date(t).toLocaleDateString(document.documentElement.lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ES = {
    "Pay your bill": "Pague su factura", "Pay {0} now": "Pagar {0} ahora", "Paid": "Pagado", "Balance due": "Saldo pendiente",
    "Paid in full. Thank you!": "Pagado por completo. ¡Gracias!", "Card payments are handled securely by Stripe. Your card goes straight to {0}.": "Stripe procesa los pagos con tarjeta de forma segura. El pago va directo a {0}.",
    "Pay online": "Pagar en línea", "Opens {0}'s payment page.": "Abre la página de pago de {0}.", "Opening payment…": "Abriendo el pago…",
    "Paid online": "Pagado en línea", "Paid at the shop": "Pagado en el taller", "Thanks! Your payment went through.": "¡Gracias! Su pago se realizó.",
  };
  const T = (text, ...args) => {
    const s = document.documentElement.lang === "es" && Object.hasOwn(ES, text) ? ES[text] : text;
    return args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[+i] ?? "") : s;
  };
  const st = { settings: null, loading: false, err: "", busy: false };

  // Back from Stripe's sign-up: open Settings on the Customers & Booking tab.
  const q = new URLSearchParams(location.search);
  const back = q.get("pay");
  if (back) { try { localStorage.setItem("ts-settings-tab", "customers"); } catch { /* private mode */ } }
  const justPaid = /^cs_/.test(q.get("paid") || "");

  function init(adapter) {
    A = adapter;
    if (back || justPaid) {
      q.delete("pay"); q.delete("paid");
      history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    }
    if (back === "done") setTimeout(() => A.toast("Back from Stripe. Card payments turn on once Stripe finishes checking your details."), 600);
  }

  // ==================== Customer page ====================
  function customerCard(c) {
    const p = c.pay;
    if (!p) return "";
    const done = p.due <= 0;
    const list = p.payments.length ? `<ul class="pay-list">${p.payments.map((x) => `<li><span>${x.how === "online" ? T("Paid online") : T("Paid at the shop")} · ${esc(day(x.t))}</span><b>${money(x.amount)}</b></li>`).join("")}</ul>` : "";
    const thanks = justPaid && p.paid > 0 ? `<p class="pay-thanks" role="status">${T("Thanks! Your payment went through.")}</p>` : "";
    if (done) return `<section class="c-card pay-card">${thanks}<h3>${T("Pay your bill")}</h3>${list}<p class="pay-done">${T("Paid in full. Thank you!")}</p></section>`;
    if (!p.online && !p.link && !p.paid) return "";
    const btn = p.online
      ? `<button type="button" class="btn primary pay-btn" data-pay-now ${st.busy ? "disabled" : ""}>${st.busy ? T("Opening payment…") : T("Pay {0} now", money(p.due))}</button>
         <p class="muted pay-note">${T("Card payments are handled securely by Stripe. Your card goes straight to {0}.", esc(c.shop.name))}</p>`
      : p.link ? `<a class="btn primary pay-btn" href="${esc(p.link)}" target="_blank" rel="noopener">${T("Pay online")}</a><p class="muted pay-note">${T("Opens {0}'s payment page.", esc(c.shop.name))}</p>` : "";
    return `<section class="c-card pay-card">${thanks}<h3>${T("Pay your bill")}</h3>${list}
      <div class="total"><span>${p.paid ? T("Balance due") : T("Total due")}</span><b>${money(p.due)}</b></div>${btn}</section>`;
  }

  // ==================== The car's Final Bill section (shop) ====================
  const paidOf = (j) => (j.payments || []).reduce((a, p) => a + Math.round(p.amount * 100), 0) / 100;
  const dueOf = (j) => Math.max(0, Math.round(j.bill.total * 100) - Math.round(paidOf(j) * 100)) / 100;
  function shopSection(j) {
    if (!j.bill) return "";
    const due = dueOf(j), owner = A?.isOwner();
    const list = (j.payments || []).map((p) => `<li><span>${p.how === "online" ? "Card, online" : "At the counter"} · ${esc(day(p.t))}${p.how === "counter" && p.by ? " · " + esc(p.by) : ""}</span><b>${money(p.amount)}</b>${owner && p.how === "counter" ? ` <button type="button" class="linkbtn" data-pay-remove="${esc(p.id)}" data-job="${esc(j.id)}">Remove</button>` : ""}</li>`).join("");
    const pending = j.payPending && due > 0 ? `<p class="muted" style="margin:6px 0 0">${esc(j.customer?.name?.split(/\s+/)[0] || "The customer")} opened the card payment page ${esc(day(j.payPending.t))}. ${owner ? `<button type="button" class="linkbtn" data-pay-check="${esc(j.id)}">Check with Stripe</button>` : ""}</p>` : "";
    return `<div class="pay-shop">
      <p style="margin:6px 0 0"><span class="pill ${due <= 0 ? "ok" : ""}">${due <= 0 ? "Paid in full" : paidOf(j) ? "Balance " + money(due) : "Not paid yet"}</span></p>
      ${list ? `<ul class="pay-list">${list}</ul>` : ""}${pending}
      ${owner && due > 0 ? `<div class="btn-row pay-counter"><label class="field" style="margin:0">Paid at the counter<input type="number" min="0.01" step=".01" max="100000000" id="pay-amt-${esc(j.id)}" value="${due.toFixed(2)}" aria-label="Amount paid at the counter"></label><button type="button" class="btn sm" data-pay-record="${esc(j.id)}">Record payment</button></div>` : ""}
    </div>`;
  }

  // ==================== Settings → Customers & Booking (owners) ====================
  async function loadSettings() {
    if (st.loading) return;
    st.loading = true;
    try { st.settings = await A.api("GET", "shop/pay"); st.err = ""; } catch (e) { st.err = e.message; }
    st.loading = false;
    A.render();
  }
  function settingsPanel() {
    if (!A?.isOwner()) return "";
    if (!st.settings && !st.loading && !st.err) setTimeout(loadSettings, 0);
    const s = st.settings;
    const stripe = !s ? `<p class="muted">${st.err ? esc(st.err) : "Loading…"}</p>`
      : !s.available ? `<p class="muted">Card payments are coming soon. Until then you can paste the pay link you already use below.</p>`
      : s.stripe.ready ? `<p><span class="pill ok">Stripe connected</span> Customers see a <b>Pay now</b> button on their page once the final bill is ready. Money goes to your Stripe account; Stripe's card fee applies, and Talk Shops adds nothing.</p>
          <div class="btn-row"><a class="btn sm" href="https://dashboard.stripe.com/payments" target="_blank" rel="noopener">Open Stripe dashboard</a><button type="button" class="linkbtn" data-pay-disconnect>Stop card payments</button></div>`
      : s.stripe.connected ? `<p><span class="pill">Almost there</span> Stripe is still setting up your account. Finish any steps Stripe asked for, then come back.</p>
          <div class="btn-row"><button type="button" class="btn sm primary" data-pay-connect>Continue Stripe setup</button><button type="button" class="btn sm" data-pay-refresh>Check again</button><button type="button" class="linkbtn" data-pay-disconnect>Cancel</button></div>`
      : `<p class="muted" style="margin:0">Let customers pay their final bill by card from their page. Payments go straight to your own Stripe account (sign-up takes about 10 minutes; have your bank and tax ID ready). Talk Shops takes no cut.</p>
          <div class="btn-row"><button type="button" class="btn sm primary" data-pay-connect ${st.busy ? "disabled" : ""}>Connect Stripe</button></div>`;
    return `<section class="panel gr-panel" id="pay-settings"><h2>Card Payments</h2>
      ${stripe}
      <details class="more-info" ${s?.link ? "open" : ""}><summary>Already take cards with Square, Clover or PayPal?</summary>
        <p class="muted" style="margin:0">Paste your pay link. Customers get a <b>Pay online</b> button with their balance shown. Record the payment here once it comes in. If Stripe is connected, its Pay button is used instead.</p>
        <label class="field">Your pay link<input id="pay-link" maxlength="400" inputmode="url" value="${esc(s?.link || "")}" placeholder="https://square.link/u/…"></label>
        <div class="btn-row"><button type="button" class="btn sm" data-pay-save-link>Save</button></div>
      </details>
    </section>`;
  }

  // ==================== Events ====================
  document.addEventListener("click", async (e) => {
    if (!A) return;
    const t = e.target.closest("[data-pay-now],[data-pay-record],[data-pay-remove],[data-pay-check],[data-pay-connect],[data-pay-refresh],[data-pay-disconnect],[data-pay-save-link]");
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute("data-pay-now")) {
      st.busy = true; A.renderCustomer();
      try { const r = await A.api("POST", `shop/c/${encodeURIComponent(A.customerToken())}/pay`); location.href = r.url; }
      catch (err) { st.busy = false; A.renderCustomer(); A.toast(err.message); }
      return;
    }
    if (t.dataset.payRecord) {
      const amt = Number(document.getElementById("pay-amt-" + t.dataset.payRecord)?.value);
      if (!(amt > 0)) { A.toast("Enter the amount paid."); return; }
      await A.act(t.dataset.payRecord, "payment", { amount: Math.round(amt * 100) / 100 });
      return;
    }
    if (t.dataset.payRemove) { await A.act(t.dataset.job, "payment", { remove: t.dataset.payRemove }); return; }
    if (t.dataset.payCheck) { await A.act(t.dataset.payCheck, "payment", { check: true }); return; }
    try {
      if (t.hasAttribute("data-pay-connect")) {
        st.busy = true; A.render();
        const r = await A.api("POST", "shop/pay", { action: "connect" });
        location.href = r.url;
        return;
      }
      if (t.hasAttribute("data-pay-refresh")) { st.settings = null; await loadSettings(); if (!st.settings?.stripe?.ready) A.toast("Stripe isn't finished yet."); return; }
      if (t.hasAttribute("data-pay-disconnect")) { st.settings = await A.api("POST", "shop/pay", { action: "disconnect" }); A.toast("Card payments are off."); }
      if (t.hasAttribute("data-pay-save-link")) { st.settings = await A.api("POST", "shop/pay", { action: "link", link: document.getElementById("pay-link")?.value || "" }); A.toast("Pay link saved"); }
    } catch (err) { A.toast(err.message); }
    st.busy = false; A.render();
  });

  window.Pay = { init, customerCard, shopSection, settingsPanel };
})();
