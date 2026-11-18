import React, { useEffect, useRef } from 'react';
import { sfx } from '../sound';
import { PlayerTag } from '../scene';
import { INK } from '../cartoon';
import {
  awards, COLORS, COLS, HUNT_MS, hopMs, ranking, ROUNDS, SPOTS,
} from './eggHunt';
import { Leaderboard, Podium } from './Results';

// Egg Hunt on the TV: a spring garden, the Easter Bunny hopping around hiding eggs, then the big hunt.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const rnd = (i) => { const x = Math.sin(i * 71.3 + 1.7) * 43758.5453; return x - Math.floor(x); };

const ROW_Y = [505, 630, 770, 930];
const ROW_S = [0.7, 0.8, 0.92, 1.05];
const ROW_GAP = [240, 290, 340, 385];
/** Where hiding spot i sits in the garden. */
export const spotXY = (i) => {
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  return { x: 960 + (col - (COLS - 1) / 2) * ROW_GAP[row] + (rnd(i) - 0.5) * 40, y: ROW_Y[row], s: ROW_S[row] };
};
export const eggFill = (owner, colors) => (owner === 'golden' ? '#ffd23f' : COLORS[colors[owner] ?? 0]?.fill || '#fff');

const EGG = 'M0 -34 C20 -34 30 -6 30 10 C30 28 16 38 0 38 C-16 38 -30 28 -30 10 C-30 -6 -20 -34 0 -34 Z';

/** A decorated egg. pattern 0 zigzag, 1 dots, 2 stripes. golden sparkles. */
export const Egg = ({ x, y, s = 1, fill, pattern = 0, golden, rot = 0, opacity = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={opacity}>
    {golden && <circle r="58" fill="#fff6b0" opacity="0.55" className="eh-glow" />}
    <path d={EGG} fill={fill} stroke={INK} strokeWidth="5" />
    <g clipPath="url(#eh-clip)">
      {golden ? (
        <>
          <path d="M-30 -2 L-20 -12 L-10 -2 L0 -12 L10 -2 L20 -12 L30 -2" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
          <path d="M-30 18 L30 18" stroke="#e0a400" strokeWidth="6" />
        </>
      ) : pattern === 0 ? (
        <path d="M-32 4 L-21 -8 L-10 4 L1 -8 L12 4 L23 -8 L34 4" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
      ) : pattern === 1 ? (
        <g fill="#fff">
          <circle cx="-12" cy="-10" r="5" /><circle cx="10" cy="-4" r="5" /><circle cx="-6" cy="14" r="5" /><circle cx="16" cy="20" r="4" /><circle cx="-20" cy="22" r="4" />
        </g>
      ) : (
        <>
          <rect x="-32" y="-10" width="64" height="7" fill="#fff" />
          <rect x="-32" y="12" width="64" height="7" fill={INK} opacity="0.25" />
        </>
      )}
    </g>
    <path d="M-14 -22 Q-20 -8 -18 4" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
    {golden && <path d="M38 -36 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#fff" stroke={INK} strokeWidth="2" className="eh-twinkle" />}
  </g>
);

/** The Easter Bunny, with a basket of eggs. lean: -1..1 squash/stretch while hopping. */
export const Bunny = ({ x, y, s = 1, flip, lean = 0, look = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${(flip ? -1 : 1) * s} ${s})`}>
    <ellipse cy="4" rx="62" ry="12" fill="#000" opacity="0.18" />
    <g transform={`scale(${1 - lean * 0.08} ${1 + lean * 0.12})`}>
      {/* ears */}
      <g transform={`rotate(${-14 + look * 6} -16 -170)`}>
        <ellipse cx="-20" cy="-218" rx="17" ry="56" fill="#fff" stroke={INK} strokeWidth="6" />
        <ellipse cx="-20" cy="-214" rx="8" ry="40" fill="#ffb3cf" />
      </g>
      <g transform={`rotate(${16 + look * 6} 16 -170)`}>
        <ellipse cx="20" cy="-218" rx="17" ry="56" fill="#fff" stroke={INK} strokeWidth="6" />
        <ellipse cx="20" cy="-214" rx="8" ry="40" fill="#ffb3cf" />
      </g>
      {/* tail and body */}
      <circle cx="-46" cy="-46" r="20" fill="#fff" stroke={INK} strokeWidth="5" />
      <ellipse cy="-62" rx="50" ry="60" fill="#fff" stroke={INK} strokeWidth="6" />
      <ellipse cx="6" cy="-52" rx="28" ry="36" fill="#ffe8f1" />
      <ellipse cx="-24" cy="-4" rx="24" ry="11" fill="#fff" stroke={INK} strokeWidth="5" />
      <ellipse cx="26" cy="-4" rx="24" ry="11" fill="#fff" stroke={INK} strokeWidth="5" />
      {/* head */}
      <circle cy="-140" r="44" fill="#fff" stroke={INK} strokeWidth="6" />
      <ellipse cx={-15 + look * 4} cy="-148" rx="6" ry="9" fill={INK} />
      <ellipse cx={15 + look * 4} cy="-148" rx="6" ry="9" fill={INK} />
      <circle cx={-13 + look * 4} cy="-151" r="2.4" fill="#fff" />
      <circle cx={17 + look * 4} cy="-151" r="2.4" fill="#fff" />
      <circle cx="-27" cy="-128" r="8" fill="#ff9fc0" opacity="0.7" />
      <circle cx="27" cy="-128" r="8" fill="#ff9fc0" opacity="0.7" />
      <path d="M-7 -132 L7 -132 L0 -124 Z" fill="#ff6f9f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M-9 -118 Q-4 -112 0 -118 Q4 -112 9 -118" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M-16 -126 L-46 -132 M-16 -122 L-46 -118 M16 -126 L46 -132 M16 -122 L46 -118" stroke={INK} strokeWidth="2" opacity="0.6" />
      {/* bow tie */}
      <path d="M0 -96 L-18 -106 L-18 -86 Z M0 -96 L18 -106 L18 -86 Z" fill="#7c5cff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* basket */}
      <path d="M22 -78 Q50 -122 78 -78" fill="none" stroke="#8a5a2b" strokeWidth="7" />
      <ellipse cx="40" cy="-80" rx="11" ry="14" fill="#ff6fae" stroke={INK} strokeWidth="3" />
      <ellipse cx="62" cy="-82" rx="11" ry="14" fill="#4fc3f7" stroke={INK} strokeWidth="3" />
      <ellipse cx="51" cy="-86" rx="11" ry="14" fill="#ffe14d" stroke={INK} strokeWidth="3" />
      <path d="M16 -78 L84 -78 L76 -40 L24 -40 Z" fill="#c98a4b" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M22 -66 L80 -66 M24 -54 L78 -54" stroke="#8a5a2b" strokeWidth="3" />
      <ellipse cx="18" cy="-62" rx="12" ry="10" fill="#fff" stroke={INK} strokeWidth="4" />
    </g>
  </g>
);

/** The spring garden behind everything. */
export const Garden = React.memo(() => (
  <g>
    <defs>
      <linearGradient id="eh-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fd8ff" />
        <stop offset="0.7" stopColor="#d9f3ff" />
        <stop offset="1" stopColor="#fff4dc" />
      </linearGradient>
      <linearGradient id="eh-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fdc6a" />
        <stop offset="1" stopColor="#3f9e3a" />
      </linearGradient>
      <clipPath id="eh-clip" clipPathUnits="userSpaceOnUse"><path d={EGG} /></clipPath>
    </defs>
    <rect width="1920" height="1080" fill="url(#eh-sky)" />
    <g transform="translate(1740 250) scale(0.85)">
      <circle r="78" fill="#ffe066" stroke={INK} strokeWidth="6" />
      {Array.from({ length: 12 }, (_, i) => <path key={i} d="M0 -96 L0 -126" stroke="#ffcf33" strokeWidth="9" strokeLinecap="round" transform={`rotate(${i * 30})`} />)}
      <circle cx="-22" cy="-8" r="7" fill={INK} /><circle cx="22" cy="-8" r="7" fill={INK} />
      <path d="M-26 18 Q0 40 26 18" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
    </g>
    {[[260, 150, 1], [760, 95, 0.8], [1250, 175, 0.9]].map(([x, y, s]) => (
      <g key={x} className="rr-cloud" transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-110 30 Q-120 -10 -70 -12 Q-60 -55 -10 -45 Q20 -75 60 -40 Q110 -45 110 0 Q140 30 100 40 Z" fill="#fff" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      </g>
    ))}
    {/* rolling hills */}
    <path d="M0 400 Q260 300 560 380 Q860 290 1180 370 Q1500 290 1920 380 L1920 520 L0 520 Z" fill="#b6e88f" stroke={INK} strokeWidth="6" />
    <path d="M0 450 Q480 400 960 440 Q1440 400 1920 450 L1920 1080 L0 1080 Z" fill="url(#eh-grass)" stroke={INK} strokeWidth="6" />
    {/* picket fence */}
    {Array.from({ length: 33 }, (_, i) => (
      <path key={`p${i}`} d={`M${i * 60 + 8} 452 L${i * 60 + 8} 392 L${i * 60 + 22} 376 L${i * 60 + 36} 392 L${i * 60 + 36} 452 Z`} fill="#fffaf0" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    ))}
    <rect y="402" width="1920" height="12" fill="#fffaf0" stroke={INK} strokeWidth="4" />
    <rect y="430" width="1920" height="12" fill="#fffaf0" stroke={INK} strokeWidth="4" />
    {/* garden path and flower dots */}
    <path d="M880 1080 Q920 760 960 470 Q1000 760 1040 1080 Z" fill="#e9cf9b" opacity="0.55" />
    {Array.from({ length: 90 }, (_, i) => {
      const x = rnd(i + 11) * 1920;
      const y = 470 + rnd(i + 23) * 600;
      return <circle key={`d${i}`} cx={x} cy={y} r={4 + (y - 470) / 120} fill={['#fff', '#ffe14d', '#ff9fc0', '#c7a6ff'][i % 4]} opacity="0.85" />;
    })}
    {/* egg bunting */}
    <path d="M0 22 Q480 92 960 22 Q1440 92 1920 22" fill="none" stroke="#fff" strokeWidth="4" />
    {Array.from({ length: 22 }, (_, i) => {
      const x = 44 + i * 88;
      const u = (x % 960) / 960;
      const y = 22 + 70 * 4 * u * (1 - u) * 0.95 + 24;
      return <path key={`b${i}`} d={EGG} transform={`translate(${x} ${y}) scale(0.55)`} fill={COLORS[i % 8].fill} stroke={INK} strokeWidth="6" />;
    })}
  </g>
));

/** One hiding spot: a mound with its garden thing on top. */
const Spot = React.memo(({ i, wiggle, dim, mark }) => {
  const p = spotXY(i);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${p.s})`} opacity={dim ? 0.55 : 1}>
      <ellipse cy="6" rx="78" ry="20" fill="#2d6b2a" opacity="0.45" />
      <ellipse cy="0" rx="70" ry="16" fill="#6b4a2b" stroke={INK} strokeWidth="4" />
      <g transform={`rotate(${wiggle ? Math.sin(wiggle) * 8 : 0})`}>
        <text y="-46" fontSize="104" textAnchor="middle" dominantBaseline="central">{SPOTS[i].icon}</text>
      </g>
      {mark && <text x="48" y="-90" fontSize="44" textAnchor="middle" dominantBaseline="central" opacity="0.9">❌</text>}
    </g>
  );
});

/** Where the bunny is and what it is doing, from the hops and the time into the hide phase. */
export function bunnyAt(hops, ms, t) {
  const hop = Math.min(hops.length, Math.floor(t / ms));
  const k = (t - hop * ms) / ms;
  const from = hop === 0 ? { x: -160, y: 700, s: 0.9 } : spotXY(hops[hop - 1].spot);
  const to = hop >= hops.length ? { x: 2100, y: 700, s: 0.9 } : spotXY(hops[hop].spot);
  const j = ease(k / 0.42);
  const x = from.x + (to.x - from.x) * j - 70 * (from.s + (to.s - from.s) * j);
  const s = (from.s + (to.s - from.s) * j) * 0.82;
  const y = from.y + (to.y - from.y) * j - Math.sin(Math.min(1, k / 0.42) * Math.PI) * 140 - 4;
  const flying = k < 0.42;
  return { hop, k, x, y, s, flip: to.x < from.x, lean: flying ? Math.sin(Math.min(1, k / 0.42) * Math.PI) : -0.3 * Math.sin(Math.min(1, (k - 0.42) / 0.2) * Math.PI) };
}

/** The scene, shared with the how-to. eggs: [{ spot, owner, pattern, k (0..1 pop), label }]. */
export function EggScene({ hops = [], colors = {}, hideT = null, ms = 1000, eggs = [], marks = {}, now, pulse = {} }) {
  const b = hideT != null ? bunnyAt(hops, ms, hideT) : null;
  const drop = b && b.hop < hops.length && hops[b.hop].egg && b.k > 0.45 ? hops[b.hop] : null;
  const dk = drop ? (b.k - 0.45) / 0.45 : 0;
  const fake = b && b.hop < hops.length && !hops[b.hop].egg && b.k > 0.45;
  const spots = SPOTS.map((_, i) => i);
  // Back to front so nearer things overlap farther ones.
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <Garden />
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          {spots.filter((i) => Math.floor(i / COLS) === row).map((i) => {
            const near = b && b.hop < hops.length && hops[b.hop].spot === i && b.k > 0.42;
            return <Spot key={i} i={i} wiggle={(near && b.k < 0.9) || pulse[i] ? now / 60 : 0} mark={marks[i]} />;
          })}
          {drop && Math.floor(drop.spot / COLS) === row && (() => {
            const p = spotXY(drop.spot);
            const y = p.y - 150 * p.s + ease(dk / 0.55) * 110 * p.s;
            return <Egg x={p.x} y={y} s={p.s * 0.9} fill={eggFill(drop.egg, colors)} golden={drop.egg === 'golden'} pattern={(colors[drop.egg] ?? 0) % 3} opacity={dk > 0.7 ? 1 - (dk - 0.7) / 0.3 : 1} />;
          })()}
          {eggs.filter((e) => Math.floor(e.spot / COLS) === row).map((e) => {
            const p = spotXY(e.spot);
            const k = ease(e.k);
            return (
              <g key={`e${e.spot}`}>
                <Egg x={p.x + 40 * p.s} y={p.y - 30 * p.s - k * 70 * p.s} s={p.s * (0.6 + 0.4 * k)} fill={eggFill(e.owner, colors)} golden={e.owner === 'golden'} pattern={(colors[e.owner] ?? 0) % 3} rot={12} />
                {e.label && <PlayerTag name={e.label} x={p.x + 40 * p.s} y={p.y - 8} color={e.owner === 'golden' ? '#b8860b' : '#1d1530'} />}
              </g>
            );
          })}
          {b && b.hop <= hops.length && Math.floor((b.hop < hops.length ? hops[b.hop].spot : 19) / COLS) === row && (
            <g>
              <Bunny x={b.x} y={b.y} s={b.s} flip={b.flip} lean={b.lean} look={fake ? Math.sin(now / 160) : 0} />
              {fake && <text x={b.x} y={b.y - 290 * b.s} fontSize="60" textAnchor="middle" className="eh-hmm">🤔</text>}
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

/** Egg Hunt on the TV. */
export default function EggStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const misses = useRef([]);
  const pops = useRef({});
  const prevRanks = useRef({});
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': pops.current = {}; misses.current = []; sfx.night(); break;
        case 'drop': sfx.join(); break;
        case 'fake': sfx.whoosh(); break;
        case 'hunt': prevRanks.current = Object.fromEntries(ranking(game).map((r) => [r.cid, r.rank])); sfx.soul(); break;
        case 'found': pops.current[e.spot] = performance.now(); sfx.banish(); break;
        case 'golden': pops.current[e.spot] = performance.now(); sfx.soulDone(); sfx.won(); break;
        case 'miss': misses.current = [...misses.current.slice(-20), { spot: e.spot, at: performance.now() }]; sfx.fizzle(); break;
        case 'reveal': sfx.hit(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
  });

  const nameOf = (cid) => players.find((p) => p.cid === cid)?.name || game.players.find((p) => p.cid === cid)?.name || '?';
  const ranks = ranking(game).map((r) => ({ ...r, name: nameOf(r.cid) }));
  const owners = Object.keys(game.colors);
  const foundCount = owners.filter((c) => game.found[c]).length;

  // Eggs shown above their spots: found ones in the hunt, all of them at the reveal.
  const eggs = [];
  if (game.phase === 'hunt' || game.phase === 'reveal') {
    Object.entries(game.eggs).forEach(([spot, owner]) => {
      const s = Number(spot);
      const got = owner === 'golden' ? game.golden : game.found[owner];
      if (!got && game.phase !== 'reveal') return;
      const at = pops.current[s];
      const k = at ? (now - at) / 400 : game.phase === 'reveal' ? (elapsed - 300) / 500 : 1;
      let label = owner === 'golden' ? (game.golden ? `🌟 ${nameOf(game.golden.by)}` : 'Golden!') : nameOf(owner);
      if (game.phase === 'reveal' && !got && owner !== 'golden') label = `${nameOf(owner)} ✗`;
      eggs.push({ spot: s, owner, k, label });
    });
  }
  const marks = {};
  misses.current.forEach((m) => { if (now - m.at < 1100) marks[m.spot] = true; });
  const hiding = game.phase === 'hide';

  return (
    <>
      <EggScene hops={game.hops} colors={game.colors} hideT={hiding ? elapsed : null} ms={hopMs(game)} eggs={eggs} marks={marks} now={now} />

      <div className="lq-hud lh-hud">
        <span className="lq-pill">🥚 Round {game.round + 1} of {ROUNDS}</span>
        {game.phase === 'hunt' && <span className="lq-pill">⏳ {Math.ceil(Math.max(0, HUNT_MS - elapsed) / 1000)}s</span>}
        {(game.phase === 'hunt' || game.phase === 'reveal') && <span className="lq-pill">🧺 {foundCount} / {owners.length} found</span>}
      </div>

      {game.phase === 'start' && (
        <div className="lc-card lh-floor eh-card" key={`s${game.round}`}>
          <div className="lc-card-kicker">Round {game.round + 1} of {ROUNDS}</div>
          <h2 className="lc-title">Watch the bunny!</h2>
          <p>{game.round === 0 ? 'Remember where YOUR color egg goes. The golden egg is up for grabs!' : `Faster hops${game.round >= 1 ? ` and ${game.round} fake stop${game.round === 1 ? '' : 's'}` : ''}. Don't get fooled!`}</p>
        </div>
      )}
      {hiding && <div className="rr-banner eh-banner">👀 Watch where <b>your</b> egg goes…</div>}
      {game.phase === 'hunt' && (
        <div className="rr-banner eh-banner">
          Tap the spot on your phone! <span className="eh-timer"><i style={{ width: `${Math.max(0, 1 - elapsed / HUNT_MS) * 100}%` }} /></span>
        </div>
      )}
      {(hiding || game.phase === 'hunt') && (
        <div className="eh-legend">
          {owners.map((cid) => {
            const c = COLORS[game.colors[cid]];
            return <span key={cid} className={game.found[cid] ? 'is-found' : ''}><i style={{ background: c?.fill }} />{nameOf(cid)}{game.found[cid] ? ' ✓' : ''}</span>;
          })}
          <span className={game.golden ? 'is-found' : ''}><i className="is-gold" />{game.golden ? `${nameOf(game.golden.by)} 🌟` : 'Golden egg'}</span>
        </div>
      )}

      {game.phase === 'reveal' && elapsed > 2600 && (
        <div className="lc-card lq-scores eh-scores">
          <div className="lc-card-kicker">After round {game.round + 1} of {ROUNDS}</div>
          <h2 className="lc-title">{foundCount === owners.length ? 'Every egg found!' : 'Egg-cellent!'}</h2>
          <Leaderboard ranks={ranks} prev={prevRanks.current} players={players} gains={Object.fromEntries(Object.entries(game.gains).map(([cid, gain]) => [cid, { gain }]))} />
        </div>
      )}

      {game.phase === 'over' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
