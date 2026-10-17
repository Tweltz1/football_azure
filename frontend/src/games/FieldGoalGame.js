import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { guySound, taDa } from '../sound/crewSound';
import {
  aimAt, FIELD_GOAL, fieldGoalScore, fieldGoalStart, fieldGoalStep, fieldGoalTolerance, powerAt, powerNeeded,
} from './sim.generated';
import { useFixedLoop } from './gameRunners';

const MICHAEL = 4;

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
      if (s.kicks[s.kicks.length - 1].result === 'good') taDa(); else guySound(MICHAEL);
    }
    if (s.phase === 'over') {
      setPhase('over');
      const made = s.kicks.filter((k) => k.result === 'good').length;
      onEnd(inputsRef.current, fieldGoalScore(s), `${made} made`);
      return false;
    }
    return true;
  });

  const s = stateRef.current;
  const since = s ? s.tick - s.phaseStart : 0;
  const kick = s ? s.kicks[s.kicks.length - 1] : null;
  const showFlight = s && (s.phase === 'flight' || s.phase === 'over') && kick;
  const flight = showFlight ? Math.min(1, since / (FIELD_GOAL.flightTicks * 0.6)) : 0;
  const tol = s ? fieldGoalTolerance(s.distance) : 0.5;
  // Uprights sit at +-tol on a -1..1 field drawn 300 wide; the ball crosses at its drift.
  const postX = (v) => 150 + v * 120;
  const aimValue = s && s.phase === 'aim' ? aimAt(since, s.kick) : s ? s.aim : 0;
  const powerValue = s && s.phase === 'power' ? powerAt(since, s.kick) : kick && s.phase !== 'aim' ? kick.power : 0;
  const ballX = showFlight ? 150 + (postX(kick.drift) - 150) * flight : 150;
  const ballY = showFlight ? 170 - (kick.result === 'short' ? 70 : 140) * flight + (kick.result === 'short' ? 40 * flight * flight : 0) : 170;

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
          <ellipse cx={ballX} cy={ballY} rx={7 - 3 * flight} ry={4.5 - 2 * flight} fill="#8a4b20" stroke="#16122b" strokeWidth="1.5" />
        </svg>
        <img className="fg-holder" src={CREW[MICHAEL].art} alt="" />
        {showFlight && since > 14 && (
          <div className={`fg-result is-${kick.result === 'good' ? 'good' : 'miss'}`}>
            {kick.result === 'good' ? `It's good from ${kick.distance}!` : kick.result === 'short' ? 'Short!' : `No good, ${kick.result}!`}
          </div>
        )}
        {phase === 'ready' && (
          <div className="game-overlay is-setup" onPointerDown={(e) => e.stopPropagation()}>
            <p>Michael's holding. Don't make him look bad.</p>
            <button type="button" className="game-go" onClick={begin}>Line it up</button>
            <p className="game-hint">Tap once to stop the aim (mind the wind), then again to stop the power.</p>
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
            <span className="fg-meter-need" style={{ left: `${(s ? powerNeeded(s.distance) : 0.3) * 100}%` }} />
            <span className="fg-meter-hook" />
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
