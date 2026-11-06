import React, { useCallback, useEffect, useState } from 'react';
import { CREW } from '../data/crew';
import { buildUp, guySound, playSong, soundLocked, taDa } from '../sound/crewSound';
import './CrewIntro.css';

const TITLE_MS = 1600;
const GUY_MS = 3200;
const LINEUP_MS = 3600;
const WAIT_FOR_TAP_MS = 5000;

// Plays every time the signed-out screen opens (after sign out or a refresh); Skip or tap through it.
// Opening scene: a title card, then each guy steps out doing his bit and saying his line, then the whole crew lines up.
// Steps: -1 title, 0..CREW.length-1 one guy each, CREW.length the lineup.
const CrewIntro = ({ onDone }) => {
  const [step, setStep] = useState(-1);
  // Browsers only allow sound after a tap, so the title waits a moment for one ("Tap for sound").
  const [waitingForTap, setWaitingForTap] = useState(soundLocked);

  const finish = useCallback(() => onDone(), [onDone]);

  const next = useCallback(() => {
    if (step < 0 && waitingForTap) setWaitingForTap(false);
    else if (step >= CREW.length) finish();
    else setStep(step + 1);
  }, [step, finish, waitingForTap]);

  useEffect(() => {
    const wait = step < 0 ? (waitingForTap ? WAIT_FOR_TAP_MS : TITLE_MS) : step < CREW.length ? GUY_MS : LINEUP_MS;
    const timer = setTimeout(next, wait);
    return () => clearTimeout(timer);
  }, [step, next, waitingForTap]);

  // Drum-roll build-up on the title, the theme plus each guy's own sound, then a ta-da on the lineup.
  useEffect(() => {
    if (step < 0) {
      playSong(null);
      if (!waitingForTap) buildUp(TITLE_MS);
    } else if (step < CREW.length) {
      playSong('intro');
      guySound(step);
    } else {
      playSong(null);
      taDa();
    }
  }, [step, waitingForTap]);

  const guy = step >= 0 && step < CREW.length ? CREW[step] : null;

  return (
    <div className="crew-intro" role="dialog" aria-label="Meet the Hood League" onClick={next}>
      <button
        type="button"
        className="crew-intro-skip"
        onClick={(event) => { event.stopPropagation(); finish(); }}
      >
        Skip
      </button>

      {step < 0 && (
        <div className="crew-intro-title" key="title">
          <p>Hood League presents</p>
          <h1>The Crew</h1>
          {waitingForTap && <p className="crew-intro-hint">Tap for sound</p>}
        </div>
      )}

      {guy && (
        <div className="crew-intro-stage" key={step}>
          <p className="crew-intro-count">{step + 1} of {CREW.length}</p>
          <div className="crew-intro-spot">
            <img className="crew-intro-guy" src={guy.bit} alt="" />
          </div>
          <div className="crew-intro-card">
            <h2>{guy.name}</h2>
            {guy.says && <p className="crew-intro-says">{guy.says}</p>}
          </div>
        </div>
      )}

      {step >= CREW.length && (
        <div className="crew-intro-lineup" key="lineup">
          <h2>The Hood League</h2>
          <div className="crew-intro-row">
            {CREW.map((member, index) => (
              <figure key={member.name + index} style={{ animationDelay: `${index * 70}ms` }}>
                <img src={member.art} alt="" />
                <figcaption>{member.name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="crew-intro-hint">Tap to start</p>
        </div>
      )}
    </div>
  );
};

export default CrewIntro;
