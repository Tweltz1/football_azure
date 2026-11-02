import { supabase, SUPABASE_URL } from '../supabaseClient';

// Saved characters, campaigns and the AI narrator live behind the site's API (/api/dnd/...).
const API_BASE = process.env.REACT_APP_API_URL
  || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : 'http://localhost:54321/functions/v1/api');

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const token = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch (error) {
    return null;
  }
};

const call = async (method, path, body) => {
  const auth = await token();
  if (!auth) throw new ApiError(401, 'Sign in with Google to save.');
  const res = await fetch(`${API_BASE}/dnd/${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!res.ok) throw new ApiError(res.status, typeof data === 'string' && data ? data : `Request failed (${res.status}).`);
  return data;
};

export const listCharacters = () => call('GET', 'characters');
export const saveCharacterSheet = (sheet) => call('POST', 'characters', { character: sheet });
export const deleteCharacter = (id) => call('DELETE', `characters/${encodeURIComponent(id)}`);
export const listCampaigns = () => call('GET', 'campaigns');
export const createCampaign = (name) => call('POST', 'campaigns', { name });
export const getCampaign = (id) => call('GET', `campaigns/${encodeURIComponent(id)}`);
export const saveCampaignNotes = (id, notes) => call('POST', `campaigns/${encodeURIComponent(id)}/notes`, { notes });
export const saveSession = (id, session, characters) => call('POST', `campaigns/${encodeURIComponent(id)}/sessions`, { session, characters });
export const joinCampaign = (id) => call('POST', `campaigns/${encodeURIComponent(id)}/join`, {});
/** kind: start | scene | combat | victory | loot | down | crit | exit | boss | action | check | complete | recap | free */
export const narrate = (kind, context, direction = '') => call('POST', 'narrate', { kind, context, direction });
