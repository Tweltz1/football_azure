import React, { useState } from 'react';
import { sendPasswordReset, signInWithEmail, signUpWithEmail } from '../AuthContext';

// Email + password sign-in and sign-up, next to "Login with Google". Works the same on the website and
// inside the iPhone apps (no browser hand-off needed).
const EmailSignIn = ({ disabled = false }) => {
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');

  const switchTo = (next) => {
    setMode(next);
    setMessage('');
    setNote('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    setNote('');
    if (!email.trim()) {
      setMessage('Enter your email.');
      return;
    }
    if (mode !== 'reset' && password.length < 8) {
      setMessage('Passwords are at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          setMessage(/confirm/i.test(error.message)
            ? 'Confirm your email first: open the link we sent you, then sign in.'
            : 'That email and password don\'t match. New here? Create an account. Used to sign in with GitHub? Tap "Forgot password" to set one.');
        }
        // Signed in: the page switches by itself.
      } else if (mode === 'signup') {
        const { data, error } = await signUpWithEmail(email, password, name);
        if (error) setMessage(error.message || 'Couldn\'t create the account.');
        else if (!data?.session) setNote(`Check ${email.trim()} for a link to confirm your email, then sign in here.`);
      } else {
        const { error } = await sendPasswordReset(email);
        if (error) setMessage(error.message || 'Couldn\'t send the email.');
        else setNote(`If ${email.trim()} has an account, a link to set a new password is on its way.`);
      }
    } catch (error) {
      setMessage(error?.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const label = { signin: 'Sign in with email', signup: 'Create account', reset: 'Send reset link' }[mode];

  return (
    <form className="email-signin" onSubmit={submit}>
      {mode === 'signup' && (
        <label>
          Name
          <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="What your league sees" />
        </label>
      )}
      <label>
        Email
        <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {mode !== 'reset' && (
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {message && <p className="email-signin-message" role="alert">{message}</p>}
      {note && <p className="email-signin-note">{note}</p>}
      <button type="submit" className="edit-roster-button" disabled={busy || disabled}>{busy ? 'One moment...' : label}</button>
      <p className="email-signin-switch">
        {mode === 'signin' && (
          <>
            <button type="button" onClick={() => switchTo('signup')}>Create an account</button>
            {' · '}
            <button type="button" onClick={() => switchTo('reset')}>Forgot password</button>
          </>
        )}
        {mode !== 'signin' && <button type="button" onClick={() => switchTo('signin')}>Back to sign in</button>}
      </p>
    </form>
  );
};

export default EmailSignIn;
