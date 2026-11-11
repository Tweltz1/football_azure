// weltzcraft.com/sample: a full sample business website built from the "Your website" answers.
// Params: t type, n name, town, tag, cta, h hours, s sections (list,pics,review,map), c color hex (no #), intro=0 skips the build scene.
(function () {
  var P = new URLSearchParams(location.search);
  var T = {
    coffee: { noun: 'coffee shop', icon: '☕', name: 'Maple Street Coffee', serif: true, tag: 'Fresh coffee, made by neighbors.', list: 'Menu', listSub: 'Roasted in small batches, poured with care.',
      about: 'We started with one espresso machine and a lot of opinions about coffee. Today we roast in small batches, bake every morning, and still learn every regular\'s order by their second visit.',
      facts: [['12', 'single-origin roasts'], ['6am', 'doors open'], ['100%', 'local milk']],
      items: [['Drip coffee', '$3', 'Our house roast, bottomless when you stay.'], ['Oat milk latte', '$5', 'Silky, not too sweet. The crowd favorite.'], ['Breakfast burrito', '$8', 'Eggs, potatoes, cheddar and salsa verde.']],
      reviews: [['Best latte in town, and they remember your name.', 'Jenna R.'], ['My favorite place to work for a few hours. Great wifi and better pastries.', 'Marcus T.'], ['The cold brew is dangerous. In the best way.', 'Priya S.']] },
    barber: { noun: 'barbershop', icon: '💈', name: 'Main Street Barbers', tag: 'Sharp cuts, no long waits.', list: 'Services', listSub: 'Classic cuts and clean fades, done right the first time.',
      about: 'Three chairs, good music and barbers who actually listen. Walk in or book a time online, and you\'ll be in and out looking sharp.',
      facts: [['15+', 'years cutting'], ['3', 'chairs'], ['5★', 'average rating']],
      items: [['Haircut', '$25', 'Consult, cut, wash and style.'], ['Beard trim', '$15', 'Shape-up with a hot towel finish.'], ['Kids cut', '$18', 'Ages 12 and under. Lollipop included.']],
      reviews: [['Booked online in ten seconds. Cleanest fade I have had.', 'Andre M.'], ['They take their time and it shows. Never going anywhere else.', 'Kyle B.'], ['Great with my son, who usually hates haircuts.', 'Laura P.']] },
    auto: { noun: 'auto repair shop', icon: '🔧', name: 'Riverside Auto', tag: 'Honest repairs, explained in plain English.', list: 'Services', listSub: 'Straight answers and fair prices before any work starts.',
      about: 'We fix cars the way we would want ours fixed. You get photos of the problem, a clear quote and a text when it\'s ready. No surprises on the bill.',
      facts: [['ASE', 'certified techs'], ['2 yr', 'parts warranty'], ['Same day', 'most repairs']],
      items: [['Oil change', '$49', 'Synthetic blend, filter and a 20-point check.'], ['Brake check', 'Free', 'We measure pads and rotors and show you the numbers.'], ['Check engine light', '$89', 'Full diagnostic, applied to the repair if you fix it here.']],
      reviews: [['They texted me photos of the problem before fixing anything.', 'Dan W.'], ['Fair price, done the same day. Finally a shop I trust.', 'Monica L.'], ['Explained everything without making me feel dumb.', 'Chris H.']] },
    lawn: { noun: 'landscaping business', icon: '🌿', name: 'Greenline Lawn Care', tag: 'A yard you are proud of, every week.', list: 'Services', listSub: 'From weekly mowing to full makeovers.',
      about: 'We\'re a local crew that treats every yard like our own. Same team every visit, clean edges every time, and a text when we\'re on the way.',
      facts: [['400+', 'yards every week'], ['Same', 'crew each visit'], ['Free', 'estimates']],
      items: [['Weekly mowing', 'from $35', 'Mow, edge, trim and blow. Every week, on schedule.'], ['Spring cleanup', '$150', 'Leaves, beds, branches and a fresh first cut.'], ['Mulch and beds', 'Quote', 'New beds, fresh mulch and seasonal flowers.']],
      reviews: [['On time every week, and the yard has never looked better.', 'Greg F.'], ['The spring cleanup made our house look brand new.', 'Allison K.'], ['Easy to book, easy to pay, and they actually show up.', 'Tom R.']] },
    bakery: { noun: 'bakery', icon: '🥐', name: 'Sunrise Bakery', serif: true, tag: 'Baked from scratch before sunrise.', list: 'Menu', listSub: 'Everything made in-house, every single morning.',
      about: 'Our ovens turn on at 3am so the bread is still warm when you walk in. Real butter, slow-rise dough and recipes we\'ve been perfecting for years.',
      facts: [['3am', 'ovens on'], ['40+', 'cakes a week'], ['0', 'shortcuts']],
      items: [['Sourdough loaf', '$8', '36-hour ferment, crackly crust, soft middle.'], ['Custom cakes', 'from $45', 'Birthdays, weddings and everything in between.'], ['Cookie dozen', '$18', 'Mix and match. The brown butter ones go fast.']],
      reviews: [['The birthday cake was gone in five minutes. Ordering again.', 'Sara D.'], ['The croissants are as good as Paris. Not kidding.', 'Michael G.'], ['Saturday mornings are not complete without their sourdough.', 'Emily W.']] },
    fitness: { noun: 'fitness studio', icon: '🏋️', name: 'Ironwood Fitness', tag: 'Small classes, real coaching.', list: 'Classes', listSub: 'Coached sessions for every level.',
      about: 'No crowded floors, no guesswork. Every class is capped at 12 people and led by a certified coach who knows your name and your goals.',
      facts: [['12', 'max per class'], ['40+', 'classes a week'], ['1st', 'class free']],
      items: [['Drop-in class', '$15', 'Strength, conditioning or mobility. Pick your hour.'], ['Monthly unlimited', '$89', 'Every class, every day. Cancel any time.'], ['Personal training', '$60', 'One hour, one coach, one plan built for you.']],
      reviews: [['Coaches know everyone by name. Best gym I have joined.', 'Jordan C.'], ['I have never stuck with a gym this long. The classes fly by.', 'Nina V.'], ['Down 20 pounds and stronger than ever.', 'Rob S.']] },
    boutique: { noun: 'boutique', icon: '👗', name: 'Willow & Thread', serif: true, tag: 'Hand-picked styles you won\'t see everywhere.', list: 'New arrivals', listSub: 'Fresh pieces every week, in small runs.',
      about: 'Every piece in the shop is chosen by hand from small designers and makers. Come in for a browse, stay for the styling help.',
      facts: [['Weekly', 'new arrivals'], ['Small', 'batch designers'], ['Free', 'local delivery']],
      items: [['Linen sundress', '$58', 'Breathable linen in three summer colors.'], ['Denim jacket', '$74', 'Vintage wash, cut for layering.'], ['Gold hoop earrings', '$22', 'Lightweight, hypoallergenic, everyday.']],
      reviews: [['Every time I wear something from here, someone asks where it is from.', 'Hannah J.'], ['The owner put together my whole vacation wardrobe. So helpful.', 'Olivia M.'], ['Unique pieces at fair prices. My new favorite shop.', 'Bri T.']] },
    running: { noun: 'running store', icon: '👟', name: 'Mile Marker Running', tag: 'Shoes fitted by runners, for runners.', list: 'Shop', listSub: 'Gear, fittings and a crew to run with.',
      about: 'We\'re runners first. We watch you run, measure your feet and help you find the shoe that feels right, then invite you to run with us on Thursdays.',
      facts: [['Free', 'gait analysis'], ['30 day', 'test-run returns'], ['Every Thu', 'group run']],
      items: [['Free gait analysis', 'Free', 'A quick video of your stride and a fit that works.'], ['Daily trainers', 'from $130', 'Top brands, fitted for your foot and your miles.'], ['Thursday group run', 'Free', '3 or 5 miles, every pace welcome. Coffee after.']],
      reviews: [['They watched me run and found the first shoe that did not hurt my knees.', 'Sam K.'], ['The Thursday run got me ready for my first half marathon.', 'Leah P.'], ['Real runners giving real advice. Love this shop.', 'Victor A.']] }
  };
  var type = T[P.get('t')] ? P.get('t') : 'coffee', t = T[type];
  var name = clip(P.get('n'), 40) || t.name, town = clip(P.get('town'), 40) || 'Springfield', tag = clip(P.get('tag'), 80) || t.tag;
  var cta = clip(P.get('cta'), 24) || 'Book online', hrs = P.get('h') || '', show = (P.get('s') || 'list,pics,review,map').split(',');
  var color = /^[0-9a-f]{6}$/i.test(P.get('c') || '') ? '#' + P.get('c') : '#e0662a';
  var on = function (k) { return show.indexOf(k) > -1; };
  function clip(s, n) { return (s || '').trim().slice(0, n); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function img(slot, alt) { return '<img src="/img/sample/' + type + '-' + slot + '.webp" alt="' + esc(alt) + '" loading="' + (slot ? 'lazy' : 'eager') + '" onerror="this.remove()">'; }
  var HOURS = /weekday|mon to fri/i.test(hrs) ? [['Monday to Friday', '8am to 5pm'], ['Saturday', 'Closed'], ['Sunday', 'Closed']]
    : /every day/i.test(hrs) ? [['Monday to Friday', '7am to 7pm'], ['Saturday', '7am to 7pm'], ['Sunday', '7am to 7pm']]
    : /wed to sun/i.test(hrs) ? [['Monday and Tuesday', 'Closed'], ['Wednesday to Saturday', '9am to 3pm'], ['Sunday', '9am to 3pm']]
    : /appointment/i.test(hrs) ? [['Monday to Saturday', 'By appointment'], ['Sunday', 'Closed']]
    : [['Monday to Friday', '8am to 5pm'], ['Saturday', '9am to 2pm'], ['Sunday', 'Closed']];
  var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  var root = document.documentElement;
  root.style.setProperty('--c', color);
  if (t.serif) root.classList.add('serif');
  document.title = name + ' · ' + town;
  var brief = '/?site=' + encodeURIComponent(type) + '&sn=' + encodeURIComponent(name) + '&st=' + encodeURIComponent(town) + '#contact';
  var navs = [['about', 'About']].concat(on('list') ? [['menu', t.list]] : []).concat(on('pics') ? [['gallery', 'Gallery']] : []).concat(on('review') ? [['reviews', 'Reviews']] : []).concat([['visit', 'Visit']]);
  document.getElementById('site').innerHTML =
    '<div class="wz"><div class="wrap"><span>✨ Sample site built by <b>Weltzcraft Studios</b> in seconds. The real one starts at $500.</span><span><a class="back" href="/#demo">← Back</a> <a href="' + brief + '">Make it mine</a></span></div></div>' +
    '<header class="hd"><div class="wrap"><a class="logo" href="#top"><i>' + esc(initials) + '</i><span>' + esc(name) + '</span></a><nav>' +
      navs.map(function (n) { return '<a href="#' + n[0] + '">' + n[1] + '</a>'; }).join('') + '</nav><a class="btn" href="#visit">' + esc(cta) + '</a></div></header>' +
    '<section class="hero" id="top">' + img(0, name) + '<div class="wrap"><p class="eyebrow">' + t.icon + ' ' + esc(town) + '\'s favorite ' + t.noun + '</p><h1>' + esc(name) + '</h1><p class="lead">' + esc(tag) + '</p>' +
      '<div class="cta"><a class="btn" href="#visit">' + esc(cta) + '</a>' + (on('list') ? '<a class="btn ghost" href="#menu">See ' + t.list.toLowerCase() + '</a>' : '') + '</div>' +
      '<div class="trust"><span><b>4.9 ★</b>200+ reviews</span><span><b>Local</b>owned in ' + esc(town) + '</span><span><b>' + esc(HOURS[0][1]) + '</b>' + esc(HOURS[0][0]) + '</span></div></div></section>' +
    '<section id="about"><div class="wrap about"><div class="ph">' + img(1, name + ' inside') + '</div><div><p class="eyebrow">Our story</p><h2 style="font-size:clamp(32px,4.4vw,48px)">More than a ' + t.noun + '. A neighbor.</h2><p>' + esc(t.about) + '</p>' +
      '<div class="facts">' + t.facts.map(function (f) { return '<div><b>' + f[0] + '</b><small>' + f[1] + '</small></div>'; }).join('') + '</div></div></div></section>' +
    (on('list') ? '<section id="menu" class="tint"><div class="wrap"><div class="sec-h"><p class="eyebrow">' + t.list + '</p><h2>' + t.listSub + '</h2></div><div class="items">' +
      t.items.map(function (i) { return '<div class="item"><div class="top"><h3>' + i[0] + '</h3><span class="price">' + i[1] + '</span></div><p>' + i[2] + '</p></div>'; }).join('') + '</div></div></section>' : '') +
    (on('pics') ? '<section id="gallery"><div class="wrap"><div class="sec-h"><p class="eyebrow">Gallery</p><h2>Come see for yourself.</h2></div><div class="gal">' +
      [2, 3, 0, 1].map(function (s) { return '<div>' + img(s, name + ' photo') + '</div>'; }).join('') + '</div></div></section>' : '') +
    (on('review') ? '<section id="reviews" class="tint"><div class="wrap"><div class="sec-h"><p class="eyebrow">Reviews</p><h2>Loved by ' + esc(town) + '.</h2></div><div class="revs">' +
      t.reviews.map(function (r) { return '<div class="rev"><span class="st">★★★★★</span><p>“' + r[0] + '”</p><span class="who"><i>' + r[1][0] + '</i>' + r[1] + ' · Google</span></div>'; }).join('') + '</div></div></section>' : '') +
    '<section id="visit"><div class="wrap visit"><div class="card"><p class="eyebrow">Visit us</p><h2 style="font-size:34px">Find us in ' + esc(town) + '</h2><p style="color:var(--mut);margin:10px 0 0">📍 120 Main Street, ' + esc(town) + '<br>📞 (555) 014-2026</p>' +
      '<ul class="hours">' + HOURS.map(function (h) { return '<li><span>' + h[0] + '</span><b>' + h[1] + '</b></li>'; }).join('') + '</ul><a class="btn" style="margin-top:18px" href="' + brief + '">' + esc(cta) + '</a></div>' +
      (on('map') ? '<div class="map" aria-label="Map"><svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice"><rect width="600" height="400" fill="#e9ece4"/><path d="M0 120h600M0 280h600M150 0v400M420 0v400" stroke="#fff" stroke-width="18"/><path d="M0 200h600M290 0v400" stroke="#fff" stroke-width="30"/><path d="M-20 360C120 300 200 330 330 250s220-60 300-120" stroke="#cfe1f2" stroke-width="26" fill="none"/><rect x="40" y="20" width="90" height="80" rx="8" fill="#d6e6cf"/><rect x="460" y="300" width="120" height="80" rx="8" fill="#d6e6cf"/></svg><div class="pin"><i></i><span>' + esc(name) + '</span></div></div>'
        : '<div class="about"><div class="ph" style="aspect-ratio:auto;min-height:340px">' + img(3, name) + '</div></div>') + '</div></section>' +
    '<div class="band"><div class="wrap"><h2>' + esc(cta) + ' in under a minute.</h2><p>Questions? We answer every message the same day.</p><a class="btn" href="' + brief + '">' + esc(cta) + '</a></div></div>' +
    '<footer><div class="wrap"><span>© 2026 ' + esc(name) + ' · ' + esc(town) + '</span><span class="credit">Sample site by <a href="/">Weltzcraft Studios</a> · <span id="pc">Photos: Wikimedia Commons</span></span></div></footer>';
  fetch('/img/sample/credits.json').then(function (r) { return r.json(); }).then(function (c) {
    var list = [0, 1, 2, 3].map(function (i) { return c[type + '-' + i]; }).filter(Boolean);
    if (!list.length) return;
    document.getElementById('pc').innerHTML = 'Photos: ' + list.map(function (x) { return '<a href="' + esc(x.page || '#') + '" target="_blank" rel="noopener">' + esc((x.creator || 'Unknown').slice(0, 40)) + '</a> (' + esc(x.license || '') + ')'; }).join(', ') + ', via Wikimedia Commons';
  }).catch(function () {});

  // build intro
  var intro = document.getElementById('intro');
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (P.get('intro') === '0') { intro.remove(); return; }
  document.body.style.overflow = 'hidden';
  var lines = ['Building your website…', 'Coding the homepage…', 'Mixing your colors…', 'Adding your ' + t.list.toLowerCase() + '…', 'Placing your photos…', 'Making it fast on phones…', 'Publishing to the web…'];
  var log = document.getElementById('in-log'), bar = document.getElementById('in-bar'), per = calm ? 120 : 480;
  lines.forEach(function (l, i) {
    setTimeout(function () {
      [].forEach.call(log.children, function (c) { c.className = 'd'; });
      var p = document.createElement('p'); p.innerHTML = '<b>›</b> ' + esc(l); log.appendChild(p);
      bar.style.width = Math.round((i + 1) / lines.length * 100) + '%';
    }, i * per);
  });
  setTimeout(function () { intro.classList.add('pow'); }, lines.length * per + 150);
  setTimeout(function () { intro.classList.add('gone'); document.body.style.overflow = ''; history.replaceState(null, '', location.pathname + location.search.replace(/([?&])intro=1(&|$)/, '$1').replace(/[?&]$/, '')); }, lines.length * per + (calm ? 700 : 2600));
  setTimeout(function () { intro.remove(); }, lines.length * per + (calm ? 1600 : 3500));
})();
