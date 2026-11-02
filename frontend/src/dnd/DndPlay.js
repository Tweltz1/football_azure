import React, { useCallback, useEffect, useRef, useState } from 'react';
import Person from '../party/Person';
import { crewLook, isLookCode, lookCode, parseLook, randomLook } from '../party/look';
import { cleanCode, netMode, newCid, openPhone } from '../party/net';
import { currentUser, firstName, signInWithGoogle, signOutHere } from '../party/account';
import { PREFIX } from './constants';
import { canTranscribe, useTranscriber, useVoice } from './voice';
import PlayerGame from './PlayerGame';
import DmConsole from './DmConsole';
import {
  acOf, actionsOf, CLASS_IDS, CLASSES, describe, maxHpFor, newCharacter, normalizeCharacter, RACE_IDS, RACES, speedOf,
} from './rules';
import { joinCampaign, listCharacters, saveCharacterSheet } from './dndApi';
import '../party/party.css';
import './dnd.css';

const STORE = `dq-phone${new URLSearchParams(window.location.search).get('seat') || ''}`;
const readStore = () => {
  try { return JSON.parse(window.localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; }
};
const writeStore = (value) => {
  try { window.localStorage.setItem(STORE, JSON.stringify(value)); } catch (error) { /* private mode */ }
};

/** A class's outfit on top of a look: the wizard gets the wizard hat, and so on. */
export const dressFor = (look, classId) => ({ ...parseLook(look), ...(CLASSES[classId]?.look || {}), costume: 0 });

/** Make or edit a hero: name, race, class and look. */
const Builder = ({ initial, onDone, onCancel }) => {
  const [name, setName] = useState(initial?.name || '');
  const [raceId, setRaceId] = useState(initial?.raceId || 'human');
  const [classId, setClassId] = useState(initial?.classId || 'fighter');
  const [look, setLook] = useState(initial?.look && isLookCode(initial.look) ? initial.look : lookCode(dressFor(lookCode(randomLook()), initial?.classId || 'fighter')));
  const preview = newCharacter({ name, classId, raceId });
  const hp = maxHpFor(classId, raceId, initial?.level || 1, preview.stats);
  const pickClass = (id) => {
    setClassId(id);
    setLook(lookCode(dressFor(look, id)));
  };
  return (
    <div className="dqb">
      <div className="dqb-top">
        <div className="lcp-preview"><Person look={look} pose="wave" /></div>
        <div className="dqb-looks">
          <button type="button" onClick={() => setLook(lookCode(dressFor(lookCode(randomLook()), classId)))}>🎲 New look</button>
          <select value="" onChange={(e) => e.target.value !== '' && setLook(lookCode(dressFor(lookCode(crewLook(Number(e.target.value))), classId)))} aria-label="Hood crew look">
            <option value="">Hood crew face…</option>
            {['John', 'Evan', 'Bush', 'Pat', 'Michael', 'Chrome', 'Connor', 'Ben', 'Weltz', 'Logan'].map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </div>
      </div>
      <label className="dqb-name">Hero name
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Thorin Mugbreaker" maxLength={24} />
      </label>
      <h3>Race</h3>
      <div className="dqb-chips">
        {RACE_IDS.map((id) => <button key={id} type="button" className={id === raceId ? 'is-on' : ''} onClick={() => setRaceId(id)}>{RACES[id].name}</button>)}
      </div>
      <p className="dqp-fine">{RACES[raceId].perk} Speed {RACES[raceId].speed} ft.</p>
      <h3>Class</h3>
      <div className="dqb-classes">
        {CLASS_IDS.map((id) => (
          <button key={id} type="button" className={id === classId ? 'is-on' : ''} onClick={() => pickClass(id)}>
            <b>{CLASSES[id].name}</b>
            <small>{CLASSES[id].blurb}</small>
          </button>
        ))}
      </div>
      <p className="dqp-fine">Level 1: {hp} HP · AC {acOf(preview)} · {speedOf(preview)} ft · {actionsOf(preview).map((a) => a.name).join(', ')}</p>
      <div className="dqp-row">
        <button type="button" className="lc-btn lc-btn-big" disabled={!name.trim()} onClick={() => onDone({ ...(initial || {}), ...(initial?.classId === classId && initial?.raceId === raceId ? {} : { stats: preview.stats }), name: name.trim(), classId, raceId, look })}>
          {initial?.id ? 'Save hero' : 'Create hero'}
        </button>
        {onCancel && <button type="button" className="lcp-link" onClick={onCancel}>Back</button>}
      </div>
    </div>
  );
};

/** The phone page for Hood Quest: join a table as a hero or the DM. */
export default function DndPlay() {
  const params = new URLSearchParams(window.location.search);
  const stored = readStore();
  const [code, setCode] = useState(cleanCode(params.get('code') || stored.code || ''));
  const [name, setName] = useState(stored.name || '');
  const [role, setRole] = useState(stored.role === 'dm' ? 'dm' : 'player');
  const [cid] = useState(stored.cid || newCid());
  const [sheet, setSheet] = useState(stored.sheet ? normalizeCharacter(stored.sheet) : null);
  const [sheetId, setSheetId] = useState(stored.sheet?.id || null);
  const [joined, setJoined] = useState(Boolean(stored.joined && stored.code && (!params.get('code') || cleanCode(params.get('code')) === stored.code)));
  const [screen, setScreen] = useState(null);
  const [lost, setLost] = useState(false);
  const [user, setUser] = useState(null);
  const [mine, setMine] = useState(null);
  const [building, setBuilding] = useState(false);
  const [toast, setToast] = useState(null);
  const [note, setNote] = useState('');
  const [voiceOn, setVoiceOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [transcribeOn, setTranscribeOn] = useState(Boolean(stored.transcribe));
  const phoneRef = useRef(null);
  const screenRef = useRef(null);
  const lastHeard = useRef(0);
  const savedJson = useRef('');

  const look = sheet?.look || stored.look || lookCode(dressFor(lookCode(randomLook()), 'fighter'));
  const fullSheet = sheet ? { ...sheet, id: sheetId, look } : null;

  useEffect(() => { writeStore({ code, name, role, cid, joined, sheet: fullSheet, look, transcribe: transcribeOn }); });

  useEffect(() => {
    document.title = 'Hood Quest';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  useEffect(() => {
    let live = true;
    currentUser().then((u) => {
      if (!live || !u) return;
      setUser(u);
      setName((n) => n || firstName(u));
      listCharacters().then((list) => live && setMine(list || [])).catch(() => live && setMine([]));
    });
    return () => { live = false; };
  }, []);

  const helloRef = useRef(null);
  const sendResult = useRef('');
  const [phoneStatus, setPhoneStatus] = useState('');
  helloRef.current = () => phoneRef.current?.send('hello', { name, role, look, sheet: role === 'player' ? fullSheet : null, userId: user?.id || null, voice: voiceOn, muted, transcribing: transcribeOn })
    .then((result) => { sendResult.current = String(result); });

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
        setNote(`Table ${code} closed. Type the new code from the TV.`);
        setCode('');
        setJoined(false);
        setScreen(null);
        return;
      }
      if (payload?.toast) {
        setToast(payload.toast);
        window.setTimeout(() => setToast((t) => (t === payload.toast ? null : t)), 3000);
      }
      screenRef.current = payload;
      setLost(false);
      setScreen(payload);
    }, (status, err) => setPhoneStatus(err ? `${status}: ${err.message || err}` : status), PREFIX);
    phoneRef.current = phone;
    const first = window.setTimeout(() => helloRef.current(), 500);
    const timer = window.setInterval(() => {
      if (screenRef.current?.screen === 'kicked') return;
      helloRef.current();
      if (Date.now() - lastHeard.current > 16000) setLost(true);
    }, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      phone.close();
      phoneRef.current = null;
    };
  }, [joined, code, cid]);

  // Voice chat and speech to text. The TV learns who is on from every hello, so a refresh can't lose it.
  const live = joined && Boolean(screen) && !lost;
  const voicePeers = (screen?.voice || []).map((v) => v.cid).filter((id) => id !== cid);
  const voice = useVoice({ code, cid, prefix: PREFIX, peers: voicePeers, active: live && voiceOn, mic: true, muted });
  const transcriber = useTranscriber({
    enabled: live && transcribeOn,
    onLine: (text) => phoneRef.current?.send('act', { type: 'speech', text }),
  });
  useEffect(() => {
    if (!joined) return undefined;
    const t = window.setTimeout(() => {
      phoneRef.current?.send('act', { type: 'voice', on: voiceOn, muted });
      phoneRef.current?.send('act', { type: 'transcribe', on: transcribeOn });
    }, 100);
    return () => window.clearTimeout(t);
  }, [voiceOn, muted, transcribeOn, joined]);

  // Tell the TV about a new or changed hero right away.
  const sheetKey = JSON.stringify([fullSheet, role]);
  useEffect(() => {
    if (!joined) return undefined;
    const t = window.setTimeout(() => helloRef.current(), 150);
    return () => window.clearTimeout(t);
  }, [sheetKey, joined]);

  // Signed in: the hero saves to the Google account as the adventure goes (level, HP, loot).
  const game = screen?.game;
  useEffect(() => {
    if (!user || !game?.me?.sheet) return undefined;
    const now = { ...game.me.sheet, id: sheetId || game.me.characterId || null, hp: game.me.hp, look, campaignId: game.campaignId || null };
    const json = JSON.stringify([now.xp, now.level, now.hp, now.gold, now.inventory, now.campaignId]);
    if (json === savedJson.current) return undefined;
    const t = window.setTimeout(async () => {
      try {
        const res = await saveCharacterSheet(now);
        savedJson.current = json;
        if (res?.id && res.id !== sheetId) {
          setSheetId(res.id);
          phoneRef.current?.send('act', { type: 'characterId', id: res.id });
        }
        if (now.campaignId) joinCampaign(now.campaignId).catch(() => {});
      } catch (error) { /* try again on the next change */ }
    }, savedJson.current ? 20000 : 3000);
    return () => window.clearTimeout(t);
  }, [user, game, sheetId, look]);

  const send = useCallback((event, payload) => phoneRef.current?.send(event, payload), []);

  const googleSignIn = () => {
    writeStore({ ...readStore(), code, name, role, cid, joined });
    signInWithGoogle(`${window.location.origin}/dnd/play${code ? `?code=${code}` : ''}`);
  };

  const finishHero = async (built) => {
    const clean = normalizeCharacter(built);
    clean.look = built.look;
    setSheet(clean);
    setBuilding(false);
    if (user) {
      try {
        const res = await saveCharacterSheet({ ...clean, id: built.id || null });
        if (res?.id) setSheetId(res.id);
        setMine((list) => [res, ...(list || []).filter((c) => c.id !== res.id)]);
      } catch (error) {
        setNote(`Saved on this phone only: ${error.message}`);
      }
    } else {
      setSheetId(null);
    }
  };

  const pickSaved = (c) => {
    const clean = normalizeCharacter(c);
    clean.look = c.look;
    setSheet(clean);
    setSheetId(c.id);
    setName((n) => n || c.name);
  };

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

  const account = (
    <div className="lcp-account">
      {user ? (
        <>
          <span>Signed in as {firstName(user) || user.email}. Heroes and campaigns save to your account.</span>
          <button type="button" className="lcp-link" onClick={() => signOutHere().then(() => { setUser(null); setMine(null); })}>Sign out</button>
        </>
      ) : (
        <button type="button" className="lcp-google" onClick={googleSignIn}><span className="lcp-g">G</span> Sign in with Google to save your hero</button>
      )}
    </div>
  );

  const heroPicker = (
    <div className="dqb-pick">
      {fullSheet && !building && (
        <div className="dqb-current">
          <div className="lcp-preview small"><Person look={look} pose="wave" /></div>
          <div>
            <b>{fullSheet.name}</b>
            <small>{describe(fullSheet)} · {fullSheet.xp} XP</small>
            <button type="button" className="lcp-link" onClick={() => setBuilding(true)}>Edit</button>
          </div>
        </div>
      )}
      {building || !fullSheet ? (
        <Builder initial={building ? fullSheet : null} onDone={finishHero} onCancel={fullSheet ? () => setBuilding(false) : null} />
      ) : null}
      {mine && mine.length > 0 && !building && (
        <div className="dqb-saved">
          <h3>Your saved heroes</h3>
          {mine.map((c) => (
            <button key={c.id} type="button" className={`dqdm-camp${c.id === sheetId ? ' is-on' : ''}`} onClick={() => pickSaved(c)}>
              <b>{c.name}</b><small>{describe(normalizeCharacter(c))} · {c.xp || 0} XP</small>
            </button>
          ))}
        </div>
      )}
      {!building && fullSheet && <button type="button" className="lc-btn lc-btn-ghost" onClick={() => { setSheet(null); setSheetId(null); setBuilding(true); }}>➕ New hero</button>}
    </div>
  );

  if (!joined) {
    return (
      <div className="dq">
        <div className="lcp">
          <h1 className="dq-title lcp-title">Hood Quest</h1>
          {note && <p className="lcp-note-closed">{note}</p>}
          <form className="lcp-join" onSubmit={join}>
            <label>Table code
              <input value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABCD" autoCapitalize="characters" autoComplete="off" maxLength={4} className="lcp-code" />
            </label>
            <label>Your name
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 16))} placeholder="Name" maxLength={16} autoComplete="nickname" />
            </label>
            <div className="dqb-role">
              <button type="button" className={role === 'player' ? 'is-on' : ''} onClick={() => setRole('player')}>🛡️ Hero</button>
              <button type="button" className={role === 'dm' ? 'is-on' : ''} onClick={() => setRole('dm')}>🎲 Dungeon Master</button>
            </div>
            <button type="submit" className="lc-btn lc-btn-big" disabled={code.length !== 4 || !name.trim()}>Join the table</button>
          </form>
          {account}
          <p className="lcp-fine">{role === 'dm' ? 'As DM you co-host with the AI narrator: approve or rewrite its narration, move monsters, call for checks and save the campaign.' : 'You make or pick your hero after you join.'}</p>
        </div>
      </div>
    );
  }

  const header = (
    <div className="lcp-head">
      <span className="lcp-head-code">{code}</span>
      <span className="lcp-head-name">{role === 'dm' ? `🎲 ${name}` : fullSheet?.name || name}</span>
      <button type="button" className="lcp-link" onClick={leave}>Leave</button>
    </div>
  );

  let body;
  if (lost || !screen) {
    body = (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <Person look={look} pose={lost ? 'scared' : 'wave'} />
          <p>{lost ? `Can't reach table ${code}. Is the TV page still open?` : `Joining table ${code}…`}</p>
          {lost && <p className="lcp-note">Mode: {netMode()} · connection: {phoneStatus || 'none'} · last message: {sendResult.current || 'not sent'}</p>}
          {lost && <button type="button" className="lc-btn" onClick={() => { setJoined(false); setCode(''); }}>Enter a new code</button>}
        </div>
      </div>
    );
  } else if (screen.screen === 'full' || screen.screen === 'kicked') {
    body = (
      <div className="lcp">
        {header}
        <div className="lcp-wait">
          <p>{screen.screen === 'full' ? `Table ${code} is full (${screen.max} heroes).` : 'The host took you off the table.'}</p>
          <button type="button" className="lc-btn" onClick={() => { setJoined(false); setTimeout(() => setJoined(true), 50); }}>Try again</button>
        </div>
      </div>
    );
  } else if (screen.screen === 'lobby' || (role === 'player' && !screen.game) || (role === 'dm' && !screen.dm)) {
    body = (
      <div className="lcp">
        {header}
        <div className="lcp-lobby">
          {role === 'dm' ? (
            <div className="dqdm-lobby">
              <p className="lcp-note">You're the DM. {screen.count} hero{screen.count === 1 ? '' : 'es'} at the table.</p>
              <ul className="dqdm-heroes">{screen.heroes.map((h) => <li key={h.cid}>{h.sheet ? `${h.sheet.name}: ${RACES[h.sheet.raceId]?.name} ${CLASSES[h.sheet.classId]?.name} ${h.sheet.level}` : `${h.name} (choosing…)`}</li>)}</ul>
              <button type="button" className="lc-btn lc-btn-big" disabled={!screen.count} onClick={() => send('act', { type: 'begin' })}>⚔️ Begin the adventure</button>
              <p className="lcp-fine">Pick a campaign after you start (Campaign tab), or play a one-shot. {user ? '' : 'Sign in to use the AI narrator and save campaigns.'}</p>
              {account}
            </div>
          ) : (
            <>
              <p className="lcp-note">{fullSheet ? "You're at the table! Waiting for the DM to begin." : 'Make your hero.'}</p>
              {heroPicker}
              {account}
            </>
          )}
        </div>
      </div>
    );
  } else if (role === 'dm') {
    body = <DmConsole screen={screen} send={send} header={header} user={user} onSignIn={googleSignIn} />;
  } else {
    body = <PlayerGame view={screen.game} send={send} header={header} toast={toast} />;
  }
  const others = (screen?.voice || []).filter((v) => v.cid !== cid && v.cid !== 'tv');
  const voiceBar = live && (
    <div className="dqv">
      {(screen.transcribing || []).length > 0 && <div className="dqv-rec">🎙 Transcribing: {screen.transcribing.join(', ')}</div>}
      <div className="dqv-row">
        {voiceOn ? (
          <>
            <button type="button" className={`dqv-btn${muted ? ' is-off' : ' is-on'}`} onClick={() => setMuted(!muted)}>{muted ? '🔇 Muted' : '🎙 Talking'}</button>
            <button type="button" className="dqv-btn" onClick={() => { setVoiceOn(false); setMuted(false); }}>Leave voice</button>
          </>
        ) : (
          <button type="button" className="dqv-btn" onClick={() => setVoiceOn(true)}>🎧 Join voice{others.length ? ` (${others.length})` : ''}</button>
        )}
        {canTranscribe && (
          <button type="button" className={`dqv-btn${transcribeOn ? ' is-on' : ''}`} onClick={() => setTranscribeOn(!transcribeOn)}>
            {transcribeOn ? (transcriber.listening ? '📝 Transcribing' : '📝 Starting…') : '📝 Transcribe me'}
          </button>
        )}
      </div>
      {voiceOn && <div className="dqv-note">{voice.state === 'starting' ? 'Connecting voice…' : others.length ? `In voice: ${others.map((v) => `${v.name}${v.muted ? ' (muted)' : ''}`).join(', ')}` : 'Nobody else is on voice yet.'}</div>}
      {voice.needsTap && <button type="button" className="dqv-btn is-on" onClick={voice.resume}>🔊 Tap to hear the others</button>}
      {(voice.error || transcriber.error) && <div className="dqv-note is-error">{voice.error || transcriber.error}</div>}
    </div>
  );
  return <div className="dq">{body}{voiceBar}</div>;
}
