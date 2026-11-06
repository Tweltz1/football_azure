import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Person from '../party/Person';
import { crewLook, isLookCode, lookCode } from '../party/look';
import { cleanCode, newCid, newRoomCode, openHost, openPhone } from '../party/net';
import { useVoice } from '../dnd/voice';
import {
  claimSeat, computeStats, GAMES, newGameId, setLook, summarize, wakeUp,
} from './engines';
import {
  dropLocalSave, listGames, loadGame, localSaves, putLocalSave, saveGame,
} from './cardsApi';
import FivePhone, { TEAM_COLORS } from './FivePhone';
import ClubsPhone from './ClubsPhone';
import { homeHref, homeLabel, siteOrigin } from '../native/gamesApp';
import { currentUser, firstName, signInWithGoogle } from '../party/account';
import { supabase } from '../supabaseClient';
import { backStyle, designClass, DESIGNS, designOf, isUnlocked, progressFor, TRACKS } from './designs';
import { CardFace } from './CardPhone';
import '../party/party.css';
import './cards.css';

// The card table: 500 and Dirty Clubs on phones only. One phone opens the table and runs the game; the
// others join with the room code. Every phone shows the whole table, and there's voice chat for the room.

const PREFIX = 'ct';
// ?seat=2 keeps a separate player per tab, for trying several phones in one browser.
const TAB = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('seat') || '' : '';
const ME_KEY = `ct-me${TAB}`;
const SESSION_KEY = `ct-session${TAB}`;
const AWAY_MS = 15000;
const STALE_MS = 40000;
const PHONES = { five: FivePhone, clubs: ClubsPhone };

const readJson = (k, fallback) => {
  try { return JSON.parse(window.localStorage.getItem(k) || 'null') || fallback; } catch (error) { return fallback; }
};
const writeJson = (k, v) => {
  try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (error) { /* private mode */ }
};
const joinUrl = () => `${siteOrigin()}/cards`;
const presentOf = (list, now) => list.filter((p) => now - p.lastSeen <= AWAY_MS);
const nowMs = () => performance.now();

const useWakeLock = (on) => {
  useEffect(() => {
    if (!on || !navigator.wakeLock) return undefined;
    let lock = null;
    navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { if (lock) lock.release().catch(() => {}); };
  }, [on]);
};

// ---------- Voice ----------

function VoiceBar({ code, me, players, send }) {
  const [on, setOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const peers = players.filter((p) => p.voice && p.cid !== me).map((p) => p.cid);
  const voice = useVoice({ code, cid: me, prefix: PREFIX, peers, active: on, mic: true, muted });
  useEffect(() => { send({ type: 'voice', on, muted }); }, [on, muted, send]);
  const inVoice = players.filter((p) => p.voice);
  return (
    <div className="lt-voice">
      <button type="button" className={`lt-voice-btn${on ? ' is-on' : ''}`} onClick={() => setOn(!on)}>
        {on ? '📞 Leave voice' : '🎙️ Join voice'}
      </button>
      {on && <button type="button" className="lt-voice-btn" onClick={() => setMuted(!muted)}>{muted ? '🔇 Unmute' : '🎤 Mute'}</button>}
      <span className="lt-voice-who">
        {inVoice.length ? inVoice.map((p) => `${p.muted ? '🔇' : '🎙️'}${p.name}`).join('  ') : 'Nobody on voice yet'}
      </span>
      {voice.needsTap && <button type="button" className="lt-voice-btn" onClick={voice.resume}>🔊 Tap to hear</button>}
      {voice.error && <small className="lt-voice-err">{voice.error}</small>}
      {on && voice.state === 'on' && peers.length > 0 && <small className="lt-voice-err">Connected to {voice.connected.length} of {peers.length}</small>}
    </div>
  );
}

// ---------- The table screen (same for the host and everyone else) ----------

function Lobby({ screen, me, act, isHost, host }) {
  const g = GAMES[screen.gameId];
  const seats = screen.lobby.seats;
  const resumed = screen.lobby.resumed;
  const mySeat = seats.findIndex((s) => s.cid === me);
  return (
    <div className="lt-lobby">
      <div className="lt-invite">
        <span>Room code</span>
        <b>{screen.code}</b>
        <small>Friends open <b>{joinUrl().replace(/^https?:\/\//, '')}</b>, tap Join a table and type the code.</small>
      </div>
      {resumed && <p className="lt-note">Picking up a saved game: {resumed}. Everyone tap your old seat (it matches by name automatically). Empty seats are played by bots until someone sits.</p>}
      <div className="lt-seatlist">
        {seats.map((s, i) => (
          <div key={i} className={`lt-seatrow${s.cid === me ? ' is-me' : ''}`} style={{ borderColor: screen.gameId === 'five' ? TEAM_COLORS[i % 2] : undefined }}>
            <span className="lt-seatno">{screen.gameId === 'five' ? `Team ${(i % 2) + 1}` : `Seat ${i + 1}`}</span>
            <b>{s.name || 'Bot fills in'}</b>
            <small>{s.cid ? (s.here ? '' : 'away') : s.saved ? 'open' : 'bot'}</small>
            {isHost && !resumed && s.cid && i > 0 && <button type="button" className="lt-mini-btn" onClick={() => host.move(i, -1)} aria-label="Move up">↑</button>}
            {isHost && !resumed && s.cid && seats[i + 1]?.cid && <button type="button" className="lt-mini-btn" onClick={() => host.move(i, 1)} aria-label="Move down">↓</button>}
            {resumed && !s.here && mySeat < 0 && <button type="button" className="lt-mini-btn" onClick={() => act('claim', { seat: i })}>Sit here</button>}
          </div>
        ))}
      </div>
      {screen.gameId === 'five' && !resumed && <p className="lt-note">Partners sit across: seats 1 &amp; 3 are Team 1, seats 2 &amp; 4 are Team 2. {isHost ? 'Use the arrows to set teams.' : 'The host sets the teams.'}</p>}
      {screen.lobby.watching.length > 0 && <p className="lt-note">Watching: {screen.lobby.watching.join(', ')}</p>}
      {isHost ? (
        <>
          <button type="button" className="lc-btn lc-btn-big" onClick={host.start}>{resumed ? '▶ Resume the game' : `▶ Deal ${g.title}`}</button>
          <p className="lt-note">Keep this screen open: your phone runs the table. {seats.filter((s) => !s.cid).length ? 'Bots take the empty seats.' : ''}</p>
        </>
      ) : <p className="lt-note">Waiting for {screen.hostName} to deal…</p>}
    </div>
  );
}

function TableScreen({ screen, me, look, act, isHost, host, onLeave }) {
  const g = GAMES[screen.gameId];
  const Phone = PHONES[screen.gameId];
  const sendVoice = useCallback((v) => act('voice', v), [act]);
  const over = screen.game && screen.game.phase === 'final';
  const endButtons = isHost ? (
    <div className="lt-endbtns">
      <button type="button" className="lc-btn lc-btn-big" onClick={host.again}>Play again, same seats</button>
      <button type="button" className="lc-btn lc-btn-ghost" onClick={host.lobby}>Back to the lobby</button>
    </div>
  ) : <p className="lt-note">Waiting for {screen.hostName} to start the next game.</p>;
  return (
    <div className="lcp lcp-game lt-page">
      <div className="lt-topbar">
        <span className="lt-code">{screen.code}</span>
        <b>{g.emoji} {g.title}</b>
        {isHost && screen.screen === 'game' && !over && <button type="button" className="lcp-link" onClick={host.pause}>Save &amp; stop</button>}
        <button type="button" className="lcp-link" onClick={onLeave}>Leave</button>
      </div>
      <VoiceBar code={screen.code} me={me} players={screen.players} send={sendVoice} />
      {screen.note && <p className="lt-note is-good">{screen.note}</p>}
      {screen.screen === 'lobby' && <Lobby screen={screen} me={me} act={act} isHost={isHost} host={host} />}
      {screen.screen === 'game' && screen.game && <Phone game={screen.game} act={act} look={look} endButtons={endButtons} />}
      {screen.screen === 'game' && !screen.game && <p className="lt-note">Getting you a seat…</p>}
    </div>
  );
}

// ---------- Host ----------

function HostTable({ me, gameId, resume, look, onExit }) {
  const def = GAMES[gameId];
  const [code] = useState(() => resume?.code || newRoomCode());
  const [, setFrame] = useState(0);
  const [note, setNote] = useState(resume ? '' : '');
  const players = useRef([{ cid: me.cid, name: me.name, uid: me.uid, design: me.design, lastSeen: Date.now(), voice: false, muted: false }]);
  const game = useRef(resume ? resume.state : null);
  const saveId = useRef(resume ? resume.id : newGameId());
  const mode = useRef('lobby');
  const resumed = useRef(resume ? resume.label : '');
  const order = useRef([me.cid]); // a new game's seat order (cids); everyone else watches
  const hostRef = useRef(null);
  const lastSent = useRef(new Map());
  const lastSaved = useRef({ event: -1, phase: '', at: 0 });
  useWakeLock(true);

  useEffect(() => { writeJson(SESSION_KEY, { role: 'host', code, gameId, saveId: saveId.current }); }, [code, gameId]);


  const persist = useCallback((force = false) => {
    const g = game.current;
    if (!g) return;
    const finished = def.over(g);
    const row = {
      id: saveId.current, game: gameId, finished, summary: summarize(gameId, g), state: finished ? null : g, savedAt: Date.now(),
    };
    putLocalSave(row);
    const ls = lastSaved.current;
    const phaseChange = ls.phase !== g.phase && (g.phase === 'hand' || g.phase === 'final');
    if (force || phaseChange) {
      saveGame(row).catch(() => {});
      if (finished) dropLocalSave(saveId.current);
    }
    lastSaved.current = { event: g.eventId, phase: g.phase, at: Date.now() };
  }, [def, gameId]);

  const lobbySeats = useCallback((now) => {
    const here = presentOf(players.current, now).map((p) => p.cid);
    const g = game.current;
    if (g && resumed.current) {
      return g.seats.map((s) => ({ name: s.name, cid: s.bot ? null : s.cid, here: !s.bot && here.includes(s.cid), saved: !s.bot }));
    }
    const list = order.current.map((cid) => players.current.find((p) => p.cid === cid)).filter(Boolean);
    const seats = list.slice(0, def.maxSeats).map((p) => ({ name: p.name, cid: p.cid, here: true }));
    while (seats.length < 4) seats.push({ name: '', cid: null, here: false });
    return seats;
  }, [def]);

  const screenFor = useCallback((cid) => {
    const now = Date.now();
    const base = {
      screen: mode.current,
      code,
      gameId,
      hostName: me.name,
      note,
      players: presentOf(players.current, now).map((p) => ({ cid: p.cid, name: p.name, voice: p.voice, muted: p.muted })),
    };
    if (mode.current === 'lobby') {
      const seats = lobbySeats(now);
      const seated = new Set(seats.map((s) => s.cid).filter(Boolean));
      return {
        ...base,
        lobby: { seats, resumed: resumed.current, watching: presentOf(players.current, now).filter((p) => !seated.has(p.cid)).map((p) => p.name) },
      };
    }
    const g = game.current;
    return { ...base, game: g && g.players.some((p) => p.cid === cid) ? def.view(g, cid, nowMs()) : null };
  }, [code, def, gameId, lobbySeats, me.name, note]);

  const pushAll = useCallback((force = false) => {
    const host = hostRef.current;
    players.current.forEach((p) => {
      if (p.cid === me.cid || !host) return;
      const json = JSON.stringify(screenFor(p.cid));
      const prev = lastSent.current.get(p.cid);
      if (force || !prev || prev.json !== json || Date.now() - prev.at > 5000) {
        lastSent.current.set(p.cid, { json, at: Date.now() });
        host.sendTo(p.cid, JSON.parse(json));
      }
    });
    setFrame((f) => (f + 1) % 1e6);
  }, [me.cid, screenFor]);

  // Someone back at the table takes their old seat by name.
  const autoSeat = useCallback((p) => {
    const g = game.current;
    if (!g || g.seats.some((s) => s.cid === p.cid)) return;
    const now = Date.now();
    const here = presentOf(players.current, now).map((x) => x.cid);
    const i = g.seats.findIndex((s) => !s.bot && s.name.trim().toLowerCase() === p.name.trim().toLowerCase() && !here.includes(s.cid));
    if (i >= 0) claimSeat(g, i, p.cid, p.name, nowMs());
  }, []);

  const handle = useCallback((event, msg) => {
    const now = Date.now();
    const list = players.current;
    let p = list.find((x) => x.cid === msg.cid);
    const name = String(msg.name || '').trim().slice(0, 12);
    if (event === 'hello') {
      if (!p) {
        if (!name) return;
        p = { cid: msg.cid, name, lastSeen: now, voice: false, muted: false };
        players.current = [...list, p];
        if (!game.current) order.current.push(p.cid);
      } else {
        p.lastSeen = now;
        if (name) p.name = name;
      }
      if (typeof msg.uid === 'string' && msg.uid.length <= 64) p.uid = msg.uid;
      if (typeof msg.design === 'string' && msg.design.length <= 24) p.design = msg.design;
      const g = game.current;
      if (g) {
        setLook(g, p.cid, p);
        autoSeat(p);
        if (mode.current === 'game' && !def.over(g) && !g.seats.some((s) => s.cid === p.cid)) def.addPlayer(g, p.cid, p.name, nowMs());
        def.seen(g, p.cid, nowMs());
      }
      lastSent.current.delete(msg.cid);
      pushAll();
      return;
    }
    if (!p) return;
    p.lastSeen = now;
    if (event === 'bye') {
      players.current = list.filter((x) => x.cid !== msg.cid);
      order.current = order.current.filter((x) => x !== msg.cid);
      pushAll();
      return;
    }
    if (event !== 'act') return;
    const g = game.current;
    if (msg.type === 'voice') {
      p.voice = !!msg.on;
      p.muted = !!msg.muted;
    } else if (msg.type === 'claim' && g) {
      const seat = Number(msg.seat);
      const s = g.seats[seat];
      const here = presentOf(players.current, now).map((x) => x.cid);
      if (s && (s.bot || !here.includes(s.cid))) claimSeat(g, seat, p.cid, p.name, nowMs());
    } else if (g && mode.current === 'game' && !def.over(g)) {
      def.seen(g, p.cid, nowMs());
      def.act(g, p.cid, msg, nowMs());
    }
    pushAll();
  }, [autoSeat, def, pushAll]);

  const handleRef = useRef(handle);
  handleRef.current = handle;
  useEffect(() => {
    const host = openHost(code, (event, msg) => handleRef.current(event, msg), null, PREFIX);
    hostRef.current = host;
    return () => { host.close(); hostRef.current = null; };
  }, [code]);

  // The game loop. An interval (not animation frames) so it keeps going while the screen is busy.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const pushRef = useRef(pushAll);
  pushRef.current = pushAll;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      players.current.find((p) => p.cid === me.cid).lastSeen = now;
      if (mode.current === 'lobby') {
        const before = players.current.length;
        players.current = players.current.filter((p) => now - p.lastSeen <= STALE_MS);
        order.current = order.current.filter((cid) => players.current.some((p) => p.cid === cid));
        if (players.current.length !== before) pushRef.current(true);
      }
      const g = game.current;
      if (g && mode.current === 'game') {
        GAMES[gameId].seen(g, me.cid, nowMs());
        players.current.forEach((p) => { if (now - p.lastSeen <= AWAY_MS) GAMES[gameId].seen(g, p.cid, nowMs()); });
        const before = g.eventId;
        GAMES[gameId].tick(g, nowMs());
        if (g.eventId !== before || g.phase !== lastSaved.current.phase || now - lastSaved.current.at > 15000) persistRef.current();
      }
      pushRef.current();
    }, 200);
    return () => window.clearInterval(timer);
  }, [gameId, me.cid]);

  const actions = {
    move(i, dir) {
      const o = order.current;
      const j = i + dir;
      if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      pushAll(true);
    },
    start() {
      const now = nowMs();
      if (game.current && resumed.current) {
        wakeUp(game.current, now);
        players.current.forEach((p) => autoSeat(p));
        resumed.current = '';
      } else {
        const list = order.current.map((cid) => players.current.find((p) => p.cid === cid)).filter(Boolean);
        const watchers = players.current.filter((p) => !order.current.includes(p.cid));
        game.current = def.create([...list, ...watchers].map((p) => ({ cid: p.cid, name: p.name })), Math.floor(Math.random() * 1e9), now);
        saveId.current = newGameId();
        lastSaved.current = { event: -1, phase: '', at: 0 };
      }
      players.current.forEach((p) => setLook(game.current, p.cid, p));
      setNote('');
      mode.current = 'game';
      writeJson(SESSION_KEY, { role: 'host', code, gameId, saveId: saveId.current });
      persist(true);
      pushAll(true);
    },
    pause() {
      persist(true);
      resumed.current = `${def.title}, hand ${game.current.handNo}`;
      mode.current = 'lobby';
      setNote('Game saved. Resume it here, or later from Pick up a saved game.');
      pushAll(true);
    },
    again() {
      const g = game.current;
      order.current = g.seats.filter((s) => !s.bot).map((s) => s.cid).filter((cid) => players.current.some((p) => p.cid === cid));
      players.current.forEach((p) => { if (!order.current.includes(p.cid)) order.current.push(p.cid); });
      game.current = null;
      resumed.current = '';
      actions.start();
    },
    lobby() {
      game.current = null;
      resumed.current = '';
      mode.current = 'lobby';
      order.current = players.current.map((p) => p.cid);
      pushAll(true);
    },
  };

  const leave = () => {
    if (game.current && mode.current === 'game' && !def.over(game.current)) persist(true);
    writeJson(SESSION_KEY, null);
    onExit();
  };

  const act = useCallback((type, data) => handleRef.current('act', { ...data, type, cid: me.cid }), [me.cid]);
  const screen = screenFor(me.cid);
  return <TableScreen screen={screen} me={me.cid} look={look} act={act} isHost host={actions} onLeave={leave} />;
}

// ---------- Guest ----------

function GuestTable({ me, code, look, onExit }) {
  const [screen, setScreen] = useState(null);
  const [lost, setLost] = useState(false);
  const phoneRef = useRef(null);
  const heard = useRef(Date.now());
  useWakeLock(true);

  useEffect(() => {
    writeJson(SESSION_KEY, { role: 'guest', code });
    const phone = openPhone(code, me.cid, (payload) => {
      heard.current = Date.now();
      setLost(false);
      if (payload && payload.code === code) setScreen(payload);
    }, null, PREFIX);
    phoneRef.current = phone;
    const hello = () => phone.send('hello', { name: me.name, uid: me.uid, design: me.design });
    const first = window.setTimeout(hello, 500);
    const timer = window.setInterval(() => {
      hello();
      if (Date.now() - heard.current > 15000) setLost(true);
    }, 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      phone.close();
      phoneRef.current = null;
    };
  }, [code, me.cid, me.name, me.uid, me.design]);

  const act = useCallback((type, data) => phoneRef.current?.send('act', { ...data, type }), []);
  const leave = () => {
    phoneRef.current?.send('bye');
    writeJson(SESSION_KEY, null);
    onExit();
  };

  if (!screen || lost) {
    return (
      <div className="lcp lt-page">
        <div className="lcp-wait">
          <Person look={look} pose={lost ? 'scared' : 'wave'} />
          <p>{lost ? `Can't reach table ${code}. Is the host's phone still on the table screen?` : `Joining table ${code}…`}</p>
          <button type="button" className="lc-btn" onClick={leave}>Back</button>
        </div>
      </div>
    );
  }
  return <TableScreen screen={screen} me={me.cid} look={look} act={act} isHost={false} onLeave={leave} />;
}

// ---------- Saved games and stats ----------

function SavedGames({ onResume, onBack }) {
  const [rows, setRows] = useState(() => localSaves());
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    Promise.all(['five', 'clubs'].map((g) => listGames(g, true).catch(() => [])))
      .then((lists) => {
        if (!live) return;
        const local = localSaves();
        const seen = new Set(local.map((r) => r.id));
        setRows([...local, ...lists.flat().filter((r) => !seen.has(r.id))]);
      })
      .catch(() => setError('Could not load saved games from the server. Showing the ones on this phone.'));
    return () => { live = false; };
  }, []);
  const label = (r) => {
    const s = r.summary || {};
    if (r.game === 'five') return `${(s.teams || []).map((t) => t.join(' & ')).join(' vs ')} · ${(s.scores || []).join(' to ')} · hand ${s.hands}`;
    return `${(s.seats || []).map((x) => `${x.name} ${x.score}`).join(', ')} · hand ${s.hands}`;
  };
  const resume = async (r) => {
    let state = r.state;
    if (!state) {
      try { state = (await loadGame(r.id)).state; } catch (e) { setError('That save could not be loaded.'); return; }
    }
    if (!state) { setError('That game already finished.'); return; }
    onResume({ id: r.id, gameId: r.game, state, label: label(r) });
  };
  return (
    <div className="lcp lt-page">
      <button type="button" className="lcp-link lt-back" onClick={onBack}>← Back</button>
      <h2 className="lc-title lt-h2">Saved games</h2>
      {error && <p className="lt-note">{error}</p>}
      {!rows.length && <p className="lt-note">No unfinished games. When a game stops early, the host taps Save &amp; stop (or just leaves) and it shows up here.</p>}
      {rows.map((r) => (
        <button type="button" key={r.id} className="lt-savedrow" onClick={() => resume(r)}>
          <b>{GAMES[r.game]?.emoji} {GAMES[r.game]?.title}</b>
          <span>{label(r)}</span>
          <small>{new Date(r.savedAt || r.updatedAt).toLocaleString()}</small>
        </button>
      ))}
    </div>
  );
}

function Stats({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('players');
  useEffect(() => {
    let live = true;
    Promise.all([listGames('five'), listGames('clubs')])
      .then(([f, c]) => { if (live) setData(computeStats(f.map((r) => r.summary), c.map((r) => r.summary))); })
      .catch(() => { if (live) setError('Could not load stats. Check your connection.'); });
    return () => { live = false; };
  }, []);
  return (
    <div className="lcp lt-page">
      <button type="button" className="lcp-link lt-back" onClick={onBack}>← Back</button>
      <h2 className="lc-title lt-h2">Card stats</h2>
      {error && <p className="lt-note">{error}</p>}
      {!data && !error && <p className="lt-note">Loading…</p>}
      {data && (
        <>
          <p className="lt-note">{data.totals.five} games of 500 and {data.totals.clubs} of Dirty Clubs played to the end. Bots don&apos;t count.</p>
          <div className="lcp-tabs">
            <button type="button" className={tab === 'players' ? 'is-on' : ''} onClick={() => setTab('players')}>Players</button>
            <button type="button" className={tab === 'pairs' ? 'is-on' : ''} onClick={() => setTab('pairs')}>500 partners</button>
            <button type="button" className={tab === 'vs' ? 'is-on' : ''} onClick={() => setTab('vs')}>500 matchups</button>
          </div>
          {tab === 'players' && (
            <div className="lt-stats">
              {!data.players.length && <p className="lt-note">No finished games yet.</p>}
              {data.players.map((p) => (
                <div key={p.name} className="lt-statcard">
                  <b>{p.name}</b>
                  <span>{p.wins} wins in {p.games} games ({p.winPct}%)</span>
                  {p.five.games > 0 && <small>500: {p.five.wins}–{p.five.games - p.five.wins} · bids made {p.five.made}/{p.five.bids} ({p.madePct}%) · {p.five.tricks} tricks · {p.five.nola} Nola bids</small>}
                  {p.clubs.games > 0 && <small>Dirty Clubs: {p.clubs.wins}–{p.clubs.games - p.clubs.wins} · {p.clubs.tricks} tricks · set {p.clubs.set} · folded {p.clubs.folds}</small>}
                </div>
              ))}
            </div>
          )}
          {tab === 'pairs' && (
            <div className="lt-stats">
              {!data.pairs.length && <p className="lt-note">No 500 partnerships yet (games with a bot partner don&apos;t count).</p>}
              {data.pairs.map((p) => (
                <div key={p.name} className="lt-statcard">
                  <b>{p.name}</b>
                  <span>{p.wins}–{p.games - p.wins} together ({p.winPct}%)</span>
                  <small>Average {Math.round(p.points / Math.max(1, p.games))} points a game</small>
                </div>
              ))}
            </div>
          )}
          {tab === 'vs' && (
            <div className="lt-stats">
              {!data.matchups.length && <p className="lt-note">No team-vs-team games yet.</p>}
              {data.matchups.map((m) => (
                <div key={`${m.a}|${m.b}`} className="lt-statcard">
                  <b>{m.a} vs {m.b}</b>
                  <span>{m.aWins}–{m.bWins}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Card designs ----------

function Designs({ user, me, onPick, onBack }) {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    Promise.all([listGames('five'), listGames('clubs')])
      .then(([f, c]) => { if (live) setCounts(progressFor(f.map((r) => r.summary), c.map((r) => r.summary), { uid: user.id, name: me.name })); })
      .catch(() => { if (live) setError('Could not load your games, so only the Starter designs show as open.'); });
    return () => { live = false; };
  }, [user, me.name]);
  const signedIn = !!user;
  const unlocked = DESIGNS.filter((d) => isUnlocked(d, counts, signedIn)).length;
  const chosen = designOf(me.design);
  const pick = (d) => {
    if (isUnlocked(d, counts, signedIn)) onPick(d.id);
    else setOpen(open === d.id ? null : d.id);
  };
  return (
    <div className="lcp lt-page">
      <button type="button" className="lcp-link lt-back" onClick={onBack}>← Back</button>
      <h2 className="lc-title lt-h2">Card designs</h2>
      <div className="lt-design-now">
        <span className={`lt-design-back is-big${designClass(chosen.id)}`} style={backStyle(chosen.id)} />
        <CardFace card="14S" design={chosen.id} />
        <CardFace card="13H" design={chosen.id} />
        <div><b>{chosen.name}</b><small>{unlocked} of {DESIGNS.length} unlocked</small></div>
      </div>
      {!signedIn && (
        <div className="lt-design-signin">
          <p className="lt-note">Sign in to get 10 Starter designs and start unlocking the other {DESIGNS.length - 10} by playing: winning games, making bids in every suit, Nola, Double Nola, big bids, slams and 500 to 0 wins.</p>
          <button type="button" className="lc-btn" onClick={() => signInWithGoogle(window.location.href)}>Sign in with Google</button>
        </div>
      )}
      {error && <p className="lt-note">{error}</p>}
      {signedIn && !counts && !error && <p className="lt-note">Checking your games…</p>}
      {TRACKS.map((t) => {
        const list = DESIGNS.filter((d) => d.track === t.id);
        const have = counts ? counts[t.id] : null;
        return (
          <section key={t.id} className="lt-design-track">
            <p className="lt-design-head">
              <b>{t.emblem} {t.title}</b>
              <small>{t.id === 'starter' ? t.blurb : `${list.filter((d) => isUnlocked(d, counts, signedIn)).length}/10${have != null ? ` · you have ${have}` : ''}`}</small>
            </p>
            <div className="lt-design-grid">
              {list.map((d) => {
                const on = isUnlocked(d, counts, signedIn);
                return (
                  <button type="button" key={d.id} className={`lt-design${on ? '' : ' is-locked'}${d.id === chosen.id ? ' is-chosen' : ''}`} onClick={() => pick(d)} aria-label={`${d.name}${on ? '' : `, locked: ${d.goal}`}`}>
                    <span className={`lt-design-back${designClass(d.id)}`} style={backStyle(d.id) || undefined} />
                    {!on && <span className="lt-design-lock">🔒</span>}
                  </button>
                );
              })}
            </div>
            {list.filter((d) => d.id === open).map((d) => (
              <p key={d.id} className="lt-design-goal">🔒 {d.name}: {d.goal}{have != null && d.need ? ` (${Math.min(have, d.need)} of ${d.need})` : ''}</p>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ---------- Home ----------

export default function CardsApp() {
  const params = new URLSearchParams(window.location.search);
  const [me, setMe] = useState(() => {
    const saved = readJson(ME_KEY, {});
    const party = readJson('lc-phone', {});
    return { cid: saved.cid || newCid(), name: saved.name || party.name || '', design: saved.design || 'classic' };
  });
  const [user, setUser] = useState(null);
  const look = useMemo(() => {
    const party = readJson('lc-phone', {});
    return isLookCode(party.look) ? party.look : lookCode({ ...crewLook(me.cid.charCodeAt(2) || 0), costume: 0 });
  }, [me.cid]);
  const session = readJson(SESSION_KEY, null);
  const [page, setPage] = useState(() => {
    if (params.get('code')) return { page: 'join', code: cleanCode(params.get('code')) };
    if (session && session.role === 'guest' && session.code) return { page: 'join', code: session.code };
    return { page: 'home' };
  });
  const [code, setCode] = useState(cleanCode(params.get('code') || ''));

  useEffect(() => { writeJson(ME_KEY, me); }, [me]);
  // Signed in with Google (on the Hood Games hub or any game): start with the account's first name.
  // The box stays editable, and a name typed here wins next time.
  useEffect(() => {
    let live = true;
    currentUser().then((u) => {
      if (!live || !u) return;
      setUser(u);
      const saved = u.user_metadata?.card_design;
      setMe((m) => ({ ...m, name: m.name || firstName(u), design: m.design !== 'classic' || !saved ? m.design : saved }));
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    document.title = 'Card Table · Hood Games';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const home = () => setPage({ page: 'home' });
  const named = me.name.trim().length > 0;
  // Designs past Classic need the account; signed out, everyone plays Classic.
  const player = { ...me, uid: user ? user.id : null, design: user ? me.design : 'classic' };
  const pickDesign = (id) => {
    setMe((m) => ({ ...m, design: id }));
    if (user) supabase.auth.updateUser({ data: { card_design: id } }).catch(() => {});
  };

  if (page.page === 'host') return <HostTable me={player} gameId={page.gameId} resume={page.resume} look={look} onExit={home} />;
  if (page.page === 'join' && named) return <GuestTable me={player} code={page.code} look={look} onExit={home} />;
  if (page.page === 'saved') return <SavedGames onBack={home} onResume={(r) => setPage({ page: 'host', gameId: r.gameId, resume: r })} />;
  if (page.page === 'stats') return <Stats onBack={home} />;
  if (page.page === 'designs') return <Designs user={user} me={player} onPick={pickDesign} onBack={home} />;

  return (
    <div className="lcp lt-page lt-home">
      <a className="lcp-link lt-back" href={homeHref()}>← {homeLabel()}</a>
      <h1 className="lc-title lt-h1">Card Table</h1>
      <p className="lt-note">500 and Dirty Clubs, played on phones. No TV needed: one phone opens the table and everyone else joins with the code. Bots fill empty seats.</p>
      <label className="lt-name">Your name
        <input value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value.slice(0, 12) })} maxLength={12} placeholder="Name" autoComplete="nickname" />
      </label>
      <div className="lt-homebtns">
        {Object.values(GAMES).map((g) => (
          <button type="button" key={g.id} className="lt-gamebtn" disabled={!named} onClick={() => setPage({ page: 'host', gameId: g.id })}>
            <span>{g.emoji}</span>
            <b>Open a {g.title} table</b>
            <small>{g.seats} · {g.blurb}</small>
          </button>
        ))}
      </div>
      <form className="lt-join" onSubmit={(e) => { e.preventDefault(); if (code.length === 4 && named) setPage({ page: 'join', code }); }}>
        <input value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="CODE" maxLength={4} autoCapitalize="characters" className="lcp-code" />
        <button type="submit" className="lc-btn" disabled={code.length !== 4 || !named}>Join a table</button>
      </form>
      {page.page === 'join' && !named && <p className="lt-note">Type your name to join table {page.code}.</p>}
      {page.page === 'join' && !named && <button type="button" className="lc-btn" disabled={!named} onClick={() => setPage({ ...page })}>Join {page.code}</button>}
      <div className="lt-homebtns is-row">
        <button type="button" className="lc-btn lc-btn-ghost" onClick={() => setPage({ page: 'saved' })}>📂 Pick up a saved game</button>
        <button type="button" className="lc-btn lc-btn-ghost" onClick={() => setPage({ page: 'stats' })}>📊 Stats</button>
        <button type="button" className="lc-btn lc-btn-ghost" onClick={() => setPage({ page: 'designs' })}>🎴 Card designs</button>
      </div>
    </div>
  );
}
