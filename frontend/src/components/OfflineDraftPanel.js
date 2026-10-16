import React, { useState } from 'react';
import {
  canSaveOffline, discardDeviceCopy, OnlineChanged, readOfflineLeague, saveLeagueToDevice, uploadLeagueFromDevice,
} from '../offline/offlineSync';
import useOnline from '../offline/useOnline';
import { signIn } from '../AuthContext';
import './OfflineDraft.css';


const errorText = (error) => {
  const body = error?.response?.data;
  if (typeof body === 'string' && body) return body;
  if (!error?.response && !error?.isAxiosError && error?.message) return error.message;
  if (!error?.response) return 'Could not reach the site. Check the internet connection and try again.';
  return error?.message || 'Something went wrong.';
};

const savedAtText = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// Thrown to skip the page reload after a new league's upload, so its invite link can be shown.
class Uploaded extends Error {}

/** Commissioner-only: run this league's draft on this device with no internet, then upload it. */
const OfflineDraftPanel = ({ league, user }) => {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  if (!league || !user?.userId) return null;

  const saved = readOfflineLeague(league.id);
  // The phone that made or saved the draft stays its commissioner here, even after signing in to upload it.
  const deviceCommissioner = saved && !saved.remote && saved.userId === league.adminId;
  if (league.adminId !== user.userId && !deviceCommissioner && !uploaded) return null;
  if (!saved && !canSaveOffline(league) && !uploaded) return null;

  if (uploaded) {
    const link = `https://hood-league.com/leagues?join=${uploaded.id}`;
    const copy = async () => {
      try { await navigator.clipboard.writeText(link); setMessage('Link copied.'); } catch (error) { window.prompt('Copy this link:', link); }
    };
    return (
      <section className="offline-draft-panel">
        <div>
          <strong>Uploaded as {uploaded.name}</strong>
          <p>
            Send everyone this link. When they open it and sign in, they pick which team is theirs.
          </p>
          <p className="offline-draft-link">{link}</p>
        </div>
        <div className="offline-draft-actions">
          <button type="button" className="create-button" onClick={copy}>Copy link</button>
          <button type="button" className="edit-roster-button" onClick={() => window.location.assign('/leagues')}>My leagues</button>
        </div>
        {message && <p className="offline-draft-note">{message}</p>}
      </section>
    );
  }

  const run = async (work) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      // Reload so the page switches cleanly between this device's copy and the live site.
      window.location.reload();
    } catch (error) {
      if (error instanceof Uploaded) return;
      setMessage(errorText(error));
      setBusy(false);
    }
  };

  const save = () => run(() => saveLeagueToDevice(league.id, user));

  const upload = () => run(async () => {
    if (saved?.createdOffline) {
      const result = await uploadLeagueFromDevice(league.id);
      setUploaded(result);
      setBusy(false);
      throw new Uploaded();
    }
    try {
      await uploadLeagueFromDevice(league.id);
    } catch (error) {
      if (!(error instanceof OnlineChanged)) throw error;
      const replace = window.confirm('This league changed online after you saved it to this device (someone joined or renamed a team, for example). Replace the online league with the draft on this device?');
      if (!replace) throw new Error('Nothing was uploaded. The draft is still on this device.');
      await uploadLeagueFromDevice(league.id, { force: true });
    }
  });

  const discard = () => {
    if (!window.confirm('Delete the draft saved on this device? Anything drafted here that was not uploaded is lost.')) return;
    discardDeviceCopy(league.id);
    window.location.reload();
  };

  if (!saved) {
    return (
      <section className="offline-draft-panel">
        <div>
          <strong>No wifi at the draft?</strong>
          <p>
            Save this league to this device while you have internet, and you can run the whole draft here without it.
            Bids happen on paper or whiteboards, and you enter each winner and price. Upload the results when you are back online.
          </p>
        </div>
        <div className="offline-draft-actions">
          <button type="button" className="edit-roster-button" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : 'Save for offline draft'}
          </button>
        </div>
        {!online && <p className="offline-draft-note">No internet right now, so this uses the last copy of the league this device saw.</p>}
        {message && <p className="offline-draft-error" role="alert">{message}</p>}
      </section>
    );
  }

  return (
    <section className="offline-draft-panel is-saved">
      <div>
        <strong>Offline draft on this device</strong>
        <p>
          Everything you do in this league stays on this device until you upload it.
          {' '}Saved {savedAtText(saved.savedAt)}. Picks so far: {(saved.league.draftLog || []).length}.
        </p>
      </div>
      <div className="offline-draft-actions">
        {user.guest ? (
          <>
            <button type="button" className="create-button" onClick={() => signIn('google')} disabled={!online}>Sign in with Google to upload</button>
            <button type="button" className="edit-roster-button" onClick={() => signIn('github')} disabled={!online}>Sign in with GitHub</button>
          </>
        ) : (
          <button type="button" className="create-button" onClick={upload} disabled={busy || !online}>
            {busy ? 'Uploading...' : 'Upload results'}
          </button>
        )}
        <button type="button" className="edit-roster-button" onClick={discard} disabled={busy}>
          Delete device copy
        </button>
      </div>
      {!online && <p className="offline-draft-note">No internet right now. Keep drafting; upload once you are connected.</p>}
      {message && <p className="offline-draft-error" role="alert">{message}</p>}
    </section>
  );
};

export default OfflineDraftPanel;
