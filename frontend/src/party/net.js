import { supabase, SUPABASE_URL } from '../supabaseClient';

// Party rooms over Supabase Realtime, with no server code. The TV is the host and keeps the whole game.
//   lc:<CODE>:tv        only the TV listens. Phones post their taps to it.
//   lc:<CODE>:p:<cid>   only that phone listens. The TV posts that phone's screen to it.
// Posting to a channel you haven't joined goes over HTTP (supabase-js does this by itself), so each
// message reaches exactly one listener. The free plan allows about 100 Realtime messages a second
// across the whole site, and a broadcast counts once per listener, so this keeps a 12-phone game well
// under that instead of every tap echoing to every phone.

export const MAX_PLAYERS = 12;
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels, so no words by accident
export const newRoomCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export const newCid = () => `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

// For trying it out on one computer with no Supabase (local dev, or ?local in the address): tabs in the
// same browser talk over a BroadcastChannel instead.
const localMode = () => typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
  && (!SUPABASE_URL || new URLSearchParams(window.location.search).has('local'));
const localBus = (topic, onMessage) => {
  const bus = new BroadcastChannel(`lc-local:${topic}`);
  if (onMessage) bus.onmessage = ({ data }) => onMessage(data.event, data.payload);
  return bus;
};
const localPost = (topic, event, payload) => {
  const bus = localBus(topic);
  bus.postMessage({ event, payload });
  bus.close();
  return Promise.resolve('ok');
};

const senders = new Map();
const sender = (topic) => {
  if (!senders.has(topic)) senders.set(topic, supabase.channel(topic, { config: { broadcast: { self: false } } }));
  return senders.get(topic);
};
const post = (topic, event, payload) => (localMode() ? localPost(topic, event, payload) : sender(topic).send({ type: 'broadcast', event, payload }).catch(() => 'error'));

/** The TV's side. onMessage(event, payload). Returns { sendTo(cid, payload), close() }. */
export function openHost(code, onMessage, onStatus) {
  if (localMode()) {
    const bus = localBus(`lc:${code}:tv`, (event, payload) => payload?.cid && onMessage(event, payload));
    setTimeout(() => onStatus?.('SUBSCRIBED'), 0);
    return { sendTo: (cid, payload) => localPost(`lc:${code}:p:${cid}`, 'state', payload), close: () => bus.close() };
  }
  const channel = supabase.channel(`lc:${code}:tv`, { config: { broadcast: { self: false } } });
  let live = true;
  ['hello', 'look', 'play', 'soul', 'start', 'ready', 'skip', 'again', 'bye'].forEach((event) => {
    channel.on('broadcast', { event }, ({ payload }) => live && payload?.cid && onMessage(event, payload));
  });
  channel.subscribe((status) => live && onStatus?.(status));
  return {
    sendTo(cid, payload) {
      return post(`lc:${code}:p:${cid}`, 'state', payload);
    },
    close() {
      live = false;
      supabase.removeChannel(channel);
    },
  };
}

/** A phone's side. onState(payload) gets the screen from the TV. Returns { send(event, payload), close() }. */
export function openPhone(code, cid, onState, onStatus) {
  if (localMode()) {
    const bus = localBus(`lc:${code}:p:${cid}`, (event, payload) => event === 'state' && onState(payload));
    setTimeout(() => onStatus?.('SUBSCRIBED'), 0);
    return { send: (event, payload = {}) => localPost(`lc:${code}:tv`, event, { ...payload, cid }), close: () => bus.close() };
  }
  const channel = supabase.channel(`lc:${code}:p:${cid}`, { config: { broadcast: { self: false } } });
  let live = true;
  channel.on('broadcast', { event: 'state' }, ({ payload }) => live && onState(payload));
  channel.subscribe((status) => live && onStatus?.(status));
  return {
    send(event, payload = {}) {
      return post(`lc:${code}:tv`, event, { ...payload, cid });
    },
    close() {
      live = false;
      supabase.removeChannel(channel);
    },
  };
}
