/* Shop-wide vehicle age thresholds and colors; timestamps remain unchanged. */
(() => {
  const defaults = { warningDays:1, overdueDays:3, colors:['#16a36a','#e59a14','#e5484d'] };
  const valid = settings => settings && Number.isInteger(settings.warningDays) && settings.warningDays >= 1 && settings.warningDays <= 365 && Number.isInteger(settings.overdueDays) && settings.overdueDays > settings.warningDays && settings.overdueDays <= 3650 && Array.isArray(settings.colors) && settings.colors.length === 3 && settings.colors.every(c => /^#[0-9a-f]{6}$/i.test(c));
  const get = shop => valid(shop?.ageSettings) ? shop.ageSettings : defaults;
  const labels = settings => [`Under ${settings.warningDays} day${settings.warningDays === 1 ? '' : 's'}`,`${settings.warningDays} to under ${settings.overdueDays} days`,`${settings.overdueDays}+ days`];
  const classes = ['age-ok','age-mid','age-old'];
  function preview(form) {
    const section = form.querySelector('.age-settings'); if (!section) return;
    const first = section.querySelector('[name="ageWarningDays"]'), last = section.querySelector('[name="ageOverdueDays"]');
    last.setCustomValidity(+last.value > +first.value ? '' : 'The overdue threshold must be greater than the warning threshold.');
    const settings = {warningDays:+first.value,overdueDays:+last.value};
    section.querySelector('.age-preview').hidden = !first.validity.valid || !last.validity.valid;
    section.querySelectorAll('.age-preview span').forEach((chip,index) => {
      chip.style.setProperty('--age', section.querySelector(`[name="ageColor${index}"]`).value);
      chip.textContent = labels(settings)[index];
    });
  }
  window.BayAge = {
    get,
    apply(shop) {
      const settings = get(shop), app = document.querySelector('#app');
      settings.colors.forEach((color,index) => app.style.setProperty(`--age-color-${index}`,color));
      app.dataset.ageOverdueDays = settings.overdueDays;
    },
    bucket(start, shop, now = Date.now()) {
      const days = (now - (typeof start === 'number' ? start : Date.parse(start))) / 86400000, settings = get(shop);
      return days < settings.warningDays ? 'age-ok' : days < settings.overdueDays ? 'age-mid' : 'age-old';
    },
    legend(shop) {
      return `<div class="age-key" aria-label="Time in shop">${labels(get(shop)).map((label,index) => `<span class="${classes[index]}">${label}</span>`).join('')}</div>`;
    },
    fields(shop) {
      const settings = get(shop);
      return `<details class="age-wrap"><summary>Vehicle age colors <span class="muted">· ${labels(settings).join(" · ")}</span></summary><fieldset class="age-settings"><legend class="sr-only">Vehicle Age Colors</legend><p class="hint">Cars on the Bay change color the longer they're in the shop. Applies to everyone in your shop.</p>
        <div class="age-thresholds"><label class="field">Warning starts after (days)<input name="ageWarningDays" type="number" min="1" max="365" step="1" required value="${settings.warningDays}"></label><label class="field">Overdue starts after (days)<input name="ageOverdueDays" type="number" min="2" max="3650" step="1" required value="${settings.overdueDays}"></label></div>
        <div class="age-color-pickers">${['Before Warning','Warning','Overdue'].map((label,index) => `<label class="field">${label}<input type="color" name="ageColor${index}" value="${settings.colors[index]}" aria-label="${label} color"></label>`).join('')}</div>
        <div class="age-key age-preview" aria-label="Color preview">${labels(settings).map((label,index) => `<span style="--age:${settings.colors[index]}">${label}</span>`).join('')}</div>
        <button class="linkbtn" type="button" data-age-reset>Restore Default Colors and Times</button></fieldset></details>`;
    },
    read(form) {
      preview(form);
      if (!form.reportValidity()) return null;
      const settings = {warningDays:+form.elements.ageWarningDays.value,overdueDays:+form.elements.ageOverdueDays.value,colors:[0,1,2].map(index => form.elements[`ageColor${index}`].value)};
      return valid(settings) ? settings : null;
    }
  };
  document.addEventListener('input', event => { if (event.target.closest('.age-settings')) preview(event.target.form); });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-age-reset]'); if (!button) return;
    const form = button.form;
    form.elements.ageWarningDays.value = defaults.warningDays; form.elements.ageOverdueDays.value = defaults.overdueDays;
    defaults.colors.forEach((color,index) => { form.elements[`ageColor${index}`].value = color; });
    preview(form);
  });
})();
