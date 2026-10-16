// Leagues saved to this device for a draft with no internet. Plain localStorage, no other imports, so
// api.js and realtime.js can both read it without import cycles.
//
//   hl-offline:index        -> [leagueId, ...]
//   hl-offline:league:<id>  -> { league, version, baseVersion, savedAt, userId }
//   hl-offline:user         -> { userId, userDetails } of whoever saved a draft here

const INDEX_KEY = 'hl-offline:index';
const USER_KEY = 'hl-offline:user';
export const LEAGUE_KEY_PREFIX = 'hl-offline:league:';
const leagueKey = (id) => `${LEAGUE_KEY_PREFIX}${id}`;

const read = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
};

const write = (key, value) => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const offlineLeagueIds = () => {
  const ids = read(INDEX_KEY, []);
  return Array.isArray(ids) ? ids : [];
};

export const isOfflineLeague = (leagueId) => Boolean(leagueId) && offlineLeagueIds().includes(leagueId);

export const readOfflineLeague = (leagueId) => (isOfflineLeague(leagueId) ? read(leagueKey(leagueId), null) : null);

/** Saves (or updates) a league's device copy. Throws if the device is out of space. */
export const writeOfflineLeague = (leagueId, entry) => {
  write(leagueKey(leagueId), entry);
  const ids = offlineLeagueIds();
  if (!ids.includes(leagueId)) write(INDEX_KEY, [...ids, leagueId]);
};

export const removeOfflineLeague = (leagueId) => {
  try {
    window.localStorage.removeItem(leagueKey(leagueId));
    write(INDEX_KEY, offlineLeagueIds().filter((id) => id !== leagueId));
  } catch (error) {
    // Nothing else to do; the copy just stays.
  }
};

export const rememberOfflineUser = (user) => {
  if (!user?.userId) return;
  try {
    write(USER_KEY, { userId: user.userId, userDetails: user.userDetails || 'Commissioner' });
  } catch (error) {
    // Best effort.
  }
};

/** Who saved the drafts on this device; lets the site open with no internet once sign-in can't refresh. */
export const offlineUser = () => (offlineLeagueIds().length ? read(USER_KEY, null) : null);

// The last account signed in on this device, so the app opens as them with no internet even before any
// draft was saved here (offline setup in the draft room then works from the saved page copies).
const LAST_USER_KEY = 'hl-offline:last-user';

export const rememberLastUser = (user) => {
  if (!user?.userId) return;
  try {
    write(LAST_USER_KEY, { userId: user.userId, userDetails: user.userDetails || 'Player' });
  } catch (error) {
    // Best effort.
  }
};

export const lastSignedInUser = () => read(LAST_USER_KEY, null);

export const forgetLastUser = () => {
  try { window.localStorage.removeItem(LAST_USER_KEY); } catch (error) { /* nothing to do */ }
};
