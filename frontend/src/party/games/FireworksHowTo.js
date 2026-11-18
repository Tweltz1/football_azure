import React from 'react';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { FireworksScene, rocketTarget, tubeX } from './FireworksStage';
import { COLORS, RISE_MS } from './fireworks';

// Fireworks Show's how-to-play intro.

export const HOWTO_MS = 33000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to the Fireworks Show! Everyone gets a launch tube.' },
  { at: 4500, step: '1', title: 'Rockets rise on the beat. Each one flies up to a ring in the sky.', say: 'Rockets rise on the beat. Each one flies up to a ring in the sky.' },
  { at: 11000, step: '2', title: 'Tap BOOM on your phone right as YOUR rocket hits its ring.', say: 'Tap boom on your phone right as your rocket hits its ring.' },
  { at: 17500, step: '3', title: 'Perfect timing makes the biggest burst. Keep a combo going for more points!', say: 'Perfect timing makes the biggest burst. Keep a combo going for more points!' },
  { at: 23500, step: '4', title: 'Too early or too late and it fizzles. Mashing BOOM costs points!', say: 'Too early or too late and it fizzles. And mashing boom costs points!' },
  { at: 29000, step: '', title: 'Five shows. Big finale!', say: 'Five shows, then the grand finale!' },
];

const SCRIPT = [
  [0, 7600, 'peony', 'perfect'], [1, 8800, 'ring', 'great'], [2, 10000, 'willow', 'good'],
  [0, 14000, 'heart', 'perfect'], [1, 15300, 'star', 'perfect'], [2, 16400, 'peony', 'great'],
  [0, 19000, 'star', 'perfect'], [0, 19900, 'ring', 'perfect'], [1, 20600, 'willow', 'great'], [2, 21600, 'heart', 'good'],
  [2, 25600, 'peony', 'miss'], [1, 26800, 'ring', 'perfect'],
  [0, 30400, 'peony', 'perfect'], [1, 30400, 'heart', 'perfect'], [2, 30400, 'star', 'perfect'],
  [0, 31300, 'willow', 'perfect'], [1, 31300, 'ring', 'perfect'], [2, 31300, 'peony', 'perfect'],
].map(([c, at, shape, grade], i) => ({ id: i, c, at, shape, grade, tx: Math.round(Math.sin(i * 2.3) * 120), ty: 220 + Math.round(Math.abs(Math.cos(i * 1.7)) * 200), finale: at > 30000 }));
const SIZE = { perfect: 250, great: 185, good: 125 };

export default function FireworksHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 3);
  useCues(t, [
    ...SCRIPT.map((r) => [`r${r.id}`, r.at, r.grade === 'miss' ? sfx.dud : () => sfx.pop(r.grade === 'perfect' ? 1 : 0.5)]),
    ...Array.from({ length: 50 }, (_, i) => [`k${i}`, 5000 + i * 520, sfx.kick]),
  ]);
  const tubes = cast.map((c, i) => ({ key: i, x: tubeX(i, 3), look: c.look, name: c.name, color: COLORS[i].fill, combo: t > 20000 && t < 23000 && i === 0 ? 4 : 0, pose: SCRIPT.some((r) => r.c === i && r.grade !== 'miss' && t >= r.at && t < r.at + 600) ? 'cheer' : 'stand' }));
  const fromX = (c) => tubeX(c, 3) + 34;
  const rockets = SCRIPT.filter((r) => t >= r.at - RISE_MS && t < r.at).map((r) => ({ key: r.id, fromX: fromX(r.c), to: rocketTarget(r, fromX(r.c)), p: (t - (r.at - RISE_MS)) / RISE_MS, color: COLORS[r.c].fill }));
  const bursts = SCRIPT.filter((r) => t >= r.at && t < r.at + 2000).map((r) => {
    const to = rocketTarget(r, fromX(r.c));
    return { key: r.id, x: to.x, y: to.y, color: COLORS[r.c].fill, shape: r.shape, k: (t - r.at) / (r.grade === 'miss' ? 900 : 2000), size: (SIZE[r.grade] || 120) * (r.finale ? 1.25 : 1), grade: r.grade };
  }).filter((b) => b.k < 1);
  const phone = between(t, 11300, 17300);
  const demo = SCRIPT[3];
  const dp = (t - (demo.at - RISE_MS)) / RISE_MS;

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Fireworks Show" onSkip={onSkip}>
      <FireworksScene tubes={tubes} rockets={rockets} bursts={bursts} />
      {phone && (
        <div className="lq-demo-phone lh-demo-phone fw-demo" style={{ transform: `translateY(${(1 - ease((t - 11300) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="fw-lane" style={{ height: 170, '--fw': COLORS[0].fill }}>
            <div className="fw-target" style={{ top: 30 }} />
            {dp >= 0 && dp < 1.1 && (
              <>
                <div className="fw-approach" style={{ top: 30, transform: `translate(-50%, -50%) scale(${1 + Math.max(0, 1 - dp) * 1.6})` }} />
                <div className="fw-dot" style={{ top: 150 - 120 * Math.min(1, dp) }} />
              </>
            )}
            {t >= demo.at && t < demo.at + 700 && <div className="fw-flash is-perfect">PERFECT!</div>}
          </div>
          <span className={`fw-boom${between(t, demo.at - 60, demo.at + 120) ? ' is-down' : ''}`} style={{ '--fw': COLORS[0].fill }}>BOOM!</span>
        </div>
      )}
    </HowToFrame>
  );
}
