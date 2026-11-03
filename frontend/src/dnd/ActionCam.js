import React, { useEffect, useMemo, useState } from 'react';
import Board from './Board';
import { unpack } from './MiniMap';

// The phone's close-up of what just happened to your hero: the real board, zoomed in on you and whoever
// you're dealing with, where you actually stand. Swings lunge, hits shake and flash, numbers float, people talk.

const SHOW_MS = { talk: 4200, shout: 4200, caught: 3400 };
const QUIET = new Set(['search', 'trade', 'loot']); // these show as a quick pop on the board instead

/** One line saying what happened, under the picture. */
const caption = (f, meId) => {
  const a = f.actor?.name || 'Something';
  const b = f.target?.name || '';
  const mine = f.from === meId;
  switch (f.kind) {
    case 'hit': return `${a} hits ${b}${f.label ? ` with ${f.label}` : ''}: −${f.dmg}${f.crit ? ' (critical!)' : ''}`;
    case 'shoot': return `${a} shoots ${b}: −${f.dmg}${f.crit ? ' (critical!)' : ''}`;
    case 'spell': return `${a} casts ${f.label || 'a spell'}${b && f.from !== f.to ? ` at ${b}` : ''}${f.dmg ? `: −${f.dmg}` : ''}`;
    case 'miss': return `${a} ${f.ranged ? 'shoots at' : 'swings at'} ${b}… and misses!`;
    case 'heal': return `${a} heals ${f.from === f.to ? 'themselves' : b}: +${f.amount} HP`;
    case 'buff': return `${a} uses ${f.label}${f.from !== f.to ? ` on ${b}` : ''}`;
    case 'item': return `${a} uses ${f.label}${f.from !== f.to && b ? ` on ${b}` : ''}${f.dmg ? `: −${f.dmg}` : ''}`;
    case 'steal': return `${a} picks ${b}’s pocket: +${f.gold} gold${f.label ? ` and ${f.label}` : ''}`;
    case 'caught': return `${b} catches ${a} red-handed!${f.guards ? ' The guard is coming!' : ''}`;
    case 'trap': return f.dmg ? `${b} sets off ${f.label}: −${f.dmg}` : `${b} sets off ${f.label} and dodges it!`;
    case 'talk': return `${mine ? a : `${a} the ${(f.actor?.role || '').toLowerCase()}`}: “${f.text}”`;
    case 'shout': return `${a}: “${f.text}”${f.reply ? ` ${b}: “${f.reply}”` : ''}`;
    default: return '';
  }
};

export default function ActionCam({ fx, meId, packed, tokens, npcs }) {
  const [shown, setShown] = useState(null);
  const [now, setNow] = useState(0);
  const id = fx ? fx.id : 0;
  useEffect(() => {
    if (!fx || QUIET.has(fx.kind)) return undefined;
    const at = Date.now();
    const until = at + (SHOW_MS[fx.kind] || 2600);
    setShown({ ...fx, at });
    setNow(at);
    // One clock drives the picture and also ends it, so it can't get stuck on screen if a timer is
    // held up (Safari pauses timers in a tab you've switched away from).
    let frame = 0;
    const loop = () => {
      const t = Date.now();
      if (t >= until || document.hidden) {
        setShown(null);
        return;
      }
      setNow(t);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    const timer = window.setTimeout(() => setShown(null), until - at + 100);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = useMemo(() => (packed ? unpack(packed) : null), [packed]);
  if (!shown || !map) return null;
  const f = shown;
  // The real board, zoomed in on the two of you: the same squares, props, light and weather.
  const list = (tokens || []).map((t) => ({ ...t, sheet: t.cls ? { classId: t.cls, wear: t.wear } : null }));
  // A foe that just fell still gets its moment on camera.
  [f.actor, f.target].forEach((who) => {
    if (who && who.kind === 'foe' && !list.some((t) => t.id === who.id)) {
      list.push({ id: who.id, side: 'foe', name: who.name, x: who.x, y: who.y, monster: who.monster, color: who.color, glyph: who.glyph, boss: who.boss, hp: 0, maxHp: who.maxHp || 1 });
    }
  });
  const game = { map, tokens: list, npcs: npcs || [], combat: null, walking: [], fx: f };
  const focus = [f.actor, f.target].filter(Boolean).map((w) => ({ x: w.x, y: w.y }));
  return (
    <div className="dqc" key={f.id} onClick={() => setShown(null)} role="presentation">
      <div className="dqc-stage">
        <Board game={game} now={now} focus={focus} className="dq-board dqc-board" />
      </div>
      <p className="dqc-caption">{caption(f, meId)}</p>
    </div>
  );
}
