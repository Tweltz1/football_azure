// The last copy of each page's data, so pages still open with no internet (airplane mode, a basement
// draft room). Only reads are kept: API GETs, plus the profile lookup (a POST that only reads).
// Saving changes still needs the internet, or a league saved to the device (offlineSync.js).

const PREFIX = 'hl-read:';
const MAX_CHARS = 1500000; // skip anything huge; localStorage holds about 5 MB

const READ_POSTS = new Set(['user-profile']);

/** The key for a request that is a read, or null. `path` is relative to the API base, without '?'. */
export const readKey = (method, path, query) => {
  const verb = String(method || 'get').toLowerCase();
  if (verb !== 'get' && !(verb === 'post' && READ_POSTS.has(path))) return null;
  const search = query ? String(query) : '';
  return `${PREFIX}${verb} ${path}${search ? `?${search}` : ''}`;
};

const savedKeysOldestFirst = () => Object.keys(localStorage)
  .filter((key) => key.startsWith(PREFIX))
  .map((key) => {
    try { return { key, savedAt: JSON.parse(localStorage.getItem(key)).savedAt || 0 }; } catch (error) { return { key, savedAt: 0 }; }
  })
  .sort((a, b) => a.savedAt - b.savedAt)
  .map(({ key }) => key);

export const saveRead = (key, data) => {
  if (!key || data === undefined) return;
  let text;
  try {
    text = JSON.stringify({ savedAt: Date.now(), data });
  } catch (error) {
    return;
  }
  if (text.length > MAX_CHARS) return;
  try {
    localStorage.setItem(key, text);
  } catch (error) {
    // Full: make room by dropping the oldest saved pages (never drafts or settings), then try once more.
    try {
      const old = savedKeysOldestFirst().filter((k) => k !== key);
      let freed = 0;
      while (old.length && freed < text.length * 2) {
        const k = old.shift();
        freed += (localStorage.getItem(k) || '').length;
        localStorage.removeItem(k);
      }
      localStorage.setItem(key, text);
    } catch (again) { /* still no room */ }
  }
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
