import React, { useEffect, useState } from 'react';
import Person from './Person';
import { randomLook } from './look';
import { currentUser, firstName, signInWithGoogle, signOutHere } from './account';
import './party.css';

/** Games night landing: host on a TV or join on a phone, signed in with Google or as a guest. */
export default function PartyHome() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [looks] = useState(() => [2, 3, 4, 5, 1].map((costume) => ({ ...randomLook(), costume })));

  useEffect(() => {
    document.title = 'Hood League Games';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    currentUser().then((u) => { setUser(u); setChecked(true); });
    return () => link.remove();
  }, []);

  return (
    <div className="lcp lch">
      <a className="lch-back" href="/">← Hood League</a>
      <p className="lch-kicker">Hood League Games</p>
      <h1 className="lc-title">Last Candle</h1>
      <p className="lch-sub">A cooperative Halloween party game. One TV, up to 12 phones. Keep the candles lit until dawn.</p>
      <div className="lch-crew">{looks.map((l, i) => <Person key={i} look={l} pose={i === 2 ? 'wave' : 'stand'} className={`lc-bob lc-d${i % 4}`} />)}</div>
      <div className="lch-actions">
        <a className="lch-card" href="/party">
          <span className="lch-icon">📺</span>
          <b>Host on a TV</b>
          <small>Open this on the TV or a laptop. You get a room code.</small>
        </a>
        <a className="lch-card" href="/play">
          <span className="lch-icon">📱</span>
          <b>Join on your phone</b>
          <small>Type the room code from the TV and dress up your character.</small>
        </a>
      </div>
      {checked && (
        <div className="lch-account">
          {user ? (
            <>
              <span>Signed in as <b>{firstName(user) || user.email}</b>. Your character saves to your account.</span>
              <button type="button" className="lcp-link" onClick={() => signOutHere().then(() => setUser(null))}>Sign out</button>
            </>
          ) : (
            <>
              <button type="button" className="lcp-google" onClick={() => signInWithGoogle(`${window.location.origin}/games-night`)}>
                <span className="lcp-g">G</span> Sign in with Google
              </button>
              <span>or just pick a button above to play as a guest. Signing in only saves your character.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
