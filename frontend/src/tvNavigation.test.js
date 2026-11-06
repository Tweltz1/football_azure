import { pickNext } from './tvNavigation';

const box = (left, top, width = 100, height = 50) => ({ left, top, width, height, right: left + width, bottom: top + height });

test('moves to the box on the right in the same row', () => {
  const rects = [box(0, 200), box(300, 0), box(300, 200)];
  expect(pickNext(box(100, 0), [box(400, 0), box(200, 300)], 'right')).toBe(0);
  expect(pickNext(box(0, 0), rects, 'right')).toBe(1);
});

test('prefers the nearest box below in the same column', () => {
  const rects = [box(400, 100), box(0, 200), box(0, 400)];
  expect(pickNext(box(0, 0), rects, 'down')).toBe(1);
});

test('returns -1 when nothing is that way', () => {
  expect(pickNext(box(0, 0), [box(200, 0)], 'left')).toBe(-1);
});
