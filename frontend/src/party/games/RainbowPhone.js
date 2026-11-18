import React from 'react';
import Person from '../Person';
import { HAZARDS } from './rainbowRun';
import { ordinal } from './quizLook';

// Rainbow Run on a phone: CLIMB or HEAD HOME, with your gold in hand and in the bank.

export default function RainbowPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const head = (
    <div className="lcp-gamehead">
      <span>🌈 {game.run} / {game.runs}</span>
      <span>🎒 {game.carry}</span>
      <span>🏦 {game.bank}</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose={result.rank === 1 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'Top o\' the mornin\', champ!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} gold banked</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'decide' && game.climbing) {
    return (
      <div className="lcp lcp-game rr-phone">
        {head}
        <p className="lcp-quiz-ask">Step {game.step + 1}: climb or head home? · {game.left}s</p>
        <p className="rr-carry">You're carrying <b>{game.carry}</b> gold. Only gold you bring home counts!</p>
        {game.seen.length > 0 && <p className="rr-warn">Already on the rainbow: {game.seen.map((h) => HAZARDS[h].icon).join(' ')} · one more of those and it falls!</p>}
        <div className="rr-picks">
          <button type="button" className={`rr-climb${game.pick === 'climb' ? ' is-on' : ''}`} onClick={() => send('act', { type: 'pick', pick: 'climb' })}>🌈<b>CLIMB</b><small>Risk it for more gold</small></button>
          <button type="button" className={`rr-home${game.pick === 'home' ? ' is-on' : ''}`} onClick={() => send('act', { type: 'pick', pick: 'home' })}>🏠<b>HEAD HOME</b><small>Bank {game.carry} gold</small></button>
        </div>
        <p className="lcp-fine">{game.climbers} still climbing. Nobody sees your pick until the step flips.</p>
      </div>
    );
  }

  let big = '👀 Look at the TV';
  let line = '';
  let pose = 'stand';
  if (game.phase === 'start') { big = `Rainbow ${game.run}`; line = 'Climb for gold, but get home before it falls!'; pose = 'wave'; }
  if (game.phase === 'decide' && !game.climbing) { big = '🏠 Home safe'; line = `${game.bank} gold in the bank. Watch the climbers sweat!`; }
  if (game.phase === 'reveal') {
    if (game.crashed) { big = '💥 The rainbow fell!'; line = 'You dropped your gold.'; pose = 'scared'; } else if (game.wentHome) { big = '🏠 Banked it!'; line = `${game.bank} gold safe at home.`; pose = 'cheer'; } else if (game.climbing && game.flip) {
      const f = game.flip;
      big = f.kind === 'hazard' ? `${HAZARDS[f.hazard].icon} Uh oh…` : `+${f.share} gold!`;
      line = f.kind === 'hazard' ? `A ${HAZARDS[f.hazard].name}. One more and it falls!` : `You're carrying ${game.carry}.`;
      pose = f.kind === 'hazard' ? 'scared' : 'cheer';
    }
  }
  if (game.phase === 'runEnd') { big = `You're ${ordinal(game.rank || 1)}`; line = `${game.bank} gold banked so far.`; }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        <Person look={look} pose={pose} />
        <p className="lcp-big">{big}</p>
        {line && <p>{line}</p>}
      </div>
    </div>
  );
}
