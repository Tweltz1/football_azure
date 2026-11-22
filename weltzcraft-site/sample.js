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
      reviews: [['They watched me run and found the first shoe that did not hurt my knees.', 'Sam K.'], ['The Thursday run got me ready for my first half marathon.', 'Leah P.'], ['Real runners giving real advice. Love this shop.', 'Victor A.']] },
    other: { noun: 'local business', icon: '⭐', name: 'Your Business', tag: 'Friendly, local and easy to reach.', list: 'Services', listSub: 'What we do, and what it costs. No surprises.',
      about: 'We\'re a local, owner-run business that treats every customer like a neighbor. Fair prices, clear answers and work we\'re proud to put our name on.',
      facts: [['Local', 'owned and run'], ['Fast', 'replies, every time'], ['Free', 'quotes']],
      items: [['Free consultation', 'Free', 'Tell us what you need and we\'ll tell you straight what it takes.'], ['Our most popular service', 'from $50', 'The thing most customers come to us for.'], ['Custom work', 'Quote', 'Something special? We\'ll price it before we start.']],
      reviews: [['Easy to reach, fair price and great work. Highly recommend.', 'Karen B.'], ['They explained everything and finished when they said they would.', 'Mike D.'], ['Finally a local business that answers the phone.', 'Tina R.']] }
  };
  var PHOTO_TYPES = ['coffee', 'barber', 'auto', 'lawn', 'bakery', 'fitness', 'boutique', 'running'];
  var CTA = { coffee: 'Order ahead', bakery: 'Order ahead', barber: 'Book online', fitness: 'Book a class', auto: 'Get a quote', lawn: 'Free estimate', boutique: 'Shop online', running: 'Book a fitting', other: 'Contact us' };
  function clip(s, n) { return String(s || '').trim().slice(0, n); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /** a = the builder's answers ({t, what, n, town, tag, more, cta, h, s, c}); copy = AI-written words or null; slug = saved preview id. */
  // live = the real contact details ({phone, email, address, hours}) when this is a real, live site; then nothing is sample.
  function render(a, copy, slug, live) {
    var type = T[a.t] ? a.t : 'other', t = {};
    Object.keys(T[type]).forEach(function (k) { t[k] = T[type][k]; });
    if (type === 'other' && a.what) t.noun = clip(a.what, 60).toLowerCase();
    if (copy) Object.keys(copy).forEach(function (k) { var v = copy[k]; if (v !== '' && v !== null && !(Array.isArray(v) && !v.length)) t[k] = v; });
    // Real photos picked for this business (copy.photos, served through /img/x) win over the built-in photo sets.
    var PX = copy && copy.photos ? copy.photos : null;
    var pxAll = PX ? [PX.hero, PX.about].concat(PX.gal || []).filter(Boolean) : [];
    var pxGal = PX ? (PX.gal || []).concat([PX.about, PX.hero]).filter(Boolean).slice(0, 4) : [];
    var pxSlot = PX ? [PX.hero, PX.about || PX.hero, pxGal[0], pxGal[1] || PX.about] : [];
    var photo = PX ? 'x' : copy ? (PHOTO_TYPES.indexOf(copy.photo) > -1 ? copy.photo : (copy.photo === 'none' ? '' : (type !== 'other' ? type : ''))) : (type !== 'other' ? type : '');
    var name = clip(a.n, 40) || t.name, town = clip(a.town, 40) || 'Springfield', tag = clip(a.tag, 90) || t.tag;
    var cta = clip(a.cta, 24) || CTA[type], hrs = a.h || '', show = (a.s || 'list,pics,review,map').split(',');
    var color = /^[0-9a-f]{6}$/i.test(a.c || '') ? '#' + a.c : '#e0662a';
    var on = function (k) { return show.indexOf(k) > -1; };
    // The look (AI's pick, then the visitor's own choice on top) and the built-in features.
    var d = {}, F = { book: /book|reserv|schedul|appoint/i.test(cta) ? 1 : 0, order: /order/i.test(cta) ? 1 : 0, form: /quote|estimate/i.test(cta) ? 'quote' : 'contact' };
    [copy && copy.d, a.d].forEach(function (x) { if (x) Object.keys(x).forEach(function (k) { d[k] = x[k]; }); });
    [copy && copy.f, a.f].forEach(function (x) { if (x) Object.keys(x).forEach(function (k) { F[k] = x[k]; }); });
    var vibe = d.vibe || (t.serif ? 'classic' : 'warm'), hero = d.hero || 'photo', look = d.items || 'cards';
    var hasForm = F.form === 'contact' || F.form === 'quote';
    // Links: delivery apps and their own ordering page make the "Order online" section; social pages go by the contact details.
    var L = a.links || {};
    var DELIVERY = [['order', 'Order online'], ['doordash', 'DoorDash'], ['ubereats', 'Uber Eats'], ['grubhub', 'Grubhub']].filter(function (x) { return L[x[0]]; });
    var SOCIAL = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['yelp', 'Yelp']].filter(function (x) { return L[x[0]]; });
    var hasOrder = !!(F.order || DELIVERY.length);
    var go = hasOrder && /order|shop|menu/i.test(cta) ? '#order' : F.book ? '#book' : hasOrder ? '#order' : hasForm ? '#ask' : '#visit';
    // real = contact details we can show: the live site's, or a real business's public ones on a preview made from its listing.
    var real = live || (a.addr || a.phone ? { phone: a.phone || '', email: '', address: a.addr || '', hours: '' } : null);
    function pimg(o, alt, eager) { return o ? '<img src="/img/x?u=' + encodeURIComponent(o.u) + '" alt="' + esc(alt) + '" loading="' + (eager ? 'eager' : 'lazy') + '" onerror="this.remove()">' : ''; }
    function img(slot, alt) { return PX ? pimg(pxSlot[slot], alt, !slot) : photo ? '<img src="/img/sample/' + photo + '-' + slot + '.webp" alt="' + esc(alt) + '" loading="' + (slot ? 'lazy' : 'eager') + '" onerror="this.remove()">' : ''; }
    function tile() { return (PX ? pxSlot[1] : photo) ? '' : '<div class="tile" aria-hidden="true">' + esc(t.icon || '⭐') + '</div>'; }
    var HOURS = /weekday|mon to fri/i.test(hrs) ? [['Monday to Friday', '8am to 5pm'], ['Saturday', 'Closed'], ['Sunday', 'Closed']]
      : /every day/i.test(hrs) ? [['Monday to Friday', '7am to 7pm'], ['Saturday', '7am to 7pm'], ['Sunday', '7am to 7pm']]
      : /wed to sun/i.test(hrs) ? [['Monday and Tuesday', 'Closed'], ['Wednesday to Saturday', '9am to 3pm'], ['Sunday', '9am to 3pm']]
      : /appointment/i.test(hrs) ? [['Monday to Saturday', 'By appointment'], ['Sunday', 'Closed']]
      : [['Monday to Friday', '8am to 5pm'], ['Saturday', '9am to 2pm'], ['Sunday', 'Closed']];
    if (live && live.hours) HOURS = [['Hours', live.hours]];
    else if (a.hrs && a.hrs.length) HOURS = a.hrs;
    else if (live || a.src) HOURS = [];   // a real business with no hours on record: show none rather than made-up ones
    var tel = real && real.phone ? 'tel:' + real.phone.replace(/[^\d+]/g, '') : '';
    var faq = t.faq || [['When are you open?', live && !HOURS.length ? 'Call or message us and we\'ll find a time that works.' : live && live.hours ? live.hours : HOURS.map(function (h) { return h[0] + ': ' + h[1]; }).join('. ') + '.'], ['Where are you?', 'Right here in ' + town + '. Find us on the map below or give us a call.'], ['How do I get started?', 'Tap "' + cta + '" and we\'ll take it from there. We answer every message the same day.']];
    var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
    var root = document.documentElement;
    root.style.setProperty('--c', color);
    root.className = root.className.replace(/\b[vhi]-[a-z]+\b/g, '').replace(/\s+/g, ' ').trim();
    root.classList.add('v-' + vibe, 'h-' + hero, 'i-' + look);
    root.classList.toggle('serif', vibe === 'classic' || (!!t.serif && vibe === 'warm'));
    root.classList.toggle('nophoto', PX ? !PX.hero : !photo);
    document.title = name + ' · ' + town;
    var brief = live ? (tel || (live.email ? 'mailto:' + live.email : '#visit')) : '/?site=' + encodeURIComponent(type) + '&sn=' + encodeURIComponent(name) + '&st=' + encodeURIComponent(town) + '&sk=' + encodeURIComponent(t.noun) + (slug ? '&sp=' + encodeURIComponent(slug) : '') + '#contact';
    var act = F.book || hasForm || hasOrder ? go : brief;
    var social = SOCIAL.length ? '<p class="social">' + SOCIAL.map(function (x) { return '<a href="' + esc(L[x[0]]) + '" target="_blank" rel="noopener">' + x[1] + '</a>'; }).join('') + '</p>' : '';
    var dir = real && real.address ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(real.address) : '';
    var realRev = t.liveReviews && t.liveReviews.length ? t.liveReviews : null;   // the owner's own reviews, typed in their portal
    var reviews = realRev ? true : on('review') && !live;
    var navs = [['about', 'About']].concat(on('list') ? [['menu', t.list]] : []).concat(on('pics') && photo ? [['gallery', 'Gallery']] : []).concat(hasOrder ? [['order', 'Order']] : []).concat(F.book ? [['book', 'Book']] : []).concat(reviews ? [['reviews', 'Reviews']] : []).concat(on('faq') ? [['faq', 'FAQ']] : []).concat([['visit', hasForm ? 'Contact' : 'Visit']]);
    var steps = on('steps') && t.steps && t.steps.length ? t.steps : null, areas = on('areas') && t.areas && t.areas.length ? t.areas : null;
    document.getElementById('site').innerHTML =
      (live ? (LIVEVIEW ? '<div class="wz"><div class="wrap"><span>👀 This is how the live site will look.</span></div></div>' : '') :
      '<div class="wz"><div class="wrap"><span>✨ Sample site ' + (copy ? 'written and ' : '') + 'built by <b>Weltzcraft Studios</b> in seconds. The real one starts at $500.</span><span>' +
        (slug ? '<button class="share" type="button" id="share">🔗 Share link</button> ' : '') + '<a class="back" href="/build">↺ Try another</a> ' +
        (slug ? '<a class="golive" href="/live?p=' + encodeURIComponent(slug) + '" data-track="live_open">🚀 Make it live</a>' : '<a href="' + brief + '" data-track="sample_mine">Make it mine</a>') + '</span></div></div>') +
      (t.notice ? '<div class="notice"><div class="wrap">' + esc(t.notice) + '</div></div>' : '') +
      '<header class="hd"><div class="wrap"><a class="logo" href="#top"><i>' + esc(initials) + '</i><span>' + esc(name) + '</span></a><nav>' +
        navs.map(function (n) { return '<a href="#' + n[0] + '">' + esc(n[1]) + '</a>'; }).join('') + '</nav><a class="btn" href="' + go + '">' + esc(cta) + '</a></div></header>' +
      '<section class="hero" id="top">' + (img(0, name) || (hero === 'split' ? '<div class="htile" aria-hidden="true">' + esc(t.icon || '⭐') + '</div>' : '')) + '<div class="wrap"><p class="eyebrow">' + esc(t.icon) + ' ' + esc(t.eyebrow || (town + '\'s favorite ' + t.noun)) + '</p><h1>' + esc(name) + '</h1><p class="lead">' + esc(tag) + '</p>' +
        '<div class="cta"><a class="btn" href="' + go + '">' + esc(cta) + '</a>' + (on('list') ? '<a class="btn ghost" href="#menu">See ' + esc(t.list.toLowerCase()) + '</a>' : '') + '</div>' +
        '<div class="trust">' + (real ? (real.phone ? '<span><b>' + esc(real.phone) + '</b>Call or text</span>' : '') : a.src ? '' : '<span><b>4.9 ★</b>200+ reviews</span>') + '<span><b>Local</b>owned in ' + esc(town) + '</span>' + (HOURS.length && !(HOURS[0][1].length > 24) ? '<span><b>' + esc(HOURS[0][1]) + '</b>' + esc(HOURS[0][0]) + '</span>' : '') + '</div></div></section>' +
      '<section id="about"><div class="wrap about"><div class="ph">' + img(1, name + ' inside') + tile() + '</div><div><p class="eyebrow">Our story</p><h2 style="font-size:clamp(32px,4.4vw,48px)">' + esc(t.aboutTitle || ('More than a ' + t.noun + '. A neighbor.')) + '</h2><p>' + esc(t.about) + '</p>' +
        '<div class="facts">' + t.facts.map(function (f) { return '<div><b>' + esc(f[0]) + '</b><small>' + esc(f[1]) + '</small></div>'; }).join('') + '</div></div></div></section>' +
      (t.why && t.why.length ? '<section id="why"><div class="wrap"><div class="sec-h"><p class="eyebrow">Why ' + esc(name) + '</p><h2>What you can count on.</h2></div><div class="why">' +
        t.why.map(function (x) { return '<div><span aria-hidden="true">' + esc(x[0] || '✓') + '</span><h3>' + esc(x[1]) + '</h3><p>' + esc(x[2]) + '</p></div>'; }).join('') + '</div></div></section>' : '') +
      (on('list') ? '<section id="menu" class="tint"><div class="wrap"><div class="sec-h"><p class="eyebrow">' + esc(t.list) + '</p><h2>' + esc(t.listSub) + '</h2></div><div class="items">' +
        t.items.map(function (i) { return '<div class="item"><div class="top"><h3>' + esc(i[0]) + '</h3><span class="price">' + esc(i[1]) + '</span></div><p>' + esc(i[2]) + '</p></div>'; }).join('') + '</div></div></section>' : '') +
      (steps ? '<section id="steps"><div class="wrap"><div class="sec-h"><p class="eyebrow">How it works</p><h2>Getting started is easy.</h2></div><ol class="steps">' +
        steps.map(function (x, i) { return '<li><i>' + (i + 1) + '</i><h3>' + esc(x[0]) + '</h3><p>' + esc(x[1]) + '</p></li>'; }).join('') + '</ol></div></section>' : '') +
      (hasOrder ? '<section id="order"><div class="wrap"><div class="sec-h"><p class="eyebrow">Order</p><h2>' + (F.order ? 'Order ahead, skip the wait.' : 'Order online.') + '</h2>' +
        (DELIVERY.length ? '<p>' + (F.order ? 'Want it delivered? Find us on:' : 'Pick how you\'d like to order:') + '</p></div><div class="deliv">' + DELIVERY.map(function (x) { return '<a class="btn dl-' + x[0] + '" href="' + esc(L[x[0]]) + '" target="_blank" rel="noopener">' + (x[0] === 'order' ? 'Order online' : 'Order on ' + x[1]) + ' →</a>'; }).join('') + '</div>' : '</div>') +
        (F.order ? '<div id="wc-order"></div>' : '') + '</div></section>' : '') +
      (F.book ? '<section id="book" class="tint"><div class="wrap" id="wc-book"></div></section>' : '') +
      (on('pics') && (PX ? pxGal.length >= 3 : photo) ? '<section id="gallery"><div class="wrap"><div class="sec-h"><p class="eyebrow">Gallery</p><h2>' + (a.src ? 'A closer look.' : 'Come see for yourself.') + '</h2></div><div class="gal' + (PX && pxGal.length === 3 ? ' g3' : '') + '">' +
        (PX ? pxGal.map(function (o) { return '<div>' + pimg(o, name + ' photo') + '</div>'; }) : [2, 3, 0, 1].map(function (s) { return '<div>' + img(s, name + ' photo') + '</div>'; })).join('') + '</div></div></section>' : '') +
      (reviews ? '<section id="reviews" class="tint"><div class="wrap"><div class="sec-h"><p class="eyebrow">Reviews</p><h2>Loved by ' + esc(town) + '.</h2></div><div class="revs">' +
        (realRev || t.reviews).map(function (r) { return '<div class="rev"><span class="st">★★★★★</span><p>“' + esc(r[0]) + '”</p><span class="who"><i>' + esc((r[1] || '?')[0]) + '</i>' + esc(r[1]) + (realRev ? '' : ' · Sample review') + '</span></div>'; }).join('') + '</div></div></section>' : '') +
      (on('faq') ? '<section id="faq"><div class="wrap"><div class="sec-h"><p class="eyebrow">Questions</p><h2>Good to know.</h2></div><div class="faq">' +
        faq.map(function (f) { return '<details><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>'; }).join('') + '</div></div></section>' : '') +
      (areas ? '<section id="areas"><div class="wrap"><div class="sec-h"><p class="eyebrow">Where we work</p><h2>Proudly serving ' + esc(town) + ' and nearby.</h2></div><ul class="areas"><li>' + esc(town) + '</li>' +
        areas.filter(function (x) { return x.toLowerCase() !== town.toLowerCase(); }).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></section>' : '') +
      (t.extra && t.extra.length ? t.extra.map(function (x, i) { return '<section class="xtra' + (i % 2 ? '' : ' tint') + '"><div class="wrap"><div class="sec-h"><h2>' + esc(x[0]) + '</h2></div><p class="xp">' + esc(x[1]) + '</p></div></section>'; }).join('') : '') +
      (hasForm ? '<section id="ask"><div class="wrap" id="wc-ask"></div></section>' : '') +
      '<section id="visit"' + (on('faq') ? ' class="tint"' : '') + '><div class="wrap visit"><div class="card"><p class="eyebrow">Visit us</p><h2 style="font-size:34px">' + (live ? 'Get in touch' : 'Find us in ' + esc(town)) + '</h2><p style="color:var(--mut);margin:10px 0 0">' +
        (real ? [real.address ? '📍 ' + esc(real.address) : '📍 ' + esc(town), real.phone ? '📞 <a href="' + tel + '">' + esc(real.phone) + '</a>' : '', real.email ? '✉️ <a href="mailto:' + esc(real.email) + '">' + esc(real.email) + '</a>' : ''].filter(Boolean).join('<br>')
          : '📍 120 Main Street, ' + esc(town) + '<br>📞 (555) 014-2026') + '</p>' +
        (HOURS.length ? '<ul class="hours">' + HOURS.map(function (h) { return '<li><span>' + esc(h[0]) + '</span><b>' + esc(h[1]) + '</b></li>'; }).join('') + '</ul>' : '') + social + '<a class="btn" style="margin-top:18px" href="' + act + '">' + esc(cta) + '</a></div>' +
        (real && real.address ? '<div class="map real"><iframe title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?output=embed&q=' + encodeURIComponent(real.address) + '"></iframe></div>'
        : (on('map') || !photo) && !live ? '<div class="map" aria-label="Map"><svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice"><rect width="600" height="400" fill="#e9ece4"/><path d="M0 120h600M0 280h600M150 0v400M420 0v400" stroke="#fff" stroke-width="18"/><path d="M0 200h600M290 0v400" stroke="#fff" stroke-width="30"/><path d="M-20 360C120 300 200 330 330 250s220-60 300-120" stroke="#cfe1f2" stroke-width="26" fill="none"/><rect x="40" y="20" width="90" height="80" rx="8" fill="#d6e6cf"/><rect x="460" y="300" width="120" height="80" rx="8" fill="#d6e6cf"/></svg><div class="pin"><i></i><span>' + esc(name) + '</span></div></div>'
          : '<div class="about"><div class="ph" style="aspect-ratio:auto;min-height:340px">' + img(3, name) + tile() + '</div></div>') + '</div></section>' +
      '<div class="band"><div class="wrap"><h2>' + esc(t.band || (cta + ' in under a minute.')) + '</h2><p>Questions? We answer every message the same day.</p><a class="btn" href="' + act + '">' + esc(cta) + '</a></div></div>' +
      '<footer><div class="wrap"><span>© 2026 ' + esc(name) + ' · ' + esc(town) + '</span><span class="credit">' + (live ? 'Website by <a href="https://weltzcraft.com">Weltzcraft Studios</a>' : 'Sample site by <a href="/">Weltzcraft Studios</a>') + (PX && pxAll.some(function (o) { return o.src !== 'own'; }) ? ' · <span>Photos: ' + pxAll.filter(function (o) { return o.src !== 'own'; }).map(function (o) { return (o.page ? '<a href="' + esc(o.page) + '" target="_blank" rel="noopener">' : '') + esc(o.by || o.src || 'Unknown') + (o.page ? '</a>' : '') + ' (' + esc(o.lic) + ')'; }).join(', ') + '</span>'
        : photo && !PX ? ' · <span id="pc">Photos: Wikimedia Commons</span>' : '') + '</span></div></footer>' +
      // Phones get a bar that stays at the bottom: call, directions and the main button.
      (tel || dir ? '<div class="mbar">' + (tel ? '<a href="' + tel + '">📞 Call</a>' : '') + (dir ? '<a href="' + dir + '" target="_blank" rel="noopener">📍 Directions</a>' : '') + '<a class="go" href="' + act + '">' + esc(cta) + '</a></div>' : '');
    root.classList.toggle('has-mbar', !!(tel || dir));
    // Search engines read this to show the business's name, phone, address and hours (live sites only).
    var ld = document.getElementById('wc-ld'); if (ld) ld.remove();
    if (live) {
      ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'wc-ld';
      var biz = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: name, description: t.about, url: location.origin + '/' };
      if (live.phone) biz.telephone = live.phone;
      if (live.email) biz.email = live.email;
      if (live.address) biz.address = live.address;
      if (SOCIAL.length) biz.sameAs = SOCIAL.map(function (x) { return L[x[0]]; });
      ld.textContent = JSON.stringify(biz); document.head.appendChild(ld);
    }
    var sh = document.getElementById('share');
    if (sh) sh.addEventListener('click', function () {
      var link = location.origin + '/preview/' + slug;
      if (navigator.share) { navigator.share({ title: name, text: 'Here\'s a sample website for ' + name, url: link }).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { sh.textContent = '✓ Link copied'; }, function () { prompt('Copy this link', link); });
    });
    if (photo && !PX) fetch('/img/sample/credits.json').then(function (r) { return r.json(); }).then(function (c) {
      var list = [0, 1, 2, 3].map(function (i) { return c[photo + '-' + i]; }).filter(Boolean);
      if (!list.length) return;
      document.getElementById('pc').innerHTML = 'Photos: ' + list.map(function (x) { return '<a href="' + esc(x.page || '#') + '" target="_blank" rel="noopener">' + esc((x.creator || 'Unknown').slice(0, 40)) + '</a> (' + esc(x.license || '') + ')'; }).join(', ') + ', via Wikimedia Commons';
    }).catch(function () {});
    // Booking calendar, contact / quote form and the maker's Customize panel (features.js).
    var site = window.WC_SITE || {};
    if (window.wcFeatures) window.wcFeatures.mount({ a: a, copy: copy, t: t, slug: slug, live: !!(live && site.live), site: site.id || slug || '', name: name, town: town, cta: cta, F: F, d: { vibe: vibe, hero: hero, items: look }, photo: photo, show: show,
      rerender: function (a2) { var y = window.scrollY; render(a2, copy, slug, live); window.scrollTo(0, y); } });
    if (!render.done && location.hash && location.hash.length > 1) { var el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView(); }
    render.done = true;
  }

  function gone(msg) {
    document.getElementById('site').innerHTML = '<div class="gone-box"><div class="tile" aria-hidden="true">W</div><h1>' + esc(msg) + '</h1><p>Free previews last 30 days. You can make a new one in about a minute.</p><a class="btn" href="/build">Build a free preview</a> <a class="btn ghost-d" href="/">Weltzcraft Studios</a></div>';
    if (!OWN) document.title = 'Preview not found · Weltzcraft Studios';
  }

  // Where the page's content comes from:
  //   /preview/<slug>          a saved preview (load it)
  //   /sample?ai=1&...         fresh answers from /build (save it, with AI-written words, then show it)
  //   /sample?t=..&n=..        the old instant sample from the address (no saving)
  var A = { t: P.get('t'), what: clip(P.get('what'), 60), n: clip(P.get('n'), 40), town: clip(P.get('town'), 40), tag: clip(P.get('tag'), 90), more: clip(P.get('more'), 300), cta: clip(P.get('cta'), 24), h: P.get('h') || '', s: P.get('s') || 'list,pics,review,map', c: P.get('c') || '', links: clip(P.get('links'), 600) };
  var saved = /^\/preview\/([a-z0-9-]{3,60})\/?$/.exec(location.pathname);
  var OWN = !/(^|\.)weltzcraft\.com$|\.pages\.dev$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
  var LIVEVIEW = /^\/live\/view\/?$/.test(location.pathname);
  var ready;
  if (OWN || LIVEVIEW) {
    // A real, live site: the customer's own domain, or Tyler's look at it before approving.
    document.getElementById('intro').remove();
    fetch(OWN ? '/api/site' : '/api/live/site' + location.search).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.site) return gone('This site is being set up.');
      window.WC_SITE = { id: j.id, domain: j.domain, live: OWN, view: LIVEVIEW };
      render(j.site.answers, j.site.copy, '', j.site.contact || {});
    }, function () { gone('This site is being set up.'); });
    return;
  }
  if (saved) {
    ready = fetch('/api/preview/' + saved[1]).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok || !x.j.answers) return function () { gone(x.j.error || 'This preview has expired.'); };
      return function () { render(x.j.answers, x.j.copy, saved[1]); };
    }, function () { return function () { gone('We couldn\'t load this preview. Try again in a minute.'); }; });
  } else if (P.get('ai') === '1' && A.n) {
    ready = fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(A) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.slug) return function () { render(A, null, ''); };
        history.replaceState(null, '', '/preview/' + x.j.slug);
        try { if (x.j.key) localStorage.setItem('wck:' + x.j.slug, x.j.key); } catch (e) {}
        if (window.wcHit) window.wcHit('preview_saved');
        return function () { render(x.j.answers, x.j.copy, x.j.slug); };
      }, function () { return function () { render(A, null, ''); }; });
  } else {
    render(A, null, '');
    ready = Promise.resolve(function () {});
  }

  // build intro (holds on its last line until the preview is ready)
  var intro = document.getElementById('intro');
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (P.get('intro') === '0' && !saved && P.get('ai') !== '1') { intro.remove(); return; }
  document.body.style.overflow = 'hidden';
  var tl = T[A.t] || T.other;
  var lines = saved ? ['Opening your preview…', 'Loading your colors…', 'Placing your photos…']
    : ['Building your website…', 'Writing your words…', 'Mixing your colors…', 'Adding your ' + tl.list.toLowerCase() + '…', 'Placing your photos…', 'Making it fast on phones…', 'Saving your link…'];
  var log = document.getElementById('in-log'), bar = document.getElementById('in-bar'), per = calm ? 120 : (saved ? 260 : 480);
  lines.forEach(function (l, i) {
    setTimeout(function () {
      [].forEach.call(log.children, function (c) { c.className = 'd'; });
      var p = document.createElement('p'); p.innerHTML = '<b>›</b> ' + esc(l); log.appendChild(p);
      bar.style.width = Math.round((i + 1) / lines.length * 92) + '%';
    }, i * per);
  });
  var played = new Promise(function (res) { setTimeout(res, lines.length * per + 150); });
  Promise.all([ready, played]).then(function (x) {
    x[0]();
    bar.style.width = '100%';
    intro.classList.add('pow');
    setTimeout(function () { intro.classList.add('gone'); document.body.style.overflow = ''; }, calm ? 550 : 2450);
    setTimeout(function () { intro.remove(); }, calm ? 1450 : 3350);
  });
})();
