import React, { useEffect, useState } from 'react';
import Person from '../Person';
import { ROUNDS } from './mash';
import { ordinal } from './quizLook';

/** Monster Mash-up on a phone: write answers, then vote. */
export default function MashPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const [text, setText] = useState('');
  const prompt = game?.prompt;
  useEffect(() => { setText(''); }, [prompt, game?.phase]);

  const scoreLine = (
    <div className="lcp-gamehead">
      <span>{ROUNDS[game.round]?.title}</span>
      <span>{game.rank ? `${ordinal(game.rank)} place` : ''}</span>
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className={`lcp-end ${result.rank === 1 ? 'won' : ''}`}>
          <Person look={look} pose={result.rank <= 3 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'You won!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} points · {result.votes} vote{result.votes === 1 ? '' : 's'} in all</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'write' && game.prompt) {
    const submit = (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      send('act', { type: 'write', text: text.trim() });
      setText('');
    };
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <form className="lcp-mash-write" onSubmit={submit}>
          <span className="lcp-mash-step">{game.final ? 'The Final Fright' : `Prompt ${game.step} of ${game.steps}`} · {Math.ceil(game.left / 1000)}s</span>
          <p className="lcp-mash-prompt">{game.prompt}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 60))} maxLength={60} rows={3} placeholder="Something funny…" autoFocus />
          <small>{60 - text.length} letters left · keep it PG-13</small>
          <button type="submit" className="lc-btn lc-btn-big" disabled={!text.trim()}>Send it</button>
        </form>
      </div>
    );
  }

  if (game.phase === 'vote' && !game.author && game.options?.length && !game.voted) {
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <p className="lcp-mash-prompt small">{game.prompt}</p>
        <p className="lcp-quiz-ask">Tap the funniest answer · {Math.ceil(game.left / 1000)}s</p>
        <div className="lcp-mash-options">
          {game.options.map((o) => (
            <button type="button" key={o.id} className="lcp-mash-option" onClick={() => send('act', { type: 'vote', pick: o.id })}>{o.text}</button>
          ))}
        </div>
      </div>
    );
  }

  let face = 'stand';
  let big = '👀 Look at the TV';
  let line = '';
  if (game.phase === 'round') {
    big = ROUNDS[game.round].title;
    line = ROUNDS[game.round].blurb;
  } else if (game.phase === 'write') {
    face = 'wave';
    big = '✓ All written!';
    line = 'Waiting for the slowpokes…';
  } else if (game.phase === 'vote') {
    face = game.author ? 'scared' : 'wave';
    big = game.author ? '🤞 This is your matchup!' : '🗳️ Voted!';
    line = game.author ? 'Sit tight while everyone else votes.' : 'Waiting for the other votes…';
  } else if (game.phase === 'reveal' && game.mine) {
    face = game.mine.winner ? 'cheer' : 'scared';
    big = game.mine.gain ? `+${game.mine.gain.toLocaleString()}` : 'No votes this time';
    line = game.mine.mashup ? '🧟 MONSTER MASH-UP! Every single vote!' : `Your answer got ${game.mine.votes} vote${game.mine.votes === 1 ? '' : 's'}.`;
  } else if (game.phase === 'scores') {
    face = game.rank === 1 ? 'cheer' : 'stand';
    big = `${ordinal(game.rank)} place`;
    line = `${game.score.toLocaleString()} points so far.`;
  }
  return (
    <div className="lcp lcp-game">
      {scoreLine}
      <div className="lcp-wait">
        <Person look={look} pose={face} />
        <p className="lcp-big">{big}</p>
        {line && <p>{line}</p>}
      </div>
    </div>
  );
}
