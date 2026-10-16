// The iPhone app ships with the player list it was built with. Each day it downloads the latest list and
// insights from the website (public/player-data.json, rebuilt with every player update) and swaps them into
// the playerData / playerInsights modules in place, so every page sees the new data. The last download is
// kept on the phone for offline drafts.

import { useEffect, useState } from 'react';
import * as players from './playerData';
import * as insights from './playerInsights';

const SOURCE_URL = 'https://hood-league.com/player-data.json';
const SAVED_KEY = 'hl-players';
const CHECKED_KEY = 'hl-players-checked';
const CHECK_EVERY_MS = 60 * 60 * 1000;
export const PLAYERS_UPDATED = 'hl-players-updated';

const inApp = () => typeof window !== 'undefined' && window.location.protocol === 'capacitor:';

const fillArray = (target, source) => { target.splice(0, target.length, ...source); };
const fillObject = (target, source) => {
  Object.keys(target).forEach((key) => { delete target[key]; });
  Object.assign(target, source);
};

const time = (iso) => Date.parse(iso || '') || 0;
export const currentFetchedAt = () => players.playerPoolMeta.fetchedAt;

const usable = (data) => Array.isArray(data?.initialPlayerList) && data.initialPlayerList.length >= 50
  && data.playerPoolMeta && typeof data.playerPoolMeta === 'object';

/** Swaps in a downloaded copy when it is newer than what the app has. Returns true when it did. */
export const applyPlayerData = (data) => {
  if (!usable(data) || time(data.playerPoolMeta.fetchedAt) <= time(currentFetchedAt())) return false;
  fillObject(players.playerPoolMeta, data.playerPoolMeta);
  fillArray(players.initialPlayerList, data.initialPlayerList);
  [['playerInsightsMeta'], ['sleeperTrending'], ['playerRankMovements'], ['playerStatsById'], ['positionAverages']]
    .forEach(([name]) => {
      if (data[name] && typeof data[name] === 'object' && insights[name]) fillObject(insights[name], data[name]);
    });
  return true;
};

const readSaved = () => {
  try { return JSON.parse(window.localStorage.getItem(SAVED_KEY) || 'null'); } catch (error) { return null; }
};

let version = 0;
const announce = () => {
  version += 1;
  window.dispatchEvent(new Event(PLAYERS_UPDATED));
};

let running = null;
export const refreshPlayerData = ({ force = false } = {}) => {
  if (!inApp() || running || (typeof navigator !== 'undefined' && navigator.onLine === false)) return running;
  let checked = 0;
  try { checked = Number(window.localStorage.getItem(CHECKED_KEY)) || 0; } catch (error) { /* storage unavailable */ }
  if (!force && Date.now() - checked < CHECK_EVERY_MS) return null;
  running = fetch(SOURCE_URL, { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      try { window.localStorage.setItem(CHECKED_KEY, String(Date.now())); } catch (error) { /* best effort */ }
      if (!applyPlayerData(data)) return false;
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(data)); } catch (error) { /* full: still used this session */ }
      announce();
      return true;
    })
    .catch(() => false)
    .finally(() => { running = null; });
  return running;
};

/** Re-renders a page when a newer player list arrives; use the returned number in useMemo deps. */
export const usePlayerDataVersion = () => {
  const [seen, setSeen] = useState(version);
  useEffect(() => {
    const onUpdate = () => setSeen(version);
    window.addEventListener(PLAYERS_UPDATED, onUpdate);
    return () => window.removeEventListener(PLAYERS_UPDATED, onUpdate);
  }, []);
  return seen;
};

// On start: use the last download right away, then check for a newer one (and again when the app comes
// back to the front or the internet returns).
if (typeof window !== 'undefined' && inApp()) {
  applyPlayerData(readSaved());
  refreshPlayerData();
  window.addEventListener('online', () => refreshPlayerData());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshPlayerData();
  });
}
