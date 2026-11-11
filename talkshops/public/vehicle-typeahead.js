// Type-ahead for the vehicle fields at check-in and on the How-To tab: Make, Model and Engine show a
// tap-to-pick suggestion list under the field as you type. It is drawn by this script (not a native
// <datalist>, which iPhone Safari never shows as a dropdown). Makes and common engines are built in;
// models for the make and engines for the exact year, make and model come from POST
// shop/vehicle-options (NHTSA + EPA data, free) when the page sets window.TalkShopsVehicleOptions.
(function () {
  "use strict";
  const MAKES = ["Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hummer", "Hyundai", "Infiniti", "Isuzu", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mercury", "Mini", "Mitsubishi", "Nissan", "Polestar", "Pontiac", "Porsche", "Ram", "Rivian", "Saab", "Saturn", "Scion", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo"];
  const ENGINES = ["1.0L 3 Cyl. Turbo", "1.2L 3 Cyl.", "1.4L 4 Cyl. Turbo", "1.5L 4 Cyl.", "1.5L 4 Cyl. Turbo", "1.6L 4 Cyl.", "1.6L 4 Cyl. Turbo", "1.8L 4 Cyl.", "2.0L 4 Cyl.", "2.0L 4 Cyl. Turbo", "2.0L 4 Cyl. Hybrid", "2.3L 4 Cyl. Turbo", "2.4L 4 Cyl.", "2.5L 4 Cyl.", "2.5L 4 Cyl. Turbo", "2.5L 4 Cyl. Hybrid", "2.7L 6 Cyl. Turbo", "2.8L 4 Cyl. Diesel", "3.0L 6 Cyl.", "3.0L 6 Cyl. Turbo", "3.0L 6 Cyl. Diesel", "3.3L 6 Cyl.", "3.5L 6 Cyl.", "3.5L 6 Cyl. Turbo", "3.5L 6 Cyl. Hybrid", "3.6L 6 Cyl.", "3.7L 6 Cyl.", "3.8L 6 Cyl.", "4.0L 6 Cyl.", "4.3L 6 Cyl.", "4.6L 8 Cyl.", "4.7L 8 Cyl.", "5.0L 8 Cyl.", "5.3L 8 Cyl.", "5.6L 8 Cyl.", "5.7L 8 Cyl.", "6.0L 8 Cyl.", "6.2L 8 Cyl.", "6.4L 8 Cyl.", "6.6L 8 Cyl. Diesel", "6.7L 6 Cyl. Diesel", "6.7L 8 Cyl. Diesel", "6.8L 8 Cyl.", "7.3L 8 Cyl.", "Electric"];
  const GROUPS = [
    { year: "ci-year", make: "ci-make", model: "ci-model", engine: "ci-engine" },
    { year: "howtoYear", make: "howtoMake", model: "howtoModel", engine: "howtoEngine" },
  ];
  const MAX_SHOWN = 40;
  const cache = new Map();
  const options = new WeakMap(); // input -> current suggestion list
  const val = (id) => (document.getElementById(id)?.value || "").trim();

  // ---- the dropdown (one, shared, moved under whichever field has focus) ----
  const style = document.createElement("style");
  style.textContent = `
.vt-menu{position:absolute;z-index:2147483000;margin:0;padding:4px 0;list-style:none;max-height:232px;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--surface,#fff);color:var(--fg,#17202b);border:1px solid var(--line,#d6dce3);border-radius:10px;
  box-shadow:var(--shadow,0 4px 14px rgba(0,0,0,.12));font:inherit;font-family:var(--f-body,system-ui,sans-serif)}
.vt-menu[hidden]{display:none}
.vt-menu li{padding:11px 14px;font-size:16px;line-height:1.2;cursor:pointer;-webkit-tap-highlight-color:transparent}
.vt-menu li[aria-selected="true"],.vt-menu li:hover{background:var(--accent-soft,#e5eefb)}
.vt-menu li b{font-weight:700}`;
  document.head.appendChild(style);

  const menu = document.createElement("ul");
  menu.className = "vt-menu";
  menu.id = "vt-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  let owner = null; // the input the menu belongs to
  let shown = [];
  let active = -1;

  function mount() { if (!menu.isConnected) document.body.appendChild(menu); }

  function place() {
    if (!owner || menu.hidden) return;
    const r = owner.getBoundingClientRect();
    if (!r.width) return hide();
    menu.style.left = r.left + window.scrollX + "px";
    menu.style.top = r.bottom + window.scrollY + 4 + "px";
    menu.style.width = Math.max(r.width, 180) + "px";
  }

  function hide() {
    menu.hidden = true;
    active = -1;
    if (owner) owner.setAttribute("aria-expanded", "false");
  }

  function matches(items, q) {
    q = q.trim().toLowerCase();
    if (!q) return items.slice(0, MAX_SHOWN);
    const starts = [], words = [], inside = [];
    for (const x of items) {
      const l = x.toLowerCase();
      if (l === q) continue; // already typed exactly: nothing to suggest
      if (l.startsWith(q)) starts.push(x);
      else if (l.split(/[\s-]+/).some((w) => w.startsWith(q))) words.push(x);
      else if (l.includes(q)) inside.push(x);
    }
    return [...starts, ...words, ...inside].slice(0, MAX_SHOWN);
  }

  function bold(text, q) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const i = q ? text.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
    if (i < 0 || !q.trim()) { li.textContent = text; return li; }
    const n = q.trim().length;
    const b = document.createElement("b");
    b.textContent = text.slice(i, i + n);
    li.append(text.slice(0, i), b, text.slice(i + n));
    return li;
  }

  function render(input) {
    if (document.activeElement !== input) return;
    const items = options.get(input) || [];
    const q = input.value;
    shown = matches(items, q);
    if (!shown.length) return hide();
    mount();
    owner = input;
    active = -1;
    menu.replaceChildren(...shown.map((x) => bold(x, q)));
    menu.hidden = false;
    menu.scrollTop = 0;
    input.setAttribute("aria-expanded", "true");
    place();
  }

  function highlight(i) {
    active = i;
    [...menu.children].forEach((li, k) => li.setAttribute("aria-selected", k === i ? "true" : "false"));
    menu.children[i]?.scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const input = owner;
    if (!input || shown[i] == null) return;
    input.value = shown[i];
    hide();
    // Let the rest of the page (and the next field's suggestions) see the new value.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Pick on click (a scroll-drag through the list never makes a click). With a mouse, cancelling
  // pointerdown keeps focus in the field. A finger is left alone (cancelling it can leave the next
  // field deaf to typing); if the field blurs, the "touching" flag holds the list open for the click.
  let touching = false;
  menu.addEventListener("pointerdown", (e) => { touching = true; if (e.pointerType === "mouse") e.preventDefault(); });
  menu.addEventListener("click", (e) => {
    touching = false;
    const li = e.target.closest("li");
    if (li) choose([...menu.children].indexOf(li));
  });
  document.addEventListener("pointerup", () => setTimeout(() => { touching = false; }, 300), true);

  // ---- data ----
  function setList(input, items) {
    options.set(input, items);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "vt-menu");
    if (input.getAttribute("list")) input.removeAttribute("list"); // drop any old native datalist
    if (owner === input && document.activeElement === input) render(input);
  }

  async function lookup(want, g) {
    const fetcher = window.TalkShopsVehicleOptions;
    const body = { want, year: val(g.year), make: val(g.make), model: want === "engines" ? val(g.model) : "" };
    if (!fetcher || !body.make || (want === "engines" && (!body.model || !/^\d{4}$/.test(body.year)))) return [];
    const key = JSON.stringify(body).toLowerCase();
    if (!cache.has(key)) cache.set(key, fetcher(body).then((r) => r[want] || [], () => { cache.delete(key); return []; }));
    return cache.get(key);
  }

  async function fill(input, g, field) {
    if (field === "make") return setList(input, MAKES);
    if (field === "model") {
      const models = await lookup("models", g);
      setList(input, models);
      return;
    }
    if (field === "engine") {
      if (!options.has(input)) setList(input, ENGINES); // right away, then the exact engines for this car first
      const exact = await lookup("engines", g);
      setList(input, exact.length ? [...exact, ...ENGINES.filter((e) => !exact.includes(e))] : ENGINES);
    }
  }

  function find(id) {
    for (const g of GROUPS) for (const field of ["make", "model", "engine"]) if (g[field] === id) return { g, field };
    return null;
  }

  document.addEventListener("focusin", (e) => {
    const hit = find(e.target.id || "");
    if (!hit) { if (e.target !== menu) hide(); return; }
    owner = e.target;
    render(e.target); // whatever list it already has, right away
    fill(e.target, hit.g, hit.field);
  });
  document.addEventListener("focusout", (e) => {
    // Wait a beat: if the field lost focus because of a tap on the list, the click still picks.
    if (e.target === owner) setTimeout(() => { if (document.activeElement !== owner && !touching) hide(); }, 250);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target !== owner || menu.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(active + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(active - 1, 0)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); hide(); }
    else if (e.key === "Tab" && active >= 0) choose(active);
  });

  // Typing filters this field's list; a make or model also refreshes the next field's list, so it is
  // ready when they move over.
  let t = 0;
  document.addEventListener("input", (e) => {
    const hit = find(e.target.id || "") || GROUPS.map((g) => g.year === e.target.id ? { g, field: "year" } : null).find(Boolean);
    if (!hit) return;
    if (hit.field !== "year" && e.target === document.activeElement) render(e.target);
    clearTimeout(t);
    t = setTimeout(() => {
      const { g, field } = hit;
      if (field === "year" || field === "make") { const m = document.getElementById(g.model); if (m) fill(m, g, "model"); }
      if (field !== "engine" && val(g.model).length >= 2) { const en = document.getElementById(g.engine); if (en) fill(en, g, "engine"); }
    }, 400);
  });

  // Keep the list under the field when the page, a dialog, or the iPhone keyboard moves things.
  window.addEventListener("scroll", (e) => { if (e.target !== menu) place(); }, true);
  window.addEventListener("resize", place);
  window.visualViewport?.addEventListener("resize", place);
  window.visualViewport?.addEventListener("scroll", place);
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && e.target !== owner && !menu.contains(e.target)) hide();
  }, true);
})();
