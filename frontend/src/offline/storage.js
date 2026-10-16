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
  clearSignedOut();
  try {
    write(USER_KEY, { userId: user.userId, userDetails: user.userDetails || 'Commissioner' });
  } catch (error) {
    // Best effort.
  }
};

// Set by Logout so the app stops opening as the saved offline user; cleared when someone signs in,
// continues as the saved user, or starts as a guest. Drafts saved on the phone are kept.
const SIGNED_OUT_KEY = 'hl-offline:signed-out';
export const markSignedOut = () => { try { write(SIGNED_OUT_KEY, true); } catch (error) { /* best effort */ } };
export const clearSignedOut = () => { try { window.localStorage.removeItem(SIGNED_OUT_KEY); } catch (error) { /* nothing to do */ } };
export const isSignedOut = () => read(SIGNED_OUT_KEY, false) === true;

/** Who saved the drafts on this device; lets the site open with no internet once sign-in can't refresh. */
export const offlineUser = () => (offlineLeagueIds().length ? read(USER_KEY, null) : null);

// The last account signed in on this device, so the app opens as them with no internet even before any
// draft was saved here (offline setup in the draft room then works from the saved page copies).
const LAST_USER_KEY = 'hl-offline:last-user';

export const rememberLastUser = (user) => {
  if (!user?.userId) return;
  clearSignedOut();
  try {
    write(LAST_USER_KEY, { userId: user.userId, userDetails: user.userDetails || 'Player' });
  } catch (error) {
    // Best effort.
  }
};

export const lastSignedInUser = () => read(LAST_USER_KEY, null);

// The last good profile (favorites, notes, tiers, budget plan) of each account signed in on this phone.
// Kept through Logout so someone can load their profile again with no internet; one copy per account.
const PROFILES_KEY = 'hl-offline:profiles';
const MAX_PROFILES = 6;

export const saveProfileCopy = (user, profile) => {
  if (!user?.userId || !profile || typeof profile !== 'object' || user.guest) return;
  try {
    const all = { ...read(PROFILES_KEY, {}) };
    all[user.userId] = {
      user: { userId: user.userId, userDetails: user.userDetails || profile.displayName || 'Player' },
      profile,
      savedAt: Date.now(),
    };
    const keep = Object.keys(all).sort((a, b) => (all[b].savedAt || 0) - (all[a].savedAt || 0)).slice(0, MAX_PROFILES);
    write(PROFILES_KEY, Object.fromEntries(keep.map((id) => [id, all[id]])));
  } catch (error) {
    // Best effort.
  }
};

export const savedProfileFor = (userId) => (userId ? read(PROFILES_KEY, {})[userId]?.profile || null : null);

/** Accounts with a saved profile on this phone, newest first: [{ user, savedAt }]. */
export const savedProfiles = () => {
  const all = read(PROFILES_KEY, {});
  return Object.values(all)
    .filter((entry) => entry?.user?.userId)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .map(({ user, savedAt }) => ({ user, savedAt }));
};

export const forgetSavedProfile = (userId) => {
  try {
    const all = { ...read(PROFILES_KEY, {}) };
    delete all[userId];
    write(PROFILES_KEY, all);
    if (read(CHOSEN_KEY, null)?.userId === userId) window.localStorage.removeItem(CHOSEN_KEY);
  } catch (error) { /* nothing to do */ }
};

// Picked on the sign-in page with no internet ("Load my saved profile"): the app opens as this account
// until someone signs in for real or logs out.
const CHOSEN_KEY = 'hl-offline:chosen-user';

export const chooseSavedUser = (userId) => {
  const entry = read(PROFILES_KEY, {})[userId];
  if (!entry?.user) return null;
  write(CHOSEN_KEY, entry.user);
  clearSignedOut();
  return entry.user;
};

export const chosenUser = () => read(CHOSEN_KEY, null);

export const forgetChosenUser = () => {
  try { window.localStorage.removeItem(CHOSEN_KEY); } catch (error) { /* nothing to do */ }
};

export const forgetLastUser = () => {
  try { window.localStorage.removeItem(LAST_USER_KEY); } catch (error) { /* nothing to do */ }
};

// Someone with no account on this phone (a guest draft with no internet). They get a made-up ID that stays
// on this phone; their team can be claimed online later from the league's invite link.
const GUEST_KEY = 'hl-offline:guest';

const randomId = () => (window.crypto?.randomUUID
  ? window.crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const guestUser = () => read(GUEST_KEY, null);

export const becomeGuest = (name) => {
  const existing = guestUser();
  const user = {
    userId: existing?.userId || `guest-${randomId()}`,
    userDetails: String(name || '').trim() || existing?.userDetails || 'Player',
    guest: true,
  };
  write(GUEST_KEY, user);
  clearSignedOut();
  return user;
};

export const forgetGuest = () => {
  try { window.localStorage.removeItem(GUEST_KEY); } catch (error) { /* nothing to do */ }
};

// Display names for people in drafts run on this phone (players in a nearby draft have no profile here).
const NAMES_KEY = 'hl-offline:names';

export const rememberName = (userId, name) => {
  if (!userId || !String(name || '').trim()) return;
  try {
    write(NAMES_KEY, { ...read(NAMES_KEY, {}), [userId]: String(name).trim().slice(0, 40) });
  } catch (error) {
    // Best effort.
  }
};

export const nameFor = (userId) => read(NAMES_KEY, {})[userId] || null;
