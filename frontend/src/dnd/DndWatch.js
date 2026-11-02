import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cleanCode, newCid, openPhone } from '../party/net';
import Board from './Board';
import { unpack } from './MiniMap';
import { settingFor } from './settings';
import { PREFIX } from './constants';
import '../party/party.css';
import './dnd.css';

// A remote player's big screen: the TV's board, mirrored to a laptop or tablet. Controls stay on the phone.

const STORE = 'dq-watch';
const readStore = () => {
  try { return JSON.parse(window.localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; }
};

export default function DndWatch() {
  const stored = readStore();
  const [code, setCode] = useState(cleanCode(new URLSearchParams(window.location.search).get('code') || ''));
  const [typed, setTyped] = useState(code);
  const [cid] = useState(stored.cid || newCid());
  const [screen, setScreen] = useState(null);
  const [lost, setLost] = useState(false);
  const lastHeard = useRef(0);

  useEffect(() => {
    try { window.localStorage.setItem(STORE, JSON.stringify({ cid })); } catch (error) { /* private mode */ }
    document.title = 'Hood Quest: watch';
  }, [cid]);

  useEffect(() => {
    if (code.length !== 4) return undefined;
    setScreen(null);
    setLost(false);
    lastHeard.current = Date.now();
    const phone = openPhone(code, cid, (payload) => {
      if (payload?.code && payload.code !== code) return;
      lastHeard.current = Date.now();
      setLost(false);
      setScreen(payload);
    }, undefined, PREFIX);
    const hello = () => phone.send('hello', { name: 'Watcher', role: 'watch' });
    const first = window.setTimeout(hello, 600);
    const timer = window.setInterval(() => {
      hello();
      if (Date.now() - lastHeard.current > 16000) setLost(true);
    }, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      phone.send('bye', {});
      phone.close();
    };
  }, [code, cid]);

  const w = screen?.watch;
  const packed = w?.map;
  const map = useMemo(() => (packed ? unpack(packed) : null), [packed?.seed, packed?.setting]); // eslint-disable-line react-hooks/exhaustive-deps
  const game = useMemo(() => (w && map ? {
    map,
    tokens: w.tokens.map((t) => ({ ...t, sheet: t.classId ? { classId: t.classId } : null })),
    combat: w.combat,
    npcs: w.npcs || [],
    walking: [],
  } : null), [w, map]);

  if (code.length !== 4) {
    return (
      <div className="dq-tv dq-watch-join">
        <h1 className="dq-title">Hood Quest</h1>
        <p className="dq-sub">Watch the board from anywhere. Type the table code from the TV.</p>
        <form onSubmit={(e) => { e.preventDefault(); setCode(cleanCode(typed)); }}>
          <input className="dq-watch-code" value={typed} onChange={(e) => setTyped(cleanCode(e.target.value))} placeholder="CODE" maxLength={4} autoFocus />
          <button type="submit" className="lc-btn lc-btn-big" disabled={typed.length !== 4}>Watch</button>
        </form>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="dq-tv dq-watch-join">
        <h1 className="dq-title">Hood Quest</h1>
        <p className="dq-sub">
          {lost ? `Can't reach table ${code}. Is the TV page still open?`
            : screen ? `Table ${code}: waiting for the adventure to begin. ${screen.count || 0} hero${screen.count === 1 ? '' : 'es'} so far.`
              : `Connecting to table ${code}…`}
        </p>
        <button type="button" className="lc-btn" onClick={() => { setCode(''); setTyped(''); }}>Different code</button>
      </div>
    );
  }

  const setting = settingFor(w.quest.setting);
  return (
    <div className="dq-tv dq-game" style={{ background: `radial-gradient(circle at 50% 40%, ${setting.palette.bg[1]}, ${setting.palette.bg[0]})` }}>
      <Board game={game} now={performance.now()} />
      <div className="dq-hud-top">
        <div className="dq-quest">
          <span className="dq-quest-scene">{setting.emoji} {setting.name} · Scene {w.quest.scene} of {w.quest.scenes}</span>
          <b>{w.quest.title}</b>
        </div>
      </div>
      {w.turnName && <div className={`dq-turn${w.turnFoe ? ' is-foe' : ''}`}>{w.turnFoe ? `${w.turnName} is moving…` : `${w.turnName}'s turn`}</div>}
      {w.narration && <div className="dq-narration"><span className="dq-narration-by">📜 The Narrator</span><p className="dq-narration-text">{w.narration}</p></div>}
      {lost && <div className="dq-watch-lost">Lost the table. Reconnecting…</div>}
    </div>
  );
}
