"use strict";
// Voice typing: a <button data-dictate="#inputId"> fills that input or textarea from the microphone,
// using the browser's speech recognition (Chrome, Edge, Safari). Tap again to stop.
window.createDictation = ({ toast }) => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, btn = null;
  const reset = (b) => { if (!b) return; b.setAttribute("aria-pressed", "false"); b.classList.remove("listening"); const l = b.querySelector(".mic-label"); if (l) l.textContent = b.dataset.idle || "Speak"; };
  function stop() { if (rec) { try { rec.stop(); } catch { /* already stopped */ } } }
  function toggle(button) {
    const target = document.querySelector(button.dataset.dictate);
    if (!target) return;
    if (!SR) { toast("Voice typing isn't available in this browser. Try Chrome or Safari, or tap the mic on your phone's keyboard."); target.focus(); return; }
    if (rec) { const same = btn === button; stop(); if (same) return; }
    const base = target.value.trim() ? target.value.replace(/\s*$/, " ") : "";
    const max = target.maxLength > 0 ? target.maxLength : 5000;
    let finalText = "";
    const r = new SR();
    r.lang = navigator.language || "en-US"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript.trim() + " "; else interim += res[0].transcript;
      }
      const text = base + finalText + interim;
      const el = document.querySelector(button.dataset.dictate) || target;
      el.value = (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, max);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Allow microphone access for this site to use voice typing.");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast("Voice typing stopped (" + e.error + ").");
    };
    r.onend = () => { if (rec === r) { rec = null; reset(btn); btn = null; } };
    rec = r; btn = button;
    button.dataset.idle = button.querySelector(".mic-label")?.textContent || "Speak";
    button.setAttribute("aria-pressed", "true"); button.classList.add("listening");
    const l = button.querySelector(".mic-label"); if (l) l.textContent = "Listening… tap to stop";
    try { r.start(); } catch (err) { rec = null; reset(button); btn = null; toast("Voice typing couldn't start. Try again."); }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-dictate]");
    if (b) { e.preventDefault(); toggle(b); }
  });
  return { stop, active: () => !!rec };
};
