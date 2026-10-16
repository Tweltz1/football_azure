import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from './supabaseClient';
import { offlineUser } from './offline/storage';
import * as nativeSignIn from './native/authSession';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

// Keeps the same user shape the app used with Azure Static Web Apps sign-in ({ userId, userDetails }).
const toAppUser = (supabaseUser) => {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata || {};
  return {
    userId: supabaseUser.id,
    userDetails: meta.user_name || meta.preferred_username || meta.full_name || meta.name || supabaseUser.email || 'Player',
    identityProvider: supabaseUser.app_metadata?.provider || null,
    email: supabaseUser.email || null,
  };
};

// With no internet the sign-in can't refresh. If a draft is saved on this device, open the site as the
// commissioner who saved it so the draft can go on; the server checks the real sign-in on upload.
const offlineFallback = (error) => {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const saved = offline || error ? offlineUser() : null;
  return saved ? { ...saved, identityProvider: null, email: null, offline: true } : null;
};

export const signIn = async (provider) => {
  const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined;
  if (!nativeSignIn.isAvailable()) {
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin + window.location.pathname + window.location.search, queryParams },
    });
  }
  // iPhone app: sign in through Apple's sign-in sheet, then hand the result to Supabase here.
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: nativeSignIn.APP_REDIRECT, skipBrowserRedirect: true, queryParams },
    });
    if (error) throw error;
    const back = await nativeSignIn.openSignIn(data.url);
    if (!back) return null;
    const result = nativeSignIn.readCallback(back);
    if (result.accessToken && result.refreshToken) {
      return await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
    }
    if (result.code) return await supabase.auth.exchangeCodeForSession(result.code);
    throw new Error(result.error || 'Sign-in didn\'t finish.');
  } catch (error) {
    window.alert(`Couldn't sign in: ${error?.message || error}`);
    return null;
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.assign('/');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // With no internet, a sign-in that needs refreshing keeps retrying for about 30 seconds. When a draft is
    // saved on this device, don't make the commissioner wait for that.
    const saved = offlineUser();
    let settled = false;
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const offlineTimer = saved ? window.setTimeout(() => {
      if (settled || !isMounted) return;
      setUser({ ...saved, identityProvider: null, email: null, offline: true });
      setLoading(false);
    }, isOffline ? 0 : 4000) : null;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        const signedIn = toAppUser(data?.session?.user);
        setUser((current) => signedIn || (current?.offline ? current : offlineFallback(error)));
      })
      .catch((error) => {
        console.error('Error fetching auth status:', error);
        if (isMounted) setUser((current) => (current?.offline ? current : offlineFallback(error)));
      })
      .finally(() => {
        settled = true;
        window.clearTimeout(offlineTimer);
        if (isMounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = toAppUser(session?.user);
      // A refresh that failed for lack of internet isn't a sign-out; keep the offline commissioner.
      if (!nextUser && event !== 'SIGNED_OUT') {
        setUser((current) => (current?.offline ? current : nextUser));
        return;
      }
      // Token refreshes fire this too; keep the same object so pages don't reload their data.
      setUser((current) => (current?.userId === nextUser?.userId ? current : nextUser));
    });

    return () => {
      isMounted = false;
      window.clearTimeout(offlineTimer);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const value = {
    user,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
