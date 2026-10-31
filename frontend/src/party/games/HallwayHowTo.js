import React from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { Door, doorX, HallBackdrop } from './HallwayStage';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';

// Haunted Hallway's how-to-play intro.

export const HOWTO_MS = 36000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Haunted Hallway! Work together to climb the haunted house.' },
  { at: 5000, step: '1', title: 'Each floor has a row of doors. Only one is safe.', say: 'Each floor has a row of doors. Only one of them is safe.' },
  { at: 11000, step: '2', title: 'Two guides get clues on their phones. Neither can solve it alone!', say: 'Two guides get clues on their phones. Neither one can solve it alone.' },
  { at: 18500, step: '3', title: 'Guides read their clues out loud. Then everyone votes for a door.', say: 'Guides, read your clues out loud. Then everyone votes for a door.' },
  { at: 25500, step: '4', title: 'The safe door leads upstairs. A wrong door costs a lantern. Lose all 3 and it\'s over!', say: 'The safe door leads upstairs. A wrong door lets a monster out, and costs a lantern. Lose all three and it\'s game over.' },
  { at: 32000, step: '', title: 'Climb 8 floors to escape!', say: 'Climb eight floors to escape. Good luck!' },
];

const DOORS = [
  { color: 'red', symbol: 'moon', window: 'round' },
  { color: 'green', symbol: 'moon', window: 'arch' },
  { color: 'blue', symbol: 'bat', window: 'square' },
];
const CLUES = ['The safe door is NOT red.', 'The safe door has a moon.'];
const SPOTS = [{ x: 620, y: 1040 }, { x: 860, y: 1040 }, { x: 1100, y: 1040 }, { x: 1340, y: 1040 }];
const VOTES = [{ who: 0, at: 22000 }, { who: 1, at: 22800 }, { who: 2, at: 23400 }, { who: 3, at: 24000 }];
const OPEN_AT = 26000;
const MONSTER_AT = 29000;

const Bubble = ({ x, y, text, k }) => {
  const w = text.length * 15 + 40;
  return (
    <g transform={`translate(${x} ${y}) scale(${ease(k * 3)})`}>
      <rect x={-w / 2} y="-70" width={w} height="60" rx="20" fill="#fff6e3" stroke="#16122b" strokeWidth="5" />
      <path d="M-10 -12 L0 10 L10 -12 Z" fill="#fff6e3" stroke="#16122b" strokeWidth="5" strokeLinejoin="round" />
      <text y="-38" fontSize="26" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#16122b">{text}</text>
    </g>
  );
};

export default function HallwayHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 4);
  useCues(t, [
    ['doors', 5200, sfx.night], ['v0', 22000, sfx.hit], ['v1', 22800, sfx.hit], ['v2', 23400, sfx.hit], ['v3', 24000, sfx.hit],
    ['open', OPEN_AT + 600, sfx.banish], ['monster', MONSTER_AT + 600, sfx.boss], ['end', 32100, sfx.won],
  ]);
  const showDoors = between(t, 5000, 32000);
  const openSafe = between(t, OPEN_AT, MONSTER_AT) ? ease((t - OPEN_AT - 300) / 900) : 0;
  const openBad = t >= MONSTER_AT ? ease((t - MONSTER_AT - 300) / 900) : 0;
  const pose = (i) => {
    if (t >= 32000) return 'cheer';
    if (between(t, OPEN_AT + 900, MONSTER_AT)) return 'cheer';
    if (t >= MONSTER_AT + 900) return 'scared';
    if (VOTES.some((v) => v.who === i && t >= v.at)) return 'wave';
    return 'stand';
  };
  const lanterns = t >= MONSTER_AT + 900 ? 2 : 3;
  const phone = between(t, 11500, 18500) ? (t < 15000 ? 0 : 1) : null;

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Haunted Hallway" onSkip={onSkip}>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <HallBackdrop floor={t >= MONSTER_AT ? 2 : 1} />
        {showDoors && DOORS.map((d, i) => (
          <Door
            key={i}
            door={d}
            index={i}
            x={doorX(i, 3)}
            open={(i === 1 && t < MONSTER_AT) ? openSafe : (i === 0 && t >= MONSTER_AT ? openBad : 0)}
            inside={i === 1 && t < MONSTER_AT ? 'safe' : i === 0 && t >= MONSTER_AT ? 'monster' : null}
            monster="ghost"
          />
        ))}
        {cast.map((p, i) => <ScenePerson key={i} look={p.look} pose={pose(i)} k={0} x={SPOTS[i].x} y={SPOTS[i].y} delay={i} scale={0.5} />)}
        {cast.map((p, i) => <PlayerTag key={i} name={`${i < 2 ? '🔦 ' : ''}${p.name}`} x={SPOTS[i].x} y={SPOTS[i].y + 4} color={i < 2 ? '#8a5a12' : undefined} />)}
        {between(t, 18800, 22000) && <Bubble x={SPOTS[0].x} y={SPOTS[0].y - 200} text={`"${CLUES[0]}"`} k={(t - 18800) / 1000} />}
        {between(t, 20200, 23500) && <Bubble x={SPOTS[1].x + 40} y={SPOTS[1].y - 280} text={`"${CLUES[1]}"`} k={(t - 20200) / 1000} />}
        {between(t, MONSTER_AT + 900, 32000) && <rect width="1920" height="1080" fill="#ff2040" opacity={0.18} />}
      </svg>

      {showDoors && (
        <div className="lq-hud lh-hud">
          <span className="lq-pill">Floor {t >= MONSTER_AT ? 2 : 1} of 8</span>
          <span className="lq-pill">{'🏮'.repeat(lanterns)}<span className="lh-out">{'🏮'.repeat(3 - lanterns)}</span></span>
        </div>
      )}
      {between(t, 22000, OPEN_AT) && (
        <div className="lh-votes">
          <div className="lh-vote" style={{ left: `${(doorX(1, 3) / 1920) * 100}%` }}>
            {VOTES.filter((v) => t >= v.at).map((v) => <Person key={v.who} look={cast[v.who].look} view="head" />)}
          </div>
        </div>
      )}
      {between(t, OPEN_AT + 900, MONSTER_AT) && <div className="lh-result is-safe">SAFE! Up the stairs!</div>}
      {between(t, MONSTER_AT + 900, 32000) && <div className="lh-result is-bad">Wrong door! -1 🏮</div>}

      {phone != null && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - (phone ? 15000 : 11500)) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[phone].name}&apos;s phone</div>
          <div className="lh-demo-clue">🔦 You&apos;re a guide!<br /><b>{CLUES[phone]}</b></div>
        </div>
      )}
    </HowToFrame>
  );
}
