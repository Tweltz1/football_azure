// Moving a league onto this device for a draft with no internet, and back to the server afterwards.

import axios from 'axios';
import { API_BASE_URL } from '../api';
import { forgetLeague } from '../realtime';
import { readOfflineLeague, rememberName, rememberOfflineUser, removeOfflineLeague, writeOfflineLeague } from './storage';
import { runLocal } from './localApi';
import { nearbySupported, startHosting } from './nearbyDraft';

/** Statuses a league can be saved to a device in (the server checks too). */
export const canSaveOffline = (league) => {
  const status = String(league?.status || '').toLowerCase();
  return status === 'created' || status === 'lobby' || (status === 'manual' && league?.draftMode === 'manual');
};

export const NO_SAVED_COPY = "This phone doesn't have a copy of this league yet. Open the app once with internet, then try again.";

/**
 * The league as the server has it. With no internet, the last copy of the league page this phone saw is
 * used instead (the app saves one in the background), so a commissioner who forgot to set up ahead of time
 * can still run the draft. Before the draft starts that copy holds everything the server's would.
 */
const fetchCopy = async (leagueId, user) => {
  try {
    const { data } = await axios.post(`${API_BASE_URL}/leagues/${leagueId}/offline-copy`, {});
    return data;
  } catch (error) {
    if (error?.response) throw error;
  }
  let saved;
  try {
    ({ data: saved } = await axios.get(`${API_BASE_URL}/leagues/${leagueId}/state`));
  } catch (error) {
    throw new Error(NO_SAVED_COPY);
  }
  if (!saved || saved.id !== leagueId || !Array.isArray(saved.initialPlayerPool)) throw new Error(NO_SAVED_COPY);
  if (saved.adminId !== user?.userId) throw new Error('Only the commissioner can run this draft from their phone.');
  if (!canSaveOffline(saved)) throw new Error('This draft already started online, so it has to finish online.');
  const { _version: version = 0, ...league } = saved;
  return { league, version };
};

/**
 * Copies the league to this device. Nobody can bid from their own phone without internet, so a draft that
 * hasn't started runs as a manual draft here: bids happen on paper or whiteboards and the commissioner
 * enters each winner and price.
 */
export const saveLeagueToDevice = async (leagueId, user, { nearby = false } = {}) => {
  const data = await fetchCopy(leagueId, user);
  const league = { ...data.league };
  const status = String(league.status || '').toLowerCase();
  // A nearby-phones draft (iPhone app) keeps normal bidding: players bid from their own phones.
  if (!nearby && (status === 'created' || status === 'lobby')) {
    league.draftMode = 'manual';
    league.biddingMode = 'standard';
  }
  writeOfflineLeague(leagueId, {
    league,
    version: data.version,
    baseVersion: data.version,
    savedAt: new Date().toISOString(),
    userId: user.userId,
    ...(nearby ? { nearbyHost: true } : {}),
  });
  rememberOfflineUser(user);
  // Make sure everything the offline draft needs is on the device before the internet goes.
  await import('./engine.generated');
  navigator.serviceWorker?.controller?.postMessage('cache-build');
};

export class OnlineChanged extends Error {}

/**
 * Makes a brand-new league on this device with no internet (anyone, even with no account). In the iPhone
 * app this phone hosts it for nearby phones; elsewhere it's a one-device manual draft. Returns its ID.
 */
export const createLeagueOnDevice = async (settings, user) => {
  rememberName(user.userId, user.userDetails);
  const created = await runLocal('POST', 'CreateLeague', new URLSearchParams(), settings, user.userId);
  if (created.status !== 200) throw new Error(typeof created.body === 'string' ? created.body : 'Could not make the league.');
  const leagueId = created.body.id;
  const entry = readOfflineLeague(leagueId);
  const nearby = nearbySupported();
  const league = { ...entry.league };
  if (!nearby) {
    league.draftMode = 'manual';
    league.biddingMode = 'standard';
  }
  writeOfflineLeague(leagueId, { ...entry, league, ...(nearby ? { nearbyHost: true } : {}) });
  rememberOfflineUser(user);
  if (nearby) await startHosting(leagueId, user).catch(() => {});
  return leagueId;
};

/** Uploads this device's copy. Throws OnlineChanged when the league changed online since it was saved. */
export const uploadLeagueFromDevice = async (leagueId, { force = false } = {}) => {
  const entry = readOfflineLeague(leagueId);
  if (!entry) throw new Error('This league is not saved on this device.');
  if (entry.createdOffline) {
    // Made on this phone: it doesn't exist online yet. Whoever uploads becomes its commissioner.
    const { data } = await axios.post(`${API_BASE_URL}/offline-create`, { league: entry.league });
    forgetLeague(leagueId);
    removeOfflineLeague(leagueId);
    return data;
  }
  // The device's version numbers ran ahead of the server's; start fresh from what the server sends back.
  forgetLeague(leagueId);
  try {
    await axios.post(`${API_BASE_URL}/leagues/${leagueId}/offline-restore`, {
      league: entry.league,
      baseVersion: entry.baseVersion,
      force,
    });
  } catch (error) {
    if (error?.response?.status === 409 && !force) throw new OnlineChanged(String(error.response.data || ''));
    throw error;
  }
  removeOfflineLeague(leagueId);
  return null;
};

export const discardDeviceCopy = (leagueId) => {
  removeOfflineLeague(leagueId);
  forgetLeague(leagueId);
};

export { readOfflineLeague };
