// Type-ahead for the vehicle fields at check-in and on the How-To tab: Make, Model and Engine suggest
// as you type (a native <datalist>, so the browser filters the list on each key). Makes and common
// engines are built in; models for the make and engines for the exact year, make and model come from
// POST shop/vehicle-options (NHTSA + EPA data, free) when the page sets window.TalkShopsVehicleOptions.
(function () {
  "use strict";
  const MAKES = ["Acura", "Alfa Romeo", "Audi", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge", "Fiat", "Ford", "Genesis", "GMC", "Honda", "Hummer", "Hyundai", "Infiniti", "Isuzu", "Jaguar", "Jeep", "Kia", "Land Rover", "Lexus", "Lincoln", "Mazda", "Mercedes-Benz", "Mercury", "Mini", "Mitsubishi", "Nissan", "Polestar", "Pontiac", "Porsche", "Ram", "Rivian", "Saab", "Saturn", "Scion", "Subaru", "Suzuki", "Tesla", "Toyota", "Volkswagen", "Volvo"];
  const ENGINES = ["1.0L 3 Cyl. Turbo", "1.2L 3 Cyl.", "1.4L 4 Cyl. Turbo", "1.5L 4 Cyl.", "1.5L 4 Cyl. Turbo", "1.6L 4 Cyl.", "1.6L 4 Cyl. Turbo", "1.8L 4 Cyl.", "2.0L 4 Cyl.", "2.0L 4 Cyl. Turbo", "2.0L 4 Cyl. Hybrid", "2.3L 4 Cyl. Turbo", "2.4L 4 Cyl.", "2.5L 4 Cyl.", "2.5L 4 Cyl. Turbo", "2.5L 4 Cyl. Hybrid", "2.7L 6 Cyl. Turbo", "2.8L 4 Cyl. Diesel", "3.0L 6 Cyl.", "3.0L 6 Cyl. Turbo", "3.0L 6 Cyl. Diesel", "3.3L 6 Cyl.", "3.5L 6 Cyl.", "3.5L 6 Cyl. Turbo", "3.5L 6 Cyl. Hybrid", "3.6L 6 Cyl.", "3.7L 6 Cyl.", "3.8L 6 Cyl.", "4.0L 6 Cyl.", "4.3L 6 Cyl.", "4.6L 8 Cyl.", "4.7L 8 Cyl.", "5.0L 8 Cyl.", "5.3L 8 Cyl.", "5.6L 8 Cyl.", "5.7L 8 Cyl.", "6.0L 8 Cyl.", "6.2L 8 Cyl.", "6.4L 8 Cyl.", "6.6L 8 Cyl. Diesel", "6.7L 6 Cyl. Diesel", "6.7L 8 Cyl. Diesel", "6.8L 8 Cyl.", "7.3L 8 Cyl.", "Electric"];
  const GROUPS = [
    { year: "ci-year", make: "ci-make", model: "ci-model", engine: "ci-engine" },
    { year: "howtoYear", make: "howtoMake", model: "howtoModel", engine: "howtoEngine" },
  ];
  const cache = new Map();
  const val = (id) => (document.getElementById(id)?.value || "").trim();

  function list(input, items) {
    const id = input.id + "-list";
    let dl = document.getElementById(id);
    if (!dl) { dl = document.createElement("datalist"); dl.id = id; document.body.appendChild(dl); }
    if (input.getAttribute("list") !== id) input.setAttribute("list", id);
    input.setAttribute("autocomplete", "off");
    const key = items.join("|");
    if (dl.dataset.key === key) return;
    dl.dataset.key = key;
    dl.replaceChildren(...items.map((x) => { const o = document.createElement("option"); o.value = x; return o; }));
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
    if (field === "make") return list(input, MAKES);
    if (field === "model") {
      const models = await lookup("models", g);
      if (models.length) list(input, models);
      return;
    }
    if (field === "engine") {
      list(input, ENGINES); // right away, then the exact engines for this car first
      const exact = await lookup("engines", g);
      if (exact.length) list(input, [...exact, ...ENGINES.filter((e) => !exact.includes(e))]);
    }
  }

  function find(id) {
    for (const g of GROUPS) for (const field of ["make", "model", "engine"]) if (g[field] === id) return { g, field };
    return null;
  }
  document.addEventListener("focusin", (e) => {
    const hit = find(e.target.id || "");
    if (hit) fill(e.target, hit.g, hit.field);
  });
  // Typing a make or model refreshes the next field's list, so it is ready when they tab over.
  let t = 0;
  document.addEventListener("input", (e) => {
    const hit = find(e.target.id || "") || GROUPS.map((g) => g.year === e.target.id ? { g, field: "year" } : null).find(Boolean);
    if (!hit) return;
    clearTimeout(t);
    t = setTimeout(() => {
      const { g, field } = hit;
      if (field === "year" || field === "make") { const m = document.getElementById(g.model); if (m) fill(m, g, "model"); }
      if (field !== "engine" && val(g.model).length >= 2) { const en = document.getElementById(g.engine); if (en) fill(en, g, "engine"); }
    }, 400);
  });
})();
