import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Person from './Person';
import { parseLook, randomLook, lookCode } from './look';
import { MAX_PLAYERS, newRoomCode, openHost } from './net';
import { isMuted, setMuted, sfx, unlockSound } from './sound';
import { Backdrop, House } from './scene';
import { GAME_META, gameFor, isPlayable } from './games';
import './party.css';

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
  const [code, setCode] = useState(() => loadRoom()?.code || null);
  const [players, setPlayers] = useState(() => (loadRoom()?.players || []).map((p) => ({ ...p, joinedAt: 0, lastSeen: 0 })));
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
  const started = Boolean(code);
  const def = gameFor(gameId);

  playersRef.current = players;
  modeRef.current = mode;
  defRef.current = def;

  useEffect(() => { if (code) saveRoom(code, players, gameId); }, [code, players, gameId]);

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
      screen: modeRef.current, code, vip: list[0]?.cid === cid, count: list.length, max: MAX_PLAYERS, name: me.name,
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
    const list = playersRef.current.map((p) => ({ ...p, ready: false }));
    if (!list.length) return;
    playersRef.current = list;
    setPlayers(list);
    const now = performance.now();
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
        const next = list.map((p) => (p.cid === msg.cid ? { ...p, name: name || p.name, look: look || p.look, lastSeen: now } : p));
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
    const vip = list[0]?.cid === msg.cid;
    if (game) d.seen(game, msg.cid, now);
    if (event === 'start' && vip && modeRef.current === 'lobby') startGame();
    if (event === 'pick' && vip) pickGame(String(msg.game || ''));
    if (event === 'ready' && modeRef.current === 'lobby') {
      const next = list.map((p) => (p.cid === msg.cid ? { ...p, ready: Boolean(msg.ready) } : p));
      playersRef.current = next;
      setPlayers(next);
      if (next.every((p) => p.ready)) startGame();
    }
    if (event === 'skip' && vip && modeRef.current === 'howto') beginGame();
    if (event === 'again' && vip && game && d.over(game)) backToLobby();
    if (event === 'bye' && modeRef.current === 'lobby') {
      const next = list.filter((p) => p.cid !== msg.cid);
      playersRef.current = next;
      setPlayers(next);
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

  // The loop: step the game, redraw, keep phones up to date.
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    const loop = () => {
      const now = performance.now();
      const game = gameRef.current;
      if (modeRef.current === 'howto' && now - howToAt.current > defRef.current.howToMs) beginGameRef.current();
      if (game && modeRef.current === 'game') {
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

  const openRoom = () => {
    unlockSound();
    setPlayers([]);
    setCode(newRoomCode());
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
          <button type="button" className="lc-btn lc-btn-big" onClick={openRoom}>Open a room</button>
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

  return (
    <div className="lc-tv">
      <div className="lc-stage">
        {!game && (
          <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
            <Backdrop />
            <House candles={5} maxCandles={5} />
          </svg>
        )}
        {game && <Stage key={round} game={game} players={players} now={now} onLobby={backToLobby} onAgain={beginGame} />}
        <div className="lc-corner">
          <span>Join at <b>{joinUrl().replace(/^https?:\/\//, '')}</b></span>
          <span className="lc-corner-code">{code}</span>
          <button type="button" className="lc-mute" onClick={toggleMute} aria-label={mute ? 'Sound on' : 'Mute'}>{mute ? '🔇' : '🔊'}</button>
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
                return (
                  <div key={p.cid} className="lc-slot">
                    <Person look={p.look} pose={waving ? 'wave' : 'stand'} className={`lc-bob lc-d${i % 4}`} />
                    {p.ready && <div className="lc-ready">READY</div>}
                    <div className="lc-slot-name">{i === 0 ? '👑 ' : ''}{p.name}</div>
                    <button type="button" className="lc-kick" onClick={() => kick(p.cid)} aria-label={`Remove ${p.name}`}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="lc-lobby-foot">
              {players.length ? (
                <>
                  <span>{players.filter((p) => p.ready).length} of {players.length} ready. It starts when everyone taps Ready, or</span>
                  <button type="button" className="lc-btn" onClick={startGame}>Start {def.title}</button>
                </>
              ) : <span>Waiting for players… scan the code or go to the address above.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
