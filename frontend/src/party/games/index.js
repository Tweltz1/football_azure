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
    },
    over: (g) => g.phase === 'won' || g.phase === 'lost',
    sceneKey: (g) => `${g.phase === 'night' ? 'intro' : g.phase}${g.night}`,
    has: (g, cid) => g.players.some((p) => p.cid === cid),
    phone: candle.phoneView,
    result: (g, cid) => ({ score: g.score, awards: candle.awards(g).filter((a) => a.cid === cid).map((a) => a.title), stats: g.stats[cid] }),
    addPlayer: candle.addPlayer,
    seen: candle.seen,
    Stage: CandleStage,
    Phone: CandlePhone,
    HowTo: CandleHowTo,
    howToMs: CANDLE_HOWTO_MS,
  },
  quiz: {
    create: (players, seed, now) => quiz.createQuiz(players, seed, now, Number(query().get('questions')) || quiz.QUESTION_COUNT),
    tick: quiz.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'answer') quiz.answer(g, cid, Number(msg.choice), now);
    },
    over: quiz.isOver,
    sceneKey: (g) => (['round', 'scores', 'final'].includes(g.phase) ? `${g.phase}${g.index}` : `play${quiz.roundOf(g.index)}`),
    has: (g, cid) => g.players.some((p) => p.cid === cid),
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
    create: hallway.createHallway,
    tick: hallway.tick,
    act(g, cid, msg, now) {
      if (msg.type === 'vote') hallway.vote(g, cid, Number(msg.door), now);
    },
    over: hallway.isOver,
    sceneKey: (g) => (g.phase === 'won' || g.phase === 'lost' ? g.phase : `floor${g.floor}`),
    has: (g, cid) => g.players.some((p) => p.cid === cid),
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
