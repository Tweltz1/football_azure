import { clearReads, loadRead, readKey, saveRead } from './readCache';

test('keeps reads, not writes, and clears them on sign-out', () => {
  expect(readKey('get', 'GetLeagues', 'userId=u1')).toBe('hl-read:get GetLeagues?userId=u1');
  expect(readKey('post', 'user-profile', '')).toBe('hl-read:post user-profile');
  expect(readKey('post', 'leagues/abc/bid', '')).toBeNull();

  const key = readKey('get', 'GetLeagues', 'userId=u1');
  saveRead(key, [{ id: 'abc' }]);
  expect(loadRead(key).data).toEqual([{ id: 'abc' }]);
  clearReads();
  expect(loadRead(key)).toBeNull();
});

test('makes room by dropping the oldest saved pages when storage is full', () => {
  clearReads();
  saveRead('hl-read:get a', 'old');
  const realSet = Storage.prototype.setItem;
  let calls = 0;
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function set(key, value) {
    calls += 1;
    if (calls === 1) throw new Error('QuotaExceededError');
    return realSet.call(this, key, value);
  });
  saveRead('hl-read:get b', 'new');
  spy.mockRestore();
  expect(loadRead('hl-read:get a')).toBeNull();
  expect(loadRead('hl-read:get b').data).toBe('new');
});
