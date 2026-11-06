import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CREW } from '../../data/crew';
import { guySound, taDa } from '../../sound/crewSound';
import { useFixedLoop } from '../gameRunners';
import { createRaceEngine } from './raceEngine';
import { DEPTH_X, DEPTH_Y, block, drawBackdrop, texture, THEMES } from './raceArt';
import { EFFECT, groundAt, ITEM_BY_KEY, isStopped, MAP_BY_KEY, progressOf, standings, TICKS_PER_SECOND } from './raceSim';

const VIEW_UNITS = 320; // world units from the bottom of the screen to the top
const MIN_VIEW_WIDTH = 700; // world units across, at least
const GROUND_AT = 0.8; // ground line, as a share of the canvas height
const SPRITE_H = 80;
const SPRITE_W = 61;

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;

function loadCrewImages() {
  return CREW.map((guy) => {
    const img = new Image();
    img.src = guy.art;
    return img;
  });
}

function drawCar(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#d7263d';
  ctx.strokeStyle = '#16122b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-50, -8); ctx.lineTo(-44, -22); ctx.lineTo(-20, -24); ctx.lineTo(-8, -36); ctx.lineTo(22, -36); ctx.lineTo(34, -24); ctx.lineTo(50, -20); ctx.lineTo(52, -6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#222';
  [[-28, -4], [30, -4]].forEach(([cx, cy]) => { ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  ctx.restore();
}

/** Draws one frame: scenery, course, runners (you on top), effects. */
function draw(ctx, engine, width, height, images) {
  // Phones are narrow: zoom out so you can see what's coming.
  const scale = Math.min(height / VIEW_UNITS, width / MIN_VIEW_WIDTH);
  const groundY = height * GROUND_AT;
  const me = engine.me || engine.racers[0];
  const camera = me.runner.x - (width / scale) * 0.28;
  // Runners and things on the track sit halfway into its depth.
  const mid = { x: (DEPTH_X / 2) * scale, y: (DEPTH_Y / 2) * scale };
  const sx = (x) => (x - camera) * scale;
  const sy = (y) => groundY - y * scale;
  const { course } = engine;
  const theme = THEMES[course.map] || THEMES.woods;
  const dx = DEPTH_X * scale;
  const dy = DEPTH_Y * scale;

  drawBackdrop(ctx, theme, width, height, groundY - dy, camera, scale, engine.tick);

  // Ground in solid stretches between the gaps: grass (or sand, or snow) on top, dirt in front.
  const left = camera - 60;
  const right = camera + width / scale + 60;
  const gaps = course.gaps.filter((g) => g.end > left && g.start < right);
  const stretches = [];
  let x = left;
  for (const gap of gaps) {
    if (gap.start > x) stretches.push([x, gap.start]);
    x = gap.end;
  }
  if (x < right) stretches.push([x, right]);
  ctx.fillStyle = theme.pit;
  ctx.fillRect(0, groundY - dy, width, height - groundY + dy);
  stretches.forEach(([a, b]) => {
    block(ctx, sx(a), groundY, (b - a) * scale, height, dx, dy, theme.front, theme.top, theme.frontDark);
    texture(ctx, theme, a, b, sx, groundY + 6 * scale, height, scale);
    ctx.fillStyle = theme.topEdge;
    ctx.fillRect(sx(a), groundY, (b - a) * scale, 5 * scale);
  });

  // Rocks: front, top and side, nearest last.
  course.walls.filter((w) => w.end > left && w.start < right).forEach((w) => {
    block(ctx, sx(w.start), sy(w.h), (w.end - w.start) * scale, groundY, dx, dy, theme.rockFront, theme.rockTop, theme.rockSide);
    texture(ctx, { ...theme, stone: theme.rockTop, frontDark: theme.rockSide }, w.start, w.end, sx, sy(w.h) + 6 * scale, groundY, scale);
  });

  // Spikes, standing in the middle of the track's depth.
  ctx.strokeStyle = '#16122b';
  ctx.lineWidth = 1.5;
  course.spikes.filter((s) => s.end > left && s.start < right).forEach((s) => {
    const n = Math.max(2, Math.round((s.end - s.start) / 14));
    const w = (s.end - s.start) / n;
    for (let i = 0; i < n; i += 1) {
      const x0 = sx(s.start + i * w) + mid.x;
      const x1 = sx(s.start + (i + 1) * w) + mid.x;
      const base = sy(s.y) - mid.y;
      const tip = sy(s.y + 20) - mid.y;
      ctx.fillStyle = theme.spike;
      ctx.beginPath();
      ctx.moveTo(x0, base); ctx.lineTo((x0 + x1) / 2, tip); ctx.lineTo(x1, base); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo((x0 + x1) / 2, tip); ctx.lineTo(x1, base); ctx.lineTo((x0 + x1) / 2, base); ctx.closePath();
      ctx.fill();
    }
  });

  // Puddles dropped on you.
  ctx.fillStyle = 'rgba(150, 120, 40, 0.85)';
  me.runner.traps.forEach((t) => {
    ctx.beginPath();
    ctx.ellipse(sx(t) + mid.x, sy(0) - mid.y, 26 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Item boxes you haven't opened: spinning-ish cubes.
  course.boxes.forEach((box, index) => {
    if (box.x < left || box.x > right || me.runner.boxesTaken.includes(index)) return;
    const bob = Math.abs(((engine.tick + index * 7) % 40) - 20) / 20;
    const size = 28 * scale;
    const bx = sx(box.x) + mid.x - size / 2;
    const by = sy(box.y + 30 + bob * 6) - mid.y;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx(box.x) + mid.x, sy(groundAt(course, box.x) ?? 0) - mid.y, 16 * scale, 5 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    block(ctx, bx, by, size, by + size, size * 0.3, size * 0.3, '#f5c518', '#ffe27a', '#c99a0a');
    ctx.strokeStyle = '#16122b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, size, size);
    ctx.fillStyle = '#16122b';
    ctx.font = `bold ${Math.round(20 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('?', bx + size / 2, by + size * 0.75);
  });

  // Finish line: a checkered arch across the track.
  const fx = sx(course.length);
  if (fx > -60 && fx < width + 60) {
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 ? '#fff' : '#111';
      ctx.fillRect(fx, sy(220) + i * 18 * scale, 9 * scale, 18 * scale);
      ctx.fillStyle = i % 2 ? '#111' : '#fff';
      ctx.fillRect(fx + 9 * scale, sy(220) + i * 18 * scale, 9 * scale, 18 * scale);
    }
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(fx + dx, sy(220) - dy, 18 * scale, 216 * scale);
    ctx.fillRect(fx, sy(230) - dy, dx + 18 * scale, 14 * scale);
  }

  // Runners: others first, then you on top.
  const order = engine.racers.filter((r) => r !== me).concat([me]);
  order.forEach((r) => {
    const run = r.runner;
    const px = sx(run.x) + mid.x;
    if (px < -80 || px > width + 80) return;
    const tick = run.tick;
    const footY = sy(run.y) - mid.y;
    // A shadow on whatever is under them, smaller the higher they are.
    const floor = groundAt(course, run.x);
    if (floor != null && run.y >= floor - 1) {
      const lift = Math.min(1, (run.y - floor) / 120);
      ctx.fillStyle = `rgba(0,0,0,${0.28 * (1 - lift * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(px, sy(floor) - mid.y, 22 * scale * (1 - lift * 0.5), 6 * scale * (1 - lift * 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = r === me ? 1 : 0.8;
    if (tick < run.carUntil) drawCar(ctx, px, footY, scale * 0.9);
    // A little bounce in their step.
    const bounce = run.grounded && !isStopped(run) ? (Math.abs((tick % 10) - 5) / 5) * 3 * scale : 0;
    ctx.translate(px, footY - (SPRITE_H * scale) / 2 - bounce);
    if (isStopped(run) && tick < run.stunUntil) ctx.rotate(Math.PI / 2.4);
    else if (!run.grounded) ctx.rotate(-0.15);
    const img = images[r.crew];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, (-SPRITE_W * scale) / 2, (-SPRITE_H * scale) / 2, SPRITE_W * scale, SPRITE_H * scale);
    }
    ctx.restore();
    if (tick < run.freezeUntil) {
      ctx.fillStyle = 'rgba(140, 210, 255, 0.45)';
      ctx.fillRect(px - 26 * scale, footY - SPRITE_H * scale, 52 * scale, SPRITE_H * scale);
    }
    if (tick < run.shieldUntil) {
      ctx.strokeStyle = 'rgba(61, 220, 151, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, footY - (SPRITE_H * scale) / 2, (SPRITE_H * scale) / 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (tick < run.dewUntil || tick < run.bionicUntil) {
      ctx.strokeStyle = tick < run.dewUntil ? 'rgba(160, 255, 80, 0.8)' : 'rgba(150, 200, 255, 0.8)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(px - 30 * scale - i * 4, footY - (20 + i * 18) * scale);
        ctx.lineTo(px - 70 * scale - i * 4, footY - (20 + i * 18) * scale);
        ctx.stroke();
      }
    }
    ctx.fillStyle = r === me ? '#ffd23f' : '#fff';
    ctx.font = `600 ${Math.max(10, Math.round(13 * scale))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(r === me ? 'You' : r.name, px, footY - (SPRITE_H + 8) * scale);
  });

  // Bush's bleeding eye: a splatter over most of your screen, with drips, that fades as it wears off.
  if (engine.me && me.runner.tick < me.runner.blindUntil) {
    const left2 = (me.runner.blindUntil - me.runner.tick) / EFFECT.blind;
    const fade = Math.min(1, left2 * 1.5);
    const age = EFFECT.blind - (me.runner.blindUntil - me.runner.tick);
    const size = Math.min(width, height);
    ctx.fillStyle = `rgba(120, 0, 10, ${0.25 * fade})`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `rgba(170, 0, 20, ${0.85 * fade})`;
    SPLAT.forEach(([cx, cy, r, drip]) => {
      const x = width * cx;
      const y = height * cy;
      ctx.beginPath();
      ctx.arc(x, y, size * r, 0, Math.PI * 2);
      ctx.fill();
      // Small droplets around each blob.
      for (let i = 0; i < 5; i += 1) {
        const a = (cx * 31 + i * 1.3) % (Math.PI * 2);
        const d = size * r * (1.2 + ((cy * 17 + i) % 1) * 0.5);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      // Drips run down the screen.
      if (drip) {
        const len = Math.min(height, size * drip * Math.min(1, age / 30));
        ctx.fillRect(x - size * 0.012, y, size * 0.024, len);
        ctx.beginPath();
        ctx.arc(x, y + len, size * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

// Where the blood lands: [x, y, radius, drip length], as shares of the screen.
const SPLAT = [
  [0.5, 0.4, 0.3, 0.5], [0.22, 0.3, 0.2, 0.6], [0.78, 0.32, 0.22, 0.4], [0.35, 0.72, 0.17, 0],
  [0.68, 0.7, 0.19, 0], [0.08, 0.62, 0.12, 0.3], [0.93, 0.6, 0.13, 0.3], [0.5, 0.08, 0.12, 0],
  [0.15, 0.08, 0.1, 0.4], [0.88, 0.1, 0.1, 0],
];

const KIND_SOUND = { horseshoe: 0, bionic: 1, eye: 2, potion: 3, seven: 4, shield: 5, car: 6, spit: 7, oip: 8, dew: 9 };

/**
 * The race screen. Tap (or space) to jump, the item button (or E) to use what you're holding.
 * `onDone(order, engine)` gets everyone in finishing order (and the engine, for your recorded inputs). `hooksRef.current` is given { receiveInputs, receiveAttack }
 * so the room can pass the other phones' messages in.
 */
const RaceGame = ({ seed, roster, meCid, hostCid, net, hooksRef, onDone }) => {
  const [callouts, setCallouts] = useState([]);
  const [phase, setPhase] = useState('countdown');
  const [count, setCount] = useState(3);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const images = useMemo(loadCrewImages, []);
  const doneRef = useRef(false);
  const topRef = useRef(null);

  // On a phone, bring the whole race (bar, track and buttons) into view.
  useEffect(() => {
    topRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, []);

  const engine = useMemo(() => createRaceEngine({
    seed,
    roster,
    meCid,
    hostCid,
    net,
    onEvent: (event) => {
      const item = ITEM_BY_KEY[event.kind];
      if (!item) return;
      const id = Math.random();
      const text = event.missed ? `${event.mine ? 'You' : event.name}: ${item.name}, but nobody to hit!`
        : `${event.mine ? 'You' : event.name}: "${item.line}" ${item.name}${event.target ? ` on ${event.target}` : ''}`;
      setCallouts((list) => [...list.slice(-1), { id, text, crew: item.crew }]);
      setTimeout(() => setCallouts((list) => list.filter((c) => c.id !== id)), 2600);
      guySound(KIND_SOUND[event.kind] ?? 0);
    },
  }), [seed, roster, meCid, hostCid, net]);

  useEffect(() => {
    if (hooksRef) hooksRef.current = { receiveInputs: engine.receiveInputs, receiveAttack: engine.receiveAttack };
    return () => { if (hooksRef) hooksRef.current = null; };
  }, [engine, hooksRef]);

  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    if (count <= 0) { setPhase('racing'); return undefined; }
    const id = setTimeout(() => setCount((n) => n - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
      if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w') { event.preventDefault(); engine.jump(); }
      if (event.key === 'e' || event.key === 'Shift' || event.key === 'Enter') { event.preventDefault(); engine.useItem(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  useFixedLoop(phase === 'racing', () => {
    const finishedBefore = engine.me?.runner.finishTick;
    engine.step();
    if (engine.me && finishedBefore == null && engine.me.runner.finishTick != null) taDa();
    if (engine.over && !doneRef.current) {
      doneRef.current = true;
      setPhase('over');
      onDone(standings(engine.racers.map((r) => r.runner)).map((run) => engine.racers.find((r) => r.runner === run)), engine);
      return false;
    }
    return true;
  });

  // Draw every frame (also during the countdown).
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (canvas && wrap) {
        const dpr = window.devicePixelRatio || 1;
        const width = wrap.clientWidth;
        // Short enough that the bar, the track and the Jump button all fit on a phone screen at once.
        const room = window.innerHeight - 270;
        const height = Math.max(190, Math.min(440, Math.round(width * 0.62), room));
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          canvas.style.height = `${height}px`;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(ctx, engine, width, height, images);
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [engine, images]);

  const me = engine.me;
  const item = me?.runner.item ? ITEM_BY_KEY[me.runner.item] : null;
  const placing = me ? standings(engine.racers.map((r) => r.runner)).indexOf(me.runner) + 1 : 0;
  const seconds = Math.floor(engine.tick / TICKS_PER_SECOND);

  return (
    <div className="race-game" ref={topRef}>
      <div className="race-progress" aria-label="Race progress">
        <span className="race-progress-track" />
        <span className="race-flag" aria-hidden="true">🏁</span>
        {engine.racers.map((r) => (
          <img
            key={r.cid}
            src={CREW[r.crew].art}
            alt={r.name}
            title={r.name}
            className={`race-face${r === me ? ' is-me' : ''}`}
            style={{ left: `${progressOf(r.runner, engine.course.length) * 94}%` }}
          />
        ))}
      </div>
      <div className="race-hud">
        <span>{me ? <><strong>{ordinal(placing)}</strong> of {engine.racers.length}</> : 'Watching'}</span>
        <span><strong>{seconds}</strong>s</span>
        <span>{me?.runner.finishTick != null ? 'Finished!' : `${Math.round(progressOf(me?.runner || engine.racers[0].runner, engine.course.length) * 100)}%`}</span>
      </div>
      <div
        className="race-stage"
        ref={wrapRef}
        onPointerDown={(e) => { if (e.button === 0 || e.pointerType !== 'mouse') engine.jump(); }}
        role="application"
        aria-label="Crew Fun Run. Tap to jump."
      >
        <canvas ref={canvasRef} className="race-canvas" />
        <div className="race-callouts" aria-live="polite">
          {callouts.map((c) => (
            <p key={c.id}><img src={CREW[c.crew].art} alt="" />{c.text}</p>
          ))}
        </div>
        {phase === 'countdown' && (
          <div className="game-overlay">
            <span className="race-map-name">{MAP_BY_KEY[engine.course.map]?.name}</span>
            <span className="game-countdown">{count || 'Go!'}</span>
          </div>
        )}
        {me && me.runner.finishTick != null && phase === 'racing' && (
          <div className="race-finished">You finished {ordinal(placing)}! Waiting for the others...</div>
        )}
        {me && me.runner.tick < me.runner.stunUntil && me.runner.finishTick == null && (
          <div className="race-ouch">
            {me.runner.hitBy === 'gap' ? 'Climbing out!' : me.runner.hitBy === 'spike' ? 'Ouch!' : me.runner.hitBy === 'spit' ? 'Slipped in the Ptooey!' : 'Hit!'}
          </div>
        )}
      </div>
      {me && (
        <div className="race-controls">
          <button type="button" className="race-jump" onPointerDown={(e) => { e.preventDefault(); engine.jump(); }}>Jump</button>
          <button
            type="button"
            className={`race-item${item ? ' has-item' : ''}`}
            disabled={!item}
            onPointerDown={(e) => { e.preventDefault(); engine.useItem(); }}
          >
            {item ? (
              <>
                <img src={CREW[item.crew].art} alt="" />
                <span><strong>{item.name}</strong><small>{item.does}</small></span>
              </>
            ) : <span>Grab a ? box for a power-up</span>}
          </button>
        </div>
      )}
      <p className="game-hint">Tap the track (or space) to jump. Use your item with the button (or E). {net ? 'Other phones show up a moment behind.' : ''}</p>
    </div>
  );
};

export default RaceGame;
