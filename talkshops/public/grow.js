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
  const ui = { schedOpen: false, schedClosed: null, bookings: null, bkOpen: null, bkMode: "", days: 30, results: null, resultsErr: "", logoBusy: false };

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
    "Inspecting": "Revisión", "Your Estimate": "Su presupuesto", "Final Check": "Revisión final",
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
    "Privacy Policy": "Política de privacidad", "Text Terms": "Términos de mensajes", "Required": "Necesario", "Recommended": "Recomendado", "Optional": "Opcional",
    "Needed to fix your concern or for safety.": "Necesario para resolver su problema o por seguridad.", "Advised soon to prevent bigger problems.": "Recomendado pronto para evitar problemas mayores.", "Can wait if you prefer.": "Puede esperar si lo prefiere.",
    "Example photo, not your vehicle": "Foto de ejemplo, no es su vehículo", "How it works": "Cómo funciona", "Photo and diagram": "Foto y diagrama", "View larger diagram": "Ver diagrama más grande",
    "Approve all": "Aprobar todo", "Approve required": "Aprobar lo necesario", "Message the shop": "Mensaje al taller", "Your message": "Su mensaje",
    "Sent. The shop sees it on their screen and will get back to you.": "Enviado. El taller lo ve en su pantalla y le responderá.",
    "Ask a question or tell the shop something": "Haga una pregunta o dígale algo al taller", "Send to shop": "Enviar al taller", "Type your message.": "Escriba su mensaje.",
    "Directions to the shop": "Cómo llegar al taller", "Add to calendar": "Agregar al calendario",
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
  /** A one-hour calendar event for the appointment, as an .ics file the phone's calendar opens. */
  function calendarLink(c) {
    const t = new Date(ts(c.appointment)), stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const clean = (v) => String(v || "").replace(/[\\;,]/g, (m) => "\\" + m).replace(/\r?\n/g, " ");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Talk Shops//EN", "BEGIN:VEVENT", `UID:${stamp(t)}-${Math.random().toString(36).slice(2)}@talkshops.app`, `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(t)}`, `DTEND:${stamp(new Date(t.getTime() + 3600000))}`, `SUMMARY:${clean(c.shop.name)} appointment${c.vehicle ? " (" + clean(c.vehicle) + ")" : ""}`,
      ...(c.shop.address ? [`LOCATION:${clean(c.shop.address)}`] : []), ...(c.shop.phone ? [`DESCRIPTION:${clean(c.shop.phone)}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }
  async function customerAppt(t) {
    const tok = A.customerToken?.(), es = lang === "es";
    if (!tok) return;
    const base = "shop/c/" + encodeURIComponent(tok);
    const done = (c) => { A.setCustomer?.(c); A.renderCustomer(); document.getElementById("gr-c-appt")?.scrollIntoView({ block: "nearest" }); };
    if (t.hasAttribute("data-gr-c-cancel")) { Object.assign(mv, { open: false, err: "", slot: "" }); A.renderCustomer(); return; }
    mv.busy = true; mv.err = ""; A.renderCustomer();
    try {
      if (t.hasAttribute("data-gr-c-confirm")) { const c = await A.api("POST", base + "/confirm-time", {}); mv.busy = false; done(c); A.toast?.(es ? "¡Gracias! Su cita está confirmada." : "Thanks! You're confirmed."); return; }
      if (t.hasAttribute("data-gr-c-move")) { mv.info = await A.api("GET", base + "/times"); Object.assign(mv, { open: true, busy: false, day: "", month: "", slot: "" }); A.renderCustomer(); return; }
      if (t.hasAttribute("data-gr-c-save") && mv.slot) {
        const c = await A.api("POST", base + "/reschedule", { slot: mv.slot });
        Object.assign(mv, { open: false, busy: false, slot: "" }); done(c); A.toast?.(es ? "Listo. Cambiamos su cita." : "Done. Your appointment moved."); return;
      }
    } catch (e) {
      mv.busy = false; mv.err = e.message;
      // A time someone else just took: show the fresh list.
      if (mv.open) { try { mv.info = await A.api("GET", base + "/times"); } catch { /* keep the old list */ } }
    }
    mv.busy = false; A.renderCustomer();
  }
  // The customer's change-time picker: open times from the server, picked the same way as on the booking page.
  const mv = { open: false, busy: false, err: "", info: null, day: "", month: "", slot: "" };
  function customerCards(c) {
    let h = "";
    if (c.appointment) {
      const when = esc(new Date(ts(c.appointment)).toLocaleString(dateLocale(), { ...(c.zone ? { timeZone: c.zone } : {}), weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\.$/, ""));
      const es = lang === "es", L = (en, sp) => (es ? sp : en);
      h += `<div class="c-card gr-appt" id="gr-c-appt"><h3>${c.apptWaiting ? L("Your appointment moved", "Su cita cambió") : tsT("Your appointment")}</h3>
        <p style="margin:0">${c.apptWaiting ? L(`${esc(c.shop.name)} moved your appointment to <b>${when}</b>. Does that work?`, `${esc(c.shop.name)} cambió su cita al <b>${when}</b>. ¿Le queda bien?`) : tsT("{0} confirmed your appointment for {1}.", esc(c.shop.name), when)}</p>
        ${mv.open && mv.info ? `<div class="gr-c-move">${slotPicker(L, es, mv)}${mv.err ? `<p class="gr-c-err" role="alert">${esc(mv.err)}</p>` : ""}
          <div class="btn-row"><button type="button" class="btn primary sm" data-gr-c-save ${mv.slot && !mv.busy ? "" : "disabled"}>${mv.busy ? L("Saving…", "Guardando…") : L("Change to this time", "Cambiar a esta hora")}</button><button type="button" class="btn sm" data-gr-c-cancel>${L("Keep my time", "Mantener mi hora")}</button></div></div>`
        : `${mv.err ? `<p class="gr-c-err" role="alert">${esc(mv.err)}</p>` : ""}<div class="btn-row" style="margin-top:10px">${c.apptWaiting ? `<button type="button" class="btn primary sm" data-gr-c-confirm ${mv.busy ? "disabled" : ""}>${L("Yes, that works", "Sí, me queda bien")}</button>` : `<a class="btn sm" download="appointment.ics" href="${calendarLink(c)}">${tsT("Add to calendar")}</a>`}
          ${c.canReschedule ? `<button type="button" class="btn sm" data-gr-c-move ${mv.busy ? "disabled" : ""}>${c.apptWaiting ? L("Pick a different time", "Elegir otra hora") : L("Change time", "Cambiar la hora")}</button>` : c.shop.phone ? `<a class="btn sm" href="tel:${esc(c.shop.phone)}">${L("Call to change", "Llamar para cambiarla")}</a>` : ""}</div>`}</div>`;
    }
    if (c.review?.url) h += `<div class="c-card gr-review"><h3>${tsT("How did we do?")}</h3><p style="margin:0 0 10px">${tsT("Thanks for choosing {0}. If we earned it, a quick review helps a small shop a lot.", esc(c.shop.name))}</p>
      <a class="btn primary" href="${esc(c.review.url)}" target="_blank" rel="noopener" data-gr-review>${tsT("Leave a review")} ★</a></div>`;
    return h;
  }

  // ==================== Online booking: the public page (/?book=<token>) ====================
  const bk = { token: "", info: null, err: "", sent: false, busy: false, day: "", month: "", slot: "", draft: null, result: null };
  /** Keeps what the customer typed when the page redraws (picking a time, sending, an error). */
  function keepDraft() {
    const f = document.getElementById("grBookForm");
    if (!f) return;
    bk.draft = {};
    for (const el of f.elements) if (el.name && el.type !== "submit") bk.draft[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  function restoreDraft() {
    const f = document.getElementById("grBookForm");
    if (!f || !bk.draft) return;
    for (const [k, v] of Object.entries(bk.draft)) { const el = f.elements[k]; if (!el || el.type === "hidden") continue; if (el.type === "checkbox") el.checked = v; else el.value = v; }
  }
  // Appointment times show in the shop's time zone, which is where the customer is going.
  const slotDay = (day, es, long) => new Date(day + "T12:00:00Z").toLocaleDateString(es ? "es-US" : "en-US", { timeZone: "UTC", weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric" });
  const slotTime = (hm) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  function slotLabel(at, es, st = bk) {
    for (const d of st.info?.slots || []) for (const t of d.times) if (t.at === at) return `${slotDay(d.day, es, true)}, ${slotTime(t.time)}`;
    const z = st.info?.zone;
    return new Date(at).toLocaleString(es ? "es-US" : "en-US", { timeZone: z || undefined, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function slotPicker(L, es, st = bk) {
    const days = st.info.slots || [];
    if (st.info.paused) return `<div class="full gr-slots-none"><b>${L(`${esc(st.info.shop.name)} is booked up and isn't taking new appointments online right now.`, `${esc(st.info.shop.name)} está completo y no está tomando citas nuevas en línea por ahora.`)}</b> ${st.info.shop.phone ? L("Please call ", "Llame al ") + `<a href="tel:${esc(st.info.shop.phone)}">${esc(st.info.shop.phone)}</a>.` : L("Please check back soon.", "Vuelva a intentarlo pronto.")}</div>`;
    if (!days.length) return `<div class="full gr-slots-none"><b>${L("No open times right now.", "No hay horarios disponibles por ahora.")}</b> ${st.info.shop.phone ? L("Please call ", "Llame al ") + `<a href="tel:${esc(st.info.shop.phone)}">${esc(st.info.shop.phone)}</a>.` : L("Please call the shop.", "Llame al taller.")}</div>`;
    if (!days.some((d) => d.day === st.day)) st.day = days[0].day;
    const today = days.find((d) => d.day === st.day);
    if (st.slot && !days.some((d) => d.times.some((t) => t.at === st.slot))) st.slot = "";
    return `<div class="full gr-slots" data-gr-pick="${st === bk ? "book" : "move"}">${slotCalendar(L, es, days, st)}
      <p class="gr-cal-day">${esc(slotDay(st.day, es, true))}</p>
      <div class="gr-slot-times" role="group" aria-label="${L("Time", "Hora")}">${today.times.map((t) => `<button type="button" class="gr-slot-time" data-gr-slot="${esc(t.at)}" aria-pressed="${t.at === st.slot}">${esc(slotTime(t.time))}</button>`).join("")}</div>
      <input type="hidden" name="slot" value="${esc(st.slot)}">
      ${st.slot ? `<p class="gr-slot-pick">${L("Your time", "Su hora")}: <b>${esc(slotLabel(st.slot, es, st))}</b></p>` : `<p class="muted gr-slot-pick">${L("Pick a time above.", "Elija una hora arriba.")}</p>`}</div>`;
  }
  const addDay = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  /** A month calendar of the open days: days with times are tappable, closed or full days are faded. */
  function slotCalendar(L, es, days, st = bk) {
    const open = new Map(days.map((d) => [d.day, d.times.length]));
    const months = [];
    for (let m = days[0].day.slice(0, 7); m <= days[days.length - 1].day.slice(0, 7); m = addDay(m + "-28", 7).slice(0, 7)) months.push(m);
    if (!months.includes(st.month)) st.month = st.day.slice(0, 7);
    const i = months.indexOf(st.month), loc = es ? "es-US" : "en-US";
    const first = st.month + "-01", lead = new Date(first + "T12:00:00Z").getUTCDay();
    const title = new Date(first + "T12:00:00Z").toLocaleDateString(loc, { timeZone: "UTC", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
    // 2023-01-01 was a Sunday, so these are the weekday names in order.
    const heads = [0, 1, 2, 3, 4, 5, 6].map((n) => new Date(Date.UTC(2023, 0, 1 + n, 12)).toLocaleDateString(loc, { timeZone: "UTC", weekday: "narrow" }));
    const cells = Array.from({ length: lead }, () => `<span class="gr-cal-pad"></span>`);
    for (let day = first; day.startsWith(st.month); day = addDay(day, 1)) {
      const n = open.get(day), num = Number(day.slice(8));
      cells.push(n ? `<button type="button" class="gr-cal-open" data-gr-day="${esc(day)}" aria-pressed="${day === st.day}" aria-label="${esc(slotDay(day, es, true))}: ${n} ${n === 1 ? L("open time", "hora libre") : L("open times", "horas libres")}"><b>${num}</b><small>${n}</small></button>`
        : `<span class="gr-cal-off" aria-hidden="true">${num}</span>`);
    }
    const nav = (to, label, txt) => `<button type="button" class="gr-cal-nav" ${to ? `data-gr-month="${esc(to)}"` : "disabled"} aria-label="${label}">${txt}</button>`;
    return `<div class="gr-cal" role="group" aria-label="${L("Open days", "Días disponibles")}">
      <div class="gr-cal-head">${nav(months[i - 1], L("Previous month", "Mes anterior"), "‹")}<b>${esc(title)}</b>${nav(months[i + 1], L("Next month", "Mes siguiente"), "›")}</div>
      <div class="gr-cal-grid">${heads.map((h) => `<span class="gr-cal-wd" aria-hidden="true">${esc(h)}</span>`).join("")}${cells.join("")}</div>
      <p class="muted gr-cal-key">${L("Numbers show how many times are open that day. Faded days are closed or full.", "Los números indican cuántas horas quedan libres ese día. Los días claros están cerrados o llenos.")}</p></div>`;
  }
  /** Fresh open times every minute (and when the page comes back into view), so times others just booked drop out. */
  let bkTimer = 0;
  async function refreshTimes() {
    if (!bk.info || !Array.isArray(bk.info.slots) || bk.sent || bk.busy || document.hidden) return;
    try {
      const fresh = await A.api("GET", "shop/book/" + encodeURIComponent(bk.token));
      if (bk.sent || bk.busy || JSON.stringify(fresh.slots) === JSON.stringify(bk.info.slots) && !!fresh.paused === !!bk.info.paused) return;
      const had = bk.slot;
      keepDraft();
      bk.info = { ...bk.info, slots: fresh.slots, paused: fresh.paused };
      renderBooking(bk.token);
      if (had && !bk.slot) { bk.err = lang === "es" ? "La hora que eligió se acaba de ocupar. Elija otra." : "The time you picked was just taken. Please pick another one."; renderBooking(bk.token); }
    } catch { /* try again next minute */ }
  }
  async function renderBooking(token) {
    bk.token = token;
    if (!bkTimer) { bkTimer = setInterval(refreshTimes, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshTimes(); }); }
    const app = $("#app");
    $("#shopChrome") && ($("#shopChrome").hidden = true);
    if (!bk.info && !bk.err) {
      app.innerHTML = `<div class="loading">Loading…</div>`;
      try { bk.info = await A.api("GET", "shop/book/" + encodeURIComponent(token)); bk.shownAt = Date.now(); } catch (e) { bk.err = e.message; }
    }
    if (bk.err && !bk.info) { app.innerHTML = `<div class="loading"><p>${esc(bk.err)}</p></div>`; return; }
    const s = bk.info.shop;
    setLang(store.get("ts-book-lang") || ((navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en"));
    applyColor(s.brand?.color);
    const es = lang === "es", L = (en, sp) => (es ? sp : en);
    document.title = s.name + " · " + L("Book a visit", "Pedir una cita");
    const slots = Array.isArray(bk.info.slots), auto = slots && bk.info.auto;
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const min = today.toISOString().slice(0, 10), max = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    app.innerHTML = `<div class="cust-page gr-book-page">
      <div class="c-head">${s.brand?.logo ? `<img class="gr-logo" src="${esc(s.brand.logo)}" alt="">` : ""}<small>${esc(s.name)}</small><h2>${auto ? L("Book an appointment", "Haga una cita") : L("Request an appointment", "Pida una cita")}</h2>
        <div style="font-size:14px;margin-top:4px">${esc([s.phone, s.hours].filter(Boolean).join(" · "))}</div></div>
      <div class="c-body">
      ${bk.sent && bk.result?.confirmed ? `<div class="c-card gr-appt"><h3>${L("You're booked", "Su cita está confirmada")}</h3><p style="margin:0">${L(`${esc(s.name)} has you down for <b>${esc(slotLabel(bk.result.at, false))}</b>.`, `${esc(s.name)} lo espera el <b>${esc(slotLabel(bk.result.at, true))}</b>.`)}${s.phone ? " " + L("To change it, call ", "Para cambiarla llame al ") + `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>.` : ""}</p>
        <div class="btn-row" style="margin-top:10px"><a class="btn sm" download="appointment.ics" href="${calendarLink({ appointment: bk.result.at, shop: s, vehicle: bk.result.vehicle })}">${L("Add to calendar", "Agregar al calendario")}</a>${bk.result.link ? `<a class="btn primary sm" href="${esc(bk.result.link)}">${L("See your visit and add photos", "Vea su visita y agregue fotos")}</a>` : ""}</div></div>`
      : bk.sent && bk.result?.at ? `<div class="c-card"><h3>${L("Request sent", "Solicitud enviada")}</h3><p style="margin:0">${L(`Thanks! You asked for <b>${esc(slotLabel(bk.result.at, false))}</b>. ${esc(s.name)} will confirm with you soon.`, `¡Gracias! Pidió el <b>${esc(slotLabel(bk.result.at, true))}</b>. ${esc(s.name)} se lo confirmará pronto.`)}${s.phone ? " " + L("Questions? Call ", "¿Preguntas? Llame al ") + `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>.` : ""}</p></div>`
      : bk.sent ? `<div class="c-card"><h3>${L("Request sent", "Solicitud enviada")}</h3><p style="margin:0">${L(`Thanks! ${esc(s.name)} will confirm a time with you soon.`, `¡Gracias! ${esc(s.name)} le confirmará una hora pronto.`)}${s.phone ? " " + L("Need it sooner? Call ", "¿Lo necesita antes? Llame al ") + `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>.` : ""}</p></div>` : `
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
        ${slots ? `<h3 class="full" style="margin:6px 0 0">${L("Pick a time", "Elija una hora")}</h3>${slotPicker(L, es)}` : `<label class="field">${L("Day you'd like", "Día que prefiere")}<input name="day" type="date" required min="${min}" max="${max}" value="${min}"></label>
        <label class="field">${L("Time of day", "Hora del día")}<select name="time"><option value="morning">${L("Morning", "Mañana")}</option><option value="afternoon">${L("Afternoon", "Tarde")}</option><option value="any">${L("Any time", "Cualquier hora")}</option></select></label>`}
        <label class="gr-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="chk full"><input type="checkbox" name="consent" checked> ${L(`${esc(s.name)} may text or email me about this appointment and my repair. Reply STOP to opt out.`, `${esc(s.name)} puede enviarme mensajes o correos sobre esta cita y mi reparación. Responda STOP para no recibir más.`)}</label>
        ${bk.err ? `<p class="form-err full" role="alert">${esc(bk.err)}</p>` : ""}
        <button class="btn primary full" type="submit" ${bk.busy || (slots && !(bk.info.slots || []).length) ? "disabled" : ""}>${bk.busy ? L("Sending…", "Enviando…") : auto ? L("Book this time", "Reservar esta hora") : slots ? L("Request this time", "Pedir esta hora") : L("Send request", "Enviar solicitud")}</button>
        <p class="muted full" style="margin:0;font-size:13px">${auto ? L("You'll get a confirmation right away.", "Recibirá la confirmación enseguida.") : slots ? L("The shop confirms your time.", "El taller confirma su hora.") : L("This is a request. The shop confirms the exact time.", "Esto es una solicitud. El taller confirma la hora exacta.")}</p>
      </form>`}
      <p class="cust-top gr-lang"><button type="button" class="linkbtn" data-gr-book-lang="${es ? "en" : "es"}">${es ? "View in English" : "Ver en español"}</button></p>
      <p class="cust-top"><a href="/privacy.html">${tsT("Privacy Policy")}</a> · <a href="/terms.html#sms">${tsT("Text Terms")}</a></p>
      </div></div>`;
    restoreDraft();
  }
  async function sendBooking(f) {
    const g = (k) => (f.elements[k]?.value || "").trim();
    const slots = Array.isArray(bk.info?.slots);
    if (slots && !bk.slot) { bk.err = lang === "es" ? "Elija una hora para su cita." : "Pick a time for your appointment."; keepDraft(); renderBooking(bk.token); return; }
    const payload = {
      customer: { name: g("name"), phone: g("phone"), email: g("email"), preference: g("preference"), consent: f.elements.consent.checked, lang },
      vehicle: { year: g("year"), make: g("make"), model: g("model") }, plate: g("plate"), concern: g("concern"), website: g("website"),
      ...(slots ? { slot: bk.slot } : { day: g("day"), time: g("time") }),
      elapsed: bk.shownAt ? Date.now() - bk.shownAt : null,
    };
    keepDraft();
    bk.busy = true; bk.err = ""; renderBooking(bk.token);
    try {
      bk.result = await A.api("POST", "shop/book/" + encodeURIComponent(bk.token), payload);
      if (bk.result) bk.result.vehicle = [payload.vehicle.year, payload.vehicle.make, payload.vehicle.model].filter(Boolean).join(" ");
      bk.sent = true; bk.draft = null;
    } catch (e) {
      bk.err = e.message;
      // Someone else just took that time: show the times that are still open.
      if (slots) { try { const fresh = await A.api("GET", "shop/book/" + encodeURIComponent(bk.token)); bk.info = { ...bk.info, slots: fresh.slots }; } catch { /* keep the old list */ } }
    }
    bk.busy = false; renderBooking(bk.token);
    window.scrollTo(0, 0);
  }

  // ==================== Bay: booking requests ====================
  async function loadBookings() {
    if (!A || !A.shop()) return;
    try { ui.bookings = (await A.api("GET", "shop/bookings")).rows || []; } catch { ui.bookings = ui.bookings || []; }
    redrawBookings();
  }
  function redrawBookings() { const el = document.getElementById("gr-bay"); if (el) el.outerHTML = bookingsPanel(); }
  const partOfDay = (t, es) => ({ morning: es ? "por la mañana" : "morning", afternoon: es ? "por la tarde" : "afternoon", any: es ? "a cualquier hora" : "any time" }[t] || t);
  const dayText = (d, loc = "en-US") => new Date(d + "T12:00:00").toLocaleDateString(loc, { weekday: "short", month: "short", day: "numeric" });
  function defaultWhen(b) {
    if (b.data.slot) { const d = new Date(b.data.slot); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
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
  /** Upcoming appointments on the Bay: booked cars not checked in yet, from an hour ago through the next week. */
  function appointmentsPanel() {
    const from = Date.now() - 3600000, to = Date.now() + 7 * 86400000;
    const list = (A?.jobs?.() || []).filter((j) => j.stage !== "picked_up" && !j.closed && j.appointment && ts(j.appointment) >= from && ts(j.appointment) < to)
      .sort((a, b) => ts(a.appointment) - ts(b.appointment));
    if (!list.length) return "";
    const dayKey = (t) => new Date(t).toDateString(), todayKey = dayKey(Date.now()), tomorrowKey = dayKey(Date.now() + 86400000);
    const groups = [];
    for (const j of list) { const k = dayKey(ts(j.appointment)); if (groups.at(-1)?.k !== k) groups.push({ k, t: ts(j.appointment), rows: [] }); groups.at(-1).rows.push(j); }
    const label = (g) => g.k === todayKey ? "Today" : g.k === tomorrowKey ? "Tomorrow" : new Date(g.t).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const today = list.filter((j) => dayKey(ts(j.appointment)) === todayKey).length;
    return `<section class="gr-appts" id="gr-appts"><div class="gr-bk-h"><h3>Appointments <span class="pill">${list.length}</span></h3><small class="muted">${today ? `${today} today · ` : ""}next 7 days</small></div>
      ${groups.map((g) => `<div class="gr-appt-day"><h4>${esc(label(g))}</h4><ul>${g.rows.map((j) => `<li><button type="button" class="gr-appt-row" data-open="${esc(j.id)}"><b class="gr-appt-t">${esc(new Date(ts(j.appointment)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</b><span>${esc(j.customer?.name || j.ro)}</span><span class="muted">${esc(vehicle(j.vehicle) || "")}</span></button></li>`).join("")}</ul></div>`).join("")}
    </section>`;
  }
  /** Upcoming appointments and booking requests waiting for the shop, at the top of the Bay. */
  function bookingsPanel() { return `<div id="gr-bay">${appointmentsPanel()}${requestsPanel()}</div>`; }
  function requestsPanel() {
    const rows = ui.bookings || [];
    if (!rows.length) return "";
    return `<section class="gr-bookings" id="gr-bookings"><div class="gr-bk-h"><h3>Booking Requests <span class="pill warn">${rows.length}</span></h3><small class="muted">From your online booking link</small></div>
      <ul>${rows.map((b) => {
        const d = b.data, c = d.customer, open = ui.bkOpen === b.id;
        return `<li data-gr-bk="${esc(b.id)}"><div class="gr-bk-main"><b>${esc(c.name)}</b>${c.lang === "es" ? ' <span class="pill">Español</span>' : ""} · ${esc(vehicle(d.vehicle))}${d.plate ? " · " + esc(d.plate) : ""}
          <div class="gr-bk-when">${d.slot ? `Picked <b>${esc(whenText(d.slot, false))}</b>` : `Wants <b>${esc(dayText(d.day))}</b>, ${esc(partOfDay(d.time))}`}</div>
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
    const appt = j.stage === "invited" && j.appointment ? `<span class="pill gr-appt-pill" title="Appointment">📅 ${esc(new Date(ts(j.appointment)).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}${j.reschedule?.waiting ? " · waiting on customer" : ""}</span>` : "";
    return clock + appt;
  }

  // ==================== Car sheet: time clock and review request ====================
  const hrs = (h) => h < 0.1 ? Math.round(h * 60) + " min" : (Math.round(h * 10) / 10) + " h";
  function clockHours(list, id) { return (list || []).filter((e) => !id || e.by.id === id).reduce((a, e) => a + Math.max(0, (e.end ? ts(e.end) : Date.now()) - ts(e.start)), 0) / 3600000; }
  // ==================== Car sheet: move the appointment ====================
  const hm2 = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  /** The instant a shop-local day and time happen in the zone (same as the server's zonedTime). */
  function zonedAt(day, time, zone) {
    const off = (at) => { const p = zoneParts(at, zone); return Date.parse(p.day + "T" + hm2(p.min) + ":00Z") - Math.floor(at / 60000) * 60000; };
    const g = Date.parse(`${day}T${time}:00Z`);
    return g - off(g - off(g));
  }
  const apptText = (at, zone) => new Date(ts(at)).toLocaleString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  function apptSection(j) {
    if (j.stage !== "invited" || j.closed) return "";
    const sc = A.shop()?.grow?.schedule, zone = sc?.zone || browserZone(), f = esc(first(j.customer?.name) || "the customer"), r = j.reschedule;
    const status = !j.appointment ? "" : r?.waiting ? `<span class="pill warn">Waiting for ${f} to confirm</span>`
      : r?.confirmedAt && r.by === "Customer" ? `<span class="pill ok">${f} picked this time</span>` : r?.confirmedAt ? `<span class="pill ok">${f} confirmed</span>` : "";
    let opts = "";
    if (sc) {
      const appts = shopCars().appts, own = j.appointment ? appts.indexOf(new Date(ts(j.appointment)).toISOString()) : -1;
      if (own >= 0) appts.splice(own, 1);
      const days = openSlots({ ...sc, paused: false, notice: 0 }, new Date(), appts, sc.capacity ? dayLoad(sc, new Date(), shopCars().cars, appts) : undefined);
      opts = days.flatMap((d) => d.times.map((t) => `<option value="${esc(d.day + "T" + t.time)}">${esc(apptText(t.at, zone))}</option>`)).slice(0, 80).join("");
    }
    const cur = j.appointment ? (() => { const p = zoneParts(ts(j.appointment), zone); return p.day + "T" + hm2(p.min); })() : "";
    const canText = !!j.customer?.consent;
    return `<section class="sec gr-appt-move" data-gr-job="${esc(j.id)}"><h3>Appointment</h3>
      <p style="margin:0 0 8px">${j.appointment ? `<b>${esc(apptText(j.appointment, zone))}</b> ${status}` : `<span class="muted">No appointment time yet.</span>`}</p>
      <div class="gr-appt-form">
        ${opts ? `<label class="field">Open times<select id="gr-appt-pick"><option value="">Pick an open time</option>${opts}</select></label>` : ""}
        <label class="field">${opts ? "Or any time" : "Day and time"}<input type="datetime-local" id="gr-appt-when" step="900" value="${esc(cur)}"></label>
      </div>
      <label class="chk"><input type="checkbox" id="gr-appt-text" ${canText ? "checked" : "disabled"}> ${canText ? (j.appointment ? `Text ${f} the new time. They reply YES to confirm, or pick another open time from their link.` : `Text ${f} the appointment time.`) : `${f} hasn't agreed to texts, so no text goes out.`}</label>
      <input type="hidden" id="gr-appt-zone" value="${esc(zone)}">
      <div class="btn-row"><button type="button" class="btn sm primary" data-gr-appt-move>${j.appointment ? "Move appointment" : "Set appointment"}</button></div></section>`;
  }
  function sheetSection(j) {
    const appt = apptSection(j);
    if (j.stage === "invited" && !j.intakeReceived) return appt;
    let h = appt;
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
        <p class="muted" style="margin:0">Put this link on your website, Google Business profile or social pages. ${g.schedule ? "Customers see your open times and pick one" : "Customers ask for a day; you confirm a time"}, and the car lands on your Bay with their details filled in. Customers can book in English or Spanish.</p>
        <label class="chk"><input type="checkbox" data-gr-grow="bookingOn" ${g.bookingOn ? "checked" : ""}> Take booking requests online</label>
        ${g.bookingOn && link ? `<div class="gr-link"><input readonly value="${esc(link)}" aria-label="Your booking link" id="gr-book-link"><button type="button" class="btn sm" data-gr-copy="#gr-book-link">Copy</button><a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>
          <label class="field">Note on your booking page <small class="muted">(optional)</small><input maxlength="300" id="gr-book-note" value="${esc(g.bookingNote || "")}" placeholder="e.g. Drop-offs from 7:30am. We call to confirm."></label>
          <div class="btn-row"><button type="button" class="btn sm" data-gr-save-note>Save note</button><button type="button" class="linkbtn" data-gr-new-link>Make a new link (the old one stops working)</button></div>
          ${schedulePanel(s)}` : ""}
      </section>
      <section class="panel gr-panel" id="gr-notify"><h2>Reminders and Morning Email</h2>
        <label class="field">Shop address <small class="muted">(customers get a Directions button)</small><input id="gr-address" maxlength="160" autocomplete="street-address" value="${esc(g.address || "")}" placeholder="e.g. 1200 Main St, Eau Claire, WI"></label>
        <label class="field">If a customer hasn't answered an estimate<select id="gr-nudge">${[[0, "Don't remind them"], [2, "Text a reminder after 2 hours"], [4, "Text a reminder after 4 hours"], [24, "Text a reminder the next day"]].map(([v, l]) => `<option value="${v}" ${(g.nudgeHours || 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <p class="muted" style="margin:0;font-size:13px">One text, only to customers who agreed to texts, and it's skipped if they answer first. Counts toward your texts.</p>
        <label class="chk"><input type="checkbox" id="gr-digest" ${g.digest ? "checked" : ""}> Morning summary email at 7am: cars in, estimates waiting, money approved, late promises${s.email ? ` (to ${esc(s.email)})` : " (to the owner's sign-in email; set a Shop email above to change it)"}</label>
        <div class="btn-row"><button type="button" class="btn sm" data-gr-save-notify>Save</button></div>
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
  // ==================== Appointment hours (owners) ====================
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"; } catch { return "America/Chicago"; } };
  function schedulePanel(s) {
    const cur = s.grow?.schedule, on = !!cur || ui.schedOpen;
    const todayIso = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (ui.schedClosed == null) ui.schedClosed = (cur?.closed || []).filter((d) => d >= todayIso);
    const dayOff = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const sc = cur || { zone: s.smartSchedule?.zone || browserZone(), week: [null, ["08:00", "17:00"], ["08:00", "17:00"], ["08:00", "17:00"], ["08:00", "17:00"], ["08:00", "17:00"], null], step: 60, perSlot: 1, notice: 2, ahead: 14, auto: false, reminder: true };
    const opt = (list, v, fmt) => list.map(([val, l]) => `<option value="${val}" ${v === val ? "selected" : ""}>${esc(fmt ? fmt(l) : l)}</option>`).join("");
    return `<div class="gr-sched" id="gr-sched"><h3>Appointment hours</h3>
      <label class="chk"><input type="checkbox" id="gr-sched-on" ${on ? "checked" : ""}> Show open times so customers pick an exact appointment</label>
      ${cur ? `<label class="chk gr-sched-pause"><input type="checkbox" id="gr-sched-pause" ${cur.paused ? "checked" : ""}> <span><b>We're booked up: pause new appointments.</b> Customers see a note to call you. Appointments already booked stay on your Bay.</span></label>` : ""}
      ${on ? `<p class="muted" style="margin:0;font-size:13px">Times already booked, or waiting on your OK, are hidden. Times are in ${esc(sc.zone.replace(/_/g, " "))}.</p>
      <div class="gr-sched-week">${DAYS.map((name, i) => { const d = sc.week[i]; return `<div class="gr-sched-day"><label class="chk"><input type="checkbox" data-sched-day="${i}" ${d ? "checked" : ""}> ${name}</label>
        <input type="time" step="900" data-sched-open="${i}" value="${esc(d ? d[0] : "08:00")}" aria-label="${name} opens"><span class="muted">to</span><input type="time" step="900" data-sched-close="${i}" value="${esc(d ? d[1] : "17:00")}" aria-label="${name} closes"></div>`; }).join("")}</div>
      <div class="gr-sched-opts">
        <label class="field">Appointments start every<select id="gr-sched-step">${opt([[15, "15 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "hour"], [90, "90 minutes"], [120, "2 hours"]], sc.step)}</select></label>
        <label class="field">Cars at the same time<select id="gr-sched-per">${opt([1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, String(n)]), sc.perSlot)}</select></label>
        <label class="field">Notice you need<select id="gr-sched-notice">${opt([[0, "None"], [1, "1 hour"], [2, "2 hours"], [4, "4 hours"], [12, "12 hours"], [24, "1 day"], [48, "2 days"]], sc.notice)}</select></label>
        <label class="field">Customers can book up to<select id="gr-sched-ahead">${opt([[7, "1 week ahead"], [14, "2 weeks ahead"], [21, "3 weeks ahead"], [30, "30 days ahead"], [60, "60 days ahead"]], sc.ahead)}</select></label>
        <label class="field">Break between appointments<select id="gr-sched-gap">${opt([[0, "None (back to back)"], [5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"], [20, "20 minutes"], [30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"]], sc.gap || 0)}</select></label>
        <label class="field">Most appointments in a day<input type="number" id="gr-sched-daymax" min="1" max="100" inputmode="numeric" placeholder="No limit" value="${sc.dayMax || ""}"></label>
      </div>
      <div class="gr-sched-lunch"><label class="chk"><input type="checkbox" id="gr-sched-lunch-on" ${sc.lunch ? "checked" : ""}> Daily break (lunch): no appointments from</label>
        <input type="time" step="900" id="gr-sched-lunch-from" value="${esc(sc.lunch?.[0] || "12:00")}" aria-label="Break starts"><span class="muted">to</span><input type="time" step="900" id="gr-sched-lunch-to" value="${esc(sc.lunch?.[1] || "13:00")}" aria-label="Break ends"></div>
      <p class="muted gr-sched-preview" style="margin:0;font-size:13px">${esc(previewTimes(sc))}</p>
      <div class="gr-sched-smart"><h4>Smart scheduling <small class="muted">(optional)</small></h4>
        <p class="muted" style="margin:0;font-size:13px">Set the most cars you want in the shop at once. Talk Shops counts the cars on your Bay (using each one's promised pickup time) plus booked appointments, and closes any day that's expected to be full.</p>
        <div class="gr-sched-opts">
          <label class="field">Most cars in the shop at once<input type="number" id="gr-sched-cap" min="1" max="200" inputmode="numeric" placeholder="No limit" value="${sc.capacity || ""}"></label>
          <label class="field">A booked car usually stays<select id="gr-sched-stay">${opt([[1, "Same day"], [2, "2 days"], [3, "3 days"], [5, "5 days"], [7, "A week"]], sc.stay || 1)}</select></label>
        </div>
        ${cur?.capacity ? loadStrip(cur) : ""}
      </div>
      <div class="gr-sched-off"><label class="field">Days off <small class="muted">(holidays, vacation, days you're full)</small><span class="gr-sched-off-add"><input type="date" id="gr-sched-off-day" min="${todayIso}"><button type="button" class="btn sm" data-gr-sched-off-add>Add day</button></span></label>
        ${ui.schedClosed.length ? `<ul class="gr-sched-off-list">${ui.schedClosed.map((d) => `<li>${esc(dayOff(d))}<button type="button" class="linkbtn" data-gr-sched-off-del="${esc(d)}" aria-label="Remove ${esc(dayOff(d))}">Remove</button></li>`).join("")}</ul>` : ""}</div>
      <label class="chk"><input type="checkbox" id="gr-sched-auto" ${sc.auto ? "checked" : ""}> Book them right away (no need to confirm each one). Leave off to confirm each request yourself.</label>
      <label class="chk"><input type="checkbox" id="gr-sched-remind" ${sc.reminder ? "checked" : ""}> Text customers a reminder the day before (only those who agreed to texts; counts toward your texts)</label>
      <input type="hidden" id="gr-sched-zone" value="${esc(sc.zone)}">
      <div class="btn-row"><button type="button" class="btn sm primary" data-gr-sched-save>Save appointment hours</button></div>` : ""}
    </div>`;
  }
  /** "Start times on a Monday: 8:00 AM, 9:15 AM, ..." so the owner sees what the gap and break do. */
  function previewTimes(sc) {
    const i = sc.week.findIndex(Boolean);
    if (i < 0) return "";
    const h = sc.week[i], mn = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5), out = [];
    const lunch = sc.lunch ? [mn(sc.lunch[0]), mn(sc.lunch[1])] : null;
    for (let m = mn(h[0]); m + sc.step <= mn(h[1]) && out.length < 40; m += sc.step + (sc.gap || 0)) {
      if (lunch && m < lunch[1] && m + sc.step > lunch[0]) { m = lunch[1] - sc.step - (sc.gap || 0); continue; }
      out.push(slotTime(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0")));
    }
    return `Start times on a ${DAYS[i]}: ${out.join(", ")}${sc.dayMax ? `. Up to ${sc.dayMax} a day.` : "."}`;
  }
  /** Cars on the Bay and upcoming appointments, in the shape the load count needs. */
  function shopCars() {
    const jobs = (A?.jobs?.() || []).filter((j) => !j.closed && j.stage !== "picked_up");
    return { cars: jobs.filter((j) => j.stage !== "invited" && !j.appointment).map((j) => ({ stage: j.stage, promised: j.promised, since: (j.events || []).find((e) => e.stage === "checked_in")?.t || j.createdAt })),
      appts: [...jobs.filter((j) => j.appointment && ts(j.appointment) >= Date.now() - 86400000).map((j) => new Date(ts(j.appointment)).toISOString()), ...(ui.bookings || []).filter((b) => b.data.slot).map((b) => b.data.slot)] };
  }
  /** The next 7 days against the car limit, so the owner sees what customers can book. */
  function loadStrip(sc) {
    const { cars, appts } = shopCars(), load = dayLoad(sc, new Date(), cars, appts), today = zoneParts(Date.now(), sc.zone).day;
    return `<div class="gr-load" aria-label="Expected cars in the shop, next 7 days">${Array.from({ length: 7 }, (_, i) => {
      const day = plusDays(today, i), n = load[day] || 0, full = n >= sc.capacity;
      return `<div class="gr-load-day ${full ? "is-full" : ""}"><small>${esc(i === 0 ? "Today" : new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }))}</small><b>${n}/${sc.capacity}</b><small>${full ? "Full" : "Open"}</small></div>`;
    }).join("")}</div>`;
  }
  function readSchedule() {
    const n = (id) => Number($(id).value);
    const week = DAYS.map((_, i) => $(`[data-sched-day="${i}"]`).checked ? [$(`[data-sched-open="${i}"]`).value, $(`[data-sched-close="${i}"]`).value] : null);
    return { zone: $("#gr-sched-zone").value, week, step: n("#gr-sched-step"), perSlot: n("#gr-sched-per"), notice: n("#gr-sched-notice"), ahead: n("#gr-sched-ahead"), auto: $("#gr-sched-auto").checked, reminder: $("#gr-sched-remind").checked, closed: ui.schedClosed || [], paused: !!$("#gr-sched-pause")?.checked, capacity: Math.round(Number($("#gr-sched-cap").value)) || 0, stay: n("#gr-sched-stay"),
      gap: n("#gr-sched-gap"), dayMax: Math.round(Number($("#gr-sched-daymax").value)) || 0, lunch: $("#gr-sched-lunch-on").checked ? [$("#gr-sched-lunch-from").value, $("#gr-sched-lunch-to").value] : null };
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
    const t = e.target.closest("[data-gr-day],[data-gr-month],[data-gr-slot],[data-gr-c-confirm],[data-gr-c-move],[data-gr-c-cancel],[data-gr-c-save],[data-gr-sched-save],[data-gr-sched-off-add],[data-gr-sched-off-del],[data-gr-lang],[data-gr-book-lang],[data-gr-review],[data-gr-results],[data-gr-days],[data-gr-bk-open],[data-gr-bk-cancel],[data-gr-bk-accept],[data-gr-bk-decline],[data-gr-clock],[data-gr-review-ask],[data-gr-appt-move],[data-gr-grow],[data-gr-copy],[data-gr-save-note],[data-gr-new-link],[data-gr-save-review],[data-gr-save-notify],[data-gr-logo],[data-gr-logo-remove],[data-gr-color-save],[data-gr-color-clear],[data-gr-export]");
    if (!t) return;
    if (t.dataset.grLang) { store.set("ts-lang-" + t.dataset.token, t.dataset.grLang); A.renderCustomer(); return; }
    if (t.dataset.grBookLang) { keepDraft(); store.set("ts-book-lang", t.dataset.grBookLang); renderBooking(bk.token); return; }
    // Day, month and time buttons on the booking page ("book") and on the customer's change-time picker ("move").
    if (t.dataset.grMonth || t.dataset.grDay || t.dataset.grSlot) {
      const move = t.closest("[data-gr-pick]")?.dataset.grPick === "move", st = move ? mv : bk;
      const redraw = () => { if (move) A.renderCustomer(); else { renderBooking(bk.token); } };
      if (!move) keepDraft();
      if (t.dataset.grMonth) {
        st.month = t.dataset.grMonth; const d = (st.info?.slots || []).find((x) => x.day.startsWith(st.month)); if (d) st.day = d.day;
        redraw(); (document.querySelector(`[data-gr-month="${CSS.escape(t.dataset.grMonth)}"]`) || document.querySelector(".gr-cal-open[aria-pressed=true]"))?.focus();
      } else if (t.dataset.grDay) { st.day = t.dataset.grDay; redraw(); document.querySelector(".gr-slot-times button")?.focus(); }
      else { st.slot = t.dataset.grSlot; st.err = ""; redraw(); document.querySelector(`[data-gr-slot="${CSS.escape(st.slot)}"]`)?.focus(); }
      return;
    }
    if (t.hasAttribute("data-gr-c-confirm") || t.hasAttribute("data-gr-c-move") || t.hasAttribute("data-gr-c-cancel") || t.hasAttribute("data-gr-c-save")) { customerAppt(t); return; }
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
    if (t.hasAttribute("data-gr-appt-move")) {
      const v = $("#gr-appt-when")?.value, zone = $("#gr-appt-zone")?.value;
      if (!v) { A.toast("Pick the day and time"); return; }
      const at = new Date(zonedAt(v.slice(0, 10), v.slice(11, 16), zone)).toISOString(), send = !!$("#gr-appt-text")?.checked;
      t.disabled = true;
      const j = await A.act(jobId, "appointment", { at, send, zone });
      if (j) A.toast(send ? `Appointment set for ${apptText(at, zone)}. ${first(j.customer?.name) || "The customer"} got a text.` : `Appointment set for ${apptText(at, zone)}.`); else t.disabled = false;
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
    if (t.hasAttribute("data-gr-sched-save")) { t.disabled = true; if (await saveShop({ grow: { schedule: readSchedule() } }, "Appointment hours saved. Your booking page shows open times now.")) { ui.schedClosed = null; A.render(); } else t.disabled = false; return; }
    // Days off are part of the hours form: adding or removing one keeps the other edits and saves everything together.
    if (t.hasAttribute("data-gr-sched-off-add") || t.dataset.grSchedOffDel) {
      const d = $("#gr-sched-off-day")?.value, draft = readSchedule();
      if (t.dataset.grSchedOffDel) draft.closed = draft.closed.filter((x) => x !== t.dataset.grSchedOffDel);
      else if (!d) { A.toast("Pick the day first"); return; }
      else if (draft.closed.length >= 60) { A.toast("That's the most days off you can list. Remove one first."); return; }
      else draft.closed = [...new Set([...draft.closed, d])].sort();
      if (await saveShop({ grow: { schedule: draft } }, t.dataset.grSchedOffDel ? "Day off removed" : "Day off added. Customers can't book that day.")) { ui.schedClosed = null; A.render(); }
      return;
    }
    if (t.hasAttribute("data-gr-save-note")) { await saveShop({ grow: { bookingNote: $("#gr-book-note").value.trim() } }, "Booking note saved"); return; }
    if (t.hasAttribute("data-gr-new-link")) { if (await saveShop({ newBookingLink: true }, "New booking link made. Update it wherever you posted the old one.")) A.render(); return; }
    if (t.hasAttribute("data-gr-save-review")) {
      if (await saveShop({ grow: { reviewUrl: $("#gr-review-url").value.trim(), ...(pro() ? { reviewAuto: $("#gr-review-auto").checked } : {}) } }, "Review settings saved")) A.render();
      return;
    }
    if (t.hasAttribute("data-gr-save-notify")) {
      if (await saveShop({ grow: { address: $("#gr-address").value.trim(), nudgeHours: Number($("#gr-nudge").value), digest: $("#gr-digest").checked } }, "Saved")) A.render();
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
  document.addEventListener("change", async (e) => {
    if (A && e.target.id === "gr-sched-pause") {
      const cur = A.shop()?.grow?.schedule, on = e.target.checked;
      if (!cur) return;
      if (await saveShop({ grow: { schedule: { ...cur, paused: on } } }, on ? "New appointments are paused. Booked ones stay on your Bay." : "You're taking new appointments again.")) A.render(); else e.target.checked = !on;
      return;
    }
    if (A && e.target.id === "gr-appt-pick") { if (e.target.value) $("#gr-appt-when").value = e.target.value; return; }
    // The start-time preview follows the hours, length, break and lunch fields as the owner changes them.
    if (A && e.target.closest?.("#gr-sched") && $(".gr-sched-preview") && e.target.id !== "gr-sched-pause") {
      try { $(".gr-sched-preview").textContent = previewTimes(readSchedule()); } catch { /* the form is mid-redraw */ }
      if (e.target.id !== "gr-sched-on") return;
    }
    if (A && e.target.id === "gr-sched-on") {
      if (e.target.checked) { ui.schedOpen = true; A.render(); return; }
      ui.schedOpen = false;
      if (!A.shop()?.grow?.schedule) { A.render(); return; }
      if (await saveShop({ grow: { schedule: null } }, "Customers ask for a day again, and you confirm the time.")) A.render(); else e.target.checked = true;
      return;
    }
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
  setInterval(() => { if (A?.shop() && document.visibilityState === "visible" && document.getElementById("gr-bay")) loadBookings(); }, 60000);

  // Shop-zone helpers and the car-limit count, the same rules as shopSchedule.ts on the server.
  const zoneParts = (at, zone) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute }; };
  const plusDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  function dayLoad(sc, now, cars, appts) {
    const load = {}, stay = sc.stay || 1, today = zoneParts(now.getTime(), sc.zone).day, last = plusDays(today, sc.ahead + stay + 1);
    const add = (from, to) => { for (let d = from < today ? today : from, n = 0; d <= to && d <= last && n < 400; d = plusDays(d, 1), n++) load[d] = (load[d] || 0) + 1; };
    for (const c of cars) {
      let end = today;
      if (c.promised && Number.isFinite(ts(c.promised))) { const p = zoneParts(ts(c.promised), sc.zone).day; if (p > today) end = p; }
      else if (c.stage !== "ready" && Number.isFinite(ts(c.since))) { const e = plusDays(zoneParts(ts(c.since), sc.zone).day, stay - 1); if (e > today) end = e; }
      add(today, end);
    }
    for (const a of appts) { if (!Number.isFinite(ts(a))) continue; const d = zoneParts(ts(a), sc.zone).day; if (plusDays(d, stay - 1) >= today) add(d, plusDays(d, stay - 1)); }
    return load;
  }
  const hasRoom = (sc, load, day) => { if (!sc.capacity || !load) return true; for (let k = 0; k < (sc.stay || 1); k++) if ((load[plusDays(day, k)] || 0) >= sc.capacity) return false; return true; };
  /** Open appointment times, worked out in the browser (the demo shop has no server). Same rules as shopSchedule.ts. */
  function openSlots(sc, now, taken, load) {
    const hm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"), mn = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const parts = (at) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: sc.zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute }; };
    const offset = (at) => { const p = parts(at); return Date.parse(p.day + "T" + hm(p.min) + ":00Z") - Math.floor(at / 60000) * 60000; };
    const zoned = (day, t) => { const g = Date.parse(`${day}T${t}:00Z`); return g - offset(g - offset(g)); };
    const count = new Map(); for (const t of taken) { const ms = ts(t); if (Number.isFinite(ms)) count.set(ms, (count.get(ms) || 0) + 1); }
    const perDay = new Map(); if (sc.dayMax) for (const [ms, k] of count) { const d = parts(ms).day; perDay.set(d, (perDay.get(d) || 0) + k); }
    const lunch = sc.lunch ? [mn(sc.lunch[0]), mn(sc.lunch[1])] : null;
    const earliest = now.getTime() + sc.notice * 3600000, today = parts(now.getTime()).day, out = [];
    if (sc.paused) return out;
    for (let i = 0; i <= sc.ahead; i++) {
      const day = new Date(Date.parse(today + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10), h = sc.week[new Date(day + "T12:00:00Z").getUTCDay()];
      if (!h || (sc.closed || []).includes(day) || !hasRoom(sc, load, day) || (sc.dayMax && (perDay.get(day) || 0) >= sc.dayMax)) continue;
      const times = [];
      for (let m = mn(h[0]); m + sc.step <= mn(h[1]); m += sc.step + (sc.gap || 0)) {
        if (lunch && m < lunch[1] && m + sc.step > lunch[0]) { m = lunch[1] - sc.step - (sc.gap || 0); continue; }
        const at = zoned(day, hm(m));
        if (parts(at).min !== m || at < earliest || (count.get(at) || 0) >= sc.perSlot) continue;
        times.push({ time: hm(m), at: new Date(at).toISOString() });
      }
      if (times.length) out.push({ day, times });
    }
    return out;
  }

  window.Grow = { openSlots, dayLoad, init, pro, setLang, customerSetup, customerHead, customerCards, langSwitch, renderBooking, loadBookings, bookingsPanel, cardBits, sheetSection, resultsButton, settingsPanels };
})();
