import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Person from '../party/Person';
import { lookCode, parseLook, randomLook } from '../party/look';
import { newRoomCode, openHost, postToPhone } from '../party/net';
import { isMuted, setMuted, sfx, unlockSound } from '../party/sound';
import Board from './Board';
import { useVoice } from './voice';
import {
  act, addPlayer, aiContext, buy, createGame, current, dmAct, dmView, drinkPotion, endTurn, interact, move, movesFor, newSeed, pcFor, search, sell, sneak, social, talk, applyItem, wear,
  hear, playerView, removePlayer, request, rollCheck, tick, watchView,
} from './engine';
import { CLASSES, describe, newCharacter, normalizeCharacter, RACES } from './rules';
import { SETTINGS, settingFor } from './settings';
import { localNarration } from './story';
import { MAX_HEROES, PREFIX } from './constants';
import '../party/party.css';
import './dnd.css';

const SAVE_KEY = 'dq-host-table';
const LIVE_KEY = 'dq-host-live'; // in this tab only: the table it was running, to pick up again if the browser reloads it
const AWAY_MS = 15000;
const DM_GRACE_MS = 20000; // how long the TV waits for the DM's narration before using its own
const SOLO_NARRATE_MS = 2500;

const joinUrl = () => `${window.location.origin}/dnd/play`;
const watchUrl = (code) => `${window.location.origin}/dnd/watch?code=${code}`;
const TV_VOICE_KEY = 'dq-tv-voice';
const readTvVoice = () => {
  try { return window.localStorage.getItem(TV_VOICE_KEY) !== 'off'; } catch (error) { return true; }
};

const Qr = ({ text }) => {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="lc-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
};

const loadTable = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && Date.now() - saved.at < 12 * 3600 * 1000 && /^[A-Z]{4}$/.test(saved.code)) return saved;
  } catch (error) { /* fresh */ }
  return null;
};
const saveTable = (value) => {
  try { window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...value, at: Date.now() })); } catch (error) { /* full or private */ }
};

const isAway = (p, now) => now - (p.lastSeen || 0) > AWAY_MS;
const heroes = (list) => list.filter((p) => p.role === 'player');
const dms = (list, now) => list.filter((p) => p.role === 'dm' && !isAway(p, now));

/** Types a narration out a few letters at a time. */
const Typewriter = ({ text, startedAt, now }) => {
  const shown = Math.min(text.length, Math.floor((now - startedAt) / 22));
  return <p className="dq-narration-text">{text.slice(0, shown)}<span className="dq-caret">{shown < text.length ? '▌' : ''}</span></p>;
};

const RollPop = ({ r, now }) => {
  const age = now - r.at;
  if (age > 3800) return null;
  return (
    <div className={`dq-roll${r.ok ? ' is-ok' : ' is-miss'}${r.crit ? ' is-crit' : ''}${r.foe ? ' is-foe' : ''}`} style={{ opacity: age > 3200 ? (3800 - age) / 600 : 1 }}>
      <b>{r.who}</b>
      <span>{r.label}</span>
      {r.d20 != null && <i className="dq-d20">{r.d20}</i>}
      {r.d20 != null && <em>= {r.total}</em>}
      {r.dmg != null && r.dmg !== false && r.ok && <strong>{r.heal ? '+' : '−'}{r.dmg} HP</strong>}
      {r.heal && <strong>+{r.total} HP</strong>}
      {r.loot && <strong>+{r.total} gold</strong>}
    </div>
  );
};

/** The TV page: hosts the table, draws the board, and keeps every phone up to date. */
export default function DndHost() {
  const [saved, setSaved] = useState(loadTable);
  const [code, setCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [mode, setMode] = useState('lobby');
  const [connected, setConnected] = useState(false);
  const [tvVoice, setTvVoice] = useState(readTvVoice);
  const tvVoiceRef = useRef(tvVoice);
  tvVoiceRef.current = tvVoice;
  const lobbyTalk = useRef([]); // speech before the adventure starts, added to its transcript
  const caption = useRef(null); // the last thing someone said, shown on the TV for a few seconds
  const [netStatus, setNetStatus] = useState('');
  const [netTry, setNetTry] = useState(0);
  const [, setFrame] = useState(0);
  const [mute, setMute] = useState(isMuted());
  const [splash] = useState(() => [0, 1, 2, 3].map((i) => ({ ...randomLook(), costume: 0, hat: [15, 8, 6, 23][i] })));
  const gameRef = useRef(null);
  const hostRef = useRef(null);
  const playersRef = useRef(players);
  const modeRef = useRef(mode);
  const lastSent = useRef(new Map());
  const narrated = useRef({ cue: 0, at: 0, n: 0 });
  const narrationShownAt = useRef({ id: null, at: 0 });
  const campaignRef = useRef(null);

  playersRef.current = players;
  modeRef.current = mode;

  useEffect(() => {
    document.title = 'Hood Quest';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);


  const screenFor = useCallback((cid) => {
    const list = playersRef.current;
    const me = list.find((p) => p.cid === cid);
    if (!me) return { screen: 'full', code };
    const game = gameRef.current;
    const base = {
      screen: modeRef.current,
      code,
      role: me.role,
      count: heroes(list).length,
      max: MAX_HEROES,
      dmName: list.find((p) => p.role === 'dm')?.name || null,
      heroes: heroes(list).map((p) => ({ cid: p.cid, name: p.name, look: p.look, sheet: p.sheet ? { name: p.sheet.name, classId: p.sheet.classId, raceId: p.sheet.raceId, level: p.sheet.level } : null })),
      campaign: campaignRef.current ? { id: campaignRef.current.id, name: campaignRef.current.name } : null,
      // Voice chat: who is in it (the TV joins as a listener), and who has speech-to-text on.
      voice: [
        ...list.filter((p) => p.voice).map((p) => ({ cid: p.cid, name: p.name, muted: Boolean(p.muted) })),
        ...(tvVoiceRef.current && list.some((p) => p.voice) ? [{ cid: 'tv', name: 'TV speakers', muted: true }] : []),
      ],
      transcribing: list.filter((p) => p.transcribing).map((p) => p.name),
    };
    if (modeRef.current !== 'game' || !game) return base;
    if (me.role === 'dm') return { ...base, dm: dmView(game) };
    if (me.role === 'watch') return { ...base, watch: watchView(game) };
    return { ...base, game: playerView(game, cid) };
  }, [code]);

  const pushAll = useCallback((force = false) => {
    const host = hostRef.current;
    if (!host) return;
    playersRef.current.forEach((p) => {
      const screen = screenFor(p.cid);
      const json = JSON.stringify(screen);
      const prev = lastSent.current.get(p.cid);
      if (force || !prev || prev.json !== json || performance.now() - prev.at > 6000) {
        lastSent.current.set(p.cid, { json, at: performance.now() });
        host.sendTo(p.cid, screen);
      }
    });
  }, [screenFor]);

  const setModeNow = (next) => {
    setMode(next);
    modeRef.current = next;
  };

  const beginAdventure = useCallback(() => {
    const list = heroes(playersRef.current);
    if (!list.length) return;
    const now = performance.now();
    gameRef.current = createGame({
      seed: newSeed(),
      players: list.map((p) => ({ cid: p.cid, sheet: { ...(p.sheet || newCharacter({ name: p.name })), look: p.look } })),
      campaign: campaignRef.current,
      now,
    });
    gameRef.current.transcript = lobbyTalk.current.splice(0);
    gameRef.current.tokens.forEach((t) => { if (t.side === 'party') t.look = list.find((p) => p.cid === t.cid)?.look || t.look; });
    narrated.current = { cue: 0, at: now, n: 0 };
    setModeNow('game');
    sfx.whoosh?.();
    pushAll(true);
  }, [pushAll]);

  const onMessage = useCallback((event, msg) => {
    const now = performance.now();
    const list = playersRef.current;
    const known = list.find((p) => p.cid === msg.cid);
    const game = gameRef.current;
    if (event === 'hello') {
      const name = String(msg.name || '').trim().slice(0, 16);
      const role = ['dm', 'watch'].includes(msg.role) ? msg.role : 'player';
      const look = typeof msg.look === 'string' ? lookCode(parseLook(msg.look)) : null;
      const sheet = msg.sheet && typeof msg.sheet === 'object' ? normalizeCharacter(msg.sheet) : null;
      if (sheet && msg.sheet.id) sheet.id = String(msg.sheet.id).slice(0, 64);
      if (!known) {
        if (!name || (role === 'player' && heroes(list).length >= MAX_HEROES)) {
          hostRef.current?.sendTo(msg.cid, { screen: 'full', code, max: MAX_HEROES });
          return;
        }
        const player = {
          cid: msg.cid, name, role, look: look || lookCode(randomLook()), sheet, userId: msg.userId || null, lastSeen: now,
          voice: Boolean(msg.voice), muted: Boolean(msg.muted), transcribing: Boolean(msg.transcribing),
        };
        const next = [...list, player];
        playersRef.current = next;
        setPlayers(next);
        sfx.join?.();
        if (game && role === 'player') {
          const t = addPlayer(game, msg.cid, { ...(sheet || newCharacter({ name })), look: player.look }, now);
          t.look = player.look;
        }
      } else {
        const next = list.map((p) => (p.cid === msg.cid ? {
          ...p, name: name || p.name, role, look: look || p.look, sheet: sheet || p.sheet, userId: msg.userId || p.userId, lastSeen: now,
          voice: Boolean(msg.voice), muted: Boolean(msg.muted), transcribing: Boolean(msg.transcribing),
        } : p));
        playersRef.current = next;
        setPlayers(next);
        if (game && role === 'player') {
          const t = pcFor(game, msg.cid);
          if (!t) addPlayer(game, msg.cid, { ...(sheet || newCharacter({ name })), look: look || known.look }, now);
          else {
            t.gone = false;
            if (sheet?.id && !t.characterId) t.characterId = sheet.id;
          }
        }
      }
      lastSent.current.delete(msg.cid);
      pushAll();
      return;
    }
    if (!known) return;
    known.lastSeen = now;
    if (event === 'bye') {
      const next = list.filter((p) => p.cid !== msg.cid);
      playersRef.current = next;
      setPlayers(next);
      if (game) removePlayer(game, msg.cid, now);
      pushAll();
      return;
    }
    if (event !== 'act') return;
    if (msg.type === 'voice' || msg.type === 'transcribe') {
      const next = list.map((p) => (p.cid !== msg.cid ? p : msg.type === 'voice'
        ? { ...p, voice: Boolean(msg.on), muted: Boolean(msg.muted) }
        : { ...p, transcribing: Boolean(msg.on) }));
      playersRef.current = next;
      setPlayers(next);
      pushAll();
      return;
    }
    if (msg.type === 'speech') {
      const who = known.role === 'dm' ? `${known.name} (DM)` : (game && pcFor(game, msg.cid)?.name) || known.sheet?.name || known.name;
      const text = String(msg.text || '').slice(0, 300);
      if (game) hear(game, who, text, now);
      else {
        lobbyTalk.current.push({ who, text, at: now });
        if (lobbyTalk.current.length > 100) lobbyTalk.current.shift();
      }
      caption.current = { who, text, at: now };
      return;
    }
    let error = null;
    if (known.role === 'dm') {
      if (msg.type === 'begin' && modeRef.current === 'lobby') beginAdventure();
      else if (msg.type === 'campaign') {
        campaignRef.current = msg.campaign && msg.campaign.id ? {
          id: String(msg.campaign.id), name: String(msg.campaign.name || 'Campaign').slice(0, 60), notes: String(msg.campaign.notes || '').slice(0, 2000),
          summaries: Array.isArray(msg.campaign.summaries) ? msg.campaign.summaries.slice(-5).map((s) => String(s).slice(0, 600)) : [],
          pastQuests: Array.isArray(msg.campaign.pastQuests) ? msg.campaign.pastQuests.slice(-30).map(String) : [],
        } : null;
        if (game) dmAct(game, { type: 'campaign', campaign: campaignRef.current }, now);
      } else if (msg.type === 'newQuest' && game) {
        // Same heroes (with their XP and loot), a brand new quest.
        const sheets = game.tokens.filter((t) => t.side === 'party' && !t.gone).map((t) => ({ cid: t.cid, sheet: { ...t.sheet, hp: t.maxHp, id: t.characterId, look: t.look } }));
        gameRef.current = createGame({ seed: newSeed(), players: sheets, campaign: campaignRef.current, now });
        gameRef.current.tokens.forEach((t) => { if (t.side === 'party') t.look = sheets.find((s) => s.cid === t.cid)?.sheet.look; });
      } else if (msg.type === 'lobby') {
        gameRef.current = null;
        setModeNow('lobby');
      } else if (game && msg.dm) {
        error = dmAct(game, msg.dm, now);
        if (msg.dm.type === 'narrate') narrated.current.cue = game.cue?.id || 0;
      }
    } else if (game) {
      const t = pcFor(game, msg.cid);
      switch (msg.type) {
        case 'move': error = move(game, t, { x: Math.trunc(msg.x), y: Math.trunc(msg.y) }, now); break;
        case 'action': error = act(game, t, { action: String(msg.action || ''), target: msg.target ? String(msg.target) : null }, now); break;
        case 'end': error = endTurn(game, t, now); break;
        case 'interact': error = interact(game, t, now); break;
        case 'talk': error = talk(game, t, now); break;
        case 'potion': error = drinkPotion(game, t, now); break;
        case 'social': error = social(game, t, String(msg.kind || ''), now); break;
        case 'search': error = search(game, t, now); break;
        case 'sneak': error = sneak(game, t, now); break;
        case 'item': error = applyItem(game, t, String(msg.item || ''), msg.target ? String(msg.target) : null, now); break;
        case 'buy': error = buy(game, t, String(msg.item || ''), now); break;
        case 'sell': error = sell(game, t, String(msg.item || ''), now); break;
        case 'wear': error = wear(game, t, String(msg.slot || ''), msg.id ? String(msg.id) : null, now); break;
        case 'say': error = request(game, t, msg.text, now); break;
        case 'check': error = rollCheck(game, t, now); break;
        case 'characterId':
          if (t && msg.id) t.characterId = String(msg.id).slice(0, 64);
          break;
        default: break;
      }
    } else if (msg.type === 'sheet' && msg.sheet) {
      const sheet = normalizeCharacter(msg.sheet);
      if (msg.sheet.id) sheet.id = String(msg.sheet.id).slice(0, 64);
      const next = list.map((p) => (p.cid === msg.cid ? { ...p, sheet } : p));
      playersRef.current = next;
      setPlayers(next);
    }
    if (error) hostRef.current?.sendTo(msg.cid, { ...screenFor(msg.cid), toast: error, toastAt: Date.now() });
    pushAll();
  }, [beginAdventure, code, pushAll, screenFor]);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    if (!code) return undefined;
    let retry = 0;
    const host = openHost(code, (event, msg) => onMessageRef.current(event, msg), (status, err) => {
      setConnected(status === 'SUBSCRIBED');
      setNetStatus(err ? `${status}: ${err.message || err}` : status);
      // A dropped or refused channel never comes back by itself: open it again in a few seconds.
      if (status !== 'SUBSCRIBED' && !retry) retry = window.setTimeout(() => setNetTry((n) => n + 1), 4000);
    }, PREFIX);
    hostRef.current = host;
    return () => { window.clearTimeout(retry); host.close(); hostRef.current = null; };
  }, [code, netTry]);

  // The TV listens in on voice chat, so the room hears remote players.
  const inVoice = players.filter((p) => p.voice).map((p) => p.cid);
  const tv = useVoice({ code, cid: 'tv', prefix: PREFIX, peers: inVoice, active: Boolean(code) && tvVoice && inVoice.length > 0, mic: false });
  const toggleTvVoice = () => {
    const next = !tvVoice;
    setTvVoice(next);
    tvVoiceRef.current = next;
    try { window.localStorage.setItem(TV_VOICE_KEY, next ? 'on' : 'off'); } catch (error) { /* private mode */ }
    pushAll(true);
  };



  // The loop: monsters' turns, narration fallback, redraw, phones.
  // A hidden tab gets no animation frames, so a slower timer keeps the game and the phones going
  // while the host looks at another tab (browsers still run it about once a second).
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    let lastStep = 0;
    const step = (draw) => {
      const now = performance.now();
      lastStep = now;
      const game = gameRef.current;
      if (game && modeRef.current === 'game') {
        tick(game, now);
        // Nobody is narrating? The TV narrates for itself.
        const c = game.cue;
        if (c && c.id !== narrated.current.cue) {
          const wait = dms(playersRef.current, now).length ? DM_GRACE_MS : SOLO_NARRATE_MS;
          if (now - c.at > wait) {
            narrated.current.cue = c.id;
            narrated.current.n += 1;
            dmAct(game, { type: 'narrate', text: localNarration(c, aiContext(game), narrated.current.n), by: 'auto' }, now);
          }
        }
        if (now - lastPush > 200) {
          lastPush = now;
          pushAll();
        }
      }
      if (draw) setFrame((f) => (f + 1) % 1e6);
    };
    const loop = () => {
      step(true);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    const backup = window.setInterval(() => { if (performance.now() - lastStep > 700) step(false); }, 1000);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(backup);
    };
  }, [pushAll]);

  // Coming back to this tab (or the phone waking up): reconnect at once and bring every phone up to
  // date. Leaving it: save the table first, in case the browser closes the tab to save memory.
  const saveNow = useCallback(() => {
    if (!code) return;
    saveTable({ code, players: playersRef.current.map(({ cid, name, role, look, sheet }) => ({ cid, name, role, look, sheet })), game: gameRef.current, campaign: campaignRef.current });
    try { window.sessionStorage.setItem(LIVE_KEY, code); } catch (error) { /* private mode */ }
  }, [code]);
  useEffect(() => {
    if (!code) return undefined;
    let hiddenAt = 0;
    const onShow = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        saveNow();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 3000) setNetTry((n) => n + 1);
      hiddenAt = 0;
      window.setTimeout(() => pushAll(true), 600);
    };
    const onHide = () => saveNow();
    // Save the table now and then too, so a refresh can pick up where it left off.
    const timer = window.setInterval(saveNow, 5000);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('online', onShow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('online', onShow);
    };
  }, [code, pushAll, saveNow]);

  useEffect(() => { if (mode === 'lobby') pushAll(); }, [players, mode, pushAll]);

  const closeRoomFor = (oldCode, list) => (list || []).forEach((p) => postToPhone(oldCode, p.cid, { screen: 'closed', code: oldCode }, PREFIX));

  const openTable = () => {
    unlockSound();
    if (saved) closeRoomFor(saved.code, saved.players);
    let next = newRoomCode();
    while (next === saved?.code) next = newRoomCode();
    gameRef.current = null;
    campaignRef.current = null;
    playersRef.current = [];
    setPlayers([]);
    setModeNow('lobby');
    setSaved(null);
    setCode(next);
  };

  const reopenTable = () => {
    unlockSound();
    const now = performance.now();
    const list = (saved.players || []).map((p) => ({ ...p, lastSeen: now }));
    playersRef.current = list;
    setPlayers(list);
    campaignRef.current = saved.campaign || null;
    if (saved.game && saved.game.map) {
      // performance.now() restarts with the page, so move the saved clock to now.
      const g = saved.game;
      const shift = now - (g.clock || 0);
      g.clock = now;
      g.started = (g.started || 0) + shift;
      g.nextFoeAt = now + 1500;
      g.walking = [];
      g.log.forEach((l) => { l.at += shift; });
      g.rolls = [];
      if (g.cue) g.cue.at += shift;
      if (g.narration) g.narration.at += shift;
      gameRef.current = g;
      narrated.current = { cue: g.cue?.id || 0, at: now, n: 0 };
      setModeNow('game');
    }
    setSaved(null);
    setCode(saved.code);
  };

  // The browser reloaded this tab (Safari does this to tabs left in the background): carry on with
  // the same table and code, so nobody's phone gets thrown out.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !saved) return;
    resumed.current = true;
    let live = null;
    try { live = window.sessionStorage.getItem(LIVE_KEY); } catch (error) { /* private mode */ }
    if (live === saved.code) reopenTable();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const kick = (cid) => {
    const next = playersRef.current.filter((p) => p.cid !== cid);
    playersRef.current = next;
    setPlayers(next);
    if (gameRef.current) removePlayer(gameRef.current, cid, performance.now());
    hostRef.current?.sendTo(cid, { screen: 'kicked', code });
  };

  if (!code) {
    return (
      <div className="dq-tv dq-splash">
        <div className="dq-splash-card">
          <p className="dq-kicker">Hood League</p>
          <h1 className="dq-title">Hood Quest</h1>
          <p className="dq-sub">Tabletop adventures for one TV and up to {MAX_HEROES} phones.<br />An AI narrator runs the story. A human co-DM keeps it on track.</p>
          <button type="button" className="lc-btn lc-btn-big" onClick={openTable}>Open a new table</button>
          {saved && (
            <button type="button" className="lc-btn lc-btn-ghost dq-reopen" onClick={reopenTable}>
              Reopen table {saved.code}{saved.game ? ' (adventure in progress)' : ''}
            </button>
          )}
          <div className="dq-splash-crew">{splash.map((look, i) => <Person key={i} look={look} pose={i === 1 ? 'wave' : 'stand'} className={`lc-bob lc-d${i}`} />)}</div>
        </div>
      </div>
    );
  }

  const now = performance.now();
  const game = mode === 'game' ? gameRef.current : null;
  const dmList = players.filter((p) => p.role === 'dm');
  const heroList = players.filter((p) => p.role === 'player');
  const watchers = players.filter((p) => p.role === 'watch' && !isAway(p, now)).length;

  const voicePeers = players.filter((p) => p.voice && !isAway(p, now)).map((p) => p.cid);
  const talkers = players.filter((p) => p.transcribing).map((p) => p.name);
  const recent = caption.current && now - caption.current.at < 7000 ? caption.current : null;
  const voiceBar = (
    <div className="dq-voicebar">
      {voicePeers.length > 0 && (
        <button type="button" className="lc-mute" onClick={toggleTvVoice} title="Play remote players' voices on the TV">
          {tvVoice ? '🔊' : '🔇'} {voicePeers.length} on voice{tvVoice ? '' : ' (muted on TV)'}
        </button>
      )}
      {tv.needsTap && <button type="button" className="lc-btn" onClick={tv.resume}>Tap to hear voices</button>}
      {talkers.length > 0 && <span className="dq-rec">🎙 Transcribing: {talkers.join(', ')}</span>}
      {watchers > 0 && <span className="dq-rec">👀 {watchers} watching remotely</span>}
    </div>
  );
  const captionEl = recent && <div className="dq-caption"><b>{recent.who}:</b> {recent.text}</div>;

  const corner = (
    <div className="dq-corner">
      <span>Join at <b>{joinUrl().replace(/^https?:\/\//, '')}</b></span>
      <span className="dq-corner-code">{code}</span>
      <button type="button" className="lc-mute" onClick={() => { setMuted(!mute); setMute(!mute); }} aria-label={mute ? 'Sound on' : 'Mute'}>{mute ? '🔇' : '🔊'}</button>
      {!connected && <span className="lc-warn">Connecting…</span>}
    </div>
  );

  if (!game) {
    return (
      <div className="dq-tv dq-lobby">
        <div className="dq-lobby-top">
          <div>
            <p className="dq-kicker">{campaignRef.current ? `Campaign: ${campaignRef.current.name}` : 'One-shot adventure'}</p>
            <h1 className="dq-title">Hood Quest</h1>
            <p className="dq-sub">Scan the code to join. Pick a hero, or load one saved to your Google account.<br />One person joins as the DM to steer the AI narrator.</p>
            <div className="dq-settings-strip">
              {Object.values(SETTINGS).map((s) => <span key={s.id} className="dq-chip">{s.emoji} {s.name}</span>)}
            </div>
          </div>
          <div className="lc-join">
            <Qr text={`${joinUrl()}?code=${code}`} />
            <div>
              <div className="lc-join-url">{joinUrl().replace(/^https?:\/\//, '')}</div>
              <div className="lc-join-label">Table code</div>
              <div className="lc-join-code">{code}</div>
              <p className="dq-remote">Playing remotely? Join voice on your phone and watch the board at <b>{watchUrl(code).replace(/^https?:\/\//, '')}</b></p>
              {voiceBar}
              {!connected && <div className="lc-warn">Connecting…{netStatus ? ` (${netStatus.replace(/_/g, ' ')})` : ''}</div>}
            </div>
          </div>
        </div>
        <div className="dq-dm-line">
          {dmList.length ? <>🎲 Dungeon Master: <b>{dmList.map((d) => d.name).join(' & ')}</b> with the AI narrator</> : <>🎲 No DM yet: the AI narrator will run the table on its own. Join as DM on a phone to co-host.</>}
        </div>
        <div className="dq-lineup">
          {Array.from({ length: MAX_HEROES }, (_, i) => {
            const p = heroList[i];
            if (!p) return <div key={`e${i}`} className="dq-slot is-empty"><span>?</span></div>;
            const sheet = p.sheet;
            return (
              <div key={p.cid} className={`dq-slot${isAway(p, now) ? ' is-away' : ''}`}>
                <Person look={p.look} pose="stand" className={`lc-bob lc-d${i % 4}`} />
                <div className="dq-slot-name">{sheet?.name || p.name}</div>
                <div className="dq-slot-class">{sheet ? `${RACES[sheet.raceId]?.name} ${CLASSES[sheet.classId]?.name} ${sheet.level}` : 'Choosing a hero…'}</div>
                <button type="button" className="lc-kick" onClick={() => kick(p.cid)} aria-label={`Remove ${p.name}`}>×</button>
              </div>
            );
          })}
        </div>
        <div className="dq-lobby-foot">
          {heroList.length ? (
            <>
              <span>{heroList.length} hero{heroList.length === 1 ? '' : 'es'} ready. The DM starts the adventure from their phone, or</span>
              <button type="button" className="lc-btn" onClick={beginAdventure}>⚔️ Begin the adventure</button>
            </>
          ) : <span>Waiting for heroes…</span>}
        </div>
      </div>
    );
  }

  const setting = settingFor(game.map.setting);
  const turn = current(game);
  const turnReach = turn && turn.side === 'party' ? [...movesFor(game, turn).reach.values()].filter((n) => n.end).map((n) => [n.x, n.y]) : null;
  if (game.narration && narrationShownAt.current.id !== game.narration.id) narrationShownAt.current = { id: game.narration.id, at: now };
  const heroesOnMap = game.tokens.filter((t) => t.side === 'party' && !t.gone);

  return (
    <div className="dq-tv dq-game" style={{ background: `radial-gradient(circle at 50% 40%, ${setting.palette.bg[1]}, ${setting.palette.bg[0]})` }}>
      <Board game={game} now={now} reach={turnReach} />
      <div className="dq-hud-top">
        <div className="dq-quest">
          <span className="dq-quest-scene">{setting.emoji} {setting.name} · Scene {game.sceneIndex + 1} of {game.sceneSettings.length}</span>
          <b>{game.quest.title}</b>
          {game.campaign && <small>{game.campaign.name}</small>}
          {voiceBar}
        </div>
        {corner}
      </div>
      <div className="dq-voice-game">
        {captionEl}
      </div>
      <div className="dq-side">
        {game.combat ? (
          <div className="dq-initiative">
            <h3>Round {game.combat.round}</h3>
            {game.combat.order.map((id) => {
              const t = game.tokens.find((x) => x.id === id);
              if (!t) return null;
              return (
                <div key={id} className={`dq-init${id === turn?.id ? ' is-now' : ''}${t.side === 'foe' ? ' is-foe' : ''}${t.hp <= 0 ? ' is-down' : ''}`}>
                  <span className="dq-init-n">{game.combat.inits?.[id] ?? ''}</span>
                  <span>{t.side === 'foe' ? t.glyph : '🛡️'} {t.name}</span>
                  <span className="dq-init-hp">{t.hp}/{t.maxHp}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="dq-party">
            <h3>The party</h3>
            {heroesOnMap.map((t) => (
              <div key={t.id} className={`dq-hero${t.hp <= 0 ? ' is-down' : ''}`}>
                <Person look={t.look} view="head" className="dq-hero-head" />
                <div>
                  <b>{t.name}</b>
                  <small>{describe(t.sheet)} · AC {t.ac}</small>
                  <div className="dq-hpbar"><i style={{ width: `${Math.max(0, (t.hp / t.maxHp) * 100)}%` }} /></div>
                </div>
                <span className="dq-hero-hp">{t.hp}</span>
              </div>
            ))}
          </div>
        )}
        {game.check && !game.check.done && (
          <div className="dq-checkbox">
            <b>🎲 {game.check.skill} check</b>
            <small>{Object.keys(game.check.results).length} rolled · check your phone</small>
          </div>
        )}
      </div>
      {turn && (
        <div className={`dq-turn${turn.side === 'foe' ? ' is-foe' : ''}`}>
          {turn.side === 'foe' ? `${turn.name} is moving…` : `${turn.name}'s turn${turn.hp <= 0 ? ' (down!)' : ''}`}
        </div>
      )}
      <div className="dq-rolls">{game.rolls.slice(-4).map((r) => <RollPop key={r.id} r={r} now={now} />)}</div>
      {game.narration && now - narrationShownAt.current.at < 45000 && (
        <div className={`dq-narration is-${game.narration.by}`}>
          <span className="dq-narration-by">{game.narration.by === 'dm' ? '🎲 The DM' : game.narration.by === 'ai' ? '✨ The Narrator' : '📜 The Narrator'}</span>
          <Typewriter text={game.narration.text} startedAt={narrationShownAt.current.at} now={now} />
        </div>
      )}
      {game.complete && (
        <div className="dq-complete">
          <h2 className="dq-title">Quest complete!</h2>
          <p>{game.quest.title} · {game.xpTotal} XP each · Reward: {game.quest.reward}</p>
        </div>
      )}
    </div>
  );
}
