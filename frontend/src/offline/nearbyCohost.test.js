// Co-host: the commissioner's phone dies mid-draft, the co-host's phone takes over the room from its copy,
// players keep bidding, and when the commissioner's phone comes back it gets the draft back.
const { bootPhone, makeAir, phoneStorage } = require('./nearbyPhones.testutil');

jest.setTimeout(40000);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await wait(50);
  }
  throw new Error('timed out');
};

test('co-host takes over when the commissioner\'s phone dies, and hands the draft back', async () => {
  const air = makeAir();
  const storages = { host: phoneStorage(), sam: phoneStorage(), cara: phoneStorage() };
  const phones = Object.fromEntries(Object.entries(storages).map(([k, s]) => [k, bootPhone(s)]));
  phones.host.nearby.connectTransport(air.transportFor('H'));
  phones.sam.nearby.connectTransport(air.transportFor('S'));
  phones.cara.nearby.connectTransport(air.transportFor('C'));

  const tyler = { userId: 'guest-tyler', userDetails: 'Tyler', guest: true };
  const id = await phones.host.offlineSync.createLeagueOnDevice({ name: 'Garage', draftTimers: { bidTimer: 30 } }, tyler);
  const code = phones.host.nearby.roomFor(id);
  const sam = { userId: 'guest-sam', userDetails: 'Sam', guest: true };
  const cara = { userId: 'guest-cara', userDetails: 'Cara', guest: true };
  for (const [phone, u] of [['sam', sam], ['cara', cara]]) {
    await phones[phone].nearby.findDraftByCode(code, u);
    await phones[phone].nearby.pickDraftTeam('new', u);
  }

  // The commissioner makes Sam co-host; Sam's phone gets a copy without anyone else's bids.
  const url = (phone, path) => `${phones[phone].api.API_BASE_URL}/leagues/${id}/${path}`;
  await phones.host.axios.post(url('host', 'settings'), { cohostId: 'guest-sam' });
  for (const [phone] of [['sam'], ['cara']]) await phones[phone].axios.post(url(phone, 'ready'), { isReady: true });
  await phones.host.axios.post(url('host', 'startDraft'), {});
  await phones.cara.axios.post(url('cara', 'bid'), { amount: 9 });
  await until(() => storages.sam.readOfflineLeague(id)?.mirror?.league?.status === 'drafting');
  const copy = storages.sam.readOfflineLeague(id).mirror.league;
  expect(copy.cohostId).toBe('guest-sam');
  expect(Object.keys(copy.activeBids || {})).toEqual([]);
  expect(storages.cara.readOfflineLeague(id).mirror).toBeUndefined();

  // The commissioner's phone dies. Sam's phone takes over; the player up for bid starts over.
  air.powerOff('H');
  // (Sam's phone checks every few seconds; after 20 seconds without the commissioner it takes over.)
  phones.sam.nearby.checkHostNow();
  expect(storages.sam.readOfflineLeague(id).actingHost).toBeUndefined();
  const realNow = Date.now;
  Date.now = () => realNow() + 21000;
  try { phones.sam.nearby.checkHostNow(); } finally { Date.now = realNow; }
  expect(storages.cara.readOfflineLeague(id).actingHost).toBeUndefined();
  await until(() => storages.sam.readOfflineLeague(id)?.actingHost);
  const acting = storages.sam.readOfflineLeague(id);
  expect(acting).toMatchObject({ nearbyHost: true, actingHost: true, originalHostId: 'guest-tyler' });
  expect(acting.league.activeBids).toEqual({});
  expect(acting.remote).toBeUndefined();

  // Cara's phone finds Sam's and keeps drafting; Sam can run commissioner tools as co-host.
  await until(() => storages.cara && phones.sam.nearby.isNearbyHostCopy(id) && air.phones.get('C').room === code);
  await phones.cara.axios.post(url('cara', 'bid'), { amount: 11 });
  expect(storages.sam.readOfflineLeague(id).league.activeBids['guest-cara']).toMatchObject({ amount: 11 });
  const paused = await phones.sam.axios.post(url('sam', 'pause'), {});
  expect(paused.status).toBe(200);
  await phones.sam.axios.post(url('sam', 'pause'), {});

  // The commissioner's phone comes back (the app restarts): it finds Sam hosting and asks for the draft back.
  const back = bootPhone(storages.host);
  back.nearby.connectTransport(air.transportFor('H2'));
  await back.nearby.startHosting(id, tyler);
  await until(() => storages.host.readOfflineLeague(id).league.activeBids?.['guest-cara']?.amount === 11);
  await until(() => storages.sam.readOfflineLeague(id).remote === true);
  expect(storages.sam.readOfflineLeague(id).actingHost).toBeUndefined();
  await until(() => air.phones.get('H2').role === 'host');

  // Everyone is back on the commissioner's phone.
  await wait(2500);
  await phones.sam.axios.post(url('sam', 'bid'), { amount: 13 });
  expect(storages.host.readOfflineLeague(id).league.activeBids['guest-sam']).toMatchObject({ amount: 13 });
});
