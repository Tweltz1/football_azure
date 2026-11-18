import React from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { Envelope, heartD, Mailbox, Parlor, spotOf } from './AdmirerStage';
import { INK } from '../cartoon';

// Secret Admirer's how-to-play intro.

export const HOWTO_MS = 33000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Secret Admirer! Love is in the air.' },
  { at: 5000, step: '1', title: 'Your phone gives you a secret valentine. Write them a sweet note!', say: 'Your phone gives you a secret valentine. Write them a sweet note!' },
  { at: 12000, step: '2', title: 'The notes are read out one at a time. Who wrote it?', say: 'The notes are read out one at a time. Who wrote it?' },
  { at: 18500, step: '3', title: 'Guess the writer on your phone. Right guesses score points.', say: 'Guess the writer on your phone. Right guesses score points.' },
  { at: 24500, step: '4', title: 'Fool the room with your note and you score even more!', say: 'Fool the room with your note, and you score even more!' },
  { at: 30000, step: '', title: 'Spread the love!', say: 'Spread the love!' },
];

const SENT = [6500, 7600, 8800, 10000];

export default function AdmirerHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 4);
  useCues(t, [...SENT.map((s, i) => [`n${i}`, s, sfx.whoosh]), ['letter', 12200, sfx.soul], ['g1', 20500, sfx.hit], ['g2', 21500, sfx.hit], ['reveal', 25000, sfx.banish], ['end', 30100, sfx.won]]);
  const writing = between(t, 5000, 12000);
  const letter = between(t, 12000, 30000);
  const revealed = t >= 25000;
  const guessesShown = t >= 20500;
  const pose = (i) => {
    if (t >= 30000) return 'cheer';
    if (writing && t >= SENT[i]) return 'wave';
    if (revealed) return i === 2 ? 'cheer' : 'stand';
    return 'stand';
  };
  const phone = between(t, 18800, 24300);

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Secret Admirer" onSkip={onSkip}>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <Parlor />
        {writing && <Mailbox letters={SENT.filter((s) => t >= s + 900).length} total={4} pulse={0} />}
        {writing && SENT.map((s, i) => (t >= s && t < s + 1000 ? <Envelope key={i} k={(t - s) / 1000} from={spotOf(i, 4)} /> : null))}
        {t < 5000 && <path d={heartD(960, 560, 6 + Math.sin(t / 300) * 0.4)} fill="#e0245e" stroke={INK} strokeWidth="9" opacity={ease(t / 800)} />}
        {cast.map((c, i) => {
          const s = spotOf(i, 4);
          return (
            <g key={i}>
              <ScenePerson look={c.look} pose={pose(i)} k={0} x={s.x} y={s.y} delay={i} scale={0.42} />
              <PlayerTag name={`${writing && t >= SENT[i] ? '💌 ' : ''}${c.name}`} x={s.x} y={s.y + 2} />
            </g>
          );
        })}
      </svg>
      {letter && (
        <div className={`va-letter${revealed ? ' is-open' : ''}`}>
          <div className="va-to">To my dear <b>{cast[0].name}</b>,</div>
          <p className="va-text">You make every game night better!</p>
          <div className="va-from">From: {revealed ? <b className="va-stamp">{cast[2].name}</b> : <b className="va-q">???</b>}</div>
          {guessesShown && (
            <div className="va-guesses">
              <span><Person look={cast[0].look} view="head" />{cast[0].name} said <b>{cast[1].name}</b> {revealed ? '✗' : ''}</span>
              <span className={revealed ? 'is-right' : ''}><Person look={cast[3].look} view="head" />{cast[3].name} said <b>{cast[2].name}</b> {revealed ? '✓' : ''}</span>
              {revealed && <span className="is-fooled">🎭 {cast[2].name} fooled 1! +60</span>}
            </div>
          )}
        </div>
      )}
      {phone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 18800) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[3].name}&apos;s phone</div>
          <div className="va-suspects">
            {[1, 2].map((i) => <span key={i} className={`va-sus${t > 21500 && i === 2 ? ' is-on' : ''}`}>{cast[i].name}</span>)}
          </div>
        </div>
      )}
    </HowToFrame>
  );
}
