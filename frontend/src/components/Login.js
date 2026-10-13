import React from 'react';
import { signIn } from '../AuthContext';
import '../App.css';

const Login = () => {
  const hasInvite = new URLSearchParams(window.location.search).has('join');
  return (
    <main className="login-page">
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
          <div className="login-actions">
            <button type="button" onClick={() => signIn('github')}>Login with GitHub</button>
            <button type="button" className="edit-roster-button" onClick={() => signIn('google')}>Login with Google</button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
