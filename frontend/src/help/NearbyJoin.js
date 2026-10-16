import React, { useState } from 'react';
import { findDraftByCode, nearbySupported, pickDraftTeam } from '../offline/nearbyDraft';
import { becomeGuest } from '../offline/storage';
import './InfoTip.css';

/**
 * iPhone app: join a nearby draft with the commissioner's 4-digit code, with no setup and no internet.
 * Shows the league's teams so a player whose phone died can take their team back.
 * `user` is the signed-in user, or null on the sign-in page (they join as a guest with the name they type).
 */
const NearbyJoin = ({ user }) => {
  const [name, setName] = useState(user?.userDetails || '');
  const [code, setCode] = useState('');
  const [lobby, setLobby] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [me, setMe] = useState(user);
  if (!nearbySupported()) return null;

  const find = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const who = user || becomeGuest(name);
      setMe(who);
      setLobby(await findDraftByCode(code, who));
    } catch (error) {
      setMessage(error?.message || 'Could not find that draft.');
    }
    setBusy(false);
  };

  const pick = async (choice) => {
    setBusy(true);
    setMessage(null);
    try {
      const leagueId = await pickDraftTeam(choice, me);
      // A full reload so the app opens as this player on the draft.
      window.location.assign(`/draft/${leagueId}`);
    } catch (error) {
      setMessage(error?.message || 'Could not join the draft.');
      setBusy(false);
    }
  };

  if (lobby) {
    const open = lobby.teams.filter((team) => team.open);
    return (
      <div className="nearby-join">
        <strong>{lobby.leagueName}</strong>
        {lobby.mine && (
          <button type="button" className="create-button" disabled={busy} onClick={() => pick('mine')}>
            Continue as {lobby.mine.name}
          </button>
        )}
        {open.length > 0 && <p>Rejoin as your team (phones not connected right now):</p>}
        {open.map((team) => (
          <button key={team.id} type="button" className="edit-roster-button" disabled={busy} onClick={() => pick(team.id)}>
            Rejoin as {team.name}
          </button>
        ))}
        {lobby.canAdd && (
          <button type="button" className="create-button" disabled={busy} onClick={() => pick('new')}>
            Join as a new team
          </button>
        )}
        {!lobby.mine && !open.length && !lobby.canAdd && <p>There are no open teams in this draft. Ask the commissioner.</p>}
        {message && <p className="nearby-join-error" role="alert">{message}</p>}
      </div>
    );
  }

  return (
    <form className="nearby-join" onSubmit={find}>
      {!user && (
        <label>
          Your name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
      )}
      <label>
        Room code from the commissioner's phone
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="1234"
          required
        />
      </label>
      <button type="submit" className="create-button" disabled={busy}>{busy ? 'Looking nearby...' : 'Find the draft'}</button>
      {message && <p className="nearby-join-error" role="alert">{message}</p>}
    </form>
  );
};

export default NearbyJoin;
