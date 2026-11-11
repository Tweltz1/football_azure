import React, { useEffect, useMemo, useRef } from 'react';
import { lookCode, randomLook } from '../look';
import { isMuted } from '../sound';

// Shared pieces for the animated how-to-play intros: timing helpers, the narrator, the cast, and the
// frame with captions, a progress bar and the skip button.

export const clamp = (v) => Math.max(0, Math.min(1, v));
export const ease = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
export const between = (t, a, b) => t >= a && t < b;

export const speak = (text) => {
  try {
    if (isMuted() || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 0.85;
    window.speechSynthesis.speak(u);
  } catch (error) { /* no narrator */ }
};

/** The first few people in the room, topped up with made-up monsters-in-costume if the room is small. */
export const useCast = (players, count = 3) => useMemo(() => {
  const list = players.slice(0, count).map((p) => ({ name: p.name, look: p.look }));
  const fill = ['Boo', 'Spooks', 'Mort', 'Fang'];
  while (list.length < count) list.push({ name: fill[list.length], look: lookCode({ ...randomLook(), costume: 1 + list.length }) });
  return list;
}, [players, count]);

/** Plays each sound once when the intro reaches its time. */
export const useCues = (t, cues) => {
  const played = useRef(new Set());
  cues.forEach(([key, at, play]) => {
    if (t >= at && !played.current.has(key)) { played.current.add(key); play(); }
  });
};

/** scenes: [{ at, step, title, say }]. The first and last are big title cards. */
export function HowToFrame({ scenes, t, total, gameTitle, onSkip, children }) {
  const sceneIndex = scenes.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const scene = scenes[sceneIndex];
  const spoken = useRef(-1);
  useEffect(() => {
    if (spoken.current === sceneIndex) return;
    spoken.current = sceneIndex;
    speak(scene.say);
  }, [sceneIndex, scene.say]);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch (error) { /* ignore */ } }, []);
  const title = sceneIndex === 0 || sceneIndex === scenes.length - 1;
  return (
    <div className="lc-howto">
      {children}
      <div className={`lc-howto-caption${title ? ' is-title' : ''}`} key={sceneIndex}>
        {title && <h2 className="lc-title">{sceneIndex === 0 ? gameTitle : scene.title}</h2>}
        {sceneIndex === 0 && <p>How to play</p>}
        {!title && <p><span className="lc-howto-step">{scene.step}</span>{scene.title}</p>}
      </div>
      <div className="lc-howto-bar"><span style={{ width: `${clamp(t / total) * 100}%` }} /></div>
      <button type="button" className="lc-btn lc-howto-skip" onClick={onSkip}>Skip intro ⏭</button>
    </div>
  );
}
