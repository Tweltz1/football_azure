// Runs the Help chat models (help-chat-model.json, trained by ml/help-chat/train.mjs) on one question.
// Shared by the page and the scorer (ml/help-chat/eval.mjs), so the thresholds tested are the ones shipped.
(function (root) {
  "use strict";
  // Answer outright only when the question is clearly about Talk Shops AND one answer clearly wins.
  // Otherwise offer the top choices. Send to How-to only when the gate is sure it's a car repair question.
  const T = { HELP_P: 0.5, ANSWER_P: 0.7, ANSWER_GAP: 0.4, ROUTE_P: 0.75, CHOICE_P: 0.05, SIDE_P: 0.3 };
  const F = () => root.HelpChatFeatures || require("./help-chat-features.js");

  /** Unpacks a dense model (vocab + base64 bytes) once. */
  function unpack(m) {
    if (m.w || m.rows) return m;
    const bin = typeof atob === "function" ? atob(m.data) : Buffer.from(m.data, "base64").toString("binary");
    const K = m.classes.length;
    m.rows = new Map(m.vocab.map((f, i) => [f, i]));
    m.bytes = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) m.bytes[i] = (bin.charCodeAt(i) << 24) >> 24;
    m.K = K;
    return m;
  }

  /** One model's classes, best first, with probabilities. */
  function run(m, fs) {
    unpack(m);
    const known = fs.filter((f) => m.rows ? m.rows.has(f) : f in m.w);
    const z = m.bias.slice();
    const scale = m.scale / Math.sqrt(known.length || 1);
    for (const f of known) {
      if (m.rows) { const at = m.rows.get(f) * m.K; for (let k = 0; k < m.K; k++) z[k] += m.bytes[at + k] * scale; continue; }
      const pairs = m.w[f];
      if (pairs) for (let j = 0; j < pairs.length; j += 2) z[pairs[j]] += pairs[j + 1] * scale;
    }
    const top = Math.max(...z); let sum = 0;
    const e = z.map((v) => { const x = Math.exp(v - top); sum += x; return x; });
    return { known: known.length, ranked: m.classes.map((label, k) => ({ label, p: e[k] / sum })).sort((a, b) => b.p - a.p) };
  }

  function classify(model, text) {
    const fs = F().features(text);
    const gate = run(model.gate, fs), pick = run(model.picker, fs);
    const g = Object.fromEntries(gate.ranked.map((r) => [r.label, r.p]));
    return { gate: g, known: pick.known, ranked: pick.ranked };
  }

  /** What the chat does: "answer" one, "choose" between a few, "repair" (How-to), or "other" (off topic). */
  function decide(c) {
    const { gate: g, ranked } = c;
    const choices = ranked.filter((r) => r.p >= T.CHOICE_P).slice(0, 3).map((r) => r.label);
    if (!c.known) return { kind: g.repair >= T.ROUTE_P ? "repair" : "other", choices: [] };
    // When it's not about Talk Shops, only suggest Help answers that are a real match.
    const strong = ranked.filter((r) => r.p >= T.SIDE_P).slice(0, 2).map((r) => r.label);
    if (g.repair >= T.ROUTE_P) return { kind: "repair", p: g.repair, choices: strong };
    if (g.other >= T.ROUTE_P) return { kind: "other", p: g.other, choices: strong };
    const top = ranked[0];
    if (g.help >= T.HELP_P && top.p >= T.ANSWER_P && top.p - ranked[1].p >= T.ANSWER_GAP) {
      return { kind: "answer", label: top.label, p: top.p, choices: ranked.slice(1, 4).map((r) => r.label), alsoRepair: g.repair >= 0.3 };
    }
    return { kind: "choose", p: top.p, choices: choices.length ? choices : [top.label], alsoRepair: g.repair >= 0.3 };
  }

  const api = { classify, decide, T };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HelpChatModel = api;
})(typeof window !== "undefined" ? window : globalThis);
