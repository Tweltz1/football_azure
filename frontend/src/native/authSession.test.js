import { readCallback } from './authSession';

test('reads tokens from the address sign-in returns to', () => {
  expect(readCallback('com.hoodleague.draft://auth#access_token=a&refresh_token=r&expires_in=3600')).toEqual({
    accessToken: 'a', refreshToken: 'r', code: null, error: null,
  });
  expect(readCallback('com.hoodleague.draft://auth?code=c').code).toBe('c');
  expect(readCallback('com.hoodleague.draft://auth?error=access_denied&error_description=Denied').error).toBe('Denied');
});
