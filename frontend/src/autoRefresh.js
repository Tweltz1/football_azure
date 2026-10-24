import { useEffect, useRef, useState } from 'react';

// How often live Sleeper data (projections, injuries) is refreshed. The API caches Sleeper for the
// same length of time (CACHE_MS in supabase/functions/_shared/startSit.ts); refreshing faster than that gains nothing.
export const REFRESH_MINUTES = 30;

/**
 * A counter that goes up every REFRESH_MINUTES while the page is open and visible, and as soon as
 * the viewer comes back to a tab that has gone stale. Add it to an effect's dependencies to refetch.
 */
export const useRefreshTick = () => {
  const [tick, setTick] = useState(0);
  const last = useRef(Date.now());

  useEffect(() => {
    const everyMs = REFRESH_MINUTES * 60 * 1000;
    const bump = () => {
      last.current = Date.now();
      setTick((n) => n + 1);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') bump();
    }, everyMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current >= everyMs) bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return tick;
};
