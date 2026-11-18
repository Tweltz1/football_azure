import React, { useEffect, useMemo, useRef, useState } from 'react';
import Person from '../Person';
import { JOB_INFO, OPTIONS } from './giftRush';
import { choiceArt } from './giftArt';

// Gift Wrap Rush on a phone: one row of big buttons per station you work. The row lights up when a
// present is in your part of the belt, but only the TV shows what it needs.

const Pick = ({ job, option, compact, onTap }) => {
  const svg = useMemo(() => choiceArt(job, option.id), [job, option.id]);
  return (
    <button type="button" className={`gr-pick${compact ? ' is-compact' : ''}`} onClick={onTap}>
      <svg viewBox="-48 -44 96 88" dangerouslySetInnerHTML={{ __html: svg }} />
      {job !== 'tag' && <span>{option.name}</span>}
    </button>
  );
};

/** Gift Wrap Rush on a phone. */
export default function RushPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const [flash, setFlash] = useState(null);
  const seenN = useRef(game?.last?.n || 0);
  useEffect(() => {
    const last = game?.last;
    if (!last || last.n === seenN.current) return undefined;
    seenN.current = last.n;
    setFlash(last.ok);
    try { navigator.vibrate?.(last.ok ? 15 : [40, 40, 40]); } catch (error) { /* no buzz */ }
    const t = window.setTimeout(() => setFlash(null), 1100);
    return () => window.clearTimeout(t);
  }, [game?.last]);

  const head = (
    <div className="lcp-gamehead">
      <span>Round {game.round} / {game.rounds}</span>
      <span>🎁 {game.delivered} / {game.goal}</span>
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose="cheer" />
          <h2 className="lc-title">Christmas is saved!</h2>
          <p>{result.good} perfect step{result.good === 1 ? '' : 's'} · Team score {result.score.toLocaleString()}</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  const stations = game.jobs.map((j) => JOB_INFO[j]);
  if (game.phase === 'play') {
    const compact = game.jobs.length > 2;
    return (
      <div className="lcp lcp-game gr-phone">
        {head}
        <p className={`gr-flash${flash === true ? ' is-ok' : flash === false ? ' is-bad' : ''}`}>{flash === true ? '✓ Perfect!' : flash === false ? '✗ Oops, wrong one!' : 'Watch the order cards on the TV'}</p>
        {game.jobs.map((j) => {
          const live = game.waiting.includes(j);
          return (
            <div key={j} className={`gr-station${live ? ' is-live' : ''}`}>
              <h3>{JOB_INFO[j].icon} {JOB_INFO[j].label}{live && <small>A present is here!</small>}</h3>
              <div className="gr-picks">
                {OPTIONS[j].map((o) => <Pick key={o.id} job={j} option={o} compact={compact} onTap={() => send('act', { type: 'work', job: j, choice: o.id })} />)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  let big = `Round ${game.round}: ${game.title}`;
  let line = `Your station${stations.length > 1 ? 's' : ''}: ${stations.map((st) => `${st.icon} ${st.label}`).join(' and ')}`;
  let pose = 'wave';
  if (game.phase === 'done') {
    big = game.saved ? '🎅 Ho ho ho!' : '🪨 Not quite enough!';
    line = `${game.delivered} of ${game.goal} perfect presents on the sleigh.`;
    pose = game.saved ? 'cheer' : 'scared';
  }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        <Person look={look} pose={pose} />
        <p className="lcp-big">{big}</p>
        <p>{line}</p>
        {game.phase === 'intro' && <p className="lcp-fine">When a present reaches your part of the belt, tap what its card on the TV asks for.</p>}
      </div>
    </div>
  );
}
