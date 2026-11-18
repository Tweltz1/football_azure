import React, { useEffect, useMemo, useRef } from 'react';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { INK } from '../cartoon';
import {
  awards, BELT, DONE_MS, INTRO_MS, JOB_INFO, JOBS, ROUNDS, roundsSaved, totalDelivered, ZONES, zoneOf,
} from './giftRush';
import { choiceArt, presentArt, sleighArt, workshopArt } from './giftArt';

// Gift Wrap Rush on the TV: Santa's workshop with the conveyor belt across the middle.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
const ZONE_TINT = { box: '#c8935a', wrap: '#d33b3b', bow: '#ff7fbf', tag: '#f2b632' };
const mid = (job) => (ZONES[job][0] + ZONES[job][1]) / 2;
const SLEIGH = { x: 1800, y: 860 };

export const WorkshopBackdrop = React.memo(() => <g dangerouslySetInnerHTML={{ __html: workshopArt }} />);

const Present = React.memo(({ toy, box, wrap, bow, tag }) => {
  const markup = useMemo(() => presentArt(toy, { box, wrap, bow, tag }), [toy, box, wrap, bow, tag]);
  return <g dangerouslySetInnerHTML={{ __html: markup }} />;
});

const Choice = React.memo(({ job, id }) => {
  const markup = useMemo(() => choiceArt(job, id), [job, id]);
  return <g dangerouslySetInnerHTML={{ __html: markup }} />;
});

/** The order card floating over a present: what it needs, and what's been done so far. */
const OrderCard = ({ p, x, zone }) => (
  <g transform={`translate(${Math.max(160, x)} ${p.id % 2 ? 540 : 430})`}>
    {!(p.id % 2) && <path d="M0 50 V150" stroke="#fff6e3" strokeWidth="5" strokeDasharray="8 8" />}
    <path d="M0 60 L-12 46 L12 46 Z" fill="#fff6e3" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <rect x="-150" y="-46" width="300" height="94" rx="16" fill="#fff6e3" stroke={INK} strokeWidth="5" />
    {JOBS.map((j, i) => {
      const cx = -108 + i * 72;
      const bad = p.wrong[j] || p.missed[j];
      const good = p.done[j] && !p.wrong[j];
      const now = zone === j && !p.done[j];
      return (
        <g key={j} transform={`translate(${cx} 0)`}>
          {now && <rect x="-34" y="-40" width="68" height="80" rx="12" fill="#ffe066" className="lc-glow" />}
          <g transform="scale(0.74)" opacity={good || bad ? 0.45 : 1}><Choice job={j} id={p.order[j]} /></g>
          {good && <g><circle cx="20" cy="22" r="14" fill="#3ddc97" stroke={INK} strokeWidth="3" /><path d="M14 22 L19 27 L27 16" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></g>}
          {bad && <g><circle cx="20" cy="22" r="14" fill="#ff5a4e" stroke={INK} strokeWidth="3" /><path d="M14 16 L26 28 M26 16 L14 28" stroke={INK} strokeWidth="4" strokeLinecap="round" /></g>}
        </g>
      );
    })}
  </g>
);

const Belt = ({ now, speed }) => {
  const shift = ((now / 1000) * speed) % 60;
  return (
    <g>
      {/* the belt's front skirt with each station's name */}
      <rect x={BELT.x0 - 20} y={BELT.y + 18} width={BELT.end - BELT.x0 + 40} height="78" fill="#3a3f4f" stroke={INK} strokeWidth="7" />
      {JOBS.map((j) => (
        <g key={j}>
          <rect x={ZONES[j][0] + 8} y={BELT.y + 28} width={ZONES[j][1] - ZONES[j][0] - 16} height="58" rx="10" fill={ZONE_TINT[j]} stroke={INK} strokeWidth="4" />
          <text x={mid(j)} y={BELT.y + 58} fontSize="36" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#fff" stroke={INK} strokeWidth="6" paintOrder="stroke" style={{ fontFamily: 'var(--lc-spooky), Arial Black, Arial' }}>{JOB_INFO[j].icon} {JOB_INFO[j].label}</text>
        </g>
      ))}
      {/* the moving belt surface */}
      <rect x={BELT.x0 - 20} y={BELT.y - 6} width={BELT.end - BELT.x0 + 40} height="26" rx="13" fill="#23262f" stroke={INK} strokeWidth="6" />
      <path d={`M${BELT.x0 - 10} ${BELT.y + 7} H${BELT.end + 10}`} stroke="#4a4f60" strokeWidth="8" strokeDasharray="30 30" strokeDashoffset={-shift} />
      {[BELT.x0 - 6, BELT.end + 6].map((x) => <circle key={x} cx={x} cy={BELT.y + 7} r="16" fill="#9a9fb0" stroke={INK} strokeWidth="5" />)}
      {Object.values(ZONES).slice(1).map(([x]) => <path key={x} d={`M${x} ${BELT.y - 30} V${BELT.y + 96}`} stroke="#fff" strokeWidth="4" strokeDasharray="10 10" opacity="0.6" />)}
      {/* legs */}
      {[300, 800, 1300, 1650].map((x) => <rect key={x} x={x - 14} y={BELT.y + 96} width="28" height="70" fill="#5a5f70" stroke={INK} strokeWidth="5" />)}
    </g>
  );
};

/** Where each player stands: in front of the belt, under their first station. */
export const elfSpots = (players, jobs) => {
  const per = {};
  return players.map((p) => {
    const job = (jobs[p.cid] || [])[0] || 'box';
    const k = per[job] || 0;
    per[job] = k + 1;
    const col = [0, -1, 1, -2, 2][k % 5];
    return { cid: p.cid, job, x: mid(job) + col * 100, y: 1025 - (k % 2) * 8 };
  });
};

/** Everything in the workshop. presents: engine presents. elves: [{ key, x, y, look, name, pose, vip, delay, jobs }]. */
export function RushScene({ presents, elves, delivered, now, speed, flashes = [] }) {
  const pile = Math.min(9, delivered);
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <WorkshopBackdrop />
      {/* the sleigh, filling up */}
      <g transform={`translate(${SLEIGH.x} ${SLEIGH.y})`}>
        {Array.from({ length: pile }, (_, i) => (
          <rect key={i} x={-64 + (i % 3) * 46} y={-82 - Math.floor(i / 3) * 36} width="42" height="36" rx="4" fill={['#d33b3b', '#2f9a55', '#2f6bff', '#f2b632'][i % 4]} stroke={INK} strokeWidth="4" />
        ))}
        <g transform="scale(0.85)" dangerouslySetInnerHTML={{ __html: sleighArt }} />
      </g>
      {/* the coal bucket */}
      <g transform="translate(1660 1000)">
        <path d="M-46 -60 L46 -60 L36 0 L-36 0 Z" fill="#6a6f7a" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        <ellipse cx="0" cy="-62" rx="44" ry="10" fill="#22222a" stroke={INK} strokeWidth="5" />
        <text y="-24" fontSize="20" fontWeight="900" textAnchor="middle" fill="#fff">COAL</text>
      </g>
      <Belt now={now} speed={speed} />
      {presents.map((p) => {
        let x = p.x;
        let y = BELT.y - 6;
        let s = 1;
        let rot = 0;
        if (now - p.at < 450) y -= (1 - ease((now - p.at) / 450)) * 160;
        if (p.fate === 'sleigh') {
          const k = ease((now - p.fateAt) / 700);
          x = BELT.end + (SLEIGH.x - 40 - BELT.end) * k;
          y = BELT.y - 6 - Math.sin(k * Math.PI) * 180 + (SLEIGH.y - 90 - BELT.y) * k;
          s = 1 - 0.55 * k;
          rot = k * 25;
          if (k >= 1) return null;
        }
        if (p.fate === 'coal') {
          const k = (now - p.fateAt) / 700;
          x = BELT.end - 30 * Math.min(1, k);
          y = BELT.y - 6 + Math.min(1, k * k) * 230;
          s = 1 - 0.4 * Math.min(1, k);
          rot = -40 * Math.min(1, k);
          if (k >= 1) return null;
        }
        const flash = flashes.find((f) => f.present === p.id && now - f.at < 700);
        return (
          <g key={p.id}>
            <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={p.fate === 'coal' ? 0.75 : 1}>
              <Present toy={p.toy} box={p.done.box} wrap={p.done.wrap} bow={p.done.bow} tag={p.done.tag} />
            </g>
            {flash && (
              <text x={x} y={y - 160 - 40 * ease((now - flash.at) / 700)} fontSize="64" fontWeight="900" textAnchor="middle" fill={flash.ok ? '#3ddc97' : '#ff5a4e'} stroke={INK} strokeWidth="7" paintOrder="stroke" opacity={1 - ease((now - flash.at - 300) / 400)}>{flash.ok ? '✓' : '✗'}</text>
            )}
          </g>
        );
      })}
      {presents.filter((p) => !p.fate && now - p.at > 300).map((p) => <OrderCard key={`o${p.id}`} p={p} x={p.x} zone={zoneOf(p.x)} />)}
      {elves.map((e) => (
        <g key={e.key}>
          <ScenePerson look={e.look} pose={e.pose || 'stand'} k={0} x={e.x} y={e.y} delay={e.delay || 0} scale={0.47} />
          <PlayerTag name={`${(e.jobs || []).map((j) => JOB_INFO[j].icon).join('')} ${e.name}`} vip={e.vip} x={e.x} y={e.y + 6} />
        </g>
      ))}
    </svg>
  );
}

/** Gift Wrap Rush on the TV. */
export default function RushStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const flashes = useRef([]);
  const poses = useRef({});
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': sfx.night(); break;
        case 'go': sfx.whoosh(); break;
        case 'spawn': sfx.spawn(); break;
        case 'good':
          sfx.hit();
          flashes.current = [...flashes.current.slice(-12), { present: e.present, ok: true, at: performance.now() }];
          poses.current[e.by] = { pose: 'throw', until: performance.now() + 450 };
          break;
        case 'oops':
          sfx.fizzle();
          flashes.current = [...flashes.current.slice(-12), { present: e.present, ok: false, at: performance.now() }];
          poses.current[e.by] = { pose: 'scared', until: performance.now() + 700 };
          break;
        case 'sleigh': sfx.banish(); break;
        case 'coal': sfx.candle(); break;
        case 'saved': case 'over': sfx.won(); break;
        case 'short': sfx.lost(); break;
        default: break;
      }
    });
  });

  const plan = ROUNDS[game.round];
  const spots = elfSpots(players, game.jobs);
  const result = game.phase === 'done' ? game.results[game.round] : null;
  const elves = spots.map((s, i) => {
    const p = players.find((x) => x.cid === s.cid);
    const temp = poses.current[s.cid];
    let pose = temp && temp.until > now ? temp.pose : 'stand';
    if (result) pose = result.saved ? 'cheer' : 'scared';
    if (game.phase === 'over') pose = 'cheer';
    return { key: s.cid, x: s.x, y: s.y, look: p.look, name: p.name, pose, vip: i === 0, delay: i % 4, jobs: game.jobs[s.cid] };
  });

  return (
    <>
      <RushScene presents={game.presents} elves={elves} delivered={game.delivered} now={now} speed={game.phase === 'play' ? plan.speed : 0} flashes={flashes.current} />

      <div className="lq-hud lh-hud">
        <span className="lq-pill">Round {game.round + 1} of {ROUNDS.length}</span>
        <span className="lq-pill">🎁 <b>{game.delivered}</b> / {plan.goal} on the sleigh</span>
        <span className="lq-pill">🪨 {game.coal}</span>
        <span className="lq-pill">{game.score.toLocaleString()} pts</span>
      </div>

      {game.phase === 'intro' && (
        <div className="lc-card lh-floor" key={`r${game.round}`}>
          <div className="lc-card-kicker">Round {game.round + 1} of {ROUNDS.length} · {plan.presents} presents</div>
          <h2 className="lc-title">{plan.title}</h2>
          <p>Get <b>{plan.goal}</b> perfect presents onto the sleigh!</p>
          <p className="lh-small">Your station is on your phone. When a present reaches your part of the belt, tap what its card asks for.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((INTRO_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {result && elapsed > 400 && elapsed < DONE_MS && (
        <div className={`lh-result ${result.saved ? 'is-safe' : 'is-bad'}`}>
          {result.delivered === result.presents ? 'Every present perfect! 🎅' : result.saved ? `Ho ho ho! ${result.delivered} on the sleigh` : `Not enough! ${result.delivered} of ${result.goal}`}
        </div>
      )}

      {game.phase === 'over' && elapsed > 900 && (
        <div className="lc-card lc-end won">
          <h2 className="lc-title">{roundsSaved(game) === ROUNDS.length ? 'Christmas is saved!' : 'The sleigh takes off!'}</h2>
          <p>The workshop wrapped <b>{totalDelivered(game)}</b> perfect presents and hit the goal in <b>{roundsSaved(game)}</b> of {ROUNDS.length} rounds. Team score: <b>{game.score.toLocaleString()}</b></p>
          <div className="lq-award-chips">
            {awards(game).map((a) => {
              const p = players.find((x) => x.cid === a.cid);
              return p ? <span key={a.title}>🏆 <b>{a.title}</b> {p.name} <small>({a.blurb})</small></span> : null;
            })}
          </div>
          <div className="lc-end-actions">
            <button type="button" className="lc-btn" onClick={onLobby}>Back to the lobby</button>
            <button type="button" className="lc-btn lc-btn-ghost" onClick={onAgain}>Play again</button>
          </div>
        </div>
      )}
    </>
  );
}
