import React, { useEffect, useState } from 'react';
import Person from '../party/Person';
import { randomLook } from '../party/look';
import { CLASSES } from '../dnd/rules';
import { inGamesApp } from '../native/gamesApp';
import '../party/party.css';
import './hood.css';

const PLACES = [
  {
    href: '/games-night',
    icon: '🎃',
    name: 'Games Night',
    blurb: 'Party games for one TV and up to 12 phones: Last Candle, Fright Quiz, Who’s Behind the Mask? and more.',
    tone: 'is-party',
  },
  {
    href: '/dnd',
    icon: '🐉',
    name: 'Hood Quest',
    blurb: 'Dungeons and dragons on the TV with an AI narrator. Heroes and the DM join on their phones.',
    tone: 'is-quest',
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

/** Hood Games: one front door for the party games, Hood Quest and the Hood League website. */
export default function HoodGamesHub() {
  const [looks] = useState(() => [
    { ...randomLook(), costume: 2 },
    { ...randomLook(), ...CLASSES.wizard.look, costume: 0 },
    { ...randomLook(), costume: 0 },
    { ...randomLook(), ...CLASSES.fighter.look, costume: 0 },
    { ...randomLook(), costume: 4 },
  ]);

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
      <div className="hg-places">
        {PLACES.map((p) => (
          <a key={p.href} className={`lch-card hg-card ${p.tone}`} href={p.href}>
            <span className="lch-icon" aria-hidden="true">{p.icon}</span>
            <b>{p.name}</b>
            <small>{p.blurb}</small>
          </a>
        ))}
      </div>
    </div>
  );
}
