import { supabase } from '../supabaseClient';
import { isLookCode } from './look';

// Saved characters live on the Google account (Supabase auth user metadata), so no new table is needed.
// If the player has no party character yet but does have a Hood Protocol look, that one is offered.

export const currentUser = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch (error) {
    return null;
  }
};

export const firstName = (user) => {
  const meta = user?.user_metadata || {};
  return String(meta.given_name || meta.full_name || meta.name || user?.email || '').split(/[\s@]/)[0].slice(0, 12);
};

/** { look, name, from } from the account, or null. */
export const loadSaved = async (user) => {
  if (!user) return null;
  const meta = user.user_metadata || {};
  if (isLookCode(meta.party_look)) return { look: meta.party_look, name: meta.party_name || firstName(user), from: 'party' };
  try {
    const { data } = await supabase.from('hood_protocol_profiles').select('look, display_name').eq('user_id', user.id).maybeSingle();
    if (data && isLookCode(data.look)) return { look: data.look, name: data.display_name || firstName(user), from: 'hood' };
  } catch (error) { /* no Hood Protocol profile */ }
  return null;
};

export const saveCharacter = async (look, name) => {
  const { error } = await supabase.auth.updateUser({ data: { party_look: look, party_name: name } });
  if (error) throw error;
};

export const signInWithGoogle = (returnTo) => supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: returnTo, queryParams: { prompt: 'select_account' } },
});

export const signOutHere = () => supabase.auth.signOut({ scope: 'local' }).catch(() => {});
