import React, { useEffect, useState } from 'react';
import Person from '../Person';
import { CLUE_MAX } from './mask';
import { ordinal } from './quizLook';

/** The secret card: your word, or the vampire's category. Tap to hide it from nosy neighbours. */
const RoleCard = ({ game }) => {
  const [hidden, setHidden] = useState(false);
  if (game.role === 'watch') return <div className="lk-role is-watch">👀 You joined mid-round. You&apos;ll play from the next round!</div>;
  const vamp = game.role === 'vampire';
  return (
    <button type="button" className={`lk-role${vamp ? ' is-vamp' : ''}${hidden ? ' is-hidden' : ''}`} onClick={() => setHidden((h) => !h)}>
      {hidden ? (
        <span className="lk-role-peek">🎭 Tap to peek</span>
      ) : vamp ? (
        <>
          <span className="lk-role-kicker">🧛 You&apos;re a VAMPIRE · you don&apos;t know the word</span>
          <span className="lk-role-sub">The secret word is similar to these, but it&apos;s none of them:</span>
          <span className="lk-hints">{(game.hints || []).map((w) => <i key={w}>{w}</i>)}</span>
          <small>Give a clue that fits that vibe, and use the humans&apos; clues to figure out the real word.{game.team?.length ? ` Fellow vampire${game.team.length > 1 ? 's' : ''}: ${game.team.join(' & ')}.` : ''}</small>
        </>
      ) : (
        <>
          <span className="lk-role-kicker">😇 You&apos;re human · your secret word is</span>
          <b>{game.word}</b>
          <small>Give a clue that proves you know it, without giving it away. {game.vampireCount > 1 ? `${game.vampireCount} vampires don't` : "A vampire doesn't"} know it!</small>
        </>
      )}
    </button>
  );
};

/** Who's Behind the Mask? on a phone. */
export default function MaskPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [game?.phase, game?.round]);

  const scoreLine = (
    <div className="lcp-gamehead">
      <span>Round {game.round + 1} of {game.rounds}</span>
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
          <p>{result.score.toLocaleString()} points</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  const playing = game.role !== 'watch';

  if (game.phase === 'clue' && playing && !game.myClue) {
    const submit = (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      send('act', { type: 'clue', text: text.trim() });
    };
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <RoleCard game={game} />
        <form className="lcp-mash-write" onSubmit={submit}>
          <span className="lcp-mash-step">One-word clue · {Math.ceil(game.left / 1000)}s</span>
          <input value={text} onChange={(e) => setText(e.target.value.slice(0, CLUE_MAX))} maxLength={CLUE_MAX} placeholder={game.role === 'vampire' ? 'Something that fits the vibe…' : 'A hint, not the word itself'} autoFocus />
          {game.rejected && <small className="lk-warn">That gives away the word! Try a sneakier clue.</small>}
          <button type="submit" className="lc-btn lc-btn-big" disabled={!text.trim()}>Send clue</button>
        </form>
      </div>
    );
  }

  if (game.phase === 'talk' && playing) {
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <RoleCard game={game} />
        <p className="lcp-quiz-ask">🗣️ Talk it out · {Math.ceil(game.left / 1000)}s</p>
        <div className="lk-phone-clues">{game.clues.map((c) => <span key={c.cid}><b>{c.name}</b> {c.text}</span>)}</div>
        <button type="button" className="lc-btn lc-btn-big" disabled={game.ready} onClick={() => send('act', { type: 'ready' })}>{game.ready ? '✓ Ready' : 'Ready to vote'}</button>
      </div>
    );
  }

  if (game.phase === 'vote' && playing) {
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <p className="lcp-quiz-ask">Who&apos;s behind the mask? · {Math.ceil(game.left / 1000)}s</p>
        <div className="lk-targets">
          {game.targets.map((t) => (
            <button type="button" key={t.cid} className={`lk-target${game.voted === t.cid ? ' is-on' : ''}`} onClick={() => send('act', { type: 'vote', target: t.cid })}>
              <b>{t.name}</b>
              <small>{t.clue ? `“${t.clue}”` : 'no clue 🤐'}</small>
            </button>
          ))}
        </div>
        <p className="lcp-fine">You can change your vote until time runs out.</p>
      </div>
    );
  }

  if (game.phase === 'bite' && game.options) {
    return (
      <div className="lcp lcp-game">
        {scoreLine}
        <p className="lcp-quiz-ask">🧛 Last bite! Guess the secret word · {Math.ceil(game.left / 1000)}s</p>
        <p className="lcp-fine">The first vampire to tap answers for the whole coven.</p>
        <div className="lk-targets">
          {game.options.map((w) => <button type="button" key={w} className="lk-target is-word" onClick={() => send('act', { type: 'bite', guess: w })}><b>{w}</b></button>)}
        </div>
      </div>
    );
  }

  let face = 'stand';
  let big = '👀 Look at the TV';
  let line = '';
  if (game.phase === 'role') {
    big = game.role === 'vampire' ? '🧛 Shh…' : '🤫 Keep it secret';
    line = 'Read your card, then cover your screen.';
  } else if (game.phase === 'clue') {
    face = 'wave';
    big = game.myClue ? `✓ “${game.myClue}”` : '👀 Watching';
    line = 'Waiting for the other clues…';
  } else if (game.phase === 'show') {
    big = '👀 Clues are coming up on the TV';
  } else if (game.phase === 'vote') {
    big = '🗳️ Voting…';
  } else if (game.phase === 'unmask') {
    face = 'scared';
    big = '🎭 Unmasking…';
  } else if (game.phase === 'bite') {
    face = game.bite ? (game.bite.right === (game.role === 'vampire') ? 'cheer' : 'scared') : 'scared';
    big = game.bite ? (game.bite.right ? '🩸 They guessed it!' : '🛡️ Wrong guess!') : '🧛 The vampires are guessing…';
  } else if (game.phase === 'result' && game.result) {
    const r = game.result;
    face = r.gain > 0 ? 'cheer' : 'scared';
    big = r.gain ? `+${r.gain.toLocaleString()}` : 'No points this round';
    line = `The word was “${r.word}”. ${r.why.join(' · ')}`;
  } else if (game.phase === 'scores') {
    face = game.rank === 1 ? 'cheer' : 'stand';
    big = `${ordinal(game.rank)} place`;
    line = `${game.score.toLocaleString()} points so far.`;
  }
  return (
    <div className="lcp lcp-game">
      {scoreLine}
      {['role', 'clue', 'show', 'vote', 'unmask'].includes(game.phase) && <RoleCard game={game} />}
      <div className="lcp-wait">
        <Person look={look} pose={face} />
        <p className="lcp-big">{big}</p>
        {line && <p>{line}</p>}
      </div>
    </div>
  );
}
