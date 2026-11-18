import React from 'react';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { RainbowScene } from './RainbowStage';

// Rainbow Run's how-to-play intro.

export const HOWTO_MS = 33000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Rainbow Run! There is gold at the end of the rainbow.' },
  { at: 5000, step: '1', title: 'Every step, pick CLIMB or HEAD HOME on your phone.', say: 'Every step, pick climb or head home on your phone.' },
  { at: 11000, step: '2', title: 'Climbers split the gold on each new step.', say: 'Climbers split the gold on each new step.' },
  { at: 17000, step: '3', title: 'Head home to bank your gold. Only banked gold counts!', say: 'Head home to bank your gold. Only gold you bring home counts!' },
  { at: 23000, step: '4', title: 'If the same hazard shows up twice, the rainbow falls and climbers drop everything!', say: 'If the same hazard shows up twice, the rainbow falls, and climbers drop everything!' },
  { at: 30000, step: '', title: 'Feeling lucky?', say: 'Four rainbows. Feeling lucky?' },
];

const STEPS = [
  { at: 8000, kind: 'coins', value: 9, left: 0 },
  { at: 12500, kind: 'coins', value: 7, left: 1 },
  { at: 15500, kind: 'hazard', hazard: 'cat' },
  { at: 20000, kind: 'coins', value: 5, left: 1 },
  { at: 24500, kind: 'hazard', hazard: 'cat' },
];

export default function RainbowHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 3);
  useCues(t, [...STEPS.map((s, i) => [`s${i}`, s.at, s.kind === 'hazard' ? (i === 4 ? () => { sfx.boss(); sfx.candle(); } : sfx.spawn) : sfx.banish]), ['home', 18000, sfx.join], ['end', 30100, sfx.won]]);
  const steps = STEPS.filter((s) => t >= s.at);
  const last = steps[steps.length - 1];
  const crashK = t >= 24500 && t < 30000 ? ease((t - 24900) / 1800) : 0;
  const homeAt = 18000;
  const climbing = cast.map((c, i) => ({ ...c, i })).filter((c) => !(c.i === 0 && t >= homeAt));
  const climbers = (t >= 30000 ? [] : climbing).map((c) => ({ key: c.i, look: c.look, name: c.name, pose: crashK ? 'scared' : 'stand' }));
  const home = t >= homeAt ? [{ key: 0, look: cast[0].look, name: cast[0].name, bank: 6, pose: 'cheer' }] : [];
  const phone = between(t, 5300, 10800);

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Rainbow Run" onSkip={onSkip}>
      <RainbowScene steps={t >= 30000 ? [] : steps} climbers={climbers} home={home} crashK={crashK} now={now} flipK={last ? (t - last.at) / 500 : 1} />
      {phone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 5300) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="rr-picks">
            <span className={`rr-climb${t > 7000 ? ' is-on' : ''}`}>🌈<b>CLIMB</b></span>
            <span className="rr-home">🏠<b>HEAD HOME</b></span>
          </div>
        </div>
      )}
      {between(t, 24900, 29500) && <div className="lh-result rr-result is-bad">🐈‍⬛ Another Black Cat! The rainbow falls!</div>}
    </HowToFrame>
  );
}
