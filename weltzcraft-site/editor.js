// The page editor for Weltzcraft-built sites. Loaded by sample.js for the person who may change a page:
//   - the maker of a free preview (they hold its edit key), from the "Edit page" button, and
//   - the owner of a live site, at weltzcraft.com/portal/edit (signed in through the portal).
// With it they drag sections into a new order, click text to rewrite it, hide sections, and add their own blocks:
// text, a picture, a picture beside words, a button that does something, boxes, tabs, a video, the booking calendar,
// the order form or the message form. They can also add whole pages with their own addresses (yoursite.com/catering),
// put pages inside drop-down menus, take back a change (Undo), and keep a backup to go back to.
// Everything is saved on the page's answers (blocks, order, hide, pages, f, s, tag); the server (_worker.js:
// blocksOf / pagesOf / previewEdit / portalApply) cleans every field again.
// It is written for people who have never edited a website: every button says what it does in words.
(function () {
  var E = window.WC_EDIT;
  if (!E || window.wcEditor) return;
  var PORTAL = E.mode === 'portal';
  var active = false, dirty = false, page = null, A = null, copyW = null, dropExtra = false, dragKey = '', addAt = -1, base = null;
  var hist = [], lastJson = '', savedJson = '', backupAt = '';
  var NAMES = { about: 'About', why: 'Why choose us', menu: 'Menu / list', steps: 'How it works', order: 'Ordering', book: 'Booking calendar', gallery: 'Gallery', reviews: 'Reviews', faq: 'Questions', areas: 'Areas served', ask: 'Message form', visit: 'Contact and map' };
  var SEC_FLAG = { menu: 'list', gallery: 'pics', faq: 'faq', steps: 'steps', areas: 'areas', reviews: 'review' };   // sections switched by the "s" list
  var ACTS = [['call', 'Call us'], ['email', 'Email us'], ['book', 'Open the booking calendar'], ['order', 'Open the order form'], ['message', 'Open the message form'], ['directions', 'Get directions'], ['link', 'Open a web link']];
  var TYPES = [['text', '📝', 'Text', 'A heading and a paragraph'], ['image', '🖼️', 'Picture', 'One big photo with a caption'], ['split', '🧩', 'Picture + words', 'A photo beside a heading and text'],
    ['button', '🔘', 'Button', 'Call, email, book, order, directions or a link'], ['boxes', '🗂️', 'Boxes', 'Up to 4 boxes side by side'], ['tabs', '📑', 'Tabs', 'Click a tab to show different words'], ['video', '▶️', 'Video', 'A YouTube video']];
  var RESERVED = /^(api|img|portal|preview|live|sample|build|merch|index|favicon|robots|sitemap|features|editor|hit)(\.|\/|$)/;
  var PATH = /^[a-z0-9][a-z0-9-]{0,29}(\/[a-z0-9][a-z0-9-]{0,29})?$/;
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function hit(e) { if (window.wcHit) window.wcHit(e); }
  function rid() { var s = ''; while (s.length < 6) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
  function thumb(o) { return '/img/x?u=' + encodeURIComponent(o.s || o.u); }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, ''); }
  function seen(k) { try { return localStorage.getItem(k); } catch (e) { return '1'; } }
  function mark(k) { try { localStorage.setItem(k, '1'); } catch (e) {} }
  function day(iso) { try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) + ' at ' + new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  var css = document.createElement('style');
  css.textContent = '.ed-on{padding-top:54px}.ed-on .hd{top:54px}' +
    '.ed-bar{position:fixed;left:0;right:0;top:0;height:54px;z-index:9000;background:#12100c;color:#f6efe2;display:flex;align-items:center;gap:8px;padding:0 12px;font:600 14.5px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);overflow-x:auto}' +
    '.ed-bar span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ed-bar small{color:#b4aa98;font-weight:500}' +
    '.ed-btn{font:700 14px system-ui,sans-serif;border:0;border-radius:10px;padding:9px 13px;background:#2a2620;color:#f6efe2;cursor:pointer;white-space:nowrap}.ed-btn.go{background:linear-gradient(135deg,#ff8a3c,#ffc061);color:#221502}.ed-btn:disabled{opacity:.45;cursor:default}.ed-btn i{font-style:normal;margin-right:5px}' +
    '.ed-on .cz-open,.ed-on .cz-box,.ed-on .mbar{display:none!important}.ed-launch{position:fixed;left:16px;bottom:16px;z-index:8000;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:13px 18px;border-radius:999px;font-size:15px}.has-mbar .ed-launch{bottom:84px}' +
    '.ed-sec{position:relative;outline:2px dashed transparent;outline-offset:-2px;transition:outline-color .15s}.ed-sec:hover,.ed-sec.ed-hot{outline-color:rgba(255,138,60,.7)}' +
    '.ed-tb{position:absolute;right:10px;top:10px;z-index:50;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;align-items:center;max-width:calc(100% - 20px);background:#12100c;border-radius:12px;padding:5px;box-shadow:0 8px 22px rgba(0,0,0,.3);opacity:.94}' +
    '.ed-tb b{color:#f6efe2;font:700 12.5px system-ui,sans-serif;padding:0 8px 0 6px;white-space:nowrap}' +
    '.ed-tb button,.ed-tb .ed-grip{height:34px;border:0;border-radius:8px;background:#2a2620;color:#f6efe2;font:700 12.5px system-ui,sans-serif;cursor:pointer;padding:0 10px;line-height:34px;white-space:nowrap;user-select:none}.ed-tb button:hover,.ed-tb .ed-grip:hover{background:#ff8a3c;color:#221502}.ed-tb .ed-grip{cursor:grab;display:inline-block}' +
    '.ed-add{display:flex;justify-content:center;height:0;position:relative;z-index:40}.ed-add button{transform:translateY(-50%);font:700 13.5px system-ui,sans-serif;border:2px solid #ff8a3c;background:#fff;color:#b8501a;border-radius:999px;padding:6px 14px;cursor:pointer;opacity:.55}.ed-add button:hover{opacity:1;background:#ff8a3c;color:#fff}' +
    '.ed-add.end{height:auto;padding:22px 0}.ed-add.end button{transform:none;opacity:1}' +
    '.ed-drop-a{box-shadow:inset 0 5px 0 #ff8a3c}.ed-drop-b{box-shadow:inset 0 -5px 0 #ff8a3c}.ed-dragging{opacity:.45}' +
    '.ed-on [data-edit]{outline:1px dashed rgba(255,138,60,.6);outline-offset:4px;border-radius:4px;cursor:text;min-width:40px}.ed-on [data-edit]:focus{outline:2px solid #ff8a3c;background:rgba(255,138,60,.08)}' +
    '.ed-ov{position:fixed;inset:0;z-index:9500;background:rgba(10,8,6,.6);display:flex;align-items:flex-end;justify-content:center}@media(min-width:640px){.ed-ov{align-items:center}}' +
    '.ed-dlg{background:#1a1713;color:#f6efe2;width:min(560px,100%);max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;padding:20px;font:15px/1.5 system-ui,sans-serif}@media(min-width:640px){.ed-dlg{border-radius:20px}}' +
    '.ed-dlg h3{font:800 20px system-ui,sans-serif;margin:0 0 4px}.ed-dlg p.h{color:#b4aa98;margin:0 0 12px;font-size:14px}.ed-dlg label{display:block;font-weight:600;font-size:13.5px;margin:12px 0 5px}.ed-dlg label small,.ed-dlg .hint{color:#b4aa98;font-weight:500;font-size:13px}.ed-dlg .hint{margin:5px 0 0}' +
    '.ed-dlg input[type=text],.ed-dlg input[type=url],.ed-dlg textarea,.ed-dlg select{width:100%;font:500 16px system-ui,sans-serif;padding:11px 12px;border-radius:10px;border:1.5px solid rgba(255,240,215,.16);background:rgba(255,240,215,.05);color:#f6efe2}.ed-dlg select option{background:#1a1713}' +
    '.ed-dlg textarea{min-height:96px;resize:vertical}.ed-dlg textarea.sm{min-height:64px;margin-top:6px}.ed-dlg .row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.ed-dlg .row .sp{flex:1}' +
    '.ed-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ed-types.one{grid-template-columns:1fr}.ed-types button{text-align:left;border:1.5px solid rgba(255,240,215,.14);background:rgba(255,240,215,.04);color:#f6efe2;border-radius:14px;padding:12px;cursor:pointer;font:600 15px system-ui,sans-serif}.ed-types button:hover{border-color:#ff8a3c}.ed-types small{display:block;color:#b4aa98;font-weight:500;font-size:12.5px;margin-top:2px}.ed-types i{font-style:normal;margin-right:6px}' +
    '.ed-ph{display:flex;gap:10px;align-items:center}.ed-ph img,.ed-ph .none{width:110px;height:82px;object-fit:cover;border-radius:10px;background:#2a2620;display:grid;place-items:center;color:#b4aa98;font-size:12px;flex:none}' +
    '.ed-pick{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.ed-pick button{padding:0;border:0;aspect-ratio:4/3;border-radius:8px;overflow:hidden;cursor:pointer;background:#2a2620}.ed-pick img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ed-msg{font-size:13.5px;color:#ff8f7a;min-height:1em;margin:8px 0 0}.ed-msg.ok{color:#5fd38d}' +
    '.ed-pg{display:flex;gap:8px;align-items:center;border:1.5px solid rgba(255,240,215,.14);border-radius:14px;padding:10px 12px;margin-top:8px}.ed-pg.cur{border-color:#ff8a3c}.ed-pg div{flex:1;min-width:0}.ed-pg b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ed-pg small{display:block;color:#b4aa98;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ed-pg .ed-btn{padding:8px 10px;font-size:13px}' +
    '.ed-adr{display:flex;align-items:center;gap:6px}.ed-adr span{color:#b4aa98;white-space:nowrap}' +
    '.ed-steps{margin:10px 0 0;padding:0;list-style:none}.ed-steps li{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-top:1px solid rgba(255,240,215,.1)}.ed-steps li:first-child{border-top:0}.ed-steps i{font-style:normal;font-size:22px;line-height:1.2;flex:none;width:30px;text-align:center}.ed-steps b{display:block}.ed-steps span{color:#b4aa98;font-size:14px}' +
    '.ed-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9600;background:#f6efe2;color:#1a1713;font:600 15px system-ui,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 18px 40px -12px #000;max-width:calc(100vw - 32px)}' +
    '@media(max-width:700px){.ed-bar span{display:none}.ed-bar{justify-content:space-between}}@media(max-width:560px){.ed-tb b{display:none}.ed-tb .ed-grip{display:none}}@media(max-width:430px){.ed-bar{gap:5px;padding:0 6px}.ed-btn{padding:9px 9px;font-size:13px}.ed-bar .ed-btn i{display:none}}';
  document.head.appendChild(css);

  var toastT;
  function toast(t) { var el = $('.ed-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'ed-toast' })); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 3500); }
  function setDirty(v) { dirty = v; var b = $('.ed-save'); if (b) { b.disabled = !v; b.textContent = v ? 'Save' : 'Saved'; } var u = $('.ed-undo'); if (u) u.disabled = !hist.length; }
  function draw() { if (copyW) page.redraw(A, copyW, page.live); else page.rerender(A); }
  /** Remember the page as it is now, so Undo can come back to how it was before. */
  function snapshot() {
    var j = JSON.stringify(A);
    if (j !== lastJson) { hist.push(lastJson); if (hist.length > 40) hist.shift(); lastJson = j; }
    setDirty(dropExtra || j !== savedJson);
  }
  function change() { snapshot(); draw(); }
  function undo() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!hist.length) return toast('Nothing to undo.');
    lastJson = hist.pop(); A = JSON.parse(lastJson);
    if (page.pg && !CP()) window.wcGo('');
    setDirty(dropExtra || lastJson !== savedJson); draw(); toast('Undone.');
  }
  /** Start again from what the server holds (after a save, or after going back to a backup). */
  function settle(a) { A = clone(a); base = a; savedJson = lastJson = JSON.stringify(A); if (page.pg && !CP()) window.wcGo(''); }

  // ---- pages: the home page, plus the owner's extra pages ------------------------------------------------------
  function CP() { var p = page && page.pg; return p ? (A.pages || []).filter(function (x) { return x.path === p; })[0] || null : null; }
  function blocks() { var c = CP(); return c ? c.blocks || (c.blocks = []) : A.blocks || (A.blocks = []); }
  function setBlocks(l) { var c = CP(); if (c) c.blocks = l; else A.blocks = l; }
  function block(id) { return blocks().filter(function (b) { return b.id === id; })[0]; }
  function go(path, hash) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.wcGo(path || ''); draw(); title();
    var el = hash ? document.getElementById(hash) : null;
    if (el) el.scrollIntoView(); else window.scrollTo(0, 0);
  }
  function title() { var s = $('.ed-bar span'), c = CP(); if (s) s.innerHTML = '✏️ Editing: <b>' + esc(c ? c.title + ' page' : 'Home page') + '</b> <small>· click words to change them</small>'; }

  // ---- start / stop -------------------------------------------------------------------------------------------
  function start() {
    if (active || !page) return;
    active = true; A = clone(page.a); copyW = null; dropExtra = false; hist = [];
    savedJson = lastJson = JSON.stringify(A);
    // "Extra sections" written in the portal become ordinary text blocks here, so they can be moved and edited like the rest.
    var extra = page.copy && page.copy.extra;
    if (PORTAL && extra && extra.length) {
      A.blocks = (A.blocks || []).concat(extra.map(function (x) { return { id: rid(), type: 'text', h: x[0], p: x[1] }; }));
      copyW = Object.assign({}, page.copy, { extra: [] }); dropExtra = true; lastJson = JSON.stringify(A);
    }
    document.documentElement.classList.add('ed-on');
    var bar = document.createElement('div'); bar.className = 'ed-bar';
    bar.innerHTML = '<span></span><button class="ed-btn" data-ed="pages" title="Add pages and menus"><i>📄</i>Pages</button><button class="ed-btn" data-ed="add" title="Add something to this page"><i>＋</i>Add</button>' +
      '<button class="ed-btn ed-undo" data-ed="undo" title="Take back your last change" disabled><i>↶</i>Undo</button><button class="ed-btn" data-ed="more" title="Backups and help">More</button>' +
      '<button class="ed-btn go ed-save" data-ed="save" disabled>Saved</button><button class="ed-btn" data-ed="exit">' + (PORTAL ? 'Back' : 'Done') + '</button>';
    document.body.appendChild(bar);
    var l = $('.ed-launch'); if (l) l.hidden = true;
    hit('editor_open'); title(); draw();
    if (!seen('wced-guide')) guide();
  }
  function stop() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (dirty && !window.confirm('You have changes that aren\'t saved. Leave without saving?')) return;
    if (PORTAL) { dirty = false; location.href = '/portal' + (E.demo ? '?demo=1' : ''); return; }
    active = false; dirty = false; document.documentElement.classList.remove('ed-on');
    var bar = $('.ed-bar'); if (bar) bar.remove();
    var l = $('.ed-launch'); if (l) l.hidden = false;
    if (page.pg && !(base.pages || []).some(function (x) { return x.path === page.pg; })) window.wcGo('');
    page.rerender(base);
  }
  window.addEventListener('beforeunload', function (e) { if (active && dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---- drawing the handles on the page ------------------------------------------------------------------------
  function elFor(k) { return document.getElementById(k.indexOf('b:') === 0 ? 'b-' + k.slice(2) : k); }
  function shown() { return page.order.filter(function (k) { return elFor(k); }); }
  function decorate(pg) {
    page = pg;
    if (!base) base = page.a;
    if (!active) {
      if (!PORTAL && !$('.ed-launch')) { var b = document.createElement('button'); b.className = 'ed-btn go ed-launch'; b.textContent = '✏️ Edit page'; b.onclick = start; document.body.appendChild(b); }
      if (PORTAL) { if (E.backupAt) backupAt = E.backupAt; start(); }
      return;
    }
    var keys = shown();
    keys.forEach(function (k, i) {
      var el = elFor(k), isBlock = k.indexOf('b:') === 0, b = isBlock ? block(k.slice(2)) : null;
      el.classList.add('ed-sec'); el.setAttribute('data-k', k);
      var name = isBlock ? (TYPES.filter(function (t) { return b && t[0] === b.type; })[0] || [])[2] || 'Block' : NAMES[k] || k;
      var tb = document.createElement('div'); tb.className = 'ed-tb'; tb.setAttribute('contenteditable', 'false');
      tb.innerHTML = '<b>' + esc(name) + '</b>' + (keys.length > 1 ? '<span class="ed-grip" draggable="true" role="button" title="Hold and drag to move this section">⠿ Drag</span>' : '') +
        (i > 0 ? '<button data-ed="up" title="Move this section up">↑ Up</button>' : '') + (i < keys.length - 1 ? '<button data-ed="down" title="Move this section down">↓ Down</button>' : '') +
        (isBlock ? '<button data-ed="edit" title="Change what this says or shows">✎ Edit</button>' : '') +
        (k !== 'about' && k !== 'visit' ? '<button data-ed="del" title="' + (isBlock ? 'Remove this from the page' : 'Hide this section (you can bring it back)') + '">✕ ' + (isBlock ? 'Delete' : 'Hide') + '</button>' : '');
      el.appendChild(tb);
      var add = document.createElement('div'); add.className = 'ed-add'; add.innerHTML = '<button type="button" data-ed="addat" data-i="' + i + '">+ Add here</button>';
      el.parentNode.insertBefore(add, el);
      if (isBlock && b) [].forEach.call(el.querySelectorAll('[data-f]'), function (n) { editable(n, function (v) { b[n.getAttribute('data-f')] = v; }); });
    });
    var last = keys.length ? elFor(keys[keys.length - 1]) : $('.phero');
    if (last) { var end = document.createElement('div'); end.className = 'ed-add end'; end.innerHTML = '<button type="button" data-ed="addat" data-i="' + keys.length + '">+ Add ' + (keys.length ? 'a block here' : 'something to this page') + '</button>'; last.parentNode.insertBefore(end, last.nextSibling); }
    var lead = $('.hero .lead'); if (lead) editable(lead, function (v) { if (v) A.tag = v.slice(0, 80); });
    var pt = $('.phero [data-pt]'), c = CP(); if (pt && c) editable(pt, function (v) { if (v) { c.title = v.slice(0, 40); title(); } });
  }
  /** Click-to-edit text: plain text only, saved into the page when the cursor leaves. */
  function editable(n, set) {
    n.setAttribute('data-edit', '1'); n.setAttribute('title', 'Click to change these words');
    try { n.contentEditable = 'plaintext-only'; } catch (e) { n.contentEditable = 'true'; }
    if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); n.blur(); } });
    n.addEventListener('paste', function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text'); document.execCommand('insertText', false, t.replace(/\s+/g, ' ')); });
    n.addEventListener('input', function () { setDirty(true); });
    n.addEventListener('blur', function () { set(n.textContent.replace(/\s+/g, ' ').trim()); snapshot(); });
  }

  // ---- moving, hiding, adding ---------------------------------------------------------------------------------
  function byKeys(keys) { var l = blocks(); return keys.map(function (k) { return l.filter(function (b) { return 'b:' + b.id === k; })[0]; }).filter(Boolean); }
  function move(k, to) {
    var keys = shown(), from = keys.indexOf(k); if (from < 0) return;
    keys.splice(from, 1); keys.splice(Math.max(0, Math.min(keys.length, to > from ? to - 1 : to)), 0, k);
    if (CP()) setBlocks(byKeys(keys));
    // On the home page, sections that aren't showing right now keep their place at the end of the saved order.
    else A.order = keys.concat(page.order.filter(function (x) { return keys.indexOf(x) < 0; }));
    change();
  }
  function sOn(flag, on) { var s = (A.s || '').split(',').filter(function (x) { return x && x !== flag; }); if (on) s.push(flag); A.s = s.join(','); }
  function remove(k) {
    if (k.indexOf('b:') === 0) { setBlocks(blocks().filter(function (b) { return 'b:' + b.id !== k; })); if (!CP()) A.order = (A.order || []).filter(function (x) { return x !== k; }); change(); return toast('Deleted. Press Undo to bring it back.'); }
    if (k === 'book') A.f = Object.assign({}, A.f, { book: 0 });
    else if (k === 'ask') A.f = Object.assign({}, A.f, { form: 'none' });
    else { if (k === 'order') A.f = Object.assign({}, A.f, { order: 0 }); A.hide = (A.hide || []).filter(function (x) { return x !== k; }).concat([k]); }
    change(); toast(NAMES[k] + ' hidden. Press Undo, or bring it back from "Add".');
  }
  function placeAt(k) {
    var keys = shown().filter(function (x) { return x !== k; });
    if (CP()) { keys.splice(addAt >= 0 ? Math.min(addAt, keys.length) : keys.length, 0, k); return setBlocks(byKeys(keys)); }
    // From the top bar's "Add" a new piece lands just above the message form and contact section.
    var at = addAt >= 0 ? Math.min(addAt, keys.length) : keys.indexOf('ask') > -1 ? keys.indexOf('ask') : keys.indexOf('visit') > -1 ? keys.indexOf('visit') : keys.length;
    keys.splice(at, 0, k);
    A.order = keys.concat(page.order.filter(function (x) { return keys.indexOf(x) < 0 && x !== k; }));
  }
  function bringBack(k) {
    A.hide = (A.hide || []).filter(function (x) { return x !== k; });
    if (k === 'book') A.f = Object.assign({}, A.f, { book: 1 });
    if (k === 'order') A.f = Object.assign({}, A.f, { order: 1 });
    if (k === 'ask') A.f = Object.assign({}, A.f, { form: (A.f && A.f.form && A.f.form !== 'none') ? A.f.form : 'contact' });
    if (SEC_FLAG[k]) sOn(SEC_FLAG[k], true);
    placeAt(k); close(); change();
    setTimeout(function () { var el = elFor(k); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); else toast('That section has nothing to show yet. Fill it in from your portal\'s quick edits.'); }, 60);
  }

  // ---- dialogs ------------------------------------------------------------------------------------------------
  function close() { var o = $('.ed-ov'); if (o) o.remove(); }
  function dialog(html) { close(); var o = document.createElement('div'); o.className = 'ed-ov'; o.innerHTML = '<div class="ed-dlg" role="dialog" aria-modal="true">' + html + '</div>'; o.addEventListener('mousedown', function (e) { if (e.target === o) close(); }); document.body.appendChild(o); return $('.ed-dlg', o); }
  /** Shown the first time someone opens the editor, and from More > "Show me how this works". */
  function guide() {
    mark('wced-guide');
    var d = dialog('<h3>How to change your page</h3><p class="h">Nothing on your site changes until you press Save, so feel free to try things.</p><ul class="ed-steps">' +
      '<li><i>✏️</i><div><b>Click any words to change them</b><span>Type the new words, then click somewhere else.</span></div></li>' +
      '<li><i>↕️</i><div><b>Move a section</b><span>Each section has Up and Down buttons. On a computer you can also hold Drag and pull it where you want.</span></div></li>' +
      '<li><i>➕</i><div><b>Add something new</b><span>Press Add to put in text, a picture, a button, boxes, tabs, a video or a booking calendar.</span></div></li>' +
      '<li><i>📄</i><div><b>Add more pages</b><span>Press Pages to add a page with its own address, and choose if it goes in a drop-down menu.</span></div></li>' +
      '<li><i>↶</i><div><b>Made a mistake?</b><span>Press Undo to take back your last change. Under More you can save a backup and go back to it any time.</span></div></li>' +
      '<li><i>✅</i><div><b>Press Save when you like it</b><span>' + (PORTAL ? 'Your live site updates in under a minute.' : 'Your preview keeps the changes.') + '</span></div></li></ul>' +
      '<div class="row"><span class="sp"></span><button class="ed-btn go" id="ed-got">Got it</button></div>');
    $('#ed-got', d).onclick = close;
  }
  function more() {
    var d = dialog('<h3>More</h3><p class="h">A backup is a copy of your whole site that you can always go back to.</p><div class="ed-types one">' +
      '<button data-m="backup"><i>💾</i>Save a backup<small>Keep a copy of your site the way it is right now</small></button>' +
      '<button data-m="restore"><i>⏪</i>Go back to my backup<small>' + (backupAt ? 'Your backup is from ' + esc(day(backupAt)) : 'Put your site back the way it was when you saved the backup') + '</small></button>' +
      '<button data-m="guide"><i>❓</i>Show me how this works<small>A short list of what you can do here</small></button></div>' +
      '<div class="row"><span class="sp"></span><button class="ed-btn" data-m="x">Close</button></div>');
    d.onclick = function (e) { var b = e.target.closest('[data-m]'); if (!b) return; var m = b.getAttribute('data-m'); close(); if (m === 'guide') guide(); else if (m !== 'x') backup(m); };
  }
  function addMenu(at) {
    addAt = at;
    var have = shown(), feats = [];
    if (!CP()) {
      if (have.indexOf('book') < 0) feats.push(['book', '📅', 'Booking calendar', 'Customers pick a day and time']);
      if (!document.getElementById('wc-order')) feats.push(['order', '🧾', 'Order form', 'Order ahead from your list']);
      if (have.indexOf('ask') < 0) feats.push(['ask', '✉️', 'Message form', 'A contact or quote form']);
      ['menu', 'gallery', 'faq', 'why', 'steps', 'areas', 'reviews'].forEach(function (k) { if (have.indexOf(k) < 0 && (page.has[k] || (A.hide || []).indexOf(k) > -1 || k === 'menu' || k === 'faq')) feats.push([k, '↩️', NAMES[k], 'Bring this section back']); });
    }
    var d = dialog('<h3>Add to this page</h3><p class="h">Pick what to add. You can move it or change it afterwards.</p><div class="ed-types">' +
      TYPES.map(function (t) { return '<button data-t="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '<small>' + t[3] + '</small></button>'; }).join('') +
      feats.map(function (t) { return '<button data-s="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '<small>' + t[3] + '</small></button>'; }).join('') +
      '<button data-p="1"><i>📄</i>A whole new page<small>With its own address and menu link</small></button></div><div class="row"><span class="sp"></span><button class="ed-btn" data-x>Cancel</button></div>');
    d.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) return close();
      if (b.getAttribute('data-p')) return editPage(null);
      if (b.getAttribute('data-s')) return bringBack(b.getAttribute('data-s'));
      if (b.getAttribute('data-t')) { if (blocks().length >= 14) { close(); return toast('This page is full (14 blocks). Delete one, or add a new page.'); } editBlock({ id: rid(), type: b.getAttribute('data-t') }, true); }
    };
  }
  function pagesDialog() {
    var ps = A.pages || [], cur = page.pg;
    var d = dialog('<h3>Your pages</h3><p class="h">Each page has its own address. Open one to change what is on it.</p>' +
      '<div class="ed-pg' + (cur ? '' : ' cur') + '"><div><b>Home</b><small>Your main page</small></div>' + (cur ? '<button class="ed-btn" data-go="">Open</button>' : '<small>You are here</small>') + '</div>' +
      ps.map(function (x, i) {
        return '<div class="ed-pg' + (cur === x.path ? ' cur' : '') + '"><div><b>' + esc(x.title) + '</b><small>/' + esc(x.path) + ' · ' + (x.menu === 0 ? 'not in the menu' : x.group ? 'in the “' + esc(x.group) + '” drop-down' : 'in the top menu') + '</small></div>' +
          (cur === x.path ? '' : '<button class="ed-btn" data-go="' + esc(x.path) + '">Open</button>') + '<button class="ed-btn" data-set="' + i + '">Settings</button><button class="ed-btn" data-rm="' + i + '">Delete</button></div>';
      }).join('') +
      '<div class="row">' + (ps.length < 10 ? '<button class="ed-btn go" id="ed-newpg">+ Add a page</button>' : '<span class="hint">You have 10 pages, the most a site can hold.</span>') + '<span class="sp"></span><button class="ed-btn" data-x>Close</button></div>');
    d.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) return close();
      if (b.id === 'ed-newpg') return editPage(null);
      if (b.hasAttribute('data-go')) { close(); return go(b.getAttribute('data-go')); }
      if (b.hasAttribute('data-set')) return editPage(ps[Number(b.getAttribute('data-set'))]);
      if (b.hasAttribute('data-rm')) {
        var x = ps[Number(b.getAttribute('data-rm'))];
        if (!window.confirm('Delete the “' + x.title + '” page and everything on it?')) return;
        A.pages = ps.filter(function (y) { return y !== x; });
        if (cur === x.path) window.wcGo('');
        change(); title(); toast('Page deleted. Press Undo to bring it back.'); pagesDialog();
      }
    };
  }
  /** Add a page (pg null) or change a page's name, address and where it sits in the menu. */
  function editPage(pg) {
    var isNew = !pg, ps = A.pages || [], groups = [];
    ps.forEach(function (x) { if (x.group && groups.indexOf(x.group) < 0) groups.push(x.group); });
    if (isNew && ps.length >= 10) { close(); return toast('You have 10 pages, the most a site can hold.'); }
    pg = pg || { title: '', path: '', blocks: [] };
    var where = pg.menu === 0 ? 'none' : pg.group ? 'g:' + pg.group : 'top';
    var d = dialog('<h3>' + (isNew ? 'Add a page' : 'Page settings') + '</h3><p class="h">' + (isNew ? 'Give the page a name. We do the rest, and you can fill the page in next.' : 'Change the name, the address, or where it shows in your menu.') + '</p>' +
      '<label for="ed-pt">Page name</label><input type="text" id="ed-pt" maxlength="40" placeholder="Catering" value="' + esc(pg.title) + '">' +
      '<label for="ed-pp">Its address <small>(made for you; change it only if you want to)</small></label><div class="ed-adr"><span>yoursite.com/</span><input type="text" id="ed-pp" maxlength="61" placeholder="catering" value="' + esc(pg.path) + '" autocapitalize="off" spellcheck="false"></div>' +
      '<p class="hint">For an address like yoursite.com/services/lawn, type services/lawn.</p>' +
      '<label for="ed-pw">Where should people find it?</label><select id="ed-pw"><option value="top">In the menu at the top</option>' +
      groups.map(function (g) { return '<option value="g:' + esc(g) + '">Inside the “' + esc(g) + '” drop-down</option>'; }).join('') +
      '<option value="new">Inside a new drop-down menu…</option><option value="none">Nowhere (only by its address or a button)</option></select>' +
      '<div id="ed-pgw"><label for="ed-pg">Name on the drop-down</label><input type="text" id="ed-pg" maxlength="24" placeholder="Services"><p class="hint">People click this name in your menu and the pages inside drop down.</p></div>' +
      '<p class="ed-msg" id="ed-msg"></p><div class="row"><span class="sp"></span><button class="ed-btn" id="ed-cancel">Cancel</button><button class="ed-btn go" id="ed-ok">' + (isNew ? 'Add the page' : 'Done') + '</button></div>');
    var t = $('#ed-pt', d), p = $('#ed-pp', d), w = $('#ed-pw', d), gw = $('#ed-pgw', d), touched = !isNew;
    w.value = where;
    function sync() { gw.style.display = w.value === 'new' ? '' : 'none'; }
    w.onchange = sync; sync();
    t.oninput = function () { if (!touched) p.value = slug(t.value); };
    p.oninput = function () { touched = true; };
    function msg(m) { $('#ed-msg', d).textContent = m || ''; }
    $('#ed-cancel', d).onclick = function () { if (isNew) close(); else pagesDialog(); };
    $('#ed-ok', d).onclick = function () {
      var name = t.value.replace(/\s+/g, ' ').trim(), path = p.value.toLowerCase().split('/').map(slug).filter(Boolean).slice(0, 2).join('/') || slug(name);
      if (!name) return msg('Type a name for the page.');
      if (!PATH.test(path)) return msg('The address can use letters, numbers and dashes.');
      if (RESERVED.test(path)) return msg('That address is already used by the site. Try a different one.');
      if (ps.some(function (x) { return x !== pg && x.path === path; })) return msg('Another page already has that address.');
      var group = w.value === 'new' ? $('#ed-pg', d).value.replace(/\s+/g, ' ').trim() : w.value.indexOf('g:') === 0 ? w.value.slice(2) : '';
      if (w.value === 'new' && !group) return msg('Type the name people will see on the drop-down.');
      var was = pg.path, here = !isNew && page.pg === was;
      pg.title = name; pg.path = path; delete pg.menu; delete pg.group;
      if (w.value === 'none') pg.menu = 0; else if (group) pg.group = group;
      if (isNew) A.pages = ps.concat([pg]);
      close();
      if (isNew || here) window.wcGo(path);
      change(); title();
      if (isNew) { window.scrollTo(0, 0); toast('Page added. Press “+ Add something to this page” to fill it in.'); }
    };
    t.focus();
  }
  function field(id, label, v, max, big) { return '<label for="ed-' + id + '">' + label + '</label>' + (big ? '<textarea id="ed-' + id + '" maxlength="' + max + '">' + esc(v || '') + '</textarea>' : '<input type="text" id="ed-' + id + '" maxlength="' + max + '" value="' + esc(v || '') + '">'); }
  function editBlock(b0, isNew) {
    var b = clone(b0), t = b.type, name = (TYPES.filter(function (x) { return x[0] === t; })[0] || [])[2];
    var btn = '<label for="ed-label">Words on the button <small>(leave empty for no button)</small></label><input type="text" id="ed-label" maxlength="30" value="' + esc(b.label || '') + '" placeholder="Call now">' +
      '<label for="ed-act">What happens when someone taps it</label><select id="ed-act">' + ACTS.map(function (a) { return '<option value="' + a[0] + '"' + (b.act === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') +
      (A.pages || []).map(function (x) { return '<option value="pg:' + esc(x.path) + '">Open your “' + esc(x.title) + '” page</option>'; }).join('') + '</select>' +
      '<div id="ed-urlw"><label for="ed-url">Web link</label><input type="url" id="ed-url" maxlength="300" placeholder="https://" value="' + esc(b.url || '') + '"></div>';
    var photo = '<label>Photo</label><div class="ed-ph"><span id="ed-phv"></span><div style="flex:1;min-width:0"><div style="display:flex;gap:6px"><input type="text" id="ed-pq" maxlength="50" placeholder="Search free photos: bread, haircut…"><button type="button" class="ed-btn" id="ed-pfind">Search</button></div>' +
      (PORTAL && !E.demo ? '<label style="margin-top:8px">or upload your own</label><input type="file" id="ed-pfile" accept="image/*">' : '') + '</div></div><div class="ed-pick" id="ed-pick"></div>';
    var body = t === 'text' ? field('h', 'Heading', b.h, 80) + field('p', 'Text', b.p, 900, 1) + btn
      : t === 'image' ? photo + field('cap', 'Caption (optional)', b.cap, 120)
      : t === 'split' ? photo + field('h', 'Heading', b.h, 80) + field('p', 'Text', b.p, 900, 1) + '<label><input type="checkbox" id="ed-flip"' + (b.flip ? ' checked' : '') + '> Put the photo on the right</label>' + btn
      : t === 'button' ? field('h', 'Heading (optional)', b.h, 80) + field('p', 'A line of text (optional)', b.p, 200) + btn
      : t === 'boxes' ? field('h', 'Heading (optional)', b.h, 80) + [0, 1, 2, 3].map(function (i) { var r = (b.items || [])[i] || []; return '<label>Box ' + (i + 1) + '</label><input type="text" class="ed-bt" maxlength="40" placeholder="Title" value="' + esc(r[0] || '') + '"><input type="text" class="ed-bx" maxlength="200" placeholder="Text" style="margin-top:6px" value="' + esc(r[1] || '') + '">'; }).join('')
      : t === 'tabs' ? field('h', 'Heading (optional)', b.h, 80) + '<p class="hint">Visitors click a tab’s name to see its words. Fill in at least two; leave the rest empty.</p>' + [0, 1, 2, 3, 4].map(function (i) { var r = (b.items || [])[i] || []; return '<label>Tab ' + (i + 1) + '</label><input type="text" class="ed-bt" maxlength="30" placeholder="Name on the tab" value="' + esc(r[0] || '') + '"><textarea class="ed-bx sm" maxlength="900" placeholder="What shows when it is clicked">' + esc(r[1] || '') + '</textarea>'; }).join('')
      : field('h', 'Heading (optional)', b.h, 80) + '<label for="ed-yt">YouTube link</label><input type="url" id="ed-yt" maxlength="200" placeholder="https://www.youtube.com/watch?v=…" value="' + esc(b.yt ? 'https://youtu.be/' + b.yt : '') + '">';
    var d = dialog('<h3>' + (isNew ? 'Add: ' : 'Edit: ') + esc(name) + '</h3>' + body + '<p class="ed-msg" id="ed-msg"></p><div class="row">' + (isNew ? '' : '<button class="ed-btn" id="ed-del">Delete</button>') + '<span class="sp"></span><button class="ed-btn" id="ed-cancel">Cancel</button><button class="ed-btn go" id="ed-ok">' + (isNew ? 'Add it' : 'Done') + '</button></div>');
    function msg(m, ok) { var el = $('#ed-msg', d); el.textContent = m || ''; el.className = 'ed-msg' + (ok ? ' ok' : ''); }
    function val(id) { var el = $('#ed-' + id, d); return el ? el.value.trim() : ''; }
    function phv() { var el = $('#ed-phv', d); if (el) el.innerHTML = b.photo ? '<img src="' + esc(thumb(b.photo)) + '" alt="">' : '<span class="none">No photo yet</span>'; }
    phv();
    var act = $('#ed-act', d), urlw = $('#ed-urlw', d);
    if (act) {
      // A button can also open one of the site's own pages (act 'page', pg = the page's address).
      if (b.act === 'page' && (A.pages || []).some(function (x) { return x.path === b.pg; })) act.value = 'pg:' + b.pg;
      var sync = function () { urlw.style.display = act.value === 'link' ? '' : 'none'; }; act.onchange = sync; sync();
    }
    if ($('#ed-pfind', d)) {
      $('#ed-pfind', d).onclick = function () {
        var q = val('pq'); if (q.length < 3) return msg('Type what the photo should show.');
        msg('Searching…', true);
        post('/api/portal/photos', PORTAL ? Object.assign({ q: q }, E.auth) : { q: q, p: E.slug, key: E.key }).then(function (j) {
          if (j.error) return msg(j.error);
          msg(j.photos.length ? 'Tap a photo to use it.' : 'Nothing found. Try simpler words.', j.photos.length > 0);
          var pk = $('#ed-pick', d); pk.innerHTML = j.photos.map(function (o, i) { return '<button type="button" data-i="' + i + '"><img src="' + esc(thumb(o)) + '" alt="" loading="lazy"></button>'; }).join('');
          pk.onclick = function (e) { var x = e.target.closest('button'); if (x) { b.photo = j.photos[Number(x.getAttribute('data-i'))]; phv(); msg('Photo chosen.', true); } };
        });
      };
      $('#ed-pq', d).onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#ed-pfind', d).click(); } };
    }
    if ($('#ed-pfile', d)) $('#ed-pfile', d).onchange = function () {
      var f = this.files[0]; if (!f) return;
      msg('Uploading…', true);
      var img = new Image(), u = URL.createObjectURL(f);
      img.onerror = function () { msg('That file isn\'t a photo we can use. Try a JPG or PNG.'); };
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (blob) {
          if (!blob) return msg('That photo didn\'t work. Try another one.');
          fetch('/api/portal/upload?' + new URLSearchParams({ o: E.auth.o, x: E.auth.x || 0, k: E.auth.k || '' }), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).then(function (r) { return r.json(); })
            .then(function (j) { if (j.error) return msg(j.error); b.photo = j.photo; phv(); msg('Photo uploaded.', true); }, function () { msg('No connection. Try again.'); });
        }, 'image/jpeg', 0.84);
      };
      img.src = u;
    };
    $('#ed-cancel', d).onclick = close;
    if ($('#ed-del', d)) $('#ed-del', d).onclick = function () { close(); remove('b:' + b.id); };
    $('#ed-ok', d).onclick = function () {
      ['h', 'p', 'cap'].forEach(function (k) { if ($('#ed-' + k, d)) b[k] = val(k); });
      if (act) {
        b.label = val('label'); delete b.pg;
        if (act.value.indexOf('pg:') === 0) { b.act = 'page'; b.pg = act.value.slice(3); delete b.url; }
        else { b.act = act.value; b.url = val('url'); if (b.label && b.act === 'link' && !/\./.test(b.url)) return msg('Add the web link for the button.'); }
        if (!b.label) { delete b.act; delete b.url; delete b.pg; }
      }
      if ($('#ed-flip', d)) b.flip = $('#ed-flip', d).checked ? 1 : 0;
      if (t === 'boxes' || t === 'tabs') { var ts = d.querySelectorAll('.ed-bt'), xs = d.querySelectorAll('.ed-bx'); b.items = [].map.call(ts, function (n, i) { return [n.value.trim(), xs[i].value.replace(/\s+/g, ' ').trim()]; }).filter(function (r) { return r[0] && r[1]; }); if (!b.items.length) return msg(t === 'tabs' ? 'Fill in at least one tab (its name and its words).' : 'Fill in at least one box (title and text).'); }
      if (t === 'video') { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/.exec(val('yt')); if (!m) return msg('Paste a YouTube link.'); b.yt = m[1]; }
      if (t === 'text' && !b.h && !b.p) return msg('Add a heading or some text.');
      if (t === 'image' && !b.photo) return msg('Pick a photo first.');
      if (t === 'split' && !b.h && !b.p && !b.photo) return msg('Add a photo or some words.');
      if (t === 'button' && !b.label) return msg('Add the words for the button.');
      if (isNew) { setBlocks(blocks().concat([b])); placeAt('b:' + b.id); } else setBlocks(blocks().map(function (x) { return x.id === b.id ? b : x; }));
      close(); change();
      if (isNew) setTimeout(function () { var el = elFor('b:' + b.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
    };
  }

  // ---- saving and backups -------------------------------------------------------------------------------------
  function post(url, body, method) {
    return fetch(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).catch(function () { return { error: 'No connection. Check your internet and try again.' }; });
  }
  /** Show what the server now holds. */
  function loaded(j) {
    if (j.backupAt) backupAt = j.backupAt;
    if (PORTAL) { copyW = null; dropExtra = false; settle(j.site.answers); page.redraw(j.site.answers, j.site.copy, j.site.contact || {}); }
    else { settle(j.answers); page.rerender(j.answers); }
    setDirty(false); title();
  }
  /** Saves the page. Resolves true when it worked. */
  function save() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var patch = { blocks: A.blocks || [], order: A.order || [], hide: A.hide || [], pages: A.pages || [], f: A.f || {}, s: A.s || '', tag: A.tag || '' };
    var b = $('.ed-save'); b.disabled = true; b.textContent = 'Saving…';
    var done = function (j) {
      if (j.error) { setDirty(true); toast(j.error); return false; }
      hit('editor_save'); loaded(j);
      toast(E.demo ? 'Demo: that would be saved to your site.' : PORTAL ? 'Saved. Your site updates in under a minute.' : 'Saved.');
      return true;
    };
    if (PORTAL) { if (dropExtra) patch.extra = []; return post('/api/portal/save', Object.assign({ full: true, patch: patch }, E.auth)).then(done); }
    return post('/api/preview/' + E.slug, Object.assign({ key: E.key }, patch), 'PATCH').then(done);
  }
  /** what = 'backup' keeps a copy of the saved site; 'restore' puts that copy back. */
  function backup(what) {
    if (what === 'restore') {
      if (E.demo) return toast('Demo: your site would go back to your backup.');
      if (!window.confirm((backupAt ? 'Go back to your backup from ' + day(backupAt) + '?' : 'Go back to your backup?') + ' Your site will look the way it did then. Changes made since then will be gone.')) return;
      return (PORTAL ? post('/api/portal/restore', Object.assign({ full: true }, E.auth)) : post('/api/preview/' + E.slug, { key: E.key, backup: 'restore' }, 'PATCH')).then(function (j) {
        if (j.error) return toast(j.error);
        hist = []; loaded(j); toast('Done. Your site is back to your backup.');
      });
    }
    // A backup holds what is saved, so anything not saved yet is saved first.
    return (dirty ? save() : Promise.resolve(true)).then(function (ok) {
      if (!ok) return;
      return (PORTAL ? post('/api/portal/backup', Object.assign({ full: true }, E.auth)) : post('/api/preview/' + E.slug, { key: E.key, backup: 'save' }, 'PATCH')).then(function (j) {
        if (j.error) return toast(j.error);
        backupAt = j.backupAt || new Date().toISOString();
        toast(E.demo ? 'Demo: a backup would be saved.' : 'Backup saved. You can go back to it any time from More.');
      });
    });
  }

  // ---- clicks and drags ---------------------------------------------------------------------------------------
  document.addEventListener('click', function (e) {
    if (!active) return;
    var b = e.target.closest('[data-ed]'), sec = e.target.closest('.ed-sec');
    if (b) {
      var act = b.getAttribute('data-ed'), k = sec ? sec.getAttribute('data-k') : '', keys = shown(), i = keys.indexOf(k);
      e.preventDefault();
      if (act === 'add') addMenu(-1);
      else if (act === 'addat') addMenu(Number(b.getAttribute('data-i')));
      else if (act === 'pages') pagesDialog();
      else if (act === 'undo') undo();
      else if (act === 'more') more();
      else if (act === 'save') save();
      else if (act === 'exit') stop();
      else if (act === 'up') move(k, i - 1);
      else if (act === 'down') move(k, i + 2);
      else if (act === 'edit') editBlock(block(k.slice(2)), false);
      else if (act === 'del') remove(k);
      return;
    }
    // While editing, links and buttons on the page don't leave the editor. Menu links to the site's own pages open that page here.
    var a = e.target.closest('#site a'); if (!a || e.target.closest('.ed-tb')) return;
    e.preventDefault();
    if (e.target.closest('[data-edit]') || page.base == null) return;
    var u; try { u = new URL(a.href); } catch (x) { return; }
    if (u.origin !== location.origin) return;
    var path = u.pathname.replace(/\/+$/, ''), root = page.base.replace(/\/+$/, '');
    if (path !== root && path.indexOf(root + '/') !== 0) return;
    var to = path.slice(root.length + 1);
    if (to && !(A.pages || []).some(function (x) { return x.path === to; })) return;
    if (to !== (page.pg || '')) go(to, u.hash.slice(1));
  }, true);
  document.addEventListener('dragstart', function (e) {
    var g = e.target.closest && e.target.closest('.ed-grip'); if (!active || !g) return;
    var sec = g.closest('.ed-sec'); dragKey = sec.getAttribute('data-k'); sec.classList.add('ed-dragging');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragKey); e.dataTransfer.setDragImage(sec, 40, 20); } catch (x) {}
  });
  function clearDrop() { [].forEach.call(document.querySelectorAll('.ed-drop-a,.ed-drop-b'), function (n) { n.classList.remove('ed-drop-a', 'ed-drop-b'); }); }
  document.addEventListener('dragover', function (e) {
    if (!dragKey) return;
    var sec = e.target.closest && e.target.closest('.ed-sec'); if (!sec) return;
    e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x) {} clearDrop();
    var r = sec.getBoundingClientRect(); sec.classList.add(e.clientY < r.top + r.height / 2 ? 'ed-drop-a' : 'ed-drop-b');
  });
  document.addEventListener('drop', function (e) {
    if (!dragKey) return;
    var sec = e.target.closest && e.target.closest('.ed-sec'), k = dragKey; dragKey = '';
    if (sec) { e.preventDefault(); var r = sec.getBoundingClientRect(), i = shown().indexOf(sec.getAttribute('data-k')); clearDrop(); if (sec.getAttribute('data-k') !== k) move(k, e.clientY < r.top + r.height / 2 ? i : i + 1); }
  });
  document.addEventListener('dragend', function () { dragKey = ''; clearDrop(); [].forEach.call(document.querySelectorAll('.ed-dragging'), function (n) { n.classList.remove('ed-dragging'); }); });

  window.wcEditor = { decorate: decorate, start: start };
  if (window.wcPage) decorate(window.wcPage);
})();
