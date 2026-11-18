import React from 'react';
import Person from '../Person';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { CountdownScene } from './CountdownStage';

// Countdown Chaos's how-to-play intro.

export const HOWTO_MS = 31000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: "Welcome to Countdown Chaos! Let's ring in the new year." },
  { at: 5000, step: '1', title: 'The ball drops toward midnight. The clock runs on your phone.', say: 'The ball drops toward midnight. The clock runs on your phone.' },
  { at: 9500, step: '2', title: 'Hit STOP as close to midnight as you dare. Go over and you get nothing!', say: 'Hit stop as close to midnight as you dare. Go over, and you get nothing!' },
  { at: 16000, step: '3', title: 'Closest to midnight wins the round. A perfect stop scores big.', say: 'Closest to midnight wins the round. A perfect stop scores big.' },
  { at: 22500, step: '4', title: 'Watch out: some clocks go dark, run fast or wobble!', say: 'Watch out. Some clocks go dark, run fast, or wobble.' },
  { at: 28500, step: '', title: 'Happy New Year!', say: 'Ten countdowns. Happy New Year!' },
];

const START = 5000;
const DUR = 9000;
const STOPS = [8820, 8300, 9300]; // three people: close, early, too late

export default function CountdownHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 3);
  useCues(t, [['go', START, sfx.whoosh], ...STOPS.map((s, i) => [`s${i}`, START + s, sfx.hit]), ['midnight', START + DUR, () => { sfx.won(); sfx.soulDone(); }], ['dark', 23500, sfx.night], ['end', 28600, sfx.won]]);
  const into = t - START;
  const dark = t >= 22500 && t < 28500;
  let clock = null;
  let drop = 0;
  if (into >= 0 && into < DUR) { clock = { shown: DUR - into, hidden: false }; drop = into / DUR; }
  if (into >= DUR) drop = 1;
  if (dark) { const k = (t - 22500) / 6000; clock = { shown: 0, hidden: k > 0.25 }; drop = Math.min(1, k * 1.2); }
  const midnightAgo = into >= DUR && t < 22500 ? into - DUR : null;
  const people = cast.map((c, i) => {
    let pose = 'stand';
    const stopped = between(into, STOPS[i], DUR);
    if (stopped) pose = 'wave';
    if (midnightAgo != null && midnightAgo > 0) pose = STOPS[i] > DUR ? 'scared' : 'cheer';
    if (t > 28500) pose = 'cheer';
    return { key: i, look: c.look, name: c.name, pose, stopped };
  });
  const phone = between(t, 9800, 14800);
  const pressed = into >= STOPS[0];

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Countdown Chaos" onSkip={onSkip}>
      <CountdownScene drop={ease(drop)} clock={clock} people={people} midnightAgo={midnightAgo} now={now} dark={Boolean(clock?.hidden)} />
      {phone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 9800) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="cc-phone-clock">
            <div className="cc-digits">{(Math.max(0, DUR - into) / 1000).toFixed(1).padStart(4, '0')}</div>
            <span className={`cc-stop${pressed ? ' is-done' : ''}`}>{pressed ? 'LOCKED IN ✋' : 'STOP!'}</span>
          </div>
        </div>
      )}
      {between(t, 16300, 22500) && (
        <div className="lc-card cc-results" style={{ top: '57%' }}>
          <h2 className="lc-title">{cast[0].name} nailed it!</h2>
          <div className="cc-line">
            <div className="cc-track"><span className="cc-mid">MIDNIGHT</span><span className="cc-bust">TOO LATE</span><span className="cc-scale">3s</span></div>
            {STOPS.map((s, i) => {
              const early = DUR - s;
              const left = early < 0 ? Math.min(98, 82 + (-early / 1600) * 16) : Math.max(2, 82 - (early / 3000) * 80);
              return (
                <div key={i} className={`cc-pin${early < 0 ? ' is-bad' : ''}${i === 0 ? ' is-win' : ''}`} style={{ left: `${left}%`, '--row': i }}>
                  <Person look={cast[i].look} view="head" />
                  <b>{cast[i].name}</b>
                  <small>{early < 0 ? `+${(-early / 1000).toFixed(2)}s late` : `${(early / 1000).toFixed(2)}s early`}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </HowToFrame>
  );
}
