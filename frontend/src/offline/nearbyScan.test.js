// Like AirDrop: a phone lists the drafts hosted nearby and joins one by tapping it, with no code typed.
const { bootPhone, makeAir, phoneStorage } = require('./nearbyPhones.testutil');

jest.setTimeout(30000);

test('lists nearby hosted drafts and joins one from the list', async () => {
  const air = makeAir();
  const storages = { host: phoneStorage(), liz: phoneStorage() };
  const phones = Object.fromEntries(Object.entries(storages).map(([k, s]) => [k, bootPhone(s)]));
  phones.host.nearby.connectTransport(air.transportFor('Tyler'));
  phones.liz.nearby.connectTransport(air.transportFor('Liz'));

  const tyler = { userId: 'guest-tyler', userDetails: 'Tyler', guest: true };
  const id = await phones.host.offlineSync.createLeagueOnDevice({ name: 'Testingoff', draftTimers: { bidTimer: 30 } }, tyler);

  const liz = { userId: 'guest-liz', userDetails: 'Liz', guest: true };
  const seen = await new Promise((resolve) => {
    phones.liz.nearby.scanForDrafts(liz, (hosts) => { if (hosts.length) resolve(hosts); });
  });
  expect(seen).toEqual([expect.objectContaining({ name: 'Tyler', league: 'Testingoff', room: phones.host.nearby.roomFor(id) })]);

  const lobby = await phones.liz.nearby.findDraftByCode(seen[0].room, liz);
  expect(lobby).toMatchObject({ leagueName: 'Testingoff', canAdd: true });
  expect(await phones.liz.nearby.pickDraftTeam('new', liz)).toBe(id);
});
