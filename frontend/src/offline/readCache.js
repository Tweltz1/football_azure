// The last copy of each page's data, so pages still open with no internet (airplane mode, a basement
// draft room). Only reads are kept: API GETs, plus the profile lookup (a POST that only reads).
// Saving changes still needs the internet, or a league saved to the device (offlineSync.js).

const PREFIX = 'hl-read:';
const MAX_CHARS = 400000; // skip anything huge; localStorage holds about 5 MB

const READ_POSTS = new Set(['user-profile']);

/** The key for a request that is a read, or null. `path` is relative to the API base, without '?'. */
export const readKey = (method, path, query) => {
  const verb = String(method || 'get').toLowerCase();
  if (verb !== 'get' && !(verb === 'post' && READ_POSTS.has(path))) return null;
  const search = query ? String(query) : '';
  return `${PREFIX}${verb} ${path}${search ? `?${search}` : ''}`;
};

export const saveRead = (key, data) => {
  if (!key || data === undefined) return;
  try {
    const text = JSON.stringify({ savedAt: Date.now(), data });
    if (text.length <= MAX_CHARS) localStorage.setItem(key, text);
  } catch (error) { /* storage full or unavailable */ }
};

/** The saved copy for a key: { savedAt, data }, or null. */
export const loadRead = (key) => {
  if (!key) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    return saved && 'data' in saved ? saved : null;
  } catch (error) {
    return null;
  }
};

/** On sign-out: the next person on this phone shouldn't see the last one's pages. */
export const clearReads = () => {
  try {
    Object.keys(localStorage).filter((key) => key.startsWith(PREFIX)).forEach((key) => localStorage.removeItem(key));
  } catch (error) { /* storage unavailable */ }
};
