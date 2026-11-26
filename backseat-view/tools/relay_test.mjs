// Checks the internet backup relay (Supabase Realtime broadcast) end to end: two sockets join the
// same room, one sends, the other must receive. Env: RELAY_URL (wss://.../realtime/v1/websocket), RELAY_KEY.
const url = `${process.env.RELAY_URL}?apikey=${encodeURIComponent(process.env.RELAY_KEY)}&vsn=1.0.0`;
const topic = `realtime:stork-ci-${Math.random().toString(16).slice(2)}`;
const join = (ws) => ws.send(JSON.stringify({ topic, event: 'phx_join', ref: '1', join_ref: '1',
  payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } } }));

function open(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onerror = (e) => reject(new Error(`${name} socket error ${e.message || ''}`));
    ws.onopen = () => join(ws);
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.event === 'phx_reply' && msg.topic === topic) {
        if (msg.payload.status === 'ok') resolve(ws); else reject(new Error(`${name} join refused: ${JSON.stringify(msg.payload)}`));
      }
    };
  });
}

const timer = setTimeout(() => { console.log('RELAY FAIL: timed out'); process.exit(1); }, 20000);
try {
  const a = await open('baby');
  const b = await open('parent');
  const got = new Promise((resolve) => {
    b.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.event === 'broadcast') resolve(msg.payload.payload.d); };
  });
  const body = 'x'.repeat(30000);
  await new Promise((r) => setTimeout(r, 500));
  a.send(JSON.stringify({ topic, event: 'broadcast', ref: '2', join_ref: '1', payload: { type: 'broadcast', event: 'p', payload: { d: body } } }));
  const d = await got;
  console.log(d === body ? 'RELAY OK: 30 KB message passed between two phones' : 'RELAY FAIL: message changed');
  clearTimeout(timer);
  process.exit(d === body ? 0 : 1);
} catch (e) {
  console.log(`RELAY FAIL: ${e.message}`);
  process.exit(1);
}
