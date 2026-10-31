import React, { useEffect, useMemo, useRef } from 'react';
import Person from '../Person';
import { monsterMarkup } from '../monsters';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import {
  awards, COLORS, FLOOR_MS, FLOORS, LANTERNS, SYMBOLS, VOTE_MS,
} from './hallway';

const DOOR_W = 230;
const DOOR_H = 400;
const DOOR_BASE = 830;
export const doorX = (i, n) => 960 + (i - (n - 1) / 2) * Math.min(330, 1500 / n);
const colorOf = (id) => COLORS.find((c) => c.id === id)?.hex || '#888';
const iconOf = (id) => SYMBOLS.find((x) => x.id === id)?.icon || '?';
const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };

const Window = ({ kind, glow }) => {
  const fill = glow ? '#ffe9a8' : '#2a2140';
  if (kind === 'round') return <circle cx="0" cy="-310" r="40" fill={fill} stroke="#16122b" strokeWidth="6" />;
  if (kind === 'arch') return <path d="M-38 -270 L-38 -320 L0 -362 L38 -320 L38 -270 Z" fill={fill} stroke="#16122b" strokeWidth="6" strokeLinejoin="round" />;
  return <rect x="-40" y="-350" width="80" height="80" rx="6" fill={fill} stroke="#16122b" strokeWidth="6" />;
};

/** One door. open: 0 closed .. 1 wide open. inside: 'safe' | 'monster' | null. */
export const Door = ({ door, index, x, open = 0, inside, monster, highlight, dim }) => {
  const markup = useMemo(() => (monster ? monsterMarkup(monster) : ''), [monster]);
  return (
    <g transform={`translate(${x} ${DOOR_BASE})`} opacity={dim ? 0.45 : 1}>
      {highlight && <rect x={-DOOR_W / 2 - 22} y={-DOOR_H - 22} width={DOOR_W + 44} height={DOOR_H + 22} rx="18" fill="none" stroke="#ffe066" strokeWidth="10" className="lc-glow" />}
      <rect x={-DOOR_W / 2 - 14} y={-DOOR_H - 14} width={DOOR_W + 28} height={DOOR_H + 14} rx="10" fill="#3b2a1e" stroke="#16122b" strokeWidth="6" />
      {/* the doorway behind the door */}
      <rect x={-DOOR_W / 2} y={-DOOR_H} width={DOOR_W} height={DOOR_H} fill={inside === 'safe' ? '#ffe9a8' : '#07050f'} />
      {inside === 'safe' && open > 0.3 && (
        <g opacity={ease((open - 0.3) / 0.5)}>
          {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={-DOOR_W / 2 + 20 + k * 12} y={-60 - k * 60} width={DOOR_W - 40 - k * 24} height="20" fill="#d9b46a" stroke="#16122b" strokeWidth="4" />)}
          <text y={-DOOR_H + 70} fontSize="56" textAnchor="middle">⬆️</text>
        </g>
      )}
      {/* the door itself, swinging open on its left hinge */}
      <g transform={`translate(${-DOOR_W / 2} 0) scale(${1 - 0.86 * open} 1) translate(${DOOR_W / 2} 0)`}>
        <rect x={-DOOR_W / 2} y={-DOOR_H} width={DOOR_W} height={DOOR_H} rx="6" fill={colorOf(door.color)} stroke="#16122b" strokeWidth="6" />
        <rect x={-DOOR_W / 2 + 22} y={-DOOR_H + 140} width={DOOR_W - 44} height={DOOR_H - 170} rx="6" fill="none" stroke="#16122b" strokeWidth="4" opacity="0.35" />
        <Window kind={door.window} glow={false} />
        <text y="-150" fontSize="86" textAnchor="middle" dominantBaseline="central">{iconOf(door.symbol)}</text>
        <circle cx={DOOR_W / 2 - 30} cy="-170" r="10" fill="#f5c542" stroke="#16122b" strokeWidth="4" />
      </g>
      {inside === 'monster' && open > 0.3 && (
        <g transform={`translate(30 -10) scale(${0.8 + 0.8 * ease((open - 0.3) / 0.5)})`} dangerouslySetInnerHTML={{ __html: markup }} />
      )}
      <g transform="translate(0 44)">
        <circle r="30" fill="#fff6e3" stroke="#16122b" strokeWidth="5" />
        <text y="2" fontSize="34" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">{index + 1}</text>
      </g>
    </g>
  );
};

export const HallBackdrop = ({ floor = 1 }) => (
  <g>
    <defs>
      <pattern id="lh-paper" width="80" height="80" patternUnits="userSpaceOnUse">
        <rect width="80" height="80" fill="#2b1838" />
        <path d="M40 0 V80" stroke="#36204a" strokeWidth="18" />
        <circle cx="40" cy="40" r="6" fill="#4a2d60" />
      </pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#lh-paper)" />
    <rect y="0" width="1920" height="90" fill="#1a0f24" />
    <path d="M0 90 H1920" stroke="#16122b" strokeWidth="8" />
    <rect y="860" width="1920" height="220" fill="#4a2f22" />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${i * 170} 860 L${i * 170 - 120} 1080`} stroke="#3a2419" strokeWidth="6" />)}
    <path d="M0 860 H1920" stroke="#16122b" strokeWidth="8" />
    <rect y="800" width="1920" height="60" fill="#3b2a1e" stroke="#16122b" strokeWidth="5" />
    {/* cobwebs */}
    {[0, 1].map((side) => (
      <g key={side} transform={side ? 'translate(1920 90) scale(-1 1)' : 'translate(0 90)'} stroke="#cfc6e6" strokeWidth="2" fill="none" opacity="0.45">
        <path d="M0 0 L160 160 M0 0 L80 190 M0 0 L190 70" />
        <path d="M40 40 Q70 25 62 12 M80 80 Q120 60 112 32 M120 120 Q170 95 158 54" />
      </g>
    ))}
    {/* sconces */}
    {[150, 1770].map((x) => (
      <g key={x} transform={`translate(${x} 380)`}>
        <rect x="-20" y="0" width="40" height="70" rx="6" fill="#8d6a3a" stroke="#16122b" strokeWidth="5" />
        <rect x="-10" y="-46" width="20" height="46" rx="4" fill="#f4ead2" stroke="#16122b" strokeWidth="4" />
        <path className="lc-flame" d="M0 -84 Q14 -64 0 -52 Q-14 -64 0 -84 Z" fill="#ffb33a" stroke="#16122b" strokeWidth="3" />
      </g>
    ))}
    <g transform="translate(960 46)">
      <rect x="-150" y="-30" width="300" height="60" rx="10" fill="#8d6a3a" stroke="#16122b" strokeWidth="5" />
      <text y="2" fontSize="32" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b" fontFamily="Creepster, Arial Black, Arial">FLOOR {floor}</text>
    </g>
  </g>
);

const standAt = (i, n) => {
  const w = Math.min(140, 1600 / Math.max(1, n));
  return { x: 960 + (i - (n - 1) / 2) * w, y: 1040 };
};

/** Haunted Hallway on the TV. */
export default function HallwayStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'floor': sfx.night(); break;
        case 'voted': sfx.hit(); break;
        case 'safe': window.setTimeout(() => sfx.banish(), 600); break;
        case 'monster': window.setTimeout(() => { sfx.boss(); sfx.candle(); }, 600); break;
        case 'won': sfx.won(); break;
        case 'lost': sfx.lost(); break;
        default: break;
      }
    });
  });

  const { room } = game;
  const n = room.doors.length;
  const chosen = game.phase === 'reveal' || game.phase === 'won' || game.phase === 'lost' ? game.chosen : null;
  const openK = chosen ? ease((elapsed - 500) / 900) : 0;
  const guideNames = game.guides.map((cid) => players.find((p) => p.cid === cid)?.name).filter(Boolean);
  const voteHeads = (i) => Object.entries(game.votes).filter(([, v]) => v.door === i).map(([cid]) => cid);
  const poseFor = (cid) => {
    if (game.phase === 'won') return 'cheer';
    if (game.phase === 'lost') return 'scared';
    if (chosen && elapsed > 900) return chosen.safe ? 'cheer' : 'scared';
    if (game.phase === 'vote' && game.votes[cid]) return 'wave';
    return 'stand';
  };
  const left = game.phase === 'vote' ? Math.max(0, VOTE_MS - elapsed) : 0;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <HallBackdrop floor={game.floor} />
        {room.doors.map((d, i) => (
          <Door
            key={`${game.floor}-${i}`}
            door={d}
            index={i}
            x={doorX(i, n)}
            open={chosen && chosen.door === i ? openK : 0}
            inside={chosen && chosen.door === i ? (chosen.safe ? 'safe' : 'monster') : null}
            monster={room.monster}
            highlight={chosen && !chosen.safe && i === room.safe && elapsed > 2200}
            dim={chosen && elapsed > 2200 && i !== chosen.door && i !== room.safe}
          />
        ))}
        {players.map((p, i) => {
          const s = standAt(i, players.length);
          const guide = game.guides.includes(p.cid);
          return (
            <g key={p.cid}>
              <ScenePerson look={p.look} pose={poseFor(p.cid)} k={0} x={s.x} y={s.y} delay={i % 4} scale={0.42} />
              <PlayerTag name={`${guide ? '🔦 ' : ''}${p.name}`} vip={i === 0} x={s.x} y={s.y + 4} color={guide ? '#8a5a12' : undefined} />
            </g>
          );
        })}
        {chosen && !chosen.safe && elapsed > 900 && elapsed < 2600 && <rect width="1920" height="1080" fill="#ff2040" opacity={0.25 * (1 - (elapsed - 900) / 1700)} />}
      </svg>

      <div className="lq-hud lh-hud">
        <span className="lq-pill">Floor {game.floor} of {FLOORS}</span>
        <span className="lq-pill">{'🏮'.repeat(Math.max(0, game.lanterns))}<span className="lh-out">{'🏮'.repeat(Math.max(0, LANTERNS - game.lanterns))}</span></span>
        <span className="lq-pill">{game.score.toLocaleString()} pts</span>
      </div>

      {game.phase === 'vote' && (
        <>
          <div className="lh-banner">🔦 Guides: <b>{guideNames.join(' & ')}</b>. Read your clues out loud!</div>
          <div className="lh-timer"><span style={{ width: `${(left / VOTE_MS) * 100}%` }} /><b>{Math.ceil(left / 1000)}</b></div>
        </>
      )}

      {(game.phase === 'vote' || chosen) && (
        <div className="lh-votes">
          {room.doors.map((d, i) => {
            const heads = voteHeads(i);
            return (
              <div key={i} className="lh-vote" style={{ left: `${(doorX(i, n) / 1920) * 100}%` }}>
                {heads.slice(0, 6).map((cid) => {
                  const p = players.find((x) => x.cid === cid);
                  return p ? <Person key={cid} look={p.look} view="head" /> : null;
                })}
                {heads.length > 6 && <b>+{heads.length - 6}</b>}
              </div>
            );
          })}
        </div>
      )}

      {game.phase === 'floor' && (
        <div className="lc-card lh-floor" key={`f${game.floor}`}>
          <div className="lc-card-kicker">{game.floor === FLOORS ? 'The top floor!' : `${n} doors · ${room.clues.length} clues`}</div>
          <h2 className="lc-title">Floor {game.floor}</h2>
          <p>🔦 Your guides: <b>{guideNames.join(' & ')}</b></p>
          <p className="lh-small">Only one door is safe. The guides get the clues on their phones.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((FLOOR_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {chosen && game.phase === 'reveal' && elapsed > 900 && (
        <div className={`lh-result ${chosen.safe ? 'is-safe' : 'is-bad'}`}>
          {chosen.safe ? 'SAFE! Up the stairs!' : `A ${room.monster}! -1 🏮`}
        </div>
      )}

      {(game.phase === 'won' || game.phase === 'lost') && elapsed > 1200 && (
        <div className={`lc-card lc-end ${game.phase}`}>
          <h2 className="lc-title">{game.phase === 'won' ? 'You escaped the house!' : 'Lights out on the stairs…'}</h2>
          <p>{game.phase === 'won' ? `The crew made it to the top with ${game.lanterns} lantern${game.lanterns === 1 ? '' : 's'} left.` : `The monsters got you on floor ${game.floor}.`} Team score: <b>{game.score.toLocaleString()}</b></p>
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
