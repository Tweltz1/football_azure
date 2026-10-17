import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { guySound, taDa } from '../sound/crewSound';
import { CLIMB, climbScore, climbStart, climbStep } from './sim.generated';
import { readClimber, saveClimber, useFixedLoop } from './gameRunners';
import climbScene from '../assets/climb-scene.svg';

// Connor's red '57, rolling down the mountain.
const Car57 = () => (
  <svg viewBox="0 0 120 60" className="climb-car" aria-hidden="true">
    <path d="M8 40 L14 26 L38 24 L52 12 L84 12 L98 24 L112 28 L114 42 Z" fill="#d7263d" stroke="#16122b" strokeWidth="4" strokeLinejoin="round" />
    <path d="M56 16 L80 16 L90 25 L48 25 Z" fill="#bfe3ff" stroke="#16122b" strokeWidth="3" />
    <rect x="6" y="38" width="110" height="7" rx="3" fill="#e8e8e8" stroke="#16122b" strokeWidth="3" />
    <circle cx="32" cy="46" r="10" fill="#222" stroke="#16122b" strokeWidth="3" /><circle cx="32" cy="46" r="4" fill="#ddd" />
    <circle cx="92" cy="46" r="10" fill="#222" stroke="#16122b" strokeWidth="3" /><circle cx="92" cy="46" r="4" fill="#ddd" />
    <text x="66" y="37" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">57</text>
  </svg>
);

const hitLine = (state) => {
  if (state.hitBy === 'car') return "Run over by Connor's '57!";
  if (state.hitBy === 'chrome') return 'Taken out by the pink dress!';
  if (state.hitBy === 'guy') {
    const guy = state.objects.find((o) => o.kind === 'guy' && o.lane === state.lane && o.y + CLIMB.objectSize > CLIMB.playerTop && o.y < CLIMB.playerBottom);
    return `Knocked off the mountain by ${CREW[guy ? guy.art : 0].name}!`;
  }
  return 'You reached the top of the clock!';
};

/**
 * The Climb Dash. Tap the left or right side (or use the arrow keys) to change lanes. The run is
 * recorded as [tick, lane] inputs; `onEnd(inputs, score, detail)` gets them when the climber falls.
 */
const ClimbGame = ({ seed, onEnd }) => {
  const [climber, setClimber] = useState(readClimber);
  const [phase, setPhase] = useState('ready');
  const stateRef = useRef(null);
  const inputsRef = useRef([]);
  const pendingLane = useRef(null);
  const [countdown, setCountdown] = useState(3);

  const begin = () => {
    stateRef.current = climbStart(seed);
    inputsRef.current = [];
    pendingLane.current = null;
    setCountdown(3);
    setPhase('countdown');
  };

  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    if (countdown <= 0) { setPhase('playing'); return undefined; }
    const id = setTimeout(() => setCountdown((n) => n - 1), 700);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  const move = useCallback((delta) => {
    const s = stateRef.current;
    if (!s || phase !== 'playing') return;
    const from = pendingLane.current ?? s.lane;
    pendingLane.current = Math.max(0, Math.min(CLIMB.lanes - 1, from + delta));
  }, [phase]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'a') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight' || event.key === 'd') { event.preventDefault(); move(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  useFixedLoop(phase === 'playing', () => {
    const s = stateRef.current;
    let lane = null;
    if (pendingLane.current != null && pendingLane.current !== s.lane) {
      lane = pendingLane.current;
      inputsRef.current.push([s.tick, lane]);
    }
    pendingLane.current = null;
    const oipsBefore = s.oips;
    climbStep(s, lane);
    if (s.oips > oipsBefore) guySound(8);
    if (!s.alive) {
      if (s.hitBy === 'car') guySound(6); else if (s.hitBy === 'chrome') guySound(5); else taDa();
      setPhase('over');
      onEnd(inputsRef.current, climbScore(s), `${Math.floor(s.height)} ft, ${s.oips} OIP${s.oips === 1 ? '' : 's'}`);
      return false;
    }
    return true;
  });

  const s = stateRef.current;
  const onStageTap = (event) => {
    if (phase !== 'playing') return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX ?? event.clientX) - box.left;
    move(x < box.width / 2 ? -1 : 1);
  };

  return (
    <div className="climb-game">
      <div className="game-hud">
        <span><strong>{s ? Math.floor(s.height) : 0}</strong> ft</span>
        <span><strong>{s ? s.oips : 0}</strong> OIP</span>
        <span>Score <strong>{s ? climbScore(s) : 0}</strong></span>
      </div>
      <div
        className="climb-stage"
        onPointerDown={onStageTap}
        role="application"
        aria-label="Climb Dash. Tap left or right to change lanes."
      >
        <img className="climb-bg" src={climbScene} alt="" style={{ transform: `translateY(${s ? (s.height * 3) % 40 : 0}px)` }} />
        <div className="climb-lanes" aria-hidden="true"><span /><span /></div>
        {s && s.objects.map((o) => (
          <div
            key={o.id}
            className={`climb-object is-${o.kind}`}
            style={{ left: `${(o.lane * 100) / 3}%`, top: `${o.y}%`, height: `${CLIMB.objectSize}%` }}
          >
            {o.kind === 'car' ? <Car57 /> : o.kind === 'oip' ? <span className="climb-oip">OIP!</span> : <img src={CREW[o.art].art} alt="" />}
          </div>
        ))}
        <div
          className={`climb-player${s && !s.alive ? ' is-falling' : ''}`}
          style={{ left: `${((s ? s.lane : 1) * 100) / 3}%`, top: `${CLIMB.playerTop}%`, height: `${CLIMB.playerBottom - CLIMB.playerTop}%` }}
        >
          <img src={CREW[climber].art} alt="" />
        </div>
        {phase === 'countdown' && <div className="game-overlay"><span className="game-countdown">{countdown || 'Go!'}</span></div>}
        {phase === 'over' && s && (
          <div className="game-overlay">
            <p className="game-over-line">{hitLine(s)}</p>
            <p className="game-over-score">{climbScore(s)} points</p>
          </div>
        )}
        {phase === 'ready' && (
          <div className="game-overlay is-setup" onPointerDown={(e) => e.stopPropagation()}>
            <p>Pick your climber</p>
            <div className="climber-picks">
              {CREW.map((guy, index) => (
                <button
                  key={guy.name}
                  type="button"
                  className={index === climber ? 'is-picked' : ''}
                  onClick={() => { setClimber(index); saveClimber(index); }}
                  aria-pressed={index === climber}
                >
                  <img src={guy.art} alt="" />
                  <span>{guy.name}</span>
                </button>
              ))}
            </div>
            <button type="button" className="game-go" onClick={begin}>Start climbing</button>
            <p className="game-hint">Tap left or right (or arrow keys) to switch lanes.</p>
          </div>
        )}
      </div>
      <div className="climb-buttons">
        <button type="button" onPointerDown={() => move(-1)} aria-label="Move left">◀</button>
        <button type="button" onPointerDown={() => move(1)} aria-label="Move right">▶</button>
      </div>
    </div>
  );
};

export default ClimbGame;
