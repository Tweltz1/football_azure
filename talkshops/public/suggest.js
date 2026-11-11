"use strict";
// Saved-item suggestions: any <input data-suggest="..."> shows the shop's saved labor, parts and fees in a
// scrollable list under it. Typing narrows the list; click, tap or Enter picks one and calls onPick(input, item).
window.createSuggest = ({ esc, money, items, onPick }) => {
  let box = null, input = null, matches = [], active = -1;
  const label = (r) => r.kind === "percent" ? r.rate + "%" : money(r.rate) + (r.kind === "labor" ? "/hr" : "");
  const kindName = { labor: "Labor", part: "Part", fee: "Fee", percent: "Percent" };

  function close() { box?.remove(); box = null; input?.setAttribute("aria-expanded", "false"); active = -1; }
  function open(el) {
    const list = items();
    if (!list.length) return;
    if (input !== el) close();
    input = el;
    const words = el.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // While typing in a line's own description, an exact match means nothing left to suggest.
    matches = list.map((r, i) => ({ r, i, n: r.name.toLowerCase() }))
      .filter((m) => words.every((w) => m.n.includes(w)))
      .sort((a, b) => (words.length && b.n.startsWith(words[0])) - (words.length && a.n.startsWith(words[0])) || a.n.localeCompare(b.n));
    if (el.dataset.suggest === "row" && matches.length === 1 && matches[0].n === el.value.trim().toLowerCase()) { close(); return; }
    if (!box) {
      box = document.createElement("div");
      box.className = "suggest";
      box.id = "suggestList";
      box.setAttribute("role", "listbox");
      box.addEventListener("pointerdown", (e) => e.preventDefault()); // keep focus in the input
      box.addEventListener("click", (e) => { const o = e.target.closest("[data-i]"); if (o) pick(Number(o.dataset.i)); });
      el.closest(".suggest-wrap").appendChild(box);
      el.setAttribute("aria-controls", "suggestList");
    }
    el.setAttribute("aria-expanded", "true");
    active = Math.min(active, matches.length - 1);
    box.innerHTML = matches.length
      ? `<div class="suggest-h">${words.length ? matches.length + " saved match" + (matches.length === 1 ? "" : "es") : "Your saved items · " + list.length}</div>` +
        matches.map((m, k) => `<div class="suggest-o" role="option" id="sg-${k}" data-i="${m.i}" aria-selected="${k === active}"><span>${esc(m.r.name)}<small>${kindName[m.r.kind] || ""}</small></span><b>${label(m.r)}</b></div>`).join("")
      : `<div class="suggest-h">No saved match. ${el.dataset.suggest === "catalog" ? "Add saved items in Settings." : "It can be saved when you add it."}</div>`;
    if (active >= 0) { el.setAttribute("aria-activedescendant", "sg-" + active); box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }
    else el.removeAttribute("aria-activedescendant");
  }
  function pick(i) {
    const el = input, r = items()[i];
    close();
    if (el && r) onPick(el, { ...r });
  }

  document.addEventListener("focusin", (e) => { if (e.target.matches?.("input[data-suggest]")) open(e.target); else if (box && !box.contains(e.target)) close(); });
  document.addEventListener("input", (e) => { if (e.target.matches?.("input[data-suggest]")) { active = -1; open(e.target); } });
  document.addEventListener("focusout", (e) => { if (e.target === input) setTimeout(() => { if (document.activeElement !== input) close(); }, 120); });
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-suggest-open]");
    if (!t) return;
    const el = t.closest(".suggest-wrap").querySelector("input[data-suggest]");
    if (box && input === el) { close(); return; }
    el.focus(); open(el);
  });
  document.addEventListener("keydown", (e) => {
    if (!e.target.matches?.("input[data-suggest]")) return;
    if (!box) { if (e.key === "ArrowDown") { open(e.target); e.preventDefault(); } return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, Math.min(matches.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      open(e.target);
    } else if (e.key === "Enter" && active >= 0 && matches[active]) {
      e.preventDefault(); pick(matches[active].i);
    } else if (e.key === "Escape") {
      e.stopImmediatePropagation(); close();
    }
  }, true);
  // Called after the page re-renders, so a list never points at an input that is gone.
  return { close, refresh() { if (box && !document.body.contains(box)) { box = null; input = null; } } };
};
