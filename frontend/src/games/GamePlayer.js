import React, { useEffect, useRef, useState } from 'react';
import { GAMES } from './sim.generated';
import ClimbGame from './ClimbGame';
import FieldGoalGame from './FieldGoalGame';
import ShredGame from './ShredGame';
import TurnGame from './TurnGame';
import { errorText, saveBest } from './gameRunners';

/**
 * Plays one game with a runner (practice or an official lobby try) and shows the final score.
 * `onDone()` closes it; `onAgain` (practice only) starts a fresh game.
 */
const GamePlayer = ({ game, runner, onDone, onAgain }) => {
  const info = GAMES[game];
  const [seed, setSeed] = useState(null);
  const [final, setFinal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const topRef = useRef(null);

  // On a phone, start with the game at the top of the screen.
  useEffect(() => {
    topRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (info.style !== 'skill') return undefined;
    let live = true;
    runner.start()
      .then((body) => {
        if (!live) return;
        if (body.finished) setFinal({ score: body.score, detail: body.detail, already: true });
        else setSeed(body.seed);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [runner, info.style]);

  const finishSkill = async (inputs, score, detail) => {
    if (!runner.official && !runner.ranked) {
      setFinal({ score, detail, best: saveBest(game, score) });
      return;
    }
    setSaving(true);
    try {
      const body = await runner.finish(inputs);
      setFinal({ score: body.score, detail: body.detail, board: body.board, best: !runner.official && saveBest(game, body.score) });
    } catch (e) {
      if (runner.official) setError(`Your run didn't save: ${errorText(e)}`);
      else setFinal({ score, detail, best: saveBest(game, score), unsaved: errorText(e) });
    } finally {
      setSaving(false);
    }
  };

  const finishTurns = (score, board) => {
    setFinal({ score, board, best: runner.official ? false : saveBest(game, score) });
  };

  return (
    <div className="game-player" ref={topRef}>
      <div className="game-player-head">
        <h3>{info.title}</h3>
        {runner.official ? <span className="game-badge is-official">Official try</span> : <span className="game-badge">Practice</span>}
      </div>
      {info.style === 'skill' && seed != null && game === 'climb' && <ClimbGame seed={seed} onEnd={finishSkill} />}
      {info.style === 'skill' && seed != null && game === 'shred' && <ShredGame seed={seed} onEnd={finishSkill} />}
      {info.style === 'skill' && seed != null && game === 'fieldgoal' && <FieldGoalGame seed={seed} onEnd={finishSkill} />}
      {info.style === 'turns' && <TurnGame game={game} runner={runner} onEnd={finishTurns} />}
      {saving && <p className="game-hint">Saving your score...</p>}
      {error && <p className="game-error">{error}</p>}
      {final && (
        <div className="game-final">
          <p>
            {final.already ? 'You already played this one: ' : 'Final: '}
            <strong>{final.score} {info.unit}</strong>{final.detail ? ` (${final.detail})` : ''}
            {final.best && <span className="game-best"> New best!</span>}
          </p>
          {final.board && (
            <p className="game-hint">
              {final.board.newBest ? 'Saved to the leaderboard. ' : `Your best is still ${final.board.best} ${info.unit}. `}
              You're <strong>#{final.board.rank}</strong> on the {info.title} board.
            </p>
          )}
          {final.unsaved && <p className="game-hint">Not saved to the leaderboard: {final.unsaved}</p>}
        </div>
      )}
      <div className="game-player-actions">
        {onAgain && final && <button type="button" className="game-go" onClick={onAgain}>Play again</button>}
        <button type="button" className="game-secondary" onClick={onDone} disabled={saving}>
          {final || error ? 'Done' : runner.official ? (info.style === 'skill' ? 'Leave (uses your try)' : 'Leave for now') : 'Quit'}
        </button>
      </div>
    </div>
  );
};

export default GamePlayer;
