import { easterSunday, season, thanksgivingDay, themeForDate, THEMES } from './season';
import { THEME_SETS } from './themes/index';
import { pickQuestions } from './quizQuestions';
import { categoriesFor } from './maskWords';
import { promptsFor } from './mashPrompts';

const on = (y, m, d) => themeForDate(new Date(y, m - 1, d));

test('holiday windows by date', () => {
  expect(on(2027, 1, 1)).toBe('newyear');
  expect(on(2027, 1, 10)).toBe('newyear');
  expect(on(2027, 1, 11)).toBe('classic');
  expect(on(2027, 2, 1)).toBe('valentines');
  expect(on(2027, 2, 14)).toBe('valentines');
  expect(on(2027, 2, 15)).toBe('classic');
  expect(on(2027, 3, 17)).toBe('stpatricks');
  expect(on(2027, 3, 18)).toBe('easter'); // Easter 2027 is March 28
  expect(on(2027, 3, 29)).toBe('easter'); // Easter Monday
  expect(on(2027, 3, 30)).toBe('classic');
  expect(on(2026, 4, 5)).toBe('easter'); // Easter 2026
  expect(on(2026, 3, 22)).toBe('classic'); // 2026 Easter window starts March 23
  expect(on(2026, 3, 23)).toBe('easter');
  expect(on(2027, 6, 19)).toBe('classic');
  expect(on(2027, 7, 4)).toBe('july4');
  expect(on(2027, 7, 7)).toBe('classic');
  expect(on(2027, 9, 30)).toBe('classic');
  expect(on(2027, 10, 31)).toBe('spooky');
  expect(on(2026, 11, 18)).toBe('thanksgiving');
  expect(on(2026, 11, 29)).toBe('thanksgiving'); // Sunday after Thanksgiving (Nov 26)
  expect(on(2026, 11, 30)).toBe('christmas');
  expect(on(2026, 12, 26)).toBe('christmas');
  expect(on(2026, 12, 27)).toBe('newyear');
});

test('calendar helpers', () => {
  expect(thanksgivingDay(2026)).toBe(26);
  expect(thanksgivingDay(2027)).toBe(25);
  expect(thanksgivingDay(2029)).toBe(22);
  const e = (y) => { const d = easterSunday(y); return `${d.getMonth() + 1}/${d.getDate()}`; };
  expect(e(2026)).toBe('4/5');
  expect(e(2027)).toBe('3/28');
  expect(e(2028)).toBe('4/16');
  expect(e(2038)).toBe('4/25');
});

test('?theme= override and aliases', () => {
  window.history.pushState({}, '', '/party?theme=holiday');
  expect(season()).toBe('christmas');
  window.history.pushState({}, '', '/party?theme=easter');
  expect(season()).toBe('easter');
  window.history.pushState({}, '', '/party?theme=bogus');
  expect(THEMES[season()]).toBeTruthy();
  window.history.pushState({}, '', '/party');
});

test('every theme has labels and full content', () => {
  Object.keys(THEMES).forEach((id) => {
    const t = THEMES[id];
    expect(t.quiz.title && t.quiz.welcome && t.mash.title && t.party).toBeTruthy();
    if (id === 'spooky') return;
    const set = THEME_SETS[id];
    expect(set).toBeTruthy();
    expect(set.levels).toHaveLength(4);
    set.levels.forEach((level) => {
      expect(level.length).toBeGreaterThanOrEqual(5);
      level.forEach((row) => {
        expect(row).toHaveLength(5);
        expect(new Set(row.slice(1)).size).toBe(4); // no duplicate answers
      });
    });
    expect(set.categories.length).toBeGreaterThanOrEqual(8);
    set.categories.forEach((c) => {
      expect(c.groups).toHaveLength(2);
      c.groups.forEach((g) => expect(g).toHaveLength(4));
      expect(new Set(c.groups.flat()).size).toBe(8);
    });
    expect(set.prompts.length).toBeGreaterThanOrEqual(12);
    expect(set.finals.length).toBeGreaterThanOrEqual(4);
    // The games deal from it.
    let r = 0.123;
    const rand = () => { r = (r * 9301 + 49297) % 233280 / 233280; return r; };
    expect(pickQuestions(rand, 12, [], id)).toHaveLength(12);
    expect(categoriesFor(id)).toBe(set.categories);
    expect(promptsFor(id).prompts).toBe(set.prompts);
  });
});
