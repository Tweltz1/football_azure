import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import Person from '../party/Person';
import { randomLook } from '../party/look';
import { CLASSES } from '../dnd/rules';
import { HOOD_GAMES_PATH, inGamesApp, siteOrigin } from '../native/gamesApp';
import { canSignInWithApple, currentUser, firstName, signInWithApple, signInWithGoogle, signOutHere } from '../party/account';
import '../party/party.css';
import './hood.css';
import StudioCredit from '../components/StudioCredit';
import DeleteAccount from '../components/DeleteAccount';
import { isHoliday } from '../party/season';

const PLACES = [
  {
    href: '/games-night',
    icon: isHoliday() ? '🦃' : '🎃',
    name: 'Games Night',
    blurb: isHoliday()
      ? 'Holiday party games for one TV and up to 12 phones: Holiday Quiz, Holiday Mash-up, Last Candle and more.'
      : 'Party games for one TV and up to 12 phones: Last Candle, Fright Quiz, Who’s Behind the Mask? and more.',
    tone: 'is-party',
  },
  {
    href: '/dnd',
    icon: '🐉',
    name: 'Hood Quest',
    blurb: 'Fantasy tabletop quests on the TV with an AI narrator. Heroes and the DM join on their phones.',
    tone: 'is-quest',
  },
  {
    href: '/cards',
    icon: '🃏',
    name: 'Card Table',
    blurb: '500 and Dirty Clubs on your phones, with voice chat, saved games and stats.',
    tone: 'is-cards',
  },
  {
    href: '/games',
    icon: '🕹️',
    name: 'Draft Games',
    blurb: 'The mini-games from the draft lobby. Jump straight in, or sign in to get on the leaderboards.',
    tone: 'is-arcade',
  },
  {
    href: '/',
    icon: '🏈',
    name: 'Hood League',
    blurb: 'The website: leagues, auction drafts, rankings, start/sit and draft history.',
    tone: 'is-league',
  },
];

// The "start a game in 30 seconds" strip: pick one, open it on the TV, phones join with the code.
const QUICK = [
  { id: 'quiz', icon: isHoliday() ? '🦃' : '🎃', name: isHoliday() ? 'Holiday Quiz' : 'Fright Quiz', who: '1 to 12 players', href: '/party?game=quiz' },
  { id: 'mash', icon: isHoliday() ? '🎁' : '🧟', name: isHoliday() ? 'Holiday Mash-up' : 'Monster Mash-up', who: '3 to 12 players', href: '/party?game=mash' },
  { id: 'candle', icon: '🕯️', name: 'Last Candle', who: '1 to 12, team up', href: '/party?game=candle' },
  { id: 'mask', icon: '🎭', name: 'Behind the Mask', who: '3 to 12 players', href: '/party?game=mask' },
  { id: 'cards', icon: '🃏', name: 'Card Table', who: '500 or Dirty Clubs', href: '/cards' },
];

function JoinQr({ text }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  }, [text]);
  return <div className="hg-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function QuickStart() {
  const [pick, setPick] = useState(QUICK[0]);
  const host = siteOrigin().replace(/^https?:\/\//, '');
  const tvUrl = `${host}${pick.href}`;
  return (
    <section className="hg-quick" aria-label="Start a game in 30 seconds">
      <h2>Start a game in 30 seconds</h2>
      <div className="hg-quick-picks" role="radiogroup" aria-label="Pick a game">
        {QUICK.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={pick.id === g.id} className={pick.id === g.id ? 'on' : ''} onClick={() => setPick(g)}>
            <span aria-hidden="true">{g.icon}</span> {g.name}
          </button>
        ))}
      </div>
      <ol className="hg-quick-steps">
        <li>
          <b>Open it on the TV or a laptop.</b> Go to <code>{tvUrl}</code>, or <a href={pick.href}>start it on this screen</a>.
        </li>
        <li>
          <b>The TV shows a room code.</b> Everyone scans this code or goes to <code>{host}/play</code> on their phone and types it in.
          <JoinQr text={`${siteOrigin()}/play`} />
        </li>
        <li><b>Pick a character and play.</b> No app or sign-in needed. {pick.who}.</li>
      </ol>
    </section>
  );
}

/** Hood Games: one front door for the party games, Hood Quest and the Hood League website. */
export default function HoodGamesHub() {
  const [looks] = useState(() => [
    { ...randomLook(), costume: 2 },
    { ...randomLook(), ...CLASSES.wizard.look, costume: 0 },
    { ...randomLook(), costume: 0 },
    { ...randomLook(), ...CLASSES.fighter.look, costume: 0 },
    { ...randomLook(), costume: 4 },
  ]);

  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    currentUser().then((u) => { setUser(u); setChecked(true); });
  }, []);

  useEffect(() => {
    document.title = 'Hood Games';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  return (
    <div className="lcp lch hg">
      {!inGamesApp() && <a className="lch-back" href="/">← Hood League</a>}
      <p className="lch-kicker">Hood League presents</p>
      <h1 className="lc-title hg-title">Hood Games</h1>
      <p className="lch-sub">Party games, tabletop quests and the league, all in one place.</p>
      <div className="lch-crew">{looks.map((l, i) => <Person key={i} look={l} pose={i === 2 ? 'wave' : 'stand'} className={`lc-bob lc-d${i % 4}`} />)}</div>
      <QuickStart />
      {/* The game cards show right away; only the account box waits for the sign-in check. */}
      <div className="hg-places">
        {PLACES.map((p) => (
          <a key={p.href} className={`lch-card hg-card ${p.tone}`} href={p.href}>
            <span className="lch-icon" aria-hidden="true">{p.icon}</span>
            <b>{p.name}</b>
            <small>{p.blurb}</small>
          </a>
        ))}
      </div>
      {checked && (
        <div className="lch-account">
          {user ? (
            <>
              <span>Signed in as <b>{firstName(user) || user.email}</b>. Every game starts with your name (you can still change it) and saves your characters, heroes and scores.</span>
              <button type="button" className="lcp-link" onClick={() => signOutHere().then(() => setUser(null))}>Sign out</button>
              <DeleteAccount onDeleted={() => setUser(null)} />
            </>
          ) : (
            <>
              <button type="button" className="lcp-google" onClick={() => signInWithGoogle(`${siteOrigin()}${HOOD_GAMES_PATH}`)}>
                <span className="lcp-g">G</span> Sign in with Google
              </button>
              {canSignInWithApple() && (
                <button type="button" className="lcp-google" onClick={() => signInWithApple()}>
                  <span className="lcp-g"></span> Sign in with Apple
                </button>
              )}
              <span>Sign in once here and it counts for every game: your name is filled in for you, and characters, heroes and scores save to your account. Or just play as a guest.</span>
            </>
          )}
        </div>
      )}
      <StudioCredit />
    </div>
  );
}
