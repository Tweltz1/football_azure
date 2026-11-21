// Which Games Night theme is on today. Every holiday has its own set of quiz questions, Mash-up prompts and
// Behind the Mask words (see themes/), and the app switches by date, so no new release is needed each holiday.
// Between holidays the everyday "classic" set plays. Add ?theme=<id> (for example ?theme=easter) to the TV or
// phone page to force one; ?theme=holiday still means the Christmas set. The TV deals the questions and words,
// so phones only use this for titles and labels.

// Thanksgiving in the U.S. is the 4th Thursday of November.
export function thanksgivingDay(year) {
  const firstDow = new Date(year, 10, 1).getDay();
  return 1 + ((4 - firstDow + 7) % 7) + 21;
}

// Western Easter Sunday (Anonymous Gregorian algorithm). Returns a local Date.
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const DAY = 24 * 60 * 60 * 1000;

/** The theme id for a date, from the calendar alone (no ?theme= override). */
export function themeForDate(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0 = January
  const d = date.getDate();
  const md = (m + 1) * 100 + d; // e.g. 1225 for December 25
  const today = new Date(y, m, d);

  // New Year's runs across the year line: December 27 to January 10.
  if (md >= 1227 || md <= 110) return 'newyear';
  if (md >= 201 && md <= 214) return 'valentines';
  if (md >= 301 && md <= 317) return 'stpatricks';
  // Easter: the two weeks before Easter Sunday through Easter Monday (St. Patrick's wins any overlap).
  const easter = easterSunday(y);
  const fromEaster = Math.round((today - easter) / DAY);
  if (fromEaster >= -13 && fromEaster <= 1) return 'easter';
  if (md >= 620 && md <= 706) return 'july4';
  if (md >= 1001 && md <= 1031) return 'spooky';
  // Thanksgiving: November 1 through the Sunday after Thanksgiving. Then Christmas through December 26.
  if (m === 10 && d <= thanksgivingDay(y) + 3) return 'thanksgiving';
  if (m === 10 || m === 11) return 'christmas';
  return 'classic';
}

// What each theme calls things. quiz/mash are the two games whose content changes with the theme;
// Last Candle, Haunted Hallway and Behind the Mask keep their names (Mask's secret words still change).
export const THEMES = {
  spooky: {
    name: 'Halloween', icon: '🎃', party: 'Halloween party games',
    quiz: { title: 'Fright Quiz', emoji: '🎃', blurb: 'Spooky trivia. The fastest right answer scores the most.', kind: 'Halloween',
      welcome: 'Welcome to Fright Quiz! Spooky trivia, and it\'s every ghoul for themselves.' },
    mash: { title: 'Monster Mash-up', emoji: '🧟', kind: 'spooky' },
  },
  thanksgiving: {
    name: 'Thanksgiving', icon: '🦃', party: 'Thanksgiving party games',
    quiz: { title: 'Thanksgiving Quiz', emoji: '🦃', blurb: 'Turkey-day trivia. The fastest right answer scores the most.', kind: 'Thanksgiving',
      welcome: 'Welcome to the Thanksgiving Quiz! Turkey-day trivia, and it\'s every pilgrim for themselves.' },
    mash: { title: 'Leftovers Mash-up', emoji: '🥧', kind: 'Thanksgiving' },
  },
  christmas: {
    name: 'Holiday', icon: '🎄', party: 'Holiday party games',
    quiz: { title: 'Holiday Quiz', emoji: '🎄', blurb: 'Christmas, Hanukkah and winter trivia. The fastest right answer scores the most.', kind: 'holiday',
      welcome: 'Welcome to the Holiday Quiz! Holiday trivia, and it\'s every elf for themselves.' },
    mash: { title: 'Holiday Mash-up', emoji: '🎁', kind: 'holiday' },
  },
  newyear: {
    name: 'New Year’s', icon: '🎆', party: 'New Year’s party games',
    quiz: { title: 'Countdown Quiz', emoji: '🎆', blurb: 'New Year’s trivia from around the world. The fastest right answer scores the most.', kind: 'New Year’s',
      welcome: 'Welcome to the Countdown Quiz! New Year\'s trivia, and it\'s every party hat for itself.' },
    mash: { title: 'Midnight Mash-up', emoji: '🥳', kind: 'New Year’s' },
  },
  valentines: {
    name: 'Valentine’s', icon: '💘', party: 'Valentine’s party games',
    quiz: { title: 'Sweetheart Quiz', emoji: '💘', blurb: 'Valentine’s trivia. The fastest right answer scores the most.', kind: 'Valentine’s',
      welcome: 'Welcome to the Sweetheart Quiz! Valentine\'s trivia, and it\'s every cupid for themselves.' },
    mash: { title: 'Valentine Mash-up', emoji: '💌', kind: 'Valentine’s' },
  },
  stpatricks: {
    name: 'St. Patrick’s Day', icon: '☘️', party: 'St. Patrick’s Day party games',
    quiz: { title: 'Lucky Quiz', emoji: '☘️', blurb: 'St. Patrick’s Day and Irish trivia. The fastest right answer scores the most.', kind: 'St. Patrick’s Day',
      welcome: 'Welcome to the Lucky Quiz! St. Patrick\'s Day trivia, and it\'s every leprechaun for themselves.' },
    mash: { title: 'Shamrock Mash-up', emoji: '🍀', kind: 'lucky' },
  },
  easter: {
    name: 'Easter', icon: '🐣', party: 'Easter party games',
    quiz: { title: 'Egg Hunt Quiz', emoji: '🐣', blurb: 'Easter and springtime trivia. The fastest right answer scores the most.', kind: 'Easter',
      welcome: 'Welcome to the Egg Hunt Quiz! Springtime trivia, and it\'s every bunny for themselves.' },
    mash: { title: 'Bunny Mash-up', emoji: '🐰', kind: 'springtime' },
  },
  july4: {
    name: 'Fourth of July', icon: '🎇', party: 'Fourth of July party games',
    quiz: { title: 'Firecracker Quiz', emoji: '🎇', blurb: 'Red, white and blue trivia. The fastest right answer scores the most.', kind: 'Fourth of July',
      welcome: 'Welcome to the Firecracker Quiz! Fourth of July trivia, and it\'s every patriot for themselves.' },
    mash: { title: 'Cookout Mash-up', emoji: '🌭', kind: 'cookout' },
  },
  classic: {
    name: 'Classic', icon: '🎉', party: 'Party games',
    quiz: { title: 'Party Quiz', emoji: '🧠', blurb: 'Trivia for everyone. The fastest right answer scores the most.', kind: 'trivia',
      welcome: 'Welcome to the Party Quiz! Trivia for everyone, and it\'s every brain for itself.' },
    mash: { title: 'Party Mash-up', emoji: '😂', kind: 'silly' },
  },
};

const ALIASES = { holiday: 'christmas', halloween: 'spooky', 'new-year': 'newyear', valentine: 'valentines', stpatrick: 'stpatricks', 'st-patricks': 'stpatricks', july: 'july4', fourth: 'july4', default: 'classic' };

/** The theme id on now: ?theme= if it names one, otherwise by date. */
export function season(date = new Date()) {
  try {
    let forced = (new URLSearchParams(window.location.search).get('theme') || '').toLowerCase();
    forced = ALIASES[forced] || forced;
    if (THEMES[forced]) return forced;
  } catch (e) { /* no window (tests) */ }
  return themeForDate(date);
}

/** The labels for the theme on now. */
export const themeInfo = (date) => ({ id: season(date), ...THEMES[season(date)] });

export const isSpooky = (date) => season(date) === 'spooky';

// The look of Weltzcraft Games for each theme: title font (Google Fonts) and what drifts down the home screens.
// The colors live in themeLook.css, keyed by data-hg-theme on <html>.
export const LOOKS = {
  spooky: { font: 'Creepster', fontParam: 'Creepster', sky: ['🦇', '🍂', '🦇'] },
  thanksgiving: { font: 'Rye', fontParam: 'Rye', sky: ['🍂', '🍁', '🍂'] },
  christmas: { font: 'Mountains of Christmas', fontParam: 'Mountains+of+Christmas:wght@700', sky: ['❄', '❄', '✦'] },
  newyear: { font: 'Bungee', fontParam: 'Bungee', sky: ['🎉', '✨', '🎊'] },
  valentines: { font: 'Pacifico', fontParam: 'Pacifico', sky: ['💕', '❤', '💘'] },
  stpatricks: { font: 'Uncial Antiqua', fontParam: 'Uncial+Antiqua', sky: ['☘', '🍀', '✨'] },
  easter: { font: 'Chewy', fontParam: 'Chewy', sky: ['🌸', '🌷', '🥚'] },
  july4: { font: 'Bungee', fontParam: 'Bungee', sky: ['⭐', '✨', '🎆'] },
  classic: { font: 'Lilita One', fontParam: 'Lilita+One', sky: ['✨', '⭐', '✨'] },
};

/** The Google Fonts stylesheet for the party pages: Fredoka for text plus the theme's title font. */
export const fontsHref = () => `https://fonts.googleapis.com/css2?family=${LOOKS[season()].fontParam}&family=Fredoka:wght@500;700&display=swap`;

/** Marks <html> with the theme so themeLook.css can recolor every Weltzcraft Games page. */
export function applyThemeLook() {
  try { document.documentElement.setAttribute('data-hg-theme', season()); } catch (e) { /* no document */ }
}
