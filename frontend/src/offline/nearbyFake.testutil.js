// A stand-in for the native Nearby plugin: records what is sent and lets a test play the other phone.
export const fakeTransport = ({ onJoin } = {}) => {
  const listeners = {};
  const t = {
    sent: [],
    hosted: null,
    addListener(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    emit(event, data) { (listeners[event] || []).forEach((fn) => fn(data)); },
    async host(options) { t.hosted = options; return { peerId: 'me' }; },
    async join(options) { t.joined = options; if (onJoin) setTimeout(() => onJoin(t), 0); return { peerId: 'me' }; },
    async send({ data, to }) { t.sent.push({ msg: JSON.parse(data), to: to || null }); return { sent: 1 }; },
    async stop() {},
  };
  return t;
};

export const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
