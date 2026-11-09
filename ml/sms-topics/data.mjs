// Training texts for the customer text sorter. Nothing here comes from real shops or customers:
// shop texts are generated from hand-written patterns, and general "anything else" texts come from
// CLINC150 (Larson et al. 2019, CC BY 3.0), which train.mjs downloads.
//
// Each pattern is a string with {slots}; a slot picks one of its options. Then small noise is added
// (lower case, dropped punctuation, typos, greetings and sign-offs) so the model sees how people really text.

const S = {
  car: ['car', 'vehicle', 'truck', 'van', 'suv', 'jeep', 'ride', 'civic', 'camry', 'f150', 'f-150', 'silverado', 'accord', 'explorer', 'equinox', 'rav4', 'tacoma', 'wrangler', 'outback', 'malibu', 'altima', 'corolla', 'ram', 'minivan', 'sienna', 'odyssey', 'cruze', 'focus', 'escape', 'honda', 'toyota', 'ford', 'chevy', 'subaru', 'nissan', 'dodge', 'kia', 'hyundai', 'bmw', 'audi', 'vw', 'jetta', 'grand cherokee', 'tahoe', 'pilot', 'cr-v'],
  my: ['my', 'the', 'our', 'my wifes', 'my husbands', 'my sons', 'my daughters', 'my moms', 'my dads', 'the', 'my'],
  job: ['repair', 'brake job', 'brakes', 'oil change', 'alignment', 'tires', 'transmission', 'engine work', 'ac', 'a/c', 'inspection', 'diagnosis', 'diagnostic', 'tune up', 'work', 'service', 'repairs', 'exhaust', 'suspension', 'battery', 'water pump', 'timing belt', 'radiator', 'struts', 'check engine light'],
  done: ['done', 'ready', 'finished', 'all set', 'good to go', 'complete', 'completed', 'fixed', 'ready to go', 'ready for pickup', 'ready to pick up', 'done yet'],
  hi: ['', '', '', '', 'hi ', 'hey ', 'hello ', 'hi there ', 'good morning ', 'good afternoon ', 'morning ', 'yo ', 'hey guys ', 'hi its mike ', 'hello this is sarah ', 'hey this is dan ', 'hi this is jen ', 'sorry to bother you ', 'quick question ', 'just checking in ', 'hey there '],
  bye: ['', '', '', '', ' thanks', ' thank you', ' thx', ' ty', ' thanks!', ' thank you so much', ' appreciate it', ' :)', ' please', ' pls', ' plz', ' thanks again'],
  q: ['?', '?', '', '??', '.', '!', ' ?'],
};

const PATTERNS = {
  status: [
    'is {my} {car} {done}{q}', 'is {my} {car} {done} yet{q}', 'any update on {my} {car}{q}', 'any updates{q}', 'update{q}',
    'hows {my} {car} coming{q}', 'how is {my} {car} coming along{q}', 'how is {my} {job} going{q}', 'hows the {job} going{q}',
    'whats the status{q}', 'whats the status on {my} {car}{q}', 'status of {my} {car}{q}', 'status update please',
    'when will {my} {car} be {done}{q}', 'when will it be {done}{q}', 'when is {my} {car} going to be {done}{q}',
    'how much longer{q}', 'how much longer on {my} {car}{q}', 'how long until {my} {car} is {done}{q}', 'eta on {my} {car}{q}',
    'any eta{q}', 'whats the eta{q}', 'did you guys finish {my} {car}{q}', 'did you finish {my} {job}{q}', 'are you done with {my} {car}{q}',
    'have you started on {my} {car}{q}', 'did you start {my} {job} yet{q}', 'did you get to {my} {car} yet{q}', 'have you looked at {my} {car} yet{q}',
    'is {my} {job} {done}{q}', 'is the {job} {done}{q}', 'can i come get {my} {car}{q}', 'can i come get it{q}', 'can i pick it up yet{q}',
    'is it {done}{q}', 'is it {done} yet{q}', 'where are we at with {my} {car}{q}', 'where are we at{q}', 'wheres {my} {car} at{q}',
    'just wondering how {my} {car} is doing', 'checking on {my} {car}', 'checking on the status of {my} {job}', 'any news on {my} {car}{q}',
    'any word on {my} {car}{q}', 'heard anything on the parts for {my} {car}{q}', 'did the parts come in{q}', 'are the parts in yet{q}',
    'did the part arrive{q}', 'still waiting on parts{q}', 'what stage is {my} {car} in{q}', 'is anyone working on {my} {car}{q}',
    'progress on {my} {car}{q}', 'how is it looking{q}', 'hows it looking{q}', 'whats going on with {my} {car}{q}', 'whats happening with {my} {car}{q}',
    'will {my} {car} be {done} today{q}', 'will it be {done} today{q}', 'think it will be {done} by end of day{q}', 'is it gonna be {done} today{q}',
    'gonna be {done} today{q}', 'do you know when {my} {car} will be {done}{q}', 'do you have an update on {my} {car}{q}', 'could i get an update{q}',
    'can i get an update on {my} {car}{q}', 'can you give me an update{q}', 'can you let me know when {my} {car} is {done}', 'let me know when its {done}',
    'text me when its {done}', 'is {my} {car} still in the shop{q}', 'is {my} {car} still there{q}', 'are you still working on {my} {car}{q}',
    'whats the progress{q}', 'hows progress{q}', 'is {my} {car} fixed{q}', 'did you figure out whats wrong with {my} {car}{q}',
    'did you find out whats wrong{q}', 'any luck finding the problem{q}', 'did you diagnose {my} {car} yet{q}', 'what did you find{q}',
    'stat', 'status', 'update', 'updates', 'status?', 'done?', 'ready?', 'eta?', '{car} ready?', '{car} done?', 'is it ready', 'ready yet',
    'just wanted to see if {my} {car} is {done}', 'wanted to see if {my} {car} is {done}', 'wanted to check if {my} {job} is {done}', 'just seeing if {my} {car} is {done}',
    'any idea when {my} {car} will be {done}{q}', 'any idea when it will be {done}{q}', 'wondering if {my} {car} will be {done} soon', 'wondering when {my} {car} will be {done}',
    'did you get a chance to look at {my} {car}{q}', 'did anyone get a chance to look at it{q}', 'has anyone looked at {my} {car} yet{q}', 'has someone looked at it{q}',
    'when can i expect {my} {car} back{q}', 'when can i expect it{q}', 'when do i get {my} {car} back{q}', 'when will i get {my} {car} back{q}',
    'how far along is {my} {job}{q}', 'how far along are you{q}', 'how close is {my} {car} to being {done}{q}', 'how close are you{q}', 'almost {done}{q}', 'are you almost {done}{q}',
    'were you able to find the problem{q}', 'were you able to figure out whats wrong{q}', 'did you guys find anything{q}', 'find anything{q}',
    'has the {job} started{q}', 'has work started on {my} {car}{q}', 'have you started yet{q}', 'did work start{q}',
    'estado de mi carro{q}', 'esta listo mi carro{q}', 'ya esta listo{q}', 'como va mi carro{q}', 'alguna actualizacion{q}', 'cuando estara listo{q}',
  ],
  hours: [
    'what are your hours{q}', 'what are your shop hours{q}', 'whats your hours{q}', 'hours{q}', 'what time do you close{q}', 'what time do you open{q}',
    'when do you close{q}', 'when do you open{q}', 'what time do you guys close today{q}', 'what time do you open tomorrow{q}', 'are you open{q}',
    'are you open today{q}', 'are you open on saturday{q}', 'are you open saturdays{q}', 'are you open sunday{q}', 'are you guys open{q}',
    'are you still open{q}', 'are you open right now{q}', 'what are your hours today{q}', 'what are your saturday hours{q}', 'what hours are you open{q}',
    'how late are you open{q}', 'how late are you open tonight{q}', 'how early do you open{q}', 'until what time are you open{q}', 'til what time are you open{q}',
    'what time does the shop close{q}', 'when does the shop open{q}', 'when do you guys open in the morning{q}', 'is the shop open today{q}',
    'open today{q}', 'open saturday{q}', 'open tomorrow{q}', 'closing time{q}', 'what time yall close{q}', 'what time do yall open{q}',
    'are you closed today{q}', 'are you closed on sundays{q}', 'are you open on the weekend{q}', 'business hours{q}', 'whats your business hours{q}',
    'hours of operation{q}', 'what time are you open until{q}', 'how long are you open today{q}', 'do you close at 0{q}', 'are you open late{q}',
    'what time do you shut down{q}', 'when do you shut down today{q}', 'what time do you lock up{q}', 'is anyone at the shop{q}', 'is somebody there right now{q}',
    'is anyone there{q}', 'are you there today{q}', 'what time do you start in the morning{q}', 'what time does someone get there{q}', 'are you guys working today{q}',
    'a que hora cierran{q}', 'a que hora abren{q}', 'cual es su horario{q}', 'estan abiertos hoy{q}', 'horario{q}',
  ],
  link: [
    'can you send the estimate{q}', 'can you resend the estimate{q}', 'please send the estimate', 'send me the estimate{q}', 'send the estimate again{q}',
    'can you send me the link{q}', 'can you resend the link{q}', 'resend the link please', 'send me the link again{q}', 'whats the link{q}',
    'i lost the link{q}', 'i lost the link can you send it again{q}', 'i cant find the link{q}', 'the link isnt working can you resend{q}',
    'can i get the estimate{q}', 'can i see the estimate{q}', 'where can i see the estimate{q}', 'where do i see the estimate{q}',
    'can you text me the estimate{q}', 'text me the estimate{q}', 'text me the link{q}', 'can you send the quote link{q}', 'send the quote{q}',
    'i deleted the text with the link{q}', 'can you send that link again{q}', 'link{q}', 'estimate link{q}', 'send link', 'resend link',
    'how do i see the estimate{q}', 'where is the estimate{q}', 'i didnt get the estimate{q}', 'i never got the estimate{q}', 'i never got the link{q}',
    'can you send me my repair page{q}', 'can you send the page with my {car} info{q}', 'where do i approve the repairs{q}', 'how do i approve the estimate{q}',
    'where do i go to see the estimate{q}', 'where do i go to approve{q}', 'wheres the page to approve{q}', 'wheres the page with the estimate{q}',
    'the link expired can you send a new one{q}', 'the link doesnt work{q}', 'link not working{q}', 'can you send a new link{q}', 'can i get the link one more time{q}',
    'can i get that link again{q}', 'one more time with the link please', 'send it again{q}', 'can you send that again{q}',
    'mandame el enlace{q}', 'puede enviar el presupuesto{q}', 'envie el presupuesto otra vez{q}',
  ],
  approval: [
    'go ahead{q}', 'go ahead with it', 'go ahead with the {job}', 'go ahead and do the {job}', 'yes go ahead', 'yes please go ahead', 'yes do it',
    'do it', 'approved', 'i approve', 'i approve the {job}', 'approve the {job}', 'ok go ahead', 'okay go ahead', 'ok do the {job}', 'sounds good go ahead',
    'yes fix it', 'please fix it', 'fix it', 'go for it', 'lets do it', 'lets do the {job}', 'yes lets do the {job}', 'go ahead and fix it',
    'go ahead with the repairs', 'go ahead with everything', 'do everything on the estimate', 'do all of it', 'do the whole thing',
    'only do the {job}', 'just do the {job}', 'just the {job} for now', 'only the {job} please', 'do the {job} but not the rest',
    'skip the {job}', 'dont do the {job}', 'hold off on the {job}', 'no thanks on the {job}', 'decline the {job}', 'i decline the {job}',
    'not the {job}', 'no to the {job}', 'yes to the {job}', 'yes on the {job}', 'approve everything', 'approve all', 'all approved',
    'yeah go ahead', 'yep go ahead', 'yup do it', 'sure go ahead', 'thats fine go ahead', 'ok thats fine do it', 'green light', 'you have the go ahead',
    'you can go ahead', 'you can start', 'you can start the {job}', 'go ahead and start', 'ok proceed', 'please proceed', 'proceed with the {job}',
    'ok do the {job} and the {job}', 'do the {job} and the {job}', 'yes to the {job} and the {job}', 'we will skip the {job}', 'well skip the {job} this time',
    'skip the {job} this time', 'lets skip the {job}', 'well pass on the {job}', 'pass on the {job}', 'we will do the {job} next time',
    'si adelante', 'si haganlo', 'adelante con la reparacion', 'aprobado',
  ],
  // Shop texts that look a bit like the topics above but need a person.
  review: [
    'is {my} {car} safe to drive{q}', 'is it safe to drive{q}', 'can i drive it like this{q}', 'is it ok to drive home{q}',
    'is {my} {car} {done} and how much do i owe{q}', 'how much do i owe{q}', 'how much is it{q}', 'how much is the {job}{q}', 'how much will the {job} cost{q}',
    'whats the total{q}', 'what do i owe{q}', 'can i pay over the phone{q}', 'do you take credit cards{q}', 'can i pay online{q}', 'do you take apple pay{q}',
    'why is it so expensive{q}', 'thats too much', 'can you do it cheaper{q}', 'any discount{q}', 'can you match this price{q}', 'is there a warranty on the {job}{q}',
    'pickup at 0{q}', 'can i pick it up at 0{q}', 'ill be there at 0', 'ill pick it up tomorrow', 'ill come by after work', 'can i drop it off tomorrow{q}',
    'can i schedule an appointment{q}', 'can i book an oil change{q}', 'do you have any openings this week{q}', 'can you fit me in today{q}', 'can i reschedule{q}',
    'can someone call me{q}', 'please call me', 'call me when you can', 'can you call me back{q}', 'whats your phone number{q}', 'who am i talking to{q}',
    'my {car} is making a noise again', 'the check engine light came back on', 'its leaking again', 'its still making the same noise', 'smells like burning',
    'the {job} didnt fix it', 'the problem is back', 'im not happy with the {job}', 'i want to talk to a manager', 'this is ridiculous', 'why is it taking so long',
    'do you need my keys{q}', 'where do i leave the keys{q}', 'did you find my sunglasses{q}', 'i left my phone charger in the {car}', 'can you check the tire pressure too{q}',
    'can you also look at the {job}{q}', 'while its there can you do the {job}{q}', 'can you add an oil change{q}', 'do i need new tires{q}', 'should i do the {job}{q}',
    'what do you recommend{q}', 'is the {job} really necessary{q}', 'can it wait{q}', 'can the {job} wait a few months{q}', 'what happens if i dont do it{q}',
    'do you have a loaner{q}', 'can i get a ride{q}', 'do you offer shuttle service{q}', 'is there a rental car{q}', 'does insurance cover this{q}',
    'ok', 'ok thanks', 'thanks', 'thank you', 'thank you!', 'sounds good', 'got it', 'perfect', 'great thanks', 'cool', 'k', 'thx', '👍', 'awesome thank you',
    'ok ill wait', 'no problem', 'no rush', 'take your time', 'who is this{q}', 'wrong number', 'what is this{q}', 'is this the shop{q}', 'yes', 'no', 'maybe',
    'can i get a copy of my invoice{q}', 'can you email me the receipt{q}', 'i need the invoice for my work', 'send me the receipt{q}', 'can you send me pictures{q}',
    'can you send me a picture of the old part{q}', 'can i keep the old parts{q}', 'what brand of tires do you use{q}', 'do you use oem parts{q}', 'what oil did you use{q}',
    'is {my} {car} ready and can you also rotate the tires{q}', 'when will it be {done} and how much{q}', 'is it {done}? how much do i owe?', 'whats the status and the total{q}',
    'my {car} broke down can you tow it{q}', 'do you do towing{q}', 'can you look at my other {car} too{q}', 'do you work on diesels{q}', 'do you do state inspections{q}',
    'i was in an accident', 'someone hit my {car}', 'i got a flat tire', 'my battery died', 'my {car} wont start', 'my {car} is overheating', 'the ac is blowing hot air',
    'how long will an oil change take{q}', 'how long does an alignment take{q}', 'how long does the {job} usually take{q}', 'do i need an appointment for an oil change{q}',
    'stop texting me', 'please remove me', 'unsubscribe me', 'dont text me', 'can you email instead{q}', 'can you text my husband instead{q}',
    'hold on let me check', 'let me ask my wife', 'let me think about it', 'ill get back to you', 'not yet', 'give me a minute', 'i need to talk to my husband first',
    'no dont do anything yet', 'wait dont do anything', 'what does the {job} include{q}', 'what is a {job}{q}', 'what does that mean{q}', 'can you explain the estimate{q}',
    'i dont understand the estimate', 'the estimate is wrong', 'why is there a shop fee{q}', 'what is the diagnostic fee{q}', 'is the diagnostic fee waived{q}',
    'my check engine light is on', 'check engine light is on again', 'my {car} is doing it again', 'the light is back on', 'the {job} is making noise again',
    'why is the estimate so high{q}', 'why is the estimate so expensive{q}', 'the estimate seems high', 'the quote is way too high', 'why does the estimate cost so much{q}',
    'que tan seguro es manejarlo{q}', 'cuanto cuesta{q}', 'cuanto le debo{q}', 'me puede llamar{q}', 'gracias', 'ok gracias',
  ],
};

function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

function fill(rng, pattern) {
  return pattern.replace(/\{(\w+)\}/g, (_, k) => pick(rng, S[k])).replace(/\s+/g, ' ').trim();
}

const KEYS = 'qwertyuiopasdfghjklzxcvbnm';
function typo(rng, s) {
  const i = 1 + Math.floor(rng() * Math.max(1, s.length - 2));
  const r = rng();
  if (r < 0.3) return s.slice(0, i) + s.slice(i + 1); // dropped letter
  if (r < 0.6 && i + 1 < s.length) return s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2); // swapped letters
  if (r < 0.8) return s.slice(0, i) + s[i] + s.slice(i); // doubled letter
  return s.slice(0, i) + pick(rng, KEYS) + s.slice(i + 1); // wrong key
}

function noise(rng, s, topic) {
  // Greetings and sign-offs, but not on one-word replies to the shop.
  if (topic !== 'review' || rng() < 0.3) s = pick(rng, S.hi) + s + pick(rng, S.bye);
  s = s.replace(/\bim\b/g, () => (rng() < 0.5 ? "I'm" : 'im')).replace(/\bwhats\b/g, () => (rng() < 0.5 ? "what's" : 'whats'))
    .replace(/\bhows\b/g, () => (rng() < 0.4 ? "how's" : 'hows')).replace(/\byou\b/g, () => (rng() < 0.12 ? 'u' : 'you'))
    .replace(/\bare\b/g, () => (rng() < 0.08 ? 'r' : 'are')).replace(/\bplease\b/g, () => (rng() < 0.2 ? 'pls' : 'please'))
    .replace(/\b0\b/g, () => String(1 + Math.floor(rng() * 11)));
  if (rng() < 0.35) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (rng() < 0.05) s = s.toUpperCase();
  const typos = rng() < 0.3 ? 1 + Math.floor(rng() * 2) : 0;
  for (let t = 0; t < typos; t++) s = typo(rng, s);
  return s;
}

/** Shop texts: `perPattern` noisy copies of every pattern. */
export function shopTexts(rng, perPattern = 12) {
  const out = [];
  for (const [topic, list] of Object.entries(PATTERNS)) {
    for (const p of list) for (let n = 0; n < perPattern; n++) out.push({ text: noise(rng, fill(rng, p), topic), topic });
  }
  return out;
}

/** CLINC150 texts (general assistant questions plus out-of-scope ones), all labeled review. */
export function clincTexts(clinc) {
  const rows = [...clinc.train, ...clinc.oos_train, ...clinc.val, ...clinc.oos_val];
  return rows.map(([text]) => ({ text, topic: 'review' }));
}

export function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
