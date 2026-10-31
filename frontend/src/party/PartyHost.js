import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import Person from './Person';
import { personMarkup } from './cartoon';
import { monsterMarkup } from './monsters';
import { parseLook, randomLook, lookCode } from './look';
import {
  addPlayer, awards, CHARM, createGame, NIGHTS, skipToNight, phoneView, play, seen, soul, SOUL_WINDOW_MS, SPOOK_MS, tick,
} from './lastCandle';
import { MAX_PLAYERS, newRoomCode, openHost } from './net';
import { isMuted, setMuted, sfx, unlockSound } from './sound';
import './party.css';

const SAVE_KEY = 'lc-host-room';
const LANE_Y = [470, 610, 750, 890];
const PATH_LEFT = 150;
const PATH_RIGHT = 1180;
const THROW_MS = 450;

const laneY = (lane) => (Number.isInteger(lane) ? LANE_Y[lane] : (LANE_Y[Math.floor(lane)] + LANE_Y[Math.ceil(lane)]) / 2 + 40);
const monsterX = (x) => PATH_LEFT + Math.min(1, x) * (PATH_RIGHT - PATH_LEFT);
const monsterScale = (m) => (m.boss ? 1.75 : 0.85);
// Where each player stands: at the end of a path, up to 3 per path, in front of the house.
const spot = (index) => {
  const row = index % 4;
  const col = Math.floor(index / 4);
  return { x: 1250 + col * 92 + (row % 2) * 24, y: LANE_Y[row] + 22 };
};

const loadRoom = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && Date.now() - saved.at < 6 * 3600 * 1000 && /^[A-Z]{4}$/.test(saved.code)) return saved;
  } catch (error) { /* fresh room */ }
  return null;
};
const saveRoom = (code, players) => {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ code, at: Date.now(), players: players.map(({ cid, name, look }) => ({ cid, name, look })) }));
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

const CharmBadge = ({ id, x, y, r = 26, faded }) => {
  const charm = CHARM[id];
  return (
    <g transform={`translate(${x} ${y})`} opacity={faded ? 0.35 : 1}>
      <circle r={r} fill={charm ? charm.color : '#888'} stroke="#16122b" strokeWidth="5" />
      <text y="2" fontSize={r * 1.15} textAnchor="middle" dominantBaseline="central">{charm ? charm.icon : '?'}</text>
    </g>
  );
};

const Monster = ({ m, now, soulState }) => {
  const x = monsterX(m.x);
  const y = laneY(m.lane);
  const scale = monsterScale(m);
  const hit = now - m.hitAt < 220;
  const born = Math.min(1, (now - m.bornAt) / 400);
  const top = Math.max(m.boss ? 180 : 60, y - (m.boss ? 300 : 170) * scale - 30);
  const need = m.need;
  const width = need.length * 58;
  const markup = useMemo(() => monsterMarkup(m.kind), [m.kind]);
  return (
    <g className={`lc-monster${hit ? ' is-hit' : ''}`}>
      <g transform={`translate(${x} ${y}) scale(${-scale * born} ${scale * born})`} dangerouslySetInnerHTML={{ __html: markup }} />
      <g transform={`translate(${Math.max(x, width / 2 + 62, m.boss ? 210 : 0)} ${top})`}>
        <rect x={-width / 2 - 52} y="-34" width={width + 64} height="68" rx="34" fill={m.fog ? '#6d6a86' : '#1d1530'} stroke="#16122b" strokeWidth="5" opacity="0.92" />
        <g transform={`translate(${-width / 2 - 22} 0)`}>
          <circle r="24" fill={m.boss ? '#f5c542' : '#ff8a2a'} stroke="#16122b" strokeWidth="4" />
          <text y="2" fontSize="28" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b" fontFamily="Arial Black, Arial">{m.tag}</text>
        </g>
        {need.map((c, i) => (m.fog
          ? <g key={i} transform={`translate(${-width / 2 + 29 + i * 58} 0)`}><circle r="24" fill="#a9a6c4" stroke="#16122b" strokeWidth="4" /><text y="2" fontSize="30" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#16122b">?</text></g>
          : <CharmBadge key={i} id={c} x={-width / 2 + 29 + i * 58} y={0} r={24} />))}
        {need.length === 0 && m.boss && (
          <text x="0" y="4" fontSize="30" fontWeight="900" textAnchor="middle" dominantBaseline="central" fill="#ffe066">SOUL!</text>
        )}
      </g>
      {m.boss && (
        <g transform={`translate(${Math.max(x, 210)} ${top - 62})`}>
          <rect x="-190" y="-26" width="380" height="52" rx="26" fill="#1d1530" stroke="#16122b" strokeWidth="5" />
          <text x="0" y="2" fontSize="26" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill={soulState?.done ? '#3ddc97' : '#ffe066'}>
            {soulState?.done ? 'Souls joined! ✨' : soulState ? `SOUL ${soulState.by.length} / ${soulState.total} — hurry!` : 'Everyone tap SOUL together!'}
          </text>
        </g>
      )}
    </g>
  );
};

const House = ({ candles, maxCandles, flash }) => {
  const slots = Array.from({ length: maxCandles }, (_, i) => i);
  return (
    <g className="lc-house">
      <path d="M1440 980 L1440 330 L1580 200 L1700 120 L1820 200 L1910 300 L1910 980 Z" fill="#2b2140" stroke="#16122b" strokeWidth="8" strokeLinejoin="round" />
      <path d="M1410 345 L1700 95 L1940 315" fill="none" stroke="#16122b" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1410 345 L1700 95 L1940 315" fill="none" stroke="#4a2f5e" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="1790" y="130" width="44" height="90" fill="#3a2a4a" stroke="#16122b" strokeWidth="6" />
      <circle cx="1700" cy="230" r="44" fill={flash ? '#ff5050' : '#ffcf5a'} stroke="#16122b" strokeWidth="7" className="lc-window" />
      <path d="M1700 186 L1700 274 M1656 230 L1744 230" stroke="#16122b" strokeWidth="6" />
      {[1500, 1810].map((wx) => (
        <g key={wx}>
          <rect x={wx - 50} y="330" width="100" height="120" rx="10" fill="#ffcf5a" stroke="#16122b" strokeWidth="7" className="lc-window" />
          <path d={`M${wx} 330 L${wx} 450 M${wx - 50} 390 L${wx + 50} 390`} stroke="#16122b" strokeWidth="6" />
        </g>
      ))}
      <rect x="1640" y="700" width="120" height="280" rx="60" fill="#5b3a26" stroke="#16122b" strokeWidth="8" />
      <circle cx="1735" cy="850" r="8" fill="#f5c542" />
      <rect x="1420" y="960" width="500" height="40" fill="#3a2a2a" stroke="#16122b" strokeWidth="6" />
      {/* the candles, along the porch rail */}
      <g transform="translate(1455 545)">
        <rect x="-10" y="40" width="460" height="18" rx="6" fill="#4a3430" stroke="#16122b" strokeWidth="5" />
        {slots.map((i) => {
          const lit = i < candles;
          const cx = 20 + i * (420 / Math.max(1, maxCandles - 1));
          return (
            <g key={i} transform={`translate(${cx} 40)`}>
              <rect x="-11" y="-44" width="22" height="44" rx="5" fill={lit ? '#f4ead2' : '#8d8578'} stroke="#16122b" strokeWidth="4" />
              <path d="M0 -44 L0 -52" stroke="#16122b" strokeWidth="3" />
              {lit ? <path className="lc-flame" d="M0 -78 Q12 -60 0 -50 Q-12 -60 0 -78 Z" fill="#ffb33a" stroke="#16122b" strokeWidth="3" />
                : <path className="lc-smoke" d="M0 -56 Q8 -66 0 -76 Q-8 -86 0 -96" fill="none" stroke="#9a96aa" strokeWidth="4" strokeLinecap="round" />}
            </g>
          );
        })}
      </g>
    </g>
  );
};

const Backdrop = () => (
  <g>
    <defs>
      <linearGradient id="lc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#120c24" />
        <stop offset="0.55" stopColor="#3a1f55" />
        <stop offset="1" stopColor="#5a2d4f" />
      </linearGradient>
      <radialGradient id="lc-moonglow">
        <stop offset="0" stopColor="#fff6d0" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff6d0" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#lc-sky)" />
    <circle cx="330" cy="170" r="230" fill="url(#lc-moonglow)" />
    <circle cx="330" cy="170" r="95" fill="#fff1c1" stroke="#16122b" strokeWidth="6" />
    <circle cx="300" cy="150" r="16" fill="#efdca0" /><circle cx="360" cy="200" r="11" fill="#efdca0" /><circle cx="350" cy="130" r="8" fill="#efdca0" />
    {[[620, 90], [800, 160], [980, 70], [1180, 140], [1320, 60], [90, 300], [540, 260], [1080, 250]].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 2 ? 3 : 4} fill="#fff" className="lc-star" style={{ animationDelay: `${i * 0.37}s` }} />
    ))}
    <path d="M0 420 Q200 360 420 400 Q700 340 1000 390 Q1250 350 1500 400 L1920 380 L1920 1080 L0 1080 Z" fill="#1d3a2a" stroke="#16122b" strokeWidth="6" />
    <path d="M0 470 Q500 430 1000 470 Q1500 440 1920 460 L1920 1080 L0 1080 Z" fill="#26492f" />
    {LANE_Y.map((y) => (
      <path key={y} d={`M${PATH_LEFT - 90} ${y} L${PATH_RIGHT + 90} ${y}`} stroke="#3e5e3a" strokeWidth="64" strokeLinecap="round" opacity="0.8" />
    ))}
    {/* graveyard */}
    {[[40, 520, 0.9], [70, 700, 1], [40, 880, 0.85], [110, 620, 0.7], [110, 800, 0.75]].map(([x, y, s], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M-34 0 L-34 -70 Q-34 -104 0 -104 Q34 -104 34 -70 L34 0 Z" fill="#8d8aa0" stroke="#16122b" strokeWidth="6" />
        <text y="-52" fontSize="22" fontWeight="900" textAnchor="middle" fill="#5d5a70" fontFamily="Arial Black, Arial">RIP</text>
      </g>
    ))}
    {/* dead tree */}
    <path d="M520 420 L530 330 L490 280 M530 330 L560 260 L600 240 M545 300 L590 300" stroke="#16122b" strokeWidth="14" fill="none" strokeLinecap="round" />
  </g>
);

const Effects = ({ effects, now, players, monsters }) => effects.map((fx) => {
  const k = (now - fx.at) / fx.ms;
  if (k < 0 || k > 1) return null;
  if (fx.type === 'throw') {
    const from = spot(fx.slot);
    const target = monsters.find((m) => m.id === fx.monster);
    const to = target ? { x: monsterX(target.x), y: laneY(target.lane) - 110 * monsterScale(target) } : fx.to;
    if (!to) return null;
    fx.to = to;
    const sx = from.x - 30;
    const sy = from.y - 95;
    const x = sx + (to.x - sx) * k;
    const y = sy + (to.y - sy) * k - Math.sin(k * Math.PI) * 160;
    return <CharmBadge key={fx.id} id={fx.charm} x={x} y={y} r={22} />;
  }
  if (fx.type === 'poof') {
    return (
      <g key={fx.id} transform={`translate(${fx.x} ${fx.y})`} opacity={1 - k}>
        <circle r={40 + k * (fx.boss ? 260 : 110)} fill="#fff6c8" opacity="0.5" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          const d = 30 + k * (fx.boss ? 280 : 130);
          return <text key={i} x={Math.cos(a) * d} y={Math.sin(a) * d} fontSize="34" textAnchor="middle">✨</text>;
        })}
        <text y={-60 - k * 40} fontSize={fx.boss ? 110 : 64} fontWeight="900" textAnchor="middle" fill="#ffe066" stroke="#16122b" strokeWidth="6" paintOrder="stroke" fontFamily="Creepster, Arial Black, Arial">POOF!</text>
      </g>
    );
  }
  if (fx.type === 'spooked') {
    const p = spot(fx.slot);
    return <text key={fx.id} x={p.x} y={p.y - 130 - k * 20} fontSize="34" fontWeight="900" textAnchor="middle" fill="#ff6b6b" stroke="#16122b" strokeWidth="5" paintOrder="stroke" opacity={1 - k * 0.6}>SPOOKED!</text>;
  }
  if (fx.type === 'candle') {
    return (
      <g key={fx.id} opacity={1 - k}>
        <rect width="1920" height="1080" fill="#ff2040" opacity={0.25 * (1 - k)} />
        <text x="1680" y={520 - k * 60} fontSize="64" fontWeight="900" textAnchor="middle" fill="#ff6b6b" stroke="#16122b" strokeWidth="7" paintOrder="stroke">-1 🕯️</text>
      </g>
    );
  }
  if (fx.type === 'fail') {
    return <text key={fx.id} x="960" y="300" fontSize="60" fontWeight="900" textAnchor="middle" fill="#ff6b6b" stroke="#16122b" strokeWidth="7" paintOrder="stroke" opacity={1 - k}>Too slow! Tap SOUL together!</text>;
  }
  return null;
});

const ScenePerson = React.memo(({ look, pose, k, x, y, delay }) => {
  const markup = useMemo(() => personMarkup(parseLook(look), { kind: pose, k }), [look, pose, k]);
  return (
    <g transform={`translate(${x} ${y}) scale(0.46)`}>
      <g className={`lc-bob lc-d${delay}`} dangerouslySetInnerHTML={{ __html: markup }} />
    </g>
  );
});

const PlayerTag = ({ name, vip, x, y, color = '#1d1530' }) => {
  const label = `${vip ? '👑 ' : ''}${name}`;
  const w = Math.max(60, label.length * 10 + 18);
  return (
    <g transform={`translate(${x} ${y + 16})`}>
      <rect x={-w / 2} y="-13" width={w} height="26" rx="13" fill={color} stroke="#16122b" strokeWidth="3" opacity="0.92" />
      <text y="1" fontSize="17" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#fff">{label}</text>
    </g>
  );
};

/** The TV page: a room code to join, everyone's characters live, and the game. */
export default function PartyHost() {
  const [code, setCode] = useState(() => loadRoom()?.code || null);
  const [players, setPlayers] = useState(() => (loadRoom()?.players || []).map((p) => ({ ...p, joinedAt: 0, lastSeen: 0 })));
  const [mode, setMode] = useState('lobby');
  const [connected, setConnected] = useState(false);
  const [, setFrame] = useState(0);
  const [mute, setMute] = useState(isMuted());
  const [splashLooks] = useState(() => [1, 3, 5, 2].map((costume) => ({ ...randomLook(), costume })));
  const gameRef = useRef(null);
  const hostRef = useRef(null);
  const playersRef = useRef(players);
  const modeRef = useRef(mode);
  const lastSent = useRef(new Map());
  const lastEvent = useRef(0);
  const effects = useRef([]);
  const poses = useRef(new Map()); // cid -> { pose, until, k }
  const fxId = useRef(0);
  const started = Boolean(code);

  playersRef.current = players;
  modeRef.current = mode;

  useEffect(() => { if (code) saveRoom(code, players); }, [code, players]);

  // Fonts for the titles
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;700&display=swap';
    document.head.appendChild(link);
    document.title = 'Last Candle';
    return () => link.remove();
  }, []);

  const screenFor = useCallback((cid) => {
    const list = playersRef.current;
    const me = list.find((p) => p.cid === cid);
    if (!me) return { screen: 'full', code };
    const game = gameRef.current;
    const now = performance.now();
    const base = { screen: modeRef.current, code, vip: list[0]?.cid === cid, count: list.length, max: MAX_PLAYERS, name: me.name };
    if (modeRef.current !== 'game' || !game) return base;
    const inGame = game.players.some((p) => p.cid === cid);
    const view = inGame ? phoneView(game, cid, now) : null;
    const result = ['won', 'lost'].includes(game.phase)
      ? { score: game.score, awards: awards(game).filter((a) => a.cid === cid).map((a) => a.title), stats: game.stats[cid] }
      : null;
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

  const startGame = useCallback(() => {
    const list = playersRef.current;
    if (!list.length) return;
    const now = performance.now();
    gameRef.current = createGame(list.map((p) => ({ cid: p.cid, name: p.name })), Math.floor(Math.random() * 1e9), now);
    skipToNight(gameRef.current, Number(new URLSearchParams(window.location.search).get('night')), now);
    lastEvent.current = 0;
    effects.current = [];
    poses.current = new Map();
    setMode('game');
    modeRef.current = 'game';
    sfx.night();
    pushAll(true);
  }, [pushAll]);

  const backToLobby = useCallback(() => {
    gameRef.current = null;
    setMode('lobby');
    modeRef.current = 'lobby';
    pushAll(true);
  }, [pushAll]);

  const onMessage = useCallback((event, msg) => {
    const now = performance.now();
    const list = playersRef.current;
    const known = list.find((p) => p.cid === msg.cid);
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
        poses.current.set(msg.cid, { pose: 'wave', until: now + 2500 });
        sfx.join();
        if (gameRef.current && !['won', 'lost'].includes(gameRef.current.phase)) addPlayer(gameRef.current, msg.cid, name, now);
      } else {
        const next = list.map((p) => (p.cid === msg.cid ? { ...p, name: name || p.name, look: look || p.look, lastSeen: now } : p));
        playersRef.current = next;
        setPlayers(next);
        if (event === 'look' && look !== known.look) poses.current.set(msg.cid, { pose: 'wave', until: now + 1500 });
      }
      if (gameRef.current) seen(gameRef.current, msg.cid, now);
      if (event === 'hello') lastSent.current.delete(msg.cid);
      pushAll();
      return;
    }
    if (!known) return;
    const game = gameRef.current;
    if (event === 'start' && list[0]?.cid === msg.cid && modeRef.current === 'lobby') startGame();
    if (event === 'again' && list[0]?.cid === msg.cid && game && ['won', 'lost'].includes(game.phase)) backToLobby();
    if (event === 'bye' && modeRef.current === 'lobby') {
      const next = list.filter((p) => p.cid !== msg.cid);
      playersRef.current = next;
      setPlayers(next);
    }
    if (event === 'play' && game) play(game, msg.cid, Number(msg.slot), now);
    if (event === 'soul' && game) {
      if (soul(game, msg.cid, now)) sfx.soul();
    }
    pushAll();
  }, [backToLobby, code, pushAll, startGame]);

  // Open the room channel
  useEffect(() => {
    if (!code) return undefined;
    const host = openHost(code, (event, msg) => onMessageRef.current(event, msg), (status) => setConnected(status === 'SUBSCRIBED'));
    hostRef.current = host;
    return () => { host.close(); hostRef.current = null; };
  }, [code]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // The game loop: step the game, turn its events into effects and sounds, keep phones up to date.
  useEffect(() => {
    let raf = 0;
    let lastPush = 0;
    const loop = () => {
      const now = performance.now();
      const game = gameRef.current;
      if (game && modeRef.current === 'game') {
        tick(game, now);
        const slots = new Map(playersRef.current.map((p, i) => [p.cid, i]));
        game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
          lastEvent.current = e.id;
          fxId.current += 1;
          const id = fxId.current;
          switch (e.type) {
            case 'throw':
              effects.current.push({ id, type: 'throw', at: now, ms: THROW_MS, slot: slots.get(e.by) ?? 0, charm: e.charm, monster: e.monster });
              poses.current.set(e.by, { pose: 'throw', until: now + THROW_MS, at: now });
              sfx.hit();
              break;
            case 'banish':
              effects.current.push({ id, type: 'poof', at: now + (e.by ? THROW_MS * 0.8 : 0), ms: 900, x: monsterX(e.x), y: laneY(e.lane) - 80, boss: e.boss });
              if (e.by) window.setTimeout(() => sfx.banish(), THROW_MS * 0.8);
              if (e.by) poses.current.set(e.by, { pose: 'cheer', until: now + 1600 });
              break;
            case 'fizzle':
              effects.current.push({ id, type: 'spooked', at: now, ms: SPOOK_MS, slot: slots.get(e.by) ?? 0 });
              poses.current.set(e.by, { pose: 'scared', until: now + SPOOK_MS });
              sfx.fizzle();
              break;
            case 'candle':
              effects.current.push({ id, type: 'candle', at: now, ms: 900 });
              playersRef.current.forEach((p) => poses.current.set(p.cid, { pose: 'scared', until: now + 900 }));
              sfx.candle();
              break;
            case 'spawn': sfx.spawn(); break;
            case 'boss': sfx.boss(); break;
            case 'soulDone': sfx.soulDone(); break;
            case 'soulFail': effects.current.push({ id, type: 'fail', at: now, ms: 1600 }); sfx.fizzle(); break;
            case 'night': sfx.night(); break;
            case 'won': sfx.won(); break;
            case 'lost': sfx.lost(); break;
            default: break;
          }
        });
        effects.current = effects.current.filter((fx) => now - fx.at < fx.ms);
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

  // Lobby: keep phones current (VIP, count) without a game loop push.
  useEffect(() => { if (mode === 'lobby') pushAll(); }, [players, mode, pushAll]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (modeRef.current === 'lobby' && playersRef.current.length) startGame();
      else if (gameRef.current && ['won', 'lost'].includes(gameRef.current.phase)) backToLobby();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [backToLobby, startGame]);

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
          <h1 className="lc-title">Last Candle</h1>
          <p className="lc-sub">A cooperative Halloween party game for 1 to 12 players.<br />Put this page on the TV. Everyone plays on their phone.</p>
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
  const poseFor = (cid) => {
    const p = poses.current.get(cid);
    if (p && p.until > now) return p.pose === 'throw' ? { pose: 'throw', k: Math.min(1, (now - p.at) / THROW_MS) } : { pose: p.pose, k: 0 };
    if (game && game.phase === 'won') return { pose: 'cheer', k: 0 };
    if (game && game.phase === 'lost') return { pose: 'scared', k: 0 };
    if (game && (game.spookedUntil[cid] || 0) > now) return { pose: 'scared', k: 0 };
    return { pose: 'stand', k: 0 };
  };
  const night = game ? NIGHTS[game.night - 1] : null;
  const soulState = game?.soul ? { ...game.soul, total: game.players.filter((p) => now - (game.lastSeen[p.cid] ?? -1e9) <= 30000).length } : null;
  const soulLeft = game?.soul && !game.soul.done ? Math.max(0, SOUL_WINDOW_MS - (now - game.soul.startedAt)) : 0;

  return (
    <div className="lc-tv">
      <div className="lc-stage">
        <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
          <Backdrop />
          <House candles={game ? game.candles : 5} maxCandles={game ? game.maxCandles : 5} flash={effects.current.some((f) => f.type === 'candle')} />
          {game && [...game.monsters].sort((a, b) => laneY(a.lane) - laneY(b.lane)).map((m) => <Monster key={m.id} m={m} now={now} soulState={m.boss ? soulState : null} />)}
          {mode === 'game' && players.map((p, i) => ({ p, i, s: spot(i) })).sort((a, b) => a.s.y - b.s.y).map(({ p, i, s }) => {
            const { pose, k } = poseFor(p.cid);
            return <ScenePerson key={p.cid} look={p.look} pose={pose} k={Math.round(k * 10) / 10} x={s.x} y={s.y} delay={i % 4} />;
          })}
          {mode === 'game' && players.map((p, i) => {
            const s = spot(i);
            return <PlayerTag key={p.cid} name={p.name} vip={i === 0} x={s.x} y={s.y} />;
          })}
          {game && <Effects effects={effects.current} now={now} players={players} monsters={game.monsters} />}
        </svg>
        <div className="lc-fog" />

        {mode === 'game' && game && (
          <div className="lc-hud">
            <div className="lc-hud-night">Night {game.night} · {night.title}</div>
            {game.phase === 'night' && night.length > 0 && (
              <div className="lc-hud-timer"><span style={{ width: `${Math.max(0, 100 - ((now - game.phaseAt) / night.length) * 100)}%` }} /><em>until dawn</em></div>
            )}
            {soulLeft > 0 && <div className="lc-hud-soul">SOUL! {Math.ceil(soulLeft / 1000)}…</div>}
            <div className="lc-hud-score">{game.score} pts</div>
          </div>
        )}
        <div className="lc-corner">
          <span>Join at <b>{joinUrl().replace(/^https?:\/\//, '')}</b></span>
          <span className="lc-corner-code">{code}</span>
          <button type="button" className="lc-mute" onClick={toggleMute} aria-label={mute ? 'Sound on' : 'Mute'}>{mute ? '🔇' : '🔊'}</button>
          {!connected && <span className="lc-warn">Connecting…</span>}
        </div>

        {mode === 'lobby' && (
          <div className="lc-lobby">
            <div className="lc-lobby-top">
              <div>
                <h1 className="lc-title">Last Candle</h1>
                <p className="lc-sub">Keep the candles lit until dawn. Work together, shout a lot.</p>
                <ol className="lc-how">
                  <li>Monsters walk up the paths. Each shows the charms that banish it.</li>
                  <li>Your phone holds 3 charms. Tap one to throw it. Throw a charm nobody needs and you get spooked.</li>
                  <li>Shout! “Who has garlic?!” Fog hides some monsters, and only one phone can see through it.</li>
                </ol>
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
                const { pose } = poseFor(p.cid);
                return (
                  <div key={p.cid} className="lc-slot">
                    <Person look={p.look} pose={pose === 'stand' ? 'stand' : pose} className={`lc-bob lc-d${i % 4}`} />
                    <div className="lc-slot-name">{i === 0 ? '👑 ' : ''}{p.name}</div>
                    <button type="button" className="lc-kick" onClick={() => kick(p.cid)} aria-label={`Remove ${p.name}`}>×</button>
                  </div>
                );
              })}
            </div>
            <div className="lc-lobby-foot">
              {players.length ? (
                <>
                  <span>{players.length} of {MAX_PLAYERS} in. 👑 {players[0].name} can start from their phone, or</span>
                  <button type="button" className="lc-btn" onClick={startGame}>Start the night</button>
                </>
              ) : <span>Waiting for players… scan the code or go to the address above.</span>}
            </div>
          </div>
        )}

        {game && game.phase === 'intro' && (
          <div className="lc-card lc-intro">
            <div className="lc-card-kicker">Night {game.night} of 3</div>
            <h2 className="lc-title">{night.title}</h2>
            <p>{night.blurb}</p>
            <div className="lc-intro-charms">{Object.values(CHARM).slice(0, night.charms).map((c) => <span key={c.id} style={{ background: c.color }}>{c.icon}<small>{c.name}</small></span>)}</div>
            <div className="lc-countdown">{Math.max(1, Math.ceil((9000 - (now - game.phaseAt)) / 1000))}</div>
          </div>
        )}
        {game && game.phase === 'break' && (
          <div className="lc-card lc-break">
            <div className="lc-card-kicker">Dawn!</div>
            <h2 className="lc-title">You survived night {game.night}</h2>
            <p>{game.candles} of {game.maxCandles} candles still lit · {game.score} points</p>
            <p className="lc-next">Next up: <b>{NIGHTS[game.night].title}</b></p>
          </div>
        )}
        {game && (game.phase === 'won' || game.phase === 'lost') && (
          <div className={`lc-card lc-end ${game.phase}`}>
            <h2 className="lc-title">{game.phase === 'won' ? 'The Pumpkin King is banished!' : 'The last candle went out…'}</h2>
            <p>{game.phase === 'won' ? `The crew made it to dawn with ${game.candles} candle${game.candles === 1 ? '' : 's'} lit.` : `The monsters got in on night ${game.night}.`} Final score: <b>{game.score}</b></p>
            <div className="lc-awards">
              {awards(game).map((a) => {
                const p = players.find((x) => x.cid === a.cid);
                return p ? (
                  <div key={a.title} className="lc-award">
                    <Person look={p.look} view="head" />
                    <b>{a.title}</b>
                    <span>{p.name}</span>
                    <small>{a.blurb}</small>
                  </div>
                ) : null;
              })}
            </div>
            <div className="lc-end-actions">
              <button type="button" className="lc-btn" onClick={backToLobby}>Back to the lobby</button>
              <button type="button" className="lc-btn lc-btn-ghost" onClick={startGame}>Play again</button>
            </div>
          </div>
        )}
        {game && game.phase === 'night' && game.monsters.some((m) => m.fog) && (
          <div className="lc-foghint">🌫️ Foggy monster! Check your phone, one of you can see what it needs.</div>
        )}
      </div>
    </div>
  );
}

