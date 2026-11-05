import React, { useEffect, useState } from 'react';
import Person from '../party/Person';
import { randomLook } from '../party/look';
import { currentUser, firstName, signInWithGoogle, signOutHere } from '../party/account';
import { SETTINGS } from './settings';
import { CLASSES } from './rules';
import { homeHref, homeLabel } from '../native/gamesApp';
import '../party/party.css';
import './dnd.css';

/** Hood Quest landing: host a table on the TV, or join from a phone as a hero or the DM. */
export default function DndHome() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [looks] = useState(() => ['wizard', 'fighter', 'rogue', 'cleric', 'bard'].map((c) => ({ ...randomLook(), ...CLASSES[c].look, costume: 0 })));

  useEffect(() => {
    document.title = 'Hood Quest';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    currentUser().then((u) => { setUser(u); setChecked(true); });
    return () => link.remove();
  }, []);

  return (
    <div className="lcp lch dq dq-home">
      <a className="lch-back" href={homeHref()}>← {homeLabel()}</a>
      <p className="lch-kicker">Hood League · Tabletop</p>
      <h1 className="dq-title">Hood Quest</h1>
      <p className="lch-sub">Dungeons and dragons for one TV and your phones. The TV shows a 3D map, an AI narrator tells the story, and one of you co-hosts as the Dungeon Master. Every quest, map and monster lineup is new each time.</p>
      <div className="lch-crew">{looks.map((l, i) => <Person key={i} look={l} pose={i === 2 ? 'wave' : 'stand'} className={`lc-bob lc-d${i % 4}`} />)}</div>
      <div className="lch-actions">
        <a className="lch-card" href="/dnd/tv">
          <span className="lch-icon">📺</span>
          <b>Host on a TV</b>
          <small>Open this on the TV or a laptop. You get a table code.</small>
        </a>
        <a className="lch-card" href="/dnd/play">
          <span className="lch-icon">📱</span>
          <b>Join on your phone</b>
          <small>Type the table code. Play a hero, or be the Dungeon Master.</small>
        </a>
      </div>
      <div className="dq-settings-strip">
        {Object.values(SETTINGS).map((s) => <span key={s.id} className="dq-chip" title={s.blurb}>{s.emoji} {s.name}</span>)}
      </div>
      {checked && (
        <div className="lch-account">
          {user ? (
            <>
              <span>Signed in as <b>{firstName(user) || user.email}</b>. Your heroes and campaigns save to your account.</span>
              <button type="button" className="lcp-link" onClick={() => signOutHere().then(() => setUser(null))}>Sign out</button>
            </>
          ) : (
            <>
              <button type="button" className="lcp-google" onClick={() => signInWithGoogle(`${window.location.origin}/dnd`)}>
                <span className="lcp-g">G</span> Sign in with Google
              </button>
              <span>Sign in to keep your heroes between sessions. DMs need it for campaigns and the AI narrator.</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
