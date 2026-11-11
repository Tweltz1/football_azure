"use strict";
// Free price-sheet reader: turns lines of text (from a PDF, a photo's OCR, or a messy spreadsheet) into saved items
// using patterns, with no AI. It finds prices ($49.95), percents (8%), labor times (1.5 hr) and the shop's hourly
// labor rate. Anything it is unsure of is marked `check` so the owner looks at it on the review screen.
(function (root) {
  const PRICE = /(?:\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?|(?<![\d.\/:-])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d%])(?!\s?(?:hrs?|hours?)\b))/gi;
  const RANGE = /\$?\s?\d[\d,]*(?:\.\d{2})?\s*(?:-|–|—|to)\s*\$?\s?\d[\d,]*(?:\.\d{2})?/i;
  const PERCENT = /(\d{1,2}(?:\.\d{1,2})?)\s?%/;
  const HOURS = /(\d{1,2}(?:\.\d{1,2})?)\s?(?:hrs?|hours?)\b\.?/i;
  const LABOR_RATE = /\b(labou?r(?:\s+rate)?|shop\s+rate|hourly(?:\s+rate)?|per\s+hour|\/\s?hr|an?\s+hour)\b/i;
  const CHECK_WORDS = /\b(starting\s+at|starts\s+at|from|and\s+up|call|varies|estimate|approx\.?|plus\s+parts|\+\s*parts)\b/i;
  const PART_WORDS = /\b(filter|blades?|bulbs?|sensor|valve\s+stem|per\s+qt|per\s+quart|each|ea\.?)\b|\((?:per\s+)?(?:qt|quart|pair)\)/i;
  // Work done (a service), even when a part is named: "Front brake pads", "Battery replacement", "Coolant flush".
  const SERVICE_WORDS = /\b(replace(?:ment)?|install(?:ation)?|service|repair|flush|change|inspection|test|diagnos\w*|alignment|rotation|recharge|restoration|pads|rotors|disposal|fee|labou?r|mount)\b/i;
  const JUNK = /(\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b|www\.|https?:|@\w|\b(total|subtotal|tax|invoice|date|phone|fax|page\s+\d)\b)/i;

  const cents = (n) => Math.round(n * 100) / 100;
  const money = (m) => cents(Number(String(m[1] ?? m[3]).replace(/,/g, "") + "." + (m[2] ?? m[4] ?? "00")));
  const clean = (s) => s.replace(/[.·•…_]{2,}/g, " ").replace(/\s+[-–—:|]+\s*$/, "").replace(/^[-–—•*·|:\s]+/, "").replace(/\s+/g, " ").trim();

  // Words common on shop price lists. OCR misreads ("fitter", "flysh", "oif") one letter off are put back.
  const VOCAB = new Set(("oil change synthetic conventional blend high mileage filter filters air cabin engine fuel transmission trans fluid flush " +
    "coolant radiator brake brakes pads pad rotors rotor front rear caliper calipers shoes drums tire tires rotation balance mount mounting alignment " +
    "wheel wheels battery batteries test testing replacement replace install installation labor labour rate hourly hour hours shop supplies fee fees " +
    "disposal diagnostic diagnosis check light inspection state emissions belt belts serpentine timing water pump hose hoses spark plugs plug ignition " +
    "coils coil wiper wipers blades blade bulb bulbs headlight headlamp tail power steering differential service services transfer case axle cv " +
    "shocks struts strut suspension exhaust muffler catalytic converter sensor sensors oxygen starter alternator heater thermostat refrigerant recharge " +
    "conditioning evacuate tune tuneup up quart quarts each per parts part package basic premium full standard deluxe vehicle vehicles car cars truck " +
    "trucks suv diesel gas tpms valve stems patch plug repair rebuild resurface machine bleed system multi point free with without included includes").split(" "));
  function near(word) {
    let hit = null;
    for (const v of VOCAB) {
      if (Math.abs(v.length - word.length) > 1) continue;
      let i = 0, j = 0, edits = 0;
      while (i < word.length && j < v.length && edits <= 1) {
        if (word[i] === v[j]) { i++; j++; continue; }
        edits++;
        if (word.length > v.length) i++; else if (word.length < v.length) j++; else { i++; j++; }
      }
      edits += (word.length - i) + (v.length - j);
      if (edits === 1) { if (hit) return null; hit = v; }
    }
    return hit;
  }
  // OCR clean-up: dotted leaders come out as runs like "ocsmsmssss" or "......:", and "$" is often read as "S" or "§".
  const leader = (w) => {
    const lw = w.toLowerCase().replace(/[^a-z.:,;'`~_«»-]/g, "");
    if (lw.length < 8 || VOCAB.has(lw.replace(/[^a-z]/g, ""))) return false;
    const share = [...lw].filter((ch) => "cmnorsuvwie.:,;'`~_«»-".includes(ch)).length / lw.length;
    return share >= 0.85 && ((lw.match(/(.)\1/g) || []).length >= 2 || lw.length >= 14 || /^[«.:,]/.test(lw));
  };
  const fixWords = (line) => line.replace(/[§]|\bS(?=\d)/g, "$").split(/\s+/).filter((w) => !leader(w) && !/^[.·•:_—–«»-]{2,}$/.test(w) && w !== "ee").join(" ").replace(/[A-Za-z]{3,}/g, (w) => {
    const lw = w.toLowerCase();
    if (VOCAB.has(lw)) return w;
    const fix = near(lw);
    return fix ? (w[0] === w[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix) : w;
  });

  /** One line of text to its prices and the words in front of them. */
  function readLine(line) {
    const text = String(line).replace(/\s+/g, " ").trim();
    if (!text || JUNK.test(text)) return null;
    const prices = [...text.matchAll(PRICE)].map((m) => ({ value: money(m), at: m.index, end: m.index + m[0].length }));
    const pct = !prices.length && PERCENT.exec(text);
    const hrs = HOURS.exec(text);
    const firstAt = Math.min(prices.length ? prices[0].at : text.length, pct ? pct.index : text.length, hrs ? hrs.index : text.length);
    let name = clean(text.slice(0, firstAt).replace(CHECK_WORDS, " "));
    if (!name && prices.length) name = clean(text.slice(prices.at(-1).end).replace(HOURS, " ").replace(CHECK_WORDS, " "));
    return { text, name, prices, pct: pct ? Number(pct[1]) : null, hours: hrs ? Number(hrs[1]) : null, range: RANGE.test(text), unsure: CHECK_WORDS.test(text) };
  }

  /**
   * Lines of a price sheet to items. A name alone on a line is joined to a price on the next line.
   * Returns { items, laborRate, lines } where `lines` counts lines that looked like prices, to judge how well it went.
   */
  // Two columns side by side come out as one line ("Oil change $49.95   Tire rotation $24.99"): cut after each price
  // (or labor time, or percent) that is followed by more words.
  const END = /(?:\$\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]*\.\d{2}\b|\b\d{1,2}(?:\.\d{1,2})?\s?(?:hrs?|hours?)\b\.?|\b\d{1,2}(?:\.\d{1,2})?\s?%)(?:\s*(?:\/\s?(?:hr|hour)|per\s+hour|an\s+hour|of\s+(?:labou?r|parts)(?:\s+and\s+(?:labou?r|parts))?|each|ea\.?))?/gi;
  function splitColumns(line) {
    const text = String(line), out = [];
    let start = 0;
    for (const m of text.matchAll(END)) {
      const end = m.index + m[0].length, rest = text.slice(end);
      // More words (not just more prices or a range) after this price: a new item starts here.
      if (/^\s*[-–—]\s*\$?\d/.test(rest) || /^\s*(?:to)\s+\$?\d/i.test(rest)) continue;
      const next = rest.search(/[A-Za-z]{3,}/), nextNum = rest.search(/\d/);
      if (next < 0 || (nextNum >= 0 && nextNum < next && !/^[\s$\d.,]*$/.test(rest.slice(0, next)))) continue;
      out.push(text.slice(start, end)); start = end;
    }
    out.push(text.slice(start));
    return out.map((s) => s.trim()).filter(Boolean);
  }

  function parse(lines, opts = {}) {
    const rows = [];
    let pendingName = "";
    for (const raw of pairCells(lines).flatMap((l) => splitColumns(l))) {
      const r = readLine(opts.ocr ? fixWords(String(raw)) : raw);
      if (!r) { pendingName = ""; continue; }
      if (!r.prices.length && r.pct === null && r.hours === null) {
        // Short text with no numbers: a heading or a name whose price is on the next line.
        pendingName = r.name.length <= 80 && /[a-z]/i.test(r.name) ? r.name : "";
        continue;
      }
      // OCR often drops the dot in a labor time ("1.5 hrs" read as "15 hrs").
      if (opts.ocr && r.hours >= 10 && Number.isInteger(r.hours) && r.hours < 100) { r.hours /= 10; r.unsure = true; }
      if (!r.name && pendingName) r.name = pendingName;
      pendingName = "";
      if (r.name && /[a-z]/i.test(r.name)) rows.push(r);
    }

    let laborRate = null;
    for (const r of rows) if (r.prices.length && LABOR_RATE.test(r.text) && !r.hours && r.prices[0].value >= 40 && r.prices[0].value <= 400) { laborRate = r.prices[0].value; break; }

    const items = [], seen = new Set();
    const add = (it) => {
      it.name = it.name.slice(0, 120);
      const key = it.kind + "|" + it.name.toLowerCase();
      if (!it.name || seen.has(key) || items.length >= 250) return;
      seen.add(key); items.push(it);
    };
    for (const r of rows) {
      const why = r.range ? "Price is a range, used the low end" : r.unsure ? "Price may vary (\"starting at\" or similar)" : "";
      if (r.pct !== null && r.pct <= 100) { add({ name: r.name, kind: "percent", rate: r.pct, ...(why ? { check: true, note: why } : {}) }); continue; }
      if (!r.prices.length) {
        // A labor time with no price: labor at the shop's rate.
        add({ name: r.name, kind: "labor", rate: laborRate ?? 0, hours: r.hours, check: true, note: laborRate ? "Labor time at your hourly rate" : "No hourly rate found" });
        continue;
      }
      if (LABOR_RATE.test(r.text) && !r.hours && r.prices[0].value === laborRate) { add({ name: /labou?r/i.test(r.name) ? r.name : "Labor", kind: "labor", rate: laborRate }); continue; }
      const list = r.range ? [r.prices[0]] : r.prices;
      list.forEach((p, i) => {
        const name = (r.hours ? `${r.name} (${r.hours} hr)` : r.name) + (list.length > 1 ? ` (option ${i + 1})` : "");
        const kind = PART_WORDS.test(r.name) && !SERVICE_WORDS.test(r.name) && !r.hours ? "part" : "fee";
        const note = why || (list.length > 1 ? "Several prices on one line" : "");
        add({ name, kind, rate: p.value, ...(note ? { check: true, note } : {}) });
      });
    }
    return { items, laborRate, lines: rows.length };
  }

  /** Text pieces with positions (from pdf.js or OCR) to lines, top to bottom, left to right. */
  function toLines(pieces) {
    const sorted = pieces.filter((p) => p.str && p.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const p of sorted) {
      const last = lines.at(-1);
      if (last && Math.abs(last.y - p.y) <= Math.max(2, (p.h || 10) * 0.45)) last.parts.push(p);
      else lines.push({ y: p.y, parts: [p] });
    }
    // A wide gap between pieces (another column or card) becomes a tab, so cards can be paired up in parse().
    return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).reduce((out, p, i, all) => {
      const prev = all[i - 1], gap = prev && prev.w ? p.x - (prev.x + prev.w) : 0;
      return out + (i ? (gap > Math.max(24, 2 * (p.h || 10)) ? "\t" : " ") : "") + p.str.trim();
    }, ""));
  }

  const hasPrice = (s) => /\$\s?\d|\b\d[\d,]*\.\d{2}\b|\d\s?%|\b\d{1,2}(?:\.\d{1,2})?\s?(?:hrs?|hours?)\b/i.test(s);
  /**
   * Cards or columns side by side: a line of names ("Oil change <tab> Tire rotation") followed by a line of prices
   * ("$49.95 <tab> $24.99") is paired cell by cell. Other tab gaps are just spaces.
   */
  function pairCells(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const cells = String(lines[i]).split("\t").map((c) => c.trim()).filter(Boolean);
      const next = i + 1 < lines.length ? String(lines[i + 1]).split("\t").map((c) => c.trim()).filter(Boolean) : [];
      if (cells.length >= 2 && next.length === cells.length && cells.every((c) => !hasPrice(c) && /[a-z]{3}/i.test(c)) && next.every(hasPrice)) {
        cells.forEach((c, k) => out.push(c + " " + next[k]));
        i++;
      } else out.push(cells.join(" "));
    }
    return out;
  }

  root.PriceRules = { parse, readLine, toLines, fixWords };
})(typeof window !== "undefined" ? window : globalThis);
