import React, { useEffect, useRef, useState } from 'react';
import Person from '../Person';
import { CHARM, isJunk } from '../lastCandle';
import { charmArt } from '../charmArt';

const CharmIcon = ({ id, className }) => (charmArt(id)
  ? <svg className={className} viewBox="-50 -50 100 100" aria-hidden="true" dangerouslySetInnerHTML={{ __html: charmArt(id) }} />
  : <span className={className}>{CHARM[id]?.icon}</span>);

/** Last Candle on a phone: three charm buttons, foggy secrets and the SOUL button. */
export default function CandlePhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const spooked = Boolean(game?.spooked);
  const wasSpooked = useRef(false);
  const trashRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // { slot, dx, dy, over }
  useEffect(() => {
    if (spooked && !wasSpooked.current && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    wasSpooked.current = spooked;
  }, [spooked]);

  const overTrash = (x, y) => {
    const r = trashRef.current?.getBoundingClientRect();
    return Boolean(r) && x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24;
  };
  const down = (e, slot) => {
    if (e.button != null && e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (error) { /* older browsers */ }
    dragRef.current = { slot, sx: e.clientX, sy: e.clientY };
    setDrag({ slot, dx: 0, dy: 0, over: false });
  };
  const move = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setDrag({ slot: d.slot, dx: e.clientX - d.sx, dy: e.clientY - d.sy, over: overTrash(e.clientX, e.clientY) });
  };
  const up = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (overTrash(e.clientX, e.clientY)) send('act', { type: 'trash', slot: d.slot });
    else if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 14) send('act', { type: 'play', slot: d.slot });
  };
  const cancel = () => { dragRef.current = null; setDrag(null); };

  if (result) {
    return (
      <div className="lcp">
        {header}
        <div className={`lcp-end ${game.phase}`}>
          <Person look={look} pose={game.phase === 'won' ? 'cheer' : 'scared'} />
          <h2 className="lc-title">{game.phase === 'won' ? 'You won!' : 'Lights out…'}</h2>
          <p>Team score {result.score}</p>
          {result.awards.map((a) => <div key={a} className="lcp-award">🏆 {a}</div>)}
          {result.stats && <p className="lcp-fine">You landed {result.stats.landed} charms and finished off {result.stats.banished} monster{result.stats.banished === 1 ? '' : 's'}.</p>}
          {screen.vip ? <button type="button" className="lc-btn lc-btn-big" onClick={() => send('again')}>Back to the lobby</button> : <p className="lcp-fine">Waiting for 👑 to pick the next game.</p>}
        </div>
      </div>
    );
  }
  if (game.phase !== 'night') {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <Person look={look} pose="stand" />
          <p className="lcp-big">👀 Look at the TV</p>
          <p>{game.phase === 'intro' ? `Night ${game.night} is about to start.` : 'Dawn! Catch your breath.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={`lcp lcp-game${spooked ? ' is-spooked' : ''}`}>
      <div className="lcp-gamehead">
        <span>Night {game.night}</span>
        <span>{'🕯️'.repeat(game.candles)}<span className="lcp-out">{'🕯️'.repeat(Math.max(0, game.maxCandles - game.candles))}</span></span>
        <span>{game.score} pts</span>
      </div>
      {game.secrets.map((s) => (
        <div key={s.tag} className="lcp-secret">
          <b>🌫️ Only you can see monster {s.tag}!</b>
          <div className="lcp-secret-need">{s.need.map((c, i) => <span key={i} style={{ background: CHARM[c].color }}><CharmIcon id={c} className="lcp-mini-icon" /><small>{CHARM[c].name}</small></span>)}</div>
          <small>Shout it out to the crew!</small>
        </div>
      ))}
      {game.soul && (
        <button type="button" className={`lcp-soul${game.soul.pressed ? ' is-on' : ''}`} onClick={() => send('act', { type: 'soul' })}>
          ✨ SOUL ✨
          <small>{game.soul.pressed ? `Waiting for the others… ${game.soul.count}/${game.soul.total}` : 'Everyone tap together! Count down 3, 2, 1…'}</small>
        </button>
      )}
      <div className="lcp-hand">
        {game.hand.map((c, slot) => {
          const charm = c && CHARM[c];
          const dragging = drag && drag.slot === slot;
          return (
            <button
              type="button"
              key={slot}
              className={`lcp-charm${charm ? '' : ' is-empty'}${charm && isJunk(c) ? ' is-junk' : ''}${dragging ? ' is-dragging' : ''}`}
              style={charm ? { background: charm.color, transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px) scale(${drag.over ? 0.8 : 1.04})` : undefined } : undefined}
              disabled={!charm || spooked}
              onPointerDown={(e) => down(e, slot)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onClick={(e) => { if (e.detail === 0) send('act', { type: 'play', slot }); }}
            >
              {charm ? <><CharmIcon id={c} className="lcp-charm-icon" /><span className="lcp-charm-name">{charm.name}</span></> : <span className="lcp-charm-name">…</span>}
            </button>
          );
        })}
      </div>
      <div ref={trashRef} className={`lcp-trash${drag ? ' is-ready' : ''}${drag?.over ? ' is-over' : ''}`}>🗑️ Drag junk here</div>
      {spooked && <div className="lcp-spooked">👻 SPOOKED! Nobody needed that.</div>}
      <p className="lcp-fine">Tap a charm to throw it. Junk like 🧦 🍌 goes in the trash, don&apos;t throw it!</p>
    </div>
  );
}
