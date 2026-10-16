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
