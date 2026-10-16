import React, { useState } from 'react';
import {
  canSaveOffline, discardDeviceCopy, OnlineChanged, readOfflineLeague, saveLeagueToDevice, uploadLeagueFromDevice,
} from '../offline/offlineSync';
import useOnline from '../offline/useOnline';
import './OfflineDraft.css';


const errorText = (error) => {
  const body = error?.response?.data;
  if (typeof body === 'string' && body) return body;
  if (!error?.response) return 'Could not reach the site. Check the internet connection and try again.';
  return error?.message || 'Something went wrong.';
};

const savedAtText = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Commissioner-only: run this league's draft on this device with no internet, then upload it. */
const OfflineDraftPanel = ({ league, user }) => {
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  if (!league || !user?.userId || league.adminId !== user.userId) return null;

  const saved = readOfflineLeague(league.id);
  if (!saved && !canSaveOffline(league)) return null;

  const run = async (work) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      // Reload so the page switches cleanly between this device's copy and the live site.
      window.location.reload();
    } catch (error) {
      setMessage(errorText(error));
      setBusy(false);
    }
  };

  const save = () => run(() => saveLeagueToDevice(league.id, user));

  const upload = () => run(async () => {
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
          <button type="button" className="edit-roster-button" onClick={save} disabled={busy || !online}>
            {busy ? 'Saving...' : 'Save for offline draft'}
          </button>
        </div>
        {!online && <p className="offline-draft-note">Connect to the internet to save this league to the device.</p>}
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
        <button type="button" className="create-button" onClick={upload} disabled={busy || !online}>
          {busy ? 'Uploading...' : 'Upload results'}
        </button>
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
