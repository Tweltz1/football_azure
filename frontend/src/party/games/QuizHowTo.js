import React from 'react';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { QuizBackdrop } from './QuizStage';
import { ANSWER_STYLE } from './quizLook';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';

// Fright Quiz's how-to-play intro: a pretend question played out by the room's own characters.

export const HOWTO_MS = 38000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Fright Quiz! Spooky trivia, and it\'s every ghoul for themselves.' },
  { at: 5000, step: '1', title: 'A question pops up on the TV. The answers show up on your phone.', say: 'A question pops up on the TV. The answers show up on your phone.' },
  { at: 12000, step: '2', title: 'Tap the right answer. The faster you tap, the more points you get.', say: 'Tap the right answer. The faster you tap, the more points you get.' },
  { at: 20500, step: '3', title: 'First right answer gets a ⚡ Fastest bonus. Three in a row is a 🔥 Hot Streak.', say: 'The first right answer gets a fastest bonus. Get three in a row for a hot streak!' },
  { at: 27500, step: '4', title: 'Round 3 is Double Trouble. Every point counts twice!', say: 'Round three is Double Trouble. Every point counts twice, so anyone can still win!' },
  { at: 33500, step: '', title: '15 questions. Highest score wins!', say: 'Fifteen questions. Highest score wins. Good luck!' },
];

const DEMO = { text: 'What do kids say at the door on Halloween?', answers: ['Happy birthday!', 'Trick or treat!', 'Knock knock!', 'Merry Christmas!'], correct: 1 };
const SPOTS = [{ x: 640, y: 975 }, { x: 900, y: 975 }, { x: 1160, y: 975 }];
const TAPS = [{ at: 14000, choice: 1 }, { at: 16000, choice: 1 }, { at: 17200, choice: 2 }];
const REVEAL_AT = 18200;

export default function QuizHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players);
  useCues(t, [
    ['q', 5200, sfx.spawn], ['open', 7000, sfx.join],
    ['a0', TAPS[0].at, sfx.hit], ['a1', TAPS[1].at, sfx.hit], ['a2', TAPS[2].at, sfx.hit],
    ['reveal', REVEAL_AT, sfx.banish], ['fast', 21000, sfx.soul], ['streak', 24000, sfx.soulDone],
    ['double', 28000, sfx.night], ['end', 33600, sfx.won],
  ]);

  const showQ = between(t, 5000, 33500);
  const showAnswers = t >= 7000;
  const revealed = t >= REVEAL_AT;
  const timerK = between(t, 12000, REVEAL_AT) ? (t - 12000) / (REVEAL_AT - 12000) : revealed ? 1 : 0;
  const answered = (i) => t >= TAPS[i].at;
  const pose = (i) => {
    if (t >= 33500) return 'cheer';
    if (revealed && t < 27500) return TAPS[i].choice === DEMO.correct ? 'cheer' : 'scared';
    if (between(t, 28000, 33500)) return i === 2 ? 'cheer' : 'stand';
    return answered(i) && t >= 12000 ? 'wave' : 'stand';
  };
  // The phone shown belongs to cast[0] until the reveal.
  const phoneIn = ease((t - 8000) / 500) * (t < REVEAL_AT + 1500 ? 1 : 1 - ease((t - REVEAL_AT - 1500) / 500));
  const fingerK = ease((t - (TAPS[0].at - 900)) / 900);
  const tapped = answered(0);

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Fright Quiz" onSkip={onSkip}>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(t / 700)} />
        {cast.map((p, i) => <ScenePerson key={i} look={p.look} pose={pose(i)} k={0} x={SPOTS[i].x} y={SPOTS[i].y} delay={i} scale={0.8} />)}
        {cast.map((p, i) => <PlayerTag key={i} name={p.name} x={SPOTS[i].x} y={SPOTS[i].y + 18} />)}
        {cast.map((p, i) => (between(t, 12000, REVEAL_AT) && answered(i) ? (
          <g key={i} transform={`translate(${SPOTS[i].x} ${SPOTS[i].y - 330})`}>
            <circle r="26" fill="#3ddc97" stroke="#16122b" strokeWidth="4" />
            <text y="2" fontSize="28" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">✓</text>
          </g>
        ) : null))}
        {between(t, REVEAL_AT, 27500) && ['+950', '+700', '✗'].map((text, i) => (
          <text key={i} x={SPOTS[i].x} y={SPOTS[i].y - 330 - ease((t - REVEAL_AT) / 700) * 30} fontSize="44" fontWeight="900" textAnchor="middle" fill={i < 2 ? '#ffe066' : '#ff6b6b'} stroke="#16122b" strokeWidth="7" paintOrder="stroke">{text}</text>
        ))}
        {between(t, 21000, 27500) && (
          <g transform={`translate(${SPOTS[0].x} ${SPOTS[0].y - 400}) scale(${ease((t - 21000) / 400)})`}>
            <rect x="-150" y="-34" width="300" height="68" rx="34" fill="#ffe066" stroke="#16122b" strokeWidth="5" />
            <text y="2" fontSize="30" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">⚡ Fastest +100</text>
          </g>
        )}
        {between(t, 24000, 27500) && (
          <g transform={`translate(${SPOTS[1].x} ${SPOTS[1].y - 400}) scale(${ease((t - 24000) / 400)})`}>
            <rect x="-170" y="-34" width="340" height="68" rx="34" fill="#ff8a2a" stroke="#16122b" strokeWidth="5" />
            <text y="2" fontSize="30" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">🔥 3 in a row +100</text>
          </g>
        )}
        {between(t, 29000, 33500) && (
          <text x={SPOTS[2].x} y={SPOTS[2].y - 340} fontSize="44" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="7" paintOrder="stroke">
            {t < 30500 ? '+950' : '+1,900!'}
          </text>
        )}
      </svg>

      {showQ && t < 27500 && (
        <div className="lq-main lq-demo">
          <div className="lq-question">
            <p>{DEMO.text}</p>
            {between(t, 12000, REVEAL_AT) && (
              <div className="lq-timer">
                <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" className="lq-timer-bg" /><circle cx="50" cy="50" r="44" className="lq-timer-fg" style={{ strokeDashoffset: `${timerK * 276.5}` }} /></svg>
                <b>{Math.max(1, Math.ceil(15 * (1 - timerK)))}</b>
              </div>
            )}
          </div>
          {showAnswers && (
            <div className="lq-answers">
              {DEMO.answers.map((text, i) => (
                <div key={i} className={`lq-answer${revealed ? (i === DEMO.correct ? ' is-right' : ' is-wrong') : ''}`} style={{ '--c': ANSWER_STYLE[i].color, animationDelay: `${i * 0.08}s` }}>
                  <span className="lq-answer-icon">{ANSWER_STYLE[i].icon}</span>
                  <span className="lq-answer-text">{text}</span>
                  {revealed && i === DEMO.correct && <span className="lq-check">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {between(t, 27500, 33500) && (
        <div className="lq-double" style={{ transform: `translate(-50%, -50%) scale(${0.4 + 0.6 * ease((t - 27800) / 500)}) rotate(-4deg)` }}>
          <b>x2</b>
          <span>Double Trouble</span>
        </div>
      )}

      {phoneIn > 0 && (
        <div className="lq-demo-phone" style={{ transform: `translateY(${(1 - phoneIn) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          {!tapped ? DEMO.answers.map((text, i) => (
            <div key={i} className="lq-demo-btn" style={{ background: ANSWER_STYLE[i].color }}>{ANSWER_STYLE[i].icon} {text}</div>
          )) : (
            <div className="lq-demo-locked">{revealed ? '✅ Correct! +950' : '🎃 Locked in!'}</div>
          )}
          {fingerK > 0 && t < TAPS[0].at + 600 && (
            <span className="lq-finger" style={{ left: `${70 - 25 * fingerK}%`, top: `${95 - (95 - 38) * fingerK}%` }}>👆</span>
          )}
        </div>
      )}
    </HowToFrame>
  );
}
