import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from './supabaseClient';

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

export const signIn = (provider) => supabase.auth.signInWithOAuth({
  provider,
  options: {
    redirectTo: window.location.origin + window.location.pathname + window.location.search,
    queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
  },
});

export const signOut = async () => {
  await supabase.auth.signOut();
  window.location.assign('/');
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (isMounted) setUser(toAppUser(data?.session?.user));
      })
      .catch((error) => {
        console.error('Error fetching auth status:', error);
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = toAppUser(session?.user);
      // Token refreshes fire this too; keep the same object so pages don't reload their data.
      setUser((current) => (current?.userId === nextUser?.userId ? current : nextUser));
    });

    return () => {
      isMounted = false;
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
