/* Shared stage views for the live Bay and demo. All choices stay local to this page. */
(() => {
  const choices = new Map();
  const opened = new Set();
  let focused = '';
  const app = document.querySelector('#app');
  const time = value => { const n = typeof value === 'number' ? value : Date.parse(value); return Number.isFinite(n) ? n : Date.now(); };
  const URGENCY = {high:['High','urg-high'],medium:['Medium','urg-medium'],low:['Low','urg-low']};
  const urgencyRank = job => ({high:0,medium:1,low:2})[job.urgency] ?? 3;
  window.BayBoard = {
    URGENCY,
    /** Small mark for the top right of a Bay card. Nothing when the shop has not set one. */
    urgencyBadge(job) {
      const u = URGENCY[job.urgency];
      return u ? `<span class="urgency ${u[1]}" title="${u[0]} urgency">${u[0]}</span>` : '';
    },
    /** Low / Medium / High choice for the car sheet and check-in. */
    urgencyPicker(value, name = 'urgency') {
      return `<div class="urgency-pick" role="radiogroup" aria-label="Urgency">${[['', 'Not Set'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([key, text]) => `<label class="${key ? URGENCY[key][1] : 'urg-none'}"><input type="radio" name="${name}" value="${key}" ${String(value || '') === key ? 'checked' : ''}><span>${text}</span></label>`).join('')}</div>`;
    },
    metadata(job) {
      const work = (job.estimate || []).filter(item => item.status !== 'declined');
      const rank = work.reduce((best, item) => Math.min(best, ({required:0,recommended:1,optional:2})[item.priority] ?? 3), 3);
      return `data-arrived="${time(job.createdAt || job.events?.[0]?.t)}" data-stage-at="${time(job.events?.at(-1)?.t)}" data-priority="${rank}" data-reply="${job.messages?.at(-1)?.dir === 'in' ? 1 : 0}" data-urgency="${urgencyRank(job)}"`;
    }
  };
  const option = (value, text) => `<option value="${value}">${text}</option>`;
  function enhance() {
    const board = app.querySelector('.board');
    if (!board || board.dataset.enhanced) return;
    board.dataset.enhanced = 'true';
    const bar = document.createElement('div');
    bar.className = 'stage-view-bar';
    bar.innerHTML = '<button type="button" class="btn" data-stage-back hidden>← All Stages</button><p class="stage-results" role="status" aria-live="polite"></p>';
    board.parentElement.before(bar);
    board.querySelectorAll('.col[data-stage]').forEach(col => {
      const key = col.dataset.stage, heading = col.querySelector('h3'), count = col.querySelector('.col-h>span');
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'stage-heading'; button.dataset.stageFocus = key;
      button.setAttribute('aria-label', `View all vehicles in ${heading.textContent}`);
      button.title = 'Show only this stage';
      heading.replaceWith(button); button.append(heading, count);
      const tune = document.createElement('button');
      tune.type = 'button'; tune.className = 'stage-tune'; tune.dataset.stageTune = key;
      tune.setAttribute('aria-label', `Sort or filter ${heading.textContent}`); tune.title = 'Sort or filter this stage';
      tune.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4"/></svg>';
      button.after(tune);
      const controls = document.createElement('div'); controls.className = 'stage-controls';
      controls.innerHTML = `<label>Sort<select data-stage-sort aria-label="Sort ${heading.textContent}">${option('default','Default Order')}${option('stage','Waiting Longest in This Step')}${option('oldest','Checked In First')}${option('newest','Newest Arrivals')}${option('urgency','Most Urgent First')}${option('priority','Priority First')}</select></label><label>Filter<select data-stage-filter aria-label="Filter ${heading.textContent}">${option('all','All Vehicles')}${option('required','Required Work')}${option('urgent','High Urgency')}${option('reply','Customer Reply')}${option('aged',`In Shop ${app.dataset.ageOverdueDays || 3}+ Days`)}</select></label><p class="stage-empty muted" hidden>No vehicles match these filters.</p>`;
      col.querySelector('.col-h').after(controls);
      const choice = choices.get(key) || {sort:'default',filter:'all'};
      controls.querySelector('[data-stage-sort]').value = choice.sort;
      controls.querySelector('[data-stage-filter]').value = choice.filter;
      col.querySelectorAll('.card').forEach((card, index) => {
        card.dataset.initialOrder = index;
        if (card.dataset.priority === '0') {
          const badge = document.createElement('span'); badge.className = 'pill bad stage-priority'; badge.textContent = 'Required Work'; card.append(badge);
        }
      });
    });
    apply();
  }
  function apply() {
    const board = app.querySelector('.board[data-enhanced]'); if (!board) return;
    const query = (app.querySelector('#boardSearch')?.value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const queue = app.querySelector('[data-queue][aria-pressed="true"]')?.dataset.queue || 'all';
    if (focused && ![...board.children].some(col => col.dataset.stage === focused)) focused = '';
    board.classList.toggle('stage-focused', !!focused);
    const bar = app.querySelector('.stage-view-bar'); bar.querySelector('[data-stage-back]').hidden = !focused;
    let total = 0;
    board.querySelectorAll('.col[data-stage]').forEach(col => {
      const key = col.dataset.stage, choice = choices.get(key) || {sort:'default',filter:'all'};
      const cards = [...col.querySelectorAll('.card[data-s]')];
      const compare = (a,b) => {
        if (choice.sort === 'stage') return +a.dataset.stageAt - +b.dataset.stageAt;
        if (choice.sort === 'oldest') return +a.dataset.arrived - +b.dataset.arrived;
        if (choice.sort === 'newest') return +b.dataset.arrived - +a.dataset.arrived;
        if (choice.sort === 'urgency') return +a.dataset.urgency - +b.dataset.urgency || +a.dataset.arrived - +b.dataset.arrived;
        if (choice.sort === 'priority') return +a.dataset.priority - +b.dataset.priority || +a.dataset.stageAt - +b.dataset.stageAt;
        return +a.dataset.initialOrder - +b.dataset.initialOrder;
      };
      if (col.dataset.sortedBy !== choice.sort) { cards.sort(compare).forEach(card => col.append(card)); col.dataset.sortedBy = choice.sort; }
      let shown = 0;
      cards.forEach(card => {
        const match = query.every(term => card.dataset.s.includes(term)) && (queue === 'all' || card.dataset.queueKey === queue);
        const local = choice.filter === 'all' || (choice.filter === 'required' && card.dataset.priority === '0') || (choice.filter === 'urgent' && card.dataset.urgency === '0') || (choice.filter === 'reply' && card.dataset.reply === '1') || (choice.filter === 'aged' && Date.now() - +card.dataset.arrived >= Number(app.dataset.ageOverdueDays || 3) * 86400000);
        card.hidden = !(match && local); if (!card.hidden) shown++;
      });
      col.classList.remove('search-hide');
      col.hidden = !!focused && focused !== key;
      col.querySelector('.stage-heading').setAttribute('aria-pressed', String(focused === key));
      col.querySelector('.stage-heading>span').textContent = shown === cards.length ? String(shown) : `${shown}/${cards.length}`;
      col.querySelector('.stage-empty').hidden = shown > 0 || cards.length === 0;
      const changed = choice.sort !== 'default' || choice.filter !== 'all', show = focused === key || opened.has(key) || changed;
      col.querySelector('.stage-controls').hidden = !show;
      const tune = col.querySelector('.stage-tune'); tune.setAttribute('aria-expanded', String(show)); tune.classList.toggle('on', changed); tune.hidden = focused === key;
      if (!col.hidden) total += shown;
    });
    const all = board.querySelectorAll('.card[data-s]').length;
    bar.querySelector('.stage-results').textContent = total === all ? '' : `Showing ${total} of ${all} vehicles`;
    bar.hidden = !focused && total === all;
    const none = app.querySelector('#boardNone'); if (none) none.hidden = true;
  }
  document.addEventListener('click', event => {
    const tune = event.target.closest('[data-stage-tune]');
    if (tune) { const key = tune.dataset.stageTune; if (opened.has(key)) { opened.delete(key); choices.delete(key); const c = tune.closest('.col'); c.querySelector('[data-stage-sort]').value = 'default'; c.querySelector('[data-stage-filter]').value = 'all'; } else opened.add(key); apply(); return; }
    const button = event.target.closest('[data-stage-focus],[data-stage-back]');
    if (button) {
      focused = button.hasAttribute('data-stage-back') ? '' : button.dataset.stageFocus;
      apply();
      if (focused) app.querySelector('[data-stage-back]')?.focus();
      else app.querySelector('.stage-heading')?.focus();
    } else if (event.target.closest('[data-queue]')) queueMicrotask(apply);
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-stage-sort],[data-stage-filter]')) return;
    const col = event.target.closest('.col'), controls = col.querySelector('.stage-controls');
    choices.set(col.dataset.stage, {sort:controls.querySelector('[data-stage-sort]').value,filter:controls.querySelector('[data-stage-filter]').value});
    apply();
  });
  document.addEventListener('input', event => { if (event.target.id === 'boardSearch') queueMicrotask(apply); });
  new MutationObserver(enhance).observe(app, {childList:true});
  enhance();
})();
