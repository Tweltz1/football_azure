// The page editor for Weltzcraft-built sites. Loaded by sample.js for the person who may change a page:
//   - the maker of a free preview (they hold its edit key), from the "Edit page" button, and
//   - the owner of a live site, at weltzcraft.com/portal/edit (signed in through the portal).
// With it they drag sections into a new order, click text to rewrite it, hide sections, and add their own blocks:
// text, a picture, a picture beside words, a button that does something, boxes, a video, the booking calendar,
// the order form or the message form. Everything is saved on the page's answers (blocks, order, hide, f, s, tag);
// the server (_worker.js: blocksOf / previewEdit / portalApply) cleans every field again.
(function () {
  var E = window.WC_EDIT;
  if (!E || window.wcEditor) return;
  var PORTAL = E.mode === 'portal';
  var active = false, dirty = false, page = null, A = null, copyW = null, dropExtra = false, dragKey = '', addAt = -1, base = null;
  var NAMES = { about: 'About', why: 'Why choose us', menu: 'Menu / list', steps: 'How it works', order: 'Ordering', book: 'Booking calendar', gallery: 'Gallery', reviews: 'Reviews', faq: 'Questions', areas: 'Areas served', ask: 'Message form', visit: 'Contact and map' };
  var SEC_FLAG = { menu: 'list', gallery: 'pics', faq: 'faq', steps: 'steps', areas: 'areas', reviews: 'review' };   // sections switched by the "s" list
  var ACTS = [['call', 'Call us'], ['email', 'Email us'], ['book', 'Open the booking calendar'], ['order', 'Open the order form'], ['message', 'Open the message form'], ['directions', 'Get directions'], ['link', 'Open a web link']];
  var TYPES = [['text', '📝', 'Text', 'A heading and a paragraph'], ['image', '🖼️', 'Picture', 'One big photo with a caption'], ['split', '🧩', 'Picture + words', 'A photo beside a heading and text'],
    ['button', '🔘', 'Button', 'Call, email, book, order, directions or a link'], ['boxes', '🗂️', 'Boxes', 'Up to 4 boxes side by side'], ['video', '▶️', 'Video', 'A YouTube video']];
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function hit(e) { if (window.wcHit) window.wcHit(e); }
  function rid() { var s = ''; while (s.length < 6) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
  function thumb(o) { return '/img/x?u=' + encodeURIComponent(o.s || o.u); }

  var css = document.createElement('style');
  css.textContent = '.ed-on{padding-top:54px}.ed-on .hd{top:54px}' +
    '.ed-bar{position:fixed;left:0;right:0;top:0;height:54px;z-index:9000;background:#12100c;color:#f6efe2;display:flex;align-items:center;gap:10px;padding:0 14px;font:600 14.5px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    '.ed-bar span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ed-bar small{color:#b4aa98;font-weight:500}' +
    '.ed-btn{font:700 14px system-ui,sans-serif;border:0;border-radius:10px;padding:9px 14px;background:#2a2620;color:#f6efe2;cursor:pointer;white-space:nowrap}.ed-btn.go{background:linear-gradient(135deg,#ff8a3c,#ffc061);color:#221502}.ed-btn:disabled{opacity:.5;cursor:default}' +
    '.ed-on .cz-open,.ed-on .cz-box,.ed-on .mbar{display:none!important}.ed-launch{position:fixed;left:16px;bottom:16px;z-index:8000;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:13px 18px;border-radius:999px;font-size:15px}.has-mbar .ed-launch{bottom:84px}' +
    '.ed-sec{position:relative;outline:2px dashed transparent;outline-offset:-2px;transition:outline-color .15s}.ed-sec:hover,.ed-sec.ed-hot{outline-color:rgba(255,138,60,.7)}' +
    '.ed-tb{position:absolute;right:10px;top:10px;z-index:50;display:flex;gap:4px;align-items:center;background:#12100c;border-radius:12px;padding:5px;box-shadow:0 8px 22px rgba(0,0,0,.3);opacity:.92}' +
    '.ed-tb b{color:#f6efe2;font:700 12.5px system-ui,sans-serif;padding:0 8px 0 6px;white-space:nowrap}' +
    '.ed-tb button{width:34px;height:34px;border:0;border-radius:8px;background:#2a2620;color:#f6efe2;font-size:16px;cursor:pointer;padding:0;line-height:1}.ed-tb button:hover{background:#ff8a3c;color:#221502}.ed-tb .ed-grip{cursor:grab;width:34px;height:34px;border-radius:8px;background:#2a2620;color:#f6efe2;font-size:16px;display:grid;place-items:center;user-select:none}' +
    '.ed-add{display:flex;justify-content:center;height:0;position:relative;z-index:40}.ed-add button{transform:translateY(-50%);font:700 13.5px system-ui,sans-serif;border:2px solid #ff8a3c;background:#fff;color:#b8501a;border-radius:999px;padding:6px 14px;cursor:pointer;opacity:.55}.ed-add button:hover{opacity:1;background:#ff8a3c;color:#fff}' +
    '.ed-add.end{height:auto;padding:22px 0}.ed-add.end button{transform:none;opacity:1}' +
    '.ed-drop-a{box-shadow:inset 0 5px 0 #ff8a3c}.ed-drop-b{box-shadow:inset 0 -5px 0 #ff8a3c}.ed-dragging{opacity:.45}' +
    '.ed-on [data-edit]{outline:1px dashed rgba(255,138,60,.6);outline-offset:4px;border-radius:4px;cursor:text;min-width:40px}.ed-on [data-edit]:focus{outline:2px solid #ff8a3c;background:rgba(255,138,60,.08)}' +
    '.ed-ov{position:fixed;inset:0;z-index:9500;background:rgba(10,8,6,.6);display:flex;align-items:flex-end;justify-content:center}@media(min-width:640px){.ed-ov{align-items:center}}' +
    '.ed-dlg{background:#1a1713;color:#f6efe2;width:min(560px,100%);max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;padding:20px;font:15px/1.5 system-ui,sans-serif}@media(min-width:640px){.ed-dlg{border-radius:20px}}' +
    '.ed-dlg h3{font:800 20px system-ui,sans-serif;margin:0 0 4px}.ed-dlg p.h{color:#b4aa98;margin:0 0 12px;font-size:14px}.ed-dlg label{display:block;font-weight:600;font-size:13.5px;margin:12px 0 5px}' +
    '.ed-dlg input[type=text],.ed-dlg input[type=url],.ed-dlg textarea,.ed-dlg select{width:100%;font:500 16px system-ui,sans-serif;padding:11px 12px;border-radius:10px;border:1.5px solid rgba(255,240,215,.16);background:rgba(255,240,215,.05);color:#f6efe2}.ed-dlg select option{background:#1a1713}' +
    '.ed-dlg textarea{min-height:96px;resize:vertical}.ed-dlg .row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.ed-dlg .row .sp{flex:1}' +
    '.ed-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ed-types button{text-align:left;border:1.5px solid rgba(255,240,215,.14);background:rgba(255,240,215,.04);color:#f6efe2;border-radius:14px;padding:12px;cursor:pointer;font:600 15px system-ui,sans-serif}.ed-types button:hover{border-color:#ff8a3c}.ed-types small{display:block;color:#b4aa98;font-weight:500;font-size:12.5px;margin-top:2px}.ed-types i{font-style:normal;margin-right:6px}' +
    '.ed-ph{display:flex;gap:10px;align-items:center}.ed-ph img,.ed-ph .none{width:110px;height:82px;object-fit:cover;border-radius:10px;background:#2a2620;display:grid;place-items:center;color:#b4aa98;font-size:12px;flex:none}' +
    '.ed-pick{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}.ed-pick button{padding:0;border:0;aspect-ratio:4/3;border-radius:8px;overflow:hidden;cursor:pointer;background:#2a2620}.ed-pick img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ed-msg{font-size:13.5px;color:#ff8f7a;min-height:1em;margin:8px 0 0}.ed-msg.ok{color:#5fd38d}' +
    '.ed-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9600;background:#f6efe2;color:#1a1713;font:600 15px system-ui,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 18px 40px -12px #000;max-width:calc(100vw - 32px)}' +
    '@media(max-width:560px){.ed-tb b{display:none}.ed-bar small{display:none}}';
  document.head.appendChild(css);

  var toastT;
  function toast(t) { var el = $('.ed-toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'ed-toast' })); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 3500); }
  function setDirty(v) { dirty = v; var b = $('.ed-save'); if (b) { b.disabled = !v; b.textContent = v ? 'Save' : 'Saved'; } }
  function draw() { if (copyW) page.redraw(A, copyW, page.live); else page.rerender(A); }
  function change() { setDirty(true); draw(); }
  function block(id) { return (A.blocks || []).filter(function (b) { return b.id === id; })[0]; }

  // ---- start / stop -------------------------------------------------------------------------------------------
  function start() {
    if (active || !page) return;
    active = true; A = clone(page.a); copyW = null; dropExtra = false;
    // "Extra sections" written in the portal become ordinary text blocks here, so they can be moved and edited like the rest.
    var extra = page.copy && page.copy.extra;
    if (PORTAL && extra && extra.length) {
      A.blocks = (A.blocks || []).concat(extra.map(function (x) { return { id: rid(), type: 'text', h: x[0], p: x[1] }; }));
      copyW = Object.assign({}, page.copy, { extra: [] }); dropExtra = true;
    }
    document.documentElement.classList.add('ed-on');
    var bar = document.createElement('div'); bar.className = 'ed-bar';
    bar.innerHTML = '<span>✏️ Editing' + (E.name ? ' ' + esc(E.name) : '') + ' <small>· drag sections, click text, add blocks</small></span><button class="ed-btn" data-ed="add">+ Add</button><button class="ed-btn go ed-save" data-ed="save" disabled>Saved</button><button class="ed-btn" data-ed="exit">' + (PORTAL ? 'Back' : 'Done') + '</button>';
    document.body.appendChild(bar);
    var l = $('.ed-launch'); if (l) l.hidden = true;
    hit('editor_open'); draw();
  }
  function stop() {
    if (dirty && !confirmLeave()) return;
    if (PORTAL) { dirty = false; location.href = '/portal' + (E.demo ? '?demo=1' : ''); return; }
    active = false; dirty = false; document.documentElement.classList.remove('ed-on');
    var bar = $('.ed-bar'); if (bar) bar.remove();
    var l = $('.ed-launch'); if (l) l.hidden = false;
    page.rerender(base);
  }
  function confirmLeave() { return window.confirm('You have changes that aren\'t saved. Leave without saving?'); }
  window.addEventListener('beforeunload', function (e) { if (active && dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---- drawing the handles on the page ------------------------------------------------------------------------
  function elFor(k) { return document.getElementById(k.indexOf('b:') === 0 ? 'b-' + k.slice(2) : k); }
  function shown() { return page.order.filter(function (k) { return elFor(k); }); }
  function decorate(pg) {
    page = pg;
    if (!base) base = page.a;
    if (!active) {
      if (!PORTAL && !$('.ed-launch')) { var b = document.createElement('button'); b.className = 'ed-btn go ed-launch'; b.textContent = '✏️ Edit page'; b.onclick = start; document.body.appendChild(b); }
      if (PORTAL) start();
      return;
    }
    var keys = shown();
    keys.forEach(function (k, i) {
      var el = elFor(k), isBlock = k.indexOf('b:') === 0, b = isBlock ? block(k.slice(2)) : null;
      el.classList.add('ed-sec'); el.setAttribute('data-k', k);
      var name = isBlock ? (TYPES.filter(function (t) { return b && t[0] === b.type; })[0] || [])[2] || 'Block' : NAMES[k] || k;
      var tb = document.createElement('div'); tb.className = 'ed-tb'; tb.setAttribute('contenteditable', 'false');
      tb.innerHTML = '<b>' + esc(name) + '</b><span class="ed-grip" draggable="true" role="button" title="Drag to move" aria-label="Drag to move">⠿</span>' +
        (i > 0 ? '<button data-ed="up" title="Move up" aria-label="Move up">↑</button>' : '') + (i < keys.length - 1 ? '<button data-ed="down" title="Move down" aria-label="Move down">↓</button>' : '') +
        (isBlock ? '<button data-ed="edit" title="Edit" aria-label="Edit">✎</button>' : '') + (k !== 'about' && k !== 'visit' ? '<button data-ed="del" title="' + (isBlock ? 'Delete' : 'Hide') + '" aria-label="' + (isBlock ? 'Delete' : 'Hide') + '">✕</button>' : '');
      el.appendChild(tb);
      var add = document.createElement('div'); add.className = 'ed-add'; add.innerHTML = '<button type="button" data-ed="addat" data-i="' + i + '">+ Add here</button>';
      el.parentNode.insertBefore(add, el);
      if (isBlock) [].forEach.call(el.querySelectorAll('[data-f]'), function (n) { editable(n, function (v) { b[n.getAttribute('data-f')] = v; }); });
    });
    var last = keys.length ? elFor(keys[keys.length - 1]) : null;
    if (last) { var end = document.createElement('div'); end.className = 'ed-add end'; end.innerHTML = '<button type="button" data-ed="addat" data-i="' + keys.length + '">+ Add a block here</button>'; last.parentNode.insertBefore(end, last.nextSibling); }
    var lead = $('.hero .lead'); if (lead) editable(lead, function (v) { if (v) A.tag = v.slice(0, 80); });
  }
  /** Click-to-edit text: plain text only, saved into the page when the cursor leaves. */
  function editable(n, set) {
    n.setAttribute('data-edit', '1');
    try { n.contentEditable = 'plaintext-only'; } catch (e) { n.contentEditable = 'true'; }
    if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); n.blur(); } });
    n.addEventListener('paste', function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text'); document.execCommand('insertText', false, t.replace(/\s+/g, ' ')); });
    n.addEventListener('input', function () { setDirty(true); });
    n.addEventListener('blur', function () { set(n.textContent.replace(/\s+/g, ' ').trim()); });
  }

  // ---- moving, hiding, adding ---------------------------------------------------------------------------------
  function move(k, to) {
    var keys = shown(), from = keys.indexOf(k); if (from < 0) return;
    keys.splice(from, 1); keys.splice(Math.max(0, Math.min(keys.length, to > from ? to - 1 : to)), 0, k);
    // Sections that aren't on the page right now keep their place at the end of the saved order.
    A.order = keys.concat(page.order.filter(function (x) { return keys.indexOf(x) < 0; }));
    change();
  }
  function sOn(flag, on) { var s = (A.s || '').split(',').filter(function (x) { return x && x !== flag; }); if (on) s.push(flag); A.s = s.join(','); }
  function remove(k) {
    if (k.indexOf('b:') === 0) { A.blocks = (A.blocks || []).filter(function (b) { return 'b:' + b.id !== k; }); A.order = (A.order || []).filter(function (x) { return x !== k; }); return change(); }
    if (k === 'book') A.f = Object.assign({}, A.f, { book: 0 });
    else if (k === 'ask') A.f = Object.assign({}, A.f, { form: 'none' });
    else { if (k === 'order') A.f = Object.assign({}, A.f, { order: 0 }); A.hide = (A.hide || []).filter(function (x) { return x !== k; }).concat([k]); }
    change(); toast(NAMES[k] + ' hidden. Bring it back from "+ Add".');
  }
  function placeAt(k) {
    var keys = shown().filter(function (x) { return x !== k; });
    // From the top bar's "+ Add" a new piece lands just above the message form and contact section.
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
  function addMenu(at) {
    addAt = at;
    var have = shown(), F = page.F || {}, feats = [];
    if (have.indexOf('book') < 0) feats.push(['book', '📅', 'Booking calendar', 'Customers pick a day and time']);
    if (!document.getElementById('wc-order')) feats.push(['order', '🧾', 'Order form', 'Order ahead from your list']);
    if (have.indexOf('ask') < 0) feats.push(['ask', '✉️', 'Message form', 'A contact or quote form']);
    ['menu', 'gallery', 'faq', 'why', 'steps', 'areas', 'reviews'].forEach(function (k) { if (have.indexOf(k) < 0 && (page.has[k] || (A.hide || []).indexOf(k) > -1 || k === 'menu' || k === 'faq')) feats.push([k, '↩️', NAMES[k], 'Bring this section back']); });
    var d = dialog('<h3>Add to your page</h3><p class="h">Pick what to add. You can move it afterwards.</p><div class="ed-types">' +
      TYPES.map(function (t) { return '<button data-t="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '<small>' + t[3] + '</small></button>'; }).join('') +
      feats.map(function (t) { return '<button data-s="' + t[0] + '"><i>' + t[1] + '</i>' + t[2] + '<small>' + t[3] + '</small></button>'; }).join('') + '</div><div class="row"><span class="sp"></span><button class="ed-btn" data-x>Cancel</button></div>');
    d.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) return close();
      if (b.getAttribute('data-s')) return bringBack(b.getAttribute('data-s'));
      if (b.getAttribute('data-t')) editBlock({ id: rid(), type: b.getAttribute('data-t') }, true);
    };
  }
  function field(id, label, v, max, big) { return '<label for="ed-' + id + '">' + label + '</label>' + (big ? '<textarea id="ed-' + id + '" maxlength="' + max + '">' + esc(v || '') + '</textarea>' : '<input type="text" id="ed-' + id + '" maxlength="' + max + '" value="' + esc(v || '') + '">'); }
  function editBlock(b0, isNew) {
    var b = clone(b0), t = b.type, name = (TYPES.filter(function (x) { return x[0] === t; })[0] || [])[2];
    var btn = '<label for="ed-label">Button words <small style="color:#b4aa98">(leave empty for no button)</small></label><input type="text" id="ed-label" maxlength="30" value="' + esc(b.label || '') + '" placeholder="Call now">' +
      '<label for="ed-act">When tapped</label><select id="ed-act">' + ACTS.map(function (a) { return '<option value="' + a[0] + '"' + (b.act === a[0] ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select>' +
      '<div id="ed-urlw"><label for="ed-url">Web link</label><input type="url" id="ed-url" maxlength="300" placeholder="https://" value="' + esc(b.url || '') + '"></div>';
    var photo = '<label>Photo</label><div class="ed-ph"><span id="ed-phv"></span><div style="flex:1;min-width:0"><div style="display:flex;gap:6px"><input type="text" id="ed-pq" maxlength="50" placeholder="Search free photos: bread, haircut…"><button type="button" class="ed-btn" id="ed-pfind">Search</button></div>' +
      (PORTAL && !E.demo ? '<label style="margin-top:8px">or upload your own</label><input type="file" id="ed-pfile" accept="image/*">' : '') + '</div></div><div class="ed-pick" id="ed-pick"></div>';
    var body = t === 'text' ? field('h', 'Heading', b.h, 80) + field('p', 'Text', b.p, 900, 1) + btn
      : t === 'image' ? photo + field('cap', 'Caption (optional)', b.cap, 120)
      : t === 'split' ? photo + field('h', 'Heading', b.h, 80) + field('p', 'Text', b.p, 900, 1) + '<label><input type="checkbox" id="ed-flip"' + (b.flip ? ' checked' : '') + '> Put the photo on the right</label>' + btn
      : t === 'button' ? field('h', 'Heading (optional)', b.h, 80) + field('p', 'A line of text (optional)', b.p, 200) + btn
      : t === 'boxes' ? field('h', 'Heading (optional)', b.h, 80) + [0, 1, 2, 3].map(function (i) { var r = (b.items || [])[i] || []; return '<label>Box ' + (i + 1) + '</label><input type="text" class="ed-bt" maxlength="40" placeholder="Title" value="' + esc(r[0] || '') + '"><input type="text" class="ed-bx" maxlength="200" placeholder="Text" style="margin-top:6px" value="' + esc(r[1] || '') + '">'; }).join('')
      : field('h', 'Heading (optional)', b.h, 80) + '<label for="ed-yt">YouTube link</label><input type="url" id="ed-yt" maxlength="200" placeholder="https://www.youtube.com/watch?v=…" value="' + esc(b.yt ? 'https://youtu.be/' + b.yt : '') + '">';
    var d = dialog('<h3>' + (isNew ? 'Add: ' : 'Edit: ') + esc(name) + '</h3>' + body + '<p class="ed-msg" id="ed-msg"></p><div class="row">' + (isNew ? '' : '<button class="ed-btn" id="ed-del">Delete</button>') + '<span class="sp"></span><button class="ed-btn" id="ed-cancel">Cancel</button><button class="ed-btn go" id="ed-ok">' + (isNew ? 'Add it' : 'Done') + '</button></div>');
    function msg(m, ok) { var el = $('#ed-msg', d); el.textContent = m || ''; el.className = 'ed-msg' + (ok ? ' ok' : ''); }
    function val(id) { var el = $('#ed-' + id, d); return el ? el.value.trim() : ''; }
    function phv() { var el = $('#ed-phv', d); if (el) el.innerHTML = b.photo ? '<img src="' + esc(thumb(b.photo)) + '" alt="">' : '<span class="none">No photo yet</span>'; }
    phv();
    var act = $('#ed-act', d), urlw = $('#ed-urlw', d);
    if (act) { var sync = function () { urlw.hidden = act.value !== 'link'; urlw.style.display = act.value === 'link' ? '' : 'none'; }; act.onchange = sync; sync(); }
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
      if (act) { b.label = val('label'); b.act = act.value; b.url = val('url'); if (b.label && b.act === 'link' && !/\./.test(b.url)) return msg('Add the web link for the button.'); if (!b.label) { delete b.act; delete b.url; } }
      if ($('#ed-flip', d)) b.flip = $('#ed-flip', d).checked ? 1 : 0;
      if (t === 'boxes') { var ts = d.querySelectorAll('.ed-bt'), xs = d.querySelectorAll('.ed-bx'); b.items = [].map.call(ts, function (n, i) { return [n.value.trim(), xs[i].value.trim()]; }).filter(function (r) { return r[0] && r[1]; }); if (!b.items.length) return msg('Fill in at least one box (title and text).'); }
      if (t === 'video') { var m = /(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/.exec(val('yt')); if (!m) return msg('Paste a YouTube link.'); b.yt = m[1]; }
      if (t === 'text' && !b.h && !b.p) return msg('Add a heading or some text.');
      if (t === 'image' && !b.photo) return msg('Pick a photo first.');
      if (t === 'split' && !b.h && !b.p && !b.photo) return msg('Add a photo or some words.');
      if (t === 'button' && !b.label) return msg('Add the words for the button.');
      if (isNew) { A.blocks = (A.blocks || []).concat([b]); placeAt('b:' + b.id); } else A.blocks = A.blocks.map(function (x) { return x.id === b.id ? b : x; });
      close(); change();
      if (isNew) setTimeout(function () { var el = elFor('b:' + b.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
    };
  }

  // ---- saving -------------------------------------------------------------------------------------------------
  function post(url, body, method) {
    return fetch(url, { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).catch(function () { return { error: 'No connection. Check your internet and try again.' }; });
  }
  function save() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var patch = { blocks: A.blocks || [], order: A.order || [], hide: A.hide || [], f: A.f || {}, s: A.s || '', tag: A.tag || '' };
    var b = $('.ed-save'); b.disabled = true; b.textContent = 'Saving…';
    var done = function (j) {
      if (j.error) { setDirty(true); return toast(j.error); }
      hit('editor_save');
      if (PORTAL) { copyW = null; dropExtra = false; A = clone(j.site.answers); base = j.site.answers; page.redraw(j.site.answers, j.site.copy, j.site.contact || {}); }
      else { A = clone(j.answers); base = j.answers; page.rerender(j.answers); }
      setDirty(false); toast(E.demo ? 'Demo: that would be saved to your site.' : PORTAL ? 'Saved. Your site updates in under a minute.' : 'Saved.');
    };
    if (PORTAL) { if (dropExtra) patch.extra = []; post('/api/portal/save', Object.assign({ full: true, patch: patch }, E.auth)).then(done); }
    else post('/api/preview/' + E.slug, Object.assign({ key: E.key }, patch), 'PATCH').then(done);
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
      else if (act === 'save') save();
      else if (act === 'exit') stop();
      else if (act === 'up') move(k, i - 1);
      else if (act === 'down') move(k, i + 2);
      else if (act === 'edit') editBlock(block(k.slice(2)), false);
      else if (act === 'del') remove(k);
      return;
    }
    // While editing, links and buttons on the page don't go anywhere.
    var a = e.target.closest('#site a'); if (a && !e.target.closest('.ed-tb')) e.preventDefault();
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
