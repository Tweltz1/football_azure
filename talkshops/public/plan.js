// Talk Shops plan: trial banner, the Plan tab, and upgrading through Stripe.
// Payment happens on Stripe's own pages (Checkout and the customer portal); this page never sees card details.
(function () {
  "use strict";
  window.createShopPlan = function ({ esc, api, toast }) {
    let interval = "month";
    const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const usd = (n) => "$" + Number(n).toLocaleString("en-US");

    /** One line above the board. Empty when there is nothing to say. */
    function banner(p) {
      if (!p) return "";
      const go = `<button class="btn primary sm" data-view="plan">See Plans</button>`;
      if (p.state === "trial") {
        const soon = p.daysLeft <= 5;
        return `<div class="plan-banner ${soon ? "soon" : ""}"><span><b>Free trial: ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left.</b>
          ${p.textsUsed} of ${p.textLimit} texts and ${p.carsCreated} of ${p.carLimit} cars used.</span>${go}</div>`;
      }
      if (p.state === "trial_ended") return `<div class="plan-banner ended"><span><b>Your free trial has ended.</b> Your board and customer links still work. Choose a plan to send updates again.</span>${go}</div>`;
      if (p.state === "canceled") return `<div class="plan-banner ended"><span><b>Your plan has ended.</b> Choose a plan to send updates again.</span>${go}</div>`;
      if (p.state === "past_due") return `<div class="plan-banner soon"><span><b>Your last payment didn't go through.</b> Update your card to keep your plan.</span><button class="btn primary sm" data-plan-portal>Update Card</button></div>`;
      return "";
    }

    function card(key, info, p) {
      const current = p.plan === key && (p.state === "active" || p.state === "past_due");
      const price = interval === "year" ? info.year : info.month;
      return `<div class="plan-card ${key === "starter" ? "featured" : ""}">
        <h3>${esc(info.name)}</h3>
        <div class="plan-price"><b>${usd(price)}</b><span>/${interval === "year" ? "year" : "month"}</span></div>
        ${interval === "year" ? `<small class="muted">Same as ${usd(Math.round(price / 12))}/month. Two months free.</small>` : `<small class="muted">Billed monthly. Cancel any time.</small>`}
        <ul><li>${esc(info.blurb)}</li><li>Customer page with estimate approval</li><li>Photos, bills and archive</li></ul>
        ${current ? `<button class="btn" data-plan-portal>Current plan · Manage</button>`
          : `<button class="btn ${key === "starter" ? "primary" : ""}" data-plan-buy="${key}" ${p.payments ? "" : "disabled"}>Choose ${esc(info.name)}</button>`}
      </div>`;
    }

    /** The Plan tab. */
    function view(p) {
      if (!p) return `<div class="loading">Loading your plan…</div>`;
      let status;
      if (p.state === "free") status = "Your shop is on a free plan with no limits.";
      else if (p.state === "trial") status = `You're on the free trial until ${fmtDate(p.trialEndsAt)}. It includes ${p.textLimit} texts and ${p.carLimit} cars; emails are unlimited. If you choose a plan now, the first charge waits until the trial ends.`;
      else if (p.state === "trial_ended") status = "Your free trial has ended. Everything you entered is still here, and your customers' links still work.";
      else if (p.state === "canceled") status = "Your plan has ended. Everything you entered is still here.";
      else status = `You're on ${esc(p.plans[p.plan]?.name || "a paid plan")}${p.interval === "year" ? " (yearly)" : ""}.${p.periodEnd ? ` Next renewal ${fmtDate(p.periodEnd)}.` : ""} ${p.textsUsed} of ${p.textLimit} texts used this month.`;
      return `<div class="plan-page">
        <h2>Plan</h2>
        <p class="muted" style="margin:0 0 4px">${status}</p>
        ${p.payments ? "" : `<div class="notice">Online payments are being set up. Check back soon.</div>`}
        <div class="plan-toggle" role="group" aria-label="Billing period">
          <button class="btn sm" data-plan-interval="month" aria-pressed="${interval === "month"}">Monthly</button>
          <button class="btn sm" data-plan-interval="year" aria-pressed="${interval === "year"}">Yearly · 2 months free</button>
        </div>
        <div class="plan-cards">${Object.entries(p.plans).map(([k, info]) => card(k, info, p)).join("")}</div>
        ${p.hasBilling ? `<p><button class="linkbtn" data-plan-portal>Manage billing: card, invoices, cancel</button></p>` : ""}
        <p class="muted plan-fine">Payments are handled by Stripe. Talk Shops never sees or stores your card number.
          Have a promo code? Enter it on the payment page.</p>
      </div>`;
    }

    /** Handles plan buttons. Returns true when it handled the click. */
    async function click(t, rerender) {
      if (t.dataset.planInterval) { interval = t.dataset.planInterval; rerender(); return true; }
      if (t.dataset.planBuy !== undefined || t.dataset.planPortal !== undefined) {
        const buying = t.dataset.planBuy;
        t.disabled = true;
        try {
          const r = buying ? await api("POST", "shop/plan/checkout", { plan: buying, interval }) : await api("POST", "shop/plan/portal");
          location.href = r.url;
        } catch (e) { toast(e.message); t.disabled = false; }
        return true;
      }
      return false;
    }

    /** After Stripe sends the shop back. Returns a message to show, or "". */
    function returned() {
      const q = new URLSearchParams(location.search), v = q.get("plan");
      if (!v) return "";
      q.delete("plan");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
      return v === "success" ? "Thanks! Your plan is being activated." : v === "canceled" ? "No charge was made." : "";
    }

    return { banner, view, click, returned };
  };
})();
