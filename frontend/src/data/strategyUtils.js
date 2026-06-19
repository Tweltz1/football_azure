export const TIER_DEFINITIONS = [
  { value: 1, label: 'Tier 1', name: 'Elite', accent: 'gold' },
  { value: 2, label: 'Tier 2', name: 'Strong Starter', accent: 'green' },
  { value: 3, label: 'Tier 3', name: 'Starter', accent: 'field' },
  { value: 4, label: 'Tier 4', name: 'Bench', accent: 'muted' },
  { value: 5, label: 'Tier 5', name: 'Flier', accent: 'light' },
];

export const POSITION_PLAN_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DST', 'BENCH'];

export const DEFAULT_BUDGET_PLAN = {
  QB: 22,
  RB: 72,
  WR: 72,
  TE: 18,
  FLEX: 8,
  SUPERFLEX: 0,
  K: 2,
  DST: 2,
  BENCH: 4,
};

const STATUS_MATCHERS = [
  { keys: ['QUESTIONABLE', 'Q'], label: 'Q', text: 'Questionable', tone: 'warn' },
  { keys: ['DOUBTFUL', 'D'], label: 'D', text: 'Doubtful', tone: 'danger' },
  { keys: ['OUT', 'O'], label: 'O', text: 'Out', tone: 'danger' },
  { keys: ['IR', 'INJURED_RESERVE'], label: 'IR', text: 'IR', tone: 'danger' },
  { keys: ['PUP'], label: 'PUP', text: 'PUP', tone: 'warn' },
  { keys: ['SUSPENDED', 'SUSP'], label: 'SUS', text: 'Suspended', tone: 'danger' },
];

export const getPlayerAvailability = (player) => {
  const rawStatus = String(
    player?.injuryStatus
      || player?.injury_status
      || player?.status
      || player?.practiceStatus
      || ''
  ).trim().toUpperCase();

  const match = STATUS_MATCHERS.find((status) => status.keys.includes(rawStatus));
  if (match) return match;

  return { label: 'ACT', text: rawStatus && rawStatus !== 'ACTIVE' ? rawStatus : 'Active', tone: 'good' };
};

export const getEstimatedAuctionValue = (player) => {
  const rank = toNumber(player?.scoringRank || player?.rank, 999);
  const position = normalizePosition(player?.position);
  let value;

  if (rank <= 5) value = 58;
  else if (rank <= 10) value = 48;
  else if (rank <= 20) value = 38;
  else if (rank <= 40) value = 27;
  else if (rank <= 80) value = 15;
  else if (rank <= 140) value = 7;
  else if (rank <= 220) value = 3;
  else value = 1;

  if (position === 'QB' && rank > 15) value = Math.max(1, Math.round(value * 0.72));
  if (position === 'TE' && rank <= 45) value += 4;
  if (position === 'K' || position === 'DST' || position === 'DEF') value = Math.min(value, 2);

  return Math.max(1, Math.min(65, Math.round(value)));
};

export const runMockAuction = (player, bidCap = 35) => {
  if (!player) return null;

  const marketValue = getEstimatedAuctionValue(player);
  const seed = seedFromString(player.id || player.name);
  const botProfiles = [
    { name: 'Value Hawk', offset: -3 + (seed % 5) },
    { name: 'Stars Scrambler', offset: (seed % 7) - 1 },
    { name: 'Late-Round Larry', offset: -5 + (seed % 4) },
  ];
  const botBids = botProfiles.map((bot, index) => ({
    team: bot.name,
    amount: Math.max(1, marketValue + bot.offset + index),
  }));
  const topBotBid = Math.max(...botBids.map((bid) => bid.amount));
  const userWins = Number(bidCap) >= topBotBid + 1;
  const userBid = Math.max(1, Math.min(Number(bidCap), topBotBid + 1));
  const winningBid = userWins ? userBid : topBotBid;
  const winner = userWins ? 'You' : botBids.find((bid) => bid.amount === topBotBid)?.team || 'Bot';
  const suggestedBid = Math.max(1, Math.min(65, marketValue + 2));
  const bidTrail = [...botBids, { team: 'You', amount: userBid }]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  return {
    player,
    marketValue,
    suggestedBid,
    winningBid,
    winner,
    userWins,
    bidTrail,
  };
};

export const buildBudgetPlannerSummary = (budgetPlan = DEFAULT_BUDGET_PLAN, rosterSettings = {}) => {
  const normalizedPlan = normalizeBudgetPlan(budgetPlan);
  const total = POSITION_PLAN_ORDER.reduce((sum, position) => sum + toNumber(normalizedPlan[position], 0), 0);
  const remaining = 200 - total;
  const rows = POSITION_PLAN_ORDER.map((position) => {
    const planned = toNumber(normalizedPlan[position], 0);
    const slots = getRosterSlotCount(rosterSettings, position);
    return {
      position,
      planned,
      slots,
      perSlot: slots > 0 ? Math.round(planned / slots) : planned,
    };
  });

  return { total, remaining, rows, normalizedPlan };
};

export const normalizeBudgetPlan = (budgetPlan = {}) => {
  return POSITION_PLAN_ORDER.reduce((plan, position) => {
    plan[position] = Math.max(0, Math.min(200, toNumber(budgetPlan[position] ?? DEFAULT_BUDGET_PLAN[position], 0)));
    return plan;
  }, {});
};

export const buildByeWeekAnalyzer = (league) => {
  return (league?.teams || []).map((team) => {
    const byeCounts = (team.roster || []).reduce((counts, spot) => {
      const bye = spot.player?.bye;
      if (!bye) return counts;
      counts[bye] = (counts[bye] || 0) + 1;
      return counts;
    }, {});
    const conflictWeeks = Object.entries(byeCounts)
      .filter(([, count]) => count >= 3)
      .map(([week, count]) => ({ week: Number(week), count }))
      .sort((a, b) => b.count - a.count || a.week - b.week);

    return {
      teamId: team.id,
      teamName: team.name,
      rostered: (team.roster || []).length,
      conflictWeeks,
      byeCounts,
    };
  });
};

export const buildCommissionerHealth = (league, userId) => {
  const memberCount = league?.members?.length || 0;
  const readyCount = league?.readyMembers?.length || 0;
  const draftTimers = league?.draftTimers || {};
  const isCommissioner = league?.adminId === userId;

  return {
    isCommissioner,
    memberCount,
    readyCount,
    status: league?.status || 'unknown',
    timerLabel: `${draftTimers.bidTimer || 0}s bid / ${draftTimers.intermissionTimer || 0}s break`,
    needsAttention: isCommissioner && memberCount > 0 && readyCount < memberCount && String(league?.status || '').toLowerCase() === 'created',
  };
};

export const buildDraftRecap = (league) => {
  const draftLog = league?.draftLog || [];
  if (!draftLog.length) {
    return {
      picks: 0,
      bestValue: null,
      biggestOverpay: null,
      biggestWar: null,
      positionSpend: [],
    };
  }

  const enrichedPicks = draftLog.map((pick) => {
    const estimate = getEstimatedAuctionValue(pick.player);
    return {
      ...pick,
      estimate,
      valueDelta: estimate - toNumber(pick.winningBid, 0),
      bidCount: Object.keys(pick.allBids || {}).length,
    };
  });

  const positionSpendMap = enrichedPicks.reduce((spend, pick) => {
    const position = normalizePosition(pick.player?.position);
    spend[position] = (spend[position] || 0) + toNumber(pick.winningBid, 0);
    return spend;
  }, {});

  return {
    picks: draftLog.length,
    bestValue: [...enrichedPicks].sort((a, b) => b.valueDelta - a.valueDelta)[0],
    biggestOverpay: [...enrichedPicks].sort((a, b) => a.valueDelta - b.valueDelta)[0],
    biggestWar: [...enrichedPicks].sort((a, b) => b.bidCount - a.bidCount)[0],
    positionSpend: Object.entries(positionSpendMap).map(([position, spend]) => ({ position, spend })),
  };
};

export const getRosterNeeds = (team, rosterSettings = {}) => {
  const roster = team?.roster || [];
  return POSITION_PLAN_ORDER
    .filter((position) => !['FLEX', 'SUPERFLEX', 'BENCH'].includes(position))
    .map((position) => {
      const required = getRosterSlotCount(rosterSettings, position);
      const filled = roster.filter((spot) => normalizePosition(spot.position || spot.player?.position) === position).length;
      return { position, required, filled, remaining: Math.max(0, required - filled) };
    })
    .filter((need) => need.required > 0);
};

const getRosterSlotCount = (rosterSettings, position) => {
  const keyMap = {
    QB: 'qb',
    RB: 'rb',
    WR: 'wr',
    TE: 'te',
    FLEX: 'flex',
    SUPERFLEX: 'superFlex',
    K: 'k',
    DST: 'def',
    BENCH: 'bench',
  };
  return toNumber(rosterSettings?.[keyMap[position]], 0);
};

const normalizePosition = (position) => {
  const normalized = String(position || '').toUpperCase();
  if (normalized === 'DEF') return 'DST';
  return normalized;
};

const seedFromString = (value) => String(value || '').split('').reduce((seed, char) => seed + char.charCodeAt(0), 0);
const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
