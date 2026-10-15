import React, { useEffect, useState } from 'react';
import { readOfflineLeague, saveLeagueToDevice } from '../offline/offlineSync';
import {
  isNearbyTicket, joinNearby, leaveNearbyDraft, nearbySupported, saveNearbyTicket, startHosting, watchNearby,
} from '../offline/nearbyDraft';
import './OfflineDraft.css';

const NOT_STARTED = new Set(['created', 'lobby']);

const errorText = (error) => {
  const body = error?.response?.data;
  if (typeof body === 'string' && body) return body;
  if (!error?.response) return 'Could not reach the site. Check the internet connection and try again.';
  return error?.message || 'Something went wrong.';
};

/** iPhone app only: run the draft on the commissioner's phone and let everyone bid from theirs, no internet. */
const NearbyDraftPanel = ({ league, user }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [nearby, setNearby] = useState({ role: null, players: 0, connected: false });
  const leagueId = league?.id;
  const ticket = leagueId ? isNearbyTicket(leagueId) : false;

  useEffect(() => watchNearby(setNearby), []);
  useEffect(() => {
    if (ticket) joinNearby(leagueId);
  }, [ticket, leagueId]);

  if (!nearbySupported() || !league || !user?.userId) return null;

  const isCommissioner = league.adminId === user.userId;
  const saved = readOfflineLeague(league.id);
  const notStarted = NOT_STARTED.has(String(league.status || '').toLowerCase());
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  const run = async (work) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      window.location.reload();
    } catch (error) {
      setMessage(errorText(error));
      setBusy(false);
    }
  };

  if (isCommissioner) {
    if (saved?.nearbyHost) {
      return (
        <section className="offline-draft-panel is-saved">
          <div>
            <strong>Nearby-phones draft</strong>
            <p>
              {nearby.role === 'host'
                ? `${nearby.players} ${nearby.players === 1 ? 'player' : 'players'} connected to this phone. `
                : 'Starting... '}
              Keep the app open on this screen during the draft so nearby phones stay connected.
            </p>
          </div>
          {nearby.role !== 'host' && (
            <div className="offline-draft-actions">
              <button type="button" className="create-button" onClick={() => startHosting(league.id, user)}>Start hosting</button>
            </div>
          )}
        </section>
      );
    }
    if (saved || !notStarted) return null;
    return (
      <section className="offline-draft-panel">
        <div>
          <strong>No wifi? Draft with nearby phones</strong>
          <p>
            Save the league to this phone while you have internet. During the draft this phone runs it, and everyone
            nearby bids from their own phone in the app, with no internet. Bids stay blind. Upload the results afterwards.
          </p>
        </div>
        <div className="offline-draft-actions">
          <button
            type="button"
            className="edit-roster-button"
            disabled={busy || !online}
            onClick={() => run(async () => {
              await saveLeagueToDevice(league.id, user, { nearby: true });
              await startHosting(league.id, user);
            })}
          >
            {busy ? 'Saving...' : 'Save for nearby draft'}
          </button>
        </div>
        {message && <p className="offline-draft-error" role="alert">{message}</p>}
      </section>
    );
  }

  if (ticket) {
    return (
      <section className="offline-draft-panel is-saved">
        <div>
          <strong>Nearby-phones draft</strong>
          <p>
            {nearby.connected
              ? 'Connected to the commissioner\'s phone. Bid as usual.'
              : 'Looking for the commissioner\'s phone. Stay close to it and keep this screen open.'}
          </p>
        </div>
        <div className="offline-draft-actions">
          <button
            type="button"
            className="edit-roster-button"
            onClick={() => {
              if (!window.confirm('Stop using the commissioner\'s phone for this draft?')) return;
              leaveNearbyDraft(league.id);
              window.location.reload();
            }}
          >
            Leave nearby draft
          </button>
        </div>
      </section>
    );
  }

  if (!notStarted || saved) return null;
  return (
    <section className="offline-draft-panel">
      <div>
        <strong>Drafting with no wifi?</strong>
        <p>If the commissioner is running this draft from their phone, get ready while you still have internet.</p>
      </div>
      <div className="offline-draft-actions">
        <button
          type="button"
          className="edit-roster-button"
          disabled={busy || !online}
          onClick={() => run(() => saveNearbyTicket(league.id, user))}
        >
          {busy ? 'Getting ready...' : 'Get ready for nearby draft'}
        </button>
      </div>
      {message && <p className="offline-draft-error" role="alert">{message}</p>}
    </section>
  );
};

export default NearbyDraftPanel;
