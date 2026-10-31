import React, { useMemo } from 'react';
import { personMarkup } from './cartoon';
import { parseLook } from './look';
import { CHARM } from './lastCandle';

// Pieces of the TV scene shared by the game and the how-to-play intro. The scene is 1920 x 1080.

export const LANE_Y = [470, 610, 750, 890];
export const PATH_LEFT = 150;
export const PATH_RIGHT = 1180;
export const THROW_MS = 450;

export const laneY = (lane) => (Number.isInteger(lane) ? LANE_Y[lane] : (LANE_Y[Math.floor(lane)] + LANE_Y[Math.ceil(lane)]) / 2 + 40);
export const monsterX = (x) => PATH_LEFT + Math.min(1, x) * (PATH_RIGHT - PATH_LEFT);
export const monsterScale = (m) => (m.boss ? 1.75 : 0.85);
// Where each player stands: at the end of a path, up to 3 per path, in front of the house.
export const spot = (index) => {
  const row = index % 4;
  const col = Math.floor(index / 4);
  return { x: 1250 + col * 92 + (row % 2) * 24, y: LANE_Y[row] + 22 };
};

export const CharmBadge = ({ id, x, y, r = 26, faded }) => {
  const charm = CHARM[id];
  return (
    <g transform={`translate(${x} ${y})`} opacity={faded ? 0.35 : 1}>
      <circle r={r} fill={charm ? charm.color : '#888'} stroke="#16122b" strokeWidth="5" />
      <text y="2" fontSize={r * 1.15} textAnchor="middle" dominantBaseline="central">{charm ? charm.icon : '?'}</text>
    </g>
  );
};

export const House = ({ candles, maxCandles, flash }) => {
  const slots = Array.from({ length: maxCandles }, (_, i) => i);
  return (
    <g className="lc-house">
      <path d="M1440 980 L1440 330 L1580 200 L1700 120 L1820 200 L1910 300 L1910 980 Z" fill="#2b2140" stroke="#16122b" strokeWidth="8" strokeLinejoin="round" />
      <path d="M1410 345 L1700 95 L1940 315" fill="none" stroke="#16122b" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1410 345 L1700 95 L1940 315" fill="none" stroke="#4a2f5e" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="1790" y="130" width="44" height="90" fill="#3a2a4a" stroke="#16122b" strokeWidth="6" />
      <circle cx="1700" cy="230" r="44" fill={flash ? '#ff5050' : '#ffcf5a'} stroke="#16122b" strokeWidth="7" className="lc-window" />
      <path d="M1700 186 L1700 274 M1656 230 L1744 230" stroke="#16122b" strokeWidth="6" />
      {[1500, 1810].map((wx) => (
        <g key={wx}>
          <rect x={wx - 50} y="330" width="100" height="120" rx="10" fill="#ffcf5a" stroke="#16122b" strokeWidth="7" className="lc-window" />
          <path d={`M${wx} 330 L${wx} 450 M${wx - 50} 390 L${wx + 50} 390`} stroke="#16122b" strokeWidth="6" />
        </g>
      ))}
      <rect x="1640" y="700" width="120" height="280" rx="60" fill="#5b3a26" stroke="#16122b" strokeWidth="8" />
      <circle cx="1735" cy="850" r="8" fill="#f5c542" />
      <rect x="1420" y="960" width="500" height="40" fill="#3a2a2a" stroke="#16122b" strokeWidth="6" />
      {/* the candles, along the porch rail */}
      <g transform="translate(1455 545)">
        <rect x="-10" y="40" width="460" height="18" rx="6" fill="#4a3430" stroke="#16122b" strokeWidth="5" />
        {slots.map((i) => {
          const lit = i < candles;
          const cx = 20 + i * (420 / Math.max(1, maxCandles - 1));
          return (
            <g key={i} transform={`translate(${cx} 40)`}>
              <rect x="-11" y="-44" width="22" height="44" rx="5" fill={lit ? '#f4ead2' : '#8d8578'} stroke="#16122b" strokeWidth="4" />
              <path d="M0 -44 L0 -52" stroke="#16122b" strokeWidth="3" />
              {lit ? <path className="lc-flame" d="M0 -78 Q12 -60 0 -50 Q-12 -60 0 -78 Z" fill="#ffb33a" stroke="#16122b" strokeWidth="3" />
                : <path className="lc-smoke" d="M0 -56 Q8 -66 0 -76 Q-8 -86 0 -96" fill="none" stroke="#9a96aa" strokeWidth="4" strokeLinecap="round" />}
            </g>
          );
        })}
      </g>
    </g>
  );
};

// Each night has its own setting: the front yard, a foggy graveyard, then a blood-moon midnight.
const SKIES = [
  ['#120c24', '#3a1f55', '#5a2d4f', '#1d3a2a', '#26492f', '#3e5e3a', '#fff1c1', '#efdca0'],
  ['#0f1420', '#2b3448', '#4a5468', '#22302c', '#2c3b35', '#47534a', '#e8ecf2', '#c9d0dc'],
  ['#14040c', '#4a0f24', '#7a1d2c', '#1f1a24', '#2a2230', '#40343f', '#ff8a6a', '#e0603f'],
];

export const Backdrop = ({ night = 1 }) => {
  const [top, mid, low, hill, ground, path, moon, crater] = SKIES[Math.min(SKIES.length, Math.max(1, night)) - 1];
  const graves = night === 2
    ? [[40, 520, 0.9], [70, 700, 1], [40, 880, 0.85], [110, 620, 0.7], [110, 800, 0.75], [250, 430, 0.6], [330, 450, 0.55], [700, 420, 0.5], [860, 440, 0.55], [980, 425, 0.5]]
    : [[40, 520, 0.9], [70, 700, 1], [40, 880, 0.85], [110, 620, 0.7], [110, 800, 0.75]];
  return (
    <g>
      <defs>
        <linearGradient id={`lc-sky${night}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={low} />
        </linearGradient>
        <radialGradient id={`lc-moonglow${night}`}>
          <stop offset="0" stopColor={moon} stopOpacity="0.55" />
          <stop offset="1" stopColor={moon} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1920" height="1080" fill={`url(#lc-sky${night})`} />
      <circle cx="330" cy="170" r={night === 3 ? 300 : 230} fill={`url(#lc-moonglow${night})`} />
      <circle cx="330" cy="170" r={night === 3 ? 125 : 95} fill={moon} stroke="#16122b" strokeWidth="6" />
      <circle cx="300" cy="150" r="16" fill={crater} /><circle cx="360" cy="200" r="11" fill={crater} /><circle cx="350" cy="130" r="8" fill={crater} />
      {night === 2 && <path d="M120 150 Q330 120 560 160 Q330 190 120 150 Z M180 215 Q380 190 600 225 Q380 250 180 215 Z" fill="#dfe3ee" opacity="0.35" />}
      {night === 3 && [[560, 120], [640, 90], [720, 140], [1060, 110], [1140, 80]].map(([x, y], i) => (
        <path key={i} className="lc-float" style={{ animationDelay: `${i * 0.3}s` }} transform={`translate(${x} ${y})`} d="M0 0 q-14 -14 -30 -4 q12 2 14 12 q4 -8 16 -8 q12 0 16 8 q2 -10 14 -12 q-16 -10 -30 4 z" fill="#16122b" />
      ))}
      {[[620, 90], [800, 160], [980, 70], [1180, 140], [1320, 60], [90, 300], [540, 260], [1080, 250]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 4} fill="#fff" className="lc-star" style={{ animationDelay: `${i * 0.37}s`, opacity: night === 2 ? 0.4 : 1 }} />
      ))}
      <path d="M0 420 Q200 360 420 400 Q700 340 1000 390 Q1250 350 1500 400 L1920 380 L1920 1080 L0 1080 Z" fill={hill} stroke="#16122b" strokeWidth="6" />
      <path d="M0 470 Q500 430 1000 470 Q1500 440 1920 460 L1920 1080 L0 1080 Z" fill={ground} />
      {LANE_Y.map((y) => (
        <path key={y} d={`M${PATH_LEFT - 90} ${y} L${PATH_RIGHT + 90} ${y}`} stroke={path} strokeWidth="64" strokeLinecap="round" opacity="0.8" />
      ))}
      {graves.map(([x, y, sc], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${sc})`}>
          <path d="M-34 0 L-34 -70 Q-34 -104 0 -104 Q34 -104 34 -70 L34 0 Z" fill="#8d8aa0" stroke="#16122b" strokeWidth="6" />
          <text y="-52" fontSize="22" fontWeight="900" textAnchor="middle" fill="#5d5a70" fontFamily="Arial Black, Arial">RIP</text>
        </g>
      ))}
      <path d="M520 420 L530 330 L490 280 M530 330 L560 260 L600 240 M545 300 L590 300" stroke="#16122b" strokeWidth="14" fill="none" strokeLinecap="round" />
      {night === 2 && (
        <g opacity="0.5">
          {[[300, 520], [900, 660], [500, 820], [1100, 900]].map(([x, y], i) => (
            <ellipse key={i} className="lc-drift" style={{ animationDelay: `${-i * 3}s` }} cx={x} cy={y} rx="420" ry="46" fill="#dfe3ee" opacity="0.35" />
          ))}
        </g>
      )}
      {night === 3 && <rect width="1920" height="1080" fill="#ff2040" opacity="0.06" />}
    </g>
  );
};

export const ScenePerson = React.memo(({ look, pose, k, x, y, delay, scale = 0.46 }) => {
  const markup = useMemo(() => personMarkup(parseLook(look), { kind: pose, k }), [look, pose, k]);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={`lc-bob lc-d${delay}`} dangerouslySetInnerHTML={{ __html: markup }} />
    </g>
  );
});

export const PlayerTag = ({ name, vip, x, y, color = '#1d1530' }) => {
  const label = `${vip ? '👑 ' : ''}${name}`;
  const w = Math.max(60, label.length * 10 + 18);
  return (
    <g transform={`translate(${x} ${y + 16})`}>
      <rect x={-w / 2} y="-13" width={w} height="26" rx="13" fill={color} stroke="#16122b" strokeWidth="3" opacity="0.92" />
      <text y="1" fontSize="17" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#fff">{label}</text>
    </g>
  );
};

/** The TV page: a room code to join, everyone's characters live, and the game. */
