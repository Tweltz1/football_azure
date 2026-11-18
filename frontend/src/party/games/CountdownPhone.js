import React, { useEffect, useRef, useState } from 'react';
import Person from '../Person';
import { PERFECT_MS, ROUND_TYPES, shownClock } from './countdown';
import { ordinal } from './quizLook';

// Countdown Chaos on a phone: the clock runs right here, timed from when this phone saw it start, so the
// tap is measured on the phone and a slow connection can't cost you.

function Clock({ round, onStop, stopped }) {
  const start = useRef(performance.now());
  const [ms, setMs] = useState(0);
  const [mine, setMine] = useState(null);
  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const loop = () => { setMs(performance.now() - start.current); raf = window.requestAnimationFrame(loop); };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [round.id]);
  const clock = shownClock(round, ms);
  const done = stopped || mine != null;
  const tap = () => {
    if (done) return;
    const t = performance.now() - start.current;
    setMine(t);
    onStop(t);
    try { navigator.vibrate?.(30); } catch (error) { /* no buzz */ }
  };
  const past = clock.left <= 0;
  return (
    <div className="cc-phone-clock">
      <div className={`cc-digits${clock.hidden && !past ? ' is-hidden' : ''}`}>{past ? '00.0' : clock.hidden ? '??.?' : (clock.shown / 1000).toFixed(1).padStart(4, '0')}</div>
      <div className="cc-drop"><span style={{ width: `${Math.min(100, (ms / round.dur) * 100)}%` }} /></div>
      <button type="button" className={`cc-stop${done ? ' is-done' : ''}`} onPointerDown={tap} disabled={done}>
        {done ? 'LOCKED IN ✋' : 'STOP!'}
      </button>
    </div>
  );
}

/** Countdown Chaos on a phone. */
export default function CountdownPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const type = ROUND_TYPES[game.type];
  const head = (
    <div className="lcp-gamehead">
      <span>Countdown {game.index} / {game.rounds}</span>
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose={result.rank === 1 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'Happy New Year, champ!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} points</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'count') {
    return (
      <div className="lcp lcp-game cc-phone">
        {head}
        <p className="cc-type">{type.title}{type.double ? ' · double points' : ''}</p>
        <Clock key={game.round.id} round={game.round} stopped={game.stopped} onStop={(ms) => send('act', { type: 'stop', id: game.round.id, ms: Math.round(ms) })} />
      </div>
    );
  }

  let big = type.title;
  let line = type.blurb;
  let pose = 'wave';
  if (game.phase === 'reveal' && game.last) {
    const e = game.last.early;
    if (e == null) { big = '😴 You missed it!'; line = 'No stop this time.'; pose = 'scared'; } else if (e < 0) { big = `💥 ${(Math.abs(e) / 1000).toFixed(2)}s too late!`; line = 'Past midnight scores nothing.'; pose = 'scared'; } else {
      big = e <= PERFECT_MS ? '🎯 PERFECT!' : `${(e / 1000).toFixed(2)}s early`;
      line = `+${game.last.points.toLocaleString()} points${game.last.won ? ' · closest in the room!' : ''}`;
      pose = 'cheer';
    }
  } else if (game.phase === 'scores') {
    big = `You're ${ordinal(game.rank || 1)}`;
    line = 'Look at the TV for the scoreboard.';
  }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        <Person look={look} pose={pose} />
        <p className="lcp-big">{big}</p>
        <p>{line}</p>
        {game.phase === 'ready' && <p className="lcp-fine">Get your thumb ready. The clock shows up here.</p>}
      </div>
    </div>
  );
}
