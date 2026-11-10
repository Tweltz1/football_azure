import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import PostPreview from './PostPreview';

const base = { title: 'Wood dresser', description: 'Small scratch', category: 'furniture', condition: 'good', tags: [], pickup: 'On the curb', spot: '12 Elm St', handoff: 'porch', firstCome: false, aiDetected: true };
const photo = { key: 'a', preview: 'data:image/png;base64,x', path: 'p/a.jpg' };

function render(item, props = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  act(() => { ReactDOM.render(<PostPreview item={item} onEdit={() => {}} onPost={() => {}} {...props} />, el); });
  return el;
}

test('shows the listing without the exact spot', () => {
  const el = render({ ...base, photos: [photo], pieces: [] });
  expect(el.textContent).toContain('Wood dresser');
  expect(el.textContent).toContain('Furniture');
  expect(el.textContent).toContain('On the curb');
  expect(el.textContent).not.toContain('12 Elm St');
  expect(el.textContent).toContain('Post it');
});

test('lists each thing in a multi-item post', () => {
  const pieces = [{ key: '1', title: 'Chair', category: 'furniture', box: null, photo: 0 }, { key: '2', title: 'Lamp', category: 'home', box: null, photo: 0 }];
  const el = render({ ...base, title: 'Chair and lamp', photos: [], pieces });
  expect(el.textContent).toContain('Lamp');
  expect(el.textContent).toContain('Post 2 things');
});
