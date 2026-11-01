import React, { useCallback, useEffect, useRef, useState } from 'react';
import Person from './Person';
import { GAME_META, metaFor } from './games/meta';
import { PHONES } from './games/phones';
import {
  COSTUMES, crewLook, HIDDEN, CREW_NAMES, EDITOR_ROWS, hex, isLookCode, lookCode, parseLook, randomLook, stepLook,
} from './look';
import { cleanCode, newCid, openPhone } from './net';
import { currentUser, firstName, loadSaved, saveCharacter, signInWithGoogle, signOutHere } from './account';
import './party.css';

// ?seat=2 keeps a separate player per tab, for trying several phones in one browser.
const STORE = `lc-phone${new URLSearchParams(window.location.search).get('seat') || ''}`;
const readStore = () => {
  try { return JSON.parse(window.localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; }
};
const writeStore = (value) => {
  try { window.localStorage.setItem(STORE, JSON.stringify(value)); } catch (error) { /* private mode */ }
};

// Forget a ?code= from a scanned QR once that room is gone, so a refresh doesn't fill in the old code.
const dropCodeParam = () => {
  try {
    if (new URLSearchParams(window.location.search).has('code')) window.history.replaceState(null, '', window.location.pathname);
  } catch (error) { /* leave it */ }
};

const Editor = ({ look, onChange }) => {
  const [open, setOpen] = useState('costume');
  return (
    <div className="lcp-editor">
      <div className="lcp-quick">
        <button type="button" onClick={() => onChange(randomLook())}>🎲 Random</button>
        <select value="" onChange={(e) => e.target.value !== '' && onChange({ ...crewLook(Number(e.target.value)), costume: parseLook(look).costume })} aria-label="Start from a Hood League crew member">
          <option value="">Start as a Hood crew member…</option>
          {CREW_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
        </select>
      </div>
      {EDITOR_ROWS.map((row) => {
        const value = parseLook(look)[row.key];
        const label = row.toggle ? (value ? 'On' : 'Off') : row.names ? row.names[value] : null;
        return (
          <div key={row.key} className={`lcp-row${open === row.key ? ' is-open' : ''}`}>
            <span className="lcp-row-label">{row.label}</span>
            <button type="button" className="lcp-arrow" onClick={() => onChange(stepLook(parseLook(look), row.key, -1))} aria-label={`Previous ${row.label}`}>‹</button>
            <button type="button" className="lcp-row-value" onClick={() => setOpen(open === row.key ? null : row.key)}>
              {row.colors ? <i style={{ background: hex(row.colors[value]) }} /> : label}
            </button>
            <button type="button" className="lcp-arrow" onClick={() => onChange(stepLook(parseLook(look), row.key, 1))} aria-label={`Next ${row.label}`}>›</button>
            {open === row.key && row.colors && (
              <div className="lcp-swatches">
                {row.colors.map((c, i) => (
                  <button type="button" key={c} className={i === value ? 'is-on' : ''} style={{ background: hex(c) }} onClick={() => onChange({ ...parseLook(look), [row.key]: i })} aria-label={`Color ${i + 1}`} />
                ))}
              </div>
            )}
            {open === row.key && row.names && row.names.length > 3 && (
              <div className="lcp-chips">
                {row.names.map((n, i) => (HIDDEN[row.key]?.has(i) ? null : (
                  <button type="button" key={n} className={i === value ? 'is-on' : ''} onClick={() => onChange({ ...parseLook(look), [row.key]: i })}>{n}</button>
                )))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** The phone page: join a room, dress up your character, then play with three charm buttons. */
export default function PartyPlay() {
  const params = new URLSearchParams(window.location.search);
  const stored = readStore();
  const [code, setCode] = useState(cleanCode(params.get('code') || stored.code || ''));
  const [name, setName] = useState(stored.name || '');
  const [look, setLook] = useState(isLookCode(stored.look) ? stored.look : lookCode({ ...crewLook(Math.floor(Math.random() * 10)), costume: 1 + Math.floor(Math.random() * (COSTUMES.length - 1)) }));
  const [cid] = useState(stored.cid || newCid());
  const [joined, setJoined] = useState(Boolean(stored.joined && stored.code && (!params.get('code') || cleanCode(params.get('code')) === stored.code)));
  const [screen, setScreen] = useState(null);
  const [lost, setLost] = useState(false);
  const [user, setUser] = useState(null);
  const [saved, setSaved] = useState(null);
  const [saveNote, setSaveNote] = useState('');
  const [tab, setTab] = useState('look');
  const [note, setNote] = useState('');
  const phoneRef = useRef(null);
  const screenRef = useRef(null);
  const lastHeard = useRef(0);

  useEffect(() => { writeStore({ code, name, look, cid, joined }); }, [code, name, look, cid, joined]);
  useEffect(() => {
    document.title = 'Hood Games Night';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  // Google account: load a saved character after signing in.
  useEffect(() => {
    let live = true;
    currentUser().then(async (u) => {
      if (!live || !u) return;
      setUser(u);
      const s = await loadSaved(u);
      if (!live) return;
      setSaved(s);
      if (s && readStore().loadSaved) {
        setLook(s.look);
        setName((n) => n || s.name);
        writeStore({ ...readStore(), loadSaved: false });
      } else if (!readStore().name) {
        setName(firstName(u));
      }
    });
    return () => { live = false; };
  }, []);

  // The room connection
  useEffect(() => {
    if (!joined || code.length !== 4) return undefined;
    setScreen(null);
    setLost(false);
    lastHeard.current = Date.now();
    screenRef.current = null;
    const phone = openPhone(code, cid, (payload) => {
      if (payload?.code && payload.code !== code) return;
      lastHeard.current = Date.now();
      if (payload?.screen === 'closed') {
        // The TV opened a new room. Back to the join screen to type the new code.
        screenRef.current = null;
        setNote(`Room ${code} closed. Type the new code from the TV.`);
        dropCodeParam();
        setCode('');
        setJoined(false);
        setScreen(null);
        setLost(false);
        return;
      }
      screenRef.current = payload;
      setLost(false);
      setScreen(payload);
    });
    phoneRef.current = phone;
    const hello = () => phone.send('hello', { name: nameRef.current, look: lookRef.current });
    const first = window.setTimeout(hello, 600);
    const timer = window.setInterval(() => {
      // Once the host takes you out, stop knocking, or you'd be let straight back in.
      if (screenRef.current?.screen === 'kicked') return;
      hello();
      if (Date.now() - lastHeard.current > 14000) setLost(true);
    }, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      phone.close();
      phoneRef.current = null;
    };
  }, [joined, code, cid]);
  const nameRef = useRef(name);
  const lookRef = useRef(look);
  nameRef.current = name;
  lookRef.current = look;

  // Send look changes to the TV, a moment after the last tap.
  useEffect(() => {
    if (!joined) return undefined;
    const t = window.setTimeout(() => phoneRef.current?.send('look', { name, look }), 200);
    return () => window.clearTimeout(t);
  }, [look, name, joined]);

  // Keep the screen awake during a game, and buzz when spooked.
  const inGame = screen?.screen === 'game';
  useEffect(() => {
    if (!inGame || !navigator.wakeLock) return undefined;
    let lock = null;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [inGame]);

  const send = useCallback((event, payload) => phoneRef.current?.send(event, payload), []);

  const join = (e) => {
    e?.preventDefault();
    if (code.length !== 4 || !name.trim()) return;
    setNote('');
    setJoined(true);
  };
  const leave = () => {
    send('bye');
    setJoined(false);
    setScreen(null);
  };
  // The room is gone (TV refreshed into a new code, or closed): clear the code so the new one can go in.
  const changeRoom = () => {
    send('bye');
    setJoined(false);
    setScreen(null);
    setCode('');
    setNote('');
    dropCodeParam();
  };

  const googleSignIn = () => {
    writeStore({ ...readStore(), code, name, look, cid, joined, loadSaved: true });
    signInWithGoogle(`${window.location.origin}/play${code ? `?code=${code}` : ''}`);
  };
  const save = async () => {
    setSaveNote('Saving…');
    try {
      await saveCharacter(look, name.trim());
      setSaved({ look, name, from: 'party' });
      setSaveNote('Saved to your Google account ✓');
    } catch (error) {
      setSaveNote(`Couldn't save: ${error.message || error}`);
    }
  };

  const accountBox = (
    <div className="lcp-account">
      {user ? (
        <>
          <span>Signed in as {firstName(user) || user.email}</span>
          <div className="lcp-account-actions">
            <button type="button" onClick={save}>💾 Save character</button>
            {saved && saved.look !== look && <button type="button" onClick={() => { setLook(saved.look); setSaveNote(saved.from === 'hood' ? 'Loaded your Hood Protocol look' : 'Loaded your saved character'); }}>Load saved</button>}
            <button type="button" className="lcp-link" onClick={() => signOutHere().then(() => { setUser(null); setSaved(null); })}>Sign out</button>
          </div>
          {saveNote && <small>{saveNote}</small>}
        </>
      ) : (
        <button type="button" className="lcp-google" onClick={googleSignIn}>
          <span className="lcp-g">G</span> Sign in with Google to save or load your character
        </button>
      )}
    </div>
  );

  // Join screen
  if (!joined) {
    return (
      <div className="lcp">
        <h1 className="lc-title lcp-title">Games Night</h1>
        {note && <p className="lcp-note-closed">{note}</p>}
        <form className="lcp-join" onSubmit={join}>
          <label>Room code
            <input value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABCD" autoCapitalize="characters" autoComplete="off" inputMode="text" maxLength={4} className="lcp-code" />
          </label>
          <label>Your name
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 12))} placeholder="Name" maxLength={12} autoComplete="nickname" />
          </label>
          <button type="submit" className="lc-btn lc-btn-big" disabled={code.length !== 4 || !name.trim()}>Join</button>
        </form>
        <div className="lcp-preview small"><Person look={look} pose="wave" /></div>
        {accountBox}
        <p className="lcp-fine">You'll pick your costume after you join.</p>
      </div>
    );
  }

  const header = (
    <div className="lcp-head">
      <span className="lcp-head-code">{code}</span>
      <span className="lcp-head-name">{name}</span>
      <button type="button" className="lcp-link" onClick={leave}>Leave</button>
    </div>
  );

  if (lost || !screen) {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <Person look={look} pose={lost ? 'scared' : 'wave'} />
          <p>{lost ? `Can't reach room ${code}. Is the TV page still open? Double-check the code.` : `Joining room ${code}…`}</p>
          {lost && <button type="button" className="lc-btn" onClick={changeRoom}>Enter a new code</button>}
        </div>
      </div>
    );
  }

  if (screen.screen === 'full' || screen.screen === 'kicked') {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <Person look={look} pose="scared" />
          <p>{screen.screen === 'full' ? `Room ${code} is full (${screen.max} players).` : 'The host took you out of the room.'}</p>
          <button type="button" className="lc-btn" onClick={() => { setJoined(false); setTimeout(() => setJoined(true), 50); }}>Try again</button>
        </div>
      </div>
    );
  }

  if (screen.screen === 'lobby') {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-lobby">
          <div className="lcp-preview"><Person look={look} pose="wave" /></div>
          <p className="lcp-note">You're in! Your character is on the TV. Dress up while everyone joins.</p>
          {screen.vip ? (
            <div className="lcp-pick">
              <span>👑 You pick the game</span>
              <div className="lcp-pick-list">
                {GAME_META.map((g) => (
                  <button type="button" key={g.id} className={g.id === screen.gameId ? 'is-on' : ''} disabled={g.soon} onClick={() => send('pick', { game: g.id })}>
                    <span>{g.emoji}</span>
                    <b>{g.title}</b>
                    <small>{g.soon ? 'Soon' : g.tag}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="lcp-nowgame">Up next: <b>{metaFor(screen.gameId).emoji} {metaFor(screen.gameId).title}</b></p>
          )}
          <button type="button" className={`lc-btn lc-btn-big lcp-start${screen.ready ? ' is-ready' : ''}`} onClick={() => send('ready', { ready: !screen.ready })}>
            {screen.ready ? `✓ Ready! (${screen.readyCount}/${screen.count})` : `I'm ready (${screen.readyCount}/${screen.count})`}
          </button>
          {screen.vip && <button type="button" className="lcp-link" onClick={() => send('start')}>👑 Start now without waiting</button>}
          <div className="lcp-tabs">
            <button type="button" className={tab === 'look' ? 'is-on' : ''} onClick={() => setTab('look')}>Costume & look</button>
            <button type="button" className={tab === 'name' ? 'is-on' : ''} onClick={() => setTab('name')}>Name & account</button>
          </div>
          {tab === 'look' ? <Editor look={look} onChange={(l) => setLook(lookCode(l))} /> : (
            <div className="lcp-namebox">
              <label>Your name
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, 12))} maxLength={12} />
              </label>
              {accountBox}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen.screen === 'howto') {
    return (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <Person look={look} pose="wave" />
          <p className="lcp-big">👀 Look at the TV</p>
          <p>Here's how to play {metaFor(screen.gameId).title}. {metaFor(screen.gameId).phoneHint}</p>
          {screen.vip && <button type="button" className="lc-btn" onClick={() => send('skip')}>⏭ Skip the intro</button>}
        </div>
      </div>
    );
  }

  // In a game
  const Phone = PHONES[screen.gameId];
  if (!screen.game || !Phone) {
    return (
      <div className="lcp">{header}<div className="lcp-wait"><Person look={look} pose="wave" /><p>A game is on. You'll jump in in a second…</p></div></div>
    );
  }
  return <Phone screen={screen} send={send} look={look} header={header} />;
}
