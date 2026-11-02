import React, { useEffect, useState } from 'react';
import MiniMap from './MiniMap';
import { actionNumbers, actionsOf, CLASSES, describe, mod, RACES, signed, STAT_NAMES, STATS, XP_FOR_LEVEL } from './rules';
import { squaresBetween } from './movement';

const kindHint = (a) => {
  if (a.kind === 'heal') return a.self ? 'Heal yourself' : `Heal an ally within ${(a.range || 1) * 5} ft`;
  if (a.kind === 'self') return a.ally ? 'Pick an ally' : 'Buff yourself';
  if (a.kind === 'save') return `They roll to resist · ${(a.range || 1) * 5} ft${a.area ? ' · hits a group' : ''}`;
  if (a.kind === 'auto') return `Never misses · ${(a.range || 1) * 5} ft`;
  return (a.range || 1) > 1 ? `Ranged · ${(a.range || 1) * 5} ft` : 'Melee · 5 ft';
};

/** A hero's phone during the adventure: map to move, actions to take, a sheet and a way to tell the DM what you try. */
export default function PlayerGame({ view, send, header, toast }) {
  const [tab, setTab] = useState('map');
  const [chosen, setChosen] = useState(null); // an action waiting for a target
  const [text, setText] = useState('');
  const me = view.me;
  const sheet = me.sheet;
  const canAct = !view.mode || view.mode === 'explore' || view.myTurn;
  const used = view.used || {};

  useEffect(() => { if (!view.myTurn && view.mode === 'combat') setChosen(null); }, [view.myTurn, view.mode]);
  useEffect(() => {
    if (view.myTurn && navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }, [view.myTurn]);

  const actions = actionsOf(sheet);
  const targetsFor = (a) => {
    if (!a) return [];
    if (a.kind === 'heal' && !a.self) return view.tokens.filter((t) => t.side === 'party' && !t.dead);
    if (a.kind === 'self' && a.ally) return view.tokens.filter((t) => t.side === 'party' && t.id !== me.id && !t.dead);
    if (a.kind === 'heal' || a.kind === 'self') return [];
    return view.tokens.filter((t) => t.side === 'foe' && !t.dead);
  };

  const use = (a) => {
    const targets = targetsFor(a);
    if (!targets.length && (a.kind === 'heal' ? a.self : a.kind === 'self' && !a.ally)) {
      send('act', { type: 'action', action: a.id });
      return;
    }
    setChosen(a);
    setTab('map');
  };

  const onTap = (x, y, token) => {
    if (chosen) {
      const ok = targetsFor(chosen).find((t) => t.id === token?.id);
      if (ok) {
        send('act', { type: 'action', action: chosen.id, target: ok.id });
        setChosen(null);
      }
      return;
    }
    if (view.reach.some(([rx, ry]) => rx === x && ry === y)) send('act', { type: 'move', x, y });
  };

  const marks = { [me.id]: 'me' };
  if (chosen) targetsFor(chosen).forEach((t) => { marks[t.id] = 'target'; });

  const hpPct = Math.max(0, (me.hp / me.maxHp) * 100);
  const nextXp = XP_FOR_LEVEL[sheet.level + 1];

  return (
    <div className="lcp dqp">
      {header}
      <div className={`dqp-status${view.myTurn ? ' is-turn' : ''}${me.down ? ' is-down' : ''}`}>
        <div className="dqp-hp"><i style={{ width: `${hpPct}%` }} /><span>❤️ {me.hp}/{me.maxHp}</span></div>
        <span>🛡️ AC {me.ac}</span>
        <span>{view.mode === 'combat' ? (view.myTurn ? `🟢 Your turn · ${view.left} ft left` : `⏳ ${view.turnName}'s turn`) : `🧭 Exploring · ${me.speed} ft`}</span>
      </div>
      {toast && <div className="dqp-toast">{toast}</div>}
      {view.check && !view.check.rolled && (
        <div className="dqp-check">
          <b>🎲 The DM wants a {view.check.skill} check</b>
          <button type="button" className="lc-btn lc-btn-big" onClick={() => send('act', { type: 'check' })}>Roll d20</button>
        </div>
      )}
      {view.check && view.check.rolled && <div className="dqp-check is-done">You rolled {view.check.rolled.total} for {view.check.skill}. {view.check.rolled.ok ? 'Success!' : 'Not this time.'}</div>}
      {me.down && !me.dead && <div className="dqp-check">You're down! Death saves roll on your turn. Hope a friend has a healing spell…</div>}

      <div className="lcp-tabs dqp-tabs">
        {['map', 'actions', 'hero', 'say'].map((t) => (
          <button key={t} type="button" className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {t === 'map' ? '🗺️ Map' : t === 'actions' ? '⚔️ Act' : t === 'hero' ? '📜 Hero' : '💬 Say'}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="dqp-mapwrap">
          {chosen ? (
            <div className="dqp-hint is-target">Tap a glowing target for <b>{chosen.name}</b> · <button type="button" className="lcp-link" onClick={() => setChosen(null)}>cancel</button></div>
          ) : (
            <div className="dqp-hint">{canAct && view.reach.length ? 'Tap a lit square to move there.' : view.mode === 'combat' ? 'Wait for your turn to move.' : 'Look at the TV.'}</div>
          )}
          <MiniMap packed={view.map} tokens={view.tokens} reach={chosen ? [] : view.reach} marks={marks} onTap={onTap} />
          <div className="dqp-quick">
            {view.mode === 'combat' && view.myTurn && <button type="button" className="lc-btn" onClick={() => send('act', { type: 'end' })}>✅ End turn</button>}
            {view.chestNear && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'interact' })}>🧰 Open chest</button>}
            {sheet.inventory.includes('Potion of Healing') && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'potion' })}>🧪 Drink potion</button>}
          </div>
        </div>
      )}

      {tab === 'actions' && (
        <div className="dqp-actions">
          {view.mode === 'combat' && (
            <p className="dqp-used">Action: {used.action ? 'used' : 'ready'} · Bonus action: {used.bonus ? 'used' : 'ready'} · Moved {used.moved || 0} ft</p>
          )}
          {actions.map((a) => {
            const nums = actionNumbers(sheet, a);
            const left = a.uses ? me.uses?.[a.id] ?? 0 : null;
            const spent = view.mode === 'combat' && (a.bonus ? used.bonus : used.action);
            const nearest = targetsFor(a).filter((t) => t.side === 'foe').sort((p, q) => squaresBetween(p, me) - squaresBetween(q, me))[0];
            return (
              <button key={a.id} type="button" className="dqp-action" disabled={!canAct || spent || left === 0 || me.down} onClick={() => use(a)}>
                <b>{a.name}{a.bonus ? ' (bonus)' : ''}</b>
                <small>{kindHint(a)}{a.dice ? ` · ${a.dice}${nums.dmgBonus > 0 && a.kind !== 'save' && a.kind !== 'auto' ? signed(nums.dmgBonus) : ''}` : ''}{a.kind === 'attack' ? ` · ${signed(nums.toHit)} to hit` : a.kind === 'save' ? ` · DC ${nums.saveDc}` : ''}</small>
                {left != null && <i>{left} left</i>}
                {nearest && a.kind !== 'heal' && <em>Nearest foe {squaresBetween(nearest, me) * 5} ft</em>}
              </button>
            );
          })}
          {view.mode === 'combat' && (
            <div className="dqp-row">
              <button type="button" className="lc-btn lc-btn-ghost" disabled={!view.myTurn || used.action} onClick={() => send('act', { type: 'action', action: 'dash' })}>🏃 Dash</button>
              <button type="button" className="lc-btn lc-btn-ghost" disabled={!view.myTurn || used.action} onClick={() => send('act', { type: 'action', action: 'dodge' })}>🛡️ Dodge</button>
              <button type="button" className="lc-btn" disabled={!view.myTurn} onClick={() => send('act', { type: 'end' })}>✅ End turn</button>
            </div>
          )}
        </div>
      )}

      {tab === 'hero' && (
        <div className="dqp-sheet">
          <h2>{sheet.name}</h2>
          <p>{describe(sheet)} · {sheet.xp} XP{nextXp ? ` (level ${sheet.level + 1} at ${nextXp})` : ''} · {sheet.gold} gold</p>
          <p className="dqp-perk">{RACES[sheet.raceId]?.perk} {CLASSES[sheet.classId]?.blurb}</p>
          <div className="dqp-stats">
            {STATS.map((s) => <div key={s}><small>{STAT_NAMES[s].slice(0, 3).toUpperCase()}</small><b>{sheet.stats[s]}</b><i>{signed(mod(sheet.stats[s]))}</i></div>)}
          </div>
          <h3>Inventory</h3>
          <ul className="dqp-inv">{sheet.inventory.map((item, i) => <li key={`${item}${i}`}>{item}</li>)}</ul>
          {Object.keys(me.cond || {}).length > 0 && <p>Effects: {Object.keys(me.cond).join(', ')}</p>}
        </div>
      )}

      {tab === 'say' && (
        <form className="dqp-say" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send('act', { type: 'say', text }); setText(''); } }}>
          <label>What does {sheet.name} try to do?
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 160))} rows={3} placeholder="I try to sneak past the guard… / I ask the innkeeper about the missing girl…" />
          </label>
          <button type="submit" className="lc-btn" disabled={!text.trim()}>Tell the DM</button>
          <div className="dqp-log">{view.log.map((l, i) => <p key={i}>{l}</p>)}</div>
        </form>
      )}

      {view.narration && <div className="dqp-narration">📜 {view.narration}</div>}
    </div>
  );
}
