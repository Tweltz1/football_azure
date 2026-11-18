import React, { useState } from 'react';
import Person from '../Person';
import { MAX_NOTE, STARTERS } from './admirer';
import { ordinal } from './quizLook';

// Secret Admirer on a phone: write your secret note, then guess who wrote each one.

export default function AdmirerPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const [text, setText] = useState('');
  const head = (
    <div className="lcp-gamehead">
      <span>Round {game.round} / {game.rounds}</span>
      {game.index && <span>💌 {game.index} / {game.count}</span>}
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose={result.rank === 1 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'Sweetheart of the night!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} points</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'write' && game.to && !game.done) {
    const submit = (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      send('act', { type: 'write', text: text.trim() });
      setText('');
    };
    return (
      <div className="lcp lcp-game">
        {head}
        <form className="lcp-mash-write va-write" onSubmit={submit}>
          <span className="lcp-mash-step">🤫 Top secret · {game.left}s</span>
          <p className="lcp-mash-prompt">Your secret valentine is <b>{game.to}</b> 💘</p>
          <div className="va-starters">
            {STARTERS.map((st) => <button type="button" key={st} onClick={() => setText(`${st} `.slice(0, MAX_NOTE))}>{st}…</button>)}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_NOTE))} maxLength={MAX_NOTE} rows={3} placeholder={`Something sweet about ${game.to}…`} />
          <small>{MAX_NOTE - text.length} letters left · keep it sweet. Try to sound like someone else!</small>
          <button type="submit" className="lc-btn lc-btn-big" disabled={!text.trim()}>Seal it with a kiss 💋</button>
        </form>
      </div>
    );
  }

  if (game.phase === 'guess') {
    if (game.mine) {
      return (
        <div className="lcp lcp-game">
          {head}
          <div className="lcp-wait">
            <Person look={look} pose="wave" />
            <p className="lcp-big">😇 This one's yours!</p>
            <p>Keep a straight face. Every wrong guess is points for you.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="lcp lcp-game">
        {head}
        <p className="lcp-quiz-ask">{game.forMe ? 'This one is for YOU! Who wrote it?' : `Who wrote this to ${game.to}?`}</p>
        <p className="va-phone-note">“{game.text}”</p>
        <div className="va-suspects">
          {game.suspects.map((p) => (
            <button type="button" key={p.cid} className={game.pick === p.cid ? 'is-on' : ''} onClick={() => send('act', { type: 'guess', pick: p.cid })}>{p.name}</button>
          ))}
        </div>
        <button type="button" className={`va-heart${game.hearted ? ' is-on' : ''}`} onClick={() => send('act', { type: 'heart' })}>{game.hearted ? '💗 You loved it' : '🤍 Aww, so sweet'}</button>
        <p className="lcp-fine">You can change your guess until time runs out.</p>
      </div>
    );
  }

  let big = '👀 Look at the TV';
  let line = '';
  let pose = 'stand';
  if (game.phase === 'write') { big = '💌 Sealed and sent!'; line = 'Waiting for the other love notes…'; pose = 'wave'; }
  if (game.phase === 'reveal') {
    if (game.mine) { big = game.fooled ? `🎭 You fooled ${game.fooled}!` : '😳 They figured you out!'; line = game.gain ? `+${game.gain} points` : ''; pose = game.fooled ? 'cheer' : 'scared'; } else {
      big = game.right ? '🕵️ You got it!' : `💘 It was ${game.by}!`;
      line = game.gain ? `+${game.gain} points` : 'No points this time.';
      pose = game.right ? 'cheer' : 'stand';
    }
  }
  if (game.phase === 'scores') { big = `You're ${ordinal(game.rank || 1)}`; line = 'A new secret valentine is coming up!'; }
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
