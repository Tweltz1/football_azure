const TEAM_BYE_WEEKS = {
  ARI: 14,
  ATL: 11,
  BAL: 13,
  BUF: 7,
  CAR: 5,
  CHI: 10,
  CIN: 6,
  CLE: 11,
  DAL: 14,
  DEN: 10,
  DET: 6,
  GB: 11,
  HOU: 8,
  IND: 13,
  JAX: 7,
  KC: 5,
  LAC: 7,
  LAR: 11,
  LV: 13,
  MIA: 6,
  MIN: 6,
  NE: 11,
  NO: 8,
  NYG: 8,
  NYJ: 13,
  PHI: 10,
  PIT: 9,
  SEA: 11,
  SF: 8,
  TB: 10,
  TEN: 9,
  WAS: 7,
};

const TEAM_ALIASES = {
  JAC: 'JAX',
  WSH: 'WAS',
};

const FLEX_POSITIONS = new Set(['RB', 'WR', 'TE']);

export const POSITION_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'QB', label: 'QB' },
  { value: 'RB', label: 'RB' },
  { value: 'WR', label: 'WR' },
  { value: 'TE', label: 'TE' },
  { value: 'FLEX', label: 'Flex' },
  { value: 'K', label: 'K' },
  { value: 'DST', label: 'DST' },
];

export const SCORING_MODES = [
  { value: 'PPR', label: 'Full PPR' },
  { value: 'HALF_PPR', label: 'Half PPR' },
];

export const SORT_OPTIONS = [
  { value: 'rank', label: 'Rank' },
  { value: 'name', label: 'Name' },
  { value: 'position', label: 'Position' },
  { value: 'team', label: 'Team' },
  { value: 'bye', label: 'Bye' },
];

export const PLAYER_LIMIT_OPTIONS = [80, 100, 200, 300, 350];

export const getScoringLabel = (scoringMode) => {
  return SCORING_MODES.find((mode) => mode.value === scoringMode)?.label || 'Full PPR';
};

export const buildPlayerBoard = (players, scoringMode = 'PPR') => {
  return (players || [])
    .map((player) => enrichPlayer(player, scoringMode))
    .sort((a, b) => comparePlayers(a, b, 'rank'));
};

export const filterPlayerBoard = (players, { searchTerm = '', positionFilter = 'ALL', sortBy = 'rank' } = {}) => {
  const query = searchTerm.trim().toLowerCase();

  return [...(players || [])]
    .filter((player) => {
      if (!query) return true;
      return [player.name, player.team, player.position]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .filter((player) => matchesPosition(player, positionFilter))
    .sort((a, b) => comparePlayers(a, b, sortBy));
};

export const getUnavailableFavoriteIds = (favoriteIds, players) => {
  const activeIds = new Set((players || []).map((player) => player.id));
  return (favoriteIds || []).filter((playerId) => !activeIds.has(playerId));
};

const enrichPlayer = (player, scoringMode) => {
  const team = normalizeTeam(player.team);
  const sourceRank = toPositiveInteger(player.rank, 999999);
  const scoringRank = getScoringRank(player, scoringMode, sourceRank);
  const bye = getByeWeek(player.bye, team);

  return {
    ...player,
    team,
    bye,
    sourceRank,
    scoringRank,
  };
};

const getScoringRank = (player, scoringMode, fallbackRank) => {
  if (scoringMode === 'HALF_PPR') {
    return toPositiveInteger(player.halfPprRank ?? player.halfPPRRank ?? player.halfPointPprRank, fallbackRank);
  }

  return toPositiveInteger(player.pprRank ?? player.fullPprRank ?? player.fullPPRRank, fallbackRank);
};

const getByeWeek = (playerBye, team) => {
  const parsedBye = toPositiveInteger(playerBye, 0);
  if (parsedBye > 0) return parsedBye;
  return TEAM_BYE_WEEKS[team] || 0;
};

const normalizeTeam = (team) => {
  const normalized = String(team || '').trim().toUpperCase();
  return TEAM_ALIASES[normalized] || normalized;
};

const matchesPosition = (player, positionFilter) => {
  if (!positionFilter || positionFilter === 'ALL') return true;
  if (positionFilter === 'FLEX') return FLEX_POSITIONS.has(player.position);
  return player.position === positionFilter;
};

const comparePlayers = (a, b, sortBy) => {
  switch (sortBy) {
    case 'name':
      return byText(a.name, b.name) || byNumber(a.scoringRank, b.scoringRank);
    case 'position':
      return byText(a.position, b.position) || byNumber(a.scoringRank, b.scoringRank);
    case 'team':
      return byText(a.team, b.team) || byNumber(a.scoringRank, b.scoringRank);
    case 'bye':
      return byNumber(a.bye || 99, b.bye || 99) || byNumber(a.scoringRank, b.scoringRank);
    case 'rank':
    default:
      return byNumber(a.scoringRank, b.scoringRank) || byText(a.name, b.name);
  }
};

const byText = (a, b) => String(a || '').localeCompare(String(b || ''));
const byNumber = (a, b) => toPositiveInteger(a, 999999) - toPositiveInteger(b, 999999);

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
