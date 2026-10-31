import React, { useEffect, useMemo, useRef } from 'react';
import { monsterMarkup } from './monsters';
import { randomLook, lookCode } from './look';
import { CHARM } from './lastCandle';
import { isMuted, sfx } from './sound';
import { Backdrop, CharmBadge, House, laneY, monsterX, PlayerTag, ScenePerson } from './scene';

// The how-to-play intro on the TV: a scripted little show using the room's own characters, with
// captions and (when sound is on) a narrator. The host can skip it. Times are in ms from the start.

export const HOWTO_MS = 57000;

const SCENES = [
  { at: 0, step: '', title: 'How to play', say: 'Welcome to Last Candle! Tonight, monsters want into the house. Your job: keep the candles lit until dawn.' },
  { at: 5500, step: '1', title: 'Monsters walk up the paths. If one reaches the house, a candle goes out.', say: 'Monsters walk up the paths. If one reaches the house, a candle goes out. Lose them all and it\'s game over.' },
  { at: 12500, step: '2', title: 'Each monster shows the charms that banish it. Tap a charm on your phone to throw it.', say: 'Each monster shows the charms that banish it. Tap a charm on your phone to throw it.' },
  { at: 19500, step: '3', title: 'Nobody has every charm. Shout! Work together!', say: 'Nobody has every charm. So shout! Who has the bell?' },
  { at: 29500, step: '4', title: 'Throw a charm nobody needs and you get spooked for a few seconds.', say: 'Careful. Throw a charm nobody needs, and you get spooked for a few seconds.' },
  { at: 36000, step: '5', title: 'Fog hides what some monsters need. Only one phone can see it. Call it out!', say: 'On fog night, some monsters hide what they need. Only one phone can see it. Call it out!' },
  { at: 43500, step: '6', title: 'At midnight comes the Pumpkin King. Throw his charms, then everyone taps SOUL together!', say: 'At midnight, the Pumpkin King arrives. Throw his charms, then everyone tap SOUL, at the same time!' },
  { at: 52000, step: '', title: 'Survive three nights. Good luck!', say: 'Survive three nights. Good luck!' },
];

const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
const between = (t, a, b) => t >= a && t < b;

const speak = (text) => {
  try {
    if (isMuted() || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 0.85;
    window.speechSynthesis.speak(u);
  } catch (error) { /* no narrator */ }
};

const DemoMonster = ({ kind, x, lane, need, fog, tag, scale = 0.85, label, opacity = 1 }) => {
  const markup = useMemo(() => monsterMarkup(kind), [kind]);
  const px = monsterX(x);
  const y = laneY(lane);
  const top = Math.max(kind === 'king' ? 180 : 60, y - (kind === 'king' ? 300 : 170) * scale - 30);
  const width = need.length * 58;
  const bx = Math.max(px, width / 2 + 62);
  return (
    <g opacity={opacity}>
      <g transform={`translate(${px} ${y}) scale(${-scale} ${scale})`} dangerouslySetInnerHTML={{ __html: markup }} />
      <g transform={`translate(${bx} ${top})`}>
        <rect x={-width / 2 - 52} y="-34" width={width + 64} height="68" rx="34" fill={fog ? '#6d6a86' : '#1d1530'} stroke="#16122b" strokeWidth="5" opacity="0.92" />
        <g transform={`translate(${-width / 2 - 22} 0)`}>
          <circle r="24" fill={kind === 'king' ? '#f5c542' : '#ff8a2a'} stroke="#16122b" strokeWidth="4" />
          <text y="2" fontSize="28" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">{tag}</text>
        </g>
        {need.map((c, i) => (fog
          ? <g key={i} transform={`translate(${-width / 2 + 29 + i * 58} 0)`}><circle r="24" fill="#a9a6c4" stroke="#16122b" strokeWidth="4" /><text y="2" fontSize="30" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">?</text></g>
          : <CharmBadge key={`${c}${i}`} id={c} x={-width / 2 + 29 + i * 58} y={0} r={24} />))}
      </g>
      {label && (
        <g transform={`translate(${Math.max(px, 230)} ${top - 62})`}>
          <rect x="-210" y="-26" width="420" height="52" rx="26" fill="#1d1530" stroke="#16122b" strokeWidth="5" />
          <text x="0" y="2" fontSize="26" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill={label.done ? '#3ddc97' : '#ffe066'}>{label.text}</text>
        </g>
      )}
    </g>
  );
};

const Bubble = ({ x, y, text, k }) => (
  <g transform={`translate(${x} ${y}) scale(${ease(k * 3)})`}>
    <path d={`M${-text.length * 8 - 20} -70 h${text.length * 16 + 40} a20 20 0 0 1 20 20 v28 a20 20 0 0 1 -20 20 h-${text.length * 8 + 10} l-12 22 l-6 -22 h-${text.length * 8 + 12} a20 20 0 0 1 -20 -20 v-28 a20 20 0 0 1 20 -20 z`} fill="#fff6e3" stroke="#16122b" strokeWidth="5" strokeLinejoin="round" />
    <text y="-36" fontSize="28" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#16122b">{text}</text>
  </g>
);

const Poof = ({ x, y, k, big }) => (k <= 0 || k >= 1 ? null : (
  <g transform={`translate(${x} ${y})`} opacity={1 - k}>
    <circle r={40 + k * (big ? 260 : 110)} fill="#fff6c8" opacity="0.5" />
    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const a = (i / 8) * Math.PI * 2;
      const d = 30 + k * (big ? 280 : 130);
      return <text key={i} x={Math.cos(a) * d} y={Math.sin(a) * d} fontSize="34" textAnchor="middle">✨</text>;
    })}
    <text y={-60 - k * 40} fontSize={big ? 110 : 64} fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="6" paintOrder="stroke" fontFamily="Creepster, Arial Black, Arial">POOF!</text>
  </g>
));

/** A phone, drawn in the scene, with a finger that taps it. */
const DemoPhone = ({ owner, hand, tapAt, t, spookedAt, secret, soul, show }) => {
  const enter = ease((t - show) / 500);
  if (enter <= 0) return null;
  const tapK = tapAt == null ? -1 : (t - (tapAt - 900)) / 900; // finger travels in over 0.9s, taps at tapAt
  const tapped = tapAt != null && t >= tapAt;
  const spooked = spookedAt != null && t >= spookedAt;
  const buttonY = (i) => 150 + i * 150;
  const target = hand ? buttonY(hand.tap) : 260;
  const fx = 220 - 70 * ease(tapK);
  const fy = 640 - (640 - target - 60) * ease(tapK) + (tapped && t - tapAt < 200 ? 10 : 0);
  return (
    <g transform={`translate(800 ${300 + (1 - enter) * 600}) `}>
      <rect x="-12" y="-12" width="304" height="604" rx="46" fill="#16122b" />
      <rect x="0" y="0" width="280" height="580" rx="36" fill="#2a1840" />
      <text x="140" y="44" fontSize="22" fontWeight="800" textAnchor="middle" fill="#c9b8ee">{owner}'s phone</text>
      {hand && hand.cards.map((c, i) => {
        const charm = CHARM[c];
        const used = tapped && i === hand.tap && !spooked;
        return (
          <g key={c} transform={`translate(24 ${buttonY(i) - 60})`} opacity={spooked ? 0.45 : 1}>
            <rect width="232" height="120" rx="22" fill={used ? '#3a2a50' : charm.color} stroke="#16122b" strokeWidth="5" strokeDasharray={used ? '12 10' : undefined} />
            {!used && <text x="70" y="62" fontSize="54" textAnchor="middle" dominantBaseline="central">{charm.icon}</text>}
            {!used && <text x="160" y="62" fontSize="26" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#16122b">{charm.name}</text>}
          </g>
        );
      })}
      {spooked && (
        <g transform="translate(140 520)">
          <rect x="-120" y="-26" width="240" height="52" rx="14" fill="#d33b3b" stroke="#16122b" strokeWidth="4" />
          <text y="2" fontSize="24" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#fff">👻 SPOOKED!</text>
        </g>
      )}
      {secret && (
        <g transform="translate(140 110)">
          <rect x="-120" y="-40" width="240" height="190" rx="18" fill="#d6d2ee" stroke="#16122b" strokeWidth="5" />
          <text y="-10" fontSize="20" fontWeight="800" textAnchor="middle" fill="#16122b">🌫️ Only you can see</text>
          <text y="16" fontSize="20" fontWeight="800" textAnchor="middle" fill="#16122b">monster {secret.tag}!</text>
          {secret.need.map((c, i) => <CharmBadge key={c} id={c} x={-40 + i * 80} y={80} r={34} />)}
        </g>
      )}
      {soul && (
        <g transform="translate(140 300)">
          <rect x="-116" y="-90" width="232" height="180" rx="24" fill={tapped ? '#3ddc97' : '#ffe066'} stroke="#16122b" strokeWidth="5" />
          <text y="-6" fontSize="54" textAnchor="middle" dominantBaseline="central" fill="#16122b" fontFamily="Creepster, Arial Black, Arial">✨SOUL✨</text>
          <text y="52" fontSize="18" fontWeight="800" textAnchor="middle" fill="#16122b">{tapped ? 'All together!' : 'Tap together!'}</text>
        </g>
      )}
      {tapK > 0 && tapK < 2.2 && <text x={fx} y={fy} fontSize="84" textAnchor="middle" dominantBaseline="central">👆</text>}
    </g>
  );
};

/** Flying charm from a player's spot to a point. */
const Throw = ({ from, to, charm, t, at }) => {
  const k = (t - at) / 450;
  if (k < 0 || k > 1) return null;
  const sx = from.x - 50;
  const sy = from.y - 150;
  return <CharmBadge id={charm} x={sx + (to.x - sx) * k} y={sy + (to.y - sy) * k - Math.sin(k * Math.PI) * 160} r={22} />;
};

export default function HowTo({ players, now, startedAt, onSkip }) {
  const t = now - startedAt;
  const cast = useMemo(() => {
    const list = players.slice(0, 3).map((p) => ({ name: p.name, look: p.look }));
    const fill = ['Boo', 'Spooks', 'Mort'];
    while (list.length < 3) list.push({ name: fill[list.length], look: lookCode({ ...randomLook(), costume: 1 + list.length }) });
    return list;
  }, [players]);
  const sceneIndex = SCENES.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const scene = SCENES[sceneIndex];
  const spoken = useRef(-1);
  const sounds = useRef(new Set());

  useEffect(() => {
    if (spoken.current === sceneIndex) return;
    spoken.current = sceneIndex;
    speak(scene.say);
  }, [sceneIndex, scene.say]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch (error) { /* ignore */ } }, []);

  const cue = (key, at, play) => {
    if (t >= at && !sounds.current.has(key)) { sounds.current.add(key); play(); }
  };
  cue('candle', 10500, sfx.candle);
  cue('hit1', 17450, sfx.hit);
  cue('hit2', 26450, sfx.hit);
  cue('banish', 26700, sfx.banish);
  cue('fizzle', 31950, sfx.fizzle);
  cue('boss', 44000, sfx.boss);
  cue('souls', 48000, sfx.soulDone);
  cue('won', 52200, sfx.won);

  // Who's where
  // Bigger than in the game, so everyone can see who's doing what.
  const spots = [{ x: 1250, y: 600 }, { x: 1360, y: 790 }, { x: 1250, y: 980 }];
  const ghost = { x: 0.42, lane: 1 };
  const ghostTo = { x: monsterX(ghost.x), y: laneY(ghost.lane) - 95 };
  const kingTo = { x: monsterX(0.32), y: laneY(1.5) - 180 };
  const poses = cast.map(() => ({ pose: 'stand', k: 0 }));
  const throwPose = (i, at) => { if (between(t, at, at + 450)) poses[i] = { pose: 'throw', k: Math.round(((t - at) / 450) * 10) / 10 }; };
  if (between(t, 10500, 11600)) cast.forEach((_, i) => { poses[i] = { pose: 'scared', k: 0 }; });
  throwPose(0, 17000);
  throwPose(1, 26000);
  if (between(t, 26700, 28400)) poses[1] = { pose: 'cheer', k: 0 };
  throwPose(2, 31500);
  if (between(t, 31950, 35500)) poses[2] = { pose: 'scared', k: 0 };
  if (between(t, 47200, 51000)) cast.forEach((_, i) => { poses[i] = { pose: 'cheer', k: 0 }; });
  if (t >= 52000) cast.forEach((_, i) => { poses[i] = { pose: i === 1 ? 'wave' : 'cheer', k: 0 }; });

  const candles = between(t, 10500, 12500) ? 4 : 5;
  const title = sceneIndex === 0 || sceneIndex === SCENES.length - 1;

  return (
    <div className="lc-howto">
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <Backdrop />
        <House candles={candles} maxCandles={5} flash={between(t, 10500, 11000)} />

        {/* 1: a zombie walks up and blows out a candle */}
        {between(t, 5500, 10500) && <DemoMonster kind="zombie" x={0.2 + 0.8 * ease((t - 6000) / 4500)} lane={3} need={['salt', 'candy']} tag="Z" />}
        {between(t, 10500, 11600) && (
          <text x="1680" y={520 - ((t - 10500) / 1100) * 60} fontSize="64" fontWeight="900" textAnchor="middle" fill="#ff6b6b" stroke="#16122b" strokeWidth="7" paintOrder="stroke">-1 🕯️</text>
        )}

        {/* 2-3: a ghost needs garlic and a bell */}
        {between(t, 12500, 26700) && (
          <DemoMonster kind="ghost" x={ghost.x} lane={ghost.lane} tag="A" need={[...(t < 17450 ? ['garlic'] : []), ...(t < 26450 ? ['bell'] : [])]} />
        )}
        {between(t, 12500, 16500) && (
          <g transform={`translate(${ghostTo.x + 70} ${ghostTo.y - 150})`} opacity={ease((t - 13000) / 400)}>
            <text fontSize="70" textAnchor="middle">👇</text>
          </g>
        )}
        <Throw from={spots[0]} to={ghostTo} charm="garlic" t={t} at={17000} />
        <Throw from={spots[1]} to={ghostTo} charm="bell" t={t} at={26000} />
        <Poof x={ghostTo.x} y={ghostTo.y} k={(t - 26600) / 900} />
        {between(t, 20500, 25500) && <Bubble x={spots[0].x} y={spots[0].y - 225} text="Who has a bell?!" k={(t - 20500) / 1000} />}
        {between(t, 22800, 26000) && <Bubble x={spots[1].x} y={spots[1].y - 225} text="Me!" k={(t - 22800) / 1000} />}

        {/* 4: a star nobody needs */}
        <Throw from={spots[2]} to={{ x: 700, y: 560 }} charm="star" t={t} at={31500} />
        {between(t, 31950, 35500) && (
          <text x={spots[2].x} y={spots[2].y - 230} fontSize="34" fontWeight="900" textAnchor="middle" fill="#ff6b6b" stroke="#16122b" strokeWidth="5" paintOrder="stroke">SPOOKED!</text>
        )}

        {/* 5: fog */}
        {between(t, 36000, 43500) && <DemoMonster kind="bat" x={0.38} lane={2} tag="B" need={['salt', 'candy']} fog />}
        {between(t, 39000, 43000) && <Bubble x={spots[0].x} y={spots[0].y - 225} text="B needs salt + candy!" k={(t - 39000) / 1000} />}

        {/* 6: the Pumpkin King */}
        {between(t, 43500, 48600) && (
          <DemoMonster
            kind="king"
            x={0.18 + 0.14 * ease((t - 43500) / 2500)}
            lane={1.5}
            scale={1.6}
            tag="👑"
            need={[]}
          />
        )}
        {between(t, 45500, 47200) && (
          <text x="620" y="560" fontSize="120" fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="8" paintOrder="stroke" fontFamily="Creepster, Arial Black, Arial">
            {t < 46000 ? '3' : t < 46500 ? '2' : t < 47000 ? '1' : 'SOUL!'}
          </text>
        )}
        <Poof x={kingTo.x} y={kingTo.y} k={(t - 48000) / 1300} big />

        {cast.map((p, i) => <ScenePerson key={i} look={p.look} pose={poses[i].pose} k={poses[i].k} x={spots[i].x} y={spots[i].y} delay={i} scale={0.72} />)}
        {cast.map((p, i) => <PlayerTag key={i} name={p.name} x={spots[i].x} y={spots[i].y} />)}

        {/* The phone */}
        {between(t, 12500, 19500) && <DemoPhone owner={cast[0].name} hand={{ cards: ['garlic', 'salt', 'candy'], tap: 0 }} tapAt={17000} t={t} show={13500} />}
        {between(t, 19500, 29500) && <DemoPhone owner={cast[1].name} hand={{ cards: ['bell', 'herb', 'bone'], tap: 0 }} tapAt={26000} t={t} show={19700} />}
        {between(t, 29500, 36000) && <DemoPhone owner={cast[2].name} hand={{ cards: ['star', 'crystal', 'salt'], tap: 0 }} tapAt={31500} spookedAt={31950} t={t} show={29700} />}
        {between(t, 36000, 43500) && <DemoPhone owner={cast[0].name} secret={{ tag: 'B', need: ['salt', 'candy'] }} t={t} show={36800} />}
        {between(t, 43500, 51000) && <DemoPhone owner={cast[1].name} soul tapAt={47000} t={t} show={44200} />}
      </svg>

      <div className={`lc-howto-caption${title ? ' is-title' : ''}`} key={sceneIndex}>
        {title ? <h2 className="lc-title">{sceneIndex === 0 ? 'Last Candle' : scene.title}</h2> : null}
        {sceneIndex === 0 && <p>How to play</p>}
        {!title && (
          <p>
            <span className="lc-howto-step">{scene.step}</span>
            {scene.title}
          </p>
        )}
      </div>
      <div className="lc-howto-bar"><span style={{ width: `${clamp(t / HOWTO_MS) * 100}%` }} /></div>
      <button type="button" className="lc-btn lc-howto-skip" onClick={onSkip}>Skip intro ⏭</button>
    </div>
  );
}
