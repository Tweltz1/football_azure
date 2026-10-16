import React, { useEffect, useState } from 'react';
import { readOfflineLeague, saveLeagueToDevice } from '../offline/offlineSync';
import {
  bidForTeam, isNearbyTicket, joinNearby, leaveNearbyDraft, nearbySupported, roomFor, saveNearbyTicket, startHosting, watchNearby,
} from '../offline/nearbyDraft';
import './OfflineDraft.css';

const NOT_STARTED = new Set(['created', 'lobby']);

const errorText = (error) => {
  const body = error?.response?.data;
  if (typeof body === 'string' && body) return body;
  if (!error?.response && !error?.isAxiosError && error?.message) return error.message;
  if (!error?.response) return 'Could not reach the site. Check the internet connection and try again.';
  return error?.message || 'Something went wrong.';
};

const BIDDING = new Set(['drafting', 'tiebreaker']);

/**
 * Commissioner's phone: bid for a team whose phone died or isn't connected, so that team keeps drafting.
 * The player tells the commissioner their bid; it stays sealed from everyone else.
 */
const AbsentTeamBid = ({ league, connectedUserIds }) => {
  const [teamId, setTeamId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const status = String(league.status || '').toLowerCase();
  if (!BIDDING.has(status) || String(league.biddingMode || 'standard') !== 'standard') return null;
  const connected = new Set([...(connectedUserIds || []), league.adminId]);
  const tied = status === 'tiebreaker' ? new Set(league.tieBreaker?.tiedTeamIds || []) : null;
  const absent = (league.teams || []).filter((team) => team && !connected.has(team.ownerId) && (!tied || tied.has(team.ownerId)));
  if (!absent.length) return null;
  const team = absent.find((t) => t.id === teamId) || null;

  const submit = async (event) => {
    event.preventDefault();
    if (!team) return;
    setBusy(true);
    setNote(null);
    try {
      await bidForTeam(league.id, team.ownerId, amount);
      setNote(`Bid of $${amount} placed for ${team.name}.`);
      setAmount('');
    } catch (error) {
      setNote(error?.message || 'That bid did not go through.');
    }
    setBusy(false);
  };

  return (
    <form className="absent-team-bid" onSubmit={submit}>
      <strong>Bid for a team that isn't connected</strong>
      <div className="absent-team-bid-row">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
          <option value="">Pick a team</option>
          {absent.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="number" min="1" inputMode="numeric" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bid amount" />
        <button type="submit" className="edit-roster-button" disabled={busy || !team || !(Number(amount) > 0)}>Place bid</button>
      </div>
      {note && <p className="offline-draft-note">{note}</p>}
    </form>
  );
};

/** iPhone app only: run the draft on the commissioner's phone and let everyone bid from theirs, no internet. */
const NearbyDraftPanel = ({ league, user }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [nearby, setNearby] = useState({ role: null, players: 0, connected: false, connectedUserIds: [] });
  const leagueId = league?.id;
  const ticket = leagueId ? isNearbyTicket(leagueId) : false;

  useEffect(() => watchNearby(setNearby), []);
  useEffect(() => {
    if (ticket) joinNearby(leagueId);
  }, [ticket, leagueId]);

  if (!nearbySupported() || !league || !user?.userId) return null;

  const saved = readOfflineLeague(league.id);
  const isCommissioner = league.adminId === user.userId || (saved?.nearbyHost && saved.userId === league.adminId);
  const notStarted = NOT_STARTED.has(String(league.status || '').toLowerCase());

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
              {' '}Players who didn't set up, or whose phone died, join with this code:
            </p>
            <span className="nearby-room-code" aria-label="Room code">{roomFor(league.id)}</span>
          </div>
          {nearby.role !== 'host' && (
            <div className="offline-draft-actions">
              <button type="button" className="create-button" onClick={() => startHosting(league.id, user)}>Start hosting</button>
            </div>
          )}
          {nearby.role === 'host' && <AbsentTeamBid league={league} connectedUserIds={nearby.connectedUserIds} />}
        </section>
      );
    }
    if (saved || !notStarted) return null;
    return (
      <section className="offline-draft-panel">
        <div>
          <strong>No wifi? Draft with nearby phones</strong>
          <p>
            This phone runs the draft, and everyone nearby bids from their own phone in the app, with no internet.
            Bids stay blind. Best saved while you have internet, but it works without it if this phone opened the app
            with internet recently. Upload the results afterwards.
          </p>
        </div>
        <div className="offline-draft-actions">
          <button
            type="button"
            className="edit-roster-button"
            disabled={busy}
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
        <p>If the commissioner is running this draft from their phone, tap below. It works with no internet too, as long as this phone opened the app with internet recently.</p>
      </div>
      <div className="offline-draft-actions">
        <button
          type="button"
          className="edit-roster-button"
          disabled={busy}
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
