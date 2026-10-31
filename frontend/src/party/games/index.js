// Every game the TV can host. Each one is a pure engine (state on the TV, ticked every frame), a TV
// stage, a phone screen and an animated how-to-play intro. Lobby details live in meta.js.

import * as candle from '../lastCandle';
import * as quiz from './quiz';
import * as mash from './mash';
import * as hallway from './hallway';
import CandleStage from './CandleStage';
import CandlePhone from './CandlePhone';
import CandleHowTo, { HOWTO_MS as CANDLE_HOWTO_MS } from './CandleHowTo';
import QuizStage from './QuizStage';
import QuizPhone from './QuizPhone';
import QuizHowTo, { HOWTO_MS as QUIZ_HOWTO_MS } from './QuizHowTo';
import MashStage from './MashStage';
import MashPhone from './MashPhone';
import MashHowTo, { HOWTO_MS as MASH_HOWTO_MS } from './MashHowTo';
import HallwayStage from './HallwayStage';
import HallwayPhone from './HallwayPhone';
import HallwayHowTo, { HOWTO_MS as HALLWAY_HOWTO_MS } from './HallwayHowTo';
import { GAME_META, isPlayable, metaFor } from './meta';

// The TV remembers which quiz questions it has shown, so the next game picks fresh ones first.
const SEEN_KEY = 'lq-seen';
const loadSeenQuestions = () => {
  try { return JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]'); } catch (error) { return []; }
};
const saveSeenQuestions = (texts) => {
  try {
    const all = loadSeenQuestions().filter((t) => !texts.includes(t)).concat(texts);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(all.slice(-400)));
  } catch (error) { /* private mode */ }
};

const query = () => new URLSearchParams(window.location.search);

const ENGINES = {
  candle: {
    create(players, seed, now) {
      const g = candle.createGame(players, seed, now);
      candle.skipToNight(g, Number(query().get('night')), now);
      return g;
    },
    tick: candle.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'play') candle.play(g, cid, Number(msg.slot), now);
      if (msg.type === 'soul') candle.soul(g, cid, now);
      if (msg.type === 'trash') candle.trash(g, cid, Number(msg.slot), now);
    },
    over: (g) => g.phase === 'won' || g.phase === 'lost',
    sceneKey: (g) => `${g.phase === 'night' ? 'intro' : g.phase}${g.night}`,
    has: (g, cid) => g.players.some((p) => p.cid === cid),
    phone: candle.phoneView,
    result: (g, cid) => ({ score: g.score, awards: candle.awards(g).filter((a) => a.cid === cid).map((a) => a.title), stats: g.stats[cid] }),
    addPlayer: candle.addPlayer,
    seen: candle.seen,
    intensity(g, now) {
      const len = candle.NIGHTS[g.night - 1]?.length || 120000;
      const into = g.phase === 'night' ? Math.min(1, (now - g.phaseAt) / len) : 0;
      return Math.min(1, ((g.night - 1) + into) / 2.6 + (g.monsters?.some((m) => m.boss) ? 0.2 : 0));
    },
    Stage: CandleStage,
    Phone: CandlePhone,
    HowTo: CandleHowTo,
    howToMs: CANDLE_HOWTO_MS,
  },
  quiz: {
    create(players, seed, now) {
      const g = quiz.createQuiz(players, seed, now, Number(query().get('questions')) || quiz.QUESTION_COUNT, loadSeenQuestions());
      saveSeenQuestions(g.questions.map((q) => q.text));
      return g;
    },
    tick: quiz.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'answer') quiz.answer(g, cid, Number(msg.choice), now);
    },
    over: quiz.isOver,
    sceneKey: (g) => (['round', 'scores', 'final'].includes(g.phase) ? `${g.phase}${g.index}` : `play${quiz.roundOf(g.index)}`),
    has: (g, cid) => g.players.some((p) => p.cid === cid),
    intensity: (g) => g.index / Math.max(1, g.questions.length - 1),
    phone: quiz.phoneView,
    result(g, cid) {
      const me = quiz.ranking(g).find((r) => r.cid === cid);
      return {
        rank: me?.rank || g.players.length,
        score: me?.score || 0,
        right: g.stats[cid]?.right || 0,
        total: g.questions.length,
        awards: quiz.awards(g).filter((a) => a.cid === cid).map((a) => a.title),
      };
    },
    addPlayer: quiz.addPlayer,
    seen: quiz.seen,
    Stage: QuizStage,
    Phone: QuizPhone,
    HowTo: QuizHowTo,
    howToMs: QUIZ_HOWTO_MS,
  },
  mash: {
    create: mash.createMash,
    tick: mash.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'write') mash.write(g, cid, String(msg.text || ''), now);
      if (msg.type === 'vote') mash.vote(g, cid, String(msg.pick || ''), now);
    },
    over: mash.isOver,
    sceneKey: (g) => (['vote', 'reveal', 'skip'].includes(g.phase) ? `match${g.round}` : `${g.phase}${g.round}`),
    has: (g, cid) => g.players.some((p) => p.cid === cid),
    intensity: (g) => Math.min(1, (g.round + (g.matchups?.length ? g.current / g.matchups.length : 0)) / (mash.ROUNDS.length - 0.5)),
    phone: mash.phoneView,
    result(g, cid) {
      const me = mash.ranking(g).find((r) => r.cid === cid);
      return {
        rank: me?.rank || g.players.length,
        score: me?.score || 0,
        votes: g.stats[cid]?.votes || 0,
        awards: mash.awards(g).filter((a) => a.cid === cid).map((a) => a.title),
      };
    },
    addPlayer: mash.addPlayer,
    seen: mash.seen,
    Stage: MashStage,
    Phone: MashPhone,
    HowTo: MashHowTo,
    howToMs: MASH_HOWTO_MS,
  },
  hallway: {
    create(players, seed, now) {
      const g = hallway.createHallway(players, seed, now);
      const floor = Number(query().get('floor'));
      if (floor > 1) hallway.skipToFloor(g, floor, now);
      return g;
    },
    tick: hallway.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'vote') hallway.vote(g, cid, Number(msg.door), now);
    },
    over: hallway.isOver,
    sceneKey: (g) => (g.phase === 'won' || g.phase === 'lost' ? g.phase : `floor${g.floor}`),
    has: (g, cid) => g.players.some((p) => p.cid === cid),
    intensity: (g) => Math.min(1, (g.floor - 1) / (hallway.FLOORS - 1) + (g.lanterns <= 1 ? 0.25 : 0)),
    phone: hallway.phoneView,
    result: (g, cid) => ({
      score: g.score,
      right: g.stats[cid]?.right || 0,
      awards: hallway.awards(g).filter((a) => a.cid === cid).map((a) => a.title),
    }),
    addPlayer: hallway.addPlayer,
    seen: hallway.seen,
    Stage: HallwayStage,
    Phone: HallwayPhone,
    HowTo: HallwayHowTo,
    howToMs: HALLWAY_HOWTO_MS,
  },
};

export const gameFor = (id) => {
  const meta = metaFor(isPlayable(id) ? id : 'candle');
  return { ...meta, ...ENGINES[meta.id] };
};

export { GAME_META, isPlayable };
