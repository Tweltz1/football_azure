import {
  batchMs, botActions, FINISH_GRACE_TICKS, makeCourse, MAX_TICKS, mixSeed, nextRandom, startRunner, stepRunner, TICKS_PER_SECOND,
  viewDelayMs,
} from './raceSim.js';

/**
 * One race on this phone: your runner (driven by your taps), crew bots (practice), and the other phones'
 * runners, replayed from the inputs they send, drawn a moment behind so those inputs have arrived.
 *
 * roster: [{ cid, name, crew, userId?, bot?, skill? }] in slot order. net: { send(event, payload) } or null.
 * In a live room the host's phone (hostCid) runs the bots and sends their inputs with its own; the
 * other phones replay them like any other runner.
 * onEvent({ name, crew, kind, mine }) is told about every item used, for the on-screen callouts.
 */
export function createRaceEngine({ seed, roster, meCid, hostCid = null, net, onEvent }) {
  const course = makeCourse(seed);
  const delayTicks = net ? Math.ceil((viewDelayMs(roster.length) / 1000) * TICKS_PER_SECOND) : 0;
  const batchTicks = Math.ceil((batchMs(roster.length) / 1000) * TICKS_PER_SECOND);
  const racers = roster.map((p, slot) => ({
    ...p,
    slot,
    runner: startRunner(slot, p.crew),
    pending: [],
    inputs: new Map(),
    upto: -1,
    log: [],
    rand: p.bot ? ((state) => () => nextRandom(state))({ r: mixSeed(seed, 500 + slot) }) : null,
  }));
  const me = racers.find((r) => r.cid === meCid) || null;
  const myLog = [];
  // Everything you did, kept for the leaderboard check at the end (myLog empties as it is sent).
  const myInputs = [];
  let sentUpTo = 0;
  let firstFinishSeen = null;

  const runsBots = !net || meCid === hostCid;
  const isLocal = (r) => r === me || (r.bot && runsBots);
  const localBots = racers.filter((r) => r.bot && runsBots);

  /** Someone used an item that affects others: work out who, and hand it to the runners on this phone. */
  const dispatch = (attacker, event) => {
    let target = null;
    if (event.kind === 'potion') {
      target = racers
        .filter((r) => r !== attacker && r.runner.finishTick == null && r.runner.x > attacker.runner.x)
        .sort((a, b) => a.runner.x - b.runner.x)[0] || null;
      if (!target) { onEvent?.({ name: attacker.name, crew: attacker.crew, kind: event.kind, mine: attacker === me, missed: true }); return; }
    }
    if (event.kind === 'seven') {
      target = racers.filter((r) => r !== attacker && r.runner.finishTick == null).sort((a, b) => b.runner.x - a.runner.x)[0] || null;
      if (!target || target.runner.x <= attacker.runner.x) { onEvent?.({ name: attacker.name, crew: attacker.crew, kind: event.kind, mine: attacker === me, missed: true }); return; }
    }
    const payload = { from: attacker.cid, kind: event.kind, arg: event.arg, target: target ? target.cid : null };
    racers.forEach((r) => {
      if (r === attacker || !isLocal(r)) return;
      if (payload.target && payload.target !== r.cid) return;
      r.pending.push(payload.kind === 'spit' ? ['t', payload.arg - 60] : ['h', payload.kind, payload.arg]);
    });
    if (net) net.send('atk', payload);
    onEvent?.({ name: attacker.name, crew: attacker.crew, kind: event.kind, mine: attacker === me, target: target ? target.name : null });
  };

  // The bots this phone runs, in the same message as our own inputs (no extra Realtime messages).
  const botBatch = (last) => (localBots.length
    ? localBots.map((r) => ({ cid: r.cid, upto: r.runner.tick + last, ev: r.log.splice(0) }))
    : undefined);

  const engine = {
    course,
    racers,
    me,
    tick: 0,
    over: false,

    myInputs,

    jump() { if (me) me.pending.push(['j']); },
    useItem() { if (me && me.runner.item) me.pending.push(['u']); },

    /** Another phone's inputs: [[tick, ...action]] up to `upto`, plus the host's bots' in `bots`. */
    receiveInputs({ cid, upto, ev, bots }) {
      (bots || []).forEach((b) => engine.receiveInputs(b));
      const r = racers.find((x) => x.cid === cid);
      if (!r || isLocal(r)) return;
      (ev || []).forEach(([tick, ...action]) => {
        if (!r.inputs.has(tick)) r.inputs.set(tick, []);
        r.inputs.get(tick).push(action);
      });
      r.upto = Math.max(r.upto, upto);
    },

    /** Another phone used an item. */
    receiveAttack(payload) {
      const attacker = racers.find((x) => x.cid === payload.from);
      if (!attacker || isLocal(attacker)) return;
      racers.forEach((r) => {
        if (r === attacker || !isLocal(r) || (payload.target && payload.target !== r.cid)) return;
        r.pending.push(payload.kind === 'spit' ? ['t', payload.arg - 60] : ['h', payload.kind, payload.arg]);
      });
      onEvent?.({ name: attacker.name, crew: attacker.crew, kind: payload.kind, mine: false, target: racers.find((x) => x.cid === payload.target)?.name || null });
    },

    /** One tick of the race. */
    step() {
      if (engine.over) return;
      const tick = engine.tick;
      racers.forEach((r) => {
        if (r === me) {
          const actions = r.pending;
          r.pending = [];
          actions.forEach((action) => { myLog.push([r.runner.tick, ...action]); myInputs.push([r.runner.tick, ...action]); });
          const event = stepRunner(r.runner, course, actions);
          if (event && !event.self) dispatch(r, event);
          else if (event?.self) onEvent?.({ name: r.name, crew: r.crew, kind: event.kind, mine: true });
        } else if (isLocal(r)) {
          const actions = [...botActions(r.runner, course, r.skill ?? 0.6, r.rand), ...r.pending];
          r.pending = [];
          if (net) actions.forEach((action) => r.log.push([r.runner.tick, ...action]));
          const event = stepRunner(r.runner, course, actions);
          if (event && !event.self) dispatch(r, event);
          else if (event?.self) onEvent?.({ name: r.name, crew: r.crew, kind: event.kind, mine: false });
        } else {
          // Replay them up to where we have their inputs, a moment behind us.
          const until = Math.min(tick - delayTicks, r.upto);
          while (r.runner.tick <= until) stepRunner(r.runner, course, r.inputs.get(r.runner.tick) || []);
        }
        if (r.runner.finishTick != null && firstFinishSeen == null) firstFinishSeen = tick;
      });

      if (net && me && (tick - sentUpTo >= batchTicks || (me.runner.finishTick != null && sentUpTo < me.runner.tick))) {
        net.send('inp', { cid: me.cid, upto: me.runner.tick - 1, ev: myLog.splice(0), bots: botBatch(-1) });
        sentUpTo = tick;
      }

      engine.tick += 1;
      const everyoneDone = racers.every((r) => r.runner.finishTick != null);
      if (everyoneDone || (firstFinishSeen != null && engine.tick > firstFinishSeen + FINISH_GRACE_TICKS) || engine.tick > MAX_TICKS) {
        engine.over = true;
        // Last inputs, so the others see exactly how we finished.
        if (net && me) net.send('inp', { cid: me.cid, upto: me.runner.tick, ev: myLog.splice(0), bots: botBatch(0) });
      }
    },
  };
  return engine;
}
