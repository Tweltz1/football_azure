import React, { useEffect, useRef, useState } from 'react';
import Person from '../Person';
import { COLORS, LEAD_MS, RISE_MS } from './fireworks';
import { ordinal } from './quizLook';

// Fireworks Show on a phone: your own rockets rise up a lane right here, timed from when this phone saw the
// show start, and a big BOOM button. The tap is measured on the phone so a slow connection can't cost you.

const GRADE = { perfect: 'PERFECT!', great: 'GREAT!', good: 'OK', miss: 'MISSED' };

function Pad({ rockets, color, beat, last, combo, onBoom }) {
  const start = useRef(performance.now());
  const [ms, setMs] = useState(0);
  const [flash, setFlash] = useState(null);
  const [press, setPress] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { setMs(performance.now() - start.current); raf = window.requestAnimationFrame(loop); };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!last) return undefined;
    setFlash(last.grade);
    const id = window.setTimeout(() => setFlash(null), 650);
    return () => window.clearTimeout(id);
  }, [last?.id, last?.grade]); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (e) => {
    e.preventDefault();
    const t = performance.now() - start.current;
    onBoom(t);
    setPress(performance.now());
    try { navigator.vibrate?.(18); } catch (error) { /* no buzz */ }
  };
  const H = 300;
  const TARGET = 46;
  const up = rockets.filter((at) => ms >= at - RISE_MS && ms < at + 280);
  const next = rockets.find((at) => at > ms);
  const pulse = ms > LEAD_MS - 4 * beat ? 1 - ((((ms - LEAD_MS) % beat) + beat) % beat) / beat : 0;
  return (
    <div className="fw-pad">
      <div className="fw-lane" style={{ height: H, '--fw': color }}>
        <div className="fw-target" style={{ top: TARGET }} />
        {up.map((at) => {
          const p = (ms - (at - RISE_MS)) / RISE_MS;
          const y = H - 20 - (H - 20 - TARGET) * Math.min(1, p);
          return (
            <React.Fragment key={at}>
              <div className="fw-approach" style={{ top: TARGET, transform: `translate(-50%, -50%) scale(${1 + Math.max(0, 1 - p) * 1.6})`, opacity: 0.3 + 0.7 * Math.min(1, p) }} />
              <div className="fw-dot" style={{ top: y }} />
            </React.Fragment>
          );
        })}
        <div className="fw-beats">{[0, 1, 2, 3].map((i) => <i key={i} style={{ opacity: 0.25 + pulse * 0.75 }} />)}</div>
        {flash && <div className={`fw-flash is-${flash}`}>{GRADE[flash]}</div>}
        {ms < LEAD_MS && <div className="fw-flash is-ready">Get ready…</div>}
        {next == null && ms > LEAD_MS && <div className="fw-flash is-ready">That&apos;s all your rockets!</div>}
      </div>
      <button type="button" className={`fw-boom${performance.now() - press < 140 ? ' is-down' : ''}`} style={{ '--fw': color }} onPointerDown={tap}>
        BOOM!
        {combo >= 2 && <small>{combo} in a row</small>}
      </button>
    </div>
  );
}

/** Fireworks Show on a phone. */
export default function FireworksPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const color = game.color == null ? null : COLORS[game.color];
  const head = (
    <div className="lcp-gamehead">
      <span>🎆 {game.show} / {game.shows}</span>
      {color && <span><i className="fw-chip" style={{ background: color.fill }} /> {color.name}</span>}
      <span>{game.score.toLocaleString()} pts</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose={result.rank === 1 ? 'cheer' : 'wave'} />
          <h2 className="lc-title">{result.rank === 1 ? 'Star-spangled champ!' : `${ordinal(result.rank)} place`}</h2>
          <p>{result.score.toLocaleString()} points</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'show' && color) {
    return (
      <div className="lcp lcp-game fw-phone">
        {head}
        <p className="lcp-quiz-ask">{game.name}</p>
        <Pad key={game.id} rockets={game.rockets} color={color.fill} beat={game.beat} last={game.last} combo={game.combo} onBoom={(ms) => send('act', { type: 'boom', ms: Math.round(ms) })} />
        <p className="lcp-fine">Tap when your rocket hits the ring. Here or on the TV, whichever you like!</p>
      </div>
    );
  }

  let big = '👀 Look at the TV';
  let line = '';
  let pose = 'stand';
  if (game.phase === 'ready' && color) { big = `Show ${game.show}: ${game.name}`; line = `Your rockets are ${color.name.toUpperCase()}. ${game.rockets.length} coming up!`; pose = 'wave'; }
  if (!color && game.phase !== 'scores') { big = '🎆 Next show!'; line = 'You get your own launch tube at the next show.'; }
  if (game.phase === 'scores') {
    big = game.total ? `${game.hits} / ${game.total} rockets` : 'Nice show!';
    line = `${game.gain > 0 ? `+${game.gain} points. ` : ''}${game.rank ? `You're ${ordinal(game.rank)}.` : ''}${game.bonus ? ' Finale bonus!' : ''}`;
    pose = game.total && game.hits / game.total > 0.6 ? 'cheer' : 'stand';
  }
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
