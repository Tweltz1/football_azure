import React, { useEffect, useMemo, useRef } from 'react';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { INK } from '../cartoon';
import {
  awards, DECIDE_MS, HAZARDS, MAX_STEPS, ranking, REVEAL_MS, RUNS, START_MS,
} from './rainbowRun';
import { Leaderboard, Podium } from './Results';

// Rainbow Run on the TV: green hills, a giant rainbow to climb, and a leprechaun guarding the pot of gold.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const rnd = (i) => { const x = Math.sin(i * 33.7 + 7.7) * 43758.5453; return x - Math.floor(x); };
const C = { x: 960, y: 1030, r: 700 };
const BANDS = ['#e8413a', '#f5872a', '#f8d02a', '#4cc25a', '#3a8ef0', '#5a52d6', '#9b4fd6'];
/** Where step i (0-based) sits on the rainbow. */
export const stepAt = (i) => {
  const a = Math.PI - ((i + 1) / (MAX_STEPS + 1)) * Math.PI;
  return { x: C.x + Math.cos(a) * (C.r - 40), y: C.y - Math.sin(a) * (C.r - 40) };
};
// Step cards sit just inside the arc, so the climbers standing on the step never cover them.
const cardAt = (i) => {
  const a = Math.PI - ((i + 1) / (MAX_STEPS + 1)) * Math.PI;
  return { x: C.x + Math.cos(a) * (C.r - 170), y: C.y - Math.sin(a) * (C.r - 170) };
};
const HOME = { x: 150, y: 1010 };

const coinPile = (n) => {
  let out = '';
  const k = Math.min(7, Math.max(1, Math.ceil(n / 2.5)));
  for (let i = 0; i < k; i += 1) {
    const x = (i % 3 - 1) * 22 + (Math.floor(i / 3) % 2) * 11;
    const y = -Math.floor(i / 3) * 14;
    out += `<ellipse cx="${x}" cy="${y}" rx="17" ry="8" fill="#f5c542" stroke="${INK}" stroke-width="3.5"/><ellipse cx="${x}" cy="${y - 3}" rx="10" ry="4" fill="#ffe58a"/>`;
  }
  return out;
};

const potArt = `<path d="M-60 -70 Q-74 -10 -40 0 L40 0 Q74 -10 60 -70 Z" fill="#23202b" stroke="${INK}" stroke-width="6"/>`
  + `<ellipse cx="0" cy="-70" rx="66" ry="16" fill="#3a3540" stroke="${INK}" stroke-width="6"/>`
  + Array.from({ length: 9 }, (_, i) => `<ellipse cx="${-44 + i * 11}" cy="${-80 - Math.abs(Math.sin(i * 1.7)) * 26}" rx="16" ry="8" fill="#f5c542" stroke="${INK}" stroke-width="3"/>`).join('')
  + '<circle class="lc-star" cx="-30" cy="-112" r="5" fill="#fff"/><circle class="lc-star" cx="28" cy="-104" r="4" fill="#fff"/>';

const leprechaun = `<ellipse cx="0" cy="0" rx="34" ry="8" fill="#000" fill-opacity=".25"/>`
  + `<path d="M-20 -6 L-16 -40 M20 -6 L16 -40" stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M-20 -6 L-16 -40 M20 -6 L16 -40" stroke="#2f7a3a" stroke-width="6" stroke-linecap="round"/>`
  + `<path d="M-30 -2 L-12 -2 M12 -2 L30 -2" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>`
  + `<path d="M-30 -40 L-28 -96 Q0 -108 28 -96 L30 -40 Z" fill="#2f9a4a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
  + `<rect x="-30" y="-56" width="60" height="10" fill="#23202b"/><rect x="-7" y="-58" width="14" height="14" fill="#f5c542" stroke="${INK}" stroke-width="3"/>`
  + `<circle cx="0" cy="-122" r="26" fill="#f4c9a0" stroke="${INK}" stroke-width="5"/>`
  + `<path d="M-26 -118 Q-30 -80 0 -78 Q30 -80 26 -118 Q14 -100 0 -104 Q-14 -100 -26 -118 Z" fill="#e0702a" stroke="${INK}" stroke-width="4"/>`
  + `<circle cx="-9" cy="-128" r="3.5" fill="${INK}"/><circle cx="9" cy="-128" r="3.5" fill="${INK}"/><path d="M-6 -114 Q0 -110 6 -114" stroke="${INK}" stroke-width="3" fill="none"/>`
  + `<path d="M-36 -142 L36 -142 L26 -150 L22 -196 L-22 -196 L-26 -150 Z" fill="#2f9a4a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
  + `<ellipse cx="0" cy="-144" rx="42" ry="8" fill="#2f9a4a" stroke="${INK}" stroke-width="5"/><rect x="-23" y="-164" width="46" height="10" fill="#23202b"/><rect x="-7" y="-166" width="14" height="14" fill="#f5c542" stroke="${INK}" stroke-width="3"/>`
  + `<path d="M-30 -60 Q-52 -74 -46 -96" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M-30 -60 Q-52 -74 -46 -96" stroke="#2f9a4a" stroke-width="6" fill="none" stroke-linecap="round"/>`;

export const Meadow = React.memo(() => (
  <g>
    <defs>
      <linearGradient id="rr-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5ab4ff" />
        <stop offset="1" stopColor="#c9ecff" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#rr-sky)" />
    {[[260, 170, 1], [1500, 130, 1.3], [880, 90, 0.8], [1780, 300, 0.7]].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="rr-cloud" style={{ animationDelay: `${-i * 7}s` }}>
        <ellipse cx="0" cy="0" rx="90" ry="40" fill="#fff" stroke={INK} strokeWidth="5" />
        <ellipse cx="-50" cy="-20" rx="50" ry="38" fill="#fff" stroke={INK} strokeWidth="5" />
        <ellipse cx="40" cy="-30" rx="60" ry="46" fill="#fff" stroke={INK} strokeWidth="5" />
        <ellipse cx="0" cy="6" rx="86" ry="32" fill="#fff" />
      </g>
    ))}
    <path d="M0 820 Q300 700 640 790 Q980 660 1320 780 Q1640 690 1920 760 L1920 1080 L0 1080 Z" fill="#6cc06a" stroke={INK} strokeWidth="6" />
    <path d="M0 920 Q420 820 860 900 Q1280 820 1920 900 L1920 1080 L0 1080 Z" fill="#4caa52" stroke={INK} strokeWidth="6" />
    {Array.from({ length: 40 }, (_, i) => (
      <text key={i} x={rnd(i) * 1920} y={940 + rnd(i + 5) * 130} fontSize={18 + rnd(i + 2) * 16} opacity="0.85">☘</text>
    ))}
    {/* the cottage everyone runs home to */}
    <g transform={`translate(${HOME.x} ${HOME.y})`}>
      <rect x="-90" y="-120" width="180" height="120" fill="#f4ead2" stroke={INK} strokeWidth="6" />
      <path d="M-110 -116 L0 -200 L110 -116 Z" fill="#c9a24a" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <rect x="-24" y="-70" width="48" height="70" rx="6" fill="#2f9a4a" stroke={INK} strokeWidth="5" />
      <rect x="40" y="-96" width="36" height="32" fill="#ffd27a" stroke={INK} strokeWidth="4" />
      <text y="-140" fontSize="26" fontWeight="900" textAnchor="middle" fill={INK}>HOME</text>
    </g>
  </g>
));

const Rainbow = ({ fade, shake }) => (
  <g opacity={1 - fade} transform={shake ? `translate(${Math.sin(shake * 60) * 10} ${fade * 120})` : undefined}>
    {BANDS.map((c, i) => (
      <path key={c} d={`M${C.x - C.r + i * 24} ${C.y} A${C.r - i * 24} ${C.r - i * 24} 0 0 1 ${C.x + C.r - i * 24} ${C.y}`} fill="none" stroke={c} strokeWidth="26" />
    ))}
    <path d={`M${C.x - C.r - 13} ${C.y} A${C.r + 13} ${C.r + 13} 0 0 1 ${C.x + C.r + 13} ${C.y}`} fill="none" stroke={INK} strokeWidth="6" />
    <path d={`M${C.x - C.r + 6 * 24 + 13} ${C.y} A${C.r - 6 * 24 - 13} ${C.r - 6 * 24 - 13} 0 0 1 ${C.x + C.r - 6 * 24 - 13} ${C.y}`} fill="none" stroke={INK} strokeWidth="6" />
  </g>
);

/** One flipped step on the rainbow. */
const StepCard = React.memo(({ step, i, pop }) => {
  const p = cardAt(i);
  const coins = useMemo(() => (step.kind !== 'hazard' ? coinPile(step.value) : ''), [step.kind, step.value]);
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${pop})`}>
      <circle r="44" fill={step.kind === 'hazard' ? '#3a2a4a' : step.kind === 'pot' ? '#fff3b0' : '#fff6e3'} stroke={INK} strokeWidth="6" />
      {step.kind === 'hazard' ? (
        <text y="4" fontSize="50" textAnchor="middle" dominantBaseline="central">{HAZARDS[step.hazard].icon}</text>
      ) : (
        <>
          <g transform="translate(0 14)" dangerouslySetInnerHTML={{ __html: coins }} />
          <text y="-18" fontSize="26" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill={INK}>{step.kind === 'pot' ? '🍀' : ''}{step.value}</text>
        </>
      )}
      {step.left > 0 && <g transform="translate(36 -36)"><circle r="17" fill="#f5c542" stroke={INK} strokeWidth="4" /><text y="1" fontSize="17" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill={INK}>{step.left}</text></g>}
    </g>
  );
});

/** The scene. steps: flipped steps. climbers / home: [{ key, look, name, pose, vip }]. crashK: 0..1 collapse. */
export function RainbowScene({ steps, climbers, home, crashK = 0, now, flipK = 1 }) {
  const at = steps.length ? stepAt(steps.length - 1) : { x: HOME.x + 140, y: HOME.y };
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <Meadow />
      <Rainbow fade={crashK * 0.85} shake={crashK > 0 && crashK < 0.6 ? now / 1000 : 0} />
      {/* the pot of gold and its keeper */}
      <g transform={`translate(${C.x + C.r - 10} ${C.y - 10})`}><g dangerouslySetInnerHTML={{ __html: potArt }} /></g>
      <g transform={`translate(${C.x + C.r + 120} ${C.y + 20}) scale(0.9)`}><g className="lc-bob" dangerouslySetInnerHTML={{ __html: leprechaun }} /></g>
      {steps.map((st, i) => <StepCard key={i} step={st} i={i} pop={i === steps.length - 1 ? 0.4 + 0.6 * ease(flipK) : crashK ? 1 - crashK * 0.5 : 1} />)}
      {climbers.map((c, i) => {
        const x = at.x + ((i % 4) - 1.5) * 34;
        const y = at.y + 4 + Math.floor(i / 4) * 16 + crashK * crashK * 700;
        return (
          <g key={c.key}>
            <ScenePerson look={c.look} pose={c.pose} k={0} x={x} y={y} delay={i % 4} scale={0.26} />
          </g>
        );
      })}
      {home.map((c, i) => {
        // the folks who made it home cheer from the meadow, spaced so name tags never overlap
        const x = 520 + (i % 7) * 135 + Math.floor(i / 7) * 60;
        const y = 1050 - Math.floor(i / 7) * 70;
        return (
          <g key={c.key}>
            <ScenePerson look={c.look} pose={c.pose} k={0} x={x} y={y} delay={i % 4} scale={0.34} />
            <PlayerTag name={`${c.name} · ${c.bank}`} vip={c.vip} x={x} y={y + 2} />
          </g>
        );
      })}
    </svg>
  );
}

/** Rainbow Run on the TV. */
export default function RainbowStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const prevRanks = useRef({});
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'run': sfx.night(); break;
        case 'decide': sfx.tick(); break;
        case 'chose': sfx.hit(); break;
        case 'home': sfx.join(); break;
        case 'coins': sfx.banish(); break;
        case 'pot': sfx.soulDone(); sfx.banish(); break;
        case 'hazard': sfx.spawn(); break;
        case 'crash': sfx.boss(); sfx.candle(); break;
        case 'top': sfx.won(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
  });

  const ranks = ranking(game).map((r) => ({ ...r, name: players.find((p) => p.cid === r.cid)?.name || '?' }));
  if (game.phase === 'runEnd' && elapsed < 50) prevRanks.current = Object.fromEntries(ranks.map((r) => [r.cid, r.rank]));
  const crashed = game.crash && (game.phase === 'reveal' || game.phase === 'runEnd');
  const crashK = crashed ? (game.phase === 'runEnd' ? 1 : ease((elapsed - 400) / 1800)) : 0;
  const climbSet = new Set(crashed ? game.crash.who : game.climbing);
  const climbers = players.filter((p) => climbSet.has(p.cid)).map((p) => ({
    key: p.cid, look: p.look, name: p.name, pose: crashed ? 'scared' : game.phase === 'decide' && game.choices[p.cid] ? 'wave' : 'stand',
  }));
  const home = players.filter((p) => !climbSet.has(p.cid)).map((p, i) => ({
    key: p.cid, look: p.look, name: p.name, bank: game.bank[p.cid] || 0, vip: i === 0, pose: game.went.includes(p.cid) || (game.top || []).includes(p.cid) ? 'cheer' : 'stand',
  }));
  const flip = game.phase === 'reveal' ? game.steps[game.steps.length - 1] : null;
  const fresh = game.phase === 'reveal' && game.flip;
  const warn = Object.keys(game.seen).filter((h) => game.seen[h] === 1);

  return (
    <>
      <RainbowScene steps={game.steps} climbers={climbers} home={home} crashK={crashK} now={now} flipK={fresh ? elapsed / 500 : 1} />
      <div className="lq-hud lh-hud">
        <span className="lq-pill">🌈 Rainbow {game.run + 1} of {RUNS}</span>
        <span className="lq-pill">Step {game.steps.length} / {MAX_STEPS}</span>
        <span className="lq-pill">🧗 {game.climbing.length} climbing</span>
      </div>
      {(game.phase === 'decide' || game.phase === 'reveal') && (
        <div className="rr-hazards">
          <b>Watch out!</b>
          {Object.entries(HAZARDS).map(([id, h]) => (
            <span key={id} className={warn.includes(id) ? 'is-warn' : ''} title={h.name}>{h.icon}</span>
          ))}
          <small>A second one knocks the rainbow down!</small>
        </div>
      )}

      {game.phase === 'start' && (
        <div className="lc-card lh-floor" key={`s${game.run}`}>
          <div className="lc-card-kicker">Rainbow {game.run + 1} of {RUNS}</div>
          <h2 className="lc-title">Climb for the gold!</h2>
          <p>Every step, pick <b>CLIMB</b> or <b>HEAD HOME</b> on your phone. Only gold you bring home counts.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((START_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {game.phase === 'decide' && (
        <div className="rr-banner">Climb or head home? <b>{Object.keys(game.choices).length} / {game.climbing.length}</b> picked · ⏳ {Math.ceil(Math.max(0, DECIDE_MS - elapsed) / 1000)}</div>
      )}

      {game.phase === 'reveal' && elapsed < REVEAL_MS && (
        <div className={`lh-result rr-result ${crashed ? 'is-bad' : 'is-safe'}`} key={`f${game.run}-${game.steps.length}`}>
          {crashed ? `${HAZARDS[game.crash.hazard].icon} Another ${HAZARDS[game.crash.hazard].name}! The rainbow falls!`
            : game.top ? '🏆 The end of the rainbow! +10 each'
              : !fresh ? 'Everyone headed home!'
                : flip.kind === 'hazard' ? `${HAZARDS[flip.hazard].icon} A ${HAZARDS[flip.hazard].name}… careful!`
                  : flip.kind === 'pot' ? `🍀 A pot of gold! ${flip.share} each`
                    : `💰 ${flip.value} gold · ${flip.share} each`}
        </div>
      )}

      {game.phase === 'runEnd' && (
        <div className="lc-card lq-scores">
          <div className="lc-card-kicker">After rainbow {game.run + 1} of {RUNS}</div>
          <h2 className="lc-title">{game.crash ? 'Down came the rainbow!' : 'Safe and sound!'}</h2>
          <Leaderboard ranks={ranks} prev={prevRanks.current} players={players} />
        </div>
      )}

      {game.phase === 'over' && <Podium ranks={ranks} players={players} awards={awards(game)} onLobby={onLobby} onAgain={onAgain} />}
    </>
  );
}
