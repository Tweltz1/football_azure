import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Person from './Person';
import { parseLook, randomLook, lookCode } from './look';
import { MAX_PLAYERS, newRoomCode, openHost, postToPhone } from './net';
import { isMuted, setMuted, setMusicIntensity, sfx, startMusic, stopMusic, unlockSound } from './sound';
import { Backdrop, House } from './scene';
import { QuizBackdrop } from './games/QuizStage';
import { HallBackdrop } from './games/HallwayStage';

import { GAME_META, gameFor, isPlayable } from './games';
import './party.css';

// The lobby shows the picked game's world behind the picker.
const LobbyScene = ({ id, now }) => {
  if (id === 'quiz') return <QuizBackdrop lights={Math.floor(now / 700)} />;
  if (id === 'mash') return <QuizBackdrop lights={Math.floor(now / 700)} curtain={['#1f4a2e', '#2f6b3f', '#163a24']} />;
  if (id === 'hallway') return <HallBackdrop floor={1} />;
  if (id === 'mask') return <QuizBackdrop lights={Math.floor(now / 700)} curtain={['#3a1f5c', '#5b2d8e', '#2a1645']} />;
  return <><Backdrop /><House candles={5} maxCandles={5} /></>;
};

const SAVE_KEY = 'lc-host-room';
const loadRoom = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && Date.now() - saved.at < 6 * 3600 * 1000 && /^[A-Z]{4}$/.test(saved.code)) return saved;
  } catch (error) { /* fresh room */ }
  return null;
};
const saveRoom = (code, players, gameId) => {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ code, gameId, at: Date.now(), players: players.map(({ cid, name, look }) => ({ cid, name, look })) }));
  } catch (error) { /* not saved */ }
};

// Phones say hello every 5 seconds. A phone we haven't heard from in a while shows as away, and in the
// lobby it is dropped, so a closed tab or a dead phone can't hold up "everyone ready" or keep the crown.
const AWAY_MS = 12000;
const STALE_MS = 30000;
const isAway = (p, now) => now - (p.lastSeen || 0) > AWAY_MS;
const vipOf = (list, now) => (list.find((p) => !isAway(p, now)) || list[0])?.cid;
const allReady = (list, now) => {
  const here = list.filter((p) => !isAway(p, now));
  return here.length > 0 && here.every((p) => p.ready);
};

const joinUrl = () => `${window.location.origin}/play`;

const Qr = ({ text }) => {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="lc-qr" dangerouslySetInnerHTML={{ __html: svg }} />;
};

const startingGame = () => {
  const asked = new URLSearchParams(window.location.search).get('game');
  if (isPlayable(asked)) return asked;
  const saved = loadRoom()?.gameId;
  return isPlayable(saved) ? saved : 'candle';
};

export default function PartyHost() {
  // A refresh shows the splash again: open a new room (new code), or reopen the last one.
  const [savedRoom, setSavedRoom] = useState(loadRoom);
  const [code, setCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [mode, setMode] = useState('lobby');
  const [gameId, setGameId] = useState(startingGame);
  const [round, setRound] = useState(0); // remounts the game's stage for every new game
  const [connected, setConnected] = useState(false);
  const [, setFrame] = useState(0);
  const [mute, setMute] = useState(isMuted());
  const [splashLooks] = useState(() => [1, 3, 5, 2].map((costume) => ({ ...randomLook(), costume })));
  const gameRef = useRef(null);
  const hostRef = useRef(null);
  const playersRef = useRef(players);
  const modeRef = useRef(mode);
  const defRef = useRef(gameFor(gameId));
  const lastSent = useRef(new Map());
  const waves = useRef(new Map()); // cid -> until, for a wave in the lobby
  const howToAt = useRef(0);
  const scene = useRef({ key: null, at: -1e9, n: 0 });
  const started = Boolean(code);
  const def = gameFor(gameId);

  playersRef.current = players;
  modeRef.current = mode;
  defRef.current = def;

  useEffect(() => { if (code) saveRoom(code, players, gameId); }, [code, players, gameId]);

  // Background music: starts with "Open a room", or on the first click if the room was reopened.
  useEffect(() => {
    const first = () => { if (code) startMusic(); };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    return () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
    };
  }, [code]);
  useEffect(() => () => stopMusic(), []);

  // Fonts for the titles
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
  useEffect(() => { document.title = started ? def.title : 'Hood Games Night'; }, [started, def.title]);

  const screenFor = useCallback((cid) => {
    const list = playersRef.current;
    const me = list.find((p) => p.cid === cid);
    if (!me) return { screen: 'full', code };
    const game = gameRef.current;
    const d = defRef.current;
    const now = performance.now();
    const base = {
      screen: modeRef.current, code, vip: vipOf(list, now) === cid, count: list.length, max: MAX_PLAYERS, name: me.name,
      ready: Boolean(me.ready), readyCount: list.filter((p) => p.ready).length, gameId: d.id,
    };
    if (modeRef.current !== 'game' || !game) return base;
    const view = d.has(game, cid) ? d.phone(game, cid, now) : null;
    const result = d.over(game) && view ? d.result(game, cid) : null;
    return { ...base, game: view, result };
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

  const beginGame = useCallback(() => {
    const now = performance.now();
    // Phones that went quiet don't get a seat in the game. They rejoin if they come back.
    const all = playersRef.current;
    const here = all.filter((p) => !isAway(p, now));
    const list = (here.length ? here : all).map((p) => ({ ...p, ready: false }));
    if (!list.length) return;
    playersRef.current = list;
    setPlayers(list);
    gameRef.current = defRef.current.create(list.map((p) => ({ cid: p.cid, name: p.name })), Math.floor(Math.random() * 1e9), now);
    setRound((r) => r + 1);
    setModeNow('game');
    pushAll(true);
  }, [pushAll]);

  const showHowTo = useCallback(() => {
    if (!playersRef.current.length) return;
    howToAt.current = performance.now();
    setModeNow('howto');
    pushAll(true);
  }, [pushAll]);

  // From the lobby (everyone ready, or the host starts): the game's how-to-play intro first, which can be skipped.
  const startGame = useCallback(() => {
    if (playersRef.current.length < (defRef.current.minPlayers || 1)) return;
    const q = new URLSearchParams(window.location.search);
    if (q.has('night') || q.has('nohowto')) beginGame();
    else showHowTo();
  }, [beginGame, showHowTo]);

  const backToLobby = useCallback(() => {
    gameRef.current = null;
    playersRef.current = playersRef.current.map((p) => ({ ...p, ready: false }));
    setPlayers(playersRef.current);
    setModeNow('lobby');
    pushAll(true);
  }, [pushAll]);

  const pickGame = useCallback((id) => {
    if (!isPlayable(id) || modeRef.current !== 'lobby') return;
    defRef.current = gameFor(id);
    setGameId(id);
    playersRef.current = playersRef.current.map((p) => ({ ...p, ready: false }));
    setPlayers(playersRef.current);
    sfx.join();
    pushAll(true);
  }, [pushAll]);

  const onMessage = useCallback((event, msg) => {
    const now = performance.now();
    const list = playersRef.current;
    const known = list.find((p) => p.cid === msg.cid);
    const d = defRef.current;
    const game = gameRef.current;
    const name = String(msg.name || '').trim().slice(0, 12);
    const look = typeof msg.look === 'string' ? lookCode(parseLook(msg.look)) : null;
    if (event === 'hello' || event === 'look') {
      if (!known) {
        if (list.length >= MAX_PLAYERS || !name) {
          hostRef.current?.sendTo(msg.cid, { screen: 'full', code, count: list.length, max: MAX_PLAYERS });
          return;
        }
        const player = { cid: msg.cid, name, look: look || lookCode(randomLook()), joinedAt: now, lastSeen: now };
        const next = [...list, player];
        playersRef.current = next;
        setPlayers(next);
        waves.current.set(msg.cid, now + 2500);
        sfx.join();
        if (game && !d.over(game)) d.addPlayer(game, msg.cid, name, now);
      } else {
        const next = list.map((p) => (p.cid === msg.cid ? { ...p, name: name || p.name, look: look || p.look, lastSeen: now, left: false } : p));
        playersRef.current = next;
        setPlayers(next);
        if (event === 'look' && look !== known.look) waves.current.set(msg.cid, now + 1500);
      }
      if (game) d.seen(game, msg.cid, now);
      if (event === 'hello') lastSent.current.delete(msg.cid);
      pushAll();
      return;
    }
    if (!known) return;
    if (event !== 'bye') known.lastSeen = now;
    const vip = vipOf(list, now) === msg.cid;
    if (game) d.seen(game, msg.cid, now);
    if (event === 'start' && vip && modeRef.current === 'lobby') startGame();
    if (event === 'pick' && vip) pickGame(String(msg.game || ''));
    if (event === 'ready' && modeRef.current === 'lobby') {
      const next = list.map((p) => (p.cid === msg.cid ? { ...p, ready: Boolean(msg.ready) } : p));
      playersRef.current = next;
      setPlayers(next);
      if (allReady(next, now)) startGame();
    }
    if (event === 'skip' && vip && modeRef.current === 'howto') beginGame();
    if (event === 'again' && vip && game && d.over(game)) backToLobby();
    if (event === 'bye') {
      // In the lobby they're gone right away. Mid-game they show as away and drop off back in the lobby.
      const next = modeRef.current === 'lobby'
        ? list.filter((p) => p.cid !== msg.cid)
        : list.map((p) => (p.cid === msg.cid ? { ...p, lastSeen: -1e9, left: true } : p));
      playersRef.current = next;
      setPlayers(next);
      lastSent.current.delete(msg.cid);
    }
    if (event === 'act' && game && modeRef.current === 'game' && !d.over(game)) d.act(game, msg.cid, msg, now);
    pushAll();
  }, [backToLobby, beginGame, code, pickGame, pushAll, startGame]);

  // Open the room channel
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    if (!code) return undefined;
    const host = openHost(code, (event, msg) => onMessageRef.current(event, msg), (status) => setConnected(status === 'SUBSCRIBED'));
    hostRef.current = host;
    return () => { host.close(); hostRef.current = null; };
  }, [code]);

  const beginGameRef = useRef(beginGame);
  beginGameRef.current = beginGame;
  const startGameRef = useRef(startGame);
  startGameRef.current = startGame;

  // Lobby clean-up: drop phones that have gone quiet (closed tab, dead battery, walked off).
  useEffect(() => {
    if (!code) return undefined;
    const timer = window.setInterval(() => {
      if (modeRef.current !== 'lobby') return;
      const now = performance.now();
      const list = playersRef.current;
      const next = list.filter((p) => now - (p.lastSeen || 0) <= STALE_MS);
      if (next.length === list.length) return;
      list.filter((p) => !next.includes(p)).forEach((p) => lastSent.current.delete(p.cid));
      playersRef.current = next;
      setPlayers(next);
      if (allReady(next, now)) startGameRef.current();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [code]);

  // The loop: step the game, redraw, keep phones up to date.
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    const loop = () => {
      const now = performance.now();
      const game = gameRef.current;
      if (modeRef.current === 'howto' && now - howToAt.current > defRef.current.howToMs) beginGameRef.current();
      const playing = game && modeRef.current === 'game';
      let tension = 0;
      if (playing && defRef.current.intensity && !defRef.current.over(game)) {
        try { tension = defRef.current.intensity(game, now); } catch (error) { tension = 0; }
      }
      setMusicIntensity(tension);
      if (playing) {
        defRef.current.tick(game, now);
        if (now - lastPush > 150) {
          lastPush = now;
          pushAll();
        }
      }
      setFrame((f) => (f + 1) % 1e6);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [pushAll]);

  // Lobby: keep phones current (VIP, count, game) without a game loop push.
  useEffect(() => { if (mode === 'lobby') pushAll(); }, [players, mode, gameId, pushAll]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (modeRef.current === 'lobby' && playersRef.current.length) startGame();
      else if (modeRef.current === 'howto') beginGame();
      else if (gameRef.current && defRef.current.over(gameRef.current)) backToLobby();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToLobby, beginGame, startGame]);

  // Tell phones still pointed at an old room that it's closed, so they go back to the join screen.
  const closeRoomFor = (oldCode, list) => {
    (list || []).forEach((p) => postToPhone(oldCode, p.cid, { screen: 'closed', code: oldCode }));
  };

  const freshRoom = () => {
    let next = newRoomCode();
    while (next === code || next === savedRoom?.code) next = newRoomCode();
    gameRef.current = null;
    lastSent.current = new Map();
    waves.current = new Map();
    playersRef.current = [];
    setPlayers([]);
    setModeNow('lobby');
    setSavedRoom(null);
    setCode(next);
  };

  const openRoom = () => {
    unlockSound();
    startMusic();
    if (savedRoom) closeRoomFor(savedRoom.code, savedRoom.players);
    freshRoom();
  };

  const reopenRoom = () => {
    unlockSound();
    startMusic();
    const now = performance.now();
    // Give the old phones a few seconds to say hello again before they count as gone.
    const list = (savedRoom.players || []).map((p) => ({ ...p, joinedAt: 0, lastSeen: now, ready: false }));
    playersRef.current = list;
    setPlayers(list);
    setSavedRoom(null);
    setCode(savedRoom.code);
  };

  // From the lobby: a new code, and everyone on the old one is sent back to the join screen.
  const newRoom = () => {
    closeRoomFor(code, playersRef.current);
    freshRoom();
  };

  const kick = (cid) => {
    const next = playersRef.current.filter((p) => p.cid !== cid);
    playersRef.current = next;
    setPlayers(next);
    hostRef.current?.sendTo(cid, { screen: 'kicked', code });
  };

  const toggleMute = () => { setMuted(!mute); setMute(!mute); };

  if (!started) {
    return (
      <div className="lc-tv lc-splash">
        <div className="lc-splash-card">
          <h1 className="lc-title">Hood Games Night</h1>
          <p className="lc-sub">Halloween party games for 1 to 12 players.<br />Put this page on the TV. Everyone plays on their phone.</p>
          <button type="button" className="lc-btn lc-btn-big" onClick={openRoom}>Open a new room</button>
          {savedRoom && (
            <button type="button" className="lc-btn lc-splash-reopen" onClick={reopenRoom}>
              Reopen room {savedRoom.code}{savedRoom.players?.length ? ` (${savedRoom.players.length} player${savedRoom.players.length === 1 ? '' : 's'})` : ''}
            </button>
          )}
          <div className="lc-splash-crew">
            {splashLooks.map((look, i) => <Person key={i} look={look} pose="wave" className={`lc-bob lc-d${i}`} />)}
          </div>
        </div>
      </div>
    );
  }

  const now = performance.now();
  const game = mode === 'game' ? gameRef.current : null;
  const { Stage, HowTo } = def;
  // A bat-swarm wipe whenever the scene changes (lobby, intro, a new night or round, scores, the end).
  const sceneKey = game ? `${def.id}:${def.sceneKey ? def.sceneKey(game) : game.phase}` : mode;
  if (scene.current.key !== sceneKey) {
    if (scene.current.key) {
      scene.current.at = now;
      scene.current.n += 1;
      sfx.whoosh();
    }
    scene.current.key = sceneKey;
  }
  const wiping = now - scene.current.at < 1300;
  const vipCid = vipOf(players, now);

  return (
    <div className="lc-tv">
      <div className="lc-stage">
        {!game && (
          <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
            <g key={gameId} className="lc-fade-in"><LobbyScene id={gameId} now={now} /></g>
          </svg>
        )}
        {game && <Stage key={round} game={game} players={players} now={now} onLobby={backToLobby} onAgain={beginGame} />}
        {wiping && (
          <div className="lc-wipe" key={scene.current.n} aria-hidden="true">
            <div className="lc-wipe-band" />
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="lc-wipe-bat" style={{ top: `${6 + ((i * 37) % 88)}%`, animationDelay: `${(i % 5) * 0.06}s`, fontSize: `${2.4 + (i % 3)}em` }}>🦇</span>
            ))}
          </div>
        )}
        <div className="lc-corner">
          <span>Join at <b>{joinUrl().replace(/^https?:\/\//, '')}</b></span>
          <span className="lc-corner-code">{code}</span>
          <button type="button" className="lc-mute" onClick={toggleMute} aria-label={mute ? 'Sound on' : 'Mute'}>{mute ? '🔇' : '🔊'}</button>
          {mode === 'lobby' && <button type="button" className="lc-mute lc-newroom" onClick={newRoom}>New code</button>}
          {!connected && <span className="lc-warn">Connecting…</span>}
        </div>

        {mode === 'howto' && <HowTo players={players} now={now} startedAt={howToAt.current} onSkip={beginGame} />}

        {mode === 'lobby' && (
          <div className="lc-lobby">
            <div className="lc-lobby-top">
              <div className="lc-lobby-info">
                <div className="lc-picker" role="tablist" aria-label="Pick a game">
                  {GAME_META.map((g) => (
                    <button
                      type="button"
                      key={g.id}
                      role="tab"
                      aria-selected={g.id === gameId}
                      className={`lc-pick${g.id === gameId ? ' is-on' : ''}${g.soon ? ' is-soon' : ''}`}
                      disabled={g.soon}
                      onClick={() => pickGame(g.id)}
                    >
                      <span className="lc-pick-emoji">{g.emoji}</span>
                      <b>{g.title}</b>
                      <small>{g.soon ? 'Coming soon' : `${g.tag} · ${g.minutes}`}</small>
                    </button>
                  ))}
                </div>
                <h1 className="lc-title">{def.title}</h1>
                <p className="lc-sub">{def.blurb}</p>
                <ol className="lc-how">{def.how.map((line) => <li key={line}>{line}</li>)}</ol>
              </div>
              <div className="lc-join">
                <Qr text={`${joinUrl()}?code=${code}`} />
                <div>
                  <div className="lc-join-url">{joinUrl().replace(/^https?:\/\//, '')}</div>
                  <div className="lc-join-label">Room code</div>
                  <div className="lc-join-code">{code}</div>
                </div>
              </div>
            </div>
            <div className="lc-lineup">
              {Array.from({ length: MAX_PLAYERS }, (_, i) => {
                const p = players[i];
                if (!p) return <div key={`empty${i}`} className="lc-slot is-empty"><span>?</span></div>;
                const waving = (waves.current.get(p.cid) || 0) > now;
                const away = isAway(p, now);
                return (
                  <div key={p.cid} className={`lc-slot${away ? ' is-away' : ''}`}>
                    <Person look={p.look} pose={waving ? 'wave' : 'stand'} className={`lc-bob lc-d${i % 4}`} />
                    {away ? <div className="lc-ready lc-away">AWAY</div> : p.ready && <div className="lc-ready">READY</div>}
                    <div className="lc-slot-name">{p.cid === vipCid ? '👑 ' : ''}{p.name}</div>
                    <button type="button" className="lc-kick" onClick={() => kick(p.cid)} aria-label={`Remove ${p.name}`}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="lc-lobby-foot">
              {players.length && players.length < (def.minPlayers || 1) ? (
                <span>{def.title} needs at least {def.minPlayers} players. {def.minPlayers - players.length} more to go!</span>
              ) : players.length ? (
                <>
                  <span>{players.filter((p) => p.ready && !isAway(p, now)).length} of {players.filter((p) => !isAway(p, now)).length || players.length} ready. It starts when everyone taps Ready, or</span>
                  <button type="button" className="lc-btn" onClick={startGame}>▶ Start {def.title.length > 18 ? 'game' : def.title}</button>
                </>
              ) : <span>Waiting for players… scan the code or go to the address above.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
