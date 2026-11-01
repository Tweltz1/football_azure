import React, { useEffect, useState } from 'react';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 hr ago", "2 days ago", or the date once it is over a week old. */
export const timeAgo = (time, now = Date.now()) => {
  const age = Math.max(0, now - time);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < DAY) return `${Math.floor(age / HOUR)} hr ago`;
  if (age < 7 * DAY) {
    const days = Math.floor(age / DAY);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return `on ${new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

/**
 * When a piece of data was last refreshed, e.g. "Updated 12 min ago". Turns amber with a note once
 * it is older than staleAfterHours. Re-renders every minute so the label keeps counting.
 */
const UpdatedAt = ({ at, label = 'Updated', staleAfterHours = null, className = '' }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  const time = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(time)) return null;
  const stale = staleAfterHours != null && now - time > staleAfterHours * HOUR;

  return (
    <span className={`updated-at${stale ? ' stale' : ''}${className ? ` ${className}` : ''}`} title={new Date(time).toLocaleString()}>
      {label} {timeAgo(time, now)}{stale ? ' (may be out of date)' : ''}
    </span>
  );
};

export default UpdatedAt;
