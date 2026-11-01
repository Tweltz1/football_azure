import React from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { QuizBackdrop } from './QuizStage';
import { MASK_CURTAIN, MaskBadge } from './MaskStage';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';

// Who's Behind the Mask?'s how-to-play intro, acted out by the room's own characters.

export const HOWTO_MS = 36000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: "Welcome to Who's Behind the Mask! One of you is secretly a vampire." },
  { at: 5000, step: '1', title: 'Humans get the secret word. The vampire only sees 3 similar words, never the real one!', say: 'Humans get the secret word on their phone. The vampire only sees three similar words. Close, but never the real one.' },
  { at: 12500, step: '2', title: 'Write a one-word clue. Vampires have to bluff!', say: 'Everyone writes a one-word clue. Humans, prove you know the word. Vampires, bluff!' },
  { at: 19500, step: '3', title: 'Talk it out, then vote for who you think is the vampire.', say: 'Talk it out, then vote for who you think is the vampire.' },
  { at: 25500, step: '4', title: 'Catch the vampire and the humans score. If it escapes, or guesses the word, the vampire scores!', say: 'Catch the vampire, and the humans score. If the vampire escapes, or guesses the secret word, the vampire scores!' },
  { at: 32000, step: '', title: 'More players, more vampires. Trust no one!', say: 'With a big group, there can be two or three vampires. Trust no one!' },
];

const WORD = 'Graveyard';
const CLUES = ['Tombstones', 'Zombies', 'Dark', 'Shovel'];
const VAMP = 2;
const SPOTS = [{ x: 560, y: 975 }, { x: 800, y: 975 }, { x: 1120, y: 975 }, { x: 1360, y: 975 }];
const VOTES = [{ who: 0, at: 22000 }, { who: 1, at: 22600 }, { who: 3, at: 23300 }];
const UNMASK_AT = 26500;

export default function MaskHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 4);
  useCues(t, [
    ['phones', 5400, sfx.join], ['c0', 13500, sfx.hit], ['c1', 14500, sfx.hit], ['c2', 15500, sfx.hit], ['c3', 16500, sfx.hit],
    ['v0', VOTES[0].at, sfx.hit], ['v1', VOTES[1].at, sfx.hit], ['v2', VOTES[2].at, sfx.hit],
    ['unmask', UNMASK_AT, sfx.whoosh], ['vamp', UNMASK_AT + 1800, sfx.boss], ['end', 32100, sfx.won],
  ]);

  const unmasked = t >= UNMASK_AT + 1800;
  const pose = (i) => {
    if (t >= 32000) return 'cheer';
    if (unmasked) return i === VAMP ? 'scared' : 'cheer';
    if (VOTES.some((v) => v.who === i && t >= v.at)) return 'wave';
    if (between(t, 13000, 17500) && t >= 13500 + i * 1000) return 'wave';
    return 'stand';
  };
  const phoneIn = between(t, 5200, 12500) ? ease((t - 5200) / 500) * (1 - ease((t - 12000) / 500)) : 0;
  const shown = between(t, 12500, 32000) ? Math.max(0, Math.min(4, Math.floor((t - 13000) / 1000) + 1)) : 0;

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Who's Behind the Mask?" onSkip={onSkip}>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(t / 700)} curtain={MASK_CURTAIN} />
        {cast.map((p, i) => <ScenePerson key={i} look={p.look} pose={pose(i)} k={0} x={SPOTS[i].x} y={SPOTS[i].y} delay={i} scale={0.72} />)}
        {cast.map((p, i) => <PlayerTag key={i} name={p.name} x={SPOTS[i].x} y={SPOTS[i].y + 18} />)}
        {cast.map((p, i) => (
          <MaskBadge key={i} x={SPOTS[i].x} y={SPOTS[i].y - 320} state={unmasked && i === VAMP ? 'vampire' : VOTES.some((v) => v.who === i && t >= v.at && t < UNMASK_AT) ? 'done' : 'mask'} />
        ))}
        {between(t, 22000, 32000) && (
          <text x={SPOTS[VAMP].x + 50} y={SPOTS[VAMP].y - 360} fontSize="34" fontWeight="900" fill="#ffe066" stroke="#16122b" strokeWidth="6" paintOrder="stroke">
            {`🗳️${VOTES.filter((v) => t >= v.at).length}`}
          </text>
        )}
        {between(t, UNMASK_AT + 1800, 32000) && <rect width="1920" height="1080" fill="#ff2040" opacity={0.12} />}
      </svg>

      {shown > 0 && (
        <div className="lq-main lk-main lq-demo">
          <div className="lk-clues">
            {CLUES.slice(0, shown).map((c, i) => (
              <div key={c} className={`lk-clue${unmasked && i === VAMP ? ' is-vamp' : ''}`} style={{ '--c': ['#9b7bff', '#ff8a2a', '#3ddc97', '#ff5fa2'][i] }}>
                <Person look={cast[i].look} view="head" />
                <span className="lk-clue-name">{cast[i].name}</span>
                <b className="lk-clue-text">{c}</b>
              </div>
            ))}
          </div>
          {between(t, 25500, 32000) && unmasked && <div className="lm-mashup">{cast[VAMP].name} was the VAMPIRE! 🧛 Humans score!</div>}
        </div>
      )}

      {phoneIn > 0 && (
        <>
          <div className="lq-demo-phone lk-demo-left" style={{ transform: `translateY(${(1 - phoneIn) * 120}%)` }}>
            <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
            <div className="lk-role"><span className="lk-role-kicker">😇 Human · your secret word is</span><b>{WORD}</b></div>
          </div>
          <div className="lq-demo-phone" style={{ transform: `translateY(${(1 - phoneIn) * 120}%)` }}>
            <div className="lq-demo-owner">{cast[VAMP].name}&apos;s phone</div>
            <div className="lk-role is-vamp"><span className="lk-role-kicker">🧛 VAMPIRE · the word is close to:</span><span className="lk-hints">{['Crypt', 'Tomb', 'Mausoleum'].map((w) => <i key={w}>{w}</i>)}</span></div>
          </div>
        </>
      )}
    </HowToFrame>
  );
}
