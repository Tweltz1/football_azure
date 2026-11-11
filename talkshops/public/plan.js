// Talk Shops plan: trial banner, the Plan tab, and upgrading through Stripe.
// Payment happens on Stripe's own pages (Checkout and the customer portal); this page never sees card details.
(function () {
  "use strict";
  window.createShopPlan = function ({ esc, api, toast }) {
    let interval = "month";
    const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const usd = (n) => "$" + Number(n).toLocaleString("en-US");
    // What each plan includes. Keep in step with PLANS in supabase/functions/_shared/shopPlans.ts and the homepage.
    const FEATURES = {
      starter: ["3 staff seats (up to 2 owners)", "1,000 texts a month, unlimited email", "Bay board, check-in, photos, walk-throughs and signed estimate approvals",
        "Returning customers, tech assignment, promised-by times, alerts and shop-only notes", "Quick services, reminder texts, printing and Today's Summary",
        "Price list upload (free reader), VIN decode and recalls", "Online booking link", "Spanish customer pages and texts", "CSV export of repairs and customers"],
      pro: ["Everything in Starter", "8 staff seats (up to 3 owners)", "3,000 texts a month, unlimited email", "AI repair how-to assistant and Smart Replies",
        "AI damage marking on walk-around photos", "AI reading of hard-to-read price lists", "Results dashboard: approvals, money, on-time, techs",
        "Review requests after pickup", "Your logo and color on customer pages and printouts", "Technician time clock"],
    };

    /** One line above the board. Empty when there is nothing to say. */
    function banner(p) {
      if (!p) return "";
      const go = `<button class="btn primary sm" data-view="plan">See Plans</button>`;
      if (p.state === "trial") {
        const soon = p.daysLeft <= 5;
        return `<div class="plan-banner ${soon ? "soon" : ""}"><span><b>Free trial: ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left.</b>${soon ? " When it ends, your shop is locked until you choose a plan." : ""}
          ${p.textsUsed} of ${p.textLimit} texts and ${p.carsCreated} of ${p.carLimit} cars used.</span>${go}</div>`;
      }
      if (p.state === "trial_ended") return `<div class="plan-banner ended"><span><b>Your free trial has ended.</b> Choose a plan to open your shop again.</span>${go}</div>`;
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
        <ul class="plan-feats">${(FEATURES[key] || [info.blurb]).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        ${current ? `<button class="btn" data-plan-portal>Current plan · Manage</button>`
          : `<button class="btn ${key === "starter" ? "primary" : ""}" data-plan-buy="${key}" ${p.payments ? "" : "disabled"}>Choose ${esc(info.name)}</button>`}
      </div>`;
    }

    /** The Plan tab. */
    function view(p) {
      if (!p) return window.tsLoader ? window.tsLoader("Loading your plan…") : `<div class="loading">Loading your plan…</div>`;
      let status;
      if (p.state === "free") status = "Your shop is on a free plan with no limits.";
      else if (p.state === "trial") status = `You're on the free trial until ${fmtDate(p.trialEndsAt)}. It includes ${p.textLimit} texts and ${p.carLimit} cars; emails are unlimited. If you choose a plan now, the first charge waits until the trial ends.`;
      else if (p.state === "trial_ended") status = "Your free trial has ended. Everything you entered is still here, and your customers' links still work. Choose a plan to open your shop again.";
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

    /** True when the trial (or a paid plan) has ended: the shop is hidden behind "choose a plan" until it pays. */
    const locked = (p) => !!p && (p.state === "trial_ended" || p.state === "canceled");

    /** Full-page screen shown instead of the shop while it is locked. */
    function lockView(p, { owner, shopName, brand }) {
      const title = p.state === "canceled" ? "Your Talk Shops plan has ended" : "Your free trial has ended";
      const again = `<button class="btn" id="planRecheck">${owner ? "I already paid · " : ""}Check again</button>`;
      if (!owner) {
        return `<div class="login-wrap"><section class="login plan-lock">${brand}
          <h2>${title}</h2>
          <p class="muted">${esc(shopName)} is paused until a shop owner chooses a plan. Nothing was deleted. Ask an owner to sign in and pick a plan, then this page opens back up.</p>
          <div class="btn-row">${again}<button class="btn" id="signOut2">Sign Out</button></div></section></div>`;
      }
      return `<div class="plan-lock-page">${brand}
        <h2>${title}</h2>
        <p class="muted" style="margin:0 0 4px">Choose a plan to open ${esc(shopName)} again. Nothing was deleted: your cars, customers, prices and settings are all saved, and your customers' links still work.
          As soon as payment goes through, your shop comes right back.</p>
        ${p.payments ? "" : `<div class="notice">Online payments are being set up. Check back soon, or email support@talkshops.app.</div>`}
        <div class="plan-toggle" role="group" aria-label="Billing period">
          <button class="btn sm" data-plan-interval="month" aria-pressed="${interval === "month"}">Monthly</button>
          <button class="btn sm" data-plan-interval="year" aria-pressed="${interval === "year"}">Yearly · 2 months free</button>
        </div>
        <div class="plan-cards">${Object.entries(p.plans).map(([k, info]) => card(k, info, p)).join("")}</div>
        ${p.hasBilling ? `<p><button class="linkbtn" data-plan-portal>Manage billing: card, invoices</button></p>` : ""}
        <div class="btn-row">${again}<button class="btn" data-gr-export="jobs">Download repairs (CSV)</button><button class="btn" data-gr-export="customers">Download customers (CSV)</button><button class="btn" id="signOut2">Sign Out</button></div>
        <p class="muted plan-fine">Payments are handled by Stripe. Talk Shops never sees or stores your card number. Have a promo code? Enter it on the payment page.</p>
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

    return { banner, view, click, returned, locked, lockView };
  };
})();
