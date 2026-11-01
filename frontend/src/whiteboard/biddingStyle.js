// League "Bidding style" setting, shared by the settings forms and the draft screens.

export const STANDARD = 'standard';
export const WHITEBOARD_MANUAL = 'whiteboard-manual';
export const WHITEBOARD_AUTO = 'whiteboard-auto';

export const BIDDING_STYLES = [
  { value: STANDARD, label: 'Standard', blurb: 'Type a sealed bid. Highest bid wins automatically.' },
  { value: WHITEBOARD_MANUAL, label: 'Whiteboard – manual', blurb: 'Everyone draws a bid. Boards flip at 0 and the commissioner awards.' },
  { value: WHITEBOARD_AUTO, label: 'Whiteboard – auto-read', blurb: 'Boards are read automatically; the commissioner confirms the award.' },
];

export const normalizeBiddingMode = (value) => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === WHITEBOARD_AUTO) return WHITEBOARD_AUTO;
  if (mode === WHITEBOARD_MANUAL || mode === 'whiteboard') return WHITEBOARD_MANUAL;
  return STANDARD;
};

export const isWhiteboardLeague = (league) => normalizeBiddingMode(league?.biddingMode) !== STANDARD;
export const isAutoReadLeague = (league) => normalizeBiddingMode(league?.biddingMode) === WHITEBOARD_AUTO;
export const biddingStyleLabel = (value) => BIDDING_STYLES.find((style) => style.value === normalizeBiddingMode(value))?.label || 'Standard';

const rosterTotal = (settings = {}) => Object.values(settings || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

export const openRosterSpots = (league, team) => Math.max(0, rosterTotal(league?.rosterSettings) - ((team?.roster || []).length));

/** Same rule as the server: keep $1 for each remaining roster spot. */
export const maxBidFor = (league, team) => {
  if (!team) return 0;
  const open = openRosterSpots(league, team);
  if (open <= 0) return 0;
  return Math.max(0, (Number(team.budget) || 0) - (open - 1));
};
