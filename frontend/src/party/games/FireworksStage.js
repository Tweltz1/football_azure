import React, { useEffect, useRef } from 'react';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { INK } from '../cartoon';
import {
  awards, beatMs, COLORS, FINALE_BONUS, LEAD_MS, ranking, RISE_MS, SHOWS,
} from './fireworks';
import { Leaderboard, Podium } from './Results';

// Fireworks Show on the TV: a harbor at night, a launch tube per player, and the sky lighting up on the beat.

const rnd = (i) => { const x = Math.sin(i * 91.7 + 4.3) * 43758.5453; return x - Math.floor(x); };
const easeOut = (v) => 1 - (1 - Math.max(0, Math.min(1, v))) ** 3;
export const TUBE_Y = 958;
export const tubeX = (i, n) => 960 + (i - (n - 1) / 2) * Math.min(150, 1640 / Math.max(1, n));
export const rocketTarget = (r, x) => ({ x: Math.max(130, Math.min(1790, x + r.tx)), y: r.ty });

/** The harbor at night. glow: 0..1 flash from the latest burst. */
export const Harbor = React.memo(({ glow = 0, tint = '#fff' }) => (
  <g>
    <defs>
      <linearGradient id="fw-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#05061a" />
        <stop offset="0.6" stopColor="#1a1450" />
        <stop offset="1" stopColor="#3b2a6e" />
      </linearGradient>
      <linearGradient id="fw-water" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1b2350" />
        <stop offset="1" stopColor="#070a1f" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#fw-sky)" />
    {Array.from({ length: 110 }, (_, i) => (
      <circle key={i} className="fw-star" style={{ animationDelay: `${-rnd(i) * 4}s` }} cx={rnd(i + 1) * 1920} cy={rnd(i + 2) * 640} r={0.8 + rnd(i + 3) * 2} fill="#fff" opacity={0.3 + rnd(i + 4) * 0.6} />
    ))}
    <g transform="translate(1660 150)">
      <circle r="58" fill="#fff8d8" />
      <circle cx="22" cy="-12" r="52" fill="#141043" />
    </g>
    {/* the skyline */}
    <path d={`M0 820 ${Array.from({ length: 34 }, (_, i) => { const x = i * 60; const h = 640 + rnd(i + 40) * 150 - (i > 12 && i < 20 ? 60 : 0); return `L${x} ${h} L${x + 52} ${h}`; }).join(' ')} L1920 700 L1920 860 L0 860 Z`} fill="#0b0b26" stroke={INK} strokeWidth="4" />
    {Array.from({ length: 120 }, (_, i) => {
      const col = Math.floor(rnd(i + 70) * 33);
      const h = 640 + rnd(col + 40) * 150 - (col > 12 && col < 20 ? 60 : 0);
      const y = h + 16 + rnd(i + 90) * (840 - h - 20);
      return <rect key={`w${i}`} x={col * 60 + 8 + Math.floor(rnd(i + 3) * 4) * 10} y={y} width="7" height="9" fill="#ffd77a" opacity={0.35 + rnd(i + 5) * 0.5} />;
    })}
    {/* water and reflections */}
    <rect y="860" width="1920" height="220" fill="url(#fw-water)" />
    {Array.from({ length: 26 }, (_, i) => <rect key={`r${i}`} className="fw-shimmer" style={{ animationDelay: `${-rnd(i + 9) * 3}s` }} x={rnd(i + 12) * 1860} y={875 + rnd(i + 13) * 70} width={30 + rnd(i + 14) * 70} height="4" rx="2" fill="#ffd77a" opacity="0.25" />)}
    {/* the dock */}
    <rect y="985" width="1920" height="26" fill="#6b4226" stroke={INK} strokeWidth="5" />
    {Array.from({ length: 24 }, (_, i) => <rect key={`d${i}`} x={i * 84 + 20} y="1008" width="16" height="72" fill="#4a2c18" stroke={INK} strokeWidth="4" />)}
    {/* bunting */}
    <path d="M0 30 Q480 100 960 30 Q1440 100 1920 30" fill="none" stroke="#fff" strokeWidth="3" opacity="0.7" />
    {Array.from({ length: 24 }, (_, i) => {
      const x = 40 + i * 80;
      const u = (x % 960) / 960;
      const y = 30 + 70 * 4 * u * (1 - u) * 0.95;
      return <path key={`b${i}`} d={`M${x - 22} ${y} L${x + 22} ${y} L${x} ${y + 36} Z`} fill={['#e23b4a', '#fff', '#3a5bd9'][i % 3]} stroke={INK} strokeWidth="3" />;
    })}
    {glow > 0 && <rect width="1920" height="1080" fill={tint} opacity={glow * 0.16} />}
  </g>
));

const heartPt = (t) => ({ x: 16 * Math.sin(t) ** 3 / 17, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 });
const starPt = (i, n) => {
  const pts = Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rr = k % 2 ? 0.45 : 1; return { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; });
  const f = (i / n) * 10;
  const a = pts[Math.floor(f) % 10];
  const b = pts[(Math.floor(f) + 1) % 10];
  const u = f - Math.floor(f);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
};

/** One firework bursting. k: 0..1 through its life. size: radius in px. */
export const Burst = ({ x, y, color, shape, k, size }) => {
  const r = size * easeOut(k * 1.4);
  const fall = 90 * k * k;
  const fade = Math.max(0, 1 - k * k);
  const n = shape === 'ring' ? 26 : shape === 'heart' || shape === 'star' ? 34 : 30;
  const dots = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    let p = { x: Math.cos(a), y: Math.sin(a) };
    if (shape === 'heart') p = heartPt(a);
    if (shape === 'star') p = starPt(i, n);
    return p;
  });
  return (
    <g opacity={fade}>
      <circle cx={x} cy={y} r={r * 1.15} fill={color} opacity={0.14 * (1 - k)} />
      {k < 0.1 && <circle cx={x} cy={y} r={50 + k * 500} fill="#fff" opacity={1 - k * 10} />}
      {shape === 'willow' ? dots.map((p, i) => {
        const ex = x + p.x * r;
        const ey = y + p.y * r + fall * 1.8 * (0.6 + 0.4 * Math.abs(p.x));
        return <path key={i} d={`M${x + p.x * r * 0.45} ${y + p.y * r * 0.45} Q${x + p.x * r * 0.85} ${y + p.y * r * 0.85} ${ex} ${ey}`} fill="none" stroke={i % 3 ? '#ffd27a' : color} strokeWidth={4 * (1 - k) + 1.5} strokeLinecap="round" />;
      }) : dots.map((p, i) => {
        const px = x + p.x * r;
        const py = y + p.y * r + fall;
        return (
          <g key={i}>
            {k < 0.55 && <line x1={x + p.x * r * 0.7} y1={y + p.y * r * 0.7 + fall * 0.7} x2={px} y2={py} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.7} />}
            <circle cx={px} cy={py} r={(i % 3 ? 13 : 17) * (1 - k * 0.6)} fill={color} opacity="0.28" />
            <circle cx={px} cy={py} r={(i % 3 ? 6 : 8.5) * (1 - k * 0.6)} fill={i % 4 === 0 ? '#fff' : color} />
          </g>
        );
      })}
      {shape === 'ring' && dots.map((p, i) => <circle key={`i${i}`} cx={x + p.x * r * 0.55} cy={y + p.y * r * 0.55 + fall} r={3.5 * (1 - k * 0.6)} fill="#fff" />)}
      {k > 0.35 && Array.from({ length: 10 }, (_, i) => <circle key={`c${i}`} className="fw-crackle" cx={x + (rnd(i + size) - 0.5) * r * 1.6} cy={y + (rnd(i + size + 7) - 0.5) * r * 1.4 + fall} r="3" fill="#fff" />)}
    </g>
  );
};

/** A rocket on its way up, with the shrinking ring that shows when to tap. p: 0..1 of the climb. */
export const Rocket = ({ from, to, p, color }) => {
  const q = Math.min(1, p);
  const x = from.x + (to.x - from.x) * q;
  const y = from.y + (to.y - from.y) * (q ** 0.9);
  const dx = (to.x - from.x) / Math.max(1, from.y - to.y);
  const late = Math.max(0, p - 1);
  return (
    <g>
      <circle cx={to.x} cy={to.y} r={34} fill="none" stroke={color} strokeWidth="5" strokeDasharray="10 8" opacity={0.85} />
      <circle cx={to.x} cy={to.y} r={34 + Math.max(0, 1 - p) * 80} fill="none" stroke="#fff" strokeWidth={3 + (1 - Math.min(1, p)) * 3} opacity={0.35 + 0.6 * Math.min(1, p)} />
       <line x1={x} y1={y} x2={x - dx * 120} y2={y + 120} stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.55" />
      <line x1={x} y1={y} x2={x - dx * 40} y2={y + 40} stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      {[0, 1, 2].map((i) => <circle key={i} cx={x - dx * (30 + i * 22) + (rnd(i + Math.floor(p * 40)) - 0.5) * 16} cy={y + 30 + i * 22} r={3} fill="#ffd27a" />)}
      <circle cx={x} cy={y - late * 30} r="22" fill={color} opacity="0.3" />
      <circle cx={x} cy={y - late * 30} r="12" fill={color} stroke="#fff" strokeWidth="4" />
    </g>
  );
};

const Tube = ({ x, color, combo, pulse }) => (
  <g transform={`translate(${x + 34} ${TUBE_Y})`}>
    <ellipse cy="30" rx="26" ry="7" fill="#000" opacity="0.35" />
    <path d="M-15 28 L-12 -34 L12 -34 L15 28 Z" fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
    <rect x="-15" y="-10" width="30" height="8" fill="#fff" opacity="0.7" />
    <ellipse cy="-34" rx="12" ry="5" fill="#1b1b2e" stroke={INK} strokeWidth="4" />
    {pulse > 0 && <circle cy="-40" r={10 + (1 - pulse) * 30} fill="#ffd27a" opacity={pulse} />}
    {combo >= 3 && <text y="-58" fontSize="26" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke={INK} strokeWidth="5" paintOrder="stroke">x{combo}</text>}
  </g>
);

const GRADE_TEXT = { perfect: 'PERFECT!', great: 'GREAT', good: 'OK', miss: 'fizzle…' };
const GRADE_SIZE = { perfect: 250, great: 185, good: 125 };

/** The scene, shared with the how-to. tubes: [{ key, x, look, name, color, combo, pose }]. bursts: [{ key, x, y, color, shape, k, size, grade }]. */
export function FireworksScene({ tubes, rockets, bursts, glow = 0, tint }) {
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <Harbor glow={glow} tint={tint} />
      {bursts.map((b) => (b.grade === 'miss' ? (
        <g key={b.key} opacity={Math.max(0, 1 - b.k)}>
          <circle cx={b.x} cy={b.y + b.k * 60} r={14 + b.k * 30} fill="#8a8aa0" opacity="0.5" />
          <text x={b.x} y={b.y - 40} fontSize="34" fontWeight="900" textAnchor="middle" fill="#b9b9cc" stroke={INK} strokeWidth="5" paintOrder="stroke">{GRADE_TEXT.miss}</text>
        </g>
      ) : (
        <g key={b.key}>
          <Burst x={b.x} y={b.y} color={b.color} shape={b.shape} k={b.k} size={b.size} />
          {b.k < 0.6 && <text x={b.x} y={b.y - 30 - b.k * 70} fontSize={b.grade === 'perfect' ? 46 : 34} fontWeight="900" textAnchor="middle" fill={b.grade === 'perfect' ? '#ffe066' : '#fff'} stroke={INK} strokeWidth="7" paintOrder="stroke" opacity={1 - b.k / 0.6}>{GRADE_TEXT[b.grade]}</text>}
        </g>
      )))}
      {rockets.map((r) => <Rocket key={r.key} from={{ x: r.fromX, y: TUBE_Y - 40 }} to={r.to} p={r.p} color={r.color} />)}
      {tubes.map((t, i) => (
        <g key={t.key}>
          <ScenePerson look={t.look} pose={t.pose} k={0} x={t.x - 12} y={1000} delay={i % 4} scale={0.34} />
          <Tube x={t.x} color={t.color} combo={t.combo} pulse={t.pulse || 0} />
          <PlayerTag name={t.name} x={t.x + 8} y={1030} color={t.color === '#f4f4ff' ? '#555' : '#1d1530'} />
        </g>
      ))}
    </svg>
  );
}

/** Fireworks Show on the TV. */
export default function FireworksStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const bursts = useRef([]);
  const beatRef = useRef({ show: -1, beat: -99, half: -99, launched: -1 });
  const prevRanks = useRef({});
  const elapsed = now - game.phaseAt;
  const show = SHOWS[game.show];
  const bm = beatMs(show);
  const inShow = game.phase === 'show';
  const t = inShow ? elapsed : -1;
  const tubesOrder = game.players.filter((p) => game.colors[p.cid] != null);
  const n = tubesOrder.length;
  const xOf = (cid) => tubeX(tubesOrder.findIndex((p) => p.cid === cid), n);
  const colorOf = (cid) => COLORS[game.colors[cid]]?.fill || '#fff';

  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'ready': bursts.current = []; prevRanks.current = Object.fromEntries(ranking(game).map((r) => [r.cid, r.rank])); sfx.night(); break;
        case 'hit': {
          const r = game.rockets.find((x) => x.id === e.rocket);
          if (r) bursts.current = [...bursts.current.filter((b) => now - b.at < 2600).slice(-40), { key: `h${r.id}`, rocket: r, grade: e.grade, at: now }];
          sfx.pop(e.grade === 'perfect' ? 1 : e.grade === 'great' ? 0.6 : 0.3);
          break;
        }
        case 'dud': {
          const r = game.rockets.find((x) => x.id === e.rocket);
          if (r) bursts.current = [...bursts.current.slice(-40), { key: `d${r.id}`, rocket: r, grade: 'miss', at: now }];
          sfx.dud();
          break;
        }
        case 'scores': if (e.bonus) sfx.soulDone(); sfx.banish(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
    // The beat: a kick on every beat (with a count-in) and a hi-hat on the off-beats.
    if (inShow) {
      const b = beatRef.current;
      if (b.show !== game.show) { b.show = game.show; b.beat = -99; b.half = -99; b.launched = -1; }
      const beat = Math.floor((t - LEAD_MS) / bm);
      const half = Math.floor((t - LEAD_MS) / (bm / 2));
      if (beat > b.beat && beat >= -4 && beat < show.beats) { b.beat = beat; sfx.kick(); }
      if (half > b.half && half % 2 && beat >= 0 && beat < show.beats) { b.half = half; sfx.hat(); }
      const launching = game.rockets.filter((r) => t >= r.at - RISE_MS && r.id > b.launched);
      if (launching.length) { b.launched = Math.max(...launching.map((r) => r.id)); sfx.launch(); }
    }
  });

  const tubes = tubesOrder.map((p, i) => {
    const look = players.find((x) => x.cid === p.cid)?.look;
    const mine = bursts.current.filter((b) => b.rocket.cid === p.cid && now - b.at < 600 && b.grade !== 'miss');
    return {
      key: p.cid,
      x: tubeX(i, n),
      look,
      name: p.name,
      color: colorOf(p.cid),
      combo: inShow ? game.combo[p.cid] || 0 : 0,
      pose: mine.length ? 'cheer' : game.phase === 'over' ? 'cheer' : 'stand',
      pulse: game.rockets.some((r) => r.cid === p.cid && t >= r.at - RISE_MS && t < r.at - RISE_MS + 250) ? 1 : 0,
    };
  });
  const rockets = inShow ? game.rockets.filter((r) => !game.judged[r.id] && t >= r.at - RISE_MS).map((r) => {
    const fromX = xOf(r.cid) + 34;
    return { key: r.id, fromX, to: rocketTarget(r, fromX), p: (t - (r.at - RISE_MS)) / RISE_MS, color: colorOf(r.cid) };
  }) : [];
  const shown = bursts.current.filter((b) => now - b.at < (b.grade === 'miss' ? 900 : 2000)).map((b) => {
    const fromX = xOf(b.rocket.cid) + 34;
    const to = rocketTarget(b.rocket, fromX);
    return { key: b.key, x: to.x, y: to.y, color: colorOf(b.rocket.cid), shape: b.rocket.shape, k: (now - b.at) / (b.grade === 'miss' ? 900 : 2000), size: (GRADE_SIZE[b.grade] || 120) * (b.rocket.finale ? 1.25 : 1), grade: b.grade };
  });
  const flash = shown.filter((b) => b.grade !== 'miss' && b.k < 0.15);
  const glow = flash.length ? Math.min(1, flash.length * 0.5) * (1 - flash[0].k / 0.15) : 0;
  const ranks = ranking(game).map((r) => ({ ...r, name: players.find((p) => p.cid === r.cid)?.name || game.players.find((p) => p.cid === r.cid)?.name || '?' }));
  const beatPulse = inShow && t > LEAD_MS - 4 * bm ? 1 - (((t - LEAD_MS) % bm) + bm) % bm / bm : 0;
  const finaleNow = show.finale && inShow && game.rockets.some((r) => r.finale && t >= r.at - RISE_MS - 600 && t < r.at + 800);
  const readyLeft = Math.ceil(Math.max(0, 3200 - elapsed) / 1000);

  return (
    <>
      <FireworksScene tubes={tubes} rockets={rockets} bursts={shown} glow={glow} tint={flash[0]?.color} />

      <div className="lq-hud lh-hud">
        <span className="lq-pill">🎆 Show {game.show + 1} of {SHOWS.length}</span>
        <span className="lq-pill">{show.name}</span>
        {inShow && <span className="lq-pill fw-beat" style={{ transform: `scale(${1 + beatPulse * 0.12})` }}>🥁 {show.bpm} BPM</span>}
      </div>

      {game.phase === 'ready' && (
        <div className="lc-card lh-floor fw-card" key={`s${game.show}`}>
          <div className="lc-card-kicker">Show {game.show + 1} of {SHOWS.length} · {show.bpm} BPM</div>
          <h2 className="lc-title">{show.name}</h2>
          <p>{show.finale ? 'Faster than ever, and at the end everyone fires together. Hit 70% of the finale for a team bonus!' : game.show === 0 ? 'Tap BOOM on your phone right as YOUR rocket hits its ring.' : show.halves ? 'Faster beat, and some rockets come in quick pairs!' : 'Faster beat. Keep your combo going!'}</p>
          <div className="fw-count">{readyLeft}</div>
        </div>
      )}
      {inShow && t < LEAD_MS && <div className="rr-banner fw-banner">Get ready… tap when <b>your</b> rocket hits its ring!</div>}
      {finaleNow && <div className="lh-result fw-finale">🎆 GRAND FINALE! 🎆</div>}

      {game.phase === 'scores' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After show {game.show + 1} of {SHOWS.length}</div>
          <h2 className="lc-title">{game.bonus ? `What a finale! +${FINALE_BONUS} each` : 'Ooooh! Aaaah!'}</h2>
          <Leaderboard ranks={ranks} prev={prevRanks.current} players={players} gains={Object.fromEntries(Object.entries(game.gains).filter(([, gain]) => gain > 0).map(([cid, gain]) => [cid, { gain }]))} />
        </div>
      )}

      {game.phase === 'over' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
