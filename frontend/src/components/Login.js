import React, { useEffect, useState } from 'react';
import { signIn } from '../AuthContext';
import '../App.css';
import ClimbBackdrop from './ClimbBackdrop';
import FrontDoor from './FrontDoor';
import CrewIntro from './CrewIntro';
import SoundToggle from './SoundToggle';
import { playSong } from '../sound/crewSound';
import useOnline from '../offline/useOnline';
import OfflineDraftStart from '../help/OfflineDraftStart';
import { nearbySupported } from '../offline/nearbyDraft';
import { chooseSavedUser, clearSignedOut, guestUser, offlineUser, savedProfiles } from '../offline/storage';

const Login = () => {
  const hasInvite = new URLSearchParams(window.location.search).has('join');
  const online = useOnline();
  // Before anything else: football or games. An invite link goes straight to football.
  const [football, setFootball] = useState(() => hasInvite || window.location.pathname !== '/');
  const [showIntro, setShowIntro] = useState(true);
  // Soft background music once the intro is done; it stops when this page closes.
  useEffect(() => {
    if (football && !showIntro) playSong('login');
  }, [football, showIntro]);
  useEffect(() => () => playSong(null), []);
  // After Logout, whoever's drafts are saved on this phone can get back to them, even with no internet.
  const savedUser = offlineUser() || guestUser();
  const continueAsSaved = () => {
    clearSignedOut();
    window.location.assign('/leagues');
  };
  // With no internet, anyone who signed in on this phone before can open their last saved profile
  // (favorites, notes, tiers, budget plan) and their drafts saved here.
  const profiles = online ? [] : savedProfiles().filter(({ user }) => user.userId !== savedUser?.userId);
  const loadProfile = (userId) => {
    if (chooseSavedUser(userId)) window.location.assign('/leagues');
  };
  if (!football) return <FrontDoor onFootball={() => setFootball(true)} />;
  return (
    <main className="login-page">
      <ClimbBackdrop />
      <SoundToggle />
      {showIntro && <CrewIntro onDone={() => setShowIntro(false)} />}
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
          <h2>Enter the Fantasy Cave</h2>
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
          <button type="button" className="crew-intro-replay" onClick={() => setShowIntro(true)}>Meet the crew</button>
          <p className="login-legal">
            <a href="/privacy.html">Privacy Policy</a> · <a href="/terms.html">Terms of Service</a>
          </p>
          {savedUser && (
            <div className="login-offline">
              <p>Drafts saved on this phone belong to {savedUser.userDetails || 'you'}.</p>
              <button type="button" className="edit-roster-button" onClick={continueAsSaved}>
                Continue as {savedUser.userDetails || 'saved player'}
              </button>
            </div>
          )}
          {profiles.length > 0 && (
            <div className="login-offline">
              <p>Signed in on this phone before? Load your saved profile to see your favorites and notes.</p>
              {profiles.map(({ user, savedAt }) => (
                <button key={user.userId} type="button" className="edit-roster-button" onClick={() => loadProfile(user.userId)}>
                  Load {user.userDetails || 'saved'}'s profile
                  {savedAt ? <small> (saved {new Date(savedAt).toLocaleDateString()})</small> : null}
                </button>
              ))}
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
