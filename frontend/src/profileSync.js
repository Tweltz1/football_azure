export const PROFILE_SYNC_STORAGE_KEY = 'hoodLeague.profile.updatedAt';
export const PROFILE_SYNC_EVENT = 'hoodLeagueProfileUpdated';

export const notifyProfileUpdated = () => {
  const timestamp = String(Date.now());

  try {
    window.localStorage.setItem(PROFILE_SYNC_STORAGE_KEY, timestamp);
  } catch (error) {
    console.warn('Unable to write profile sync marker:', error);
  }

  window.dispatchEvent(new CustomEvent(PROFILE_SYNC_EVENT, { detail: { timestamp } }));
};

export const subscribeProfileUpdates = (callback, { includeFocus = false } = {}) => {
  if (typeof callback !== 'function') return () => {};

  const handleStorage = (event) => {
    if (event.key === PROFILE_SYNC_STORAGE_KEY) {
      callback();
    }
  };

  const handleCustomEvent = () => callback();
  const handleFocus = () => callback();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(PROFILE_SYNC_EVENT, handleCustomEvent);
  if (includeFocus) {
    window.addEventListener('focus', handleFocus);
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(PROFILE_SYNC_EVENT, handleCustomEvent);
    if (includeFocus) {
      window.removeEventListener('focus', handleFocus);
    }
  };
};
