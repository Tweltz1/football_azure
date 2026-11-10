// Turns a question into the words the Help chat model looks at. Shared by the page (help-chat.js)
// and the trainer (ml/help-chat/train.mjs), so both see a question the same way.
(function (root) {
  "use strict";
  // Same thing, different words: fold them together so a few examples cover them all.
  const SAME = {
    vehicle: "car", vehicles: "car", truck: "car", trucks: "car", suv: "car", van: "car", auto: "car", cars: "car", ride: "car",
    technician: "tech", technicians: "tech", techs: "tech", mechanic: "tech", mechanics: "tech",
    client: "customer", clients: "customer", customers: "customer", cust: "customer", cx: "customer",
    sms: "text", txt: "text", texts: "text", texting: "text", texted: "text", msg: "message", msgs: "message", messages: "message",
    job: "repair", jobs: "repair", ro: "repair", repairs: "repair", ticket: "repair",
    quote: "estimate", quotes: "estimate", estimates: "estimate",
    invoice: "bill", invoices: "bill", bills: "bill",
    employee: "staff", employees: "staff", worker: "staff", workers: "staff", user: "staff", users: "staff", people: "staff",
    pic: "photo", pics: "photo", picture: "photo", pictures: "photo", photos: "photo", image: "photo", images: "photo",
    login: "signin", logon: "signin", signin: "signin", logout: "signout", logoff: "signout", signout: "signout",
    pw: "password", pwd: "password", passcode: "password", cancelled: "cancel", canceled: "cancel",
    app: "app", apps: "app", phone: "phone", cell: "phone", mobile: "phone", iphone: "phone", android: "phone",
    howto: "how-to", diy: "how-to",
    cant: "not", dont: "not", didnt: "not", doesnt: "not", wont: "not", isnt: "not", never: "not", no: "not",
  };
  const PAIRS = [[/\blog ?(in|on)\b/g, "signin"], [/\bsign ?in\b/g, "signin"], [/\blog ?(out|off)\b/g, "signout"], [/\bsign ?(out|off)\b/g, "signout"],
    [/\bhow ?to\b(?= tab)/g, "how-to"], [/\bwork order\b/g, "workorder"], [/\brepair order\b/g, "repair"], [/\bcheck ?in\b/g, "checkin"], [/\bwalk ?(through|thru)\b/g, "walkthrough"],
    [/\bwalk ?around\b/g, "walkaround"], [/\bset ?up\b/g, "setup"], [/\bpick ?up\b/g, "pickup"], [/\bpicked ?up\b/g, "pickup"], [/\be-?mail/g, "email"], [/\bclock (in|out)\b/g, "clock"]];
  const STOP = new Set("a an the i im me my we our us you your it its is are was be been am do does did to of for on in at by with and or so this that these those there here can could would should will shall just please hey hi also get got if from as up about any some what how when where which who why".split(" "));
  function stem(w) {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -1);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  function words(text) {
    let t = String(text || "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ");
    for (const [re, to] of PAIRS) t = t.replace(re, to);
    return t.replace(/[^a-z0-9\- ]+/g, " ").split(/\s+/).filter(Boolean)
      .map((w) => SAME[w] !== undefined ? SAME[w] : w).filter(Boolean)
      .filter((w) => !STOP.has(w)).map(stem);
  }
  /** Feature strings: each word, each pair of neighbours, and 4-letter pieces of each word (so typos still match). */
  function features(text) {
    const ws = words(text);
    const out = new Set();
    ws.forEach((w, i) => {
      out.add("w:" + w);
      if (i) out.add("p:" + ws[i - 1] + "_" + w);
      const pad = "<" + w + ">";
      for (let k = 0; k + 4 <= pad.length; k++) out.add("c:" + pad.slice(k, k + 4));
    });
    return [...out];
  }
  const api = { words, features };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HelpChatFeatures = api;
})(typeof window !== "undefined" ? window : globalThis);
