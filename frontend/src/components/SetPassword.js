import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

// Shown after someone opens a "reset your password" email: they're signed in by the link, so all that's
// left is choosing the new password.
const SetPassword = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setMessage('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(error.message || 'Couldn\'t save that password.');
    else setSaved(true);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="set-password-title">
      <form className="modal-content email-signin" onSubmit={save}>
        <h2 id="set-password-title">{saved ? 'Password saved' : 'Choose a new password'}</h2>
        {saved ? (
          <>
            <p>From now on you can sign in with your email and this password, on the website and in the apps.</p>
            <button type="button" onClick={onDone}>Done</button>
          </>
        ) : (
          <>
            <label>
              New password
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            {message && <p className="email-signin-message" role="alert">{message}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save password'}</button>
            <button type="button" className="edit-roster-button" onClick={onDone} disabled={busy}>Not now</button>
          </>
        )}
      </form>
    </div>
  );
};

export default SetPassword;
