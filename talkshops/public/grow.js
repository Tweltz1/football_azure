// Growth tools for the shop app: the results dashboard, review requests, the shop's logo and color, the
// technician time clock (all Pro), plus online booking requests, CSV export and Spanish customer pages
// (every plan). Also holds the Spanish words for the customer page (window.tsT).
// app.js calls Grow.init(adapter) once; the adapter reads and saves through the app's own data.
(function () {
  "use strict";
  let A = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money0 = (n) => "$" + Math.round(Number(n || 0)).toLocaleString("en-US");
  const pct = (x) => x == null ? "–" : Math.round(x * 100) + "%";
  const ts = (t) => (typeof t === "number" ? t : Date.parse(t));
  const first = (n) => String(n || "").split(/\s+/)[0];
  const vehicle = (v) => [v?.year, v?.make, v?.model].filter(Boolean).join(" ");
  const $ = (s) => document.querySelector(s);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } } };
  const ui = { bookings: null, bkOpen: null, bkMode: "", days: 30, results: null, resultsErr: "", logoBusy: false };

  function init(adapter) { A = adapter; }
  const pro = () => !!A?.plan()?.pro || (A?.plan() == null);
  const lockNote = (what) => `<p class="gr-lock"><span class="pill">Pro</span> ${esc(what)} is part of Talk Shops Pro. ${A?.isOwner() ? `<button type="button" class="linkbtn" data-view="plan">See plans</button>` : "Ask a shop owner about upgrading."}</p>`;

  // ==================== Spanish for the customer page ====================
  // Keys are the English text. {0}, {1}... are filled in by tsT(text, a, b).
  const ES = {
    "Check In for Your Repair": "Registre su vehículo", "We Have Your Car": "Tenemos su vehículo", "Inspecting Your Car": "Revisando su vehículo",
    "Waiting on Your Approval": "Esperando su aprobación", "Waiting on Parts": "Esperando piezas", "Repairs Underway": "Reparación en curso",
    "Final Check and Road Test": "Revisión final y prueba de manejo", "Ready for Pickup": "Listo para recoger", "Picked Up": "Recogido",
    "Customer invited": "Cliente invitado", "Checked In": "Recibido", "Diagnosing": "Diagnóstico", "Estimate Review": "Revisión del presupuesto",
    "In Progress": "En reparación", "Quality Check": "Revisión de calidad",
    "This Repair Was Closed": "Esta reparación se cerró", "Check-In Details Received": "Recibimos sus datos",
    "Estimate Approved": "Presupuesto aprobado", "Estimate Declined": "Presupuesto rechazado", "Estimate Partially Approved": "Presupuesto aprobado en parte",
    "Approve": "Aprobar", "Decline": "Rechazar", "Approved": "Aprobado", "Declined": "Rechazado",
    "Estimate": "Presupuesto", "Approved so far": "Aprobado hasta ahora", "Approved total": "Total aprobado",
    "Type your full name to sign": "Escriba su nombre completo para firmar", "Send my decision": "Enviar mi decisión",
    "Your signed decision goes straight to the shop.": "Su decisión firmada llega directo al taller.",
    "Choose approve or decline for each item.": "Elija aprobar o rechazar cada concepto.",
    "One repair: these parts and labor go together, so you approve or decline them as one.": "Una sola reparación: estas piezas y la mano de obra van juntas, así que se aprueban o rechazan en conjunto.",
    "Signed by {0} on {1}": "Firmado por {0} el {1}",
    "Parts expected {0}.": "Piezas esperadas {0}.", "Total due {0}": "Total a pagar {0}", "Approved estimate {0}": "Presupuesto aprobado {0}", "Open {0}.": "Horario: {0}.",
    "Vehicle check-in": "Registro del vehículo", "Your details have been sent to the shop.": "Sus datos se enviaron al taller.",
    "Vehicle year": "Año del vehículo", "Make": "Marca", "Model": "Modelo", "License plate (optional)": "Placa (opcional)",
    "What should the technician look at?": "¿Qué debe revisar el técnico?", "Save check-in details": "Guardar datos",
    "Photos for your technician": "Fotos para su técnico", "Photos from your technician": "Fotos de su técnico", "Show the damage, warning light or part you want checked.": "Muestre el daño, la luz de advertencia o la pieza que quiere que revisen.",
    "Add photos": "Agregar fotos", "{0} of 6 photos added": "{0} de 6 fotos agregadas",
    "Notes from your technician": "Notas de su técnico", "Progress": "Avance", "View photos": "Ver fotos", "Earlier photos": "Fotos anteriores",
    "Your concern": "Su consulta", "Questions? Call the shop": "¿Preguntas? Llame al taller", "This page updates as your repair progresses.": "Esta página se actualiza a medida que avanza su reparación.",
    "Privacy Policy": "Política de privacidad", "Required": "Necesario", "Recommended": "Recomendado", "Optional": "Opcional",
    "Needed to fix your concern or for safety.": "Necesario para resolver su problema o por seguridad.", "Advised soon to prevent bigger problems.": "Recomendado pronto para evitar problemas mayores.", "Can wait if you prefer.": "Puede esperar si lo prefiere.",
    "Part": "Pieza", "What's being worked on": "Lo que se está reparando", "Part mentioned": "Pieza mencionada",
    // Final bill
    "Final bill": "Factura final", "Total due": "Total a pagar", "Download shop invoice (PDF)": "Descargar factura (PDF)", "Print / save PDF": "Imprimir / guardar PDF",
    // Walk-through
    "Vehicle walk-through": "Revisión del vehículo", "After repair": "Después de la reparación", "At check-in": "Al recibirlo", "Check-in": "Al recibirlo", "After": "Después",
    "Good": "Bien", "Keep an eye on": "Para vigilar", "Needs attention": "Necesita atención", "Not checked": "No revisado", "Tread": "Dibujo",
    "Body and glass": "Carrocería y vidrios", "Lights": "Luces", "Wipers and washer fluid": "Limpiaparabrisas y líquido", "Tires": "Llantas", "Brakes": "Frenos",
    "Engine oil": "Aceite del motor", "Other fluids": "Otros líquidos", "Battery": "Batería", "Belts and hoses": "Correas y mangueras",
    "Leaks underneath": "Fugas por debajo", "Dashboard warning lights": "Luces de advertencia del tablero",
    // Walk-around photos
    "Walk-around photos": "Fotos alrededor del vehículo", "{0} of 8": "{0} de 8",
    "{0} asked for photos of your car from all sides, so you both have a record of its condition. Tap each spot, or use the button to go in order.":
      "{0} le pidió fotos de su vehículo por todos los lados, para que ambos tengan constancia de su estado. Toque cada lugar o use el botón para ir en orden.",
    "Next: {0}": "Siguiente: {0}", "Take photo": "Tomar foto", "Sending…": "Enviando…", "All 8 photos sent. Thank you! Tap any photo to retake it.": "Las 8 fotos se enviaron. ¡Gracias! Toque una foto para tomarla de nuevo.",
    "Damage noted by the shop": "Daños anotados por el taller", "Front": "Frente", "Front passenger corner": "Esquina delantera del pasajero", "Passenger side": "Lado del pasajero",
    "Rear passenger corner": "Esquina trasera del pasajero", "Rear": "Parte trasera", "Rear driver corner": "Esquina trasera del conductor", "Driver side": "Lado del conductor", "Front driver corner": "Esquina delantera del conductor",
    "Stand in front of the car, far enough back to fit both headlights.": "Párese frente al vehículo, lo bastante lejos para que salgan ambos faros.",
    "Stand at the front corner on the passenger side.": "Párese en la esquina delantera del lado del pasajero.",
    "Step back until the whole passenger side fits, wheel to wheel.": "Retroceda hasta que salga todo el lado del pasajero, de rueda a rueda.",
    "Stand at the back corner on the passenger side.": "Párese en la esquina trasera del lado del pasajero.",
    "Stand behind the car so both taillights fit.": "Párese detrás del vehículo para que salgan ambas luces traseras.",
    "Stand at the back corner on the driver side.": "Párese en la esquina trasera del lado del conductor.",
    "Step back until the whole driver side fits, wheel to wheel.": "Retroceda hasta que salga todo el lado del conductor, de rueda a rueda.",
    "Stand at the front corner on the driver side.": "Párese en la esquina delantera del lado del conductor.",
    "Scratch": "Rayón", "Dent": "Abolladura", "Crack": "Grieta", "Chip": "Desportilladura", "Scuff": "Raspón", "Rust": "Óxido", "Broken part": "Pieza rota", "Other damage": "Otro daño",
    // Reminders
    "Reminder texts": "Recordatorios por mensaje", "You turned off reminder texts from {0}.": "Usted desactivó los recordatorios de {0}.",
    "{0} will remind you about {1}.": "{0} le recordará {1}.", "the work you put off around {0}": "el trabajo que dejó pendiente alrededor del {0}", "your next service around {0}": "su próximo servicio alrededor del {0}",
    " and ": " y ", "Stop reminder texts": "No enviarme recordatorios", "You can also reply STOP to any text.": "También puede responder STOP a cualquier mensaje.",
    // Growth tools on the customer page
    "How did we do?": "¿Cómo lo hicimos?", "Thanks for choosing {0}. If we earned it, a quick review helps a small shop a lot.": "Gracias por elegir {0}. Si quedó contento, una reseña rápida ayuda mucho a un taller pequeño.",
    "Leave a review": "Dejar una reseña", "Your appointment": "Su cita", "{0} confirmed your appointment for {1}.": "{0} confirmó su cita para el {1}.",
  };
  let lang = "en";
  function setLang(l) { lang = l === "es" ? "es" : "en"; document.documentElement.lang = lang; }
  function tsT(text, ...args) {
    const s = lang === "es" && Object.hasOwn(ES, text) ? ES[text] : text;
    return args.length ? s.replace(/\{(\d)\}/g, (_, i) => args[+i] ?? "") : s;
  }
  window.tsT = tsT;
  const dateLocale = () => (lang === "es" ? "es-US" : "en-US");

  /** Language and brand for the customer page. Call before drawing it. */
  function customerSetup(c, token) {
    const pick = store.get("ts-lang-" + token);
    setLang(pick || c.lang || "en");
    applyColor(c.shop?.brand?.color);
  }
  /** The shop's color takes over the page's accent (customer and booking pages only). */
  function applyColor(color) {
    const st = document.documentElement.style;
    for (const k of ["--accent", "--accent-2", "--accent-ink", "--accent-soft", "--grad"]) st.removeProperty(k);
    document.documentElement.classList.toggle("has-brand", !!color);
    if (!color) return;
    st.setProperty("--accent", color); st.setProperty("--accent-2", color); st.setProperty("--accent-ink", `color-mix(in srgb, ${color} 80%, #000)`);
    st.setProperty("--accent-soft", `color-mix(in srgb, ${color} 12%, transparent)`); st.setProperty("--grad", `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 75%, #000))`);
  }
  function customerHead(c) {
    const b = c.shop?.brand;
    return b?.logo ? `<img class="gr-logo" src="${esc(b.logo)}" alt="${esc(c.shop.name)}">` : "";
  }
  const langSwitch = (token) => `<p class="cust-top gr-lang">${lang === "es"
    ? `<button type="button" class="linkbtn" data-gr-lang="en" data-token="${esc(token)}">View in English</button>`
    : `<button type="button" class="linkbtn" data-gr-lang="es" data-token="${esc(token)}">Ver en español</button>`}</p>`;
  function customerCards(c) {
    let h = "";
    if (c.appointment) h += `<div class="c-card gr-appt"><h3>${tsT("Your appointment")}</h3><p style="margin:0">${tsT("{0} confirmed your appointment for {1}.", esc(c.shop.name),
      esc(new Date(ts(c.appointment)).toLocaleString(dateLocale(), { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\.$/, "")))}</p></div>`;
    if (c.review?.url) h += `<div class="c-card gr-review"><h3>${tsT("How did we do?")}</h3><p style="margin:0 0 10px">${tsT("Thanks for choosing {0}. If we earned it, a quick review helps a small shop a lot.", esc(c.shop.name))}</p>
      <a class="btn primary" href="${esc(c.review.url)}" target="_blank" rel="noopener" data-gr-review>${tsT("Leave a review")} ★</a></div>`;
    return h;
  }

  // ==================== Online booking: the public page (/?book=<token>) ====================
  const bk = { token: "", info: null, err: "", sent: false, busy: false };
  async function renderBooking(token) {
    bk.token = token;
    const app = $("#app");
    $("#shopChrome") && ($("#shopChrome").hidden = true);
    if (!bk.info && !bk.err) {
      app.innerHTML = `<div class="loading">Loading…</div>`;
      try { bk.info = await A.api("GET", "shop/book/" + encodeURIComponent(token)); } catch (e) { bk.err = e.message; }
    }
    if (bk.err && !bk.info) { app.innerHTML = `<div class="loading"><p>${esc(bk.err)}</p></div>`; return; }
    const s = bk.info.shop;
    setLang(store.get("ts-book-lang") || ((navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en"));
    applyColor(s.brand?.color);
    const es = lang === "es", L = (en, sp) => (es ? sp : en);
    document.title = s.name + " · " + L("Book a visit", "Pedir una cita");
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const min = today.toISOString().slice(0, 10), max = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    app.innerHTML = `<div class="cust-page gr-book-page">
      <div class="c-head">${s.brand?.logo ? `<img class="gr-logo" src="${esc(s.brand.logo)}" alt="">` : ""}<small>${esc(s.name)}</small><h2>${L("Request an appointment", "Pida una cita")}</h2>
        <div style="font-size:14px;margin-top:4px">${esc([s.phone, s.hours].filter(Boolean).join(" · "))}</div></div>
      <div class="c-body">
      ${bk.sent ? `<div class="c-card"><h3>${L("Request sent", "Solicitud enviada")}</h3><p style="margin:0">${L(`Thanks! ${esc(s.name)} will confirm a time with you soon.`, `¡Gracias! ${esc(s.name)} le confirmará una hora pronto.`)}${s.phone ? " " + L("Need it sooner? Call ", "¿Lo necesita antes? Llame al ") + `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>.` : ""}</p></div>` : `
      ${bk.info.note ? `<div class="c-card"><p style="margin:0">${esc(bk.info.note)}</p></div>` : ""}
      <form class="c-card form-grid" id="grBookForm">
        <h3 class="full" style="margin:0">${L("You", "Usted")}</h3>
        <label class="field">${L("Your name", "Su nombre")}<input name="name" required maxlength="80" autocomplete="name"></label>
        <label class="field">${L("Mobile number", "Celular")}<input name="phone" inputmode="tel" maxlength="30" autocomplete="tel"></label>
        <label class="field">${L("Email (optional)", "Correo (opcional)")}<input name="email" type="email" maxlength="254" autocomplete="email"></label>
        <label class="field">${L("Contact me by", "Contácteme por")}<select name="preference"><option value="sms">${L("Text message", "Mensaje de texto")}</option><option value="email">Email</option><option value="both">${L("Text and email", "Texto y correo")}</option></select></label>
        <h3 class="full" style="margin:6px 0 0">${L("Your vehicle", "Su vehículo")}</h3>
        <label class="field">${L("Year", "Año")}<input name="year" inputmode="numeric" maxlength="4"></label>
        <label class="field">${L("Make", "Marca")}<input name="make" required maxlength="40"></label>
        <label class="field">${L("Model", "Modelo")}<input name="model" required maxlength="40"></label>
        <label class="field">${L("License plate (optional)", "Placa (opcional)")}<input name="plate" maxlength="12"></label>
        <label class="field full">${L("What does it need?", "¿Qué necesita?")}<textarea name="concern" required maxlength="1000" placeholder="${L("e.g. Oil change, and a squeak when braking", "p. ej. Cambio de aceite y un chillido al frenar")}"></textarea></label>
        <label class="field">${L("Day you'd like", "Día que prefiere")}<input name="day" type="date" required min="${min}" max="${max}" value="${min}"></label>
        <label class="field">${L("Time of day", "Hora del día")}<select name="time"><option value="morning">${L("Morning", "Mañana")}</option><option value="afternoon">${L("Afternoon", "Tarde")}</option><option value="any">${L("Any time", "Cualquier hora")}</option></select></label>
        <label class="gr-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="chk full"><input type="checkbox" name="consent" checked> ${L(`${esc(s.name)} may text or email me about this appointment and my repair. Reply STOP to opt out.`, `${esc(s.name)} puede enviarme mensajes o correos sobre esta cita y mi reparación. Responda STOP para no recibir más.`)}</label>
        ${bk.err ? `<p class="form-err full" role="alert">${esc(bk.err)}</p>` : ""}
        <button class="btn primary full" type="submit" ${bk.busy ? "disabled" : ""}>${bk.busy ? L("Sending…", "Enviando…") : L("Send request", "Enviar solicitud")}</button>
        <p class="muted full" style="margin:0;font-size:13px">${L("This is a request. The shop confirms the exact time.", "Esto es una solicitud. El taller confirma la hora exacta.")}</p>
      </form>`}
      <p class="cust-top gr-lang"><button type="button" class="linkbtn" data-gr-book-lang="${es ? "en" : "es"}">${es ? "View in English" : "Ver en español"}</button></p>
      <p class="cust-top"><a href="/privacy.html">${tsT("Privacy Policy")}</a></p>
      </div></div>`;
  }
  async function sendBooking(f) {
    const g = (k) => (f.elements[k]?.value || "").trim();
    bk.busy = true; bk.err = ""; renderBooking(bk.token);
    try {
      await A.api("POST", "shop/book/" + encodeURIComponent(bk.token), {
        customer: { name: g("name"), phone: g("phone"), email: g("email"), preference: g("preference"), consent: f.elements.consent.checked, lang },
        vehicle: { year: g("year"), make: g("make"), model: g("model") }, plate: g("plate"), concern: g("concern"), day: g("day"), time: g("time"), website: g("website"),
      });
      bk.sent = true;
    } catch (e) { bk.err = e.message; }
    bk.busy = false; renderBooking(bk.token);
    window.scrollTo(0, 0);
  }

  // ==================== Bay: booking requests ====================
  async function loadBookings() {
    if (!A || !A.shop()) return;
    try { ui.bookings = (await A.api("GET", "shop/bookings")).rows || []; } catch { ui.bookings = ui.bookings || []; }
    redrawBookings();
  }
  function redrawBookings() { const el = document.getElementById("gr-bookings"); if (el) el.outerHTML = bookingsPanel(); }
  const partOfDay = (t, es) => ({ morning: es ? "por la mañana" : "morning", afternoon: es ? "por la tarde" : "afternoon", any: es ? "a cualquier hora" : "any time" }[t] || t);
  const dayText = (d, loc = "en-US") => new Date(d + "T12:00:00").toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric" });
  function defaultWhen(b) {
    const d = new Date(b.data.day + "T" + (b.data.time === "afternoon" ? "13:00" : "08:00"));
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const whenText = (local, es) => new Date(local).toLocaleString(es ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  function confirmText(b, local) {
    const es = b.data.customer.lang === "es", shop = A.shop() || {}, f = first(b.data.customer.name);
    const w = (x) => whenText(local, x).replace(/\.$/, "");
    return es ? `Hola ${f}, ${shop.name} confirmó su cita para el ${w(true)}. Vea su visita y agregue fotos para su técnico:`
      : `Hi ${f}, ${shop.name} confirmed your appointment for ${w(false)}. See your visit and add photos for your technician:`;
  }
  function declineText(b) {
    const es = b.data.customer.lang === "es", shop = A.shop() || {}, f = first(b.data.customer.name);
    const call = shop.phone ? (es ? ` Llámenos al ${shop.phone} para buscar otro horario.` : ` Please call us at ${shop.phone} to find another time.`) : (es ? " Responda para buscar otro horario." : " Reply to find another time.");
    return es ? `Hola ${f}, gracias por escribir a ${shop.name}. No tenemos espacio el ${dayText(b.data.day, "es-US")}.${call}` : `Hi ${f}, thanks for reaching out to ${shop.name}. We're full on ${dayText(b.data.day)}.${call}`;
  }
  function bookingsPanel() {
    const rows = ui.bookings || [];
    if (!rows.length) return `<div id="gr-bookings" hidden></div>`;
    return `<section class="gr-bookings" id="gr-bookings"><div class="gr-bk-h"><h3>Booking Requests <span class="pill warn">${rows.length}</span></h3><small class="muted">From your online booking link</small></div>
      <ul>${rows.map((b) => {
        const d = b.data, c = d.customer, open = ui.bkOpen === b.id;
        return `<li data-gr-bk="${esc(b.id)}"><div class="gr-bk-main"><b>${esc(c.name)}</b>${c.lang === "es" ? ' <span class="pill">Español</span>' : ""} · ${esc(vehicle(d.vehicle))}${d.plate ? " · " + esc(d.plate) : ""}
          <div class="gr-bk-when">Wants <b>${esc(dayText(d.day))}</b>, ${esc(partOfDay(d.time))}</div>
          <div class="muted">${esc(d.concern)}</div><small class="muted">${esc([c.phone, c.email].filter(Boolean).join(" · "))}${c.consent ? "" : " · did not agree to messages"}</small></div>
          ${open ? (ui.bkMode === "accept" ? `<div class="gr-bk-form"><label class="field">Appointment<input type="datetime-local" id="gr-bk-when" value="${esc(defaultWhen(b))}"></label>
              <label class="field">Message to ${esc(first(c.name))}<textarea id="gr-bk-text" maxlength="600">${esc(confirmText(b, defaultWhen(b)))}</textarea><span class="hint">The link to their visit page is added at the end.</span></label>
              <label class="chk"><input type="checkbox" id="gr-bk-send" ${c.consent ? "checked" : "disabled"}> Send this to ${esc(first(c.name))}</label>
              <div class="btn-row"><button type="button" class="btn primary" data-gr-bk-accept>Confirm and add to the Bay</button><button type="button" class="btn" data-gr-bk-cancel>Cancel</button></div></div>`
            : `<div class="gr-bk-form"><label class="field">Message to ${esc(first(c.name))}<textarea id="gr-bk-text" maxlength="600">${esc(declineText(b))}</textarea></label>
              <label class="chk"><input type="checkbox" id="gr-bk-send" ${c.consent ? "checked" : "disabled"}> Send this to ${esc(first(c.name))}</label>
              <div class="btn-row"><button type="button" class="btn danger" data-gr-bk-decline>Decline request</button><button type="button" class="btn" data-gr-bk-cancel>Cancel</button></div></div>`)
          : `<div class="btn-row"><button type="button" class="btn primary sm" data-gr-bk-open="accept">Confirm a time</button><button type="button" class="btn sm" data-gr-bk-open="decline">Decline</button></div>`}
        </li>`;
      }).join("")}</ul></section>`;
  }

  // ==================== Bay: card marks ====================
  function cardBits(j) {
    const on = (j.clock || []).filter((e) => !e.end);
    const clock = on.length ? `<span class="gr-on" title="On the clock: ${esc(on.map((e) => e.by.name).join(", "))}">⏱ ${esc(on.map((e) => first(e.by.name)).join(", "))}</span>` : "";
    const appt = j.stage === "invited" && j.appointment ? `<span class="pill gr-appt-pill" title="Appointment">📅 ${esc(new Date(ts(j.appointment)).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span>` : "";
    return clock + appt;
  }

  // ==================== Car sheet: time clock and review request ====================
  const hrs = (h) => h < 0.1 ? Math.round(h * 60) + " min" : (Math.round(h * 10) / 10) + " h";
  function clockHours(list, id) { return (list || []).filter((e) => !id || e.by.id === id).reduce((a, e) => a + Math.max(0, (e.end ? ts(e.end) : Date.now()) - ts(e.start)), 0) / 3600000; }
  function sheetSection(j) {
    if (j.stage === "invited" && !j.intakeReceived) return "";
    let h = "";
    const live = j.stage !== "picked_up" && !j.closed;
    // Time clock
    const list = j.clock || [], mine = list.find((e) => !e.end && e.by.id === A.me());
    const sold = j.estimate.filter((e) => e.status === "approved" && e.charge?.kind === "labor").reduce((a, e) => a + Number(e.charge.qty || 0), 0);
    const total = clockHours(list);
    if (!pro()) h += `<section class="sec"><h3>Time Clock <span class="sec-sub">Shop only</span></h3>${lockNote("The technician time clock")}</section>`;
    else if (live || list.length) h += `<section class="sec gr-clock" data-gr-job="${esc(j.id)}"><h3>Time Clock <span class="sec-sub">Shop only</span></h3>
      <div class="gr-clock-top"><div><b>${hrs(total)}</b> worked${sold ? ` · <b>${hrs(sold)}</b> sold on approved labor` : ""}${sold && total ? ` · <span class="${total > sold * 1.1 ? "gr-over" : "gr-under"}">${Math.round((sold / total) * 100)}% efficiency</span>` : ""}</div>
        ${live ? `<button type="button" class="btn ${mine ? "" : "primary"} sm" data-gr-clock="${mine ? "off" : "on"}">${mine ? "Clock Out" : "Clock In"}</button>` : ""}</div>
      ${list.length ? `<ul class="gr-clock-list">${[...list].reverse().slice(0, 12).map((e) => `<li><span>${esc(e.by.name)}</span><span>${esc(new Date(ts(e.start)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}${e.end ? " – " + esc(new Date(ts(e.end)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })) : ' – <span class="pill ok">now</span>'}</span><b>${hrs(clockHours([e]))}</b>
        ${!e.end && e.by.id !== A.me() && A.isOwner() ? `<button type="button" class="linkbtn" data-gr-clock="stop" data-entry="${esc(e.id)}">Stop</button>` : A.isOwner() && e.end ? `<button type="button" class="linkbtn" data-gr-clock="remove" data-entry="${esc(e.id)}" aria-label="Remove entry">Remove</button>` : ""}</li>`).join("")}</ul>` : `<p class="muted" style="margin:0">Clock in when you start on this car to see real hours against the labor you sold.</p>`}
    </section>`;
    // Review request
    if (["ready", "picked_up"].includes(j.stage) && !j.closed) {
      const url = A.shop()?.grow?.reviewUrl;
      h += `<section class="sec" data-gr-job="${esc(j.id)}"><h3>Ask for a Review</h3>${!pro() ? lockNote("Asking for reviews")
        : !url ? `<p class="muted" style="margin:0">Add your Google or Yelp review link in Settings and you can ask ${esc(first(j.customer.name))} for a review with one tap.</p>${A.isOwner() ? '<button type="button" class="btn sm" data-view="settings">Open Settings</button>' : ""}`
        : j.review ? `<p style="margin:0">Asked ${esc(new Date(ts(j.review.askedAt)).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}${j.review.clickedAt ? ' · <span class="pill ok">Opened the review link</span>' : ""}</p>`
        : !j.customer.consent ? `<p class="muted" style="margin:0">The customer has not agreed to messages.</p>`
        : `<p class="muted" style="margin:0 0 8px">Sends ${esc(first(j.customer.name))} a thank-you with your review link${j.customer.lang === "es" ? " (in Spanish)" : ""}. Their page shows a review button too.</p><button type="button" class="btn primary sm" data-gr-review-ask>Ask ${esc(first(j.customer.name))} for a Review</button>`}</section>`;
    }
    return h;
  }

  // ==================== Results dashboard (owners) ====================
  const resultsButton = () => A?.isOwner() ? `<button type="button" class="btn sm" data-gr-results>📈 Results</button>` : "";
  async function openResults() {
    let d = document.getElementById("gr-results");
    if (!d) { d = document.createElement("dialog"); d.id = "gr-results"; d.className = "wd-dialog gr-dialog"; document.body.appendChild(d); }
    drawResults(d);
    if (!d.open) d.showModal();
    if (!pro()) return;
    ui.results = null; ui.resultsErr = ""; drawResults(d);
    try { ui.results = await A.api("POST", "shop/results", { days: ui.days }); } catch (e) { ui.resultsErr = e.message; }
    drawResults(d);
  }
  function drawResults(d) {
    const r = ui.results;
    const tile = (n, l, sub) => `<div class="wd-tile"><b>${n}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    let body;
    if (!pro()) body = `<div class="gr-upsell"><p><b>See how the shop is really doing.</b> Approval rate, money approved and declined, days in the shop, on-time promises, what reminder texts brought back, reviews and every tech's hours.</p>${lockNote("The results dashboard")}</div>`;
    else if (ui.resultsErr) body = `<p class="form-err">${esc(ui.resultsErr)}</p>`;
    else if (!r) body = `<p class="muted">Adding up your numbers…</p>`;
    else {
      const maxW = Math.max(1, ...r.weeks.map((w) => w.approved));
      body = `<div class="wd-tiles">
          ${tile(r.cars.in, "Cars checked in", `${r.cars.out} picked up · ${r.cars.open} still in`)}
          ${tile(money0(r.money.approved), "Work approved", `${money0(r.money.declined)} declined`)}
          ${tile(pct(r.approvalRate), "Approval rate", r.lineApproval == null ? "" : `${pct(r.lineApproval)} of line items`)}
          ${tile(money0(r.money.avgTicket), "Average ticket", `${money0(r.money.billed)} on picked-up cars`)}
          ${tile(r.avgDays == null ? "–" : r.avgDays + " d", "Average days in the shop")}
          ${tile(pct(r.onTime), "Ready on time", r.promisedCount ? `${r.promisedCount} cars with a promised time` : "Set promised times to track this")}
          ${tile(r.reminders.sent, "Reminder texts sent", r.reminders.declinedSent ? `${r.reminders.cameBack} came back · ${money0(r.reminders.cameBackMoney)}` : "")}
          ${tile(r.reviews.asked, "Reviews asked", r.reviews.asked ? `${r.reviews.clicked} opened the link` : "")}
          ${r.bookings.fromBooking ? tile(r.bookings.fromBooking, "Online bookings") : ""}
        </div>
        <h3 class="gr-h">Approved work by week</h3>
        <div class="gr-bars">${r.weeks.map((w) => `<div class="gr-bar" title="Week of ${esc(new Date(ts(w.start)).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}: ${money0(w.approved)} approved, ${w.in} cars"><span style="height:${Math.max(2, Math.round((w.approved / maxW) * 100))}%"></span><small>${esc(new Date(ts(w.start)).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }))}</small></div>`).join("")}</div>
        ${r.techs.length ? `<h3 class="gr-h">By technician</h3><div style="overflow-x:auto"><table class="gr-table"><thead><tr><th>Tech</th><th class="num">Cars</th><th class="num">Approved</th><th class="num">Clocked</th><th class="num">Sold labor</th><th class="num">On time</th></tr></thead><tbody>
          ${r.techs.map((t) => `<tr><td>${esc(t.name)}</td><td class="num">${t.cars}</td><td class="num">${money0(t.approved)}</td><td class="num">${t.hours ? t.hours + " h" : "–"}</td><td class="num">${t.soldHours ? t.soldHours + " h" : "–"}${t.hours && t.soldHours ? ` <small class="muted">(${Math.round(t.soldHours / t.hours * 100)}%)</small>` : ""}</td><td class="num">${pct(t.onTime)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${r.topDeclined.length ? `<h3 class="gr-h">Most declined work</h3><ul class="gr-declined">${r.topDeclined.map((x) => `<li><span>${esc(x.item)}</span><span class="muted">${x.count}×</span><b>${money0(x.money)}</b></li>`).join("")}</ul><p class="muted" style="font-size:13px">Schedule reminder texts on cars with declined work to bring it back.</p>` : ""}`;
    }
    d.innerHTML = `<form method="dialog"><div class="wd-dialog-h"><h2>Results</h2><button type="button" class="x" data-dlg-close aria-label="Close">×</button></div>
      ${pro() ? `<div class="plan-toggle gr-days" role="group" aria-label="Period">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "Year"]].map(([n, l]) => `<button type="button" class="btn sm" data-gr-days="${n}" aria-pressed="${ui.days === n}">${l}</button>`).join("")}</div>` : ""}
      ${body}<div class="btn-row"><button type="button" class="btn primary" data-dlg-close>Done</button></div></form>`;
  }

  // ==================== Settings (owners) ====================
  function settingsPanels() {
    if (!A?.isOwner()) return "";
    const s = A.shop() || {}, g = s.grow || {}, b = s.brand || {};
    const link = s.bookingToken ? location.origin + "/?book=" + s.bookingToken : "";
    return `<section class="panel gr-panel" id="gr-booking"><h2>Online Booking</h2>
        <p class="muted" style="margin:0">Put this link on your website, Google Business profile or social pages. Customers ask for a day; you confirm a time and the car lands on your Bay with their details filled in. Customers can book in English or Spanish.</p>
        <label class="chk"><input type="checkbox" data-gr-grow="bookingOn" ${g.bookingOn ? "checked" : ""}> Take booking requests online</label>
        ${g.bookingOn && link ? `<div class="gr-link"><input readonly value="${esc(link)}" aria-label="Your booking link" id="gr-book-link"><button type="button" class="btn sm" data-gr-copy="#gr-book-link">Copy</button><a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>
          <label class="field">Note on your booking page <small class="muted">(optional)</small><input maxlength="300" id="gr-book-note" value="${esc(g.bookingNote || "")}" placeholder="e.g. Drop-offs from 7:30am. We call to confirm."></label>
          <div class="btn-row"><button type="button" class="btn sm" data-gr-save-note>Save note</button><button type="button" class="linkbtn" data-gr-new-link>Make a new link (the old one stops working)</button></div>` : ""}
      </section>
      <section class="panel gr-panel"><h2>Reviews ${pro() ? "" : '<span class="pill">Pro</span>'}</h2>
        <p class="muted" style="margin:0">Paste your Google review link (Google Business Profile → Ask for reviews) or Yelp page. You can ask a customer for a review from their car once it's ready, and their page shows a review button.</p>
        <label class="field">Review link<input id="gr-review-url" maxlength="400" inputmode="url" value="${esc(g.reviewUrl || "")}" placeholder="https://g.page/r/…/review"></label>
        <label class="chk"><input type="checkbox" id="gr-review-auto" ${g.reviewAuto ? "checked" : ""} ${pro() ? "" : "disabled"}> Add the review link to the "Picked up" thank-you text</label>
        ${pro() ? "" : lockNote("Asking for reviews")}
        <div class="btn-row"><button type="button" class="btn sm" data-gr-save-review>Save</button></div>
      </section>
      <section class="panel gr-panel"><h2>Your Logo and Color ${pro() ? "" : '<span class="pill">Pro</span>'}</h2>
        <p class="muted" style="margin:0">Shows on customer pages, the booking page and printed work orders and bills.</p>
        ${pro() ? `<div class="gr-brand">
          <div class="gr-brand-logo">${b.logo ? `<img src="${esc(b.logo)}" alt="Your logo">` : `<span class="muted">No logo yet</span>`}</div>
          <div class="btn-row"><button type="button" class="btn sm" data-gr-logo ${ui.logoBusy ? "disabled" : ""}>${b.logo ? "Change logo" : "Upload logo"}</button>${b.logo ? '<button type="button" class="linkbtn" data-gr-logo-remove>Remove</button>' : ""}</div>
          <label class="field gr-color">Accent color<span><input type="color" id="gr-color" value="${esc(b.color || "#1f6feb")}"><button type="button" class="btn sm" data-gr-color-save>Save color</button>${b.color ? '<button type="button" class="linkbtn" data-gr-color-clear>Use the standard color</button>' : ""}</span></label>
        </div>` : lockNote("Your logo and color on customer pages")}
      </section>
      <section class="panel gr-panel"><h2>Export Your Data</h2>
        <p class="muted" style="margin:0">Download every repair from the last year, or your customer list, as a CSV file for Excel, Google Sheets or your accountant. It's your data.</p>
        <div class="btn-row"><button type="button" class="btn sm" data-gr-export="jobs">Download repairs (CSV)</button><button type="button" class="btn sm" data-gr-export="customers">Download customers (CSV)</button></div>
      </section>`;
  }
  async function saveShop(patch, msg) {
    try { await A.saveShop(patch); if (msg) A.toast(msg); return true; } catch (e) { A.toast(e.message); return false; }
  }
  function pickLogo() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      ui.logoBusy = true;
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That image could not be read.")); i.src = URL.createObjectURL(file); });
        const scale = Math.min(1, 360 / img.width, 160 / img.height);
        const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let src = c.toDataURL("image/png");
        if (src.length > 150000) src = c.toDataURL("image/jpeg", 0.85);
        if (src.length > 150000) throw new Error("That logo is too detailed. Try a simpler or smaller image.");
        await saveShop({ brand: { ...(A.shop().brand || {}), logo: src } }, "Logo saved");
      } catch (e) { A.toast(e.message); }
      ui.logoBusy = false; A.render();
    });
    input.click();
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ==================== Events ====================
  document.addEventListener("click", async (e) => {
    if (!A) return;
    const t = e.target.closest("[data-gr-lang],[data-gr-book-lang],[data-gr-review],[data-gr-results],[data-gr-days],[data-gr-bk-open],[data-gr-bk-cancel],[data-gr-bk-accept],[data-gr-bk-decline],[data-gr-clock],[data-gr-review-ask],[data-gr-grow],[data-gr-copy],[data-gr-save-note],[data-gr-new-link],[data-gr-save-review],[data-gr-logo],[data-gr-logo-remove],[data-gr-color-save],[data-gr-color-clear],[data-gr-export]");
    if (!t) return;
    if (t.dataset.grLang) { store.set("ts-lang-" + t.dataset.token, t.dataset.grLang); A.renderCustomer(); return; }
    if (t.dataset.grBookLang) { store.set("ts-book-lang", t.dataset.grBookLang); renderBooking(bk.token); return; }
    if (t.hasAttribute("data-gr-review")) { const tok = A.customerToken?.(); if (tok) A.api("POST", "shop/c/" + encodeURIComponent(tok) + "/review-click", {}).catch(() => {}); return; }
    if (t.hasAttribute("data-gr-results")) { openResults(); return; }
    if (t.dataset.grDays) { ui.days = +t.dataset.grDays; openResults(); return; }
    const bkId = t.closest("[data-gr-bk]")?.dataset.grBk;
    if (t.dataset.grBkOpen) { ui.bkOpen = bkId; ui.bkMode = t.dataset.grBkOpen; redrawBookings(); document.getElementById("gr-bk-text")?.focus(); return; }
    if (t.hasAttribute("data-gr-bk-cancel")) { ui.bkOpen = null; redrawBookings(); return; }
    if (t.hasAttribute("data-gr-bk-accept") || t.hasAttribute("data-gr-bk-decline")) {
      const accept = t.hasAttribute("data-gr-bk-accept"), local = $("#gr-bk-when")?.value;
      if (accept && !local) { A.toast("Pick the appointment time"); return; }
      const body = accept ? { action: "accept", when: new Date(local).toISOString(), whenText: whenText(local, false), send: $("#gr-bk-send").checked, text: $("#gr-bk-text").value.trim() }
        : { action: "decline", send: $("#gr-bk-send").checked, text: $("#gr-bk-text").value.trim() };
      if (accept && body.text) { const b = (ui.bookings || []).find((x) => x.id === bkId); body.whenText = whenText(local, b?.data.customer.lang === "es"); }
      t.disabled = true;
      try {
        const r = await A.api("POST", "shop/bookings/" + encodeURIComponent(bkId), body);
        ui.bookings = (ui.bookings || []).filter((x) => x.id !== bkId); ui.bkOpen = null;
        if (r.job) { A.upsert(r.job); A.toast(`Added ${r.job.ro} to the Bay`); A.render(); } else { A.toast("Request declined"); redrawBookings(); }
      } catch (err) { A.toast(err.message); t.disabled = false; }
      return;
    }
    const jobId = t.closest("[data-gr-job]")?.dataset.grJob || t.closest("[data-job]")?.dataset.job;
    if (t.dataset.grClock) {
      const v = t.dataset.grClock;
      const body = v === "on" ? { on: true } : v === "off" ? { on: false } : v === "stop" ? { on: false, entry: t.dataset.entry } : { remove: t.dataset.entry };
      t.disabled = true;
      const j = await A.act(jobId, "clock", body);
      if (j) A.toast(v === "on" ? "Clocked in" : v === "remove" ? "Time entry removed" : "Clocked out");
      else t.disabled = false;
      return;
    }
    if (t.hasAttribute("data-gr-review-ask")) { t.disabled = true; const j = await A.act(jobId, "review", {}); if (j) A.toast("Review request sent"); else t.disabled = false; return; }
    if (t.dataset.grGrow === "bookingOn") {
      const on = t.checked;
      if (await saveShop({ grow: { bookingOn: on } }, on ? "Online booking is on" : "Online booking is off")) A.render(); else t.checked = !on;
      return;
    }
    if (t.dataset.grCopy) {
      const el = $(t.dataset.grCopy);
      try { await navigator.clipboard.writeText(el.value); A.toast("Link copied"); } catch { el.select(); A.toast("Press Ctrl+C or ⌘C to copy"); }
      return;
    }
    if (t.hasAttribute("data-gr-save-note")) { await saveShop({ grow: { bookingNote: $("#gr-book-note").value.trim() } }, "Booking note saved"); return; }
    if (t.hasAttribute("data-gr-new-link")) { if (await saveShop({ newBookingLink: true }, "New booking link made. Update it wherever you posted the old one.")) A.render(); return; }
    if (t.hasAttribute("data-gr-save-review")) {
      if (await saveShop({ grow: { reviewUrl: $("#gr-review-url").value.trim(), ...(pro() ? { reviewAuto: $("#gr-review-auto").checked } : {}) } }, "Review settings saved")) A.render();
      return;
    }
    if (t.hasAttribute("data-gr-logo")) { pickLogo(); return; }
    if (t.hasAttribute("data-gr-logo-remove")) { const { logo: _l, ...rest } = A.shop().brand || {}; if (await saveShop({ brand: rest }, "Logo removed")) A.render(); return; }
    if (t.hasAttribute("data-gr-color-save")) { if (await saveShop({ brand: { ...(A.shop().brand || {}), color: $("#gr-color").value } }, "Color saved")) A.render(); return; }
    if (t.hasAttribute("data-gr-color-clear")) { const { color: _c, ...rest } = A.shop().brand || {}; if (await saveShop({ brand: rest }, "Back to the standard color")) A.render(); return; }
    if (t.dataset.grExport) {
      t.disabled = true;
      try { const r = await A.api("POST", "shop/export", { kind: t.dataset.grExport }); download(r.filename, r.csv); } catch (err) { A.toast(err.message); }
      t.disabled = false;
      return;
    }
  });
  document.addEventListener("change", (e) => {
    if (!A || e.target.id !== "gr-bk-when") return;
    const b = (ui.bookings || []).find((x) => x.id === ui.bkOpen), text = $("#gr-bk-text");
    if (b && text && e.target.value) text.value = confirmText(b, e.target.value);
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "grBookForm") return;
    e.preventDefault();
    if (!bk.busy) sendBooking(e.target);
  });
  // New booking requests show up without a reload.
  setInterval(() => { if (A?.shop() && document.visibilityState === "visible" && document.getElementById("gr-bookings")) loadBookings(); }, 60000);

  window.Grow = { init, pro, setLang, customerSetup, customerHead, customerCards, langSwitch, renderBooking, loadBookings, bookingsPanel, cardBits, sheetSection, resultsButton, settingsPanels };
})();
