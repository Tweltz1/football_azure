import React, { useEffect, useState } from 'react';
import ActionCam from './ActionCam';
import MiniMap from './MiniMap';
import { actionNumbers, actionsOf, CLASSES, describe, mod, RACES, signed, STAT_NAMES, STATS, XP_FOR_LEVEL } from './rules';
import { squaresBetween } from './movement';
import { ITEMS, sellValue } from './items';
import {
  deedValue, GEAR, GEAR_BY_ID, heroMarkup, howToUnlock, isUnlocked, pieceBox, pieceMarkup, SLOTS,
} from './gear';

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
  const [shopOpen, setShopOpen] = useState(false);
  const me = view.me;
  const sheet = me.sheet;
  const canAct = !view.mode || view.mode === 'explore' || view.myTurn;
  const used = view.used || {};

  useEffect(() => { if (!view.myTurn && view.mode === 'combat') setChosen(null); }, [view.myTurn, view.mode]);
  useEffect(() => { if (!view.shop) setShopOpen(false); }, [view.shop]);
  const [unlockNote, setUnlockNote] = useState(null);
  const unlockId = view.unlock ? view.unlock.id : 0;
  useEffect(() => {
    if (!unlockId || !view.unlock) return undefined;
    const item = GEAR_BY_ID[view.unlock.gear];
    if (!item) return undefined;
    if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 160]);
    setUnlockNote(item);
    const timer = window.setTimeout(() => setUnlockNote(null), 6000);
    return () => window.clearTimeout(timer);
  }, [unlockId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view.myTurn && navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }, [view.myTurn]);

  const actions = actionsOf(sheet);
  const targetsFor = (a) => {
    if (!a) return [];
    if (a.item) return view.tokens.filter((t) => t.side === 'foe' && !t.dead && squaresBetween(t, me) <= a.range);
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
        if (chosen.item) send('act', { type: 'item', item: chosen.name, target: ok.id });
        else send('act', { type: 'action', action: chosen.id, target: ok.id });
        setChosen(null);
      }
      return;
    }
    if (view.reach.some(([rx, ry]) => rx === x && ry === y)) send('act', { type: 'move', x, y });
  };

  /** Uses an item from the pack. Aimed ones wait for a tap on a target. */
  const pickItem = (item) => {
    const def = ITEMS[item];
    if (!def || !def.use) return;
    if (def.target === 'foe') {
      setChosen({ name: item, item: true, range: def.range || 1 });
      setTab('map');
      return;
    }
    send('act', { type: 'item', item });
  };
  const usable = (item) => {
    const def = ITEMS[item];
    if (!def || !def.use || me.down) return false;
    if (view.mode !== 'combat') return !['smoke', 'rope', 'caltrops', 'shield', 'climb'].includes(def.use) && (def.use !== 'key' || view.chestNear);
    if (!view.myTurn) return false;
    if (def.use === 'key') return view.chestNear && !used.action;
    return def.bonus ? !used.bonus : !used.action;
  };
  const npc = view.npcNear;
  const tried = (npc && npc.tried) || {};
  const busy = view.mode === 'combat' && (!view.myTurn || used.action);
  const pack = [...new Set(sheet.inventory)].map((item) => ({ item, count: sheet.inventory.filter((x) => x === item).length, def: ITEMS[item] }));

  const worn = sheet.wear || {};
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
      {unlockNote && (
        <button type="button" className="dqp-unlocked" key={unlockId} onClick={() => { setTab('gear'); setUnlockNote(null); }}>
          {unlockNote.slot !== 'title' && (
            // eslint-disable-next-line react/no-danger
            <svg viewBox="-170 -380 340 400" dangerouslySetInnerHTML={{ __html: heroMarkup(sheet.look || me.look, { [unlockNote.slot]: unlockNote.id }) }} />
          )}
          <span>
            <small>🏅 Unlocked!</small>
            <b>{unlockNote.slot === 'title' ? `${sheet.name} ${unlockNote.name}` : unlockNote.name}</b>
            <em>{howToUnlock(unlockNote)}</em>
            <i>Tap to wear it</i>
          </span>
        </button>
      )}
      <ActionCam fx={view.fx} meId={me.id} packed={view.map} tokens={view.tokens} npcs={view.npcs} />
      {view.check && !view.check.rolled && (
        <div className="dqp-check">
          <b>🎲 The DM wants a {view.check.skill} check</b>
          <button type="button" className="lc-btn lc-btn-big" onClick={() => send('act', { type: 'check' })}>Roll d20</button>
        </div>
      )}
      {view.check && view.check.rolled && <div className="dqp-check is-done">You rolled {view.check.rolled.total} for {view.check.skill}. {view.check.rolled.ok ? 'Success!' : 'Not this time.'}</div>}
      {me.down && !me.dead && <div className="dqp-check">You're down! Death saves roll on your turn. Hope a friend has a healing spell…</div>}

      <div className="lcp-tabs dqp-tabs">
        {['map', 'actions', 'hero', 'gear', 'say'].map((t) => (
          <button key={t} type="button" className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>
            {t === 'map' ? '🗺️ Map' : t === 'actions' ? '⚔️ Act' : t === 'hero' ? '📜 Hero' : t === 'gear' ? '🏅 Gear' : '💬 Say'}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <div className="dqp-mapwrap">
          {chosen ? (
            <div className="dqp-hint is-target">Tap a glowing target for <b>{chosen.name}</b> · <button type="button" className="lcp-link" onClick={() => setChosen(null)}>cancel</button></div>
          ) : (
            <div className="dqp-hint">{view.mode !== 'combat' && view.atExit && !view.complete
              ? (view.lastScene ? 'Defeat every foe here to finish the quest.' : 'Someone reached the 🚪 way onward. Moving to the next scene…')
              : canAct && view.reach.length
                ? (view.mode === 'combat' ? 'Tap a lit square to move there.' : view.lastScene ? 'Find the boss. Tap a lit square to move.' : 'Find the 🚪 way onward. Tap a lit square to move.')
                : view.mode === 'combat' ? 'Wait for your turn to move.' : 'Look at the TV.'}</div>
          )}
          <MiniMap packed={view.map} tokens={view.tokens} reach={chosen ? [] : view.reach} marks={marks} onTap={onTap} traps={view.traps || []} />
          {view.tasks && view.tasks.length > 0 && (
            <ul className="dqp-tasks">
              {view.tasks.map((task) => <li key={task.text} className={task.done ? 'is-done' : ''}>{task.done ? '✅' : '📌'} {task.text}</li>)}
            </ul>
          )}
          <div className="dqp-quick">
            {view.mode === 'combat' && view.myTurn && <button type="button" className="lc-btn" onClick={() => send('act', { type: 'end' })}>✅ End turn</button>}
            {view.chestNear && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'interact' })}>🧰 Open chest</button>}
            {view.chestNear && sheet.inventory.includes('Strange key') && <button type="button" className="lc-btn lc-btn-ghost" disabled={!usable('Strange key')} onClick={() => pickItem('Strange key')}>🗝️ Use the key</button>}
            {sheet.inventory.includes('Potion of Healing') && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'potion' })}>🧪 Drink potion</button>}
            <button type="button" className="lc-btn lc-btn-ghost" disabled={!canAct || busy || view.searched || me.down} onClick={() => send('act', { type: 'search' })}>🔍 {view.searched ? 'Searched here' : 'Search'}</button>
            {view.mode !== 'combat' && (
              me.cond && me.cond.sneaking
                ? <span className="dqp-chip">🥷 Sneaking</span>
                : <button type="button" className="lc-btn lc-btn-ghost" disabled={view.sneakTried || me.down} onClick={() => send('act', { type: 'sneak' })}>🥷 Sneak</button>
            )}
            {view.shop && !npc && <button type="button" className="lc-btn" onClick={() => setShopOpen(true)}>🛒 Shop at the stall</button>}
          </div>
          {npc && (
            <div className="dqp-npc">
              <b>🙋 {npc.name} the {npc.role.toLowerCase()}{npc.angry ? ' 😠' : npc.scared ? ' 😨' : npc.friendly ? ' 🙂' : ''}</b>
              <div className="dqp-npc-row">
                <button type="button" className="lc-btn" onClick={() => send('act', { type: 'talk' })}>💬 Talk</button>
                {view.shop && <button type="button" className="lc-btn" onClick={() => setShopOpen(true)}>🛒 Trade</button>}
                <button type="button" className="lc-btn lc-btn-ghost" disabled={npc.angry || tried.persuade || busy} onClick={() => send('act', { type: 'social', kind: 'persuade' })}>🤝 Persuade</button>
                <button type="button" className="lc-btn lc-btn-ghost" disabled={npc.angry || tried.intimidate || busy} onClick={() => send('act', { type: 'social', kind: 'intimidate' })}>😤 Intimidate</button>
                <button type="button" className="lc-btn lc-btn-ghost" disabled={npc.angry || tried.pickpocket || busy} onClick={() => send('act', { type: 'social', kind: 'pickpocket' })}>🤏 Pickpocket</button>
              </div>
              <small>{npc.angry ? `${npc.name} won’t deal with you anymore.` : 'Persuade: tips and a discount. Intimidate: gold, but they won’t trade. Pickpocket: risky, they may call the guards.'}</small>
            </div>
          )}
          {shopOpen && view.shop && (
            <div className="dqp-shop">
              <div className="dqp-shop-head"><b>🛒 {view.shop.name}{view.shop.friendly ? ' · friend’s discount' : ''}</b><span>🪙 {sheet.gold} gold</span>
                <button type="button" className="lcp-link" onClick={() => setShopOpen(false)}>close</button></div>
              <h4>Buy</h4>
              <ul>
                {view.shop.stock.map(([item, price]) => (
                  <li key={item}>
                    <span>{ITEMS[item]?.icon} {item}<small>{ITEMS[item]?.hint}</small></span>
                    <button type="button" className="lc-btn" disabled={sheet.gold < price} onClick={() => send('act', { type: 'buy', item })}>{price} 🪙</button>
                  </li>
                ))}
              </ul>
              <h4>Sell</h4>
              <ul>
                {pack.filter((p) => p.def).map(({ item, count }) => (
                  <li key={item}>
                    <span>{ITEMS[item].icon} {item}{count > 1 ? ` ×${count}` : ''}</span>
                    <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'sell', item })}>+{sellValue(item)} 🪙</button>
                  </li>
                ))}
                {!pack.some((p) => p.def) && <li><span>Nothing they want to buy.</span></li>}
              </ul>
            </div>
          )}
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
          <ul className="dqp-inv dqp-pack">
            {pack.map(({ item, count, def }) => (
              <li key={item}>
                <span>{def ? `${def.icon} ` : ''}{item}{count > 1 ? ` ×${count}` : ''}{def && <small>{def.hint}{def.use && def.bonus ? ' · bonus action' : ''}</small>}</span>
                {def && def.use && <button type="button" className="lc-btn" disabled={!usable(item)} onClick={() => pickItem(item)}>Use</button>}
                {view.shop && def && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => send('act', { type: 'sell', item })}>Sell {sellValue(item)}</button>}
              </li>
            ))}
          </ul>
          {Object.keys(me.cond || {}).length > 0 && <p>Effects: {Object.keys(me.cond).join(', ')}</p>}
        </div>
      )}

      {tab === 'gear' && (
        <div className="dqp-gear">
          <div className="dqp-gear-hero">
            {/* eslint-disable-next-line react/no-danger */}
            <svg viewBox="-170 -380 340 400" dangerouslySetInnerHTML={{ __html: heroMarkup(me.look, worn) }} />
          </div>
          <p className="dqp-gear-count">{GEAR.filter((item) => isUnlocked(sheet, item)).length} of {GEAR.length} unlocked{worn.title ? ` · ${sheet.name} ${GEAR_BY_ID[worn.title]?.name}` : ''}</p>
          {SLOTS.map((slot) => (
            <div key={slot.id}>
              <h3>{slot.icon} {slot.name}</h3>
              <div className="dqp-gear-grid">
                {GEAR.filter((item) => item.slot === slot.id && (!item.cls || item.cls === sheet.classId)).map((item) => {
                  const open = isUnlocked(sheet, item);
                  const on = worn[slot.id] === item.id;
                  const have = Math.min(item.need, deedValue(sheet, item.deed));
                  return (
                    <button key={item.id} type="button" disabled={!open} className={`dqp-gear-item${on ? ' is-on' : ''}${open ? '' : ' is-locked'}${slot.id === 'title' ? ' dqp-gear-title' : ''}`}
                      onClick={() => send('act', { type: 'wear', slot: slot.id, id: on ? null : item.id })}>
                      {slot.id !== 'title' && (
                        // eslint-disable-next-line react/no-danger
                        <svg viewBox={pieceBox(item)} dangerouslySetInnerHTML={{ __html: pieceMarkup(item) }} />
                      )}
                      <b>{open ? '' : '🔒 '}{item.name}</b>
                      {!open && <i>{howToUnlock(item)}</i>}
                      {!open && <span className="dqp-gear-bar"><span style={{ width: `${(have / item.need) * 100}%` }} /></span>}
                      {!open && item.deed !== 'level' && <i>{have}/{item.need}</i>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
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
