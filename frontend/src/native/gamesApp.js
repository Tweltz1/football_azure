// The Hood Games iPhone app (ios-games-app/) ships the same website as the Hood League app, but opens on
// the games hub. Its web view adds "HoodGames" to the user agent (capacitor.config.json appendUserAgent),
// which is how the pages tell the two apps apart.

export const HOOD_GAMES_PATH = '/hood-games';

/** True inside the Hood Games iPhone app. */
export const inGamesApp = () => typeof navigator !== 'undefined' && /\bHoodGames\b/.test(navigator.userAgent || '');

/** Where "back home" links go: the games hub in the Hood Games app, the front page on the website. */
export const homeHref = () => (inGamesApp() ? HOOD_GAMES_PATH : '/');

/** Label for those links. */
export const homeLabel = () => (inGamesApp() ? 'Hood Games' : 'Hood League');
