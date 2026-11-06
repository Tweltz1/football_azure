import { SUPABASE_URL } from '../supabaseClient';

// Saved card games live behind the site's API (/api/cards/games). No sign-in needed. The host phone also
// keeps its own copy, so a game can be resumed on that phone even without a connection.

const API_BASE = process.env.REACT_APP_API_URL
  || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : 'http://localhost:54321/functions/v1/api');

const call = async (method, path, body) => {
  const res = await fetch(`${API_BASE}/cards/${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!res.ok) throw new Error(typeof data === 'string' && data ? data : `Request failed (${res.status}).`);
  return data;
};

export const saveGame = (row) => call('POST', 'games', row);
export const loadGame = (id) => call('GET', `games/${encodeURIComponent(id)}`);
export const listGames = (game, open = false) => call('GET', `games?game=${game}${open ? '&open=1' : ''}`);

// ---------- This phone's own saves ----------

const LOCAL = 'ct-saves';
export const localSaves = () => {
  try { return JSON.parse(window.localStorage.getItem(LOCAL) || '[]'); } catch (error) { return []; }
};
export const putLocalSave = (row) => {
  try {
    const list = localSaves().filter((r) => r.id !== row.id);
    if (!row.finished) list.unshift(row);
    window.localStorage.setItem(LOCAL, JSON.stringify(list.slice(0, 6)));
  } catch (error) { /* storage full or private mode */ }
};
export const dropLocalSave = (id) => {
  try { window.localStorage.setItem(LOCAL, JSON.stringify(localSaves().filter((r) => r.id !== id))); } catch (error) { /* ignore */ }
};
