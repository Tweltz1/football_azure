import React from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { QuizBackdrop } from './QuizStage';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';

// Monster Mash-up's how-to-play intro, acted out by the room's own characters.

export const HOWTO_MS = 36000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Monster Mash-up! Write the funniest answers, and win the votes.' },
  { at: 5000, step: '1', title: 'Your phone gives you a prompt. Write something funny!', say: 'Your phone gives you a prompt. Write something funny!' },
  { at: 12500, step: '2', title: 'Two answers go head to head. Nobody knows who wrote what.', say: 'Then two answers go head to head. Nobody knows who wrote what.' },
  { at: 19000, step: '3', title: 'Everyone else votes for the funniest. Every vote is points!', say: 'Everyone else votes for the funniest one. Every vote is points!' },
  { at: 26000, step: '4', title: 'Win every vote for a Monster Mash-up bonus. The final round counts triple!', say: 'Win every single vote for a Monster Mash-up bonus. And the final round counts triple!' },
  { at: 32000, step: '', title: 'Three rounds. Funniest monster wins!', say: 'Three rounds. Funniest monster wins!' },
];

const CURTAIN = ['#1f4a2e', '#2f6b3f', '#163a24'];
const PROMPT = "Dracula's secret hobby";
const ANSWERS = ['Knitting tiny capes for bats', 'Competitive tanning'];
const TYPED = ANSWERS[0];
const SPOTS = [{ x: 560, y: 975 }, { x: 800, y: 975 }, { x: 1120, y: 975 }, { x: 1360, y: 975 }];
const VOTES = [{ who: 2, pick: 0, at: 21000 }, { who: 3, pick: 0, at: 22200 }];
const REVEAL_AT = 23500;

export default function MashHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 4);
  useCues(t, [
    ['prompt', 5200, sfx.join], ['sent', 10500, sfx.hit], ['vs', 13000, sfx.spawn],
    ['v0', VOTES[0].at, sfx.hit], ['v1', VOTES[1].at, sfx.hit], ['reveal', REVEAL_AT, sfx.banish],
    ['mash', 27000, sfx.soulDone], ['end', 32100, sfx.won],
  ]);

  const typedK = between(t, 7000, 10500) ? (t - 7000) / 3500 : t >= 10500 ? 1 : 0;
  const typed = TYPED.slice(0, Math.round(TYPED.length * typedK));
  const showCards = between(t, 12500, 32000);
  const revealed = t >= REVEAL_AT;
  const authors = revealed && t >= REVEAL_AT + 1200;
  const pose = (i) => {
    if (t >= 32000) return 'cheer';
    if (between(t, 26500, 32000)) return i === 0 ? 'cheer' : 'wave';
    if (revealed) return i === 0 ? 'cheer' : i === 1 ? 'scared' : 'stand';
    if (between(t, 7000, 10500) && i === 0) return 'wave';
    if (VOTES.some((v) => v.who === i && t >= v.at)) return 'wave';
    return 'stand';
  };
  const phoneIn = between(t, 5500, 12500) ? ease((t - 5500) / 500) * (1 - ease((t - 12000) / 500)) : 0;

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Monster Mash-up" onSkip={onSkip}>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <QuizBackdrop lights={Math.floor(t / 700)} curtain={CURTAIN} />
        {cast.map((p, i) => <ScenePerson key={i} look={p.look} pose={pose(i)} k={0} x={SPOTS[i].x} y={SPOTS[i].y} delay={i} scale={0.72} />)}
        {cast.map((p, i) => <PlayerTag key={i} name={p.name} x={SPOTS[i].x} y={SPOTS[i].y + 18} />)}
        {VOTES.map((v) => (between(t, v.at, REVEAL_AT) ? (
          <g key={v.who} transform={`translate(${SPOTS[v.who].x} ${SPOTS[v.who].y - 300})`}>
            <circle r="26" fill="#3ddc97" stroke="#16122b" strokeWidth="4" />
            <text y="2" fontSize="28" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">✓</text>
          </g>
        ) : null))}
        {between(t, REVEAL_AT + 1200, 32000) && (
          <text x={SPOTS[0].x} y={SPOTS[0].y - 300 - ease((t - REVEAL_AT - 1200) / 700) * 30} fontSize="44" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="7" paintOrder="stroke">
            {t < 26500 ? '+200' : '+450!'}
          </text>
        )}
      </svg>

      {between(t, 5000, 32000) && (
        <div className="lq-main lm-main lq-demo">
          <div className="lq-question lm-prompt"><p>{PROMPT}</p></div>
          {showCards && (
            <div className="lm-answers">
              {ANSWERS.map((text, i) => (
                <React.Fragment key={text}>
                  {i === 1 && <div className="lm-vs">VS</div>}
                  <div className={`lm-answer${revealed ? (i === 0 ? ' is-win' : ' is-lose') : ''}`} style={{ '--c': i ? '#ff8a2a' : '#9b7bff', animationDelay: `${i * 0.12}s` }}>
                    <span className="lm-answer-text">{text}</span>
                    {revealed && (
                      <div className="lm-votes">
                        <b>{i === 0 ? '2 votes' : '0 votes'}</b>
                        {i === 0 && <span className="lq-heads">{[2, 3].map((c) => <Person key={c} look={cast[c].look} view="head" />)}</span>}
                      </div>
                    )}
                    {authors && (
                      <div className="lm-author">
                        <Person look={cast[i].look} view="head" />
                        <span>{cast[i].name}</span>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
          {between(t, 26500, 32000) && <div className="lm-mashup">MONSTER MASH-UP! 🧟 Every vote!</div>}
        </div>
      )}

      {phoneIn > 0 && (
        <div className="lq-demo-phone" style={{ transform: `translateY(${(1 - phoneIn) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="lm-demo-prompt">{PROMPT}</div>
          <div className="lm-demo-input">{typed}<i className="lm-caret" /></div>
          <div className={`lq-demo-btn lm-demo-send${t >= 10500 ? ' is-sent' : ''}`}>{t >= 10500 ? '✓ Sent!' : 'Send it'}</div>
        </div>
      )}
    </HowToFrame>
  );
}
