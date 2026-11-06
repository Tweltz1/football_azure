// Plain-language labels for league states and timer lengths, shared by the league list and draft room.

const STATUS_LABELS = {
  created: 'Lobby',
  lobby: 'Lobby',
  drafting: 'Drafting',
  tiebreaker: 'Tie-breaker',
  intermission: 'Between players',
  boardreview: 'Boards up',
  manual: 'Manual draft',
  completed: 'Finished',
};

export const leagueStatusKey = (league) => String(league?.status || '').toLowerCase();

export const leagueStatusLabel = (league) => STATUS_LABELS[leagueStatusKey(league)] || 'Not started';

/** True while a draft is running: the room is where the action is. */
export const isDraftLive = (league) => ['drafting', 'tiebreaker', 'intermission', 'boardreview', 'manual'].includes(leagueStatusKey(league));

/** 20 -> "20s", 90 -> "1m 30s", 3600 -> "1h". */
export const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return secs ? `${minutes}m ${secs}s` : `${minutes}m`;
};

/** A countdown: 45 -> "45", 125 -> "2:05", 3725 -> "1:02:05". */
export const formatClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return String(total);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
};

/** The commissioner, or the co-host they picked (co-hosts can run the draft tools). */
export const isCommish = (league, userId) => Boolean(userId)
  && (league?.adminId === userId || (Boolean(league?.cohostId) && league.cohostId === userId));
