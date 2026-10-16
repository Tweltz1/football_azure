// When the app opens with internet, quietly load the main pages' data so they all open later with none
// (readCache.js keeps the last copy of each). Runs once per app open and again when the internet returns.

import axios from 'axios';
import { API_BASE_URL } from '../api';

const SLEEPER_USER_SETTING = 'hl-startsit-sleeper-user'; // saved by Start/Sit's Sleeper import
const MAX_HISTORY = 10;

const quietly = (request) => request.catch(() => null);

const savedSleeperUser = () => {
  try { return JSON.parse(localStorage.getItem(SLEEPER_USER_SETTING) || '""'); } catch (error) { return ''; }
};

let running = null;

export const prefetchPages = (user) => {
  if (!user?.userId || user.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (running) return running;
  const base = API_BASE_URL;
  running = (async () => {
    const [mine, , , history] = await Promise.all([
      quietly(axios.get(`${base}/GetLeagues?userId=${user.userId}`)),
      quietly(axios.get(`${base}/GetLeagues`)),
      quietly(axios.post(`${base}/user-profile`, { userId: user.userId, displayName: user.userDetails })),
      quietly(axios.get(`${base}/history`)),
      quietly(axios.get(`${base}/startsit`)),
    ]);
    const sleeperUser = savedSleeperUser();
    const leagues = Array.isArray(mine?.data) ? mine.data : [];
    const pastDrafts = Array.isArray(history?.data) ? history.data.slice(0, MAX_HISTORY) : [];
    await Promise.all([
      sleeperUser ? quietly(axios.get(`${base}/startsit/sleeper?username=${encodeURIComponent(sleeperUser)}`)) : null,
      ...leagues.flatMap((league) => [
        quietly(axios.get(`${base}/leagues/${league.id}/state`)),
        quietly(axios.get(`${base}/leagues/${league.id}/details`)),
      ]),
      ...pastDrafts.filter((draft) => draft?.id).map((draft) => quietly(axios.get(`${base}/history/${encodeURIComponent(draft.id)}`))),
    ]);
  })().finally(() => { running = null; });
  return running;
};
