import React from 'react';
import Person from '../Person';
import { COLORS, SPOTS } from './eggHunt';
import { Egg } from './EggStage';
import { ordinal } from './quizLook';

// Egg Hunt on a phone: your egg color while the bunny hides, then the garden grid to tap.

const EGG = 'M0 -34 C20 -34 30 -6 30 10 C30 28 16 38 0 38 C-16 38 -30 28 -30 10 C-30 -6 -20 -34 0 -34 Z';
const BigEgg = ({ color, golden, size = 120 }) => (
  <svg width={size} height={size * 1.2} viewBox="-50 -50 100 120" aria-hidden="true">
    <defs><clipPath id="eh-clip" clipPathUnits="userSpaceOnUse"><path d={EGG} /></clipPath></defs>
    <Egg x={0} y={6} s={1.3} fill={golden ? '#ffd23f' : COLORS[color]?.fill} pattern={color % 3} golden={golden} />
  </svg>
);

export default function EggPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const color = game.color == null ? null : COLORS[game.color];
  const head = (
    <div className="lcp-gamehead">
      <span>🥚 {game.round} / {game.rounds}</span>
      {color && <span><i className="eh-dot" style={{ background: color.fill }} /> {color.name}</span>}
      <span>⭐ {game.score}</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose={result.rank === 1 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'Egg Hunt champ!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} points</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'hunt' && color) {
    const done = game.found != null;
    let note = done ? (game.golden ? 'Found it! Sit tight.' : 'Found it! Now grab the 🌟 golden egg!') : `Find your ${color.name} egg!`;
    if (game.locked && game.last) note = game.last.result === 'other' ? `That's ${game.last.who || 'someone else'}'s egg! Hold on…` : 'Nope, not there! Hold on…';
    if (game.last?.result === 'golden') note = '🌟 You got the golden egg!';
    return (
      <div className="lcp lcp-game eh-phone">
        {head}
        <p className={`eh-note${game.locked ? ' is-locked' : ''}`}>{note} · {game.left}s</p>
        <div className={`eh-grid${game.locked ? ' is-locked' : ''}`}>
          {SPOTS.map((s, i) => {
            const miss = game.misses.includes(i);
            const mine = game.found === i;
            const gold = game.goldenSpot === i;
            return (
              <button key={s.name} type="button" className={`eh-spot${miss ? ' is-miss' : ''}${mine ? ' is-mine' : ''}${gold ? ' is-gold' : ''}`} disabled={miss || mine || gold || game.locked} onClick={() => send('act', { type: 'tap', spot: i })}>
                <span>{mine ? '🥚' : gold ? '🌟' : s.icon}</span>
                <small>{miss ? '✗' : s.name}</small>
              </button>
            );
          })}
        </div>
        <p className="lcp-fine">Same layout as the garden on the TV. Back row at the top.</p>
      </div>
    );
  }

  let big = '👀 Look at the TV';
  let line = '';
  let pose = 'stand';
  let egg = null;
  if ((game.phase === 'start' || game.phase === 'hide') && color) {
    big = `Your egg is ${color.name.toUpperCase()}`;
    line = game.phase === 'hide' ? 'Watch the bunny on the TV! Where does it go?' : 'Get ready to watch the bunny…';
    egg = <BigEgg color={game.color} />;
  }
  if (!color && game.phase !== 'reveal') { big = '🐰 Next round!'; line = 'You get your own egg next round. Watch how it works.'; }
  if (game.phase === 'reveal') {
    if (game.found != null) { big = `+${game.gain} 🥚`; line = 'Nice hunting!'; pose = 'cheer'; } else if (color) { big = 'So close!'; line = `Your egg was under the ${SPOTS[game.mine]?.name || '?'}.`; pose = 'scared'; }
    if (game.last?.result === 'golden') { big = `+${game.gain} 🌟`; line = 'You grabbed the golden egg!'; pose = 'cheer'; }
    if (game.rank) line += ` You're ${ordinal(game.rank)}.`;
  }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        {egg || <Person look={look} pose={pose} />}
        <p className="lcp-big">{big}</p>
        {line && <p>{line}</p>}
      </div>
    </div>
  );
}
