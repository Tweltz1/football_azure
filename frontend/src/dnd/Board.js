import React, { useMemo } from 'react';
import { personMarkup } from '../party/cartoon';
import { parseLook } from '../party/look';
import { GEAR_BY_ID, heroMarkup } from './gear';
import { settingFor } from './settings';
import { BASE, groundTile, iso, propArt, TH, TW, WALL, wallTile } from './iso';
import { drawPos } from './engine';
import { tileAt } from './movement';
import { monsterHeight, monsterMarkup } from './monsterArt';
import { PROP_DEFS } from './props';

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

const touchesFloor = (map, x, y) => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const t = tileAt(map, x + dx, y + dy);
      if (t && t.t !== 'wall' && t.t !== 'void') return true;
    }
  }
  return false;
};

/** A wall standing in front of floor (as the TV camera sees it): drawn low. */
const hidesFloor = (map, x, y) => [[-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => {
  const t = tileAt(map, x + dx, y + dy);
  return t && t.t !== 'wall' && t.t !== 'void';
});

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
          // Solid rock deep inside the walls is left dark, so rooms read as rooms instead of a big plateau.
          if (!touchesFloor(map, x, y)) continue;
          things.push({ depth: x + y, key: `w${x},${y}`, html: wallTile(tile, x, y, pal, map.setting, hidesFloor(map, x, y)) });
        } else {
          ground += groundTile(tile, x, y, pal, map.setting);
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

const Hero = React.memo(({ look, sx, sy, name, hp, maxHp, cls, down, dead, active, walking, now, gear, title }) => {
  const frame = walking ? Math.floor(now / 90) : 0;
  const gearKey = gear ? JSON.stringify(gear) : '';
  const markup = useMemo(() => heroMarkup(look, gear || {}, { kind: walking ? 'walk' : active ? 'wave' : 'stand', k: (frame * 0.9) % 6.28 }, { plain: down }), [look, walking, active, frame, gearKey, down]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {title && !down && <text x="0" y={-113} className="dq-name dq-title-tag" textAnchor="middle">{title}</text>}
    </g>
  );
});

const Foe = React.memo(({ sx, sy, monster, glyph, color, name, hp, maxHp, boss, active }) => {
  const markup = useMemo(() => monsterMarkup(monster, color, glyph), [monster, color, glyph]);
  const tall = monsterHeight(monster) * (boss ? 1.15 : 1);
  return (
    <g transform={`translate(${sx} ${sy})`} className="dq-foe">
      <ellipse cx="0" cy="0" rx={boss ? 36 : 24} ry={boss ? 18 : 12} fill="rgba(0,0,0,0.4)" />
      <ellipse cx="0" cy="0" rx={boss ? 32 : 22} ry={boss ? 16 : 11} fill="none" stroke={boss ? '#ff5a4f' : '#b8432f'} strokeWidth="3" opacity="0.8" />
      {active && <ellipse cx="0" cy="0" rx={boss ? 42 : 32} ry={boss ? 21 : 16} fill="none" stroke="#ff5a4f" strokeWidth="4" className="dq-pulse" />}
      <g transform={boss ? 'scale(1.15)' : undefined}>
        {/* eslint-disable-next-line react/no-danger */}
        <g className="dq-idle" dangerouslySetInnerHTML={{ __html: markup }} />
      </g>
      <HpBar hp={hp} maxHp={maxHp} x={0} y={-tall - 12} w={boss ? 70 : 46} foe />
      {boss && <text x="0" y={-tall - 18} className="dq-name dq-boss" textAnchor="middle">{name}</text>}
    </g>
  );
});

const Npc = React.memo(({ look, sx, sy, name, role, talked }) => {
  const markup = useMemo(() => personMarkup(parseLook(look), { kind: 'stand', k: 0 }), [look]);
  return (
    <g transform={`translate(${sx} ${sy})`} className="dq-npc">
      <ellipse cx="0" cy="0" rx="24" ry="12" fill="rgba(0,0,0,0.3)" />
      <ellipse cx="0" cy="0" rx="22" ry="11" fill="none" stroke="#e7b94a" strokeWidth="2" strokeDasharray="5 4" />
      {/* eslint-disable-next-line react/no-danger */}
      <g transform="scale(0.23)" dangerouslySetInnerHTML={{ __html: markup }} />
      {!talked && <text x="0" y="-112" fontSize="22" textAnchor="middle" className="lc-bob">💬</text>}
      <text x="0" y="-98" className="dq-name" textAnchor="middle">{name}</text>
      <text x="0" y="-84" className="dq-npc-role" textAnchor="middle">{role}</text>
    </g>
  );
});

// Something always moving in the air: embers, fireflies, dust, snow. Placed from the map seed.
const WEATHER = {
  tavern: { n: 14, color: '#ffb35a', r: 2, kind: 'rise' },
  forest: { n: 16, color: '#e8ff7a', r: 2.2, kind: 'drift' },
  dungeon: { n: 18, color: 'rgba(230,220,200,0.6)', r: 1.6, kind: 'drift' },
  cave: { n: 18, color: '#9fe6ff', r: 1.8, kind: 'drift' },
  crypt: { n: 10, color: 'rgba(200,230,210,0.35)', r: 14, kind: 'mist' },
  castle: { n: 12, color: 'rgba(255,220,150,0.6)', r: 1.6, kind: 'drift' },
  swamp: { n: 18, color: '#d8ff6a', r: 2.2, kind: 'drift' },
  mountain: { n: 40, color: '#ffffff', r: 2.4, kind: 'fall' },
};

const Weather = React.memo(({ setting, seed, box }) => {
  const w = WEATHER[setting];
  if (!w) return null;
  let a = (seed >>> 0) || 1;
  const rnd = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const dots = Array.from({ length: w.n }, (_, i) => ({
    i,
    x: box.left + rnd() * box.width,
    y: box.top + 60 + rnd() * (box.height - 60),
    d: (w.kind === 'fall' ? 5 : 6) + rnd() * 6,
    delay: -rnd() * 10,
  }));
  return (
    <g className={`dq-weather dq-weather-${w.kind}`} pointerEvents="none">
      {dots.map((p) => (
        <circle key={p.i} cx={p.x} cy={p.y} r={w.r} fill={w.color} style={{ animationDuration: `${p.d}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </g>
  );
});

const FX_MS = 4500;

/** Breaks a line into short rows for a speech bubble. */
const wrap = (text, width = 26, rows = 3) => {
  const out = [''];
  String(text || '').split(/\s+/).forEach((word) => {
    const last = out[out.length - 1];
    if ((last + ' ' + word).trim().length > width && last) out.push(word);
    else out[out.length - 1] = (last + ' ' + word).trim();
  });
  if (out.length > rows) {
    out.length = rows;
    out[rows - 1] = `${out[rows - 1].replace(/[.,!?]?$/, '')}…`;
  }
  return out;
};

const Bubble = ({ x, y, text, tone }) => {
  const lines = wrap(text);
  const w = Math.max(...lines.map((l) => l.length)) * 7.4 + 22;
  const h = lines.length * 15 + 12;
  return (
    <g transform={`translate(${x} ${y})`} className="dq-bubble">
      <rect x={-w / 2} y={-h - 10} width={w} height={h} rx="9" fill={tone === 'angry' ? '#ffe2dc' : '#fff8e6'} stroke="#16122b" strokeWidth="2.5" />
      <path d="M-6 -11 L0 0 L7 -11" fill={tone === 'angry' ? '#ffe2dc' : '#fff8e6'} stroke="#16122b" strokeWidth="2.5" />
      <rect x="-8" y="-13" width="16" height="4" fill={tone === 'angry' ? '#ffe2dc' : '#fff8e6'} />
      {lines.map((l, i) => <text key={i} x="0" y={-h - 10 + 19 + i * 15} textAnchor="middle" className="dq-bubble-text">{l}</text>)}
    </g>
  );
};

/** Floating numbers, projectiles, bursts and speech bubbles for the latest action. */
const FxLayer = ({ f, age, pos }) => {
  const a = pos[f.from];
  const b = pos[f.to] || a;
  const out = [];
  const rise = (p, text, cls, delay = 220) => {
    if (!p || age < delay || age > delay + 1700) return;
    const k = (age - delay) / 1700;
    out.push(<text key={`n${text}`} x={p.sx} y={p.sy - 104 - k * 46} opacity={Math.min(1, 2.2 - k * 2.2)} textAnchor="middle" className={`dq-fx-num ${cls}`}>{text}</text>);
  };
  // Arrows, bolts and spells fly from one to the other.
  if (a && b && f.from !== f.to && (f.kind === 'shoot' || f.kind === 'spell' || (f.kind === 'miss' && f.ranged) || (f.kind === 'item' && f.dmg)) && age < 360) {
    const k = age / 360;
    const x = a.sx + (b.sx - a.sx) * k;
    const y = a.sy - 40 + (b.sy - a.sy) * k - Math.sin(Math.PI * k) * 30;
    out.push(<circle key="shot" cx={x} cy={y} r={f.kind === 'spell' ? 9 : 5} className={f.kind === 'spell' ? 'dq-fx-spell' : 'dq-fx-arrow'} />);
  }
  if (b && f.dmg > 0 && age > 160 && age < 620) {
    const k = (age - 160) / 460;
    out.push(<circle key="burst" cx={b.sx} cy={b.sy - 34} r={14 + k * 34} fill="none" stroke={f.crit ? '#ffe066' : '#ff5a4f'} strokeWidth={8 * (1 - k)} opacity={1 - k} />);
  }
  if (f.kind === 'hit' || f.kind === 'shoot' || f.kind === 'spell' || f.kind === 'trap' || (f.kind === 'item' && f.dmg)) {
    if (f.dmg > 0) rise(b, `${f.crit ? 'CRIT! ' : ''}−${f.dmg}`, f.crit ? 'is-crit' : 'is-dmg');
    else if (f.kind === 'trap') rise(b, 'Dodged!', 'is-miss');
  }
  if (f.kind === 'miss') rise(b, 'Miss!', 'is-miss');
  if (f.kind === 'heal') rise(b, `+${f.amount} HP`, 'is-heal');
  if (f.kind === 'buff' || (f.kind === 'item' && !f.dmg)) rise(b, f.label, 'is-buff', 100);
  if (f.kind === 'steal') rise(a, `+${f.gold} 🪙`, 'is-gold', 380);
  if (f.kind === 'loot') rise(a, `+${f.gold} 🪙`, 'is-gold', 60);
  if (f.kind === 'trade') rise(a, `${f.gold > 0 ? '+' : ''}${f.gold} 🪙`, 'is-gold', 60);
  if (f.kind === 'search') rise(a, f.found ? '🔍 Found something!' : '🔍 Nothing…', f.found ? 'is-gold' : 'is-miss', 60);
  if (f.kind === 'talk' && a) out.push(<Bubble key="say" x={a.sx} y={a.sy - 118} text={f.text} />);
  if (f.kind === 'shout' && a) out.push(<Bubble key="say" x={a.sx} y={a.sy - 118} text={f.text} tone="angry" />);
  if (f.kind === 'shout' && b && f.reply && age > 1200) out.push(<Bubble key="reply" x={b.sx} y={b.sy - 118} text={f.reply} />);
  if (f.kind === 'caught' && b) {
    out.push(<text key="alarm" x={b.sx} y={b.sy - 120} textAnchor="middle" className="dq-fx-num is-dmg">❗</text>);
    if (age > 500) out.push(<Bubble key="say" x={b.sx} y={b.sy - 140} text={f.text} tone="angry" />);
  }
  return <g pointerEvents="none">{out}</g>;
};

/**
 * The isometric board. reach: optional list of [x, y, feet] squares to light up (the current hero's moves).
 */
export default function Board({ game, now, reach = null, showHidden = false, focus = null, className = 'dq-board' }) {
  const { map } = game;
  const s = settingFor(map.setting);
  const box = useMemo(() => bounds(map), [map]);
  // A close-up on a few squares (the phone's action cam): frame them with a little room around.
  let view = box;
  if (focus && focus.length) {
    const pts = focus.map((p) => iso(p.x, p.y, groundAt(map, p.x, p.y)));
    const cx = (Math.min(...pts.map((p) => p.sx)) + Math.max(...pts.map((p) => p.sx))) / 2;
    const cy = (Math.min(...pts.map((p) => p.sy)) + Math.max(...pts.map((p) => p.sy))) / 2;
    const spread = Math.max(...pts.map((p) => p.sx)) - Math.min(...pts.map((p) => p.sx));
    const width = Math.max(TW * 3.3, spread + TW * 2.2);
    const height = width * 0.7;
    view = { left: cx - width / 2, top: cy - height * 0.84, width, height };
  }
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

  // The action cam on the board: attackers lunge, the hit one shakes, numbers float up, people speak in bubbles.
  const pos = {};
  tokens.forEach(({ t, sx, sy }) => { pos[t.id] = { sx, sy }; });
  (game.npcs || []).forEach((n) => { pos[n.id] = iso(n.x, n.y, groundAt(map, n.x, n.y)); });
  const f = game.fx && now - game.fx.at < FX_MS ? game.fx : null;
  const age = f ? now - f.at : 0;
  const shift = (id) => {
    if (!f) return { dx: 0, dy: 0 };
    const a = pos[f.from];
    const b = pos[f.to];
    if (id === f.from && a && b && f.from !== f.to && (f.kind === 'hit' || f.kind === 'miss' || f.kind === 'steal' || f.kind === 'caught') && age < 480) {
      const k = Math.sin((Math.PI * age) / 480) * (f.kind === 'steal' ? 0.25 : 0.42);
      return { dx: (b.sx - a.sx) * k, dy: (b.sy - a.sy) * k };
    }
    if (id === f.to && f.dmg > 0 && age > 180 && age < 760) return { dx: Math.sin(age / 22) * 6, dy: 0 };
    return { dx: 0, dy: 0 };
  };

  const npcs = (game.npcs || []).map((n) => {
    const { sx, sy } = pos[n.id];
    const { dx, dy } = shift(n.id);
    return { depth: n.x + n.y + 0.5, key: n.id, el: <Npc key={n.id} look={n.look} sx={sx + dx} sy={sy + dy} name={n.name} role={n.role} talked={n.talked} /> };
  });

  // Traps the party has found: a warning plate on the ground (or the sprung trap's jaws).
  const knownTraps = game.traps || (map.traps || []).filter((x) => x.found || x.sprung).map((x) => [x.x, x.y, x.sprung ? 1 : 0]);
  const trapEls = knownTraps.map(([x, y, sprung]) => {
    const { sx, sy } = iso(x, y, groundAt(map, x, y));
    return {
      depth: x + y + 0.05,
      key: `trap${x},${y}`,
      el: (
        <g key={`trap${x},${y}`} transform={`translate(${sx} ${sy})`} opacity={sprung ? 0.65 : 1}>
          <polygon points={`0,${-TH / 2 + 6} ${TW / 2 - 8},0 0,${TH / 2 - 6} ${-TW / 2 + 8},0`} fill={sprung ? '#3a2a20' : 'rgba(255,90,60,0.28)'} stroke="#ff6a3d" strokeWidth="2.5" strokeDasharray={sprung ? '0' : '6 4'} />
          {sprung
            ? <path d="M-14 2 L-9 -7 L-4 2 L1 -7 L6 2 L11 -7 L14 2" fill="none" stroke="#c9c3b8" strokeWidth="2.5" />
            : <text x="0" y="6" fontSize="18" textAnchor="middle">⚠️</text>}
        </g>
      ),
    };
  });

  // Traps the party has found: a warning plate on the ground (or the sprung trap's jaws).
  const knownTraps = game.traps || (map.traps || []).filter((x) => x.found || x.sprung).map((x) => [x.x, x.y, x.sprung ? 1 : 0]);
  const trapEls = knownTraps.map(([x, y, sprung]) => {
    const { sx, sy } = iso(x, y, groundAt(map, x, y));
    return {
      depth: x + y + 0.05,
      key: `trap${x},${y}`,
      el: (
        <g key={`trap${x},${y}`} transform={`translate(${sx} ${sy})`} opacity={sprung ? 0.65 : 1}>
          <polygon points={`0,${-TH / 2 + 6} ${TW / 2 - 8},0 0,${TH / 2 - 6} ${-TW / 2 + 8},0`} fill={sprung ? '#3a2a20' : 'rgba(255,90,60,0.28)'} stroke="#ff6a3d" strokeWidth="2.5" strokeDasharray={sprung ? '0' : '6 4'} />
          {sprung
            ? <path d="M-14 2 L-9 -7 L-4 2 L1 -7 L6 2 L11 -7 L14 2" fill="none" stroke="#c9c3b8" strokeWidth="2.5" />
            : <text x="0" y="6" fontSize="18" textAnchor="middle">⚠️</text>}
        </g>
      ),
    };
  });

  const layers = [
    ...trapEls,
    ...npcs,
    ...things.map((th) => ({ depth: th.depth, key: th.key, el: <g key={th.key} dangerouslySetInnerHTML={{ __html: th.html }} /> })),
    ...tokens.map(({ t, sx: x0, sy: y0, depth, walking }) => {
      const { dx, dy } = shift(t.id);
      const sx = x0 + dx;
      const sy = y0 + dy;
      return {
      depth,
      key: t.id,
      el: t.side === 'party'
        ? <Hero key={t.id} look={t.look} sx={sx} sy={sy} name={t.name} hp={t.hp} maxHp={t.maxHp} cls={t.sheet?.classId} down={t.hp <= 0 && !t.dead} dead={t.dead} active={t.id === turnId} walking={walking} now={now} gear={t.wear || t.sheet?.wear} title={t.title || (t.sheet?.wear?.title ? GEAR_BY_ID[t.sheet.wear.title]?.name : null)} />
        : <Foe key={t.id} sx={sx} sy={sy} monster={t.monster} glyph={t.glyph} color={t.color} name={t.name} hp={t.hp} maxHp={t.maxHp} boss={t.boss} active={t.id === turnId} />,
      };
    }),
  ].sort((a, b) => a.depth - b.depth);

  // Light: dark places only show what's near the party's torches.
  const dark = s.light === 'dark';
  const lights = tokens.filter(({ t }) => t.side === 'party' && !t.dead);

  return (
    <svg className={className} viewBox={`${view.left} ${view.top} ${view.width} ${view.height}`} preserveAspectRatio={focus ? 'xMidYMid slice' : 'xMidYMid meet'}>
      {/* eslint-disable-next-line react/no-danger */}
      <defs dangerouslySetInnerHTML={{ __html: PROP_DEFS }} />
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
      {f && <FxLayer f={f} age={age} pos={pos} />}
      <Weather setting={map.setting} seed={map.seed} box={box} />
      {s.light === 'fog' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-fog" />}
      {s.light === 'cold' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-cold" />}
      {s.light === 'warm' && <rect x={box.left} y={box.top} width={box.width} height={box.height} className="dq-warm" />}
      <text x={box.left + 10} y={box.top + box.height - 10} className="dq-scale">Each square is 5 ft · climbing one level costs +5 ft · a two-level drop is a cliff</text>
    </svg>
  );
}
