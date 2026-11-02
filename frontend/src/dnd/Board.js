import React, { useMemo } from 'react';
import { personMarkup } from '../party/cartoon';
import { parseLook } from '../party/look';
import { settingFor } from './settings';
import { BASE, groundTile, iso, propArt, TH, TW, WALL, wallTile } from './iso';
import { drawPos } from './engine';
import { tileAt } from './movement';

const CLASS_RING = {
  fighter: '#d33b3b', barbarian: '#ff8a2a', rogue: '#6d6a70', ranger: '#3a8f3f', wizard: '#2f6bff', cleric: '#f5e6a8', bard: '#ff5fa2', paladin: '#d4af37',
};

const bounds = (map) => {
  const left = iso(0, map.h - 1).sx - TW / 2 - 20;
  const right = iso(map.w - 1, 0).sx + TW / 2 + 20;
  const top = -WALL - 110;
  const bottom = iso(map.w - 1, map.h - 1).sy + TH / 2 + BASE + 30;
  return { left, top, width: right - left, height: bottom - top };
};

const groundAt = (map, x, y) => tileAt(map, Math.round(x), Math.round(y))?.e || 0;

// Static layers: built once per map (and again when a chest is opened).
const useStatic = (map) => {
  const propKey = map.tiles.map((t) => t.p || '').join('|');
  return useMemo(() => {
    const pal = settingFor(map.setting).palette;
    let ground = '';
    const things = [];
    for (let d = 0; d < map.w + map.h; d += 1) {
      for (let x = 0; x < map.w; x += 1) {
        const y = d - x;
        if (y < 0 || y >= map.h) continue;
        const tile = map.tiles[y * map.w + x];
        if (tile.t === 'void') continue;
        if (tile.t === 'wall') {
          things.push({ depth: x + y, key: `w${x},${y}`, html: wallTile(tile, x, y, pal) });
        } else {
          ground += groundTile(tile, x, y, pal);
          if (tile.p) {
            const { sx, sy } = iso(x, y, tile.e);
            things.push({ depth: x + y + 0.1, key: `p${x},${y}`, html: propArt(tile.p, sx, sy) });
          }
        }
      }
    }
    return { ground, things };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.seed, map.setting, propKey]);
};

const HpBar = ({ hp, maxHp, x, y, w = 46, foe }) => {
  const k = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  const color = foe ? '#ff5a4f' : k > 0.5 ? '#39e75f' : k > 0.25 ? '#ffe066' : '#ff5a4f';
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={8} rx={4} fill="#16122b" />
      <rect x={x - w / 2 + 1.5} y={y + 1.5} width={(w - 3) * k} height={5} rx={2.5} fill={color} />
    </g>
  );
};

const Hero = React.memo(({ look, sx, sy, name, hp, maxHp, cls, down, dead, active, walking, now }) => {
  const frame = walking ? Math.floor(now / 90) : 0;
  const markup = useMemo(() => personMarkup(parseLook(look), { kind: walking ? 'walk' : active ? 'wave' : 'stand', k: (frame * 0.9) % 6.28 }), [look, walking, active, frame]);
  const ring = CLASS_RING[cls] || '#ffe066';
  return (
    <g transform={`translate(${sx} ${sy})`}>
      <ellipse cx="0" cy="0" rx="26" ry="13" fill="rgba(0,0,0,0.35)" />
      <ellipse cx="0" cy="0" rx="24" ry="12" fill="none" stroke={ring} strokeWidth="4" />
      {active && <ellipse cx="0" cy="0" rx="34" ry="17" fill="none" stroke="#ffe066" strokeWidth="4" className="dq-pulse" />}
      {dead ? (
        <text x="0" y="-12" fontSize="34" textAnchor="middle">🪦</text>
      ) : (
        <g transform={down ? 'translate(-30 -6) rotate(-80) scale(0.2)' : 'scale(0.23)'} opacity={down ? 0.7 : 1}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: markup }} />
      )}
      <HpBar hp={hp} maxHp={maxHp} x={0} y={down ? -30 : -92} />
      <text x="0" y={down ? -36 : -98} className="dq-name" textAnchor="middle">{name}</text>
    </g>
  );
});

const Foe = ({ sx, sy, glyph, color, name, hp, maxHp, boss, active }) => {
  const size = boss ? 58 : 38;
  return (
    <g transform={`translate(${sx} ${sy})`} className="dq-foe">
      <ellipse cx="0" cy="0" rx={boss ? 36 : 24} ry={boss ? 18 : 12} fill="rgba(0,0,0,0.4)" />
      <ellipse cx="0" cy="0" rx={boss ? 32 : 22} ry={boss ? 16 : 11} fill={color} stroke="#16122b" strokeWidth="3" />
      {active && <ellipse cx="0" cy="0" rx={boss ? 42 : 32} ry={boss ? 21 : 16} fill="none" stroke="#ff5a4f" strokeWidth="4" className="dq-pulse" />}
      <text x="0" y={-size * 0.35} fontSize={size} textAnchor="middle" className="lc-bob">{glyph}</text>
      <HpBar hp={hp} maxHp={maxHp} x={0} y={-size - 14} w={boss ? 70 : 46} foe />
      {boss && <text x="0" y={-size - 20} className="dq-name dq-boss" textAnchor="middle">{name}</text>}
    </g>
  );
};

/**
 * The isometric board. reach: optional list of [x, y, feet] squares to light up (the current hero's moves).
 */
export default function Board({ game, now, reach = null, showHidden = false }) {
  const { map } = game;
  const s = settingFor(map.setting);
  const box = useMemo(() => bounds(map), [map]);
  const { ground, things } = useStatic(map);
  const turnId = game.combat ? game.combat.order[game.combat.turn] : null;

  const tokens = game.tokens
    .filter((t) => !t.gone && !(t.side === 'foe' && (t.dead || (t.hidden && !showHidden))))
    .map((t) => {
      const pos = drawPos(game, t, now);
      const e = groundAt(map, pos.x, pos.y);
      const { sx, sy } = iso(pos.x, pos.y, e);
      return { t, sx, sy, depth: pos.x + pos.y + 0.5, walking: pos.x !== t.x || pos.y !== t.y };
    });

  const layers = [
    ...things.map((th) => ({ depth: th.depth, key: th.key, el: <g key={th.key} dangerouslySetInnerHTML={{ __html: th.html }} /> })),
    ...tokens.map(({ t, sx, sy, depth, walking }) => ({
      depth,
      key: t.id,
      el: t.side === 'party'
        ? <Hero key={t.id} look={t.look} sx={sx} sy={sy} name={t.name} hp={t.hp} maxHp={t.maxHp} cls={t.sheet?.classId} down={t.hp <= 0 && !t.dead} dead={t.dead} active={t.id === turnId} walking={walking} now={now} />
        : <Foe key={t.id} sx={sx} sy={sy} glyph={t.glyph} color={t.color} name={t.name} hp={t.hp} maxHp={t.maxHp} boss={t.boss} active={t.id === turnId} />,
    })),
  ].sort((a, b) => a.depth - b.depth);

  // Light: dark places only show what's near the party's torches.
  const dark = s.light === 'dark';
  const lights = tokens.filter(({ t }) => t.side === 'party' && !t.dead);

  return (
    <svg className="dq-board" viewBox={`${box.left} ${box.top} ${box.width} ${box.height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="dq-torch">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="60%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="dq-dark">
          <rect x={box.left} y={box.top} width={box.width} height={box.height} fill="#2a2a2a" />
          {lights.map(({ t, sx, sy }) => <ellipse key={t.id} cx={sx} cy={sy - 20} rx={TW * 4.2} ry={TH * 4.2} fill="url(#dq-torch)" />)}
          {map.tiles.map((tile, i) => (tile.p === 'crystal' || tile.p === 'torch' || tile.p === 'hearth' || tile.p === 'candle' || tile.p === 'exit'
            ? <ellipse key={i} {...(() => { const p = iso(i % map.w, Math.floor(i / map.w), tile.e); return { cx: p.sx, cy: p.sy }; })()} rx={TW * 1.6} ry={TH * 1.6} fill="url(#dq-torch)" />
            : null))}
        </mask>
      </defs>
      <g mask={dark ? 'url(#dq-dark)' : undefined}>
        <g dangerouslySetInnerHTML={{ __html: ground }} />
        {reach && reach.map(([x, y]) => {
          const tile = tileAt(map, x, y);
          const { sx, sy } = iso(x, y, tile?.e || 0);
          return <polygon key={`r${x},${y}`} points={`${sx},${sy - TH / 2} ${sx + TW / 2},${sy} ${sx},${sy + TH / 2} ${sx - TW / 2},${sy}`} className="dq-reach" />;
        })}
        {layers.map((l) => l.el)}
      </g>
      {s.light === 'fog' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-fog" />}
      {s.light === 'cold' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-cold" />}
      {s.light === 'warm' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-warm" />}
      <text x={box.left + 10} y={box.top + box.height - 10} className="dq-scale">Each square is 5 ft · climbing one level costs +5 ft · a two-level drop is a cliff</text>
    </svg>
  );
}
