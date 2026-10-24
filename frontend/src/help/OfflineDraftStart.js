import React, { useState } from 'react';
import NearbyJoin from './NearbyJoin';
import { nearbySupported } from '../offline/nearbyDraft';
import { becomeGuest, guestUser } from '../offline/storage';
import './InfoTip.css';

/**
 * iPhone app: one "Join/Create draft offline" button. It opens two choices:
 * join a nearby draft with the room code, or create a draft on this phone (no internet needed).
 * `user` is the signed-in user, or null on the sign-in page. `joinOnly` skips straight to joining
 * (on the Create page, where making a league is the page itself).
 */
const OfflineDraftStart = ({ user, joinOnly = false }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(null); // 'join' | 'create'
  const [name, setName] = useState('');
  // Someone who already gave their name on this phone isn't asked again.
  const [savedGuest] = useState(() => guestUser());
  if (!nearbySupported()) return null;
  const known = user || savedGuest;
  if (joinOnly) {
    return (
      <div className="offline-draft-choices">
        <p><strong>Joining someone else's draft?</strong> Pick it from the nearby list or type its room code.</p>
        <NearbyJoin user={known} />
      </div>
    );
  }

  const create = (event) => {
    event.preventDefault();
    if (!known) becomeGuest(name);
    window.location.assign('/create-league?offline=1');
  };

  if (!open) {
    return (
      <button type="button" className="create-button offline-draft-start" onClick={() => setOpen(true)}>
        Join/Create draft offline
      </button>
    );
  }
  return (
    <div className="offline-draft-choices">
      <p>Draft with nearby iPhones, no internet needed. Results upload later.</p>
      <div className="login-actions">
        <button type="button" className={step === 'join' ? 'create-button' : 'edit-roster-button'} onClick={() => setStep('join')}>
          Join with a room code
        </button>
        <button type="button" className={step === 'create' ? 'create-button' : 'edit-roster-button'} onClick={() => setStep('create')}>
          Create a draft on this phone
        </button>
      </div>
      {step === 'join' && <NearbyJoin user={known} />}
      {step === 'create' && (
        <form className="nearby-join" onSubmit={create}>
          {!known && (
            <label>
              Your name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
            </label>
          )}
          <button type="submit" className="create-button">Set up the league</button>
        </form>
      )}
    </div>
  );
};

export default OfflineDraftStart;
