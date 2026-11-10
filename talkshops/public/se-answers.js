// Free answers from other mechanics for the How-to tab: questions and top answers from Mechanics Stack Exchange
// (mechanics.stackexchange.com, CC BY-SA 4.0, by their authors; shortened, formatting removed). Built by
// ml/howto-se/build.py into /se/. Searched on this device: nothing is sent anywhere and no AI is used.
(function () {
  "use strict";
  const STOP = new Set("a an the and or but if of to in on at for with by from is are was were be been am do does did i my me we our you your it its this that these those what which who how why when where can could should would will just have has had not no so as up out about into than then there here very any some car vehicle".split(" "));
  // Same idea, different words: "swap" a part is "replace" it, "tranny" is the transmission.
  const SAME = { swap: "replace", replacing: "replace", replacement: "replace", change: "replace", changing: "replace", tranny: "transmission", trans: "transmission",
    brakes: "brake", breaks: "brake", tires: "tire", tyres: "tire", tyre: "tire", plugs: "plug", pads: "pad", rotors: "rotor", noises: "noise", sound: "noise", squeak: "squeal",
    squeaking: "squeal", squealing: "squeal", shaking: "shake", shakes: "shake", vibration: "vibrate", vibrates: "vibrate", vibrating: "vibrate", ac: "air", coolant: "coolant", antifreeze: "coolant" };
  const norm = (w) => SAME[w] || (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const words = (t) => [...new Set(String(t).toLowerCase().match(/[a-z0-9]+/g) || [])].filter((w) => w.length > 1 && !STOP.has(w)).map(norm);
  let index = null, df = null, loading = null;
  const shards = new Map();

  function load() {
    if (index) return Promise.resolve(index);
    return loading ??= fetch("/se/index.json?v=1").then((r) => { if (!r.ok) throw Error("load"); return r.json(); }).then((rows) => {
      index = rows.map(([id, title, w]) => ({ id, title, words: new Set(w.split(" ").map(norm)) }));
      df = new Map(); for (const r of index) for (const w of r.words) df.set(w, (df.get(w) || 0) + 1);
      return index;
    }).catch((e) => { loading = null; throw e; });
  }

  /** Up to `n` close questions: at least two shared meaningful words and most of the question's weight covered. */
  async function search(question, vehicle = "", n = 3) {
    const q = words(question);
    if (q.length < 2) return [];
    await load();
    const N = index.length, idf = (w) => Math.log(1 + N / (1 + (df.get(w) || 0)));
    const total = q.reduce((s, w) => s + idf(w), 0), vw = words(vehicle);
    const out = [];
    for (const r of index) {
      let hit = 0, got = 0;
      for (const w of q) if (r.words.has(w)) { hit++; got += idf(w); }
      if (hit < 2 || got < total * 0.6) continue;
      const bonus = vw.filter((w) => r.words.has(w)).length * 0.5;
      out.push({ id: r.id, title: r.title, score: got / total + bonus - r.words.size * 0.01 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, n);
  }

  /** The question text, link and top answers (with authors) for one id. */
  async function get(id) {
    const n = id % 64;
    if (!shards.has(n)) shards.set(n, fetch(`/se/a/${n}.json?v=1`).then((r) => r.json()));
    return (await shards.get(n))[id] || null;
  }

  window.MechanicsAnswers = { search, get };
})();
