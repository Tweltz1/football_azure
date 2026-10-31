import React, { useEffect, useMemo, useRef } from 'react';
import Person from '../Person';
import { monsterMarkup } from '../monsters';
import { awards, CHARM, NIGHTS, SOUL_WINDOW_MS, SPOOK_MS } from '../lastCandle';
import { sfx } from '../sound';
import {
  Backdrop, CharmBadge, House, laneY, monsterScale, monsterX, PlayerTag, ScenePerson, spot, THROW_MS,
} from '../scene';

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


/** Last Candle on the TV: the yard, the monsters, everyone's characters, and the night/dawn/end cards. */
export default function CandleStage({ game, players, now, onLobby, onAgain }) {
  const lastEvent = useRef(0);
  const effects = useRef([]);
  const poses = useRef(new Map()); // cid -> { pose, until, at }
  const fxId = useRef(0);

  // Turn the game's events into effects, poses and sounds.
  useEffect(() => {
    const t = performance.now();
    const slots = new Map(players.map((p, i) => [p.cid, i]));
    game.events.filter((e) => e.id > lastEvent.current).forEach((e) => {
      lastEvent.current = e.id;
      fxId.current += 1;
      const id = fxId.current;
      switch (e.type) {
        case 'throw':
          effects.current.push({ id, type: 'throw', at: t, ms: THROW_MS, slot: slots.get(e.by) ?? 0, charm: e.charm, monster: e.monster });
          poses.current.set(e.by, { pose: 'throw', until: t + THROW_MS, at: t });
          sfx.hit();
          break;
        case 'banish':
          effects.current.push({ id, type: 'poof', at: t + (e.by ? THROW_MS * 0.8 : 0), ms: 900, x: monsterX(e.x), y: laneY(e.lane) - 80, boss: e.boss });
          if (e.by) window.setTimeout(() => sfx.banish(), THROW_MS * 0.8);
          if (e.by) poses.current.set(e.by, { pose: 'cheer', until: t + 1600 });
          break;
        case 'fizzle':
          effects.current.push({ id, type: 'spooked', at: t, ms: SPOOK_MS, slot: slots.get(e.by) ?? 0 });
          poses.current.set(e.by, { pose: 'scared', until: t + SPOOK_MS });
          sfx.fizzle();
          break;
        case 'candle':
          effects.current.push({ id, type: 'candle', at: t, ms: 900 });
          players.forEach((p) => poses.current.set(p.cid, { pose: 'scared', until: t + 900 }));
          sfx.candle();
          break;
        case 'spawn': sfx.spawn(); break;
        case 'boss': sfx.boss(); break;
        case 'soulStart': sfx.soul(); break;
        case 'soulDone': sfx.soulDone(); break;
        case 'soulFail': effects.current.push({ id, type: 'fail', at: t, ms: 1600 }); sfx.fizzle(); break;
        case 'night': sfx.night(); break;
        case 'won': sfx.won(); break;
        case 'lost': sfx.lost(); break;
        default: break;
      }
    });
    effects.current = effects.current.filter((fx) => t - fx.at < fx.ms);
  });

  const poseFor = (cid) => {
    const p = poses.current.get(cid);
    if (p && p.until > now) return p.pose === 'throw' ? { pose: 'throw', k: Math.min(1, (now - p.at) / THROW_MS) } : { pose: p.pose, k: 0 };
    if (game.phase === 'won') return { pose: 'cheer', k: 0 };
    if (game.phase === 'lost') return { pose: 'scared', k: 0 };
    if ((game.spookedUntil[cid] || 0) > now) return { pose: 'scared', k: 0 };
    return { pose: 'stand', k: 0 };
  };
  const night = NIGHTS[game.night - 1];
  const soulState = game.soul ? { ...game.soul, total: game.players.filter((p) => now - (game.lastSeen[p.cid] ?? -1e9) <= 30000).length } : null;
  const soulLeft = game.soul && !game.soul.done ? Math.max(0, SOUL_WINDOW_MS - (now - game.soul.startedAt)) : 0;
  const nightLength = night.length;

  return (
    <>
      <svg className="lc-scene" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet">
        <Backdrop />
        <House candles={game.candles} maxCandles={game.maxCandles} flash={effects.current.some((f) => f.type === 'candle')} />
        {[...game.monsters].sort((a, b) => laneY(a.lane) - laneY(b.lane)).map((m) => <Monster key={m.id} m={m} now={now} soulState={m.boss ? soulState : null} />)}
        {players.map((p, i) => ({ p, i, s: spot(i) })).sort((a, b) => a.s.y - b.s.y).map(({ p, i, s }) => {
          const { pose, k } = poseFor(p.cid);
          return <ScenePerson key={p.cid} look={p.look} pose={pose} k={Math.round(k * 10) / 10} x={s.x} y={s.y} delay={i % 4} />;
        })}
        {players.map((p, i) => {
          const s = spot(i);
          return <PlayerTag key={p.cid} name={p.name} vip={i === 0} x={s.x} y={s.y} />;
        })}
        <Effects effects={effects.current} now={now} players={players} monsters={game.monsters} />
      </svg>
      <div className="lc-fog" />

      <div className="lc-hud">
        <div className="lc-hud-night">Night {game.night} · {night.title}</div>
        {game.phase === 'night' && nightLength > 0 && (
          <div className="lc-hud-timer"><span style={{ width: `${Math.max(0, 100 - ((now - game.phaseAt) / nightLength) * 100)}%` }} /><em>until dawn</em></div>
        )}
        {soulLeft > 0 && <div className="lc-hud-soul">SOUL! {Math.ceil(soulLeft / 1000)}…</div>}
        <div className="lc-hud-score">{game.score} pts</div>
      </div>

      {game.phase === 'intro' && (
        <div className="lc-card lc-intro">
          <div className="lc-card-kicker">Night {game.night} of 3</div>
          <h2 className="lc-title">{night.title}</h2>
          <p>{night.blurb}</p>
          <div className="lc-intro-charms">{Object.values(CHARM).slice(0, night.charms).map((c) => <span key={c.id} style={{ background: c.color }}>{c.icon}<small>{c.name}</small></span>)}</div>
          <div className="lc-countdown">{Math.max(1, Math.ceil((9000 - (now - game.phaseAt)) / 1000))}</div>
        </div>
      )}
      {game.phase === 'break' && (
        <div className="lc-card lc-break">
          <div className="lc-card-kicker">Dawn!</div>
          <h2 className="lc-title">You survived night {game.night}</h2>
          <p>{game.candles} of {game.maxCandles} candles still lit · {game.score} points</p>
          <p className="lc-next">Next up: <b>{NIGHTS[game.night].title}</b></p>
        </div>
      )}
      {(game.phase === 'won' || game.phase === 'lost') && (
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
            <button type="button" className="lc-btn" onClick={onLobby}>Back to the lobby</button>
            <button type="button" className="lc-btn lc-btn-ghost" onClick={onAgain}>Play again</button>
          </div>
        </div>
      )}
      {game.phase === 'night' && game.monsters.some((m) => m.fog) && (
        <div className="lc-foghint">🌫️ Foggy monster! Check your phone, one of you can see what it needs.</div>
      )}
    </>
  );
}
