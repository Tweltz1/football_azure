// Sign-in inside the Hood League iPhone app (AuthSessionPlugin in ios-app/ios/App/App/HoodViewController.swift).
// The app's web page can't send people to Google and back like the website does, so the sign-in
// opens in Apple's sign-in sheet, which returns to the app at APP_REDIRECT. That address must be listed
// in Supabase under Authentication > URL Configuration > Redirect URLs.

export const APP_SCHEME = 'com.hoodleague.draft';
export const APP_REDIRECT = `${APP_SCHEME}://auth`;

// The site doesn't bundle @capacitor/core; the app's native code puts each plugin on window.Capacitor.Plugins.
const plugin = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AuthSession) || null;

/** True inside the iPhone app (its pages load from capacitor://localhost). */
export const inApp = () => typeof window !== 'undefined' && window.location.protocol === 'capacitor:';

/** Opens the sign-in page and resolves with the address it came back to, or null if cancelled. */
export const openSignIn = async (url) => {
  try {
    const AuthSession = plugin();
    if (!AuthSession) {
      const found = Object.keys((window.Capacitor && window.Capacitor.Plugins) || {}).join(', ') || 'none';
      throw new Error(`This version of the app can't open sign-in (plugins: ${found}).`);
    }
    const result = await AuthSession.start({ url, scheme: APP_SCHEME });
    return result.url;
  } catch (error) {
    if (error?.code === 'CANCELLED') return null;
    throw error;
  }
};

/** True when this app build has Apple's own sign-in sheet (Curbsy 70 and later). */
export const hasAppleSheet = () => typeof plugin()?.appleSignIn === 'function';

const sha256Hex = async (text) => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Sign in with Apple through Apple's own sheet. Resolves with { token, rawNonce, fullName } for
 * supabase.auth.signInWithIdToken, or null if cancelled. Apple gets the hashed nonce, Supabase the raw one.
 */
export const appleSheetSignIn = async () => {
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  const rawNonce = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const result = await plugin().appleSignIn({ nonce: await sha256Hex(rawNonce) });
    return { token: result.identityToken, rawNonce, fullName: result.fullName || '' };
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
