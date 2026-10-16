import React from 'react';
import { signIn } from '../AuthContext';
import '../App.css';
import ClimbBackdrop from './ClimbBackdrop';
import useOnline from '../offline/useOnline';
import OfflineDraftStart from '../help/OfflineDraftStart';
import { nearbySupported } from '../offline/nearbyDraft';
import { clearSignedOut, guestUser, offlineUser } from '../offline/storage';

const Login = () => {
  const hasInvite = new URLSearchParams(window.location.search).has('join');
  const online = useOnline();
  // After Logout, whoever's drafts are saved on this phone can get back to them, even with no internet.
  const savedUser = offlineUser() || guestUser();
  const continueAsSaved = () => {
    clearSignedOut();
    window.location.assign('/leagues');
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
          {savedUser && (
            <div className="login-offline">
              <p>Drafts saved on this phone belong to {savedUser.userDetails || 'you'}.</p>
              <button type="button" className="edit-roster-button" onClick={continueAsSaved}>
                Continue as {savedUser.userDetails || 'saved player'}
              </button>
            </div>
          )}
          {nearbySupported() && (
            <div className="login-offline">
              <p className="section-kicker">No internet or no account?</p>
              <OfflineDraftStart user={null} />
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Login;
