import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { ROUNDS } from './quiz';
import { ANSWER_STYLE, ordinal } from './quizLook';

/** Fright Quiz on a phone: four big answer buttons, then how you did. */
export default function QuizPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const reveal = game?.reveal;
  const buzzed = useRef(-1);
  useEffect(() => {
    if (!reveal || buzzed.current === game.index || !navigator.vibrate) return;
    buzzed.current = game.index;
    navigator.vibrate(reveal.right ? 60 : [80, 50, 80]);
  }, [reveal, game]);

  const scoreLine = (
    <div className="lcp-gamehead">
      <span>{game.phase === 'final' ? 'Final' : `Q${game.index + 1} of ${game.total}`}{game.double ? ' · x2' : ''}</span>
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
          <p>{result.score.toLocaleString()} points · {result.right} of {result.total} right</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'answer' && game.picked == null) {
    return (
      <div className="lcp lcp-game lcp-quiz">
        {scoreLine}
        <p className="lcp-quiz-ask">Tap your answer. Faster scores more!</p>
        <div className="lcp-quiz-answers">
          {game.answers.map((text, i) => (
            <button type="button" key={i} className="lcp-quiz-answer" style={{ background: ANSWER_STYLE[i].color }} onClick={() => send('act', { type: 'answer', choice: i })}>
              <span className="lcp-quiz-icon">{ANSWER_STYLE[i].icon}</span>
              <span>{text}</span>
            </button>
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
  } else if (game.phase === 'read') {
    line = `Question ${game.index + 1} is coming up. Get your finger ready…`;
  } else if (game.phase === 'answer') {
    face = 'wave';
    big = `${ANSWER_STYLE[game.picked].icon} Locked in!`;
    line = 'Waiting for everyone else…';
  } else if (game.phase === 'reveal' && reveal) {
    face = reveal.right ? 'cheer' : 'scared';
    big = reveal.right ? `✅ Correct! +${reveal.gain.toLocaleString()}` : '❌ Not this time';
    const extras = [reveal.fastest && '⚡ Fastest!', reveal.streak >= 3 && `🔥 ${reveal.streak} in a row!`].filter(Boolean).join(' ');
    line = reveal.right ? extras || 'Nice one.' : `It was “${reveal.answer}”.${reveal.picked ? '' : ' Too slow!'}`;
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
