import React, { useEffect, useRef } from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { INK } from '../cartoon';
import {
  awards, GRACE_MS, PLAN, PERFECT_MS, ranking, READY_MS, ROUND_TYPES, shownClock,
} from './countdown';
import { Leaderboard, Podium } from './Results';

// Countdown Chaos on the TV: a city at night, the ball dropping down the tower, and the crowd below.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const rnd = (i) => { const x = Math.sin(i * 78.233 + 12.9898) * 43758.5453; return x - Math.floor(x); };
const YEAR = (() => { const d = new Date(); return d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(); })();
const CONFETTI = ['#ff5a4e', '#ffd23f', '#3ddc97', '#4ea8ff', '#c77dff', '#ff8fd0'];
const TOP = 170;
const BOTTOM = 520;

const BUILDINGS = Array.from({ length: 16 }, (_, i) => {
  const w = 90 + rnd(i) * 80;
  const x = i * 125 - 30 + rnd(i + 3) * 20;
  const h = 260 + rnd(i + 9) * 340;
  return { x, w, h, c: ['#1d1a3d', '#241f4a', '#191635'][i % 3] };
}).filter((b) => b.x + b.w < 760 || b.x > 1160);

export const City = React.memo(() => (
  <g>
    <defs>
      <linearGradient id="cc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#090722" />
        <stop offset="0.7" stopColor="#2a1650" />
        <stop offset="1" stopColor="#5a2a6a" />
      </linearGradient>
      <radialGradient id="cc-ball" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#bfe3ff" />
        <stop offset="1" stopColor="#4a6ad8" />
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#cc-sky)" />
    {Array.from({ length: 70 }, (_, i) => <circle key={i} className="lc-star" style={{ animationDelay: `${-rnd(i) * 2}s` }} cx={rnd(i + 1) * 1920} cy={rnd(i + 2) * 520} r={1 + rnd(i + 5) * 2.2} fill="#fff" />)}
    <circle cx="1650" cy="150" r="52" fill="#f4f0ff" />
    <circle cx="1672" cy="136" r="48" fill="#120c30" opacity="0.92" />
    {BUILDINGS.map((b, i) => (
      <g key={i}>
        <rect x={b.x} y={1000 - b.h} width={b.w} height={b.h} fill={b.c} stroke={INK} strokeWidth="5" />
        {Array.from({ length: Math.floor(b.h / 46) * 3 }, (_, k) => {
          const col = k % 3;
          const row = Math.floor(k / 3);
          if (rnd(i * 50 + k) < 0.45) return null;
          return <rect key={k} x={b.x + 14 + col * ((b.w - 28) / 3)} y={1000 - b.h + 20 + row * 46} width={(b.w - 28) / 3 - 10} height="22" rx="3" fill={rnd(i * 30 + k) > 0.7 ? '#ffd27a' : '#ffe9a8'} opacity="0.85" />;
        })}
      </g>
    ))}
    {/* the tower */}
    <path d="M840 1000 L860 600 L1060 600 L1080 1000 Z" fill="#2c2760" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
    <rect x="880" y="560" width="160" height="50" fill="#3a3478" stroke={INK} strokeWidth="6" />
    <rect x="952" y={TOP - 30} width="16" height={BOTTOM - TOP + 80} fill="#9aa3c8" stroke={INK} strokeWidth="5" />
    {/* the year, waiting to light up */}
    <rect x="800" y="860" width="320" height="110" rx="14" fill="#14112e" stroke={INK} strokeWidth="6" />
    <rect y="1000" width="1920" height="80" fill="#1a1630" />
  </g>
));

/** The glittering ball. */
const Ball = ({ y, spin }) => (
  <g transform={`translate(960 ${y})`}>
    <circle r="78" fill="#ffe9a8" opacity="0.18" />
    <circle r="62" fill="url(#cc-ball)" stroke={INK} strokeWidth="6" />
    {[-40, -20, 0, 20, 40].map((k) => <ellipse key={k} rx={Math.sqrt(Math.max(0, 62 * 62 - k * k))} ry="6" cy={k} fill="none" stroke="#2a3a8a" strokeWidth="2" opacity="0.5" />)}
    {[0, 1, 2, 3].map((k) => <ellipse key={k} rx={Math.abs(Math.cos(spin + (k * Math.PI) / 4)) * 62} ry="62" fill="none" stroke="#2a3a8a" strokeWidth="2" opacity="0.5" />)}
    {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={Math.cos(spin * 2 + i) * 44} cy={Math.sin(i * 2.3) * 40} r={3 + (i % 3)} fill={CONFETTI[i % 6]} className="lc-star" />)}
  </g>
);

/** Fireworks and confetti after midnight. k: ms since midnight. */
const Fireworks = ({ k }) => (
  <g>
    {[[420, 300, 0], [1500, 260, 350], [760, 180, 700], [1220, 360, 1000], [260, 420, 1300], [1700, 420, 1500]].map(([x, y, d], i) => {
      const t = (k - d) / 1300;
      if (t < 0 || t > 1) return null;
      const r = 40 + 160 * ease(t);
      return (
        <g key={i} opacity={1 - Math.max(0, t - 0.55) / 0.45}>
          {Array.from({ length: 16 }, (_, j) => {
            const a = (j / 16) * Math.PI * 2;
            return <line key={j} x1={x + Math.cos(a) * r * 0.55} y1={y + Math.sin(a) * r * 0.55 + 30 * t * t} x2={x + Math.cos(a) * r} y2={y + Math.sin(a) * r + 40 * t * t} stroke={CONFETTI[(i + j) % 6]} strokeWidth="7" strokeLinecap="round" />;
          })}
          <circle cx={x} cy={y} r={14 * (1 - t)} fill="#fff" />
        </g>
      );
    })}
    {Array.from({ length: 60 }, (_, i) => {
      const t = (k - (i % 10) * 90) / 3000;
      if (t < 0 || t > 1) return null;
      return <rect key={`c${i}`} x={rnd(i) * 1920 + Math.sin(t * 9 + i) * 30} y={-20 + t * 1100} width="12" height="20" rx="3" fill={CONFETTI[i % 6]} transform={`rotate(${t * 720 + i * 20} ${rnd(i) * 1920} ${-20 + t * 1100})`} />;
    })}
  </g>
);

const fmtClock = (ms) => {
  const s = Math.max(0, ms) / 1000;
  return s >= 10 ? s.toFixed(1) : `0${s.toFixed(1)}`;
};

/** The whole scene. clock: { shown, hidden } or null. drop: 0..1 how far the ball has come. people: [{ key, look, name, stopped, pose, vip }]. */
export function CountdownScene({ drop, clock, people, midnightAgo, now, dark }) {
  const n = people.length;
  const lit = midnightAgo != null && midnightAgo >= 0;
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <City />
      {dark && <rect width="1920" height="1080" fill="#000" opacity="0.35" />}
      <Ball y={TOP + (BOTTOM - TOP) * drop} spin={now / 700} />
      {/* the big clock */}
      <g transform="translate(960 640)">
        <rect x="-170" y="-58" width="340" height="116" rx="16" fill="#0d0b20" stroke={INK} strokeWidth="7" />
        <text y="4" fontSize="86" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill={clock?.hidden ? '#3a3560' : '#ff4f6d'} style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }} className={clock?.hidden ? '' : 'cc-led'}>
          {lit ? '00.0' : clock ? (clock.hidden ? '??.?' : fmtClock(clock.shown)) : '--.-'}
        </text>
      </g>
      <text x="960" y="918" fontSize="92" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill={lit ? '#ffd23f' : '#2a2650'} stroke={lit ? INK : 'none'} strokeWidth="6" paintOrder="stroke" style={{ fontFamily: 'var(--lc-spooky), Arial Black, Arial' }} className={lit ? 'cc-year' : ''}>{YEAR}</text>
      {lit && <Fireworks k={midnightAgo} />}
      {people.map((p, i) => {
        const w = Math.min(150, 1700 / Math.max(1, n));
        const x = 960 + (i - (n - 1) / 2) * w + (i % 2 ? 0 : 0);
        const y = 1050 - (i % 2) * 16;
        return (
          <g key={p.key}>
            <ScenePerson look={p.look} pose={p.pose || 'stand'} k={0} x={x} y={y} delay={i % 4} scale={0.42} />
            {p.stopped && (
              <g transform={`translate(${x} ${y - 190})`} className="cc-pop">
                <path d="M-40 -26 L40 -26 L40 22 L8 22 L0 34 L-8 22 L-40 22 Z" fill="#ff4f6d" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
                <text y="-1" fontSize="26" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#fff">STOP</text>
              </g>
            )}
            <PlayerTag name={p.name} vip={p.vip} x={x} y={y + 2} />
          </g>
        );
      })}
    </svg>
  );
}

const secs = (ms) => `${(Math.abs(ms) / 1000).toFixed(2)}s`;

/** Where everyone stopped, on a strip leading up to midnight. */
const Timeline = ({ rows, players }) => {
  const SPAN = 3000;
  const pos = (early) => (early == null ? 104 : early < 0 ? Math.min(98, 82 + (-early / 1600) * 16) : Math.max(2, 82 - (early / SPAN) * 80));
  const sorted = [...rows].sort((a, b) => (a.early ?? -1e9) - (b.early ?? -1e9));
  return (
    <div className="cc-line">
      <div className="cc-track"><span className="cc-mid">MIDNIGHT</span><span className="cc-bust">TOO LATE</span><span className="cc-scale">3s</span></div>
      {sorted.map((r, i) => {
        const p = players.find((x) => x.cid === r.cid);
        if (!p) return null;
        const bad = r.early == null || r.early < 0;
        return (
          <div key={r.cid} className={`cc-pin${bad ? ' is-bad' : ''}${r.won ? ' is-win' : ''}`} style={{ left: `${Math.min(97, pos(r.early))}%`, '--row': i % 3 }}>
            <Person look={p.look} view="head" />
            <b>{p.name}</b>
            <small>{r.early == null ? 'no stop' : bad ? `+${secs(r.early)} late` : r.early <= PERFECT_MS ? 'PERFECT!' : `${secs(r.early)} early`}</small>
          </div>
        );
      })}
    </div>
  );
};

/** Countdown Chaos on the TV. */
export default function CountdownStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const lastTick = useRef(-1);
  const prevRanks = useRef({});
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'ready': sfx.night(); break;
        case 'go': sfx.whoosh(); break;
        case 'stop': sfx.hit(); break;
        case 'midnight': sfx.won(); sfx.soulDone(); break;
        case 'reveal': sfx.banish(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
  });

  const round = game.round;
  const type = ROUND_TYPES[round.type];
  const counting = game.phase === 'count';
  const clock = counting ? shownClock(round, elapsed) : null;
  // Tick each shown second while the clock can be seen.
  if (counting && clock && !clock.hidden) {
    const sec = Math.ceil(clock.shown / 1000);
    if (sec !== lastTick.current && sec <= 5 && sec > 0) sfx.tick();
    lastTick.current = sec;
  }
  const drop = counting ? Math.min(1, elapsed / round.dur) : game.phase === 'ready' ? 0 : 1;
  const midnightAgo = counting ? elapsed - round.dur : game.phase === 'reveal' ? elapsed + GRACE_MS : null;
  const rows = game.phase === 'reveal' ? game.history[game.history.length - 1]?.rows || [] : [];
  const people = players.map((p, i) => {
    let pose = 'stand';
    if (counting && game.stops[p.cid] != null) pose = 'wave';
    if (midnightAgo != null && midnightAgo > 0) {
      const r = rows.find((x) => x.cid === p.cid);
      pose = r && (r.early == null || r.early < 0) ? 'scared' : 'cheer';
    }
    if (game.phase === 'over') pose = 'cheer';
    return { key: p.cid, look: p.look, name: p.name, vip: i === 0, pose, stopped: counting && game.stops[p.cid] != null };
  });
  const ranks = ranking(game).map((r) => ({ ...r, name: players.find((p) => p.cid === r.cid)?.name || '?' }));
  if (game.phase === 'reveal' && elapsed < 50) prevRanks.current = Object.fromEntries(ranks.map((r) => [r.cid, r.rank]));
  const winner = rows.find((r) => r.won);
  const winnerName = winner && players.find((p) => p.cid === winner.cid)?.name;

  return (
    <>
      <CountdownScene drop={ease(drop)} clock={clock} people={people} midnightAgo={midnightAgo} now={now} dark={counting && clock?.hidden} />
      <div className="lq-hud lh-hud">
        <span className="lq-pill">Countdown {game.index + 1} of {PLAN.length}</span>
        <span className="lq-pill">{type.title}{type.double ? ' · ×2' : ''}</span>
        {counting && <span className="lq-pill">✋ {Object.keys(game.stops).length} / {players.length} stopped</span>}
      </div>

      {game.phase === 'ready' && (
        <div className="lc-card lh-floor" key={`r${game.index}`}>
          <div className="lc-card-kicker">Countdown {game.index + 1} of {PLAN.length}</div>
          <h2 className="lc-title">{type.title}</h2>
          <p>{type.blurb}</p>
          <p className="lh-small">Watch the clock on your phone and hit <b>STOP</b> right before midnight.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((READY_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {game.phase === 'reveal' && elapsed > 900 && (
        <div className="lc-card cc-results">
          <h2 className="lc-title">{winnerName ? `${winnerName} nailed it!` : 'Everybody partied too hard!'}</h2>
          <Timeline rows={rows} players={players} />
        </div>
      )}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After {game.index + 1} of {PLAN.length} countdowns</div>
          <h2 className="lc-title">Scoreboard</h2>
          <Leaderboard ranks={ranks} prev={prevRanks.current} players={players} />
          {game.index + 2 === PLAN.length && <p className="lq-next">Next: <b>The Big One</b>. Double points!</p>}
        </div>
      )}

      {game.phase === 'over' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
