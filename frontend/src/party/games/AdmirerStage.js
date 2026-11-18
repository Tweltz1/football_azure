import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { INK } from '../cartoon';
import { speak } from './howtoKit';
import {
  awards, GUESS_MS, nameOf, ranking, WRITE_MS,
} from './admirer';
import { Leaderboard, Podium } from './Results';

// Secret Admirer on the TV: a candy-pink parlor, a heart mailbox, and love letters read out one by one.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const rnd = (i) => { const x = Math.sin(i * 51.77 + 3.1) * 43758.5453; return x - Math.floor(x); };
export const heartD = (cx, cy, s) => `M${cx} ${cy + 26 * s} C${cx - 44 * s} ${cy - 2 * s} ${cx - 26 * s} ${cy - 40 * s} ${cx} ${cy - 16 * s} C${cx + 26 * s} ${cy - 40 * s} ${cx + 44 * s} ${cy - 2 * s} ${cx} ${cy + 26 * s} Z`;

export const Parlor = React.memo(() => (
  <g>
    <defs>
      <radialGradient id="va-bg" cx="0.5" cy="0.35" r="0.85">
        <stop offset="0" stopColor="#ffb3cf" />
        <stop offset="0.55" stopColor="#f2558f" />
        <stop offset="1" stopColor="#8a1446" />
      </radialGradient>
      <pattern id="va-paper" width="140" height="140" patternUnits="userSpaceOnUse">
        <path d={heartD(35, 40, 0.35)} fill="#fff" opacity="0.13" />
        <path d={heartD(105, 110, 0.35)} fill="#fff" opacity="0.13" />
      </pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#va-bg)" />
    <rect width="1920" height="1080" fill="url(#va-paper)" />
    {/* heart bunting */}
    <path d="M0 40 Q240 120 480 40 Q720 120 960 40 Q1200 120 1440 40 Q1680 120 1920 40" fill="none" stroke="#fff" strokeWidth="5" opacity="0.8" />
    {Array.from({ length: 24 }, (_, i) => {
      const x = 40 + i * 80;
      const u = (x % 480) / 480;
      const y = 40 + 80 * 4 * u * (1 - u) * 0.75 + 18;
      return <path key={i} d={heartD(x, y, 0.42)} fill={['#ff2d6f', '#fff', '#ff8fb8'][i % 3]} stroke={INK} strokeWidth="3" />;
    })}
    {/* floating hearts */}
    {Array.from({ length: 18 }, (_, i) => (
      <path key={`f${i}`} className="va-float" style={{ animationDelay: `${-rnd(i) * 9}s`, animationDuration: `${7 + rnd(i + 4) * 6}s` }} d={heartD(rnd(i + 1) * 1920, 1000 + rnd(i + 2) * 100, 0.3 + rnd(i + 3) * 0.5)} fill={['#ff2d6f', '#ffd1e3', '#fff'][i % 3]} opacity="0.7" />
    ))}
    <rect y="930" width="1920" height="150" fill="#6e0f39" opacity="0.55" />
  </g>
));

/** The heart-shaped mailbox. letters: how many notes are in. */
export const Mailbox = ({ letters, total, pulse }) => (
  <g transform={`translate(960 600) scale(${1 + pulse * 0.06})`}>
    <rect x="-16" y="80" width="32" height="250" fill="#6b4226" stroke={INK} strokeWidth="6" />
    <path d={heartD(0, -10, 6.2)} fill="#e0245e" stroke={INK} strokeWidth="9" />
    <path d={heartD(0, -10, 5.2)} fill="none" stroke="#ff8fb8" strokeWidth="6" />
    <rect x="-90" y="-60" width="180" height="26" rx="13" fill="#4a0a26" stroke={INK} strokeWidth="5" />
    <text y="40" fontSize="44" fontWeight="900" textAnchor="middle" fill="#fff" stroke={INK} strokeWidth="6" paintOrder="stroke" style={{ fontFamily: 'var(--lc-spooky), Arial Black, Arial' }}>Love Notes</text>
    <text y="104" fontSize="54" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke={INK} strokeWidth="7" paintOrder="stroke">{letters} / {total}</text>
  </g>
);

export const Envelope = ({ k, from }) => {
  const x = from.x + (960 - from.x) * ease(k);
  const y = from.y - 200 - Math.sin(k * Math.PI) * 260 + (520 - (from.y - 200)) * ease(k);
  return (
    <g transform={`translate(${x} ${y}) rotate(${(1 - k) * 30}) scale(${1 - 0.4 * k})`} opacity={k > 0.92 ? (1 - k) * 12 : 1}>
      <rect x="-50" y="-34" width="100" height="68" rx="6" fill="#fff6e3" stroke={INK} strokeWidth="5" />
      <path d="M-50 -34 L0 6 L50 -34" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d={heartD(0, 4, 0.36)} fill="#e0245e" stroke={INK} strokeWidth="3" />
    </g>
  );
};

export const spotOf = (i, n) => ({ x: 960 + (i - (n - 1) / 2) * Math.min(150, 1700 / Math.max(1, n)), y: 1040 - (i % 2) * 14 });

/** Secret Admirer on the TV. */
export default function AdmirerStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const flights = useRef([]);
  const prevRanks = useRef({});
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'write': sfx.night(); break;
        case 'note': sfx.whoosh(); flights.current = [...flights.current.slice(-12), { by: e.by, at: performance.now() }]; break;
        case 'letter': {
          sfx.soul();
          const note = game.notes[e.index];
          if (note) window.setTimeout(() => speak(`To ${nameOf(game, note.to)}. ${note.text}`), 700);
          break;
        }
        case 'guessed': sfx.hit(); break;
        case 'heart': sfx.join(); break;
        case 'reveal': sfx.banish(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
  });

  const note = game.notes[game.current];
  const n = players.length;
  const writing = game.phase === 'write';
  const lettersIn = Object.keys(game.written).length;
  const total = Object.keys(game.targets).length;
  const ranks = ranking(game).map((r) => ({ ...r, name: players.find((p) => p.cid === r.cid)?.name || '?' }));
  if (game.phase === 'reveal' && elapsed < 50) prevRanks.current = Object.fromEntries(ranks.map((r) => [r.cid, r.rank]));
  const lastFlight = flights.current[flights.current.length - 1];
  const since = lastFlight ? now - lastFlight.at - 900 : -1;
  const pulse = since >= 0 && since < 400 ? 1 - since / 400 : 0;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <Parlor />
        {writing && <Mailbox letters={lettersIn} total={total} pulse={pulse} />}
        {writing && flights.current.map((f) => {
          const k = (now - f.at) / 1000;
          const i = players.findIndex((p) => p.cid === f.by);
          if (k < 0 || k > 1 || i < 0) return null;
          return <Envelope key={`${f.by}${f.at}`} k={k} from={spotOf(i, n)} />;
        })}
        {players.map((p, i) => {
          const s = spotOf(i, n);
          let pose = 'stand';
          if (writing && game.written[p.cid]) pose = 'wave';
          if (game.phase === 'guess' && game.guesses[p.cid]) pose = 'wave';
          if (game.phase === 'reveal' && note) pose = p.cid === note.by ? 'cheer' : note.guesses?.[p.cid] === note.by ? 'cheer' : 'stand';
          if (game.phase === 'over') pose = 'cheer';
          return (
            <g key={p.cid}>
              <ScenePerson look={p.look} pose={pose} k={0} x={s.x} y={s.y} delay={i % 4} scale={0.42} />
              <PlayerTag name={`${writing && game.written[p.cid] ? '💌 ' : game.phase === 'guess' && game.hearts[p.cid] ? '💗 ' : ''}${p.name}`} vip={i === 0} x={s.x} y={s.y + 2} />
            </g>
          );
        })}
      </svg>

      <div className="lq-hud lh-hud">
        <span className="lq-pill">Round {game.round + 1} of {game.rounds}</span>
        {note && game.phase !== 'write' && game.phase !== 'scores' && <span className="lq-pill">💌 Letter {game.current + 1} of {game.notes.length}</span>}
        {writing && <span className="lq-pill">⏳ {Math.ceil(Math.max(0, WRITE_MS - elapsed) / 1000)}s</span>}
      </div>

      {writing && (
        <div className="va-banner">
          <b>Psst… check your phone!</b> Write a sweet note to your secret valentine. Nobody will know it's from you.
        </div>
      )}

      {note && (game.phase === 'guess' || game.phase === 'reveal') && (
        <div className={`va-letter${game.phase === 'reveal' ? ' is-open' : ''}`} key={`l${game.round}-${game.current}`}>
          <div className="va-to">To my dear <b>{nameOf(game, note.to)}</b>,</div>
          <p className="va-text">{note.text}</p>
          <div className="va-from">
            {game.phase === 'guess' ? (
              <>From: <b className="va-q">???</b></>
            ) : (
              <>From: <b className="va-stamp">{nameOf(game, note.by)}</b></>
            )}
          </div>
          <svg className="va-seal" viewBox="-50 -50 100 100" aria-hidden="true"><circle r="44" fill="#c21d4b" stroke={INK} strokeWidth="5" /><path d={heartD(0, -2, 0.62)} fill="#ff8fb8" stroke={INK} strokeWidth="3" /></svg>
          {game.phase === 'guess' && (
            <div className="va-foot">
              <span className="va-timer"><i style={{ width: `${Math.max(0, 1 - elapsed / GUESS_MS) * 100}%` }} /></span>
              <span>🕵️ {Object.keys(game.guesses).length} guessed · 💗 {Object.keys(game.hearts).length}</span>
            </div>
          )}
          {game.phase === 'reveal' && elapsed > 600 && (
            <div className="va-guesses">
              {Object.entries(note.guesses || {}).map(([cid, pick]) => {
                const p = players.find((x) => x.cid === cid);
                if (!p) return null;
                const right = pick === note.by;
                return <span key={cid} className={right ? 'is-right' : ''}><Person look={p.look} view="head" />{p.name} said <b>{nameOf(game, pick)}</b> {right ? '✓' : '✗'}</span>;
              })}
              {note.fooled > 0 && <span className="is-fooled">🎭 {nameOf(game, note.by)} fooled {note.fooled}! +{note.fooled * 60}</span>}
              {note.hearts > 0 && <span className="is-fooled">💗 {note.hearts} heart{note.hearts === 1 ? '' : 's'} +{note.hearts * 30}</span>}
            </div>
          )}
        </div>
      )}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After round {game.round + 1} of {game.rounds}</div>
          <h2 className="lc-title">Sweethearts so far</h2>
          <Leaderboard ranks={ranks} prev={prevRanks.current} players={players} />
          <p className="lq-next">Next: everyone gets a <b>new</b> secret valentine!</p>
        </div>
      )}

      {game.phase === 'over' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
