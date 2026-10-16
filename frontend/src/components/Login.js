import React, { useState } from 'react';
import { signIn } from '../AuthContext';
import '../App.css';
import ClimbBackdrop from './ClimbBackdrop';
import useOnline from '../offline/useOnline';
import NearbyJoin from '../help/NearbyJoin';
import { nearbySupported } from '../offline/nearbyDraft';
import { becomeGuest } from '../offline/storage';

const Login = () => {
  const hasInvite = new URLSearchParams(window.location.search).has('join');
  const online = useOnline();
  const [offlineStep, setOfflineStep] = useState(null); // 'join' | 'host'
  const [hostName, setHostName] = useState('');
  const hostOnPhone = (event) => {
    event.preventDefault();
    becomeGuest(hostName);
    window.location.assign('/create-league');
  };
  return (
    <main className="login-page">
      <ClimbBackdrop />
      <section className="login-hero">
        <div>
          <p className="page-kicker">Auction draft night</p>
          <h1>Hood League</h1>
          <p>Sign in to open your leagues, set your board, and run the live auction room.</p>
          <div className="scoreboard-strip">
            <span>Live bidding</span>
            <span>Roster tracking</span>
            <span>Draft room sync</span>
          </div>
        </div>

        <div className="login-panel">
          <p className="section-kicker">Sign in</p>
          <h2>Enter the room</h2>
          {hasInvite && (
            <p className="league-invite-note">You've been invited to a league. Sign in and you'll be asked to join it.</p>
          )}
          {!online && (
            <p className="league-invite-note">
              No internet right now. Signing in needs it, but you can still draft with nearby phones below.
            </p>
          )}
          <div className="login-actions">
            <button type="button" onClick={() => signIn('github')}>Login with GitHub</button>
            <button type="button" className="edit-roster-button" onClick={() => signIn('google')}>Login with Google</button>
          </div>
          {nearbySupported() && (
            <div className="login-offline">
              <p className="section-kicker">No internet or no account?</p>
              <p>Draft with nearby iPhones. No sign-in needed; claim your team online afterwards.</p>
              <div className="login-actions">
                <button type="button" className="edit-roster-button" onClick={() => setOfflineStep('join')}>Join a nearby draft</button>
                <button type="button" className="edit-roster-button" onClick={() => setOfflineStep('host')}>Host a draft on this phone</button>
              </div>
              {offlineStep === 'join' && <NearbyJoin user={null} />}
              {offlineStep === 'host' && (
                <form className="nearby-join" onSubmit={hostOnPhone}>
                  <label>
                    Your name
                    <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={40} required />
                  </label>
                  <button type="submit" className="create-button">Set up the league</button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Login;
