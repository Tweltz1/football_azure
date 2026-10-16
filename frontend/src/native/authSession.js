// Sign-in inside the Hood League iPhone app (AuthSessionPlugin in ios-app/ios/App/App/HoodViewController.swift).
// The app's web page can't send people to GitHub/Google and back like the website does, so the sign-in
// opens in Apple's sign-in sheet, which returns to the app at APP_REDIRECT. That address must be listed
// in Supabase under Authentication > URL Configuration > Redirect URLs.

const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;

export const APP_SCHEME = 'com.hoodleague.draft';
export const APP_REDIRECT = `${APP_SCHEME}://auth`;

export const isAvailable = () =>
  !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable('AuthSession'));

const AuthSession = cap && cap.registerPlugin ? cap.registerPlugin('AuthSession') : null;

/** Opens the sign-in page and resolves with the address it came back to, or null if cancelled. */
export const openSignIn = async (url) => {
  try {
    const result = await AuthSession.start({ url, scheme: APP_SCHEME });
    return result.url;
  } catch (error) {
    if (error?.code === 'CANCELLED') return null;
    throw error;
  }
};

/** Reads tokens (or a code, or an error) from the address sign-in came back to. */
export const readCallback = (url) => {
  const [beforeHash, hash = ''] = String(url || '').split('#');
  const params = new URLSearchParams(beforeHash.split('?')[1] || '');
  new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    error: params.get('error_description') || params.get('error'),
  };
};
