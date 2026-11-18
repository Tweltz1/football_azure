import React from 'react';
import { sfx } from '../sound';
import { between, ease, HowToFrame, useCast, useCues } from './howtoKit';
import { TrotScene } from './TrotStage';
import { FARMER_COLORS, PEN } from './turkeyTrot';

// Turkey Trot's how-to-play intro: one farmer walks a turkey into the pen.

export const HOWTO_MS = 33000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Turkey Trot! The turkeys got loose, and dinner is almost ready.' },
  { at: 5000, step: '1', title: 'Your phone is a joystick. It walks your farmer around the yard.', say: 'Your phone is a joystick. Use it to walk your farmer around the yard.' },
  { at: 11000, step: '2', title: 'Turkeys run away from you. Get behind one and walk it toward the pen.', say: 'Turkeys run away from you. Get behind one, and walk it toward the pen.' },
  { at: 19000, step: '3', title: 'In through the gate! Every turkey in the pen scores.', say: 'Steer it in through the gate. Every turkey in the pen scores points.' },
  { at: 24500, step: '4', title: 'Pen enough turkeys before the dinner bell. Work together!', say: 'Pen enough turkeys before the dinner bell rings. Team up and trap them together!' },
  { at: 30000, step: '', title: 'Round up those turkeys!', say: 'Three rounds. Round up those turkeys!' },
];

const lerp = (a, b, k) => a + (b - a) * ease(k);
const PEN_AT = 20300;
const GATE_X = (PEN.x1 + PEN.x2) / 2;

// Where the star turkey and its farmer are at time t.
const hero = (t) => {
  if (t < 13500) return { x: 960 + Math.sin(t / 900) * 30, y: 800, vx: Math.cos(t / 900) * 40, vy: 0, run: false };
  if (t < PEN_AT) {
    const k = (t - 13500) / (PEN_AT - 13500);
    return { x: lerp(960, GATE_X, k) + Math.sin(t / 160) * 34 * (1 - k), y: lerp(800, 420, k), vx: Math.cos(t / 160) * 200, vy: -200, run: true };
  }
  return null;
};
const farmer = (t) => {
  if (t < 5000) return { x: 1300, y: 960, moving: false, facing: -1 };
  if (t < 9000) { const k = (t - 5000) / 4000; return { x: lerp(1300, 760, k), y: lerp(960, 970, k), moving: true, facing: -1 }; }
  if (t < 11500) return { x: 760, y: 970, moving: false, facing: 1 };
  if (t < 13500) { const k = (t - 11500) / 2000; return { x: lerp(760, 960, k), y: lerp(970, 990, k), moving: true, facing: 1 }; }
  if (t < PEN_AT) { const h = hero(t); return { x: h.x - Math.sin(t / 160) * 20, y: h.y + 190, moving: true, facing: 1 }; }
  return { x: GATE_X, y: 610, moving: false, facing: 1, pose: t > PEN_AT + 300 ? 'cheer' : 'stand' };
};

export default function TrotHowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useCast(players, 3);
  useCues(t, [['walk', 5200, sfx.whoosh], ['gobble', 13300, sfx.gobble], ['gobble2', 16500, sfx.gobble], ['pen', PEN_AT, sfx.banish], ['bell', 25000, sfx.night], ['end', 30100, sfx.won]]);

  const h = hero(t);
  const f = farmer(t);
  const turkeys = [
    { id: 1, x: 470 + Math.sin(t / 1300) * 60, y: 720, vx: Math.cos(t / 1300) * 50, vy: 0, step: t / 260, peck: Math.sin(t / 700) > 0.6 },
    { id: 2, x: 1460 + Math.sin(t / 1100 + 2) * 70, y: 640, vx: Math.cos(t / 1100 + 2) * 50, vy: 0, step: t / 250, peck: Math.sin(t / 800 + 1) > 0.5 },
    h ? { id: 3, ...h, step: t / (h.run ? 90 : 260), scaredAt: h.run ? 13500 : null }
      : { id: 3, x: PEN.x1 + 110, y: PEN.y1 + 120, vx: 20, vy: 0, step: 0, penned: true },
  ];
  if (t >= 16500 && t < 17400 && h) turkeys[2].scaredAt = 16500;
  const walk = t / 110;
  const farmers = [
    { key: 'a', ...f, walk, look: cast[0].look, name: cast[0].name, color: FARMER_COLORS[0] },
    { key: 'b', x: 300, y: 930, facing: 1, moving: false, walk: 0, look: cast[1].look, name: cast[1].name, color: FARMER_COLORS[1], delay: 1, pose: t > PEN_AT + 300 ? 'cheer' : undefined },
    { key: 'c', x: 1640, y: 900, facing: -1, moving: false, walk: 0, look: cast[2].look, name: cast[2].name, color: FARMER_COLORS[2], delay: 2, pose: t > PEN_AT + 300 ? 'cheer' : undefined },
  ];
  const fx = t >= PEN_AT ? [{ kind: 'pen', x: GATE_X, y: PEN.y2 - 30, at: startedAt + PEN_AT, text: '+100' }] : [];
  const showPhone = between(t, 5200, 11000);
  const stick = t < 9000 ? { x: -60, y: 0 } : { x: 0, y: 0 };
  const clock = between(t, 24500, 30000) ? Math.max(0, 9 - Math.floor((t - 24500) / 600)) : null;

  return (
    <HowToFrame scenes={SCENES} t={t} total={HOWTO_MS} gameTitle="Turkey Trot" onSkip={onSkip}>
      <TrotScene farmers={farmers} turkeys={turkeys} fx={fx} now={now} dusk={0} />
      {clock != null && <div className="tt-clock is-hurry"><span>🔔 Dinner in</span><b>0:0{clock}</b></div>}
      {showPhone && (
        <div className="lq-demo-phone lh-demo-phone" style={{ transform: `translateY(${(1 - ease((t - 5200) / 500)) * 120}%)` }}>
          <div className="lq-demo-owner">{cast[0].name}&apos;s phone</div>
          <div className="tt-stick tt-demo" style={{ '--tt-me': FARMER_COLORS[0] }}>
            <span className="tt-knob" style={{ transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))` }}>🧑‍🌾</span>
          </div>
        </div>
      )}
    </HowToFrame>
  );
}
