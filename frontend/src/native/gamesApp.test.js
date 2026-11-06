import { homeHref, homeLabel, inGamesApp } from './gamesApp';

const setAgent = (ua) => Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });

describe('gamesApp', () => {
  const original = window.navigator.userAgent;
  afterEach(() => setAgent(original));

  it('sends back links to the front page on the website', () => {
    setAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15');
    expect(inGamesApp()).toBe(false);
    expect(homeHref()).toBe('/');
    expect(homeLabel()).toBe('Hood League');
  });

  it('sends back links to the games hub in the Hood Games app', () => {
    setAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 HoodGames');
    expect(inGamesApp()).toBe(true);
    expect(homeHref()).toBe('/hood-games');
    expect(homeLabel()).toBe('Hood Games');
  });
});
