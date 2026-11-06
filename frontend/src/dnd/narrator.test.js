import { narrate, variety, _forgetRecent } from './narrator';
import { SETTING_IDS } from './settings';

const ctx = (setting, seed = 7) => ({
  seed, setting,
  quest: { patron: 'a talking raven', goal: 'rescue a missing apprentice', villain: 'Vexa the Pale, a necromancer', reward: '200 gold', contact: 'Mira Ashby', weather: 'thick fog' },
  party: [{ name: 'Pip', cls: 'Rogue' }, { name: 'Grog', cls: 'Barbarian' }],
  foes: [{ name: 'Skeleton' }],
});
const KINDS = ['start', 'scene', 'combat', 'victory', 'loot', 'mimic', 'down', 'crit', 'exit', 'boss', 'action', 'check', 'complete', 'recap', 'mystery'];

test('every moment in every setting reads as clean text', () => {
  SETTING_IDS.forEach((setting) => KINDS.forEach((kind) => {
    for (let n = 0; n < 15; n += 1) {
      const text = narrate({ kind, detail: kind === 'check' ? 'Perception check (DC 12): 1 of 2 passed.' : '' }, ctx(setting), n);
      expect(text.length).toBeGreaterThan(8);
      expect(text).not.toMatch(/#|undefined|null|\s[.,!?]|\.\./);
      expect(text.charAt(0)).toBe(text.charAt(0).toUpperCase());
    }
  }));
});

test('scenes have thousands of combinations and rarely repeat', () => {
  SETTING_IDS.forEach((setting) => expect(variety('scene', setting)).toBeGreaterThan(5000));
  expect(variety('combat')).toBeGreaterThan(1000);
  _forgetRecent();
  const lines = new Set();
  for (let n = 0; n < 200; n += 1) lines.add(narrate({ kind: 'scene' }, ctx('crypt', n), n));
  expect(lines.size).toBeGreaterThan(190);
});

test('engine details show up where they matter', () => {
  expect(narrate({ kind: 'loot', detail: 'Pip finds a ruby and 12 gold' }, ctx('cave'), 1)).toMatch('Pip finds a ruby');
  expect(narrate({ kind: 'combat', detail: 'Ghoul and Zombie' }, ctx('crypt'), 1)).toMatch(/ghoul and zombie/i);
  expect(narrate({ kind: 'boss' }, ctx('castle'), 2)).toMatch('Vexa the Pale');
});
