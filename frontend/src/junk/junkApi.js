import { SUPABASE_URL, supabase } from '../supabaseClient';

// Junk App calls go to the site's API (/api/junk/*). Browsing works signed out; the rest sends the
// sign-in token so the server knows who's posting.

export const API_BASE = process.env.REACT_APP_API_URL
  || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : 'http://localhost:54321/functions/v1/api');

export const token = async () => {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch (error) {
    return null;
  }
};

const call = async (method, path, body) => {
  const headers = {};
  const t = await token();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API_BASE}/junk/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    throw new Error('No connection. Check your internet and try again.');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!res.ok) {
    const err = new Error(typeof data === 'string' && data ? data : `Something went wrong (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
};

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const searchItems = ({ lat, lng, km, q, category, sort }) => call('GET', `items?${qs({ lat, lng, km, q, category, sort })}`);
export const getItem = (id, here) => call('GET', `items/${encodeURIComponent(id)}${here ? `?${qs({ lat: here.lat, lng: here.lng })}` : ''}`);
export const uploadPhoto = (image, detect) => call('POST', 'photos', { image, detect });
export const createItem = (fields) => call('POST', 'items', fields);
export const updateItem = (id, fields) => call('POST', `items/${encodeURIComponent(id)}`, fields);
export const deleteItem = (id) => call('DELETE', `items/${encodeURIComponent(id)}`);
export const reportItem = (id, reason) => call('POST', `items/${encodeURIComponent(id)}/report`, { reason });
export const myItems = () => call('GET', 'mine');
export const blockUser = (userId) => call('POST', 'block', { userId });
export const inbox = () => call('GET', 'inbox');
export const getChat = (itemId, otherId) => call('GET', `chat/${encodeURIComponent(itemId)}/${encodeURIComponent(otherId)}`);
export const sendMessage = (itemId, otherId, body) => call('POST', `chat/${encodeURIComponent(itemId)}/${encodeURIComponent(otherId)}`, { body });
export const deleteAccount = () => call('DELETE', 'account');
// "I'm on my way" claims (see trip.js).
export const claimItem = (id, here) => call('POST', `items/${encodeURIComponent(id)}/claim`, { lat: here.lat, lng: here.lng });
export const releaseClaim = (id) => call('POST', `items/${encodeURIComponent(id)}/release`, {});
export const myClaim = () => call('GET', 'claim');
export const pingClaim = (here) => call('POST', 'claim/ping', { lat: here.lat, lng: here.lng });
export const cancelClaim = () => call('POST', 'claim/cancel', {});
export const finishClaim = () => call('POST', 'claim/done', {});

/** Signs out on this phone and stays in the Junk App (Hood League's sign-out goes to its own front page). */
export const junkSignOut = async () => {
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((resolve) => { window.setTimeout(resolve, 2000); }),
    ]);
  } catch (error) { /* signed out locally anyway */ }
  window.location.assign('/junk');
};
