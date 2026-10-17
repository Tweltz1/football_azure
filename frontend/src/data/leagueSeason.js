import axios from 'axios';
import { API_BASE_URL } from '../api';
import { initialPlayerList } from './playerData';

const CACHE_MS = 10 * 60 * 1000;
const seasons = new Map();

/** A Sleeper league's standings and schedule (startsit/league), shared by the Rankings page and the chat bar. */
export const loadLeagueSeason = (leagueId) => {
  const cached = seasons.get(leagueId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = axios.get(`${API_BASE_URL}/startsit/league?leagueId=${encodeURIComponent(leagueId)}`).then((r) => r.data);
  promise.catch(() => seasons.delete(leagueId));
  seasons.set(leagueId, { at: Date.now(), promise });
  return promise;
};

let byesCache = null;
export const playerByes = () => {
  if (!byesCache) byesCache = new Map(initialPlayerList.filter((p) => p.bye).map((p) => [p.id, Number(p.bye)]));
  return byesCache;
};
