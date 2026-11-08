"use strict";
// Talk Shops training: the list of narrated lessons, shared by the shop app and the demo shop.
// Each lesson runs in the demo shop (/demo.html?train=<id>) with sample cars, driven by tour.js.
window.TALKSHOPS_TRAINING = (() => {
  const lessons = [
    { id: "bay", title: "The Bay", mins: 2, desc: "Tabs and the More menu, filters, stage columns, time-in-shop colors and search." },
    { id: "checkin", title: "Checking in a car", mins: 2, desc: "Check-in methods, notifying by text, email or both, and customer consent." },
    { id: "walk", title: "Before and after walk-through", mins: 2, desc: "The 11-point check at check-in and after the repair, notes, and what the customer sees." },
    { id: "walkaround", title: "Walk-around photos and AI damage marks", mins: 2, desc: "Asking for 8 photos, the customer's guide, finding damage with AI, and confirming marks." },
    { id: "stages", title: "Stages and notifications", mins: 1, desc: "Moving a car along, editing what the customer is told, and messaging." },
    { id: "estimates", title: "Estimates and saved items", mins: 2, desc: "Quick add, saved items, Required/Recommended/Optional, and sending for approval." },
    { id: "customer", title: "The customer's page", mins: 1, desc: "What customers see, priority labels, approving item by item, and signing." },
    { id: "smart", title: "Smart Replies", mins: 2, desc: "Suggested and automatic answers to customer texts, what needs staff review, and the schedule." },
    { id: "photos", title: "Photos, notes and voice typing", mins: 1, desc: "Show the problem, write or speak technician notes, and notify the customer." },
    { id: "howto", title: "Repair how-to assistant", mins: 2, desc: "Ask how to do a job and get steps, tools, parts, typical specs and safety notes." },
    { id: "pickup", title: "Final bill, pickup and closing a job", mins: 1, desc: "Bills, picked up, close without repair, and deleting a repair." },
    { id: "archive", title: "The Archive", mins: 1, desc: "Searching past repairs, one-year retention, and reopening a car." },
    { id: "settings", title: "Shop settings and price lists", mins: 2, desc: "Shop details, the reply email, saved items, and importing Excel or CSV." },
    { id: "team", title: "Your team: owners and technicians", mins: 2, desc: "What each role can do, staff seats, inviting people, and changing roles." },
    { id: "signin", title: "Signing in and password reset", mins: 2, desc: "Signing in, resetting a forgotten password by email or text, and adding a reset phone." },
    { id: "plan", title: "Free trial and plans", mins: 1, desc: "Trial limits, Starter and Pro, staff seats, paying through Stripe, and managing billing." },
  ];
  const cap = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8l10-5 10 5-10 5z"/><path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`;
  /** The Training tab. */
  function view(esc) {
    const total = lessons.reduce((a, l) => a + l.mins, 0);
    return `<section class="training">
      <div class="training-h"><h2>Training</h2>
        <p class="muted">Short lessons with voice narration. Each one runs in a demo shop with sample cars, so you can follow along without touching real customers. Turn your sound on.</p></div>
      <a class="training-tour" href="/demo.html?tour=1"><span class="tt-ic">▶</span><span><b>Start with the guided tour</b><small>A 5-minute overview of everything Talk Shops does.</small></span></a>
      <p class="muted training-count">${lessons.length} lessons · about ${total} minutes in all</p>
      <ol class="lessons">${lessons.map((l, i) => `<li><a class="lesson" href="/demo.html?train=${esc(l.id)}">
        <span class="l-num">${i + 1}</span><span class="l-body"><b>${esc(l.title)}</b><small>${esc(l.desc)}</small></span>
        <span class="l-go">${l.mins} min ${cap}</span></a></li>`).join("")}</ol>
    </section>`;
  }
  return { lessons, view };
})();
