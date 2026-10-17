import React, { useEffect, useRef, useState } from 'react';
import { CREW } from '../data/crew';
import { guySound, taDa } from '../sound/crewSound';
import { penaltyColumn, penaltyHigh, swing } from './sim.generated';
import { errorText, useCountdown } from './gameRunners';

const CHROME = 5;
const ZONES = [0, 1, 2, 3, 4, 5];

/** The penalty kick screen: pick a corner, then stop the power meter. */
const PenaltyTurn = ({ disabled, result, onAnswer }) => {
  const [zone, setZone] = useState(null);
  const [power, setPower] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (zone == null || result) return undefined;
    startRef.current = performance.now();
    let raf = 0;
    const loop = (now) => {
      setPower((swing((now - startRef.current) / (1000 / 30), 44) + 1) / 2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [zone, result]);

  const keeper = result?.keeper;
  const keeperLeft = keeper ? [18, 50, 82][keeper.column] : 50;
  const shotZone = zone ?? 4;
  const ballLeft = result ? [17, 50, 83][penaltyColumn(shotZone)] + (result.outcome === 'wide' ? (penaltyColumn(shotZone) === 0 ? -14 : 14) : 0) : 50;
  const ballTop = result ? (result.outcome === 'over the bar' ? -8 : penaltyHigh(shotZone) ? 25 : 70) : 118;

  return (
    <div className="pk-turn">
      <div className="pk-goal">
        {ZONES.map((z) => (
          <button
            key={z}
            type="button"
            className={`pk-zone${zone === z ? ' is-picked' : ''}`}
            disabled={disabled || zone != null}
            onClick={() => setZone(z)}
            aria-label={`${penaltyHigh(z) ? 'Top' : 'Bottom'} ${['left', 'middle', 'right'][penaltyColumn(z)]}`}
          />
        ))}
        <img
          className={`pk-keeper${keeper ? ' has-dived' : ''}${keeper?.high ? ' is-high' : ''}`}
          src={CREW[CHROME].art}
          alt=""
          style={{ left: `${keeperLeft}%`, transform: `translateX(-50%) rotate(${keeper ? [-50, 0, 50][keeper.column] : 0}deg)` }}
        />
        <span className={`pk-ball${result ? ' is-shot' : ''}`} style={{ left: `${ballLeft}%`, top: `${ballTop}%` }} />
      </div>
      {zone == null && !result && <p className="game-hint">Pick a spot to shoot at.</p>}
      {zone != null && !result && (
        <div className="pk-power">
          <div className="fg-meter is-power is-live">
            <span className="fg-meter-label">Power</span>
            <div className="fg-meter-track">
              <span className="pk-sweet" />
              <span className="fg-meter-fill" style={{ width: `${power * 100}%` }} />
            </div>
          </div>
          <button type="button" className="game-go" disabled={disabled} onClick={() => onAnswer({ zone, power })}>Shoot!</button>
          <p className="game-hint">Too soft gets saved; too hard on a top corner sails over the bar.</p>
        </div>
      )}
    </div>
  );
};

const PriceTurn = ({ turn, disabled, result, onAnswer }) => {
  const [guess, setGuess] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const value = parseFloat(guess);
    if (Number.isFinite(value) && value >= 0) onAnswer(value);
  };
  return (
    <form className="trivia-turn" onSubmit={submit}>
      <p className="trivia-name">{turn.name}</p>
      <p className="trivia-meta">{turn.position} · {turn.team} · {turn.games} games in {turn.season}</p>
      <p className="trivia-ask">How many PPR fantasy points did he score?</p>
      {!result && (
        <div className="trivia-guess">
          <input type="number" inputMode="decimal" min="0" step="0.1" value={guess} onChange={(e) => setGuess(e.target.value)} autoFocus aria-label="Your guess" />
          <button type="submit" className="game-go" disabled={disabled || guess === ''}>Lock it in</button>
        </div>
      )}
    </form>
  );
};

const NameTurn = ({ turn, disabled, result, onAnswer }) => {
  const [picked, setPicked] = useState(null);
  return (
    <div className="trivia-turn">
      <p className="trivia-meta">Mystery {turn.position} · {turn.games} games in {turn.season}</p>
      <p className="trivia-clue">{turn.clue}</p>
      <div className="trivia-choices">
        {turn.choices.map((name, index) => (
          <button
            key={name}
            type="button"
            className={`${picked === index ? 'is-picked' : ''}${result && result.answer === name ? ' is-right' : ''}`}
            disabled={disabled || !!result}
            onClick={() => { setPicked(index); onAnswer(index); }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Penalty Kicks, Price Is Right and Name That Player: one turn at a time from `runner` (see gameRunners.js).
 * `onEnd(score, detail)` runs after the last turn.
 */
const TurnGame = ({ game, runner, onEnd }) => {
  const [turn, setTurn] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const shownAt = useRef(0);

  const show = (body) => {
    if (body.finished) {
      setOver(true);
      onEnd(body.score ?? 0);
      return;
    }
    setTurn(body.turn);
    setElapsed(body.elapsed || 0);
    setResult(null);
    shownAt.current = performance.now() - (body.elapsed || 0) * 1000;
  };

  useEffect(() => {
    let live = true;
    runner.start().then((body) => {
      if (!live) return;
      setScore((body.points || []).reduce((a, b) => a + b, 0));
      show(body);
    }).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  const left = useCountdown(!!turn && !result && !over, turn?.seconds || 0, elapsed, turn?.index);

  const answer = async (value) => {
    if (busy || !turn) return;
    setBusy(true);
    setError('');
    try {
      const body = await runner.turn(turn.index, value, (performance.now() - shownAt.current) / 1000);
      setResult(body.result);
      setScore(body.score ?? 0);
      if (body.result.points > 0) taDa(); else guySound(game === 'penalty' ? CHROME : 0);
      if (body.finished) {
        setOver(true);
        onEnd(body.score ?? 0);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // When the clock runs out, send whatever is there (it scores nothing).
  useEffect(() => {
    if (turn && !result && !busy && left <= 0) answer(game === 'penalty' ? { zone: 4, power: 0 } : game === 'price' ? -1 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const next = async () => {
    setBusy(true);
    try {
      show(await runner.next());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !turn) return <p className="game-error">{error}</p>;
  if (!turn) return <p className="game-hint">Dealing...</p>;

  const Body = game === 'penalty' ? PenaltyTurn : game === 'price' ? PriceTurn : NameTurn;
  return (
    <div className={`turn-game is-${game}`}>
      <div className="game-hud">
        <span>{game === 'penalty' ? 'Kick' : 'Question'} <strong>{turn.index + 1}</strong> of {turn.of}</span>
        <span className={left < 5 && !result ? 'is-hurry' : ''}><strong>{Math.ceil(left)}</strong>s</span>
        <span>Score <strong>{score}</strong></span>
      </div>
      {!result && <div className="turn-clock"><span style={{ width: `${(left / turn.seconds) * 100}%` }} /></div>}
      <Body key={turn.index} turn={turn} disabled={busy || over} result={result} onAnswer={answer} />
      {result && (
        <div className={`turn-result${result.points > 0 ? ' is-good' : ''}`}>
          <p>{result.message}</p>
          {!over && <button type="button" className="game-go" onClick={next} disabled={busy}>Next</button>}
        </div>
      )}
      {error && <p className="game-error">{error}</p>}
    </div>
  );
};

export default TurnGame;
