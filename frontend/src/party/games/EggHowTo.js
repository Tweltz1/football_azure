import React from 'react';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { EggScene } from './EggStage';
import { SPOTS } from './eggHunt';

// Egg Hunt's how-to-play intro.

export const HOWTO_MS = 31000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Egg Hunt! The Easter Bunny is hiding eggs in the garden.' },
  { at: 4500, step: '1', title: 'Your phone shows your egg color. Watch where the bunny hides it!', say: 'Your phone shows your egg color. Watch where the bunny hides it!' },
  { at: 12000, step: '2', title: 'When the hunt starts, tap that spot on your phone. Faster finds score more.', say: 'When the hunt starts, tap that spot on your phone. Faster finds score more.' },
  { at: 18000, step: '3', title: 'Wrong spot? You freeze for a moment. Watch out for fake stops too!', say: 'Wrong spot? You freeze for a moment. And watch out for fake stops!' },
  { at: 23500, step: '4', title: 'Grab the golden egg first for 150 bonus points!', say: 'Grab the golden egg first for a big bonus!' },
  { at: 28500, step: '', title: 'Happy hunting!', say: 'Six rounds. Happy hunting!' },
];

const HIDE_AT = 5000;
const MS = 1100;
const HOPS = [{ spot: 6, egg: 'c0' }, { spot: 2, egg: 'golden' }, { spot: 13, egg: 'c1' }, { spot: 16, egg: null }, { spot: 9, egg: 'c2' }];
const COLORS = { c0: 0, c1: 1, c2: 2 };

export default function EggHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 3);
  useCues(t, [
    ...HOPS.map((h, i) => [`h${i}`, HIDE_AT + i * MS + MS * 0.45, h.egg ? sfx.join : sfx.whoosh]),
    ['find', 14500, sfx.banish], ['miss', 18600, sfx.fizzle], ['gold', 23800, () => { sfx.soulDone(); sfx.won(); }], ['end', 28600, sfx.won],
  ]);
  const hideT = t >= HIDE_AT && t < HIDE_AT + HOPS.length * MS + 900 ? t - HIDE_AT : null;
  const eggs = [];
  if (t >= 14500 && t < 28500) eggs.push({ spot: 6, owner: 'c0', k: (t - 14500) / 400, label: cast[0].name });
  if (t >= 23800 && t < 28500) eggs.push({ spot: 2, owner: 'golden', k: (t - 23800) / 400, label: `🌟 ${cast[1].name}` });
  const marks = between(t, 18600, 20200) || between(t, 20800, 22200) ? { [t < 20500 ? 11 : 17]: true } : {};
  const phone = between(t, 12300, 17800);

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Egg Hunt" onSkip={onSkip}>
      <EggScene hops={HOPS} colors={COLORS} hideT={hideT} ms={MS} eggs={eggs} marks={marks} now={now} />
      {phone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 12300) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="eh-grid is-demo">
            {SPOTS.map((s, i) => (
              <span key={s.name} className={`eh-spot${i === 6 && t > 14000 ? ' is-mine' : ''}${i === 6 && between(t, 13600, 14000) ? ' is-press' : ''}`}><span>{i === 6 && t > 14000 ? '🥚' : s.icon}</span></span>
            ))}
          </div>
        </div>
      )}
    </HowToFrame>
  );
}
