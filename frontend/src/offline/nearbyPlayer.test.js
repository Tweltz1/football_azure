// A player's phone sends its draft calls to the commissioner's phone and gets live updates back from it.
import axios from 'axios';
import { API_BASE_URL } from '../api';
import { createDraftConnection } from '../realtime';
import { isOfflineLeague, offlineUser, writeOfflineLeague } from './storage';
import { connectTransport, leaveNearbyDraft, roomFor } from './nearbyDraft';
import { fakeTransport, tick } from './nearbyFake.testutil';

jest.mock('../supabaseClient', () => ({
  SUPABASE_URL: 'https://x.supabase.co',
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    channel: () => { throw new Error('nearby leagues must not open a live channel'); },
    removeChannel: () => {},
  },
}));

const league = { id: 'L1', name: 'Hood', status: 'drafting', adminId: 'admin', members: ['admin', 'u2'], teams: [], activeBids: {}, _version: 5 };

test('calls go to the commissioner\'s phone, replies and live updates come back', async () => {
  window.localStorage.clear();
  writeOfflineLeague('L1', { league, version: 5, savedAt: new Date().toISOString(), userId: 'u2', userName: 'Sam', remote: true });
  expect(isOfflineLeague('L1')).toBe(true);

  // The commissioner's phone: connects when we look for it, and answers each request.
  const air = fakeTransport({ onJoin: (t) => t.emit('peerState', { peerId: 'H', name: 'Tyler', state: 'connected' }) });
  const realSend = air.send;
  air.send = async (arg) => {
    const out = await realSend(arg);
    const msg = JSON.parse(arg.data);
    if (msg.t === 'req') {
      setTimeout(() => air.emit('message', {
        peerId: 'H',
        data: JSON.stringify({ t: 'res', id: msg.id, status: 200, body: { ...league, _version: 6, activeBids: { u2: { amount: msg.body?.amount } } } }),
      }), 0);
    }
    return out;
  };
  connectTransport(air);

  const response = await axios.post(`${API_BASE_URL}/leagues/L1/bid`, { amount: 9 });
  expect(air.joined).toEqual({ name: 'Sam', room: roomFor('L1') });
  expect(air.sent[0].msg).toEqual({ t: 'hello', userId: 'u2', leagueId: 'L1' });
  const req = air.sent.find((s) => s.msg.t === 'req').msg;
  expect(req).toMatchObject({ method: 'POST', path: 'leagues/L1/bid', body: { amount: 9 } });
  expect(response.data.activeBids.u2.amount).toBe(9);

  // Live updates from the host reach the draft room, and private ones only their player.
  const seen = [];
  const connection = createDraftConnection({ leagueIds: ['L1'], userId: 'u2' });
  connection.on('chat', (m) => seen.push(m));
  await connection.start();
  air.emit('message', { peerId: 'H', data: JSON.stringify({ t: 'bc', leagueId: 'L1', event: 'chat', payload: 'for everyone' }) });
  air.emit('message', { peerId: 'H', data: JSON.stringify({ t: 'bc', leagueId: 'L1', event: 'chat', payload: 'for u3', toUserId: 'u3' }) });
  await tick();
  expect(seen).toEqual(['for everyone']);
  connection.stop();

  // Errors from the host come back like the site's.
  air.send = async (arg) => {
    const msg = JSON.parse(arg.data);
    setTimeout(() => air.emit('message', { peerId: 'H', data: JSON.stringify({ t: 'res', id: msg.id, status: 400, body: "Time's up for this player." }) }), 0);
    return { sent: 1 };
  };
  await expect(axios.post(`${API_BASE_URL}/leagues/L1/bid`, { amount: 3 }, { suppressBidLimitAlert: true })).rejects.toMatchObject({ response: { status: 400, data: "Time's up for this player." } });

  leaveNearbyDraft('L1');
  expect(isOfflineLeague('L1')).toBe(false);
  expect(offlineUser()).toBeNull();
});
