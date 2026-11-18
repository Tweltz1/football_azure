import React, { useEffect, useMemo } from 'react';
import { applyThemeLook, LOOKS, season } from './season';
import './themeLook.css';

applyThemeLook();

/** The theme's little things drifting down behind a home screen. Put it first inside the page. */
export default function ThemeSky({ count = 16 }) {
  useEffect(() => { applyThemeLook(); }, []);
  const bits = useMemo(() => {
    const sky = LOOKS[season()].sky;
    return Array.from({ length: count }, (_, i) => ({
      ch: sky[i % sky.length],
      left: (i * 61) % 100,
      size: 14 + ((i * 7) % 16),
      dur: 9 + ((i * 5) % 9),
      delay: -((i * 1.7) % 14),
    }));
  }, [count]);
  return (
    <div className="hg-sky" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, fontSize: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>{b.ch}</span>
      ))}
    </div>
  );
}
