// The chat bar's AI layer. The page's own model answers first (instantly, in the browser); this sends that
// answer plus the team's data to /api/startsit/ask, where Gemini writes a conversational reply grounded in it.
// Any failure (no key, offline, busy, slow) returns null and the page keeps its own answer.
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { playerLine } from './askModel';

const SKILL = ['QB', 'RB', 'WR', 'TE'];
const round1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);

/** One player as a short line the AI can read: "Jaylen Warren, RB PIT, RB14 · PIT vs CLE, 12.3 pts". */
const line = (p) => `${p.name} (${[playerLine(p), p.points != null ? `${round1(p.points)} pts` : null].filter(Boolean).join(' · ')})`;

/** The page's answer, flattened to what the AI needs: its text, lists and the "why" card's call. */
export const answerSnapshot = (answer) => {
  if (!answer) return null;
  const items = (list) => (list || []).slice(0, 12).map((item) => [item.label, item.name, item.detail, item.valueText ?? (item.value != null ? round1(item.value) : null), item.valueLabel]
    .filter((x) => x != null && x !== '').join(' | '));
  const why = answer.why ? {
    call: answer.why.call?.label,
    headline: answer.why.headline,
    summary: answer.why.summary,
    confidence: answer.why.confidence?.text,
    watch: answer.why.watch,
    // The factor table: "Projection: Warren 14.2 vs Kyren 11.8 (edge start)".
    factors: (answer.why.factors || []).slice(0, 8).map((f) => (typeof f === 'string' ? f
      : `${f.label}: ${(answer.why.names || [])[0] || 'first'} ${f.start} vs ${(answer.why.names || [])[1] || 'second'} ${f.sit}${f.edge ? ` (edge ${f.edge})` : ''}`)),
  } : null;
  return {
    kind: answer.context?.type,
    text: answer.text,
    itemsTitle: answer.itemsTitle,
    items: items(answer.items),
    sections: (answer.sections || []).slice(0, 4).map((s) => ({ title: s.title, items: items(s.items) })),
    why,
    note: answer.note,
  };
};

/** This week's data for the team on screen, kept small enough for a free-tier prompt. */
export const askData = ({ answer, roster, lineup, allPlayers, freeAgents, partnerNames, week, ppr, dynasty }) => {
  const starterIds = new Set((lineup?.starters || []).map((s) => s.player?.id).filter(Boolean));
  const top = {};
  [...SKILL, 'K', 'DST'].forEach((pos) => {
    top[pos] = (allPlayers || [])
      .filter((p) => p.position === pos && p.points > 0 && !p.onBye)
      .sort((a, b) => b.points - a.points)
      .slice(0, SKILL.includes(pos) ? 10 : 4)
      .map(line);
  });
  return {
    week,
    scoring: ppr ? 'PPR' : 'standard or half PPR',
    format: dynasty ? 'dynasty' : 'redraft',
    modelAnswer: answerSnapshot(answer),
    myLineup: (lineup?.starters || []).map((s) => `${s.slot.label}: ${s.player ? line(s.player) : 'empty'}`),
    lineupTotal: lineup?.total,
    bench: (roster || []).filter((p) => !starterIds.has(p.id)).map(line),
    leagueTeams: partnerNames || [],
    freeAgents: (freeAgents || []).filter((p) => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 12).map(line),
    topPlayers: top,
  };
};

/** Asks Gemini. Returns { answer, ideas, saved } or null when the AI can't answer right now. */
export const askAi = async ({ question, history, data }) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/startsit/ask`, { question, history, data }, { timeout: 25000 });
    const answer = res?.data?.answer;
    if (typeof answer !== 'string' || !answer.trim()) return null;
    return {
      answer: answer.trim(),
      ideas: Array.isArray(res.data.ideas) ? res.data.ideas.filter((i) => typeof i === 'string') : [],
      // A reply Gemini gave earlier to this same question and model answer, used while Gemini is down.
      saved: res.data.saved === true,
    };
  } catch (error) {
    return null;
  }
};
