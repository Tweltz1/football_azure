import React, { useEffect, useMemo, useRef } from 'react';
import { sfx } from '../sound';
import { PlayerTag, ScenePerson } from '../scene';
import { dot, ell, line, path } from '../inkArt';
import { INK } from '../cartoon';
import {
  awards, dinnersSaved, DONE_MS, INTRO_MS, PEN, ROUNDS, timeLeft, totalPenned, YARD,
} from './turkeyTrot';

// Turkey Trot on the TV: a farmyard at sunset, seen from a little above. The art is shared with the
// how-to-play intro through TrotScene.

const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };

// ---------- Art ----------
const FAN = ['#b5402c', '#e0702a', '#f2b33d', '#e0702a', '#b5402c', '#7a4a24'];
const GOLD_FAN = ['#f5c542', '#ffe58a', '#fff6c8', '#ffe58a', '#f5c542', '#d9a21a'];

/** A side-view turkey facing right, feet at 0,0 and about 120 tall. step animates the legs. */
export const turkeyMarkup = (golden, step, peck) => {
  const fan = golden ? GOLD_FAN : FAN;
  const body = golden ? '#f0b52a' : '#7d4f2a';
  const wing = golden ? '#d99a12' : '#5e3a1e';
  const a = Math.sin(step) * 12;
  const head = peck ? 'translate(16 30) rotate(35 30 -96)' : '';
  return `<ellipse cx="0" cy="0" rx="38" ry="9" fill="#000" fill-opacity=".28"/>`
    + `<g transform="rotate(-18 -22 -60)">${[-62, -38, -14, 10, 34].map((r, i) => `<g transform="rotate(${r} -22 -60)">${ell(-22, -112, 15, 44, fan[i], 4)}${ell(-22, -146, 8, 9, fan[(i + 2) % fan.length], 3)}</g>`).join('')}</g>`
    + line(`M-6 -32 L${-6 + a} -4 M10 -32 L${10 - a} -4`, INK, 9) + line(`M-6 -32 L${-6 + a} -4 M10 -32 L${10 - a} -4`, '#f2a03d', 4)
    + line(`M${-14 + a} -3 L${2 + a} -3 M${2 - a} -3 L${18 - a} -3`, INK, 5)
    + ell(0, -54, 38, 30, body)
    + path('M-26 -62 Q0 -84 22 -58 Q6 -40 -22 -42 Z', wing, 4)
    + line('M-14 -56 Q-2 -62 8 -54 M-16 -48 Q-4 -52 6 -46', golden ? '#fff1b0' : '#9b6a3c', 3)
    + `<g transform="${head}">`
    + line('M18 -68 Q32 -80 30 -100', INK, 16) + line('M18 -68 Q32 -80 30 -100', golden ? '#ffe58a' : '#e8b49a', 9)
    + ell(32, -104, 15, 14, golden ? '#ffe58a' : '#e8b49a')
    + path('M44 -108 L58 -102 L44 -97 Z', '#f5a623', 3)
    + `<path d="M44 -98 Q50 -86 44 -76 Q38 -84 41 -97 Z" fill="#d33b3b" stroke="${INK}" stroke-width="3"/>`
    + dot(36, -108, 4.2, INK) + dot(37.3, -109.4, 1.4, '#fff')
    + '</g>'
    + (golden ? `<g class="lc-star">${dot(-46, -130, 4, '#fff')}${dot(30, -142, 3, '#fff')}${dot(-60, -80, 3, '#fff')}</g>` : '');
};

const Turkey = React.memo(({ golden, step, peck }) => {
  const markup = useMemo(() => turkeyMarkup(golden, step, peck), [golden, step, peck]);
  return <g dangerouslySetInnerHTML={{ __html: markup }} />;
});

const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const LEAVES = Array.from({ length: 46 }, (_, i) => ({
  x: YARD.x1 + rnd(i) * (YARD.x2 - YARD.x1), y: YARD.y1 + 40 + rnd(i + 99) * (YARD.y2 - YARD.y1), r: rnd(i + 7) * 360, c: ['#d9541e', '#f2a03d', '#b5402c', '#e8c547'][i % 4],
})).filter((l) => !(l.x > PEN.x1 - 20 && l.x < PEN.x2 + 20 && l.y < PEN.y2 + 20));
const leaf = (c) => `<path d="M0 -10 Q9 -2 0 10 Q-9 -2 0 -10 Z" fill="${c}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
const pumpkin = (s = 1) => `<g transform="scale(${s})">${ell(-14, -22, 16, 20, '#e0702a', 4)}${ell(14, -22, 16, 20, '#e0702a', 4)}${ell(0, -22, 16, 22, '#f08a2e', 4)}${line('M0 -42 Q2 -52 8 -56', '#3f6b2a', 5)}</g>`;
const hay = `${path('M-60 0 L-60 -56 Q0 -70 60 -56 L60 0 Z', '#e8c35a')}${line('M-56 -18 L56 -18 M-56 -38 L56 -38', '#c99a2b', 4)}${line('M-40 -60 L-46 -70 M-10 -64 L-12 -76 M24 -62 L30 -74', '#c99a2b', 3)}`;
const tree = (c1, c2) => `${line('M0 0 L0 -70', INK, 18)}${line('M0 0 L0 -70', '#6b4226', 11)}${ell(0, -110, 62, 54, c1)}${ell(-30, -86, 36, 30, c2)}${ell(34, -90, 34, 28, c2)}${ell(6, -140, 34, 28, c2)}`;
const STATIC_ART = {
  hay, pumpkin: pumpkin(1), pumpkinSmall: pumpkin(0.7),
  treeA: tree('#d9541e', '#f2a03d'), treeB: tree('#b5402c', '#e0702a'), treeC: tree('#e8b630', '#f6d66a'),
};
const Art = ({ name, x, y, s = 1, flip }) => <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} dangerouslySetInnerHTML={{ __html: STATIC_ART[name] }} />;

const FencePosts = ({ x1, x2, y, step = 90 }) => {
  const posts = [];
  for (let x = x1; x <= x2 + 1; x += step) posts.push(x);
  return (
    <g>
      <path d={`M${x1} ${y - 46} H${x2} M${x1} ${y - 20} H${x2}`} stroke={INK} strokeWidth="14" strokeLinecap="round" />
      <path d={`M${x1} ${y - 46} H${x2} M${x1} ${y - 20} H${x2}`} stroke="#c58a4a" strokeWidth="7" strokeLinecap="round" />
      {posts.map((x) => <rect key={x} x={x - 8} y={y - 64} width="16" height="66" rx="4" fill="#a8703a" stroke={INK} strokeWidth="4" />)}
    </g>
  );
};

/** The farmyard behind everything: sky, trees, barn, farmhouse, fences, the pen floor and the leaves. */
export const TrotBackdrop = ({ dusk = 0 }) => (
  <g>
    <defs>
      <linearGradient id="tt-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={dusk > 0.5 ? '#5a3a7a' : '#ff9a5a'} />
        <stop offset="1" stopColor={dusk > 0.5 ? '#ff8a5a' : '#ffe0a0'} />
      </linearGradient>
      <pattern id="tt-grass" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
        <rect width="120" height="120" fill="#6a9a3e" />
        <rect width="60" height="120" fill="#75a646" />
      </pattern>
      <linearGradient id="tt-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a1a10" stopOpacity="0.28" />
        <stop offset="0.25" stopColor="#2a1a10" stopOpacity="0" />
        <stop offset="1" stopColor="#2a1a10" stopOpacity="0.18" />
      </linearGradient>
    </defs>
    <rect width="1920" height="340" fill="url(#tt-sky)" />
    <circle cx="1220" cy="215" r="70" fill="#fff1b8" opacity="0.9" />
    <path d="M0 250 Q240 170 520 230 Q820 160 1100 225 Q1420 150 1920 230 L1920 340 L0 340 Z" fill="#b8763a" opacity="0.55" />
    <path d="M0 290 Q300 240 640 280 Q980 230 1320 280 Q1640 240 1920 280 L1920 340 L0 340 Z" fill="#8a5a2a" opacity="0.6" />
    {[[460, 318, 'treeA', 0.9], [560, 326, 'treeC', 0.7], [660, 318, 'treeB', 0.85], [1260, 318, 'treeC', 0.8], [1360, 326, 'treeA', 0.95], [1460, 320, 'treeB', 0.75]].map(([x, y, n, s]) => <Art key={x} name={n} x={x} y={y} s={s} />)}
    {/* barn */}
    <g transform="translate(250 330)">
      <path d="M-170 0 L-170 -150 L-120 -230 L120 -230 L170 -150 L170 0 Z" fill="#b8322a" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M-185 -145 L-122 -246 L122 -246 L185 -145" fill="none" stroke={INK} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-185 -145 L-122 -246 L122 -246 L185 -145" fill="none" stroke="#f4ead2" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="-70" y="-120" width="140" height="120" fill="#8a2420" stroke={INK} strokeWidth="6" />
      <path d="M-70 -120 L70 0 M70 -120 L-70 0" stroke="#f4ead2" strokeWidth="9" />
      <rect x="-70" y="-120" width="140" height="120" fill="none" stroke="#f4ead2" strokeWidth="8" />
      <rect x="-34" y="-200" width="68" height="50" fill="#ffcf5a" stroke={INK} strokeWidth="6" />
      <path d="M0 -200 V-150 M-34 -175 H34" stroke={INK} strokeWidth="4" />
    </g>
    {/* farmhouse, dinner's nearly ready */}
    <g transform="translate(1680 330)">
      <rect x="-180" y="-170" width="360" height="170" fill="#e8d6b0" stroke={INK} strokeWidth="7" />
      <path d="M-205 -165 L0 -280 L205 -165 Z" fill="#6a3a2a" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <rect x="90" y="-280" width="40" height="80" fill="#8a4a32" stroke={INK} strokeWidth="6" />
      <g className="lc-smoke"><circle cx="110" cy="-300" r="14" fill="#efe6dc" opacity="0.8" /><circle cx="124" cy="-326" r="18" fill="#efe6dc" opacity="0.6" /></g>
      {[-110, 110].map((x) => (
        <g key={x}>
          <rect x={x - 42} y="-130" width="84" height="70" rx="6" fill="#ffcf5a" stroke={INK} strokeWidth="6" className="lc-window" />
          <path d={`M${x} -130 V-60 M${x - 42} -95 H${x + 42}`} stroke={INK} strokeWidth="4" />
        </g>
      ))}
      <rect x="-34" y="-110" width="68" height="110" rx="8" fill="#7a3a22" stroke={INK} strokeWidth="6" />
      <circle cx="20" cy="-55" r="5" fill="#f5c542" />
      <path d="M-50 -130 Q0 -150 50 -130" fill="none" stroke="#c0392b" strokeWidth="8" strokeLinecap="round" />
    </g>
    {/* the yard */}
    <rect x="0" y="300" width="1920" height="780" fill="url(#tt-grass)" />
    <rect x="0" y="300" width="1920" height="780" fill="url(#tt-shade)" />
    {LEAVES.map((l, i) => <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r})`} dangerouslySetInnerHTML={{ __html: leaf(l.c) }} />)}
    <FencePosts x1={20} x2={PEN.x1 - 10} y={YARD.y1} />
    <FencePosts x1={PEN.x2 + 10} x2={1900} y={YARD.y1} />
    {/* the pen */}
    <rect x={PEN.x1} y={PEN.y1} width={PEN.x2 - PEN.x1} height={PEN.y2 - PEN.y1} fill="#d9b45a" stroke={INK} strokeWidth="5" />
    {Array.from({ length: 22 }, (_, i) => <path key={i} d={`M${PEN.x1 + 20 + rnd(i + 300) * (PEN.x2 - PEN.x1 - 40)} ${PEN.y1 + 20 + rnd(i + 400) * (PEN.y2 - PEN.y1 - 40)} l${-10 + rnd(i) * 20} -8`} stroke="#b08a34" strokeWidth="4" strokeLinecap="round" />)}
    <FencePosts x1={PEN.x1} x2={PEN.x2} y={PEN.y1 + 10} step={72} />
    <Art name="hay" x={PEN.x1 + 60} y={PEN.y1 + 70} s={0.8} />
    <g transform={`translate(${(PEN.x1 + PEN.x2) / 2} ${PEN.y1 - 60})`}>
      <path d="M-8 0 V70 M8 0 V70" stroke={INK} strokeWidth="10" /><path d="M-8 0 V70 M8 0 V70" stroke="#a8703a" strokeWidth="5" />
      <rect x="-150" y="-36" width="300" height="64" rx="10" fill="#f4ead2" stroke={INK} strokeWidth="6" />
      <text y="-2" fontSize="38" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#8a2420" style={{ fontFamily: 'var(--lc-spooky), Arial Black, Arial' }}>TURKEY PEN</text>
    </g>
    <Art name="hay" x={560} y={392} s={0.9} />
    <Art name="hay" x={1370} y={396} s={0.8} flip />
    <Art name="pumpkin" x={640} y={390} />
    <Art name="pumpkinSmall" x={1300} y={392} />
    <Art name="pumpkin" x={110} y={1000} s={0.9} />
    <Art name="pumpkinSmall" x={1815} y={990} />
  </g>
);

// The pen's side fences go in front of anything behind them; drawn after the critters.
const PenSides = () => (
  <g>
    {[PEN.x1, PEN.x2].map((x) => (
      <g key={x}>
        <path d={`M${x} ${PEN.y1 - 30} V${PEN.y2 - 20}`} stroke={INK} strokeWidth="14" strokeLinecap="round" />
        <path d={`M${x} ${PEN.y1 - 30} V${PEN.y2 - 20}`} stroke="#c58a4a" strokeWidth="7" strokeLinecap="round" />
        {[PEN.y1 + 40, PEN.y1 + 120, PEN.y2 - 4].map((y) => <rect key={y} x={x - 9} y={y - 56} width="18" height="62" rx="4" fill="#a8703a" stroke={INK} strokeWidth="4" />)}
      </g>
    ))}
    {/* the gate, swung wide open */}
    {[[PEN.x1, -1], [PEN.x2, 1]].map(([x, s]) => (
      <g key={x} transform={`translate(${x} ${PEN.y2}) scale(${s} 1)`}>
        <path d="M0 -50 L-90 -10 M0 -22 L-90 18 M0 -50 L-90 18" stroke={INK} strokeWidth="12" strokeLinecap="round" />
        <path d="M0 -50 L-90 -10 M0 -22 L-90 18 M0 -50 L-90 18" stroke="#e0b070" strokeWidth="6" strokeLinecap="round" />
      </g>
    ))}
  </g>
);

const FrontFence = () => (
  <g opacity="0.95"><FencePosts x1={-10} x2={1930} y={1102} step={110} /></g>
);

const Gobble = ({ x, y, k }) => (
  <g transform={`translate(${x} ${y}) scale(${ease(k * 4)})`} opacity={1 - Math.max(0, k - 0.7) / 0.3}>
    <rect x="-62" y="-26" width="124" height="40" rx="18" fill="#fff6e3" stroke={INK} strokeWidth="4" />
    <path d="M-6 12 L4 26 L10 12 Z" fill="#fff6e3" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <text y="-5" fontSize="22" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#8a2420">GOBBLE!</text>
  </g>
);

const Burst = ({ fx, now }) => {
  const k = (now - fx.at) / 1100;
  if (k < 0 || k > 1) return null;
  return (
    <g>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <ellipse key={i} cx={fx.x + Math.cos(a) * 90 * ease(k)} cy={fx.y - 30 + Math.sin(a) * 60 * ease(k) + 40 * k * k} rx="6" ry="16" transform={`rotate(${i * 45 + k * 200} ${fx.x + Math.cos(a) * 90 * ease(k)} ${fx.y - 30 + Math.sin(a) * 60 * ease(k) + 40 * k * k})`} fill={fx.golden ? '#ffe58a' : FAN[i % 5]} stroke={INK} strokeWidth="2" opacity={1 - k} />;
      })}
      <text x={fx.x} y={fx.y - 90 - 60 * ease(k)} fontSize={fx.golden ? 64 : 52} fontWeight="900" textAnchor="middle" fill={fx.golden ? '#ffe066' : '#fff'} stroke={INK} strokeWidth="6" paintOrder="stroke" opacity={1 - Math.max(0, k - 0.6) / 0.4}>{fx.text}</text>
    </g>
  );
};

/** Everything in the yard. farmers: [{ key, x, y, facing, moving, walk, look, name, color, vip, pose }]. turkeys: engine turkeys. */
export function TrotScene({ farmers, turkeys, fx = [], now, dusk }) {
  const things = [
    ...turkeys.map((t) => ({ kind: 't', y: t.y, t })),
    ...farmers.map((f) => ({ kind: 'f', y: f.y, f })),
  ].sort((a, b) => a.y - b.y);
  return (
    <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
      <TrotBackdrop dusk={dusk} />
      {things.map((o) => {
        if (o.kind === 't') {
          const { t } = o;
          const facing = t.vx < -5 ? -1 : 1;
          const fast = Math.hypot(t.vx, t.vy) > 160;
          const hop = Math.abs(Math.sin(t.step)) * (fast ? 10 : 3);
          const step = Math.round(t.step * 2) / 2;
          return (
            <g key={`t${t.id}`}>
              <g transform={`translate(${t.x} ${t.y - hop}) scale(${facing * (t.golden ? 0.85 : 0.7)} ${t.golden ? 0.85 : 0.7})`}>
                <Turkey golden={t.golden} step={step} peck={Boolean(t.peck && !t.penned)} />
              </g>
              {!t.penned && t.scaredAt != null && now - t.scaredAt < 900 && <Gobble x={t.x} y={t.y - 130} k={(now - t.scaredAt) / 900} />}
            </g>
          );
        }
        const { f } = o;
        const k = f.moving ? (Math.floor(f.walk) % 6) * (Math.PI / 3) : 0;
        return (
          <g key={f.key}>
            <ellipse cx={f.x} cy={f.y} rx="44" ry="13" fill="none" stroke={INK} strokeWidth="9" />
            <ellipse cx={f.x} cy={f.y} rx="44" ry="13" fill="none" stroke={f.color} strokeWidth="5" />
            <g transform={`translate(${f.x} ${f.y}) scale(${f.facing < 0 ? -1 : 1} 1)`}>
              <ScenePerson look={f.look} pose={f.pose || (f.moving ? 'walk' : 'stand')} k={k} x={0} y={0} delay={f.delay || 0} scale={0.47} />
            </g>
            <PlayerTag name={f.name} vip={f.vip} x={f.x} y={f.y + 6} color={f.tag} />
          </g>
        );
      })}
      <PenSides />
      {fx.map((e, i) => <Burst key={`${e.at}-${i}`} fx={e} now={now} />)}
      <FrontFence />
    </svg>
  );
}

const fmt = (ms) => { const sec = Math.ceil(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };

/** Turkey Trot on the TV. */
export default function TrotStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const lastGobble = useRef(0);
  const elapsed = now - game.phaseAt;
  useEffect(() => {
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      switch (e.type) {
        case 'round': sfx.night(); break;
        case 'go': sfx.whoosh(); break;
        case 'gobble':
          if (performance.now() - lastGobble.current > 450) { lastGobble.current = performance.now(); sfx.gobble(); }
          break;
        case 'penned': sfx.banish(); break;
        case 'golden': sfx.soulDone(); sfx.banish(); break;
        case 'hurry': sfx.tick(); break;
        case 'saved': sfx.won(); break;
        case 'missed': sfx.fizzle(); break;
        case 'over': sfx.won(); break;
        default: break;
      }
    });
  });

  const plan = ROUNDS[game.round];
  const left = timeLeft(game, now);
  const farmers = players.map((p, i) => {
    const f = game.farmers[p.cid];
    if (!f) return null;
    let pose;
    if (game.phase === 'done') pose = game.saved[game.round]?.saved ? 'cheer' : 'scared';
    if (game.phase === 'over') pose = 'cheer';
    return {
      key: p.cid, x: f.x, y: f.y, facing: f.facing, moving: Boolean(f.dx || f.dy) && game.phase === 'play', walk: f.walk,
      look: p.look, name: p.name, color: f.color, vip: i === 0, pose, delay: i % 4,
    };
  }).filter(Boolean);
  const result = game.phase === 'done' ? game.saved[game.round] : null;
  const hurry = game.phase === 'play' && left <= 10000;

  return (
    <>
      <TrotScene farmers={farmers} turkeys={game.turkeys} fx={game.fx} now={now} dusk={game.round / 2} />

      <div className="lq-hud lh-hud">
        <span className="lq-pill">Round {game.round + 1} of {ROUNDS.length}</span>
        <span className="lq-pill">🦃 <b>{game.penned}</b> / {plan.goal} in the pen</span>
        <span className="lq-pill">{game.score.toLocaleString()} pts</span>
      </div>
      {(game.phase === 'play' || game.phase === 'intro') && (
        <div className={`tt-clock${hurry ? ' is-hurry' : ''}`}><span>🔔 Dinner in</span><b>{fmt(left)}</b></div>
      )}

      {game.phase === 'intro' && (
        <div className="lc-card lh-floor" key={`r${game.round}`}>
          <div className="lc-card-kicker">Round {game.round + 1} of {ROUNDS.length}</div>
          <h2 className="lc-title">{plan.title}</h2>
          <p>Pen <b>{plan.goal}</b> of the <b>{plan.turkeys}</b> turkeys before the dinner bell!</p>
          {plan.golden && <p className="lh-small">✨ Watch for the <b>golden turkey</b>. It's fast, and worth triple!</p>}
          <p className="lh-small">Walk up behind a turkey and it runs the other way. Steer them in through the gate.</p>
          <div className="lc-countdown">{Math.max(1, Math.ceil((INTRO_MS - elapsed) / 1000))}</div>
        </div>
      )}

      {result && elapsed > 600 && elapsed < DONE_MS && (
        <div className={`lh-result ${result.saved ? 'is-safe' : 'is-bad'}`}>
          {result.all ? 'Every turkey penned! 🦃🏆' : result.saved ? `Dinner is saved! ${result.penned} penned` : `They got away! ${result.penned} of ${result.goal}`}
        </div>
      )}

      {game.phase === 'over' && elapsed > 900 && (
        <div className="lc-card lc-end won">
          <h2 className="lc-title">{dinnersSaved(game) === ROUNDS.length ? 'Happy Thanksgiving!' : 'Dinner is served!'}</h2>
          <p>The crew penned <b>{totalPenned(game)}</b> turkeys and saved <b>{dinnersSaved(game)}</b> of {ROUNDS.length} dinners. Team score: <b>{game.score.toLocaleString()}</b></p>
          <div className="lq-award-chips">
            {awards(game).map((a) => {
              const p = players.find((x) => x.cid === a.cid);
              return p ? <span key={a.title}>🏆 <b>{a.title}</b> {p.name} <small>({a.blurb})</small></span> : null;
            })}
          </div>
          <div className="lc-end-actions">
            <button type="button" className="lc-btn" onClick={onLobby}>Back to the lobby</button>
            <button type="button" className="lc-btn lc-btn-ghost" onClick={onAgain}>Play again</button>
          </div>
        </div>
      )}
    </>
  );
}
