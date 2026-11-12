import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import DeleteAccount from './DeleteAccount';
import { deleteAccount } from '../junk/junkApi';
import { supabase } from '../supabaseClient';

jest.mock('../junk/junkApi', () => ({ deleteAccount: jest.fn() }));
jest.mock('../supabaseClient', () => ({ supabase: { auth: { signOut: jest.fn(() => Promise.resolve()) } } }));

beforeEach(() => { supabase.auth.signOut.mockImplementation(() => Promise.resolve()); });

function render(props = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  act(() => { ReactDOM.render(<DeleteAccount {...props} />, el); });
  return el;
}
const button = (el, name) => Array.from(el.querySelectorAll('button')).find((b) => b.textContent.trim() === name);
const click = async (b) => { await act(async () => { b.click(); }); };

test('asks before deleting, then deletes the account and signs out', async () => {
  deleteAccount.mockResolvedValue({ deleted: true });
  const onDeleted = jest.fn();
  const el = render({ onDeleted });
  await click(button(el, 'Delete account'));
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(el.textContent).toContain("can't be undone");
  await click(button(el, 'Delete everything'));
  expect(deleteAccount).toHaveBeenCalledTimes(1);
  expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(onDeleted).toHaveBeenCalled();
});

test('cancel closes the box without deleting', async () => {
  const el = render();
  await click(button(el, 'Delete account'));
  await click(button(el, 'Cancel'));
  expect(deleteAccount).not.toHaveBeenCalled();
  expect(button(el, 'Delete account')).toBeTruthy();
});

test('shows the error and stays signed in when the server refuses', async () => {
  deleteAccount.mockRejectedValue(new Error('Server said no.'));
  const onDeleted = jest.fn();
  const el = render({ onDeleted });
  await click(button(el, 'Delete account'));
  await click(button(el, 'Delete everything'));
  expect(el.querySelector('[role="alert"]').textContent).toBe('Server said no.');
  expect(onDeleted).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
