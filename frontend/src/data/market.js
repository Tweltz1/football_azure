// Trade market values (FantasyCalc, built from real trades in leagues set up like yours) blended with
// our own projection-based values. The two scales differ, so they're matched by rank: the 20th most
// valuable player on the market is worth what our 20th most valuable player is worth to us.

import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { buildSlots, describeMarketSettings } from './startSitUtils.js';

/** How much the verdict leans on the market (the rest is our projections). */
export const MARKET_WEIGHT = { redraft: 0.4, dynasty: 0.6 };
const MARKET_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** FantasyCalc settings for a league: dynasty or not, team count, 1QB or superflex, points per catch. */
export const marketSettingsFor = ({ dynasty, teamCount, rosterSettings, ppr }) => {
  const slots = buildSlots(rosterSettings);
  const superflex = slots.some((slot) => slot.positions.includes('QB') && slot.positions.length > 1)
    || slots.filter((slot) => slot.positions.length === 1 && slot.positions[0] === 'QB').length >= 2;
  return { dynasty: !!dynasty, teams: Math.min(16, Math.max(8, teamCount || 12)), qbs: superflex ? 2 : 1, ppr: ppr >= 0.75 ? 1 : ppr >= 0.25 ? 0.5 : 0 };
};

export { describeMarketSettings };

const cache = new Map();

/** Market values for these settings, or null while loading or when the market can't be reached. */
export const useMarketValues = (settings) => {
  const key = settings ? `dynasty=${settings.dynasty ? 1 : 0}&teams=${settings.teams}&qbs=${settings.qbs}&ppr=${settings.ppr}` : null;
  const [state, setState] = useState(() => (key && cache.has(key) ? { key, data: cache.get(key), error: false } : { key, data: null, error: false }));
  useEffect(() => {
    if (!key) return undefined;
    if (cache.has(key)) {
      setState({ key, data: cache.get(key), error: false });
      return undefined;
    }
    let cancelled = false;
    setState({ key, data: null, error: false });
    axios.get(`${API_BASE_URL}/startsit/market?${key}`)
      .then((response) => {
        cache.set(key, response.data);
        if (!cancelled) setState({ key, data: response.data, error: false });
      })
      .catch(() => { if (!cancelled) setState({ key, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [key]);
  return state.key === key ? state : { key, data: null, error: false };
};

/** Maps a value on one scale to the other by rank, interpolating between neighbours. from/to: sorted high to low. */
const byRank = (from, to) => (value) => {
  if (!from.length) return 0;
  if (value >= from[0]) return to[0] * (from[0] > 0 ? value / from[0] : 1);
  for (let i = 1; i < from.length; i += 1) {
    if (value >= from[i]) {
      const span = from[i - 1] - from[i];
      const t = span > 0 ? (value - from[i]) / span : 0;
      return to[i] + t * (to[i - 1] - to[i]);
    }
  }
  const last = from[from.length - 1];
  return last > 0 ? to[to.length - 1] * Math.max(0, value / last) : 0;
};

/**
 * Everything trades need from the market: raw values by id, converters between the market scale and
 * our value scale, and the weight to give the market. ownScore(p) is our own trade value for a player.
 */
export const buildMarket = (data, allPlayers, ownScore) => {
  if (!data?.players) return null;
  const pairs = (allPlayers || [])
    .filter((p) => MARKET_POSITIONS.includes(p.position) && data.players[p.id])
    .map((p) => ({ market: data.players[p.id].value, own: ownScore(p) }));
  if (pairs.length < 20) return null;
  const marketSorted = pairs.map((p) => p.market).sort((a, b) => b - a);
  const ownSorted = pairs.map((p) => p.own).sort((a, b) => b - a);
  const toScore = byRank(marketSorted, ownSorted);
  const toMarket = byRank(ownSorted, marketSorted);
  return {
    settings: data.settings,
    fetchedAt: data.fetchedAt,
    players: data.players,
    picks: data.picks || {},
    weight: data.settings?.dynasty ? MARKET_WEIGHT.dynasty : MARKET_WEIGHT.redraft,
    toScore,
    toMarket: (score) => Math.max(0, Math.round(toMarket(score))),
  };
};
