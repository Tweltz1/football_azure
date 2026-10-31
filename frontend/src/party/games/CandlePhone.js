import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { CHARM } from '../lastCandle';

/** Last Candle on a phone: three charm buttons, foggy secrets and the SOUL button. */
export default function CandlePhone({ screen, send, look, header }) {
  const game = screen.game;
  const result = screen.result;
  const spooked = Boolean(game?.spooked);
  const wasSpooked = useRef(false);
  useEffect(() => {
    if (spooked && !wasSpooked.current && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    wasSpooked.current = spooked;
  }, [spooked]);

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
          <div className="lcp-secret-need">{s.need.map((c, i) => <span key={i} style={{ background: CHARM[c].color }}>{CHARM[c].icon}<small>{CHARM[c].name}</small></span>)}</div>
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
          return (
            <button
              type="button"
              key={slot}
              className={`lcp-charm${charm ? '' : ' is-empty'}`}
              style={charm ? { background: charm.color } : undefined}
              disabled={!charm || spooked}
              onClick={() => send('act', { type: 'play', slot })}
            >
              {charm ? <><span className="lcp-charm-icon">{charm.icon}</span><span className="lcp-charm-name">{charm.name}</span></> : <span className="lcp-charm-name">…</span>}
            </button>
          );
        })}
      </div>
      {spooked && <div className="lcp-spooked">👻 SPOOKED! Nobody needed that.</div>}
      <p className="lcp-fine">Tap a charm to throw it at the monster closest to the house that needs it.</p>
    </div>
  );
}
