// Phone navigation for the shop app and the demo shop: the bottom bar keeps the four daily tabs
// (Bay, Check in, Archive, How-to) and a "More" button. More opens a sheet with Settings, Plan,
// Training and Sign out. The sheet only clicks the real tab or sign-out button, so the page's
// own code still handles every view change.
(function () {
  "use strict";
  const nav = document.querySelector(".tabs.has-icons");
  if (!nav) return;
  const EXTRA = ["settings", "plan", "training", "help"];
  const ICON = '<svg class="tab-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
  const more = document.createElement("button");
  more.type = "button";
  more.className = "tab tab-more";
  more.setAttribute("aria-haspopup", "dialog");
  more.innerHTML = ICON + '<span class="tab-l">More</span>';
  nav.appendChild(more);

  const tab = (v) => nav.querySelector('.tab[data-view="' + v + '"]');
  const exit = () => document.getElementById("signOut") || document.getElementById("signOutLink");

  function sync() {
    const on = EXTRA.some((v) => tab(v)?.getAttribute("aria-current") === "page");
    more.classList.toggle("more-on", on);
  }
  new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });

  let sheet = null;
  function close() { if (!sheet) return; sheet.remove(); sheet = null; more.focus({ preventScroll: true }); }
  function open() {
    if (sheet) return close();
    const shop = document.getElementById("shopName")?.textContent || "";
    const items = EXTRA.map(tab).filter((b) => b && !b.hidden).map((b) =>
      `<button type="button" class="more-item" data-more-view="${b.dataset.view}" ${b.getAttribute("aria-current") === "page" ? 'aria-current="page"' : ""}>${b.querySelector("svg")?.outerHTML || ""}<span>${b.querySelector(".tab-l")?.textContent || b.textContent}</span><i aria-hidden="true">›</i></button>`).join("");
    const x = exit();
    sheet = document.createElement("div");
    sheet.className = "more-layer";
    sheet.innerHTML = `<div class="more-scrim" data-more-close></div>
      <div class="more-sheet" role="dialog" aria-modal="true" aria-label="More">
        <div class="more-grab" aria-hidden="true"></div>
        ${shop ? `<div class="more-shop"><span class="more-avatar" aria-hidden="true">${shop.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span><div><b>${shop.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}</b><small>Talk Shops</small></div></div>` : ""}
        <div class="more-list">${items}</div>
        ${x ? `<button type="button" class="more-item more-exit" data-more-exit><svg class="tab-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg><span>${x.textContent.trim()}</span></button>` : ""}
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".more-item")?.focus({ preventScroll: true });
  }
  more.addEventListener("click", open);
  document.addEventListener("click", (e) => {
    if (!sheet || !sheet.contains(e.target)) return;
    const v = e.target.closest("[data-more-view]");
    if (v) { const b = tab(v.dataset.moreView); close(); b?.click(); window.scrollTo(0, 0); return; }
    if (e.target.closest("[data-more-exit]")) { const x = exit(); close(); x?.click(); return; }
    if (e.target.closest("[data-more-close]")) close();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) close(); });
  addEventListener("resize", () => { if (sheet && innerWidth > 760) close(); });
  sync();
})();
