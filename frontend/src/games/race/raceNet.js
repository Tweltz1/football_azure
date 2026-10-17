import { supabase } from '../../supabaseClient';

// Race rooms over a Supabase Realtime channel `race:<code>`, phone to phone (no server code).
// Presence lists who is in the room and which crew member they picked. During the race each phone
// sends only its own inputs, batched (see RaceGame), and attacks the moment they happen. The free plan
// allows about 100 Realtime messages a second across the whole site, and every message counts once per
// phone that receives it, so a 10-phone race has to stay well under one message per phone per second.

export const MAX_RACERS = 10;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanRoomCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);

/** Everyone in the room, first to arrive first. The first one is the host who starts the race. */
const peopleIn = (channel) => Object.values(channel.presenceState())
  .map((metas) => metas[0])
  .filter(Boolean)
  .sort((a, b) => a.joinedAt - b.joinedAt || String(a.cid).localeCompare(String(b.cid)));

/**
 * Joins a room. `handlers`: onPeople(list), onStart(payload), onInputs(payload), onAttack(payload).
 * Returns { setMe(fields), send(event, payload), leave() }.
 */
export function joinRaceRoom(code, me, handlers) {
  const channel = supabase.channel(`race:${code}`, { config: { broadcast: { self: false }, presence: { key: me.cid } } });
  let meta = { ...me, joinedAt: Date.now() };
  let live = true;

  channel
    .on('presence', { event: 'sync' }, () => live && handlers.onPeople?.(peopleIn(channel)))
    .on('broadcast', { event: 'start' }, ({ payload }) => live && handlers.onStart?.(payload))
    .on('broadcast', { event: 'inp' }, ({ payload }) => live && handlers.onInputs?.(payload))
    .on('broadcast', { event: 'atk' }, ({ payload }) => live && handlers.onAttack?.(payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track(meta).catch(() => {});
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onTrouble?.(status);
    });

  return {
    setMe(fields) {
      meta = { ...meta, ...fields };
      channel.track(meta).catch(() => {});
    },
    send(event, payload) {
      channel.send({ type: 'broadcast', event, payload }).catch(() => {});
    },
    leave() {
      live = false;
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
    },
  };
}
