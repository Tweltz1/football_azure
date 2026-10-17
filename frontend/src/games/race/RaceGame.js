import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CREW } from '../../data/crew';
import { guySound, taDa } from '../../sound/crewSound';
import { useFixedLoop } from '../gameRunners';
import { createRaceEngine } from './raceEngine';
import { EFFECT, ITEM_BY_KEY, isStopped, progressOf, standings, TICKS_PER_SECOND } from './raceSim';

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

/** Draws one frame: course, runners (you on top), effects. */
function draw(ctx, engine, width, height, images) {
  // Phones are narrow: zoom out so you can see what's coming.
  const scale = Math.min(height / VIEW_UNITS, width / MIN_VIEW_WIDTH);
  const groundY = height * GROUND_AT;
  const me = engine.me || engine.racers[0];
  const camera = me.runner.x - (width / scale) * 0.28;
  const sx = (x) => (x - camera) * scale;
  const sy = (y) => groundY - y * scale;
  const { course } = engine;

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#1b2140');
  sky.addColorStop(1, '#4b5d93');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Far mountains, sliding slowly.
  ctx.fillStyle = '#2c3a6b';
  for (let i = -1; i < 8; i += 1) {
    const base = ((i * 420 - camera * 0.25) % 3360 + 3360) % 3360 - 420;
    ctx.beginPath();
    ctx.moveTo(base * scale, groundY);
    ctx.lineTo((base + 210) * scale, groundY - 190 * scale);
    ctx.lineTo((base + 420) * scale, groundY);
    ctx.fill();
  }

  // Ground, with the gaps cut out.
  const left = camera - 50;
  const right = camera + width / scale + 50;
  ctx.fillStyle = '#3c8a46';
  let x = left;
  const gaps = course.gaps.filter((g) => g.end > left && g.start < right);
  for (const gap of gaps) {
    if (gap.start > x) ctx.fillRect(sx(x), groundY, (gap.start - x) * scale, height - groundY);
    x = gap.end;
  }
  if (x < right) ctx.fillRect(sx(x), groundY, (right - x) * scale, height - groundY);
  ctx.fillStyle = '#2a6233';
  ctx.fillRect(0, groundY, width, 4 * scale);
  ctx.fillStyle = '#0c0d12';
  gaps.forEach((gap) => ctx.fillRect(sx(gap.start), groundY, (gap.end - gap.start) * scale, height - groundY));

  // Rocks.
  course.walls.filter((w) => w.end > left && w.start < right).forEach((w) => {
    ctx.fillStyle = '#7b6a58';
    ctx.fillRect(sx(w.start), sy(w.h), (w.end - w.start) * scale, w.h * scale);
    ctx.fillStyle = '#a08c74';
    ctx.fillRect(sx(w.start), sy(w.h), (w.end - w.start) * scale, 6 * scale);
  });

  // Spikes.
  ctx.fillStyle = '#c9ced8';
  ctx.strokeStyle = '#16122b';
  ctx.lineWidth = 1.5;
  course.spikes.filter((s) => s.end > left && s.start < right).forEach((s) => {
    const n = Math.max(2, Math.round((s.end - s.start) / 14));
    const w = (s.end - s.start) / n;
    for (let i = 0; i < n; i += 1) {
      ctx.beginPath();
      ctx.moveTo(sx(s.start + i * w), sy(s.y));
      ctx.lineTo(sx(s.start + i * w + w / 2), sy(s.y + 18));
      ctx.lineTo(sx(s.start + (i + 1) * w), sy(s.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  });

  // Puddles dropped on you.
  ctx.fillStyle = 'rgba(150, 120, 40, 0.85)';
  me.runner.traps.forEach((t) => {
    ctx.beginPath();
    ctx.ellipse(sx(t), sy(1), 26 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Item boxes you haven't opened.
  course.boxes.forEach((box, index) => {
    if (box.x < left || box.x > right || me.runner.boxesTaken.includes(index)) return;
    const bob = Math.abs(((engine.tick + index * 7) % 40) - 20) / 20;
    const bx = sx(box.x) - 15 * scale;
    const by = sy(box.y + 30 + bob * 6);
    ctx.fillStyle = '#f5c518';
    ctx.strokeStyle = '#16122b';
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, 30 * scale, 30 * scale);
    ctx.strokeRect(bx, by, 30 * scale, 30 * scale);
    ctx.fillStyle = '#16122b';
    ctx.font = `bold ${Math.round(20 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('?', bx + 15 * scale, by + 22 * scale);
  });

  // Finish line.
  const fx = sx(course.length);
  if (fx > -40 && fx < width + 40) {
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 ? '#fff' : '#111';
      ctx.fillRect(fx, sy(220) + i * 18 * scale, 9 * scale, 18 * scale);
      ctx.fillStyle = i % 2 ? '#111' : '#fff';
      ctx.fillRect(fx + 9 * scale, sy(220) + i * 18 * scale, 9 * scale, 18 * scale);
    }
  }

  // Runners: others first, then you on top.
  const order = engine.racers.filter((r) => r !== me).concat([me]);
  order.forEach((r) => {
    const run = r.runner;
    const px = sx(run.x);
    if (px < -80 || px > width + 80) return;
    const tick = run.tick;
    const footY = sy(run.y);
    ctx.save();
    ctx.globalAlpha = r === me ? 1 : 0.8;
    if (tick < run.carUntil) drawCar(ctx, px, footY, scale * 0.9);
    ctx.translate(px, footY - (SPRITE_H * scale) / 2);
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

  // Bush's bleeding eye: a splatter over your screen.
  if (engine.me && me.runner.tick < me.runner.blindUntil) {
    const left2 = (me.runner.blindUntil - me.runner.tick) / EFFECT.blind;
    ctx.fillStyle = `rgba(170, 0, 20, ${0.75 * Math.min(1, left2 * 1.5)})`;
    [[0.55, 0.35, 0.22], [0.75, 0.55, 0.16], [0.4, 0.6, 0.12], [0.85, 0.25, 0.1]].forEach(([cx, cy, r]) => {
      ctx.beginPath();
      ctx.arc(width * cx, height * cy, Math.min(width, height) * r * 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

const KIND_SOUND = { horseshoe: 0, bionic: 1, eye: 2, potion: 3, seven: 4, shield: 5, car: 6, spit: 7, oip: 8, dew: 9 };

/**
 * The race screen. Tap (or space) to jump, the item button (or E) to use what you're holding.
 * `onDone(order)` gets everyone in finishing order. `hooksRef.current` is given { receiveInputs, receiveAttack }
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
      setCallouts((list) => [...list.slice(-2), { id, text, crew: item.crew }]);
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
      onDone(standings(engine.racers.map((r) => r.runner)).map((run) => engine.racers.find((r) => r.runner === run)));
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
        const height = Math.max(260, Math.min(440, Math.round(width * 0.62)));
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
    <div className="race-game">
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
            style={{ left: `${progressOf(r.runner) * 94}%` }}
          />
        ))}
      </div>
      <div className="race-hud">
        <span>{me ? <><strong>{ordinal(placing)}</strong> of {engine.racers.length}</> : 'Watching'}</span>
        <span><strong>{seconds}</strong>s</span>
        <span>{me?.runner.finishTick != null ? 'Finished!' : `${Math.round(progressOf(me?.runner || engine.racers[0].runner) * 100)}%`}</span>
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
        {phase === 'countdown' && <div className="game-overlay"><span className="game-countdown">{count || 'Go!'}</span></div>}
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
