// Which party-game theme is on: 'holiday' from November 1 to January 6 (Thanksgiving, Christmas, New Year's),
// 'spooky' (Halloween) the rest of the year. Add ?theme=holiday or ?theme=spooky to the TV or phone page
// to force one. The TV deals the questions and words, so phones only use this for titles and labels.
export function season(date = new Date()) {
  try {
    const forced = new URLSearchParams(window.location.search).get('theme');
    if (forced === 'holiday' || forced === 'spooky') return forced;
  } catch (e) { /* no window (tests) */ }
  const m = date.getMonth();
  const d = date.getDate();
  return m === 10 || m === 11 || (m === 0 && d <= 6) ? 'holiday' : 'spooky';
}

export const isHoliday = (date) => season(date) === 'holiday';
