// Moving a league onto this device for a draft with no internet, and back to the server afterwards.

import axios from 'axios';
import { API_BASE_URL } from '../api';
import { forgetLeague } from '../realtime';
import { readOfflineLeague, rememberOfflineUser, removeOfflineLeague, writeOfflineLeague } from './storage';

/** Statuses a league can be saved to a device in (the server checks too). */
export const canSaveOffline = (league) => {
  const status = String(league?.status || '').toLowerCase();
  return status === 'created' || status === 'lobby' || (status === 'manual' && league?.draftMode === 'manual');
};

/**
 * Copies the league to this device. Nobody can bid from their own phone without internet, so a draft that
 * hasn't started runs as a manual draft here: bids happen on paper or whiteboards and the commissioner
 * enters each winner and price.
 */
export const saveLeagueToDevice = async (leagueId, user, { nearby = false } = {}) => {
  const { data } = await axios.post(`${API_BASE_URL}/leagues/${leagueId}/offline-copy`, {});
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

/** Uploads this device's copy. Throws OnlineChanged when the league changed online since it was saved. */
export const uploadLeagueFromDevice = async (leagueId, { force = false } = {}) => {
  const entry = readOfflineLeague(leagueId);
  if (!entry) throw new Error('This league is not saved on this device.');
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
};

export const discardDeviceCopy = (leagueId) => {
  removeOfflineLeague(leagueId);
  forgetLeague(leagueId);
};

export { readOfflineLeague };
