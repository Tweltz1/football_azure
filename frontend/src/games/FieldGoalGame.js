import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { guySound, taDa } from '../sound/crewSound';
import {
  aimAt, FIELD_GOAL, fieldGoalScore, fieldGoalStart, fieldGoalStep, fieldGoalTolerance, kickMade, powerAt, powerLimit,
  powerNeeded,
} from './sim.generated';
import { useFixedLoop } from './gameRunners';

const MICHAEL = 4;

const resultText = (kick) => {
  switch (kick.result) {
    case 'good': return `It's good from ${kick.distance}!`;
    case 'doink in': return kick.post === 'bar' ? 'Doink off the crossbar... and over! Good!' : 'DOINK! Off the post and in!';
    case 'doink out': return kick.post === 'bar' ? 'Doink off the crossbar. No good!' : 'DOINK! Off the upright. No good!';
    case 'short': return 'Short!';
    case 'shank': return 'Way too much leg. Shanked it!';
    default: return `No good, ${kick.result}!`;
  }
};

/** Where the ball is, 0-1 through its flight: the aim takes it straight, the wind curves it. */
function ballSpot(kick, since, postX) {
  const F = FIELD_GOAL.flightTicks;
  const t = Math.min(1, since / (F * 0.6));
  const curve = kick.drift - kick.aim;
  let x = postX(kick.aim * t + curve * t * t);
  const rise = kick.result === 'short' ? 70 : kick.post === 'bar' ? 75 : kick.post ? 105 : 140;
  let y = 170 - rise * t + (kick.result === 'short' ? 40 * t * t : 0);
  let size = 1 - 0.45 * t;
  if (kick.post && since > F * 0.6) {
    // Off the iron: a bounce in (through) or back out.
    const b = Math.min(1, (since - F * 0.6) / (F * 0.4));
    const through = kick.result === 'doink in';
    if (kick.post === 'bar') {
      y += through ? -30 * b + 20 * b * b : -12 * b + 70 * b * b;
      size += through ? -0.1 * b : 0.25 * b;
    } else {
      const toward = (kick.post === 'left' ? 1 : -1) * (through ? 1 : -1);
      x += toward * 34 * b;
      y += -14 * b + (through ? 30 : 60) * b * b;
      size += through ? -0.1 * b : 0.2 * b;
    }
  }
  return { x, y, size };
}

const windLabel = (wind) => {
  const mph = Math.round(Math.abs(wind) * 15);
  if (mph === 0) return 'No wind';
  return `${mph} mph ${wind < 0 ? '← blowing left' : 'blowing right →'}`;
};

/**
 * Field Goal Gauntlet. Tap (or space) once to lock the aim, again to lock the power. Taps are recorded
 * as [tick, 1] inputs; `onEnd(inputs, score, detail)` gets them after the first miss.
 */
const FieldGoalGame = ({ seed, onEnd }) => {
  const [phase, setPhase] = useState('ready');
  const stateRef = useRef(null);
  const inputsRef = useRef([]);
  const tapRef = useRef(false);

  const begin = () => {
    stateRef.current = fieldGoalStart(seed);
    inputsRef.current = [];
    tapRef.current = false;
    setPhase('playing');
  };

  const tap = useCallback(() => {
    if (phase === 'playing') tapRef.current = true;
  }, [phase]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tap]);

  useFixedLoop(phase === 'playing', () => {
    const s = stateRef.current;
    const tapped = tapRef.current && (s.phase === 'aim' || s.phase === 'power');
    tapRef.current = false;
    if (tapped) inputsRef.current.push([s.tick, 1]);
    const kicksBefore = s.kicks.length;
    fieldGoalStep(s, tapped);
    if (s.kicks.length > kicksBefore) {
      if (kickMade(s.kicks[s.kicks.length - 1].result)) taDa(); else guySound(MICHAEL);
    }
    if (s.phase === 'over') {
      setPhase('over');
      const made = s.kicks.filter((k) => kickMade(k.result)).length;
      onEnd(inputsRef.current, fieldGoalScore(s), `${made} made`);
      return false;
    }
    return true;
  });

  const s = stateRef.current;
  const since = s ? s.tick - s.phaseStart : 0;
  const kick = s ? s.kicks[s.kicks.length - 1] : null;
  const showFlight = s && (s.phase === 'flight' || s.phase === 'over') && kick;
  const tol = s ? fieldGoalTolerance(s.distance) : 0.5;
  // Uprights sit at +-tol on a -1..1 field drawn 300 wide; the ball crosses at its drift.
  const postX = (v) => 150 + v * 120;
  const aimValue = s && s.phase === 'aim' ? aimAt(since, s.kick) : s ? s.aim : 0;
  const powerValue = s && s.phase === 'power' ? powerAt(since, s.kick) : kick && s.phase !== 'aim' ? kick.power : 0;
  const ball = showFlight ? ballSpot(kick, since, postX) : { x: 150, y: 170, size: 1 };
  const doinked = showFlight && kick.post && since > FIELD_GOAL.flightTicks * 0.6;
  const need = s ? powerNeeded(s.distance) : 0.3;
  const limit = s ? powerLimit(s.distance, s.kick) : 0.6;

  return (
    <div className="fg-game">
      <div className="game-hud">
        <span><strong>{s ? s.distance : 20}</strong> yd kick</span>
        <span>{s ? windLabel(s.wind) : 'Wind'}</span>
        <span>Best <strong>{s ? fieldGoalScore(s) : 0}</strong> yd</span>
      </div>
      <div className="fg-stage" onPointerDown={tap} role="application" aria-label="Field goal. Tap to aim, then tap for power.">
        <svg viewBox="0 0 300 210" className="fg-field" aria-hidden="true">
          <defs>
            <linearGradient id="fgSky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1b2140" /><stop offset="1" stopColor="#2c3a6b" /></linearGradient>
          </defs>
          <rect width="300" height="120" fill="url(#fgSky)" />
          <polygon points="0,210 300,210 220,110 80,110" fill="#2f7d3b" />
          {[0, 1, 2, 3].map((i) => <line key={i} x1={40 + i * 8} y1={210 - i * 25} x2={260 - i * 8} y2={210 - i * 25} stroke="#ffffff33" strokeWidth="2" />)}
          <line x1={postX(-tol)} y1="40" x2={postX(-tol)} y2="95" stroke="#f5d33a" strokeWidth="4" />
          <line x1={postX(tol)} y1="40" x2={postX(tol)} y2="95" stroke="#f5d33a" strokeWidth="4" />
          <line x1={postX(-tol)} y1="95" x2={postX(tol)} y2="95" stroke="#f5d33a" strokeWidth="4" />
          <line x1="150" y1="95" x2="150" y2="118" stroke="#f5d33a" strokeWidth="4" />
          {s && s.wind !== 0 && (
            <g transform={`translate(150 22) scale(${s.wind < 0 ? -1 : 1} 1)`} opacity="0.85">
              <line x1="-30" y1="0" x2={-30 + 60 * Math.min(1, Math.abs(s.wind) + 0.2)} y2="0" stroke="#bfe3ff" strokeWidth="3" />
              <polygon points={`${-30 + 60 * Math.min(1, Math.abs(s.wind) + 0.2)},-6 ${-22 + 60 * Math.min(1, Math.abs(s.wind) + 0.2)},0 ${-30 + 60 * Math.min(1, Math.abs(s.wind) + 0.2)},6`} fill="#bfe3ff" />
            </g>
          )}
          {doinked && since < FIELD_GOAL.flightTicks * 0.85 && (
            <text x={kick.post === 'bar' ? 150 : postX(kick.post === 'left' ? -tol : tol)} y={kick.post === 'bar' ? 86 : 50} textAnchor="middle" fontSize="16" fontWeight="900" fill="#ffd23f" stroke="#16122b" strokeWidth="3" paintOrder="stroke">DOINK!</text>
          )}
          <ellipse cx={ball.x} cy={ball.y} rx={7 * ball.size} ry={4.5 * ball.size} fill="#8a4b20" stroke="#16122b" strokeWidth="1.5" />
        </svg>
        <img className="fg-holder" src={CREW[MICHAEL].art} alt="" />
        {showFlight && since > (kick.post ? FIELD_GOAL.flightTicks * 0.75 : 14) && (
          <div className={`fg-result is-${kick.post ? 'doink' : kickMade(kick.result) ? 'good' : 'miss'}`}>
            {resultText(kick)}
          </div>
        )}
        {phase === 'ready' && (
          <div className="game-overlay is-setup" onPointerDown={(e) => e.stopPropagation()}>
            <p>Michael's holding. Don't make him look bad.</p>
            <button type="button" className="game-go" onClick={begin}>Line it up</button>
            <p className="game-hint">Tap once to stop the aim (the wind will curve it), then stop the power in the green. Too much leg shanks it.</p>
          </div>
        )}
      </div>
      <div className="fg-meters" onPointerDown={tap}>
        <div className={`fg-meter is-aim${s && s.phase === 'aim' ? ' is-live' : ''}`}>
          <span className="fg-meter-label">Aim</span>
          <div className="fg-meter-track">
            <span className="fg-meter-window" style={{ left: `${50 - tol * 50}%`, width: `${tol * 100}%` }} />
            <span className="fg-meter-needle" style={{ left: `${50 + aimValue * 50}%` }} />
          </div>
        </div>
        <div className={`fg-meter is-power${s && s.phase === 'power' ? ' is-live' : ''}`}>
          <span className="fg-meter-label">Power</span>
          <div className="fg-meter-track">
            <span className="fg-meter-zone" style={{ left: `${need * 100}%`, width: `${(limit - need) * 100}%` }} />
            {limit < 1 && <span className="fg-meter-shank" style={{ left: `${limit * 100}%` }} />}
            <span className="fg-meter-fill" style={{ width: `${powerValue * 100}%` }} />
          </div>
        </div>
        <button type="button" className="game-go fg-tap" disabled={!s || (s.phase !== 'aim' && s.phase !== 'power')}>
          {s && s.phase === 'power' ? 'Kick!' : 'Lock aim'}
        </button>
      </div>
    </div>
  );
};

export default FieldGoalGame;
