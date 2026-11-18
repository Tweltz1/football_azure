import React, { useEffect, useRef, useState } from 'react';
import Person from '../Person';

// Turkey Trot on a phone: a big joystick that walks your farmer. Only sends when the direction changes
// (8 ways or stop), so 12 phones stay well inside the room's message budget.

const DIRS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return { x: Math.round(Math.cos(a) * 100) / 100, y: Math.round(Math.sin(a) * 100) / 100 };
});

function Stick({ send, color }) {
  const pad = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const last = useRef('stop');
  const pending = useRef(null);
  const lastAt = useRef(0);
  const timer = useRef(0);

  const push = (dir) => {
    const key = dir ? `${dir.x},${dir.y}` : 'stop';
    if (key === last.current) return;
    last.current = key;
    pending.current = dir || { x: 0, y: 0 };
    const wait = Math.max(0, 70 - (performance.now() - lastAt.current));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastAt.current = performance.now();
      send('act', { type: 'go', dx: pending.current.x, dy: pending.current.y });
      try { navigator.vibrate?.(8); } catch (error) { /* no buzz */ }
    }, wait);
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  const move = (e) => {
    const r = pad.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = r.width / 2 - 30;
    const d = Math.hypot(dx, dy);
    const k = d > max ? max / d : 1;
    setKnob({ x: dx * k, y: dy * k });
    if (d < r.width * 0.12) { push(null); return; }
    const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    push(DIRS[i]);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); push(null); };

  // Arrow keys work too, for trying it on a laptop.
  useEffect(() => {
    const held = new Set();
    const update = () => {
      const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('ArrowDown') ? 1 : 0) - (held.has('ArrowUp') ? 1 : 0);
      if (!x && !y) { pushRef.current(null); setKnob({ x: 0, y: 0 }); return; }
      const i = ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8;
      pushRef.current(DIRS[i]);
      setKnob({ x: DIRS[i].x * 80, y: DIRS[i].y * 80 });
    };
    const down = (e) => { if (e.key.startsWith('Arrow')) { held.add(e.key); update(); e.preventDefault(); } };
    const up = (e) => { if (held.delete(e.key)) update(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.clearTimeout(timer.current); };
  }, []);

  return (
    <div
      ref={pad}
      className="tt-stick"
      style={{ '--tt-me': color }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') move(e); }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="tt-arrow is-up">▲</span><span className="tt-arrow is-down">▼</span>
      <span className="tt-arrow is-left">◀</span><span className="tt-arrow is-right">▶</span>
      <span className="tt-knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}>🧑‍🌾</span>
    </div>
  );
}

/** Turkey Trot on a phone. */
export default function TrotPhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const head = (
    <div className="lcp-gamehead">
      <span>Round {game.round} / {game.rounds}</span>
      <span>🦃 {game.penned} / {game.goal}</span>
      <span>🔔 {Math.floor(game.left / 60)}:{String(game.left % 60).padStart(2, '0')}</span>
    </div>
  );

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-end won">
          <Person look={look} pose="cheer" />
          <h2 className="lc-title">Dinner is served!</h2>
          <p>You herded {result.herded} turkey{result.herded === 1 ? '' : 's'} · Team score {result.score.toLocaleString()}</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }

  if (game.phase === 'play') {
    return (
      <div className="lcp lcp-game tt-phone">
        {head}
        <p className="tt-you"><span className="tt-swatch" style={{ background: game.color }} /> You're the farmer in the <b>{game.colorName}</b> ring</p>
        <Stick send={send} color={game.color} />
        <p className="lcp-fine">Get <b>behind</b> a turkey and walk it up into the pen. You've herded {game.mine}.</p>
      </div>
    );
  }

  let big = `Round ${game.round}: ${game.title}`;
  let line = `Pen ${game.goal} of ${game.turkeys} turkeys before the dinner bell!`;
  let pose = 'wave';
  if (game.phase === 'done') {
    big = game.saved ? '🦃 Dinner is saved!' : '🏃 They got away!';
    line = `${game.penned} of ${game.goal} in the pen.`;
    pose = game.saved ? 'cheer' : 'scared';
  }
  return (
    <div className="lcp lcp-game">
      {head}
      <div className="lcp-wait">
        <Person look={look} pose={pose} />
        <p className="lcp-big">{big}</p>
        <p>{line}</p>
        {game.phase === 'intro' && game.color && <p className="tt-you"><span className="tt-swatch" style={{ background: game.color }} /> Look for the <b>{game.colorName}</b> ring on the TV. That's you!</p>}
        {game.phase === 'intro' && game.golden && <p>✨ The golden turkey is worth triple!</p>}
      </div>
    </div>
  );
}
