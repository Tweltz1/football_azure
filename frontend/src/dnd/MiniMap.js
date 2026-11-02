import React, { useMemo, useRef } from 'react';
import { PROPS, settingFor } from './settings';
import { shade } from './iso';

const CODE_TILE = { '.': 'floor', '=': 'road', ',': 'diff', '#': 'wall', '~': 'water', ' ': 'void', '+': 'door' };
const PROP_IDS = Object.keys(PROPS);
const PROP_ICON = {
  tree: '🌳', pine: '🌲', deadtree: '🥀', rock: '🪨', table: '▭', barrel: '🛢️', crate: '📦', chest: '🧰', exit: '🚪', pillar: '⬛',
  statue: '🗿', grave: '🪦', coffin: '⚰️', crystal: '💎', mushroom: '🍄', hut: '🛖', throne: '👑', hearth: '🔥', bar: '▬', web: '🕸️',
  banner: '🚩', armorstand: '🛡️', stalagmite: '▲', cairn: '⛰️', reeds: '🌾', bush: '🌿', bones: '🦴', torch: '🔥', candle: '🕯️',
  npc: '🙋', cottage: '🏠', well: '🪣', fence: '▬', stall: '🧺', lamppost: '🏮', haybale: '🌾', cart: '🛒', tent: '⛺', campfire: '🔥', signpost: '🪧', weaponrack: '⚔️',
};

/** Unpacks the phone copy of a map. */
export const unpack = (packed) => {
  const tiles = Array.from({ length: packed.w * packed.h }, (_, i) => ({ t: CODE_TILE[packed.t[i]] || 'floor', e: Number(packed.e[i]) || 0, p: null }));
  (packed.p || []).forEach(([i, k]) => { if (tiles[i]) tiles[i].p = PROP_IDS[k] || null; });
  return { ...packed, tiles };
};

const S = 20; // px per square in the phone map's own units

/**
 * A top-down map for phones. reach: [[x, y, feet]], onTap(x, y, token).
 * marks: { [tokenId]: 'target' | 'me' | 'turn' }.
 */
export default function MiniMap({ packed, tokens, reach = [], marks = {}, onTap, pick = null, traps = [] }) {
  const ref = useRef(null);
  const map = useMemo(() => unpack(packed), [packed]);
  const pal = settingFor(packed.setting).palette;
  const reachSet = useMemo(() => new Map(reach.map(([x, y, feet]) => [`${x},${y}`, feet])), [reach]);

  const ground = useMemo(() => map.tiles.map((tile, i) => {
    const x = i % map.w;
    const y = Math.floor(i / map.w);
    let fill = pal.top;
    if (tile.t === 'wall') fill = pal.wallTop;
    else if (tile.t === 'void') fill = '#05040a';
    else if (tile.t === 'water') fill = pal.water || '#2f5b8a';
    else if (tile.t === 'diff') fill = pal.diff || shade(pal.top, -0.15);
    else if (tile.t === 'road') fill = pal.road || shade(pal.top, 0.2);
    if (tile.e && tile.t !== 'wall') fill = shade(fill, tile.e * 0.14);
    return (
      <g key={i}>
        <rect x={x * S} y={y * S} width={S} height={S} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
        {tile.e > 0 && tile.t !== 'wall' && <text x={x * S + S - 3} y={y * S + 7} className="dqm-level">{'▴'.repeat(tile.e)}</text>}
        {tile.t === 'door' && <rect x={x * S + 6} y={y * S + 6} width={8} height={8} fill="#8b5a2b" />}
        {tile.p && PROP_ICON[tile.p] && <text x={x * S + S / 2} y={y * S + S / 2 + 5} className="dqm-prop">{PROP_ICON[tile.p]}</text>}
      </g>
    );
  }), [map, pal]);

  const tap = (e) => {
    if (!onTap || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - box.left) / box.width) * map.w);
    const y = Math.floor(((e.clientY - box.top) / box.height) * map.h);
    const token = tokens.find((t) => t.x === x && t.y === y && !t.dead);
    onTap(x, y, token || null);
  };

  return (
    <svg ref={ref} className="dqm" viewBox={`0 0 ${map.w * S} ${map.h * S}`} onClick={tap}>
      {ground}
      {[...reachSet.entries()].map(([k]) => {
        const [x, y] = k.split(',').map(Number);
        return <rect key={`r${k}`} x={x * S + 1.5} y={y * S + 1.5} width={S - 3} height={S - 3} className="dqm-reach" />;
      })}
      {traps.map(([x, y, sprung]) => <text key={`t${x},${y}`} x={x * S + S / 2} y={y * S + S / 2 + 5} className="dqm-trap" opacity={sprung ? 0.5 : 1}>⚠️</text>)}
      {pick && <rect x={pick.x * S + 1} y={pick.y * S + 1} width={S - 2} height={S - 2} className="dqm-pick" />}
      {tokens.filter((t) => !t.dead).map((t) => {
        const mark = marks[t.id];
        return (
          <g key={t.id} transform={`translate(${t.x * S + S / 2} ${t.y * S + S / 2})`}>
            <circle r={S * 0.46} className={`dqm-token is-${t.side}${t.down ? ' is-down' : ''}${mark ? ` is-${mark}` : ''}`} />
            <text y="5" className="dqm-glyph">{t.side === 'foe' ? t.glyph : (t.name || '?').slice(0, 1).toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}
