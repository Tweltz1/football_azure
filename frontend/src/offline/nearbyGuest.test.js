// A draft with no setup and no accounts: the commissioner makes a league on their phone, guests join with
// the room code, a player whose phone died rejoins as their team from another phone, and the commissioner
// bids for a team that isn't connected.
const { bootPhone, makeAir, phoneStorage } = require('./nearbyPhones.testutil');

jest.setTimeout(30000);

test('guest draft: make on phone, join by code, rejoin as my team, commissioner bids for an absent team', async () => {
  const air = makeAir();
  const storages = { host: phoneStorage(), sam: phoneStorage(), borrowed: phoneStorage(), cara: phoneStorage() };
  const phones = Object.fromEntries(Object.entries(storages).map(([k, s]) => [k, bootPhone(s)]));
  phones.host.nearby.connectTransport(air.transportFor('H'));
  phones.sam.nearby.connectTransport(air.transportFor('S'));
  phones.borrowed.nearby.connectTransport(air.transportFor('B'));
  phones.cara.nearby.connectTransport(air.transportFor('C'));

  const tyler = { userId: 'guest-tyler', userDetails: 'Tyler', guest: true };
  const id = await phones.host.offlineSync.createLeagueOnDevice({ name: 'Garage', draftTimers: { bidTimer: 30 } }, tyler);
  const hostEntry = () => storages.host.readOfflineLeague(id);
  expect(hostEntry()).toMatchObject({ createdOffline: true, nearbyHost: true, userId: 'guest-tyler' });
  expect(hostEntry().league.initialPlayerPool.length).toBeGreaterThan(100);
  const code = phones.host.nearby.roomFor(id);

  // Sam joins with the code as a new team.
  const sam = { userId: 'guest-sam', userDetails: 'Sam', guest: true };
  await expect(phones.sam.nearby.findDraftByCode('12', sam)).rejects.toThrow('4-digit');
  const lobby = await phones.sam.nearby.findDraftByCode(code, sam);
  expect(lobby).toMatchObject({ leagueName: 'Garage', canAdd: true, mine: null });
  expect(lobby.teams.every((t) => !t.open)).toBe(true); // only the commissioner's team, which is connected
  expect(await phones.sam.nearby.pickDraftTeam('new', sam)).toBe(id);
  const samTeam = hostEntry().league.teams.find((t) => t.ownerId === 'guest-sam');
  expect(samTeam.name).toBe("Sam's Team");
  expect(storages.sam.readOfflineLeague(id)).toMatchObject({ remote: true, userId: 'guest-sam' });

  // Cara joins too.
  const cara = { userId: 'guest-cara', userDetails: 'Cara', guest: true };
  await phones.cara.nearby.findDraftByCode(code, cara);
  await phones.cara.nearby.pickDraftTeam('new', cara);

  // Sam's phone dies. On a borrowed phone, Sam's team shows as open and Sam takes it back.
  air.powerOff('S');
  const sam2 = { userId: 'guest-sam-2', userDetails: 'Sam', guest: true };
  const lobby2 = await phones.borrowed.nearby.findDraftByCode(code, sam2);
  expect(lobby2.teams.filter((t) => t.open).map((t) => t.name)).toEqual(["Sam's Team"]); // Cara is connected
  await phones.borrowed.nearby.pickDraftTeam(samTeam.id, sam2);
  expect(hostEntry().league.teams.find((t) => t.id === samTeam.id).ownerId).toBe('guest-sam-2');
  expect(hostEntry().league.members).not.toContain('guest-sam');

  // The draft runs; Cara's phone drops and the commissioner bids $7 for her team.
  const hostUrl = (path) => `${phones.host.api.API_BASE_URL}/leagues/${id}/${path}`;
  for (const [phone, u] of [['borrowed', sam2], ['cara', cara]]) {
    await phones[phone].axios.post(hostUrl('ready'), { isReady: true, ready: true });
    expect(storages[phone].readOfflineLeague(id).userId).toBe(u.userId);
  }
  await phones.host.axios.post(hostUrl('startDraft'), {});
  air.powerOff('C');
  await new Promise((resolve) => setTimeout(resolve, 20));
  await phones.host.nearby.bidForTeam(id, 'guest-cara', 7);
  expect(hostEntry().league.activeBids['guest-cara']).toMatchObject({ amount: 7 });
  await expect(phones.host.nearby.bidForTeam(id, 'guest-cara', 9999)).rejects.toThrow();
});
